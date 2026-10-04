// ics.js — export des séances prévues vers l'agenda du téléphone (fichier .ics) ou Google Agenda (lien).
import { timestampInZone } from './agenda.js';
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); // norme iCalendar : \\ ; , et retours à la ligne échappés
const stamp = (ymd, hm = '18:00') => `${ymd.replaceAll('-', '')}T${hm.replace(':', '')}00`;
const plus = (ymd, hm, min) => { const [y, m, d] = ymd.split('-').map(Number), [H, M] = hm.split(':').map(Number), t = new Date(y, m - 1, d, H, M + min); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}00`; };
/** Replie les lignes à 75 octets (norme iCalendar), sans couper un caractère accentué en deux. */
const fold = (l) => { const enc = new TextEncoder(), out = []; let cur = '', n = 0; for (const ch of l) { const b = enc.encode(ch).length; if (n + b > 75) { out.push(cur); cur = ' ' + ch; n = 1 + b; } else { cur += ch; n += b; } } out.push(cur); return out.join('\r\n'); };
/**
 * events : [{ uid, title, date: 'AAAA-MM-JJ', time: 'HH:MM', minutes, desc, weekly?: true, until?: 'AAAA-MM-JJ', allDay?: true }]
 * — fuseau IANA si timeZone est fourni ; heure flottante pour les anciens événements. feed : abonnement.
 */
export function buildIcs(events, now = Date.now(), { feed = false } = {}) {
  const dt = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Seances entrainement//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Séances entraînement', ...(feed ? ['REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : [])];
  for (const e of events) {
    const t = e.time || '18:00', day = e.date.replaceAll('-', ''), next = plus(e.date, '00:00', 24 * 60).slice(0, 8);
    let zone = ''; try { if (typeof e.timeZone === 'string' && /^[A-Za-z_]+(?:\/[A-Za-z_+-]+)+$/.test(e.timeZone)) { new Intl.DateTimeFormat('fr', {timeZone:e.timeZone}).format(); zone=e.timeZone; } } catch { /* anciens événements : heure flottante */ }
    const tz = zone && !e.allDay ? ';TZID='+zone : '';
    const until = e.until ? e.allDay ? e.until.replaceAll('-', '') : zone ? new Date(timestampInZone(e.until,'23:59',zone)+59000).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z') : e.until.replaceAll('-', '')+'T235959' : '';
    lines.push('BEGIN:VEVENT', `UID:${esc(e.uid)}@seances-entrainement`, `DTSTAMP:${dt}`, ...(e.allDay ? [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`] : [`DTSTART${tz}:${stamp(e.date, t)}`, zone ? `DURATION:PT${e.minutes || 45}M` : `DTEND:${plus(e.date, t, e.minutes || 45)}`]),
      ...(e.weekly ? [`RRULE:FREQ=WEEKLY${e.days?.length ? ';BYDAY='+e.days.map((d) => ['SU','MO','TU','WE','TH','FR','SA'][d]).join(',') : ''}${until ? ';UNTIL='+until : ''}`] : []), ...(e.exDates?.length ? [e.allDay ? `EXDATE;VALUE=DATE:${e.exDates.map((d)=>d.replaceAll('-', '')).join(',')}` : `EXDATE${tz}:${e.exDates.map((d)=>stamp(d,t)).join(',')}`] : []), `SUMMARY:${esc(e.title)}`, ...(e.desc ? [`DESCRIPTION:${esc(e.desc)}`] : []),
      ...(e.allDay || e.done ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Séance', 'TRIGGER:-PT30M', 'END:VALARM']), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function gcalLink(e) {
  const t = e.time || '18:00';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${stamp(e.date, t)}/${plus(e.date, t, e.minutes || 45)}&details=${encodeURIComponent(e.desc || '')}${e.timeZone ? '&ctz='+encodeURIComponent(e.timeZone) : ''}`;
}
