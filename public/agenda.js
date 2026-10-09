// Une règle de planning, des exceptions datées, un journal réel indépendant. Sans DOM.
const text = (v, n = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const id = (v) => /^[\w-]{1,64}$/.test(String(v || '')) ? String(v) : '';
export function validDay(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false;
  const t = Date.parse(v + 'T12:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}
export const weekday = (day) => new Date(day + 'T12:00:00Z').getUTCDay();
export const shiftDay = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function cleanRecurrence(r) {
  if (!r || r.freq !== 'weekly') return null;
  const days = [...new Set((Array.isArray(r.days) ? r.days : []).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
  let timeZone = ''; try { if (typeof r.timeZone === 'string') { new Intl.DateTimeFormat('fr', { timeZone: r.timeZone }).format(); timeZone = r.timeZone.slice(0, 80); } } catch { /* fuseau inconnu */ }
  return { freq: 'weekly', until: validDay(r.until) ? r.until : null, ...(days.length ? { days } : {}), ...(timeZone ? { timeZone } : {}) };
}
export function cleanAgendaMeta(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const out = {};
  if (validDay(m.stopFrom)) out.stopFrom = m.stopFrom;
  if (m.kind === 'activity') out.kind = 'activity';
  if (m.place) out.place = text(m.place, 80);
  if (id(m.seriesId) && validDay(m.occurrenceDate)) { out.seriesId = id(m.seriesId); out.occurrenceDate = m.occurrenceDate; }
  if (['planned', 'done', 'missed', 'cancelled'].includes(m.status)) out.status = m.status;
  if (Number.isInteger(m.reminderMin) && m.reminderMin >= 0 && m.reminderMin <= 1440) out.reminderMin = m.reminderMin;
  if (Number.isFinite(m.version) && m.version > 0) out.version = Math.floor(m.version);
  return out;
}
export function occursOn(e, day) {
  if (!e || !validDay(day) || !validDay(e.date) || e.meta?.seriesId) return false;
  if (e.meta?.stopFrom && day >= e.meta.stopFrom) return false;
  if (!e.recurrence) return e.date === day;
  const r = cleanRecurrence(e.recurrence);
  return !!r && day >= e.date && (!r.until || day <= r.until) && (r.days || [weekday(e.date)]).includes(weekday(day));
}
export function agendaEvents(events, from, to = from) {
  if (!validDay(from) || !validDay(to) || from > to) return [];
  const roots = new Map(events.filter((e) => !e.meta?.seriesId).map((e) => [e.id, e])), exceptions = new Map();
  for (const e of events) if (e.meta?.seriesId) {
    const key = `${e.meta.seriesId}/${e.meta.occurrenceDate}`, old = exceptions.get(key);
    if (!old || (e.meta.version || 0) >= (old.meta.version || 0)) exceptions.set(key, e);
  }
  const out = [], make = (base, day, override) => ({ ...base, ...override, recurrence: base.recurrence, sourceId: base.id, occurrenceDate: day,
    on: override?.date || day, meta: { ...base.meta, ...override?.meta }, completed: override ? !!override.completed : (base.recurrence ? false : !!base.completed),
    planned: { date: day, title: base.title, time: base.time || '', meta: base.meta, sessionId: base.sessionId } });
  for (let day = from; day <= to; day = shiftDay(day, 1)) for (const base of roots.values()) if (occursOn(base, day) && !exceptions.has(`${base.id}/${day}`)) out.push(make(base, day));
  for (const e of exceptions.values()) {
    const base = roots.get(e.meta.seriesId);
    if (base && occursOn(base, e.meta.occurrenceDate) && e.date >= from && e.date <= to) out.push(make(base, e.meta.occurrenceDate, e));
  }
  return out.sort((a, b) => a.on.localeCompare(b.on) || (a.time || '99').localeCompare(b.time || '99'));
}
export const exceptionId = (seriesId, day) => `occ-${seriesId.slice(0, 42)}-${day}`;
export function occurrenceChange(base, day, patch = {}) {
  if (!occursOn(base, day)) throw new Error('Occurrence inconnue.');
  return { ...base, ...patch, id: exceptionId(base.id, day), date: patch.date || day, recurrence: null,
    meta: { ...base.meta, ...patch.meta, seriesId: base.id, occurrenceDate: day, version: Math.max(Date.now(), (patch.meta?.version || 0) + 1) } };
}
export function splitSeries(base, from, nextId, patch = {}) {
  if (!validDay(from) || from < base.date || !base.recurrence) throw new Error('Début de série invalide.');
  return [ { ...base, meta: { ...base.meta, stopFrom: from } },
    { ...base, ...patch, id: nextId, date: patch.date || from, completed: false, recurrence: { ...base.recurrence, ...patch.recurrence } } ];
}
export function dayInZone(t = Date.now(), timeZone = 'Europe/Paris') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function timestampInZone(day, time = '12:00', zone = 'Europe/Paris') {
  if (!validDay(day)) throw new Error('Date invalide.');
  let t = Date.parse(`${day}T${time || '12:00'}:00Z`), target = t;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`), delta = target - local; if (!delta) return t; t += delta;
  }
  throw new Error('Cette heure n’existe pas dans ton fuseau (changement d’heure).');
}
export function journalEntries({ event, day, activities, timeZone, now = Date.now(), standaloneId = '' }) {
  if (!validDay(day) || day > dayInZone(now, timeZone)) throw new Error('Une activité future doit être planifiée.');
  const rootId = event?.sourceId || event?.id || standaloneId;
  if (!id(rootId)) throw new Error('Identifiant invalide.');
  return activities.slice(0, 8).map((a, i) => {
    const startedAt = Math.min(now, timestampInZone(day, a.time || '12:00', timeZone));
    const minutes = a.minutes === '' || a.minutes == null ? null : Number(a.minutes);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)) throw new Error('Durée invalide.');
    return { id: `log-${rootId.slice(0, 36)}-${day}-${i}`, sessionId: i === 0 ? event?.sessionId || null : null,
      sessionName: text(a.label || event?.title || 'Activité'), startedAt, durationSeconds: minutes === null ? 0 : Math.round(minutes * 60),
      data: { activity: text(a.activityId, 80), rpe: Number(a.rpe) >= 1 && Number(a.rpe) <= 5 ? Number(a.rpe) : 0, note: text(a.note, 600),
        context: { env: a.envId || '', envName: text(a.place, 80), place: text(a.place, 80) }, exercises: [],
        quickLog: { durationKnown: minutes !== null, performance: text(a.performance, 100), order: ['before', 'after'].includes(a.order) ? a.order : 'main' },
        agenda: event ? { eventId: rootId, occurrenceDate: event.occurrenceDate || day, planned: event.planned || { date: day, title: event.title, time: event.time } } : null } };
  });
}
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’]/g, "'");
export function parseAgendaText(input) {
  const s = norm(input), recurrenceText = s.split(/\s(?:a|chez)\s/)[0], days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'].flatMap((d, i) => new RegExp('\\b'+d+'s?\\b').test(recurrenceText) ? [i] : []);
  if (!/tous|toutes|chaque/.test(s) || !days.length) return null;
  const activityId = /\bvoie\b/.test(s) ? 'climbing_route' : /\bbloc\b/.test(s) ? 'climbing_boulder' : /course|courir/.test(s) ? 'running' : /natation|nager/.test(s) ? 'swimming' : /musculation/.test(s) ? 'strength' : /renfo/.test(s) ? 'conditioning' : '';
  const place = String(input).match(/(?:^|\s)(?:à|a|chez)\s+(.+?)(?:\s+(?:tous|toutes|chaque|à\s+\d)|[.!]|$)/i)?.[1]?.trim() || '';
  const tm = s.match(/\b([01]?\d|2[0-3])(?:h|:)([0-5]\d)?\b/);
  return { days, activityId, place: text(place, 80), time: tm ? `${tm[1].padStart(2, '0')}:${tm[2] || '00'}` : '' };
}

/** Export iCalendar de la règle et de ses exceptions, sans modifier les données stockées. */
export function calendarIcsEvents(events) {
  const out=[];
  for(const base of events.filter((e)=>!e.meta?.seriesId)) {
    let date=base.date;
    if(base.recurrence)for(let i=0;i<7 && !occursOn(base,date);i++)date=shiftDay(date,1);
    if(!occursOn(base,date))continue;
    let until=base.recurrence?.until || '';
    if(base.meta?.stopFrom && (!until || base.meta.stopFrom<=until))until=shiftDay(base.meta.stopFrom,-1);
    const exceptions=events.filter((e)=>e.meta?.seriesId===base.id);
    // Rendez-vous unique modifié ou annulé : sa version modifiée le remplace (pas d'EXDATE sans répétition, que des agendas ignorent).
    const replaced=!base.recurrence && exceptions.some((e)=>e.meta?.occurrenceDate===date);
    if(!replaced)out.push({uid:'ev-'+base.id,title:(base.meta?.kind === 'race' ? '🏁 ' : '🏋️ ')+(base.title || 'Activité'),date,time:base.time || '',timeZone:base.recurrence?.timeZone,minutes:base.meta?.minutes || 60,allDay:!base.time,weekly:base.recurrence?.freq==='weekly',days:base.recurrence?.days,until,
      exDates:exceptions.map((e)=>e.meta.occurrenceDate),desc:base.meta?.place || base.meta?.note || '',done:!base.recurrence && !!base.completed});
    for(const e of exceptions)if(!['cancelled','missed'].includes(e.meta?.status) && occursOn(base,e.meta.occurrenceDate))out.push({uid:'ev-'+e.id,title:e.title || base.title,date:e.date,time:e.time || '',timeZone:base.recurrence?.timeZone,minutes:e.meta?.minutes || base.meta?.minutes || 60,allDay:!e.time,desc:e.meta?.place || '',done:!!e.completed});
  }
  return out;
}
