// Service worker: caches the app's own files so the home-screen icon opens fast
// and works offline. Firebase traffic (other domains) is left alone; Firestore
// has its own offline cache.
// Bump VERSION whenever you deploy changes so phones pick them up.
const VERSION = 'v17';
const CACHE = `workout-crew-${VERSION}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'js/api.js', 'js/firebase-config.js', 'js/validate.js', 'js/stats.js', 'js/routines.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  const urls = SHELL.map((p) => new URL(p, self.registration.scope).href);
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(urls)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('workout-crew-') && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first so updates show up right away; cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)
        .then((hit) => hit || caches.match(new URL('index.html', self.registration.scope).href)))
  );
});
