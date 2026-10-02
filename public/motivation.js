// motivation.js — série de semaines, badges personnels et bilan du mois (sans DOM, testés).
// Toujours par rapport à soi-même : aucune comparaison avec d'autres personnes.
const DAY = 86400000;
/** Lundi 00:00 (heure locale) de la semaine qui contient t. */
export function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

/** Jours actifs : séances enregistrées et jours de grimpe notés dans le carnet. */
export function activeDays(history, ascents = []) {
  const s = new Set();
  for (const h of history) if (h?.startedAt) s.add(new Date(h.startedAt).toDateString());
  for (const a of ascents) if (a?.date) s.add(new Date(a.date).toDateString());
  return s;
}

/**
 * Série de semaines « bienveillante » : semaines consécutives avec au moins `goal` jours actifs.
 * La semaine en cours ne casse jamais la série (elle n'est pas finie) : elle s'ajoute dès que l'objectif est atteint.
 */
export function weekStreak(history, ascents = [], { goal = 2, now = Date.now(), pause = null } = {}) {
  const perWeek = new Map();
  for (const d of activeDays(history, ascents)) { const w = weekStart(new Date(d).getTime()); perWeek.set(w, (perWeek.get(w) || 0) + 1); }
  const cur = weekStart(now), thisWeek = perWeek.get(cur) || 0;
  // 8.30 : une semaine de pause (vacances, blessure) ne casse pas la série (et ne compte pas).
  const pFrom = /^\d{4}-\d{2}-\d{2}$/.test(pause?.from || '') ? new Date(pause.from + 'T00:00:00').getTime() : null;
  const pTo = /^\d{4}-\d{2}-\d{2}$/.test(pause?.to || '') ? new Date(pause.to + 'T23:59:59').getTime() : now;
  const paused = (w) => pFrom != null && pFrom < w + 7 * DAY && pTo >= w;
  // décalage d'heure été / hiver : on recalcule le lundi à chaque pas
  let streak = 0, w = weekStart(cur - 3 * DAY);
  for (let k = 0; k < 600; k++) { if ((perWeek.get(w) || 0) >= goal) streak++; else if (!paused(w)) break; w = weekStart(w - 3 * DAY); }
  let best = 0, run = 0;
  const weeks = [...perWeek.keys()].sort((a, b) => a - b);
  if (weeks.length) for (let x = weeks[0]; x <= cur; x = weekStart(x + 10 * DAY)) { run = (perWeek.get(x) || 0) >= goal ? run + 1 : 0; best = Math.max(best, run); }
  const done = thisWeek >= goal;
  return { streak: streak + (done ? 1 : 0), thisWeek, goal, left: Math.max(0, goal - thisWeek), done, best: Math.max(best, streak + (done ? 1 : 0)) };
}

const SENT = new Set(['flash', 'send', 'work', 'top']);
const hoursOf = (history) => history.reduce((t, h) => t + (Number(h.durationSeconds) || 0), 0) / 3600;
/** Badges personnels : chacun dit comment l'obtenir et où tu en es. */
export function badges(ctx, { now = Date.now(), goal = 2 } = {}) {
  const hist = ctx.history || [], asc = ctx.ascents || [], perfs = ctx.perfs || [], projects = ctx.projects || [];
  const n = hist.length, hrs = hoursOf(hist), sent = asc.filter((a) => SENT.has(a.result)), flashes = asc.filter((a) => a.result === 'flash');
  const st = weekStreak(hist, asc, { goal, now });
  const hourOf = (h) => new Date(h.startedAt).getHours();
  const acts = new Set(hist.map((h) => h.data?.activity).filter(Boolean));
  const records = ctx.recordsCount || 0;
  const B = (id, icon, name, how, value, target) => ({ id, icon, name, how, value: Math.min(value, target), target, got: value >= target });
  return [
    B('first', '🌱', 'Premier pas', 'Faire ta première séance', n, 1),
    B('s10', '🔟', 'Dix de fait', '10 séances enregistrées', n, 10),
    B('s25', '💪', 'Bien lancé', '25 séances', n, 25),
    B('s50', '⭐', 'Cinquante', '50 séances', n, 50),
    B('s100', '🏅', 'Centenaire', '100 séances', n, 100),
    B('h10', '⏱', '10 heures', '10 heures d’entraînement au total', Math.floor(hrs), 10),
    B('h50', '⌛', '50 heures', '50 heures au total', Math.floor(hrs), 50),
    B('w4', '🔥', 'Un mois régulier', `4 semaines d’affilée avec ${goal} séances ou plus`, st.best, 4),
    B('w12', '🌋', 'Trois mois régulier', `12 semaines d’affilée avec ${goal} séances ou plus`, st.best, 12),
    B('asc1', '🧗', 'Première croix', 'Noter une réussite dans le carnet', sent.length, 1),
    B('asc50', '🪨', 'Cinquante croix', '50 blocs ou voies réussis', sent.length, 50),
    B('flash', '⚡', 'Flash !', 'Réussir un bloc ou une voie du premier coup', flashes.length, 1),
    B('proj', '📌', 'Projet bouclé', 'Réussir un projet', projects.filter((p) => p.status === 'done').length, 1),
    B('rec', '🏆', 'Record battu', 'Battre un de tes records', records, 1),
    B('finger', '✋', 'Doigts testés', 'Faire le test de doigts', perfs.filter((p) => /^suspension_(20mm|lestee)$/.test(p.metricId)).length, 1),
    B('early', '🌅', 'Lève-tôt', 'Une séance commencée avant 8 h', hist.filter((h) => hourOf(h) < 8 && hourOf(h) >= 4).length, 1),
    B('night', '🌙', 'Oiseau de nuit', 'Une séance commencée après 21 h', hist.filter((h) => hourOf(h) >= 21).length, 1),
    B('multi', '🎨', 'Touche-à-tout', '3 sports différents', acts.size, 3),
  ];
}

/** Bilan d'un mois (mois de `at`) : chiffres simples pour l'image partageable. */
export function monthRecap(ctx, at = Date.now()) {
  const d = new Date(at), from = new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const inM = (t) => t >= from && t < to;
  const hist = (ctx.history || []).filter((h) => inM(h.startedAt)), asc = (ctx.ascents || []).filter((a) => inM(a.date || 0));
  const sets = hist.reduce((t, h) => t + (h.data?.exercises || []).reduce((s, e) => s + (e.sets?.length || 0), 0), 0);
  const sent = asc.filter((a) => SENT.has(a.result));
  const best = sent.filter((a) => a.grade).sort((a, b) => (b.grade.order ?? 0) - (a.grade.order ?? 0))[0]?.grade?.label || '';
  const days = activeDays(hist, asc).size;
  const byAct = {}; for (const h of hist) { const k = h.data?.activity || 'autre'; byAct[k] = (byAct[k] || 0) + 1; }
  return {
    label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), sessions: hist.length, minutes: Math.round(hist.reduce((t, h) => t + (Number(h.durationSeconds) || 0), 0) / 60),
    sets, days, sends: sent.length, flashes: sent.filter((a) => a.result === 'flash').length, best, byAct,
  };
}
