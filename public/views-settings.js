import { cleanExternal, externalOf } from './external.js';
import { vIntegrations } from './views-integrations.js';
import { advancedUI, interfaceChoice } from './views-experience.js';
import { appIconsCard, notificationIconsCard } from './app-icons.js';
import { registerPaths } from './pathlinks.js';
import { adminSearchCard } from './admin-search.js';
// views-settings.js — Paramètres : séance, apparence, compte, données (export / import JSON, import CSV),
// synchronisation et diagnostic, administration (EDIT_PASSWORD vérifié par le serveur), signalement de bug.
import { h, raw, icon, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, fmtDateTime, fmtDay, relDate, buzzOk, skeleton, subHead, menuList } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, APP_VERSION, ctx, go, render, api, queue, saveSettings, syncAll, retryFailed, discardFailed, restoreConflict, pendingCount, persistNow, clearLocal, DEFAULT_SETTINGS, putItem, itemsOf, addHistory, saveEvent, ls, writePending, persist, bump, syncSoon, accountToken, accountMatches } from './state.js';
import { uid, mergeSeances, readStored, normalizeSession } from './shared.js';
import { cleanItem, itemKey } from './items.js';
import { parseCSV, proposeMapping, checkMapping, proposeMetricMap, buildImport, TARGETS, MAX_CSV_BYTES } from './csv.js';
import { describeOp } from './outbox.js';
import { installCard, openSetup, showTour } from './views-setup.js';
import { SOUND_STYLES, beep } from './sound.js';
import { remindersCard } from './reminders.js';
import { NEWS } from './news.js';
import { filterBugs } from './adminlist.js';
import { vStudio, vStudioSet, vAudit, vLab, vHealth, vMaint, vCode, vCodeItem, canRole, ROLE_L } from './views-studio.js';
import { FAQ } from './help.js';
import { faqAdminButtons, announcements, loadGlobal } from './content.js';
import { vAdminContent, vAdminLook, vAdminChanges, globalChanges } from './content.js';
import { vAssistant } from './views-assistant.js';
import { vSources } from './views-catalog.js';
import { CAPACITIES, ACTIVITIES } from './model.js';

export const APPEAR_KEYS = ['mode', 'palette', 'accent', 'shape', 'radius', 'size', 'density', 'motion', 'vibe', 'easy', 'cb', 'big', 'contrast'];
export const VIBES = [['classique', 'Classique', 'Sobre et lisible'], ['chaleureux', 'Chaleureux', 'Tons chauds, tout en douceur'], ['muscu', 'Salle de muscu', 'Noir, rouge, énergique'], ['nature', 'Grand air', 'Vert forêt, esprit falaise'], ['minimal', 'Minimal', 'Épuré, sans effets'], ['neon', 'Néon', 'Sombre et lumineux']];
const PALETTES = [['gres', '#d4a056', 'Or'], ['granit', '#5fa8d3', 'Bleu'], ['foret', '#5cb87a', 'Vert'], ['corail', '#ef6f5e', 'Rouge'], ['encre', '#a78bfa', 'Violet'], ['rose', '#f472b6', 'Rose'], ['contraste', '#ffd60a', 'Contraste élevé (jaune)']];
const SUBS = [['main', 'Paramètres'], ['display', 'Affichage et accessibilité'], ['session', 'Pendant la séance'], ['notifs', 'Notifications et rappels'], ['help', 'Aide'], ['data', 'Mes données'], ['integrations', 'Applications connectées'], ['sync', 'Synchronisation'], ['updates', 'Toutes les mises à jour'], ['bug', 'Signaler un bug'], ['admin', 'Administration'], ['studio', 'Studio'], ['studioSet', 'Lot'], ['audit', 'Journal'], ['lab', 'Laboratoire'], ['health', 'Santé des données'], ['maint', 'Maintenance'], ['code', 'Propositions de code'], ['codeItem', 'Proposition'], ['assistant', 'Assistant du site'], ['content', 'Contenu de l’app'], ['look', 'Textes et apparence'], ['changes', 'Tout ce qui a été modifié'], ['members', 'Propositions des membres'], ['bugs', 'Signalements'], ['users', 'Comptes et rôles'], ['push', 'Notifications de mise à jour']];
/** Rubriques des paramètres : une ligne claire par rubrique, comme les réglages d'un téléphone. */
const MENU = [
  ['display', '🎨', 'Affichage et accessibilité', 'Thème, icônes de l’app et des notifications, texte, couleurs, langue'],
  ['session', '▶️', 'Pendant la séance', 'Voix, sons, vibration, repos et durée'],
  ['notifs', '🔔', 'Notifications et rappels', 'Choisir ce qui m’avertit et quand'],
  ['integrations', '🔗', 'Applications connectées', 'Strava, montres et imports sportifs'],
  ['data', '💾', 'Mes données', 'Exporter, importer un historique'],
  ['sync', '🔄', 'Synchronisation', 'État de l’envoi de tes données'],
  ['shareapp', '📲', 'Partager l’app', 'Un QR code à scanner pour ouvrir le site sur un autre téléphone', 'shareApp'],
  ['help', '❓', 'Aide', 'Visite guidée, questions fréquentes, sources'],
  ['updates', '🆕', 'Toutes les mises à jour', 'L’évolution de l’app depuis le début, avec une visite pour chacune'],
  ['bug', '🐞', 'Signaler un bug', 'Un problème ? Dis-le nous'],
  ['idea', '💡', 'Proposer une amélioration', 'Une idée, une modification ? Les administrateurs répondent', 'ideaNew'],
  ['votes', '🗳️', 'Idées à voter', 'Les idées retenues par l’équipe : vote pour celles que tu veux', 'ideasOpen'],
  ['admin', '🛡️', 'Administration', 'Modifier le site et gérer les membres'],
];
// Les indications de chemin vers ces pages, écrites dans l'app, deviennent des liens (pas les actions).
registerPaths('Paramètres', 'settings', MENU.filter((m) => m.length < 5).map(([id, , label]) => [label, id]));
/** Partager le site : QR code qui ouvre l'adresse de l'app, comme si on la tapait. */
export const SITE_URL = 'https://seances-sport.pages.dev/';
ACT.shareApp = async () => {
  const { qrSvg } = await import('./share.js');
  openSheet(h`<div class="sharesheet center"><h2>📲 Partager l’app</h2><p class="small">Fais scanner ce QR code avec l’appareil photo d’un téléphone : il ouvre le site directement.</p>
    <div class="qrbox" id="appqr">${raw(qrSvg(SITE_URL))}</div><p class="small"><b>${SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}</b></p>
    <div class="grid2"><button class="btn pri" data-act="shareAppNative">📤 Envoyer le lien</button><button class="btn" data-act="shareAppCopy">📋 Copier le lien</button></div>
    <button class="btn" data-act="shareAppSave">⬇️ Télécharger le QR code (pour l’imprimer ou l’afficher)</button></div>`);
};
ACT.shareAppNative = () => { if (navigator.share) navigator.share({ title: 'Séances entraînement', text: 'L’app que j’utilise pour mes séances :', url: SITE_URL }).catch(() => {}); else ACT.shareAppCopy(); };
ACT.shareAppCopy = async () => { try { await navigator.clipboard.writeText(SITE_URL); toast('Lien copié'); } catch { toast(SITE_URL, 5000); } };
ACT.shareAppSave = () => {
  const svg = document.querySelector('#appqr svg'); if (!svg) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' })); a.download = 'qr-seances-sport.svg';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('QR code téléchargé');
};
const guestNeed = (what) => h`<div class="card acc-b"><h3>🔒 Compte nécessaire</h3><p class="small">${what} demande un compte (gratuit). En le créant, tout ce que tu as fait en mode invité est conservé.</p><button class="btn pri" data-act="guestUpgrade">Créer mon compte</button></div>`;
/* Pages de l'administration : d'où l'on vient (retour) et leur titre. */
const ADMIN_PARENT = { assistant: ['admin', 'Administration'], content: ['admin', 'Administration'], look: ['admin', 'Administration'], changes: ['admin', 'Administration'], members: ['admin', 'Administration'], bugs: ['admin', 'Administration'], users: ['admin', 'Administration'], push: ['admin', 'Administration'],
  studio: ['admin', 'Administration'], studioSet: ['studio', 'Brouillons et publication'], audit: ['admin', 'Administration'], lab: ['admin', 'Administration'], health: ['admin', 'Administration'], maint: ['admin', 'Administration'], code: ['admin', 'Administration'], codeItem: ['code', 'Propositions de code'] };
const ADMIN_TITLE = { assistant: '💬 Assistant du site', content: '🧩 Contenu de l’app', look: '✏️ Textes et apparence', changes: '📝 Tout ce qui a été modifié', members: '📬 Propositions des membres', bugs: '🐞 Signalements', users: '👥 Comptes et rôles', push: '🔔 Notifications de mise à jour',
  studio: '🧪 Brouillons et publication', studioSet: '📝 Brouillon et modifications', audit: '📜 Journal', lab: '🧠 Laboratoire', health: '🩺 Santé des données', maint: '🛠️ Maintenance', code: '💻 Propositions de code', codeItem: '💻 Proposition' };
const adminOnly = (fn, role) => () => (!S.user?.isAdmin ? h`<p class="small muted">Réservé aux administrateurs.</p>` : role && !canRole(role) ? h`<div class="card"><p class="small">Rôle « ${ROLE_L[role]} » nécessaire pour cette rubrique.</p></div>` : fn());
export function vSettings() {
  const subs = S.user.guest ? SUBS.filter(([k]) => k !== 'sync' && !ADMIN_PARENT[k] && k !== 'admin') : SUBS;
  const sub = subs.some(([k]) => k === S.sub.settings) ? S.sub.settings : 'main';
  const views = { main: vMain, display: vDisplay, session: vSession, updates: vUpdates, notifs: vNotifs, help: vHelp, data: vData, integrations: vIntegrations, sync: vSync, admin: vAdmin, studio: vStudio, studioSet: vStudioSet, audit: vAudit, lab: vLab, health: vHealth, maint: vMaint, code: vCode, codeItem: vCodeItem, assistant: adminOnly(vAssistant), content: adminOnly(vAdminContent, 'content'), look: adminOnly(vAdminLook, 'content'), changes: adminOnly(vAdminChanges, 'content'), members: adminOnly(vAdminProposals, 'content'), bugs: adminOnly(vAdminBugs, 'technical'), users: adminOnly(vAdminUsers, 'users'), push: adminOnly(vAdminPush, 'technical'), bug: () => (S.user.guest ? guestNeed('Envoyer un signalement') : vBug()) };
  if (sub === 'main') return h`<h1>Paramètres</h1><p class="tiny muted pagehelp">Choisis ton interface, puis le réglage à modifier.</p>${views.main()}`;
  if (ADMIN_PARENT[sub]) { const [pk, pl] = ADMIN_PARENT[sub]; return h`${subHead('setSub', pk, pl, ADMIN_TITLE[sub] || sub)}${views[sub]()}`; }
  return h`${subHead('setSub', 'main', 'Paramètres', subs.find(([k]) => k === sub)[1])}${views[sub]()}`;
}
ACT.setSub = (el) => { go('settings', el.dataset.id); if (el.dataset.id === 'admin' && S.user?.isAdmin) loadBugs(); if (el.dataset.id === 'bug' && !S.user?.guest) loadMyBugs(); };

/* ═════════ Accueil des paramètres : compte, rubriques, profil sportif, installation ═════════ */
function vMain() {
  const account = S.user.guest
    ? h`<div class="card acc-b"><h3>👀 Mode invité</h3><p class="small">Tes données restent <b>uniquement sur cet appareil</b> : si tu effaces le navigateur ou changes de téléphone, elles sont perdues. Crée un compte gratuit pour les garder et les retrouver partout.</p>
        <button class="btn pri big" data-act="guestUpgrade">Créer mon compte (je garde mes données)</button>
        <div class="row wrapf"><button class="btn" data-act="guestLogin">J’ai déjà un compte</button><button class="btn danger" data-act="guestQuit">Quitter le mode invité</button></div></div>`
    : h`<div class="card"><div class="row between wrapf"><h3 class="set-account-name">👤 ${S.user.username} ${S.user.isAdmin ? tag('administrateur', 'acc') : ''}</h3><button class="btn sm" data-act="logout">Se déconnecter</button></div>
        <details class="how mini"><summary>Gérer mon compte</summary><div class="row wrapf"><button class="btn" data-act="chpass">Changer le mot de passe</button><button class="btn danger" data-act="delAccount">Supprimer mon compte</button></div></details></div>`;
  const entries = MENU.filter(([k]) => !(S.user.guest && ['sync', 'admin', 'idea', 'votes'].includes(k)));
  const common = new Set(['display', 'session', 'notifs', 'integrations', 'data', 'help', ...(S.user.isAdmin ? ['admin'] : [])]);
  const rows = (list) => h`<div class="setmenu">${list.map(([k, ic, t, d, a]) => h`<button class="setrow" data-act="${a || 'setSub'}" data-id="${k}"><span class="sic" aria-hidden="true">${icon(k, ic)}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev" aria-hidden="true">›</span></button>`)}</div>`;
  return h`<label class="findbox"><span aria-hidden="true">🔍</span><input type="search" data-input="setFind" placeholder="Ex. texte, rappel, mot de passe…" aria-label="Rechercher un paramètre" autocomplete="off"></label>
    <div id="setfindres" aria-live="polite"></div>
    <div class="setmain">${interfaceChoice()}${rows(entries.filter(([k]) => common.has(k)))}${account}
    <details class="card" id="settings-more" ${advancedUI() ? 'open' : ''}><summary>Autres options</summary>
    ${rows(entries.filter(([k]) => !common.has(k)))}
    <div class="card"><h3>🧩 Mon profil sportif</h3><p class="small muted">Pour que l’app s’adapte à toi (sports, niveau, temps, matériel, objectif).</p>
      <button class="btn pri" data-act="setupAgain" data-id="quiz">Mettre à jour mon profil</button>
      <details class="how mini"><summary>Modifier avec la fiche complète</summary><button class="btn" data-act="setupAgain" data-id="form">Ouvrir la fiche</button></details></div>
    ${installCard({ force: true })}
    <div class="card"><h3>ℹ️ À propos</h3><p class="small">Séances entraînement · version ${APP_VERSION}. ${S.user.guest ? 'Mode invité : données sur cet appareil uniquement.' : 'Tes données sont liées à ton compte et synchronisées ; elles restent utilisables hors ligne.'}</p>
      <p class="tiny muted">Les séances et analyses suivent des principes d’entraînement courants. Elles ne constituent ni un avis médical ni un diagnostic. Aucune comparaison avec d’autres personnes n’est faite.</p></div></details></div>`;
}
function prefs() {
  const st = S.settings, a = window.__sea.load();
  const segA = (k, opts) => h`<div class="chips">${opts.map(([v, l]) => chip(a[k] === v, l, `data-act="appear" data-k="${k}" data-v="${v}"`))}</div>`;
  const tog = ([k, l]) => h`<label class="chk"><input type="checkbox" data-change="pref" name="${k}" ${st[k] ? 'checked' : ''}> ${l}</label>`;
  return { st, a, segA, tog };
}
/* ═════════ Toutes les mises à jour, de la plus récente à la première ═════════ */
function vUpdates() {
  const notes = announcements().filter((a) => a.update);
  const list = NEWS.slice().reverse();
  return h`<p class="small muted">Chaque mise à jour a sa visite : elle montre, à l’écran, ce qui a changé. Idéal pour voir comment l’app a évolué.</p>
    ${notes.map((a) => h`<div class="card upd"><div class="row between"><span class="kicker">${a.emoji} Note de l’équipe</span><span class="tiny muted">${new Date(a.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div><h3 style="margin:.2em 0">${a.title}</h3>${a.body ? h`<p class="small">${a.body}</p>` : ''}</div>`)}
    ${list.map((n, i) => h`<div class="card upd ${i === 0 ? 'acc-b' : ''}"><div class="row between"><span class="kicker">Version ${n.v}${i === 0 ? ' · la plus récente' : ''}</span><span class="tiny muted">${new Date(n.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      <h3 style="margin:.2em 0">${n.title}</h3><p class="small">${n.why}</p>
      <div class="row wrapf"><button class="btn sm ${i === 0 ? 'pri' : ''}" data-act="notifTour" data-v="${n.v}">🧭 Lancer la visite (${n.steps.length} étape${n.steps.length > 1 ? 's' : ''})</button></div>
      <details class="how mini"><summary>Ce qui a changé</summary><ul class="small">${n.steps.map((st) => h`<li><b>${st[3]}</b> : ${st[4]}</li>`)}</ul></details></div>`)}`;
}
/* ═════════ Affichage et mise en page ═════════ */
function vDisplay() {
  const { st, a, segA, tog } = prefs();
  return h`<div class="card"><h3>Thème et langue</h3>
      <label>Thème</label>${segA('mode', [['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Automatique']])}
      <label>Langue<select data-change="pref" name="lang"><option value="fr" ${st.lang !== 'en' ? 'selected' : ''}>Français</option><option value="en" ${st.lang === 'en' ? 'selected' : ''}>English (beta)</option></select></label></div>
    <span class="kicker">🖼️ Icônes de l’app et des notifications</span>
    ${appIconsCard()}
    ${notificationIconsCard()}
    ${a11yCard(a)}
    <details class="card" ${advancedUI() ? 'open' : ''}><summary>Couleurs, ambiance et animations</summary>
      <label>Ambiance</label><div class="vibes">${VIBES.map(([id, n, d]) => h`<button type="button" class="vibe ${(a.vibe || 'classique') === id ? 'on' : ''}" data-act="appear" data-k="vibe" data-v="${id}" data-vibe-preview="${id}"><span class="vprev"><i></i><i></i><i></i></span><b>${n}</b><small>${d}</small></button>`)}</div>
      <label>Couleur</label><div class="palette">${(a.vibe || 'classique') !== 'classique' ? h`<button type="button" class="sw none ${a.accent ? '' : 'on'}" title="Couleur de l’ambiance" aria-label="Couleur de l’ambiance" data-act="appearColor" data-v="">∅</button>` : ''}${PALETTES.map(([id, c, n]) => h`<button type="button" class="sw ${((a.vibe || 'classique') === 'classique' ? a.palette === id && !a.accent : a.accent === c) ? 'on' : ''}" style="background:${c}" title="${n}" aria-label="${n}" data-act="appearColor" data-id="${id}" data-v="${c}"></button>`)}</div>
      ${tog(['season', '🍂 Décor de saison sur l’accueil (neige, fleurs, feuilles…)'])}
      <label>Espacement</label>${segA('density', [['compact', 'Serré'], ['normal', 'Normal'], ['airy', 'Aéré']])}<label>Animations</label>${segA('motion', [['on', 'Oui'], ['off', 'Non']])}</details>
    <details class="card" ${advancedUI() ? 'open' : ''}><summary>Organiser mes écrans</summary><p class="small muted">Choisis les rubriques et leur ordre. Tu peux aussi utiliser le bouton « Organiser » sur chaque page.</p>
      <div class="row wrapf"><button class="btn" data-act="layEditAt" data-to="home/dash">Accueil</button><button class="btn" data-act="layEditAt" data-to="progress/summary">Progrès</button><button class="btn" data-act="layEditAt" data-to="library/home">Bibliothèque</button><button class="btn" data-act="layEditAt" data-to="profile/home">Profil</button></div>
      ${tog(['hideLayEdit', 'Masquer le bouton ✏️ « Organiser » en haut des pages (la mise en page reste ici, et dans ☰ › « Mise en page »)'])}
      <button class="btn ghost" data-act="layReset" data-scope="all">Revenir à la mise en page de base partout</button></details>
`;
}
/** Accessibilité : réglages de CET appareil (et du compte s'il y en a un). Proposés aussi dès le premier écran. */
export const A11Y = [['easy', '📖', 'Lecture facile', 'Police plus lisible, lignes plus espacées, pas d’italique'], ['big', '👆', 'Gros boutons', 'Boutons et cases plus grands, plus faciles à toucher'],
  ['contrast', '🔲', 'Contraste renforcé', 'Textes et bordures bien marqués'], ['cb', '🎨', 'Couleurs pour daltonisme', 'Bleu / orange au lieu de vert / rouge']];
export function a11yCard(a = window.__sea.load()) {
  return h`<div class="card"><h3>Texte et accessibilité</h3>
    <label>Taille du texte</label><div class="chips">${[['s', 'Petit'], ['m', 'Normal'], ['l', 'Grand'], ['xl', 'Très grand']].map(([v, l]) => chip(a.size === v, l, `data-act="a11ySize" data-v="${v}"`))}</div>
    <div class="setmenu">${A11Y.map(([k, ic, t, d]) => h`<button class="setrow ${a[k] === 'on' ? 'on' : ''}" data-act="a11ySet" data-k="${k}" aria-pressed="${a[k] === 'on'}"><span class="sic" aria-hidden="true">${icon(k, ic)}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev" aria-hidden="true">${a[k] === 'on' ? '✓' : ''}</span></button>`)}</div>
    <p class="tiny muted">Au clavier : Tab pour avancer, Entrée pour valider, Échap pour fermer.</p></div>`;
}
function a11ySave(patch) {
  const a = { ...window.__sea.load(), ...patch, _t: Date.now(), _owner: S.user?.id || '' };
  window.__sea.save(a);
  if (S.user && S.loaded) putItem('config', 'appearance', APPEAR_KEYS.reduce((o, k) => ({ ...o, [k]: String(a[k] ?? '') }), {}));
  render(); if (document.querySelector('#sheet.open [data-act=a11ySet]')) ACT.a11yOpen();
}
ACT.a11ySet = (el) => { const k = el.dataset.k; if (A11Y.some(([x]) => x === k)) a11ySave({ [k]: window.__sea.load()[k] === 'on' ? 'off' : 'on' }); };
ACT.a11ySize = (el) => { if (['s', 'm', 'l', 'xl'].includes(el.dataset.v)) a11ySave({ size: el.dataset.v }); };
ACT.a11yOpen = () => openSheet(h`<div class="stack"><h2 style="margin:0">Aa Affichage et accessibilité</h2>${a11yCard()}</div>`);
/* ═════════ Pendant la séance ═════════ */
function vSession() {
  const { st, tog } = prefs();
  return h`
    <div class="card"><h3>▶ Pendant la séance</h3>
      ${[['voice', '🗣️ Coach vocal : il annonce les séries, le repos et le décompte'], ['sound', '🔔 Bips pour les chronos'], ['vibration', '📳 Vibration à la fin du repos'], ['keepAwake', '💡 Garder l’écran allumé'], ['autoWarm', '🔥 Ajouter un échauffement de 5 min à mes séances'], ['bigMode', '🔠 Grand affichage (touche l’écran pour valider)']].map(tog)}
      <div class="grid2"><label>Son des bips<select data-change="pref" name="soundStyle">${SOUND_STYLES.map(([v, l]) => h`<option value="${v}" ${st.soundStyle === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label>Volume<input type="range" data-change="pref" name="volume" min="0" max="100" step="10" value="${st.volume ?? 60}"></label></div>
      <button class="btn sm" data-act="soundTest">🔔 Écouter</button>
      <div class="grid2"><label>Repos par défaut<span class="unitbox"><input type="number" inputmode="numeric" data-change="pref" name="defaultRest" min="0" max="600" value="${st.defaultRest ?? 60}"><em>secondes</em></span></label>
      <label>Durée de séance habituelle<span class="unitbox"><input type="number" inputmode="numeric" data-change="pref" name="defaultMinutes" min="5" max="240" value="${st.defaultMinutes ?? 30}"><em>min</em></span></label></div>
      <details class="how mini"><summary>Options avancées</summary>${[['handsFree', 'Mode mains libres (commandes vocales)'], ['autoBase', 'Proposer d’utiliser mes valeurs réalisées comme nouvelle base']].map(tog)}</details></div>
`;
}
ACT.setupAgain = (el) => openSetup(el.dataset.id);
ACT.guestQuit = async () => {
  if (!(await ask('Quitter le mode invité et effacer ses données de cet appareil ?', { ok: 'Effacer et quitter', danger: true, detail: 'Tes séances, ton historique et ton profil d’invité seront supprimés. Pour les garder, crée plutôt un compte.' }))) return;
  await clearLocal('guest'); ls.del('sea:user'); location.hash = ''; location.reload();
};

/* ═════════ Aide ═════════ */
function vHelp() {
  return h`<div class="card"><h3>🧭 Visite guidée</h3><p class="small">Revois en 30 secondes à quoi sert chaque onglet.</p><div class="row wrapf"><button class="btn pri" data-act="helpTour">Lancer la visite</button><button class="btn" data-act="newsTour">🆕 Revoir les nouveautés</button></div></div>
    <div class="card"><div class="row between"><h3>❓ Questions fréquentes</h3>${S.user?.isAdmin ? h`<button class="btn sm" data-act="faqEdit" data-id="">＋ Ajouter</button>` : ''}</div>${FAQ.map(([q, r, id]) => h`<div class="row faqrow"><details class="faq grow"><summary>${q}</summary><p class="small">${r}</p></details>${faqAdminButtons(id)}</div>`)}</div>${vSources()}`;
}
ACT.helpTour = () => showTour(0);
ACT.soundTest = () => { beep(660, 120); setTimeout(() => beep(1040, 300), 350); };
CHG.pref = (el) => { S.settings[el.name] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Math.max(Number(el.min) || 0, Math.min(Number(el.max) || 600, Number(el.value) || 0)); saveSettings(); document.documentElement.classList.toggle('hands', !!S.settings.handsFree); if (el.name === 'lang') { render(); ACT.pRedraw?.(); } };
function vNotifs() {
  const st = S.settings;
  return h`${remindersCard()}
    <button type="button" class="card spotlink" data-act="goSpot" data-to="settings/display" data-spot="#notification-icons"><span class="sic">🖼️</span><span class="grow"><b>Icône et image des notifications</b><small>Elles se changent dans Paramètres › Affichage et accessibilité, avec l’icône de l’app : touche ici pour y aller.</small></span><span class="chev">›</span></button>
    <div class="card"><h3>🎵 Son dans l’app</h3><p class="small muted">Joué quand de nouvelles notifications arrivent pendant que l’app est ouverte. Le son des notifications du téléphone, lui, se règle dans les réglages du téléphone.</p>
      <div class="row"><select data-change="pref" name="notifSound" class="grow">${[['aucun', 'Aucun'], ...SOUND_STYLES].map(([v, l]) => h`<option value="${v}" ${(st.notifSound || 'doux') === v ? 'selected' : ''}>${l}</option>`)}</select><button class="btn sm" data-act="notifSoundTest">Écouter</button></div></div>
    <button class="btn" data-act="notifOpen">🔔 Ouvrir mes notifications</button>`;
}
ACT.notifSoundTest = () => { const v = S.settings.notifSound || 'doux'; if (v !== 'aucun') { beep(880, 160, v); setTimeout(() => beep(1175, 220, v), 220); } };
/** Couleur : en ambiance « Classique », c'est la palette ; dans les autres ambiances, une couleur par-dessus (∅ = celle de l'ambiance). */
ACT.appearColor = (el) => {
  const a = window.__sea.load(), classic = (a.vibe || 'classique') === 'classique';
  const patch = classic ? { palette: el.dataset.id || a.palette, accent: '' } : { accent: el.dataset.v || '' };
  saveAppear({ ...a, ...patch });
};
function saveAppear(a) {
  a = { ...a, _t: Date.now(), _owner: S.user?.id || '' };
  window.__sea.save(a);
  putItem('config', 'appearance', APPEAR_KEYS.reduce((o, k) => ({ ...o, [k]: String(a[k] ?? '') }), {}));
  render();
}
ACT.appear = (el) => {
  const a = { ...window.__sea.load(), [el.dataset.k]: el.dataset.v, ...(el.dataset.k === 'vibe' ? { accent: '' } : {}), _t: Date.now(), _owner: S.user?.id || '' };
  window.__sea.save(a);
  putItem('config', 'appearance', APPEAR_KEYS.reduce((o, k) => ({ ...o, [k]: String(a[k] ?? '') }), {})); // suit le compte sur tous les appareils
  render();
};
ACT.chpass = () => openSheet(h`<h2 style="margin:0">Changer le mot de passe</h2><form data-submit="chpass" class="stack"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden" aria-hidden="true"><label>Mot de passe actuel<input type="password" name="current" autocomplete="current-password" required></label><label>Nouveau (8 caractères minimum)<input type="password" name="next" autocomplete="new-password" required minlength="8"></label><p class="tiny muted">Tes autres appareils seront déconnectés.</p><button class="btn pri" type="submit">Changer</button></form>`);
SUBMIT.chpass = async (f) => { const d = Object.fromEntries(new FormData(f)); try { await api('POST', '/api/auth/password', { current: d.current, next: d.next }); f.reset(); closeSheet(); toast('Mot de passe changé ; les autres appareils sont déconnectés.'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };
ACT.logout = async () => {
  const n = pendingCount();
  const ok = await ask('Te déconnecter de cet appareil ?', { ok: 'Se déconnecter', detail: n ? `${n} modification(s) pas encore synchronisée(s) : elles restent sur cet appareil et seront envoyées à ta prochaine connexion ici.` : 'Tes données restent sur ton compte.' });
  if (!ok) return;
  await persistNow();
  try { await api('POST', '/api/auth/logout', {}); } catch { /* hors ligne : on se déconnecte localement */ }
  ls.del('sea:user'); S.user = null; S.authMode = 'login'; S.authError = ''; location.hash = ''; render();
};
ACT.delAccount = async () => { const token = accountToken(); if (!(await ask('Supprimer définitivement ton compte et toutes tes données ?', { ok: 'Continuer', danger: true, detail: 'Tes contributions à la bibliothèque commune resteront, sans ton nom.' }))) return; if (!accountMatches(token)) return; openSheet(h`<h2 style="margin:0">Confirmer la suppression</h2><form data-submit="delacct" class="stack"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden" aria-hidden="true"><label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label><button class="btn danger" type="submit">Supprimer définitivement</button></form>`); };
SUBMIT.delacct = async (f) => { const token = accountToken(); try { const id = S.user.id, result = await api('POST', '/api/auth/delete', { password: new FormData(f).get('password') }); await clearLocal(id); if (!accountMatches(token)) return; ls.del('sea:user'); closeSheet(); S.user = null; S.authMode = 'register'; location.hash = ''; render(); toast(result.notice ? 'Compte supprimé. '+result.notice : 'Compte supprimé', result.notice ? 15000 : 3000); } catch (e) { if (accountMatches(token)) toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };

/* ═════════ Données : export / import JSON, import CSV ═════════ */
function vData() {
  const c = S.csv;
  return h`<div class="card"><h3>📦 Sauvegarde complète</h3><p class="small muted">Exporte toutes tes données (séances, historique, calendrier, profil, performances, objectifs, cotations, préférences…) dans un fichier JSON réimportable.</p>
      <div class="row wrapf"><button class="btn pri" data-act="export">📥 Exporter</button><label class="btn">📤 Importer un JSON<input type="file" accept="application/json,.json" data-change="importJson" class="hidden"></label></div>
      <label class="chk"><input type="checkbox" data-change="backupWeekly" ${ls.get('sea:backup-weekly', !!S.user?.guest) ? 'checked' : ''}> 🗓️ Me rappeler chaque semaine de faire une sauvegarde (une carte sur l’accueil)</label>
      ${ls.get('sea:backup-last', 0) ? h`<p class="tiny muted">Dernière sauvegarde depuis cet appareil : ${fmtDay(ls.get('sea:backup-last', 0))}</p>` : ''}</div>
    <div class="card"><h3>📊 Import CSV</h3><p class="small muted">Importe un historique de séances ou des performances depuis un tableur. Tu vérifies la correspondance des colonnes et un aperçu avant tout import.</p>
      <div class="chips">${chip((c?.kind || 'history') === 'history', 'Séances réalisées', 'data-act="csvKind" data-id="history"')}${chip(c?.kind === 'perf', 'Performances', 'data-act="csvKind" data-id="perf"')}</div>
      <label class="btn">Choisir un fichier CSV<input type="file" accept=".csv,text/csv,text/plain" data-change="csvFile" class="hidden"></label>
      ${c?.parsed ? vCsvWizard(c) : ''}</div>`;
}
CHG.backupWeekly = (el) => { ls.set('sea:backup-weekly', !!el.checked); toast(el.checked ? 'Rappel chaque semaine activé' : 'Rappel désactivé'); };
ACT.export = () => {
  ls.set('sea:backup-last', Date.now());
  const data = { app: 'mes-seances', version: 8, exportedAt: new Date().toISOString(), seances: S.seances, history: S.history, events: S.events, settings: S.settings, personal: S.personal, items: [...S.items.values()].filter((i) => !i.del), appearance: window.__sea?.load?.() || {} };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `mes-seances-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Sauvegarde exportée');
};
export function importData(d) {
  if (!d || typeof d !== 'object' || (d.app && !['mes-seances', 'seance-entrainement'].includes(d.app))) throw new Error('Ce fichier n’est pas une sauvegarde de l’application.');
  const now = Date.now(), res = { seances: 0, history: 0, events: 0, items: 0, personal: 0, skipped: 0 };
  const inc = readStored(d.seances ?? []);
  S.seances = mergeSeances(S.seances, inc); S.seancesDirty = true; S.seancesVer++; res.seances = inc.items.length;
  const haveH = new Set(S.history.map((x) => x.id));
  for (const x of (Array.isArray(d.history) ? d.history : []).slice(0, 3000)) {
    if (!x?.id || !/^[\w-]{1,64}$/.test(x.id) || !(x.startedAt > 0) || x.startedAt > now + 600000) { res.skipped++; continue; }
    if (!haveH.has(x.id)) { addHistory({ id: x.id, sessionId: x.sessionId || null, sessionName: String(x.sessionName || 'Séance').slice(0, 100), startedAt: x.startedAt, durationSeconds: x.durationSeconds || 0, data: { ...x.data, ...(cleanExternal(externalOf(x)) ? { external: { ...cleanExternal(externalOf(x)), channel: 'file' } } : {}) } }); haveH.add(x.id); res.history++; }
  }
  const haveE = new Set(S.events.map((x) => x.id));
  for (const x of (Array.isArray(d.events) ? d.events : []).slice(0, 3000)) { if (x?.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && !haveE.has(x.id)) { saveEvent(x); haveE.add(x.id); res.events++; } }
  for (const it of (Array.isArray(d.items) ? d.items : []).slice(0, 20000)) {
    const c = cleanItem({ ...it, u: now }); if (!c || c.del) { res.skipped++; continue; }
    const k = itemKey(c.c, c.id), cur = S.items.get(k);
    if (!cur || cur.del || (it.u || 0) > cur.u) { S.items.set(k, { ...c, u: Math.max(now, (cur?.u || 0) + 1) }); S.dirtyItems.add(k); res.items++; }
  }
  const haveP = new Set(S.personal.map((x) => x.name.toLowerCase()));
  for (const x of (Array.isArray(d.personal) ? d.personal : []).slice(0, 1000)) { const data = x?.data || x, name = String(data?.name || x?.name || '').trim(); if (!name || haveP.has(name.toLowerCase())) continue; const id = uid(); S.personal.push({ id, name, data }); queue('POST', '/api/exercises/personal', { id, exercise: data }); haveP.add(name.toLowerCase()); res.personal++; }
  if (d.settings && typeof d.settings === 'object') { for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in d.settings) S.settings[k] = d.settings[k]; if (d.settings.level) S.settings.level = d.settings.level; saveSettings(); }
  if (d.appearance && typeof d.appearance === 'object' && window.__sea?.save) window.__sea.save({ ...window.__sea.DEFAULTS, ...d.appearance });
  return res;
}
let jsonRead = 0;
CHG.importJson = async (el) => {
  const file = el.files?.[0]; el.value = ''; if (!file) return;
  if (file.size > 8_000_000) { toast('Fichier trop volumineux (8 Mo maximum).', 4000, 'bad'); return; }
  const token = accountToken(), request = ++jsonRead;
  let d; try { d = JSON.parse(await file.text()); } catch { if (accountMatches(token) && request === jsonRead) toast('Fichier illisible : ce n’est pas un JSON valide.', 4000, 'bad'); return; }
  if (!accountMatches(token) || request !== jsonRead) return;
  if (!(await ask('Importer cette sauvegarde ?', { ok: 'Importer', detail: 'Les éléments sont fusionnés avec tes données actuelles, sans rien supprimer. Le serveur valide chaque élément.' }))) return;
  if (!accountMatches(token) || request !== jsonRead) return;
  try { const r = importData(d); writePending(); persist(); bump(); syncSoon(200); buzzOk(); toast(`Importé : ${r.seances} séance(s), ${r.history} historique(s), ${r.events} événement(s), ${r.items} donnée(s) de profil, ${r.personal} exercice(s)${r.skipped ? ` · ${r.skipped} élément(s) invalide(s) ignoré(s)` : ''}.`, 6000); render(); }
  catch (e) { toast(e.message, 5000, 'bad'); }
};
let csvRead = 0;
ACT.csvKind = (el) => { csvRead++; S.csv = { kind: el.dataset.id }; render(); };
CHG.csvFile = async (el) => {
  const file = el.files?.[0]; el.value = ''; if (!file) return;
  if (file.size > MAX_CSV_BYTES) { toast('Fichier trop volumineux.', 4000, 'bad'); return; }
  const token = accountToken(), request = ++csvRead, kind = S.csv?.kind || 'history';
  try {
    const text = await file.text(); if (!accountMatches(token) || request !== csvRead) return;
    const parsed = parseCSV(text);
    const { mapping, notes } = proposeMapping(parsed.headers, kind);
    S.csv = { kind, parsed, mapping, notes, metricMap: {}, name: file.name, token };
    refreshMetricMap(); render();
  } catch (e) { if (accountMatches(token) && request === csvRead) toast(e.message, 5000, 'bad'); }
};
function refreshMetricMap() {
  const c = S.csv; if (c.kind !== 'perf') return;
  const col = Object.entries(c.mapping).find(([, f]) => f === 'metric')?.[0];
  const values = col != null ? c.parsed.rows.map((r) => r[col]) : [];
  c.metricMap = { ...proposeMetricMap(values, ctx().metrics), ...Object.fromEntries(Object.entries(c.metricMap).filter(([v]) => values.includes(v))) };
}
function vCsvWizard(c) {
  const T = TARGETS[c.kind], chk = checkMapping(c.mapping, c.kind);
  const pre = chk.ok ? buildImport({ ...c.parsed, rows: c.parsed.rows.slice(0, 200) }, c.mapping, c.kind, { metricMap: c.metricMap }) : null;
  const metrics = Object.entries(ctx().metrics).filter(([, m]) => m.kind !== 'grade');
  return h`<div class="card flat"><b>${c.name}</b> · ${c.parsed.rows.length} ligne(s) · séparateur « ${c.parsed.sep === '\t' ? 'tabulation' : c.parsed.sep} »
    <h3>1. Correspondance des colonnes</h3><p class="tiny muted">Rien n’est deviné en silence : vérifie chaque colonne. « Non importée » = ignorée.</p>
    ${c.parsed.headers.map((hd, i) => h`<div class="item"><div class="grow"><b>${hd}</b><div class="tiny muted">ex. : ${c.parsed.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ') || '—'}</div><div class="tiny ${c.mapping[i] ? 'ok-t' : 'warn-t'}">${c.notes[i]}</div></div>
      <select data-change="csvMap" data-i="${i}" aria-label="Champ pour ${hd}"><option value="">Non importée</option>${Object.entries(T).map(([f, t]) => h`<option value="${f}" ${c.mapping[i] === f ? 'selected' : ''}>${t.label}${t.required ? ' *' : ''}</option>`)}</select></div>`)}
    ${chk.errors.map((e) => h`<p class="small err">⚠ ${e}</p>`)}
    ${c.kind === 'perf' && Object.keys(c.metricMap).length ? h`<h3>2. Correspondance des métriques</h3>${Object.entries(c.metricMap).map(([v, mid]) => h`<div class="item"><div class="grow"><b>${v}</b>${!mid ? h`<div class="tiny warn-t">non mappée : ces lignes seront ignorées</div>` : ''}</div><select data-change="csvMetric" data-v="${v}" aria-label="Métrique pour ${v}"><option value="">Non mappée</option>${metrics.map(([id, m]) => h`<option value="${id}" ${mid === id ? 'selected' : ''}>${m.label}</option>`)}</select></div>`)}` : ''}
    ${pre ? h`<h3>${c.kind === 'perf' ? '3' : '2'}. Aperçu</h3><p class="small">${pre.records.length} ${c.kind === 'perf' ? 'performance(s)' : 'séance(s)'} prête(s)${c.parsed.rows.length > 200 ? ' (aperçu des 200 premières lignes)' : ''} · ${pre.skipped} ligne(s) ignorée(s)</p>
      ${pre.records.slice(0, 8).map((r) => c.kind === 'perf' ? h`<p class="tiny">${fmtDay(r.d.date)} · ${ctx().metrics[r.d.metricId]?.label} : ${r.d.value} ${r.d.unit}</p>` : h`<p class="tiny">${fmtDay(r.startedAt)} · ${r.sessionName} · ${r.data.exercises.length} exercice(s)${r.data.context?.envName ? ' · '+r.data.context.envName : ''}${r.data.quickLog?.performance ? ' · '+r.data.quickLog.performance : ''}${r.durationSeconds ? ' · ' + Math.round(r.durationSeconds / 60) + ' min' : ''}</p>`)}
      ${pre.errors.slice(0, 8).map((e) => h`<p class="tiny err">Ligne ${e.row} : ${e.error}</p>`)}
      <button class="btn pri" data-act="csvImport" ${pre.records.length ? '' : 'disabled'}>Importer après vérification</button>` : ''}
    <button class="btn" data-act="csvCancel">Annuler</button></div>`;
}
CHG.csvMap = (el) => { S.csv.mapping[el.dataset.i] = el.value; S.csv.notes[el.dataset.i] = el.value ? 'Choisi par toi.' : 'Non importée.'; refreshMetricMap(); render(); };
CHG.csvMetric = (el) => { S.csv.metricMap[el.dataset.v] = el.value; render(); };
ACT.csvCancel = () => { csvRead++; S.csv = null; render(); };
ACT.csvImport = async () => {
  const c = S.csv, token = accountToken(); if (!c?.parsed) return;
  const r = buildImport(c.parsed, c.mapping, c.kind, { metricMap: c.metricMap });
  if (!(await ask(`Importer ${r.records.length} ${c.kind === 'perf' ? 'performance(s)' : 'séance(s)'} ?`, { ok: 'Importer', detail: r.skipped ? `${r.skipped} ligne(s) seront ignorées (voir l’aperçu).` : '' }))) return;
  if (!accountMatches(token) || S.csv !== c) return;
  let n = 0;
  if (c.kind === 'perf') { for (const it of r.records) { if (!S.items.has(itemKey('perf', it.id))) { putItem('perf', it.id, it.d); n++; } } }
  else { const have = new Set(S.history.map((x) => x.id)); for (const e of r.records) if (!have.has(e.id)) { addHistory(e); n++; } }
  S.csv = null; buzzOk(); toast(`${n} élément(s) importé(s)${r.records.length - n ? `, ${r.records.length - n} déjà présent(s) (pas de doublon)` : ''}.`, 5000); render();
};

/* ═════════ Synchronisation et diagnostic ═════════ */
function vSync() {
  const W = { ok: '✅ synchronisé', sync: '🔄 en cours', pending: '⏳ modifications en attente', offline: '📴 hors ligne : tout est gardé sur cet appareil', error: '⚠️ erreur', auth: '🔑 reconnexion nécessaire', idle: '—' };
  return h`<div class="card"><h3>État</h3><p>${W[S.sync] || S.sync}</p><p class="small muted">Dernière synchronisation : ${S.lastSync ? fmtDateTime(S.lastSync) : 'jamais'}${S.lastError ? ' · ' + S.lastError : ''}</p>
      <p class="small">${S.outbox.length} action(s) en file · ${S.dirtyItems.size} donnée(s) de profil à envoyer · ${S.seancesDirty ? 'séances modifiées à envoyer' : 'séances à jour'}</p>
      <div class="row wrapf"><button class="btn pri" data-act="syncNow">🔄 Synchroniser maintenant</button><button class="btn" data-act="diag">🩺 Tester le serveur</button><button class="btn" data-act="hardReload">♻️ Recharger l’application</button></div></div>
    ${S.outbox.length ? h`<div class="card"><h3>File d’attente</h3>${S.outbox.slice(0, 30).map((o, i) => h`<div class="item"><div class="grow small">${i + 1}. ${o.label || describeOp(o)}${o.attempts ? h` <span class="tiny warn-t">(${o.attempts} essai(s) : ${o.lastError || ''})</span>` : ''}<div class="tiny muted">${fmtDateTime(o.at)}</div></div></div>`)}<p class="tiny muted">Envoyée dans l’ordre dès que la connexion revient. Chaque action a un identifiant unique : pas de doublon même si elle est rejouée.</p></div>` : ''}
    ${S.failed.length ? h`<div class="card bad-b"><h3>Actions en échec (${S.failed.length})</h3><p class="tiny muted">Refusées par le serveur ou mises de côté après des erreurs répétées. Rien n’a été effacé : tu peux réessayer ou abandonner.</p>${S.failed.slice().reverse().slice(0, 30).map((f) => h`<div class="item"><div class="grow small"><b>${f.label || describeOp(f)}</b><div class="tiny err">${f.error}</div><div class="tiny muted">${fmtDateTime(f.failedAt || f.at)}</div></div><button class="btn sm" data-act="failRetry" data-id="${f.opId}">Réessayer</button><button class="btn sm danger" data-act="failDrop" data-id="${f.opId}">Abandonner</button></div>`)}</div>` : ''}
    ${S.conflicts.length ? h`<div class="card"><h3>Conflits résolus (${S.conflicts.length})</h3><p class="tiny muted">Un autre appareil a modifié la même donnée plus récemment : sa version a été gardée. Ta version locale est conservée ici et peut être restaurée.</p>${S.conflicts.slice(0, 20).map((c, i) => h`<div class="item"><div class="grow small"><b>${c.key.split('/')[0]}</b> · ${fmtDateTime(c.at)}<div class="tiny muted">${JSON.stringify(c.local?.d || {}).slice(0, 120)}</div></div><button class="btn sm" data-act="conflictRestore" data-i="${i}">Restaurer ma version</button></div>`)}</div>` : ''}`;
}
ACT.syncNow = () => { toast('Synchronisation…'); syncAll(); };
ACT.failRetry = (el) => { retryFailed(el.dataset.id); toast('Action remise dans la file'); render(); };
ACT.failDrop = async (el) => { if (await ask('Abandonner définitivement cette action ?', { ok: 'Abandonner', danger: true, detail: 'Elle ne sera jamais envoyée au serveur.' })) { discardFailed(el.dataset.id); render(); } };
ACT.conflictRestore = (el) => { restoreConflict(Number(el.dataset.i)); toast('Ta version sera renvoyée au serveur'); render(); };
ACT.diag = async () => {
  try { const r = await api('GET', '/api/health'), me = await api('GET', '/api/auth/me'); openSheet(h`<h2 style="margin:0">Diagnostic</h2><p>✅ Serveur joignable (version ${r.version})</p><p>✅ Connecté : <b>${me.user.username}</b>${me.user.isAdmin ? ' (administrateur)' : ''}</p><p>${r.db ? '✅' : '❌'} Base de données</p><p>${r.adminConfigured ? '✅ Administration configurée' : 'ℹ️ Administration non configurée (secret EDIT_PASSWORD absent)'}</p><p class="small muted">Application ${APP_VERSION} · ${S.seances.items.length} séances · ${S.history.length} séances réalisées · ${S.items.size} données de profil</p><button class="btn" data-act="closeSheet">Fermer</button>`); }
  catch (e) { openSheet(h`<h2 style="margin:0">Diagnostic</h2><p class="err">${e.offline ? 'Serveur injoignable (hors ligne ?). Tes modifications restent enregistrées sur cet appareil.' : e.message}</p><button class="btn" data-act="closeSheet">Fermer</button>`); }
};
ACT.hardReload = async () => { if (!(await ask('Recharger l’application ?', { detail: 'Tes données sont conservées. Le cache des fichiers est vidé pour récupérer la dernière version.' }))) return; await persistNow(); try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* rien */ } location.reload(); };

/* ═════════ Administration ═════════ */
function refreshAdminSummary() {
  if (S.tab !== 'settings' || S.sub.settings !== 'admin' || !$('#admin-advanced')) return false;
  const a = S.admin, bugs = (a.bugs || []).filter((b) => b.status === 'open').length, props = (a.propF || 'open') === 'open' ? (a.props || []).length : 0;
  const labels = { bugs: a.error ? 'Chargement impossible · ouvrir pour réessayer' : !a.bugs ? 'Chargement des signalements…' : bugs ? `${bugs} ouvert${bugs > 1 ? 's' : ''}` : 'Aucun signalement ouvert', members: a.propErr ? 'Chargement impossible · ouvrir pour réessayer' : !a.props ? 'Chargement des propositions…' : props ? `${props} à traiter` : 'Idées, intentions, demandes de modification' };
  for (const [id, label] of Object.entries(labels)) { const text = $(`#main [data-act=setSub][data-id=${id}] small`); if (text) text.textContent = label; }
  return true;
}
async function loadBugs() {
  const owner = S.user?.id, admin = S.admin;
  try { const r = await api('GET', '/api/admin/bugs'); if (S.user?.id !== owner || S.admin !== admin) return; admin.bugs = r.reports; admin.error = ''; }
  catch (e) { if (S.user?.id !== owner || S.admin !== admin) return; admin.error = e.offline ? 'Connexion requise.' : e.message; }
  if (!refreshAdminSummary() && S.tab === 'settings' && S.sub.settings === 'bugs') render();
}
/** Suivi des notifications « nouvelle mise à jour » : quand la dernière est partie et vers combien d'appareils. */
function pushStatusCard(open = false) {
  const p = S.admin.push; if (!p) return '';
  const l = p.last, when = l?.at ? new Date(l.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return h`<details class="card how" ${open ? 'open' : ''}><summary>État des envois</summary>
    <p class="small">${l ? `Dernier envoi le ${when} : ${l.sent} appareil(s) joint(s) sur ${l.targeted} appareil(s) ciblé(s)${l.gone ? `, ${l.gone} abonnement(s) expiré(s) retiré(s)` : ''}${l.pending ? `, ${l.pending} en attente de reprise` : l.errors ? `, ${l.errors} en erreur` : ''}.` : 'Aucune notification envoyée pour l’instant.'}</p>
    ${cronLine(p)}
    <p class="tiny muted">${p.devices} appareil(s) abonné(s) en tout. Version en ligne : ${p.version || APP_VERSION}. Un appareil qui ne reçoit rien : Paramètres › Notifications et rappels › « 🩺 Vérifier cet appareil ».</p>
    <details class="how mini"><summary>Identifiant du déploiement</summary><p class="tiny muted">${p.build}${p.lastBuild && p.lastBuild !== p.build ? ` · dernière version annoncée : ${p.lastBuild}` : ''}</p></details></details>`;
}
/** La tâche planifiée (chaque minute) prévient d'une nouvelle version même si personne n'ouvre l'app : tourne-t-elle ? */
function cronLine(p) {
  const c = p.cron, age = c?.t ? Math.max(0, Math.round(((p.now || Date.now()) - c.t) / 60000)) : null;
  if (!c) return h`<div class="card flat warn-b stack"><p class="small">La tâche de reprise n’a encore jamais tourné. Le déploiement et la première visite déclenchent aussi les annonces de mise à jour.</p>
    <p class="tiny">À vérifier dans Cloudflare : Workers › ton Worker › Settings › Triggers › Cron Triggers : il doit y avoir « * * * * * » (chaque minute, déjà prévu dans wrangler.json, appliqué au prochain déploiement).</p></div>`;
  if (age > 20) return h`<p class="small warn-t">⚠️ Dernier passage de la tâche planifiée il y a ${age} min : elle devrait passer chaque minute. Vérifie les Cron Triggers du Worker dans Cloudflare.${c.error ? ` Dernière erreur : ${c.error}` : ''}</p>`;
  return h`<p class="small ok-t">✓ Tâche planifiée active : dernier passage il y a ${age ? `${age} min` : 'moins d’une minute'}${c.error ? ` (erreur : ${c.error})` : ''}. Une nouvelle version est annoncée dans la minute, même si personne n’ouvre l’app.</p>`;
}
function vAdmin() {
  if (!S.user.isAdmin) return h`<form data-submit="adminOn" class="card" autocomplete="off"><h3>🛡️ Administration</h3><p class="small muted">Saisis le mot de passe administrateur pour activer les droits d’administration sur ton compte. Il est vérifié uniquement par le serveur.</p>
    <label>Mot de passe administrateur<input type="password" name="password" autocomplete="off" required></label><button class="btn pri" type="submit">Activer</button></form>`;
  if (!S.admin.bugs && !S.admin.error && canRole('technical')) setTimeout(loadBugs, 0);
  if (!S.admin.props && !S.admin.propErr && canRole('content')) setTimeout(loadProps, 0);
  const openBugs = (S.admin.bugs || []).filter((b) => b.status === 'open').length, props = (S.admin.propF || 'open') === 'open' ? (S.admin.props || []).length : 0, changed = globalChanges().length;
  const row = (role, r) => (canRole(role) ? [r] : []);
  const section = (title, description, rows) => rows.length ? h`<section class="card stack" aria-label="${title}"><h3>${title}</h3><p class="small muted">${description}</p>${menuList(rows)}</section>` : '';
  const edit = [
      ...(canRole('content') || canRole('intelligence') ? [['setSub', 'assistant', '💬', 'Assistant du site', canRole('content') ? 'Décris la modification ; relis le brouillon proposé avant de publier' : 'Modèle, style des réponses et limite quotidienne de l’IA']] : []),
      ...row('content', ['setSub', 'content', '🧩', 'Contenu de l’app', 'Exercices, séances prêtes, intentions par sport, aide, cotations']),
      ...row('content', ['setSub', 'look', '✏️', 'Textes et apparence', 'Textes, annonces et organisation des écrans pour tous les membres']),
      ...row('content', ['setSub', 'studio', '📝', 'Brouillons et publication', 'Vérifier et publier une modification, ou annuler une publication']),
    ];
  const members = [
      ...row('users', ['setSub', 'users', '👥', 'Comptes et rôles', 'Dernières connexions, droits d’administration']),
      ...row('content', ['setSub', 'members', '📬', 'Propositions des membres', S.admin.propErr ? 'Chargement impossible · ouvrir pour réessayer' : !S.admin.props ? 'Chargement des propositions…' : props ? `${props} à traiter` : 'Idées, intentions, demandes de modification']),
      ...row('technical', ['setSub', 'bugs', '🐞', 'Signalements', S.admin.error ? 'Chargement impossible · ouvrir pour réessayer' : !S.admin.bugs ? 'Chargement des signalements…' : openBugs ? `${openBugs} ouvert${openBugs > 1 ? 's' : ''}` : 'Aucun signalement ouvert']),
      ...row('content', ['adminIdeasOpen', '', '🗳️', 'Idées à voter', 'Publier une idée et suivre son avancement']),
      ['libSub', 'common', '🌍', 'Bibliothèque commune', 'Séances partagées par les membres'],
    ];
  const follow = [
      ...row('technical', ['setSub', 'push', '🔔', 'Notifications de mise à jour', 'Vérifier les envois et les appareils abonnés']),
      ...row('content', ['setSub', 'changes', '📝', 'Tout ce qui a été modifié', changed ? `${changed} élément${changed > 1 ? 's' : ''} différent${changed > 1 ? 's' : ''} de l’origine · annulable` : 'Aucune modification publiée pour l’instant']),
      ['setSub', 'audit', '📜', 'Journal', 'Retrouver les actions des administrateurs, avec leurs dates'],
    ];
  const advanced = [
      ...row('intelligence', ['setSub', 'health', '🩺', 'Santé des données', 'Vérifier les doublons et les liens entre exercices et objectifs']),
      ...row('intelligence', ['setSub', 'lab', '🧠', 'Laboratoire', 'Tester les règles de séance et analyser un problème']),
      ...row('technical', ['setSub', 'maint', '🛠️', 'Maintenance', 'Regrouper les signalements et préparer des pistes de correction']),
      ...row('technical', ['setSub', 'code', '💻', 'Propositions de code', 'Relire une correction et préparer une Pull Request GitHub']),
      ['adminStatsOpen', '', '📊', 'Statistiques anonymes', 'Totaux sur tous les comptes, sans aucune donnée personnelle'],
      ['adminNewbie', '', '🐣', 'Voir l’app comme un nouveau membre', 'Ce que découvre quelqu’un qui arrive'],
      ...row('content', ['adminGlobalExport', '', '📦', 'Sauvegarder le contenu commun', 'Télécharger une copie des contenus publiés']),
    ];
  return h`<div class="card"><h3>Tu es administrateur</h3><p class="small muted">Choisis ce que tu veux modifier ou gérer.</p>
      <details class="how mini"><summary>Mes droits d’administration</summary><p class="tiny muted">Tes rôles : ${(S.user.roles || ['super']).map((r) => ROLE_L[r] || r).join(', ')}. Les actions sont vérifiées par le serveur et conservées dans le Journal.</p><button class="btn sm ghost" data-act="adminOff">Quitter ce rôle</button></details></div>
    ${adminSearchCard([...edit, ...members, ...follow, ...advanced])}
    ${section('Modifier le site', 'Prépare une modification, vérifie-la, puis publie-la pour les membres.', edit)}
    ${section('Gérer les membres', 'Comptes, demandes et problèmes signalés.', members)}
    ${section('Suivre le site', 'Notifications, modifications publiées et historique des actions.', follow)}
    <details class="card" id="admin-advanced" ${S.admin.advancedOpen ? 'open' : ''}><summary data-act="adminAdvanced">Outils avancés</summary><p class="small muted">Diagnostic, règles d’entraînement, code et sauvegardes.</p>${menuList(advanced)}</details>`;
}
ACT.adminAdvanced = (el) => { S.admin.advancedOpen = !S.admin.advancedOpen; const panel = el.closest('details'); if (panel) panel.open = S.admin.advancedOpen; };
function vAdminBugs() {
  const bugs = S.admin.bugs, f = S.admin.filter || 'open';
  if (!bugs && !S.admin.error) setTimeout(loadBugs, 0);
  return h`<div class="card"><div class="row between"><h3>🐞 Signalements</h3><button class="btn sm" data-act="bugsReload" aria-label="Actualiser">↻</button></div><div class="chips">${[['open', 'Ouverts'], ['in_progress', 'En cours'], ['done', 'Traités'], ['ignored', 'Ignorés / doublons'], ['all', 'Tous']].map(([k, l]) => chip(f === k, l, `data-act="bugFilter" data-id="${k}"`))}</div>
      <input id="bugq" type="search" aria-label="Rechercher un signalement" placeholder="🔎 Rechercher (titre, texte, page, auteur)" value="${S.admin.bugQ || ''}" data-input="bugQ">
      <div id="bugres">${S.admin.error ? h`<p class="err small">${S.admin.error}</p>` : !bugs ? skeleton(2) : bugList()}</div></div>`;
}
function vAdminPush() {
  if (S.admin.push === undefined) { S.admin.push = null; loadAdminPush(); }
  const draft = S.admin.broadcast || {}, previous = S.admin.push?.broadcast;
  return h`<section class="card stack"><div class="row between"><h3>Annoncer la version finale</h3><button class="btn sm" data-act="adminPushReload">Actualiser</button></div>
    <p class="small">Quand tu es satisfait de la version, envoie ton message à tous les utilisateurs.</p>
    <p class="small muted">L’annonce apparaît dans le site, même si les mises à jour automatiques sont désactivées. Le téléphone reçoit aussi une notification s’il a autorisé celles de l’app. Un téléphone qui les a refusées ne peut pas être joint.</p>
    ${canRole('technical') ? h`<form class="stack" data-submit="pushBroadcast"><label>Titre<input name="title" maxlength="100" required value="${draft.title || 'La nouvelle version de Mes séances est prête'}" data-input="pushBroadcastField" placeholder="Un titre court"></label>
      <label>Message<textarea name="body" rows="3" maxlength="1200" required data-input="pushBroadcastField" placeholder="Décris ce qui est prêt et ce que les utilisateurs peuvent faire.">${draft.body || ''}</textarea></label>
      <button type="submit" class="btn pri" ${S.admin.broadcastSending ? 'disabled' : ''}>${S.admin.broadcastSending ? 'Envoi en cours…' : 'Préparer l’envoi à tous'}</button></form>` : ''}
    ${previous ? h`<div class="card flat"><b>Dernière annonce : ${previous.title}</b><p class="small">Version ${previous.version} · ${fmtDateTime(previous.at)}</p><p class="tiny muted">${previous.sent} appareil(s) joint(s)${previous.pending ? ` · ${previous.pending} en attente de reprise` : ''}. L’annonce reste visible dans le site pour tous.</p></div>` : ''}
    ${S.admin.pushError ? h`<p class="err small">${S.admin.pushError}</p>` : ''}</section>
    <section class="card"><h3>Mises à jour automatiques</h3><p class="small muted">L’envoi commence dès que Cloudflare confirme le déploiement. Il respecte le choix « Mises à jour » de chaque appareil. Les erreurs sont reprises par la tâche planifiée.</p></section>
    ${S.admin.push ? pushStatusCard(true) : S.admin.pushError ? '' : skeleton(1)}`;
}
async function loadAdminPush() {
  const token = accountToken(), admin = S.admin;
  try { const r = await api('GET', '/api/admin/push-status'); if (!accountMatches(token) || S.admin !== admin) return; admin.push = r; admin.pushError = ''; }
  catch (e) { if (!accountMatches(token) || S.admin !== admin) return; admin.pushError = e.offline ? 'Connexion requise pour vérifier les envois.' : e.message; }
  if (S.tab === 'settings' && S.sub.settings === 'push') render();
}
ACT.adminPushReload = () => { S.admin.push = null; S.admin.pushError = ''; loadAdminPush(); };
INPUT.pushBroadcastField = (el) => { S.admin.broadcast = { ...(S.admin.broadcast || {}), [el.name]: el.value }; };
SUBMIT.pushBroadcast = async (form) => {
  if (S.admin.broadcastSending || S.admin.broadcastPreparing) return;
  const token = accountToken(), admin = S.admin, current = () => accountMatches(token) && S.admin === admin;
  const d = Object.fromEntries(new FormData(form)), title = String(d.title || '').trim(), body = String(d.body || '').trim();
  if (!title || !body) { toast('Ajoute un titre et un message.', 4000, 'bad'); return; }
  S.admin.broadcastPreparing = true;
  const button = form.querySelector('button[type=submit]'); if (button) button.disabled = true;
  let p;
  try { p = await api('GET', '/api/admin/push-status'); if (!current()) return; admin.push = p; }
  catch (e) { if (!current()) return; admin.broadcastPreparing = false; if (button) button.disabled = false; toast(e.offline ? 'Connexion requise pour préparer l’envoi.' : e.message, 4000, 'bad'); return; }
  const confirmed = await ask('Envoyer cette annonce à tous ?', { ok: 'Envoyer à tous', detail: `Version ${p.version || APP_VERSION}. Dans le site : tous les utilisateurs. Sur téléphone : ${p.devices} appareil(s) ayant autorisé les notifications, même si les mises à jour automatiques sont désactivées.\n\n${title}\n${body}` });
  if (!current()) return;
  S.admin.broadcastPreparing = false; if (button) button.disabled = false;
  if (!confirmed) return;
  const old = S.admin.broadcast || {}, version = p.version || APP_VERSION, build = p.build;
  const id = old.id && old.title === title && old.body === body && old.build === build ? old.id : 'final-' + uid().slice(0, 24);
  S.admin.broadcast = { id, title, body, version, build }; S.admin.broadcastSending = true; render();
  try {
    const r = await api('POST', '/api/admin/push-broadcast', { id, title, body, version, build, confirmed: true });
    if (!current()) return;
    toast(`Annonce publiée pour tous · ${r.sent} appareil(s) joint(s)${r.pending ? ` · ${r.pending} en attente de reprise` : ''}.`, 6000);
    S.admin.broadcast = {}; await Promise.all([loadAdminPush(), loadGlobal()]);
  } catch (e) { if (current()) toast(e.offline ? 'Connexion interrompue : réessaie, cet envoi ne sera pas doublé.' : e.message, 6000, 'bad'); }
  finally { if (current()) { admin.broadcastSending = false; render(); } }
};
function bugList() {
  const list = filterBugs(S.admin.bugs, S.admin.filter || 'open', S.admin.bugQ || '');
  if (!list.length) return h`<p class="muted small">${S.admin.bugQ ? 'Aucun signalement ne correspond.' : 'Aucun signalement.'}</p>`;
  const labels = { open: 'ouvert', in_progress: 'en cours', done: 'traité', ignored: 'ignoré / doublon' };
  return h`<p class="tiny muted">${list.length} signalement(s)${list.some((b) => b.recent) ? ` · ${list.filter((b) => b.recent).length} récent(s)` : ''}</p>${list.map((b) => h`<div class="card flat${b.recent && b.status === 'open' ? ' acc-b' : ''}"><div class="row between"><b>${b.title}</b><span>${b.recent ? tag('nouveau', 'acc') : ''}${tag(labels[b.status] || 'ouvert', b.status === 'done' ? 'ok' : 'warn')}</span></div>
    <p class="tiny muted">par ${b.author} · ${fmtDateTime(b.createdAt)}${b.page ? ' · page : ' + b.page : ''}</p>
    ${b.description.length > 180 ? h`<details class="how mini"><summary>${b.description.slice(0, 140)}…</summary><p class="small pre">${b.description}</p></details>` : h`<p class="small pre">${b.description}</p>`}
    ${b.appVersion || b.userAgent ? h`<details class="how mini"><summary>Détail technique</summary><p class="tiny muted">${b.appVersion ? 'Version ' + b.appVersion : ''}${b.userAgent ? ' · ' + b.userAgent.slice(0, 200) : ''}${b.updatedAt && b.updatedAt !== b.createdAt ? ' · statut changé ' + fmtDateTime(b.updatedAt) : ''}</p></details>` : ''}
    <div class="row wrapf">${Object.entries(labels).filter(([status]) => status !== b.status).map(([status, label]) => h`<button class="btn sm" data-act="bugStatus" data-id="${b.id}" data-v="${status}">${status === 'open' ? 'Rouvrir' : status === 'done' ? 'Marquer traité' : status === 'in_progress' ? 'Prendre en cours' : 'Ignorer / doublon'}</button>`)}</div></div>`)}`;
}
INPUT.bugQ = (el) => { S.admin.bugQ = el.value.slice(0, 80); const box = $('#bugres'); if (box && S.admin.bugs) box.innerHTML = bugList().s; };
/* Propositions des utilisateurs (intentions, idées) et intentions communes. */
async function loadProps() {
  const owner = S.user?.id, admin = S.admin;
  try { const [p, ci] = await Promise.all([api('GET', '/api/admin/proposals?status=' + (admin.propF || 'open')), api('GET', '/api/community/intents')]); if (S.user?.id !== owner || S.admin !== admin) return; admin.props = p.proposals; admin.cintents = ci.intents; admin.propErr = ''; }
  catch (e) { if (S.user?.id !== owner || S.admin !== admin) return; admin.propErr = e.offline ? 'Connexion requise.' : e.message; }
  if (!refreshAdminSummary() && S.tab === 'settings' && S.sub.settings === 'members') render();
}
function vAdminProposals() {
  const p = S.admin.props; if (!p && !S.admin.propErr) setTimeout(loadProps, 0);
  const capL = (id) => CAPACITIES[id]?.label || id;
  return h`<div class="card"><div class="row between"><h3>📬 Propositions ${p?.length && (S.admin.propF || 'open') === 'open' ? tag(String(p.length), 'acc') : ''}</h3><button class="btn sm" data-act="propsReload" aria-label="Actualiser">↻</button></div>
    <div class="chips">${[['open', 'À traiter'], ['done', 'Traitées']].map(([k, l]) => chip((S.admin.propF || 'open') === k, l, `data-act="propF" data-id="${k}"`))}</div>
    ${S.admin.propErr ? h`<p class="err small">${S.admin.propErr}</p>` : !p ? skeleton(1) : p.length ? p.map((x) => h`<div class="item prop"><div class="grow"><b>${x.payload?.emoji || ''} ${x.label}</b> ${tag(x.kind === 'intent' ? 'intention' : x.kind === 'category' ? 'catégorie' : 'idée')}
        <div class="tiny muted">${x.username || 'compte supprimé'} · ${relDate(x.created_at)}${x.activity ? ' · ' + (ACTIVITIES[x.activity]?.label || x.activity) : ''}</div>
        ${x.detail ? h`<p class="small">${x.detail}</p>` : ''}${Object.keys(x.payload?.caps || {}).length ? h`<div class="chips">${Object.keys(x.payload.caps).map((c) => h`<span class="chip static">${capL(c)}</span>`)}</div>` : ''}${x.status === 'done' ? h`<p class="tiny">${x.reply || 'Traitée.'}</p><p class="tiny muted">🕑 Traitée par ${x.reviewer || 'un administrateur'}${x.reviewed_at ? ' · ' + fmtDateTime(x.reviewed_at) : ''}</p>` : ''}
        ${x.status === 'open' ? h`<label class="small">Réponse à l’auteur (facultative)<textarea rows="2" maxlength="300" data-input="propReply" data-id="${x.id}" placeholder="Ex. merci, c’est ajouté pour tous">${S.admin.replies?.[x.id] || ''}</textarea></label>` : ''}</div>
      ${x.status === 'open' ? h`<div class="row tight"><button class="btn sm pri" data-act="propOpen" data-id="${x.id}">📍 Voir et décider</button><button class="btn sm pri" data-act="propDo" data-id="${x.id}" data-d="accept">${x.kind === 'intent' ? 'Ajouter pour tous' : 'Accepter'}</button><button class="btn sm ghost" data-act="propDo" data-id="${x.id}" data-d="refuse">Refuser</button></div>` : ''}</div>`) : h`<p class="small muted">Rien à traiter.</p>`}
    ${S.admin.cintents?.length ? h`<details class="how mini"><summary>Intentions communes (${S.admin.cintents.length})</summary>${S.admin.cintents.map((x) => h`<div class="item"><div class="grow small">${x.emoji} ${x.label} <span class="tiny muted">${x.activityId ? ACTIVITIES[x.activityId]?.label || x.activityId : 'tous sports'}</span></div><button class="btn sm ghost danger" data-act="cintentDel" data-id="${x.id}" aria-label="Retirer">✕</button></div>`)}</details>` : ''}</div>`;
}
INPUT.propReply = (el) => { S.admin.replies = { ...(S.admin.replies || {}), [el.dataset.id]: el.value.slice(0, 300) }; };
ACT.propsReload = () => { S.admin.props = null; loadProps(); };
ACT.propF = (el) => { S.admin.propF = el.dataset.id; ACT.propsReload(); };
ACT.propDo = async (el) => {
  const accept = el.dataset.d === 'accept';
  if (!(await ask(accept ? 'Accepter cette proposition ?' : 'Refuser cette proposition ?', { ok: accept ? 'Accepter' : 'Refuser', danger: !accept, detail: accept ? 'Une intention acceptée apparaît pour tous les utilisateurs.' : '' }))) return;
  try { await api('POST', '/api/admin/proposals/' + el.dataset.id, { decision: el.dataset.d, reply: (S.admin.replies?.[el.dataset.id] || '').trim() }); if (S.admin.replies) delete S.admin.replies[el.dataset.id]; toast(accept ? 'Ajoutée pour tout le monde' : 'Refusée'); } catch (e) { toast(e.message, 4000, 'bad'); }
  ACT.propsReload();
};
ACT.cintentDel = async (el) => { if (!(await ask('Retirer cette intention pour tout le monde ?', { danger: true, ok: 'Retirer' }))) return; try { await api('DELETE', '/api/admin/intents/' + el.dataset.id); } catch (e) { toast(e.message, 4000, 'bad'); } ACT.propsReload(); };

/* Comptes existants (admin) : identité et activité uniquement, jamais les données d'entraînement. */
async function loadUsers() {
  const token = accountToken(), admin = S.admin;
  try { const r = await api('GET', '/api/admin/users'); if (!accountMatches(token) || S.admin !== admin) return; if (!Array.isArray(r?.users)) throw new Error('Liste des comptes indisponible, réessaie.'); admin.users = r; admin.usersErr = ''; }
  catch (e) { if (!accountMatches(token) || S.admin !== admin) return; admin.usersErr = e.offline ? 'Connexion requise.' : e.message; }
  if (S.tab === 'settings' && S.sub.settings === 'users') render();
}
function vAdminUsers() {
  const u = S.admin.users, q = (S.admin.userQ || '').toLowerCase();
  if (!u && !S.admin.usersErr) setTimeout(loadUsers, 0);
  const seen = (x) => x.lastSeen || x.lastLogin || 0, by = S.admin.userSort === 'created' ? (a, b) => (b.createdAt || 0) - (a.createdAt || 0) : (a, b) => seen(b) - seen(a);
  const list = u ? u.users.filter((x) => !q || x.username.toLowerCase().includes(q)).sort(by) : [];
  const since = (d) => (u ? u.users.filter((x) => seen(x) && Date.now() - seen(x) < d * 86400000).length : 0);
  const recent = u ? u.users.filter(seen).sort((a, b) => seen(b) - seen(a)).slice(0, 10) : [];
  return h`<div class="card"><div class="row between"><h3>👥 Comptes</h3><button class="btn sm" data-act="usersReload" aria-label="Actualiser">↻</button></div>
    ${S.admin.usersErr ? h`<p class="err small">${S.admin.usersErr}</p>` : !u ? skeleton(2) : h`
      <div class="kpis"><div class="kpi"><span>👥 Comptes</span><b>${u.total}</b></div><div class="kpi"><span>🟢 Aujourd’hui</span><b>${since(1)}</b></div><div class="kpi"><span>📅 7 jours</span><b>${since(7)}</b></div><div class="kpi"><span>🗓️ 30 jours</span><b>${since(30)}</b></div></div>
      <span class="kicker">🕑 Dernières connexions</span>
      ${recent.length ? h`<div class="setmenu">${recent.map((x) => h`<div class="setrow"><span class="sic">${x.username.slice(0, 1).toUpperCase()}</span><span class="grow"><b>${x.username}</b> ${x.isAdmin ? tag('admin', 'acc') : ''}<small>${fmtDateTime(seen(x))} · ${relDate(seen(x))}</small></span></div>`)}</div>` : h`<p class="small muted">Personne ne s’est encore connecté.</p>`}
      <span class="kicker">Tous les comptes</span>
      <div class="chips">${chip(S.admin.userSort !== 'created', 'Dernière visite d’abord', 'data-act="userSort" data-id="seen"')}${chip(S.admin.userSort === 'created', 'Inscription la plus récente', 'data-act="userSort" data-id="created"')}</div>
      <input type="search" data-input="userQ" value="${S.admin.userQ || ''}" placeholder="🔎 Chercher un pseudo" aria-label="Chercher un compte">
      <div class="ulist">${list.slice(0, 200).map((x) => h`<div class="urow"><div class="uav">${x.username.slice(0, 1).toUpperCase()}</div><div class="grow"><b>${x.username}</b> ${x.isAdmin ? tag('admin', 'acc') : ''}
        <div class="tiny muted">inscrit ${relDate(x.createdAt)}${x.email ? ' · ' + x.email : ''}</div></div>
        <div class="ustat"><b>${x.sessionsDone}</b><span>séance${x.sessionsDone > 1 ? 's' : ''}</span></div>
        <div class="ustat"><span title="${seen(x) ? fmtDateTime(seen(x)) : ''}">${seen(x) ? relDate(seen(x)) : 'jamais'}</span><span class="tiny muted">dernière visite</span>${canRole('super') ? h`<button class="btn sm ${x.isAdmin ? 'ghost' : ''}" data-act="userRole" data-id="${x.id}" data-v="${x.isAdmin ? '0' : '1'}">${x.isAdmin ? 'Retirer admin' : 'Nommer admin'}</button>${x.isAdmin ? h`<button class="btn sm" data-act="userRoles" data-id="${x.id}">Rôles</button>` : ''}` : ''}${x.isAdmin ? h`<span class="tiny muted">${(x.roles || []).map((r) => ROLE_L[r]).join(', ')}</span>` : ''}</div></div>`)}
        ${list.length > 200 ? h`<p class="tiny muted">… ${list.length - 200} autre(s) : affine la recherche.</p>` : ''}${!list.length ? h`<p class="small muted">Aucun compte trouvé.</p>` : ''}</div>
      <details class="how mini"><summary>Ce que tu vois ici</summary><p class="tiny">Pseudo, date d’inscription, e-mail masqué, nombre de séances réalisées et dernière visite (à 10 minutes près). Les séances, performances et profils des membres restent privés.</p></details>`}</div>`;
}
ACT.usersReload = () => { S.admin.users = null; loadUsers(); };
ACT.userSort = (el) => { S.admin.userSort = el.dataset.id; render(); };
INPUT.userQ = (el) => { S.admin.userQ = el.value; clearTimeout(INPUT.userQ.t); INPUT.userQ.t = setTimeout(() => { render(); const i = document.querySelector('input[data-input=userQ]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
SUBMIT.adminOn = async (f) => {
  const token = accountToken();
  const pw = new FormData(f).get('password'); f.reset(); // la valeur saisie est effacée du formulaire immédiatement
  try { await api('POST', '/api/admin/activate', { password: pw }); if (!accountMatches(token)) return; const me = await api('GET', '/api/auth/me'); if (!accountMatches(token)) return; S.user = me.user; ls.set('sea:user', { id: me.user.id, username: me.user.username, isAdmin: me.user.isAdmin, roles: me.user.roles || [] }); buzzOk(); toast('Droits administrateur activés'); loadBugs(); render(); }
  catch (e) { if (accountMatches(token)) toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.adminOff = async () => { if (!(await ask('Quitter le rôle administrateur ?', { detail: 'Il faudra de nouveau le mot de passe administrateur pour le réactiver.' }))) return; try { await api('POST', '/api/admin/deactivate', {}); S.user = { ...S.user, isAdmin: false, roles: [] }; ls.set('sea:user', { id: S.user.id, username: S.user.username, isAdmin: false, roles: [] }); render(); } catch (e) { toast(e.message); } };
ACT.bugsReload = () => { S.admin.bugs = null; S.admin.error = ''; loadBugs(); };
ACT.bugFilter = (el) => { S.admin.filter = el.dataset.id; render(); };
ACT.bugStatus = async (el) => { try { await api('POST', `/api/admin/bugs/${encodeURIComponent(el.dataset.id)}`, { status: el.dataset.v }); const b = S.admin.bugs.find((x) => x.id === el.dataset.id); if (b) b.status = el.dataset.v; render(); } catch (e) { toast(e.message); } };

/* ═════════ Signaler un bug ═════════ */
async function loadMyBugs() {
  const token = accountToken();
  try { const r = await api('GET', '/api/bugs/mine'); if (!accountMatches(token)) return; S.myBugs = r.reports; }
  catch { if (!accountMatches(token)) return; /* hors ligne : liste indisponible */ }
  if (S.tab === 'settings' && S.sub.settings === 'bug') render();
}
function vBug() {
  const pages = [['', '—'], ['accueil', 'Accueil'], ['progres', 'Progrès'], ['bibliotheque', 'Bibliothèque'], ['generateur', 'Générateur'], ['seance', 'Mode séance'], ['profil', 'Profil'], ['parametres', 'Paramètres'], ['synchronisation', 'Synchronisation / hors ligne']];
  const previous = (window.__seaRoutes || []).filter((r) => !r.startsWith('#/settings/bug')).at(-1);
  const page = S.bugFrom?.owner === S.user?.id ? S.bugFrom.page : previous?.split('/').slice(1, 3).join('/') || 'settings/main';
  pages.unshift([page, `Page d’origine : ${page}`]);
  return h`<form data-submit="bugSend" class="card"><h3>🐞 Signaler un bug</h3>
      <label>Titre court (facultatif)<input name="title" maxlength="120" placeholder="Créé à partir de ta description si tu le laisses vide"></label>
      <label>Description détaillée<textarea name="description" required minlength="5" maxlength="5000" placeholder="Ce que tu faisais, ce qui s’est passé, ce que tu attendais…"></textarea></label>
      <label>Page concernée<select name="page">${pages.map(([k, l], i) => h`<option value="${k}" ${i === 0 ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label class="chk"><input type="checkbox" name="device" checked> Joindre les informations techniques de l’appareil (navigateur, version de l’application)</label>
      <label class="chk"><input type="checkbox" name="state" checked> Joindre l’état de la page (pages visitées juste avant, taille d’écran, connexion, dernières erreurs techniques ; aucune de tes données d’entraînement)</label>
      <p class="tiny muted">Ne mets jamais de mot de passe dans un signalement. Envoyé hors ligne, il part dès le retour de la connexion.</p>
      <button class="btn pri" type="submit">Envoyer</button></form>
    <div class="card"><h3>Mes signalements</h3>${S.myBugs ? (S.myBugs.length ? S.myBugs.map((b) => h`<div class="item"><div class="grow"><b>${b.title}</b><div class="tiny muted">${fmtDateTime(b.createdAt)}</div></div>${tag(({ done: 'traité', in_progress: 'en cours', ignored: 'ignoré / doublon' })[b.status] || 'reçu', b.status === 'done' ? 'ok' : '')}</div>`) : h`<p class="muted small">Aucun signalement envoyé.</p>`) : h`<p class="muted small">Liste disponible en ligne.</p>`}</div>`;
}
/** État de la page joint à un signalement : aucun contenu personnel (ni séances, ni mesures, ni texte saisi). */
export function pageState() {
  const routes = (window.__seaRoutes || []).slice(-6).join(' → ') || location.hash || '/';
  const errs = (window.__seaErrs || []).slice(-5).map((e) => `• ${e}`).join('\n') || 'aucune';
  return [`Pages : ${routes}`, `Écran : ${innerWidth}×${innerHeight} (${devicePixelRatio || 1}x)`, `Connexion : ${navigator.onLine ? 'en ligne' : 'hors ligne'} · synchro ${S.sync || '?'}`,
    `Affichage : ${document.documentElement.dataset.mode || ''} · texte ${document.documentElement.dataset.size || 'm'}`, `Version : ${APP_VERSION}`, `Dernières erreurs :\n${errs}`].join('\n');
}
SUBMIT.bugSend = (f) => {
  const d = Object.fromEntries(new FormData(f));
  const description = d.state ? `${d.description}\n\n— État de la page —\n${pageState()}`.slice(0, 5000) : d.description;
  queue('POST', '/api/bugs', { id: uid(), title: d.title, description, page: d.page, appVersion: d.device ? APP_VERSION : '', userAgent: d.device ? navigator.userAgent.slice(0, 300) : '' });
  f.reset(); buzzOk(); toast('Signalement enregistré : il est envoyé aux administrateurs. Merci !'); setTimeout(loadMyBugs, 2500);
};

/** Nommer ou retirer un administrateur (le serveur garde toujours au moins un administrateur). */
ACT.userRole = async (el) => {
  const make = el.dataset.v === '1', u = S.admin.users?.users?.find((x) => x.id === el.dataset.id);
  if (!(await ask(make ? `Nommer ${u?.username || 'ce compte'} administrateur ?` : `Retirer les droits d’administrateur de ${u?.username || 'ce compte'} ?`, { ok: make ? 'Oui, nommer' : 'Oui, retirer', danger: !make, detail: make ? 'Il pourra modifier le contenu de l’app pour tout le monde et traiter les idées. Il n’aura pas accès aux données privées des comptes.' : '' }))) return;
  try { await api('POST', `/api/admin/users/${encodeURIComponent(el.dataset.id)}/role`, { admin: make }); toast(make ? 'Administrateur nommé' : 'Droits retirés'); S.admin.users = null; render(); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
/* Rôles d'administration (super-administrateur seulement ; vérifié par le serveur). */
ACT.userRoles = (el) => {
  const x = S.admin.users?.users?.find((u) => u.id === el.dataset.id); if (!x) return;
  S.admin.roleEdit = { id: x.id, roles: [...(x.roles || [])] };
  const draw = () => openSheet(h`<div class="stack"><h2 style="margin:0">Rôles de ${x.username}</h2><p class="tiny muted">Chaque rôle ouvre une partie de l’administration. Le serveur vérifie chaque action.</p>
    <div class="chips">${Object.entries(ROLE_L).map(([k, l]) => chip(S.admin.roleEdit.roles.includes(k), l, `data-act="userRoleTog" data-id="${k}"`))}</div>
    <button class="btn pri" data-act="userRolesSave">Enregistrer</button><button class="btn ghost" data-act="closeSheet">Annuler</button></div>`);
  S.admin.roleDraw = draw; draw();
};
ACT.userRoleTog = (el) => { const r = S.admin.roleEdit; if (!r) return; r.roles = r.roles.includes(el.dataset.id) ? r.roles.filter((x) => x !== el.dataset.id) : [...r.roles, el.dataset.id]; S.admin.roleDraw?.(); };
ACT.userRolesSave = async () => { const r = S.admin.roleEdit; try { await api('POST', `/api/admin/users/${encodeURIComponent(r.id)}/roles`, { roles: r.roles }); closeSheet(); toast('Rôles enregistrés'); S.admin.users = null; render(); } catch (e) { toast(e.message, 5000, 'bad'); } };
