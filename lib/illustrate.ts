import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dailyStore } from "./daily-store";
import { getEditorConfig } from "./config";
import { PipelineError, publicError } from "./errors";
import { ILLUSTRATION_STYLE } from "./illustration-style";
import { illustrationStore, IllustrationStore } from "./illustration-store";
import { narrationFor } from "./narration";
import {
  createRecraftStyle,
  downloadGeneratedImage,
  generateRecraftImage,
  recraftConfig,
  type RecraftConfig,
} from "./recraft";
import {
  cueFractions,
  STORYBOARD_SCHEMA_VERSION,
  type StoryboardManifest,
} from "./storyboard";
import { anthropicPlanner, type Planner } from "./storyboard-plan";
import { anthropicMotionPlanner, type MotionPlanner } from "./motion-plan";
import { composeArtPrompt } from "./storyboard-prompt";
import type { ApprovedStory, EditionResult } from "./types";

export type IllustrateOptions = {
  storyIds?: string[];
  scenesPerStory?: 2 | 3;
  /** Hard cap on paid image calls for this invocation. */
  maxImages?: number;
  log?: (message: string) => void;
};
export type IllustrateDependencies = {
  store: IllustrationStore;
  getEdition: (date: string) => Promise<EditionResult | null>;
  planner: () => Planner;
  recraft: () => RecraftConfig;
  generate: typeof generateRecraftImage;
  download: typeof downloadGeneratedImage;
  createStyle: typeof createRecraftStyle;
  readReference: (publicPath: string) => Promise<Uint8Array>;
  now: () => Date;
};
export const illustrateDependencies: IllustrateDependencies = {
  store: illustrationStore,
  getEdition: (date) => dailyStore.get(date),
  planner: () => anthropicPlanner(getEditorConfig()),
  recraft: () => recraftConfig(),
  generate: generateRecraftImage,
  download: downloadGeneratedImage,
  createStyle: createRecraftStyle,
  readReference: (publicPath) =>
    readFile(path.join(process.cwd(), "public", publicPath.replace(/^\//, ""))),
  now: () => new Date(),
};
/**
 * Adds layered animation to existing, ready storyboards. Planner-only: no
 * Recraft call is ever made here, and existing animation is kept unless
 * `replace` is set.
 */
export async function planMotion(
  date: string,
  options: {
    storyIds?: string[];
    replace?: boolean;
    log?: (message: string) => void;
  } = {},
  deps: {
    store: IllustrationStore;
    getEdition: (date: string) => Promise<EditionResult | null>;
    motionPlanner: () => MotionPlanner;
    now: () => Date;
  } = {
    store: illustrationStore,
    getEdition: (day) => dailyStore.get(day),
    motionPlanner: () => anthropicMotionPlanner(getEditorConfig()),
    now: () => new Date(),
  },
) {
  const log = options.log ?? (() => {});
  const edition = await deps.getEdition(date);
  if (!edition)
    throw new PipelineError(
      "NO_EDITION",
      "Motion is only planned for a published edition.",
      404,
    );
  const release = await deps.store.lock(date);
  const summary = {
    date,
    plannerCalls: 0,
    animated: [] as string[],
    skipped: [] as { storyId: string; reason: string }[],
  };
  try {
    let plannerInstance: MotionPlanner | undefined;
    const planner = () => (plannerInstance ??= deps.motionPlanner());
    for (const story of edition.edition.stories) {
      if (options.storyIds?.length && !options.storyIds.includes(story.id))
        continue;
      const manifest = await deps.store.getManifest(date, story.id);
      if (
        !manifest ||
        !manifest.scenes.some((scene) => scene.status === "ready")
      ) {
        summary.skipped.push({
          storyId: story.id,
          reason: "No ready scenes to animate.",
        });
        continue;
      }
      if (
        !options.replace &&
        manifest.scenes.every(
          (scene) => scene.status !== "ready" || scene.animation,
        )
      ) {
        summary.skipped.push({
          storyId: story.id,
          reason: "Animation already planned; reused.",
        });
        continue;
      }
      try {
        const planned = await planner()(story, manifest);
        summary.plannerCalls += planned.calls;
        const next = structuredClone(manifest);
        for (const scene of next.scenes)
          if (planned.animations[scene.id])
            scene.animation = planned.animations[scene.id];
        next.usage.plannerCalls += planned.calls;
        next.updatedAt = deps.now().toISOString();
        await deps.store.saveManifest(next);
        summary.animated.push(story.id);
        log(
          `${story.id}: animation planned for ${Object.keys(planned.animations).join(", ")}.`,
        );
      } catch (error) {
        const safe = publicError(error);
        summary.skipped.push({
          storyId: story.id,
          reason: `${safe.code}: ${safe.message}`,
        });
        log(`${story.id}: ${safe.code} ${safe.message}`);
        if (safe.code === "STORYBOARD_PLANNER_UNAVAILABLE") break;
      }
    }
    return summary;
  } finally {
    await release();
  }
}
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function illustrationLimits(
  env: Record<string, string | undefined> = process.env,
) {
  const number = (name: string, fallback: number, max: number) => {
    const value = Number(env[name]);
    return Number.isInteger(value) && value >= 0
      ? Math.min(value, max)
      : fallback;
  };
  return {
    scenesPerStory: (number("RECRAFT_SCENES_PER_STORY", 2, 3) || 2) as 2 | 3,
    maxScenesPerEdition: number("RECRAFT_MAX_SCENES_PER_EDITION", 10, 15),
    dailyImageBudget: number("RECRAFT_DAILY_IMAGE_BUDGET", 24, 200),
    concurrency: 2,
    enabled: env.RECRAFT_GENERATION_ENABLED !== "false",
  };
}
/** Ensures the reusable style exists; creates it once from the reaction artwork. */
export async function ensureStyle(
  deps: IllustrateDependencies,
  config: RecraftConfig,
  log: (message: string) => void,
) {
  if (config.styleId) return { id: config.styleId, created: false };
  const stored = await deps.store.getStyle(ILLUSTRATION_STYLE.version);
  if (stored) return { id: stored.id, created: false };
  const references = await Promise.all(
    ILLUSTRATION_STYLE.references.map(async (reference) => ({
      name: path.basename(reference),
      bytes: await deps.readReference(reference),
      type: reference.endsWith(".png") ? "image/png" : "image/webp",
    })),
  );
  const created = await deps.createStyle(config, references);
  await deps.store.saveStyle(ILLUSTRATION_STYLE.version, {
    id: created.id,
    createdAt: deps.now().toISOString(),
    creditsUsed: created.creditsUsed,
    references: [...ILLUSTRATION_STYLE.references],
  });
  log(
    `Created reusable Recraft style ${created.id} from ${references.length} half full reference images (style ${ILLUSTRATION_STYLE.version}).`,
  );
  return { id: created.id, created: true };
}
export type IllustrateSummary = {
  date: string;
  mode: "memory" | "apify";
  styleId?: string;
  styleCreated: boolean;
  imageCalls: number;
  plannerCalls: number;
  /** API units Recraft reported charging during this run. */
  creditsUsed: number;
  storyboards: Record<string, StoryboardManifest>;
  skipped: { storyId: string; reason: string }[];
};
/**
 * Illustrates approved stories of an already published edition. Reuses existing
 * manifests and assets, repairs missing scenes only, and never writes to the
 * edition record. Paid calls are bounded by per-run, per-edition and per-day caps.
 */
export async function illustrateEdition(
  date: string,
  options: IllustrateOptions = {},
  deps: IllustrateDependencies = illustrateDependencies,
  limits = illustrationLimits(),
): Promise<IllustrateSummary> {
  const log =
    options.log ??
    ((message: string) =>
      console.info(JSON.stringify({ illustrate: date, message })));
  if (!limits.enabled)
    throw new PipelineError(
      "ILLUSTRATION_DISABLED",
      "Illustration generation is disabled on this server (RECRAFT_GENERATION_ENABLED=false).",
      503,
    );
  const edition = await deps.getEdition(date);
  if (!edition)
    throw new PipelineError(
      "NO_EDITION",
      "Illustrations are only generated for a published edition. Publish the date first.",
      404,
    );
  const release = await deps.store.lock(date);
  const summary: IllustrateSummary = {
    date,
    mode: deps.store.mode,
    styleCreated: false,
    imageCalls: 0,
    plannerCalls: 0,
    creditsUsed: 0,
    storyboards: {},
    skipped: [],
  };
  try {
    const config = deps.recraft();
    const scenesPerStory = options.scenesPerStory ?? limits.scenesPerStory;
    const requested = options.storyIds?.length
      ? edition.edition.stories.filter((story) =>
          options.storyIds!.includes(story.id),
        )
      : edition.edition.stories;
    let remainingForEdition = limits.maxScenesPerEdition;
    let remainingForRun = options.maxImages ?? Number.POSITIVE_INFINITY;
    let plannerInstance: Planner | undefined;
    const planner = () => (plannerInstance ??= deps.planner());
    let styleId: string | undefined;
    // Existing finished scenes count toward the per-edition cap without new calls.
    for (const story of edition.edition.stories) {
      const existing = await deps.store.getManifest(date, story.id);
      if (existing) {
        summary.storyboards[story.id] = existing;
        remainingForEdition -= existing.scenes.filter(
          (scene) => scene.status === "ready",
        ).length;
      }
    }
    for (const story of requested) {
      const existing = summary.storyboards[story.id];
      if (existing && existing.status === "ready") {
        summary.skipped.push({
          storyId: story.id,
          reason: "Illustrations already exist; reused.",
        });
        continue;
      }
      if (existing && existing.styleVersion !== ILLUSTRATION_STYLE.version) {
        summary.skipped.push({
          storyId: story.id,
          reason: `Existing storyboard uses ${existing.styleVersion}; regeneration is a separate operator decision.`,
        });
        continue;
      }
      try {
        // The reusable style is confirmed before any planner call, so a
        // misconfigured image provider never spends editor tokens.
        if (!styleId) {
          const style = await ensureStyle(deps, config, log);
          styleId = style.id;
          summary.styleId = style.id;
          summary.styleCreated = style.created;
        }
        const manifest = existing
          ? structuredClone(existing)
          : await planManifest(
              story,
              edition,
              date,
              scenesPerStory,
              planner,
              deps,
              summary,
              config,
            );
        manifest.provider.styleId = styleId;
        if (!existing) await deps.store.saveManifest(manifest);
        const pending = manifest.scenes.filter(
          (scene) => scene.status !== "ready",
        );
        if (!pending.length) {
          manifest.status = "ready";
          summary.storyboards[story.id] =
            await deps.store.saveManifest(manifest);
          continue;
        }
        manifest.status = "generating";
        await deps.store.saveManifest(manifest);
        const queue = [...pending];
        const workers = Array.from(
          { length: Math.min(limits.concurrency, queue.length) },
          async () => {
            while (queue.length) {
              const scene = queue.shift()!;
              if (remainingForEdition <= 0 || remainingForRun <= 0) {
                scene.status = "failed";
                scene.error =
                  "Not generated: the illustration budget for this edition or run is exhausted.";
                continue;
              }
              // Reserve synchronously so concurrent workers cannot both pass the same cap.
              remainingForEdition--;
              remainingForRun--;
              const used = await deps.store.countImages();
              if (used >= limits.dailyImageBudget) {
                remainingForEdition++;
                remainingForRun++;
                scene.status = "failed";
                scene.error = `Not generated: today's Recraft image budget (${limits.dailyImageBudget}) is spent.`;
                continue;
              }
              await deps.store.recordImages(1);
              summary.imageCalls++;
              manifest.usage.imageCalls++;
              const prompt = composeArtPrompt(scene, manifest.tone);
              const promptHash = sha256(
                `${ILLUSTRATION_STYLE.version}\n${styleId}\n${prompt}`,
              );
              try {
                const image = await deps.generate(config, {
                  prompt,
                  styleId: styleId!,
                });
                if (typeof image.creditsUsed === "number") {
                  summary.creditsUsed += image.creditsUsed;
                  manifest.usage.creditsUsed =
                    (manifest.usage.creditsUsed ?? 0) + image.creditsUsed;
                }
                const asset = await deps.download(image.url);
                const key = IllustrationStore.assetKey(
                  date,
                  story.id,
                  scene.id,
                );
                await deps.store.saveAsset(key, asset, promptHash);
                scene.asset = {
                  key,
                  contentType: asset.contentType,
                  bytes: asset.bytes.length,
                  imageId: image.imageId,
                  promptHash,
                  generatedAt: deps.now().toISOString(),
                };
                scene.status = "ready";
                delete scene.error;
                log(
                  `${story.id} ${scene.id}: generated ${asset.bytes.length} bytes (${asset.contentType}).`,
                );
              } catch (error) {
                const safe = publicError(error);
                scene.status = "failed";
                scene.error = `${safe.code}: ${safe.message}`.slice(0, 300);
                log(`${story.id} ${scene.id}: ${scene.error}`);
              }
            }
          },
        );
        await Promise.all(workers);
        const ready = manifest.scenes.filter(
          (scene) => scene.status === "ready",
        ).length;
        manifest.status =
          ready === manifest.scenes.length
            ? "ready"
            : ready > 0
              ? "partial"
              : "failed";
        manifest.updatedAt = deps.now().toISOString();
        summary.storyboards[story.id] = await deps.store.saveManifest(manifest);
      } catch (error) {
        const safe = publicError(error);
        summary.skipped.push({
          storyId: story.id,
          reason: `${safe.code}: ${safe.message}`,
        });
        log(`${story.id}: ${safe.code} ${safe.message}`);
        if (
          safe.code === "RECRAFT_NOT_CONFIGURED" ||
          safe.code === "STORYBOARD_PLANNER_UNAVAILABLE"
        )
          break;
      }
    }
    return summary;
  } finally {
    await release();
  }
}
async function planManifest(
  story: ApprovedStory,
  edition: EditionResult,
  date: string,
  scenesPerStory: 2 | 3,
  planner: () => Planner,
  deps: IllustrateDependencies,
  summary: IllustrateSummary,
  config: RecraftConfig,
): Promise<StoryboardManifest> {
  const planned = await planner()(story, scenesPerStory);
  summary.plannerCalls += planned.calls;
  const script = narrationFor(story).script;
  const now = deps.now().toISOString();
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    styleVersion: ILLUSTRATION_STYLE.version,
    date,
    editionId: edition.edition.id,
    storyId: story.id,
    status: "planned",
    tone: planned.plan.tone,
    promptHash: sha256(JSON.stringify(planned.plan)),
    plannedAt: now,
    updatedAt: now,
    provider: {
      name: "Recraft",
      model: config.model,
      styleId: config.styleId,
      planner: planned.model,
    },
    narration: {
      scriptHash: sha256(script),
      model: "character-proportional",
      cues: cueFractions(script, planned.plan.scenes),
    },
    scenes: planned.plan.scenes.map((scene) => ({
      ...scene,
      status: "pending",
    })),
    usage: { imageCalls: 0, plannerCalls: planned.calls },
  };
}
