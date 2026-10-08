// tests/howto.test.mjs — chaque exercice dit comment se placer ; ceux avec une charge disent où la mettre ;
// les explications suivent l'exercice dans les séances et restent modifiables par un administrateur.
import assert from 'node:assert/strict';
const { LIBRARY, byId } = await import('../public/library.js');
const { HOWTO } = await import('../public/library-howto.js');
const { normalizeEx } = await import('../public/shared.js');
const { cleanGlobal } = await import('../server/global.js');
const { parseQuickList } = await import('../public/engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const clean = (t) => typeof t === 'string' && t.length > 0 && t.length <= 300 && !/undefined|null|NaN/.test(t);

console.log('Explications des exercices');
ok('chaque exercice du catalogue a sa position de départ, courte et propre', () => {
  for (const x of LIBRARY) assert.ok(clean(x.start), `${x.id} : position de départ manquante ou trop longue`);
  for (const id of Object.keys(HOWTO)) assert.ok(byId(id), `explication sans exercice : ${id}`);
});
ok('exercice avec une charge (haltères, barre, kettlebell, lest…) : où la mettre et comment la tenir', () => {
  const loaded = LIBRARY.filter((x) => (x.needs || []).some((k) => ['weights', 'barbell', 'kettlebell', 'ezbar'].includes(k)) || /kg|lest|charge/i.test(x.load || ''));
  assert.ok(loaded.length >= 40, `${loaded.length} exercices avec charge`);
  for (const x of loaded) assert.ok(clean(x.loadHow), `${x.id} : où mettre la charge ?`);
  assert.match(byId('pullup-heavy').loadHow, /ceinture de lest/i); assert.match(byId('goblet-squat').loadHow, /contre la poitrine/i); assert.match(byId('back-squat').loadHow, /trapèzes/i);
});
ok('presque tous les exercices principaux ont une version plus facile et une plus dure', () => {
  const main = LIBRARY.filter((x) => x.role === 'main'), both = main.filter((x) => clean(x.easier) && clean(x.harder));
  assert.ok(both.length / main.length > 0.95, `${both.length} / ${main.length}`);
  for (const x of LIBRARY) for (const k of ['easier', 'harder', 'loadHow']) if (x[k]) assert.ok(clean(x[k]), `${x.id}.${k}`);
});
ok('nouveaux exercices pour tous : débuter, reprendre, mobilité, natation de base', () => {
  for (const id of ['sit-to-stand', 'wall-pushup', 'incline-pushup', 'knee-pushup', 'walk-run', 'cat-cow', 'child-pose', 'swim-exhale', 'swim-streamline', 'aqua-jog', 'pinch-block', 'chin-up', 'reverse-lunge']) {
    const x = byId(id); assert.ok(x, id); assert.ok(x.cues.length && x.why && x.src && x.start, id);
  }
  assert.ok(LIBRARY.filter((x) => x.minLevel === 0 && x.role === 'main').length >= 150, 'beaucoup d’exercices accessibles aux débutants');
  const names = LIBRARY.map((x) => x.name.toLowerCase()); assert.equal(new Set(names).size, names.length, 'pas de doublon de nom');
});
ok('les explications suivent l’exercice dans une séance, et un admin peut les modifier', () => {
  const e = normalizeEx({ ...byId('db-row'), libId: 'db-row' }); assert.equal(e.start, byId('db-row').start); assert.equal(e.loadHow, byId('db-row').loadHow);
  assert.equal(normalizeEx({ start: 'x'.repeat(500) }).start.length, 300, 'bornées');
  const g = cleanGlobal('exercise', { name: 'Test', start: 'Debout.', loadHow: 'Un haltère.', easier: 'Plus léger.', harder: 'Plus lourd.', evil: '<script>' });
  assert.deepEqual([g.start, g.loadHow, g.easier, g.harder, g.evil], ['Debout.', 'Un haltère.', 'Plus léger.', 'Plus lourd.', undefined]);
  const q = parseQuickList('4 × 8 tractions').exercises[0]; assert.equal(q.start, byId('pullup').start, 'saisie libre : explications du catalogue reprises');
});
console.log(`\n${n} tests d’explications OK`);
