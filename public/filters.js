// filters.js — filtres CONTEXTUELS et à PLUSIEURS NIVEAUX (séance → phase → exercice).
// Les filtres proposés dépendent de l'activité (voie, bloc, musculation, course…) : pas de liste incohérente.
// Un filtre global est hérité par les phases ; une phase (ou un exercice) peut le garder, le préciser, le remplacer
// ou le retirer (si l'utilisateur l'autorise). L'intersection de tous les filtres est vérifiée : si rien ne peut
// y répondre, on le dit et on propose quels filtres relâcher. Sans DOM, testé.
import { EQUIPMENT, GROUP_LABEL } from './library.js';
import { CAPACITIES, BUILTIN_STYLES } from './model.js';

const opts = (o) => Object.entries(o).map(([id, label]) => ({ id, label }));
const STYLES = BUILTIN_STYLES.map((s) => ({ id: s.id, label: s.label }));
const INCLINE = opts({ dalle: 'Dalle', vertical: 'Vertical', leger: 'Léger dévers', devers: 'Dévers', toit: 'Toit' });
const HOLDS = opts({ reglettes: 'Réglettes', plats: 'Plats', pinces: 'Pinces', bacs: 'Bacs', trous: 'Trous', volumes: 'Volumes' });
const INTENSITY = opts({ easy: 'Facile', mod: 'Modérée', hard: 'Difficile', max: 'Maximale' });
const LEVEL = opts({ 0: 'Débutant', 1: 'Intermédiaire', 2: 'Avancé' });
const EQUIP = [{ id: 'none', label: 'Aucun matériel' }, ...opts(EQUIPMENT)];

/** Définitions : type multi / enum / range / num ; apply = 'match' (filtre les exercices) ou 'param' (règle le contenu). */
export const FILTER_DEFS = {
  style: { label: 'Style', type: 'multi', options: STYLES, apply: 'match' },
  cotation: { label: 'Cotation', type: 'range', apply: 'param' },
  longueur: { label: 'Longueur', type: 'enum', options: opts({ court: 'Courte', moyen: 'Moyenne', long: 'Longue' }), apply: 'param' },
  inclinaison: { label: 'Inclinaison', type: 'multi', options: INCLINE, apply: 'match' },
  prises: { label: 'Type de prises', type: 'multi', options: HOLDS, apply: 'param' },
  essais: { label: 'Essais max', type: 'num', min: 1, max: 30, apply: 'param' },
  volume: { label: 'Volume', type: 'enum', options: opts({ low: 'Peu', mod: 'Moyen', high: 'Beaucoup' }), apply: 'param' },
  intensite: { label: 'Intensité', type: 'enum', options: INTENSITY, apply: 'match' },
  niveau: { label: 'Niveau', type: 'enum', options: LEVEL, apply: 'match' },
  materiel: { label: 'Matériel autorisé', type: 'multi', options: EQUIP, apply: 'match' },
  capacite: { label: 'Capacité', type: 'multi', options: Object.entries(CAPACITIES).map(([id, c]) => ({ id, label: c.label })), apply: 'match' },
  mouvement: { label: 'Mouvement', type: 'multi', options: opts(GROUP_LABEL), apply: 'match' },
  muscle: { label: 'Muscle', type: 'multi', options: opts({ dorsaux: 'Dorsaux', pectoraux: 'Pectoraux', quadriceps: 'Quadriceps', fessiers: 'Fessiers', abdos: 'Abdos', 'avant-bras': 'Avant-bras', doigts: 'Doigts', épaules: 'Épaules', 'ischio-jambiers': 'Ischio-jambiers', mollets: 'Mollets' }), apply: 'match' },
  exclus: { label: 'Exercices exclus', type: 'multi', options: [], apply: 'match' },
  series: { label: 'Séries', type: 'range', apply: 'param' },
  reps: { label: 'Répétitions', type: 'range', apply: 'param' },
  charge: { label: 'Charge (% du max)', type: 'range', apply: 'param' },
  allure: { label: 'Allure', type: 'enum', options: opts({ facile: 'Facile', tempo: 'Tempo', seuil: 'Seuil', rapide: 'Rapide' }), apply: 'param' },
  distance: { label: 'Distance (km)', type: 'range', apply: 'param' },
  terrain: { label: 'Terrain', type: 'enum', options: opts({ route: 'Route', piste: 'Piste', trail: 'Trail' }), apply: 'param' },
  nage: { label: 'Nage', type: 'multi', options: opts({ crawl: 'Crawl', brasse: 'Brasse', dos: 'Dos', papillon: 'Papillon' }), apply: 'param' },
  duree: { label: 'Durée (min)', type: 'num', min: 5, max: 240, apply: 'param' },
};
const COMMON = ['intensite', 'niveau', 'materiel', 'duree'];
/** Filtres pertinents par activité (l'ordre est celui de l'affichage). */
export const FILTERS_BY_ACTIVITY = {
  climbing_route: ['style', 'cotation', 'longueur', 'inclinaison', 'prises', 'volume', 'essais', ...COMMON],
  climbing_boulder: ['style', 'cotation', 'inclinaison', 'prises', 'essais', 'volume', ...COMMON],
  strength: ['capacite', 'muscle', 'mouvement', 'exclus', 'charge', 'series', 'reps', ...COMMON],
  conditioning: ['capacite', 'muscle', 'mouvement', 'exclus', 'series', 'reps', ...COMMON],
  running: ['allure', 'distance', 'terrain', ...COMMON],
  swimming: ['nage', 'distance', ...COMMON],
};
export const filtersFor = (activity) => FILTERS_BY_ACTIVITY[activity] || ['capacite', 'mouvement', 'exclus', ...COMMON];
export const MODES = { keep: 'Garder', refine: 'Préciser', replace: 'Remplacer', remove: 'Retirer' };

/** Valeur nettoyée selon la définition (null = pas de filtre). */
export function cleanValue(key, v) {
  const d = FILTER_DEFS[key]; if (!d || v == null) return null;
  if (d.type === 'multi') { const ok = new Set(d.options.map((o) => o.id)); const a = [...new Set((Array.isArray(v) ? v : [v]).map(String).filter((x) => !d.options.length ? /^[\w.:-]{1,64}$/.test(x) : ok.has(x)))].slice(0, 20); return a.length ? a : null; }
  if (d.type === 'enum') return d.options.some((o) => o.id === String(v)) ? String(v) : null;
  if (d.type === 'num') { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(d.min, Math.min(d.max, n)) : null; }
  if (d.type === 'range') { const min = v.min === '' || v.min == null ? null : Number(v.min), max = v.max === '' || v.max == null ? null : Number(v.max); return min == null && max == null ? null : { min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null }; }
  return null;
}
/** Un niveau de filtres : { key: { mode, value } }. Les clés inconnues sont ignorées. */
export function cleanLevel(level) {
  const out = {};
  for (const [k, f] of Object.entries(level || {})) {
    if (!FILTER_DEFS[k] || !f || typeof f !== 'object') continue;
    const mode = MODES[f.mode] ? f.mode : 'replace';
    const value = mode === 'remove' || mode === 'keep' ? null : cleanValue(k, f.value);
    if (mode === 'remove' || mode === 'keep' || value != null) out[k] = { mode, value };
  }
  return out;
}

const within = (child, parent, type) => {
  if (type === 'multi') return child.every((x) => parent.includes(x));
  if (type === 'range') return (parent.min == null || (child.min ?? -Infinity) >= parent.min) && (parent.max == null || (child.max ?? Infinity) <= parent.max);
  if (type === 'num') return child <= parent;
  return child === parent;
};
/**
 * Filtres effectifs à partir des niveaux [global, phase, exercice]. Retourne { filters, origin, conflicts } :
 * origin dit d'où vient chaque filtre ; un « préciser » qui sort du filtre hérité est un conflit (jamais corrigé en silence) ;
 * « retirer » n'est accepté que si allowRemove.
 */
export function effectiveFilters(levels, { allowRemove = true } = {}) {
  const names = ['séance', 'phase', 'exercice'], filters = {}, origin = {}, conflicts = [];
  levels.forEach((raw, i) => {
    for (const [k, f] of Object.entries(cleanLevel(raw))) {
      const d = FILTER_DEFS[k], cur = filters[k];
      if (f.mode === 'keep') continue;
      if (f.mode === 'remove') { if (!allowRemove) { conflicts.push({ key: k, text: `« ${d.label} » ne peut pas être retiré au niveau ${names[i]}.` }); continue; } delete filters[k]; origin[k] = `retiré (${names[i]})`; continue; }
      if (f.mode === 'refine' && cur != null && !within(f.value, cur, d.type)) { conflicts.push({ key: k, text: `« ${d.label} » précisé au niveau ${names[i]} sort du filtre hérité : il faut le remplacer, pas le préciser.` }); continue; }
      filters[k] = f.value; origin[k] = f.mode === 'refine' && cur != null ? `précisé (${names[i]})` : names[i];
    }
  });
  for (const [k, v] of Object.entries(filters)) if (FILTER_DEFS[k].type === 'range' && v.min != null && v.max != null && v.min > v.max) conflicts.push({ key: k, text: `« ${FILTER_DEFS[k].label} » : le minimum dépasse le maximum.` });
  return { filters, origin, conflicts };
}

/* ───────── Correspondance d'un exercice de la bibliothèque avec les filtres « match » ───────── */
const INT = { easy: ['low'], mod: ['low', 'mod'], hard: ['mod', 'high'], max: ['high'] };
const MATCH = {
  intensite: (ex, v) => !ex.intensity || INT[v].includes(ex.intensity),
  niveau: (ex, v) => (ex.minLevel || 0) <= Number(v),
  materiel: (ex, v) => (ex.needs || []).every((n) => v.includes(n)),
  capacite: (ex, v) => v.some((c) => (ex.caps?.[c] || 0) >= 0.5),
  mouvement: (ex, v) => v.includes(ex.group),
  muscle: (ex, v) => (ex.muscles || []).some((m) => v.includes(m)),
  exclus: (ex, v) => !v.includes(ex.id),
  style: (ex, v) => !ex.focus?.length || v.some((s) => ex.focus.includes(s.replace(/^st-/, ''))),
  inclinaison: (ex, v) => !ex.focus?.length || v.some((s) => ex.focus.includes(s === 'leger' ? 'devers' : s)) || !ex.focus.some((f) => ['dalle', 'devers'].includes(f)),
};
/** Pourquoi un exercice ne passe pas (liste de clés), [] s'il passe. */
export function failing(ex, filters) {
  return Object.entries(filters).filter(([k, v]) => FILTER_DEFS[k]?.apply === 'match' && MATCH[k] && !MATCH[k](ex, v)).map(([k]) => k);
}
export const matches = (ex, filters) => !failing(ex, filters).length;

/**
 * Intersection de tous les filtres sur une liste de candidats. Si rien ne passe : quels filtres relâcher, classés par
 * nombre de candidats retrouvés (on ne relâche rien soi-même). Contradictions logiques signalées aussi.
 */
export function intersect(candidates, filters, { subIntents = [], constraints = {} } = {}) {
  const ok = candidates.filter((c) => matches(c, filters));
  const contradictions = [];
  if (filters.intensite === 'easy' && subIntents.some((s) => /^performance\.(limite|reussite)$/.test(s.id || s))) contradictions.push('Intensité « facile » et objectif « à la limite » ne vont pas ensemble.');
  if (constraints.noFailure && (subIntents.some((s) => /limite/.test(s.id || s)) || filters.essais === 1)) contradictions.push('« Ne pas aller à l’échec » contredit un travail « à la limite ».');
  if (filters.materiel?.length === 1 && filters.materiel[0] === 'none' && filters.style?.length) contradictions.push('Un style d’escalade demande un mur : « aucun matériel » ne le permet pas.');
  const relax = [];
  if (!ok.length) for (const k of Object.keys(filters)) {
    if (FILTER_DEFS[k]?.apply !== 'match') continue;
    const rest = { ...filters }; delete rest[k];
    const n = candidates.filter((c) => matches(c, rest)).length;
    if (n) relax.push({ key: k, label: FILTER_DEFS[k].label, gain: n, text: `Relâcher « ${FILTER_DEFS[k].label} » rendrait ${n} exercice(s) possible(s).` });
  }
  return { count: ok.length, items: ok, contradictions, relax: relax.sort((a, b) => b.gain - a.gain), incompatible: !ok.length || contradictions.length > 0 };
}

/** Résumé lisible d'un jeu de filtres (pour la prévisualisation). */
export function filterText(filters) {
  return Object.entries(filters).map(([k, v]) => {
    const d = FILTER_DEFS[k]; if (!d) return '';
    const lab = (id) => d.options?.find((o) => o.id === id)?.label || id;
    const val = d.type === 'multi' ? v.map(lab).join(', ') : d.type === 'enum' ? lab(v) : d.type === 'range' ? `${v.min ?? '…'} → ${v.max ?? '…'}` : String(v);
    return `${d.label} : ${val}`;
  }).filter(Boolean);
}
