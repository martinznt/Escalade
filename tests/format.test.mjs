// tests/format.test.mjs — format de séance choisi (parties, ordre, temps de chacune) et durées longues.
import assert from 'node:assert/strict';
import * as G from '../public/generator.js';
import { exMinutes, sessionMinutes } from '../public/engine.js';
import { PART_TYPES, cleanParts, presetParts, scaleParts, splitMinutes, totalMinutes, formatAdvice, parseFormats, stretchBeforeEffort } from '../public/format.js';
import { act, env, ctxOf } from './fixtures.mjs';
import { byId } from '../public/library.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const home = (eq = ['mat', 'bar', 'band']) => ctxOf({ items: [act('conditioning'), act('strength'), act('running'), act('climbing_boulder'), env('Maison', eq)] });
const partMinutes = (s) => { const m = new Map(); for (const e of s.exercises) m.set(e.part, (m.get(e.part) || 0) + exMinutes(e)); return m; };

console.log('Format : règles');
ok('parties nettoyées : types connus, 1 à 180 min, 4 h au total, 10 parties au plus', () => {
  assert.deepEqual(cleanParts([{ type: 'warmup', minutes: 0 }, { type: 'x', minutes: 10 }, { type: 'main', minutes: 999 }]), [{ type: 'warmup', minutes: 1 }, { type: 'main', minutes: 180 }]);
  assert.equal(totalMinutes(cleanParts(Array.from({ length: 12 }, () => ({ type: 'main', minutes: 60 })))), 240);
  assert.equal(cleanParts(Array.from({ length: 12 }, () => ({ type: 'core', minutes: 5 }))).length, 10);
});
ok('formats tout prêts et changement de durée : la somme tombe juste', () => {
  for (const m of [20, 45, 90, 150, 240]) for (const id of ['classique', 'etirements', 'complet', 'cardio-renfo']) assert.equal(totalMinutes(presetParts(id, m)), m, `${id} ${m}`);
  const p = scaleParts([{ type: 'warmup', minutes: 10 }, { type: 'main', minutes: 40 }, { type: 'stretch', minutes: 10 }], 120);
  assert.deepEqual(p.map((x) => x.minutes), [20, 80, 20]);
  assert.ok(splitMinutes([['warmup', 0.01], ['main', 1]], 10).every((x) => x.minutes >= 1));
});
ok('conseils sourcés : pas d’échauffement, étirements avant l’effort', () => {
  const a = formatAdvice([{ type: 'stretch', minutes: 10 }, { type: 'strength', minutes: 30 }]);
  assert.ok(a.some((x) => x.sources.includes('soligard2008'))); assert.ok(a.some((x) => x.sources.includes('behm2016')));
  assert.deepEqual(formatAdvice(presetParts('etirements', 60)), []);
  assert.equal(stretchBeforeEffort([{ type: 'main' }, { type: 'stretch' }], 1), false);
});
ok('formats gardés : JSON invalide ignoré, parties revalidées', () => {
  assert.deepEqual(parseFormats('pas du json'), []);
  assert.deepEqual(parseFormats(JSON.stringify([{ id: 'f1', name: 'Mon format', parts: [{ type: 'warmup', minutes: 10 }, { type: 'nope', minutes: 5 }] }, { id: '', parts: [] }])), [{ id: 'f1', name: 'Mon format', parts: [{ type: 'warmup', minutes: 10 }] }]);
});

console.log('Format : génération');
ok('séance au format choisi : parties dans l’ordre, chacune proche de son temps', () => {
  const parts = [{ type: 'warmup', minutes: 10 }, { type: 'strength', minutes: 30 }, { type: 'core', minutes: 10 }, { type: 'stretch', minutes: 10 }];
  const plan = G.planSession({ activityId: 'conditioning', parts, seed: 3 }, home());
  assert.equal(plan.minutes, 60); assert.deepEqual(plan.blocks.map((b) => b.minutes), [10, 30, 10, 10]);
  const s = G.generateFromPlan(plan, home()).session;
  const order = [...new Set(s.exercises.map((e) => e.part))];
  assert.deepEqual(order, ['🔥 Échauffement', '🏋️ Renforcement', '🧱 Gainage', '🧘 Étirements']);
  const pm = partMinutes(s);
  for (const p of parts) { const got = pm.get(`${PART_TYPES[p.type].emoji} ${PART_TYPES[p.type].label}`); assert.ok(got >= p.minutes * 0.6 && got <= p.minutes * 1.5, `${p.type} : ${got} min pour ${p.minutes}`); }
  assert.ok(s.exercises.filter((e) => e.part.includes('Échauffement')).every((e) => e.block === 'warmup'));
  assert.ok(s.exercises.filter((e) => e.part.includes('Étirements')).every((e) => e.block === 'cool'));
});
ok('étirements avant l’effort → mouvements dynamiques ; à la fin → étirements tenus', () => {
  const s1 = G.generateFromPlan(G.planSession({ activityId: 'conditioning', parts: [{ type: 'stretch', minutes: 8 }, { type: 'main', minutes: 30 }], seed: 2 }, home()), home()).session;
  assert.ok(s1.exercises.filter((e) => e.part.includes('Étirements')).every((e) => /^wu-|^mob-(thoracic|ankles|shoulders)/.test(e.libId)));
  const s2 = G.generateFromPlan(G.planSession({ activityId: 'conditioning', parts: [{ type: 'main', minutes: 30 }, { type: 'stretch', minutes: 8 }], seed: 2 }, home()), home()).session;
  assert.ok(s2.exercises.filter((e) => e.part.includes('Étirements')).every((e) => /^cd-|^mob-/.test(e.libId)));
});
ok('pas d’exercice en double entre les parties', () => {
  const s = G.generateFromPlan(G.planSession({ activityId: 'conditioning', parts: [{ type: 'main', minutes: 25 }, { type: 'strength', minutes: 25 }, { type: 'core', minutes: 15 }], seed: 5 }, home()), home()).session;
  const ids = s.exercises.map((e) => e.libId).filter(Boolean); assert.equal(ids.length, new Set(ids).size);
});
ok('escalade au format choisi : échauffement, grimpe, renfo, étirements', () => {
  const c = ctxOf({ items: [act('climbing_boulder'), env('Salle', ['wall', 'hangboard', 'bar', 'mat'])] });
  const s = G.generateFromPlan(G.planSession({ activityId: 'climbing_boulder', parts: presetParts('complet', 120), seed: 4 }, c), c).session;
  const order = [...new Set(s.exercises.map((e) => e.part))];
  assert.equal(order[0], '🔥 Échauffement'); assert.equal(order.at(-1), '🧘 Étirements'); assert.ok(order.includes('🏋️ Renforcement'));
  assert.ok(sessionMinutes(s) >= 80, `${sessionMinutes(s)} min`);
});
ok('durée longue sans format (2 h 30) : la séance est vraiment longue', () => {
  const s = G.generateFromPlan(G.planSession({ activityId: 'conditioning', minutes: 150, seed: 1 }, home()), home()).session;
  assert.ok(sessionMinutes(s) >= 100, `${sessionMinutes(s)} min`);
});
ok('séance multi-sports : chaque partie garde son sport (renfo puis bloc), le sport est dans le titre de la partie', () => {
  const c = ctxOf({ items: [act('conditioning'), act('climbing_boulder'), env('Salle', ['mat', 'bar', 'band', 'wall', 'hangboard'])] });
  assert.deepEqual(cleanParts([{ type: 'main', minutes: 20, activity: 'climbing_boulder' }, { type: 'main', minutes: 20, activity: '<bad>' }]), [{ type: 'main', minutes: 20, activity: 'climbing_boulder' }, { type: 'main', minutes: 20 }]);
  assert.equal(scaleParts([{ type: 'main', minutes: 30, activity: 'climbing_boulder' }], 60)[0].activity, 'climbing_boulder');
  for (const seed of [1, 2, 3, 4]) {
    const plan = G.planSession({ activityId: 'conditioning', parts: [{ type: 'warmup', minutes: 10 }, { type: 'strength', minutes: 25 }, { type: 'main', minutes: 30, activity: 'climbing_boulder' }, { type: 'stretch', minutes: 10 }], seed }, c);
    const s = G.generateFromPlan(plan, c).session, climb = s.exercises.filter((e) => /Escalade — bloc/.test(e.part));
    assert.ok(climb.length, `seed ${seed} : partie bloc présente`);
    assert.ok(climb.some((e) => byId(e.libId)?.needs?.includes('wall')), `seed ${seed} : on grimpe vraiment dans la partie bloc`);
    assert.ok(!s.exercises.filter((e) => e.part === '🏋️ Renforcement').some((e) => byId(e.libId)?.needs?.includes('wall')), 'renfo sans mur');
  }
});
console.log(`\n${n} tests du format de séance OK`);
