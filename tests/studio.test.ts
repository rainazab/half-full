import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actorRuns, flowStages, stageState } from "../lib/studio";
import { parseEdition } from "../lib/edition-schema";
import { checkpointSchema } from "../lib/run-checkpoint";
import { DailyStore } from "../lib/daily-store";
import { GET as studio } from "../app/api/studio/[date]/route";
import { GET as edition } from "../app/api/editions/[date]/route";
import {
  historicalQueries,
  defaultQueries,
} from "../actors/news-receipts/core.mjs";
import type { RunLogEntry, RunRecord } from "../lib/types";

const entry = (step: string, status: RunLogEntry["status"]): RunLogEntry => ({
  step,
  status,
  message: "Controlled test log",
  timestamp: "2026-10-24T12:00:00.000Z",
});
test("Studio distinguishes a validated draft, a storage failure and an actually published edition", () => {
  const publish = flowStages.find((s) => s.id === "publication")!;
  const logs = [entry("edition", "completed")];
  assert.equal(stageState(publish, logs, "running"), "running");
  assert.equal(stageState(publish, logs, "failed"), "failed");
  assert.equal(stageState(publish, logs, "completed"), "completed");
  const review = flowStages.find((s) => s.id === "editorial")!;
  assert.equal(
    stageState(
      review,
      [entry("anthropic.review", "completed"), entry("validate", "failed")],
      "failed",
    ),
    "failed",
  );
  const investigation = flowStages.find((s) => s.id === "investigation")!;
  assert.equal(
    stageState(
      investigation,
      [entry("investigation.limitation", "failed")],
      "completed",
    ),
    "limited",
  );
});

test("durable checkpoints survive adapter instances and retain only explicitly allowed fields", async () => {
  const data = new Map<string, unknown>();
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.pathname === "/v2/key-value-stores")
      return Response.json({ data: { id: "store" } });
    const key = decodeURIComponent(u.pathname.split("/").at(-1)!);
    if (init?.method === "PUT") {
      data.set(key, JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    return data.has(key)
      ? Response.json(data.get(key))
      : new Response(null, { status: 404 });
  }) as typeof fetch;
  const record: RunRecord = {
    date: "2026-10-24",
    id: "test-run",
    status: "running",
    createdAt: "2026-10-24T12:00:00.000Z",
    runLog: [entry("apify.start", "started")],
  };
  const first = new DailyStore("test", "test", fetcher, false);
  await first.saveRun({ ...record, apiKey: "never persist this" } as RunRecord);
  const next = new DailyStore("test", "test", fetcher, false);
  const restored = await next.getRun("2026-10-24");
  assert.equal(restored?.status, "running");
  assert.equal(restored?.runLog[0].step, "apify.start");
  assert.ok(!JSON.stringify([...data]).includes("never persist"));
  record.status = "failed";
  record.error = { code: "TEST_FAILURE", message: "Safe public reason" };
  await first.saveRun(record);
  assert.equal((await next.getRun("2026-10-24"))?.error?.code, "TEST_FAILURE");
  assert.equal(await next.getRun("2026-10-23"), null);
  assert.equal(
    checkpointSchema.safeParse({
      ...record,
      apify: { runId: "<unsafe>", datasetId: "dataset" },
    }).success,
    false,
  );
});

test("Studio actor links are traceable to retained source provenance or actual run IDs", () => {
  const result = parseEdition(
    JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
  );
  result.runLog = [
    {
      ...entry("apify.start", "started"),
      message: "Starting configured Actor real-actor; retrieval.",
    },
    {
      ...entry("apify.start", "completed"),
      message: "Apify run ID: actual-run; dataset ID: actual-dataset.",
    },
  ];
  const runs = actorRuns({ date: "2026-10-24", status: "completed", result });
  const parent = runs.find((r) => r.runId === "actual-run");
  assert.equal(parent?.datasetId, "actual-dataset");
  assert.equal(parent?.actorId, "real-actor");
  assert.ok(!runs.some((r) => r.runId === "invented"));
});

test("the public studio and edition routes reject dates outside the ten-year window before retrieval", async () => {
  for (const handler of [studio, edition]) {
    const response = await handler(new Request("http://localhost"), {
      params: Promise.resolve({ date: "2000-01-01" }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_DATE");
  }
});

test("modern historical searches are date-bounded and current retrieval keeps a consequential-news lane", () => {
  const queries = historicalQueries("2026-10-23");
  assert.ok(
    queries.every((q) => q.includes("after:2026-10-22 before:2026-10-24")),
  );
  assert.ok(!queries.some((q) => q.includes("news.bbc.co.uk/2/hi")));
  const current = defaultQueries(new Date("2026-10-24T12:00:00Z"));
  assert.ok(current.some((q) => /community|accessibility/.test(q)));
  assert.ok(current.some((q) => /policy|economy/.test(q)));
});
