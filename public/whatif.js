// whatif.js — simulation « Et si ? » sur une SÉANCE ENTIÈRE : on applique un changement à une copie de l'ossature
// (retirer ou ajouter du temps, une phase, changer une intensité ou un lieu, remplacer un exercice) et on décrit
// les conséquences (durée, charge estimée, temps intense avant la performance, capacités, points d'attention).
// Descriptif seulement : jamais présenté comme une certitude. Un élément verrouillé n'est jamais modifié. Sans DOM, testé.
import { normalizePhase, normalizePhases } from './phase.js';
import { analyzeSession, ROLE_CAPS, phaseName } from './phaseplan.js';
import { intentCaps } from './intents.js';
import { transitions } from './budget.js';
import { CAPACITIES } from './model.js';

export const INT_W = { easy: 1, mod: 2, hard: 3, max: 4 };
export const DISCLAIMER = 'Conséquences décrites à partir de ta structure : ce n’est pas une prédiction de résultat.';
const HARD = new Set(['hard', 'max']);

/** Mesures descriptives d'une ossature. */
export function metrics(phases, { envs = [], envId = '' } = {}) {
  const ph = normalizePhases(phases);
  const travel = transitions(ph, envs, envId).reduce((t, x) => t + (x.travel || 0), 0);
  const work = ph.filter((p) => p.type !== 'pause');
  const perf = ph.findIndex((p) => p.role === 'perf');
  const caps = {};
  for (const p of work) {
    const w = { ...(ROLE_CAPS[p.role] || {}) };
    for (const [c, v] of Object.entries(intentCaps(p.subIntents || [], p.rules || []).caps)) w[c] = Math.max(w[c] || 0, Math.min(1, v / 4));
    for (const c of p.priorities || []) w[c] = Math.max(w[c] || 0, 1);
    for (const [c, v] of Object.entries(w)) caps[c] = (caps[c] || 0) + v * p.minutes;
  }
  return {
    minutes: ph.reduce((t, p) => t + p.minutes, 0) + travel, travel,
    load: work.reduce((t, p) => t + p.minutes * (INT_W[p.intensity] || 2), 0),
    hardBeforePerf: perf > 0 ? ph.slice(0, perf).filter((p) => HARD.has(p.intensity) && p.type !== 'pause').reduce((t, p) => t + p.minutes, 0) : null,
    caps: Object.fromEntries(Object.entries(caps).map(([c, v]) => [c, Math.round(v)])),
    alerts: analyzeSession(ph).map((s) => s.title),
  };
}

const locked = (p, k) => p?.locks?.[k] === 'user';
/**
 * Applique un changement à une copie. change = { type, id, … } :
 * minutes (delta), intensity (value), remove, add (phase, at), place (envId, travelMin), replace (from, to, exercises).
 * Retourne { phases } ou { blocked: raison }.
 */
export function applyChange(phasesIn, ch) {
  const phases = phasesIn.map((p) => ({ ...p })), i = phases.findIndex((p) => p.id === ch.id), p = phases[i];
  if (ch.type !== 'add' && ch.type !== 'replace' && !p) return { blocked: 'Phase introuvable.' };
  if (ch.type === 'minutes') { if (locked(p, 'minutes')) return { blocked: `La durée de « ${phaseName(p)} » est verrouillée.` }; p.minutes = Math.max(p.type === 'pause' ? 1 : 5, p.minutes + Math.round(Number(ch.delta) || 0)); }
  else if (ch.type === 'intensity') { if (locked(p, 'intensity')) return { blocked: `L’intensité de « ${phaseName(p)} » est verrouillée.` }; p.intensity = INT_W[ch.value] ? ch.value : p.intensity; }
  else if (ch.type === 'remove') { if (Object.values(p.locks || {}).includes('user')) return { blocked: `« ${phaseName(p)} » a des réglages verrouillés : elle ne peut pas être retirée.` }; phases.splice(i, 1); }
  else if (ch.type === 'add') phases.splice(Math.max(0, Math.min(phases.length, ch.at ?? phases.length)), 0, normalizePhase({ ...ch.phase, id: ch.phase?.id || `sim-${phases.length + 1}` }, phases.length));
  else if (ch.type === 'place') { if (locked(p, 'place')) return { blocked: `Le lieu de « ${phaseName(p)} » est verrouillé.` }; p.place = { mode: ch.envId ? 'other' : 'same', envId: ch.envId || '', travelMin: ch.travelMin ?? null }; }
  else if (ch.type === 'replace') return { phases, exercises: (ch.exercises || []).map((e) => (e.id === ch.from ? { ...e, ...ch.to, id: e.id } : e)) };
  else return { blocked: 'Changement inconnu.' };
  return { phases };
}

const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);
const capDelta = (a, b) => Object.keys({ ...a, ...b }).map((c) => [c, (b[c] || 0) - (a[c] || 0)]).filter(([, d]) => Math.abs(d) >= 5).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
/** Exercices : capacités travaillées (séries × poids) — pour « Et si je remplace cet exercice ? ». */
export function exerciseCaps(exercises) {
  const caps = {}; for (const e of exercises || []) for (const [c, w] of Object.entries(e.caps || {})) caps[c] = (caps[c] || 0) + w * Math.max(1, Number(e.sets) || 1) * 10;
  return caps;
}

/** Simulation complète : avant / après, et les conséquences décrites en phrases. */
export function simulate(phases, ch, o = {}) {
  const r = applyChange(phases, ch);
  if (r.blocked) return { blocked: r.blocked, disclaimer: DISCLAIMER };
  if (ch.type === 'replace') {
    const a = exerciseCaps(ch.exercises), b = exerciseCaps(r.exercises), d = capDelta(a, b);
    return { changes: d.map(([c, v]) => `${CAPACITIES[c]?.label || c} : ${v > 0 ? 'plus' : 'moins'} travaillée`), disclaimer: DISCLAIMER, exercises: r.exercises };
  }
  const A = metrics(phases, o), B = metrics(r.phases, o), out = [];
  if (A.minutes !== B.minutes) out.push(`Durée : ${A.minutes} → ${B.minutes} min (${B.minutes > A.minutes ? '+' : ''}${B.minutes - A.minutes})`);
  if (A.load !== B.load) out.push(`Charge estimée : ${A.load} → ${B.load} (${pct(B.load, A.load) > 0 ? '+' : ''}${pct(B.load, A.load)} %)`);
  if (A.travel !== B.travel) out.push(`Déplacements : ${A.travel} → ${B.travel} min`);
  if (A.hardBeforePerf != null && B.hardBeforePerf != null && A.hardBeforePerf !== B.hardBeforePerf) out.push(`Temps intense avant la performance : ${A.hardBeforePerf} → ${B.hardBeforePerf} min (${B.hardBeforePerf < A.hardBeforePerf ? 'plus de fraîcheur pour performer' : 'plus de fatigue avant la performance'})`);
  for (const [c, d] of capDelta(A.caps, B.caps).slice(0, 4)) out.push(`${CAPACITIES[c]?.label || c} : ${d > 0 ? 'plus' : 'moins'} travaillée (${d > 0 ? '+' : ''}${d} min pondérées)`);
  const added = B.alerts.filter((x) => !A.alerts.includes(x)), gone = A.alerts.filter((x) => !B.alerts.includes(x));
  for (const x of added) out.push(`⚠️ Nouveau point d’attention : ${x}`);
  for (const x of gone) out.push(`✓ Point d’attention résolu : ${x}`);
  if (!out.length) out.push('Pas de différence notable sur les repères suivis.');
  return { before: A, after: B, changes: out, phases: r.phases, disclaimer: DISCLAIMER };
}
