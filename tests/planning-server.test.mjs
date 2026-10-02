// tests/planning-server.test.mjs — planning côté serveur : infos d'une séance prévue (nettoyées), abonnement agenda
// par lien secret (empreinte seule gardée, lien remplaçable, coupé à la suppression), rappels silencieux en pause
// ou quand la séance du jour est faite, rappel qui annonce la séance prévue.
import assert from 'node:assert/strict';
import { runReminders, reminderText, localNow, quietToday } from '../server/push.js';
import { Client, makeEnv, ok, done, ORIGIN } from './helpers.mjs';
import worker from '../worker.js';
console.log('Planning (serveur)');
const EP = 'https://fcm.googleapis.com/fcm/send/plan';
await ok('séance prévue : infos gardées (durée, sport, lieu, légère, événement important), le reste retiré', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('planif');
  const r = await u.post('/api/calendar', { id: 'ev1', date: '2026-10-06', time: '18:30', title: 'Force', meta: { kind: 'auto', minutes: 50, activityId: 'strength', envId: 'salle-1', light: true, intent: 'force', note: 'tranquille', pirate: '<script>', minutesX: 9 } });
  assert.equal(r.status, 200); assert.deepEqual(r.data.event.meta, { kind: 'auto', minutes: 50, activityId: 'strength', envId: 'salle-1', intent: 'force', light: true, note: 'tranquille' });
  await u.post('/api/calendar', { id: 'ev2', date: '2026-10-10', title: 'Compétition', meta: { kind: 'course à pied', minutes: 9999, activityId: 'a b' } });
  const all = (await u.get('/api/calendar')).data.events; const e1 = all.find((e) => e.id === 'ev1'), e2 = all.find((e) => e.id === 'ev2');
  assert.equal(e1.meta.minutes, 50); assert.equal(e2.meta, null, 'valeurs invalides : rien gardé');
});
await ok('abonnement agenda : lien secret, lecture seule, empreinte seule en base, remplaçable, révocable', async () => {
  const env = makeEnv(), u = new Client(env), o = new Client(env); await u.register('agenda'); await o.register('autre');
  assert.equal((await u.get('/api/ical')).data.active, false);
  await u.post('/api/calendar', { id: 'w1', date: '2026-10-05', time: '18:00', title: 'Bloc; dévers', recurrence: { freq: 'weekly', until: '2026-12-20' }, meta: { minutes: 90 } });
  await u.post('/api/calendar', { id: 'c1', date: '2026-10-17', title: 'Contest', meta: { kind: 'race' } });
  await o.post('/api/calendar', { id: 'secret', date: '2026-10-07', title: 'Pas à toi' });
  const c = await u.post('/api/ical'); assert.equal(c.status, 200); const link = c.data.url; assert.match(link, /^https:\/\/site\.test\/ical\/[A-Za-z0-9_-]{43}\.ics$/);
  const token = link.split('/ical/')[1].replace('.ics', ''), row = await env.DB.prepare('SELECT token_hash FROM ical_feeds').first();
  assert.notEqual(row.token_hash, token); assert.match(row.token_hash, /^[0-9a-f]{64}$/, 'empreinte SHA-256, jamais le jeton');
  const anon = new Client(env), f = await anon.get(link.replace(ORIGIN, ''));
  assert.equal(f.status, 200); assert.match(f.res.headers.get('Content-Type'), /text\/calendar/); const ics = await f.res.text();
  assert.match(ics, /SUMMARY:🏋️ Bloc\\; dévers/); assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20261220T235959/); assert.match(ics, /DTSTART;VALUE=DATE:20261017/); assert.ok(!/Pas à toi/.test(ics), 'jamais les événements d’un autre compte');
  assert.equal((await anon.get('/ical/' + 'x'.repeat(43) + '.ics')).status, 404);
  const c2 = await u.post('/api/ical'); assert.notEqual(c2.data.url, link); assert.equal((await anon.get(link.replace(ORIGIN, ''))).status, 404, 'ancien lien coupé');
  assert.equal((await u.del('/api/ical')).status, 200); assert.equal((await anon.get(c2.data.url.replace(ORIGIN, ''))).status, 404);
  assert.equal((await new Client(env).post('/api/ical')).status, 401, 'compte requis');
});
await ok('rappels : rien en pause ni quand la séance du jour est faite ; sinon la séance prévue est annoncée', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('rappelplan');
  const t = Date.UTC(2026, 8, 28, 16, 10), today = localNow('Europe/Paris', t).ymd, uid = (await u.get('/api/auth/me')).data.user.id;
  await u.post('/api/push/subscribe', { endpoint: EP, days: [0], hour: '18:00', tz: 'Europe/Paris' });
  const f = async () => new Response(null, { status: 201 });
  await u.post('/api/items', { changes: [{ c: 'config', id: 'pause', u: Date.now(), d: { pauseMode: 'vacances', pauseFrom: '2026-09-20', pauseTo: '2026-10-04' } }] });
  assert.equal(await quietToday(env, uid, 'Europe/Paris', t), 'pause'); assert.equal(await runReminders(env, t, f), 0, 'vacances : pas de rappel');
  await env.DB.prepare('UPDATE push_subs SET last_day=?').bind('').run();
  await u.post('/api/items', { changes: [{ c: 'config', id: 'pause', u: Date.now() + 1, d: { pauseMode: '' } }] });
  await u.post('/api/history', { id: 'h-today', sessionName: 'Matin', startedAt: t - 3 * 3600000, durationSeconds: 1800, data: {} });
  assert.equal(await quietToday(env, uid, 'Europe/Paris', t), 'done'); assert.equal(await runReminders(env, t, f), 0, 'déjà faite : pas de rappel');
  await u.del('/api/history/h-today'); await env.DB.prepare('UPDATE push_subs SET last_day=?').bind('').run();
  await u.post('/api/calendar', { id: 'pl', date: today, time: '19:00', title: 'Tirage et gainage' });
  assert.equal(await runReminders(env, t, f), 1);
  const txt = await reminderText(env, uid, 'Europe/Paris', t); assert.match(txt.body, /Tirage et gainage à 19:00/);
});
await ok('suppression du compte : abonnement agenda supprimé', async () => {
  const env = makeEnv(), u = new Client(env); await u.register('icalbye', 'motdepasse1');
  const link = (await u.post('/api/ical')).data.url;
  assert.equal((await u.post('/api/auth/delete', { password: 'motdepasse1' })).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) c FROM ical_feeds').first()).c, 0);
  assert.equal((await worker.fetch(new Request(link), env)).status, 404);
});
done('tests du planning côté serveur');
