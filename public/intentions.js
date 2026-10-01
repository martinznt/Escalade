// intentions.js — ce que l'on peut vouloir travailler dans une séance (sans DOM, testé) :
// intentions détaillées par sport, groupes de muscles, zones à ménager, forme du jour et ressenti visé.
import { MUSCLES, CAPACITIES } from './model.js';

const I = (id, emoji, label, caps) => ({ id, emoji, label, caps });
const shared = {
  doigts: I('doigts', '✋', 'Force des doigts', { force_doigts: 1 }),
  pieds: I('pieds', '🦶', 'Précision des pieds', { technique_pieds: 1, equilibre: 0.4 }),
  placement: I('placement', '🧍', 'Placement du corps', { technique_escalade: 1, mobilite_hanches: 0.5, equilibre: 0.4 }),
  gainage: I('gainage', '🧱', 'Gainage', { gainage_anterieur: 1, gainage_lateral: 0.6 }),
  epaules: I('epaules', '🛡️', 'Épaules solides', { stabilite_epaules: 1, controle_scapulaire: 0.6 }),
  explosivite: I('explosivite', '⚡', 'Explosivité', { explosivite: 1, puissance_haut: 0.4 }),
  mobilite: I('mobilite', '🧘', 'Mobilité', { mobilite_hanches: 1, mobilite_epaules: 0.8 }),
};
/** Intentions proposées pour chaque sport (on peut en ajouter : personnelles, ou communes validées par un administrateur). */
export const SPORT_INTENTS = {
  climbing_boulder: [shared.doigts, shared.pieds, shared.placement, I('lecture', '👀', 'Lecture des blocs', { technique_escalade: 1 }),
    I('dynamique', '🚀', 'Jetés et dynamique', { coordination: 1, puissance_haut: 0.8, explosivite: 0.4 }), I('devers', '⛰️', 'Dévers', { gainage_anterieur: 0.9, tirage_vertical: 0.7, puissance_haut: 0.5 }),
    I('dalle', '🧊', 'Dalle et équilibre', { equilibre: 1, technique_pieds: 0.8 }), I('reglettes', '📏', 'Réglettes', { force_doigts: 1, blocage: 0.4 }), I('pinces', '🤏', 'Pinces', { pince: 1 }),
    I('blocages', '🔒', 'Blocages', { blocage: 1, tirage_vertical: 0.5 }), { ...shared.gainage, label: 'Gainage pour grimper' }, shared.epaules, I('souplesse', '🦵', 'Souplesse des hanches', { mobilite_hanches: 1 })],
  climbing_route: [I('continuite', '🔋', 'Continuité', { endurance_doigts: 1, endurance_aerobie: 0.4 }), I('resistance', '🔥', 'Résistance (« bouteille »)', { endurance_doigts: 1 }), shared.doigts, shared.pieds, shared.placement,
    I('lecture', '👀', 'Lecture de voie', { technique_escalade: 1 }), I('repos', '😮‍💨', 'Récupérer sur les prises', { endurance_doigts: 0.6, technique_escalade: 0.6 }), I('mental', '🧠', 'Engagement et chutes', { technique_escalade: 0.7 }), shared.epaules, shared.gainage],
  strength: [I('jambes', '🦵', 'Jambes', { force_jambes: 1 }), I('posterieure', '🍑', 'Fessiers et ischios', { chaine_posterieure: 1 }), I('tirage', '🧗', 'Dos et tirage', { tirage_vertical: 1, tirage_horizontal: 0.8 }),
    I('poussee', '💪', 'Pectoraux et poussée', { poussee_horizontale: 1, poussee_verticale: 0.6 }), I('epaules-f', '🏋️', 'Épaules', { poussee_verticale: 0.8, stabilite_epaules: 0.8 }), shared.gainage, shared.explosivite, I('bras', '💪', 'Bras', { blocage: 0.6, poussee_horizontale: 0.4, tirage_vertical: 0.4 })],
  conditioning: [I('cardio', '❤️', 'Cardio', { endurance_aerobie: 1 }), I('fullbody', '🔄', 'Tout le corps', { force_jambes: 0.6, tirage_vertical: 0.6, poussee_horizontale: 0.6, gainage_anterieur: 0.6 }), shared.gainage, shared.mobilite,
    I('equilibre', '⚖️', 'Équilibre', { equilibre: 1 }), I('figures', '🤸', 'Figures (front lever, drapeau…)', { controle_scapulaire: 1, gainage_anterieur: 0.7, tirage_vertical: 0.5 }), shared.explosivite, shared.epaules],
  running: [I('fondamentale', '🐢', 'Endurance fondamentale', { endurance_aerobie: 1 }), I('fractionne', '⚡', 'Fractionné / VMA', { vitesse: 1, seuil: 0.6 }), I('seuil', '🔥', 'Seuil', { seuil: 1 }),
    I('cotes', '⛰️', 'Côtes', { force_jambes: 0.8, seuil: 0.6 }), I('foulee', '👟', 'Technique de foulée', { technique_course: 1 }), I('renfo', '🦵', 'Renfo du coureur', { force_jambes: 0.7, chaine_posterieure: 0.6, gainage_lateral: 0.5 })],
  swimming: [I('technique', '🏊', 'Technique', { technique_nage: 1 }), I('respiration', '🫧', 'Respiration', { technique_nage: 0.8, endurance_aerobie: 0.4 }), I('endurance', '🔋', 'Endurance', { endurance_aerobie: 1 }), I('vitesse', '⚡', 'Vitesse', { vitesse: 1 })],
};
/** Intentions pour un sport : celles de base + celles ajoutées (personnelles ou communes) pour ce sport ou pour tous. */
export function intentsFor(activityId, extra = []) {
  const base = SPORT_INTENTS[activityId] || SPORT_INTENTS.conditioning;
  const more = extra.filter((x) => x && x.label && (!x.activityId || x.activityId === activityId)).map((x) => ({ id: x.id, emoji: x.emoji || '📌', label: x.label, caps: x.caps || {}, custom: x.source || 'perso' }));
  return [...base, ...more];
}
export const MUSCLE_GROUPS = [['bras', 'Bras', ['biceps', 'triceps']], ['avantbras', 'Avant-bras et doigts', ['avant_bras_flech', 'avant_bras_ext']], ['epaules', 'Épaules', ['deltoide_ant', 'deltoide_lat', 'deltoide_post', 'coiffe']],
  ['dos', 'Dos', ['grand_dorsal', 'trapezes', 'rhomboides']], ['pecs', 'Pectoraux', ['pectoraux', 'grand_dentele']], ['abdos', 'Abdos', ['grand_droit', 'obliques']], ['lombaires', 'Lombaires', ['lombaires']],
  ['fessiers', 'Fessiers', ['grand_fessier', 'moyen_fessier']], ['cuisses', 'Cuisses', ['quadriceps', 'ischios', 'adducteurs']], ['mollets', 'Mollets', ['mollets', 'tibial']]];
/** Groupes de muscles → capacités (d'après le lien muscle → capacité du modèle). */
export function muscleCaps(groups = []) {
  const out = {};
  for (const g of groups) for (const m of MUSCLE_GROUPS.find((x) => x[0] === g)?.[2] || []) for (const [c, w] of Object.entries(MUSCLES[m]?.caps || {})) out[c] = Math.max(out[c] || 0, w);
  return out;
}
export const AVOID_ZONES = [['fingers', '✋ Doigts'], ['shoulders', '🦾 Épaules'], ['elbows', '💪 Coudes'], ['wrists', '🤚 Poignets'], ['back', '🔙 Dos, lombaires'], ['knees', '🦵 Genoux'], ['ankles', '🦶 Chevilles']];
/** Exercices à éviter pour les zones sans liste dédiée (poignets, dos, chevilles), d'après leur type et leur nom. */
export function zoneRisk(x, zones) {
  const n = String(x.name || '').toLowerCase(), why = [];
  if (zones.includes('wrists') && (x.group === 'pousser' || /pompe|dips|planche|poirier|handstand|équilibre sur les mains/.test(n))) why.push('poignets à ménager (pour cette séance)');
  if (zones.includes('back') && (/soulevé|good morning|swing|squat barre|rowing barre/.test(n) || (x.kind === 'legs' && x.intensity === 'high'))) why.push('dos à ménager (pour cette séance)');
  if (zones.includes('ankles') && (x.kind === 'plyo' || x.kind === 'run' || /saut|sprint|corde|bondi/.test(n))) why.push('chevilles à ménager (pour cette séance)');
  return why;
}
export const FORMES = [['exhausted', '😵', 'Épuisé'], ['tired', '😴', 'Fatigué'], ['ok', '🙂', 'Normal'], ['fresh', '💪', 'En forme'], ['top', '⚡', 'Au top']];
export const FEELS = [['easy', '😌', 'Tranquille'], ['mod', '🙂', 'Soutenue'], ['hard', '🔥', 'Intense']];
/**
 * Forme du jour × séance souhaitée → réglage final, toujours du côté prudent :
 * on ne fait jamais une séance intense quand on se dit épuisé ; on peut en faire plus quand on est au top.
 */
export function resolveFeel(forme = 'ok', feel = 'mod') {
  if (forme === 'exhausted') return { light: true, boost: 0, feel: 'easy', note: feel !== 'easy' ? 'Tu te sens épuisé : séance douce, même si tu avais demandé plus.' : '' };
  if (forme === 'tired') return feel === 'hard' ? { light: false, boost: 0, feel: 'mod', note: 'Fatigué aujourd’hui : on reste sur une séance soutenue, pas intense.' } : { light: feel === 'easy', boost: 0, feel, note: '' };
  if (feel === 'easy') return { light: true, boost: 0, feel, note: '' };
  if (feel === 'hard') return { light: false, boost: forme === 'top' ? 2 : 1, feel, note: '' };
  return { light: false, boost: forme === 'top' ? 1 : 0, feel, note: '' };
}
/** Sans assistant : mots d'un texte → capacités (aucune valeur inventée). */
export function keywordCaps(text) {
  const t = String(text || '').toLowerCase(), caps = {};
  const add = (id, w) => { if (CAPACITIES[id]) caps[id] = Math.max(caps[id] || 0, w); };
  if (/doigt|réglette|arqu|crimp/.test(t)) add('force_doigts', 0.9);
  if (/pied|placement|dalle/.test(t)) add('technique_pieds', 0.9);
  if (/lecture|lire|placement|technique/.test(t)) add('technique_escalade', 0.8);
  if (/pince/.test(t)) add('pince', 1);
  if (/jeté|dyna|dynamique|explos/.test(t)) { add('coordination', 0.8); add('explosivite', 0.7); }
  if (/traction|tirer|dos|tirage/.test(t)) add('tirage_vertical', 0.9);
  if (/blocage|verrou/.test(t)) add('blocage', 0.9);
  if (/pompe|pousser|pec/.test(t)) add('poussee_horizontale', 0.9);
  if (/épaule|epaule/.test(t)) add('stabilite_epaules', 0.8);
  if (/cour|km|footing|souffle|cardio|endurance/.test(t)) add('endurance_aerobie', 0.9);
  if (/résistance|bouteille|continuit|avant-bras/.test(t)) add('endurance_doigts', 0.9);
  if (/souple|écart|mobilit|étire|hanche/.test(t)) add('mobilite_hanches', 0.9);
  if (/gainage|abdo|planche|core|tronc/.test(t)) add('gainage_anterieur', 0.9);
  if (/équilibre|equilibre/.test(t)) add('equilibre', 0.9);
  if (/jambe|squat|cuisse|fesse/.test(t)) add('force_jambes', 0.9);
  if (/vitesse|sprint|vma|fraction/.test(t)) add('vitesse', 0.9);
  return caps;
}
