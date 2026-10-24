import test from "node:test";
import assert from "node:assert/strict";
import { attachArticleImages, parseShareImage, publicHttpsUrl } from "../lib/article-image";
import { displayableMedia } from "../lib/media";
import type { ApprovedStory } from "../lib/types";

const story = (url: string) => ({ id: "s1", headline: "Test story", sources: [{ title: "T", url, publisher: "BBC News", publishedAt: null }], media: [] } as unknown as ApprovedStory);
const html = (meta: string) => `<html><head><title>x</title>${meta}</head><body>${"x".repeat(100)}</body></html>`;
const page = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

test("share image tags are parsed in any attribute order, preferring og:image", () => {
  const parsed = parseShareImage(html(`<meta content="https://cdn.pub.co.uk/a.jpg?w=1&amp;h=2" property="og:image"/><meta name="twitter:image" content="https://cdn.pub.co.uk/b.jpg"><meta property="og:image:alt" content="Protesters outside parliament">`), "https://pub.co.uk/story");
  assert.deepEqual(parsed, { url: "https://cdn.pub.co.uk/a.jpg?w=1&h=2", alt: "Protesters outside parliament" });
  assert.equal(parseShareImage(html(`<meta name="twitter:image:src" content="/img/c.jpg">`), "https://pub.co.uk/story")?.url, "https://pub.co.uk/img/c.jpg");
  assert.equal(parseShareImage(html(`<meta property="og:title" content="no image">`), "https://pub.co.uk/story"), undefined);
});

test("unsafe image and page URLs are refused", () => {
  for (const bad of ["http://pub.co.uk/a.jpg", "javascript:alert(1)", "https://127.0.0.1/a.jpg", "https://localhost/a.jpg", "https://user:pw@pub.co.uk/a.jpg", "https://[::1]/a.jpg", "https://printer.local/a.jpg"]) assert.equal(publicHttpsUrl(bad), undefined, bad);
  assert.equal(parseShareImage(html(`<meta property="og:image" content="https://10.0.0.1/a.jpg">`), "https://pub.co.uk/s"), undefined);
});

test("approved stories get an attributed publisher preview that displays", async () => {
  const s = story("https://www.bbc.com/news/articles/abc");
  const logs: string[] = [];
  await attachArticleImages([s], true, Date.now() + 60000, (_step, _status, message) => logs.push(message), async () => page(html(`<meta property="og:image" content="https://ichef.bbci.co.uk/x.jpg">`)));
  assert.equal(s.media?.[0].url, "https://ichef.bbci.co.uk/x.jpg");
  assert.equal(s.media?.[0].rights, "publisher-preview");
  assert.equal(s.media?.[0].sourceUrl, "https://www.bbc.com/news/articles/abc");
  assert.match(s.media![0].attribution, /BBC News/);
  assert.ok(displayableMedia(s.media![0]));
  assert.match(logs.at(-1)!, /1 of 1/);
});

test("redirects are re-checked and private redirect targets are never fetched", async () => {
  const fetched: string[] = [];
  const s = story("https://pub.co.uk/story");
  await attachArticleImages([s], true, Date.now() + 60000, () => {}, async (input) => {
    fetched.push(String(input));
    return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } });
  });
  assert.deepEqual(fetched, ["https://pub.co.uk/story"]);
  assert.deepEqual(s.media, []);
});

test("failures, disabled config and near deadlines leave stories unchanged", async () => {
  const s = story("https://pub.co.uk/story");
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error("network"); };
  await attachArticleImages([s], true, Date.now() + 60000, () => {}, fetcher);
  assert.deepEqual(s.media, []);
  await attachArticleImages([s], false, Date.now() + 60000, () => {}, fetcher);
  await attachArticleImages([s], true, Date.now() + 1000, () => {}, fetcher);
  assert.equal(calls, 1);
  await attachArticleImages([s], true, Date.now() + 60000, () => {}, async () => page("not found", { status: 404 }));
  assert.deepEqual(s.media, []);
});
