// Un compte sans maximum ne reçoit ni cotation ni objectif chiffré supposés.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const srv = await startServer();
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await context.newPage(), errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let count = 0;
const step = async (name, fn) => { await fn(); console.log('  ✓', name); count++; };
const pick = async (selector, value) => {
  const select = p.locator(selector); await select.waitFor({ state: 'attached' });
  if (!(await select.evaluate((x) => x.classList.contains('pick-hidden')))) return select.selectOption(value);
  await select.locator('xpath=following-sibling::button[contains(@class,"pickbtn")][1]').click();
  await p.locator(`#picker .setrow[data-v="${value}"]`).first().click();
};
try {
  const r = await context.request.post(srv.base + '/api/auth/register', { headers: { Origin: srv.base }, data: { username: 'SansMaximum', password: 'motdepasse1' } });
  assert.equal(r.status(), 200);
  await p.goto(srv.base); await p.waitForSelector('nav.tabs');
  await p.evaluate(async () => {
    const { S, putItem } = await import('/state.js');
    putItem('config', 'main', { tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] });
    putItem('activity', 'climbing_boulder', { preset: 'climbing_boulder', label: '' });
    S.settings.onboarded = true;
  });
  if (await p.locator('[data-act=setupSkip]').count()) await p.click('[data-act=setupSkip]');
  await p.evaluate(() => { location.hash = '#/library/climbplan'; });
  await p.waitForSelector('[data-act=cpQuick]');
  await step('génération sans maximum : exercices et difficulté au ressenti', async () => {
    await p.click('[data-act=cpSport][data-id=climbing_boulder]');
    await p.click('[data-act=cpQuick]'); await p.waitForSelector('#cpresult');
    const result = await p.evaluate(async () => (await import('/state.js')).S.cp.result);
    assert.ok(result.exercises.some((e) => e.group?.startsWith('cp-')));
    assert.match(result.notes.map((n) => n.text).join(' '), /Maximum de bloc non renseigné/);
    for (const e of result.exercises.filter((e) => e.group?.startsWith('cp-'))) {
      assert.doesNotMatch(e.name, /\b(?:[Bb]locs?|[Vv]oies?)\s+(?:U\d|[3-9](?:[a-cA-C]\+?|\+)?)(?:\b|$)|undefined|NaN/);
    }
  });
  await step('réglage de phase : aucune cotation préremplie, plage choisie et retour au ressenti', async () => {
    await p.click('[data-act=cpStep][data-d="-1"]'); await p.waitForSelector('[data-act=cpEdit]');
    const index = await p.evaluate(async () => (await import('/state.js')).S.cp.parts.findIndex((x) => x.type === 'climb'));
    await p.click(`[data-act=cpEdit][data-i="${index}"]`); await p.waitForSelector('[data-change=cpPartLv]', { state: 'attached' });
    assert.equal(await p.inputValue('#sheet [data-change=cpPartLv][data-k=from]'), '');
    assert.equal(await p.inputValue('#sheet [data-change=cpPartLv][data-k=to]'), '');
    assert.match(await p.locator('#sheet').innerText(), /Maximum non renseigné/);
    await pick('#sheet [data-change=cpPartLv][data-k=from]', '7');
    await pick('#sheet [data-change=cpPartLv][data-k=to]', '8');
    assert.equal(await p.inputValue('#sheet [data-change=cpPartLv][data-k=from]'), '7');
    assert.equal(await p.inputValue('#sheet [data-change=cpPartLv][data-k=to]'), '8');
    const chosen = await p.evaluate(async (i) => (await import('/state.js')).S.cp.parts[i], index);
    assert.equal(chosen.from, 7); assert.equal(chosen.to, 8);
    await p.click('#sheet [data-act=cpPartAuto]');
    assert.equal(await p.inputValue('#sheet [data-change=cpPartLv][data-k=from]'), '');
    assert.equal(await p.inputValue('#sheet [data-change=cpPartLv][data-k=to]'), '');
    await p.click('#sheet button[data-act=closeSheet]');
  });
  await step('objectif de cotation : aucun objectif implicite, choix requis puis respecté', async () => {
    await p.click('[data-act=cpRestart]'); await p.waitForSelector('[data-act=cpQuick]');
    await p.click('[data-act=cpStep][data-d="1"]'); await p.waitForSelector('[data-act=cpAim][data-id=grade]');
    await p.click('[data-act=cpAim][data-id=grade]'); await p.waitForSelector('[data-change=cpTargetSel]', { state: 'attached' });
    assert.equal(await p.inputValue('[data-change=cpTargetSel]'), '');
    assert.equal(await p.locator('[data-act=cpStep][data-d="1"]').isDisabled(), true);
    assert.match(await p.locator('main').innerText(), /aucune cible n’est supposée/);
    await p.evaluate(async () => (await import('/state.js')).ACT.cpGenerate());
    assert.equal(await p.evaluate(async () => (await import('/state.js')).S.cp.result), null);
    await pick('[data-change=cpTargetSel]', '8');
    assert.equal(await p.locator('[data-act=cpStep][data-d="1"]').isDisabled(), false);
    await p.click('[data-act=cpStep][data-d="1"]'); await p.waitForSelector('.cpart');
    assert.equal(await p.evaluate(async () => (await import('/state.js')).S.cp.target), 8);
    assert.match(await p.locator('main').innerText(), /Objectif/);
  });
  assert.deepEqual(errors, []);
  console.log(`\n${count} parcours des cotations sans performance supposée OK`);
} catch (e) {
  await p.screenshot({ path: '/tmp/escalade-grades-fail.png', fullPage: true }).catch(() => {}); throw e;
} finally {
  await browser.close(); await new Promise((resolve) => srv.server.close(resolve));
}
