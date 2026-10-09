// tests/audit/admin.spec.mjs — administration vue dans le navigateur : activation (mot de passe jamais gardé ni
// renvoyé ailleurs), signalement piégé affiché comme du texte, liste des comptes sans e-mail ni données privées,
// annonce « Envoyer à tous » (annulation sans envoi, confirmation explicite), rôle limité.
// Serveur de test seulement : l'annonce n'atteint que les comptes de test de ce serveur.
import { test, expect, go, loaded, synced, cancel, confirm, toastSeen, ADMIN_PASSWORD } from './fixtures.mjs';
import { Client } from '../helpers.mjs';

/** Tout ce que l'appareil garde (stockage local, de session, base IndexedDB), en texte. */
const storedText = (page) => page.evaluate(async () => {
  const out = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
  try { const { idb } = await import('/state.js'); for (const k of await idb.keys()) out.push(k, JSON.stringify(await idb.get(k))); } catch (e) { out.push('idb:' + e.message); }
  return out.join('\n');
});

test('AD01 activation : mauvais mot de passe refusé ; le bon active l’administration ; il n’est jamais gardé ni envoyé ailleurs', async ({ page, audit }) => {
  const sent = []; page.on('request', (r) => { const body = r.postData() || ''; if (body.includes(ADMIN_PASSWORD) || body.includes('pas-le-bon-mdp')) sent.push(new URL(r.url()).pathname); });
  await go(page, 'settings/admin', 'form[data-submit=adminOn] [name=password]');
  await page.fill('form[data-submit=adminOn] [name=password]', 'pas-le-bon-mdp'); await page.press('form[data-submit=adminOn] [name=password]', 'Enter');
  await expect(page.locator('#toast')).toContainText('Mot de passe administrateur incorrect');
  expect(await page.evaluate(async () => (await import('/state.js')).S.user.isAdmin)).toBeFalsy();
  await expect(page.locator('form[data-submit=adminOn] [name=password]')).toHaveValue('');
  await page.fill('form[data-submit=adminOn] [name=password]', ADMIN_PASSWORD); await page.press('form[data-submit=adminOn] [name=password]', 'Enter');
  await expect.poll(() => page.evaluate(async () => (await import('/state.js')).S.user.isAdmin)).toBe(true);
  await page.reload(); await loaded(page); await go(page, 'settings/admin', '[data-act=adminOff]'); await expect(page.locator('[data-act=adminOff]')).toBeVisible();
  expect(sent.every((p) => p === '/api/admin/activate'), `mot de passe envoyé à : ${sent.join(', ')}`).toBe(true);
  const stored = await storedText(page); expect(stored.includes(ADMIN_PASSWORD) || stored.includes('pas-le-bon-mdp'), 'mot de passe gardé sur l’appareil').toBe(false);
});

test('AD02 signalement piégé : l’administrateur le lit comme du texte, rien n’est exécuté', async ({ page, audit }) => {
  await audit.users.AuditBob.post('/api/bugs', { title: '<img src=x onerror="window.__pirate=1">Titre <b>piégé</b>', description: 'Description <script>window.__pirate=2</script> avec <a href="javascript:alert(1)">lien</a>', page: 'home/dash' });
  await audit.admin('AuditAdmin'); await audit.loginAs('AuditAdmin', '#/settings/bugs');
  await expect(page.locator('#main')).toContainText('Titre <b>piégé</b>', { timeout: 10000 });
  expect(await page.evaluate(() => window.__pirate)).toBeUndefined();
  expect(await page.evaluate(() => [...document.querySelectorAll('#main img[src="x"], #main script, #main a[href^="javascript:"]')].length), 'aucune balise venue du signalement').toBe(0);
});

test('AD03 liste des comptes : pseudos et activité visibles, ni e-mail complet ni donnée privée', async ({ page, audit }) => {
  const c = new Client(audit.env); const r = await c.post('/api/auth/register', { username: 'AuditMail', password: 'motdepasse1', email: 'adresse.secrete@exemple.fr' }); expect(r.status).toBe(200);
  await c.post('/api/sync', { items: [{ id: 'privee', name: 'Séance privée de AuditMail', exercises: [] }], tomb: {} });
  await audit.admin('AuditAdmin'); await audit.loginAs('AuditAdmin', '#/settings/users');
  await expect(page.locator('#main')).toContainText('AuditMail', { timeout: 10000 });
  const text = await page.locator('#main').innerText();
  expect(text, 'e-mail complet').not.toContain('adresse.secrete@exemple.fr'); expect(text, 'donnée privée').not.toContain('Séance privée de AuditMail');
});

test('AD04 « Envoyer à tous » : « Annuler » n’envoie rien ; « Envoyer » publie, une seule fois', async ({ page, audit }) => {
  const posts = []; page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/admin/push-broadcast') posts.push(r.postDataJSON()); });
  await audit.admin('AuditAdmin'); await audit.loginAs('AuditAdmin', '#/settings/push');
  await page.waitForSelector('form[data-submit=pushBroadcast]');
  await page.fill('form[data-submit=pushBroadcast] [name=title]', 'Annonce de test'); await page.fill('form[data-submit=pushBroadcast] [name=body]', 'Message de test de l’audit.');
  await page.click('form[data-submit=pushBroadcast] button[type=submit]'); await expect(page.locator('#dialog.open')).toContainText('Envoyer cette annonce maintenant ?');
  await cancel(page); await page.waitForTimeout(500); expect(posts, 'rien envoyé après « Annuler »').toEqual([]);
  await page.click('form[data-submit=pushBroadcast] button[type=submit]'); await confirm(page);
  await toastSeen(page, /Annonce publiée pour tous/); expect(posts).toHaveLength(1); expect(posts[0]).toMatchObject({ title: 'Annonce de test', confirmed: true });
  const seen = JSON.stringify((await audit.users.AuditBob.get('/api/global')).data); expect(seen, 'un membre voit l’annonce').toContain('Annonce de test');
});

test('AD05 rôle limité : un administrateur « Contenu » ne voit pas les comptes ; le serveur refuse aussi', async ({ page, audit }) => {
  const sup = await audit.admin('AuditSuper'), limited = await audit.admin('AuditContenu');
  expect((await sup.post(`/api/admin/users/${limited.userId}/roles`, { roles: ['content'] })).status).toBe(200);
  await audit.loginAs('AuditContenu', '#/settings/users');
  await expect(page.locator('#main')).toContainText(/Rôle « Utilisateurs » nécessaire/);
  expect(await page.locator('#main').innerText()).not.toContain('AuditBob');
  expect((await limited.get('/api/admin/users')).status).toBe(403);
});
