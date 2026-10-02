// live.js — pendant la séance (sans DOM, testé) :
//  · ressenti d'une série (facile / bien / dur / échec) → la série suivante s'ajuste (charge, répétitions, durée) ;
//  · repos utile : un conseil court selon l'exercice qui suit (respiration, détente, eau…) ;
//  · « enchaîner par deux » (superset) pour gagner du temps : deux exercices de groupes différents alternés ;
//  · regroupement du journal de séance (un exercice coupé en séries alternées redevient un seul exercice) ;
//  · refaire une séance passée (« ma dernière séance », « la même que mardi ») ;
//  · reprise d'une séance interrompue : ce qui est gardé, et pour combien de temps.
import { normalizeEx, normalizeSession, uid, exKey } from './shared.js';

export const FEELS = [[1, '😌', 'Facile'], [2, '🙂', 'Bien'], [3, '😤', 'Dur'], [4, '❌', 'Échec']];
const r05 = (x) => Math.round(x * 2) / 2;
/**
 * Série suivante selon le ressenti de celle qu'on vient de faire (règles simples, toujours prudentes) :
 * facile → +2,5 kg (ou +5 % au-delà de 50 kg), sinon +1 à 2 répétitions, ou +5 s ; bien / dur → on garde ;
 * échec → −5 % de charge (au moins 1 kg), sinon −2 répétitions (jamais sous 1), ou −5 s.
 */
export function nextSetAdvice(ex, cur = {}, feel = 0) {
  const load = Number(cur.load) || 0, reps = Number(cur.reps) || 0, secs = Number(cur.secs) || 0, time = ex?.mode === 'time';
  const out = { load, reps, secs, text: '' };
  if (feel === 1) {
    if (load > 0) { out.load = r05(load >= 50 ? load * 1.05 : load + 2.5); out.text = `Série facile : essaie ${String(out.load).replace('.', ',')} kg.`; }
    else if (time) { out.secs = secs + 5; out.text = `Série facile : ${out.secs} s la prochaine fois.`; }
    else { out.reps = reps + (reps >= 10 ? 2 : 1); out.text = `Série facile : vise ${out.reps} répétitions.`; }
  } else if (feel === 4) {
    if (load > 0) { out.load = r05(Math.max(0, Math.min(load - 1, load * 0.95))); out.text = `Échec : on descend à ${String(out.load).replace('.', ',')} kg pour garder des séries propres.`; }
    else if (time) { out.secs = Math.max(5, secs - 5); out.text = `Échec : ${out.secs} s pour la suivante.`; }
    else { out.reps = Math.max(1, reps - 2); out.text = `Échec : vise ${out.reps} répétitions, propres.`; }
  } else if (feel === 3) out.text = 'Dur : on garde la même chose, sans forcer davantage.';
  else if (feel === 2) out.text = 'Bien : on garde la même chose.';
  return out;
}
/** Conseil de repos (un seul, court) selon l'exercice qui suit et le temps déjà passé. */
export function restTip(next, { minutes = 0, restSec = 60, k = 0 } = {}) {
  const n = String(next?.name || '').toLowerCase(), g = next?.group || '';
  const tips = [];
  if (minutes >= 20 && k % 3 === 0) tips.push('💧 Quelques gorgées d’eau.');
  if (g === 'doigts' || /suspen|poutre|réglette|bloc|voie/.test(n)) tips.push('🖐️ Secoue les mains bras le long du corps, ouvre et ferme les doigts doucement.');
  if (g === 'jambes' || /squat|fente|saut|course|sprint/.test(n)) tips.push('🦵 Marche un peu plutôt que de t’asseoir : la récupération est meilleure.');
  if (g === 'pousser' || g === 'tirer' || /traction|pompe|dips|développé|rowing/.test(n)) tips.push('🫁 Respire lentement : inspire 4 s, expire 6 s.');
  if (restSec >= 120) tips.push('🧠 Visualise la prochaine série : placement, rythme, respiration.');
  tips.push('🫁 Respire par le ventre, épaules relâchées.');
  return tips[k % tips.length];
}
/**
 * « Enchaîner par deux » : les exercices principaux consécutifs de groupes différents sont alternés série par série
 * (A1, B1, repos, A2, B2…). Le repos entre A et B est supprimé ; le repos après B reste celui de l'exercice le plus
 * exigeant. Les exercices d'échauffement, de retour au calme et ceux en tours (circuits) restent tels quels.
 */
export function toSupersets(exercises = []) {
  const ex = exercises.map((e) => normalizeEx(e)), out = [];
  const pairable = (e) => (e.block || 'main') === 'main' && !e.perSide && (e.sets || 1) >= 2 && !e.rounds;
  let k = 0;
  for (let i = 0; i < ex.length; i++) {
    const a = ex[i], b = ex[i + 1];
    if (b && pairable(a) && pairable(b) && (a.group || 'a') !== (b.group || 'b') && Math.abs((a.sets || 1) - (b.sets || 1)) <= 1) {
      const n = Math.max(a.sets, b.sets), rest = Math.max(a.rest || 60, b.rest || 60), tag = `⚡ Par deux n°${++k}`;
      for (let s = 0; s < n; s++) {
        if (s < a.sets) out.push(normalizeEx({ ...a, id: uid(), sets: 1, rest: s < b.sets ? 0 : rest, part: tag }));
        if (s < b.sets) out.push(normalizeEx({ ...b, id: uid(), sets: 1, rest, part: tag }));
      }
      i++;
    } else out.push(a);
  }
  return out;
}
/** Journal de séance : un exercice découpé (superset) redevient un seul exercice avec toutes ses séries, dans l'ordre. */
export function mergeLog(log = []) {
  const out = [], at = new Map();
  for (const l of log) {
    if (!l?.sets?.length) continue;
    const k = `${exKey(l.name)}|${l.libId || ''}`;
    if (at.has(k)) { const t = out[at.get(k)]; t.sets = [...t.sets, ...l.sets]; if (l.note) t.note = [t.note, l.note].filter(Boolean).join(' · ').slice(0, 200); }
    else { at.set(k, out.length); out.push({ ...l, sets: [...l.sets] }); }
  }
  return out;
}
/** Refaire une séance passée : les mêmes exercices, séries et charges (dernière série faite), sans les séries ratées. */
export function sessionFromHistory(h, seance = null) {
  if (seance?.exercises?.length) return normalizeSession({ ...seance, id: seance.id });
  const exercises = (h?.data?.exercises || []).filter((e) => (e.sets || []).some((s) => s.done !== false)).map((e) => {
    const sets = e.sets.filter((s) => s.done !== false), last = sets.at(-1) || {}, time = sets.some((s) => Number(s.seconds) > 0) && !sets.some((s) => Number(s.reps) > 0);
    const v = time ? Math.max(1, Number(last.seconds) || 30) : Math.max(1, Number(last.reps) || 8);
    return normalizeEx({ name: e.name, libId: e.libId || '', group: e.group || '', mode: time ? 'time' : 'reps', sets: sets.length, ...(time ? { secMin: v, secMax: v } : { repsMin: v, repsMax: v }), load: Number(last.load) > 0 ? `${last.load} kg` : '', rest: 90, block: 'main' });
  });
  return normalizeSession({ id: uid(), name: `${h?.sessionName || 'Séance'} (à refaire)`, emoji: '🔁', activity: h?.data?.activity || '', exercises });
}
const JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
/** « ma dernière séance », « la même que mardi », « celle d'hier » → la séance correspondante de l'historique. */
export function findHistory(history = [], text = '', now = Date.now()) {
  const t = String(text).toLowerCase(), list = [...history].filter((h) => h?.startedAt <= now).sort((a, b) => b.startedAt - a.startedAt);
  if (/hier/.test(t)) { const d = new Date(now); d.setDate(d.getDate() - 1); return list.find((h) => new Date(h.startedAt).toDateString() === d.toDateString()) || null; }
  const day = Object.keys(JOURS).find((j) => t.includes(j));
  if (day) return list.find((h) => new Date(h.startedAt).getDay() === JOURS[day] && now - h.startedAt < 14 * 86400000) || null;
  if (/derni|précédente|precedente|même|meme|refai/.test(t)) return list[0] || null;
  return null;
}
/** Instantané d'une séance en cours (pour la reprendre après une fermeture) : rien de ce qui dépend de l'horloge. */
export function snapshot(p, now = Date.now()) {
  if (!p || p.phase === 'done') return null;
  return { at: now, s: p.s, i: p.i, set: p.set, side: p.side || 0, log: p.log, startedAt: p.startedAt, eventId: p.eventId || null, fromGenerator: !!p.fromGenerator, program: p.program || null, warmAdded: p.warmAdded || 0, swaps: p.swaps || [], adapted: !!p.adapted, elapsed: Math.max(0, now - p.startedAt - (p.pausedMs || 0)) };
}
export const SNAP_MAX = 12 * 3600000;
/** Reprendre : utilisable seulement moins de 12 h après, et s'il reste quelque chose à faire. */
export function canResume(snap, now = Date.now()) {
  return !!snap && now - (snap.at || 0) < SNAP_MAX && Array.isArray(snap.s?.exercises) && snap.i < snap.s.exercises.length && Array.isArray(snap.log);
}
