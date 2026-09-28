// tests/sportplan.test.mjs — tous les sports comme l'escalade : structures par sport, objectif chiffré → séance entière,
// allures et charges tirées des perfs notées (jamais inventées).
import assert from 'node:assert/strict';
import { sportFamily, sportProposals, sportTargets, bestPerf, paceOf, fmtPace, targetAdvice, buildWorkPart, targetParts, targetLabel, defaultWorkParts, SPORT_STRUCTS } from '../public/sportplan.js';
import { buildFromParts } from '../public/climbplan.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ctx = (perfs = []) => ({ perfs, metrics: {}, activities: {}, envs: [], systems: {}, styles: {}, goals: [] });

ok('familles et structures : course, natation, muscu, poids du corps ; la plus adaptée à l’intensité d’abord', () => {
  assert.equal(sportFamily('running'), 'run'); assert.equal(sportFamily('strength'), 'load'); assert.equal(sportFamily('climbing_boulder'), '');
  for (const f of ['run', 'swim', 'load', 'body']) { assert.ok(Object.keys(SPORT_STRUCTS[f]).length >= 5, f); for (const i of ['easy', 'mod', 'hard', 'max']) assert.ok(sportProposals(f, i)[0].fit, `${f} ${i}`); }
});
ok('objectifs possibles d’un sport : ses mesures, triées, sans cotation ni poids du corps', () => {
  const r = sportTargets('running').map((t) => t.id); assert.ok(r.includes('course_10k') && !r.includes('body_weight') && !r.includes('max_bloc'));
  const labels = sportTargets('strength').map((t) => t.label); assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, 'fr')));
});
ok('meilleure perf : plus haut = mieux, sauf les temps (plus bas = mieux) ; « je ne sais pas » ignoré', () => {
  const c = ctx([{ metricId: 'squat_1rm', value: 90 }, { metricId: 'squat_1rm', value: 100 }, { metricId: 'squat_1rm', unknown: true, value: 500 }, { metricId: 'course_10k', value: 55 }, { metricId: 'course_10k', value: 52 }]);
  assert.equal(bestPerf(c, 'squat_1rm'), 100); assert.equal(bestPerf(c, 'course_10k'), 52); assert.equal(bestPerf(c, 'max_dips'), null);
});
ok('allure : 10 km en 50 min → 5:00 /km ; 100 m en 100 s → 1:40 /100 m', () => {
  assert.equal(fmtPace(paceOf('course_10k', 50)), '5:00 /km'); assert.equal(fmtPace(paceOf('nage_100', 100)), '1:40 /100 m'); assert.equal(paceOf('squat_1rm', 100), null);
});
ok('conseil honnête : ambitieux, un cran au-dessus, déjà atteint, ou inconnu (pas d’invention)', () => {
  assert.match(targetAdvice('squat_1rm', 130, 100), /ambitieux/); assert.match(targetAdvice('squat_1rm', 105, 100), /cran/);
  assert.match(targetAdvice('course_10k', 55, 50), /Déjà atteint/); assert.match(targetAdvice('course_10k', 45, 50), /cran|ambitieux/);
  assert.match(targetAdvice('max_tractions', 15, null), /Note ta perf/);
});
ok('course à l’allure objectif : blocs de 1 km à l’allure visée, qui tiennent dans le temps de la partie', () => {
  const r = buildWorkPart({ type: 'work', activity: 'running', intensity: 'hard', structure: 'allure', minutes: 30, target: { metricId: 'course_10k', value: 50 } }, ctx(), { label: 'X' });
  const e = r.exercises[0]; assert.match(e.name, /1 km à 5:00 \/km/); assert.equal(e.mode, 'time'); assert.equal(e.secMin, 300);
  assert.ok(e.sets * (e.secMin + e.rest) <= 30 * 60, 'dans le temps'); assert.equal(e.part, 'X');
});
ok('muscu : charges en kg depuis le max noté ; sinon au ressenti, avec un message', () => {
  const k = buildWorkPart({ type: 'work', activity: 'strength', intensity: 'hard', structure: 'cinq', move: 'squat_1rm', minutes: 20 }, ctx([{ metricId: 'squat_1rm', value: 100 }]));
  assert.equal(k.exercises[0].load, '80 kg'); assert.equal(k.exercises[0].sets, 5); assert.match(k.exercises[0].name, /Squat/); assert.equal(k.notes.length, 0);
  const u = buildWorkPart({ type: 'work', activity: 'strength', intensity: 'hard', structure: 'cinq', move: 'squat_1rm', minutes: 20 }, ctx());
  assert.match(u.exercises[0].load, /pourrais soulever 7 fois/); assert.match(u.notes[0], /Mesures/);
});
ok('muscu vers le max : essai à la cible seulement si elle est proche du max noté', () => {
  const near = buildWorkPart({ type: 'work', activity: 'strength', intensity: 'max', structure: 'max', move: 'squat_1rm', minutes: 25, target: { metricId: 'squat_1rm', value: 102.5 } }, ctx([{ metricId: 'squat_1rm', value: 100 }]));
  assert.ok(near.exercises.some((e) => /essai à 102.5 kg/.test(e.name)));
  const far = buildWorkPart({ type: 'work', activity: 'strength', intensity: 'max', structure: 'max', move: 'squat_1rm', minutes: 25, target: { metricId: 'squat_1rm', value: 140 } }, ctx([{ metricId: 'squat_1rm', value: 100 }]));
  assert.ok(!far.exercises.some((e) => /essai à/.test(e.name))); assert.ok(far.exercises.some((e) => /singles/.test(e.name)));
});
ok('poids du corps : séries à ~50 % du max noté ; mouvements en temps pour le gainage', () => {
  const t = buildWorkPart({ type: 'work', activity: 'conditioning', intensity: 'easy', structure: 'sousmax', move: 'max_tractions', minutes: 15 }, ctx([{ metricId: 'max_tractions', value: 10 }]));
  assert.equal(t.exercises[0].repsMin, 5);
  const g = buildWorkPart({ type: 'work', activity: 'conditioning', intensity: 'hard', structure: 'max', move: 'hollow_hold', minutes: 15 }, ctx([{ metricId: 'hollow_hold', value: 60 }]));
  assert.equal(g.exercises[0].mode, 'time'); assert.equal(g.exercises[0].secMin, 60);
});
ok('objectif chiffré → séance entière : échauffement, montée, objectif, retour au calme, dans le temps donné', () => {
  for (const [sport, metricId, value] of [['running', 'course_10k', 50], ['swimming', 'nage_100', 100], ['strength', 'squat_1rm', 100], ['conditioning', 'max_tractions', 15]]) {
    const p = targetParts({ sport, metricId, value, minutes: 60 });
    assert.equal(p[0].type, 'warmup'); assert.equal(p.at(-1).type, 'cool'); assert.ok(p.some((x) => x.target?.value === value), sport);
    const tot = p.reduce((t, x) => t + x.minutes, 0); assert.ok(Math.abs(tot - 60) <= 10, `${sport} ${tot}`);
  }
  assert.equal(targetLabel('course_10k', 50), '10 km en 50 min'); assert.equal(targetLabel('squat_1rm', 100), 'Squat 100 kg'); assert.equal(targetLabel('max_tractions', 15), 'Tractions strictes 15 rép.');
});
ok('séance complète construite pour un autre sport, avec le bon sport et des parties nommées', () => {
  const parts = targetParts({ sport: 'running', metricId: 'course_5k', value: 25, minutes: 50 });
  const s = buildFromParts(parts, ctx(), { sport: 'running', name: 'Test' });
  assert.equal(s.activity, 'running'); assert.ok(s.exercises.some((e) => /1 km à 5:00/.test(e.name)));
  assert.ok(new Set(s.exercises.map((e) => e.part)).size >= 3);
  const d = defaultWorkParts('strength', 60, 'normal', 'couche_1rm'); assert.equal(d[1].move, 'couche_1rm'); assert.equal(d[2].type, 'main');
  assert.equal(defaultWorkParts('running', 45, 'low')[1].structure, 'footing');
});
console.log(`${n} tests des séances tous sports OK`);
