// tests/story.test.mjs — saisons de 4 semaines, lettre à soi-même, avant / après, année en sport, rapport du mois,
// badges utiles (check-ins, variété, mobilité, saison, reprise).
import assert from 'node:assert/strict';
import * as ST from '../public/story.js';
import { badges } from '../public/motivation.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
console.log('Mon parcours');
const DAY = 86400000;
const mon = new Date(2026, 8, 7, 9).getTime(); // lundi 7 septembre 2026
const H = (t, o = {}) => ({ startedAt: t, durationSeconds: (o.min || 45) * 60, sessionName: o.name || 'Séance', data: { activity: o.activity || 'strength', exercises: o.ex || [{ name: 'Pompes', sets: [{ reps: 10 }] }], context: o.env ? { env: o.env } : {} } });
ok('saison : 4 semaines depuis le lundi, objectif par semaine, réussie à 3 sur 4', () => {
  const hist = [];
  for (let w = 0; w < 4; w++) for (let k = 0; k < (w === 2 ? 1 : 3); k++) hist.push(H(mon + w * 7 * DAY + k * DAY));
  const sp = ST.seasonProgress({ theme: 'regularite', start: mon + 2 * DAY }, { history: hist }, mon + 29 * DAY);
  assert.equal(sp.start, new Date(2026, 8, 7).getTime(), 'commence le lundi');
  assert.deepEqual(sp.weeks.map((w) => w.value), [3, 3, 1, 3]); assert.equal(sp.doneWeeks, 3); assert.ok(sp.finished); assert.ok(sp.success);
  const mid = ST.seasonProgress({ theme: 'regularite', start: mon }, { history: hist }, mon + 15 * DAY);
  assert.equal(mid.week, 3); assert.equal(mid.left, 2); assert.equal(mid.finished, false); assert.ok(mid.weeks[3].future);
  assert.equal(ST.seasonProgress({ theme: 'inconnu', start: mon }, { history: [] }), null);
});
ok('saison : chaque thème mesure ce qu’il dit', () => {
  const c = { history: [H(mon, { ex: [{ name: 'Suspensions max' }] }), H(mon + DAY, { activity: 'running', min: 50 }), H(mon + 2 * DAY, { ex: [{ name: 'Étirements des hanches' }] })], wellness: [{ day: '2026-09-07' }, { day: '2026-09-08' }, { day: '2026-09-08' }] };
  const v = (t) => ST.themeValue(t, c, mon - 9 * 3600000, mon + 7 * DAY);
  assert.equal(v('doigts'), 1); assert.equal(v('mobilite'), 1); assert.equal(v('endurance'), 50); assert.equal(v('recup'), 2, 'un check-in par jour'); assert.equal(v('variete'), 2); assert.equal(v('regularite'), 3);
});
ok('saison proposée : la régularité d’abord si moins de 2 séances par semaine, avec la raison', () => {
  const s = ST.seasonSuggestion({ history: [H(mon - 3 * DAY)], activities: {} }, mon);
  assert.equal(s.theme, 'regularite'); assert.match(s.reason, /0,3 séance par semaine/);
});
ok('lettre : scellée jusqu’à la date, puis à ouvrir, puis ouverte', () => {
  const at = ST.letterOpenAt(mon, 3); assert.equal(new Date(at).getMonth(), 11);
  const l = { writtenAt: mon, openAt: at, openedAt: 0 };
  assert.equal(ST.letterState(l, mon + DAY).state, 'sealed'); assert.ok(ST.letterState(l, mon + DAY).days > 80);
  assert.equal(ST.letterState(l, at).state, 'ready'); assert.equal(ST.letterState({ ...l, openedAt: at }, at).state, 'opened');
});
ok('avant / après : valeur d’il y a 3 mois contre la plus récente ; poids sans jugement, masse grasse en baisse = mieux', () => {
  const now = new Date(2026, 9, 1).getTime(), old = new Date(2026, 5, 20).getTime(), rec = new Date(2026, 8, 25).getTime();
  const P = (metricId, value, date) => ({ metricId, value, date });
  const rows = ST.beforeAfter({ perfs: [P('body_weight', 72, old), P('body_weight', 70, rec), P('masse_grasse', 20, old), P('masse_grasse', 18, rec), P('max_tractions', 8, old), P('max_tractions', 10, rec), P('max_tractions', 9, new Date(2026, 1, 1).getTime()), P('tour_bras', 33, rec)] }, 3, now);
  const by = Object.fromEntries(rows.map((r) => [r.metricId, r]));
  assert.equal(by.body_weight.diff, -2); assert.equal(by.body_weight.good, null);
  assert.equal(by.masse_grasse.good, true); assert.equal(by.max_tractions.before, 8, 'la plus proche avant la date'); assert.equal(by.max_tractions.good, true); assert.equal(by.max_tractions.pct, 25);
  assert.equal(by.tour_bras, undefined, 'pas de valeur ancienne : pas de comparaison');
  assert.deepEqual(ST.beforeAfter({ perfs: [P('body_weight', 72, new Date(2025, 0, 1).getTime()), P('body_weight', 70, rec)] }, 3, now), [], 'valeur trop ancienne');
});
ok('année en sport : séances, mois le plus actif, sports, réussites, nouveaux exercices, lieux', () => {
  const y = 2026, t = (m, d) => new Date(y, m, d, 18).getTime();
  const c = { history: [H(new Date(2025, 11, 1).getTime(), { ex: [{ name: 'Pompes' }] }), H(t(2, 3), { env: 'e1' }), H(t(2, 10), { activity: 'running', ex: [{ name: 'Footing' }] }), H(t(5, 1), { env: 'e2', min: 90 })],
    ascents: [{ date: t(2, 4), result: 'onsight', kind: 'bloc', grade: { label: '6a', order: 10 } }, { date: t(3, 4), result: 'send', kind: 'voie', grade: { label: '6b', order: 12 }, context: { env: 'e3' } }, { date: t(3, 5), result: 'fail', kind: 'bloc' }],
    perfs: [{ metricId: 'max_tractions', value: 8, date: t(1, 1) }, { metricId: 'max_tractions', value: 11, date: t(8, 1) }] };
  const r = ST.yearInSport(c, y);
  assert.equal(r.sessions, 3); assert.equal(r.bestMonth.label, 'mars'); assert.equal(r.bestMonth.n, 2); assert.deepEqual(r.sports.map((s) => s.id), ['strength', 'running']);
  assert.equal(r.sends, 2); assert.equal(r.firstTry, 1); assert.equal(r.bestBloc, '6a'); assert.equal(r.bestVoie, '6b'); assert.equal(r.newExercises, 1, 'Footing (Pompes déjà fait en 2025)'); assert.equal(r.places, 3);
  assert.equal(r.longest, 5400); assert.equal(r.moved[0].diff, 3); assert.equal(r.moved[0].good, true);
});
ok('rapport du mois : séances dans l’ordre, check-ins, mesures, douleurs', () => {
  const c = { history: [H(mon + DAY, { name: 'B' }), H(mon, { name: 'A' }), H(new Date(2026, 9, 2).getTime())], wellness: [{ day: '2026-09-08', sleep: 7, energy: 4 }, { day: '2026-09-09', sleep: 8, energy: 3 }], perfs: [{ metricId: 'body_weight', value: 70, date: mon }], pains: [{ date: mon }] };
  const r = ST.monthReport(c, mon);
  assert.deepEqual(r.sessions.map((s) => s.name), ['A', 'B']); assert.equal(r.minutes, 90); assert.equal(r.sleep, 7.5); assert.equal(r.energy, 3.5); assert.equal(r.checkins, 2); assert.equal(r.perfs[0].label, 'Poids du corps'); assert.equal(r.pains, 1);
});
ok('badges utiles : check-ins, bonnes nuits, variété dans le mois, mobilité, saison réussie, reprise', () => {
  const hist = [H(mon, { activity: 'running' }), H(mon + DAY, { activity: 'swimming' }), H(mon + 2 * DAY, { activity: 'strength', ex: [{ name: 'Étirements' }] }), H(mon + 30 * DAY)];
  const b = Object.fromEntries(badges({ history: hist, ascents: [], perfs: [], projects: [], wellness: Array.from({ length: 10 }, (_, i) => ({ day: `2026-09-${10 + i}`, sleep: i < 7 ? 8 : 6 })), seasons: [{ won: true }] }, { now: mon + 31 * DAY }).map((x) => [x.id, x]));
  for (const id of ['checkin', 'sleep', 'variety', 'season', 'comeback']) assert.ok(b[id].got, id);
  assert.equal(b.mobility.value, 1); assert.equal(b.mobility.got, false);
});
console.log(`\n${n} tests de « Mon parcours » OK`);
