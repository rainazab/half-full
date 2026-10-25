import test from "node:test";
import assert from "node:assert/strict";
import { historicalQueries } from "../actors/news-receipts/core.mjs";
import { selectableDay, shiftDay, earliestEditionDay } from "../lib/daily";
import { editionContext } from "../lib/editor-prompt";
import { normalizeStories } from "../lib/normalize";
import { matchesEditionDay } from "../lib/historical-coverage";
import { generateEdition, pipelineDependencies } from "../lib/pipeline";
import { POST } from "../app/api/run/route";
import type { AppConfig } from "../lib/config";
import type { RunRecord } from "../lib/types";

test("ten-year bounds support leap days and reject invalid or future dates before paid work", async () => {
  assert.equal(selectableDay("2024-02-29", "2026-10-24"), true);
  for (const date of ["2001-02-29", "2026-10-25", "1899-12-31", "not-a-date"])
    assert.equal(selectableDay(date, "2026-10-24"), false);
  assert.equal(shiftDay("2000-01-01", -1), "1999-12-31");
  assert.equal(earliestEditionDay("2026-10-24"), "2016-10-24");
  assert.equal(earliestEditionDay("2024-02-29"), "2014-02-28");
  assert.equal(selectableDay("2016-10-24", "2026-10-24"), true);
  assert.equal(selectableDay("2016-10-23", "2026-10-24"), false);
  assert.equal(selectableDay("2000-01-01", "2026-10-24"), false);
  for (const date of ["3000-01-01", "2000-02-30", "1899-01-01"]) {
    const response = await POST(
      new Request(`http://localhost/api/run?date=${date}`, { method: "POST" }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_DATE");
  }
});

test("historical retrieval uses the selected day across old and new publisher URL structures", () => {
  const queries = historicalQueries("2000-01-01");
  assert.equal(queries.length, 3);
  assert.match(queries[0], /"1 January" "2000"/);
  assert.match(queries[2], /"January 1, 2000"/);
  assert.match(queries[0], /news\.bbc\.co\.uk/);
  assert.match(queries[1], /inurl:2000\/jan\/01/);
  assert.throws(() => historicalQueries("2001-02-29"));
  const context = editionContext("2000-01-01");
  assert.equal(context.currentUtcTime, "2000-01-02T07:59:59.999Z");
  assert.match(context.temporalInstruction!, /Do not add later outcomes/);
});

test("legacy mastheads and Guardian article paths supply dates; dates merely mentioned in prose do not", () => {
  const candidate = (
    text: string,
    url = "https://news.bbc.co.uk/2/hi/world/test.stm",
  ) =>
    normalizeStories([
      {
        title: "Test article",
        url,
        text:
          text +
          "\n" +
          "Synthetic reporting with enough text for extraction. ".repeat(20),
      },
    ]).candidates[0];
  assert.match(
    candidate("Saturday, 1 January, 2000, 12:40 GMT").publishedAt!,
    /^2000-01-01/,
  );
  assert.match(
    candidate("A report", "https://www.theguardian.com/world/2000/jan/01/test")
      .publishedAt!,
    /^2000-01-01/,
  );
  assert.equal(
    candidate("This discusses an event from 1 January 2000.").publishedAt,
    null,
  );
  assert.equal(
    candidate("Saturday, 31 February, 2000, 12:40 GMT").publishedAt,
    null,
  );
});

test("legacy table markup cannot hide BBC publication dates or make a CNN title override its masthead", () => {
  const text =
    "Navigation links. ".repeat(350) +
    "![](/blank.gif) Saturday, 1 January, 2000, 10:48 GMT\nSubstantive article evidence. ".repeat(
      15,
    );
  const bbc = normalizeStories([
    {
      title: "BBC reporting",
      url: "http://news.bbc.co.uk/2/hi/world/123.stm",
      text,
    },
  ]).candidates[0];
  assert.match(bbc.publishedAt!, /^2000-01-01/);
  const cnn = normalizeStories([
    {
      title: "Headline - January 1, 2000",
      url: "https://edition.cnn.com/2000/US/01/02/test/",
      text:
        "Headline - January 1, 2000\n_**January 2, 2000**  \nWeb posted at: 11:00 a.m. EST_\n" +
        "Substantive article evidence. ".repeat(30),
    },
  ]).candidates[0];
  assert.match(cnn.publishedAt!, /^2000-01-02/);
});

test("historical pipeline excludes other dates and validates eligible reporting as of that day", async () => {
  const date = "2000-01-01";
  const config: AppConfig = {
    editionDate: date,
    editor: {
      provider: "anthropic",
      label: "Claude",
      model: "synthetic",
      apiKey: "test",
      keyEnv: "ANTHROPIC_API_KEY",
      modelEnv: "ANTHROPIC_MODEL",
      modelUsesDefault: false,
      editionDate: date,
    },
    apifyToken: "test",
    actorId: "test",
    actorInput: {},
    social: { enabled: false, actorId: "test" },
    articleImages: false,
  };
  const inputs = [
    ...Array(21).fill("1999-12-31"),
    date,
    date,
    date,
    // 9 pm Pacific on January 1 (05:00 UTC on January 2): the same day for this publication.
    "2000-01-02T05:00:00.000Z",
    // Noon UTC on January 2 is January 2 in both zones: excluded.
    "2000-01-02T12:00:00.000Z",
    "2026-10-24",
    null,
  ].map((day, i) => ({
    title: `Synthetic news ${i}`,
    url: `https://example.org/news-${i}`,
    publishedAt: day,
    text:
      `Distinct synthetic article ${i}. ` +
      "Substantive synthetic reporting and evidence. ".repeat(30),
  }));
  const run: RunRecord = {
    id: "historical-test",
    status: "running",
    createdAt: new Date().toISOString(),
    runLog: [],
  };
  const retrievals: unknown[] = [];
  const result = await generateEdition(run, undefined, {
    ...pipelineDependencies,
    getConfig: () => config,
    retrieveNews: async (_config, _log, _onRun, options) => {
      retrievals.push(options);
      return inputs;
    },
    enrichStories: async () => {},
    attachArticleImages: async () => {},
    finishRun: () => {},
    reviewCandidates: async (editor, candidates) => {
      assert.equal(editor.editionDate, date);
      assert.equal(candidates.length, 4);
      return {
        decisions: candidates.map((c) => ({
          candidateId: c.id,
          verificationStatus: "verified",
          centralClaim: c.title,
          adequatelySupported: true,
          sensationalized: false,
          confidence: 0.85,
          hypeScore: 0.1,
          reason: "Test evidence supports the limited claim.",
          headline: c.title,
          summary: "A synthetic report was published.",
          whyItMatters: "It helps explain the reporting at that time.",
          action: "Read the original source.",
          category: "Test",
          sourceIds: [c.id],
          evidence: [{ sourceId: c.id, passageId: "p1" }],
          contentEvidence: Object.fromEntries(
            ["headline", "summary", "whyItMatters", "action"].map((field) => [
              field,
              [{ sourceId: c.id, passageId: "p1" }],
            ]),
          ),
          sourceAssessments: [
            {
              sourceId: c.id,
              kind: "reporting",
              independenceGroup: c.id,
              explanation: "Synthetic reporting.",
            },
          ],
          conflictingSourceIds: [],
          contradictionReason: "",
        })),
      };
    },
  });
  assert.equal(result.edition.stories.length, 4);
  assert.equal(result.rejectedStories.length, 24);
  assert.ok(
    result.edition.stories.every((s) =>
      matchesEditionDay(s.sources[0].publishedAt, date),
    ),
  );
  assert.ok(
    result.rejectedStories.some(
      (r) =>
        r.url === "https://example.org/news-25" &&
        /outside the selected day/.test(r.reason),
    ),
  );
  assert.equal(result.stats.candidatesFound, 28);
  // Fewer than eight same-day articles triggered exactly one bounded, broader second pass.
  assert.equal(retrievals.length, 2);
  const second = retrievals[1] as {
    queries?: string[];
    budgetMs?: number;
    investigate?: boolean;
  };
  assert.ok(
    second.queries?.length &&
      second.budgetMs! <= 70000 &&
      second.investigate === false,
  );
  const passLog = result.runLog.filter(
    (e) => e.step === "discovery.second-pass",
  );
  assert.deepEqual(
    passLog.map((e) => e.status),
    ["started", "completed"],
  );
  assert.match(passLog[1].message, /0 new unique articles/);
  assert.ok(
    result.runLog.some(
      (e) =>
        e.step === "edition.coverage" &&
        /4 published that day \(UTC or Pacific\)/.test(e.message),
    ),
  );
});
