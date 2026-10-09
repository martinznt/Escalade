// tests/quickadd.test.mjs — saisie libre d'une séance : un exercice par ligne, nombres compris tout seuls.
import assert from 'node:assert/strict';
const { parseExerciseLine, parseQuickList, exMinutes } = await import('../public/engine.js');
const { normalizeEx } = await import('../public/shared.js');
const { exLine } = await import('../public/ui.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const one = (line) => { const r = parseExerciseLine(line); return r && { name: r.name, ...r.fields }; };

console.log('Saisie libre');
ok('séries × répétitions, avant ou après le nom, avec repos', () => {
  assert.deepEqual(one('3 × 10 squats'), { name: 'Squats', sets: 3, mode: 'reps', repsMin: 10, repsMax: 10 });
  assert.deepEqual(one('Squats 3x10'), { name: 'Squats', sets: 3, mode: 'reps', repsMin: 10, repsMax: 10 });
  assert.deepEqual(one('4 x 8-10 tractions repos 2 min'), { name: 'Tractions', rest: 120, sets: 4, mode: 'reps', repsMin: 8, repsMax: 10 });
  assert.deepEqual(one('- Pompes : 3 séries de 12, récup 1:30'), { name: 'Pompes', rest: 90, sets: 3, mode: 'reps', repsMin: 12, repsMax: 12 });
  assert.deepEqual(one('2. Fentes 3 × 10 par jambe repos 60'), { name: 'Fentes', rest: 60, perSide: true, sets: 3, mode: 'reps', repsMin: 10, repsMax: 10 });
});
ok('durées, heures, distances et charges', () => {
  assert.deepEqual(one('Gainage 3 × 30 s'), { name: 'Gainage', sets: 3, mode: 'time', secMin: 30, secMax: 30 });
  assert.deepEqual(one('5 min de corde à sauter'), { name: 'Corde à sauter', sets: 1, mode: 'time', secMin: 300, secMax: 300 });
  assert.deepEqual(one('Grimpe libre 1 h 30'), { name: 'Grimpe libre', sets: 1, mode: 'time', secMin: 5400, secMax: 5400 });
  // Heures décimales et en toutes lettres : « 1,5 h » = 90 min (avant : « 5 h » lu au milieu du nombre, 300 min et « 1, » dans le nom).
  for (const [line, name, sec] of [['Footing 1,5 h', 'Footing', 5400], ['Footing 1.5 h', 'Footing', 5400], ['Vélo 2,25 h', 'Vélo', 8100], ['Rando 2 heures', 'Rando', 7200], ['Vélo 1 heure 15', 'Vélo', 4500], ['Bike 2 hours', 'Bike', 7200], ['Course 1h05', 'Course', 3900], ['Footing 90 min', 'Footing', 5400]])
    assert.deepEqual(one(line), { name, sets: 1, mode: 'time', secMin: sec, secMax: sec }, line);
  assert.deepEqual(one('Planche 1 min 30'), { name: 'Planche', sets: 1, mode: 'time', secMin: 90, secMax: 90 });
  assert.deepEqual(one('6 × 400 m repos 1:30'), { name: '400 m', rest: 90, sets: 6, mode: 'reps', repsMin: 400, repsMax: 400, unit: 'm' });
  assert.deepEqual(one('Footing 5 km'), { name: 'Footing', sets: 1, mode: 'reps', repsMin: 5, repsMax: 5, unit: 'km' });
  assert.deepEqual(one('Crawl 1500 m'), { name: 'Crawl', sets: 1, mode: 'reps', repsMin: 1.5, repsMax: 1.5, unit: 'km' });
  assert.deepEqual(one('Squat 5 × 5 à 60 kg'), { name: 'Squat', load: '60 kg', sets: 5, mode: 'reps', repsMin: 5, repsMax: 5 });
  assert.deepEqual(one('Tractions lestées +10 kg 4 × 5'), { name: 'Tractions lestées', load: '+10 kg', sets: 4, mode: 'reps', repsMin: 5, repsMax: 5 });
  assert.deepEqual(one('20 pompes'), { name: 'Pompes', sets: 1, mode: 'reps', repsMin: 20, repsMax: 20 });
});
ok('rien de compris : la ligne reste le nom, sans rien inventer ; les titres ouvrent une partie', () => {
  assert.deepEqual(one('Étirements doux'), { name: 'Étirements doux' });
  assert.equal(parseExerciseLine('   '), null);
  assert.deepEqual(parseExerciseLine('Échauffement :'), { heading: 'Échauffement' });
  assert.deepEqual(parseExerciseLine('## Circuit A'), { heading: 'Circuit A' });
  assert.equal(parseExerciseLine('Pompes : 3 × 10').heading, undefined, 'un exercice avec des nombres n’est pas un titre');
});
ok('liste complète : parties, catalogue reconnu (explications reprises), nombres de la personne gardés', () => {
  const { exercises, parts } = parseQuickList('Échauffement :\n5 min corde à sauter\n\nCircuit A :\n4 × 8 tractions repos 2 min\nGainage 3 × 30 s\nRetour au calme :\nÉtirements doux');
  assert.equal(parts, 3);
  assert.deepEqual(exercises.map((e) => [e.name, e.block, e.part]), [['Corde à sauter', 'warmup', ''], ['Tractions', 'main', 'Circuit A'], ['Gainage', 'main', 'Circuit A'], ['Étirements doux', 'cool', '']]);
  const tr = exercises[1]; assert.equal(tr.sets, 4); assert.equal(tr.repsMin, 8); assert.equal(tr.rest, 120);
  assert.ok(tr.libId, 'tractions reconnues dans le catalogue'); assert.ok(tr.ok.length > 0, 'consignes du catalogue reprises');
  const free = exercises[3]; assert.equal(free.sets, 1); assert.equal(free.repsMin, 1); assert.equal(free.rest, 0, 'pas de repos inventé');
  assert.equal(parseQuickList('3 × 10 squats').exercises[0].rest > 0, true, 'plusieurs séries : un repos est prévu (modifiable)');
  assert.equal(parseQuickList('x\n'.repeat(100)).exercises.length, 60, '60 exercices au plus');
  const lib = (t) => parseQuickList(t).exercises[0].libId;
  assert.equal(lib('Squats'), 'squat-bw'); assert.equal(lib('Squat 5 × 5 à 60 kg'), '', 'une charge écrite : pas de squat au poids du corps');
  assert.equal(lib('Fentes'), '', 'pas de « Fentes bulgares » à la place'); assert.equal(lib('Crawl'), '', 'pas de « Crawl poings fermés » à la place');
  assert.equal(lib('Gainage bateau'), 'hollow-hold'); assert.equal(lib('corde à sauter'), 'jump-rope'); assert.equal(lib('Pompes'), 'pushup');
  const t = parseQuickList('Tractions').exercises[0]; assert.equal(t.libId, 'pullup'); assert.ok(t.sets > 1 && t.rest > 0, 'sans nombre : la dose conseillée du catalogue');
});
ok('affichage : « 5 min », « 1,5 km », « 6 longueurs de 25 m », « 1 fois »', () => {
  const show = (t) => exLine(parseQuickList(t).exercises[0]);
  assert.equal(show('5 min de corde à sauter'), '5 min'); assert.equal(show('Crawl 1500 m'), '1,5 km'); assert.equal(show('Étirements doux'), '1 fois');
  assert.equal(show('6 × 400 m repos 1:30'), '6 × 400 m · repos 1 min 30'); assert.equal(show('Squat 5 × 5 à 60 kg'), '5 × 5 · repos 1 min · 60 kg');
  assert.equal(exLine(normalizeEx({ sets: 6, repsMin: 1, repsMax: 1, unit: 'longueurs de 25 m', rest: 20 })), '6 longueurs de 25 m · repos 20 s');
  assert.equal(exLine(normalizeEx({ sets: 1, repsMin: 1, repsMax: 1, unit: 'longueurs de 25 m', rest: 0 })), '1 longueur de 25 m');
  assert.equal(exLine(normalizeEx({ sets: 3, repsMin: 8, repsMax: 12, rest: 90 })), '3 × 8–12 · repos 1 min 30', 'format habituel inchangé');
  assert.equal(exLine(normalizeEx({ sets: 6, repsMin: 1, repsMax: 1, unit: '25 m', rest: 20 })), '6 × 25 m · repos 20 s', 'pas de « 6 × 1 25 m »');
});

ok('durée estimée juste pour les distances, unité longue gardée en entier', () => {
  const run = normalizeEx({ name: '400 m', sets: 6, mode: 'reps', repsMin: 400, repsMax: 400, unit: 'm', rest: 90 });
  assert.ok(exMinutes(run) > 15 && exMinutes(run) < 25, `6 × 400 m ≈ 20 min (${exMinutes(run).toFixed(1)})`);
  const swim = normalizeEx({ name: 'Crawl', sets: 1, mode: 'reps', repsMin: 1, repsMax: 1, unit: 'km', acts: ['swimming'], rest: 0 });
  assert.ok(exMinutes(swim) > 15 && exMinutes(swim) < 25, `1 km de nage ≈ 20 min (${exMinutes(swim).toFixed(1)})`);
  assert.equal(normalizeEx({ unit: 'longueurs de 25 m' }).unit, 'longueurs de 25 m');
  assert.equal(normalizeEx({ mode: 'time', secMin: 3 * 3600 }).secMin, 3 * 3600, 'jusqu’à 5 h');
});
console.log(`\n${n} tests de saisie libre OK`);
