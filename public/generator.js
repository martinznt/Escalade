// generator.js — générateur universel explicable (toutes activités) + outils de modification de séance.
//  - planSession : SIMULATION avant génération (intention, capacités ciblées, répartition, durée, difficulté,
//    matériel nécessaire, raison de chaque bloc). L'utilisateur peut modifier les priorités puis générer.
//  - generateFromPlan : construit la séance ; l'escalade réutilise le générateur historique (engine.js)
//    pour garder ses règles de récupération des doigts, de niveau et de prévention.
//  - adaptDuration : reconstruit une séance pour 5, 10, 12, 15, 20, 30 min… (ne coupe pas simplement la fin).
//  - alternatives / replaceExercise : remplacement intelligent, chaque alternative avec sa raison.
//  - rebuildForEquipment / newPossibilities : matériel qui change.
// Aucune performance n'est inventée ; chaque choix important est expliqué (faits / inférences / manques / exclusions).
// Pur JavaScript, sans DOM.

import { normalizeEx, normalizeSession, uid, exKey, clamp } from './shared.js';
import { LIBRARY, byId, FOCUS } from './library.js';
import { CAPACITIES, ACTIVITIES, INTENTIONS, EQUIPMENT } from './model.js';
import { generateSession as climbGenerate, exMinutes, sessionMinutes, progressHint, analyze, levelFrom } from './engine.js';
import { profileCapacities, strengthsWeaknesses, availableEquipment, goalCaps, goalLabel, capVolume, relevantCaps, undertrained, exCaps, capacityState, perfsOf, confWord, STATUS_WORD, DAY } from './brain.js';
import { bestReferenceLevel, levelFromReference } from './grading.js';
import { estimateLevel, LEVEL_LABEL } from './estimate.js';

const capName = (id, ctx) => CAPACITIES[id]?.label || ctx?.categories?.[id]?.label || id;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const isClimbing = (a) => a === 'climbing_boulder' || a === 'climbing_route';

/* ───────── Mots → capacités (commandes naturelles, raccourcis) ───────── */
export const BODY_WORDS = {
  jambes: { force_jambes: 3, chaine_posterieure: 2, explosivite: 1 }, cuisses: { force_jambes: 3 }, fessiers: { chaine_posterieure: 3, force_jambes: 1 },
  dos: { tirage_vertical: 3, tirage_horizontal: 2 }, tirage: { tirage_vertical: 3, tirage_horizontal: 2 }, tractions: { tirage_vertical: 3, blocage: 1 },
  bras: { tirage_vertical: 2, poussee_horizontale: 2 }, pecs: { poussee_horizontale: 3 }, pectoraux: { poussee_horizontale: 3 }, poussee: { poussee_horizontale: 3, poussee_verticale: 2 },
  epaules: { stabilite_epaules: 3, poussee_verticale: 1 }, abdos: { gainage_anterieur: 3, gainage_lateral: 1 }, gainage: { gainage_anterieur: 3, gainage_lateral: 2 }, tronc: { gainage_anterieur: 3, gainage_lateral: 2 },
  doigts: { force_doigts: 3, endurance_doigts: 1 }, avantbras: { endurance_doigts: 3, pince: 1 }, mobilite: { mobilite_hanches: 3, mobilite_epaules: 3 }, souplesse: { mobilite_hanches: 3, mobilite_epaules: 2 },
  cardio: { endurance_aerobie: 3 }, endurance: { endurance_aerobie: 3, endurance_doigts: 1 }, vitesse: { vitesse: 3 }, explosivite: { explosivite: 3 }, equilibre: { equilibre: 3 },
  dalle: { technique_pieds: 3, equilibre: 2 }, devers: { tirage_vertical: 2, gainage_anterieur: 2, puissance_haut: 2 }, technique: { technique_escalade: 2, technique_course: 1, technique_nage: 1 },
};

/* ───────── Budget de temps (échauffement / corps / retour au calme) ───────── */
export function budget(minutes, light = false) {
  const m = clamp(minutes, 5, 240, 30);
  if (m <= 7) return { warm: 1, main: m - 1, cool: 0, maxN: 1 };
  if (m <= 12) return { warm: 2, main: m - 3, cool: 1, maxN: 2 };
  if (m <= 20) return { warm: 3, main: m - 5, cool: 2, maxN: 3 };
  if (m <= 35) return { warm: 6, main: m - 9, cool: 3, maxN: 4 };
  const warm = Math.min(15, Math.round(m * 0.15)), cool = Math.min(8, Math.round(m * 0.08));
  return { warm, main: m - warm - cool, cool, maxN: m <= 50 ? 5 : m <= 75 ? 6 : 7, light };
}
const WARM = {
  strength: ['wu-pulse', 'wu-mob-upper', 'wu-mob-lower', 'wu-core'], conditioning: ['wu-pulse', 'wu-mob-upper', 'wu-mob-lower', 'wu-core'],
  running: ['run-short', 'mob-ankles', 'run-drills'], swimming: ['swim-warm'], custom: ['wu-pulse', 'wu-mob-lower', 'wu-mob-upper'],
};
const COOL = { strength: ['cd-shoulders', 'cd-hips', 'cd-breath'], conditioning: ['cd-hips', 'cd-shoulders', 'cd-breath'], running: ['mob-hamstrings', 'cd-hips', 'cd-breath'], swimming: ['cd-shoulders', 'cd-breath'], custom: ['cd-hips', 'cd-breath'] };
const toEx = (lib, block, over = {}) => normalizeEx({ ...lib, id: uid(), block, libId: lib.id, ok: lib.cues, bad: lib.bad, note: '', ...over });

/* ───────── Niveau et réglages dérivés du profil ───────── */
export function levelFor(activityId, ctx) {
  if (isClimbing(activityId)) {
    const act = activityId === 'climbing_route' ? 'voie' : 'bloc';
    const ref = bestReferenceLevel(perfsOf(act === 'voie' ? 'max_voie' : 'max_bloc', ctx), ctx.systems, act);
    if (ref) return { level: levelFromReference(ref.index, act), how: `maximum ${ref.label} (${ref.via})` };
    const lv = levelFrom(ctx.settings || {});
    return { level: lv, how: ctx.settings?.level?.years != null ? 'années de pratique déclarées' : 'aucun niveau renseigné : prudence (débutant)' };
  }
  const known = profileCapacities(ctx, activityId).filter((s) => s.level != null && s.relevance >= 0.5);
  if (!known.length) return { level: 0, how: 'aucune capacité renseignée pour cette activité : prudence (débutant)' };
  const mean = known.reduce((t, s) => t + s.level, 0) / known.length, conf = known.reduce((t, s) => t + s.confidence, 0) / known.length;
  // Arrondi prudent : 0,5 reste « débutant », il faut ≈ 0,66 pour passer au niveau suivant.
  const level = Math.max(0, Math.min(2, Math.floor((conf < 0.35 ? Math.min(mean, 1) : mean) + 0.34)));
  return { level, how: `moyenne de ${known.length} capacité(s) estimée(s) (confiance ${confWord(conf)})` };
}
function climbSettings(ctx, eq) {
  const s = ctx.settings || {};
  const b = bestReferenceLevel(perfsOf('max_bloc', ctx), ctx.systems, 'bloc'), r = bestReferenceLevel(perfsOf('max_voie', ctx), ctx.systems, 'voie');
  return {
    ...s, level: { boulderMax: b?.label || s.level?.boulderMax || '', routeMax: r?.label || s.level?.routeMax || '', years: s.level?.years ?? null },
    equipment: Object.fromEntries(['wall', 'hangboard', 'bar', 'dips', 'weights', 'band'].map((k) => [k, eq.has(k)])), avoid: { ...(s.avoid || {}), ...(fingerComplaint(ctx) ? { fingers: true } : {}) },
  };
}

/* ───────── Candidats (filtrés et justifiés) ───────── */
const SHOULDER = new Set(['dips', 'pike-pushup', 'shoulder-press', 'dynos', 'ring-dips', 'overhead-press', 'wall-handstand', 'flag-full', 'flag-tuck']);
const ELBOW = new Set(['pullup-heavy', 'lockoff', 'explosive-pullup', 'wrist-extension', 'oap', 'oap-negative', 'archer-pullup']);
const KNEE = new Set(['bulgarian', 'cossack', 'jump-vertical', 'skater-jumps', 'step-up-explosive', 'squat-loaded', 'pistol', 'box-jump', 'back-squat', 'run-hills', 'run-intervals']);
function customPool(activityId, ctx) {
  const cats = Object.values(ctx.categories).filter((c) => c.activityId === activityId);
  const capIds = new Set(cats.flatMap((c) => (c.caps?.length ? c.caps.map((x) => x.id) : [c.id])));
  const personal = ctx.personal.filter((p) => (p.acts || []).includes(activityId) || Object.keys(p.caps || {}).some((c) => capIds.has(c)))
    .map((p) => ({ ...normalizeEx(p), id: 'perso:' + p.id, role: 'main', needs: p.needs || [], minLevel: 0, intensity: p.intensity || 'mod', personal: true, cues: p.ok || [], bad: p.bad || [], caps: p.caps || {} }));
  const lib = LIBRARY.filter((x) => x.role === 'main' && Object.keys(x.caps).some((c) => capIds.has(c)));
  return { pool: [...personal, ...lib], cats, capIds };
}
/** Gêne ou douleur aux doigts signalée dans un questionnaire des 3 derniers jours (réponse de l'utilisateur, pas un diagnostic). */
export function fingerComplaint(ctx) {
  return ctx.history.some((h) => ctx.now - h.startedAt < 3 * DAY && (h.data?.questionnaire?.answers || []).some((a) => a.q === 'doigts' && /douleur|gêne/i.test(a.a)));
}
export function candidates(activityId, ctx, { eq, level, light }) {
  const A = analyze(ctx.history, ctx.now), avoid = { ...(ctx.settings?.avoid || {}) };
  const complaint = fingerComplaint(ctx);
  const base = ACTIVITIES[activityId] ? LIBRARY.filter((x) => x.role === 'main' && x.acts.includes(activityId)) : customPool(activityId, ctx).pool;
  const ok = [], excluded = [];
  for (const x of base) {
    const why = [];
    const miss = (x.needs || []).filter((n) => !eq.has(n));
    if (miss.length) why.push(`matériel indisponible (${miss.map((n) => EQUIPMENT[n] || n).join(', ')})`);
    if ((x.minLevel || 0) > level) why.push('niveau conseillé supérieur au tien');
    if (light && (x.intensity !== 'low' || (x.diff || 1) > 2)) why.push('mode léger : intensité trop élevée');
    if (x.risk === 'finger' && x.intensity === 'high' && A.hoursSinceHighFinger < 48) why.push(`doigts sollicités intensément il y a ${Math.round(A.hoursSinceHighFinger)} h (48 h conseillées)`);
    if (['plyo', 'legs', 'run'].includes(x.kind) && x.intensity === 'high' && A.hoursSinceHighLegs < 36) why.push(`jambes sollicitées intensément il y a ${Math.round(A.hoursSinceHighLegs)} h`);
    if (avoid.fingers && x.risk === 'finger') why.push('doigts à ménager (ton réglage)');
    else if (complaint && (x.risk === 'finger' || (x.caps?.force_doigts || 0) >= 0.8)) why.push('gêne aux doigts signalée dans ton dernier questionnaire');
    if (avoid.shoulders && (x.risk === 'shoulder' || SHOULDER.has(x.id))) why.push('épaules à ménager (ton réglage)');
    if (avoid.elbows && ELBOW.has(x.id)) why.push('coudes à ménager (ton réglage)');
    if (avoid.knees && KNEE.has(x.id)) why.push('genoux à ménager (ton réglage)');
    (why.length ? excluded : ok).push(why.length ? { x, why } : x);
  }
  return { ok, excluded };
}

/* ───────── Simulation avant génération ───────── */
/**
 * opts : { activityId, mode: weaknesses|strengths|goal, goalId, capId, minutes, intentions:[{id,p}], envId, light, priorities:{capId:0..3}, seed }
 */
export function planSession(opts = {}, ctx) {
  const activityId = opts.activityId || Object.keys(ctx.activities)[0] || 'conditioning';
  const minutes = clamp(opts.minutes, 5, 240, 30), light = !!opts.light, mode = opts.mode || 'weaknesses';
  const eq = availableEquipment(ctx, opts.envId);
  const env = ctx.envs.find((e) => e.id === opts.envId) || ctx.defEnv;
  const { level, how: levelHow } = levelFor(activityId, ctx);
  const goal = opts.goalId ? ctx.goals.find((g) => g.id === opts.goalId) : null;
  const states = profileCapacities(ctx, activityId);
  const byCap = Object.fromEntries(states.map((s) => [s.capId, s]));
  const sw = strengthsWeaknesses(states);
  const targets = {}, reasons = {};
  const add = (id, w, r) => { targets[id] = (targets[id] || 0) + w; (reasons[id] ||= []).push(r); };
  if (goal) for (const { id, w } of goalCaps(goal, ctx)) { const st = byCap[id] || capacityState(id, ctx); add(id, w * (st.level == null ? 1 : 1.25 - st.level / 4), `requise pour « ${goalLabel(goal)} » (poids ${w})${st.level != null ? ` · ${STATUS_WORD[st.status]}` : ' · niveau non renseigné'}`); }
  else if (mode === 'strengths') {
    const list = sw.strengths.length ? sw.strengths : states.filter((s) => s.level != null).sort((a, b) => b.level - a.level).slice(0, 2);
    for (const s of list.slice(0, 3)) add(s.capId, s.relevance || 0.7, `point fort à faire progresser (${STATUS_WORD[s.status]}, confiance ${confWord(s.confidence)})`);
  } else {
    for (const s of sw.weaknesses.slice(0, 3)) add(s.capId, (s.relevance || 0.7) * 1.2, `axe de travail (${STATUS_WORD[s.status]}, confiance ${confWord(s.confidence)})`);
    for (const u of undertrained(ctx).items.filter((u) => relevantCaps(ctx, activityId)[u.id]).slice(0, 2)) add(u.id, 0.8, `peu travaillée ces 30 jours (${u.actual} % du volume)`);
  }
  if (opts.capId) add(opts.capId, 1.5, 'capacité demandée');
  for (const it of opts.intentions || []) {
    const I = INTENTIONS[it.id]; if (!I) continue;
    for (const [c, cap] of Object.entries(CAPACITIES)) if (I.families.includes(cap.family) && relevantCaps(ctx, activityId)[c] != null) add(c, 0.25 * (it.p || 2), `intention « ${I.label} »`);
    if (it.id === 'mobilite') { add('mobilite_hanches', 0.5 * (it.p || 2), 'intention « Mobilité »'); add('mobilite_epaules', 0.4 * (it.p || 2), 'intention « Mobilité »'); }
  }
  if (!Object.keys(targets).length) {
    // Aucune donnée : on équilibre selon la structure de l'activité, en privilégiant ce qui a été le moins travaillé.
    const vol = capVolume(ctx, 30), rel = relevantCaps(ctx, activityId);
    for (const [id, w] of Object.entries(rel).sort((a, b) => (vol[a[0]] || 0) - (vol[b[0]] || 0) || b[1] - a[1]).slice(0, 3)) add(id, w, vol[id] ? 'moins travaillée récemment dans cette activité' : 'capacité importante de l’activité, pas encore travaillée');
  }
  if (light) for (const id of Object.keys(targets)) if (!['mobilite', 'technique', 'prevention', 'gainage'].includes(CAPACITIES[id]?.family)) targets[id] *= 0.5;
  if (light) { add('mobilite_hanches', 0.6, 'mode léger / récupération'); add('mobilite_epaules', 0.5, 'mode léger / récupération'); }
  for (const [id, p] of Object.entries(opts.priorities || {})) { if (Number(p) <= 0) delete targets[id]; else targets[id] = Number(p); if (!reasons[id]) reasons[id] = ['priorité choisie']; else reasons[id].push('priorité modifiée par toi'); }

  const { ok, excluded } = isClimbing(activityId) ? { ok: [], excluded: [] } : candidates(activityId, ctx, { eq, level, light });
  const trainable = (id) => isClimbing(activityId) || ok.some((x) => (x.caps?.[id] || 0) >= 0.3);
  const missing = [];
  for (const id of Object.keys(targets)) if (!trainable(id)) { missing.push(`${capName(id, ctx)} : aucun exercice compatible avec ton matériel ou ton niveau aujourd’hui.`); delete targets[id]; }
  const sorted = Object.entries(targets).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = sorted.reduce((t, [, w]) => t + w, 0) || 1;
  const B = budget(minutes, light);
  const distribution = sorted.map(([id, w]) => ({ capId: id, label: capName(id, ctx), pct: Math.round((w / total) * 100), weight: Math.round(w * 100) / 100, reasons: reasons[id] }));
  const blocks = [];
  if (B.warm) blocks.push({ kind: 'warmup', label: 'Échauffement', minutes: B.warm, reason: B.warm <= 2 ? 'Mise en route courte (séance express).' : 'Préparer les articulations et les capacités ciblées.' });
  let rest = B.main;
  distribution.slice(0, Math.min(3, B.maxN)).forEach((d, i, arr) => { const mm = i === arr.length - 1 ? rest : Math.round((B.main * d.pct) / 100); rest -= mm; blocks.push({ kind: 'main', label: d.label, minutes: mm, capId: d.capId, reason: d.reasons[0] }); });
  if (B.cool) blocks.push({ kind: 'cool', label: 'Retour au calme', minutes: B.cool, reason: 'Redescendre en douceur.' });
  const intensityWord = light ? 'légère' : level >= 2 ? 'soutenue' : level >= 1 ? 'modérée' : 'progressive';
  const est = Math.max(1, Math.min(5, (light ? 1 : 2) + level + ((opts.intentions || []).some((i) => ['force', 'puissance'].includes(i.id)) ? 1 : 0) + (minutes >= 75 ? 1 : 0) - (minutes <= 12 ? 1 : 0)));
  const constraints = excluded.filter((e) => e.why.some((w) => /doigts|jambes|ménager/.test(w))).slice(0, 4).map((e) => `${e.x.name} : ${e.why.join(', ')}`);
  const seed = Number.isFinite(opts.seed) ? opts.seed : Math.floor((ctx.now || Date.now()) % 2147483647);
  const plan = {
    activityId, activityLabel: ctx.activities[activityId]?.label || ACTIVITIES[activityId]?.label || activityId, minutes, light, mode, goalId: goal?.id || '', goalLabel: goal ? goalLabel(goal) : '',
    intentions: opts.intentions || [], priorities: opts.priorities || {}, envId: env?.id || '', envName: env?.name || '', equipment: [...eq], level, levelHow,
    distribution, blocks, difficulty: { value: est, text: `${est}/5 — intensité ${intensityWord} (niveau pris en compte : ${['débutant', 'intermédiaire', 'avancé'][level]}, ${levelHow})` },
    constraints, missing, seed, capId: opts.capId || '',
    intentionText: goal ? `Avancer vers « ${goalLabel(goal)} »` : light ? 'Séance légère : technique, mobilité, travail doux' : mode === 'strengths' ? 'Faire progresser tes points forts' : 'Travailler tes axes de progrès',
  };
  if (!isClimbing(activityId)) {
    const dry = selectMain(plan, ctx, ok);
    plan.preview = dry.items.map((i) => i.lib.name);
    plan.neededEquipment = [...new Set(dry.items.flatMap((i) => i.lib.needs || []))].map((n) => EQUIPMENT[n] || n);
  } else plan.neededEquipment = [...eq].filter((k) => ['wall', 'hangboard', 'bar', 'dips', 'weights', 'band'].includes(k)).map((n) => EQUIPMENT[n] || n);
  return plan;
}

/* ───────── Sélection des exercices principaux ───────── */
function selectMain(plan, ctx, pool) {
  const rng = mulberry32(plan.seed);
  const targets = Object.fromEntries(plan.distribution.map((d) => [d.capId, d.weight]));
  const B = budget(plan.minutes, plan.light);
  const recent = new Set(); for (const h of ctx.history) if (ctx.now - h.startedAt < 3 * DAY) for (const e of h.data?.exercises || []) recent.add(exKey(e.name));
  const everDone = new Set(); for (const h of ctx.history) for (const e of h.data?.exercises || []) everDone.add(exKey(e.name));
  const covered = {}, patterns = {}, items = [];
  const score = (x) => {
    let s = 0;
    for (const [c, w] of Object.entries(targets)) s += w * (x.caps?.[c] || 0) / (1 + (covered[c] || 0));
    if (s <= 0) return -Infinity;
    const pref = ctx.prefs[exKey(x.name)]?.value;
    if (pref === 'aime') s += 0.25; if (pref === 'evite') s -= 0.8;
    if (recent.has(exKey(x.name))) s -= 0.2; if (!everDone.has(exKey(x.name))) s += 0.08;
    if (x.pattern && patterns[x.pattern]) s -= 0.35 * patterns[x.pattern];
    return s + rng() * 0.15;
  };
  let mins = 0;
  // Un exercice dont la durée minimale dépasse le temps restant n'est pas proposé (ex. sortie longue pour 30 min).
  const minMinutes = (x) => exMinutes(normalizeEx({ ...x, sets: x.mode === 'time' && x.flex ? 1 : Math.min(x.sets || 1, 2), secMin: x.flex ? x.flex[0] : x.secMin, secMax: x.flex ? x.flex[0] : x.secMin }));
  while (items.length < B.maxN && mins < B.main * 0.85) {
    const avail = pool.filter((x) => !items.some((i) => i.lib.id === x.id) && minMinutes(x) <= Math.max(2, B.main - mins) * 1.15);
    let best = null, bs = -Infinity;
    for (const x of avail) { const s = score(x); if (s > bs) { bs = s; best = x; } }
    if (!best || bs === -Infinity) break;
    const ex = best.personal ? normalizeEx({ ...best, id: uid(), block: 'main', libId: '' }) : toEx(best, 'main');
    items.push({ lib: best, ex, score: bs });
    for (const [c, w] of Object.entries(best.caps || {})) if (targets[c]) covered[c] = (covered[c] || 0) + w;
    if (best.pattern) patterns[best.pattern] = (patterns[best.pattern] || 0) + 1;
    mins += exMinutes(ex);
  }
  return { items, targets };
}
function fitTime(items, target) {
  const total = () => items.reduce((t, i) => t + exMinutes(i.ex), 0);
  for (let g = 0; g < 40; g++) {
    const t = total();
    if (t > target * 1.1) {
      const flex = items.filter((i) => i.ex.mode === 'time' && i.lib.flex && i.ex.secMin > i.lib.flex[0]).sort((a, b) => exMinutes(b.ex) - exMinutes(a.ex))[0];
      const big = items.filter((i) => i.ex.sets > 1).sort((a, b) => exMinutes(b.ex) - exMinutes(a.ex))[0];
      if (flex && (!big || exMinutes(flex.ex) >= exMinutes(big.ex))) { flex.ex.secMin = flex.ex.secMax = Math.max(flex.lib.flex[0], Math.round(flex.ex.secMin * 0.85)); }
      else if (big) { if (big.ex.rest > 45 && big.ex.sets <= 2) big.ex.rest = Math.round(big.ex.rest * 0.75); else big.ex.sets--; }
      else if (items.length > 1) items.pop();
      else { const i = items[0]; const floor = i.lib.flex ? i.lib.flex[0] : 20; if (i.ex.mode === 'time' && i.ex.secMin > floor) { i.ex.secMin = i.ex.secMax = Math.max(floor, Math.round(i.ex.secMin * 0.8)); } else if (i.ex.rest > 20) i.ex.rest = Math.round(i.ex.rest * 0.7); else break; }
    } else if (t < target * 0.85) {
      const flex = items.find((i) => i.ex.mode === 'time' && i.lib.flex && i.ex.secMax < i.lib.flex[1]);
      const grow = items.filter((i) => i.ex.sets < (i.lib.sets || 3) + 2 && i.lib.intensity !== 'high').sort((a, b) => a.ex.sets - b.ex.sets)[0];
      if (flex) flex.ex.secMin = flex.ex.secMax = Math.min(flex.lib.flex[1], Math.round(flex.ex.secMax * 1.2));
      else if (grow) grow.ex.sets++;
      else break;
    } else break;
  }
}
function buildBlock(ids, block, budgetMin, targets) {
  const out = [];
  for (const id of ids) {
    const lib = byId(id); if (!lib) continue;
    const e = toEx(lib, block);
    out.push(e);
    if (out.reduce((t, x) => t + exMinutes(x), 0) >= budgetMin) break;
  }
  // Ajuste la dernière entrée pour tenir le budget (durée ou séries).
  let guard = 0;
  while (out.length && out.reduce((t, x) => t + exMinutes(x), 0) > budgetMin * 1.25 && guard++ < 20) {
    const e = out[out.length - 1];
    if (e.mode === 'time' && e.secMin > 20) e.secMin = e.secMax = Math.max(20, Math.round(e.secMin * 0.75));
    else if (e.sets > 1) e.sets--;
    else if (out.length > 1) out.pop();
    else break;
  }
  return out;
}

/* ───────── Génération finale ───────── */
export function generateFromPlan(plan, ctx) {
  const eq = new Set(plan.equipment);
  const why = [], facts = [], inferences = [], missing = [...plan.missing], excludedTxt = [];
  const B = budget(plan.minutes, plan.light);
  let exercises = [];
  facts.push(`Durée demandée : ${plan.minutes} min · activité : ${plan.activityLabel}${plan.envName ? ` · environnement : ${plan.envName}` : ''}.`);
  facts.push(`Matériel disponible : ${plan.equipment.length ? plan.equipment.map((n) => EQUIPMENT[n] || n).join(', ') : 'aucun déclaré'}.`);
  inferences.push(`Niveau pris en compte : ${['débutant', 'intermédiaire', 'avancé'][plan.level]} (${plan.levelHow}).`);
  for (const d of plan.distribution) inferences.push(`${d.label} ciblé(e) à ${d.pct} % : ${d.reasons.join(' ; ')}.`);
  if (plan.goalLabel) facts.push(`Objectif sélectionné : ${plan.goalLabel}.`);
  if (isClimbing(plan.activityId)) {
    const top = plan.distribution[0]?.capId;
    const FOCUS_OF = { force_doigts: 'reglette', pince: 'reglette', technique_pieds: 'dalle', equilibre: 'dalle', technique_escalade: 'dalle', tirage_vertical: 'devers', puissance_haut: 'devers', gainage_anterieur: 'devers', blocage: 'devers', endurance_doigts: 'resistance', endurance_aerobie: 'resistance', coordination: 'vitesse', explosivite: 'vitesse', force_jambes: 'jambes', stabilite_epaules: 'equilibre', mobilite_hanches: 'dalle' };
    const focus = plan.light ? 'dalle' : FOCUS_OF[top] || 'surprise';
    const size = plan.minutes <= 38 ? 'petite' : plan.minutes <= 62 ? 'moyenne' : 'grosse';
    const settings = climbSettings(ctx, eq);
    const r = climbGenerate({ size, focus, feeling: plan.light ? 'fatigue' : 'normal', equipment: settings.equipment, seed: plan.seed }, { settings, history: ctx.history, now: ctx.now });
    if (fingerComplaint(ctx)) excludedTxt.push('Travail spécifique des doigts écarté : gêne signalée dans ton dernier questionnaire.');
    exercises = r.session.exercises;
    why.push(...r.meta.why);
    facts.push(`Orientation escalade retenue : ${FOCUS[r.meta.focus]?.label || r.meta.focus}${r.meta.askedFocus !== r.meta.focus ? ` (au lieu de ${FOCUS[r.meta.askedFocus]?.label}, voir raisons)` : ''}.`);
    let s = normalizeSession({ ...r.session, exercises });
    if (Math.abs(sessionMinutes(s) - plan.minutes) > Math.max(4, plan.minutes * 0.15)) {
      const a = adaptDuration(s, plan.minutes, ctx);
      s = a.session; if (a.changes.length) why.push(`Adapté à ${plan.minutes} min : ${a.changes.join(' ; ')}.`);
    }
    exercises = s.exercises;
  } else {
    const { ok, excluded } = candidates(plan.activityId, ctx, { eq, level: plan.level, light: plan.light });
    for (const e of excluded.filter((e) => Object.keys(e.x.caps || {}).some((c) => plan.distribution.some((d) => d.capId === c && (e.x.caps[c] || 0) >= 0.6))).slice(0, 6)) excludedTxt.push(`${e.x.name} : ${e.why.join(', ')}.`);
    const { items, targets } = selectMain(plan, ctx, ok);
    if (!items.length) missing.push('Aucun exercice compatible trouvé : ajoute du matériel, un exercice personnel pour cette activité ou change les priorités.');
    for (const it of items) {
      const main = Object.entries(it.lib.caps || {}).filter(([c]) => targets[c]).sort((a, b) => b[1] - a[1])[0];
      const pref = ctx.prefs[exKey(it.lib.name)]?.value;
      let reason = main ? `Travaille ${capName(main[0], ctx)} (relation ${main[1]})` : 'Complète la séance';
      if (plan.goalLabel && main) reason += `, utile pour « ${plan.goalLabel} »`;
      if (pref === 'aime') reason += ' · tu l’aimes';
      if (pref === 'evite') { reason += ' · tu préfères l’éviter, mais aucun autre exercice disponible ne couvre aussi bien cette capacité aujourd’hui : conservé, remplace-le si tu veux'; why.push(`« ${it.lib.name} » conservé malgré ta préférence : nécessaire pour ${main ? capName(main[0], ctx) : 'la séance'}.`); }
      it.ex.why = reason.slice(0, 240);
      const hint = progressHint(it.ex, ctx.history);
      if (hint) { it.ex.note = `Dernière fois : ${hint.last}.${hint.next ? ' ' + hint.next + '.' : ''}`; if (hint.load && !it.ex.load) it.ex.load = `${hint.load} kg`; facts.push(`${it.lib.name} — dernière performance : ${hint.last}.`); }
    }
    fitTime(items, B.main);
    const warmIds = (WARM[plan.activityId] || WARM.custom).filter((id) => byId(id) && byId(id).needs.every((n) => eq.has(n)));
    const coolIds = plan.light ? ['cd-breath', 'mob-hips'] : (COOL[plan.activityId] || COOL.custom);
    const warm = B.warm <= 2 ? buildBlock([warmIds.find((id) => byId(id).mode === 'time') || warmIds[0]].filter(Boolean), 'warmup', B.warm, targets) : buildBlock(warmIds, 'warmup', B.warm, targets);
    const cool = B.cool ? buildBlock(coolIds, 'cool', B.cool, targets) : [];
    exercises = [...warm, ...items.map((i) => i.ex), ...cool];
    why.push(...items.map((i) => `${i.lib.name} : ${i.ex.why}.`));
    if (plan.light) why.push('Mode léger : uniquement des exercices à faible intensité (technique, mobilité, travail doux). Ce n’est pas un avis médical.');
  }
  for (const d of plan.distribution) { const st = capacityState(d.capId, ctx); for (const m of st.missing.slice(0, 1)) missing.push(`${d.label} : ${m}`); }
  const now = ctx.now || Date.now();
  const name = plan.goalLabel ? `${plan.goalLabel} — ${plan.minutes} min` : `${plan.activityLabel} — ${plan.light ? 'séance légère' : plan.mode === 'strengths' ? 'points forts' : 'axes de progrès'} ${plan.minutes} min`;
  const session = normalizeSession({
    id: uid(), name, emoji: ACTIVITIES[plan.activityId]?.emoji || ctx.activities[plan.activityId]?.emoji || '✨', goal: plan.goalId ? 'goal' : plan.mode, source: 'generated',
    durationMin: sessionMinutes({ exercises }), objectives: [plan.intentionText], activity: plan.activityId, intentions: plan.intentions,
    context: { env: plan.envId, envName: plan.envName, equipment: plan.equipment, plannedMin: plan.minutes, goalId: plan.goalId },
    notes: [
      { title: 'Pourquoi cette séance', text: [plan.intentionText + '.', ...why].join('\n') },
      { title: 'Sécurité', text: 'Stoppe au moindre signal de douleur aiguë. Ces séances suivent des principes d’entraînement courants : elles ne remplacent ni un coach ni un avis médical.' },
    ],
    explain: { facts, inferences, missing: [...new Set(missing)], excluded: excludedTxt },
    exercises, createdAt: now, updatedAt: now,
  });
  return { session, meta: { plan, why, explain: session.explain, level: estimateLevel(session) } };
}
export const generateUniversal = (opts, ctx) => generateFromPlan(planSession(opts, ctx), ctx);

/* ───────── Adaptation de durée : reconstruction (pas une simple coupe de fin) ───────── */
export function adaptDuration(session, minutes, ctx) {
  const s = normalizeSession(session), B = budget(minutes), changes = [];
  const warm = s.exercises.filter((e) => e.block === 'warmup'), main = s.exercises.filter((e) => e.block === 'main'), cool = s.exercises.filter((e) => e.block === 'cool');
  const clone = (e) => ({ ...e });
  const goalCapsSet = new Set(s.context?.goalId && ctx ? goalCaps(ctx.goals.find((g) => g.id === s.context.goalId) || {}, ctx).map((x) => x.id) : []);
  // Importance : l'ordre du générateur (travail clé d'abord), les capacités de l'objectif ; les « découvertes » en dernier.
  const ranked = main.map((e, i) => ({ e: clone(e), i, imp: 1 / (1 + i * 0.25) + (Object.keys(e.caps || {}).some((c) => goalCapsSet.has(c)) ? 0.5 : 0) - (e.isNew ? 0.4 : 0) })).sort((a, b) => b.imp - a.imp);
  const kept = [];
  let used = 0;
  for (const r of ranked) {
    const minimal = { ...r.e, sets: Math.min(r.e.sets, minutes <= 15 ? 2 : r.e.sets) };
    const m = exMinutes(minimal);
    if (!kept.length || used + m <= B.main * 1.05) { kept.push(r); used += m; } else changes.push(`« ${r.e.name} » retiré (moins prioritaire pour ${minutes} min)`);
    if (kept.length >= B.maxN + 1) break;
  }
  for (const r of ranked) if (!kept.includes(r) && !changes.some((c) => c.includes(r.e.name))) changes.push(`« ${r.e.name} » retiré (moins prioritaire pour ${minutes} min)`);
  kept.sort((a, b) => a.i - b.i);
  const items = kept.map((r) => ({ ex: r.e, lib: byId(r.e.libId) || { flex: null, sets: r.e.sets, intensity: r.e.intensity } }));
  const before = items.map((i) => ({ sets: i.ex.sets, rest: i.ex.rest, sec: i.ex.secMin }));
  fitTime(items, B.main);
  items.forEach((it, k) => {
    if (it.ex.sets !== before[k].sets) changes.push(`${it.ex.name} : ${before[k].sets} → ${it.ex.sets} série(s)`);
    if (it.ex.rest !== before[k].rest) changes.push(`${it.ex.name} : repos ${before[k].rest} s → ${it.ex.rest} s`);
    if (it.ex.secMin !== before[k].sec && it.ex.mode === 'time') changes.push(`${it.ex.name} : ${before[k].sec} s → ${it.ex.secMin} s`);
  });
  let w2 = [];
  if (B.warm && warm.length) {
    const wl = warm.map(clone);
    let t = 0;
    for (const e of wl) { const m = exMinutes(e); if (!w2.length || t + m <= B.warm * 1.2) { w2.push(e); t += m; } }
    const first = w2[0];
    if (first && exMinutes(first) > B.warm * 1.2 && first.mode === 'time') { first.secMin = first.secMax = Math.max(30, Math.round((B.warm * 60 - 15) / Math.max(1, first.sets))); }
    if (w2.length !== warm.length || t > B.warm * 1.2) changes.push(`Échauffement ramené à ~${B.warm} min`);
  } else if (warm.length) changes.push('Échauffement intégré au premier exercice (séance très courte : commence plus doucement)');
  let c2 = [];
  if (B.cool && cool.length) { let t = 0; for (const e of cool.map(clone)) { const m = exMinutes(e); if (!c2.length || t + m <= B.cool * 1.3) { c2.push(e); t += m; } } if (c2.length !== cool.length) changes.push(`Retour au calme ramené à ~${B.cool} min`); }
  else if (cool.length) changes.push('Retour au calme retiré (séance très courte)');
  const exercises = [...w2, ...items.map((i) => i.ex), ...c2];
  const out = normalizeSession({ ...s, exercises, durationMin: sessionMinutes({ exercises }), context: { ...s.context, plannedMin: minutes }, updatedAt: Date.now() });
  return { session: out, changes: [...new Set(changes)], minutes: sessionMinutes(out) };
}

/* ───────── Remplacement intelligent ───────── */
export function alternatives(ex, ctx, { session, envId, level = 2, activityId } = {}) {
  const lib = byId(ex.libId) || LIBRARY.find((x) => exKey(x.name) === exKey(ex.name)) || null;
  const caps = Object.keys(ex.caps || {}).length ? ex.caps : lib?.caps || exCaps(ex, ctx);
  const top = Object.entries(caps).sort((a, b) => b[1] - a[1])[0]?.[0];
  const d = ex.diff || lib?.diff || 2, pattern = ex.pattern || lib?.pattern || '';
  const eq = availableEquipment(ctx, envId);
  const inUse = new Set((session?.exercises || []).map((e) => e.libId).filter(Boolean));
  const goal = session?.context?.goalId ? ctx.goals.find((g) => g.id === session.context.goalId) : null;
  const gcaps = goal ? goalCaps(goal, ctx).map((x) => x.id) : [];
  const role = lib?.role || (ex.block === 'warmup' ? 'warmup' : ex.block === 'cool' ? 'cool' : 'main');
  const act = activityId || session?.activity || '';
  const out = new Map();
  const push = (x, kind, reason) => {
    if (!out.has(x.id)) out.set(x.id, { lib: x, kinds: [], reasons: [], available: x.needs.every((n) => eq.has(n)), pref: ctx.prefs[exKey(x.name)]?.value || '' });
    const o = out.get(x.id); if (!o.kinds.includes(kind)) { o.kinds.push(kind); o.reasons.push(reason); }
  };
  for (const x of LIBRARY) {
    if (x.role !== role || x.id === lib?.id || inUse.has(x.id) || (x.minLevel || 0) > level) continue;
    if (act && x.acts.length && !x.acts.includes(act) && !(x.caps[top] >= 0.6)) continue;
    const xs = x.caps || {};
    const needsTxt = x.needs.length ? x.needs.map((n) => EQUIPMENT[n] || n).join(', ') : 'sans matériel';
    if (top && (xs[top] || 0) >= 0.6 && Math.abs((x.diff || 2) - d) <= 1) push(x, 'capacite', `Même capacité principale : ${capName(top, ctx)}`);
    if (gcaps.length && Object.keys(xs).some((c) => gcaps.includes(c) && xs[c] >= 0.6)) push(x, 'objectif', `Sert le même objectif : ${goalLabel(goal)}`);
    if (top && (xs[top] || 0) >= 0.5 && x.needs.join() !== (lib?.needs || ex.needs || []).join()) push(x, 'materiel', `Autre matériel : ${needsTxt}`);
    if (top && (xs[top] || 0) >= 0.5 && (x.diff || 2) < d) push(x, 'facile', `Plus facile (difficulté ${x.diff}/5 au lieu de ${d}/5)`);
    if (top && (xs[top] || 0) >= 0.5 && (x.diff || 2) > d) push(x, 'difficile', `Plus difficile (difficulté ${x.diff}/5 au lieu de ${d}/5)`);
    if (pattern && x.pattern === pattern && pattern !== 'grimpe') push(x, 'mouvement', `Mouvement comparable (${pattern})`);
  }
  const rel = (o) => (o.lib.caps[top] || 0) * 2 + o.kinds.length * 0.3 - Math.abs((o.lib.diff || 2) - d) * 0.2;
  return [...out.values()].filter((o) => o.pref !== 'evite').sort((a, b) => Number(b.available) - Number(a.available) || rel(b) - rel(a)).slice(0, 12);
}
/** Remplace un exercice en gardant son bloc ; le changement est décrit pour l'utilisateur. */
export function replaceExercise(session, exId, libId, reason = '') {
  const s = normalizeSession(session);
  const i = s.exercises.findIndex((e) => e.id === exId), lib = byId(libId);
  if (i < 0 || !lib) return { session: s, change: null };
  const old = s.exercises[i];
  const ex = toEx(lib, old.block, { why: reason ? `Remplace « ${old.name} » : ${reason}` : `Remplace « ${old.name} »` });
  const exercises = s.exercises.slice(); exercises[i] = ex;
  return { session: normalizeSession({ ...s, exercises, updatedAt: Date.now() }), change: { from: old.name, to: lib.name, reason } };
}

/* ───────── Matériel dynamique ───────── */
export function rebuildForEquipment(session, eqSet, ctx, level = 2) {
  const s = normalizeSession(session), changes = [];
  let cur = s;
  for (const e of s.exercises) {
    const lib = byId(e.libId);
    const needs = e.needs?.length ? e.needs : lib?.needs || [];
    const miss = needs.filter((n) => !eqSet.has(n));
    if (!miss.length) continue;
    const fake = { ...ctx, envs: [], defEnv: { equipment: [...eqSet] }, unavailable: new Set() };
    const alts = alternatives(e, fake, { session: cur, level }).filter((a) => a.available);
    const alt = alts.find((a) => a.kinds.some((k) => ['capacite', 'materiel', 'mouvement', 'facile'].includes(k))) || alts.find((a) => a.kinds.includes('objectif'));
    const missTxt = miss.map((n) => EQUIPMENT[n] || n).join(', ');
    if (alt) { const r = replaceExercise(cur, e.id, alt.lib.id, `${missTxt} indisponible — ${alt.reasons[0].toLowerCase()}`); cur = r.session; changes.push(`« ${e.name} » → « ${alt.lib.name} » (${missTxt} indisponible ; ${alt.reasons[0].toLowerCase()})`); }
    else { cur = normalizeSession({ ...cur, exercises: cur.exercises.filter((x) => x.id !== e.id) }); changes.push(`« ${e.name} » retiré : ${missTxt} indisponible et aucune alternative équivalente`); }
  }
  return { session: normalizeSession({ ...cur, context: { ...cur.context, equipment: [...eqSet] }, updatedAt: Date.now() }), changes };
}
export function newPossibilities(prevEq, nextEq, activityId, level = 2) {
  const added = [...nextEq].filter((n) => !prevEq.has(n));
  if (!added.length) return [];
  return LIBRARY.filter((x) => x.role === 'main' && (!activityId || x.acts.includes(activityId)) && x.needs.some((n) => added.includes(n)) && x.needs.every((n) => nextEq.has(n)) && (x.minLevel || 0) <= level)
    .slice(0, 6).map((x) => ({ lib: x, reason: `Possible grâce à : ${x.needs.filter((n) => added.includes(n)).map((n) => EQUIPMENT[n] || n).join(', ')}` }));
}

/** Niveau estimé d'une séance, avec ses critères (réexporté pour l'interface). */
export { estimateLevel, LEVEL_LABEL };
