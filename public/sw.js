// sw.js — hors ligne : l'application s'ouvre même sans réseau.
// Stratégie : réseau d'abord (mise à jour immédiate), cache en secours ; le shell complet est précaché à
// l'installation. SHELL doit contenir EXACTEMENT les fichiers servis par le Worker (tests/assets.test.mjs).
// La version du cache change à chaque déploiement : les anciens caches sont supprimés à l'activation.
// Une nouvelle version attend que l'utilisateur touche « Mettre à jour » (message SKIP_WAITING), sauf à la toute première installation.
const BUILD = 'dev'; // remplacé par le serveur par l'identifiant du déploiement Cloudflare
const CACHE = 'mes-seances-v8-33-0-' + BUILD;
const SHELL = ['/external.js', '/pathlinks.js', '/sportprefs.js', '/library-howto.js', '/choices.js', '/views-choices.js', '/integrations.js', '/views-integrations.js', '/', '/index.html', '/style.css', '/boot.js', '/app.js', '/ui.js', '/state.js', '/views-home.js', '/views-progress.js', '/views-library.js', '/views-profile.js', '/views-settings.js', '/views-setup.js', '/install.js', '/questions.js', '/views-ai.js', '/tour.js', '/move.js', '/news.js', '/hr.js', '/fx.js', '/anim.js', '/timer.js', '/sound.js', '/climb.js', '/views-climb.js', '/motivation.js', '/views-motiv.js', '/program.js', '/views-program.js', '/views-coach.js', '/reminders.js', '/ics.js', '/layout.js', '/body.js', '/body-rules.js', '/intentions.js', '/views-gen.js', '/inbox.js', '/sources.js', '/srcui.js', '/catalog.js', '/views-catalog.js', '/qr.js', '/share.js', '/duo.js', '/scene.js', '/i18n.js', '/format.js', '/finder.js', '/find-ui.js', '/global.js', '/content.js', '/help.js', '/merge.js', '/sfilter.js', '/explain.js', '/climbplan.js', '/views-climbplan.js', '/surprise.js', '/guide.js', '/goaldone.js', '/nav.js', '/places.js', '/picker.js', '/hints.js', '/sportplan.js', '/catchup.js', '/phase.js', '/phaseplan.js', '/adminlist.js', '/sessionmeta.js', '/views-studio.js', '/intents.js', '/filters.js', '/budget.js', '/sessionchain.js', '/whatif.js', '/dna.js', '/strategy.js', '/knowledge.js', '/sessionedit.js', '/assess.js', '/views-assistant.js', '/loop.js', '/fit.js', '/aimplan.js', '/library-more.js', '/physique.js', '/pagetour.js', '/adapt.js', '/views-adapt.js', '/group.js', '/views-group.js', '/bodycomp.js', '/coachbrain.js', '/views-forme.js', '/agenda.js', '/experience.js', '/views-agenda.js', '/views-experience.js', '/planning.js', '/views-planning.js', '/live.js', '/sports.js', '/views-sports.js', '/story.js', '/views-story.js', '/views-community.js', '/demo.js', '/catgen.js', '/gym.js', '/routines.js', '/views-routines.js', '/views-gym.js', '/player.js',
  '/objectivelinks.js', '/engine.js', '/library.js', '/shared.js', '/items.js', '/model.js', '/grading.js', '/brain.js', '/estimate.js', '/generator.js', '/csv.js', '/search.js', '/anatomy.js', '/commands.js', '/outbox.js',
  '/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/badge-96.png', '/robots.txt',
  '/app-icon-seances-v1-badge-96.png', '/app-icon-gold-v1-badge-96.png', '/app-icon-slate-v1-badge-96.png', '/app-icon-white-v1-badge-96.png', '/app-icon-forest-v1-badge-96.png', '/app-icon-ocean-v1-badge-96.png', '/app-icon-climb-v1-badge-96.png', '/app-icon-route-v1-badge-96.png', '/app-icon-rope-v1-badge-96.png', '/app-icon-mono-v1-badge-96.png', '/app-icon-terra-v1-badge-96.png', '/app-icons.js', '/app-icons.css', '/icon-art.js', '/admin-search.js', '/app-icon-seances-v1-180.png', '/app-icon-seances-v1-192.png', '/app-icon-seances-v1-512.png', '/app-icon-seances-v1-maskable-512.png', '/manifest-icons-seances-v1.json', '/app-icon-gold-v1-180.png', '/app-icon-gold-v1-192.png', '/app-icon-gold-v1-512.png', '/app-icon-gold-v1-maskable-512.png', '/manifest-icons-gold-v1.json', '/app-icon-slate-v1-180.png', '/app-icon-slate-v1-192.png', '/app-icon-slate-v1-512.png', '/app-icon-slate-v1-maskable-512.png', '/manifest-icons-slate-v1.json', '/app-icon-white-v1-180.png', '/app-icon-white-v1-192.png', '/app-icon-white-v1-512.png', '/app-icon-white-v1-maskable-512.png', '/manifest-icons-white-v1.json', '/app-icon-forest-v1-180.png', '/app-icon-forest-v1-192.png', '/app-icon-forest-v1-512.png', '/app-icon-forest-v1-maskable-512.png', '/manifest-icons-forest-v1.json', '/app-icon-ocean-v1-180.png', '/app-icon-ocean-v1-192.png', '/app-icon-ocean-v1-512.png', '/app-icon-ocean-v1-maskable-512.png', '/manifest-icons-ocean-v1.json', '/app-icon-climb-v1-180.png', '/app-icon-climb-v1-192.png', '/app-icon-climb-v1-512.png', '/app-icon-climb-v1-maskable-512.png', '/manifest-icons-climb-v1.json', '/app-icon-route-v1-180.png', '/app-icon-route-v1-192.png', '/app-icon-route-v1-512.png', '/app-icon-route-v1-maskable-512.png', '/manifest-icons-route-v1.json', '/app-icon-rope-v1-180.png', '/app-icon-rope-v1-192.png', '/app-icon-rope-v1-512.png', '/app-icon-rope-v1-maskable-512.png', '/manifest-icons-rope-v1.json', '/app-icon-mono-v1-180.png', '/app-icon-mono-v1-192.png', '/app-icon-mono-v1-512.png', '/app-icon-mono-v1-maskable-512.png', '/manifest-icons-mono-v1.json', '/app-icon-terra-v1-180.png', '/app-icon-terra-v1-192.png', '/app-icon-terra-v1-512.png', '/app-icon-terra-v1-maskable-512.png', '/manifest-icons-terra-v1.json'];

self.addEventListener('install', (e) => {
  // Les appels /api/ vont directement au réseau sans réveiller le Service Worker (navigateurs qui le permettent) :
  // moins d'attente, et une nouvelle version n'attend pas la fin de ces appels pour s'activer.
  try { if (e.addRoutes && typeof URLPattern === 'function') e.addRoutes([{ condition: { urlPattern: new URLPattern({ pathname: '/api/*' }) }, source: 'network' }]).catch(() => {}); } catch { /* non pris en charge */ }
  // Précache « tout ou rien » : une installation partielle garderait l'ancienne version active (pas d'écran blanc).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const token=url.searchParams.get('appIconToken'),customInstallation=['/','/index.html'].includes(url.pathname)&&url.searchParams.get('appIcon')==='custom'&&/^[A-Za-z0-9_-]{43}$/.test(token||'');
    const installation=customInstallation||(['/', '/index.html'].includes(url.pathname)&&SHELL.includes('/manifest-icons-'+url.searchParams.get('appIcon')+'-v1.json'));
    const customResource=/^\/app-icons-custom\/[A-Za-z0-9_-]{43}\/(192\.png|512\.png|180\.png|maskable-512\.png|badge-96\.png|manifest\.json)$/.test(url.pathname);
    // Une page préparée avec une autre icône ne remplace jamais le HTML par défaut.
    const key = installation ? url.pathname + url.search : req.mode === 'navigate' ? '/' : url.pathname;
    const fromCache = async () => {
      const stored = await cache.match(key); if (stored) return stored;
      const shell = req.mode === 'navigate' || installation ? await cache.match('/') : null;
      if (!shell || !installation) return shell;
      // Une nouvelle page de choix reste correcte hors ligne, avant même le démarrage de l'app.
      const id=url.searchParams.get('appIcon'),path='/app-icons-custom/'+token+'/';
      if(customInstallation&&!await cache.match(path+'manifest.json'))return shell;
      const manifest=customInstallation?path+'manifest.json':'/manifest-icons-'+id+'-v1.json',apple=customInstallation?path+'180.png':'/app-icon-'+id+'-v1-180.png';
      const html=(await shell.text()).replace(/(<link\s+rel="manifest"\s+href=")[^"]*(")/,'$1'+manifest+'$2').replace(/(<link\s+rel="apple-touch-icon"\s+href=")[^"]*(")/,'$1'+apple+'$2');
      const headers = new Headers(shell.headers); headers.delete('Content-Length'); headers.delete('Content-Encoding');
      return new Response(html, { status: shell.status, headers });
    };
    try {
      const fresh = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 5000))]);
      if (fresh && fresh.ok && (SHELL.includes(key) || installation || customResource)) cache.put(key, fresh.clone()).catch(() => {});
      if (fresh && fresh.ok) return fresh;
      return (await fromCache()) || fresh;
    } catch {
      return (await fromCache()) || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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
      if (r.ok) { const j = await r.json(); m = { title: String(j.title || m.title).slice(0, 80), body: String(j.body || m.body).slice(0, 200), url: String(j.url || m.url).startsWith('/') ? j.url : m.url, silent: !!j.silent, icon: j.icon, badge: j.badge }; }
    } catch { /* hors ligne : texte par défaut */ }
    const localImage = (value, fallback) => typeof value === 'string' && /^\/(?:app-icon-[a-z]+-v1-(?:192|badge-96)\.png|app-icons-custom\/[A-Za-z0-9_-]{43}\/(?:192|badge-96)\.png|badge-96\.png)$/.test(value) ? value : fallback;
    await self.registration.showNotification(m.title, { body: m.body, icon: localImage(m.icon, '/icon-192.png'), badge: localImage(m.badge, '/badge-96.png'), tag: 'seances', silent: !!m.silent, data: { url: m.url } });
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
