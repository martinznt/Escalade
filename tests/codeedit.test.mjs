// tests/codeedit.test.mjs — l'assistant du site propose une petite modification du CODE de l'interface :
// remplacements exacts revérifiés par le serveur (fichier autorisé, texte unique, rien de dangereux), diff lisible,
// validation (un autre admin, ou seul admin avec confirmation explicite), puis Pull Request GitHub — jamais fusionnée
// ni déployée par l'app. GitHub et l'IA sont simulés : aucun appel réseau.
import assert from 'node:assert/strict';
import * as C from '../server/codeedit.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const FILE = "export const TITRE = 'Bonjour';\nexport function a() {\n  return h`<button data-act=\"layEdit\">✏️ Page</button>`;\n}\n";
const files = new Map([['public/layout.js', FILE], ['public/sw.js', 'self.x = 1;\n']]);
console.log('Modifications de code proposées par l’assistant');
await ok('recherche : les extraits qui contiennent le texte cité', async () => {
  const s = C.searchCode(files, 'Je veux que le bouton « ✏️ Page » s’appelle « Organiser »');
  assert.equal(s[0].path, 'public/layout.js'); assert.match(s[0].text, /✏️ Page/);
});
await ok('remplacement exact accepté : diff lisible, une seule zone', async () => {
  const r = C.cleanEdits({ reply: 'ok', title: 'Renommer le bouton', edits: [{ path: 'public/layout.js', find: '✏️ Page', replace: '✏️ Organiser' }] }, files);
  assert.equal(r.edits.length, 1); assert.deepEqual(r.errors, []);
  assert.match(r.diff, /^--- a\/public\/layout\.js\n\+\+\+ b\/public\/layout\.js\n@@ /); assert.match(r.diff, /^-.*✏️ Page/m); assert.match(r.diff, /^\+.*✏️ Organiser/m);
  assert.equal(C.applyEdits(FILE, r.edits).includes('✏️ Organiser'), true);
});
await ok('refus : serveur ou service worker, texte introuvable ou ambigu, ajout dangereux, trop gros', async () => {
  const bad = C.cleanEdits({ edits: [
    { path: 'worker.js', find: 'x', replace: 'y' }, { path: 'public/sw.js', find: 'self.x = 1;', replace: 'self.x = 2;' },
    { path: 'public/layout.js', find: 'inexistant', replace: 'z' }, { path: 'public/layout.js', find: 'export', replace: 'export ' },
  ] }, files);
  assert.equal(bad.edits.length, 0); assert.equal(bad.errors.length, 4);
  assert.match(bad.errors.join('\n'), /jamais le serveur ni le service worker[\s\S]*introuvable[\s\S]*apparaît 2 fois/);
  for (const replace of ['eval("1")', 'new Function("x")', '<script src=x>', 'el.innerHTML = x', "fetch('https://evil.example')", 'localStorage.clear()', 'env.GITHUB_TOKEN']) {
    const r = C.cleanEdits({ edits: [{ path: 'public/layout.js', find: "'Bonjour'", replace }] }, files);
    assert.equal(r.edits.length, 0, replace); assert.match(r.errors[0], /refusé/);
  }
  const big = C.cleanEdits({ edits: [{ path: 'public/layout.js', find: "'Bonjour'", replace: Array.from({ length: 90 }, (_, k) => `'l${k}'`).join('\n') }] }, files);
  assert.equal(big.edits.length, 0); assert.match(big.errors.at(-1), /Trop de lignes/);
  assert.equal(C.cleanEdits('pas du JSON', files).edits.length, 0);
});
await ok('Pull Request : branche, fichier modifié sur la version GitHub, PR ouverte — jamais fusionnée', async () => {
  const calls = [], b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
  const fetchFn = async (url, init = {}) => {
    calls.push([init.method || 'GET', url.replace('https://api.github.com/repos/moi/depot', ''), init.body ? JSON.parse(init.body) : null]);
    const path = url.replace('https://api.github.com/repos/moi/depot', '');
    const R = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (path === '') return R({ default_branch: 'main' });
    if (path.startsWith('/git/ref/heads/main')) return R({ object: { sha: 'abc' } });
    if (path === '/git/refs') return R({}, 201);
    if (path.startsWith('/contents/public/layout.js') && (init.method || 'GET') === 'GET') return R({ content: b64(FILE), sha: 'f1' });
    if (path.startsWith('/contents/public/layout.js')) return R({}, 200);
    if (path === '/pulls') return R({ html_url: 'https://github.com/moi/depot/pull/7', number: 7 }, 201);
    return R({ message: 'inattendu' }, 500);
  };
  const r = await C.openPullRequest({ repo: 'moi/depot', token: 't', id: 'p1', title: 'Renommer', body: 'b', edits: [{ path: 'public/layout.js', find: '✏️ Page', replace: '✏️ Organiser' }] }, fetchFn);
  assert.equal(r.url, 'https://github.com/moi/depot/pull/7');
  const put = calls.find(([m, p]) => m === 'PUT'); assert.equal(Buffer.from(put[2].content, 'base64').toString('utf8').includes('✏️ Organiser'), true); assert.equal(put[2].branch, 'assistant/p1');
  assert.ok(!calls.some(([, p]) => /merge/.test(p)), 'aucune fusion');
  await assert.rejects(C.openPullRequest({ repo: 'pas un dépôt', token: 't', id: 'x', title: 't', body: '', edits: [] }, fetchFn), /propriétaire\/dépôt/);
});
await ok('de bout en bout côté serveur : assistant → proposition (revérifiée) → validation seul confirmée → Pull Request', async () => {
  const realFetch = globalThis.fetch, gh = [];
  const AI = { run: async () => ({ response: JSON.stringify({ reply: 'Je renomme le bouton.', title: 'Bouton ✏️ : « Organiser »', summary: 'Le petit mot sous ✏️ devient « Organiser ».', edits: [{ path: 'public/layout.js', find: '<small>Page</small>', replace: '<small>Organiser</small>' }] }) }) };
  const env = makeEnv({ AI, ASSETS: { fetch: async (req) => { const p = new URL(req.url).pathname; return p === '/layout.js' ? new Response('const a = `<small>Page</small>`;\n') : new Response('// ' + p + '\n'); } } });
  const a = new Client(env); await a.register('solo'); await a.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
  const r = await a.post('/api/admin/assistant/code', { messages: [{ role: 'user', content: 'Renomme « Page » sous le bouton ✏️ en « Organiser »' }] });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.edits.length, 1); assert.match(r.data.diff, /\+const a = `<small>Organiser<\/small>`;/); assert.equal(r.data.github, false);
  // le client ne peut pas glisser un autre diff : le serveur recalcule à partir des remplacements
  const sv = await a.post('/api/admin/code', { title: r.data.title, summary: r.data.summary, edits: r.data.edits, diff: '+++ b/worker.js\n+eval(1)' });
  assert.equal(sv.status, 200, JSON.stringify(sv.data)); const id = sv.data.id;
  const item = (await a.get('/api/admin/code/' + id)).data.item; assert.equal(item.exact, true); assert.doesNotMatch(item.diff, /worker\.js|eval/);
  assert.equal((await a.post(`/api/admin/code/${id}/review`, { decision: 'approve' })).status, 409, 'seul admin : confirmation explicite exigée');
  const ap = await a.post(`/api/admin/code/${id}/review`, { decision: 'approve', solo: true }); assert.equal(ap.status, 200); assert.equal(ap.data.solo, true);
  assert.equal((await a.post(`/api/admin/code/${id}/pr`)).status, 503, 'GitHub non relié : message clair');
  env.GITHUB_TOKEN = 'ghp_test'; env.GITHUB_REPO = 'moi/depot';
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('https://api.github.com/')) return realFetch(url, init);
    gh.push([init.method || 'GET', String(url)]); const p = String(url).replace('https://api.github.com/repos/moi/depot', '');
    const R = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (p === '') return R({ default_branch: 'main' }); if (p.startsWith('/git/ref/')) return R({ object: { sha: 's' } }); if (p === '/git/refs') return R({}, 201);
    if (p.startsWith('/contents/') && (init.method || 'GET') === 'GET') return R({ content: Buffer.from('const a = `<small>Page</small>`;\n').toString('base64'), sha: 'x' });
    if (p.startsWith('/contents/')) return R({}); if (p === '/pulls') return R({ html_url: 'https://github.com/moi/depot/pull/9', number: 9 }, 201);
    return R({}, 500);
  };
  try {
    const pr = await a.post(`/api/admin/code/${id}/pr`); assert.equal(pr.status, 200, JSON.stringify(pr.data));
    assert.equal(pr.data.url, 'https://github.com/moi/depot/pull/9'); assert.equal(pr.data.merged, false); assert.equal(pr.data.deployed, false);
    assert.equal((await a.get('/api/admin/code/' + id)).data.item.prUrl, 'https://github.com/moi/depot/pull/9');
    const again = await a.post(`/api/admin/code/${id}/pr`); assert.equal(again.data.already, true); assert.equal(gh.filter(([m, u]) => m === 'POST' && u.endsWith('/pulls')).length, 1, 'une seule PR');
  } finally { globalThis.fetch = realFetch; }
  const audit = (await a.get('/api/admin/audit')).data; assert.ok(JSON.stringify(audit).includes('code_self_approved') && JSON.stringify(audit).includes('code_pr'), 'tout est noté au journal');
  // un membre ordinaire n'y a pas accès
  const m = new Client(env); await m.register('membre'); assert.equal((await m.post('/api/admin/assistant/code', { messages: [{ role: 'user', content: 'test test' }] })).status, 403);
});
done('tests des modifications de code');
