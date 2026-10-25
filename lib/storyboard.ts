import { z } from "zod";
import { REACTION_CHARACTERS } from "./illustration-style";

/**
 * Storyboard contracts shared by the server planner, the stored manifest and
 * the reader. Illustrations are optional presentation data: they live beside
 * the immutable edition record, never inside it.
 */
export const STORYBOARD_SCHEMA_VERSION = 1;
export const SCENE_MOTIONS = [
  "still",
  "pan-left",
  "pan-right",
  "zoom-in",
  "zoom-out",
  "rise",
] as const;
export type SceneMotion = (typeof SCENE_MOTIONS)[number];
const reference = z
  .object({ sourceId: z.string().min(1), passageId: z.string().min(1).max(20) })
  .strict();
export const storyboardSceneSchema = z
  .object({
    id: z.string().regex(/^scene-[1-3]$/),
    purpose: z.string().trim().min(1).max(200),
    evidence: z.array(reference).min(1).max(4),
    subject: z.string().trim().min(1).max(200),
    objects: z.array(z.string().trim().min(1).max(60)).min(1).max(6),
    setting: z.string().trim().min(1).max(200),
    composition: z.string().trim().min(1).max(200),
    motion: z.enum(SCENE_MOTIONS),
    cue: z.string().trim().min(1).max(200),
    caption: z.string().trim().min(1).max(160),
    prohibited: z.array(z.string().trim().min(1).max(120)).max(6),
    prompt: z.string().trim().min(20).max(700),
    alt: z.string().trim().min(1).max(300),
    character: z.enum(REACTION_CHARACTERS).nullable(),
  })
  .strict();
export const storyboardPlanSchema = z
  .object({
    tone: z.enum(["light", "neutral", "sober"]),
    scenes: z.array(storyboardSceneSchema).min(2).max(3),
  })
  .strict();
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;
export type StoryboardPlan = z.infer<typeof storyboardPlanSchema>;
export const storyboardAssetSchema = z
  .object({
    key: z.string().min(1).max(200),
    contentType: z.string().min(1).max(60),
    bytes: z.number().int().nonnegative(),
    imageId: z.string().max(100).optional(),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const storyboardManifestSchema = z
  .object({
    schemaVersion: z.literal(STORYBOARD_SCHEMA_VERSION),
    styleVersion: z.string().min(1).max(60),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    editionId: z.string().min(1),
    storyId: z.string().min(1),
    status: z.enum(["planned", "generating", "ready", "partial", "failed"]),
    tone: z.enum(["light", "neutral", "sober"]),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/),
    plannedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    provider: z
      .object({
        name: z.literal("Recraft"),
        model: z.string().min(1).max(60),
        styleId: z.string().max(60).optional(),
        planner: z.string().min(1).max(80),
      })
      .strict(),
    narration: z
      .object({
        scriptHash: z.string().regex(/^[a-f0-9]{64}$/),
        /** Approximate character-proportional cue model; not word-level alignment. */
        model: z.literal("character-proportional"),
        cues: z
          .array(
            z
              .object({
                sceneId: z.string(),
                startFraction: z.number().min(0).max(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    scenes: z
      .array(
        storyboardSceneSchema.extend({
          status: z.enum(["pending", "ready", "failed"]),
          asset: storyboardAssetSchema.optional(),
          error: z.string().max(300).optional(),
        }),
      )
      .min(1)
      .max(3),
    usage: z
      .object({
        imageCalls: z.number().int().nonnegative(),
        plannerCalls: z.number().int().nonnegative(),
        /** Sum of API units Recraft reported charging for this story's images. */
        creditsUsed: z.number().int().nonnegative().optional(),
      })
      .strict(),
    error: z.string().max(300).optional(),
  })
  .strict();
export type StoryboardManifest = z.infer<typeof storyboardManifestSchema>;
export type StoryboardIndex = Record<string, StoryboardManifest>;
export function parseStoryboardManifest(value: unknown) {
  const result = storyboardManifestSchema.safeParse(value);
  return result.success ? result.data : null;
}
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
/**
 * Scene start points as fractions of the narration script, by character offset
 * of each scene's cue. Spoken pace is roughly uniform, so this approximates the
 * moment the narrator reaches the cue; it is not word-level alignment.
 */
export function cueFractions(
  script: string,
  scenes: { id: string; cue: string }[],
) {
  const text = normalize(script);
  let last = 0;
  return scenes.map((scene, index) => {
    if (index === 0) return { sceneId: scene.id, startFraction: 0 };
    const position = text.indexOf(normalize(scene.cue), Math.max(0, last));
    const fraction =
      position < 0 || !text.length
        ? Math.min(1, last / Math.max(1, text.length) + 0.3)
        : position / text.length;
    const clamped = Math.min(
      1,
      Math.max(fraction, last / Math.max(1, text.length)),
    );
    last = Math.max(last, position < 0 ? last : position);
    return { sceneId: scene.id, startFraction: Number(clamped.toFixed(4)) };
  });
}
/** Picks the scene index for a playback fraction (0–1). */
export function sceneIndexForFraction(
  cues: { startFraction: number }[],
  fraction: number,
) {
  if (!cues.length) return 0;
  const value = Number.isFinite(fraction) ? Math.max(0, fraction) : 0;
  let index = 0;
  for (let i = 0; i < cues.length; i++)
    if (cues[i].startFraction <= value) index = i;
  return index;
}
/** Only scenes with a usable asset can be shown; a broken scene hides itself. */
export function displayableScenes(manifest: StoryboardManifest | undefined) {
  if (!manifest) return [];
  return manifest.scenes.filter(
    (scene) => scene.status === "ready" && scene.asset,
  );
}
export const assetPath = (date: string, storyId: string, sceneId: string) =>
  `/api/illustrations/${encodeURIComponent(date)}/${encodeURIComponent(storyId)}/${encodeURIComponent(sceneId)}`;
