// =====================================================
// Service Worker v4 — Smart Cache + Offline Support
// =====================================================
const CACHE_NAME = 'hola-v4';
const STATIC_CACHE = 'hola-static-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/admin.css',
  '/css/print.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/firebase.js',
  '/js/print.js',
  '/js/sessions.js',
  '/js/ui.js',
  '/js/vouchers.js',
  '/config/constants.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Network-first for Firebase (always fresh)
  if (url.hostname.includes('firebase') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// Handle skip waiting message from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
