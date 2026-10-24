import { z } from "zod";
import type { ApprovedStory, CandidateStory, RejectedStory } from "./types";
import { evidencePassages } from "./evidence";

const shortText = z.string().trim().min(1).max(2000);
export const editorialResponseSchema = z.object({
  decisions: z.array(z.object({
    candidateId: z.string().min(1),
    verificationStatus: z.enum(["verified", "uncertain", "rejected"]),
    centralClaim: shortText,
    adequatelySupported: z.boolean(),
    sensationalized: z.boolean(),
    confidence: z.number().min(0).max(1),
    hypeScore: z.number().min(0).max(1),
    reason: shortText,
    headline: z.string().max(300),
    summary: z.string().max(1200),
    whyItMatters: z.string().max(1000),
    action: z.string().max(700),
    category: z.string().max(100),
    sourceIds: z.array(z.string()).max(5),
    evidence: z.array(z.object({
      sourceId: z.string(),
      passageId: z.string().min(1).max(20),
    }).strict()).max(5),
  }).strict()).max(20),
}).strict();

export type EditorialResponse = z.infer<typeof editorialResponseSchema>;

export class EditorialValidationError extends Error {}

function parseDecisions(raw: unknown, candidates: CandidateStory[]) {
  const result = editorialResponseSchema.safeParse(raw);
  if (!result.success) throw new EditorialValidationError("The editor's JSON violated the required fields, types, or score/length limits.");
  const parsed = result.data;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const covered = new Set<string>();
  for (const decision of parsed.decisions) {
    if (!byId.has(decision.candidateId)) throw new EditorialValidationError("The editor returned an unknown candidate ID.");
    if (covered.has(decision.candidateId)) throw new EditorialValidationError("The editor returned duplicate decisions.");
    covered.add(decision.candidateId);
  }
  if (covered.size !== candidates.length) throw new EditorialValidationError("The editor did not evaluate every candidate.");
  return parsed;
}

function validateDecision(decision: EditorialResponse["decisions"][number], byId: Map<string, CandidateStory>) {
    if (new Set(decision.sourceIds).size !== decision.sourceIds.length) throw new EditorialValidationError("The editor returned duplicate source IDs.");
    for (const id of decision.sourceIds) {
      if (!byId.has(id)) throw new EditorialValidationError("The editor referenced a source outside the Apify candidates.");
    }
    for (const evidence of decision.evidence) {
      const source = byId.get(evidence.sourceId);
      if (!source || !decision.sourceIds.includes(evidence.sourceId)) throw new EditorialValidationError("The editor evidence references an unlisted source.");
      if (!evidencePassages(source.text).some((passage) => passage.id === evidence.passageId)) {
        throw new EditorialValidationError("The editor referenced an evidence passage absent from the retrieved article text.");
      }
    }
    // URLs in generated prose could smuggle in invented sources or actions.
    const prose = [decision.centralClaim, decision.reason, decision.headline, decision.summary,
      decision.whyItMatters, decision.action, decision.category].join(" ");
    if (/(?:https?:\/\/|www\.)/i.test(prose)) throw new EditorialValidationError("The editor must reference source IDs, not generate URLs.");
    if (decision.verificationStatus === "verified" && [decision.headline, decision.summary, decision.whyItMatters, decision.action, decision.category]
      .some((value) => !value.trim())) throw new EditorialValidationError("The editor omitted required approved-story copy.");
}

/** Strict helper for callers that require every decision to be valid. */
export function validateEditorialResponse(raw: unknown, candidates: CandidateStory[]) {
  const parsed = parseDecisions(raw, candidates);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const decision of parsed.decisions) validateDecision(decision, byId);
  return parsed;
}

export function assembleEditorialResult(raw: unknown, candidates: CandidateStory[], now = new Date()) {
  const response = parseDecisions(raw, candidates);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const stories: ApprovedStory[] = [];
  const rejectedStories: RejectedStory[] = [];
  for (const decision of response.decisions) {
    const candidate = byId.get(decision.candidateId)!;
    try { validateDecision(decision, byId); }
    catch (error) {
      if (!(error instanceof EditorialValidationError)) throw error;
      rejectedStories.push({ title: candidate.title, url: candidate.url, reason: `Editorial validation failed: ${error.message}`,
        confidence: 0, verificationStatus: "uncertain" });
      continue;
    }
    let reason = decision.reason;
    let status: "uncertain" | "rejected" = decision.verificationStatus === "uncertain" ? "uncertain" : "rejected";
    let eligible = decision.verificationStatus === "verified";
    if (eligible && (!decision.adequatelySupported || decision.confidence < 0.8 ||
      decision.hypeScore > 0.5 || decision.sensationalized)) {
      eligible = false;
      status = "uncertain";
      reason = `Server verification threshold not met. ${reason}`;
    }
    if (eligible && (candidate.text.length < 300 || !decision.sourceIds.includes(candidate.id) ||
      !decision.evidence.some((evidence) => evidence.sourceId === candidate.id))) {
      eligible = false;
      status = "uncertain";
      reason = "Insufficient retrieved article text or no supporting evidence passage from this article.";
    }
    if (eligible && candidate.publishedAt) {
      const age = now.getTime() - Date.parse(candidate.publishedAt);
      if (age > 7 * 86400000 || age < -86400000) {
        eligible = false;
        reason = "Publication date is outside the current seven-day news window or is in the future.";
      }
    }
    if (eligible && stories.length >= 5) {
      eligible = false;
      reason = "Not selected: the finite edition already contains five approved stories.";
    }
    if (!eligible) {
      rejectedStories.push({ title: candidate.title, url: candidate.url, reason,
        confidence: decision.confidence, verificationStatus: status, centralClaim: decision.centralClaim });
      continue;
    }
    stories.push({
      id: candidate.id, headline: decision.headline, centralClaim: decision.centralClaim,
      summary: decision.summary, whyItMatters: decision.whyItMatters, action: decision.action,
      category: decision.category, verificationStatus: "verified", confidence: decision.confidence,
      hypeScore: decision.hypeScore, verificationReason: decision.reason,
      // All source metadata comes from Apify; the editor can only select existing IDs.
      sources: decision.sourceIds.map((id) => {
        const source = byId.get(id)!;
        return { title: source.title, url: source.url, publisher: source.source, publishedAt: source.publishedAt };
      }),
    });
  }
  return { stories, rejectedStories };
}
