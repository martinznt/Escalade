// tests/gym.test.mjs — « Ma salle de sport » : séance du jour faite avec le matériel de la salle, machines d'abord,
// jour suivant du découpage, charges reprises de l'historique, carnet des machines, nouvelles machines décrites.
import assert from 'node:assert/strict';
import * as G from '../public/gym.js';
import { byId, LIBRARY } from '../public/library.js';
import { EQUIPMENT, MACHINES } from '../public/model.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
console.log('Ma salle de sport');
const eqOf = (k) => new Set(G.GYM_PRESETS[k][1]);
const mains = (s) => s.exercises.filter((e) => e.block === 'main');
ok('chaque machine des zones est connue et a au moins un exercice', () => {
  for (const [, keys] of G.GYM_ZONES) for (const k of keys) assert.ok(EQUIPMENT[k], k);
  for (const m of MACHINES) assert.ok(LIBRARY.some((x) => (x.needs || []).includes(m)), `aucun exercice pour ${m}`);
});
ok('séance : uniquement le matériel de la salle, pas de doublon, échauffement et retour au calme', () => {
  for (const preset of ['petite', 'classique', 'complete']) for (const day of ['full', 'haut', 'bas', 'push', 'pull', 'legs', 'pecs', 'dos', 'bras']) {
    const eq = eqOf(preset), s = G.buildGymSession({ day, equipment: eq, minutes: 60, level: 1 });
    const m = mains(s); assert.ok(m.length >= 3, `${preset}/${day}`);
    for (const e of m) assert.ok((byId(e.libId).needs || []).every((k) => eq.has(k)), `${preset}/${day} : ${e.libId}`);
    assert.equal(new Set(m.map((e) => e.libId)).size, m.length);
    assert.equal(s.exercises[0].block, 'warmup'); assert.equal(s.exercises.at(-1).block, 'cool'); assert.deepEqual(s.tags, [`salle-${day}`]);
  }
});
ok('machines d’abord : un débutant reçoit surtout des machines ; la durée limite le nombre d’exercices', () => {
  const s = G.buildGymSession({ day: 'push', equipment: eqOf('classique'), level: 0, machinesFirst: true, minutes: 45 });
  const m = mains(s); assert.ok(m.filter((e) => G.isMachine(byId(e.libId))).length >= m.length - 1, m.map((e) => e.libId).join());
  assert.ok(mains(G.buildGymSession({ day: 'full', equipment: eqOf('complete'), minutes: 30 })).length <= 4);
});
ok('but : force = peu de répétitions et longs repos, tonification = beaucoup de répétitions', () => {
  const f = mains(G.buildGymSession({ day: 'legs', equipment: eqOf('classique'), goal: 'force', level: 2 }))[0], t = mains(G.buildGymSession({ day: 'legs', equipment: eqOf('classique'), goal: 'tonus' }))[0];
  assert.ok(f.repsMax <= 6 && f.rest >= 120); assert.ok(t.repsMin >= 12 && t.rest <= 60);
});
ok('trop technique pour le niveau : jamais proposé', () => {
  for (const day of ['bas', 'pull', 'legs']) for (const e of mains(G.buildGymSession({ day, equipment: eqOf('complete'), level: 0 }))) assert.ok((byId(e.libId).diff || 1) <= 2, e.libId);
});
ok('remplacer (machine occupée) : l’exercice exclu disparaît, un autre prend sa place', () => {
  const a = mains(G.buildGymSession({ day: 'push', equipment: eqOf('classique') }))[0];
  const b = mains(G.buildGymSession({ day: 'push', equipment: eqOf('classique'), exclude: [a.libId] }));
  assert.ok(!b.some((e) => e.libId === a.libId)); assert.ok(b.length >= 3);
});
const t0 = Date.UTC(2026, 9, 1);
const H = (days, gymDay, ex) => ({ startedAt: t0 - days * 864e5, sessionName: 'Salle', data: { gymDay, exercises: ex } });
ok('jour suivant du découpage, d’après la dernière séance de salle', () => {
  assert.equal(G.nextDay([], 'ppl'), 'push');
  assert.equal(G.nextDay([H(2, 'push', []), H(1, 'pull', [])], 'ppl'), 'legs');
  assert.equal(G.nextDay([H(1, 'legs', [])], 'ppl'), 'push'); assert.equal(G.nextDay([H(1, 'haut', [])], 'ul'), 'bas');
});
ok('charges : la séance reprend la dernière charge, le carnet donne dernière, meilleure, max estimé et réglage', () => {
  const sets = (load, reps) => [{ reps, load, done: true }, { reps, load, done: true }, { reps, load, done: true }];
  const hist = [H(4, 'push', [{ name: 'Développé couché à la machine', libId: 'chest-press-machine', sets: sets(40, 12) }]), H(1, 'push', [{ name: 'Développé couché à la machine', libId: 'chest-press-machine', sets: sets(40, 12) }])];
  const s = G.buildGymSession({ day: 'push', equipment: eqOf('classique'), machinesFirst: true, history: hist });
  const e = mains(s).find((x) => x.libId === 'chest-press-machine'); assert.ok(e, 'exercice déjà fait gardé'); assert.match(e.note, /Dernière fois : 40 kg/); assert.match(e.load, /kg/);
  const b = G.machineBook(hist, [{ key: 'chest-press-machine', setup: 'Siège 4' }])[0];
  assert.equal(b.last.load, 40); assert.equal(b.best, 40); assert.ok(b.rm > 40); assert.equal(b.setup, 'Siège 4'); assert.equal(b.sessions, 2); assert.ok(b.machine);
});
console.log(`\n${n} tests de la salle de sport OK`);
