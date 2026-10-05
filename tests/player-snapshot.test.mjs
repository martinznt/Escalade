// La reprise d'une séance appartient au compte qui l'a commencée, y compris après une réponse différée.
import assert from 'node:assert/strict';
import { snapshot, canResume, playerSnapshotKey } from '../public/live.js';

const stored = new Map();
globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v), removeItem: (k) => stored.delete(k) };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
function element() {
  const classes = new Set(), listeners = new Map();
  return { innerHTML: '', textContent: '', value: '', style: {}, listeners, classList: { add: (...c) => c.forEach((v) => classes.add(v)), remove: (...c) => c.forEach((v) => classes.delete(v)), contains: (v) => classes.has(v), toggle: (v) => classes.has(v) ? classes.delete(v) : classes.add(v) }, addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: (k, fn) => { if (listeners.get(k) === fn) listeners.delete(k); }, focus() {}, select() {}, click() {}, replaceChildren() { this.innerHTML = ''; }, querySelector: (sel) => node(sel) };
}
const nodes = new Map();
const node = (sel) => { if (!nodes.has(sel)) nodes.set(sel, element()); return nodes.get(sel); };
globalThis.document = { querySelector: node, querySelectorAll: () => [], documentElement: { dataset: {} }, body: element(), addEventListener() {}, hidden: false };
globalThis.window = globalThis; globalThis.location = { origin: 'https://example.test', hash: '', pathname: '/' };
const { S, ACT } = await import('../public/state.js');
const { startPlayer, resumeCard, closePlayer, tick } = await import('../public/player.js');
S.settings = { ...S.settings, sound: false, vibration: false, voice: false, autoWarm: false, autoBase: false, handsFree: false, keepAwake: false };
const a = { id: 'account-A', username: 'A' }, b = { id: 'account-B', username: 'B' };
const session = { id: 'private-A', name: 'Séance privée de A', exercises: [{ id: 'pompes', name: 'Pompes', sets: 2, repsMin: 8, repsMax: 8, rest: 0 }, { id: 'gainage', name: 'Gainage', mode: 'time', sets: 1, secMin: 30, secMax: 30, rest: 0 }] };
const read = (key) => stored.has(key) ? JSON.parse(stored.get(key)) : null;
const confirm = () => node('#dialog').listeners.get('click')({ target: { closest: () => ({ dataset: { dlg: '1' } }) } });
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
try {
  await ok('les clés et instantanés identifient explicitement leur propriétaire', () => {
    assert.notEqual(playerSnapshotKey(a.id), playerSnapshotKey(b.id));
    assert.equal(playerSnapshotKey('a:b'), 'sea:player-snap:a%3Ab'); assert.equal(playerSnapshotKey(null), null);
    const p = { s: session, i: 0, set: 0, log: [{ sets: [] }, { sets: [] }], startedAt: 1000, phase: 'ready' };
    const snap = snapshot(p, 2000, a.id);
    assert.equal(snap.ownerId, a.id); assert.equal(canResume(snap, 2001, a.id), true);
    assert.equal(canResume(snap, 2001, b.id), false); assert.equal(canResume(snap, 2001, null), false);
    assert.equal(snapshot(p, 2000, null), null);
    assert.equal(canResume({ ...snap, ownerId: undefined }, 2001, a.id), false);
    for (const invalid of [{ i: -1 }, { i: 0.5 }, { i: 2 }, { log: [] }, { elapsed: NaN }, { at: 3000 }]) assert.equal(canResume({ ...snap, ...invalid }, 2001, a.id), false);
  });
  let savedA;
  await ok('commencer puis avancer conserve la séance et ses séries dans la clé de A', () => {
    S.user = a; startPlayer(session, { fromGenerator: true, eventId: 'recurring-A', eventDate: '2026-10-04' }); ACT.pGo();
    assert.equal(S.player.ownerId, a.id); savedA = read(playerSnapshotKey(a.id));
    assert.equal(savedA.set, 1); assert.equal(savedA.log[0].sets.length, 1); assert.equal(savedA.s.name, session.name);
    assert.equal(savedA.eventId, 'recurring-A'); assert.equal(savedA.eventDate, '2026-10-04');
    assert.equal(stored.has('sea:player-snap'), false); assert.equal(stored.has(playerSnapshotKey(b.id)), false);
  });
  const legacy = JSON.stringify({ ...savedA, ownerId: undefined });
  await ok('B et une page déconnectée ne voient ni ne reprennent A ou une sauvegarde globale ancienne', () => {
    stored.set('sea:player-snap', legacy); S.player = null; S.user = b;
    assert.equal(resumeCard(), ''); ACT.pResume(); assert.equal(S.player, null);
    S.user = null; assert.equal(resumeCard(), ''); ACT.pResume(); assert.equal(S.player, null);
    assert.equal(stored.get('sea:player-snap'), legacy); assert.deepEqual(read(playerSnapshotKey(a.id)), savedA);
  });
  await ok('un instantané mal attribué dans la clé de B est refusé ; Oublier ne touche que B', () => {
    S.user = b; stored.set(playerSnapshotKey(b.id), JSON.stringify(savedA));
    assert.equal(resumeCard(), ''); ACT.pResume(); assert.equal(S.player, null);
    ACT.pResumeDrop(); assert.equal(stored.has(playerSnapshotKey(b.id)), false);
    assert.deepEqual(read(playerSnapshotKey(a.id)), savedA); assert.equal(stored.get('sea:player-snap'), legacy);
  });
  await ok('revenir au compte A permet de reprendre exactement sa séance et ses séries', () => {
    S.user = a; assert.match(resumeCard().s, /Séance privée de A/); ACT.pResume();
    assert.equal(S.player.ownerId, a.id); assert.equal(S.player.s.id, session.id); assert.equal(S.player.set, 1);
    assert.equal(S.player.log[0].sets.length, 1); assert.equal(S.player.phase, 'ready');
    assert.equal(S.player.eventId, 'recurring-A'); assert.equal(S.player.eventDate, '2026-10-04', 'l’occurrence reste celle du rendez-vous initial même lors d’une reprise le lendemain');
  });
  await ok('un ancien joueur ne peut enregistrer de résultat ni actualiser une sauvegarde sous B', () => {
    const old = S.player, snap = stored.get(playerSnapshotKey(a.id)); S.user = b;
    const history = [...S.history], items = [...S.items], outbox = [...S.outbox];
    ACT.pSave(); ACT.pRedraw(); tick();
    assert.deepEqual(S.history, history); assert.deepEqual([...S.items], items); assert.deepEqual(S.outbox, outbox);
    assert.equal(stored.has(playerSnapshotKey(b.id)), false); assert.equal(stored.get(playerSnapshotKey(a.id)), snap);
    assert.equal(S.player, old); S.player = null; assert.doesNotThrow(() => ACT.pSave());
  });
  await ok('une ancienne confirmation de quitter ou passer ne modifie pas le nouveau joueur de B', async () => {
    for (const action of ['pQuit', 'pSkip', 'pDiscard']) {
      S.user = a; startPlayer(session, { fromGenerator: true }); const pending = ACT[action]();
      S.user = b; S.player = null; startPlayer({ ...session, id: 'private-B', name: 'Séance de B' }, { fromGenerator: true }); const current = S.player;
      confirm(); await pending;
      assert.equal(S.player, current); assert.equal(current.i, 0); assert.equal(current.phase, 'ready');
      assert.equal(read(playerSnapshotKey(b.id)).s.id, 'private-B'); closePlayer();
    }
  });
  await ok('des réglages saisis sous A après le passage à B ne créent aucune donnée chez B', async () => {
    S.user = a; startPlayer(session, { fromGenerator: true }); const pending = ACT.pSetup();
    S.user = b; S.player = null; node('#dlg-in').value = 'Réglage privé de A';
    const items = [...S.items], outbox = [...S.outbox]; confirm(); await pending;
    assert.deepEqual([...S.items], items); assert.deepEqual(S.outbox, outbox);
  });
  await ok('fermer un ancien joueur supprime sa propre sauvegarde, jamais celle de B ou la clé globale', () => {
    S.user = a; startPlayer(session, { fromGenerator: true });
    const bValue = JSON.stringify({ ...savedA, ownerId: b.id, s: { ...session, name: 'B' } }); stored.set(playerSnapshotKey(b.id), bValue);
    S.user = b; closePlayer();
    assert.equal(stored.has(playerSnapshotKey(a.id)), false); assert.equal(stored.get(playerSnapshotKey(b.id)), bValue);
    assert.equal(stored.get('sea:player-snap'), legacy);
  });
  console.log(`\n${n} tests de reprise par compte OK`);
} finally { closePlayer(); }
