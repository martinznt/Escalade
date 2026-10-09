// Vrais clics : « 📥 Exporter » puis « 📤 Importer un JSON ».
//  · Sur un autre compte (Alice existant toujours) : séance, historique, rendez-vous, lieu, ajout et chrono arrivent
//    sur le serveur, liens gardés, sans refus (409) ni doublon en important deux fois ; Alice garde tout.
//  · Une séance supprimée depuis la sauvegarde : laissée supprimée si on le dit, récupérée si on le choisit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env = makeEnv(), accounts = {};
for (const name of ['BackupAlice', 'BackupBob']) {
  const client = new Client(env); await client.register(name); accounts[name] = client;
  assert.equal((await client.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid'] } }] })).status, 200);
}
const srv = await startServer(env), browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true }), page = await context.newPage(), errors = [], refused = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() === 409) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`); });
let count = 0; const step = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };

const login = async (name) => {
  if (await page.locator('[data-act=authPick][data-id=login]').count()) await page.click('[data-act=authPick][data-id=login]');
  await page.waitForSelector('form[data-submit=login]'); await page.fill('[name=username]', name); await page.fill('[name=password]', 'motdepasse1');
  await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
};
const logout = async () => {
  await page.evaluate(() => { location.hash = '#/settings/main'; }); await page.waitForSelector('[data-act=logout]');
  await page.click('[data-act=logout]'); await page.click('#dialog.open [data-dlg="1"]'); await page.waitForSelector('form[data-submit=login]');
};
const synced = async () => {
  await page.evaluate(async () => { await (await import('/state.js')).syncAll(); });
  await page.waitForFunction(async () => { const m = await import('/state.js'); return m.S.sync === 'ok' && !m.S.syncing && m.pendingCount() === 0; }, null, { timeout: 20000 });
};
const dataPage = async () => { await page.evaluate(() => { location.hash = '#/settings/data'; }); await page.waitForSelector('[data-act=export]'); };
const exportFile = async () => {
  await dataPage();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  return { name: 'sauvegarde.json', mimeType: 'application/json', buffer: await readFile(await download.path()) };
};
const importFile = async (file) => {
  await dataPage(); await page.evaluate(() => { const t = document.querySelector('#toast'); if (t) { t.className = ''; t.textContent = ''; } });
  await page.setInputFiles('input[data-change=importJson]', file); await page.waitForSelector('#dialog.open');
  return page.locator('#dialog.open').innerText();
};
const toastText = async () => { await page.waitForFunction(() => /Importé/.test(document.querySelector('#toast')?.textContent || '')); return page.locator('#toast').innerText(); };
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#dialog *')].every((el) => el.getBoundingClientRect().right <= innerWidth + 1)), 'rien ne dépasse');

try {
  let file, aliceId = '';
  await page.goto(srv.base);
  await step('Alice : séance, historique lié à un rendez-vous, lieu, ajout et chrono, puis export', async () => {
    await login('BackupAlice'); aliceId = await page.evaluate(async () => (await import('/state.js')).S.user.id);
    await page.evaluate(async () => {
      const m = await import('/state.js'), day = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('en-CA'); };
      m.saveSeance({ id: 's-backup', name: 'Sauvegarde transportable', activity: 'conditioning', exercises: [{ id: 'e1', name: 'Tractions', mode: 'reps', sets: 4, repsMin: 8, repsMax: 8, rest: 120 }] });
      m.saveEvent({ id: 'ev-backup', date: day(3), time: '18:30', sessionId: 's-backup', title: 'Sauvegarde transportable' });
      m.addHistory({ id: 'h-backup', sessionId: 's-backup', sessionName: 'Sauvegarde transportable', startedAt: Date.now() - 86400000, durationSeconds: 1800, data: { activity: 'conditioning', agenda: { eventId: 'ev-backup', occurrenceDate: day(-1) }, exercises: [] } });
      m.putItem('env', 'env-backup', { name: 'Salle sauvegardée', type: 'gym', equipment: ['bar'] });
      m.putItem('choice', 'my-zone-backup', { list: 'zone', label: 'Hanche gauche', on: true });
      m.putItem('chrono', 'chrono-backup', { name: 'Chrono sauvegardé', format: 'emom', every: 60, minutes: 10 });
    });
    await synced(); file = await exportFile();
    const d = JSON.parse(file.buffer.toString('utf8'));
    assert.equal(d.owner, aliceId, 'le fichier dit à quel compte il appartient');
    assert.ok(d.history.some((x) => x.id === 'h-backup') && d.events.some((x) => x.id === 'ev-backup'));
  });
  await step('Bob importe la sauvegarde d’Alice (deux fois) : tout arrive, sans refus ni doublon', async () => {
    await logout(); await login('BackupBob');
    assert.match(await importFile(file), /autre compte[\s\S]*liens/); await noOverflow();
    await page.click('#dialog.open [data-dlg="1"]'); assert.match(await toastText(), /1 séance\(s\)[\s\S]*1 historique\(s\), 1 rendez-vous/);
    await synced();
    await importFile(file); await page.click('#dialog.open [data-dlg="1"]'); assert.match(await toastText(), /0 séance\(s\), 0 historique\(s\), 0 rendez-vous[\s\S]*déjà là/);
    await synced();
    assert.deepEqual(refused, [], 'aucune écriture refusée par le serveur');
    assert.deepEqual(await page.evaluate(async () => (await import('/state.js')).S.failed), []);
  });
  await step('après rechargement, sur le serveur de Bob : liens séance – rendez-vous – historique gardés ; Alice n’a rien perdu', async () => {
    await page.reload(); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
    const B = accounts.BackupBob, A = accounts.BackupAlice;
    const hist = (await B.get('/api/history')).data.history, cal = (await B.get('/api/calendar')).data.events;
    assert.equal(hist.length, 1); assert.equal(cal.length, 1);
    assert.notEqual(hist[0].id, 'h-backup'); assert.notEqual(cal[0].id, 'ev-backup');
    assert.equal(hist[0].sessionId, 's-backup'); assert.equal(cal[0].sessionId, 's-backup'); assert.equal(hist[0].data.agenda.eventId, cal[0].id, 'l’historique pointe vers le rendez-vous de Bob');
    const seances = (await B.post('/api/sync', { items: [], tomb: {} })).data.items;
    assert.equal(seances.filter((s) => s.name === 'Sauvegarde transportable').length, 1);
    const items = JSON.stringify((await B.get('/api/items?since=0')).data);
    for (const t of ['Salle sauvegardée', 'Hanche gauche', 'Chrono sauvegardé']) assert.ok(items.includes(t), t);
    assert.ok((await A.get('/api/history')).data.history.some((x) => x.id === 'h-backup')); assert.ok((await A.get('/api/calendar')).data.events.some((x) => x.id === 'ev-backup'));
    assert.equal((await page.evaluate(async () => (await import('/state.js')).S.history.length)), 1);
  });
  await step('séance supprimée depuis la sauvegarde : « Laisser supprimée » la laisse, et le message le dit', async () => {
    await page.evaluate(async () => { (await import('/state.js')).saveSeance({ id: 's-gone', name: 'À récupérer', activity: 'conditioning', exercises: [{ id: 'e2', name: 'Pompes', mode: 'reps', sets: 3, repsMin: 10, repsMax: 10 }] }); });
    await synced(); file = await exportFile();
    await page.evaluate(() => { location.hash = '#/library/seance/s-gone'; }); await page.waitForSelector('[data-act=sDelete]', { state: 'attached' });
    if (!(await page.locator('[data-act=sDelete]').isVisible())) await page.locator('summary', { hasText: 'Plus d’actions' }).click();
    await page.click('[data-act=sDelete]'); await page.click('#dialog.open [data-dlg="1"]'); await synced();
    await importFile(file); await page.click('#dialog.open [data-dlg="1"]');
    await page.waitForFunction(() => /Récupérer la séance supprimée/.test(document.querySelector('#dialog.open')?.textContent || ''));
    assert.match(await page.locator('#dialog.open').innerText(), /« À récupérer » : dans la sauvegarde, mais supprimée depuis/); await noOverflow();
    await page.click('#dialog.open [data-dlg="0"]'); assert.match(await toastText(), /1 séance\(s\) supprimée\(s\) laissée\(s\) de côté/);
    await synced(); assert.equal(await page.evaluate(async () => (await import('/state.js')).S.seances.items.some((s) => s.id === 's-gone')), false);
  });
  await step('« Récupérer » : la séance revient, sur le serveur et après rechargement', async () => {
    await importFile(file); await page.click('#dialog.open [data-dlg="1"]');
    await page.waitForFunction(() => /Récupérer la séance supprimée/.test(document.querySelector('#dialog.open')?.textContent || ''));
    await page.click('#dialog.open [data-dlg="1"]'); assert.match(await toastText(), /dont 1 récupérée/);
    await synced(); await page.reload(); await page.waitForFunction(async () => (await import('/state.js')).S.loaded);
    assert.equal(await page.evaluate(async () => (await import('/state.js')).S.seances.items.filter((s) => s.id === 's-gone').length), 1);
    const seances = (await accounts.BackupBob.post('/api/sync', { items: [], tomb: {} })).data.items;
    assert.ok(seances.some((s) => s.id === 's-gone'), 'gardée par le serveur');
    assert.deepEqual(refused, []);
  });
  assert.deepEqual(errors, []); console.log(`\n${count} étapes sauvegarde E2E OK`);
} finally { await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); }
