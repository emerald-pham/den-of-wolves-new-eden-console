const CACHE_PREFIX = 'new-eden-console-shell-';
const CACHE_NAME = 'new-eden-console-shell-dev';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/dradis-ball-180.png',
  '/icons/dradis-ball-192.png',
  '/icons/dradis-ball-512.png',
  '/icons/dradis-ball-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A new worker stays waiting until the player explicitly applies the update.
// Older versioned caches remain available as a fallback while an old page is
// still controlled by this worker; cleanup is deliberately non-destructive.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

async function matchCached(request) {
  const currentCache = await caches.open(CACHE_NAME);
  const current = await currentCache.match(request);
  if (current) return current;

  // Keep older complete shells available during the short window where an
  // already-open page is still running code from its previous build.
  for (const cacheName of await caches.keys()) {
    if (!cacheName.startsWith(CACHE_PREFIX) || cacheName === CACHE_NAME) continue;
    const cached = await caches.open(cacheName).then((cache) => cache.match(request));
    if (cached) return cached;
  }
  return undefined;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await matchCached(request)) ?? (await matchCached('/index.html'));
  }
}

async function cacheFirst(request) {
  const cached = await matchCached(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(event.request));
  }
});
