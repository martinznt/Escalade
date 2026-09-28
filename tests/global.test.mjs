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

console.log('Propositions');
await ok('proposer un système de cotation : validé, envoyé aux administrateurs ; incomplet refusé', async () => {
  assert.equal((await B.post('/api/proposals', { kind: 'grading', label: 'Unibloc', data: { name: 'Unibloc', levels: [] } })).status, 400);
  const r = await B.post('/api/proposals', { kind: 'grading', label: 'Unibloc', detail: 'ma salle', data: { name: 'Unibloc', activity: 'bloc', levels: [{ id: 'a', label: 'U1', order: 0 }, { id: 'b', label: 'U2', order: 1 }], evil: 1 } });
  assert.equal(r.status, 200);
  const list = (await A.get('/api/admin/proposals')).data.proposals; const p = list.find((x) => x.label === 'Unibloc');
  assert.ok(p); assert.equal(p.payload.data.levels.length, 2); assert.equal(p.payload.data.evil, undefined);
  assert.equal((await B.get('/api/admin/proposals')).status, 403);
});
await ok('accepter : ajouté pour tout le monde ; l’auteur reçoit la réponse ; refuser n’ajoute rien', async () => {
  const p = (await A.get('/api/admin/proposals')).data.proposals.find((x) => x.label === 'Unibloc');
  const r = await A.post(`/api/admin/proposals/${p.id}`, { decision: 'accept', reply: 'Merci' });
  assert.equal(r.status, 200); assert.match(r.data.added, /^g-/);
  const g = (await V.get('/api/global')).data.items.find((x) => x.kind === 'grading');
  assert.equal(g.data.name, 'Unibloc'); assert.equal(g.data.levels.length, 2);
  assert.match((await B.get('/api/proposals/mine')).data.proposals.find((x) => x.id === p.id).reply, /Acceptée/);
  const s2 = await B.post('/api/proposals', { kind: 'style', label: 'Aplat', data: { label: 'Aplat', activity: 'bloc' } });
  const n0 = (await V.get('/api/global')).data.items.length;
  await A.post(`/api/admin/proposals/${s2.data.id}`, { decision: 'refuse' });
  assert.equal((await V.get('/api/global')).data.items.length, n0);
});

console.log('Modifier l’app sans code');
await ok('textes, annonces, mise en page, questions, sources : validés ; lien de source https obligatoire', () => {
  assert.deepEqual(cleanGlobal('text', { from: 'Accueil', to: 'Maison' }), { from: 'Accueil', to: 'Maison' }); assert.equal(cleanGlobal('text', { from: 'x', to: '' }), null);
  assert.equal(cleanGlobal('announce', { title: '' }), null); assert.equal(cleanGlobal('announce', { title: 'Nouvelle salle', update: 1 }).emoji, '🆕');
  const l = cleanGlobal('layout', { pages: { home: [{ id: 'timer', as: 'icon' }, { id: 'bad id!', as: 'big' }] }, off: { home: ['coach', '<x>'] } });
  assert.deepEqual(l.pages.home.map((e) => e.id), ['timer']); assert.deepEqual(l.off.home, ['coach']);
  assert.equal(cleanGlobal('source', { title: 'T', url: 'javascript:alert(1)' }), null); assert.equal(cleanGlobal('source', { title: 'T', url: 'https://doi.org/x' }).year, 2020);
  assert.equal(cleanGlobal('faq', { q: 'Q ?', a: '' }), null);
});
await ok('nommer ou retirer un administrateur : réservé aux admins ; jamais zéro administrateur', async () => {
  const users = (await A.get('/api/admin/users')).data.users, bruno = users.find((x) => x.username === 'Bruno'), admina = users.find((x) => x.username === 'Admina');
  assert.equal((await B.post(`/api/admin/users/${admina.id}/role`, { admin: false })).status, 403);
  assert.equal((await A.post(`/api/admin/users/${admina.id}/role`, { admin: false })).status, 409, 'dernier administrateur : refusé');
  assert.equal((await A.post(`/api/admin/users/${bruno.id}/role`, { admin: true })).status, 200);
  assert.equal((await B.get('/api/auth/me')).data.user.isAdmin, true);
  assert.equal((await B.post(`/api/admin/users/${bruno.id}/role`, { admin: false })).status, 200);
  assert.equal((await B.get('/api/auth/me')).data.user.isAdmin, false);
});
await ok('annonce : enregistrée pour tout le monde, lisible sans compte', async () => {
  assert.equal((await A.put('/api/admin/global/announce/g-ann1', { data: { title: 'Salle ajoutée', body: 'Bloc Club' } })).status, 200);
  const a = (await V.get('/api/global')).data.items.find((x) => x.kind === 'announce'); assert.equal(a.data.title, 'Salle ajoutée');
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
await ok('textes, questions et sources appliqués puis retirés proprement', async () => {
  const { textOverrides } = await import('../public/global.js'); const { FAQ } = await import('../public/help.js'); const { SOURCES } = await import('../public/sources.js');
  const f0 = FAQ.length, s0 = Object.keys(SOURCES).length;
  applyLayers([{ kind: 'text', id: 't1', data: { from: 'Accueil', to: 'Maison' } }, { kind: 'faq', id: 'f0', data: { q: 'Q modifiée', a: 'R' } }, { kind: 'faq', id: 'g-q', data: { q: 'Nouvelle', a: 'R' } }, { kind: 'source', id: 'g-s', data: { title: 'Étude', url: 'https://x.org', year: 2024 } }, { kind: 'source', id: 'who2020', hidden: true }], { ex: [], cat: [] });
  assert.equal(textOverrides().get('Accueil'), 'Maison'); assert.equal(FAQ[0][0], 'Q modifiée'); assert.equal(FAQ.length, f0 + 1);
  assert.equal(SOURCES['g-s'].title, 'Étude'); assert.equal(SOURCES.who2020, undefined);
  applyLayers([], { ex: [], cat: [] }); assert.equal(FAQ.length, f0); assert.equal(Object.keys(SOURCES).length, s0); assert.equal(textOverrides().size, 0);
});
await ok('tout annulé : on retrouve exactement le contenu d’origine', () => {
  applyLayers([], { ex: [], cat: [] });
  assert.equal(LIBRARY.length, n0); assert.equal(CATALOG.length, c0); assert.equal(byId('g-new'), null); assert.notEqual(byId(first.id).name, 'À moi'); assert.ok(!byId(first.id).hidden);
  assert.equal(PRESETS.find((p) => p[0] === 'classique')[1], 'Classique');
});
done('tests du contenu global');
