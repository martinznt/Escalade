// tests/v2engine.test.mjs — V2 : simulation « et si ? », ADN et modules, stratégies, mémoire des décisions,
// séance inhabituelle, maîtrise / transfert / carte des relations, modification guidée (plan avant application).
import assert from 'node:assert/strict';
import { simulate, applyChange, metrics, DISCLAIMER } from '../public/whatif.js';
import { dnaFromPhases, phasesFromDna, moduleFromPhases, insertModule } from '../public/dna.js';
import { strategies, decision, recall, ignoredCount, unusualPlan } from '../public/strategy.js';
import { capMastery, transfers, relationMap, MASTERY } from '../public/knowledge.js';
import { parseRequest, planEdit, readMinutes, cleanOps } from '../public/sessionedit.js';
import { normalizePhases } from '../public/phase.js';
import { buildContext } from '../public/brain.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

const S = () => normalizePhases([{ id: 'w', type: 'warmup', minutes: 15 }, { id: 'b', type: 'climb', kind: 'bloc', minutes: 60, intensity: 'hard', goal: 'Préparation' , role: 'prep' }, { id: 'p', type: 'pause', minutes: 15 }, { id: 'v', type: 'climb', kind: 'voie', minutes: 50, intensity: 'max', role: 'perf' }, { id: 'c', type: 'cool', minutes: 10 }]);

ok('« et si je retire 30 min de bloc ? » : conséquences décrites, jamais une certitude', () => {
  const r = simulate(S(), { type: 'minutes', id: 'b', delta: -30 });
  assert.equal(r.after.minutes, r.before.minutes - 30); assert.ok(r.after.load < r.before.load);
  assert.ok(r.changes.some((x) => /Temps intense avant la performance : 60 → 30/.test(x)));
  assert.equal(r.disclaimer, DISCLAIMER); assert.match(DISCLAIMER, /pas une prédiction/);
});
ok('« et si » : intensité, ajout de phase, lieu ; un verrou bloque le changement', () => {
  assert.ok(simulate(S(), { type: 'intensity', id: 'b', value: 'mod' }).changes.some((x) => /Charge estimée/.test(x)));
  const add = simulate(S(), { type: 'add', at: 1, phase: { type: 'main', role: 'technique', minutes: 15 } }); assert.equal(add.phases.length, 6);
  const ph = S(); ph[1].locks = { ...ph[1].locks, minutes: 'user' };
  assert.match(simulate(ph, { type: 'minutes', id: 'b', delta: -10 }).blocked, /verrouillée/);
  assert.match(applyChange(ph, { type: 'remove', id: 'b' }).blocked, /verrouillés/);
  const envs = [{ id: 'x', name: 'Salle X', equipment: ['wall'] }];
  assert.ok(simulate(S(), { type: 'place', id: 'v', envId: 'x', travelMin: 20 }, { envs }).changes.some((c) => /Déplacements : 0 → 20/.test(c)));
});
ok('« et si je remplace cet exercice ? » : capacités qui changent', () => {
  const ex = [{ id: 'e1', name: 'A', sets: 3, caps: { force_doigts: 1 } }, { id: 'e2', name: 'B', sets: 3, caps: { gainage_anterieur: 1 } }];
  const r = simulate(S(), { type: 'replace', from: 'e1', to: { name: 'C', caps: { technique_pieds: 1 } }, exercises: ex });
  assert.ok(r.changes.some((x) => /Force des doigts : moins/.test(x))); assert.ok(r.changes.some((x) => /Précision des pieds : plus/.test(x)));
});
ok('ADN de séance : parts en %, réutilisé pour une autre durée (somme exacte), sans exercices', () => {
  const d = dnaFromPhases(S(), 'Préparation voie');
  assert.equal(d.parts.reduce((t, p) => t + p.share, 0), 100); assert.ok(!('minutes' in d.parts[0])); assert.match(d.summary, /%/);
  for (const M of [90, 120, 200]) { const r = phasesFromDna(d, M); assert.ok(r.ok); assert.equal(r.phases.reduce((t, p) => t + p.minutes, 0), M); assert.equal(r.phases.length, 5); assert.equal(r.phases[3].role, 'perf'); }
  assert.equal(phasesFromDna(d, 20).ok, false, '5 phases ne tiennent pas en 20 min : signalé');
});
ok('modules : insérés avec analyse de compatibilité', () => {
  const m = moduleFromPhases([{ type: 'climb', kind: 'bloc', minutes: 30, intensity: 'max' }], 'Bloc max');
  assert.equal(m.minutes, 30);
  const r = insertModule(S(), m, 3); assert.equal(r.phases.length, 6); assert.equal(r.minutes, 30); assert.ok(r.compat.length);
  const calm = insertModule(S(), moduleFromPhases([{ type: 'mobility', minutes: 10, intensity: 'easy' }]), 4); assert.match(calm.compat[0], /Compatible/);
});
ok('plusieurs stratégies comparées (spécificité, fatigue, matériel, temps, contraintes, capacités)', () => {
  const s = strategies({ label: 'Résistance en voie', activity: 'climbing_route', caps: { endurance_doigts: 1, technique_escalade: 0.6 } });
  assert.deepEqual(s.map((x) => x.id), ['specific', 'mixed', 'physical']);
  for (const x of s) { assert.ok(x.compare.specificity && x.compare.fatigue && x.compare.minutes && x.compare.constraints); assert.equal(x.dna.parts.reduce((t, p) => t + p.share, 0), 100); }
  assert.ok(s[0].compare.equipment.some((e) => /mur/i.test(e))); assert.match(s[2].compare.constraints, /pas garanti/);
  assert.ok(phasesFromDna(s[1].dna, 90).ok);
});
ok('mémoire des décisions : enregistrée, retrouvée par situation, suggestions souvent ignorées signalées', () => {
  const d1 = decision('strategy', 'Stratégie mixte', { reason: 'préserver la performance en voie après le bloc', context: { sport: 'climbing_route' }, ref: 'mixed' }, 1000);
  const d2 = decision('ignored', 'Ajouter un retour au calme', { ref: 'cool' }, 2000), d3 = decision('ignored', 'x', { ref: 'cool' }, 3000);
  assert.equal(recall([d1, d2, d3], { kind: 'strategy', sport: 'climbing_route' })[0].reason, 'préserver la performance en voie après le bloc');
  assert.equal(ignoredCount([d1, d2, d3], 'cool'), 2); assert.equal(decision('???', 'a').kind, 'edit');
});
ok('séance inhabituelle : descriptive, jamais sans assez d’historique', () => {
  const hist = Array.from({ length: 8 }, (_, i) => ({ durationSeconds: 3600, data: { rpe: 3, context: { phases: [{ activity: 'climbing_boulder' }] } } }));
  const r = unusualPlan(normalizePhases([{ type: 'climb', kind: 'voie', minutes: 200, intensity: 'max' }]), hist);
  assert.equal(r.unusual, true); assert.ok(r.notes.some((x) => /Durée prévue 200 min/.test(x))); assert.ok(r.notes.some((x) => /absente/.test(x)));
  assert.ok(!r.notes.join(' ').match(/blessure|médical|danger/i));
  assert.equal(unusualPlan(S(), hist.slice(0, 3)).insufficient, true);
});
ok('maîtrise : fondée sur les données, « données insuffisantes » sinon ; transfert et carte expliqués', () => {
  const ctx = buildContext({ items: [], history: [] });
  const m = capMastery('force_doigts', ctx); assert.equal(m.step, null); assert.match(m.missing[0], /Données insuffisantes/);
  const ctx2 = buildContext({ items: [{ c: 'capdecl', id: 'd1', u: 1, d: { capId: 'force_doigts', level: 2 } }], history: [] });
  const m2 = capMastery('force_doigts', ctx2); assert.ok(MASTERY.includes(m2.level)); assert.ok(m2.basis.length);
  const t = transfers('force_doigts'); assert.ok(t.length >= 2); assert.ok(t.every((x) => /relation du modèle, pas une mesure/.test(x.why)));
  const map = relationMap({ label: 'Voie 7a', caps: [{ id: 'endurance_doigts', w: 1 }] }, ctx); assert.ok(map.nodes.some((x) => x.type === 'exercise')); assert.ok(map.links.every((l) => l.why));
  assert.equal(relationMap({ label: 'Vide', caps: [] }, ctx).empty, true);
});
ok('modifier avec l’IA : plan avant application ; « garde exactement la performance », « j’ai seulement 1 h 20 »', () => {
  assert.equal(readMinutes('j’ai seulement 1 h 20'), 80); assert.equal(readMinutes('45 min'), 45); assert.equal(readMinutes('1,5h'), 90);
  const ph = S(), ops = parseRequest('J’ai seulement 1 h 20. Garde exactement la partie performance', ph);
  assert.deepEqual(ops.map((o) => o.op).sort(), ['keep', 'total']);
  const plan = planEdit(ph, ops);
  assert.equal(plan.phases.reduce((t, p) => t + p.minutes, 0), 80); assert.equal(plan.phases.find((p) => p.id === 'v').minutes, 50, 'performance gardée exactement');
  assert.ok(plan.changes.length && plan.unchanged.some((x) => /Performance/.test(x)) && plan.why.length && plan.consequences.length && plan.tradeoffs.length);
  assert.equal(ph.find((p) => p.id === 'b').minutes, 60, 'rien n’est appliqué avant « Appliquer »');
  const only = planEdit(ph, parseRequest('Je n’ai que 2 h, réduis uniquement la préparation', ph));
  assert.equal(only.phases.find((p) => p.id === 'w').minutes, 15); assert.equal(only.phases.find((p) => p.id === 'b').minutes, 30, 'seule la préparation absorbe les 30 min');
  const locked = S(); locked[3].locks = { ...locked[3].locks, intensity: 'user' };
  const soft = planEdit(locked, parseRequest('moins intense', locked)); assert.equal(soft.phases.find((p) => p.id === 'v').intensity, 'max', 'verrou respecté');
  assert.equal(planEdit(ph, parseRequest('retire la pause', ph)).phases.length, 4);
  assert.deepEqual(cleanOps([{ op: 'eval', code: 'x' }, { op: 'remove', idx: [99, 1] }, { op: 'total', minutes: 'abc' }], 5), [{ op: 'remove', idx: [1], minutes: 0, role: 'technique', dir: -1 }]);
});
console.log(`${n} tests V2 (simulation, ADN, stratégies, décisions, maîtrise, modification guidée) OK`);
