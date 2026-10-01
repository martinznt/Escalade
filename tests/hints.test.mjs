// tests/hints.test.mjs — raccourcis contextuels : seulement quand ils servent, masquables, ajoutables par un admin.
import assert from 'node:assert/strict';
import { hintsFor, hintState, HINTS } from '../public/hints.js';
import { cleanGlobal } from '../server/global.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const empty = hintState({ activities: { climbing_boulder: {} }, goals: [], envs: [], perfs: [] });
const full = hintState({ activities: { climbing_boulder: {} }, goals: [{ id: 'g', status: 'active' }, { id: 'h', status: 'done' }], envs: [{ id: 'e', type: 'escalade' }], perfs: [{ metricId: 'max_bloc' }] });

ok('accueil : lieu, objectif, niveau max proposés seulement s’ils manquent (2 au plus)', () => {
  assert.deepEqual(hintsFor('home/dash', empty).map((x) => x.id), ['home-place', 'home-goal']);
  assert.deepEqual(hintsFor('home/dash', full), []);
  assert.deepEqual(hintsFor('home/dash', { ...full, draft: true }).map((x) => x.id), ['home-draft']);
});
ok('création de séance : rien à l’étape des objectifs (on les ajoute sur place) ; « Exercices » à l’étape 4', () => {
  assert.deepEqual(hintsFor('library/climbplan', { ...empty, cp: { step: 2 } }), [], 'les objectifs s’ajoutent dans l’étape même : pas de renvoi vers le profil');
  assert.deepEqual(hintsFor('library/climbplan', { ...full, cp: { step: 2 } }), []);
  const h5 = hintsFor('library/climbplan', { ...full, cp: { step: 4 } }); assert.equal(h5[0].go, 'library/exercises'); assert.match(h5[0].back, /Retour à ma séance/);
});
ok('pages proches non confondues (séance ≠ séances) ; masqués ; ajoutés par un admin', () => {
  assert.equal(hintsFor('library/seances', { ...full, seances: 10 }).length, 0);
  assert.deepEqual(hintsFor('library/seance', full).map((x) => x.id), ['seance-ex']);
  assert.deepEqual(hintsFor('library/seance', full, { off: ['seance-ex'] }), []);
  assert.equal(hintsFor('profile/perfs', full, { extra: [{ id: 'g-1', where: 'profile/perfs', go: 'home/dash', text: 'X' }] }).at(-1).id, 'g-1');
});
ok('chaque raccourci mène quelque part ; le serveur valide ceux des admins', () => {
  for (const x of HINTS) assert.ok(x.go || x.act, x.id);
  assert.deepEqual(cleanGlobal('hint', { where: 'home/dash', go: 'profile/perfs', text: 'Note ton max', icon: '📏' }), { where: 'home/dash', go: 'profile/perfs', text: 'Note ton max', icon: '📏', back: 'Retour' });
  assert.equal(cleanGlobal('hint', { where: 'javascript:alert(1)', go: 'home/dash', text: 'x' }), null);
  assert.equal(cleanGlobal('hint', { where: 'home/dash', go: 'home/dash', text: '' }), null);
});
console.log(`\n${n} tests des raccourcis OK`);
