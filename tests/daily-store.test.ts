import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DailyStore } from "../lib/daily-store";
import { parseEdition } from "../lib/edition-schema";
import { PipelineError } from "../lib/errors";
const fixture = () => {
  const result = parseEdition(
    JSON.parse(readFileSync("public/demo-edition.json", "utf8")),
  );
  result.edition.mode = "live";
  delete result.edition.demoInfo;
  return result;
};
test("daily store reuses a published date and releases a failed-attempt lock", async () => {
  const s = new DailyStore(undefined, "test", fetch, true);
  const release = await s.lock();
  await assert.rejects(
    s.lock(),
    (e: unknown) => e instanceof PipelineError && e.status === 409,
  );
  await release();
  const next = await s.lock();
  const original = await s.publish(fixture(), "2026-10-24");
  const changed = fixture();
  changed.edition.id = "should-not-replace";
  assert.equal(
    (await s.publish(changed, "2026-10-24")).edition.id,
    original.edition.id,
  );
  assert.equal((await s.list()).length, 1);
  await next();
  assert.equal(await s.get("2026-10-23"), null);
  const birthday = fixture();
  birthday.edition.id = "birthday-edition";
  await s.publish(birthday, "2000-01-01");
  assert.equal((await s.get("2026-10-24"))?.edition.id, original.edition.id);
  assert.equal((await s.get("2000-01-01"))?.edition.id, "birthday-edition");
  assert.equal((await s.list()).length, 2);

  await assert.rejects(s.get("2026-02-30"));
});
test("Apify-backed daily editions survive a new adapter instance; tokens stay in headers", async () => {
  const data = new Map<string, unknown>();
  const paths: string[] = [];
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    paths.push(u.href);
    assert.equal(
      (init!.headers as Record<string, string>).Authorization,
      "Bearer test-secret",
    );
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
  const first = new DailyStore("test-secret", "test", fetcher, false);
  const saved = await first.publish(fixture(), "2026-10-24");
  const second = new DailyStore("test-secret", "test", fetcher, false);
  assert.equal((await second.get("2026-10-24"))?.edition.id, saved.edition.id);
  assert.equal(
    (await second.byId(saved.edition.id))?.edition.date,
    "2026-10-24",
  );
  assert.equal((await second.list())[0].count, 5);
  assert.ok(paths.every((p) => !p.includes("test-secret")));
});
test("storage failure stops publication and does not fabricate a successful day", async () => {
  const s = new DailyStore(
    "test",
    "test",
    (async () => {
      throw Error("synthetic provider detail");
    }) as typeof fetch,
    false,
  );
  await assert.rejects(
    s.get("2026-10-24"),
    (e: unknown) =>
      e instanceof PipelineError &&
      e.code === "EDITION_STORAGE_UNAVAILABLE" &&
      !e.message.includes("synthetic"),
  );
});
test("distributed queue lock cannot be acquired by a second publisher and is released with its client key", async () => {
  let locked = false;
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.pathname === "/v2/request-queues")
      return Response.json({ data: { id: "queue" } });
    if (u.pathname.endsWith("/head/lock")) {
      const items = locked ? [] : [{ id: "request" }];
      locked = true;
      return Response.json({ data: { items } });
    }
    if (init?.method === "DELETE") {
      assert.ok(u.searchParams.get("clientKey"));
      locked = false;
      return new Response(null, { status: 204 });
    }
    return Response.json({ data: { requestId: "request" } });
  }) as typeof fetch;
  const a = new DailyStore("token", "test", fetcher, false),
    b = new DailyStore("token", "test", fetcher, false);
  const release = await a.lock();
  await assert.rejects(
    b.lock(),
    (e: unknown) => e instanceof PipelineError && e.status === 409,
  );
  await release();
  const next = await b.lock();
  await next();
});

test("generation budgets persist across server instances and fail closed on corrupt records", async () => {
  const records = new Map<string, unknown>();
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.pathname === "/v2/key-value-stores")
      return Response.json({ data: { id: "kv" } });
    const key = decodeURIComponent(u.pathname.split("/").at(-1)!);
    if (init?.method === "PUT") {
      records.set(key, JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    return records.has(key)
      ? Response.json(records.get(key))
      : new Response(null, { status: 404 });
  }) as typeof fetch;
  const a = new DailyStore("token", "test", fetcher, false),
    b = new DailyStore("token", "test", fetcher, false),
    now = new Date("2026-10-24T12:00:00Z");
  await a.admit("2024-04-10", now);
  await assert.rejects(b.admit("2024-04-10", now), /ten minutes/);
  records.set("GENERATION-BUDGET-2026-10-24", { corrupt: true });
  await assert.rejects(b.admit("2024-04-11", now));
});
test("publisher renews its lock and refuses publication after a missing renewal", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  let renewals = 0,
    missing = false;
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.pathname === "/v2/request-queues")
      return Response.json({ data: { id: "q" } });
    if (u.pathname.endsWith("/head/lock"))
      return Response.json({ data: { items: [{ id: "request" }] } });
    if (init?.method === "PUT") {
      renewals++;
      return missing
        ? new Response(null, { status: 404 })
        : Response.json({ data: { lockExpiresAt: "later" } });
    }
    return Response.json({ data: { requestId: "request" } });
  }) as typeof fetch;
  const store = new DailyStore("token", "test", fetcher, false),
    release = await store.lock();
  release.assertOwned?.();
  t.mock.timers.tick(90000);
  await new Promise(setImmediate);
  assert.equal(renewals, 1);
  release.assertOwned?.();
  missing = true;
  t.mock.timers.tick(90000);
  await new Promise(setImmediate);
  assert.throws(() => release.assertOwned?.(), /lock could not be renewed/);
  await release();
  t.mock.timers.reset();
});
