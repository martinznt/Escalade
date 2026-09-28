// goaldone.js — objectif réussi : la performance à enregistrer dans le profil, et les objectifs suivants à proposer.
// Rien n'est inventé : la performance enregistrée est exactement la cible de l'objectif (confirmée par l'utilisateur). Sans DOM, testé.
import { METRICS, SKILLS } from './model.js';
import { sortedLevels, gradeSnapshot } from './grading.js';

const round = (x, unit) => (unit === 'kg' ? Math.round(x * 2) / 2 : unit === 'min' ? Math.round(x * 10) / 10 : Math.round(x));
const metricOf = (g, ctx) => METRICS[g.metricId] || ctx?.metrics?.[g.metricId] || null;
/** Faut-il toujours viser plus haut ? (dir -1 : plus bas = mieux, ex. temps de course) */
const dirOf = (m) => (m?.dir === -1 ? -1 : 1);

/**
 * Performance à enregistrer quand l'objectif est réussi (null si l'objectif ne correspond pas à une mesure).
 * Objectif de cotation → maximum en bloc / voie ; objectif chiffré → la valeur visée.
 */
export function donePerf(g, now = Date.now()) {
  if (g.type === 'grade' && g.gradeTarget?.levelId) {
    const metricId = g.metricId || (g.activityId === 'climbing_route' || /voie/i.test(g.gradeTarget.systemName || '') ? 'max_voie' : 'max_bloc');
    return { metricId, value: g.gradeTarget.order ?? null, grade: { ...g.gradeTarget }, date: now, source: 'declared', note: 'Objectif réussi' };
  }
  if ((g.type === 'metric' || g.metricId) && g.target != null && g.metricId) return { metricId: g.metricId, value: g.target, date: now, source: 'declared', note: 'Objectif réussi' };
  return null;
}

/** Objectifs suivants proposés : un cran au-dessus, ou une figure proche. [{ label, why, data }] */
export function nextGoals(g, ctx = {}, now = Date.now()) {
  const out = [], base = { status: 'active', startedAt: now, activityId: g.activityId || '' };
  if (g.type === 'grade' && g.gradeTarget) {
    const sys = ctx.systems?.[g.gradeTarget.systemId], levels = sortedLevels(sys), i = levels.findIndex((l) => l.id === g.gradeTarget.levelId);
    if (i >= 0 && i + 1 < levels.length) {
      const snap = gradeSnapshot(sys, levels[i + 1].id);
      out.push({ label: `Réussir ${snap.label}`, why: 'Le niveau juste au-dessus.', data: { ...base, type: 'grade', label: `Réussir ${snap.label}`, gradeTarget: snap, metricId: g.metricId || '' } });
    }
    out.push({ label: `3 ${g.gradeTarget.label} différents`, why: 'Consolider le niveau avant de monter.', data: { ...base, type: 'custom', label: `Réussir 3 ${g.gradeTarget.label} différents` } });
  } else if (g.metricId && g.target != null) {
    const m = metricOf(g, ctx), d = dirOf(m), unit = m?.unit || g.unit || '';
    const step = unit === 'reps' ? Math.max(1, Math.round(g.target * 0.15)) : Math.abs(g.target) * 0.08;
    const t = round(g.target + d * step, unit);
    if (t !== g.target) out.push({ label: `${m?.label || g.label} : ${t}${unit && unit !== 'reps' ? ' ' + unit : ''}`, why: d < 0 ? 'Un peu plus rapide.' : 'Un peu plus loin.', data: { ...base, type: 'metric', metricId: g.metricId, target: t, unit: g.unit || unit, label: `${m?.label || g.label} : ${t}` } });
  }
  if (g.type === 'skill' && SKILLS[g.skillId]) {
    const caps = SKILLS[g.skillId].caps || {}, have = new Set((ctx.goals || []).map((x) => x.skillId).filter(Boolean));
    const close = Object.entries(SKILLS).filter(([id]) => id !== g.skillId && !have.has(id))
      .map(([id, s]) => ({ id, s, score: Object.entries(s.caps || {}).reduce((t, [c, w]) => t + w * (caps[c] || 0), 0) })).sort((a, b) => b.score - a.score).slice(0, 2);
    for (const { id, s } of close) out.push({ label: `${s.emoji} ${s.label}`, why: 'Une figure qui s’appuie sur ce que tu viens de réussir.', data: { ...base, type: 'skill', skillId: id, activityId: s.activity || '', label: s.label } });
  }
  return out.slice(0, 3);
}
/** Objectifs réussis, du plus récent au plus ancien. */
export const doneGoals = (goals = []) => goals.filter((g) => g.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
