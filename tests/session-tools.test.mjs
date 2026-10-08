// tests/session-tools.test.mjs — outils de séance : minuteur d'intervalles, capteur cardio, figures animées, échauffement.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { querySelector: () => null, documentElement: { dataset: {} } };
globalThis.window = { matchMedia: () => ({ matches: false }) };
const { buildPhases, totalSeconds, PRESETS, buildPlan, timerConfig, timerResult, exerciseLines, FORMATS } = await import('../public/timer.js');
const { parseHr } = await import('../public/hr.js');
const { moveKind, figure } = await import('../public/anim.js');
const { warmupFor } = await import('../public/generator.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('Outils de séance');
ok('minuteur 7/3 : préparation, efforts, pauses sans pause finale, repos entre séries seulement entre les séries', () => {
  const ph = buildPhases({ work: 7, rest: 3, reps: 6, sets: 4, setRest: 180 });
  assert.equal(ph[0].k, 'prep');
  assert.equal(ph.filter((p) => p.k === 'work').length, 24);
  assert.equal(ph.filter((p) => p.k === 'rest').length, 20, '5 pauses par série');
  assert.equal(ph.filter((p) => p.k === 'setrest').length, 3);
  assert.equal(ph.at(-1).k, 'work', 'finit sur un effort');
  assert.equal(totalSeconds(ph), 5 + 24 * 7 + 20 * 3 + 3 * 180);
  assert.equal(buildPhases({ work: 20, rest: 10, reps: 8, sets: 1, setRest: 0, prep: 0 }).length, 15);
  for (const p of PRESETS) assert.ok(buildPhases(p).length > 0 && p.note, p.id);
});
ok('chrono : EMOM sur 12 min avec exercices qui tournent, toutes les 2 min, AMRAP, pour le temps, compte à rebours, chronomètre', () => {
  assert.deepEqual(FORMATS.map((f) => f[0]), ['emom', 'amrap', 'fortime', 'intervals', 'countdown', 'stopwatch']);
  const emom = buildPlan(timerConfig({ format: 'emom', every: '60', minutes: '12', text: '10 squats\n\n8 tractions\n12 pompes' }));
  const w = emom.filter((p) => p.k === 'work'); assert.equal(emom[0].k, 'prep'); assert.equal(w.length, 12); assert.ok(w.every((p) => p.s === 60 && p.emom && p.of === 12));
  assert.deepEqual(w.slice(0, 4).map((p) => p.label), ['10 squats', '8 tractions', '12 pompes', '10 squats'], 'les exercices tournent, ligne vide ignorée');
  assert.equal(buildPlan(timerConfig({ format: 'emom', every: '120', minutes: '20' })).filter((p) => p.k === 'work').length, 10, 'toutes les 2 min sur 20 min');
  assert.equal(buildPlan(timerConfig({ format: 'emom', every: '120', minutes: '20' }))[1].label, 'Intervalle 1');
  const am = buildPlan(timerConfig({ format: 'amrap', minutes: '15', text: '5 tractions' })); assert.equal(am.at(-1).s, 900); assert.ok(am.at(-1).amrap);
  const ft = buildPlan(timerConfig({ format: 'fortime', cap: '0' })).at(-1); assert.ok(ft.up && ft.s === 0, 'sans limite');
  assert.equal(buildPlan(timerConfig({ format: 'fortime', cap: '25' })).at(-1).s, 1500);
  assert.equal(buildPlan(timerConfig({ format: 'countdown', minutes: '2', secs: '30' })).at(-1).s, 150);
  assert.ok(buildPlan(timerConfig({ format: 'stopwatch' })).at(-1).up);
  assert.equal(buildPlan(timerConfig({ format: 'intervals', work: '20', rest: '10', reps: '8', sets: '1', setRest: '0' })).filter((p) => p.k === 'work').length, 8, 'intervalles inchangés');
  const big = timerConfig({ format: 'emom', every: '5', minutes: '999', text: 'x\n'.repeat(50) }); assert.equal(big.every, 10); assert.equal(big.minutes, 180); assert.equal(big.exercises.length, 30, 'bornes appliquées');
  assert.deepEqual(exerciseLines('  a \n\n b'), ['a', 'b']);
  assert.equal(timerResult({ format: 'amrap', minutes: 12 }, { rounds: 7 }), '7 tours complets en 12 min');
  assert.equal(timerResult({ format: 'fortime', cap: 20 }, { secs: 754 }), 'Fait en 12:34');
  assert.equal(timerResult({ format: 'fortime', cap: 20 }, { capped: true }), 'Limite de 20 min atteinte');
  assert.match(timerResult({ format: 'stopwatch' }, { secs: 125, laps: [60000, 125000] }), /2 tours : 1:00, 2:05/);
  assert.equal(timerResult({ format: 'emom', every: 60, minutes: 12 }), '12 intervalles de 60 s');
});
ok('cardio Bluetooth : BPM sur 8 ou 16 bits', () => {
  const v = (bytes) => new DataView(Uint8Array.from(bytes).buffer);
  assert.equal(parseHr(v([0, 72])), 72);
  assert.equal(parseHr(v([1, 0x2c, 0x01])), 300);
  assert.equal(parseHr(v([0])), 0); assert.equal(parseHr(null), 0);
});
ok('figures : le bon type de mouvement, un SVG animé par exercice', () => {
  assert.equal(moveKind({ group: 'tirer', name: 'Tractions' }), 'pull');
  assert.equal(moveKind({ group: 'doigts', name: 'Suspension 20 mm' }), 'hang');
  assert.equal(moveKind({ group: 'jambes', name: 'Squat' }), 'squat');
  assert.equal(moveKind({ name: 'Pompes' }), 'push');
  assert.equal(moveKind({ kind: 'run', name: 'Footing' }), 'run');
  assert.equal(moveKind({ kind: 'cool', name: 'Étirements' }), 'stretch');
  const svg = figure({ group: 'tirer' });
  assert.match(svg, /^<svg[\s\S]*<animate attributeName="d"[\s\S]*<\/svg>$/);
});
ok('échauffement ajouté : court, sans matériel', () => {
  const w = warmupFor('strength', 5);
  assert.ok(w.length >= 1); assert.ok(w.every((e) => e.block === 'warmup'));
  const mins = w.reduce((t, e) => t + (e.mode === 'time' ? e.sets * e.secMax / 60 : e.sets * 1), 0);
  assert.ok(mins <= 8, `échauffement trop long : ${mins}`);
});
console.log(`\n${n} tests OK`);
