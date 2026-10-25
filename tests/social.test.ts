import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeSocial, relevantPosts, socialQueries } from "../lib/social";
import { enrichStories } from "../lib/enrichment";
import { parseEdition } from "../lib/edition-schema";
import type { AppConfig } from "../lib/config";
const stories = () =>
  parseEdition(JSON.parse(readFileSync("public/demo-edition.json", "utf8")))
    .edition.stories;
const now = new Date("2026-10-24T12:00:00Z");
const row = {
  id: "1abcdef",
  title: "PHP security flaws require patches",
  body: "How should website maintainers patch these flaws?",
  createdAt: "2026-10-23T12:00:00Z",
  url: "https://external.example/news",
};
test("Reddit posts retain real IDs, dates, source URLs and literal questions", () => {
  const [p] = normalizeSocial([row], now);
  assert.equal(p.url, "https://www.reddit.com/comments/1abcdef/");
  assert.equal(p.questions[0], row.body);
  assert.equal(p.platform, "Reddit");
});
test("social normalization drops duplicates, malformed, stale, NSFW and undated results", () => {
  assert.equal(
    normalizeSocial(
      [
        row,
        row,
        { ...row, id: "1xxxxxx" },
        { ...row, id: "1yyyyyy", isNsfw: true },
        { ...row, id: "1zzzzzz", createdAt: "2020-01-01" },
        { title: "Missing" },
        null,
      ],
      now,
    ).length,
    1,
  );
});
test("social relevance requires headline anchors, not incidental words in a long body", () => {
  const s = stories()[0];
  const posts = normalizeSocial(
    [
      row,
      {
        ...row,
        id: "1bbbbbb",
        title: "An unrelated argument",
        body: "PHP security flaws " + row.body,
      },
    ],
    now,
  );
  assert.equal(relevantPosts(s, posts).length, 1);
  assert.equal(socialQueries(stories()).length, 5);
});
const config: AppConfig = {
  editor: {
    provider: "anthropic",
    label: "Anthropic Claude",
    model: "test",
    apiKey: "synthetic",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    modelUsesDefault: true,
  },
  apifyToken: "synthetic-token",
  actorId: "apify~rag-web-browser",
  actorInput: {},
  social: { enabled: true, actorId: "apify~reddit-scraper" },
};
test("one bounded social Actor batch enriches valid stories and logs public IDs", async () => {
  const s = stories();
  s.forEach((v) => delete v.socialContext);
  let calls = 0;
  const logs: string[] = [];
  await enrichStories(
    s,
    config,
    Date.now() + 55000,
    (_step, _status, message) => logs.push(message),
    (async (_url, init) => {
      calls++;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.searchQueries.length, 5);
        assert.equal(body.maxSearchResultsPerQuery, 3);
        return Response.json({
          data: {
            id: "run-id",
            defaultDatasetId: "dataset-id",
            status: "SUCCEEDED",
          },
        });
      }
      return Response.json([{ ...row, createdAt: new Date().toISOString() }]);
    }) as typeof fetch,
    async (stories, posts) => new Set([`${stories[0].id}/${posts[0].id}`]),
    async () => new Map(),
  );
  assert.equal(calls, 2);
  assert.equal(s[0].socialContext?.posts.length, 1);
  assert.ok(logs.some((l) => l.includes("dataset-id")));
  assert.ok(!logs.join().includes("synthetic-token"));
});
test("optional social failures preserve the entire approved edition", async () => {
  for (const failure of [
    new Response("secret", { status: 429 }),
    new Response("bad-json"),
    Response.json({
      data: { id: "r", defaultDatasetId: "d", status: "FAILED" },
    }),
  ]) {
    const s = stories(),
      before = JSON.stringify(s);
    const status: string[] = [];
    await enrichStories(
      s,
      config,
      Date.now() + 55000,
      (_step, state) => status.push(state),
      (async () => failure) as typeof fetch,
    );
    assert.equal(JSON.stringify(s), before);
    assert.ok(status.includes("failed"));
  }
});
test("insufficient enrichment budget and disabled config make no external calls", async () => {
  for (const c of [config, { ...config, social: undefined }]) {
    let calls = 0;
    await enrichStories(stories(), c, Date.now() + 100, () => {}, (async () => {
      calls++;
      throw Error();
    }) as typeof fetch);
    assert.equal(calls, 0);
  }
});
test("model relevance decisions must use actual story/post IDs and verbatim public text", async () => {
  const { validateSocialMatches } = await import("../lib/social-review");
  const s = stories(),
    p = normalizeSocial([row], now);
  assert.equal(
    validateSocialMatches(
      {
        matches: [
          { storyId: s[0].id, postId: p[0].id, supportingPostQuote: row.title },
        ],
      },
      s,
      p,
    ).size,
    1,
  );
  for (const match of [
    { storyId: "fake", postId: p[0].id, supportingPostQuote: row.title },
    {
      storyId: s[0].id,
      postId: p[0].id,
      supportingPostQuote: "An invented quotation absent from the public post",
    },
  ])
    assert.equal(validateSocialMatches({ matches: [match] }, s, p).size, 0);
});

test("historical editions never retrieve today's public conversation", async () => {
  let calls = 0;
  await enrichStories(
    stories(),
    { ...config, editionDate: "2024-04-09" },
    Date.now() + 55000,
    () => {},
    (async () => {
      calls++;
      throw Error();
    }) as typeof fetch,
  );
  assert.equal(calls, 0);
});
test("failed optional answer review keeps approved stories and relevant context", async () => {
  const s = stories();
  const logs: string[] = [];
  await enrichStories(
    s,
    config,
    Date.now() + 55000,
    (_step, _status, message) => logs.push(message),
    (async (_url, init) =>
      init?.method === "POST"
        ? Response.json({
            data: { id: "r", defaultDatasetId: "d", status: "SUCCEEDED" },
          })
        : Response.json([
            { ...row, createdAt: new Date().toISOString() },
          ])) as typeof fetch,
    async (stories, posts) => new Set([`${stories[0].id}/${posts[0].id}`]),
    async () => {
      throw Error("support review unavailable");
    },
  );
  assert.equal(s.length, 5);
  assert.equal(s[0].publicQuestion, undefined);
  assert.ok(logs.some((l) => l.includes("no answer was added")));
});
