// tests/audit/fixtures.mjs — base commune de la suite d'audit Playwright (« Mes séances »).
// Chaque test a son serveur local isolé : le vrai worker.js + une base SQLite en mémoire (tests/server.mjs).
// Aucun compte réel, aucune URL publique, aucune opération Cloudflare.
// Pour chaque test sont enregistrés : erreurs JavaScript, messages d'erreur de la console, requêtes échouées,
// réponses HTTP ≥ 400, et les boutons / formulaires réellement touchés (matrice de couverture).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from 'playwright/test';
import { makeEnv, startServer } from '../server.mjs';
import { Client } from '../helpers.mjs';

export { expect };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ADMIN_PASSWORD = 'secret-admin-de-test';
export const PASSWORD = 'motdepasse1';
const COVERAGE_DIR = process.env.AUDIT_COVERAGE_DIR || path.join(ROOT, 'tests', 'audit', 'results', 'coverage');
const CONFIG = { setupDone: true, tourDone: true, asked: ['acts', 'place', 'minutes', 'perWeek', 'goal', 'avoid', 'physique', 'climbPerWeek'] };

/** Script injecté dans chaque page : note les interactions réelles (pas les appels faits par le test). */
const COVERAGE_SCRIPT = `(() => {
  const hit = (kind, name) => { try { window.__auditHit && window.__auditHit(kind, String(name), location.hash.split('/').slice(1, 3).join('/')); } catch (e) {} };
  const on = (ev, attr) => document.addEventListener(ev, (e) => { const el = e.target && e.target.closest && e.target.closest('[data-' + attr + ']'); if (el) hit(attr, el.dataset[attr]); }, true);
  on('click', 'act'); on('submit', 'submit'); on('change', 'change'); on('input', 'input');
  const route = () => hit('route', location.hash.split('/').slice(1, 3).join('/') || 'home/dash');
  addEventListener('hashchange', route); addEventListener('load', route);
})();`;

/** Comptes de test : Alice et Bob (membres, questionnaire fait), créés par l'API du serveur local. */
async function makeAccounts(env, names) {
  const users = {};
  for (const name of names) {
    const c = users[name] = new Client(env); await c.register(name, PASSWORD);
    await c.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: CONFIG }] });
  }
  return users;
}

export const test = base.extend({
  /** Serveur isolé, comptes, journal des événements du navigateur, couverture. Connecté en Alice par défaut. */
  audit: [async ({ page, context }, use, testInfo) => {
    const env = makeEnv(), users = await makeAccounts(env, ['AuditAlice', 'AuditBob']);
    const srv = await startServer(env), hits = [];
    const events = { console: [], pageerrors: [], failedRequests: [], httpErrors: [] };
    page.on('console', (m) => { if (m.type() === 'error') events.console.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => events.pageerrors.push(String(e.message).slice(0, 300)));
    page.on('requestfailed', (r) => events.failedRequests.push(`${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText || ''}`));
    page.on('response', (r) => { if (r.status() >= 400) events.httpErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
    await context.exposeBinding('__auditHit', (_src, kind, name, route) => { hits.push([kind, name, route]); });
    await context.addInitScript(COVERAGE_SCRIPT);
    const audit = {
      env, srv, users, events,
      /** Crée un compte administrateur (mot de passe d'administration du serveur de test). */
      async admin(name = 'AuditAdmin') {
        const [c] = Object.values(await makeAccounts(env, [name]));
        const r = await c.post('/api/admin/activate', { password: ADMIN_PASSWORD }); if (r.status !== 200) throw new Error('activation admin ' + r.status);
        users[name] = c; return c;
      },
      /** Ouvre la session d'un compte dans le navigateur (cookie du serveur local), puis charge l'app. */
      async loginAs(name, hash = '') {
        await context.clearCookies(); await context.addCookies([{ name: 'session', value: users[name].jar.session, url: srv.base, httpOnly: true, sameSite: 'Lax' }]);
        await page.goto(srv.base + '/' + hash); await loaded(page);
      },
      /** Interdit les erreurs JavaScript non prévues (une exception non rattrapée est toujours un défaut). */
      allowPageErrors: false,
    };
    await audit.loginAs('AuditAlice');
    try { await use(audit); }
    finally {
      await testInfo.attach('evenements-navigateur.json', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
      try { fs.mkdirSync(COVERAGE_DIR, { recursive: true }); fs.writeFileSync(path.join(COVERAGE_DIR, `${testInfo.testId}-${testInfo.project.name}-${testInfo.retry}.json`), JSON.stringify({ test: testInfo.title, project: testInfo.project.name, hits })); } catch { /* couverture facultative */ }
      srv.server.closeAllConnections(); await new Promise((r) => srv.server.close(r));
    }
    if (!audit.allowPageErrors && events.pageerrors.length) throw new Error('Erreur JavaScript non rattrapée pendant le test : ' + events.pageerrors.join(' | '));
  }, { auto: true }],
});

/** L'app est chargée et synchronisée. */
export async function loaded(p) {
  await p.waitForSelector('nav.tabs');
  await p.waitForFunction(async () => { const { S } = await import('/state.js'); return S.loaded && !S.syncing; });
  await p.waitForTimeout(150);
}
/** Va à une page (#/onglet/sous-page) et ouvre les rubriques repliées qui contiennent l'élément visé. */
export async function go(p, route, selector = '#main') {
  await p.evaluate((r) => { location.hash = '#/' + r; }, route); await p.waitForTimeout(100);
  const target = p.locator(selector).first(); await target.waitFor({ state: 'attached' });
  for (const d of (await target.locator('xpath=ancestor::details[not(@open)]').all()).reverse()) await d.locator(':scope > summary').click();
  return target;
}
/** Plus rien en attente d'envoi, synchronisation réussie. */
export async function synced(p) {
  await p.evaluate(async () => { const m = await import('/state.js'); if (!m.S.syncing) await m.syncAll(); });
  await expect.poll(() => p.evaluate(async () => { const m = await import('/state.js'); return { count: m.pendingCount(), sync: m.S.sync }; }), { timeout: 15000 }).toEqual({ count: 0, sync: 'ok' });
}
export async function confirm(p) { await p.locator('#dialog.open [data-dlg="1"]').click(); }
export async function cancel(p) { await p.locator('#dialog.open [data-dlg="0"]').click(); }
export async function toast(p, re) { await expect(p.locator('#toast')).toContainText(re); }
export async function login(p, name, password = PASSWORD) {
  if (await p.locator('[data-act=authPick][data-id=login]').count()) await p.click('[data-act=authPick][data-id=login]');
  await p.fill('form[data-submit=login] [name=username]', name); await p.fill('form[data-submit=login] [name=password]', password);
  await p.click('form[data-submit=login] button[type=submit]');
}
export async function logout(p) { await go(p, 'settings/main', '[data-act=logout]'); await p.click('[data-act=logout]'); await confirm(p); await p.waitForSelector('form[data-submit=login], [data-act=authPick]'); }
/** Séance « à ma façon » créée par l'interface : nom + exercices écrits un par ligne. */
export async function manual(p, text = '4 × 8 tractions repos 2 min', name = 'Séance audit') {
  await go(p, 'home/dash', '[data-act=newSeance]'); await p.locator('#main [data-act=newSeance]').first().click(); await p.waitForSelector('input[data-change=sName]');
  await p.fill('input[data-change=sName]', name); await p.press('input[data-change=sName]', 'Tab');
  await p.click('#main [data-act=exWrite]'); await p.fill('#sheet textarea[name=text]', text); await p.click('#sheet form button[type=submit]');
  await p.waitForSelector('#main .item.ex');
  return p.evaluate(async () => { const { S } = await import('/state.js'); return JSON.parse(JSON.stringify(S.seances.items.find((x) => x.id === S.param) || S.seances.items.at(-1))); });
}
export async function closeSheet(p) { await p.evaluate(async () => { (await import('/ui.js')).closeSheet(); }); }
/** Rien ne dépasse horizontalement. */
export async function noOverflow(p) { expect(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true); }
/**
 * Contrôles visibles recouverts par un autre élément (bandeau, barre fixe…) : la vérification de largeur ne les voit pas.
 * Renvoie la liste des boutons / liens / champs dont le centre est caché.
 */
export async function occluded(p, scope = 'body') {
  return p.evaluate((scope) => {
    const out = [], root = document.querySelector(scope); if (!root) return out;
    for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
      const r = el.getBoundingClientRect(), st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none' || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(x, y);
      if (!top || el.contains(top) || top.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(top)))) continue;
      if (el.closest('label') && el.closest('label').contains(top)) continue;
      out.push(`${el.tagName.toLowerCase()}[${el.dataset.act || el.name || el.textContent.trim().slice(0, 30)}] sous ${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className || '').split(' ')[0]}`);
    }
    return out;
  }, scope);
}
/** Texte cassé visible (undefined, NaN, [object Object], Invalid Date) dans une zone. */
export async function brokenText(p, scope = '#main') {
  const t = await p.locator(scope).innerText().catch(() => '');
  return [...t.matchAll(/undefined|\bNaN\b|\[object Object\]|Invalid Date/g)].map((m) => t.slice(Math.max(0, m.index - 30), m.index + 25).replace(/\s+/g, ' '));
}
/** Données préparées par l'API (rapide, pour les volumes et les calculs) : le test vérifie ensuite par l'interface. */
export async function seed(client, { history = [], events = [], items = [], seances = null } = {}) {
  for (const h of history) { const r = await client.post('/api/history', h); if (r.status !== 200) throw new Error('historique ' + r.status + ' ' + JSON.stringify(r.data)); }
  for (const e of events) { const r = await client.post('/api/calendar', e); if (r.status !== 200) throw new Error('calendrier ' + r.status); }
  if (items.length) { const r = await client.post('/api/items', { changes: items.map((x) => ({ u: Date.now(), ...x })) }); if (r.status !== 200) throw new Error('items ' + r.status); }
  if (seances) { const r = await client.post('/api/sync', seances); if (r.status !== 200) throw new Error('séances ' + r.status); }
}
export const day = (offset = 0, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); };
