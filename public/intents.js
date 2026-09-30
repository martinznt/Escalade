// intents.js — intentions STRUCTURÉES : une famille (technique, endurance, force…) contient des sous-objectifs,
// chacun relié à des capacités du modèle (poids 0–1). L'utilisateur choisit plusieurs sous-objectifs, leur donne une
// priorité (1 secondaire → 4 très prioritaire) et peut poser des règles (« la puissance ne doit jamais prendre le
// dessus sur la technique »). Les administrateurs peuvent ajouter des sous-objectifs (contenu commun « subintent »).
// Sans DOM, testé.
import { CAPACITIES } from './model.js';

/** Familles et sous-objectifs de base. `acts` limite un sous-objectif à certaines activités (vide = toutes). */
export const INTENT_FAMILIES = {
  technique: { emoji: '🎯', label: 'Technique', subs: {
    placement: ['Placement', { technique_escalade: 1, equilibre: 0.6 }, ['climb']],
    precision_pieds: ['Précision des pieds', { technique_pieds: 1 }, ['climb']],
    equilibre: ['Équilibre', { equilibre: 1 }],
    lecture: ['Lecture', { technique_escalade: 0.8 }, ['climb']],
    economie: ['Économie gestuelle', { technique_escalade: 0.7, endurance_doigts: 0.4 }, ['climb']],
    coordination: ['Coordination', { coordination: 1 }],
    gestuelle: ['Gestuelle', { technique_escalade: 0.8, coordination: 0.5 }, ['climb']],
    transfert_poids: ['Transfert de poids', { equilibre: 0.8, technique_pieds: 0.6 }, ['climb']],
    technique_course: ['Technique de course', { technique_course: 1 }, ['running']],
    technique_nage: ['Technique de nage', { technique_nage: 1 }, ['swimming']],
  } },
  endurance: { emoji: '🔋', label: 'Endurance', subs: {
    generale: ['Endurance générale', { endurance_aerobie: 1 }],
    specifique: ['Endurance spécifique', { endurance_doigts: 0.8, endurance_aerobie: 0.4 }],
    resistance: ['Résistance', { endurance_doigts: 1, seuil: 0.5 }],
    resistance_haute: ['Résistance à haute intensité', { endurance_doigts: 1, puissance_haut: 0.4, seuil: 0.6 }],
    recuperation_efforts: ['Récupération entre efforts', { endurance_aerobie: 0.7, endurance_doigts: 0.5 }],
  } },
  force: { emoji: '🏋️', label: 'Force', subs: {
    maximale: ['Force maximale', { force_doigts: 0.7, tirage_vertical: 0.8, force_jambes: 0.6 }],
    relative: ['Force relative', { tirage_vertical: 1, blocage: 0.7, force_doigts: 0.6 }],
    isometrique: ['Force isométrique', { blocage: 1, gainage_anterieur: 0.7, force_doigts: 0.6 }],
    explosive: ['Force explosive', { explosivite: 1, puissance_haut: 0.8 }],
  } },
  puissance: { emoji: '⚡', label: 'Puissance', subs: {
    haut: ['Puissance du haut du corps', { puissance_haut: 1 }],
    jambes: ['Explosivité des jambes', { explosivite: 1 }],
    vitesse: ['Vitesse', { vitesse: 1 }],
  } },
  mobilite: { emoji: '🤸', label: 'Mobilité', subs: {
    amplitude: ['Amplitude', { mobilite_hanches: 0.8, mobilite_epaules: 0.8 }],
    specifique: ['Mobilité spécifique', { mobilite_hanches: 1 }],
    controle: ['Contrôle', { controle_scapulaire: 0.8, stabilite_epaules: 0.8 }],
  } },
  performance: { emoji: '🚀', label: 'Performance', subs: {
    reussite: ['Réussite', { technique_escalade: 0.6, force_doigts: 0.6 }],
    limite: ['À la limite', { force_doigts: 0.8, puissance_haut: 0.7 }],
    vitesse_exec: ['Vitesse d’exécution', { vitesse: 0.8, coordination: 0.6 }],
    precision_contrainte: ['Précision sous contrainte', { technique_pieds: 0.8, coordination: 0.7 }],
  } },
};
export const PRIO = { 1: 'Secondaire', 2: 'Important', 3: 'Prioritaire', 4: 'Très prioritaire' };
const CLIMB = ['climbing_boulder', 'climbing_route', 'climbing'];
const actGroup = (activity) => (CLIMB.includes(activity) ? 'climb' : activity || '');

/** Catalogue aplati, complété par les sous-objectifs ajoutés par un administrateur ({ id, family, label, caps, acts }). */
export function subIntents(extra = []) {
  const out = {};
  for (const [fam, f] of Object.entries(INTENT_FAMILIES)) for (const [id, [label, caps, acts]] of Object.entries(f.subs)) out[`${fam}.${id}`] = { id: `${fam}.${id}`, family: fam, label, caps, acts: acts || [] };
  for (const x of extra || []) {
    if (!x || !INTENT_FAMILIES[x.family] || !/^[\w-]{1,40}$/.test(String(x.key || ''))) continue;
    const caps = Object.fromEntries(Object.entries(x.caps || {}).filter(([c, w]) => CAPACITIES[c] && w > 0));
    if (!Object.keys(caps).length) continue;
    out[`${x.family}.${x.key}`] = { id: `${x.family}.${x.key}`, family: x.family, label: String(x.label || x.key).slice(0, 60), caps, acts: Array.isArray(x.acts) ? x.acts.slice(0, 6) : [], admin: true };
  }
  return out;
}
/** Sous-objectifs pertinents pour une activité, groupés par famille (on n'affiche pas une liste incohérente). */
export function subIntentsFor(activity, extra) {
  const g = actGroup(activity), all = subIntents(extra), out = {};
  for (const s of Object.values(all)) if (!s.acts.length || s.acts.includes(g) || s.acts.includes(activity)) (out[s.family] ||= []).push(s);
  return out;
}

/** Normalise une sélection : [{ id, prio }] avec des identifiants connus et une priorité 1–4. */
export function cleanSelection(list, extra) {
  const all = subIntents(extra), seen = new Set();
  return (Array.isArray(list) ? list : []).map((x) => ({ id: String(x?.id || ''), prio: Math.max(1, Math.min(4, Math.round(Number(x?.prio) || 2))) }))
    .filter((x) => all[x.id] && !seen.has(x.id) && seen.add(x.id)).slice(0, 12);
}
/** Règles « A ne doit jamais prendre le dessus sur B » : { over, under } entre familles ou sous-objectifs sélectionnés. */
export function cleanRules(rules, selection) {
  const keys = new Set(selection.flatMap((s) => [s.id, s.id.split('.')[0]]));
  return (Array.isArray(rules) ? rules : []).map((r) => ({ over: String(r?.over || ''), under: String(r?.under || '') }))
    .filter((r) => r.over && r.under && r.over !== r.under && keys.has(r.over) && keys.has(r.under)).slice(0, 6);
}

/**
 * Capacités visées (poids = priorité × poids du lien), puis application des règles : la famille ou le sous-objectif
 * « under » ne peut jamais peser plus que « over » (il est ramené juste en dessous). Retourne { caps, why }.
 */
export function intentCaps(selection, rules = [], extra) {
  const all = subIntents(extra), caps = {}, why = [];
  const weightOf = (key) => selection.filter((s) => s.id === key || s.id.split('.')[0] === key).reduce((t, s) => t + s.prio, 0);
  const prio = {}; for (const s of selection) prio[s.id] = s.prio;
  for (const r of rules) {
    const a = weightOf(r.over), b = weightOf(r.under);
    if (b >= a) {
      const scale = Math.max(0.1, (a - 0.5) / b);
      for (const s of selection) if (s.id === r.under || s.id.split('.')[0] === r.under) prio[s.id] = Math.round(s.prio * scale * 100) / 100;
      why.push(`« ${labelOf(r.under, all)} » ramené sous « ${labelOf(r.over, all)} » (règle posée par toi).`);
    }
  }
  for (const s of selection) for (const [c, w] of Object.entries(all[s.id].caps)) caps[c] = Math.round(((caps[c] || 0) + prio[s.id] * w) * 100) / 100;
  return { caps, why };
}
export const labelOf = (key, all = subIntents()) => all[key]?.label || INTENT_FAMILIES[key]?.label || key;
