// tests/e2e.mjs — test de bout en bout dans un VRAI navigateur (Chromium, viewport téléphone) :
// vrai worker.js + faux D1 (SQLite) servis localement, on clique réellement sur les boutons.
// Parcours : compte A (profil, métriques, cotations, styles, maxima, séance, chrono, pause, questionnaire, historique,
// génération + explication, « aujourd'hui », tableau de bord, recherche, export, publication) → compte B (commune,
// copie indépendante, refus serveur) → administrateur (EDIT_PASSWORD, contributions, signalements) → hors ligne.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer, makeEnv } from './server.mjs';
import worker from '../worker.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const env = makeEnv({ AI: { run: async (_m, o) => ({ response: o.messages ? `Conseil du coach : ${o.messages.at(-1).content}` : '{}' }) } });
// Historique GitHub simulé pour « Voir les nouveautés » (aucun appel réseau pendant les tests).
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => String(u).startsWith('https://api.github.com/') ? Promise.resolve(new Response(JSON.stringify([
  { commit: { message: 'Visite guidée plus immersive\n\n- Des flèches montrent chaque bouton', committer: { date: new Date(Date.now() + 60000).toISOString() } }, parents: [{}] },
]))) : realFetch(u, o);
const srv = await startServer(env);
const BASE = srv.base;
const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') && process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const errors = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${who}] console: ${m.text()}`); });
};
const newCtx = async ({ ask = false } = {}) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'allow', acceptDownloads: true });
  // Les « petites questions » sont testées à part : ailleurs, on les met en pause pour ne pas masquer l'écran.
  if (!ask) await c.addInitScript(() => { if (!localStorage.getItem('sea:q-snooze')) localStorage.setItem('sea:q-snooze', JSON.stringify(Object.fromEntries(['acts', 'climbPerWeek', 'place', 'minutes', 'perWeek', 'bloc', 'tractions', 'pompes', 'goal', 'avoid'].map((k) => [k, 9e15])))); });
  return c;
};
let n = 0, cur = null;
/** Attend qu'une condition (évaluée côté Node) devienne vraie. */
async function poll(fn, ms = 12000, what = 'condition') { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error('Délai dépassé : ' + what); await new Promise((r) => setTimeout(r, 300)); } }
/** Deux validations de suite (mise en page) : la 2e boîte s'ouvre juste après la 1re. */
const confirm2 = async (P) => { await P.click('#dialog.open [data-dlg="1"]'); await P.waitForFunction(() => /sûr|Vraiment/.test(document.querySelector('#dialog.open')?.textContent || '')); await P.click('#dialog.open [data-dlg="1"]'); await P.waitForSelector('#dialog:not(.open)', { state: 'attached' }); };
const step = async (name, fn) => {
  try { await fn(); n++; console.log('  ✓', name); }
  catch (e) { console.log('  ✗', name); if (cur) await cur.screenshot({ path: '/tmp/e2e-fail.png', fullPage: true }).catch(() => {}); throw e; }
};
const H = (page) => ({
  click: (sel) => page.locator(sel).first().click(),
  text: (sel) => page.locator(sel).first().innerText(),
  count: (sel) => page.locator(sel).count(),
  confirm: async () => { await page.waitForSelector('#dialog.open [data-dlg="1"]'); await page.click('#dialog.open [data-dlg="1"]'); await page.waitForSelector('#dialog:not(.open)', { state: 'attached' }); },
  // La Bibliothèque s'ouvre sur sa liste : les étapes qui l'utilisent partent de « Mes séances ».
  tab: async (id) => { await page.click(`nav.tabs [data-id=${id}]`); await page.waitForTimeout(120); if (id === 'library') { await page.click('[data-act=libSub][data-id=seances]'); await page.waitForTimeout(120); } },
  // Rubriques en liste : si la rubrique n'est pas à l'écran, on revient d'abord à la liste (bouton retour).
  sub: async (act, id) => {
    const sel = `[data-act=${act}][data-id=${id}]`, root = { libSub: 'home', progSub: 'summary', profSub: 'home', setSub: 'main' }[act];
    if (!(await page.locator(sel).count()) && root) {
      if (await page.locator(`[data-act=${act}][data-id=${root}]`).count()) await page.locator(`[data-act=${act}][data-id=${root}]`).first().click();
      else await page.evaluate((hsh) => { location.hash = hsh; }, { libSub: '#/library/home', progSub: '#/progress/summary', profSub: '#/profile/home', setSub: '#/settings/main' }[act]);
      await page.waitForTimeout(150);
    }
    await page.locator(sel).first().click(); await page.waitForTimeout(120);
  },
  noOverflow: async (where) => { const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); assert.ok(ok, `défilement horizontal de page détecté (${where})`); },
  api: (method, path, body) => page.evaluate(async ([m, p, b]) => { const r = await fetch(p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); let d = null; try { d = await r.json(); } catch {} return { status: r.status, data: d }; }, [method, path, body]),
  waitSynced: async () => { await page.waitForFunction(() => document.querySelector('.syncbadge.ok'), null, { timeout: 15000 }); },
});

/* ═════════ Compte A ═════════ */
const ctxA = await newCtx(); const A = await ctxA.newPage(); watch(A, 'A'); cur = A; const a = H(A);
console.log('Compte A');
await step('première ouverture : page d’accueil claire (présentation, créer un compte, essayer sans compte), fond noir', async () => {
  await A.goto(BASE); await A.waitForSelector('[data-act=guestStart]');
  assert.equal(await A.title(), 'Séances entraînement');
  assert.match(await a.text('main'), /coach d’entraînement/); assert.equal(await a.count('[data-act=authPick][data-id=register]'), 1);
  assert.equal(await A.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)', 'mode sombre noir pur');
  const man = await (await A.request.get(BASE + '/manifest.json')).json(); assert.equal(man.name, 'Séances entraînement'); assert.equal(man.display, 'standalone'); assert.equal(man.background_color, '#000000');
  await a.noOverflow('connexion');
});
await step('mauvais identifiants : message clair', async () => {
  await a.click('[data-act=authPick][data-id=login]'); await A.waitForSelector('form[data-submit=login]');
  await A.fill('input[name=username]', 'Personne'); await A.fill('input[name=password]', 'mauvais-mdp'); await a.click('button[type=submit]');
  await A.waitForFunction(() => /incorrect/i.test(document.querySelector('.err')?.textContent || ''));
});
await step('inscription → accueil avec proposition de compléter le profil (aucune séance imposée)', async () => {
  await a.click('[data-act=authMode]'); await A.fill('input[name=username]', 'Alice'); await A.fill('input[name=password]', 'motdepasse1'); await a.click('button[type=submit]');
  await A.waitForSelector('nav.tabs'); await A.waitForSelector('[data-act=setupStart][data-id=quiz]');
  assert.match(await a.text('h1'), /Alice/);
  assert.equal(await A.evaluate(async () => (await (await fetch('/api/sync')).json()).items.length), 0, 'aucune séance générique créée');
});
await step('fiche de profil (tout sur une page) : sports et lieu, puis visite guidée', async () => {
  await a.click('[data-act=setupStart][data-id=form]'); await A.waitForSelector('[data-act=setupFinish]');
  await a.click('[data-act=setPick][data-q=acts][data-v=climbing_boulder]'); await a.click('[data-act=setPick][data-q=acts][data-v=conditioning]');
  await a.click('[data-act=setPick][data-q=places][data-v=maison]');
  await a.click('[data-act=setupFinish]'); await A.waitForSelector('#sheet.open [data-act=setupThanks]');
  assert.match(await a.text('#sheet'), /Escalade — bloc, Renforcement/);
  await a.click('[data-act=setupThanks]'); await A.waitForSelector('#tour .tour-bubble');
  assert.match(await a.text('#tour .tour-step'), /^1 \/ \d+$/);
  for (let k = 0; k < 3; k++) await a.click('#tour [data-act=tourNext]');
  await A.waitForFunction(() => location.hash.startsWith('#/library/generate'), null, { timeout: 5000 }); // la visite va elle-même sur la page
  await A.waitForSelector('#tour .tour-arrow.up, #tour .tour-arrow.down');
  const spot = await A.evaluate(() => { const r = document.querySelector('#tour .tour-spot').getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  assert.ok(spot, 'élément mis en lumière');
  await a.click('#tour .tour-x'); await A.waitForSelector('#tour', { state: 'detached' });
  await A.waitForFunction(() => location.hash.startsWith('#/home'), null, { timeout: 5000 });
  assert.equal(await a.count('[data-act=setupStart]'), 0, 'profil marqué comme complété');
  await poll(async () => (await a.api('GET', '/api/items?since=0')).data.items.some((i) => i.c === 'config' && i.id === 'main' && i.d.setupDone), 12000, 'profil enregistré sur le serveur');
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
  await a.sub('profSub', 'climbing'); await a.click('[data-act=carnetAdv]');
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
await step('carnet : ajout rapide, pyramide, projet suivi jusqu’à la réussite', async () => {
  await a.tab('home'); await a.click('[data-act=goCarnet]'); await A.waitForSelector('[data-act=ascQuick]');
  await a.click('[data-act=ascQuick]'); await A.waitForSelector('.aq [data-act=aqGrade]');
  await A.locator('.aq [data-act=aqGrade]', { hasText: /^6A$/ }).first().click(); await a.click('.aq [data-act=aqResult][data-v=flash]'); await a.click('.aq [data-act=aqSave]');
  await A.waitForSelector('.pyr-row'); assert.match(await a.text('.pyr'), /6A\s*1/);
  await a.click('[data-act=projNew]'); await A.fill('#pj-name', 'Le toit rouge');
  await A.locator('.aq [data-act=pjGrade]', { hasText: /^6B$/ }).first().click(); await a.click('.aq [data-act=pjSave]');
  await A.waitForSelector('.proj:has-text("Le toit rouge")');
  await a.click('.proj [data-act=projTry]'); await a.click('.proj [data-act=projTry]'); await A.waitForSelector('.proj:has-text("2 essais")');
  await a.click('.proj [data-act=projDone]'); await a.confirm();
  await A.waitForSelector('text=Projets réussis (1)'); assert.match(await a.text('.pyr'), /6B\s*1/, 'la réussite du projet entre dans la pyramide');
  await poll(async () => (await a.api('GET', '/api/items?since=0')).data.items.some((i) => i.c === 'project' && i.d.status === 'done' && i.d.tries.length), 12000, 'projet synchronisé');
});
await step('ma salle : cotation U1 → U8+, espaces et matériel ; bloc noté « U7 dur, dévers » dans cette salle', async () => {
  await a.tab('profile'); await a.sub('profSub', 'equipment'); await a.click('[data-act=envNewGym]'); await A.waitForSelector('#sheet input[name=city]');
  await a.click('#sheet [data-act=sysNew]'); await a.click('[data-act=sysFromTpl][data-id=u8plus]'); await A.waitForSelector('#sheet form[data-submit=lvlSave]'); await a.click('#sheet [data-act=closeSheet].btn');
  await a.click('[data-act=envNewGym]'); await A.fill('#sheet input[name=name]', 'Arkose Test'); await A.fill('#sheet input[name=city]', 'Montreuil');
  const sysId = await A.evaluate(() => [...document.querySelectorAll('#sheet select[name=gradeSys] option')].find((o) => /U8\+/.test(o.textContent))?.value);
  await A.selectOption('#sheet select[name=gradeSys]', sysId);
  await A.click('#sheet .garea:has-text("Espace entraînement") label.chip:has-text("Campus")');
  await a.click('#sheet button[type=submit]'); await A.waitForSelector('text=Arkose Test'); assert.match(await a.text('main'), /Montreuil/);
  await a.tab('home'); await a.click('[data-act=goCarnet]'); await a.click('[data-act=ascQuick]'); await A.waitForSelector('.aq [data-act=aqEnv]');
  await A.locator('.aq [data-act=aqEnv]', { hasText: 'Arkose Test' }).click();
  await A.locator('.aq [data-act=aqGrade]', { hasText: /^U7$/ }).click(); await a.click('.aq [data-act=aqNuance][data-v=dur]');
  await A.locator('.aq [data-act=aqStyle]', { hasText: 'Dévers' }).click(); await a.click('.aq [data-act=aqSave]');
  await A.waitForSelector('text=réussi · dur'); assert.match(await a.text('main'), /U7[\s\S]*dur · Arkose Test/);
  await poll(async () => (await a.api('GET', '/api/items?since=0')).data.items.some((i) => i.c === 'ascent' && i.d.nuance === 'dur' && i.d.grade?.label === 'U7' && i.d.context?.place === 'Arkose Test' && i.d.styles.length), 12000, 'bloc synchronisé');
});
await step('notifications : boîte des mises à jour (utilité, visite), réponses aux propositions, réglages par type', async () => {
  await a.tab('home'); await A.evaluate(() => localStorage.setItem('sea:inbox-seen', '1'));
  await A.reload(); await A.waitForSelector('.topicons [data-act=notifOpen] .badge-dot', { timeout: 10000 });
  await a.click('.topicons [data-act=notifOpen]'); await A.waitForSelector('.inbox .nitem.unread');
  assert.match(await a.text('.inbox'), /Ambiances[\s\S]*Minuteur/); await A.locator('.inbox details summary').first().click();
  assert.match(await a.text('.inbox'), /Ce qui a changé/);
  // Chaque notification se coche « vu » ; les vues passent dans « Déjà vues », plus discrètes
  const n0 = await a.count('.inbox .nitem.unread');
  await a.click('.inbox .nitem.unread [data-act=notifSeen][data-v="1"]'); await A.waitForFunction((n) => document.querySelectorAll('.inbox .nitem.unread').length === n - 1, n0);
  assert.ok(await a.count('.inbox .oldn .nitem.seen') >= 1, 'rangée dans « Déjà vues »');
  await a.click('.inbox .oldn summary').catch(() => {}); await a.click('.inbox .nitem.seen [data-act=notifSeen][data-v="0"]'); await A.waitForFunction((n) => document.querySelectorAll('.inbox .nitem.unread').length === n, n0);
  await a.click('.inbox [data-act=notifAllSeen]'); await A.waitForSelector('text=Rien de nouveau');
  assert.equal(await a.count('.topicons [data-act=notifOpen] .badge-dot'), 0, 'tout vu : plus de pastille');
  await a.click('.inbox [data-act=notifSettings]'); await A.waitForSelector('text=Son dans l’app');
  await poll(async () => (await a.api('GET', '/api/items?since=0')).data.items.some((i) => i.c === 'config' && i.id === 'inbox' && i.d.seenIds?.length), 12000, 'notifications vues liées au compte');
});
await step('recherche 🔍 dans toute l’app, et recherche limitée aux paramètres', async () => {
  await a.tab('home'); await a.click('.topicons [data-act=findOpen]'); await A.waitForSelector('#sheet input[data-input=findQ]');
  await A.fill('#sheet input[data-input=findQ]', 'minuteur'); await A.waitForSelector('#findres [data-act=findGo]');
  assert.match(await a.text('#findres'), /Minuteur/);
  await A.fill('#sheet input[data-input=findQ]', 'anglais'); await A.waitForFunction(() => /Langue/.test(document.querySelector('#findres')?.textContent || ''));
  await a.click('#findres [data-act=findGo]'); await A.waitForFunction(() => location.hash.startsWith('#/settings/display'));
  await A.waitForSelector('#main .found'); // l'élément trouvé est mis en lumière
  await a.tab('settings'); await A.fill('input[data-input=setFind]', 'vibration'); await A.waitForSelector('#setfindres [data-act=findGo]');
  assert.equal(await a.count('.setmenu.setmain.hidden'), 1, 'la liste des rubriques laisse place aux résultats');
  assert.doesNotMatch(await a.text('#setfindres'), /Minuteur|Exercice/, 'seulement des paramètres');
  await a.click('#setfindres [data-act=findGo]'); await A.waitForFunction(() => location.hash.startsWith('#/settings/session')); await A.waitForSelector('#main input[name=vibration]');
});
await step('séances prêtes : filtres, tri pour toi, sources consultables, lancer / garder ; top exercices', async () => {
  await a.tab('library'); await a.sub('libSub', 'catalog'); await A.waitForSelector('.catcard');
  await a.click('[data-act=catEq]'); // tout afficher, même sans le matériel
  await a.click('[data-act=catF][data-k=sport][data-v=running]'); assert.match(await a.text('main'), /Fractionné 4 × 4 min/);
  await A.locator('.catcard', { hasText: 'Fractionné 4 × 4 min' }).click(); await A.waitForSelector('.catd .src');
  assert.match(await a.text('.catd'), /VO2max/); await A.locator('.catd .src').first().click();
  await A.waitForSelector('text=Ce qu’elle montre'); assert.match(await a.text('#sheet'), /Helgerud|Milanović/); assert.ok(await a.count('#sheet a[href^="http"]') === 1);
  await A.keyboard.press('Escape'); await a.click('[data-act=catF][data-k=sport][data-v=running]');
  await A.locator('.catcard', { hasText: 'Renfo maison sans matériel' }).click(); await a.click('.catd [data-act=catSave]');
  await poll(async () => (await a.api('GET', '/api/sync')).data.items.some((x) => x.name === 'Renfo maison sans matériel'), 12000, 'séance gardée');
  await a.sub('libSub', 'exercises'); await a.sub('libSub', 'best'); await A.waitForSelector('.bestrow'); await a.click('[data-act=bestCat][data-v=doigts]'); await A.waitForSelector('.bestrow'); await a.sub('libSub', 'seances');
  await a.tab('settings'); await a.sub('setSub', 'help'); await A.waitForSelector('text=Sources citées');
});
await step('programme : création en 4 questions, calendrier rempli, séance du jour avec la forme', async () => {
  await a.tab('home'); await a.click('.topicons [data-act=topCal]'); await a.click('[data-act=progNew]'); await A.waitForSelector('.pwiz');
  await a.click('.pwiz [data-act=pwSet][data-k=goal][data-v=force]'); await a.click('.pwiz [data-act=pwSet][data-k=weeks][data-v="4"]');
  const today = (new Date().getDay() + 6) % 7;
  for (const d of [0, 1, 2, 3, 4, 5, 6]) { const on = await A.locator(`.pwiz [data-act=pwDay][data-v="${d}"].on`).count(); if (!on && d === today) await a.click(`.pwiz [data-act=pwDay][data-v="${d}"]`); }
  assert.match(await a.text('.pwsum'), /séances/); await a.click('.pwiz [data-act=pwSave]');
  await A.waitForSelector('.prog [data-act=progPlay]'); assert.match(await a.text('.prog'), /Semaine 1 \/ 4/);
  await a.click('.prog [data-act=progPlay]'); await A.waitForSelector('.forme'); await a.click('.forme [data-act=progGo][data-f=ok]');
  await A.waitForSelector('#player.open');
  // on fait une série puis on termine : la séance compte pour le programme
  if (await a.count('#player [data-act=pSkipWarm]')) await a.click('#player [data-act=pSkipWarm]');
  if (await a.count('#player [data-act=pGo]')) await a.click('#player [data-act=pGo]'); if (await a.count('#player [data-act=pWorkDone]')) await a.click('#player [data-act=pWorkDone]');
  await a.click('#player [data-act=pQuit]'); await a.confirm(); await A.waitForSelector('#player [data-act=pSave]'); await a.click('#player [data-act=pSave]');
  await poll(async () => (await a.api('GET', '/api/history')).data.history.some((x) => x.data?.program?.i >= 0), 12000, 'séance liée au programme sur le serveur');
  await a.tab('home'); await A.waitForSelector('.prog'); assert.match(await a.text('.prog'), /1 séance sur/);
});
await step('coach : question en un toucher, réponse affichée', async () => {
  await a.click('.topicons [data-act=allOpen]'); await A.waitForSelector('.allf'); await a.click('.allf [data-act=coachOpen]'); await A.waitForSelector('.chat [data-act=chatIdea]');
  await a.click('.chat [data-act=chatIdea]'); await A.waitForSelector('.msg.assistant:not(.typing)', { timeout: 10000 });
  assert.match(await a.text('.msg.assistant'), /Conseil du coach/); await a.click('#sheet .back'); await a.tab('profile');
});
await step('mon corps et mes objectifs : profil corporel, objectifs multiples, objectif écrit', async () => {
  await a.tab('profile'); await a.sub('profSub', 'body'); await A.waitForSelector('.bodyf');
  await A.fill('.bodyf input[data-k=age]', '34'); await A.press('.bodyf input[data-k=age]', 'Tab'); await A.waitForTimeout(200);
  await a.click('[data-act=bodySet][data-k=breath][data-v=souvent]'); await A.waitForSelector('text=vite essoufflé');
  await a.click('[data-act=weighIn]'); await A.fill('#sheet input[name=kg]', '71.5'); await a.click('#sheet button[type=submit]'); await A.waitForSelector('text=71.5 kg');
  await a.sub('profSub', 'goals'); await a.click('[data-act=goalsToggle][data-id=poids]'); await a.click('[data-act=goalsToggle][data-id=climb]');
  await A.waitForSelector('[data-act=goalsToggle][data-id=poids].on');
  await a.click('[data-act=goalWrite]'); await A.fill('#sheet textarea[name=text]', 'Courir 10 km sans m’arrêter'); await a.click('#sheet button[type=submit]');
  await A.waitForSelector('#sheet [data-act=goalAiSave]', { timeout: 15000 }); assert.match(await a.text('#sheet'), /Endurance/i);
  await a.click('#sheet [data-act=goalAiSave]'); await A.waitForSelector('text=Courir 10 km');
  await poll(async () => { const it = (await a.api('GET', '/api/items?since=0')).data.items; return it.some((i) => i.c === 'config' && i.id === 'body' && i.d.age === 34 && i.d.breath === 'souvent') && it.some((i) => i.c === 'config' && i.id === 'main' && (i.d.goals || []).includes('poids')); }, 12000, 'profil corporel et objectifs sur le serveur');
  await a.sub('profSub', 'body'); await a.click('[data-act=bodySet][data-k=breath][data-v=souvent]'); // on remet comme avant pour la suite
  await a.sub('profSub', 'goals'); await a.click('[data-act=goalsToggle][data-id=poids]');
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
  await a.tab('library'); await a.click('[data-act=newChoose]'); await a.click('#sheet [data-act=newSeance]'); await A.waitForSelector('input[data-change=sName]');
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
  let guard = 0, sawRest = false, sawTimer = false, paused = false, cuesLater = 0;
  while (guard++ < 60) {
    if (await a.count('#player [data-act=pSave]')) break;
    if (/Série [2-9] \//.test(await a.text('#player')) && await a.count('#player .cues li')) cuesLater++; // consignes aussi aux séries suivantes
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
  assert.ok(cuesLater > 0, 'consignes affichées à la 2e série');
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
  await A.waitForSelector('.card.ok-b:has-text("Séance enregistrée")');
});
await step('historique réellement enregistré sur le serveur (durée, pause, questionnaire)', async () => {
  const mine = async () => (await a.api('GET', '/api/history')).data.history.find((x) => x.sessionName === 'Tirage maison');
  await poll(async () => !!(await mine()), 12000, 'historique sur le serveur');
  const h = await mine();
  const names = h.data.exercises.map((e) => e.name);
  assert.ok(names.includes('Tractions australiennes') && names.includes('Gainage bateau (hollow body)'), 'les 2 exercices de la séance');
  assert.ok(h.data.exercises.length > 2, 'échauffement automatique ajouté devant une séance faite à la main'); assert.equal(h.data.rpe, 4); assert.equal(h.data.questionnaire.comment, 'Bonne séance, commentaire conservé');
  assert.ok(h.data.questionnaire.felt.length >= 1); assert.ok(h.data.pausedSeconds >= 1, 'pause comptée à part'); assert.ok(h.durationSeconds < 200);
  assert.ok(h.durationSeconds >= h.data.activeSeconds);
  await a.tab('progress'); await a.sub('progSub', 'history'); await A.waitForSelector('text=Tirage maison');
});
await step('générateur : simulation, priorités, génération expliquée, enregistrement', async () => {
  await a.tab('library'); await a.sub('libSub', 'generate');
  await a.click('[data-act=gSet][data-k=activityId][data-v=conditioning]');
  await a.click('[data-act=gForme][data-v=exhausted]'); await a.click('[data-act=gFeel][data-v=hard]'); await A.waitForSelector('text=Tu te sens épuisé');
  await a.click('[data-act=gForme][data-v=ok]'); await a.click('[data-act=gFeel][data-v=mod]');
  // Plusieurs choix : un objectif, une intention, un muscle, une zone à ménager
  await a.click('[data-act=gOpen][data-k=goals]'); await A.locator('[data-act=gPick][data-k=goalIds]').first().click();
  await a.click('[data-act=gOpen][data-k=intents]'); await a.click('[data-act=gPick][data-k=intentIds][data-v=gainage]');
  await a.click('[data-act=gOpen][data-k=muscles]'); await a.click('[data-act=gPick][data-k=muscles][data-v=cuisses]');
  await a.click('[data-act=gOpen][data-k=zones]'); await a.click('[data-act=gPick][data-k=zones][data-v=wrists]');
  await a.click('[data-act=gDur][data-v="20"]');
  await a.click('[data-act=genPlan]'); await A.waitForSelector('#genplan'); assert.match(await a.text('#genplan'), /sur mesure/i);
  assert.match(await a.text('#genplan'), /Simulation avant génération/i); assert.match(await a.text('#genplan'), /Matériel nécessaire/);
  await A.locator('#genplan [data-act=prio][data-d="1"]').first().click(); await A.waitForSelector('#genplan');
  await a.click('[data-act=genDo]'); await A.waitForSelector('#genresult');
  assert.match(await a.text('#genresult'), /Pourquoi cette séance/); await a.click('#genresult details.how > summary'); assert.match(await a.text('#genresult'), /Faits/);
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
  const coach = async (q) => { await a.click('.topicons [data-act=allOpen]'); await a.click('.allf [data-act=coachOpen]'); await A.waitForSelector('.chat-in input'); await A.fill('.chat-in input', q); await a.click('.chat-in button[type=submit]'); };
  await coach('Je n’ai que 12 minutes');
  await A.waitForSelector('#toast.show'); assert.match(await a.text('#toast'), /12 min/);
  await coach('quel temps fait-il ?'); // pas une consigne : c'est le coach qui répond, aucune action
  await A.waitForSelector('.msg.assistant:not(.typing)'); await A.keyboard.press('Escape');
  assert.ok(sid);
});
await step('« Que faire aujourd’hui ? » et tableau de bord personnalisé', async () => {
  assert.match(await a.text('main'), /Que faire aujourd’hui/);
  // Mode édition : explication claire, « ✕ Quitter » en haut, aperçu avant d'enregistrer
  await a.click('.topicons [data-act=layEdit]'); await A.waitForSelector('.edlist');
  assert.match(await a.text('.editbar'), /Grand[\s\S]*Icône[\s\S]*Masqué/); assert.equal(await a.count('header [data-act=layQuit], .topicons [data-act=layQuit], [data-act=layQuit]') >= 1, true);
  await a.click('[data-act=layAs][data-id=records][data-v=big]'); await a.click('[data-act=layAs][data-id=timer][data-v=icon]');
  await a.click('[data-act=layPick][data-id=gen]'); await a.click('[data-act=layColor][data-id=gen][data-v="#5fa8d3"]');
  await A.locator('[data-act=layQuit]').first().click(); await a.confirm(); await A.waitForSelector('.quick [data-act=timerOpen]'); assert.equal(await a.count('h3:has-text("Records")'), 0, 'quitté : rien n’a changé');
  await a.click('.topicons [data-act=layEdit]'); await a.click('[data-act=layAs][data-id=records][data-v=big]'); await a.click('[data-act=layAs][data-id=timer][data-v=icon]');
  await a.click('[data-act=layPick][data-id=gen]'); await a.click('[data-act=layColor][data-id=gen][data-v="#5fa8d3"]');
  await a.click('.editdock [data-act=layPreview]'); await A.waitForSelector('h3:has-text("Records")'); assert.equal(await a.count('.topicons [data-act=timerOpen]'), 1, 'aperçu : minuteur en icône');
  await a.click('.editdock [data-act=layBack]'); await A.waitForSelector('.edlist');
  await a.click('.editdock [data-act=laySave]'); await a.confirm();
  await A.waitForSelector('h3:has-text("Records")'); assert.equal(await a.count('.quick [data-act=timerOpen]'), 0);
  assert.equal(await a.count('.topicons [data-act=timerOpen]'), 1, 'minuteur passé en icône en haut');
  assert.equal(await a.count('.slot[style*="#5fa8d3"] [data-act=genOpen]'), 1, 'couleur appliquée');
  await A.reload(); await A.waitForSelector('h3:has-text("Records")');
  await poll(async () => (await a.api('GET', '/api/items?since=0')).data.items.some((i) => i.c === 'config' && i.id === 'layout' && /records/.test(i.d.lay)), 12000, 'mise en page liée au compte');
  // Retour à la base (deux validations)
  await a.tab('settings'); await a.sub('setSub', 'display'); await a.click('[data-act=layReset][data-scope=all]'); await confirm2(A);
  await a.tab('home'); await A.waitForSelector('.quick [data-act=timerOpen]'); assert.equal(await a.count('h3:has-text("Records")'), 0);
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
  await a.sub('profSub', 'understand'); await A.waitForSelector('.statgrid'); await a.click('[data-act=uOpen][data-id="Mesuré"]'); await A.waitForSelector('#u-Mesuré[open]'); assert.match(await a.text('main'), /Tractions strictes max : 8/);
});
await step('export JSON', async () => {
  await a.tab('settings'); await a.sub('setSub', 'data');
  const [dl] = await Promise.all([A.waitForEvent('download'), a.click('[data-act=export]')]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(data.app, 'mes-seances'); assert.ok(data.items.some((i) => i.c === 'perf')); assert.ok(data.history.length === 2 && data.history.some((x) => x.sessionName === 'Tirage maison'), 'séance + séance du programme');
  assert.ok(!JSON.stringify(data).includes('secret-admin-de-test'));
});
await step('calendrier : planifier une séance, prévu visible, enregistré sur le serveur', async () => {
  await a.tab('home'); await a.click('.topicons [data-act=topCal]'); await A.waitForSelector('[data-act=calDay].today');
  await a.click('[data-act=calDay].today'); await A.waitForSelector('#sheet form[data-submit=addEvent]');
  await a.click('#sheet form[data-submit=addEvent] button[type=submit]'); await A.waitForSelector('#sheet >> text=Prévu');
  await a.click('#sheet [data-act=closeSheet].btn');
  await A.waitForSelector('[data-act=calDay].today i.plan');
  await poll(async () => (await a.api('GET', '/api/calendar')).data.events.length === 1, 12000, 'événement sur le serveur');
});
await step('import CSV : correspondance proposée, vérifiée, import sans doublon', async () => {
  await a.tab('settings'); await a.sub('setSub', 'data');
  const csv = 'Date;Séance;Exercice;Séries;Reps\n2026-01-05;Import test;Squats;3;10\n2026-01-05;Import test;Pompes;2;12\n';
  await A.setInputFiles('input[data-change=csvFile]', { name: 'hist.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await A.waitForSelector('[data-act=csvImport]:not([disabled])');
  await a.click('[data-act=csvImport]'); await a.confirm();
  await poll(async () => (await a.api('GET', '/api/history')).data.history.some((h) => h.sessionName === 'Import test'), 12000, 'import CSV synchronisé');
  await A.setInputFiles('input[data-change=csvFile]', { name: 'hist.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await A.waitForSelector('[data-act=csvImport]:not([disabled])'); await a.click('[data-act=csvImport]'); await a.confirm();
  await A.waitForSelector('#toast.show:has-text("déjà présent")');
  await A.waitForTimeout(1500);
  assert.equal((await a.api('GET', '/api/history')).data.history.filter((h) => h.sessionName === 'Import test').length, 1);
});
await step('mode Lab et timeline', async () => {
  await a.tab('progress'); await a.sub('progSub', 'lab'); await a.click('[data-act=labNew]');
  await A.fill('#sheet input[name=title]', 'Gainage 2×/semaine'); await A.fill('#sheet input[name=before]', '30'); await A.fill('#sheet input[name=after]', '45');
  await A.selectOption('#sheet select[name=metricId]', 'hollow_hold');
  await a.click('#sheet form[data-submit=labSave] button[type=submit]');
  await A.waitForSelector('text=Gainage 2×/semaine'); assert.match(await a.text('main'), /causalité/);
  await a.sub('progSub', 'timeline'); await A.waitForSelector('text=Première séance');
  await a.sub('progSub', 'journal'); await A.waitForSelector('form[data-submit=jnote]');
  await a.noOverflow('progrès');
});
await step('format de séance : parties au choix, durée libre (2 h 30), séance construite partie par partie', async () => {
  await a.tab('library'); await a.sub('libSub', 'generate'); await A.waitForSelector('[data-act=gFmt][data-v=complet]');
  await a.click('[data-act=gFmt][data-v=complet]'); await A.waitForSelector('.parts .partrow');
  assert.equal(await a.count('.parts .partrow'), 5);
  await a.click('[data-act=gDurOther]'); await A.fill('.durin', '150'); await A.press('.durin', 'Tab');
  await A.waitForFunction(() => /Total : 2 h 30/.test(document.querySelector('.parts')?.textContent || ''));
  await a.click('[data-act=gPartDel][data-i="3"]'); await A.waitForFunction(() => document.querySelectorAll('.parts .partrow').length === 4);
  await a.click('[data-act=genPlan]'); await A.waitForSelector('#genplan'); assert.match(await a.text('#genplan'), /Technique/);
  await a.click('[data-act=genDo]'); await A.waitForSelector('#genresult');
  const heads = await A.$$eval('#genresult .blockhead', (x) => x.map((e) => e.textContent));
  assert.ok(heads[0].includes('Échauffement') && heads.some((t) => t.includes('Technique')) && heads.at(-1).includes('Étirements'), heads.join(' | '));
  await a.click('[data-act=gFmt][data-v=""]'); await a.click('[data-act=gDur][data-v="30"]');
});
await step('fusionner deux séances : conseil noté, ordre conseillé, nouvelle séance ; les originales ne changent pas', async () => {
  await a.tab('library'); await a.sub('libSub', 'seances'); await A.waitForSelector('[data-act=mergeOpen]');
  const before = await a.api('GET', '/api/sync'); const n0 = before.data.items.filter((s) => !s.deleted).length;
  await a.click('[data-act=mergeOpen]'); await A.waitForSelector('#sheet [data-act=mergePick]');
  const picks = A.locator('#sheet [data-act=mergePick]'); await picks.nth(0).click(); await picks.nth(1).click();
  await A.waitForSelector('#sheet [data-act=mergeGo]'); assert.match(await a.text('#sheet'), /\/100/);
  await a.click('#sheet [data-act=mergeBest]'); await A.waitForSelector('#sheet [data-act=mergeOpen][data-ids]');
  await A.locator('#sheet [data-act=mergeOpen][data-ids]').first().click(); await A.waitForSelector('#sheet [data-act=mergeGo]');
  await A.fill('#sheet input[data-change=mergeName]', 'Ma fusion'); await A.press('#sheet input[data-change=mergeName]', 'Tab');
  await a.click('#sheet [data-act=mergeGo]'); await A.waitForSelector('input[data-change=sName]');
  assert.equal(await A.inputValue('input[data-change=sName]'), 'Ma fusion');
  assert.match(await a.text('#main'), /Échauffement/);
  await poll(async () => (await a.api('GET', '/api/sync')).data.items.filter((s) => !s.deleted).length === n0 + 1, 12000, 'séance fusionnée synchronisée');
  const after = (await a.api('GET', '/api/sync')).data.items;
  for (const o of before.data.items) assert.equal(JSON.stringify(after.find((x) => x.id === o.id)?.exercises), JSON.stringify(o.exercises), 'originale intacte');
});
await step('mes séances : plusieurs sports, catégories, filtres et tris (dont « selon ma forme »)', async () => {
  await a.tab('library'); await a.sub('libSub', 'seances'); await A.waitForSelector('[data-act=sfOpen]');
  const n0 = await a.count('#main [data-act=openSeance]'); assert.ok(n0 >= 3, `${n0} séances`);
  await A.locator('#main .card:has-text("Ma fusion") [data-act=openSeance]').click(); await A.waitForSelector('[data-act=sSport]');
  await a.click('[data-act=sSport][data-id=running]'); await a.click('[data-act=sTag][data-id=mobilite]');
  await a.tab('library'); await a.sub('libSub', 'seances'); await a.click('[data-act=sfOpen]');
  await a.click('#sheet [data-act=sfTog][data-k=sports][data-v=running]'); await A.waitForSelector('#sheet [data-act=sfDone]');
  await a.click('#sheet [data-act=sfSort][data-id=form]'); await a.click('#sheet [data-act=sfForm][data-id=low]'); await a.click('#sheet [data-act=sfDone]');
  await A.waitForFunction(() => document.querySelectorAll('#main [data-act=openSeance]').length === 1);
  assert.match(await a.text('#main'), /Ma fusion[\s\S]*Mobilité/); assert.match(await a.text('#main'), /Selon ma forme du jour : Fatigué/);
  await a.click('#main [data-act=sfDrop]'); await A.waitForFunction((n) => document.querySelectorAll('#main [data-act=openSeance]').length === n, n0);
  await A.fill('.sfbar input', 'zzz-rien'); await A.waitForSelector('#main [data-act=sfClear]'); await a.click('#main [data-act=sfClear]');
  await A.waitForFunction((n) => document.querySelectorAll('#main [data-act=openSeance]').length === n, n0);
  await a.click('[data-act=sfOpen]'); await a.click('#sheet [data-act=sfSort][data-id=recent]'); await a.click('#sheet [data-act=sfGroup][data-id=cat]'); await a.click('#sheet [data-act=sfDone]');
  await A.waitForSelector('#main .blockhead'); assert.ok(await a.count('#main .blockhead') >= 2, 'groupes par catégorie');
  await a.click('[data-act=selStart]'); await A.locator('#main [data-act=selTog]').nth(0).click(); await A.locator('#main [data-act=selTog]').nth(1).click();
  assert.match(await a.text('.selbar'), /2 sélectionnée/); assert.equal(await a.count('#main [data-act=play]'), 0, 'boutons cachés pendant la sélection');
  await a.click('.selbar [data-act=selBulk][data-id=cat]'); await a.click('#sheet [data-act=selApply][data-id=endurance]'); await A.waitForSelector('#toast.show:has-text("2 séance")');
  await A.waitForSelector('#main .blockhead:has-text("Endurance")');
  await a.click('[data-act=sfOpen]'); await a.click('#sheet [data-act=sfGroup][data-id=none]'); await a.click('#sheet [data-act=sfDone]');
});
await step('chaque séance et chaque exercice : c’est quoi, à quoi ça sert, pourquoi (et mon pourquoi)', async () => {
  await a.tab('library'); await a.sub('libSub', 'seances'); await A.locator('#main .card:has-text("Ma fusion") [data-act=openSeance]').click();
  await A.waitForSelector('#main .brief'); const b0 = await a.text('#main .brief');
  assert.match(b0, /C’est quoi \?[\s\S]*exercice[\s\S]*À quoi ça sert \?/);
  await a.click('[data-act=sWhy]'); await A.fill('#sheet textarea[name=why]', 'Pour mon projet'); await a.click('#sheet form[data-submit=sWhyGo] button');
  await A.waitForSelector('#main .brief:has-text("Mon pourquoi")'); assert.match(await a.text('#main .brief'), /Pour mon projet/);
  await A.locator('#main .item.ex button.linkish[data-act=exInfo]').nth(1).click(); await A.waitForSelector('#sheet .brief');
  assert.match(await a.text('#sheet .brief'), /C’est quoi \?[\s\S]*À quoi ça sert \?[\s\S]*Pourquoi ici \?/);
  await A.keyboard.press('Escape');
  await a.sub('libSub', 'catalog'); await A.locator('[data-act=catOpen]').first().click(); await A.waitForSelector('#sheet .brief');
  assert.match(await a.text('#sheet .brief'), /Pourquoi \?/); await A.locator('#sheet [data-act=catExInfo]').first().click();
  await A.waitForSelector('#sheet .brief:has-text("Pourquoi ici")'); await A.keyboard.press('Escape');
});
await step('escalade structurée : objectif « réussir le plus dur » et parties au choix (structures, adaptation)', async () => {
  await a.tab('library'); await a.sub('libSub', 'climbplan'); await A.waitForSelector('[data-act=cpMode][data-id=goal]');
  await a.click('[data-act=cpMode][data-id=goal]'); await A.waitForSelector('[data-act=cpGoalGo]');
  await a.click('[data-act=cpStyle][data-id=st-devers]'); await a.click('[data-act=cpMin][data-id="90"]'); await a.click('[data-act=cpGoalGo]');
  await A.waitForSelector('#cpresult'); const r = await a.text('#cpresult');
  assert.match(r, /Échauffement en grimpant[\s\S]*Montée[\s\S]*Objectif/); assert.match(r, /dévers/);
  await a.click('[data-act=cpMode][data-id=parts]'); await a.click('[data-act=cpExample]'); await A.waitForSelector('.cpart');
  assert.equal(await a.count('.cpart'), 5); assert.match(await a.text('#main'), /Voie max[\s\S]*adapté à avant/);
  await A.locator('[data-act=cpEdit]').nth(1).click(); await A.waitForSelector('#sheet [data-act=cpPart][data-k=structure]');
  assert.ok(await a.count('#sheet [data-act=cpPart][data-k=structure]') >= 4, 'plusieurs structures proposées');
  await a.click('#sheet [data-act=cpPart][data-k=structure][data-v=limit]'); await a.click('#sheet [data-act=cpPartStyle][data-id=st-reglettes]');
  await A.keyboard.press('Escape'); await a.click('[data-act=cpPartsGo]'); await A.waitForSelector('#cpresult');
  assert.match(await a.text('#cpresult'), /Essais sur blocs/);
  await a.click('[data-act=cpSave]'); await A.waitForSelector('input[data-change=sName]');
  assert.match(await a.text('#main .brief'), /Bloc|voie/i);
  await a.tab('library'); await a.sub('libSub', 'climbplan'); await a.click('[data-act=cpMode][data-id=goal]');
  await A.selectOption('select[data-change=cpWarm]', '0'); await A.selectOption('select[data-change=cpStretch]', '15'); await a.click('[data-act=cpGoalGo]');
  await A.waitForSelector('#cpresult'); const g2 = await a.text('#cpresult'); assert.ok(!/Montée en température/.test(g2), 'sans échauffement général'); assert.match(g2, /Étirements/);
  await a.click('[data-act=cpMode][data-id=surprise]'); await a.click('[data-act=spSet][data-k=sport][data-v=bloc]'); await a.click('[data-act=spSet][data-k=aim][data-v=new]');
  await a.click('[data-act=spGo]'); await A.waitForSelector('#cpresult:has-text("Pourquoi cette surprise")'); assert.match(await a.text('#cpresult'), /jamais|peu/);
  await a.click('[data-act=spGo][data-again]'); await A.waitForSelector('#cpresult');
  await a.click('[data-act=cpMode][data-id=parts]');
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
  await B.goto(BASE); await B.waitForSelector('[data-act=authPick][data-id=register]'); await b.click('[data-act=authPick][data-id=register]');
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
await step('partage par lien et QR code : B ouvre le lien et garde sa propre copie', async () => {
  cur = A; await a.tab('library'); await a.sub('libSub', 'seances'); await A.locator('.card:has-text("Tirage maison") [data-act=openSeance]').first().click();
  await a.click('[data-act=sPublish]'); await a.click('#sheet [data-act=sPublishDo][data-scope=link]'); await A.waitForSelector('#sheet .qrbox svg');
  const link = await A.inputValue('#shLink'); assert.match(link, /\/#\/s\/[\w-]+$/);
  await A.keyboard.press('Escape');
  assert.ok(!(await b.api('GET', '/api/shared?scope=common')).data.items.some((x) => link.endsWith(x.id)), 'lien absent de la bibliothèque commune');
  cur = B; await B.goto(link); await B.waitForSelector('[data-act=linkSave]'); assert.match(await b.text('main'), /Séance partagée par Alice/);
  await b.click('[data-act=linkSave]'); await B.waitForSelector('input[data-change=sName]');
  assert.equal(await B.inputValue('input[data-change=sName]'), 'Tirage maison');
});
await step('séance à deux : code affiché, B rejoint, les chronos avancent ensemble', async () => {
  cur = A; await a.tab('library'); await a.sub('libSub', 'seances'); await A.locator('.card:has-text("Tirage maison") [data-act=play]').first().click(); await A.waitForSelector('#player.open');
  await a.click('#player [data-act=duoOpen]'); await A.waitForSelector('#sheet .duocode'); const code = (await a.text('#sheet .duocode')).trim(); assert.match(code, /^[A-Z2-9]{6}$/);
  await A.keyboard.press('Escape');
  cur = B; await b.tab('library'); await b.sub('libSub', 'seances'); await b.click('[data-act=newChoose]'); await b.click('#sheet [data-act=duoJoinAsk]'); await B.fill('#sheet input[name=code]', code.toLowerCase()); await b.click('#sheet button.pri');
  await B.waitForSelector('#player.open .duobar:has-text("Avec Alice")');
  await A.waitForSelector('#player .duobar:has-text("Avec Bob")', { timeout: 8000 });
  const where = (P) => P.evaluate(() => `${document.querySelector('#player .pl .muted.small')?.textContent.split('·')[0].trim()}|${document.querySelector('#ptimer.rest') ? 'repos' : 'série'}`);
  const before = await where(A);
  await a.click('#player [data-act=pGo]'); if (await a.count('#player [data-act=pWorkDone]')) await a.click('#player [data-act=pWorkDone]');
  const after = await where(A); assert.notEqual(after, before, 'A a avancé');
  await poll(async () => (await where(B)) === after, 10000, 'B suit A');
  await a.click('#player [data-act=pQuit]'); await a.confirm(); await A.waitForSelector('[data-act=pDiscard]'); await a.click('[data-act=pDiscard]'); await a.confirm();
  await B.waitForSelector('#toast.show:has-text("terminée")', { timeout: 10000 });
  await b.click('#player [data-act=pQuit]'); await b.confirm(); await B.waitForSelector('[data-act=pDiscard]'); await b.click('[data-act=pDiscard]'); await b.confirm();
  await B.waitForSelector('#player:not(.open)', { state: 'attached' });
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
  await C.goto(BASE); await C.waitForSelector('[data-act=authPick][data-id=register]'); await c.click('[data-act=authPick][data-id=register]');
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
await step('l’admin voit la liste de tous les comptes (sans leurs données privées)', async () => {
  await c.tab('settings'); await c.sub('setSub', 'admin'); await C.waitForSelector('.ulist .urow');
  const txt = await c.text('.ulist'); for (const name of ['Alice', 'Bob']) assert.match(txt, new RegExp(name));
  assert.ok(await c.count('.ulist .urow') >= 3);
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
await step('admin : modifier un exercice « pour tout le monde » (au choix), un autre compte le voit ; annuler', async () => {
  cur = C; await c.tab('library'); await c.sub('libSub', 'exercises'); await C.locator('#main [data-act=libInfo]').first().click(); await C.waitForSelector('#sheet [data-act=gxEdit]');
  await c.click('#sheet [data-act=gxEdit]'); const old = await C.inputValue('#sheet input[name=name]');
  await C.fill('#sheet input[name=name]', old + ' (club)'); await c.click('#sheet form[data-submit=exEditGo] button.pri');
  await C.waitForSelector('#sheet [data-act=scopePick][data-id=all]'); assert.match(await c.text('#sheet'), /Pour moi seulement[\s\S]*Pour tout le monde/);
  await c.click('#sheet [data-act=scopePick][data-id=all]'); await C.waitForSelector('#toast.show:has-text("tout le monde")');
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('library'); await b.sub('libSub', 'exercises');
  await B.waitForSelector(`#main :text("${old} (club)")`, { timeout: 10000 });
  await B.locator('#main [data-act=libInfo]').first().click(); await B.waitForSelector('#sheet [data-act=gxEdit]');
  assert.equal(await b.count('#sheet [data-act=exHide]'), 0, 'un compte normal ne voit pas « Masquer pour tout le monde »');
  await B.keyboard.press('Escape');
  cur = C; await c.tab('settings'); await c.sub('setSub', 'admin'); await C.waitForSelector('[data-act=glReset]');
  await c.click('[data-act=glReset]'); await c.confirm(); await C.waitForSelector('text=Rien n’a encore été changé');
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('library'); await b.sub('libSub', 'exercises');
  await B.waitForSelector(`#main :text-is("${old}")`, { timeout: 10000 });
});
await step('idée d’un utilisateur (système de cotation) → notification de l’admin → ouverte au bon endroit → ajoutée pour tout le monde', async () => {
  cur = B; await b.tab('profile'); await B.evaluate(() => { location.hash = '#/profile/climbing'; }); await B.waitForTimeout(300);
  await B.evaluate(() => { const d = document.querySelector('#main details.card.how'); if (d && !d.open) d.querySelector('summary').click(); });
  await B.waitForSelector('[data-act=sysNew]'); await b.click('[data-act=sysNew]'); await b.click('#sheet [data-act=sysFromTpl][data-id=u8]'); await B.keyboard.press('Escape');
  await B.evaluate(() => { const d = document.querySelector('#main details.card.how'); if (d && !d.open) d.querySelector('summary').click(); });
  await b.click('[data-act=propose][data-k=grading]'); await B.fill('#sheet textarea[name=detail]', 'Ma salle'); await b.click('#sheet form[data-submit=proposeGo] button.pri');
  await B.waitForSelector('#toast.show:has-text("proposition")');
  cur = C; await c.tab('home'); await c.click('.topicons [data-act=notifOpen]'); await C.waitForSelector('#sheet [data-act=propOpen]', { timeout: 10000 });
  assert.match(await c.text('#sheet'), /Bob propose/);
  await c.click('#sheet [data-act=propOpen]'); await C.waitForFunction(() => location.hash.startsWith('#/profile/climbing'));
  await C.waitForSelector('#sheet button[value=accept]'); await c.click('#sheet button[value=accept]'); await C.waitForSelector('#toast.show:has-text("tout le monde")');
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('profile'); await B.evaluate(() => { location.hash = '#/profile/climbing'; }); await B.waitForTimeout(300);
  await B.evaluate(() => { const d = document.querySelector('#main details.card.how'); if (d && !d.open) d.querySelector('summary').click(); });
  await B.waitForSelector('#main .tag:has-text("pour tous")', { timeout: 10000 });
  await b.click('[data-act=ascNew]').catch(() => {});
  cur = C; await c.tab('settings'); await c.sub('setSub', 'admin'); await C.waitForSelector('[data-act=glReset][data-k=grading]'); await c.click('[data-act=glReset][data-k=grading]'); await c.confirm();
  await c.tab('settings'); await c.sub('setSub', 'updates'); await C.waitForSelector('.upd [data-act=notifTour]'); assert.ok(await c.count('.upd') >= 10, 'toutes les mises à jour listées');
  await B.keyboard.press('Escape');
});
await step('demande de modification d’un non-administrateur → l’admin l’applique → tout le monde la voit', async () => {
  cur = B; await b.tab('library'); await b.sub('libSub', 'exercises'); await B.locator('#main [data-act=libInfo]').first().click(); await B.waitForSelector('#sheet [data-act=gxEdit]');
  await b.click('#sheet [data-act=gxEdit]'); const old = await B.inputValue('#sheet input[name=name]');
  await B.fill('#sheet input[name=name]', old + ' (demande)'); await b.click('#sheet form[data-submit=exEditGo] button.pri');
  await B.waitForSelector('#sheet [data-act=scopePick][data-id=propose]'); await b.click('#sheet [data-act=scopePick][data-id=propose]');
  await B.waitForSelector('#toast.show');
  let reqId;
  await poll(async () => { const p = (await c.api('GET', '/api/admin/proposals')).data.proposals.find((x) => x.payload?.target && x.payload?.data?.name === old + ' (demande)'); reqId = p?.id; return p && p.label === `Modifier « ${old} »`; }, 10000, 'demande reçue par les admins, avec le nom d’origine');
  cur = C; await C.reload(); await C.waitForSelector('nav.tabs'); await c.click('.topicons [data-act=notifOpen]');
  await C.waitForSelector(`#sheet [data-act=propOpen][data-id="${reqId}"]`, { timeout: 10000 }); await c.click(`#sheet [data-act=propOpen][data-id="${reqId}"]`);
  await C.waitForSelector('#sheet button[value=accept]'); assert.match(await c.text('#sheet'), /Appliquer pour tout le monde/);
  await c.click('#sheet button[value=accept]'); await C.waitForSelector('#toast.show:has-text("tout le monde")');
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('library'); await b.sub('libSub', 'exercises');
  await B.waitForSelector(`#main :text("${old} (demande)")`, { timeout: 10000 });
  cur = C; await c.tab('settings'); await c.sub('setSub', 'admin'); await C.waitForSelector('[data-act=glReset]'); await c.click('[data-act=glReset]'); await c.confirm();
  await C.waitForSelector('text=Rien n’a encore été changé');
});
await step('idée avec l’endroit : B vise un élément, l’admin y est emmené et le modifie pour tout le monde', async () => {
  cur = B; await b.tab('home'); await B.evaluate(() => { location.hash = '#/settings/main'; }); await B.waitForSelector('[data-act=ideaNew]');
  await b.click('[data-act=ideaNew]'); await B.fill('#sheet textarea[name=detail]', 'Ce titre pourrait être plus clair');
  await b.click('#sheet [data-act=ideaPick]'); await B.waitForSelector('#pickbar');
  await b.click('#pickbar [data-act=pickNav]'); await b.tab('library'); await B.waitForSelector('#main h1');
  await b.click('#pickbar [data-act=pickAim]'); await B.locator('#main h1').first().click(); await B.waitForSelector('#pickbar [data-act=pickOk]');
  await b.click('#pickbar [data-act=pickOk]'); await B.waitForSelector('#sheet :text("Endroit joint")');
  assert.match(await b.text('#sheet'), /Bibliothèque/); await b.click('#sheet form[data-submit=ideaGo] button.pri'); await B.waitForSelector('#toast.show:has-text("Merci")');
  let id; await poll(async () => { const p = (await c.api('GET', '/api/admin/proposals')).data.proposals.find((x) => x.payload?.sel && /plus clair/.test(x.detail || '')); id = p?.id; return !!p; }, 10000, 'idée reçue avec son endroit');
  cur = C; await C.reload(); await C.waitForSelector('nav.tabs'); await c.click('.topicons [data-act=notifOpen]');
  await C.waitForSelector(`#sheet [data-act=propOpen][data-id="${id}"]`, { timeout: 10000 }); await c.click(`#sheet [data-act=propOpen][data-id="${id}"]`);
  await C.waitForFunction(() => location.hash.startsWith('#/library')); await C.waitForSelector('#sheet [data-act=propEditPlace]');
  await c.click('#sheet [data-act=propSee]'); await C.waitForSelector('#propbar'); await c.click('#propbar [data-act=propEditPlace]');
  await C.waitForSelector('#sheet form[data-submit=textSave]'); await C.fill('#sheet textarea[name=to]', 'Ma bibliothèque');
  await c.click('#sheet form[data-submit=textSave] button.pri'); await C.waitForSelector('#toast.show:has-text("tout le monde")');
  await c.click('.topicons [data-act=notifOpen]'); await c.click(`#sheet [data-act=propOpen][data-id="${id}"]`); await C.waitForSelector('#sheet button[value=accept]'); await c.click('#sheet button[value=accept]');
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('library'); await B.waitForSelector('#main h1:has-text("Ma bibliothèque")', { timeout: 10000 });
  cur = C; await c.tab('settings'); await c.sub('setSub', 'admin'); await C.waitForSelector('[data-act=glReset]'); await c.click('[data-act=glReset]'); await c.confirm();
});
await step('admin sans code : réécrire un texte et envoyer une annonce ; l’autre compte les voit ; tout s’annule', async () => {
  cur = C; await c.tab('settings'); await c.sub('setSub', 'admin'); await c.click('[data-act=textModeOn]'); await C.waitForSelector('#textbar');
  await C.locator('.quick .qa.pri b').first().click(); await C.waitForSelector('#sheet textarea[name=to]');
  await C.fill('#sheet textarea[name=to]', 'Ma séance du jour'); await c.click('#sheet form[data-submit=textSave] button.pri'); await C.waitForSelector('#toast.show:has-text("tout le monde")');
  await c.click('#textbar [data-act=textModeOff]');
  await c.tab('settings'); await c.sub('setSub', 'admin'); await c.click('[data-act=announceNew]');
  await C.fill('#sheet input[name=title]', 'Salle Bloc Club ajoutée'); await c.click('#sheet form[data-submit=announceGo] button.pri'); await c.confirm(); await C.waitForSelector('#toast.show:has-text("Annonce")');
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('home');
  await B.waitForSelector('#main :text("Ma séance du jour")', { timeout: 10000 });
  await b.click('.topicons [data-act=notifOpen]'); await B.waitForSelector('#sheet :text("Salle Bloc Club ajoutée")', { timeout: 10000 }); await B.keyboard.press('Escape');
  cur = C; await c.tab('settings'); await c.sub('setSub', 'admin');
  for (let k = 0; k < 2; k++) { await C.locator('[data-act=glReset]').first().click(); await c.confirm(); await C.waitForTimeout(400); }
  cur = B; await B.reload(); await B.waitForSelector('nav.tabs'); await b.tab('home'); await B.waitForSelector('#main :text-is("Séance du jour")', { timeout: 10000 });
});
await step('Service Worker actif, puis passage hors ligne : l’application s’ouvre avec les données', async () => {
  await A.evaluate(() => navigator.serviceWorker.ready); await A.reload(); await A.waitForSelector('nav.tabs'); await A.waitForTimeout(600);
  await ctxA.setOffline(true); await A.reload(); await A.waitForSelector('nav.tabs', { timeout: 10000 });
  await a.tab('library'); await a.sub('libSub', 'seances'); assert.ok(await a.count('text=Tirage maison') > 0);
});
await step('modifications hors ligne (séance, performance, note), fermeture puis réouverture', async () => {
  await a.click('[data-act=newChoose]'); await a.click('#sheet [data-act=newSeance]'); await A.waitForSelector('input[data-change=sName]'); await A.fill('input[data-change=sName]', 'Créée hors ligne'); await A.press('input[data-change=sName]', 'Tab');
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
  assert.equal((await a2.api('GET', '/api/history')).data.history.length, 3, 'pas de doublon d’historique (séance jouée + séance du programme + import CSV)');
});
await step('déconnexion puis reconnexion : données intactes', async () => {
  const a2 = H(A2);
  await a2.tab('settings'); await a2.click('[data-act=logout]'); await a2.confirm(); await A2.waitForSelector('form[data-submit=login]');
  await A2.fill('input[name=password]', 'motdepasse1'); await a2.click('button[type=submit]'); await A2.waitForSelector('nav.tabs');
  await a2.tab('library'); await a2.sub('libSub', 'seances'); await A2.waitForSelector('text=Créée hors ligne'); await A2.waitForSelector('text=Tirage maison');
});
/* ═════════ Autre appareil ═════════ */
console.log('Autre appareil');
await step('tout suit le compte sur un autre appareil : données, réglages et apparence', async () => {
  const a2 = H(A2);
  await a2.tab('settings'); await a2.sub('setSub', 'display');
  await A2.click('[data-act=appear][data-k=mode][data-v=light]'); await A2.click('[data-act=appearColor][data-id=granit]'); await A2.click('[data-act=appear][data-k=size][data-v=l]');
  await a2.sub('setSub', 'main'); await a2.sub('setSub', 'session');
  await A2.fill('input[name=defaultRest]', '75'); await A2.dispatchEvent('input[name=defaultRest]', 'change');
  await poll(async () => (await a2.api('GET', '/api/items?since=0')).data.items.some((i) => i.c === 'config' && i.id === 'appearance' && i.d.palette === 'granit'), 15000, 'apparence enregistrée dans le compte');
  await poll(async () => (await a2.api('GET', '/api/settings')).data.settings.defaultRest === 75, 15000, 'réglages enregistrés dans le compte');
  const ctxD = await newCtx(); const D = await ctxD.newPage(); watch(D, 'D'); cur = D; const d = H(D); // un autre navigateur, vierge
  await D.goto(BASE); await D.waitForSelector('[data-act=authPick][data-id=login]'); await d.click('[data-act=authPick][data-id=login]');
  await D.fill('input[name=username]', 'Alice'); await D.fill('input[name=password]', 'motdepasse1'); await d.click('button[type=submit]');
  await D.waitForSelector('nav.tabs');
  await poll(async () => (await D.evaluate(() => [document.documentElement.dataset.mode, document.documentElement.dataset.palette, document.documentElement.dataset.size].join())) === 'light,granit,l', 15000, 'apparence appliquée sur le nouvel appareil');
  await d.tab('settings'); await d.sub('setSub', 'session'); assert.equal(await D.inputValue('input[name=defaultRest]'), '75');
  await d.tab('library'); await d.sub('libSub', 'seances'); await D.waitForSelector('text=Tirage maison');
  await ctxD.close(); cur = A2;
});
/* ═════════ Invité ═════════ */
console.log('Invité');
const ctxG = await newCtx(); const G = await ctxG.newPage(); watch(G, 'G'); cur = G; const g = H(G);
await step('mode invité : questionnaire en QCM, « finir plus tard », aucune donnée envoyée au serveur', async () => {
  await G.goto(BASE); await G.waitForSelector('[data-act=guestStart]'); await g.click('[data-act=guestStart]');
  await G.waitForSelector('.setup'); await g.click('[data-act=setPick][data-q=acts][data-v=running]'); await g.click('[data-act=setupNext]:not([disabled])');
  await g.click('[data-act=setPick][data-q=level][data-v=nsp]'); await G.waitForSelector('text=séances par semaine');
  await g.click('[data-act=setupLater]'); await G.waitForSelector('.quick');
  await G.waitForSelector('#tour .tour-bubble'); await g.click('#tour .tour-x'); await G.waitForSelector('#tour', { state: 'detached' });
  assert.equal(await g.count('.syncbadge.guest'), 1);
  assert.match(await g.text('main'), /profil n’est pas encore complet/);
  await g.tab('library'); await g.sub('libSub', 'common'); await G.waitForSelector('text=Compte nécessaire');
});
await step('invité : création et enregistrement d’une séance, conservées au rechargement', async () => {
  await g.tab('library'); await g.sub('libSub', 'seances'); await g.click('[data-act=newChoose]'); await g.click('#sheet [data-act=newSeance]');
  await G.waitForSelector('input[data-change=sName]');
  await G.fill('input[data-change=sName]', 'Séance invitée'); await G.press('input[data-change=sName]', 'Tab'); await G.waitForTimeout(400);
  await G.reload(); await G.waitForSelector('nav.tabs'); await g.tab('library'); await g.sub('libSub', 'seances');
  await G.waitForSelector('text=Séance invitée');
});
await step('petite question sur l’accueil : réponse en un toucher, enregistrée, question suivante (sans fenêtre)', async () => {
  await G.evaluate(() => localStorage.setItem('sea:q-snooze', '{}')); await G.evaluate(() => { location.hash = '#/home/dash'; }); await G.reload(); await G.waitForSelector('nav.tabs');
  await G.waitForSelector('.qcard .qask', { timeout: 8000 });
  await G.waitForTimeout(1800); assert.equal(await g.count('#sheet.open .qask'), 0, 'plus de fenêtre qui s’ouvre toute seule');
  const first = await g.text('.qcard h3');
  await g.click('.qcard [data-act=qAnswer]');
  await G.waitForFunction((t) => document.querySelector('.qcard h3')?.textContent !== t, first); assert.notEqual(await g.text('.qcard h3'), first, 'question suivante proposée');
  await g.click('.qcard [data-act=qLater]'); await G.waitForTimeout(200);
});
await step('invité → compte : les données locales sont transférées sur le nouveau compte', async () => {
  await g.tab('settings'); await g.click('[data-act=guestUpgrade]'); await G.waitForSelector('form[data-submit=register]');
  await G.fill('input[name=username]', 'Gaston'); await G.fill('input[name=password]', 'motdepasse9'); await g.click('button[type=submit]');
  await G.waitForSelector('nav.tabs'); assert.equal(await g.count('.syncbadge.guest'), 0);
  await poll(async () => (await g.api('GET', '/api/sync')).data.items.some((x) => x.name === 'Séance invitée'), 15000, 'séance invitée transférée');
  await poll(async () => (await g.api('GET', '/api/items?since=0')).data.items.some((x) => x.c === 'activity' && x.d.preset === 'running'), 15000, 'profil invité transféré');
});
await step('mise à jour : un nouveau déploiement est proposé (« Mettre à jour ») puis installé', async () => {
  await G.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  await G.evaluate(() => window.__seaCheckUpdate());
  env.CF_VERSION_METADATA = { id: 'deploy-e2e-2' }; // simulation d'une modification poussée sur GitHub
  await G.evaluate(() => window.__seaCheckUpdate());
  await G.waitForSelector('#updbar [data-act=updNow]', { timeout: 20000 });
  await Promise.all([G.waitForNavigation({ timeout: 20000 }), g.click('#updbar [data-act=updNow]')]);
  await G.waitForSelector('nav.tabs');
  // La page peut se recharger une seconde fois (activation de la nouvelle version) : une lecture interrompue compte comme « pas encore ».
  await poll(async () => (await G.evaluate(async () => (await caches.keys()).join(',')).catch(() => '')).includes('deploy-e2e-2'), 15000, 'nouveau cache installé');
  await G.waitForSelector('#updbar.fresh [data-act=updWhat]', { timeout: 20000 }); // « L'app a été mise à jour »
  await g.click('#updbar [data-act=updWhat]'); await G.waitForSelector('#sheet.open .newslist li');
  assert.match(await g.text('#sheet .newslist'), /Visite guidée plus immersive[\s\S]*flèches/);
  assert.equal(await g.count('#updbar'), 0, 'bandeau disparu une fois les nouveautés vues');
  await g.click('.news [data-act=closeSheet]'); await G.reload(); await G.waitForSelector('nav.tabs'); await G.waitForTimeout(800);
  assert.equal(await g.count('#updbar'), 0, 'pas de bandeau tant qu’il n’y a rien de nouveau');
});
await step('après une mise à jour : visite des nouveautés, seulement ce qui a changé', async () => {
  await G.evaluate(() => localStorage.setItem('sea:news-toured', JSON.stringify('8.3.0'))); await G.reload(); await G.waitForSelector('nav.tabs');
  await G.waitForSelector('#updbar [data-act=newsTour]', { timeout: 10000 }); await g.click('#updbar [data-act=newsTour]');
  await G.waitForSelector('#tour .tour-bubble'); assert.match(await g.text('#tour .tour-bubble'), /Consignes à chaque série/);
  assert.match(await g.text('#tour .tour-step'), new RegExp('^1 / ' + (await G.evaluate(async () => { const m = await import('/news.js'); const num = (v) => v.split('.').reduce((t, x) => t * 1000 + Number(x), 0); return m.NEWS.filter((n) => num(n.v) > num('8.3.0')).reduce((t, n) => t + n.steps.length, 0); })) + '$'), 'seulement les nouveautés des versions pas encore vues');
  await g.click('#tour [data-act=tourNext]'); await g.click('#tour [data-act=tourNext]');
  await G.waitForFunction(() => location.hash.startsWith('#/settings/help'), null, { timeout: 5000 });
  await G.waitForSelector('#tour .tour-arrow.up, #tour .tour-arrow.down');
  await g.click('#tour [data-act=tourEnd]'); await G.waitForSelector('#tour', { state: 'detached' });
  assert.equal(await G.evaluate(() => JSON.parse(localStorage.getItem('sea:news-toured'))), await G.evaluate(() => window.__seaVersion));
  await G.reload(); await G.waitForSelector('nav.tabs'); await G.waitForTimeout(800);
  assert.equal(await g.count('#updbar'), 0, 'plus proposée une fois faite');
});
await step('minuteur d’intervalles : préréglage, préparation puis effort, pause, arrêt', async () => {
  await g.tab('home'); await g.click('[data-act=timerOpen]'); await G.waitForSelector('#tform');
  await g.click('[data-act=timerPreset][data-id=tabata]'); assert.equal(await G.inputValue('#tform input[name=work]'), '20');
  await g.click('#tform button[type=submit]'); await G.waitForSelector('#itimer.ph-prep');
  await G.waitForSelector('#itimer.ph-work', { timeout: 8000 }); assert.match(await g.text('#itimer'), /Série 1 \/ 1 · 1 \/ 8/);
  await g.click('#itimer [data-act=timerPause]'); await G.waitForSelector('#itimer.paused');
  await g.click('#itimer [data-act=timerStop]'); await G.waitForSelector('#itimer', { state: 'detached' });
});
await step('séance : grand affichage (toucher l’écran valide), coach vocal activable', async () => {
  await g.click('[data-act=genOpen]'); await G.waitForSelector('[data-act=genPlan]'); await g.click('[data-act=genPlan]');
  await G.waitForSelector('#genresult [data-act=play]', { timeout: 8000 }).catch(() => {});
  if (await g.count('[data-act=genDo]')) await g.click('[data-act=genDo]');
  await g.click('#genresult [data-act=play]'); await G.waitForSelector('#player.open');
  await g.click('#player [data-act=pVoice]'); await G.waitForSelector('#player [data-act=pVoice][aria-pressed=true]');
  await g.click('#player [data-act=pBig]'); await G.waitForSelector('#player .pl.big');
  assert.equal(await G.locator('#player .figbox svg').count(), 1, 'figure animée');
  const before = await g.text('#player');
  await G.mouse.click(200, 560); await G.waitForTimeout(300);
  assert.notEqual(await g.text('#player'), before, 'le toucher a lancé l’action principale');
  await g.click('#player [data-act=pBig]'); await g.click('#player [data-act=pVoice]');
  await g.click('#player [data-act=pQuit]'); await g.confirm(); await G.waitForSelector('#player.open [data-act=pDiscard], #player:not(.open)', { state: 'attached' });
  if (await g.count('#player [data-act=pDiscard]')) { await g.click('#player [data-act=pDiscard]'); await g.confirm(); }
});
/* ═════════ Déménagement vers la nouvelle adresse ═════════ */
console.log('Nouvelle adresse');
const OLDO = 'https://seances-entrainement.martin-zannet22.workers.dev', NEWO = 'https://seances-sport.pages.dev';
/** Navigateur où les deux adresses publiques sont servies par le vrai worker.js (sans réseau). */
async function twoSites() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await c.addInitScript(() => { try { if (!localStorage.getItem('sea:q-snooze')) localStorage.setItem('sea:q-snooze', JSON.stringify(Object.fromEntries(['acts', 'climbPerWeek', 'place', 'minutes', 'perWeek', 'bloc', 'goal', 'level', 'avoid', 'equipment'].map((k) => [k, Date.now() + 864e5]))));} catch { /* about:blank */ } });
  await c.route(/^https:\/\/(seances-entrainement\.martin-zannet22\.workers\.dev|seances-sport\.pages\.dev)\//, async (route) => {
    const q = route.request(), headers = await q.allHeaders();
    const body = ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postDataBuffer();
    const r = await worker.fetch(new Request(q.url(), { method: q.method(), headers, body }), env);
    const out = {}; for (const [k, v] of r.headers) if (k !== 'set-cookie') out[k] = v;
    const sc = r.headers.getSetCookie?.() || []; if (sc.length) out['set-cookie'] = sc.join('\n');
    await route.fulfill({ status: r.status, headers: out, body: Buffer.from(await r.arrayBuffer()) });
  });
  const P = await c.newPage(); watch(P, 'M'); cur = P; return { c, P };
}
await step('ancienne adresse → nouvelle : compte, réglages et séances retrouvés après confirmation', async () => {
  const { c, P } = await twoSites(); const m = H(P);
  await P.goto(NEWO + '/'); await P.waitForSelector('[data-act=authPick]'); // la nouvelle adresse ne redirige pas
  const reg = await P.evaluate(async () => (await fetch('/api/move')).json()); assert.equal(reg.to, null);
  await P.evaluate(async () => { localStorage.clear(); });
  // Compte créé sur l'ancienne adresse, avec une apparence et une séance
  env.MOVE_TO = ''; // déménagement pas encore actif
  await P.goto(OLDO + '/'); await P.waitForSelector('[data-act=authPick][data-id=register]'); await m.click('[data-act=authPick][data-id=register]');
  await P.fill('input[name=username]', 'Voyageur'); await P.fill('input[name=password]', 'motdepasse9'); await m.click('button[type=submit]');
  await P.waitForSelector('nav.tabs'); if (await m.count('[data-act=setupLater]')) await m.click('[data-act=setupLater]');
  if (await P.$('#tour')) await m.click('#tour .tour-x');
  await m.tab('settings'); await m.sub('setSub', 'display'); await m.click('[data-act=appearColor][data-id=foret]'); await P.waitForTimeout(300);
  await m.tab('library'); await m.sub('libSub', 'seances'); await m.click('[data-act=newChoose]'); await m.click('#sheet [data-act=newSeance]'); await P.waitForSelector('input[data-change=sName]');
  await P.fill('input[data-change=sName]', 'Séance déménagée'); await P.press('input[data-change=sName]', 'Tab'); await P.waitForTimeout(600);
  delete env.MOVE_TO; // déménagement actif (adresse par défaut)
  await P.goto('about:blank'); await P.goto(OLDO + '/#/library/seances');
  await P.waitForURL((u) => u.origin === NEWO, { timeout: 15000 });
  assert.equal(new URL(P.url()).hash, '#/library/seances', 'même page qu’avant');
  await P.waitForSelector('#mv-ok'); assert.match(await m.text('#mv-ok'), /Voyageur/);
  assert.equal(new URL(P.url()).search, '', 'le code disparaît de l’adresse');
  await m.click('#mv-ok'); await P.waitForSelector('nav.tabs');
  await P.waitForSelector('text=Séance déménagée', { timeout: 15000 });
  assert.equal(await P.evaluate(() => document.documentElement.dataset.palette), 'foret', 'réglages de l’appareil repris');
  assert.equal((await P.evaluate(async () => (await fetch('/api/auth/me')).json())).user.username, 'Voyageur', 'connecté sur la nouvelle adresse');
  // Revenir sur l'ancienne adresse renvoie encore vers la nouvelle, sans redemander (déjà connecté ici)
  await P.goto('about:blank'); await P.goto(OLDO + '/'); await P.waitForURL((u) => u.origin === NEWO, { timeout: 15000 }); await P.waitForSelector('nav.tabs');
  assert.equal(await m.count('#mv-ok'), 0);
  await c.close();
});
await step('ancienne adresse → nouvelle en mode invité : séances de l’appareil retrouvées', async () => {
  const { c, P } = await twoSites(); const m = H(P);
  env.MOVE_TO = '';
  await P.goto(OLDO + '/'); await P.waitForSelector('[data-act=guestStart]'); await m.click('[data-act=guestStart]');
  await P.waitForSelector('.setup'); await m.click('[data-act=setupLater]'); await P.waitForSelector('#tour .tour-x'); await m.click('#tour .tour-x');
  await m.tab('library'); await m.sub('libSub', 'seances'); await m.click('[data-act=newChoose]'); await m.click('#sheet [data-act=newSeance]'); await P.waitForSelector('input[data-change=sName]');
  await P.fill('input[data-change=sName]', 'Séance invitée voyage'); await P.press('input[data-change=sName]', 'Tab'); await P.waitForTimeout(600);
  delete env.MOVE_TO;
  await P.goto('about:blank'); await P.goto(OLDO + '/'); await P.waitForURL((u) => u.origin === NEWO, { timeout: 15000 });
  await P.waitForSelector('#mv-ok'); assert.match(await m.text('#mv-ok'), /Récupérer mes données/);
  await m.click('#mv-ok'); await P.waitForSelector('.syncbadge.guest');
  await m.tab('library'); await m.sub('libSub', 'seances'); await P.waitForSelector('text=Séance invitée voyage');
  await c.close();
});
await step('ancienne application installée : explication, puis nouvelle adresse et « installe la nouvelle application »', async () => {
  const { c, P } = await twoSites(); const m = H(P);
  // Sur l'ancienne adresse seulement, l'app tourne « installée » (plein écran)
  await c.addInitScript(() => { if (location.hostname.endsWith('.workers.dev')) { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => /display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); } });
  env.MOVE_TO = '';
  await P.goto(OLDO + '/'); await P.waitForSelector('[data-act=guestStart]'); await m.click('[data-act=guestStart]');
  await P.waitForSelector('.setup'); await m.click('[data-act=setupLater]'); await P.waitForSelector('#tour .tour-x'); await m.click('#tour .tour-x');
  delete env.MOVE_TO;
  await P.goto('about:blank'); await P.goto(OLDO + '/');
  await P.waitForSelector('#mv-go'); assert.match(await m.text('.move'), /nouvelle adresse[\s\S]*Installer[\s\S]*Désinstaller/);
  assert.ok(new URL(P.url()).origin === OLDO, 'rien ne se passe sans toucher le bouton');
  await m.click('#mv-go'); await P.waitForURL((u) => u.origin === NEWO, { timeout: 15000 });
  await P.waitForSelector('#mv-ok'); await m.click('#mv-ok');
  await P.waitForSelector('.reinstall'); assert.match(await m.text('.reinstall'), /installe la nouvelle application/i);
  await m.click('.reinstall [data-act=reinstallDone]'); await P.waitForSelector('.reinstall', { state: 'detached' });
  await P.reload(); await P.waitForSelector('nav.tabs'); assert.equal(await m.count('.reinstall'), 0);
  await c.close();
});
await step('aucune erreur JavaScript dans les navigateurs', async () => assert.deepEqual(errors, []));
console.log(`\n${n} étapes E2E OK`);
await browser.close(); srv.server.close();
