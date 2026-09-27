// tests/body.test.mjs — profil corporel : réponses bornées, règles expliquées, effet réel sur les séances générées.
import assert from 'node:assert/strict';
import { cleanBody, bodyAdjust } from '../public/body-rules.js';
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
    { age: 100, height: 178, weight: undefined, sex: undefined, shape: undefined, muscled: ['dos'], fitness: 4, breath: 'effort', daily: undefined });
  assert.equal(cleanBody({ age: '' }).age, undefined);
});
ok('règles : souffle court, 60 ans et plus, perte de poids — chacune expliquée', () => {
  assert.deepEqual(bodyAdjust({}), { levelCap: null, restFactor: 1, noPlyo: false, extraIntents: [], reasons: [] });
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
  const avg = (l) => l.reduce((t, e) => t + (e.rest || 0), 0) / l.length; assert.ok(avg(main1) > avg(main0) * 0.9, 'repos au moins aussi longs');
});
ok('objectif « perte de poids » : repos courts (circuit)', () => {
  const c = ctxWith({ shape: 'moyen' }, ['poids']), s = G.generateFromPlan(G.planSession({ activityId: 'conditioning', minutes: 40, seed: 5 }, c), c).session;
  assert.ok(s.exercises.filter((e) => e.block === 'main').every((e) => (e.rest || 0) <= 45));
});
ok('objectif écrit (assistant) : capacités et mesures autorisées seulement, cible jamais inventée hors mesure', () => {
  const g = cleanGoal({ label: 'Courir 10 km sans m’arrêter', caps: [{ id: 'endurance_aerobie', w: 1 }, { id: 'super_pouvoir', w: 1 }], metricId: 'course_10k', target: '55', weeks: 12, steps: ['a', 'b'] });
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
console.log(`\n${n} tests OK`);
