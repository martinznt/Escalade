// sw.js — hors ligne : l'application s'ouvre même sans réseau.
// Stratégie : réseau d'abord (mise à jour immédiate), cache en secours ; le shell complet est précaché à
// l'installation. SHELL doit contenir EXACTEMENT les fichiers servis par le Worker (tests/assets.test.mjs).
// La version du cache change à chaque livraison : les anciens caches sont supprimés à l'activation.
const CACHE = 'mes-seances-v8-0-0';
const SHELL = ['/', '/index.html', '/style.css', '/boot.js', '/app.js', '/ui.js', '/state.js', '/views-home.js', '/views-progress.js', '/views-library.js', '/views-profile.js', '/views-settings.js', '/player.js',
  '/engine.js', '/library.js', '/shared.js', '/items.js', '/model.js', '/grading.js', '/brain.js', '/estimate.js', '/generator.js', '/csv.js', '/search.js', '/anatomy.js', '/commands.js', '/outbox.js',
  '/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/robots.txt'];

self.addEventListener('install', (e) => {
  // Précache « tout ou rien » : une installation partielle garderait l'ancienne version active (pas d'écran blanc).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? '/' : url.pathname;
    try {
      const fresh = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 5000))]);
      if (fresh && fresh.ok && SHELL.includes(key)) cache.put(key, fresh.clone()).catch(() => {});
      if (fresh && fresh.ok) return fresh;
      return (await cache.match(key)) || fresh;
    } catch {
      return (await cache.match(key)) || (req.mode === 'navigate' ? await cache.match('/') : undefined) || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
