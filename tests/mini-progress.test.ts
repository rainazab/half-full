import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanTimer,
  elapsedMs,
  formatClock,
  idleTimer,
  pauseTimer,
  startTimer,
} from "../lib/mini-timer";
import {
  bestTime,
  cleanRecords,
  emptyRecords,
  recordSolve,
} from "../lib/mini-records";

test("the Mini clock accumulates only while running and survives pause/resume", () => {
  let state = idleTimer();
  assert.equal(elapsedMs(state, 1000), 0);
  state = startTimer(state, 1000);
  assert.equal(startTimer(state, 2000), state);
  assert.equal(elapsedMs(state, 4000), 3000);
  state = pauseTimer(state, 4000);
  assert.deepEqual(state, { elapsedMs: 3000, runningSince: null });
  assert.equal(elapsedMs(state, 90000), 3000);
  assert.equal(pauseTimer(state, 90000), state);
  state = startTimer(state, 10000);
  assert.equal(elapsedMs(state, 12500), 5500);
  assert.equal(formatClock(elapsedMs(state, 12500)), "0:05");
  assert.equal(formatClock(102000), "1:42");
  assert.equal(formatClock(-5), "0:00");
});
test("a persisted clock never resumes from a stale running span", () => {
  assert.deepEqual(cleanTimer({ elapsedMs: 4200, runningSince: 1 }), {
    elapsedMs: 4200,
    runningSince: null,
  });
  assert.deepEqual(cleanTimer({ elapsedMs: -3 }), idleTimer());
  assert.deepEqual(cleanTimer("junk"), idleTimer());
  assert.equal(cleanTimer({ elapsedMs: 1e12 }).elapsedMs, 24 * 3600000);
});
test("first completion celebrates without inventing a record", () => {
  const first = recordSolve(emptyRecords(), {
    puzzleId: "live:mini-v1-2026-10-24-web",
    date: "2026-10-24",
    ms: 102000,
    assisted: false,
    completedAt: "2026-10-24T20:00:00.000Z",
  });
  assert.equal(first.first, true);
  assert.equal(first.personalBest, false);
  assert.equal(first.records.solves.length, 1);
  assert.match(first.message, /first Brain Break/);
  assert.doesNotMatch(first.message, /quickest/);
});
test("personal bests compare only against earlier solves of the same kind", () => {
  let records = emptyRecords();
  const solve = (puzzleId: string, ms: number, assisted: boolean) =>
    recordSolve(records, {
      puzzleId,
      date: "2026-10-24",
      ms,
      assisted,
      completedAt: "2026-10-24T20:00:00.000Z",
    });
  records = solve("a", 120000, false).records;
  const slower = solve("b", 150000, false);
  assert.equal(slower.personalBest, false);
  assert.equal(slower.message, "Solved.");
  records = slower.records;
  const faster = solve("c", 95000, false);
  assert.equal(faster.personalBest, true);
  assert.equal(faster.message, "Your quickest one yet!");
  records = faster.records;
  // A quick assisted solve does not beat the unassisted record.
  const assisted = solve("d", 30000, true);
  assert.equal(assisted.first, true);
  assert.equal(assisted.personalBest, false);
  records = assisted.records;
  assert.equal(bestTime(records, false), 95000);
  assert.equal(bestTime(records, true), 30000);
  const assistedBest = solve("e", 20000, true);
  assert.equal(assistedBest.personalBest, true);
  assert.match(assistedBest.message, /assisted/);
});
test("a solved puzzle is recorded once; repeats never change records", () => {
  const first = recordSolve(emptyRecords(), {
    puzzleId: "same",
    date: "2026-10-24",
    ms: 50000,
    assisted: false,
    completedAt: "2026-10-24T20:00:00.000Z",
  });
  const repeat = recordSolve(first.records, {
    puzzleId: "same",
    date: "2026-10-24",
    ms: 10,
    assisted: false,
    completedAt: "2026-10-24T20:01:00.000Z",
  });
  assert.deepEqual(repeat.records, first.records);
  assert.equal(repeat.personalBest, false);
  assert.equal(repeat.first, false);
});
test("stored records drop malformed rows and stay bounded", () => {
  const cleaned = cleanRecords({
    solves: [
      {
        puzzleId: "ok",
        date: "2026-10-24",
        ms: 1,
        assisted: false,
        completedAt: "x",
      },
      {
        puzzleId: "bad date",
        date: "today",
        ms: 1,
        assisted: false,
        completedAt: "x",
      },
      {
        puzzleId: "neg",
        date: "2026-10-24",
        ms: -1,
        assisted: false,
        completedAt: "x",
      },
      null,
    ],
  });
  assert.equal(cleaned.solves.length, 1);
  assert.deepEqual(cleanRecords(undefined), emptyRecords());
  const many = cleanRecords({
    solves: Array.from({ length: 600 }, (_, i) => ({
      puzzleId: `p${i}`,
      date: "2026-10-24",
      ms: i,
      assisted: false,
      completedAt: "x",
    })),
  });
  assert.equal(many.solves.length, 500);
});
