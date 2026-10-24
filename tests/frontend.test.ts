import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { navigate, progressLabel, swipeDirection } from "../lib/navigation";
import { parseEdition } from "../lib/edition-schema";
import { loadDemo, runLive, LiveRunError } from "../lib/client";
const fixture = JSON.parse(readFileSync("public/demo-edition.json", "utf8"));

test("reader preserves order and stops at first story and completion, including shorter editions", () => {
  for (const count of [1, 3, 4, 5]) {
    let index = 0;
    assert.equal(navigate(index, -1, count), 0);
    const visited = [];
    while (index < count) { visited.push(index); assert.equal(progressLabel(index, count), `${index + 1} of ${count}`); index = navigate(index, 1, count); }
    assert.deepEqual(visited, Array.from({length:count}, (_, i) => i));
    assert.equal(navigate(index, 1, count), count);
    assert.equal(progressLabel(index, count), `Complete · ${count} stories`);
    assert.equal(navigate(index, -1, count), count - 1);
  }
});
test("swipes distinguish horizontal intentional gestures from scrolling and taps", () => {
  assert.equal(swipeDirection(-100,20,300),1);
  assert.equal(swipeDirection(100,20,300),-1);
  for (const [dx,dy,time] of [[20,1,100],[80,100,300],[100,0,1500]]) assert.equal(swipeDirection(dx,dy,time),0);
});
test("fixed demo conforms to real contract and explicitly retains dates and provenance", () => {
  const result = parseEdition(fixture);
  assert.equal(result.edition.mode, "demo");
  assert.ok(result.edition.demoInfo?.originRunId);
  assert.ok(result.edition.stories.every((story) => story.evidence?.length && story.contentSupport?.length === 5));
  assert.ok(result.edition.stories.every((story) => story.sources.every((source) => source.publishedAt)));
  assert.throws(() => parseEdition({ ...fixture, stats: { ...fixture.stats, approved: 0 } }));
  assert.throws(() => parseEdition({ ...fixture, edition: { ...fixture.edition, demoInfo: undefined } }));
});
test("demo loading uses only the local snapshot and needs no live API", async () => {
  const paths: string[] = [];
  const result = await loadDemo((async (url) => { paths.push(String(url)); return Response.json(fixture); }) as typeof fetch);
  assert.deepEqual(paths, ["/demo-edition.json"]);
  assert.equal(result.edition.mode, "demo");
});
test("live failure stays a failure; fallback requires an explicit separate request", async () => {
  const paths: string[] = [];
  const fetcher = (async (url) => { paths.push(String(url)); return Response.json({ error: { code:"RATE_LIMIT",message:"Provider unavailable" },runLog:[] }, {status:502}); }) as typeof fetch;
  await assert.rejects(runLive(() => {},fetcher), LiveRunError);
  assert.deepEqual(paths,["/api/run"]);
  await assert.rejects(loadDemo(fetcher), /saved demo/);
});
test("streamed progress and result tolerate split network chunks", async () => {
  const events = [{type:"run",runId:"test-run"},{type:"log",entry:fixture.runLog[0]},{type:"result",result:fixture}];
  const serialized = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  const body = new ReadableStream({ start(controller) { for (let i=0;i<serialized.length;i+=17) controller.enqueue(new TextEncoder().encode(serialized.slice(i,i+17))); controller.close(); } });
  const received: string[] = [];
  const result = await runLive((event) => received.push(event.type), (async () => new Response(body, {headers:{"Content-Type":"application/x-ndjson"}})) as typeof fetch);
  assert.equal(result.edition.id,fixture.edition.id); assert.deepEqual(received,["run","log","result"]);
});
test("broken streams and mislabeled snapshots fail closed", async () => {
  await assert.rejects(runLive(() => {},(async () => new Response('{"type":"run","runId":"x"}\n',{headers:{"Content-Type":"application/x-ndjson"}})) as typeof fetch), /connection ended/);
  await assert.rejects(loadDemo((async () => Response.json({...fixture,edition:{...fixture.edition,mode:"live"}})) as typeof fetch), /not labeled/);
});
