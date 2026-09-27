// tests/move.test.mjs — déménagement de l'ancienne adresse (…workers.dev) vers la nouvelle (…pages.dev) :
// connexion et données de l'appareil transférées par un code à usage unique, jamais sans confirmation.
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { makeEnv, ok, done } from './helpers.mjs';

const OLD = 'https://seances-entrainement.martin-zannet22.workers.dev', NEW = 'https://seances-sport.pages.dev';
let ip = 0;
class Browser {
  constructor(env, origin) { this.env = env; this.origin = origin; this.jar = {}; this.ip = '10.9.0.' + (++ip); }
  async call(method, path, body) {
    const headers = { Origin: this.origin, 'CF-Connecting-IP': this.ip };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const c = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); if (c) headers.Cookie = c;
    const res = await worker.fetch(new Request(this.origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), this.env);
    for (const sc of res.headers.getSetCookie?.() || []) { const [pair] = sc.split('; '); const i = pair.indexOf('='); if (pair.slice(i + 1)) this.jar[pair.slice(0, i)] = pair.slice(i + 1); else delete this.jar[pair.slice(0, i)]; }
    let data = null; try { data = await res.clone().json(); } catch { /* rien */ }
    return { status: res.status, data };
  }
  get(p) { return this.call('GET', p); } post(p, b = {}) { return this.call('POST', p, b); }
}
console.log('Déménagement vers la nouvelle adresse');
const env = makeEnv();
await ok('/api/move : seulement sur l’ancienne adresse (pas les aperçus, pas la nouvelle, désactivable)', async () => {
  assert.equal((await new Browser(env, OLD).get('/api/move')).data.to, NEW);
  assert.equal((await new Browser(env, NEW).get('/api/move')).data.to, null);
  assert.equal((await new Browser(env, 'https://ab12cd-seances-entrainement.martin-zannet22.workers.dev').get('/api/move')).data.to, null, 'aperçu de version');
  assert.equal((await new Browser(env, 'https://site.test').get('/api/move')).data.to, null);
  assert.equal((await new Browser({ ...env, MOVE_TO: '' }, OLD).get('/api/move')).data.to, null, 'désactivé');
  assert.equal((await new Browser({ ...env, MOVE_TO: 'http://pas-https.example' }, OLD).get('/api/move')).data.to, null);
  assert.equal((await new Browser({ ...env, MOVE_TO: 'https://autre.example/' }, OLD).get('/api/move')).data.to, 'https://autre.example');
  assert.equal((await new Browser(env, NEW).post('/api/handoff', { ls: {} })).status, 404, 'pas de transfert depuis la nouvelle adresse');
});
await ok('compte : le code transfère la connexion et les données de l’appareil, une seule fois', async () => {
  const old = new Browser(env, OLD);
  assert.equal((await old.post('/api/auth/register', { username: 'Martin', password: 'motdepasse1' })).status, 200);
  const r = await old.post('/api/handoff', { ls: { 'sea:appearance': '{"palette":"ocean"}', 'sea:pending:x': '{"v":1}', 'sea:user': 'pirate', 'autre:clé': 'x', 'sea:n': 12 }, guest: true, snap: { v: 2 } });
  assert.equal(r.status, 200); const code = r.data.code; assert.match(code, /^[\w-]{43}$/);
  const neu = new Browser(env, NEW);
  const peek = await neu.post('/api/handoff/peek', { code });
  assert.equal(peek.data.username, 'Martin'); assert.equal(peek.data.guest, false);
  assert.equal((await neu.get('/api/auth/me')).status, 401, 'pas connecté avant confirmation');
  const c = await neu.post('/api/handoff/claim', { code });
  assert.equal(c.status, 200); assert.equal(c.data.user.username, 'Martin');
  assert.deepEqual(c.data.ls, { 'sea:appearance': '{"palette":"ocean"}', 'sea:pending:x': '{"v":1}' }, 'seules les clés sea:* texte, jamais sea:user');
  assert.equal(c.data.snap, null, 'pas de données invité pour un compte');
  assert.equal((await neu.get('/api/auth/me')).data.user.username, 'Martin', 'connecté sur la nouvelle adresse');
  assert.equal((await old.get('/api/auth/me')).data.user.username, 'Martin', 'l’ancienne session reste valable');
  assert.equal((await new Browser(env, NEW).post('/api/handoff/claim', { code })).status, 404, 'usage unique');
  assert.equal((await new Browser(env, NEW).post('/api/handoff/peek', { code })).status, 404);
});
await ok('invité : données locales transférées, sans connexion ; codes faux ou expirés refusés', async () => {
  const old = new Browser(env, OLD);
  const { code } = (await old.post('/api/handoff', { ls: { 'sea:appearance': '{}' }, guest: true, snap: { v: 2, seances: { items: [{ id: 's1', name: 'Invitée' }] } } })).data;
  const neu = new Browser(env, NEW);
  assert.deepEqual((await neu.post('/api/handoff/peek', { code })).data, { ok: true, username: null, guest: true });
  const c = await neu.post('/api/handoff/claim', { code });
  assert.equal(c.data.user, null); assert.equal(c.data.snap.seances.items[0].name, 'Invitée'); assert.equal(Object.keys(neu.jar).length, 0, 'aucun cookie');
  for (const bad of ['', 'x', 'a'.repeat(43), null, { $ne: 1 }]) assert.equal((await neu.post('/api/handoff/claim', { code: bad })).status, 404);
  const { code: c2 } = (await old.post('/api/handoff', { ls: {} })).data;
  const realNow = Date.now; Date.now = () => realNow() + 16 * 60000;
  try { assert.equal((await neu.post('/api/handoff/claim', { code: c2 })).status, 404, 'expiré après 15 min'); } finally { Date.now = realNow; }
});
await ok('protections : autre site refusé, taille limitée, nombre d’essais limité', async () => {
  const evil = new Browser(env, OLD); evil.origin = OLD;
  const res = await worker.fetch(new Request(OLD + '/api/handoff', { method: 'POST', headers: { Origin: 'https://pirate.example', 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(res.status, 403);
  const big = new Browser(env, OLD);
  assert.equal((await big.post('/api/handoff', { ls: { 'sea:x': 'y'.repeat(1900000) } })).status, 413);
  const spam = new Browser(env, OLD); let last = 0;
  for (let i = 0; i < 22; i++) last = (await spam.post('/api/handoff', { ls: {} })).status;
  assert.equal(last, 429);
});
done();
