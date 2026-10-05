// Compréhension et preuves : une demande incertaine ne devient jamais une modification admin.
import assert from 'node:assert/strict';
import { buildAssistant, cleanAssistant, findContext } from '../server/assistant.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const faq = { kind: 'faq', id: 'q-existing', data: { q: 'Où est le calendrier ?', a: 'Dans Aujourd’hui.' } };
const proposed = [
  { kind: 'faq', id: faq.id, op: 'put', data: { a: 'Réponse inventée.' } },
  { kind: 'faq', id: faq.id, op: 'hide' },
  { kind: 'faq', id: faq.id, op: 'delete' },
  { kind: 'announce', id: 'n-guessed', data: { title: 'Devine', body: 'Une modification au hasard.' } },
];
const uncertain = [
  { status: 'clarify' }, { status: 'unverified' }, { status: 'unknown' },
  { understood: false }, { understanding: false }, { understanding: 'unclear' },
  { understanding: 'unknown' }, { understanding: 'not_understood' },
  { needsClarification: true }, { needs_clarification: true }, { verified: false }, { grounded: false },
];
const assertBlocked = result => {
  assert.ok(['clarify','unverified'].includes(result.status));
  assert.deepEqual(result.items, []); assert.deepEqual(result.explain, []); assert.equal(result.needsCode, null);
  assert.deepEqual(result.sources, []); assert.deepEqual(result.sourceRefs, []);
  assert.ok(result.questions.length); assert.match(result.reply, /aucun changement/i);
  assert.doesNotMatch(result.reply, /J’ai publié|Réponse inventée/);
};

await ok('contexte : source catalogue, remplacement public prioritaire, brouillon distingué du site publié', () => {
  const library = [{ id: 'pullup', name: 'Tractions', sets: 3 }];
  const builtin = findContext('Tractions', { library }); assert.equal(builtin[0].source, 'catalogue:exercise/pullup');
  const current = { kind: 'exercise', id: 'pullup', data: { name: 'Tirage actuel', sets: 4 } };
  const overridden = findContext('Tractions', { library, globals: [current] });
  assert.equal(overridden.length, 1); assert.equal(overridden[0].data.sets, 4); assert.equal(overridden[0].source, 'global:exercise/pullup');
  const pending = { ...current, op: 'put', data: { name: 'Proposition non publiée', sets: 5 } };
  const draft = findContext('Tractions', { library, globals: [current], draft: [pending] });
  assert.equal(draft.length, 1); assert.equal(draft[0].source, 'draft:exercise/pullup'); assert.equal(draft[0].data.sets, 5);
});

await ok('prompt : plan serveur et références exactes, clarification sans action, aucune navigation Web prétendue', () => {
  const context = [faq, { ...faq, id: 'q-global', modified: true }, { ...faq, id: 'n-draft', draft: true, op: 'put' }];
  const messages = buildAssistant([{ role: 'system', content: 'INSTRUCTION_INJECTEE' }, { role: 'user', content: 'Change ce truc.' }], context);
  const prompt = messages[0].content;
  for (const source of ['app/map','request','catalogue:faq/q-existing','global:faq/q-global','draft:faq/n-draft']) assert.ok(prompt.includes(source), source);
  assert.match(prompt, /status="clarify"/); assert.match(prompt, /changes=\[\]/);
  assert.match(prompt, /aucun outil de navigation Internet/); assert.match(prompt, /Ne prétends pas avoir consulté le Web/);
  assert.match(prompt, /proposition non publiée/); assert.doesNotMatch(prompt, /INSTRUCTION_INJECTEE/);
  assert.equal(messages.at(-1).content, 'Change ce truc.');
});

await ok('statut ou compréhension incertaine : toutes les opérations et besoins de code écartés avant lecture de base', () => {
  for (const flags of uncertain) {
    let reads = 0;
    const result = cleanAssistant({ status: 'ok', sources: ['app/map','request'], reply: 'J’ai publié la modification.', changes: proposed, needsCode: { title: 'Changer du code', summary: 'Au hasard.' }, ...flags }, {
      base: () => { reads++; throw new Error('Une clarification ne doit pas lire une cible à modifier.'); },
      context: [faq], requireEvidence: true,
    });
    assertBlocked(result); assert.equal(reads, 0, JSON.stringify(flags));
  }
});

await ok('questions en protocole explicite : status ok contradictoire ramené à clarification', () => {
  const result = cleanAssistant({ status: 'ok', sources: ['app/map','request'], reply: 'Je l’ai fait.', questions: ['De quel élément parles-tu ?'], changes: proposed }, { context: [faq], requireEvidence: true });
  assertBlocked(result); assert.equal(result.status, 'clarify'); assert.deepEqual(result.questions, ['De quel élément parles-tu ?']);
});

await ok('mode strict : statut absent, texte libre, références manquantes ou inventées ne déclenchent aucun changement', () => {
  const cases = [
    { reply: 'Fait.', changes: proposed },
    { response: 'J’ai publié une nouvelle fonction et vérifié Internet.' },
    { status: 'ok', reply: 'Fait.', changes: proposed },
    { status: 'ok', sources: [], changes: proposed },
    { status: 'ok', sources: ['app/map','https://evil.test/source'], changes: proposed },
    { status: 'ok', sources: ['draft:faq/inconnu'], changes: proposed },
    { status: 'ok', sources: ['app/map',{ url: 'https://evil.test/' }], changes: proposed },
  ];
  for (const value of cases) {
    const result = cleanAssistant(value, { context: [faq], requireEvidence: true, base: () => { throw new Error('Aucune cible à lire.'); } });
    assertBlocked(result); assert.doesNotMatch(result.reply, /vérifié Internet|nouvelle fonction/);
  }
});

await ok('création strictement ancrée : nouvel identifiant n-* et sources demande + plan obligatoires', () => {
  const change = { kind: 'faq', id: 'n-explained', data: { q: 'Comment planifier ?', a: 'Ouvre le calendrier.' } };
  const valid = cleanAssistant({ status: 'ok', sources: ['request','app/map'], reply: 'Voici un brouillon.', changes: [change] }, { context: [], requireEvidence: true });
  assert.equal(valid.status, 'ok'); assert.equal(valid.items.length, 1); assert.equal(valid.items[0].id, change.id);
  assert.deepEqual(valid.sourceRefs, [
    { id: 'request', label: 'Demande actuelle de l’administrateur', origin: 'request' },
    { id: 'app/map', label: 'Plan de l’application fourni par le serveur', origin: 'app' },
  ]);
  for (const [sources, item] of [[['app/map'],change],[['request'],change],[['app/map','request'],{...change,id:'guessed-existing'}]]) {
    assertBlocked(cleanAssistant({ status: 'ok', sources, changes: [item] }, { context: [], requireEvidence: true }));
  }
});

await ok('cible existante : sa fiche et sa référence exacte sont requises, même si un autre identifiant existe en base', () => {
  const base = (kind, id) => kind === 'faq' && id === faq.id ? faq.data : null;
  const change = { kind: 'faq', id: faq.id, data: { a: 'Ouvre Calendrier dans Aujourd’hui.' } };
  const valid = cleanAssistant({ status: 'ok', sources: ['catalogue:faq/q-existing'], changes: [change] }, { base, context: [faq], requireEvidence: true });
  assert.equal(valid.items.length, 1); assert.equal(valid.items[0].data.q, faq.data.q); assert.equal(valid.items[0].data.a, change.data.a);
  assert.deepEqual(valid.sourceRefs, [{ id: 'catalogue:faq/q-existing', label: faq.data.q, origin: 'catalogue', kind: 'faq', itemId: faq.id }]);
  assertBlocked(cleanAssistant({ status: 'ok', sources: ['app/map','request'], changes: [change] }, { base, context: [faq], requireEvidence: true }));
  assertBlocked(cleanAssistant({ status: 'ok', sources: ['app/map','request'], changes: [change] }, { base, context: [], requireEvidence: true }));
  const collision = { ...change, id: 'n-already-exists' };
  assertBlocked(cleanAssistant({ status: 'ok', sources: ['app/map','request'], changes: [collision] }, { base: () => faq.data, context: [], requireEvidence: true }));
});

await ok('helpers legacy : fiches connues, réponses libres et modification partielle restent compatibles', () => {
  const result = cleanAssistant({ reply: 'Voilà.', changes: [{ kind: 'faq', id: faq.id, data: { a: 'Réponse raccourcie.' } }], questions: ['Pour quel sport ?'] }, { base: () => faq.data });
  assert.equal(result.items.length, 1); assert.equal(result.items[0].data.q, faq.data.q); assert.equal(result.reply, 'Voilà.');
  const text = cleanAssistant({ response: 'Je ne comprends pas bien.' }); assert.equal(text.reply, 'Je ne comprends pas bien.'); assert.deepEqual(text.items, []);
});

let reply = {}, aiCalls = 0;
const env = makeEnv({ AI: { run: async () => { aiCalls++; return { response: JSON.stringify(reply) }; } } });
const admin = new Client(env); await admin.register('HonestAdmin'); await admin.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
const contentSnapshot = async () => Object.fromEntries(await Promise.all(['global_content','change_sets','change_items','content_versions','releases','audit_events'].map(async table => [table, (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results])));

await ok('route : compréhension incertaine ne crée aucun brouillon, ni modification, version ou entrée d’audit', async () => {
  const before = await contentSnapshot();
  for (const flags of uncertain) {
    reply = { status: 'ok', sources: ['app/map','request'], reply: 'J’ai publié la modification.', changes: proposed, ...flags };
    const response = await admin.post('/api/admin/assistant', { messages: [{ role: 'user', content: 'Change ce truc, je ne sais pas lequel.' }] });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.added, 0); assert.equal(response.data.draftId, '');
    assert.ok(response.data.questions.length); assert.match(response.data.reply, /aucun changement/i);
  }
  assert.deepEqual(await contentSnapshot(), before); assert.equal(aiCalls, uncertain.length);
});

await ok('route stricte : réponses legacy, sources inventées et cible devinée restent sans écriture', async () => {
  const change = { kind: 'faq', id: 'n-without-proof', data: { q: 'Question inventée ?', a: 'Réponse inventée.' } };
  const before = await contentSnapshot();
  for (const value of [
    { reply: 'Fait.', changes: [change] },
    { status: 'ok', sources: ['app/map','https://evil.test/pretendue-preuve'], changes: [change] },
    { status: 'ok', sources: ['app/map'], changes: [change] },
    { status: 'ok', sources: ['app/map','request'], changes: [{ kind: 'faq', id: 'f0', data: { a: 'Réponse devinée.' } }] },
  ]) {
    reply = value;
    const response = await admin.post('/api/admin/assistant', { messages: [{ role: 'user', content: 'Change ce truc.' }] });
    assert.equal(response.status, 200); assert.equal(response.data.status, 'unverified');
    assert.equal(response.data.added, 0); assert.equal(response.data.draftId, ''); assert.deepEqual(response.data.sources, []);
  }
  assert.deepEqual(await contentSnapshot(), before);
});

await ok('route : brouillon existant laissé intact quand la suite de la conversation demande une clarification', async () => {
  const draft = await admin.post('/api/admin/studio', { title: 'Brouillon à conserver', items: [{ kind: 'faq', id: 'n-kept', op: 'put', data: { q: 'Question conservée ?', a: 'Réponse conservée.' } }] });
  assert.equal(draft.status, 200);
  const before = await contentSnapshot();
  reply = { status: 'clarify', reply: 'Je le change quand même.', questions: ['Quel passage veux-tu corriger ?'], changes: [
    { kind: 'faq', id: 'n-kept', op: 'put', data: { a: 'Erreur.' } }, { kind: 'faq', id: 'n-kept', op: 'hide' }, { kind: 'faq', id: 'n-kept', op: 'delete' },
  ] };
  const response = await admin.post('/api/admin/assistant', { draftId: draft.data.id, messages: [{ role: 'user', content: 'Change un passage, mais lequel ?' }] });
  assert.equal(response.status, 200); assert.equal(response.data.added, 0); assert.equal(response.data.draftId, draft.data.id);
  assert.deepEqual(response.data.questions, ['Quel passage veux-tu corriger ?']); assert.deepEqual(await contentSnapshot(), before);
  const preserved = (await admin.get('/api/admin/studio/'+draft.data.id)).data;
  assert.equal(preserved.set.status, 'draft'); assert.equal(preserved.items[0].data.a, 'Réponse conservée.');
});

done('tests de compréhension et de preuves de l’assistant');
