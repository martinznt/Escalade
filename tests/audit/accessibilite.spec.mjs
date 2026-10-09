// tests/audit/accessibilite.spec.mjs — accessibilité : règles WCAG 2.1 A et AA vérifiées par axe-core sur chaque page
// (interface simple et avancée), clavier (tabulation, Entrée, Échap, retour du focus), focus visible, taille des cibles.
// Limites : axe ne remplace pas un vrai lecteur d'écran (VoiceOver, TalkBack) ni un jugement humain sur la clarté.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, go, ROOT, seedRealistic, setInterface } from './fixtures.mjs';
import { MEMBER_ROUTES } from './routes.mjs';

// L'outil axe est injecté par le test : la politique de sécurité du site (script-src 'self') le bloquerait, à raison.
test.use({ bypassCSP: true });
const AXE = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const PAGES = MEMBER_ROUTES.filter((r) => !/inexistant|settings\/admin/.test(r));

async function axe(page) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // Le message temporaire caché (opacité 0, en train de disparaître) n'est pas vu : il n'est pas contrôlé.
    const r = await window.axe.run({ exclude: [['#toast:not(.show)']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, exemples: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' — ' + (n.failureSummary || '').split('\n').slice(1, 2).join('')) }));
  });
}

for (const mode of ['simple', 'advanced']) {
  test(`AX01 règles WCAG 2.1 AA (axe) sur chaque page — interface ${mode === 'simple' ? 'simple' : 'avancée'}`, async ({ page }, info) => {
    test.setTimeout(240000);
    await seedRealistic(page); await setInterface(page, mode);
    const report = {};
    for (const route of PAGES) {
      await test.step(route, async () => {
        await go(page, route, '#main'); await page.waitForTimeout(250);
        const v = await axe(page); report[route] = v;
        const grave = v.filter((x) => ['critical', 'serious'].includes(x.impact));
        expect.soft(grave.map((x) => `${x.impact} ${x.id} (${x.nodes}) : ${x.help} — ${x.exemples[0] || ''}`), `${route} : violations graves`).toEqual([]);
      });
    }
    await info.attach('axe-par-page.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  });
}

test('AX02 clavier : tabulation jusqu’à la navigation, Entrée ouvre, Échap ferme, le focus revient au bouton', async ({ page }) => {
  await go(page, 'home/dash', '#main'); await page.evaluate(() => document.activeElement?.blur());
  let reached = false;
  for (let i = 0; i < 120 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => !!document.activeElement?.closest('nav.tabs')); }
  expect(reached, 'la navigation principale est atteignable au clavier').toBe(true);
  await page.locator('nav.tabs [data-id=library]').focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(async () => (await import('/state.js')).S.tab)).toBe('library');
  await go(page, 'home/dash', '[data-act=allOpen]'); const opener = page.locator('[data-act=allOpen]').first(); await opener.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#sheet.open')).toBeVisible(); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#sheet')), 'le focus entre dans la fenêtre').toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('#sheet.open')).toHaveCount(0);
  const back = await page.evaluate(() => ({ tag: document.activeElement?.tagName, act: document.activeElement?.dataset?.act || '' }));
  expect.soft(back.act, 'après Échap, le focus revient sur le bouton qui a ouvert la fenêtre (WCAG 2.4.3)').toBe('allOpen');
  expect(back.tag, 'le focus ne se perd pas tout en haut de la page').not.toBe('BODY');
});

test('AX03 focus visible : chaque bouton atteint au clavier montre où l’on est', async ({ page }) => {
  await go(page, 'home/dash', '#main');
  const missing = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const st = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const cs = getComputedStyle(el); return { el: `${el.tagName.toLowerCase()}[${el.dataset?.act || el.name || ''}]`, ok: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' }; });
    if (st && !st.ok) missing.push(st.el);
  }
  expect([...new Set(missing)], 'éléments sans contour de focus').toEqual([]);
});

test('AX04 taille des cibles tactiles : au moins 24 × 24 px (WCAG 2.2, 2.5.8) sur les pages principales', async ({ page }, info) => {
  await seedRealistic(page); await setInterface(page, 'advanced');
  const small = {};
  for (const route of ['home/dash', 'home/cal', 'library/seances', 'library/seance/s-renfo', 'profile/home', 'profile/body', 'progress/summary', 'settings/main', 'settings/display']) {
    await go(page, route, '#main'); await page.waitForTimeout(200);
    small[route] = await page.evaluate(() => [...document.querySelectorAll('#main button, #main [role=button], #main input[type=checkbox], #main input[type=radio], #main select, nav.tabs button, header.top button')].filter((el) => {
      const r = el.getBoundingClientRect(), st = getComputedStyle(el); if (!r.width || !r.height || st.visibility === 'hidden' || el.closest('details:not([open]) > :not(summary)')) return false;
      const target = el.matches('input') && el.closest('label') ? el.closest('label').getBoundingClientRect() : r;
      return target.width < 24 || target.height < 24;
    }).map((el) => `${el.tagName.toLowerCase()}[${el.dataset.act || el.name || el.innerText.trim().slice(0, 15)}] ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`));
  }
  await info.attach('cibles-petites.json', { body: JSON.stringify(small, null, 2), contentType: 'application/json' });
  for (const [route, list] of Object.entries(small)) expect.soft(list, `${route} : cibles trop petites`).toEqual([]);
});
