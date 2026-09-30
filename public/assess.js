// assess.js — bilan physique personnalisé : quelles mesures comptent pour TES objectifs, ce que l'app sait déjà,
// ce qui manque, et comment faire chaque test. Tout part de données réelles (déclarées ou mesurées) : rien n'est inventé,
// un repère de niveau n'est affiché que si la métrique en a un (sinon : suivi de ta progression seulement).
// Pur JavaScript, sans DOM. N'importe que le modèle et les cotations (aucune dépendance circulaire avec brain.js).

import { METRICS, SKILLS } from './model.js';
import { sortedLevels, gradeSnapshot, toReference, levelFromReference } from './grading.js';

const DAY = 86400000;
/** Envies du questionnaire (config.main.goals) : libellé et ce qu'on cherche à savoir. */
export const ENVIES = {
  climb: { label: 'Progresser en escalade', emoji: '🧗', know: 'ton niveau de grimpe, tes doigts, ton tirage et ton gainage' },
  force: { label: 'Devenir plus fort(e)', emoji: '💪', know: 'ta force de tirage, de poussée, de jambes et de gainage' },
  endurance: { label: 'Plus d’endurance / de cardio', emoji: '🔋', know: 'ta capacité à tenir un effort long' },
  mobilite: { label: 'Être plus souple', emoji: '🧘', know: 'la souplesse de tes hanches et de tes épaules' },
  forme: { label: 'Rester en forme', emoji: '🙂', know: 'un état général : force, gainage, cardio, souplesse' },
  figure: { label: 'Réussir une figure', emoji: '🤸', know: 'les prérequis de la figure choisie' },
  poids: { label: 'Perdre du poids', emoji: '⚖️', know: 'l’évolution de ton poids, de ton tour de taille et de ton cardio' },
  sante: { label: 'Être en meilleure santé', emoji: '❤️', know: 'des repères simples de santé et de forme' },
};
/** Protocoles pour les métriques qui n'en ont pas dans le modèle. */
export const PROTOCOL = {
  max_bloc: 'Le bloc le plus dur que tu as réussi (enchaîné du départ à la fin) ces derniers mois, dans la cotation de ta salle.',
  max_voie: 'La voie la plus dure que tu as réussie en tête ces derniers mois.',
  planche_avant_bras: 'Sur les avant-bras, corps aligné des épaules aux chevilles. Chronomètre jusqu’à ce que les hanches tombent ou montent.',
  gainage_lateral: 'Sur un avant-bras, corps aligné, hanches hautes. Chronomètre chaque côté et note le plus faible.',
  souplesse_avant: 'Assis jambes tendues (ou debout), penche-toi en avant sans à-coup. Mesure en cm : positif si tes doigts dépassent tes orteils, négatif s’ils n’y arrivent pas.',
  pistol_squat: 'Sur une jambe, descends le plus bas possible en contrôle et remonte sans appui. Compte le côté le plus faible.',
  saut_vertical: 'Debout contre un mur, bras tendu : marque la hauteur. Saute et marque le point le plus haut. L’écart est ta détente.',
  vma: 'Test progressif sur piste ou application (demi-Cooper, VAMEVAL) : vitesse du dernier palier tenu.',
  nage_400: 'Après échauffement, 400 m nage libre à allure régulière la plus rapide possible. Note le temps en secondes.',
  handstand_mur: 'Face au mur ou dos au mur, bras tendus, épaules ouvertes. Chronomètre jusqu’à la perte de l’alignement.',
  releves_jambes: 'Suspendu à la barre, monte les jambes tendues à l’horizontale sans balancer. Compte les répétitions propres.',
  l_sit: 'Sur des parallettes ou le sol, bras tendus, jambes tendues à l’horizontale. Chronomètre.',
  front_lever_groupe: 'Suspendu, corps horizontal genoux ramenés sur la poitrine, bras tendus. Chronomètre.',
  drapeau_vertical: 'Sur un poteau, mains écartées, corps vertical décollé du poteau. Chronomètre.',
  body_weight: 'Le matin, après être passé aux toilettes, avant de manger, même balance.',
};
/** Tests d'une envie : [métrique, pourquoi]. `when` : seulement si l'une de ces activités est suivie. */
const BATTERY = {
  climb: [['max_bloc', 'ton niveau actuel en bloc', ['climbing_boulder']], ['max_voie', 'ton niveau actuel en voie', ['climbing_route']], ['suspension_20mm', 'la force de tes doigts'], ['max_tractions', 'ton tirage'], ['blocage_90', 'tes blocages'], ['hollow_hold', 'ton gainage (pieds qui restent sur le mur)'], ['souplesse_avant', 'la mobilité des hanches (pieds hauts)']],
  force: [['max_tractions', 'ton tirage'], ['max_pompes', 'ta poussée'], ['max_dips', 'ta poussée verticale'], ['pistol_squat', 'la force de tes jambes'], ['hollow_hold', 'ton gainage'], ['squat_1rm', 'ta charge max au squat', ['strength']], ['couche_1rm', 'ta charge max au développé couché', ['strength']]],
  endurance: [['course_5k', 'ton endurance en course', ['running']], ['nage_400', 'ton endurance en natation', ['swimming']], ['cooper_12', 'ton endurance générale'], ['fc_repos', 'ton cœur au repos (baisse souvent avec l’endurance)']],
  mobilite: [['souplesse_avant', 'la souplesse de l’arrière des jambes et des hanches'], ['mains_dos', 'la mobilité de tes épaules'], ['pistol_squat', 'la mobilité des chevilles et des hanches en charge']],
  forme: [['max_pompes', 'ta force générale'], ['planche_avant_bras', 'ton gainage'], ['cooper_12', 'ton cardio'], ['souplesse_avant', 'ta souplesse'], ['fc_repos', 'ton cœur au repos']],
  poids: [['body_weight', 'l’évolution de ton poids'], ['tour_taille', 'l’évolution de ton tour de taille (souvent plus parlant que le poids)'], ['cooper_12', 'ton cardio'], ['fc_repos', 'ton cœur au repos']],
  sante: [['fc_repos', 'ton cœur au repos'], ['planche_avant_bras', 'ton gainage (dos)'], ['souplesse_avant', 'ta souplesse'], ['cooper_12', 'ton cardio']],
};
/** Tests déconseillés quand une zone est à ménager, avec leur remplaçant (ou rien). */
const ZONE_BLOCK = {
  fingers: { suspension_20mm: 'dead_hang', suspension_lestee: 'dead_hang' },
  shoulders: { max_dips: 'planche_avant_bras', handstand_mur: '', pompes_piquees: '', traction_lestee: '' },
  elbows: { traction_lestee: '', traction_un_bras: '', blocage_90: 'hollow_hold' },
  knees: { pistol_squat: 'gainage_lateral', saut_vertical: '', saut_longueur: '' },
};
/** Ce que mesure vraiment le test de remplacement (il ne mesure pas la même chose que l'original). */
const SWAP_WHY = { dead_hang: 'ta tenue à la barre, sans charger fort les doigts', planche_avant_bras: 'ton gainage, sans charger les épaules', hollow_hold: 'ton gainage, sans charger les coudes', gainage_lateral: 'ta stabilité, sans charger les genoux' };
export const ZONE_WORD = { fingers: 'doigts', shoulders: 'épaules', elbows: 'coudes', knees: 'genoux' };

/**
 * Liste des tests utiles, à partir des réponses (utilisable avant même l'enregistrement du profil).
 * envies : ids d'ENVIES ; acts : activités ; avoid : { fingers: true, … } ; skillIds : figures visées.
 * Retourne [{ metricId, why, envie, swapped?:{ from, zone } }] sans doublon, dans l'ordre d'importance.
 */
export function batteryFor({ envies = [], acts = [], avoid = {}, skillIds = [] } = {}) {
  const out = [], seen = new Set();
  const zones = Object.keys(ZONE_BLOCK).filter((z) => avoid?.[z]);
  const add = (metricId, why, envie, swapped = null) => {
    if (!METRICS[metricId] || seen.has(metricId)) return;
    seen.add(metricId); out.push({ metricId, why, envie, ...(swapped ? { swapped } : {}) });
  };
  const list = [...new Set(envies.filter((e) => BATTERY[e] || e === 'figure'))];
  if (!list.length && acts.some((a) => a.startsWith('climbing'))) list.push('climb');
  if (!list.length) list.push('forme');
  for (const e of list) {
    const rows = e === 'figure'
      ? skillIds.flatMap((id) => (SKILLS[id]?.criteria || []).map((c) => [c.metric, `un prérequis de « ${SKILLS[id].label} »`]))
      : BATTERY[e];
    for (const [id, why, when] of rows) {
      if (when && !when.some((a) => acts.includes(a))) continue;
      const z = zones.find((k) => id in ZONE_BLOCK[k]);
      if (z) { const alt = ZONE_BLOCK[z][id]; if (alt) add(alt, `${SWAP_WHY[alt] || why} (test adapté : ${ZONE_WORD[z]} à ménager)`, e, { from: id, zone: z }); continue; }
      add(id, why, e);
    }
  }
  return out;
}

const latest = (ctx, id) => (ctx.perfs || []).filter((p) => p.metricId === id).sort((a, b) => (b.date || 0) - (a.date || 0))[0] || null;
const tierOf = (m, v) => { if (!m?.tiers || v == null) return null; const [a, b] = m.tiers; return m.dir === -1 ? (v > a ? 0 : v >= b ? 1 : 2) : v < a ? 0 : v <= b ? 1 : 2; };
export const TIER_WORD = ['débutant', 'intermédiaire', 'avancé'];
const SRC = { measured: 'mesuré', declared: 'déclaré', session: 'relevé en séance' };
export const fmtVal = (m, p) => (p?.grade ? `${p.grade.label} (${p.grade.systemName})` : p?.value != null ? `${Math.round(p.value * 100) / 100} ${m.unit === 'reps' ? 'rép.' : m.unit}` : '');

/** Envies et contexte lus dans le profil. */
export function profileInputs(ctx) {
  const main = ctx.config?.main || {};
  const envies = Array.isArray(main.goals) ? main.goals.filter((g) => ENVIES[g]) : [];
  const skillIds = (ctx.goals || []).filter((g) => g.type === 'skill' && (g.status || 'active') === 'active' && SKILLS[g.skillId]).map((g) => g.skillId);
  if (skillIds.length && !envies.includes('figure')) envies.push('figure');
  return { envies, acts: Object.keys(ctx.activities || {}), avoid: ctx.settings?.avoid || {}, skillIds };
}

/**
 * Bilan : pour chaque test utile → état (connu / ancien / « je ne sais pas » / jamais), valeur, source, repère indicatif.
 * coverage : part des tests utiles connus et récents (< maxAge jours).
 */
export function assessment(ctx, { maxAge = 90 } = {}) {
  const inp = profileInputs(ctx), rows = [];
  for (const t of batteryFor(inp)) {
    const m = ctx.metrics?.[t.metricId] || METRICS[t.metricId], p = latest(ctx, t.metricId);
    const age = p && !p.unknown ? Math.floor(((ctx.now || Date.now()) - (p.date || 0)) / DAY) : null;
    const state = !p ? 'never' : p.unknown ? 'unknown' : age > maxAge ? 'old' : 'known';
    // Cotation : repère via l'échelle de référence (seulement si une correspondance existe ; sinon aucun repère).
    const ref = p && !p.unknown && m.kind === 'grade' && p.grade ? toReference(p.grade, ctx.systems, m.gradeActivity || 'bloc') : null;
    const tier = p && !p.unknown ? (ref ? levelFromReference(ref.index, m.gradeActivity || 'bloc') : tierOf(m, p.value)) : null;
    rows.push({ ...t, label: m.label, unit: m.unit, kind: m.kind, state, age, value: p && !p.unknown ? fmtVal(m, p) : '', source: p ? SRC[p.source] || 'déclaré' : '', tier, tierText: tier != null ? `repère indicatif : ${TIER_WORD[tier]}` : p && !p.unknown && m.kind !== 'grade' ? 'suivi de ta progression (pas de repère de niveau)' : '', test: m.test || PROTOCOL[t.metricId] || '' });
  }
  const known = rows.filter((r) => r.state === 'known').length;
  const todo = rows.filter((r) => r.state !== 'known');
  const byEnvie = {};
  for (const r of rows) (byEnvie[r.envie] ||= []).push(r);
  return { envies: inp.envies, rows, byEnvie, known, total: rows.length, coverage: rows.length ? Math.round((known / rows.length) * 100) : 0, todo, zones: Object.keys(ZONE_WORD).filter((z) => inp.avoid?.[z]) };
}
/** Ce que l'app peut dire de TA condition, uniquement à partir des repères connus (jamais de conclusion sans donnée). */
export function conditionFacts(a) {
  const strong = a.rows.filter((r) => r.state === 'known' && r.tier === 2), weak = a.rows.filter((r) => r.state === 'known' && r.tier === 0);
  const mid = a.rows.filter((r) => r.state === 'known' && r.tier === 1);
  const lines = [];
  for (const r of strong) lines.push({ kind: 'strong', text: `${r.label} : ${r.value} (${r.source}) — au-dessus du repère « avancé ».` });
  for (const r of weak) lines.push({ kind: 'weak', text: `${r.label} : ${r.value} (${r.source}) — sous le repère « intermédiaire » : c’est là que le travail rapporte le plus.` });
  for (const r of mid) lines.push({ kind: 'mid', text: `${r.label} : ${r.value} (${r.source}) — dans la zone « intermédiaire ».` });
  const missing = a.rows.filter((r) => r.state !== 'known');
  return { lines, missing, enough: a.coverage >= 50, text: a.total ? `L’app connaît ${a.known} des ${a.total} repères utiles pour tes objectifs (${a.coverage} %).` : 'Choisis un objectif pour savoir quoi mesurer.' };
}

/** Prochaine marche réaliste, calculée depuis la dernière valeur connue (jamais depuis rien). */
export function nextStep(ctx, metricId) {
  const m = ctx.metrics?.[metricId] || METRICS[metricId], p = latest(ctx, metricId);
  if (!m || !p || p.unknown) return null;
  if (m.kind === 'grade' && p.grade) {
    const sys = ctx.systems?.[p.grade.systemId], levels = sortedLevels(sys), i = levels.findIndex((l) => l.id === p.grade.levelId);
    if (i < 0 || i >= levels.length - 1) return null;
    const j = i + 1;
    return { type: 'grade', metricId, gradeTarget: gradeSnapshot(sys, levels[j].id), label: `Réussir ${levels[j].label} en ${m.gradeActivity === 'voie' ? 'voie' : 'bloc'}`, from: p.grade.label, why: `Ton maximum noté est ${p.grade.label} : le niveau juste au-dessus dans la même cotation.` };
  }
  if (p.value == null || (m.dir === -1 && !m.tiers)) return null; // poids, tour de taille, cœur au repos : aucune cible proposée d'office
  const v = p.value;
  let target;
  if (m.dir === -1) target = Math.round(v * 0.95 * 10) / 10;
  else if (m.unit === 'reps') target = Math.max(v + 2, Math.round(v * 1.25));
  else if (m.unit === 's') target = Math.max(v + 5, Math.round(v * 1.3 / 5) * 5);
  else target = Math.round(v * 1.1 * 10) / 10;
  const u = m.unit === 'reps' ? 'rép.' : m.unit;
  return { type: 'metric', metricId, target, unit: m.unit, label: `${m.label} : ${target} ${u}`, from: `${v} ${u}`, why: m.dir === -1 ? `Dernière valeur ${v} ${u} : environ 5 % de mieux.` : `Dernière valeur ${v} ${u} : une marche d’environ ${m.unit === 'reps' ? '25' : m.unit === 's' ? '30' : '10'} %, atteignable en quelques semaines de travail régulier (indicatif).` };
}
/** Objectifs précis proposés à partir des envies et des mesures connues (l'utilisateur choisit ; rien n'est ajouté seul). */
export function suggestedGoals(ctx, limit = 4) {
  const a = assessment(ctx), have = new Set((ctx.goals || []).filter((g) => (g.status || 'active') === 'active').map((g) => g.metricId).filter(Boolean));
  const out = [];
  for (const r of a.rows) {
    if (r.state !== 'known' || have.has(r.metricId)) continue;
    const s = nextStep(ctx, r.metricId);
    if (s && !out.some((x) => x.metricId === s.metricId)) out.push({ ...s, envie: r.envie });
    if (out.length >= limit) break;
  }
  return out;
}
/** Les tests à faire, prêts pour un parcours guidé (échauffement conseillé avant les tests d'effort). */
export function guidedTests(ctx, max = 6) {
  const a = assessment(ctx);
  return a.todo.filter((r) => r.kind !== 'grade').slice(0, max);
}
