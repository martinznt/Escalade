// places.js — les lieux (salles, falaises et leurs secteurs, maison…) et tout ce qui y a été fait :
// séances, blocs et voies du carnet, mesures. Sans DOM, testé. Seules les données enregistrées sont utilisées.
export const PLACE_KIND = { escalade: 'salle', salle: 'salle', falaise: 'falaise', exterieur: 'falaise', maison: 'maison', piscine: 'autre', piste: 'autre', autre: 'autre' };
export const KIND_LABEL = { salle: ['🏢', 'Salles'], falaise: ['🌄', 'Falaises et sites'], maison: ['🏠', 'Maison'], autre: ['📍', 'Autres lieux'] };
export const kindOfEnv = (e) => PLACE_KIND[e?.type] || 'autre';
/** Lieux d'un genre (salle / falaise) pour le choisir au moment d'enregistrer. */
export const placesOf = (envs, kind) => envs.filter((e) => !e.archived && (!kind || kindOfEnv(e) === kind));

/**
 * Ce qui a été fait dans un lieu : séances (historique), blocs/voies (carnet, regroupés par secteur), mesures.
 * ctx : { history, ascents, perfs }.
 */
export function placeStats(envId, ctx, envName = '') {
  const sessions = (ctx.history || []).filter((h) => h.data?.context?.env === envId).sort((a, b) => b.startedAt - a.startedAt);
  const ascents = (ctx.ascents || []).filter((a) => a.context?.env === envId).sort((a, b) => (b.date || 0) - (a.date || 0));
  const perfs = (ctx.perfs || []).filter((p) => p.context?.env === envId);
  const sectors = new Map();
  for (const a of ascents) { const p = a.context?.place || '', k = p === envName ? '' : p; if (!sectors.has(k)) sectors.set(k, []); sectors.get(k).push(a); }
  const done = ascents.filter((a) => ['onsight', 'flash', 'send', 'work', 'top'].includes(a.result));
  const best = (kind) => done.filter((a) => a.kind === kind && a.grade).sort((a, b) => (b.grade.order || 0) - (a.grade.order || 0))[0]?.grade?.label || '';
  const minutes = Math.round(sessions.reduce((t, h) => t + (h.durationSeconds || 0), 0) / 60);
  const last = Math.max(0, sessions[0]?.startedAt || 0, ascents[0]?.date || 0);
  return { sessions, ascents, perfs, sectors: [...sectors.entries()].map(([name, list]) => ({ name, list, sent: list.filter((a) => ['onsight', 'flash', 'send', 'work', 'top'].includes(a.result)).length })),
    count: sessions.length + ascents.length + perfs.length, minutes, bestBloc: best('bloc'), bestVoie: best('voie'), sent: done.length, last };
}
/** Tous les lieux, regroupés (salles, falaises, maison, autres), avec ce qui y a été fait ; les plus fréquentés d'abord. */
export function allPlaces(envs, ctx) {
  const groups = {};
  for (const e of envs.filter((x) => !x.archived)) { const k = kindOfEnv(e); (groups[k] ||= []).push({ env: e, stats: placeStats(e.id, ctx, e.name) }); }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => b.stats.count - a.stats.count || b.stats.last - a.stats.last);
  return ['salle', 'falaise', 'maison', 'autre'].filter((k) => groups[k]?.length).map((k) => ({ kind: k, places: groups[k] }));
}
