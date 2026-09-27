// tests/duo-share.test.mjs — partage par lien + QR code, séance à deux (salon, droits, état partagé, synchronisation).
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { duoCode, normCode, cleanDuoState, CODE_RE } from '../server/duo.js';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const stub = () => ({ innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, querySelector: () => null });
globalThis.document = { querySelector: () => stub(), querySelectorAll: () => [], documentElement: { dataset: {} }, body: stub(), addEventListener() {}, hidden: false };
globalThis.window = globalThis; globalThis.location = { origin: 'https://seances-sport.pages.dev', hash: '', pathname: '/' };
const { qrSvg } = await import('../public/share.js');
const { S } = await import('../public/state.js');
const { startPlayer, applyDuo, duoSnapshot, closePlayer } = await import('../public/player.js');

/** Relit le SVG produit (chemins de 1×1) en image, puis le décode avec jsQR. */
function decodeSvg(svg, scale = 6) {
  const N = Number(svg.match(/viewBox="0 0 (\d+) /)[1]), W = N * scale;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const o = ((+y * scale + dy) * W + (+x * scale + dx)) * 4; px[o] = px[o + 1] = px[o + 2] = 0; }
  return jsQR(px, W, W)?.data;
}

console.log('QR code');
await ok('le QR code dessiné se relit : lien de séance et lien de salon', () => {
  for (const u of ['https://seances-sport.pages.dev/#/s/3f2b9c1e-6a7d-4f00-9d2e-0b1c2d3e4f50', 'https://seances-sport.pages.dev/#/duo/ABC234']) assert.equal(decodeSvg(qrSvg(u)), u);
});
await ok('SVG autonome : fond blanc, pas de script ni de lien externe', () => {
  const s = qrSvg('https://x.test/#/s/a'); assert.match(s, /^<svg[^>]+viewBox/); assert.doesNotMatch(s, /<script|href=|on\w+=/i);
});

console.log('Salon : règles');
await ok('code du salon : 6 caractères lisibles (sans 0/O/1/I), tirés au hasard', () => {
  const codes = new Set(Array.from({ length: 300 }, duoCode));
  assert.ok(codes.size > 295); for (const c of codes) assert.match(c, CODE_RE);
  assert.equal(normCode(' abc-234 '), 'ABC234');
});
await ok('état partagé nettoyé : seulement position et chrono, bornés', () => {
  const now = 1e12, st = cleanDuoState({ i: 9999, set: -3, side: 5, phase: 'hack', end: now + 9e9, total: 'x', paused: 1, reps: 12, load: 80, note: 'privé', why: 'x' }, now);
  assert.deepEqual(st, { i: 500, set: 0, side: 1, phase: 'ready', end: 0, total: 0, remaining: 0, paused: true, why: 'set' });
});

console.log('Salon : serveur');
const env = makeEnv();
const A = new Client(env), B = new Client(env), C = new Client(env);
await A.register('Anna'); await B.register('Basile'); await C.register('Chloe');
const session = { id: 's1', name: 'Blocs à deux', activity: 'conditioning', exercises: [{ name: 'Pompes', sets: 2, repsMin: 8, repsMax: 10, rest: 60, load: '+10 kg', note: 'note perso' }, { name: 'Gainage', mode: 'time', sets: 1, secMin: 30, secMax: 30, rest: 0 }] };
let code;
await ok('création : code renvoyé ; séance vide refusée ; sans compte refusé', async () => {
  assert.equal((await A.post('/api/duo', { session: { name: 'x', exercises: [] } })).status, 400);
  assert.equal((await new Client(env).post('/api/duo', { session })).status, 401);
  const r = await A.post('/api/duo', { session, state: { i: 0, phase: 'ready' } });
  assert.equal(r.status, 200); assert.match(r.data.code, CODE_RE); assert.ok(r.data.now > 0); code = r.data.code;
});
await ok('non-membre : lecture et écriture refusées (403) ; code inconnu 404', async () => {
  assert.equal((await B.get(`/api/duo/${code}`)).status, 403);
  assert.equal((await B.put(`/api/duo/${code}`, { state: { i: 1 } })).status, 403);
  assert.equal((await B.get('/api/duo/ZZZZZZ')).status, 404);
});
await ok('rejoindre : séance reçue sans notes ni charges chiffrées ; chacun voit l’autre', async () => {
  const r = await B.post(`/api/duo/${code.toLowerCase()}/join`);
  assert.equal(r.status, 200); assert.equal(r.data.session.exercises.length, 2);
  assert.equal(r.data.session.exercises[0].note, ''); assert.equal(r.data.session.exercises[0].load, '');
  assert.deepEqual(r.data.members, ['Anna']);
  assert.deepEqual((await A.get(`/api/duo/${code}`)).data.members, ['Basile']);
});
await ok('état : version incrémentée, « mine » pour l’auteur, rien d’autre que la position', async () => {
  const w = await B.put(`/api/duo/${code}`, { state: { i: 0, set: 1, phase: 'rest', end: Date.now() + 60000, total: 60000, reps: 99 } });
  assert.equal(w.status, 200); assert.equal(w.data.v, 2);
  const a = await A.get(`/api/duo/${code}`), b = await B.get(`/api/duo/${code}`);
  assert.equal(a.data.v, 2); assert.equal(a.data.mine, false); assert.equal(b.data.mine, true);
  assert.equal(a.data.state.phase, 'rest'); assert.equal(a.data.state.set, 1); assert.equal(a.data.state.reps, undefined);
});
await ok('4 personnes au plus', async () => {
  await C.post(`/api/duo/${code}/join`);
  const D = new Client(env); await D.register('Dora'); assert.equal((await D.post(`/api/duo/${code}/join`)).status, 200);
  const E = new Client(env); await E.register('Emile'); assert.equal((await E.post(`/api/duo/${code}/join`)).status, 409);
});
await ok('un membre part : il n’a plus accès ; l’hôte ferme : salon supprimé', async () => {
  assert.equal((await C.del(`/api/duo/${code}`)).status, 200); assert.equal((await C.get(`/api/duo/${code}`)).status, 403);
  assert.equal((await A.del(`/api/duo/${code}`)).status, 200); assert.equal((await B.get(`/api/duo/${code}`)).status, 404);
});
await ok('salon expiré : introuvable', async () => {
  const r = await A.post('/api/duo', { session });
  env.DB.raw.prepare('UPDATE duo_rooms SET expires_at=1 WHERE code=?').run(r.data.code);
  assert.equal((await A.get(`/api/duo/${r.data.code}`)).status, 404);
});

console.log('Partage par lien');
let linkId;
await ok('lien : lisible sans compte, jamais listé dans la bibliothèque commune ni sur le profil public', async () => {
  const r = await A.post('/api/shared', { id: 'lien-1', scope: 'link', session, title: 'Blocs à deux' });
  assert.equal(r.status, 200); linkId = r.data.id;
  const pub = await new Client(env).get(`/api/public/s/${linkId}`);
  assert.equal(pub.status, 200); assert.equal(pub.data.item.session.exercises[0].note, '');
  assert.ok(!(await B.get('/api/shared?scope=common')).data.items.some((x) => x.id === linkId));
  assert.ok(!(await B.get('/api/shared?scope=public')).data.items.some((x) => x.id === linkId));
  assert.ok(!(await B.get('/api/shared?scope=link')).data.items.some((x) => x.id === linkId), 'scope=link sans mine → commune');
  assert.deepEqual((await A.get('/api/shared?scope=link&mine=1')).data.items.map((x) => x.id), [linkId]);
  assert.deepEqual((await B.get('/api/shared?scope=link&mine=1')).data.items, []);
});
await ok('lien retiré par son auteur : plus accessible ; un autre ne peut pas le retirer', async () => {
  assert.equal((await B.del(`/api/shared/${linkId}`)).status, 403);
  assert.equal((await A.del(`/api/shared/${linkId}`)).status, 200);
  assert.equal((await new Client(env).get(`/api/public/s/${linkId}`)).status, 404);
});

console.log('Synchronisation du lecteur');
S.settings = { ...(S.settings || {}), voice: false, vibration: false, autoWarm: false };
S.history = [];
const two = { name: 'Duo', exercises: [{ name: 'Pompes', sets: 2, repsMin: 10, repsMax: 10, rest: 60 }, { name: 'Squats', sets: 2, repsMin: 12, repsMax: 12, rest: 60 }, { name: 'Gainage', mode: 'time', sets: 1, secMin: 30, secMax: 30 }] };
await ok('le partenaire valide une série : elle est comptée ici, le repos démarre avec la même fin', () => {
  startPlayer(two, { fromGenerator: true });
  const end = Date.now() + 45000;
  assert.equal(applyDuo({ i: 0, set: 1, side: 0, phase: 'rest', end, total: 60000, paused: false, why: 'set' }), true);
  const p = S.player; assert.equal(p.log[0].sets.length, 1); assert.equal(p.log[0].sets[0].reps, 10);
  assert.equal(p.phase, 'rest'); assert.equal(p.end, end); assert.equal(p.set, 1);
  closePlayer();
});
await ok('le partenaire passe un exercice : rien n’est compté pour cet exercice', () => {
  startPlayer(two, { fromGenerator: true });
  applyDuo({ i: 1, set: 0, side: 0, phase: 'ready', why: 'skip' });
  assert.equal(S.player.i, 1); assert.equal(S.player.log[0].sets.length, 0);
  closePlayer();
});
await ok('rattrapage de plusieurs séries ; déjà plus loin → rien ne change ; pause partagée', () => {
  startPlayer(two, { fromGenerator: true });
  applyDuo({ i: 1, set: 1, side: 0, phase: 'ready', why: 'set' });
  const p = S.player; assert.deepEqual(p.log.map((l) => l.sets.length), [2, 1, 0]);
  assert.equal(applyDuo({ i: 0, set: 1, side: 0, phase: 'rest', end: Date.now() + 1000, total: 1000, why: 'set' }), false);
  applyDuo({ i: 1, set: 1, side: 0, phase: 'rest', end: Date.now() + 30000, total: 60000, paused: true, remaining: 30000, why: 'set' });
  assert.equal(p.paused, true); assert.equal(p.remaining, 30000);
  const snap = duoSnapshot(); assert.equal(snap.paused, true); assert.equal(snap.remaining, 30000); assert.equal(snap.i, 1);
  assert.equal(applyDuo({ phase: 'done' }), 'done');
  closePlayer();
});
done('tests partage / séance à deux');
