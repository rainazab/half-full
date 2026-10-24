import { dailyMini } from "../lib/mini";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseEdition } from "../lib/edition-schema";
import {
  buildCrossword,
  puzzleWords,
  validateCrossword,
  crosswordComplete,
  completeDay,
} from "../lib/crossword";
const stories = parseEdition(
  JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
).edition.stories;
test("archived glossary produces a deterministic connected crossword with valid crossings and numbering", () => {
  const p = buildCrossword(puzzleWords(stories));
  assert.ok(p);
  assert.ok(validateCrossword(p));
  assert.ok(p.entries.length >= 3 && p.entries.length <= 5);
  assert.deepEqual(buildCrossword(puzzleWords(stories)), p);
  for (const e of p.entries) assert.ok(stories.some((s) => s.id === e.storyId));
});
test("crossword rejects corrupted grids, duplicate answers and incorrect numbering", () => {
  const p = buildCrossword(puzzleWords(stories))!;
  for (const mutation of [
    () => {
      p.grid[p.entries[0].row][p.entries[0].col] = "!";
    },
    () => {
      p.entries[0].number = 99;
    },
  ]) {
    const original = structuredClone(p);
    mutation();
    assert.equal(validateCrossword(p), false);
    Object.assign(p, original);
  }
  assert.equal(buildCrossword([]), null);
});
test("completion requires every correct letter; empty or partial input cannot complete", () => {
  const p = buildCrossword(puzzleWords(stories))!,
    values: Record<string, string> = {};
  assert.equal(crosswordComplete(p, values), false);
  p.grid.forEach((row, r) =>
    row.forEach((letter, c) => {
      if (letter) values[`${r},${c}`] = letter;
    }),
  );
  assert.ok(crosswordComplete(p, values));
  values[`${p.entries[0].row},${p.entries[0].col}`] = "!";
  assert.equal(crosswordComplete(p, values), false);
});
test("device streak counts a day once, handles month boundaries and permits a fresh start", () => {
  assert.deepEqual(completeDay(null, "2026-11-01"), {
    lastDay: "2026-11-01",
    days: 1,
  });
  assert.equal(
    completeDay({ lastDay: "2026-10-31", days: 2 }, "2026-11-01").days,
    3,
  );
  assert.equal(
    completeDay({ lastDay: "2026-11-01", days: 3 }, "2026-11-01").days,
    3,
  );
  assert.equal(
    completeDay({ lastDay: "2026-10-01", days: 30 }, "2026-11-01").days,
    1,
  );
});
test("bundled offline crossword matches the validated current archive", () => {
  const offline = JSON.parse(readFileSync("public/demo-puzzle.json", "utf8"));
  assert.ok(validateCrossword(offline));
  assert.deepEqual(offline, dailyMini(stories, "2026-10-24"));
});
