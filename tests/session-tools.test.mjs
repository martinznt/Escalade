// tests/session-tools.test.mjs — outils de séance : minuteur d'intervalles, capteur cardio, figures animées, échauffement.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { querySelector: () => null, documentElement: { dataset: {} } };
globalThis.window = { matchMedia: () => ({ matches: false }) };
const { buildPhases, totalSeconds, PRESETS, buildPlan, timerConfig, timerResult, exerciseLines, FORMATS, chronoSummary, emomPlan, emomText, catchUp, timerExercises } = await import('../public/timer.js');
const SCHEMA = await import('../public/items.js');
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
  // EMOM : un seul calcul pour le réglage, le chrono, le résumé et le résultat (avant : 240 intervalles au plus, et 10 min à 90 s devenait 10 min 30).
  const long = emomPlan(timerConfig({ format: 'emom', every: '10', minutes: '180' })); assert.deepEqual([long.n, long.seconds, long.exact], [1080, 10800, true]);
  const lw = buildPlan(timerConfig({ format: 'emom', every: '10', minutes: '180' })).filter((p) => p.k === 'work'); assert.equal(lw.length, 1080); assert.ok(lw.every((p) => p.of === 1080 && p.unit === 'Intervalle'));
  const odd = timerConfig({ format: 'emom', every: '90', minutes: '10' }), oe = emomPlan(odd);
  assert.deepEqual([oe.n, oe.seconds, oe.exact], [6, 540, false]); assert.equal(totalSeconds(buildPlan({ ...odd, prep: 0 })), 540, 'jamais plus long que demandé');
  assert.equal(emomText(oe), '6 intervalles de 1 min 30 s, soit 9 min (au lieu de 10 min)'); assert.equal(chronoSummary(odd), 'Chaque 90 s, 6 fois (9 min)');
  assert.equal(buildPlan(timerConfig({ format: 'emom', every: '60', minutes: '3' }))[1].unit, 'Minute');
  // Compte à rebours : 300 min 59 s → 5 h partout (avant : résumé 300:59, chrono 300:00).
  const cd = timerConfig({ format: 'countdown', minutes: '300', secs: '59' }); assert.deepEqual([cd.seconds, cd.minutes, cd.secs], [18000, 300, 0]);
  assert.equal(buildPlan(cd).at(-1).s, 18000); assert.equal(chronoSummary(cd), 'Compte à rebours de 300:00');
});
ok('chrono après une suspension : les phases écoulées sont faites, la suivante reprend au bon endroit', () => {
  const ph = buildPlan(timerConfig({ format: 'emom', every: '60', minutes: '12' })); // préparation, puis 12 minutes
  const r = catchUp(ph, 1, 60000, 185000); // minute 1 finie à 60 s, retour à 185 s
  assert.equal(r.i, 4, 'quatrième intervalle'); assert.equal(r.start, 180000); assert.equal(r.start + ph[4].s * 1000 - 185000, 55000, 'environ 55 s restantes');
  assert.deepEqual(r.passed.map((x) => [x.label, x.done]), [['Intervalle 2', true], ['Intervalle 3', true]]);
  const end = catchUp(ph, 1, 60000, 1e9); assert.equal(end.i, ph.length, 'fini pendant l’absence'); assert.equal(end.start, 720000, 'à la vraie fin');
  const ft = buildPlan(timerConfig({ format: 'fortime', cap: '20' })), cap = catchUp(ft, 0, 5000, 5000 + 1300000);
  assert.equal(cap.capped, true); assert.equal(cap.passed[0].done, false, 'limite passée : pas « fait »');
  const sw = buildPlan(timerConfig({ format: 'stopwatch' })); assert.equal(catchUp(sw, 0, 5000, 1e9).i, 1, 'le chronomètre ne finit jamais seul');
});
ok('historique du chrono : seuls les efforts faits comptent, un effort passé reste « non fait »', () => {
  const iv = timerConfig({ format: 'intervals', name: 'Suspensions 7 / 3', work: '7', rest: '3', reps: '2', sets: '1' });
  const log = [{ k: 'prep', planned: 5, secs: 0, done: false }, { k: 'work', planned: 7, secs: 7, done: true }, { k: 'rest', planned: 3, secs: 0, done: false }, { k: 'work', planned: 7, secs: 2, done: false }];
  assert.deepEqual(timerExercises(iv, { log })[0].sets, [{ reps: 0, seconds: 7, load: 0, done: true }, { reps: 0, seconds: 2, load: 0, done: false }]);
  assert.equal(timerExercises(iv, { log })[0].group, 'doigts');
  assert.equal(timerResult(iv, { secs: 20, log }), '0:20 · 1 effort sur 2 (1 passé)');
  const skipped = [{ k: 'work', planned: 7, secs: 0, done: false }, { k: 'work', planned: 7, secs: 0, done: false }];
  assert.ok(timerExercises(iv, { log: skipped })[0].sets.every((x) => !x.done && x.seconds === 0), 'tout passé : rien de fait');
  const em = timerConfig({ format: 'emom', every: '60', minutes: '4', text: '10 squats\n8 tractions' }), elog = [true, true, false, true].map((d) => ({ k: 'work', planned: 60, secs: d ? 60 : 12, done: d }));
  assert.deepEqual(timerExercises(em, { log: elog }).map((x) => [x.name, x.sets.map((y) => y.done)]), [['10 squats', [true, false]], ['8 tractions', [true, true]]]);
  assert.equal(timerResult(em, { log: elog }), '3 intervalles sur 4 de 60 s (1 passé)');
  const am = timerConfig({ format: 'amrap', minutes: '10', text: '5 tractions' });
  assert.deepEqual(timerExercises(am, { rounds: 0, log: [{ k: 'work', planned: 600, secs: 30, done: false }] })[0].sets, [{ reps: 0, seconds: 0, load: 0, done: false }]);
  assert.equal(timerExercises(am, { rounds: 3, log: [{ k: 'work', planned: 600, secs: 600, done: true }] })[0].sets.length, 3);
  assert.equal(timerResult(am, { rounds: 2, log: [{ k: 'work', planned: 600, secs: 95, done: false }] }), '2 tours complets en 1:35, arrêté avant la fin');
  assert.equal(timerExercises(timerConfig({ format: 'fortime', cap: '5', text: 'x' }), { capped: true, log: [{ k: 'work', planned: 300, secs: 300, done: false }] })[0].sets[0].done, false);
  assert.deepEqual(timerExercises(iv, { log: [] }), [], 'rien de fait, rien d’enregistré');
});
ok('mes chronos : un chrono gardé se relit à l’identique (bornes comprises) et se résume en une ligne', () => {
  const { cleanItem } = SCHEMA;
  const kept = cleanItem({ c: 'chrono', id: 'tm-1', u: 1, d: { ...timerConfig({ format: 'emom', name: 'Jambes', every: '120', minutes: '20', text: '10 squats\n8 fentes' }), evil: 1 } }).d;
  assert.equal(kept.evil, undefined);
  const again = timerConfig(kept); assert.equal(again.name, 'Jambes'); assert.deepEqual(again.exercises, ['10 squats', '8 fentes']);
  assert.equal(buildPlan(again).filter((p) => p.k === 'work').length, 10);
  assert.equal(chronoSummary(kept), 'Chaque 2 min, pendant 20 min · 2 exercices');
  assert.equal(chronoSummary(timerConfig({ format: 'emom', every: '60', minutes: '12' })), 'Chaque minute, pendant 12 min');
  assert.equal(chronoSummary(timerConfig({ format: 'intervals', work: '20', rest: '10', reps: '8', sets: '1' })), '20 s d’effort / 10 s de pause × 8');
  assert.equal(chronoSummary(timerConfig({ format: 'fortime', cap: '0' })), 'Pour le temps, sans limite');
  assert.equal(chronoSummary(timerConfig({ format: 'countdown', minutes: '1', secs: '30' })), 'Compte à rebours de 1:30');
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
