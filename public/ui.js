// ui.js — outils d'affichage : gabarits HTML échappés, feuilles (bottom sheets), confirmations, formats.
// RÈGLE : tout contenu passe par h`` qui échappe automatiquement ; raw() n'est utilisé que pour du HTML
// produit par h`` lui-même ou par des générateurs à coordonnées fixes (SVG anatomique, graphiques).

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v === false || v == null ? '' : esc(v));
const ARIA_ATTR = /\saria-[a-z]+="$/;
export const h = (strings, ...vals) => new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? (typeof vals[i] === 'boolean' && ARIA_ATTR.test(s) ? String(vals[i]) : val(vals[i])) : ''), ''));
const ICONS = {
  home: 'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
  progress: 'M4 4v16h16M7 14l4-5 4 3 5-7',
  library: 'M12 5v15M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1',
  profile: 'M12 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
  settings: 'M4 6h6m4 0h6M10 3v6M4 12h11m4 0h1M15 9v6M4 18h3m4 0h9M7 15v6',
  display: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10',
  session: 'M8 4l12 8-12 8z',
  notifs: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4M12 2v2',
  data: 'M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01',
  admin: 'M12 2l8 3v6c0 5-8 11-8 11S4 16 4 11V5zM8 11l3 3 5-5',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 1 0 0-15M16 16l5 5',
  all: 'M4 6h16M4 12h16M4 18h16',
  edit: 'M14 4l6 6M4 16 16 4l4 4L8 20H4z',
  easy: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
  big: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  contrast: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 2v20M5 6h7M3 10h9M3 14h9M5 18h7',
  cb: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3-5-5-9-5M7 10h.01M10 7h.01M15 7h.01',
};
/** Icônes de navigation : dessin commun et libellé porté par le bouton. */
export const icon = (name, fallback = '') => ICONS[name] ? h`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${ICONS[name]}"></path></svg>` : h`${fallback}`;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ───────── Formats ───────── */
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const tz = () => new Date().getTimezoneOffset();
export const fmtDate = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDay = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function relDate(t, now = Date.now()) {
  const d = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (d === 0) return 'aujourd’hui'; if (d === 1) return 'hier'; if (d === -1) return 'demain';
  if (d > 1 && d < 7) return `il y a ${d} jours`; if (d < -1 && d > -7) return `dans ${-d} jours`;
  return fmtDay(t);
}
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const frNum = (v) => String(v).replace('.', ',');
export const rng = (a, b) => (a === b ? frNum(a) : `${frNum(a)}–${frNum(b)}`);
export const fmtDur = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return m ? (r ? `${m} min ${r}` : `${m} min`) : `${r} s`; };
export const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.max(0, s) % 60)}`;
const secTxt = (a, b) => (a >= 120 ? (a === b ? fmtDur(a) : `${fmtDur(a)} à ${fmtDur(b)}`) : rng(a, b) + ' s');
const oneEach = (e) => e.mode !== 'time' && e.repsMax === 1 && e.repsMin === 1;
export const exLine = (e) => `${oneEach(e) && !e.unit && e.sets === 1 ? '1 fois' : oneEach(e) && /^\d/.test(e.unit || '') ? `${e.sets} × ${e.unit}${e.perSide ? ' / côté' : ''}` : oneEach(e) && /^\S+s(?=\s|$)/.test(e.unit || '') ? `${e.sets} ${e.sets > 1 ? e.unit : e.unit.replace(/^(\S+)s(?=\s|$)/, '$1')}` : `${e.sets === 1 && (e.mode === 'time' || e.unit) ? '' : e.sets + ' × '}${e.mode === 'time' ? secTxt(e.secMin, e.secMax) : rng(e.repsMin, e.repsMax) + (e.unit ? ' ' + e.unit : '')}${e.perSide ? ' / côté' : ''}`}${e.rest ? ' · repos ' + fmtDur(e.rest) : ''}${e.load ? ' · ' + e.load : ''}`;

/* ───────── Messages et feuilles ───────── */
// Un message reste au moins 1,8 s à l'écran avant d'être remplacé (sinon un « Nouveau badge » effaçait aussitôt
// « Séances exportées… ») ; le suivant attend son tour, seul le plus récent est gardé. Une erreur passe tout de suite.
let toastAt = 0;
export function toast(msg, ms = 2800, kind = '') {
  const t = $('#toast'); if (!t) return;
  const wait = t.classList.contains('show') && kind !== 'bad' ? toastAt + 1800 - Date.now() : 0;
  clearTimeout(toast.q);
  if (wait > 0) { toast.q = setTimeout(() => toast(msg, ms, kind), wait); return; }
  t.textContent = msg; t.className = 'show ' + kind; toastAt = Date.now();
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, ms);
}
export const buzzOk = () => { try { if (navigator.vibrate && document.documentElement.dataset.haptics !== 'off') navigator.vibrate(12); } catch { /* rien */ } };
let sheetStack = 0;
/* ═════════ Écran redessiné sans sauter : rubriques et position gardées ═════════ */
// Un choix (une couleur, un sport, un créneau…) redessine l'écran. Les rubriques <details> que la personne a ouvertes
// ou fermées ELLE-MÊME (toucher sur le titre) le restent, page par page ; celles que l'app ouvre (créateur, étape…)
// suivent l'app. Rubriques à état propre : .setsec, [data-free], ou un titre avec data-act (l'app gère son état).
// Une fenêtre (#sheet) garde ses rubriques tant qu'elle est ouverte ; rouverte plus tard, elle repart de zéro.
const userOpen = new Map();
const detailText = (d) => (d.querySelector(':scope > summary')?.textContent || '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 80);
const scopeOf = (root) => (root.id === 'main' ? 'page:' + (location.hash || '#/').split('?')[0] : 'sheet:' + sheetTitle(root));
function keyOf(root, target) {
  const seen = new Map();
  for (const d of root.querySelectorAll('details')) { const t = detailText(d), n = seen.get(t) || 0; seen.set(t, n + 1); if (d === target) return `${scopeOf(root)}|${t}|${n}`; }
  return '';
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('click', (e) => {
  const sm = e.target.closest?.('summary'), d = sm?.parentElement;
  if (!d || d.tagName !== 'DETAILS' || d.matches('.setsec,[data-free]') || sm.matches('[data-act]')) return;
  const root = d.closest('#sheet > .panel') || d.closest('#main'); if (!root) return;
  // Écran redessiné entre-temps : c'est l'app qui a répondu au toucher, rien à retenir.
  setTimeout(() => { if (!d.isConnected) return; const k = keyOf(root, d); if (k) userOpen.set(k, d.open); }, 0);
}, true);
/** Réapplique les rubriques ouvertes ou fermées par la personne sur cet écran (après un rendu). */
export function restoreUserDetails(root) {
  if (!root || !userOpen.size) return;
  const seen = new Map(), scope = scopeOf(root);
  for (const d of root.querySelectorAll('details')) {
    const t = detailText(d), n = seen.get(t) || 0; seen.set(t, n + 1);
    if (d.matches('.setsec,[data-free]')) continue;
    const k = `${scope}|${t}|${n}`; if (userOpen.has(k) && d.open !== userOpen.get(k)) d.open = userOpen.get(k);
  }
}
const sheetTitle = (el) => (el?.querySelector('h2,h3')?.textContent || '').replace(/\d+/g, '#').trim();
let sheetHook = null;
/** Appelé après chaque ouverture de fenêtre (ex. liens des indications de chemin). */
export const onSheetRender = (fn) => { sheetHook = fn; };
// Clavier et lecteurs d'écran : le focus entre dans la fenêtre, y reste tant qu'elle est ouverte, puis revient au bouton
// qui l'a ouverte (ou au même bouton redessiné), sans faire défiler la page.
let returnFocus = null;
const focusKey = (el) => (el?.dataset?.act ? `[data-act="${CSS.escape(el.dataset.act)}"]${el.dataset.id ? `[data-id="${CSS.escape(el.dataset.id)}"]` : ''}` : '');
const rememberFocus = (box) => { const a = document.activeElement; return a && a !== document.body && !box.contains(a) ? { el: a, key: focusKey(a) } : null; };
const giveBackFocus = (r) => { if (!r) return; const target = r.el.isConnected ? r.el : r.key ? document.querySelector('#app ' + r.key) : null; if (target) setTimeout(() => { if (!document.querySelector('#sheet.open, #dialog.open, #player.open')) target.focus?.({ preventScroll: true }); }, 0); };
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('focusin', (e) => {
  const s = document.getElementById('sheet'); if (!s?.classList.contains('open') || e.target.closest?.('#sheet, #dialog, #toast, #player, #itimer, #grp, #tour')) return;
  s.querySelector('.panel')?.focus({ preventScroll: true });
});
export function openSheet(content, { wide = false } = {}) {
  const s = $('#sheet');
  if (!s.classList.contains('open')) returnFocus = rememberFocus(s);
  const body = val(content), close = body.includes('data-act="closeSheet"') ? '' : '<button type="button" class="btn sm ghost" data-act="closeSheet" aria-label="Fermer la fenêtre">Fermer</button>';
  // La même fenêtre redessinée (même titre) garde sa position et ses rubriques ouvertes.
  const old = s.classList.contains('open') ? s.querySelector('.panel') : null, oldTitle = sheetTitle(old), keep = old ? { top: old.scrollTop } : null;
  s.innerHTML = `<div class="back" data-act="closeSheet"></div><div class="panel${wide ? ' wide' : ''}" role="dialog" aria-modal="true" tabindex="-1"><div class="sheet-tools"><div class="grab" aria-hidden="true"></div>${close}</div>${body}</div>`;
  const panel = s.querySelector('.panel');
  try { sheetHook?.(panel); } catch { /* un lien de moins, jamais une fenêtre cassée */ }
  restoreUserDetails(panel);
  if (keep && oldTitle && sheetTitle(panel) === oldTitle) panel.scrollTop = keep.top;
  s.classList.add('open'); sheetStack++;
  setTimeout(() => { if (!s.classList.contains('open')) return; const f = s.querySelector('[autofocus]'); if (f) f.focus(); else if (!s.contains(document.activeElement)) s.querySelector('.panel')?.focus({ preventScroll: true }); }, 30);
}
export function closeSheet() { const s = $('#sheet'), wasOpen = s.classList.contains('open'); s.classList.remove('open'); s.innerHTML = ''; if (wasOpen) { giveBackFocus(returnFocus); returnFocus = null; } sheetStack = 0; for (const k of [...userOpen.keys()]) if (k.startsWith('sheet:')) userOpen.delete(k); }
export const sheetOpen = () => $('#sheet')?.classList.contains('open');

/** Confirmation dans une feuille (testable, accessible). Résout true / false. */
/** Saisie d'un texte court dans la boîte de dialogue de l'app (à la place du prompt() du navigateur). Renvoie le texte, ou null. */
export function askText(message, { value = '', placeholder = '', ok = 'Valider', cancel = 'Annuler', max = 120, detail = '' } = {}) {
  return new Promise((resolve) => {
    const d = $('#dialog');
    d.innerHTML = h`<div class="back"></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t" style="margin:0">${message}</h2>${detail ? h`<p class="muted small">${detail}</p>` : ''}
      <input id="dlg-in" type="text" maxlength="${max}" value="${value}" placeholder="${placeholder}" aria-label="${message}">
      <div class="row wrapf end"><button class="btn" data-dlg="0">${cancel}</button><button class="btn pri" data-dlg="1">${ok}</button></div></div>`.s;
    d.classList.add('open');
    const input = d.querySelector('#dlg-in');
    const done = (v) => { const t = v ? String(input.value || '').trim() : null; d.classList.remove('open'); d.innerHTML = ''; d.removeEventListener('click', onClick); resolve(t); };
    const onClick = (e) => { const b = e.target.closest('[data-dlg]'); if (b) done(b.dataset.dlg === '1'); else if (e.target.classList.contains('back')) done(false); };
    d.addEventListener('click', onClick);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') done(false); });
    setTimeout(() => { input.focus(); input.select(); }, 20);
  });
}
export function ask(message, { ok = 'Confirmer', cancel = 'Annuler', danger = false, detail = '' } = {}) {
  return new Promise((resolve) => {
    const d = $('#dialog'), back = rememberFocus(d);
    d.innerHTML = h`<div class="back"></div><div class="panel" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t" style="margin:0">${message}</h2>${detail ? h`<p class="muted small">${detail}</p>` : ''}
      <div class="row wrapf end"><button class="btn" data-dlg="0">${cancel}</button><button class="btn ${danger ? 'danger' : 'pri'}" data-dlg="1" autofocus>${ok}</button></div></div>`.s;
    d.classList.add('open');
    const done = (v) => { d.classList.remove('open'); d.innerHTML = ''; d.removeEventListener('click', onClick); resolve(v); if (back && back.el.isConnected) setTimeout(() => { if (!document.querySelector('#dialog.open')) back.el.focus?.({ preventScroll: true }); }, 0); };
    const onClick = (e) => { const b = e.target.closest('[data-dlg]'); if (b) done(b.dataset.dlg === '1'); else if (e.target.classList.contains('back')) done(false); };
    d.addEventListener('click', onClick);
    setTimeout(() => d.querySelector('[autofocus]')?.focus(), 20);
  });
}

/* ───────── Composants ───────── */
// Un choix parmi quelques-uns : des pastilles qui passent à la ligne (jamais une barre d'onglets).
export const seg = (act, cur, opts, extra = '') => h`<div class="chips choice" role="radiogroup">${opts.map(([v, l]) => h`<button type="button" role="radio" class="chip ${cur === v ? 'on' : ''}" aria-checked="${cur === v}" data-act="${act}" data-id="${v}" ${raw(extra)}>${l}</button>`)}</div>`;
/** Liste de rubriques (comme les réglages d'un téléphone) : [action, id, icône, titre, description]. */
/** Une ligne de liste (comme dans les Paramètres) : [action, id, icône, titre, description, destination]. */
export const menuRow = ([act, id, ic, t, d, to]) => h`<button class="setrow" data-act="${act}" ${id ? raw(`data-id="${id}"`) : ''} ${to ? raw(`data-to="${to}"`) : ''}><span class="sic">${ic}</span><span class="grow"><b>${t}</b>${d ? h`<small>${d}</small>` : ''}</span><span class="chev">›</span></button>`;
export const menuList = (rows) => h`<div class="setmenu">${rows.map(menuRow)}</div>`;
/** En-tête d'une sous-page : retour vers la liste, puis le titre. */
export const subHead = (act, id, backLabel, title) => h`<div class="row subhead"><button class="btn sm ghost" data-act="${act}" data-id="${id}">‹ ${backLabel}</button></div><h1>${title}</h1>`;
export const chip = (on, label, attrs) => h`<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${!!on}" ${raw(attrs)}>${label}</button>`;
/** Jauge : label = ce qu'elle mesure (nom lu par les lecteurs d'écran, avec le pourcentage). */
export const meter = (pct, cls = '', label = 'Progression') => h`<div class="meter ${cls}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct || 0)}"><i style="width:${Math.max(0, Math.min(100, Math.round(pct || 0)))}%"></i></div>`;
export const empty = (text, action = '') => h`<div class="card flat center empty"><p class="muted">${text}</p>${action}</div>`;
export const tag = (text, cls = '') => h`<span class="tag ${cls}">${text}</span>`;
export const SOURCE_TAG = { mesuré: 'ok', déclaré: '', calculé: 'info', estimé: 'warn', recommandé: 'acc', importé: '', 'relevé en séance': 'ok' };
/** Bloc « Comment le sais-tu ? » : faits, estimations, données manquantes, exclusions. */
export function howBox(ex, { open = false, title = 'Comment le sais-tu ?' } = {}) {
  if (!ex) return '';
  const list = (label, items, cls) => (items?.length ? h`<div class="how-sec"><b class="small ${cls}">${label}</b><ul>${items.map((x) => h`<li>${x}</li>`)}</ul></div>` : '');
  return h`<details class="how" ${open ? 'open' : ''}><summary>🔎 ${title}</summary>
    ${list('Faits (mesuré / déclaré / calculé)', ex.facts, 'ok-t')}${list('Estimations (inféré)', ex.inferences, 'warn-t')}${list('Données manquantes', ex.missing, 'muted')}${list('Exclu ou écarté', ex.excluded, 'muted')}
    ${ex.note ? h`<p class="tiny muted">${ex.note}</p>` : ''}</details>`;
}
export function bars(values, labels, { unit = '' } = {}) {
  const max = Math.max(1, ...values);
  return h`<div class="bars" role="img" aria-label="${values.join(', ')}">${values.map((v) => h`<div style="height:${Math.round((v / max) * 100)}%" title="${v}${unit}"><span>${v || ''}</span></div>`)}</div><div class="row between"><span class="tiny muted">${labels[0]}</span><span class="tiny muted">${labels[1]}</span></div>`;
}
export function lineChart(pts, unit = '') {
  if (pts.length < 2) return h`<p class="muted small">Il faut au moins 2 mesures pour tracer une courbe.</p>`;
  const W = 300, H = 110, min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v)), span = Math.max(1e-9, max - min);
  const xy = pts.map((p, i) => [10 + (i / (pts.length - 1)) * (W - 20), H - 15 - ((p.v - min) / span) * (H - 30)]);
  const n = (x) => (Math.round(x * 10) / 10).toString();
  return raw(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Évolution"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${xy.map((p) => p.map(n).join(',')).join(' ')}"/>${xy.map((p) => `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="3.2" fill="var(--accent)"/>`).join('')}<text x="6" y="12" font-size="10" fill="var(--muted)">${esc(n(max))} ${esc(unit)}</text><text x="6" y="${H - 2}" font-size="10" fill="var(--muted)">${esc(n(min))} ${esc(unit)}</text></svg>`);
}
export const skeleton = (n = 3) => h`${Array.from({ length: n }, () => h`<div class="card skel"><div></div><div></div></div>`)}`;
export function numberField(name, label, value, { unit = '', step = 'any', min = '', max = '', required = false, placeholder = '' } = {}) {
  return h`<label>${label}<span class="unitbox"><input type="number" inputmode="decimal" name="${name}" value="${value ?? ''}" step="${step}" ${min !== '' ? raw(`min="${esc(min)}"`) : ''} ${max !== '' ? raw(`max="${esc(max)}"`) : ''} ${required ? 'required' : ''} placeholder="${placeholder}">${unit ? h`<em>${unit}</em>` : ''}</span></label>`;
}
