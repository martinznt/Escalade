// format.js — format de séance choisi par la personne : les parties (échauffement, technique, renfo, étirements…),
// dans l'ordre voulu, avec le temps de chacune. Sans DOM, testé. Les conseils cités viennent de sources.js.

/** Types de parties. block = rangement dans la séance (warmup / main / cool) ; caps = ce que la partie cible. */
export const PART_TYPES = {
  warmup: { emoji: '🔥', label: 'Échauffement', block: 'warmup' },
  main: { emoji: '💪', label: 'Corps de séance', block: 'main' },
  technique: { emoji: '🎯', label: 'Technique', block: 'main', caps: { technique_escalade: 1, technique_pieds: 0.9, technique_course: 1, technique_nage: 1, coordination: 0.5, equilibre: 0.4 } },
  strength: { emoji: '🏋️', label: 'Renforcement', block: 'main', caps: { force_jambes: 0.8, tirage_vertical: 0.8, tirage_horizontal: 0.7, poussee_horizontale: 0.8, chaine_posterieure: 0.7, stabilite_epaules: 0.5 } },
  cardio: { emoji: '❤️', label: 'Cardio', block: 'main', caps: { endurance_aerobie: 1, seuil: 0.7, vitesse: 0.4 } },
  core: { emoji: '🧱', label: 'Gainage', block: 'main', caps: { gainage_anterieur: 1, gainage_lateral: 0.8 } },
  mobility: { emoji: '🤸', label: 'Mobilité', block: 'main', caps: { mobilite_hanches: 1, mobilite_epaules: 0.9 } },
  stretch: { emoji: '🧘', label: 'Étirements', block: 'cool' },
  cool: { emoji: '🌬️', label: 'Retour au calme', block: 'cool' },
};
export const EFFORT = new Set(['main', 'technique', 'strength', 'cardio', 'core']);
export const MAX_TOTAL = 240;
/** Formats tout prêts (part de chaque partie dans la durée totale). */
export const PRESETS = [
  ['classique', 'Classique', [['warmup', 0.15], ['main', 0.75], ['cool', 0.1]]],
  ['etirements', 'Avec étirements', [['warmup', 0.15], ['main', 0.65], ['stretch', 0.2]]],
  ['complet', 'Technique + physique', [['warmup', 0.12], ['technique', 0.3], ['strength', 0.3], ['core', 0.1], ['stretch', 0.18]]],
  ['cardio-renfo', 'Cardio + renfo', [['warmup', 0.12], ['cardio', 0.4], ['strength', 0.33], ['stretch', 0.15]]],
];
const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
/** Garde des parties valides : 10 au plus, 1 à 180 min chacune, 4 h au total. */
export function cleanParts(parts) {
  const out = []; let total = 0;
  for (const p of Array.isArray(parts) ? parts.slice(0, 10) : []) {
    if (!PART_TYPES[p?.type]) continue;
    const m = Math.min(int(p.minutes, 1, 180, 5), MAX_TOTAL - total); if (m < 1) break;
    out.push({ type: p.type, minutes: m }); total += m;
  }
  return out;
}
export const totalMinutes = (parts) => (parts || []).reduce((t, p) => t + (Number(p.minutes) || 0), 0);
/** Répartit une durée selon des proportions (somme exacte, au moins 1 min par partie). */
export function splitMinutes(shares, minutes) {
  const total = int(minutes, shares.length, MAX_TOTAL, 30), sum = shares.reduce((t, [, s]) => t + s, 0) || 1;
  const parts = shares.map(([type, s]) => ({ type, minutes: Math.max(1, Math.round((total * s) / sum)) }));
  let diff = total - totalMinutes(parts);
  // L'écart d'arrondi va à la partie la plus longue.
  while (diff !== 0) { const big = parts.reduce((a, b) => (b.minutes > a.minutes ? b : a)); const step = diff > 0 ? 1 : -1; if (big.minutes + step < 1) break; big.minutes += step; diff -= step; }
  return parts;
}
export const presetParts = (id, minutes) => { const p = PRESETS.find((x) => x[0] === id); return p ? splitMinutes(p[2], minutes) : []; };
/** Nouvelle durée totale : chaque partie garde sa proportion. */
export const scaleParts = (parts, minutes) => splitMinutes(parts.map((p) => [p.type, p.minutes]), minutes);
export const partLabel = (type) => `${PART_TYPES[type]?.emoji || ''} ${PART_TYPES[type]?.label || type}`.trim();
export const formatName = (parts) => [...new Set(parts.map((p) => PART_TYPES[p.type]?.label))].join(' + ');
/** Étirements placés avant une partie d'effort : on les fait dynamiques (voir la source behm2016). */
export const stretchBeforeEffort = (parts, i) => parts.slice(i + 1).some((p) => EFFORT.has(p.type));
/** Conseils sur l'ordre choisi (jamais bloquants), avec leurs sources. */
export function formatAdvice(parts) {
  const out = [];
  if (!parts.length) return out;
  const firstEffort = parts.findIndex((p) => EFFORT.has(p.type));
  const warm = parts.findIndex((p) => p.type === 'warmup');
  if (firstEffort >= 0 && (warm < 0 || warm > firstEffort)) out.push({ text: 'Pas d’échauffement avant l’effort : un échauffement complet réduit le risque de blessure. Ajoute-en un au début si tu peux.', sources: ['soligard2008'] });
  if (parts.some((p, i) => p.type === 'stretch' && stretchBeforeEffort(parts, i))) out.push({ text: 'Étirements avant l’effort : tenir longtemps un étirement juste avant baisse un peu la performance. À cette place, l’app met des mouvements dynamiques ; les étirements tenus restent en fin de séance.', sources: ['behm2016'] });
  const eff = parts.filter((p) => EFFORT.has(p.type)).reduce((t, p) => t + p.minutes, 0), tot = totalMinutes(parts);
  if (tot >= 30 && eff < tot * 0.4) out.push({ text: 'Peu de temps d’effort dans cette séance : c’est très bien pour récupérer, moins pour progresser.', sources: [] });
  return out;
}
/** Formats gardés par la personne (texte JSON validé). */
export function parseFormats(json) {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a.slice(0, 12).map((f) => ({ id: String(f.id || '').slice(0, 40), name: String(f.name || '').slice(0, 60), parts: cleanParts(f.parts) })).filter((f) => f.id && f.parts.length) : []; }
  catch { return []; }
}
