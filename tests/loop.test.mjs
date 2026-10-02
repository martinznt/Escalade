// tests/loop.test.mjs — boucle visible (ce que la dernière séance change pour la suivante : uniquement des règles
// réellement appliquées), « Pour toi » (séance comparée à TES données), charges écrites rapportées telles quelles,
// préférences « aime / à éviter » prises en compte aussi dans les propositions du créateur.
import assert from 'node:assert/strict';
import { buildContext } from '../public/brain.js';
import { nextImpact } from '../public/loop.js';
import { personalFit } from '../public/fit.js';
import { estimateLevel } from '../public/estimate.js';
import { candidates } from '../public/generator.js';
import { proposeForPhase } from '../public/phaseplan.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const okA = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
import { exKey } from '../public/shared.js';
const now = Date.now(), H = 3600000, DAY = 24 * H;
const it = (c, id, d) => ({ c, id, d, u: now });
const hist = (ago, ex, extra = {}) => ({ id: 'h' + ago, sessionName: 'Séance test', startedAt: now - ago, durationSeconds: 3600, data: { rpe: 2, exercises: ex, ...extra } });
const fingerEx = { name: 'Suspensions max', libId: 'hang-max', group: 'doigts', intensity: 'high', risk: 'finger', sets: [{ reps: 1, done: true }] };

ok('rien à dire sans séance récente', () => {
  assert.deepEqual(nextImpact(buildContext({ now })).items, []);
  assert.deepEqual(nextImpact(buildContext({ now, history: [hist(9 * DAY, [])] })).items, []);
});
ok('doigts intenses il y a 10 h, séance dure, gêne signalée, aimé / à éviter : chaque règle appliquée est dite', () => {
  const c = buildContext({ now, history: [hist(10 * H, [fingerEx], { rpe: 4, questionnaire: { answers: [{ q: 'doigts', a: 'Une gêne' }], likes: [{ name: 'Gainage', value: 'aime' }, { name: 'Burpees', value: 'evite' }] } })] });
  const t = nextImpact(c).items.map((x) => x.text).join('\n');
  assert.match(t, /Doigts sollicités intensément il y a 10 h/); assert.match(t, /Gêne aux doigts/); assert.match(t, /jugée dure \(4\/5\)/);
  assert.match(t, /« Gainage » aimé/); assert.match(t, /« Burpees » à éviter/);
  // ce qui est dit est vraiment appliqué par le générateur : l'exercice de doigts intense est écarté
  assert.ok(candidates('climbing_boulder', c, { eq: new Set(['hangboard', 'wall']), level: 2 }).excluded.some((e) => e.x.risk === 'finger'));
});
ok('séance réussie en entier : la marche suivante est annoncée', () => {
  const seance = { id: 's1', name: 'Tirage', exercises: [{ name: 'Tractions', mode: 'reps', sets: 3, repsMin: 6, repsMax: 8 }] };
  const h = { ...hist(5 * H, [{ name: 'Tractions', sets: [{ reps: 8, done: true }, { reps: 8, done: true }, { reps: 8, done: true }] }]), sessionId: 's1' };
  const c = buildContext({ now, history: [h], seances: [seance] });
  assert.ok(nextImpact(c).items.some((x) => /« Tractions » : tout réussi/.test(x.text)));
});
await okA('« à éviter » enregistré par le questionnaire : aussi pris en compte dans les propositions du créateur', async () => {
  const ph = { id: 'x', type: 'main', role: 'gainage', activity: 'conditioning', minutes: 15, intensity: 'mod' }, base = buildContext({ now, items: [it('activity', 'a', { preset: 'conditioning' })] });
  const first = proposeForPhase(ph, base, { eq: new Set() }).items[0]; assert.ok(first, 'au moins une proposition');
  const lib = (await import('../public/library.js')).LIBRARY.find((x) => first.name.includes(x.name));
  const c = buildContext({ now, items: [it('activity', 'a', { preset: 'conditioning' }), it('pref', 'p1', { key: exKey(lib.name), label: lib.name, value: 'evite' })] });
  const again = proposeForPhase(ph, c, { eq: new Set() }).items.find((i) => i.name.includes(lib.name));
  assert.ok(!again || again.reasons.some((x) => /l’éviter/.test(x.text)), 'raison « tu as indiqué l’éviter »');
  assert.notEqual(proposeForPhase(ph, c, { eq: new Set() }).items[0]?.name, first.name, 'il ne reste plus en tête');
});
ok('charges écrites : rapportées telles quelles, sans changer le niveau ; en % du poids seulement s’il est connu', () => {
  const s = { activity: 'conditioning', exercises: [{ name: 'Tractions lestées', libId: 'weighted-pullup', block: 'main', sets: 3, repsMin: 3, repsMax: 5, load: '+10 kg' }] };
  const lv = estimateLevel(s); assert.deepEqual(lv.loads, [{ name: 'Tractions lestées', kg: 10 }]); assert.ok(lv.criteria.some((x) => x.label === 'Charges écrites'));
  const c0 = buildContext({ now, items: [it('activity', 'a', { preset: 'conditioning' })] });
  assert.ok(personalFit(s, c0).missing.some((m) => /poids de corps/.test(m)));
  const c1 = buildContext({ now, items: [it('activity', 'a', { preset: 'conditioning' }), it('perf', 'bw', { metricId: 'body_weight', value: 70, date: now, source: 'measured' })] });
  assert.ok(personalFit(s, c1).lines.some((l) => /10 kg ≈ 14 % de ton poids/.test(l)));
});
ok('« Pour toi » : comparaison à TES séances seulement à partir de 5, exercice au-dessus de ton niveau nommé', () => {
  const s = { activity: 'conditioning', exercises: [{ name: 'Traction à un bras', libId: 'oap', block: 'main', sets: 4, repsMin: 1, repsMax: 1 }] };
  const few = personalFit(s, buildContext({ now, items: [it('activity', 'a', { preset: 'conditioning' })] }));
  assert.ok(few.missing.some((m) => /au moins 5 séances/.test(m)));
  assert.ok(few.lines.some((l) => /« Traction à un bras » demande un niveau avancé/.test(l)));
  const many = Array.from({ length: 6 }, (_, k) => hist((k + 1) * DAY, [{ name: 'Pompes', sets: [{ reps: 10, done: true }, { reps: 10, done: true }] }]));
  const r = personalFit(s, buildContext({ now, history: many, items: [it('activity', 'a', { preset: 'conditioning' })] }));
  assert.ok(r.lines.some((l) => /plus que 100 % de tes 6 séances/.test(l)));
});
console.log(`\n${n} tests boucle / pour toi OK`);
