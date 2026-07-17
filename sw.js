'use strict';
const CACHE = 'rooster-v3';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

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
  // Skip cross-origin requests (CDN, fonts, API)
  if (!req.url.startsWith(self.location.origin)) return;

  // Network-first for the HTML document so schedule updates show immediately;
  // fall back to the cached copy when offline.
  const isDoc = req.mode === 'navigate' ||
                req.destination === 'document' ||
                req.url.endsWith('/') ||
                req.url.endsWith('index.html');

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest).
  e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
