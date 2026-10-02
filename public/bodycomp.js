// bodycomp.js — mesures précises du corps : composition (balance, pince, DEXA) et mensurations, saisies en une fois,
// et indices calculés à partir de TES mesures (IMC, masse maigre, indice de masse maigre, rapports taille / taille,
// taille / hanches, épaules / taille, envergure / taille). Chaque indice dit ce qu'il mesure et ses limites.
// Aucun diagnostic : ce sont des repères pour suivre ta progression. Sans DOM, testé.
export const COMPOSITION = ['body_weight', 'masse_grasse', 'masse_musculaire', 'masse_maigre', 'eau_corporelle', 'masse_osseuse', 'graisse_viscerale', 'metabolisme_base'];
export const MEASURES = ['taille_corps', 'envergure', 'tour_cou', 'tour_epaules', 'tour_poitrine', 'tour_bras', 'tour_bras_relache', 'tour_avant_bras', 'tour_poignet', 'tour_taille', 'tour_ventre', 'tour_hanches', 'tour_cuisse', 'tour_mollet'];
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;

/** Dernière valeur connue d'une mesure (perfs du contexte), ou du profil pour le poids et la taille. */
export function lastValue(ctx, id) {
  const p = (ctx.perfs || []).filter((x) => x.metricId === id && !x.unknown && Number.isFinite(Number(x.value))).sort((a, b) => (b.date || 0) - (a.date || 0))[0];
  if (p) return { value: Number(p.value), date: p.date || 0 };
  const b = ctx.config?.body || {};
  if (id === 'body_weight' && Number(b.weight)) return { value: Number(b.weight), date: 0 };
  if (id === 'taille_corps' && Number(b.height)) return { value: Number(b.height), date: 0 };
  return null;
}
/** Évolution depuis la première mesure : { first, last, delta, since }. */
export function evolution(ctx, id) {
  const l = (ctx.perfs || []).filter((x) => x.metricId === id && !x.unknown && Number.isFinite(Number(x.value))).sort((a, b) => (a.date || 0) - (b.date || 0));
  if (l.length < 2) return null;
  return { first: Number(l[0].value), last: Number(l.at(-1).value), delta: r1(Number(l.at(-1).value) - Number(l[0].value)), since: l[0].date, n: l.length, points: l.slice(-30).map((x) => ({ v: Number(x.value), t: x.date })) };
}

/**
 * Indices calculés, seulement avec des mesures réelles. Chaque indice : { id, label, value, text, help }.
 * IMC : repère OMS adulte, qui ne distingue pas muscle et gras (trompeur pour les sportifs musclés).
 */
export function indices(ctx) {
  const v = (id) => lastValue(ctx, id)?.value, out = [];
  const kg = v('body_weight'), cm = v('taille_corps'), bf = v('masse_grasse'), lean = v('masse_maigre');
  if (kg && cm) {
    const bmi = r1(kg / (cm / 100) ** 2);
    const band = bmi < 18.5 ? 'sous 18,5' : bmi < 25 ? 'entre 18,5 et 25' : bmi < 30 ? 'entre 25 et 30' : 'au-dessus de 30';
    out.push({ id: 'imc', label: 'IMC (indice de masse corporelle)', value: bmi, text: `${String(bmi).replace('.', ',')} (${band})`, help: 'Poids ÷ taille². Repère de population (OMS, adultes) qui ne distingue pas le muscle du gras : un sportif musclé peut avoir un IMC « élevé » sans excès de gras.' });
  }
  const leanKg = lean || (kg && bf ? kg * (1 - bf / 100) : null);
  if (leanKg && !lean) out.push({ id: 'maigre', label: 'Masse maigre (calculée)', value: r1(leanKg), text: `${String(r1(leanKg)).replace('.', ',')} kg`, help: 'Poids × (1 − masse grasse %) : muscles, os, organes, eau. Si elle monte pendant que le gras baisse, tu gagnes du muscle.' });
  if (leanKg && kg && bf) out.push({ id: 'gras', label: 'Masse grasse en kilos', value: r1(kg - leanKg), text: `${String(r1(kg - leanKg)).replace('.', ',')} kg`, help: 'Plus parlant que le % : on voit si c’est le gras ou le muscle qui bouge.' });
  if (leanKg && cm) { const ffmi = r1(leanKg / (cm / 100) ** 2); out.push({ id: 'ffmi', label: 'Indice de masse maigre (FFMI)', value: ffmi, text: String(ffmi).replace('.', ','), help: 'Masse maigre ÷ taille² : la quantité de muscle pour ta taille. Il monte quand tu prends du muscle ; utile pour suivre la prise de muscle.' }); }
  const w = v('tour_taille'), hip = v('tour_hanches'), sh = v('tour_epaules'), span = v('envergure');
  if (w && cm) { const r = r2(w / cm); out.push({ id: 'whtr', label: 'Rapport tour de taille / taille', value: r, text: String(r).replace('.', ','), help: 'Tour de taille ÷ hauteur. Repère courant : rester sous 0,5 (garder un tour de taille inférieur à la moitié de sa taille). Indicatif, pas un diagnostic.' }); }
  if (w && hip) { const r = r2(w / hip); out.push({ id: 'whr', label: 'Rapport taille / hanches', value: r, text: String(r).replace('.', ','), help: 'Tour de taille ÷ tour de hanches : où se répartit le gras. À suivre dans le temps.' }); }
  if (sh && w) { const r = r2(sh / w); out.push({ id: 'vshape', label: 'Rapport épaules / taille (forme en V)', value: r, text: String(r).replace('.', ','), help: 'Il augmente quand le dos et les épaules s’élargissent ou que la taille s’affine. Un suivi, pas une norme.' }); }
  if (span && cm) { const d = r1(span - cm); out.push({ id: 'ape', label: 'Indice d’envergure (« ape index »)', value: d, text: `${d > 0 ? '+' : ''}${String(d).replace('.', ',')} cm`, help: 'Envergure − taille. Positif : bras plus longs que la moyenne, ce qui aide à atteindre les prises en escalade. Il ne change pas avec l’entraînement.' }); }
  return out;
}
/** Valeurs cohérentes d'une pesée complète (ce qui est impossible est refusé, avec la raison). */
export function checkWeighIn(d = {}) {
  const errors = [], n = (k) => (d[k] === '' || d[k] == null ? null : Number(String(d[k]).replace(',', '.')));
  const kg = n('body_weight'), bf = n('masse_grasse'), mm = n('masse_musculaire'), lean = n('masse_maigre'), water = n('eau_corporelle'), bone = n('masse_osseuse');
  if (kg != null && (kg < 25 || kg > 300)) errors.push('Poids entre 25 et 300 kg.');
  if (bf != null && (bf < 2 || bf > 70)) errors.push('Masse grasse entre 2 et 70 %.');
  if (water != null && (water < 30 || water > 80)) errors.push('Eau corporelle entre 30 et 80 %.');
  for (const [k, x] of [['masse musculaire', mm], ['masse maigre', lean], ['masse osseuse', bone]]) if (x != null && kg != null && x >= kg) errors.push(`La ${k} ne peut pas dépasser le poids.`);
  if (mm != null && lean != null && mm > lean) errors.push('La masse musculaire est forcément plus petite que la masse maigre.');
  return errors;
}
