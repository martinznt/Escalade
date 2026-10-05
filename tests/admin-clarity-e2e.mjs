// Administration : fonctions courantes visibles, outils rares repliés et droits cohérents avec le serveur.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const srv = await startServer();
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const errors = [];
let steps = 0;
const step = async (name, fn) => { await fn(); console.log('  ✓', name); steps++; };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(e.message));
const api = async (method, path, body) => {
  const r = await ctx.request.fetch(srv.base + path, { method, headers: { Origin: srv.base }, data: body });
  assert.equal(r.status(), 200, `${method} ${path}`); return r.json();
};
const open = async (id) => { await p.evaluate((id) => { location.hash = '#/settings/' + id; }, id); await p.waitForTimeout(150); };
try {
  await api('POST', '/api/auth/register', { username: 'AdminClarte', password: 'motdepasse1' });
  await api('POST', '/api/admin/activate', { password: 'secret-admin-de-test' });
  await p.goto(srv.base);
  await p.waitForSelector('nav.tabs');
  await p.evaluate(async () => {
    const { S, putItem } = await import('/state.js');
    putItem('config', 'main', { tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] });
    S.settings.onboarded = true;
  });
  if (await p.locator('[data-act=setupSkip]').count()) await p.click('[data-act=setupSkip]');
  await p.click('nav [data-id=settings]');
  await p.click('[data-act=setSub][data-id=admin]');
  await p.getByRole('region', { name: 'Modifier le site', exact: true }).waitFor();
  await step('trois groupes clairs, accès direct à l’assistant et aux notifications', async () => {
    for (const title of ['Modifier le site', 'Gérer les membres', 'Suivre le site']) {
      assert.ok(await p.getByRole('region', { name: title, exact: true }).isVisible(), title);
    }
    assert.ok(await p.locator('[data-act=setSub][data-id=assistant]').isVisible());
    assert.ok(await p.locator('[data-act=setSub][data-id=push]').isVisible());
    assert.equal(await p.locator('#admin-advanced').getAttribute('open'), null);
    assert.equal(await p.locator('[data-act=setSub][data-id=code]').isVisible(), false);
    const actions = await p.locator('main .setrow').evaluateAll((rows) => rows.map((x) => `${x.dataset.act}/${x.dataset.id || ''}`));
    assert.equal(new Set(actions).size, actions.length, 'chaque destination présente une seule fois');
    assert.equal(actions.length, 19, 'toutes les fonctions existantes sont conservées');
  });
  await step('administration lisible sur petit écran et bureau, outils accessibles à la demande', async () => {
    for (const [width, height] of [[320, 568], [390, 844], [1280, 900]]) {
      await p.setViewportSize({ width, height });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.doesNotMatch(await p.locator('main').innerText(), /undefined|NaN|\[object Object\]|Cet écran n’a pas pu/);
      await p.screenshot({ path: `/tmp/escalade-admin-${width}.png`, fullPage: true });
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.click('#admin-advanced > summary');
    await p.click('[data-act=setSub][data-id=health]');
    await p.waitForSelector('[data-act=healthReload]');
    assert.match(await p.locator('main').innerText(), /Aucun problème détecté/);
  });
  await step('brouillons : création évidente, outils repliés et retour clair', async () => {
    await open('studio'); await p.waitForSelector('[data-act=studioNew]');
    assert.ok(await p.locator('[data-act=studioNew]').isVisible());
    assert.equal(await p.locator('[data-act=setSub][data-id=lab]').isVisible(), false);
    await p.click('main details > summary');
    assert.ok(await p.locator('[data-act=setSub][data-id=lab]').isVisible());
    await p.click('[data-act=studioNew]'); await p.waitForSelector('[data-submit=studioDraftGo]');
    await p.fill('#sheet input[name=title]', 'Aide lisible');
    await p.fill('#sheet input[name=q]', 'Comment publier ?');
    await p.fill('#sheet textarea[name=a]', 'Crée puis vérifie un brouillon.');
    await p.click('[data-submit=studioDraftGo] button.pri'); await p.waitForSelector('[data-act=studioPublish]');
    assert.match(await p.locator('.subhead').innerText(), /Brouillons et publication/);
    await p.click('.subhead [data-act=setSub]'); await p.waitForSelector('[data-act=studioNew]');
    assert.match(await p.locator('main').innerText(), /Aide lisible/);
  });
  await step('rôle Contenu : aucun outil ni action réservés à Technique ou Intelligence', async () => {
    // Un deuxième super-administrateur permet de limiter les droits du compte testé.
    const keeper = await browser.newContext();
    for (const [path, data] of [
      ['/api/auth/register', { username: 'AdminGardien', password: 'motdepasse2' }],
      ['/api/admin/activate', { password: 'secret-admin-de-test' }],
    ]) assert.equal((await keeper.request.post(srv.base + path, { headers: { Origin: srv.base }, data })).status(), 200);
    const me = (await api('GET', '/api/auth/me')).user;
    await api('POST', `/api/admin/users/${me.id}/roles`, { roles: ['content'] });
    await p.reload(); await p.waitForSelector('nav.tabs'); await open('admin');
    assert.ok(await p.locator('[data-act=setSub][data-id=studio]').isVisible());
    for (const id of ['push', 'bugs', 'users', 'health', 'lab', 'maint', 'code']) assert.equal(await p.locator(`[data-act=setSub][data-id=${id}]`).count(), 0, id);
    await open('studio'); await p.waitForSelector('[data-act=studioNew]');
    assert.equal(await p.locator('[data-act=studioAi]').count(), 0, 'pas de formulaire IA qui serait refusé par le serveur');
    await open('users'); assert.match(await p.locator('main').innerText(), /Rôle « Utilisateurs » nécessaire/);
    assert.equal(await p.locator('[data-act=usersReload]').count(), 0);
    await open('lab'); assert.match(await p.locator('main').innerText(), /Rôle « Intelligence » nécessaire/);
    assert.equal(await p.locator('[data-act=labGo]').count(), 0);
    await keeper.close();
  });
  assert.deepEqual(errors, [], 'aucune erreur JavaScript');
  console.log(`\n${steps} parcours de clarté de l’administration OK`);
} catch (e) {
  await p.screenshot({ path: '/tmp/escalade-admin-fail.png', fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  await new Promise((resolve) => srv.server.close(resolve));
}
