import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sw = readFileSync("public/sw.js", "utf8");
test("manifest has installable icons with real matching PNG dimensions", () => {
  const manifest = JSON.parse(
    readFileSync("public/manifest.webmanifest", "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.name && manifest.short_name && manifest.id);
  for (const icon of manifest.icons) {
    const png = readFileSync(`public${icon.src.split("?")[0]}`);
    const [width, height] = icon.sizes.split("x").map(Number);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
  assert.ok(
    manifest.icons.some(
      (icon: { purpose: string }) => icon.purpose === "maskable",
    ),
  );
});
function harness(fetcher: typeof fetch = fetch) {
  const listeners: Record<string, (event: any) => void> = {};
  const cached: string[] = [];
  const removed: string[] = [];
  const context = {
    URL,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetcher,
    self: {
      location: { origin: "https://us.example" },
      addEventListener: (name: string, fn: (event: any) => void) => {
        listeners[name] = fn;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => ({
        addAll: async (items: string[]) => {
          cached.push(...items);
        },
      }),
      match: async () => new Response("Offline saved edition"),
      keys: async () => ["us-shell-old", "another-app"],
      delete: async (name: string) => {
        removed.push(name);
      },
    },
  };
  vm.runInNewContext(sw, context);
  return { listeners, cached, removed };
}
test("service worker excludes APIs, POST, credentials and external origins", () => {
  const { listeners } = harness();
  let intercepted = false;
  for (const [url, method, headers] of [
    ["https://us.example/api/today", "GET", {}],
    ["https://us.example/api/run", "POST", {}],
    ["https://other.example/demo-edition.json", "GET", {}],
    [
      "https://us.example/demo-edition.json",
      "GET",
      { Authorization: "Bearer test" },
    ],
  ] as const) {
    listeners.fetch({
      request: { url, method, headers: new Headers(headers), mode: "cors" },
      respondWith: () => {
        intercepted = true;
      },
    });
  }
  assert.equal(intercepted, false);
});
test("offline navigation uses explicit saved-edition shell; install caches only safe local files", async () => {
  const { listeners, cached, removed } = harness((async () => {
    throw Error("offline");
  }) as typeof fetch);
  let pending: Promise<unknown> = Promise.resolve();
  listeners.install({
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  assert.ok(!cached.includes("/demo-edition.json"));
  assert.ok(cached.includes("/offline.html"));
  assert.ok(!cached.some((path) => path.startsWith("/api") || path === "/"));
  listeners.activate({
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(removed, ["us-shell-old"]);
  let response: Promise<Response> | undefined;
  listeners.fetch({
    request: {
      url: "https://us.example/",
      method: "GET",
      headers: new Headers(),
      mode: "navigate",
    },
    respondWith: (p: Promise<Response>) => {
      response = p;
    },
  });
  assert.equal(await (await response!).text(), "Offline saved edition");
});
test("the current offline shell includes reactions and never substitutes an archived demo", async () => {
  const { listeners, cached } = harness();
  let pending: Promise<unknown> = Promise.resolve();
  listeners.install({
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  for (const name of ["interesting", "insightful", "hopeful", "stressed"]) {
    const path = `/reactions/${name}.webp`;
    assert.ok(cached.includes(path));
    assert.ok(readFileSync(`public${path}`).length > 1000);
  }
  assert.ok(
    !cached.some(
      (path) => path.startsWith("/archive/") || path.startsWith("/demo-"),
    ),
  );
});
