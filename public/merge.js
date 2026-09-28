// merge.js — fusionner des séances (les originales restent intactes) et conseiller quoi fusionner.
// Sans DOM, testé. Les conseils s'appuient sur des sources vérifiées (sources.js).
import { normalizeSession, normalizeEx, uid, exKey } from './shared.js';
import { exMinutes, sessionMinutes } from './engine.js';
import { byId } from './library.js';
import { sportsOf } from './sfilter.js';

const capsOf = (s) => { const out = {}; for (const e of s.exercises.filter((x) => x.block === 'main')) for (const [c, w] of Object.entries(e.caps && Object.keys(e.caps).length ? e.caps : byId(e.libId)?.caps || {})) out[c] = (out[c] || 0) + w * (e.sets || 1); return out; };
const FRESH = { technique_escalade: 1, technique_pieds: 1, coordination: 1, explosivite: 1, puissance_haut: 1, force_doigts: 1, blocage: 0.7, force_jambes: 0.6, tirage_vertical: 0.6, vitesse: 0.8 };
const TIRING = { endurance_aerobie: 1, endurance_doigts: 1, seuil: 1, gainage_anterieur: 0.4, gainage_lateral: 0.4, mobilite_hanches: 0.6, mobilite_epaules: 0.6 };
/** Ce que la séance demande d'être « frais » (technique, puissance, doigts) plutôt qu'endurance ou mobilité. */
export function freshness(s) {
  const c = capsOf(s), tot = Object.values(c).reduce((t, w) => t + w, 0) || 1;
  let f = 0; for (const [k, w] of Object.entries(c)) f += w * (FRESH[k] || 0) - w * (TIRING[k] || 0) * 0.8;
  return f / tot;
}
const fingerHeavy = (s) => s.exercises.some((e) => (e.risk === 'finger' || byId(e.libId)?.risk === 'finger') && (e.intensity === 'high' || byId(e.libId)?.intensity === 'high'))
  || (capsOf(s).force_doigts || 0) >= 6;
function overlap(a, b) {
  const ca = capsOf(a), cb = capsOf(b), keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  let dot = 0, na = 0, nb = 0; for (const k of keys) { dot += (ca[k] || 0) * (cb[k] || 0); na += (ca[k] || 0) ** 2; nb += (cb[k] || 0) ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** Ordre conseillé : ce qui demande d'être frais d'abord (technique, puissance, doigts), l'endurance et la mobilité ensuite. */
export const orderForMerge = (list) => list.slice().sort((a, b) => freshness(b) - freshness(a));
/**
 * Conseil pour fusionner ces séances : note sur 100, points forts, points d'attention, ordre conseillé.
 * Règles simples et expliquées ; aucune donnée inventée.
 */
export function mergeAdvice(list) {
  const ss = list.map((s) => normalizeSession(s)).filter((s) => s.exercises.length);
  if (ss.length < 2) return { score: 0, pros: [], cons: ['Choisis au moins deux séances.'], order: ss, minutes: 0, sources: [] };
  const minutes = Math.round(ss.reduce((t, s) => t + sessionMinutes({ exercises: s.exercises.filter((e) => e.block === 'main') }), 0) + 15);
  const pros = [], cons = [], sources = new Set(); let score = 70;
  const ov = []; for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) ov.push(overlap(ss[i], ss[j]));
  const maxOv = Math.max(...ov);
  if (maxOv < 0.35) { score += 15; pros.push('Complémentaires : elles travaillent des choses différentes.'); }
  else if (maxOv > 0.75) { score -= 20; cons.push('Elles travaillent presque la même chose : fusionnées, c’est surtout plus de volume sur les mêmes muscles.'); }
  if (new Set(ss.map((s) => s.activity)).size > 1) { score += 5; pros.push('Plusieurs sports dans une séance : varié, et chaque partie garde son rôle.'); }
  if (minutes <= 90) { score += 5; pros.push(`Durée raisonnable (environ ${minutes} min, un seul échauffement).`); }
  else if (minutes > 150) { score -= 20; cons.push(`Très longue (environ ${minutes} min) : la fatigue baisse la qualité de la fin.`); }
  else cons.push(`Assez longue (environ ${minutes} min) : prévois de quoi boire et une petite pause.`);
  if (ss.filter(fingerHeavy).length >= 2) { score -= 25; cons.push('Les doigts travaillent fort dans les deux : risque de surcharge des poulies. Garde une seule partie intense pour les doigts.'); sources.add('schoffl2006'); }
  const order = orderForMerge(ss);
  if (order.some((s, i) => s.id !== ss[i].id)) { cons.push(`Ordre conseillé : ${order.map((s) => `« ${s.name} »`).join(' puis ')} (le plus technique et le plus intense d’abord, quand tu es frais).`); sources.add('acsm2009'); }
  else { pros.push('Bon ordre : le plus technique et le plus intense d’abord.'); sources.add('acsm2009'); }
  return { score: Math.max(0, Math.min(100, score)), pros, cons, order, minutes, sources: [...sources] };
}
/** Les meilleures paires à fusionner parmi ses séances. */
export function bestMerges(sessions, n = 5) {
  const ss = sessions.filter((s) => !s.archived && s.exercises?.length), out = [];
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) { const a = mergeAdvice([ss[i], ss[j]]); out.push({ ids: a.order.map((s) => s.id), names: a.order.map((s) => s.name), ...a }); }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
/**
 * Nouvelle séance faite des séances données, dans l'ordre donné. Un seul échauffement (le plus long) au début,
 * un seul retour au calme à la fin ; les exercices en double ne sont gardés qu'une fois. Les originales ne changent pas.
 */
export function mergeSessions(list, { name = '' } = {}) {
  const ss = list.map((s) => normalizeSession(s)).filter((s) => s.exercises.length);
  const pick = (block) => ss.map((s) => s.exercises.filter((e) => e.block === block)).sort((a, b) => b.reduce((t, e) => t + exMinutes(e), 0) - a.reduce((t, e) => t + exMinutes(e), 0))[0] || [];
  const warm = pick('warmup'), cool = pick('cool'), seen = new Set(), main = [], skipped = [];
  for (const s of ss) for (const e of s.exercises.filter((x) => x.block === 'main')) {
    const k = e.libId || exKey(e.name); if (seen.has(k)) { skipped.push(e.name); continue; } seen.add(k);
    main.push({ ...e, part: `${s.emoji || '📋'} ${s.name}`.slice(0, 40) });
  }
  const exercises = [...warm.map((e) => ({ ...e, part: '🔥 Échauffement' })), ...main, ...cool.map((e) => ({ ...e, part: '🌬️ Retour au calme' }))].map((e) => normalizeEx({ ...e, id: uid() }));
  const now = Date.now();
  return normalizeSession({
    id: uid(), name: (name || ss.map((s) => s.name).join(' + ')).slice(0, 100), emoji: '🔀', source: 'merge', activity: ss[0]?.activity || '', sports: [...new Set(ss.flatMap(sportsOf))],
    context: new Set(ss.map((s) => s.context?.env || '')).size === 1 && ss[0]?.context?.env ? { env: ss[0].context.env, envName: ss[0].context.envName } : {},
    exercises, durationMin: sessionMinutes({ exercises }), createdAt: now, updatedAt: now,
    notes: [{ title: 'Séance fusionnée', text: `Faite à partir de : ${ss.map((s) => `« ${s.name} »`).join(', ')}. Les séances d’origine n’ont pas changé.${skipped.length ? ` Exercices en double gardés une seule fois : ${[...new Set(skipped)].join(', ')}.` : ''}` }],
  });
}
