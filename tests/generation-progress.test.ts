import test from "node:test";
import assert from "node:assert/strict";
import { generationProgress, mergeRunLogs } from "../lib/generation-progress";
import type { RunLogEntry } from "../lib/types";
const now = Date.parse("2026-10-24T12:00:00Z");
const entry = (step: string, seconds = 0): RunLogEntry => ({
  step,
  status: "started",
  message: "Test event",
  timestamp: new Date(now + seconds * 1000).toISOString(),
});
test("estimated progress is capped within actual stages and never completes on a timer", () => {
  const start = entry("apify.start");
  assert.equal(generationProgress([start], now).percent, 5);
  assert.ok(generationProgress([start], now + 60000).percent > 5);
  assert.ok(generationProgress([start], now + 3600000).percent <= 68);
  const logs = [
    start,
    entry("anthropic.review", 100),
    entry("apify.child", 101),
  ];
  assert.equal(
    generationProgress(logs, now + 100000).label,
    "Selecting stories",
  );
  assert.ok(
    generationProgress([entry("archive.save")], now + 3600000).percent < 100,
  );
  assert.equal(generationProgress(logs, now, true).percent, 100);
});
test("checkpoint events deduplicate with streaming events and remain chronological", () => {
  const a = entry("apify.start"),
    b = entry("anthropic.review", 100);
  assert.deepEqual(mergeRunLogs([b, a], [a, b]), [a, b]);
  assert.equal(
    generationProgress([{ ...b, status: "failed" }], now).percent,
    1,
  );
});
