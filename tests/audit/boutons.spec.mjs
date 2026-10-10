// tests/audit/boutons.spec.mjs — explorateur « chaque bouton » : sur chaque page (interface avancée, où tout est
// visible), chaque bouton est cliqué à son tour, puis chaque bouton des fenêtres qu'il ouvre (un niveau).
// Après chaque clic : erreur JavaScript ? écran d'erreur ? effet visible (page, fenêtre, message, téléchargement,
// partage, copie, voix…) ? données supprimées sans confirmation ? Les confirmations sont toujours refusées
// (« Annuler ») pour ne rien détruire ; les liens externes sont bloqués et notés.
// Échecs : erreur JavaScript, écran d'erreur, bouton visible impossible à cliquer. « Sans effet visible » et
// « suppression sans confirmation » sont listés pour être examinés un par un (pièce jointe explorateur.json).
import { test, expect, loaded, synced, seedRealistic, setInterface } from './fixtures.mjs';
import { CANDIDATES, explorer } from './explorer.mjs';
import { MEMBER_ROUTES, ADMIN_ROUTES } from './routes.mjs';

const GROUPS = { accueil: 'home/', bibliotheque: 'library/', profil: 'profile/', progres: 'progress/', parametres: 'settings/' };
const plans = [...Object.entries(GROUPS).map(([name, prefix]) => ({ name: `membre — ${name}`, role: 'membre', routes: MEMBER_ROUTES.filter((r) => r.startsWith(prefix) && !/inexistant/.test(r)) })),
  { name: 'administration', role: 'admin', routes: ADMIN_ROUTES.filter((r) => !/inexistant/.test(r)) }];

for (const plan of plans) {
  test(`chaque bouton — ${plan.name}`, async ({ page, context, audit }, info) => {
    test.setTimeout(45 * 60000); audit.allowPageErrors = true;
    const name = plan.role === 'admin' ? 'AuditAdmin' : 'AuditAlice';
    const { restore, open, tryClick } = await explorer({ page, context, audit, info, name }); // avant le chargement : effets comptés dès le départ
    if (plan.role === 'admin') { await audit.users.AuditBob.post('/api/bugs', { title: 'Le bouton Valider ne répond pas', description: 'Sur la page du calendrier.', page: 'home/cal' }); await audit.admin(name); }
    await audit.loginAs(name); await seedRealistic(page); await setInterface(page, 'advanced');
    await page.reload(); await loaded(page);
    const log = [], done = new Set();
    for (const route of plan.routes) {
      await test.step(route, async () => {
        await restore(route);
        const keys = (await page.evaluate(CANDIDATES, ['header.top', '#main', 'nav.tabs'])).filter((k) => !done.has(k.sel + '#' + k.index));
        for (const key of keys.slice(0, 90)) {
          done.add(key.sel + '#' + key.index); await restore(route);
          const r = await tryClick(route, key); log.push({ route, where: 'page', act: key.act, label: key.label, ...r });
          if (r.sheetOpened && !done.has('sheet:' + key.sel + '#' + key.index)) {
            done.add('sheet:' + key.sel + '#' + key.index);
            const inner = (await page.evaluate(CANDIDATES, ['#sheet'])).filter((k) => !done.has(`${key.act}>${k.sel}#${k.index}`));
            for (const k of inner.slice(0, 30)) {
              done.add(`${key.act}>${k.sel}#${k.index}`); await restore(route);
              const opener = await open(key); if (!opener) break;
              await opener.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(250);
              const r2 = await tryClick(route, k); log.push({ route, where: `fenêtre de « ${key.label || key.act} »`, act: k.act, label: k.label, ...r2 });
            }
          }
        }
      });
    }
    await restore(plan.routes[0]); await synced(page).catch(() => {});
    const by = (o) => log.filter((x) => x.outcome === o);
    await info.attach('explorateur.json', { body: JSON.stringify({ total: log.length, resume: Object.fromEntries([...new Set(log.map((x) => x.outcome))].map((o) => [o, by(o).length])), externes: [...new Set(external)], clics: log }, null, 2), contentType: 'application/json' });
    for (const bad of [...by('erreur JavaScript'), ...by('écran d’erreur'), ...by('impossible à cliquer')]) expect.soft(bad, `${bad.route} › ${bad.where} › ${bad.label || bad.act}`).toBeNull();
    expect(log.length, 'des boutons ont réellement été cliqués').toBeGreaterThan(10);
  });
}
