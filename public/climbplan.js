// climbplan.js — structurer une séance d'escalade comme on veut : parties (durée, bloc ou voie, intensité,
// cotations, styles), plusieurs structures proposées par partie, adaptation à ce qui a été fait avant (au choix),
// et mode « objectif de fin de séance » (ex. réussir un U8 en dévers-réglettes) qui construit toute la séance.
// Sans DOM, testé. Les temps sont des estimations simples et affichées ; aucune performance n'est inventée.
import { intentCaps } from './intents.js';
import { sortedLevels, bestReferenceLevel, fromReference, REFERENCE } from './grading.js';
import { normalizeEx, normalizeSession, uid } from './shared.js';
import { sessionMinutes } from './engine.js';
import * as G from './generator.js';
import { ACTIVITIES } from './model.js';
import { partOptions, buildPicked, GUIDE_PARTS } from './guide.js';
import { availableEquipment } from './brain.js';
import { buildWorkPart, workTitle, SPORT_STRUCTS, sportFamily } from './sportplan.js';
import { byId } from './library.js';

export const INTENSITY = { easy: ['🌿', 'Tranquille'], mod: ['🙂', 'Modéré'], hard: ['🔥', 'Intense'], max: ['🚀', 'Max'] };
/** Types de parties : grimpe (bloc ou voie) ou parties du corps (échauffement, renfo, étirements…) construites par le générateur. */
export const CLIMB_PARTS = {
  warmup: ['🔥', 'Échauffement'], climb: ['🧗', 'Grimpe'], ...GUIDE_PARTS, strength: ['🏋️', 'Renforcement'], core: ['🧱', 'Gainage'],
  mobility: ['🤸', 'Mobilité'], stretch: ['🧘', 'Étirements'], cool: ['🌬️', 'Retour au calme'],
};
/** Conseils de place pour chaque structure de grimpe (mode guidé). */
export const STRUCT_TIPS = {
  limit: ['force des doigts', 'puissance'], max: ['force des doigts', 'résistance'], pyramid: ['progression en niveau', 'technique'], styles: ['polyvalence', 'technique'],
  fourx4: ['endurance de puissance', 'résistance des avant-bras'], enchain: ['résistance', 'endurance'], volume: ['technique', 'endurance'], technique: ['placement', 'pieds'],
};
export const STRUCT_WHEN = {
  limit: 'Tôt dans la séance, frais, juste après l’échauffement en grimpant.', max: 'Tôt dans la séance, frais, avec de longs repos.',
  pyramid: 'Bien en début de partie : on monte en niveau progressivement.', styles: 'Au milieu de la séance, quand tu es chaud mais pas fatigué.',
  fourx4: 'Plutôt en fin de séance : l’endurance fatigue tout le reste.', enchain: 'Plutôt en fin de séance : la résistance vient après la force.',
  volume: 'Parfait pour s’échauffer ou récupérer après l’intense.', technique: 'En début de séance, ou fatigué pour garder la qualité.',
};
// Styles qui chargent surtout les doigts, ou la puissance.
const FINGER = new Set(['st-reglettes', 'st-petites-prises', 'st-trous', 'st-plats', 'st-pinces']);
const POWER = new Set(['st-devers', 'st-toit', 'st-dynamique', 'st-compression', 'st-coordination']);
const GENTLE = ['st-dalle', 'st-vertical', 'st-talons', 'st-statique'];
const IFACT = { easy: 0.3, mod: 0.6, hard: 1, max: 1.2 };

/** Système de cotation à utiliser : celui du lieu, sinon un système perso de l'activité, sinon la référence. */
export function pickSystem(ctx, kind = 'bloc', envId = '') {
  const env = ctx.envs?.find((e) => e.id === envId) || ctx.defEnv;
  const sys = ctx.systems || {};
  if (env?.gradeSys && sys[env.gradeSys]?.activity === kind) return sys[env.gradeSys];
  const mine = Object.values(sys).filter((s) => !s.builtin && s.activity === kind && s.levels?.length);
  return mine[0] || sys[REFERENCE[kind]] || null;
}
/** Maximum connu dans ce système (index), d'après les performances notées ; null si inconnu (on n'invente pas). */
export function knownMax(ctx, sysObj, kind = 'bloc') {
  const levels = sortedLevels(sysObj), perfs = (ctx.perfs || []).filter((p) => p.metricId === (kind === 'voie' ? 'max_voie' : 'max_bloc') && p.grade && !p.unknown);
  const same = perfs.filter((p) => p.grade.systemId === sysObj?.id).map((p) => levels.findIndex((l) => l.id === p.grade.levelId)).filter((i) => i >= 0);
  if (same.length) return Math.max(...same);
  const ref = bestReferenceLevel(perfs, ctx.systems, kind), lv = ref ? fromReference(ref.index, sysObj, kind) : null;
  const index = lv ? levels.findIndex((l) => l.id === lv.id) : -1;
  return index >= 0 ? index : null;
}
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));
const labelOf = (levels, i) => levels[clampI(i, levels.length)]?.label || '';
const range = (levels, a, b) => { const x = labelOf(levels, a), y = labelOf(levels, b); return x === y ? x : `${x}–${y}`; };
const styleNames = (ids, styles) => ids.map((id) => styles?.[id]?.label || id.replace(/^st-/, '')).map((s) => s.toLowerCase());
const joinFr = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} et ${a.at(-1)}`);

/**
 * Charge accumulée par les parties précédentes (doigts, puissance, endurance), en « minutes intenses ».
 * Sert à l'adaptation quand l'utilisateur la demande.
 */
export function priorLoad(parts, upto) {
  const L = { fingers: 0, power: 0, endurance: 0 };
  for (const p of parts.slice(0, upto)) {
    if (p.type !== 'climb') continue;
    const f = IFACT[p.intensity] || 0.6, st = p.styles || [], n = Math.max(1, st.length);
    const fShare = st.length ? st.filter((s) => FINGER.has(s)).length / n : 0.35, pShare = st.length ? st.filter((s) => POWER.has(s)).length / n : 0.35;
    L.fingers += p.minutes * f * (0.3 + fShare); L.power += p.minutes * f * (0.3 + pShare); L.endurance += p.minutes * f * (p.kind === 'voie' ? 0.8 : 0.4);
  }
  return L;
}
/** Ce que l'adaptation change pour cette partie : styles moins durs pour les doigts, cotation abaissée, explication. */
export function adaptPart(p, load, styles) {
  const notes = []; let st = [...(p.styles || [])], drop = 0;
  if (load.fingers >= 40) {
    const kept = st.filter((s) => !FINGER.has(s));
    if (kept.length !== st.length || !st.length) { notes.push('Tes doigts ont déjà beaucoup travaillé : moins de réglettes et petites prises ici, plutôt des prises franches.'); st = kept.length ? kept : ['st-dalle', 'st-devers']; }
    drop = 1;
  }
  if (load.power >= 45 && (p.intensity === 'hard' || p.intensity === 'max')) { notes.push('Beaucoup de puissance avant : vise un cran en dessous et prends des repos plus longs.'); drop = Math.max(drop, 1); }
  if (load.fingers >= 70 || load.power >= 80) { drop = 2; notes.push('Grosse fatigue accumulée : deux crans en dessous, la qualité avant la difficulté.'); }
  return { styles: st, drop, notes, stylesText: styleNames(st, styles) };
}

/* ───────── Structures proposées pour une partie de grimpe ───────── */
// Temps estimés : bloc ≈ 1 min d'effort par essai ; voie ≈ 5 min ; plus les repos indiqués.
export const STRUCTURES = {
  bloc: {
    pyramid: { emoji: '🔺', name: 'Pyramide', for: ['mod', 'hard', 'max'], desc: 'Beaucoup de blocs faciles, de moins en moins en montant, jusqu’au plus dur.' },
    limit: { emoji: '🎯', name: 'Blocs max', for: ['hard', 'max'], desc: 'Peu de blocs, au plus dur, plusieurs essais avec de vrais repos.' },
    styles: { emoji: '🎨', name: 'Tour des styles', for: ['mod', 'hard'], desc: 'Deux blocs par style choisi, pour être à l’aise partout.' },
    fourx4: { emoji: '🔁', name: '4×4', for: ['mod', 'hard'], desc: '4 blocs enchaînés, 4 fois : endurance de puissance (dur pour les doigts).' },
    volume: { emoji: '🌿', name: 'Volume facile', for: ['easy', 'mod'], desc: 'Beaucoup de blocs faciles, sans forcer, pour grimper propre.' },
    technique: { emoji: '🦶', name: 'Technique par style', for: ['easy', 'mod'], desc: 'Blocs faciles avec une consigne technique par style (pieds silencieux, hanches…).' },
  },
  voie: {
    max: { emoji: '🚀', name: 'Voies max', for: ['hard', 'max'], desc: '2 à 3 voies proches du max, avec de longs repos.' },
    pyramid: { emoji: '🔺', name: 'Pyramide voie', for: ['mod', 'hard'], desc: 'Des voies de plus en plus dures, puis on redescend.' },
    enchain: { emoji: '🔗', name: 'Voies enchaînées', for: ['mod', 'hard'], desc: '2 voies à la suite sans repos, pour la résistance.' },
    volume: { emoji: '🌿', name: 'Continuité', for: ['easy', 'mod'], desc: 'Des voies faciles sans s’arrêter, pour l’endurance.' },
  },
};
/** Les structures qui vont avec l'intensité choisie, la plus adaptée d'abord. */
export function proposals(kind, intensity) {
  const all = Object.entries(STRUCTURES[kind] || STRUCTURES.bloc).map(([id, s]) => ({ id, ...s, fit: s.for.includes(intensity) }));
  return all.sort((a, b) => b.fit - a.fit);
}
/** Plage de cotations d'une partie : choisie, sinon selon l'intensité et le maximum connu. */
export function partRange(p, levels, max) {
  const n = levels.length;
  if (!n) return [null, null];
  const chosen = [p.from, p.to].filter((i) => Number.isInteger(i) && i >= 0);
  if (chosen.length) return [clampI(Math.min(...chosen), n), clampI(Math.max(...chosen), n)];
  if (!Number.isInteger(max) || max < 0) return [null, null];
  const m = clampI(max, n);
  // 8.28 : un cran = un niveau de la cotation (6A → 6A+). Avant, l'écart était doublé pour les longues échelles :
  // un grimpeur 6A se voyait proposer des blocs en 3 et une « force » en 4.
  const step = 1, off = { easy: [-4, -3], mod: [-3, -2], hard: [-2, 0], max: [-1, 0] }[p.intensity] || [-3, -1];
  return [clampI(m + off[0] * step, n), clampI(m + off[1] * step, n)];
}
/** Construit les exercices d'une partie de grimpe (liste d'« étapes » : cotation, style, nombre, repos, consigne). */
export function buildClimbPart(p, { levels, max = null, styles = {}, load = null, label = '' }) {
  const kind = p.kind === 'voie' ? 'voie' : 'bloc', notes = [];
  const out0 = (p.stylesOut || []);
  const s = p.structure || proposals(kind, p.intensity)[0].id, givenRange = partRange(p, levels, max), graded = givenRange[0] != null;
  // Sans maximum ni plage choisie, les étapes suivent le ressenti : aucun niveau de l'échelle n'est supposé.
  const relativeIntensity = ['volume', 'technique'].includes(s) ? 'easy' : ['limit', 'max'].includes(s) ? 'max' : p.intensity;
  const relative = { easy: ['très faciles', 'faciles'], mod: ['faciles', 'modérés'], hard: ['modérés', 'soutenus', 'difficiles'], max: ['difficiles', 'proches de ta limite du jour'] }[relativeIntensity] || ['faciles', 'modérés'];
  const workLevels = graded ? levels : relative.map((label) => ({ label }));
  let st = (p.styles || []).filter((x) => !out0.includes(x)), [lo, hi] = graded ? givenRange : [0, workLevels.length - 1];
  if (!graded) notes.push(max == null ? `Maximum de ${kind} non renseigné : choisis les difficultés au ressenti, sans cotation automatique.` : 'Échelle de cotation indisponible : choisis les difficultés au ressenti.');
  if (p.adapt && load) { const a = adaptPart(p, load, styles); st = a.styles; notes.push(...a.notes); lo = Math.max(0, lo - a.drop); hi = Math.max(lo, hi - a.drop); }
  const stTxt = st.length ? ` · ${joinFr(styleNames(st, styles))}` : '', unit = kind === 'voie' ? 'voies' : 'blocs';
  const per = kind === 'voie' ? 5 : 1; // minutes d'effort par essai
  const mk = (name, sets, rest, o = {}) => normalizeEx({ id: uid(), emoji: kind === 'voie' ? '🧗' : '🪨', mode: 'reps', unit, repsMin: 1, repsMax: 1, sets, rest, block: 'main', part: label, repSec: per * 60,
    intensity: o.intensity || (p.intensity === 'easy' ? 'low' : p.intensity === 'mod' ? 'mod' : 'high'), risk: st.some((s) => FINGER.has(s)) && p.intensity !== 'easy' ? 'finger' : '',
    caps: { technique_escalade: 0.6, ...(st.some((s) => FINGER.has(s)) ? { force_doigts: 0.7 } : {}), ...(st.some((s) => POWER.has(s)) ? { puissance_haut: 0.6 } : {}), ...(kind === 'voie' || o.endu ? { endurance_doigts: 0.6 } : {}) },
    name, note: o.note || '', why: o.why || '', group: 'cp-' + s });
  const T = p.minutes, fit = (rest) => Math.max(1, Math.floor((T * 60) / (per * 60 + rest))), out = [];
  const lvl = (i) => labelOf(workLevels, i), targetRange = (a, b) => graded ? range(workLevels, a, b) : a === b ? lvl(a) : `${lvl(a)} à ${lvl(b)}`;
  if (kind === 'bloc') {
    if (s === 'pyramid') {
      const steps = []; for (let i = lo; i <= hi; i++) steps.push(i); if (!steps.length) steps.push(hi);
      const w = steps.map((_, k) => steps.length - k), tot = w.reduce((a, b) => a + b, 0), n = fit(120);
      steps.forEach((i, k) => { const c = Math.max(1, Math.round((n * w[k]) / tot)); out.push(mk(`Blocs ${lvl(i)}${stTxt}`, c, i === hi ? 180 : 120, { note: k === 0 ? 'Monte d’un cran seulement quand tu réussis proprement.' : '' })); });
    } else if (s === 'limit') {
      const n = Math.max(3, fit(180)); out.push(mk(`Essais sur blocs ${targetRange(Math.max(lo, hi - 1), hi)}${stTxt}`, n, 180, { note: 'Repos 3 min entre les essais ; change de bloc après 4 à 6 essais sans progrès.', why: 'Travailler au plus dur demande d’être frais : peu de blocs, de vrais repos.' }));
    } else if (s === 'styles') {
      const list = (st.length ? st : ['st-dalle', 'st-devers', 'st-reglettes', 'st-dynamique']).filter((x) => !out0.includes(x));
      const each = Math.max(1, Math.round(fit(120) / list.length));
      for (const id of list) out.push(mk(`Blocs ${targetRange(lo, hi)} · ${styleNames([id], styles)[0]}`, each, 120));
    } else if (s === 'fourx4') {
      out.push(mk(`4×4 : 4 blocs ${targetRange(lo, Math.max(lo, hi - 1))}${stTxt} enchaînés`, 4, 240, { endu: true, note: 'Enchaîne les 4 blocs sans repos, puis 4 min de repos. Arrête si les mouvements deviennent brouillons.' }));
    } else if (s === 'technique') {
      const drills = ['pieds silencieux', 'hanches contre le mur', 'bras tendus', 'regarder chaque pied'];
      const list = (st.length ? st : ['st-dalle', 'st-vertical']).filter((x) => !out0.includes(x)), each = Math.max(2, Math.round(fit(60) / list.length));
      list.forEach((id, k) => out.push(mk(`Blocs ${targetRange(lo, hi)} · ${styleNames([id], styles)[0]} — ${drills[k % drills.length]}`, each, 60, { intensity: 'low' })));
    } else {
      out.push(mk(`Blocs ${graded ? 'faciles ' : ''}${targetRange(lo, hi)}${stTxt}`, fit(60), 60, { intensity: 'low', note: 'Grimpe propre et fluide, sans te mettre dans le rouge.' }));
    }
  } else {
    if (s === 'max') out.push(mk(`Voies ${targetRange(Math.max(lo, hi - 1), hi)}${stTxt}`, Math.max(2, fit(480)), 480, { note: 'Repos 8 min entre les voies. Lis la voie avant de partir.' }));
    else if (s === 'pyramid') { const steps = [lo, Math.round((lo + hi) / 2), hi, Math.round((lo + hi) / 2)]; const n = Math.max(1, Math.round(fit(300) / steps.length)); steps.forEach((i) => out.push(mk(`${graded ? 'Voie' : 'Voies'} ${lvl(i)}${stTxt}`, n, 300))); }
    else if (s === 'enchain') out.push(mk(`2 voies ${targetRange(lo, Math.max(lo, hi - 1))}${stTxt} à la suite`, Math.max(1, fit(420)), 420, { endu: true, note: 'Redescends et repars aussitôt ; repos 7 min entre les séries.' }));
    else out.push(mk(`Voies ${graded ? 'faciles ' : ''}${targetRange(lo, hi)}${stTxt}`, fit(120), 120, { intensity: 'low', endu: true, note: 'Grimpe sans t’arrêter, en respirant.' }));
  }
  // Nombre d'essais maximum choisi par l'utilisateur : jamais dépassé.
  if (p.attemptsMax) { let cut = false; for (const e of out) if (e.sets > p.attemptsMax) { e.sets = p.attemptsMax; cut = true; } if (cut) notes.push(`Au plus ${p.attemptsMax} essais, comme tu l’as choisi.`); }
  if (notes.length && out[0]) out[0].note = [notes.join(' '), out[0].note].filter(Boolean).join(' ');
  return { exercises: out, notes, range: graded ? [lo, hi] : [null, null], styles: st };
}

/** Parties « corps » (échauffement, renfo, étirements…) : construites par le générateur habituel. */
function bodyPart(p, ctx, act, label, seed, o = {}) {
  const type = { warmup: 'warmup', main: 'main', technique: 'technique', cardio: 'cardio', strength: 'strength', core: 'core', mobility: 'mobility', stretch: 'stretch', cool: 'cool' }[p.type] || 'stretch';
  try {
    // Le lieu choisi décide du matériel ; les objectifs, intentions et zones à ménager orientent le choix des exercices.
    // Le but, les priorités et l'intensité de la phase orientent aussi le choix (sans créer d'objectif).
    const caps = Object.fromEntries((p.priorities || []).map((c) => [c, 1]));
    // Sous-objectifs structurés de la phase (priorités 1–4, règles appliquées) : ajoutés aux capacités visées.
    if (p.subIntents?.length) for (const [c, w] of Object.entries(intentCaps(p.subIntents, p.rules || []).caps)) caps[c] = Math.max(caps[c] || 0, Math.min(1, w / 4));
    const intents = [...(o.intents || []), ...(Object.keys(caps).length ? [{ label: p.goal || 'Priorités de la phase', caps }] : [])];
    const plan = G.planSession({ activityId: p.activity || act, parts: [{ type, minutes: p.minutes }], seed, envId: o.envId, goalIds: o.goalIds, intents, avoidZones: o.avoidZones, light: o.light || p.intensity === 'easy' }, ctx);
    return G.generateFromPlan(plan, ctx).session.exercises.map((e) => normalizeEx({ ...e, id: uid(), part: label }));
  } catch { return []; }
}
export const partLabel = (p, i, parts) => {
  if (p.label) return p.label;
  if (p.type === 'pause') return '⏸️ Pause';
  if (p.type === 'routine') return `${p.emoji || '🧩'} ${p.goal || 'Mon moment'}`;
  if (p.type === 'main') return `💪 ${ACTIVITIES[p.activity]?.label || 'Corps de séance'}`;
  if (p.type === 'work') { const same = parts.filter((x) => x.type === 'work' && workTitle(x) === workTitle(p)); return same.length > 1 ? `${workTitle(p)} (${same.indexOf(p) + 1})` : workTitle(p); }
  if (p.type !== 'climb') return `${CLIMB_PARTS[p.type]?.[0] || '•'} ${CLIMB_PARTS[p.type]?.[1] || p.type}`;
  const base = `${p.kind === 'voie' ? '🧗 Voie' : '🪨 Bloc'} ${INTENSITY[p.intensity]?.[1].toLowerCase() || ''}`.trim();
  const same = parts.filter((x) => x.type === 'climb' && x.kind === p.kind && x.intensity === p.intensity);
  return same.length > 1 ? `${base} (${same.indexOf(p) + 1})` : base;
};

/**
 * Séance complète à partir des parties : [{ type, minutes, kind: 'bloc'|'voie', intensity, styles, from, to, structure, adapt }].
 * opts : { systems: { bloc, voie } (objets système), name, envId, seed, goal }
 */
export function buildFromParts(parts, ctx, opts = {}) {
  const out = [], why = [], seed = opts.seed || 1;
  const base = opts;
  parts.forEach((p, i) => {
    const label = partLabel(p, i, parts);
    // Changement de lieu : le déplacement est un vrai temps de la séance (décompté par le lecteur).
    if (p.travelBefore > 0) out.push(normalizeEx({ id: uid(), name: `Déplacement${p.envName ? ' vers ' + p.envName : ''}`, emoji: '🚗', mode: 'time', sets: 1, secMin: p.travelBefore * 60, secMax: p.travelBefore * 60, rest: 0, block: 'main', part: label, intensity: 'low', note: 'Changement de lieu entre deux phases.', phase: p.id || '' }));
    const n0 = out.length;
    // Lieu propre à la phase : son matériel décide des exercices possibles.
    opts = p.envId ? { ...base, envId: p.envId, envName: p.envName || base.envName } : base;
    buildOne(p, i, label);
    for (const e of out.slice(n0)) e.phase = p.id || ''; // chaque exercice sait de quelle phase il vient
  });
  function buildOne(p, i, label) {
    if (p.type === 'pause') {
      // Pause : un temps de récupération réel, que le lecteur de séance décompte.
      out.push(normalizeEx({ id: uid(), name: 'Pause · récupération', emoji: '⏸️', mode: 'time', sets: 1, secMin: Math.round(p.minutes * 60), secMax: Math.round(p.minutes * 60), rest: 0, block: 'main', part: label, intensity: 'low', note: p.goal || 'Récupère : bois, mange un peu, reste au chaud.' }));
      return;
    }
    if (p.type === 'work') {
      // Partie « travail » d'un sport (course, natation, muscu, poids du corps) : une ou plusieurs structures.
      if (Array.isArray(p.pick) && !p.pick.length) return;
      const fam = sportFamily(p.activity), structs = p.pick?.length ? p.pick.filter((id) => SPORT_STRUCTS[fam]?.[id]) : [p.structure || null];
      const each = Math.max(5, Math.round(p.minutes / Math.max(1, structs.length)));
      structs.forEach((st, k) => { const r = buildWorkPart({ ...p, minutes: each, structure: st || undefined }, ctx, { label }); if (!k) why.push(...r.notes); out.push(...r.exercises); });
      return;
    }
    if (p.type === 'routine') {
      // « Mon moment » : l'exercice lié (ses séries) ou, sans exercice lié, un bloc chronométré de la durée prévue.
      const lib = p.libId ? byId(p.libId) : null, sec = Math.round((p.minutes || 10) * 60), block = p.role === 'warmup' ? 'warmup' : p.role === 'cool' ? 'cool' : 'main';
      const name = lib ? (p.goal && !lib.name.toLowerCase().startsWith(p.goal.toLowerCase()) ? `${p.goal} — ${lib.name}` : lib.name) : p.goal || 'Mon moment';
      const base = lib ? { ...lib, libId: lib.id } : { emoji: p.emoji || '🧩', mode: 'time', sets: 1, secMin: sec, secMax: sec, rest: 0, group: '' };
      out.push(normalizeEx({ ...base, id: uid(), name, block, part: label, intensity: { easy: 'low', mod: 'mod', hard: 'high' }[p.intensity] || base.intensity || 'mod', note: p.note || '' }));
      return;
    }
    if (p.type !== 'climb') {
      // Choisis par l'utilisateur (guidé ou libre), sinon par l'app.
      if (Array.isArray(p.pick)) { out.push(...buildPicked(p, p.pick, label)); return; } // choix de l'utilisateur, même vide
      if (opts.free) return; // mode libre : rien d'imposé, l'utilisateur choisit
      if (GUIDE_PARTS[p.type]) { const eq = availableEquipment(ctx, opts.envId), rec = partOptions(p, { eq, fingersTired: priorLoad(parts, i).fingers >= 40 }).filter((x) => x.recommended).map((x) => x.id); out.push(...buildPicked(p, rec, label)); return; }
      out.push(...bodyPart(p, ctx, opts.sport || 'climbing_boulder', label, seed + i, opts)); return;
    }
    // Système de cotation : celui choisi pour la phase, sinon celui de la séance, sinon celui du lieu (aucune équivalence inventée).
    const sys = (p.systemId && ctx.systems?.[p.systemId]) || opts.systems?.[p.kind] || pickSystem(ctx, p.kind, opts.envId), levels = sortedLevels(sys);
    if (Array.isArray(p.pick) && !p.pick.length) return; // tout décoché : partie vide, comme demandé
    if (opts.envId && !availableEquipment(ctx, opts.envId).has('wall')) why.push(`⚠️ ${opts.envName || 'Ce lieu'} n’a pas de mur d’escalade dans son matériel : ajoute-le dans Profil › Mes lieux, ou choisis un autre lieu pour « ${label} ».`);
    const structs = p.pick?.length ? p.pick.filter((id) => STRUCTURES[p.kind === 'voie' ? 'voie' : 'bloc'][id]) : [p.structure || null];
    const each = Math.max(5, Math.round(p.minutes / Math.max(1, structs.length)));
    structs.forEach((st, k) => {
      const r = buildClimbPart({ ...p, minutes: each, structure: st || undefined }, { levels, max: knownMax(ctx, sys, p.kind), styles: ctx.styles, load: priorLoad(parts, i), label });
      if (!k) why.push(...r.notes); out.push(...r.exercises);
    });
  }
  opts = base;
  const acts = [...new Set([...parts.filter((p) => p.type === 'climb').map((p) => (p.kind === 'voie' ? 'climbing_route' : 'climbing_boulder')), ...parts.map((p) => p.activity).filter((a) => a && a !== 'pause'), ...(opts.sport && !parts.some((p) => p.type === 'climb') ? [opts.sport] : [])])];
  const now = Date.now();
  return normalizeSession({
    id: uid(), name: opts.name || 'Ma séance', emoji: opts.emoji || (acts[0]?.startsWith('climbing') ? '🧗' : '🏋️'), source: 'generated', activity: acts[0] || opts.sport || 'climbing_boulder', sports: acts.slice(1),
    exercises: out, durationMin: sessionMinutes({ exercises: out }), context: { env: opts.envId || '', envName: opts.envName || '', plannedMin: parts.reduce((t, p) => t + p.minutes, 0), intent: opts.intent || null, phases: parts.map((p) => ({ id: p.id, type: p.type, activity: p.activity || (p.type === 'climb' ? (p.kind === 'voie' ? 'climbing_route' : 'climbing_boulder') : ''), role: p.role, goal: p.goal, minutes: p.minutes, intensity: p.intensity, priorities: p.priorities, envId: p.envId || '', travelMin: p.travelBefore || 0, subIntents: (p.subIntents || []).map((x) => x.id), objective: !!p.objective })) },
    objectives: opts.goal ? [opts.goal] : [],
    notes: [{ title: 'Pourquoi cette séance', text: [opts.goal || 'Séance structurée par toi, partie par partie.', ...why].join('\n') }],
    createdAt: now, updatedAt: now,
  });
}

/**
 * Mode objectif : « à la fin je veux avoir réussi {niveau} en {styles} ». Construit toute la séance dans le temps donné :
 * échauffement général, échauffement en grimpant (loin sous l'objectif), montée, spécifique, essais sur l'objectif, retour au calme.
 */
export function goalParts({ kind = 'bloc', target, levels, styles = [], minutes = 120, warm = null, stretch = 0 }) {
  if (!levels.length || !Number.isInteger(target) || target < 0 || target >= levels.length) return [];
  const n = levels.length, T = clampI(target, n), step = n > 10 ? 2 : 1, M = Math.max(40, Math.min(300, minutes));
  // Échauffement général et étirements : au choix (0 = sans), sinon automatiques pour l'échauffement.
  const W = warm == null ? Math.min(15, Math.round(M * 0.12)) : Math.max(0, Math.min(45, warm)), X = Math.max(0, Math.min(45, stretch || 0));
  const cool = Math.min(10, Math.max(5, Math.round(M * 0.07))), climb = Math.max(20, M - W - cool - X);
  const lvl = (d) => clampI(T - d * step, n);
  const plan = [
    ...(W ? [{ type: 'warmup', minutes: W }] : []),
    { type: 'climb', kind, intensity: 'easy', minutes: Math.round(climb * 0.2), from: lvl(5), to: lvl(4), styles, structure: kind === 'voie' ? 'volume' : 'volume', label: `🔥 Échauffement en grimpant (${range(levels, lvl(5), lvl(4))})` },
    { type: 'climb', kind, intensity: 'mod', minutes: Math.round(climb * 0.22), from: lvl(3), to: lvl(2), styles, structure: 'pyramid', label: `📈 Montée (${range(levels, lvl(3), lvl(2))})` },
  ];
  if (M >= 75) plan.push({ type: 'climb', kind, intensity: 'hard', minutes: Math.round(climb * 0.2), from: lvl(1), to: lvl(1), styles, structure: kind === 'voie' ? 'max' : 'styles', label: `🎨 Spécifique (${labelOf(levels, lvl(1))})` });
  const used = plan.reduce((t, p) => t + p.minutes, 0);
  plan.push({ type: 'climb', kind, intensity: 'max', minutes: Math.max(10, M - cool - X - used), from: T, to: T, styles, structure: kind === 'voie' ? 'max' : 'limit', label: `🎯 Objectif ${labelOf(levels, T)}` });
  plan.push({ type: 'cool', minutes: cool });
  if (X) plan.push({ type: 'stretch', minutes: X });
  return plan;
}
/** Conseil honnête sur l'objectif, si le maximum connu le permet (sinon rien : on n'invente pas). */
export function goalAdvice(target, max, levels) {
  if (!Number.isInteger(target) || target < 0 || !Number.isInteger(max) || max < 0 || !levels.length) return '';
  const step = levels.length > 10 ? 2 : 1, gap = (target - max) / step;
  if (gap >= 2) return `Objectif ambitieux : ton maximum noté est ${labelOf(levels, max)}. Vise d’abord ${labelOf(levels, max + step)}, c’est plus réaliste aujourd’hui.`;
  if (gap >= 1) return `Un cran au-dessus de ton maximum noté (${labelOf(levels, max)}) : c’est un bel objectif, garde de l’énergie pour les essais.`;
  return `Dans tes cordes (maximum noté : ${labelOf(levels, max)}).`;
}
