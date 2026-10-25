import { evidenceReportSchema } from "./evidence-report";
import { provenanceSchema } from "./provenance";
import { z } from "zod";
import type { EditionResult } from "./types";

const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Only HTTP(S) source URLs are allowed");
const date = z.string().datetime({ offset: true });
const score = z.number().min(0).max(1);
const evidence = z.object({
  sourceId: z.string(),
  passageId: z.string(),
  url: httpUrl,
  publisher: z.string(),
  excerpt: z.string().min(1),
});

const grounded = z.object({
  text: z.string().min(1).max(2000),
  evidence: z.array(evidence).min(1),
});

export const editionResultSchema = z
  .object({
    evidenceReport: evidenceReportSchema.optional(),
    edition: z.object({
      id: z.string().min(1),
      createdAt: date,
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      mode: z.enum(["live", "demo"]).optional(),
      demoInfo: z
        .object({
          label: z.string(),
          recordedAt: date,
          originRunId: z.string(),
          notice: z.string(),
        })
        .optional(),
      stories: z
        .array(
          z.object({
            publicQuestion: z
              .object({
                question: z.string().min(10).max(300),
                answer: z.string().min(1).max(1100),
                postId: z.string(),
                url: httpUrl,
                community: z.string().nullable(),
                publishedAt: date,
                evidence: z.array(evidence).min(1).max(5),
              })
              .optional(),
            id: z.string(),
            headline: z.string().min(1),
            centralClaim: z.string(),
            summary: z.string().min(1),
            whyItMatters: z.string().min(1),
            action: z.string(),
            closingType: z.enum(["none", "response", "bright-side"]).optional(),
            category: z.string(),
            sources: z
              .array(
                z.object({
                  provenance: provenanceSchema.optional(),
                  id: z.string().optional(),
                  title: z.string(),
                  url: httpUrl,
                  publisher: z.string(),
                  publishedAt: date.nullable(),
                }),
              )
              .min(1),
            verificationStatus: z.literal("verified"),
            confidence: score,
            hypeScore: score,
            verificationReason: z.string(),
            media: z
              .array(
                z.object({
                  url: z.union([
                    httpUrl,
                    z.string().regex(/^\/media\/[a-zA-Z0-9_.-]+$/),
                  ]),
                  sourceUrl: httpUrl,
                  publisher: z.string(),
                  type: z.literal("image"),
                  alt: z.string(),
                  attribution: z.string(),
                  rights: z.enum(["unknown", "licensed", "publisher-preview"]),
                  licenseUrl: httpUrl.optional(),
                  retrievedAt: date,
                }),
              )
              .max(3)
              .optional(),
            socialContext: z
              .object({
                notice: z.string(),
                posts: z
                  .array(
                    z.object({
                      id: z.string(),
                      title: z.string(),
                      text: z.string(),
                      url: httpUrl,
                      publishedAt: date,
                      platform: z.literal("Reddit"),
                      community: z.string().nullable(),
                      questions: z.array(z.string()),
                    }),
                  )
                  .max(2),
              })
              .optional(),
            experience: z
              .object({
                quick: grounded,
                explanation: grounded,
                background: grounded,
                glossary: z
                  .array(grounded.extend({ term: z.string().min(1).max(40) }))
                  .max(3),
              })
              .optional(),
            narration: z
              .object({
                script: z.string().min(1).max(4000),
                evidence: z.array(evidence),
                estimatedSeconds: z.number().nonnegative(),
                origin: z.enum(["claude", "reviewed-copy"]),
                audioUrl: z
                  .string()
                  .regex(/^\/demo-audio\/[a-zA-Z0-9_-]+\.mp3$/)
                  .optional(),
                durationSeconds: z.number().positive().optional(),
                provider: z.literal("Cartesia").optional(),
              })
              .optional(),
            evidence: z.array(evidence).optional(),
            contentSupport: z
              .array(
                z.object({
                  field: z.enum([
                    "centralClaim",
                    "headline",
                    "summary",
                    "whyItMatters",
                    "action",
                  ]),
                  text: z.string(),
                  evidence: z.array(evidence).min(1),
                }),
              )
              .optional(),
            sourceAssessments: z
              .array(
                z.object({
                  sourceId: z.string(),
                  kind: z.enum(["primary", "reporting", "unknown"]),
                  independenceGroup: z.string(),
                  explanation: z.string(),
                }),
              )
              .optional(),
            limitations: z.array(z.string()).optional(),
          }),
        )
        .min(3)
        .max(5),
    }),
    rejectedStories: z.array(
      z.object({
        title: z.string(),
        url: z.union([httpUrl, z.literal("")]),
        reason: z.string(),
        confidence: score,
        verificationStatus: z.enum(["uncertain", "rejected"]),
        centralClaim: z.string().optional(),
        reasonCode: z.string().optional(),
      }),
    ),
    stats: z.object({
      candidatesFound: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
    }),
    runLog: z.array(
      z.object({
        step: z.string(),
        status: z.enum(["started", "completed", "failed"]),
        message: z.string(),
        timestamp: date,
      }),
    ),
  })
  .superRefine((result, ctx) => {
    if (
      result.stats.approved !== result.edition.stories.length ||
      result.stats.rejected !== result.rejectedStories.length ||
      result.stats.candidatesFound !==
        result.stats.approved + result.stats.rejected
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Edition counts do not match its records",
      });
    }
    if (
      new Set(result.edition.stories.map((story) => story.id)).size !==
      result.edition.stories.length
    ) {
      ctx.addIssue({ code: "custom", message: "Duplicate story IDs" });
    }
    if (result.edition.mode === "demo" && !result.edition.demoInfo)
      ctx.addIssue({ code: "custom", message: "Demo provenance is required" });
    for (const story of result.edition.stories) {
      if (
        story.publicQuestion &&
        (!/^https:\/\/(?:www\.)?reddit\.com\//.test(story.publicQuestion.url) ||
          story.publicQuestion.evidence.some(
            (ref) =>
              !story.evidence?.some(
                (e) =>
                  e.sourceId === ref.sourceId &&
                  e.passageId === ref.passageId &&
                  e.url === ref.url &&
                  e.excerpt === ref.excerpt,
              ),
          ))
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Public-question answers require exact retained evidence and a public Reddit source",
        });
      }
      for (const item of [
        ...(story.evidence ?? []),
        ...(story.publicQuestion?.evidence ?? []),
        ...(story.contentSupport ?? []).flatMap((claim) => claim.evidence),
        ...(story.narration?.evidence ?? []),
        ...[
          story.experience?.quick,
          story.experience?.explanation,
          story.experience?.background,
          ...(story.experience?.glossary ?? []),
        ].flatMap((part) => part?.evidence ?? []),
      ]) {
        if (
          !story.sources.some(
            (source) => source.url === item.url && source.id === item.sourceId,
          )
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Evidence must reference a listed source",
          });
        }
      }
    }
  });

export function parseEdition(value: unknown): EditionResult {
  return editionResultSchema.parse(value);
}
