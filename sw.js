'use strict';
const CACHE = 'rooster-v6';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './oktober-2026.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (!req.url.startsWith(self.location.origin)) return;

  const isDoc = req.mode === 'navigate' ||
                req.destination === 'document' ||
                req.url.endsWith('/') ||
                req.url.endsWith('index.html');

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then(res => {
          // Never store an error page as the offline copy.
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || Response.error()))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok && req.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
