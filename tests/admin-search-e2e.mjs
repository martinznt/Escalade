// Recherche admin réelle : rôles serveur, clics natifs, réponses hors ordre et compte propriétaire.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv({ EDIT_PASSWORD: 'Adm1n-Secret!' }), clients = {};
for (const role of ['keeper','root','content','technical','users','intelligence','member']) {
  const client = clients[role] = new Client(env); await client.register('FindBrowser' + role);
  if (role !== 'member') await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
  await client.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts','place','minutes','perWeek','goal','avoid'] } }] });
}
for (const role of ['content','technical','users','intelligence']) {
  const user = (await clients[role].get('/api/auth/me')).data.user;
  assert.equal((await clients.keeper.post(`/api/admin/users/${user.id}/roles`, { roles: [role] })).status, 200);
}
await clients.member.post('/api/bugs', { id: 'browser-search-bug', description: 'BrowserUnique : le bouton ne répond pas.', page: 'home/dash' });
const draft = await clients.root.post('/api/admin/studio', { title: 'BrowserUnique brouillon', items: [{ kind: 'faq', id: 'browser-search-faq', op: 'put', data: { q: 'BrowserUnique question ?', a: 'Réponse de test.' } }] });
assert.equal(draft.status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 320, height: 568 }, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let steps = 0, hold = false, held, ready, resolveReady;
const step = async (name, callback) => { await callback(); steps++; console.log('  ✓', name); };
const open = async (sub) => { await page.evaluate((value) => { location.hash = '#/settings/' + value; }, sub); await page.waitForFunction((value) => document.querySelector('main') && location.hash === '#/settings/' + value, sub); };
const input = () => page.locator('[data-input=adminSearch]');
const modelReady = () => page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.admin.search && !S.admin.search.loading; });
const prepareHold = () => { hold = true; ready = new Promise((resolve) => { resolveReady = resolve; }); };
await page.route('**/api/admin/search?**', async (route) => {
  if (!hold) return route.continue();
  hold = false;
  const response = await route.fetch();
  held = { release: () => route.fulfill({ response }) }; resolveReady();
});
async function login(name) {
  if (await page.locator('[data-act=authPick][data-id=login]').count()) await page.click('[data-act=authPick][data-id=login]');
  await page.waitForSelector('form[data-submit=login]');
  await page.fill('form[data-submit=login] [name=username]', 'FindBrowser' + name);
  await page.fill('form[data-submit=login] [name=password]', 'motdepasse1');
  await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
}
try {
  await page.goto(srv.base); await login('root'); await open('admin'); await input().waitFor();
  await step('recherche réelle : brouillon et signalement trouvés, clic ouvre le bon lot', async () => {
    await input().fill('BrowserUnique'); await modelReady();
    const result = page.locator('#admin-search-results [data-act=adminSearchGo]').filter({ hasText: 'BrowserUnique brouillon' });
    await result.click(); await page.waitForSelector('[data-act=studioPublish]');
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.studio.cur?.set?.id), draft.data.id);
    assert.match(await page.locator('main').innerText(), /BrowserUnique brouillon/);
  });

  await step('réponses hors ordre : un ancien résultat ne remplace pas la nouvelle recherche', async () => {
    await open('admin'); prepareHold(); await input().fill('BrowserUnique'); await ready;
    await input().fill('FindBrowsermember'); await modelReady();
    await page.waitForFunction(() => document.querySelector('#admin-search-results')?.textContent.includes('FindBrowsermember'));
    assert.match(await page.locator('#admin-search-results').innerText(), /FindBrowsermember/);
    const oldResponse = page.waitForResponse((response) => response.url().includes('/api/admin/search?q=BrowserUnique'));
    await held.release(); await oldResponse;
    assert.doesNotMatch(await page.locator('#admin-search-results').innerText(), /BrowserUnique/);
  });

  await step('appui conservé : réception vraie des résultats sans déplacement, puis clic Assistant', async () => {
    await input().fill(''); await modelReady(); prepareHold(); await input().fill('BrowserUnique'); await ready;
    const button = page.locator('[data-act=setSub][data-id=assistant]'); await button.scrollIntoViewIfNeeded();
    const before = await button.boundingBox(); assert.ok(before);
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down();
    const response = page.waitForResponse((response) => response.url().includes('/api/admin/search?q=BrowserUnique'));
    await held.release(); await response; await modelReady();
    assert.ok(await page.evaluate(async () => { const { S } = await import('/state.js'); return S.admin.search.results.some((row) => row.kind === 'studio') && S.admin.search.pendingPaint; }));
    assert.deepEqual(await button.boundingBox(), before);
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-act]')?.dataset.id, { x: before.x + before.width / 2, y: before.y + before.height / 2 }), 'assistant');
    await page.mouse.up(); await page.waitForFunction(() => location.hash === '#/settings/assistant');
  });

  await step('réponse admin tardive après changement de compte : ni cache ni rendu chez le membre', async () => {
    await open('admin'); prepareHold(); await input().fill('BrowserUnique'); await ready;
    await open('main'); await page.click('[data-act=logout]'); await page.click('#dialog.open [data-dlg="1"]'); await login('member');
    const response = page.waitForResponse((response) => response.url().includes('/api/admin/search?q=BrowserUnique'));
    await held.release(); await response;
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.admin.search), undefined);
    assert.doesNotMatch(await page.locator('body').innerText(), /BrowserUnique/);
  });

  await step('rôles affichés : Contenu, Technique, Utilisateurs et Intelligence reçoivent leurs seules collections', async () => {
    for (const [role, query, kinds] of [['content','BrowserUnique',['studio']],['technical','BrowserUnique',['bug']],['users','FindBrowsermember',['user']],['intelligence','BrowserUnique',[]]]) {
      const scoped = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }), view = await scoped.newPage();
      view.on('pageerror', (error) => errors.push(error.message));
      assert.equal((await scoped.request.post(srv.base + '/api/auth/login', { headers: { Origin: srv.base }, data: { username: 'FindBrowser' + role, password: 'motdepasse1' } })).status(), 200);
      await view.goto(srv.base + '/#/settings/admin'); await view.waitForSelector('[data-input=adminSearch]');
      await view.waitForFunction(async () => (await import('/state.js')).S.loaded);
      const searched = view.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/search' && new URL(response.url()).searchParams.get('q') === query);
      await view.fill('[data-input=adminSearch]', query); await searched;
      await view.waitForFunction(async (query) => { const { S } = await import('/state.js'); return S.admin.search?.query === query && !S.admin.search.loading; }, query);
      assert.deepEqual(await view.evaluate(async () => (await import('/state.js')).S.admin.search.results.map((row) => row.kind)), kinds, role);
      assert.doesNotMatch(await view.locator('main').innerText(), /undefined|NaN|Cet écran n’a pas pu/); await scoped.close();
    }
  });
  assert.deepEqual(errors, []); console.log(`\n${steps} parcours navigateur recherche admin OK`);
} finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
