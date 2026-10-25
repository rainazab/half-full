import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  activeStory,
  audioMayContinue,
  shouldComplete,
  storyAnchor,
} from "../lib/feed";
import {
  layerFrame,
  motionProgress,
  sceneProgressFromAudio,
  SceneMotionError,
  validateSceneMotion,
  type SceneMotion,
} from "../lib/scene-motion";
import {
  parseStoryboardManifest,
  type StoryboardManifest,
} from "../lib/storyboard";
import { parseEdition } from "../lib/edition-schema";
import { validateMotionPlan } from "../lib/motion-plan";

test("the reading band picks the lowest intersecting story and holds steady otherwise", () => {
  assert.equal(activeStory(0, new Set([0]), 4), 0);
  assert.equal(activeStory(0, new Set([0, 1]), 4), 1);
  // Nothing crossing the band keeps the current story: no flicker between stories.
  assert.equal(activeStory(2, new Set(), 4), 2);
  assert.equal(activeStory(3, new Set([4]), 4), 4);
  assert.equal(activeStory(9, new Set(), 4), 4);
  assert.equal(storyAnchor(0), "story-1");
});
test("completion fires only when the ending is genuinely on screen, and only once", () => {
  assert.equal(shouldComplete(false, 0, 4), false);
  assert.equal(shouldComplete(false, 0.3, 4), false);
  assert.equal(shouldComplete(false, 0.6, 4), true);
  assert.equal(shouldComplete(true, 1, 4), false);
  assert.equal(shouldComplete(false, 1, 0), false);
});
test("narration keeps playing one story away and pauses further down the feed", () => {
  assert.ok(audioMayContinue(1, 1));
  assert.ok(audioMayContinue(1, 2));
  assert.ok(!audioMayContinue(1, 3));
  assert.ok(!audioMayContinue(4, 1));
});
const animation: SceneMotion = {
  version: "scene-motion/1",
  durationSeconds: 8,
  layers: [
    {
      id: "route",
      kind: "path",
      color: "ink",
      x: 0.5,
      y: 0.6,
      width: 0.05,
      points: [
        { x: 0.1, y: 0.7 },
        { x: 0.5, y: 0.6 },
        { x: 0.9, y: 0.65 },
      ],
      label: "Bus route",
      explains: "The route the service follows",
      motions: [{ type: "draw", start: 0.05, duration: 0.5 }],
    },
    {
      id: "bus",
      kind: "icon",
      icon: "bus",
      color: "butter",
      x: 0.1,
      y: 0.7,
      width: 0.18,
      points: [
        { x: 0.1, y: 0.7 },
        { x: 0.5, y: 0.6 },
        { x: 0.9, y: 0.65 },
      ],
      label: "A bus",
      explains: "The bus travels the route",
      motions: [
        { type: "fade", start: 0, duration: 0.1 },
        { type: "path", start: 0.1, duration: 0.6 },
      ],
    },
    {
      id: "clock",
      kind: "icon",
      icon: "clock",
      color: "sky",
      x: 0.8,
      y: 0.25,
      width: 0.14,
      label: "A clock",
      explains: "How often the service runs",
      motions: [{ type: "enter-bottom", start: 0.7, duration: 0.25 }],
    },
  ],
};
test("layer frames are deterministic functions of scene progress", () => {
  const bus = animation.layers[1];
  const start = layerFrame(bus, 0);
  assert.equal(start.opacity, 0);
  assert.equal(start.x, 0.1);
  const middle = layerFrame(bus, 0.4);
  assert.equal(middle.opacity, 1);
  assert.ok(middle.x > 0.1 && middle.x < 0.9);
  const end = layerFrame(bus, 1);
  assert.equal(end.x, 0.9);
  assert.equal(end.y, 0.65);
  assert.deepEqual(layerFrame(bus, 0.4), middle);
  const route = layerFrame(animation.layers[0], 0.3);
  assert.ok(route.reveal > 0 && route.reveal < 1);
  assert.equal(layerFrame(animation.layers[0], 1).reveal, 1);
  const clock = layerFrame(animation.layers[2], 0.5);
  assert.equal(clock.opacity, 0);
  assert.ok(layerFrame(animation.layers[2], 0.95).opacity > 0.9);
  assert.equal(
    motionProgress({ type: "fade", start: 0.5, duration: 0.5 }, 0.75),
    0.5,
  );
});
test("scene progress follows the narration clock inside each cue window", () => {
  assert.equal(sceneProgressFromAudio(0, 30, 0, 0.5), 0);
  assert.equal(sceneProgressFromAudio(7.5, 30, 0, 0.5), 0.5);
  assert.equal(sceneProgressFromAudio(20, 30, 0, 0.5), 1);
  assert.equal(sceneProgressFromAudio(22.5, 30, 0.5, 1), 0.5);
  assert.equal(sceneProgressFromAudio(5, 0, 0, 1), 0);
});
test("invalid motion properties are rejected before they can render", () => {
  assert.deepEqual(validateSceneMotion(animation), animation);
  const bad = (
    patch: (copy: SceneMotion) => void,
    pattern: RegExp | typeof SceneMotionError,
  ) => {
    const copy = structuredClone(animation);
    patch(copy);
    assert.throws(() => validateSceneMotion(copy), pattern);
  };
  bad((c) => {
    (c.layers[1] as { icon: string }).icon = "dragon";
  }, SceneMotionError);
  bad((c) => {
    (c.layers[1].motions[0] as { type: string }).type = "explode";
  }, SceneMotionError);
  bad((c) => {
    c.layers[1].x = 1.5;
  }, SceneMotionError);
  bad((c) => {
    c.layers[1].motions[1] = { type: "path", start: 0.8, duration: 0.5 };
  }, /past the end/);
  bad((c) => {
    c.layers[2].motions = [{ type: "draw", start: 0, duration: 0.5 }];
  }, /only routes/);
  bad((c) => {
    c.layers.push({ ...c.layers[2], id: "clock" });
  }, /Duplicate/);
  bad((c) => {
    (c.layers[0] as { kind: string }).kind = "script";
  }, SceneMotionError);
  bad((c) => {
    c.layers = Array.from({ length: 6 }, (_, i) => ({
      ...c.layers[2],
      id: `c${i}`,
      motions: [{ type: "enter-left", start: 0.1, duration: 0.5 }],
    }));
  }, /same time/);
});
test("motion plans stay grounded in the approved copy and keep v1 manifests valid", () => {
  const fixture = parseEdition(
    JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
  );
  const story = fixture.edition.stories[0];
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
        id: "scene-1",
        purpose: "p",
        evidence: [
          {
            sourceId: story.evidence![0].sourceId,
            passageId: story.evidence![0].passageId,
          },
        ],
        subject: "s",
        objects: ["o"],
        setting: "s",
        composition: "c",
        motion: "pan-left",
        cue: "x",
        caption: "c",
        prohibited: [],
        prompt: "A flat pastel scene of a quiet desk with a laptop.",
        alt: "a",
        character: null,
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
  // A v1 manifest without animation still parses, and one with it parses too.
  assert.ok(parseStoryboardManifest(manifest));
  const animated = parseStoryboardManifest({
    ...manifest,
    scenes: [{ ...manifest.scenes[0], animation }],
  });
  assert.ok(animated?.scenes[0].animation);
  const plan = validateMotionPlan(
    { scenes: [{ id: "scene-1", animation }] },
    story,
    manifest,
  );
  assert.ok(plan["scene-1"]);
  assert.throws(
    () =>
      validateMotionPlan(
        { scenes: [{ id: "scene-2", animation }] },
        story,
        manifest,
      ),
    /not a ready scene/,
  );
  const invented = structuredClone(animation);
  invented.layers.push({
    id: "value",
    kind: "value",
    value: "4,000",
    x: 0.5,
    y: 0.2,
    width: 0.2,
    label: "a number",
    explains: "a number",
    motions: [{ type: "count", start: 0, duration: 0.5 }],
  });
  assert.throws(
    () =>
      validateMotionPlan(
        { scenes: [{ id: "scene-1", animation: invented }] },
        story,
        manifest,
      ),
    /absent from the approved copy/,
  );
  assert.throws(
    () =>
      validateMotionPlan(
        {
          scenes: [
            {
              id: "scene-1",
              animation: {
                ...animation,
                layers: [
                  {
                    ...animation.layers[2],
                    kind: "character",
                    character: "hopeful",
                    icon: undefined,
                  },
                ],
              },
            },
          ],
        },
        story,
        { ...manifest, tone: "sober" },
      ),
    /Sober/,
  );
});
