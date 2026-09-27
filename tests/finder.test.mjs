// tests/finder.test.mjs — recherche (🔍) : index des fonctions et des paramètres, accents, synonymes, ordre.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEATURE_INDEX, SETTINGS_INDEX, findIn, norm } from '../public/finder.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ALL = [...FEATURE_INDEX, ...SETTINGS_INDEX], top = (q, idx = ALL) => findIn(idx, q)[0]?.title;

console.log('Recherche');
ok('accents, majuscules et ponctuation ignorés', () => {
  assert.equal(norm('Échauffement — AUTO !'), 'echauffement auto');
  assert.equal(top('echauffement auto'), top('Échauffement automatique'));
});
ok('le bon résultat en premier pour les recherches courantes', () => {
  assert.equal(top('minuteur'), 'Minuteur'); assert.equal(top('langue'), 'Langue'); assert.equal(top('mot de passe'), 'Changer le mot de passe');
  assert.equal(top('rappel'), 'Rappels d’entraînement'); assert.equal(top('records'), 'Records');
});
ok('synonymes : « anglais » trouve la langue, « tabata » le minuteur, « poids » mon corps', () => {
  assert.equal(top('anglais'), 'Langue'); assert.equal(top('tabata'), 'Minuteur'); assert.ok(findIn(ALL, 'poids').some((r) => r.title === 'Mon corps'));
});
ok('tous les mots doivent correspondre ; rien pour une recherche vide ou absurde', () => {
  assert.deepEqual(findIn(ALL, ''), []); assert.deepEqual(findIn(ALL, 'zzzqqq'), []);
  assert.ok(findIn(ALL, 'son bips').every((r) => /son|bip/i.test(norm(`${r.title} ${r.sub} ${r.keys}`))));
});
ok('dans Paramètres, seulement des réglages', () => {
  assert.ok(findIn(SETTINGS_INDEX, 'son').length > 0); assert.ok(findIn(SETTINGS_INDEX, 'son').every((r) => r.kind === 'setting'));
  assert.deepEqual(findIn(SETTINGS_INDEX, 'minuteur tabata'), []);
});
ok('chaque paramètre mène à une rubrique qui existe ; chaque action existe dans l’app', () => {
  const subs = fs.readFileSync(new URL('../public/views-settings.js', import.meta.url), 'utf8');
  for (const e of SETTINGS_INDEX) assert.match(subs, new RegExp(`\\['${e.to.split('/')[1]}'`), e.title);
  const src = fs.readdirSync(new URL('../public/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8')).join('\n');
  for (const e of FEATURE_INDEX.filter((x) => x.act)) assert.match(src, new RegExp(`ACT\\.${e.act}\\s*=`), e.act);
});
console.log(`\n${n} tests de recherche OK`);
