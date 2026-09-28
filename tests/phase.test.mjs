// tests/phase.test.mjs — modèle de phase : anciennes parties compatibles, multi-activités, pause, verrous,
// somme exacte des durées, modification d'une phase sans casser les autres, intention ponctuelle ≠ objectif.
import assert from 'node:assert/strict';
import { normalizePhase, normalizePhases, fitDurations, updatePhase, newPhase, sessionActivities, totalMinutes, sessionIntent, ROLES } from '../public/phase.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

ok('ancienne partie sans nouveaux champs : défauts déterministes, champs du constructeur gardés', () => {
  const old = { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40, styles: ['st-devers'], structure: 'max', adapt: true };
  const a = normalizePhase(old, 2), b = normalizePhase(old, 2);
  assert.deepEqual(a, b, 'déterministe');
  assert.equal(a.id, 'ph-3'); assert.equal(a.activity, 'climbing_route'); assert.equal(a.role, 'perf');
  assert.equal(a.structure, 'max'); assert.equal(a.adapt, true); assert.deepEqual(a.styles, ['st-devers']);
  assert.equal(a.attemptType, 'perf'); assert.equal(a.locks.minutes, 'free'); assert.equal(a.locks.exercises, 'app');
  assert.equal(normalizePhase({ type: 'warmup', minutes: 10 }, 0, 'running').activity, 'running');
});
ok('séance multi-activités : 2 h bloc, 30 min pause, 2 h voie', () => {
  const ph = normalizePhases([{ type: 'climb', kind: 'bloc', minutes: 120, role: 'prep', goal: 'Préparer la voie' }, newPhase('pause', { minutes: 30 }), { type: 'climb', kind: 'voie', minutes: 120, role: 'perf', intensity: 'max' }]);
  assert.deepEqual(sessionActivities(ph), ['climbing_boulder', 'climbing_route']);
  assert.equal(ph[1].activity, 'pause'); assert.equal(ph[1].role, 'pause'); assert.equal(totalMinutes(ph), 270);
  assert.equal(ph[0].goal, 'Préparer la voie');
  assert.equal(new Set(ph.map((p) => p.id)).size, 3, 'identifiants uniques');
});
ok('durées : la somme fait exactement le total ; une durée verrouillée ne bouge pas', () => {
  const ph = normalizePhases([{ type: 'warmup', minutes: 15 }, { type: 'climb', minutes: 120, locks: { minutes: 'user' } }, { type: 'main', minutes: 33 }, { type: 'cool', minutes: 10 }]);
  for (const T of [150, 181, 240, 200]) {
    const r = fitDurations(ph, T); assert.ok(r.ok, `total ${T}`); assert.equal(totalMinutes(r.phases), T);
    assert.equal(r.phases[1].minutes, 120, 'verrouillée'); assert.ok(r.phases.every((p) => p.minutes >= 5));
  }
  const bad = fitDurations(ph, 125); assert.equal(bad.ok, false); assert.match(bad.error, /verrouillées/);
});
ok('modifier une phase ne casse pas les autres ; ses verrous sont gardés', () => {
  const ph = normalizePhases([{ id: 'a', type: 'climb', kind: 'bloc', minutes: 60, locks: { minutes: 'user' } }, { id: 'b', type: 'cool', minutes: 10 }]);
  const up = updatePhase(ph, 'a', { goal: 'Travailler le placement', priorities: ['technique_pieds', 'inconnu'] });
  assert.equal(up[0].goal, 'Travailler le placement'); assert.deepEqual(up[0].priorities, ['technique_pieds'], 'capacité inconnue ignorée');
  assert.equal(up[0].locks.minutes, 'user'); assert.equal(up[0].minutes, 60); assert.deepEqual(up[1], ph[1]);
});
ok('paramètres escalade structurés : styles voulus/exclus sans conflit, essais, type d’essai', () => {
  const p = normalizePhase({ type: 'climb', kind: 'voie', styles: ['st-devers'], stylesOut: ['st-devers', 'st-dalle'], attemptsMax: '4', attemptType: 'limit', focus: 'resist', volume: 'x' });
  assert.deepEqual(p.stylesOut, ['st-dalle'], 'un style ne peut pas être voulu et exclu'); assert.equal(p.attemptsMax, 4);
  assert.equal(p.attemptType, 'limit'); assert.equal(p.focus, 'resist'); assert.equal(p.volume, 'mod', 'valeur inconnue → défaut');
});
ok('rôles structurés ; rôle personnalisé nommé ; valeurs dangereuses nettoyées', () => {
  assert.ok(ROLES.perf && ROLES.pause && ROLES.custom);
  const p = normalizePhase({ type: 'main', role: 'custom', roleLabel: '<b>Gainage</b>', goal: 'x'.repeat(500), imposed: ['ok-id', 'pas bien !'] });
  assert.equal(p.roleLabel, 'b Gainage /b'); assert.equal(p.goal.length, 200); assert.deepEqual(p.imposed, ['ok-id']);
});
ok('intention ponctuelle de séance : structurée, et pas un objectif du compte', () => {
  const i = sessionIntent({ text: 'Aujourd’hui je veux performer en voie', priorities: ['endurance_doigts', 'x'] });
  assert.deepEqual(i, { text: 'Aujourd’hui je veux performer en voie', priorities: ['endurance_doigts'], savedAsGoal: '' });
});
console.log(`${n} tests du modèle de phase OK`);
