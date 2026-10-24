/* Only the explicitly fixed demo and static assets are cached. Never cache live API data. */
const CACHE = 'us-shell-673322e13481';
const SHELL = ['/offline.html', '/offline.js', '/offline.css', '/demo-edition.json', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('us-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('authorization')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.ok) return response;
      } catch { /* Fall through to clearly labeled offline shell. */ }
      finally { clearTimeout(timer); }
      return (await caches.match('/offline.html')) || new Response('US is unavailable. Reconnect and reload.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }
  if (SHELL.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
