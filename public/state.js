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

import { uid, normalizeSession, mergeSeances, readStored } from './shared.js';
import { cleanItem, itemKey } from './items.js';
import { decideOutboxError, newOpId, describeOp } from './outbox.js';
import { buildContext } from './brain.js';
import { toast, tz, $ } from './ui.js';

export const APP_VERSION = '8.0.0';
export const ACT = {}, SUBMIT = {}, CHG = {}, INPUT = {};
export const DEFAULT_SETTINGS = { sound: true, vibration: true, voice: false, keepAwake: true, handsFree: false, defaultRest: 60, defaultMinutes: 30, onboarded: false, autoBase: false, avoid: {} };
export const S = {
  user: null, tab: 'home', sub: { home: 'dash', progress: 'summary', library: 'seances', profile: 'understand', settings: 'main' }, param: '',
  settings: { ...DEFAULT_SETTINGS }, seances: { items: [], tomb: {} }, seancesDirty: false, seancesVer: 0,
  history: [], events: [], personal: [], commonEx: [], items: new Map(), dirtyItems: new Set(), itemsCursor: 0,
  outbox: [], failed: [], conflicts: [], sync: 'idle', syncing: false, syncAgain: false, lastSync: 0, lastError: '', loaded: false,
  shared: { common: null, publicMine: null, detail: null, loading: false, error: '' }, admin: { bugs: null }, social: { me: null, feed: null, error: '' }, myBugs: null,
  gen: { activityId: '', mode: 'weaknesses', goalId: '', minutes: 30, intentions: [], envId: '', light: false, priorities: {}, plan: null, result: null, saved: false },
  player: null, ver: 0, authMode: 'login', authError: '', prefill: '', search: { q: '', smart: true }, cal: null, filters: {},
};
export const bump = () => { S.ver++; };

/* ═════════ Stockage ═════════ */
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* rien */ } },
};
export { ls };
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
};
const dataKey = () => `data:${S.user?.id}`;
const pendingKey = () => `sea:pending:${S.user?.id}`;
/** Écrit immédiatement (synchrone) tout ce qui n'est pas encore sur le serveur. */
export function writePending() {
  if (!S.user) return;
  const ok = ls.set(pendingKey(), { v: 1, outbox: S.outbox, failed: S.failed.slice(-100), conflicts: S.conflicts.slice(0, 50), dirtyItems: [...S.dirtyItems].map((k) => S.items.get(k)).filter(Boolean), seances: S.seancesDirty ? S.seances : null });
  if (!ok) toast('Stockage de l’appareil plein : synchronise ou exporte tes données (Paramètres).', 5000, 'bad');
}
function snapshot() {
  return { v: 2, seances: S.seances, history: S.history.slice(0, 1500), events: S.events, settings: S.settings, personal: S.personal, commonEx: S.commonEx, items: [...S.items.values()], itemsCursor: S.itemsCursor, lastSync: S.lastSync };
}
let persistT = null;
export function persist() { clearTimeout(persistT); persistT = setTimeout(() => persistNow(), 250); }
export async function persistNow() {
  if (!S.user) return;
  clearTimeout(persistT);
  const snap = snapshot();
  try { await idb.set(dataKey(), snap); ls.del('sea:data:' + S.user.id); }
  catch { if (!ls.set('sea:data:' + S.user.id, snap)) toast('Impossible d’enregistrer sur cet appareil (stockage plein ou bloqué).', 5000, 'bad'); }
}
export async function loadLocal() {
  let d = null;
  try { d = await idb.get(dataKey()); } catch { /* repli */ }
  if (!d) d = ls.get('sea:data:' + S.user.id, null) || migrateV7Local();
  if (d) {
    S.seances = { items: (d.seances?.items || []).map(normalizeSession), tomb: d.seances?.tomb || {} };
    S.history = d.history || []; S.events = d.events || []; S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    S.personal = d.personal || []; S.commonEx = d.commonEx || [];
    S.items = new Map((d.items || []).map((it) => [itemKey(it.c, it.id), it]));
    S.itemsCursor = d.itemsCursor || 0; S.lastSync = d.lastSync || 0;
  }
  const p = ls.get(pendingKey(), null);
  if (p) {
    S.outbox = Array.isArray(p.outbox) ? p.outbox : [];
    S.failed = Array.isArray(p.failed) ? p.failed : [];
    S.conflicts = Array.isArray(p.conflicts) ? p.conflicts : [];
    for (const it of p.dirtyItems || []) { const k = itemKey(it.c, it.id), cur = S.items.get(k); if (!cur || it.u >= cur.u) { S.items.set(k, it); S.dirtyItems.add(k); } }
    if (p.seances) { S.seances = mergeSeances(S.seances, { items: p.seances.items.map(normalizeSession), tomb: p.seances.tomb || {} }); S.seancesDirty = true; }
  }
  S.loaded = true; bump();
  return !!d;
}
/** Anciennes données locales v7 (localStorage « sea:data:<id> » au format v1) : reprises sans perte. */
function migrateV7Local() {
  const d = ls.get('sea:data:' + S.user.id, null);
  if (!d) return null;
  if (Array.isArray(d.outbox) && d.outbox.length) ls.set(pendingKey(), { v: 1, outbox: d.outbox.map((o) => ({ ...o, opId: o.opId || newOpId() })), failed: d.failedOutbox || [], dirtyItems: [], seances: null });
  return { ...d, commonEx: d.common || [] };
}
export async function clearLocal(userId) { try { await idb.del(`data:${userId}`); } catch { /* rien */ } ls.del(`sea:pending:${userId}`); ls.del('sea:data:' + userId); }

/* ═════════ Réseau ═════════ */
let onExpired = () => {};
export const setOnExpired = (fn) => { onExpired = fn; };
export async function api(method, path, body, opts = {}) {
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
  if (res.status === 401 && !opts.quiet401) onExpired();
  if (!res.ok) { const e = new Error(data?.error || `Erreur ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data || {};
}

/* ═════════ File d'attente ═════════ */
let syncT = null, retryT = null;
export function syncSoon(ms = 900) { clearTimeout(syncT); syncT = setTimeout(() => syncAll(), ms); }
export function queue(method, path, body, { coalesce = false } = {}) {
  if (coalesce) S.outbox = S.outbox.filter((o, i) => !(i > 0 && o.method === method && o.path === path)); // la dernière version remplace les précédentes non envoyées
  S.outbox.push({ opId: newOpId(), method, path, body, attempts: 0, at: Date.now(), label: describeOp({ method, path }) });
  writePending(); persist(); bump(); syncSoon();
}
class Pause extends Error {}
async function flush() {
  while (S.outbox.length) {
    const op = S.outbox[0];
    if (op.nextAt && op.nextAt > Date.now()) { clearTimeout(retryT); retryT = setTimeout(() => syncAll(), op.nextAt - Date.now() + 50); throw new Pause('attente'); }
    try {
      await api(op.method, op.path, op.body, { opId: op.opId });
      S.outbox.shift(); writePending();
    } catch (e) {
      const d = decideOutboxError(op, e);
      op.lastError = e.message;
      if (d.action === 'retry-later') { op.attempts = d.attempts; op.nextAt = Date.now() + (d.delay || 0); writePending(); if (d.delay) { clearTimeout(retryT); retryT = setTimeout(() => syncAll(), d.delay + 50); } throw e; }
      if (d.action === 'pause-auth') throw e;
      S.failed.push({ ...op, error: d.reason, status: e.status || 0, failedAt: Date.now() });
      S.outbox.shift(); writePending();
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
async function syncItems() {
  const dirty = [...S.dirtyItems].map((k) => S.items.get(k)).filter(Boolean);
  for (let i = 0; i < dirty.length; i += 200) {
    const chunk = dirty.slice(i, i + 200).map((x) => ({ ...x }));
    const r = await api('POST', '/api/items', { changes: chunk });
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
    r = await api('GET', '/api/items?since=' + since);
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
async function syncSeances() {
  const ver = S.seancesVer;
  const r = await api('POST', '/api/sync', { items: S.seances.items, tomb: S.seances.tomb });
  S.seances = mergeSeances(S.seances, { items: r.items.map(normalizeSession), tomb: r.tomb });
  if (S.seancesVer === ver) S.seancesDirty = false;
  writePending();
}
export function addHistory(entry) { S.history.unshift(entry); S.history.sort((a, b) => b.startedAt - a.startedAt); queue('POST', '/api/history', entry); }
export function updateHistory(entry) { const i = S.history.findIndex((x) => x.id === entry.id); if (i >= 0) S.history[i] = entry; queue('POST', '/api/history', entry); }
export function deleteHistory(id) { S.history = S.history.filter((x) => x.id !== id); queue('DELETE', `/api/history/${encodeURIComponent(id)}`); }
export function saveEvent(ev) { const i = S.events.findIndex((x) => x.id === ev.id); if (i >= 0) S.events[i] = ev; else S.events.push(ev); queue('POST', '/api/calendar', ev); }
export function deleteEvent(id) { S.events = S.events.filter((x) => x.id !== id); queue('DELETE', `/api/calendar/${encodeURIComponent(id)}`); }
export function saveSettings() { persist(); queue('POST', '/api/settings', { settings: S.settings }, { coalesce: true }); }
const pendingBodies = (path, method = 'POST') => S.outbox.filter((o) => o.method === method && o.path === path).map((o) => o.body);
function pendingDeletes(prefix) { return new Set(S.outbox.filter((o) => o.method === 'DELETE' && o.path.startsWith(prefix)).map((o) => decodeURIComponent(o.path.slice(prefix.length)))); }

/* ═════════ Synchronisation complète ═════════ */
let setSyncUI = () => {};
export const setSyncListener = (fn) => { setSyncUI = fn; };
function setSync(s) { S.sync = s; setSyncUI(s); }
export async function syncAll() {
  if (!S.user) return;
  if (S.syncing) { S.syncAgain = true; return; }
  if (!navigator.onLine) { setSync('offline'); return; }
  S.syncing = true; setSync('sync');
  try {
    await flush();
    await syncItems();
    await syncSeances();
    const [hist, cal, set, ex] = await Promise.all([api('GET', '/api/history'), api('GET', '/api/calendar'), api('GET', '/api/settings'), api('GET', '/api/exercises')]);
    // Le serveur fait foi, sauf pour ce qui attend encore dans la file (visible localement, jamais effacé en silence).
    const localPendingH = pendingBodies('/api/history'), delH = pendingDeletes('/api/history/');
    const failedH = S.failed.filter((f) => f.path === '/api/history' && f.method === 'POST').map((f) => ({ ...f.body, _failed: true }));
    const byId = new Map(hist.history.filter((x) => !delH.has(x.id)).map((x) => [x.id, x]));
    for (const x of [...localPendingH, ...failedH]) if (x?.id) byId.set(x.id, x);
    S.history = [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
    const localPendingE = pendingBodies('/api/calendar'), delE = pendingDeletes('/api/calendar/');
    const byE = new Map(cal.events.filter((x) => !delE.has(x.id)).map((x) => [x.id, x]));
    for (const x of localPendingE) if (x?.id) byE.set(x.id, x);
    S.events = [...byE.values()];
    if (!S.outbox.some((o) => o.path === '/api/settings')) S.settings = { ...DEFAULT_SETTINGS, ...set.settings };
    S.personal = ex.personal; S.commonEx = ex.common;
    S.lastSync = Date.now(); S.lastError = '';
    setSync(S.outbox.length || S.dirtyItems.size || S.seancesDirty ? 'pending' : 'ok');
  } catch (e) {
    if (e instanceof Pause) setSync('pending');
    else { S.lastError = e.message; setSync(e.offline ? 'offline' : e.status === 401 ? 'auth' : 'error'); }
  } finally {
    S.syncing = false; bump(); persist(); softRender();
    if (S.syncAgain) { S.syncAgain = false; syncSoon(300); }
  }
}
export function pendingCount() { return S.outbox.length + S.dirtyItems.size + (S.seancesDirty ? 1 : 0); }

/* ═════════ Contexte d'analyse (mémoïsé) ═════════ */
let ctxCache = null, ctxVer = -1, ctxMin = 0;
export function ctx() {
  const minute = Math.floor(Date.now() / 60000);
  if (!ctxCache || ctxVer !== S.ver || ctxMin !== minute) {
    ctxCache = buildContext({ items: [...S.items.values()], history: S.history, events: S.events, seances: S.seances.items, personal: S.personal, settings: S.settings, now: Date.now(), tz: tz() });
    ctxVer = S.ver; ctxMin = minute;
  }
  return ctxCache;
}

/* ═════════ Rendu et navigation ═════════ */
let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = () => renderer();
const inField = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('#app')?.contains(a); };
export function softRender() { if (!inField() && !S.player && !document.querySelector('#sheet.open, #dialog.open')) render(); }
export function go(tab, sub, param = '') {
  if (sub) S.sub[tab] = sub;
  const hash = `#/${tab}/${sub || S.sub[tab] || ''}${param ? '/' + encodeURIComponent(param) : ''}`;
  if (location.hash === hash) { S.tab = tab; S.param = param; render(); }
  else location.hash = hash;
}
export function parseHash() {
  const [, tab, sub, param] = (location.hash || '').split('/');
  if (['home', 'progress', 'library', 'profile', 'settings'].includes(tab)) { S.tab = tab; if (sub) S.sub[tab] = sub; S.param = param ? decodeURIComponent(param) : ''; }
}
export const newId = () => uid();
