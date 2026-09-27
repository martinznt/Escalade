// server/push.js — rappels d'entraînement par notification (Web Push), sans service tiers ni clé à configurer.
// - Les clés VAPID sont créées automatiquement au premier besoin et gardées dans D1 (la clé privée ne sort jamais du serveur).
// - La notification est envoyée SANS contenu (pas de chiffrement nécessaire) : le service worker de l'appareil demande
//   ensuite le texte à /api/push/message, avec la session de l'utilisateur. Rien de personnel ne transite par le service
//   de notifications du navigateur.
// - Une tâche planifiée (cron toutes les 15 min) envoie les rappels à l'heure choisie, dans le fuseau de la personne.
const enc = new TextEncoder();
export const b64u = (bytes) => { let s = ''; for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x); return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); };
export const unb64u = (s) => Uint8Array.from(atob(String(s).replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);


/** Clés VAPID (ECDSA P-256) : créées une fois, stockées dans system_state. */
export async function vapid(env) {
  const row = await q(env, "SELECT value FROM system_state WHERE key='vapid'").first();
  if (row) { const v = JSON.parse(row.value); return { pub: v.pub, key: await crypto.subtle.importKey('jwk', v.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) }; }
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  await q(env, "INSERT OR IGNORE INTO system_state(key,value) VALUES('vapid',?)", JSON.stringify({ pub, priv })).run();
  return vapid(env); // relit : si deux requêtes ont créé une clé en même temps, une seule est gardée
}
/** En-têtes d'authentification VAPID pour un point d'envoi (JWT ES256 signé, valable 12 h). */
export async function vapidAuth(env, endpoint, now = Date.now()) {
  const { pub, key } = await vapid(env), aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.PUSH_CONTACT || 'https://seances-sport.pages.dev' })));
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return { Authorization: `vapid t=${head}.${body}.${sig}, k=${pub}`, TTL: '3600', Urgency: 'normal', 'Content-Length': '0' };
}
/** Envoie une notification vide. Retourne 'ok', 'gone' (abonnement expiré, à supprimer) ou 'error'. */
export async function sendPush(env, endpoint, fetchFn = fetch) {
  try {
    const r = await fetchFn(endpoint, { method: 'POST', headers: await vapidAuth(env, endpoint) });
    return r.status === 404 || r.status === 410 ? 'gone' : r.ok ? 'ok' : 'error';
  } catch { return 'error'; }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Jour (0 = lundi), heure « HH:MM » et date du jour dans un fuseau horaire. */
export function localNow(tz, now = Date.now()) {
  let parts;
  try { parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value])); }
  catch { return localNow('Europe/Paris', now); }
  return { day: DAYS.indexOf(parts.weekday), hm: `${parts.hour}:${parts.minute}`, ymd: `${parts.year}-${parts.month}-${parts.day}` };
}
/** Un rappel est dû si c'est un jour choisi, que l'heure est passée depuis moins de 3 h et qu'il n'a pas déjà été envoyé. */
export function isDue(sub, now = Date.now()) {
  const l = localNow(sub.tz, now), days = safeDays(sub.days);
  if (!days.includes(l.day) || sub.last_day === l.ymd) return false;
  const [h, m] = String(sub.hour || '18:00').split(':').map(Number), [H, M] = l.hm.split(':').map(Number), diff = H * 60 + M - (h * 60 + m);
  return diff >= 0 && diff < 180;
}
const safeDays = (s) => { try { const d = JSON.parse(s); return Array.isArray(d) ? d.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : []; } catch { return []; } };

/** Tâche planifiée : envoie les rappels dus. */
export async function runReminders(env, now = Date.now(), fetchFn = fetch) {
  const subs = (await q(env, 'SELECT endpoint,user_id,days,hour,tz,last_day FROM push_subs').all()).results || [];
  let sent = 0;
  for (const s of subs) {
    if (!isDue(s, now)) continue;
    const r = await sendPush(env, s.endpoint, fetchFn);
    if (r === 'gone') await q(env, 'DELETE FROM push_subs WHERE endpoint=?', s.endpoint).run();
    else { await q(env, 'UPDATE push_subs SET last_day=? WHERE endpoint=?', localNow(s.tz, now).ymd, s.endpoint).run(); if (r === 'ok') sent++; }
  }
  return sent;
}

/** Texte du rappel pour une personne : la séance du programme si elle est prévue aujourd'hui, sinon un mot simple. */
export async function reminderText(env, userId, tz = 'Europe/Paris', now = Date.now()) {
  const today = localNow(tz, now).ymd;
  const rows = (await q(env, "SELECT data_json FROM user_items WHERE user_id=? AND collection='program' AND deleted=0", userId).all()).results || [];
  for (const r of rows) {
    let p; try { p = JSON.parse(r.data_json); } catch { continue; }
    if (p?.status !== 'active') continue;
    const s = (p.sessions || []).find((x) => x.date === today);
    if (s) return { title: 'Séance du jour 💪', body: `${String(p.name || 'Ton programme').split(' · ')[0]} · semaine ${s.week} · ${s.minutes} min. On y va ?`, url: '/#/home/dash' };
  }
  const lines = ['C’est l’heure de bouger. Même 20 minutes, ça compte.', 'Ta séance t’attend. Tu la fais quand tu veux aujourd’hui.', 'Petit rappel : un peu d’entraînement aujourd’hui ?'];
  return { title: 'Séances entraînement', body: lines[new Date(now).getDate() % lines.length], url: '/#/home/dash' };
}
