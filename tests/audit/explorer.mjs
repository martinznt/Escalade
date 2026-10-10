// tests/audit/explorer.mjs — outils communs aux explorateurs automatiques (boutons, formulaires) : compteurs
// d'effets hors page, signature de ce qu'une personne voit, liste des contrôles visibles, remise en état entre deux
// essais (fenêtres, lecteur, chrono, visite refermés ; reconnexion si un essai a déconnecté le compte) et essai d'un clic.
import { loaded } from './fixtures.mjs';

/** Compteurs d'effets « hors page » (copie, partage, voix, vibration, impression, fenêtre, notification) et messages. */
export const FX_SCRIPT = `(() => {
  const fx = window.__fx = { clip: 0, share: 0, speak: 0, vibrate: 0, print: 0, open: 0, notif: 0, toast: 0, nativeDialog: 0 };
  try { if (navigator.clipboard) { navigator.clipboard.writeText = async () => { fx.clip++; }; navigator.clipboard.write = async () => { fx.clip++; }; } } catch (e) {}
  try { navigator.share = async () => { fx.share++; }; navigator.canShare = () => true; } catch (e) {}
  try { if (window.speechSynthesis) window.speechSynthesis.speak = () => { fx.speak++; }; } catch (e) {}
  try { navigator.vibrate = () => { fx.vibrate++; return true; }; } catch (e) {}
  window.print = () => { fx.print++; };
  window.open = () => { fx.open++; return null; };
  try { if (window.Notification) Notification.requestPermission = async () => { fx.notif++; return 'denied'; }; } catch (e) {}
  addEventListener('DOMContentLoaded', () => { const t = document.getElementById('toast'); if (t) new MutationObserver(() => { if (t.textContent) fx.toast++; }).observe(t, { childList: true, characterData: true, subtree: true }); });
})();`;

/** Signature de ce qu'une personne voit et de l'état des données : deux signatures différentes = un effet. */
export const SIGNATURE = async () => {
  const hash = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = (x * 33 + s.charCodeAt(i)) | 0; return x; };
  const text = (sel) => { const el = document.querySelector(sel); return el ? hash(el.innerText || '') : 0; };
  const m = await import('/state.js'), S = m.S;
  const acts = [...document.querySelectorAll('#main [data-act]')].map((e) => e.dataset.act + (e.dataset.id || '') + (e.getAttribute('aria-pressed') || '') + (e.getAttribute('aria-checked') || '') + e.className).join('|');
  return {
    hash: location.hash, sheet: document.querySelector('#sheet.open') ? text('#sheet') + ':' + hash([...document.querySelectorAll('#sheet [data-act], #sheet input, #sheet select, #sheet textarea')].map((e) => (e.dataset.act || e.name || '') + (e.getAttribute('aria-pressed') || '') + (e.getAttribute('aria-checked') || '') + e.className + (e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value || '')).join('|')) : null, dialog: document.querySelector('#dialog.open') ? (document.querySelector('#dialog').innerText || '').slice(0, 160) : null,
    player: document.querySelector('#player.open') ? text('#player') : null, overlay: !!document.querySelector('#itimer, #grp.open, .lightbox, .fullscreen'),
    main: text('#main'), acts: hash(acts), details: document.querySelectorAll('#main details[open]').length, html: JSON.stringify(document.documentElement.dataset) + document.body.className,
    data: [S.outbox.length, S.dirtyItems.size, S.seancesVer, S.seances.items.length, S.history.length, S.events.length, [...S.items.values()].filter((i) => !i.del).length].join(','),
    counts: { seances: S.seances.items.length, history: S.history.length, events: S.events.length, items: [...S.items.values()].filter((i) => !i.del).length },
    fx: JSON.stringify(window.__fx || {}), user: S.user?.id || null,
  };
};
export const CANDIDATES = (scopes) => {
  const folded = (el) => { for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) if (!d.querySelector(':scope > summary')?.contains(el)) return true; return false; };
  const out = [], seen = {}, cut = (t, n) => Array.from(t).slice(0, n).join('');
  for (const scope of scopes) {
    for (const root of document.querySelectorAll(scope)) {
      for (const el of root.querySelectorAll('[data-act], input[type=checkbox][data-change], input[type=radio][data-change], label:has(> input[type=file])')) {
        const r = el.getBoundingClientRect(), st = getComputedStyle(el);
        if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none' || folded(el) || el.closest('.hidden') || el.matches('.back')) continue; // .back : le fond qui ferme la fenêtre
        const sel = el.dataset.act ? `[data-act="${el.dataset.act}"]${el.dataset.id ? `[data-id="${CSS.escape(el.dataset.id)}"]` : ''}${el.dataset.v ? `[data-v="${CSS.escape(el.dataset.v)}"]` : ''}:not(.back)`
          : el.matches('label') ? `label:has(> input[type=file][data-change="${el.querySelector('input').dataset.change}"])` : `input[data-change="${el.dataset.change}"]${el.value ? `[value="${CSS.escape(el.value)}"]` : ''}`;
        const full = `${scope} ${sel}`, index = seen[full] = (seen[full] ?? -1) + 1;
        out.push({ sel: full, index, act: el.dataset.act || el.dataset.change || el.querySelector('input')?.dataset.change, label: cut((el.innerText || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' '), 50), disabled: el.disabled === true });
      }
    }
  }
  return out;
};

/** Prépare la page (liens externes bloqués et notés, effets comptés) et renvoie les outils d'exploration pour ce compte. */
export async function explorer({ page, context, audit, info, name }) {
  const base = new URL(audit.srv.base), external = [], other = { download: 0, chooser: 0, popup: 0 };
  await context.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.host === base.host || u.protocol === 'blob:' || u.protocol === 'data:') return r.continue(); external.push(u.origin + u.pathname); return r.abort(); });
  page.on('download', () => { other.download++; }); page.on('filechooser', () => { other.chooser++; });
  page.on('dialog', (d) => { d.dismiss().catch(() => {}); }); context.on('page', (p) => { other.popup++; p.close().catch(() => {}); });
  await context.addInitScript(FX_SCRIPT);
  let shots = 0;
  /** Lecteur, chrono, séance à plusieurs : refermés comme une personne le ferait (sans rien enregistrer). */
  const closeOverlays = async () => {
    for (let i = 0; i < 6; i++) {
      if (await page.locator('#dialog.open [data-dlg="1"]').count() && await page.locator('#player.open').count()) { await page.click('#dialog.open [data-dlg="1"]').catch(() => {}); continue; }
      if (await page.locator('#player.open [data-act=pDiscard]').count()) { await page.click('#player.open [data-act=pDiscard]').catch(() => {}); continue; }
      if (await page.locator('#player.open [data-act=pQuit]').count()) { await page.click('#player.open [data-act=pQuit]').catch(() => {}); continue; }
      if (await page.locator('#itimer [data-act=timerStop]').count()) { await page.click('#itimer [data-act=timerStop]').catch(() => {}); continue; }
      if (await page.locator('#grp [data-act=grpClose]').count()) { await page.click('#grp [data-act=grpClose]').catch(() => {}); continue; }
      break;
    }
    await page.evaluate(() => { document.querySelector('#itimer')?.remove(); document.querySelector('#grp')?.remove(); document.body.classList.remove('noscroll', 'grp-open'); }).catch(() => {});
  };
  const restore = async (route) => {
    if (!page.url().startsWith(audit.srv.base)) await page.goto(audit.srv.base + '/#/' + route).catch(() => {});
    await closeOverlays();
    await page.waitForSelector('nav.tabs, form[data-submit=login], [data-act=authPick]', { timeout: 8000 }).catch(() => {});
    const st = await page.evaluate(async () => { const { S } = await import('/state.js'); return { user: S.user?.id || null, demo: !!S.user?.demo }; }).catch(() => ({ user: null }));
    if (st.user !== audit.users[name].userId || st.demo) { await audit.loginAs(name, '#/' + route).catch(() => {}); await closeOverlays(); return; }
    await page.evaluate(async (route) => {
      // Visite guidée, modes « modifier les textes », « viser un élément », « Organiser », sélection : refermés.
      for (let i = 0; i < 3 && document.querySelector('#tour [data-act=tourEnd]'); i++) document.querySelector('#tour [data-act=tourEnd]').click();
      const st = await import('/state.js'); for (const k of ['textMode', 'pick', 'lay', 'sel']) if (st.S[k]) st.S[k] = null;
      for (let i = 0; i < 3 && document.querySelector('#dialog.open'); i++) document.querySelector('#dialog.open [data-dlg="0"]')?.click() || document.querySelector('#dialog .back')?.click();
      const ui = await import('/ui.js'); for (let i = 0; i < 3 && document.querySelector('#sheet.open'); i++) ui.closeSheet();
      const m = await import('/state.js'); if (location.hash !== '#/' + route) location.hash = '#/' + route; else m.render();
    }, route).catch(() => {});
    await page.waitForTimeout(120);
  };
  const open = async (key) => {
    const loc = page.locator(key.sel).nth(key.index);
    if (!(await loc.count())) return null;
    for (const d of (await loc.locator('xpath=ancestor::details[not(@open)]').all()).reverse()) await d.locator(':scope > summary').click().catch(() => {});
    return loc;
  };
  const tryClick = async (route, key, path) => {
    const before = await page.evaluate(SIGNATURE).catch(() => null), errs = audit.events.pageerrors.length, ext = external.length, oth = JSON.stringify(other);
    const loc = await open(key); if (!loc) return { outcome: 'absent après redessin' };
    if (key.disabled) return { outcome: 'désactivé' };
    try { await loc.click({ timeout: 2500 }); } catch (e) {
      // Preuve : capture et position de la fenêtre au moment de l'échec.
      const where = await loc.evaluate((el) => { const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), panel = el.closest('.panel'); return { rect: [r.left, r.top, r.width, r.height].map(Math.round), dessus: top?.outerHTML.slice(0, 100) || '', defilement: panel ? panel.scrollTop : window.scrollY, hauteur: innerHeight }; }).catch(() => null);
      const shot = info.outputPath(`non-cliquable-${++shots}.png`); await page.screenshot({ path: shot }).catch(() => {});
      return { outcome: 'impossible à cliquer', detail: (String(e.message).split('\n').find((l) => /intercepts|not visible|outside|detached|disabled/.test(l)) || String(e.message).split('\n')[0]).trim(), where, shot: shot.split('/').pop() };
    }
    await page.waitForTimeout(380); await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    const after = await page.evaluate(SIGNATURE).catch(() => null);
    const res = { outcome: 'sans effet visible', detail: '' };
    const newErr = audit.events.pageerrors.slice(errs);
    if (newErr.length) return { outcome: 'erreur JavaScript', detail: newErr.join(' | ').slice(0, 300) };
    if (!after) return { outcome: 'effet', detail: 'page rechargée ou quittée' };
    if (await page.locator('#main').innerText().then((t) => /n’a pas pu s’afficher/.test(t)).catch(() => false)) return { outcome: 'écran d’erreur', detail: (await page.locator('#main').innerText()).slice(0, 200) };
    const changed = before ? Object.keys(after).filter((k) => k !== 'counts' && JSON.stringify(after[k]) !== JSON.stringify(before[k])) : ['?'];
    if (external.length > ext) changed.push('lien externe ' + external.slice(ext).join(' '));
    if (JSON.stringify(other) !== oth) changed.push('navigateur ' + JSON.stringify(other));
    if (changed.length) { res.outcome = 'effet'; res.detail = changed.join(', '); }
    if (after.dialog) res.dialog = after.dialog;
    if (before && !before.dialog && !after.dialog) for (const k of ['seances', 'history', 'events', 'items']) if (after.counts[k] < before.counts[k]) { res.outcome = 'suppression sans confirmation'; res.detail += ` ${k} ${before.counts[k]}→${after.counts[k]}`; }
    res.sheetOpened = !!after.sheet && !before?.sheet;
    return res;
  };
  return { external, other, closeOverlays, restore, open, tryClick };
}
