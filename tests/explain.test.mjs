// tests/explain.test.mjs — « C'est quoi ? · À quoi ça sert ? · Pourquoi ici ? » pour chaque exercice et séance.
import assert from 'node:assert/strict';
import { exWhat, exUse, exWhyHere, sessionWhat, sessionUse, sessionWhy } from '../public/explain.js';
import { LIBRARY, byId } from '../public/library.js';
import { CATALOG, buildSession } from '../public/catalog.js';
import { normalizeSession } from '../public/shared.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ex = (id, block = 'main', o = {}) => ({ ...byId(id), libId: id, id: id + block, block, ...o });

console.log('Exercices');
ok('chaque exercice de la bibliothèque a « c’est quoi » et « à quoi ça sert », sans trou ni « undefined »', () => {
  for (const l of LIBRARY) {
    const e = { ...l, libId: l.id }, w = exWhat(e), u = exUse(e);
    assert.ok(w.length > 20 && !/undefined|NaN|null/.test(w), `${l.id} : ${w}`);
    assert.ok(u.length > 10 && !/undefined|NaN/.test(u), `${l.id} : ${u}`);
  }
});
ok('c’est quoi : type, durée ou répétitions, matériel, muscles ; texte d’un administrateur prioritaire', () => {
  assert.match(exWhat(ex('hang-max')), /doigts.*10 s.*Matériel : poutre/i);
  assert.match(exWhat(ex('pushup')), /répétitions.*Sans matériel/);
  assert.match(exWhat(ex('wu-pulse')), /min/);
  assert.equal(exWhat({ ...ex('pushup'), what: 'Texte admin' }), 'Texte admin');
  assert.match(exWhat({ name: 'Mon exo', mode: 'reps', repsMin: 5, repsMax: 5, muscles: ['dos'] }), /^Un exercice : 5 répétitions\. Sans matériel\. Muscles : dos\.$/);
});
ok('pourquoi ici : raison du générateur, sinon selon la place et le but de la séance', () => {
  const s = normalizeSession({ exercises: [ex('hang-max'), ex('pushup'), ex('wu-pulse', 'warmup')] });
  assert.equal(exWhyHere({ ...ex('pushup'), why: 'Renforcement : travaille la poussée' }, s), 'Renforcement : travaille la poussée');
  assert.match(exWhyHere(ex('wu-pulse', 'warmup'), s), /échauffement/);
  assert.match(exWhyHere(ex('hang-max'), s), /^Sert le but de la séance \(.*doigts/);
  assert.match(exWhyHere(ex('cd-breath', 'cool'), s), /retour au calme/);
  assert.equal(exWhyHere({ name: 'Perso', why: 'Pour moi' }, s), '', 'exercice perso : son « pourquoi » est son « à quoi ça sert »');
  assert.equal(exUse({ name: 'Perso', why: 'Pour moi' }), 'Pour moi');
});
console.log('Séances');
ok('séance : c’est quoi (sports, exercices, durée, parties), à quoi ça sert, pourquoi', () => {
  const s = normalizeSession({ activity: 'conditioning', sports: ['climbing_boulder'], exercises: [ex('wu-pulse', 'warmup', { part: '🔥 Échauffement' }), ex('pushup', 'main', { part: '🏋️ Renforcement' }), ex('hang-max', 'main', { part: '🧗 Bloc' })] });
  const w = sessionWhat(s, (id) => ({ conditioning: 'Renfo', climbing_boulder: 'Bloc' })[id]);
  assert.match(w, /^Une séance multi-sports de renfo et bloc : 2 exercices en ~\d+ min, en 3 parties/);
  assert.match(sessionUse(s), /^Travailler .*: surtout/);
  assert.deepEqual(sessionWhy(s), { text: '', mine: false });
  assert.deepEqual(sessionWhy({ ...s, notes: [{ title: 'Pourquoi', text: 'Mon projet' }, { title: 'Pourquoi cette séance', text: 'Auto' }] }), { text: 'Mon projet', mine: true });
  assert.equal(sessionWhy({ ...s, intentions: [{ id: 'force', p: 2 }] }, () => 'Force').text, 'Tes intentions : force.');
});
ok('séances prêtes : leur pourquoi est gardé (il était perdu à l’enregistrement)', () => {
  for (const c of CATALOG) { const s = buildSession(c); assert.equal(sessionWhy(s).text, c.why, c.id); assert.ok(sessionWhat(s).length > 10); }
});
console.log(`\n${n} tests d’explications OK`);
