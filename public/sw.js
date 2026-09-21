// sw.js — hors ligne : l'appli s'ouvre même sans réseau. Réseau d'abord (mises à jour immédiates), cache en secours.
const CACHE = 'seances-entrainement-v6-0';
const SHELL = ['/', '/index.html', '/style.css', '/boot.js', '/app.js', '/engine.js', '/library.js', '/shared.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 4000))]);
      if (fresh && fresh.ok) {
        cache.put(req.mode === 'navigate' ? '/' : req, fresh.clone()).catch(() => {});
        return fresh;
      }
      const fallback = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('/') : undefined);
      return fallback || fresh || Response.error();
    } catch {
      return (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('/') : undefined) || Response.error();
    }
  })());
});
