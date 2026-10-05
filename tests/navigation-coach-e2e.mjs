// Vérification utilisateur : Organiser depuis chaque page puis exécuter une suggestion du coach.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';

let aiCalls = 0;
const env = makeEnv({ AI: { run: async () => {
  aiCalls++;
  return { response: JSON.stringify({ status:'ok',basis:'request',sources:['request','app/map'],reply: 'Voici deux possibilités à choisir avant de continuer.', actions: [
    { command: 'Fais-moi une séance de 20 minutes pour les jambes', label: 'Préparer 20 minutes' },
    { to: 'home/cal', label: 'Ouvrir mon planning' },
    { to: 'settings/admin', label: 'Accès administrateur non autorisé' },
  ] }) };
} } });
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => String(url).startsWith('https://eutils.ncbi.nlm.nih.gov/') ? Promise.resolve(new Response('',{status:503})) : String(url).startsWith('https://api.github.com/')
  ? Promise.resolve(new Response(JSON.stringify([{ commit: { message: 'Version de test', committer: { date: new Date().toISOString() } }, parents: [{}] }])))
  : nativeFetch(url, opts);
const srv = await startServer(env);
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
await ctx.addInitScript(() => localStorage.setItem('sea:q-snooze', JSON.stringify(Object.fromEntries(['acts', 'climbPerWeek', 'place', 'minutes', 'perWeek', 'bloc', 'tractions', 'pompes', 'goal', 'avoid'].map((k) => [k, 9e15])))));
const p = await ctx.newPage(), errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let steps = 0;
const step = async (name, fn) => { await fn(); steps++; console.log('  ✓', name); };
const confirm = async (closed = true) => { await p.waitForSelector('#dialog.open [data-dlg="1"]'); await p.click('#dialog.open [data-dlg="1"]'); if (closed) await p.waitForSelector('#dialog:not(.open)', { state: 'attached' }); };
const state = () => p.evaluate(async () => { const { S } = await import('/state.js'); return { layout: S.lay, sessions: S.seances.items.length, history: S.history.length }; });
const open = async (tab, sub, param) => { await p.evaluate(async (args) => { const { go } = await import('/state.js'); go(...args); }, [tab, sub, param]); await p.waitForTimeout(100); };
const routes = {
  home: ['dash', 'cal'],
  progress: ['summary', 'journal', 'analyses', 'lab', 'records', 'timeline', 'history'],
  library: ['home', 'seances', 'climbplan', 'generate', 'gym', 'moments', 'catalog', 'best', 'exercises', 'common', 'search', 'import', 'seance/nav-session'],
  profile: ['home', 'memory', 'bilan', 'analyse', 'body', 'understand', 'map', 'activities', 'perfs', 'climbing', 'goals', 'equipment', 'prefs', 'public'],
  settings: ['main', 'display', 'session', 'notifs', 'help', 'data', 'sync', 'updates', 'bug', 'admin'],
};
try {
  const registration = await ctx.request.post(srv.base + '/api/auth/register', { headers: { Origin: srv.base }, data: { username: 'ParcoursAudit', password: 'motdepasse1' } });
  assert.equal(registration.status(), 200);
  await p.goto(srv.base); await p.waitForSelector('nav.tabs');
  await p.evaluate(async () => { window.__escaladeNavigationState = (await import('/state.js')).S; });
  await p.evaluate(async () => {
    const { S, putItem, saveSeance, render } = await import('/state.js'), { closeSheet } = await import('/ui.js');
    putItem('config', 'main', { setupDone: true, tourDone: true, asked: ['acts', 'climbPerWeek', 'place', 'minutes', 'perWeek', 'bloc', 'tractions', 'pompes', 'goal', 'avoid'] });
    putItem('activity', 'act-conditioning', { preset: 'conditioning', label: 'Renforcement', archived: false });
    saveSeance({ id: 'nav-session', name: 'Séance de vérification', exercises: [{ id: 'nav-push', name: 'Pompes', mode: 'reps', sets: 3, repsMin: 8, repsMax: 8, rest: 60 }] });
    S.setup = null; closeSheet(); render();
  });
  for (const mode of ['simple', 'advanced']) {
    await step(`Organiser sur les 46 pages et sous-pages en mode ${mode} : aperçu, continuer, quitter`, async () => {
      await p.evaluate(async (mode) => { const { S, render } = await import('/state.js'); S.settings.interfaceMode = mode; render(); }, mode);
      for (const [tab, subs] of Object.entries(routes)) for (const path of subs) {
        const [sub, param] = path.split('/'); await open(tab, sub, param); const origin = p.url(), currentTab = await p.evaluate(async () => (await import('/state.js')).S.tab);
        await p.click('[data-act=layEdit]'); await p.waitForSelector('.editbar');
        assert.equal((await state()).layout.page, currentTab, `${tab}/${path}`);
        assert.match(await p.locator('.editbar').innerText(), /raccourcis de son en-tête|raccourcis de l’en-tête/);
        await p.click('[data-act=layPreview]'); await p.waitForSelector('.editdock.top');
        assert.match(await p.locator('.editdock.top').innerText(), /pas encore enregistré/);
        await p.click('[data-act=layBack]'); await p.waitForSelector('.editbar'); assert.equal(p.url(), origin);
        await p.locator('[data-act=layQuit]').first().click(); await p.waitForSelector('.editbar', { state: 'detached' });
        assert.equal(p.url(), origin); assert.equal((await state()).layout, null);
      }
    });
  }
  await step('modification non enregistrée : aperçu sans perte de séance et abandon confirmé depuis une sous-page', async () => {
    await p.setViewportSize({ width: 320, height: 568 }); await open('library', 'seance', 'nav-session');
    const origin = p.url(), before = await state();
    await p.click('[data-act=layEdit]'); await p.waitForSelector('.editbar');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.click('[data-act=layAs][data-id=search][data-v=off]');
    await p.click('[data-act=layPreview]'); await p.waitForSelector('.editdock.top'); assert.equal(await p.locator('.topicons [data-act=findOpen]').count(), 0);
    await p.click('[data-act=layBack]'); await p.waitForSelector('.editbar'); assert.equal(p.url(), origin);
    await p.locator('[data-act=layQuit]').first().click(); await confirm(); await p.waitForSelector('.editbar', { state: 'detached' });
    assert.equal(p.url(), origin); assert.equal((await state()).sessions, before.sessions);
    assert.equal(await p.evaluate(async () => Object.keys((await import('/layout.js')).savedLayouts()).length), 0);
    assert.ok(await p.locator('.topicons [data-act=findOpen]').isVisible());
  });
  await step('mise en page enregistrée puis restaurée : retour au même détail de séance', async () => {
    const origin = p.url(); await p.click('[data-act=layEdit]'); await p.waitForSelector('.editbar');
    await p.click('[data-act=layAs][data-id=search][data-v=off]'); await p.click('[data-act=laySave]'); await confirm();
    await p.waitForSelector('.editbar', { state: 'detached' }); assert.equal(p.url(), origin);
    assert.equal(await p.locator('.topicons [data-act=findOpen]').count(), 0);
    await p.click('[data-act=layEdit]'); await p.waitForSelector('.editbar'); await p.click('[data-act=layReset]'); await confirm(false);
    await p.waitForFunction(() => /Vraiment/.test(document.querySelector('#dialog.open')?.textContent || '')); await confirm();
    await p.waitForSelector('.editbar', { state: 'detached' }); assert.equal(p.url(), origin);
    assert.ok(await p.locator('.topicons [data-act=findOpen]').isVisible()); assert.equal((await state()).sessions, 1);
    await p.setViewportSize({ width: 390, height: 844 });
  });
  const coach = async () => { await p.evaluate(async () => { const { ACT } = await import('/state.js'); ACT.coachOpen(); }); await p.waitForSelector('[data-submit=chatSend]'); };
  await step('coach : réponse avec actions utiles, aucune création automatique ni accès administrateur', async () => {
    await open('home', 'dash'); await coach(); const origin = p.url(), before = await state();
    await p.fill('[data-submit=chatSend] input', 'Comment gérer mon entraînement à ma reprise ?'); await p.click('[data-submit=chatSend] button');
    await p.waitForSelector('[data-act=chatAction]'); assert.equal(aiCalls, 1); assert.equal(await p.locator('[data-act=chatAction]').count(), 2);
    assert.equal(p.url(), origin); assert.equal((await state()).sessions, before.sessions); assert.equal((await state()).history, before.history);
    assert.doesNotMatch(await p.locator('#chatlog').innerText(), /Accès administrateur non autorisé/);
    await p.getByRole('button', { name: 'Préparer 20 minutes', exact: true }).click();
    await p.waitForFunction(() => { const S = window.__escaladeNavigationState; return S.sub.library === 'climbplan' && S.cp?.minutes === 20; });
    assert.equal((await state()).sessions, before.sessions, 'séance à vérifier avant de la générer et enregistrer');
    await coach(); await p.getByRole('button', { name: 'Ouvrir mon planning', exact: true }).click(); await p.waitForSelector('.cal');
    assert.match(p.url(), /#\/home\/cal/); assert.equal((await state()).history, before.history);
  });
  await step('coach indisponible : erreur compréhensible puis commande locale toujours utilisable', async () => {
    srv.env.AI = undefined; await coach(); await p.fill('[data-submit=chatSend] input', 'Comment respirer entre mes efforts ?'); await p.click('[data-submit=chatSend] button');
    await p.waitForSelector('[data-submit=chatSend] input:not([disabled])');
    assert.match(await p.locator('#chatlog').innerText(), /non activé|indisponible|moment/);
    await p.fill('[data-submit=chatSend] input', 'Fais-moi une séance de 12 minutes pour les jambes'); await p.click('[data-submit=chatSend] button');
    await p.waitForFunction(() => window.__escaladeNavigationState.cp?.minutes === 12);
    assert.equal(aiCalls, 1, 'la commande claire utilise le moteur local'); assert.equal((await state()).sessions, 1);
  });
  await step('Organiser depuis toutes les rubriques administrateur : retour au bon outil dans les deux interfaces', async () => {
    assert.equal((await ctx.request.post(srv.base + '/api/admin/activate', { headers: { Origin: srv.base }, data: { password: 'secret-admin-de-test' } })).status(), 200);
    await p.evaluate(async () => { const { S, api } = await import('/state.js'); S.user = (await api('GET', '/api/auth/me')).user; });
    const adminPages = ['admin', 'assistant', 'content', 'look', 'changes', 'members', 'bugs', 'users', 'push', 'studio', 'audit', 'lab', 'health', 'maint', 'code'];
    for (const mode of ['simple', 'advanced']) {
      await p.evaluate(async (mode) => { const { S, render } = await import('/state.js'); S.settings.interfaceMode = mode; render(); }, mode);
      for (const sub of adminPages) {
        await open('settings', sub); const origin = p.url();
        await p.click('[data-act=layEdit]'); await p.waitForSelector('.editbar'); assert.equal((await state()).layout.page, 'settings');
        await p.click('[data-act=layPreview]'); await p.waitForSelector('.editdock.top');
        await p.click('[data-act=layBack]'); await p.waitForSelector('.editbar'); assert.equal(p.url(), origin);
        await p.locator('[data-act=layQuit]').first().click(); await p.waitForSelector('.editbar', { state: 'detached' }); assert.equal(p.url(), origin);
      }
    }
  });
  await step('signalements : prendre en cours, ignorer un doublon puis traiter avec les filtres correspondants', async () => {
    await p.setViewportSize({ width: 320, height: 568 });
    const response = await ctx.request.post(srv.base + '/api/bugs', { headers: { Origin: srv.base }, data: { id: 'audit-report', title: 'Signalement de vérification', description: 'Ce signalement est une fixture du test navigateur.', page: 'settings/bug' } });
    assert.equal(response.status(), 200); const reportId = (await response.json()).id;
    await open('settings', 'bugs'); await p.click('[data-act=bugsReload]'); await p.waitForSelector(`[data-act=bugStatus][data-id="${reportId}"]`);
    for (const [status, label] of [['in_progress', 'en cours'], ['ignored', 'ignoré / doublon'], ['done', 'traité']]) {
      await p.click(`[data-act=bugStatus][data-id="${reportId}"][data-v="${status}"]`);
      await p.waitForFunction(([id, status]) => window.__escaladeNavigationState.admin.bugs.find((x) => x.id === id)?.status === status, [reportId, status]);
      await p.click(`[data-act=bugFilter][data-id="${status}"]`);
      assert.ok((await p.locator('#bugres').innerText()).includes(label));
      assert.match(await p.locator('#bugres').innerText(), /Signalement de vérification/);
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
  });
  await step('annonce globale actualisée en moins de 40 secondes : brouillon du membre conservé et notification visible', async () => {
    await open('settings', 'bug'); await p.fill('[data-submit=bugSend] [name=title]', 'Mon brouillon conservé');
    await p.fill('[data-submit=bugSend] [name=description]', 'Je complète ce formulaire pendant que le site est mis à jour.');
    const before = await p.evaluate(async () => (await import('/state.js')).S.notifUnread || 0);
    const version = await (await ctx.request.get(srv.base + '/api/version')).json();
    const response = await ctx.request.post(srv.base + '/api/admin/push-broadcast', { headers: { Origin: srv.base }, data: { id: 'audit-announcement', title: 'Annonce de vérification', body: 'Cette annonce locale vérifie la mise à jour sans abonnement push.', version: version.version, build: version.build, confirmed: true } });
    assert.equal(response.status(), 200); assert.equal((await response.json()).visibleToAll, true);
    await p.waitForFunction(() => document.querySelector('#site-banner')?.textContent.includes('Annonce de vérification'), null, { timeout: 40000 });
    assert.equal(await p.inputValue('[data-submit=bugSend] [name=title]'), 'Mon brouillon conservé');
    assert.equal(await p.inputValue('[data-submit=bugSend] [name=description]'), 'Je complète ce formulaire pendant que le site est mis à jour.');
    assert.ok(await p.evaluate(async (before) => (await import('/state.js')).S.notifUnread > before, before));
    await p.click('.topicons [data-act=notifOpen]'); await p.waitForSelector('#sheet .inbox');
    assert.match(await p.locator('#sheet .inbox').innerText(), /Annonce de vérification/);
  });
  assert.deepEqual(errors, [], 'aucune erreur JavaScript');
  console.log(`\n${steps} parcours navigation et coach OK (122 pages organisées dans les deux interfaces)`);
} catch (e) {
  await p.screenshot({ path: '/tmp/escalade-navigation-coach-fail.png', fullPage: true }).catch(() => {}); throw e;
} finally {
  await browser.close(); await new Promise((resolve) => srv.server.close(resolve)); globalThis.fetch = nativeFetch;
}
