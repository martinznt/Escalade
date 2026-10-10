// tests/audit/formulaires.spec.mjs — explorateur « chaque formulaire » : sur chaque page (interface avancée) et dans
// chaque fenêtre ouverte depuis la page, chaque formulaire est rempli avec des valeurs plausibles puis envoyé, et chaque
// liste ou champ « changement » (data-change) reçoit une autre valeur. Après chaque essai : erreur JavaScript ? écran
// d'erreur ? message ? effet visible ? refus du navigateur (champ invalide) ? Les confirmations sont refusées.
// Jamais essayés : mots de passe (connexion, inscription, changement, activation admin), suppression du compte, et choix
// de fichier (impossible sans la personne). Échecs : erreur JavaScript, écran d'erreur. « Sans effet visible » et
// « refusé par le navigateur » sont listés pour être examinés un par un (pièce jointe formulaires.json).
import { test, expect, loaded, synced, seedRealistic, setInterface } from './fixtures.mjs';
import { CANDIDATES, SIGNATURE, explorer } from './explorer.mjs';
import { MEMBER_ROUTES, ADMIN_ROUTES } from './routes.mjs';

const SKIP_FORMS = ['login', 'register', 'chpass', 'delacct', 'adminOn'];

/** Formulaires et champs « changement » visibles dans les zones données (fichiers, cases et boutons radio exclus). */
const TARGETS = ([scopes, skip]) => {
  const folded = (el) => { for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) if (!d.querySelector(':scope > summary')?.contains(el)) return true; return false; };
  const shown = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && !folded(el); };
  const out = [], seen = {};
  for (const scope of scopes) for (const root of document.querySelectorAll(scope)) {
    for (const f of root.querySelectorAll('form[data-submit]')) {
      if (skip.includes(f.dataset.submit) || !shown(f) || f.querySelector('input[type=password], input[type=file]:required')) continue;
      const sel = `${scope} form[data-submit="${f.dataset.submit}"]`, index = seen[sel] = (seen[sel] ?? -1) + 1;
      out.push({ kind: 'formulaire', name: f.dataset.submit, sel, index });
    }
    for (const el of root.querySelectorAll('select[data-change], textarea[data-change], input[data-change]')) {
      if (el.matches('[type=file], [type=checkbox], [type=radio], [type=hidden]') || el.disabled || !shown(el)) continue;
      const sel = `${scope} [data-change="${el.dataset.change}"]`, index = seen[sel] = (seen[sel] ?? -1) + 1;
      out.push({ kind: 'champ', name: el.dataset.change, sel, index });
    }
  }
  return out;
};

/** Valeur plausible pour un champ vide (ou invalide), d'après son type, ses bornes et son nom. */
const FILL = (root) => {
  const today = new Date().toLocaleDateString('en-CA'), filled = [];
  const set = (el, v) => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); filled.push(el.name || el.type); };
  for (const el of root.querySelectorAll('input, textarea, select')) {
    if (el.disabled || el.readOnly || el.matches('[type=hidden], [type=file], [type=checkbox], [type=radio], [type=submit], [type=button], [type=password]')) continue;
    if (el.value && el.checkValidity()) continue;
    const n = (el.name || '').toLowerCase(), min = el.min !== '' ? Number(el.min) : null, max = el.max !== '' ? Number(el.max) : null;
    if (el instanceof HTMLSelectElement) { const o = [...el.options].find((x) => x.value && !x.disabled); if (o) set(el, o.value); continue; }
    const long = Math.max(Number(el.minLength) || 0, 0);
    let v = 'Essai audit';
    switch (el.type) {
      case 'number': case 'range': { let x = min ?? 3; if (max != null) x = Math.min(x, max); if (min != null && x < min) x = min; v = String(x); break; }
      case 'date': v = today; break;
      case 'time': v = '18:30'; break;
      case 'datetime-local': v = today + 'T18:30'; break;
      case 'month': v = today.slice(0, 7); break;
      case 'email': v = 'audit@exemple.fr'; break;
      case 'url': v = 'https://exemple.fr/audit'; break;
      case 'tel': v = '0600000000'; break;
      case 'color': v = '#3366cc'; break;
      default: v = el instanceof HTMLTextAreaElement || long > 11 ? 'Texte d’essai de l’audit automatique, assez long pour passer les contrôles de longueur.' : /pseudo|user/.test(n) ? 'AuditBob' : /grade|cot/.test(n) ? '6a' : 'Essai audit';
    }
    if (el.maxLength > 0) v = v.slice(0, el.maxLength);
    set(el, v);
  }
  return filled;
};

const GROUPS = { accueil: 'home/', bibliotheque: 'library/', profil: 'profile/', progres: 'progress/', parametres: 'settings/' };
const plans = [...Object.entries(GROUPS).map(([name, prefix]) => ({ name: `membre — ${name}`, role: 'membre', routes: MEMBER_ROUTES.filter((r) => r.startsWith(prefix) && !/inexistant/.test(r)) })),
  { name: 'administration', role: 'admin', routes: ADMIN_ROUTES.filter((r) => !/inexistant/.test(r)) }];

for (const plan of plans) {
  test(`chaque formulaire — ${plan.name}`, async ({ page, context, audit }, info) => {
    test.setTimeout(45 * 60000); audit.allowPageErrors = true;
    const name = plan.role === 'admin' ? 'AuditAdmin' : 'AuditAlice';
    const { restore, open, tryClick } = await explorer({ page, context, audit, info, name });
    if (plan.role === 'admin') { await audit.users.AuditBob.post('/api/bugs', { title: 'Le bouton Valider ne répond pas', description: 'Sur la page du calendrier.', page: 'home/cal' }); await audit.admin(name); }
    await audit.loginAs(name); await seedRealistic(page); await setInterface(page, 'advanced');
    await page.reload(); await loaded(page);
    const log = [], tried = new Set(), openers = new Set();

    /** Remplit et envoie un formulaire, ou donne une autre valeur à un champ ; renvoie ce qui s'est passé. */
    const attempt = async (t) => {
      const loc = await open(t); if (!loc) return { outcome: 'absent après redessin' };
      const before = await page.evaluate(SIGNATURE).catch(() => null), errs = audit.events.pageerrors.length, toasts = await page.evaluate(() => (window.__toasts || []).length).catch(() => 0);
      let detail = '', invalid = [];
      try {
        if (t.kind === 'formulaire') {
          detail = 'rempli : ' + ((await loc.evaluate(FILL)).join(', ') || 'rien (déjà rempli)');
          // Contrôlé avant l'envoi : un formulaire réussi se vide ensuite, ses champs obligatoires paraîtraient invalides.
          invalid = await loc.evaluate((f) => [...f.querySelectorAll(':invalid')].filter((x) => x.matches('input, select, textarea')).map((x) => `${x.name || x.type} (${x.validationMessage})`));
          const submit = loc.locator('button[type=submit], button:not([type]), input[type=submit]').filter({ visible: true }).first();
          if (await submit.count()) await submit.click({ timeout: 2500 }); else await loc.evaluate((f) => f.requestSubmit());
        } else {
          detail = await loc.evaluate((el) => {
            const today = new Date().toLocaleDateString('en-CA');
            let v;
            if (el instanceof HTMLSelectElement) { const opts = [...el.options].filter((o) => !o.disabled); v = (opts.find((o) => o.value !== el.value) || opts[0])?.value ?? ''; }
            else if (el.type === 'number' || el.type === 'range') { const min = el.min !== '' ? Number(el.min) : 1, max = el.max !== '' ? Number(el.max) : min + 10; v = String(Math.min(max, Math.max(min, (Number(el.value) || min) + (Number(el.step) || 1)))); }
            else if (el.type === 'date') v = today; else if (el.type === 'time') v = '19:15'; else v = 'Essai audit';
            const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
            Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'valeur : ' + v;
          });
        }
      } catch (e) { return { outcome: 'impossible à utiliser', detail: String(e.message).split('\n')[0].slice(0, 200) }; }
      await page.waitForTimeout(500); await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
      const newErr = audit.events.pageerrors.slice(errs);
      if (newErr.length) return { outcome: 'erreur JavaScript', detail: detail + ' — ' + newErr.join(' | ').slice(0, 300) };
      if (await page.locator('#main').innerText().then((x) => /n’a pas pu s’afficher/.test(x)).catch(() => false)) return { outcome: 'écran d’erreur', detail };
      const msgs = await page.evaluate((n) => (window.__toasts || []).slice(n), toasts).catch(() => []);
      const after = await page.evaluate(SIGNATURE).catch(() => null);
      const changed = before && after ? Object.keys(after).filter((k) => k !== 'counts' && JSON.stringify(after[k]) !== JSON.stringify(before[k])) : ['page rechargée'];
      const res = { detail };
      if (msgs.length) res.message = [...new Set(msgs)].join(' / ').slice(0, 200);
      if (after?.dialog) res.dialog = after.dialog;
      if (invalid.length) { res.outcome = 'refusé par le navigateur'; res.detail += ' — invalides : ' + invalid.join(', ').slice(0, 200); }
      else if (msgs.some((m) => /impossible|erreur|échec|n’a pas pu|refus/i.test(m))) res.outcome = 'message d’erreur';
      else if (msgs.length || changed.length) { res.outcome = 'effet'; res.detail += ' — ' + changed.join(', '); }
      else res.outcome = 'sans effet visible';
      if (before && after && !before.dialog && !after.dialog) for (const k of ['seances', 'history', 'events', 'items']) if (after.counts[k] < before.counts[k]) { res.outcome = 'suppression sans confirmation'; res.detail += ` ${k} ${before.counts[k]}→${after.counts[k]}`; }
      return res;
    };

    for (const route of plan.routes) {
      await test.step(route, async () => {
        await restore(route);
        // 1. Formulaires et champs de la page elle-même.
        for (const t of await page.evaluate(TARGETS, [['#main'], SKIP_FORMS])) {
          const key = `${t.name}#${t.index}@${route}`; if (tried.has(key)) continue; tried.add(key);
          await restore(route); log.push({ route, where: 'page', kind: t.kind, name: t.name, ...(await attempt(t)) });
        }
        // 2. Fenêtres ouvertes par les boutons de la page (chaque bouton une seule fois pour tout le parcours).
        const keys = (await page.evaluate(CANDIDATES, ['header.top', '#main'])).filter((k) => !k.disabled && !openers.has(k.sel.replace(/^\S+ /, '')));
        for (const key of keys.slice(0, 90)) {
          openers.add(key.sel.replace(/^\S+ /, '')); await restore(route);
          const r = await tryClick(route, key); if (!r.sheetOpened) continue;
          const inner = await page.evaluate(TARGETS, [['#sheet'], SKIP_FORMS]);
          for (const t of inner.slice(0, 25)) {
            const k2 = `${key.act}>${t.name}#${t.index}`; if (tried.has(k2)) continue; tried.add(k2);
            await restore(route); const opener = await open(key); if (!opener) break;
            await opener.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(250);
            log.push({ route, where: `fenêtre de « ${key.label || key.act} »`, kind: t.kind, name: t.name, ...(await attempt(t)) });
          }
        }
      });
    }
    await restore(plan.routes[0]); await synced(page).catch(() => {});
    const by = (o) => log.filter((x) => x.outcome === o);
    await info.attach('formulaires.json', { body: JSON.stringify({ total: log.length, resume: Object.fromEntries([...new Set(log.map((x) => x.outcome))].map((o) => [o, by(o).length])), essais: log }, null, 2), contentType: 'application/json' });
    for (const bad of [...by('erreur JavaScript'), ...by('écran d’erreur')]) expect.soft(bad, `${bad.route} › ${bad.where} › ${bad.name}`).toBeNull();
    expect(log.length, 'des formulaires ou des champs ont réellement été essayés').toBeGreaterThan(3);
  });
}
