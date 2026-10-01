// tests/profile828.test.mjs — 8.28 : bilan physique selon les objectifs (tests utiles, zones à ménager, repères,
// objectifs précis proposés), niveau des exercices par capacité, cotations proposées, raccourcis cohérents.
import assert from 'node:assert/strict';
import { buildContext, testReminders } from '../public/brain.js';
import { batteryFor, assessment, conditionFacts, suggestedGoals, guidedTests, nextStep } from '../public/assess.js';
import { exerciseLevel, candidates } from '../public/generator.js';
import { proposeForPhase } from '../public/phaseplan.js';
import { partRange } from '../public/climbplan.js';
import { hintsFor, hintState } from '../public/hints.js';
import { byId } from '../public/library.js';
import { BUILTIN_SYSTEMS, sortedLevels } from '../public/grading.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const now = Date.now(), DAY = 86400000;
const it = (c, id, d) => ({ c, id, d, u: now });
const perf = (metricId, value, ago = 1, extra = {}) => it('perf', 'p-' + metricId + ago, { metricId, value, date: now - ago * DAY, source: 'measured', ...extra });
const ctxOf = ({ items = [], settings = {} } = {}) => buildContext({ items, settings, now });
const climber = (extra = [], settings = {}) => ctxOf({ items: [it('activity', 'a1', { preset: 'climbing_boulder' }), it('activity', 'a2', { preset: 'conditioning' }), it('config', 'main', { goals: ['climb', 'force'] }), ...extra], settings });

ok('les tests utiles viennent des objectifs, pas des deux premières mesures de chaque sport', () => {
  const t = batteryFor({ envies: ['endurance'], acts: ['running'] }).map((x) => x.metricId);
  assert.ok(t.includes('course_5k') && t.includes('fc_repos') && !t.includes('max_tractions'));
  const p = batteryFor({ envies: ['poids'], acts: [] }).map((x) => x.metricId);
  assert.deepEqual(p.slice(0, 2), ['body_weight', 'tour_taille']);
  assert.ok(batteryFor({ envies: ['mobilite'] }).some((x) => x.metricId === 'mains_dos'));
});
ok('zones à ménager : test de doigts remplacé (et dit), dips retirés pour les épaules', () => {
  const t = batteryFor({ envies: ['climb', 'force'], acts: ['climbing_boulder'], avoid: { fingers: true, shoulders: true } });
  assert.ok(!t.some((x) => x.metricId === 'suspension_20mm'));
  const dh = t.find((x) => x.metricId === 'dead_hang'); assert.ok(dh && dh.swapped.from === 'suspension_20mm' && /doigts à ménager/.test(dh.why));
  assert.ok(!t.some((x) => x.metricId === 'max_dips'));
});
ok('bilan : ce qui est connu, ancien, « je ne sais pas » ; couverture ; repère seulement s’il existe', () => {
  const c = climber([perf('max_tractions', 8), perf('hollow_hold', 20, 200), perf('pistol_squat', null, 2, { unknown: true, value: null })]);
  const a = assessment(c), row = (id) => a.rows.find((r) => r.metricId === id);
  assert.equal(row('max_tractions').state, 'known'); assert.match(row('max_tractions').tierText, /intermédiaire/);
  assert.equal(row('hollow_hold').state, 'old'); assert.equal(row('pistol_squat').state, 'unknown'); assert.equal(row('blocage_90').state, 'never');
  assert.equal(a.coverage, Math.round((1 / a.total) * 100));
  const f = conditionFacts(a); assert.match(f.text, /1 des \d+ repères/); assert.ok(f.lines.every((l) => /\((mesuré|déclaré|relevé en séance)\)/.test(l.text)));
  assert.ok(guidedTests(c).every((r) => r.kind !== 'grade'));
});
ok('mesure datée d’aujourd’hui (midi, plus tard que maintenant) : âge 0, jamais négatif', () => {
  const a = assessment(climber([perf('max_tractions', 8, -0.3)]));
  assert.equal(a.rows.find((r) => r.metricId === 'max_tractions').age, 0);
});
ok('sans donnée, aucune conclusion ; poids ou cœur au repos : jamais de cible proposée d’office', () => {
  assert.equal(conditionFacts(assessment(climber())).lines.length, 0);
  const c = ctxOf({ items: [it('config', 'main', { goals: ['poids'] }), perf('body_weight', 80), perf('fc_repos', 70)] });
  assert.equal(nextStep(c, 'body_weight'), null); assert.equal(nextStep(c, 'fc_repos'), null); assert.equal(suggestedGoals(c).length, 0);
});
ok('objectifs précis proposés depuis la dernière valeur (tractions, cotation suivante)', () => {
  const font = BUILTIN_SYSTEMS.font, lv = sortedLevels(font).find((l) => l.label === '6A');
  const c = climber([perf('max_tractions', 8), perf('max_bloc', null, 1, { grade: { systemId: 'font', systemName: font.name, levelId: lv.id, label: '6A', order: lv.order, total: font.levels.length } })]);
  const g = suggestedGoals(c);
  assert.ok(g.some((x) => x.metricId === 'max_tractions' && x.target === 10));
  assert.ok(g.some((x) => x.type === 'grade' && x.gradeTarget.label === '6A+'));
});
ok('« À mesurer » suit les objectifs et le protocole est toujours donné', () => {
  const r = testReminders(climber([], { avoid: { fingers: true } }));
  assert.ok(r.length && r.every((x) => x.test), 'protocole présent');
  assert.ok(!r.some((x) => x.metricId === 'traction_archer'), 'plus de mesure prise au hasard');
});
ok('niveau par capacité : fort en tirage → exercice de tirage avancé permis ; inconnu → niveau de l’activité', () => {
  const oap = byId('oap'), c = ctxOf({ items: [it('activity', 'a', { preset: 'conditioning' }), perf('max_tractions', 20), perf('traction_archer', 8)] });
  const lv = exerciseLevel(oap, c, 0);
  assert.equal(lv.level, 2); assert.ok(lv.cap);
  assert.equal(exerciseLevel(oap, ctxOf(), 0).level, 0);
  assert.equal(exerciseLevel(oap, c, 0, { light: true }).level, 0, 'mode léger : pas de montée');
  assert.equal(exerciseLevel(oap, c, 0, { levelCap: 1 }).level, 1, 'plafond de forme respecté');
  const eq = new Set(['bar']);
  assert.ok(candidates('conditioning', c, { eq, level: 0 }).ok.some((x) => x.id === 'oap'));
  assert.ok(candidates('conditioning', ctxOf(), { eq, level: 0 }).excluded.some((e) => e.x.id === 'oap'));
});
ok('propositions de phase : un débutant ne se voit plus proposer d’exercice avancé, et c’est dit', () => {
  const c = ctxOf({ items: [it('activity', 'a', { preset: 'conditioning' })] });
  const r = proposeForPhase({ id: 'x', type: 'main', role: 'force', activity: 'conditioning', minutes: 20, intensity: 'hard' }, c, { eq: new Set(['bar', 'rings', 'hangboard', 'weights', 'band', 'dips']) });
  assert.ok(!r.items.some((i) => (byId(i.id)?.minLevel || 0) > 0));
  assert.ok(r.missing.some((m) => /niveau conseillé au-dessus du tien/.test(m.text)));
});
ok('cotations proposées : un cran = un niveau (grimpeur 6A → facile en 4–4+, intense 5 → 6A)', () => {
  const levels = sortedLevels(BUILTIN_SYSTEMS.font), m = levels.findIndex((l) => l.label === '6A');
  const lab = ([a, b]) => [levels[a].label, levels[b].label];
  assert.deepEqual(lab(partRange({ intensity: 'easy' }, levels, m)), ['4', '4+']);
  assert.deepEqual(lab(partRange({ intensity: 'hard' }, levels, m)), ['5', '6A']);
});
ok('raccourcis : pas par-dessus le questionnaire ; envies choisies = pas de « Fixe-toi un objectif », bilan proposé', () => {
  const c = ctxOf({ items: [it('activity', 'a', { preset: 'conditioning' }), it('config', 'main', { goals: ['force'] }), it('env', 'e', { name: 'Maison', type: 'maison' })] });
  const st = hintState(c);
  assert.deepEqual(hintsFor('home/setup', st), []);
  const ids = hintsFor('home/dash', st).map((x) => x.id);
  assert.ok(!ids.includes('home-goal') && ids.includes('home-bilan'));
});
console.log(`\n${n} tests bilan / niveau par capacité OK`);
