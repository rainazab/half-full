import { z } from "zod";

/** Optional presentation assets. Published news records are never rewritten. */
export const videoManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    editionId: z.string().min(1).max(150),
    storyId: z.string().regex(/^[\w-]{1,150}$/),
    status: z.enum(["preparing", "pending", "processing", "ready", "failed"]),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    provider: z
      .object({
        name: z.literal("Runway"),
        model: z.literal("gen4_turbo"),
        apiVersion: z.literal("2024-11-06"),
      })
      .strict(),
    disclosure: z.literal(
      "AI-generated illustration, not documentary footage.",
    ),
    review: z
      .object({
        status: z.enum(["pending", "approved", "rejected"]),
        notes: z.string().min(10).max(500),
        reviewedAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict()
      .optional(),
    narration: z
      .object({
        scriptHash: z.string().regex(/^[a-f0-9]{64}$/),
        /** An explicitly authored visual loop. No inferred word-level alignment. */
        mapping: z.literal("authored-loop"),
        description: z.string().min(1).max(300),
      })
      .strict(),
    previousAttempts: z
      .array(
        z
          .object({
            taskId: z.string().uuid().optional(),
            attempt: z.number().int().min(1).max(2),
            status: z.enum([
              "preparing",
              "pending",
              "processing",
              "ready",
              "failed",
            ]),
            prompt: z.string().min(20).max(1000),
            promptHash: z.string().regex(/^[a-f0-9]{64}$/),
            submittedAt: z.string().datetime({ offset: true }).optional(),
            endedAt: z.string().datetime({ offset: true }),
            estimatedCredits: z.number().nonnegative(),
            providerEstimatedCredits: z.number().nonnegative().optional(),
            error: z
              .object({
                code: z.string().max(80),
                message: z.string().max(300),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(1)
      .optional(),
    clips: z
      .array(
        z
          .object({
            id: z.string().regex(/^clip-[1-3]$/),
            sceneId: z.string().regex(/^scene-[1-3]$/),
            status: z.enum([
              "preparing",
              "pending",
              "processing",
              "ready",
              "failed",
            ]),
            taskId: z.string().uuid().optional(),
            attempt: z.number().int().min(1).max(2),
            submittedAt: z.string().datetime({ offset: true }).optional(),
            checkedAt: z.string().datetime({ offset: true }).optional(),
            durationSeconds: z.literal(5),
            ratio: z.enum([
              "1280:720",
              "720:1280",
              "1104:832",
              "960:960",
              "832:1104",
              "1584:672",
            ]),
            prompt: z.string().min(20).max(1000),
            promptHash: z.string().regex(/^[a-f0-9]{64}$/),
            poster: z.string().startsWith("/api/illustrations/"),
            alt: z.string().min(1).max(400),
            source: z
              .object({
                provider: z.literal("Recraft"),
                assetKey: z.string().min(1).max(200),
                promptHash: z.string().regex(/^[a-f0-9]{64}$/),
                imageId: z.string().max(100).optional(),
                evidence: z
                  .array(
                    z
                      .object({ sourceId: z.string(), passageId: z.string() })
                      .strict(),
                  )
                  .min(1)
                  .max(4),
              })
              .strict(),
            /** Only local durable URLs are exposed. Runway's signed result URL is never stored here. */
            asset: z
              .object({
                key: z.string().regex(/^VIDEO-[\w-]{1,190}$/),
                url: z.string().startsWith("/api/videos/"),
                contentType: z.literal("video/mp4"),
                bytes: z
                  .number()
                  .int()
                  .positive()
                  .max(35 * 1024 * 1024),
                sha256: z.string().regex(/^[a-f0-9]{64}$/),
                cachedAt: z.string().datetime({ offset: true }),
                width: z.number().int().positive().optional(),
                height: z.number().int().positive().optional(),
                durationSeconds: z.number().positive().optional(),
                processing: z
                  .object({
                    kind: z.literal("crop-margins"),
                    sourceAssetKey: z.string().regex(/^VIDEO-[\w-]{1,190}$/),
                    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
                    sourceWidth: z.number().int().positive(),
                    sourceHeight: z.number().int().positive(),
                    crop: z
                      .object({
                        x: z.number().int().nonnegative(),
                        y: z.number().int().nonnegative(),
                        width: z.number().int().positive(),
                        height: z.number().int().positive(),
                      })
                      .strict(),
                    tool: z.literal("AVFoundation H.264 export"),
                  })
                  .strict()
                  .optional(),
              })
              .strict()
              .optional(),
            cost: z
              .object({
                estimatedCredits: z.number().nonnegative(),
                estimatedUsd: z.number().nonnegative(),
                basis: z.literal("published-list-price"),
                providerEstimatedCredits: z.number().nonnegative().optional(),
                actualCredits: z.number().nonnegative().optional(),
              })
              .strict(),
            error: z
              .object({
                code: z.string().max(80),
                message: z.string().max(300),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    for (const clip of manifest.clips) {
      if (clip.status === "ready" && (!clip.asset || !clip.taskId))
        ctx.addIssue({
          code: "custom",
          path: ["clips"],
          message: "Ready video requires a provider task and durable asset.",
        });
    }
    if (
      manifest.status === "ready" &&
      !manifest.clips.some((c) => c.status === "ready")
    )
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Ready manifest requires a playable clip.",
      });
    if (manifest.status === "ready" && manifest.review?.status !== "approved")
      ctx.addIssue({
        code: "custom",
        path: ["review"],
        message: "A generated clip requires visual review before publication.",
      });
  });
export type VideoManifest = z.infer<typeof videoManifestSchema>;
export type VideoClip = VideoManifest["clips"][number];
export type VideoIndex = Record<string, VideoManifest>;
export const VIDEO_MOTION_ACTIONS = [
  "ripple",
  "flow",
  "sway",
  "rotate",
  "drift",
  "turn-page",
] as const;
export const videoMotionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    editionId: z.string().min(1),
    storyId: z.string().regex(/^[\w-]{1,150}$/),
    sceneId: z.string().regex(/^scene-[1-3]$/),
    createdAt: z.string().datetime({ offset: true }),
    provider: z
      .object({
        name: z.literal("Claude"),
        model: z.string().min(1).max(100),
        requestId: z.string().min(1).max(150),
      })
      .strict(),
    source: z
      .object({
        storyboardPromptHash: z.string().regex(/^[a-f0-9]{64}$/),
        keyframePromptHash: z.string().regex(/^[a-f0-9]{64}$/),
        evidence: z
          .array(
            z.object({ sourceId: z.string(), passageId: z.string() }).strict(),
          )
          .min(1)
          .max(4),
      })
      .strict(),
    durationSeconds: z.literal(5),
    motions: z
      .array(
        z
          .object({
            object: z.string().min(1).max(60),
            action: z.enum(VIDEO_MOTION_ACTIONS),
            explanationQuote: z.string().min(10).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    prompt: z.string().min(20).max(1000),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        calls: z.literal(1),
      })
      .strict(),
    reviewRequired: z.literal(true),
  })
  .strict();
export type VideoMotionPlan = z.infer<typeof videoMotionPlanSchema>;
export const parseVideoManifest = (value: unknown) => {
  const result = videoManifestSchema.safeParse(value);
  return result.success ? result.data : null;
};
export const videoPath = (date: string, storyId: string, clipId: string) =>
  `/api/videos/${encodeURIComponent(date)}/${encodeURIComponent(storyId)}/${encodeURIComponent(clipId)}`;

/** Cartesia is the clock: pausing or seeking it pauses/seeks this authored loop. */
export function videoTimeForNarration(seconds: number, durationSeconds = 5) {
  if (!Number.isFinite(seconds) || seconds < 0 || durationSeconds <= 0)
    return 0;
  return seconds % durationSeconds;
}

/** Safari-compatible single byte ranges; no multipart allocations. */
export function videoResponse(
  bytes: Uint8Array,
  range?: string | null,
  etag?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    ...(etag ? { ETag: etag } : {}),
  };
  if (!range)
    return new Response(bytes.slice().buffer, {
      headers: { ...headers, "Content-Length": String(bytes.length) },
    });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0,
    end = bytes.length - 1;
  if (match && (match[1] || match[2])) {
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    } else start = Math.max(0, bytes.length - Number(match[2]));
  }
  if (
    !match ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= bytes.length ||
    end < start
  )
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
    });
  return new Response(bytes.slice(start, end + 1).buffer, {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
