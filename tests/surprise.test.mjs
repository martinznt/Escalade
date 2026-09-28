// tests/surprise.test.mjs — « Surprends-moi » : nouveau pour moi, ou pour progresser, toujours expliqué et fondé sur l'historique.
import assert from 'node:assert/strict';
import * as X from '../public/surprise.js';
import { systemFromTemplate, sortedLevels } from '../public/grading.js';
import { it, env, act, perf, ctxOf, NOW } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const u8 = systemFromTemplate('u8'), lv = sortedLevels({ levels: u8.levels });
const g = (l) => ({ systemId: 'u8sys', levelId: lv[l].id, label: lv[l].label, order: l, total: 8 });
const hist = [1, 3, 5, 8].map((d, i) => ({ id: 'h' + i, sessionName: 's', startedAt: NOW - d * 864e5, durationSeconds: 3600,
  data: { activity: 'climbing_boulder', exercises: [{ name: 'Blocs U5 · dévers et réglettes', group: 'cp-pyramid', sets: [] }, { name: 'Essais sur blocs U6 · dévers', group: 'cp-limit', sets: [] }] } }));
const base = [act('climbing_boulder'), act('conditioning'), it('gradesys', u8, 'u8sys'), env('Salle', ['wall', 'hangboard', 'mat', 'bar'], { type: 'salle', gradeSys: 'u8sys' })];
const ctx = ctxOf({ items: [...base, perf('max_bloc', 0, 3, { grade: g(6), styles: ['st-devers'] }), perf('max_bloc', 0, 4, { grade: g(4), styles: ['st-dalle'] })], history: hist });

console.log('Habitudes');
ok('styles et structures faits, comptés d’après l’historique réel', () => {
  const H = X.climbHabits(hist, NOW);
  assert.equal(H.structures.pyramid.n, 4); assert.equal(H.styles['st-devers'].n, 8); assert.equal(H.styles['st-dalle'], undefined); assert.equal(H.kinds.bloc, 4);
});
ok('styles faibles : seulement d’après les maxima notés par style', () => {
  assert.deepEqual(X.weakStyles(ctx, 'bloc').map((w) => [w.id, w.best, w.top, w.index]), [['st-dalle', 'U5', 'U7', 4]]);
  assert.deepEqual(X.weakStyles(ctxOf({ items: base }), 'bloc'), []);
});
console.log('Surprises');
ok('nouveau : styles et structures jamais faits, raisons chiffrées', () => {
  const r = X.surprise({ kind: 'bloc', minutes: 90, aim: 'new', seed: 3 }, ctx);
  assert.ok(!r.session.exercises.some((e) => /dévers|réglettes/.test(e.name)), 'pas les styles habituels');
  assert.ok(!r.session.exercises.some((e) => /^cp-(pyramid|limit)$/.test(e.group)), 'pas les structures habituelles');
  assert.match(r.reasons.join(' '), /jamais/); assert.equal(r.session.notes[0].title, 'Pourquoi cette surprise');
});
ok('progresser : le style le plus faible, cotations calées sur SON max ; objectif de cotation prioritaire', () => {
  const r = X.surprise({ kind: 'bloc', minutes: 90, aim: 'progress', seed: 1 }, ctx);
  const climb = r.session.exercises.filter((e) => /^cp-/.test(e.group));
  assert.ok(climb.every((e) => /dalle/.test(e.name)), climb.map((e) => e.name).join(' | '));
  assert.ok(climb.some((e) => /U5–U6/.test(e.name)) && !climb.some((e) => /U7|U8/.test(e.name)));
  assert.match(r.reasons[0], /Dalle : ton max noté est U5/);
  const withGoal = ctxOf({ items: [...base, it('goal', { title: 'U7', kind: 'grade', status: 'active', gradeTarget: g(6), activityId: 'climbing_boulder' })], history: hist });
  const r2 = X.surprise({ kind: 'bloc', minutes: 90, aim: 'progress', seed: 1 }, withGoal);
  assert.match(r2.reasons[0], /Ton objectif : U7/); assert.ok(r2.session.exercises.some((e) => /Objectif U7/.test(e.part)));
});
ok('fatigué : pas de blocs max ; même graine → même surprise, autre graine → possible autre', () => {
  const r = X.surprise({ kind: 'bloc', minutes: 60, aim: 'new', forme: 'low', seed: 5 }, ctx);
  assert.ok(!r.session.exercises.some((e) => /^cp-(limit|fourx4)$/.test(e.group)));
  const a = X.surprise({ kind: 'bloc', minutes: 60, aim: 'any', seed: 9 }, ctx), b = X.surprise({ kind: 'bloc', minutes: 60, aim: 'any', seed: 9 }, ctx);
  assert.deepEqual(a.session.exercises.map((e) => e.name), b.session.exercises.map((e) => e.name));
});
ok('autre sport : des exercices jamais faits, marqués 🆕 et nommés dans le pourquoi', () => {
  const r = X.surprise({ activityId: 'conditioning', minutes: 40, aim: 'new', seed: 2 }, ctx);
  const news = r.session.exercises.filter((e) => e.isNew); assert.ok(news.length >= 1);
  for (const e of news) assert.ok(r.reasons[0].includes(e.name));
  const p = X.surprise({ activityId: 'conditioning', minutes: 40, aim: 'progress', seed: 2 }, ctx);
  assert.match(p.reasons[0], /axes de progrès|objectif/);
});
console.log(`\n${n} tests de surprise OK`);
