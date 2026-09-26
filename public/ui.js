// ui.js — outils d'affichage : gabarits HTML échappés, feuilles (bottom sheets), confirmations, formats.
// RÈGLE : tout contenu passe par h`` qui échappe automatiquement ; raw() n'est utilisé que pour du HTML
// produit par h`` lui-même ou par des générateurs à coordonnées fixes (SVG anatomique, graphiques).

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v === false || v == null ? '' : esc(v));
export const h = (strings, ...vals) => new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? val(vals[i]) : ''), ''));
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
export const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
export const fmtDur = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return m ? (r ? `${m} min ${r}` : `${m} min`) : `${r} s`; };
export const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.max(0, s) % 60)}`;
export const exLine = (e) => `${e.sets} × ${e.mode === 'time' ? rng(e.secMin, e.secMax) + ' s' : rng(e.repsMin, e.repsMax) + (e.unit ? ' ' + e.unit : '')}${e.perSide ? ' / côté' : ''}${e.rest ? ' · repos ' + fmtDur(e.rest) : ''}${e.load ? ' · ' + e.load : ''}`;

/* ───────── Messages et feuilles ───────── */
export function toast(msg, ms = 2800, kind = '') {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, ms);
}
export const buzzOk = () => { try { if (navigator.vibrate && document.documentElement.dataset.haptics !== 'off') navigator.vibrate(12); } catch { /* rien */ } };
let sheetStack = 0;
export function openSheet(content, { wide = false } = {}) {
  const s = $('#sheet');
  s.innerHTML = `<div class="back" data-act="closeSheet"></div><div class="panel${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${val(content)}</div>`;
  s.classList.add('open'); sheetStack++;
  setTimeout(() => { const f = s.querySelector('[autofocus]'); if (f) f.focus(); }, 30);
}
export function closeSheet() { const s = $('#sheet'); s.classList.remove('open'); s.innerHTML = ''; sheetStack = 0; }
export const sheetOpen = () => $('#sheet')?.classList.contains('open');

/** Confirmation dans une feuille (testable, accessible). Résout true / false. */
export function ask(message, { ok = 'Confirmer', cancel = 'Annuler', danger = false, detail = '' } = {}) {
  return new Promise((resolve) => {
    const d = $('#dialog');
    d.innerHTML = h`<div class="back"></div><div class="panel" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t" style="margin:0">${message}</h2>${detail ? h`<p class="muted small">${detail}</p>` : ''}
      <div class="row wrapf end"><button class="btn" data-dlg="0">${cancel}</button><button class="btn ${danger ? 'danger' : 'pri'}" data-dlg="1" autofocus>${ok}</button></div></div>`.s;
    d.classList.add('open');
    const done = (v) => { d.classList.remove('open'); d.innerHTML = ''; d.removeEventListener('click', onClick); resolve(v); };
    const onClick = (e) => { const b = e.target.closest('[data-dlg]'); if (b) done(b.dataset.dlg === '1'); else if (e.target.classList.contains('back')) done(false); };
    d.addEventListener('click', onClick);
    setTimeout(() => d.querySelector('[autofocus]')?.focus(), 20);
  });
}

/* ───────── Composants ───────── */
export const seg = (act, cur, opts, extra = '') => h`<div class="seg" role="tablist">${opts.map(([v, l]) => h`<button type="button" role="tab" class="${cur === v ? 'on' : ''}" aria-selected="${cur === v}" data-act="${act}" data-id="${v}" ${raw(extra)}>${l}</button>`)}</div>`;
export const chip = (on, label, attrs) => h`<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${!!on}" ${raw(attrs)}>${label}</button>`;
export const meter = (pct, cls = '') => h`<div class="meter ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct || 0)}"><i style="width:${Math.max(0, Math.min(100, Math.round(pct || 0)))}%"></i></div>`;
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
