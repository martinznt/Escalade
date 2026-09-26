// tests/brain.test.mjs — analyses du « Training Brain » : faits vs inférences, aucune valeur inventée.
import assert from 'node:assert/strict';
import * as B from '../public/brain.js';
import { NOW, it, perf, env, act, entry, ctxOf } from './fixtures.mjs';
import { systemFromTemplate } from '../public/grading.js';
const { DAY } = B;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('Contexte');
ok('les séances datées dans le futur ne sont jamais comptées comme réalisées', () => {
  const c = ctxOf({ history: [entry(1, ['Pompes']), entry(-3, ['Pompes'])] });
  assert.equal(c.history.length, 1); assert.equal(c.future.length, 1);
});
ok('les items supprimés sont ignorés', () => {
  const c = ctxOf({ items: [{ c: 'goal', id: 'g1', d: { label: 'X' }, u: NOW, del: true }] });
  assert.equal(c.goals.length, 0);
});

console.log('État des capacités');
ok('aucune donnée : niveau inconnu, rien d’inventé, donnée manquante signalée', () => {
  const s = B.capacityState('tirage_vertical', ctxOf());
  assert.equal(s.level, null); assert.equal(s.status, 'inconnu'); assert.ok(s.missing.length); assert.equal(s.confidence, 0);
});
ok('niveau déclaré pris en compte comme « déclaré »', () => {
  const s = B.capacityState('tirage_vertical', ctxOf({ items: [it('capdecl', { capId: 'tirage_vertical', level: 2 })] }));
  assert.equal(s.level, 2); assert.equal(s.evidences[0].type, 'déclaré');
});
ok('« je ne sais pas » est signalé comme manquant, pas converti en niveau', () => {
  const s = B.capacityState('tirage_vertical', ctxOf({ items: [it('capdecl', { capId: 'tirage_vertical', level: -1 })] }));
  assert.equal(s.level, null); assert.ok(s.missing.some((m) => /je ne sais pas/.test(m)));
});
ok('performance mesurée comparée aux repères indicatifs (15 tractions → avancé)', () => {
  const s = B.capacityState('tirage_vertical', ctxOf({ items: [perf('max_tractions', 15)] }));
  assert.equal(s.level, 2); assert.ok(s.evidences.some((e) => e.type === 'mesuré'));
});
ok('une performance ancienne pèse moins qu’une récente', () => {
  const recent = B.capacityState('tirage_vertical', ctxOf({ items: [perf('max_tractions', 15, 10)] }));
  const old = B.capacityState('tirage_vertical', ctxOf({ items: [perf('max_tractions', 15, 500)] }));
  assert.ok(old.confidence < recent.confidence);
});
ok('maximum dans un système sans correspondance : non converti, signalé', () => {
  const sys = systemFromTemplate('couleurs', { name: 'Ma salle' });
  const lv = sys.levels[2];
  const c = ctxOf({ items: [it('gradesys', sys, sys.id), perf('max_bloc', null, 5, { grade: { systemId: sys.id, systemName: 'Ma salle', levelId: lv.id, label: lv.label, order: 2, total: sys.levels.length } })] });
  const s = B.capacityState('force_doigts', c);
  assert.ok(s.missing.some((m) => /correspondance/.test(m)));
});
ok('forces / axes : comparaison à soi-même, jamais avec moins de 2 capacités connues', () => {
  const one = B.strengthsWeaknesses([{ level: 2 }, { level: null }]);
  assert.equal(one.strengths.length, 0);
  const sw = B.strengthsWeaknesses([{ capId: 'a', level: 2 }, { capId: 'b', level: 0 }, { capId: 'c', level: 1 }]);
  assert.equal(sw.strengths[0].capId, 'a'); assert.equal(sw.weaknesses[0].capId, 'b'); assert.match(sw.text, /tes propres capacités/);
});

console.log('Objectifs');
ok('objectif métrique : avancement calculé depuis la meilleure valeur réelle', () => {
  const g = { type: 'metric', metricId: 'max_tractions', target: 12 };
  const c = ctxOf({ items: [perf('max_tractions', 9, 3), perf('max_tractions', 6, 30)] });
  assert.equal(B.goalProgress(g, c).pct, 75);
  assert.equal(B.goalProgress(g, ctxOf()).pct, null);
});
ok('objectif figure : ce qui bloque, avec mesures manquantes et note prudente', () => {
  const g = { id: 'g', type: 'skill', skillId: 'front_lever' };
  const r = B.blockers(g, ctxOf({ items: [perf('max_tractions', 4)] }));
  assert.ok(r.all.length >= 3); assert.ok(r.missing.some((m) => /pas de mesure/.test(m))); assert.match(r.note, /sans garantir/);
  const lim = r.limiting.map((x) => x.limit); assert.deepEqual(lim, [...lim].sort((a, b) => b - a));
});
ok('plusieurs chemins non classés, compatibilité matériel expliquée', () => {
  const paths = B.goalPaths({ type: 'skill', skillId: 'front_lever' }, ctxOf({ items: [env('Maison', ['mat'])] }));
  assert.ok(paths.length >= 3);
  assert.equal(paths.find((p) => p.id === 'sol').compatible, true);
  assert.equal(paths.find((p) => p.id === 'barre').compatible, false);
});
ok('objectif oublié détecté après 14 jours sans travail des capacités', () => {
  const c = ctxOf({ items: [it('goal', { type: 'skill', skillId: 'front_lever', status: 'active', startedAt: NOW - 60 * DAY })], history: [entry(20, ['Tractions'])] });
  assert.equal(B.forgottenGoals(c).length, 1);
});
ok('rappel de test : métrique d’objectif jamais mesurée', () => {
  const c = ctxOf({ items: [it('goal', { type: 'metric', metricId: 'max_tractions', target: 12, status: 'active' })] });
  assert.ok(B.testReminders(c).some((r) => r.metricId === 'max_tractions'));
});

console.log('Historique');
const weekly = Array.from({ length: 10 }, (_, i) => entry(i * 7 + 1, ['Pompes', 'Squats']));
ok('régularité : moyenne hebdomadaire et interruption détectée', () => {
  const r = B.regularity(ctxOf({ history: [...weekly.slice(0, 3), ...weekly.slice(6)] }));
  assert.ok(r.mean > 0); assert.ok(r.gaps.some((g) => g.days >= 20));
});
ok('comparaisons 7/30/90 jours avec la période précédente uniquement', () => {
  const c = ctxOf({ history: weekly });
  for (const d of [7, 30, 90]) { const b = B.benchmarks(c, d); assert.equal(b.days, d); assert.match(b.text, /ton propre historique/); }
  assert.equal(B.benchmarks(c, 30).cur.sessions, 5);
});
ok('charge : descriptive, avec avertissement non médical', () => {
  const c = ctxOf({ history: [entry(0.2, ['Pompes'], { rpe: 5, min: 90 }), entry(0.6, ['Pompes'], { rpe: 5, min: 90 }), entry(1, ['Pompes'], { rpe: 5, min: 90 }), ...weekly.slice(2)] });
  const l = B.loadAnalysis(c);
  assert.ok(l.signals.length >= 2); assert.match(l.disclaimer, /pas un diagnostic médical/);
});
ok('sous-entraînement : pas de conclusion sans assez de données', () => {
  assert.equal(B.undertrained(ctxOf({ items: [act('strength')] })).enough, false);
});
ok('préférences apprises : suggestion seulement, jamais appliquée automatiquement', () => {
  const h = [1, 2, 3].map((d) => entry(d, ['Squats'], { data: { swaps: [{ from: 'Fentes', to: 'Squats' }] } }));
  const c = ctxOf({ history: h });
  const p = B.learnedPreferences(c).find((x) => x.name === 'Fentes');
  assert.equal(p.suggestion, 'evite'); assert.equal(c.prefs[p.key], undefined);
  assert.ok(B.habits(c).some((x) => x.proposal?.value === 'evite'));
});
ok('habitude déjà refusée : la question n’est plus reposée', () => {
  const h = [1, 2, 3].map((d) => entry(d, ['Squats'], { data: { swaps: [{ from: 'Fentes', to: 'Squats' }] } }));
  const c = ctxOf({ history: h, items: [it('habit', { key: 'swap:fentes', decision: 'dismissed' })] });
  assert.ok(!B.habits(c).some((x) => x.key === 'swap:fentes'));
});
ok('records et timeline : nouveau record détecté, futur exclu', () => {
  const c = ctxOf({ items: [perf('max_tractions', 8, 40), perf('max_tractions', 11, 5)], history: [entry(-2, ['Pompes'])] });
  assert.ok(B.timeline(c).some((e) => e.kind === 'record' && /11/.test(e.text)));
  assert.ok(B.records(c).some((r) => r.metricId === 'max_tractions' && /11/.test(r.text)));
});
ok('journal : uniquement des données existantes', () => {
  const c = ctxOf({ history: [entry(1, ['Pompes'], { data: { note: 'bonne séance' } })], items: [it('jnote', { date: NOW - DAY, text: 'fatigué' })] });
  const j = B.journal(c);
  assert.equal(j.length, 2); assert.ok(j.some((x) => x.note === 'bonne séance'));
});
ok('séance atypique : durée inhabituelle signalée', () => {
  const c = ctxOf({ history: [entry(0.5, ['Pompes'], { min: 150 }), ...weekly] });
  assert.ok(B.atypicalSessions(c).some((a) => /durée/.test(a.text)));
});
ok('« pourquoi je ne progresse pas » : hypothèses, jamais une certitude', () => {
  const r = B.whyNoProgress({ type: 'metric', metricId: 'max_tractions', caps: [] }, ctxOf());
  assert.ok(r.hypotheses.length); assert.match(r.note, /ni des certitudes/);
});
ok('« et si » : simulation de volume, pas de prédiction', () => {
  const r = B.whatIf('tirage_vertical', 3, ctxOf());
  assert.equal(r.planned.setsPerWeek, 30); assert.match(r.disclaimer, /ne prédit pas/);
});
ok('jamais essayé : exclut le déjà fait, l’évité et le matériel absent', () => {
  const c = ctxOf({ items: [act('conditioning'), env('Maison', ['mat'])] });
  const list = B.neverTried(c, { activityId: 'conditioning' });
  assert.ok(list.length > 0);
  for (const x of list) assert.ok(x.lib.needs.every((k) => k === 'mat'));
});
ok('que faire aujourd’hui : plusieurs options dont repos si séance très récente', () => {
  const o = B.todayOptions(ctxOf({ history: [entry(0.3, ['Pompes'])] }));
  assert.ok(o.options.length >= 2); assert.ok(o.options.some((x) => x.kind === 'rest'));
});
ok('comprendre mon profil : sources séparées, rien d’inféré sans données', () => {
  const u = B.understandProfile(ctxOf());
  assert.equal(u.inferred.length, 0); assert.equal(u.measured.length, 0); assert.ok(u.missing.length); assert.ok(u.method.length >= 4);
  const u2 = B.understandProfile(ctxOf({ items: [perf('max_tractions', 10), act('strength')] }));
  assert.equal(u2.measured.length, 1); assert.ok(u2.inferred.length >= 1);
});
ok('graphe dans les deux sens : capacité → exercices / figures, exercice → capacités', () => {
  const g = B.graphFromCap('tirage_vertical', ctxOf());
  assert.ok(g.exercises.length && g.metrics.length && g.goals.some((x) => x.skill));
  const lib = g.exercises[0];
  assert.ok(B.graphFromExercise({ ...lib, caps: { tirage_vertical: 1 }, prim: [], sec: [] }, ctxOf()).caps[0].goals.length);
});
ok('mode Lab : comparaison avant / après avec avertissement de causalité', () => {
  const r = B.labReport({ title: 'x', startDate: '2026-05-01', weeks: 4, before: { value: 8 }, after: { value: 10 }, metricId: 'max_tractions' }, ctxOf());
  assert.equal(r.diff, 2); assert.match(r.disclaimer, /causalité/);
});

ok('anciennes entrées d’historique (séries en nombre, champs manquants) : aucune analyse ne plante', () => {
  const odd = [
    { id: 'o1', sessionName: 'Vieille', startedAt: NOW - 2 * DAY, durationSeconds: 1800, data: { rpe: 3, exercises: [{ name: 'Tractions', sets: 12 }, { name: 'Pompes', sets: '3' }, null, { name: 'Gainage' }] } },
    { id: 'o2', sessionName: 'Autre', startedAt: NOW - 3 * DAY, durationSeconds: 600, data: { exercises: 12, swaps: 3, questionnaire: { likes: 2, felt: 'x' } } },
    { id: 'o3', sessionName: 'Sans données', startedAt: NOW - 4 * DAY },
  ];
  const c = ctxOf({ history: odd, items: [act('strength'), it('goal', { type: 'custom', label: '20 tractions', target: 20, current: 12, status: 'active' })] });
  for (const f of ['records', 'timeline', 'journal', 'achievements', 'loadAnalysis', 'regularity', 'undertrained', 'forgottenGoals', 'testReminders', 'learnedPreferences', 'habits', 'diagnostics', 'understandProfile', 'trainingMap', 'neverTried', 'todayOptions', 'atypicalSessions']) B[f](c);
  B.benchmarks(c, 7); B.periodSummary(c, 'week'); B.muscleVolume(c, 30);
  const t = c.history.find((h) => h.id === 'o1').data.exercises.find((e) => e.name === 'Tractions');
  assert.equal(t.sets.length, 12); assert.equal(t.sets[0].reps, 0, 'aucune répétition inventée');
});

console.log(`\n${n} tests d’analyse OK`);
