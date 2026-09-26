// brain.js — « Training Brain » : analyses descriptives et explicables de l'historique et du profil.
// Principes (cahier des charges §1.22–25, §5, §15) :
//  - on compare l'utilisateur uniquement à lui-même (aucun classement, aucune comparaison sociale) ;
//  - chaque analyse sépare les FAITS (mesuré / déclaré / calculé) des INFÉRENCES (estimé) et liste les données manquantes ;
//  - aucune valeur n'est inventée ; les analyses de charge sont descriptives, jamais médicales ;
//  - une séance datée dans le futur n'est jamais traitée comme réalisée.
// Pur JavaScript, sans DOM : testé avec Node (tests/brain.test.mjs).

import { CAPACITIES, MUSCLES, METRICS, ACTIVITIES, SKILLS, EQUIPMENT, BUILTIN_STYLES, metricTierText, skillCaps } from './model.js';
import { LIBRARY, byId } from './library.js';
import { allSystems, toReference, levelFromReference, bestReferenceLevel, LEVEL_WORDS } from './grading.js';
import { exKey, norm } from './shared.js';

export const DAY = 86400000;
const HOUR = 3600000;
const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };
const fmtDay = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const confWord = (c) => (c >= 0.7 ? 'bonne' : c >= 0.35 ? 'moyenne' : 'faible');
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayNum = (t, tz = 0) => Math.floor((t - tz * 60000) / DAY);

/* ═════════════ Contexte : toutes les données de l'utilisateur, prêtes à analyser ═════════════ */
/**
 * raw : { items: [{c,id,d,u,del}], history, events, seances: [...], personal: [...], settings, now, tz }
 */
export function buildContext(raw = {}) {
  const now = raw.now || Date.now(), tz = raw.tz || 0;
  const coll = {};
  for (const it of raw.items || []) {
    if (!it || it.del) continue;
    (coll[it.c] ||= {})[it.id] = { id: it.id, ...it.d, _u: it.u };
  }
  const get = (c) => coll[c] || {};
  const history = [...(raw.history || [])].filter((h) => h && h.startedAt > 0 && h.startedAt <= now + 5 * 60000).sort((a, b) => b.startedAt - a.startedAt);
  const future = (raw.history || []).filter((h) => h && h.startedAt > now + 5 * 60000);

  // Activités : natives activées + personnalisées (non archivées). Les activités pratiquées sont aussi reconnues.
  const activities = {};
  for (const [id, a] of Object.entries(get('activity'))) {
    if (a.archived) continue;
    const preset = ACTIVITIES[a.preset] ? a.preset : ACTIVITIES[id] ? id : '';
    activities[preset || id] = { id: preset || id, label: a.label || ACTIVITIES[preset]?.label || id, emoji: a.emoji || ACTIVITIES[preset]?.emoji || '🏅', native: !!preset, itemId: id, aliases: a.aliases || [] };
  }
  const categories = {};
  for (const [id, c] of Object.entries(get('category'))) if (!c.archived) categories[id] = { ...c, custom: true };
  const metrics = {};
  for (const [id, m] of Object.entries(METRICS)) metrics[id] = { id, ...m, native: true };
  for (const [id, m] of Object.entries(get('metric'))) if (!m.archived || true) metrics[id] = { id, ...m, native: false, caps: Object.fromEntries((m.caps || []).map((x) => [x.id, x.w])), acts: m.activityId ? [m.activityId] : [] };
  const perfs = Object.values(get('perf')).sort((a, b) => (b.date || 0) - (a.date || 0));
  const goals = Object.values(get('goal'));
  const gradesys = get('gradesys');
  const systems = allSystems(gradesys);
  const styles = Object.fromEntries(BUILTIN_STYLES.map((s) => [s.id, s]));
  for (const [id, s] of Object.entries(get('style'))) styles[id] = { id, ...s, builtin: false };
  const envs = Object.values(get('env')).filter((e) => !e.archived);
  const config = get('config');
  const unavailable = new Set(config.equipment?.unavailable || []);
  const defEnv = envs.find((e) => e.id === config.main?.envId) || envs.find((e) => e.isDefault) || envs[0] || null;
  const prefs = {};
  for (const p of Object.values(get('pref'))) if (p.key) prefs[p.key] = p;
  const capdecl = {};
  for (const d of Object.values(get('capdecl'))) if (d.capId) capdecl[d.capId] = d;
  const seances = (raw.seances || []).filter(Boolean);
  const seanceById = new Map(seances.map((s) => [s.id, s]));
  const personal = (raw.personal || []).map((x) => ({ id: x.id, name: x.name, ...(x.data || {}) }));
  const personalByKey = new Map(personal.map((x) => [exKey(x.name), x]));
  return {
    now, tz, history, future, events: raw.events || [], seances, seanceById, personal, personalByKey, settings: raw.settings || {},
    activities, categories, metrics, perfs, goals, gradesys, systems, styles, envs, defEnv, unavailable, config, prefs, capdecl,
    ascents: Object.values(get('ascent')).sort((a, b) => (b.date || 0) - (a.date || 0)),
    swaps: Object.values(get('swap')), labs: Object.values(get('lab')), jnotes: Object.values(get('jnote')), habitDecisions: Object.fromEntries(Object.values(get('habit')).map((h) => [h.key, h.decision])),
  };
}

/* ═════════════ Exercices d'une séance réalisée → capacités / muscles ═════════════ */
const libMatchCache = new Map();
function libFor(ex) {
  if (ex.libId && byId(ex.libId)) return byId(ex.libId);
  const k = exKey(ex.name);
  if (libMatchCache.has(k)) return libMatchCache.get(k);
  let best = null;
  for (const x of LIBRARY) { const lk = exKey(x.name); if (lk === k) { best = x; break; } if (k.length >= 5 && (k.startsWith(lk) || lk.startsWith(k)) && (!best || lk.length > exKey(best.name).length)) best = x; }
  libMatchCache.set(k, best);
  return best;
}
/** Capacités sollicitées par un exercice (instantané enregistré, sinon fiche de la bibliothèque, sinon exercice personnel). */
export function exCaps(ex, ctx) {
  if (ex?.caps && Object.keys(ex.caps).length) return ex.caps;
  const lib = libFor(ex || {});
  if (lib && Object.keys(lib.caps).length) return lib.caps;
  const p = ctx?.personalByKey?.get(exKey(ex?.name));
  return p?.caps && Object.keys(p.caps).length ? p.caps : {};
}
export function exMuscles(ex, ctx) {
  if (ex?.prim?.length || ex?.sec?.length) return { prim: ex.prim || [], sec: ex.sec || [] };
  const lib = libFor(ex || {});
  if (lib) return { prim: lib.prim, sec: lib.sec };
  const p = ctx?.personalByKey?.get(exKey(ex?.name));
  return { prim: p?.prim || [], sec: p?.sec || [] };
}
const doneSets = (ex) => (ex?.sets || []).filter((s) => s.done !== false).length;

/** Activité d'une séance réalisée : enregistrée, sinon celle de la séance modèle, sinon déduite des exercices. */
export function entryActivity(h, ctx) {
  if (h?.data?.activity) return h.data.activity;
  const s = h?.sessionId && ctx?.seanceById?.get(h.sessionId);
  if (s?.activity) return s.activity;
  const votes = {};
  for (const ex of h?.data?.exercises || []) { const lib = libFor(ex); for (const a of lib?.acts || []) votes[a] = (votes[a] || 0) + 1; }
  if (h?.data?.focus && !Object.keys(votes).length) return 'climbing_boulder';
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'autre';
}
export const activityLabel = (id, ctx) => ctx?.activities?.[id]?.label || ACTIVITIES[id]?.label || (id === 'autre' ? 'Autre' : id);

/** Volume (séries réalisées, pondérées par la relation exercice→capacité) par capacité sur une fenêtre. */
export function capVolume(ctx, days = 30, endAt = ctx.now) {
  const vol = {};
  for (const h of ctx.history) {
    if (h.startedAt > endAt || endAt - h.startedAt > days * DAY) continue;
    for (const ex of h.data?.exercises || []) {
      const n = doneSets(ex); if (!n) continue;
      for (const [c, w] of Object.entries(exCaps(ex, ctx))) vol[c] = (vol[c] || 0) + n * w;
    }
  }
  return vol;
}
/** Volume par muscle (principal = 1, secondaire = 0,5) — sert à l'anatomie et au questionnaire. */
export function muscleVolume(ctx, days = 30) {
  const vol = {};
  for (const h of ctx.history) {
    if (ctx.now - h.startedAt > days * DAY) continue;
    for (const ex of h.data?.exercises || []) {
      const n = doneSets(ex); if (!n) continue;
      const m = exMuscles(ex, ctx);
      for (const id of m.prim) vol[id] = (vol[id] || 0) + n;
      for (const id of m.sec) vol[id] = (vol[id] || 0) + n * 0.5;
    }
    for (const id of h.data?.questionnaire?.felt || []) vol[id] = (vol[id] || 0) + 1; // ressenti déclaré après la séance
  }
  return vol;
}
/** Dernière date où une capacité a été travaillée (relation ≥ 0,5). */
export function lastWorked(capIds, ctx) {
  const set = new Set(capIds);
  for (const h of ctx.history) {
    for (const ex of h.data?.exercises || []) {
      if (!doneSets(ex)) continue;
      if (Object.entries(exCaps(ex, ctx)).some(([c, w]) => set.has(c) && w >= 0.5)) return h.startedAt;
    }
  }
  return 0;
}

/* ═════════════ Performances ═════════════ */
export const perfsOf = (metricId, ctx) => ctx.perfs.filter((p) => p.metricId === metricId);
export const latestPerf = (metricId, ctx) => perfsOf(metricId, ctx).find((p) => !p.unknown && (p.value != null || p.grade)) || null;
export function bestPerf(metricId, ctx) {
  const m = ctx.metrics[metricId], list = perfsOf(metricId, ctx).filter((p) => !p.unknown && p.value != null);
  if (!list.length) return null;
  return list.reduce((b, p) => ((m?.dir === -1 ? p.value < b.value : p.value > b.value) ? p : b));
}
export function perfText(p, ctx) {
  const m = ctx.metrics[p.metricId];
  if (p.unknown) return 'je ne sais pas';
  if (p.grade) return `${p.grade.label} (${p.grade.systemName})`;
  return `${p.value} ${p.unit || m?.unit || ''}`.trim();
}
const SOURCE_WORD = { measured: 'mesuré', declared: 'déclaré', imported: 'importé', session: 'relevé en séance' };
/** Niveau 0/1/2 indiqué par une performance selon les repères de la métrique (null si aucun repère). */
export function tierLevel(m, value) {
  if (!m?.tiers || value == null) return null;
  const [a, b] = m.tiers;
  if (m.dir === -1) return value > a ? 0 : value >= b ? 1 : 2;
  return value < a ? 0 : value <= b ? 1 : 2;
}
/** Évolution d'une métrique : compare la dernière performance à la précédente (selon le sens de la métrique). */
export function metricTrend(metricId, ctx) {
  const m = ctx.metrics[metricId];
  const list = perfsOf(metricId, ctx).filter((p) => !p.unknown && (p.value != null || p.grade));
  if (list.length < 2) return null;
  const [a, b] = list;
  const va = a.grade ? a.grade.order : a.value, vb = b.grade ? b.grade.order : b.value;
  if (a.grade && b.grade && a.grade.systemId !== b.grade.systemId) return null; // systèmes différents : pas de comparaison inventée
  const diff = (va - vb) * (m?.dir === -1 ? -1 : 1);
  return { dir: diff > 0 ? 1 : diff < 0 ? -1 : 0, from: b, to: a, text: `${m?.label || metricId} : ${perfText(b, ctx)} (${fmtDay(b.date)}) → ${perfText(a, ctx)} (${fmtDay(a.date)})` };
}

/* ═════════════ État d'une capacité (niveau estimé, sources, confiance) ═════════════ */
/**
 * Combine plusieurs sources ; aucune ne décide seule :
 *  - niveau déclaré par l'utilisateur (poids 0,6) ;
 *  - performances des métriques liées, comparées à leurs repères indicatifs (poids = relation × récence × source) ;
 *  - maxima d'escalade convertibles vers l'échelle de référence (sinon signalé comme manquant, jamais inventé).
 * La pratique récente (volume 30 j) est calculée à part : elle décrit l'entraînement, pas le niveau.
 */
export function capacityState(capId, ctx) {
  const cap = CAPACITIES[capId] || (ctx.categories[capId] ? { label: ctx.categories[capId].label } : { label: capId });
  const evidences = [], missing = [];
  const decl = ctx.capdecl[capId];
  if (decl && decl.level >= 0) evidences.push({ type: 'déclaré', level: decl.level, weight: 0.6, text: `Tu as indiqué un niveau ${LEVEL_WORDS[decl.level]}${decl.note ? ` (« ${decl.note} »)` : ''}.` });
  else if (decl && decl.level === -1) missing.push('Tu as répondu « je ne sais pas » pour ce niveau : un test peut aider (voir les rappels de tests).');
  const trends = [];
  for (const [mid, m] of Object.entries(ctx.metrics)) {
    const w = m.caps?.[capId]; if (!w || w < 0.3) continue;
    const p = latestPerf(mid, ctx);
    const t = metricTrend(mid, ctx); if (t) trends.push(t);
    if (!p) continue;
    const age = (ctx.now - (p.date || 0)) / DAY;
    const rec = age <= 90 ? 1 : age <= 365 ? 0.6 : 0.3;
    const src = p.source === 'measured' ? 1 : p.source === 'session' ? 0.9 : 0.8;
    let level = null, how = '';
    if (m.kind === 'grade' && p.grade) {
      const act = m.gradeActivity || 'bloc';
      const r = toReference(p.grade, ctx.systems, act);
      if (r) { level = levelFromReference(r.index, act); how = `converti en ${r.label} (${r.via})`; }
      else { missing.push(`${m.label} : ${p.grade.label} (${p.grade.systemName}) n’a pas de correspondance définie avec l’échelle de référence — non utilisé pour estimer le niveau.`); continue; }
    } else {
      level = tierLevel(m, p.value);
      how = metricTierText(m);
      if (level == null) { evidences.push({ type: SOURCE_WORD[p.source] || 'déclaré', level: null, weight: 0, text: `${m.label} : ${perfText(p, ctx)} (${fmtDay(p.date)}) — suivi de ta progression, sans repère de niveau (une charge absolue ne dit rien sans contexte).` }); continue; }
    }
    evidences.push({ type: SOURCE_WORD[p.source] || 'déclaré', level, weight: round(w * rec * src, 2), metricId: mid, date: p.date, text: `${m.label} : ${perfText(p, ctx)} (${SOURCE_WORD[p.source] || 'déclaré'}, ${fmtDay(p.date)}) → ${LEVEL_WORDS[level]} — ${how}.` });
  }
  const scored = evidences.filter((e) => e.level != null && e.weight > 0);
  const W = scored.reduce((t, e) => t + e.weight, 0);
  const level = W ? round(scored.reduce((t, e) => t + e.level * e.weight, 0) / W, 2) : null;
  const confidence = round(Math.min(1, W / 1.4), 2);
  const vol30 = capVolume(ctx, 30)[capId] || 0;
  if (!scored.length) {
    const ms = Object.entries(ctx.metrics).filter(([, m]) => (m.caps?.[capId] || 0) >= 0.5).slice(0, 2).map(([, m]) => m.label);
    missing.push(ms.length ? `Aucune performance récente pour estimer ce niveau. Mesure utile : ${ms.join(' ou ')}.` : 'Aucune donnée de niveau : tu peux le déclarer toi-même.');
  }
  const status = level == null ? (vol30 > 0 ? 'pratique' : 'inconnu') : level >= 1.5 ? 'fort' : level >= 0.75 ? 'developpement' : 'faible';
  const trend = trends.sort((a, b) => b.to.date - a.to.date)[0] || null;
  return { capId, label: cap.label, level, status, confidence, evidences, missing, vol30: round(vol30, 1), trend, estimated: scored.some((e) => e.type !== 'déclaré') || scored.length > 1 };
}
export const STATUS_WORD = { fort: 'solide', developpement: 'en développement', faible: 'à renforcer', pratique: 'pratiquée, niveau non renseigné', inconnu: 'non renseignée' };

/** Capacités pertinentes : structure des activités suivies + objectifs actifs + capacités avec des données. */
export function relevantCaps(ctx, activityId) {
  const w = {};
  const acts = activityId ? [activityId] : Object.keys(ctx.activities).length ? Object.keys(ctx.activities) : [...new Set(ctx.history.slice(0, 30).map((h) => entryActivity(h, ctx)))];
  for (const a of acts) for (const [c, x] of Object.entries(ACTIVITIES[a]?.caps || {})) w[c] = Math.max(w[c] || 0, x);
  for (const cat of Object.values(ctx.categories)) if (!activityId || cat.activityId === activityId) {
    if (cat.caps?.length) for (const x of cat.caps) w[x.id] = Math.max(w[x.id] || 0, x.w);
    else w[cat.id] = Math.max(w[cat.id] || 0, 0.7); // catégorie sans capacité liée : elle est son propre nœud
  }
  if (!activityId) for (const g of activeGoals(ctx)) for (const x of goalCaps(g, ctx)) w[x.id] = Math.max(w[x.id] || 0, x.w);
  if (!activityId) for (const id of Object.keys(ctx.capdecl)) w[id] ||= 0.5;
  return w;
}
export function profileCapacities(ctx, activityId) {
  const rel = relevantCaps(ctx, activityId);
  return Object.entries(rel).map(([id, w]) => ({ ...capacityState(id, ctx), relevance: w })).sort((a, b) => b.relevance - a.relevance);
}
/** Forces / axes de travail RELATIFS au propre profil de l'utilisateur (pas à d'autres personnes). */
export function strengthsWeaknesses(states) {
  const known = states.filter((s) => s.level != null);
  if (known.length < 2) return { strengths: [], weaknesses: [], unknown: states.filter((s) => s.level == null), mean: null, text: 'Pas assez de capacités renseignées pour comparer tes points forts et tes axes de travail (au moins 2).' };
  const mean = known.reduce((t, s) => t + s.level, 0) / known.length;
  const strengths = known.filter((s) => s.level >= mean + 0.35).sort((a, b) => b.level - a.level);
  const weaknesses = known.filter((s) => s.level <= mean - 0.35).sort((a, b) => a.level - b.level);
  return { strengths, weaknesses, unknown: states.filter((s) => s.level == null), mean: round(mean, 2), text: `Comparaison entre tes propres capacités (moyenne ${round(mean, 1)} sur une échelle 0 débutant → 2 avancé).` };
}

/* ═════════════ Objectifs ═════════════ */
export const activeGoals = (ctx) => ctx.goals.filter((g) => (g.status || 'active') === 'active');
export function goalCaps(g, ctx) {
  if (g.type === 'skill' && SKILLS[g.skillId]) return skillCaps(g.skillId);
  if ((g.type === 'metric' || g.type === 'grade') && ctx.metrics[g.metricId]) return Object.entries(ctx.metrics[g.metricId].caps || {}).map(([id, w]) => ({ id, w }));
  return (g.caps || []).map((x) => ({ id: x.id, w: x.w }));
}
export const goalLabel = (g) => g.label || (g.type === 'skill' ? SKILLS[g.skillId]?.label : '') || 'Objectif';
/** Avancement d'un objectif, calculé uniquement à partir de données réelles. */
export function goalProgress(g, ctx) {
  if (g.type === 'metric') {
    const m = ctx.metrics[g.metricId], p = bestPerf(g.metricId, ctx);
    if (!m) return { pct: null, text: 'Métrique introuvable.' };
    if (!p) return { pct: null, current: null, text: `Pas encore de performance pour « ${m.label} ».` };
    const pct = g.target ? (m.dir === -1 ? Math.min(100, Math.round((g.target / p.value) * 100)) : Math.min(100, Math.round((p.value / g.target) * 100))) : null;
    return { pct, current: p.value, text: `Meilleure valeur : ${perfText(p, ctx)} · cible ${g.target} ${m.unit}` };
  }
  if (g.type === 'grade') {
    const m = ctx.metrics[g.metricId] || METRICS.max_bloc, act = m.gradeActivity || 'bloc';
    const best = bestReferenceLevel(perfsOf(g.metricId || 'max_bloc', ctx), ctx.systems, act);
    const target = g.gradeTarget ? toReference(g.gradeTarget, ctx.systems, act) : null;
    if (!g.gradeTarget) return { pct: null, text: 'Niveau visé non défini.' };
    if (!best || !target) {
      const same = perfsOf(g.metricId, ctx).filter((p) => p.grade?.systemId === g.gradeTarget.systemId).sort((a, b) => b.grade.order - a.grade.order)[0];
      if (same) return { pct: Math.min(100, Math.round(((same.grade.order + 1) / (g.gradeTarget.order + 1)) * 100)), text: `Meilleur : ${same.grade.label} · visé ${g.gradeTarget.label} (${g.gradeTarget.systemName})` };
      return { pct: null, text: 'Pas encore de niveau comparable enregistré dans ce système.' };
    }
    return { pct: Math.min(100, Math.round(((best.index + 1) / (target.index + 1)) * 100)), text: `Meilleur : ${best.label} · visé ${target.label}` };
  }
  if (g.type === 'sessions') {
    const since = g.startedAt || 0, n = ctx.history.filter((h) => h.startedAt >= since).length;
    return { pct: g.target ? Math.min(100, Math.round((n / g.target) * 100)) : null, current: n, text: `${n} séance(s) depuis le ${fmtDay(since || ctx.now)} · cible ${g.target}` };
  }
  if (g.type === 'ascents') {
    const since = g.startedAt || 0, n = ctx.ascents.filter((a) => a.date >= since && ['flash', 'send', 'top'].includes(a.result)).length;
    return { pct: g.target ? Math.min(100, Math.round((n / g.target) * 100)) : null, current: n, text: `${n} réussite(s) enregistrée(s) depuis le ${fmtDay(since || ctx.now)} · cible ${g.target}` };
  }
  if (g.type === 'skill') {
    const m = mastery(g.skillId, ctx);
    if (!m) return { pct: null, text: 'Figure inconnue.' };
    const done = m.steps.filter((s) => s.state === 'maitrise').length;
    return { pct: Math.round((done / m.steps.length) * 100), text: `${done} / ${m.steps.length} étapes maîtrisées · étape en cours : ${m.current?.label || 'toutes maîtrisées'}` };
  }
  const cur = Number(g.current ?? 0);
  return { pct: g.target ? Math.max(0, Math.min(100, Math.round((cur / g.target) * 100))) : null, current: cur, text: `${cur} / ${g.target ?? '—'} ${g.unit || ''}` };
}

/* ═════════════ Maîtrise et arbres de progression (figures) ═════════════ */
export const MASTERY_WORD = { non: 'non commencé', decouvert: 'découvert', developpement: 'en développement', maitrise: 'maîtrisé' };
/** États de maîtrise d'une figure : dérivés des exercices réalisés et des performances (indicatif, pas une vérité scientifique). */
export function mastery(skillId, ctx) {
  const s = SKILLS[skillId]; if (!s) return null;
  const doneEx = new Set();
  for (const h of ctx.history) for (const ex of h.data?.exercises || []) if (doneSets(ex)) { const lib = libFor(ex); if (lib) doneEx.add(lib.id); }
  const steps = s.steps.map((st) => {
    const lib = byId(st.exercise), m = ctx.metrics[st.criterion.metric], best = bestPerf(st.criterion.metric, ctx);
    let ratio = null;
    if (best && m) ratio = m.dir === -1 ? st.criterion.target / best.value : best.value / st.criterion.target;
    const state = ratio != null && ratio >= 1 ? 'maitrise' : ratio != null && ratio >= 0.5 ? 'developpement' : (doneEx.has(st.exercise) || best) ? 'decouvert' : 'non';
    return { ...st, exerciseName: lib?.name || st.exercise, metricLabel: m?.label || st.criterion.metric, best, ratio: ratio == null ? null : round(ratio, 2), state,
      how: best ? `${m.label} : ${perfText(best, ctx)} pour un repère de ${st.criterion.target} ${m.unit}` : doneEx.has(st.exercise) ? 'Exercice déjà réalisé, pas encore de mesure.' : 'Pas encore travaillé ni mesuré.' };
  });
  return { skillId, label: s.label, steps, current: steps.find((x) => x.state !== 'maitrise') || null };
}

/* ═════════════ « Qu'est-ce qui me bloque ? » ═════════════ */
export function blockers(g, ctx) {
  const caps = goalCaps(g, ctx);
  const out = [], missing = [];
  const skill = g.type === 'skill' ? SKILLS[g.skillId] : null;
  for (const { id, w } of caps) {
    const st = capacityState(id, ctx);
    const crit = (skill?.criteria || []).filter((c) => (ctx.metrics[c.metric]?.caps?.[id] || 0) >= 0.3);
    const critStatus = crit.map((c) => {
      const m = ctx.metrics[c.metric], p = bestPerf(c.metric, ctx);
      if (!p) { missing.push(`${m.label} : pas de mesure (repère ${c.target} ${m.unit}).`); return { ...c, label: m.label, value: null, ratio: null }; }
      const ratio = m.dir === -1 ? c.target / p.value : p.value / c.target;
      return { ...c, label: m.label, value: p.value, unit: m.unit, ratio: round(Math.min(1.5, ratio), 2), perf: p };
    });
    const ratios = critStatus.filter((c) => c.ratio != null).map((c) => Math.min(1, c.ratio));
    const readiness = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : st.level != null ? st.level / 2 : null;
    const limit = readiness == null ? null : round(w * (1 - readiness), 2);
    out.push({ capId: id, label: st.label, weight: w, state: st, criteria: critStatus, readiness: readiness == null ? null : round(readiness, 2), limit, vol30: st.vol30 });
  }
  const known = out.filter((x) => x.limit != null).sort((a, b) => b.limit - a.limit);
  const unknown = out.filter((x) => x.limit == null);
  const conf = out.length ? round(known.length / out.length * Math.min(1, known.reduce((t, x) => t + x.state.confidence, 0) / Math.max(1, known.length) + 0.3), 2) : 0;
  return {
    goal: goalLabel(g), limiting: known.filter((x) => x.limit > 0.15).slice(0, 3), all: [...known, ...unknown], unknown, missing: [...new Set(missing)], confidence: Math.min(1, conf),
    note: 'Analyse indicative basée uniquement sur tes données : elle montre ce qui semble le plus en retard par rapport aux repères de la figure, sans garantir une progression.',
  };
}

/* ═════════════ Plusieurs chemins vers un objectif (non classés) ═════════════ */
export function availableEquipment(ctx, envId) {
  const env = (envId && ctx.envs.find((e) => e.id === envId)) || ctx.defEnv;
  const set = new Set(env ? env.equipment : []);
  // Profil jamais rempli : on reprend l'ancien réglage escalade (mur par défaut) pour rester prudent.
  if (!env) { const eq = ctx.settings?.equipment || { wall: true }; for (const [k, v] of Object.entries(eq)) if (v) set.add(k); }
  for (const u of ctx.unavailable || []) set.delete(u);
  return set;
}
export function goalPaths(g, ctx, envId) {
  const s = SKILLS[g.skillId]; if (!s) return [];
  const eq = availableEquipment(ctx, envId);
  return s.paths.map((p) => {
    const missingEq = p.needs.filter((n) => !eq.has(n));
    const avoided = p.exercises.filter((id) => { const lib = byId(id); return lib && ctx.prefs[exKey(lib.name)]?.value === 'evite'; });
    const liked = p.exercises.filter((id) => { const lib = byId(id); return lib && ctx.prefs[exKey(lib.name)]?.value === 'aime'; });
    const tried = p.exercises.filter((id) => ctx.history.some((h) => (h.data?.exercises || []).some((e) => libFor(e)?.id === id && doneSets(e))));
    return { ...p, compatible: !missingEq.length, missingEq: missingEq.map((n) => EQUIPMENT[n] || n), avoided: avoided.map((id) => byId(id).name), liked: liked.map((id) => byId(id).name), tried: tried.length, exerciseNames: p.exercises.map((id) => byId(id)?.name || id) };
  });
}

/* ═════════════ Comparaisons personnelles (7 / 30 / 90 jours vs période précédente) ═════════════ */
function periodStats(ctx, start, end) {
  const list = ctx.history.filter((h) => h.startedAt > start && h.startedAt <= end);
  const acts = {}, caps = {};
  let minutes = 0, sets = 0, rpeSum = 0, rpeN = 0, load = 0;
  for (const h of list) {
    const a = entryActivity(h, ctx); acts[a] = (acts[a] || 0) + 1;
    const min = (h.durationSeconds || 0) / 60; minutes += min;
    if (h.data?.rpe) { rpeSum += h.data.rpe; rpeN++; load += min * h.data.rpe; }
    for (const ex of h.data?.exercises || []) { const n = doneSets(ex); sets += n; for (const [c, w] of Object.entries(exCaps(ex, ctx))) caps[c] = (caps[c] || 0) + n * w; }
  }
  const perfs = ctx.perfs.filter((p) => p.date > start && p.date <= end && !p.unknown);
  return { sessions: list.length, minutes: Math.round(minutes), sets, activities: acts, caps, perfs: perfs.length, rpe: rpeN ? round(rpeSum / rpeN, 1) : null, load: Math.round(load) };
}
export function benchmarks(ctx, days) {
  const cur = periodStats(ctx, ctx.now - days * DAY, ctx.now), prev = periodStats(ctx, ctx.now - 2 * days * DAY, ctx.now - days * DAY);
  const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const capDiff = Object.keys({ ...cur.caps, ...prev.caps }).map((id) => ({ id, label: CAPACITIES[id]?.label || id, cur: round(cur.caps[id] || 0, 1), prev: round(prev.caps[id] || 0, 1) }))
    .filter((x) => x.cur || x.prev).sort((a, b) => Math.abs(b.cur - b.prev) - Math.abs(a.cur - a.prev));
  const trends = Object.keys(ctx.metrics).map((id) => metricTrend(id, ctx)).filter((t) => t && t.to.date > ctx.now - days * DAY);
  return {
    days, cur, prev, deltas: { sessions: delta(cur.sessions, prev.sessions), minutes: delta(cur.minutes, prev.minutes), sets: delta(cur.sets, prev.sets) },
    capDiff: capDiff.slice(0, 8), trends,
    text: `Comparaison des ${days} derniers jours avec les ${days} jours précédents — uniquement ton propre historique.`,
  };
}

/* ═════════════ Régularité ═════════════ */
export function regularity(ctx, weeksN = 12) {
  const monday = (t) => { const n = dayNum(t, ctx.tz); return n - ((n + 3) % 7); };
  const thisMon = monday(ctx.now);
  const weeks = Array(weeksN).fill(0);
  for (const h of ctx.history) { const w = Math.round((thisMon - monday(h.startedAt)) / 7); if (w >= 0 && w < weeksN) weeks[weeksN - 1 - w]++; }
  const mean = weeks.reduce((a, b) => a + b, 0) / weeksN;
  const sd = Math.sqrt(weeks.reduce((t, x) => t + (x - mean) ** 2, 0) / weeksN);
  const cv = mean ? sd / mean : null;
  const constancy = mean === 0 ? 'aucune séance' : cv < 0.35 ? 'très régulière' : cv < 0.7 ? 'assez régulière' : 'irrégulière';
  // Interruptions : écarts d'au moins 7 jours entre deux séances (sur les 180 derniers jours).
  const gaps = [];
  const sorted = ctx.history.filter((h) => ctx.now - h.startedAt < 180 * DAY).map((h) => h.startedAt).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) { const d = (sorted[i] - sorted[i - 1]) / DAY; if (d >= 7) gaps.push({ from: sorted[i - 1], to: sorted[i], days: Math.round(d) }); }
  const sinceLast = sorted.length ? (ctx.now - sorted[sorted.length - 1]) / DAY : null;
  if (sinceLast != null && sinceLast >= 7) gaps.push({ from: sorted[sorted.length - 1], to: null, days: Math.round(sinceLast) });
  const last4 = weeks.slice(-4).reduce((a, b) => a + b, 0) / 4, prev4 = weeks.slice(-8, -4).reduce((a, b) => a + b, 0) / 4;
  const change = prev4 === 0 && last4 === 0 ? null : prev4 === 0 ? 'reprise' : last4 > prev4 * 1.3 ? 'hausse' : last4 < prev4 * 0.7 ? 'baisse' : 'stable';
  let streakWeeks = 0; for (let i = weeksN - 1; i >= 0 && weeks[i] > 0; i--) streakWeeks++;
  // Périodes d'activité : suites de semaines consécutives avec au moins une séance.
  const periods = []; let startW = null;
  for (let i = 0; i <= weeksN; i++) { if (i < weeksN && weeks[i] > 0) { if (startW == null) startW = i; } else if (startW != null) { periods.push({ fromWeek: startW, toWeek: i - 1, weeks: i - startW }); startW = null; } }
  return {
    weeks, mean: round(mean, 1), cv: cv == null ? null : round(cv, 2), constancy, gaps: gaps.slice(-5), change, last4: round(last4, 1), prev4: round(prev4, 1), streakWeeks, periods,
    text: mean === 0 ? 'Aucune séance sur les 12 dernières semaines.' : `En moyenne ${round(mean, 1)} séance(s) par semaine sur ${weeksN} semaines (${constancy}). ${change === 'hausse' ? 'Rythme en hausse ces 4 dernières semaines.' : change === 'baisse' ? 'Rythme en baisse ces 4 dernières semaines.' : change === 'reprise' ? 'Reprise après une période sans séance.' : change === 'stable' ? 'Rythme stable.' : ''}`,
  };
}

/* ═════════════ Capacités sous-entraînées ═════════════ */
export function undertrained(ctx) {
  const demand = relevantCaps(ctx);
  const vol = capVolume(ctx, 30);
  const totalVol = Object.values(vol).reduce((a, b) => a + b, 0);
  const totalDemand = Object.values(demand).reduce((a, b) => a + b, 0);
  if (!totalDemand) return { items: [], text: 'Ajoute une activité ou un objectif pour que je puisse repérer ce qui est peu travaillé.', enough: false };
  if (totalVol < 15) return { items: [], text: 'Pas encore assez de séances ces 30 derniers jours pour une observation fiable (moins de 15 séries).', enough: false };
  const items = [];
  for (const [id, d] of Object.entries(demand)) {
    const expected = d / totalDemand, actual = (vol[id] || 0) / totalVol;
    if (d >= 0.5 && actual < expected * 0.5) {
      const last = lastWorked([id], ctx);
      const byGoal = activeGoals(ctx).filter((g) => goalCaps(g, ctx).some((x) => x.id === id)).map(goalLabel);
      items.push({ id, label: CAPACITIES[id]?.label || ctx.categories[id]?.label || id, expected: round(expected * 100), actual: round(actual * 100), last, byGoal,
        text: `${CAPACITIES[id]?.label || id} : ${round(actual * 100)} % de ton volume sur 30 jours, alors qu’elle pèse environ ${round(expected * 100)} % dans ${byGoal.length ? 'tes objectifs (' + byGoal.join(', ') + ')' : 'la structure de tes activités'}.${last ? ' Dernière fois : ' + fmtDay(last) + '.' : ' Pas travaillée récemment.'}` });
    }
  }
  return { items: items.sort((a, b) => (b.expected - b.actual) - (a.expected - a.actual)).slice(0, 6), enough: true, text: 'Observation descriptive : comparaison entre ce que demandent tes objectifs / activités et ce que tu as réellement travaillé (30 jours).' };
}

/* ═════════════ Objectifs oubliés ═════════════ */
export function forgottenGoals(ctx, days = 14) {
  return activeGoals(ctx).map((g) => {
    const caps = goalCaps(g, ctx).filter((x) => x.w >= 0.5).map((x) => x.id);
    const last = Math.max(lastWorked(caps, ctx), g.metricId ? (latestPerf(g.metricId, ctx)?.date || 0) : 0);
    const age = last ? Math.floor((ctx.now - last) / DAY) : null;
    return { goal: g, label: goalLabel(g), last, days: age };
  }).filter((x) => x.days == null ? (ctx.now - (x.goal.startedAt || x.goal._u || ctx.now)) > days * DAY : x.days >= days);
}

/* ═════════════ Rappels de tests de performance ═════════════ */
export function testReminders(ctx, maxAgeDays = 42) {
  const wanted = new Map();
  for (const g of activeGoals(ctx)) {
    if (g.metricId && ctx.metrics[g.metricId]) wanted.set(g.metricId, `objectif « ${goalLabel(g)} »`);
    if (g.type === 'skill') for (const c of SKILLS[g.skillId]?.criteria || []) if (!wanted.has(c.metric)) wanted.set(c.metric, `figure « ${SKILLS[g.skillId].label} »`);
  }
  for (const a of Object.keys(ctx.activities)) {
    const best = Object.entries(METRICS).filter(([, m]) => m.acts.includes(a) && m.tiers).slice(0, 2);
    for (const [id] of best) if (!wanted.has(id)) wanted.set(id, `activité ${ACTIVITIES[a]?.label || a}`);
  }
  const out = [];
  for (const [id, why] of wanted) {
    const m = ctx.metrics[id], all = perfsOf(id, ctx), last = latestPerf(id, ctx), unknown = all[0]?.unknown;
    const age = last ? Math.floor((ctx.now - last.date) / DAY) : null;
    if (last && age < maxAgeDays && !unknown) continue;
    out.push({ metricId: id, label: m.label, why, age, unknown: !!unknown, test: m.test || '', text: unknown ? `Tu as indiqué « je ne sais pas » pour ${m.label} : un test te donnerait une vraie valeur.` : last ? `Dernière mesure de ${m.label} il y a ${age} jours : un nouveau test actualiserait ton profil.` : `Aucune mesure de ${m.label} (utile pour ${why}).` });
  }
  return out.slice(0, 6);
}

/* ═════════════ Apprentissage des préférences (jamais appliqué sans confirmation) ═════════════ */
/** Statistiques par exercice : réalisé, remplacé, jugé difficile / facile, aimé (questionnaire). */
export function exerciseStats(ctx) {
  const st = new Map();
  const get = (name) => { const k = exKey(name); if (!st.has(k)) st.set(k, { key: k, name, done: 0, swappedOut: 0, hardest: 0, easiest: 0, liked: 0, disliked: 0, last: 0 }); return st.get(k); };
  for (const h of ctx.history) {
    for (const ex of h.data?.exercises || []) if (doneSets(ex)) { const s = get(ex.name); s.done++; s.last = Math.max(s.last, h.startedAt); }
    for (const sw of h.data?.swaps || []) if (sw.from) get(sw.from).swappedOut++;
    const q = h.data?.questionnaire || {};
    if (q.hardest) get(q.hardest).hardest++;
    if (q.easiest) get(q.easiest).easiest++;
    for (const l of q.likes || []) { const s = get(l.name || l.key); if (l.value === 'aime') s.liked++; if (l.value === 'evite') s.disliked++; }
  }
  for (const sw of ctx.swaps || []) if (sw.from) get(sw.from).swappedOut++;
  return st;
}
export function learnedPreferences(ctx) {
  const out = [];
  for (const s of exerciseStats(ctx).values()) {
    const explicit = ctx.prefs[s.key];
    const suggestion = s.swappedOut >= 3 && !explicit ? 'evite' : s.liked >= 2 && !explicit ? 'aime' : null;
    out.push({ ...s, explicit: explicit?.value || null, suggestion,
      text: [s.done ? `réalisé ${s.done} fois` : '', s.swappedOut ? `remplacé ${s.swappedOut} fois` : '', s.hardest ? `jugé le plus difficile ${s.hardest} fois` : '', s.easiest ? `jugé le plus facile ${s.easiest} fois` : '', s.liked ? `aimé ${s.liked} fois` : ''].filter(Boolean).join(', ') });
  }
  return out.sort((a, b) => b.done + b.swappedOut - (a.done + a.swappedOut));
}

/* ═════════════ Détection d'habitudes (proposées, jamais enregistrées sans confirmation) ═════════════ */
const slotOf = (t) => { const hh = new Date(t).getHours(); return hh < 11 ? 'le matin' : hh < 14 ? 'le midi' : hh < 18 ? 'l’après-midi' : 'le soir'; };
export function habits(ctx) {
  const recent = ctx.history.slice(0, 12), out = [];
  const push = (key, text, proposal) => { if (!ctx.habitDecisions[key]) out.push({ key, text, proposal }); };
  for (const s of exerciseStats(ctx).values()) if (s.swappedOut >= 3 && !ctx.prefs[s.key]) push(`swap:${s.key}`, `Tu remplaces souvent « ${s.name} » (${s.swappedOut} fois). Veux-tu enregistrer que tu préfères l’éviter ? Il restera proposé s’il est indispensable à un objectif, avec une explication.`, { type: 'pref', key: s.key, label: s.name, value: 'evite', source: 'habit' });
  if (recent.length >= 5) {
    const mins = recent.map((h) => Math.round((h.durationSeconds || 0) / 300) * 5).filter((m) => m >= 5);
    const counts = {}; for (const m of mins) counts[m] = (counts[m] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / recent.length >= 0.5) push(`duration:${top[0]}`, `Tes séances durent souvent environ ${top[0]} minutes (${top[1]} sur les ${recent.length} dernières). Veux-tu en faire ta durée par défaut ?`, { type: 'config', key: 'duration', value: Number(top[0]) });
    const envs = {}; for (const h of recent) { const e = h.data?.context?.envName; if (e) envs[e] = (envs[e] || 0) + 1; }
    const topEnv = Object.entries(envs).sort((a, b) => b[1] - a[1])[0];
    if (topEnv && topEnv[1] / recent.length >= 0.7) push(`env:${topEnv[0]}`, `Tu t’entraînes presque toujours à « ${topEnv[0]} ». Veux-tu en faire ton environnement par défaut ?`, { type: 'env', name: topEnv[0] });
    const slots = {}; for (const h of recent) { const s = slotOf(h.startedAt); slots[s] = (slots[s] || 0) + 1; }
    const topSlot = Object.entries(slots).sort((a, b) => b[1] - a[1])[0];
    if (topSlot && topSlot[1] / recent.length >= 0.7) out.push({ key: `slot:${topSlot[0]}`, text: `Tu t’entraînes surtout ${topSlot[0]} (${topSlot[1]} séances sur ${recent.length}).`, proposal: null, info: true });
    const goalsN = {}; for (const h of recent) { const g = h.data?.context?.goalId; if (g) goalsN[g] = (goalsN[g] || 0) + 1; }
    const topGoal = Object.entries(goalsN).sort((a, b) => b[1] - a[1])[0];
    const gl = topGoal && ctx.goals.find((g) => g.id === topGoal[0]);
    if (gl && topGoal[1] / recent.length >= 0.6) out.push({ key: `goal:${gl.id}`, text: `La plupart de tes séances récentes visent « ${goalLabel(gl)} ».`, proposal: null, info: true });
  }
  return out;
}

/* ═════════════ Charge d'entraînement et signaux de fatigue (descriptifs, non médicaux) ═════════════ */
// Charge d'une séance = durée (min) × ressenti déclaré (1 à 5). Méthode simple et transparente ;
// sans ressenti, la charge n'est pas estimée (la séance est comptée à part).
export function loadAnalysis(ctx) {
  const week = (k) => ctx.history.filter((h) => h.startedAt > ctx.now - (k + 1) * 7 * DAY && h.startedAt <= ctx.now - k * 7 * DAY);
  const loadOf = (list) => list.reduce((t, h) => t + (h.data?.rpe ? ((h.durationSeconds || 0) / 60) * h.data.rpe : 0), 0);
  const weeks = [0, 1, 2, 3, 4].map((k) => ({ k, sessions: week(k).length, load: Math.round(loadOf(week(k))), noRpe: week(k).filter((h) => !h.data?.rpe).length }));
  const acute = weeks[0].load, chronic = (weeks[1].load + weeks[2].load + weeks[3].load + weeks[4].load) / 4;
  const ratio = chronic > 0 ? round(acute / chronic, 2) : null;
  const last3 = ctx.history.filter((h) => ctx.now - h.startedAt <= 3 * DAY).length;
  const gaps = [];
  const recent = ctx.history.filter((h) => ctx.now - h.startedAt <= 14 * DAY);
  for (let i = 0; i < recent.length - 1; i++) gaps.push((recent[i].startedAt - recent[i + 1].startedAt) / HOUR);
  const minGap = gaps.length ? Math.round(Math.min(...gaps)) : null;
  const hard = ctx.history.filter((h) => ctx.now - h.startedAt <= 7 * DAY && h.data?.rpe >= 4).length;
  const signals = [];
  if (ratio != null && ratio >= 1.3) signals.push(`Ta charge des 7 derniers jours est ${Math.round((ratio - 1) * 100)} % au-dessus de ta moyenne des 4 semaines précédentes.`);
  if (ratio != null && ratio <= 0.6 && weeks[0].sessions) signals.push('Ta charge de la semaine est nettement plus basse que d’habitude.');
  if (last3 >= 3) signals.push(`${last3} séances enregistrées sur les 3 derniers jours.`);
  if (minGap != null && minGap < 12) signals.push(`Deux séances rapprochées (${minGap} h d’écart) ces 14 derniers jours.`);
  if (hard >= 3) signals.push(`${hard} séances ressenties comme dures ou très dures cette semaine.`);
  const declines = Object.keys(ctx.metrics).map((id) => metricTrend(id, ctx)).filter((t) => t && t.dir < 0 && ctx.now - t.to.date < 21 * DAY);
  for (const d of declines.slice(0, 2)) signals.push(`Baisse récente : ${d.text}.`);
  return {
    weeks, acute, chronic: Math.round(chronic), ratio, last3, minGap, hard, signals,
    text: signals.length ? 'Observations sur ta charge récente :' : 'Aucune variation marquée de ta charge récente.',
    disclaimer: 'Ces observations décrivent tes données (durée × ressenti). Elles ne constituent pas un diagnostic médical : en cas de douleur ou de doute, consulte un professionnel de santé.',
  };
}

/* ═════════════ Séances atypiques ═════════════ */
export function atypicalSessions(ctx) {
  const out = [];
  const list = ctx.history;
  for (let i = 0; i < Math.min(10, list.length); i++) {
    const h = list[i], before = list.slice(i + 1, i + 21);
    if (before.length < 5) break;
    const dur = before.map((x) => (x.durationSeconds || 0) / 60), med = median(dur), mad = median(dur.map((d) => Math.abs(d - med))) || 5;
    const d = (h.durationSeconds || 0) / 60;
    const sets = (x) => (x.data?.exercises || []).reduce((t, e) => t + doneSets(e), 0);
    const sm = median(before.map(sets)), smad = median(before.map((x) => Math.abs(sets(x) - sm))) || 3;
    const notes = [];
    if (Math.abs(d - med) > 3 * mad && Math.abs(d - med) >= 15) notes.push(`durée ${Math.round(d)} min (habituellement ~${Math.round(med)} min)`);
    if (Math.abs(sets(h) - sm) > 3 * smad && Math.abs(sets(h) - sm) >= 8) notes.push(`volume ${sets(h)} séries (habituellement ~${Math.round(sm)})`);
    const act = entryActivity(h, ctx);
    if (!before.some((x) => entryActivity(x, ctx) === act)) notes.push(`activité inhabituelle : ${activityLabel(act, ctx)}`);
    const hh = new Date(h.startedAt).getHours(), hours = before.map((x) => new Date(x.startedAt).getHours());
    if (hours.every((x) => Math.abs(x - hh) >= 4)) notes.push(`horaire inhabituel (${hh} h)`);
    if (notes.length) out.push({ entry: h, notes, text: `« ${h.sessionName} » du ${fmtDay(h.startedAt)} : ${notes.join(' · ')}.` });
  }
  return out;
}

/* ═════════════ « Pourquoi je ne progresse pas ? » (hypothèses, jamais une certitude) ═════════════ */
export function whyNoProgress(g, ctx) {
  const caps = goalCaps(g, ctx).map((x) => x.id);
  const hyps = [], facts = [], missing = [];
  const relevant = ctx.history.filter((h) => ctx.now - h.startedAt <= 28 * DAY && (h.data?.exercises || []).some((e) => doneSets(e) && Object.entries(exCaps(e, ctx)).some(([c, w]) => caps.includes(c) && w >= 0.5)));
  facts.push(`${relevant.length} séance(s) ont travaillé les capacités de cet objectif sur les 28 derniers jours.`);
  if (relevant.length < 4) hyps.push({ title: 'Fréquence', text: `Moins d’une séance par semaine sur les capacités clés (${relevant.length} en 4 semaines). Une fréquence plus élevée est une piste courante.` });
  const reg = regularity(ctx);
  facts.push(reg.text);
  if (reg.gaps.some((x) => x.days >= 10 && (!x.to || ctx.now - x.to < 60 * DAY))) hyps.push({ title: 'Régularité', text: 'Une ou plusieurs interruptions de 10 jours ou plus ces deux derniers mois.' });
  const load = loadAnalysis(ctx);
  if (load.signals.length) hyps.push({ title: 'Charge et récupération', text: load.signals.join(' ') + ' La récupération peut limiter la progression.' });
  // Progression des prescriptions : les charges / répétitions sur les exercices liés ont-elles augmenté ?
  const series = new Map();
  for (const h of [...relevant].reverse()) for (const e of h.data?.exercises || []) {
    if (!Object.entries(exCaps(e, ctx)).some(([c, w]) => caps.includes(c) && w >= 0.5)) continue;
    const sets = (e.sets || []).filter((s) => s.done !== false); if (!sets.length) continue;
    const v = Math.max(...sets.map((s) => (s.load || 0) * 100 + (s.reps || 0) + (s.seconds || 0) / 10));
    const k = exKey(e.name); (series.get(k) || series.set(k, { name: e.name, vals: [] }).get(k)).vals.push(v);
  }
  const flat = [...series.values()].filter((s) => s.vals.length >= 3 && Math.max(...s.vals.slice(-2)) <= s.vals[0]);
  if (flat.length) hyps.push({ title: 'Prescriptions', text: `Les charges ou répétitions n’ont pas augmenté sur : ${flat.map((x) => x.name).join(', ')}. Une progression graduelle (un seul paramètre à la fois) est une piste.` });
  if (series.size >= 6) hyps.push({ title: 'Variété', text: `${series.size} exercices différents pour ces capacités en 4 semaines : changer souvent d’exercice peut rendre la progression difficile à mesurer.` });
  const m = g.metricId && ctx.metrics[g.metricId];
  if (m) { const t = metricTrend(g.metricId, ctx); if (t) facts.push(t.text); else missing.push(`Moins de deux mesures de « ${m.label} » : impossible de mesurer une évolution.`); }
  if (!relevant.length) missing.push('Aucune séance récente liée à cet objectif.');
  if (!hyps.length) hyps.push({ title: 'Données insuffisantes', text: 'Rien de net dans tes données : la progression peut aussi simplement demander plus de temps. Un test régulier aidera à la mesurer.' });
  return { goal: goalLabel(g), hypotheses: hyps, facts, missing, note: 'Plusieurs hypothèses possibles, basées uniquement sur tes données : ce ne sont ni des certitudes ni un avis médical.' };
}

/* ═════════════ « Et si… ? » (changement de volume planifié, pas une prédiction) ═════════════ */
export function whatIf(capId, perWeek, ctx, setsPerSession = 10) {
  const vol4w = capVolume(ctx, 28)[capId] || 0;
  const sessions4w = ctx.history.filter((h) => ctx.now - h.startedAt <= 28 * DAY && (h.data?.exercises || []).some((e) => doneSets(e) && (exCaps(e, ctx)[capId] || 0) >= 0.5)).length;
  const curWeek = round(vol4w / 4, 1), curSessions = round(sessions4w / 4, 1);
  const planned = perWeek * setsPerSession;
  return {
    capId, label: CAPACITIES[capId]?.label || capId, perWeek, current: { sessionsPerWeek: curSessions, setsPerWeek: curWeek }, planned: { sessionsPerWeek: perWeek, setsPerWeek: planned },
    diff: round(planned - curWeek, 1), minutes: perWeek * setsPerSession * 2.5,
    text: `Aujourd’hui : ${curSessions} séance(s) et ~${curWeek} séries par semaine sur « ${CAPACITIES[capId]?.label || capId} ». Avec ${perWeek} séance(s) de ~${setsPerSession} séries : ~${planned} séries par semaine (${planned - curWeek >= 0 ? '+' : ''}${round(planned - curWeek, 1)}), soit environ ${Math.round(perWeek * setsPerSession * 2.5)} min hebdomadaires.`,
    disclaimer: 'Simulation du volume planifié uniquement : l’application ne prédit pas le résultat.',
  };
}

/* ═════════════ Records ═════════════ */
export function records(ctx) {
  const out = [];
  for (const [id, m] of Object.entries(ctx.metrics)) {
    if (m.kind === 'grade') {
      const list = perfsOf(id, ctx).filter((p) => p.grade && !p.unknown);
      const bySys = {}; for (const p of list) if (!bySys[p.grade.systemId] || p.grade.order > bySys[p.grade.systemId].grade.order) bySys[p.grade.systemId] = p;
      for (const p of Object.values(bySys)) out.push({ kind: 'perf', metricId: id, label: m.label, text: perfText(p, ctx), date: p.date, caps: m.caps });
    } else { const b = bestPerf(id, ctx); if (b) out.push({ kind: 'perf', metricId: id, label: m.label, text: perfText(b, ctx), date: b.date, caps: m.caps }); }
  }
  const ex = new Map();
  for (const h of [...ctx.history].reverse()) for (const e of h.data?.exercises || []) for (const s of e.sets || []) {
    if (s.done === false) continue;
    const k = exKey(e.name), cur = ex.get(k) || { name: e.name, load: 0, reps: 0, seconds: 0, date: 0 };
    let better = false;
    if ((s.load || 0) > cur.load) { cur.load = s.load; better = true; }
    if (!s.load && (s.reps || 0) > cur.reps) { cur.reps = s.reps; better = true; }
    if ((s.seconds || 0) > cur.seconds) { cur.seconds = s.seconds; better = true; }
    if (better) cur.date = h.startedAt;
    ex.set(k, cur);
  }
  for (const r of ex.values()) if (r.date) out.push({ kind: 'exercise', label: r.name, text: r.load ? `${r.load} kg` : r.seconds ? `${r.seconds} s` : `${r.reps} rép.`, date: r.date, caps: exCaps({ name: r.name }, ctx) });
  return out.sort((a, b) => b.date - a.date);
}

/* ═════════════ Timeline de progression ═════════════ */
export function timeline(ctx) {
  const ev = [];
  const firstAct = {};
  for (const h of [...ctx.history].reverse()) {
    const a = entryActivity(h, ctx);
    if (!firstAct[a]) { firstAct[a] = h.startedAt; ev.push({ t: h.startedAt, kind: 'milestone', icon: '🌱', text: `Première séance enregistrée : ${activityLabel(a, ctx)}` }); }
  }
  // Nouveaux records de performances : chaque mesure meilleure que toutes les précédentes.
  for (const [id, m] of Object.entries(ctx.metrics)) {
    let best = null;
    for (const p of perfsOf(id, ctx).filter((x) => !x.unknown && x.value != null).sort((a, b) => a.date - b.date)) {
      if (best == null || (m.dir === -1 ? p.value < best : p.value > best)) { if (best != null) ev.push({ t: p.date, kind: 'record', icon: '🏆', text: `Nouveau record — ${m.label} : ${perfText(p, ctx)}` }); best = p.value; }
    }
    const grades = perfsOf(id, ctx).filter((x) => x.grade && !x.unknown).sort((a, b) => a.date - b.date);
    const bestBy = {};
    for (const p of grades) { const b = bestBy[p.grade.systemId]; if (b == null || p.grade.order > b) { if (b != null) ev.push({ t: p.date, kind: 'record', icon: '🧗', text: `Nouveau maximum — ${m.label} : ${p.grade.label} (${p.grade.systemName})` }); bestBy[p.grade.systemId] = p.grade.order; } }
  }
  for (const g of ctx.goals) {
    if (g.startedAt) ev.push({ t: g.startedAt, kind: 'goal', icon: '🎯', text: `Objectif commencé : ${goalLabel(g)}` });
    if (g.status === 'done' && g.doneAt) ev.push({ t: g.doneAt, kind: 'goal', icon: '✅', text: `Objectif atteint : ${goalLabel(g)}` });
  }
  for (const gap of regularity(ctx, 26).gaps) if (gap.to) ev.push({ t: gap.to, kind: 'period', icon: '↩️', text: `Reprise après ${gap.days} jours sans séance` });
  for (const l of ctx.labs) if (l.startDate) ev.push({ t: Date.parse(l.startDate), kind: 'lab', icon: '🧪', text: `Expérience lancée : ${l.title}` });
  return ev.filter((e) => e.t && e.t <= ctx.now + 5 * 60000).sort((a, b) => b.t - a.t);
}

/* ═════════════ Journal (uniquement des données existantes) ═════════════ */
export function journal(ctx, limit = 80) {
  const out = [];
  for (const h of ctx.history) {
    const q = h.data?.questionnaire || {};
    const bits = [`${Math.round((h.durationSeconds || 0) / 60)} min`];
    if (h.data?.rpe) bits.push(`ressenti ${h.data.rpe}/5`);
    if (h.data?.aborted) bits.push('interrompue');
    if (q.hardest) bits.push(`plus difficile : ${q.hardest}`);
    if (q.felt?.length) bits.push(`muscles sentis : ${q.felt.map((m) => MUSCLES[m]?.label || m).join(', ')}`);
    out.push({ t: h.startedAt, kind: 'session', icon: '✅', title: h.sessionName, text: bits.join(' · '), note: [h.data?.note, q.comment].filter(Boolean).join(' — '), id: h.id });
  }
  for (const p of ctx.perfs) out.push({ t: p.date, kind: 'perf', icon: p.unknown ? '❔' : '📏', title: ctx.metrics[p.metricId]?.label || 'Performance', text: perfText(p, ctx) + (p.styles?.length ? ' · ' + p.styles.map((s) => ctx.styles[s]?.label || s).join(', ') : ''), note: p.note || '' });
  for (const a of ctx.ascents) out.push({ t: a.date, kind: 'ascent', icon: '🧗', title: `${a.kind === 'voie' ? 'Voie' : 'Bloc'} ${a.grade?.label || a.gradeText || ''}`.trim(), text: [a.result, a.attempts ? a.attempts + ' essai(s)' : ''].filter(Boolean).join(' · '), note: a.note || '' });
  for (const n of ctx.jnotes) out.push({ t: n.date, kind: 'note', icon: '📝', title: 'Note', text: n.text, note: '' });
  return out.filter((x) => x.t && x.t <= ctx.now + 5 * 60000).sort((a, b) => b.t - a.t).slice(0, limit);
}

/* ═════════════ Gamification discrète : jalons ═════════════ */
export function achievements(ctx) {
  const a = [];
  const reg = regularity(ctx, 26);
  const acts = new Set(ctx.history.map((h) => entryActivity(h, ctx)));
  for (const id of acts) if (id !== 'autre') a.push({ id: 'first:' + id, icon: '🌱', label: `Première séance — ${activityLabel(id, ctx)}` });
  let best = 0, run = 0; for (const w of reg.weeks) { run = w >= 2 ? run + 1 : 0; best = Math.max(best, run); }
  for (const n of [4, 8, 12]) if (best >= n) a.push({ id: 'reg' + n, icon: '📅', label: `${n} semaines d’affilée avec au moins 2 séances` });
  const started = ctx.goals.length, done = ctx.goals.filter((g) => g.status === 'done').length;
  if (started) a.push({ id: 'goal-start', icon: '🎯', label: `${started} objectif(s) commencé(s)` });
  if (done) a.push({ id: 'goal-done', icon: '✅', label: `${done} objectif(s) atteint(s)` });
  const recs = timeline(ctx).filter((e) => e.kind === 'record');
  if (recs.length) a.push({ id: 'records', icon: '🏆', label: `${recs.length} nouveau(x) record(s) personnel(s)` });
  if (ctx.history.length >= 10) a.push({ id: 's10', icon: '🔟', label: '10 séances enregistrées' });
  if (ctx.history.length >= 50) a.push({ id: 's50', icon: '⭐', label: '50 séances enregistrées' });
  return a;
}

/* ═════════════ « Tu n'as jamais essayé » ═════════════ */
export function neverTried(ctx, { activityId, goal, level = 0, envId } = {}) {
  const eq = availableEquipment(ctx, envId);
  const done = new Set(); for (const h of ctx.history) for (const e of h.data?.exercises || []) { const lib = libFor(e); if (lib) done.add(lib.id); }
  const wantCaps = goal ? goalCaps(goal, ctx).map((x) => x.id) : Object.keys(relevantCaps(ctx, activityId));
  const cands = LIBRARY.filter((x) => x.role === 'main' && !done.has(x.id) && (x.minLevel || 0) <= level && x.needs.every((n) => eq.has(n)) && ctx.prefs[exKey(x.name)]?.value !== 'evite'
    && (!activityId || x.acts.includes(activityId)) && Object.keys(x.caps).some((c) => wantCaps.includes(c)) && x.intensity !== 'high');
  return cands.map((x) => {
    const c = Object.entries(x.caps).filter(([id]) => wantCaps.includes(id)).sort((a, b) => b[1] - a[1])[0];
    return { lib: x, reason: `Jamais essayé dans l’appli ; travaille « ${CAPACITIES[c[0]]?.label || c[0]} »${goal ? ` utile pour « ${goalLabel(goal)} »` : ''}, compatible avec ton matériel et ton niveau.` };
  }).sort((a, b) => a.lib.diff - b.lib.diff).slice(0, 3);
}

/* ═════════════ « Que dois-je faire aujourd'hui ? » ═════════════ */
/** Options (jamais une seule réponse imposée), chacune avec sa raison et les données utilisées. */
export function todayOptions(ctx, { todayEvents = [], minutes = null } = {}) {
  const opts = [];
  const last = ctx.history[0], hoursSince = last ? (ctx.now - last.startedAt) / HOUR : Infinity;
  const load = loadAnalysis(ctx), forgotten = forgottenGoals(ctx), under = undertrained(ctx), reg = regularity(ctx);
  const pref = Number(ctx.config.main?.durations?.[0]) || null;
  const dur = minutes || pref || (ctx.history.length ? Math.max(10, Math.min(90, Math.round(median(ctx.history.slice(0, 8).map((h) => (h.durationSeconds || 0) / 60)) / 5) * 5)) : 30);
  const how = [`${ctx.history.length} séance(s) dans ton historique`, last ? `dernière séance il y a ${Math.round(hoursSince)} h (${last.sessionName})` : 'aucune séance enregistrée', reg.text];
  for (const ev of todayEvents.filter((e) => !e.completed).slice(0, 2)) opts.push({ kind: 'event', id: 'event:' + ev.id, title: ev.title || 'Séance prévue', reason: 'C’est planifié aujourd’hui dans ton calendrier.', eventId: ev.id, sessionId: ev.sessionId || null, how: ['Événement du calendrier du jour'] });
  if (hoursSince < 20 || load.signals.length >= 2) opts.push({ kind: 'rest', id: 'rest', title: 'Repos ou récupération légère', reason: hoursSince < 20 ? `Dernière séance il y a ${Math.round(hoursSince)} h : se reposer est une option tout aussi valable.` : 'Ta charge récente a augmenté : une journée légère est une option.', light: true, minutes: Math.min(dur, 20), how: [...how, ...load.signals] });
  const fg = forgotten[0];
  if (fg) opts.push({ kind: 'generate', id: 'goal:' + fg.goal.id, title: `Reprendre « ${fg.label} »`, reason: fg.days != null ? `Pas travaillé depuis ${fg.days} jours.` : 'Objectif configuré mais pas encore travaillé.', mode: 'goal', goalId: fg.goal.id, minutes: dur, how: [...how, `objectif actif : ${fg.label}`] });
  else if (activeGoals(ctx)[0]) { const g = activeGoals(ctx)[0]; opts.push({ kind: 'generate', id: 'goal:' + g.id, title: `Avancer vers « ${goalLabel(g)} »`, reason: 'Ton objectif actif principal.', mode: 'goal', goalId: g.id, minutes: dur, how: [...how, `objectif actif : ${goalLabel(g)}`] }); }
  if (under.items[0]) opts.push({ kind: 'generate', id: 'weak:' + under.items[0].id, title: `Travailler ${under.items[0].label.toLowerCase()}`, reason: under.items[0].text, mode: 'weaknesses', capId: under.items[0].id, minutes: dur, how: [...how, under.text] });
  if (!opts.some((o) => o.kind === 'generate')) opts.push({ kind: 'generate', id: 'gen:decouverte', title: ctx.history.length ? 'Séance du jour' : 'Séance découverte', reason: ctx.history.length ? 'Équilibrée selon ce que tu as le moins travaillé récemment.' : 'Pas encore d’historique : une séance courte pour commencer, sans présumer de ton niveau.', mode: 'weaknesses', minutes: ctx.history.length ? dur : 20, how });
  if (last?.data?.rpe >= 4 && hoursSince < 48 && !opts.some((o) => o.light)) opts.push({ kind: 'generate', id: 'gen:leger', title: 'Version légère (technique / mobilité)', reason: `Ta dernière séance était ressentie comme dure (${last.data.rpe}/5) il y a ${Math.round(hoursSince)} h : une alternative plus douce si tu ne te sens pas frais.`, light: true, mode: 'weaknesses', minutes: Math.min(dur, 25), how });
  opts.push({ kind: 'express', id: 'express', title: 'Express 10 minutes', reason: 'Peu de temps ? Une séance courte reconstruite pour 10 minutes.', minutes: 10, mode: 'weaknesses', how: ['Durée choisie : 10 min'] });
  return { options: opts.slice(0, 4), note: 'Je ne connais pas ta forme du jour : choisis l’option qui te correspond.' };
}

/* ═════════════ Diagnostics avancés (descriptifs) ═════════════ */
export function diagnostics(ctx) {
  const out = [];
  for (const id of Object.keys(ctx.metrics)) { const t = metricTrend(id, ctx); if (t && t.dir !== 0) out.push({ kind: 'evolution', icon: t.dir > 0 ? '📈' : '📉', text: `Évolution : ${t.text}.` }); }
  const v = capVolume(ctx, 30);
  const pull = (v.tirage_vertical || 0) + (v.tirage_horizontal || 0), push = (v.poussee_horizontale || 0) + (v.poussee_verticale || 0);
  if (pull + push >= 20 && (pull > push * 3 || push > pull * 3)) out.push({ kind: 'desequilibre', icon: '⚖️', text: `Déséquilibre tirage / poussée sur 30 jours : ${Math.round(pull)} séries de tirage pour ${Math.round(push)} de poussée.` });
  const load = loadAnalysis(ctx); for (const s of load.signals) out.push({ kind: 'charge', icon: '📊', text: s });
  for (const p of learnedPreferences(ctx).filter((x) => x.swappedOut >= 2).slice(0, 3)) out.push({ kind: 'remplacement', icon: '🔄', text: `« ${p.name} » a été remplacé ${p.swappedOut} fois.` });
  for (const f of forgottenGoals(ctx).slice(0, 3)) out.push({ kind: 'objectif', icon: '🎯', text: f.days != null ? `Objectif « ${f.label} » pas travaillé depuis ${f.days} jours.` : `Objectif « ${f.label} » pas encore travaillé.` });
  for (const a of atypicalSessions(ctx).slice(0, 3)) out.push({ kind: 'atypique', icon: '🔍', text: a.text });
  return { items: out, disclaimer: 'Analyses descriptives de tes données, sans valeur médicale.' };
}

/* ═════════════ « Comprendre mon profil » : ce que l'app sait, et comment ═════════════ */
export function understandProfile(ctx) {
  const measured = ctx.perfs.filter((p) => p.source === 'measured' && !p.unknown).map((p) => `${ctx.metrics[p.metricId]?.label || p.metricId} : ${perfText(p, ctx)} (${fmtDay(p.date)})`);
  const declared = [
    ...ctx.perfs.filter((p) => p.source !== 'measured' && !p.unknown).map((p) => `${ctx.metrics[p.metricId]?.label || p.metricId} : ${perfText(p, ctx)} (${fmtDay(p.date)})`),
    ...Object.values(ctx.capdecl).filter((d) => d.level >= 0).map((d) => `${CAPACITIES[d.capId]?.label || d.capId} : ${LEVEL_WORDS[d.level]}`),
    ...Object.values(ctx.activities).map((a) => `Activité suivie : ${a.label}`),
    ...ctx.goals.filter((g) => g.status === 'active').map((g) => `Objectif : ${goalLabel(g)}`),
  ];
  const s30 = ctx.history.filter((h) => ctx.now - h.startedAt <= 30 * DAY);
  const calculated = [`${ctx.history.length} séance(s) enregistrée(s), dont ${s30.length} sur 30 jours`, regularity(ctx).text, ...Object.entries(capVolume(ctx, 30)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, x]) => `Volume 30 j — ${CAPACITIES[id]?.label || id} : ${round(x, 1)} séries pondérées`)];
  const states = profileCapacities(ctx);
  const inferred = states.filter((s) => s.level != null).map((s) => `${s.label} : ${STATUS_WORD[s.status]} (niveau ≈ ${round(s.level, 1)} / 2, confiance ${confWord(s.confidence)})`);
  const recommended = [...testReminders(ctx).map((t) => t.text), ...undertrained(ctx).items.map((u) => `Travailler davantage : ${u.label}`)];
  const missing = [...new Set(states.flatMap((s) => s.missing))].slice(0, 12);
  if (!ctx.envs.length) missing.push('Aucun environnement / matériel décrit : le générateur reste prudent.');
  if (!Object.keys(ctx.activities).length) missing.push('Aucune activité choisie dans ton profil.');
  return {
    measured, declared, calculated, inferred, recommended, missing,
    method: [
      'Une métrique (ex. tractions max) est reliée à une ou plusieurs capacités avec un poids (ex. tirage vertical 1, blocage 0,3).',
      'Le niveau d’une capacité combine : ton niveau déclaré, tes performances comparées à des repères indicatifs courants, et tes maxima d’escalade convertis seulement si une correspondance existe.',
      'Chaque source est pondérée par sa récence (moins de 90 jours : pleine valeur) et par sa nature (mesuré > déclaré).',
      'La confiance augmente avec le nombre et la récence des sources. Une capacité sans source reste « non renseignée » : rien n’est inventé.',
      'Les forces et axes de travail comparent tes capacités entre elles, jamais à d’autres personnes.',
    ],
  };
}

/* ═════════════ Graphe objectif → capacités → exercices → métriques (dans les deux sens) ═════════════ */
export function graphFromGoal(g, ctx) {
  return goalCaps(g, ctx).map(({ id, w }) => ({
    capId: id, label: CAPACITIES[id]?.label || id, w,
    exercises: LIBRARY.filter((x) => x.role === 'main' && (x.caps[id] || 0) >= 0.5).sort((a, b) => b.caps[id] - a.caps[id]).slice(0, 8).map((x) => ({ id: x.id, name: x.name, w: x.caps[id] })),
    metrics: Object.entries(ctx.metrics).filter(([, m]) => (m.caps?.[id] || 0) >= 0.3).map(([mid, m]) => ({ id: mid, label: m.label, w: m.caps[id] })),
    muscles: Object.entries(MUSCLES).filter(([, m]) => (m.caps[id] || 0) >= 0.5).map(([mid, m]) => ({ id: mid, label: m.label })),
  }));
}
export function graphFromExercise(lib, ctx) {
  const caps = Object.entries(lib.caps || {}).sort((a, b) => b[1] - a[1]);
  return {
    muscles: { prim: (lib.prim || []).map((m) => MUSCLES[m]?.label || m), sec: (lib.sec || []).map((m) => MUSCLES[m]?.label || m) },
    caps: caps.map(([id, w]) => ({ id, label: CAPACITIES[id]?.label || id, w,
      goals: [...Object.entries(SKILLS).filter(([, s]) => s.caps[id]).map(([sid, s]) => ({ id: sid, label: s.label, skill: true })), ...activeGoals(ctx).filter((g) => goalCaps(g, ctx).some((x) => x.id === id)).map((g) => ({ id: g.id, label: goalLabel(g) }))],
      metrics: Object.entries(ctx.metrics).filter(([, m]) => (m.caps?.[id] || 0) >= 0.3).map(([mid, m]) => ({ id: mid, label: m.label })) })),
  };
}
export function graphFromCap(capId, ctx) {
  return {
    capId, label: CAPACITIES[capId]?.label || ctx.categories[capId]?.label || capId, desc: CAPACITIES[capId]?.desc || ctx.categories[capId]?.description || '',
    exercises: LIBRARY.filter((x) => x.role === 'main' && (x.caps[capId] || 0) >= 0.4).sort((a, b) => b.caps[capId] - a.caps[capId]).slice(0, 10).map((x) => ({ id: x.id, name: x.name, w: x.caps[capId] })),
    metrics: Object.entries(ctx.metrics).filter(([, m]) => (m.caps?.[capId] || 0) >= 0.3).map(([id, m]) => ({ id, label: m.label, w: m.caps[capId] })),
    muscles: Object.entries(MUSCLES).filter(([, m]) => (m.caps[capId] || 0) >= 0.3).map(([id, m]) => ({ id, label: m.label })),
    goals: [...Object.entries(SKILLS).filter(([, s]) => s.caps[capId]).map(([id, s]) => ({ id, label: s.label, skill: true })), ...activeGoals(ctx).filter((g) => goalCaps(g, ctx).some((x) => x.id === capId)).map((g) => ({ id: g.id, label: goalLabel(g) }))],
  };
}

/* ═════════════ Ma carte d'entraînement ═════════════ */
export function trainingMap(ctx) {
  const states = profileCapacities(ctx);
  const acts = {}; for (const h of ctx.history.filter((x) => ctx.now - x.startedAt <= 90 * DAY)) { const a = entryActivity(h, ctx); acts[a] = (acts[a] || 0) + 1; }
  return {
    activities: [...new Set([...Object.keys(ctx.activities), ...Object.keys(acts)])].map((id) => ({ id, label: activityLabel(id, ctx), sessions90: acts[id] || 0 })),
    capacities: states, goals: activeGoals(ctx).map((g) => ({ goal: g, label: goalLabel(g), progress: goalProgress(g, ctx) })),
    habits: habits(ctx), equipment: [...availableEquipment(ctx)].map((k) => EQUIPMENT[k] || k), envs: ctx.envs.map((e) => e.name),
    progression: records(ctx).slice(0, 5), regularity: regularity(ctx),
  };
}

/* ═════════════ Résumés hebdomadaires et mensuels ═════════════ */
export function periodSummary(ctx, kind = 'week') {
  const days = kind === 'month' ? 30 : 7;
  const b = benchmarks(ctx, days);
  const worked = activeGoals(ctx).filter((g) => { const caps = goalCaps(g, ctx).map((x) => x.id); return Object.keys(b.cur.caps).some((c) => caps.includes(c) && b.cur.caps[c] >= 2); }).map(goalLabel);
  const newRecords = timeline(ctx).filter((e) => e.kind === 'record' && e.t > ctx.now - days * DAY);
  return {
    kind, days, sessions: b.cur.sessions, minutes: b.cur.minutes, activities: Object.entries(b.cur.activities).map(([id, n]) => ({ id, label: activityLabel(id, ctx), n })),
    progression: [...newRecords.map((r) => r.text), ...b.trends.filter((t) => t.dir > 0).map((t) => t.text)], goalsWorked: worked,
    undertrained: undertrained(ctx).items.map((x) => x.label), regularity: regularity(ctx), compare: b,
  };
}

/* ═════════════ Mode Lab : expériences personnelles ═════════════ */
export function labReport(lab, ctx) {
  const start = Date.parse(lab.startDate || '') || 0, end = start + (lab.weeks || 4) * 7 * DAY;
  const during = ctx.history.filter((h) => h.startedAt >= start && h.startedAt <= Math.min(end, ctx.now));
  const capSets = lab.capId ? during.reduce((t, h) => t + (h.data?.exercises || []).reduce((u, e) => u + doneSets(e) * (exCaps(e, ctx)[lab.capId] || 0), 0), 0) : null;
  const m = lab.metricId && ctx.metrics[lab.metricId];
  const before = lab.before?.value ?? (m ? perfsOf(lab.metricId, ctx).find((p) => p.date <= start && !p.unknown)?.value ?? null : null);
  const after = lab.after?.value ?? (m ? perfsOf(lab.metricId, ctx).find((p) => p.date >= start && p.date <= end + 7 * DAY && !p.unknown)?.value ?? null : null);
  const diff = before != null && after != null ? round((after - before) * (m?.dir === -1 ? -1 : 1), 2) : null;
  const progress = Math.max(0, Math.min(1, (ctx.now - start) / Math.max(1, end - start)));
  return { lab, start, end, sessions: during.length, capSets: capSets == null ? null : round(capSets, 1), before, after, diff, unit: m?.unit || '', progress: round(progress, 2),
    text: diff == null ? 'Il manque la mesure avant ou après pour comparer.' : `Avant : ${before} ${m?.unit || ''} · après : ${after} ${m?.unit || ''} (${diff > 0 ? 'mieux' : diff < 0 ? 'moins bien' : 'identique'}).`,
    disclaimer: 'Une expérience personnelle ne démontre pas une causalité : d’autres facteurs (sommeil, forme, autres séances) peuvent jouer.' };
}
