// tests/community.test.mjs — intentions : propositions des utilisateurs, validation par un administrateur, visibles par tous.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { cleanIntent } from '../server/ai.js';
import { intentsFor, resolveFeel, muscleCaps, zoneRisk, keywordCaps } from '../public/intentions.js';

console.log('Intentions et propositions');
const env = makeEnv({ AI: { run: async () => ({ response: '{"label":"Talons crochets","emoji":"🦶","summary":"Utiliser le talon pour tirer.","caps":[{"id":"technique_pieds","w":0.9},{"id":"inventee","w":1}]}' }) } });
const U = new Client(env), A = new Client(env), O = new Client(env);
await U.register('grimpeur'); await A.register('chef'); await O.register('autre');
await ok('assistant : une intention écrite est reliée à des capacités connues seulement', async () => {
  const r = await U.post('/api/ai/intent', { text: 'travailler les talons crochets', activityId: 'climbing_boulder', kind: 'intent' });
  assert.equal(r.status, 200); assert.equal(r.data.intent.label, 'Talons crochets'); assert.deepEqual(Object.keys(r.data.intent.caps), ['technique_pieds']);
  assert.equal(cleanIntent({ label: 'x', caps: [{ id: 'nope' }] }), null);
});
await ok('proposition : envoyée, visible par l’auteur, jamais par un autre utilisateur ; admin requis pour la liste', async () => {
  const r = await U.post('/api/proposals', { kind: 'intent', label: 'Talons crochets', emoji: '🦶', caps: { technique_pieds: 0.9, faux: 1 }, activityId: 'climbing_boulder', detail: 'Utile en dévers' });
  assert.equal(r.status, 200);
  assert.equal((await U.get('/api/proposals/mine')).data.proposals.length, 1);
  assert.equal((await O.get('/api/proposals/mine')).data.proposals.length, 0);
  assert.equal((await U.get('/api/admin/proposals')).status, 403, 'réservé aux administrateurs');
  assert.equal((await U.post('/api/proposals', { label: 'x' })).status, 400);
});
await ok('administrateur : accepte → intention ajoutée pour tout le monde ; une seule fois', async () => {
  assert.equal((await A.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
  const list = (await A.get('/api/admin/proposals')).data.proposals; assert.equal(list.length, 1); assert.equal(list[0].username, 'grimpeur'); assert.deepEqual(Object.keys(list[0].payload.caps), ['technique_pieds']);
  assert.equal((await A.post('/api/admin/proposals/' + list[0].id, { decision: 'accept', reply: 'Merci <b>!</b>' })).status, 200);
  assert.equal((await A.post('/api/admin/proposals/' + list[0].id, { decision: 'refuse' })).status, 409, 'déjà traitée');
  const done = (await A.get('/api/admin/proposals?status=done')).data.proposals[0];
  assert.match(done.reply, /Acceptée\. Merci/); assert.ok(done.reviewer && done.reviewed_at > 0, 'historique : qui et quand');
  const ci = (await O.get('/api/community/intents')).data.intents; assert.equal(ci.length, 1); assert.equal(ci[0].label, 'Talons crochets'); assert.equal(ci[0].activityId, 'climbing_boulder');
  assert.match((await U.get('/api/proposals/mine')).data.proposals[0].reply, /Acceptée/);
  assert.equal((await U.post('/api/admin/intents', { label: 'Pirate', caps: { force_doigts: 1 } })).status, 403);
  const add = await A.post('/api/admin/intents', { label: 'Mouvements de dalle', emoji: '🧊', caps: { equilibre: 1 }, activityId: '' }); assert.equal(add.status, 200);
  assert.equal((await A.post('/api/admin/intents', { label: 'Sans capacité', caps: {} })).status, 400);
  assert.equal((await A.call('DELETE', '/api/admin/intents/' + add.data.id)).status, 200);
  assert.equal((await O.get('/api/community/intents')).data.intents.length, 1);
});
await ok('limite : 10 propositions par jour', async () => {
  let last = 0; for (let k = 0; k < 11; k++) last = (await O.post('/api/proposals', { kind: 'idea', label: 'Idée ' + k })).status;
  assert.equal(last, 429);
});
await ok('intentions par sport, muscles, zones, forme × séance voulue', async () => {
  assert.ok(intentsFor('climbing_boulder').some((i) => i.id === 'pieds' && i.caps.technique_pieds));
  assert.ok(intentsFor('climbing_boulder', [{ id: 'c1', label: 'X', caps: { equilibre: 1 }, activityId: 'running' }]).every((i) => i.id !== 'c1'), 'intention d’un autre sport ignorée');
  assert.equal(intentsFor('inconnu').length, intentsFor('conditioning').length);
  assert.ok(muscleCaps(['avantbras']).force_doigts === 1);
  assert.deepEqual(zoneRisk({ name: 'Pompes', group: 'pousser' }, ['wrists']).length, 1); assert.equal(zoneRisk({ name: 'Squat' }, ['wrists']).length, 0);
  assert.deepEqual(resolveFeel('exhausted', 'hard'), { light: true, boost: 0, feel: 'easy', note: 'Tu te sens épuisé : séance douce, même si tu avais demandé plus.' });
  assert.equal(resolveFeel('tired', 'hard').feel, 'mod'); assert.equal(resolveFeel('top', 'hard').boost, 2); assert.equal(resolveFeel('ok', 'easy').light, true);
  assert.ok(keywordCaps('je glisse des pieds sur la dalle').technique_pieds);
});
done();
