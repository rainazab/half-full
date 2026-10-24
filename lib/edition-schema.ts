import { z } from "zod";
import type { EditionResult } from "./types";

const httpUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Only HTTP(S) source URLs are allowed");
const date = z.string().datetime({ offset: true });
const score = z.number().min(0).max(1);
const evidence = z.object({ sourceId: z.string(), passageId: z.string(), url: httpUrl, publisher: z.string(), excerpt: z.string().min(1) });

export const editionResultSchema = z.object({
  edition: z.object({
    id: z.string().min(1), createdAt: date,
    mode: z.enum(["live", "demo"]).optional(),
    demoInfo: z.object({ label: z.string(), recordedAt: date, originRunId: z.string(), notice: z.string() }).optional(),
    stories: z.array(z.object({
      id: z.string(), headline: z.string().min(1), centralClaim: z.string(), summary: z.string().min(1),
      whyItMatters: z.string().min(1), action: z.string().min(1), category: z.string(),
      sources: z.array(z.object({ id: z.string().optional(), title: z.string(), url: httpUrl, publisher: z.string(), publishedAt: date.nullable() })).min(1),
      verificationStatus: z.literal("verified"), confidence: score, hypeScore: score, verificationReason: z.string(),
      evidence: z.array(evidence).optional(),
      contentSupport: z.array(z.object({ field: z.enum(["centralClaim", "headline", "summary", "whyItMatters", "action"]), text: z.string(), evidence: z.array(evidence).min(1) })).optional(),
      sourceAssessments: z.array(z.object({ sourceId: z.string(), kind: z.enum(["primary", "reporting", "unknown"]), independenceGroup: z.string(), explanation: z.string() })).optional(),
      limitations: z.array(z.string()).optional(),
    })).min(3).max(5),
  }),
  rejectedStories: z.array(z.object({ title: z.string(), url: z.union([httpUrl, z.literal("")]), reason: z.string(), confidence: score,
    verificationStatus: z.enum(["uncertain", "rejected"]), centralClaim: z.string().optional(), reasonCode: z.string().optional() })),
  stats: z.object({ candidatesFound: z.number().int().nonnegative(), approved: z.number().int().nonnegative(), rejected: z.number().int().nonnegative() }),
  runLog: z.array(z.object({ step: z.string(), status: z.enum(["started", "completed", "failed"]), message: z.string(), timestamp: date })),
}).superRefine((result, ctx) => {
  if (result.stats.approved !== result.edition.stories.length || result.stats.rejected !== result.rejectedStories.length ||
    result.stats.candidatesFound !== result.stats.approved + result.stats.rejected) {
    ctx.addIssue({ code: "custom", message: "Edition counts do not match its records" });
  }
  if (new Set(result.edition.stories.map((story) => story.id)).size !== result.edition.stories.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate story IDs" });
  }
  if (result.edition.mode === "demo" && !result.edition.demoInfo) ctx.addIssue({ code: "custom", message: "Demo provenance is required" });
  for (const story of result.edition.stories) {
    for (const item of [...(story.evidence ?? []), ...(story.contentSupport ?? []).flatMap((claim) => claim.evidence)]) {
      if (!story.sources.some((source) => source.url === item.url && source.id === item.sourceId)) {
        ctx.addIssue({ code: "custom", message: "Evidence must reference a listed source" });
      }
    }
  }
});

export function parseEdition(value: unknown): EditionResult {
  return editionResultSchema.parse(value);
}
