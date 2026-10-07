// Vrai Worker/D1 + navigateur ; seuls les serveurs Strava sont simulés, aucun OAuth réel.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import worker from '../worker.js';
import { makeEnv } from './server.mjs';
import { Client } from './helpers.mjs';

const SITE = 'https://site.test', ROOT = '/api/integrations/strava';
const env = makeEnv(), clients = {}, apiCalls = [], vendorCalls = [], errors = [];
const config = { STRAVA_CLIENT_ID: '12345', STRAVA_CLIENT_SECRET: 'test-client-secret-12345', STRAVA_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64url'), STRAVA_REDIRECT_URI: SITE + ROOT + '/callback' };
let activitiesError = false, revokeError = false, holdPreview = false, releasePreview;
const activity = (id, name, sportType = 'Run') => ({ id, name, athlete: { id: 123 }, sport_type: sportType, start_date: '2026-10-01T07:00:00Z', elapsed_time: 1800, moving_time: 1600, distance: 5000, total_elevation_gain: 35, private: true, map: { summary_polyline: 'GPS_NON_STOCKE' }, description: 'TEXTE_PRIVE_NON_IMPORTE' });
const fixtureActivities = [activity(70001, 'COURSE_STRAVA_PRIVEE'), activity(70002, 'ESCALADE_STRAVA_PRIVEE', 'RockClimbing')];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'www.strava.com') {
    vendorCalls.push({ path: url.pathname, query: url.search, method: options?.method || 'GET' });
    if (url.pathname === '/oauth/token') return Response.json({ access_token: 'access-token-test', refresh_token: 'refresh-token-test', expires_at: Math.floor(Date.now() / 1000) + 7200, athlete: { id: 123 } });
    if (url.pathname === '/oauth/deauthorize') return revokeError ? new Response('', { status: 503 }) : Response.json({ access_token: 'access-token-test' });
    if (url.pathname === '/api/v3/athlete/activities') {
      const response = () => activitiesError ? new Response('', { status: 503 }) : Response.json(Number(url.searchParams.get('page')) === 1 ? fixtureActivities : []);
      return holdPreview ? new Promise((resolve) => { releasePreview = () => resolve(response()); }) : response();
    }
    throw new Error('URL Strava inattendue dans le test');
  }
  if (['api.github.com', 'eutils.ncbi.nlm.nih.gov'].includes(url.hostname)) return new Response('', { status: 503 });
  return nativeFetch(input, options);
};
for (const name of ['AppsOwnerA', 'AppsOwnerB']) {
  const client = new Client(env); await client.register(name); clients[name] = client;
  await client.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } }] });
}
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
let routeOverride;
await context.route(/^https:\/\/site\.test\//, async (route) => {
  const request = route.request(), headers = await request.allHeaders(), method = request.method();
  const body = ['GET', 'HEAD'].includes(method) ? undefined : request.postDataBuffer();
  const path = new URL(request.url()).pathname;
  if (path.startsWith(ROOT)) apiCalls.push({ path, method, body: request.postDataJSON() });
  const input = new Request(request.url(), { method, headers, body });
  const response = routeOverride ? await routeOverride(input) || await worker.fetch(input, env) : await worker.fetch(input, env);
  const output = {}; for (const [key, value] of response.headers) if (key !== 'set-cookie') output[key] = value;
  const cookies = response.headers.getSetCookie?.() || []; if (cookies.length) output['set-cookie'] = cookies.join('\n');
  await route.fulfill({ status: response.status, headers: output, body: Buffer.from(await response.arrayBuffer()) });
});
// Simule l'approbation sur Strava puis son retour OAuth ; aucune page fournisseur réelle visitée.
await context.route(/^https:\/\/www\.strava\.com\/oauth\/authorize\?/, async (route) => {
  const authorize = new URL(route.request().url()), callback = new URL(config.STRAVA_REDIRECT_URI);
  assert.equal(authorize.searchParams.get('scope'), 'read,activity:read_all');
  callback.searchParams.set('state', authorize.searchParams.get('state')); callback.searchParams.set('scope', 'read,activity:read_all'); callback.searchParams.set('code', 'fixture-authorized-code');
  await route.fulfill({ status: 303, headers: { Location: callback.href }, body: '' });
});
const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
let count = 0;
const step = async (name, run) => { await run(); count++; console.log('  ✓', name); };
const go = async (hash, selector) => { await page.evaluate((hash) => { location.hash = hash; }, hash); await page.waitForSelector(selector); };
const login = async (name) => {
  if (await page.locator('[data-act=authPick][data-id=login]').count()) await page.click('[data-act=authPick][data-id=login]');
  await page.waitForSelector('form[data-submit=login]'); await page.fill('[name=username]', name); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/views-setup.js')).mainConfig().setupDone);
};
const integration = async () => { await go('#/settings/integrations', 'main .integrations'); await page.waitForFunction(async () => !(await import('/state.js')).S.connections?.loading); };
const history = async () => page.evaluate(async () => (await (await fetch('/api/history')).json()).history);
const poll = async (run) => { for (let i = 0; i < 80; i++) { if (await run()) return; await page.waitForTimeout(100); } throw new Error('Condition de persistance non satisfaite'); };
const file = `<TrainingCenterDatabase><Activity Sport="Running"><Track><Trackpoint><Time>2026-10-02T07:00:00Z</Time></Trackpoint><Trackpoint><Time>2026-10-02T07:30:00Z</Time></Trackpoint></Track></Activity></TrainingCenterDatabase>`;
const upload = async (text = file) => {
  await page.locator('[data-change=importFile]').setInputFiles({ name: 'activity.tcx', mimeType: 'application/xml', buffer: Buffer.from(text) });
  await page.waitForFunction(async () => !!(await import('/state.js')).S.imp);
};
const resetQuota = async () => env.DB.prepare("DELETE FROM system_state WHERE key LIKE 'rl:strava:%'").run();

try {
  await page.goto(SITE); await login('AppsOwnerA');
  await step('configuration absente : aucune fausse connexion, annuaire et imports accessibles', async () => {
    await integration(); assert.match(await page.locator('main').innerText(), /configuration Strava/);
    assert.equal(await page.locator('[data-act=stravaConnect]').count(), 0); assert.equal(vendorCalls.length, 0);
    await page.locator('main details').last().locator('summary').click(); assert.equal(await page.locator('main details [data-act=stravaConnect]').count(), 0);
    await page.setViewportSize({ width: 320, height: 700 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); await page.setViewportSize({ width: 390, height: 844 });
  });
  await step('réponse status pendant appui Retour : bouton conservé et vraie navigation native vers Paramètres', async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    let releaseStatus;
    routeOverride = async (request) => {
      if (request.method !== 'GET' || new URL(request.url).pathname !== ROOT + '/status') return null;
      const response = await worker.fetch(request, env); return new Promise((resolve) => { releaseStatus = () => resolve(response); });
    };
    await page.waitForFunction(async () => !(await import('/state.js')).S.syncing);
    await page.evaluate(async () => { (await import('/state.js')).ACT.stravaStatus(); }); await poll(async () => !!releaseStatus);
    const button = page.locator('#main [data-act=setSub][data-id=main]').first(); await button.scrollIntoViewIfNeeded(); await button.evaluate((el) => { window.__pressedIntegrationBack = el; });
    const hit = await button.boundingBox(); assert.ok(hit);
    await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2); await page.mouse.down();
    // L'animation visuelle normale de l'appui finit avant la mesure comparée à la réponse.
    await button.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {}))); });
    const before = await button.boundingBox(); releaseStatus();
    // Attend le modèle reçu, jamais un rendu volontairement différé pendant l'appui.
    await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.connections.status && !S.connections.loading; });
    assert.equal(await page.evaluate(() => window.__pressedIntegrationBack.isConnected), true); assert.deepEqual(await button.boundingBox(), before);
    await page.mouse.up(); await page.waitForFunction(() => location.hash === '#/settings/main'); await page.waitForSelector('[data-act=setSub][data-id=integrations]');
    routeOverride = null; await page.setViewportSize({ width: 390, height: 844 }); await integration();
  });
  await step('fichier sans mesures : aperçu honnête, ajout explicite et provenance privée conservée sur serveur', async () => {
    await page.locator('[data-act=importOpen][data-source=file]').first().click(); await upload();
    assert.match(await page.locator('#sheet').innerText(), /Distance non renseignée/); assert.match(await page.locator('#sheet').innerText(), /Dénivelé non renseigné/); assert.equal((await history()).length, 0);
    await page.click('[data-act=importSave]'); await poll(async () => (await history()).length === 1);
    const entry = (await history())[0]; assert.equal(entry.data.external.provider, 'file'); assert.equal(entry.data.external.channel, 'file'); assert.equal(entry.data.external.private, true); assert.equal(entry.data.external.excludeAI, true); assert.match(entry.data.external.id, /^[a-f0-9]{64}$/); assert.doesNotMatch(JSON.stringify(entry), /Distance non renseignée.*km|LatitudeDegrees|Trackpoint/);
  });
  await step('même fichier après rechargement : aucun second historique, compte propre et empreinte stable', async () => {
    await page.reload(); await page.waitForSelector('nav.tabs'); await integration(); await page.locator('[data-act=importOpen][data-source=file]').first().click(); await upload();
    assert.match(await page.locator('#sheet').innerText(), /déjà dans ton historique/); assert.equal(await page.locator('[data-act=importSave]').count(), 0); assert.equal((await history()).length, 1); await page.keyboard.press('Escape');
  });
  await step('export Strava choisi : origine fichier distincte, confidentialité appliquée', async () => {
    await page.locator('[data-act=importOpen][data-source=strava]').click(); await upload(file.replaceAll('2026-10-02', '2026-10-03'));
    assert.equal(await page.locator('[data-change=importSource]').inputValue(), 'strava'); await page.click('[data-act=importSave]'); await poll(async () => (await history()).length === 2);
    const entry = (await history()).find((entry) => entry.data.external.provider === 'strava'); assert.equal(entry.data.external.channel, 'file'); assert.equal(entry.data.external.excludeAI, true);
  });
  await step('exports Strava sans OAuth : suppression accessible et aucune révocation inventée', async () => {
    assert.equal(await page.locator('[data-act=stravaConnect]').count(), 0); await page.click('[data-act=stravaDisconnect]'); await page.click('#dialog [data-dlg="1"]');
    await poll(async () => (await history()).length === 1); assert.match(await page.locator('main').innerText(), /imports Strava ont été supprimés/); assert.doesNotMatch(await page.locator('main').innerText(), /révocation/); assert.equal(vendorCalls.length, 0);
    await page.locator('[data-act=importOpen][data-source=strava]').click(); await upload(file.replaceAll('2026-10-02', '2026-10-03')); await page.click('[data-act=importSave]'); await poll(async () => (await history()).length === 2);
  });
  await step('OAuth : accès activités privées consenti, état réel relu, aucun jeton navigateur', async () => {
    Object.assign(env, config); await page.click('[data-act=stravaStatus]'); await page.waitForSelector('[data-act=stravaConnect]');
    assert.equal(await page.locator('[data-change=stravaConsent]').isChecked(), false); assert.equal(await page.locator('[data-act=stravaConnect]').isDisabled(), true);
    assert.equal(apiCalls.filter((call) => call.path === ROOT + '/start').length, 0);
    await page.check('[data-change=stravaConsent]'); await page.click('[data-act=stravaConnect]'); await page.waitForSelector('[data-act=stravaPreview]');
    assert.match(await page.locator('main').innerText(), /Compte connecté/); assert.deepEqual(apiCalls.find((call) => call.path === ROOT + '/start').body, { confirm: true });
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); assert.doesNotMatch(storage, /access-token-test|refresh-token-test|test-client-secret/);
  });
  await step('aperçu Strava : rien ajouté automatiquement, sélection puis confirmation explicite', async () => {
    await page.click('[data-act=stravaPreview]'); await page.waitForSelector('#strava-preview [data-change=stravaSelect]'); assert.equal((await history()).length, 2);
    assert.equal(await page.locator('[data-act=stravaImport]').isDisabled(), true); assert.equal(await page.locator('#strava-preview input:checked').count(), 0);
    await page.check('[data-change=stravaSelect][value="70001"]'); await page.click('[data-act=stravaImport]'); await poll(async () => (await history()).length === 3);
    const entry = (await history()).find((entry) => entry.data.external?.channel === 'api'); assert.equal(entry.sessionName, 'COURSE_STRAVA_PRIVEE'); assert.equal(entry.data.external.id, '70001'); assert.equal(entry.data.external.private, true); assert.equal(entry.data.external.excludeAI, true); assert.doesNotMatch(JSON.stringify(entry), /GPS_NON_STOCKE|TEXTE_PRIVE_NON_IMPORTE/);
    await page.waitForFunction(() => document.querySelector('[data-change=stravaSelect][value="70001"]')?.disabled); assert.match(await page.locator('main').innerText(), /1 activité ajoutée/);
  });
  await step('activité déjà importée : rechargement marqué et doublon empêché', async () => {
    await page.click('[data-act=stravaPreview]'); await page.waitForSelector('[data-change=stravaSelect][value="70001"]'); assert.equal(await page.locator('[data-change=stravaSelect][value="70001"]').isDisabled(), true); assert.equal((await history()).length, 3);
  });
  await step('erreur fournisseur : message clair, aucun ancien aperçu applicable', async () => {
    activitiesError = true; await page.click('[data-act=stravaPreview]'); await page.waitForFunction(async () => !!(await import('/state.js')).S.connections.error);
    assert.equal(await page.locator('#strava-preview').count(), 0); assert.equal((await history()).length, 3); activitiesError = false;
  });
  await step('aperçu expiré : aucun appel import et question de rechargement conservée', async () => {
    await resetQuota(); await page.click('[data-act=stravaPreview]'); await page.waitForSelector('[data-change=stravaSelect][value="70002"]'); await page.check('[data-change=stravaSelect][value="70002"]');
    const before = apiCalls.filter((call) => call.path === ROOT + '/import').length;
    await page.evaluate(async () => { const { S, ACT } = await import('/state.js'); S.connections.preview.expiresAt = Date.now() - 1; await ACT.stravaImport(); });
    assert.equal(apiCalls.filter((call) => call.path === ROOT + '/import').length, before); assert.match(await page.locator('main').innerText(), /aperçu a expiré/); assert.equal((await history()).length, 3);
  });
  await step('déconnexion annulée puis confirmée : purge serveur/cache/fichier et révocation distante honnête', async () => {
    const deletes = apiCalls.filter((call) => call.method === 'DELETE').length;
    await page.click('[data-act=stravaDisconnect]'); await page.click('#dialog [data-dlg="0"]'); assert.equal(apiCalls.filter((call) => call.method === 'DELETE').length, deletes);
    revokeError = true; await page.click('[data-act=stravaDisconnect]'); await page.click('#dialog [data-dlg="1"]'); await page.waitForFunction(async () => (await import('/state.js')).S.connections.status.connected === false);
    await page.waitForFunction(async() => !(await import('/state.js')).S.connections.busy);
    assert.match(await page.locator('main').innerText(), /révocation.*pas.*confirmée/); assert.equal((await history()).length, 1);
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.history.some((entry) => entry.data.external?.provider === 'strava')), false);
    await page.reload(); await page.waitForSelector('nav.tabs'); await integration(); assert.equal((await history()).length, 1); assert.equal(await page.locator('#strava-preview').count(), 0); revokeError = false;
  });
  await step('snapshot historique en vol avant DELETE : ignoré après purge puis synchronisation fraîche', async () => {
    await resetQuota(); await page.check('[data-change=stravaConsent]'); await page.click('[data-act=stravaConnect]'); await page.waitForSelector('[data-act=stravaPreview]');
    await page.click('[data-act=stravaPreview]'); await page.waitForSelector('[data-change=stravaSelect][value="70001"]'); await page.check('[data-change=stravaSelect][value="70001"]'); await page.click('[data-act=stravaImport]'); await poll(async () => (await history()).length === 2);
    await page.waitForFunction(async () => { const { S } = await import('/state.js'); return !S.syncing && !S.connections.loading; });
    let releaseHistory, snapshot, released = false, freshReads = 0;
    routeOverride = async (request) => {
      if (request.method !== 'GET' || new URL(request.url).pathname !== '/api/history') return null;
      if (!releaseHistory) {
        const response = await worker.fetch(request, env); snapshot = await response.clone().json();
        return new Promise((resolve) => { releaseHistory = () => { released = true; resolve(response); }; });
      }
      if (released) freshReads++; return null;
    };
    await page.evaluate(async () => { window.__heldHistorySync = (await import('/state.js')).syncAll(); }); await poll(async () => !!releaseHistory);
    assert.equal(snapshot.history.some((entry) => entry.data.external?.provider === 'strava'), true);
    await page.click('[data-act=stravaDisconnect]'); await page.click('#dialog [data-dlg="1"]'); await page.waitForFunction(async () => (await import('/state.js')).S.connections.status.connected === false);
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.history.some((entry) => entry.data.external?.provider === 'strava')), false);
    releaseHistory(); await page.evaluate(async () => { await window.__heldHistorySync; });
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.history.some((entry) => entry.data.external?.provider === 'strava')), false);
    await poll(async () => freshReads > 0 && await page.evaluate(async () => !(await import('/state.js')).S.syncing)); routeOverride = null;
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.history.length), 1);
  });
  await step('lecture fichier tardive après changement de compte : aucun aperçu et aucune fuite', async () => {
    await page.locator('[data-act=importOpen][data-source=file]').first().click();
    await page.evaluate(async () => {
      const { CHG } = await import('/state.js'), input = document.querySelector('[data-change=importFile]');
      Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 100, text: () => new Promise((resolve) => { window.__fileRelease = resolve; }) }] }); window.__pendingFile = CHG.importFile(input);
    });
    await page.keyboard.press('Escape'); await go('#/settings/main', '[data-act=logout]'); await page.click('[data-act=logout]'); await page.click('#dialog [data-dlg="1"]'); await login('AppsOwnerB');
    await page.evaluate(async (file) => { window.__fileRelease(file); await window.__pendingFile; }, file);
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.imp), null); assert.equal(await page.locator('#sheet.open').count(), 0); await integration(); assert.doesNotMatch(await page.locator('main').innerText(), /COURSE_STRAVA_PRIVEE|ESCALADE_STRAVA_PRIVEE/); assert.equal((await history()).length, 0);
  });
  await step('réponse Strava tardive : ignorée après changement de compte', async () => {
    // Le compte B connecte lui-même l'athlète simulé pour tester une lecture en vol.
    await page.check('[data-change=stravaConsent]'); await page.click('[data-act=stravaConnect]'); await page.waitForSelector('[data-act=stravaPreview]');
    holdPreview = true; await page.click('[data-act=stravaPreview]'); await poll(async () => !!releasePreview);
    await go('#/settings/main', '[data-act=logout]'); await page.click('[data-act=logout]'); await page.click('#dialog [data-dlg="1"]'); await login('AppsOwnerA');
    const response = page.waitForResponse((response) => new URL(response.url()).pathname === ROOT + '/preview'); releasePreview(); holdPreview = false; await (await response).finished();
    await integration(); assert.equal(await page.locator('#strava-preview').count(), 0); assert.doesNotMatch(await page.locator('main').innerText(), /COURSE_STRAVA_PRIVEE|ESCALADE_STRAVA_PRIVEE/);
  });
  assert.deepEqual(errors, []); console.log(`\n${count} parcours applications connectées OK (Worker réel, fournisseur simulé)`);
} finally { if (releasePreview) releasePreview(); await browser.close(); env.DB.close?.(); globalThis.fetch = nativeFetch; }
