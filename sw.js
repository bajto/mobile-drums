// sw.js — v8 (robust fetch routing)
// Zmiany: cache bump, tylko same-origin, network-first dla nawigacji, cache-first dla statyk

const CACHE = 'drums-cache-v13';
const CORE = [
  './',
  './drums.html',
  './manifest.webmanifest',
  './icon-512.png',
];

// Pomocnicze
async function putSafe(cacheName, req, resp) {
  try {
    const c = await caches.open(cacheName);
    await c.put(req, resp);
  } catch (_) { /* cicho */ }
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Włącz preload (jeśli wspierane)
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    // Sprzątanie starych cache
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Tylko GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Omijamy cross-origin (np. audio z GitHuba) – niech idzie normalnie przez sieć
  if (url.origin !== location.origin) {
    return; // pozwól przeglądarce obsłużyć
  }

  // NAVIGATION: network-first, fallback do cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        // Jeśli dostępny navigation preload – skorzystaj
        const prel = await e.preloadResponse;
        if (prel) return prel;

        const net = await fetch(req);
        // Podmień cache w tle
        putSafe(CACHE, req, net.clone());
        return net;
      } catch (_) {
        // Offline fallback
        const c = await caches.open(CACHE);
        const cached = await c.match('./drums.html');
        return cached || new Response('<!doctype html><title>Offline</title><h1>Offline</h1>', { headers:{'Content-Type':'text/html'} });
      }
    })());
    return;
  }

  // STATYKI: cache-first z aktualizacją w tle
  // (obrazy, manifest, potencjalne style/script jeśli dojdą)
  const dest = req.destination; // 'document'|'script'|'style'|'image'|'font'|'manifest'|...
  const isStatic = ['style','script','image','font','manifest'].includes(dest) || CORE.includes(url.pathname) || CORE.includes('./' + url.pathname.split('/').pop());

  if (isStatic) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchAndUpdate = fetch(req).then(resp => {
        // Tylko 200 i basic (same-origin)
        if (resp && resp.status === 200 && resp.type === 'basic') {
          putSafe(CACHE, req, resp.clone());
        }
        return resp;
      }).catch(() => cached);

      // Jeśli mamy w cache – oddaj od razu, a sieć w tle
      if (cached) { return cached; }
      // Jeśli nie – spróbuj sieć, jak padnie to nic nie poradzimy (poza navigacją)
      return fetchAndUpdate;
    })());
    return;
  }

  // Reszta same-origin (np. inne GET-y) – network z fallbackiem do cache, a potem do drums.html
  e.respondWith((async () => {
    try {
      const net = await fetch(req);
      if (net && net.status === 200 && net.type === 'basic') {
        putSafe(CACHE, req, net.clone());
      }
      return net;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Ostateczny fallback
      const home = await caches.match('./drums.html');
      return home || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
