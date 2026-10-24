import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEdition } from "../lib/edition-schema";
import { dailyMini, miniFromRows, miniDesigns, entryCells } from "../lib/mini";
import { crosswordComplete, validateCrossword } from "../lib/crossword";
import { editionDay, validDay, markRead, readingStreak } from "../lib/daily";
const demo = parseEdition(
  JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
);
test("every original Mini is 5x5 with ten unique clued entries and two-way crossings for every letter", () => {
  for (const design of miniDesigns) {
    const puzzle = miniFromRows(design.rows);
    assert.ok(validateCrossword(puzzle));
    assert.equal(puzzle.grid.length, 5);
    assert.equal(puzzle.entries.length, 10);
    assert.equal(new Set(puzzle.entries.map((e) => e.answer)).size, 10);
    puzzle.grid.forEach((row, r) =>
      row.forEach((letter, c) => {
        if (letter)
          assert.equal(
            puzzle.entries.filter((e) => entryCells(e).includes(`${r},${c}`))
              .length,
            2,
          );
      }),
    );
    const solution = Object.fromEntries(
      puzzle.grid.flatMap((row, r) =>
        row.flatMap((l, c) => (l ? [[`${r},${c}`, l]] : [])),
      ),
    );
    assert.equal(crosswordComplete(puzzle, {}), false);
    assert.equal(crosswordComplete(puzzle, solution), true);
  }
});
test("Mini selection is stable by edition and date, and relates its theme only to an actual story", () => {
  const p = dailyMini(demo.edition.stories, "2026-10-24");
  assert.deepEqual(p, dailyMini(demo.edition.stories, "2026-10-24"));
  assert.ok(demo.edition.stories.some((s) => s.id === p.themeStoryId));
  assert.throws(() => miniFromRows(["bad"]));
});
test("all archive collections conform to the contract and disclose retrospective assembly", () => {
  const entries = JSON.parse(readFileSync("public/archive/index.json", "utf8"));
  for (const entry of entries) {
    const d = parseEdition(
      JSON.parse(readFileSync(`public${entry.url}`, "utf8")),
    );
    assert.equal(d.edition.mode, "demo");
    if (entry.url.startsWith("/archive/")) {
      assert.match(d.edition.demoInfo!.notice, /retrospective/i);
      assert.equal(d.edition.date, entry.date);
      assert.ok(
        d.edition.stories.every(
          (s) => s.sources[0].publishedAt!.slice(0, 10) <= entry.date,
        ),
      );
    }
  }
});
test("daily publication uses California day across UTC midnight and daylight saving", () => {
  assert.equal(editionDay(new Date("2026-10-25T06:59:00Z")), "2026-10-24");
  assert.equal(editionDay(new Date("2026-10-25T07:00:00Z")), "2026-10-25");
  assert.equal(editionDay(new Date("2026-12-01T07:59:00Z")), "2026-11-30");
  assert.equal(validDay("2026-02-30"), false);
  assert.equal(validDay("2026-10-24"), true);
});
test("reading progress counts dates once and never punishes a missed day", () => {
  const p = markRead(
    markRead({ days: [], reactions: {} }, "2026-10-23"),
    "2026-10-23",
  );
  assert.equal(p.days.length, 1);
  assert.equal(readingStreak(p.days, "2026-10-24"), 1);
  assert.equal(readingStreak(p.days, "2026-10-25"), 0);
  assert.equal(readingStreak(markRead(p, "2026-10-24").days, "2026-10-24"), 2);
});
