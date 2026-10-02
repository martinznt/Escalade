// planning.js — organiser ses semaines (sans DOM, testé) :
//  · objectif daté : programme construit À REBOURS depuis la date (fondation → spécifique → affûtage, semaine légère
//    toutes les 4 semaines), recalculé quand des séances sont manquées ou que les jours changent ;
//  · disponibilités (créneaux par jour) et horaires d'ouverture des lieux ;
//  · pilote automatique : la semaine proposée d'après tes créneaux, ce qui est déjà prévu, tes événements importants,
//    ta pause éventuelle et ta forme ; rien n'est ajouté au calendrier sans ta validation ;
//  · conflits : séance la veille d'un événement important, deux séances au même moment, hors des horaires du lieu,
//    pendant une pause, 3 jours d'affilée ; chaque conflit propose une correction ;
//  · séances prévues non faites → décaler ; pause (vacances / blessure) ; « ta semaine en 10 secondes ».
import { ymd } from './program.js';

const DAY = 86400000;
export const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const monday = (t) => { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
export const weekday = (s) => (new Date(parseDay(s)).getDay() + 6) % 7; // 0 = lundi
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(parseDay(s));
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
export const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
export const DAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const fmt = (s) => new Date(parseDay(s)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/* ───────── Phases d'un objectif daté ───────── */
export const PHASES = {
  build: { label: 'Fondation', text: 'Volume, technique et force générale : on construit la base.' },
  deload: { label: 'Semaine légère', text: 'Environ 30 % de volume en moins : le corps assimile le travail.' },
  specific: { label: 'Spécifique', text: 'Au plus près de ton objectif : mêmes efforts, même intensité que le jour J.' },
  taper: { label: 'Affûtage', text: 'Volume réduit de 40 à 60 %, intensité gardée : tu arrives frais le jour J.' },
  test: { label: 'Bilan', text: 'Tests pour mesurer tes progrès.' },
};
/**
 * Programme à rebours jusqu'à une date (compétition, sortie, course…). Semaines comptées du lundi de départ à celui
 * de l'événement (24 au plus : au-delà, le programme commence 24 semaines avant). Affûtage : 2 semaines si 6 semaines
 * ou plus, sinon 1 ; spécifique : environ un tiers du reste (1 à 4 semaines) ; fondation : le reste, avec une semaine
 * légère toutes les 4. Aucune séance la veille ni le jour de l'événement.
 */
export function backwardPlan({ eventDate, eventLabel = '', goal = 'forme', days = [0, 2, 4], minutes = 45, start = ymd(Date.now()), activityId = '', goalId = '' } = {}) {
  if (!isDay(eventDate) || !isDay(start)) return null;
  let t0 = parseDay(start); const tE = parseDay(eventDate);
  if (tE <= addDays(t0, 1)) return null; // il faut au moins un jour d'entraînement avant la veille
  days = [...new Set((days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!days.length) days = [0, 2, 4];
  minutes = Math.max(10, Math.min(180, Math.round(Number(minutes) || 45)));
  const mE = monday(tE); let m0 = monday(t0);
  if (Math.round((mE - m0) / (7 * DAY)) + 1 > 24) { m0 = addDays(mE, -23 * 7); t0 = m0; }
  const weeks = Math.round((mE - m0) / (7 * DAY)) + 1;
  const taperW = weeks >= 6 ? 2 : 1, rest = weeks - taperW;
  const specificW = rest >= 3 ? Math.min(4, Math.max(1, Math.round(rest / 3))) : rest >= 1 ? 1 : 0, buildW = rest - specificW;
  const sessions = [];
  for (let w = 0; w < weeks; w++) {
    const phase = w < buildW ? (w % 4 === 3 && w !== buildW - 1 ? 'deload' : 'build') : w < buildW + specificW ? 'specific' : 'taper';
    const ti = w - buildW - specificW, f = phase === 'deload' ? 0.7 : phase !== 'taper' ? 1 : taperW === 2 ? (ti === 0 ? 0.7 : 0.5) : 0.55;
    for (const d of days) {
      const t = addDays(m0, w * 7 + d);
      if (t < t0 || t >= addDays(tE, -1)) continue;
      sessions.push({ i: sessions.length, week: w + 1, date: ymd(t), phase, light: phase === 'deload', boost: phase === 'build' ? w % 4 : 0, minutes: Math.max(10, Math.round(minutes * f)) });
    }
  }
  const label = String(eventLabel || '').trim().slice(0, 60);
  return { name: `${label || 'Mon objectif'} · ${new Date(tE).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`.slice(0, 80), goal, goalId, activityId, weeks, perWeek: days.length, days: days.map(String), minutes, start: ymd(t0), status: 'active', sessions, eventDate, eventLabel: label };
}
/** Où on en est par rapport à la date : phase de la semaine en cours, semaines restantes, texte court. */
export function eventPhase(prog, now = Date.now()) {
  if (!prog?.eventDate) return null;
  const today = ymd(now), left = Math.round((parseDay(prog.eventDate) - parseDay(today)) / DAY);
  const cur = (prog.sessions || []).find((s) => s.date >= today) || (prog.sessions || []).at(-1);
  const phase = left < 0 ? 'done' : cur?.phase || 'taper';
  return { left, phase, label: phase === 'done' ? 'Passé' : PHASES[phase]?.label || '', text: left < 0 ? `« ${prog.eventLabel || 'Ton objectif'} » est passé : note comment ça s’est passé !` : left === 0 ? `C’est aujourd’hui : « ${prog.eventLabel || 'ton objectif'} ». Bonne chance !` : `J−${left} avant « ${prog.eventLabel || 'ton objectif'} » · ${PHASES[phase]?.label || ''} : ${PHASES[phase]?.text || ''}` };
}
/**
 * Recalcule un objectif daté à partir d'aujourd'hui : séances faites gardées, séances manquées abandonnées (on ne
 * rattrape pas en entassant), suite reconstruite avec les jours (et la durée) éventuellement changés. Les phases
 * restent celles du plan d'origine. Retourne { prog, dropped }.
 */
export function recalcToEvent(prog, history = [], now = Date.now(), { days = null, minutes = null } = {}) {
  if (!prog?.eventDate) return { prog, dropped: 0 };
  const doneIdx = new Set(history.filter((h) => h.data?.program?.id === prog.id).map((h) => h.data.program.i));
  const today = ymd(now), d2 = days ? days.map(Number) : (prog.days || []).map(Number), m2 = minutes || prog.minutes;
  const full = backwardPlan({ eventDate: prog.eventDate, eventLabel: prog.eventLabel, goal: prog.goal, goalId: prog.goalId, activityId: prog.activityId, days: d2, minutes: m2, start: prog.start });
  if (!full) return { prog, dropped: 0 };
  const keep = (prog.sessions || []).filter((s) => doneIdx.has(s.i)), keptDates = new Set(keep.map((s) => s.date));
  const dropped = (prog.sessions || []).filter((s) => s.date < today && !doneIdx.has(s.i)).length;
  let base = Math.max(-1, ...(prog.sessions || []).map((s) => s.i)) + 1;
  const future = full.sessions.filter((s) => s.date >= today && !keptDates.has(s.date)).map((s) => ({ ...s, i: base++ }));
  return { prog: { ...prog, days: d2.map(String), perWeek: d2.length, minutes: m2, sessions: [...keep, ...future] }, dropped };
}

/* ───────── Créneaux et horaires ───────── */
/** Créneaux nettoyés : [{ d: 0..6, from: 'HH:MM', to: 'HH:MM' }], début avant fin, triés, 21 au plus. */
export function cleanSlots(slots) {
  const out = [], seen = new Set();
  for (const s of Array.isArray(slots) ? slots : []) {
    const d = Number(s?.d), from = String(s?.from || ''), to = String(s?.to || '');
    if (!Number.isInteger(d) || d < 0 || d > 6 || !HM.test(from) || !HM.test(to) || toMin(to) <= toMin(from)) continue;
    const k = `${d}-${from}-${to}`; if (seen.has(k)) continue; seen.add(k); out.push({ d, from, to });
  }
  return out.sort((a, b) => a.d - b.d || toMin(a.from) - toMin(b.from)).slice(0, 21);
}
/** Le lieu est-il ouvert ce jour-là à cette heure, pour cette durée ? null si ses horaires ne sont pas connus. */
export function isOpen(env, date, time, minutes = 45) {
  const hours = cleanSlots(env?.hours); if (!hours.length || !HM.test(String(time || ''))) return null;
  const d = weekday(date), a = toMin(time), b = a + (Number(minutes) || 45);
  return hours.some((x) => x.d === d && toMin(x.from) <= a && b <= toMin(x.to));
}
/** Premier horaire où le lieu est ouvert assez longtemps ce jour-là (ou null). */
export function openTime(env, date, minutes = 45) {
  const d = weekday(date), x = cleanSlots(env?.hours).find((s) => s.d === d && toMin(s.to) - toMin(s.from) >= (Number(minutes) || 45));
  return x ? x.from : null;
}

/* ───────── Pause : vacances ou blessure ───────── */
export function pauseState(cfg = {}, now = Date.now()) {
  const mode = ['vacances', 'blesse'].includes(cfg?.pauseMode) ? cfg.pauseMode : '';
  if (!mode || !isDay(cfg.pauseFrom)) return { active: false, mode: '' };
  const today = ymd(now), to = isDay(cfg.pauseTo) ? cfg.pauseTo : '';
  const active = cfg.pauseFrom <= today && (!to || today <= to), future = cfg.pauseFrom > today;
  const daysLeft = to ? Math.round((parseDay(to) - parseDay(today)) / DAY) : null;
  const label = mode === 'vacances' ? '🏖️ Vacances' : '🩹 Blessure';
  return { active, future, ended: !!to && today > to, mode, from: cfg.pauseFrom, to, daysLeft, label, note: String(cfg.pauseNote || ''),
    text: active ? `${label}${to ? ` jusqu’au ${fmt(to)}` : ''} : ${mode === 'vacances' ? 'pas de rappels ni de séances proposées, ta série de semaines est gardée.' : 'séances douces seulement, la zone notée est ménagée, ta série est gardée.'}` : '' };
}
/** Ce jour-là est-il en pause ? */
export const inPause = (cfg, date) => { const p = pauseState(cfg, parseDay(date)); return p.active; };

/* ───────── Calendrier : événements étendus (répétitions chaque semaine) ───────── */
export function eventsBetween(events = [], from, to) {
  const out = [];
  for (let t = parseDay(from); ymd(t) <= to; t = addDays(t, 1)) {
    const date = ymd(t), wd = weekday(date);
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const rec = e.recurrence?.freq === 'weekly' && e.date <= date && weekday(e.date) === wd && (!e.recurrence.until || date <= e.recurrence.until);
      if (e.date === date || rec) out.push({ ...e, on: date });
    }
  }
  return out;
}
const isRace = (e) => e.meta?.kind === 'race';
const isSession = (e) => !isRace(e) && e.meta?.kind !== 'rest';

/* ───────── Pilote automatique ───────── */
/**
 * Semaine proposée : `perWeek` séances au total sur 7 jours (celles déjà prévues comptent), sur les jours où tu as un
 * créneau (sinon tous les jours, à `defaultTime`), espacées au mieux, jamais la veille ni le jour d'un événement
 * important, jamais pendant une pause, pas le jour où tu as déjà fait une séance. Si ta forme est basse, la première
 * séance est légère ; deux jours d'affilée → la seconde est légère. Les sports alternent (le moins pratiqué récemment
 * d'abord). Retourne { sessions: [{ date, time, minutes, activityId, light, title, why }], notes }.
 */
export function weekPlan(ctx, { from = ymd(ctx.now || Date.now()), slots = [], perWeek = 3, minutes = 45, activities = [], pause = {}, defaultTime = '18:00', lowForm = false, envFor = null } = {}) {
  const S = cleanSlots(slots), dates = Array.from({ length: 7 }, (_, k) => ymd(addDays(parseDay(from), k))), to = dates.at(-1), notes = [];
  const evs = eventsBetween(ctx.events || [], from, to), races = evs.filter(isRace);
  const planned = new Set(evs.filter(isSession).map((e) => e.on));
  const prog = (ctx.programs || []).filter((p) => p.status === 'active').flatMap((p) => (p.sessions || []).filter((s) => s.date >= from && s.date <= to).map((s) => s.date));
  for (const d of prog) planned.add(d);
  const doneDays = new Set((ctx.history || []).map((h) => ymd(h.startedAt)).filter((d) => d >= from && d <= to));
  const blocked = new Map();
  for (const r of races) { blocked.set(r.on, `jour de « ${r.title || 'ton événement'} »`); const v = ymd(addDays(parseDay(r.on), -1)); if (!blocked.has(v)) blocked.set(v, `veille de « ${r.title || 'ton événement'} » : repos`); }
  for (const d of dates) if (inPause(pause, d)) blocked.set(d, pauseState(pause, parseDay(d)).label);
  for (const d of doneDays) if (!blocked.has(d)) blocked.set(d, 'séance déjà faite ce jour-là');
  const P = pauseState(pause, parseDay(from));
  if (P.active && P.mode === 'vacances' && (!P.to || P.to >= to)) return { sessions: [], notes: [P.text] };
  const want = Math.max(0, Math.min(7, Math.round(perWeek)) - planned.size - [...doneDays].filter((d) => !planned.has(d)).length);
  if (planned.size) notes.push(`${planned.size} séance${planned.size > 1 ? 's' : ''} déjà prévue${planned.size > 1 ? 's' : ''} cette semaine : elle${planned.size > 1 ? 's comptent' : ' compte'}.`);
  if (!want) return { sessions: [], notes: [...notes, `Ton objectif de ${perWeek} séance${perWeek > 1 ? 's' : ''} sur 7 jours est déjà couvert.`] };
  const slotOf = (d) => S.filter((s) => s.d === weekday(d));
  // Sports : le moins pratiqué ces dernières semaines d'abord, puis on alterne.
  const acts = activities.length ? activities : Object.keys(ctx.activities || {});
  const lastDone = (a) => Math.max(0, ...(ctx.history || []).filter((h) => h.data?.activity === a).map((h) => h.startedAt));
  const order = [...acts].sort((a, b) => lastDone(a) - lastDone(b));
  /** Heure possible ce jour-là pour ce sport : créneau de la personne ∩ horaires du lieu (s'ils sont connus). */
  const fit = (a, d) => {
    const env = envFor && a ? envFor(a) : null, H = cleanSlots(env?.hours).filter((x) => x.d === weekday(d)), mine = slotOf(d);
    const wins = mine.length ? mine.map((x) => [toMin(x.from), toMin(x.to)]) : [[toMin(defaultTime), toMin(defaultTime) + minutes]];
    if (!env || !cleanSlots(env.hours).length) return { time: fromMin(wins[0][0]), max: wins[0][1] - wins[0][0], env, adjusted: false };
    for (const [a0, b0] of wins) for (const h of H) { const st = Math.max(a0, toMin(h.from)), en = Math.min(mine.length ? b0 : toMin(h.to), toMin(h.to)); if (en - st >= Math.min(minutes, 30)) return { time: fromMin(st), max: en - st, env, adjusted: st !== a0 }; }
    return null;
  };
  // Aujourd'hui : seulement s'il reste le temps de faire la séance dans le créneau (ou avant 20 h sans créneau).
  const nowD = new Date(ctx.now || Date.now()), nowMin = nowD.getHours() * 60 + nowD.getMinutes(), today = ymd(nowD.getTime());
  const stillToday = (d) => d !== today || (slotOf(d).length ? slotOf(d).some((x) => toMin(x.to) - Math.min(minutes, toMin(x.to) - toMin(x.from)) >= nowMin) : nowMin <= Math.max(toMin(defaultTime), 20 * 60));
  const cands = dates.filter((d) => !blocked.has(d) && !planned.has(d) && stillToday(d) && (!S.length || slotOf(d).length) && (!order.length || order.some((a) => fit(a, d))));
  if (cands.length < want) notes.push(`Seulement ${cands.length} jour${cands.length > 1 ? 's' : ''} possible${cands.length > 1 ? 's' : ''} (créneaux, horaires des lieux, événements) : ajoute des disponibilités pour en prévoir plus.`);
  const chosen = [], taken = () => [...planned, ...doneDays, ...chosen].map(parseDay);
  while (chosen.length < want && cands.some((d) => !chosen.includes(d))) {
    let best = null, bestGap = -1;
    for (const d of cands) {
      if (chosen.includes(d)) continue;
      const t = parseDay(d), gap = taken().length ? Math.min(...taken().map((x) => Math.abs(x - t) / DAY)) : 99;
      if (gap > bestGap) { best = d; bestGap = gap; }
    }
    chosen.push(best);
  }
  chosen.sort();
  let r = 0;
  const sessions = chosen.map((d, k) => {
    let activityId = '', f = null;
    for (let j = 0; j < Math.max(1, order.length); j++) { const a = order[(r + j) % Math.max(1, order.length)] || ''; const x = fit(a, d); if (x) { activityId = a; f = x; r = (r + j + 1) % Math.max(1, order.length); break; } }
    f ||= { time: defaultTime, max: minutes, env: null, adjusted: false };
    const sl = slotOf(d)[0], prev = chosen[k - 1], afterDay = prev && Math.round((parseDay(d) - parseDay(prev)) / DAY) === 1;
    let mins = Math.min(minutes, f.max);
    const why = [sl ? `ton créneau du ${DAY_LONG[weekday(d)]} (${sl.from}–${sl.to})` : `jour libre (${DAY_LONG[weekday(d)]})`];
    if (f.adjusted) why.push(`heure calée sur l’ouverture de « ${f.env.name} »`);
    const light = (k === 0 && lowForm && d <= ymd(addDays(parseDay(from), 1))) || afterDay || (P.active && P.mode === 'blesse');
    if (k === 0 && lowForm && light) why.push('forme basse aujourd’hui : on commence en douceur');
    if (afterDay) why.push('au lendemain d’une autre séance : plus légère');
    if (P.active && P.mode === 'blesse') why.push('blessure en cours : séance douce');
    const v = blocked.get(ymd(addDays(parseDay(d), 1)));
    if (v && /veille/.test(v)) { mins = Math.min(mins, 30); why.push('deux jours avant ton événement : courte, pour rester vif sans te fatiguer'); }
    return { date: d, time: f.time, minutes: Math.max(10, mins), activityId, light: !!light, envId: f.env?.id || '', why };
  });
  if (races.length) notes.push(`Repos prévu la veille de ${races.map((r) => `« ${r.title || 'ton événement'} »`).join(', ')}.`);
  return { sessions, notes };
}

/* ───────── Conflits ───────── */
/**
 * Conflits sur les 14 prochains jours, chacun avec une correction proposée :
 * veille / jour d'un événement important, deux séances au même moment, hors des horaires du lieu, pendant une pause,
 * 3 jours de séances d'affilée. Retourne [{ kind, date, eventId, text, fix: { kind: 'move'|'time'|'delete', date?, time? }, fixText }].
 */
export function conflicts(ctx, { now = ctx.now || Date.now(), days = 14, pause = {}, envs = [] } = {}) {
  const from = ymd(now), to = ymd(addDays(parseDay(from), days - 1)), evs = eventsBetween(ctx.events || [], from, to), out = [];
  const sess = evs.filter(isSession), races = evs.filter(isRace), byDay = new Map();
  for (const e of sess) (byDay.get(e.on) || byDay.set(e.on, []).get(e.on)).push(e);
  const busy = (d) => (byDay.get(d) || []).length > 0 || races.some((r) => r.on === d);
  const freeNear = (d, avoid = []) => { for (const k of [-1, 1, -2, 2, -3, 3]) { const x = ymd(addDays(parseDay(d), k)); if (x >= from && !busy(x) && !avoid.includes(x) && !inPause(pause, x)) return x; } return null; };
  for (const r of races) {
    const v = ymd(addDays(parseDay(r.on), -1));
    for (const e of byDay.get(v) || []) { if (e.meta?.light) continue; const x = freeNear(v, [r.on, v]); const target = x && x < r.on ? x : null; out.push({ kind: 'veille', date: v, eventId: e.id, recurring: !!e.recurrence, text: `« ${e.title || 'Séance'} » la veille de « ${r.title || 'ton événement'} » : tu risques d’arriver fatigué.`, fix: target ? { kind: 'move', date: target } : { kind: 'delete' }, fixText: target ? `Déplacer au ${fmt(target)}` : 'Retirer cette séance' }); }
    for (const e of byDay.get(r.on) || []) out.push({ kind: 'jourj', date: r.on, eventId: e.id, recurring: !!e.recurrence, text: `« ${e.title || 'Séance'} » le même jour que « ${r.title || 'ton événement'} ».`, fix: { kind: 'delete' }, fixText: 'Retirer cette séance' });
  }
  for (const [d, list] of byDay) {
    if (list.length < 2) continue;
    const t = list.filter((e) => e.time).sort((a, b) => toMin(a.time) - toMin(b.time));
    const overlap = list.some((e) => !e.time) || t.some((e, k) => k && toMin(e.time) < toMin(t[k - 1].time) + (t[k - 1].meta?.minutes || 60));
    if (overlap) { const e = list.at(-1), x = freeNear(d); out.push({ kind: 'double', date: d, eventId: e.id, recurring: !!e.recurrence, text: `${list.length} séances le ${fmt(d)}${t.length === list.length ? ' qui se chevauchent' : ''}.`, fix: x ? { kind: 'move', date: x } : { kind: 'delete' }, fixText: x ? `Déplacer « ${e.title || 'Séance'} » au ${fmt(x)}` : 'Retirer la dernière' }); }
  }
  for (const e of sess) {
    const env = envs.find((v) => v.id === e.meta?.envId);
    if (env && e.time && isOpen(env, e.on, e.time, e.meta?.minutes || 45) === false) { const o = openTime(env, e.on, e.meta?.minutes || 45); out.push({ kind: 'horaires', date: e.on, eventId: e.id, recurring: !!e.recurrence, text: `« ${env.name} » est fermé le ${fmt(e.on)} à ${e.time}.`, fix: o ? { kind: 'time', time: o } : { kind: 'delete' }, fixText: o ? `Passer à ${o}` : 'Retirer (fermé ce jour-là)' }); }
    if (inPause(pause, e.on) && pause.pauseMode === 'vacances') out.push({ kind: 'pause', date: e.on, eventId: e.id, recurring: !!e.recurrence, text: `« ${e.title || 'Séance'} » pendant tes vacances.`, fix: { kind: 'delete' }, fixText: 'Retirer (vacances)' });
  }
  const sDays = [...byDay.keys()].sort();
  for (let k = 2; k < sDays.length; k++) {
    if (Math.round((parseDay(sDays[k]) - parseDay(sDays[k - 2])) / DAY) !== 2) continue;
    const mid = sDays[k - 1], e = byDay.get(mid)[0]; if (e.meta?.light || out.some((c) => c.eventId === e.id)) continue;
    out.push({ kind: 'enchaine', date: mid, eventId: e.id, recurring: !!e.recurrence, text: `3 jours de séances d’affilée (${fmt(sDays[k - 2])} → ${fmt(sDays[k])}) : un jour de repos aide à récupérer.`, fix: { kind: 'light' }, fixText: 'Rendre celle du milieu légère' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ───────── Séances prévues non faites ───────── */
/** Séances prévues (non répétées) des 3 derniers jours sans séance faite ce jour-là ; avec le prochain jour libre. */
export function missedEvents(ctx, now = ctx.now || Date.now(), { pause = {} } = {}) {
  const today = ymd(now), from = ymd(addDays(parseDay(today), -3)), done = new Set((ctx.history || []).map((h) => ymd(h.startedAt)));
  const all = eventsBetween(ctx.events || [], from, ymd(addDays(parseDay(today), 14)));
  const busy = new Set(all.filter((e) => e.on >= today).map((e) => e.on));
  const next = () => { for (let k = 0; k < 14; k++) { const d = ymd(addDays(parseDay(today), k)); if (!busy.has(d) && !done.has(d) && !inPause(pause, d)) return d; } return null; };
  return all.filter((e) => e.on < today && !e.recurrence && !e.completed && isSession(e) && !done.has(e.on) && !inPause(pause, e.on)).map((e) => ({ event: e, to: next() }));
}

/* ───────── Ta semaine en 10 secondes ───────── */
/** Bilan d'une semaine (lundi → dimanche) : offset 0 = cette semaine, 1 = la précédente. */
export function weekReview(ctx, now = ctx.now || Date.now(), offset = 0) {
  const m = addDays(monday(now), -7 * offset), from = ymd(m), to = ymd(addDays(m, 6));
  const inW = (t) => { const d = ymd(t); return d >= from && d <= to; };
  const hs = (ctx.history || []).filter((h) => inW(h.startedAt)), prevM = addDays(m, -7), prev = (ctx.history || []).filter((h) => { const d = ymd(h.startedAt); return d >= ymd(prevM) && d < from; });
  const mins = Math.round(hs.reduce((t, h) => t + (h.durationSeconds || 0), 0) / 60), pMins = Math.round(prev.reduce((t, h) => t + (h.durationSeconds || 0), 0) / 60);
  const planned = eventsBetween(ctx.events || [], from, to).filter(isSession), plannedDone = planned.filter((e) => hs.some((h) => ymd(h.startedAt) === e.on)).length;
  const perfs = (ctx.perfs || []).filter((p) => p.source === 'measured' && inW(p.date || 0)).length;
  const pains = (ctx.pains || []).filter((p) => inW(p.date || 0) && p.level >= 3 && !p.healed).length;
  const W = (ctx.wellness || []).filter((w) => w.day >= from && w.day <= to && w.sleep != null), sleep = W.length ? Math.round((W.reduce((t, w) => t + w.sleep, 0) / W.length) * 10) / 10 : null;
  const acts = {}; for (const h of hs) { const a = h.data?.activity || 'autre'; acts[a] = (acts[a] || 0) + 1; }
  const lines = [];
  lines.push(hs.length ? `🏋️ ${hs.length} séance${hs.length > 1 ? 's' : ''}, ${mins} min${pMins ? ` (${mins >= pMins ? '+' : ''}${Math.round(((mins - pMins) / pMins) * 100)} % par rapport à la semaine d’avant)` : ''}` : '😴 Aucune séance cette semaine : la prochaine compte double pour le moral !');
  if (planned.length) lines.push(`📅 ${plannedDone} séance${plannedDone > 1 ? 's' : ''} faite${plannedDone > 1 ? 's' : ''} sur ${planned.length} prévue${planned.length > 1 ? 's' : ''}`);
  if (perfs) lines.push(`📏 ${perfs} mesure${perfs > 1 ? 's' : ''} notée${perfs > 1 ? 's' : ''}`);
  if (sleep != null) lines.push(`😴 ${String(sleep).replace('.', ',')} h de sommeil en moyenne (${W.length} check-in${W.length > 1 ? 's' : ''})`);
  if (pains) lines.push(`🩹 ${pains} douleur${pains > 1 ? 's' : ''} notée${pains > 1 ? 's' : ''} : pense à donner des nouvelles`);
  return { from, to, sessions: hs.length, minutes: mins, prevMinutes: pMins, planned: planned.length, plannedDone, perfs, pains, sleep, activities: acts, lines: lines.slice(0, 5) };
}
