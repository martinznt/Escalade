// tests/e2e.mjs — test de bout en bout dans un VRAI navigateur (Chromium, viewport téléphone) :
// vrai worker.js + faux D1 (SQLite) servis localement, on clique réellement sur les boutons.
// Parcours : compte A (profil, métriques, cotations, styles, maxima, séance, chrono, pause, questionnaire, historique,
// génération + explication, « aujourd'hui », tableau de bord, recherche, export, publication) → compte B (commune,
// copie indépendante, refus serveur) → administrateur (EDIT_PASSWORD, contributions, signalements) → hors ligne.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer, makeEnv } from './server.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const env = makeEnv();
const srv = await startServer(env);
const BASE = srv.base;
const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') && process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const errors = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${who}] console: ${m.text()}`); });
};
const newCtx = async () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'allow', acceptDownloads: true });
let n = 0, cur = null;
/** Attend qu'une condition (évaluée côté Node) devienne vraie. */
async function poll(fn, ms = 12000, what = 'condition') { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error('Délai dépassé : ' + what); await new Promise((r) => setTimeout(r, 300)); } }
const step = async (name, fn) => {
  try { await fn(); n++; console.log('  ✓', name); }
  catch (e) { console.log('  ✗', name); if (cur) await cur.screenshot({ path: '/tmp/e2e-fail.png', fullPage: true }).catch(() => {}); throw e; }
};
const H = (page) => ({
  click: (sel) => page.locator(sel).first().click(),
  text: (sel) => page.locator(sel).first().innerText(),
  count: (sel) => page.locator(sel).count(),
  confirm: async () => { await page.waitForSelector('#dialog.open [data-dlg="1"]'); await page.click('#dialog.open [data-dlg="1"]'); await page.waitForSelector('#dialog:not(.open)', { state: 'attached' }); },
  tab: async (id) => { await page.click(`nav.tabs [data-id=${id}]`); await page.waitForTimeout(120); },
  sub: async (act, id) => { await page.click(`[data-act=${act}][data-id=${id}]`); await page.waitForTimeout(120); },
  noOverflow: async (where) => { const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); assert.ok(ok, `défilement horizontal de page détecté (${where})`); },
  api: (method, path, body) => page.evaluate(async ([m, p, b]) => { const r = await fetch(p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); let d = null; try { d = await r.json(); } catch {} return { status: r.status, data: d }; }, [method, path, body]),
  waitSynced: async () => { await page.waitForFunction(() => document.querySelector('.syncbadge.ok'), null, { timeout: 15000 }); },
});

/* ═════════ Compte A ═════════ */
const ctxA = await newCtx(); const A = await ctxA.newPage(); watch(A, 'A'); cur = A; const a = H(A);
console.log('Compte A');
await step('première ouverture : écran de connexion, titre « Mes séances »', async () => {
  await A.goto(BASE); await A.waitForSelector('form[data-submit=login]');
  assert.equal(await A.title(), 'Mes séances');
  const man = await (await A.request.get(BASE + '/manifest.json')).json(); assert.equal(man.name, 'Mes séances');
  await a.noOverflow('connexion');
});
await step('mauvais identifiants : message clair', async () => {
  await A.fill('input[name=username]', 'Personne'); await A.fill('input[name=password]', 'mauvais-mdp'); await a.click('button[type=submit]');
  await A.waitForFunction(() => /incorrect/i.test(document.querySelector('.err')?.textContent || ''));
});
await step('inscription → tableau de bord avec premier lancement (aucune séance imposée)', async () => {
  await a.click('[data-act=authMode]'); await A.fill('input[name=username]', 'Alice'); await A.fill('input[name=password]', 'motdepasse1'); await a.click('button[type=submit]');
  await A.waitForSelector('nav.tabs'); await A.waitForSelector('[data-act=obAct]');
  assert.match(await a.text('h1'), /Bonjour Alice/);
  assert.equal(await A.evaluate(async () => (await (await fetch('/api/sync')).json()).items.length), 0, 'aucune séance générique créée');
});
await step('choix des activités et de l’environnement', async () => {
  await a.click('[data-act=obAct][data-id=climbing_boulder]'); await a.click('[data-act=obAct][data-id=conditioning]');
  await a.click('[data-act=obEnv][data-id=maison]'); await a.click('[data-act=obDone]');
  await A.waitForTimeout(200); assert.equal(await a.count('[data-act=obDone]'), 0);
});
await step('navigation sur les 5 onglets, sans erreur ni débordement', async () => {
  for (const t of ['progress', 'library', 'profile', 'settings', 'home']) { await a.tab(t); await a.noOverflow(t); }
});
await step('rechargement : session conservée', async () => {
  await A.reload(); await A.waitForSelector('nav.tabs'); assert.equal(await a.count('form[data-submit=login]'), 0);
});
await step('performances : mesure + « je ne sais pas »', async () => {
  await a.tab('profile'); await a.sub('profSub', 'perfs');
  await a.click('[data-act=perfAdd]'); await A.selectOption('#sheet select[name=metricId]', 'max_tractions');
  await A.waitForSelector('#sheet input[name=value]'); assert.equal(await A.getAttribute('#sheet input[name=value]', 'inputmode'), 'decimal');
  await A.fill('#sheet input[name=value]', '8'); await A.selectOption('#sheet select[name=source]', 'measured'); await a.click('#sheet button[type=submit]');
  await A.waitForSelector('text=Tractions strictes max');
  await a.click('[data-act=perfAdd]'); await A.selectOption('#sheet select[name=metricId]', 'hollow_hold'); await A.waitForSelector('#sheet input[name=unknown]');
  await A.check('#sheet input[name=unknown]'); await a.click('#sheet button[type=submit]');
  await A.waitForSelector('text=je ne sais pas');
  assert.ok(await a.count('text=Gainage bateau') > 0);
});
await step('cotations : système U1→U8 avec correspondance, style personnalisé, maxima multiples multi-styles', async () => {
  await a.sub('profSub', 'climbing');
  await a.click('[data-act=sysNew]'); await a.click('[data-act=sysFromTpl][data-id=u8]');
  await A.waitForSelector('#sheet form[data-submit=lvlSave]');
  const u5 = A.locator('#sheet form[data-submit=lvlSave]').nth(4);
  await u5.locator('select[name=map]').selectOption('6B'); await u5.locator('button[type=submit]').click();
  await A.waitForTimeout(150); await a.click('#sheet [data-act=closeSheet].btn');
  await a.click('[data-act=styleNew]'); await A.fill('#sheet input[name=label]', 'Arête'); await a.click('#sheet button[type=submit]');
  await A.waitForSelector('text=Arête ✎');
  // Maximum 1 : Fontainebleau 6C, styles Dévers + Réglettes
  await a.click('[data-act=perfAdd][data-id=max_bloc]'); await A.waitForSelector('#sheet select[name=systemId]');
  await A.selectOption('#sheet select[name=systemId]', 'font'); await A.selectOption('#sheet select[name=levelId]', { label: '6C' });
  await A.click('#sheet label.chip:has-text("Dévers")'); await A.click('#sheet label.chip:has-text("Réglettes")'); await a.click('#sheet button[type=submit]');
  // Maximum 2 : système U, U5, style Arête
  await a.click('[data-act=perfAdd][data-id=max_bloc]'); await A.waitForSelector('#sheet select[name=systemId]');
  const uId = await A.evaluate(() => [...document.querySelectorAll('#sheet select[name=systemId] option')].find((o) => o.textContent.includes('U1'))?.value);
  await A.selectOption('#sheet select[name=systemId]', uId); await A.selectOption('#sheet select[name=levelId]', { label: 'U5' });
  await A.click('#sheet label.chip:has-text("Arête")'); await a.click('#sheet button[type=submit]');
  await A.waitForSelector('text=Salle U1 → U8');
  assert.ok(await a.count('text=Dévers : 6C') > 0, 'maximum par style');
  assert.ok(await a.count('text=Arête : U5') > 0, 'style personnalisé utilisé');
});
await step('objectif complexe : front lever (arbre, blocages, chemins)', async () => {
  await a.sub('profSub', 'goals'); await a.click('[data-act=goalNewSkill][data-id=front_lever]');
  await A.waitForSelector('text=Capacités requises');
  await a.click('[data-act=goalTab][data-id=tree]'); await A.waitForSelector('ol.tree');
  await a.click('[data-act=goalTab][data-id=blockers]'); await A.waitForSelector('text=Qu’est-ce qui me bloque');
  await a.click('[data-act=goalTab][data-id=paths]'); await A.waitForSelector('text=Plusieurs chemins possibles');
  await a.noOverflow('objectif');
});
await step('matériel : ajout d’une barre et d’un élastique à la maison', async () => {
  await a.sub('profSub', 'equipment'); await a.click('[data-act=envEdit]');
  for (const t of ['Barre de traction', 'Élastique']) { const chip = A.locator(`#sheet label.chip:has-text("${t}")`); if (!(await chip.getAttribute('class')).includes('on')) await chip.click(); }
  await a.click('#sheet button[type=submit]'); await A.waitForSelector('text=Barre de traction');
});
await step('création manuelle d’une séance : exercices du catalogue, modification, réordonnancement', async () => {
  await a.tab('library'); await a.click('[data-act=newSeance]'); await A.waitForSelector('input[data-change=sName]');
  await A.fill('input[data-change=sName]', 'Tirage maison'); await A.press('input[data-change=sName]', 'Tab');
  for (const q of ['Gainage bateau', 'Tractions australiennes']) {
    await a.click('[data-act=exAdd]'); await A.fill('#sheet input[data-input=pickQ]', q); await A.waitForTimeout(100);
    await A.click(`#sheet [data-act=exPick]:has-text("${q}")`);
  }
  await A.waitForSelector('.item.ex:has-text("Tractions australiennes")');
  await A.locator('.item.ex:has-text("Gainage bateau") [data-act=exEdit]').click();
  await A.fill('#sheet input[name=sets]', '2'); await A.fill('#sheet input[name=secMin]', '3'); await A.fill('#sheet input[name=secMax]', '3'); await A.fill('#sheet input[name=rest]', '1');
  await a.click('#sheet button[type=submit]');
  await A.locator('.item.ex:has-text("Tractions australiennes") [data-act=exEdit]').click();
  await A.fill('#sheet input[name=sets]', '2'); await A.fill('#sheet input[name=rest]', '1'); await a.click('#sheet button[type=submit]');
  await A.locator('.item.ex:has-text("Tractions australiennes") [data-act=exUp]').click();
  const names = await A.locator('.item.ex b').allInnerTexts(); assert.deepEqual(names.slice(0, 2), ['Tractions australiennes', 'Gainage bateau (hollow body)']);
  await a.click('[data-act=sTemplate]'); await A.waitForSelector('text=Retirer des modèles');
});
await step('mode séance : séries, chrono, pause (non comptée), repos, fin', async () => {
  await a.click('[data-act=play]'); await A.waitForSelector('#player.open');
  let guard = 0, sawRest = false, sawTimer = false, paused = false;
  while (guard++ < 60) {
    if (await a.count('#player [data-act=pSave]')) break;
    if (await a.count('#player [data-act=pRestSkip]')) { sawRest = true; await a.click('#player [data-act=pRestSkip]'); }
    else if (await a.count('#player [data-act=pWorkDone]')) {
      sawTimer = true;
      if (!paused) { paused = true; await a.click('#player [data-act=pPause]'); await A.waitForSelector('#player >> text=En pause'); await A.waitForTimeout(1500); await a.click('#player [data-act=pPause]'); }
      await A.waitForTimeout(400);
      if (await a.count('#player [data-act=pWorkDone]')) await a.click('#player [data-act=pWorkDone]');
    } else if (await a.count('#player [data-act=pGo]')) await a.click('#player [data-act=pGo]');
    await A.waitForTimeout(40);
  }
  assert.ok(sawRest && sawTimer && paused, 'repos, chrono et pause vus');
  assert.match(await a.text('#player'), /de pause \(non comptée\)/);
});
await step('questionnaire adaptatif puis enregistrement', async () => {
  await A.locator('#player [data-act=qFelt]').first().click();
  await A.locator('#player [data-act=qPick][data-k=hardest]').first().click();
  await a.click('#player [data-act=qDiff][data-v="3"]');
  await A.fill('#player [data-input=qComment]', 'Bonne séance, commentaire conservé');
  await a.click('#player [data-act=qDiff][data-v="4"]'); // un nouveau clic ne doit pas effacer le commentaire
  assert.equal(await A.inputValue('#player [data-input=qComment]'), 'Bonne séance, commentaire conservé');
  await a.click('#player [data-act=pSave]'); await A.waitForSelector('#player:not(.open)', { state: 'attached' });
  await A.waitForSelector('text=ce qui change dans ton profil');
});
await step('historique réellement enregistré sur le serveur (durée, pause, questionnaire)', async () => {
  await poll(async () => (await a.api('GET', '/api/history')).data.history.length === 1, 12000, 'historique sur le serveur');
  const h = (await a.api('GET', '/api/history')).data.history[0];
  assert.equal(h.data.exercises.length, 2); assert.equal(h.data.rpe, 4); assert.equal(h.data.questionnaire.comment, 'Bonne séance, commentaire conservé');
  assert.ok(h.data.questionnaire.felt.length >= 1); assert.ok(h.data.pausedSeconds >= 1, 'pause comptée à part'); assert.ok(h.durationSeconds < 200);
  assert.ok(h.durationSeconds >= h.data.activeSeconds);
  await a.tab('progress'); await a.sub('progSub', 'history'); await A.waitForSelector('text=Tirage maison');
});
await step('générateur : simulation, priorités, génération expliquée, enregistrement', async () => {
  await a.tab('library'); await a.sub('libSub', 'generate');
  await a.click('[data-act=gSet][data-k=activityId][data-v=conditioning]'); await a.click('[data-act=gSet][data-k=mode][data-v=goal]');
  await A.waitForSelector('select[data-change=gGoal]'); const gid = await A.evaluate(() => document.querySelector('select[data-change=gGoal] option:nth-child(2)').value);
  await A.selectOption('select[data-change=gGoal]', gid); await a.click('[data-act=gSet][data-k=minutes][data-v="20"]');
  await a.click('[data-act=genPlan]'); await A.waitForSelector('#genplan');
  assert.match(await a.text('#genplan'), /Simulation avant génération/); assert.match(await a.text('#genplan'), /Matériel nécessaire/);
  await A.locator('#genplan [data-act=prio][data-d="1"]').first().click(); await A.waitForSelector('#genplan');
  await a.click('[data-act=genDo]'); await A.waitForSelector('#genresult');
  assert.match(await a.text('#genresult'), /Pourquoi cette séance/); assert.match(await a.text('#genresult'), /Faits/);
  assert.ok(await a.count('#genresult .item.ex') >= 3);
  await A.locator('#genresult [data-act=exSwap]').first().click(); await A.waitForSelector('#sheet [data-act=exSwapDo]');
  assert.ok(await a.count('#sheet .why li') > 0, 'chaque alternative a sa raison');
  await A.locator('#sheet [data-act=exSwapDo]:not([disabled])').first().click();
  await a.click('[data-act=genSave]'); await A.waitForSelector('text=✓ Enregistrée');
});
await step('commande naturelle : « je n’ai que 12 minutes » reconstruit la séance ouverte', async () => {
  await a.tab('library'); await A.locator('[data-act=openSeance]').first().click(); await A.waitForSelector('input[data-change=sName]');
  const sid = await A.evaluate(() => location.hash.split('/')[3]);
  await a.tab('home');
  await A.fill('form[data-submit=command] input', 'Je n’ai que 12 minutes'); await a.click('form[data-submit=command] button');
  await A.waitForSelector('#toast.show'); assert.match(await a.text('#toast'), /12 min/);
  await A.fill('form[data-submit=command] input', 'quel temps fait-il ?'); await a.click('form[data-submit=command] button');
  await A.waitForFunction(() => /Rien n’a été fait/.test(document.querySelector('#toast')?.textContent || ''));
  assert.ok(sid);
});
await step('« Que faire aujourd’hui ? » et tableau de bord personnalisé', async () => {
  assert.match(await a.text('main'), /Que faire aujourd’hui/);
  await a.click('[data-act=dashEdit]'); await a.click('#sheet [data-act=dashToggle][data-id=records]'); await a.click('#sheet [data-act=closeSheet].btn');
  await A.waitForSelector('h3:has-text("Records")');
  await A.reload(); await A.waitForSelector('h3:has-text("Records")');
});
await step('recherche intelligente et classique', async () => {
  await a.tab('library'); await a.sub('libSub', 'search');
  await A.fill('form[data-submit=search] input', 'front lever'); await a.click('form[data-submit=search] button');
  await A.waitForSelector('text=Exercices liés à « Front lever »');
  await A.fill('form[data-submit=search] input', 'séances sans matériel'); await a.click('form[data-submit=search] button');
  await A.waitForSelector('text=Séances sans matériel');
});
await step('carte d’entraînement et « comprendre mon profil »', async () => {
  await a.tab('profile'); await a.sub('profSub', 'map'); await A.waitForSelector('.capmap .cap');
  await A.locator('.capmap .cap').first().click(); await A.waitForSelector('#sheet >> text=Comment le sais-tu');
  await a.click('#sheet [data-act=closeSheet].btn');
  await a.sub('profSub', 'understand'); await A.waitForSelector('text=Mesuré'); assert.match(await a.text('main'), /Tractions strictes max : 8/);
});
await step('export JSON', async () => {
  await a.tab('settings'); await a.sub('setSub', 'data');
  const [dl] = await Promise.all([A.waitForEvent('download'), a.click('[data-act=export]')]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(data.app, 'mes-seances'); assert.ok(data.items.some((i) => i.c === 'perf')); assert.ok(data.history.length === 1);
  assert.ok(!JSON.stringify(data).includes('secret-admin-de-test'));
});
await step('publication dans la bibliothèque commune (données personnelles retirées)', async () => {
  await a.tab('library'); await a.sub('libSub', 'seances'); await A.locator('.card:has-text("Tirage maison") [data-act=openSeance]').click(); await A.waitForSelector('[data-act=sPublish]');
  await a.click('[data-act=sPublish]'); await A.waitForSelector('#sheet >> text=Retiré automatiquement');
  await a.click('#sheet [data-act=sPublishDo][data-scope=common]'); await A.waitForSelector('#toast.show');
  const list = (await a.api('GET', '/api/shared?scope=common')).data.items; assert.equal(list.length, 1); assert.ok(list[0].level.level);
});

/* ═════════ Compte B ═════════ */
console.log('Compte B');
const ctxB = await newCtx(); const B = await ctxB.newPage(); watch(B, 'B'); cur = B; const b = H(B);
let commonId;
await step('inscription B : les données privées de A sont invisibles', async () => {
  await B.goto(BASE); await B.waitForSelector('form[data-submit=login]'); await b.click('[data-act=authMode]');
  await B.fill('input[name=username]', 'Bob'); await B.fill('input[name=password]', 'motdepasse2'); await b.click('button[type=submit]'); await B.waitForSelector('nav.tabs');
  assert.equal((await b.api('GET', '/api/history')).data.history.length, 0);
  assert.equal((await b.api('GET', '/api/items?since=0')).data.items.length, 0);
  assert.equal((await b.api('GET', '/api/sync')).data.items.length, 0);
});
await step('B voit la contribution commune, la copie et modifie sa copie', async () => {
  await b.tab('library'); await b.sub('libSub', 'common'); await B.waitForSelector('text=Tirage maison');
  await B.locator('[data-act=commonOpen]').first().click(); await B.waitForSelector('text=Pourquoi ce niveau');
  commonId = await B.evaluate(() => decodeURIComponent(location.hash.split('/')[3]));
  assert.equal(await b.count('[data-act=commonEdit]'), 0, 'pas de bouton de modification pour B');
  await b.click('[data-act=commonCopy]'); await B.waitForSelector('input[data-change=sName]');
  await B.fill('input[data-change=sName]', 'Ma version de Bob'); await B.press('input[data-change=sName]', 'Tab');
  await B.locator('.item.ex [data-act=exDel]').first().click(); await b.confirm();
  await poll(async () => (await b.api('GET', '/api/sync')).data.items.some((s) => s.name === 'Ma version de Bob'), 12000, 'copie synchronisée');
});
await step('l’original n’a pas changé ; modification directe par B refusée par le serveur', async () => {
  const orig = (await b.api('GET', '/api/shared/' + commonId)).data.item;
  assert.equal(orig.title, 'Tirage maison'); assert.equal(orig.session.exercises.length, 2);
  const put = await b.api('PUT', '/api/shared/' + commonId, { session: { name: 'Piraté', exercises: [{ name: 'X' }] } });
  assert.equal(put.status, 403);
  assert.equal((await b.api('DELETE', '/api/shared/' + commonId)).status, 403);
  assert.equal((await b.api('GET', '/api/admin/bugs')).status, 403, 'route admin refusée');
});
await step('B signale un bug depuis Paramètres', async () => {
  await b.tab('settings'); await b.sub('setSub', 'bug');
  await B.fill('form[data-submit=bugSend] input[name=title]', 'Bug <b>test</b>'); await B.fill('form[data-submit=bugSend] textarea', 'Le bouton ne répond pas <script>alert(1)</script>');
  await b.click('form[data-submit=bugSend] button[type=submit]'); await B.waitForSelector('#toast.show');
  await poll(async () => (await b.api('GET', '/api/bugs/mine')).data.reports.length === 1, 12000, 'signalement envoyé');
});

/* ═════════ Administrateur ═════════ */
console.log('Administrateur');
const ctxC = await newCtx(); const C = await ctxC.newPage(); watch(C, 'C'); cur = C; const c = H(C);
await step('mauvais mot de passe admin refusé ; bon EDIT_PASSWORD → compte administrateur', async () => {
  await C.goto(BASE); await C.waitForSelector('form[data-submit=login]'); await c.click('[data-act=authMode]');
  await C.fill('input[name=username]', 'Carole'); await C.fill('input[name=password]', 'motdepasse3'); await c.click('button[type=submit]'); await C.waitForSelector('nav.tabs');
  await c.tab('settings'); await c.sub('setSub', 'admin');
  await C.fill('form[data-submit=adminOn] input[name=password]', 'pas-le-bon'); await c.click('form[data-submit=adminOn] button');
  await C.waitForFunction(() => /incorrect/i.test(document.querySelector('#toast')?.textContent || ''));
  assert.equal(await C.inputValue('form[data-submit=adminOn] input[name=password]'), '', 'champ effacé après traitement');
  await C.fill('form[data-submit=adminOn] input[name=password]', 'secret-admin-de-test'); await c.click('form[data-submit=adminOn] button');
  await C.waitForSelector('text=Tu es administrateur');
  const ls = await C.evaluate(() => JSON.stringify(localStorage)); assert.ok(!ls.includes('secret-admin-de-test'), 'secret jamais stocké côté navigateur');
  await C.reload(); await C.waitForSelector('nav.tabs'); await c.tab('settings'); await c.sub('setSub', 'admin'); await C.waitForSelector('text=Tu es administrateur');
});
await step('l’admin voit le signalement (texte échappé, auteur) et le marque traité', async () => {
  await C.waitForSelector('text=Le bouton ne répond pas');
  assert.equal(await c.count('.card script'), 0); assert.match(await c.text('main'), /par Bob/);
  await C.locator('[data-act=bugStatus]').first().click(); await C.waitForTimeout(300);
  const r = (await c.api('GET', '/api/admin/bugs')).data.reports; assert.equal(r[0].status, 'done');
});
await step('l’admin modifie puis supprime la contribution ; pas d’accès aux données privées', async () => {
  const d = (await c.api('GET', '/api/shared/' + commonId)).data.item; assert.equal(d.canEdit, true);
  await c.tab('library'); await c.sub('libSub', 'common'); await C.locator('[data-act=commonOpen]').first().click(); await C.waitForSelector('[data-act=commonEdit]');
  await c.click('[data-act=commonEdit]'); await C.waitForSelector('input[data-change=sName]'); await C.fill('input[data-change=sName]', 'Tirage maison (modéré)'); await C.press('input[data-change=sName]', 'Tab');
  await c.click('[data-act=sharedSave]'); await C.waitForSelector('h2:has-text("Tirage maison (modéré)")');
  await c.click('[data-act=commonDelete]'); await c.confirm(); await C.waitForTimeout(400);
  assert.equal((await c.api('GET', '/api/shared?scope=common')).data.items.length, 0);
  assert.equal((await c.api('GET', '/api/history')).data.history.length, 0, 'l’admin ne voit que son propre historique');
  assert.equal((await b.api('GET', '/api/sync')).data.items.some((s) => s.name === 'Ma version de Bob'), true, 'la copie de B survit à la suppression de l’original');
});

/* ═════════ Hors ligne (compte A) ═════════ */
console.log('Hors ligne');
cur = A;
await step('Service Worker actif, puis passage hors ligne : l’application s’ouvre avec les données', async () => {
  await A.evaluate(() => navigator.serviceWorker.ready); await A.reload(); await A.waitForSelector('nav.tabs'); await A.waitForTimeout(600);
  await ctxA.setOffline(true); await A.reload(); await A.waitForSelector('nav.tabs', { timeout: 10000 });
  await a.tab('library'); await a.sub('libSub', 'seances'); assert.ok(await a.count('text=Tirage maison') > 0);
});
await step('modifications hors ligne (séance, performance, note), fermeture puis réouverture', async () => {
  await a.click('[data-act=newSeance]'); await A.waitForSelector('input[data-change=sName]'); await A.fill('input[data-change=sName]', 'Créée hors ligne'); await A.press('input[data-change=sName]', 'Tab');
  await a.tab('profile'); await a.sub('profSub', 'perfs'); await a.click('[data-act=perfAdd]');
  await A.selectOption('#sheet select[name=metricId]', 'max_pompes'); await A.waitForSelector('#sheet input[name=value]'); await A.fill('#sheet input[name=value]', '25'); await a.click('#sheet button[type=submit]');
  await a.tab('progress'); await a.sub('progSub', 'journal'); await A.fill('form[data-submit=jnote] textarea', 'Note écrite hors ligne'); await a.click('form[data-submit=jnote] button');
  await A.waitForSelector('.syncbadge.offline');
  await A.close(); // fermeture de l'onglet avant toute synchronisation
});
let A2;
await step('retour en ligne : tout est synchronisé, sans doublon', async () => {
  A2 = await ctxA.newPage(); watch(A2, 'A2'); cur = A2; const a2 = H(A2);
  await A2.goto(BASE).catch(() => {}); await A2.waitForSelector('nav.tabs', { timeout: 10000 });
  await ctxA.setOffline(false); await A2.evaluate(() => window.dispatchEvent(new Event('online')));
  await a2.waitSynced();
  const items = (await a2.api('GET', '/api/items?since=0')).data.items;
  assert.equal(items.filter((i) => i.c === 'perf' && i.d.metricId === 'max_pompes').length, 1);
  assert.equal(items.filter((i) => i.c === 'jnote').length, 1);
  const s = (await a2.api('GET', '/api/sync')).data.items; assert.equal(s.filter((x) => x.name === 'Créée hors ligne').length, 1);
  assert.equal((await a2.api('GET', '/api/history')).data.history.length, 1, 'pas de doublon d’historique');
});
await step('déconnexion puis reconnexion : données intactes', async () => {
  const a2 = H(A2);
  await a2.tab('settings'); await a2.click('[data-act=logout]'); await a2.confirm(); await A2.waitForSelector('form[data-submit=login]');
  await A2.fill('input[name=password]', 'motdepasse1'); await a2.click('button[type=submit]'); await A2.waitForSelector('nav.tabs');
  await a2.tab('library'); await a2.sub('libSub', 'seances'); await A2.waitForSelector('text=Créée hors ligne'); await A2.waitForSelector('text=Tirage maison');
});
await step('aucune erreur JavaScript dans les navigateurs', async () => assert.deepEqual(errors, []));
console.log(`\n${n} étapes E2E OK`);
await browser.close(); srv.server.close();
