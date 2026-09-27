// body-rules.js — profil corporel : listes de réponses, nettoyage et effet sur les séances (sans DOM, testé).
export const SHAPES = [['mince', 'Mince'], ['athletique', 'Athlétique'], ['moyen', 'Dans la moyenne'], ['costaud', 'Costaud'], ['rond', 'En rondeurs']];
export const ZONES = [['bras', 'Bras'], ['epaules', 'Épaules'], ['dos', 'Dos'], ['pecs', 'Pectoraux'], ['abdos', 'Abdos'], ['jambes', 'Jambes'], ['fessiers', 'Fessiers'], ['avantbras', 'Avant-bras']];
export const FITNESS = [[1, '😮‍💨', 'À plat'], [2, '😕', 'Pas top'], [3, '🙂', 'Correct'], [4, '😀', 'En forme'], [5, '💥', 'Au top']];
export const BREATH = [['jamais', 'Rarement essoufflé'], ['effort', 'Seulement à l’effort intense'], ['escaliers', 'Dans les escaliers'], ['souvent', 'Souvent, même à l’effort léger']];
export const DAILY = [['assis', 'Surtout assis'], ['debout', 'Souvent debout / à pied'], ['physique', 'Travail physique']];
export const SEXES = [['f', 'Femme'], ['h', 'Homme'], ['x', 'Autre / je préfère ne pas dire']];

/** Nettoie les réponses (bornes raisonnables ; vide = non renseigné). */
export function cleanBody(b = {}) {
  const n = (v, a, z) => { const x = Number(v); return v === '' || v == null || !Number.isFinite(x) ? undefined : Math.min(z, Math.max(a, Math.round(x * 10) / 10)); };
  const pick = (v, list) => (list.some(([k]) => String(k) === String(v)) ? v : undefined);
  return {
    age: n(b.age, 8, 100), height: n(b.height, 100, 230), weight: n(b.weight, 25, 300), sex: pick(b.sex, SEXES), shape: pick(b.shape, SHAPES),
    muscled: (Array.isArray(b.muscled) ? b.muscled : []).filter((z) => ZONES.some(([k]) => k === z)), fitness: pick(Number(b.fitness), FITNESS) ? Number(b.fitness) : undefined,
    breath: pick(b.breath, BREATH), daily: pick(b.daily, DAILY),
  };
}

/**
 * Ce que le profil corporel change dans une séance générée (règles simples, expliquées) :
 * - souffle court ou forme basse → niveau plafonné, repos plus longs, pas de sauts ;
 * - 60 ans et plus → équilibre et mobilité en plus, pas de sauts intenses ;
 * - objectif « perdre du poids » → travail en circuit, plus d'endurance, impacts limités si la silhouette est ronde.
 * Chaque règle renvoie sa raison, affichée dans « Pourquoi cette séance ? ».
 */
export function bodyAdjust(body = {}, goals = []) {
  const r = { levelCap: null, restFactor: 1, noPlyo: false, extraIntents: [], reasons: [] };
  if (body.breath === 'souvent' || body.fitness === 1) { r.levelCap = 0; r.restFactor = 1.4; r.noPlyo = true; r.reasons.push('Tu es vite essoufflé ou à plat en ce moment : exercices simples, repos plus longs, pas de sauts.'); }
  else if (body.breath === 'escaliers' || body.fitness === 2) { r.levelCap = 1; r.restFactor = 1.2; r.reasons.push('Forme moyenne en ce moment : intensité modérée et repos un peu plus longs.'); }
  if (body.age >= 60) { r.noPlyo = true; r.extraIntents.push('mobilite'); r.reasons.push('À partir de 60 ans, on ajoute de l’équilibre et de la mobilité, et on évite les sauts intenses.'); }
  if (goals.includes('poids')) {
    r.extraIntents.push('endurance'); r.circuit = true; r.reasons.push('Objectif perte de poids : plus de mouvement continu, en circuit, avec des pauses courtes.');
    if (body.shape === 'rond') { r.noPlyo = true; r.reasons.push('Pour ménager les articulations, pas de sauts : on privilégie les mouvements sans impact.'); }
  }
  return r;
}

