// estimate.js — estimation EXPLICABLE du niveau d'une séance (débutant / intermédiaire / avancé).
// Utilisé par le serveur quand une séance devient commune (filtres de la bibliothèque commune) et par le client
// (simulation avant génération). C'est une estimation indicative, jamais une vérité ni un classement de personnes.
// Pur JavaScript, sans DOM.

import { byId, LIBRARY } from './library.js';
import { exKey } from './shared.js';

const SPECIFIC = new Set(['hangboard', 'rings', 'barbell', 'pole', 'machine']);
const avg = (a, b) => (a + b) / 2;
function libOf(ex) {
  if (ex.libId && byId(ex.libId)) return byId(ex.libId);
  const k = exKey(ex.name);
  return LIBRARY.find((x) => exKey(x.name) === k) || null;
}
function minutesOf(ex) {
  const side = ex.perSide ? 2 : 1;
  const work = ex.mode === 'time' ? avg(ex.secMin || 30, ex.secMax || 30) : avg(ex.repsMin || 8, ex.repsMax || 8) * (ex.repSec > 0 ? ex.repSec : /bloc|voie|essai/i.test(ex.unit || '') ? 75 : 3.5);
  return ((ex.sets || 1) * (work * side + 15) + Math.max(0, (ex.sets || 1) - 1) * (ex.rest || 0)) / 60;
}
export const LEVEL_LABEL = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };

/**
 * session : séance normalisée. Retourne { level, score, criteria:[{label, value, effect}], text }.
 * Critères : difficulté intrinsèque des exercices, niveau minimal requis, intensité, volume, durée,
 * matériel spécifique, figures / exercices unilatéraux exigeants, repère d'escalade indiqué par l'auteur.
 */
export function estimateLevel(session) {
  const exs = (session?.exercises || []).filter((e) => e.block !== 'warmup' && e.block !== 'cool');
  const list = exs.length ? exs : session?.exercises || [];
  if (!list.length) return { level: 'debutant', score: 0, criteria: [{ label: 'Contenu', value: 'aucun exercice', effect: 'impossible d’estimer : considéré accessible' }], text: 'Séance vide.' };
  let sets = 0, wDiff = 0, maxDiff = 0, minLevel = 0, high = 0, minutes = 0, specific = new Set(), demanding = [];
  for (const e of list) {
    const lib = libOf(e);
    const diff = e.diff || lib?.diff || 2;
    const s = Math.max(1, e.sets || 1);
    sets += s; wDiff += diff * s; maxDiff = Math.max(maxDiff, diff);
    minLevel = Math.max(minLevel, lib?.minLevel || 0);
    if ((e.intensity || lib?.intensity) === 'high') high += s;
    minutes += minutesOf(e);
    for (const n of e.needs?.length ? e.needs : lib?.needs || []) if (SPECIFIC.has(n)) specific.add(n);
    if (diff >= 4) demanding.push(e.name);
  }
  minutes += (session.exercises || []).filter((e) => e.block === 'warmup' || e.block === 'cool').reduce((t, e) => t + minutesOf(e), 0);
  const diffAvg = wDiff / sets, highShare = high / sets;
  const gradeHint = session.gradeHint?.label ? session.gradeHint : null;
  let score = ((diffAvg - 1) / 4) * 0.35 + ((maxDiff - 1) / 4) * 0.15 + (minLevel / 2) * 0.2 + highShare * 0.15 + Math.min(1, sets / 40) * 0.1 + Math.min(1, minutes / 90) * 0.05;
  if (gradeHint && gradeHint.total > 1) score = score * 0.7 + (gradeHint.order / (gradeHint.total - 1)) * 0.3;
  score = Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
  const level = score < 0.34 ? 'debutant' : score < 0.6 ? 'intermediaire' : 'avance';
  const criteria = [
    { label: 'Difficulté intrinsèque moyenne', value: `${Math.round(diffAvg * 10) / 10} / 5`, effect: diffAvg >= 3.5 ? 'élève le niveau' : diffAvg <= 2 ? 'accessible' : 'neutre' },
    { label: 'Exercice le plus exigeant', value: `${maxDiff} / 5${demanding.length ? ' (' + demanding.slice(0, 3).join(', ') + ')' : ''}`, effect: maxDiff >= 4 ? 'élève le niveau' : 'neutre' },
    { label: 'Niveau minimal conseillé des exercices', value: ['aucun', 'intermédiaire', 'avancé'][minLevel], effect: minLevel ? 'élève le niveau' : 'neutre' },
    { label: 'Part d’exercices intenses', value: `${Math.round(highShare * 100)} %`, effect: highShare >= 0.4 ? 'élève le niveau' : 'neutre' },
    { label: 'Volume', value: `${sets} séries`, effect: sets >= 30 ? 'élève le niveau' : 'neutre' },
    { label: 'Durée estimée', value: `~${Math.round(minutes)} min`, effect: minutes >= 75 ? 'élève le niveau' : 'neutre' },
    { label: 'Matériel spécifique', value: specific.size ? [...specific].join(', ') : 'aucun', effect: specific.size ? 'demande un équipement particulier' : 'accessible partout' },
  ];
  if (gradeHint) criteria.push({ label: 'Repère d’escalade indiqué par l’auteur', value: `${gradeHint.label} (${gradeHint.systemName})`, effect: 'pris en compte' });
  return { level, score, criteria, minutes: Math.round(minutes), text: `Estimation ${LEVEL_LABEL[level].toLowerCase()} (score ${score}) calculée à partir de ${criteria.length} critères. Indication approximative, pas une vérité.` };
}
