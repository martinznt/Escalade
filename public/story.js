// story.js — motivation et progrès sur la durée (sans DOM, testé) :
//  · saison de 4 semaines autour d'un thème (régularité, doigts, mobilité, endurance, récupération, variété), avec un
//    objectif par semaine ; réussie si 3 semaines sur 4 sont atteintes ;
//  · lettre à soi-même, scellée jusqu'à une date (3 mois par défaut) ;
//  · « Ton année en sport » : chiffres, mois le plus actif, sports, lieux, réussites, mesures qui ont bougé ;
//  · avant / après sur 3, 6 ou 12 mois (mesures et performances), sans jugement pour ce qui dépend de l'objectif ;
//  · rapport du mois (à imprimer ou enregistrer en PDF).
// Tout est calculé sur TES données : aucune comparaison avec d'autres personnes.
import { METRICS } from './model.js';
import { activeDays, weekStart } from './motivation.js';

const DAY = 86400000, WEEK = 7 * DAY;
const SENT = new Set(['onsight', 'flash', 'send', 'work', 'top']);
const ex = (h) => h?.data?.exercises || [];
const act = (h) => h?.data?.activity || '';
const FINGER = /suspen|poutre|hang|réglette|reglette|doigt|finger|campus|pince|repeater/i;
const MOBILITY = /étir|etir|mobilit|souplesse|yoga|stretch|assouplis/i;
const CARDIO = new Set(['running', 'swimming', 'cycling', 'conditioning', 'rowing', 'hiking', 'walking']);

/** Thèmes de saison : un objectif simple par semaine, mesuré sur ce que tu enregistres déjà. */
export const SEASON_THEMES = {
  regularite: { icon: '🔥', label: 'Régularité', goal: '3 séances par semaine', target: 3, unit: 'séance', why: 'La régularité fait plus progresser que les grosses séances isolées.' },
  doigts: { icon: '🖐️', label: 'Doigts solides', goal: '2 séances avec du travail de doigts par semaine', target: 2, unit: 'séance', why: 'Des doigts plus forts et entraînés avec régularité, sans en faire trop.' },
  mobilite: { icon: '🧘', label: 'Mobilité', goal: '3 moments de mobilité ou d’étirements par semaine', target: 3, unit: 'moment', why: 'Plus d’amplitude, moins de raideurs, de meilleures positions.' },
  endurance: { icon: '🫁', label: 'Endurance', goal: '90 minutes d’effort long par semaine', target: 90, unit: 'min', why: 'Un cœur plus endurant récupère mieux entre les efforts.' },
  recup: { icon: '😴', label: 'Récupération', goal: '5 check-ins du matin par semaine', target: 5, unit: 'check-in', why: 'Mieux connaître ta forme pour t’entraîner fort les bons jours.' },
  variete: { icon: '🌈', label: 'Variété', goal: '2 sports différents chaque semaine', target: 2, unit: 'sport', why: 'Changer d’activité équilibre le corps et évite la lassitude.' },
};
export const SEASON_WEEKS = 4;

/** Valeur d'une semaine [from, to) pour un thème. */
export function themeValue(theme, ctx, from, to) {
  const inW = (t) => t >= from && t < to, hist = (ctx.history || []).filter((h) => inW(h.startedAt));
  switch (theme) {
    case 'regularite': return hist.length;
    case 'doigts': return hist.filter((h) => ex(h).some((e) => FINGER.test(`${e.name} ${e.libId || ''}`))).length;
    case 'mobilite': return hist.filter((h) => ['mobility', 'yoga'].includes(act(h)) || ex(h).some((e) => MOBILITY.test(`${e.name} ${e.libId || ''}`))).length;
    case 'endurance': return Math.round(hist.filter((h) => CARDIO.has(act(h))).reduce((t, h) => t + (Number(h.durationSeconds) || 0), 0) / 60);
    case 'recup': return new Set((ctx.wellness || []).filter((w) => { const t = dayTime(w.day); return t != null && inW(t); }).map((w) => w.day)).size;
    case 'variete': return new Set(hist.map(act).filter(Boolean)).size;
    default: return 0;
  }
}
const dayTime = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : null; };
/** Début de saison : le lundi de la semaine de départ. */
export const seasonStart = (t) => weekStart(t);

/** Où en est une saison : semaines (valeur / objectif), semaine en cours, réussite (3 semaines sur 4). */
export function seasonProgress(season, ctx, now = Date.now()) {
  const th = SEASON_THEMES[season?.theme]; if (!th) return null;
  const start = seasonStart(Number(season.start) || dayTime(season.start) || now), end = start + SEASON_WEEKS * WEEK;
  const weeks = Array.from({ length: SEASON_WEEKS }, (_, i) => {
    const from = start + i * WEEK, to = from + WEEK, value = from > now ? 0 : themeValue(season.theme, ctx, from, to);
    return { n: i + 1, from, value, target: th.target, done: value >= th.target, current: now >= from && now < to, future: from > now };
  });
  const doneWeeks = weeks.filter((w) => w.done).length, finished = now >= end, cur = weeks.find((w) => w.current);
  return { theme: season.theme, ...th, start, end, weeks, doneWeeks, finished, success: doneWeeks >= 3, week: cur ? cur.n : finished ? SEASON_WEEKS : 0,
    left: cur ? Math.max(0, th.target - cur.value) : 0, daysLeft: Math.max(0, Math.ceil((end - now) / DAY)) };
}
/** Thème proposé d'après tes habitudes (une raison simple, jamais imposé). */
export function seasonSuggestion(ctx, now = Date.now()) {
  const from = now - 4 * WEEK, perWeek = (t) => themeValue(t, ctx, from, now) / 4;
  const climber = Object.keys(ctx.activities || {}).some((a) => a.startsWith('climbing'));
  if (perWeek('regularite') < 2) return { theme: 'regularite', reason: `≈ ${String(Math.round(perWeek('regularite') * 10) / 10).replace('.', ',')} séance par semaine ces 4 dernières semaines.` };
  if (perWeek('mobilite') < 1) return { theme: 'mobilite', reason: 'Presque pas de mobilité ces 4 dernières semaines.' };
  if (perWeek('recup') < 2) return { theme: 'recup', reason: 'Peu de check-ins du matin : difficile de savoir quand forcer.' };
  if (climber && perWeek('doigts') < 1) return { theme: 'doigts', reason: 'Peu de travail de doigts ces 4 dernières semaines.' };
  if (perWeek('variete') < 2) return { theme: 'variete', reason: 'Presque toujours le même sport.' };
  return { theme: 'endurance', reason: 'Ta régularité est bonne : de l’endurance pour aller plus loin.' };
}

/* ───────── Lettre à toi-même ───────── */
export const LETTER_DELAYS = [[1, '1 mois'], [3, '3 mois'], [6, '6 mois'], [12, '1 an']];
export function letterOpenAt(writtenAt, months = 3) { const d = new Date(writtenAt); d.setMonth(d.getMonth() + months); return d.getTime(); }
/** 'sealed' tant que la date n'est pas passée, puis 'ready' (à ouvrir), puis 'opened'. */
export function letterState(l, now = Date.now()) {
  if (!l) return null;
  if (l.openedAt) return { state: 'opened', days: 0 };
  return now >= (l.openAt || 0) ? { state: 'ready', days: 0 } : { state: 'sealed', days: Math.ceil((l.openAt - now) / DAY) };
}

/* ───────── Mesures : avant / après ───────── */
const NEUTRAL = new Set(['body_weight', 'eau_corporelle', 'masse_osseuse', 'metabolisme_base']);
/** Une hausse est-elle une bonne nouvelle ? null quand ça dépend de ton objectif (poids, tours…). */
export function betterWhen(metricId, metrics = METRICS) {
  const m = metrics[metricId]; if (!m) return null;
  if (NEUTRAL.has(metricId)) return null;
  if (m.dir === -1) return -1;
  if (/^tour_/.test(metricId) || m.kind === 'other') return metricId === 'masse_musculaire' || metricId === 'masse_maigre' ? 1 : null;
  return 1;
}
const valid = (p) => p && !p.unknown && Number.isFinite(Number(p.value)) && p.value !== null;
/**
 * Pour chaque mesure : la dernière valeur connue à la date « il y a N mois » (au plus 3 mois plus tôt, sinon trop
 * ancienne pour comparer) et la plus récente depuis. Seulement si les deux existent.
 */
export function beforeAfter(ctx, months = 3, now = Date.now(), metrics = { ...METRICS, ...(ctx.metrics || {}) }) {
  const d = new Date(now); d.setMonth(d.getMonth() - months); const cut = d.getTime(), oldest = cut - 92 * DAY;
  const by = new Map();
  for (const p of (ctx.perfs || []).filter(valid)) { if (!by.has(p.metricId)) by.set(p.metricId, []); by.get(p.metricId).push(p); }
  const rows = [];
  for (const [id, list] of by) {
    list.sort((a, b) => a.date - b.date);
    const before = list.filter((p) => p.date <= cut && p.date >= oldest).at(-1), after = list.filter((p) => p.date > cut).at(-1);
    if (!before || !after) continue;
    const m = metrics[id] || { label: id, unit: '' }, diff = Math.round((after.value - before.value) * 100) / 100, dir = betterWhen(id, metrics);
    rows.push({ metricId: id, label: m.label, unit: m.unit || before.unit || '', before: before.value, beforeAt: before.date, after: after.value, afterAt: after.date, diff,
      pct: before.value ? Math.round((diff / Math.abs(before.value)) * 1000) / 10 : null, good: dir == null || diff === 0 ? null : dir * diff > 0 });
  }
  return rows.sort((a, b) => (b.good === true) - (a.good === true) || Math.abs(b.pct || 0) - Math.abs(a.pct || 0));
}

/* ───────── Ton année en sport ───────── */
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function yearInSport(ctx, year = new Date().getFullYear()) {
  const from = new Date(year, 0, 1).getTime(), to = new Date(year + 1, 0, 1).getTime(), inY = (t) => t >= from && t < to;
  const hist = (ctx.history || []).filter((h) => inY(h.startedAt)), asc = (ctx.ascents || []).filter((a) => inY(a.date || 0));
  const minutes = Math.round(hist.reduce((t, h) => t + (Number(h.durationSeconds) || 0), 0) / 60);
  const byMonth = Array(12).fill(0); for (const h of hist) byMonth[new Date(h.startedAt).getMonth()]++;
  const bestM = byMonth.indexOf(Math.max(...byMonth));
  const acts = {}; for (const h of hist) { const k = act(h) || 'autre'; acts[k] = (acts[k] || 0) + 1; }
  const weeks = new Set(hist.map((h) => weekStart(h.startedAt)));
  const before = new Set((ctx.history || []).filter((h) => h.startedAt < from).flatMap((h) => ex(h).map((e) => String(e.name).toLowerCase())));
  const newEx = new Set(hist.flatMap((h) => ex(h).map((e) => String(e.name).toLowerCase())).filter((n) => n && !before.has(n)));
  const sent = asc.filter((a) => SENT.has(a.result)), graded = sent.filter((a) => a.grade).sort((a, b) => (b.grade.order ?? 0) - (a.grade.order ?? 0));
  const places = new Set([...hist.map((h) => h.data?.context?.env), ...asc.map((a) => a.context?.env)].filter(Boolean));
  const ba = beforeAfterYear(ctx, from, to);
  return {
    year, sessions: hist.length, minutes, hours: Math.round(minutes / 6) / 10, days: activeDays(hist, asc).size, weeks: weeks.size,
    bestMonth: hist.length ? { label: MONTHS[bestM], n: byMonth[bestM] } : null, byMonth,
    sports: Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n })),
    sends: sent.length, firstTry: sent.filter((a) => a.result === 'flash' || a.result === 'onsight').length, bestBloc: graded.find((a) => a.kind !== 'voie')?.grade?.label || '', bestVoie: graded.find((a) => a.kind === 'voie')?.grade?.label || '',
    newExercises: newEx.size, places: places.size, longest: hist.reduce((m, h) => Math.max(m, Number(h.durationSeconds) || 0), 0), moved: ba,
  };
}
/** Mesures qui ont bougé dans l'année : première valeur de l'année → dernière. */
function beforeAfterYear(ctx, from, to) {
  const by = new Map();
  for (const p of (ctx.perfs || []).filter((x) => valid(x) && x.date >= from && x.date < to)) { if (!by.has(p.metricId)) by.set(p.metricId, []); by.get(p.metricId).push(p); }
  const out = [];
  for (const [id, l] of by) {
    if (l.length < 2) continue; l.sort((a, b) => a.date - b.date);
    const m = { ...METRICS, ...(ctx.metrics || {}) }[id] || { label: id, unit: '' }, diff = Math.round((l.at(-1).value - l[0].value) * 100) / 100, dir = betterWhen(id);
    if (diff) out.push({ metricId: id, label: m.label, unit: m.unit || '', first: l[0].value, last: l.at(-1).value, diff, good: dir == null ? null : dir * diff > 0 });
  }
  return out.sort((a, b) => (b.good === true) - (a.good === true)).slice(0, 8);
}

/* ───────── Rapport du mois (imprimable) ───────── */
export function monthReport(ctx, at = Date.now()) {
  const d = new Date(at), from = new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), inM = (t) => t >= from && t < to;
  const hist = (ctx.history || []).filter((h) => inM(h.startedAt)).sort((a, b) => a.startedAt - b.startedAt);
  const asc = (ctx.ascents || []).filter((a) => inM(a.date || 0)), sent = asc.filter((a) => SENT.has(a.result));
  const well = (ctx.wellness || []).filter((w) => { const t = dayTime(w.day); return t != null && inM(t); });
  const avg = (k) => { const v = well.map((w) => Number(w[k])).filter((x) => Number.isFinite(x) && x > 0); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  const metrics = { ...METRICS, ...(ctx.metrics || {}) };
  const perfs = (ctx.perfs || []).filter((p) => valid(p) && inM(p.date)).sort((a, b) => a.date - b.date).map((p) => ({ date: p.date, label: metrics[p.metricId]?.label || p.metricId, value: p.value, unit: metrics[p.metricId]?.unit || p.unit || '' }));
  const pains = (ctx.pains || []).filter((p) => inM(p.at || p.date || 0)).length;
  const rpe = hist.map((h) => Number(h.data?.rpe)).filter((x) => x > 0);
  return {
    label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), from, to,
    sessions: hist.map((h) => ({ at: h.startedAt, name: h.sessionName || 'Séance', minutes: Math.round((Number(h.durationSeconds) || 0) / 60), activity: act(h), rpe: Number(h.data?.rpe) || null, sets: ex(h).reduce((t, e) => t + (e.sets?.length || 0), 0) })),
    minutes: Math.round(hist.reduce((t, h) => t + (Number(h.durationSeconds) || 0), 0) / 60), days: activeDays(hist, asc).size,
    sends: sent.length, attempts: asc.length, perfs, sleep: avg('sleep'), energy: avg('energy'), checkins: well.length, pains, rpe: rpe.length ? Math.round((rpe.reduce((a, b) => a + b, 0) / rpe.length) * 10) / 10 : null,
  };
}
