// worker.js — API + service des fichiers du site « Séances entraînement » (Cloudflare Workers + D1 + KV).
// Le serveur est l'autorité pour toutes les permissions : l'utilisateur est toujours déterminé par sa session
// (jamais par un identifiant envoyé par le client), et chaque requête SQL est paramétrée.
import { SCHEMA, ADD_COLUMNS } from './schema.js';
import { mergeSeances, readStored, normalizeSession, normalizeEx, normalizeContext, normalizeHistory, summarizeHistory, clamp, uid } from './public/shared.js';
import { cleanItem, cleanId, COLLECTIONS } from './public/items.js';
import { legacyItems } from './server/migrate.js';
import { aiDraft, aiChat, aiGoal, aiIntent, cleanCaps } from './server/ai.js';
import { estimateLevel } from './public/estimate.js';
import { METRICS, ACTIVITIES, CAPACITIES, SKILLS } from './public/model.js';
import { sanitizeForPublication } from './server/publish.js';
import { KINDS as GLOBAL_KINDS, ID_OK as GLOBAL_ID, cleanGlobal } from './server/global.js';
import { duoCode, normCode, cleanDuoState, DUO_TTL, DUO_MAX } from './server/duo.js';
import { changesRoute } from './server/changes.js';
import { vapid, sendPush, runReminders, messageFor, notifyType, updateNotice, TYPES as PUSH_TYPES } from './server/push.js';

const APP_VERSION = '8.22.0';
const SESSION_DAYS = 365;           // on reste connecté 1 an (renouvelé à l'usage)
const PBKDF2_ITERATIONS = 100000;   // maximum autorisé sur Workers
const DAY = 86400000;
const MAX_BODY = 1_500_000;
const MAX_ITEMS_PER_USER = 20000;

// Seuls ces fichiers sont servis publiquement (worker.js, wrangler.json, README, tests… restent privés).
// tests/assets.test.mjs vérifie que chaque module importé par le navigateur figure ici ET dans le précache du Service Worker.
const PUBLIC_FILES = new Set(['/', '/index.html', '/style.css', '/boot.js', '/app.js', '/ui.js', '/state.js', '/views-home.js', '/views-progress.js', '/views-library.js', '/views-profile.js', '/views-settings.js', '/views-setup.js', '/install.js', '/questions.js', '/views-ai.js', '/tour.js', '/move.js', '/news.js', '/hr.js', '/fx.js', '/anim.js', '/timer.js', '/sound.js', '/climb.js', '/views-climb.js', '/motivation.js', '/views-motiv.js', '/program.js', '/views-program.js', '/views-coach.js', '/reminders.js', '/ics.js', '/layout.js', '/body.js', '/body-rules.js', '/intentions.js', '/views-gen.js', '/inbox.js', '/sources.js', '/srcui.js', '/catalog.js', '/views-catalog.js', '/qr.js', '/share.js', '/duo.js', '/scene.js', '/i18n.js', '/format.js', '/finder.js', '/find-ui.js', '/global.js', '/content.js', '/help.js', '/merge.js', '/sfilter.js', '/explain.js', '/climbplan.js', '/views-climbplan.js', '/surprise.js', '/guide.js', '/goaldone.js', '/nav.js', '/places.js', '/picker.js', '/hints.js', '/player.js',
  '/engine.js', '/library.js', '/shared.js', '/items.js', '/model.js', '/grading.js', '/brain.js', '/estimate.js', '/generator.js', '/csv.js', '/search.js', '/anatomy.js', '/commands.js', '/outbox.js',
  '/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/robots.txt']);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

// Annonce d'une nouvelle version : dès la première requête reçue après le déploiement (sans attendre la tâche
// planifiée de 15 min). Une seule vérification par instance du Worker ; la base garantit une seule annonce.
let announcedBuild = '';
function announceSoon(env, ctx) {
  const b = buildId(env);
  if (announcedBuild === b || !env.DB || !ctx?.waitUntil) return;
  announcedBuild = b;
  ctx.waitUntil(ensureSchema(env).then(() => updateNotice(env, b)).then((n) => { if (n) console.log('mise à jour annoncée', n); }).catch((e) => { announcedBuild = ''; console.error('annonce', e?.message || e); }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    announceSoon(env, ctx);
    try {
      const res = url.pathname.startsWith('/api/') ? await handleApi(request, env, url) : await serveAsset(request, env, url);
      if (url.protocol === 'https:') { const h = new Headers(res.headers); h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h }); }
      return res;
    } catch (err) {
      console.error('Erreur non gérée', err && err.stack || err);
      return json({ ok: false, error: 'Erreur serveur. Réessaie dans un instant.' }, 500);
    }
  },
  /** Tâche planifiée (cron, voir wrangler.json) : rappels d'entraînement. */
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    const job = (async () => { await ensureSchema(env); const n = await runReminders(env); if (n) console.log('rappels envoyés', n); const u = await updateNotice(env, buildId(env)); if (u) console.log('mise à jour annoncée', u); })().catch((e) => console.error('rappels', e?.message || e));
    if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
  },
};

/* ═════════════ Fichiers statiques ═════════════ */
/** Identifiant du déploiement : fourni par Cloudflare (binding version_metadata), sinon la version de l'application. */
const buildId = (env) => String(env.CF_VERSION_METADATA?.id || APP_VERSION).replace(/[^\w.-]/g, '').slice(0, 40) || APP_VERSION;
async function serveAsset(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405, headers: SECURITY_HEADERS });
  if (!PUBLIC_FILES.has(url.pathname)) return new Response('Introuvable', { status: 404, headers: SECURITY_HEADERS });
  let res = await env.ASSETS.fetch(request);
  // Service Worker : on y injecte l'identifiant du déploiement Cloudflare. Chaque déploiement (même sans changer
  // APP_VERSION) modifie donc sw.js : le navigateur détecte la nouvelle version et l'app propose la mise à jour.
  if (url.pathname === '/sw.js' && res.ok && request.method === 'GET') {
    const text = (await res.text()).replace("const BUILD = 'dev';", `const BUILD = ${JSON.stringify(buildId(env))};`);
    res = new Response(text, { status: 200, headers: res.headers });
  }
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  // Pas de cache HTTP long : le Service Worker gère le hors-ligne, et une nouvelle version doit arriver immédiatement.
  headers.set('Cache-Control', url.pathname === '/sw.js' ? 'no-cache' : 'no-cache, max-age=0');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/* ═════════════ Utilitaires ═════════════ */
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra } });
}
const fail = (error, status = 400, more = {}) => json({ ok: false, error, ...more }, status);

const b64 = (bytes) => { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); };
const unb64 = (s) => { s = s.replaceAll('-', '+').replaceAll('_', '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const enc = new TextEncoder();
const sha = async (t) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t))));
/** Comparaison en temps constant (longueur comprise). */
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
const ID_RE = /^[\w-]{1,64}$/;
function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));

async function readJson(request, max = MAX_BODY) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) throw Object.assign(new Error('trop gros'), { status: 413 });
  const text = await request.text();
  if (text.length > max) throw Object.assign(new Error('trop gros'), { status: 413 });
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/* Limitation de débit atomique : l'incrément ET la décision reposent sur une seule écriture (UPSERT … RETURNING). */
async function rlState(env, key) {
  const row = await db(env, 'SELECT value FROM system_state WHERE key=?', 'rl:' + key).first();
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
async function rlHit(env, key, windowMs) {
  const k = 'rl:' + key, now = Date.now();
  const r = await db(env, `INSERT INTO system_state(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=CASE
      WHEN ? - CAST(json_extract(system_state.value,'$.t') AS INTEGER) < ?
      THEN json_set(system_state.value,'$.n',CAST(json_extract(system_state.value,'$.n') AS INTEGER)+1)
      ELSE json_object('n',1,'t',?) END
    RETURNING value`, k, JSON.stringify({ n: 1, t: now }), now, windowMs, now).first();
  try { return JSON.parse(r?.value || '{"n":1}'); } catch { return { n: 1, t: now }; }
}
const rlReset = (env, key) => db(env, 'DELETE FROM system_state WHERE key=?', 'rl:' + key).run();
/** true si la limite est dépassée. L'incrément a lieu AVANT la décision : des requêtes concurrentes ne peuvent pas toutes passer. */
async function limited(env, key, max, windowMs) {
  const s = await rlState(env, key), now = Date.now();
  if (s && now - Number(s.t || 0) < windowMs && Number(s.n || 0) >= max) return true;
  const hit = await rlHit(env, key, windowMs);
  return Number(hit.n || 0) > max;
}

/* ═════════════ Schéma et migrations ═════════════ */
// Une promesse d'initialisation par base (WeakMap) : chaque base neuve (tests) est initialisée, une seule fois.
const schemaReady = new WeakMap();
async function tableColumns(env, table) {
  const r = await db(env, `PRAGMA table_info(${table})`).all();
  return new Set(r.results.map((x) => x.name));
}
async function upgradeSchema(env) {
  // Anciennes versions : mêmes tables mais structure différente pour profiles / follows. On complète sans rien supprimer.
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
      // Les abonnements orphelins (compte supprimé) sont ignorés : sinon la contrainte de clé étrangère ferait
      // échouer toute la mise à niveau et bloquerait l'application.
      env.DB.prepare("INSERT OR IGNORE INTO follows_v5(id,follower_id,followee_id,status,created_at) SELECT 'legacy-' || follower_id || '-' || followed_id, follower_id, followed_id, 'accepted', created_at FROM follows WHERE follower_id IN (SELECT id FROM users) AND followed_id IN (SELECT id FROM users)"),
      env.DB.prepare('DROP TABLE follows'),
      env.DB.prepare('ALTER TABLE follows_v5 RENAME TO follows'),
    ]);
  }
  await db(env, 'CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id,status)').run();
  // V2 : colonnes ajoutées (si absentes).
  const cache = {};
  for (const [table, col, def] of ADD_COLUMNS) {
    cache[table] ||= await tableColumns(env, table);
    if (cache[table].size && !cache[table].has(col)) { await db(env, `ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run(); cache[table].add(col); }
  }
}
function ensureSchema(env) {
  let p = schemaReady.get(env.DB);
  if (!p) {
    p = (async () => {
      await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
      await upgradeSchema(env);
    })().catch((e) => { schemaReady.delete(env.DB); throw e; });
    schemaReady.set(env.DB, p);
  }
  return p;
}

/* ═════════════ Sessions (connexion durable) ═════════════ */
async function createSession(env, userId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
  await db(env, 'DELETE FROM sessions WHERE expires_at<?', now).run();
  await db(env, 'INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)', uid(), userId, await sha(token), now + SESSION_DAYS * DAY, now).run();
  if (Math.random() < 0.05) await housekeeping(env, now);
  return token;
}
async function housekeeping(env, now) {
  try {
    await db(env, 'DELETE FROM op_log WHERE created_at<?', now - 7 * DAY).run();
    await db(env, "DELETE FROM system_state WHERE key LIKE 'rl:%' AND CAST(json_extract(value,'$.t') AS INTEGER)<?", now - 2 * DAY).run();
  } catch (e) { console.error('housekeeping', e); }
}
/** Révoque le jeton présenté par le navigateur (anti-fixation : une nouvelle connexion part toujours d'un jeton neuf). */
async function revokePresented(request, env) {
  const t = cookiesOf(request).session;
  if (t) await db(env, 'DELETE FROM sessions WHERE token_hash=?', await sha(t)).run();
}
async function authenticate(request, env) {
  const token = cookiesOf(request).session;
  if (!token) return null;
  const now = Date.now(), hash = await sha(token);
  const row = await db(env, 'SELECT u.id,u.username,u.email,u.is_admin,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', hash, now).first();
  if (!row) return null;
  let renew = false;
  if (row.expires_at - now < (SESSION_DAYS - 1) * DAY) { // prolonge au plus une fois par jour
    await db(env, 'UPDATE sessions SET expires_at=? WHERE token_hash=?', now + SESSION_DAYS * DAY, hash).run();
    renew = true;
  }
  return { user: { id: row.id, username: row.username, email: row.email, isAdmin: !!row.is_admin }, token, hash, renew };
}

/* ═════════════ Déménagement vers la nouvelle adresse ═════════════ */
// L'ancienne adresse (…workers.dev) envoie les visiteurs vers la nouvelle (MOVE_TO, par défaut seances-sport.pages.dev),
// en emportant ce qui n'existe que sur l'appareil (réglages, données en attente d'envoi, données du mode invité) et la
// connexion. Le transfert passe par un code à usage unique (256 bits, 15 min) ; seul son empreinte est stockée.
// Sur la nouvelle adresse, la personne confirme d'abord (« Continuer avec le compte X ») : un lien piégé ne peut pas
// connecter quelqu'un au compte d'un autre à son insu.
const HANDOFF_TTL = 15 * 60000, HANDOFF_MAX = 1800000;
function moveTarget(env, url) {
  const to = env.MOVE_TO ?? 'https://seances-sport.pages.dev';
  if (!to) return null;
  let t; try { t = new URL(to); } catch { return null; }
  if (t.protocol !== 'https:' || t.host === url.host) return null;
  const from = env.MOVE_FROM || 'seances-entrainement.';
  const matches = from.endsWith('.') ? url.hostname.startsWith(from) && url.hostname.endsWith('.workers.dev') : url.hostname === from;
  return matches ? t.origin : null;
}
const handoffKey = async (code) => 'ho:' + await sha(String(code || ''));
async function handoffCreate(request, env) {
  if (!moveTarget(env, new URL(request.url))) return fail('Déménagement non actif sur cette adresse.', 404);
  if (await limited(env, 'handoff:' + clientIp(request), 20, 3600000)) return fail('Trop d’essais. Réessaie plus tard.', 429);
  const b = await readJson(request, HANDOFF_MAX);
  if (!b) return fail('Données invalides.');
  const local = {};
  if (b.ls && typeof b.ls === 'object') for (const [k, v] of Object.entries(b.ls)) if (/^sea:[\w:.-]{1,80}$/.test(k) && k !== 'sea:user' && typeof v === 'string') local[k] = v;
  const auth = await authenticate(request, env);
  const code = b64(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
  const value = JSON.stringify({ t: now, uid: auth?.user.id || null, guest: !auth && !!b.guest, ls: local, snap: !auth && b.guest && b.snap && typeof b.snap === 'object' ? b.snap : null });
  if (value.length > HANDOFF_MAX) return fail('Données trop volumineuses pour être transférées.', 413);
  await db(env, "DELETE FROM system_state WHERE key LIKE 'ho:%' AND CAST(json_extract(value,'$.t') AS INTEGER)<?", now - HANDOFF_TTL).run();
  await db(env, 'INSERT INTO system_state(key,value) VALUES(?,?)', await handoffKey(code), value).run();
  return json({ ok: true, code });
}
async function handoffRead(env, code, consume) {
  if (!/^[\w-]{40,50}$/.test(String(code || ''))) return null;
  const key = await handoffKey(code);
  const row = consume ? await db(env, 'DELETE FROM system_state WHERE key=? RETURNING value', key).first() : await db(env, 'SELECT value FROM system_state WHERE key=?', key).first();
  const v = row && safeParse(row.value);
  return v && Date.now() - Number(v.t || 0) < HANDOFF_TTL ? v : null;
}
async function handoffPeek(request, env) {
  const b = await readJson(request, 2000), v = await handoffRead(env, b?.code, false);
  if (!v) return fail('Lien de transfert expiré ou déjà utilisé.', 404);
  const user = v.uid ? await db(env, 'SELECT username FROM users WHERE id=?', v.uid).first() : null;
  return json({ ok: true, username: user?.username || null, guest: !!v.guest });
}
async function handoffClaim(request, env, secure) {
  const b = await readJson(request, 2000), v = await handoffRead(env, b?.code, true);
  if (!v) return fail('Lien de transfert expiré ou déjà utilisé.', 404);
  const out = { ok: true, ls: v.ls || {}, guest: !!v.guest, snap: v.snap || null, user: null };
  if (!v.uid) return json(out);
  const row = await db(env, 'SELECT id,username,email,is_admin FROM users WHERE id=?', v.uid).first();
  if (!row) return json(out);
  await revokePresented(request, env);
  const token = await createSession(env, row.id);
  out.user = { id: row.id, username: row.username, email: row.email, isAdmin: !!row.is_admin };
  return json(out, 200, { 'Set-Cookie': cookie('session', token, SESSION_DAYS * 86400, secure) });
}

/* ═════════════ Routeur API ═════════════ */
async function handleApi(request, env, url) {
  const p = url.pathname, m = request.method;
  if (p === '/api/version') return new Response(JSON.stringify({ version: APP_VERSION, build: buildId(env) }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (p === '/api/changes' && m === 'GET') return changesRoute(env);
  if (p === '/api/move' && m === 'GET') return json({ ok: true, to: moveTarget(env, url) });
  if (p === '/api/health') return json({ ok: true, db: !!env.DB, version: APP_VERSION, build: buildId(env), inviteRequired: !!env.INVITE_CODE, adminConfigured: !!env.EDIT_PASSWORD });
  if (!env.DB) return fail('Base de données non configurée (binding D1 « DB »).', 500);

  if (m !== 'GET' && m !== 'HEAD') {
    // CSRF : origine obligatoirement identique quand le navigateur l'indique, et corps JSON uniquement
    // (un formulaire d'un autre site ne peut pas envoyer du JSON sans pré-vérification CORS, que nous ne répondons jamais).
    const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
    if ((origin && origin !== url.origin) || site === 'cross-site') return fail('Requête refusée.', 403);
    const ct = request.headers.get('Content-Type') || '', len = Number(request.headers.get('Content-Length') || 0);
    if ((len > 0 || request.body) && ct && !/^application\/json\b/i.test(ct)) return fail('Format non accepté.', 415);
  }
  try { await ensureSchema(env); } catch (e) { console.error('schema', e); return fail('Initialisation de la base impossible.', 500); }
  // Contenu modifié par les administrateurs pour tous les comptes : lisible par tout le monde (même sans compte).
  if (p === '/api/global' && m === 'GET') return globalList(env);

  const secure = url.protocol === 'https:';
  if (p === '/api/auth/register' && m === 'POST') {
    try { return await register(request, env, secure); }
    catch (e) { if (e && /UNIQUE/i.test(String(e.message))) return fail('Pseudo ou e-mail déjà utilisé.', 409); if (e?.status === 413) return fail('Données trop volumineuses.', 413); throw e; }
  }
  if (p === '/api/auth/login' && m === 'POST') { try { return await login(request, env, secure); } catch (e) { if (e?.status === 413) return fail('Données trop volumineuses.', 413); throw e; } }
  if (p === '/api/auth/logout' && m === 'POST') return logout(request, env, secure);
  if (p === '/api/handoff' && m === 'POST') { try { return await handoffCreate(request, env); } catch (e) { if (e?.status === 413) return fail('Données trop volumineuses pour être transférées.', 413); throw e; } }
  if (p === '/api/handoff/peek' && m === 'POST') return handoffPeek(request, env);
  if (p === '/api/handoff/claim' && m === 'POST') return handoffClaim(request, env, secure);
  if (p === '/api/push/key' && m === 'GET') return json({ ok: true, key: (await vapid(env)).pub });
  if (p === '/api/push/message' && m === 'GET') {
    const a = await authenticate(request, env), tz = /^[\w/+-]{1,40}$/.test(url.searchParams.get('tz') || '') ? url.searchParams.get('tz') : 'Europe/Paris';
    return json({ ok: true, ...(await messageFor(env, str(url.searchParams.get('endpoint'), 800), a?.user.id || null, tz)) });
  }
  // Pages publiques (profil public, séance publiée) : lisibles sans compte, uniquement ce que la personne a choisi de publier.
  if (p.startsWith('/api/public/') && m === 'GET') return publicRoute(env, url, await authenticate(request, env));

  const auth = await authenticate(request, env);
  if (!auth) return fail('Connexion requise.', 401);
  let res;
  try { res = await withOpLog(request, env, auth, () => routeAuthed(request, env, url, auth, secure)); }
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

/* Idempotence générique : une mutation portant X-Op-Id déjà traitée renvoie la même réponse (perte de réponse réseau). */
const OP_RE = /^op-[\w-]{8,80}$/;
const NATURALLY_IDEMPOTENT = new Set(['/api/sync', '/api/items', '/api/settings']);
async function withOpLog(request, env, auth, run) {
  const opId = request.headers.get('X-Op-Id'), path = new URL(request.url).pathname;
  if (request.method === 'GET' || !opId || !OP_RE.test(opId) || NATURALLY_IDEMPOTENT.has(path)) return run();
  const uidv = auth.user.id;
  const prev = await db(env, 'SELECT status,response_json FROM op_log WHERE user_id=? AND op_id=?', uidv, opId).first();
  if (prev) {
    if (!prev.status) return fail('Opération déjà en cours de traitement.', 425);
    return new Response(prev.response_json || '{"ok":true}', { status: prev.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Op-Replay': '1', ...SECURITY_HEADERS } });
  }
  const claim = await db(env, 'INSERT OR IGNORE INTO op_log(user_id,op_id,status,response_json,created_at) VALUES(?,?,0,?,?)', uidv, opId, '', Date.now()).run();
  if (!claim.meta?.changes) return fail('Opération déjà en cours de traitement.', 425);
  let res;
  try { res = await run(); }
  catch (e) { await db(env, 'DELETE FROM op_log WHERE user_id=? AND op_id=?', uidv, opId).run(); throw e; }
  if (res.status >= 500 || res.status === 425 || res.status === 429) await db(env, 'DELETE FROM op_log WHERE user_id=? AND op_id=?', uidv, opId).run();
  else {
    let body = await res.clone().text();
    if (body.length > 20000) body = JSON.stringify({ ok: res.ok, replay: true });
    await db(env, 'UPDATE op_log SET status=?,response_json=? WHERE user_id=? AND op_id=?', res.status, body, uidv, opId).run();
  }
  return res;
}

async function routeAuthed(request, env, url, auth, secure) {
  const p = url.pathname, m = request.method, u = auth.user;
  let x;
  if (p === '/api/auth/me' && m === 'GET') return json({ ok: true, user: u, version: APP_VERSION });
  if (p === '/api/auth/password' && m === 'POST') return changePassword(request, env, auth);
  if (p === '/api/auth/delete' && m === 'POST') return deleteAccount(request, env, auth, secure);

  if (p === '/api/sync' && m === 'GET') return syncGet(env, u);
  if (p === '/api/sync' && m === 'POST') return syncPost(request, env, u);
  if (p === '/api/settings' && m === 'GET') return settingsGet(env, u);
  if (p === '/api/settings' && m === 'POST') return settingsPost(request, env, u);
  if (p === '/api/items' && m === 'GET') return itemsGet(url, env, u);
  if (p === '/api/items' && m === 'POST') return itemsPost(request, env, u);

  if (p === '/api/calendar' && m === 'GET') return calendarGet(url, env, u);
  if (p === '/api/calendar' && m === 'POST') return calendarPost(request, env, u);
  if ((x = p.match(/^\/api\/calendar\/([\w-]{1,64})$/)) && m === 'DELETE') { const r = await db(env, 'DELETE FROM calendar_events WHERE id=? AND user_id=?', x[1], u.id).run(); if (!r.meta?.changes) return fail('Événement introuvable.', 404); return json({ ok: true }); }

  if (p === '/api/history' && m === 'GET') return historyGet(env, u);
  if (p === '/api/history' && m === 'POST') return historyPost(request, env, u);
  if ((x = p.match(/^\/api\/history\/([\w-]{1,64})$/)) && m === 'DELETE') { const r = await db(env, 'DELETE FROM history WHERE id=? AND user_id=?', x[1], u.id).run(); if (!r.meta?.changes) return fail('Historique introuvable.', 404); return json({ ok: true }); }

  if (p === '/api/exercises' && m === 'GET') return exercisesGet(env, u);
  if (p === '/api/exercises/common' && m === 'POST') return commonExAdd(request, env, u);
  if ((x = p.match(/^\/api\/exercises\/common\/([\w-]{1,64})$/))) {
    if (m === 'PUT') return commonExEdit(request, env, u, x[1]);
    if (m === 'DELETE') return commonExDelete(env, u, x[1]);
  }
  if (p === '/api/exercises/personal' && m === 'POST') return personalAdd(request, env, u);
  if ((x = p.match(/^\/api\/exercises\/personal\/([\w-]{1,64})$/))) {
    if (m === 'PUT') return personalEdit(request, env, u, x[1]);
    if (m === 'DELETE') { const r = await db(env, 'DELETE FROM user_exercises WHERE id=? AND user_id=?', x[1], u.id).run(); if (!r.meta?.changes) return fail('Exercice introuvable.', 404); return json({ ok: true }); }
  }

  // Séances partagées : bibliothèque commune (scope common) et séances publiques (scope public).
  if (p === '/api/shared' && m === 'GET') return sharedList(url, env, u);
  if (p === '/api/shared' && m === 'POST') return sharedCreate(request, env, u);
  if ((x = p.match(/^\/api\/shared\/([\w-]{1,64})$/))) {
    if (m === 'GET') return sharedGet(env, u, x[1]);
    if (m === 'PUT') return sharedEdit(request, env, u, x[1]);
    if (m === 'DELETE') return sharedDelete(env, u, x[1]);
  }

  // Signalements de bugs
  if (p === '/api/bugs' && m === 'POST') return bugCreate(request, env, u);
  if (p === '/api/ai/draft' && m === 'POST') return aiDraftRoute(request, env, u);
  if (p === '/api/ai/chat' && m === 'POST') return aiChatRoute(request, env, u);
  if (p === '/api/ai/goal' && m === 'POST') {
    const b = await readJson(request, 4000), text = str(b?.text, 300);
    if (text.length < 3) return fail('Écris ton objectif.');
    if (!env.AI?.run) return json({ error: 'Assistant non activé sur ce serveur.', unavailable: true }, 503);
    if (await limited(env, 'ai-m:' + u.id, 6, 600000) || await limited(env, 'ai-d:' + u.id, 40, DAY)) return fail('Tu as beaucoup utilisé l’assistant : réessaie un peu plus tard.', 429);
    try { return json({ ok: true, goal: await aiGoal(env, { text, profile: str(b?.profile, 900) }) }); }
    catch (e) { console.error('ai-goal', e?.message); return json({ error: e.status ? e.message : 'L’assistant n’a pas pu répondre.' }, e.status === 502 ? 502 : 503); }
  }
  if (p === '/api/push/subscribe' && m === 'POST') return pushSubscribe(request, env, u);
  if (p === '/api/ai/intent' && m === 'POST') {
    const b = await readJson(request, 3000), text = str(b?.text, 200), kind = ['intent', 'strength', 'weakness'].includes(b?.kind) ? b.kind : 'intent';
    if (text.length < 2) return fail('Écris ce que tu veux travailler.');
    if (!env.AI?.run) return json({ error: 'Assistant non activé sur ce serveur.', unavailable: true }, 503);
    if (await limited(env, 'ai-m:' + u.id, 6, 600000) || await limited(env, 'ai-d:' + u.id, 40, DAY)) return fail('Tu as beaucoup utilisé l’assistant : réessaie un peu plus tard.', 429);
    try { return json({ ok: true, intent: await aiIntent(env, { text, activityId: str(b?.activityId, 60), kind }) }); }
    catch (e) { console.error('ai-intent', e?.message); return json({ error: e.status ? e.message : 'L’assistant n’a pas pu répondre.' }, e.status === 502 ? 502 : 503); }
  }
  // Intentions communes (lecture pour tous) et propositions (envoyées aux administrateurs)
  if (p === '/api/community/intents' && m === 'GET') return json({ ok: true, intents: ((await db(env, 'SELECT id,activity,label,emoji,caps_json FROM community_intents ORDER BY created_at').all()).results || []).map((r) => ({ id: r.id, activityId: r.activity, label: r.label, emoji: r.emoji, caps: safeParse(r.caps_json) || {} })) });
  // Séance à deux : un salon avec un code ; seuls la position et le chrono sont partagés
  if (p === '/api/duo' && m === 'POST') return duoCreate(request, env, u);
  if ((x = p.match(/^\/api\/duo\/([A-Za-z0-9]{6})(\/join)?$/))) return duoRoom(request, env, u, normCode(x[1]), !!x[2], m);
  if (p === '/api/proposals' && m === 'POST') return proposalCreate(request, env, u);
  if (p === '/api/proposals/mine' && m === 'GET') return json({ ok: true, proposals: (await db(env, 'SELECT id,kind,activity,label,detail,status,reply,created_at FROM proposals WHERE user_id=? ORDER BY created_at DESC LIMIT 50', u.id).all()).results || [] });
  if (p === '/api/push/subscribe' && m === 'DELETE') { const b = await readJson(request, 2000); await db(env, 'DELETE FROM push_subs WHERE endpoint=? AND user_id=?', str(b?.endpoint, 800), u.id).run(); return json({ ok: true }); }
  // État de l'abonnement de cet appareil (pour l'afficher et le réparer tout seul s'il a disparu).
  if (p === '/api/push/status' && m === 'GET') {
    const ep = str(url.searchParams.get('endpoint'), 800), row = ep ? await db(env, 'SELECT types,days,hour FROM push_subs WHERE endpoint=? AND user_id=?', ep, u.id).first() : null;
    let types = []; try { types = JSON.parse(row?.types || '[]'); } catch { types = []; }
    return json({ ok: true, subscribed: !!row, types });
  }
  if (p === '/api/push/test' && m === 'POST') {
    if (await limited(env, 'push-t:' + u.id, 5, 3600000)) return fail('Déjà testé plusieurs fois : réessaie plus tard.', 429);
    const subs = (await db(env, 'SELECT endpoint FROM push_subs WHERE user_id=?', u.id).all()).results || [];
    let ok = 0; for (const x of subs) { const r = await sendPush(env, x.endpoint); if (r === 'gone') await db(env, 'DELETE FROM push_subs WHERE endpoint=?', x.endpoint).run(); if (r === 'ok') ok++; }
    return json({ ok: true, sent: ok, devices: subs.length });
  }
  if (p === '/api/bugs/mine' && m === 'GET') return bugMine(env, u);

  // Administration (droit vérifié côté serveur à chaque appel ; l'activation se fait avec EDIT_PASSWORD)
  if (p === '/api/admin/activate' && m === 'POST') return adminActivate(request, env, u);
  if (p === '/api/admin/deactivate' && m === 'POST') { await db(env, 'UPDATE users SET is_admin=0 WHERE id=?', u.id).run(); return json({ ok: true, admin: false }); }
  if (p.startsWith('/api/admin/')) {
    if (!u.isAdmin) return fail('Droit administrateur requis.', 403);
    if (p === '/api/admin/bugs' && m === 'GET') return adminBugs(url, env);
    if (p === '/api/admin/push-status' && m === 'GET') {
      const st = async (k) => (await db(env, 'SELECT value FROM system_state WHERE key=?', k).first())?.value || '';
      let last = null; try { last = JSON.parse(await st('last_notify') || 'null'); } catch { last = null; }
      const n = await db(env, 'SELECT COUNT(*) c FROM push_subs').first();
      return json({ ok: true, build: buildId(env), lastBuild: await st('last_build'), last, devices: Number(n?.c) || 0 });
    }
    if (p === '/api/admin/users' && m === 'GET') return adminUsers(env);
    if ((x = p.match(/^\/api\/admin\/users\/([\w-]{1,64})\/role$/)) && m === 'POST') {
      // Nommer ou retirer un administrateur. On ne peut pas retirer le dernier administrateur.
      const b = await readJson(request, 500), make = !!b?.admin;
      const t = await db(env, 'SELECT id FROM users WHERE id=?', x[1]).first(); if (!t) return fail('Compte introuvable.', 404);
      if (!make) { const n = await db(env, 'SELECT COUNT(*) c FROM users WHERE is_admin=1 AND id<>?', x[1]).first(); if (!Number(n?.c)) return fail('Il faut garder au moins un administrateur.', 409); }
      await db(env, 'UPDATE users SET is_admin=? WHERE id=?', make ? 1 : 0, x[1]).run();
      return json({ ok: true, admin: make });
    }
    if (p === '/api/admin/proposals' && m === 'GET') return json({ ok: true, proposals: ((await db(env, `SELECT p.id,p.kind,p.activity,p.label,p.detail,p.payload_json,p.status,p.reply,p.created_at,u.username FROM proposals p LEFT JOIN users u ON u.id=p.user_id WHERE p.status=? ORDER BY p.created_at DESC LIMIT 100`, url.searchParams.get('status') === 'done' ? 'done' : 'open').all()).results || []).map((r) => ({ ...r, payload: safeParse(r.payload_json) || {}, payload_json: undefined })) });
    if ((x = p.match(/^\/api\/admin\/proposals\/([\w-]{1,64})$/)) && m === 'POST') return proposalReview(request, env, u, x[1]);
    if ((x = p.match(/^\/api\/admin\/global\/(\w{1,20})\/([\w-]{1,64})$/))) {
      if (!GLOBAL_KINDS.includes(x[1])) return fail('Type inconnu.', 400);
      if (m === 'PUT') {
        const res = await globalPut(request, env, u, x[1], x[2]);
        // Une annonce part tout de suite en notification sur les appareils abonnés aux nouveautés.
        if (x[1] === 'announce' && res.status === 200) try { await notifyType(env, 'announce'); } catch (e) { console.error('annonce', e?.message); }
        return res;
      }
      if (m === 'DELETE') { await db(env, 'DELETE FROM global_content WHERE kind=? AND id=?', x[1], x[2]).run(); return json({ ok: true }); }
    }
    if (p === '/api/admin/intents' && m === 'POST') { const b = await readJson(request, 4000); const r = await intentCreate(env, u, b); return r.error ? fail(r.error) : json({ ok: true, id: r.id }); }
    if ((x = p.match(/^\/api\/admin\/intents\/([\w-]{1,64})$/)) && m === 'DELETE') { await db(env, 'DELETE FROM community_intents WHERE id=?', x[1]).run(); return json({ ok: true }); }
    if ((x = p.match(/^\/api\/admin\/bugs\/([\w-]{1,64})$/)) && m === 'POST') return adminBugStatus(request, env, x[1]);
    return fail('Route inconnue.', 404);
  }

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
  await db(env, "INSERT INTO user_data(user_id,seances_json,settings_json,favorites_json,goals_json,updated_at,v2_migrated) VALUES(?,?,?,?,?,?,1)", id, '{"items":[],"tomb":{}}', '{}', '[]', '{}', now).run();
  await db(env, 'INSERT OR IGNORE INTO profiles(user_id,updated_at) VALUES(?,?)', id, now).run();
  await migrateLegacyForFirstUser(env, id);
  await revokePresented(request, env);
  const token = await createSession(env, id);
  return json({ ok: true, user: { id, username, email, isAdmin: false } }, 200, { 'Set-Cookie': cookie('session', token, SESSION_DAYS * 86400, secure) });
}

// Hachage factice : le temps de réponse ne révèle pas si un pseudo existe.
const DUMMY_SALT = b64(new Uint8Array(16));
async function login(request, env, secure) {
  const b = await readJson(request, 10000);
  if (!b) return fail('Données invalides.');
  const username = str(b.username, 120), password = String(b.password ?? '').slice(0, 200);
  const rk = 'login:' + clientIp(request) + ':' + username.toLowerCase();
  if (await limited(env, rk, 10, 900000)) return fail('Trop d’essais. Réessaie dans quelques minutes.', 429);
  const row = await db(env, 'SELECT id,username,email,is_admin,password_hash,password_salt FROM users WHERE lower(username)=lower(?) OR email=lower(?)', username, username).first();
  const computed = await passHash(password, row ? row.password_salt : DUMMY_SALT);
  if (!row || !safeEq(computed, row.password_hash)) return fail('Pseudo ou mot de passe incorrect.', 401);
  await rlReset(env, rk);
  await revokePresented(request, env);
  const token = await createSession(env, row.id);
  return json({ ok: true, user: { id: row.id, username: row.username, email: row.email, isAdmin: !!row.is_admin } }, 200, { 'Set-Cookie': cookie('session', token, SESSION_DAYS * 86400, secure) });
}
async function logout(request, env, secure) {
  await revokePresented(request, env);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('session', '', 0, secure) });
}
async function changePassword(request, env, auth) {
  const b = await readJson(request, 10000);
  if (!b) return fail('Données invalides.');
  if (await limited(env, 'pwd:' + auth.user.id, 10, 900000)) return fail('Trop d’essais. Réessaie dans quelques minutes.', 429);
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
  if (await limited(env, 'pwd:' + auth.user.id, 10, 900000)) return fail('Trop d’essais. Réessaie dans quelques minutes.', 429);
  const row = await db(env, 'SELECT password_hash,password_salt FROM users WHERE id=?', auth.user.id).first();
  if (!b || !row || !safeEq(await passHash(String(b.password ?? ''), row.password_salt), row.password_hash)) return fail('Mot de passe incorrect.', 403);
  const id = auth.user.id;
  // Données privées supprimées ; contributions à la bibliothèque commune conservées de façon anonyme (auteur : compte supprimé).
  await env.DB.batch(['sessions', 'user_data', 'calendar_events', 'history', 'user_exercises', 'profiles', 'user_items', 'op_log', 'bug_reports', 'push_subs', 'proposals'].map((t) => db(env, `DELETE FROM ${t} WHERE user_id=?`, id))
    .concat([
      db(env, 'DELETE FROM follows WHERE follower_id=? OR followee_id=?', id, id),
      db(env, 'UPDATE common_exercises SET created_by=NULL WHERE created_by=?', id),
      db(env, "DELETE FROM shared_sessions WHERE owner_id=? AND scope IN ('public','link')", id),
      db(env, 'DELETE FROM duo_rooms WHERE owner_id=?', id),
      db(env, 'UPDATE global_content SET updated_by=NULL WHERE updated_by=?', id),
      db(env, "UPDATE shared_sessions SET owner_id=NULL WHERE owner_id=? AND scope='common'", id),
      db(env, 'DELETE FROM users WHERE id=?', id),
    ]));
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('session', '', 0, secure) });
}

/** Le tout premier compte créé récupère les séances PERSONNELLES de l'ancienne version (KV). Jamais la bibliothèque commune. */
async function migrateLegacyForFirstUser(env, userId) {
  try {
    const raw = await env.SEANCES_KV?.get('seances');
    if (raw === undefined || raw === null) return;
    const claim = await db(env, "INSERT OR IGNORE INTO system_state(key,value) VALUES('legacy_imported',?)", userId).run();
    if (!claim.meta || claim.meta.changes !== 1) return;
    const legacy = readStored(raw);
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
  for (const [k, v] of Object.entries(b.tomb && typeof b.tomb === 'object' ? b.tomb : {}).slice(0, 3000)) if (ID_RE.test(k)) tomb[k] = clamp(v, 0, 9e15, 0);
  const incoming = { items: b.items.slice(0, 400).map(normalizeSession), tomb };
  const row = await db(env, 'SELECT seances_json FROM user_data WHERE user_id=?', u.id).first();
  const merged = mergeSeances(readStored(row?.seances_json), incoming);
  const out = JSON.stringify(merged);
  if (out.length > MAX_BODY) return fail('Trop de séances enregistrées.', 413);
  const r = await db(env, 'UPDATE user_data SET seances_json=?,updated_at=? WHERE user_id=?', out, Date.now(), u.id).run();
  if (!r.meta?.changes) return fail('Espace de données introuvable.', 404);
  return json({ ok: true, ...merged });
}

/* ═════════════ Données structurées V2 (items) ═════════════ */
async function migrateV2(env, u) {
  const row = await db(env, 'SELECT settings_json,v2_migrated FROM user_data WHERE user_id=?', u.id).first();
  if (!row || row.v2_migrated) return;
  const now = Date.now();
  const items = legacyItems(safeParse(row.settings_json) || {}, now).map(cleanItem).filter(Boolean);
  if (items.length) await env.DB.batch(items.map((it) => db(env, 'INSERT OR IGNORE INTO user_items(user_id,collection,id,data_json,updated_at,server_at,deleted) VALUES(?,?,?,?,?,?,0)', u.id, it.c, it.id, JSON.stringify(it.d), it.u, now)));
  await db(env, 'UPDATE user_data SET v2_migrated=1 WHERE user_id=? AND v2_migrated=0', u.id).run();
}
async function itemsGet(url, env, u) {
  await migrateV2(env, u);
  const since = clamp(url.searchParams.get('since'), 0, 9e15, 0), now = Date.now();
  const r = await db(env, 'SELECT collection,id,data_json,updated_at,server_at,deleted FROM user_items WHERE user_id=? AND server_at>=? ORDER BY server_at LIMIT 3001', u.id, since).all();
  const rows = r.results.slice(0, 3000);
  const items = rows.map((x) => ({ c: x.collection, id: x.id, d: safeParse(x.data_json) || {}, u: x.updated_at, del: !!x.deleted }));
  // more : la page est pleine, le client relance à partir du dernier server_at reçu.
  return json({ ok: true, items, now, more: r.results.length > 3000, last: rows.length ? rows[rows.length - 1].server_at : since });
}
/**
 * Fusion « dernière modification gagnante » élément par élément : une écriture n'est appliquée que si sa date
 * de modification (u) est plus récente que la version serveur. Sinon la version serveur est renvoyée (conflicts)
 * pour que le client l'adopte et conserve sa version locale dans son journal de conflits (rien n'est perdu en silence).
 */
async function itemsPost(request, env, u) {
  const b = await readJson(request, 1_000_000);
  if (!b || !Array.isArray(b.changes)) return fail('Données invalides.');
  if (b.changes.length > 300) return fail('Trop de modifications dans un seul envoi (300 maximum).', 413);
  const clean = [], rejected = [];
  for (const raw of b.changes) {
    const it = cleanItem(raw);
    if (!it) { rejected.push({ c: String(raw?.c || '').slice(0, 20), id: cleanId(raw?.id), error: 'Élément invalide (collection ou identifiant).' }); continue; }
    const data = JSON.stringify(it.d);
    if (data.length > (it.c === 'photo' ? 95000 : 20000)) { rejected.push({ c: it.c, id: it.id, error: 'Élément trop volumineux.' }); continue; }
    if (it.u > Date.now() + DAY) { rejected.push({ c: it.c, id: it.id, error: 'Date de modification invalide.' }); continue; }
    clean.push({ ...it, data });
  }
  if (clean.length) {
    const cnt = await db(env, 'SELECT COUNT(*) c FROM user_items WHERE user_id=?', u.id).first();
    if (Number(cnt?.c) + clean.length > MAX_ITEMS_PER_USER) return fail('Trop de données enregistrées sur ce compte.', 413);
  }
  const now = Date.now();
  const res = clean.length ? await env.DB.batch(clean.map((it) => db(env, `INSERT INTO user_items(user_id,collection,id,data_json,updated_at,server_at,deleted) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(user_id,collection,id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at,server_at=excluded.server_at,deleted=excluded.deleted
      WHERE excluded.updated_at>user_items.updated_at`, u.id, it.c, it.id, it.data, it.u, now, it.del ? 1 : 0))) : [];
  const applied = [], conflicts = [];
  for (let i = 0; i < clean.length; i++) {
    const it = clean[i];
    if (res[i]?.meta?.changes) { applied.push({ c: it.c, id: it.id, u: it.u }); continue; }
    const cur = await db(env, 'SELECT data_json,updated_at,deleted FROM user_items WHERE user_id=? AND collection=? AND id=?', u.id, it.c, it.id).first();
    if (cur && cur.updated_at === it.u && !!cur.deleted === it.del && cur.data_json === it.data) applied.push({ c: it.c, id: it.id, u: it.u }); // rejeu identique
    else if (cur) conflicts.push({ c: it.c, id: it.id, server: { c: it.c, id: it.id, d: safeParse(cur.data_json) || {}, u: cur.updated_at, del: !!cur.deleted } });
    else rejected.push({ c: it.c, id: it.id, error: 'Écriture non appliquée.' });
  }
  return json({ ok: true, applied, conflicts, rejected, now });
}

/* ═════════════ Réglages de l'appareil / du compte (préférences simples) ═════════════ */
// Les anciennes clés (niveau, matériel, objectifs, journal escalade, profil v7) restent conservées côté serveur même si
// le client V2 ne les renvoie plus (elles ont été migrées vers les items) : rien n'est détruit.
const LEGACY_KEYS = ['equipment', 'climbingLogs', 'goals', 'sportProfile'];
function cleanSettings(o) {
  o = o && typeof o === 'object' ? o : {};
  const bool = (v) => !!v, out = {};
  if (o.level && typeof o.level === 'object') out.level = { boulderMax: str(o.level.boulderMax, 4), routeMax: str(o.level.routeMax, 4), years: o.level.years === null || o.level.years === '' || o.level.years === undefined ? null : clamp(o.level.years, 0, 80, null) };
  if (o.equipment && typeof o.equipment === 'object') out.equipment = Object.fromEntries(['wall', 'hangboard', 'bar', 'dips', 'weights', 'band'].map((k) => [k, bool(o.equipment[k])]));
  if (o.avoid && typeof o.avoid === 'object') out.avoid = Object.fromEntries(['fingers', 'shoulders', 'elbows', 'knees'].map((k) => [k, bool(o.avoid[k])]));
  if (Array.isArray(o.climbingLogs)) out.climbingLogs = o.climbingLogs.slice(0, 500).map((x) => ({ id: str(x?.id, 64) || uid(), date: clamp(x?.date, 0, 9e15, Date.now()), type: str(x?.type, 30), grade: str(x?.grade, 20), result: ['send', 'attempt', 'flash', 'top', 'fail', 'work'].includes(x?.result) ? x.result : 'attempt', attempts: clamp(x?.attempts, 1, 999, 1), style: str(x?.style, 60), note: str(x?.note, 500) }));
  for (const k of ['sound', 'vibration', 'voice', 'keepAwake', 'handsFree', 'onboarded', 'autoBase', 'bigMode', 'autoWarm', 'season']) if (k in o) out[k] = bool(o[k]);
  if ('soundStyle' in o) out.soundStyle = ['bip', 'cloche', 'bois', 'doux'].includes(o.soundStyle) ? o.soundStyle : 'bip';
  if ('notifSound' in o) out.notifSound = ['aucun', 'bip', 'cloche', 'bois', 'doux'].includes(o.notifSound) ? o.notifSound : 'doux';
  if ('volume' in o) out.volume = clamp(o.volume, 0, 100, 60);
  if ('lang' in o) out.lang = ['fr', 'en'].includes(o.lang) ? o.lang : 'fr';
  if ('defaultRest' in o) out.defaultRest = clamp(o.defaultRest, 0, 600, 60);
  if ('defaultMinutes' in o) out.defaultMinutes = clamp(o.defaultMinutes, 5, 240, 30);
  if (o.sportProfile && typeof o.sportProfile === 'object') out.sportProfile = o.sportProfile; // ancien format conservé tel quel (lecture seule)
  if (Array.isArray(o.goals)) out.goals = o.goals.slice(0, 100).filter((x) => x && str(x.name, 80)).map((x) => ({ id: str(x.id, 64) || uid(), name: str(x.name, 80), target: clamp(x.target, -1e6, 1e6, 0), unit: str(x.unit, 20), kind: str(x.kind, 20) || 'manual', current: clamp(x.current, -1e6, 1e6, 0), since: isDate(x.since) ? x.since : undefined }));
  return out;
}
async function settingsGet(env, u) {
  const row = await db(env, 'SELECT settings_json FROM user_data WHERE user_id=?', u.id).first();
  return json({ ok: true, settings: cleanSettings(safeParse(row?.settings_json || '{}') || {}) });
}
async function settingsPost(request, env, u) {
  const b = await readJson(request, 200000);
  if (!b) return fail('Données invalides.');
  const incoming = cleanSettings(b.settings ?? b);
  const row = await db(env, 'SELECT settings_json FROM user_data WHERE user_id=?', u.id).first();
  const stored = cleanSettings(safeParse(row?.settings_json || '{}') || {});
  const merged = { ...incoming };
  for (const k of LEGACY_KEYS) if (!(k in merged) && k in stored) merged[k] = stored[k];
  // Niveau : les anciens maxima (repris dans les performances V2) ne sont jamais effacés par un client qui ne les envoie plus.
  if (merged.level) merged.level = { boulderMax: merged.level.boulderMax || stored.level?.boulderMax || '', routeMax: merged.level.routeMax || stored.level?.routeMax || '', years: merged.level.years };
  else if (stored.level) merged.level = stored.level;
  const out = JSON.stringify(merged);
  if (out.length > 400000) return fail('Réglages trop volumineux.', 413);
  const r = await db(env, 'UPDATE user_data SET settings_json=?,updated_at=? WHERE user_id=?', out, Date.now(), u.id).run();
  if (!r.meta?.changes) return fail('Espace de données introuvable.', 404);
  return json({ ok: true, settings: merged });
}

/* ═════════════ Calendrier ═════════════ */
const rowToEvent = (r) => ({ id: r.id, date: r.event_date, sessionId: r.session_id, title: r.title || '', completed: !!r.completed, recurrence: r.recurrence_json ? safeParse(r.recurrence_json) : null });
async function calendarGet(url, env, u) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  let sql = 'SELECT id,event_date,session_id,title,completed,recurrence_json FROM calendar_events WHERE user_id=?';
  const args = [u.id];
  if (isDate(from)) { sql += ' AND (event_date>=? OR recurrence_json IS NOT NULL)'; args.push(from); }
  if (isDate(to)) { sql += ' AND event_date<=?'; args.push(to); }
  const r = await db(env, sql + ' ORDER BY event_date LIMIT 3000', ...args).all();
  return json({ ok: true, events: r.results.map(rowToEvent) });
}
async function calendarPost(request, env, u) {
  const b = await readJson(request, 10000);
  if (!b || !isDate(b.date)) return fail('Date invalide.');
  const id = ID_RE.test(b.id || '') ? b.id : uid();
  let rec = null;
  if (b.recurrence && b.recurrence.freq === 'weekly') rec = { freq: 'weekly', until: isDate(b.recurrence.until) ? b.recurrence.until : null };
  const count = await db(env, 'SELECT COUNT(*) c FROM calendar_events WHERE user_id=?', u.id).first();
  if (Number(count?.c) > 3000) return fail('Trop d’événements.', 413);
  const now = Date.now();
  const r = await db(env, `INSERT INTO calendar_events(id,user_id,event_date,session_id,title,completed,recurrence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET event_date=excluded.event_date,session_id=excluded.session_id,title=excluded.title,completed=excluded.completed,recurrence_json=excluded.recurrence_json,updated_at=excluded.updated_at
    WHERE calendar_events.user_id=excluded.user_id`,
    id, u.id, b.date, b.sessionId && ID_RE.test(b.sessionId) ? b.sessionId : null, str(b.title, 120), b.completed ? 1 : 0, rec ? JSON.stringify(rec) : null, now, now).run();
  if (!r.meta || r.meta.changes === 0) return fail('Identifiant déjà utilisé.', 409);
  return json({ ok: true, event: { id, date: b.date, sessionId: b.sessionId || null, title: str(b.title, 120), completed: !!b.completed, recurrence: rec } });
}

/* ═════════════ Historique des séances effectuées ═════════════ */
const MUSCLE_RE = /^[a-z_]{2,30}$/;
function cleanHistoryData(d) {
  d = d && typeof d === 'object' ? d : {};
  const q = d.questionnaire && typeof d.questionnaire === 'object' ? d.questionnaire : null;
  const idList = (a, n) => (Array.isArray(a) ? [...new Set(a.map((x) => String(x ?? '')).filter((x) => /^[\w:.-]{1,80}$/.test(x)))].slice(0, n) : []);
  const caps = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 10).map(([k, v]) => [k, clamp(v, 0, 1, 0)]).filter(([k, v]) => /^[\w:.-]{1,80}$/.test(k) && v > 0));
  return {
    rpe: clamp(d.rpe, 1, 5, 0), focus: str(d.focus, 20), note: str(d.note, 600), activity: /^[\w:.-]{1,80}$/.test(String(d.activity || '')) ? String(d.activity) : '',
    aborted: !!d.aborted, activeSeconds: clamp(d.activeSeconds, 0, 86400, 0), pausedSeconds: clamp(d.pausedSeconds, 0, 86400, 0), plannedMin: clamp(d.plannedMin, 0, 600, 0),
    context: normalizeContext(d.context),
    questionnaire: q ? {
      felt: (Array.isArray(q.felt) ? q.felt : []).map(String).filter((m) => MUSCLE_RE.test(m)).slice(0, 12), hardest: str(q.hardest, 80), easiest: str(q.easiest, 80),
      difficulty: clamp(q.difficulty, 1, 5, 0), comment: str(q.comment, 600),
      likes: (Array.isArray(q.likes) ? q.likes : []).slice(0, 12).map((l) => ({ name: str(l?.name, 80), value: ['aime', 'neutre', 'evite'].includes(l?.value) ? l.value : 'neutre' })).filter((l) => l.name),
      answers: (Array.isArray(q.answers) ? q.answers : []).slice(0, 6).map((a) => ({ q: str(a?.q, 120), a: str(a?.a, 200) })).filter((a) => a.q && a.a),
    } : null,
    swaps: (Array.isArray(d.swaps) ? d.swaps : []).slice(0, 20).map((s) => ({ from: str(s?.from, 80), to: str(s?.to, 80) })).filter((s) => s.from),
    hr: d.hr && typeof d.hr === 'object' && Number(d.hr.avg) > 0 ? { avg: clamp(d.hr.avg, 30, 250, 0), max: clamp(d.hr.max, 30, 250, 0) } : undefined,
    program: d.program && /^[\w:.-]{1,80}$/.test(String(d.program.id || '')) ? { id: String(d.program.id), i: Math.round(clamp(d.program.i, 0, 999, 0)) } : undefined,
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 60).map((e) => ({
      name: str(e?.name, 80), libId: str(e?.libId, 40), group: str(e?.group, 20),
      intensity: ['low', 'mod', 'high'].includes(e?.intensity) ? e.intensity : '', risk: ['finger', 'shoulder', 'elbow', 'knee'].includes(e?.risk) ? e.risk : '',
      muscles: (Array.isArray(e?.muscles) ? e.muscles : []).slice(0, 12).map((m) => str(m, 40)).filter(Boolean),
      caps: caps(e?.caps), prim: idList(e?.prim, 8), sec: idList(e?.sec, 10),
      sets: (Array.isArray(e?.sets) ? e.sets : []).slice(0, 40).map((s) => ({ reps: clamp(s?.reps, 0, 9999, 0), seconds: clamp(s?.seconds, 0, 86400, 0), load: clamp(s?.load, 0, 1000, 0), done: s?.done !== false })),
    })).filter((e) => e.name),
  };
}
const rowToHistory = (r) => normalizeHistory({ id: r.id, sessionId: r.session_id, sessionName: r.session_name, startedAt: r.started_at, durationSeconds: r.duration_seconds, data: safeParse(r.data_json) || {} });
async function historyGet(env, u) {
  const r = await db(env, 'SELECT id,session_id,session_name,started_at,duration_seconds,data_json FROM history WHERE user_id=? ORDER BY started_at DESC LIMIT 1500', u.id).all();
  return json({ ok: true, history: r.results.map(rowToHistory) });
}
async function historyPost(request, env, u) {
  const b = await readJson(request, 120000);
  if (!b) return fail('Données invalides.');
  const now = Date.now(), started = Number(b.startedAt);
  if (!Number.isFinite(started) || started < now - 5 * 365 * DAY) return fail('Date invalide.');
  // Une séance future n'est pas un historique : refus explicite (10 min de tolérance pour les horloges décalées).
  if (started > now + 10 * 60000) return fail('Date dans le futur : planifie plutôt cette séance dans le calendrier.', 400);
  const id = ID_RE.test(b.id || '') ? b.id : uid();
  const data = JSON.stringify(cleanHistoryData(b.data));
  if (data.length > 100000) return fail('Séance trop volumineuse.', 413);
  const count = await db(env, 'SELECT COUNT(*) c FROM history WHERE user_id=?', u.id).first();
  if (Number(count?.c) > 20000) return fail('Historique plein.', 413);
  const r = await db(env, `INSERT INTO history(id,user_id,session_id,session_name,started_at,duration_seconds,data_json) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,session_name=excluded.session_name,started_at=excluded.started_at,duration_seconds=excluded.duration_seconds,data_json=excluded.data_json
    WHERE history.user_id=excluded.user_id`,
    id, u.id, b.sessionId && ID_RE.test(b.sessionId) ? b.sessionId : null, str(b.sessionName, 100) || 'Séance', Math.round(started), clamp(b.durationSeconds, 0, 86400, 0), data).run();
  if (!r.meta || r.meta.changes === 0) return fail('Identifiant déjà utilisé.', 409);
  return json({ ok: true, id });
}

/* ═════════════ Exercices : personnels, et exercices communs historiques ═════════════ */
function cleanExercise(x) { const e = normalizeEx(x); delete e.id; delete e.block; delete e.isNew; delete e.note; return e; }
async function isAdmin(env, u) { const r = await db(env, 'SELECT is_admin FROM users WHERE id=?', u.id).first(); return !!r?.is_admin; }
async function exercisesGet(env, u) {
  const c = await db(env, 'SELECT e.id,e.name,e.data_json,e.created_by,us.username FROM common_exercises e LEFT JOIN users us ON us.id=e.created_by ORDER BY e.name LIMIT 2500').all();
  const p = await db(env, 'SELECT id,name,data_json FROM user_exercises WHERE user_id=? ORDER BY name LIMIT 1000', u.id).all();
  return json({
    ok: true,
    common: c.results.map((r) => ({ id: r.id, name: r.name, author: r.username || null, mine: r.created_by === u.id, data: { ...(safeParse(r.data_json) || {}), name: r.name } })),
    personal: p.results.map((r) => ({ id: r.id, name: r.name, data: { ...(safeParse(r.data_json) || {}), name: r.name } })),
  });
}
async function commonExAdd(request, env, u) {
  const b = await readJson(request, 20000);
  if (!b || !str(b.name ?? b.exercise?.name, 80)) return fail('Nom requis.');
  if (await limited(env, 'common-add:' + u.id, 40, DAY)) return fail('Trop d’ajouts aujourd’hui. Réessaie demain.', 429);
  const data = cleanExercise({ ...(b.exercise || {}), name: b.name ?? b.exercise?.name }), now = Date.now(), id = uid();
  const count = await db(env, 'SELECT COUNT(*) c FROM common_exercises').first();
  if (Number(count?.c) > 2500) return fail('La bibliothèque commune est pleine.', 413);
  const r = await db(env, 'INSERT INTO common_exercises(id,name,data_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)', id, data.name, JSON.stringify(data), u.id, now, now).run();
  if (!r.meta?.changes) return fail('Ajout non enregistré.', 500);
  return json({ ok: true, id });
}
async function commonExEdit(request, env, u, id) {
  const cur = await db(env, 'SELECT created_by FROM common_exercises WHERE id=?', id).first();
  if (!cur) return fail('Exercice introuvable.', 404);
  if (cur.created_by !== u.id && !(await isAdmin(env, u))) return fail('Seul le créateur ou un administrateur peut modifier cet exercice.', 403);
  const b = await readJson(request, 20000);
  if (!b) return fail('Données invalides.');
  const data = cleanExercise(b.exercise || b);
  const r = await db(env, 'UPDATE common_exercises SET name=?,data_json=?,updated_at=? WHERE id=?', data.name, JSON.stringify(data), Date.now(), id).run();
  if (!r.meta?.changes) return fail('Exercice introuvable.', 404);
  return json({ ok: true });
}
async function commonExDelete(env, u, id) {
  const cur = await db(env, 'SELECT created_by FROM common_exercises WHERE id=?', id).first();
  if (!cur) return fail('Exercice introuvable.', 404);
  if (cur.created_by !== u.id && !(await isAdmin(env, u))) return fail('Seul le créateur ou un administrateur peut supprimer cet exercice.', 403);
  const r = await db(env, 'DELETE FROM common_exercises WHERE id=?', id).run();
  if (!r.meta?.changes) return fail('Exercice introuvable.', 404);
  return json({ ok: true });
}
async function personalAdd(request, env, u) {
  const b = await readJson(request, 20000);
  const data = b && cleanExercise(b.exercise || b);
  if (!data || !str(data.name, 80) || data.name === 'Exercice' && !str((b.exercise || b).name, 80)) return fail('Nom requis.');
  const count = await db(env, 'SELECT COUNT(*) c FROM user_exercises WHERE user_id=?', u.id).first();
  if (Number(count?.c) >= 1000) return fail('Trop d’exercices personnels.', 413);
  const id = ID_RE.test(b.id || '') ? b.id : uid(), now = Date.now();
  const r = await db(env, 'INSERT INTO user_exercises(id,user_id,name,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?)', id, u.id, data.name, JSON.stringify(data), now, now).run();
  if (!r.meta?.changes) return fail('Ajout non enregistré.', 500);
  return json({ ok: true, id });
}
async function personalEdit(request, env, u, id) {
  const b = await readJson(request, 20000);
  const data = b && cleanExercise(b.exercise || b);
  if (!data) return fail('Données invalides.');
  const r = await db(env, 'UPDATE user_exercises SET name=?,data_json=?,updated_at=? WHERE id=? AND user_id=?', data.name, JSON.stringify(data), Date.now(), id, u.id).run();
  if (!r.meta?.changes) return fail('Exercice introuvable.', 404);
  return json({ ok: true });
}

/* ═════════════ Séances partagées : bibliothèque commune et séances publiques ═════════════ */
function sharedSummary(r, viewerId) {
  const data = safeParse(r.data_json) || {}, level = safeParse(r.level_json) || {};
  const caps = {};
  for (const e of data.exercises || []) for (const [c, w] of Object.entries(e.caps || {})) caps[c] = Math.max(caps[c] || 0, w);
  const needs = [...new Set((data.exercises || []).flatMap((e) => e.needs || []))];
  return {
    id: r.id, scope: r.scope, title: r.title, activity: r.activity, author: r.username || null, mine: !!viewerId && r.owner_id === viewerId, createdAt: r.created_at, updatedAt: r.updated_at,
    level, durationMin: data.durationMin || level.minutes || 0, intentions: data.intentions || [], caps: Object.entries(caps).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id), needs,
    exerciseCount: (data.exercises || []).length, exerciseNames: (data.exercises || []).filter((e) => e.block === 'main').slice(0, 8).map((e) => e.name), gradeHint: data.gradeHint || null, emoji: data.emoji || '🧗',
  };
}
async function sharedList(url, env, u) {
  const mine = url.searchParams.get('mine') === '1', q = url.searchParams.get('scope');
  const scope = q === 'public' ? 'public' : q === 'link' && mine ? 'link' : 'common'; // les liens ne sont listés que pour leur auteur
  const r = await db(env, `SELECT s.id,s.owner_id,s.scope,s.title,s.activity,s.data_json,s.level_json,s.created_at,s.updated_at,us.username FROM shared_sessions s LEFT JOIN users us ON us.id=s.owner_id
    WHERE s.scope=? ${mine ? 'AND s.owner_id=?' : ''} ORDER BY s.updated_at DESC LIMIT 1000`, ...(mine ? [scope, u.id] : [scope])).all();
  return json({ ok: true, items: r.results.map((x) => sharedSummary(x, u.id)), isAdmin: !!u.isAdmin });
}
async function sharedGet(env, u, id) {
  const r = await db(env, 'SELECT s.*,us.username FROM shared_sessions s LEFT JOIN users us ON us.id=s.owner_id WHERE s.id=?', id).first();
  if (!r) return fail('Séance introuvable.', 404);
  // Une séance publique est lisible par lien (publication individuelle et explicite de l'auteur).
  return json({ ok: true, item: { ...sharedSummary(r, u.id), session: safeParse(r.data_json) || {}, canEdit: r.owner_id === u.id || (r.scope === 'common' && !!u.isAdmin), canDelete: r.owner_id === u.id || !!u.isAdmin } });
}
async function sharedCreate(request, env, u) {
  const b = await readJson(request, 200000);
  if (!b || !b.session || typeof b.session !== 'object') return fail('Données invalides.');
  const scope = b.scope === 'public' || b.scope === 'link' ? b.scope : 'common'; // link : accessible seulement avec le lien, jamais listée
  const id = ID_RE.test(b.id || '') ? b.id : uid();
  const s = sanitizeForPublication(b.session);
  if (!s.exercises.length) return fail('Une séance publiée doit contenir au moins un exercice.');
  const title = str(b.title || s.name, 100) || 'Séance';
  const data = JSON.stringify({ ...s, name: title });
  if (data.length > 150000) return fail('Séance trop volumineuse.', 413);
  const existing = await db(env, 'SELECT owner_id,scope FROM shared_sessions WHERE id=?', id).first();
  if (existing) return existing.owner_id === u.id && existing.scope === scope ? json({ ok: true, id, replay: true }) : fail('Identifiant déjà utilisé.', 409);
  if (await limited(env, 'share:' + u.id, 30, DAY)) return fail('Trop de publications aujourd’hui. Réessaie demain.', 429);
  const count = await db(env, 'SELECT COUNT(*) c FROM shared_sessions WHERE owner_id=?', u.id).first();
  if (Number(count?.c) >= 300) return fail('Trop de séances publiées sur ce compte.', 413);
  const level = estimateLevel(s), now = Date.now();
  const r = await db(env, 'INSERT INTO shared_sessions(id,owner_id,scope,title,activity,data_json,level_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    id, u.id, scope, title, str(s.activity, 80), data, JSON.stringify(level), now, now).run();
  if (!r.meta?.changes) return fail('Identifiant déjà utilisé.', 409);
  return json({ ok: true, id, level, updatedAt: now });
}
async function sharedEdit(request, env, u, id) {
  const cur = await db(env, 'SELECT owner_id,scope,updated_at FROM shared_sessions WHERE id=?', id).first();
  if (!cur) return fail('Séance introuvable.', 404);
  const owner = cur.owner_id === u.id, admin = await isAdmin(env, u);
  // Règle absolue : le créateur, ou un administrateur pour la bibliothèque commune. Personne d'autre (même avec un ID fabriqué).
  if (!owner && !(admin && cur.scope === 'common')) return fail('Seul le créateur ou un administrateur peut modifier cette séance. Tu peux l’enregistrer dans tes séances pour la modifier librement.', 403);
  const b = await readJson(request, 200000);
  if (!b || !b.session) return fail('Données invalides.');
  if (b.baseUpdatedAt != null && Number(b.baseUpdatedAt) !== cur.updated_at && !b.force) return fail('Cette séance a été modifiée entre-temps.', 409, { conflict: true, updatedAt: cur.updated_at });
  const s = sanitizeForPublication(b.session);
  if (!s.exercises.length) return fail('Une séance publiée doit contenir au moins un exercice.');
  const title = str(b.title || s.name, 100) || 'Séance', data = JSON.stringify({ ...s, name: title });
  if (data.length > 150000) return fail('Séance trop volumineuse.', 413);
  const level = estimateLevel(s), now = Math.max(Date.now(), cur.updated_at + 1);
  const r = await db(env, 'UPDATE shared_sessions SET title=?,activity=?,data_json=?,level_json=?,updated_at=? WHERE id=? AND updated_at=?', title, str(s.activity, 80), data, JSON.stringify(level), now, id, cur.updated_at).run();
  if (!r.meta?.changes) return fail('Cette séance a été modifiée entre-temps.', 409, { conflict: true });
  return json({ ok: true, level, updatedAt: now });
}
async function sharedDelete(env, u, id) {
  const cur = await db(env, 'SELECT owner_id FROM shared_sessions WHERE id=?', id).first();
  if (!cur) return fail('Séance introuvable.', 404);
  if (cur.owner_id !== u.id && !(await isAdmin(env, u))) return fail('Seul le créateur ou un administrateur peut supprimer cette séance.', 403);
  const r = await db(env, 'DELETE FROM shared_sessions WHERE id=?', id).run();
  if (!r.meta?.changes) return fail('Séance introuvable.', 404);
  return json({ ok: true });
}

/* ═════════════ Signalements de bugs ═════════════ */
/* ═════════ Assistant IA (Workers AI) : proposition d'exercice ou de capacité, relue par l'utilisateur ═════════ */
async function aiDraftRoute(request, env, u) {
  const b = await readJson(request, 4000);
  const text = str(b?.text, 300), kind = ['exercise', 'capacity', 'auto'].includes(b?.kind) ? b.kind : 'auto';
  if (text.length < 2) return fail('Décris en quelques mots ce que tu veux créer.');
  if (!env.AI?.run) return json({ error: 'Assistant IA non activé sur ce serveur.', unavailable: true }, 503);
  if (await limited(env, 'ai-m:' + u.id, 6, 600000) || await limited(env, 'ai-d:' + u.id, 40, DAY)) return fail('Tu as beaucoup utilisé l’assistant : réessaie un peu plus tard.', 429);
  try { const r = await aiDraft(env, { kind, text, activityId: str(b?.activityId, 60) }); return json({ ok: true, draft: r.draft, source: 'ia' }); }
  catch (e) { console.error('ai', e?.message); return json({ error: e.status ? e.message : 'L’assistant IA n’a pas pu répondre. Réessaie dans un instant.', unavailable: e.status === 503 }, e.status === 502 ? 502 : 503); }
}
// Services de notification des navigateurs (Chrome/Android, Firefox, Safari/iPhone, Edge/Windows) : aucun autre hôte accepté.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w-]+\.push\.apple\.com|[\w.-]+\.notify\.windows\.com)$/;
async function pushSubscribe(request, env, u) {
  const b = await readJson(request, 4000);
  let ep; try { ep = new URL(String(b?.endpoint || '')); } catch { return fail('Abonnement invalide.'); }
  if (ep.protocol !== 'https:' || !PUSH_HOSTS.test(ep.hostname) || ep.href.length > 800) return fail('Service de notification non reconnu.');
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  const hour = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.hour || '') ? b.hour : '18:00', tz = /^[\w/+-]{1,40}$/.test(b.tz || '') ? b.tz : 'Europe/Paris';
  const types = Array.isArray(b.types) ? [...new Set(b.types.filter((t) => PUSH_TYPES.includes(t)))] : PUSH_TYPES, silent = b.silent ? 1 : 0;
  const n = await db(env, 'SELECT COUNT(*) c FROM push_subs WHERE user_id=? AND endpoint<>?', u.id, ep.href).first();
  if (Number(n?.c) >= 5) return fail('5 appareils au maximum reçoivent les rappels.', 409);
  await db(env, `INSERT INTO push_subs(endpoint,user_id,days,hour,tz,last_day,created_at,types,silent) VALUES(?,?,?,?,?,'',?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,days=excluded.days,hour=excluded.hour,tz=excluded.tz,types=excluded.types,silent=excluded.silent`, ep.href, u.id, JSON.stringify(days), hour, tz, Date.now(), JSON.stringify(types), silent).run();
  return json({ ok: true, days, hour, tz, types, silent: !!silent });
}
/* Intentions communes et propositions des utilisateurs */
async function intentCreate(env, u, b) {
  const label = str(b?.label, 40), caps = cleanCaps(b?.caps && !Array.isArray(b.caps) ? Object.entries(b.caps).map(([id, w]) => ({ id, w })) : b?.caps);
  if (label.length < 2 || !Object.keys(caps).length) return { error: 'Nom et au moins une capacité nécessaires.' };
  const activity = /^[\w:.-]{0,60}$/.test(String(b?.activityId || '')) ? String(b?.activityId || '') : '';
  const id = 'ci-' + uid().slice(0, 12);
  await db(env, 'INSERT INTO community_intents(id,activity,label,emoji,caps_json,created_by,created_at) VALUES(?,?,?,?,?,?,?)', id, activity, label, str(b?.emoji, 8) || '✨', JSON.stringify(caps), u.id, Date.now()).run();
  return { id };
}
/* ═════════════ Séance à deux ═════════════ */
async function duoCreate(request, env, u) {
  const b = await readJson(request, 200000);
  if (!b || !b.session || typeof b.session !== 'object') return fail('Données invalides.');
  if (await limited(env, 'duo:' + u.id, 20, DAY)) return fail('Trop de salons créés aujourd’hui. Réessaie demain.', 429);
  const s = sanitizeForPublication(b.session);
  if (!s.exercises.length) return fail('La séance est vide.');
  const data = JSON.stringify(s);
  if (data.length > 150000) return fail('Séance trop volumineuse.', 413);
  const now = Date.now(), state = JSON.stringify(cleanDuoState(b.state, now));
  await db(env, 'DELETE FROM duo_rooms WHERE expires_at<?', now).run();
  for (let k = 0; k < 5; k++) {
    const code = duoCode();
    const r = await db(env, 'INSERT INTO duo_rooms(code,owner_id,members_json,session_json,state_json,v,by_id,updated_at,expires_at) VALUES(?,?,?,?,?,1,?,?,?) ON CONFLICT(code) DO NOTHING',
      code, u.id, JSON.stringify([u.id]), data, state, u.id, now, now + DUO_TTL).run();
    if (r.meta?.changes) return json({ ok: true, code, v: 1, now });
  }
  return fail('Salon indisponible, réessaie.', 503);
}
async function duoView(env, u, r, members, now) {
  const rows = (await db(env, `SELECT id,username FROM users WHERE id IN (${members.map(() => '?').join(',')})`, ...members).all()).results || [];
  return { code: r.code, v: r.v, mine: r.by_id === u.id, host: r.owner_id === u.id, state: safeParse(r.state_json) || {}, now, members: rows.filter((x) => x.id !== u.id).map((x) => x.username) };
}
async function duoRoom(request, env, u, code, join, m) {
  const now = Date.now();
  const r = await db(env, 'SELECT * FROM duo_rooms WHERE code=? AND expires_at>?', code, now).first();
  if (!r) return fail('Salon introuvable ou terminé. Vérifie le code.', 404);
  const members = safeParse(r.members_json) || [], isMember = members.includes(u.id);
  if (join) {
    if (m !== 'POST') return fail('Méthode non autorisée.', 405);
    if (!isMember) {
      if (members.length >= DUO_MAX) return fail('Ce salon est complet.', 409);
      if (await limited(env, 'duoj:' + u.id, 30, 3600000)) return fail('Trop d’essais. Réessaie plus tard.', 429);
      members.push(u.id);
      await db(env, 'UPDATE duo_rooms SET members_json=? WHERE code=?', JSON.stringify(members), code).run();
    }
    return json({ ok: true, ...(await duoView(env, u, r, members, now)), session: safeParse(r.session_json) || {} });
  }
  if (!isMember) return fail('Rejoins d’abord le salon avec son code.', 403);
  if (m === 'GET') return json({ ok: true, ...(await duoView(env, u, r, members, now)) });
  if (m === 'PUT') {
    const b = await readJson(request, 3000);
    const row = await db(env, 'UPDATE duo_rooms SET state_json=?,v=v+1,by_id=?,updated_at=?,expires_at=? WHERE code=? RETURNING v', JSON.stringify(cleanDuoState(b?.state, now)), u.id, now, now + DUO_TTL, code).first();
    return json({ ok: true, v: row?.v || 0, now });
  }
  if (m === 'DELETE') {
    if (r.owner_id === u.id) await db(env, 'DELETE FROM duo_rooms WHERE code=?', code).run();
    else await db(env, 'UPDATE duo_rooms SET members_json=? WHERE code=?', JSON.stringify(members.filter((x) => x !== u.id)), code).run();
    return json({ ok: true });
  }
  return fail('Méthode non autorisée.', 405);
}

/* ═════════════ Contenu global (administrateurs) ═════════════ */
async function globalList(env) {
  const r = (await db(env, 'SELECT g.kind,g.id,g.data_json,g.hidden,g.updated_at,us.username FROM global_content g LEFT JOIN users us ON us.id=g.updated_by ORDER BY g.updated_at').all()).results || [];
  const items = r.map((x) => ({ kind: x.kind, id: x.id, hidden: !!x.hidden, data: x.hidden ? null : safeParse(x.data_json), updatedAt: x.updated_at, by: x.username || '' })).filter((x) => x.hidden || x.data);
  return new Response(JSON.stringify({ ok: true, ver: Math.max(0, ...items.map((x) => x.updatedAt)), items }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
async function globalPut(request, env, u, kind, id) {
  if (!GLOBAL_ID.test(id)) return fail('Identifiant invalide.');
  const b = await readJson(request, 60000);
  const hidden = !!b?.hidden, data = hidden ? null : cleanGlobal(kind, b?.data);
  if (!hidden && !data) return fail('Données incomplètes ou invalides.');
  const json_ = hidden ? '{}' : JSON.stringify(data);
  if (json_.length > 40000) return fail('Trop volumineux.', 413);
  const count = await db(env, 'SELECT COUNT(*) c FROM global_content').first();
  if (Number(count?.c) >= 2000) return fail('Trop d’éléments modifiés.', 413);
  const now = Date.now();
  await db(env, 'INSERT INTO global_content(kind,id,data_json,hidden,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data_json=excluded.data_json,hidden=excluded.hidden,updated_at=excluded.updated_at,updated_by=excluded.updated_by',
    kind, id, json_, hidden ? 1 : 0, now, u.id).run();
  return json({ ok: true, updatedAt: now, data });
}

async function proposalCreate(request, env, u) {
  const b = await readJson(request, 60000);
  const kind = ['intent', 'category', 'idea', ...GLOBAL_KINDS].includes(b?.kind) ? b.kind : 'idea', label = str(b?.label, 80), detail = str(b?.detail, 1000);
  if (label.length < 2) return fail('Donne au moins un nom à ta proposition.');
  // Proposition d'un élément complet (système de cotation, style, exercice, séance, format) : validé comme s'il était publié.
  const data = GLOBAL_KINDS.includes(kind) && kind !== 'intent' ? cleanGlobal(kind, b?.data) : null;
  if (GLOBAL_KINDS.includes(kind) && kind !== 'intent' && !data) return fail('Proposition incomplète : il manque des informations.');
  if (await limited(env, 'prop:' + u.id, 10, DAY)) return fail('Tu as déjà fait beaucoup de propositions aujourd’hui : merci ! Réessaie demain.', 429);
  // target : l'élément existant à modifier (demande de modification), sinon c'est un ajout.
  const PLACE_SEL = /^[\w\s\-\[\]="'#.:()>,*]{1,200}$/;
  const target = GLOBAL_KINDS.includes(kind) && GLOBAL_ID.test(String(b?.target || '')) ? String(b.target) : '';
  const payload = { emoji: str(b?.emoji, 8), caps: cleanCaps(b?.caps && !Array.isArray(b.caps) ? Object.entries(b.caps).map(([id, w]) => ({ id, w })) : b?.caps), ...(data ? { data } : {}), from: str(b?.from, 80), ...(target ? { target } : {}),
    // Endroit touché dans l'app (idée) : sélecteur simple et texte visible, pour que l'admin y aille en un clic.
    ...(PLACE_SEL.test(String(b?.sel || '')) ? { sel: String(b.sel), snippet: str(b?.snippet, 120) } : {}) };
  const id = 'pr-' + uid().slice(0, 12), activity = /^[\w:.-]{0,60}$/.test(String(b?.activityId || '')) ? String(b?.activityId || '') : '';
  await db(env, 'INSERT INTO proposals(id,user_id,kind,activity,label,detail,payload_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, u.id, kind, activity, label, detail, JSON.stringify(payload), 'open', Date.now()).run();
  // Prévenir les administrateurs (notification sur leurs appareils abonnés ; best effort)
  try {
    const admins = ((await db(env, 'SELECT id FROM users WHERE is_admin=1 AND id<>? LIMIT 20', u.id).all()).results || []).map((r) => r.id);
    if (admins.length) await notifyType(env, 'admin', { userIds: admins });
  } catch (e) { console.error('notif admin', e?.message); }
  return json({ ok: true, id });
}
async function proposalReview(request, env, u, id) {
  const b = await readJson(request, 3000), decision = b?.decision === 'accept' ? 'accept' : b?.decision === 'refuse' ? 'refuse' : '';
  if (!decision) return fail('Décision invalide.');
  const p = await db(env, 'SELECT id,kind,activity,label,payload_json,status FROM proposals WHERE id=?', id).first();
  if (!p) return fail('Proposition introuvable.', 404);
  if (p.status !== 'open') return fail('Déjà traitée.', 409);
  let added = '';
  if (decision === 'accept' && GLOBAL_KINDS.includes(p.kind) && p.kind !== 'intent') {
    // L'administrateur peut ajuster la proposition avant de l'ajouter (b.data), sinon elle est ajoutée telle quelle.
    const pl = safeParse(p.payload_json) || {}, data = cleanGlobal(p.kind, b?.data || pl.data);
    if (!data) return fail('Proposition incomplète : impossible de l’ajouter.');
    added = pl.target && GLOBAL_ID.test(pl.target) ? pl.target : 'g-' + uid().slice(0, 12); // demande de modification : on modifie l'élément visé
    await db(env, 'INSERT INTO global_content(kind,id,data_json,hidden,updated_at,updated_by) VALUES(?,?,?,0,?,?) ON CONFLICT(kind,id) DO UPDATE SET data_json=excluded.data_json,hidden=0,updated_at=excluded.updated_at,updated_by=excluded.updated_by', p.kind, added, JSON.stringify(data), Date.now(), u.id).run();
  }
  if (decision === 'accept' && p.kind === 'intent') {
    const pl = safeParse(p.payload_json) || {}, r = await intentCreate(env, u, { label: p.label, emoji: pl.emoji, caps: Object.entries(pl.caps || {}).map(([cid, w]) => ({ id: cid, w })), activityId: p.activity });
    if (r.error) return fail('Impossible d’ajouter cette intention : ' + r.error);
  }
  await db(env, 'UPDATE proposals SET status=?,reply=?,reviewed_by=?,reviewed_at=? WHERE id=?', 'done', (decision === 'accept' ? '✓ Acceptée. ' : '✗ Refusée. ') + str(b?.reply, 300), u.id, Date.now(), id).run();
  const author = await db(env, 'SELECT user_id FROM proposals WHERE id=?', id).first();
  if (author?.user_id) try { await notifyType(env, 'reply', { userIds: [author.user_id] }); } catch (e) { console.error('notif réponse', e?.message); }
  return json({ ok: true, added });
}
async function aiChatRoute(request, env, u) {
  const b = await readJson(request, 12000);
  if (!b || !Array.isArray(b.messages)) return fail('Données invalides.');
  if (!env.AI?.run) return json({ error: 'Coach non activé sur ce serveur.', unavailable: true }, 503);
  if (await limited(env, 'ai-c:' + u.id, 20, 600000) || await limited(env, 'ai-cd:' + u.id, 80, DAY)) return fail('Beaucoup de questions d’un coup : réessaie un peu plus tard.', 429);
  try { return json({ ok: true, reply: await aiChat(env, { messages: b.messages, profile: str(b.profile, 900) }) }); }
  catch (e) { console.error('ai-chat', e?.message); return json({ error: e.status ? e.message : 'Le coach n’a pas pu répondre. Réessaie dans un instant.' }, e.status === 400 ? 400 : e.status === 502 ? 502 : 503); }
}
async function bugCreate(request, env, u) {
  const b = await readJson(request, 30000);
  if (!b) return fail('Données invalides.');
  const title = str(b.title, 120), description = str(b.description, 5000);
  if (title.length < 3) return fail('Titre trop court.');
  if (description.length < 5) return fail('Décris le problème en quelques mots.');
  const id = ID_RE.test(b.id || '') ? b.id : uid();
  const existing = await db(env, 'SELECT user_id FROM bug_reports WHERE id=?', id).first();
  if (existing) return existing.user_id === u.id ? json({ ok: true, id, replay: true }) : fail('Identifiant déjà utilisé.', 409);
  if (await limited(env, 'bug-h:' + u.id, 5, 3600000) || await limited(env, 'bug-d:' + u.id, 20, DAY)) return fail('Trop de signalements envoyés. Réessaie plus tard.', 429);
  const now = Date.now();
  const r = await db(env, "INSERT INTO bug_reports(id,user_id,title,description,page,app_version,user_agent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',?,?)",
    id, u.id, title, description, str(b.page, 80), str(b.appVersion, 30), str(b.userAgent, 300), now, now).run();
  if (!r.meta?.changes) return fail('Signalement non enregistré.', 500);
  return json({ ok: true, id });
}
async function bugMine(env, u) {
  const r = await db(env, 'SELECT id,title,description,page,status,created_at,updated_at FROM bug_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 100', u.id).all();
  return json({ ok: true, reports: r.results.map((x) => ({ id: x.id, title: x.title, description: x.description, page: x.page, status: x.status, createdAt: x.created_at, updatedAt: x.updated_at })) });
}

/* ═════════════ Administration ═════════════ */
async function adminActivate(request, env, u) {
  if (!env.EDIT_PASSWORD) return fail('L’administration n’est pas configurée sur ce serveur (secret EDIT_PASSWORD absent).', 503);
  const b = await readJson(request, 2000);
  // Limitation atomique AVANT la vérification (par compte et par connexion) : pas de force brute concurrente.
  if (await limited(env, 'admin:' + u.id, 5, 900000) || await limited(env, 'admin-ip:' + clientIp(request), 20, 900000)) return fail('Trop d’essais. Réessaie dans quelques minutes.', 429);
  // Comparaison des empreintes : temps constant et indépendant de la longueur du secret.
  const ok = b && safeEq(await sha(String(b.password ?? '')), await sha(env.EDIT_PASSWORD));
  if (!ok) return fail('Mot de passe administrateur incorrect.', 403);
  const r = await db(env, 'UPDATE users SET is_admin=1,admin_since=COALESCE(admin_since,?) WHERE id=?', Date.now(), u.id).run();
  if (!r.meta?.changes) return fail('Compte introuvable.', 404);
  await rlReset(env, 'admin:' + u.id);
  return json({ ok: true, admin: true });
}
/** Liste des comptes pour l'administrateur : identité du compte et activité, JAMAIS les données d'entraînement
 * (séances, performances, profil) ; l'e-mail est masqué ; aucun mot de passe ni jeton. */
async function adminUsers(env) {
  const r = await db(env, `SELECT us.id,us.username,us.email,us.created_at,us.is_admin,
      (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id=us.id) AS last_login,
      (SELECT COUNT(*) FROM history h WHERE h.user_id=us.id) AS sessions_done,
      (SELECT MAX(h.started_at) FROM history h WHERE h.user_id=us.id) AS last_session
    FROM users us ORDER BY us.created_at DESC LIMIT 2000`).all();
  const mask = (e) => { const [a, d] = String(e || '').split('@'); return d ? `${a.slice(0, 1)}•••@${d}` : ''; };
  const users = r.results.map((x) => ({ id: x.id, username: x.username, email: mask(x.email), createdAt: x.created_at, isAdmin: !!x.is_admin, lastLogin: x.last_login || null, sessionsDone: x.sessions_done || 0, lastSession: x.last_session || null }));
  return json({ ok: true, total: users.length, users });
}
async function adminBugs(url, env) {
  const st = ['open', 'done'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : null;
  const r = await db(env, `SELECT b.id,b.title,b.description,b.page,b.app_version,b.user_agent,b.status,b.created_at,b.updated_at,us.username FROM bug_reports b LEFT JOIN users us ON us.id=b.user_id
    ${st ? 'WHERE b.status=?' : ''} ORDER BY b.created_at DESC LIMIT 500`, ...(st ? [st] : [])).all();
  return json({ ok: true, reports: r.results.map((x) => ({ id: x.id, title: x.title, description: x.description, page: x.page, appVersion: x.app_version, userAgent: x.user_agent, status: x.status, createdAt: x.created_at, updatedAt: x.updated_at, author: x.username || 'compte supprimé' })) });
}
async function adminBugStatus(request, env, id) {
  const b = await readJson(request, 2000);
  if (!b || !['open', 'done'].includes(b.status)) return fail('Statut invalide.');
  const r = await db(env, 'UPDATE bug_reports SET status=?,updated_at=? WHERE id=?', b.status, Date.now(), id).run();
  if (!r.meta?.changes) return fail('Signalement introuvable.', 404);
  return json({ ok: true });
}

/* ═════════════ Communauté : partage optionnel ═════════════ */
const VISIBILITY = ['private', 'followers', 'public'];
async function ensureProfile(env, id) {
  const now = Date.now(), sel = () => db(env, 'SELECT visibility,share_stats,share_records,share_sessions,bio,share_json FROM profiles WHERE user_id=?', id).first();
  await db(env, 'INSERT OR IGNORE INTO profiles(user_id,updated_at) VALUES(?,?)', id, now).run();
  let row = await sel();
  // Ancienne structure (v5) : display_name et created_at obligatoires sans valeur par défaut.
  if (!row) { await db(env, 'INSERT OR IGNORE INTO profiles(user_id,display_name,created_at,updated_at) SELECT id,username,?,? FROM users WHERE id=?', now, now, id).run(); row = await sel(); }
  return row;
}
const profileOut = (p) => ({ visibility: p.visibility, shareStats: !!p.share_stats, shareRecords: !!p.share_records, shareSessions: !!p.share_sessions, bio: p.bio || '', share: safeParse(p.share_json) || {} });
function cleanShare(s) {
  s = s && typeof s === 'object' ? s : {};
  const ids = (a, n) => (Array.isArray(a) ? [...new Set(a.map(cleanId).filter(Boolean))].slice(0, n) : []);
  return {
    activities: ids(s.activities, 20), goals: ids(s.goals, 30), perfs: ids(s.perfs, 60),
    caps: (Array.isArray(s.caps) ? s.caps : []).slice(0, 30).map((c) => ({ id: cleanId(c?.id), label: str(c?.label, 60), status: str(c?.status, 40) })).filter((c) => c.id),
  };
}
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
    const b = await readJson(request, 20000);
    if (!b || !VISIBILITY.includes(b.visibility)) return fail('Visibilité invalide.');
    await ensureProfile(env, u.id);
    const r = await db(env, 'UPDATE profiles SET visibility=?,share_stats=?,share_records=?,share_sessions=?,bio=?,share_json=?,updated_at=? WHERE user_id=?',
      b.visibility, b.shareStats ? 1 : 0, b.shareRecords ? 1 : 0, b.shareSessions ? 1 : 0, str(b.bio, 500), JSON.stringify(cleanShare(b.share)), Date.now(), u.id).run();
    if (!r.meta?.changes) return fail('Profil introuvable.', 404);
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
    if (!cur) return fail('Demande non enregistrée.', 500);
    return json({ ok: true, status: cur.status });
  }
  if (p === 'respond' && m === 'POST') {
    const b = await readJson(request, 2000);
    if (!b || !ID_RE.test(b.id || '')) return fail('Demande invalide.');
    const r = b.accept ? await db(env, "UPDATE follows SET status='accepted' WHERE id=? AND followee_id=?", b.id, u.id).run() : await db(env, 'DELETE FROM follows WHERE id=? AND followee_id=?', b.id, u.id).run();
    if (!r.meta?.changes) return fail('Demande introuvable.', 404);
    return json({ ok: true });
  }
  if ((p === 'unfollow' || p === 'remove-follower') && m === 'POST') {
    const b = await readJson(request, 2000);
    const other = await db(env, 'SELECT id FROM users WHERE lower(username)=lower(?)', str(b?.username, 40)).first();
    if (!other) return fail('Utilisateur introuvable.', 404);
    const r = p === 'unfollow' ? await db(env, 'DELETE FROM follows WHERE follower_id=? AND followee_id=?', u.id, other.id).run() : await db(env, 'DELETE FROM follows WHERE follower_id=? AND followee_id=?', other.id, u.id).run();
    return json({ ok: true, changed: !!r.meta?.changes });
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

/** Ce que `viewer` a le droit de voir de `targetId` : le serveur applique le choix de la personne (jamais l'interface). */
async function cardFor(env, viewerId, targetId, username, tz) {
  const prof = await db(env, 'SELECT visibility,share_stats,share_records,share_sessions,bio,share_json FROM profiles WHERE user_id=?', targetId).first();
  if (!prof || prof.visibility === 'private') return null;
  if (prof.visibility === 'followers' && viewerId !== targetId) {
    if (!viewerId) return null;
    const f = await db(env, "SELECT 1 ok FROM follows WHERE follower_id=? AND followee_id=? AND status='accepted'", viewerId, targetId).first();
    if (!f) return null;
  }
  const wantData = prof.share_records;
  const r = await db(env, `SELECT session_name,started_at,duration_seconds${wantData ? ',data_json' : ''} FROM history WHERE user_id=? ORDER BY started_at DESC LIMIT 300`, targetId).all();
  const rows = r.results.map((x) => normalizeHistory({ sessionName: x.session_name, startedAt: x.started_at, durationSeconds: x.duration_seconds, data: wantData ? safeParse(x.data_json) || {} : {} }));
  const s = summarizeHistory(rows, Date.now(), tz);
  const share = safeParse(prof.share_json) || {};
  // Éléments du profil explicitement choisis par la personne (activités, objectifs, performances), rien d'autre.
  const pick = async (collection, ids) => {
    if (!ids?.length) return [];
    const q = await db(env, `SELECT id,data_json FROM user_items WHERE user_id=? AND collection=? AND deleted=0 AND id IN (${ids.map(() => '?').join(',')})`, targetId, collection, ...ids).all();
    return q.results.map((x) => ({ id: x.id, ...(safeParse(x.data_json) || {}) }));
  };
  const activities = (await pick('activity', share.activities)).map((a) => ({ label: a.label || ACTIVITIES[a.preset]?.label || 'Activité', emoji: a.emoji || ACTIVITIES[a.preset]?.emoji || '🏅' }));
  const goals = (await pick('goal', share.goals)).map((g) => ({ label: g.label || SKILLS[g.skillId]?.label || 'Objectif', status: g.status || 'active' }));
  const customMetrics = Object.fromEntries((await pick('metric', (await pick('perf', share.perfs)).map((p) => p.metricId).filter((x) => !METRICS[x]))).map((m) => [m.id, m]));
  const perfs = (await pick('perf', share.perfs)).filter((p) => !p.unknown).map((p) => ({ label: METRICS[p.metricId]?.label || customMetrics[p.metricId]?.label || 'Performance', text: p.grade?.label ? `${p.grade.label} (${p.grade.systemName})` : `${p.value ?? ''} ${p.unit || METRICS[p.metricId]?.unit || ''}`.trim(), date: p.date || 0 }));
  const pub = await db(env, "SELECT s.id,s.owner_id,s.scope,s.title,s.activity,s.data_json,s.level_json,s.created_at,s.updated_at,us.username FROM shared_sessions s LEFT JOIN users us ON us.id=s.owner_id WHERE s.owner_id=? AND s.scope='public' ORDER BY s.updated_at DESC LIMIT 50", targetId).all();
  return {
    username, visibility: prof.visibility, bio: prof.bio || '',
    stats: prof.share_stats ? { sessions7: s.sessions7, sessions30: s.sessions30, minutes30: s.minutes30, streak: s.streak, weekly: s.weekly, lastAt: s.lastAt } : null,
    records: prof.share_records ? s.records : null, recent: prof.share_sessions ? s.recent : null,
    activities, goals, perfs, caps: (share.caps || []).map((c) => ({ label: c.label || CAPACITIES[c.id]?.label || c.id, status: c.status })),
    sessions: pub.results.map((x) => sharedSummary(x, viewerId)),
  };
}
async function publicRoute(env, url, auth) {
  const p = url.pathname.slice('/api/public/'.length);
  let x;
  if ((x = p.match(/^u\/([^/]{1,40})$/))) {
    const t = await db(env, 'SELECT id,username FROM users WHERE lower(username)=lower(?)', decodeURIComponent(x[1])).first();
    const card = t && (await cardFor(env, auth?.user?.id || null, t.id, t.username, 0));
    return card ? json({ ok: true, person: card }) : fail('Profil introuvable ou privé.', 404);
  }
  if ((x = p.match(/^s\/([\w-]{1,64})$/))) {
    const r = await db(env, "SELECT s.*,us.username FROM shared_sessions s LEFT JOIN users us ON us.id=s.owner_id WHERE s.id=? AND s.scope IN ('public','link')", x[1]).first();
    if (!r) return fail('Séance introuvable ou retirée.', 404);
    return json({ ok: true, item: { ...sharedSummary(r, auth?.user?.id || null), session: safeParse(r.data_json) || {} } });
  }
  return fail('Route inconnue.', 404);
}
