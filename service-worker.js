/**
 * ============================================================================
 * SERVICE WORKER — caches the app shell so the UI (login/dashboard/admin
 * pages, CSS, JS) loads instantly and works offline. API calls always go to
 * the network (and fall back to the offline queue handled in js/api.js).
 * ============================================================================
 */
const CACHE_NAME = 'warehouse-tracker-v1';
const APP_SHELL = [
  './index.html',
  './dashboard.html',
  './admin.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/api.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/admin.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache/intercept API calls to Google Apps Script — always hit network.
  if (url.hostname.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
