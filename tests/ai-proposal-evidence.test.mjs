import assert from 'node:assert/strict';
import { aiDraft, aiGoal, aiIntent, aiChat } from '../server/ai.js';
import { contextSources, proposalSources, proposalInstructions, requireProposalEvidence } from '../server/ai-proposal-evidence.js';
import { SOURCES } from '../public/sources.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const declared = { status: 'ok', basis: 'request', sources: ['request','app/model'] };
const request = 'Je veux préciser mon objectif sur les protéines.';
let reads = 0, currentRead = '';
// XML de transport marqué fixture : ces tests vérifient la lecture et la provenance,
// ils ne prouvent ni l’exactitude scientifique ni la disponibilité de PubMed en production.
function articleResponse(url) {
  const pmid = new URL(url).searchParams.get('id');
  const source = Object.values(SOURCES).find((value) => value.url === `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);
  assert.ok(source, 'seul un article autorisé est demandé');
  currentRead = `FIXTURE ABSTRACT READ ${++reads}: transport content sufficiently long to exercise article reading.`;
  return new Response(`<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article><ArticleTitle>${source.title}</ArticleTitle><Abstract><AbstractText>${currentRead}</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`);
}
const fetcher = async (url) => articleResponse(url);
const researchRefs = ['request','app/model','morton2018'];

await ok('sources internes et profil : provenance déclarée, sans fausse URL scientifique', () => {
  const sources = contextSources({ text: 'Ma demande', profile: 'Mon profil', model: 'Règles réellement fournies' });
  assert.deepEqual(sources.map((source) => source.kind), ['request','app','profile']);
  assert.ok(sources.every((source) => !source.url && !source.checkedAt));
  const prompt = proposalInstructions(sources);
  assert.match(prompt, /ne prouvent ni un bénéfice scientifique/); assert.match(prompt, /Règles réellement fournies/);
  assert.deepEqual(requireProposalEvidence(declared, sources).sources.map((source) => source.id), ['request','app/model']);
  assert.ok(requireProposalEvidence(declared, sources).sources.every((source) => !('excerpt' in source)));
});

await ok('statut contradictoire, références absentes/inventées et science sans article : refus sûr', () => {
  const sources = contextSources({ text: 'Une demande' });
  for (const override of [
    { status: undefined }, { status: 'inconnu' }, { status: 'unverified', reply: 'FAUSSE_AFFIRMATION' },
    { grounded: false }, { verified: false }, { understood: false }, { understanding: 'unclear' },
    { needsClarification: true }, { needs_clarification: true }, { question: 'Quel sport ?' },
    { questions: ['Quel sport ?'] }, { sources: ['request'] }, { sources: ['request','app/model','invente'] },
    { sources: ['request','app/model',{}] }, { basis: 'profile' }, { basis: 'research' },
  ]) assert.throws(() => requireProposalEvidence({ ...declared, ...override }, sources), (error) => error.status === 422 && error.aiSafe && !error.message.includes('FAUSSE_AFFIRMATION'));
  assert.throws(() => requireProposalEvidence(null, sources), (error) => error.status === 502);
});

await ok('fiche, objectif et intention : résumé réellement relu à chaque appel, jamais repris après panne', async () => {
  let value, prompt, expectRead = true;
  const env = makeEnv({ AI: { run: async (_model, input) => { prompt = input.messages[0].content; assert.equal(prompt.includes(currentRead), expectRead); return { response: JSON.stringify(value) }; } } });
  await new Client(env).register('ProposalEvidence');
  const calls = [
    [aiDraft, { kind: 'exercise', text: request }, { type: 'exercise', name: 'Demande reformulée', summary: 'À relire.' }, 'draft'],
    [aiGoal, { text: request }, { label: 'Objectif déclaré', caps: { force_jambes: 0.5 } }, null],
    [aiIntent, { text: request }, { label: 'Intention déclarée', caps: { force_jambes: 0.5 } }, null],
  ];
  for (const [run, args, data, key] of calls) {
    const before = reads;
    value = { ...declared, ...data, basis: 'research', sources: researchRefs };
    const output = await run(env, { ...args, evidenceOptions: { fetcher, now: () => new Date('2026-10-05T18:00:00Z') } }), result = key ? output[key] : output;
    assert.equal(reads, before + 1); assert.equal(result.status, 'ok');
    const source = result.sources.find((source) => source.kind === 'research');
    assert.equal(source.id, 'morton2018'); assert.equal(source.url, SOURCES.morton2018.url); assert.equal(source.checkedAt, '2026-10-05T18:00:00.000Z'); assert.equal(source.excerpt, undefined);
    expectRead = false;
    await assert.rejects(run(env, { ...args, evidenceOptions: { fetcher: async () => { reads++; return new Response('', { status: 503 }); } } }), (error) => error.status === 422);
    expectRead = true;
    assert.equal(reads, before + 2, 'la panne ne réutilise pas une source de la réponse précédente');
  }
  for (const table of ['user_items','history','calendar_events','change_sets','global_content']) assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n, 0, table);
});

await ok('trois sorties métier ambiguës pourtant valides : aucune fiche utilisable', async () => {
  let value;
  const env = makeEnv({ AI: { run: async () => ({ response: JSON.stringify(value) }) } }); await new Client(env).register('ProposalRefusal');
  for (const [run, data] of [
    [aiDraft, { type: 'exercise', name: 'Nom', summary: 'Préparée malgré le doute' }],
    [aiGoal, { label: 'But', caps: { force_jambes: 0.5 } }],
    [aiIntent, { label: 'But', caps: { force_jambes: 0.5 } }],
  ]) {
    value = { ...declared, ...data, question: 'Quel sport veux-tu pratiquer ?' };
    await assert.rejects(run(env, { text: 'Une demande ambiguë', kind: 'exercise', evidenceOptions: { fetcher: async () => { throw new Error('aucun sujet scientifique'); } } }), (error) => error.status === 422 && /Quel sport/.test(error.message));
  }
});

await ok('coach : contradiction entre ok et doute/absence de vérification écarte toute action', async () => {
  let contradiction;
  const env = makeEnv({ AI: { run: async () => ({ response: JSON.stringify({ status: 'ok', basis: 'request', sources: ['request'], reply: 'FAUSSE_AFFIRMATION', actions: [{ command: 'Fais une séance de 20 minutes' }], ...contradiction }) }) } }); await new Client(env).register('CoachContradiction');
  for (const value of [{ grounded: false }, { verified: false }, { understanding: 'unclear' }, { question: 'Quel sport ?' }, { status: 'clarify' }]) {
    contradiction = value;
    const output = await aiChat(env, { messages: [{ role: 'user', content: 'Une demande' }] });
    assert.notEqual(output.status, 'ok'); assert.deepEqual(output.actions, []); assert.deepEqual(output.sources, []); assert.ok(!output.reply.includes('FAUSSE_AFFIRMATION'));
  }
  contradiction = { status: 'clarify', question: 'Quel sport veux-tu pratiquer ?' };
  assert.equal((await aiChat(env, { messages: [{ role: 'user', content: 'Une demande' }] })).reply, contradiction.question);
});

await ok('assistant admin : article relu pour chaque demande et référence refusée après panne', async () => {
  const previousFetch = globalThis.fetch;
  let available = true, called = 0;
  globalThis.fetch = async (url) => { called++; return available ? articleResponse(url) : new Response('', { status: 503 }); };
  try {
    const env = makeEnv({ AI: { run: async (_model, input) => {
      assert.equal(input.messages[0].content.includes(currentRead), available);
      return { response: JSON.stringify({ status: 'ok', basis: 'research', sources: ['request','app/map','morton2018'], reply: 'Une proposition à relire.', changes: [{ kind: 'faq', id: 'n-protein-source', data: { q: 'Ma demande sur les protéines ?', a: 'Une proposition à relire avec son article.' } }] }) };
    } } });
    const client = new Client(env); await client.register('AdminResearch'); await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
    const body = { messages: [{ role: 'user', content: request }] };
    const first = await client.post('/api/admin/assistant', body);
    assert.equal(first.status, 200); assert.equal(first.data.status, 'ok'); assert.equal(first.data.added, 1);
    assert.equal(first.data.sources.find((source) => source.id === 'morton2018').origin, 'research');
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM global_content').first()).n, 0);
    available = false;
    const second = await client.post('/api/admin/assistant', body);
    assert.equal(second.data.status, 'unverified'); assert.equal(second.data.added, 0); assert.deepEqual(second.data.sources, []); assert.equal(called, 2);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM change_sets').first()).n, 1, 'la seconde réponse ne crée pas de brouillon');
  } finally { globalThis.fetch = previousFetch; }
});

done('tests provenance et refus des fiches IA');
