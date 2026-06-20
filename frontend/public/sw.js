const CACHE_NAME = 'qc-inspection-v1';

// On install — cache nothing (app requires live API)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// On activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, no offline caching for API calls
self.addEventListener('fetch', (event) => {
  // Let API calls go straight to network
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
