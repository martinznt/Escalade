// app.js — interface de « Seances entrainement » (PWA). Aucune bibliothèque externe : tout est local et fonctionne hors ligne.
import { uid, clamp, normalizeEx, normalizeSession, mergeSeances, readStored, fmtDur, norm, exKey, summarizeHistory, parseKg } from './shared.js';
import { LIBRARY, FOCUS, GROUP_LABEL, GROUP_TARGET, EQUIPMENT, SOURCES, byId } from './library.js';
import { parseSessionText, exportSessionText, generateSession, swapExercise, sessionMinutes, exMinutes, exMeta, analyze, groupLoads, progressHint, applyPerformedBase, parseRest, GRADES, REGIONS, SIZES } from './engine.js';
import { ACTIVITY_PRESETS, defaultProfile, ensureActivity, addActivity, addDomain, addMetric, analyzeProfile, inferDomain, generateGenericSession } from './sports.js';

/* ═════════ Outils d'affichage (tout est échappé : pas de HTML injecté) ═════════ */
class Raw { constructor(s) { this.s = s; } }
const raw = (s) => new Raw(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v === false || v == null ? '' : esc(v));
const h = (strings, ...vals) => new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? val(vals[i]) : ''), ''));
const $ = (sel, root = document) => root.querySelector(sel);
const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tz = () => new Date().getTimezoneOffset();
const fmtDate = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const store = { get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* rien */ } } };
const exLine = (e) => `${e.sets} × ${e.mode === 'time' ? rng(e.secMin, e.secMax) + ' s' : rng(e.repsMin, e.repsMax) + (e.unit ? ' ' + e.unit : '')}${e.perSide ? ' / côté' : ''}${e.rest ? ' · repos ' + fmtDur(e.rest) : ''}${e.load ? ' · ' + e.load : ''}`;
const parseDur = (v) => { v = String(v ?? '').trim(); if (!v) return 0; if (/^\d+:\d{1,2}$/.test(v)) { const [m, s] = v.split(':').map(Number); return m * 60 + s; } if (/[a-z]/i.test(v)) return parseRest(v) ?? 0; return Math.max(0, Number(v.replace(',', '.')) || 0); };
const libToEx = (l) => normalizeEx({ ...l, id: uid(), libId: l.id, ok: l.cues, bad: l.bad, note: '', block: 'main' });

/* ═════════ État ═════════ */
const DEFAULT_SETTINGS = { sound: true, vibration: true, voice: false, keepAwake: true, handsFree: false, defaultRest: 60, onboarded: false, sportProfile: defaultProfile() };
const S = {
  user: null, tab: 'home', settings: { ...DEFAULT_SETTINGS }, seances: { items: [], tomb: {} }, history: [], events: [], common: [], personal: [], outbox: [], failedOutbox: [],
  sync: 'idle', dirty: false, syncing: false, sub: { seances: 'list', progress: 'me', lib: 'coach' }, openId: null, importText: '', importResult: null,
  gen: { size: 'moyenne', focus: 'surprise', feeling: 'normal', eq: null, result: null, saved: false, activityId: 'climbing_boulder', profileMode: 'weaknesses', duration: 'medium' }, cal: null, unlocked: false,
  social: { me: null, feed: null, results: [], loading: false, q: '' }, progressEx: '', silDays: 7, player: null, authMode: 'login', authError: '', libQuery: '',
};
const ACT = {};
const DKEY = () => `sea:data:${S.user?.id}`;

function persistLocalNow() {
  if (!S.user) return;
  const ok = store.set(DKEY(), { seances: S.seances, history: S.history.slice(0, 500), events: S.events, settings: S.settings, common: S.common, personal: S.personal, outbox: S.outbox, failedOutbox: S.failedOutbox });
  if (!ok) toast('Stockage de l’appareil plein : exporte tes données (Réglages).');
}
function saveLocal() {
  if (!S.user) return;
  clearTimeout(saveLocal.t);
  saveLocal.t = setTimeout(() => persistLocalNow(), 200);
}
function loadLocal() {
  const d = store.get(DKEY(), null);
  if (!d) return false;
  S.seances = { items: (d.seances?.items || []).map(normalizeSession), tomb: d.seances?.tomb || {} };
  S.history = d.history || []; S.events = d.events || []; S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  S.common = d.common || []; S.personal = d.personal || []; S.outbox = d.outbox || []; S.failedOutbox = d.failedOutbox || [];
  return true;
}

/* ═════════ Réseau, file d'attente et synchronisation ═════════ */
async function api(method, path, body, opts = {}) {
  let res;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('Hors ligne'); e.offline = true; throw e; }
  let data = null;
  try { data = await res.json(); } catch { /* pas de JSON */ }
  if (res.status === 401 && !opts.quiet401) sessionExpired();
  if (!res.ok) { const e = new Error(data?.error || `Erreur ${res.status}`); e.status = res.status; throw e; }
  return data;
}
function sessionExpired() {
  if (!S.user || S.expiredShown) return;
  S.expiredShown = true;
  const name = S.user.username;
  store.del('sea:user');
  S.user = null; S.player = null; $('#player').classList.remove('open');
  S.authMode = 'login'; S.authError = 'Session expirée : reconnecte-toi (tes données de cet appareil sont conservées).'; S.prefill = name;
  render();
}
function queue(method, path, body) { S.outbox.push({ method, path, body }); saveLocal(); syncSoon(); }
async function flush() {
  while (S.outbox.length) {
    const op = S.outbox[0];
    try { await api(op.method, op.path, op.body); S.outbox.shift(); }
    catch (e) { if (e.offline || e.status >= 500 || e.status === 401 || e.status === 429) throw e; S.failedOutbox.push({ ...op, error:e.message, status:e.status||0, at:Date.now() }); S.failedOutbox=S.failedOutbox.slice(-100); S.outbox.shift(); toast(`Une action n’a pas pu être synchronisée : ${e.message}`); }
  }
  saveLocal();
}
function markDirty() { S.dirty = true; saveLocal(); syncSoon(); }
function syncSoon() { clearTimeout(syncSoon.t); syncSoon.t = setTimeout(syncAll, 1200); }
async function syncAll() {
  if (S.syncing || !S.user || !navigator.onLine) { if (!navigator.onLine) setSync('offline'); return; }
  S.syncing = true; S.dirty = false; setSync('sync');
  try {
    await flush();
    const r = await api('POST', '/api/sync', { items: S.seances.items, tomb: S.seances.tomb });
    S.seances = mergeSeances(S.seances, { items: r.items.map(normalizeSession), tomb: r.tomb });
    if (!S.outbox.length) {
      const [hist, cal, set, ex] = await Promise.all([api('GET', '/api/history'), api('GET', '/api/calendar'), api('GET', '/api/settings'), api('GET', '/api/exercises')]);
      if (!S.outbox.length) {
        S.history = hist.history; S.events = cal.events; S.settings = { ...DEFAULT_SETTINGS, ...S.settings, ...set.settings }; S.common = ex.common; S.personal = ex.personal;
      }
    }
    saveLocal(); S.lastSync = Date.now(); setSync('ok');
  } catch (e) { setSync(e.offline ? 'offline' : 'error'); }
  finally { S.syncing = false; if (S.dirty) syncSoon(); softRender(); }
}
function setSync(s) { S.sync = s; const d = $('#syncdot'); if (d) { d.className = 'dot ' + (s === 'ok' ? 'ok' : s === 'error' ? 'bad' : s === 'sync' ? 'sync' : ''); d.title = { ok: 'Synchronisé', sync: 'Synchronisation…', offline: 'Hors ligne : tes changements sont gardés', error: 'Erreur de synchronisation', idle: '' }[s]; } }
const inField = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('#app').contains(a); };
function softRender() { if (!inField() && !S.player) render(); }

/* ═════════ Fenêtres, messages ═════════ */
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); }
function openSheet(content) { const s = $('#sheet'); s.innerHTML = `<div class="back" data-act="closeSheet"></div><div class="panel" role="dialog" aria-modal="true">${val(content)}</div>`; s.classList.add('open'); }
function closeSheet() { const s = $('#sheet'); s.classList.remove('open'); s.innerHTML = ''; }
const confirmBox = (msg) => window.confirm(msg);

/* ═════════ Accès aux données ═════════ */
const getSeance = (id) => S.seances.items.find((s) => s.id === id);
function saveSeance(s) {
  s = normalizeSession({ ...s, updatedAt: Date.now(), createdAt: s.createdAt || Date.now() });
  const i = S.seances.items.findIndex((x) => x.id === s.id);
  if (i >= 0) S.seances.items[i] = s; else S.seances.items.unshift(s);
  delete S.seances.tomb[s.id];
  markDirty();
  return s;
}
function deleteSeance(id) { S.seances.items = S.seances.items.filter((s) => s.id !== id); S.seances.tomb[id] = Date.now(); markDirty(); }
function eventsOn(date) {
  const wd = (d) => new Date(d + 'T12:00:00').getDay();
  return S.events.filter((e) => e.date === date || (e.recurrence?.freq === 'weekly' && e.date <= date && wd(e.date) === wd(date) && (!e.recurrence.until || date <= e.recurrence.until)));
}
const doneOn = (date) => S.history.some((x) => ymd(new Date(x.startedAt)) === date);
const doneEventOn = (event, date) => {
  if (event?.completed && !event.recurrence) return true;
  if (!event?.sessionId) return false;
  return S.history.some((x) => x.sessionId === event.sessionId && ymd(new Date(x.startedAt)) === date);
};
const eqSet = () => (S.settings.equipment ? S.settings.equipment : { wall: true });

/* ═════════ Authentification ═════════ */
function vAuth() {
  const reg = S.authMode === 'register';
  return h`<div class="auth">
    <div class="center"><img class="app-logo" src="/icon-192.png" alt="Seances entrainement"><h1>Seances entrainement</h1><p class="muted">${reg ? 'Crée ton compte. Tu resteras connecté sur cet appareil.' : 'Connecte-toi une seule fois : l’appli te reconnaîtra ensuite.'}</p></div>
    <form data-submit="${reg ? 'register' : 'login'}" class="card" autocomplete="on">
      <label>Pseudo${reg ? '' : ' ou e-mail'}<input type="text" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" required minlength="3" maxlength="40" value="${S.prefill || store.get('sea:lastname', '') || ''}"></label>
      ${reg ? h`<label>E-mail (facultatif)<input type="email" name="email" autocomplete="email" maxlength="120"></label>` : ''}
      <label>Mot de passe<input type="password" name="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="8" maxlength="200"></label>
      ${reg ? h`<label>Code d’invitation (si on t’en a donné un)<input type="text" name="invite" autocomplete="off" maxlength="60"></label>` : ''}
      <div class="err" role="alert">${S.authError}</div>
      <button class="btn pri big" type="submit">${reg ? 'Créer mon compte' : 'Me connecter'}</button>
    </form>
    <button class="btn ghost" data-act="authMode">${reg ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
  </div>`;
}
async function authSubmit(form, kind) {
  const f = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; S.authError = '';
  try {
    const r = await api('POST', kind === 'register' ? '/api/auth/register' : '/api/auth/login', f, { quiet401: true });
    S.user = r.user; S.expiredShown = false; S.prefill = '';
    store.set('sea:user', r.user); store.set('sea:lastname', r.user.username);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    S.tab = kind === 'register' ? 'settings' : 'home'; enterApp(false);
    if (kind === 'register') toast('Bienvenue ! Renseigne ton profil pour des séances adaptées.');
  } catch (e) { S.authError = e.offline ? 'Pas de connexion internet.' : e.message; render(); }
}
function enterApp(fromCache) {
  loadLocal();
  if (!fromCache) S.outbox = S.outbox || [];
  applyHands(); render(); syncAll();
}
ACT.authMode = () => { S.authMode = S.authMode === 'login' ? 'register' : 'login'; S.authError = ''; render(); };
ACT.logout = async () => {
  if (!confirmBox('Te déconnecter de cet appareil ? Tes données restent sur ton compte.')) return;
  try { await api('POST', '/api/auth/logout', {}); } catch { /* hors ligne : on efface quand même le cache local */ }
  store.del('sea:user'); S.user = null; S.prefill = ''; S.authMode = 'login'; S.authError = ''; render();
};

/* ═════════ Apparence (par appareil) ═════════ */
function applyHands() { document.documentElement.classList.toggle('hands', !!S.settings.handsFree); }
const PALETTES = [['gres', '#d9a441', 'Grès'], ['granit', '#5aa9e6', 'Granit'], ['foret', '#4cc38a', 'Forêt'], ['corail', '#ff7a59', 'Corail'], ['encre', '#a78bfa', 'Encre'], ['calcaire', '#c2410c', 'Calcaire'], ['contraste', '#ffd60a', 'Contraste']];
function setAppearance(patch) { window.__sea.save({ ...window.__sea.load(), ...patch }); render(); }
ACT.appear = (el) => setAppearance({ [el.dataset.k]: el.dataset.v });
ACT.accentReset = () => setAppearance({ accent: '' });
function vAppearance() {
  const a = window.__sea.load();
  const seg = (k, opts) => h`<div class="chips">${opts.map(([v, l]) => h`<button type="button" class="chip ${a[k] === v ? 'on' : ''}" data-act="appear" data-k="${k}" data-v="${v}">${l}</button>`)}</div>`;
  return h`<div class="card"><h3>🎨 Apparence de cet appareil</h3><p class="muted small">Ces choix ne concernent que ce téléphone / cet ordinateur.</p>
    <label>Mode</label>${seg('mode', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']])}
    <label>Palette</label><div class="palette">${PALETTES.map(([id, c, n]) => h`<button type="button" class="sw ${a.palette === id && !a.accent ? 'on' : ''}" style="background:${c}" title="${n}" aria-label="${n}" data-act="appear" data-k="palette" data-v="${id}"></button>`)}</div>
    <label>Couleur perso <input type="color" data-change="accent" value="${a.accent || '#d9a441'}" style="height:44px;padding:2px"></label>${a.accent ? h`<button type="button" class="btn sm" data-act="accentReset">Revenir à la palette</button>` : ''}
    <label>Forme des icônes</label><div class="row wrapf">${[['circle', 'Rond'], ['squircle', 'Arrondi'], ['square', 'Carré'], ['hex', 'Hexagone']].map(([v, n]) => h`<button type="button" class="ico acc ${a.shape === v ? 'on' : ''}" style="cursor:pointer;${a.shape === v ? 'outline:3px solid var(--text);outline-offset:3px' : ''}" title="${n}" aria-label="${n}" data-act="appear" data-k="shape" data-v="${v}">🧗</button>`)}</div>
    <label>Arrondi des cartes</label>${seg('radius', [['sharp', 'Net'], ['soft', 'Doux'], ['bubble', 'Bulle']])}
    <label>Taille du texte</label>${seg('size', [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']])}
    <label>Densité</label>${seg('density', [['compact', 'Compact'], ['normal', 'Normal'], ['airy', 'Aéré']])}
    <label>Animations</label>${seg('motion', [['on', 'Oui'], ['off', 'Non']])}
  </div>`;
}

/* ═════════ Structure générale ═════════ */
const TABS = [['home', '🏠', 'Accueil'], ['seances', '📚', 'Séances'], ['generate', '✨', 'Générer'], ['progress', '📈', 'Progrès'], ['settings', '⚙️', 'Réglages']];
function render() {
  const app = $('#app');
  if (!S.user) { app.innerHTML = vAuth().s; return; }
  const views = { home: vHome, seances: vSeances, generate: vGenerate, progress: vProgress, settings: vSettings };
  app.innerHTML = h`<header class="wrap top" style="padding-bottom:0"><span class="brand"><img src="/icon-192.png" alt=""> Seances entrainement</span><span class="row small muted"><span id="syncdot" class="dot"></span></span></header>
    <main class="wrap">${views[S.tab]()}</main>
    <nav class="tabs" aria-label="Navigation">${TABS.map(([id, ic, label]) => h`<button data-act="tab" data-id="${id}" class="${S.tab === id ? 'on' : ''}" aria-current="${S.tab === id ? 'page' : 'false'}"><span class="ico">${ic}</span>${label}</button>`)}</nav>`.s;
  setSync(S.sync);
}
ACT.tab = (el) => { S.tab = el.dataset.id; if (S.tab === 'seances' && S.sub.seances === 'detail') S.sub.seances = 'list'; window.scrollTo(0, 0); render(); if (S.tab === 'progress' && S.sub.progress === 'friends') loadSocial(); };
ACT.closeSheet = closeSheet;

const exIcon = (e) => h`<div class="ico">${e.emoji}</div>`;
const seg = (act, cur, opts) => h`<div class="seg">${opts.map(([v, l]) => h`<button type="button" class="${cur === v ? 'on' : ''}" data-act="${act}" data-id="${v}">${l}</button>`)}</div>`;

/* ═════════ Accueil + calendrier ═════════ */
function vHome() {
  const sub = S.sub.home || 'today';
  return h`<div class="row between"><h1>Salut ${S.user.username} 👋</h1></div>${seg('subHome', sub, [['today', 'Aujourd’hui'], ['cal', 'Calendrier']])}${sub === 'today' ? vToday() : vCalendar()}`;
}
ACT.subHome = (el) => { S.sub.home = el.dataset.id; render(); };
function vToday() {
  const today = ymd(new Date()), evs = eventsOn(today), sum = summarizeHistory(S.history, Date.now(), tz());
  const last = S.history[0];
  return h`${S.settings.onboarded ? '' : h`<div class="card flat"><b>Complète ton profil</b><span class="muted small">Niveau, matériel, zones sensibles : les séances générées s’adaptent à toi.</span><button class="btn pri" data-act="tab" data-id="settings">Ouvrir Réglages</button></div>`}
    <div class="card"><h3>Aujourd’hui</h3>
      ${evs.length ? evs.map((e) => { const s = e.sessionId && getSeance(e.sessionId); return h`<div class="item"><div class="ico">${s?.emoji || '📅'}</div><div class="grow"><b>${e.title || s?.name || 'Séance'}</b>${doneEventOn(e, today) ? h`<div class="small" style="color:var(--ok)">✓ Faite</div>` : ''}</div>${s ? h`<button class="btn pri sm" data-act="play" data-id="${s.id}" data-event="${e.id}">▶ Lancer</button>` : h`<span class="tag warn">séance supprimée</span>`}</div>`; })
        : h`<p class="muted">Rien de prévu aujourd’hui.</p>`}
      <div class="row wrapf"><button class="btn pri" data-act="tab" data-id="generate">✨ Générer une séance</button><button class="btn" data-act="tab" data-id="seances">📚 Mes séances</button></div></div>
    <div class="grid3"><div class="stat"><b>${sum.sessions7}</b><span>séances / 7 j</span></div><div class="stat"><b>${sum.streak}</b><span>jours d’affilée</span></div><div class="stat"><b>${sum.minutes30}</b><span>min / 30 j</span></div></div>${vGoals()}${vClimbing()}
    ${last ? h`<div class="card"><h3>Dernière séance</h3><div class="row"><div class="ico">✅</div><div class="grow"><b>${last.sessionName}</b><div class="muted small">${fmtDate(last.startedAt)} · ${Math.round(last.durationSeconds / 60)} min</div></div></div></div>` : ''}`;
}
function vCalendar() {
  if (!S.cal) { const d = new Date(); S.cal = { y: d.getFullYear(), m: d.getMonth() }; }
  const { y, m } = S.cal, first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = ymd(new Date());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m + 1)}-${pad(d)}`);
  return h`<div class="card"><div class="row between"><button class="btn sm" data-act="calMove" data-id="-1" aria-label="Mois précédent">‹</button><b>${MONTHS[m]} ${y}</b><button class="btn sm" data-act="calMove" data-id="1" aria-label="Mois suivant">›</button></div>
    <div class="cal">${JOURS.map((j) => h`<div class="h">${j}</div>`)}${cells.map((c) => c ? h`<button class="d ${c === today ? 'today' : ''}" data-act="calDay" data-id="${c}">${Number(c.slice(8))}${eventsOn(c).length || doneOn(c) ? h`<i class="${doneOn(c) ? 'done' : ''}"></i>` : ''}</button>` : h`<div></div>`)}</div>
    <p class="muted small">Point vert = séance faite, point de couleur = séance prévue. Touche un jour pour planifier.</p></div>`;
}
ACT.calMove = (el) => { const n = S.cal.m + Number(el.dataset.id); S.cal = { y: S.cal.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; render(); };
ACT.calDay = (el) => { S.selDay = el.dataset.id; openDaySheet(); };
function openDaySheet() {
  const date = S.selDay, evs = eventsOn(date);
  openSheet(h`<h2 style="margin:0">${new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    ${doneOn(date) ? h`<div style="color:var(--ok)" class="small">✓ Séance faite ce jour-là</div>` : ''}
    ${evs.map((e) => h`<div class="item"><div class="grow"><b>${e.title || 'Séance'}</b>${e.recurrence ? h`<div class="tiny muted">se répète chaque semaine</div>` : ''}</div>${e.sessionId && getSeance(e.sessionId) ? h`<button class="btn pri sm" data-act="play" data-id="${e.sessionId}" data-event="${e.id}">▶</button>` : ''}<button class="btn danger sm" data-act="delEvent" data-id="${e.id}" aria-label="Supprimer">✕</button></div>`)}
    ${S.seances.items.length ? h`<form data-submit="addEvent" class="card"><h3>Planifier une séance</h3>
      <label>Séance<select name="sid">${S.seances.items.map((s) => h`<option value="${s.id}">${s.emoji} ${s.name}</option>`)}</select></label>
      <label class="chk"><input type="checkbox" name="weekly"> Répéter chaque semaine</label>
      <button class="btn pri" type="submit">Ajouter au ${date.split('-').reverse().join('/')}</button></form>` : h`<p class="muted">Crée d’abord une séance pour la planifier.</p>`}
    <button class="btn" data-act="closeSheet">Fermer</button>`);
}
ACT.delEvent = (el) => { const e = S.events.find((x) => x.id === el.dataset.id); if (!e) return; if (e.recurrence && !confirmBox('Supprimer toute la série hebdomadaire ?')) return; S.events = S.events.filter((x) => x.id !== e.id); queue('DELETE', `/api/calendar/${encodeURIComponent(e.id)}`); openDaySheet(); render(); };
const SUBMIT = {};
SUBMIT.addEvent = (form) => {
  const f = Object.fromEntries(new FormData(form)), s = getSeance(f.sid); if (!s) return;
  const ev = { id: uid(), date: S.selDay, title: s.name, sessionId: s.id, completed: false, recurrence: f.weekly ? { freq: 'weekly', until: null } : null };
  S.events.push(ev); queue('POST', '/api/calendar', ev); toast('Séance planifiée'); openDaySheet(); render();
};
ACT.plan = (el) => { S.selDay = ymd(new Date()); openDaySheet(); const sel = $('#sheet select[name=sid]'); if (sel) sel.value = el.dataset.id; };

/* ═════════ Séances : liste, détail, édition ═════════ */
function vSeances() {
  const sub = S.sub.seances;
  if (sub === 'detail' && getSeance(S.openId)) return vDetail(getSeance(S.openId));
  if (sub === 'import') return vImport();
  const cur = sub === 'library' ? 'library' : 'list';
  return h`<h1>Séances</h1>${seg('subSeances', cur, [['list', 'Mes séances'], ['library', 'Exercices']])}${cur === 'library' ? vLibrary() : vList()}`;
}
ACT.subSeances = (el) => { S.sub.seances = el.dataset.id; render(); };
function vList() {
  return h`<div class="row wrapf"><button class="btn pri" data-act="newSeance">＋ Nouvelle séance</button><button class="btn" data-act="openImport">📋 Coller un texte</button><button class="btn" data-act="tab" data-id="generate">✨ Générer</button></div>
    ${S.seances.items.length ? S.seances.items.map((s) => h`<div class="card"><div class="row"><div class="ico">${s.emoji}</div><div class="grow"><b>${s.name}</b><div class="muted small">${s.exercises.filter((e) => e.block === 'main').length || s.exercises.length} exercices · ~${sessionMinutes(s)} min${s.source === 'generated' ? ' · générée' : ''}</div></div></div>
      <div class="row wrapf"><button class="btn pri sm" data-act="play" data-id="${s.id}">▶ Lancer</button><button class="btn sm" data-act="openSeance" data-id="${s.id}">Ouvrir</button><button class="btn sm" data-act="plan" data-id="${s.id}">📅 Planifier</button></div></div>`)
      : h`<div class="card flat center"><p>Aucune séance pour l’instant.</p><p class="muted small">Génère-en une, colle un texte de séance ou crée-la à la main.</p></div>`}`;
}
ACT.newSeance = () => { const s = saveSeance({ id: uid(), name: 'Nouvelle séance', emoji: '🧗', exercises: [], source: 'manual' }); S.openId = s.id; S.sub.seances = 'detail'; render(); };
ACT.openSeance = (el) => { S.openId = el.dataset.id; S.sub.seances = 'detail'; window.scrollTo(0, 0); render(); };
ACT.backList = () => { S.sub.seances = 'list'; S.addTo = null; render(); };

function exRow(e, idx, total, opts = {}) {
  return h`<div class="item"><div class="ico">${e.emoji}</div><div class="grow"><b>${e.name}</b> ${e.isNew ? h`<span class="tag new">🆕 découverte</span>` : ''}<div class="muted small">${exLine(e)}</div>${e.note ? h`<div class="tiny" style="color:var(--accent)">${e.note}</div>` : ''}</div>
    <div class="row" style="gap:4px">${opts.swap ? h`<button class="btn sm" data-act="swapEx" data-id="${e.id}" title="Remplacer" aria-label="Remplacer">🔄</button>` : ''}${opts.edit ? h`<button class="btn sm" data-act="up" data-id="${e.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn sm" data-act="down" data-id="${e.id}" ${idx === total - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm" data-act="editEx" data-id="${e.id}" aria-label="Modifier">✎</button><button class="btn danger sm" data-act="delEx" data-id="${e.id}" aria-label="Retirer">✕</button>` : h`<button class="btn sm" data-act="detailEx" data-id="${e.id}" aria-label="Détails">ⓘ</button>`}</div></div>`;
}
const BLOCKS = { warmup: '🔥 Échauffement', main: '💪 Séance', cool: '🧘 Retour au calme' };
function blocksOf(s, render1) {
  const out = [];
  for (const b of ['warmup', 'main', 'cool']) {
    const list = s.exercises.filter((e) => e.block === b);
    if (!list.length) continue;
    const mins = Math.round(list.reduce((t, e) => t + exMinutes(e), 0));
    out.push(h`${s.exercises.some((e) => e.block !== 'main') ? h`<div class="blockhead">${BLOCKS[b]} · ~${mins} min</div>` : ''}${list.map((e) => render1(e, s.exercises.indexOf(e)))}`);
  }
  return out;
}
function notesBlock(s) {
  return h`${s.objectives.length ? h`<p class="muted small">🎯 ${s.objectives.join(' • ')}</p>` : ''}${s.notes.map((n) => h`<details class="card" ${n.title.startsWith('Pourquoi') ? 'open' : ''}><summary><b>${n.title || 'Note'}</b></summary><pre class="txt">${n.text}</pre></details>`)}`;
}
function vDetail(s) {
  return h`<div class="row"><button class="btn sm" data-act="backList" aria-label="Retour">‹</button><div class="grow"></div><button class="btn pri" data-act="play" data-id="${s.id}">▶ Lancer</button></div>
    <div class="card"><div class="row"><input type="text" data-change="semoji" value="${s.emoji}" maxlength="4" style="width:64px;text-align:center;font-size:1.4rem" aria-label="Emoji"><input type="text" data-change="sname" value="${s.name}" maxlength="100" aria-label="Nom de la séance"></div><div class="muted small">~${sessionMinutes(s)} min · ${s.exercises.length} exercices</div></div>
    ${notesBlock(s)}
    <div class="card">${s.exercises.length ? blocksOf(s, (e, i) => exRow(e, i, s.exercises.length, { edit: true })) : h`<p class="muted">Aucun exercice. Ajoute-en un !</p>`}
      <div class="row wrapf"><button class="btn pri" data-act="addEx">＋ Ajouter un exercice</button></div></div>
    <div class="row wrapf"><button class="btn" data-act="dupSeance" data-id="${s.id}">⧉ Dupliquer</button><button class="btn" data-act="copyText" data-id="${s.id}">📤 Copier en texte</button><button class="btn" data-act="plan" data-id="${s.id}">📅 Planifier</button><button class="btn danger" data-act="delSeance" data-id="${s.id}">🗑 Supprimer</button></div>`;
}
const CHG = {};
CHG.sname = (el) => { const s = getSeance(S.openId); if (s) { saveSeance({ ...s, name: el.value.trim() || 'Séance' }); } };
CHG.semoji = (el) => { const s = getSeance(S.openId); if (s) { saveSeance({ ...s, emoji: el.value.trim() || '🧗' }); render(); } };
ACT.dupSeance = (el) => { const s = getSeance(el.dataset.id); if (!s) return; const c = saveSeance({ ...s, id: uid(), name: s.name + ' (copie)', createdAt: 0, exercises: s.exercises.map((e) => ({ ...e, id: uid() })) }); S.openId = c.id; toast('Séance dupliquée'); render(); };
ACT.delSeance = (el) => { const s = getSeance(el.dataset.id); if (s && confirmBox(`Supprimer « ${s.name} » ?`)) { deleteSeance(s.id); S.sub.seances = 'list'; toast('Séance supprimée'); render(); } };
ACT.copyText = async (el) => { const s = getSeance(el.dataset.id); if (!s) return; const t = exportSessionText(s); try { await navigator.clipboard.writeText(t); toast('Texte copié : colle-le où tu veux'); } catch { openSheet(h`<h2 style="margin:0">Texte de la séance</h2><textarea readonly style="min-height:260px">${t}</textarea><button class="btn" data-act="closeSheet">Fermer</button>`); } };
const moveEx = (id, d) => { const s = getSeance(S.openId); if (!s) return; const i = s.exercises.findIndex((e) => e.id === id), j = i + d; if (i < 0 || j < 0 || j >= s.exercises.length) return; const ex = s.exercises.slice(); [ex[i], ex[j]] = [ex[j], ex[i]]; saveSeance({ ...s, exercises: ex }); render(); };
ACT.up = (el) => moveEx(el.dataset.id, -1); ACT.down = (el) => moveEx(el.dataset.id, 1);
ACT.delEx = (el) => { const s = getSeance(S.openId); if (s) { saveSeance({ ...s, exercises: s.exercises.filter((e) => e.id !== el.dataset.id) }); render(); } };
ACT.detailEx = (el) => { const id = el.dataset.id; const e = getSeance(S.openId)?.exercises.find((x) => x.id === id) || S.gen.result?.session.exercises.find((x) => x.id === id) || S.importResult?.session?.exercises.find((x) => x.id === id); if (e) openSheet(exDetail(e)); };
function exDetail(e) {
  return h`<div class="row"><div class="ico">${e.emoji}</div><div class="grow"><h2 style="margin:0">${e.name}</h2><div class="muted small">${exLine(e)}</div></div></div>
    ${e.note ? h`<div class="small" style="color:var(--accent)">${e.note}</div>` : ''}${e.ok.length ? h`<div><b>À faire</b><ul>${e.ok.map((c) => h`<li>${c}</li>`)}</ul></div>` : ''}${e.bad.length ? h`<div><b>À éviter</b><ul>${e.bad.map((c) => h`<li>${c}</li>`)}</ul></div>` : ''}
    ${e.muscles.length ? h`<div class="muted small">Travaille : ${e.muscles.join(', ')}</div>` : ''}<button class="btn" data-act="closeSheet">Fermer</button>`;
}

/* Formulaire d'exercice (séance, bibliothèque commune ou personnelle) */
function exForm(e, ctx) {
  const t = e.mode === 'time';
  return h`<h2 style="margin:0">${ctx.kind === 'session' && ctx.eid !== 'new' ? 'Modifier l’exercice' : 'Exercice'}</h2>
  <form data-submit="saveEx" class="card" style="border:0;padding:0"><input type="hidden" name="ctx" value="${JSON.stringify(ctx)}">
    <div class="row"><input type="text" name="emoji" value="${e.emoji}" maxlength="4" style="width:64px;text-align:center;font-size:1.4rem" aria-label="Emoji"><input type="text" name="name" value="${e.name}" maxlength="80" required aria-label="Nom"></div>
    <label>Type<select name="mode" data-change="exmode"><option value="reps" ${t ? '' : 'selected'}>Répétitions</option><option value="time" ${t ? 'selected' : ''}>Durée (secondes)</option></select></label>
    <div class="grid3"><label>Séries<input type="number" name="sets" min="1" max="30" value="${e.sets}"></label><label>Repos (s ou 2:30)<input type="text" name="rest" value="${e.rest}" inputmode="numeric"></label><label class="chk" style="align-self:end"><input type="checkbox" name="perSide" ${e.perSide ? 'checked' : ''}> Par côté</label></div>
    <div class="grid2" data-m="reps" ${t ? 'hidden' : ''}><label>Reps min<input type="number" name="repsMin" min="1" max="999" value="${e.repsMin}"></label><label>Reps max<input type="number" name="repsMax" min="1" max="999" value="${e.repsMax}"></label></div>
    <div class="grid2" data-m="time" ${t ? '' : 'hidden'}><label>Secondes min<input type="number" name="secMin" min="1" max="7200" value="${e.secMin}"></label><label>Secondes max<input type="number" name="secMax" min="1" max="7200" value="${e.secMax}"></label></div>
    <div class="grid2"><label>Charge (texte)<input type="text" name="load" value="${e.load}" maxlength="60" placeholder="+10 kg, poids du corps…"></label><label>Unité (blocs, voies…)<input type="text" name="unit" value="${e.unit}" maxlength="12"></label></div>
    <label>Consignes (une par ligne)<textarea name="ok">${e.ok.join('\n')}</textarea></label>
    <label>Erreurs à éviter (une par ligne)<textarea name="bad" style="min-height:70px">${e.bad.join('\n')}</textarea></label>
    <label>Muscles travaillés (séparés par des virgules)<input type="text" name="muscles" value="${e.muscles.join(', ')}"></label>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn" type="button" data-act="closeSheet">Annuler</button></div>
  </form>`;
}
CHG.exmode = (el) => { const f = el.closest('form'); f.querySelector('[data-m=reps]').hidden = el.value === 'time'; f.querySelector('[data-m=time]').hidden = el.value !== 'time'; };
ACT.editEx = (el) => { const s = getSeance(S.openId), e = s?.exercises.find((x) => x.id === el.dataset.id); if (e) openSheet(exForm(e, { kind: 'session', sid: s.id, eid: e.id })); };
SUBMIT.saveEx = async (form) => {
  const f = Object.fromEntries(new FormData(form)), ctx = JSON.parse(f.ctx);
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const base = ctx.kind === 'session' && ctx.eid !== 'new' ? getSeance(ctx.sid)?.exercises.find((x) => x.id === ctx.eid) || {} : {};
  const e = normalizeEx({ ...base, name: f.name, emoji: f.emoji, mode: f.mode, sets: f.sets, repsMin: f.repsMin, repsMax: f.repsMax, secMin: f.secMin, secMax: f.secMax, perSide: !!f.perSide, load: f.load, unit: f.unit, rest: parseDur(f.rest), ok: lines(f.ok), bad: lines(f.bad), muscles: String(f.muscles || '').split(',').map((x) => x.trim()).filter(Boolean) });
  try {
    if (ctx.kind === 'session') {
      const s = getSeance(ctx.sid); if (!s) return;
      const list = ctx.eid === 'new' ? [...s.exercises, { ...e, id: uid() }] : s.exercises.map((x) => (x.id === ctx.eid ? { ...e, id: x.id, block: x.block } : x));
      saveSeance({ ...s, exercises: list });
    } else if (ctx.kind === 'personal' && ctx.id) { await api('PUT', `/api/exercises/personal/${ctx.id}`, { exercise: e }); await refreshExercises(); }
    else if (ctx.kind === 'personal') { await api('POST', '/api/exercises/personal', { exercise: e }); await refreshExercises(); }
    else if (ctx.kind === 'common' && ctx.id) await withEdit(() => api('PUT', `/api/exercises/common/${ctx.id}`, { exercise: e }).then(refreshExercises));
    else if (ctx.kind === 'newcommon') { await api('POST', '/api/exercises/common', { name: e.name, exercise: e }); await refreshExercises(); }
    closeSheet(); toast('Enregistré'); render();
  } catch (err) { toast(err.offline ? 'Il faut une connexion pour cette action.' : err.message); }
};
async function refreshExercises() { const ex = await api('GET', '/api/exercises'); S.common = ex.common; S.personal = ex.personal; saveLocal(); }

/* Accès à la modification de la bibliothèque commune (code) */
async function withEdit(fn) {
  try { return await fn(); }
  catch (e) {
    if (e.status !== 403) throw e;
    S.afterUnlock = fn; openSheet(h`<h2 style="margin:0">Code de modification</h2><p class="muted small">La bibliothèque commune est partagée : il faut le code pour modifier ou supprimer un exercice.</p>
      <form data-submit="unlock" class="card" style="border:0;padding:0"><input type="password" name="code" autocomplete="off" required placeholder="Code" aria-label="Code"><div class="err">${''}</div><button class="btn pri" type="submit">Débloquer</button></form>`);
  }
}
SUBMIT.unlock = async (form) => {
  const code = new FormData(form).get('code');
  try { await api('POST', '/api/edit/unlock', { code }); S.unlocked = true; closeSheet(); toast('Modification débloquée'); const fn = S.afterUnlock; S.afterUnlock = null; if (fn) { await fn(); render(); } else render(); }
  catch (e) { toast(e.message); }
};
ACT.lockEdit = async () => { try { await api('POST', '/api/edit/lock', {}); } catch { /* rien */ } S.unlocked = false; toast('Modification verrouillée'); render(); };

/* Bibliothèque : coach (intégrée), commune, personnelle */
const listFor = (kind) => kind === 'coach' ? LIBRARY.filter((x) => x.role === 'main').map((x) => ({ id: x.id, name: x.name, data: libToEx(x) })) : kind === 'common' ? S.common.map((x) => ({ id: x.id, name: x.name, data: normalizeEx(x.data) })) : S.personal.map((x) => ({ id: x.id, name: x.name, data: normalizeEx(x.data) }));
function vLibrary() {
  const kind = S.sub.lib;
  return h`${seg('subLib', kind, [['coach', 'Coach'], ['common', 'Commune'], ['personal', 'Perso']])}
    ${S.addTo && getSeance(S.addTo) ? h`<div class="card" style="border-color:var(--accent)"><div class="row"><div class="grow">Ajout à <b>${getSeance(S.addTo).name}</b></div><button class="btn pri sm" data-act="doneAdd">Terminé</button></div></div>` : ''}
    <input type="text" data-input="libq" placeholder="Rechercher un exercice…" value="${S.libQuery}" aria-label="Rechercher">
    <div class="row wrapf">${kind !== 'coach' ? h`<button class="btn sm" data-act="newLibEx">＋ Nouvel exercice ${kind === 'common' ? 'commun' : 'perso'}</button>` : ''}${kind === 'common' ? h`<span class="muted tiny">${S.unlocked ? '🔓 modification débloquée' : '🔒 modification : code requis'}</span>` : ''}</div>
    <div class="card" id="liblist">${libRows(kind)}</div>
    <details class="card"><summary><b>Sources d’inspiration</b></summary>${SOURCES.map((s) => h`<p class="small"><b>${s.title}</b> — ${s.by}<br><span class="muted">${s.note}</span></p>`)}<p class="tiny muted">Les séances suivent des principes d’entraînement courants ; elles ne recopient pas ces ouvrages et ne remplacent ni un coach ni un avis médical.</p></details>`;
}
function libRows(kind) {
  const q = norm(S.libQuery), list = listFor(kind).filter((x) => !q || norm(x.name).includes(q));
  if (!list.length) return h`<p class="muted">${kind === 'coach' ? 'Aucun résultat.' : 'Rien ici pour l’instant (ou hors ligne : ouvre l’appli en ligne une fois).'}</p>`;
  return list.slice(0, 80).map((x) => h`<div class="item"><div class="ico">${x.data.emoji}</div><div class="grow"><b>${x.name}</b><div class="muted small">${exLine(x.data)}</div></div><button class="btn sm" data-act="libOpen" data-kind="${kind}" data-id="${x.id}">Voir</button></div>`);
}
ACT.subLib = (el) => { S.sub.lib = el.dataset.id; S.libQuery = ''; if (el.dataset.id !== 'coach' && navigator.onLine) refreshExercises().then(render).catch(() => {}); render(); };
const INPUT = {};
INPUT.libq = (el) => { S.libQuery = el.value; const box = $('#liblist'); if (box) box.innerHTML = libRows(S.sub.lib).s; };
ACT.newLibEx = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪' }), { kind: S.sub.lib === 'common' ? 'newcommon' : 'personal' }));
ACT.libOpen = (el) => {
  const kind = el.dataset.kind, x = listFor(kind).find((y) => y.id === el.dataset.id); if (!x) return;
  S.libSel = { kind, id: x.id };
  openSheet(h`${exDetail(x.data)}<hr style="border:0;border-top:1px solid var(--line);width:100%">
    <div class="row wrapf">${S.addTo && getSeance(S.addTo) ? h`<button class="btn pri" data-act="libAdd" data-sid="${S.addTo}">＋ Ajouter à « ${getSeance(S.addTo).name} »</button>` : ''}
    ${S.seances.items.length ? h`<select id="libTarget" aria-label="Séance cible" style="flex:1">${S.seances.items.map((s) => h`<option value="${s.id}">${s.emoji} ${s.name}</option>`)}</select><button class="btn" data-act="libAdd" data-sid="">＋ Ajouter</button>` : ''}</div>
    <div class="row wrapf">${kind !== 'personal' ? h`<button class="btn sm" data-act="libKeep">Garder dans mes exercices</button>` : ''}${kind === 'personal' ? h`<button class="btn sm" data-act="libEdit">✎ Modifier</button><button class="btn danger sm" data-act="libDel">Supprimer</button>` : ''}${kind === 'common' ? h`<button class="btn sm" data-act="libEdit">✎ Modifier</button><button class="btn danger sm" data-act="libDel">Supprimer</button>` : ''}</div>`);
};
const selEx = () => { const { kind, id } = S.libSel || {}; return listFor(kind).find((y) => y.id === id); };
ACT.libAdd = (el) => {
  const x = selEx(); if (!x) return; const sid = el.dataset.sid || $('#libTarget')?.value, s = getSeance(sid); if (!s) return;
  saveSeance({ ...s, exercises: [...s.exercises, { ...x.data, id: uid(), block: 'main' }] }); closeSheet(); toast(`Ajouté à « ${s.name} »`); render();
};
ACT.libKeep = async () => { const x = selEx(); if (!x) return; try { await api('POST', '/api/exercises/personal', { exercise: x.data }); await refreshExercises(); toast('Gardé dans tes exercices'); } catch (e) { toast(e.status === 409 ? 'Déjà dans tes exercices' : e.offline ? 'Il faut une connexion.' : e.message); } };
ACT.libEdit = () => { const x = selEx(); if (x) openSheet(exForm(x.data, { kind: S.libSel.kind, id: x.id })); };
ACT.libDel = async () => {
  const x = selEx(); if (!x || !confirmBox(`Supprimer « ${x.name} » ?`)) return;
  try { const kind = S.libSel.kind; await withEdit(() => api('DELETE', kind === 'common' ? `/api/exercises/common/${x.id}` : `/api/exercises/personal/${x.id}`).then(refreshExercises)); if (!$('#sheet .err')) { closeSheet(); render(); } } catch (e) { toast(e.offline ? 'Il faut une connexion.' : e.message); }
};
ACT.addEx = () => {
  const s = getSeance(S.openId); if (!s) return;
  openSheet(h`<h2 style="margin:0">Ajouter un exercice</h2>
    <button class="btn pri" data-act="editNew">✎ Créer un exercice vide</button>
    <button class="btn" data-act="pickLib">📚 Choisir dans la bibliothèque</button><button class="btn" data-act="closeSheet">Annuler</button>`);
};
ACT.editNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪' }), { kind: 'session', sid: S.openId, eid: 'new' }));
ACT.pickLib = () => { closeSheet(); S.addTo = S.openId; S.sub.seances = 'library'; render(); toast('Touche « Voir » sur un exercice pour l’ajouter'); };
ACT.doneAdd = () => { S.sub.seances = 'detail'; S.addTo = null; render(); };

/* Coller un texte de séance */
function vImport() {
  const r = S.importResult;
  return h`<div class="row"><button class="btn sm" data-act="backList" aria-label="Retour">‹</button><h1 style="margin:0">Coller un texte</h1></div>
    <p class="muted small">Colle ta séance : titre, durée, objectifs, exercices numérotés (« 1. NOM »), une ligne « charge — 4 × 8 — repos 2 min », des puces, « Travaille : … ». Chaque exercice devient un écran avec ses chronos.</p>
    <textarea data-input="imptext" style="min-height:220px" placeholder="🦵 SÉANCE JAMBES&#10;1. SQUATS&#10;+10 kg — 4 × 6–8 — repos 2 min 30&#10;• Descends avec contrôle." aria-label="Texte de la séance">${S.importText}</textarea>
    <div class="row wrapf"><button class="btn pri" data-act="parseImport">Analyser</button><button class="btn" data-act="backList">Annuler</button></div>
    ${r ? (r.session ? h`<div class="card"><h3>${r.session.emoji} ${r.session.name}</h3><div class="muted small">${r.session.exercises.length} exercices · ~${sessionMinutes(r.session)} min</div>${r.session.exercises.map((e, i) => exRow(e, i, r.session.exercises.length, {}))}${r.warnings.map((w) => h`<p class="small err">⚠ ${w}</p>`)}<button class="btn pri big" data-act="saveImport">Enregistrer cette séance</button></div>` : h`<div class="card"><p class="err">${r.warnings[0]}</p></div>`) : ''}`;
}
INPUT.imptext = (el) => { S.importText = el.value; S.importResult = null; };
ACT.openImport = () => { S.sub.seances = 'import'; S.importResult = null; render(); };
ACT.parseImport = () => { S.importResult = parseSessionText(S.importText); render(); };
ACT.saveImport = () => { const s = saveSeance(S.importResult.session); S.importText = ''; S.importResult = null; S.openId = s.id; S.sub.seances = 'detail'; toast('Séance ajoutée'); render(); };

/* ═════════ Générateur de séances ═════════ */
function vGenerate() {
  const g=S.gen, eq=g.eq||eqSet(), r=g.result, profile=S.settings.sportProfile||defaultProfile();
  const acts=Object.entries(ACTIVITY_PRESETS).concat(Object.entries(profile.activities||{}).filter(([id])=>!ACTIVITY_PRESETS[id]));
  return h`<h1>Générer une séance</h1>
    <div class="card"><b>Activité</b><div class="chips">${acts.map(([id,a])=>h`<button class="chip ${g.activityId===id?'on':''}" data-act="gSet" data-k="activityId" data-v="${id}">${a.emoji||'🏅'} ${a.label}</button>`)}</div>
      <p class="muted tiny">Tu peux ajouter tes propres activités dans ton profil : elles apparaîtront ici automatiquement.</p>
      <b>Orientation de la séance</b><div class="chips">${[['weaknesses','🎯 Travailler mes points faibles'],['strengths','🚀 Progresser dans mes points forts']].map(([k,l])=>h`<button class="chip ${g.profileMode===k?'on':''}" data-act="gSet" data-k="profileMode" data-v="${k}">${l}</button>`)}</div>
      <b>Durée</b>${g.activityId.startsWith('climbing_') ? h`<div class="chips">${Object.entries(SIZES).map(([k,v])=>h`<button class="chip ${g.size===k?'on':''}" data-act="gSet" data-k="size" data-v="${k}">${v.label} · ~${v.main+v.warm+v.cool} min</button>`)}</div>` : h`<div class="chips">${[['short','Courte'],['medium','Moyenne'],['long','Longue']].map(([k,l])=>h`<button class="chip ${g.duration===k?'on':''}" data-act="gSet" data-k="duration" data-v="${k}">${l}</button>`)}</div>`}
      ${g.activityId.startsWith('climbing_') ? h`<b>Objectif escalade</b><div class="chips">${Object.entries(FOCUS).map(([k,v])=>h`<button class="chip ${g.focus===k?'on':''}" data-act="gSet" data-k="focus" data-v="${k}">${v.emoji} ${v.label}</button>`)}<button class="chip ${g.focus==='surprise'?'on':''}" data-act="gSet" data-k="focus" data-v="surprise">🎲 Surprends-moi</button></div>`:''}
      <b>Forme du jour</b><div class="chips">${[['frais','😄 Frais'],['normal','🙂 Normal'],['fatigue','😮‍💨 Fatigué']].map(([k,l])=>h`<button class="chip ${g.feeling===k?'on':''}" data-act="gSet" data-k="feeling" data-v="${k}">${l}</button>`)}</div>
      ${g.activityId.startsWith('climbing_') ? h`<b>Matériel dispo aujourd’hui</b><div class="chips">${Object.entries(EQUIPMENT).map(([k,l])=>h`<button class="chip ${eq[k]?'on':''}" data-act="gEq" data-k="${k}">${l}</button>`)}</div>`:''}
      <button class="btn pri big" data-act="generate">✨ Générer</button></div>
    ${r ? vGenResult(r) : h`<p class="muted small center">Le générateur utilise ton activité, tes indicateurs, tes forces/faiblesses, ton historique et tes contraintes quand ces données existent.</p>`}`;
}
ACT.gSet=(el)=>{S.gen[el.dataset.k]=el.dataset.v; if(el.dataset.k==='activityId')S.gen.result=null; render();};
ACT.gEq=(el)=>{const eq={...(S.gen.eq||eqSet())};eq[el.dataset.k]=!eq[el.dataset.k];S.gen.eq=eq;render();};
ACT.generate=()=>{
  const g=S.gen, profile=S.settings.sportProfile||defaultProfile();
  if(g.activityId.startsWith('climbing_')) {
    const focusMap={climbing_boulder:g.focus,climbing_route:g.focus};
    const focus=focusMap[g.activityId]||g.focus;
    g.result=generateSession({size:g.size,focus,feeling:g.feeling,equipment:g.eq||undefined,seed:Math.floor(Math.random()*1e9)},{settings:S.settings,history:S.history,now:Date.now()});
  } else g.result=generateGenericSession({activityId:g.activityId,mode:g.profileMode,duration:g.duration},profile,S.settings);
  g.saved=false;render();setTimeout(()=>$('#genresult')?.scrollIntoView({behavior:'smooth'}),50);
};
function vGenResult(r) {
  const s = r.session;
  return h`<div id="genresult" class="card"><div class="row"><div class="ico acc">${s.emoji}</div><div class="grow"><h3>${s.name}</h3><div class="muted small">~${sessionMinutes(s)} min · échauffement ${r.meta.warmMin} min</div></div></div>
    ${notesBlock(s)}
    ${blocksOf(s, (e, i) => exRow(e, i, s.exercises.length, { swap: e.block === 'main' }))}
    <div class="row wrapf"><button class="btn pri" data-act="play" data-gen="1">▶ Lancer</button><button class="btn" data-act="saveGen" ${S.gen.saved ? 'disabled' : ''}>${S.gen.saved ? '✓ Enregistrée' : '💾 Enregistrer'}</button><button class="btn" data-act="generate">🔁 Autre proposition</button></div></div>`;
}
ACT.swapEx = (el) => { S.gen.result.session = swapExercise(S.gen.result.session, el.dataset.id, { settings: S.settings }); S.gen.saved = false; render(); };
ACT.saveGen = () => { const s = saveSeance({ ...S.gen.result.session, id: S.gen.result.session.id }); S.gen.result.session = s; S.gen.saved = true; toast('Ajoutée à Mes séances'); render(); };

/* ═════════ Progrès ═════════ */
function vProgress() {
  return h`<h1>Progrès</h1>${seg('subProg', S.sub.progress, [['me', 'Moi'], ['friends', 'Amis']])}${S.sub.progress === 'me' ? vMe() : vFriends()}`;
}
ACT.subProg = (el) => { S.sub.progress = el.dataset.id; render(); if (el.dataset.id === 'friends') loadSocial(); };
function bars(values, labels) {
  const max = Math.max(1, ...values);
  return h`<div class="bars">${values.map((v, i) => h`<div style="height:${Math.round((v / max) * 100)}%" title="${v}"></div>`)}</div><div class="row" style="justify-content:space-between"><span class="tiny muted">${labels[0]}</span><span class="tiny muted">${labels[1]}</span></div>`;
}
function bodySvg(regions) {
  const max = Math.max(1, ...Object.values(regions));
  const part = (id, tag, attrs) => { const v = regions[id] || 0; return `<${tag} class="b" ${attrs}/>` + (v ? `<${tag} class="h" style="opacity:${(0.25 + 0.75 * v / max).toFixed(2)}" ${attrs}/>` : ''); };
  const pair = (id, tag, a1, a2) => part(id, tag, a1) + part(id, tag, a2);
  const head = '<circle class="b" cx="100" cy="20" r="14"/>';
  const front = head + pair('shoulders', 'ellipse', 'cx="66" cy="52" rx="15" ry="11"', 'cx="134" cy="52" rx="15" ry="11"') + part('chest', 'rect', 'x="78" y="46" width="44" height="26" rx="12"') + part('core', 'rect', 'x="83" y="74" width="34" height="38" rx="12"')
    + pair('biceps', 'ellipse', 'cx="54" cy="80" rx="8" ry="18"', 'cx="146" cy="80" rx="8" ry="18"') + pair('forearms', 'ellipse', 'cx="46" cy="118" rx="7" ry="20"', 'cx="154" cy="118" rx="7" ry="20"')
    + pair('quads', 'ellipse', 'cx="88" cy="158" rx="15" ry="36"', 'cx="112" cy="158" rx="15" ry="36"') + part('adductors', 'rect', 'x="96" y="132" width="8" height="34" rx="4"') + pair('calves', 'ellipse', 'cx="86" cy="208" rx="9" ry="20"', 'cx="114" cy="208" rx="9" ry="20"');
  const back = head + part('upback', 'path', 'd="M78 44 Q100 36 122 44 L118 66 Q100 72 82 66Z"') + pair('lats', 'ellipse', 'cx="82" cy="86" rx="11" ry="20"', 'cx="118" cy="86" rx="11" ry="20"')
    + pair('shoulders', 'ellipse', 'cx="66" cy="52" rx="15" ry="11"', 'cx="134" cy="52" rx="15" ry="11"') + pair('triceps', 'ellipse', 'cx="54" cy="80" rx="8" ry="18"', 'cx="146" cy="80" rx="8" ry="18"')
    + pair('forearms', 'ellipse', 'cx="46" cy="118" rx="7" ry="20"', 'cx="154" cy="118" rx="7" ry="20"') + part('lowback', 'rect', 'x="86" y="104" width="28" height="18" rx="8"') + pair('glutes', 'ellipse', 'cx="90" cy="134" rx="14" ry="14"', 'cx="110" cy="134" rx="14" ry="14"')
    + pair('hamstrings', 'ellipse', 'cx="88" cy="172" rx="14" ry="28"', 'cx="112" cy="172" rx="14" ry="28"') + pair('calves', 'ellipse', 'cx="86" cy="212" rx="9" ry="17"', 'cx="114" cy="212" rx="9" ry="17"');
  return raw(`<div class="grid2"><svg class="body" viewBox="0 0 200 232" role="img" aria-label="Muscles travaillés, vue de face">${front}</svg><svg class="body" viewBox="0 0 200 232" role="img" aria-label="Muscles travaillés, vue de dos">${back}</svg></div>`);
}
function exSeries(key) {
  const pts = [];
  for (const hh of [...S.history].sort((a, b) => a.startedAt - b.startedAt)) {
    const ex = (hh.data?.exercises || []).find((e) => exKey(e.name) === key); if (!ex) continue;
    const sets = (ex.sets || []).filter((s) => s.done !== false), load = Math.max(0, ...sets.map((s) => s.load || 0)), sec = Math.max(0, ...sets.map((s) => s.seconds || 0)), reps = Math.max(0, ...sets.map((s) => s.reps || 0));
    pts.push({ t: hh.startedAt, v: load || sec || reps, unit: load ? 'kg' : sec ? 's' : 'reps' });
  }
  return pts;
}
function lineChart(pts) {
  if (pts.length < 2) return h`<p class="muted small">Il faut au moins 2 séances avec cet exercice pour tracer la courbe.</p>`;
  const W = 300, H = 110, min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v)), span = Math.max(1, max - min);
  const xy = pts.map((p, i) => [10 + (i / (pts.length - 1)) * (W - 20), H - 15 - ((p.v - min) / span) * (H - 30)]);
  return raw(`<svg viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="Évolution"><polyline fill="none" stroke="var(--accent)" stroke-width="3" points="${xy.map((p) => p.join(',')).join(' ')}"/>${xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--accent)"/>`).join('')}<text x="6" y="12" font-size="11" fill="var(--muted)">${max} ${pts[0].unit}</text><text x="6" y="${H - 2}" font-size="11" fill="var(--muted)">${min} ${pts[0].unit}</text></svg>`);
}
function goalList() { return Array.isArray(S.settings.goals) ? S.settings.goals : []; }
function goalCurrent(g) {
  if (g.kind === 'sessions') return S.history.filter((x) => ymd(new Date(x.startedAt)) >= (g.since || '1970-01-01')).length;
  if (g.kind === 'grade') return g.current || 0;
  if (g.kind === 'climb') return (S.settings.climbingLogs || []).filter((x) => x.result === 'send').length;
  return Number(g.current || 0);
}
function vGoals() {
  const gs = goalList();
  return h`<div class="card"><div class="row between"><h3>🎯 Objectifs</h3><button class="btn sm" data-act="addGoal">＋ Ajouter</button></div>
    ${gs.length ? gs.map((g, i) => { const cur = goalCurrent(g), target = Math.max(1, Number(g.target || 1)), pct = Math.max(0, Math.min(100, Math.round(cur / target * 100))); return h`<div class="goal"><div class="row between small"><b>${g.name}</b><span>${cur} / ${target} ${g.unit || ''}</span></div><div class="meter"><i style="width:${pct}%"></i></div><div class="row between tiny muted"><span>${pct}%</span><button class="btn sm danger" data-act="delGoal" data-i="${i}">Supprimer</button></div></div>`; }) : h`<p class="muted small">Ajoute un objectif mesurable : tractions, charge, séances, blocs/voies réussis…</p>`}</div>`;
}
function vClimbing() {
  const logs = (S.settings.climbingLogs || []).slice(0, 8);
  return h`<div class="card"><div class="row between"><h3>🧗 Journal escalade</h3><button class="btn sm pri" data-act="addClimb">＋ Ajouter</button></div>${logs.length ? logs.map(x => h`<div class="item"><div class="grow"><b>${x.grade || 'Sans niveau'} · ${x.type || 'Séance'}</b><div class="muted small">${x.result || '—'} · ${x.attempts || 0} tentative(s)${x.style ? ' · ' + x.style : ''}</div>${x.note ? h`<div class="tiny">${x.note}</div>` : ''}</div><span class="tiny muted">${fmtDate(x.date)}</span></div>`) : h`<p class="muted small">Note tes blocs et voies ici pour suivre ton niveau indépendamment des séances de renforcement.</p>`}</div>`;
}
function vMe() {
  const now = Date.now(), sum = summarizeHistory(S.history, now, tz()), all = groupLoads(S.history, now, 30), sil = groupLoads(S.history, now, S.silDays);
  const total = Object.values(all.groups).reduce((a, b) => a + b, 0);
  const names = new Map(); for (const hh of S.history) for (const e of hh.data?.exercises || []) names.set(exKey(e.name), e.name);
  const key = S.progressEx && names.has(S.progressEx) ? S.progressEx : [...names.keys()][0] || '';
  if (!S.history.length) return h`<div class="card flat center"><p>Aucune séance enregistrée.</p><p class="muted small">Lance une séance et termine-la : tes progrès apparaîtront ici.</p></div>`;
  return h`<div class="grid4"><div class="stat"><b>${sum.sessions7}</b><span>7 jours</span></div><div class="stat"><b>${sum.sessions30}</b><span>30 jours</span></div><div class="stat"><b>${sum.streak}</b><span>d’affilée</span></div><div class="stat"><b>${sum.minutes30}</b><span>min / 30 j</span></div></div>
    <div class="card"><h3>Séances par semaine</h3>${bars(sum.weekly, ['il y a 8 sem.', 'cette semaine'])}</div>
    <div class="card"><div class="row between"><h3>Muscles travaillés</h3>${seg('silDays', String(S.silDays), [['7', '7 j'], ['30', '30 j']])}</div>${bodySvg(sil.regions)}<p class="muted small center">Plus la couleur est vive, plus la zone a travaillé.</p></div>
    <div class="card"><h3>Équilibre (30 jours)</h3>${Object.keys(GROUP_LABEL).map((g) => { const share = total ? all.groups[g] / total : 0; return h`<div><div class="row between small"><span>${GROUP_LABEL[g]}</span><span class="muted">${Math.round(share * 100)} % <span class="tiny">(idéal ~${Math.round(GROUP_TARGET[g] * 100)} %)</span></span></div><div class="meter"><i style="width:${Math.min(100, Math.round((share / GROUP_TARGET[g]) * 50))}%"></i></div></div>`; })}<p class="muted tiny">La barre est à moitié quand tu es pile sur l’idéal. Le générateur pousse ce qui est en retard.</p></div>
    <div class="card"><h3>Évolution d’un exercice</h3><select data-change="progEx" aria-label="Exercice">${[...names].map(([k, n]) => h`<option value="${k}" ${k === key ? 'selected' : ''}>${n}</option>`)}</select>${lineChart(exSeries(key))}</div>
    ${sum.records.length ? h`<div class="card"><h3>🏆 Records</h3>${sum.records.map((r) => h`<div class="item"><div class="grow"><b>${r.name}</b></div><span>${r.kind === 'load' ? `${r.value} kg × ${r.reps}` : r.kind === 'time' ? `${r.value} s` : `${r.value} reps`}</span></div>`)}</div>` : ''}
    <div class="card"><h3>Historique</h3>${S.history.slice(0, 15).map((x) => h`<div class="item"><div class="grow"><b>${x.sessionName}</b><div class="muted small">${fmtDate(x.startedAt)} · ${Math.round(x.durationSeconds / 60)} min${x.data?.rpe ? ' · ressenti ' + x.data.rpe + '/5' : ''}${x.data?.note ? ' · 📝 ' + x.data.note : ''}</div></div><button class="btn danger sm" data-act="delHist" data-id="${x.id}" aria-label="Supprimer">✕</button></div>`)}</div>`;
}
ACT.silDays = (el) => { S.silDays = Number(el.dataset.id); render(); };
ACT.addDomain=(el)=>{const id=el.dataset.id;openSheet(h`<h2 style="margin:0">Nouvelle catégorie</h2><form data-submit="addDomain" class="card" style="border:0;padding:0"><label>Nom<input name="name" maxlength="60" required placeholder="Ex. puissance, mobilité, précision…"></label><label>Description<input name="description" maxlength="180" placeholder="À quoi correspond cette catégorie ?"></label><button class="btn pri" type="submit">Ajouter</button></form>`);S.domainActivity=id;};
SUBMIT.addDomain=(form)=>{const f=Object.fromEntries(new FormData(form)),p=S.settings.sportProfile||defaultProfile(),d=addDomain(p,S.domainActivity,f.name,f.description);if(!d)return toast('Nom invalide.');S.settings.sportProfile=p;saveSettings();closeSheet();render();toast(`Catégorie « ${d.name} » ajoutée.`);};
ACT.delMetric=(el)=>{const p=S.settings.sportProfile||defaultProfile();p.metrics=(p.metrics||[]).filter(m=>m.id!==el.dataset.id);S.settings.sportProfile=p;saveSettings();render();};
ACT.editMetric=(el)=>{const p=S.settings.sportProfile||defaultProfile(),m=(p.metrics||[]).find(x=>x.id===el.dataset.id);if(!m)return;const acts=Object.entries(ACTIVITY_PRESETS).concat(Object.entries(p.activities||{}).filter(([id])=>!ACTIVITY_PRESETS[id]));S.editMetricId=m.id;openSheet(h`<h2 style="margin:0">Modifier l’information</h2><form data-submit="editMetric" class="card" style="border:0;padding:0"><label>Activité<select name="activityId">${acts.map(([id,a])=>h`<option value="${id}" ${id===m.activityId?'selected':''}>${a.emoji||'🏅'} ${a.label}</option>`)}</select></label><label>Nom<input name="name" maxlength="80" required value="${m.name}"></label><label>Valeur<input name="value" type="number" step="0.1" value="${m.value}"></label><label>Unité<input name="unit" maxlength="20" value="${m.unit||''}"></label><label>Score personnel<input name="score" type="number" min="0" max="100" step="1" value="${m.score??''}"></label><label>Domaine<input name="domain" maxlength="50" value="${m.domain||''}"></label><label>Note<textarea name="note" maxlength="300" rows="2">${m.note||''}</textarea></label><button class="btn pri" type="submit">Enregistrer</button></form>`);};
SUBMIT.editMetric=(form)=>{const f=Object.fromEntries(new FormData(form)),p=S.settings.sportProfile||defaultProfile(),m=addMetric(p,{id:S.editMetricId,activityId:f.activityId,name:f.name,value:f.value,unit:f.unit,domain:f.domain,score:f.score===''?null:f.score,note:f.note});if(!m)return toast('Données invalides.');S.settings.sportProfile=p;saveSettings();closeSheet();render();toast('Information modifiée.');};
ACT.addActivity=()=>openSheet(h`<h2 style="margin:0">Ajouter une activité</h2><form data-submit="addActivity" class="card" style="border:0;padding:0"><label>Nom de l’activité<input name="name" maxlength="60" required placeholder="Ex. Tennis, ski, handball…"></label><label>Mots-clés (facultatif)<input name="aliases" maxlength="180" placeholder="synonymes séparés par des virgules"></label><button class="btn pri" type="submit">Créer et analyser</button></form>`);
SUBMIT.addActivity=(form)=>{const f=Object.fromEntries(new FormData(form)),p=S.settings.sportProfile||defaultProfile(),aliases=String(f.aliases||'').split(',').map(x=>x.trim()).filter(Boolean),a=addActivity(p,f.name,aliases);if(!a)return toast('Nom invalide.');S.settings.sportProfile=p;saveSettings();closeSheet();render();toast(`${a.label} ajoutée avec ses catégories initiales.`);};
ACT.sportActivity=(el)=>{const id=el.dataset.id,p=S.settings.sportProfile||defaultProfile();ensureActivity(p,id);S.settings.sportProfile=p;saveSettings();render();};
ACT.addMetric=()=>{ const p=S.settings.sportProfile||defaultProfile(), acts=Object.entries(ACTIVITY_PRESETS).concat(Object.entries(p.activities||{}).filter(([id])=>!ACTIVITY_PRESETS[id])); const domains=[...new Set(acts.flatMap(([id])=>((ACTIVITY_PRESETS[id]||p.activities?.[id])?.domains||[]).map(d=>Array.isArray(d)?d[0]:d.key)))]; openSheet(h`<h2 style="margin:0">Ajouter une information sportive</h2><form data-submit="addMetric" class="card" style="border:0;padding:0"><label>Activité<select name="activityId">${acts.map(([id,a])=>h`<option value="${id}">${a.emoji||'🏅'} ${a.label}</option>`)}</select></label><label>Information / performance<input name="name" maxlength="80" required placeholder="Ex. Max tractions, 5 km, niveau en dalle…"></label><label>Valeur<input name="value" type="number" step="0.1" placeholder="Ex. 16"></label><label>Unité<input name="unit" maxlength="20" placeholder="reps, kg, min, km…"></label><label>Domaine<select name="domain"><option value="">Détection automatique</option>${domains.map(x=>h`<option>${x}</option>`)}</select></label><label>Score personnel (0–100, facultatif)<input name="score" type="number" min="0" max="100" step="1" placeholder="Laisse vide pour une estimation interne"></label><label>Note<textarea name="note" maxlength="300" rows="2"></textarea></label><button class="btn pri" type="submit">Enregistrer</button></form>`); };
SUBMIT.addMetric=(form)=>{const f=Object.fromEntries(new FormData(form)),p=S.settings.sportProfile||defaultProfile();ensureActivity(p,f.activityId);const m=addMetric(p,{activityId:f.activityId,name:f.name,value:f.value,unit:f.unit,domain:f.domain,score:f.score===''?null:f.score,note:f.note});if(!m)return toast('Ajoute au moins un nom et une valeur.');S.settings.sportProfile=p;saveSettings();closeSheet();render();toast(`« ${m.name} » enregistré : domaine ${m.domain}.`);};

ACT.addGoal = () => openSheet(h`<h2 style="margin:0">Nouvel objectif</h2><form data-submit="addGoal" class="card" style="border:0;padding:0"><label>Nom<input name="name" maxlength="80" required placeholder="Ex. 20 tractions"></label><label>Valeur cible<input name="target" type="number" min="1" step="0.1" required></label><label>Type<select name="kind"><option value="manual">Valeur manuelle</option><option value="sessions">Nombre de séances</option><option value="climb">Réussites escalade</option></select></label><label>Unité<input name="unit" maxlength="15" placeholder="reps, kg, séances…"></label><label>Valeur actuelle (si manuelle)<input name="current" type="number" min="0" step="0.1" value="0"></label><button class="btn pri" type="submit">Créer</button></form>`);
SUBMIT.addGoal = (form) => { const f = Object.fromEntries(new FormData(form)); S.settings.goals = [...goalList(), { id: uid(), name: String(f.name).trim(), target: Number(f.target), unit: String(f.unit || '').trim(), kind: f.kind || 'manual', current: Number(f.current || 0), since: f.kind === 'sessions' ? ymd(new Date()) : undefined }]; saveSettings(); closeSheet(); render(); };
ACT.delGoal = (el) => { const gs = goalList(); gs.splice(Number(el.dataset.i), 1); S.settings.goals = gs; saveSettings(); render(); };
ACT.addClimb = () => openSheet(h`<h2 style="margin:0">Ajouter une performance d’escalade</h2><form data-submit="addClimb" class="card" style="border:0;padding:0"><label>Type<select name="type"><option>Bloc</option><option>Voie</option><option>Poutre</option></select></label><label>Niveau / charge<input name="grade" maxlength="20" placeholder="7b, 6C, +10 kg…"></label><label>Résultat<select name="result"><option value="send">Réussi</option><option value="flash">Flash</option><option value="work">Après travail</option><option value="fail">Échec</option></select></label><label>Tentatives<input name="attempts" type="number" min="1" max="999" value="1"></label><label>Style<input name="style" maxlength="40" placeholder="Dalle, dévers, dynamique…"></label><label>Note<textarea name="note" maxlength="300" rows="3"></textarea></label><button class="btn pri" type="submit">Enregistrer</button></form>`);
SUBMIT.addClimb = (form) => { const f = Object.fromEntries(new FormData(form)); S.settings.climbingLogs = [{ id: uid(), date: Date.now(), type: f.type, grade: String(f.grade || '').trim(), result: f.result, attempts: Math.max(1, Number(f.attempts) || 1), style: String(f.style || '').trim(), note: String(f.note || '').trim() }, ...(S.settings.climbingLogs || [])].slice(0, 500); saveSettings(); closeSheet(); render(); };

CHG.progEx = (el) => { S.progressEx = el.value; render(); };
ACT.delHist = (el) => { if (!confirmBox('Supprimer cette séance de l’historique ?')) return; S.history = S.history.filter((x) => x.id !== el.dataset.id); queue('DELETE', `/api/history/${encodeURIComponent(el.dataset.id)}`); render(); };

/* Communauté */
async function loadSocial() {
  const so = S.social; so.loading = true; so.error = ''; render();
  try { so.me = await api('GET', '/api/social/me'); so.feed = await api('GET', '/api/social/feed?tz=' + tz()); }
  catch (e) { so.error = e.offline ? 'Connexion requise pour voir la communauté.' : e.message; }
  so.loading = false; render();
}
function vFriends() {
  const so = S.social;
  if (so.error && !so.me) return h`<div class="card flat"><p class="err">${so.error}</p><button class="btn" data-act="reloadSocial">Réessayer</button></div>`;
  if (!so.me) return h`<p class="muted center">Chargement…</p>`;
  const p = so.me.profile, mine = summarizeHistory(S.history, Date.now(), tz());
  return h`<div class="card" id="socform"><h3>Partager ma progression</h3><p class="muted small">Par défaut, personne ne voit rien. Tu choisis qui peut te voir et ce qui est partagé.</p>
      <label>Qui peut me voir ?<select data-change="socprofile" name="vis"><option value="private" ${p.visibility === 'private' ? 'selected' : ''}>Personne (privé)</option><option value="followers" ${p.visibility === 'followers' ? 'selected' : ''}>Seulement ceux que j’accepte</option><option value="public" ${p.visibility === 'public' ? 'selected' : ''}>Tous les membres</option></select></label>
      <label class="chk"><input type="checkbox" data-change="socprofile" name="stats" ${p.shareStats ? 'checked' : ''}> Mes statistiques (séances, régularité)</label>
      <label class="chk"><input type="checkbox" data-change="socprofile" name="records" ${p.shareRecords ? 'checked' : ''}> Mes records</label>
      <label class="chk"><input type="checkbox" data-change="socprofile" name="sessions" ${p.shareSessions ? 'checked' : ''}> Mes dernières séances</label></div>
    ${so.me.pending.length ? h`<div class="card"><h3>Demandes en attente</h3>${so.me.pending.map((r) => h`<div class="item"><div class="grow"><b>${r.username}</b> veut te suivre</div><button class="btn pri sm" data-act="socRespond" data-id="${r.id}" data-accept="1">Accepter</button><button class="btn sm" data-act="socRespond" data-id="${r.id}" data-accept="">Refuser</button></div>`)}</div>` : ''}
    <div class="card"><h3>Trouver un ami</h3><input type="text" data-input="socsearch" placeholder="Pseudo (2 lettres minimum)" aria-label="Chercher un pseudo" autocomplete="off"><div id="socresults"></div><p class="muted tiny">Seuls les membres qui ont choisi d’être visibles apparaissent.</p></div>
    <h2>Ceux que je suis</h2>
    ${so.feed?.people.length ? so.feed.people.map((u) => vPerson(u, mine)) : h`<div class="card flat"><p class="muted">Tu ne suis personne (ou ils n’ont rien partagé).</p></div>`}
    ${so.me.following.filter((f) => f.status === 'pending').map((f) => h`<div class="card"><div class="row"><div class="grow">⏳ Demande envoyée à <b>${f.username}</b></div><button class="btn sm" data-act="socUnfollow" data-user="${f.username}">Annuler</button></div></div>`)}`;
}
function vPerson(u, mine) {
  const s = u.stats;
  return h`<div class="card"><div class="row"><div class="ico">👤</div><div class="grow"><b>${u.username}</b><div class="muted small">${s?.lastAt ? 'Dernière séance : ' + fmtDate(s.lastAt) : 'Pas encore de séance'}</div></div><button class="btn sm" data-act="socUnfollow" data-user="${u.username}">Ne plus suivre</button></div>
    ${s ? h`<div class="grid3"><div class="stat"><b>${s.sessions30}</b><span>séances / 30 j<br>toi : ${mine.sessions30}</span></div><div class="stat"><b>${s.streak}</b><span>jours d’affilée<br>toi : ${mine.streak}</span></div><div class="stat"><b>${s.minutes30}</b><span>min / 30 j<br>toi : ${mine.minutes30}</span></div></div>${bars(s.weekly, ['il y a 8 sem.', 'cette semaine'])}` : h`<p class="muted small">Statistiques non partagées.</p>`}
    ${u.records?.length ? h`<div><b class="small">🏆 Records</b>${u.records.map((r) => h`<div class="item"><div class="grow small">${r.name}</div><span class="small">${r.kind === 'load' ? `${r.value} kg × ${r.reps}` : r.kind === 'time' ? `${r.value} s` : `${r.value} reps`}</span></div>`)}</div>` : ''}
    ${u.recent?.length ? h`<div><b class="small">Dernières séances</b>${u.recent.map((r) => h`<div class="muted small">${fmtDate(r.t)} · ${r.name} · ${r.minutes} min</div>`)}</div>` : ''}</div>`;
}
ACT.reloadSocial = loadSocial;
CHG.socprofile = async () => {
  const f = $('#socform'); if (!f) return;
  const body = { visibility: f.querySelector('[name=vis]').value, shareStats: f.querySelector('[name=stats]').checked, shareRecords: f.querySelector('[name=records]').checked, shareSessions: f.querySelector('[name=sessions]').checked };
  try { await api('POST', '/api/social/profile', body); toast('Préférences de partage enregistrées'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); }
};
INPUT.socsearch = (el) => {
  clearTimeout(INPUT.socsearch.t);
  INPUT.socsearch.t = setTimeout(async () => {
    const box = $('#socresults'); if (!box) return; const q = el.value.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    try {
      const r = await api('GET', '/api/social/search?q=' + encodeURIComponent(q));
      box.innerHTML = h`${r.users.length ? r.users.map((u) => h`<div class="item"><div class="grow"><b>${u.username}</b> <span class="tag">${u.visibility === 'public' ? 'public' : 'sur validation'}</span></div>${u.relation === 'accepted' ? h`<span class="small">✓ suivi</span>` : u.relation === 'pending' ? h`<span class="small">⏳ en attente</span>` : h`<button class="btn pri sm" data-act="socFollow" data-user="${u.username}">Suivre</button>`}</div>`) : h`<p class="muted small">Personne trouvé.</p>`}`.s;
    } catch (e) { box.innerHTML = h`<p class="err small">${e.offline ? 'Connexion requise.' : e.message}</p>`.s; }
  }, 350);
};
ACT.socFollow = async (el) => { try { const r = await api('POST', '/api/social/follow', { username: el.dataset.user }); toast(r.status === 'accepted' ? 'Tu suis cette personne' : 'Demande envoyée'); loadSocial(); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); } };
ACT.socUnfollow = async (el) => { try { await api('POST', '/api/social/unfollow', { username: el.dataset.user }); loadSocial(); } catch (e) { toast(e.message); } };
ACT.socRespond = async (el) => { try { await api('POST', '/api/social/respond', { id: el.dataset.id, accept: !!el.dataset.accept }); loadSocial(); } catch (e) { toast(e.message); } };

/* ═════════ Réglages ═════════ */
function saveSettings() { saveLocal(); queue('POST', '/api/settings', { settings: S.settings }); }
function profileAnalysisCard(activityId, profile) {
  const a=ACTIVITY_PRESETS[activityId]||profile.activities?.[activityId]; if(!a)return '';
  const an=analyzeProfile(profile,activityId), metrics=(profile.metrics||[]).filter(m=>m.activityId===activityId);
  return h`<div class="card flat"><div class="row between"><b>${a.emoji||'🏅'} ${a.label}</b><div class="row"><span class="tiny muted">${an.metricCount} indicateur(s)</span><button class="btn sm" data-act="addDomain" data-id="${activityId}">＋ Catégorie</button></div></div>${an.domains.length?an.domains.map(d=>h`<div class="item"><div class="grow"><b>${d.label||d.domain}</b><div class="meter"><i style="width:${d.score}%"></i></div></div><span class="small">${d.score}/100</span></div>`):h`<p class="muted tiny">Aucune donnée. Ajoute ton niveau, un record ou un score.</p>`}${an.strengths.length?h`<p class="small"><b>Forces détectées :</b> ${an.strengths.map(x=>x.label||x.domain).join(', ')}</p>`:''}${an.weaknesses.length?h`<p class="small"><b>Axes à travailler :</b> ${an.weaknesses.map(x=>x.label||x.domain).join(', ')}</p>`:''}${metrics.length?h`<details><summary>Informations enregistrées</summary>${metrics.slice(0,20).map(m=>h`<div class="item"><div class="grow"><b>${m.name}</b><div class="muted tiny">${m.value} ${m.unit||''} · ${m.domain}</div></div><button class="btn sm" data-act="editMetric" data-id="${m.id}">Modifier</button><button class="btn danger sm" data-act="delMetric" data-id="${m.id}">✕</button></div>`)}</details>`:''}</div>`;
}
function vSportProfile(){
  const p=S.settings.sportProfile||defaultProfile(), acts=Object.entries(ACTIVITY_PRESETS).concat(Object.entries(p.activities||{}).filter(([id])=>!ACTIVITY_PRESETS[id]));
  return h`<div class="card"><div class="row between"><h3>🧠 Profil sportif intelligent</h3><button class="btn sm pri" data-act="addActivity">＋ Activité</button></div><p class="muted small">Ton profil ne stocke pas seulement des performances : chaque indicateur est rattaché à un domaine. Le moteur peut ainsi comparer tes domaines à l’intérieur d’une activité et orienter les séances vers tes points faibles ou tes points forts.</p>
    <div class="chips">${acts.map(([id,a])=>h`<button class="chip ${p.activities?.[id]?'on':''}" data-act="sportActivity" data-id="${id}">${a.emoji||'🏅'} ${a.label}</button>`)}</div>
    ${acts.map(([id,a])=>p.activities?.[id]?profileAnalysisCard(id,p):'').join('')}
    <button class="btn" data-act="addMetric">＋ Ajouter une information / performance</button>
  </div>`;
}
function vSettings() {
  const st=S.settings, lv=st.level||{}, eq=st.equipment||{}, av=st.avoid||{};
  const gradeSel=(name,cur)=>h`<select name="${name}"><option value="">—</option>${GRADES.slice(3).map(g=>h`<option ${g===cur?'selected':''}>${g}</option>`)}</select>`;
  return h`<h1>Réglages</h1>${vSportProfile()}
    <form data-submit="saveProfile" class="card"><h3>🧗 Profil escalade détaillé</h3><p class="muted small">Ces champs restent utiles pour les générateurs escalade. Les autres activités se configurent dans le profil intelligent ci-dessus.</p>
      <div class="grid3"><label>Bloc max${gradeSel('boulderMax',lv.boulderMax)}</label><label>Voie max${gradeSel('routeMax',lv.routeMax)}</label><label>Années de grimpe<input type="number" name="years" min="0" max="80" step="0.5" value="${lv.years??''}"></label></div>
      <b class="small">Mon matériel</b>${Object.entries(EQUIPMENT).map(([k,l])=>h`<label class="chk"><input type="checkbox" name="eq_${k}" ${(st.equipment?eq[k]:k==='wall')?'checked':''}> ${l}</label>`)}
      <b class="small">Zones à ménager</b>${[['fingers','Doigts / poulies'],['shoulders','Épaules'],['elbows','Coudes'],['knees','Genoux / chevilles']].map(([k,l])=>h`<label class="chk"><input type="checkbox" name="av_${k}" ${av[k]?'checked':''}> ${l}</label>`)}
      <button class="btn pri" type="submit">Enregistrer mon profil</button></form>
    <div class="card"><h3>▶ Pendant la séance</h3><label>Repos par défaut (s)<input type="number" data-change="pref" name="defaultRest" min="0" max="600" value="${st.defaultRest??60}"></label>${[['sound','Bips pour les chronos'],['vibration','Vibration en fin de repos'],['voice','Lire les exercices à voix haute'],['keepAwake','Garder l’écran allumé'],['handsFree','Mode mains pleines de magnésie']].map(([k,l])=>h`<label class="chk"><input type="checkbox" data-change="pref" name="${k}" ${st[k]?'checked':''}> ${l}</label>`)}</div>
    ${vAppearance()}<div class="card"><h3>👤 Compte : ${S.user.username}</h3><div class="row wrapf"><button class="btn" data-act="chpass">Changer le mot de passe</button><button class="btn" data-act="export">📥 Sauvegarde (fichier)</button><label class="btn" style="display:inline-block;cursor:pointer">📤 Restaurer<input type="file" accept="application/json" data-change="importFile" class="hidden"></label></div><div class="row wrapf">${S.unlocked?h`<button class="btn" data-act="lockEdit">🔓 Reverrouiller</button>`:h`<button class="btn" data-act="askUnlock">🔒 Code de modification</button>`}<button class="btn" data-act="syncNow">🔄 Synchroniser</button><button class="btn" data-act="diag">🩺 Diagnostic</button></div><div class="row wrapf"><button class="btn" data-act="logout">Se déconnecter</button><button class="btn danger" data-act="delAccount">Supprimer mon compte</button></div></div>
    <p class="muted tiny center">Seances entrainement · v7.0 · Plateforme sportive multi-activité.</p>`;
}
SUBMIT.saveProfile = (form) => {
  const f = Object.fromEntries(new FormData(form)), keys = Object.keys(EQUIPMENT);
  S.settings = { ...S.settings, onboarded: true, sportProfile: S.settings.sportProfile || defaultProfile(), level: { boulderMax: f.boulderMax || '', routeMax: f.routeMax || '', years: f.years === '' ? null : Number(f.years) },
    equipment: Object.fromEntries(keys.map((k) => [k, !!f['eq_' + k]])), avoid: Object.fromEntries(['fingers', 'shoulders', 'elbows', 'knees'].map((k) => [k, !!f['av_' + k]])) };
  saveSettings(); toast('Profil enregistré'); render();
};
CHG.pref = (el) => { S.settings[el.name] = el.type === 'checkbox' ? el.checked : clamp(el.value, 0, 600, 60); saveSettings(); applyHands(); };
CHG.accent = (el) => setAppearance({ accent: el.value });
ACT.syncNow = () => { toast('Synchronisation…'); syncAll(); };
ACT.diag = async () => {
  try { const r = await api('GET', '/api/health'); const me = await api('GET', '/api/auth/me'); openSheet(h`<h2 style="margin:0">Diagnostic</h2><p>✅ Serveur joignable · ✅ connecté en tant que <b>${me.user.username}</b></p><p>${r.db ? '✅' : '❌'} Base de données D1</p><p>${r.editCode ? '✅' : '⚠️'} Code de modification ${r.editCode ? 'configuré' : 'absent (variable EDIT_CODE)'}</p><p>Invitation obligatoire : ${r.inviteRequired ? 'oui' : 'non'}</p><p class="muted small">Synchro : ${S.sync} · ${S.outbox.length} action(s) en attente · ${S.seances.items.length} séances · ${S.history.length} séances faites</p><button class="btn" data-act="closeSheet">Fermer</button>`); }
  catch (e) { openSheet(h`<h2 style="margin:0">Diagnostic</h2><p class="err">${e.offline ? 'Serveur injoignable (hors ligne ?)' : e.message}</p><button class="btn" data-act="closeSheet">Fermer</button>`); }
};
ACT.askUnlock = () => { S.afterUnlock = null; openSheet(h`<h2 style="margin:0">Code de modification</h2><form data-submit="unlock" class="card" style="border:0;padding:0"><input type="password" name="code" autocomplete="off" required placeholder="Code" aria-label="Code"><button class="btn pri" type="submit">Débloquer</button></form>`); };
ACT.chpass = () => openSheet(h`<h2 style="margin:0">Changer le mot de passe</h2><form data-submit="chpass" class="card" style="border:0;padding:0"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden"><label>Mot de passe actuel<input type="password" name="current" autocomplete="current-password" required></label><label>Nouveau (8 caractères min.)<input type="password" name="next" autocomplete="new-password" required minlength="8"></label><p class="muted tiny">Tes autres appareils seront déconnectés.</p><button class="btn pri" type="submit">Changer</button></form>`);
SUBMIT.chpass = async (form) => { const f = Object.fromEntries(new FormData(form)); try { await api('POST', '/api/auth/password', { current: f.current, next: f.next }); closeSheet(); toast('Mot de passe changé'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); } };
ACT.delAccount = () => { if (!confirmBox('Supprimer définitivement ton compte et toutes tes données ?')) return; openSheet(h`<h2 style="margin:0">Confirmer la suppression</h2><form data-submit="delacct" class="card" style="border:0;padding:0"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden"><label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label><button class="btn danger" type="submit">Supprimer définitivement</button></form>`); };
SUBMIT.delacct = async (form) => { try { await api('POST', '/api/auth/delete', { password: new FormData(form).get('password') }); store.del(DKEY()); store.del('sea:user'); closeSheet(); S.user = null; S.authMode = 'register'; render(); toast('Compte supprimé'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); } };
ACT.export = () => {
  const appearance = window.__sea?.load?.() || {};
  const data = {
    app: 'seance-entrainement', version: 6, exportedAt: new Date().toISOString(),
    seances: S.seances, history: S.history, events: S.events, settings: S.settings,
    personal: S.personal, appearance,
  };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'seances-entrainement-sauvegarde.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
CHG.importFile = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app && d.app !== 'seance-entrainement') throw new Error('format');
    const inc = readStored(d.seances ?? []);
    S.seances = mergeSeances(S.seances, inc);
    const have = new Set(S.history.map((x) => x.id)); let nh = 0;
    for (const x of (d.history || []).slice(0, 500)) if (x?.id && !have.has(x.id)) { S.history.push(x); queue('POST', '/api/history', x); nh++; }
    S.history.sort((a, b) => b.startedAt - a.startedAt);
    const haveE = new Set(S.events.map((x) => x.id)); let ne = 0;
    for (const x of d.events || []) if (x?.id && !haveE.has(x.id)) { S.events.push(x); queue('POST', '/api/calendar', x); ne++; }
    if (d.settings && typeof d.settings === 'object') { S.settings = { ...DEFAULT_SETTINGS, ...d.settings }; queue('POST', '/api/settings', { settings: S.settings }); applyHands(); }
    if (d.appearance && typeof d.appearance === 'object' && window.__sea?.save) window.__sea.save({ ...window.__sea.DEFAULTS, ...d.appearance });
    let np = 0;
    const haveP = new Set((S.personal || []).map((x) => String(x.name || '').toLowerCase()));
    for (const x of (d.personal || []).slice(0, 1000)) {
      const data = x?.data || x; const name = String(data?.name || x?.name || '').trim();
      if (!name || haveP.has(name.toLowerCase())) continue;
      queue('POST', '/api/exercises/personal', { exercise: data }); np++; haveP.add(name.toLowerCase());
    }
    markDirty();
    toast(`Restauré : ${inc.items.length} séances, ${nh} historiques, ${ne} événements${np ? `, ${np} exercices personnels` : ''}`);
    render();
  } catch { toast('Fichier illisible : choisis une sauvegarde de l’appli.'); }
  el.value = '';
};

/* ═════════ Mode séance (chronos, série par série) ═════════ */
let audio = null;
function beep(f = 880, ms = 150) {
  if (!S.settings.sound) return;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + ms / 1000); } catch { /* pas d'audio */ }
}
const buzz = (p) => { if (S.settings.vibration && navigator.vibrate) navigator.vibrate(p); };
function speak(t) { if (!S.settings.voice || !window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; speechSynthesis.speak(u); } catch { /* rien */ } }
let wakeLock = null;
async function wake() { if (!(S.settings.keepAwake || S.settings.handsFree) || !navigator.wakeLock) return; try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* refusé */ } }
function unwake() { try { wakeLock?.release(); } catch { /* rien */ } wakeLock = null; }
const cur = () => S.player.s.exercises[S.player.i];
const mmss = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

function initInputs(keepLoad) {
  const p = S.player, ex = cur(), prev = p.log[p.i].sets.at(-1), hint = progressHint(ex, S.history);
  p.reps = ex.repsMax; p.secs = ex.secMax;
  if (!(keepLoad && prev)) p.load = hint?.load || parseKg(ex.load) || 0; else p.load = prev.load;
  p.hint = hint;
}
function startPlayer(session, eventId) {
  const s = normalizeSession(session);
  if (!s.exercises.length) { toast('Cette séance est vide'); return; }
  S.player = { s, eventId: eventId || null, i: 0, set: 0, side: 0, phase: 'ready', end: 0, total: 0, startedAt: Date.now(), paused: false, pausedAt: 0, pausedTotal: 0, log: s.exercises.map((e) => ({ name: e.name, libId: e.libId, group: e.group, intensity: e.intensity, risk: e.risk, muscles: e.muscles, sets: [] })), rpe: 0, note: '', prs: [] };
  initInputs(false);
  $('#player').classList.add('open'); document.body.style.overflow = 'hidden';
  wake(); beep(1, 1); drawPlayer(); clearInterval(startPlayer.t); startPlayer.t = setInterval(tick, 250); voiceStart(); speak(`${s.exercises[0].name}`);
}
function tick() {
  const p = S.player; if (!p || p.paused || !(p.phase === 'rest' || p.phase === 'work')) return;
  const rem = Math.max(0, Math.ceil((p.end - Date.now()) / 1000));
  const t = $('#ptimer'), b = $('#pbar2');
  if (t) t.textContent = mmss(rem);
  if (b) b.style.width = `${Math.max(0, Math.min(100, 100 - ((p.end - Date.now()) / p.total) * 100))}%`;
  if (rem <= 3 && rem > 0 && p.lastBeep !== rem) { p.lastBeep = rem; beep(660, 90); }
  if (rem <= 0) onTimerEnd();
}
function onTimerEnd() {
  const p = S.player; beep(1040, 350); buzz([300, 100, 300]); p.lastBeep = 0;
  if (p.phase === 'rest') { p.phase = 'ready'; initInputs(true); speak('Série suivante'); drawPlayer(); }
  else if (p.phase === 'work') completeSet(cur().mode === 'time' ? p.secs : 0);
}
function startRest(sec) { const p = S.player; const safe = Math.max(0, Number(sec) || 0); p.phase = 'rest'; p.end = Date.now() + safe * 1000; p.total = safe * 1000; p.remaining = safe * 1000; p.paused = false; p.lastBeep = 0; drawPlayer(); if (safe <= 0) { p.phase = 'ready'; initInputs(true); drawPlayer(); } }
function completeSet(secondsDone) {
  const p = S.player, ex = cur();
  if (ex.perSide && p.side === 0) { p.side = 1; p.phase = 'ready'; buzz(80); toast('Change de côté'); drawPlayer(); return; }
  p.log[p.i].sets.push({ reps: ex.mode === 'reps' ? p.reps : 0, seconds: ex.mode === 'time' ? secondsDone : 0, load: p.load || 0, done: true });
  p.side = 0;
  if (p.set + 1 < ex.sets) { p.set++; if (ex.rest > 0) startRest(ex.rest); else { p.phase = 'ready'; initInputs(true); drawPlayer(); } }
  else nextExercise();
}
function nextExercise() {
  const p = S.player; p.i++; p.set = 0; p.side = 0; p.phase = 'ready';
  if (p.i >= p.s.exercises.length) return finishPlayer();
  initInputs(false); speak(cur().name); drawPlayer(); window.scrollTo(0, 0);
}
function finishPlayer() {
  const p = S.player; p.phase = 'done'; clearInterval(startPlayer.t); unwake(); voiceStop();
  const pausedMs = (p.pausedTotal || 0) + (p.paused && p.pausedAt ? Date.now() - p.pausedAt : 0); p.durationSeconds = Math.max(0, Math.round((Date.now() - p.startedAt - pausedMs) / 1000));
  const prevBest = new Map();
  for (const hh of S.history) for (const e of hh.data?.exercises || []) for (const s of e.sets || []) prevBest.set(exKey(e.name), Math.max(prevBest.get(exKey(e.name)) || 0, s.load || 0));
  p.prs = p.log.filter((l) => l.sets.length).map((l) => ({ name: l.name, load: Math.max(0, ...l.sets.map((s) => s.load || 0)), prev: prevBest.get(exKey(l.name)) })).filter((x) => x.load > 0 && x.prev !== undefined && x.load > x.prev);
  drawPlayer();
}
function closePlayer() { clearInterval(startPlayer.t); unwake(); voiceStop(); S.player = null; $('#player').classList.remove('open'); $('#player').innerHTML = ''; document.body.style.overflow = ''; render(); }
function drawPlayer() {
  const p = S.player; if (!p) return; const root = $('#player');
  if (p.phase === 'done') { root.innerHTML = vRecap(p).s; return; }
  const n = p.s.exercises.length, pct = Math.round((p.i / n) * 100);
  root.innerHTML = h`<div class="pl"><div class="row between"><button class="btn sm" data-act="pQuit">✕ Terminer</button><span class="muted small">Exercice ${p.i + 1} / ${n}</span><button class="btn sm" data-act="pSkip">Passer ⏭</button></div><div class="bar"><i style="width:${pct}%"></i></div>${p.phase === 'rest' ? vRest(p) : vSet(p)}</div>`.s;
  tick();
}
function stepper(k, value, unit, label) { return h`<div class="center"><div class="muted small">${label}</div><div class="stepper"><button data-act="pAdj" data-k="${k}" data-d="-1" aria-label="Moins">−</button><b>${value}<span class="small muted"> ${unit}</span></b><button data-act="pAdj" data-k="${k}" data-d="1" aria-label="Plus">+</button></div></div>`; }
function vSet(p) {
  const ex = cur(), t = ex.mode === 'time', working = p.phase === 'work';
  const usesLoad = p.load > 0 || /kg|lest/i.test(ex.load) || p.hint?.load > 0;
  return h`<div class="row"><div class="ico acc">${ex.emoji}</div><div class="grow"><h1 style="margin:0">${ex.name}</h1><div class="muted">Série ${p.set + 1} / ${ex.sets}${ex.perSide ? ` · côté ${p.side + 1} / 2` : ''}</div></div></div>
    <div class="center"><b style="font-size:1.8rem">${t ? rng(ex.secMin, ex.secMax) + ' s' : rng(ex.repsMin, ex.repsMax) + (ex.unit ? ' ' + ex.unit : ' reps')}</b>${ex.load ? h`<div class="muted">${ex.load}</div>` : ''}${p.hint ? h`<div class="small" style="color:var(--accent)">Dernière fois : ${p.hint.last}${p.hint.next ? ' · ' + p.hint.next : ''}</div>` : ''}${ex.note && !p.hint ? h`<div class="small" style="color:var(--accent)">${ex.note}</div>` : ''}</div>
    ${working ? h`<div class="timer" id="ptimer">${mmss(Math.max(0, Math.ceil((p.end - Date.now()) / 1000)))}</div><div class="bar"><i id="pbar2" style="width:0%"></i></div>
        <div class="row"><button class="btn big pri" data-act="pWorkDone">✓ Terminer</button></div><div class="row wrapf"><button class="btn" data-act="pPause">${p.paused ? '▶ Reprendre' : '⏸ Pause'}</button></div>`
      : h`${t ? stepper('secs', p.secs, 's', 'Durée') : stepper('reps', p.reps, ex.unit || 'reps', 'Répétitions faites')}${!t && usesLoad ? stepper('load', p.load, 'kg', 'Charge') : ''}
        <button class="btn pri big" data-act="pGo">${t ? `▶ Démarrer (${mmss(p.secs)})` : '✓ Série faite'}</button>`}
    ${ex.ok.length ? h`<details ${p.set === 0 ? 'open' : ''} class="card"><summary><b>Consignes</b></summary><ul>${ex.ok.map((c) => h`<li>${c}</li>`)}</ul>${ex.bad.length ? h`<b class="small">À éviter</b><ul>${ex.bad.map((c) => h`<li>${c}</li>`)}</ul>` : ''}</details>` : ''}`;
}
function vRest(p) {
  const ex = cur(), last = p.set >= ex.sets, nxt = `${ex.name} — série ${p.set + 1}/${ex.sets}`;
  return h`<div class="center"><div class="muted">Repos</div></div><div class="timer rest" id="ptimer">${mmss(Math.max(0, Math.ceil((p.end - Date.now()) / 1000)))}</div><div class="bar"><i id="pbar2" style="width:0%"></i></div>
    <div class="center muted">Ensuite : <b>${nxt}</b></div>
    <div class="grid2"><button class="btn big" data-act="pRestAdd">+ 30 s</button><button class="btn pri big" data-act="pRestSkip">Passer</button></div><button class="btn" data-act="pPause">${p.paused ? '▶ Reprendre' : '⏸ Pause'}</button>`;
}
function vRecap(p) {
  const sets = p.log.reduce((t, l) => t + l.sets.length, 0), exs = p.log.filter((l) => l.sets.length).length;
  return h`<div class="pl"><div class="center"><div class="ico acc" style="margin:0 auto;width:4rem;height:4rem;font-size:2rem">🎉</div><h1>Séance terminée</h1><p class="muted">${fmtDur(p.durationSeconds)} · ${exs} exercice(s) · ${sets} série(s)</p></div>
    ${p.prs.map((x) => h`<div class="card" style="border-color:var(--accent)">🏆 Nouveau record : <b>${x.name}</b> ${x.load} kg <span class="muted small">(avant : ${x.prev} kg)</span></div>`)}
    <div class="card"><b>Comment c’était ?</b><div class="chips">${[[1, '😌 Facile'], [2, '🙂 Bien'], [3, '😅 Costaud'], [4, '🥵 Dur'], [5, '💀 Très dur']].map(([v, l]) => h`<button class="chip ${p.rpe === v ? 'on' : ''}" data-act="pRpe" data-v="${v}">${l}</button>`)}</div></div>
    <label class="card"><b>📝 Note de séance (facultatif)</b><textarea id="session-note" rows="3" maxlength="600" placeholder="Sensations, difficulté, réussite, douleur à signaler…">${p.note || ''}</textarea></label>
    <button class="btn pri big" data-act="pSave" ${sets ? '' : 'disabled'}>💾 Enregistrer</button><button class="btn" data-act="pDiscard">Ne pas enregistrer</button></div>`;
}
Object.assign(ACT, {
  play: (el) => { const s = el.dataset.gen ? S.gen.result?.session : getSeance(el.dataset.id); closeSheet(); if (s) startPlayer(s, el.dataset.event); },
  pAdj: (el) => { const p = S.player, k = el.dataset.k, d = Number(el.dataset.d), ex = cur(); if (k === 'reps') p.reps = Math.max(0, p.reps + d); else if (k === 'load') p.load = Math.max(0, Math.round((p.load + d * 0.5) * 10) / 10); else p.secs = Math.max(1, p.secs + d * 5); drawPlayer(); },
  pGo: () => { const p = S.player, ex = cur(); if (ex.mode === 'time') { p.phase = 'work'; p.end = Date.now() + p.secs * 1000; p.total = p.secs * 1000; p.lastBeep = 0; p.started = Date.now(); beep(880, 120); drawPlayer(); } else { buzz(40); completeSet(0); } },
  pWorkDone: () => { const p = S.player; completeSet(Math.max(1, Math.round((Date.now() - p.started) / 1000))); },
  pPause: () => { const p = S.player; if (!p || !['rest', 'work'].includes(p.phase)) return; const now = Date.now(); if (p.paused) { p.pausedTotal = (p.pausedTotal || 0) + Math.max(0, now - (p.pausedAt || now)); p.end = now + Math.max(0, p.remaining || 0); p.paused = false; p.pausedAt = 0; } else { p.remaining = Math.max(0, p.end - now); p.paused = true; p.pausedAt = now; } drawPlayer(); },
  pRestAdd: () => { const p = S.player; if (!p || p.phase !== 'rest') return; if (p.paused) p.remaining = Math.max(0, p.remaining || 0) + 30000; else p.end += 30000; p.total += 30000; tick(); drawPlayer(); },
  pRestSkip: () => { const p = S.player; p.phase = 'ready'; initInputs(true); drawPlayer(); },
  pSkip: () => { if (!confirmBox('Passer cet exercice ?')) return; nextExercise(); },
  pQuit: () => { const p = S.player, any = p.log.some((l) => l.sets.length); if (!any) { if (confirmBox('Quitter la séance ?')) closePlayer(); return; } if (confirmBox('Terminer maintenant ? Tu pourras enregistrer ce que tu as déjà fait.')) finishPlayer(); },
  pRpe: (el) => { S.player.rpe = Number(el.dataset.v); drawPlayer(); },
  pNote: () => { const n = $('#session-note'); if (n && S.player) S.player.note = n.value.slice(0, 600); },
  pDiscard: () => { if (confirmBox('Ne pas enregistrer cette séance ?')) closePlayer(); },
  pSave: () => {
    const p = S.player;
    const completed = p.log.filter((l) => l.sets.length);
    // Les ajustements réellement effectués deviennent la nouvelle base de la séance
    // enregistrée : la prochaine lecture repart de ces valeurs, sans toucher aux autres exercices.
    const stored = getSeance(p.s.id);
    if (stored) {
      const next = stored.exercises.map((ex, i) => {
        const l = p.log[i]; if (!l?.sets?.length) return ex;
        return applyPerformedBase(ex, l.sets[l.sets.length - 1]);
      });
      saveSeance({ ...stored, exercises: next });
    }
    const note = $('#session-note')?.value?.trim().slice(0, 600) || '';
    const entry = { id: uid(), sessionId: p.s.id, sessionName: p.s.name, startedAt: p.startedAt, durationSeconds: p.durationSeconds, data: { rpe: p.rpe, note, focus: p.s.goal || '', exercises: completed } };
    S.history.unshift(entry); queue('POST', '/api/history', entry);
    if (p.eventId) { const ev = S.events.find((e) => e.id === p.eventId); if (ev && !ev.recurrence) { ev.completed = true; queue('POST', '/api/calendar', ev); } }
    toast('Séance enregistrée et base mise à jour 💪'); closePlayer();
  },
});
/* Commandes vocales (mode mains libres) */
let rec = null, voiceOn = false;
function voiceStart() {
  if (!S.settings.handsFree) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Commandes vocales non disponibles ici : les gros boutons restent actifs.'); return; }
  voiceOn = true;
  try {
    rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => handleVoice(norm(e.results[e.results.length - 1][0].transcript));
    rec.onend = () => { if (voiceOn && S.player && S.player.phase !== 'done') { try { rec.start(); } catch { /* déjà lancé */ } } };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { voiceOn = false; toast('Micro refusé : commandes vocales désactivées.'); } };
    rec.start();
  } catch { voiceOn = false; }
}
function voiceStop() { voiceOn = false; try { rec?.stop(); } catch { /* rien */ } rec = null; }
function handleVoice(t) {
  const p = S.player; if (!p || p.phase === 'done') return;
  const num = t.match(/(?:mets|met|à|a|avec)\s+(\d+(?:[.,]\d+)?)/);
  if (num && p.phase === 'ready') {
    const n = Number(num[1].replace(',', '.'));
    if (/kg|kilo|kilos/.test(t)) p.load = Math.max(0, n);
    else if (/seconde|secondes|sec|s\b/.test(t) && cur().mode === 'time') p.secs = Math.max(1, n);
    else if (/repet|rep|fois/.test(t) && cur().mode === 'reps') p.reps = Math.max(0, Math.round(n));
    drawPlayer(); return;
  }
  if (/\b(pause|reprend)/.test(t) && (p.phase === 'rest' || p.phase === 'work')) ACT.pPause();
  else if (/\b(passe|saute|suivant)/.test(t)) (p.phase === 'rest' ? ACT.pRestSkip() : nextExercise());
  else if (/\b(plus|trente|ajoute)/.test(t) && p.phase === 'rest') ACT.pRestAdd();
  else if (/\b(fait|termine|valide|ok|go|demarre|d[ée]marre|partez)/.test(t)) (p.phase === 'work' ? ACT.pWorkDone() : p.phase === 'ready' ? ACT.pGo() : ACT.pRestSkip());
}

/* ═════════ Démarrage ═════════ */
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el) return; const fn = ACT[el.dataset.act]; if (fn) { e.preventDefault(); fn(el, e); } });
document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-submit]'); if (!f) return; e.preventDefault(); const fn = SUBMIT[f.dataset.submit]; if (fn) fn(f); });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (!el) return; const fn = CHG[el.dataset.change]; if (fn) fn(el); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (!el) return; const fn = INPUT[el.dataset.input]; if (fn) fn(el); });
SUBMIT.login = (f) => authSubmit(f, 'login'); SUBMIT.register = (f) => authSubmit(f, 'register');
window.addEventListener('online', () => syncAll());
window.addEventListener('offline', () => setSync('offline'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (S.player) { wake(); tick(); } else if (S.user && Date.now() - (S.lastSync || 0) > 60000) syncAll(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#sheet').classList.contains('open')) closeSheet(); });

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').then((r) => r.update().catch(() => {})).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !S.player && !sessionStorage.getItem('sea:reloaded')) { sessionStorage.setItem('sea:reloaded', '1'); location.reload(); } });
}
async function start() {
  registerSW();
  const cached = store.get('sea:user');
  if (cached) { S.user = cached; enterApp(true); } else render();
  try {
    const r = await api('GET', '/api/auth/me', undefined, { quiet401: true });
    S.user = r.user; store.set('sea:user', r.user);
    if (!cached) enterApp(false);
  } catch (e) {
    if (e.status === 401) { if (cached) sessionExpired(); else render(); }
    else if (!cached) { S.authError = e.offline ? 'Pas de connexion. Connecte-toi une première fois en ligne.' : e.message; render(); }
  }
}
start();
