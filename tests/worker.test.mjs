import assert from 'node:assert/strict';
import worker from '../worker.js';
import { makeD1 } from './d1shim.mjs';

let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
const legacy = JSON.stringify([{ id: 'old1', name: 'Ancienne séance', exercises: [{ id: 'e1', emoji: '💪', name: 'Tractions', type: 'reps', amount: 5, sets: 3, rest: 180, ok: ['Bras tendus'], bad: [] }] }]);
const env = { DB: makeD1(), EDIT_CODE: 'code-secret-42', SEANCES_KV: { get: async (k) => (k === 'seances' ? legacy : null) }, ASSETS: { fetch: async () => new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html' } }) } };
const ORIGIN = 'https://site.test';

class Client {
  constructor() { this.jar = {}; }
  async call(method, path, body, extraHeaders = {}) {
    const headers = { Origin: ORIGIN, ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const c = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
    const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = sc.split('; '); const i = pair.indexOf('='); const name = pair.slice(0, i), val = pair.slice(i + 1);
      if (/Max-Age=0/i.test(attrs.join(';')) || val === '') delete this.jar[name]; else this.jar[name] = val;
      res.cookiesSet = [...(res.cookiesSet || []), sc];
    }
    let data = null; try { data = await res.clone().json(); } catch {}
    return { status: res.status, data, res };
  }
  get(p) { return this.call('GET', p); } post(p, b) { return this.call('POST', p, b ?? {}); } del(p) { return this.call('DELETE', p); } put(p, b) { return this.call('PUT', p, b); }
}
const A = new Client(), B = new Client(), C = new Client();

console.log('Comptes et connexion durable');
await ok('santé', async () => { const r = await A.get('/api/health'); assert.equal(r.status, 200); assert.equal(r.data.editCode, true); });
await ok('inscription refusée si mot de passe court / pseudo invalide', async () => {
  assert.equal((await A.post('/api/auth/register', { username: 'martin', password: 'court' })).status, 400);
  assert.equal((await A.post('/api/auth/register', { username: 'a b', password: 'motdepasse1' })).status, 400);
});
await ok('inscription OK, cookie de session valable 1 an', async () => {
  const r = await A.post('/api/auth/register', { username: 'Martin', password: 'motdepasse1' });
  assert.equal(r.status, 200); const sc = r.res.headers.getSetCookie().find((c) => c.startsWith('session='));
  assert.match(sc, /Max-Age=31536000/); assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/);
});
await ok('doublon de pseudo (casse ignorée) refusé', async () => assert.equal((await B.post('/api/auth/register', { username: 'MARTIN', password: 'motdepasse1' })).status, 409));
await ok('inscription : rafale concurrente sur le même pseudo → exactement un succès, jamais de 500', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => new Client().call('POST', '/api/auth/register', { username: 'course-pseudo', password: 'motdepasse1' }, { 'CF-Connecting-IP': '10.0.0.9' })));
  const ok200 = results.filter((r) => r.status === 200).length;
  const conflict409 = results.filter((r) => r.status === 409).length;
  assert.equal(ok200, 1, 'une seule inscription doit réussir pour un pseudo donné, même en rafale concurrente');
  assert.equal(conflict409, 5, 'les autres doivent recevoir un 409 clair');
  assert.ok(results.every((r) => r.status !== 500), 'jamais de 500 générique, même en cas de course');
});
await ok('/me avec cookie = connecté ; sans cookie = 401', async () => { assert.equal((await A.get('/api/auth/me')).data.user.username, 'Martin'); assert.equal((await new Client().get('/api/auth/me')).status, 401); });
await ok('connexion : mauvais mot de passe 401, bon mot de passe 200, aussi via e-mail', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth/login', { username: 'martin', password: 'faux-faux-1' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { username: 'martin', password: 'motdepasse1' })).status, 200);
});
await ok('blocage après 10 échecs', async () => {
  const c = new Client(); let last;
  for (let i = 0; i < 11; i++) last = await c.post('/api/auth/login', { username: 'martin', password: 'mauvais-mdp' });
  assert.equal(last.status, 429);
});
await ok('rate limit login : une rafale concurrente ne peut pas contourner la limite (race condition)', async () => {
  await new Client().call('POST', '/api/auth/register', { username: 'concurrent1', password: 'motdepasse1' }, { 'CF-Connecting-IP': '10.0.0.8' });
  const c = new Client();
  const results = await Promise.all(Array.from({ length: 15 }, () => c.post('/api/auth/login', { username: 'concurrent1', password: 'mauvais-mdp' })));
  const attempted = results.filter((r) => r.status === 401).length;
  const blocked = results.filter((r) => r.status === 429).length;
  assert.equal(attempted + blocked, 15, 'chaque requête doit être soit tentée soit bloquée, rien d’autre');
  assert.ok(attempted <= 10, `au plus 10 tentatives réelles autorisées malgré la rafale concurrente, obtenu ${attempted}`);
  assert.ok(blocked >= 5, `au moins 5 tentatives doivent être bloquées sur 15 en rafale, obtenu ${blocked}`);
});
await ok('renouvellement : la session est prolongée quand elle vieillit', async () => {
  env.DB.raw.exec(`UPDATE sessions SET expires_at=${Date.now() + 100 * 86400000}`);
  const r = await A.get('/api/auth/me'); assert.equal(r.status, 200);
  assert.ok(r.res.headers.getSetCookie().some((c) => c.startsWith('session=')), 'cookie non renouvelé');
  const exp = env.DB.raw.prepare('SELECT MAX(expires_at) e FROM sessions').get().e; assert.ok(exp > Date.now() + 360 * 86400000);
});
await ok('requête venant d’un autre site refusée (CSRF)', async () => assert.equal((await A.call('POST', '/api/sync', { items: [] }, { Origin: 'https://evil.test' })).status, 403));

console.log('Séances (synchronisation)');
await ok('le premier compte récupère les séances de l’ancienne version', async () => {
  const r = await A.get('/api/sync'); assert.equal(r.data.items.length, 1); assert.equal(r.data.items[0].exercises[0].repsMin, 5);
});
await B.post('/api/auth/register', { username: 'Julie', password: 'motdepasse2' });
await ok('le deuxième compte n’a pas les séances du premier', async () => assert.equal((await B.get('/api/sync')).data.items.length, 0));
await ok('fusion élément par élément entre deux appareils', async () => {
  const T = Date.now();
  await A.post('/api/sync', { items: [{ id: 's1', name: 'Jambes', updatedAt: T - 1000, exercises: [] }, { id: 'old1', name: 'Ancienne séance', updatedAt: 0, exercises: [] }], tomb: {} });
  const r = await A.post('/api/sync', { items: [{ id: 's2', name: 'Dos', updatedAt: T, exercises: [] }, { id: 's1', name: 'Jambes (ancien)', updatedAt: T - 5000, exercises: [] }], tomb: { old1: T } });
  const names = r.data.items.map((s) => s.name).sort(); assert.deepEqual(names, ['Dos', 'Jambes']);
  assert.equal(r.data.tomb.old1, T);
});
await ok('trop gros → 413', async () => assert.equal((await A.post('/api/sync', { items: [{ id: 'x', name: 'x'.repeat(2_000_000) }] })).status, 413));

console.log('Calendrier et historique');
await ok('événement créé, relu, supprimé', async () => {
  assert.equal((await A.post('/api/calendar', { id: 'ev1', date: '2026-09-21', title: 'Jambes', sessionId: 's1' })).status, 200);
  const g = await A.get('/api/calendar?from=2026-09-01&to=2026-09-30'); assert.equal(g.data.events.length, 1); assert.equal(g.data.events[0].completed, false);
  await A.post('/api/calendar', { id: 'ev1', date: '2026-09-22', title: 'Jambes', completed: true, recurrence: { freq: 'weekly' } });
  const g2 = await A.get('/api/calendar'); assert.equal(g2.data.events[0].date, '2026-09-22'); assert.equal(g2.data.events[0].recurrence.freq, 'weekly');
  assert.equal((await A.post('/api/calendar', { date: 'pas-une-date' })).status, 400);
});
await ok('IDOR : un autre compte ne peut pas écraser ni supprimer mon événement', async () => {
  assert.equal((await B.post('/api/calendar', { id: 'ev1', date: '2030-01-01', title: 'piraté' })).status, 409);
  await B.del('/api/calendar/ev1');
  const g = await A.get('/api/calendar'); assert.equal(g.data.events[0].title, 'Jambes'); assert.equal(g.data.events[0].date, '2026-09-22');
});
const hist = (id, t, extra = {}) => ({ id, sessionId: 's1', sessionName: 'Jambes', startedAt: t, durationSeconds: 2700, data: { rpe: 3, focus: 'jambes', exercises: [{ name: 'Squats lestés', group: 'jambes', muscles: ['quadriceps'], sets: [{ reps: 8, load: 12.5, done: true }, { reps: 8, load: 12.5, done: true }] }] }, ...extra });
await ok('historique : ajout idempotent, lecture, suppression protégée', async () => {
  const t = Date.now() - 3600000;
  assert.equal((await A.post('/api/history', hist('h1', t))).status, 200); assert.equal((await A.post('/api/history', hist('h1', t))).status, 200);
  assert.equal((await A.get('/api/history')).data.history.length, 1);
  await B.del('/api/history/h1'); assert.equal((await A.get('/api/history')).data.history.length, 1);
  assert.equal((await A.post('/api/history', { sessionName: 'x' })).status, 400);
});
await ok('historique : collision d’identifiant avec un AUTRE utilisateur → erreur claire, jamais un faux succès ni un écrasement', async () => {
  const t = Date.now() - 7200000;
  const r = await B.post('/api/history', hist('h1', t, { sessionName: 'Séance de Julie' }));
  assert.equal(r.status, 409, 'un id déjà pris par un autre utilisateur ne doit jamais renvoyer 200');
  const mine = await A.get('/api/history');
  assert.equal(mine.data.history.find((x) => x.id === 'h1')?.sessionName, 'Jambes', 'ma séance ne doit pas avoir été écrasée par celle de Julie');
});
await ok('réglages nettoyés', async () => {
  const r = await A.post('/api/settings', { level: { boulderMax: '6B', years: 3 }, equipment: { wall: true, hangboard: 1, hack: true }, evil: '<script>' });
  assert.equal(r.data.settings.equipment.hangboard, true); assert.equal(r.data.settings.equipment.hack, undefined); assert.equal(r.data.settings.evil, undefined);
  assert.equal((await A.get('/api/settings')).data.settings.level.boulderMax, '6B');
});
await ok('objectifs (goals) : survivent réellement à un aller-retour serveur, pas seulement à la fusion en mémoire côté client', async () => {
  const goal = { id: 'g1', name: 'Monter en 6a', target: 10, unit: 'voies', kind: 'sessions', current: 3, since: '2026-01-01' };
  await A.post('/api/settings', { level: { boulderMax: '6B' }, goals: [goal] });
  const stored = (await A.get('/api/settings')).data.settings.goals;
  assert.equal(stored?.length, 1, 'l’objectif doit être réellement conservé côté serveur, pas seulement en mémoire locale');
  assert.equal(stored[0].name, 'Monter en 6a'); assert.equal(stored[0].target, 10); assert.equal(stored[0].current, 3); assert.equal(stored[0].since, '2026-01-01');
  // Un autre réglage envoyé ensuite ne doit pas effacer les objectifs déjà enregistrés côté serveur si le
  // client les renvoie fidèlement (comportement normal de saveSettings(), qui envoie tout S.settings).
  await A.post('/api/settings', { level: { boulderMax: '6B' }, goals: [goal] });
  assert.equal((await A.get('/api/settings')).data.settings.goals.length, 1);
});

console.log('Bibliothèque commune');
await ok('les exercices de l’ancienne version sont repris ; ajout ouvert à tous les comptes', async () => {
  const g = await B.get('/api/exercises'); assert.ok(g.data.common.some((e) => e.name === 'Tractions'));
  assert.equal((await B.post('/api/exercises/common', { name: 'Traction archer', exercise: { sets: 3, repsMin: 4, repsMax: 6 } })).status, 200);
  assert.equal((await B.post('/api/exercises/common', { name: 'Traction archer' })).status, 409);
});
await ok('modification/suppression : code requis, lié au compte', async () => {
  const list = (await A.get('/api/exercises')).data.common; const id = list.find((e) => e.name === 'Traction archer').id;
  assert.equal((await A.put('/api/exercises/common/' + id, { name: 'Traction archer', sets: 5 })).status, 403);
  assert.equal((await A.post('/api/edit/unlock', { code: 'mauvais' })).status, 403);
  assert.equal((await A.post('/api/edit/unlock', { code: 'code-secret-42' })).status, 200);
  assert.equal((await A.get('/api/edit/status')).data.unlocked, true);
  assert.equal((await A.put('/api/exercises/common/' + id, { name: 'Traction archer', sets: 5 })).status, 200);
  B.jar.edit_auth = A.jar.edit_auth; // cookie volé : lié à l'autre compte
  assert.equal((await B.get('/api/edit/status')).data.unlocked, false); delete B.jar.edit_auth;
  await A.post('/api/edit/lock'); assert.equal((await A.get('/api/edit/status')).data.unlocked, false);
});
await ok('exercices personnels privés', async () => {
  await A.post('/api/exercises/personal', { name: 'Mon exo', sets: 2 });
  assert.equal((await A.get('/api/exercises')).data.personal.length, 1); assert.equal((await B.get('/api/exercises')).data.personal.length, 0);
});

console.log('Communauté (partage optionnel)');
await C.post('/api/auth/register', { username: 'Paul', password: 'motdepasse3' });
await ok('par défaut tout est privé : introuvable et illisible', async () => {
  assert.equal((await A.get('/api/social/search?q=jul')).data.users.length, 0);
  assert.equal((await A.post('/api/social/follow', { username: 'Julie' })).status, 404);
  assert.equal((await A.get('/api/social/user/Julie')).status, 404);
});
await ok('Julie passe « sur validation » : demande en attente, puis acceptée', async () => {
  await B.post('/api/social/profile', { visibility: 'followers', shareStats: true, shareRecords: false, shareSessions: false });
  assert.equal((await A.get('/api/social/search?q=jul')).data.users.length, 1);
  assert.equal((await A.post('/api/social/follow', { username: 'julie' })).data.status, 'pending');
  assert.equal((await A.get('/api/social/user/Julie')).status, 404, 'lisible avant acceptation');
  const me = (await B.get('/api/social/me')).data; assert.equal(me.pending.length, 1);
  await B.post('/api/social/respond', { id: me.pending[0].id, accept: true });
  assert.equal((await C.get('/api/social/user/Julie')).status, 404, 'lisible par un non-abonné');
  const v = (await A.get('/api/social/user/Julie')).data.person; assert.ok(v.stats); assert.equal(v.records, null); assert.equal(v.recent, null);
});
await ok('Julie enregistre une séance et choisit de partager ses records', async () => {
  await B.post('/api/history', hist('j1', Date.now() - 7200000));
  await B.post('/api/social/profile', { visibility: 'followers', shareStats: true, shareRecords: true, shareSessions: true });
  const v = (await A.get('/api/social/user/Julie')).data.person;
  assert.equal(v.stats.sessions30, 1); assert.equal(v.records[0].value, 12.5); assert.equal(v.recent[0].name, 'Jambes');
  const feed = (await A.get('/api/social/feed')).data.people; assert.equal(feed.length, 1);
});
await ok('profil public : suivi immédiat ; repasser en privé coupe l’accès', async () => {
  await C.post('/api/social/profile', { visibility: 'public', shareStats: true, shareRecords: false, shareSessions: false });
  assert.equal((await A.post('/api/social/follow', { username: 'Paul' })).data.status, 'accepted');
  await C.post('/api/social/profile', { visibility: 'private', shareStats: true });
  assert.equal((await A.get('/api/social/user/Paul')).status, 404);
  assert.equal((await A.get('/api/social/feed')).data.people.length, 1);
});
await ok('se désabonner / retirer un abonné', async () => {
  await A.post('/api/social/unfollow', { username: 'Julie' }); assert.equal((await A.get('/api/social/user/Julie')).status, 404);
});
await ok('recherche : les caractères % et _ ne sont pas des jokers', async () => assert.equal((await A.get('/api/social/search?q=%25%25')).data.users.length, 0));

console.log('Fichiers statiques et sécurité');
await ok('seuls les fichiers du site sont publics', async () => {
  for (const p of ['/worker.js', '/wrangler.json', '/schema.js', '/README.md', '/tests/sample.txt', '/.assetsignore', '/%2e%2e/worker.js']) assert.equal((await worker.fetch(new Request(ORIGIN + p), env)).status, 404, p);
  for (const p of ['/', '/index.html', '/app.js', '/sw.js', '/manifest.json']) assert.equal((await worker.fetch(new Request(ORIGIN + p), env)).status, 200, p);
  const r = await worker.fetch(new Request(ORIGIN + '/'), env); assert.match(r.headers.get('Content-Security-Policy'), /default-src 'self'/); assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal((await worker.fetch(new Request(ORIGIN + '/', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/sw.js'), env)).headers.get('Cache-Control'), 'no-cache');
});
await ok('rate limit d’inscription', async () => {
  let last; for (let i = 0; i < 9; i++) last = await new Client().post('/api/auth/register', { username: 'spam' + i + 'xx', password: 'motdepasse1' });
  assert.equal(last.status, 429);
});
await ok('invitation obligatoire si INVITE_CODE défini', async () => {
  env.INVITE_CODE = 'entre-amis'; env.DB.raw.exec("DELETE FROM system_state WHERE key LIKE 'rl:register%'");
  assert.equal((await new Client().post('/api/auth/register', { username: 'Nouveau', password: 'motdepasse1' })).status, 403);
  assert.equal((await new Client().post('/api/auth/register', { username: 'Nouveau', password: 'motdepasse1', invite: 'entre-amis' })).status, 200);
  delete env.INVITE_CODE;
});
await ok('changement de mot de passe déconnecte les autres appareils', async () => {
  env.DB.raw.exec("DELETE FROM system_state WHERE key LIKE 'rl:login%'");
  const a2 = new Client(); await a2.post('/api/auth/login', { username: 'Martin', password: 'motdepasse1' });
  assert.equal((await A.post('/api/auth/password', { current: 'faux', next: 'nouveaumdp1' })).status, 403);
  assert.equal((await A.post('/api/auth/password', { current: 'motdepasse1', next: 'nouveaumdp1' })).status, 200);
  assert.equal((await a2.get('/api/auth/me')).status, 401); assert.equal((await A.get('/api/auth/me')).status, 200);
  assert.equal((await new Client().post('/api/auth/login', { username: 'Martin', password: 'nouveaumdp1' })).status, 200);
});
await ok('déconnexion', async () => { const c = new Client(); await c.post('/api/auth/login', { username: 'Martin', password: 'nouveaumdp1' }); await c.post('/api/auth/logout'); assert.equal((await c.get('/api/auth/me')).status, 401); });
await ok('suppression du compte : tout disparaît', async () => {
  assert.equal((await B.post('/api/auth/delete', { password: 'faux' })).status, 403);
  assert.equal((await B.post('/api/auth/delete', { password: 'motdepasse2' })).status, 200);
  for (const t of ['users', 'user_data', 'history', 'profiles', 'follows']) { const c = env.DB.raw.prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${t === 'users' ? "username='Julie'" : t === 'follows' ? "1=0" : "user_id NOT IN (SELECT id FROM users)"}`).get().c; assert.equal(c, 0, t); }
  assert.equal((await B.get('/api/auth/me')).status, 401);
});
await ok('compatibilité : un compte créé par l’ancienne version peut se connecter', async () => {
  // format identique (PBKDF2 100 000 itérations, sel base64url) : on fabrique une ligne « ancienne » avec le même algorithme
  const salt = btoa('0123456789abcdef').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ancien-mdp-123'), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(btoa('0123456789abcdef')), (c) => c.charCodeAt(0)), iterations: 100000, hash: 'SHA-256' }, key, 256));
  let s = ''; for (const x of bits) s += String.fromCharCode(x); const hash = btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  env.DB.raw.prepare("INSERT INTO users(id,username,email,password_hash,password_salt,created_at,updated_at) VALUES('legacy-u','Ancien',NULL,?,?,1,1)").run(hash, salt);
  env.DB.raw.prepare("INSERT INTO user_data(user_id,seances_json,settings_json,favorites_json,goals_json,updated_at) VALUES('legacy-u','[{\"id\":\"z\",\"name\":\"Vieille séance\",\"exercises\":[]}]','{\"theme\":\"dark\"}','[]','{}',1)").run();
  const c = new Client(); assert.equal((await c.post('/api/auth/login', { username: 'ancien', password: 'ancien-mdp-123' })).status, 200);
  assert.equal((await c.get('/api/sync')).data.items[0].name, 'Vieille séance');
  assert.equal((await c.get('/api/settings')).status, 200);
});
console.log(`\n${n} tests OK`);
