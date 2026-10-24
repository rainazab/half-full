import assert from "node:assert/strict";
import test from "node:test";
import { assembleEditorialResult, validateEditorialResponse, type EditorialResponse } from "../lib/validation";
import type { CandidateStory } from "../lib/types";
import { evidencePassages, editorialCandidates } from "../lib/evidence";

const quote = "The fictional test observatory published its measurement on October 24, 2026.";
const candidate: CandidateStory = {
  id: "test-one", title: "Synthetic unit-test article", url: "https://example.org/test-one",
  source: "Test publisher", description: "Test only", text: `${quote} ${"Additional synthetic evidence. ".repeat(20)}`,
  publishedAt: "2026-10-24T00:00:00.000Z",
};
const now = new Date("2026-10-24T12:00:00Z");
function decision(): EditorialResponse["decisions"][number] {
  return {
    candidateId: candidate.id, verificationStatus: "verified", centralClaim: "The test observatory published a measurement.",
    adequatelySupported: true, sensationalized: false, confidence: 0.9, hypeScore: 0.1,
    reason: "The supplied text directly attributes the measurement to the observatory.",
    headline: "A test measurement was published", summary: "A measurement was published; it is preliminary.",
    whyItMatters: "It illustrates how preliminary findings are reported.", action: "Read the measurement's stated limitations.",
    category: "Science", sourceIds: [candidate.id], evidence: [{ sourceId: candidate.id, passageId: "p1" }],
  };
}

test("validates decisions and attaches only original source metadata", () => {
  const result = assembleEditorialResult({ decisions: [decision()] }, [candidate], now);
  assert.equal(result.stories.length, 1);
  assert.equal(result.stories[0].sources[0].url, candidate.url);
  assert.equal(result.stories[0].sources[0].publisher, candidate.source);
  assert.equal(result.stories[0].verificationStatus, "verified");
});

test("rejects unknown IDs, invented passage IDs, invented URLs, and schema extensions", () => {
  assert.throws(() => validateEditorialResponse({ decisions: [{ ...decision(), sourceIds: ["invented"] }] }, [candidate]), /outside/);
  assert.throws(() => validateEditorialResponse({ decisions: [{ ...decision(), candidateId: "invented" }] }, [candidate]), /unknown/);
  assert.throws(() => validateEditorialResponse({ decisions: [{ ...decision(), evidence: [{ sourceId: candidate.id, passageId: "invented" }] }] }, [candidate]), /absent/);
  assert.throws(() => validateEditorialResponse({ decisions: [{ ...decision(), action: "Visit https://invented.org" }] }, [candidate]), /URLs/);
  assert.throws(() => validateEditorialResponse({ decisions: [{ ...decision(), sources: [{ url: "https://invented.org" }] }] }, [candidate]));
});

test("requires a single decision for every candidate", () => {
  assert.throws(() => validateEditorialResponse({ decisions: [] }, [candidate]), /every/);
  assert.throws(() => validateEditorialResponse({ decisions: [decision(), decision()] }, [candidate]), /duplicate/);
});

test("rejects out-of-range scores and malformed JSON structures", () => {
  for (const confidence of [-0.1, 1.1, "0.9", NaN]) {
    assert.throws(() => validateEditorialResponse({ decisions: [{ ...decision(), confidence }] }, [candidate]));
  }
  assert.throws(() => validateEditorialResponse("not JSON", [candidate]));
});

test("downgrades weak, unsupported, or sensational approvals to uncertain", () => {
  for (const change of [{ confidence: 0.7 }, { adequatelySupported: false }, { hypeScore: 0.8 }, { sensationalized: true }, { evidence: [] }]) {
    const result = assembleEditorialResult({ decisions: [{ ...decision(), ...change }] }, [candidate], now);
    assert.equal(result.stories.length, 0);
    assert.equal(result.rejectedStories[0].verificationStatus, "uncertain");
  }
});

test("snippets alone cannot become verified stories", () => {
  const result = assembleEditorialResult({ decisions: [{ ...decision(), evidence: [] }] }, [{ ...candidate, text: "", description: quote }], now);
  assert.equal(result.stories.length, 0);
});

test("preserves uncertain and rejected decisions and their reasons", () => {
  for (const verificationStatus of ["uncertain", "rejected"] as const) {
    const result = assembleEditorialResult({ decisions: [{ ...decision(), verificationStatus }] }, [candidate], now);
    assert.equal(result.stories.length, 0);
    assert.equal(result.rejectedStories[0].verificationStatus, verificationStatus);
    assert.equal(result.rejectedStories[0].reason, decision().reason);
  }
});

test("rejects stale and future publication dates", () => {
  for (const publishedAt of ["2020-01-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"]) {
    const result = assembleEditorialResult({ decisions: [decision()] }, [{ ...candidate, publishedAt }], now);
    assert.equal(result.stories.length, 0);
    assert.match(result.rejectedStories[0].reason, /Publication date/);
  }
});

test("caps editions at five and records excluded candidates", () => {
  const candidates = Array.from({ length: 6 }, (_, i) => ({ ...candidate, id: `test-${i}`, url: `https://example.org/${i}` }));
  const decisions = candidates.map((item) => ({ ...decision(), candidateId: item.id, sourceIds: [item.id], evidence: [{ sourceId: item.id, passageId: "p1" }] }));
  const result = assembleEditorialResult({ decisions }, candidates, now);
  assert.equal(result.stories.length, 5);
  assert.equal(result.rejectedStories.length, 1);
  assert.match(result.rejectedStories[0].reason, /finite edition/);
});

test("one invalid evidence decision is audited without discarding valid stories", () => {
  const candidates = Array.from({ length: 4 }, (_, i) => ({ ...candidate, id: `test-${i}`, url: `https://example.org/${i}` }));
  const decisions = candidates.map((item, i) => ({ ...decision(), candidateId: item.id, sourceIds: [item.id],
    evidence: [{ sourceId: item.id, passageId: i === 0 ? "invented" : "p1" }] }));
  const result = assembleEditorialResult({ decisions }, candidates, now);
  assert.equal(result.stories.length, 3);
  assert.equal(result.rejectedStories.length, 1);
  assert.equal(result.rejectedStories[0].verificationStatus, "uncertain");
  assert.match(result.rejectedStories[0].reason, /passage absent/);
});

test("evidence IDs reference deterministic original text including Markdown links", () => {
  const text = "A finding reported by [the institute](https://example.org/report) supports this narrow claim.\n\n" + "More article evidence. ".repeat(200);
  const passages = evidencePassages(text);
  assert.ok(passages.length > 1);
  assert.ok(passages.every((passage) => passage.text.length <= 1400));
  assert.match(passages[0].text, /\[the institute\]/);
  assert.deepEqual(evidencePassages(text), passages);
  const supplied = editorialCandidates([{ ...candidate, text }]);
  assert.deepEqual(supplied[0].passages, passages);
  assert.ok(!("text" in supplied[0]));
  assert.equal(supplied[0].url, candidate.url);
});
