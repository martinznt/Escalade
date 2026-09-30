// sessionchain.js — la création d'une séance comme une CHAÎNE de paramètres qui dépend du type choisi :
// type de phase → objectif → sous-objectifs → paramètres propres à ce type → intensité et durée → lieu → contraintes
// → verrous. Chaque maillon n'affiche que ce qui a du sens pour le type (pas de liste incohérente).
// L'OBJECTIF DE LA SÉANCE peut être placé à n'importe quel moment : au début, au milieu, à la fin, sur toute la
// séance, ou sur une phase précise. Sans DOM, testé.
import { INTENT_FAMILIES, cleanSelection, subIntentsFor } from './intents.js';
import { filtersFor } from './filters.js';
import { normalizePhase } from './phase.js';

export const FAMILY_ROLE = { technique: 'technique', endurance: 'endurance', force: 'force', puissance: 'puissance', mobilite: 'mobilite', performance: 'perf' };
const FAMILY_INTENSITY = { performance: 'max', force: 'hard', puissance: 'hard', endurance: 'mod', technique: 'mod', mobilite: 'easy' };
export const WHEN = { start: 'Au début', middle: 'Au milieu', end: 'À la fin', all: 'Toute la séance' };
const EDGE = new Set(['pause', 'warmup', 'cool']);
const isEdge = (p) => EDGE.has(p.type) || EDGE.has(p.role);

/** Objectif de séance nettoyé : { family, subIntents, when, label }. `when` = start | middle | end | all | ph:<id>. */
export function cleanObjective(o = {}) {
  const family = INTENT_FAMILIES[o?.family] ? o.family : '';
  if (!family) return null;
  const when = WHEN[o.when] || /^ph:[\w-]{1,40}$/.test(String(o.when || '')) ? o.when : 'end';
  return { family, subIntents: cleanSelection(o.subIntents).filter((s) => s.id.startsWith(family + '.')), when, label: String(o.label || '').replace(/[<>]/g, '').slice(0, 80) };
}
export const objectiveLabel = (o) => (o ? o.label || `${INTENT_FAMILIES[o.family].emoji} ${INTENT_FAMILIES[o.family].label}` : '');
export const whenLabel = (o, phases = []) => {
  if (!o) return '';
  if (o.when?.startsWith('ph:')) { const i = phases.findIndex((p) => p.id === o.when.slice(3)); return i >= 0 ? `Phase ${i + 1}` : 'Phase choisie'; }
  return WHEN[o.when] || '';
};

/**
 * Place l'objectif dans la structure. Choisit (ou garde) la phase qui le porte, la déplace au moment demandé
 * (sans jamais déplacer une phase dont l'ordre est verrouillé), lui donne le rôle et les sous-objectifs de
 * l'objectif, et l'intensité correspondante si elle n'est pas verrouillée. Retourne { phases, index, notes }.
 */
export function placeObjective(phasesIn, objIn) {
  const obj = cleanObjective(objIn), notes = [];
  const phases = phasesIn.map((p) => ({ ...p, objective: false }));
  if (!obj || !phases.length) return { phases, index: -1, notes };
  const cand = phases.map((p, i) => ({ p, i })).filter(({ p }) => !isEdge(p));
  if (!cand.length) { notes.push('Aucune phase de travail pour porter l’objectif : ajoute une phase.'); return { phases, index: -1, notes }; }
  const apply = (p, prio = 1) => {
    const role = FAMILY_ROLE[obj.family];
    if (p.locks?.goal !== 'user') p.role = role;
    if (p.locks?.intensity !== 'user' && FAMILY_INTENSITY[obj.family]) p.intensity = FAMILY_INTENSITY[obj.family];
    const cur = cleanSelection(p.subIntents), add = obj.subIntents.map((s) => ({ ...s, prio: Math.max(1, Math.min(4, s.prio * prio)) }));
    p.subIntents = cleanSelection([...add, ...cur.filter((c) => !add.some((a) => a.id === c.id))]);
  };
  if (obj.when === 'all') { for (const { p } of cand) apply(p); cand.forEach(({ p }) => { p.objective = true; }); return { phases: phases.map((p, i) => normalizePhase(p, i)), index: cand[0].i, notes: ['Objectif appliqué à toutes les phases de travail.'] }; }
  let target;
  if (obj.when.startsWith('ph:')) target = cand.find(({ p }) => p.id === obj.when.slice(3));
  if (!target) target = cand.find(({ p }) => p.role === FAMILY_ROLE[obj.family]) || [...cand].sort((a, b) => b.p.minutes - a.p.minutes)[0];
  const p = target.p; apply(p); p.objective = true;
  if (!obj.when.startsWith('ph:') && p.locks?.order !== 'user') {
    const rest = phases.filter((x) => x !== p);
    const lead = rest.findIndex((x) => !isEdge(x) || x.type === 'pause'); // après l'échauffement du début
    const firstWork = lead < 0 ? rest.length : lead;
    let lastWork = rest.length; while (lastWork > 0 && isEdge(rest[lastWork - 1]) && rest[lastWork - 1].type !== 'pause') lastWork--; // avant le retour au calme
    const work = rest.filter((x) => !isEdge(x)).length;
    const at = obj.when === 'start' ? firstWork : obj.when === 'end' ? lastWork : Math.min(lastWork, firstWork + Math.ceil(work / 2));
    rest.splice(at, 0, p);
    phases.splice(0, phases.length, ...rest);
  } else if (p.locks?.order === 'user') notes.push('Ordre verrouillé : la phase de l’objectif reste à sa place.');
  const index = phases.indexOf(p);
  return { phases: phases.map((x, i) => normalizePhase(x, i)), index, notes };
}

/* ───────── La chaîne de paramètres d'une phase, selon son type ───────── */
export const LINKS = {
  type: '1 · Type de phase', objectif: '2 · Objectif', sous: '3 · Précisément', params: '4 · Réglages du type',
  intensite: '5 · Intensité et durée', lieu: '6 · Lieu', contraintes: '7 · Je veux / je ne veux pas', verrous: '8 · Ce que l’app décide',
};
/** Maillons utiles pour une phase (une pause n'a ni objectif ni réglages de type). */
export function chainFor(p) {
  if (p.type === 'pause') return ['type', 'intensite', 'lieu'];
  if (['warmup', 'cool'].includes(p.type)) return ['type', 'intensite', 'lieu', 'contraintes', 'verrous'];
  return Object.keys(LINKS);
}
/** Réglages « du type » proposés (filtres contextuels + réglages propres : escalade, structures de sport). */
export function paramsFor(p) {
  const act = p.type === 'climb' ? (p.kind === 'voie' ? 'climbing_route' : 'climbing_boulder') : p.activity || '';
  return { activity: act, filters: filtersFor(act).filter((k) => !['intensite', 'duree', 'materiel'].includes(k)), subs: subIntentsFor(act) };
}
/** État de chaque maillon : fait / à faire, et le résumé court affiché dans l'en-tête. */
export function chainStatus(p) {
  const done = {
    type: true,
    objectif: !!p.role && p.role !== 'main',
    sous: (p.subIntents || []).length > 0,
    params: Object.keys(p.filters || {}).length > 0 || (p.styles || []).length > 0 || !!p.structure || p.from != null,
    intensite: !!p.intensity,
    lieu: !!p.place && (p.place.mode !== 'other' || !!p.place.envId),
    contraintes: !!(p.noFailure || p.maxVolume || (p.avoid || []).length || (p.forbidEquip || []).length || p.constraints),
    verrous: Object.values(p.locks || {}).some((v) => v === 'user'),
  };
  const links = chainFor(p);
  return { links, done: links.filter((k) => done[k]), next: links.find((k) => !done[k]) || null, text: `${links.filter((k) => done[k]).length}/${links.length} réglés` };
}
