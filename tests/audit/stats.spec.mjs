// tests/audit/stats.spec.mjs — calculs affichés dans Progrès › Résumé, comparés à des valeurs calculées à la main
// d'après un historique connu (pas avec les fonctions de l'app : sinon le test ne prouverait rien).
// Définitions écrites dans l'app : « N derniers jours » = séances commencées dans les N × 24 h avant maintenant,
// comparées aux N jours d'avant ; séries = séries non marquées « non faite » ; ressenti = moyenne des ressentis
// donnés ; charge d'une semaine = Σ (minutes × ressenti) sur 7 × 24 h.
import { test, expect, go, synced, setInterface, pageAnomalies } from './fixtures.mjs';

const DAY = 86400000;
// [jours avant maintenant, minutes, ressenti (0 = non donné), séries faites, séries non faites]
const PLAN = [[1, 60, 3, 4, 1], [3, 45, 4, 3, 0], [6, 30, 2, 2, 2], [10, 90, 3, 5, 0], [20, 40, 0, 3, 0], [29.5, 50, 5, 2, 1], [30.5, 30, 3, 1, 0], [40, 30, 3, 1, 0], [50, 30, 3, 1, 0], [59, 30, 3, 1, 0]];
const EXPECTED = {
  7: { Séances: ['3', '▲ 200 %'], Minutes: ['135', '▲ 50 %'], Séries: ['9', '▲ 80 %'] },
  30: { Séances: ['6', '▲ 50 %'], Minutes: ['315', '▲ 163 %'], Séries: ['19', '▲ 375 %'] },
  90: { Séances: ['10', ''], Minutes: ['435', ''], Séries: ['23', ''] },
};

async function seedHistory(audit) {
  const now = Date.now();
  for (const [i, [ago, min, rpe, ok, ko]] of PLAN.entries()) {
    const sets = [...Array(ok)].map(() => ({ reps: 8, done: true })).concat([...Array(ko)].map(() => ({ reps: 8, done: false })));
    const r = await audit.users.AuditAlice.post('/api/history', { id: 'calc-' + i, sessionName: 'Calcul ' + i, startedAt: Math.round(now - ago * DAY), durationSeconds: min * 60, data: { rpe, activity: 'conditioning', exercises: [{ name: 'Tractions', sets }] } });
    if (r.status !== 200) throw new Error('historique ' + r.status);
  }
}
const kpis = (page) => page.locator('.kpis .kpi').evaluateAll((els) => Object.fromEntries(els.map((k) => [k.querySelector('span').innerText.replace(/^\S+\s/, '').trim(), [k.querySelector('b').innerText.trim(), (k.querySelector('i')?.innerText || '').trim()]])));

test('ST01 Résumé : séances, minutes, séries et écarts sur 7, 30 et 90 jours', async ({ page, audit }) => {
  await seedHistory(audit); await synced(page); await setInterface(page, 'advanced');
  await go(page, 'progress/summary', '.kpis');
  for (const days of [7, 30, 90]) {
    await page.click(`[data-act=benchDays][data-id="${days}"]`); await page.waitForTimeout(150);
    const shown = await kpis(page);
    for (const [label, [value, delta]] of Object.entries(EXPECTED[days])) expect.soft(shown[label], `${days} jours · ${label}`).toEqual([value, delta]);
    // Ressenti moyen : (3 + 4 + 2 + 3 + 5) / 5 = 3,4 sur 30 jours (la séance sans ressenti ne compte pas).
    if (days === 30) expect.soft(shown['Ressenti']?.[0], 'ressenti moyen sur 30 jours, écrit à la française').toMatch(/^3,4$/);
  }
  expect(await pageAnomalies(page)).toEqual([]);
});

test('ST02 Charge : 420 cette semaine, 270 la semaine d’avant, 0 sans ressenti', async ({ page, audit }) => {
  await seedHistory(audit); await synced(page); await setInterface(page, 'advanced');
  await go(page, 'progress/summary', '.stat');
  const card = page.locator('section.card', { has: page.locator('h3', { hasText: 'Charge' }) });
  const values = await card.locator('.stat').evaluateAll((els) => els.map((e) => [e.querySelector('span').innerText.trim(), e.querySelector('b').innerText.trim()]));
  expect(values).toEqual([['cette semaine', '420'], ['sem. −1', '270'], ['sem. −2', '0']]);
});

test('ST03 Historique : chaque séance faite apparaît une fois, avec sa durée ; une séance supprimée disparaît partout', async ({ page, audit }) => {
  await seedHistory(audit); await synced(page); await setInterface(page, 'advanced');
  await go(page, 'progress/history', '#main');
  const text = await page.locator('#main').innerText();
  for (const i of [0, 1, 3, 9]) expect.soft(text.split('Calcul ' + i).length - 1, `« Calcul ${i} » une seule fois`).toBe(1);
  expect(text).toMatch(/1 h|60 min/); expect(text).toMatch(/1 h 30|90 min/);
  await page.evaluate(async () => { (await import('/state.js')).deleteHistory('calc-0'); }); await synced(page);
  expect((await audit.users.AuditAlice.get('/api/history')).data.history.map((h) => h.id)).not.toContain('calc-0');
  await go(page, 'progress/summary', '.kpis'); await page.click('[data-act=benchDays][data-id="30"]');
  expect((await kpis(page))['Séances']).toEqual(['5', '▲ 25 %']);
});
