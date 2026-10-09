// Vrais clics : « ＋ Ajouter le mien ». Un choix écrit est reconnu quand l'app le connaît (il coche le sien), sinon il
// est ajouté pour ce compte, coché, nommé partout, et retirable dans Profil › Mes ajouts. Rien ne dépasse à 320 px.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('Ajouts');
assert.equal((await account.post('/api/items', { changes: [
  { c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid', 'physique', 'climbPerWeek'] } },
  { c: 'activity', id: 'act-conditioning', u: Date.now(), d: { preset: 'conditioning', label: 'Renforcement' } },
  { c: 'env', id: 'env-maison', u: Date.now(), d: { name: 'Maison', type: 'maison', equipment: ['mat'], isDefault: true } },
] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}), errors = [];
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const noOverflow = async () => assert.ok(await page.evaluate(() => { const w = document.documentElement.clientWidth; return w <= 321 && document.documentElement.scrollWidth <= w + 1 && [...document.querySelectorAll('#app *, #sheet .panel *')].filter((el) => el.offsetParent).every((el) => el.getBoundingClientRect().right <= w + 1); }), 'rien ne dépasse à 320 px');
const type = async (sel, text) => { await page.fill(sel, text); await page.press(sel, 'Enter'); };
const toast = () => page.locator('#toast').innerText();
const mine = () => page.evaluate(async () => (await import('/state.js')).itemsOf('choice').map((x) => ({ list: x.list, label: x.label, on: !!x.on, n: x.n })));
try {
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'Ajouts'); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);

  await step('Profil › Mes ajouts : chaque liste dit ce que l’app fait d’un ajout ; une zone écrite est cochée « en ce moment »', async () => {
    await page.evaluate(() => { location.hash = '#/profile/mine'; }); await page.waitForSelector('#main details.fold');
    assert.match(await page.locator('#main').innerText(), /Zones à ménager[\s\S]*Mon matériel[\s\S]*Mes envies de séance/);
    await page.locator('#main details.fold').first().locator('summary').click();
    await type('#main input[data-list=zone]', 'Hanche gauche');
    await page.waitForFunction(() => /Hanche gauche/.test(document.querySelector('#main')?.textContent || ''));
    assert.deepEqual(await mine(), [{ list: 'zone', label: 'Hanche gauche', on: true, n: undefined }]);
    assert.match(await page.locator('#main').innerText(), /à ménager en ce moment/); await noOverflow();
  });
  await step('une zone que l’app connaît (« poignet droit ») active vraiment « Poignets », sans doublon, et le garde', async () => {
    await type('#main input[data-list=zone]', 'poignet droit');
    await page.waitForFunction(() => /c’est « Poignets » dans l’app/.test(document.querySelector('#toast')?.textContent || ''));
    assert.equal((await mine()).length, 1, 'rien d’ajouté');
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.settings.avoid?.wrists), true, 'Poignets activé dans le profil');
    await page.reload(); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.settings.avoid?.wrists), true, 'toujours activé après rechargement');
    await page.evaluate(() => { location.hash = '#/profile/body'; }); await page.waitForSelector('form[data-submit=avoidSave]');
    assert.equal(await page.isChecked('form[data-submit=avoidSave] input[name=wrists]'), true, 'coché dans le profil');
    await page.evaluate(() => { location.hash = '#/profile/mine'; }); await page.waitForSelector('#main details.fold');
  });
  await step('Mon lieu : « ＋ Autre matériel » coche le matériel écrit ; il est nommé dans Mes lieux', async () => {
    await page.evaluate(() => { location.hash = '#/profile/equipment/env-maison'; }); await page.waitForSelector('[data-act=envEdit]');
    await page.click('[data-act=envEdit][data-id=env-maison]'); await page.waitForSelector('#sheet.open input[data-list=equipment]');
    await page.fill('#sheet input[name=name]', 'Maison (garage)');
    await type('#sheet input[data-list=equipment]', 'Sac de frappe');
    await page.waitForSelector('#sheet label.chip.on:has-text("Sac de frappe")');
    assert.equal(await page.inputValue('#sheet input[name=name]'), 'Maison (garage)', 'le formulaire n’est pas redessiné : rien de perdu');
    await type('#sheet input[data-list=equipment]', 'corde à sauter');
    await page.waitForFunction(() => document.querySelector('#sheet input[name=eq][value=rope]')?.checked);
    assert.equal(await page.locator('#sheet label.chip:has-text("Corde à sauter")').count(), 1, 'celle de l’app, pas un doublon'); await noOverflow();
    await page.click('#sheet form[data-submit=envSave] button[type=submit]'); await page.waitForSelector('#sheet.open', { state: 'detached' }).catch(() => {});
    await page.waitForFunction(() => /sac de frappe/i.test(document.querySelector('#main')?.textContent || ''));
    const eq = await page.evaluate(async () => (await import('/state.js')).item('env', 'env-maison').equipment);
    assert.ok(eq.includes('rope') && eq.some((k) => k.startsWith('my-')), JSON.stringify(eq));
  });
  await step('« Je n’ai rien prévu » : ma durée et mon envie écrites, comprises et gardées', async () => {
    await page.evaluate(async () => { location.hash = '#/home/dash'; const { ACT } = await import('/state.js'); ACT.nothingPlanned(); }); await page.waitForSelector('#sheet.open input[data-list=envie]');
    await type('#sheet input[data-list=minutes]', '1 h 15'); await page.waitForSelector('#sheet .chip.on:has-text("75 min")');
    await type('#sheet input[data-list=envie]', 'Gainage et tractions'); await page.waitForSelector('#sheet .chip.on:has-text("Gainage et tractions")');
    assert.match(await page.locator('#sheet').innerText(), /Ça oriente la séance vers :[\s\S]*(gainage|tirage)/i); await noOverflow();
    await page.click('#sheet [data-act=npGo]'); await page.waitForFunction(() => location.hash.startsWith('#/library/climbplan'));
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.cp?.intentText), 'Gainage et tractions', 'l’envie devient l’intention de la séance');
    assert.ok((await mine()).some((x) => x.list === 'minutes' && x.n === 75), 'la durée est proposée la prochaine fois');
  });
  await step('pendant la séance : la zone ajoutée est rappelée sur l’exercice, « Il me reste » accepte ma durée', async () => {
    await page.evaluate(async () => { const { S } = await import('/state.js'); S.settings.autoWarm = false; const { startPlayer } = await import('/player.js'); startPlayer({ id: 'chk-1', name: 'Test ajouts', exercises: [{ name: 'Gainage', block: 'main', mode: 'time', sets: 2, secMin: 30, secMax: 30, rest: 30 }, { name: 'Pompes', block: 'main', sets: 2, repsMin: 8, repsMax: 8, rest: 30 }] }, { fromGenerator: true }); });
    await page.waitForSelector('#player.open .cues');
    assert.match(await page.locator('#player .cues').first().innerText(), /À ménager : hanche gauche/);
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.pTime(); }); await page.waitForSelector('#sheet.open input[data-list=minutes]');
    assert.ok(await page.locator('#sheet .chip:has-text("75 min")').count(), 'ma durée est proposée');
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.closeSheet?.(); const p = await import('/player.js'); p.closePlayer?.(); });
  });
  await step('questionnaire : « ＋ Un autre sport » crée le sport et le coche ; un sport de l’app est simplement coché', async () => {
    await page.evaluate(async () => { document.getElementById('player')?.classList.remove('open'); document.body.classList.remove('noscroll'); const m = await import('/views-setup.js'); m.openSetup('quiz'); });
    await page.waitForSelector('.setup input[data-change=setOther]');
    await type('.setup input[data-change=setOther]', 'Basket'); await page.waitForSelector('.setup .choice.on:has-text("Basket")');
    await type('.setup input[data-change=setOther]', 'course à pied'); await page.waitForSelector('.setup .choice.on:has-text("Course")');
    const acts = await page.evaluate(async () => Object.values((await import('/state.js')).ctx().activities).map((a) => a.label));
    assert.ok(acts.includes('Basket'), acts.join(', ')); await noOverflow();
  });
  await step('retirer un ajout : il disparaît aussi du lieu où il était coché', async () => {
    await page.evaluate(() => { location.hash = '#/profile/mine'; }); await page.waitForSelector('#main [data-act=choiceDel]');
    const box = page.locator('#main details.fold').filter({ hasText: 'Mon matériel' });
    if (!(await box.evaluate((d) => d.open))) await box.locator('summary').click();
    await box.locator('[data-act=choiceDel]').first().click(); await page.waitForSelector('#dialog.open'); await page.click('#dialog.open .btn.danger');
    await page.waitForFunction(async () => !(await import('/state.js')).item('env', 'env-maison').equipment.some((k) => k.startsWith('my-')));
    assert.ok(!(await mine()).some((x) => x.list === 'equipment'));
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes « mes ajouts » E2E OK`);
} finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
