// program.js — programmes sur plusieurs semaines (sans DOM, testés) : calendrier des séances, semaines plus légères,
// suivi (faite / manquée / aujourd'hui), réajustement quand une séance est manquée, et alerte « doigts trop chargés ».
const DAY = 86400000;
export const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const monday = (t) => { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

export const PROGRAM_GOALS = {
  climb: { label: 'Grimper plus fort', emoji: '🧗', activityId: 'climbing_boulder', mode: 'weaknesses' },
  force: { label: 'Devenir plus fort', emoji: '💪', activityId: 'strength', mode: 'weaknesses' },
  endurance: { label: 'Plus d’endurance', emoji: '🔋', activityId: 'conditioning', mode: 'weaknesses', intent: 'endurance' },
  mobilite: { label: 'Être plus souple', emoji: '🧘', activityId: 'conditioning', mode: 'weaknesses', intent: 'mobilite' },
  forme: { label: 'Rester en forme', emoji: '🙂', activityId: 'conditioning', mode: 'weaknesses' },
  goal: { label: 'Mon objectif', emoji: '🎯', activityId: '', mode: 'goal' },
};
export const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
/** Jours proposés par défaut selon le nombre de séances par semaine (0 = lundi). */
export const defaultDays = (n) => ({ 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] })[Math.max(1, Math.min(7, n))];

/**
 * Construit le calendrier : `weeks` semaines, séances les jours choisis (à partir de `start`).
 * Toutes les 4 semaines, une semaine plus légère (récupération : on progresse pendant le repos).
 * La dernière semaine d'un programme de 4 semaines ou plus est une semaine bilan.
 */
export function buildProgram({ goal = 'forme', weeks = 6, days = [0, 2, 4], minutes = 45, start = ymd(Date.now()), activityId = '', goalId = '', name = '' }) {
  weeks = Math.max(1, Math.min(24, Math.round(weeks))); minutes = Math.max(10, Math.min(180, Math.round(minutes)));
  days = [...new Set(days.map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!days.length) days = [0, 2, 4];
  const g = PROGRAM_GOALS[goal] || PROGRAM_GOALS.forme, t0 = parse(start), sessions = [];
  let m0 = monday(t0);
  if (days.every((d) => addDays(m0, d) < t0)) m0 = addDays(m0, 7); // plus aucun jour choisi cette semaine : on commence lundi prochain
  for (let w = 0; w < weeks; w++) {
    const deload = weeks >= 4 && w % 4 === 3 && w !== weeks - 1, test = weeks >= 4 && w === weeks - 1;
    for (const d of days) {
      const date = addDays(m0, w * 7 + d); if (date < t0) continue;
      sessions.push({ i: sessions.length, week: w + 1, date: ymd(date), phase: test ? 'test' : deload ? 'deload' : 'build', light: deload, boost: deload || test ? 0 : w % 4, minutes: deload ? Math.max(10, Math.round(minutes * 0.7)) : minutes });
    }
  }
  return { name: name || `${g.label} · ${weeks} semaines`, goal, goalId, activityId: activityId || g.activityId, weeks, perWeek: days.length, days: days.map(String), minutes, start: ymd(t0), status: 'active', sessions };
}

/** Où en est le programme : chaque séance est faite, manquée, prévue aujourd'hui ou à venir. */
export function programStatus(prog, history, now = Date.now()) {
  const today = ymd(now);
  const done = new Map();
  for (const h of history) { const r = h.data?.program; if (r?.id === prog.id && Number.isInteger(r.i)) done.set(r.i, h); }
  const list = (prog.sessions || []).map((s) => ({ ...s, status: done.has(s.i) ? 'done' : s.date < today ? 'missed' : s.date === today ? 'today' : 'next', entry: done.get(s.i) || null }));
  const next = list.find((s) => s.status === 'today') || list.find((s) => s.status === 'next') || null;
  const nDone = list.filter((s) => s.status === 'done').length, missed = list.filter((s) => s.status === 'missed');
  const week = next ? next.week : prog.weeks;
  return { list, next, done: nDone, total: list.length, pct: list.length ? Math.round((nDone / list.length) * 100) : 0, missed, week, finished: list.length > 0 && !list.some((s) => s.status === 'today' || s.status === 'next') };
}

/**
 * Réajuste après des séances manquées : les séances non faites sont redistribuées, dans l'ordre, sur les
 * prochains jours d'entraînement à partir d'aujourd'hui (le programme finit un peu plus tard, rien n'est perdu).
 */
export function reschedule(prog, history, now = Date.now()) {
  const st = programStatus(prog, history, now), today = parse(ymd(now));
  const todo = st.list.filter((s) => s.status !== 'done');
  const days = (prog.days || []).map(Number).sort((a, b) => a - b), slots = [];
  for (let t = today; slots.length < todo.length && t < today + 400 * DAY; t = addDays(t, 1)) if (days.includes((new Date(t).getDay() + 6) % 7)) slots.push(ymd(t));
  const moved = new Map(todo.map((s, k) => [s.i, slots[k] || s.date]));
  return { ...prog, sessions: prog.sessions.map((s) => (moved.has(s.i) ? { ...s, date: moved.get(s.i) } : s)) };
}

/** Charge des doigts : séries « doigts » des 7 derniers jours comparées à la moyenne des 4 semaines d'avant. */
export function fingerLoad(history, now = Date.now()) {
  const isFinger = (e) => e.group === 'doigts' || (e.caps?.force_doigts || 0) >= 0.5 || (e.caps?.endurance_doigts || 0) >= 0.5 || /suspension|poutre|réglette/i.test(e.name || '');
  const sets = (from, to) => history.filter((h) => h.startedAt >= from && h.startedAt < to).reduce((t, h) => t + (h.data?.exercises || []).filter(isFinger).reduce((s, e) => s + (e.sets?.length || 0), 0), 0);
  const cur = sets(now - 7 * DAY, now + DAY), avg = sets(now - 35 * DAY, now - 7 * DAY) / 4;
  const alert = (avg > 0 && cur >= 8 && cur > avg * 1.5) || (avg === 0 && cur >= 14);
  return { cur, avg: Math.round(avg * 10) / 10, alert };
}

/** Séance « en forme » : une série de plus sur le corps de séance (jamais sur l'échauffement ni le retour au calme). */
export function boostSession(session, extra = 1) {
  return { ...session, exercises: session.exercises.map((e) => (e.block === 'main' || !e.block ? { ...e, sets: Math.min(8, (e.sets || 1) + extra) } : e)) };
}
