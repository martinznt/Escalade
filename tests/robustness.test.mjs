// tests/robustness.test.mjs — données anciennes ou abîmées : chaque champ est remplacé tour à tour par un nombre,
// une chaîne, null ou un objet vide ; aucune analyse de l'accueil, des progrès ou des objectifs ne doit planter.
import assert from 'node:assert/strict';
const B = await import('../public/brain.js');
const DAY = 86400000, NOW = Date.now();
const base = () => ({
  items: [
    { c: 'activity', id: 'a1', u: 1, d: { preset: 'climbing_boulder', label: 'Bloc', aliases: ['x'] } },
    { c: 'activity', id: 'a2', u: 1, d: { preset: 'strength', label: 'Muscu' } },
    { c: 'env', id: 'e1', u: 1, d: { name: 'Maison', type: 'maison', equipment: ['bar', 'mat'], isDefault: true } },
    { c: 'perf', id: 'p1', u: 1, d: { metricId: 'max_tractions', value: 10, date: NOW - 5 * DAY, source: 'measured', styles: ['st-devers'] } },
    { c: 'perf', id: 'p2', u: 1, d: { metricId: 'max_bloc', grade: { systemId: 'font', systemName: 'Font', levelId: 'f6b', label: '6B', order: 7, total: 20 }, date: NOW - 5 * DAY, source: 'declared', styles: ['st-devers'] } },
    { c: 'goal', id: 'g1', u: 1, d: { type: 'skill', skillId: 'front_lever', status: 'active', startedAt: NOW - 30 * DAY } },
    { c: 'goal', id: 'g2', u: 1, d: { type: 'custom', label: 'X', target: 20, current: 12, caps: [{ id: 'tirage_vertical', w: 1 }], status: 'active' } },
    { c: 'goal', id: 'g3', u: 1, d: { type: 'metric', metricId: 'max_tractions', target: 12, status: 'active' } },
    { c: 'category', id: 'c1', u: 1, d: { activityId: 'a9', label: 'Cat', caps: [{ id: 'force_jambes', w: 1 }] } },
    { c: 'metric', id: 'm1', u: 1, d: { label: 'Custom', unit: 'x', kind: 'other', caps: [{ id: 'force_jambes', w: 0.8 }] } },
    { c: 'ascent', id: 'as1', u: 1, d: { kind: 'bloc', result: 'send', date: NOW - DAY, styles: ['st-devers'] } },
    { c: 'config', id: 'main', u: 1, d: { durations: ['30'], envId: 'e1' } },
    { c: 'config', id: 'equipment', u: 1, d: { unavailable: ['bar'] } },
    { c: 'config', id: 'dashboard', u: 1, d: { blocks: ['today'] } },
    { c: 'pref', id: 'pr', u: 1, d: { key: 'pompes', value: 'aime' } },
    { c: 'capdecl', id: 'cd', u: 1, d: { capId: 'tirage_vertical', level: 1 } },
    { c: 'lab', id: 'l', u: 1, d: { title: 'L', startDate: '2026-01-01', weeks: 4 } },
    { c: 'jnote', id: 'j', u: 1, d: { date: NOW - DAY, text: 't' } },
    { c: 'swap', id: 's', u: 1, d: { from: 'Pompes', to: 'Dips' } },
    { c: 'habit', id: 'hb', u: 1, d: { key: 'k', decision: 'dismissed' } },
    { c: 'gradesys', id: 'gs', u: 1, d: { name: 'Salle', activity: 'bloc', kind: 'colors', levels: [{ id: 'l1', label: 'Jaune', order: 0 }], maps: [{ levelId: 'l1', ref: 'font', refLevel: '5' }] } },
    { c: 'style', id: 'st', u: 1, d: { label: 'Toit' } },
  ],
  history: Array.from({ length: 8 }, (_, i) => ({ id: 'h' + i, sessionId: 'se1', sessionName: 'S', startedAt: NOW - (i * 3 + 1) * DAY, durationSeconds: 2400,
    data: { rpe: 4, activity: 'strength', note: 'n', context: { envName: 'Maison', equipment: ['bar'], goalId: 'g1' }, questionnaire: { felt: ['biceps'], hardest: 'Pompes', likes: [{ name: 'Pompes', value: 'aime' }], answers: [{ q: 'doigts', a: 'ok' }] }, swaps: [{ from: 'Pompes', to: 'Dips' }],
      exercises: [{ name: 'Tractions', libId: 'pullup', caps: { tirage_vertical: 1 }, prim: ['grand_dorsal'], sec: ['biceps'], muscles: ['dos'], sets: [{ reps: 8, load: 0, done: true }] }, { name: 'Pompes', sets: [{ reps: 12, done: true }] }] } })),
  events: [{ id: 'ev', date: '2026-01-01', sessionId: 'se1', recurrence: { freq: 'weekly' } }],
  seances: [{ id: 'se1', name: 'S', activity: 'strength', exercises: [{ name: 'Pompes', sets: 3, needs: [] }] }],
  personal: [{ id: 'pe', name: 'Perso', data: { caps: { force_jambes: 1 }, acts: ['strength'], prim: [], sec: [] } }],
  settings: { level: { boulderMax: '6B' }, equipment: { wall: true }, avoid: {}, goals: [{ name: 'x', target: 12 }] },
});
const run = (raw) => {
  const c = B.buildContext({ ...raw, now: NOW });
  const fns = ['records', 'timeline', 'journal', 'achievements', 'loadAnalysis', 'regularity', 'undertrained', 'forgottenGoals', 'testReminders', 'learnedPreferences', 'habits', 'diagnostics', 'understandProfile', 'trainingMap', 'neverTried', 'atypicalSessions'];
  for (const f of fns) B[f](c);
  B.todayOptions(c, { todayEvents: raw.events }); B.benchmarks(c, 7); B.periodSummary(c, 'week'); B.muscleVolume(c, 30);
  for (const g of c.goals) { B.goalProgress(g, c); B.blockers(g, c); B.whyNoProgress(g, c); B.goalPaths(g, c); }
  B.strengthsWeaknesses(B.profileCapacities(c));
};
run(base());
function paths(o, pre = []) { const out = []; if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push([...pre, k]); out.push(...paths(v, [...pre, k])); } return out; }
let n = 0; const fails = [];
for (const bad of [12, 'texte', null, {}]) for (const p of paths(base())) {
  const raw = base(); let t = raw; for (const k of p.slice(0, -1)) t = t[k]; t[p.at(-1)] = bad; n++;
  try { run(raw); } catch (e) { fails.push(`${p.join('.')} = ${JSON.stringify(bad)} → ${e.message}`); }
}
assert.deepEqual(fails.slice(0, 20), [], fails.length + ' plantage(s)');
console.log(`  ✓ ${n} variantes de données anciennes ou abîmées : aucune analyse ne plante\n\n1 test de robustesse OK`);
