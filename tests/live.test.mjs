// tests/live.test.mjs — pendant la séance : ressenti d'une série → série suivante, repos utile, enchaîner par deux,
// journal regroupé, refaire une séance passée (« la dernière », « celle de mardi »), reprise d'une séance interrompue.
import assert from 'node:assert/strict';
import * as L from '../public/live.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const DAY = 86400000;
console.log('Pendant la séance');
ok('ressenti d’une série : facile → on monte, échec → on baisse, sinon on garde', () => {
  const ex = { mode: 'reps' }, t = { mode: 'time' };
  assert.equal(L.nextSetAdvice(ex, { load: 40, reps: 8 }, 1).load, 42.5); assert.equal(L.nextSetAdvice(ex, { load: 100, reps: 5 }, 1).load, 105);
  assert.equal(L.nextSetAdvice(ex, { load: 40, reps: 8 }, 4).load, 38); assert.equal(L.nextSetAdvice(ex, { load: 10, reps: 8 }, 4).load, 9);
  assert.equal(L.nextSetAdvice(ex, { reps: 12 }, 1).reps, 14); assert.equal(L.nextSetAdvice(ex, { reps: 2 }, 4).reps, 1);
  assert.equal(L.nextSetAdvice(t, { secs: 30 }, 1).secs, 35); assert.equal(L.nextSetAdvice(t, { secs: 8 }, 4).secs, 5);
  const keep = L.nextSetAdvice(ex, { load: 40, reps: 8 }, 3); assert.deepEqual([keep.load, keep.reps], [40, 8]); assert.match(keep.text, /sans forcer/);
  assert.match(L.nextSetAdvice(ex, { load: 40 }, 1).text, /42,5 kg/);
});
ok('repos utile : un conseil adapté à l’exercice qui suit', () => {
  assert.match(L.restTip({ name: 'Suspensions', group: 'doigts' }, { k: 0 }), /mains/);
  assert.match(L.restTip({ name: 'Squat', group: 'jambes' }, { k: 0 }), /Marche/);
  assert.match(L.restTip({ name: 'X' }, { minutes: 30, k: 0 }), /eau/);
});
ok('enchaîner par deux : groupes différents alternés série par série, repos seulement après la paire', () => {
  const ex = [{ name: 'Échauffement', block: 'warmup', sets: 1 }, { name: 'Tractions', group: 'tirer', sets: 3, rest: 120 }, { name: 'Pompes', group: 'pousser', sets: 3, rest: 90 }, { name: 'Gainage', group: 'gainage', mode: 'time', sets: 2, rest: 45, block: 'cool' }];
  const s = L.toSupersets(ex); assert.deepEqual(s.map((e) => e.name), ['Échauffement', 'Tractions', 'Pompes', 'Tractions', 'Pompes', 'Tractions', 'Pompes', 'Gainage']);
  assert.deepEqual(s.slice(1, 7).map((e) => e.rest), [0, 120, 0, 120, 0, 120]); assert.ok(s.slice(1, 7).every((e) => e.sets === 1 && e.part === '⚡ Par deux n°1'));
  assert.equal(L.toSupersets([{ name: 'A', group: 'tirer', sets: 3 }, { name: 'B', group: 'tirer', sets: 3 }]).length, 2, 'même groupe : pas de paire');
});
ok('journal : les séries d’un exercice coupé en paires sont regroupées, dans l’ordre, avec les notes', () => {
  const m = L.mergeLog([{ name: 'Tractions', libId: 'pullup', sets: [{ reps: 8 }] }, { name: 'Pompes', sets: [{ reps: 15 }] }, { name: 'Tractions', libId: 'pullup', sets: [{ reps: 7 }], note: 'prise large' }, { name: 'Vide', sets: [] }]);
  assert.deepEqual(m.map((x) => [x.name, x.sets.map((s) => s.reps)]), [['Tractions', [8, 7]], ['Pompes', [15]]]); assert.equal(m[0].note, 'prise large');
});
ok('refaire une séance passée : mêmes exercices, séries faites, dernière charge ; trouver « la dernière », « mardi », « hier »', () => {
  const now = new Date(2026, 9, 2, 18).getTime(); // vendredi
  const h1 = { id: 'a', sessionName: 'Tirage', startedAt: new Date(2026, 8, 29, 18).getTime(), data: { activity: 'strength', exercises: [{ name: 'Tractions', libId: 'pullup', sets: [{ reps: 8, load: 10, done: true }, { reps: 6, load: 10, done: true }, { reps: 0, done: false }] }, { name: 'Gainage', sets: [{ seconds: 45, done: true }] }] } };
  const h2 = { id: 'b', sessionName: 'Jambes', startedAt: new Date(2026, 9, 1, 18).getTime(), data: { exercises: [] } };
  const s = L.sessionFromHistory(h1); assert.equal(s.exercises.length, 2);
  assert.deepEqual([s.exercises[0].sets, s.exercises[0].repsMax, s.exercises[0].load], [2, 6, '10 kg']); assert.equal(s.exercises[1].mode, 'time'); assert.equal(s.exercises[1].secMax, 45);
  assert.equal(L.findHistory([h1, h2], 'refais ma dernière séance', now).id, 'b'); assert.equal(L.findHistory([h1, h2], 'la même que mardi', now).id, 'a');
  assert.equal(L.findHistory([h1, h2], 'celle d’hier', now).id, 'b'); assert.equal(L.findHistory([h1, h2], 'bonjour', now), null);
  assert.equal(L.sessionFromHistory(h1, { id: 'seance1', name: 'Ma séance', exercises: [{ name: 'X' }] }).id, 'seance1', 'séance enregistrée : on la reprend telle quelle');
});
ok('reprise : instantané sans horloge, utilisable 12 h, seulement s’il reste à faire', () => {
  const p = { s: { exercises: [{ name: 'A' }, { name: 'B' }] }, i: 1, set: 0, log: [{ sets: [{}] }, { sets: [] }], startedAt: 1000, pausedMs: 0, phase: 'rest', end: 99999, timer: 5 };
  const snap = L.snapshot(p, 5000); assert.equal(snap.elapsed, 4000); assert.ok(!('end' in snap) && !('timer' in snap));
  assert.equal(L.canResume(snap, 5000 + 3600000), true); assert.equal(L.canResume(snap, 5000 + 13 * 3600000), false);
  assert.equal(L.canResume({ ...snap, i: 2 }, 6000), false); assert.equal(L.snapshot({ ...p, phase: 'done' }), null);
});
console.log(`\n${n} tests de séance en direct OK`);
