// tests/catchup.test.mjs — rattrapage : une seule visite pour toutes les mises à jour ratées depuis la dernière visite.
import assert from 'node:assert/strict';
import { catchUpSteps, missedVersions, MOVED } from '../public/catchup.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const NEWS = [
  { v: '8.1.0', title: 'Un', why: '', steps: [['home', 'dash', '.a', 'A', 'a']] },
  { v: '8.2.0', title: 'Deux', why: '', steps: [['progress', 'records', '.r', 'Records', 'r'], ['home', 'dash', '.b', 'B', 'b']] },
  { v: '8.3.0', title: 'Trois', why: '', steps: [['home', 'dash', '.b', 'B2', 'b nouveau'], ['library', 'x', '.c', 'C', 'c']] },
  { v: '9.0.0', title: 'Futur', why: '', steps: [['home', 'dash', '.z', 'Z', 'z']] },
];
ok('versions ratées : après la dernière visitée, jusqu’à la version actuelle, dans l’ordre', () => {
  assert.deepEqual(missedVersions(NEWS, '8.1.0', '8.3.0').map((x) => x.v), ['8.2.0', '8.3.0']);
  assert.equal(missedVersions(NEWS, '8.3.0', '8.3.0').length, 0);
});
ok('plusieurs versions ratées : un résumé d’abord, puis toutes les étapes, sans doublon (le texte le plus récent gagne)', () => {
  const s = catchUpSteps(NEWS, '8.0.0', '8.3.0');
  assert.match(s[0][3], /3 mises à jour à rattraper/); assert.match(s[0][4], /« Un », « Deux », « Trois »/);
  const b = s.filter((x) => x[2] === '.b'); assert.equal(b.length, 1); assert.equal(b[0][4], 'b nouveau');
  assert.ok(!s.some((x) => x[3] === 'Z'), 'pas de version future');
});
ok('pages regroupées depuis : l’étape mène à la nouvelle page', () => {
  const s = catchUpSteps(NEWS, '8.1.0', '8.2.0'), r = s.find((x) => x[3] === 'Records');
  assert.deepEqual(r.slice(0, 3), [...MOVED['progress/records'], '#main h1']);
});
ok('une seule version ratée : pas de résumé, juste ses étapes ; rien de raté : rien', () => {
  const s = catchUpSteps(NEWS, '8.2.0', '8.3.0'); assert.equal(s.length, 2); assert.equal(s[0][3], 'B2');
  assert.equal(catchUpSteps(NEWS, '8.3.0', '8.3.0').length, 0);
});
console.log(`${n} tests du rattrapage OK`);
