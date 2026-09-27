// tests/questions.test.mjs — l'app ne demande que ce qui lui manque, une question à la fois, sans insister.
import assert from 'node:assert/strict';
import { pendingQuestions, nextQuestion, bucketValue } from '../public/questions.js';
import { NOW, it, perf, env, act, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ids = (c) => pendingQuestions(c).map((q) => q.id);
console.log('Petites questions');
ok('profil vide : on commence par le sport', () => { assert.equal(nextQuestion(ctxOf()).id, 'acts'); });
ok('grimpeur : fréquence d’escalade et meilleur bloc demandés', () => { const q = ids(ctxOf({ items: [act('climbing_boulder')] })); assert.ok(q.includes('climbPerWeek') && q.includes('bloc')); });
ok('non-grimpeur : jamais de question d’escalade', () => { const q = ids(ctxOf({ items: [act('running')] })); assert.ok(!q.includes('climbPerWeek') && !q.includes('bloc')); });
ok('information déjà connue : question retirée', () => {
  const c = ctxOf({ items: [act('climbing_boulder'), env('Salle', ['wall']), it('config', { climbPerWeek: 2, perWeek: 3, durations: ['45'], goal: 'climb' }, 'main'), perf('max_bloc', null, 5, { grade: { systemId: 'font', systemName: 'Font', levelId: 'l5', label: '6A', order: 5, total: 24 } }), perf('max_tractions', 8)], settings: { avoid: { fingers: true } } });
  assert.deepEqual(ids(c), []); assert.equal(nextQuestion(c), null);
});
ok('« je ne sais pas » compte comme une réponse : plus redemandé', () => { const c = ctxOf({ items: [act('climbing_boulder'), perf('max_bloc', null, 1, { unknown: true })] }); assert.ok(!ids(c).includes('bloc')); });
ok('question marquée comme posée (« Non, rien ») : plus redemandée', () => { const c = ctxOf({ items: [act('running'), it('config', { asked: ['avoid'] }, 'main')] }); assert.ok(!ids(c).includes('avoid')); });
ok('« plus tard » : question suivante proposée', () => { const c = ctxOf(); assert.notEqual(nextQuestion(c, { acts: NOW + 1e9 }, NOW).id, 'acts'); });
ok('chaque question a un texte, une raison et des réponses', () => { for (const q of pendingQuestions(ctxOf({ items: [act('climbing_boulder'), act('strength')] }))) { assert.ok(q.text && q.why && q.options.length >= 2, q.id); } });
ok('réponse par tranche : valeur basse (jamais surestimée)', () => { assert.equal(bucketValue('5'), 5); assert.equal(bucketValue('x'), 0); });
console.log(`\n${n} tests des petites questions OK`);
