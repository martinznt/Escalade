// tests/audit/pages.spec.mjs — chaque page, membre puis administrateur, interface simple puis avancée, avec des
// données réalistes (la taille d'écran vient du profil Playwright : 320, 360, 390, Android, tablette, ordinateur).
// Attendu sur chaque page : pas d'erreur JavaScript, pas d'écran d'erreur, rien de cassé ni de coupé, rien de
// recouvert, des contrôles nommés (voir pageAnomalies dans fixtures.mjs). Un défaut n'arrête pas le tour : chaque
// page est notée à part (expect.soft) et le détail est joint au rapport.
import { test, expect, go, synced, seedRealistic, setInterface, pageAnomalies } from './fixtures.mjs';
import { MEMBER_ROUTES, ADMIN_ROUTES } from './routes.mjs';

/** Pages réservées que le site remplace par « Réservé aux administrateurs » pour un membre. */
const ADMIN_ONLY_VIEWS = ['settings/assistant', 'settings/content', 'settings/look', 'settings/changes', 'settings/members', 'settings/bugs', 'settings/users', 'settings/push'];

/** Affiche une page, attend la fin des chargements qu'elle lance, et renvoie ses défauts visibles. */
async function visit(page, audit, route) {
  const before = audit.events.pageerrors.length;
  await go(page, route, '#main'); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(250);
  const found = await pageAnomalies(page);
  for (const e of audit.events.pageerrors.slice(before)) found.push('erreur JavaScript : ' + e);
  return found;
}

for (const role of ['membre', 'admin']) {
  for (const mode of ['simple', 'advanced']) {
    test(`toutes les pages — ${role}, interface ${mode === 'simple' ? 'simple' : 'avancée'}`, async ({ page, audit }, info) => {
      test.setTimeout(240000); audit.allowPageErrors = true; // attribuées page par page ci-dessous
      // Un signalement et une proposition de Bob, pour que les pages d'administration aient du contenu.
      await audit.users.AuditBob.post('/api/bugs', { title: 'Le bouton Valider ne répond pas', description: 'Sur la page du calendrier, après avoir choisi une date.', page: 'home/cal' });
      if (role === 'admin') { await audit.admin('AuditAdmin'); await audit.loginAs('AuditAdmin'); }
      await seedRealistic(page); await setInterface(page, mode);
      const routes = role === 'admin' ? [...MEMBER_ROUTES, ...ADMIN_ROUTES] : [...MEMBER_ROUTES, ...ADMIN_ROUTES.map((r) => r + '#membre')];
      const report = {};
      for (const entry of routes) {
        const [route, asMember] = entry.split('#');
        await test.step(route + (asMember ? ' (adresse d’administration ouverte par un membre)' : ''), async () => {
          const found = await visit(page, audit, route);
          if (asMember) {
            // Un membre qui tape l'adresse d'une page d'administration ne voit aucune donnée d'un autre compte.
            const text = await page.locator('#main').innerText();
            for (const secret of ['AuditBob', 'Le bouton Valider ne répond pas']) if (text.includes(secret)) found.push(`donnée d’un autre compte visible : « ${secret} »`);
          }
          // Ce que la page doit montrer : l'administration a du contenu pour l'admin, et rien pour un membre.
          const expectText = role === 'admin' ? { 'settings/users': 'AuditBob', 'settings/bugs': 'Le bouton Valider ne répond pas' }[route] : asMember && ADMIN_ONLY_VIEWS.includes(route) ? 'Réservé aux administrateurs' : null;
          if (expectText && !(await page.locator('#main').innerText()).includes(expectText)) found.push(`attendu sur la page : « ${expectText} »`);
          report[route + (asMember ? ' (membre)' : '')] = found;
          expect.soft(found, `${route} : défauts visibles`).toEqual([]);
        });
      }
      await synced(page);
      await info.attach('defauts-par-page.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    });
  }
}

test('contrôle du contrôleur : chaque défaut injecté dans une page est bien détecté', async ({ page }) => {
  await go(page, 'home/dash', '#main');
  expect(await pageAnomalies(page), 'page saine au départ').toEqual([]);
  await page.evaluate(() => {
    const m = document.getElementById('main');
    m.insertAdjacentHTML('beforeend', '<div style="width:2000px;height:10px" class="trop-large"></div><button data-act="vide"></button><button aria-pressed="" data-act="etat">État</button>'
      + '<p>Total : undefined séances</p><span id="double"></span><span id="double"></span><select data-change="liste"><option>a</option></select><div role="progressbar" aria-valuenow="5"></div>'
      + '<div style="position:relative"><button data-act="cache" style="position:relative">Caché</button><div style="position:absolute;inset:0;background:#000" class="voile"></div></div>');
    document.querySelector('[data-act=cache]').scrollIntoView();
  });
  const found = (await pageAnomalies(page)).join('\n');
  for (const expected of [/défilement horizontal/, /sort de l’écran : /, /bouton sans nom : button\[vide\]/, /aria-pressed="" sur button\[etat\]/, /texte cassé : « .*undefined/, /identifiant en double : #double/, /champ sans nom : select/, /jauge sans nom/, /recouvert : button\[cache\] sous div\.voile/])
    expect(found, String(expected)).toMatch(expected);
});
