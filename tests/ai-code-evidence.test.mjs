// La sortie IA ne devient une proposition que si ses sources sont les extraits exacts du serveur.
// Le transport IA est simulé ; les routes, les vérifications de code et SQLite/D1 restent réels.
import assert from 'node:assert/strict';
import { buildCodeEdit, cleanEdits, codeSourceId, CODE_REQUEST_SOURCE } from '../server/codeedit.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const path = 'public/layout.js', find = '<small>Page</small>', replace = '<small>Organiser</small>';
const text = `const hidden = 'Bonjour';\nfunction label() {\n  return \`${find}\`;\n}\n`;
const snippet = { path, start: 3, end: 3, text: `  return \`${find}\`;` };
const second = { path: 'public/settings.js', start: 1, end: 1, text: "const other = 'Paramètres';" };
const files = new Map([[path, text], [second.path, second.text]]), source = codeSourceId(snippet);
const options = { snippets: [snippet, second], requireEvidence: true };
const edit = { path, find, replace };
const valid = { status: 'ok', sources: [CODE_REQUEST_SOURCE, source], questions: [], reply: 'Le libellé devient Organiser.', title: 'Renommer', summary: 'Un libellé plus précis.', edits: [edit] };
const assertBlocked = (output, status = 'unverified') => {
  assert.equal(output.status, status); assert.deepEqual(output.edits, []); assert.equal(output.diff, '');
  assert.equal(output.title, ''); assert.equal(output.summary, ''); assert.deepEqual(output.sources, []);
  assert.ok(output.questions.length); assert.match(output.reply, /Aucun remplacement/);
  assert.doesNotMatch(output.reply, /AFFIRMATION_NON_VERIFIEE/);
};

console.log('Preuves exactes des propositions IA de code');
await ok('prompt : sources distinctes pour la demande et chaque extrait, aucun accès Web ou résultat de test inventé', async () => {
  const messages = [{ role: 'user', content: 'Renomme le texte Page en Organiser.' }], before = JSON.stringify(messages);
  const system = buildCodeEdit(messages, [snippet, second])[0].content;
  assert.match(system, /"status":"ok\|clarify\|unverified"/); assert.ok(system.includes(CODE_REQUEST_SOURCE));
  assert.ok(system.includes(source)); assert.ok(system.includes(codeSourceId(second))); assert.ok(system.includes(snippet.text));
  assert.match(system, /ne prouve ni un résultat de test/); assert.match(system, /affirmation scientifique/);
  assert.match(buildCodeEdit(messages, [])[0].content, /aucun extrait trouvé.*status="clarify"/);
  assert.equal(codeSourceId({ ...snippet, path: 'worker.js' }), ''); assert.equal(codeSourceId({ ...snippet, start: 0 }), '');
  assert.equal(JSON.stringify(messages), before);
});
await ok('preuve complète : le find cité produit un diff sans modifier le contenu de départ', async () => {
  for (const raw of [valid, { response: JSON.stringify(valid) }, { response: { response: JSON.stringify(valid) } }]) {
    const output = cleanEdits(raw, files, options);
    assert.equal(output.status, 'ok'); assert.deepEqual(output.edits, [edit]); assert.match(output.diff, /Organiser/);
    assert.deepEqual(output.sources, valid.sources); assert.equal(output.sourceRefs.find(ref => ref.id === source).path, path);
    assert.equal(output.sourceRefs.find(ref => ref.id === source).type, 'code'); assert.deepEqual(output.questions, []);
  }
  assert.equal(files.get(path), text);
  assert.equal(cleanEdits({ edits: [edit] }, files).edits.length, 1, 'proposition manuelle conservée');
});
await ok('statut absent, doute déclaré ou question : aucun remplacement préparé, aucune affirmation réutilisée', async () => {
  const missing = { ...valid, reply: 'AFFIRMATION_NON_VERIFIEE' }; delete missing.status;
  assertBlocked(cleanEdits(missing, files, options)); assertBlocked(cleanEdits('AFFIRMATION_NON_VERIFIEE', files, options));
  for (const [extra, status] of [
    [{ status: 'clarify' }, 'clarify'], [{ status: 'unverified' }, 'unverified'], [{ status: 'inconnu' }, 'unverified'],
    [{ grounded: false }, 'unverified'], [{ verified: false }, 'unverified'], [{ understood: false }, 'clarify'],
    [{ needsClarification: true }, 'clarify'], [{ questions: ['Quel bouton ?'] }, 'clarify'], [{ question: 'Quel bouton ?' }, 'clarify'],
  ]) assertBlocked(cleanEdits({ ...valid, reply: 'AFFIRMATION_NON_VERIFIEE', ...extra }, files, options), status);
});
await ok('sources manquantes, inventées, mal typées ou demande non citée : refus serveur', async () => {
  const missing = { ...valid }; delete missing.sources;
  assertBlocked(cleanEdits(missing, files, options));
  for (const sources of [[], [CODE_REQUEST_SOURCE], [source], [CODE_REQUEST_SOURCE, 'code:public/layout.js:99-99'], [CODE_REQUEST_SOURCE, source, 'https://science.test/'], [CODE_REQUEST_SOURCE, source, { id: source }], Array(33).fill(source), source, null]) {
    assertBlocked(cleanEdits({ ...valid, sources }, files, options));
  }
  assertBlocked(cleanEdits(valid, files, { requireEvidence: true }));
});
await ok('les fichiers complets et les autres extraits ne peuvent remplacer la preuve de chaque cible', async () => {
  for (const edits of [
    [{ ...edit, find: "'Bonjour'", replace: "'Salut'" }], // texte présent dans le fichier mais absent de l'extrait fourni
    [{ path: second.path, find: "'Paramètres'", replace: "'Réglages'" }], // extrait fourni, mais non cité
    [edit, { ...edit, find: "'Bonjour'", replace: "'Salut'" }], // une preuve insuffisante annule toute la proposition
    [{ ...edit, replace: { label: 'Organiser' } }],
  ]) assertBlocked(cleanEdits({ ...valid, edits }, files, options));
  const wrongFile = { ...snippet, path: second.path };
  assertBlocked(cleanEdits({ ...valid, sources: [CODE_REQUEST_SOURCE, codeSourceId(wrongFile)] }, files, { snippets: [wrongFile], requireEvidence: true }));
  const unsafe = cleanEdits({ ...valid, edits: [{ ...edit, replace: 'eval("1")' }] }, files, options);
  assert.deepEqual(unsafe.edits, []); assert.match(unsafe.errors[0], /refusé/);
});
await ok('route administrateur : preuves contrôlées avant le diff, clarifications consultables, aucune écriture de code ou publication', async () => {
  let answer, calls = 0;
  const env = makeEnv({
    AI: { run: async (_model, input) => {
      calls++;
      const cited = input.messages[0].content.match(/source « (code:public\/layout\.js:[^»]+) »/)?.[1];
      assert.ok(cited, 'extrait réel trouvé par la route');
      const base = { ...valid, sources: [CODE_REQUEST_SOURCE, cited] };
      return { response: JSON.stringify(answer(base)) };
    } },
    ASSETS: { fetch: async request => new URL(request.url).pathname === '/layout.js' ? new Response(text) : new Response('// aucun libellé ici\n') },
  });
  const client = new Client(env); await client.register('CodeEvidence'); await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
  const body = { messages: [{ role: 'user', content: 'Renomme « Page » en « Organiser »' }] };
  answer = base => base;
  const accepted = await client.post('/api/admin/assistant/code', body);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data)); assert.equal(accepted.data.status, 'ok');
  assert.deepEqual(accepted.data.edits, [edit]); assert.match(accepted.data.diff, /Organiser/); assert.ok(accepted.data.impact);
  for (const [makeAnswer, status] of [
    [base => { const legacy = { ...base }; delete legacy.status; return legacy; }, 'unverified'],
    [base => ({ ...base, sources: [CODE_REQUEST_SOURCE] }), 'unverified'],
    [base => ({ ...base, sources: [CODE_REQUEST_SOURCE, 'code:public/layout.js:99-99'] }), 'unverified'],
    [base => ({ ...base, status: 'clarify', questions: ['Quel libellé exactement ?'] }), 'clarify'],
    [base => ({ ...base, status: 'unverified', reply: 'AFFIRMATION_NON_VERIFIEE' }), 'unverified'],
  ]) {
    answer = makeAnswer;
    const response = await client.post('/api/admin/assistant/code', body);
    assert.equal(response.status, 200, JSON.stringify(response.data)); assertBlocked(response.data, status); assert.equal(response.data.impact, null);
  }
  const member = new Client(env); await member.register('CodeEvidenceMember');
  assert.equal((await member.post('/api/admin/assistant/code', body)).status, 403); assert.equal(calls, 6);
  for (const table of ['change_sets', 'code_proposals', 'global_content']) assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n, 0, table);
});
done('tests des preuves IA de code');
