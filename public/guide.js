// guide.js — le mode « l'app me guide » : pour une partie de séance, plusieurs exercices possibles,
// ce que chacun travaille, l'ordre conseillé et des conseils d'association (« mets celui-ci avant »,
// « si tu veux plus de force des doigts, prends celui-là »). Aussi utilisé en mode libre (tout le catalogue).
// Règles simples et expliquées, à partir des données de la bibliothèque ; rien n'est inventé. Sans DOM, testé.
import { LIBRARY, byId } from './library.js';
import { CAPACITIES, EQUIPMENT } from './model.js';
import { normalizeEx, uid } from './shared.js';
import { exMinutes } from './engine.js';
import { exWhat } from './explain.js';

/** Ce que chaque type de partie peut contenir, et ce qu'elle cherche à travailler. */
export const POOLS = {
  warmup: { f: (x) => x.role === 'warmup', block: 'warmup' },
  fingers: { f: (x) => ['finger', 'wallfinger'].includes(x.kind) || ['finger-extensions', 'wrist-extension'].includes(x.id), caps: { force_doigts: 1, endurance_doigts: 0.8, pince: 0.5 } },
  strength: { f: (x) => x.role === 'main' && ['pull', 'lock', 'legs', 'antagonist'].includes(x.kind), caps: { tirage_vertical: 0.8, force_jambes: 0.8, poussee_horizontale: 0.7, blocage: 0.6, chaine_posterieure: 0.6 } },
  power: { f: (x) => x.role === 'main' && ['power', 'plyo', 'speed'].includes(x.kind), caps: { explosivite: 1, puissance_haut: 1, vitesse: 0.6 } },
  core: { f: (x) => x.role === 'main' && x.kind === 'core', caps: { gainage_anterieur: 1, gainage_lateral: 0.8 } },
  technique: { f: (x) => x.role === 'main' && x.kind === 'skill', caps: { technique_escalade: 1, technique_pieds: 1, equilibre: 0.5 } },
  endurance: { f: (x) => x.role === 'main' && ['endurance', 'run', 'swim'].includes(x.kind), caps: { endurance_doigts: 1, endurance_aerobie: 1, seuil: 0.6 } },
  prehab: { f: (x) => x.role === 'main' && x.kind === 'prehab', caps: { stabilite_epaules: 1, controle_scapulaire: 0.8 } },
  mobility: { f: (x) => (x.role === 'main' && x.kind === 'mobility') || (x.role === 'warmup' && x.kind === 'mobilize'), caps: { mobilite_hanches: 1, mobilite_epaules: 1 } },
  stretch: { f: (x) => x.role === 'cool' || (x.role === 'main' && x.kind === 'mobility'), block: 'cool' },
  cool: { f: (x) => x.role === 'cool', block: 'cool' },
};
/** Rappel pour toute la partie (affiché une fois, en tête). */
export const PART_NOTES = {
  fingers: 'Doigts : seulement après un échauffement des doigts (suspensions progressives), et arrête à la moindre douleur.',
  power: 'Puissance : en début de séance, frais, avec de vrais repos (2 à 3 min).',
  warmup: 'Échauffement : du plus doux au plus spécifique.',
  stretch: 'Étirements : doux et tenus, sans douleur.',
};
export const GUIDE_PARTS = { fingers: ['🖐️', 'Doigts'], power: ['⚡', 'Puissance'], technique: ['🎯', 'Technique'], endurance: ['🔋', 'Endurance'], prehab: ['🛡️', 'Prévention'] };
const IRANK = { high: 3, mod: 2, low: 1 };
const capName = (c) => CAPACITIES[c]?.label?.toLowerCase() || c;
const topCaps = (x, n = 2) => Object.entries(x.caps || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} et ${a.at(-1)}`);

/** Exercices possibles pour une partie, avec le matériel disponible (eq : Set) et le niveau (0 à 2). */
export function poolFor(type, { eq = null, level = 2, all = false } = {}) {
  const P = POOLS[type];
  return LIBRARY.filter((x) => (all || !P || P.f(x)) && (!eq || (x.needs || []).every((n) => eq.has(n))) && (x.minLevel || 0) <= level);
}
const relevance = (x, targets) => { if (!targets) return 1; let s = 0; for (const [c, w] of Object.entries(targets)) s += (x.caps?.[c] || 0) * w; return s; };

/**
 * Options guidées pour une partie : [{ id, lib, works, what, tips, recommended, score }], les meilleures d'abord.
 * part = { type, minutes, intensity }, o = { eq, level, want: capId à privilégier, fingersTired }.
 */
export function partOptions(part, o = {}) {
  const P = POOLS[part.type] || {}, targets = o.want ? { ...(P.caps || {}), [o.want]: 2 } : P.caps;
  let pool = poolFor(part.type, o).map((x) => ({ x, s: relevance(x, targets) + (part.intensity && IRANK[x.intensity] === IRANK[{ easy: 'low', mod: 'mod', hard: 'high', max: 'high' }[part.intensity]] ? 0.3 : 0) - (o.fingersTired && x.risk === 'finger' ? 1 : 0) }));
  pool = pool.filter((p) => p.s > 0 || !targets).sort((a, b) => b.s - a.s).slice(0, 8);
  const per = Math.max(4, Math.min(12, (part.minutes || 20) / 3)), nRec = Math.max(1, Math.min(4, Math.round((part.minutes || 20) / per)));
  const opts = pool.map(({ x, s }, i) => ({ id: x.id, lib: x, score: Math.round(s * 100) / 100, recommended: i < nRec, works: topCaps(x, 3).map(capName), what: exWhat({ ...x, libId: x.id }), tips: [] }));
  // Conseils d'association entre les options proposées.
  for (const a of opts) {
    const A = a.lib, main = topCaps(A, 1)[0];
    if (A.intensity === 'high') a.tips.push('À faire en premier dans cette partie : ça demande d’être frais.');
    else if (A.intensity === 'low' && part.type !== 'warmup') a.tips.push('Plutôt en fin de partie : léger, il complète bien les plus durs.');
    if (A.risk === 'finger' && o.fingersTired) a.tips.push('Tes doigts ont déjà travaillé : à éviter aujourd’hui, ou très léger.');
    const after = opts.find((b) => b !== a && b.recommended && topCaps(b.lib, 1)[0] === main && IRANK[b.lib.intensity] < IRANK[A.intensity]);
    if (after) a.tips.push(`Si tu prends aussi « ${after.lib.name} », fais celui-ci avant.`);
    for (const c of topCaps(A, 2)) {
      const better = opts.filter((b) => b !== a && (b.lib.caps?.[c] || 0) > (A.caps?.[c] || 0) + 0.25).sort((p, q) => (q.lib.caps?.[c] || 0) - (p.lib.caps?.[c] || 0))[0];
      if (better) { a.tips.push(`Si tu veux plus de ${capName(c)}, prends plutôt « ${better.lib.name} ».`); break; }
    }
    if ((A.minLevel || 0) >= 2) a.tips.push('Exercice avancé : fais-le seulement si tu le maîtrises.');
    a.tips = a.tips.slice(0, 2);
    a.gear = (A.needs || []).map((n) => EQUIPMENT[n] || n);
  }
  return opts;
}
/** Ordre conseillé des exercices choisis (le plus exigeant d'abord) et remarques sur le choix. */
export function orderAdvice(ids) {
  const xs = ids.map((id) => byId(id)).filter(Boolean);
  const order = xs.slice().sort((a, b) => (IRANK[b.intensity] || 2) - (IRANK[a.intensity] || 2) || (b.caps?.explosivite || 0) + (b.caps?.force_doigts || 0) - (a.caps?.explosivite || 0) - (a.caps?.force_doigts || 0));
  const notes = [];
  if (order.length > 1 && order.some((x, i) => x.id !== xs[i].id)) notes.push(`Ordre conseillé : ${order.map((x) => `« ${x.name} »`).join(' puis ')} (le plus exigeant d’abord, quand tu es frais).`);
  const hardFingers = xs.filter((x) => x.risk === 'finger' && x.intensity === 'high');
  if (hardFingers.length >= 2) notes.push('Deux exercices très durs pour les doigts : garde-en un, ou fais le second plus léger.');
  const caps = new Set(xs.flatMap((x) => topCaps(x, 1)));
  if (xs.length >= 3 && caps.size === 1) notes.push(`Tout travaille ${capName([...caps][0])} : ajoute un exercice différent pour équilibrer, si tu veux.`);
  return { order: order.map((x) => x.id), notes };
}
/** Exercices d'une partie à partir des choix : temps partagé entre eux, séries ajustées. */
export function buildPicked(part, ids, label) {
  const { order } = orderAdvice(ids), block = POOLS[part.type]?.block || 'main', per = (part.minutes || 20) / Math.max(1, order.length);
  return order.map((id) => {
    const lib = byId(id); const base = normalizeEx({ ...lib, id: uid(), libId: id, ok: lib.cues, bad: lib.bad, block, part: label });
    const first = exMinutes({ ...base, sets: 1 }), one = Math.max(0.3, exMinutes({ ...base, sets: 2 }) - first), cap = lib.intensity === 'high' ? (lib.sets || 3) + 1 : Math.max(6, (lib.sets || 3) * 2);
    const sets = Math.max(1, Math.min(cap, 1 + Math.floor(Math.max(0, per - first) / one)));
    return normalizeEx({ ...base, sets });
  });
}
/** Autres exercices pour une partie existante d'une séance (proches de ce qu'elle travaille, pas déjà dedans). */
export function similarOptions(exercises, o = {}) {
  const have = new Set(exercises.map((e) => e.libId).filter(Boolean)), targets = {};
  for (const e of exercises) { const caps = e.caps && Object.keys(e.caps).length ? e.caps : byId(e.libId)?.caps || {}; for (const [c, w] of Object.entries(caps)) targets[c] = (targets[c] || 0) + w; }
  const role = exercises[0]?.block === 'warmup' ? 'warmup' : exercises[0]?.block === 'cool' ? 'cool' : 'main';
  return LIBRARY.filter((x) => x.role === role && !have.has(x.id) && (!o.eq || (x.needs || []).every((n) => o.eq.has(n))) && (x.minLevel || 0) <= (o.level ?? 2))
    .map((x) => ({ x, s: relevance(x, targets) })).filter((p) => p.s > 0).sort((a, b) => b.s - a.s).slice(0, 8)
    .map(({ x }) => ({ id: x.id, lib: x, works: topCaps(x, 3).map(capName), what: exWhat({ ...x, libId: x.id }), tips: [x.intensity === 'high' ? 'Exigeant : place-le avant les autres de cette partie.' : x.intensity === 'low' ? 'Léger : bien en fin de partie.' : 'Intensité moyenne.'] }));
}
export { list as joinFr };
