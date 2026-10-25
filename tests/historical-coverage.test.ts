import assert from "node:assert/strict";
import test from "node:test";
import {
  coverageMessage,
  editionDayEnd,
  matchesEditionDay,
  parseCoverageMessage,
  publicationDays,
  secondPassQueries,
} from "../lib/historical-coverage";

test("an edition day accepts the same timestamp read in UTC or Pacific time", () => {
  // 8:30 pm Pacific on June 29 is 03:30 UTC on June 30.
  assert.deepEqual(publicationDays("2026-06-30T03:30:00.000Z"), {
    utc: "2026-06-30",
    pacific: "2026-06-29",
  });
  assert.ok(matchesEditionDay("2026-06-30T03:30:00.000Z", "2026-06-29"));
  assert.ok(matchesEditionDay("2026-06-30T03:30:00.000Z", "2026-06-30"));
  assert.ok(!matchesEditionDay("2026-06-30T03:30:00.000Z", "2026-06-28"));
  // Noon UTC falls on the same calendar day in both zones.
  assert.ok(matchesEditionDay("2026-06-29T12:00:00.000Z", "2026-06-29"));
  assert.ok(!matchesEditionDay("2026-06-29T12:00:00.000Z", "2026-06-30"));
  // Unknown or malformed dates never qualify; adjacent days are never borrowed.
  assert.ok(!matchesEditionDay(null, "2026-06-29"));
  assert.ok(!matchesEditionDay("yesterday", "2026-06-29"));
  assert.ok(!matchesEditionDay("2026-06-28T23:59:59.000Z", "2026-06-29"));
});
test("the edition day ends at the Pacific midnight that follows it", () => {
  // June is Pacific Daylight Time (UTC-7); January is Pacific Standard Time (UTC-8).
  assert.equal(
    editionDayEnd("2026-06-29").toISOString(),
    "2026-06-30T06:59:59.999Z",
  );
  assert.equal(
    editionDayEnd("2026-01-15").toISOString(),
    "2026-01-16T07:59:59.999Z",
  );
  assert.ok(
    matchesEditionDay(editionDayEnd("2026-06-29").toISOString(), "2026-06-29"),
  );
  assert.ok(
    !matchesEditionDay(
      new Date(editionDayEnd("2026-06-29").getTime() + 1).toISOString(),
      "2026-06-29",
    ),
  );
});
test("second-pass lanes stay bounded to the exact day and credible publishers", () => {
  const modern = secondPassQueries("2026-06-29");
  assert.equal(modern.length, 3);
  for (const query of modern) {
    assert.match(query, /after:2026-06-28 before:2026-06-30/);
    assert.match(query, /site:/);
  }
  assert.ok(modern.some((query) => /apnews\.com|reuters\.com/.test(query)));
  assert.ok(modern.some((query) => /sfchronicle\.com|kqed\.org/.test(query)));
  const legacy = secondPassQueries("2004-04-09");
  assert.equal(legacy.length, 2);
  assert.ok(legacy.every((query) => query.includes("April 9")));
  assert.throws(() => secondPassQueries("2026-13-01"));
});
test("coverage diagnostics round-trip through the run log", () => {
  const counts = {
    retrieved: 24,
    unique: 8,
    sameDay: 3,
    undated: 4,
    otherDay: 1,
  };
  const message = coverageMessage("2026-06-29", counts);
  assert.deepEqual(parseCoverageMessage(message), {
    day: "2026-06-29",
    ...counts,
  });
  assert.equal(
    parseCoverageMessage("Reviewing reporting published on 2026-06-29"),
    null,
  );
});
