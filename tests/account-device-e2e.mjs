// Vrais clics, un seul navigateur partagé : ce qui n'est gardé que sur l'appareil (brouillon du chrono, photos de
// progrès, réglages locaux) reste au compte qui l'a créé. Une vraie déconnexion puis la connexion d'un autre compte ne
// montrent rien du premier ; la suppression du compte efface ses photos de l'appareil ; un invité qui crée son compte
// garde ses photos.
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

/* Une petite image PNG valide (pour le vrai import d'une photo). */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = ~0; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
function png(w, h, rgb) {
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = { name: 'progres.png', mimeType: 'image/png', buffer: png(8, 8, [200, 40, 40]) };

const env = makeEnv(), accounts = {};
for (const name of ['DeviceAlice', 'DeviceBob']) {
  const client = new Client(env); await client.register(name); accounts[name] = client;
  assert.equal((await client.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } }] })).status, 200);
}
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const sheet = page.locator('#sheet.open'), timer = page.locator('#itimer');

const login = async (name) => {
  if (await page.locator('[data-act=authPick][data-id=login]').count()) await page.click('[data-act=authPick][data-id=login]');
  await page.waitForSelector('form[data-submit=login]'); await page.fill('[name=username]', name); await page.fill('[name=password]', 'motdepasse1');
  await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
  return page.evaluate(async () => (await import('/state.js')).S.user.id);
};
const logout = async () => {
  await page.evaluate(() => { location.hash = '#/settings/main'; }); await page.waitForSelector('[data-act=logout]');
  await page.click('[data-act=logout]'); await page.click('#dialog.open [data-dlg="1"]'); await page.waitForSelector('form[data-submit=login]');
};
const openEmom = async () => {
  await page.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.timerOpen(); }); await sheet.waitFor();
  await sheet.locator('[data-act=timerFmt][data-id=emom]').click(); await sheet.locator('input[name=format][value=emom]').waitFor({ state: 'attached' });
  return { text: await sheet.locator('textarea[name=text]').inputValue(), every: await sheet.locator('input[name=every]').inputValue(), minutes: await sheet.locator('input[name=minutes]').inputValue() };
};
const startStop = async () => { await sheet.locator('button[type=submit]').click(); await timer.waitFor(); await page.click('#itimer [data-act=timerStop]'); await timer.waitFor({ state: 'detached' }); };
const local = () => page.evaluate(async () => {
  const { idb } = await import('/state.js'), ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('sea:')) ls[k] = localStorage.getItem(k); }
  return { ls, idb: await idb.keys() };
});
const addPhoto = async () => {
  await page.evaluate(async () => { const { ACT } = await import('/state.js'); await ACT.photosOpen(); }); await sheet.waitFor();
  await page.setInputFiles('#sheet input[data-change=photoAdd]', PHOTO);
  await page.waitForFunction(() => /Photo gardée/.test(document.querySelector('#toast')?.textContent || ''));
  await page.waitForSelector('#sheet .pthumb img');
};
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#sheet .panel *, #dialog *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)), 'rien ne dépasse');

try {
  let aliceId = '', bobId = '';
  await page.goto(srv.base);
  await step('ancien brouillon commun à l’appareil (avant 8.34.1) : effacé, jamais prérempli', async () => {
    await page.evaluate(() => localStorage.setItem('sea:timer2', JSON.stringify({ format: 'emom', cfgs: { emom: { every: 45, minutes: 9, text: 'PRIVÉ-ANCIEN-BROUILLON' } } })));
    aliceId = await login('DeviceAlice');
    const f = await openEmom();
    assert.equal(f.text, ''); assert.equal(f.every, '60'); assert.equal(f.minutes, '12');
    assert.equal((await local()).ls['sea:timer2'], undefined, 'l’ancienne clé commune est retirée');
  });
  await step('Alice : son brouillon de chrono et sa photo de progrès restent à elle', async () => {
    await sheet.locator('textarea[name=text]').fill('PRIVÉ-ALICE-EXERCICE\n8 tractions'); await sheet.locator('input[name=minutes]').fill('7');
    await startStop();
    assert.equal((await openEmom()).text, 'PRIVÉ-ALICE-EXERCICE\n8 tractions');
    await addPhoto();
    const st = await local();
    assert.match(st.ls[`sea:timer2:${aliceId}`] || '', /PRIVÉ-ALICE-EXERCICE/);
    assert.ok(st.idb.includes(`photos:${aliceId}`) && st.idb.some((k) => k.startsWith(`photos:${aliceId}:`)), 'index et image de la photo sous le compte d’Alice');
  });
  await step('Bob, même navigateur, après une vraie déconnexion : valeurs par défaut, rien d’Alice', async () => {
    await page.keyboard.press('Escape'); await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); });
    await logout(); bobId = await login('DeviceBob');
    const f = await openEmom();
    assert.equal(f.text, '', 'le texte privé d’Alice n’est pas prérempli pour Bob'); assert.equal(f.minutes, '12');
    assert.doesNotMatch(await page.locator('body').innerText(), /PRIVÉ-ALICE/);
    await sheet.locator('textarea[name=text]').fill('B-EXERCICE'); await startStop();
    await page.evaluate(async () => { const { ACT } = await import('/state.js'); await ACT.photosOpen(); }); await sheet.waitFor();
    assert.equal(await sheet.locator('.pthumb').count(), 0, 'aucune photo d’Alice dans la galerie de Bob'); await noOverflow();
    await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); });
  });
  await step('retour d’Alice : son brouillon est revenu', async () => {
    await logout(); assert.equal(await login('DeviceAlice'), aliceId);
    assert.equal((await openEmom()).text, 'PRIVÉ-ALICE-EXERCICE\n8 tractions');
    await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); });
  });
  await step('suppression du compte d’Alice : ses photos et réglages locaux quittent l’appareil, ceux de Bob restent', async () => {
    await page.evaluate(() => { location.hash = '#/settings/main'; }); await page.waitForSelector('[data-act=delAccount]', { state: 'attached' });
    await page.locator('summary', { hasText: 'Gérer mon compte' }).click(); await page.click('[data-act=delAccount]'); await page.waitForSelector('#dialog.open');
    assert.match(await page.locator('#dialog.open').innerText(), /photos de progrès sont effacées de cet appareil/); await noOverflow();
    await page.click('#dialog.open [data-dlg="1"]');
    await page.waitForSelector('#sheet.open form[data-submit=delacct]'); await page.fill('#sheet form[data-submit=delacct] [name=password]', 'motdepasse1');
    await page.click('#sheet form[data-submit=delacct] button[type=submit]');
    await page.waitForSelector('form[data-submit=register]');
    const st = await local();
    assert.deepEqual(st.idb.filter((k) => k.includes(aliceId)), [], 'plus aucune donnée d’Alice dans IndexedDB (données, index et images des photos)');
    assert.deepEqual(Object.keys(st.ls).filter((k) => k.endsWith(':' + aliceId)), [], 'plus aucun réglage local d’Alice');
    assert.match(st.ls[`sea:timer2:${bobId}`] || '', /B-EXERCICE/, 'le brouillon de Bob n’est pas touché');
    assert.equal((await accounts.DeviceAlice.get('/api/auth/me')).status, 401, 'le compte est bien supprimé côté serveur');
  });
  await step('invité qui crée son compte : ses photos et son brouillon de chrono le suivent', async () => {
    await page.click('form[data-submit=register] ~ [data-act=authPick][data-id=""], [data-act=authPick][data-id=""]').catch(() => {});
    await page.waitForSelector('[data-act=guestStart]'); await page.click('[data-act=guestStart]');
    await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
    await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); const m = await import('/state.js'); m.S.settings.autoWarm = false; });
    await openEmom(); await sheet.locator('textarea[name=text]').fill('INVITÉ-EXERCICE'); await startStop();
    await addPhoto(); await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); });
    assert.ok((await local()).idb.includes('photos:guest'));
    await page.evaluate(() => { location.hash = '#/settings/main'; }); await page.waitForSelector('[data-act=guestUpgrade]'); await page.click('[data-act=guestUpgrade]');
    await page.waitForSelector('form[data-submit=register]'); await page.fill('[name=username]', 'DeviceGuest'); await page.fill('[name=password]', 'motdepasse1');
    await page.click('form[data-submit=register] button[type=submit]'); await page.waitForSelector('nav.tabs');
    await page.waitForFunction(async () => { const { S } = await import('/state.js'); return S.loaded && S.user && !S.user.guest; });
    const id = await page.evaluate(async () => (await import('/state.js')).S.user.id), st = await local();
    assert.ok(st.idb.includes(`photos:${id}`) && st.idb.some((k) => k.startsWith(`photos:${id}:`)), 'la photo est passée au nouveau compte');
    assert.deepEqual(st.idb.filter((k) => k.startsWith('photos:guest')), [], 'plus rien sous l’invité');
    assert.match(st.ls[`sea:timer2:${id}`] || '', /INVITÉ-EXERCICE/); assert.equal(st.ls['sea:timer2:guest'], undefined);
    await page.evaluate(async () => { (await import('/ui.js')).closeSheet(); const { ACT } = await import('/state.js'); await ACT.photosOpen(); }); await sheet.waitFor();
    assert.equal(await sheet.locator('.pthumb').count(), 1, 'la photo s’affiche dans la galerie du compte');
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes comptes sur un même appareil E2E OK`);
} finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
