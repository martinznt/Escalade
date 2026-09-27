// tests/global.test.mjs — contenu modifié « pour tout le monde » par un administrateur (serveur),
// et application des couches dans l'app : origine → pour tout le monde → pour moi.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { cleanGlobal } from '../server/global.js';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { applyLayers } = await import('../public/global.js');
const { LIBRARY, byId } = await import('../public/library.js');
const { CATALOG } = await import('../public/catalog.js');
const { SPORT_INTENTS } = await import('../public/intentions.js');
const { PRESETS, presetParts } = await import('../public/format.js');

console.log('Validation');
await ok('exercice : champs bornés, champs inconnus ignorés, nom obligatoire', () => {
  const d = cleanGlobal('exercise', { name: '  Pompes lestées  ', sets: 99, repsMin: -3, rest: 1e9, cues: ['a', '', 'b'], evil: '<script>', caps: { gainage_anterieur: 5, 'bad key!': 1 } });
  assert.equal(d.name, 'Pompes lestées'); assert.ok(d.sets <= 30); assert.ok(d.repsMin >= 0); assert.ok(d.rest <= 3600);
  assert.deepEqual(d.cues, ['a', 'b']); assert.equal(d.evil, undefined); assert.deepEqual(d.caps, { gainage_anterieur: 1 });
  assert.equal(cleanGlobal('exercise', { name: '' }), null); assert.equal(cleanGlobal('nope', { name: 'x' }), null);
});
await ok('séance prête : au moins un exercice valide ; format : parties revalidées', () => {
  assert.equal(cleanGlobal('catalog', { name: 'S', ex: [] }), null);
  const c = cleanGlobal('catalog', { name: 'S', minutes: 999, ex: [{ libId: 'pompes', sets: 50, amount: 10, rest: 60 }, { libId: '../x' }] });
  assert.equal(c.minutes, 240); assert.equal(c.ex.length, 1); assert.equal(c.ex[0].sets, 20);
  assert.deepEqual(cleanGlobal('format', { name: 'F', parts: [{ type: 'warmup', minutes: 10 }, { type: 'zzz', minutes: 5 }] }).parts, [{ type: 'warmup', minutes: 10 }]);
});

console.log('Serveur');
const env = makeEnv();
const A = new Client(env), B = new Client(env), V = new Client(env);
await A.register('Admina'); await B.register('Bruno');
await A.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
await ok('lecture pour tous, même sans compte ; vide au départ', async () => {
  const r = await V.get('/api/global'); assert.equal(r.status, 200); assert.deepEqual(r.data.items, []);
});
await ok('un compte normal ne peut rien modifier pour tout le monde (403)', async () => {
  assert.equal((await B.put('/api/admin/global/exercise/pompes', { data: { name: 'Piraté' } })).status, 403);
  assert.equal((await V.put('/api/admin/global/exercise/pompes', { data: { name: 'Piraté' } })).status, 401);
  assert.equal((await B.del('/api/admin/global/exercise/pompes')).status, 403);
});
await ok('un administrateur modifie, ajoute, masque ; tout le monde le voit ; données nettoyées', async () => {
  assert.equal((await A.put('/api/admin/global/exercise/pompes', { data: { name: 'Pompes (modifiées)', sets: 4, extra: 'x' } })).status, 200);
  assert.equal((await A.put('/api/admin/global/catalog/run-easy', { hidden: true })).status, 200);
  assert.equal((await A.put('/api/admin/global/intent/running__seuil', { data: { label: 'Seuil tempo', emoji: '🔥' } })).status, 200);
  assert.equal((await A.put('/api/admin/global/nope/x', { data: {} })).status, 400);
  assert.equal((await A.put('/api/admin/global/exercise/pompes', { data: { name: '' } })).status, 400);
  const r = await B.get('/api/global');
  assert.equal(r.data.items.length, 3); assert.ok(r.data.ver > 0);
  const ex = r.data.items.find((x) => x.kind === 'exercise'); assert.equal(ex.data.name, 'Pompes (modifiées)'); assert.equal(ex.data.extra, undefined); assert.equal(ex.by, 'Admina');
  assert.equal(r.data.items.find((x) => x.kind === 'catalog').hidden, true);
});
await ok('retour à l’original : l’élément disparaît de la liste', async () => {
  assert.equal((await A.del('/api/admin/global/catalog/run-easy')).status, 200);
  assert.equal((await V.get('/api/global')).data.items.some((x) => x.kind === 'catalog'), false);
});

console.log('Application dans l’app');
const n0 = LIBRARY.length, c0 = CATALOG.length, first = LIBRARY.find((x) => x.role === 'main');
await ok('pour tout le monde : modifié, ajouté, masqué ; pour moi : par-dessus', () => {
  applyLayers([
    { kind: 'exercise', id: first.id, data: { name: 'Global', cues: ['c1'] } },
    { kind: 'exercise', id: 'g-new', data: { name: 'Nouveau', acts: ['conditioning'], caps: { gainage_anterieur: 1 } } },
    { kind: 'catalog', id: CATALOG[0].id, hidden: true },
    { kind: 'intent', id: 'running__seuil', data: { label: 'Seuil tempo', emoji: '🔥', caps: {} } },
    { kind: 'format', id: 'classique', data: { name: 'Classique+', parts: [{ type: 'warmup', minutes: 10 }, { type: 'main', minutes: 40 }] } },
  ], { ex: [{ id: first.id, name: 'À moi' }], cat: [] });
  assert.equal(byId(first.id).name, 'À moi', 'ma modification passe par-dessus'); assert.deepEqual(byId(first.id).cues, ['c1']);
  assert.equal(byId('g-new').name, 'Nouveau'); assert.equal(LIBRARY.length, n0 + 1);
  assert.equal(CATALOG.length, c0 - 1);
  assert.equal(SPORT_INTENTS.running.find((x) => x.id === 'seuil').label, 'Seuil tempo');
  assert.equal(PRESETS.find((p) => p[0] === 'classique')[1], 'Classique+'); assert.deepEqual(presetParts('classique', 50).map((p) => p.minutes), [10, 40]);
});
await ok('masquer un exercice : il reste connu (séances existantes) mais n’est plus proposé', () => {
  applyLayers([{ kind: 'exercise', id: first.id, hidden: true }], { ex: [], cat: [] });
  assert.ok(byId(first.id)); assert.equal(byId(first.id).hidden, true);
});
await ok('tout annulé : on retrouve exactement le contenu d’origine', () => {
  applyLayers([], { ex: [], cat: [] });
  assert.equal(LIBRARY.length, n0); assert.equal(CATALOG.length, c0); assert.equal(byId('g-new'), null); assert.notEqual(byId(first.id).name, 'À moi'); assert.ok(!byId(first.id).hidden);
  assert.equal(PRESETS.find((p) => p[0] === 'classique')[1], 'Classique');
});
done('tests du contenu global');
