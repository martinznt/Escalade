// tests/push-ics.test.mjs — rappels (Web Push VAPID, cron, fuseaux) et export agenda (.ics).
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { localNow, isDue, runReminders, vapidAuth, unb64u, updateNotice, messageFor, broadcastNotice, flushNotices, runCalendarReminders, calendarDue } from '../server/push.js';
import { occurrenceChange, agendaEvents } from '../public/agenda.js';
import { notifyDeployment } from '../scripts/notify-deployment.mjs';
import { buildIcs, gcalLink } from '../public/ics.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

console.log('Rappels et agenda');
const EP = 'https://fcm.googleapis.com/fcm/send/abc123';
await ok('fuseau horaire : jour et heure locaux ; rappel dû une seule fois, dans les 3 h', async () => {
  const t = Date.UTC(2026, 8, 28, 16, 5); // lundi 18:05 à Paris (UTC+2)
  assert.deepEqual(localNow('Europe/Paris', t), { day: 0, hm: '18:05', ymd: '2026-09-28' });
  const sub = { days: '[0,2]', hour: '18:00', tz: 'Europe/Paris', last_day: '' };
  assert.equal(isDue(sub, t), true); assert.equal(isDue({ ...sub, last_day: '2026-09-28' }, t), false, 'déjà envoyé');
  assert.equal(isDue({ ...sub, hour: '18:30' }, t), false, 'pas encore l’heure'); assert.equal(isDue({ ...sub, days: '[1]' }, t), false, 'pas un jour choisi');
  assert.equal(isDue({ ...sub, hour: '14:00' }, t), false, 'trop tard (plus de 3 h)');
  assert.equal(localNow('Pas/Un/Fuseau', t).hm, '18:05', 'fuseau invalide : Paris');
});
await ok('abonnement : compte requis, services de notification reconnus seulement, 5 appareils max', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('rappel');
  assert.equal((await new Client(env).post('/api/push/subscribe', { endpoint: EP })).status, 401);
  assert.equal((await u.post('/api/push/subscribe', { endpoint: 'https://evil.example/x', days: [0] })).status, 400, 'hôte inconnu refusé');
  assert.equal((await u.post('/api/push/subscribe', { endpoint: 'http://fcm.googleapis.com/x' })).status, 400);
  const r = await u.post('/api/push/subscribe', { endpoint: EP, days: [0, 2, 9, 'x'], hour: '25:00', tz: 'Europe/Paris' });
  assert.equal(r.status, 200); assert.deepEqual(r.data.days, [0, 2]); assert.equal(r.data.hour, '18:00');
  for (let k = 0; k < 4; k++) assert.equal((await u.post('/api/push/subscribe', { endpoint: EP + k, days: [0] })).status, 200);
  assert.equal((await u.post('/api/push/subscribe', { endpoint: EP + 'x', days: [0] })).status, 409);
  const key = (await new Client(env).get('/api/push/key')).data.key; assert.equal(unb64u(key).length, 65, 'clé publique P-256 brute');
  assert.equal((await new Client(env).get('/api/push/key')).data.key, key, 'clé stable');
});
await ok('cron : envoie les rappels dus avec un JWT VAPID vérifiable, supprime les abonnements expirés', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('cronuser');
  await u.post('/api/push/subscribe', { endpoint: EP, days: [0], hour: '18:00', tz: 'Europe/Paris' });
  await u.post('/api/push/subscribe', { endpoint: EP + 'gone', days: [0], hour: '18:00', tz: 'Europe/Paris' });
  const calls = [];
  const f = async (url, o) => { calls.push({ url, o }); return new Response(null, { status: url.endsWith('gone') ? 410 : 201 }); };
  const t = Date.UTC(2026, 8, 28, 16, 10);
  assert.equal(await runReminders(env, t, f), 1); assert.equal(calls.length, 2);
  const auth = calls[0].o.headers.Authorization, m = auth.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, auth); const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
  assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.ok(claims.exp > Date.now() / 1000);
  const pub = await crypto.subtle.importKey('raw', unb64u(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`)), 'signature valide');
  assert.equal(calls[0].o.headers['Content-Length'], '0', 'aucun contenu personnel dans la notification');
  calls.length = 0; assert.equal(await runReminders(env, t + 15 * 60000, f), 0); assert.equal(calls.length, 0, 'pas deux fois le même jour, abonnement expiré supprimé');
  assert.equal((await vapidAuth(env, EP)).TTL, '3600');
});
await ok('texte du rappel : séance du programme du jour, sinon message simple ; route message', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('msguser');
  const today = localNow('Europe/Paris').ymd;
  await u.post('/api/items', { changes: [{ c: 'program', id: 'pg1', u: Date.now(), d: { name: 'Devenir plus fort · 6 semaines', goal: 'force', status: 'active', weeks: 6, perWeek: 3, days: ['0'], minutes: 45, start: today, sessions: [{ i: 0, week: 2, date: today, phase: 'build', minutes: 45 }] } }] });
  const r = await u.get('/api/push/message?tz=Europe/Paris'); assert.match(r.data.body, /Devenir plus fort · semaine 2 · 45 min/);
  const anon = await new Client(env).get('/api/push/message'); assert.equal(anon.status, 200); assert.ok(!/Devenir/.test(anon.data.body));
});
await ok('suppression du compte : abonnements supprimés', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('bye', 'motdepasse1');
  await u.post('/api/push/subscribe', { endpoint: EP, days: [0] });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) c FROM push_subs').first()).c, 1);
  const del = await u.post('/api/auth/delete', { password: 'motdepasse1' }); assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) c FROM push_subs').first()).c, 0);
});
await ok('agenda .ics : événements valides, heure locale, rappel 30 min avant ; lien Google', async () => {
  const ics = buildIcs([{ uid: 'a1', title: 'Force, semaine 2; bonne séance', date: '2026-09-28', time: '18:30', minutes: 45 }], Date.UTC(2026, 8, 1));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /DTSTART:20260928T183000\r\n/); assert.match(ics, /DTEND:20260928T191500\r\n/);
  assert.match(ics, /SUMMARY:Force\\, semaine 2\\; bonne séance/); assert.match(ics, /TRIGGER:-PT30M/); assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
  assert.match(gcalLink({ title: 'X', date: '2026-09-28', time: '23:30', minutes: 60 }), /dates=20260928T233000\/20260929T003000/);
});
await ok('types : rappel non voulu = pas de rappel ; mise à jour annoncée une fois par déploiement ; message selon ce qui l’a déclenché', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('typeuser');
  await u.post('/api/push/subscribe', { endpoint: EP + 'a', days: [0], hour: '18:00', types: ['update'], silent: true });
  await u.post('/api/push/subscribe', { endpoint: EP + 'b', days: [0], hour: '18:00', types: ['reminder', 'update'] });
  const calls = []; const f = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  assert.equal(await runReminders(env, Date.UTC(2026, 8, 28, 16, 10), f), 1); assert.deepEqual(calls, [EP + 'b'], 'seul l’appareil qui veut des rappels');
  calls.length = 0;
  assert.equal(await updateNotice(env, 'build-1', f), 0, 'premier déploiement : retenu sans prévenir');
  assert.equal(await updateNotice(env, 'build-1', f), 0, 'même version : rien');
  assert.equal(await updateNotice(env, 'build-2', f), 2); assert.equal(await updateNotice(env, 'dev', f), 0);
  const uid = (await env.DB.prepare('SELECT id FROM users WHERE username=?').bind('typeuser').first()).id;
  const m = await messageFor(env, EP + 'a', uid, 'Europe/Paris'); assert.match(m.title, /mise à jour/i); assert.equal(m.silent, true); assert.match(m.url, /news=1/);
  const m2 = await messageFor(env, EP + 'a', uid, 'Europe/Paris'); assert.doesNotMatch(m2.title, /mise à jour/i, 'message consommé une seule fois');
  const other = new Client(env); await other.register('autreuser');
  const oid = (await env.DB.prepare('SELECT id FROM users WHERE username=?').bind('autreuser').first()).id;
  await updateNotice(env, 'build-3', f);
  assert.doesNotMatch((await messageFor(env, EP + 'a', oid, 'Europe/Paris')).title, /mise à jour/i, 'l’abonnement d’un autre compte ne révèle rien');
});
const envA = makeEnv(); { const u = new Client(envA); await u.register('annonce'); await u.post('/api/push/subscribe', { endpoint: EP + 'z', days: [0], hour: '18:00', types: ['update'] }); }
await ok('nouvelle version : annoncée une seule fois même si plusieurs requêtes arrivent en même temps ; priorité haute', async () => {
  const env = envA, f = async () => new Response(null, { status: 201 });
  await updateNotice(env, 'build-8', f);
  const r = await Promise.all([updateNotice(env, 'build-9', f), updateNotice(env, 'build-9', f), updateNotice(env, 'build-9', f)]);
  assert.equal(r.filter((n) => n > 0).length, 1, 'une seule annonce');
  assert.equal((await vapidAuth(env, 'https://fcm.googleapis.com/fcm/send/x')).Urgency, 'high');
});
await ok('annonce dès la première requête après le déploiement (sans attendre la tâche planifiée)', async () => {
  const env = envA, worker = (await import('../worker.js')).default, waits = [];
  const sent = []; const realFetch = globalThis.fetch; globalThis.fetch = async (u, o) => (String(u).startsWith(EP) ? (sent.push(u), new Response(null, { status: 201 })) : realFetch(u, o));
  try {
    env.CF_VERSION_METADATA = { id: 'deploy-immediat' };
    await worker.fetch(new Request('https://site.test/api/version'), env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    assert.ok(sent.length >= 1, 'les appareils abonnés sont prévenus tout de suite');
  } finally { globalThis.fetch = realFetch; delete env.CF_VERSION_METADATA; }
});
await ok('suivi : l’état de l’abonnement de l’appareil, et ce qu’a donné la dernière annonce (visible par l’admin seulement)', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('suiviuser');
  await u.post('/api/push/subscribe', { endpoint: EP + 's1', days: [0], hour: '18:00', types: ['update'] });
  await u.post('/api/push/subscribe', { endpoint: EP + 's2', days: [0], hour: '18:00', types: ['reminder'] });
  const st = (await u.get('/api/push/status?endpoint=' + encodeURIComponent(EP + 's1'))).data; assert.equal(st.subscribed, true); assert.deepEqual(st.types, ['update']);
  assert.equal((await u.get('/api/push/status?endpoint=' + encodeURIComponent(EP + 'inconnu'))).data.subscribed, false);
  const f = async (url) => new Response(null, { status: url.endsWith('s1') ? 410 : 201 });
  await updateNotice(env, 'v1', f); await updateNotice(env, 'v2', f);
  const row = JSON.parse((await env.DB.prepare("SELECT value FROM system_state WHERE key='last_notify'").first()).value);
  assert.equal(row.targeted, 1); assert.equal(row.gone, 1); assert.equal(row.sent, 0);
  assert.equal((await u.get('/api/admin/push-status')).status, 403);
});
await ok('tâche planifiée : passe chaque minute, chaque passage noté ; l’admin voit si elle tourne (sans rien d’autre que des compteurs)', async () => {
  assert.match(JSON.stringify(JSON.parse((await import('node:fs')).readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8')).triggers.crons), /"\* \* \* \* \*"/, 'cron chaque minute');
  const env = makeEnv(), a = new Client(env); await a.register('cronadmin'); await a.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
  const before = (await a.get('/api/admin/push-status')).data; assert.equal(before.cron, null, 'jamais passé : l’admin le voit');
  env.CF_VERSION_METADATA = { id: 'v-cron-1' };
  await worker.scheduled({ cron: '* * * * *' }, env, null);
  const st = (await a.get('/api/admin/push-status')).data;
  assert.equal(st.cron.cron, '* * * * *'); assert.ok(Date.now() - st.cron.t < 5000); assert.equal(st.cron.build, 'v-cron-1'); assert.equal(st.cron.error, '');
  assert.equal(st.lastBuild, 'v-cron-1', 'nouvelle version retenue par la tâche, même sans visite');
  delete env.CF_VERSION_METADATA;
});
await ok('déploiement : une erreur est reprise sans renvoyer aux appareils déjà joints ; anciennes instances sans annonce inverse', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('reprisenotice');
  for (const suffix of ['ok', 'retry']) await u.post('/api/push/subscribe', { endpoint: EP + suffix, types: ['update'] });
  const t = Date.now(), calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: url.endsWith('retry') && calls.filter((x) => x === url).length === 1 ? 503 : 201 }); };
  await updateNotice(env, 'ancien', f, { now: t });
  assert.equal(await updateNotice(env, 'nouveau', f, { now: t }), 1);
  assert.equal(await updateNotice(env, 'nouveau', f, { now: t + 1000 }), 0, 'la reprise respecte le délai après erreur');
  assert.equal(await updateNotice(env, 'nouveau', f, { now: t + 60000 }), 1);
  assert.equal(calls.filter((x) => x === EP + 'ok').length, 1);
  assert.equal(calls.filter((x) => x === EP + 'retry').length, 2);
  assert.equal(await updateNotice(env, 'ancien', f, { now: t + 120000 }), 0, 'une ancienne instance ne réannonce pas une version déjà vue');
  assert.equal((await env.DB.prepare("SELECT value FROM system_state WHERE key='last_build'").first()).value, 'nouveau');
  const status = JSON.parse((await env.DB.prepare("SELECT value FROM system_state WHERE key='last_notify'").first()).value);
  assert.equal(status.sent, 2); assert.equal(status.pending, 0);
});
await ok('plus de 500 appareils : tous mis en file ; concurrence et reprises ne doublent aucun succès', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('grandlot');
  const user = (await u.get('/api/auth/me')).data.user.id, t = Date.now();
  await env.DB.batch(Array.from({ length: 521 }, (_, i) => env.DB.prepare("INSERT INTO push_subs(endpoint,user_id,created_at,types) VALUES(?,?,?,?)").bind(EP + 'large' + i, user, t, '["update"]')));
  const calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  await updateNotice(env, 'grand-1', f, { now: t });
  await Promise.all(Array.from({ length: 3 }, () => updateNotice(env, 'grand-2', f, { now: t, limit: 200 })));
  while ((await env.DB.prepare("SELECT COUNT(*) c FROM push_updates WHERE state='pending'").first()).c) await updateNotice(env, 'grand-2', f, { now: t + 60000, limit: 200 });
  assert.equal(calls.length, 521); assert.equal(new Set(calls).size, 521);
});
await ok('reprise : choix mises à jour retiré ou compte supprimé = aucun nouvel envoi', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('retirerpush');
  await u.post('/api/push/subscribe', { endpoint: EP + 'pref', types: ['update'] });
  const t = Date.now(), calls = [], failFetch = async (url) => { calls.push(url); return new Response(null, { status: 503 }); };
  await updateNotice(env, 'choix-1', failFetch, { now: t }); await updateNotice(env, 'choix-2', failFetch, { now: t });
  await u.post('/api/push/subscribe', { endpoint: EP + 'pref', types: ['reminder'] });
  assert.equal(await updateNotice(env, 'choix-2', failFetch, { now: t + 60000 }), 0); assert.equal(calls.length, 1);
  assert.equal((await env.DB.prepare('SELECT state FROM push_updates').first()).state, 'skipped');
  await u.post('/api/auth/delete', { password: 'motdepasse1' });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) c FROM push_updates').first()).c, 0, 'la file personnelle suit la suppression du compte');
});
await ok('annonce finale manuelle : visible par tous, choix automatique inchangé, confirmation rejouée sans doublon', async () => {
  const env = makeEnv(), a = new Client(env), u = new Client(env); await a.register('adminannonce'); await a.post('/api/admin/activate', { password: 'Adm1n-Secret!' }); await u.register('sansupdates');
  await u.post('/api/push/subscribe', { endpoint: EP + 'manual', types: [], silent: true });
  const actorId = (await a.get('/api/auth/me')).data.user.id, userId = (await u.get('/api/auth/me')).data.user.id;
  const input = { id: 'finale-test', title: 'La version finale est prête', body: 'Calendrier récurrent et bilan rapide disponibles.', version: '8.32.2', build: 'prod-final', actorId };
  const calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  const first = await broadcastNotice(env, input, f); assert.equal(first.sent, 1); assert.equal(first.visibleToAll, true);
  const post = (await new Client(env).get('/api/global')).data.items.find((x) => x.kind === 'announce' && x.id === input.id);
  assert.equal(post.data.title, input.title); assert.equal(post.data.banner, true);
  await env.DB.prepare("INSERT INTO global_content(kind,id,data_json,updated_at) VALUES('announce','plus-recent',?,?)").bind(JSON.stringify({ title: 'Autre annonce', body: 'Ne remplace pas la notification déjà envoyée' }), Date.now() + 100000).run();
  const msg = await messageFor(env, EP + 'manual', userId, 'Europe/Paris'); assert.match(msg.title, /version finale/); assert.equal(msg.silent, true);
  assert.equal((await broadcastNotice(env, input, f)).sent, 1, 'compteur cumulé de cet envoi'); assert.equal(calls.length, 1);
  assert.equal((await broadcastNotice(env, { ...input, title: 'Autre titre' }, f)).status, 409);
  assert.equal((await env.DB.prepare('SELECT types FROM push_subs').first()).types, '[]', 'les préférences ne sont pas changées');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) c FROM audit_events WHERE action='push_broadcast'").first()).c, 1);
  // Sans bandeau : la notification part quand même vers les appareils autorisés, et l'annonce reste dans 🔔 Notifications.
  const quiet = await broadcastNotice(env, { ...input, id: 'finale-sans-bandeau', banner: false }, f); assert.equal(quiet.sent, 1);
  const q2 = (await new Client(env).get('/api/global')).data.items.find((x) => x.kind === 'announce' && x.id === 'finale-sans-bandeau');
  assert.equal(q2.data.banner, undefined); assert.equal(q2.data.until, undefined); assert.equal(q2.data.update, true);
});
await ok('annonce manuelle en erreur : reprise durable et suivi mis à jour sans répéter le succès', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('manualretry');
  await u.post('/api/push/subscribe', { endpoint: EP + 'manretry', types: [] });
  const actorId = (await u.get('/api/auth/me')).data.user.id, t = Date.now(), calls = [];
  const f = async (url) => { calls.push(url); return new Response(null, { status: calls.length === 1 ? 503 : 201 }); };
  const first = await broadcastNotice(env, { id: 'retry-final', title: 'Prête', body: 'La version est prête.', version: '8.32.2', build: 'prod', actorId }, f, { now: t });
  assert.equal(first.pending, 1); assert.equal(first.sent, 0);
  await flushNotices(env, f, { now: t + 60000 }); await flushNotices(env, f, { now: t + 120000 });
  assert.equal(calls.length, 2);
  const stats = JSON.parse((await env.DB.prepare("SELECT value FROM system_state WHERE key='last_broadcast'").first()).value);
  assert.equal(stats.sent, 1); assert.equal(stats.pending, 0);
});
await ok('réveil après déploiement : attend la bonne version et sa confirmation, réessaie les erreurs', async () => {
  const replies = [new Response(JSON.stringify({ version: '8.31.0' }), { status: 409 }), new Response(JSON.stringify({ version: '8.32.2', announced: false })), new Response(JSON.stringify({ version: '8.32.2', announced: true, build: 'production-ok' }))];
  const waits = [], calls = [], r = await notifyDeployment({ version: '8.32.2', fetchFn: async (url) => { calls.push(url); return replies.shift(); }, waitFn: async (ms) => waits.push(ms) });
  assert.equal(r.build, 'production-ok'); assert.equal(calls.length, 3); assert.equal(waits.length, 2); assert.match(calls[0], /expected=8\.32\.2$/);
  await assert.rejects(notifyDeployment({ version: '8.32.2', fetchFn: async () => { throw new Error('réseau coupé'); }, waitFn: async () => {}, attempts: 2 }), /Annonce non confirmée/);
});
await ok('réveil production public : une version attendue incorrecte n’envoie rien ; une requête correcte attend les envois', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('deployattendu'); await u.post('/api/push/subscribe', { endpoint: EP + 'expected', types: ['update'] });
  const version = (await u.get('/api/version')).data.version;
  await updateNotice(env, 'deploy-before', async () => new Response(null, { status: 201 })); env.CF_VERSION_METADATA = { id: 'deploy-expected' };
  const calls = [], actual = globalThis.fetch; globalThis.fetch = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  try {
    assert.equal((await u.get('/api/version?expected=99.99.99')).status, 409); assert.equal(calls.length, 0);
    assert.equal((await u.get('/api/version?expected=invalide')).status, 400); assert.equal(calls.length, 0);
    const result = await u.get('/api/version?expected=' + version); assert.equal(result.status, 200); assert.equal(result.data.announced, true); assert.equal(calls.length, 1);
    await u.get('/api/version?expected=' + version); assert.equal(calls.length, 1);
  } finally { globalThis.fetch = actual; }
});
await ok('route annonce finale : rôle Technique, confirmation explicite et version réelle obligatoires', async () => {
  const env = makeEnv(), a = new Client(env), u = new Client(env); await a.register('routeannonce'); await a.post('/api/admin/activate', { password: 'Adm1n-Secret!' }); await u.register('pasadminannonce');
  const status = (await a.get('/api/admin/push-status')).data;
  const input = { id: 'route-finale', title: 'Version prête', body: 'L’app est prête à utiliser.', version: status.version, build: status.build, confirmed: true };
  assert.equal((await new Client(env).post('/api/admin/push-broadcast', input)).status, 401);
  assert.equal((await u.post('/api/admin/push-broadcast', input)).status, 403);
  assert.equal((await a.post('/api/admin/push-broadcast', { ...input, confirmed: false })).status, 400);
  assert.equal((await a.post('/api/admin/push-broadcast', { ...input, build: 'ancienne-version' })).status, 409);
  assert.equal((await a.post('/api/admin/push-broadcast', input)).status, 200);
  assert.equal((await a.get('/api/admin/push-status')).data.broadcast.title, input.title);
  await env.DB.prepare("UPDATE users SET admin_roles='content' WHERE username='routeannonce'").run();
  assert.equal((await a.post('/api/admin/push-broadcast', { ...input, id: 'autre-role' })).status, 403);
});
await ok('rendez-vous : délai avant l’heure, fuseau de la série et rappel une seule fois par appareil et occurrence', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('rendezvous');
  await u.post('/api/push/subscribe', { endpoint: EP + 'cal', tz: 'America/New_York', types: ['reminder'], days: [] });
  const base = { id: 'voie-mardi', date: '2026-09-01', title: 'Voie · Nicole Abar', time: '18:00', recurrence: { freq: 'weekly', days: [2], timeZone: 'Europe/Paris' }, meta: { reminderMin: 30, place: 'Nicole Abar' } };
  assert.equal((await u.post('/api/calendar', base)).status, 200);
  const calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  const t = Date.parse('2026-09-01T15:30:00Z');
  assert.equal(await runCalendarReminders(env, t - 1000, f), 0); assert.equal(await runCalendarReminders(env, t, f), 1);
  assert.equal(await runCalendarReminders(env, t + 60000, f), 0); assert.equal(calls.length, 1);
  const uid = (await u.get('/api/auth/me')).data.user.id;
  const reminder = await messageFor(env, EP + 'cal', uid, 'America/New_York', t);
  assert.match(reminder.body, /Voie · Nicole Abar à 18:00/); assert.equal(reminder.url, '/#/home/cal', 'le rappel ouvre le calendrier (vue home/cal)');
  assert.equal(await runCalendarReminders(env, Date.parse('2026-09-08T15:30:00Z'), f), 1, 'la semaine suivante a son propre rappel');
});
await ok('rendez-vous : déplacement, annulation, occurrence sans rappel et séance faite respectent la règle de série', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('exceptionsrappel');
  await u.post('/api/push/subscribe', { endpoint: EP + 'exc', tz: 'Europe/Paris', types: ['reminder'] });
  const base = { id: 'series-rappel', date: '2026-09-01', title: 'Escalade', time: '18:00', recurrence: { freq: 'weekly', days: [2], timeZone: 'Europe/Paris' }, meta: { reminderMin: 30 } };
  await u.post('/api/calendar', base);
  for (const [day, patch] of [['2026-09-01', { date: '2026-09-02', time: '19:00' }], ['2026-09-08', { meta: { status: 'cancelled' } }], ['2026-09-15', { meta: { reminderMin: 0 } }], ['2026-09-22', { completed: true, meta: { status: 'done' } }]]) await u.post('/api/calendar', occurrenceChange(base, day, patch));
  const calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  assert.equal(await runCalendarReminders(env, Date.parse('2026-09-01T15:30Z'), f), 0);
  assert.equal(await runCalendarReminders(env, Date.parse('2026-09-02T16:30Z'), f), 1, 'seule la nouvelle date déclenche le rappel');
  for (const day of ['2026-09-08', '2026-09-15', '2026-09-22']) assert.equal(await runCalendarReminders(env, Date.parse(day + 'T15:30Z'), f), 0);
  assert.equal(calls.length, 1);
  assert.equal(await runCalendarReminders(env, Date.parse('2026-09-29T15:30Z'), f), 1, 'les autres occurrences gardent le délai de série');
});
await ok('rendez-vous : reprise arrêtée si annulé, heure manquante ou inexistante sans rappel inventé', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('annulerrappel'); await u.post('/api/push/subscribe', { endpoint: EP + 'cancelretry', types: ['reminder'], tz: 'Europe/Paris' });
  const base = { id: 'rdv-panne', date: '2026-09-01', time: '18:00', title: 'Voie', meta: { reminderMin: 30 } }; await u.post('/api/calendar', base);
  const t = Date.parse('2026-09-01T15:30Z'), calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: 503 }); };
  await runCalendarReminders(env, t, f); assert.equal(calls.length, 1);
  await u.post('/api/calendar', occurrenceChange(base, base.date, { meta: { status: 'cancelled' } }));
  await runCalendarReminders(env, t + 60000, f); assert.equal(calls.length, 1);
  const event = agendaEvents([{ ...base, time: '' }], base.date)[0]; assert.equal(calendarDue(event, 'Europe/Paris', t), false);
  const dst = agendaEvents([{ ...base, date: '2026-03-29', time: '02:30' }], '2026-03-29')[0]; assert.equal(calendarDue(dst, 'Europe/Paris', Date.parse('2026-03-29T01:00Z')), false);
});
await ok('rendez-vous plus tard dans la journée : une activité déjà faite ne supprime pas le rappel, pause le coupe', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('blocpuisvoie'); await u.post('/api/push/subscribe', { endpoint: EP + 'later', types: ['reminder'], tz: 'Europe/Paris' });
  await u.post('/api/calendar', { id: 'voie-soir', date: '2026-09-01', time: '18:00', title: 'Voie', meta: { reminderMin: 30 } });
  await u.post('/api/history', { id: 'bloc-matin', sessionName: 'Bloc', startedAt: Date.parse('2026-09-01T08:00Z'), durationSeconds: 1200, data: { exercises: [] } });
  const t = Date.parse('2026-09-01T15:30Z'), calls = [], f = async (url) => { calls.push(url); return new Response(null, { status: 201 }); };
  assert.equal(await runCalendarReminders(env, t, f), 1);
  await u.post('/api/calendar', { id: 'voie-vacances', date: '2026-09-02', time: '18:00', title: 'Voie', meta: { reminderMin: 30 } });
  await u.post('/api/items', { changes: [{ c: 'config', id: 'pause', u: Date.now(), d: { pauseMode: 'vacances', pauseFrom: '2026-09-02', pauseTo: '2026-09-03' } }] });
  assert.equal(await runCalendarReminders(env, Date.parse('2026-09-02T15:30Z'), f), 0); assert.equal(calls.length, 1);
});
await ok('deux annonces sur le même appareil : messages durables distincts malgré un ancien slot écrasé et des lectures concurrentes', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('durablemessage'); await u.post('/api/push/subscribe', { endpoint: EP + 'durable', types: [] });
  const actorId = (await u.get('/api/auth/me')).data.user.id, t = Date.now();
  const input = { title: 'Première annonce', body: 'Le calendrier est prêt.', version: '8.32.2', build: 'prod', actorId };
  const f = async () => new Response(null, { status: 201 });
  await broadcastNotice(env, { ...input, id: 'message-a' }, f, { now: t });
  await broadcastNotice(env, { ...input, id: 'message-b', title: 'Deuxième annonce', body: 'Le bilan est prêt.' }, f, { now: t + 1 });
  await env.DB.prepare("UPDATE push_subs SET pending='reminder' WHERE endpoint=?").bind(EP + 'durable').run();
  const messages = await Promise.all([messageFor(env, EP + 'durable', actorId, 'Europe/Paris'), messageFor(env, EP + 'durable', actorId, 'Europe/Paris')]);
  assert.equal(new Set(messages.map((m) => m.title)).size, 2);
  assert.ok(messages.some((m) => m.title.includes('Première annonce'))); assert.ok(messages.some((m) => m.title.includes('Deuxième annonce')));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) c FROM push_updates WHERE read_at>0').first()).c, 2);
  assert.doesNotMatch((await messageFor(env, EP + 'durable', actorId, 'Europe/Paris')).title, /annonce/i, 'aucun message d’annonce déjà lu n’est rejoué');
});
await ok('le navigateur lit avant la réponse du service push : l’accusé appareil évite une reprise après erreur HTTP', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('ackappareil'); await u.post('/api/push/subscribe', { endpoint: EP + 'early', types: [] });
  const actorId = (await u.get('/api/auth/me')).data.user.id, t = Date.now(), calls = [], texts = [];
  const f = async (url) => {
    calls.push(url); texts.push(await messageFor(env, url, actorId, 'Europe/Paris'));
    return new Response(null, { status: 503 }); // réponse réseau perdue alors que le téléphone a déjà affiché la notice
  };
  const r = await broadcastNotice(env, { id: 'early-ack', title: 'Version finale', body: 'Prête à utiliser.', version: '8.32.2', build: 'prod', actorId }, f, { now: t });
  assert.match(texts[0].title, /Version finale/); assert.equal(r.sent, 1); assert.equal(r.pending, 0);
  await flushNotices(env, f, { now: t + 60000 }); assert.equal(calls.length, 1);
});
await ok('envoi en cours : un appareil ne reçoit pas deux notices en parallèle, même si une deuxième tâche démarre', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('endpointlease'); await u.post('/api/push/subscribe', { endpoint: EP + 'lease', types: [] });
  const actorId = (await u.get('/api/auth/me')).data.user.id, t = Date.now();
  const input = { title: 'Version prête', body: 'Prête à utiliser.', version: '8.32.2', build: 'prod', actorId }, okFetch = async () => new Response(null, { status: 201 });
  await broadcastNotice(env, { ...input, id: 'lease-a' }, okFetch, { now: t, limit: 0 });
  await broadcastNotice(env, { ...input, id: 'lease-b' }, okFetch, { now: t + 1, limit: 0 });
  let release, reached;
  const gate = new Promise((r) => { release = r; }), entered = new Promise((r) => { reached = r; });
  let calls = 0;
  const f = async () => { calls++; reached(); await gate; return new Response(null, { status: 201 }); };
  const active = flushNotices(env, f, { now: t + 2 }); await entered;
  assert.equal(await flushNotices(env, okFetch, { now: t + 3 }), 0, 'le verrou couvre toutes les notices de cet appareil');
  release(); await active; assert.equal(calls, 1);
  assert.equal(await flushNotices(env, okFetch, { now: t + 4 }), 1, 'la notice suivante peut maintenant partir');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) c FROM push_updates WHERE state='sent'").first()).c, 2);
});
done();
