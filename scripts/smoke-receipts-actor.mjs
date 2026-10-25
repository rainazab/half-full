// One bounded private-Actor smoke test. Only public news and non-secret run metadata are saved.
import env from "@next/env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
const token = process.env.APIFY_API_TOKEN,
  id = process.env.APIFY_RECEIPTS_ACTOR_ID;
if (!token || !id)
  throw Error("Configure private receipts Actor credentials first.");
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.apify.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error(`Apify HTTP ${r.status}`);
  return r.json();
};
const actor = (await api(`/actors/${encodeURIComponent(id)}`)).data;
assert.equal(actor.isPublic, false, "Smoke testing requires a private Actor");
const input = {
  articleUrl: "https://www.bbc.com/news/articles/c3qjnwye0ep5o",
  investigate: false,
  maxResultsPerQuery: 3,
  budgetMs: 45000,
};
let run = (
  await api(`/actors/${encodeURIComponent(id)}/runs?timeout=65&memory=256`, {
    method: "POST",
    body: JSON.stringify(input),
  })
).data;
console.log(
  JSON.stringify({
    runId: run.id,
    datasetId: run.defaultDatasetId,
    status: run.status,
  }),
);
const deadline = Date.now() + 75000;
while (
  !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) &&
  Date.now() < deadline
)
  run = (await api(`/actor-runs/${run.id}?waitForFinish=10`)).data;
assert.equal(run.status, "SUCCEEDED");
const items = await api(
  `/datasets/${run.defaultDatasetId}/items?clean=true&limit=10`,
);
assert.ok(items.length > 0);
for (const p of items) {
  assert.equal(p.schemaVersion, "us-receipts/1");
  assert.equal(p.assessment, "requires-editorial-review");
  const a = p.article;
  assert.ok(a.text.length > 500);
  assert.equal(
    a.provenance.contentHash,
    createHash("sha256").update(a.text).digest("hex"),
  );
  assert.ok(
    a.provenance.runId &&
      a.provenance.datasetId &&
      Number.isInteger(a.provenance.itemIndex),
  );
  assert.ok(
    a.passages.length && a.passages.every((p) => a.text.includes(p.text)),
  );
}
const result = {
  actorId: id,
  buildId: run.buildId,
  runId: run.id,
  datasetId: run.defaultDatasetId,
  status: run.status,
  itemCount: items.length,
  usageTotalUsd: run.usageTotalUsd,
  childRuns: items[0].retrieval?.runs,
};
await mkdir("generated", { recursive: true });
await writeFile(
  "generated/master-actor-smoke.json",
  JSON.stringify({ result, input, items }, null, 2),
);
console.log(JSON.stringify(result));
