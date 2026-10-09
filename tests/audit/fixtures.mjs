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
  window.__toasts = [];
  addEventListener('DOMContentLoaded', () => { const t = document.getElementById('toast'); if (t) new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true }); });
  const route = () => hit('route', location.hash.split('/').slice(1, 3).join('/') || 'home/dash');
  addEventListener('hashchange', route); addEventListener('load', route);
})();`;

/** Comptes de test : Alice et Bob (membres, questionnaire fait), créés par l'API du serveur local. */
async function makeAccounts(env, names) {
  const users = {};
  for (const name of names) {
    const c = users[name] = new Client(env); c.userId = (await c.register(name, PASSWORD)).data.user.id;
    await c.post('/api/items', { changes: [{ c: 'config', id: 'main', u: Date.now(), d: CONFIG }] });
  }
  return users;
}

export const test = base.extend({
  /** Réglages en plus du serveur de test (ex. une IA simulée : { AI: { run } }). */
  envExtra: [{}, { option: true }],
  /** Serveur isolé, comptes, journal des événements du navigateur, couverture. Connecté en Alice par défaut. */
  audit: [async ({ page, context, envExtra }, use, testInfo) => {
    const env = makeEnv(envExtra), users = await makeAccounts(env, ['AuditAlice', 'AuditBob']);
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
        // Comme une vraie connexion : le compte gardé sur l'appareil est oublié, puis la page est vraiment rechargée
        // (aller d'une adresse « #… » à une autre ne recharge pas la page).
        await page.evaluate(() => { try { localStorage.removeItem('sea:user'); } catch { /* page vide */ } }).catch(() => {});
        await context.clearCookies(); await context.addCookies([{ name: 'session', value: users[name].jar.session, url: srv.base, httpOnly: true, sameSite: 'Lax' }]);
        await page.goto('about:blank'); await page.goto(srv.base + '/' + hash); await loaded(page);
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
/** Le message a été affiché à un moment (même s'il a été remplacé ensuite par un autre). */
export async function toastSeen(p, re) { await expect.poll(() => p.evaluate(() => (window.__toasts || []).join('\n')), { timeout: 7000 }).toMatch(re); }
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

/**
 * Données réalistes pour qu'aucune page ne soit vide : l'exemple de la démo (18 séances faites sur 6 semaines,
 * blocs, projet, mesures, forme du jour), plus trois séances enregistrées et deux rendez-vous (dont un répété).
 * Tout passe par les fonctions de l'app puis par la synchronisation, comme pour une vraie personne.
 */
export async function seedRealistic(p) {
  await p.evaluate(async () => {
    const st = await import('/state.js'), demo = await import('/demo.js');
    const day = (o) => new Date(Date.now() + o * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
    demo.seedDemo();
    st.saveSeance({ id: 's-bloc', name: 'Bloc technique', activity: 'climbing_boulder', exercises: [{ id: 'eb1', name: 'Échauffement mobilité', mode: 'time', sets: 1, secMin: 600, rest: 0 }, { id: 'eb2', name: 'Blocs variés', mode: 'reps', sets: 6, repsMin: 4, repsMax: 4, rest: 180 }] });
    st.saveSeance({ id: 's-renfo', name: 'Renfo haut du corps', activity: 'conditioning', exercises: [{ id: 'er1', name: 'Tractions', mode: 'reps', sets: 4, repsMin: 6, repsMax: 8, rest: 120 }, { id: 'er2', name: 'Pompes', mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, rest: 90 }, { id: 'er3', name: 'Gainage', mode: 'time', sets: 3, secMin: 45, rest: 60 }] });
    st.saveSeance({ id: 's-course', name: 'Footing 30 min', activity: 'running', exercises: [{ id: 'ec1', name: 'Footing', mode: 'time', sets: 1, secMin: 1800, rest: 0 }] });
    st.saveEvent({ id: 'ev-seul', date: day(1), time: '18:30', title: 'Bloc · Salle de bloc', sessionId: 's-bloc', completed: false, recurrence: null, meta: { kind: 'activity', activityId: 'climbing_boulder', reminderMin: 30 } });
    st.saveEvent({ id: 'ev-repete', date: day(-14), time: '', title: 'Renfo', sessionId: 's-renfo', completed: false, recurrence: { freq: 'weekly', days: [2, 5], until: null, timeZone: 'Europe/Paris' }, meta: { kind: 'activity', activityId: 'conditioning', reminderMin: 0 } });
  });
  await synced(p);
}
/** Interface simple ou avancée, choisie comme une personne le fait (Paramètres). */
export async function setInterface(p, mode) {
  await go(p, 'settings/main', `[data-act=interfaceSet][data-v=${mode}]`); await p.click(`[data-act=interfaceSet][data-v=${mode}]`);
  await expect(p.locator('html')).toHaveAttribute('data-interface', mode); await synced(p);
}
/**
 * Défauts visibles d'une page déjà affichée : écran d'erreur, texte cassé, défilement de côté, éléments qui sortent de
 * l'écran, contrôles recouverts (hors barres fixes qu'un défilement écarte), états ARIA vides, jauges, listes, champs
 * et boutons sans nom, identifiants en double.
 */
export async function pageAnomalies(p) {
  const out = await p.evaluate(() => {
    const W = document.documentElement.clientWidth, H = innerHeight, out = [], main = document.getElementById('main') || document.querySelector('main');
    if (!main) return ['aucune zone principale'];
    const text = main.innerText;
    if (/n’a pas pu s’afficher/.test(text)) out.push('écran « Cet écran n’a pas pu s’afficher »');
    if (document.documentElement.scrollWidth > W + 1) out.push(`défilement horizontal (${document.documentElement.scrollWidth} px pour ${W} px)`);
    // Une rubrique repliée (<details> fermé) garde la taille de son contenu dans Chromium, mais ne l'affiche pas.
    const folded = (el) => { for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) if (!d.querySelector(':scope > summary')?.contains(el)) return true; return false; };
    const visible = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[hidden],.hidden') && !folded(el); };
    let wide = 0;
    for (const el of main.querySelectorAll('*')) {
      if (wide > 3 || el instanceof SVGElement || el.closest('svg,.hscroll,[data-scroll-x],pre,code,.qr,canvas')) continue;
      const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && visible(el)) { wide++; out.push(`sort de l’écran : ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(r.right)} px)`); }
    }
    const nameOf = (el) => (el.getAttribute('aria-label') || '').trim() || (el.getAttribute('aria-labelledby') ? 'x' : '') || (el.title || '').trim() || (el.labels && [...el.labels].map((l) => l.innerText).join(' ').trim()) || (el.closest('label')?.innerText || '').trim();
    for (const el of document.querySelectorAll('[aria-checked],[aria-pressed],[aria-expanded],[aria-selected]')) for (const a of ['aria-checked', 'aria-pressed', 'aria-expanded', 'aria-selected']) if (el.hasAttribute(a) && !['true', 'false', 'mixed'].includes(el.getAttribute(a))) out.push(`${a}="${el.getAttribute(a)}" sur ${el.tagName.toLowerCase()}[${el.dataset.act || ''}]`);
    for (const el of document.querySelectorAll('[role=progressbar]')) if (!nameOf(el)) out.push('jauge sans nom');
    for (const el of main.querySelectorAll('select, textarea, input:not([type=hidden]):not([type=file])')) if (visible(el) && !nameOf(el) && !(el.placeholder || '').trim()) out.push(`champ sans nom : ${el.tagName.toLowerCase()}[name=${el.name || ''}][${el.dataset.change || el.dataset.input || ''}]`);
    for (const el of document.querySelectorAll('#app button, #app [role=button], #app a[href]')) if (visible(el) && !(el.innerText || '').trim() && !nameOf(el) && !el.querySelector('img[alt]:not([alt=""])')) out.push(`bouton sans nom : ${el.tagName.toLowerCase()}[${el.dataset.act || el.getAttribute('href') || ''}]`);
    for (const img of main.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push(`image sans alt : ${img.src.slice(-40)}`);
    const ids = {}; for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
    for (const [id, n] of Object.entries(ids)) if (n > 1) out.push(`identifiant en double : #${id} (${n})`);
    for (const el of main.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
      if (!visible(el)) continue; const r = el.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
      const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(x, y);
      if (!top || el.contains(top) || top.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(top))) || el.closest('label')?.contains(top)) continue;
      if (top.closest('nav.tabs, header.top')) continue; // un défilement l'écarte
      out.push(`recouvert : ${el.tagName.toLowerCase()}[${el.dataset.act || el.name || el.innerText.trim().slice(0, 25)}] sous ${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className || '').split(' ')[0]}`);
    }
    for (const m of text.matchAll(/undefined|\bNaN\b|\[object Object\]|Invalid Date|null null/g)) out.push(`texte cassé : « ${text.slice(Math.max(0, m.index - 30), m.index + 25).replace(/\s+/g, ' ')} »`);
    return out;
  });
  return [...new Set(out)];
}
