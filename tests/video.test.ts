import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEdition } from "../lib/edition-schema";
import { narrationFor } from "../lib/narration";
import {
  runwayBody,
  runwayConfig,
  submitRunway,
  downloadRunwayVideo,
} from "../lib/runway";
import {
  prepareVideo,
  submitVideo,
  pollVideo,
  reviewVideo,
} from "../lib/video-generation";
import { VideoStore } from "../lib/video-store";
import {
  parseVideoManifest,
  videoResponse,
  videoTimeForNarration,
} from "../lib/video";
import type { StoryboardManifest } from "../lib/storyboard";
import { validateVideoMotionDraft, planVideoMotion } from "../lib/video-plan";

Object.assign(process.env, { NODE_ENV: "test" });
const edition = parseEdition(
  JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
);
const story = edition.edition.stories[0],
  reference = story.evidence![0];
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const taskId = "17f20503-6c24-4c16-946b-35dbbce2af2f";
const request = {
  date: "2026-10-24",
  storyId: story.id,
  sceneId: "scene-1",
  ratio: "1104:832" as const,
  prompt:
    "The existing water flows gently toward the lake. Preserve the illustrated artwork, no labels or new objects.",
};
const mp4 = new Uint8Array([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 109, 112, 52,
  49,
]);
function fixture() {
  const store = new VideoStore(undefined, "unit-video", fetch, true);
  const storyboard = {
    schemaVersion: 1,
    date: request.date,
    editionId: edition.edition.id,
    storyId: story.id,
    status: "ready",
    tone: "neutral",
    styleVersion: "test",
    promptHash: "a".repeat(64),
    plannedAt: "2026-10-24T20:00:00Z",
    updatedAt: "2026-10-24T20:00:00Z",
    provider: { name: "Recraft", model: "recraftv4_styles", planner: "claude" },
    narration: {
      scriptHash: digest(narrationFor(story).script),
      model: "character-proportional",
      cues: [{ sceneId: "scene-1", startFraction: 0 }],
    },
    scenes: [
      {
        id: "scene-1",
        purpose: "Explain the approved report",
        subject: "The subject",
        objects: ["water"],
        setting: "A simple scene",
        composition: "Centered",
        motion: "still",
        cue: "The",
        caption: "A supported illustration",
        prohibited: ["no labels"],
        prompt: "An original illustrated scene with a subject and water",
        alt: "An original illustrated scene.",
        character: null,
        evidence: [
          { sourceId: reference.sourceId, passageId: reference.passageId },
        ],
        status: "ready",
        asset: {
          key: "ASSET-test",
          promptHash: "b".repeat(64),
          generatedAt: "2026-10-24T20:00:00Z",
          bytes: 10,
          contentType: "image/webp",
        },
      },
    ],
    usage: { imageCalls: 1, plannerCalls: 1 },
  } satisfies StoryboardManifest;
  let submissions = 0,
    polls = 0;
  const deps: NonNullable<Parameters<typeof prepareVideo>[1]> = {
    store,
    getEdition: async () => edition,
    getStoryboard: async () => storyboard,
    getImage: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    }),
    config: () => ({ apiKey: "not-real" }),
    submit: async () => {
      submissions++;
      assert.equal(
        (await store.getManifest(request.date, story.id))?.status,
        "preparing",
      );
      return { id: taskId, estimatedCredits: 25 };
    },
    poll: async () => {
      polls++;
      return {
        id: taskId,
        status: "SUCCEEDED",
        output: [
          "https://example.org/result.mp4?private-signed-token=not-stored",
        ],
      };
    },
    download: async () => ({ bytes: mp4, contentType: "video/mp4" }),
    now: () => new Date("2026-10-24T21:00:00Z"),
  };
  return {
    store,
    storyboard,
    deps,
    submissions: () => submissions,
    polls: () => polls,
  };
}
test("Runway uses the verified five-second contract and never retries a task POST", async () => {
  assert.throws(() => runwayConfig({}), /unavailable/);
  const body = runwayBody({
    image: new Uint8Array([1, 2]),
    contentType: "image/webp",
    prompt: request.prompt,
    ratio: request.ratio,
  });
  assert.equal(body.model, "gen4_turbo");
  assert.equal(body.duration, 5);
  assert.equal(body.promptImage, "data:image/webp;base64,AQI=");
  let calls = 0;
  await assert.rejects(
    submitRunway(
      { apiKey: "test-secret-never-in-error" },
      {
        image: new Uint8Array([1]),
        contentType: "image/webp",
        prompt: request.prompt,
        ratio: request.ratio,
      },
      (async (_url, init) => {
        calls++;
        assert.equal(
          (init?.headers as Record<string, string>)["X-Runway-Version"],
          "2024-11-06",
        );
        throw Error("provider echoed test-secret-never-in-error");
      }) as typeof fetch,
    ),
    (error) =>
      error instanceof Error &&
      !error.message.includes("test-secret-never-in-error") &&
      /No automatic retry/.test(error.message),
  );
  assert.equal(calls, 1);
});
test("video preparation requires an approved story and exact retained keyframe references", async () => {
  const f = fixture();
  const prepared = await prepareVideo(request, f.deps);
  assert.equal(prepared.manifest.narration.mapping, "authored-loop");
  assert.equal(prepared.manifest.clips[0].source.assetKey, "ASSET-test");
  assert.equal(f.submissions(), 0);
  f.storyboard.scenes[0].evidence[0].passageId = "invented";
  await assert.rejects(prepareVideo(request, f.deps), /retained evidence/);
  const g = fixture();
  g.storyboard.narration.scriptHash = "0".repeat(64);
  await assert.rejects(prepareVideo(request, g.deps), /narration/);
  await assert.rejects(
    prepareVideo({ ...request, storyId: "missing-story" }, f.deps),
    /evidence-approved/,
  );
});
test("one reserved task is reused, polled, and durably cached without rewriting editions", async () => {
  const f = fixture(),
    before = JSON.stringify(edition);
  await assert.rejects(
    submitVideo(request, { maxCredits: NaN }, f.deps),
    /authorize/,
  );
  const submitted = await submitVideo(request, { maxCredits: 25 }, f.deps);
  assert.equal(submitted.status, "pending");
  assert.equal(submitted.clips[0].taskId, taskId);
  assert.equal(submitted.clips[0].cost.providerEstimatedCredits, 25);
  await submitVideo(request, { maxCredits: 25 }, f.deps);
  assert.equal(f.submissions(), 1);
  const pendingReview = await pollVideo(request.date, story.id, f.deps);
  assert.equal(pendingReview.status, "processing");
  assert.equal(pendingReview.review?.status, "pending");
  await pollVideo(request.date, story.id, f.deps);
  assert.equal(f.polls(), 1);
  const result = await reviewVideo(
    request.date,
    story.id,
    {
      approved: true,
      notes:
        "All decoded frames preserve the original scene without invented labels.",
    },
    f.deps,
  );
  assert.equal(result.status, "ready");
  assert.deepEqual(
    (await f.store.getAsset(result.clips[0].asset!.key))!.bytes,
    mp4,
  );
  assert.equal(result.clips[0].asset!.bytes, mp4.length);
  assert.ok(!JSON.stringify(result).includes("private-signed-token"));
  await pollVideo(request.date, story.id, f.deps);
  assert.equal(f.polls(), 1);
  assert.equal(JSON.stringify(edition), before);
});
test("ambiguous submissions remain blocked and do not automatically spend again", async () => {
  const f = fixture();
  let count = 0;
  f.deps.submit = async () => {
    count++;
    const { PipelineError } = await import("../lib/errors");
    throw new PipelineError(
      "VIDEO_PROVIDER_UNREACHABLE",
      "No automatic retry was made.",
      504,
    );
  };
  const result = await submitVideo(request, { maxCredits: 25 }, f.deps);
  assert.equal(result.status, "preparing");
  assert.ok(!result.clips[0].taskId);
  await submitVideo(request, { maxCredits: 25, retry: true }, f.deps);
  assert.equal(count, 1);
});
test("video daily reservation is bounded, including failed attempts", async () => {
  const store = new VideoStore(undefined, "budget-video", fetch, true);
  await store.reserve("2026-10-24", 25, 50);
  await store.reserve("2026-10-24", 25, 50);
  await assert.rejects(store.reserve("2026-10-24", 25, 50), /limit/);
  assert.equal((await store.reserve("2026-10-25", 25, 50)).attempts, 1);
});
test("a single explicit failed-task retry retains the first task and stops at two attempts", async () => {
  const f = fixture();
  f.deps.poll = async () => ({
    id: taskId,
    status: "FAILED",
    failureCode: "INTERNAL.BAD_OUTPUT.CODE01",
  });
  await submitVideo(request, { maxCredits: 25 }, f.deps);
  await pollVideo(request.date, story.id, f.deps);
  const second = await submitVideo(
    {
      ...request,
      prompt:
        "Preserve this illustration exactly. Only the existing water ripples gently.",
    },
    { maxCredits: 25, retry: true },
    f.deps,
  );
  assert.equal(second.clips[0].attempt, 2);
  assert.equal(second.previousAttempts?.[0].taskId, taskId);
  assert.equal(second.previousAttempts?.[0].status, "failed");
  assert.equal(
    second.previousAttempts?.[0].error?.code,
    "VIDEO_GENERATION_FAILED",
  );
  await pollVideo(request.date, story.id, f.deps);
  await assert.rejects(
    submitVideo(request, { maxCredits: 25, retry: true }, f.deps),
    /two-attempt/,
  );
  assert.equal(f.submissions(), 2);
});
test("video downloader rejects private hosts and invalid MP4s, with bounded public download", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(mp4, { headers: { "content-type": "video/mp4" } });
  }) as typeof fetch;
  await assert.rejects(
    downloadRunwayVideo(
      "https://localhost/private",
      fetcher,
      async () => false,
    ),
    /public HTTPS/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    downloadRunwayVideo(
      "https://example.org/not-video",
      (async () =>
        new Response("not a video", {
          headers: { "content-type": "video/mp4" },
        })) as typeof fetch,
      async () => true,
    ),
    /MP4 container/,
  );
  const result = await downloadRunwayVideo(
    "https://example.org/video.mp4",
    fetcher,
    async () => true,
  );
  assert.deepEqual(result.bytes, mp4);
});
test("video manifest requires a real task and cached MP4 before ready, and serves safe ranges", async () => {
  const f = fixture(),
    { manifest } = await prepareVideo(request, f.deps);
  const broken = structuredClone(manifest);
  broken.status = "ready";
  broken.clips[0].status = "ready";
  assert.equal(parseVideoManifest(broken), null);
  assert.equal(videoTimeForNarration(13.5), 3.5);
  assert.equal(videoTimeForNarration(NaN), 0);
  const response = videoResponse(mp4, "bytes=0-3");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-3/20");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    mp4.slice(0, 4),
  );
  assert.equal(videoResponse(mp4, "bytes=-4").status, 206);
  assert.equal(videoResponse(mp4, "bytes=-0").status, 416);
  assert.equal(videoResponse(mp4, "bytes=500-600").status, 416);
  assert.equal(videoResponse(mp4, "bytes=0-1,5-6").status, 416);
});
test("Claude motion choices cannot add objects, numbers, claims, sources or incompatible actions", () => {
  const f = fixture();
  const draft = {
    sceneId: "scene-1",
    evidence: [
      { sourceId: reference.sourceId, passageId: reference.passageId },
    ],
    motions: [
      {
        object: "water",
        action: "flow",
        explanationQuote: f.storyboard.scenes[0].caption,
      },
    ],
  };
  const valid = validateVideoMotionDraft(draft, story, f.storyboard, "scene-1");
  assert.match(valid.prompt, /existing water/);
  for (const altered of [
    { ...draft, motions: [{ ...draft.motions[0], object: "new factory" }] },
    { ...draft, motions: [{ ...draft.motions[0], action: "rotate" }] },
    {
      ...draft,
      motions: [
        {
          ...draft.motions[0],
          explanationQuote: "The water is safe to drink again.",
        },
      ],
    },
    { ...draft, evidence: [{ sourceId: "invented", passageId: "p99" }] },
    { ...draft, sceneId: "scene-3" },
  ])
    assert.throws(
      () => validateVideoMotionDraft(altered, story, f.storyboard, "scene-1"),
      /motion|Motion/,
    );
});
test("operator Claude planning reuses durable plans and bounds paid planner calls separately", async () => {
  const f = fixture();
  let calls = 0;
  const deps: NonNullable<Parameters<typeof planVideoMotion>[4]> = {
    store: f.store,
    getEdition: f.deps.getEdition,
    getStoryboard: f.deps.getStoryboard,
    now: f.deps.now,
    planner: () => async () => {
      calls++;
      return {
        raw: {
          sceneId: "scene-1",
          evidence: [
            { sourceId: reference.sourceId, passageId: reference.passageId },
          ],
          motions: [
            {
              object: "water",
              action: "ripple",
              explanationQuote: f.storyboard.scenes[0].caption,
            },
          ],
        },
        model: "claude-test",
        requestId: "msg_test",
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  };
  const result = await planVideoMotion(
    request.date,
    story.id,
    "scene-1",
    false,
    deps,
  );
  assert.equal(result.provider.name, "Claude");
  assert.equal(result.usage.calls, 1);
  assert.equal(result.source.keyframePromptHash, "b".repeat(64));
  await planVideoMotion(request.date, story.id, "scene-1", false, deps);
  assert.equal(calls, 1);
  assert.equal(f.submissions(), 0);
  for (let i = 0; i < 3; i++)
    await planVideoMotion(request.date, story.id, "scene-1", true, deps);
  await assert.rejects(
    planVideoMotion(request.date, story.id, "scene-1", true, deps),
    /four-call/,
  );
  assert.equal(calls, 4);
});
test("unreviewed provider success is withheld and derivative provenance cannot be substituted", async () => {
  const f = fixture();
  await submitVideo(request, { maxCredits: 25 }, f.deps);
  const result = await pollVideo(request.date, story.id, f.deps);
  assert.equal(result.status, "processing");
  await assert.rejects(
    reviewVideo(
      request.date,
      story.id,
      { approved: true, notes: "ok" },
      f.deps,
    ),
    /review/,
  );
  await assert.rejects(
    reviewVideo(
      request.date,
      story.id,
      {
        approved: true,
        notes: "The visual was reviewed carefully.",
        derivative: {
          bytes: mp4,
          width: 1104,
          height: 640,
          durationSeconds: 5,
          processing: {
            kind: "crop-margins",
            sourceAssetKey: result.clips[0].asset!.key,
            sourceSha256: "0".repeat(64),
            sourceWidth: 1104,
            sourceHeight: 832,
            crop: { x: 0, y: 100, width: 1104, height: 640 },
            tool: "AVFoundation H.264 export",
          },
        },
      },
      f.deps,
    ),
    /provenance/,
  );
  const rejected = await reviewVideo(
    request.date,
    story.id,
    { approved: false, notes: "Generated labels intrude on the illustration." },
    f.deps,
  );
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.review?.status, "rejected");
  assert.ok(rejected.clips[0].asset);
});
