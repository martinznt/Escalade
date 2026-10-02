// ics.js — export des séances prévues vers l'agenda du téléphone (fichier .ics) ou Google Agenda (lien).
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); // norme iCalendar : \\ ; , et retours à la ligne échappés
const stamp = (ymd, hm = '18:00') => `${ymd.replaceAll('-', '')}T${hm.replace(':', '')}00`;
const plus = (ymd, hm, min) => { const [y, m, d] = ymd.split('-').map(Number), [H, M] = hm.split(':').map(Number), t = new Date(y, m - 1, d, H, M + min); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}00`; };
/** Replie les lignes à 75 octets (norme iCalendar), sans couper un caractère accentué en deux. */
const fold = (l) => { const enc = new TextEncoder(), out = []; let cur = '', n = 0; for (const ch of l) { const b = enc.encode(ch).length; if (n + b > 75) { out.push(cur); cur = ' ' + ch; n = 1 + b; } else { cur += ch; n += b; } } out.push(cur); return out.join('\r\n'); };
/**
 * events : [{ uid, title, date: 'AAAA-MM-JJ', time: 'HH:MM', minutes, desc, weekly?: true, until?: 'AAAA-MM-JJ', allDay?: true }]
 * — heure locale (« flottante ») de l'appareil ou de l'agenda abonné. feed : abonnement (actualisé toutes les heures).
 */
export function buildIcs(events, now = Date.now(), { feed = false } = {}) {
  const dt = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Seances entrainement//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Séances entraînement', ...(feed ? ['REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : [])];
  for (const e of events) {
    const t = e.time || '18:00', day = e.date.replaceAll('-', ''), next = plus(e.date, '00:00', 24 * 60).slice(0, 8);
    lines.push('BEGIN:VEVENT', `UID:${esc(e.uid)}@seances-entrainement`, `DTSTAMP:${dt}`, ...(e.allDay ? [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`] : [`DTSTART:${stamp(e.date, t)}`, `DTEND:${plus(e.date, t, e.minutes || 45)}`]),
      ...(e.weekly ? [`RRULE:FREQ=WEEKLY${e.until ? `;UNTIL=${e.until.replaceAll('-', '')}T235959` : ''}`] : []), `SUMMARY:${esc(e.title)}`, ...(e.desc ? [`DESCRIPTION:${esc(e.desc)}`] : []),
      ...(e.allDay ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Séance', 'TRIGGER:-PT30M', 'END:VALARM']), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function gcalLink(e) {
  const t = e.time || '18:00';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${stamp(e.date, t)}/${plus(e.date, t, e.minutes || 45)}&details=${encodeURIComponent(e.desc || '')}`;
}
