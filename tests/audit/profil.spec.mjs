// tests/audit/profil.spec.mjs — profil : pesée complète et indices calculés (vérifiés à la main), valeurs
// impossibles refusées, mensurations, zones à ménager réellement prises en compte par le générateur.
import { test, expect, go, loaded, synced, seedRealistic, setInterface, pageAnomalies } from './fixtures.mjs';

const perfs = (page) => page.evaluate(async () => (await import('/state.js')).itemsOf('perf'));

test('P01 pesée complète 72,5 kg et 15 % de gras, taille 178 cm : IMC 22,9, masse maigre 61,6 kg, gras 10,9 kg, FFMI 19,4', async ({ page, audit }) => {
  await setInterface(page, 'advanced');
  await go(page, 'profile/body', '[data-act=measureAll]'); await page.click('[data-act=measureAll]'); await page.fill('#sheet [name=taille_corps]', '178'); await page.click('#sheet form[data-submit=bodySaveMany] button');
  await page.click('[data-act=weighFull]'); await page.fill('#sheet [name=body_weight]', '72,5'); await page.fill('#sheet [name=masse_grasse]', '15'); await page.click('#sheet form[data-submit=bodySaveMany] button');
  await expect(page.locator('#toast')).toContainText('2 mesures enregistrées'); await synced(page); await page.reload(); await loaded(page);
  await go(page, 'profile/body', '#main');
  // 72,5 / 1,78² = 22,88 ; 72,5 × 0,85 = 61,625 ; 72,5 − 61,625 = 10,875 ; 61,625 / 1,78² = 19,449…
  const text = await page.locator('#main').innerText();
  for (const expected of ['IMC (indice de masse corporelle) : 22,9 (entre 18,5 et 25)', 'Masse maigre (calculée) : 61,6 kg', 'Masse grasse en kilos : 10,9 kg', 'Indice de masse maigre (FFMI) : 19,4']) expect.soft(text, expected).toContain(expected);
  const server = (await audit.users.AuditAlice.get('/api/items')).data.items.filter((i) => i.c === 'perf' && !i.del).map((i) => [i.d.metricId, i.d.value]).sort();
  expect(server).toEqual([['body_weight', 72.5], ['masse_grasse', 15], ['taille_corps', 178]]);
  expect(await pageAnomalies(page)).toEqual([]);
});

test('P02 valeurs impossibles refusées avec un message clair, rien n’est enregistré', async ({ page }) => {
  await setInterface(page, 'advanced'); await go(page, 'profile/body', '[data-act=weighFull]');
  for (const [field, value, message] of [['body_weight', '500', 'Poids entre 25 et 300 kg.'], ['masse_grasse', '95', 'Masse grasse entre 2 et 70 %.'], ['body_weight', '-3', 'Poids entre 25 et 300 kg.']]) {
    await page.click('[data-act=weighFull]'); await page.fill(`#sheet [name=${field}]`, value); await page.click('#sheet form[data-submit=bodySaveMany] button');
    await expect(page.locator('#toast')).toContainText(message); await page.evaluate(async () => (await import('/ui.js')).closeSheet());
  }
  await page.click('[data-act=weighFull]'); await page.click('#sheet form[data-submit=bodySaveMany] button'); await expect(page.locator('#toast')).toContainText('Remplis au moins une valeur');
  expect(await perfs(page)).toEqual([]);
  await page.evaluate(async () => (await import('/ui.js')).closeSheet());
  await page.click('[data-act=measureAll]'); await page.fill('#sheet [name=tour_bras]', '0'); await page.click('#sheet form[data-submit=bodySaveMany] button'); await expect(page.locator('#toast')).toContainText('valeur invalide');
  expect(await perfs(page)).toEqual([]);
});

test('P03 zones à ménager : doigts cochés → aucun exercice qui charge les doigts, en escalade comme en renforcement', async ({ page }) => {
  await seedRealistic(page); await setInterface(page, 'advanced');
  const generate = async (activityId) => {
    await page.evaluate(async (activityId) => { const { S } = await import('/state.js'); S.gen = { ...(S.gen || {}), activityId, plan: null, result: null, seed: 7 }; location.hash = '#/library/generate'; (await import('/state.js')).render(); }, activityId);
    await page.waitForSelector('[data-act=genPlan]'); await page.click('[data-act=genPlan]'); await page.click('[data-act=genDo]'); await page.waitForSelector('#genresult');
    return page.evaluate(async () => { const { S } = await import('/state.js'), { LIBRARY } = await import('/library.js'); const risk = Object.fromEntries(LIBRARY.map((x) => [x.name.toLowerCase(), x.risk || ''])); const s = S.gen.result.session; return { names: s.exercises.map((e) => e.name), risky: s.exercises.filter((e) => risk[e.name.toLowerCase()] === 'finger').map((e) => e.name), explain: JSON.stringify(s.explain || {}) }; });
  };
  await go(page, 'profile/prefs', 'form[data-submit=avoidSave] [name=fingers]'); await page.check('form[data-submit=avoidSave] [name=fingers]'); await page.click('form[data-submit=avoidSave] button[type=submit]'); await synced(page);
  await page.reload(); await loaded(page); expect(await page.evaluate(async () => (await import('/state.js')).S.settings.avoid?.fingers)).toBe(true);
  for (const activityId of ['climbing_boulder', 'conditioning']) {
    const r = await generate(activityId);
    expect(r.names.length, activityId + ' : des exercices proposés').toBeGreaterThan(0);
    expect(r.risky, activityId + ' : exercices qui chargent les doigts').toEqual([]);
    if (!/doigts/i.test(r.explain)) test.info().annotations.push({ type: 'constat', description: `${activityId} : l’explication « Pourquoi cette séance ? » ne dit pas que les doigts ont été ménagés` });
  }
});
