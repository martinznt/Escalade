import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const fetchBefore = globalThis.fetch;
let value, calls = 0;
globalThis.fetch = async (url) => { assert.ok(String(url).startsWith('https://eutils.ncbi.nlm.nih.gov/')); return new Response('', { status: 503 }); };
const env = makeEnv({ AI: { run: async (_model, input) => {
  calls++; const system = input.messages[0].content;
  if (!system.includes('{"reply":"L’IA est disponible."}')) assert.ok(system.includes('app/model') || system.includes('app/map'));
  return { response: JSON.stringify(value) };
} } });
const client = new Client(env); await client.register('RemainingEvidence'); await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
const declared = { status: 'ok', basis: 'request', sources: ['request','app/model'] };
try {
  await ok('planning, séance, Studio et Lab : refus précède les opérations et tout brouillon', async () => {
    for (const [path, body, shape] of [
      ['/api/ai/agenda', { text: 'Prépare mon agenda sportif' }, { activities: [{ activityId: 'running', minutes: 30 }] }],
      ['/api/ai/session-edit', { text: 'Change ma séance', phases: [{ name: 'Course', minutes: 30 }] }, { ops: [{ op: 'total', minutes: 20 }] }],
      ['/api/admin/studio/ai', { text: 'Ajoute une annonce complète', kind: 'announce' }, { title: 'Nouvelle annonce', body: 'Un texte.' }],
      ['/api/admin/lab', { text: 'Les nouveaux ne trouvent pas le calendrier' }, { reformulation: 'Calendrier', solutions: [{ title: 'Aide', change: { kind: 'faq', data: { q: 'Où ?', a: 'Accueil' } } }] }],
    ]) {
      for (const metadata of [{}, { ...declared, question: 'Quel changement précisément ?' }, { ...declared, sources: ['request','app/model','source-inventée'] }]) {
        value = { ...shape, ...metadata };
        const response = await client.post(path, body);
        assert.equal(response.status, 422, path + ': ' + JSON.stringify(response.data));
        for (const key of ['draft','ops','lab','data','id']) assert.equal(response.data[key], undefined, key);
      }
    }
    for (const table of ['change_sets','change_items','global_content','calendar_events','history']) assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n, 0, table);
  });

  await ok('séance : les phases déclarées doivent être citées, aucune opération sans leur preuve', async () => {
    const body = { text: 'Ramène ma séance à 20 minutes', phases: [{ name: 'Course', minutes: 30 }] };
    value = { ...declared, ops: [{ op: 'total', minutes: 20 }] };
    assert.equal((await client.post('/api/ai/session-edit', body)).status, 422);
    value.sources = ['request','app/model','session/phases'];
    const response = await client.post('/api/ai/session-edit', body);
    assert.equal(response.status, 200); assert.equal(response.data.ops[0].minutes, 20);
    assert.equal(response.data.sources.find((source) => source.id === 'session/phases').kind, 'request');
    value.ops = [];
    const empty = await client.post('/api/ai/session-edit', body);
    assert.equal(empty.status, 422); assert.equal(empty.data.ops, undefined);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM user_items').first()).n, 0);
  });

  await ok('maintenance : sources exactes par signalement ; refus garde seulement regroupement local', async () => {
    await client.post('/api/bugs', { title: 'Calendrier bloqué', description: 'Le bouton ne répond pas.', page: 'home' });
    const finding = { title: 'Blocage rapporté', detail: 'Un signalement utilisateur.', proposal: 'Hypothèse : vérifier le bouton.', sources: ['report:0'] };
    value = { ...declared, sources: ['request','app/model','report:0'], findings: [finding] };
    let response = await client.post('/api/admin/maintenance', {});
    assert.equal(response.data.ai, 'ok'); assert.equal(response.data.findings[0].basis, 'reported'); assert.equal(response.data.findings[0].sources[0].id, 'report:0');
    for (const refs of [[], ['report:99'], ['https://inventé.test/']]) {
      value = { ...declared, findings: [{ ...finding, sources: refs }] };
      response = await client.post('/api/admin/maintenance', {});
      assert.equal(response.status, 200); assert.equal(response.data.ai, 'unverified'); assert.deepEqual(response.data.findings, []); assert.equal(response.data.groups[0].count, 1);
    }
    value = { ...declared, findings: [finding], question: 'Sur quel appareil le bouton bloque-t-il ?' };
    response = await client.post('/api/admin/maintenance', {});
    assert.equal(response.status, 200); assert.equal(response.data.clarification, value.question); assert.deepEqual(response.data.findings, []);
    value = { ...declared, status: 'unverified', reply: 'FAUSSE_AFFIRMATION', findings: [finding] };
    response = await client.post('/api/admin/maintenance', {});
    assert.equal(response.status, 200); assert.match(response.data.clarification, /ne sont pas vérifiables/); assert.doesNotMatch(JSON.stringify(response.data), /FAUSSE_AFFIRMATION/);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM change_sets').first()).n, 0);
  });

  await ok('connexion : une affirmation du modèle ne remplace pas la sentinelle ni un test de qualité', async () => {
    value = { reply: 'Tout est vérifié et exact.' };
    assert.equal((await client.post('/api/admin/ai/test', {})).status, 502);
    value = { reply: 'L’IA est disponible.' };
    const response = await client.post('/api/admin/ai/test', {});
    assert.equal(response.status, 200); assert.equal(response.data.status, 'ok'); assert.equal(response.data.testScope, 'connection_only'); assert.equal(response.data.sources[0].id, 'server/connection-test'); assert.ok(calls > 0);
  });
  done('tests provenance planning et administration IA');
} finally { globalThis.fetch = fetchBefore; }
