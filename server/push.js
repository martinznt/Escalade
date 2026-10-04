import { agendaEvents } from '../public/agenda.js';
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
  return { Authorization: `vapid t=${head}.${body}.${sig}, k=${pub}`, TTL: '3600', Urgency: 'high', 'Content-Length': '0' }; // « high » : le téléphone ne la retarde pas en économie d'énergie
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

/**
 * 8.30 — rappel inutile aujourd'hui ? En pause (vacances ou blessure, item « config/pause ») ou séance déjà faite
 * aujourd'hui (dans le fuseau de la personne). Lecture des seules données de la personne concernée.
 */
export async function quietToday(env, userId, tz = 'Europe/Paris', now = Date.now()) {
  const l = localNow(tz, now);
  const row = await q(env, "SELECT data_json FROM user_items WHERE user_id=? AND collection='config' AND id='pause' AND deleted=0", userId).first();
  let p = null; try { p = row ? JSON.parse(row.data_json) : null; } catch { p = null; }
  if (p && ['vacances', 'blesse'].includes(p.pauseMode) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.pauseFrom || '')) && p.pauseFrom <= l.ymd && (!p.pauseTo || l.ymd <= p.pauseTo)) return 'pause';
  const [H, M] = l.hm.split(':').map(Number), midnight = now - (H * 60 + M + 1) * 60000;
  const done = await q(env, 'SELECT COUNT(*) c FROM history WHERE user_id=? AND started_at>=?', userId, midnight).first();
  return Number(done?.c) > 0 ? 'done' : '';
}
/** Tâche planifiée : envoie les rappels dus (sauf en pause ou si la séance du jour est déjà faite). */
export async function runReminders(env, now = Date.now(), fetchFn = fetch) {
  const subs = (await q(env, 'SELECT endpoint,user_id,days,hour,tz,last_day,types FROM push_subs').all()).results || [];
  let sent = 0;
  for (const s of subs) {
    if (!wants(s, 'reminder') || !isDue(s, now)) continue;
    if (await quietToday(env, s.user_id, s.tz, now).catch(() => '')) { await q(env, 'UPDATE push_subs SET last_day=? WHERE endpoint=?', localNow(s.tz, now).ymd, s.endpoint).run(); continue; }
    await q(env, 'UPDATE push_subs SET pending=? WHERE endpoint=?', 'reminder', s.endpoint).run();
    const r = await sendPush(env, s.endpoint, fetchFn);
    if (r === 'gone') await q(env, 'DELETE FROM push_subs WHERE endpoint=?', s.endpoint).run();
    else { await q(env, 'UPDATE push_subs SET last_day=? WHERE endpoint=?', localNow(s.tz, now).ymd, s.endpoint).run(); if (r === 'ok') sent++; }
  }
  return sent;
}

export const TYPES = ['reminder', 'update', 'reply', 'admin'];
export const wants = (sub, type) => { try { const t = JSON.parse(sub.types || '[]'); return Array.isArray(t) ? t.includes(type) : true; } catch { return true; } };
/** Prévient les abonnés d'un type (et, si donné, seulement ceux de ces comptes). Le texte est lu ensuite par l'appareil. */
export async function notifyType(env, type, { userIds = null, fetchFn = fetch, limit = 500 } = {}) {
  const rows = (await q(env, 'SELECT endpoint,user_id,types FROM push_subs LIMIT ?', limit).all()).results || [];
  let sent = 0, gone = 0, errors = 0, targeted = 0;
  for (const s of rows) {
    // Une annonce de l'administrateur va aux appareils qui veulent les nouveautés.
    if (!wants(s, type === 'announce' ? 'update' : type) || (userIds && !userIds.includes(s.user_id))) continue;
    targeted++;
    await q(env, 'UPDATE push_subs SET pending=? WHERE endpoint=?', type, s.endpoint).run();
    const r = await sendPush(env, s.endpoint, fetchFn);
    if (r === 'gone') { gone++; await q(env, 'DELETE FROM push_subs WHERE endpoint=?', s.endpoint).run(); } else if (r === 'ok') sent++; else errors++;
  }
  // Suivi visible par les administrateurs : quand, combien d'appareils joints, combien d'abonnements expirés ou en erreur.
  if (type === 'update' || type === 'announce') await q(env, "INSERT INTO system_state(key,value) VALUES('last_notify',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify({ type, at: Date.now(), total: rows.length, targeted, sent, gone, errors })).run().catch(() => {});
  return sent;
}
/** À chaque nouveau déploiement (identifiant de version différent) : notification « nouvelle mise à jour ». */
export async function updateNotice(env, build, fetchFn = fetch) {
  if (!build || build === 'dev') return 0;
  const row = await q(env, "SELECT value FROM system_state WHERE key='last_build'").first();
  if (row?.value === build) return 0;
  if (!row) { await q(env, "INSERT INTO system_state(key,value) VALUES('last_build',?) ON CONFLICT(key) DO NOTHING", build).run(); return 0; } // premier passage : on retient la version sans prévenir
  // Changement de version « compare puis remplace » : si deux requêtes arrivent en même temps, une seule prévient.
  const r = await q(env, "UPDATE system_state SET value=? WHERE key='last_build' AND value=?", build, row.value).run();
  if (!r.meta?.changes) return 0;
  return notifyType(env, 'update', { fetchFn });
}
/** Texte à afficher pour une notification reçue par un appareil (selon ce qui l'a déclenchée). */
export async function messageFor(env, endpoint, userId, tz, now = Date.now()) {
  const sub = endpoint ? await q(env, 'SELECT user_id,pending,silent FROM push_subs WHERE endpoint=?', endpoint).first() : null;
  const mine = sub && (!userId || sub.user_id === userId);
  const pending = mine ? sub.pending : '';
  if (mine && pending) await q(env, "UPDATE push_subs SET pending='' WHERE endpoint=?", endpoint).run();
  const silent = !!(mine && sub.silent);
  if (pending === 'announce') {
    const a = await q(env, "SELECT data_json FROM global_content WHERE kind='announce' AND hidden=0 ORDER BY updated_at DESC LIMIT 1").first();
    let d = {}; try { d = JSON.parse(a?.data_json || '{}'); } catch { /* rien */ }
    return { title: `${d.emoji || '📣'} ${d.title || 'Annonce'}`, body: String(d.body || '').slice(0, 180), url: '/?news=1#/home/dash', silent };
  }
  if (pending === 'update') return { title: 'Nouvelle mise à jour disponible ✨', body: 'Ouvre l’app pour voir ce qui a changé et à quoi ça sert.', url: '/?news=1#/home/dash', silent };
  if (pending === 'admin') return { title: 'Nouvelle proposition 📬', body: 'Quelqu’un propose une idée pour l’app. À valider dans Paramètres › Admin.', url: '/?news=1#/home/dash', silent }; // la boîte 🔔 : une notification par idée, qui mène à l'endroit concerné
  if (pending === 'reply' && userId) {
    const r = await q(env, "SELECT label,reply FROM proposals WHERE user_id=? AND status='done' ORDER BY reviewed_at DESC LIMIT 1", userId).first();
    return { title: 'Réponse à ta proposition', body: r ? `« ${r.label} » : ${r.reply}` : 'Un administrateur a répondu à ta proposition.', url: '/?news=1#/home/dash', silent };
  }
  return { ...(userId ? await reminderText(env, userId, tz, now) : { title: 'Séances entraînement', body: 'Petit rappel : un peu d’entraînement aujourd’hui ?', url: '/' }), silent };
}

/** Texte du rappel pour une personne : la séance prévue aujourd'hui (calendrier), sinon celle du programme, sinon un mot simple. */
export async function reminderText(env, userId, tz = 'Europe/Paris', now = Date.now()) {
  const L = localNow(tz, now), today = L.ymd;
  const evs = (await q(env, "SELECT id,title,event_time,event_date,completed,recurrence_json,meta_json FROM calendar_events WHERE user_id=? AND (event_date=? OR (recurrence_json IS NOT NULL AND event_date<=?) OR json_extract(NULLIF(meta_json,''),'$.occurrenceDate')=?) LIMIT 3000", userId, today, today, today).all().catch(() => ({ results: [] }))).results || [];
  const parsed = evs.map((e) => { let recurrence=null,meta=null; try { recurrence=e.recurrence_json ? JSON.parse(e.recurrence_json):null;meta=e.meta_json ? JSON.parse(e.meta_json):null; } catch {} return {id:e.id,date:e.event_date,title:e.title,time:e.event_time,completed:!!e.completed,recurrence,meta}; });
  const todays = agendaEvents(parsed,today).filter((e) => !e.completed && !['cancelled','missed'].includes(e.meta?.status) && !['race','rest'].includes(e.meta?.kind));
  if (todays.length) { const e = todays[0]; return { title: 'Séance prévue aujourd’hui 💪', body: `${String(e.title || 'Ta séance').slice(0, 80)}${e.time ? ` à ${e.time}` : ''}. On y va ?`, url: '/#/home/dash' }; }
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
