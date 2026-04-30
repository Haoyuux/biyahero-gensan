const TILE_CACHE = 'fetch-offline-map-v1';
const TILE_HOST_RE = /(^|\.)tile\.openstreetmap\.org$/;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!TILE_HOST_RE.test(url.hostname) || !url.pathname.endsWith('.png')) return;

  event.respondWith((async () => {
    const cache = await caches.open(TILE_CACHE);

    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const exact = await cache.match(event.request);
      if (exact) return exact;

      const keys = await cache.keys();
      const sameTile = keys.find((request) => {
        const cachedUrl = new URL(request.url);
        return TILE_HOST_RE.test(cachedUrl.hostname) && cachedUrl.pathname === url.pathname;
      });

      if (sameTile) {
        const cached = await cache.match(sameTile);
        if (cached) return cached;
      }

      return new Response('', { status: 504, statusText: 'Offline map tile unavailable' });
    }
  })());
});
