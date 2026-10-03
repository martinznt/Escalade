// gym.js — « Ma salle de sport » (sans DOM, testé) :
//  · les machines rangées par zone, avec des modèles de salle (petite, classique, complète) pour cocher vite ;
//  · la séance du jour selon un découpage (corps entier, haut / bas, poussée / tirage / jambes, un muscle), un but
//    (force, muscle, tonification), une durée et le matériel de TA salle ; machines d'abord si tu le souhaites ;
//  · le jour suivant du découpage, d'après tes dernières séances de salle ;
//  · ton carnet de machines : dernière charge, meilleure, charge max estimée, réglage noté, prochaine charge conseillée.
// Seulement des exercices de la bibliothèque, avec le matériel disponible : rien d'inventé.
import { LIBRARY, byId } from './library.js';
import { MACHINES } from './model.js';
import { normalizeEx, normalizeSession, uid, exKey } from './shared.js';
import { exMinutes, progressHint } from './engine.js';
import { oneRM } from './sports.js';

/** Zones de la salle : ce qu'on coche pour décrire SA salle. */
export const GYM_ZONES = [
  ['🦵 Jambes et fessiers', ['legpress', 'hacksquat', 'smith', 'legext', 'legcurl', 'lyinglegcurl', 'hipmachine', 'hipthrustmachine', 'glutemachine', 'calfmachine', 'calfseated']],
  ['🔙 Dos', ['latpulldown', 'seatedrow', 'tbar', 'pullovermachine', 'assist', 'ghd']],
  ['🫁 Poitrine', ['chestpress', 'inclinepress', 'pecdeck', 'dipmachine']],
  ['🏔️ Épaules et bras', ['shoulderpress', 'lateralmachine', 'bicepsmachine', 'tricepsmachine', 'cable']],
  ['🧱 Abdos', ['abmachine', 'rotary']],
  ['🏋️ Poids libres', ['weights', 'barbell', 'ezbar', 'rack', 'bench', 'kettlebell', 'bar', 'dips']],
  ['❤️ Cardio', ['treadmill', 'bike', 'rower', 'elliptical', 'stairs', 'skierg', 'airbike']],
];
/** Modèles pour cocher vite (on ajuste ensuite machine par machine). */
export const GYM_PRESETS = {
  petite: ['Petite salle', ['weights', 'bench', 'bar', 'cable', 'latpulldown', 'seatedrow', 'legpress', 'chestpress', 'legext', 'legcurl', 'abmachine', 'treadmill', 'bike']],
  classique: ['Salle classique', ['weights', 'barbell', 'ezbar', 'rack', 'bench', 'kettlebell', 'bar', 'dips', 'cable', 'latpulldown', 'seatedrow', 'legpress', 'hacksquat', 'smith', 'legext', 'legcurl', 'hipmachine', 'calfmachine', 'chestpress', 'inclinepress', 'pecdeck', 'shoulderpress', 'abmachine', 'assist', 'treadmill', 'bike', 'rower', 'elliptical', 'stairs']],
  complete: ['Grande salle complète', [...new Set(GYM_ZONES.flatMap(([, k]) => k))]],
};
export const isMachine = (x) => (x?.needs || []).some((n) => MACHINES.includes(n));

/* ───────── Découpages et emplacements ───────── */
const P = (x) => x.prim || [];
const has = (x, ...m) => P(x).some((p) => m.includes(p));
// Chaque emplacement : [nom, test sur l'exercice, polyarticulaire ?]
const SLOT = {
  pecsPoly: ['Pectoraux (développé)', (x) => x.pattern === 'poussee' && P(x)[0] === 'pectoraux' && !has(x, 'deltoide_ant'), true],
  pecsHaut: ['Haut des pectoraux', (x) => x.pattern === 'poussee' && has(x, 'pectoraux') && has(x, 'deltoide_ant'), true],
  pecsIso: ['Pectoraux (écarté)', (x) => x.pattern === 'ecarte', false],
  epaulesPoly: ['Épaules (développé)', (x) => x.pattern === 'poussee' && P(x)[0] === 'deltoide_ant', true],
  epaulesLat: ['Épaules (côtés)', (x) => x.pattern === 'elevation_laterale', false],
  epaulesArr: ['Arrière des épaules', (x) => has(x, 'deltoide_post') && ['prevention', 'ecarte'].includes(x.pattern), false],
  triceps: ['Triceps', (x) => x.pattern === 'extension_coude' || (x.pattern === 'poussee' && P(x)[0] === 'triceps'), false],
  dosVert: ['Dos (tirage vertical)', (x) => x.pattern === 'traction' || x.pattern === 'tirage_vertical', true],
  dosHoriz: ['Dos (rowing)', (x) => x.pattern === 'rowing' || x.pattern === 'tirage_horizontal', true],
  biceps: ['Biceps', (x) => x.pattern === 'curl', false],
  quadsPoly: ['Jambes (squat, presse)', (x) => x.pattern === 'squat' && has(x, 'quadriceps'), true],
  charniere: ['Fessiers et ischios (charnière)', (x) => x.pattern === 'charniere' && (has(x, 'ischios') || /thrust/.test(x.id)), true],
  fente: ['Jambes (une à la fois)', (x) => x.pattern === 'fente', true],
  quadsIso: ['Quadriceps (isolé)', (x) => x.pattern === 'extension_genou', false],
  ischios: ['Ischios (leg curl)', (x) => x.pattern === 'flexion_genou', false],
  fessiers: ['Fessiers (isolé)', (x) => (x.pattern === 'charniere' && P(x)[0] === 'grand_fessier') || x.pattern === 'abduction', false],
  mollets: ['Mollets', (x) => x.pattern === 'mollets', false],
  abdos: ['Abdos', (x) => ['gainage', 'rotation'].includes(x.pattern) && has(x, 'grand_droit', 'obliques'), false],
};
export const SPLITS = {
  full: ['Corps entier', [['full', 'Corps entier']]],
  ul: ['Haut / Bas', [['haut', 'Haut du corps'], ['bas', 'Bas du corps']]],
  ppl: ['Poussée / Tirage / Jambes', [['push', 'Poussée : pecs, épaules, triceps'], ['pull', 'Tirage : dos, biceps'], ['legs', 'Jambes et fessiers']]],
  muscle: ['Un muscle', [['pecs', 'Pectoraux'], ['dos', 'Dos'], ['jambes', 'Jambes'], ['epaules', 'Épaules'], ['bras', 'Bras'], ['fessiers', 'Fessiers'], ['abdos', 'Abdos']]],
};
const DAY_SLOTS = {
  full: ['quadsPoly', 'pecsPoly', 'dosHoriz', 'charniere', 'dosVert', 'epaulesPoly', 'abdos', 'epaulesLat', 'biceps', 'triceps'],
  haut: ['pecsPoly', 'dosHoriz', 'epaulesPoly', 'dosVert', 'pecsHaut', 'epaulesLat', 'biceps', 'triceps', 'epaulesArr'],
  bas: ['quadsPoly', 'charniere', 'fente', 'quadsIso', 'ischios', 'fessiers', 'mollets', 'abdos'],
  push: ['pecsPoly', 'epaulesPoly', 'pecsHaut', 'pecsIso', 'epaulesLat', 'triceps', 'triceps'],
  pull: ['dosVert', 'dosHoriz', 'dosHoriz', 'epaulesArr', 'biceps', 'biceps', 'abdos'],
  legs: ['quadsPoly', 'charniere', 'quadsIso', 'ischios', 'fente', 'fessiers', 'mollets'],
  pecs: ['pecsPoly', 'pecsHaut', 'pecsIso', 'pecsPoly', 'triceps'],
  dos: ['dosVert', 'dosHoriz', 'dosVert', 'dosHoriz', 'epaulesArr', 'biceps'],
  jambes: ['quadsPoly', 'charniere', 'quadsIso', 'ischios', 'fente', 'mollets'],
  epaules: ['epaulesPoly', 'epaulesLat', 'epaulesArr', 'epaulesLat', 'epaulesPoly'],
  bras: ['biceps', 'triceps', 'biceps', 'triceps', 'biceps', 'triceps'],
  fessiers: ['charniere', 'fessiers', 'fente', 'fessiers', 'quadsPoly'],
  abdos: ['abdos', 'abdos', 'abdos', 'abdos'],
};
export const DAY_LABEL = Object.fromEntries(Object.values(SPLITS).flatMap(([, days]) => days));
/** But → séries, répétitions, repos (repères classiques de la musculation). */
export const GOALS = {
  force: ['Force', 'Charges lourdes, peu de répétitions, longs repos', { sets: 4, reps: [4, 6], rest: 150, isoReps: [8, 10], isoRest: 90 }],
  muscle: ['Prise de muscle', 'Charges moyennes, 8 à 12 répétitions, repos moyens', { sets: 3, reps: [8, 12], rest: 90, isoReps: [10, 15], isoRest: 60 }],
  tonus: ['Tonification et endurance', 'Charges légères, 12 à 20 répétitions, repos courts', { sets: 3, reps: [12, 15], rest: 60, isoReps: [15, 20], isoRest: 45 }],
};

/* ───────── Historique : charges et réglages ───────── */
const doneSets = (e) => (e.sets || []).filter((s) => s.done !== false && Number(s.reps) > 0);
/** Dernière séance où cet exercice a été fait (libId ou même nom). */
function lastOf(history, lib) {
  const key = exKey(lib.name);
  for (const h of [...history].sort((a, b) => b.startedAt - a.startedAt)) {
    const e = (h.data?.exercises || []).find((x) => x.libId === lib.id || exKey(x.name) === key);
    if (e && doneSets(e).length) return { at: h.startedAt, ex: e };
  }
  return null;
}
/** Carnet des machines et poids libres utilisés : dernière charge, meilleure, 1RM estimée, réglage, prochaine charge. */
export function machineBook(history = [], setups = []) {
  const by = new Map();
  for (const h of history) for (const e of h.data?.exercises || []) {
    const lib = byId(e.libId) || LIBRARY.find((x) => exKey(x.name) === exKey(e.name)); if (!lib || !(lib.acts || []).includes('strength')) continue;
    const sets = doneSets(e).filter((s) => Number(s.load) > 0); if (!sets.length) continue;
    const o = by.get(lib.id) || { lib, sessions: 0, last: null, best: 0, rm: 0 };
    o.sessions++;
    const top = sets.reduce((a, b) => (Number(b.load) > Number(a.load) ? b : a));
    if (!o.last || h.startedAt > o.last.at) o.last = { at: h.startedAt, load: Number(top.load), reps: Number(top.reps) };
    o.best = Math.max(o.best, ...sets.map((s) => Number(s.load)));
    o.rm = Math.max(o.rm, ...sets.map((s) => oneRM(Number(s.load), Number(s.reps)) || 0));
    by.set(lib.id, o);
  }
  return [...by.values()].map((o) => {
    const setup = setups.find((s) => s.key === o.lib.id || s.key === exKey(o.lib.name))?.setup || '';
    let next = null; try { next = progressHint({ name: o.lib.name, libId: o.lib.id, mode: o.lib.mode }, history)?.nextLoad ?? null; } catch { /* rien */ }
    return { id: o.lib.id, name: o.lib.name, emoji: o.lib.emoji, machine: isMachine(o.lib), sessions: o.sessions, last: o.last, best: o.best, rm: Math.round(o.rm * 2) / 2, setup, next };
  }).sort((a, b) => b.last.at - a.last.at);
}

/** Prochain jour du découpage : celui qui suit le dernier fait (d'après le nom des séances de salle). */
export function nextDay(history = [], split = 'ppl') {
  const days = SPLITS[split]?.[1] || SPLITS.ppl[1];
  const last = [...history].sort((a, b) => b.startedAt - a.startedAt).find((h) => h.data?.gymDay && days.some(([d]) => d === h.data.gymDay));
  if (!last) return days[0][0];
  const i = days.findIndex(([d]) => d === last.data.gymDay);
  return days[(i + 1) % days.length][0];
}

/* ───────── Séance du jour ───────── */
const canDo = (x, eq) => (x.needs || []).every((n) => eq.has(n));
const LEVELS = ['débutant', 'intermédiaire', 'avancé'];
/**
 * Séance de salle : pour chaque emplacement du jour, le meilleur exercice faisable dans TA salle.
 * Préférence : un exercice déjà fait (continuité des charges), une machine si `machinesFirst` (ou si débutant),
 * puis le plus simple techniquement pour un débutant. Le nombre d'exercices suit la durée.
 */
export function buildGymSession({ day = 'full', goal = 'muscle', minutes = 60, level = 1, equipment = new Set(), history = [], machinesFirst = false, exclude = [] } = {}) {
  const slots = DAY_SLOTS[day] || DAY_SLOTS.full, G = GOALS[goal]?.[2] || GOALS.muscle[2], eq = equipment instanceof Set ? equipment : new Set(equipment);
  const pool = LIBRARY.filter((x) => x.role === 'main' && (x.acts || []).includes('strength') && canDo(x, eq) && (x.minLevel || 0) <= level && !exclude.includes(x.id) && x.mode !== 'time' && x.pattern !== 'cardio');
  const used = new Set(), out = [], why = [];
  const warm = [byId('wu-pulse'), byId(['bas', 'legs', 'jambes', 'fessiers'].includes(day) ? 'wu-mob-lower' : 'wu-mob-upper')].filter(Boolean);
  let total = 0;
  for (const w of warm) { const e = normalizeEx({ ...w, id: uid(), libId: w.id, block: 'warmup', ok: w.cues, bad: w.bad, sets: 1 }); out.push(e); total += exMinutes(e); }
  const budget = minutes - 3;
  for (const slot of slots) {
    const [label, test, poly] = SLOT[slot];
    const cand = pool.filter((x) => !used.has(x.id) && test(x) && (x.diff || 1) <= level + 2); // jamais trop technique pour le niveau
    if (!cand.length) continue;
    // En salle, un exercice chargé (machine, haltères, barre) passe avant le poids du corps.
    const score = (x) => (lastOf(history, x) ? 3 : 0) + ((x.needs || []).length || ['traction'].includes(x.pattern) ? 0.5 : -1.2) - (/pullover/.test(x.id) && slot === 'dosVert' ? 0.8 : 0) - Math.max(0, (x.diff || 1) - (level + 2)) * 1.5 + (poly && level >= 1 && (x.needs || []).includes('barbell') && !machinesFirst ? 0.4 : 0) + (isMachine(x) && (machinesFirst || level === 0) ? 2 : 0) + (level === 0 ? -(x.diff || 1) * 0.5 : 0) + (poly && !isMachine(x) && level >= 1 && !machinesFirst ? 0.6 : 0);
    const pick = cand.sort((a, b) => score(b) - score(a) || (a.diff || 1) - (b.diff || 1) || a.id.localeCompare(b.id))[0];
    const iso = !poly, reps = iso ? G.isoReps : G.reps, rest = iso ? G.isoRest : G.rest, sets = Math.max(2, (iso ? G.sets - 1 : G.sets) - (level === 0 ? 1 : 0));
    const last = lastOf(history, pick), lastLoad = last ? Math.max(...doneSets(last.ex).map((s) => Number(s.load) || 0)) : 0;
    let next = null; try { next = last ? progressHint({ name: pick.name, libId: pick.id, mode: pick.mode }, history)?.nextLoad : null; } catch { /* rien */ }
    const load = next || lastLoad;
    const e = normalizeEx({ ...pick, id: uid(), libId: pick.id, block: 'main', ok: pick.cues, bad: pick.bad, sets, repsMin: reps[0], repsMax: reps[1], rest, load: load ? `${String(load).replace('.', ',')} kg` : pick.load || '', note: last ? `Dernière fois : ${String(lastLoad).replace('.', ',')} kg` : '' });
    const m = exMinutes(e);
    const nMain = out.filter((x) => x.block === 'main').length;
    if (nMain >= Math.max(3, Math.round(minutes / 7.5)) || (total + m > budget && nMain >= 3)) break;
    out.push(e); used.add(pick.id); total += m;
    why.push(`${label} : ${pick.name}${isMachine(pick) ? ' (machine)' : ''}`);
  }
  const mains = out.filter((x) => x.block === 'main');
  const cool = byId('cd-breath'); if (cool) out.push(normalizeEx({ ...cool, id: uid(), libId: cool.id, block: 'cool', ok: cool.cues, sets: 1 }));
  const dayLabel = DAY_LABEL[day] || day;
  return normalizeSession({
    id: uid(), name: `🏋️ Salle · ${dayLabel.split(' :')[0]}`, emoji: '🏋️', activity: 'strength', goal: goal === 'force' ? 'force' : goal === 'muscle' ? 'muscle' : 'forme',
    tags: [`salle-${day}`], exercises: out,
    notes: [{ title: 'Pourquoi cette séance', text: `${dayLabel}, but « ${GOALS[goal]?.[0] || goal} » (${GOALS[goal]?.[1] || ''}), niveau ${LEVELS[level]}, avec le matériel de ta salle. ${mains.length} exercices : ${why.join(' ; ')}. Les charges proposées viennent de tes dernières séances (règle des 2 séances) ; sans historique, commence léger et note ce que tu soulèves.` }],
  });
}
