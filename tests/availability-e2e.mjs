// Vrais clics : « Mes disponibilités » avec le lieu de chaque créneau (ajout, modification, nouveau lieu créé depuis
// le créneau, suppression d'un seul créneau), puis la semaine automatique qui propose un sport faisable sur place.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('DispoLieu');
assert.equal((await account.post('/api/items', { changes: [
  { c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, perWeek: 3, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } },
  { c: 'activity', id: 'climbing_route', u: Date.now(), d: { preset: 'climbing_route', label: 'Escalade — voie', archived: false } },
  { c: 'activity', id: 'running', u: Date.now(), d: { preset: 'running', label: 'Course à pied', archived: false } },
  { c: 'env', id: 'abar', u: Date.now(), d: { name: 'Nicole Abar', type: 'escalade', equipment: ['wall', 'leadwall'], isDefault: true } },
] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block', timezoneId: 'Europe/Paris' }), page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const slotsNow = () => page.evaluate(async () => { const { item } = await import('/state.js'); return JSON.parse(JSON.stringify(item('config', 'availability')?.slots || [])); });
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#sheet .panel *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)), 'rien ne dépasse à 320 px');
const sheet = page.locator('#sheet.open');
// En mode simple, les outils de planning sont repliés sous « Programmes, disponibilités et autres outils de planning ».
const tool = async (act) => { const b = page.locator(`#main [data-act=${act}]`).first(); if (!(await b.isVisible())) await page.locator('#main details > summary').filter({ hasText: 'Programmes, disponibilités' }).first().click(); await b.click(); };
// Un jour de la semaine qui n'est pas aujourd'hui (le créneau du jour peut déjà être passé selon l'heure du test).
const other = await page.evaluate(() => ((new Date().getDay() + 6) % 7 + 2) % 7), dayName = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][other];
try {
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'DispoLieu'); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.loaded && S.sync === 'ok'; });
  await step('ajouter un créneau avec son lieu : enregistré, affiché dans la liste et dans le résumé', async () => {
    await page.evaluate(() => { location.hash = '#/home/cal'; }); await page.waitForSelector('#main [data-act=slotsOpen]', { state: 'attached' }); await tool('slotsOpen'); await sheet.waitFor();
    assert.match(await sheet.innerText(), /Aucun créneau pour l’instant/);
    await sheet.locator('label.chip').filter({ hasText: new RegExp(`^${dayName}$`) }).click();
    await sheet.locator('input[name=from]').fill('18:00'); await sheet.locator('input[name=to]').fill('20:00'); await sheet.locator('select[name=envId]').selectOption('abar');
    await sheet.locator('button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#sheet .setrow'));
    assert.deepEqual(await slotsNow(), [{ d: other, from: '18:00', to: '20:00', envId: 'abar' }]);
    assert.match(await sheet.locator('.setrow').first().innerText(), /18:00–20:00[\s\S]*📍 Nicole Abar/); await noOverflow();
    await page.locator('#sheet .sheet-tools [data-act=closeSheet]').click();
    assert.match(await page.locator('#main [data-act=slotsOpen]').first().textContent(), /18:00–20:00 à Nicole Abar/);
  });
  await step('même jour et mêmes heures avec un autre choix : le créneau est remplacé, pas dupliqué', async () => {
    await tool('slotsOpen'); await sheet.waitFor();
    await sheet.locator('label.chip').filter({ hasText: new RegExp(`^${dayName}$`) }).click(); await sheet.locator('select[name=envId]').selectOption('');
    await sheet.locator('button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#sheet .setrow small')?.textContent.includes('Lieu au choix'));
    assert.deepEqual(await slotsNow(), [{ d: other, from: '18:00', to: '20:00', envId: '' }]);
  });
  await step('modifier un créneau et créer un nouveau lieu sans quitter : retour au créneau avec ce lieu choisi', async () => {
    await sheet.locator('[data-act=slotEdit]').first().click(); await sheet.locator('form[data-submit=slotSave]').waitFor();
    await sheet.locator('input[name=to]').fill('20:30'); await sheet.locator('select[name=envId]').selectOption('__new');
    await sheet.locator('form[data-submit=envSave]').waitFor(); await sheet.locator('input[name=name]').fill('Pan de la maison'); await sheet.locator('form[data-submit=envSave] button[type=submit]').click();
    await sheet.locator('form[data-submit=slotSave]').waitFor();
    assert.equal(await sheet.locator('input[name=to]').inputValue(), '20:30', 'saisie gardée');
    const chosen = await sheet.locator('select[name=envId]').evaluate((s) => s.selectedOptions[0]?.textContent); assert.equal(chosen, 'Pan de la maison');
    await sheet.locator('form[data-submit=slotSave] button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#sheet form[data-submit=slotAdd]'));
    const sl = await slotsNow(); assert.equal(sl.length, 1); assert.equal(sl[0].to, '20:30'); assert.match(sl[0].envId, /^env-/); await noOverflow();
  });
  await step('semaine automatique : le jour du créneau à la salle, l’escalade est proposée à Nicole Abar', async () => {
    await sheet.locator('[data-act=slotEdit]').first().click(); await sheet.locator('select[name=envId]').selectOption('abar'); await sheet.locator('form[data-submit=slotSave] button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#sheet form[data-submit=slotAdd]')); await page.locator('#sheet .sheet-tools [data-act=closeSheet]').click();
    await tool('autoWeek'); await sheet.waitFor();
    const txt = await sheet.innerText(); assert.match(txt, /Escalade — voie · \d+ min[\s\S]*à « Nicole Abar »/); assert.doesNotMatch(txt, /Course à pied[^\n]*Nicole Abar/);
    const w = await page.evaluate(async () => { const { S } = await import('/state.js'); return S.autoWeek.sessions.map((s) => [s.activityId, s.envId]); });
    assert.deepEqual(w, [['climbing_route', 'abar']]); await noOverflow();
    await page.locator('#sheet [data-act=autoWeekSave]').click();
    await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.events.some((e) => e.meta?.kind === 'auto'); }, null, { timeout: 5000 }).catch(() => {});
    const ev = await page.evaluate(async () => { const { S } = await import('/state.js'); return S.events.map((e) => [e.meta?.kind, e.meta?.envId, e.title]); }); assert.deepEqual(ev.filter((e) => e[0] === 'auto').map((e) => e[1]), ['abar'], JSON.stringify(ev));
  });
  await step('supprimer un seul créneau', async () => {
    await tool('slotsOpen'); await sheet.waitFor(); await sheet.locator('[data-act=slotEdit]').first().click();
    await sheet.locator('[data-act=slotDel]').click(); await page.waitForFunction(() => document.querySelector('#sheet form[data-submit=slotAdd]'));
    assert.deepEqual(await slotsNow(), []); assert.match(await sheet.innerText(), /Aucun créneau pour l’instant/);
  });
  await step('créneau d’aujourd’hui avec un lieu : « Créer une séance » et « Je n’ai rien prévu » reprennent ce lieu et sa durée', async () => {
    const late = await page.evaluate(() => new Date().getHours() * 60 + new Date().getMinutes() >= 23 * 60 + 58);
    if (late) { console.log('    (23 h 58 passées : créneau du jour terminé, vérification sautée)'); return; }
    await page.evaluate(async (d) => { const { putItem, item } = await import('/state.js'); putItem('config', 'availability', { ...(item('config', 'availability') || {}), slots: [{ d, from: '00:00', to: '23:59', envId: 'abar' }] }); }, await page.evaluate(() => (new Date().getDay() + 6) % 7));
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.nothingPlanned(); });
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.np.env), 'abar'); await page.locator('#sheet .sheet-tools [data-act=closeSheet]').click();
    await page.evaluate(async () => { const m = await import('/views-climbplan.js'); m.openWizard({ sport: 'conditioning', auto: false }); });
    await page.waitForSelector('#main select[data-change=cpEnv]'); assert.equal(await page.locator('#main select[data-change=cpEnv]').inputValue(), 'abar');
    assert.match(await page.locator('#main').innerText(), /📍 Lieu de ton créneau du \S+ \(00:00–23:59\), d’après « Mes disponibilités »/);
    assert.equal(await page.locator('#main [data-act=cpMin]').filter({ hasText: 'Mon créneau (5 h)' }).count(), 1, 'durée du créneau proposée (plafonnée à 5 h)'); await noOverflow();
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes disponibilités avec lieu E2E OK`);
} catch (error) { await page.screenshot({ path: '/tmp/escalade-availability-fail.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
