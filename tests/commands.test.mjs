import assert from 'node:assert/strict';
import { parseCommand } from '../public/commands.js';
import { generateSession, addExerciseToSession, findExerciseInSession } from '../public/engine.js';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('parseCommand');
ok('« Fais une séance de 20 minutes pour les jambes »', () => {
  const c = parseCommand('Fais-moi une séance de 20 minutes pour les jambes.');
  assert.equal(c.type, 'generate'); assert.equal(c.minutes, 20); assert.equal(c.size, 'petite'); assert.equal(c.focus, 'jambes');
});
ok('« Remplace les tractions »', () => {
  const c = parseCommand('Remplace les tractions.');
  assert.equal(c.type, 'swapExercise'); assert.equal(c.query, 'tractions');
});
ok('« Ajoute 5 minutes de gainage »', () => {
  const c = parseCommand('Ajoute 5 minutes de gainage.');
  assert.equal(c.type, 'addExercise'); assert.equal(c.minutes, 5); assert.equal(c.query, 'gainage');
});
ok('« Montre mes records »', () => {
  assert.equal(parseCommand('Montre mes records.').type, 'showRecords');
  assert.equal(parseCommand('Affiche ma progression').type, 'showProgress');
});
ok('« Supprime ma dernière séance » est marquée destructive', () => {
  const c = parseCommand('Supprime ma dernière séance');
  assert.equal(c.type, 'deleteLastHistory'); assert.equal(c.confirm, true);
});
ok('phrase non reconnue → unknown, jamais d’action inventée', () => {
  assert.equal(parseCommand('Quel temps fait-il ?').type, 'unknown');
  assert.equal(parseCommand('').type, 'unknown');
  assert.equal(parseCommand('   ').type, 'unknown');
});
ok('minutes bornées entre 5 et 180', () => {
  assert.equal(parseCommand('Fais une séance de 3 minutes').minutes, 5);
  assert.equal(parseCommand('Fais une séance de 500 minutes').minutes, 180);
});

ok('« que faire aujourd’hui » → options du jour', () => { assert.equal(parseCommand('Qu’est-ce que je fais aujourd’hui ?').type, 'today'); });
ok('« remplace X par Y » garde le remplaçant', () => { const c = parseCommand('Remplace les pompes par des dips'); assert.equal(c.type, 'swapExercise'); assert.equal(c.query, 'pompes'); assert.equal(c.by, 'dips'); });
ok('« je n’ai que 12 minutes » → adaptation de durée', () => { const c = parseCommand('Je n’ai que 12 minutes'); assert.equal(c.type, 'adaptDuration'); assert.equal(c.minutes, 12); });
ok('« pas de barre aujourd’hui » → matériel indisponible', () => { const c = parseCommand('Pas de barre de traction aujourd’hui'); assert.equal(c.type, 'equipmentOff'); assert.ok(c.equipment.includes('bar')); });
ok('« planifie une séance demain » → date calculée', () => { const now = new Date(2026, 0, 10, 9); const c = parseCommand('Planifie une séance demain', now); assert.equal(c.type, 'plan'); assert.equal(c.date, '2026-01-11'); });
ok('séance de course légère : activité et mode léger détectés', () => { const c = parseCommand('Fais une séance de course légère de 30 min'); assert.equal(c.type, 'generate'); assert.equal(c.activity, 'running'); assert.equal(c.light, true); assert.equal(c.minutes, 30); });
ok('« retire le gainage » demande confirmation', () => { const c = parseCommand('Retire le gainage'); assert.equal(c.type, 'removeExercise'); assert.equal(c.confirm, true); });
ok('chaque intention reconnue porte un résumé', () => { for (const t of ['Montre mes records', 'Fais une séance de 20 minutes', 'Remplace les tractions']) assert.ok(parseCommand(t).summary); });

console.log('addExerciseToSession / findExerciseInSession');
const { session } = generateSession({ focus: 'devers', size: 'moyenne', seed: 1 }, { now: Date.now() });
ok('ajoute un exercice connu de la bibliothèque avec la durée demandée', () => {
  const s2 = addExerciseToSession(session, 'gainage', 5);
  const added = s2.exercises[s2.exercises.length - 1];
  assert.equal(s2.exercises.length, session.exercises.length + 1);
  assert.equal(added.mode, 'time');
  assert.equal(added.secMin, 300); assert.equal(added.secMax, 300);
});
ok('ajoute un bloc générique si le nom ne correspond à rien de connu', () => {
  const s2 = addExerciseToSession(session, 'exercice totalement inventé xyz', 3);
  const added = s2.exercises[s2.exercises.length - 1];
  assert.match(added.name, /Exercice totalement inventé xyz/i);
  assert.equal(added.secMin, 180);
});
ok('durée toujours bornée entre 1 et 30 minutes', () => {
  const tooShort = addExerciseToSession(session, 'gainage', 0);
  assert.equal(tooShort.exercises.at(-1).secMin, 60);
  const tooLong = addExerciseToSession(session, 'gainage', 999);
  assert.equal(tooLong.exercises.at(-1).secMin, 1800);
});
ok('ne modifie pas la séance si la requête est vide', () => {
  const s2 = addExerciseToSession(session, '', 5);
  assert.equal(s2, session);
});
ok('findExerciseInSession retrouve un exercice par correspondance approximative', () => {
  const target = session.exercises.find((e) => e.block === 'main');
  const found = findExerciseInSession(session, target.name.slice(0, Math.max(4, target.name.length - 2)));
  assert.ok(found);
  assert.equal(found.id, target.id);
});
ok('findExerciseInSession renvoie null si rien ne correspond', () => {
  assert.equal(findExerciseInSession(session, 'zzzzzzz improbable'), null);
});

console.log(`\n${n} tests OK`);
