// tests/catalog.test.mjs — séances prêtes et sources : chaque séance est jouable et cite des sources enregistrées.
import assert from 'node:assert/strict';
import { CATALOG, buildSession, rankCatalog, needsOf, rankExercises, EX_CATEGORIES } from '../public/catalog.js';
import { SOURCES, sourceRefs } from '../public/sources.js';
import { byId } from '../public/library.js';
import * as C from '../public/catalog.js';
import { CAPACITIES, ACTIVITIES } from '../public/model.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
console.log('Catalogue et sources');
ok('chaque séance : exercices existants, capacités connues, au moins une source enregistrée', () => {
  assert.ok(CATALOG.length >= 15);
  const ids = new Set();
  for (const e of CATALOG) {
    assert.ok(!ids.has(e.id), e.id); ids.add(e.id);
    assert.ok(ACTIVITIES[e.activity], e.id + ' sport');
    assert.ok(e.ex.every((x) => byId(x.libId)), e.id + ' exercice inconnu');
    assert.ok(e.works.every((c) => CAPACITIES[c]), e.id + ' capacité inconnue');
    assert.ok(e.sources.length >= 1 && e.sources.every((s) => SOURCES[s]), e.id + ' source');
    assert.ok(e.why.length > 20 && e.minutes > 0 && [0, 1, 2].includes(e.level));
    const s = buildSession(e); assert.equal(s.exercises.length, e.ex.length); assert.ok(s.exercises.every((x) => x.ok?.length || x.block !== 'main' || x.mode), e.id);
  }
});
ok('sources : auteurs, année, revue, lien https, ce qu’elle montre', () => {
  for (const [id, s] of Object.entries(SOURCES)) { assert.ok(s.authors && s.title && s.journal && s.key, id); assert.ok(s.year >= 1990 && s.year <= 2026, id); assert.match(s.url, /^https?:\/\//, id); }
  assert.equal(sourceRefs(['who2020', 'inconnue']).length, 1);
});
ok('séance : consignes de la bibliothèque, séries, repos et durée chronométrée respectés', () => {
  const s = buildSession(CATALOG.find((e) => e.id === 'run-4x4'));
  const main = s.exercises.find((x) => x.libId === 'run-intervals-long'); assert.equal(main.sets, 4); assert.equal(main.secMax, 240); assert.equal(main.rest, 180);
  assert.equal(s.exercises[0].block, 'warmup'); assert.equal(s.exercises.at(-1).block, 'cool');
});
ok('tri « pour toi » : sport, objectifs, faiblesses ; matériel manquant et niveau trop élevé pénalisés', () => {
  const r = rankCatalog({ acts: ['running'], goals: ['endurance'], weak: ['seuil'], level: 0 });
  assert.equal(r[0].entry.activity, 'running'); assert.ok(r[0].why.includes('ton sport'));
  const noEq = rankCatalog({ acts: ['climbing_boulder'], goals: ['climb'], level: 2, equipment: new Set(['mat']) });
  const hang = noEq.find((x) => x.entry.id === 'clb-maxhangs'); assert.ok(hang.missing.includes('hangboard'));
  assert.ok(noEq.indexOf(hang) > noEq.findIndex((x) => !x.missing.length), 'faisable d’abord');
  assert.deepEqual(needsOf(CATALOG.find((e) => e.id === 'str-maison')), []);
});
ok('top exercices : par catégorie, ce dont tu as besoin en premier, trop durs signalés', () => {
  const r = rankExercises({ need: { force_doigts: 1 }, level: 0, acts: ['climbing_boulder'] });
  assert.deepEqual(Object.keys(r), EX_CATEGORIES.map(([k]) => k));
  assert.ok(r.doigts.length > 0 && (r.doigts[0].lib.caps.force_doigts || 0) > 0);
  assert.ok(r.doigts.some((x) => x.hits.includes('Force des doigts')));
  assert.ok(Object.values(r).flat().every((x) => !x.tooHard || x.lib.minLevel > 0));
});
ok('carnet : chaque muscle et chaque compétence a au moins 3 séances, des 3 niveaux pour chaque sport, tout exercice existe', () => {
  const mu = {}, sk = {};
  for (const e of C.CATALOG) { for (const x of e.ex) assert.ok(byId(x.libId), `${e.id} : ${x.libId}`); const f = C.focusOf(e); for (const m of f.muscles) (mu[m] ||= []).push(e.id); for (const k of f.skills) (sk[k] ||= []).push(e.id); }
  for (const [id] of C.MUSCLE_FOCUS) assert.ok((mu[id] || []).length >= 3, `muscle ${id} : ${(mu[id] || []).length}`);
  for (const [id] of C.COMPETENCES) assert.ok((sk[id] || []).length >= 3, `compétence ${id} : ${(sk[id] || []).length}`);
  for (const a of ['climbing_boulder', 'climbing_route', 'strength', 'conditioning', 'running', 'swimming', 'calisthenics']) for (const lv of [0, 1, 2]) assert.ok(C.CATALOG.filter((e) => e.activity === a && e.level === lv).length >= 2, `${a} niveau ${lv}`);
  assert.equal(new Set(C.CATALOG.map((e) => e.id)).size, C.CATALOG.length, 'identifiants uniques');
  assert.deepEqual(C.focusOf(C.CATALOG.find((e) => e.id === 'pecs-salle')).muscles.slice(0, 1), ['pecs']);
});
console.log(`\n${n} tests OK`);
