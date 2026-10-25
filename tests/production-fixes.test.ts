import test from "node:test";
import assert from "node:assert/strict";
import {
  admitGeneration,
  generationLimits,
  nextPacificReset,
  ledgerSchema,
} from "../lib/generation-admission";
import { editionProgress } from "../lib/deck";
import { miniInputLetter } from "../lib/mini-input";
import { videoTimeForNarration } from "../lib/video";
const today = "2026-10-24",
  now = Date.parse("2026-10-24T18:00:00Z");
const ledger = (count: number, date = today) => ({
  day: today,
  attempts: Array.from({ length: count }, (_, i) => ({
    date,
    at: now - (count - i) * 120000,
  })),
});
test("generation defaults, overrides and invalid configuration", () => {
  assert.deepEqual(generationLimits({}), {
    daily: 60,
    historical: 40,
    perDate: 6,
    cooldownMs: 120000,
  });
  assert.deepEqual(
    generationLimits({
      GENERATION_DAILY_LIMIT: "120",
      GENERATION_HISTORICAL_LIMIT: "90",
      GENERATION_PER_DATE_LIMIT: "12",
      GENERATION_COOLDOWN_SECONDS: "30",
    }),
    { daily: 120, historical: 90, perDate: 12, cooldownMs: 30000 },
  );
  for (const key of [
    "GENERATION_DAILY_LIMIT",
    "GENERATION_HISTORICAL_LIMIT",
    "GENERATION_PER_DATE_LIMIT",
    "GENERATION_COOLDOWN_SECONDS",
  ])
    for (const value of ["", "0", "-1", "1.5", "Infinity", "NaN", "1000000"])
      assert.throws(
        () => generationLimits({ [key]: value }),
        /must be an integer/,
      );
});
test("exact total and historical boundaries retain all reservations", () => {
  const limits = { ...generationLimits({}), perDate: 1000 };
  assert.equal(
    admitGeneration(ledger(59), today, today, now, limits).attempts.length,
    60,
  );
  assert.throws(
    () => admitGeneration(ledger(60), today, today, now, limits),
    /generation limit/,
  );
  assert.equal(
    admitGeneration(ledger(39, "2026-10-01"), "2026-10-02", today, now, limits)
      .attempts.length,
    40,
  );
  assert.throws(
    () =>
      admitGeneration(
        ledger(40, "2026-10-01"),
        "2026-10-02",
        today,
        now,
        limits,
      ),
    /generation limit/,
  );
  assert.equal(
    admitGeneration(ledger(40, "2026-10-01"), today, today, now, limits)
      .attempts.length,
    41,
  );
  assert.equal(ledgerSchema.parse(ledger(150)).attempts.length, 150);
  assert.equal(
    admitGeneration(ledger(150), today, today, now, { ...limits, daily: 200 })
      .attempts.length,
    151,
  );
  assert.throws(
    () => admitGeneration(ledger(150), today, today, now, limits),
    /generation limit/,
  );
});
test("six attempts per date and exact two minute cooldown with retry time", () => {
  assert.equal(
    admitGeneration(ledger(5), today, today, now).attempts.length,
    6,
  );
  assert.throws(
    () => admitGeneration(ledger(6), today, today, now),
    /generation limit/,
  );
  const one = admitGeneration(null, today, today, now);
  assert.throws(
    () => admitGeneration(one, today, today, now + 119999),
    (e: any) =>
      e.code === "GENERATION_COOLDOWN" &&
      e.retryAt === new Date(now + 120000).toISOString(),
  );
  assert.equal(
    admitGeneration(one, today, today, now + 120000).attempts.length,
    2,
  );
});
test("Pacific reset respects summer, winter, DST and resets previous ledger", () => {
  assert.equal(
    new Date(nextPacificReset(now)).toISOString(),
    "2026-10-25T07:00:00.000Z",
  );
  assert.equal(
    new Date(
      nextPacificReset(Date.parse("2026-11-01T08:00:00Z")),
    ).toISOString(),
    "2026-11-02T08:00:00.000Z",
  );
  assert.equal(
    admitGeneration(
      ledger(150),
      "2026-10-25",
      "2026-10-25",
      Date.parse("2026-10-25T07:00:00Z"),
    ).attempts.length,
    1,
  );
});
test("continuous progress adapts to 3–5 stories, dragging, cancellation and ending", () => {
  for (const count of [3, 4, 5]) {
    assert.equal(editionProgress(0, 390, count), 0);
    assert.equal(editionProgress(-390, 390, count), 1 / count);
    assert.equal(editionProgress(-195, 390, count), 0.5 / count);
    assert.equal(editionProgress(0, 390, count), 0);
    assert.equal(editionProgress(-390 * count, 390, count), 1);
  }
  assert.equal(editionProgress(NaN, 390, 4), 0);
});
test("native cell input normalizes paste and short video holds instead of repeating", () => {
  assert.equal(miniInputLetter(" hi!"), "H");
  assert.equal(miniInputLetter("123"), "");
  assert.equal(miniInputLetter("a"), "A");
  assert.equal(videoTimeForNarration(2), 2);
  assert.equal(videoTimeForNarration(8), 4.96);
  assert.equal(videoTimeForNarration(40), 4.96);
  assert.equal(videoTimeForNarration(1), 1);
});
