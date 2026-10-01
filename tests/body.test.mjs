// tests/body.test.mjs — profil corporel : réponses bornées, règles expliquées, effet réel sur les séances générées.
import assert from 'node:assert/strict';
import { cleanBody, bodyAdjust } from '../public/body-rules.js';
import * as PH from '../public/physique.js';
import { batteryFor } from '../public/assess.js';
import * as G from '../public/generator.js';
import { cleanGoal } from '../server/ai.js';
import { it, env, act, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const EQ = ['bar', 'dips', 'weights', 'band', 'mat', 'box'];
import { ACTIVITIES } from '../public/model.js';
const decl = Object.keys(ACTIVITIES.conditioning.caps).map((capId) => it('capdecl', { capId, level: 2 }));
const ctxWith = (body, goals = []) => ctxOf({ items: [act('conditioning'), env('Maison', EQ), it('config', { ...body }, 'body'), it('config', { goals }, 'main'), ...decl] });
console.log('Profil corporel');
ok('réponses bornées, champs inconnus ou invalides ignorés', () => {
  assert.deepEqual(cleanBody({ age: 300, height: '178', weight: 'abc', shape: 'licorne', muscled: ['dos', 'queue'], fitness: '4', breath: 'effort', daily: 'x' }),
    { age: 100, height: 178, weight: undefined, sex: undefined, shape: undefined, muscled: ['dos'], fitness: 4, breath: 'effort', daily: undefined, physique: undefined });
  assert.deepEqual(cleanBody({ physique: ['v', 'abs', 'licorne', 'v'] }).physique, ['v', 'abs'], 'silhouette : choix connus, sans doublon');
  assert.equal(cleanBody({ age: '' }).age, undefined);
});
ok('règles : souffle court, 60 ans et plus, perte de poids — chacune expliquée', () => {
  assert.deepEqual(bodyAdjust({}), { levelCap: null, restFactor: 1, noPlyo: false, extraIntents: [], reasons: [], sources: [], hypertrophy: false, groups: [] });
  assert.deepEqual(bodyAdjust({ age: 70 }, ['poids']).sources, ['sherrington2019', 'donnelly2009', 'acsm2009'], 'chaque règle cite sa source');
  const a = bodyAdjust({ breath: 'souvent' }); assert.equal(a.levelCap, 0); assert.ok(a.noPlyo); assert.ok(a.restFactor > 1); assert.equal(a.reasons.length, 1);
  const b = bodyAdjust({ age: 67 }); assert.ok(b.noPlyo && b.extraIntents.includes('mobilite'));
  const c = bodyAdjust({ shape: 'rond' }, ['poids']); assert.ok(c.circuit && c.noPlyo && c.extraIntents.includes('endurance')); assert.equal(c.reasons.length, 2);
});
ok('séance générée : niveau plafonné, pas de sauts, repos plus longs, raisons affichées', () => {
  const base = G.planSession({ activityId: 'conditioning', minutes: 45, seed: 3 }, ctxWith({}));
  const tired = G.planSession({ activityId: 'conditioning', minutes: 45, seed: 3 }, ctxWith({ breath: 'souvent', fitness: 1 }));
  assert.ok(base.level > 0, 'niveau déclaré avancé'); assert.equal(tired.level, 0); assert.match(tired.levelHow, /plafonné/);
  assert.ok(tired.bodyReasons.length);
  const r = G.generateFromPlan(tired, ctxWith({ breath: 'souvent', fitness: 1 })), s = r.session;
  assert.ok(!s.exercises.some((e) => e.kind === 'plyo'), 'aucun exercice sauté');
  assert.ok(r.meta.why.some((w) => /essouffl/.test(w)), 'la raison est expliquée');
  const s0 = G.generateFromPlan(base, ctxWith({})).session, main0 = s0.exercises.filter((e) => e.block === 'main'), main1 = s.exercises.filter((e) => e.block === 'main');
  assert.ok(main1.length && main0.length);
  const same = main1.filter((e) => main0.some((x) => x.name === e.name)); assert.ok(same.length, 'des exercices communs à comparer');
  for (const e of same) assert.ok((e.rest || 0) >= (main0.find((x) => x.name === e.name).rest || 0), `repos au moins aussi long : ${e.name}`);
});
ok('objectif « perte de poids » : repos courts (circuit)', () => {
  const c = ctxWith({ shape: 'moyen' }, ['poids']), s = G.generateFromPlan(G.planSession({ activityId: 'conditioning', minutes: 40, seed: 5 }, c), c).session;
  assert.ok(s.exercises.filter((e) => e.block === 'main').every((e) => (e.rest || 0) <= 45));
});
ok('objectif écrit (assistant) : capacités et mesures autorisées seulement, cible jamais inventée hors mesure', () => {
  const g = cleanGoal({ label: 'Courir 10 km sans m’arrêter', caps: [{ id: 'endurance_aerobie', w: 1 }, { id: 'super_pouvoir', w: 1 }], metricId: 'course_10k', target: '55', weeks: 12, steps: ['a', 'b'] }, 'Courir 10 km en 55 min');
  assert.deepEqual(g.caps.map((c) => c.id), ['endurance_aerobie']); assert.equal(g.metricId, 'course_10k'); assert.equal(g.target, 55); assert.equal(g.weeks, 12);
  assert.equal(cleanGoal({ label: 'x', caps: [{ id: 'endurance_aerobie' }], metricId: 'inconnue', target: 9 }).target, null);
  assert.equal(cleanGoal({ label: 'rien', caps: [] }), null, 'rien d’exploitable : refusé');
});
ok('séance sur mesure : muscles et intentions choisis ciblés, zones ménagées exclues', () => {
  const c = ctxWith({});
  const p = G.planSession({ activityId: 'conditioning', minutes: 40, seed: 7, muscles: ['cuisses'], intents: [{ label: 'Gainage', caps: { gainage_anterieur: 1 } }], avoidZones: ['wrists'] }, c);
  const ids = p.distribution.map((d) => d.capId); assert.ok(ids.includes('force_jambes') && ids.includes('gainage_anterieur'), ids.join(','));
  assert.match(p.intentionText, /sur mesure/);
  const s = G.generateFromPlan(p, c).session;
  assert.ok(!s.exercises.some((e) => e.block === 'main' && /pompe|dips/i.test(e.name)), 'aucune pompe : poignets ménagés');
});
ok('silhouette : forme en V et abdos visibles → muscles visés, mensurations, conseils honnêtes (rien de garanti)', () => {
  assert.deepEqual(PH.physiqueGroups(['v', 'abs']), ['dos', 'epaules', 'abdos']);
  assert.deepEqual(PH.physiqueMeasures(['v', 'abs']).map(([id]) => id), ['tour_epaules', 'tour_taille', 'masse_grasse']);
  assert.match(PH.PHYSIQUE.abs.tip, /ne fait pas « fondre »/);
  const b = batteryFor({ envies: ['physique'], physique: ['v', 'bras'] }).map((x) => x.metricId); assert.deepEqual(b, ['tour_epaules', 'tour_taille', 'tour_bras']);
  assert.ok(batteryFor({ envies: ['muscle'] }).some((x) => x.metricId === 'tour_bras'));
  const a = bodyAdjust({ physique: ['v'] }, ['physique']); assert.ok(a.hypertrophy); assert.deepEqual(a.groups, ['dos', 'epaules']); assert.ok(a.sources.includes('schoenfeld2017'));
  assert.ok(bodyAdjust({ physique: ['abs'] }, []).sources.includes('vispute2011'), 'abdos : la perte de gras localisée n’existe pas, et c’est dit');
});
ok('silhouette : la séance générée cible le dos et les épaules, séries de 8 à 12', () => {
  const gym = ['bar', 'weights', 'band', 'mat', 'bench', 'cable', 'latpulldown', 'seatedrow'];
  const mk = (body, goals) => ctxOf({ items: [act('conditioning'), act('strength'), env('Salle', gym), it('config', { ...body }, 'body'), it('config', { goals }, 'main'), ...decl] });
  const c = mk({ physique: ['v'] }, ['physique']), p = G.planSession({ activityId: 'strength', minutes: 50, seed: 2 }, c), s = G.generateFromPlan(p, c).session;
  const main = s.exercises.filter((e) => e.block === 'main');
  assert.ok(main.length >= 3);
  assert.ok(main.some((e) => /tirage|traction|rowing|élévation|face pull|oiseau/i.test(e.name)), main.map((e) => e.name).join(', '));
  const reps = main.filter((e) => e.mode !== 'time' && e.repsMax);
  assert.ok(reps.length && reps.every((e) => e.repsMin >= 6 && e.repsMax <= 15), reps.map((e) => `${e.name} ${e.repsMin}-${e.repsMax}`).join(', '));
  assert.ok(p.bodyReasons.some((r) => /Silhouette visée/.test(r)));
});
ok('volume de la semaine par muscle : séries comptées (premier rôle 1, second rôle ½), repère 10–20', () => {
  const now = Date.now(), h = (d, exs) => ({ id: 'h' + d, startedAt: now - d * 864e5, data: { exercises: exs } });
  const ex = (prim, sec, n) => ({ name: 'x', prim, sec, sets: Array.from({ length: n }, () => ({ done: true })) });
  const ctx = { now, history: [h(1, [ex(['grand_dorsal'], ['biceps'], 4)]), h(3, [ex(['grand_dorsal', 'rhomboides'], [], 4), ex(['deltoide_lat'], [], 3)]), h(10, [ex(['grand_dorsal'], [], 10)])] };
  const r = Object.fromEntries(PH.weeklySets(ctx, ['dos', 'bras', 'epaules']).map((x) => [x.id, x]));
  assert.equal(r.dos.sets, 8, 'les deux séances de la semaine, pas celle d’il y a 10 jours'); assert.equal(r.dos.state, 'mid');
  assert.equal(r.bras.sets, 2); assert.equal(r.epaules.sets, 3); assert.match(r.dos.text, /encore 2/);
});
ok('suivi de silhouette : évolution et rapport épaules / taille, seulement avec des mesures notées', () => {
  const p = (metricId, value, date) => ({ metricId, value, date });
  const ctx = { perfs: [p('tour_epaules', 110, 1), p('tour_epaules', 114, 5), p('tour_taille', 84, 2), p('tour_taille', 80, 6)] };
  const t = PH.physiqueTrack(ctx, ['v']); assert.equal(t.ratio, 1.43); assert.match(t.ratioText, /pas une norme/);
  assert.deepEqual(t.rows.map((r) => [r.metricId, r.delta]), [['tour_epaules', 4], ['tour_taille', -4]]);
  assert.equal(PH.physiqueTrack({ perfs: [] }, ['v']).ratio, null, 'rien d’inventé sans mesure');
});
console.log(`\n${n} tests OK`);
