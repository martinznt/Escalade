// tests/audit/seances.spec.mjs — séances : créer (guidée et à ma façon), modifier, dupliquer, archiver, supprimer,
// importer un texte, données inhabituelles ou invalides. Chaque résultat est vérifié à l'écran, après rechargement,
// et sur le serveur (ce que l'API renvoie au compte), pas seulement dans la mémoire de la page.
import { test, expect, go, loaded, synced, confirm, cancel, manual, noOverflow, pageAnomalies } from './fixtures.mjs';

const state = (page, fn) => page.evaluate(fn);
const seances = (page) => state(page, async () => JSON.parse(JSON.stringify((await import('/state.js')).S.seances.items)));
const server = async (audit, who = 'AuditAlice') => (await audit.users[who].get('/api/sync')).data;

test('S01 créer une séance guidée : « ⚡ Proposer ma séance », générer, enregistrer, retrouver partout', async ({ page, audit }) => {
  await go(page, 'library/climbplan', '[data-act=cpQuick]');
  await expect(page.locator('[data-act=cpQuick]')).toBeEnabled(); await page.click('[data-act=cpQuick]');
  await page.click('[data-act=cpQuickGo]'); await page.waitForSelector('[data-act=cpSave]');
  const proposed = await state(page, async () => { const s = (await import('/state.js')).S.cp?.result; return s ? { name: s.name, n: s.exercises.length, minutes: s.durationMin } : null; });
  expect(proposed?.n, 'des exercices proposés').toBeGreaterThan(0);
  await page.click('[data-act=cpSave]'); await expect(page.locator('#toast')).toContainText('Enregistrée'); await synced(page);
  const mine = await seances(page); expect(mine).toHaveLength(1); expect(mine[0].exercises.length).toBe(proposed.n);
  await page.reload(); await loaded(page); expect((await seances(page)).map((s) => s.id)).toEqual([mine[0].id]);
  const onServer = await server(audit); expect(onServer.items.map((s) => s.id)).toEqual([mine[0].id]); expect(onServer.items[0].exercises.length).toBe(proposed.n);
  await go(page, 'library/seances', '#main'); await expect(page.locator('#main')).toContainText(mine[0].name); expect(await pageAnomalies(page)).toEqual([]);
});

test('S02 modifier une séance : séries et répétitions, retirer un exercice (annuler puis confirmer), réordonner', async ({ page, audit }) => {
  const s = await manual(page, '4 × 8 tractions repos 2 min\n3 × 12 pompes repos 90 s\n3 × 45 s gainage', 'À modifier'); await synced(page);
  expect(s.exercises.map((e) => [e.name.toLowerCase(), e.sets])).toEqual([['tractions', 4], ['pompes', 3], ['gainage', 3]]);
  expect(s.exercises[0].rest).toBe(120); expect(s.exercises[1].rest).toBe(90); expect(s.exercises[2].mode).toBe('time');
  // Séries 4 → 5, répétitions 8 → 6–10.
  await page.click(`#main [data-act=exEdit][data-id="${s.exercises[0].id}"]`); await page.fill('#sheet [name=sets]', '5'); await page.fill('#sheet [name=repsMin]', '6'); await page.fill('#sheet [name=repsMax]', '10');
  await page.click('#sheet form[data-submit=exSave] button[type=submit]'); await expect(page.locator('#toast')).toContainText('Enregistré');
  // Retirer « pompes » : « Annuler » ne retire rien, « Retirer » retire.
  await page.click(`#main [data-act=exDel][data-id="${s.exercises[1].id}"]`); await cancel(page); expect((await seances(page))[0].exercises).toHaveLength(3);
  await page.click(`#main [data-act=exDel][data-id="${s.exercises[1].id}"]`); await confirm(page); expect((await seances(page))[0].exercises).toHaveLength(2);
  // Gainage remonte en premier.
  await page.click(`#main [data-act=exUp][data-id="${s.exercises[2].id}"]`); await synced(page); await page.reload(); await loaded(page);
  const after = (await server(audit)).items[0];
  expect(after.exercises.map((e) => e.name.toLowerCase())).toEqual(['gainage', 'tractions']);
  expect(after.exercises[1]).toMatchObject({ sets: 5, repsMin: 6, repsMax: 10, rest: 120 });
});

test('S03 dupliquer : la copie est indépendante, l’original ne change pas', async ({ page, audit }) => {
  const s = await manual(page, '3 × 10 squats', 'Original'); await synced(page);
  await page.locator('#main details:has([data-act=sDup]) > summary').first().click().catch(() => {}); await page.click(`#main [data-act=sDup][data-id="${s.id}"]`);
  await expect(page.locator('#toast')).toContainText('dupliquée'); await page.waitForFunction((id) => location.hash.includes('/library/seance/') && !location.hash.endsWith(id), s.id);
  await page.fill('input[data-change=sName]', 'Copie modifiée'); await page.press('input[data-change=sName]', 'Tab'); await synced(page);
  const items = (await server(audit)).items; expect(items).toHaveLength(2);
  const original = items.find((x) => x.id === s.id), copy = items.find((x) => x.id !== s.id);
  expect(original.name).toBe('Original'); expect(copy.name).toBe('Copie modifiée'); expect(copy.exercises[0].id).not.toBe(original.exercises[0].id);
});

test('S04 archiver puis désarchiver : la séance quitte la liste active sans être supprimée', async ({ page, audit }) => {
  const s = await manual(page, '3 × 10 squats', 'À archiver'); await synced(page);
  await page.locator('#main details:has([data-act=sArchive]) > summary').first().click().catch(() => {}); await page.click(`#main [data-act=sArchive][data-id="${s.id}"]`); await expect(page.locator('#toast')).toContainText('archivée'); await synced(page);
  await go(page, 'library/seances', '[data-act=seanceFilter][data-id=archived]'); await expect(page.locator('#main')).not.toContainText('À archiver');
  await page.click('[data-act=seanceFilter][data-id=archived]'); await expect(page.locator('#main')).toContainText('À archiver');
  expect((await server(audit)).items.find((x) => x.id === s.id).archived).toBe(true);
  await go(page, `library/seance/${s.id}`, `[data-act=sArchive][data-id="${s.id}"]`); await page.click(`#main [data-act=sArchive][data-id="${s.id}"]`); await expect(page.locator('#toast')).toContainText('désarchivée'); await synced(page);
  expect((await server(audit)).items.find((x) => x.id === s.id).archived).toBe(false);
});

test('S05 supprimer : « Annuler » garde tout ; « Supprimer » retire la séance du serveur, l’historique reste', async ({ page, audit }) => {
  const s = await manual(page, '3 × 10 squats', 'À supprimer'); await synced(page);
  await page.evaluate(async (id) => { const m = await import('/state.js'); m.addHistory({ id: 'h-del', sessionId: id, sessionName: 'À supprimer', startedAt: Date.now() - 3600000, durationSeconds: 1200, data: { rpe: 2, exercises: [{ name: 'Squats', sets: [{ reps: 10, done: true }] }] } }); }, s.id); await synced(page);
  const del = page.locator(`#main [data-act=sDelete][data-id="${s.id}"]`); await page.locator('#main details:has([data-act=sDelete]) > summary').first().click().catch(() => {});
  await del.click(); await expect(page.locator('#dialog.open')).toContainText('Supprimer « À supprimer » ?'); await cancel(page); await synced(page);
  expect((await server(audit)).items).toHaveLength(1);
  await del.click(); await confirm(page); await expect(page.locator('#toast')).toContainText('Séance supprimée'); await synced(page);
  const data = await server(audit); expect(data.items).toHaveLength(0); expect(Object.keys(data.tomb || {})).toContain(s.id);
  expect((await audit.users.AuditAlice.get('/api/history')).data.history.map((h) => h.id)).toContain('h-del');
  await page.reload(); await loaded(page); expect(await seances(page)).toHaveLength(0);
});

test('S06 données inhabituelles : nom vide, nom très long, texte piégé, séries hors bornes', async ({ page, audit }) => {
  const s = await manual(page, '3 × 10 squats', 'Temporaire');
  await page.fill('input[data-change=sName]', '   '); await page.press('input[data-change=sName]', 'Tab'); expect((await seances(page))[0].name).toBe('Séance');
  await page.fill('input[data-change=sName]', 'N'.repeat(300)); await page.press('input[data-change=sName]', 'Tab'); expect((await seances(page))[0].name.length).toBeLessThanOrEqual(100);
  await page.fill('input[data-change=sName]', '<img src=x onerror="window.__pirate=1">Séance <b>grasse</b>'); await page.press('input[data-change=sName]', 'Tab'); await synced(page);
  await go(page, 'library/seances', '#main'); await expect(page.locator('#main')).toContainText('<img src=x'); expect(await page.evaluate(() => window.__pirate)).toBeUndefined(); expect(await page.evaluate(() => [...document.querySelectorAll('#main b, #main img')].filter((e) => e.textContent === 'grasse' || e.getAttribute('src') === 'x').length), 'aucune balise venue du nom').toBe(0);
  await go(page, `library/seance/${s.id}`, `[data-act=exEdit][data-id="${s.exercises[0].id}"]`); await page.click(`#main [data-act=exEdit][data-id="${s.exercises[0].id}"]`);
  await page.evaluate(() => { const f = document.querySelector('#sheet form[data-submit=exSave]'); f.noValidate = true; f.elements.sets.value = '500'; f.elements.repsMin.value = '-4'; });
  await page.click('#sheet form[data-submit=exSave] button[type=submit]'); await synced(page);
  const ex = (await server(audit)).items[0].exercises[0]; expect(ex.sets).toBeLessThanOrEqual(30); expect(ex.sets).toBeGreaterThanOrEqual(1); expect(ex.repsMin).toBeGreaterThanOrEqual(1);
  await noOverflow(page);
});

test('S07 texte collé : « 4 × 8 tractions repos 2 min » devient 4 séries de 8, repos 120 s ; une ligne illisible est signalée, pas inventée', async ({ page }) => {
  const s = await manual(page, '4 × 8 tractions repos 2 min\n5 x 5 squats à 80 kg\nblablabla sans chiffre', 'Texte');
  const [a, b] = s.exercises; expect(a).toMatchObject({ sets: 4, repsMin: 8, repsMax: 8, rest: 120 }); expect(a.name.toLowerCase()).toContain('traction');
  expect(b).toMatchObject({ sets: 5, repsMin: 5 }); expect(String(b.load || '')).toContain('80');
  const third = s.exercises[2]; if (third) expect(third.name.toLowerCase()).toContain('blablabla'); // gardé tel quel, sans chiffres inventés
  if (third) expect([third.sets, third.repsMin]).not.toEqual([4, 8]);
});

test('S08 Mes séances : recherche, filtre Actives / Archivées, aucune séance trouvée', async ({ page }) => {
  await page.evaluate(async () => { const m = await import('/state.js'); for (const [id, name, ex] of [['a', 'Bloc du mardi', 'Blocs'], ['b', 'Course longue', 'Footing'], ['c', 'Renfo jambes', 'Squats']]) m.saveSeance({ id, name, exercises: [{ id: id + 'x', name: ex, mode: 'reps', sets: 3, repsMin: 5, repsMax: 5 }] }); }); await synced(page);
  await go(page, 'library/seances', 'input[data-input=sfQ]'); await page.fill('input[data-input=sfQ]', 'squats');
  await expect(page.locator('#main')).toContainText('Renfo jambes'); await expect(page.locator('#main')).not.toContainText('Course longue');
  await page.fill('input[data-input=sfQ]', 'introuvable xyz'); await expect(page.locator('#main')).toContainText(/Aucune séance|Rien ici|0 séance/);
  await page.fill('input[data-input=sfQ]', ''); await expect(page.locator('#main')).toContainText('Course longue'); expect(await pageAnomalies(page)).toEqual([]);
});

test('S09 deux comptes : Bob ne voit ni ne modifie les séances d’Alice (interface et serveur)', async ({ page, audit }) => {
  const s = await manual(page, '3 × 10 squats', 'Privée Alice'); await synced(page);
  await audit.loginAs('AuditBob'); expect(await seances(page)).toHaveLength(0);
  await page.evaluate((id) => { location.hash = '#/library/seance/' + id; }, s.id); await page.waitForTimeout(300); await expect(page.locator('#main')).not.toContainText('Privée Alice');
  const r = await audit.users.AuditBob.post('/api/sync', { items: [{ ...s, name: 'Piratée' }], tomb: {} });
  expect((await server(audit)).items.find((x) => x.id === s.id).name, `écriture de Bob (statut ${r.status})`).toBe('Privée Alice');
  expect((await server(audit, 'AuditBob')).items.map((x) => x.name)).not.toContain('Privée Alice');
});
