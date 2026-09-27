// ics.js — export des séances prévues vers l'agenda du téléphone (fichier .ics) ou Google Agenda (lien).
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (ymd, hm = '18:00') => `${ymd.replaceAll('-', '')}T${hm.replace(':', '')}00`;
const plus = (ymd, hm, min) => { const [y, m, d] = ymd.split('-').map(Number), [H, M] = hm.split(':').map(Number), t = new Date(y, m - 1, d, H, M + min); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}00`; };
/** Replie les lignes à 75 caractères (norme iCalendar). */
const fold = (l) => { const out = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
/** events : [{ uid, title, date: 'AAAA-MM-JJ', time: 'HH:MM', minutes, desc }] — heure locale de l'appareil. */
export function buildIcs(events, now = Date.now()) {
  const dt = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Seances entrainement//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Séances entraînement'];
  for (const e of events) {
    const t = e.time || '18:00';
    lines.push('BEGIN:VEVENT', `UID:${esc(e.uid)}@seances-entrainement`, `DTSTAMP:${dt}`, `DTSTART:${stamp(e.date, t)}`, `DTEND:${plus(e.date, t, e.minutes || 45)}`, `SUMMARY:${esc(e.title)}`, ...(e.desc ? [`DESCRIPTION:${esc(e.desc)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Séance', 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function gcalLink(e) {
  const t = e.time || '18:00';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${stamp(e.date, t)}/${plus(e.date, t, e.minutes || 45)}&details=${encodeURIComponent(e.desc || '')}`;
}
