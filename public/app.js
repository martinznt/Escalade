// app.js — point d'entrée de « Séances entraînement » (PWA, sans bibliothèque externe, fonctionne hors ligne).
// Charge les vues, gère l'authentification, la navigation (onglets + adresse #/onglet/sous-vue/paramètre),
// la délégation des événements et le démarrage. En cas d'erreur de démarrage, boot.js affiche un écran d'erreur.
import { returnBar } from './nav.js';
import './picker.js';
import { h, raw, $, toast, openSheet, closeSheet, sheetOpen, ask, tag, skeleton, fmtDay } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, APP_VERSION, api, ls, saveSeance, loadLocal, persistNow, writePending, syncAll, setRenderer, setOnExpired, setSyncListener, render, go, parseHash, pendingCount, ctx, clearLocal, GUEST, putItem } from './state.js';
import { installCard, maybeTour, openSetup, mainConfig } from './views-setup.js';
import { normalizeSession, uid } from './shared.js';
import { maybeMove, maybeClaim } from './move.js';
import { pendingNews, latestNews, markNewsToured, initNews } from './news.js';
import { startTour } from './tour.js';
import './timer.js';
import './views-coach.js';
import { checkBadges } from './views-motiv.js';
import { topIcons } from './layout.js';
import { refreshInbox } from './inbox.js';
import { vHome } from './views-home.js';
import { vProgress } from './views-progress.js';
import { vLibrary, blocksOf } from './views-library.js';
import { vProfile } from './views-profile.js';
import { vSettings, APPEAR_KEYS } from './views-settings.js';
import { onVisible, bigTap, startPlayer } from './player.js';
import { catchLink, pendingLink, clearPending } from './share.js';
import './duo.js';
import './find-ui.js';
import { syncContent, loadGlobal } from './content.js';
import { setLang } from './i18n.js';

const TABS = [['home', '🏠', 'Accueil'], ['progress', '📈', 'Progrès'], ['library', '📚', 'Bibliothèque'], ['profile', '👤', 'Profil'], ['settings', '⚙️', 'Paramètres']];
const VIEWS = { home: vHome, progress: vProgress, library: vLibrary, profile: vProfile, settings: vSettings };

/* ═════════ Rendu ═════════ */
function syncBadge() {
  const n = pendingCount();
  if (S.user?.guest) return h`<button class="syncbadge guest" data-act="goAccount" aria-label="Mode invité : créer un compte">👀 Invité</button>`;
  const label = { ok: 'Synchronisé', sync: 'Synchronisation…', pending: `${n} modification(s) en attente`, offline: `Hors ligne${n ? ` · ${n} en attente` : ''}`, error: 'Erreur de synchronisation', auth: 'Reconnexion nécessaire', idle: '' }[S.sync] || '';
  return h`<button class="syncbadge ${S.sync}" data-act="goSync" aria-label="${label}" title="${label}"><span class="dot"></span>${S.sync === 'offline' ? 'Hors ligne' : n ? String(n) : ''}</button>`;
}
function doRender() {
  const app = $('#app');
  const pub = (location.hash || '').match(/^#\/profile\/public\/([^/]+)$/);
  const pl = pendingLink();
  if (!S.user) { app.innerHTML = (pub ? vPublicVisitor(decodeURIComponent(pub[1])) : pl && !S.authMode ? h`<main class="wrap">${vLanding(pl)}</main>` : vAuth()).s; return; }
  if (!S.loaded) { app.innerHTML = h`<main class="wrap">${skeleton(4)}</main>`.s; return; }
  let body;
  try { body = pl ? vLanding(pl) : pub && decodeURIComponent(pub[1]).toLowerCase() !== S.user.username.toLowerCase() ? vPublicVisitor(decodeURIComponent(pub[1])) : VIEWS[S.tab](); }
  catch (e) {
    console.error(e);
    const where = String(e?.stack || '').split('\n').slice(1, 4).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' · ');
    body = h`<div class="card bad-b"><h3>Cet écran n’a pas pu s’afficher</h3><p class="small">${e.message}</p><p class="tiny muted">Tes données ne sont pas touchées. Tu peux signaler ce problème dans Paramètres › Signaler un bug (le détail ci-dessous aide à le corriger).</p>
      <details class="how mini"><summary>Détail technique</summary><p class="tiny">${S.tab}/${S.sub[S.tab] || ''} — ${where || 'aucun'}</p></details>
      <div class="row wrapf">${S.tab !== 'home' ? h`<button class="btn" data-act="tab" data-id="home">Retour à l’accueil</button>` : ''}<button class="btn" data-act="tab" data-id="settings">Paramètres</button></div></div>`;
  }
  app.innerHTML = h`<header class="top"><div class="wrap row between"><span class="brand"><img src="/icon-192.png" alt="" width="26" height="26"><span class="bt"> Séances <em>entraînement</em></span></span><span class="grow"></span>${topIcons(S.tab)}${syncBadge()}</div></header>
    <main class="wrap" id="main">${returnBar()}${body}</main>
    <nav class="tabs" aria-label="Navigation principale">${TABS.map(([id, ic, label]) => h`<button data-act="tab" data-id="${id}" class="${S.tab === id ? 'on' : ''}" aria-current="${S.tab === id ? 'page' : 'false'}"><span class="ico">${ic}</span><span class="lbl">${label}</span></button>`)}</nav>`.s;
}
/** Apparence liée au compte : la version la plus récente (cet appareil ou le compte) s'applique partout. */
function syncAppearance() {
  if (!S.user || !S.loaded) return;
  const it = S.items.get('config/appearance'), local = window.__sea.load();
  const mine = local._owner === S.user.id, localT = mine ? local._t || 0 : 0; // l'apparence d'un autre compte de cet appareil ne compte pas
  if (it && !it.del && it.u > localT) { window.__sea.save({ ...local, ...Object.fromEntries(Object.entries(it.d).filter(([, v]) => v)), _t: it.u, _owner: S.user.id }); return; }
  if (!it && mine && local._t && (S.lastSync || S.user.guest)) putItem('config', 'appearance', APPEAR_KEYS.reduce((o, k) => ({ ...o, [k]: String(local[k] ?? '') }), {}));
}
setRenderer(() => { syncAppearance(); setLang(S.settings?.lang); syncContent(); doRender(); renderUpdateBar(); checkBadges(); });
setSyncListener(() => { const b = $('.syncbadge'); if (b) b.outerHTML = syncBadge().s; });
ACT.tab = (el) => { const id = el.dataset.id; closeSheet(); window.scrollTo(0, 0); const base = { home: 'dash', progress: 'summary', library: 'home', profile: 'home', settings: 'main' }[id]; go(id, base); }; // un onglet s'ouvre toujours sur sa page d'accueil (sa liste de rubriques)
ACT.goSync = () => go('settings', 'sync');
ACT.goAccount = () => go('settings', 'main');
ACT.closeSheet = () => closeSheet();

/* ═════════ Authentification ═════════ */
function vAuth() {
  const reg = S.authMode === 'register', up = !!S.upgradeGuest;
  return h`<main class="auth wrap"><div class="center"><img class="app-logo" src="/icon-192.png" alt="" width="84" height="84"><h1>Séances entraînement</h1>
      ${up ? h`<p class="muted">Crée ton compte : tout ce que tu as fait en mode invité (séances, historique, profil) y sera transféré.</p>` : h`<p class="lead">Ton coach d’entraînement personnel, gratuit.</p>`}</div>
    ${up ? '' : h`<ul class="pitch"><li><span>🎯</span><div><b>Des séances faites pour toi</b><small>Escalade, muscu, renforcement, course, natation… selon ton niveau, ton temps et ton matériel.</small></div></li>
      <li><span>▶️</span><div><b>Guidé pendant l’effort</b><small>Chrono, repos, séries : il suffit de suivre l’écran.</small></div></li>
      <li><span>📈</span><div><b>Tu vois tes progrès</b><small>Historique, records et conseils expliqués simplement.</small></div></li></ul>`}
    ${up || S.authMode ? '' : h`<div class="stack"><button class="btn pri big" data-act="authPick" data-id="register">Créer mon compte gratuit</button><button class="btn big" data-act="authPick" data-id="login">J’ai déjà un compte</button>
      <button class="btn ghost" data-act="guestStart">👀 Essayer sans compte</button><p class="tiny muted center">Sans compte, tes données restent seulement sur cet appareil. Tu pourras créer un compte plus tard sans rien perdre.</p></div>`}
    ${up || S.authMode ? h`<form data-submit="${reg ? 'register' : 'login'}" class="card" autocomplete="on"><h2 style="margin:0">${reg ? 'Créer mon compte' : 'Me connecter'}</h2>
      <label>${reg ? 'Choisis un pseudo' : 'Pseudo ou e-mail'}<input type="text" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="3" maxlength="120" value="${S.prefill || ls.get('sea:lastname', '') || ''}"></label>
      ${reg ? h`<label>E-mail (facultatif)<input type="email" name="email" autocomplete="email" maxlength="120"></label>` : ''}
      <label>Mot de passe${reg ? ' (8 caractères minimum)' : ''}<input type="password" name="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="8" maxlength="200"></label>
      ${reg ? h`<details class="how mini"><summary>J’ai un code d’invitation</summary><label>Code d’invitation<input type="text" name="invite" autocomplete="off" maxlength="60"></label></details>` : ''}
      <div class="err" role="alert">${S.authError}</div>
      <button class="btn pri big" type="submit">${reg ? 'Créer mon compte' : 'Me connecter'}</button>
      ${up ? '' : h`<button class="btn ghost" type="button" data-act="authMode">${reg ? 'J’ai déjà un compte' : 'Créer un compte'}</button>`}</form>
      ${up ? h`<button class="btn ghost" data-act="guestBack">‹ Revenir au mode invité</button>` : h`<button class="btn ghost" data-act="authPick" data-id="">‹ Retour</button>`}` : ''}
    ${installCard()}
    <p class="tiny muted center">Chaque personne a son propre compte. Tes données sont privées par défaut.</p></main>`;
}
ACT.authPick = (el) => { S.authMode = el.dataset.id || ''; S.authError = ''; render(); };
ACT.authMode = () => { S.authMode = S.authMode === 'login' ? 'register' : 'login'; S.authError = ''; render(); };
/* ═════════ Mode invité : sans compte, données seulement sur cet appareil ═════════ */
ACT.guestStart = async () => {
  S.user = { ...GUEST }; S.loaded = false; ls.set('sea:user', { ...GUEST });
  render(); await loadLocal(); go('home', 'dash');
  if (!mainConfig().setupDone && !mainConfig().setupLater) openSetup('quiz');
};
ACT.guestUpgrade = async () => { writePending(); await persistNow(); S.upgradeGuest = true; S.authMode = 'register'; S.authError = ''; S.user = null; render(); };
ACT.guestBack = async () => { S.upgradeGuest = false; S.authMode = ''; S.user = { ...GUEST }; S.loaded = false; render(); await loadLocal(); render(); };
ACT.guestLogin = async () => { writePending(); await persistNow(); S.upgradeGuest = false; S.user = null; S.authMode = 'login'; render(); };
async function authSubmit(form, kind) {
  const f = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; S.authError = '';
  try {
    const r = await api('POST', kind === 'register' ? '/api/auth/register' : '/api/auth/login', f, { quiet401: true });
    if (S.upgradeGuest && kind === 'register') await transferGuest(r.user);
    await enter(r.user, kind === 'register');
  } catch (e) { S.authError = e.offline ? 'Pas de connexion internet : la première connexion doit se faire en ligne.' : e.message; btn.disabled = false; render(); }
}
/** Nouveau compte créé depuis le mode invité : les données locales (et tout ce qui attend d'être envoyé) passent au compte. */
async function transferGuest(user) {
  S.user = { ...GUEST }; await loadLocal();
  S.user = user; S.seancesDirty = S.seancesDirty || S.seances.items.length > 0;
  for (const k of S.items.keys()) S.dirtyItems.add(k);
  S.outbox.push({ opId: 'op-guest-settings-' + Date.now(), method: 'POST', path: '/api/settings', body: { settings: S.settings }, attempts: 0, at: Date.now(), label: 'Modification — réglages' });
  writePending(); await persistNow(); await clearLocal('guest');
  S.upgradeGuest = false;
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
  setTimeout(() => import('./reminders.js').then((m) => m.ensurePush()).catch(() => {}), 4000); // réabonnement aux notifications si besoin
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
/* ═════════ Arrivée par un lien partagé (séance ou séance à deux) ═════════ */
function vLanding(pl) {
  const out = h`<button class="btn ghost" data-act="linkClose">${S.user ? '‹ Retour à mon espace' : 'Ignorer'}</button>`;
  if (pl.kind === 'duo') {
    return h`<div class="card acc-b center"><h1>👥 Séance à deux</h1><p>On t’invite à faire une séance ensemble. Code : <b class="duocode sm">${pl.id}</b></p>
      ${S.user && !S.user.guest ? h`<button class="btn pri big" data-act="duoJoinLink" data-code="${pl.id}">Rejoindre la séance</button>`
        : h`<p class="small muted">Il faut un compte (gratuit) pour partager les chronos.</p><button class="btn pri big" data-act="linkLogin" data-mode="${S.user ? 'up' : 'login'}">${S.user ? 'Créer mon compte' : 'Me connecter'}</button>${S.user ? '' : h`<button class="btn" data-act="linkLogin" data-mode="register">Créer un compte</button>`}`}</div>${out}`;
  }
  const L = S.linkView;
  if (!L || L.id !== pl.id) {
    S.linkView = { id: pl.id };
    api('GET', `/api/public/s/${encodeURIComponent(pl.id)}`, undefined, { quiet401: true, guestOk: true }).then((r) => { S.linkView = { id: pl.id, item: r.item }; render(); })
      .catch((e) => { S.linkView = { id: pl.id, error: e.offline ? 'Pas de connexion : réessaie quand tu as du réseau.' : e.message }; render(); });
    return skeleton(2);
  }
  if (L.error) return h`<div class="card"><h2>Séance introuvable</h2><p class="muted">${L.error}</p><p class="small">La personne a peut-être retiré le lien.</p></div>${out}`;
  if (!L.item) return skeleton(2);
  const it = L.item, s = normalizeSession(it.session);
  return h`<div class="card acc-b"><p class="tiny muted">Séance partagée${it.author ? ` par ${it.author}` : ''}</p><h1 style="margin:.1em 0">${s.emoji || '🏋️'} ${it.title}</h1>
      <p class="small muted">${it.exerciseCount} exercices · environ ${it.durationMin} min</p>
      ${S.user ? h`<div class="grid2"><button class="btn pri big" data-act="linkSave">💾 Garder</button><button class="btn big" data-act="linkPlay">▶ Faire maintenant</button></div>`
        : h`<div class="stack"><button class="btn pri big" data-act="linkLogin" data-mode="login">Me connecter pour la garder</button><button class="btn" data-act="linkLogin" data-mode="register">Créer un compte</button><button class="btn ghost" data-act="guestStart">Essayer sans compte</button></div>`}</div>
    <div class="card">${blocksOf(s, 'view')}</div>${out}`;
}
ACT.linkLogin = (el) => { if (el.dataset.mode === 'up') { ACT.guestUpgrade?.(); return; } S.authMode = el.dataset.mode === 'register' ? 'register' : 'login'; render(); };
ACT.linkClose = () => { clearPending(); S.linkView = null; if (S.user) go('home', 'dash'); else render(); };
ACT.linkSave = () => {
  const it = S.linkView?.item; if (!it) return;
  const now = Date.now(), src = normalizeSession(it.session);
  const s = saveSeance({ ...src, id: uid(), name: it.title, source: 'copy', exercises: src.exercises.map((e) => ({ ...e, id: uid(), note: '' })), origin: { kind: 'link', id: it.id, author: it.author || '', copiedAt: now }, createdAt: now, updatedAt: now });
  clearPending(); S.linkView = null; toast('Gardée dans Mes séances'); go('library', 'seance', s.id);
};
ACT.linkPlay = () => { const it = S.linkView?.item; if (!it) return; clearPending(); S.linkView = null; render(); startPlayer(it.session); };
ACT.pubLogin = () => { location.hash = ''; S.authMode = 'login'; render(); };
ACT.tourStart2 = () => maybeTour(true);
ACT.pubView = async (el) => { try { const r = await api('GET', `/api/public/s/${encodeURIComponent(el.dataset.id)}`, undefined, { quiet401: true }); S.publicSession = r.item; render(); } catch (e) { toast(e.message); } };

/* ═════════ Événements ═════════ */
document.getElementById('player')?.addEventListener('click', (e) => bigTap(e));
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch((err) => { console.error(err); toast('Action impossible : ' + (err?.message || 'erreur inattendue'), 4500, 'bad'); });
});
// Textes d'explication repliés sur 2 lignes : un toucher les déplie (sans déclencher d'action).
document.addEventListener('click', (e) => { const p = e.target.closest('.card p.tiny.muted, .card p.small.muted'); if (p && !e.target.closest('[data-act], a, button')) p.classList.toggle('x'); });
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]'); if (!f) return;
  e.preventDefault();
  const fn = SUBMIT[f.dataset.submit]; if (fn) Promise.resolve().then(() => fn(f, e)).catch((err) => { console.error(err); toast('Enregistrement impossible : ' + (err?.message || 'erreur'), 4500, 'bad'); });
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (!el) return; const fn = CHG[el.dataset.change]; if (fn) try { fn(el); } catch (err) { console.error(err); toast(err.message, 4000, 'bad'); } });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (!el) return; const fn = INPUT[el.dataset.input]; if (fn) fn(el); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
window.addEventListener('hashchange', () => { catchLink(); parseHash(); closeSheet(); render(); });
window.addEventListener('online', () => syncAll());
window.addEventListener('offline', () => { S.sync = 'offline'; render(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { writePending(); persistNow(); return; }
  if (S.player) onVisible(); else if (S.user && Date.now() - (S.lastSync || 0) > 60000) syncAll();
});
window.addEventListener('pagehide', () => { writePending(); persistNow(); });

/* ═════════ Démarrage ═════════ */
/* ═════════ Mises à jour : chaque déploiement (modification sur GitHub) est proposé dans le site et l'app ═════════ */
const UPD = { reg: null, boot: '', available: false, fresh: false, later: 0, since: 0 };
// Dernière version vue sur cet appareil : si le site a changé depuis (même application fermée entre-temps),
// un bandeau « mis à jour » s'affiche une fois, avec un bouton pour voir ce qui a changé.
const SEEN_KEY = 'sea:seen-build';
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch { return null; } };
const writeSeen = (build) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ build, at: Date.now() })); } catch { /* stockage indisponible */ } };
function showUpdate() { UPD.available = true; renderUpdateBar(); }
function renderUpdateBar() {
  let bar = document.getElementById('updbar');
  const hidden = !(UPD.available || UPD.fresh) || S.player || Date.now() < UPD.later || document.body.classList.contains('touring');
  if (hidden) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'updbar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
  const tour = pendingNews().length > 0;
  const html = UPD.available
    ? h`<div class="ut"><span>🆕 <b>Nouvelle version prête</b></span><button class="btn ghost sm ic" data-act="updLater" aria-label="Plus tard">✕</button></div>
      <div class="ub"><button class="btn sm" data-act="updWhat">👀 Nouveautés</button><button class="btn pri sm" data-act="updNow">Mettre à jour</button></div>`
    : h`<div class="ut"><span>🎉 <b>L’app a été mise à jour</b></span><button class="btn ghost sm ic" data-act="updSeen" aria-label="Fermer">✕</button></div>
      <div class="ub">${tour ? h`<button class="btn sm" data-act="updWhat">👀 Détails</button><button class="btn pri sm" data-act="newsTour">🧭 Faire la visite</button>` : h`<button class="btn pri sm" data-act="updWhat">👀 Voir les nouveautés</button>`}</div>`;
  if (bar.innerHTML !== html.s) bar.innerHTML = html.s;
  bar.classList.toggle('fresh', !UPD.available);
}
ACT.updSeen = () => { UPD.fresh = false; writeSeen(UPD.boot); markNewsToured(); renderUpdateBar(); };
/** Visite des nouveautés : seulement ce qui a changé depuis la dernière visite (ou la dernière version, à la demande). */
ACT.newsTour = () => {
  const steps = pendingNews().length ? pendingNews() : latestNews();
  if (UPD.fresh) { UPD.fresh = false; writeSeen(UPD.boot); }
  markNewsToured(); closeSheet(); renderUpdateBar();
  if (!S.user) { toast('Connecte-toi ou essaie sans compte pour faire la visite.'); return; }
  setTimeout(() => startTour({ steps }), 120);
};
/** Aperçu de ce qui a changé : les dernières modifications publiées (historique du dépôt GitHub). */
ACT.updWhat = async () => {
  const since = UPD.since;
  const tour = pendingNews().length > 0;
  if (UPD.fresh) { UPD.fresh = false; writeSeen(UPD.boot); renderUpdateBar(); }
  openSheet(h`<div class="news"><h2>🆕 Quoi de neuf ?</h2>${skeleton(3)}</div>`);
  let list = [];
  try { const r = await fetch('/api/changes'); if (r.ok) list = (await r.json()).changes || []; } catch { /* hors ligne */ }
  let recent = since ? list.filter((c) => c.date > since - 3600000) : [];
  const older = !recent.length;
  if (older) recent = list.slice(0, 4);
  const day = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const body = h`<div class="news"><h2>🆕 Quoi de neuf ?</h2>
    ${recent.length ? h`<p class="small muted">${older ? 'Les dernières améliorations du site :' : `${recent.length} amélioration${recent.length > 1 ? 's' : ''} depuis ta dernière visite :`}</p>
      <ol class="newslist">${recent.slice(0, 8).map((c) => h`<li><span class="nd">${day(c.date)}</span><div><b>${c.title}</b>${c.points?.length ? h`<ul>${c.points.map((p) => h`<li>${p}</li>`)}</ul>` : ''}</div></li>`)}</ol>`
      : h`<p class="small muted">Petites améliorations et corrections. ${navigator.onLine ? '' : 'Connecte-toi à Internet pour voir le détail.'}</p>`}
    <div class="row">${UPD.available ? h`<button class="btn pri" data-act="updNow">Mettre à jour maintenant</button>` : tour ? h`<button class="btn pri" data-act="newsTour">🧭 Visite des nouveautés</button>` : ''}<span class="grow"></span><button class="btn" data-act="closeSheet">Fermer</button></div></div>`;
  if (document.querySelector('#sheet.open .news')) openSheet(body);
};
ACT.updNow = async () => {
  if (S.player) { toast('Termine ta séance, puis mets à jour.'); return; }
  writePending(); await persistNow();
  sessionStorage.setItem('sea:user-update', '1');
  const w = UPD.reg?.waiting;
  if (w) { w.postMessage('SKIP_WAITING'); setTimeout(() => location.reload(), 4000); } // rechargement au changement de version (ou au plus tard 4 s)
  else location.reload();
};
ACT.updLater = () => { UPD.later = Date.now() + 3 * 3600000; renderUpdateBar(); };
/** Vérifie s'il existe une version plus récente sur le serveur (sans compte, sans cache). */
async function checkUpdate() {
  try { await UPD.reg?.update(); } catch { /* hors ligne */ }
  try {
    const r = await fetch('/api/version', { cache: 'no-store' }); if (!r.ok) return;
    const { build } = await r.json();
    if (!build) return;
    if (!UPD.boot) {
      UPD.boot = build;
      const seen = readSeen();
      initNews();
      if (!seen?.build) writeSeen(build); // première visite : rien à annoncer
      else if (seen.build !== build || pendingNews().length) { UPD.fresh = true; UPD.since = seen.at || 0; renderUpdateBar(); }
    } else if (build !== UPD.boot) showUpdate();
  } catch { /* hors ligne : on réessaiera */ }
}
window.__seaCheckUpdate = checkUpdate;
function registerSW() {
  checkUpdate(); setInterval(checkUpdate, 20 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    UPD.reg = reg;
    // Mise à jour demandée juste avant ce rechargement : si la nouvelle version attend encore, on l'active (sans reproposer le bandeau).
    const asked = sessionStorage.getItem('sea:user-update');
    if (reg.waiting && navigator.serviceWorker.controller) { if (asked) reg.waiting.postMessage('SKIP_WAITING'); else showUpdate(); }
    else if (asked) sessionStorage.removeItem('sea:user-update');
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); });
    });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nouvelle version activée : rechargement si l'utilisateur l'a demandée, jamais pendant une séance.
    if (reloading || S.player) return;
    if (sessionStorage.getItem('sea:user-update')) { reloading = true; sessionStorage.removeItem('sea:user-update'); location.reload(); }
  });
}
async function start() {
  if (await maybeMove()) return; // ancienne adresse : redirection vers la nouvelle, avec les données de l'appareil
  if (await maybeClaim()) return;
  // Raccourcis de l'icône (appui long) : ?do=timer / ?do=gen
  const newsParam = new URLSearchParams(location.search).get('news');
  if (newsParam) { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => ACT.notifOpen?.(), 900); }
  setTimeout(() => refreshInbox({ sound: true }), 1500);
  const doIt = new URLSearchParams(location.search).get('do');
  if (doIt === 'timer' || doIt === 'gen') { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => { if (S.user) (doIt === 'timer' ? ACT.timerOpen : ACT.genOpen)?.(); }, 900); }
  registerSW();
  loadGlobal(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadGlobal(); });
  catchLink();
  parseHash();
  const cached = ls.get('sea:user');
  if (cached?.guest) { S.user = { ...GUEST }; render(); await loadLocal(); render(); window.__seaStarted = true; return; }
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
