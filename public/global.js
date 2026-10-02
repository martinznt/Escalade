// global.js — contenu de l'app en trois couches :
//   1. le contenu d'origine (exercices, séances prêtes, intentions, formats) ;
//   2. les modifications faites par un administrateur « pour tout le monde » (serveur, /api/global) ;
//   3. les modifications faites « pour moi » (liées au compte : items exedit / catedit).
// Les listes du code (LIBRARY, CATALOG, SPORT_INTENTS, PRESETS) sont reconstruites sur place à chaque changement.
import { LIBRARY, LIB_BY_ID } from './library.js';
import { CATALOG } from './catalog.js';
import { SPORT_INTENTS } from './intentions.js';
import { PRESETS, totalMinutes } from './format.js';
import { BUILTIN_SYSTEMS } from './grading.js';
import { BUILTIN_STYLES } from './model.js';
import { FAQ } from './help.js';
import { SOURCES } from './sources.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const ORIG = { lib: clone(LIBRARY), cat: clone(CATALOG), intents: clone(SPORT_INTENTS), presets: clone(PRESETS), systems: clone(BUILTIN_SYSTEMS), styles: clone(BUILTIN_STYLES), faq: clone(FAQ), sources: clone(SOURCES) };
export const isBuiltin = { exercise: (id) => ORIG.lib.some((x) => x.id === id), catalog: (id) => ORIG.cat.some((x) => x.id === id), format: (id) => ORIG.presets.some((x) => x[0] === id) };
export const original = { exercise: (id) => ORIG.lib.find((x) => x.id === id) || null, catalog: (id) => ORIG.cat.find((x) => x.id === id) || null };
const EX_FIELDS = ['name', 'emoji', 'mode', 'sets', 'repsMin', 'repsMax', 'secMin', 'secMax', 'rest', 'perSide', 'unit', 'cues', 'bad', 'why', 'what', 'group', 'intensity'];
const setIf = (x, d, keys) => { for (const k of keys) if (d[k] !== undefined && d[k] !== null && !(Array.isArray(d[k]) && !d[k].length && ['cues', 'bad'].includes(k) === false)) x[k] = clone(d[k]); };
const newExercise = (id, d) => ({ id, role: 'main', kind: 'skill', group: 'gainage', muscles: [], focus: [], intensity: 'mod', minLevel: 0, needs: [], risk: '', mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, secMin: 30, secMax: 30, rest: 60, perSide: false, unit: '', load: '', cues: [], bad: [], why: '', src: '', caps: {}, prim: [], sec: [], acts: [], pattern: '', diff: 1, emoji: '💪', ...clone(d), global: true });

let GLOBAL = [], MINE = { ex: [], cat: [] };
/** Ce qui est modifié pour tout le monde (liste du serveur) — utile à l'écran des administrateurs. */
export const globalItems = () => GLOBAL;
/**
 * Reconstruit les listes : origine → modifications pour tout le monde → modifications pour moi.
 * global : [{kind, id, hidden, data}] ; mine : { ex: [{id, ...champs, hidden}], cat: [...] }.
 */
export function applyLayers(global = GLOBAL, mine = MINE) {
  GLOBAL = global || []; MINE = mine || { ex: [], cat: [] };
  const by = (k) => GLOBAL.filter((g) => g.kind === k);
  // Exercices (un exercice masqué reste connu des séances existantes, mais n'est plus proposé)
  LIBRARY.length = 0; for (const x of ORIG.lib) LIBRARY.push(clone(x));
  for (const g of by('exercise')) {
    const x = LIBRARY.find((e) => e.id === g.id);
    if (g.hidden) { if (x) x.hidden = true; continue; }
    if (x) { setIf(x, g.data, EX_FIELDS); x.globalEdit = true; for (const k of ['acts', 'needs']) if (g.data[k]?.length) x[k] = clone(g.data[k]); if (g.data.caps && Object.keys(g.data.caps).length) x.caps = clone(g.data.caps); }
    else LIBRARY.push(newExercise(g.id, g.data));
  }
  for (const m of MINE.ex || []) { const x = LIBRARY.find((e) => e.id === m.id); if (!x) continue; if (m.hidden) x.hidden = true; else { setIf(x, m, EX_FIELDS); x.myEdit = true; } }
  LIB_BY_ID.clear(); for (const x of LIBRARY) LIB_BY_ID.set(x.id, x);
  // Séances prêtes
  CATALOG.length = 0; for (const c of ORIG.cat) CATALOG.push(clone(c));
  for (const g of by('catalog')) {
    const i = CATALOG.findIndex((c) => c.id === g.id);
    if (g.hidden) { if (i >= 0) CATALOG.splice(i, 1); continue; }
    const e = { ...(i >= 0 ? CATALOG[i] : {}), ...clone(g.data), id: g.id, globalEdit: i >= 0, global: i < 0 };
    if (i >= 0) CATALOG[i] = e; else CATALOG.push(e);
  }
  for (const m of MINE.cat || []) { const i = CATALOG.findIndex((c) => c.id === m.id); if (i < 0) continue; if (m.hidden) { CATALOG.splice(i, 1); continue; } const { id: _i, hidden: _h, _u, ...rest } = m; CATALOG[i] = { ...CATALOG[i], ...clone(rest), myEdit: true }; }
  // Intentions par sport (identifiant global : « sport__intention » pour une intention d'origine, « g-… » pour une nouvelle)
  for (const k of Object.keys(SPORT_INTENTS)) delete SPORT_INTENTS[k];
  for (const [k, list] of Object.entries(ORIG.intents)) SPORT_INTENTS[k] = clone(list);
  for (const g of by('intent')) {
    const [act, iid] = g.id.includes('__') ? g.id.split('__') : [g.data?.activityId, g.id];
    const list = SPORT_INTENTS[act]; if (!list) continue;
    const i = list.findIndex((x) => x.id === iid);
    if (g.hidden) { if (i >= 0) list.splice(i, 1); continue; }
    const e = { id: iid, emoji: g.data.emoji, label: g.data.label, caps: Object.keys(g.data.caps || {}).length ? clone(g.data.caps) : list[i]?.caps || {}, globalEdit: true };
    if (i >= 0) list[i] = e; else list.push(e);
  }
  // Systèmes de cotation et styles pour tout le monde (ils s'ajoutent aux systèmes intégrés)
  for (const k of Object.keys(BUILTIN_SYSTEMS)) delete BUILTIN_SYSTEMS[k];
  Object.assign(BUILTIN_SYSTEMS, clone(ORIG.systems));
  for (const g of by('grading')) { if (g.hidden) { delete BUILTIN_SYSTEMS[g.id]; continue; } BUILTIN_SYSTEMS[g.id] = { id: g.id, ...clone(g.data), builtin: true, global: true }; }
  BUILTIN_STYLES.length = 0; for (const s of ORIG.styles) BUILTIN_STYLES.push(clone(s));
  for (const g of by('style')) { const i = BUILTIN_STYLES.findIndex((s) => s.id === g.id); if (g.hidden) { if (i >= 0) BUILTIN_STYLES.splice(i, 1); continue; } const s = { id: g.id, ...clone(g.data), builtin: true, global: true }; if (i >= 0) BUILTIN_STYLES[i] = s; else BUILTIN_STYLES.push(s); }
  // Questions fréquentes (« f<n> » = question d'origine n°n ; « g-… » = ajoutée) et sources citées
  FAQ.length = 0; ORIG.faq.forEach((f, i) => FAQ.push([f[0], f[1], 'f' + i]));
  for (const g of by('faq')) { const i = FAQ.findIndex((f) => f[2] === g.id); if (g.hidden) { if (i >= 0) FAQ.splice(i, 1); continue; } const f = [g.data.q, g.data.a, g.id]; if (i >= 0) FAQ[i] = f; else FAQ.push(f); }
  for (const k of Object.keys(SOURCES)) delete SOURCES[k];
  Object.assign(SOURCES, clone(ORIG.sources));
  for (const g of by('source')) { if (g.hidden) { delete SOURCES[g.id]; continue; } SOURCES[g.id] = { ...(SOURCES[g.id] || {}), ...clone(g.data), global: true }; }
  // Formats de séance tout prêts
  PRESETS.length = 0; for (const p of ORIG.presets) PRESETS.push(clone(p));
  for (const g of by('format')) {
    const i = PRESETS.findIndex((p) => p[0] === g.id);
    if (g.hidden) { if (i >= 0) PRESETS.splice(i, 1); continue; }
    const tot = totalMinutes(g.data.parts) || 1, p = [g.id, g.data.name, g.data.parts.map((x) => [x.type, x.minutes / tot])];
    if (i >= 0) PRESETS[i] = p; else PRESETS.push(p);
  }
}

/** Textes de l'app réécrits pour tout le monde : texte d'origine → nouveau texte. */
export const textOverrides = () => new Map(GLOBAL.filter((x) => x.kind === 'text' && !x.hidden && x.data).map((x) => [x.data.from, x.data.to]));
/** Annonces et notes de mise à jour écrites dans l'app, de la plus récente à la plus ancienne. */
export const announcements = () => GLOBAL.filter((x) => x.kind === 'announce' && !x.hidden && x.data).map((x) => ({ id: x.id, at: x.updatedAt || 0, by: x.by || '', ...x.data })).sort((a, b) => b.at - a.at);
/** Bandeau en cours (message de maintenance) : le plus récent encore valable. */
export const activeBanner = (now = Date.now()) => announcements().find((a) => a.banner && (!a.until || a.until > now)) || null;
/** Raccourcis contextuels ajoutés par un administrateur. */
export const globalHints = () => GLOBAL.filter((x) => x.kind === 'hint' && !x.hidden && x.data).map((x) => ({ id: 'g-' + x.id, ...x.data }));
/** Mise en page de base pour tous (par page) et fonctions masquées pour tous. */
export const globalLayout = () => GLOBAL.find((x) => x.kind === 'layout' && x.id === 'default' && !x.hidden)?.data || { pages: {}, off: {} };
