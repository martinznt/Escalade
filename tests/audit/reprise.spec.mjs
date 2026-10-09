// tests/audit/reprise.spec.mjs — reprise des 41 scénarios de l'audit du 9 octobre (A01–A41, suite fournie avec
// l'audit, relue avant d'être réutilisée). Les attendus sont des exigences du produit, pas le comportement actuel.
// Adaptations, et pourquoi (aucune pour faire passer un test) :
//  · A13 : le rappel envoie désormais #/home/cal (vérifié par tests/push-ics.test.mjs) ; l'ancienne adresse
//    #/home/agenda, déjà reçue par des téléphones, doit aussi ouvrir le calendrier ;
//  · A18 : l'action de suppression d'une photo de progrès s'appelle désormais progressPhotoDel (B04) ;
//  · A41 : l'import demande maintenant explicitement « Récupérer » pour une séance supprimée (B16).
//  · A15 : les choix radio de Records et mesures n'apparaissent que pour un grimpeur (même chose sur main 8.34.0) :
//    le sport est d'abord choisi dans Mes sports.
//  · A21 : sur un autre compte, l'historique et les rendez-vous reçoivent de nouveaux identifiants (B15) : ils sont
//    retrouvés par leur nom et leur date, plus par leur identifiant d'origine.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, ROOT, go, loaded, synced, confirm, login, logout, manual, noOverflow } from './fixtures.mjs';

async function timer(p, format) {
  await go(p, 'home/dash', '[data-act=allOpen]'); await p.locator('[data-act=allOpen]').first().click();
  await p.locator('#sheet [data-act=timerOpen]').click(); await p.click('#sheet [data-act=timerFmt][data-id=' + format + ']');
}
async function addPhotos(p, n = 2) {
  await go(p, 'progress/summary', '[data-act=photosOpen]'); await p.click('[data-act=photosOpen]');
  for (let i = 0; i < n; i++) { await p.locator('#sheet input[data-change=photoAdd]').setInputFiles(path.join(ROOT, 'public/icon-192.png')); await expect(p.locator('#sheet [data-act=photoPick]')).toHaveCount(i + 1); }
  return p.evaluate(async () => { const { S, idb } = await import('/state.js'); return { uid: S.user.id, photos: await idb.get('photos:' + S.user.id) }; });
}
async function calendarDates(p) {
  return p.evaluate(async () => { const m = await import('/agenda.js'), today = m.dayInZone(Date.now(), 'Europe/Paris'); let tuesday = today; while (m.weekday(tuesday) !== 2) tuesday = m.shiftDay(tuesday, -1); return { today, tuesday, friday: m.shiftDay(tuesday, 3), nextTuesday: m.shiftDay(tuesday, 7), laterTuesday: m.shiftDay(tuesday, 14) }; });
}
async function openDay(p, d) {
  await go(p, 'home/cal', '.cal');
  for (let i = 0; i < 14 && !(await p.locator('[data-act=calDay][data-id="' + d + '"]').count()); i++) {
    const current = await p.evaluate(async () => { const c = (await import('/state.js')).S.cal; return c.y + '-' + String(c.m + 1).padStart(2, '0'); });
    await p.click('[data-act=calMove][data-id="' + (d.slice(0, 7) < current ? -1 : 1) + '"]');
  }
  await p.click('[data-act=calDay][data-id="' + d + '"]');
}
async function plan(p, date) {
  await go(p, 'home/dash', '[data-act=agendaPlan]'); await p.click('[data-act=agendaPlan]');
  await p.fill('[data-submit=agendaParse] input', 'Tous les mardis et vendredis, escalade voie à Nicole Abar'); await p.click('[data-submit=agendaParse] button');
  await expect(p.locator('[name=place]')).toHaveValue('Nicole Abar'); await p.fill('[name=date]', date); await p.click('[data-submit=agendaSave] button[type=submit]'); await synced(p);
}

test('A01 navigation principale, retour, rechargement et tactile', async ({ page, hasTouch, audit }) => {
  for (const id of ['library', 'progress', 'profile', 'settings', 'home']) {
    const b = page.locator('nav.tabs [data-id=' + id + ']'); if (hasTouch) await b.tap(); else await b.click();
    await expect.poll(() => page.evaluate(async () => (await import('/state.js')).S.tab)).toBe(id); await noOverflow(page);
  }
  await page.goBack(); await expect(page).toHaveURL(/#\/settings/); await page.reload(); await loaded(page); await expect(page).toHaveURL(/#\/settings/);
  expect(audit.events.pageerrors).toEqual([]);
});
test('A02 séance libre : création, quantités, note et persistance', async ({ page }) => {
  await manual(page, '4 × 8 tractions repos 2 min\nCourse 1 h 30', 'Séance durable');
  await page.fill('textarea[data-change=sNotes]', 'Eau et récupération'); await page.press('textarea[data-change=sNotes]', 'Tab'); await synced(page); await page.reload(); await loaded(page);
  await expect(page.locator('input[data-change=sName]')).toHaveValue('Séance durable'); await expect(page.locator('textarea[data-change=sNotes]')).toHaveValue('Eau et récupération');
  const ex = await page.evaluate(async () => (await import('/state.js')).S.seances.items.find((x) => x.name === 'Séance durable').exercises);
  expect([ex[0].sets, ex[0].repsMin, ex[0].rest]).toEqual([4, 8, 120]); expect([ex[1].mode, ex[1].secMin]).toEqual(['time', 5400]);
});
test('A03 durée décimale française : 1,5 h = 90 minutes', async ({ page }) => {
  await manual(page, 'Footing 1,5 h', 'Décimale'); await synced(page); await page.reload(); await loaded(page);
  expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.find((x) => x.name === 'Décimale').exercises[0].secMin)).toBe(5400);
});
test('A04 écrire deux fois rapidement ne duplique pas les exercices', async ({ page }) => {
  await manual(page, '8 squats', 'Double clic'); await page.click('[data-act=exWrite]'); await page.fill('#sheet textarea[name=text]', '10 pompes');
  await page.locator('#sheet form button[type=submit]').dblclick({ delay: 20 }); await expect(page.locator('#main .item.ex')).toHaveCount(2);
  await synced(page); await page.reload(); await loaded(page); await expect(page.locator('#main .item.ex')).toHaveCount(2);
});
test('A05 bibliothèque : tout sélectionner sélectionne toutes les séances', async ({ page }) => {
  await manual(page, '8 squats', 'Première'); await manual(page, '10 pompes', 'Seconde'); await go(page, 'library/seances', '[data-act=selStart]');
  await page.click('[data-act=selStart]'); await page.click('[data-act=selAll]');
  expect(await page.evaluate(async () => (await import('/state.js')).S.sel.length)).toBe(2);
});
test('A06 zone reconnue : « poignet droit » coche réellement Poignets', async ({ page }) => {
  await go(page, 'profile/mine', 'details.fold'); await page.locator('#main details.fold').first().locator('summary').click(); await page.fill('input[data-list=zone]', 'poignet droit'); await page.press('input[data-list=zone]', 'Enter');
  await expect(page.locator('#toast')).toContainText('coché');
  expect(await page.evaluate(async () => !!(await import('/state.js')).S.settings.avoid.wrists)).toBe(true);
  await synced(page); await page.reload(); await loaded(page); expect(await page.evaluate(async () => !!(await import('/state.js')).S.settings.avoid.wrists)).toBe(true);
});
test('A07 ajout personnel inconnu : conservation, retrait et rechargement', async ({ page }) => {
  await go(page, 'profile/mine', 'details.fold'); await page.locator('#main details.fold').first().locator('summary').click(); await page.fill('input[data-list=zone]', 'Hanche gauche'); await page.press('input[data-list=zone]', 'Enter'); await synced(page);
  await page.reload(); await loaded(page); const d = page.locator('#main details.fold').first(); if (!(await d.evaluate((x) => x.open))) await d.locator('summary').click();
  await expect(d).toContainText('Hanche gauche'); await d.locator('[data-act=choiceDel]').click(); await confirm(page); await synced(page); await page.reload(); await loaded(page);
  expect(await page.evaluate(async () => (await import('/state.js')).itemsOf('choice').length)).toBe(0);
});
test('A08 chrono : entrée invalide refusée sans démarrage', async ({ page }) => {
  await timer(page, 'emom'); await page.fill('#tform [name=minutes]', ''); await page.click('#tform button[type=submit]'); await expect(page.locator('#itimer')).toHaveCount(0);
  expect(await page.locator('#tform [name=minutes]').evaluate((x) => x.validity.valueMissing)).toBe(true);
  await page.fill('#tform [name=minutes]', '181'); await page.click('#tform button[type=submit]'); expect(await page.locator('#tform [name=minutes]').evaluate((x) => x.validity.rangeOverflow)).toBe(true);
});
test('A09 chrono gardé : relance après rechargement puis retrait', async ({ page }) => {
  await timer(page, 'emom'); await page.fill('#tform [name=minutes]', '12'); await page.fill('#tform [name=text]', '10 squats\n8 fentes'); await page.fill('#tform [name=name]', 'Jambes'); await page.check('#tform [name=keep]'); await page.click('#tform button[type=submit]'); await page.click('#itimer [data-act=timerStop]'); await synced(page);
  await page.reload(); await loaded(page); await timer(page, 'emom'); await expect(page.locator('#sheet')).toContainText('Jambes'); await page.click('[data-act=timerMine]'); await page.click('#itimer [data-act=timerSkip]'); await expect(page.locator('#itimer')).toContainText('10 squats'); await page.click('#itimer [data-act=timerStop]');
  await timer(page, 'emom'); await page.click('[data-act=timerMineDel]'); await confirm(page); await synced(page); await page.reload(); await loaded(page); expect(await page.evaluate(async () => (await import('/state.js')).itemsOf('chrono').length)).toBe(0);
});
test('A10 EMOM suspendu 185 secondes : quatrième intervalle', async ({ page }) => {
  await timer(page, 'emom'); await page.fill('#tform [name=every]', '60'); await page.fill('#tform [name=minutes]', '12'); await page.clock.install(); await page.click('#tform button[type=submit]'); await page.click('#itimer [data-act=timerSkip]'); await page.clock.fastForward(185000);
  await expect(page.locator('#itimer')).toContainText('Minute 4 / 12');
});
test('A11 les efforts passés ne deviennent pas des séries effectuées', async ({ page }) => {
  await timer(page, 'intervals'); for (const [k, v] of Object.entries({ work: '7', rest: '3', reps: '2', sets: '1', setRest: '0', name: 'Tout passé' })) await page.fill('#tform [name=' + k + ']', v);
  await page.click('#tform button[type=submit]'); for (let i = 0; i < 4; i++) await page.click('#itimer [data-act=timerSkip]'); await page.click('#sheet [data-act=timerSave]');
  const n = await page.evaluate(async () => { const { S } = await import('/state.js'); return S.history.find((x) => x.sessionName === 'Chrono : Tout passé').data.exercises.flatMap((x) => x.sets).filter((x) => x.done).length; }); expect(n).toBe(0);
});
test('A12 EMOM 180 minutes toutes les 10 secondes : 1 080 intervalles', async ({ page }) => {
  await timer(page, 'emom'); await page.fill('#tform [name=every]', '10'); await page.fill('#tform [name=minutes]', '180'); await page.click('#tform button[type=submit]'); await page.click('#itimer [data-act=timerSkip]');
  await expect(page.locator('#itimer')).toContainText('1 / 1080');
});
test('A13 rappel de calendrier : le lien de la notification ouvre le calendrier (nouvelle et ancienne adresse)', async ({ page, audit }) => {
  for (const hash of ['#/home/cal', '#/home/agenda']) { await page.goto(audit.srv.base + '/' + hash); await loaded(page); await expect(page.locator('#main .cal'), hash).toBeVisible(); }
});
test('A14 un lien mal encodé laisse une page utilisable', async ({ page, audit }) => {
  await page.goto(audit.srv.base + '/#/profile/perfs/%'); await page.reload(); await expect(page.locator('nav.tabs')).toBeVisible(); await expect(page.locator('body')).not.toContainText('URI malformed');
});
test('A15 radios accessibles : tous les états ARIA valent true ou false', async ({ page }) => {
  // Les choix radio de Records et mesures (pyramide) n'existent que pour un grimpeur : le sport est d'abord choisi
  // dans Profil › Mes sports, comme le ferait la personne (vérifié identique sur main 8.34.0).
  await go(page, 'profile/activities', '[data-act=sportPick][data-id=climbing_boulder]'); await page.click('[data-act=sportPick][data-id=climbing_boulder]'); await page.click('#sheet [data-act=sportSet][data-v=on]'); await synced(page);
  await go(page, 'profile/perfs', '[role=radio]'); const states = await page.locator('[role=radio]').evaluateAll((es) => es.map((e) => e.getAttribute('aria-checked')));
  expect(states.length).toBeGreaterThan(0); expect(states.every((x) => ['true', 'false'].includes(x))).toBe(true);
});
test('A16 bilan : chaque jauge a un nom accessible', async ({ page }) => {
  await go(page, 'profile/bilan', '[role=progressbar]'); const bars = page.locator('[role=progressbar]'); expect(await bars.count()).toBeGreaterThan(0);
  for (const b of await bars.all()) await expect(b).toHaveAccessibleName(/\S/);
});
test('A17 notifications : le choix du son a un nom accessible', async ({ page }) => {
  await go(page, 'settings/notifs', 'select[name=notifSound]'); await expect(page.locator('select[name=notifSound]')).toHaveAccessibleName(/\S/);
});
test('A18 photos importées : comparaison et suppression effective', async ({ page }) => {
  const { uid, photos } = await addPhotos(page); for (const p of photos) await page.click('#sheet [data-act=photoPick][data-id="' + p.id + '"]'); await page.click('[data-act=photoCompare]'); await page.locator('[data-act=progressPhotoDel]').first().click();
  await expect(page.locator('#dialog.open')).toBeVisible(); await confirm(page);
  await expect.poll(() => page.evaluate(async (uid) => (await (await import('/state.js')).idb.get('photos:' + uid)).length, uid)).toBe(1);
});
test('A19 la suppression du compte efface aussi ses photos locales', async ({ page, audit }) => {
  const { uid, photos } = await addPhotos(page, 1); await page.keyboard.press('Escape'); await go(page, 'settings/main', '[data-act=delAccount]'); await page.click('[data-act=delAccount]'); await confirm(page); await page.fill('form[data-submit=delacct] [name=password]', 'motdepasse1'); await page.click('form[data-submit=delacct] button[type=submit]');
  await expect.poll(() => page.evaluate(async () => (await import('/state.js')).S.user)).toBe(null);
  expect((await audit.users.AuditAlice.get('/api/auth/me')).status).toBe(401);
  const remaining = await page.evaluate(async ({ uid, id }) => { const { idb } = await import('/state.js'); return { index: !!(await idb.get('photos:' + uid)), image: !!(await idb.get('photos:' + uid + ':' + id)) }; }, { uid, id: photos[0].id }); expect(remaining).toEqual({ index: false, image: false });
});
test('A20 un changement de compte ne révèle pas le brouillon de chrono', async ({ page }) => {
  await timer(page, 'emom'); await page.fill('#tform [name=text]', 'Information privée Alice'); await page.click('#tform button[type=submit]'); await page.click('#itimer [data-act=timerStop]'); await logout(page); await login(page, 'AuditBob'); await loaded(page); await timer(page, 'emom'); await expect(page.locator('#tform [name=text]')).toHaveValue('');
});
test('A21 export JSON puis import sur un autre compte, sans doublon', async ({ page }, info) => {
  await manual(page, '4 × 8 tractions repos 2 min', 'Sauvegarde transportable');
  await page.evaluate(async () => { const m = await import('/state.js'); m.putItem('choice', 'my-zone-backup', { list: 'zone', label: 'Hanche gauche', on: true }); m.putItem('chrono', 'chrono-backup', { name: 'Chrono sauvegardé', format: 'emom', every: 60, minutes: 12, text: 'Squats' }); m.putItem('env', 'env-backup', { name: 'Salle sauvegardée', type: 'maison', equipment: ['mat'] }); m.addHistory({ id: 'history-backup', sessionName: 'Sortie sauvegardée', startedAt: Date.now() - 86400000, durationSeconds: 3600, data: { activity: 'running', rpe: 3, exercises: [] } }); m.saveEvent({ id: 'event-backup', date: '2026-10-20', title: 'Rendez-vous sauvegardé', completed: false }); });
  await synced(page); await go(page, 'settings/data', '[data-act=export]'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]); const file = info.outputPath('backup.json'); await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file)); expect(data.seances.items.some((x) => x.name === 'Sauvegarde transportable')).toBe(true);
  await logout(page); await login(page, 'AuditBob'); await loaded(page); await go(page, 'settings/data', 'input[data-change=importJson]');
  for (let i = 0; i < 2; i++) { await page.locator('input[data-change=importJson]').setInputFiles(file); await confirm(page); await expect(page.locator('#toast')).toContainText('Importé'); await synced(page); }
  await page.reload(); await loaded(page); expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.filter((x) => x.name === 'Sauvegarde transportable').length)).toBe(1);
  const recovered = await page.evaluate(async () => { const m = await import('/state.js'); return { choice: m.item('choice', 'my-zone-backup')?.label, chrono: m.item('chrono', 'chrono-backup')?.minutes, env: m.item('env', 'env-backup')?.name, history: m.S.history.filter((h) => h.sessionName === 'Sortie sauvegardée').map((h) => h.durationSeconds), events: m.S.events.filter((e) => e.title === 'Rendez-vous sauvegardé').map((e) => e.date) }; });
  expect(recovered).toEqual({ choice: 'Hanche gauche', chrono: 12, env: 'Salle sauvegardée', history: [3600], events: ['2026-10-20'] });
});
test('A22 JSON invalide : message compréhensible et données conservées', async ({ page }) => {
  await manual(page, '8 squats', 'À garder'); await go(page, 'settings/data', 'input[data-change=importJson]'); await page.locator('input[data-change=importJson]').setInputFiles({ name: 'cassé.json', mimeType: 'application/json', buffer: Buffer.from('{incorrect') }); await expect(page.locator('#toast')).toContainText('JSON valide');
  await page.reload(); await loaded(page); expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.some((x) => x.name === 'À garder'))).toBe(true);
});
test('A23 membre : accès direct à l’administration refusé par le serveur', async ({ page }) => {
  const statuses = await page.evaluate(async () => Promise.all(['/api/admin/users', '/api/admin/push-status', '/api/admin/proposals'].map(async (p) => (await fetch(p)).status))); expect(statuses).toEqual([403, 403, 403]);
  await go(page, 'settings/admin', '[data-submit=adminOn]'); await expect(page.locator('[data-act=announceSend]')).toHaveCount(0);
});
test('A24 identité du compte : séances du second compte isolées', async ({ page }) => {
  await manual(page, '8 squats', 'Secret Alice'); await synced(page); await logout(page); await login(page, 'AuditBob'); await loaded(page); await go(page, 'library/seances'); await expect(page.locator('#main')).not.toContainText('Secret Alice');
  expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.some((x) => x.name === 'Secret Alice'))).toBe(false);
});
test('A25 panne 500 : séance locale conservée puis synchronisée après la reprise', async ({ page, audit }) => {
  audit.srv.fail = (req) => (new URL(req.url).pathname === '/api/sync' ? new Response('{"error":"Panne simulée"}', { status: 500, headers: { 'Content-Type': 'application/json' } }) : null);
  await manual(page, '8 squats', 'Conservée en panne'); await expect.poll(() => page.evaluate(async () => (await import('/state.js')).S.sync)).toBe('error');
  await page.reload(); await loaded(page); expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.some((x) => x.name === 'Conservée en panne'))).toBe(true);
  audit.srv.fail = null; await synced(page);
  expect(JSON.stringify((await audit.users.AuditAlice.post('/api/sync', { items: [], tomb: {} })).data)).toContain('Conservée en panne');
});
test('A26 réponse serveur malformée : erreur explicite sans perte locale', async ({ page, audit }) => {
  await manual(page, '8 squats', 'Conservée réponse invalide'); await synced(page);
  audit.srv.fail = (req) => (new URL(req.url).pathname === '/api/history' ? new Response('{"history":null}', { headers: { 'Content-Type': 'application/json' } }) : null);
  await page.evaluate(async () => await (await import('/state.js')).syncAll()); expect(await page.evaluate(async () => (await import('/state.js')).S.sync)).toBe('error');
  expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.some((x) => x.name === 'Conservée réponse invalide'))).toBe(true);
  audit.srv.fail = null; await synced(page); await page.reload(); await loaded(page); await expect(page.locator('input[data-change=sName]')).toHaveValue('Conservée réponse invalide');
});
test('A27 connexion lente : la dernière modification gagne sans effacer la saisie', async ({ page, audit }) => {
  await manual(page, '8 squats', 'Version 1'); await synced(page);
  audit.srv.fail = async (req) => { if (new URL(req.url).pathname === '/api/sync') await new Promise((r) => setTimeout(r, 800)); return null; };
  for (const name of ['Version 2', 'Version 3', 'Version finale']) { await page.fill('input[data-change=sName]', name); await page.press('input[data-change=sName]', 'Tab'); }
  await synced(page); audit.srv.fail = null; await page.reload(); await loaded(page); await expect(page.locator('input[data-change=sName]')).toHaveValue('Version finale');
});
test.describe('avec le Service Worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('A28 hors ligne : modification, rechargement et resynchronisation', async ({ page, context }) => {
    await manual(page, '8 squats', 'Avant hors ligne'); await synced(page); await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
    await context.setOffline(true); await page.fill('input[data-change=sName]', 'Après hors ligne'); await page.press('input[data-change=sName]', 'Tab'); await page.waitForTimeout(400);
    await page.reload(); await page.waitForSelector('input[data-change=sName]'); await expect(page.locator('input[data-change=sName]')).toHaveValue('Après hors ligne');
    await context.setOffline(false); await synced(page); await page.reload(); await loaded(page); await expect(page.locator('input[data-change=sName]')).toHaveValue('Après hors ligne');
  });
});
test('A29 un texte écrit par l’utilisateur s’affiche sans exécuter de HTML', async ({ page }) => {
  await manual(page, '8 squats', '<img src=x onerror="window.__injected=1">'); await synced(page); await go(page, 'library/seances'); await expect(page.locator('#main')).toContainText('<img'); expect(await page.evaluate(() => window.__injected || 0)).toBe(0); expect(await page.locator('#main img[src=x]').count()).toBe(0);
});
test('A30 modes simple et avancé : données et choix gardés', async ({ page }) => {
  await manual(page, '8 squats', 'Même séance'); await synced(page); await go(page, 'settings/main', '[data-act=interfaceSet]'); await page.click('[data-act=interfaceSet][data-v=advanced]'); await synced(page); await page.reload(); await loaded(page); await expect(page.locator('html')).toHaveAttribute('data-interface', 'advanced');
  expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.find((x) => x.name === 'Même séance').exercises[0].repsMin)).toBe(8);
  await go(page, 'settings/main', '[data-act=interfaceSet]'); await page.click('[data-act=interfaceSet][data-v=simple]'); await synced(page); await page.reload(); await loaded(page); await expect(page.locator('html')).toHaveAttribute('data-interface', 'simple');
});
test('A31 clavier : ouvrir et fermer une fenêtre sans piège', async ({ page }) => {
  await go(page, 'home/dash', '[data-act=allOpen]'); await page.locator('[data-act=allOpen]').first().click(); const button = page.locator('#sheet [data-act=timerOpen]'); await button.focus(); await page.keyboard.press('Enter'); await expect(page.locator('#sheet.open')).toBeVisible(); await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('#sheet'))).toBe(true); await page.keyboard.press('Escape'); await expect(page.locator('#sheet.open')).toHaveCount(0); await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});
test('A32 bibliothèque volumineuse : 300 séances, recherche et rechargement', async ({ page }) => {
  await page.evaluate(async () => { const m = await import('/state.js'); for (let i = 0; i < 300; i++) m.saveSeance({ id: 'mass-' + i, name: 'Volume ' + String(i).padStart(3, '0'), exercises: [{ name: 'Squats', sets: 1, repsMin: 8, repsMax: 8, rest: 0 }] }); }); await synced(page); await go(page, 'library/seances');
  const search = page.locator('#main input[type=search],#main input[data-input=sfQ]').first(); await search.fill('Volume 299'); await expect(page.locator('#main')).toContainText('Volume 299'); await noOverflow(page); await page.reload(); await loaded(page); expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.length)).toBe(300);
});
test('A33 mardi et vendredi : bilan voie et bloc, édition sans doublon, statistiques', async ({ page }) => {
  const d = await calendarDates(page); await plan(page, d.tuesday); const events = await page.evaluate(async () => (await import('/state.js')).S.events); expect(events).toHaveLength(1); expect(events[0].recurrence.days).toEqual([2, 5]);
  await openDay(page, d.tuesday); await page.click('[data-act=quickLog][data-id]'); await page.fill('[name=minutes-0]', '90'); await page.selectOption('[name=rpe-0]', '3'); await page.getByText('＋ Ajouter autre chose avant / après', { exact: true }).click(); await page.fill('[name=minutes-1]', '20'); await page.click('[data-submit=quickSave] button[type=submit]'); await synced(page);
  await page.reload(); await loaded(page); await openDay(page, d.tuesday); await page.click('[data-act=quickLog][data-id]'); await expect(page.locator('[name=minutes-0]')).toHaveValue('90'); await expect(page.locator('[name=minutes-1]')).toHaveValue('20'); await page.click('[data-submit=quickSave] button[type=submit]'); await synced(page);
  const history = await page.evaluate(async () => (await import('/state.js')).S.history); expect(history).toHaveLength(2); expect(history.reduce((s, h) => s + h.durationSeconds, 0)).toBe(6600); expect(history.find((h) => h.data.activity === 'climbing_boulder').data.quickLog.order).toBe('before');
  await go(page, 'progress/summary'); await expect(page.locator('#main')).not.toContainText('NaN'); await noOverflow(page);
});
test('A34 récurrence : modifier une occurrence puis les suivantes garde les autres', async ({ page }) => {
  const d = await calendarDates(page); await plan(page, d.tuesday); await openDay(page, d.nextTuesday); await page.click('[data-act=agendaEdit]'); await page.fill('[name=place]', 'Lieu exceptionnel'); await page.click('[data-submit=agendaEditSave] button[type=submit]'); await synced(page); await page.reload(); await loaded(page);
  const get = (x) => page.evaluate(async (x) => { const { S } = await import('/state.js'); return (await import('/agenda.js')).agendaEvents(S.events, x).map((e) => e.meta?.place); }, x);
  expect(await get(d.nextTuesday)).toEqual(['Lieu exceptionnel']); expect(await get(d.friday)).toEqual(['Nicole Abar']);
  await openDay(page, d.laterTuesday); await page.click('[data-act=agendaEdit]'); await page.selectOption('[name=scope]', 'future'); await page.fill('[name=place]', 'Nouvelle salle'); await page.click('[data-submit=agendaEditSave] button[type=submit]'); await synced(page); await page.reload(); await loaded(page);
  expect(await get(d.laterTuesday)).toEqual(['Nouvelle salle']); expect(await get(d.nextTuesday)).toEqual(['Lieu exceptionnel']); expect(await get(d.tuesday)).toEqual(['Nicole Abar']);
});
test('A35 agenda : rappel sans heure et fin avant début refusés', async ({ page }) => {
  const d = await calendarDates(page); await go(page, 'home/dash', '[data-act=agendaPlan]'); await page.click('[data-act=agendaPlan]'); await page.getByText('Heure, durée, rappel et autres options', { exact: true }).click(); await page.selectOption('[name=reminderMin]', '30'); await page.click('[data-submit=agendaSave] button[type=submit]'); await expect(page.locator('#toast')).toContainText('Renseigne une heure');
  expect(await page.evaluate(async () => (await import('/state.js')).S.events.length)).toBe(0); await page.fill('[name=time]', '18:30'); await page.fill('[name=date]', d.nextTuesday); await page.fill('[name=until]', d.tuesday); await page.click('[data-submit=agendaSave] button[type=submit]'); await expect(page.locator('#toast')).toContainText('Vérifie les dates'); expect(await page.evaluate(async () => (await import('/state.js')).S.events.length)).toBe(0);
});
test('A36 séance interrompue : reprendre et enregistrer une seule fois les séries', async ({ page }) => {
  await go(page, 'settings/session', '[name=autoWarm]'); await page.uncheck('[name=autoWarm]'); await synced(page); await manual(page, '3 × 8 squats repos 1 s', 'Séance à reprendre'); await synced(page); await page.click('#main [data-act=play]'); await page.click('#player [data-act=pGo]'); if (await page.locator('#player [data-act=pWorkDone]').count()) await page.click('#player [data-act=pWorkDone]'); await page.waitForTimeout(350); await page.reload(); await loaded(page); await go(page, 'home/dash', '[data-act=pResume]'); await page.click('[data-act=pResume]'); await expect(page.locator('#player.open')).toContainText('Squats');
  for (let i = 0; i < 20 && !(await page.locator('#player [data-act=pSave]').count()); i++) { const a = (await page.locator('#player [data-act=pRestSkip]').count()) ? 'pRestSkip' : (await page.locator('#player [data-act=pWorkDone]').count()) ? 'pWorkDone' : 'pGo'; await page.click('#player [data-act=' + a + ']'); }
  await page.click('#player [data-act=pSave]'); await synced(page); await page.reload(); await loaded(page); const history = await page.evaluate(async () => (await import('/state.js')).S.history.filter((h) => h.sessionName === 'Séance à reprendre')); expect(history).toHaveLength(1); expect(history[0].data.exercises[0].sets.filter((s) => s.done)).toHaveLength(3);
});
test('A37 IA non configurée : erreur honnête, aucune action ni enregistrement', async ({ page }) => {
  await go(page, 'home/dash', '[data-act=coachOpen]'); await page.locator('[data-act=coachOpen]').first().click(); await page.fill('#sheet input[name=q]', 'Peux-tu expliquer comment comprendre mes habitudes ?'); await page.click('#sheet form[data-submit=chatSend] button[type=submit]'); await expect(page.locator('#chatlog')).toContainText(/non activé|indisponible|pas activé/); await expect(page.locator('#sheet [data-act=chatAction]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/state.js')).S.history.length)).toBe(0); await page.reload(); await loaded(page); await page.locator('[data-act=coachOpen]').first().click(); await expect(page.locator('#chatlog')).toContainText(/non activé|indisponible|pas activé/);
});
test('A38 Organiser : éditeur, aperçu, enregistrement et persistance sur cinq rubriques', async ({ page }) => {
  for (const route of ['home/dash', 'library/seances', 'profile/perfs', 'progress/journal', 'settings/notifs']) {
    await go(page, route, '[data-act=layEdit]'); await page.click('[data-act=layEdit]'); await expect(page.locator('[data-act=layPreview]')).toBeVisible(); await page.locator('[data-act=layAs][data-v=off]').first().click(); await page.click('[data-act=layPreview]'); await expect(page.locator('[data-act=layBack]')).toBeVisible(); await page.click('[data-act=laySave]'); await confirm(page); await synced(page); await expect(page.locator('[data-act=layBack]')).toHaveCount(0); await page.reload(); await loaded(page); await noOverflow(page);
  }
  expect(await page.evaluate(async () => (await import('/state.js')).itemsOf('config').filter((x) => x.id === 'layout').length)).toBe(1);
});
test('A39 stress : deux envois synchrones ne dupliquent pas les exercices', async ({ page }) => {
  await manual(page, '8 squats', 'Soumissions concomitantes'); await page.click('[data-act=exWrite]'); await page.fill('#sheet textarea[name=text]', '10 pompes'); await page.locator('#sheet form button[type=submit]').evaluate((b) => { b.click(); b.click(); }); await expect(page.locator('#main .item.ex')).toHaveCount(2);
});
test('A40 une annonce de mise à jour ne recouvre pas le lecteur de séance', async ({ page }) => {
  await manual(page, '3 × 8 squats repos 1 s', 'Avec annonce'); await synced(page);
  await page.evaluate(() => localStorage.setItem('sea:news-toured', JSON.stringify('8.3.0'))); await page.reload(); await loaded(page); await expect(page.locator('#updbar.fresh')).toBeVisible(); await page.click('#main [data-act=play]'); await expect(page.locator('#player.open')).toBeVisible(); await expect(page.locator('#updbar')).not.toBeVisible();
});
test('A41 sauvegarde : récupérer une séance supprimée sur le même compte', async ({ page }, info) => {
  await manual(page, '4 × 8 tractions repos 2 min', 'À récupérer'); await synced(page); const editUrl = page.url(); await go(page, 'settings/data', '[data-act=export]'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]); const file = info.outputPath('before-deletion.json'); await dl.saveAs(file);
  await page.goto(editUrl); await loaded(page); const del = page.locator('#main [data-act=sDelete]'); for (const d of (await del.locator('xpath=ancestor::details[not(@open)]').all()).reverse()) await d.locator(':scope > summary').click(); await del.click(); await confirm(page); await synced(page); expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.length)).toBe(0);
  await test.step('import : confirmer', async () => { await go(page, 'settings/data', 'input[data-change=importJson]'); await page.locator('input[data-change=importJson]').setInputFiles(file); await confirm(page); });
  await test.step('import : « Récupérer » la séance supprimée', async () => { await expect(page.locator('#dialog.open')).toContainText('Récupérer'); await confirm(page); });
  await expect(page.locator('#toast')).toContainText('Importé'); await synced(page); await page.reload(); await loaded(page);
  expect(await page.evaluate(async () => (await import('/state.js')).S.seances.items.filter((x) => x.name === 'À récupérer').length)).toBe(1);
});
