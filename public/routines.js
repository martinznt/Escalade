// routines.js — « Mes moments » : des blocs que la personne aime faire dans ses séances (élastiques à l'échauffement,
// no foot ou spray wall en fin de séance…). L'app les propose dans la structure, au bon endroit, et les adapte à la
// séance : durée de la séance, doigts déjà chargés par une phase dure, matériel du lieu, séances des derniers jours.
// Conseils spray wall d'après l'historique réel (rien d'inventé : sans séance notée, conseil de départ prudent).
// Sans DOM, testé (tests/routines.test.mjs).
import { byId } from './library.js';
import { EQUIPMENT } from './model.js';
import { ROLES } from './phase.js';

export const WHEN = {
  warmup: ['🔥', 'À l’échauffement'], start: ['▶️', 'Au début du corps de séance'], middle: ['⏸️', 'Au milieu'],
  end: ['🏁', 'En fin de séance'], cool: ['🌬️', 'Au retour au calme'],
};
export const EFFORT = { easy: 'Facile', mod: 'Moyen', hard: 'Dur' };
const CLIMB = ['climbing_boulder', 'climbing_route'];
/** Moments tout prêts (modifiables avant l'enregistrement). */
export const ROUTINE_PRESETS = [
  { key: 'elastique', label: 'Élastiques épaules', emoji: '🎗️', when: 'warmup', minutes: 5, libId: 'wu-scap-band', needs: ['band'], effort: 'easy', sports: [] },
  { key: 'doigts', label: 'Échauffement des doigts', emoji: '🖐️', when: 'warmup', minutes: 8, libId: 'wu-fingers', needs: [], effort: 'easy', fingers: true, sports: CLIMB },
  { key: 'mobilite', label: 'Mobilité hanches', emoji: '🤸', when: 'warmup', minutes: 5, libId: 'wu-mob-lower', needs: [], effort: 'easy', sports: [] },
  { key: 'nofoot', label: 'No foot', emoji: '🙌', when: 'end', minutes: 15, libId: 'no-foot', needs: ['wall'], effort: 'hard', fingers: true, sports: CLIMB },
  { key: 'spray', label: 'Spray wall', emoji: '🧱', when: 'end', minutes: 20, libId: 'spray-circuits', needs: ['spraywall'], effort: 'mod', fingers: true, sports: CLIMB },
  { key: 'gainage', label: 'Gainage', emoji: '🚤', when: 'end', minutes: 10, libId: 'hollow-hold', needs: [], effort: 'mod', sports: [] },
  { key: 'antago', label: 'Antagonistes à l’élastique', emoji: '🌀', when: 'end', minutes: 8, libId: 'external-rotation', needs: ['band'], effort: 'easy', sports: [] },
  { key: 'etirements', label: 'Étirements avant-bras', emoji: '🙏', when: 'cool', minutes: 5, libId: 'cd-forearm', needs: [], effort: 'easy', sports: [] },
];
const FINGER_EQ = new Set(['spraywall', 'campus', 'hangboard', 'boardwall']);
export const isSpray = (r) => (r.needs || []).includes('spraywall') || /spray|pan d/i.test(r.label || '');
export const usesFingers = (r) => !!r.fingers || (r.needs || []).some((k) => FINGER_EQ.has(k)) || byId(r.libId)?.group === 'doigts';
const pname = (p) => p.goal || (p.role === 'custom' && p.roleLabel) || ROLES[p.role]?.[1] || 'la phase la plus longue';
const DOWN = { hard: 'mod', mod: 'easy', easy: 'easy' };
const INT = { easy: 'easy', mod: 'mod', hard: 'hard' };
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
const isClimbPhase = (p) => p.type === 'climb' || /^climbing/.test(p.activity || '');
const hardPhase = (p) => p.type !== 'pause' && ['hard', 'max'].includes(p.intensity);
const capOf = (caps, k) => (Array.isArray(caps) ? caps.find((c) => c?.id === k)?.w || 0 : Number(caps?.[k]) || 0);
const exList = (h) => (Array.isArray(h?.data?.exercises) ? h.data.exercises : []);
const hardFingerEx = (e) => e?.intensity === 'high' && (e.group === 'doigts' || capOf(e.caps, 'force_doigts') >= 0.5);

/** Séances d'escalade dures pour les doigts dans les 48 dernières heures (d'après l'historique noté). */
export function recentFingerLoad(history = [], now = Date.now()) {
  const hard = (history || []).filter((h) => h && now - (h.startedAt || 0) < 48 * 3600e3 && now >= (h.startedAt || 0) && exList(h).some(hardFingerEx));
  if (!hard.length) return null;
  const last = Math.max(...hard.map((h) => h.startedAt));
  return { hours: Math.max(1, Math.round((now - last) / 3600e3)), name: hard.find((h) => h.startedAt === last)?.sessionName || 'une séance' };
}

/** Où insérer un moment : après l'échauffement, au milieu, avant le retour au calme, ou tout à la fin. */
function insertIndex(phases, when) {
  let a = 0; while (a < phases.length && (phases[a].role === 'warmup' || phases[a].role === 'prep' || phases[a].type === 'warmup')) a++;
  let z = phases.length; while (z > a && (phases[z - 1].role === 'cool' || phases[z - 1].type === 'cool')) z--;
  return { warmup: a, start: a, middle: Math.round((a + z) / 2), end: z, cool: phases.length }[when] ?? z;
}

/**
 * Moments à proposer pour une structure. Chaque proposition dit où elle irait, sa durée et son effort adaptés,
 * et pourquoi. `ok: false` quand le matériel manque au lieu de la séance (dit, jamais ajouté en silence).
 * o : { sports, eq (Set du matériel disponible, null = inconnu), minutes, history, now, envName }
 */
export function suggestRoutines(routines = [], phases = [], o = {}) {
  const sports = new Set((o.sports || []).filter(Boolean)), M = Number(o.minutes) || phases.reduce((t, p) => t + (Number(p.minutes) || 0), 0) || 60;
  const recent = recentFingerLoad(o.history, o.now ?? Date.now());
  const out = [];
  for (const r of routines || []) {
    if (!r || r.off || !WHEN[r.when]) continue;
    if (phases.some((p) => p.routineId === r.id)) continue; // déjà dans la séance
    if ((r.sports || []).length && !r.sports.some((s) => sports.has(s))) continue; // pas pour ces sports
    const missing = o.eq ? (r.needs || []).filter((k) => !o.eq.has(k)) : [];
    const at = insertIndex(phases, r.when), reasons = [];
    let minutes = Math.max(3, Math.min(90, Math.round(Number(r.minutes) || 10))), effort = EFFORT[r.effort] ? r.effort : 'mod';
    // Séance courte : le moment ne mange pas la séance (12 % du temps au plus, 5 min minimum).
    if (M < 60 && minutes > Math.max(5, M * 0.12)) { minutes = Math.min(minutes, r5(M * 0.12)); reasons.push(`séance courte (${M} min) : version de ${minutes} min`); }
    if (usesFingers(r) && r.when !== 'warmup') {
      const before = phases.slice(0, at).filter((p) => isClimbPhase(p) && hardPhase(p));
      if (before.length && effort !== 'easy') { effort = DOWN[effort]; reasons.push(`les doigts auront déjà travaillé dur avant (« ${pname(before[0])} ») : effort ${EFFORT[effort].toLowerCase()}`); }
      if (recent && effort !== 'easy') { effort = 'easy'; reasons.push(`séance dure pour les doigts il y a ${recent.hours} h : reste en facile`); }
    }
    if (!reasons.length) reasons.push(r.when === 'warmup' ? 'à la fin de ton échauffement, comme d’habitude' : 'tel que tu l’as décrit');
    const sp = (r.sports || []).find((s) => sports.has(s));
    const near = phases[at - 1]?.type !== 'pause' ? phases[at - 1] : phases[at];
    const activity = sp || near?.activity || [...sports][0] || '';
    const advice = isSpray(r) ? sprayAdvice(o.history, o.now ?? Date.now(), { after: phases.slice(0, at), effort }) : null;
    const phase = {
      id: `ro-${r.id}`, type: 'routine', routineId: r.id, role: r.when === 'warmup' ? 'warmup' : r.when === 'cool' ? 'cool' : 'custom', roleLabel: r.label,
      activity, minutes, intensity: INT[effort], goal: r.label, libId: byId(r.libId) ? r.libId : advice?.libId || '', emoji: r.emoji || '🧩',
      note: [r.note, ...reasons.map((t) => t[0].toUpperCase() + t.slice(1)), advice ? `${advice.title} : ${advice.how.join(' ')}` : ''].filter(Boolean).join(' · ').slice(0, 400),
    };
    out.push({ r, ok: !missing.length, missing: missing.map((k) => EQUIPMENT[k] || k), at, minutes, effort, reasons, advice, phase });
  }
  return out;
}

/** Ajoute un moment à la structure ; le temps est pris sur la plus longue phase modifiable (jamais sous 10 min). */
export function insertRoutine(phases = [], sug) {
  const list = phases.map((p) => ({ ...p })), m = sug.phase.minutes;
  const donor = list.filter((p) => p.type !== 'pause' && p.type !== 'routine' && p.locks?.minutes !== 'user' && p.role !== 'warmup' && p.role !== 'cool' && (p.minutes || 0) - m >= 10).sort((a, b) => b.minutes - a.minutes)[0];
  if (donor) donor.minutes -= m;
  list.splice(Math.min(sug.at, list.length), 0, { ...sug.phase });
  return { phases: list, took: donor ? { name: pname(donor), minutes: m } : null };
}

/**
 * Conseil spray wall d'après les séances notées (14 derniers jours) : récupération si les doigts ont travaillé dur
 * récemment ou avant dans la séance, reprise après une pause, sinon la qualité la moins travaillée (puissance,
 * résistance, technique), en évitant de refaire le même type que la dernière séance de spray wall.
 */
export function sprayAdvice(history = [], now = Date.now(), o = {}) {
  const H = (history || []).filter((h) => h && (h.startedAt || 0) <= now);
  const recent = H.filter((h) => now - h.startedAt < 14 * 864e5), climbs = recent.filter((h) => exList(h).some((e) => e.group === 'doigts' || /^spray|climb|bloc|voie/.test(e.libId || '')));
  const lastSpray = H.filter((h) => exList(h).some((e) => /^spray-/.test(e.libId || ''))).sort((a, b) => b.startedAt - a.startedAt)[0];
  const lastType = lastSpray ? (exList(lastSpray).some((e) => e.libId === 'spray-limit') ? 'puissance' : exList(lastSpray).some((e) => e.libId === 'spray-silent') ? 'technique' : 'resistance') : '';
  const sprays30 = H.filter((h) => now - h.startedAt < 30 * 864e5 && exList(h).some((e) => /^spray-/.test(e.libId || ''))).length;
  const facts = [sprays30 ? `${sprays30} séance${sprays30 > 1 ? 's' : ''} de spray wall en 30 jours${lastType ? `, la dernière en ${lastType}` : ''}` : 'aucune séance de spray wall notée ces 30 jours'];
  const R = {
    recup: { title: 'Spray wall en volume facile', libId: 'spray-silent', how: ['Grosses prises, mouvements fluides, pieds précis.', 'Pas de mouvement à la limite aujourd’hui.'] },
    reprise: { title: 'Spray wall de reprise', libId: 'spray-circuits', how: ['Circuits faciles de 20 à 30 mouvements, 2 ou 3 fois.', 'Monte d’un cran seulement si tout est fluide.'] },
    puissance: { title: 'Spray wall puissance', libId: 'spray-limit', how: ['2 ou 3 blocs de 4 à 6 mouvements à ta limite.', '3 min de repos entre deux essais, arrête quand la qualité baisse.'] },
    resistance: { title: 'Spray wall résistance', libId: 'spray-circuits', how: ['Circuit de 25 à 40 mouvements, fini « dans le dur ».', '3 passages, 3 min de repos.'] },
    technique: { title: 'Spray wall technique', libId: 'spray-silent', how: ['Pieds silencieux ou pieds imposés.', 'Le même bloc de trois façons différentes.'] },
  };
  const pick = (k, why) => ({ focus: k, ...R[k], why: [why, ...facts].join(' · ') });
  const hardBefore = (o.after || []).filter((p) => isClimbPhase(p) && hardPhase(p));
  if (hardBefore.length || o.effort === 'easy') return pick('recup', hardBefore.length ? 'les doigts ont déjà travaillé dur dans cette séance' : 'effort facile demandé');
  const rf = recentFingerLoad(H, now); if (rf) return pick('recup', `séance dure pour les doigts il y a ${rf.hours} h`);
  if (!climbs.length) return pick('reprise', H.length ? 'pas d’escalade notée ces 14 derniers jours' : 'pas encore de séance notée : départ prudent');
  const score = { puissance: 0, resistance: 0, technique: 0 };
  for (const h of climbs) for (const e of exList(h)) {
    score.puissance += capOf(e.caps, 'puissance_haut') + capOf(e.caps, 'force_doigts') * 0.5;
    score.resistance += capOf(e.caps, 'endurance_doigts') + capOf(e.caps, 'endurance_aerobie') * 0.5;
    score.technique += capOf(e.caps, 'technique_escalade') + capOf(e.caps, 'technique_pieds');
  }
  const order = Object.keys(score).sort((a, b) => score[a] - score[b] || (a === lastType) - (b === lastType));
  const k = order[0] === lastType && order.length > 1 ? order[1] : order[0];
  return pick(k, `${k === 'puissance' ? 'la puissance' : k === 'resistance' ? 'la résistance' : 'la technique'} est ce que tu as le moins travaillé ces 14 jours`);
}
