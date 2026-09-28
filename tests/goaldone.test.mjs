// tests/goaldone.test.mjs — objectif réussi : performance ajoutée au profil, objectifs suivants, liste des réussis.
import assert from 'node:assert/strict';
import { donePerf, nextGoals, doneGoals } from '../public/goaldone.js';
import { systemFromTemplate, sortedLevels, gradeSnapshot } from '../public/grading.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const u8 = { id: 'u8sys', ...systemFromTemplate('u8'), activity: 'bloc' }, lv = sortedLevels(u8), ctx = { systems: { u8sys: u8 }, goals: [] };

ok('cotation réussie : devient le max (bloc ou voie) ; niveau suivant proposé', () => {
  const g = { type: 'grade', gradeTarget: gradeSnapshot(u8, lv[6].id), activityId: 'climbing_boulder' };
  const p = donePerf(g, 5); assert.equal(p.metricId, 'max_bloc'); assert.equal(p.grade.label, 'U7'); assert.equal(p.date, 5);
  const nx = nextGoals(g, ctx); assert.equal(nx[0].data.gradeTarget.label, 'U8'); assert.equal(nx[0].data.status, 'active');
  assert.ok(!nextGoals({ ...g, gradeTarget: gradeSnapshot(u8, lv[7].id) }, ctx).some((x) => /U9/.test(x.label)), 'pas de niveau inventé au-dessus du dernier');
});
ok('objectif chiffré : la valeur visée est enregistrée ; suivant un peu plus loin, ou plus rapide pour un temps', () => {
  assert.deepEqual(donePerf({ type: 'metric', metricId: 'max_tractions', target: 12 }, 1), { metricId: 'max_tractions', value: 12, date: 1, source: 'declared', note: 'Objectif réussi' });
  assert.equal(nextGoals({ type: 'metric', metricId: 'max_tractions', target: 12 }, ctx)[0].data.target, 14);
  const run = nextGoals({ type: 'metric', metricId: 'course_5k', target: 25 }, ctx)[0].data.target; assert.ok(run < 25, `${run}`);
});
ok('figure réussie : pas de mesure inventée ; figures proches proposées, sans celles déjà en objectif', () => {
  assert.equal(donePerf({ type: 'skill', skillId: 'front_lever' }), null);
  const nx = nextGoals({ type: 'skill', skillId: 'front_lever' }, { ...ctx, goals: [{ skillId: 'front_lever' }] });
  assert.ok(nx.length >= 1 && nx.every((x) => x.data.type === 'skill' && x.data.skillId !== 'front_lever'));
});
ok('liste des réussis : seulement les réussis, les plus récents d’abord', () => {
  assert.deepEqual(doneGoals([{ id: 'a', status: 'done', doneAt: 1 }, { id: 'b', status: 'active' }, { id: 'c', status: 'done', doneAt: 9 }]).map((g) => g.id), ['c', 'a']);
});
console.log(`\n${n} tests d’objectifs réussis OK`);
