// adminlist.js — listes de l'administration (sans DOM, testé) : signalements filtrés et cherchés, récents mis en avant.
export const RECENT_MS = 48 * 3600e3;
const fold = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Signalements filtrés par statut et par mots (titre, texte, page, auteur, version) ; les ouverts récents (< 48 h) d'abord. */
export function filterBugs(bugs, f = 'open', q = '', now = Date.now()) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const text = (b) => fold([b.title, b.description, b.page, b.author, b.appVersion].join(' '));
  const hot = (b) => (b.recent && b.status === 'open' ? 1 : 0);
  return (Array.isArray(bugs) ? bugs : []).filter((b) => (f === 'all' || b.status === f) && words.every((w) => text(b).includes(w)))
    .map((b) => ({ ...b, recent: now - (Number(b.createdAt) || 0) < RECENT_MS }))
    .sort((a, b) => hot(b) - hot(a) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}
