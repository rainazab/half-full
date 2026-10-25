import test from "node:test";
import assert from "node:assert/strict";
import {
  gatherReceipts,
  actorRunner,
  originalLinks,
  publicUrl,
  annotate,
  extractPassages,
} from "../actors/news-receipts/core.mjs";
import { unpackReceipts } from "../lib/receipts";
import { normalizeStories } from "../lib/normalize";
import { evidencePassages } from "../lib/evidence";
const article = {
  title: "Synthetic report",
  url: "https://bbc.com/news/articles/test",
  publishedAt: "2026-10-24",
  markdown:
    "Retrieved text for testing. ".repeat(40) +
    "\n\n[Original study](https://example.edu/research/study)",
};
const runner = async () => ({
  run: {
    id: "run",
    actorId: "apify~rag-web-browser",
    defaultDatasetId: "dataset",
  },
  items: [article],
});
test("receipts preserve exact deterministic text and full source provenance", async () => {
  const logs: string[] = [];
  const p = await gatherReceipts(
    { queries: ["test"], investigate: true },
    runner,
    (s) => logs.push(s),
  );
  assert.ok(logs.includes("investigation"));
  assert.equal(p[0].assessment, "requires-editorial-review");
  const unpacked = unpackReceipts(p);
  assert.equal(unpacked.articles.length, 1);
  assert.equal(unpacked.sources.length, 1);
  const normalized = normalizeStories(unpacked.articles).candidates[0];
  assert.equal(normalized.provenance?.runId, "run");
  assert.equal(normalized.provenance?.itemIndex, 0);
  assert.deepEqual(
    extractPassages(normalized.text),
    evidencePassages(normalized.text).map((p) => ({ id: p.id, text: p.text })),
  );
});
test("investigation follows only actual public original-source links, not private endpoints or generic links", () => {
  assert.equal(publicUrl("https://127.0.0.1/internal"), null);
  assert.equal(publicUrl("https://192.168.1.1/foo"), null);
  assert.equal(publicUrl("http://example.org"), null);
  assert.deepEqual(
    originalLinks({
      ...article,
      markdown:
        article.markdown +
        "[fake](https://localhost/x) [nav](https://example.edu/privacy) [social](https://reddit.com/r/test)",
    }),
    [{ title: "Original study", url: "https://example.edu/research/study" }],
  );
});
test("failed optional investigations preserve discovered articles with limitations", async () => {
  let calls = 0;
  const p = await gatherReceipts({ queries: ["test"] }, async () => {
    if (calls++) throw Error("failure");
    return runner();
  });
  assert.equal(p.length, 1);
  assert.equal(p[0].evidenceSources.length, 0);
  assert.match(p[0].limitations[0], /could not be retrieved/);
});
test("one failed discovery lane does not erase another; all failed lanes are an explicit error", async () => {
  const p = await gatherReceipts(
    { queries: ["good", "bad"], investigate: false },
    async (_id, input) => {
      if (input.query === "bad") throw Error("failed");
      return runner();
    },
  );
  assert.equal(p.length, 1);
  assert.ok(p[0].limitations.length);
  await assert.rejects(
    gatherReceipts({ queries: ["bad"] }, async () => {
      throw Error("failed");
    }),
    /No discovery lane/,
  );
});
test("investigation results cannot invent a verification status or drop legacy Actor results", () => {
  const normalized = annotate(
    article,
    { id: "real-run", defaultDatasetId: "real-dataset" },
    3,
  );
  assert.equal((normalized.provenance as { itemIndex: number }).itemIndex, 3);
  assert.deepEqual(unpackReceipts([article]).articles, [article]);
});

test("timed-out child runs retain only real completed dataset records and disclose partial retrieval", async () => {
  const fetcher = (async (url: RequestInfo | URL) =>
    String(url).includes("/items?")
      ? Response.json([article])
      : Response.json({
          data: { id: "r", defaultDatasetId: "d", status: "TIMED-OUT" },
        })) as typeof fetch;
  const run = actorRunner("synthetic", () => {}, fetcher),
    packets = await gatherReceipts(
      { queries: ["A topic"], investigate: false },
      run,
    );
  assert.equal(packets[0].article.text, article.markdown);
  assert.ok(
    packets[0].limitations.some((l) => l.includes("retrieval was partial")),
  );
});
