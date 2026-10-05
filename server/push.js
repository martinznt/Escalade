import { agendaEvents, shiftDay, timestampInZone } from '../public/agenda.js';
// server/push.js — rappels d'entraînement par notification (Web Push), sans service tiers ni clé à configurer.
// - Les clés VAPID sont créées automatiquement au premier besoin et gardées dans D1 (la clé privée ne sort jamais du serveur).
// - La notification est envoyée SANS contenu (pas de chiffrement nécessaire) : le service worker de l'appareil demande
//   ensuite le texte à /api/push/message, avec la session de l'utilisateur. Rien de personnel ne transite par le service
//   de notifications du navigateur.
// - Le déploiement réveille immédiatement le Worker ; le cron chaque minute reprend les erreurs et les rappels dus.
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
    const r = await fetchFn(endpoint, { method: 'POST', headers: await vapidAuth(env, endpoint), signal: AbortSignal.timeout(8000) });
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
  let sent = await runCalendarReminders(env, now, fetchFn, subs);
  const due = [];
  for (const s of subs) {
    if (!wants(s, 'reminder') || !isDue(s, now)) continue;
    const recent = await q(env, "SELECT COUNT(*) c FROM push_updates WHERE endpoint=? AND pending LIKE 'calendar:%' AND state='sent' AND updated_at>=?", s.endpoint, now - 60000).first();
    if (recent?.c) { await q(env, 'UPDATE push_subs SET last_day=? WHERE endpoint=?', localNow(s.tz, now).ymd, s.endpoint).run(); continue; }
    if (await quietToday(env, s.user_id, s.tz, now).catch(() => '')) { await q(env, 'UPDATE push_subs SET last_day=? WHERE endpoint=?', localNow(s.tz, now).ymd, s.endpoint).run(); continue; }
    const notice = `reminder:${s.user_id}:${localNow(s.tz, now).ymd}`;
    await q(env, "INSERT OR IGNORE INTO push_updates(notice_id,endpoint,user_id,pending,created_at,updated_at) VALUES(?,?,?,'reminder',?,?)", notice, s.endpoint, s.user_id, now, now).run();
    due.push({ ...s, notice });
  }
  sent += await flushNotices(env, fetchFn, { now, prefix: 'reminder' });
  for (const s of due) {
    const result = await q(env, 'SELECT state FROM push_updates WHERE notice_id=? AND endpoint=?', s.notice, s.endpoint).first();
    if (result?.state === 'sent') await q(env, 'UPDATE push_subs SET last_day=? WHERE endpoint=?', localNow(s.tz, now).ymd, s.endpoint).run();
  }
  return sent;
}

export const TYPES = ['reminder', 'update', 'reply', 'admin'];
export const wants = (sub, type) => { try { const t = JSON.parse(sub.types || '[]'); return Array.isArray(t) ? t.includes(type) : true; } catch { return true; } };
const parseEvents = (rows) => rows.map((r) => {
  let recurrence = null, meta = {}; try { recurrence = r.recurrence_json ? JSON.parse(r.recurrence_json) : null; meta = r.meta_json ? JSON.parse(r.meta_json) : {}; } catch { /* ancien événement incomplet */ }
  return { id: r.id, date: r.event_date, title: r.title, time: r.event_time || '', completed: !!r.completed, recurrence, meta };
});
const eventsFor = async (env, userId) => parseEvents((await q(env, 'SELECT id,event_date,title,event_time,completed,recurrence_json,meta_json FROM calendar_events WHERE user_id=?', userId).all()).results || []);
/** Un rappel de rendez-vous nécessite un délai >0 et une heure ; 0 coupe aussi le rappel hérité d'une série. */
export function calendarDue(e, tz, now = Date.now()) {
  const minutes = Number(e.meta?.reminderMin);
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440 || !e.time || e.completed || ['done', 'missed', 'cancelled'].includes(e.meta?.status)) return false;
  try {
    const start = timestampInZone(e.on, e.time, e.recurrence?.timeZone || tz || 'Europe/Paris');
    return now >= start - minutes * 60000 && now < start;
  } catch { return false; } // heure inexistante au changement d'heure : aucun rappel à un instant inventé
}
async function calendarOccurrence(env, userId, sourceId, occurrenceDate) {
  const events = await eventsFor(env, userId);
  const override = events.filter((e) => e.meta?.seriesId === sourceId && e.meta?.occurrenceDate === occurrenceDate).sort((a, b) => (b.meta?.version || 0) - (a.meta?.version || 0))[0];
  const day = override?.date || occurrenceDate;
  return agendaEvents(events, day).find((e) => e.sourceId === sourceId && e.occurrenceDate === occurrenceDate);
}
export async function runCalendarReminders(env, now = Date.now(), fetchFn = fetch, subscriptions = null) {
  const subs = subscriptions || (await q(env, 'SELECT endpoint,user_id,tz,types FROM push_subs').all()).results || [];
  const users = new Map();
  const byZone = new Map();
  for (const s of subs) if (wants(s, 'reminder')) {
    if (!users.has(s.user_id)) users.set(s.user_id, await eventsFor(env, s.user_id));
    if (await quietToday(env, s.user_id, s.tz, now).catch(() => '') === 'pause') continue;
    for (const base of users.get(s.user_id).filter((e) => !e.meta?.seriesId)) {
      const zone = base.recurrence?.timeZone || s.tz, key = s.user_id + '/' + zone;
      if (!byZone.has(key)) {
        const day = localNow(zone, now).ymd;
        byZone.set(key, agendaEvents(users.get(s.user_id), shiftDay(day, -1), shiftDay(day, 1)));
      }
      const occurrences = byZone.get(key).filter((e) => e.sourceId === base.id && calendarDue(e, s.tz, now));
      for (const e of occurrences) {
        const id = `calendar:${s.user_id}:${e.sourceId}:${e.occurrenceDate}`, pending = `calendar:${e.sourceId}/${e.occurrenceDate}`;
        await q(env, `INSERT OR IGNORE INTO push_updates(notice_id,endpoint,user_id,pending,created_at,updated_at) VALUES(?,?,?,?,?,?)`, id, s.endpoint, s.user_id, pending, now, now).run();
      }
    }
  }
  return flushNotices(env, fetchFn, { now, prefix: 'calendar:' });
}
/** Prévient les abonnés d'un type (et, si donné, seulement ceux de ces comptes). Le texte est lu ensuite par l'appareil. */
export async function notifyType(env, type, { userIds = null, fetchFn = fetch, limit = 500 } = {}) {
  const rows = (await q(env, 'SELECT endpoint,user_id,types FROM push_subs LIMIT ?', limit).all()).results || [];
  const now = Date.now(), notice = type + ':' + crypto.randomUUID();
  let targeted = 0;
  for (const s of rows) {
    // Une annonce de l'administrateur va aux appareils qui veulent les nouveautés.
    if (!wants(s, type === 'announce' ? 'update' : type) || (userIds && !userIds.includes(s.user_id))) continue;
    targeted++;
    await q(env, 'INSERT INTO push_updates(notice_id,endpoint,user_id,pending,created_at,updated_at) VALUES(?,?,?,?,?,?)', notice, s.endpoint, s.user_id, type, now, now).run();
  }
  await flushNotices(env, fetchFn, { now });
  const stats = await q(env, "SELECT COALESCE(SUM(state='sent'),0) sent,COALESCE(SUM(state='gone'),0) gone,COALESCE(SUM(state='pending'),0) errors FROM push_updates WHERE notice_id=?", notice).first();
  // Suivi visible par les administrateurs : quand, combien d'appareils joints, combien d'abonnements expirés ou en erreur.
  if (type === 'update' || type === 'announce') await q(env, "INSERT INTO system_state(key,value) VALUES('last_notify',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify({ type, at: now, total: rows.length, targeted, ...stats })).run().catch(() => {});
  return stats?.sent || 0;
}
const UPDATE_CHOICE = "CASE WHEN json_valid(types) THEN CASE WHEN json_type(types)='array' THEN EXISTS (SELECT 1 FROM json_each(types) WHERE value='update') ELSE 1 END ELSE 1 END";
const noticeKey = (build) => 'noticed:' + build;
function queueNotice(env, id, pending, force, now, guard = '') {
  return q(env, `INSERT OR IGNORE INTO push_updates(notice_id,endpoint,user_id,pending,force,created_at,updated_at)
    SELECT ?,endpoint,user_id,?,?,?,? FROM push_subs WHERE (? OR ${UPDATE_CHOICE})
    ${guard ? "AND EXISTS (SELECT 1 FROM system_state WHERE key=? AND value=?)" : ''}`,
  id, pending, force ? 1 : 0, now, now, force ? 1 : 0, ...(guard ? [noticeKey(id), guard] : []));
}
/** Reprise des seuls appareils non joints ; un verrou atomique empêche cron et requêtes de doubler un envoi. */
export async function flushNotices(env, fetchFn = fetch, { now = Date.now(), limit = 100, prefix = '' } = {}) {
  const candidates = (await q(env, `SELECT p.* FROM push_updates p WHERE ((p.state='pending' AND p.next_at<=?) OR (p.state='sending' AND p.lease_until<=?)) ${prefix ? 'AND p.pending LIKE ?' : ''}
    AND NOT EXISTS (SELECT 1 FROM push_updates busy WHERE busy.endpoint=p.endpoint AND busy.state='sending' AND busy.lease_until>?) ORDER BY p.created_at DESC,p.notice_id,p.endpoint LIMIT ?`, now, now, ...(prefix ? [prefix + '%'] : []), now, limit).all()).results || [];
  const endpoints = new Set(), rows = candidates.filter((r) => { if (endpoints.has(r.endpoint)) return false; endpoints.add(r.endpoint); return true; });
  let sent = 0;
  const started = Date.now();
  for (let i = 0; i < rows.length; i += 10) {
    if (Date.now() - started > 18000) break; // rester dans la fenêtre waitUntil ; la minute suivante reprend la suite
    await Promise.all(rows.slice(i, i + 10).map(async (r) => {
      const token = crypto.randomUUID();
      const claimed = await q(env, `UPDATE push_updates SET state='sending',token=?,lease_until=?,attempts=attempts+1,updated_at=?
        WHERE notice_id=? AND endpoint=? AND ((state='pending' AND next_at<=?) OR (state='sending' AND lease_until<=?))
        AND NOT EXISTS (SELECT 1 FROM push_updates busy WHERE busy.endpoint=? AND busy.state='sending' AND busy.lease_until>? AND busy.notice_id<>?)`, token, now + 60000, now, r.notice_id, r.endpoint, now, now, r.endpoint, now, r.notice_id).run();
      if (!claimed.meta?.changes) return;
      const sub = await q(env, 'SELECT user_id,types,tz,days,hour,last_day FROM push_subs WHERE endpoint=?', r.endpoint).first();
      let state = 'skipped';
      const calendar = r.pending.startsWith('calendar:');
      const choice = calendar || r.pending === 'reminder' ? 'reminder' : r.pending.startsWith('announce') ? 'update' : r.pending;
      let ready = sub && sub.user_id === r.user_id && (r.force || wants(sub, choice));
      if (ready && r.pending === 'reminder') ready = isDue(sub, now) && !(await quietToday(env, r.user_id, sub.tz, now).catch(() => ''));
      if (ready && calendar) {
        const [sourceId, occurrenceDate] = r.pending.slice(9).split('/');
        const event = await calendarOccurrence(env, r.user_id, sourceId, occurrenceDate);
        const settings = await q(env, 'SELECT tz FROM push_subs WHERE endpoint=?', r.endpoint).first();
        ready = !!event && calendarDue(event, settings?.tz, now) && (await quietToday(env, r.user_id, settings?.tz, now).catch(() => '')) !== 'pause';
      }
      if (ready) {
        await q(env, 'UPDATE push_subs SET pending=? WHERE endpoint=? AND user_id=?', r.pending, r.endpoint, r.user_id).run();
        const result = await sendPush(env, r.endpoint, fetchFn);
        state = result === 'ok' ? 'sent' : result === 'gone' ? 'gone' : 'pending';
        if (result === 'ok') sent++;
        if (result === 'gone') await q(env, 'DELETE FROM push_subs WHERE endpoint=?', r.endpoint).run();
      }
      const retryAt = state === 'pending' ? now + Math.min(1800000, 30000 * 2 ** Math.min(r.attempts, 6)) : 0;
      await q(env, `UPDATE push_updates SET state=CASE WHEN read_at>0 THEN 'sent' ELSE ? END,next_at=CASE WHEN read_at>0 THEN 0 ELSE ? END,lease_until=0,token='',updated_at=? WHERE notice_id=? AND endpoint=? AND token=?`, state, retryAt, now, r.notice_id, r.endpoint, token).run();
    }));
  }
  for (const id of new Set(rows.map((r) => r.notice_id))) {
    if (id.startsWith('calendar:') || id.startsWith('reminder:') || id.startsWith('reply:') || id.startsWith('admin:')) continue;
    const stats = await recordNotice(env, id, id.startsWith('announce-') ? 'broadcast' : 'update', now);
    if (id.startsWith('announce-')) {
      const old = await q(env, "SELECT value FROM system_state WHERE key='last_broadcast'").first();
      let last = null; try { last = JSON.parse(old?.value || 'null'); } catch { /* ancien suivi */ }
      if (last?.id === id) await q(env, "UPDATE system_state SET value=? WHERE key='last_broadcast'", JSON.stringify({ ...last, ...stats })).run();
    }
  }
  return sent;
}
async function recordNotice(env, id, type, now) {
  const c = await q(env, `SELECT COUNT(*) targeted,COALESCE(SUM(state='sent'),0) sent,COALESCE(SUM(state='gone'),0) gone,
    COALESCE(SUM(state='skipped'),0) skipped,COALESCE(SUM(state IN ('pending','sending')),0) pending,
    COALESCE(SUM(state='pending' AND attempts>0),0) errors FROM push_updates WHERE notice_id=?`, id).first();
  const total = (await q(env, 'SELECT COUNT(*) c FROM push_subs').first())?.c || 0;
  const stats = { type, id, at: now, total, ...c };
  await q(env, "INSERT INTO system_state(key,value) VALUES('last_notify',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(stats)).run();
  return stats;
}
/** Un identifiant de déploiement est enregistré une fois. Les erreurs restent dans la file, les succès jamais repris. */
export async function updateNotice(env, build, fetchFn = fetch, options = {}) {
  if (!build || build === 'dev') return 0;
  const now = options.now ?? Date.now();
  const row = await q(env, "SELECT value FROM system_state WHERE key='last_build'").first();
  if (!row) {
    await env.DB.batch([
      q(env, "INSERT OR IGNORE INTO system_state(key,value) VALUES('last_build',?)", build),
      q(env, "INSERT OR IGNORE INTO system_state(key,value) SELECT ?,'baseline' FROM system_state WHERE key='last_build' AND value=?", noticeKey(build), build),
    ]);
    return 0; // première installation : garder la référence, sans annoncer une fausse mise à jour
  }
  // Conserver aussi la référence de l'ancien serveur : une ancienne instance ne réannonce pas l'ancienne version.
  await q(env, "INSERT OR IGNORE INTO system_state(key,value) VALUES(?,'baseline')", noticeKey(row.value)).run();
  if (row.value !== build) {
    const token = crypto.randomUUID();
    await env.DB.batch([
      q(env, 'INSERT OR IGNORE INTO system_state(key,value) VALUES(?,?)', noticeKey(build), token),
      queueNotice(env, build, 'update', false, now, token),
      q(env, "UPDATE system_state SET value=? WHERE key='last_build' AND EXISTS (SELECT 1 FROM system_state WHERE key=? AND value=?)", build, noticeKey(build), token),
    ]);
  }
  const sent = await flushNotices(env, fetchFn, { ...options, now });
  const current = (await q(env, "SELECT value FROM system_state WHERE key='last_build'").first())?.value;
  if (current === build && (await q(env, 'SELECT COUNT(*) c FROM push_updates WHERE notice_id=?', build).first())?.c) await recordNotice(env, build, 'update', now);
  return sent;
}
/** Annonce finale choisie par un administrateur : visible sur le site pour tous, push sur les appareils autorisés.
 * Son identifiant est stable lors d'une reprise. Le réglage des mises à jour automatiques n'est pas modifié. */
export async function broadcastNotice(env, { id, title, body, version, build, actorId }, fetchFn = fetch, options = {}) {
  const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  title = clean(title, 100); body = clean(body, 1200);
  if (!/^[\w-]{1,64}$/.test(String(id || '')) || !title || !body || !actorId) return { error: 'Ajoute un titre et un message.', status: 400 };
  const now = options.now ?? Date.now(), old = await q(env, "SELECT data_json FROM global_content WHERE kind='announce' AND id=?", id).first();
  if (old) {
    const d = JSON.parse(old.data_json);
    if (d.title !== title || d.body !== body || d.version !== version || d.build !== build) return { error: 'Cette annonce a déjà été envoyée avec un autre contenu.', status: 409 };
  }
  const data = { title, body, version, build, update: true, banner: true, until: now + 7 * 86400000, emoji: '📣' };
  const token = crypto.randomUUID(), notice = 'announce-' + id;
  await env.DB.batch([
    q(env, "INSERT OR IGNORE INTO global_content(kind,id,data_json,hidden,updated_at,updated_by) VALUES('announce',?,?,0,?,?)", id, JSON.stringify(data), now, actorId),
    q(env, "INSERT OR IGNORE INTO system_state(key,value) VALUES(?,?)", noticeKey(notice), token),
    queueNotice(env, notice, 'announce:' + id, true, now, token),
    q(env, `INSERT INTO audit_events(id,at,actor_id,action,target_type,target_id,after_json)
      SELECT ?,?,?,'push_broadcast','announce',?,? WHERE EXISTS (SELECT 1 FROM system_state WHERE key=? AND value=?)`, crypto.randomUUID(), now, actorId, id, JSON.stringify({ title, body, version, build, audience: 'all' }), noticeKey(notice), token),
  ]);
  const stored = JSON.parse((await q(env, "SELECT data_json FROM global_content WHERE kind='announce' AND id=?", id).first()).data_json);
  if (stored.title !== title || stored.body !== body || stored.version !== version || stored.build !== build) return { error: 'Cette annonce a déjà été envoyée avec un autre contenu.', status: 409 };
  await flushNotices(env, fetchFn, { ...options, now });
  const stats = await recordNotice(env, notice, 'broadcast', now);
  await q(env, "INSERT INTO system_state(key,value) VALUES('last_broadcast',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify({ ...stats, title, body, version, build })).run();
  return { ok: true, id, ...stats, visibleToAll: true };
}
/** Texte à afficher pour une notification reçue par un appareil (selon ce qui l'a déclenchée). */
export async function messageFor(env, endpoint, userId, tz, now = Date.now()) {
  const sub = endpoint ? await q(env, 'SELECT user_id,pending,silent FROM push_subs WHERE endpoint=?', endpoint).first() : null;
  const mine = sub && (!userId || sub.user_id === userId);
  let pending = mine ? sub.pending : '';
  if (mine) {
    // Un seul UPDATE choisit et consomme une notice. Deux réveils concurrents reçoivent deux messages distincts.
    // 'sending' compte aussi : le navigateur peut demander le texte avant l'accusé de réception HTTP du push.
    const notice = await q(env, `UPDATE push_updates SET read_at=? WHERE notice_id=(SELECT notice_id FROM push_updates
      WHERE endpoint=? AND user_id=? AND read_at=0 AND state IN ('sending','sent') ${userId ? '' : "AND pending NOT LIKE 'calendar:%'"}
      ORDER BY created_at,notice_id LIMIT 1) AND endpoint=? AND read_at=0 RETURNING pending`, now, endpoint, sub.user_id, endpoint).first();
    if (notice) pending = notice.pending;
    if (pending) await q(env, "UPDATE push_subs SET pending='' WHERE endpoint=? AND pending=?", endpoint, pending).run();
  }
  const silent = !!(mine && sub.silent);
  if (pending.startsWith('calendar:') && userId) {
    const [sourceId, occurrenceDate] = pending.slice(9).split('/');
    const event = await calendarOccurrence(env, userId, sourceId, occurrenceDate);
    if (event && !event.completed && !['done', 'missed', 'cancelled'].includes(event.meta?.status)) return {
      title: 'Rendez-vous à venir', body: `${String(event.title || 'Ta séance').slice(0, 100)} à ${event.time}${event.meta?.place ? ` · ${String(event.meta.place).slice(0, 70)}` : ''}.`, url: '/#/home/agenda', silent,
    };
  }
  if (pending === 'announce' || pending.startsWith('announce:')) {
    const a = pending.startsWith('announce:') ? await q(env, "SELECT data_json FROM global_content WHERE kind='announce' AND id=? AND hidden=0", pending.slice(9)).first() : await q(env, "SELECT data_json FROM global_content WHERE kind='announce' AND hidden=0 ORDER BY updated_at DESC LIMIT 1").first();
    let d = {}; try { d = JSON.parse(a?.data_json || '{}'); } catch { /* rien */ }
    return { title: `${d.emoji || '📣'} ${d.title || 'Annonce'}`, body: String(d.body || '').slice(0, 180), url: '/?news=1#/home/dash', silent };
  }
  if (pending === 'update') return { title: 'Mes séances : nouvelle mise à jour', body: 'Ouvre l’app pour voir les nouveautés. Tu peux passer la visite.', url: '/?news=1#/home/dash', silent };
  if (pending === 'admin') return { title: 'Nouvelle proposition 📬', body: 'Quelqu’un propose une idée pour l’app. À valider dans Paramètres › Administration.', url: '/?news=1#/home/dash', silent }; // la boîte 🔔 : une notification par idée, qui mène à l'endroit concerné
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
