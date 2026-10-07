// objectivelinks.js — les objectifs et les phases sont liés indépendamment : une phase peut servir plusieurs
// objectifs, et un objectif être préparé, travaillé puis soutenu par plusieurs phases. Aucun objectif du compte
// n'est créé ici. Les anciens aimKey / prepFor restent lisibles, sans cycle avec le planificateur.
import { CAPACITIES } from './model.js';

const RANK_WEIGHT = [4, 3, 2, 1.5, 1];
const CONTRIBUTIONS = { primary: 1, preparation: 0.35, support: 0.5 };
const LINK_LIMIT = 30;
const text = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const keyOf = (v) => { const s = text(v, 80); return /^[\w: .@#-]{1,80}$/.test(s) ? s : ''; };
const goalIdOf = (v) => { const s = text(v, 80); return /^[\w:.-]{1,80}$/.test(s) ? s : ''; };
const number = (v) => (typeof v === 'number' || typeof v === 'string' && v.trim() ? Number(v) : NaN);
const rankOf = (v) => { const n = number(v); return Number.isFinite(n) && n >= 0 ? Math.min(LINK_LIMIT - 1, Math.floor(n)) : null; };
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);

function cleanCaps(v) {
  const caps = {};
  for (const [id, value] of Object.entries(object(v) ? v : {})) {
    const w = number(value);
    if (Object.hasOwn(CAPACITIES, id) && Number.isFinite(w) && w > 0) caps[id] = Math.min(4, w);
  }
  return caps;
}
const mergeCaps = (a, b) => {
  const caps = { ...a };
  for (const [id, w] of Object.entries(b)) caps[id] = Math.max(caps[id] || 0, w);
  return caps;
};

/** Classe aussi un catalogue brut : A, B ex æquo, C → rangs 0, 0, 1. Les rangs explicites sont conservés. */
function catalogOf(aims) {
  const catalog = new Map();
  let lastRank = -1;
  for (const a of (Array.isArray(aims) ? aims : []).slice(0, LINK_LIMIT)) {
    if (!object(a)) continue;
    const key = keyOf(a.key);
    if (!key || catalog.has(key)) continue;
    const rank = rankOf(a.rank) ?? (lastRank < 0 ? 0 : a.tie ? lastRank : lastRank + 1);
    lastRank = rank;
    catalog.set(key, { ...a, rank, equal: !!a.equal, caps: cleanCaps(a.caps) });
  }
  return catalog;
}

/**
 * Références canoniques d'une phase. Une aimLinks explicite, même vide, remplace les anciens champs.
 * Le catalogue complète uniquement les informations absentes ; les liens enregistrés restent autonomes.
 * Retourne [{ key, label, rank, equal, source, goalId, contribution, caps }], sans modifier les entrées.
 */
export function normalizeAimLinks(phase = {}, aims = []) {
  const p = object(phase) ? phase : {}, catalog = catalogOf(aims);
  const legacy = [];
  if (!Array.isArray(p.aimLinks)) {
    if (p.aimKey) legacy.push({ key: p.aimKey, label: p.aimLabel, rank: p.aimRank, equal: p.aimEqual, contribution: 'primary' });
    if (p.prepFor) legacy.push({ key: p.prepFor, contribution: 'preparation' });
    if (!legacy.length && p.objective && catalog.size === 1) legacy.push({ key: [...catalog.keys()][0], contribution: 'primary' });
  }
  const links = new Map();
  for (const raw of (Array.isArray(p.aimLinks) ? p.aimLinks : legacy).slice(0, LINK_LIMIT * 2)) {
    if (!object(raw)) continue;
    const key = keyOf(raw.key);
    if (!key) continue;
    const a = catalog.get(key) || {};
    const contribution = Object.hasOwn(CONTRIBUTIONS, raw.contribution) ? raw.contribution : 'primary';
    const link = {
      key, label: text(raw.label, 60) || text(a.label, 60) || key,
      rank: rankOf(raw.rank) ?? a.rank ?? 0,
      equal: typeof raw.equal === 'boolean' ? raw.equal : !!a.equal,
      source: text(raw.source, 40) || text(a.source, 40),
      goalId: goalIdOf(raw.goalId) || goalIdOf(a.goalId),
      contribution, caps: cleanCaps(object(raw.caps) ? raw.caps : a.caps),
    };
    const prev = links.get(key);
    if (!prev) { links.set(key, link); continue; }
    const chosen = CONTRIBUTIONS[link.contribution] > CONTRIBUTIONS[prev.contribution] ? link : prev;
    links.set(key, { ...chosen, caps: mergeCaps(prev.caps, link.caps) });
  }
  return [...links.values()].slice(0, LINK_LIMIT);
}

/** Même lecture pour les consommateurs qui n'ont pas à distinguer migration et données canoniques. */
export const aimLinksFor = normalizeAimLinks;

/** Capacités pondérées par importance et contribution ; plusieurs références ne doublent pas une capacité. */
export function linkedAimCaps(phase = {}, aims = []) {
  const caps = {};
  for (const link of normalizeAimLinks(phase, aims)) {
    const weight = (link.equal ? 1 : RANK_WEIGHT[link.rank] ?? 1) * CONTRIBUTIONS[link.contribution];
    for (const [id, w] of Object.entries(link.caps)) caps[id] = Math.max(caps[id] || 0, w * weight);
  }
  return caps;
}
