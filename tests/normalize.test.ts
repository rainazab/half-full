import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStories, safeUrl } from "../lib/normalize";

// Synthetic fixtures are confined to tests. Production has no fixture/fallback data.
test("normalizes nested news results, publisher objects, dates, and duplicate URLs", () => {
  const result = normalizeStories([{ newsResults: [
    { title: "First", link: "https://example.org/one?utm_source=search#top", source: { name: "Example" }, description: "A snippet", publishedDate: "2026-10-23" },
    { title: "Duplicate", url: "https://example.org/one", text: "Same URL" },
    { headline: "Second", URL: "https://example.org/two", publisher: { name: "Second publisher" }, text: "Full text", date: "2 hours ago" },
  ] }]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].url, "https://example.org/one");
  assert.equal(result.candidates[0].source, "Example");
  assert.equal(result.candidates[0].publishedAt, "2026-10-23T00:00:00.000Z");
  assert.equal(result.candidates[1].source, "Second publisher");
  assert.equal(result.candidates[1].publishedAt, null);
  assert.match(result.rejectedStories[0].reason, /Duplicate/);
});

test("handles nested and flattened RAG Web Browser fields without using crawl time as publication", () => {
  const result = normalizeStories([
    { metadata: { title: "Article", url: "https://example.org/a", openGraph: [{ property: "article:published_time", content: "2026-10-24T08:30:00Z" }] }, markdown: "Article text", crawl: { loadedAt: "2026-10-24T10:00:00Z" } },
    { "metadata.title": "Flattened", "metadata.url": "https://example.org/b", markdown: "Another article", crawl: { loadedAt: "2026-10-24T10:00:00Z" } },
    { searchResult: { title: "Search result", url: "https://example.org/c", description: "Snippet" }, text: "Extracted evidence" },
  ]);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].publishedAt, "2026-10-24T08:30:00.000Z");
  assert.equal(result.candidates[1].publishedAt, null);
  assert.equal(result.candidates[2].description, "Snippet");
});

test("rejects unusable URLs, missing evidence, and failed fetches", () => {
  const result = normalizeStories([
    { title: "Bad", url: "javascript:alert(1)", text: "Text" },
    { title: "Empty", url: "https://example.org/a" },
    { title: "Blocked", url: "https://example.org/b", description: "Snippet", crawl: { httpStatusCode: 403 } },
  ]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejectedStories.length, 3);
  assert.equal(result.rejectedStories[0].url, "");
  assert.equal(safeUrl("https://user:secret@example.org/a"), null);
});

test("bounds candidates and text while auditing every excess result", () => {
  const result = normalizeStories(Array.from({ length: 4 }, (_, i) => ({ title: `Article ${i}`, url: `https://example.org/${i}`, text: "a".repeat(25000) })), 2);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.rejectedStories.length, 2);
  assert.equal(result.candidates[0].text.length, 18000);
  assert.match(result.rejectedStories[0].reason, /candidate limit/);
});

test("candidate IDs are stable across tracking links", () => {
  const one = normalizeStories([{ title: "A", url: "https://example.org/a?utm_campaign=x", text: "Evidence" }]);
  const two = normalizeStories([{ title: "A", url: "https://example.org/a", text: "Evidence" }]);
  assert.equal(one.candidates[0].id, two.candidates[0].id);
});
