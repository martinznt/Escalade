// phase.js — une séance = des phases. Chaque phase a sa propre activité, sa durée, son rôle, son but ponctuel,
// ses priorités et contraintes, des paramètres propres au sport (escalade : bloc/voie, styles, cotations, essais…)
// et des verrous : ce que l'utilisateur impose (🔒), laisse modifiable (✏️) ou confie à l'app (🤖).
// Compatible avec les anciennes « parties » (climb, work, main, warmup…) : les champs manquants reçoivent des valeurs
// par défaut déterministes, rien n'est réinventé. Sans DOM, testé.
import { CAPACITIES, ACTIVITIES } from './model.js';
import { cleanSelection, cleanRules } from './intents.js';
import { cleanLevel } from './filters.js';

/** Rôles d'une phase : valeurs structurées (et « Autre » avec un nom libre). */
export const ROLES = {
  prep: ['🧭', 'Préparation'], warmup: ['🔥', 'Échauffement'], technique: ['🎯', 'Technique'], endurance: ['🔋', 'Résistance'],
  force: ['🏋️', 'Force'], puissance: ['⚡', 'Puissance'], mobilite: ['🤸', 'Mobilité'], recup: ['🌿', 'Récupération'],
  perf: ['🚀', 'Performance'], main: ['💪', 'Corps de séance'], transition: ['↔️', 'Transition'], pause: ['⏸️', 'Pause libre'],
  cool: ['🌬️', 'Retour au calme'], custom: ['✏️', 'Autre'],
};
export const INTENSITIES = ['easy', 'mod', 'hard', 'max'];
export const FATIGUE = { low: 'Peu de fatigue', mod: 'Fatigue modérée', high: 'Fatigue élevée acceptée' };
/** Paramètres qu'on peut verrouiller, et leurs états. */
export const LOCKABLE = { minutes: 'Durée', activity: 'Activité', place: 'Lieu', goal: 'But', intensity: 'Intensité', style: 'Style', exercises: 'Exercices', order: 'Ordre interne', rest: 'Repos' };
export const LOCK_STATES = { user: ['🔒', 'Verrouillé'], free: ['✏️', 'Modifiable'], app: ['🤖', 'L’app décide'] };
/** Escalade (phase de performance) : paramètres structurés. */
export const ATTEMPT_TYPES = { discover: 'Découverte', work: 'Travail', enchain: 'Enchaînement', limit: 'À la limite', perf: 'Performance du jour' };
export const FOCUS = { perf: 'Performance', tech: 'Technique', resist: 'Résistance' };
export const VOLUME = { low: 'Peu', mod: 'Moyen', high: 'Beaucoup' };
/** Curseurs de compromis (−2 … +2) : le côté gauche l'emporte à −2, le droit à +2, 0 = équilibré. */
export const TRADEOFFS = { perfRecup: ['Performance', 'Récupération'], volInt: ['Volume', 'Intensité'], varRep: ['Variété', 'Répétition'], diffSucc: ['Difficulté', 'Réussite'], specGen: ['Spécificité', 'Généralisation'], fatStim: ['Peu de fatigue', 'Stimulation'] };
export const PLACE_MODES = { same: 'Même lieu que la phase précédente', other: 'Un autre lieu', free: 'Lieu libre' };
const cleanTradeoffs = (t) => Object.fromEntries(Object.keys(TRADEOFFS).map((k) => [k, t && t[k] != null ? Math.max(-2, Math.min(2, Math.round(Number(t[k]) || 0))) : 0]).filter(([, v]) => v));
const cleanPlace = (pl) => ({ mode: PLACE_MODES[pl?.mode] ? pl.mode : 'same', envId: /^[\w:.-]{1,80}$/.test(String(pl?.envId || '')) ? String(pl.envId) : '', travelMin: pl?.travelMin == null || pl.travelMin === '' ? null : Math.max(0, Math.min(180, Math.round(Number(pl.travelMin) || 0))) });

const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const capList = (v, n = 6) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((id) => CAPACITIES[id]))].slice(0, n);
const tags = (v, n = 8) => [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, 40)).filter(Boolean))].slice(0, n);
const ids = (v, n = 12) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => /^[\w:.-]{1,64}$/.test(x)))].slice(0, n);
const int = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

/** Activité d'une phase, d'après son type (les anciennes parties n'en avaient pas toujours). */
export function phaseActivity(p, sport = '') {
  if (p.type === 'pause') return 'pause';
  if (p.type === 'climb') return p.kind === 'voie' ? 'climbing_route' : 'climbing_boulder';
  if (p.activity) return String(p.activity);
  return sport || '';
}
/** Rôle par défaut, déterministe, d'après le type et l'intensité (anciennes parties). */
export function defaultRole(p) {
  const byType = { warmup: 'warmup', cool: 'cool', stretch: 'mobilite', mobility: 'mobilite', strength: 'force', core: 'force', fingers: 'force', power: 'puissance', technique: 'technique', endurance: 'endurance', prevention: 'mobilite', cardio: 'endurance', pause: 'pause', main: 'main' };
  if (byType[p.type]) return byType[p.type];
  if (p.type === 'climb' || p.type === 'work') return { easy: 'technique', mod: 'endurance', hard: 'force', max: 'perf' }[p.intensity] || 'main';
  return 'main';
}

/**
 * Normalise une phase (ancienne partie ou nouvelle phase). Les champs utilisés par le constructeur (type, kind, styles,
 * from, to, structure, pick, activity, minutes) sont gardés tels quels ; les nouveaux champs ont des défauts sûrs.
 */
export function normalizePhase(p = {}, i = 0, sport = '') {
  const x = p && typeof p === 'object' ? p : {};
  const type = str(x.type, 20) || 'main';
  const out = {
    ...x,
    id: /^[\w-]{1,40}$/.test(String(x.id || '')) ? String(x.id) : `ph-${i + 1}`,
    type,
    activity: phaseActivity({ ...x, type }, sport),
    minutes: int(x.minutes, type === 'pause' ? 1 : 5, 300, 15),
    role: ROLES[x.role] ? x.role : defaultRole({ ...x, type }),
    roleLabel: x.role === 'custom' ? str(x.roleLabel, 40) : '',
    goal: str(x.goal, 200),
    priorities: capList(x.priorities),
    intensity: oneOf(x.intensity, INTENSITIES, type === 'pause' ? 'easy' : 'mod'),
    fatigue: oneOf(x.fatigue, Object.keys(FATIGUE), 'mod'),
    favor: tags(x.favor), avoid: tags(x.avoid),
    constraints: str(x.constraints, 200),
    imposed: ids(x.imposed), forbidden: ids(x.forbidden),
    locks: Object.fromEntries(Object.keys(LOCKABLE).map((k) => [k, oneOf(x.locks?.[k], Object.keys(LOCK_STATES), k === 'exercises' || k === 'order' || k === 'rest' ? 'app' : 'free')])),
    // V2 : lieu propre à la phase, sous-objectifs priorisés + règles, curseurs de compromis, filtres de phase, contraintes.
    place: cleanPlace(x.place),
    subIntents: cleanSelection(x.subIntents),
    rules: [],
    tradeoffs: cleanTradeoffs(x.tradeoffs),
    filters: cleanLevel(x.filters),
    noFailure: !!x.noFailure,
    maxVolume: oneOf(x.maxVolume, ['', 'low', 'mod'], ''),
    forbidEquip: ids(x.forbidEquip),
  };
  out.rules = cleanRules(x.rules, out.subIntents);
  if (type === 'climb') {
    out.kind = x.kind === 'voie' ? 'voie' : 'bloc';
    out.styles = ids(x.styles);
    out.stylesOut = ids(x.stylesOut).filter((s) => !out.styles.includes(s));
    out.attemptsMax = x.attemptsMax == null || x.attemptsMax === '' ? null : int(x.attemptsMax, 1, 99, null);
    out.volume = oneOf(x.volume, Object.keys(VOLUME), 'mod');
    out.focus = oneOf(x.focus, Object.keys(FOCUS), x.intensity === 'max' ? 'perf' : 'tech');
    out.attemptType = oneOf(x.attemptType, Object.keys(ATTEMPT_TYPES), x.intensity === 'max' ? 'perf' : 'work');
    out.systemId = str(x.systemId, 64);
  }
  return out;
}
export const normalizePhases = (list = [], sport = '') => {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).slice(0, 20).map((p, i) => {
    const n = normalizePhase(p, i, sport);
    if (seen.has(n.id)) n.id = `ph-${i + 1}-${seen.size}`; // identifiants uniques et stables
    seen.add(n.id); return n;
  });
};
export const totalMinutes = (phases) => (phases || []).reduce((t, p) => t + (Number(p.minutes) || 0), 0);
/** Activités distinctes de la séance (hors pause), dans l'ordre d'apparition. */
export const sessionActivities = (phases) => [...new Set((phases || []).map((p) => p.activity).filter((a) => a && a !== 'pause'))];
export const activityLabel = (id) => (id === 'pause' ? '⏸️ Pause' : ACTIVITIES[id] ? `${ACTIVITIES[id].emoji} ${ACTIVITIES[id].label}` : id || '—');

/**
 * Répartit un temps total entre les phases : les durées verrouillées ne bougent pas, les autres sont ajustées
 * au prorata (par pas de 5 min, 5 min au moins), et la somme fait EXACTEMENT le total.
 * Retourne { phases, ok, error }.
 */
export function fitDurations(phases, total) {
  const T = Math.round(Number(total)); const list = phases.map((p) => ({ ...p }));
  const locked = list.filter((p) => p.locks?.minutes === 'user'), free = list.filter((p) => p.locks?.minutes !== 'user');
  const fixed = totalMinutes(locked), room = T - fixed;
  if (!free.length) return { phases: list, ok: fixed === T, error: fixed === T ? '' : `Toutes les durées sont verrouillées : ${fixed} min au lieu de ${T} min.` };
  if (room < free.length * 5) return { phases: list, ok: false, error: `Les phases verrouillées prennent déjà ${fixed} min : il ne reste pas assez de temps (${Math.max(0, room)} min) pour les autres.` };
  const cur = totalMinutes(free) || free.length;
  let acc = 0;
  free.forEach((p, k) => {
    if (k === free.length - 1) { p.minutes = room - acc; return; }
    p.minutes = Math.max(5, Math.round(((p.minutes || 1) * room) / cur / 5) * 5); acc += p.minutes;
  });
  // Si l'arrondi a trop donné, on reprend sur les plus longues phases libres.
  let last = free[free.length - 1];
  while (last.minutes < 5) { const big = free.slice(0, -1).sort((a, b) => b.minutes - a.minutes)[0]; if (!big || big.minutes <= 5) break; big.minutes -= 5; last.minutes += 5; }
  return { phases: list, ok: totalMinutes(list) === T, error: '' };
}
/** Remplace une phase sans toucher aux autres (et sans casser ses verrous). */
export function updatePhase(phases, id, patch) {
  return phases.map((p, i) => (p.id !== id ? p : normalizePhase({ ...p, ...patch, id, locks: { ...p.locks, ...(patch.locks || {}) } }, i, p.activity)));
}
/** Nouvelle phase d'un type donné. */
export function newPhase(type, o = {}, n = Date.now()) {
  const base = { id: `ph-${n.toString(36)}`, type, minutes: type === 'pause' ? 30 : type === 'warmup' ? 15 : type === 'cool' ? 10 : 30, ...o };
  if (type === 'climb') Object.assign(base, { kind: o.kind || 'bloc', intensity: o.intensity || 'mod', styles: [] });
  if (type === 'pause') Object.assign(base, { role: 'pause', goal: o.goal || 'Récupérer avant la suite' });
  return normalizePhase(base, 0, o.activity || '');
}
/** Intention ponctuelle de la séance : jamais un objectif du compte (sauf action explicite « Enregistrer comme objectif »). */
export function sessionIntent(x = {}) {
  const subIntents = cleanSelection(x.subIntents);
  return { text: str(x.text, 240), priorities: capList(x.priorities), savedAsGoal: str(x.savedAsGoal, 40),
    ...(subIntents.length ? { subIntents, rules: cleanRules(x.rules, subIntents) } : {}),
    ...(Object.keys(cleanTradeoffs(x.tradeoffs)).length ? { tradeoffs: cleanTradeoffs(x.tradeoffs) } : {}),
    ...(Object.keys(cleanLevel(x.filters)).length ? { filters: cleanLevel(x.filters) } : {}) };
}
