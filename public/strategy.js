// strategy.js — plusieurs CHEMINS vers un objectif (spécifique / mixte / préparation physique) comparés sans classement
// imposé, MÉMOIRE DES DÉCISIONS (ce qui a été choisi, pourquoi, dans quel contexte, avec quel résultat) et détection
// d'une séance prévue INHABITUELLE par rapport aux séances récentes (descriptif, jamais médical). Sans DOM, testé.
import { ACTIVITIES, CAPACITIES } from './model.js';
import { EQUIPMENT } from './library.js';
import { INT_W } from './whatif.js';

const CLIMB = (a) => a === 'climbing_boulder' || a === 'climbing_route';
const topCaps = (caps, n = 4) => Object.entries(caps || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);

/**
 * Stratégies pour un objectif { label, activity, caps: { id: poids } }. Chaque stratégie est un ADN (parts en %)
 * + une comparaison : spécificité, fatigue, matériel, temps conseillé, contraintes, capacités travaillées.
 */
export function strategies(goal = {}) {
  const act = ACTIVITIES[goal.activity] ? goal.activity : 'conditioning';
  const caps = Object.keys(goal.caps || {}).length ? goal.caps : ACTIVITIES[act]?.caps || {};
  const main = topCaps(caps), climb = CLIMB(act), kind = act === 'climbing_route' ? 'voie' : 'bloc';
  const specific = climb
    ? [{ type: 'warmup', share: 12, role: 'warmup' }, { type: 'climb', kind, role: 'endurance', intensity: 'hard', share: 70 }, { type: 'cool', share: 8, role: 'cool' }, { type: 'climb', kind, role: 'technique', intensity: 'easy', share: 10 }]
    : [{ type: 'warmup', share: 12, role: 'warmup' }, { type: 'main', activity: act, role: 'main', intensity: 'hard', share: 78 }, { type: 'cool', share: 10, role: 'cool' }];
  const mixed = climb
    ? [{ type: 'warmup', share: 12, role: 'warmup' }, { type: 'climb', kind, role: 'endurance', intensity: 'hard', share: 45 }, { type: 'main', activity: 'conditioning', role: 'force', intensity: 'mod', share: 33, priorities: main.slice(0, 3) }, { type: 'cool', share: 10, role: 'cool' }]
    : [{ type: 'warmup', share: 12, role: 'warmup' }, { type: 'main', activity: act, role: 'main', intensity: 'mod', share: 48 }, { type: 'main', activity: 'strength', role: 'force', intensity: 'mod', share: 30, priorities: main.slice(0, 3) }, { type: 'cool', share: 10, role: 'cool' }];
  const physical = [{ type: 'warmup', share: 15, role: 'warmup' }, { type: 'main', activity: 'strength', role: 'force', intensity: 'hard', share: 60, priorities: main.slice(0, 4) }, { type: 'mobility', share: 15, role: 'mobilite' }, { type: 'cool', share: 10, role: 'cool' }];
  const eqOf = (parts) => [...new Set(parts.flatMap((p) => (p.type === 'climb' ? ['wall'] : p.activity === 'strength' ? ['bar', 'weights'] : [])))].map((k) => EQUIPMENT[k] || k);
  const fatigue = (parts) => { const f = parts.reduce((t, p) => t + (p.share / 100) * (INT_W[p.intensity] || 1.5), 0); return f >= 2.5 ? 'élevée' : f >= 1.8 ? 'moyenne' : 'modérée'; };
  const mk = (id, title, desc, parts, spec, minutes, cons) => ({ id, title, desc, dna: { name: `${goal.label || 'Objectif'} — ${title.toLowerCase()}`, parts }, compare: {
    specificity: spec, fatigue: fatigue(parts), equipment: eqOf(parts), minutes, constraints: cons, caps: main.map((c) => CAPACITIES[c]?.label || c) } });
  return [
    mk('specific', 'Très spécifique', climb ? 'Surtout grimper, au plus près de ce que tu vises.' : 'Surtout ton sport, au plus près de l’effort visé.', specific, 'élevée', climb ? '90–150 min' : '45–75 min', climb ? 'Il faut un mur.' : 'Accès à ton terrain de pratique.'),
    mk('mixed', 'Mixte', 'Ton sport + un bloc de renforcement ciblé sur les capacités clés.', mixed, 'moyenne', '75–120 min', 'Un peu de matériel de renforcement.'),
    mk('physical', 'Préparation physique', 'Travailler les capacités clés hors de ton sport : utile si tu n’as pas accès à ton terrain.', physical, 'faible', '45–75 min', 'Peu spécifique : le transfert vers ton sport n’est pas garanti.'),
  ];
}

/* ───────── Mémoire des décisions ───────── */
export const DECISION_KINDS = { strategy: 'Stratégie choisie', suggestion: 'Suggestion appliquée', ignored: 'Suggestion ignorée', unusual: 'Séance inhabituelle', edit: 'Modification guidée', sacrifice: 'Temps sacrifié' };
/** Nouvelle décision (item de la collection « decision »). */
export function decision(kind, text, { reason = '', context = {}, ref = '' } = {}, now = Date.now()) {
  return { kind: DECISION_KINDS[kind] ? kind : 'edit', text: String(text).slice(0, 200), reason: String(reason).slice(0, 300), ref: String(ref).slice(0, 80),
    sport: String(context.sport || '').slice(0, 40), goal: String(context.goal || '').slice(0, 80), date: now, result: '' };
}
/** Décisions passées utiles pour une situation : même type et même sport d'abord, les plus récentes. */
export function recall(decisions, { kind, sport, ref } = {}) {
  return (decisions || []).filter((d) => (!kind || d.kind === kind) && (!ref || d.ref === ref))
    .map((d) => ({ ...d, score: (sport && d.sport === sport ? 2 : 0) + (d.date || 0) / 1e13 })).sort((a, b) => b.score - a.score).slice(0, 5);
}
/** Suggestions ignorées plusieurs fois : on le dit (on ne les cache pas). */
export function ignoredCount(decisions, sugId) { return (decisions || []).filter((d) => d.kind === 'ignored' && d.ref === sugId).length; }

/* ───────── Séance prévue inhabituelle (avant génération) ───────── */
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
export const UNUSUAL_WHY = { competition: 'Compétition', preparation: 'Préparation', programme: 'Changement de programme', other: 'Autre' };
/**
 * Compare une ossature prévue aux séances récentes (au moins 5) : durée, intensité, activités.
 * Retourne { unusual, notes } — descriptif, sans aucun diagnostic.
 */
export function unusualPlan(phases, history = [], activityOf = (h) => h.data?.context?.phases?.[0]?.activity || '') {
  const recent = history.slice(0, 20);
  if (recent.length < 5) return { unusual: false, notes: [], insufficient: true };
  const minutes = phases.reduce((t, p) => t + (Number(p.minutes) || 0), 0);
  const mins = recent.map((h) => (h.durationSeconds || 0) / 60).filter((m) => m > 0), med = median(mins);
  const notes = [];
  if (med && (minutes > med * 1.8 || minutes < med * 0.45) && Math.abs(minutes - med) >= 30) notes.push(`Durée prévue ${minutes} min, contre ~${Math.round(med)} min d’habitude.`);
  const hardShare = phases.filter((p) => ['hard', 'max'].includes(p.intensity)).reduce((t, p) => t + p.minutes, 0) / Math.max(1, minutes);
  const rpes = recent.map((h) => h.data?.rpe).filter(Boolean);
  if (rpes.length >= 4 && hardShare >= 0.6 && median(rpes) <= 3) notes.push(`${Math.round(hardShare * 100)} % du temps prévu est intense, alors que tes séances récentes étaient plutôt modérées.`);
  const acts = new Set(recent.map(activityOf).filter(Boolean)), planned = [...new Set(phases.map((p) => p.activity).filter((a) => a && a !== 'pause'))];
  const newActs = acts.size ? planned.filter((a) => !acts.has(a)) : [];
  if (newActs.length) notes.push(`Activité${newActs.length > 1 ? 's' : ''} absente${newActs.length > 1 ? 's' : ''} de tes séances récentes : ${newActs.map((a) => ACTIVITIES[a]?.label || a).join(', ')}.`);
  if (phases.length >= 6 && recent.every((h) => (h.data?.context?.phases?.length || 0) <= 3)) notes.push(`Structure très différente : ${phases.length} phases, contre 3 ou moins d’habitude.`);
  return { unusual: notes.length > 0, notes };
}
