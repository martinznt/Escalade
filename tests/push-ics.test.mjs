// tests/push-ics.test.mjs — rappels (Web Push VAPID, cron, fuseaux) et export agenda (.ics).
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { localNow, isDue, runReminders, vapidAuth, unb64u, updateNotice, messageFor } from '../server/push.js';
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
  assert.match(ics, /SUMMARY:Force\\, semaine 2\; bonne séance/); assert.match(ics, /TRIGGER:-PT30M/); assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
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
done();
