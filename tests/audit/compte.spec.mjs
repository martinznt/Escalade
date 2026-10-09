// tests/audit/compte.spec.mjs — compte et réglages : inscription (données invalides, pseudo pris), connexion,
// déconnexion (retour arrière compris), changement de mot de passe (autre appareil déconnecté), apparence qui suit
// le compte sur un autre appareil, signalement de bug (sans données d'entraînement jointes), aide.
import { test, expect, go, loaded, synced, confirm, login, logout, manual, toastSeen, PASSWORD } from './fixtures.mjs';

async function loggedOut(page, context, base) { await context.clearCookies(); await page.evaluate(() => { try { localStorage.clear(); } catch {} }); await page.goto(base + '/'); await page.waitForSelector('[data-act=authPick], form[data-submit=login]'); }
async function register(page, username, password) {
  if (await page.locator('[data-act=authPick][data-id=register]').count()) await page.click('[data-act=authPick][data-id=register]');
  await page.fill('form[data-submit=register] [name=username]', username); await page.fill('form[data-submit=register] [name=password]', password);
  await page.click('form[data-submit=register] button[type=submit]');
}

test('R01 inscription : pseudo trop court, mot de passe trop court, pseudo déjà pris, puis compte créé', async ({ page, context, audit }) => {
  await loggedOut(page, context, audit.srv.base);
  for (const [user, pass, message] of [['ab', 'motdepasse1', /Pseudo : 3 à 24 caractères/], ['NouvelleAudit', 'court', /8 caractères minimum/], ['auditbob', 'motdepasse1', /déjà utilisé/]]) {
    await register(page, user, pass);
    // Le champ peut aussi bloquer l'envoi lui-même (longueur minimale) : un message est attendu dans les deux cas.
    const blocked = await page.locator('form[data-submit=register] :invalid').count();
    if (!blocked) await expect(page.locator('#app')).toContainText(message);
    await expect(page.locator('nav.tabs')).toHaveCount(0);
  }
  await register(page, 'NouvelleAudit', 'motdepasse1'); await expect(page.locator('nav.tabs')).toBeVisible();
});

test('R02 connexion : mauvais mot de passe refusé ; session gardée au rechargement ; après déconnexion, le retour arrière ne montre rien', async ({ page, context, audit }) => {
  await manual(page, '3 × 10 squats', 'Séance très privée'); await synced(page);
  await loggedOut(page, context, audit.srv.base);
  await login(page, 'AuditAlice', 'mauvais-mot-de-passe'); await expect(page.locator('#app')).toContainText('Pseudo ou mot de passe incorrect'); await expect(page.locator('nav.tabs')).toHaveCount(0);
  await login(page, 'AuditAlice', PASSWORD); await page.waitForSelector('nav.tabs'); await loaded(page);
  await page.reload(); await loaded(page); await expect(page.locator('nav.tabs')).toBeVisible();
  await go(page, 'library/seances', '#main'); await expect(page.locator('#main')).toContainText('Séance très privée');
  await logout(page); expect((await context.cookies()).find((c) => c.name === 'session')?.value || '', 'cookie de session effacé').toBe('');
  await page.goBack().catch(() => {}); await page.waitForTimeout(400);
  expect(await page.locator('body').innerText()).not.toContain('Séance très privée');
  await page.reload(); await page.waitForSelector('[data-act=authPick], form[data-submit=login]'); expect(await page.locator('body').innerText()).not.toContain('Séance très privée');
});

test('R03 mot de passe : ancien faux refusé ; changé → l’autre appareil est déconnecté, l’ancien ne marche plus, le nouveau oui', async ({ page, browser, audit }) => {
  const other = await browser.newContext({ serviceWorkers: 'block' }), phone = await other.newPage();
  await other.addCookies([{ name: 'session', value: (await (async () => { const { Client } = await import('../helpers.mjs'); const c = new Client(audit.env); await c.post('/api/auth/login', { username: 'AuditAlice', password: PASSWORD }); return c.jar.session; })()), url: audit.srv.base }]);
  await phone.goto(audit.srv.base + '/'); await phone.waitForSelector('nav.tabs');
  await go(page, 'settings/main', '[data-act=chpass]'); await page.click('[data-act=chpass]');
  await page.fill('#sheet [name=current]', 'pas-le-bon'); await page.fill('#sheet [name=next]', 'nouveaumotdepasse2'); await page.click('#sheet form[data-submit=chpass] button[type=submit]');
  await expect(page.locator('#toast')).toContainText(/incorrect|actuel/i);
  await page.fill('#sheet [name=current]', PASSWORD); await page.fill('#sheet [name=next]', 'nouveaumotdepasse2'); await page.click('#sheet form[data-submit=chpass] button[type=submit]');
  await toastSeen(page, /Mot de passe changé/);
  const { Client } = await import('../helpers.mjs');
  expect((await new Client(audit.env).post('/api/auth/login', { username: 'AuditAlice', password: PASSWORD })).status, 'ancien mot de passe').toBe(401);
  expect((await new Client(audit.env).post('/api/auth/login', { username: 'AuditAlice', password: 'nouveaumotdepasse2' })).status, 'nouveau mot de passe').toBe(200);
  await phone.reload(); await phone.waitForSelector('[data-act=authPick], form[data-submit=login], .card', { timeout: 10000 });
  expect(await phone.locator('nav.tabs').count(), 'l’autre appareil n’est plus connecté').toBe(0);
  await expect(page.locator('nav.tabs'), 'cet appareil reste connecté').toBeVisible();
  await other.close();
});

test('R04 apparence : mode clair gardé au rechargement et retrouvé sur un autre appareil', async ({ page, browser, audit }) => {
  await go(page, 'settings/display', '[data-act=appear][data-k=mode][data-v=light]'); await page.click('[data-act=appear][data-k=mode][data-v=light]');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light'); await synced(page);
  await page.reload(); await loaded(page); await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  const other = await browser.newContext({ serviceWorkers: 'block' }), p2 = await other.newPage();
  await other.addCookies([{ name: 'session', value: audit.users.AuditAlice.jar.session, url: audit.srv.base }]);
  await p2.goto(audit.srv.base + '/'); await loaded(p2); await expect(p2.locator('html')).toHaveAttribute('data-mode', 'light', { timeout: 10000 });
  await other.close();
});

test('R05 signalement de bug : trop court bloqué ; envoyé, il apparaît dans « Mes signalements » sans données d’entraînement', async ({ page, audit }) => {
  await manual(page, '3 × 10 squats', 'Nom secret de séance'); await synced(page);
  await go(page, 'settings/bug', 'form[data-submit=bugSend]');
  await page.fill('form[data-submit=bugSend] [name=description]', 'abc'); await page.click('form[data-submit=bugSend] button[type=submit]');
  expect(await page.locator('form[data-submit=bugSend] [name=description]:invalid').count(), 'description trop courte bloquée').toBe(1);
  await page.fill('form[data-submit=bugSend] [name=description]', 'Le bouton Enregistrer de la séance ne répond pas après un rechargement.');
  await page.click('form[data-submit=bugSend] button[type=submit]'); await toastSeen(page, /Signalement enregistré/); await synced(page);
  const mine = (await audit.users.AuditAlice.get('/api/bugs/mine')).data.reports;
  expect(mine).toHaveLength(1); expect(mine[0].description).toContain('Le bouton Enregistrer'); expect(mine[0].description, 'aucune donnée d’entraînement jointe').not.toContain('Nom secret de séance');
  await expect(page.locator('#main')).toContainText('Le bouton Enregistrer', { timeout: 8000 });
});

test('R06 aide : les questions fréquentes s’ouvrent et répondent ; la visite guidée démarre et se quitte', async ({ page }) => {
  await go(page, 'settings/help', 'details.faq');
  const faq = page.locator('details.faq').first(); await faq.locator('summary').click(); await expect(faq).toHaveAttribute('open', '');
  expect((await faq.innerText()).length).toBeGreaterThan(40);
  await page.click('[data-act=helpTour]'); await expect(page.locator('#tour')).toBeVisible();
  await page.locator('#tour [data-act=tourEnd]').first().click(); await expect(page.locator('#tour')).toHaveCount(0);
});
