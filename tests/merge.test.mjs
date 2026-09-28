// tests/merge.test.mjs — fusionner des séances (originales intactes) et conseils pour savoir quoi fusionner.
import assert from 'node:assert/strict';
import { mergeAdvice, bestMerges, mergeSessions, orderForMerge, freshness } from '../public/merge.js';
import { byId } from '../public/library.js';
import { SOURCES } from '../public/sources.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ex = (libId, block = 'main', o = {}) => ({ id: libId + block, libId, name: byId(libId).name, emoji: byId(libId).emoji, block, sets: 3, repsMin: 10, repsMax: 10, rest: 90, ...o });
const S = (id, name, activity, exercises) => ({ id, name, emoji: '🏋️', activity, exercises });
const bloc = S('a', 'Bloc dévers', 'climbing_boulder', [ex('wu-pulse', 'warmup', { mode: 'time', secMin: 300, secMax: 300, sets: 1 }), ex('dev-power-blocs'), ex('limit-boulders'), ex('cd-breath', 'cool', { mode: 'time', secMin: 120, secMax: 120, sets: 1 })]);
const renfo = S('b', 'Renfo gainage', 'conditioning', [ex('wu-pulse', 'warmup', { mode: 'time', secMin: 120, secMax: 120, sets: 1 }), ex('pushup'), ex('dead-bug'), ex('side-plank')]);
const doigts1 = S('c', 'Poutre max', 'climbing_boulder', [ex('hang-max', 'main', { intensity: 'high' }), ex('wall-reglettes')]);
const doigts2 = S('d', 'Réglettes', 'climbing_boulder', [ex('hang-repeaters', 'main', { intensity: 'high' }), ex('hang-max', 'main', { intensity: 'high' })]);

console.log('Fusion');
ok('nouvelle séance : un seul échauffement et un seul retour au calme, parties par séance d’origine', () => {
  const before = JSON.stringify([bloc, renfo]);
  const m = mergeSessions([bloc, renfo]);
  assert.equal(JSON.stringify([bloc, renfo]), before, 'originales intactes');
  assert.notEqual(m.id, bloc.id); assert.equal(m.source, 'merge'); assert.equal(m.name, 'Bloc dévers + Renfo gainage');
  assert.deepEqual([...new Set(m.exercises.map((e) => e.part))], ['🔥 Échauffement', '🏋️ Bloc dévers', '🏋️ Renfo gainage', '🌬️ Retour au calme']);
  assert.equal(m.exercises.filter((e) => e.block === 'warmup').length, 1);
  assert.equal(m.exercises.find((e) => e.block === 'warmup').secMax, 300, 'le plus long échauffement');
  assert.ok(m.exercises.every((e) => !['a', 'b'].includes(e.id) && !e.id.endsWith('main')), 'nouveaux identifiants');
  assert.match(m.notes[0].text, /n’ont pas changé/);
});
ok('exercices en double gardés une seule fois ; nom choisi respecté', () => {
  const m = mergeSessions([doigts1, doigts2], { name: 'Doigts' });
  assert.equal(m.name, 'Doigts'); assert.equal(m.exercises.filter((e) => e.libId === 'hang-max').length, 1);
  assert.match(m.notes[0].text, /en double/);
});
console.log('Conseils');
ok('complémentaires (bloc + renfo) : bonne note ; doigts intenses deux fois : note basse et source citée', () => {
  const good = mergeAdvice([bloc, renfo]), bad = mergeAdvice([doigts1, doigts2]);
  assert.ok(good.score >= 80, `${good.score}`); assert.ok(bad.score < good.score);
  assert.ok(bad.cons.some((t) => /doigts/i.test(t))); assert.ok(bad.sources.includes('schoffl2006'));
  for (const id of [...good.sources, ...bad.sources]) assert.ok(SOURCES[id], id);
  assert.equal(mergeAdvice([bloc]).score, 0);
});
ok('ordre conseillé : technique et intensité d’abord, gainage ensuite', () => {
  assert.ok(freshness(bloc) > freshness(renfo));
  assert.deepEqual(orderForMerge([renfo, bloc]).map((s) => s.id), ['a', 'b']);
  assert.ok(mergeAdvice([renfo, bloc]).cons.some((t) => /Ordre conseillé/.test(t)));
});
ok('meilleures fusions : classées, sans les séances archivées ni vides', () => {
  const best = bestMerges([bloc, renfo, doigts1, doigts2, { ...renfo, id: 'z', archived: true }, S('e', 'Vide', '', [])], 10);
  assert.equal(best.length, 6); assert.ok(best.every((b, i) => i === 0 || b.score <= best[i - 1].score));
  assert.ok(!best.some((b) => b.ids.includes('z') || b.ids.includes('e')));
  assert.deepEqual(new Set(best[0].ids), new Set(['a', 'b']));
});
console.log(`\n${n} tests de fusion OK`);
