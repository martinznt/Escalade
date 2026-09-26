// tests/generator.test.mjs — générateur universel : simulation, matériel, durées, mode léger, explications.
import assert from 'node:assert/strict';
import * as G from '../public/generator.js';
import { sessionMinutes } from '../public/engine.js';
import { byId } from '../public/library.js';
import { exKey } from '../public/shared.js';
import { NOW, it, perf, env, act, entry, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const home = (eq = ['mat']) => ctxOf({ items: [act('conditioning'), act('strength'), act('running'), env('Maison', eq)] });
const libOf = (e) => byId(e.libId);

console.log('Simulation');
ok('la simulation expose intention, répartition, blocs, difficulté, matériel et raisons', () => {
  const p = G.planSession({ activityId: 'conditioning', minutes: 30, seed: 1 }, home());
  for (const k of ['intentionText', 'distribution', 'blocks', 'difficulty', 'neededEquipment', 'preview', 'levelHow']) assert.ok(p[k] != null, k);
  assert.ok(p.distribution.every((d) => d.reasons.length));
  assert.equal(p.blocks.reduce((t, b) => t + b.minutes, 0), 30);
});
ok('sans donnée : niveau prudent (débutant), expliqué', () => {
  const p = G.planSession({ activityId: 'strength', minutes: 30, seed: 1 }, home());
  assert.equal(p.level, 0); assert.match(p.levelHow, /prudence/);
});
ok('niveau : arrondi prudent (0,5 reste débutant)', () => {
  const c = ctxOf({ items: [act('conditioning'), it('capdecl', { capId: 'tirage_vertical', level: 1 }), it('capdecl', { capId: 'gainage_anterieur', level: 0 })] });
  assert.equal(G.levelFor('conditioning', c).level, 0);
});
ok('priorité mise à 0 : la capacité disparaît de la simulation', () => {
  const p1 = G.planSession({ activityId: 'conditioning', minutes: 30, seed: 1 }, home());
  const id = p1.distribution[0].capId;
  const p2 = G.planSession({ activityId: 'conditioning', minutes: 30, seed: 1, priorities: { [id]: 0 } }, home());
  assert.ok(!p2.distribution.some((d) => d.capId === id));
});
ok('capacité impossible à travailler avec le matériel : signalée comme manquante', () => {
  const p = G.planSession({ activityId: 'conditioning', minutes: 30, seed: 1, priorities: { force_doigts: 3 } }, home([]));
  assert.ok(p.missing.some((m) => /aucun exercice compatible/.test(m)));
});

console.log('Génération');
ok('respecte le matériel disponible (aucun exercice avec matériel absent)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { session } = G.generateUniversal({ activityId: 'conditioning', minutes: 30, seed }, home(['mat']));
    for (const e of session.exercises) { const l = libOf(e); if (l) assert.ok(l.needs.every((k) => k === 'mat'), `${e.name} demande ${l.needs}`); }
  }
});
for (const m of [5, 10, 12, 15, 20, 30, 45, 60]) ok(`durée ${m} min tenue (±25 %, min 3 min)`, () => {
  const { session } = G.generateUniversal({ activityId: 'conditioning', minutes: m, seed: 7 }, home(['mat', 'bar']));
  const got = sessionMinutes(session);
  assert.ok(Math.abs(got - m) <= Math.max(3, m * 0.25), `${got} pour ${m}`);
  assert.ok(session.exercises.some((e) => e.block === 'main'));
});
ok('course à pied : une sortie longue n’est pas écrasée dans 30 min', () => {
  const { session } = G.generateUniversal({ activityId: 'running', minutes: 30, seed: 3 }, home(['track']));
  assert.ok(sessionMinutes(session) <= 38);
});
ok('explication : faits, inférences, manques et raison de chaque exercice principal', () => {
  const { session, meta } = G.generateUniversal({ activityId: 'strength', minutes: 40, seed: 2 }, home(['mat', 'weights', 'bench']));
  assert.ok(session.explain.facts.length && session.explain.inferences.length);
  for (const e of session.exercises.filter((x) => x.block === 'main')) assert.ok(e.why, e.name);
  assert.ok(['debutant', 'intermediaire', 'avance'].includes(meta.level.level));
});
ok('aucune performance inventée : pas de charge sans historique', () => {
  const { session } = G.generateUniversal({ activityId: 'strength', minutes: 40, seed: 2 }, home(['mat', 'weights', 'bench', 'barbell']));
  for (const e of session.exercises) assert.ok(!/\d+(\.\d+)?\s*kg/.test(e.load || ''), `${e.name} : ${e.load}`);
});
ok('charge reprise uniquement depuis l’historique réel', () => {
  const g1 = G.generateUniversal({ activityId: 'strength', minutes: 40, seed: 2 }, home(['mat', 'weights', 'bench', 'barbell'])).session;
  const main = g1.exercises.find((e) => e.block === 'main' && e.mode !== 'time');
  const c = ctxOf({ items: [act('strength'), env('Maison', ['mat', 'weights', 'bench', 'barbell'])], history: [entry(5, [{ name: main.name, sets: [{ reps: 8, load: 20, done: true }] }])] });
  const s = G.generateUniversal({ activityId: 'strength', minutes: 40, seed: 2 }, c).session.exercises.find((e) => exKey(e.name) === exKey(main.name));
  if (s) assert.match(s.note, /Dernière fois/);
});
ok('mode léger : uniquement des exercices peu intenses', () => {
  const { session } = G.generateUniversal({ activityId: 'conditioning', minutes: 25, light: true, seed: 4 }, home(['mat']));
  for (const e of session.exercises.filter((x) => x.block === 'main')) { const l = libOf(e); if (l) assert.equal(l.intensity, 'low', e.name); }
});
ok('gêne aux doigts signalée : travail spécifique des doigts écarté', () => {
  const c = ctxOf({ items: [act('conditioning'), env('Salle', ['hangboard', 'bar', 'mat'])], history: [entry(1, ['Pompes'], { data: { questionnaire: { answers: [{ q: 'doigts', a: 'Gêne légère' }] } } })] });
  assert.equal(G.fingerComplaint(c), true);
  const { excluded } = G.candidates('climbing_boulder', c, { eq: new Set(['hangboard', 'bar', 'mat']), level: 2, light: false });
  assert.ok(excluded.some((e) => e.why.some((w) => /doigts/.test(w))));
});
ok('escalade : générée via le moteur historique, sans doigts si gêne', () => {
  const c = ctxOf({ items: [act('climbing_boulder'), env('Salle', ['wall', 'hangboard'])], history: [entry(1, ['Pompes'], { data: { questionnaire: { answers: [{ q: 'doigts', a: 'Douleur' }] } } })] });
  const { session } = G.generateUniversal({ activityId: 'climbing_boulder', minutes: 45, seed: 1 }, c);
  assert.ok(session.exercises.length);
  assert.ok(session.explain.excluded.some((x) => /doigts/.test(x)));
});
ok('exercice « évité » : pénalisé, et s’il reste, expliqué', () => {
  const base = G.generateUniversal({ activityId: 'conditioning', minutes: 30, seed: 9 }, home(['mat'])).session;
  const main = base.exercises.find((e) => e.block === 'main');
  const c = ctxOf({ items: [act('conditioning'), env('Maison', ['mat']), it('pref', { key: exKey(main.name), label: main.name, value: 'evite' })] });
  const s = G.generateUniversal({ activityId: 'conditioning', minutes: 30, seed: 9 }, c).session;
  const again = s.exercises.find((e) => exKey(e.name) === exKey(main.name));
  if (again) assert.match(again.why, /préfères l’éviter/);
});

console.log('Modifications');
ok('adaptation de durée : reconstruction avec liste des changements', () => {
  const { session } = G.generateUniversal({ activityId: 'conditioning', minutes: 45, seed: 5 }, home(['mat', 'bar']));
  for (const m of [10, 15, 20]) {
    const a = G.adaptDuration(session, m, home(['mat', 'bar']));
    assert.ok(a.changes.length); assert.ok(Math.abs(a.minutes - m) <= Math.max(4, m * 0.3), `${a.minutes} pour ${m}`);
    assert.equal(a.session.context.plannedMin, m);
  }
});
ok('alternatives : chaque proposition a une raison, les « évités » sont exclus', () => {
  const ex = { name: 'Tractions', libId: 'pullup', block: 'main' };
  const alts = G.alternatives(ex, home(['bar', 'mat', 'band']), {});
  assert.ok(alts.length >= 3);
  for (const a of alts) assert.ok(a.reasons.length && a.kinds.length);
  const c = ctxOf({ items: [env('Maison', ['bar', 'mat', 'band']), it('pref', { key: exKey(alts[0].lib.name), value: 'evite' })] });
  assert.ok(!G.alternatives(ex, c, {}).some((a) => a.lib.id === alts[0].lib.id));
});
ok('remplacement : garde le bloc, décrit le changement', () => {
  const { session } = G.generateUniversal({ activityId: 'conditioning', minutes: 30, seed: 5 }, home(['mat']));
  const e = session.exercises.find((x) => x.block === 'main');
  const alt = G.alternatives(e, home(['mat']), { session })[0];
  const r = G.replaceExercise(session, e.id, alt.lib.id, 'test');
  assert.equal(r.change.from, e.name); assert.equal(r.session.exercises.find((x) => x.libId === alt.lib.id).block, 'main');
});
ok('matériel qui disparaît : exercices remplacés ou retirés, jamais conservés', () => {
  const { session } = G.generateUniversal({ activityId: 'conditioning', minutes: 30, seed: 6, priorities: { tirage_vertical: 3 } }, home(['bar', 'mat']));
  assert.ok(session.exercises.some((e) => (libOf(e)?.needs || []).includes('bar')));
  const r = G.rebuildForEquipment(session, new Set(['mat']), home(['mat']));
  assert.ok(r.changes.length);
  for (const e of r.session.exercises) assert.ok(!(libOf(e)?.needs || []).includes('bar'), e.name);
});
ok('matériel ajouté : nouvelles possibilités expliquées', () => {
  const p = G.newPossibilities(new Set(['mat']), new Set(['mat', 'rings']), 'conditioning');
  assert.ok(p.length); assert.ok(p.every((x) => /anneaux/i.test(x.reason)));
});
ok('séance vide : estimation accessible sans planter', () => {
  assert.equal(G.estimateLevel({ exercises: [] }).level, 'debutant');
});

console.log(`\n${n} tests du générateur OK`);
