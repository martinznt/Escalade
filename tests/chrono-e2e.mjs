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
    assert.match(await timer.innerText(), /10 squats[\s\S]*Intervalle 1 \/ 4[\s\S]*Ensuite : 8 tractions/); await noOverflow();
    await page.click('#itimer [data-act=timerSkip]'); assert.match(await timer.innerText(), /8 tractions[\s\S]*Intervalle 2 \/ 4[\s\S]*Ensuite : 10 squats/);
    await page.click('#itimer [data-act=timerStop]'); await timer.waitFor({ state: 'detached' });
  });
  await step('AMRAP : circuit affiché, compteur de tours, résultat gardé dans l’historique', async () => {
    await open('amrap'); await sheet.locator('input[name=minutes]').fill('1'); await sheet.locator('textarea[name=text]').fill('5 tractions\n10 pompes'); await sheet.locator('button[type=submit]').click(); await timer.waitFor();
    await page.click('#itimer [data-act=timerSkip]'); assert.match(await timer.innerText(), /5 tractions[\s\S]*10 pompes/);
    for (let k = 0; k < 3; k++) await page.click('#itimer [data-act=timerRound]');
    assert.match(await timer.innerText(), /3 tours/); await noOverflow();
    await page.click('#itimer [data-act=timerSkip]'); await sheet.waitFor(); assert.match(await sheet.innerText(), /3 tours complets en 0:0\d, arrêté avant la fin/, 'arrêté tôt : le vrai temps, pas la minute prévue');
    await sheet.locator('[data-act=timerSave]').click();
    const h = await page.evaluate(async () => { const { S } = await import('/state.js'); return S.history[0] && { name: S.history[0].sessionName, note: S.history[0].data.note, ex: S.history[0].data.exercises.map((e) => e.name) }; });
    assert.equal(h.name, 'Chrono : Le plus de tours (AMRAP)'); assert.match(h.note, /^Le plus de tours \(AMRAP\) — 3 tours complets en 0:0\d, arrêté avant la fin$/); assert.deepEqual(h.ex, ['5 tractions', '10 pompes']);
    assert.deepEqual(await page.evaluate(async () => (await import('/state.js')).S.history[0].data.exercises.map((e) => e.sets.filter((x) => x.done).length)), [3, 3], 'une série par tour fait');
  });
  await step('pour le temps et chronomètre : « Terminé » garde le temps, les tours sont notés', async () => {
    await open('fortime'); await sheet.locator('input[name=cap]').fill('0'); await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerSkip]');
    await page.waitForTimeout(1200); await page.click('#itimer [data-act=timerFinish]'); await sheet.waitFor(); assert.match(await sheet.innerText(), /Fait en 0:0[1-3]/);
    await page.locator('#sheet [data-act=closeSheet]').last().click();
    await open('stopwatch'); await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerSkip]');
    await page.waitForTimeout(600); await page.click('#itimer [data-act=timerLap]'); assert.match(await timer.innerText(), /Tours : 1\. 0:0/);
    await page.click('#itimer [data-act=timerFinish]'); await sheet.waitFor(); assert.match(await sheet.innerText(), /1 tour : 0:0/);
  });
  await step('mes chronos : un chrono gardé se relance en un toucher, puis se retire', async () => {
    await open('emom'); await sheet.locator('input[name=every]').fill('60'); await sheet.locator('input[name=minutes]').fill('12'); await sheet.locator('textarea[name=text]').fill('10 squats\n8 fentes');
    await sheet.locator('input[name=name]').fill('Jambes'); await sheet.locator('input[name=keep]').check();
    await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerStop]'); await timer.waitFor({ state: 'detached' });
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.timerOpen(); }); await sheet.waitFor();
    assert.match(await sheet.innerText(), /Mes chronos[\s\S]*Jambes[\s\S]*Chaque minute, pendant 12 min · 2 exercices/i); await noOverflow();
    await sheet.locator('[data-act=timerMine]').first().click(); await timer.waitFor(); assert.match(await timer.innerText(), /Jambes/);
    await page.click('#itimer [data-act=timerSkip]'); assert.match(await timer.innerText(), /10 squats[\s\S]*Minute 1 \/ 12/);
    await page.click('#itimer [data-act=timerStop]'); await timer.waitFor({ state: 'detached' });
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.timerOpen(); }); await sheet.waitFor();
    await sheet.locator('[data-act=timerMineDel]').first().click(); await page.waitForSelector('#dialog.open'); await page.click('#dialog.open .btn.danger');
    await page.waitForFunction(() => !document.querySelector('#sheet [data-act=timerMine]'));
    assert.equal(await page.evaluate(async () => (await import('/state.js')).itemsOf('chrono').length), 0);
  });
  await step('EMOM long : toutes les 10 s pendant 180 min = 1 080 intervalles, annoncés avant de démarrer', async () => {
    await open('emom'); await sheet.locator('input[name=every]').fill('10'); await sheet.locator('input[name=minutes]').fill('180');
    assert.match(await sheet.locator('#temom').innerText(), /1080 intervalles de 10 s, soit 3 h/);
    await sheet.locator('input[name=every]').fill('90'); await sheet.locator('input[name=minutes]').fill('10');
    assert.match(await sheet.locator('#temom').innerText(), /6 intervalles de 1 min 30 s, soit 9 min \(au lieu de 10 min\)/, 'durée non divisible : dite avant de démarrer'); await noOverflow();
    await sheet.locator('input[name=every]').fill('10'); await sheet.locator('input[name=minutes]').fill('180');
    await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerSkip]');
    assert.match(await timer.innerText(), /Intervalle 1 \/ 1080/);
    await page.click('#itimer [data-act=timerStop]'); await timer.waitFor({ state: 'detached' });
  });
  await step('efforts passés : enregistrés « non faits », jamais comptés comme réalisés', async () => {
    await open('intervals'); for (const [k, v] of [['work', '7'], ['rest', '3'], ['reps', '2'], ['sets', '1'], ['setRest', '0']]) await sheet.locator(`input[name=${k}]`).fill(v);
    await sheet.locator('input[name=name]').fill('Suspensions passées'); await sheet.locator('button[type=submit]').click(); await timer.waitFor();
    for (let k = 0; k < 4; k++) await page.click('#itimer [data-act=timerSkip]'); // préparation, effort, pause, effort
    await sheet.waitFor(); assert.match(await sheet.innerText(), /0 effort sur 2 \(2 passés\)/);
    await sheet.locator('[data-act=timerSave]').click();
    const h = await page.evaluate(async () => (await import('/state.js')).S.history.find((x) => x.sessionName === 'Chrono : Suspensions passées'));
    assert.deepEqual(h.data.exercises[0].sets.map((x) => x.done), [false, false]); assert.match(h.data.note, /0 effort sur 2/);
  });
  assert.deepEqual(errors, []);
  await step('écran éteint 185 s pendant un EMOM d’une minute : on reprend au 4e intervalle, environ 55 s restantes', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await ctx2.clock.install();
    const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(srv.base); await p2.click('[data-act=authPick][data-id=login]'); await p2.fill('[name=username]', 'ChronoFormats'); await p2.fill('[name=password]', 'motdepasse1'); await p2.click('form[data-submit=login] button[type=submit]');
    await p2.waitForSelector('nav.tabs'); await p2.waitForFunction(async () => (await import('/state.js')).S.loaded);
    await p2.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.timerOpen(); }); await p2.locator('#sheet.open [data-act=timerFmt][data-id=emom]').click();
    await p2.locator('#sheet.open input[name=every]').fill('60'); await p2.locator('#sheet.open input[name=minutes]').fill('12'); await p2.locator('#sheet.open textarea[name=text]').fill('');
    await p2.locator('#sheet.open button[type=submit]').click(); await p2.locator('#itimer').waitFor(); await p2.click('#itimer [data-act=timerSkip]');
    assert.match(await p2.locator('#itimer').innerText(), /Minute 1 \/ 12/);
    await p2.clock.fastForward(185000);
    await p2.waitForFunction(() => /Minute 4 \/ 12/.test(document.querySelector('#itimer')?.textContent || ''));
    const left = await p2.locator('#itimer .big-t').innerText(), [m, sec] = left.split(':').map(Number);
    assert.equal(m, 0); assert.ok(sec >= 53 && sec <= 55, `environ 55 s restantes (lu : ${left})`);
    await ctx2.close();
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes chrono E2E OK`);
} catch (error) { await page.screenshot({ path: '/tmp/escalade-chrono-fail.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
