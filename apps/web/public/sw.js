self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.open('puzzles-static-v1').then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        // Only cache basic, same-origin, successful responses.
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic' &&
          new URL(request.url).origin === self.location.origin
        ) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        return cached || Response.error();
      }
    })
  );
});


