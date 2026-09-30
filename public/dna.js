// dna.js — ADN de séance (une structure en POURCENTAGES, sans exercices, réutilisable pour n'importe quelle durée)
// et MODULES (une ou plusieurs phases réutilisables, insérées dans une autre séance avec analyse de compatibilité).
// Sans DOM, testé. Stockés comme données personnelles (collections « sdna » et « smodule », synchronisées).
import { normalizePhase, normalizePhases, fitDurations, ROLES } from './phase.js';
import { analyzeSession } from './phaseplan.js';
import { cleanSelection } from './intents.js';

const KEEP = ['type', 'kind', 'activity', 'role', 'intensity', 'fatigue', 'styles', 'stylesOut', 'attemptType', 'focus', 'volume', 'structure', 'priorities', 'subIntents', 'rules', 'tradeoffs', 'filters', 'noFailure', 'maxVolume', 'avoid', 'goal'];
const pick = (p) => Object.fromEntries(KEEP.filter((k) => p[k] !== undefined && p[k] !== '').map((k) => [k, p[k]]));

/** ADN : chaque phase garde ses réglages mais pas sa durée — seulement sa part du temps (entiers, somme = 100). */
export function dnaFromPhases(phases, name = '') {
  const ph = normalizePhases(phases), total = ph.reduce((t, p) => t + p.minutes, 0) || 1;
  const parts = ph.map((p) => ({ ...pick(p), share: Math.max(1, Math.round((p.minutes / total) * 100)) }));
  const diff = 100 - parts.reduce((t, p) => t + p.share, 0);
  if (parts.length) parts.reduce((a, b) => (b.share > a.share ? b : a)).share += diff;
  return { name: String(name || '').slice(0, 60) || 'Ma structure', parts, summary: parts.map((p) => `${p.share} % ${ROLES[p.role]?.[1]?.toLowerCase() || p.role}`).join(' · ') };
}
/** Génère l'ossature d'un ADN pour une durée donnée (somme exacte, par pas de 5 min). */
export function phasesFromDna(dna, minutes) {
  const M = Math.max(10, Math.round(Number(minutes) || 60)), parts = Array.isArray(dna?.parts) ? dna.parts : [];
  if (!parts.length) return { phases: [], ok: false, error: 'Structure vide.' };
  const raw = normalizePhases(parts.map((p, i) => ({ ...p, id: `dna-${i + 1}`, minutes: Math.max(5, Math.round((M * (Number(p.share) || 0)) / 100 / 5) * 5), subIntents: cleanSelection(p.subIntents) })));
  const r = fitDurations(raw, M);
  return { phases: r.ok ? r.phases : raw, ok: r.ok, error: r.ok ? '' : `${parts.length} phases ne tiennent pas dans ${M} min : allonge la durée ou retire une phase.` };
}

/** Module : une ou plusieurs phases réutilisables (réglages + durée). */
export function moduleFromPhases(phases, name = '') {
  const ph = normalizePhases(phases);
  return { name: String(name || '').slice(0, 60) || 'Module', minutes: ph.reduce((t, p) => t + p.minutes, 0), phases: ph.map((p) => ({ ...pick(p), minutes: p.minutes })) };
}
/** Insère un module à une position ; retourne la nouvelle ossature et l'analyse de compatibilité (ce qui change). */
export function insertModule(phases, mod, at = phases.length, n = Date.now()) {
  const before = analyzeSession(phases).map((s) => s.title);
  const ins = (mod?.phases || []).map((p, k) => normalizePhase({ ...p, id: `mod-${n.toString(36)}-${k}` }, k));
  const list = [...phases]; list.splice(Math.max(0, Math.min(list.length, at)), 0, ...ins);
  const after = analyzeSession(list).map((s) => s.title);
  const added = after.filter((x) => !before.includes(x));
  return { phases: normalizePhases(list), added: ins.length, minutes: ins.reduce((t, p) => t + p.minutes, 0),
    compat: added.length ? added.map((x) => `⚠️ ${x}`) : ['✓ Compatible avec le reste de la séance : aucun nouveau point d’attention.'] };
}
