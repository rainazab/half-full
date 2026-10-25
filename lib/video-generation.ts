import "server-only";
import { createHash } from "node:crypto";
import { dailyStore } from "./daily-store";
import { editionDay } from "./daily";
import { PipelineError, publicError } from "./errors";
import { illustrationStore } from "./illustration-store";
import { narrationFor } from "./narration";
import {
  runwayConfig,
  submitRunway,
  getRunwayTask,
  downloadRunwayVideo,
} from "./runway";
import { assetPath, type StoryboardManifest } from "./storyboard";
import { videoPath, type VideoManifest, type VideoClip } from "./video";
import { VideoStore, videoStore } from "./video-store";
import type { EditionResult } from "./types";

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
type GenerateDependencies = {
  store: VideoStore;
  getEdition: (date: string) => Promise<EditionResult | null>;
  getStoryboard: (
    date: string,
    storyId: string,
  ) => Promise<StoryboardManifest | null>;
  getImage: typeof illustrationStore.getAsset;
  config: typeof runwayConfig;
  submit: typeof submitRunway;
  poll: typeof getRunwayTask;
  download: typeof downloadRunwayVideo;
  now: () => Date;
};
export const videoDependencies: GenerateDependencies = {
  store: videoStore,
  getEdition: (day) => dailyStore.get(day),
  getStoryboard: (day, id) => illustrationStore.getManifest(day, id),
  getImage: (key, version) => illustrationStore.getAsset(key, version),
  config: runwayConfig,
  submit: submitRunway,
  poll: getRunwayTask,
  download: downloadRunwayVideo,
  now: () => new Date(),
};
export type VideoRequest = {
  date: string;
  storyId: string;
  sceneId: string;
  prompt: string;
  ratio: VideoClip["ratio"];
};
/** Operator-only preparation. Reads approved copy/evidence and existing images; never bills. */
export async function prepareVideo(
  request: VideoRequest,
  deps = videoDependencies,
) {
  const result = await deps.getEdition(request.date);
  const story = result?.edition.stories.find(
    (story) => story.id === request.storyId,
  );
  if (
    !story ||
    story.verificationStatus !== "verified" ||
    !story.evidence?.length
  )
    throw new PipelineError(
      "VIDEO_STORY_UNAPPROVED",
      "Video requires a published, evidence-approved story.",
      422,
    );
  const storyboard = await deps.getStoryboard(request.date, request.storyId);
  const scene = storyboard?.scenes.find(
    (scene) =>
      scene.id === request.sceneId && scene.status === "ready" && scene.asset,
  );
  if (
    !storyboard ||
    storyboard.editionId !== result!.edition.id ||
    !scene?.asset
  )
    throw new PipelineError(
      "VIDEO_KEYFRAME_MISSING",
      "This story has no ready Recraft keyframe for that scene.",
      422,
    );
  const scriptHash = hash(narrationFor(story).script);
  if (
    storyboard.narration.scriptHash !== scriptHash ||
    !scene.evidence.every((ref) =>
      story.evidence!.some(
        (e) => e.sourceId === ref.sourceId && e.passageId === ref.passageId,
      ),
    )
  )
    throw new PipelineError(
      "VIDEO_EVIDENCE_MISMATCH",
      "The source keyframe does not match this story's narration and retained evidence.",
      422,
    );
  if (
    request.prompt.length < 20 ||
    request.prompt.length > 1000 ||
    /https?:\/\//i.test(request.prompt)
  )
    throw new PipelineError(
      "VIDEO_PROMPT_INVALID",
      "Use a 20–1,000 character, source-grounded motion prompt without links.",
      422,
    );
  const image = await deps.getImage(scene.asset.key, scene.asset.promptHash);
  if (!image)
    throw new PipelineError(
      "VIDEO_KEYFRAME_MISSING",
      "The Recraft keyframe bytes are unavailable.",
      422,
    );
  const now = deps.now().toISOString();
  const clip: VideoClip = {
    id: "clip-1",
    sceneId: scene.id,
    status: "preparing",
    attempt: 1,
    durationSeconds: 5,
    ratio: request.ratio,
    prompt: request.prompt,
    promptHash: hash(
      JSON.stringify({
        prompt: request.prompt,
        source: scene.asset.promptHash,
        model: "gen4_turbo",
        duration: 5,
        ratio: request.ratio,
      }),
    ),
    poster: assetPath(request.date, request.storyId, scene.id),
    alt: scene.alt,
    source: {
      provider: "Recraft",
      assetKey: scene.asset.key,
      promptHash: scene.asset.promptHash,
      imageId: scene.asset.imageId,
      evidence: scene.evidence,
    },
    cost: {
      estimatedCredits: 25,
      estimatedUsd: 0.25,
      basis: "published-list-price",
    },
  };
  const manifest: VideoManifest = {
    schemaVersion: 1,
    date: request.date,
    editionId: result!.edition.id,
    storyId: story.id,
    status: "preparing",
    createdAt: now,
    updatedAt: now,
    provider: { name: "Runway", model: "gen4_turbo", apiVersion: "2024-11-06" },
    disclosure: "AI-generated illustration, not documentary footage.",
    narration: {
      scriptHash,
      mapping: "authored-once",
      description:
        "A five-second illustrated visual loop follows the narration clock. Pause and seek follow audio; this is not word-level synchronization.",
    },
    clips: [clip],
  };
  return { manifest, image, headline: story.headline };
}
/** Explicit operator submission only. No HTTP browsing path calls this function. */
export async function submitVideo(
  request: VideoRequest,
  options: { maxCredits: number; retry?: boolean },
  deps = videoDependencies,
) {
  if (
    !Number.isFinite(options.maxCredits) ||
    options.maxCredits < 25 ||
    options.maxCredits > 50
  )
    throw new PipelineError(
      "VIDEO_BUDGET_REQUIRED",
      "Explicitly authorize between 25 and 50 credits before submitting a five-second clip.",
      422,
    );
  if (deps.store.mode !== "apify" && process.env.NODE_ENV !== "test")
    throw new PipelineError(
      "VIDEO_DURABLE_STORAGE_REQUIRED",
      "Paid video requires durable Apify storage.",
      503,
    );
  const config = deps.config();
  const prepared = await prepareVideo(request, deps);
  const release = await deps.store.lock();
  try {
    const existing = await deps.store.getManifest(
      request.date,
      request.storyId,
    );
    if (existing && (!options.retry || existing.status !== "failed"))
      return existing;
    if (existing && existing.clips[0].attempt >= 2)
      throw new PipelineError(
        "VIDEO_ATTEMPTS_REACHED",
        "This story has reached its two-attempt video limit.",
        429,
      );
    const manifest = prepared.manifest;
    manifest.clips[0].attempt = existing ? existing.clips[0].attempt + 1 : 1;
    if (existing) {
      const previous = existing.clips[0];
      manifest.previousAttempts = [
        {
          taskId: previous.taskId,
          attempt: previous.attempt,
          status: previous.status,
          prompt: previous.prompt,
          promptHash: previous.promptHash,
          submittedAt: previous.submittedAt,
          endedAt: existing.updatedAt,
          estimatedCredits: previous.cost.estimatedCredits,
          providerEstimatedCredits: previous.cost.providerEstimatedCredits,
          error: previous.error,
        },
      ];
      await deps.store.saveManifest(existing);
    }
    const budgetValue = Number(process.env.RUNWAY_DAILY_CREDIT_BUDGET ?? 50);
    const dailyBudget = Number.isFinite(budgetValue)
      ? Math.max(0, Math.min(100, budgetValue))
      : 50;
    await deps.store.reserve(editionDay(deps.now()), 25, dailyBudget);
    // Reservation and manifest are durable before the non-idempotent provider POST.
    await deps.store.saveManifest(manifest);
    release.assertOwned?.();
    try {
      const task = await deps.submit(config, {
        image: prepared.image.bytes,
        contentType: prepared.image.contentType,
        prompt: request.prompt,
        ratio: request.ratio,
      });
      const clip = manifest.clips[0];
      clip.taskId = task.id;
      clip.submittedAt = deps.now().toISOString();
      clip.cost.providerEstimatedCredits = task.estimatedCredits;
      clip.status = "pending";
      manifest.status = "pending";
    } catch (error) {
      const safe = publicError(error);
      const ambiguous = [
        "VIDEO_PROVIDER_UNREACHABLE",
        "VIDEO_TASK_MISSING",
        "VIDEO_PROVIDER_INVALID",
      ].includes(safe.code);
      manifest.clips[0].status = ambiguous ? "preparing" : "failed";
      manifest.status = manifest.clips[0].status;
      manifest.clips[0].error = {
        code: safe.code,
        message: safe.message.slice(0, 300),
      };
    }
    manifest.updatedAt = deps.now().toISOString();
    await deps.store.saveManifest(manifest);
    return manifest;
  } finally {
    await release();
  }
}
/** One asynchronous status check. Re-run via the operator script; never starts another paid task. */
export async function pollVideo(
  date: string,
  storyId: string,
  deps = videoDependencies,
) {
  const release = await deps.store.lock();
  try {
    const stored = await deps.store.getManifest(date, storyId);
    if (!stored)
      throw new PipelineError(
        "VIDEO_NOT_FOUND",
        "No video task is stored for this story.",
        404,
      );
    const manifest = structuredClone(stored),
      clip = manifest.clips[0];
    if (
      manifest.status === "ready" ||
      manifest.status === "failed" ||
      (clip.asset && manifest.review?.status === "pending") ||
      !clip.taskId
    )
      return manifest;
    if (
      clip.checkedAt &&
      deps.now().getTime() - Date.parse(clip.checkedAt) < 5000
    )
      return manifest;
    const task = await deps.poll(deps.config(), clip.taskId);
    clip.checkedAt = deps.now().toISOString();
    if (task.status === "FAILED" || task.status === "CANCELED") {
      clip.status = "failed";
      clip.error = {
        code: "VIDEO_GENERATION_FAILED",
        message: `Runway ${task.status.toLowerCase()} this clip${task.failureCode ? ` (${task.failureCode.replace(/[^a-z0-9_.-]/gi, "").slice(0, 60)})` : ""}. The still illustration remains available.`,
      };
    } else if (task.status === "SUCCEEDED") {
      if (!task.output?.[0])
        throw new PipelineError(
          "VIDEO_OUTPUT_MISSING",
          "The completed video task has no output. Its stored task can be inspected again.",
          502,
        );
      const asset = await deps.download(task.output[0]);
      const sha256 = hash(asset.bytes),
        key = VideoStore.assetKey(date, storyId, clip.id, sha256);
      release.assertOwned?.();
      await deps.store.saveAsset(key, asset);
      clip.asset = {
        key,
        url: videoPath(date, storyId, clip.id),
        contentType: "video/mp4",
        bytes: asset.bytes.length,
        sha256,
        cachedAt: deps.now().toISOString(),
      };
      clip.status = "processing";
      clip.error = {
        code: "VIDEO_REVIEW_REQUIRED",
        message:
          "The generated clip is cached and awaiting a visual review. The still illustration remains available.",
      };
      manifest.review = {
        status: "pending",
        notes:
          "Provider output is cached. An operator must inspect actual frames before readers can play it.",
      };
    } else clip.status = task.status === "RUNNING" ? "processing" : "pending";
    manifest.status = clip.status;
    manifest.updatedAt = deps.now().toISOString();
    await deps.store.saveManifest(manifest);
    return manifest;
  } finally {
    await release();
  }
}

/** Explicit operator review. A task's success alone never makes footage publishable. */
export async function reviewVideo(
  date: string,
  storyId: string,
  options: {
    approved: boolean;
    notes: string;
    derivative?: {
      bytes: Uint8Array;
      width: number;
      height: number;
      durationSeconds: number;
      processing: NonNullable<NonNullable<VideoClip["asset"]>["processing"]>;
    };
  },
  deps = videoDependencies,
) {
  if (options.notes.trim().length < 10 || options.notes.length > 500)
    throw new PipelineError(
      "VIDEO_REVIEW_REQUIRED",
      "A concise visual-review record is required.",
      422,
    );
  const release = await deps.store.lock();
  try {
    const saved = await deps.store.getManifest(date, storyId);
    if (!saved?.clips[0].asset || !saved.clips[0].taskId)
      throw new PipelineError(
        "VIDEO_NOT_FOUND",
        "There is no generated footage to review.",
        404,
      );
    const manifest = structuredClone(saved),
      clip = manifest.clips[0];
    if (options.derivative) {
      const derivative = options.derivative,
        raw = clip.asset!;
      const crop = derivative.processing.crop;
      if (
        !options.approved ||
        derivative.processing.sourceAssetKey !== raw.key ||
        derivative.processing.sourceSha256 !== raw.sha256 ||
        crop.x + crop.width > derivative.processing.sourceWidth ||
        crop.y + crop.height > derivative.processing.sourceHeight ||
        derivative.width !== crop.width ||
        derivative.height !== crop.height ||
        derivative.durationSeconds < 4 ||
        derivative.durationSeconds > 6 ||
        derivative.bytes.length < 16 ||
        Buffer.from(derivative.bytes.subarray(4, 8)).toString("ascii") !==
          "ftyp"
      )
        throw new PipelineError(
          "VIDEO_DERIVATIVE_INVALID",
          "The reviewed derivative must preserve the stored source provenance and declared crop.",
          422,
        );
      const sha256 = hash(derivative.bytes),
        key = VideoStore.assetKey(date, storyId, clip.id, sha256);
      await deps.store.saveAsset(key, {
        bytes: derivative.bytes,
        contentType: "video/mp4",
      });
      clip.asset = {
        key,
        url: videoPath(date, storyId, clip.id),
        contentType: "video/mp4",
        bytes: derivative.bytes.length,
        sha256,
        cachedAt: deps.now().toISOString(),
        width: derivative.width,
        height: derivative.height,
        durationSeconds: derivative.durationSeconds,
        processing: derivative.processing,
      };
    }
    manifest.review = {
      status: options.approved ? "approved" : "rejected",
      notes: options.notes.trim(),
      reviewedAt: deps.now().toISOString(),
    };
    manifest.status = options.approved ? "ready" : "failed";
    clip.status = manifest.status;
    if (options.approved) delete clip.error;
    else
      clip.error = {
        code: "VIDEO_VISUAL_REVIEW_FAILED",
        message:
          "The generated clip did not pass visual review. The original illustration remains available.",
      };
    manifest.updatedAt = deps.now().toISOString();
    await deps.store.saveManifest(manifest);
    return manifest;
  } finally {
    await release();
  }
}
