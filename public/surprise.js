// surprise.js — « Surprends-moi » : on donne seulement ce qu'on veut (sport, temps, lieu, forme… ou rien)
// et l'app construit une séance différente de d'habitude, ou qui fait progresser, en expliquant pourquoi.
// Tout part de l'historique réel, des maxima notés et des objectifs : rien n'est inventé. Sans DOM, testé.
import { BUILTIN_STYLES } from './model.js';
import { maximaSummary, sortedLevels } from './grading.js';
import { normalizeEx, uid, normalizeSession } from './shared.js';
import { STRUCTURES, pickSystem, knownMax, buildFromParts, goalParts } from './climbplan.js';
import { neverTried, activeGoals } from './brain.js';
import * as G from './generator.js';

const DAY = 86400000;
// Hasard reproductible (même graine → même surprise ; « une autre surprise » change la graine).
function mkRng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const AIMS = { new: ['🆕', 'Quelque chose de nouveau', 'Des styles, des structures ou des exercices que tu fais peu ou jamais.'], progress: ['📈', 'Pour progresser', 'Tes styles les plus faibles, tes axes de progrès et tes objectifs.'], any: ['🎲', 'Vraiment au hasard', 'Un peu des deux : laisse-toi surprendre.'] };
const CLIMB_STYLES = BUILTIN_STYLES.filter((s) => s.activity === 'climbing' && !['st-fissure', 'st-resistance'].includes(s.id));
const ago = (t, now) => Math.round((now - t) / DAY);

/** Habitudes d'escalade d'après l'historique : styles et structures faits, combien de fois, et quand. */
export function climbHabits(history = [], now = Date.now()) {
  const styles = {}, structures = {}, kinds = { bloc: 0, voie: 0 };
  for (const h of history) {
    const act = h.data?.activity, t = h.startedAt || 0;
    if (act === 'climbing_boulder') kinds.bloc++; else if (act === 'climbing_route') kinds.voie++;
    for (const e of h.data?.exercises || []) {
      const name = String(e.name || '').toLowerCase();
      for (const s of CLIMB_STYLES) if (name.includes(s.label.toLowerCase())) { const x = (styles[s.id] ||= { n: 0, last: 0 }); x.n++; x.last = Math.max(x.last, t); }
      const m = /^cp-(\w+)$/.exec(e.group || ''); if (m) { const x = (structures[m[1]] ||= { n: 0, last: 0 }); x.n++; x.last = Math.max(x.last, t); }
    }
  }
  return { styles, structures, kinds, total: history.length, now };
}
/** Styles les plus faibles d'après les maxima notés par style (plus bas que le meilleur niveau global). */
export function weakStyles(ctx, kind = 'bloc') {
  const sys = pickSystem(ctx, kind), out = [];
  for (const m of maximaSummary(ctx.perfs || [], ctx.styles)) {
    if (sys && m.systemId !== sys.id) continue;
    for (const b of m.byStyle) if (b.perf.grade.order < m.best.grade.order) out.push({ id: b.styleId, gap: m.best.grade.order - b.perf.grade.order, label: b.label, best: b.perf.grade.label, top: m.best.grade.label, index: sortedLevels(sys || ctx.systems?.[m.systemId]).findIndex((l) => l.id === b.perf.grade.levelId) });
  }
  return out.sort((a, b) => b.gap - a.gap);
}
const pickLeast = (items, stat, r, n) => items.map((x) => ({ x, n: stat[x.id]?.n || 0, k: r() })).sort((a, b) => a.n - b.n || a.k - b.k).slice(0, n).map((y) => y.x);
const whyStyle = (s, st, now) => (!st ? `jamais de ${s.label.toLowerCase()} dans ton historique` : `${s.label.toLowerCase()} : ${st.n} fois, la dernière il y a ${ago(st.last, now)} j`);

/**
 * Séance d'escalade surprise. o = { kind, minutes, aim: 'new'|'progress'|'any', forme: 'low'|'normal'|'top', seed }.
 * Retourne { parts, reasons, name, goal }.
 */
export function surpriseClimbParts(o, ctx) {
  const now = ctx.now || Date.now(), r = mkRng(o.seed || 1), H = climbHabits(ctx.history, now), reasons = [];
  let aim = o.aim || 'any'; if (aim === 'any') aim = r() < 0.5 ? 'new' : 'progress';
  const kind = o.kind || (H.kinds.voie && !H.kinds.bloc ? 'voie' : 'bloc'), M = Math.max(40, Math.min(240, o.minutes || 90));
  const low = o.forme === 'low', top = o.forme === 'top', warm = Math.min(15, Math.round(M * 0.12)), cool = Math.min(10, Math.max(5, Math.round(M * 0.07))), climb = M - warm - cool;
  // Progresser : l'objectif de cotation s'il y en a un pour ce type d'escalade.
  if (aim === 'progress' && !low) {
    const g = activeGoals(ctx).find((x) => x.gradeTarget?.systemId && ctx.systems?.[x.gradeTarget.systemId]?.activity === kind);
    if (g) {
      const sys = ctx.systems[g.gradeTarget.systemId], levels = sortedLevels(sys), t = levels.findIndex((l) => l.id === g.gradeTarget.levelId);
      if (t >= 0) {
        const ws = weakStyles(ctx, kind).slice(0, 2).map((w) => w.id);
        reasons.push(`Ton objectif : ${g.gradeTarget.label}. La séance est construite pour t’en approcher.`);
        if (ws.length) reasons.push('Dans tes styles les moins forts, pour progresser là où ça bloque.');
        return { parts: goalParts({ kind, target: t, levels, styles: ws, minutes: M }), reasons, aim, kind, system: sys, name: `Surprise · objectif ${g.gradeTarget.label}`, goal: `Se rapprocher de ${g.gradeTarget.label}.` };
      }
    }
  }
  let styles, structs, rangeA = null, rangeB = null;
  if (aim === 'progress') {
    const ws = weakStyles(ctx, kind);
    if (ws.length) { styles = ws.slice(0, 2).map((w) => w.id); reasons.push(...ws.slice(0, 2).map((w) => `${w.label} : ton max noté est ${w.best}, contre ${w.top} au mieux → c’est là que tu peux le plus progresser.`)); }
    else { styles = pickLeast(CLIMB_STYLES, H.styles, r, 2).map((s) => s.id); reasons.push('Pas encore de maximum noté par style : je prends les styles que tu travailles le moins (' + styles.map((id) => whyStyle(CLIMB_STYLES.find((s) => s.id === id), H.styles[id], now)).join(' ; ') + ').'); }
    structs = kind === 'voie' ? ['pyramid', low ? 'volume' : 'max'] : ['pyramid', low ? 'technique' : 'limit'];
    // Cotations calées sur le max du style faible (pas sur le max global) : pyramide jusqu'à lui, essais juste au-dessus.
    const w = ws[0]; if (w && w.index >= 0) { const st = pickSystem(ctx, kind), n = sortedLevels(st).length, step = n > 10 ? 2 : 1, c = (i) => Math.max(0, Math.min(n - 1, i));
      rangeA = [c(w.index - 2 * step), c(w.index)]; rangeB = low ? [c(w.index - step), c(w.index)] : [c(w.index), c(w.index + step)]; }
    reasons.push(low ? 'Tu es fatigué : intensité modérée, on progresse par la technique.' : 'Une pyramide pour monter en niveau, puis des essais au plus dur sur ces styles.');
  } else {
    const ss = pickLeast(CLIMB_STYLES, H.styles, r, 2); styles = ss.map((s) => s.id);
    reasons.push(`Des styles que tu fais peu : ${ss.map((s) => whyStyle(s, H.styles[s.id], now)).join(' ; ')}.`);
    const fits = Object.keys(STRUCTURES[kind]).filter((id) => !(low && ['limit', 'max', 'fourx4'].includes(id)));
    structs = fits.map((id) => ({ id, n: H.structures[id]?.n || 0, k: r() })).sort((a, b) => a.n - b.n || a.k - b.k).slice(0, 2).map((x) => x.id);
    reasons.push(`Des façons de grimper que tu utilises peu : ${structs.map((id) => `${STRUCTURES[kind][id].name.toLowerCase()} (${H.structures[id]?.n ? H.structures[id].n + ' fois' : 'jamais'})`).join(' et ')}.`);
  }
  const iA = low ? 'easy' : 'mod', iB = low ? 'mod' : top ? 'max' : 'hard';
  const parts = [
    { type: 'warmup', minutes: warm },
    { type: 'climb', kind, intensity: iA, minutes: Math.round(climb * 0.5), styles, structure: structs[0], ...(rangeA ? { from: rangeA[0], to: rangeA[1] } : {}) },
    { type: 'climb', kind, intensity: STRUCTURES[kind][structs[1]]?.for.includes(iB) ? iB : iA, minutes: climb - Math.round(climb * 0.5), styles, structure: structs[1], adapt: true, ...(rangeB ? { from: rangeB[0], to: rangeB[1] } : {}) },
    { type: 'cool', minutes: cool },
  ];
  const names = styles.map((id) => CLIMB_STYLES.find((s) => s.id === id)?.label.toLowerCase()).filter(Boolean);
  return { parts, reasons, aim, kind, name: `Surprise · ${names.join(' et ') || kind}`, goal: aim === 'new' ? 'Sortir de tes habitudes.' : 'Progresser là où c’est le plus utile.' };
}
/** Séance d'escalade surprise complète. */
export function surpriseClimb(o, ctx) {
  const p = surpriseClimbParts(o, ctx);
  const s = buildFromParts(p.parts, ctx, { systems: p.system ? { [p.kind]: p.system } : undefined, envId: o.envId, name: p.name, goal: p.goal, seed: o.seed });
  return { session: normalizeSession({ ...s, emoji: '🎲', notes: [{ title: 'Pourquoi cette surprise', text: p.reasons.join('\n') }, ...s.notes] }), reasons: p.reasons, aim: p.aim };
}

/** Surprise pour les autres sports : exercices jamais faits (nouveau) ou axes de progrès et objectif (progresser). */
export function surpriseOther(o, ctx) {
  const r = mkRng(o.seed || 1); let aim = o.aim || 'any'; if (aim === 'any') aim = r() < 0.5 ? 'new' : 'progress';
  const activityId = o.activityId || Object.keys(ctx.activities)[0] || 'conditioning', reasons = [];
  const goal = aim === 'progress' ? activeGoals(ctx).find((g) => !g.activityId || g.activityId === activityId) : null;
  const plan = G.planSession({ activityId, minutes: o.minutes || 45, envId: o.envId, mode: 'weaknesses', goalId: goal?.id, light: o.forme === 'low', seed: o.seed || 1 }, ctx);
  let s = G.generateFromPlan(plan, ctx).session;
  if (aim === 'progress') {
    reasons.push(goal ? 'Construite pour ton objectif en cours.' : 'Construite sur tes axes de progrès (ce qui est le moins avancé dans ton profil).');
    if (plan.why?.length) reasons.push(...plan.why.slice(0, 2));
  } else {
    const level = plan.level ?? 1, nt = neverTried(ctx, { activityId, level, envId: o.envId }).slice(0, 3);
    if (nt.length) {
      const mains = s.exercises.map((e, i) => [e, i]).filter(([e]) => e.block === 'main');
      nt.forEach((c, k) => { const lib = c.lib || c; const slot = mains[mains.length - 1 - k]; if (!slot || !lib?.id) return;
        s.exercises[slot[1]] = normalizeEx({ ...lib, libId: lib.id, id: uid(), ok: lib.cues, bad: lib.bad, block: 'main', part: slot[0].part, isNew: true, why: c.reason || 'Nouveau pour toi' }); });
      reasons.push(`${nt.length} exercice${nt.length > 1 ? 's' : ''} que tu n’as jamais fait${nt.length > 1 ? 's' : ''} (marqués 🆕) : ${nt.map((c) => c.lib.name).join(', ')}.`);
    } else reasons.push('Tu as déjà essayé tous les exercices possibles avec ton matériel : je varie l’ordre et le travail.');
  }
  s = normalizeSession({ ...s, emoji: '🎲', name: `Surprise · ${s.name}`, notes: [{ title: 'Pourquoi cette surprise', text: reasons.join('\n') }, ...s.notes] });
  return { session: s, reasons, aim };
}
/** Point d'entrée : escalade (bloc/voie) ou autre sport. */
export function surprise(o, ctx) {
  if (o.kind === 'bloc' || o.kind === 'voie' || o.activityId === 'climbing_boulder' || o.activityId === 'climbing_route') return surpriseClimb({ ...o, kind: o.kind || (o.activityId === 'climbing_route' ? 'voie' : 'bloc') }, ctx);
  return surpriseOther(o, ctx);
}
