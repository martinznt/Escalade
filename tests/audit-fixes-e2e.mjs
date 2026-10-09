// Vrais clics : petites corrections de l'audit du 9 octobre 2026, vérifiées dans le navigateur.
//  · B10 le rappel d'un rendez-vous ouvre le calendrier ; B14 un lien mal encodé ne bloque pas le démarrage ;
//  · B11–B13 états ARIA « true » / « false », jauges et liste du son nommées ;
//  · B17 le bandeau de mise à jour ne recouvre ni la séance ni l'éditeur « Organiser » ; B18 pas de double ajout ;
//  · B03 « Tout » sélectionne vraiment les séances ; B04 une photo de progrès se supprime (index et image).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('AuditFixes');
assert.equal((await account.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } }] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const go = async (hash, selector) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(selector); };
const loaded = () => page.waitForFunction(async () => (await import('/state.js')).S.loaded);
/** Attributs ARIA d'état : jamais vides (« true » / « false », ou une valeur permise). */
const badAria = () => page.evaluate(() => [...document.querySelectorAll('[aria-checked],[aria-pressed],[aria-expanded],[aria-selected]')].flatMap((el) => ['aria-checked', 'aria-pressed', 'aria-expanded', 'aria-selected'].filter((a) => el.hasAttribute(a) && !['true', 'false', 'mixed'].includes(el.getAttribute(a))).map((a) => `${a}="${el.getAttribute(a)}" sur ${el.outerHTML.slice(0, 80)}`)));

try {
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'AuditFixes'); await page.fill('[name=password]', 'motdepasse1');
  await page.click('form[data-submit=login] button[type=submit]'); await page.waitForSelector('nav.tabs'); await loaded();
  await step('B10 : l’adresse du rappel de rendez-vous (#/home/cal) ouvre le calendrier', async () => {
    await go('#/home/cal', '#main .cal'); assert.ok(await page.locator('#main .cal').isVisible());
  });
  await step('B14 : un lien mal encodé, puis un vrai rechargement : l’app démarre et se navigue', async () => {
    await page.goto(srv.base + '/#/profile/perfs/%'); await page.reload(); await page.waitForSelector('nav.tabs'); await loaded();
    assert.doesNotMatch(await page.locator('body').innerText(), /URI malformed/);
    await page.click('nav.tabs [data-act=tab][data-id=home], nav.tabs button:first-child'); await page.waitForSelector('#main');
    const out = await browser.newContext({ serviceWorkers: 'block' }), visitor = await out.newPage(), outErrors = [];
    visitor.on('pageerror', (e) => outErrors.push(e.message));
    await visitor.goto(srv.base + '/#/profile/public/%'); await visitor.waitForSelector('#app main'); await visitor.reload(); await visitor.waitForSelector('#app main');
    assert.deepEqual(outErrors, [], 'sans compte non plus'); await out.close();
  });
  await step('B11 : choix radio et boutons à état disent « true » ou « false » (records, catalogue, réglages)', async () => {
    for (const [hash, sel] of [['#/profile/perfs', '#main'], ['#/library/catalog', '#main [role=radio], #main .card'], ['#/settings/display', '#main'], ['#/library/seances', '#main']]) {
      await go(hash, sel); await page.waitForTimeout(150);
      assert.deepEqual(await badAria(), [], hash);
    }
    await go('#/library/catalog', '#main'); const radios = await page.locator('[role=radio]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
    assert.ok(radios.length > 0 && radios.includes('true') && radios.includes('false'), 'des radios cochées et non cochées, toutes renseignées');
  });
  await step('B12 : chaque jauge du bilan physique a un nom', async () => {
    await go('#/profile/bilan', '#main [role=progressbar]');
    const names = await page.locator('[role=progressbar]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
    assert.ok(names.length > 0 && names.every((n) => n.trim().length > 2), JSON.stringify(names));
  });
  await step('B13 : la liste « Son dans l’app » est nommée', async () => {
    await go('#/settings/notifs', 'select[name=notifSound]');
    assert.equal(await page.locator('select[name=notifSound]').getAttribute('aria-label'), 'Son des notifications dans l’app');
  });
  await step('B18 : deux envois synchrones du même texte n’ajoutent l’exercice qu’une fois', async () => {
    await page.evaluate(async () => { (await import('/state.js')).saveSeance({ id: 's-double', name: 'Double envoi', exercises: [{ id: 'e1', name: 'Squats', mode: 'reps', sets: 3, repsMin: 8, repsMax: 8 }] }); });
    await go('#/library/seance/s-double', '#main [data-act=exWrite]'); await page.click('#main [data-act=exWrite]'); await page.waitForSelector('#sheet.open textarea[name=text]');
    await page.fill('#sheet textarea[name=text]', '10 pompes');
    await page.locator('#sheet form button[type=submit]').evaluate((b) => { b.click(); b.click(); });
    await page.waitForFunction(() => document.querySelectorAll('#main .item.ex').length >= 2); await page.waitForTimeout(300);
    assert.equal(await page.locator('#main .item.ex').count(), 2);
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.seances.items.find((s) => s.id === 's-double').exercises.length), 2);
  });
  await step('B03 : Mes séances › Sélectionner plusieurs › « Tout » sélectionne vraiment toutes les séances', async () => {
    await page.evaluate(async () => { (await import('/state.js')).saveSeance({ id: 's-deux', name: 'Deuxième séance', exercises: [{ id: 'e2', name: 'Pompes', mode: 'reps', sets: 3, repsMin: 10, repsMax: 10 }] }); });
    await go('#/library/seances', '#main [data-act=selStart]'); await page.click('#main [data-act=selStart]'); await page.click('#main [data-act=selAll]');
    await page.waitForFunction(() => /2 sélectionnée\(s\)/.test(document.querySelector('#main .selbar')?.textContent || ''));
    assert.deepEqual((await page.evaluate(async () => (await import('/state.js')).S.sel)).sort(), ['s-deux', 's-double']);
    assert.equal(await page.locator('#main .selbar [data-act=selBulk][data-id=place]').isDisabled(), false, 'actions groupées utilisables');
    await page.click('#main [data-act=selEnd]');
  });
  await step('B04 : comparer deux photos de progrès puis « Supprimer » : confirmation, puis la photo et son image quittent l’appareil', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
    for (const name of ['avant.png', 'apres.png']) {
      await page.evaluate(async () => { const { ACT } = await import('/state.js'); await ACT.photosOpen(); }); await page.waitForSelector('#sheet.open input[data-change=photoAdd]', { state: 'attached' });
      await page.setInputFiles('#sheet input[data-change=photoAdd]', { name, mimeType: 'image/png', buffer: png }); await page.waitForFunction((n) => document.querySelectorAll('#sheet .pthumb').length === n, name === 'avant.png' ? 1 : 2);
    }
    for (const k of [0, 1]) await page.locator('#sheet .pthumb').nth(k).click();
    await page.click('#sheet [data-act=photoCompare]'); await page.waitForSelector('#sheet [data-act=progressPhotoDel]');
    await page.locator('#sheet [data-act=progressPhotoDel]').first().click(); await page.waitForSelector('#dialog.open');
    assert.match(await page.locator('#dialog.open').innerText(), /Supprimer cette photo/); await page.click('#dialog.open [data-dlg="1"]');
    await page.waitForFunction(() => document.querySelectorAll('#sheet .pthumb').length === 1);
    const keys = await page.evaluate(async () => { const { idb, S } = await import('/state.js'); const all = await idb.keys(), id = S.user.id; return { index: (await idb.get(`photos:${id}`)).length, images: all.filter((k) => k.startsWith(`photos:${id}:`)).length }; });
    assert.deepEqual(keys, { index: 1, images: 1 }, 'index et image retirés');
    await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); });
  });
  await step('B17 : le bandeau « mis à jour » s’efface pendant la séance et dans « Organiser », puis revient', async () => {
    await page.evaluate(() => localStorage.setItem('sea:seen-build', JSON.stringify({ build: 'ancienne-version', at: Date.now() - 86400000 })));
    await page.reload(); await loaded(); await page.waitForSelector('#updbar');
    await go('#/library/seance/s-double', '#main [data-act=play]'); await page.click('#main [data-act=play]'); await page.waitForSelector('#player.open');
    assert.equal(await page.locator('#updbar').isVisible().catch(() => false), false, 'pas devant le lecteur');
    const covered = await page.evaluate(() => [...document.querySelectorAll('#player.open button')].filter((b) => { const r = b.getBoundingClientRect(); if (!r.width || r.bottom > innerHeight) return false; const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top && !b.contains(top) && top.closest('#updbar'); }).length);
    assert.equal(covered, 0, 'aucun bouton du lecteur recouvert');
    await page.click('#player [data-act=pQuit]'); await page.waitForSelector('#dialog.open [data-dlg="1"]'); await page.click('#dialog.open [data-dlg="1"]');
    await page.waitForSelector('#player.open [data-act=pDiscard], #player:not(.open)', { state: 'attached' });
    if (await page.locator('#player [data-act=pDiscard]').count()) { await page.click('#player [data-act=pDiscard]'); await page.waitForSelector('#dialog.open [data-dlg="1"]'); await page.click('#dialog.open [data-dlg="1"]'); }
    await page.waitForSelector('#player:not(.open)', { state: 'attached' }); await page.waitForSelector('#updbar', { state: 'visible' });
    await go('#/library/seances', '[data-act=layEdit]'); await page.click('[data-act=layEdit]'); await page.waitForSelector('[data-act=layPreview]');
    assert.equal(await page.locator('#updbar').isVisible().catch(() => false), false, 'pas devant « Organiser »');
    await page.click('[data-act=layPreview]'); await page.waitForSelector('[data-act=layBack]');
    await page.click('[data-act=layBack]'); await page.click('[data-act=layQuit]');
    if (await page.locator('#dialog.open [data-dlg="1"]').count()) await page.click('#dialog.open [data-dlg="1"]');
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes corrections de l’audit E2E OK`);
} catch (error) { await page.screenshot({ path: '/tmp/escalade-audit-fixes-fail.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
