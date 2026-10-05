// Contrats du coach et preuve documentaire : SQLite et fournisseurs simulés, aucun réseau réel.
import assert from 'node:assert/strict';
import { aiChat } from '../server/ai.js';
import { SOURCES } from '../public/sources.js';
import { makeEnv, ok, done } from './helpers.mjs';

const action = { to: 'settings/help', label: 'Ouvrir l’aide' };
const qwen = (value) => ({ choices: [{ message: { content: JSON.stringify(value), reasoning_content: 'PENSEE-PRIVEE-EXCLUE' } }] });
const checkedAt = '2026-10-05T12:34:56.000Z';
const source = SOURCES.who2020;
const pmid = new URL(source.url).pathname.split('/')[1];
const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const abstract = 'Résumé documentaire reçu dans le test. Les recommandations concernent l’activité physique et la sédentarité ; elles distinguent les populations et les limites.';
const xml = (title = source.title) => `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article><ArticleTitle>${escapeXml(title)}</ArticleTitle><Abstract><AbstractText>${abstract}</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`;
function setup(answer) {
  let calls = 0, input;
  const env = makeEnv({ AI: { run: async (_model, payload) => { calls++; input = payload; return typeof answer === 'function' ? answer(payload) : qwen(answer); } } });
  env.DB.raw.exec('CREATE TABLE system_state (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  return { env, calls: () => calls, input: () => input };
}
function evidence(fetcher = async () => new Response('Indisponible', { status: 503 })) { return { fetcher, timeoutMs: 5, now: () => new Date(checkedAt) }; }
const ask = (test, { question = 'Où se trouve mon calendrier ?', profile = '', evidenceOptions = evidence() } = {}) => aiChat(test.env, { messages: [{ role: 'user', content: question }], profile, appMap: 'Calendrier : Accueil > Planning. Aide : Paramètres > Aide.', evidenceOptions });
const valid = (overrides = {}) => ({ status: 'ok', basis: 'app', sources: ['app/map'], reply: 'Le calendrier se trouve dans Accueil > Planning.', actions: [action], ...overrides });
const noAction = (response, status) => { assert.equal(response.status, status); assert.deepEqual(response.actions, []); assert.deepEqual(response.sources, []); };

await ok('sources locales : plan actuel et demande fournis, réponse et boutons relus', async () => {
  for (const [basis, id] of [['app', 'app/map'], ['request', 'request']]) {
    const test = setup(valid({ basis, sources: [id], actions: [action, { to: 'settings/admin' }, { to: 'https://evil.test/' }] }));
    const response = await ask(test);
    assert.equal(response.status, 'ok'); assert.equal(response.reply, 'Le calendrier se trouve dans Accueil > Planning.');
    assert.equal(response.sources.length, 1); assert.equal(response.sources[0].id, id); assert.equal(response.sources[0].kind, basis);
    assert.equal(response.sources[0].url, undefined); assert.equal(response.sources[0].excerpt, undefined);
    assert.equal(response.actions.length, 1); assert.equal(response.actions[0].to, 'settings/help');
    assert.match(test.input().messages[0].content, /Calendrier : Accueil > Planning/);
    assert.doesNotMatch(JSON.stringify(response), /PENSEE-PRIVEE|evil\.test|settings\/admin/);
    assert.equal((await test.env.DB.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first()).n, 1, 'les suggestions ne créent aucune table ou donnée de séance');
  }
});

await ok('profil : source personnelle présente seulement quand un résumé est fourni', async () => {
  const test = setup(valid({ basis: 'profile', sources: ['profile'], reply: 'Tu as déclaré pratiquer la natation.' }));
  const response = await ask(test, { profile: 'Sport déclaré : natation' });
  assert.equal(response.status, 'ok'); assert.equal(response.sources[0].kind, 'profile'); assert.match(test.input().messages[0].content, /Sport déclaré : natation/);
  noAction(await ask(setup(valid({ basis: 'profile', sources: ['profile'] }))), 'unverified');
});

await ok('article réellement reçu : titre, PMID, extrait et URL PubMed ajoutés par le serveur', async () => {
  const urls = [], test = setup(valid({ basis: 'research', sources: ['who2020'], reply: 'Voici les limites de la recommandation : https://invented.test/garantie', actions: [] }));
  const fetcher = async (url, options) => { const parsed = new URL(url); assert.equal(parsed.origin, 'https://eutils.ncbi.nlm.nih.gov'); assert.equal(parsed.searchParams.get('id'), pmid); assert.equal(parsed.searchParams.get('db'), 'pubmed'); assert.equal(options.redirect, 'error'); urls.push(url); return new Response(xml(), { headers: { 'Content-Type': 'application/xml' } }); };
  const response = await ask(test, { question: 'Activité physique : que dit l’OMS ?', evidenceOptions: evidence(fetcher) });
  assert.equal(response.status, 'ok'); assert.deepEqual(response.sources, [{ id: 'who2020', label: source.title, url: source.url, kind: 'research', checkedAt }]);
  assert.equal(urls.length, 1); assert.match(test.input().messages[0].content, new RegExp(abstract.slice(0, 40))); assert.doesNotMatch(JSON.stringify(response), /invented\.test|PENSEE-PRIVEE-EXCLUE/); assert.match(response.reply, /\[voir les sources\]/);
});

await ok('chaque réponse consulte de nouveau le document : aucun ancien article présenté comme relu', async () => {
  let reads = 0, now = checkedAt;
  const test = setup(valid({ basis: 'research', sources: ['who2020'], actions: [] }));
  const options = { ...evidence(async () => { reads++; return new Response(xml()); }), now: () => new Date(now) };
  const first = await ask(test, { question: 'Activité physique OMS', evidenceOptions: options });
  now = '2026-10-06T00:01:00.000Z'; const second = await ask(test, { question: 'Activité physique OMS', evidenceOptions: options });
  assert.equal(reads, 2); assert.notEqual(first.sources[0].checkedAt, second.sources[0].checkedAt); assert.equal(second.sources[0].checkedAt, now);
});

await ok('article absent, erreur, titre incorrect et délai : aucune source de recherche fabriquée', async () => {
  const fetchers = [async () => new Response('Indisponible', { status: 503 }), async () => { throw new Error('secret-reseau'); }, async () => new Response(xml('Une autre étude sans rapport')), async () => new Promise(() => {})];
  for (const fetcher of fetchers) {
    const test = setup(valid({ basis: 'research', sources: ['who2020'], reply: 'CONSEIL-CERTAIN-SANS-PREUVE' }));
    const response = await ask(test, { question: 'Activité physique OMS', evidenceOptions: evidence(fetcher) });
    noAction(response, 'unverified'); assert.doesNotMatch(response.reply, /CONSEIL-CERTAIN|secret-reseau/); assert.equal(test.calls(), 1);
  }
});

await ok('clarification ou information non vérifiée : aucune action même si le modèle en ajoute', async () => {
  for (const status of ['clarify', 'unverified']) {
    const response = await ask(setup(valid({ status, reply: 'Peux-tu préciser le lieu dont tu parles ?', sources: ['https://invented.test/source'] })));
    noAction(response, status); assert.doesNotMatch(JSON.stringify(response), /invented\.test/);
  }
});

await ok('statut absent, inconnu ou hérité : réponse prudente sans certitude inventée', async () => {
  for (const status of [undefined, 'autre', 'constructor', 'toString', '__proto__']) {
    const answer = valid({ status, reply: 'CERTITUDE-MODELE-A-NE-PAS-AFFICHER' });
    if (status === undefined) delete answer.status;
    const response = await ask(setup(answer)); noAction(response, 'unverified'); assert.doesNotMatch(response.reply, /CERTITUDE-MODELE/);
  }
});

await ok('source inconnue ou URL inventée : aucun bouton malgré une référence valide', async () => {
  for (const sources of [['inconnue'], ['app/map', 'inconnue'], ['https://pubmed.ncbi.nlm.nih.gov/33239350/'], ['constructor'], ['__proto__']]) {
    const response = await ask(setup(valid({ sources, reply: 'AFFIRMATION-REFUSEE' }))); noAction(response, 'unverified'); assert.doesNotMatch(response.reply, /AFFIRMATION-REFUSEE/);
  }
});

await ok('base de réponse et référence doivent correspondre : app, profil et recherche distincts', async () => {
  for (const [basis, sources] of [['research', ['app/map']], ['profile', ['request']], ['app', ['request']], ['inconnue', ['app/map']], ['constructor', ['app/map']], ['__proto__', ['request']]]) {
    const response = await ask(setup(valid({ basis, sources }))); noAction(response, 'unverified');
  }
});

await ok('incompréhension explicite avec statut ok : question honnête remplace la fausse certitude', async () => {
  for (const field of [{ understood: false }, { needsClarification: true }]) {
    const response = await ask(setup(valid({ ...field, reply: 'FAUSSE-CERTITUDE-DEMANDE-COMPRISE' }))); noAction(response, 'clarify'); assert.doesNotMatch(response.reply, /FAUSSE-CERTITUDE/); assert.match(response.reply, /précis|savoir/i);
  }
});

await ok('texte non JSON, réponse absente ou objet à la place du texte : erreur exploitable sans repli inventé', async () => {
  for (const raw of ['Réponse libre qui prétend tout savoir.', '{cassé', JSON.stringify({ status: 'ok', reply: { text: 'pas une chaîne' } }), JSON.stringify({ status: 'ok', sources: ['app/map'] })]) {
    const test = setup(() => ({ choices: [{ message: { content: raw, reasoning_content: 'secret' } }] }));
    await assert.rejects(ask(test), (e) => e.status === 502 && e.aiSafe === true && !/secret|Réponse libre/.test(e.message));
  }
});

await ok('texte et actions : HTML neutralisé, lien modèle remplacé, aucune destruction suggérée', async () => {
  const response = await ask(setup(valid({ reply: '<img src=x onerror=1>Lis https://evil.test/source', actions: [{ command: 'Supprime ma dernière séance' }, { to: 'settings/admin' }, { to: 'https://evil.test/' }, action] })));
  assert.equal(response.status, 'ok'); assert.equal(response.actions.length, 1); assert.doesNotMatch(response.reply, /<img|evil\.test/); assert.doesNotMatch(JSON.stringify(response.actions), /Supprime|admin|evil/);
});

await ok('liste de sources mal formée : les objets ne sont pas effacés pour sauver une réponse non vérifiable', async () => {
  for (const sources of [['app/map', { id: 'forged', url: source.url }], ['app/map', null], ['app/map', 1], ['app/map', true]]) {
    const response = await ask(setup(valid({ sources, reply: 'AFFIRMATION-MAL-FORMEE' }))); noAction(response, 'unverified'); assert.doesNotMatch(response.reply, /AFFIRMATION-MAL-FORMEE/);
  }
});

done('tests honnêteté et sources du coach');
