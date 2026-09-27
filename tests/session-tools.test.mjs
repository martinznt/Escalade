// tests/session-tools.test.mjs — outils de séance : minuteur d'intervalles, capteur cardio, figures animées, échauffement.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { querySelector: () => null, documentElement: { dataset: {} } };
globalThis.window = { matchMedia: () => ({ matches: false }) };
const { buildPhases, totalSeconds, PRESETS } = await import('../public/timer.js');
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
