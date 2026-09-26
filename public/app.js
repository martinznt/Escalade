// app.js — point d'entrée de « Mes séances » (PWA, sans bibliothèque externe, fonctionne hors ligne).
// Charge les vues, gère l'authentification, la navigation (onglets + adresse #/onglet/sous-vue/paramètre),
// la délégation des événements et le démarrage. En cas d'erreur de démarrage, boot.js affiche un écran d'erreur.
import { h, raw, $, toast, closeSheet, sheetOpen, ask, tag, skeleton, fmtDay } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, APP_VERSION, api, ls, loadLocal, persistNow, writePending, syncAll, setRenderer, setOnExpired, setSyncListener, render, go, parseHash, pendingCount, ctx } from './state.js';
import { normalizeSession } from './shared.js';
import { vHome } from './views-home.js';
import { vProgress } from './views-progress.js';
import { vLibrary, blocksOf } from './views-library.js';
import { vProfile } from './views-profile.js';
import { vSettings } from './views-settings.js';
import { onVisible } from './player.js';

const TABS = [['home', '🏠', 'Accueil'], ['progress', '📈', 'Progrès'], ['library', '📚', 'Bibliothèque'], ['profile', '🧠', 'Profil'], ['settings', '⚙️', 'Paramètres']];
const VIEWS = { home: vHome, progress: vProgress, library: vLibrary, profile: vProfile, settings: vSettings };

/* ═════════ Rendu ═════════ */
function syncBadge() {
  const n = pendingCount();
  const label = { ok: 'Synchronisé', sync: 'Synchronisation…', pending: `${n} modification(s) en attente`, offline: `Hors ligne${n ? ` · ${n} en attente` : ''}`, error: 'Erreur de synchronisation', auth: 'Reconnexion nécessaire', idle: '' }[S.sync] || '';
  return h`<button class="syncbadge ${S.sync}" data-act="goSync" aria-label="${label}" title="${label}"><span class="dot"></span>${S.sync === 'offline' ? 'Hors ligne' : n ? String(n) : ''}</button>`;
}
function doRender() {
  const app = $('#app');
  const pub = (location.hash || '').match(/^#\/profile\/public\/([^/]+)$/);
  if (!S.user) { app.innerHTML = (pub ? vPublicVisitor(decodeURIComponent(pub[1])) : vAuth()).s; return; }
  if (!S.loaded) { app.innerHTML = h`<main class="wrap">${skeleton(4)}</main>`.s; return; }
  let body;
  try { body = pub && decodeURIComponent(pub[1]).toLowerCase() !== S.user.username.toLowerCase() ? vPublicVisitor(decodeURIComponent(pub[1])) : VIEWS[S.tab](); }
  catch (e) { console.error(e); body = h`<div class="card bad-b"><h3>Cet écran n’a pas pu s’afficher</h3><p class="small">${e.message}</p><p class="tiny muted">Tes données ne sont pas touchées. Tu peux signaler ce problème dans Paramètres › Signaler un bug.</p><button class="btn" data-act="tab" data-id="home">Retour à l’accueil</button></div>`; }
  app.innerHTML = h`<header class="top"><div class="wrap row between"><span class="brand"><img src="/icon-192.png" alt="" width="26" height="26"> Mes séances</span>${syncBadge()}</div></header>
    <main class="wrap" id="main">${body}</main>
    <nav class="tabs" aria-label="Navigation principale">${TABS.map(([id, ic, label]) => h`<button data-act="tab" data-id="${id}" class="${S.tab === id ? 'on' : ''}" aria-current="${S.tab === id ? 'page' : 'false'}"><span class="ico">${ic}</span><span class="lbl">${label}</span></button>`)}</nav>`.s;
}
setRenderer(doRender);
setSyncListener(() => { const b = $('.syncbadge'); if (b) b.outerHTML = syncBadge().s; });
ACT.tab = (el) => { const id = el.dataset.id; closeSheet(); window.scrollTo(0, 0); const base = { home: 'dash', progress: 'summary', library: 'seances', profile: 'understand', settings: 'main' }[id]; const keep = S.tab === id ? base : S.sub[id]; go(id, ['seance', 'shared-edit', 'common-detail', 'import'].includes(keep) ? base : keep || base); };
ACT.goSync = () => go('settings', 'sync');
ACT.closeSheet = () => closeSheet();

/* ═════════ Authentification ═════════ */
function vAuth() {
  const reg = S.authMode === 'register';
  return h`<main class="auth wrap"><div class="center"><img class="app-logo" src="/icon-192.png" alt="" width="84" height="84"><h1>Mes séances</h1><p class="muted">${reg ? 'Crée ton compte personnel. Tu resteras connecté sur cet appareil.' : 'Connecte-toi à ton compte.'}</p></div>
    <form data-submit="${reg ? 'register' : 'login'}" class="card" autocomplete="on">
      <label>Pseudo${reg ? '' : ' ou e-mail'}<input type="text" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="3" maxlength="120" value="${S.prefill || ls.get('sea:lastname', '') || ''}"></label>
      ${reg ? h`<label>E-mail (facultatif)<input type="email" name="email" autocomplete="email" maxlength="120"></label>` : ''}
      <label>Mot de passe<input type="password" name="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="8" maxlength="200"></label>
      ${reg ? h`<label>Code d’invitation (si on t’en a donné un)<input type="text" name="invite" autocomplete="off" maxlength="60"></label>` : ''}
      <div class="err" role="alert">${S.authError}</div>
      <button class="btn pri big" type="submit">${reg ? 'Créer mon compte' : 'Me connecter'}</button>
    </form>
    <button class="btn ghost" data-act="authMode">${reg ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
    <p class="tiny muted center">Chaque personne a son propre compte. Tes données sont privées par défaut.</p></main>`;
}
ACT.authMode = () => { S.authMode = S.authMode === 'login' ? 'register' : 'login'; S.authError = ''; render(); };
async function authSubmit(form, kind) {
  const f = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; S.authError = '';
  try {
    const r = await api('POST', kind === 'register' ? '/api/auth/register' : '/api/auth/login', f, { quiet401: true });
    await enter(r.user, kind === 'register');
  } catch (e) { S.authError = e.offline ? 'Pas de connexion internet : la première connexion doit se faire en ligne.' : e.message; btn.disabled = false; render(); }
}
async function enter(user, fresh) {
  S.user = user; S.expiredShown = false; S.prefill = ''; S.loaded = false;
  ls.set('sea:user', { id: user.id, username: user.username, isAdmin: !!user.isAdmin }); ls.set('sea:lastname', user.username);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  render();
  await loadLocal();
  parseHash();
  if (fresh || !location.hash) go('home', 'dash'); else render();
  syncAll();
}
SUBMIT.login = (f) => authSubmit(f, 'login');
SUBMIT.register = (f) => authSubmit(f, 'register');
function expireSession() {
  if (!S.user || S.expiredShown) return;
  S.expiredShown = true;
  writePending();
  const name = S.user.username;
  ls.del('sea:user'); S.user = null; S.player = null; $('#player')?.classList.remove('open');
  S.authMode = 'login'; S.authError = 'Session expirée : reconnecte-toi. Les modifications faites sur cet appareil sont conservées et seront envoyées ensuite.'; S.prefill = name;
  render();
}
setOnExpired(expireSession);

/* ═════════ Page publique (visiteur, avec ou sans compte) ═════════ */
function vPublicVisitor(name) {
  const pv = S.publicView;
  if (!pv || pv.name !== name) {
    S.publicView = { name, loading: true };
    api('GET', `/api/public/u/${encodeURIComponent(name)}`, undefined, { quiet401: true }).then((r) => { S.publicView = { name, person: r.person }; render(); })
      .catch((e) => { S.publicView = { name, error: e.offline ? 'Connexion requise.' : e.message }; render(); });
    return h`<main class="wrap">${skeleton(2)}</main>`;
  }
  if (pv.error) return h`<main class="wrap"><div class="card"><h2>Profil introuvable</h2><p class="muted">${pv.error}</p>${S.user ? h`<button class="btn" data-act="tab" data-id="home">Accueil</button>` : h`<button class="btn pri" data-act="pubLogin">Se connecter</button>`}</div></main>`;
  if (!pv.person) return h`<main class="wrap">${skeleton(2)}</main>`;
  const u = pv.person;
  return h`<main class="wrap"><div class="card"><h1>👤 ${u.username}</h1>${u.bio ? h`<p>${u.bio}</p>` : ''}
      ${u.activities?.length ? h`<p class="small">${u.activities.map((a) => a.emoji + ' ' + a.label).join(' · ')}</p>` : ''}${u.goals?.length ? h`<p class="small">🎯 ${u.goals.map((g) => g.label).join(', ')}</p>` : ''}
      ${u.perfs?.length ? h`<p class="small">📏 ${u.perfs.map((p) => `${p.label} : ${p.text}`).join(' · ')}</p>` : ''}${u.caps?.length ? h`<p class="small">🧭 ${u.caps.map((x) => `${x.label} (${x.status})`).join(', ')}</p>` : ''}
      ${u.stats ? h`<p class="small">${u.stats.sessions30} séance(s) sur 30 jours · ${u.stats.minutes30} min</p>` : ''}</div>
    <h2>Séances publiques</h2>${u.sessions?.length ? u.sessions.map((x) => h`<div class="card"><b>${x.emoji} ${x.title}</b><div class="tiny muted">${x.exerciseCount} exercices · ~${x.durationMin} min${x.level?.level ? ' · niveau estimé ' + x.level.level : ''}</div><div class="row wrapf"><button class="btn sm" data-act="pubView" data-id="${x.id}">Voir</button>${S.user ? h`<button class="btn sm pri" data-act="pubCopy" data-id="${x.id}">Enregistrer dans mes séances</button>` : h`<button class="btn sm" data-act="pubLogin">Se connecter pour l’enregistrer</button>`}</div></div>`) : h`<p class="muted">Aucune séance publiée.</p>`}
    ${S.publicSession ? h`<div class="card"><h3>${S.publicSession.title}</h3>${blocksOf(normalizeSession(S.publicSession.session), 'view')}</div>` : ''}
    ${S.user ? h`<button class="btn" data-act="tab" data-id="home">‹ Retour à mon espace</button>` : ''}</main>`;
}
ACT.pubLogin = () => { location.hash = ''; S.authMode = 'login'; render(); };
ACT.pubView = async (el) => { try { const r = await api('GET', `/api/public/s/${encodeURIComponent(el.dataset.id)}`, undefined, { quiet401: true }); S.publicSession = r.item; render(); } catch (e) { toast(e.message); } };

/* ═════════ Événements ═════════ */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch((err) => { console.error(err); toast('Action impossible : ' + (err?.message || 'erreur inattendue'), 4500, 'bad'); });
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]'); if (!f) return;
  e.preventDefault();
  const fn = SUBMIT[f.dataset.submit]; if (fn) Promise.resolve().then(() => fn(f)).catch((err) => { console.error(err); toast('Enregistrement impossible : ' + (err?.message || 'erreur'), 4500, 'bad'); });
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (!el) return; const fn = CHG[el.dataset.change]; if (fn) try { fn(el); } catch (err) { console.error(err); toast(err.message, 4000, 'bad'); } });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (!el) return; const fn = INPUT[el.dataset.input]; if (fn) fn(el); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
window.addEventListener('hashchange', () => { parseHash(); closeSheet(); render(); });
window.addEventListener('online', () => syncAll());
window.addEventListener('offline', () => { S.sync = 'offline'; render(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { writePending(); persistNow(); return; }
  if (S.player) onVisible(); else if (S.user && Date.now() - (S.lastSync || 0) > 60000) syncAll();
});
window.addEventListener('pagehide', () => { writePending(); persistNow(); });

/* ═════════ Démarrage ═════════ */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').then((r) => r.update().catch(() => {})).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nouvelle version : rechargement une seule fois, jamais pendant une séance ni avec une saisie en cours.
    if (had && !S.player && !sessionStorage.getItem('sea:reloaded')) { sessionStorage.setItem('sea:reloaded', '1'); writePending(); persistNow().finally(() => location.reload()); }
  });
}
async function start() {
  registerSW();
  parseHash();
  const cached = ls.get('sea:user');
  if (cached?.id) {
    S.user = cached; render();
    await loadLocal(); render();
    window.__seaStarted = true;
    syncAll();
  } else { render(); window.__seaStarted = true; }
  try {
    const r = await api('GET', '/api/auth/me', undefined, { quiet401: true });
    if (!cached || cached.id !== r.user.id) { await enter(r.user, false); }
    else { S.user = r.user; ls.set('sea:user', { id: r.user.id, username: r.user.username, isAdmin: !!r.user.isAdmin }); render(); }
  } catch (e) {
    if (e.status === 401 && cached) expireSession();
    else if (!cached && e.offline) { S.authError = 'Pas de connexion : connecte-toi une première fois en ligne.'; render(); }
  }
}
window.__seaVersion = APP_VERSION;
start().catch((e) => { console.error(e); window.__seaFail?.(e); });
