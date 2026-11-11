// KeyNest Security-Hardened Service Worker (v1)
// Enables PWA installation while STRICTLY refusing to cache API calls, Supabase traffic,
// or sensitive dynamic vault documents (per KeyNest Security Spec §7.3).

const STATIC_CACHE = 'keynest-static-v1';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept or cache external origins (Supabase, Gemini, etc.) or internal /api routes
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Only cache immutable static icons/manifest/fonts; always fetch app HTML & scripts fresh
  const isStaticAsset =
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/icons/');

  if (!isStaticAsset) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});

