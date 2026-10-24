/* Only the explicitly fixed demo and static assets are cached. Never cache live API data. */
const CACHE = 'us-shell-db24d4eb9403';
const DEMO_ASSETS = ["/demo-audio/d3c87bb89b92038f1477.mp3","/demo-audio/bedb88c23577eab0fcdf.mp3","/demo-audio/08e027eed04a10891fd2.mp3","/demo-audio/b60866b12eacc3f70676.mp3","/demo-audio/ed73d8e3e8b80f303630.mp3","/media/php-logo.png"];
const SHELL = ['/offline.html', '/offline-puzzle.js', '/demo-puzzle.json', '/offline.js', '/offline.css', '/demo-edition.json', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', ...DEMO_ASSETS];
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
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname);
      if (!cached) return fetch(request);
      const range = request.headers.get('range');
      if (!range || !url.pathname.startsWith('/demo-audio/')) return cached;
      const bytes = await cached.arrayBuffer();
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
      const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]),bytes.byteLength-1) : bytes.byteLength-1;
      if (start > end || start >= bytes.byteLength) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
      return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,'Accept-Ranges':'bytes'}});
    })());
  }
});
