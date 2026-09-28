// tests/phaseplan.test.mjs — propositions classées par phase (raisons catégorisées), analyse globale et suggestions
// (appliquer / refuser / verrous respectés), sans invention.
import assert from 'node:assert/strict';
import { proposeForPhase, analyzeSession, applySuggestion, phaseTargets, REASON } from '../public/phaseplan.js';
import { normalizePhases, totalMinutes } from '../public/phase.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ctx = { history: [], prefs: {}, goals: [] };
const cats = (items) => new Set(items.flatMap((x) => x.reasons.map((r) => r.cat)));
const PREP_PERF = () => normalizePhases([
  { id: 'b', type: 'climb', kind: 'bloc', minutes: 120, role: 'prep', goal: 'Préparer la voie', intensity: 'hard', priorities: ['endurance_doigts', 'technique_pieds'] },
  { id: 'p', type: 'pause', minutes: 30 },
  { id: 'v', type: 'climb', kind: 'voie', minutes: 120, role: 'perf', intensity: 'max', goal: 'Performer au max' },
]);

ok('phase de préparation avant une performance : les structures douces passent devant, avec « pourquoi »', () => {
  const ph = PREP_PERF(), r = proposeForPhase(ph[0], ctx, { phases: ph, index: 0 });
  assert.ok(r.items.length >= 3); assert.equal(r.items[0].fit, 'Le plus adapté à tes contraintes actuelles');
  assert.ok(!['limit', 'max', 'fourx4'].includes(r.items[0].id), `en tête : ${r.items[0].id}`);
  assert.ok(r.items.some((x) => x.reasons.some((y) => y.cat === 'inference' && /performance/.test(y.text))));
  for (const x of r.items) for (const y of x.reasons) assert.ok(REASON[y.cat], 'catégorie connue');
  assert.ok(r.missing.some((m) => m.cat === 'missing' && /style/.test(m.text)), 'information manquante signalée');
});
ok('phase d’exercices : priorités, matériel, déjà fait, évité, imposé', () => {
  const ph = normalizePhases([{ id: 'm', type: 'main', activity: 'conditioning', minutes: 30, role: 'force', priorities: ['tirage_vertical'], imposed: ['hollow'] }]);
  const eq = new Set(['bar']);
  const r = proposeForPhase(ph[0], { ...ctx, history: [{ startedAt: 1000, data: { exercises: [{ name: 'Tractions pronation' }] } }] }, { phases: ph, index: 0, eq, now: 1000 + 86400000 });
  assert.ok(r.items.length > 0); assert.ok(cats(r.items).has('fact') && cats(r.items).has('rule'));
  const needBar = r.items.filter((x) => x.reasons.some((y) => /barre/i.test(y.text))); assert.ok(needBar.length > 0, 'matériel disponible cité');
  const none = proposeForPhase(normalizePhases([{ type: 'main', activity: 'conditioning', minutes: 20, role: 'main' }])[0], ctx, {});
  assert.ok(none.missing.some((m) => m.cat === 'missing'), 'aucune priorité : information manquante');
});
ok('cibles d’une phase : d’où elles viennent (priorité, intention, objectif, rôle)', () => {
  const t = phaseTargets({ role: 'technique', priorities: ['force_doigts'] }, { intent: { priorities: ['endurance_doigts'] }, goals: [{ label: 'Voie 7a', caps: [{ id: 'endurance_doigts', w: 0.9 }] }] });
  assert.ok(t.targets.force_doigts > t.targets.technique_escalade); assert.equal(t.sources.length, 4);
});
ok('analyse globale : fatigue avant la performance, pause, verrous respectés', () => {
  const ph = PREP_PERF(), s = analyzeSession(ph, ctx, {});
  const ids = s.map((x) => x.id); assert.ok(ids.includes('fatigue-intensity') && ids.includes('fatigue-minutes'), ids.join());
  for (const x of s) assert.ok(x.why.length && x.why.every((w) => REASON[w.cat]));
  const lockd = normalizePhases(ph.map((p) => (p.id === 'b' ? { ...p, locks: { minutes: 'user' } } : p)));
  const blocked = analyzeSession(lockd, ctx, {}).find((x) => x.id === 'fatigue-minutes'); assert.match(blocked.blocked, /verrouillé/);
  assert.equal(applySuggestion(lockd, blocked).applied, false, 'jamais appliquée sur un réglage verrouillé');
});
ok('appliquer une suggestion : le total ne change pas ; refuser = ne rien appliquer', () => {
  const ph = PREP_PERF(), s = analyzeSession(ph, ctx, {}), m = s.find((x) => x.id === 'fatigue-minutes');
  const r = applySuggestion(ph, m); assert.ok(r.applied); assert.equal(r.phases.find((p) => p.id === 'b').minutes, 100); assert.equal(r.phases.find((p) => p.id === 'v').minutes, 140);
  assert.equal(totalMinutes(r.phases), totalMinutes(ph)); assert.equal(ph.find((p) => p.id === 'b').minutes, 120, 'l’original n’est pas modifié');
  const w = normalizePhases([{ id: 'x', type: 'main', minutes: 60, intensity: 'hard' }, { id: 'y', type: 'main', minutes: 30, intensity: 'hard' }]);
  const warm = analyzeSession(w, ctx, {}).find((x) => x.id === 'warmup'); const r2 = applySuggestion(w, warm);
  assert.equal(r2.phases[0].type, 'warmup'); assert.equal(totalMinutes(r2.phases), 90, 'le temps de l’échauffement est pris ailleurs');
});
ok('rien de faux : pas de mur → signalé sans modification automatique ; intention non couverte → suggérée', () => {
  const ph = PREP_PERF(), s = analyzeSession(ph, ctx, { eq: new Set(['bar']), intent: { priorities: ['mobilite_hanches'] } });
  const wall = s.find((x) => x.id === 'no-wall'); assert.equal(wall.patch, null);
  assert.ok(s.some((x) => x.id === 'missing-mobilite_hanches'));
});
console.log(`${n} tests des propositions et de l’analyse OK`);
