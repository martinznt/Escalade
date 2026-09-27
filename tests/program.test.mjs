// tests/program.test.mjs — programmes sur plusieurs semaines, réajustement, charge des doigts, séance « en forme ».
import assert from 'node:assert/strict';
import { buildProgram, programStatus, reschedule, fingerLoad, boostSession, defaultDays, ymd } from '../public/program.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const D = 86400000, at = (y, m, d, hh = 18) => new Date(y, m - 1, d, hh).getTime();
console.log('Programme');
ok('calendrier : jours choisis, semaines légères toutes les 4, dernière semaine bilan', () => {
  const p = buildProgram({ goal: 'force', weeks: 8, days: [0, 2, 4], minutes: 60, start: '2026-09-28' });
  assert.equal(p.sessions.length, 24); assert.equal(p.sessions[0].date, '2026-09-28'); assert.equal(p.sessions[1].date, '2026-09-30');
  assert.ok(p.sessions.filter((s) => s.week === 4).every((s) => s.phase === 'deload' && s.light && s.minutes === 42));
  assert.ok(p.sessions.filter((s) => s.week === 8).every((s) => s.phase === 'test'));
  assert.deepEqual(p.sessions.map((s) => s.i), [...Array(24).keys()]);
  assert.deepEqual(buildProgram({ weeks: 2, days: [0], start: '2026-09-30' }).sessions.map((s) => [s.week, s.date]), [[1, '2026-10-05'], [2, '2026-10-12']], 'plus de jour cette semaine : départ lundi prochain');
  assert.deepEqual(buildProgram({ weeks: 1, days: [0, 4], start: '2026-09-30' }).sessions.map((s) => s.date), ['2026-10-02'], 'jour déjà passé dans la 1re semaine : pas de séance');
  assert.deepEqual(defaultDays(3), [0, 2, 4]);
});
ok('suivi : faites (liées à l’historique), manquées, aujourd’hui', () => {
  const p = { id: 'pg1', ...buildProgram({ weeks: 2, days: [0, 2, 4], start: '2026-09-28' }) };
  const hist = [{ startedAt: at(2026, 9, 28), data: { program: { id: 'pg1', i: 0 } } }, { startedAt: at(2026, 9, 29), data: { program: { id: 'autre', i: 1 } } }];
  const st = programStatus(p, hist, at(2026, 10, 2, 9));
  assert.equal(st.done, 1); assert.deepEqual(st.missed.map((s) => s.i), [1]); assert.equal(st.next.i, 2); assert.equal(st.next.status, 'today'); assert.equal(st.pct, 17);
});
ok('réajustement : les séances non faites reprennent à partir d’aujourd’hui, dans l’ordre', () => {
  const p = { id: 'pg1', ...buildProgram({ weeks: 2, days: [0, 2, 4], start: '2026-09-28' }) };
  const hist = [{ startedAt: at(2026, 9, 28), data: { program: { id: 'pg1', i: 0 } } }];
  const r = reschedule(p, hist, at(2026, 10, 1, 9)); // jeudi : la séance du mercredi est manquée
  assert.equal(r.sessions[0].date, '2026-09-28', 'faite : inchangée');
  assert.deepEqual(r.sessions.slice(1).map((s) => s.date), ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']);
  assert.equal(programStatus(r, hist, at(2026, 10, 1, 9)).missed.length, 0);
});
ok('doigts : alerte seulement si la semaine dépasse nettement l’habitude', () => {
  const now = at(2026, 10, 1), E = (sets) => ({ name: 'Suspensions', group: 'doigts', sets: Array(sets).fill({}) });
  const past = [8, 15, 22, 29].map((d) => ({ startedAt: now - d * D, data: { exercises: [E(4)] } }));
  assert.equal(fingerLoad([...past, { startedAt: now - D, data: { exercises: [E(5)] } }], now).alert, false);
  const f = fingerLoad([...past, { startedAt: now - D, data: { exercises: [E(6)] } }, { startedAt: now - 2 * D, data: { exercises: [E(6)] } }], now);
  assert.equal(f.cur, 12); assert.equal(f.avg, 4); assert.equal(f.alert, true);
});
ok('en forme : une série de plus sur le corps de séance seulement', () => {
  const s = boostSession({ exercises: [{ block: 'warmup', sets: 1 }, { block: 'main', sets: 3 }, { block: 'cool', sets: 1 }, { block: 'main', sets: 8 }] });
  assert.deepEqual(s.exercises.map((e) => e.sets), [1, 4, 1, 8]);
  assert.equal(ymd(at(2026, 1, 5)), '2026-01-05');
});
console.log(`\n${n} tests OK`);
