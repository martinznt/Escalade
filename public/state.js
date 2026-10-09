// state.js — état de l'application, stockage local, réseau, file d'attente hors ligne et synchronisation.
//
// Durabilité hors ligne :
//  - les opérations en attente (file), les éléments modifiés non envoyés et les séances modifiées sont écrits
//    IMMÉDIATEMENT et de façon synchrone dans localStorage (« pending ») : fermer l'onglet juste après une action
//    ne perd rien ; le reste des données (cache) est dans IndexedDB (plus d'espace), avec repli sur localStorage ;
//  - chaque opération porte un identifiant (X-Op-Id) : le serveur ne l'applique qu'une fois, même rejouée ;
//  - les données structurées (items) sont fusionnées élément par élément (dernière modification gagnante) ; une
//    version locale écrasée par une version plus récente d'un autre appareil est conservée dans « conflits »,
//    restaurable depuis le diagnostic ;
//  - une opération définitivement refusée n'est jamais effacée en silence : elle va dans « actions en échec »
//    (Réessayer / Abandonner) et un message l'annonce.

import { externalProvider } from './external.js';
import { uid, normalizeSession, normalizeHistory, mergeSeances, readStored } from './shared.js';
import { cleanItem, itemKey } from './items.js';
import { decideOutboxError, newOpId, describeOp } from './outbox.js';
import { buildContext } from './brain.js';
import { registerMine } from './choices.js';
import { toast, tz, $ } from './ui.js';

export const APP_VERSION = '8.34.1';
export const ACT = {}, SUBMIT = {}, CHG = {}, INPUT = {};
export const DEFAULT_SETTINGS = { sound: true, vibration: true, voice: false, keepAwake: true, handsFree: false, defaultRest: 60, defaultMinutes: 30, onboarded: false, autoBase: false, avoid: {}, bigMode: false, autoWarm: true, season: false, soundStyle: 'bip', volume: 60, lang: 'fr', notifSound: 'doux', redMode: false, interfaceMode: 'simple' };
const initialAccountState = () => ({
  settings: { ...DEFAULT_SETTINGS, avoid: {} }, seances: { items: [], tomb: {} }, seancesDirty: false, seancesVer: 0,
  history: [], events: [], personal: [], commonEx: [], items: new Map(), dirtyItems: new Set(), itemsCursor: 0,
  outbox: [], failed: [], conflicts: [], sync: 'idle', syncing: false, syncAgain: false, lastSync: 0, lastError: '', loaded: false,
  shared: { common: null, publicMine: null, detail: null, loading: false, error: '' }, admin: { bugs: null }, social: { me: null, feed: null, error: '' }, myBugs: null,
  gen: { activityId: '', mode: 'weaknesses', goalId: '', minutes: 30, intentions: [], envId: '', light: false, priorities: {}, plan: null, result: null, saved: false },
  player: null, search: { q: '', smart: true }, cal: null, filters: {},
});
export const S = {
  user: null, tab: 'home', sub: { home: 'dash', progress: 'summary', library: 'seances', profile: 'home', settings: 'main' }, param: '',
  ...initialAccountState(), ver: 0, authMode: '', authError: '', prefill: '',
};
export const bump = () => { S.ver++; };

/* ═════════ Stockage ═════════ */
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* rien */ } },
};
export { ls, idb };
/**
 * Réglages et brouillons locaux propres au compte connecté (chrono, dernier réglage du générateur, rappels, filtres,
 * sauvegarde) : sur un appareil partagé, rien ne passe d'un compte à l'autre. Une ancienne valeur commune à l'appareil
 * (avant la 8.34.1) est effacée ; legacy « keep » la laisse au premier compte qui la lit (réglage sans donnée privée).
 */
const ownKey = (k, owner = S.user?.id) => `${k}:${owner || 'anon'}`;
const lsHas = (k) => { try { return localStorage.getItem(k) != null; } catch { return false; } };
export const own = {
  get(k, d = null, { legacy = 'drop' } = {}) {
    const key = ownKey(k);
    if (lsHas(key)) return ls.get(key, d);
    if (!S.user?.id || !lsHas(k)) return d;
    const old = ls.get(k, d); ls.del(k);
    if (legacy !== 'keep') return d;
    ls.set(key, old); return old;
  },
  set(k, v) { return ls.set(ownKey(k), v); },
  del(k) { ls.del(ownKey(k)); },
};
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!('indexedDB' in globalThis)) return rej(new Error('IndexedDB indisponible'));
      const r = indexedDB.open('mes-seances', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result ?? null); t.onerror = () => rej(t.error); }); },
  async set(k, v) { const d = await this.open(); return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); },
  async del(k) { const d = await this.open(); return new Promise((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); },
  async keys() { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv').objectStore('kv').getAllKeys(); t.onsuccess = () => res((t.result || []).map(String)); t.onerror = () => rej(t.error); }); },
};
const pendingKey = (owner = S.user?.id) => `sea:pending:${owner}`;
let accountOwner = null, accountEpoch = 0, localLoad = 0, historyRevision = 0;
export const accountToken = () => ({ owner: S.user?.id ?? null, epoch: accountEpoch });
export const accountMatches = (token) => S.user?.id === token.owner && accountOwner === token.owner && accountEpoch === token.epoch;
class AccountChanged extends Error { constructor() { super('Le compte a changé ; cette réponse a été ignorée.'); } }
function checkAccount(token) { if (!accountMatches(token)) throw new AccountChanged(); }
/** Ne garde en mémoire aucun brouillon ou donnée privée d'un autre compte. Les caches restent sous leur propre clé. */
function ensureAccount() {
  const owner = S.user?.id ?? null;
  if (owner === accountOwner) return;
  const previousOwner = accountOwner;
  if (pendingPersist) { const pending = pendingPersist; pendingPersist = null; clearTimeout(persistT); void storeSnapshot(pending.owner, pending.snap); }
  clearTimeout(syncT); clearTimeout(retryT);
  accountOwner = owner; accountEpoch++; localLoad++;
  Object.assign(S, initialAccountState());
  // Ces fenêtres sont hors de #app : le rendu de connexion ne les remplace pas.
  if (typeof document !== 'undefined') {
    document.querySelector('#dialog [data-dlg="0"]')?.click();
    for (const selector of ['#sheet', '#dialog', '#player', '#grp']) { const panel = document.querySelector(selector); if (panel) { panel.classList.remove('open'); panel.replaceChildren(); } }
    const message = document.querySelector('#toast'); if (message) { message.className = ''; message.replaceChildren(); }
    document.body?.classList.remove('grp-open', 'noscroll');
  }
  for (const name of ('lastOpenSeance lastOpenSeanceOwner clientStamp returnTo lastLoop lay setup ai goalDraft goalBack gDraft command cmdRaw cmdOptions quickDraft agendaDraft agendaEdit adapt importResult importText merge sharedDraft swapFor pickSrc sel cp cpAiBusy cpAiDraft cpEdit cpSheet cpStrats cpModAt cpRuleUnder cpRuleOver chat chatOwner chatBusy chatDraft coachStatus studio inbox notifUnread myBugs bugFrom propCur propDraft ideaDraft textDraft textMode admAct group duo aq aqEnvPreset carnet pj pjWish gym gymEnv cprog progRun recap eg forme autoWeek bilan sysEdit aqEnvPreset boardEdit boardPb comp imp csv connections lp pl pace rmPick reportAt photoSel photoShow photoFilter photoPose sfilter tfmt').split(' ')) S[name] = null;
  // Au premier démarrage, parseHash a déjà lu l'identifiant d'un éventuel lien profond.
  if (previousOwner !== null) S.param = '';
  bump();
}
/** Écrit immédiatement (synchrone) tout ce qui n'est pas encore sur le serveur. */
export function writePending() {
  if (!S.user) return;
  const ok = ls.set(pendingKey(), { v: 1, outbox: S.outbox, failed: S.failed.slice(-100), conflicts: S.conflicts.slice(0, 50), dirtyItems: [...S.dirtyItems].map((k) => S.items.get(k)).filter(Boolean), seances: S.seancesDirty ? S.seances : null });
  if (!ok) toast('Stockage de l’appareil plein : synchronise ou exporte tes données (Paramètres).', 5000, 'bad');
}
function snapshot() {
  return { v: 2, seances: S.seances, history: S.history.slice(0, 1500), events: S.events, settings: S.settings, personal: S.personal, commonEx: S.commonEx, items: [...S.items.values()], itemsCursor: S.itemsCursor, lastSync: S.lastSync };
}
let persistT = null, pendingPersist = null;
const copySnapshot = () => JSON.parse(JSON.stringify(snapshot()));
export function persist() {
  if (!S.user) return;
  clearTimeout(persistT);
  // Figer aussi les données : une connexion différente peut intervenir avant les 250 ms.
  pendingPersist = { owner: S.user.id, snap: copySnapshot() };
  persistT = setTimeout(() => { const pending = pendingPersist; pendingPersist = null; if (pending) void storeSnapshot(pending.owner, pending.snap); }, 250);
}
async function storeSnapshot(id, snap) {
  try { await idb.set(`data:${id}`, snap); ls.del('sea:data:' + id); }
  catch { if (!ls.set('sea:data:' + id, snap)) toast('Impossible d’enregistrer sur cet appareil (stockage plein ou bloqué).', 5000, 'bad'); }
}
export async function persistNow() {
  if (!S.user) return;
  clearTimeout(persistT); pendingPersist = null;
  await storeSnapshot(S.user.id, copySnapshot()); // écriture explicite : conserve aussi le transfert voulu du mode invité
}
export async function loadLocal() {
  ensureAccount();
  if (!S.user) return false;
  const token = accountToken(), request = ++localLoad, owner = token.owner;
  let d = null;
  try { d = await idb.get(`data:${owner}`); } catch { /* repli */ }
  if (!accountMatches(token) || request !== localLoad) return false;
  if (!d) d = ls.get('sea:data:' + owner, null) || migrateV7Local(owner);
  if (d) {
    S.seances = { items: (d.seances?.items || []).map(normalizeSession), tomb: d.seances?.tomb || {} };
    S.history = (Array.isArray(d.history) ? d.history : []).map(normalizeHistory).filter(Boolean); S.events = (Array.isArray(d.events) ? d.events : []).filter((e) => e && typeof e === 'object'); S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    S.personal = d.personal || []; S.commonEx = d.commonEx || [];
    S.items = new Map((d.items || []).map((it) => [itemKey(it.c, it.id), it]));
    S.itemsCursor = d.itemsCursor || 0; S.lastSync = d.lastSync || 0;
  }
  const p = ls.get(pendingKey(owner), null);
  if (p) {
    S.outbox = Array.isArray(p.outbox) ? p.outbox : [];
    S.failed = Array.isArray(p.failed) ? p.failed : [];
    S.conflicts = Array.isArray(p.conflicts) ? p.conflicts : [];
    for (const it of p.dirtyItems || []) { const k = itemKey(it.c, it.id), cur = S.items.get(k); if (!cur || it.u >= cur.u) { S.items.set(k, it); S.dirtyItems.add(k); } }
    if (p.seances) { S.seances = mergeSeances(S.seances, { items: p.seances.items.map(normalizeSession), tomb: p.seances.tomb || {} }); S.seancesDirty = true; }
  }
  // Le cache complet peut être plus ancien de 250 ms que la file synchrone.
  // Rejouer les intentions locales avant tout affichage, sans les renvoyer ni créer de nouvelle opération.
  const historyById = new Map(S.history.map((x) => [x.id, x]));
  const eventsById = new Map(S.events.map((x) => [x.id, x]));
  for (const op of [...S.failed, ...S.outbox]) {
    if (op.method === 'POST' && op.path === '/api/history' && op.body?.id) { const h = normalizeHistory(op.body); if (h) historyById.set(h.id, h); }
    if (op.method === 'DELETE' && op.path.startsWith('/api/history/')) historyById.delete(decodeURIComponent(op.path.slice('/api/history/'.length)));
    if (op.method === 'POST' && op.path === '/api/calendar' && op.body?.id) eventsById.set(op.body.id, op.body);
    if (op.method === 'DELETE' && op.path.startsWith('/api/calendar/')) eventsById.delete(decodeURIComponent(op.path.slice('/api/calendar/'.length)));
    if (op.method === 'POST' && op.path === '/api/settings' && op.body?.settings) S.settings = { ...S.settings, ...op.body.settings };
  }
  S.history = [...historyById.values()].sort((a,b) => b.startedAt-a.startedAt);
  S.events = [...eventsById.values()];
  S.loaded = true; bump();
  return !!d;
}
/** Anciennes données locales v7 (localStorage « sea:data:<id> » au format v1) : reprises sans perte. */
function migrateV7Local(owner) {
  const d = ls.get('sea:data:' + owner, null);
  if (!d) return null;
  if (Array.isArray(d.outbox) && d.outbox.length) ls.set(pendingKey(owner), { v: 1, outbox: d.outbox.map((o) => ({ ...o, opId: o.opId || newOpId() })), failed: d.failedOutbox || [], dirtyItems: [], seances: null });
  return { ...d, commonEx: d.common || [] };
}
/** Efface de cet appareil tout ce qui appartient à un compte : données, opérations en attente, photos de progrès et
 * réglages locaux (« …:<id> »). Utilisé à la suppression du compte, à la fin d'une démo et après le passage invité → compte. */
export async function clearLocal(userId) {
  const id = String(userId || ''); if (!id) return;
  try { for (const k of await idb.keys()) if (k === `data:${id}` || k === `photos:${id}` || k.startsWith(`photos:${id}:`)) await idb.del(k); }
  catch { try { await idb.del(`data:${id}`); } catch { /* rien */ } }
  ls.del(`sea:pending:${id}`); ls.del('sea:data:' + id);
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('sea:') && k.endsWith(':' + id)) localStorage.removeItem(k); } } catch { /* rien */ }
}
/** Invité qui crée son compte : ses photos de progrès et ses réglages locaux (gardés seulement sur cet appareil) le
 * suivent. Les données et les opérations en attente passent par transferGuest (app.js). */
export async function moveLocal(from, to) {
  if (!from || !to || from === to) return;
  try {
    const keys = (await idb.keys()).filter((k) => k === `photos:${from}` || k.startsWith(`photos:${from}:`));
    for (const k of keys) { const v = await idb.get(k); if (v != null) await idb.set(`photos:${to}${k.slice(`photos:${from}`.length)}`, v); }
  } catch { /* stockage indisponible : les photos restent sous l'invité */ }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith('sea:') || !k.endsWith(':' + from) || /^sea:(data|pending):/.test(k)) continue;
      const nk = k.slice(0, -from.length) + to; if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
    }
  } catch { /* rien */ }
}

/* ═════════ Réseau ═════════ */
let onExpired = () => {};
export const setOnExpired = (fn) => { onExpired = fn; };
export async function api(method, path, body, opts = {}) {
  const requestOwner = S.user?.id ?? null, requestEpoch = accountEpoch;
  if (S.user?.guest && !opts.guestOk) { const e = new Error('Mode invité : crée un compte gratuit (en haut des Paramètres : « Créer mon compte ») pour utiliser cette fonction. Tes données d’invité seront conservées.'); e.guest = true; throw e; }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeout || 20000) : null;
  let res;
  try {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.opId) headers['X-Op-Id'] = opts.opId;
    res = await fetch(path, { method, credentials: 'same-origin', headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl?.signal });
  } catch { const e = new Error('Pas de connexion au serveur.'); e.offline = true; throw e; }
  finally { if (timer) clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* pas de JSON */ }
  if (res.status === 401 && !opts.quiet401 && (S.user?.id ?? null) === requestOwner && accountEpoch === requestEpoch) onExpired();
  if (!res.ok) { const e = new Error(data?.error || `Erreur ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data || {};
}

/* ═════════ File d'attente ═════════ */
let syncT = null, retryT = null;
export function syncSoon(ms = 900) { const token = accountToken(); clearTimeout(syncT); syncT = setTimeout(() => { if (accountMatches(token)) syncAll(); }, ms); }
export function queue(method, path, body, { coalesce = false } = {}) {
  if (coalesce) S.outbox = S.outbox.filter((o, i) => !(i > 0 && o.method === method && o.path === path)); // la dernière version remplace les précédentes non envoyées
  S.outbox.push({ opId: newOpId(), method, path, body, attempts: 0, at: Date.now(), label: describeOp({ method, path }) });
  writePending(); persist(); bump(); syncSoon();
}
class Pause extends Error {}
async function flush(token) {
  while (S.outbox.length) {
    checkAccount(token);
    const op = S.outbox[0];
    if (op.nextAt && op.nextAt > Date.now()) { clearTimeout(retryT); retryT = setTimeout(() => syncAll(), op.nextAt - Date.now() + 50); throw new Pause('attente'); }
    try {
      await api(op.method, op.path, op.body, { opId: op.opId });
      checkAccount(token);
      S.outbox = S.outbox.filter((pending) => pending !== op); writePending();
    } catch (e) {
      checkAccount(token);
      if (!S.outbox.includes(op)) continue; // Une déconnexion peut avoir supprimé cet import pendant son envoi.
      const d = decideOutboxError(op, e);
      op.lastError = e.message;
      if (d.action === 'retry-later') { op.attempts = d.attempts; op.nextAt = Date.now() + (d.delay || 0); writePending(); if (d.delay) { clearTimeout(retryT); retryT = setTimeout(() => syncAll(), d.delay + 50); } throw e; }
      if (d.action === 'pause-auth') throw e;
      S.failed.push({ ...op, error: d.reason, status: e.status || 0, failedAt: Date.now() });
      S.outbox = S.outbox.filter((pending) => pending !== op); writePending();
      toast(d.action === 'drop-poisoned' ? `Action mise de côté après des erreurs serveur répétées : ${op.label}. Voir Paramètres › Synchronisation.` : `Action refusée par le serveur (${op.label}) : ${d.reason}. Voir Paramètres › Synchronisation.`, 6000, 'bad');
    }
  }
}
export function retryFailed(opId) {
  const i = S.failed.findIndex((f) => f.opId === opId); if (i < 0) return;
  const [f] = S.failed.splice(i, 1);
  if (f.kind === 'item' && f.item) { putRaw(f.item); } else S.outbox.push({ opId: newOpId(), method: f.method, path: f.path, body: f.body, attempts: 0, at: Date.now(), label: f.label });
  writePending(); bump(); syncSoon(100);
}
export function discardFailed(opId) { S.failed = S.failed.filter((f) => f.opId !== opId); writePending(); bump(); }

/* ═════════ Données structurées (items) ═════════ */
export function putItem(c, id, d) {
  const k = itemKey(c, id), prev = S.items.get(k);
  const it = cleanItem({ c, id, d, u: Math.max(Date.now(), (prev?.u || 0) + 1) });
  if (!it) throw new Error('Donnée invalide.');
  S.items.set(k, it); S.dirtyItems.add(k);
  writePending(); persist(); bump(); syncSoon();
  return { id, ...it.d };
}
function putRaw(it) { const k = itemKey(it.c, it.id), prev = S.items.get(k); const x = cleanItem({ ...it, u: Math.max(Date.now(), (prev?.u || 0) + 1) }); if (x) { S.items.set(k, x); S.dirtyItems.add(k); } }
export function delItem(c, id) {
  const k = itemKey(c, id), prev = S.items.get(k);
  if (!prev) return;
  S.items.set(k, { c, id, u: Math.max(Date.now(), prev.u + 1), del: true, d: {} });
  S.dirtyItems.add(k); writePending(); persist(); bump(); syncSoon();
}
export const item = (c, id) => { const it = S.items.get(itemKey(c, id)); return it && !it.del ? { id, ...it.d } : null; };
export const itemsOf = (c) => [...S.items.values()].filter((it) => it.c === c && !it.del).map((it) => ({ id: it.id, ...it.d, _u: it.u }));
export function restoreConflict(i) {
  const c = S.conflicts[i]; if (!c) return;
  putRaw(c.local); S.conflicts.splice(i, 1); writePending(); bump(); syncSoon(100);
}
async function syncItems(token) {
  checkAccount(token);
  const dirty = [...S.dirtyItems].map((k) => S.items.get(k)).filter(Boolean);
  // Envois de 200 éléments au plus et d'environ 600 Ko au plus (les photos de voies sont plus lourdes).
  const chunks = []; let cur = [], size = 0;
  for (const x of dirty) { const n = JSON.stringify(x).length; if (cur.length && (cur.length >= 200 || size + n > 600000)) { chunks.push(cur); cur = []; size = 0; } cur.push({ ...x }); size += n; }
  if (cur.length) chunks.push(cur);
  for (const chunk of chunks) {
    checkAccount(token);
    const r = await api('POST', '/api/items', { changes: chunk });
    checkAccount(token);
    for (const a of r.applied || []) { const k = itemKey(a.c, a.id), cur = S.items.get(k); if (cur && cur.u === a.u) S.dirtyItems.delete(k); }
    for (const c of r.conflicts || []) {
      const k = itemKey(c.c, c.id), sent = chunk.find((x) => x.c === c.c && x.id === c.id), cur = S.items.get(k);
      if (cur && sent && cur.u === sent.u) { S.conflicts.unshift({ key: k, local: sent, server: c.server, at: Date.now() }); S.items.set(k, c.server); S.dirtyItems.delete(k); }
    }
    for (const rj of r.rejected || []) {
      const k = itemKey(rj.c, rj.id); S.dirtyItems.delete(k);
      S.failed.push({ opId: 'item-' + k + '-' + Date.now(), kind: 'item', label: `Donnée « ${rj.c} » refusée`, error: rj.error, item: S.items.get(k), failedAt: Date.now() });
      toast(`Une donnée a été refusée par le serveur : ${rj.error}`, 5000, 'bad');
    }
    writePending();
  }
  let since = S.itemsCursor, r;
  do {
    checkAccount(token);
    r = await api('GET', '/api/items?since=' + since);
    checkAccount(token);
    for (const it of r.items || []) {
      const k = itemKey(it.c, it.id), cur = S.items.get(k);
      if (S.dirtyItems.has(k) && cur && cur.u >= it.u) continue; // modification locale plus récente, envoyée au prochain passage
      if (S.dirtyItems.has(k) && cur && cur.u < it.u) { S.conflicts.unshift({ key: k, local: cur, server: it, at: Date.now() }); S.dirtyItems.delete(k); }
      S.items.set(k, it);
    }
    since = r.last ?? since;
  } while (r.more);
  S.itemsCursor = Math.max(0, (r.now || Date.now()) - 120000); // chevauchement de 2 min : aucune écriture concurrente manquée
  S.conflicts = S.conflicts.slice(0, 50);
}

/* ═════════ Séances, historique, calendrier, réglages ═════════ */
export const getSeance = (id) => S.seances.items.find((s) => s.id === id);
export function saveSeance(s) {
  s = normalizeSession({ ...s, updatedAt: Math.max(Date.now(), (getSeance(s.id)?.updatedAt || 0) + 1), createdAt: s.createdAt || Date.now() });
  const i = S.seances.items.findIndex((x) => x.id === s.id);
  if (i >= 0) S.seances.items[i] = s; else S.seances.items.unshift(s);
  delete S.seances.tomb[s.id];
  S.seancesDirty = true; S.seancesVer++;
  writePending(); persist(); bump(); syncSoon();
  return s;
}
export function deleteSeance(id) {
  S.seances.items = S.seances.items.filter((s) => s.id !== id); S.seances.tomb[id] = Date.now();
  S.seancesDirty = true; S.seancesVer++; writePending(); persist(); bump(); syncSoon();
}
async function syncSeances(token) {
  checkAccount(token);
  const ver = S.seancesVer;
  const r = await api('POST', '/api/sync', { items: S.seances.items, tomb: S.seances.tomb });
  checkAccount(token);
  S.seances = mergeSeances(S.seances, { items: r.items.map(normalizeSession), tomb: r.tomb });
  if (S.seancesVer === ver) S.seancesDirty = false;
  writePending();
}
/** Invalide les lectures commencées avant un ajout direct ou une suppression distante. */
export function historyChanged() { historyRevision++; localLoad++; if (S.syncing) S.syncAgain = true; }
export function purgeExternalHistory(provider) {
  const removed = new Set(S.history.filter((entry) => externalProvider(entry) === provider).map((entry) => entry.id));
  const related = (op) => externalProvider(op.body) === provider || removed.has(op.body?.id) || (op.path?.startsWith('/api/history/') && removed.has(decodeURIComponent(op.path.slice('/api/history/'.length))));
  S.history = S.history.filter((entry) => externalProvider(entry) !== provider);
  S.outbox = S.outbox.filter((op) => !related(op)); S.failed = S.failed.filter((op) => !related(op));
  S.conflicts = S.conflicts.filter((op) => !related(op) && externalProvider(op.local) !== provider);
  if (S.imp?.source === provider) S.imp = null;
  historyChanged(); writePending(); bump(); persist(); syncSoon(100);
}
export function addHistory(entry) { S.history.unshift(entry); S.history.sort((a, b) => b.startedAt - a.startedAt); queue('POST', '/api/history', entry); }
export function updateHistory(entry) { const i = S.history.findIndex((x) => x.id === entry.id); if (i >= 0) S.history[i] = entry; queue('POST', '/api/history', entry); }
export function deleteHistory(id) { S.history = S.history.filter((x) => x.id !== id); queue('DELETE', `/api/history/${encodeURIComponent(id)}`); }
export function saveEvent(ev) { const previous = S.events.find((e) => e.id === ev.id); ev = { ...ev, meta: { ...ev.meta, version: Math.max(Date.now(), (previous?.meta?.version || 0) + 1) } }; const i = S.events.findIndex((x) => x.id === ev.id); if (i >= 0) S.events[i] = ev; else S.events.push(ev); queue('POST', '/api/calendar', ev); }
export function deleteEvent(id) { S.events = S.events.filter((x) => x.id !== id); queue('DELETE', `/api/calendar/${encodeURIComponent(id)}`); }
export function saveSettings() { persist(); queue('POST', '/api/settings', { settings: S.settings }, { coalesce: true }); }
const pendingBodies = (path, method = 'POST') => S.outbox.filter((o) => o.method === method && o.path === path).map((o) => o.body);
function pendingDeletes(prefix) { return new Set(S.outbox.filter((o) => o.method === 'DELETE' && o.path.startsWith(prefix)).map((o) => decodeURIComponent(o.path.slice(prefix.length)))); }

/* ═════════ Synchronisation complète ═════════ */
let setSyncUI = () => {};
export const setSyncListener = (fn) => { setSyncUI = fn; };
function setSync(s) { S.sync = s; setSyncUI(s); }
export async function syncAll() {
  ensureAccount();
  if (!S.user) return;
  if (S.user.guest) { setSync('guest'); return; } // invité : tout reste sur l'appareil ; envoyé si un compte est créé
  if (S.syncing) { S.syncAgain = true; return; }
  if (!navigator.onLine) { setSync('offline'); return; }
  const token = accountToken();
  S.syncing = true; setSync('sync');
  try {
    await flush(token); checkAccount(token);
    await syncItems(token); checkAccount(token);
    await syncSeances(token); checkAccount(token);
    const readRevision = historyRevision;
    const [hist, cal, set, ex] = await Promise.all([api('GET', '/api/history'), api('GET', '/api/calendar'), api('GET', '/api/settings'), api('GET', '/api/exercises')]);
    checkAccount(token);
    // Le serveur fait foi, sauf pour ce qui attend encore dans la file (visible localement, jamais effacé en silence).
    const localPendingH = pendingBodies('/api/history'), delH = pendingDeletes('/api/history/');
    const failedH = S.failed.filter((f) => f.path === '/api/history' && f.method === 'POST').map((f) => ({ ...f.body, _failed: true }));
    const byId = new Map(hist.history.filter((x) => !delH.has(x.id)).map((x) => [x.id, x]));
    for (const x of [...localPendingH, ...failedH]) if (x?.id) byId.set(x.id, x);
    if (readRevision === historyRevision) S.history = [...byId.values()].map(normalizeHistory).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
    else S.syncAgain = true;
    const localPendingE = pendingBodies('/api/calendar'), delE = pendingDeletes('/api/calendar/');
    const byE = new Map(cal.events.filter((x) => !delE.has(x.id)).map((x) => [x.id, x]));
    for (const x of localPendingE) if (x?.id) byE.set(x.id, x);
    S.events = [...byE.values()];
    if (!S.outbox.some((o) => o.path === '/api/settings')) S.settings = { ...DEFAULT_SETTINGS, ...set.settings };
    S.personal = ex.personal; S.commonEx = ex.common;
    S.lastSync = Date.now(); S.lastError = '';
    setSync(S.outbox.length || S.dirtyItems.size || S.seancesDirty ? 'pending' : 'ok');
  } catch (e) {
    if (!accountMatches(token)) return;
    if (e instanceof Pause) setSync('pending');
    else { S.lastError = e.message; setSync(e.offline ? 'offline' : e.status === 401 ? 'auth' : 'error'); }
  } finally {
    if (accountMatches(token)) {
      S.syncing = false; bump(); persist(); softRender();
      if (S.syncAgain) { S.syncAgain = false; syncSoon(300); }
    }
  }
}
export function pendingCount() { return S.outbox.length + S.dirtyItems.size + (S.seancesDirty ? 1 : 0); }

/* ═════════ Contexte d'analyse (mémoïsé) ═════════ */
let ctxCache = null, ctxVer = -1, ctxMin = 0;
export function ctx() {
  const minute = Math.floor(Date.now() / 60000);
  if (!ctxCache || ctxVer !== S.ver || ctxMin !== minute) {
    // Mes ajouts (« ＋ Autre… ») : nommés et utilisés partout comme les choix de l'app, pour CE compte seulement.
    registerMine([...S.items.values()].filter((it) => it.c === 'choice' && !it.del).map((it) => ({ id: it.id, ...it.d })));
    ctxCache = buildContext({ items: [...S.items.values()], history: S.history, events: S.events, seances: S.seances.items, personal: S.personal, settings: S.settings, now: Date.now(), tz: tz() });
    ctxVer = S.ver; ctxMin = minute;
  }
  return ctxCache;
}

/* ═════════ Rendu et navigation ═════════ */
let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = () => { ensureAccount(); return renderer(); };
const inField = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('#app')?.contains(a); };
export function softRender() { if (!inField() && !S.player && !document.querySelector('#sheet.open, #dialog.open')) render(); }
export function go(tab, sub, param = '') {
  if (tab === 'settings' && sub === 'bug' && !(S.tab === 'settings' && S.sub.settings === 'bug')) S.bugFrom = { owner: S.user?.id, page: `${S.tab}/${S.sub[S.tab] || ''}` };
  if (sub) S.sub[tab] = sub;
  const hash = `#/${tab}/${sub || S.sub[tab] || ''}${param ? '/' + encodeURIComponent(param) : ''}`;
  if (location.hash === hash) { S.tab = tab; S.param = param; render(); }
  else location.hash = hash;
}
/** Un lien mal encodé (« % » seul…) ne bloque jamais le démarrage : le paramètre illisible est ignoré. */
export const safeDecode = (v) => { try { return decodeURIComponent(v); } catch { return ''; } };
export function parseHash() {
  const [, tab, sub, param] = (location.hash || '').split('/');
  if (['home', 'progress', 'library', 'profile', 'settings'].includes(tab)) { S.tab = tab; if (sub) S.sub[tab] = sub; S.param = param ? safeDecode(param) : ''; }
}
export const newId = () => uid();
export const GUEST = Object.freeze({ id: 'guest', username: 'Invité', guest: true });
