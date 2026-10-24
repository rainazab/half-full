import { z } from "zod";
import type { ApprovedStory, CandidateStory, RejectedStory } from "./types";
import { contextualMedia } from "./media";
import { experienceSchema, attachExperience } from "./experience";
import { evidencePassages } from "./evidence";

const reference = z
  .object({ sourceId: z.string(), passageId: z.string().min(1).max(20) })
  .strict();
const refs = z.array(reference).max(5);
const shortText = z.string().trim().min(1).max(2000);
export const editorialResponseSchema = z
  .object({
    decisions: z
      .array(
        z
          .object({
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
            evidence: refs,
            contentEvidence: z
              .object({
                headline: refs,
                summary: refs,
                whyItMatters: refs,
                action: refs,
              })
              .strict(),
            sourceAssessments: z
              .array(
                z
                  .object({
                    sourceId: z.string(),
                    kind: z.enum(["primary", "reporting", "unknown"]),
                    independenceGroup: z.string().min(1).max(100),
                    explanation: shortText,
                  })
                  .strict(),
              )
              .max(5),
            conflictingSourceIds: z.array(z.string()).max(5),
            contradictionReason: z.string().max(2000),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const editorialGenerationSchema = z
  .object({
    decisions: z
      .array(
        editorialResponseSchema.shape.decisions.element.extend({
          experience: experienceSchema.nullable(),
        }),
      )
      .max(20),
  })
  .strict();

export type EditorialResponse = z.infer<typeof editorialResponseSchema>;

export class EditorialValidationError extends Error {}

function parseDecisions(raw: unknown, candidates: CandidateStory[]) {
  const clean =
    raw &&
    typeof raw === "object" &&
    "decisions" in raw &&
    Array.isArray(raw.decisions)
      ? {
          ...raw,
          decisions: raw.decisions.map((value: unknown) => {
            if (!value || typeof value !== "object") return value;
            const { experience: _optional, ...rest } = value as Record<
              string,
              unknown
            >;
            return rest;
          }),
        }
      : raw;
  const result = editorialResponseSchema.safeParse(clean);
  if (!result.success)
    throw new EditorialValidationError(
      "The editor's JSON violated the required fields, types, or score/length limits.",
    );
  const parsed = result.data;
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const covered = new Set<string>();
  for (const decision of parsed.decisions) {
    if (!byId.has(decision.candidateId))
      throw new EditorialValidationError(
        "The editor returned an unknown candidate ID.",
      );
    if (covered.has(decision.candidateId))
      throw new EditorialValidationError(
        "The editor returned duplicate decisions.",
      );
    covered.add(decision.candidateId);
  }
  if (covered.size !== candidates.length)
    throw new EditorialValidationError(
      "The editor did not evaluate every candidate.",
    );
  return parsed;
}

function validateDecision(
  decision: EditorialResponse["decisions"][number],
  byId: Map<string, CandidateStory>,
) {
  if (new Set(decision.sourceIds).size !== decision.sourceIds.length)
    throw new EditorialValidationError(
      "The editor returned duplicate source IDs.",
    );
  for (const id of decision.sourceIds) {
    if (!byId.has(id))
      throw new EditorialValidationError(
        "The editor referenced a source outside the Apify candidates.",
      );
  }
  for (const evidence of [
    ...decision.evidence,
    ...Object.values(decision.contentEvidence).flat(),
  ]) {
    const source = byId.get(evidence.sourceId);
    if (!source || !decision.sourceIds.includes(evidence.sourceId))
      throw new EditorialValidationError(
        "The editor evidence references an unlisted source.",
      );
    if (
      !evidencePassages(source.text).some(
        (passage) => passage.id === evidence.passageId,
      )
    ) {
      throw new EditorialValidationError(
        "The editor referenced an evidence passage absent from the retrieved article text.",
      );
    }
  }
  for (const id of decision.conflictingSourceIds) {
    if (!byId.has(id))
      throw new EditorialValidationError(
        "The editor referenced an unknown conflicting source.",
      );
  }
  const assessmentIds = decision.sourceAssessments.map(
    (source) => source.sourceId,
  );
  if (
    new Set(assessmentIds).size !== assessmentIds.length ||
    assessmentIds.some((id) => !decision.sourceIds.includes(id))
  ) {
    throw new EditorialValidationError(
      "Source assessments must uniquely reference listed sources.",
    );
  }
  if (
    decision.verificationStatus === "verified" &&
    (decision.sourceIds.some((id) => !assessmentIds.includes(id)) ||
      Object.values(decision.contentEvidence).some(
        (references) => references.length === 0,
      ) ||
      decision.sourceIds.some(
        (id) =>
          ![
            ...decision.evidence,
            ...Object.values(decision.contentEvidence).flat(),
          ].some((ref) => ref.sourceId === id),
      ))
  ) {
    throw new EditorialValidationError(
      "Approved copy requires evidence references for every field and assessments of every source.",
    );
  }
  // URLs in generated prose could smuggle in invented sources or actions.
  const prose = [
    decision.centralClaim,
    decision.reason,
    decision.headline,
    decision.summary,
    decision.whyItMatters,
    decision.action,
    decision.category,
    decision.contradictionReason,
    ...decision.sourceAssessments.map((source) => source.explanation),
  ].join(" ");
  if (/(?:https?:\/\/|www\.)/i.test(prose))
    throw new EditorialValidationError(
      "The editor must reference source IDs, not generate URLs.",
    );
  if (
    decision.verificationStatus === "verified" &&
    [
      decision.headline,
      decision.summary,
      decision.whyItMatters,
      decision.action,
      decision.category,
    ].some((value) => !value.trim())
  )
    throw new EditorialValidationError(
      "The editor omitted required approved-story copy.",
    );
}

/** Strict helper for callers that require every decision to be valid. */
export function validateEditorialResponse(
  raw: unknown,
  candidates: CandidateStory[],
) {
  const parsed = parseDecisions(raw, candidates);
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const decision of parsed.decisions) validateDecision(decision, byId);
  return parsed;
}

export function assembleEditorialResult(
  raw: unknown,
  candidates: CandidateStory[],
  now = new Date(),
  supportingSources: CandidateStory[] = [],
) {
  const response = parseDecisions(raw, candidates);
  const allSources = [
    ...supportingSources.filter((s) => !candidates.some((c) => c.id === s.id)),
    ...candidates,
  ];
  const byId = new Map(
    allSources.map((candidate) => [candidate.id, candidate]),
  );
  const stories: ApprovedStory[] = [];
  const rejectedStories: RejectedStory[] = [];
  for (const decision of response.decisions) {
    const candidate = byId.get(decision.candidateId)!;
    try {
      validateDecision(decision, byId);
    } catch (error) {
      if (!(error instanceof EditorialValidationError)) throw error;
      rejectedStories.push({
        title: candidate.title,
        url: candidate.url,
        reason: `Editorial validation failed: ${error.message}`,
        confidence: 0,
        verificationStatus: "uncertain",
      });
      continue;
    }
    let reason = decision.reason;
    let status: "uncertain" | "rejected" =
      decision.verificationStatus === "uncertain" ? "uncertain" : "rejected";
    let eligible = decision.verificationStatus === "verified";
    if (
      eligible &&
      (!decision.adequatelySupported ||
        decision.confidence < 0.8 ||
        decision.hypeScore > 0.5 ||
        decision.sensationalized)
    ) {
      eligible = false;
      status = "uncertain";
      reason = `Server verification threshold not met. ${reason}`;
    }
    if (
      eligible &&
      (candidate.text.length < 300 ||
        !decision.sourceIds.includes(candidate.id) ||
        !decision.evidence.some(
          (evidence) => evidence.sourceId === candidate.id,
        ))
    ) {
      eligible = false;
      status = "uncertain";
      reason =
        "Insufficient retrieved article text or no supporting evidence passage from this article.";
    }
    if (
      eligible &&
      (decision.conflictingSourceIds.length ||
        decision.contradictionReason.trim())
    ) {
      eligible = false;
      status = "uncertain";
      reason = `Unresolved disagreement in the retrieved evidence. ${decision.contradictionReason}`;
    }
    if (eligible && !candidate.publishedAt) {
      eligible = false;
      status = "uncertain";
      reason =
        "A reliable publication date was unavailable; this article cannot be established as current news.";
    }
    if (eligible && candidate.publishedAt) {
      const age = now.getTime() - Date.parse(candidate.publishedAt);
      if (!Number.isFinite(age) || age > 7 * 86400000 || age < -300000) {
        eligible = false;
        reason =
          "Publication date is outside the current seven-day news window or is in the future.";
      }
    }
    if (eligible && stories.length >= 5) {
      eligible = false;
      reason =
        "Not selected: the finite edition already contains five approved stories.";
    }
    if (!eligible) {
      rejectedStories.push({
        title: candidate.title,
        url: candidate.url,
        reason,
        confidence: decision.confidence,
        verificationStatus: status,
        centralClaim: decision.centralClaim,
      });
      continue;
    }
    const evidenceRecord = (ref: { sourceId: string; passageId: string }) => {
      const source = byId.get(ref.sourceId)!;
      return {
        ...ref,
        url: source.url,
        publisher: source.source,
        excerpt: evidencePassages(source.text).find(
          (passage) => passage.id === ref.passageId,
        )!.text,
      };
    };
    // Publishers and syndicated reporting groups both bound independent corroboration.
    const publisherCount = new Set(
      decision.sourceIds.map((id) => byId.get(id)!.source.toLowerCase()),
    ).size;
    const groupCount = new Set(
      decision.sourceAssessments.map((source) =>
        source.independenceGroup.toLowerCase(),
      ),
    ).size;
    const independentCount = Math.min(publisherCount, groupCount);
    const cap =
      independentCount < 2
        ? 0.85
        : decision.sourceAssessments.some((source) => source.kind === "primary")
          ? 0.95
          : 0.9;
    const allReferences = [
      ...decision.evidence,
      ...Object.values(decision.contentEvidence).flat(),
    ];
    const uniqueReferences = [
      ...new Map(
        allReferences.map((ref) => [`${ref.sourceId}/${ref.passageId}`, ref]),
      ).values(),
    ];
    stories.push({
      media: [
        ...contextualMedia(decision.headline),
        ...(candidate.media ?? []),
      ].slice(0, 3),
      id: candidate.id,
      headline: decision.headline,
      centralClaim: decision.centralClaim,
      summary: decision.summary,
      whyItMatters: decision.whyItMatters,
      action: decision.action,
      category: decision.category,
      verificationStatus: "verified",
      confidence: Math.min(decision.confidence, cap),
      hypeScore: decision.hypeScore,
      verificationReason: decision.reason,
      evidence: uniqueReferences.map(evidenceRecord),
      contentSupport: [
        {
          field: "centralClaim",
          text: decision.centralClaim,
          evidence: decision.evidence.map(evidenceRecord),
        },
        ...(["headline", "summary", "whyItMatters", "action"] as const).map(
          (field) => ({
            field,
            text: decision[field],
            evidence: decision.contentEvidence[field].map(evidenceRecord),
          }),
        ),
      ],
      sourceAssessments: decision.sourceAssessments,
      limitations: [
        "The editor evaluated only the material retrieved for this run. Source classification and relevance are model judgments, not independent fact-checking.",
        independentCount < 2
          ? "No independent corroboration was established from the supplied sources. Confidence is capped at 85%."
          : "Syndicated reports and same-publisher sources are not counted as independent corroboration.",
        ...(!decision.sourceAssessments.some(
          (source) => source.kind === "primary",
        )
          ? [
              "No primary source was identified in the retrieved evidence; this story relies on attributed reporting.",
            ]
          : []),
      ],
      // All source metadata comes from Apify; the editor can only select existing IDs.
      sources: decision.sourceIds.map((id) => {
        const source = byId.get(id)!;
        return {
          id: source.id,
          title: source.title,
          url: source.url,
          publisher: source.source,
          publishedAt: source.publishedAt,
          provenance: source.provenance,
        };
      }),
    });
  }
  const extras =
    raw &&
    typeof raw === "object" &&
    "decisions" in raw &&
    Array.isArray(raw.decisions)
      ? raw.decisions
      : [];
  for (const story of stories) {
    const extra = extras.find(
      (d: { candidateId?: string }) => d?.candidateId === story.id,
    );
    if (extra?.experience)
      attachExperience(story, extra.experience, allSources);
  }
  return { stories, rejectedStories };
}
