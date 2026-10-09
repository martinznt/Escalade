// tests/audit/agenda.spec.mjs — calendrier : rendez-vous simple (créer, déplacer, supprimer avec annulation),
// série répétée (annuler une occurrence, arrêter la répétition, supprimer la série), export .ics, abonnement iCal.
// Les dates sont calculées dans le fuseau de Paris (celui du navigateur de test et de l'app).
import { test, expect, go, loaded, synced, confirm, cancel, seedRealistic, day, toastSeen } from './fixtures.mjs';
import { agendaEvents } from '../../public/agenda.js';

const events = (page) => page.evaluate(async () => JSON.parse(JSON.stringify((await import('/state.js')).S.events)));
const onServer = async (audit) => (await audit.users.AuditAlice.get('/api/calendar')).data.events;
const occurrences = (page, d) => page.evaluate(async (d) => { const { S } = await import('/state.js'); return (await import('/agenda.js')).agendaEvents(S.events, d).map((e) => ({ id: e.sourceId, title: e.title, time: e.time, status: e.meta?.status || '' })); }, d);
async function openDay(page, d) {
  await go(page, 'home/cal', '.cal');
  for (let i = 0; i < 14 && !(await page.locator(`[data-act=calDay][data-id="${d}"]`).count()); i++) {
    const cur = await page.evaluate(async () => { const c = (await import('/state.js')).S.cal; return c.y + '-' + String(c.m + 1).padStart(2, '0'); });
    await page.click(`[data-act=calMove][data-id="${d.slice(0, 7) < cur ? -1 : 1}"]`);
  }
  await page.click(`[data-act=calDay][data-id="${d}"]`); await page.waitForSelector('#sheet.open');
}
async function planSingle(page, d, time) {
  await go(page, 'home/dash', '[data-act=agendaPlan]'); await page.click('[data-act=agendaPlan]'); await page.waitForSelector('form[data-submit=agendaSave]');
  await page.fill('form[data-submit=agendaSave] [name=date]', d); await page.fill('form[data-submit=agendaSave] [name=place]', 'Salle Audit');
  const opts = page.getByText('Heure, durée, rappel et autres options', { exact: true }); if (await opts.count()) await opts.click();
  await page.fill('form[data-submit=agendaSave] [name=time]', time); await page.click('form[data-submit=agendaSave] button[type=submit]');
  await expect(page.locator('#toast')).toContainText('Planning enregistré'); await synced(page);
}

test('C01 rendez-vous simple : créer, déplacer à 19 h 15, « Annuler » la suppression puis supprimer', async ({ page, audit }) => {
  const d = day(3); await planSingle(page, d, '18:30');
  let ev = await events(page); expect(ev).toHaveLength(1); expect(ev[0]).toMatchObject({ date: d, time: '18:30', recurrence: null }); expect(ev[0].title).toContain('Salle Audit');
  expect((await onServer(audit)).map((e) => [e.date, e.time])).toEqual([[d, '18:30']]);
  await openDay(page, d); await page.click('#sheet [data-act=agendaEdit]'); await page.fill('#sheet [name=time]', '19:15'); await page.click('#sheet form[data-submit=agendaEditSave] button[type=submit]'); await synced(page);
  // Le serveur garde la ligne d'origine et la modification ; ce qui compte : une seule occurrence, à 19 h 15, partout.
  await page.reload(); await loaded(page); expect((await occurrences(page, d)).map((o) => o.time)).toEqual(['19:15']); expect(agendaEvents(await onServer(audit), d).map((e) => e.time)).toEqual(['19:15']);
  await openDay(page, d); await page.click('#sheet [data-act=agendaEdit]'); await page.click('#sheet [data-act=agendaDelete]'); await expect(page.locator('#dialog.open')).toContainText('Supprimer'); await cancel(page); await synced(page);
  expect(agendaEvents(await onServer(audit), d)).toHaveLength(1);
  await page.click('#sheet [data-act=agendaDelete]'); await confirm(page); await expect(page.locator('#toast')).toContainText('Supprimé du planning'); await synced(page);
  expect(await onServer(audit)).toHaveLength(0); await page.reload(); await loaded(page); expect(await occurrences(page, d)).toEqual([]);
});

test('C02 série mardi + vendredi : annuler une occurrence, arrêter la répétition, supprimer la série', async ({ page, audit }) => {
  const dates = await page.evaluate(async () => { const m = await import('/agenda.js'), t = m.dayInZone(Date.now(), 'Europe/Paris'); let tue = m.shiftDay(t, 1); while (m.weekday(tue) !== 2) tue = m.shiftDay(tue, 1); return { tue, fri: m.shiftDay(tue, 3), tue2: m.shiftDay(tue, 7), fri2: m.shiftDay(tue, 10), tue3: m.shiftDay(tue, 14) }; });
  await go(page, 'home/dash', '[data-act=agendaPlan]'); await page.click('[data-act=agendaPlan]'); await page.waitForSelector('form[data-submit=agendaSave]');
  await page.fill('form[data-submit=agendaSave] [name=date]', dates.tue); for (const v of ['2', '5']) await page.check(`form[data-submit=agendaSave] [name=days][value="${v}"]`);
  await page.click('form[data-submit=agendaSave] button[type=submit]'); await synced(page);
  for (const d of [dates.tue, dates.fri, dates.tue2, dates.fri2, dates.tue3]) expect((await occurrences(page, d)).length, d).toBe(1);
  // « Annuler cette occurrence » (vendredi) : seul ce jour est annulé.
  await openDay(page, dates.fri); await page.click('#sheet [data-act=agendaEdit]'); await page.click('#sheet [data-act=agendaCancel]'); await synced(page); await page.reload(); await loaded(page);
  expect((await occurrences(page, dates.fri)).map((o) => o.status)).toEqual(['cancelled']); expect((await occurrences(page, dates.tue2)).map((o) => o.status)).toEqual(['']);
  // « Arrêter la répétition à partir de cette occurrence » (2e vendredi), avec confirmation.
  await openDay(page, dates.fri2); await page.click('#sheet [data-act=agendaEdit]'); await page.click('#sheet [data-act=agendaStop]'); await confirm(page); await synced(page); await page.reload(); await loaded(page);
  expect(await occurrences(page, dates.fri2)).toEqual([]); expect(await occurrences(page, dates.tue3)).toEqual([]); expect((await occurrences(page, dates.tue2)).length).toBe(1);
  // Supprimer toute la série.
  await openDay(page, dates.tue); await page.click('#sheet [data-act=agendaEdit]'); await page.click('#sheet [data-act=agendaDelete]'); await expect(page.locator('#dialog.open')).toContainText('toute la série'); await confirm(page); await synced(page);
  expect(await onServer(audit)).toEqual([]); for (const d of [dates.tue, dates.tue2]) expect(await occurrences(page, d)).toEqual([]);
});

test('C03 export .ics : fichier valide, rendez-vous à 18 h 30, série hebdomadaire, rien d’annulé', async ({ page }) => {
  await seedRealistic(page); await go(page, 'home/cal', '[data-act=icsExport]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act=icsExport]').first().click()]);
  const ics = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
  expect(dl.suggestedFilename()).toBe('seances.ics'); expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true); expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  const vevents = ics.split('BEGIN:VEVENT').length - 1; expect(vevents).toBeGreaterThan(10); // un rendez-vous + ~2 par semaine sur 90 jours
  expect(ics).toContain(`DTSTART:${day(1).replaceAll('-', '')}T183000`); expect(ics).toMatch(/SUMMARY:Bloc · Salle de bloc/);
  for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8'), 'lignes de 75 octets au plus (RFC 5545)').toBeLessThanOrEqual(75);
  await toastSeen(page, /exportée/);
});

test('C04 abonnement iCal : lien secret lisible sans compte, remplacé puis coupé', async ({ page, audit }) => {
  await seedRealistic(page); await go(page, 'home/cal', '[data-act=icalOpen]'); await page.locator('[data-act=icalOpen]').first().click();
  await page.click('#sheet [data-act=icalNew]'); const url = await page.locator('#sheet input[aria-label="Ton lien d’abonnement"]').inputValue();
  expect(url).toMatch(/\/ical\/[A-Za-z0-9_-]{20,}\.ics$/);
  const path = new URL(url).pathname, anon = new (await import('../helpers.mjs')).Client(audit.env);
  const r = await anon.get(path), feed = await r.res.text(); expect(r.status).toBe(200); expect(r.res.headers.get('content-type')).toMatch(/text\/calendar/);
  expect(feed).toContain('BEGIN:VCALENDAR'); expect(feed).toContain('Bloc · Salle de bloc'); expect(feed).not.toMatch(/AuditAlice|motdepasse/);
  // Le nouveau lien arrive après la réponse du serveur : on attend qu'il s'affiche (sinon le test lit l'ancien).
  await page.click('#sheet [data-act=icalNew]'); await expect(page.locator('#sheet input[aria-label="Ton lien d’abonnement"]')).not.toHaveValue(url); const url2 = await page.locator('#sheet input[aria-label="Ton lien d’abonnement"]').inputValue();
  expect((await anon.get(path)).status, 'l’ancien lien ne marche plus').not.toBe(200); expect((await anon.get(new URL(url2).pathname)).status).toBe(200);
  await page.click('#sheet [data-act=icalOff]'); await confirm(page); await expect(page.locator('#toast')).toContainText('Abonnement coupé');
  expect((await anon.get(new URL(url2).pathname)).status, 'lien coupé').not.toBe(200);
});

test('C05 abonnement iCal : un rendez-vous simple déplacé n’y figure qu’une fois, à sa nouvelle heure', async ({ page, audit }) => {
  const d = day(4); await planSingle(page, d, '18:30');
  await openDay(page, d); await page.click('#sheet [data-act=agendaEdit]'); await page.fill('#sheet [name=time]', '19:15'); await page.click('#sheet form[data-submit=agendaEditSave] button[type=submit]'); await synced(page);
  const r = await audit.users.AuditAlice.post('/api/ical', {}); const feed = await (await audit.users.AuditAlice.get(new URL(r.data.url).pathname)).res.text();
  const stamp = d.replaceAll('-', ''), events = feed.split('BEGIN:VEVENT').slice(1);
  expect(events.filter((e) => e.includes('Salle Audit') || e.includes('Escalade')).length, 'un seul événement pour ce rendez-vous').toBe(1);
  expect(feed).toContain(`${stamp}T191500`); expect(feed).not.toContain(`DTSTART:${stamp}T183000`);
});
