// Vrais clics : créer une séance entièrement à sa façon (page blanche) — aucun sport imposé, exercices écrits un par
// ligne avec leurs nombres compris, parties libres, note par exercice, ordre changé, puis lancement.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('PageBlanche');
assert.equal((await account.post('/api/items', { changes: [
  { c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } },
  { c: 'activity', id: 'act-climbing_boulder', u: Date.now(), d: { preset: 'climbing_boulder', label: 'Escalade — bloc', archived: false } },
] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const sheet = page.locator('#sheet.open');
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#main *, #sheet .panel *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)), 'rien ne dépasse à 320 px');
const session = () => page.evaluate(async () => { const { S } = await import('/state.js'); const s = S.seances.items.find((x) => x.name !== 'zz' && x.source === 'manual'); return s && JSON.parse(JSON.stringify(s)); });
const names = () => page.locator('#main .item.ex b').allInnerTexts();
const moreOpen = () => page.locator('#main details:has(> summary[data-act=sMore])').evaluate((d) => d.open);
try {
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'PageBlanche'); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.loaded && S.sync === 'ok'; });
  await step('accueil : « À ma façon » ouvre une page blanche, sans sport imposé', async () => {
    await page.click('#main [data-act=newSeance]'); await page.waitForSelector('input[data-change=sName]');
    assert.match(await page.locator('#main').innerText(), /Ta séance est vide : écris-la comme tu veux/);
    assert.equal((await session()).activity, '', 'aucun sport choisi à ta place');
    assert.equal(await moreOpen(), false, 'les réglages facultatifs sont repliés');
    await noOverflow();
  });
  await step('écrire ses exercices, un par ligne : aperçu, parties, nombres compris', async () => {
    await page.click('#main [data-act=exWrite]'); await sheet.waitFor();
    await sheet.locator('textarea[name=text]').fill('Échauffement :\n5 min de corde à sauter\nCircuit A :\n4 × 8 tractions repos 2 min\nGainage 3 × 30 s\n6 × 400 m repos 1:30\nRetour au calme :\nÉtirements doux');
    await page.waitForFunction(() => /5 exercices prêts à ajouter/.test(document.querySelector('#exWritePrev')?.textContent || ''));
    assert.match(await sheet.locator('#exWritePrev').innerText(), /Circuit A[\s\S]*Tractions · 4 × 8 · repos 2 min/); await noOverflow();
    await sheet.locator('button[type=submit]').click(); await page.waitForSelector('#main .item.ex');
    assert.deepEqual(await names(), ['Corde à sauter', 'Tractions', 'Gainage', '400 m', 'Étirements doux']);
    const heads = await page.locator('#main .blockhead').allInnerTexts();
    assert.deepEqual(heads.map((t) => t.replace(/ · ~\d+ min[\s\S]*/, '')), ['🔥 Échauffement', 'Circuit A', '🧘 Retour au calme']);
    assert.match(await page.locator('#main').innerText(), /6 × 400 m · repos 1 min 30/); await noOverflow();
  });
  await step('fiche d’un exercice : nouvelle partie et note libres, enregistrées', async () => {
    await page.locator('#main .item.ex:has-text("Gainage") [data-act=exEdit]').click(); await sheet.waitFor();
    await sheet.locator('select[name=part]').selectOption('__new'); await sheet.locator('input[name=partNew]').fill('Finisher');
    await sheet.locator('input[name=note]').fill('Sur les coudes, dos plat'); await sheet.locator('form[data-submit=exSave] button[type=submit]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#main .blockhead')].some((b) => b.textContent.startsWith('Finisher')));
    const g = (await session()).exercises.find((e) => e.name === 'Gainage'); assert.deepEqual([g.part, g.note], ['Finisher', 'Sur les coudes, dos plat']);
    assert.match(await page.locator('#main .item.ex:has-text("Gainage")').innerText(), /Sur les coudes, dos plat/);
  });
  await step('ordre libre, nom et notes ; tout reste après rechargement', async () => {
    await page.locator('#main .item.ex:has-text("400 m") [data-act=exUp]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#main .item.ex b')].map((b) => b.textContent).indexOf('400 m') === 2);
    await page.fill('input[data-change=sName]', 'Ma séance du jeudi'); await page.press('input[data-change=sName]', 'Tab');
    await page.fill('textarea[data-change=sNotes]', 'Bien boire entre les blocs'); await page.press('textarea[data-change=sNotes]', 'Tab'); await page.waitForTimeout(600);
    await page.reload(); await page.waitForSelector('#main .item.ex');
    assert.equal(await page.locator('input[data-change=sName]').inputValue(), 'Ma séance du jeudi');
    assert.equal(await page.locator('textarea[data-change=sNotes]').inputValue(), 'Bien boire entre les blocs');
    assert.deepEqual(await names(), ['Corde à sauter', 'Tractions', '400 m', 'Gainage', 'Étirements doux']);
  });
  await step('réglages facultatifs : ouverts à la demande, restent ouverts ; un sport peut être choisi', async () => {
    await page.click('#main [data-act=sMore]'); assert.equal(await moreOpen(), true);
    await page.locator('#main select[data-change=sActivity] + .pickbtn').click(); await page.locator('#picker .setrow[data-v=climbing_boulder]').first().click();
    await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.seances.items.some((x) => x.activity === 'climbing_boulder'); });
    assert.equal(await moreOpen(), true, 'toujours ouvert après l’enregistrement'); await noOverflow();
    await page.reload(); await page.waitForSelector('#main .item.ex'); assert.equal(await moreOpen(), true, 'gardé ouvert sur cet appareil');
  });
  await step('lancer la séance écrite : le lecteur commence par le premier exercice', async () => {
    await page.click('#main [data-act=play]'); await page.waitForSelector('#player.open');
    assert.match(await page.locator('#player').innerText(), /Corde à sauter/);
    await page.click('#player [data-act=pQuit]'); await page.waitForSelector('#dialog.open [data-dlg="1"]'); await page.click('#dialog.open [data-dlg="1"]');
    await page.waitForSelector('#player.open [data-act=pDiscard], #player:not(.open)', { state: 'attached' });
    if (await page.locator('#player [data-act=pDiscard]').count()) { await page.click('#player [data-act=pDiscard]'); await page.waitForSelector('#dialog.open [data-dlg="1"]'); await page.click('#dialog.open [data-dlg="1"]'); }
  });
  await step('créateur guidé : la page blanche est proposée dès la première étape', async () => {
    await page.evaluate(async () => { const m = await import('/views-climbplan.js'); m.openWizard({ sport: 'climbing_boulder', auto: false }); });
    await page.waitForSelector('#main [data-act=newSeance]'); assert.match(await page.locator('#main [data-act=newSeance]').innerText(), /Je préfère l’écrire moi-même/);
    await page.click('#main [data-act=newSeance]'); await page.waitForSelector('#main [data-act=exWrite]');
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes séance à ma façon E2E OK`);
} catch (error) { await page.screenshot({ path: '/tmp/escalade-free-session-fail.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
