// Vrais clics : le chrono propose ses formats (EMOM sur N minutes avec un exercice par minute, AMRAP avec compteur,
// pour le temps, chronomètre avec tours…), s'affiche en plein écran et garde le résultat dans l'historique.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('ChronoFormats');
assert.equal((await account.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } }] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const sheet = page.locator('#sheet.open'), timer = page.locator('#itimer');
const open = async (fmt) => { await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.timerOpen(); }); await sheet.waitFor(); await sheet.locator(`[data-act=timerFmt][data-id=${fmt}]`).click(); await sheet.locator(`input[name=format][value=${fmt}]`).waitFor({ state: 'attached' }); };
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#itimer *, #sheet .panel *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)), 'rien ne dépasse à 320 px');
try {
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'ChronoFormats'); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
  await step('six formats proposés, en liste ; EMOM sur 2 min, un exercice par intervalle qui tourne', async () => {
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.timerOpen(); }); await sheet.waitFor();
    assert.equal(await sheet.locator('[data-act=timerFmt]').count(), 6); await noOverflow();
    await sheet.locator('[data-act=timerFmt][data-id=emom]').click();
    await sheet.locator('input[name=every]').fill('30'); await sheet.locator('input[name=minutes]').fill('2'); await sheet.locator('textarea[name=text]').fill('10 squats\n8 tractions');
    await sheet.locator('button[type=submit]').click(); await timer.waitFor();
    await page.click('#itimer [data-act=timerSkip]'); // fin de la préparation
    assert.match(await timer.innerText(), /10 squats[\s\S]*Minute 1 \/ 4[\s\S]*Ensuite : 8 tractions/); await noOverflow();
    await page.click('#itimer [data-act=timerSkip]'); assert.match(await timer.innerText(), /8 tractions[\s\S]*Minute 2 \/ 4[\s\S]*Ensuite : 10 squats/);
    await page.click('#itimer [data-act=timerStop]'); await timer.waitFor({ state: 'detached' });
  });
  await step('AMRAP : circuit affiché, compteur de tours, résultat gardé dans l’historique', async () => {
    await open('amrap'); await sheet.locator('input[name=minutes]').fill('1'); await sheet.locator('textarea[name=text]').fill('5 tractions\n10 pompes'); await sheet.locator('button[type=submit]').click(); await timer.waitFor();
    await page.click('#itimer [data-act=timerSkip]'); assert.match(await timer.innerText(), /5 tractions[\s\S]*10 pompes/);
    for (let k = 0; k < 3; k++) await page.click('#itimer [data-act=timerRound]');
    assert.match(await timer.innerText(), /3 tours/); await noOverflow();
    await page.click('#itimer [data-act=timerSkip]'); await sheet.waitFor(); assert.match(await sheet.innerText(), /3 tours complets en 1 min/);
    await sheet.locator('[data-act=timerSave]').click();
    const h = await page.evaluate(async () => { const { S } = await import('/state.js'); return S.history[0] && { name: S.history[0].sessionName, note: S.history[0].data.note, ex: S.history[0].data.exercises.map((e) => e.name) }; });
    assert.deepEqual(h, { name: 'Chrono : Le plus de tours (AMRAP)', note: 'Le plus de tours (AMRAP) — 3 tours complets en 1 min', ex: ['5 tractions', '10 pompes'] });
  });
  await step('pour le temps et chronomètre : « Terminé » garde le temps, les tours sont notés', async () => {
    await open('fortime'); await sheet.locator('input[name=cap]').fill('0'); await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerSkip]');
    await page.waitForTimeout(1200); await page.click('#itimer [data-act=timerFinish]'); await sheet.waitFor(); assert.match(await sheet.innerText(), /Fait en 0:0[1-3]/);
    await page.locator('#sheet [data-act=closeSheet]').last().click();
    await open('stopwatch'); await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerSkip]');
    await page.waitForTimeout(600); await page.click('#itimer [data-act=timerLap]'); assert.match(await timer.innerText(), /Tours : 1\. 0:0/);
    await page.click('#itimer [data-act=timerFinish]'); await sheet.waitFor(); assert.match(await sheet.innerText(), /1 tour : 0:0/);
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes chrono E2E OK`);
} catch (error) { await page.screenshot({ path: '/tmp/escalade-chrono-fail.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
