// coachbrain.js — le coach qui apprend ton corps, uniquement à partir de TES données (séances, ressentis, mesures,
// douleurs notées). Tout est un repère expliqué, jamais un diagnostic.
//  · forme / fatigue : modèle classique « impulsion-réponse » (Banister) : chaque séance ajoute de la fatigue (qui
//    retombe vite, ~7 jours) et de la forme (qui retombe lentement, ~42 jours) ; fraîcheur = forme − fatigue ;
//  · prêt du jour : fraîcheur + dernières séances dures + douleurs + sommeil / énergie notés ;
//  · plateaux : une mesure qui ne progresse plus depuis 6 semaines, avec 3 pistes concrètes ;
//  · équilibre musculaire : séries de poussée et de tirage sur 4 semaines ;
//  · règles apprises : ce qui, chez toi, va avec une séance mieux ressentie (jours de repos avant, moment de la journée) ;
//  · charge par zone (doigts, épaules, genoux) : 7 derniers jours comparés aux 4 semaines d'avant ;
//  · douleurs : évolution par zone, et étapes de reprise progressives. Sans DOM, testé.
import { byId } from './library.js';
import { METRICS } from './model.js';

const DAY = 86400000;
const r1 = (x) => Math.round(x * 10) / 10;
const fr = (x) => String(r1(x)).replace('.', ','); // nombre à la française dans les textes
const dayOf = (t) => Math.floor(t / DAY);
/** Charge d'une séance : minutes × ressenti (1 à 5 ; 3 si non noté). */
export const sessionLoad = (h) => ((Number(h.durationSeconds) || 0) / 60) * (Number(h.data?.rpe) || 3);

/** Forme, fatigue et fraîcheur jour par jour (60 derniers jours affichables). */
export function fitnessFatigue(history = [], now = Date.now(), { days = 120, kFit = 42, kFat = 7 } = {}) {
  const today = dayOf(now), loads = new Map();
  for (const h of history) { if (!h?.startedAt || h.startedAt > now) continue; const d = dayOf(h.startedAt); loads.set(d, (loads.get(d) || 0) + sessionLoad(h)); }
  let fit = 0, fat = 0; const series = [];
  const aFit = 1 - Math.exp(-1 / kFit), aFat = 1 - Math.exp(-1 / kFat);
  for (let d = today - days; d <= today; d++) {
    const L = loads.get(d) || 0; fit += (L - fit) * aFit; fat += (L - fat) * aFat;
    series.push({ day: d, fitness: r1(fit), fatigue: r1(fat), form: r1(fit - fat), load: Math.round(L) });
  }
  const last = series.at(-1), sessions = history.filter((h) => h.startedAt > now - 42 * DAY).length;
  return { series: series.slice(-60), fitness: last.fitness, fatigue: last.fatigue, form: last.form, enough: sessions >= 4, sessions };
}
/** Prêt du jour : un mot, une couleur, une proposition, et toutes les raisons. */
export function readiness(ctx, { wellness = latestWellness(ctx.wellness, ctx.now), pains = ctx.pains || [] } = {}) {
  const now = ctx.now || Date.now(), ff = fitnessFatigue(ctx.history || [], now), why = [];
  let score = 0;
  if (ff.enough) {
    const rel = ff.fitness > 0 ? ff.form / ff.fitness : 0;
    if (rel > 0.15) { score += 1; why.push('Ta fatigue est retombée sous ta forme : tu es frais.'); }
    else if (rel < -0.25) { score -= 2; why.push('Ta fatigue des derniers jours est nettement au-dessus de ta forme habituelle.'); }
    else if (rel < -0.1) { score -= 1; why.push('Un peu de fatigue accumulée ces derniers jours.'); }
    else why.push('Fatigue et forme équilibrées.');
  } else why.push(`Encore peu de séances (${ff.sessions} sur 6 semaines) : l’estimation devient fiable à partir de 4.`);
  const hard48 = (ctx.history || []).filter((h) => now - h.startedAt < 48 * 3600000 && Number(h.data?.rpe) >= 4).length;
  if (hard48) { score -= 1; why.push(`${hard48} séance${hard48 > 1 ? 's' : ''} dure${hard48 > 1 ? 's' : ''} ces 48 dernières heures.`); }
  const pain = pains.filter((p) => now - (p.date || 0) < 3 * DAY && (p.level || 0) >= 4);
  if (pain.length) { score -= 2; why.push(`Douleur notée récemment (${pain.map((p) => ZONE_LABEL[p.zone] || p.zone).join(', ')}) : on ménage cette zone.`); }
  if (wellness && now - (wellness.at || 0) < 20 * 3600000) {
    if (wellness.sleep != null && wellness.sleep < 6) { score -= 1; why.push(`Nuit courte (${wellness.sleep} h).`); }
    if (wellness.energy != null && wellness.energy <= 2) { score -= 1; why.push('Énergie basse ce matin.'); }
    if (wellness.energy >= 4 && (wellness.sleep ?? 8) >= 7) { score += 1; why.push('Bien dormi et plein d’énergie.'); }
    if (wellness.soreness >= 4) { score -= 1; why.push('Courbatures fortes.'); }
    if (wellness.stress >= 4) { score -= 1; why.push('Stress élevé : il fatigue autant qu’une séance.'); }
    const hr = restingHr(ctx.wellness, wellness);
    if (hr.delta != null && hr.delta >= 7) { score -= 1; why.push(`Pouls au repos plus haut que d’habitude (+${hr.delta} battements/min) : fatigue, stress ou début de maladie possibles.`); }
  }
  const over = zoneLoad(ctx, now);
  if (over.length) why.push(...over.map((z) => `⚠️ ${z.text}`));
  const level = score >= 1 ? 'top' : score <= -2 ? 'low' : 'ok';
  const TXT = { top: ['🟢', 'Frais', 'Bon jour pour une séance intense ou tes essais max.'], ok: ['🟡', 'Normal', 'Séance normale, comme prévu.'], low: ['🔴', 'Fatigué', 'Plutôt technique, mobilité ou séance légère aujourd’hui.'] }[level];
  return { level, emoji: TXT[0], word: TXT[1], advice: TXT[2], why, ff, checked: !!(wellness && now - (wellness.at || 0) < 20 * 3600000), over };
}
/** Dernier check-in (le plus récent). */
export function latestWellness(list = [], now = Date.now()) {
  return [...(list || [])].filter((w) => w && (w.at || 0) <= now + 60000).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
}
/** Pouls au repos : comparé à la médiane des 30 derniers jours (au moins 5 mesures avant aujourd'hui). */
export function restingHr(list = [], today = null) {
  if (!today?.hr) return { delta: null, base: null };
  const prev = (list || []).filter((w) => w && w.hr && w.day !== today.day && (today.at || 0) - (w.at || 0) <= 30 * DAY && (w.at || 0) < (today.at || 0)).map((w) => w.hr).sort((a, b) => a - b);
  if (prev.length < 5) return { delta: null, base: null, n: prev.length };
  const base = prev.length % 2 ? prev[(prev.length - 1) / 2] : (prev[prev.length / 2 - 1] + prev[prev.length / 2]) / 2;
  return { delta: Math.round(today.hr - base), base: Math.round(base), n: prev.length };
}
/** Avant une séance dure : la liste à cocher (repères généraux, pas une prescription). */
export const HARD_DAY_CHECKLIST = [
  'Échauffement complet : 10 à 15 minutes, de plus en plus intense.',
  'Un repas 2 à 3 h avant, ou une petite collation 30 à 60 min avant.',
  'De l’eau à portée de main, et quelques gorgées régulièrement.',
  'Un objectif précis pour la séance (une charge, un bloc, un temps).',
  'Arrête un exercice quand la qualité baisse : la fatigue ne fait pas progresser.',
];

/** Plateaux : mesures avec au moins 3 valeurs sur ≥ 6 semaines et aucun progrès de plus de 2 % sur les 6 dernières. */
export function plateaus(ctx, now = ctx.now || Date.now()) {
  const out = [], by = {};
  for (const p of ctx.perfs || []) if (!p.unknown && Number.isFinite(Number(p.value)) && METRICS[p.metricId]?.kind !== 'grade') (by[p.metricId] ||= []).push(p);
  for (const [id, l] of Object.entries(by)) {
    const m = ctx.metrics?.[id] || METRICS[id]; if (!m || Object.keys(m.caps || {}).length === 0) continue; // mensurations : pas de « plateau » d'entraînement
    l.sort((a, b) => a.date - b.date);
    const recent = l.filter((p) => now - p.date <= 42 * DAY), older = l.filter((p) => now - p.date > 42 * DAY);
    if (l.length < 3 || !older.length || recent.length < 1 || now - l[0].date < 42 * DAY) continue;
    const dir = m.dir === -1 ? -1 : 1, best = (arr) => (dir > 0 ? Math.max(...arr.map((p) => Number(p.value))) : Math.min(...arr.map((p) => Number(p.value))));
    const before = best(older), after = best(recent), gain = dir * (after - before) / Math.max(1e-9, Math.abs(before));
    if (gain <= 0.02) out.push({ metricId: id, label: m.label, since: older.at(-1).date, value: after, unit: m.unit, ideas: plateauIdeas(m) });
  }
  return out;
}
function plateauIdeas(m) {
  const fam = Object.keys(m.caps || {})[0] || '';
  if (/doigt|pince/.test(fam)) return ['Change de protocole 4 semaines : suspensions max 10 s si tu faisais des repeaters, et inversement.', 'Une semaine plus légère : les doigts progressent pendant la récupération.', 'Varie les prises (réglette plus petite, pinces, monodoigt… progressivement).'];
  if (/endurance|seuil|vitesse/.test(fam)) return ['Ajoute une séance par intervalles courts par semaine (ex. 30/30).', 'Allonge ta sortie la plus facile de 10 %.', 'Une semaine plus légère, puis reteste.'];
  return ['Change la plage de répétitions 4 semaines (ex. 3–5 lourdes au lieu de 8–12).', 'Ajoute 1 à 2 séries par semaine sur ce mouvement.', 'Une semaine plus légère (moitié du volume), puis reteste.'];
}

/** Équilibre pousser / tirer sur 4 semaines (séries faites). */
export function muscleBalance(ctx, now = ctx.now || Date.now()) {
  let push = 0, pull = 0;
  for (const h of ctx.history || []) {
    if (now - h.startedAt > 28 * DAY) continue;
    for (const e of h.data?.exercises || []) {
      const lib = byId(e.libId), g = lib?.group || e.group || '', n = (e.sets || []).filter((s) => s.done !== false).length;
      if (g === 'pousser') push += n; else if (g === 'tirer') pull += n;
    }
  }
  const total = push + pull; if (total < 12) return { push, pull, ratio: null, text: '' };
  const ratio = r1(pull / Math.max(1, push));
  const text = !push ? `Que du tirage sur 4 semaines (${pull} séries, aucune de poussée) : ajoute des pompes, dips ou développés pour protéger tes épaules.` : !pull ? `Que de la poussée sur 4 semaines (${push} séries, aucune de tirage) : ajoute des tractions ou rowings pour équilibrer.` : ratio > 2 ? `Tu tires ${fr(ratio)} fois plus que tu ne pousses : ajoute des pompes, dips ou développés pour protéger tes épaules.` : ratio < 0.5 ? `Tu pousses ${fr(push / Math.max(1, pull))} fois plus que tu ne tires : ajoute des tractions ou rowings pour équilibrer.` : 'Poussée et tirage bien équilibrés.';
  return { push, pull, ratio, text, unbalanced: ratio > 2 || ratio < 0.5 };
}

/**
 * Règles apprises sur TOI : moyenne du ressenti selon les jours de repos avant la séance et le moment de la journée.
 * Un constat n'est affiché que s'il repose sur au moins 3 séances de chaque côté et un écart d'au moins 0,5 point.
 */
export function learnedRules(ctx) {
  const hs = [...(ctx.history || [])].filter((h) => Number(h.data?.rpe) > 0).sort((a, b) => a.startedAt - b.startedAt), rules = [];
  if (hs.length < 8) return { rules, n: hs.length };
  const avg = (l) => l.reduce((t, h) => t + Number(h.data.rpe), 0) / l.length;
  const rest = hs.slice(1).map((h, i) => ({ h, gap: dayOf(h.startedAt) - dayOf(hs[i].startedAt) }));
  const rested = rest.filter((x) => x.gap >= 2).map((x) => x.h), close = rest.filter((x) => x.gap <= 1).map((x) => x.h);
  if (rested.length >= 3 && close.length >= 3 && Math.abs(avg(rested) - avg(close)) >= 0.5) {
    const better = avg(rested) < avg(close);
    rules.push(better ? `Après 2 jours de repos ou plus, tes séances te semblent plus faciles (ressenti ${fr(avg(rested))}/5 contre ${fr(avg(close))}/5, sur ${rested.length + close.length} séances).` : `Tu sembles mieux enchaîner les jours rapprochés (ressenti ${fr(avg(close))}/5 contre ${fr(avg(rested))}/5 après du repos).`);
  }
  const hour = (h) => new Date(h.startedAt).getHours(), morning = hs.filter((h) => hour(h) < 12), evening = hs.filter((h) => hour(h) >= 17);
  if (morning.length >= 3 && evening.length >= 3 && Math.abs(avg(morning) - avg(evening)) >= 0.5) rules.push(avg(morning) < avg(evening) ? `Le matin, tes séances te semblent plus faciles (${fr(avg(morning))}/5 contre ${fr(avg(evening))}/5 le soir).` : `Le soir, tes séances te semblent plus faciles (${fr(avg(evening))}/5 contre ${fr(avg(morning))}/5 le matin).`);
  rules.push(...wellnessRules(ctx, hs));
  return { rules, n: hs.length };
}
/**
 * Liens check-in → séances du même jour (ressenti) : nuit courte ou non, stress, et cycle si la personne l'a activé.
 * Même exigence : au moins 3 séances de chaque côté et un écart d'au moins 0,5 point.
 */
function wellnessRules(ctx, hs) {
  const W = new Map((ctx.wellness || []).filter((w) => w?.day).map((w) => [w.day, w])), out = [];
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // jour local, comme le check-in
  const pairs = hs.map((h) => ({ h, w: W.get(dayKey(h.startedAt)) })).filter((x) => x.w);
  const avg = (l) => l.reduce((t, x) => t + Number(x.h.data.rpe), 0) / l.length;
  const cmp = (a, b, yes, no) => { if (a.length >= 3 && b.length >= 3 && Math.abs(avg(a) - avg(b)) >= 0.5) out.push(avg(a) > avg(b) ? yes(fr(avg(a)), fr(avg(b))) : no(fr(avg(a)), fr(avg(b)))); };
  cmp(pairs.filter((x) => x.w.sleep != null && x.w.sleep < 7), pairs.filter((x) => x.w.sleep >= 7),
    (a, b) => `Après une nuit de moins de 7 h, tes séances te semblent plus dures (${a}/5 contre ${b}/5) : ces jours-là, vise plutôt la technique.`,
    (a, b) => `Les nuits courtes ne semblent pas changer ton ressenti (${a}/5 contre ${b}/5) — garde quand même 7 h quand tu peux.`);
  cmp(pairs.filter((x) => x.w.stress >= 4), pairs.filter((x) => x.w.stress != null && x.w.stress <= 2),
    (a, b) => `Les jours de stress élevé, tes séances te semblent plus dures (${a}/5 contre ${b}/5).`,
    (a, b) => `Le sport semble te faire du bien les jours stressants (${a}/5 contre ${b}/5 les jours calmes).`);
  if (ctx.config?.coach?.cycle) cmp(pairs.filter((x) => x.w.period), pairs.filter((x) => !x.w.period),
    (a, b) => `Pendant tes règles, tes séances te semblent plus dures (${a}/5 contre ${b}/5) : tu peux prévoir plus léger ces jours-là.`,
    (a, b) => `Pendant tes règles, ton ressenti ne baisse pas (${a}/5 contre ${b}/5) : pas besoin de changer tes séances.`);
  return out;
}

/* ───────── Prévisions ───────── */
/**
 * Prévision d'une mesure par régression linéaire sur ses valeurs (6 derniers mois, au moins 4 valeurs sur 3 semaines).
 * Donne le rythme par semaine, la date estimée pour atteindre une cible et une fourchette (± l'incertitude de la pente).
 * Confiance : faible (< 6 valeurs ou tendance peu nette), moyenne, bonne (≥ 8 valeurs, tendance nette).
 */
export function forecast(ctx, metricId, { target = null, deadline = null } = {}, now = ctx.now || Date.now()) {
  const m = ctx.metrics?.[metricId] || METRICS[metricId];
  if (!m || m.kind === 'grade') return null;
  const pts = (ctx.perfs || []).filter((p) => p.metricId === metricId && !p.unknown && Number.isFinite(Number(p.value)) && now - (p.date || 0) <= 182 * DAY).map((p) => ({ x: (p.date - now) / (7 * DAY), y: Number(p.value) })).sort((a, b) => a.x - b.x);
  if (pts.length < 4 || pts.at(-1).x - pts[0].x < 3) return { enough: false, n: pts.length, text: `Il faut au moins 4 mesures sur 3 semaines pour une prévision (${pts.length} pour l’instant).` };
  const n = pts.length, mx = pts.reduce((t, p) => t + p.x, 0) / n, my = pts.reduce((t, p) => t + p.y, 0) / n;
  const sxx = pts.reduce((t, p) => t + (p.x - mx) ** 2, 0), sxy = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0);
  const slope = sxy / sxx, icpt = my - slope * mx, res = pts.map((p) => p.y - (icpt + slope * p.x));
  const sse = res.reduce((t, r) => t + r * r, 0), sst = pts.reduce((t, p) => t + (p.y - my) ** 2, 0), r2 = sst > 0 ? 1 - sse / sst : 0;
  const se = Math.sqrt(sse / Math.max(1, n - 2)), seSlope = se / Math.sqrt(sxx);
  const confidence = n < 6 || r2 < 0.3 ? 'faible' : n >= 8 && r2 >= 0.6 ? 'bonne' : 'moyenne';
  const dir = m.dir === -1 ? -1 : 1, perWeek = r1(slope), unit = m.unit ? ` ${m.unit}` : '';
  const fmt = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const out = { enough: true, n, perWeek, r2: Math.round(r2 * 100) / 100, confidence, now: r1(icpt), unit: m.unit || '' };
  if (target != null && Number.isFinite(Number(target))) {
    const T = Number(target), gap = T - icpt;
    if (dir * gap <= 0) out.reached = true;
    else if (dir * slope <= 0) out.text = `Au rythme actuel (${perWeek > 0 ? '+' : ''}${String(perWeek).replace('.', ',')}${unit} par semaine), la cible n’est pas en vue : change quelque chose (voir les pistes).`;
    else {
      // Fourchette honnête : ± 2 erreurs types sur la pente, et au moins −20 % / +25 % du temps restant (les progrès ralentissent souvent).
      const w = gap / slope, wFast = gap / (slope + 2 * dir * seSlope), wSlow = dir * (slope - 2 * dir * seSlope) > 0 ? gap / (slope - 2 * dir * seSlope) : null;
      out.eta = now + w * 7 * DAY; out.etaRange = [now + Math.min(w * 0.8, wFast) * 7 * DAY, wSlow ? now + Math.max(w * 1.25, wSlow) * 7 * DAY : null];
      out.text = `À ce rythme (${perWeek > 0 ? '+' : ''}${String(perWeek).replace('.', ',')}${unit} par semaine) : vers le ${fmt(out.eta)}${out.etaRange[1] ? ` (entre le ${fmt(out.etaRange[0])} et le ${fmt(out.etaRange[1])})` : ''}. Confiance ${confidence}.`;
      if (deadline) { const dl = Date.parse(deadline + 'T12:00:00'); if (Number.isFinite(dl)) out.onTime = out.eta <= dl; }
    }
  }
  if (deadline && !out.text) { const dl = Date.parse(deadline + 'T12:00:00'); if (Number.isFinite(dl)) { const v = icpt + slope * ((dl - now) / (7 * DAY)), half = 1.5 * se; out.atDeadline = r1(v); out.text = `Au ${fmt(dl)} : environ ${String(r1(v)).replace('.', ',')}${unit} (entre ${String(r1(v - half)).replace('.', ',')} et ${String(r1(v + half)).replace('.', ',')}). Confiance ${confidence}.`; } }
  if (!out.text && !out.reached) out.text = `Rythme actuel : ${perWeek > 0 ? '+' : ''}${String(perWeek).replace('.', ',')}${unit} par semaine (${n} mesures, confiance ${confidence}).`;
  return out;
}

/* ───────── Prévention : zones, douleurs, reprise ───────── */
export const ZONE_LABEL = { fingers: 'doigts', shoulders: 'épaules', elbows: 'coudes', wrists: 'poignets', back: 'dos', knees: 'genoux', ankles: 'chevilles', hips: 'hanches', neck: 'nuque', other: 'autre zone' };
export const ZONE_EMOJI = { fingers: '✋', shoulders: '🦾', elbows: '💪', wrists: '🤚', back: '🔙', knees: '🦵', ankles: '🦶', hips: '🍑', neck: '🧣', other: '📍' };
const ZONE_OF = (e) => { const lib = byId(e.libId) || {}; const z = []; if (lib.risk === 'finger' || lib.group === 'doigts') z.push('fingers'); if (lib.risk === 'shoulder' || lib.group === 'pousser' || lib.group === 'epaules') z.push('shoulders'); if (['legs', 'plyo', 'run'].includes(lib.kind)) z.push('knees'); return z; };
/** Charge par zone : séries des 7 derniers jours comparées à la moyenne des 4 semaines précédentes. */
export function zoneLoad(ctx, now = ctx.now || Date.now()) {
  const cnt = (from, to) => { const o = {}; for (const h of ctx.history || []) { if (h.startedAt <= now - to * DAY || h.startedAt > now - from * DAY) continue; for (const e of h.data?.exercises || []) { const n = (e.sets || []).filter((s) => s.done !== false).length; for (const z of ZONE_OF(e)) o[z] = (o[z] || 0) + n; } } return o; };
  const acute = cnt(0, 7), chronic = cnt(7, 35), out = [];
  for (const z of Object.keys({ ...acute, ...chronic })) {
    const a = acute[z] || 0, c = (chronic[z] || 0) / 4;
    if (c >= 4 && a >= c * 1.5) out.push({ zone: z, acute: a, chronic: r1(c), ratio: r1(a / c), text: `${ZONE_LABEL[z]} : ${a} séries cette semaine contre ${fr(c)} en moyenne avant (×${fr(a / c)}). Une montée rapide augmente le risque : garde de la marge la semaine prochaine.` });
  }
  return out;
}
/** Évolution d'une douleur par zone (notes de 0 à 10). */
export function painTrend(pains = [], now = Date.now()) {
  const by = {};
  for (const p of pains) if (now - (p.date || 0) <= 60 * DAY) (by[p.zone] ||= []).push(p);
  return Object.entries(by).map(([zone, l]) => {
    l.sort((a, b) => a.date - b.date); const last = l.at(-1), first = l[0];
    const dir = l.length >= 2 ? Math.sign(last.level - first.level) : 0;
    return { zone, label: ZONE_LABEL[zone] || zone, last: last.level, date: last.date, n: l.length, dir, healed: !!last.healed, side: last.side || '', points: l.map((p) => ({ v: p.level, t: p.date })), step: last.healed ? 3 : returnStep(l, now) };
  }).sort((a, b) => b.date - a.date);
}
/** Zones à ménager d'après les douleurs : dernière note de la zone il y a 7 jours au plus, 3/10 ou plus, pas « guérie ». */
export function activePains(pains = [], now = Date.now()) {
  return painTrend(pains, now).filter((t) => !t.healed && t.last >= 3 && now - t.date <= 7 * DAY);
}
/** Zones dont la dernière note date (plus de 5 jours) : on demande des nouvelles. */
export const painToUpdate = (pains = [], now = Date.now()) => painTrend(pains, now).filter((t) => !t.healed && t.last > 0 && now - t.date > 5 * DAY);
export const RETURN_STEPS = [
  { title: 'Repos actif', text: 'Bouge sans charger la zone (marche, mobilité douce, autres parties du corps). Passe à l’étape suivante quand la douleur au quotidien est à 2/10 ou moins.' },
  { title: 'Charge légère', text: 'Exercices faciles qui sollicitent la zone sans douleur au-delà de 2/10, pendant et le lendemain.' },
  { title: 'Charge progressive', text: 'Augmente d’environ 10 % par séance tant que le lendemain reste à 2/10 ou moins ; sinon reviens à l’étape d’avant.' },
  { title: 'Retour à la normale', text: 'Séances habituelles, en gardant 1 à 2 semaines plus légères que d’habitude sur cette zone.' },
];
/** Étape de reprise suggérée d'après les dernières notes (repère, jamais un avis médical). */
function returnStep(l, now) {
  const last = l.at(-1); if (!last) return 0;
  if (last.level > 4) return 0;
  const calm = l.filter((p) => now - p.date <= 14 * DAY && p.level <= 2).length;
  if (last.level > 2) return 1;
  return calm >= 3 ? 3 : 2;
}
