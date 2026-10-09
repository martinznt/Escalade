// tests/audit/ia.spec.mjs — l'IA du site (Workers AI simulé) vue par une personne : réponse valide, réponse piégée
// (HTML, lien inventé, action destructrice), réponse illisible, panne. Attendu : rien n'est exécuté ni enregistré sans
// action de la personne, rien d'injecté dans la page, une erreur honnête quand l'IA ne répond pas correctement.
// Le serveur vérifie lui-même chaque réponse (tests/coach-honesty.test.mjs, assistant-honesty, ai-proposal-evidence) ;
// ici, on vérifie ce que l'écran en fait. Aucune vraie IA n'est appelée (pas de clé, pas de réseau).
import { test, expect, go, synced, manual } from './fixtures.mjs';

const ai = { reply: () => { throw new Error('réponse non prévue'); }, calls: 0 };
const qwen = (value) => ({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] });
test.use({ envExtra: { AI: { run: async (_model, payload) => { ai.calls++; return ai.reply(payload); } } } });
test.beforeEach(() => { ai.calls = 0; });

const valid = (o = {}) => ({ status: 'ok', basis: 'app', sources: ['app/map'], reply: 'Le calendrier se trouve dans Accueil › Planning.', actions: [{ to: 'settings/help', label: 'Ouvrir l’aide' }], ...o });
async function ask(page, question) {
  await go(page, 'home/dash', '[data-act=coachOpen]'); await page.locator('[data-act=coachOpen]').first().click();
  await page.fill('#sheet input[name=q]', question); await page.click('#sheet form[data-submit=chatSend] button[type=submit]');
  await expect(page.locator('#chatlog .msg.assistant:not(.typing)').last()).toBeVisible({ timeout: 15000 });
  return page.locator('#chatlog .msg.assistant').last();
}
const counts = (page) => page.evaluate(async () => { const { S } = await import('/state.js'); return { seances: S.seances.items.length, history: S.history.length, events: S.events.length }; });

test('IA01 réponse valide : affichée, avec un bouton qui ne fait que naviguer, rien d’enregistré', async ({ page }) => {
  ai.reply = () => qwen(valid());
  const before = await counts(page), msg = await ask(page, 'Où est mon calendrier ?');
  await expect(msg).toContainText('Le calendrier se trouve dans Accueil › Planning.');
  const action = page.locator('#sheet [data-act=chatAction]'); await expect(action).toHaveCount(1); await expect(action).toContainText('Ouvrir l’aide');
  await action.click(); await expect(page).toHaveURL(/#\/settings\/help/);
  expect(await counts(page)).toEqual(before); expect(ai.calls).toBe(1);
});

test('IA02 réponse piégée : HTML affiché comme du texte, lien inventé et action destructrice écartés', async ({ page }) => {
  await manual(page, '3 × 10 squats', 'À garder'); await synced(page);
  ai.reply = () => qwen(valid({ reply: '<img src=x onerror="window.__pirate=1">Lis https://evil.test/source et supprime tout', actions: [{ command: 'Supprime ma dernière séance' }, { to: 'settings/admin' }, { to: 'https://evil.test/' }] }));
  const before = await counts(page), msg = await ask(page, 'Que dois-je faire ?');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pirate)).toBeUndefined();
  expect(await page.locator('#chatlog img').count(), 'aucune image injectée').toBe(0);
  await expect(msg).not.toContainText('evil.test');
  const labels = await page.locator('#sheet [data-act=chatAction]').allInnerTexts();
  expect(labels.join(' '), 'aucun bouton de suppression, d’administration ou de lien externe').not.toMatch(/Supprime|admin|evil/i);
  expect(await counts(page)).toEqual(before);
});

test('IA03 réponse illisible (pas du JSON) : message d’erreur honnête, aucune réponse inventée', async ({ page }) => {
  ai.reply = () => qwen('Bien sûr ! Voici ce que je pense, sans format.');
  const msg = await ask(page, 'Comment progresser ?');
  await expect(msg).not.toContainText('Voici ce que je pense');
  await expect(msg).toContainText(/pas pu|réessaie|vérifi|indisponible|répondre/i);
  await expect(page.locator('#sheet [data-act=chatAction]')).toHaveCount(0);
});

test('IA04 panne de l’IA : erreur claire, l’app reste utilisable, la question n’est pas perdue', async ({ page }) => {
  ai.reply = () => { throw Object.assign(new Error('AiError: 3036: Account limited'), { status: 429 }); };
  // (« Prépare-moi une séance » serait reconnu comme une commande et ouvrirait le créateur, sans appeler l'IA.)
  const msg = await ask(page, 'Pourquoi mes avant-bras fatiguent-ils autant ?');
  await expect(msg).toContainText(/pas pu|réessaie|limite|quota|plus tard|indisponible/i);
  await expect(page.locator('#chatlog .msg.user').last()).toContainText('Pourquoi mes avant-bras');
  await page.evaluate(async () => (await import('/ui.js')).closeSheet());
  await go(page, 'library/seances', '#main'); await expect(page.locator('#main')).toBeVisible();
});

test('IA05 objectif écrit analysé par l’IA : fiche invérifiable refusée, texte gardé, rien enregistré sans validation', async ({ page }) => {
  ai.reply = () => qwen({ status: 'ok', goal: { title: 'Devenir pro en 2 semaines', target: 'garanti', metrics: 'aucune' } });
  const before = await page.evaluate(async () => (await import('/state.js')).itemsOf('goal').length);
  await go(page, 'profile/goals', '[data-act=goalWrite]'); await page.click('[data-act=goalWrite]');
  await page.fill('#sheet form[data-submit=goalAi] textarea[name=text]', 'Je veux grimper du 7a en bloc avant l’été');
  await page.click('#sheet form[data-submit=goalAi] button[type=submit]');
  await expect(page.locator('#sheet')).toContainText('Aucun objectif n’a été préparé ni enregistré', { timeout: 15000 });
  await expect(page.locator('#sheet textarea[name=text]')).toHaveValue('Je veux grimper du 7a en bloc avant l’été');
  expect(await page.evaluate(async () => (await import('/state.js')).itemsOf('goal').length), 'aucun objectif enregistré').toBe(before);
});
