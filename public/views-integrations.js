// Connexions réelles et imports explicites ; les identifiants OAuth restent sur le serveur.
import { h, ask, toast, fmtDay } from './ui.js';
import { S, ACT, CHG, api, render, go, accountToken, accountMatches, bump, persist, persistNow, purgeExternalHistory, historyChanged } from './state.js';
import { normalizeHistory } from './shared.js';
import { fmtTime } from './sports.js';
import { APPS } from './integrations.js';

const ROOT = '/api/integrations/strava';
const KINDS = { direct: 'Connexion directe', file: 'Import par fichier', native: 'Outil disponible dans l’app', mobile: 'Développement mobile nécessaire', partner: 'Accès réservé aux partenaires', unverified: 'Connexion non disponible ici' };
const SPORTS = { Run: 'Course', TrailRun: 'Trail', VirtualRun: 'Course virtuelle', Ride: 'Vélo', MountainBikeRide: 'VTT', GravelRide: 'Gravel', VirtualRide: 'Vélo virtuel', Swim: 'Natation', WeightTraining: 'Renforcement', RockClimbing: 'Escalade · bloc ou voie non précisé', Workout: 'Entraînement', Walk: 'Marche', Hike: 'Randonnée' };
function state() {
  if (!S.connections || !accountMatches(S.connections.token)) S.connections = { token: accountToken(), status: null, loading: false, busy: '', error: '', notice: '', consent: false, preview: null, page: 1, selected: new Set() };
  return S.connections;
}
const current = (st) => S.connections === st && accountMatches(st.token);
const visible = () => S.tab === 'settings' && S.sub.settings === 'integrations' && /^#\/settings\/integrations(?:\/|$)/.test(location.hash);
let integrationPress = null;
function draw(st) {
  if (!current(st) || !visible()) return;
  if (integrationPress?.st === st && integrationPress.route === location.hash && integrationPress.element.isConnected) { integrationPress.pending = true; return; }
  render();
}
function releaseIntegrationPress(event) {
  const press = integrationPress;
  if (!press || press.releasing || (event.pointerId != null && event.pointerId !== press.pointerId)) return;
  press.releasing = true;
  // Le clic natif doit atteindre le contrôle conservé avant tout remplacement de #app.
  setTimeout(() => {
    if (integrationPress !== press) return;
    integrationPress = null;
    if (press.pending && press.route === location.hash && current(press.st) && visible()) draw(press.st);
  }, 0);
}
if (typeof document !== 'undefined') {
  // Suivi unique au chargement du module, pour les boutons, onglets et liens natifs.
  document.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false || event.button !== 0 || !visible()) return;
    const element = event.target.closest('button,a[href],input,select,textarea,label,summary,[role="button"]');
    if (!element?.closest('#app')) return;
    const st = S.connections; if (!st || !current(st)) return;
    integrationPress = { st, route: location.hash, element, pointerId: event.pointerId, pending: integrationPress?.st === st && integrationPress.pending, releasing: false };
  }, true);
  for (const event of ['pointerup', 'pointercancel', 'click']) document.addEventListener(event, releaseIntegrationPress, true);
  window.addEventListener('blur', releaseIntegrationPress);
  window.addEventListener('hashchange', releaseIntegrationPress);
}
const safeUrl = (value) => { try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const distance = (meters) => Number.isFinite(meters) && meters >= 0 ? `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : 'Distance non renseignée';
const rows = (st) => Array.isArray(st.preview?.activities) ? st.preview.activities : [];
const hasStravaImports = (st) => st.status?.importedCount > 0 || S.history.some((entry) => entry.data?.external?.provider === 'strava') || [...S.outbox, ...S.failed].some((op) => op.path === '/api/history' && op.body?.data?.external?.provider === 'strava');

export function vIntegrations() {
  const st = state();
  if (!S.user?.guest && !st.status && !st.loading && !st.error) queueMicrotask(() => loadStatus(st));
  const apps = APPS.filter((app) => app.id !== 'strava');
  return h`<div class="stack integrations"><p class="small muted">Garde tes activités au même endroit. Chaque import demande ta confirmation ; les activités importées par Strava ou un fichier GPX / TCX restent privées et sont exclues des demandes envoyées à l’IA.</p>
    ${stravaCard(st)}
    <div class="card"><h3>Importer un fichier</h3><p class="small">GPX ou TCX depuis une montre ou une appli ; CSV depuis un tableur. Tu vérifies le résumé ou les colonnes avant l’ajout.</p><div class="row wrapf"><button class="btn" data-act="importOpen" data-source="file">GPX / TCX</button><button class="btn" data-act="integrationCSV">Ouvrir l’import CSV</button></div></div>
    <details class="card"><summary>Applications d’escalade et de sport</summary><p class="tiny muted">Les possibilités ci-dessous dépendent des fonctions proposées par chaque application. Un lien vers son site ne signifie pas qu’elle est connectée à ton compte.</p><div class="stack">${apps.map(appCard)}</div></details>
  </div>`;
}
function stravaCard(st) {
  const status = st.status, guest = S.user?.guest, disabled = !!st.busy || st.loading;
  return h`<div class="card stack"><div class="row between wrapf"><h3 style="margin:0">Strava</h3>${status?.connected ? h`<span class="tag">Compte connecté</span>` : ''}</div>
    <p class="small">Ajoute les activités que tu choisis à ton historique, y compris les activités privées auxquelles tu autorises l’accès. Les traces GPS et les informations de ton compte Strava ne sont pas importées.</p>
    ${guest ? h`<p class="small muted">Crée un compte pour connecter Strava. L’import d’un fichier reste disponible sur cet appareil.</p>` : st.loading ? h`<p class="small muted" role="status">Vérification de la connexion…</p>` : status ? status.connected ? h`
      <p class="tiny muted">${status.connectedAt ? `Connecté depuis le ${fmtDay(status.connectedAt)}. ` : ''}${Number.isFinite(status.importedCount) ? `${status.importedCount} activité${status.importedCount > 1 ? 's' : ''} importée${status.importedCount > 1 ? 's' : ''}.` : ''}</p>
      <div class="row wrapf"><button class="btn pri" data-act="stravaPreview" data-page="1" ${disabled ? 'disabled' : ''}>${st.busy === 'preview' ? 'Chargement…' : 'Choisir les activités à importer'}</button><button class="btn" data-act="stravaDisconnect" ${disabled ? 'disabled' : ''}>Déconnecter et supprimer les imports Strava</button></div>` : status.configured && status.canConnect ? h`
      <label class="chk small"><input type="checkbox" data-change="stravaConsent" ${st.consent ? 'checked' : ''} ${disabled ? 'disabled' : ''}> J’autorise l’accès à mes activités Strava, y compris privées, pour sélectionner celles à importer.</label>
      <button class="btn pri" data-act="stravaConnect" ${!st.consent || disabled ? 'disabled' : ''}>${st.busy === 'start' ? 'Ouverture…' : 'Connecter Strava'}</button>
      <p class="tiny muted">Strava te demande son autorisation sur son propre site. Aucun mot de passe Strava n’est demandé ici.</p>` : h`<p class="small muted">${status.configured ? 'La connexion Strava n’est pas disponible pour le moment.' : 'La connexion directe nécessite la configuration Strava par l’administrateur du site.'}</p><button class="btn" data-act="importOpen" data-source="strava">Importer un export Strava GPX / TCX</button>` : ''}
    ${!guest && !status?.connected && hasStravaImports(st) ? h`<button class="btn" data-act="stravaDisconnect" ${disabled ? 'disabled' : ''}>Supprimer les imports Strava</button>` : ''}
    ${st.error ? h`<p class="small bad-t" role="status">${st.error}</p>` : ''}${st.notice ? h`<p class="small" role="status">${st.notice}</p>` : ''}
    ${!guest ? h`<button class="btn sm ghost" data-act="stravaStatus" ${disabled ? 'disabled' : ''}>Vérifier la connexion</button>` : ''}
    ${st.preview ? preview(st) : ''}</div>`;
}
function preview(st) {
  const list = rows(st), expired = !Number.isFinite(st.preview.expiresAt) || st.preview.expiresAt <= Date.now();
  return h`<div class="stack" id="strava-preview"><h4 style="margin:0">Activités à vérifier · page ${st.page}</h4>
    <p class="tiny muted">Sélectionne uniquement les activités à ajouter. Rien n’est enregistré avant « Importer la sélection ».</p>
    ${st.preview.unavailableCount > 0 ? h`<p class="tiny muted">${st.preview.unavailableCount} activité${st.preview.unavailableCount > 1 ? 's' : ''} non proposée${st.preview.unavailableCount > 1 ? 's' : ''} : données absentes, incompatibles ou hors des limites de cet historique.</p>` : ''}
    ${expired ? h`<p class="small bad-t" role="status">Cet aperçu a expiré. Recharge les activités avant l’import.</p>` : ''}
    ${list.length ? list.map((activity) => h`<label class="card flat chk"><input type="checkbox" data-change="stravaSelect" value="${activity.id}" ${st.selected.has(String(activity.id)) ? 'checked' : ''} ${activity.imported || st.busy || expired ? 'disabled' : ''}><span class="grow stack tight" style="overflow-wrap:anywhere"><b>${activity.name || 'Activité Strava'}</b><small>${fmtDay(activity.startedAt)} · ${fmtTime(activity.durationSeconds)} · ${distance(activity.distanceMeters)}${Number.isFinite(activity.elevationMeters) ? ` · D+ ${activity.elevationMeters} m` : ''}</small><small>${activity.imported ? 'Déjà importée' : `${SPORTS[activity.sportType] || activity.sportType || 'Sport non renseigné'} · Import privé`}</small></span></label>`) : h`<p class="small muted">Aucune activité sur cette page.</p>`}
    <div class="row wrapf"><button class="btn pri" data-act="stravaImport" ${!st.selected.size || st.busy || expired ? 'disabled' : ''}>${st.busy === 'import' ? 'Import…' : `Importer la sélection (${st.selected.size})`}</button>
      ${st.page > 1 ? h`<button class="btn" data-act="stravaPreview" data-page="${st.page - 1}" ${st.busy ? 'disabled' : ''}>Page précédente</button>` : ''}${Number.isInteger(st.preview.nextPage) ? h`<button class="btn" data-act="stravaPreview" data-page="${st.preview.nextPage}" ${st.busy ? 'disabled' : ''}>Page suivante</button>` : ''}</div></div>`;
}
function appCard(app) {
  const url = safeUrl(app.url), formats = Array.isArray(app.formats) ? app.formats.map((f) => String(f).toUpperCase()) : [];
  return h`<div class="card flat"><div class="row between wrapf"><b>${app.name}</b><span class="tiny muted">${KINDS[app.kind] || KINDS.unverified}</span></div><p class="small">${app.description}</p>
    ${formats.length ? h`<p class="tiny muted">Formats annoncés : ${formats.join(', ')}. Vérifie leur disponibilité dans ton compte sur cette application.</p>` : ''}
    <div class="row wrapf">${url ? h`<a class="btn sm" href="${url}" target="_blank" rel="noopener noreferrer">Site officiel</a>` : ''}${formats.some((f) => ['GPX', 'TCX'].includes(f)) ? h`<button class="btn sm" data-act="importOpen" data-source="file">Importer un fichier GPX / TCX</button>` : ''}${formats.includes('CSV') ? h`<button class="btn sm" data-act="integrationCSV">Ouvrir l’import CSV</button>` : ''}${app.id === 'tindeq' && app.kind === 'native' ? h`<button class="btn sm" data-act="dynoOpen">Ouvrir le dynamomètre</button>` : ''}</div></div>`;
}
async function loadStatus(st) {
  if (!current(st) || S.user?.guest || st.loading || st.busy) return;
  st.loading = true; st.error = ''; draw(st);
  try { const result = await api('GET', `${ROOT}/status`); if (!current(st)) return; st.status = result; if (!result.connected) { st.preview = null; st.selected.clear(); st.consent = false; } }
  catch (e) { if (current(st)) st.error = e.message || 'Impossible de vérifier Strava.'; }
  finally { if (current(st)) { st.loading = false; draw(st); } }
}
ACT.stravaStatus = () => loadStatus(state());
CHG.stravaConsent = (el) => { const st = state(); if (st.busy) return; st.consent = el.checked; draw(st); };
ACT.stravaConnect = async () => {
  const st = state(); if (st.busy || !st.consent || !st.status?.configured || !st.status?.canConnect || st.status.connected) return;
  st.busy = 'start'; st.error = ''; draw(st);
  try {
    const result = await api('POST', `${ROOT}/start`, { confirm: true }); if (!current(st) || !st.consent) return;
    const url = new URL(result.authorizeUrl); if (url.protocol !== 'https:' || url.hostname !== 'www.strava.com' || url.pathname !== '/oauth/authorize' || url.username || url.password || url.hash) throw new Error('L’adresse de connexion Strava n’est pas valide.');
    location.assign(url.href);
  } catch (e) { if (current(st)) st.error = e.message || 'Impossible de démarrer la connexion Strava.'; }
  finally { if (current(st)) { st.busy = ''; draw(st); } }
};
ACT.stravaPreview = async (el) => {
  const st = state(), page = Math.max(1, Math.min(100, Number(el?.dataset?.page) || 1)); if (st.busy || !st.status?.connected) return;
  st.busy = 'preview'; st.error = ''; st.notice = ''; st.preview = null; st.selected.clear(); draw(st);
  try {
    const result = await api('POST', `${ROOT}/preview`, { page }); if (!current(st)) return;
    if (typeof result.previewToken !== 'string' || !Array.isArray(result.activities) || !Number.isFinite(result.expiresAt)) throw new Error('L’aperçu Strava n’est pas disponible.');
    st.page = page; st.preview = result;
  } catch (e) { if (current(st)) st.error = e.message || 'Impossible de charger les activités Strava.'; }
  finally { if (current(st)) { st.busy = ''; draw(st); } }
};
CHG.stravaSelect = (el) => {
  const st = state(), id = String(el.value), activity = rows(st).find((a) => String(a.id) === id);
  if (st.busy || !activity || activity.imported || st.preview.expiresAt <= Date.now()) return;
  if (el.checked) st.selected.add(id); else st.selected.delete(id); draw(st);
};
ACT.stravaImport = async () => {
  const st = state(); if (st.busy || !st.preview || !st.selected.size) return;
  if (st.preview.expiresAt <= Date.now()) { st.error = 'Cet aperçu a expiré. Recharge les activités avant l’import.'; draw(st); return; }
  const activityIds = [...st.selected].filter((id) => rows(st).some((a) => String(a.id) === id && !a.imported)); if (!activityIds.length) return;
  st.busy = 'import'; st.error = ''; st.notice = ''; draw(st); let completed = false;
  try {
    const result = await api('POST', `${ROOT}/import`, { previewToken: st.preview.previewToken, activityIds, confirm: true }); if (!current(st)) return;
    const imported = Array.isArray(result.imported) ? result.imported : [], duplicates = Array.isArray(result.duplicates) ? result.duplicates : [];
    historyChanged();
    const history = new Map(S.history.map((entry) => [entry.id, entry])); for (const entry of Array.isArray(result.history) ? result.history : []) { const clean = normalizeHistory(entry); if (clean) history.set(clean.id, clean); }
    S.history = [...history.values()].sort((a, b) => b.startedAt - a.startedAt); bump(); persist();
    const done = new Set([...imported, ...duplicates].map((row) => String(row.activityId))); rows(st).forEach((a) => { if (done.has(String(a.id))) a.imported = true; }); st.selected.clear();
    st.notice = `${imported.length} activité${imported.length > 1 ? 's' : ''} ajoutée${imported.length > 1 ? 's' : ''}${duplicates.length ? ` ; ${duplicates.length} déjà présente${duplicates.length > 1 ? 's' : ''}` : ''}.`;
    await persistNow(); completed = true;
  } catch (e) { if (current(st)) st.error = e.message || 'L’import Strava n’a pas pu être confirmé.'; }
  finally { if (current(st)) { st.busy = ''; if (completed) void loadStatus(st); else draw(st); } }
};
ACT.stravaDisconnect = async () => {
  const st = state(); if (st.busy || (!st.status?.connected && !hasStravaImports(st))) return;
  const connected = st.status?.connected === true;
  const consent = await ask('Déconnecter Strava et supprimer ses imports ?', { ok: 'Supprimer et déconnecter', danger: true, detail: 'Toutes les activités Strava importées dans ce compte seront supprimées, y compris les exports de fichiers identifiés comme Strava. Tes autres séances sont conservées.' });
  if (!consent || !current(st) || st.busy) return;
  st.busy = 'disconnect'; st.error = ''; st.notice = ''; draw(st);
  try {
    const result = await api('DELETE', ROOT); if (!current(st)) return;
    purgeExternalHistory('strava');
    st.preview = null; st.selected.clear(); st.consent = false; st.status = { ...st.status, connected: false, importedCount: 0 };
    st.notice = result.notice || (result.revoked === true ? 'Strava déconnecté ; ses imports et son accès ont été supprimés.' : !connected ? 'Les imports Strava ont été supprimés de ce compte.' : 'Les imports et identifiants Strava ont été supprimés de ce site. La révocation sur Strava n’a pas pu être confirmée ; vérifie les applications autorisées dans ton compte Strava.');
    await persistNow();
    if (current(st)) toast('Imports Strava supprimés de ce compte.');
  } catch (e) { if (current(st)) st.error = e.message || 'La déconnexion Strava n’a pas pu être confirmée.'; }
  finally { if (current(st)) { st.busy = ''; draw(st); } }
};
ACT.integrationCSV = () => go('settings', 'data');
