// Vrais clics : un sport « jamais » (Profil › Mes sports) n'est plus proposé ; ses exercices et séances prêtes peuvent
// être masqués partout ; tout revient d'un toucher.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('SportsJamais');
assert.equal((await account.post('/api/items', { changes: [
  { c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } },
  { c: 'activity', id: 'act-climbing_boulder', u: Date.now(), d: { preset: 'climbing_boulder', label: 'Escalade — bloc', archived: false } },
  { c: 'activity', id: 'act-swimming', u: Date.now(), d: { preset: 'swimming', label: 'Natation', archived: false } },
] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const sheet = page.locator('#sheet.open');
const counts = () => page.evaluate(async () => {
  const { LIBRARY } = await import('/library.js'), { CATALOG } = await import('/catalog.js'), sp = await import('/sportprefs.js');
  return { ex: sp.visibleEx(LIBRARY).filter((x) => x.acts?.length && x.acts.every((a) => a === 'swimming')).length, cat: sp.visibleSessions(CATALOG).filter((c) => c.activity === 'swimming').length };
});
try {
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'SportsJamais'); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.loaded && S.sync === 'ok'; });
  const before = await counts(); assert.ok(before.ex > 0 && before.cat > 0, 'des exercices et séances de natation existent');
  await step('Mes sports : la natation passe à « Jamais », avec ses exercices et séances masqués', async () => {
    await page.evaluate(() => { location.hash = '#/profile/activities'; }); await page.waitForSelector('[data-act=sportPick][data-id=swimming]');
    assert.match(await page.locator('[data-act=sportPick][data-id=swimming]').innerText(), /Je le fais/);
    await page.click('[data-act=sportPick][data-id=swimming]'); await sheet.waitFor(); await sheet.locator('[data-act=sportSet][data-v=never]').click();
    await sheet.locator('input[data-change=sportHide]').check(); await page.waitForTimeout(200);
    assert.match(await page.locator('#main [data-act=sportPick][data-id=swimming]').innerText(), /Jamais[\s\S]*masqués/);
    const st = await page.evaluate(async () => { const { item, itemsOf } = await import('/state.js'); return { cfg: item('config', 'sports'), act: itemsOf('activity').find((a) => a.preset === 'swimming')?.archived }; });
    assert.deepEqual([st.cfg.never, st.cfg.neverHide, st.act], [['swimming'], ['swimming'], true]);
    assert.deepEqual(await counts(), { ex: 0, cat: 0 }, 'exercices et séances de natation masqués');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'rien ne dépasse à 320 px');
  });
  await step('plus jamais proposée : ni dans le créateur, ni dans le planning', async () => {
    await page.locator('#sheet .sheet-tools [data-act=closeSheet]').click();
    await page.evaluate(async () => { const m = await import('/views-climbplan.js'); m.openWizard({ sport: 'climbing_boulder', auto: false }); }); await page.waitForSelector('#main [data-act=cpSport]');
    assert.equal(await page.locator('#main [data-act=cpSport][data-id=swimming]').count(), 0, 'pas de natation dans les sports du créateur');
    assert.ok(await page.locator('#main [data-act=cpSport][data-id=running]').count() > 0, 'les autres sports restent proposés');
    await page.evaluate(async () => { const m = await import('/views-agenda.js'); m.openActivityPlan(); }); await sheet.waitFor();
    assert.equal(await sheet.locator('select[name=activityId] option[value=swimming]').count(), 0, 'pas de natation dans le planning');
  });
  await step('remettre le sport : un toucher, tout revient', async () => {
    await page.locator('#sheet .sheet-tools [data-act=closeSheet]').click();
    await page.evaluate(() => { location.hash = '#/profile/activities'; }); await page.waitForSelector('[data-act=sportPick][data-id=swimming]');
    await page.click('[data-act=sportPick][data-id=swimming]'); await sheet.waitFor(); await sheet.locator('[data-act=sportSet][data-v=on]').click(); await page.waitForTimeout(200);
    assert.match(await page.locator('#main [data-act=sportPick][data-id=swimming]').innerText(), /Je le fais/);
    assert.deepEqual(await counts(), before, 'exercices et séances à nouveau visibles');
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes sports « jamais » E2E OK`);
} catch (error) { await page.screenshot({ path: '/tmp/escalade-sports-never-fail.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
