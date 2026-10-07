import assert from 'node:assert/strict';
import { cleanItem } from '../public/items.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const base = { title: 'Travail de pieds', hypothesis: 'Observer ma précision', startDate: '2026-10-01', weeks: 4, status: 'running', before: { value: 4, note: 'Repère déclaré avant', date: 1000 }, after: { value: 5, note: 'Repère déclaré après', date: 2000 } };
const env = makeEnv(), owner = new Client(env), other = new Client(env);
await owner.register('PersonalLabOwner'); await other.register('PersonalLabOther');

await ok('ancienne expérience : mesures et notes conservées, nouveaux champs facultatifs', () => {
  const item = cleanItem({ c: 'lab', id: 'lab-old', u: 1, d: base });
  assert.equal(item.d.protocol, ''); assert.equal(item.d.notes, '');
  assert.deepEqual(item.d.before, base.before); assert.deepEqual(item.d.after, base.after);
});
await ok('protocole et notes : taille bornée et stockage distinct de l’hypothèse et de la conclusion', () => {
  const item = cleanItem({ c: 'lab', id: 'lab-fields', u: 1, d: { ...base, protocol: 'p'.repeat(1600), notes: 'n'.repeat(1300), conclusion: 'Résultat à interpréter prudemment.' } });
  assert.equal(item.d.protocol.length, 1200); assert.equal(item.d.notes.length, 1000);
  assert.equal(item.d.hypothesis, base.hypothesis); assert.equal(item.d.conclusion, 'Résultat à interpréter prudemment.');
});
await ok('vrai Worker : aller-retour, mise à jour d’une ancienne expérience et isolation entre comptes', async () => {
  const first = await owner.post('/api/items', { changes: [{ c: 'lab', id: 'lab-roundtrip', u: 1000, d: base }] }); assert.equal(first.status, 200);
  const initial = (await owner.get('/api/items')).data.items.find((item) => item.c === 'lab');
  const updated = { ...initial.d, protocol: 'Deux séances de technique par semaine pendant quatre semaines.', notes: 'Observer le placement des pieds ; noter aussi la fatigue.' };
  assert.equal((await owner.post('/api/items', { changes: [{ c: 'lab', id: initial.id, u: 2000, d: updated }] })).status, 200);
  const stored = (await owner.get('/api/items')).data.items.filter((item) => item.c === 'lab');
  assert.equal(stored.length, 1); assert.equal(stored[0].d.protocol, updated.protocol); assert.equal(stored[0].d.notes, updated.notes);
  assert.deepEqual(stored[0].d.before, base.before); assert.deepEqual(stored[0].d.after, base.after);
  assert.equal((await other.get('/api/items')).data.items.filter((item) => item.c === 'lab').length, 0);
});
done('tests Lab personnel');
