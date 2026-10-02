// physique.js — objectifs de silhouette (forme en V, abdos visibles, bras, jambes, corps plus sec…) : ce que chaque
// choix veut dire en muscles à travailler, en mensurations à prendre, et en volume d'entraînement par muscle.
// Rien n'est promis : la forme du corps dépend aussi de l'alimentation, du sommeil et de la génétique ; l'app le dit.
// Aucun diagnostic, aucune norme imposée. Sans DOM, testé.
import { MUSCLE_GROUPS } from './intentions.js';
import { MUSCLES } from './model.js';

const DAY = 86400000;
/** Choix de silhouette : groupes de muscles à développer, mensurations utiles, conseil honnête. */
export const PHYSIQUE = {
  v: { label: 'Forme en V (dos large, taille fine)', emoji: '🔻', groups: ['dos', 'epaules'], measures: ['tour_epaules', 'tour_taille'],
    tip: 'Le V vient d’un dos large (grand dorsal) et d’épaules rondes (deltoïdes latéraux), avec une taille qui reste fine : tirages verticaux, élévations latérales, et un peu de cardio.' },
  abs: { label: 'Abdos visibles', emoji: '🍫', groups: ['abdos'], measures: ['tour_taille', 'masse_grasse'], fat: true,
    tip: 'Les abdos se voient surtout quand le taux de gras du ventre baisse (alimentation, activité, sommeil). Le gainage les renforce et les dessine, mais ne fait pas « fondre » le gras à cet endroit.' },
  bras: { label: 'Bras plus gros', emoji: '💪', groups: ['bras'], measures: ['tour_bras'],
    tip: 'Le triceps fait environ deux tiers du volume du bras : travaille-le autant que le biceps.' },
  pecs: { label: 'Pectoraux plus développés', emoji: '🛡️', groups: ['pecs', 'epaules'], measures: ['tour_poitrine'],
    tip: 'Développés (barre, haltères, machine) et écartés, sous plusieurs angles (plat, incliné).' },
  epaules: { label: 'Épaules plus larges', emoji: '🏔️', groups: ['epaules'], measures: ['tour_epaules'],
    tip: 'Les deltoïdes latéraux font la largeur : élévations latérales (haltères, poulie), et l’arrière d’épaule pour l’équilibre.' },
  jambes: { label: 'Jambes plus musclées', emoji: '🦵', groups: ['cuisses', 'mollets'], measures: ['tour_cuisse', 'tour_mollet'],
    tip: 'Squat ou presse, fentes, leg curl et mollets : les jambes demandent souvent plus de séries que le haut.' },
  fessiers: { label: 'Fessiers plus galbés', emoji: '🍑', groups: ['fessiers'], measures: ['tour_hanches'],
    tip: 'Hip thrust, soulevé de terre jambes tendues, fentes et abductions travaillent les fessiers sous plusieurs angles.' },
  sec: { label: 'Corps plus sec (moins de gras)', emoji: '🔥', groups: [], measures: ['masse_grasse', 'tour_taille', 'body_weight'], fat: true,
    tip: 'Garder la musculation pour conserver le muscle, ajouter du mouvement (cardio, pas quotidiens) ; le gras baisse surtout avec l’alimentation.' },
  fin: { label: 'Silhouette affinée', emoji: '🌿', groups: [], measures: ['tour_taille', 'tour_hanches', 'body_weight'], fat: true,
    tip: 'Mouvement régulier, circuits et renforcement de tout le corps ; les mensurations montrent mieux l’évolution que le poids seul.' },
  posture: { label: 'Meilleure posture', emoji: '🧍', groups: ['dos', 'lombaires'], measures: ['mains_dos'],
    tip: 'Haut du dos (rowing, face pull), arrière d’épaule, gainage et mobilité thoracique.' },
};
export const PHYSIQUE_KEYS = Object.keys(PHYSIQUE);
/** Sources citées (sources.js). */
export const PHYSIQUE_SOURCES = ['schoenfeld2017', 'schoenfeld2016', 'vispute2011'];

export const cleanPhysique = (list) => [...new Set((Array.isArray(list) ? list : []).filter((k) => PHYSIQUE[k]))];
/** Groupes de muscles visés par les choix (MUSCLE_GROUPS d'intentions.js). */
export const physiqueGroups = (choices = []) => [...new Set(cleanPhysique(choices).flatMap((k) => PHYSIQUE[k].groups))];
/** Mensurations utiles : [metricId, pourquoi]. */
export function physiqueMeasures(choices = []) {
  const out = [], seen = new Set();
  for (const k of cleanPhysique(choices)) for (const id of PHYSIQUE[k].measures) if (!seen.has(id)) { seen.add(id); out.push([id, `pour suivre « ${PHYSIQUE[k].label.toLowerCase()} »`]); }
  return out;
}
/** Le choix vise-t-il surtout à perdre du gras ? */
export const wantsLessFat = (choices = []) => cleanPhysique(choices).some((k) => PHYSIQUE[k].fat);

/** Repère de volume pour prendre du muscle : séries « difficiles » (proches de l'échec) par muscle et par semaine. */
export const SETS_RANGE = [10, 20];
/**
 * Séries faites cette semaine (7 derniers jours) par groupe de muscles : séries où le groupe travaille en premier
 * (une séance où il travaille en second compte pour moitié). Retourne [{ id, label, sets, state, text }].
 */
export function weeklySets(ctx, groups = MUSCLE_GROUPS.map((g) => g[0]), { days = 7, exMuscles } = {}) {
  const now = ctx.now || Date.now(), vol = {};
  for (const h of ctx.history || []) {
    if (now - h.startedAt > days * DAY || h.startedAt > now) continue;
    for (const ex of h.data?.exercises || []) {
      const n = (ex.sets || []).filter((s) => s && s.done !== false).length; if (!n) continue;
      const m = exMuscles ? exMuscles(ex, ctx) : { prim: ex.prim || [], sec: ex.sec || [] };
      const gp = new Set((m.prim || []).map(groupOf).filter(Boolean)), gs = new Set((m.sec || []).map(groupOf).filter((g) => g && !gp.has(g)));
      for (const g of gp) vol[g] = (vol[g] || 0) + n;
      for (const g of gs) vol[g] = (vol[g] || 0) + n * 0.5;
    }
  }
  const [lo, hi] = SETS_RANGE;
  return groups.map((id) => {
    const g = MUSCLE_GROUPS.find((x) => x[0] === id); if (!g) return null;
    const sets = Math.round((vol[id] || 0) * 2) / 2;
    const state = sets < lo / 2 ? 'low' : sets < lo ? 'mid' : sets <= hi ? 'ok' : 'high';
    const text = { low: `${sets} série${sets > 1 ? 's' : ''} : peu pour faire grossir ce muscle`, mid: `${sets} séries : encore ${Math.ceil(lo - sets)} pour atteindre le repère`, ok: `${sets} séries : dans le repère (${lo}–${hi})`, high: `${sets} séries : au-dessus de ${hi}, vérifie que tu récupères` }[state];
    return { id, label: g[1], sets, state, text };
  }).filter(Boolean);
}
const groupOf = (muscle) => MUSCLE_GROUPS.find((g) => g[2].includes(muscle))?.[0] || '';

/** Dernière valeur d'une mensuration. */
const last = (ctx, id) => (ctx.perfs || []).filter((p) => p.metricId === id && !p.unknown && Number.isFinite(Number(p.value))).sort((a, b) => (b.date || 0) - (a.date || 0))[0] || null;
const first = (ctx, id) => (ctx.perfs || []).filter((p) => p.metricId === id && !p.unknown && Number.isFinite(Number(p.value))).sort((a, b) => (a.date || 0) - (b.date || 0))[0] || null;
/**
 * Suivi de la silhouette, uniquement à partir des mensurations notées : évolution depuis la première mesure,
 * et rapport épaules / taille quand les deux sont connus (il augmente quand le V se dessine). Rien d'inventé.
 */
export function physiqueTrack(ctx, choices = []) {
  const rows = [];
  for (const [id] of physiqueMeasures(choices)) {
    const a = first(ctx, id), b = last(ctx, id);
    rows.push({ metricId: id, value: b ? Number(b.value) : null, date: b?.date || null, delta: a && b && a !== b ? Math.round((Number(b.value) - Number(a.value)) * 10) / 10 : null, since: a && b && a !== b ? a.date : null });
  }
  const sh = last(ctx, 'tour_epaules'), wa = last(ctx, 'tour_taille');
  const ratio = sh && wa && Number(wa.value) > 0 ? Math.round((Number(sh.value) / Number(wa.value)) * 100) / 100 : null;
  return { rows, ratio, ratioText: ratio ? `Rapport épaules / taille : ${String(ratio).replace('.', ',')} (il augmente quand le V se dessine ; c’est un suivi, pas une norme).` : '' };
}

/** Règles de séance pour une silhouette visée : séries 8–12, repos 1–2 min, muscles ciblés. Chaque règle a sa raison. */
export function physiqueAdjust(goals = [], choices = []) {
  const muscle = goals.includes('muscle') || goals.includes('physique'), groups = physiqueGroups(choices), r = { hypertrophy: false, groups, reasons: [], sources: [] };
  if (muscle) { r.hypertrophy = true; r.sources.push('schoenfeld2017', 'schoenfeld2016'); r.reasons.push('Prise de muscle : séries de 8 à 12 répétitions proches de l’échec, 1 à 2 min de repos, et assez de séries par muscle dans la semaine.'); }
  if (groups.length) r.reasons.push(`Silhouette visée : ${groups.map((g) => MUSCLE_GROUPS.find((x) => x[0] === g)?.[1].toLowerCase()).filter(Boolean).join(', ')} en priorité.`);
  if (wantsLessFat(choices)) { r.sources.push('vispute2011'); r.reasons.push('Moins de gras : on garde la musculation et on ajoute du mouvement ; le gras ne part pas d’un endroit précis en le faisant travailler.'); }
  return r;
}
/** Muscles (ids du modèle) d'une liste de groupes — pour l'anatomie. */
export const groupMuscles = (groups = []) => groups.flatMap((g) => MUSCLE_GROUPS.find((x) => x[0] === g)?.[2] || []).filter((m) => MUSCLES[m]);
