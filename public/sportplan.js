// sportplan.js — pour tous les sports, le même fonctionnement que l'escalade : des parties « travail » avec une
// intensité et une structure au choix (fractionné, seuil, 5×5, EMOM…), et un objectif chiffré (10 km en 50 min,
// 100 kg au squat, 15 tractions…) qui construit toute la séance : échauffement, montée, spécifique, objectif, retour au calme.
// Les allures et les charges viennent de TES perfs notées ou de ta cible ; sinon, des repères de ressenti. Rien n'est inventé.
// Sans DOM, testé.
import { normalizeEx, uid } from './shared.js';
import { METRICS, ACTIVITIES } from './model.js';

/** Famille de chaque sport natif (les sports sans famille gardent le format par exercices). */
export const FAMILY = { running: 'run', swimming: 'swim', strength: 'load', conditioning: 'body', calisthenics: 'body' };
export const sportFamily = (sport) => FAMILY[sport] || '';
const EMOJI = { run: '🏃', swim: '🏊', load: '🏋️', body: '💪' };

/** Structures proposées par famille : for = intensités où elles vont le mieux ; when = où les placer. */
export const SPORT_STRUCTS = {
  run: {
    footing: { emoji: '🌿', name: 'Footing facile', for: ['easy'], desc: 'Courir en pouvant parler : la base de l’endurance.', when: 'N’importe quand ; parfait pour récupérer.' },
    fartlek: { emoji: '🎲', name: 'Fartlek', for: ['mod'], desc: '1 min plus vite, 3 min facile, plusieurs fois : varier sans se mettre dans le rouge.', when: 'Au milieu d’une séance, ou pour préparer le fractionné.' },
    seuil: { emoji: '📈', name: 'Seuil', for: ['hard', 'mod'], desc: 'Blocs de 8 min « confortablement difficile » (tu peux dire 3-4 mots).', when: 'Après un bon échauffement, frais.' },
    long: { emoji: '⏱', name: 'Fractionné long', for: ['hard', 'max'], desc: 'Répétitions de 4 min vite, 3 min de récupération en trottinant.', when: 'Tôt dans la séance, après l’échauffement.' },
    court: { emoji: '⚡', name: 'Fractionné court 30/30', for: ['max', 'hard'], desc: '30 s vite, 30 s lent, en série.', when: 'Tôt, frais ; très exigeant.' },
    cotes: { emoji: '⛰️', name: 'Côtes', for: ['hard'], desc: 'Montées de 45 s dynamiques, retour en marchant.', when: 'Après l’échauffement ; renforce aussi les jambes.' },
    allure: { emoji: '🎯', name: 'À l’allure objectif', for: ['hard', 'mod'], desc: 'Des blocs à l’allure de ton objectif, pour l’apprendre.', when: 'Au cœur de la séance.' },
  },
  swim: {
    continu: { emoji: '🌿', name: 'Nage continue', for: ['easy', 'mod'], desc: 'Nager sans s’arrêter, souple.', when: 'Échauffement, récupération ou endurance.' },
    technique: { emoji: '🎯', name: 'Éducatifs', for: ['easy'], desc: 'Longueurs avec une consigne technique (rattrapé, pull, battements…).', when: 'Début de séance, quand tu es frais pour bien faire.' },
    pyramide: { emoji: '🔺', name: 'Pyramide', for: ['mod', 'hard'], desc: '50-100-150-200-150-100-50 m, récupération courte.', when: 'Au milieu de la séance.' },
    fractionne: { emoji: '🔁', name: 'Séries de 100 m', for: ['hard'], desc: 'Des 100 m soutenus, 20-30 s de récupération.', when: 'Au cœur de la séance.' },
    sprint: { emoji: '⚡', name: 'Sprints 25 m', for: ['max'], desc: '25 m à fond, récupération complète.', when: 'Après l’échauffement, frais.' },
    allure: { emoji: '🎯', name: 'À l’allure objectif', for: ['hard', 'mod'], desc: 'Des distances à l’allure de ton objectif.', when: 'Au cœur de la séance.' },
  },
  load: {
    technique: { emoji: '🎯', name: 'Technique', for: ['easy'], desc: 'Séries légères pour un mouvement propre.', when: 'Échauffement du mouvement, ou jour de récupération.' },
    hypertrophie: { emoji: '💪', name: 'Volume 4×8-12', for: ['mod'], desc: 'Charge moyenne, beaucoup de répétitions : du muscle.', when: 'Après le travail lourd.' },
    cinq: { emoji: '🧱', name: '5×5', for: ['hard', 'mod'], desc: '5 séries de 5 : force et régularité.', when: 'En premier, frais.' },
    force: { emoji: '🏋️', name: 'Force 5×3', for: ['hard', 'max'], desc: 'Séries lourdes et courtes, longs repos.', when: 'En premier, frais.' },
    pyramide: { emoji: '🔺', name: 'Pyramide', for: ['hard'], desc: 'La charge monte, les répétitions baissent.', when: 'En premier, frais.' },
    max: { emoji: '🚀', name: 'Montée vers le max', for: ['max'], desc: 'Paliers jusqu’à une charge lourde (ou ton objectif).', when: 'En premier, très frais ; pas tous les jours.' },
  },
  body: {
    sousmax: { emoji: '🌿', name: 'Séries faciles', for: ['easy', 'mod'], desc: 'Beaucoup de séries à ~50 % de ton max, sans échec.', when: 'N’importe quand ; bon pour progresser vite.' },
    circuit: { emoji: '🔄', name: 'Circuit', for: ['mod'], desc: 'Le mouvement enchaîné avec du gainage, peu de repos.', when: 'Milieu ou fin de séance.' },
    pyramide: { emoji: '🔺', name: 'Pyramide', for: ['hard', 'mod'], desc: '1, 2, 3… puis on redescend.', when: 'Au cœur de la séance.' },
    emom: { emoji: '⏱', name: 'EMOM', for: ['hard'], desc: 'Au début de chaque minute, un petit nombre de répétitions.', when: 'Au cœur de la séance.' },
    max: { emoji: '🚀', name: 'Séries max', for: ['max', 'hard'], desc: 'Quelques séries au maximum, longs repos (et un test si c’est ton objectif).', when: 'En premier, frais.' },
  },
};
/** Les structures de la famille, les plus adaptées à l'intensité d'abord. */
export function sportProposals(family, intensity) {
  return Object.entries(SPORT_STRUCTS[family] || {}).map(([id, s]) => ({ id, ...s, fit: s.for.includes(intensity) })).sort((a, b) => b.fit - a.fit);
}

/** Distances des objectifs de temps (pour calculer une allure). */
const DIST = { course_5k: [5, 'km'], course_10k: [10, 'km'], course_semi: [21.1, 'km'], nage_100: [1, '100 m'], nage_400: [4, '100 m'] };
/** Nom du mouvement travaillé pour une mesure (muscu, poids du corps). */
const MOVE = {
  squat_1rm: 'Squat', souleve_1rm: 'Soulevé de terre', couche_1rm: 'Développé couché', militaire_1rm: 'Développé militaire', rowing_1rm: 'Rowing barre', traction_lestee: 'Traction lestée',
  max_tractions: 'Tractions strictes', max_pompes: 'Pompes', max_dips: 'Dips', pompes_piquees: 'Pompes piquées', hollow_hold: 'Gainage bateau', l_sit: 'L-sit', handstand_mur: 'Équilibre sur les mains (mur)',
  pistol_squat: 'Pistol squat', planche_avant_bras: 'Planche', gainage_lateral: 'Gainage latéral', releves_jambes: 'Relevés de jambes suspendu', blocage_90: 'Blocage bras à 90°', dead_hang: 'Suspension active',
  traction_archer: 'Tractions archer', traction_un_bras: 'Tractions à un bras',
};
const metricOf = (id, ctx) => METRICS[id] || ctx?.metrics?.[id] || null;
export const moveName = (id, ctx) => MOVE[id] || String(metricOf(id, ctx)?.label || id).replace(/\s*[:(].*$/, '').replace(/\s+max$/i, '');

/** Objectifs chiffrés possibles pour un sport (mesures du sport, sans les cotations ni le poids du corps). */
export function sportTargets(sport, ctx = {}) {
  const all = { ...METRICS, ...(ctx.metrics || {}) };
  return Object.entries(all).filter(([id, m]) => id !== 'body_weight' && m.kind !== 'grade' && (m.acts || [m.activity]).includes(sport))
    .map(([id, m]) => ({ id, label: m.label, unit: m.unit || '', dir: m.dir === -1 ? -1 : 1 })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}
/** Mouvements travaillables (muscu, poids du corps) : les mesures de charge / répétitions / temps du sport. */
export const sportMoves = (sport, ctx) => sportTargets(sport, ctx).filter((t) => ['kg', 'reps', 's'].includes(t.unit));

/** Meilleure perf notée pour une mesure (selon le sens : plus haut ou plus bas = mieux), null si aucune. */
export function bestPerf(ctx, metricId) {
  const m = metricOf(metricId, ctx), d = m?.dir === -1 ? -1 : 1;
  const v = (ctx.perfs || []).filter((p) => p.metricId === metricId && !p.unknown && Number.isFinite(p.value)).map((p) => p.value);
  return v.length ? (d > 0 ? Math.max(...v) : Math.min(...v)) : null;
}
const r25 = (x) => Math.round(x / 2.5) * 2.5;
const mmss = (min) => { const t = Math.round(min * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
/** Allure (min par km, ou par 100 m) d'une mesure de temps sur distance ; null si ce n'en est pas une. */
export function paceOf(metricId, value) {
  const d = DIST[metricId]; if (!d || !Number.isFinite(value) || value <= 0) return null;
  const minutes = metricOf(metricId)?.unit === 's' ? value / 60 : value;
  return { pace: minutes / d[0], per: d[1] };
}
export const fmtPace = (p) => (p ? `${mmss(p.pace)} /${p.per === 'km' ? 'km' : '100 m'}` : '');

/** Conseil honnête sur la cible, d'après la meilleure perf notée (rien si elle est inconnue). */
export function targetAdvice(metricId, target, known, ctx) {
  const m = metricOf(metricId, ctx); if (!m || !Number.isFinite(target)) return '';
  if (known == null) return 'Note ta perf actuelle dans Profil › Records et mesures : les allures et les charges seront calculées pour toi.';
  const d = m.dir === -1 ? -1 : 1, gap = (d * (target - known)) / Math.abs(known || 1), u = m.unit && m.unit !== 'reps' ? ' ' + m.unit : '';
  if (gap <= 0) return `Déjà atteint (ta meilleure perf notée : ${known}${u}) : vise plus loin !`;
  if (gap > 0.15) { const step = +(known + d * Math.abs(known) * 0.05).toFixed(m.unit === 'kg' ? 1 : 0); return `Objectif ambitieux : ta meilleure perf notée est ${known}${u}. Vise d’abord ${step}${u}, c’est plus réaliste aujourd’hui.`; }
  return `Un cran au-dessus de ta meilleure perf notée (${known}${u}) : un bel objectif.`;
}

/* ───────── Construction d'une partie « travail » ───────── */
const INT = { easy: 'low', mod: 'mod', hard: 'high', max: 'high' };
/**
 * Exercices d'une partie : p = { type: 'work', activity, intensity, minutes, structure, move, target: { metricId, value } }.
 * Retourne { exercises, notes }.
 */
export function buildWorkPart(p, ctx = {}, { label = '' } = {}) {
  const fam = sportFamily(p.activity), notes = [], out = [], T = Math.max(5, p.minutes || 20);
  if (!fam) return { exercises: [], notes };
  const s = p.structure || sportProposals(fam, p.intensity || 'mod')[0].id;
  const mk = (name, o) => normalizeEx({ id: uid(), emoji: EMOJI[fam], block: 'main', part: label, group: 'sp-' + s, intensity: o.intensity || INT[p.intensity] || 'mod', acts: [p.activity], name, ...o });
  const tgt = p.target?.metricId ? p.target : null;
  if (fam === 'run' || fam === 'swim') {
    const tp = tgt ? paceOf(tgt.metricId, tgt.value) : null, kp = tgt ? paceOf(tgt.metricId, bestPerf(ctx, tgt.metricId)) : null;
    const at = tp ? ` à ${fmtPace(tp)}` : '';
    if (fam === 'run') {
      if (s === 'footing') out.push(mk(`Footing facile ${T} min`, { mode: 'time', sets: 1, secMin: T * 60, rest: 0, note: 'Tu dois pouvoir parler en courant.', caps: { endurance_aerobie: 1 } }));
      else if (s === 'fartlek') out.push(mk('Fartlek : 1 min plus vite', { mode: 'time', sets: Math.max(3, Math.floor(T / 4)), secMin: 60, rest: 180, note: 'Les 3 min de récupération se font en trottinant.', caps: { endurance_aerobie: 0.7, seuil: 0.5 } }));
      else if (s === 'seuil') out.push(mk('Bloc au seuil (8 min)', { mode: 'time', sets: Math.max(2, Math.floor(T / 10)), secMin: 480, rest: 120, note: `« Confortablement difficile » : tu peux dire 3-4 mots${tp ? ` (un peu plus lent que ${fmtPace(tp)})` : ''}.`, caps: { seuil: 1 } }));
      else if (s === 'long') out.push(mk('Fractionné 4 min vite', { mode: 'time', sets: Math.min(6, Math.max(3, Math.floor(T / 7))), secMin: 240, rest: 180, note: 'Récupère 3 min en trottinant. Allure régulière d’une répétition à l’autre.', caps: { vitesse: 0.6, seuil: 0.7 } }));
      else if (s === 'court') out.push(mk('30/30 : 30 s vite, 30 s lent', { mode: 'time', sets: Math.min(20, Math.max(8, T)), secMin: 30, rest: 30, note: 'Arrête la série si l’allure s’effondre.', caps: { vitesse: 1 } }));
      else if (s === 'cotes') out.push(mk('Côte de 45 s dynamique', { mode: 'time', sets: Math.min(10, Math.max(4, Math.floor(T / 2.5))), secMin: 45, rest: 90, note: 'Redescends en marchant ; genoux hauts, buste droit.', caps: { force_jambes: 0.7, seuil: 0.5 } }));
      else { const sec = tp ? Math.round(tp.pace * 60) : 300; out.push(mk(tp ? `1 km${at}` : 'Bloc de 5 min à ton allure objectif', { mode: 'time', sets: Math.max(2, Math.floor((T * 60) / (sec + 90))), secMin: sec, rest: 90, note: tp ? `C’est ton allure objectif. ${kp ? `Ta meilleure perf notée correspond à ${fmtPace(kp)}.` : ''}`.trim() : 'Note ton objectif de temps pour avoir l’allure exacte.', caps: { seuil: 0.8, endurance_aerobie: 0.5 } })); }
    } else {
      const per100 = tp ? Math.round(tp.pace * 60) : 120;
      if (s === 'continu') out.push(mk(`Nage continue ${T} min`, { mode: 'time', sets: 1, secMin: T * 60, rest: 0, note: 'Souple, respiration régulière.', caps: { endurance_aerobie: 1 } }));
      else if (s === 'technique') out.push(mk('50 m éducatif (rattrapé, pull, battements…)', { mode: 'reps', unit: 'm', repsMin: 50, repsMax: 50, sets: Math.max(4, Math.floor(T / 2)), rest: 20, repSec: 1.2, note: 'Une consigne par longueur ; la qualité avant la vitesse.', caps: { technique_nage: 1 } }));
      else if (s === 'pyramide') for (const d of [50, 100, 150, 200, 150, 100, 50]) out.push(mk(`${d} m`, { mode: 'reps', unit: 'm', repsMin: d, repsMax: d, sets: 1, rest: 20, repSec: per100 / 100, caps: { endurance_aerobie: 0.8 } }));
      else if (s === 'sprint') out.push(mk('25 m à fond', { mode: 'reps', unit: 'm', repsMin: 25, repsMax: 25, sets: Math.min(12, Math.max(4, Math.floor(T / 1.5))), rest: 45, repSec: 1, intensity: 'high', caps: { vitesse: 1 } }));
      else { const n = Math.max(3, Math.floor((T * 60) / (per100 + 25))); out.push(mk(s === 'allure' && tp ? `100 m${at}` : '100 m soutenu', { mode: 'reps', unit: 'm', repsMin: 100, repsMax: 100, sets: Math.min(20, n), rest: 25, repSec: per100 / 100, note: s === 'allure' && !tp ? 'Note ton objectif de temps pour avoir l’allure exacte.' : 'Récupère 20-30 s au bord.', caps: { endurance_aerobie: 0.6, vitesse: 0.5 } })); }
    }
    return { exercises: out, notes };
  }
  // Muscu (charges) et poids du corps (répétitions ou temps) : un mouvement, sa meilleure perf notée, sa cible.
  const move = p.move || tgt?.metricId || sportMoves(p.activity, ctx)[0]?.id || '', m = metricOf(move, ctx);
  const K = move ? bestPerf(ctx, move) : null, goal = tgt && tgt.metricId === move ? tgt.value : null, name = move ? moveName(move, ctx) : (ACTIVITIES[p.activity]?.label || 'Mouvement');
  const fit = (rest, work = 30) => Math.min(8, Math.max(2, Math.floor((T * 60) / (rest + work))));
  if (fam === 'load') {
    const kg = (x) => (K ? `${r25(K * x)} kg` : ''), rpe = (reps) => `charge que tu pourrais soulever ${reps + 2} fois`;
    const set = (label, reps, pct, rest, o = {}) => mk(`${name} — ${label}`, { mode: 'reps', repsMin: reps, repsMax: o.repsMax || reps, sets: o.sets || fit(rest), rest, load: kg(pct) || rpe(reps), repSec: 4, caps: m?.caps || {}, ...o });
    if (s === 'technique') out.push(set('technique', 5, 0.5, 90, { intensity: 'low', note: 'Léger : amplitude complète, mouvement propre.' }));
    else if (s === 'hypertrophie') out.push(set('4×8-12', 8, 0.7, 90, { repsMax: 12, sets: 4 }));
    else if (s === 'cinq') out.push(set('5×5', 5, 0.8, 150, { sets: 5 }));
    else if (s === 'force') out.push(set('5×3', 3, 0.85, 180, { sets: 5, note: 'Repos complets : la qualité de chaque répétition compte.' }));
    else if (s === 'pyramide') [[8, 0.7], [5, 0.8], [3, 0.85], [2, 0.9]].forEach(([r, x]) => out.push(set(`${r} rép.`, r, x, 150, { sets: 1 })));
    else {
      [[5, 0.5], [3, 0.7], [2, 0.8], [1, 0.9]].forEach(([r, x]) => out.push(set(`palier ${Math.round(x * 100)} %`, r, x, 150, { sets: 1, intensity: x >= 0.8 ? 'high' : 'mod' })));
      if (goal && K && goal <= K * 1.05) out.push(mk(`${name} — essai à ${goal} kg`, { mode: 'reps', repsMin: 1, repsMax: 1, sets: 2, rest: 240, load: `${goal} kg`, repSec: 5, intensity: 'high', note: 'Seulement si le palier à 90 % est passé proprement. Sinon, reste à 90 %.', caps: m?.caps || {} }));
      else out.push(set('singles lourds', 1, 0.92, 210, { sets: 2, note: goal ? `Objectif ${goal} kg : on s’en rapproche par des singles solides${K ? '' : ' (note ton max pour les charges exactes)'}.` : 'Arrête avant l’échec.' }));
    }
    if (!K) notes.push(`Charges données au ressenti : note ton max de « ${name} » dans Profil › Records et mesures pour des charges en kg.`);
    return { exercises: out, notes };
  }
  // Poids du corps.
  const time = m?.unit === 's', base = K ?? goal ?? (time ? 30 : 8);
  const rep = (x) => Math.max(1, Math.round(base * x));
  const ex = (label, x, rest, o = {}) => mk(`${name}${label ? ' — ' + label : ''}`, time ? { mode: 'time', secMin: rep(x), sets: o.sets || fit(rest, rep(x)), rest, caps: m?.caps || {}, ...o } : { mode: 'reps', repsMin: rep(x), repsMax: rep(x), sets: o.sets || fit(rest), rest, repSec: 3, caps: m?.caps || {}, ...o });
  if (s === 'sousmax') out.push(ex('séries faciles', 0.5, 90, { intensity: 'low', note: 'Jamais jusqu’à l’échec : garde de la réserve.' }));
  else if (s === 'circuit') { out.push(ex('circuit', 0.5, 45)); out.push(mk('Gainage bateau', { mode: 'time', secMin: 30, sets: fit(45, 30), rest: 45, caps: { gainage_anterieur: 1 } })); }
  else if (s === 'pyramide') [0.2, 0.35, 0.5, 0.35, 0.2].forEach((x) => out.push(ex('', x, 60, { sets: 1 })));
  else if (s === 'emom') out.push(ex('EMOM (au début de chaque minute)', 0.35, 30, { sets: Math.min(20, T), note: 'Le reste de la minute sert de repos.' }));
  else { out.push(ex('série max', 1, 180, { sets: 3, intensity: 'high', note: goal ? `Objectif : ${goal}${time ? ' s' : ''}. Note ton meilleur résultat dans Mesures.` : 'Arrête dès que la forme se dégrade.' })); }
  if (K == null) notes.push(`Répétitions au ressenti : note ton max de « ${name} » dans Profil › Records et mesures pour des séries sur mesure.`);
  return { exercises: out, notes };
}

/* ───────── Séance entière vers un objectif chiffré ───────── */
/**
 * Parties d'une séance tournée vers un objectif : { sport, metricId, value, minutes }.
 * Échauffement, montée, spécifique, partie « objectif », retour au calme — comme pour une cotation à réussir en escalade.
 */
export function targetParts({ sport, metricId, value, minutes = 60 }) {
  const fam = sportFamily(sport), M = Math.max(20, Math.min(240, minutes)), W = Math.min(15, Math.max(5, Math.round(M * 0.15))), C = Math.min(10, Math.max(5, Math.round(M * 0.1))), R = Math.max(10, M - W - C);
  const target = { metricId, value }, w = (x) => Math.max(5, Math.round((R * x) / 5) * 5), P = (o) => ({ type: 'work', activity: sport, ...o });
  const tl = targetLabel(metricId, value);
  const plan = [{ type: 'warmup', minutes: W }];
  if (fam === 'run') plan.push(P({ intensity: 'easy', structure: 'footing', minutes: w(0.25), label: '🔥 Mise en route' }), P({ intensity: 'mod', structure: 'fartlek', minutes: w(0.25), label: '📈 Montée' }), P({ intensity: 'hard', structure: 'allure', minutes: w(0.5), target, label: `🎯 ${tl}` }));
  else if (fam === 'swim') plan.push(P({ intensity: 'easy', structure: 'technique', minutes: w(0.25), label: '🔥 Éducatifs' }), P({ intensity: 'mod', structure: 'pyramide', minutes: w(0.25), label: '📈 Montée' }), P({ intensity: 'hard', structure: 'allure', minutes: w(0.5), target, label: `🎯 ${tl}` }));
  else if (fam === 'load') plan.push(P({ intensity: 'easy', structure: 'technique', move: metricId, minutes: w(0.2), label: '🔥 Montée en charge' }), P({ intensity: 'max', structure: 'max', move: metricId, minutes: w(0.45), target, label: `🎯 ${tl}` }), P({ intensity: 'mod', structure: 'hypertrophie', move: metricId, minutes: w(0.35), label: '💪 Volume' }));
  else plan.push(P({ intensity: 'easy', structure: 'sousmax', move: metricId, minutes: w(0.25), label: '🔥 Séries faciles' }), P({ intensity: 'max', structure: 'max', move: metricId, minutes: w(0.35), target, label: `🎯 ${tl}` }), P({ intensity: 'hard', structure: 'pyramide', move: metricId, minutes: w(0.4), label: '📈 Pyramide' }));
  plan.push({ type: 'cool', minutes: C });
  return plan;
}
/** « 10 km : temps → 50 min » devient « 10 km en 50 min » ; « Squat : charge max » → « Squat 100 kg ». */
export function targetLabel(metricId, value) {
  const m = METRICS[metricId], u = m?.unit && m.unit !== 'reps' ? ' ' + m.unit : '';
  if (!m) return `Objectif ${value}`;
  if (DIST[metricId]) return `${m.label.replace(/\s*:.*$/, '')} en ${m.unit === 's' ? mmss(value / 60) : value + ' min'}`;
  if (MOVE[metricId]) return `${MOVE[metricId]} ${value}${u || (m.unit === 'reps' ? ' rép.' : '')}`;
  return `${m.label.replace(/\s*:.*$/, '')} ${value}${u}`;
}
/** Format proposé par défaut pour un sport à structures (sans objectif chiffré). */
export function defaultWorkParts(sport, minutes = 60, forme = 'normal', move = '') {
  // Le temps demandé est tenu : moins de 20 min → échauffement + une seule partie de travail (5 min au moins chacune).
  const fam = sportFamily(sport), M = Math.max(10, Math.min(300, Math.round(Number(minutes) || 60))), short = M < 20, W = short ? 5 : Math.min(15, Math.max(5, Math.round(M * 0.15))), C = short ? 0 : Math.min(10, Math.max(5, Math.round(M * 0.1))), R = M - W - C, low = forme === 'low';
  const main = short ? R : Math.max(5, Math.min(R - 5, Math.round((R * (fam === 'run' || fam === 'swim' ? 0.6 : 0.5)) / 5) * 5)), rest = R - main;
  const S1 = { run: low ? 'footing' : 'seuil', swim: low ? 'continu' : 'fractionne', load: low ? 'technique' : 'cinq', body: low ? 'sousmax' : 'pyramide' }[fam];
  const P = (o) => ({ type: 'work', activity: sport, ...(move && (fam === 'load' || fam === 'body') ? { move } : {}), ...o });
  const second = fam === 'run' ? P({ intensity: 'easy', structure: 'footing', minutes: rest }) : fam === 'swim' ? P({ intensity: 'easy', structure: 'technique', minutes: rest }) : { type: 'main', activity: sport, minutes: rest };
  if (short) return [{ type: 'warmup', minutes: W }, P({ intensity: low ? 'easy' : 'hard', structure: S1, minutes: main })];
  return [{ type: 'warmup', minutes: W }, P({ intensity: low ? 'easy' : 'hard', structure: S1, minutes: main }), second, { type: 'cool', minutes: C }];
}
export const workTitle = (p) => { const s = SPORT_STRUCTS[sportFamily(p.activity)]?.[p.structure] || sportProposals(sportFamily(p.activity), p.intensity || 'mod')[0]; return `${EMOJI[sportFamily(p.activity)] || '💪'} ${s?.name || 'Travail'}`; };
