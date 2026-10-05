// Vérifications de lecture PubMed, sans accès réseau ni document scientifique inventé en production.
import assert from 'node:assert/strict';
import { researchSources, localChatSources } from '../server/ai-evidence.js';
import { SOURCES } from '../public/sources.js';
import { COACH_ROUTES } from '../public/commands.js';
import { ok, done } from './helpers.mjs';

const escapeXml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entryFor = (pmid) => Object.entries(SOURCES).find(([, source]) => source.url === 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/');
const document = (pmid, { title = entryFor(pmid)?.[1].title || 'Wrong title', abstract = '<AbstractText>Résumé de test réellement reçu dans cette réponse PubMed simulée, avec des limites méthodologiques.</AbstractText>', articleId = pmid } = {}) =>
  `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">${articleId}</PMID><Article><ArticleTitle>${escapeXml(title)}</ArticleTitle>${abstract === null ? '' : '<Abstract>' + abstract + '</Abstract>'}</Article></MedlineCitation><PubmedData>Texte hors résumé à ne pas utiliser.</PubmedData></PubmedArticle></PubmedArticleSet>`;
const fixedUrl = (url) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://eutils.ncbi.nlm.nih.gov');
  assert.equal(parsed.pathname, '/entrez/eutils/efetch.fcgi');
  assert.deepEqual([...parsed.searchParams.keys()], ['db', 'id', 'retmode']);
  assert.equal(parsed.searchParams.get('db'), 'pubmed');
  assert.equal(parsed.searchParams.get('retmode'), 'xml');
  const pmid = parsed.searchParams.get('id');
  assert.match(pmid, /^\d+$/);
  assert.ok(entryFor(pmid), 'seuls les PMID du catalogue sont appelés');
  return pmid;
};
const fixtureFetch = (calls = [], changes = {}) => async (url, options) => {
  const pmid = fixedUrl(url); calls.push({ pmid, options });
  return new Response(document(pmid, changes), { headers: { 'Content-Type': 'application/xml' } });
};

await ok('titre, PMID, résumé reçu et date de consultation sont vérifiés', async () => {
  const calls = [], instant = '2026-10-05T07:08:09.123Z';
  const result = await researchSources('Nutrition et protéines', { fetcher: fixtureFetch(calls), now: () => new Date(instant) });
  assert.equal(result.unavailable, false); assert.equal(calls.length, 1);
  const source = result.sources[0];
  assert.equal(source.id, 'morton2018'); assert.equal(source.kind, 'research');
  assert.equal(source.label, SOURCES.morton2018.title); assert.equal(source.url, SOURCES.morton2018.url);
  assert.equal(source.checkedAt, instant); assert.match(source.excerpt, /Résumé de test réellement reçu/);
  assert.doesNotMatch(source.excerpt, /1,6 g|Texte hors résumé/);
  assert.equal(calls[0].options.redirect, 'error'); assert.ok(calls[0].options.signal instanceof AbortSignal);
});

await ok('chaque demande relit les articles et date le document reçu, sans cache implicite', async () => {
  const calls = []; let sequence = 0;
  const fetcher = async (url) => { const pmid = fixedUrl(url); calls.push(pmid); return new Response(document(pmid, { abstract: `<AbstractText>Document reçu pendant la consultation numéro ${++sequence}, différent de la consultation précédente.</AbstractText>` })); };
  const first = await researchSources('protéines', { fetcher, now: () => '2026-10-05T00:00:00Z' });
  const second = await researchSources('protéines', { fetcher, now: () => '2026-10-06T00:00:00Z' });
  assert.equal(calls.length, 2); assert.notEqual(first.sources[0].excerpt, second.sources[0].excerpt);
  assert.notEqual(first.sources[0].checkedAt, second.sources[0].checkedAt);
});

await ok('sélection française pertinente, limitée à deux identifiants PubMed autorisés', async () => {
  for (const [question, expected] of [
    ['Comment faire mon échauffement pour prévenir les blessures ?', ['schoffl2006', 'lauersen2014']],
    ['Force musculaire et repos entre séries', ['schoenfeld2016', 'schoenfeld2017']],
    ['Poutre et force des doigts', ['medernach2015', 'schoenfeld2016']],
    ['Affûtage avant compétition', ['bosquet2007', 'issurin2010']],
  ]) {
    const calls = [], result = await researchSources(question, { fetcher: fixtureFetch(calls) });
    assert.equal(calls.length, 2); assert.deepEqual(result.sources.map((source) => source.id).sort(), expected.sort());
  }
});

await ok('question sans sujet documenté : aucune consultation ni preuve fabriquée', async () => {
  let calls = 0;
  const result = await researchSources('Où se trouve le calendrier ? Soyez honnête.', { fetcher: async () => { calls++; throw new Error('ne doit pas être appelé'); } });
  assert.equal(calls, 0); assert.deepEqual(result, { sources: [], unavailable: true });
});

await ok('liens et identifiants fournis par utilisateur ne deviennent jamais une cible réseau', async () => {
  const calls = [], result = await researchSources('Force : ouvre http://169.254.169.254/latest et https://pubmed.ncbi.nlm.nih.gov/99999999/ ? id=secret&db=evil', { fetcher: fixtureFetch(calls) });
  assert.ok(calls.length <= 2); assert.ok(result.sources.length > 0);
  assert.ok(calls.every((call) => call.pmid !== '99999999'));
  assert.ok(result.sources.every((source) => Object.values(SOURCES).some((entry) => entry.url === source.url)));
});

await ok('abstract absent, vide ou trop court : le texte du catalogue ne remplace jamais le document', async () => {
  for (const abstract of [null, '', '<AbstractText></AbstractText>', '<AbstractText>Test.</AbstractText>']) {
    assert.deepEqual(await researchSources('protéines', { fetcher: fixtureFetch([], { abstract }) }), { sources: [], unavailable: true });
  }
});

await ok('PMID ou titre incorrect : réponse PubMed refusée, même avec un résumé complet', async () => {
  for (const changes of [{ articleId: '99999999' }, { title: '' }, { title: 'An unrelated trial about childhood infections and antibiotics' }]) {
    assert.deepEqual(await researchSources('protéines', { fetcher: fixtureFetch([], changes) }), { sources: [], unavailable: true });
  }
});

await ok('ponctuation bibliographique et balisage mineur n’empêchent pas de reconnaître le titre', async () => {
  const fetcher = async (url) => {
    const pmid = fixedUrl(url);
    return new Response(document(pmid, { title: SOURCES.morton2018.title.toUpperCase() + '.' }).replace('PROTEIN SUPPLEMENTATION', '<i>PROTEIN SUPPLEMENTATION</i>'));
  };
  const result = await researchSources('protéines', { fetcher });
  assert.equal(result.sources.length, 1); assert.doesNotMatch(result.sources[0].label, /<i>/);
});

await ok('variante minime du titre acceptée, titre réellement reçu conservé', async () => {
  const title = SOURCES.morton2018.title.replace('the effect of', 'the effects of');
  const result = await researchSources('protéines', { fetcher: fixtureFetch([], { title }) });
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].label, title);
});

await ok('extrait limité au résumé, XML décodé et taille bornée à 3000 caractères', async () => {
  const abstract = '<AbstractText Label="RESULTS">Effort &amp; repos &#233;gal &#xE9;chelle &quot;test&quot; <i>utile</i> &lt;script&gt;masqué&lt;/script&gt;. ' + 'Conclusion testée. '.repeat(400) + '</AbstractText>';
  const result = await researchSources('protéines', { fetcher: fixtureFetch([], { abstract }) });
  const excerpt = result.sources[0].excerpt;
  assert.equal(excerpt.length, 3000); assert.match(excerpt, /^RESULTS: Effort & repos égal échelle "test" utile masqué/);
  assert.doesNotMatch(excerpt, /<script>|<i>|&amp;|Texte hors résumé/);
});

await ok('403, erreur réseau et contenu non XML : indisponibilité sans source vérifiée', async () => {
  for (const fetcher of [async () => new Response('Forbidden', { status: 403 }), async () => { throw new Error('secret réseau'); }, async () => new Response('<html>pas un article</html>')]) {
    assert.deepEqual(await researchSources('protéines', { fetcher }), { sources: [], unavailable: true });
  }
});

await ok('une source vérifiée reste utilisable lorsque la seconde échoue', async () => {
  const result = await researchSources('échauffement', { fetcher: async (url) => { const pmid = fixedUrl(url); return pmid === '16632061' ? new Response(document(pmid)) : new Response('Forbidden', { status: 403 }); } });
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].id, 'schoffl2006'); assert.equal(result.unavailable, false);
});

await ok('300000 octets maximum : taille annoncée et flux trop volumineux refusés', async () => {
  let textRead = false;
  const announced = await researchSources('protéines', { fetcher: async () => ({ ok: true, headers: new Headers({ 'Content-Length': '300001' }), text: async () => { textRead = true; return ''; } }) });
  assert.equal(textRead, false); assert.equal(announced.unavailable, true);
  let cancelled = false;
  const streamed = await researchSources('protéines', { fetcher: async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(100001)); }, cancel() { cancelled = true; } })) });
  assert.equal(streamed.unavailable, true); assert.equal(cancelled, true);
  const multibyte = await researchSources('protéines', { fetcher: async () => ({ ok: true, headers: new Headers(), text: async () => 'é'.repeat(160000) }) });
  assert.equal(multibyte.unavailable, true);
});

await ok('délai borné et AbortController, y compris fournisseur qui ignore l’annulation', async () => {
  let signal; const started = Date.now();
  const result = await researchSources('protéines', { timeoutMs: 10, fetcher: async (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  assert.deepEqual(result, { sources: [], unavailable: true }); assert.equal(signal.aborted, true); assert.ok(Date.now() - started < 1000);
});

await ok('le délai couvre également un corps HTTP bloqué après réception des en-têtes', async () => {
  let signal; const started = Date.now();
  const result = await researchSources('protéines', { timeoutMs: 10, fetcher: async (_, options) => { signal = options.signal; return new Response(new ReadableStream({ start() {} })); } });
  assert.deepEqual(result, { sources: [], unavailable: true }); assert.equal(signal.aborted, true); assert.ok(Date.now() - started < 1000);
});

await ok('sources locales : plan réel des pages, profil seulement partagé et aucune fausse date web', () => {
  const local = localChatSources();
  assert.equal(local.length, 1); assert.equal(local[0].id, 'app/map'); assert.equal(local[0].kind, 'app');
  for (const route of Object.keys(COACH_ROUTES)) assert.ok(local[0].excerpt.includes(route));
  assert.equal(local[0].checkedAt, undefined); assert.equal(local[0].url, undefined);
  const provided = localChatSources({ appMap: 'Plan fourni par le serveur', profile: 'Résumé explicitement partagé' });
  assert.equal(provided.length, 2); assert.equal(provided[0].excerpt, 'Plan fourni par le serveur');
  assert.equal(provided[1].id, 'profile'); assert.equal(provided[1].kind, 'profile'); assert.equal(provided[1].excerpt, 'Résumé explicitement partagé');
  assert.equal(localChatSources({ profile: '  ' }).length, 1);
});

done('tests sources IA réellement consultées');
