import assert from "node:assert/strict";
import test from "node:test";
import {
  FLICK_VELOCITY,
  neighbourStyle,
  pageOffset,
  progressLabel,
  resolveSwipe,
} from "../lib/deck";
import {
  AUTHORED_SCENES,
  authoredScene,
  authoredSceneKey,
} from "../lib/authored-scenes";

const width = 390;
test("a committed swipe needs real travel or a fast flick; short drags spring back", () => {
  const base = { width, index: 1, count: 5 };
  assert.equal(resolveSwipe({ ...base, offset: -40, velocity: 0 }), 1);
  assert.equal(resolveSwipe({ ...base, offset: -120, velocity: 0 }), 2);
  assert.equal(resolveSwipe({ ...base, offset: 120, velocity: 0 }), 0);
  // 28% of the width is the long-drag threshold (109 px here).
  assert.equal(resolveSwipe({ ...base, offset: -108, velocity: 0 }), 1);
  assert.equal(resolveSwipe({ ...base, offset: -110, velocity: 0 }), 2);
  // A flick commits with little travel, but not from a near-stationary finger.
  assert.equal(
    resolveSwipe({ ...base, offset: -30, velocity: -FLICK_VELOCITY }),
    2,
  );
  assert.equal(
    resolveSwipe({ ...base, offset: 30, velocity: FLICK_VELOCITY }),
    0,
  );
  assert.equal(resolveSwipe({ ...base, offset: -10, velocity: -2000 }), 1);
  // A flick opposing the drag direction does not win.
  assert.equal(resolveSwipe({ ...base, offset: -60, velocity: 900 }), 0);
});
test("edges resist instead of overshooting, and the deck is finite", () => {
  assert.equal(
    resolveSwipe({ offset: 300, velocity: 2000, width, index: 0, count: 5 }),
    0,
  );
  assert.equal(
    resolveSwipe({ offset: -300, velocity: -2000, width, index: 4, count: 5 }),
    4,
  );
  assert.equal(
    resolveSwipe({ offset: -300, velocity: 0, width, index: 0, count: 0 }),
    0,
  );
  assert.equal(pageOffset(3, width), -1170);
  assert.equal(progressLabel(2, 4), "3 of 4");
  assert.equal(progressLabel(4, 4), "Complete · 4 stories");
});
test("neighbouring pages preview subtly and the current page is full size", () => {
  assert.deepEqual(neighbourStyle(-390, 1, width), { scale: 1, opacity: 1 });
  const half = neighbourStyle(-195, 1, width);
  assert.ok(half.scale < 1 && half.scale > 0.96);
  assert.ok(half.opacity < 1 && half.opacity > 0.8);
  const far = neighbourStyle(0, 3, width);
  assert.equal(far.scale, 0.94);
  assert.deepEqual(neighbourStyle(0, 0, 0), { scale: 1, opacity: 1 });
});
test("authored scenes are registered per story and scene with grounded legends", () => {
  const key = authoredSceneKey("candidate-e4906bdb2f8476ad", "scene-2");
  const scene = AUTHORED_SCENES[key];
  assert.ok(scene);
  assert.equal(scene.durationSeconds, 13);
  assert.ok(scene.explains.some((line) => /pyrite/.test(line)));
  assert.equal(
    authoredScene("candidate-e4906bdb2f8476ad", "scene-1")?.usesBackground,
    true,
  );
  assert.equal(authoredScene("unknown", "scene-1"), undefined);
});
