// views-settings.js — Paramètres : séance, apparence, compte, données (export / import JSON, import CSV),
// synchronisation et diagnostic, administration (EDIT_PASSWORD vérifié par le serveur), signalement de bug.
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, fmtDateTime, fmtDay, relDate, buzzOk, skeleton } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, APP_VERSION, ctx, go, render, api, queue, saveSettings, syncAll, retryFailed, discardFailed, restoreConflict, pendingCount, persistNow, clearLocal, DEFAULT_SETTINGS, putItem, itemsOf, addHistory, saveEvent, ls, writePending, persist, bump, syncSoon } from './state.js';
import { uid, mergeSeances, readStored, normalizeSession } from './shared.js';
import { cleanItem, itemKey } from './items.js';
import { parseCSV, proposeMapping, checkMapping, proposeMetricMap, buildImport, TARGETS, MAX_CSV_BYTES } from './csv.js';
import { describeOp } from './outbox.js';
import { installCard, openSetup, showTour } from './views-setup.js';
import { SOUND_STYLES, beep } from './sound.js';
import { remindersCard } from './reminders.js';
import { NEWS } from './news.js';
import { FAQ } from './help.js';
import { faqAdminButtons, announcements } from './content.js';
import { vAdminContent } from './content.js';
import { vSources } from './views-catalog.js';
import { CAPACITIES, ACTIVITIES } from './model.js';

export const APPEAR_KEYS = ['mode', 'palette', 'accent', 'shape', 'radius', 'size', 'density', 'motion', 'vibe'];
export const VIBES = [['classique', 'Classique', 'Sobre et lisible'], ['chaleureux', 'Chaleureux', 'Tons chauds, tout en douceur'], ['muscu', 'Salle de muscu', 'Noir, rouge, énergique'], ['nature', 'Grand air', 'Vert forêt, esprit falaise'], ['minimal', 'Minimal', 'Épuré, sans effets'], ['neon', 'Néon', 'Sombre et lumineux']];
const PALETTES = [['gres', '#d4a056', 'Or'], ['granit', '#5fa8d3', 'Bleu'], ['foret', '#5cb87a', 'Vert'], ['corail', '#ef6f5e', 'Rouge'], ['encre', '#a78bfa', 'Violet'], ['rose', '#f472b6', 'Rose'], ['contraste', '#ffd60a', 'Contraste élevé (jaune)']];
const SUBS = [['main', 'Paramètres'], ['display', 'Affichage'], ['session', 'Pendant la séance'], ['notifs', 'Notifications'], ['help', 'Aide'], ['data', 'Mes données'], ['sync', 'Synchronisation'], ['updates', 'Toutes les mises à jour'], ['bug', 'Signaler un bug'], ['admin', 'Admin']];
/** Rubriques des paramètres : une ligne claire par rubrique, comme les réglages d'un téléphone. */
const MENU = [
  ['display', '🎨', 'Affichage', 'Thème, ambiance, couleur, taille, langue, mise en page'],
  ['session', '▶️', 'Pendant la séance', 'Coach vocal, bips, vibration, repos par défaut'],
  ['notifs', '🔔', 'Notifications', 'Rappels d’entraînement, mises à jour, son'],
  ['data', '💾', 'Mes données', 'Exporter, importer un historique'],
  ['sync', '🔄', 'Synchronisation', 'État de l’envoi de tes données'],
  ['help', '❓', 'Aide', 'Visite guidée, questions fréquentes, sources'],
  ['updates', '🆕', 'Toutes les mises à jour', 'L’évolution de l’app depuis le début, avec une visite pour chacune'],
  ['bug', '🐞', 'Signaler un bug', 'Un problème ? Dis-le nous'],
  ['idea', '💡', 'Proposer une amélioration', 'Une idée, une modification ? Les administrateurs répondent', 'ideaNew'],
  ['admin', '🛡️', 'Admin', 'Réservé aux administrateurs'],
];
const guestNeed = (what) => h`<div class="card acc-b"><h3>🔒 Compte nécessaire</h3><p class="small">${what} demande un compte (gratuit). En le créant, tout ce que tu as fait en mode invité est conservé.</p><button class="btn pri" data-act="guestUpgrade">Créer mon compte</button></div>`;
export function vSettings() {
  const subs = S.user.guest ? SUBS.filter(([k]) => !['sync', 'admin'].includes(k)) : SUBS;
  const sub = subs.some(([k]) => k === S.sub.settings) ? S.sub.settings : 'main';
  const views = { main: vMain, display: vDisplay, session: vSession, updates: vUpdates, notifs: vNotifs, help: vHelp, data: vData, sync: vSync, admin: vAdmin, bug: () => (S.user.guest ? guestNeed('Envoyer un signalement') : vBug()) };
  const title = sub === 'main' ? 'Paramètres' : subs.find(([k]) => k === sub)[1];
  return h`<h1>${title}</h1>${sub !== 'main' && !['display', 'session'].includes(sub) ? back() : ''}${views[sub]()}`;
}
ACT.setSub = (el) => { go('settings', el.dataset.id); if (el.dataset.id === 'admin' && S.user?.isAdmin) loadBugs(); if (el.dataset.id === 'bug' && !S.user?.guest) loadMyBugs(); };

/* ═════════ Accueil des paramètres : compte, rubriques, profil sportif, installation ═════════ */
function vMain() {
  const account = S.user.guest
    ? h`<div class="card acc-b"><h3>👀 Mode invité</h3><p class="small">Tes données restent <b>uniquement sur cet appareil</b> : si tu effaces le navigateur ou changes de téléphone, elles sont perdues. Crée un compte gratuit pour les garder et les retrouver partout.</p>
        <button class="btn pri big" data-act="guestUpgrade">Créer mon compte (je garde mes données)</button>
        <div class="row wrapf"><button class="btn" data-act="guestLogin">J’ai déjà un compte</button><button class="btn danger" data-act="guestQuit">Quitter le mode invité</button></div></div>`
    : h`<div class="card"><div class="row between"><h3>👤 ${S.user.username} ${S.user.isAdmin ? tag('administrateur', 'acc') : ''}</h3><button class="btn sm" data-act="logout">Se déconnecter</button></div>
        <details class="how mini"><summary>Gérer mon compte</summary><div class="row wrapf"><button class="btn" data-act="chpass">Changer le mot de passe</button><button class="btn danger" data-act="delAccount">Supprimer mon compte</button></div></details></div>`;
  return h`${account}
    <label class="findbox"><span aria-hidden="true">🔍</span><input type="search" data-input="setFind" placeholder="Rechercher un paramètre…" aria-label="Rechercher un paramètre" autocomplete="off"></label>
    <div id="setfindres"></div>
    <div class="setmenu setmain">${MENU.filter(([k]) => !(S.user.guest && ['sync', 'admin', 'idea'].includes(k))).map(([k, ic, t, d, a]) => h`<button class="setrow" data-act="${a || 'setSub'}" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">›</span></button>`)}</div>
    <div class="card"><h3>🧩 Mon profil sportif</h3><p class="small muted">Pour que l’app s’adapte à toi (sports, niveau, temps, matériel, objectif).</p>
      <div class="row wrapf"><button class="btn pri" data-act="setupAgain" data-id="quiz">Répondre aux questions</button><button class="btn" data-act="setupAgain" data-id="form">Remplir la fiche</button><button class="btn ghost" data-act="goProfile" data-id="understand">Voir mon profil</button></div></div>
    ${installCard({ force: true })}
    <div class="card"><h3>ℹ️ À propos</h3><p class="small">Séances entraînement · version ${APP_VERSION}. ${S.user.guest ? 'Mode invité : données sur cet appareil uniquement.' : 'Tes données sont liées à ton compte et synchronisées ; elles restent utilisables hors ligne.'}</p>
      <p class="tiny muted">Les séances et analyses suivent des principes d’entraînement courants. Elles ne constituent ni un avis médical ni un diagnostic. Aucune comparaison avec d’autres personnes n’est faite.</p></div>`;
}
function prefs() {
  const st = S.settings, a = window.__sea.load();
  const segA = (k, opts) => h`<div class="chips">${opts.map(([v, l]) => chip(a[k] === v, l, `data-act="appear" data-k="${k}" data-v="${v}"`))}</div>`;
  const tog = ([k, l]) => h`<label class="chk"><input type="checkbox" data-change="pref" name="${k}" ${st[k] ? 'checked' : ''}> ${l}</label>`;
  return { st, a, segA, tog };
}
const back = () => h`<button class="btn sm ghost setback" data-act="setSub" data-id="main">‹ Paramètres</button>`;
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
  return h`${back()}
    <div class="card"><h3>🎨 Affichage</h3>
      <label>Thème</label>${segA('mode', [['dark', '🌙 Sombre'], ['light', '☀️ Clair'], ['auto', '🔁 Comme mon téléphone']])}
      <label>Ambiance</label><div class="vibes">${VIBES.map(([id, n, d]) => h`<button type="button" class="vibe ${(a.vibe || 'classique') === id ? 'on' : ''}" data-act="appear" data-k="vibe" data-v="${id}" data-vibe-preview="${id}"><span class="vprev"><i></i><i></i><i></i></span><b>${n}</b><small>${d}</small></button>`)}</div>
      <label>Couleur</label><div class="palette">${(a.vibe || 'classique') !== 'classique' ? h`<button type="button" class="sw none ${a.accent ? '' : 'on'}" title="Couleur de l’ambiance" aria-label="Couleur de l’ambiance" data-act="appearColor" data-v="">∅</button>` : ''}${PALETTES.map(([id, c, n]) => h`<button type="button" class="sw ${((a.vibe || 'classique') === 'classique' ? a.palette === id && !a.accent : a.accent === c) ? 'on' : ''}" style="background:${c}" title="${n}" aria-label="${n}" data-act="appearColor" data-id="${id}" data-v="${c}"></button>`)}</div>
      <label>Taille du texte</label>${segA('size', [['s', 'Petit'], ['m', 'Normal'], ['l', 'Grand'], ['xl', 'Très grand']])}
      ${tog(['season', '🍂 Décor de saison sur l’accueil (neige, fleurs, feuilles…)'])}
      <label>Langue<select data-change="pref" name="lang"><option value="fr" ${st.lang !== 'en' ? 'selected' : ''}>Français</option><option value="en" ${st.lang === 'en' ? 'selected' : ''}>English (beta)</option></select></label>
      <details class="how mini"><summary>Plus d’options d’affichage</summary><label>Espacement</label>${segA('density', [['compact', 'Serré'], ['normal', 'Normal'], ['airy', 'Aéré']])}<label>Animations</label>${segA('motion', [['on', 'Oui'], ['off', 'Non']])}</details></div>
    <div class="card"><h3>✏️ Mise en page</h3><p class="small muted">Choisis ce qui s’affiche, en grand ou en petite icône en haut, dans quel ordre et de quelle couleur. Le ✏️ en haut de chaque page fait pareil.</p>
      <div class="row wrapf"><button class="btn" data-act="layEditAt" data-to="home/dash">Accueil</button><button class="btn" data-act="layEditAt" data-to="progress/summary">Progrès</button><button class="btn" data-act="layEditAt" data-to="library/seances">Bibliothèque</button><button class="btn" data-act="layEditAt" data-to="profile/home">Profil</button></div>
      <button class="btn ghost" data-act="layReset" data-scope="all">Revenir à la mise en page de base partout</button></div>
`;
}
/* ═════════ Pendant la séance ═════════ */
function vSession() {
  const { st, tog } = prefs();
  return h`${back()}
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
ACT.delAccount = async () => { if (!(await ask('Supprimer définitivement ton compte et toutes tes données ?', { ok: 'Continuer', danger: true, detail: 'Tes contributions à la bibliothèque commune resteront, sans ton nom.' }))) return; openSheet(h`<h2 style="margin:0">Confirmer la suppression</h2><form data-submit="delacct" class="stack"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden" aria-hidden="true"><label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label><button class="btn danger" type="submit">Supprimer définitivement</button></form>`); };
SUBMIT.delacct = async (f) => { try { const id = S.user.id; await api('POST', '/api/auth/delete', { password: new FormData(f).get('password') }); await clearLocal(id); ls.del('sea:user'); closeSheet(); S.user = null; S.authMode = 'register'; location.hash = ''; render(); toast('Compte supprimé'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };

/* ═════════ Données : export / import JSON, import CSV ═════════ */
function vData() {
  const c = S.csv;
  return h`<div class="card"><h3>📦 Sauvegarde complète</h3><p class="small muted">Exporte toutes tes données (séances, historique, calendrier, profil, performances, objectifs, cotations, préférences…) dans un fichier JSON réimportable.</p>
      <div class="row wrapf"><button class="btn pri" data-act="export">📥 Exporter</button><label class="btn">📤 Importer un JSON<input type="file" accept="application/json,.json" data-change="importJson" class="hidden"></label></div></div>
    <div class="card"><h3>📊 Import CSV</h3><p class="small muted">Importe un historique de séances ou des performances depuis un tableur. Tu vérifies la correspondance des colonnes et un aperçu avant tout import.</p>
      <div class="chips">${chip((c?.kind || 'history') === 'history', 'Séances réalisées', 'data-act="csvKind" data-id="history"')}${chip(c?.kind === 'perf', 'Performances', 'data-act="csvKind" data-id="perf"')}</div>
      <label class="btn">Choisir un fichier CSV<input type="file" accept=".csv,text/csv,text/plain" data-change="csvFile" class="hidden"></label>
      ${c?.parsed ? vCsvWizard(c) : ''}</div>`;
}
ACT.export = () => {
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
    if (!haveH.has(x.id)) { addHistory({ id: x.id, sessionId: x.sessionId || null, sessionName: String(x.sessionName || 'Séance').slice(0, 100), startedAt: x.startedAt, durationSeconds: x.durationSeconds || 0, data: x.data || {} }); res.history++; }
  }
  const haveE = new Set(S.events.map((x) => x.id));
  for (const x of (Array.isArray(d.events) ? d.events : []).slice(0, 3000)) { if (x?.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && !haveE.has(x.id)) { saveEvent(x); res.events++; } }
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
CHG.importJson = async (el) => {
  const file = el.files?.[0]; el.value = ''; if (!file) return;
  if (file.size > 8_000_000) { toast('Fichier trop volumineux (8 Mo maximum).', 4000, 'bad'); return; }
  let d; try { d = JSON.parse(await file.text()); } catch { toast('Fichier illisible : ce n’est pas un JSON valide.', 4000, 'bad'); return; }
  if (!(await ask('Importer cette sauvegarde ?', { ok: 'Importer', detail: 'Les éléments sont fusionnés avec tes données actuelles, sans rien supprimer. Le serveur valide chaque élément.' }))) return;
  try { const r = importData(d); writePending(); persist(); bump(); syncSoon(200); buzzOk(); toast(`Importé : ${r.seances} séance(s), ${r.history} historique(s), ${r.events} événement(s), ${r.items} donnée(s) de profil, ${r.personal} exercice(s)${r.skipped ? ` · ${r.skipped} élément(s) invalide(s) ignoré(s)` : ''}.`, 6000); render(); }
  catch (e) { toast(e.message, 5000, 'bad'); }
};
ACT.csvKind = (el) => { S.csv = { kind: el.dataset.id }; render(); };
CHG.csvFile = async (el) => {
  const file = el.files?.[0]; el.value = ''; if (!file) return;
  if (file.size > MAX_CSV_BYTES) { toast('Fichier trop volumineux.', 4000, 'bad'); return; }
  try {
    const parsed = parseCSV(await file.text()), kind = S.csv?.kind || 'history';
    const { mapping, notes } = proposeMapping(parsed.headers, kind);
    S.csv = { kind, parsed, mapping, notes, metricMap: {}, name: file.name };
    refreshMetricMap(); render();
  } catch (e) { toast(e.message, 5000, 'bad'); }
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
      ${pre.records.slice(0, 8).map((r) => c.kind === 'perf' ? h`<p class="tiny">${fmtDay(r.d.date)} · ${ctx().metrics[r.d.metricId]?.label} : ${r.d.value} ${r.d.unit}</p>` : h`<p class="tiny">${fmtDay(r.startedAt)} · ${r.sessionName} · ${r.data.exercises.length} exercice(s)${r.durationSeconds ? ' · ' + Math.round(r.durationSeconds / 60) + ' min' : ''}</p>`)}
      ${pre.errors.slice(0, 8).map((e) => h`<p class="tiny err">Ligne ${e.row} : ${e.error}</p>`)}
      <button class="btn pri" data-act="csvImport" ${pre.records.length ? '' : 'disabled'}>Importer après vérification</button>` : ''}
    <button class="btn" data-act="csvCancel">Annuler</button></div>`;
}
CHG.csvMap = (el) => { S.csv.mapping[el.dataset.i] = el.value; S.csv.notes[el.dataset.i] = el.value ? 'Choisi par toi.' : 'Non importée.'; refreshMetricMap(); render(); };
CHG.csvMetric = (el) => { S.csv.metricMap[el.dataset.v] = el.value; render(); };
ACT.csvCancel = () => { S.csv = null; render(); };
ACT.csvImport = async () => {
  const c = S.csv, r = buildImport(c.parsed, c.mapping, c.kind, { metricMap: c.metricMap });
  if (!(await ask(`Importer ${r.records.length} ${c.kind === 'perf' ? 'performance(s)' : 'séance(s)'} ?`, { ok: 'Importer', detail: r.skipped ? `${r.skipped} ligne(s) seront ignorées (voir l’aperçu).` : '' }))) return;
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
async function loadBugs() { try { S.admin.bugs = (await api('GET', '/api/admin/bugs')).reports; } catch (e) { S.admin.error = e.offline ? 'Connexion requise.' : e.message; } render(); }
function vAdmin() {
  if (!S.user.isAdmin) return h`<form data-submit="adminOn" class="card" autocomplete="off"><h3>🛡️ Administration</h3><p class="small muted">Saisis le mot de passe administrateur pour activer les droits d’administration sur ton compte. Il est vérifié uniquement par le serveur et n’est jamais conservé sur cet appareil.</p>
    <label>Mot de passe administrateur<input type="password" name="password" autocomplete="off" required></label><button class="btn pri" type="submit">Activer</button></form>`;
  const bugs = S.admin.bugs, f = S.admin.filter || 'open';
  if (!bugs && !S.admin.error) setTimeout(loadBugs, 0);
  return h`<div class="card acc-b"><h3>🛡️ Tu es administrateur</h3><p class="small">Tu peux modifier presque tout pour tous les comptes : exercices, séances prêtes, intentions par sport, formats de séance et bibliothèque commune. À chaque changement, l’app te demande si c’est pour toi ou pour tout le monde. Tu n’as pas accès aux données privées des autres comptes.</p>
      <div class="row wrapf"><button class="btn" data-act="libSub" data-id="common">📚 Bibliothèque commune</button><button class="btn" data-act="adminOff">Quitter le rôle administrateur</button></div></div>
    ${vAdminContent()}
    ${vAdminProposals()}${vAdminUsers()}
    <div class="card"><div class="row between"><h3>🐞 Signalements</h3><button class="btn sm" data-act="bugsReload">↻</button></div><div class="chips">${[['open', 'Ouverts'], ['done', 'Traités'], ['all', 'Tous']].map(([k, l]) => chip(f === k, l, `data-act="bugFilter" data-id="${k}"`))}</div>
      ${S.admin.error ? h`<p class="err small">${S.admin.error}</p>` : !bugs ? skeleton(2) : bugs.filter((b) => f === 'all' || b.status === f).length ? bugs.filter((b) => f === 'all' || b.status === f).map((b) => h`<div class="card flat"><div class="row between"><b>${b.title}</b>${tag(b.status === 'done' ? 'traité' : 'ouvert', b.status === 'done' ? 'ok' : 'warn')}</div><p class="small pre">${b.description}</p><p class="tiny muted">par ${b.author} · ${fmtDateTime(b.createdAt)}${b.page ? ' · page : ' + b.page : ''}${b.appVersion ? ' · v' + b.appVersion : ''}${b.userAgent ? ' · ' + b.userAgent.slice(0, 80) : ''}</p><button class="btn sm" data-act="bugStatus" data-id="${b.id}" data-v="${b.status === 'done' ? 'open' : 'done'}">${b.status === 'done' ? 'Rouvrir' : 'Marquer traité'}</button></div>`) : h`<p class="muted small">Aucun signalement.</p>`}</div>`;
}
/* Propositions des utilisateurs (intentions, idées) et intentions communes. */
async function loadProps() {
  try { const [p, ci] = await Promise.all([api('GET', '/api/admin/proposals?status=' + (S.admin.propF || 'open')), api('GET', '/api/community/intents')]); S.admin.props = p.proposals; S.admin.cintents = ci.intents; S.admin.propErr = ''; }
  catch (e) { S.admin.propErr = e.offline ? 'Connexion requise.' : e.message; }
  render();
}
function vAdminProposals() {
  const p = S.admin.props; if (!p && !S.admin.propErr) setTimeout(loadProps, 0);
  const capL = (id) => CAPACITIES[id]?.label || id;
  return h`<div class="card"><div class="row between"><h3>📬 Propositions ${p?.length && (S.admin.propF || 'open') === 'open' ? tag(String(p.length), 'acc') : ''}</h3><button class="btn sm" data-act="propsReload" aria-label="Actualiser">↻</button></div>
    <div class="chips">${[['open', 'À traiter'], ['done', 'Traitées']].map(([k, l]) => chip((S.admin.propF || 'open') === k, l, `data-act="propF" data-id="${k}"`))}</div>
    ${S.admin.propErr ? h`<p class="err small">${S.admin.propErr}</p>` : !p ? skeleton(1) : p.length ? p.map((x) => h`<div class="item prop"><div class="grow"><b>${x.payload?.emoji || ''} ${x.label}</b> ${tag(x.kind === 'intent' ? 'intention' : x.kind === 'category' ? 'catégorie' : 'idée')}
        <div class="tiny muted">${x.username || 'compte supprimé'} · ${relDate(x.created_at)}${x.activity ? ' · ' + (ACTIVITIES[x.activity]?.label || x.activity) : ''}</div>
        ${x.detail ? h`<p class="small">${x.detail}</p>` : ''}${Object.keys(x.payload?.caps || {}).length ? h`<div class="chips">${Object.keys(x.payload.caps).map((c) => h`<span class="chip static">${capL(c)}</span>`)}</div>` : ''}${x.reply ? h`<p class="tiny">${x.reply}</p>` : ''}</div>
      ${x.status === 'open' ? h`<div class="row tight"><button class="btn sm pri" data-act="propOpen" data-id="${x.id}">📍 Voir et décider</button><button class="btn sm pri" data-act="propDo" data-id="${x.id}" data-d="accept">${x.kind === 'intent' ? 'Ajouter pour tous' : 'Accepter'}</button><button class="btn sm ghost" data-act="propDo" data-id="${x.id}" data-d="refuse">Refuser</button></div>` : ''}</div>`) : h`<p class="small muted">Rien à traiter.</p>`}
    ${S.admin.cintents?.length ? h`<details class="how mini"><summary>Intentions communes (${S.admin.cintents.length})</summary>${S.admin.cintents.map((x) => h`<div class="item"><div class="grow small">${x.emoji} ${x.label} <span class="tiny muted">${x.activityId ? ACTIVITIES[x.activityId]?.label || x.activityId : 'tous sports'}</span></div><button class="btn sm ghost danger" data-act="cintentDel" data-id="${x.id}" aria-label="Retirer">✕</button></div>`)}</details>` : ''}</div>`;
}
ACT.propsReload = () => { S.admin.props = null; loadProps(); };
ACT.propF = (el) => { S.admin.propF = el.dataset.id; ACT.propsReload(); };
ACT.propDo = async (el) => {
  const accept = el.dataset.d === 'accept';
  if (!(await ask(accept ? 'Accepter cette proposition ?' : 'Refuser cette proposition ?', { ok: accept ? 'Accepter' : 'Refuser', danger: !accept, detail: accept ? 'Une intention acceptée apparaît pour tous les utilisateurs.' : '' }))) return;
  try { await api('POST', '/api/admin/proposals/' + el.dataset.id, { decision: el.dataset.d }); toast(accept ? 'Ajoutée pour tout le monde' : 'Refusée'); } catch (e) { toast(e.message, 4000, 'bad'); }
  ACT.propsReload();
};
ACT.cintentDel = async (el) => { if (!(await ask('Retirer cette intention pour tout le monde ?', { danger: true, ok: 'Retirer' }))) return; try { await api('DELETE', '/api/admin/intents/' + el.dataset.id); } catch (e) { toast(e.message, 4000, 'bad'); } ACT.propsReload(); };

/* Comptes existants (admin) : identité et activité uniquement, jamais les données d'entraînement. */
async function loadUsers() { try { S.admin.users = await api('GET', '/api/admin/users'); S.admin.usersErr = ''; } catch (e) { S.admin.usersErr = e.offline ? 'Connexion requise.' : e.message; } render(); }
function vAdminUsers() {
  const u = S.admin.users, q = (S.admin.userQ || '').toLowerCase();
  if (!u && !S.admin.usersErr) setTimeout(loadUsers, 0);
  const list = u ? u.users.filter((x) => !q || x.username.toLowerCase().includes(q)) : [];
  const d30 = u ? u.users.filter((x) => x.lastLogin && Date.now() - x.lastLogin < 30 * 86400000).length : 0;
  return h`<div class="card"><div class="row between"><h3>👥 Comptes</h3><button class="btn sm" data-act="usersReload" aria-label="Actualiser">↻</button></div>
    ${S.admin.usersErr ? h`<p class="err small">${S.admin.usersErr}</p>` : !u ? skeleton(2) : h`
      <div class="kpis"><div class="kpi"><span>👥 Comptes</span><b>${u.total}</b></div><div class="kpi"><span>🟢 Actifs (30 j)</span><b>${d30}</b></div></div>
      <input type="search" data-input="userQ" value="${S.admin.userQ || ''}" placeholder="🔎 Chercher un pseudo" aria-label="Chercher un compte">
      <div class="ulist">${list.slice(0, 200).map((x) => h`<div class="urow"><div class="uav">${x.username.slice(0, 1).toUpperCase()}</div><div class="grow"><b>${x.username}</b> ${x.isAdmin ? tag('admin', 'acc') : ''}
        <div class="tiny muted">inscrit ${relDate(x.createdAt)}${x.email ? ' · ' + x.email : ''}</div></div>
        <div class="ustat"><b>${x.sessionsDone}</b><span>séance${x.sessionsDone > 1 ? 's' : ''}</span></div>
        <div class="ustat"><span>${x.lastLogin ? relDate(x.lastLogin) : 'jamais'}</span><span class="tiny muted">connexion</span><button class="btn sm ${x.isAdmin ? 'ghost' : ''}" data-act="userRole" data-id="${x.id}" data-v="${x.isAdmin ? '0' : '1'}">${x.isAdmin ? 'Retirer admin' : 'Nommer admin'}</button></div></div>`)}
        ${list.length > 200 ? h`<p class="tiny muted">… ${list.length - 200} autre(s) : affine la recherche.</p>` : ''}${!list.length ? h`<p class="small muted">Aucun compte trouvé.</p>` : ''}</div>
      <details class="how mini"><summary>Ce que tu vois ici</summary><p class="tiny">Pseudo, date d’inscription, e-mail masqué, nombre de séances réalisées et dernière connexion. Les séances, performances et profils des membres restent privés.</p></details>`}</div>`;
}
ACT.usersReload = () => { S.admin.users = null; loadUsers(); };
INPUT.userQ = (el) => { S.admin.userQ = el.value; clearTimeout(INPUT.userQ.t); INPUT.userQ.t = setTimeout(() => { render(); const i = document.querySelector('input[data-input=userQ]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
SUBMIT.adminOn = async (f) => {
  const pw = new FormData(f).get('password'); f.reset(); // la valeur saisie est effacée du formulaire immédiatement
  try { await api('POST', '/api/admin/activate', { password: pw }); const me = await api('GET', '/api/auth/me'); S.user = me.user; ls.set('sea:user', { id: me.user.id, username: me.user.username, isAdmin: me.user.isAdmin }); buzzOk(); toast('Droits administrateur activés'); loadBugs(); render(); }
  catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.adminOff = async () => { if (!(await ask('Quitter le rôle administrateur ?', { detail: 'Il faudra de nouveau le mot de passe administrateur pour le réactiver.' }))) return; try { await api('POST', '/api/admin/deactivate', {}); S.user = { ...S.user, isAdmin: false }; ls.set('sea:user', { id: S.user.id, username: S.user.username, isAdmin: false }); render(); } catch (e) { toast(e.message); } };
ACT.bugsReload = () => { S.admin.bugs = null; S.admin.error = ''; loadBugs(); };
ACT.bugFilter = (el) => { S.admin.filter = el.dataset.id; render(); };
ACT.bugStatus = async (el) => { try { await api('POST', `/api/admin/bugs/${encodeURIComponent(el.dataset.id)}`, { status: el.dataset.v }); const b = S.admin.bugs.find((x) => x.id === el.dataset.id); if (b) b.status = el.dataset.v; render(); } catch (e) { toast(e.message); } };

/* ═════════ Signaler un bug ═════════ */
async function loadMyBugs() { try { S.myBugs = (await api('GET', '/api/bugs/mine')).reports; } catch { /* hors ligne : liste indisponible */ } render(); }
function vBug() {
  const pages = [['', '—'], ['accueil', 'Accueil'], ['progres', 'Progrès'], ['bibliotheque', 'Bibliothèque'], ['generateur', 'Générateur'], ['seance', 'Mode séance'], ['profil', 'Profil'], ['parametres', 'Paramètres'], ['synchronisation', 'Synchronisation / hors ligne']];
  return h`<form data-submit="bugSend" class="card"><h3>🐞 Signaler un bug</h3>
      <label>Titre court<input name="title" required minlength="3" maxlength="120" placeholder="Ex. Le chrono ne s’arrête pas"></label>
      <label>Description détaillée<textarea name="description" required minlength="5" maxlength="5000" placeholder="Ce que tu faisais, ce qui s’est passé, ce que tu attendais…"></textarea></label>
      <label>Page concernée<select name="page">${pages.map(([k, l]) => h`<option value="${k}">${l}</option>`)}</select></label>
      <label class="chk"><input type="checkbox" name="device" checked> Joindre les informations techniques de l’appareil (navigateur, version de l’application)</label>
      <p class="tiny muted">Ne mets jamais de mot de passe dans un signalement. Envoyé hors ligne, il part dès le retour de la connexion.</p>
      <button class="btn pri" type="submit">Envoyer</button></form>
    <div class="card"><h3>Mes signalements</h3>${S.myBugs ? (S.myBugs.length ? S.myBugs.map((b) => h`<div class="item"><div class="grow"><b>${b.title}</b><div class="tiny muted">${fmtDateTime(b.createdAt)}</div></div>${tag(b.status === 'done' ? 'traité' : 'reçu', b.status === 'done' ? 'ok' : '')}</div>`) : h`<p class="muted small">Aucun signalement envoyé.</p>`) : h`<p class="muted small">Liste disponible en ligne.</p>`}</div>`;
}
SUBMIT.bugSend = (f) => {
  const d = Object.fromEntries(new FormData(f));
  queue('POST', '/api/bugs', { id: uid(), title: d.title, description: d.description, page: d.page, appVersion: d.device ? APP_VERSION : '', userAgent: d.device ? navigator.userAgent.slice(0, 300) : '' });
  f.reset(); buzzOk(); toast('Signalement enregistré : il est envoyé aux administrateurs. Merci !'); setTimeout(loadMyBugs, 2500);
};

/** Nommer ou retirer un administrateur (le serveur garde toujours au moins un administrateur). */
ACT.userRole = async (el) => {
  const make = el.dataset.v === '1', u = S.admin.users?.users?.find((x) => x.id === el.dataset.id);
  if (!(await ask(make ? `Nommer ${u?.username || 'ce compte'} administrateur ?` : `Retirer les droits d’administrateur de ${u?.username || 'ce compte'} ?`, { ok: make ? 'Oui, nommer' : 'Oui, retirer', danger: !make, detail: make ? 'Il pourra modifier le contenu de l’app pour tout le monde et traiter les idées. Il n’aura pas accès aux données privées des comptes.' : '' }))) return;
  try { await api('POST', `/api/admin/users/${encodeURIComponent(el.dataset.id)}/role`, { admin: make }); toast(make ? 'Administrateur nommé' : 'Droits retirés'); S.admin.users = null; render(); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
