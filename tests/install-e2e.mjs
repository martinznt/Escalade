// Vrais clics : « 📲 Installer » reconnaît l'appareil et le navigateur et montre les gestes exacts (iPhone Safari,
// navigateur intégré d'Instagram, Android, Firefox sur ordinateur), et lance l'installation directe quand le navigateur
// la propose. Rien ne dépasse à 320 px.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), account = new Client(env); await account.register('Installe');
assert.equal((await account.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } }] })).status, 200);
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}), errors = [];
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 341.0.0.0 (iPhone14,5; iOS 17_5; fr_FR)',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
async function open(ua, { width = 320, height = 760, mobile = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, userAgent: ua, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' }), page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.base); await page.click('[data-act=authPick][data-id=login]'); await page.fill('[name=username]', 'Installe'); await page.fill('[name=password]', 'motdepasse1'); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
  return { context, page };
}
const noOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#sheet .panel *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)), 'rien ne dépasse');
try {
  await step('iPhone (Safari) : la carte de l’accueil ouvre les gestes de Safari, pas à pas', async () => {
    const { context, page } = await open(UA.iphone);
    await page.waitForSelector('#main .install [data-act=installNow]'); assert.match(await page.locator('#main .install').innerText(), /gestes exacts/);
    await page.click('#main .install [data-act=installNow]'); await page.waitForSelector('#sheet.open');
    const t = await page.locator('#sheet').innerText();
    assert.match(t, /Installer sur iPhone \(Safari\)[\s\S]*iPhone · Safari/); assert.match(t, /Partager[\s\S]*Sur l’écran d’accueil[\s\S]*Ajouter/);
    assert.equal(await page.locator('#sheet .qrbox').count(), 0, 'pas de QR code sur le téléphone lui-même');
    assert.ok(await page.locator('#sheet [data-act=installCopy]').isVisible()); await noOverflow(page);
    await context.close();
  });
  await step('dans Instagram : ouvrir d’abord dans Safari, avec le lien à copier', async () => {
    const { context, page } = await open(UA.instagram);
    await page.waitForSelector('#main .install'); assert.match(await page.locator('#main .install').innerText(), /Ouvre d’abord le site dans Safari/);
    await page.click('#main .install [data-act=installNow]'); await page.waitForSelector('#sheet.open');
    assert.match(await page.locator('#sheet').innerText(), /Ouvre d’abord le site dans Safari[\s\S]*Ouvrir dans Safari/);
    // Les deux cas, sans dépendre du presse-papiers de la machine de test : copie acceptée, puis copie refusée.
    await page.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } }); });
    await page.click('#sheet [data-act=installCopy]');
    await page.waitForFunction(() => /Lien copié/.test(document.querySelector('#toast')?.textContent || ''));
    assert.equal(await page.evaluate(() => window.__copied), `${srv.base}/`, 'le lien du site est copié');
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('refusé')) } }); });
    await page.click('#sheet [data-act=installCopy]');
    await page.waitForSelector('#sheet input[readonly]');
    assert.equal(await page.inputValue('#sheet input[readonly]'), `${srv.base}/`, 'copie refusée : le lien est affiché, à copier à la main');
    await noOverflow(page);
    await context.close();
  });
  await step('Android sans proposition du navigateur : menu ⋮ › « Installer l’application »', async () => {
    const { context, page } = await open(UA.android);
    await page.click('#main .install [data-act=installNow]'); await page.waitForSelector('#sheet.open');
    assert.match(await page.locator('#sheet').innerText(), /Installer sur Android \(Chrome\)[\s\S]*⋮[\s\S]*Installer l’application/); await noOverflow(page);
    await context.close();
  });
  await step('Firefox sur ordinateur : réponse honnête, QR code pour le téléphone, carte visible en haut des Paramètres', async () => {
    const { context, page } = await open(UA.firefox, { width: 1280, height: 900, mobile: false });
    await page.evaluate(() => { location.hash = '#/settings/main'; }); await page.waitForSelector('#main .setmain [data-act=installNow]');
    assert.equal(await page.locator('#settings-more [data-act=installNow]').count(), 0, 'plus cachée dans « Autres options »');
    await page.click('#main .setmain [data-act=installNow]'); await page.waitForSelector('#sheet.open');
    assert.match(await page.locator('#sheet').innerText(), /Firefox sur ordinateur[\s\S]*ne sait pas installer[\s\S]*Chrome ou Edge/);
    await page.locator('#sheet summary').filter({ hasText: 'L’installer sur ton téléphone' }).click(); assert.equal(await page.locator('#sheet .qrbox svg').count(), 1);
    await context.close();
  });
  await step('Chrome : quand le navigateur propose l’installation, un seul toucher la lance', async () => {
    const { context, page } = await open(UA.chrome, { width: 390, height: 844 });
    await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); window.__prompted = 0; e.prompt = () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
    await page.waitForFunction(() => /Un toucher/.test(document.querySelector('#main .install')?.textContent || ''));
    await page.click('#main .install [data-act=installNow]');
    await page.waitForFunction(() => /Installation en cours/.test(document.querySelector('#toast')?.textContent || ''));
    assert.equal(await page.evaluate(() => window.__prompted), 1); assert.equal(await page.locator('#sheet.open').count(), 0, 'pas de fenêtre de gestes');
    await context.close();
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes installation E2E OK`);
} finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
