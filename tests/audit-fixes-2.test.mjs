// tests/audit-fixes-2.test.mjs — corrections de l'audit Playwright du 9 octobre 2026 (serveur et calendrier).
//  · un ressenti non donné (0) reste « non noté » : il ne devient pas 1 (« très facile ») ;
//  · toutes les réponses du serveur portent les en-têtes de sécurité (y compris /api/version, /api/changes, l'agenda) ;
//  · abonnement iCal : un rendez-vous simple déplacé n'y figure qu'une fois, à sa nouvelle heure ; annulé, il disparaît.
import assert from 'node:assert/strict';
import { occurrenceChange, calendarIcsEvents } from '../public/agenda.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

console.log('Corrections de l’audit Playwright');

await ok('ressenti non donné (0) gardé à 0 ; 1 à 5 gardés ; hors bornes ramenés à 5', async () => {
  const env = makeEnv(), c = new Client(env); await c.register('RessentiAudit');
  const now = Date.now();
  for (const [id, rpe] of [['sans', 0], ['trois', 3], ['trop', 9], ['vide', null]]) {
    const r = await c.post('/api/history', { id: 'h-' + id, sessionName: 'Chrono : test', startedAt: now - 3600000, durationSeconds: 600, data: { rpe, exercises: [] } });
    assert.equal(r.status, 200, id);
  }
  const got = Object.fromEntries((await c.get('/api/history')).data.history.map((h) => [h.id, h.data.rpe]));
  assert.deepEqual(got, { 'h-sans': 0, 'h-trois': 3, 'h-trop': 5, 'h-vide': 0 });
});

await ok('en-têtes de sécurité sur toutes les réponses, sans remplacer ceux déjà choisis', async () => {
  const env = makeEnv(), c = new Client(env); await c.register('EntetesAudit');
  const feed = (await c.post('/api/ical', {})).data.url;
  for (const p of ['/api/version', '/api/changes', '/api/global', '/api/health', '/api/sync', '/', '/app.js', new URL(feed).pathname]) {
    const r = await c.get(p), hd = (k) => r.res.headers.get(k) || '';
    assert.equal(hd('x-content-type-options'), 'nosniff', p);
    assert.ok(hd('referrer-policy'), p + ' referrer-policy');
    assert.match(hd('content-security-policy'), /frame-ancestors 'none'/, p + ' CSP');
  }
  assert.match((await c.get('/api/version')).res.headers.get('cache-control') || '', /no-store/, 'version jamais mise en cache');
});

await ok('abonnement iCal : rendez-vous simple déplacé → un seul événement, à la nouvelle heure ; annulé → aucun', async () => {
  const base = { id: 'ev-simple', date: '2026-10-12', time: '18:30', title: 'Bloc', recurrence: null, meta: { kind: 'activity' } };
  const moved = occurrenceChange(base, '2026-10-12', { time: '19:15', meta: { kind: 'activity' } });
  const out = calendarIcsEvents([base, moved]);
  assert.deepEqual(out.map((e) => [e.date, e.time]), [['2026-10-12', '19:15']]);
  const cancelled = occurrenceChange(base, '2026-10-12', { meta: { kind: 'activity', status: 'cancelled' } });
  assert.deepEqual(calendarIcsEvents([base, cancelled]), []);
  // Série répétée : l'occurrence modifiée est exclue de la série (EXDATE) et ajoutée à part, comme avant.
  const weekly = { id: 'ev-serie', date: '2026-10-13', time: '18:00', title: 'Renfo', recurrence: { freq: 'weekly', days: [2], until: null, timeZone: 'Europe/Paris' }, meta: { kind: 'activity' } };
  const one = occurrenceChange(weekly, '2026-10-20', { time: '19:00', meta: { kind: 'activity' } });
  const series = calendarIcsEvents([weekly, one]);
  assert.equal(series.length, 2); assert.deepEqual(series[0].exDates, ['2026-10-20']); assert.equal(series[1].time, '19:00');
});

done('corrections de l’audit Playwright');
