import test from "node:test";
import { editorialSchemaFor } from "../lib/validation";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceReport } from "../lib/evidence-report";
import { parseEdition } from "../lib/edition-schema";
import { validateQuestionAnswers } from "../lib/public-question";
import { admitGeneration } from "../lib/generation-admission";
import { reportingOrigins, nearDuplicate } from "../lib/source-independence";
import { publicAddress } from "../lib/network-safety";
import {
  safeDirectTarget,
  gatherReceipts,
  annotate,
} from "../actors/news-receipts/core.mjs";
import {
  validPosition,
  positionKey,
  readingMinutes,
} from "../lib/reading-position";
import type {
  ApprovedStory,
  SocialPost,
  CandidateStory,
  SourceAssessment,
} from "../lib/types";
const fixture = () =>
  parseEdition(JSON.parse(readFileSync("public/demo-edition.json", "utf8")));
const minimal = () =>
  ({
    id: "s",
    headline: "A study",
    sources: [
      {
        id: "a",
        url: "https://example.edu/study",
        title: "Study",
        publisher: "University",
        publishedAt: null,
      },
    ],
    evidence: [
      {
        sourceId: "a",
        passageId: "p1",
        url: "https://example.edu/study",
        excerpt: "The study describes a preliminary finding.",
      },
    ],
    sourceAssessments: [
      {
        sourceId: "a",
        kind: "primary",
        independenceGroup: "university",
        explanation: "Original research",
      },
    ],
    contentSupport: [],
  }) as unknown as ApprovedStory;
const post = {
  id: "p",
  url: "https://www.reddit.com/r/science/comments/abc/test/",
  questions: ["What does this study actually show?"],
  community: "science",
  publishedAt: "2026-10-24T00:00:00.000Z",
} as SocialPost;
const draft = () => ({
  answers: [
    {
      storyId: "s",
      postId: "p",
      question: post.questions[0],
      answer: "It describes a preliminary finding.",
      evidence: [{ sourceId: "a", passageId: "p1" }],
    },
  ],
});
const review = {
  reviews: [
    { storyId: "s", postId: "p", fullySupported: true, safeAndRelevant: true },
  ],
};
test("evidence metrics count actual retained passages, deduplicate repeated references, and distinguish historical unknowns", () => {
  const result = fixture();
  result.edition.stories = [minimal()];
  result.rejectedStories = [];
  result.runLog = [];
  const original = JSON.stringify(result),
    old = evidenceReport(result);
  assert.equal(old.basis, "retained-records");
  assert.equal(old.normalizedArticles, null);
  assert.equal(old.retrievedCandidates, null);
  assert.equal(old.retainedOriginalDocuments, 1);
  assert.equal(old.storiesWithPrimaryPassages, 1);
  assert.equal(old.validPassageReferences, 1);
  assert.equal(old.publisherDomains, 1);
  assert.equal(old.identifiedReportingGroups, 0);
  assert.equal(JSON.stringify(result), original);
  result.edition.stories[0].contentSupport = [
    {
      field: "summary",
      evidence: [
        { ...minimal().evidence![0], excerpt: "An invented quotation" },
      ],
    },
  ] as ApprovedStory["contentSupport"];
  const measured = evidenceReport(result, {
    normalizedArticles: 4,
    eligibleArticles: 3,
    supportingSources: [],
  });
  assert.equal(measured.basis, "pipeline");
  assert.equal(measured.unresolvedPassageReferences, 1);
  assert.equal(measured.validPassageReferences, 0);
  assert.equal(measured.normalizedArticles, 4);
});
test("new optional evidence report round-trips without altering legacy published editions", () => {
  const original = fixture();
  assert.equal(original.evidenceReport, undefined);
  const measured = { ...original, evidenceReport: evidenceReport(original) };
  assert.deepEqual(
    parseEdition(measured).evidenceReport,
    measured.evidenceReport,
  );
  assert.equal(original.evidenceReport, undefined);
});
test("public answers retain the exact retrieved question and exact approved evidence only after separate support review", () => {
  const answer = validateQuestionAnswers(
    draft(),
    review,
    [minimal()],
    [post],
    new Set(["s/p"]),
  ).get("s");
  assert.equal(answer?.question, post.questions[0]);
  assert.deepEqual(answer?.evidence, minimal().evidence);
  for (const raw of [
    {
      answers: [
        { ...draft().answers[0], question: "An entirely invented question?" },
      ],
    },
    {
      answers: [
        {
          ...draft().answers[0],
          evidence: [{ sourceId: "a", passageId: "invented" }],
        },
      ],
    },
    {
      answers: [
        { ...draft().answers[0], answer: "Visit https://unsafe.example" },
      ],
    },
  ])
    assert.equal(
      validateQuestionAnswers(
        raw,
        review,
        [minimal()],
        [post],
        new Set(["s/p"]),
      ).size,
      0,
    );
  assert.equal(
    validateQuestionAnswers(
      draft(),
      { reviews: [{ ...review.reviews[0], fullySupported: false }] },
      [minimal()],
      [post],
      new Set(["s/p"]),
    ).size,
    0,
  );
  assert.equal(
    validateQuestionAnswers(draft(), review, [minimal()], [post], new Set())
      .size,
    0,
  );
});
test("persisted public answers cannot point at invented retained evidence", () => {
  const result = fixture(),
    s = result.edition.stories[0];
  const e = s.evidence![0];
  s.publicQuestion = {
    question: post.questions[0],
    answer: "A grounded answer.",
    postId: "p",
    url: post.url,
    community: "science",
    publishedAt: post.publishedAt,
    evidence: [{ ...e, excerpt: "Made up" }],
  };
  assert.throws(() => parseEdition(result), /exact retained evidence/);
});
test("global budgets reserve room for today, apply retry cooldowns, cap each date, and roll over", () => {
  const today = "2026-10-24";
  let ledger = admitGeneration(null, "2026-10-01", today, 0);
  assert.throws(
    () => admitGeneration(ledger, "2026-10-01", today, 1),
    /ten minutes/,
  );
  ledger = admitGeneration(ledger, "2026-10-01", today, 600001);
  ledger = admitGeneration(ledger, "2026-10-01", today, 1200002);
  assert.throws(
    () => admitGeneration(ledger, "2026-10-01", today, 1800003),
    /generation limit/,
  );
  ledger = {
    day: today,
    attempts: Array.from({ length: 8 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      at: 0,
    })),
  };
  assert.throws(
    () => admitGeneration(ledger, "2026-09-20", today, 999999),
    /generation limit/,
  );
  assert.equal(
    admitGeneration(ledger, today, today, 999999).attempts.length,
    9,
  );
  assert.equal(
    admitGeneration(ledger, today, "2026-10-25", 999999).attempts.length,
    1,
  );
  assert.throws(() => admitGeneration({ corrupt: true }, today, today));
});
const candidate = (id: string, url: string, text: string) =>
  ({ id, url, text }) as CandidateStory;
const assessment = (sourceId: string, group: string, kind = "reporting") =>
  ({
    sourceId,
    independenceGroup: group,
    kind,
    explanation: "Test",
  }) as SourceAssessment;
test("syndicated bylines, copied text and a shared primary document reduce reporting-origin counts", () => {
  const a = candidate(
      "a",
      "https://one.example/article",
      "By Reuters\nA report.",
    ),
    b = candidate(
      "b",
      "https://two.example/story",
      "By Reuters\nA different report.",
    );
  assert.equal(
    reportingOrigins([a, b], [assessment("a", "one"), assessment("b", "two")])
      .count,
    1,
  );
  const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
  assert.equal(nearDuplicate(text, text + " A closing note."), true);
  assert.equal(
    reportingOrigins(
      [
        { ...a, text },
        { ...b, text },
      ],
      [assessment("a", "one"), assessment("b", "two")],
    ).count,
    1,
  );
  const primary = candidate("p", "https://research.edu/paper", "Research");
  assert.equal(
    reportingOrigins(
      [primary, { ...a, text: "From https://research.edu/paper" }],
      [assessment("p", "research", "primary"), assessment("a", "one")],
    ).count,
    1,
  );
  assert.equal(
    reportingOrigins(
      [
        { ...a, text: "Original attributed reporting." },
        { ...b, text: "Distinct text." },
      ],
      [assessment("a", "shared"), assessment("b", "shared")],
    ).count,
    1,
  );
});
test("private, malformed, mixed DNS and unsafe redirect destinations are rejected", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.2.1",
    "100.64.0.1",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
    "invalid:address",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  assert.equal(
    await safeDirectTarget("https://news.example/story", async () => [
      { address: "8.8.8.8" },
      { address: "127.0.0.1" },
    ]),
    false,
  );
  assert.equal(
    await safeDirectTarget("https://news.example/story", async () => [
      { address: "8.8.8.8" },
    ]),
    true,
  );
  const a = annotate(
    {
      url: "https://news.example/story",
      text: "secret",
      metadata: { redirectedUrl: "https://169.254.169.254/private" },
    },
    { id: "r", defaultDatasetId: "d" },
    0,
  );
  assert.equal(a.text, "");
  let called = false;
  await assert.rejects(
    gatherReceipts({ queries: ["https://127.0.0.1/private"] }, async () => {
      called = true;
      throw Error();
    }),
  );
  assert.equal(called, false);
});
test("reader resumes only valid positions with account isolation and a text-based reading estimate", () => {
  for (const x of [-1, 4, 1.5, "1", null]) assert.equal(validPosition(x, 4), 0);
  assert.equal(validPosition(3, 4), 3);
  assert.notEqual(positionKey("edition"), positionKey("edition", "uid"));
  assert.ok(readingMinutes(fixture().edition.stories) >= 1);
});

test("Claude output schema requires the actual candidate count and refuses invented candidate IDs", () => {
  const schema = editorialSchemaFor([{ id: "real" }] as CandidateStory[]);
  assert.equal(schema.safeParse({ decisions: [] }).success, false);
  assert.equal(
    schema.shape.decisions.element.shape.candidateId.safeParse("invented")
      .success,
    false,
  );
  assert.equal(
    schema.shape.decisions.element.shape.candidateId.safeParse("real").success,
    true,
  );
  assert.throws(() => editorialSchemaFor([]));
});
