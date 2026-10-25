/* Only static shell assets are cached. The last opened live edition is saved by the reader on this device. Never cache API requests. */
const CACHE = "us-shell-atmosphere20261024-v4";
const SHELL = [
  "/offline.html",
  "/offline.js",
  "/offline.css",
  "/textures/half-full-pigment.png",
  "/media/php-logo.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/reactions/interesting.webp",
  "/reactions/insightful.webp",
  "/reactions/hopeful.webp",
  "/reactions/stressed.webp",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("us-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.headers.has("authorization")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await fetch(request, { signal: controller.signal });
          if (response.ok) return response;
        } catch {
          /* Fall through to clearly labeled offline shell. */
        } finally {
          clearTimeout(timer);
        }
        return (
          (await caches.match("/offline.html")) ||
          new Response("half full is unavailable. Reconnect and reload.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      })(),
    );
    return;
  }
  if (SHELL.includes(url.pathname) && !url.search) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(url.pathname);
        if (!cached) return fetch(request);
        return cached;
      })(),
    );
  }
});
