// Test de bout en bout : vrai navigateur (Chromium) + vrai worker.js + faux D1 (SQLite).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';
import { makeD1 } from './d1shim.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const env = { DB: makeD1(), EDIT_CODE: '1234-secret', SEANCES_KV: { get: async () => null },
  ASSETS: { fetch: async (req) => { let p = new URL(req.url).pathname; if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) return new Response('nf', { status: 404 }); return new Response(fs.readFileSync(f), { headers: { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' } }); } } };
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const url = `http://localhost:${server.address().port}${req.url}`;
  const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
  const headers = {}; for (const [k, v] of r.headers) if (k !== 'set-cookie') headers[k] = v;
  const sc = r.headers.getSetCookie(); if (sc.length) headers['set-cookie'] = sc;
  res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((ok) => server.listen(0, ok));
const BASE = `http://localhost:${server.address().port}`;
const sample = fs.readFileSync(path.join(ROOT, 'tests/sample.txt'), 'utf8');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow', permissions: [] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let n = 0; const step = async (name, fn) => { try { await fn(); n++; console.log('  ✓', name); } catch (e) { console.log('  ✗', name); await page.screenshot({ path: '/tmp/fail.png' }); throw e; } };
const text = (sel) => page.locator(sel).first().innerText();
const click = (sel) => page.locator(sel).first().click();
const mode = () => page.evaluate(() => document.documentElement.dataset.mode);

await step('titre « Seances entrainement » et écran de connexion', async () => {
  await page.goto(BASE); await page.waitForSelector('form[data-submit=login]');
  assert.equal(await page.title(), 'Seances entrainement');
  assert.match(await text('h1'), /Seances entrainement/);
  const man = await (await page.request.get(BASE + '/manifest.json')).json(); assert.equal(man.name, 'Seances entrainement'); assert.equal(man.short_name, 'Seances entrainement');
});
await step('création du compte → arrivée dans l’appli', async () => {
  await click('[data-act=authMode]'); await page.fill('input[name=username]', 'Martin'); await page.fill('input[name=password]', 'motdepasse1');
  await click('button[type=submit]'); await page.waitForSelector('nav.tabs');
  assert.match(await text('h1'), /Réglages/); // un nouveau compte arrive sur son profil sportif
  await click('[data-act=tab][data-id=home]'); assert.match(await text('h1'), /Salut Martin/);
});
await step('rechargement : ouvre directement, sans reconnexion', async () => {
  await page.reload(); await page.waitForSelector('nav.tabs', { timeout: 5000 });
  assert.equal(await page.locator('form[data-submit=login]').count(), 0); assert.match(await text('h1'), /Salut Martin/);
});
await step('profil sportif enregistré', async () => {
  await click('[data-act=tab][data-id=settings]'); await page.selectOption('select[name=boulderMax]', '6B'); await page.fill('input[name=years]', '4');
  for (const k of ['eq_wall', 'eq_bar', 'eq_weights', 'eq_band', 'eq_hangboard']) await page.check(`input[name=${k}]`);
  await click('form[data-submit=saveProfile] button[type=submit]'); await page.waitForTimeout(300);
  assert.equal(await page.locator('input[name=eq_hangboard]').isChecked(), true);
});
await step('clair / sombre / palette / forme des icônes changent vraiment le site', async () => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await click('[data-act=appear][data-k=mode][data-v=light]'); assert.equal(await mode(), 'light'); const light = await bg();
  await click('[data-act=appear][data-k=mode][data-v=dark]'); assert.equal(await mode(), 'dark'); const dark = await bg();
  assert.notEqual(light, dark, 'le fond ne change pas');
  const acc = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const a1 = await acc(); await click('[data-act=appear][data-k=palette][data-v=granit]'); assert.notEqual(await acc(), a1);
  await click('[data-act=appear][data-k=shape][data-v=hex]'); assert.equal(await page.evaluate(() => document.documentElement.dataset.shape), 'hex');
  const clip = await page.evaluate(() => getComputedStyle(document.querySelector('.ico')).clipPath); assert.match(clip, /polygon/);
  await click('[data-act=appear][data-k=size][data-v=xl]'); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '20px');
  await click('[data-act=appear][data-k=mode][data-v=light]'); await page.reload(); await page.waitForSelector('nav.tabs');
  assert.equal(await mode(), 'light'); assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'granit');
  await click('[data-act=tab][data-id=settings]'); await click('[data-act=appear][data-k=mode][data-v=dark]'); await click('[data-act=appear][data-k=size][data-v=m]'); await click('[data-act=appear][data-k=palette][data-v=gres]'); await click('[data-act=appear][data-k=shape][data-v=squircle]');
});
await step('coller ton texte de séance → 8 exercices', async () => {
  await click('[data-act=tab][data-id=seances]'); await click('[data-act=openImport]'); await page.fill('textarea', sample); await click('[data-act=parseImport]');
  await page.waitForSelector('[data-act=saveImport]'); assert.equal(await page.locator('.card .item').count(), 8);
  await click('[data-act=saveImport]'); await page.waitForSelector('[data-act=addEx]');
  assert.match(await page.locator('input[data-change=sname]').inputValue(), /Séance jambes/);
});
await step('mode séance : chronos, séries, repos, enregistrement', async () => {
  await click('[data-act=play]'); await page.waitForSelector('#player.open');
  assert.match(await text('#player h1'), /Sauts verticaux/);
  let guard = 0, sawRest = false, sawTime = false;
  while (guard++ < 200) {
    if (await page.locator('#player [data-act=pSave]').count()) break;
    if (await page.locator('#player [data-act=pRestSkip]').count()) { sawRest = true; await click('#player [data-act=pRestSkip]'); }
    else if (await page.locator('#player [data-act=pWorkDone]').count()) { sawTime = true; await page.waitForTimeout(1100); await click('#player [data-act=pWorkDone]'); }
    else if (await page.locator('#player [data-act=pGo]').count()) { await click('#player [data-act=pGo]'); }
    await page.waitForTimeout(20);
  }
  assert.ok(sawRest && sawTime, 'repos ou chrono non vu'); assert.ok(guard < 200);
  await click('#player [data-act=pRpe][data-v="3"]'); await click('#player [data-act=pSave]'); await page.waitForSelector('#player:not(.open)', { state: 'attached' });
});
await step('historique enregistré sur le serveur', async () => {
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => (await (await fetch('/api/history')).json()).history);
  assert.equal(r.length, 1); assert.equal(r[0].data.exercises.length, 8); assert.equal(r[0].data.rpe, 3);
});
await step('progrès : silhouette, courbes et records', async () => {
  await click('[data-act=tab][data-id=progress]'); await page.waitForSelector('svg.body');
  assert.equal(await page.locator('svg.body').count(), 2); assert.ok(await page.locator('svg.body .h').count() > 3);
  assert.ok(await page.locator('text=Historique').count() > 0);
});
await step('générateur : propose une séance adaptée, la sauvegarde', async () => {
  await click('[data-act=tab][data-id=generate]'); await click('[data-act=gSet][data-k=focus][data-v=devers]'); await click('[data-act=gSet][data-k=size][data-v=petite]'); await click('[data-act=generate]');
  await page.waitForSelector('#genresult'); const rows = await page.locator('#genresult .item').count(); assert.ok(rows >= 8, 'trop peu d’exercices: ' + rows);
  assert.ok(await page.locator('#genresult >> text=Échauffement').count() > 0);
  await click('#genresult [data-act=swapEx]'); await click('[data-act=saveGen]'); await page.waitForTimeout(200);
  await click('[data-act=tab][data-id=seances]'); assert.ok(await page.locator('.card .btn.pri:has-text("Lancer")').count() >= 2);
});
await step('planifier dans le calendrier', async () => {
  await click('[data-act=tab][data-id=home]'); await click('[data-act=subHome][data-id=cal]'); await click('.cal .d.today'); await page.waitForSelector('form[data-submit=addEvent]');
  await click('form[data-submit=addEvent] button[type=submit]'); await page.waitForTimeout(200); await click('[data-act=closeSheet].btn'); await click('[data-act=subHome][data-id=today]');
  assert.ok(await page.locator('text=Lancer').count() >= 1);
});
await step('hors ligne : l’appli s’ouvre quand même avec tes données', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('nav.tabs'); await page.waitForTimeout(800);
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('nav.tabs', { timeout: 8000 });
  assert.match(await text('h1'), /Salut Martin/); await click('[data-act=tab][data-id=seances]'); assert.ok(await page.locator('.card .btn.pri:has-text("Lancer")').count() >= 2);
  await ctx.setOffline(false);
});

/* Un deuxième compte partage sa progression */
const other = await ctx.request.newContext?.() ?? null;
const hit = async (method, p, body, cookie) => { const r = await worker.fetch(new Request(BASE + p, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env); return r; };
const reg = await hit('POST', '/api/auth/register', { username: 'Julie', password: 'motdepasse2' });
const jcookie = reg.headers.getSetCookie()[0].split(';')[0];
await hit('POST', '/api/social/profile', { visibility: 'public', shareStats: true, shareRecords: true, shareSessions: true }, jcookie);
await hit('POST', '/api/history', { id: 'jh1', sessionName: 'Dalle technique', startedAt: Date.now() - 3600000, durationSeconds: 3000, data: { rpe: 2, exercises: [{ name: 'Tractions', sets: [{ reps: 8, load: 15, done: true }] }] } }, jcookie);
await step('communauté : chercher, suivre et comparer', async () => {
  await click('[data-act=tab][data-id=progress]'); await click('[data-act=subProg][data-id=friends]'); await page.waitForSelector('#socform');
  await page.fill('[data-input=socsearch]', 'jul'); await page.waitForSelector('[data-act=socFollow]'); await click('[data-act=socFollow]');
  await page.waitForSelector('text=Dalle technique'); assert.ok(await page.locator('text=Tractions').count() > 0);
  await page.selectOption('select[name=vis]', 'followers'); await page.waitForTimeout(400);
  const me = await page.evaluate(async () => (await (await fetch('/api/social/me')).json()).profile.visibility); assert.equal(me, 'followers');
});
await step('déconnexion puis reconnexion par mot de passe', async () => {
  await click('[data-act=tab][data-id=settings]'); page.once('dialog', (d) => d.accept()); await click('[data-act=logout]'); await page.waitForSelector('form[data-submit=login]');
  assert.equal(await page.locator('input[name=username]').inputValue(), 'Martin');
  await page.fill('input[name=password]', 'motdepasse1'); await click('button[type=submit]'); await page.waitForSelector('nav.tabs');
  await click('[data-act=tab][data-id=seances]'); assert.ok(await page.locator('.card .btn.pri:has-text("Lancer")').count() >= 2, 'séances perdues après reconnexion');
});
await step('aucune erreur dans la console du navigateur', async () => assert.deepEqual(errors, []));
console.log(`\n${n} étapes OK`);
await browser.close(); server.close();
