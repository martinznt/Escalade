// tests/climb.test.mjs — carnet d'escalade : pyramide, projets, test de doigts.
import assert from 'node:assert/strict';
import { pyramid, mainSystem, projectStats, addTries, fingerTest } from '../public/climb.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const G = (label, order, sys = 'font') => ({ systemId: sys, systemName: sys === 'font' ? 'Fontainebleau' : 'Couleurs', levelId: 'l' + order, label, order, total: 20, color: '' });
const A = (kind, g, result, date = 1000) => ({ kind, grade: g, result, date });
const D = 86400000;
console.log('Carnet d’escalade');
ok('pyramide : réussites seulement, par niveau, du plus dur au plus facile, flash à part', () => {
  const as = [A('bloc', G('6a', 8), 'flash'), A('bloc', G('6a', 8), 'send'), A('bloc', G('6b', 10), 'work'), A('bloc', G('6c', 12), 'attempt'), A('bloc', G('5c', 6), 'fail'), A('voie', G('6a', 8), 'send'), A('bloc', G('6a', 8), 'send')];
  const p = pyramid(as, { kind: 'bloc' });
  assert.deepEqual(p.rows.map((r) => [r.label, r.flash, r.send]), [['6b', 0, 1], ['6a', 1, 2]]);
  assert.equal(p.total, 4); assert.equal(p.rows[1].pct, 1); assert.equal(p.systemName, 'Fontainebleau');
});
ok('pyramide : système principal uniquement (aucune conversion inventée) et période', () => {
  const as = [A('bloc', G('Jaune', 3, 'col'), 'send'), A('bloc', G('6a', 8), 'send', 10 * D), A('bloc', G('6b', 10), 'send', 11 * D), A('bloc', G('5a', 4), 'send', 1 * D)];
  assert.equal(mainSystem(as, 'bloc'), 'font');
  assert.ok(!pyramid(as, { kind: 'bloc' }).rows.some((r) => r.label === 'Jaune'));
  assert.deepEqual(pyramid(as, { kind: 'bloc', since: 5 * D }).rows.map((r) => r.label), ['6b', '6a']);
  assert.deepEqual(pyramid([], { kind: 'voie' }).rows, []);
});
ok('projet : essais regroupés par jour, séances et durée', () => {
  let p = { tries: [], startedAt: 0 };
  p = addTries(p, 1, 1 * D); p = addTries(p, 2, 1 * D + 3600000); p = addTries(p, 1, 3 * D);
  assert.equal(p.tries.length, 2);
  const s = projectStats(p, 10 * D); assert.equal(s.attempts, 4); assert.equal(s.sessions, 2); assert.equal(s.days, 9, 'depuis le premier essai');
  assert.deepEqual(projectStats({}, 0), { attempts: 0, sessions: 0, days: 0, last: 0 });
});
ok('test de doigts : dernier résultat, à refaire après 4 semaines', () => {
  const perfs = [{ metricId: 'suspension_20mm', value: 12, date: 0 }, { metricId: 'suspension_20mm', value: 15, date: 10 * D }, { metricId: 'max_pompes', value: 40, date: 20 * D }];
  const f = fingerTest(perfs, 20 * D); assert.equal(f.last.value, 15); assert.equal(f.days, 10); assert.equal(f.due, false); assert.equal(f.time.length, 2);
  assert.equal(fingerTest(perfs, 40 * D).due, true); assert.equal(fingerTest([], 0).due, true);
});
console.log(`\n${n} tests OK`);
