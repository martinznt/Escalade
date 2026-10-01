// estimate.js — niveau conseillé d'une séance (débutant / intermédiaire / avancé), FACTUEL et explicable.
// Utilisé par le serveur quand une séance devient commune (filtres de la bibliothèque commune) et par le client.
//
// 8.28 (voir docs/PLAN_NIVEAU_SEANCE.md) :
// - le niveau = le PRÉREQUIS le plus élevé de la séance (niveau conseillé des fiches d'exercices, cotation indiquée),
//   jamais une moyenne pondérée : un seul exercice avancé suffit, et on sait lequel ;
// - chaque critère dit d'où il vient : « connu » (fiche, cotation écrite, séries écrites), « estimé » (durée, charge,
//   avec l'hypothèse utilisée) ou « inconnu » (exercice hors bibliothèque, cotation sans correspondance) ;
// - aucune valeur manquante n'est remplie par défaut ; une fiabilité (haute / moyenne / faible) le signale ;
// - plus de « score » décimal affiché : il donnait une fausse précision.
// Pur JavaScript, sans DOM. Jamais un classement de personnes.

import { byId, LIBRARY } from './library.js';
import { exKey, parseKg } from './shared.js';
import { BUILTIN_SYSTEMS, toReference, levelFromReference } from './grading.js';

export const LEVEL_LABEL = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };
const LEVELS = ['debutant', 'intermediaire', 'avance'];
const MIN_WORD = ['débutant', 'intermédiaire', 'avancé'];
const SPECIFIC = new Set(['hangboard', 'rings', 'barbell', 'pole', 'machine']);
// Hypothèses de durée, affichées telles quelles quand elles servent.
const REP_SEC = 3.5, CLIMB_SEC = 75, TRANSITION_SEC = 15;

function libOf(ex) {
  if (ex.libId && byId(ex.libId)) return byId(ex.libId);
  const k = exKey(ex.name || '');
  return (k && LIBRARY.find((x) => exKey(x.name) === k)) || null;
}
const isClimb = (ex) => /bloc|voie|essai/i.test(ex.unit || '') || /^(blocs?|voies?|essais)\b/i.test(String(ex.name || ''));
/** Cotation lue dans le nom d'une partie de grimpe (« Blocs 5+ », « Essais sur blocs 6A–6A+ ») : la plus haute reconnue. */
function climbGrade(ex) {
  const voie = /voie/i.test(ex.unit || '') || /^voies?/i.test(ex.name || ''), sys = BUILTIN_SYSTEMS[voie ? 'french' : 'font'];
  const labels = sys.levels.map((l) => l.label), tokens = String(ex.name || '').split(/[\s–\-·,()]+/);
  let best = -1;
  for (const t of tokens) { const i = labels.findIndex((l) => l.toLowerCase() === t.toLowerCase()); if (i > best) best = i; }
  return best >= 0 ? { index: best, label: labels[best], act: voie ? 'voie' : 'bloc', system: sys.name } : null;
}
/** Durée d'un exercice à partir de SES valeurs ; null si elles manquent (jamais de valeur inventée). */
function minutesOf(ex, lib) {
  const sets = Number(ex.sets) || null, side = ex.perSide ? 2 : 1;
  const time = ex.mode === 'time';
  const a = time ? ex.secMin ?? ex.secMax : ex.repsMin ?? ex.repsMax, b = time ? ex.secMax ?? ex.secMin : ex.repsMax ?? ex.repsMin;
  if (!sets || a == null) return null;
  const per = time ? 1 : ex.repSec > 0 ? ex.repSec : isClimb(ex) ? CLIMB_SEC : REP_SEC;
  const work = ((Number(a) + Number(b)) / 2) * per;
  return (sets * (work * side + TRANSITION_SEC) + Math.max(0, sets - 1) * (Number(ex.rest) || 0)) / 60;
}

/**
 * session : séance (normalisée ou non). Retourne
 * { level, confidence, reasons, criteria:[{label, value, effect, cat}], unknown:[], minutes, text }.
 * cat : 'connu' | 'estimé' | 'inconnu'. `effect` contient « élève le niveau » pour ce qui fixe le niveau.
 */
export function estimateLevel(session) {
  const all = Array.isArray(session?.exercises) ? session.exercises : [];
  const main = all.filter((e) => e && e.block !== 'warmup' && e.block !== 'cool');
  const list = main.length ? main : all.filter(Boolean);
  if (!list.length) return { level: 'debutant', confidence: 'faible', reasons: [], criteria: [{ label: 'Contenu', value: 'aucun exercice', effect: 'rien à analyser', cat: 'inconnu' }], unknown: ['La séance ne contient aucun exercice.'], minutes: 0, text: 'Séance vide : aucun niveau ne peut être établi.' };

  let req = 0; const reasons = [], unknown = [], specific = new Set();
  let recognized = 0, sets = 0, high = 0, minutes = 0, timed = 0, maxDiff = 0, maxDiffName = '';
  const loads = []; // charges écrites dans la séance (« +10 kg ») : un fait, rapporté tel quel
  for (const e of list) {
    const lib = libOf(e), climb = !lib && isClimb(e);
    if (lib) {
      recognized++;
      const ml = Number(lib.minLevel) || 0;
      if (ml > 0) reasons.push({ level: ml, text: `« ${e.name || lib.name} » : fiche de la bibliothèque, niveau conseillé ${MIN_WORD[ml]}` });
      req = Math.max(req, ml);
      if ((lib.diff || 0) > maxDiff) { maxDiff = lib.diff; maxDiffName = e.name || lib.name; }
      for (const n of e.needs?.length ? e.needs : lib.needs || []) if (SPECIFIC.has(n)) specific.add(n);
    } else if (climb) {
      const g = climbGrade(e);
      if (g) {
        recognized++;
        const ml = levelFromReference(g.index, g.act);
        if (ml > 0) reasons.push({ level: ml, text: `« ${e.name} » : cotation ${g.label} (${g.system}), repère ${MIN_WORD[ml]}` });
        req = Math.max(req, ml);
      } else unknown.push(`« ${e.name || 'grimpe'} » : cotation non reconnue (système personnel sans correspondance) — son niveau n’est pas compté.`);
    } else unknown.push(`« ${e.name || 'exercice'} » : absent de la bibliothèque — son niveau n’est pas connu.`);
    const kg = e.load ? parseKg(e.load) : null; if (kg > 0) loads.push({ name: e.name || lib?.name || 'exercice', kg });
    const s = Number(e.sets) || 0; sets += s;
    if ((e.intensity || lib?.intensity) === 'high') high += s;
    const m = minutesOf(e, lib); if (m != null) { minutes += m; timed++; } else unknown.push(`« ${e.name || 'exercice'} » : séries ou répétitions non renseignées — durée non comptée.`);
  }
  // Cotation indiquée par l'auteur de la séance : convertie seulement si une correspondance existe.
  const gh = session.gradeHint?.label ? session.gradeHint : null;
  if (gh) {
    const sys = BUILTIN_SYSTEMS[gh.systemId], act = sys?.activity === 'voie' ? 'voie' : 'bloc';
    const r = sys ? toReference(gh, BUILTIN_SYSTEMS, act) : null;
    if (r) { const ml = levelFromReference(r.index, act); if (ml > 0) reasons.push({ level: ml, text: `Repère d’escalade indiqué par l’auteur : ${gh.label} (${gh.systemName}), repère ${MIN_WORD[ml]}` }); req = Math.max(req, ml); }
    else unknown.push(`Repère d’escalade ${gh.label} (${gh.systemName}) : pas de correspondance avec l’échelle de référence — non compté.`);
  }
  const warmMin = all.filter((e) => e && (e.block === 'warmup' || e.block === 'cool')).reduce((t, e) => t + (minutesOf(e, libOf(e)) || 0), 0);
  minutes += warmMin;
  const declared = Number(session.durationMin) || 0;
  const level = LEVELS[req];
  const top = reasons.filter((r) => r.level === req);
  const share = list.length ? recognized / list.length : 0;
  const confidence = share === 1 && !unknown.length ? 'haute' : share >= 0.7 ? 'moyenne' : 'faible';
  const highShare = sets ? high / sets : 0;
  const criteria = [
    { label: 'Prérequis le plus élevé', value: top.length ? top.map((r) => r.text).slice(0, 3).join(' ; ') : 'aucun exercice ne demande plus que le niveau débutant', effect: req ? 'élève le niveau' : 'accessible', cat: 'connu' },
    { label: 'Exercices reconnus', value: `${recognized} sur ${list.length}`, effect: share === 1 ? 'analyse complète' : 'les autres ne sont pas comptés', cat: 'connu' },
    ...(maxDiff ? [{ label: 'Exercice le plus difficile (fiche)', value: `${maxDiff} / 5 (${maxDiffName})`, effect: 'information', cat: 'connu' }] : []),
    { label: 'Volume écrit', value: sets ? `${sets} séries` : 'non renseigné', effect: 'information', cat: sets ? 'connu' : 'inconnu' },
    { label: 'Part des séries intenses', value: sets ? `${Math.round(highShare * 100)} %` : '—', effect: 'information', cat: sets ? 'connu' : 'inconnu' },
    { label: 'Durée', value: declared ? `${declared} min (indiquée)` : timed ? `~${Math.round(minutes)} min${timed < list.length ? ` pour ${timed} exercice(s) sur ${list.length}` : ''}` : 'inconnue', effect: declared ? 'information' : `estimée : ~${REP_SEC} s par répétition, ~${CLIMB_SEC} s par bloc, ${TRANSITION_SEC} s de mise en place par série, repos écrits`, cat: declared ? 'connu' : timed ? 'estimé' : 'inconnu' },
    ...(loads.length ? [{ label: 'Charges écrites', value: loads.slice(0, 4).map((l) => `${l.name} : ${l.kg} kg`).join(' ; '), effect: 'rapportées telles quelles (leur poids réel dépend de ton poids de corps)', cat: 'connu' }] : []),
    { label: 'Matériel spécifique', value: specific.size ? [...specific].join(', ') : 'aucun', effect: specific.size ? 'demande un équipement particulier' : 'accessible partout', cat: 'connu' },
  ];
  const why = top.length ? `parce que ${top[0].text.replace(/^« /, '« ')}` : 'aucun exercice reconnu ne demande plus';
  return {
    level, confidence, reasons, loads, criteria, unknown: [...new Set(unknown)], minutes: Math.round(declared || minutes),
    text: `Niveau conseillé : ${LEVEL_LABEL[level].toLowerCase()} — ${why}. Fiabilité ${confidence}${unknown.length ? ` (${unknown.length} point${unknown.length > 1 ? 's' : ''} inconnu${unknown.length > 1 ? 's' : ''})` : ''}. C’est un repère, pas une vérité.`,
  };
}
