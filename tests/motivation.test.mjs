// tests/motivation.test.mjs — série de semaines, badges, bilan du mois.
import assert from 'node:assert/strict';
import { weekStart, weekStreak, badges, monthRecap } from '../public/motivation.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const at = (y, m, d, hh = 18) => new Date(y, m - 1, d, hh).getTime();
const H = (t, extra = {}) => ({ startedAt: t, durationSeconds: 3600, data: { exercises: [{ sets: [{}, {}] }], ...extra } });
console.log('Motivation');
ok('lundi de la semaine', () => { assert.equal(new Date(weekStart(at(2026, 9, 27))).getDay(), 1); assert.equal(new Date(weekStart(at(2026, 9, 27))).getDate(), 21); });
ok('série : semaines complètes consécutives, la semaine en cours ne casse rien', () => {
  const now = at(2026, 9, 23); // mercredi
  const hist = [H(at(2026, 9, 1)), H(at(2026, 9, 3)), H(at(2026, 9, 8)), H(at(2026, 9, 10)), H(at(2026, 9, 15)), H(at(2026, 9, 17)), H(at(2026, 9, 22))];
  let s = weekStreak(hist, [], { goal: 2, now });
  assert.equal(s.streak, 3); assert.equal(s.thisWeek, 1); assert.equal(s.left, 1); assert.equal(s.done, false);
  s = weekStreak([...hist, H(at(2026, 9, 23, 7))], [], { goal: 2, now }); assert.equal(s.streak, 4); assert.equal(s.done, true);
  s = weekStreak(hist.filter((h) => h.startedAt !== at(2026, 9, 10)), [], { goal: 2, now }); assert.equal(s.streak, 1, 'semaine incomplète : la série repart'); assert.equal(s.best, 1);
  assert.equal(weekStreak([], [{ date: at(2026, 9, 14) }, { date: at(2026, 9, 16) }], { goal: 2, now }).streak, 1, 'jours de grimpe du carnet comptés');
  assert.equal(weekStreak([H(at(2026, 9, 14, 9)), H(at(2026, 9, 14, 19))], [], { goal: 2, now }).streak, 0, 'deux séances le même jour = un jour actif');
});
ok('badges : obtenus, progression, jamais au-delà de la cible', () => {
  const b = badges({ history: [H(at(2026, 9, 1, 6)), H(at(2026, 9, 2, 22), { activity: 'running' })], ascents: [{ result: 'flash', date: 1 }], perfs: [], projects: [{ status: 'done' }] }, { now: at(2026, 9, 3) });
  const get = (id) => b.find((x) => x.id === id);
  assert.ok(get('first').got && get('early').got && get('night').got && get('flash').got && get('asc1').got && get('proj').got);
  assert.equal(get('s10').got, false); assert.equal(get('s10').value, 2); assert.equal(get('finger').got, false);
  assert.ok(b.every((x) => x.value <= x.target));
});
ok('bilan du mois : seulement le mois choisi', () => {
  const r = monthRecap({ history: [H(at(2026, 9, 2)), H(at(2026, 9, 20)), H(at(2026, 8, 30))], ascents: [{ result: 'send', date: at(2026, 9, 5), grade: { label: '6a', order: 8 } }, { result: 'flash', date: at(2026, 9, 5), grade: { label: '6b', order: 10 } }, { result: 'fail', date: at(2026, 9, 5), grade: { label: '7a', order: 14 } }] }, at(2026, 9, 15));
  assert.equal(r.sessions, 2); assert.equal(r.minutes, 120); assert.equal(r.sets, 4); assert.equal(r.sends, 2); assert.equal(r.flashes, 1); assert.equal(r.best, '6b'); assert.equal(r.days, 3);
  assert.match(r.label, /septembre 2026/);
});
console.log(`\n${n} tests OK`);
