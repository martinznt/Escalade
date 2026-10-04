// tests/sync.test.mjs — client de synchronisation réel (public/state.js) branché sur le vrai worker (D1 en mémoire).
// Vérifie : écriture immédiate hors ligne, reprise après fermeture, réponse perdue sans doublon, 401 / 409 / 5xx,
// actions en échec jamais perdues, conflits d'items conservés et restaurables.
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { makeEnv, ORIGIN, Client } from './helpers.mjs';

// ── Environnement navigateur minimal ──
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { querySelector: () => null, activeElement: null, documentElement: { dataset: {} } };
globalThis.location = { hash: '' };
const env = makeEnv();
let cookie = '';
const net = { mode: 'up', lose: false, seen: [] };
globalThis.fetch = async (path, init = {}) => {
  if (net.mode === 'down') throw new TypeError('Failed to fetch');
  const headers = { ...(init.headers || {}), Origin: ORIGIN, 'CF-Connecting-IP': '10.9.9.9' };
  if (cookie) headers.Cookie = cookie();
  const res = await worker.fetch(new Request(ORIGIN + path, { method: init.method, headers, body: init.body }), env);
  net.seen.push({ path, method: init.method, replay: res.headers.get('X-Op-Replay'), status: res.status });
  if (net.lose) { net.lose = false; throw new TypeError('réponse perdue'); }
  return res;
};
const St = await import('../public/state.js');
const { S } = St;
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

const c = new Client(env);
await c.register('synchro');
const me = await c.get('/api/auth/me');
const cookieName = Object.keys(c.jar)[0];
cookie = () => `${cookieName}=${c.jar[cookieName]}`; // même session que le client de test : le navigateur simulé partage son cookie
S.user = me.data.user;
const pendingKey = `sea:pending:${S.user.id}`;
const restart = async () => { S.outbox = []; S.failed = []; S.conflicts = []; S.history = []; S.items = new Map(); S.dirtyItems = new Set(); S.seancesDirty = false; await St.loadLocal(); };
const serverHistory = async () => (await c.get('/api/history')).data.history;
const entry = (id) => ({ id, sessionName: 'Test ' + id, startedAt: Date.now() - 3600000, durationSeconds: 1200, data: { rpe: 3, exercises: [{ name: 'Pompes', sets: [{ reps: 10, done: true }] }] } });

console.log('Synchronisation client ↔ serveur');
await ok('hors ligne : l’action est écrite immédiatement dans le stockage local', async () => {
  net.mode = 'down'; navigator.onLine = false;
  St.addHistory(entry('h1'));
  const p = JSON.parse(localStorage.getItem(pendingKey));
  assert.equal(p.outbox.length, 1); assert.equal(p.outbox[0].body.id, 'h1'); assert.ok(p.outbox[0].opId);
});
await ok('fermeture puis réouverture hors ligne : rien n’est perdu', async () => {
  await restart();
  assert.equal(S.outbox.length, 1);
});
await ok('retour en ligne : envoyé une seule fois, file vidée', async () => {
  net.mode = 'up'; navigator.onLine = true;
  await St.syncAll();
  assert.equal(S.outbox.length, 0); assert.equal((await serverHistory()).filter((h) => h.id === 'h1').length, 1);
  assert.equal(S.sync, 'ok');
});
await ok('réponse perdue après succès serveur : le rejeu ne crée pas de doublon (X-Op-Id)', async () => {
  navigator.onLine = false; St.addHistory(entry('h2')); navigator.onLine = true;
  net.lose = true; await St.syncAll();
  assert.equal(S.outbox.length, 1, 'toujours en file après la perte');
  S.outbox[0].nextAt = 0; net.seen = [];
  await St.syncAll();
  assert.equal(S.outbox.length, 0);
  assert.ok(net.seen.some((x) => x.path === '/api/history' && x.method === 'POST' && x.replay === '1'), 'rejeu reconnu par le serveur');
  assert.equal((await serverHistory()).filter((h) => h.id === 'h2').length, 1);
});
await ok('refus définitif (400) : conservé dans « actions en échec », la file continue', async () => {
  navigator.onLine = false;
  St.queue('POST', '/api/history', { id: 'bad', sessionName: '', startedAt: Date.now() + 86400000 * 30 });
  St.addHistory(entry('h3'));
  navigator.onLine = true; await St.syncAll();
  assert.equal(S.outbox.length, 0); assert.equal(S.failed.length, 1); assert.ok(S.failed[0].error);
  assert.ok((await serverHistory()).some((h) => h.id === 'h3'));
  assert.ok(JSON.parse(localStorage.getItem(pendingKey)).failed.length === 1, 'échec persisté');
  St.discardFailed(S.failed[0].opId); assert.equal(S.failed.length, 0);
});
await ok('session expirée (401) : la file est mise en pause sans rien perdre', async () => {
  const saved = c.jar[cookieName]; c.jar[cookieName] = 'invalide';
  navigator.onLine = false; St.addHistory(entry('h4')); navigator.onLine = true;
  await St.syncAll();
  assert.equal(S.outbox.length, 1); assert.equal(S.sync, 'auth');
  c.jar[cookieName] = saved; await St.syncAll();
  assert.equal(S.outbox.length, 0); assert.ok((await serverHistory()).some((h) => h.id === 'h4'));
});
await ok('erreur serveur (500) : nouvel essai plus tard, compteur incrémenté', async () => {
  navigator.onLine = false; St.addHistory(entry('h5')); navigator.onLine = true;
  const rf = globalThis.fetch; globalThis.fetch = async (p, i) => (p === '/api/history' && i.method === 'POST' ? new Response('{"error":"boom"}', { status: 500 }) : rf(p, i));
  await St.syncAll();
  assert.equal(S.outbox.length, 1); assert.equal(S.outbox[0].attempts, 1); assert.ok(S.outbox[0].nextAt > Date.now());
  globalThis.fetch = rf; S.outbox[0].nextAt = 0; await St.syncAll(); assert.equal(S.outbox.length, 0);
});
await ok('items : modification concurrente conservée dans « conflits » et restaurable', async () => {
  St.putItem('goal', 'g1', { label: 'Version locale', type: 'custom' });
  const local = S.items.get('goal/g1');
  // Un autre appareil a écrit une version plus récente.
  await c.post('/api/items', { changes: [{ c: 'goal', id: 'g1', u: local.u + 5000, d: { label: 'Autre appareil', type: 'custom' } }] });
  await St.syncAll();
  assert.equal(St.item('goal', 'g1').label, 'Autre appareil');
  assert.equal(S.conflicts[0].local.d.label, 'Version locale');
  St.restoreConflict(0); await St.syncAll();
  assert.equal(St.item('goal', 'g1').label, 'Version locale');
  const srv = (await c.get('/api/items?since=0')).data.items.find((x) => x.id === 'g1');
  assert.equal(srv.d.label, 'Version locale');
});
await ok('suppression d’item hors ligne propagée au retour', async () => {
  navigator.onLine = false; St.delItem('goal', 'g1'); await restart(); navigator.onLine = true;
  await St.syncAll();
  const srv = (await c.get('/api/items?since=0')).data.items.find((x) => x.id === 'g1');
  assert.ok(!srv || srv.del);
});
await ok('séance modifiée hors ligne puis réouverture : synchronisée', async () => {
  navigator.onLine = false;
  St.saveSeance({ id: 'se1', name: 'Hors ligne', exercises: [{ name: 'Squats', mode: 'reps', sets: 3, repsMin: 8, repsMax: 10 }] });
  await restart(); assert.ok(St.getSeance('se1'));
  navigator.onLine = true; await St.syncAll();
  const r = await c.post('/api/sync', { items: [], tomb: {} });
  assert.ok(r.data.items.some((s) => s.id === 'se1'));
});

await ok('réouverture immédiate avant écriture du cache : historique, calendrier et mode restaurés depuis la file', async () => {
  navigator.onLine = false; net.mode = 'down';
  const before = store.get('sea:data:' + S.user.id);
  St.addHistory(entry('instant'));
  St.saveEvent({id:'instant-event',date:'2026-10-04',title:'Activité'});
  S.settings.interfaceMode='advanced';St.saveSettings();
  if (before === undefined) store.delete('sea:data:' + S.user.id); else store.set('sea:data:' + S.user.id,before);
  await restart();
  assert.ok(S.history.some((h)=>h.id==='instant'));
  assert.ok(S.events.some((e)=>e.id==='instant-event'));
  assert.equal(S.settings.interfaceMode,'advanced');
  St.deleteHistory('instant');St.deleteEvent('instant-event');
});
console.log(`\n${n} tests de synchronisation OK`);
process.exit(0);
