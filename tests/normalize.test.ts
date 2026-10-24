import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStories, safeUrl } from "../lib/normalize";

// Synthetic fixtures stay in tests. Live generation never imports the fixed demo.
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

test("reads publication date and publisher from matching article JSON-LD", () => {
  const result = normalizeStories([
    { metadata: { title: "NPR-style article", url: "https://example.org/npr", jsonLd: [
      { "@type": "NewsArticle", mainEntityOfPage: { "@id": "https://example.org/npr" }, datePublished: "2026-10-21T01:00:00-04:00", publisher: { name: "NPR test" } },
    ] }, markdown: "Retrieved text" },
    { metadata: { title: "BBC-style article", url: "https://example.org/bbc", jsonLd: { "@graph": [
      { "@type": "WebSite", datePublished: "1999-01-01" },
      { "@type": "NewsArticle", url: "https://example.org/related", datePublished: "2020-01-01" },
      { "@type": ["ReportageNewsArticle"], url: "https://example.org/bbc", datePublished: "2026-10-22T16:02:38.572Z", publisher: { name: "BBC test" } },
    ] } }, markdown: "Retrieved text" },
  ]);
  assert.equal(result.candidates[0].publishedAt, "2026-10-21T05:00:00.000Z");
  assert.equal(result.candidates[0].source, "NPR test");
  assert.equal(result.candidates[1].publishedAt, "2026-10-22T16:02:38.572Z");
  assert.equal(result.candidates[1].source, "BBC test");
});

test("excludes weather/service pages while retaining reported weather articles", () => {
  const result = normalizeStories([
    { title: "Local forecast", url: "https://www.bbc.com/weather/2635183", text: "Current forecast with warnings" },
    { title: "Storm disrupts travel", url: "https://www.bbc.com/news/articles/test-weather", text: "Reported article with evidence" },
  ]);
  assert.equal(result.candidates.length, 1);
  assert.match(result.candidates[0].url, /news\/articles/);
  assert.equal(result.rejectedStories.length, 1);
  assert.match(result.rejectedStories[0].reason, /service page/);
});

test("invalid and relative dates fall through to valid publication metadata", () => {
  const result = normalizeStories([{title:"Article",url:"https://example.org/date",text:"Text",publishedAt:"2 hours ago",publishedDate:"2026-02-30",metadata:{datePublished:"2026-10-23T12:00:00Z"}}]);
  assert.equal(result.candidates[0].publishedAt,"2026-10-23T12:00:00.000Z");
  const invalid = normalizeStories([{title:"Article",url:"https://example.org/invalid",text:"Text",publishedAt:"2026-02-30"}]);
  assert.equal(invalid.candidates[0].publishedAt,null);
});
test("deduplicates query-order variations and substantive identical syndicated text", () => {
  const text="This synthetic article reports a measurement collected by a research team using instruments during a documented experiment with carefully described methods and limitations. ".repeat(5);
  const result=normalizeStories([
    {title:"First",url:"https://example.org/story?b=2&a=1",text},
    {title:"Copy URL",url:"https://example.org/story/?a=1&b=2",text:"Other text"},
    {title:"Syndicated",url:"https://second.example/story",text},
  ]);
  assert.equal(result.candidates.length,1);
  assert.match(result.rejectedStories[0].reason,/Duplicate source URL/);
  assert.match(result.rejectedStories[1].reason,/syndicated/);
});
