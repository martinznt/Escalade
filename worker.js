// worker.js — API + service des fichiers du site « Seances entrainement » (Cloudflare Workers + D1 + KV).
import { SCHEMA } from './schema.js';
import { mergeSeances, readStored, normalizeSession, normalizeEx, summarizeHistory, clamp, uid } from './public/shared.js';

const SESSION_DAYS = 365;           // on reste connecté 1 an (renouvelé à chaque utilisation)
const PBKDF2_ITERATIONS = 100000;   // maximum autorisé sur Workers
const DAY = 86400000;
const MAX_BODY = 1_500_000;

// Seuls ces fichiers sont servis publiquement (worker.js, wrangler.json, README… restent privés).
const PUBLIC_FILES = new Set(['/', '/index.html', '/style.css', '/boot.js', '/app.js', '/engine.js', '/library.js', '/shared.js', '/sw.js',
  '/manifest.json', '/sports.js', '/commands.js', '/outbox.js', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/robots.txt']);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      return await serveAsset(request, env, url);
    } catch (err) {
      console.error('Erreur non gérée', err && err.stack || err);
      return json({ ok: false, error: 'Erreur serveur. Réessaie dans un instant.' }, 500);
    }
  },
};

/* ═════════════ Fichiers statiques ═════════════ */
async function serveAsset(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405 });
  if (!PUBLIC_FILES.has(url.pathname)) return new Response('Introuvable', { status: 404, headers: SECURITY_HEADERS });
  const res = await env.ASSETS.fetch(request);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  if (url.pathname === '/sw.js') headers.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/* ═════════════ Utilitaires ═════════════ */
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra } });
}
const fail = (error, status = 400) => json({ ok: false, error }, status);

const b64 = (bytes) => { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); };
const unb64 = (s) => { s = s.replaceAll('-', '+').replaceAll('_', '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const enc = new TextEncoder();
const sha = async (t) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t))));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg))));
}
function safeEq(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function passHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256)));
}
async function newPassword(p) { const salt = b64(crypto.getRandomValues(new Uint8Array(16))); return { salt, hash: await passHash(p, salt) }; }

function cookiesOf(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1)); } catch { /* cookie illisible */ } }
  }
  return out;
}
const cookie = (name, value, maxAge, secure) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
const clientIp = (r) => r.headers.get('CF-Connecting-IP') || 'local';
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const db = (env, sql, ...args) => env.DB.prepare(sql).bind(...args.map((a) => (a === undefined ? null : a)));

async function readJson(request, max = MAX_BODY) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) throw Object.assign(new Error('trop gros'), { status: 413 });
  const text = await request.text();
  if (text.length > max) throw Object.assign(new Error('trop gros'), { status: 413 });
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/* Limitation de débit atomique : une seule écriture décide du compteur. */
async function rlState(env, key) {
  const row = await db(env, 'SELECT value FROM system_state WHERE key=?', 'rl:' + key).first();
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
async function rlBlocked(env, key, max, windowMs) {
  const s = await rlState(env, key), now = Date.now();
  return !!s && now - Number(s.t || 0) < windowMs && Number(s.n || 0) >= max;
}
async function rlHit(env, key, windowMs) {
  const k='rl:'+key, now=Date.now();
  const r=await db(env, `INSERT INTO system_state(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=CASE
      WHEN ? - CAST(json_extract(system_state.value,'$.t') AS INTEGER) < ?
      THEN json_set(system_state.value,'$.n',CAST(json_extract(system_state.value,'$.n') AS INTEGER)+1)
      ELSE json_object('n',1,'t',?) END
    RETURNING value`, k, JSON.stringify({n:1,t:now}), now, windowMs, now).first();
  try { return JSON.parse(r?.value || '{"n":1}'); } catch { return {n:1,t:now}; }
}
const rlReset = (env, key) => db(env, 'DELETE FROM system_state WHERE key=?', 'rl:' + key).run();
async function limited(env, key, max, windowMs) {
  if (await rlBlocked(env,key,max,windowMs)) return true;
  const s=await rlHit(env,key,windowMs);
  return Number(s.n||0)>max;
}

let schemaReady = null;
async function tableColumns(env, table) {
  const r = await db(env, `PRAGMA table_info(${table})`).all();
  return new Set(r.results.map((x) => x.name));
}
async function upgradeLegacySchema(env) {
  // Les anciennes versions avaient déjà les mêmes tables mais une structure
  // différente pour profiles/follows. CREATE TABLE IF NOT EXISTS ne suffit pas
  // dans ce cas : on complète la structure sans supprimer les données.
  const profiles = await tableColumns(env, 'profiles');
  if (profiles.size) {
    const add = [];
    if (!profiles.has('visibility')) add.push("ALTER TABLE profiles ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
    if (!profiles.has('share_stats')) add.push('ALTER TABLE profiles ADD COLUMN share_stats INTEGER NOT NULL DEFAULT 1');
    if (!profiles.has('share_records')) add.push('ALTER TABLE profiles ADD COLUMN share_records INTEGER NOT NULL DEFAULT 1');
    if (!profiles.has('share_sessions')) add.push('ALTER TABLE profiles ADD COLUMN share_sessions INTEGER NOT NULL DEFAULT 0');
    if (add.length) await env.DB.batch(add.map((x) => env.DB.prepare(x)));
    if (profiles.has('public_profile')) await db(env, "UPDATE profiles SET visibility=CASE WHEN public_profile=1 THEN 'public' ELSE 'private' END WHERE visibility='private' OR visibility IS NULL").run();
    if (profiles.has('share_progress')) await db(env, 'UPDATE profiles SET share_stats=CASE WHEN share_progress=1 THEN 1 ELSE 0 END, share_records=CASE WHEN share_progress=1 THEN 1 ELSE 0 END').run();
    if (profiles.has('share_workouts')) await db(env, 'UPDATE profiles SET share_sessions=CASE WHEN share_workouts=1 THEN 1 ELSE share_sessions END').run();
  }
  const follows = await tableColumns(env, 'follows');
  if (follows.size && !follows.has('id')) {
    await env.DB.batch([
      env.DB.prepare("CREATE TABLE follows_v5 (id TEXT PRIMARY KEY, follower_id TEXT NOT NULL, followee_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(follower_id,followee_id), FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE)"),
      env.DB.prepare("INSERT OR IGNORE INTO follows_v5(id,follower_id,followee_id,status,created_at) SELECT 'legacy-' || follower_id || '-' || followed_id, follower_id, followed_id, 'accepted', created_at FROM follows"),
      env.DB.prepare('DROP TABLE follows'),
      env.DB.prepare('ALTER TABLE follows_v5 RENAME TO follows'),
    ]);
  }
  await db(env, 'CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id,status)').run();
}
function ensureSchema(env) {
  if (!schemaReady) schemaReady = (async () => {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    await upgradeLegacySchema(env);
  })().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ═════════════ Sessions (connexion durable) ═════════════ */
async function createSession(env, userId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
  await db(env, 'DELETE FROM sessions WHERE expires_at<?', now).run();
  await db(env, 'INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)', uid(), userId, await sha(token), now + SESSION_DAYS * DAY, now).run();
  return token;
}
async function authenticate(request, env) {
  const token = cookiesOf(request).session;
  if (!token) return null;
  const now = Date.now(), hash = await sha(token);
  const row = await db(env, 'SELECT u.id,u.username,u.email,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', hash, now).first();
  if (!row) return null;
  let renew = false;
  if (row.expires_at - now < (SESSION_DAYS - 1) * DAY) { // prolonge au plus une fois par jour
    await db(env, 'UPDATE sessions SET expires_at=? WHERE token_hash=?', now + SESSION_DAYS * DAY, hash).run();
    renew = true;
  }
  return { user: { id: row.id, username: row.username, email: row.email }, token, hash, renew };
}

/* ═════════════ Routeur API ═════════════ */
async function handleApi(request, env, url) {
  const p = url.pathname, m = request.method;
  if (p === '/api/health') return json({ ok: true, db: !!env.DB, editCode: !!env.EDIT_CODE, inviteRequired: !!env.INVITE_CODE });
  if (!env.DB) return fail('Base de données non configurée (binding D1 « DB »).', 500);

  if (m !== 'GET' && m !== 'HEAD') {
    const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
    if ((origin && origin !== url.origin) || site === 'cross-site') return fail('Requête refusée.', 403);
  }
  try { await ensureSchema(env); } catch (e) { console.error('schema', e); return fail('Initialisation de la base impossible.', 500); }

  const secure = url.protocol === 'https:';
  if (p === '/api/auth/register' && m === 'POST') {
    try { return await register(request, env, secure); }
    catch (e) { if (e && /UNIQUE/i.test(String(e.message))) return fail('Pseudo ou e-mail déjà utilisé.', 409); throw e; }
  }
  if (p === '/api/auth/login' && m === 'POST') return login(request, env, secure);
  if (p === '/api/auth/logout' && m === 'POST') return logout(request, env, secure);

  const auth = await authenticate(request, env);
  if (!auth) return fail('Connexion requise.', 401);
  const u = auth.user;
  let res;
  try { res = await routeAuthed(request, env, url, auth, secure); }
  catch (e) {
    if (e && e.status === 413) return fail('Données trop volumineuses.', 413);
    if (e && /UNIQUE/i.test(String(e.message))) return fail('Cet élément existe déjà.', 409);
    throw e;
  }
  if (auth.renew) {
    const h = new Headers(res.headers);
    h.append('Set-Cookie', cookie('session', auth.token, SESSION_DAYS * 86400, secure));
    res = new Response(res.body, { status: res.status, headers: h });
  }
  return res;
}

async function routeAuthed(request, env, url, auth, secure) {
  const p = url.pathname, m = request.method, u = auth.user;
  let x;
  if (p === '/api/auth/me' && m === 'GET') return json({ ok: true, user: u });
  if (p === '/api/auth/password' && m === 'POST') return changePassword(request, env, auth);
  if (p === '/api/auth/delete' && m === 'POST') return deleteAccount(request, env, auth, secure);

  if (p === '/api/sync' && m === 'GET') return syncGet(env, u);
  if (p === '/api/sync' && m === 'POST') return syncPost(request, env, u);
  if (p === '/api/settings' && m === 'GET') return settingsGet(env, u);
  if (p === '/api/settings' && m === 'POST') return settingsPost(request, env, u);

  if (p === '/api/calendar' && m === 'GET') return calendarGet(url, env, u);
  if (p === '/api/calendar' && m === 'POST') return calendarPost(request, env, u);
  if ((x = p.match(/^\/api\/calendar\/([\w-]{1,64})$/)) && m === 'DELETE') { const r=await db(env, 'DELETE FROM calendar_events WHERE id=? AND user_id=?', x[1], u.id).run(); if(!r.meta?.changes)return fail('Événement introuvable.',404); return json({ ok: true }); }

  if (p === '/api/history' && m === 'GET') return historyGet(env, u);
  if (p === '/api/history' && m === 'POST') return historyPost(request, env, u);
  if ((x = p.match(/^\/api\/history\/([\w-]{1,64})$/)) && m === 'DELETE') { const r=await db(env, 'DELETE FROM history WHERE id=? AND user_id=?', x[1], u.id).run(); if(!r.meta?.changes)return fail('Historique introuvable.',404); return json({ ok: true }); }

  if (p === '/api/exercises' && m === 'GET') return exercisesGet(env, u);
  if (p === '/api/exercises/common' && m === 'POST') return commonAdd(request, env, u);
  if ((x = p.match(/^\/api\/exercises\/common\/([\w-]{1,64})$/))) {
    if (m === 'PUT') return commonEdit(request, env, u, x[1]);
    if (m === 'DELETE') return commonDelete(request, env, u, x[1]);
  }
  if (p === '/api/exercises/personal' && m === 'POST') return personalAdd(request, env, u);
  if ((x = p.match(/^\/api\/exercises\/personal\/([\w-]{1,64})$/))) {
    if (m === 'PUT') return personalEdit(request, env, u, x[1]);
    if (m === 'DELETE') { const r=await db(env, 'DELETE FROM user_exercises WHERE id=? AND user_id=?', x[1], u.id).run(); if(!r.meta?.changes)return fail('Exercice introuvable.',404); return json({ ok: true }); }
  }

  if (p === '/api/edit/status' && m === 'GET') return json({ ok: true, unlocked: await editOk(request, env, u) });
  if (p === '/api/edit/unlock' && m === 'POST') return editUnlock(request, env, u, secure);
  if (p === '/api/edit/lock' && m === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('edit_auth', '', 0, secure) });

  if (p.startsWith('/api/social/')) return social(request, env, url, u);
  return fail('Route inconnue.', 404);
}

/* ═════════════ Comptes ═════════════ */
async function register(request, env, secure) {
  const b = await readJson(request, 10000);
  if (!b) return fail('Données invalides.');
  const username = str(b.username, 40), email = str(b.email, 120).toLowerCase() || null, password = String(b.password ?? '');
  if (env.INVITE_CODE && !safeEq(String(b.invite ?? ''), env.INVITE_CODE)) return fail('Code d’invitation incorrect.', 403);
  if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) return fail('Pseudo : 3 à 24 caractères (lettres, chiffres, _ . -).');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Adresse e-mail invalide.');
  if (password.length < 8 || password.length > 200) return fail('Mot de passe : 8 caractères minimum.');
  if (await limited(env, 'register:' + clientIp(request), 8, 3600000)) return fail('Trop de créations de compte depuis cette connexion. Réessaie plus tard.', 429);
  const taken = await db(env, 'SELECT id FROM users WHERE lower(username)=lower(?) OR (? IS NOT NULL AND email=?)', username, email, email).first();
  if (taken) return fail('Pseudo ou e-mail déjà utilisé.', 409);

  const { salt, hash } = await newPassword(password), now = Date.now(), id = uid();
  await db(env, 'INSERT INTO users(id,username,email,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', id, username, email, hash, salt, now, now).run();
  await db(env, "INSERT INTO user_data(user_id,seances_json,settings_json,favorites_json,goals_json,updated_at) VALUES(?,?,?,?,?,?)", id, '{"items":[],"tomb":{}}', '{}', '[]', '{}', now).run();
  await db(env, 'INSERT OR IGNORE INTO profiles(user_id,updated_at) VALUES(?,?)', id, now).run();
  await migrateLegacyForFirstUser(env, id);
  const token = await createSession(env, id);
  return json({ ok: true, user: { id, username, email } }, 200, { 'Set-Cookie': cookie('session', token, SESSION_DAYS * 86400, secure) });
}

// Hachage factice : le temps de réponse ne révèle pas si un pseudo existe.
const DUMMY_SALT = b64(new Uint8Array(16));
async function login(request, env, secure) {
  const b = await readJson(request, 10000);
  if (!b) return fail('Données invalides.');
  const username = str(b.username, 40), password = String(b.password ?? '').slice(0, 200);
  const rk = 'login:' + clientIp(request) + ':' + username.toLowerCase();
  // Incrément atomique AVANT la tentative : la décision se base sur le compteur déjà incrémenté,
  // pas sur une lecture préalable — des tentatives concurrentes ne peuvent donc pas toutes passer
  // avant que le compteur ne les rattrape (cf. limited(), même principe).
  if (await limited(env, rk, 10, 900000)) return fail('Trop d’essais. Réessaie dans quelques minutes.', 429);
  const row = await db(env, 'SELECT id,username,email,password_hash,password_salt FROM users WHERE lower(username)=lower(?) OR email=lower(?)', username, username).first();
  const computed = await passHash(password, row ? row.password_salt : DUMMY_SALT);
  if (!row || !safeEq(computed, row.password_hash)) return fail('Pseudo ou mot de passe incorrect.', 401);
  await rlReset(env, rk);
  const token = await createSession(env, row.id);
  return json({ ok: true, user: { id: row.id, username: row.username, email: row.email } }, 200, { 'Set-Cookie': cookie('session', token, SESSION_DAYS * 86400, secure) });
}

async function logout(request, env, secure) {
  const t = cookiesOf(request).session;
  if (t) await db(env, 'DELETE FROM sessions WHERE token_hash=?', await sha(t)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('session', '', 0, secure) });
}

async function changePassword(request, env, auth) {
  const b = await readJson(request, 10000);
  if (!b) return fail('Données invalides.');
  const row = await db(env, 'SELECT password_hash,password_salt FROM users WHERE id=?', auth.user.id).first();
  if (!row || !safeEq(await passHash(String(b.current ?? ''), row.password_salt), row.password_hash)) return fail('Mot de passe actuel incorrect.', 403);
  const np = String(b.next ?? '');
  if (np.length < 8 || np.length > 200) return fail('Nouveau mot de passe : 8 caractères minimum.');
  const { salt, hash } = await newPassword(np);
  await db(env, 'UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?', hash, salt, Date.now(), auth.user.id).run();
  await db(env, 'DELETE FROM sessions WHERE user_id=? AND token_hash<>?', auth.user.id, auth.hash).run(); // déconnecte les autres appareils
  return json({ ok: true });
}

async function deleteAccount(request, env, auth, secure) {
  const b = await readJson(request, 10000);
  const row = await db(env, 'SELECT password_hash,password_salt FROM users WHERE id=?', auth.user.id).first();
  if (!b || !row || !safeEq(await passHash(String(b.password ?? ''), row.password_salt), row.password_hash)) return fail('Mot de passe incorrect.', 403);
  const id = auth.user.id;
  await env.DB.batch(['sessions', 'user_data', 'calendar_events', 'history', 'user_exercises', 'profiles'].map((t) => db(env, `DELETE FROM ${t} WHERE user_id=?`, id))
    .concat([db(env, 'DELETE FROM follows WHERE follower_id=? OR followee_id=?', id, id), db(env, 'UPDATE common_exercises SET created_by=NULL WHERE created_by=?', id), db(env, 'DELETE FROM users WHERE id=?', id)]));
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('session', '', 0, secure) });
}

/** Le tout premier compte créé récupère les séances de l'ancienne version (KV). Opération atomique. */
async function migrateLegacyForFirstUser(env, userId) {
  // On ne revendique la migration qu'après une lecture KV réussie. Ainsi une
  // panne temporaire de KV ne transforme pas une migration incomplète en migration définitive.
  try {
    const raw = await env.SEANCES_KV?.get('seances');
    if (raw === undefined) return;
    const claim = await db(env, "INSERT OR IGNORE INTO system_state(key,value) VALUES('legacy_imported',?)", userId).run();
    if (!claim.meta || claim.meta.changes !== 1) return;
    const legacy = raw ? readStored(raw) : { items: [], tomb: {} };
    if (legacy.items.length) await db(env, 'UPDATE user_data SET seances_json=?,updated_at=? WHERE user_id=?', JSON.stringify(legacy), Date.now(), userId).run();
  } catch (e) { console.error('migration KV', e); }
}
/* ═════════════ Séances : synchronisation avec fusion ═════════════ */
async function syncGet(env, u) {
  const row = await db(env, 'SELECT seances_json FROM user_data WHERE user_id=?', u.id).first();
  return json({ ok: true, ...readStored(row?.seances_json) });
}
async function syncPost(request, env, u) {
  const b = await readJson(request);
  if (!b || !Array.isArray(b.items)) return fail('Données invalides.');
  const tomb = {};
  for (const [k, v] of Object.entries(b.tomb && typeof b.tomb === 'object' ? b.tomb : {}).slice(0, 2000)) if (/^[\w-]{1,64}$/.test(k)) tomb[k] = clamp(v, 0, 9e15, 0);
  const incoming = { items: b.items.slice(0, 300).map(normalizeSession), tomb };
  const row = await db(env, 'SELECT seances_json FROM user_data WHERE user_id=?', u.id).first();
  const merged = mergeSeances(readStored(row?.seances_json), incoming);
  const out = JSON.stringify(merged);
  if (out.length > MAX_BODY) return fail('Trop de séances enregistrées.', 413);
  await db(env, 'UPDATE user_data SET seances_json=?,updated_at=? WHERE user_id=?', out, Date.now(), u.id).run();
  return json({ ok: true, ...merged });
}

/* ═════════════ Réglages du profil sportif ═════════════ */
function cleanSettings(o) {
  o = o && typeof o === 'object' ? o : {};
  const bool=(v)=>!!v, out={};
  if(o.level&&typeof o.level==='object') out.level={boulderMax:str(o.level.boulderMax,4),routeMax:str(o.level.routeMax,4),years:o.level.years===null||o.level.years===''||o.level.years===undefined?null:clamp(o.level.years,0,80,null)};
  if(o.equipment&&typeof o.equipment==='object') out.equipment=Object.fromEntries(['wall','hangboard','bar','dips','weights','band'].map(k=>[k,bool(o.equipment[k])]));
  if(o.avoid&&typeof o.avoid==='object') out.avoid=Object.fromEntries(['fingers','shoulders','elbows','knees'].map(k=>[k,bool(o.avoid[k])]));
  if(Array.isArray(o.climbingLogs)) out.climbingLogs=o.climbingLogs.slice(0,500).map(x=>({id:str(x?.id,64)||uid(),date:clamp(x?.date,0,9e15,Date.now()),type:str(x?.type,30),grade:str(x?.grade,20),result:['send','attempt','flash','top','fail'].includes(x?.result)?x.result:'attempt',attempts:clamp(x?.attempts,1,999,1),style:str(x?.style,60),note:str(x?.note,500)}));
  for(const k of ['sound','vibration','voice','keepAwake','handsFree','onboarded']) if(k in o) out[k]=bool(o[k]);
  if('defaultRest' in o) out.defaultRest=clamp(o.defaultRest,0,600,60);
  if(o.sportProfile&&typeof o.sportProfile==='object') {
    const sp={version:2,activities:{},metrics:[],notes:[]};
    for(const [id,a] of Object.entries(o.sportProfile.activities||{}).slice(0,50)) {
      if(!a||typeof a!=='object') continue;
      sp.activities[str(id,60)]={id:str(a.id||id,60),label:str(a.label,80),emoji:str(a.emoji,8),custom:!!a.custom,aliases:Array.isArray(a.aliases)?a.aliases.slice(0,20).map(x=>str(x,60)).filter(Boolean):[],domains:Array.isArray(a.domains)?a.domains.slice(0,30).map(d=>({key:str(d?.key,50),name:str(d?.name,80),description:str(d?.description,180),score:d?.score==null?null:clamp(d.score,0,100,null)})):[]};
    }
    for(const m of (Array.isArray(o.sportProfile.metrics)?o.sportProfile.metrics:[]).slice(0,300)) if(m&&str(m.name,80)) sp.metrics.push({id:str(m.id,64)||uid(),name:str(m.name,80),activityId:str(m.activityId,60),domain:str(m.domain,50),value:clamp(m.value,-100000,100000,null),unit:str(m.unit,20),score:m.score==null?null:clamp(m.score,0,100,null),note:str(m.note,300),updatedAt:clamp(m.updatedAt,0,9e15,Date.now())});
    sp.notes=Array.isArray(o.sportProfile.notes)?o.sportProfile.notes.slice(0,50).map(x=>str(x,500)).filter(Boolean):[];
    out.sportProfile=sp;
  }
  // Objectifs utilisateur (S.settings.goals côté client) : sans cette entrée, ils étaient silencieusement
  // supprimés à chaque synchronisation des réglages, car cleanSettings() est une liste blanche stricte.
  if (Array.isArray(o.goals)) out.goals = o.goals.slice(0, 100).map((x) => (x && str(x.name, 80) ? {
    id: str(x.id, 64) || uid(),
    name: str(x.name, 80),
    target: clamp(x.target, -1000000, 1000000, 0),
    unit: str(x.unit, 20),
    kind: str(x.kind, 20) || 'manual',
    current: clamp(x.current, -1000000, 1000000, 0),
    since: isDate(x.since) ? x.since : undefined,
  } : null)).filter(Boolean);
  return out;
}
async function settingsGet(env, u) {
  const row = await db(env, 'SELECT settings_json FROM user_data WHERE user_id=?', u.id).first();
  let s = {}; try { s = JSON.parse(row?.settings_json || '{}'); } catch { /* vide */ }
  return json({ ok: true, settings: cleanSettings(s) });
}
async function settingsPost(request, env, u) {
  const b = await readJson(request, 20000);
  if (!b) return fail('Données invalides.');
  const clean = cleanSettings(b.settings ?? b);
  await db(env, 'UPDATE user_data SET settings_json=?,updated_at=? WHERE user_id=?', JSON.stringify(clean), Date.now(), u.id).run();
  return json({ ok: true, settings: clean });
}

/* ═════════════ Calendrier ═════════════ */
const rowToEvent = (r) => ({ id: r.id, date: r.event_date, sessionId: r.session_id, title: r.title || '', completed: !!r.completed, recurrence: r.recurrence_json ? safeParse(r.recurrence_json) : null });
function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));

async function calendarGet(url, env, u) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  let sql = 'SELECT id,event_date,session_id,title,completed,recurrence_json FROM calendar_events WHERE user_id=?';
  const args = [u.id];
  if (isDate(from)) { sql += ' AND (event_date>=? OR recurrence_json IS NOT NULL)'; args.push(from); }
  if (isDate(to)) { sql += ' AND event_date<=?'; args.push(to); }
  const r = await db(env, sql + ' ORDER BY event_date LIMIT 2000', ...args).all();
  return json({ ok: true, events: r.results.map(rowToEvent) });
}
async function calendarPost(request, env, u) {
  const b = await readJson(request, 10000);
  if (!b || !isDate(b.date)) return fail('Date invalide.');
  const id = /^[\w-]{1,64}$/.test(b.id || '') ? b.id : uid();
  let rec = null;
  if (b.recurrence && b.recurrence.freq === 'weekly') rec = { freq: 'weekly', until: isDate(b.recurrence.until) ? b.recurrence.until : null };
  const count = await db(env, 'SELECT COUNT(*) c FROM calendar_events WHERE user_id=?', u.id).first();
  if (Number(count?.c) > 3000) return fail('Trop d’événements.', 413);
  const now = Date.now();
  const r = await db(env, `INSERT INTO calendar_events(id,user_id,event_date,session_id,title,completed,recurrence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET event_date=excluded.event_date,session_id=excluded.session_id,title=excluded.title,completed=excluded.completed,recurrence_json=excluded.recurrence_json,updated_at=excluded.updated_at
    WHERE calendar_events.user_id=excluded.user_id`,
    id, u.id, b.date, b.sessionId ? str(b.sessionId, 64) : null, str(b.title, 120), b.completed ? 1 : 0, rec ? JSON.stringify(rec) : null, now, now).run();
  if (!r.meta || r.meta.changes === 0) return fail('Identifiant déjà utilisé.', 409);
  return json({ ok: true, event: { id, date: b.date, sessionId: b.sessionId || null, title: str(b.title, 120), completed: !!b.completed, recurrence: rec } });
}

/* ═════════════ Historique des séances effectuées ═════════════ */
function cleanHistoryData(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    rpe: clamp(d.rpe, 1, 5, 0), focus: str(d.focus, 20),
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 60).map((e) => ({
      name: str(e?.name, 80), libId: str(e?.libId, 40), group: str(e?.group, 20),
      intensity: ['low', 'mod', 'high'].includes(e?.intensity) ? e.intensity : '', risk: ['finger', 'shoulder', 'elbow', 'knee'].includes(e?.risk) ? e.risk : '',
      muscles: (Array.isArray(e?.muscles) ? e.muscles : []).slice(0, 12).map((m) => str(m, 40)).filter(Boolean),
      sets: (Array.isArray(e?.sets) ? e.sets : []).slice(0, 30).map((s) => ({ reps: clamp(s?.reps, 0, 9999, 0), seconds: clamp(s?.seconds, 0, 86400, 0), load: clamp(s?.load, 0, 1000, 0), done: s?.done !== false })),
    })).filter((e) => e.name),
  };
}
async function historyGet(env, u) {
  const r = await db(env, 'SELECT id,session_id,session_name,started_at,duration_seconds,data_json FROM history WHERE user_id=? ORDER BY started_at DESC LIMIT 600', u.id).all();
  return json({ ok: true, history: r.results.map(rowToHistory) });
}
const rowToHistory = (r) => ({ id: r.id, sessionId: r.session_id, sessionName: r.session_name, startedAt: r.started_at, durationSeconds: r.duration_seconds, data: safeParse(r.data_json) || {} });
async function historyPost(request, env, u) {
  const b = await readJson(request, 80000);
  if (!b) return fail('Données invalides.');
  const now = Date.now(), startedAt = clamp(b.startedAt, now - 800 * DAY, now + DAY, 0);
  if (!startedAt) return fail('Date invalide.');
  const id = /^[\w-]{1,64}$/.test(b.id || '') ? b.id : uid();
  const data = JSON.stringify(cleanHistoryData(b.data));
  if (data.length > 60000) return fail('Séance trop volumineuse.', 413);
  // ON CONFLICT scopé au bon user_id (même motif que calendarPost) : un retry idempotent du même
  // utilisateur réussit toujours ; une collision d'identifiant avec un AUTRE utilisateur (en pratique
  // quasi impossible avec crypto.randomUUID, mais jamais à exclure) ne doit jamais être avalée
  // silencieusement — meta.changes===0 le révèle et on renvoie une erreur claire plutôt qu'un faux succès.
  const r = await db(env, `INSERT INTO history(id,user_id,session_id,session_name,started_at,duration_seconds,data_json) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,session_name=excluded.session_name,started_at=excluded.started_at,duration_seconds=excluded.duration_seconds,data_json=excluded.data_json
    WHERE history.user_id=excluded.user_id`,
    id, u.id, b.sessionId ? str(b.sessionId, 64) : null, str(b.sessionName, 100) || 'Séance', startedAt, clamp(b.durationSeconds, 0, 86400, 0), data).run();
  if (!r.meta || r.meta.changes === 0) return fail('Identifiant déjà utilisé.', 409);
  return json({ ok: true, id });
}

/* ═════════════ Exercices : commun (tout le monde) et personnel ═════════════ */
function cleanExercise(x) { const e = normalizeEx(x); delete e.id; delete e.block; delete e.isNew; return e; }
async function exercisesGet(env, u) {
  const c = await db(env, 'SELECT id,name,data_json,created_by FROM common_exercises ORDER BY name LIMIT 2500').all();
  const p = await db(env, 'SELECT id,name,data_json FROM user_exercises WHERE user_id=? ORDER BY name LIMIT 1000', u.id).all();
  const map = (r) => ({ id: r.id, name: r.name, createdBy: r.created_by || null, data: { ...(safeParse(r.data_json) || {}), name: r.name } });
  return json({ ok: true, common: c.results.map(map), personal: p.results.map(map) });
}
async function commonAdd(request, env, u) {
  const b = await readJson(request, 20000);
  if (!b || !str(b.name ?? b.exercise?.name, 80)) return fail('Nom requis.');
  if (await limited(env, 'common-add:' + u.id, 40, DAY)) return fail('Trop d’ajouts aujourd’hui. Réessaie demain.', 429);
  const data = cleanExercise({ ...(b.exercise || {}), name: b.name ?? b.exercise?.name }), now = Date.now(), id = uid();
  const count = await db(env, 'SELECT COUNT(*) c FROM common_exercises').first();
  if (Number(count?.c) > 2500) return fail('La bibliothèque commune est pleine.', 413);
  await db(env, 'INSERT INTO common_exercises(id,name,data_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)', id, data.name, JSON.stringify(data), u.id, now, now).run();
  return json({ ok: true, id });
}
async function commonEdit(request, env, u, id) {
  const current = await db(env, 'SELECT created_by FROM common_exercises WHERE id=?', id).first();
  if (!current) return fail('Exercice introuvable.', 404);
  const owner = current.created_by === u.id;
  if (!owner && !(await editOk(request, env, u))) return fail('Droit de modification requis.', 403);
  const b = await readJson(request, 20000);
  if (!b) return fail('Données invalides.');
  const data = cleanExercise(b.exercise || b);
  const r=await db(env, 'UPDATE common_exercises SET name=?,data_json=?,updated_at=? WHERE id=?', data.name, JSON.stringify(data), Date.now(), id).run();
  if(!r.meta?.changes) return fail('Exercice introuvable.',404);
  return json({ ok: true });
}
async function commonDelete(request, env, u, id) {
  const current = await db(env, 'SELECT created_by FROM common_exercises WHERE id=?', id).first();
  if (!current) return fail('Exercice introuvable.', 404);
  const owner = current.created_by === u.id;
  if (!owner && !(await editOk(request, env, u))) return fail('Droit de suppression requis.', 403);
  const r=await db(env, 'DELETE FROM common_exercises WHERE id=?', id).run();
  if(!r.meta?.changes) return fail('Exercice introuvable.',404);
  return json({ ok: true });
}
async function personalAdd(request, env, u) {
  const b = await readJson(request, 20000);
  const data = b && cleanExercise(b.exercise || b);
  if (!data || !str(data.name, 80)) return fail('Nom requis.');
  const count = await db(env, 'SELECT COUNT(*) c FROM user_exercises WHERE user_id=?', u.id).first();
  if (Number(count?.c) >= 1000) return fail('Trop d’exercices personnels.', 413);
  const id = uid(), now = Date.now();
  await db(env, 'INSERT INTO user_exercises(id,user_id,name,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?)', id, u.id, data.name, JSON.stringify(data), now, now).run();
  return json({ ok: true, id });
}
async function personalEdit(request, env, u, id) {
  const b = await readJson(request, 20000);
  const data = b && cleanExercise(b.exercise || b);
  if (!data) return fail('Données invalides.');
  const r=await db(env, 'UPDATE user_exercises SET name=?,data_json=?,updated_at=? WHERE id=? AND user_id=?', data.name, JSON.stringify(data), Date.now(), id, u.id).run();
  if(!r.meta?.changes) return fail('Exercice introuvable.',404);
  return json({ ok: true });
}

/* Code de modification de la bibliothèque commune : cookie signé, lié au compte, valable 30 jours. */
async function editOk(request, env, u) {
  if (!env.EDIT_CODE) return false;
  const c = cookiesOf(request).edit_auth;
  if (!c) return false;
  const [uidPart, exp, sig] = c.split('.');
  if (uidPart !== u.id || Number(exp) < Date.now()) return false;
  return safeEq(sig, await hmac(env.EDIT_CODE, `${uidPart}.${exp}`));
}
async function editUnlock(request, env, u, secure) {
  if (!env.EDIT_CODE) return fail('EDIT_CODE n’est pas configuré sur le serveur.', 500);
  const b = await readJson(request, 2000);
  const rk = 'edit:' + clientIp(request) + ':' + u.id;
  if (await rlBlocked(env, rk, 5, 900000)) return fail('Trop d’essais. Réessaie dans quelques minutes.', 429);
  if (!b || !safeEq(String(b.code ?? ''), env.EDIT_CODE)) { await rlHit(env, rk, 900000); return fail('Code incorrect.', 403); }
  await rlReset(env, rk);
  const exp = Date.now() + 30 * DAY;
  const value = `${u.id}.${exp}.${await hmac(env.EDIT_CODE, `${u.id}.${exp}`)}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('edit_auth', value, 30 * 86400, secure) });
}

/* ═════════════ Communauté : partage optionnel de la progression ═════════════ */
const VISIBILITY = ['private', 'followers', 'public'];
async function ensureProfile(env, id) {
  await db(env, 'INSERT OR IGNORE INTO profiles(user_id,updated_at) VALUES(?,?)', id, Date.now()).run();
  return db(env, 'SELECT visibility,share_stats,share_records,share_sessions FROM profiles WHERE user_id=?', id).first();
}
const profileOut = (p) => ({ visibility: p.visibility, shareStats: !!p.share_stats, shareRecords: !!p.share_records, shareSessions: !!p.share_sessions });

async function social(request, env, url, u) {
  const p = url.pathname.slice('/api/social/'.length), m = request.method;
  const like = (q) => '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

  if (p === 'me' && m === 'GET') {
    const prof = await ensureProfile(env, u.id);
    const pending = await db(env, "SELECT f.id,us.username,f.created_at FROM follows f JOIN users us ON us.id=f.follower_id WHERE f.followee_id=? AND f.status='pending' ORDER BY f.created_at DESC LIMIT 50", u.id).all();
    const following = await db(env, 'SELECT us.username,f.status FROM follows f JOIN users us ON us.id=f.followee_id WHERE f.follower_id=? ORDER BY us.username LIMIT 100', u.id).all();
    const followers = await db(env, "SELECT us.username FROM follows f JOIN users us ON us.id=f.follower_id WHERE f.followee_id=? AND f.status='accepted' ORDER BY us.username LIMIT 100", u.id).all();
    return json({ ok: true, profile: profileOut(prof), pending: pending.results.map((r) => ({ id: r.id, username: r.username, createdAt: r.created_at })), following: following.results, followers: followers.results });
  }
  if (p === 'profile' && m === 'POST') {
    const b = await readJson(request, 2000);
    if (!b || !VISIBILITY.includes(b.visibility)) return fail('Visibilité invalide.');
    await ensureProfile(env, u.id);
    await db(env, 'UPDATE profiles SET visibility=?,share_stats=?,share_records=?,share_sessions=?,updated_at=? WHERE user_id=?', b.visibility, b.shareStats ? 1 : 0, b.shareRecords ? 1 : 0, b.shareSessions ? 1 : 0, Date.now(), u.id).run();
    return json({ ok: true });
  }
  if (p === 'search' && m === 'GET') {
    const q = str(url.searchParams.get('q'), 30);
    if (q.length < 2) return json({ ok: true, users: [] });
    const r = await db(env, `SELECT us.id,us.username,pr.visibility FROM users us JOIN profiles pr ON pr.user_id=us.id
      WHERE pr.visibility<>'private' AND us.id<>? AND us.username LIKE ? ESCAPE '\\' ORDER BY us.username LIMIT 10`, u.id, like(q)).all();
    const rels = await db(env, 'SELECT followee_id,status FROM follows WHERE follower_id=?', u.id).all();
    const rel = new Map(rels.results.map((x) => [x.followee_id, x.status]));
    return json({ ok: true, users: r.results.map((x) => ({ username: x.username, visibility: x.visibility, relation: rel.get(x.id) || null })) });
  }
  if (p === 'follow' && m === 'POST') {
    const b = await readJson(request, 2000);
    const name = str(b?.username, 40);
    if (await limited(env, 'follow:' + u.id, 60, DAY)) return fail('Trop de demandes aujourd’hui.', 429);
    const target = await db(env, 'SELECT us.id,pr.visibility FROM users us JOIN profiles pr ON pr.user_id=us.id WHERE lower(us.username)=lower(?)', name).first();
    if (!target || target.id === u.id || target.visibility === 'private') return fail('Utilisateur introuvable ou profil privé.', 404);
    const status = target.visibility === 'public' ? 'accepted' : 'pending';
    await db(env, 'INSERT OR IGNORE INTO follows(id,follower_id,followee_id,status,created_at) VALUES(?,?,?,?,?)', uid(), u.id, target.id, status, Date.now()).run();
    const cur = await db(env, 'SELECT status FROM follows WHERE follower_id=? AND followee_id=?', u.id, target.id).first();
    return json({ ok: true, status: cur?.status || status });
  }
  if (p === 'respond' && m === 'POST') {
    const b = await readJson(request, 2000);
    if (!b || !/^[\w-]{1,64}$/.test(b.id || '')) return fail('Demande invalide.');
    if (b.accept) await db(env, "UPDATE follows SET status='accepted' WHERE id=? AND followee_id=?", b.id, u.id).run();
    else await db(env, 'DELETE FROM follows WHERE id=? AND followee_id=?', b.id, u.id).run();
    return json({ ok: true });
  }
  if ((p === 'unfollow' || p === 'remove-follower') && m === 'POST') {
    const b = await readJson(request, 2000);
    const other = await db(env, 'SELECT id FROM users WHERE lower(username)=lower(?)', str(b?.username, 40)).first();
    if (other) {
      if (p === 'unfollow') await db(env, 'DELETE FROM follows WHERE follower_id=? AND followee_id=?', u.id, other.id).run();
      else await db(env, 'DELETE FROM follows WHERE follower_id=? AND followee_id=?', other.id, u.id).run();
    }
    return json({ ok: true });
  }
  const tz = clamp(url.searchParams.get('tz'), -840, 840, 0);
  if (p === 'feed' && m === 'GET') {
    const r = await db(env, "SELECT us.id,us.username FROM follows f JOIN users us ON us.id=f.followee_id WHERE f.follower_id=? AND f.status='accepted' ORDER BY us.username LIMIT 30", u.id).all();
    const people = [];
    for (const t of r.results) { const c = await cardFor(env, u.id, t.id, t.username, tz); if (c) people.push(c); }
    return json({ ok: true, people });
  }
  const one = p.match(/^user\/([^/]{1,40})$/);
  if (one && m === 'GET') {
    const t = await db(env, 'SELECT id,username FROM users WHERE lower(username)=lower(?)', decodeURIComponent(one[1])).first();
    const card = t && (await cardFor(env, u.id, t.id, t.username, tz));
    return card ? json({ ok: true, person: card }) : fail('Profil introuvable ou privé.', 404);
  }
  return fail('Route inconnue.', 404);
}

/** Ce que `viewer` a le droit de voir de `targetId` (le serveur applique le choix de la personne, pas l'interface). */
async function cardFor(env, viewerId, targetId, username, tz) {
  const prof = await db(env, 'SELECT visibility,share_stats,share_records,share_sessions FROM profiles WHERE user_id=?', targetId).first();
  if (!prof || prof.visibility === 'private') return null;
  if (prof.visibility === 'followers') {
    const f = await db(env, "SELECT 1 ok FROM follows WHERE follower_id=? AND followee_id=? AND status='accepted'", viewerId, targetId).first();
    if (!f) return null;
  }
  const wantData = prof.share_records;
  const r = await db(env, `SELECT session_name,started_at,duration_seconds${wantData ? ',data_json' : ''} FROM history WHERE user_id=? ORDER BY started_at DESC LIMIT 300`, targetId).all();
  const rows = r.results.map((x) => ({ sessionName: x.session_name, startedAt: x.started_at, durationSeconds: x.duration_seconds, data: wantData ? safeParse(x.data_json) || {} : {} }));
  const s = summarizeHistory(rows, Date.now(), tz);
  return {
    username, visibility: prof.visibility,
    stats: prof.share_stats ? { sessions7: s.sessions7, sessions30: s.sessions30, minutes30: s.minutes30, streak: s.streak, weekly: s.weekly, lastAt: s.lastAt } : null,
    records: prof.share_records ? s.records : null,
    recent: prof.share_sessions ? s.recent : null,
  };
}
