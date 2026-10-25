import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseEdition } from "../lib/edition-schema";
import {
  cueFractions,
  displayableScenes,
  parseStoryboardManifest,
  sceneIndexForFraction,
  STORYBOARD_SCHEMA_VERSION,
  type StoryboardManifest,
} from "../lib/storyboard";
import {
  groundingScore,
  storyIsSober,
  StoryboardValidationError,
  validateStoryboardPlan,
} from "../lib/storyboard-validation";
import { composeArtPrompt } from "../lib/storyboard-prompt";
import { ILLUSTRATION_STYLE } from "../lib/illustration-style";
import {
  createRecraftStyle,
  downloadGeneratedImage,
  generateRecraftImage,
  recraftConfig,
  recraftGenerationBody,
} from "../lib/recraft";
import { narrationFor } from "../lib/narration";
import { IllustrationStore } from "../lib/illustration-store";
import {
  illustrateEdition,
  type IllustrateDependencies,
} from "../lib/illustrate";
import { PipelineError } from "../lib/errors";

const fixture = parseEdition(
  JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
);
const story = fixture.edition.stories[0];
const script = narrationFor(story).script;
const ref = story.evidence![0];
const words = (text: string, count: number) =>
  text.split(/\s+/).slice(0, count).join(" ");
function plan(overrides: Record<string, unknown> = {}) {
  const scene = (
    id: string,
    cue: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    purpose: "Set the subject of the story",
    evidence: [{ sourceId: ref.sourceId, passageId: ref.passageId }],
    subject: "The subject of the approved story",
    objects: ["a laptop", "a padlock"],
    setting: "A quiet desk",
    composition: "Centered, single focal point",
    motion: "pan-left" as const,
    cue,
    caption: words(story.summary, 9),
    prohibited: ["no logos"],
    prompt:
      "Flat pastel scene of a laptop on a quiet desk with a small padlock beside it, calm and simple.",
    alt: "A laptop and a padlock on a desk.",
    character: null as
      "hopeful" | "insightful" | "interesting" | "stressed" | null,
    ...extra,
  });
  return {
    tone: "neutral" as const,
    scenes: [
      scene("scene-1", words(script, 4)),
      scene("scene-2", words(script.split(/\s+/).slice(12).join(" "), 4)),
    ],
    ...overrides,
  };
}
test("only validated, story-grounded plans survive", () => {
  const valid = validateStoryboardPlan(plan(), story, 2);
  assert.equal(valid.scenes.length, 2);
  assert.throws(
    () =>
      validateStoryboardPlan(
        plan({ scenes: plan().scenes.slice(0, 1) }),
        story,
        2,
      ),
    StoryboardValidationError,
  );
  const unknownPassage = plan();
  unknownPassage.scenes[1].evidence = [
    { sourceId: "candidate-x", passageId: "p9" },
  ];
  assert.throws(
    () => validateStoryboardPlan(unknownPassage, story, 2),
    /not retained/,
  );
  const invented = plan();
  invented.scenes[0].caption =
    "Officials confirmed 4,000 arrests in Zanzibar yesterday";
  assert.throws(
    () => validateStoryboardPlan(invented, story, 2),
    /not in the approved copy|unsupported number/,
  );
  const lettering = plan();
  lettering.scenes[0].prompt =
    "A poster with bold text reading the headline on a wall";
  assert.throws(() => validateStoryboardPlan(lettering, story, 2), /forbids/);
  const badCue = plan();
  badCue.scenes[1].cue = "words that are not in the narration at all";
  assert.throws(() => validateStoryboardPlan(badCue, story, 2), /verbatim/);
  const outOfOrder = plan();
  outOfOrder.scenes[1].cue = words(script, 3);
  assert.throws(
    () => validateStoryboardPlan(outOfOrder, story, 2),
    /advance|verbatim/,
  );
  const url = plan();
  url.scenes[0].alt = "See https://example.com";
  assert.throws(() => validateStoryboardPlan(url, story, 2), /URL/);
});
test("sober stories reject playful treatment and characters", () => {
  const sober = {
    ...story,
    headline: "Dozens killed as wildfires spread",
    summary: "Officials said dozens of people were killed as wildfires spread.",
  };
  assert.ok(storyIsSober(sober));
  assert.ok(!storyIsSober(story));
  const playful = plan({ tone: "light" });
  assert.throws(() => validateStoryboardPlan(playful, sober, 2), /sober/);
  const withCharacter = plan({ tone: "sober" });
  withCharacter.scenes[0].character = "hopeful";
  withCharacter.scenes[0].caption = words(sober.summary, 8);
  withCharacter.scenes[1].caption = words(sober.summary, 8);
  assert.throws(
    () => validateStoryboardPlan(withCharacter, sober, 2),
    /characters/,
  );
  assert.ok(
    groundingScore(
      "completely unrelated invented vocabulary here",
      story.summary,
    ) < 0.5,
  );
});
test("scene cues map to narration fractions and playback positions", () => {
  const cues = cueFractions(
    "one two three four five six seven eight nine ten",
    [
      { id: "scene-1", cue: "one two" },
      { id: "scene-2", cue: "six seven" },
      { id: "scene-3", cue: "missing cue" },
    ],
  );
  assert.equal(cues[0].startFraction, 0);
  assert.ok(cues[1].startFraction > 0.4 && cues[1].startFraction < 0.6);
  assert.ok(cues[2].startFraction >= cues[1].startFraction);
  assert.equal(sceneIndexForFraction(cues, 0), 0);
  assert.equal(sceneIndexForFraction(cues, 0.5), 1);
  assert.equal(sceneIndexForFraction(cues, 0.99), 2);
  assert.equal(sceneIndexForFraction(cues, Number.NaN), 0);
  assert.equal(sceneIndexForFraction([], 0.5), 0);
});
test("the Recraft request carries the versioned house style and bounded colour weights", () => {
  const config = recraftConfig({ RECRAFT: "synthetic-key" });
  assert.equal(config.model, "recraftv4_styles");
  assert.throws(() => recraftConfig({}), /not configured/);
  assert.throws(
    () => recraftConfig({ RECRAFT_API_KEY: "k", RECRAFT_STYLE_ID: "nope" }),
    /UUID/,
  );
  const scene = plan().scenes[0];
  const prompt = composeArtPrompt(scene, "neutral");
  assert.ok(prompt.startsWith(ILLUSTRATION_STYLE.promptPrefix));
  assert.ok(prompt.includes("a laptop, a padlock"));
  assert.ok(prompt.includes("no text"));
  const body = recraftGenerationBody(config, {
    prompt,
    styleId: "d88b760a-b7ab-482c-b9d9-ed7de8ea2360",
  });
  assert.equal(body.model, "recraftv4_styles");
  assert.equal(body.style_id, "d88b760a-b7ab-482c-b9d9-ed7de8ea2360");
  assert.equal(body.n, 1);
  assert.equal(body.response_format, "url");
  assert.equal(body.image_format, "webp");
  const total = body.controls.colors.reduce(
    (sum, c) => sum + (c.weight ?? 0),
    0,
  );
  assert.ok(total <= 1, `colour weights total ${total}`);
  assert.throws(
    () => recraftGenerationBody(config, { prompt: "", styleId: "x" }),
    /empty/,
  );
});
test("Recraft responses are parsed, retried once on 429 and never leak provider bodies", async () => {
  const config = recraftConfig({ RECRAFT: "synthetic-key" });
  let calls = 0;
  const image = await generateRecraftImage(
    config,
    { prompt: "a tap", styleId: "s" },
    (async (_url, init) => {
      calls++;
      assert.equal(JSON.parse(String(init?.body)).style_id, "s");
      if (calls === 1)
        return new Response("rate limited secret-body", { status: 429 });
      return Response.json({
        created: 1,
        credits: 35,
        data: [{ image_id: "img-1", url: "https://img.recraft.ai/x" }],
        style_id: "s",
      });
    }) as typeof fetch,
  );
  assert.equal(calls, 2);
  assert.deepEqual(image, {
    url: "https://img.recraft.ai/x",
    imageId: "img-1",
    creditsUsed: 35,
    styleId: "s",
  });
  await assert.rejects(
    generateRecraftImage(
      config,
      { prompt: "a tap", styleId: "s" },
      (async () =>
        new Response(JSON.stringify({ secret: "leaked" }), {
          status: 400,
        })) as typeof fetch,
    ),
    (error: unknown) =>
      error instanceof PipelineError && !error.message.includes("leaked"),
  );
  const style = await createRecraftStyle(
    config,
    [{ name: "a.png", bytes: new Uint8Array(10), type: "image/png" }],
    (async (_url, init) => {
      assert.ok(init?.body instanceof FormData);
      assert.equal((init!.body as FormData).get("style"), null);
      return Response.json({
        id: "0f6f1f1e-1111-4222-8333-444455556666",
        credits: 5,
      });
    }) as typeof fetch,
  );
  assert.equal(style.creditsUsed, 5);
});
test("generated assets are downloaded only from public hosts and must be real images", async () => {
  const webp = new Uint8Array(20);
  webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const ok = await downloadGeneratedImage(
    "https://img.recraft.ai/a",
    (async () =>
      new Response(webp, {
        headers: { "Content-Type": "image/webp" },
      })) as typeof fetch,
    async () => true,
  );
  assert.equal(ok.contentType, "image/webp");
  await assert.rejects(
    downloadGeneratedImage(
      "http://img.recraft.ai/a",
      (async () => new Response(webp)) as typeof fetch,
      async () => true,
    ),
    /public HTTPS/,
  );
  await assert.rejects(
    downloadGeneratedImage(
      "https://10.0.0.1/a",
      (async () => new Response(webp)) as typeof fetch,
      async () => false,
    ),
    /public HTTPS/,
  );
  await assert.rejects(
    downloadGeneratedImage(
      "https://img.recraft.ai/a",
      (async () =>
        new Response("<html>", {
          headers: { "Content-Type": "text/html" },
        })) as typeof fetch,
      async () => true,
    ),
    /supported image/,
  );
});
function memoryStore() {
  return new IllustrationStore(undefined, "test", fetch, true);
}
function dependencies(
  store: IllustrationStore,
  counters: { plans: number; images: number; downloads: number },
  planOverrides: Record<string, unknown> = {},
): IllustrateDependencies {
  return {
    store,
    getEdition: async () => fixture,
    planner: () => async () => {
      counters.plans++;
      return {
        plan: validateStoryboardPlan(plan(planOverrides), story, 2),
        calls: 1,
        model: "test-model",
      };
    },
    recraft: () => ({
      apiKey: "k",
      model: "recraftv4_styles",
      baseUrl: "https://example.invalid",
    }),
    generate: async (_config, request) => {
      counters.images++;
      assert.ok(request.prompt.includes("no text"));
      return {
        url: `https://img.recraft.ai/${counters.images}`,
        imageId: `img-${counters.images}`,
        creditsUsed: 35,
      };
    },
    download: async () => {
      counters.downloads++;
      return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" };
    },
    createStyle: async () => ({
      id: "0f6f1f1e-1111-4222-8333-444455556666",
      creditsUsed: 5,
    }),
    readReference: async () => new Uint8Array([0]),
    now: () => new Date("2026-10-24T20:00:00.000Z"),
  };
}
const limits = {
  scenesPerStory: 2 as const,
  maxScenesPerEdition: 10,
  dailyImageBudget: 24,
  concurrency: 2,
  enabled: true,
};
test("illustrating a published edition plans once, generates bounded scenes and reuses assets", async () => {
  const store = memoryStore();
  const counters = { plans: 0, images: 0, downloads: 0 };
  const deps = dependencies(store, counters);
  const first = await illustrateEdition(
    "2026-10-24",
    { storyIds: [story.id] },
    deps,
    limits,
  );
  assert.equal(first.styleCreated, true);
  assert.equal(first.imageCalls, 2);
  assert.equal(first.creditsUsed, 70);
  const manifest = first.storyboards[story.id];
  assert.equal(manifest.status, "ready");
  assert.equal(manifest.styleVersion, ILLUSTRATION_STYLE.version);
  assert.equal(manifest.schemaVersion, STORYBOARD_SCHEMA_VERSION);
  assert.equal(displayableScenes(manifest).length, 2);
  assert.ok(parseStoryboardManifest(JSON.parse(JSON.stringify(manifest))));
  assert.ok(await store.getAsset(manifest.scenes[0].asset!.key));
  // A repeated request spends nothing.
  const again = await illustrateEdition(
    "2026-10-24",
    { storyIds: [story.id] },
    deps,
    limits,
  );
  assert.equal(again.imageCalls, 0);
  assert.equal(counters.plans, 1);
  assert.equal(again.skipped[0].reason, "Illustrations already exist; reused.");
  // The edition record itself is untouched.
  assert.deepEqual(await deps.getEdition("2026-10-24"), fixture);
});
test("budgets, concurrent locks and provider failures never block the edition", async () => {
  const store = memoryStore();
  const counters = { plans: 0, images: 0, downloads: 0 };
  const deps = dependencies(store, counters);
  const capped = await illustrateEdition(
    "2026-10-24",
    { storyIds: [story.id], maxImages: 1 },
    deps,
    limits,
  );
  assert.equal(capped.imageCalls, 1);
  assert.equal(capped.storyboards[story.id].status, "partial");
  assert.match(capped.storyboards[story.id].scenes[1].error ?? "", /budget/);
  // The repair generates only the missing scene.
  const repaired = await illustrateEdition(
    "2026-10-24",
    { storyIds: [story.id] },
    deps,
    limits,
  );
  assert.equal(repaired.imageCalls, 1);
  assert.equal(repaired.storyboards[story.id].status, "ready");
  assert.equal(counters.plans, 1);
  // Daily budget exhausted: no paid calls, clear reason.
  const spent = memoryStore();
  await spent.recordImages(24);
  const blocked = await illustrateEdition(
    "2026-10-24",
    { storyIds: [story.id] },
    dependencies(spent, counters),
    limits,
  );
  assert.equal(blocked.storyboards[story.id].status, "failed");
  assert.match(blocked.storyboards[story.id].scenes[0].error ?? "", /budget/);
  // Concurrent generation for the same date is refused, not duplicated.
  const locked = memoryStore();
  const release = await locked.lock("2026-10-24");
  await assert.rejects(
    illustrateEdition("2026-10-24", {}, dependencies(locked, counters), limits),
    /already being generated/,
  );
  await release();
  // Provider failure is recorded per scene; the manifest reports it and the edition stays readable.
  const failing = dependencies(memoryStore(), counters);
  failing.generate = async () => {
    throw new PipelineError("RECRAFT_API_ERROR", "HTTP 503", 502);
  };
  const failed = await illustrateEdition(
    "2026-10-24",
    { storyIds: [story.id] },
    failing,
    limits,
  );
  assert.equal(failed.storyboards[story.id].status, "failed");
  assert.equal(displayableScenes(failed.storyboards[story.id]).length, 0);
  await assert.rejects(
    illustrateEdition("2026-10-24", {}, dependencies(memoryStore(), counters), {
      ...limits,
      enabled: false,
    }),
    /disabled/,
  );
  await assert.rejects(
    illustrateEdition(
      "2026-01-01",
      {},
      {
        ...dependencies(memoryStore(), counters),
        getEdition: async () => null,
      },
      limits,
    ),
    /published edition/,
  );
});
test("manifests reject tampering and the store sanitises keys", async () => {
  const store = memoryStore();
  assert.equal(
    IllustrationStore.styleKey("half-full-style/1"),
    "STYLE-half-full-style_1",
  );
  await store.saveStyle("half-full-style/1", {
    id: "abc",
    createdAt: "x",
    references: [],
  });
  assert.equal((await store.getStyle("half-full-style/1"))?.id, "abc");
  assert.equal(await store.getAsset("../etc/passwd"), null);
  const manifest: StoryboardManifest = {
    schemaVersion: 1,
    styleVersion: "half-full-style/1",
    date: "2026-10-24",
    editionId: "e",
    storyId: story.id,
    status: "ready",
    tone: "neutral",
    promptHash: "a".repeat(64),
    plannedAt: "2026-10-24T20:00:00.000Z",
    updatedAt: "2026-10-24T20:00:00.000Z",
    provider: { name: "Recraft", model: "recraftv4_styles", planner: "m" },
    narration: {
      scriptHash: "b".repeat(64),
      model: "character-proportional",
      cues: [{ sceneId: "scene-1", startFraction: 0 }],
    },
    scenes: [
      {
        ...plan().scenes[0],
        status: "ready",
        asset: {
          key: "ASSET-x",
          contentType: "image/webp",
          bytes: 3,
          promptHash: "c".repeat(64),
          generatedAt: "2026-10-24T20:00:00.000Z",
        },
      },
    ],
    usage: { imageCalls: 1, plannerCalls: 1 },
  };
  assert.ok(parseStoryboardManifest(manifest));
  assert.equal(
    parseStoryboardManifest({
      ...manifest,
      scenes: [{ ...manifest.scenes[0], prompt: "x".repeat(5000) }],
    }),
    null,
  );
  assert.equal(
    parseStoryboardManifest({
      ...manifest,
      provider: { ...manifest.provider, name: "Other" },
    }),
    null,
  );
});
