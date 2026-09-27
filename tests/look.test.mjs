// tests/look.test.mjs — accueil vivant (ciel selon l'heure, saisons, phrase du jour) et version anglaise.
import assert from 'node:assert/strict';
import { dayPhase, seasonOf, sceneSvg, moodLine } from '../public/scene.js';
import { tr } from '../public/i18n.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('Accueil vivant');
ok('moment de la journée et saison', () => {
  assert.deepEqual([5, 6, 8, 9, 17, 18, 20, 21, 0].map(dayPhase), ['nuit', 'aube', 'aube', 'jour', 'jour', 'soir', 'soir', 'nuit', 'nuit']);
  assert.deepEqual([0, 2, 5, 8, 11].map(seasonOf), ['hiver', 'printemps', 'ete', 'automne', 'hiver']);
});
ok('décor : même jour → même dessin ; étoiles la nuit, pas le jour ; SVG sans script', () => {
  const d = new Date(2026, 0, 12, 23, 0);
  assert.equal(sceneSvg(d), sceneSvg(new Date(2026, 0, 12, 23, 0)));
  assert.match(sceneSvg(d), /class="star"/); assert.doesNotMatch(sceneSvg(new Date(2026, 5, 1, 13)), /class="star"/);
  assert.doesNotMatch(sceneSvg(d, { season: true }), /<script|on\w+=|href/i);
});
ok('décor de saison seulement si demandé : neige en hiver, feuilles en automne, fleurs au printemps', () => {
  assert.doesNotMatch(sceneSvg(new Date(2026, 0, 5, 12)), /flake/);
  assert.match(sceneSvg(new Date(2026, 0, 5, 12), { season: true }), /flake/);
  assert.match(sceneSvg(new Date(2026, 9, 5, 12), { season: true }), /leaf/);
  assert.match(sceneSvg(new Date(2026, 3, 5, 12), { season: true }), /bloom/);
});
ok('phrase du jour : première fois, objectif atteint, déjà fait, et selon l’heure', () => {
  assert.match(moodLine({ first: true }), /première séance/);
  assert.match(moodLine({ target: 3, weekCount: 3, hour: 10, day: 1 }), /atteint/);
  assert.match(moodLine({ done: true, hour: 10, day: 1 }), /aujourd’hui|récupérer/);
  assert.match(moodLine({ hour: 23, day: 0 }), /tard|demain/);
  assert.notEqual(moodLine({ hour: 9, day: 0 }), moodLine({ hour: 9, day: 1 }));
});

console.log('Version anglaise');
ok('textes connus traduits, emoji et espaces gardés ; inconnus laissés tels quels', () => {
  assert.equal(tr('🏠 Accueil'), '🏠 Home'); assert.equal(tr('  Paramètres '), '  Settings ');
  assert.equal(tr('Ceci n’est pas traduit'), 'Ceci n’est pas traduit'); assert.equal(tr(''), '');
});
ok('textes variables : séries, exercices, dates, durées', () => {
  assert.equal(tr('Série 2 / 3 · côté 1 / 2'), 'Set 2 / 3 · side 1 / 2');
  assert.equal(tr('dimanche 27 septembre'), 'Sunday 27 September');
  assert.equal(tr('Course à pied · 40 min · débutant'), 'Running · 40 min · beginner');
  assert.equal(tr('▶ Démarrer (4:00)'), '▶ Start (4:00)');
});
console.log(`\n${n} tests d’apparence et de langue OK`);
