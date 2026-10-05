// Routes réelles du Worker avec Gemini seul : transport Google simulé, SQLite/D1 réel.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { DEFAULT_MODEL, aiStatus } from '../server/ai-runtime.js';
import { GEMINI_MODEL } from '../server/gemini.js';

const KEY = 'fake-gemini-workflow-key-not-a-real-credential';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
const PRIVATE_PROFILE = 'PERFORMANCES_PRIVEES_DU_PROFIL_9f721';
const originalFetch = globalThis.fetch;
const requests = [];
let nextResponse = null, nextFailure = null, seq = 0;
const googleAnswer = data => ({ candidates: [{ content: { role: 'model', parts: [
  { thought: true, text: 'RAISONNEMENT_INTERNE' }, { text: JSON.stringify(data) },
] } }] });
const systemText = body => (body.systemInstruction?.parts || []).map(p => p.text).join('\n');
function responseFor(body) {
  const system = systemText(body), last = body.contents?.at(-1)?.parts?.map(p => p.text).join('\n') || '';
  if (system.includes('Tu es le coach de')) return { status: 'ok', basis: 'request', sources: ['request'], reply: 'Prépare une séance courte selon ta forme.', actions: [
    { command: 'Fais une séance de 20 minutes pour les jambes', label: 'Préparer cette séance' },
    { to: 'settings/admin' }, { to: 'https://evil.test/' },
  ] };
  if (system.includes('Tu interprètes une demande de')) return { activities: [
    { activityId: 'climbing_route', minutes: null, place: 'Nicole Abar', order: 'main' },
    { activityId: 'activité-inconnue', minutes: 60 },
  ], days: [2,5], confidence: 'medium' };
  if (system.includes('modification de séance en opérations')) return { ops: [
    { op: 'total', minutes: 20 }, { op: 'remove', idx: [99] }, { op: 'exécuter', command: 'interdit' },
  ] };
  if (system.includes('Transforme l\'objectif écrit')) return {
    label: 'Douze tractions', metricId: 'max_tractions', target: 12, caps: { tirage_vertical: 0.9 }, activityId: 'strength',
  };
  if (system.includes('L\'utilisateur décrit')) return { label: 'Force des jambes', summary: 'Travailler la poussée.', caps: { force_jambes: 0.8, capacité_inconnue: 1 } };
  if (system.includes('Crée la fiche d\'un exercice')) return {
    type: 'exercise', name: 'Traction stricte', summary: 'Monte sans élan.', steps: ['Tire vers la barre.'],
    caps: { tirage_vertical: 0.8, constructor: 1 }, prim: ['biceps','muscle-inconnu'], needs: ['bar','matériel-inconnu'],
  };
  if (system.includes('UNE proposition de contenu commun')) return { q: 'Où se trouve le calendrier ?', a: 'Sur la page Aujourd’hui.', champInconnu: 'ignoré' };
  if (system.includes('Tu es l’assistant d’administration')) return last.includes('Réécris la réponse')
    ? { status: 'ok', sources: ['draft:faq/n-gemini-faq'], reply: 'Je corrige le même brouillon.', changes: [{ kind: 'faq', id: 'n-gemini-faq', data: { a: 'Dans Aujourd’hui, ouvre Calendrier.' } }] }
    : { status: 'ok', sources: ['request','app/map'], reply: 'Voici une proposition à relire.', changes: [
      { kind: 'faq', id: 'n-gemini-faq', data: { q: 'Comment planifier ?', a: 'Ouvre le calendrier.' }, why: 'Aider les nouveaux.' },
      { kind: 'layout', id: 'default', data: {} },
      { kind: 'announce', id: 'n-gemini-active', data: { title: 'Piège', body: '<script>alert(1)</script>' } },
    ] };
  if (system.includes('analyser un problème ou une idée')) return {
    reformulation: 'Le calendrier est difficile à trouver.', rules: ['Garder les cinq onglets.'], questions: [],
    solutions: [{ title: 'Aide dans l’accueil', how: 'Ajouter une réponse courte.', pros: ['Simple'], cons: ['À lire'], risk: 'faible',
      change: { kind: 'faq', data: { q: 'Où est le calendrier ?', a: 'Dans Aujourd’hui.' } } }],
  };
  if (system.includes('PETITE modification du code')) return { reply: 'Relis les extraits avant de modifier.', title: '', summary: '', edits: [] };
  if (system.includes('analyser des signalements')) return { findings: [{ title: 'Le bouton du calendrier bloque', detail: 'Un signalement.', severity: 'moyen', proposal: 'Vérifier le bouton.', area: 'code' }] };
  if (system.includes('{"reply":"L’IA est disponible."}')) return { reply: 'L’IA est disponible.' };
  throw new Error('Le test ne connaît pas ce format de demande Gemini.');
}
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), ENDPOINT, 'aucun autre appel réseau n’est autorisé dans cette suite');
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
  assert.equal(new Headers(options.headers).get('x-goog-api-key'), KEY);
  const body = JSON.parse(options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.thinkingConfig.includeThoughts, false);
  assert.ok(body.generationConfig.maxOutputTokens >= 100 && body.generationConfig.maxOutputTokens <= 2400);
  assert.doesNotMatch(JSON.stringify(body), /fake-gemini-workflow-key/);
  requests.push({ url: String(url), body });
  if (nextFailure) { const error = nextFailure; nextFailure = null; throw error; }
  if (nextResponse) { const response = nextResponse; nextResponse = null; return response; }
  return Response.json(googleAnswer(responseFor(body)));
};
async function setup({ admin = false, extra = {} } = {}) {
  const env = makeEnv({ GEMINI_API_KEY: KEY, ...extra });
  assert.equal(env.AI, undefined, 'aucun binding Workers AI dans ces parcours');
  const client = new Client(env); await client.register('GemWorkflow' + (++seq));
  if (admin) assert.equal((await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
  return { env, client };
}
// Chaque cas fonctionnel simule une nouvelle minute ; les limites sont testées séparément sans remise à zéro.
const nextMinute = env => env.DB.prepare("DELETE FROM system_state WHERE key LIKE 'ai:gemini-minute:%' OR key LIKE 'ai:gemini-input:%'").run();
const chatBody = (extra = {}) => ({ messages: [{ role: 'user', content: 'Comment progresser avec peu de temps ?' }], ...extra });
const assertNoSecret = data => assert.doesNotMatch(JSON.stringify(data), /fake-gemini-workflow-key|RAISONNEMENT_INTERNE|DÉTAIL_FOURNISSEUR/);
try {
  await ok('état IA privé : membre informé du fournisseur, sans clé ni budget ni appel Google ; anonyme refusé', async () => {
    const { env, client } = await setup(), anonymous = new Client(env), before = requests.length;
    assert.equal((await anonymous.get('/api/ai/status')).status, 401);
    const state = await client.get('/api/ai/status'); assert.equal(state.status, 200);
    assert.deepEqual(Object.keys(state.data).sort(), ['available','label','provider']);
    assert.equal(state.data.available, true); assert.equal(state.data.provider, 'gemini'); assert.match(state.data.label, /Gemini/);
    assertNoSecret(state.data); assert.equal(requests.length, before);
  });

  await ok('coach Gemini : profil envoyé uniquement avec consentement explicite pour ce fournisseur', async () => {
    const { env, client } = await setup();
    for (const consent of [{}, { profileConsent: false, profileProvider: 'gemini' }, { profileConsent: true, profileProvider: 'cloudflare' }, { profileConsent: 'true', profileProvider: 'gemini' }, { profileConsent: true, profileProvider: 'gemini' }]) {
      await nextMinute(env);
      const before = requests.length, response = await client.post('/api/ai/chat', chatBody({ profile: PRIVATE_PROFILE, ...consent }));
      assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(requests.length, before + 1);
      const shouldShare = consent.profileConsent === true && consent.profileProvider === 'gemini';
      assert.equal(JSON.stringify(requests.at(-1).body).includes(PRIVATE_PROFILE), shouldShare);
      assert.equal(response.data.actions.length, 1); assert.match(response.data.actions[0].summary, /20 min/);
      assertNoSecret(response.data); assert.doesNotMatch(JSON.stringify(response.data), /evil\.test|settings\/admin/);
    }
    assert.equal((await client.get('/api/history')).data.history.length, 0);
    assert.equal((await client.get('/api/calendar')).data.events.length, 0);
  });

  await ok('objectif Gemini : résumé du profil exclu sans consentement explicite pour Gemini', async () => {
    const { env, client } = await setup();
    for (const consent of [{}, { profileConsent: false, profileProvider: 'gemini' }, { profileConsent: true, profileProvider: 'cloudflare' }, { profileConsent: 'true', profileProvider: 'gemini' }, { profileConsent: true, profileProvider: 'gemini' }]) {
      await nextMinute(env);
      const response = await client.post('/api/ai/goal', { text: 'Faire 12 tractions', profile: PRIVATE_PROFILE, ...consent });
      assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.goal.target, 12);
      const shouldShare = consent.profileConsent === true && consent.profileProvider === 'gemini';
      assert.equal(JSON.stringify(requests.at(-1).body).includes(PRIVATE_PROFILE), shouldShare);
    }
    assert.equal((await client.get('/api/sync')).data.items.length, 0);
  });

  await ok('Gemini seul : agenda, fiche d’exercice, objectif et intention validés sans sauvegarde implicite', async () => {
    const { env, client } = await setup();
    let response = await client.post('/api/ai/agenda', { text: 'Voie les mardis et vendredis à Nicole Abar', kind: 'planning' });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.deepEqual(response.data.draft.days, [2,5]);
    assert.equal(response.data.draft.activities.length, 1); assert.equal(response.data.draft.activities[0].place, 'Nicole Abar'); assert.equal(response.data.draft.activities[0].minutes, '');
    await nextMinute(env); response = await client.post('/api/ai/draft', { text: 'une traction stricte', kind: 'exercise' });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.draft.name, 'Traction stricte');
    assert.deepEqual(response.data.draft.caps, { tirage_vertical: 0.8 }); assert.deepEqual(response.data.draft.prim, ['biceps']); assert.deepEqual(response.data.draft.needs, ['bar']);
    await nextMinute(env); response = await client.post('/api/ai/goal', { text: 'Faire 12 tractions' });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.goal.target, 12); assert.equal(response.data.goal.metricId, 'max_tractions');
    await nextMinute(env); response = await client.post('/api/ai/intent', { text: 'Travailler les jambes' });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.deepEqual(response.data.intent.caps, { force_jambes: 0.8 });
    assert.equal((await client.get('/api/history')).data.history.length, 0); assert.equal((await client.get('/api/calendar')).data.events.length, 0);
    assert.equal((await client.get('/api/sync')).data.items.length, 0);
    assert.equal((await aiStatus(env)).used, 4);
  });

  await ok('modification de séance Gemini : opérations utiles, indices et types inconnus filtrés, séance inchangée', async () => {
    const { client } = await setup();
    const response = await client.post('/api/ai/session-edit', { text: 'Ramène cette séance à 20 minutes', phases: [{ name: 'Jambes', role: 'force', minutes: 30 }] });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.ops.length, 1);
    assert.equal(response.data.ops[0].op, 'total'); assert.equal(response.data.ops[0].minutes, 20);
    assert.equal((await client.get('/api/sync')).data.items.length, 0); assertNoSecret(response.data);
  });

  await ok('administration Gemini : disponibilité et test de connexion, accès intelligence vérifié', async () => {
    const { env, client } = await setup({ admin: true }), member = new Client(env), content = new Client(env);
    await member.register('GemMember'+seq); await content.register('GemContent'+seq);
    await content.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
    const id = (await content.get('/api/auth/me')).data.user.id;
    await client.post(`/api/admin/users/${id}/roles`, { roles: ['content'] });
    const before = requests.length, state = await client.get('/api/admin/ai');
    assert.equal(state.status, 200); assert.equal(state.data.available, true); assert.equal(state.data.model, GEMINI_MODEL); assert.equal(state.data.unit, 'requests'); assert.equal(state.data.budget, 40); assertNoSecret(state.data);
    assert.equal((await member.post('/api/admin/ai/test', {})).status, 403); assert.equal((await content.post('/api/admin/ai/test', {})).status, 403); assert.equal(requests.length, before);
    const test = await client.post('/api/admin/ai/test', {}); assert.equal(test.status, 200, JSON.stringify(test.data));
    assert.equal(test.data.reply, 'L’IA est disponible.'); assert.equal(test.data.provider, 'gemini'); assert.equal(test.data.used, 1); assert.equal(requests.at(-1).body.generationConfig.maxOutputTokens, 100); assertNoSecret(test.data);
  });

  await ok('Studio Gemini : contenu nettoyé et rangé en brouillon, publication toujours explicite', async () => {
    const { env, client } = await setup({ admin: true }), member = new Client(env); await member.register('GemStudioMember'+seq);
    const before = requests.length;
    assert.equal((await member.post('/api/admin/studio/ai', { kind: 'faq', text: 'Explique le calendrier' })).status, 403);
    assert.equal((await client.post('/api/admin/studio/ai', { kind: 'layout', text: 'Cache tous les onglets' })).status, 400); assert.equal(requests.length, before);
    const response = await client.post('/api/admin/studio/ai', { kind: 'faq', target: 'g-gemini-calendar', text: 'Explique où est le calendrier' });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.data.champInconnu, undefined);
    const draft = (await client.get('/api/admin/studio/'+response.data.id)).data;
    assert.equal(draft.set.status, 'draft'); assert.equal(draft.items[0].id, 'g-gemini-calendar'); assert.match(draft.items[0].data.a, /Aujourd’hui/);
    assert.ok(!(await member.get('/api/global')).data.items.some(x => x.id === 'g-gemini-calendar'));
    assert.equal((await client.post('/api/admin/studio/'+response.data.id+'/publish', {})).status, 400);
  });

  await ok('assistant administrateur Gemini : types validés, publication du contenu actif refusée, même brouillon suivi', async () => {
    const { env, client } = await setup({ admin: true }), member = new Client(env); await member.register('GemAssistantMember'+seq);
    const before = requests.length;
    assert.equal((await member.post('/api/admin/assistant', { messages: [{ role: 'user', content: 'Ajoute une FAQ' }] })).status, 403); assert.equal(requests.length, before);
    const first = await client.post('/api/admin/assistant', { messages: [{ role: 'user', content: 'Ajoute une question pour planifier' }] });
    assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.added, 2); assert.equal(first.data.rejected.length, 1); assertNoSecret(first.data);
    const refused = await client.post('/api/admin/studio/'+first.data.draftId+'/publish', { confirm: true });
    assert.equal(refused.status, 422); assert.ok(refused.data.checks.some(check => check.id === 'active' && !check.ok));
    await nextMinute(env);
    const second = await client.post('/api/admin/assistant', { draftId: first.data.draftId, messages: [
      { role: 'user', content: 'Ajoute une question pour planifier' }, { role: 'assistant', content: first.data.reply }, { role: 'user', content: 'Réécris la réponse plus précisément' },
    ] });
    assert.equal(second.status, 200, JSON.stringify(second.data)); assert.equal(second.data.draftId, first.data.draftId);
    const draft = (await client.get('/api/admin/studio/'+first.data.draftId)).data;
    assert.equal(draft.set.status, 'draft'); assert.equal(draft.items.length, 2);
    const faq = draft.items.find(item => item.id === 'n-gemini-faq');
    assert.equal(faq.data.q, 'Comment planifier ?'); assert.equal(faq.data.a, 'Dans Aujourd’hui, ouvre Calendrier.');
    assert.ok(!(await member.get('/api/global')).data.items.some(x => ['n-gemini-faq','n-gemini-active'].includes(x.id)));
  });

  await ok('Laboratoire, code et maintenance Gemini : propositions consultables, aucun contenu publié ni code enregistré', async () => {
    const { env, client } = await setup({ admin: true });
    let response = await client.post('/api/admin/lab', { text: 'Les utilisateurs ne trouvent pas le calendrier' });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.lab.solutions[0].change.kind, 'faq');
    await nextMinute(env); response = await client.post('/api/admin/assistant/code', { messages: [{ role: 'user', content: 'Explique le bouton Calendrier' }] });
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.edits.length, 0); assert.equal(response.data.diff, '');
    await client.post('/api/bugs', { title: 'Calendrier bloqué', description: 'Le bouton ne répond plus.', page: 'home' });
    await nextMinute(env); response = await client.post('/api/admin/maintenance', {});
    assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.data.ai, 'ok'); assert.equal(response.data.open, 1); assert.equal(response.data.findings.length, 1);
    for (const table of ['change_sets','code_proposals','global_content']) assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n, 0, table);
  });

  await ok('fournisseur changé pendant le message : coach et objectif refusent avant envoi du profil ou réservation', async () => {
    for (const [path, body] of [
      ['/api/ai/chat', chatBody({ profile: PRIVATE_PROFILE, profileConsent: true, profileProvider: 'gemini' })],
      ['/api/ai/goal', { text: 'Faire 12 tractions', profile: PRIVATE_PROFILE, profileConsent: true, profileProvider: 'gemini' }],
    ]) {
    const { env, client } = await setup(), prepare = env.DB.prepare, before = requests.length;
    let reads = 0;
    env.DB.prepare = sql => {
      const statement = prepare(sql);
      if (sql !== 'SELECT value FROM system_state WHERE key=?') return statement;
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values); if (values[0] !== 'ai:config') return bound;
        const first = bound.first.bind(bound);
        bound.first = async () => {
          if (++reads === 2) await prepare('INSERT INTO system_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('ai:config', JSON.stringify({ model: DEFAULT_MODEL, budget: 8000 })).run();
          return first();
        };
        return bound;
      };
      return statement;
    };
    let response;
    try { response = await client.post(path, body); }
    finally { env.DB.prepare = prepare; }
    // Les préférences peuvent relire la configuration ; seule la transition réelle et son refus comptent.
    assert.ok(reads >= 2); assert.equal(response.status, 409, JSON.stringify(response.data)); assert.match(response.data.error, /modèle.*changé/);
    assert.equal(requests.length, before); assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM system_state WHERE key LIKE 'ai:gemini:%' OR key LIKE 'ai:budget:%'").first()).n, 0); assertNoSecret(response.data);
    }
  });

  await ok('quota Google et erreurs fournisseur : une tentative, messages sûrs, aucune clé ni réponse interne renvoyée', async () => {
    for (const status of [429,401,403,404,500]) {
      const { env, client } = await setup(), before = requests.length;
      nextResponse = Response.json({ error: { message: 'DÉTAIL_FOURNISSEUR '+KEY } }, { status });
      const response = await client.post('/api/ai/chat', chatBody());
      assert.equal(response.status, status === 429 ? 429 : 503); assert.equal(!!response.data.quota, status === 429); assertNoSecret(response.data);
      assert.equal(requests.length, before + 1); assert.equal((await aiStatus(env)).used, 1);
    }
    const { client } = await setup(); nextFailure = new Error('DÉTAIL_FOURNISSEUR '+KEY);
    const response = await client.post('/api/ai/chat', chatBody()); assert.equal(response.status, 503); assertNoSecret(response.data);
  });

  await ok('réserve Gemini quotidienne commune : autre fonction bloquée avant Google, formulaire et historique intacts', async () => {
    const { env, client } = await setup({ extra: { GEMINI_DAILY_BUDGET: 1 } });
    assert.equal((await client.post('/api/ai/chat', chatBody())).status, 200);
    const before = requests.length, response = await client.post('/api/ai/agenda', { text: 'Voie mardi soir' });
    assert.equal(response.status, 429, JSON.stringify(response.data)); assert.equal(response.data.quota, true); assert.match(response.data.error, /formulaires/);
    assert.equal(requests.length, before); assert.equal((await aiStatus(env)).used, 1);
    assert.equal((await client.get('/api/calendar')).data.events.length, 0); assert.equal((await client.get('/api/history')).data.history.length, 0);
  });

  done('tests des parcours Gemini');
} finally {
  globalThis.fetch = originalFetch;
}
