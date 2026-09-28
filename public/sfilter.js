// sfilter.js — ranger ses séances : sports (plusieurs), catégories, lieu, et de nombreux tris. Sans DOM, testé.
import { byId } from './library.js';
import { sessionMinutes } from './engine.js';

/** Catégories : reconnues automatiquement d'après ce que travaillent les exercices, ou choisies à la main. */
export const CATS = {
  force: { emoji: '💪', label: 'Force', caps: ['tirage_vertical', 'tirage_horizontal', 'tirage_unilateral', 'blocage', 'poussee_horizontale', 'poussee_verticale', 'force_jambes', 'chaine_posterieure'] },
  doigts: { emoji: '✋', label: 'Doigts', caps: ['force_doigts', 'endurance_doigts', 'pince'] },
  technique: { emoji: '🎯', label: 'Technique', caps: ['technique_escalade', 'technique_pieds', 'coordination', 'equilibre', 'technique_course', 'technique_nage'] },
  gainage: { emoji: '🧱', label: 'Gainage', caps: ['gainage_anterieur', 'gainage_lateral', 'controle_scapulaire', 'stabilite_epaules'] },
  puissance: { emoji: '⚡', label: 'Puissance', caps: ['explosivite', 'puissance_haut', 'vitesse'] },
  endurance: { emoji: '🫀', label: 'Endurance', caps: ['endurance_aerobie', 'seuil'] },
  mobilite: { emoji: '🧘', label: 'Mobilité', caps: ['mobilite_hanches', 'mobilite_epaules'] },
};
const CAP_CAT = Object.fromEntries(Object.entries(CATS).flatMap(([k, c]) => c.caps.map((cap) => [cap, k])));
const mains = (s) => { const m = (s.exercises || []).filter((e) => e.block === 'main'); return m.length ? m : s.exercises || []; };

/** Catégories reconnues d'après les exercices (celles qui pèsent au moins un quart, au moins une). */
export function autoCategories(s) {
  const w = {};
  for (const e of mains(s)) {
    const caps = e.caps && Object.keys(e.caps).length ? e.caps : byId(e.libId)?.caps || {};
    for (const [c, v] of Object.entries(caps)) if (CAP_CAT[c]) w[CAP_CAT[c]] = (w[CAP_CAT[c]] || 0) + v * (e.sets || 1);
  }
  const tot = Object.values(w).reduce((t, v) => t + v, 0); if (!tot) return [];
  const sorted = Object.entries(w).sort((a, b) => b[1] - a[1]);
  return sorted.filter(([, v], i) => i === 0 || v / tot >= 0.25).slice(0, 3).map(([k]) => k);
}
/** Catégories de la séance : celles choisies à la main, sinon celles reconnues. */
export const categoriesOf = (s) => (s.tags?.length ? s.tags : autoCategories(s));
/** Tous les sports de la séance (le principal d'abord). */
export const sportsOf = (s) => [...new Set([s.activity, ...(s.sports || [])].filter(Boolean))];
/** Lieu : l'environnement choisi, ou « none ». */
export const placeOf = (s) => s.context?.env || 'none';
/** Intensité de 1 (douce) à 3 (intense), d'après les exercices principaux ; 0 si inconnue. */
export function intensityOf(s) {
  const V = { low: 1, mod: 2, high: 3 }; let t = 0, n = 0;
  for (const e of mains(s)) { const v = V[e.intensity] || V[byId(e.libId)?.intensity]; if (v) { t += v * (e.sets || 1); n += e.sets || 1; } }
  return n ? Math.round((t / n) * 10) / 10 : 0;
}
export const INTENSITY_LABEL = (x) => (!x ? '' : x < 1.7 ? 'douce' : x < 2.4 ? 'moyenne' : 'intense');

export const SORTS = {
  recent: ['🕒', 'Modifiées récemment'],
  form: ['💚', 'Selon ma forme du jour'],
  forgotten: ['🗓', 'Pas faites depuis longtemps'],
  most: ['🔁', 'Les plus faites'],
  short: ['⏱', 'Les plus courtes'],
  long: ['⌛', 'Les plus longues'],
  soft: ['🌿', 'Les plus douces'],
  hard: ['🔥', 'Les plus intenses'],
  name: ['🔤', 'Par nom (A → Z)'],
  sport: ['🏷', 'Par sport'],
};
export const FORMS = { low: ['😴', 'Fatigué', 1], normal: ['🙂', 'Normal', 2], top: ['🔥', 'En forme', 3] };

/**
 * Filtre puis trie. f = { status: 'active'|'templates'|'archived', places: [], sports: [], cats: [], q: '', sort, form }.
 * Plusieurs sports : la séance doit en contenir au moins un. Plusieurs catégories : idem. Plusieurs lieux : l'un d'eux.
 */
export function filterSessions(list, f = {}, history = []) {
  const q = String(f.q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const st = f.status || 'active';
  let out = list.filter((s) => (st === 'archived' ? s.archived : st === 'templates' ? s.template && !s.archived : !s.archived));
  if (f.places?.length) out = out.filter((s) => f.places.includes(placeOf(s)));
  if (f.sports?.length) out = out.filter((s) => sportsOf(s).some((x) => f.sports.includes(x)));
  if (f.cats?.length) out = out.filter((s) => categoriesOf(s).some((x) => f.cats.includes(x)));
  if (q) out = out.filter((s) => norm(s.name).includes(q) || (s.exercises || []).some((e) => norm(e.name).includes(q)));
  const last = {}, count = {};
  for (const h of history) { const id = h.sessionId; if (!id) continue; count[id] = (count[id] || 0) + 1; last[id] = Math.max(last[id] || 0, h.startedAt || 0); }
  const by = (fn) => (a, b) => fn(a, b) || (b.updatedAt || 0) - (a.updatedAt || 0);
  const target = FORMS[f.form]?.[2] || 2;
  const cmp = {
    recent: by(() => 0),
    name: by((a, b) => a.name.localeCompare(b.name, 'fr')),
    short: by((a, b) => sessionMinutes(a) - sessionMinutes(b)),
    long: by((a, b) => sessionMinutes(b) - sessionMinutes(a)),
    soft: by((a, b) => (intensityOf(a) || 9) - (intensityOf(b) || 9)),
    hard: by((a, b) => intensityOf(b) - intensityOf(a)),
    form: by((a, b) => Math.abs((intensityOf(a) || 2) - target) - Math.abs((intensityOf(b) || 2) - target) || (target === 1 ? sessionMinutes(a) - sessionMinutes(b) : 0)),
    forgotten: by((a, b) => (last[a.id] || 0) - (last[b.id] || 0)),
    most: by((a, b) => (count[b.id] || 0) - (count[a.id] || 0)),
    sport: by((a, b) => String(a.activity || '~').localeCompare(String(b.activity || '~'))),
  }[f.sort] || by(() => 0);
  return out.slice().sort(cmp);
}
/** Nombre de filtres actifs (pour l'afficher sur le bouton). */
export const activeFilters = (f = {}) => (f.places?.length || 0) + (f.sports?.length || 0) + (f.cats?.length || 0) + (f.q ? 1 : 0);
