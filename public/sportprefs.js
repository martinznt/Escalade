// sportprefs.js — les sports que la personne ne fait jamais (Profil › Mes sports) : ils ne sont plus proposés
// (créateur de séance, planning, bilan rapide…) et, si elle le choisit, leurs exercices et séances prêtes sont masqués
// partout. Un exercice qui sert aussi à un autre sport reste visible. Tout se remet d'un toucher.
import { item, putItem, itemsOf } from './state.js';
import { ACTIVITIES } from './model.js';

const cfg = () => item('config', 'sports') || {};
/** Sports marqués « jamais ». */
export const neverSports = () => new Set(cfg().never || []);
/** Sports « jamais » dont les exercices et séances prêtes sont aussi masqués. */
export const hiddenSports = () => { const c = cfg(), never = new Set(c.never || []); return new Set((c.neverHide || []).filter((x) => never.has(x))); };
/** Exercice masqué : tous ses sports sont masqués (un exercice sans sport noté reste visible). */
export const exHidden = (x, hide = hiddenSports()) => hide.size > 0 && Array.isArray(x?.acts) && x.acts.length > 0 && x.acts.every((a) => hide.has(a));
/** Séance prête masquée : son sport est masqué. */
export const sessionHidden = (e, hide = hiddenSports()) => hide.size > 0 && hide.has(e?.activity || e?.activityId || e?.sport || '');
export const visibleEx = (list) => { const hide = hiddenSports(); return hide.size ? list.filter((x) => !exHidden(x, hide)) : list; };
export const visibleSessions = (list) => { const hide = hiddenSports(); return hide.size ? list.filter((e) => !sessionHidden(e, hide)) : list; };
/** Sport proposable (dans une liste de choix) : pas « jamais », sauf s'il est déjà choisi. */
export const proposable = (id, current = '') => id === current || !neverSports().has(id);
/** État d'un sport natif : 'on' (je le fais), 'off' (pas pour l'instant) ou 'never'. */
export function sportState(id, activities) { if (neverSports().has(id)) return 'never'; return activities[id] ? 'on' : 'off'; }
/** Change l'état d'un sport natif. « Jamais » retire aussi le sport de « je le fais » (l'historique est gardé). */
export function setSportState(id, state, { hide } = {}) {
  if (!ACTIVITIES[id]) return;
  const c = cfg(), never = new Set(c.never || []), neverHide = new Set(c.neverHide || []);
  if (state === 'never') { never.add(id); if (hide === true) neverHide.add(id); else if (hide === false) neverHide.delete(id); }
  else { never.delete(id); neverHide.delete(id); }
  putItem('config', 'sports', { ...c, never: [...never], neverHide: [...neverHide] });
  const existing = itemsOf('activity').find((x) => x.preset === id || x.id === id), base = { preset: id, label: ACTIVITIES[id].label, emoji: ACTIVITIES[id].emoji };
  if (state === 'on') putItem('activity', existing?.id || 'act-' + id, { ...(existing || {}), ...base, archived: false });
  else if (existing && !existing.archived) putItem('activity', existing.id, { ...existing, ...base, archived: true });
}
