import { z } from "zod";
import type { ApprovedStory, CandidateStory, RejectedStory } from "./types";

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
      quote: z.string().min(20).max(1500),
    }).strict()).max(5),
  }).strict()).max(20),
}).strict();

export type EditorialResponse = z.infer<typeof editorialResponseSchema>;

const comparable = (text: string) => text.replace(/\s+/g, " ").trim();

/** Fail closed on incomplete decisions, invented sources, or invented evidence. */
export function validateClaudeResponse(raw: unknown, candidates: CandidateStory[]) {
  const parsed = editorialResponseSchema.parse(raw);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const covered = new Set<string>();
  for (const decision of parsed.decisions) {
    if (!byId.has(decision.candidateId)) throw new Error("Claude returned an unknown candidate ID.");
    if (covered.has(decision.candidateId)) throw new Error("Claude returned duplicate decisions.");
    covered.add(decision.candidateId);
    if (new Set(decision.sourceIds).size !== decision.sourceIds.length) throw new Error("Claude returned duplicate source IDs.");
    for (const id of decision.sourceIds) {
      if (!byId.has(id)) throw new Error("Claude referenced a source outside the Apify candidates.");
    }
    for (const evidence of decision.evidence) {
      const source = byId.get(evidence.sourceId);
      if (!source || !decision.sourceIds.includes(evidence.sourceId)) throw new Error("Claude evidence references an unlisted source.");
      if (!comparable(source.text).includes(comparable(evidence.quote))) {
        throw new Error("Claude returned an evidence quote absent from the retrieved article text.");
      }
    }
    // URLs in generated prose could smuggle in invented sources or actions.
    const prose = [decision.centralClaim, decision.reason, decision.headline, decision.summary,
      decision.whyItMatters, decision.action, decision.category].join(" ");
    if (/(?:https?:\/\/|www\.)/i.test(prose)) throw new Error("Claude must reference source IDs, not generate URLs.");
  }
  if (covered.size !== candidates.length) throw new Error("Claude did not evaluate every candidate.");
  return parsed;
}

export function assembleEditorialResult(raw: unknown, candidates: CandidateStory[], now = new Date()) {
  const response = validateClaudeResponse(raw, candidates);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const stories: ApprovedStory[] = [];
  const rejectedStories: RejectedStory[] = [];
  for (const decision of response.decisions) {
    const candidate = byId.get(decision.candidateId)!;
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
      reason = "Insufficient retrieved article text or no supporting evidence quote from this article.";
    }
    if (eligible && candidate.publishedAt) {
      const age = now.getTime() - Date.parse(candidate.publishedAt);
      if (age > 7 * 86400000 || age < -86400000) {
        eligible = false;
        reason = "Publication date is outside the current seven-day news window or is in the future.";
      }
    }
    if (eligible && [decision.headline, decision.summary, decision.whyItMatters, decision.action, decision.category]
      .some((value) => !value.trim())) throw new Error("Claude omitted required approved-story copy.");
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
      // All source metadata comes from Apify; Claude can only select existing IDs.
      sources: decision.sourceIds.map((id) => {
        const source = byId.get(id)!;
        return { title: source.title, url: source.url, publisher: source.source, publishedAt: source.publishedAt };
      }),
    });
  }
  return { stories, rejectedStories };
}
