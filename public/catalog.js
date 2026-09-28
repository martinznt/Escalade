// catalog.js — séances prêtes à l'emploi, construites avec les exercices de la bibliothèque, chacune avec ce
// qu'elle travaille, pourquoi c'est intéressant et ses sources (voir sources.js). Tri « pour toi » d'après le profil,
// et classement des exercices par catégorie. Sans DOM (testé).
import { byId, LIBRARY } from './library.js';
import { normalizeSession, normalizeEx, uid } from './shared.js';
import { CAPACITIES } from './model.js';

// [libId, séries, rép. ou secondes, repos (s)] — secondes si l'exercice est chronométré.
const X = (libId, sets, amount, rest, block = '') => ({ libId, sets, amount, rest, block });
export const CATALOG = [
  // ── Course ──
  { id: 'run-4x4', name: 'Fractionné 4 × 4 min', emoji: '🔥', activity: 'running', level: 1, minutes: 40, goals: ['endurance', 'poids'],
    works: ['vitesse', 'seuil', 'endurance_aerobie'], why: 'Quatre blocs de 4 minutes à allure soutenue (90–95 % de ta FC max) : l’un des moyens les plus efficaces d’augmenter la VO2max.',
    tips: ['Tu dois pouvoir dire quelques mots, pas une phrase entière.', '3 min de trot entre les blocs.'], sources: ['helgerud2007', 'milanovic2015'],
    ex: [X('run-easy', 1, 600, 0, 'warmup'), X('run-intervals-long', 4, 240, 180), X('run-easy', 1, 300, 0, 'cool')] },
  { id: 'run-30-30', name: 'Fractionné court 30/30', emoji: '⚡', activity: 'running', level: 1, minutes: 30, goals: ['endurance', 'poids'],
    works: ['vitesse', 'seuil'], why: '30 s vite, 30 s lent : de l’intensité par petites doses, idéal pour découvrir le fractionné.',
    tips: ['Vite mais contrôlé : la dernière répétition doit ressembler à la première.'], sources: ['milanovic2015'],
    ex: [X('run-easy', 1, 600, 0, 'warmup'), X('run-intervals', 2, 300, 180), X('run-easy', 1, 300, 0, 'cool')] },
  { id: 'run-easy', name: 'Footing en endurance fondamentale', emoji: '🐢', activity: 'running', level: 0, minutes: 40, goals: ['endurance', 'forme', 'poids', 'sante'],
    works: ['endurance_aerobie'], why: 'Courir facile, en pouvant parler : c’est la base. Les coureurs d’endurance font environ 80 % de leurs séances à ce rythme.',
    tips: ['Si tu ne peux plus parler, ralentis.', 'Finis par 4 lignes droites pour garder de la vitesse.'], sources: ['seiler2010', 'stoggl2014'],
    ex: [X('run-easy', 1, 1800, 0), X('run-strides', 4, 6, 60)] },
  { id: 'run-tempo', name: 'Allure seuil (tempo)', emoji: '🔥', activity: 'running', level: 1, minutes: 45, goals: ['endurance'],
    works: ['seuil', 'endurance_aerobie'], why: 'Deux blocs de 10 minutes à allure « confortablement difficile » pour tenir plus longtemps un rythme soutenu.',
    tips: ['Allure que tu pourrais tenir environ une heure en course.'], sources: ['seiler2010'],
    ex: [X('run-easy', 1, 600, 0, 'warmup'), X('run-tempo', 2, 600, 180), X('run-easy', 1, 300, 0, 'cool')] },
  { id: 'run-start', name: 'Premier pas : marche et course', emoji: '🌱', activity: 'running', level: 0, minutes: 25, goals: ['forme', 'poids', 'sante'],
    works: ['endurance_aerobie'], why: 'Alterner 2 min de course douce et 1 min de marche : on accumule des minutes sans s’épuiser.',
    tips: ['Au fil des semaines, allonge la course et raccourcis la marche.'], sources: ['who2020'],
    ex: [X('wu-pulse', 1, 240, 0), X('run-short', 6, 120, 60)] },
  // ── Musculation / renforcement ──
  { id: 'str-maison', name: 'Renfo maison sans matériel', emoji: '🏠', activity: 'conditioning', level: 0, minutes: 30, goals: ['force', 'forme', 'sante', 'poids'],
    works: ['force_jambes', 'poussee_horizontale', 'chaine_posterieure', 'gainage_anterieur', 'gainage_lateral'], why: 'Tout le corps avec le poids du corps : de quoi faire les 2 séances de renforcement par semaine recommandées.',
    tips: ['Arrête une série quand la technique se dégrade.', 'Quand tout devient facile, ajoute 2 répétitions.'], sources: ['who2020', 'acsm2009'],
    ex: [X('wu-pulse', 1, 240, 0), X('bulgarian', 3, 10, 60), X('pushup', 3, 10, 60), X('single-leg-rdl', 3, 10, 60), X('hollow-hold', 3, 30, 45), X('side-plank', 2, 30, 30), X('cd-hips', 1, 120, 0)] },
  { id: 'str-circuit', name: 'Circuit cardio-renfo', emoji: '🔄', activity: 'conditioning', level: 1, minutes: 30, goals: ['poids', 'endurance', 'forme'],
    works: ['endurance_aerobie', 'force_jambes', 'poussee_horizontale', 'gainage_anterieur'], why: 'Enchaîner les exercices avec peu de repos garde le cœur haut tout en renforçant : utile pour dépenser plus pendant la semaine.',
    tips: ['Repos courts (30 s), charges légères, beaucoup de répétitions.'], sources: ['acsm2009', 'donnelly2009'],
    ex: [X('wu-pulse', 1, 240, 0), X('skater-jumps', 3, 12, 30), X('pushup', 3, 12, 30), X('bulgarian', 3, 12, 30), X('dead-bug', 3, 12, 30), X('cd-breath', 1, 120, 0)] },
  { id: 'str-tabata', name: 'Tabata au poids du corps', emoji: '⏱', activity: 'conditioning', level: 1, minutes: 20, goals: ['endurance', 'poids'],
    works: ['endurance_aerobie', 'explosivite'], why: '8 × (20 s à fond / 10 s de pause) : court et très intense, ça améliore à la fois le cardio et la capacité à tenir un effort violent.',
    tips: ['À réserver aux jours en forme. Échauffe-toi bien avant.'], sources: ['tabata1996', 'milanovic2015'],
    ex: [X('wu-pulse', 1, 300, 0), X('skater-jumps', 8, 20, 10), X('cd-breath', 1, 180, 0)] },
  { id: 'str-force', name: 'Force : charges lourdes', emoji: '🏋️', activity: 'strength', level: 2, minutes: 60, goals: ['force'],
    works: ['force_jambes', 'tirage_vertical', 'poussee_horizontale', 'chaine_posterieure'], why: 'Peu de répétitions, charges lourdes, longs repos : le schéma classique pour gagner en force maximale.',
    tips: ['3 min de repos entre les séries lourdes.', 'Augmente la charge seulement quand toutes les séries sont réussies.'], sources: ['acsm2009', 'schoenfeld2016', 'grgic2018'],
    ex: [X('wu-pulse', 1, 300, 0), X('squat-loaded', 5, 5, 180), X('bench-press', 5, 5, 180), X('pullup-heavy', 4, 5, 180), X('rdl', 3, 6, 150), X('cd-hips', 1, 120, 0)] },
  { id: 'str-dos-pecs', name: 'Haut du corps équilibré', emoji: '💪', activity: 'strength', level: 1, minutes: 45, goals: ['force', 'forme'],
    works: ['tirage_vertical', 'tirage_horizontal', 'poussee_horizontale', 'poussee_verticale', 'stabilite_epaules'], why: 'Autant de tirage que de poussée pour garder des épaules solides et équilibrées.',
    tips: ['Contrôle la descente (2 à 3 secondes).'], sources: ['acsm2009', 'lauersen2014'],
    ex: [X('wu-mob-upper', 1, 10, 0), X('pullup', 4, 8, 120), X('pushup', 4, 12, 90), X('inverted-row', 3, 10, 90), X('shoulder-press', 3, 10, 90), X('face-pull', 3, 15, 60)] },
  // ── Escalade ──
  { id: 'clb-maxhangs', name: 'Suspensions max à la poutre', emoji: '✋', activity: 'climbing_boulder', level: 2, minutes: 40, goals: ['climb', 'force'],
    works: ['force_doigts'], why: '5 suspensions de 10 s, lourdes, avec de longs repos : la méthode la mieux étudiée pour gagner en force des doigts.',
    tips: ['Échauffe les doigts progressivement avant.', 'Arrête à la moindre douleur dans un doigt.'], sources: ['lopez2012', 'medernach2015', 'schoffl2006'],
    ex: [X('wu-climb', 1, 8, 0), X('wu-hang', 1, 60, 60), X('hang-max', 5, 10, 180), X('scap-pullup', 3, 8, 60), X('cd-forearm', 1, 120, 0)] },
  { id: 'clb-repeaters', name: 'Suspensions 7/3 (résistance des doigts)', emoji: '🔋', activity: 'climbing_route', level: 1, minutes: 35, goals: ['climb', 'endurance'],
    works: ['endurance_doigts', 'force_doigts'], why: '7 s suspendu, 3 s de pause, 6 fois : pour tenir plus longtemps sur les prises sans « bouteille ».',
    tips: ['Prise confortable : la dernière suspension doit rester propre.'], sources: ['medernach2015', 'lopez2012'],
    ex: [X('wu-climb', 1, 8, 0), X('wu-hang', 1, 60, 60), X('hang-repeaters', 4, 60, 180), X('finger-extensions', 2, 20, 45), X('cd-forearm', 1, 120, 0)] },
  { id: 'clb-technique', name: 'Pieds précis et dalle', emoji: '🦶', activity: 'climbing_boulder', level: 0, minutes: 45, goals: ['climb'],
    works: ['technique_pieds', 'equilibre', 'technique_escalade'], why: 'Pieds silencieux, précision et équilibre : une gestuelle efficace et la stabilité distinguent les meilleurs grimpeurs.',
    tips: ['Pose chaque pied sans bruit et sans le repositionner.'], sources: ['saul2019'],
    ex: [X('wu-climb', 1, 8, 0), X('dalle-pieds-silencieux', 3, 180, 90), X('dalle-precision', 3, 8, 60), X('dalle-equilibre-un-pied', 3, 6, 60), X('dalle-transferts', 3, 6, 60), X('cd-hips', 1, 120, 0)] },
  { id: 'clb-4x4', name: '4 × 4 blocs', emoji: '🧗', activity: 'climbing_boulder', level: 1, minutes: 45, goals: ['climb', 'endurance'],
    works: ['endurance_doigts', 'endurance_aerobie', 'technique_escalade'], why: 'Quatre blocs faciles enchaînés, 4 fois : la résistance nécessaire pour enchaîner les mouvements sans perdre la technique.',
    tips: ['Choisis des blocs 2 à 3 niveaux sous ton max.'], sources: ['saul2019'],
    ex: [X('wu-climb', 1, 8, 0), X('four-by-four', 4, 4, 240), X('cd-forearm', 1, 120, 0)] },
  { id: 'clb-epaules', name: 'Épaules solides (grimpeurs)', emoji: '🛡️', activity: 'climbing_boulder', level: 0, minutes: 25, goals: ['climb', 'sante'],
    works: ['stabilite_epaules', 'controle_scapulaire'], why: 'Le renforcement réduit nettement le risque de blessure ; les épaules des grimpeurs travaillent surtout en tirage, on rééquilibre.',
    tips: ['Charges légères, mouvements lents et contrôlés.'], sources: ['lauersen2014'],
    ex: [X('wu-scap-floor', 1, 10, 0), X('band-pull-apart', 3, 15, 45), X('external-rotation', 3, 12, 45), X('ytw', 3, 8, 45), X('scap-pullup', 3, 8, 60), X('pushup', 2, 10, 60)] },
  // ── Santé, mobilité, équilibre ──
  { id: 'mob-avant', name: 'Mobilité avant l’effort', emoji: '🧘', activity: 'conditioning', level: 0, minutes: 15, goals: ['mobilite', 'forme', 'climb'],
    works: ['mobilite_hanches', 'mobilite_epaules'], why: 'Des mouvements actifs plutôt que de longs étirements tenus : on gagne en amplitude sans perdre en performance.',
    tips: ['Garde les étirements tenus longtemps pour après la séance.'], sources: ['behm2016'],
    ex: [X('wu-mob-lower', 1, 10, 0), X('wu-mob-upper', 1, 10, 0), X('mob-hips', 2, 60, 15), X('mob-thoracic', 2, 10, 15), X('mob-ankles', 2, 10, 15)] },
  { id: 'eq-seniors', name: 'Équilibre et force (60 ans et plus)', emoji: '⚖️', activity: 'conditioning', level: 0, minutes: 30, goals: ['sante', 'forme'],
    works: ['equilibre', 'force_jambes', 'gainage_lateral'], why: 'L’équilibre et le renforcement des jambes réduisent les chutes chez les plus de 60 ans : c’est l’un des effets les mieux démontrés.',
    tips: ['Garde un appui (mur, chaise) à portée de main.'], sources: ['sherrington2019', 'who2020'],
    ex: [X('wu-pulse', 1, 240, 0), X('dalle-mobilite-hanches', 2, 45, 30), X('single-leg-rdl', 3, 8, 60), X('calf-raise', 3, 12, 45), X('side-plank', 2, 20, 45), X('cd-breath', 1, 120, 0)] },
  { id: 'wu-complet', name: 'Échauffement complet anti-blessures', emoji: '🔥', activity: 'conditioning', level: 0, minutes: 15, goals: ['sante', 'forme', 'endurance', 'force', 'climb'],
    works: ['equilibre', 'force_jambes', 'gainage_anterieur'], why: 'Course douce, renforcement, équilibre et sauts contrôlés : ce type d’échauffement a réduit les blessures dans un grand essai.',
    tips: ['À faire avant les séances intenses.'], sources: ['soligard2008', 'lauersen2014'],
    ex: [X('wu-pulse', 1, 300, 0), X('wu-core', 1, 60, 0), X('single-leg-rdl', 2, 8, 30), X('wu-jumps', 1, 60, 0)] },
  // ── Natation ──
  { id: 'swim-base', name: 'Nage technique et continue', emoji: '🏊', activity: 'swimming', level: 0, minutes: 40, goals: ['endurance', 'forme', 'sante'],
    works: ['technique_nage', 'endurance_aerobie'], why: 'Des éducatifs pour nager plus facilement, puis de la nage continue à allure confortable pour l’endurance.',
    tips: ['Respire tous les 3 temps si possible.'], sources: ['who2020'],
    ex: [X('swim-warm', 1, 300, 0), X('swim-drills', 4, 2, 30), X('swim-breathing', 4, 2, 30), X('swim-endurance', 1, 900, 0)] },
];

/** Séance jouable à partir d'une entrée du catalogue (exercices de la bibliothèque, consignes comprises). */
export function buildSession(entry) {
  const exercises = entry.ex.map((x, i) => {
    const lib = byId(x.libId); if (!lib) return null;
    const time = lib.mode === 'time', block = x.block || (lib.role === 'warmup' ? 'warmup' : lib.role === 'cool' ? 'cool' : 'main');
    return normalizeEx({ ...lib, id: uid(), libId: lib.id, block, ok: lib.cues, bad: lib.bad, sets: x.sets, rest: x.rest, ...(time ? { secMin: x.amount, secMax: x.amount } : { repsMin: x.amount, repsMax: x.amount }), note: i === 0 && entry.tips?.[0] ? entry.tips[0] : '' });
  }).filter(Boolean);
  return normalizeSession({ id: 'cat-' + entry.id, name: entry.name, emoji: entry.emoji, activity: entry.activity, goal: entry.goals[0] || '', exercises, notes: [{ title: 'Pourquoi cette séance', text: [entry.why, ...(entry.tips || []).map((t) => '• ' + t)].filter(Boolean).join('\n') }] });
}
/** Matériel nécessaire à une séance du catalogue. */
export const needsOf = (entry) => [...new Set(entry.ex.flatMap((x) => byId(x.libId)?.needs || []))];

/**
 * Tri « pour toi » : sport pratiqué, objectifs, points faibles, niveau, matériel disponible.
 * Retourne des raisons lisibles (pourquoi elle est proposée).
 */
export function rankCatalog({ acts = [], goals = [], weak = [], level = 0, equipment = null } = {}, list = CATALOG) {
  return list.map((e) => {
    let s = 0; const why = [];
    const sportOk = acts.includes(e.activity) || (e.activity === 'conditioning') || (e.activity.startsWith('climbing') && acts.some((a) => a.startsWith('climbing')));
    if (acts.includes(e.activity)) { s += 3; why.push('ton sport'); } else if (sportOk) s += 1;
    const g = e.goals.filter((x) => goals.includes(x)); if (g.length) { s += 2 * g.length; why.push('tes objectifs'); }
    const w = e.works.filter((c) => weak.includes(c)); if (w.length) { s += 1.5 * w.length; why.push(`travaille ${w.map((c) => CAPACITIES[c]?.label.toLowerCase()).join(', ')}`); }
    if (e.level > level + 1) { s -= 3; why.push('niveau un peu élevé'); } else if (e.level <= level) s += 0.5;
    const missing = equipment ? needsOf(e).filter((n) => !equipment.has(n)) : [];
    if (missing.length) s -= 4;
    if (!sportOk) s -= 2;
    return { entry: e, score: Math.round(s * 10) / 10, why, missing };
  }).sort((a, b) => b.score - a.score);
}

/* ───────── Classement des exercices par catégorie ───────── */
export const EX_CATEGORIES = [['tirer', '🧗 Tirage'], ['pousser', '💪 Poussée'], ['jambes', '🦵 Jambes'], ['gainage', '🧱 Gainage'], ['doigts', '✋ Doigts'], ['epaules', '🛡️ Épaules'], ['cardio', '❤️ Cardio'], ['mobilite', '🧘 Mobilité']];
const catOf = (x) => (['run', 'swim', 'endurance'].includes(x.kind) ? 'cardio' : ['mobility', 'mobilize', 'cool'].includes(x.kind) ? 'mobilite' : x.group);
/**
 * Pour chaque catégorie, les exercices les plus intéressants POUR TOI : ce qu'ils travaillent de tes besoins
 * (objectifs, faiblesses), adaptés à ton niveau et à ton matériel. Chaque ligne dit pourquoi.
 */
export function rankExercises({ need = {}, level = 0, equipment = null, acts = [] } = {}, lib = LIBRARY) {
  const out = {};
  for (const [cat] of EX_CATEGORIES) {
    const pool = lib.filter((x) => x.role === 'main' && !x.hidden && catOf(x) === cat && (!acts.length || x.acts.some((a) => acts.includes(a) || a === 'conditioning')));
    out[cat] = pool.map((x) => {
      let s = 0; const hits = [];
      for (const [c, w] of Object.entries(x.caps || {})) { const n = need[c] || 0.3; s += w * n; if ((need[c] || 0) >= 0.8 && w >= 0.5) hits.push(CAPACITIES[c]?.label || c); }
      const lvl = x.minLevel || 0; if (lvl > level) s -= 1.2 * (lvl - level);
      const missing = equipment ? (x.needs || []).filter((n) => !equipment.has(n)) : [];
      if (missing.length) s -= 2;
      return { lib: x, score: Math.round(s * 100) / 100, hits: [...new Set(hits)].slice(0, 3), missing, tooHard: lvl > level };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
  }
  return out;
}
