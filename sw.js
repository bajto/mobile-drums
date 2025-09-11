// sw.js — v4: twarde odświeżenie cache + natychmiastowa aktywacja
const CACHE = 'drums-cache-v4';
const ASSETS = [
  './',
  './drums.html',
  './manifest.webmanifest',
  './icon-512.png',
];

// szybciej przejmij kontrolę nad starszą wersją
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(resp => resp || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return r;
    }).catch(() => caches.match('./drums.html')))
  );
});
