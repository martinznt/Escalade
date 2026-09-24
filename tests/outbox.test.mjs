import assert from 'node:assert/strict';
import { decideOutboxError, MAX_SERVER_ATTEMPTS } from '../public/outbox.js';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const op = (attempts = 0) => ({ method: 'POST', path: '/api/exercises/personal', body: {}, attempts });

console.log('decideOutboxError');
ok('hors-ligne : on rejoue plus tard, le compteur ne bouge pas', () => {
  const d = decideOutboxError(op(2), { offline: true });
  assert.equal(d.action, 'retry-later'); assert.equal(d.attempts, 2);
});
ok('401 (session) : on rejoue plus tard, le compteur ne bouge pas', () => {
  const d = decideOutboxError(op(1), { status: 401 });
  assert.equal(d.action, 'retry-later'); assert.equal(d.attempts, 1);
});
ok('429 (limite de débit) : on rejoue plus tard, le compteur ne bouge pas', () => {
  const d = decideOutboxError(op(0), { status: 429 });
  assert.equal(d.action, 'retry-later');
});
ok('erreur 4xx définitive (hors 401/429) : on écarte immédiatement, la file continue', () => {
  const d = decideOutboxError(op(0), { status: 409, message: 'Cet élément existe déjà.' });
  assert.equal(d.action, 'drop-failed'); assert.equal(d.reason, 'Cet élément existe déjà.');
});
ok('erreur serveur (5xx) sous le seuil : on rejoue plus tard, le compteur avance', () => {
  const d = decideOutboxError(op(0), { status: 500 });
  assert.equal(d.action, 'retry-later'); assert.equal(d.attempts, 1);
});
ok(`erreur serveur répétée ${MAX_SERVER_ATTEMPTS} fois : écartée pour ne pas bloquer la file`, () => {
  const d = decideOutboxError(op(MAX_SERVER_ATTEMPTS - 1), { status: 503 });
  assert.equal(d.action, 'drop-poisoned');
  assert.equal(d.attempts, MAX_SERVER_ATTEMPTS);
  assert.match(d.reason, /écartée/i);
});
ok('juste avant le seuil : encore une tentative accordée', () => {
  const d = decideOutboxError(op(MAX_SERVER_ATTEMPTS - 2), { status: 500 });
  assert.equal(d.action, 'retry-later');
});
ok('une erreur serveur transitoire suivie d’un succès ne doit jamais atteindre le seuil (test d’intégration légère)', () => {
  // Simule flush() : 2 échecs 500 puis succès — la file ne doit jamais être écartée.
  let a = 0;
  for (let i = 0; i < 2; i++) { const d = decideOutboxError(op(a), { status: 500 }); assert.equal(d.action, 'retry-later'); a = d.attempts; }
  assert.equal(a, 2);
});

console.log(`\n${n} tests OK`);
