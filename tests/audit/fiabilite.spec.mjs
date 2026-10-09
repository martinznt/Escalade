// tests/audit/fiabilite.spec.mjs — fiabilité : fichier choisi pendant un redessin, session expirée, deux onglets,
// coupure réseau pendant un enregistrement, beaucoup de données, clics rapides, retour arrière avec une fenêtre ouverte.
// Attendu partout : aucune perte de donnée, aucun doublon, un message clair, aucune erreur JavaScript.
import { test, expect, go, loaded, synced, confirm, manual, login, PASSWORD } from './fixtures.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('F01 fichier choisi pendant que la page se redessine : l’import démarre quand même (défaut N02, corrigé)', async ({ page }) => {
  await go(page, 'settings/data', 'input[data-change=importJson]');
  const file = { name: 'sauvegarde.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'mes-seances', version: 8, seances: { items: [{ id: 'imp-1', name: 'Importée pendant un redessin', exercises: [] }], tomb: {} } })) };
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('label:has(input[data-change=importJson])')]);
  await page.evaluate(async () => { const m = await import('/state.js'); await m.syncAll(); m.render(); }); // la page change pendant que la fenêtre de choix est ouverte
  await chooser.setFiles(file);
  await expect(page.locator('#dialog.open')).toContainText('Importer cette sauvegarde ?'); await confirm(page);
  await expect(page.locator('#toast')).toContainText('Importé'); await synced(page);
  expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.map((s) => s.name))).toContain('Importée pendant un redessin');
});

test('F02 session expirée pendant une modification : message clair, rien de perdu, envoyé après reconnexion', async ({ page, audit }) => {
  audit.srv.fail = (req) => (new URL(req.url).pathname.startsWith('/api/') && !new URL(req.url).pathname.startsWith('/api/auth/') ? json(401, { ok: false, error: 'Connexion requise.' }) : null);
  await page.evaluate(async () => { const m = await import('/state.js'); m.saveSeance({ id: 'pendant-expiration', name: 'Faite pendant l’expiration', exercises: [{ id: 'x', name: 'Squats', mode: 'reps', sets: 3, repsMin: 8, repsMax: 8 }] }); m.syncAll().catch(() => {}); });
  await expect(page.locator('#app')).toContainText('Session expirée : reconnecte-toi', { timeout: 10000 });
  await expect(page.locator('#app')).toContainText('modifications faites sur cet appareil sont conservées');
  audit.srv.fail = null;
  if (await page.locator('[data-act=authPick][data-id=login]').count()) await page.click('[data-act=authPick][data-id=login]');
  await expect(page.locator('form[data-submit=login] [name=username]')).toHaveValue('AuditAlice'); // pseudo prérempli
  await page.fill('form[data-submit=login] [name=password]', PASSWORD); await page.click('form[data-submit=login] button[type=submit]');
  await page.waitForSelector('nav.tabs'); await loaded(page); await synced(page);
  // La reconnexion révoque l'ancien jeton (protection contre la fixation de session) : lecture par une nouvelle connexion.
  const { Client } = await import('../helpers.mjs'), fresh = new Client(audit.env); await fresh.post('/api/auth/login', { username: 'AuditAlice', password: PASSWORD });
  expect((await fresh.get('/api/sync')).data.items.map((s) => s.name)).toContain('Faite pendant l’expiration');
});

test('F03 deux onglets : chacun modifie une séance différente ; après synchronisation, les deux modifications sont gardées', async ({ page, context, audit }) => {
  await page.evaluate(async () => { const m = await import('/state.js'); for (const [id, name] of [['onglet-a', 'Séance A'], ['onglet-b', 'Séance B']]) m.saveSeance({ id, name, exercises: [] }); }); await synced(page);
  const other = await context.newPage(); await other.goto(audit.srv.base + '/#/library/seances'); await loaded(other);
  await page.evaluate(async () => { const m = await import('/state.js'); const s = m.S.seances.items.find((x) => x.id === 'onglet-a'); m.saveSeance({ ...s, name: 'Séance A modifiée (onglet 1)' }); });
  await other.evaluate(async () => { const m = await import('/state.js'); const s = m.S.seances.items.find((x) => x.id === 'onglet-b'); m.saveSeance({ ...s, name: 'Séance B modifiée (onglet 2)' }); });
  await synced(page); await synced(other); await synced(page);
  const names = (await audit.users.AuditAlice.get('/api/sync')).data.items.map((s) => s.name).sort();
  expect(names).toEqual(['Séance A modifiée (onglet 1)', 'Séance B modifiée (onglet 2)']);
  await other.reload(); await loaded(other);
  expect((await other.evaluate(async () => (await import('/state.js')).S.seances.items.map((s) => s.name))).sort()).toEqual(names);
  await other.close();
});

test('F04 coupure réseau pendant l’envoi d’une séance faite : renvoyée au retour, enregistrée une seule fois', async ({ page, audit }) => {
  let dropped = 0; audit.srv.fail = (req) => (new URL(req.url).pathname === '/api/history' && req.method === 'POST' && dropped++ < 2 ? 'drop' : null);
  await page.evaluate(async () => { (await import('/state.js')).addHistory({ id: 'coupure-1', sessionName: 'Séance pendant la coupure', startedAt: Date.now() - 1800000, durationSeconds: 1500, data: { rpe: 3, exercises: [{ name: 'Squats', sets: [{ reps: 8, done: true }] }] } }); });
  await page.evaluate(async () => { await (await import('/state.js')).syncAll().catch(() => {}); });
  expect(dropped, 'la coupure a bien eu lieu').toBeGreaterThan(0);
  audit.srv.fail = null; await synced(page); await page.reload(); await loaded(page); await synced(page);
  const mine = (await audit.users.AuditAlice.get('/api/history')).data.history.filter((h) => h.sessionName === 'Séance pendant la coupure');
  expect(mine).toHaveLength(1);
  expect(await page.evaluate(async () => (await import('/state.js')).S.history.filter((h) => h.sessionName === 'Séance pendant la coupure').length)).toBe(1);
});

test('F05 beaucoup de données : 1 500 séances faites et 200 rendez-vous, pages affichées vite et sans erreur', async ({ page, audit }) => {
  test.setTimeout(180000);
  const now = Date.now(), c = audit.users.AuditAlice;
  for (let i = 0; i < 1500; i++) await c.post('/api/history', { id: 'vol-' + i, sessionName: 'Volume ' + i, startedAt: now - (i + 1) * 4 * 3600000, durationSeconds: 1800 + (i % 7) * 300, data: { rpe: 1 + (i % 5), activity: ['conditioning', 'running', 'climbing_boulder'][i % 3], exercises: [{ name: 'Squats', sets: [{ reps: 8, done: true }, { reps: 8, done: true }] }] } });
  for (let i = 0; i < 200; i++) await c.post('/api/calendar', { id: 'cal-vol-' + i, date: new Date(now + (i - 100) * 86400000).toISOString().slice(0, 10), time: '18:00', title: 'Rendez-vous ' + i, completed: false, recurrence: null, meta: { kind: 'activity' } });
  const t0 = Date.now(); await page.reload(); await loaded(page); await synced(page); const loadMs = Date.now() - t0;
  expect(await page.evaluate(async () => (await import('/state.js')).S.history.length)).toBe(1500);
  const timings = {};
  for (const route of ['home/dash', 'home/cal', 'progress/summary', 'progress/history', 'progress/journal', 'profile/analyse']) {
    const t = Date.now(); await go(page, route, '#main'); await page.waitForLoadState('networkidle'); timings[route] = Date.now() - t;
    expect(await page.locator('#main').innerText()).not.toMatch(/n’a pas pu s’afficher|NaN|undefined/);
  }
  await test.info().attach('temps.json', { body: JSON.stringify({ chargementMs: loadMs, pagesMs: timings }, null, 2), contentType: 'application/json' });
  for (const [route, ms] of Object.entries(timings)) expect.soft(ms, `${route} affichée en moins de 3 s`).toBeLessThan(3000);
  expect(loadMs, 'chargement et synchronisation en moins de 20 s').toBeLessThan(20000);
});

test('F06 clics rapides : double clic sur « Supprimer », onglets enchaînés : une seule suppression, aucune erreur', async ({ page, audit }) => {
  const s = await manual(page, '3 × 10 squats', 'Double clic'); await synced(page);
  await page.locator('#main details:has([data-act=sDelete]) > summary').first().click().catch(() => {});
  await page.click(`#main [data-act=sDelete][data-id="${s.id}"]`); await page.locator('#dialog.open [data-dlg="1"]').dblclick();
  await expect(page.locator('#toast')).toContainText('Séance supprimée'); await synced(page);
  expect((await audit.users.AuditAlice.get('/api/sync')).data.items).toHaveLength(0);
  for (let i = 0; i < 3; i++) for (const id of ['library', 'progress', 'profile', 'settings', 'home']) await page.click(`nav.tabs [data-id=${id}]`, { delay: 0 });
  await expect.poll(() => page.evaluate(async () => (await import('/state.js')).S.tab)).toBe('home');
});

test('F07 retour arrière avec une fenêtre ouverte : elle se ferme, la page reste utilisable, rien n’est perdu', async ({ page }) => {
  await go(page, 'library/seances', '#main'); await go(page, 'home/dash', '[data-act=allOpen]');
  await page.locator('[data-act=allOpen]').first().click(); await expect(page.locator('#sheet.open')).toBeVisible();
  await page.goBack(); await expect(page.locator('#sheet.open')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/library\/seances/); await expect(page.locator('nav.tabs')).toBeVisible();
  await page.goForward(); await expect(page).toHaveURL(/#\/home\/dash/); await expect(page.locator('#main')).toBeVisible();
});
