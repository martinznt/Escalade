// sw.js — hors ligne : l'application s'ouvre même sans réseau.
// Stratégie : réseau d'abord (mise à jour immédiate), cache en secours ; le shell complet est précaché à
// l'installation. SHELL doit contenir EXACTEMENT les fichiers servis par le Worker (tests/assets.test.mjs).
// La version du cache change à chaque déploiement : les anciens caches sont supprimés à l'activation.
// Une nouvelle version attend que l'utilisateur touche « Mettre à jour » (message SKIP_WAITING), sauf à la toute première installation.
const BUILD = 'dev'; // remplacé par le serveur par l'identifiant du déploiement Cloudflare
const CACHE = 'mes-seances-v8-29-0-' + BUILD;
const SHELL = ['/', '/index.html', '/style.css', '/boot.js', '/app.js', '/ui.js', '/state.js', '/views-home.js', '/views-progress.js', '/views-library.js', '/views-profile.js', '/views-settings.js', '/views-setup.js', '/install.js', '/questions.js', '/views-ai.js', '/tour.js', '/move.js', '/news.js', '/hr.js', '/fx.js', '/anim.js', '/timer.js', '/sound.js', '/climb.js', '/views-climb.js', '/motivation.js', '/views-motiv.js', '/program.js', '/views-program.js', '/views-coach.js', '/reminders.js', '/ics.js', '/layout.js', '/body.js', '/body-rules.js', '/intentions.js', '/views-gen.js', '/inbox.js', '/sources.js', '/srcui.js', '/catalog.js', '/views-catalog.js', '/qr.js', '/share.js', '/duo.js', '/scene.js', '/i18n.js', '/format.js', '/finder.js', '/find-ui.js', '/global.js', '/content.js', '/help.js', '/merge.js', '/sfilter.js', '/explain.js', '/climbplan.js', '/views-climbplan.js', '/surprise.js', '/guide.js', '/goaldone.js', '/nav.js', '/places.js', '/picker.js', '/hints.js', '/sportplan.js', '/catchup.js', '/phase.js', '/phaseplan.js', '/adminlist.js', '/sessionmeta.js', '/views-studio.js', '/intents.js', '/filters.js', '/budget.js', '/sessionchain.js', '/whatif.js', '/dna.js', '/strategy.js', '/knowledge.js', '/sessionedit.js', '/assess.js', '/views-assistant.js', '/loop.js', '/fit.js', '/aimplan.js', '/library-more.js', '/physique.js', '/player.js',
  '/engine.js', '/library.js', '/shared.js', '/items.js', '/model.js', '/grading.js', '/brain.js', '/estimate.js', '/generator.js', '/csv.js', '/search.js', '/anatomy.js', '/commands.js', '/outbox.js',
  '/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/robots.txt'];

self.addEventListener('install', (e) => {
  // Précache « tout ou rien » : une installation partielle garderait l'ancienne version active (pas d'écran blanc).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
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
// Rappels : la notification arrive vide ; on demande le texte au serveur (avec la session), puis on l'affiche.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let m = { title: 'Séances entraînement', body: 'Petit rappel : un peu d’entraînement aujourd’hui ?', url: '/#/home/dash' };
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch('/api/push/message?tz=' + encodeURIComponent(tz) + (sub ? '&endpoint=' + encodeURIComponent(sub.endpoint) : ''), { credentials: 'include', cache: 'no-store' });
      if (r.ok) { const j = await r.json(); m = { title: String(j.title || m.title).slice(0, 80), body: String(j.body || m.body).slice(0, 200), url: String(j.url || m.url).startsWith('/') ? j.url : m.url, silent: !!j.silent }; }
    } catch { /* hors ligne : texte par défaut */ }
    await self.registration.showNotification(m.title, { body: m.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'seances', silent: !!m.silent, data: { url: m.url } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (new URL(c.url).origin === location.origin) { await c.focus(); try { c.navigate(url); } catch { /* rien */ } return; }
    await self.clients.openWindow(url);
  })());
});
