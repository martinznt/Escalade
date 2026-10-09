// backup.js — ce que devient une sauvegarde JSON importée (pur, sans DOM : testé dans tests/backup.test.mjs).
// Règles :
//  · rien n'est supprimé : les marques de suppression du fichier sont ignorées ;
//  · une séance supprimée depuis la sauvegarde n'est récupérée que si la personne le choisit (restore) ;
//  · l'historique et les rendez-vous ont des identifiants uniques sur tout le serveur : une sauvegarde d'un autre compte
//    (ou sans propriétaire connu et sans rien en commun avec ce compte) reçoit de nouveaux identifiants, et les liens
//    sont gardés (rendez-vous → séance, exception → rendez-vous répété, historique → rendez-vous) ;
//  · un élément déjà présent (même identifiant, ou même date et même nom) n'est pas ajouté deux fois.
import { uid, mergeSeances, readStored } from './shared.js';
import { cleanExternal, externalOf } from './external.js';

const ID = /^[\w-]{1,64}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const low = (t) => String(t ?? '').trim().toLowerCase();
const sigHistory = (x) => `${Math.round(Number(x.startedAt) / 1000)}|${low(x.sessionName)}`;
const sigEvent = (x) => `${x.date}|${x.time || ''}|${low(x.title)}|${x.meta?.occurrenceDate || ''}`;

/** Le fichier est-il une sauvegarde de l'app ? (sinon une erreur lisible) */
export function checkBackup(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || (d.app && !['mes-seances', 'seance-entrainement'].includes(d.app))) throw new Error('Ce fichier n’est pas une sauvegarde de l’application.');
  return d;
}
/** Séances du fichier supprimées depuis sur ce compte (la marque de suppression est plus récente que la version gardée). */
export function deletedSince(d, seances) {
  const tomb = seances?.tomb || {}, live = new Set((seances?.items || []).map((s) => s.id));
  return readStored(d?.seances ?? []).items.filter((s) => s?.id && !live.has(s.id) && tomb[s.id] && tomb[s.id] >= (s.updatedAt || 0)).map((s) => ({ id: s.id, name: s.name || 'Séance' }));
}
/** Le fichier vient-il de ce compte ? Propriétaire écrit dans le fichier (depuis la 8.34.1), sinon un identifiant en commun. */
export function fromThisAccount(d, cur, owner) {
  if (d?.owner) return d.owner === owner;
  const h = new Set((cur.history || []).map((x) => x.id)), e = new Set((cur.events || []).map((x) => x.id));
  return (Array.isArray(d?.history) ? d.history : []).some((x) => h.has(x?.id)) || (Array.isArray(d?.events) ? d.events : []).some((x) => e.has(x?.id));
}

/**
 * Prépare l'import : { seances (fusionnées), history et events à ajouter, stats }.
 * cur : { seances: {items, tomb}, history, events } ; owner : identifiant du compte connecté ; restore : séances à récupérer.
 */
export function planImport(d, cur, { owner = '', restore = [], now = Date.now(), newId = uid } = {}) {
  checkBackup(d);
  const stats = { seances: 0, restored: 0, keptDeleted: 0, history: 0, events: 0, already: 0, skipped: 0 };
  const same = fromThisAccount(d, cur, owner);
  /* Séances : fusion ordinaire, sans les suppressions du fichier ; récupération seulement si choisie. */
  const inc = readStored(d.seances ?? []), want = new Set(restore), tomb = { ...(cur.seances?.tomb || {}) };
  const blocked = new Set(deletedSince(d, cur.seances).map((s) => s.id));
  const items = inc.items.map((s) => {
    if (!blocked.has(s.id)) return s;
    if (!want.has(s.id)) { stats.keptDeleted++; return s; }
    const back = { ...s, updatedAt: Math.max(now, (tomb[s.id] || 0) + 1) }; delete tomb[s.id]; stats.restored++; return back;
  });
  const seances = mergeSeances({ items: cur.seances?.items || [], tomb }, { items, tomb: {} });
  const won = new Set(seances.items), before = new Map((cur.seances?.items || []).map((s) => [s.id, s]));
  for (const s of items) if (won.has(s) && !blocked.has(s.id)) { if (before.get(s.id) !== s) stats.seances++; }
  for (const s of items) if (!won.has(s) && !blocked.has(s.id) && before.has(s.id)) stats.already++;
  /* Rendez-vous : d'abord les identifiants (nouveaux si besoin), puis les liens entre eux. */
  const evIds = new Set((cur.events || []).map((x) => x.id)), evBySig = new Map((cur.events || []).map((x) => [sigEvent(x), x.id]));
  const evMap = new Map(), events = [];
  for (const x of (Array.isArray(d.events) ? d.events : []).slice(0, 3000)) {
    if (!x?.id || !ID.test(x.id) || !DAY.test(x.date || '')) { stats.skipped++; continue; }
    if (evIds.has(x.id)) { evMap.set(x.id, x.id); stats.already++; continue; }
    const twin = evBySig.get(sigEvent(x));
    if (twin) { evMap.set(x.id, twin); stats.already++; continue; }
    const id = same ? x.id : newId(); evMap.set(x.id, id); evIds.add(id); evBySig.set(sigEvent(x), id);
    events.push({ ...x, id });
  }
  for (const e of events) if (e.meta?.seriesId && evMap.has(e.meta.seriesId)) e.meta = { ...e.meta, seriesId: evMap.get(e.meta.seriesId) };
  stats.events = events.length;
  /* Historique : nouveaux identifiants si besoin, lien vers le rendez-vous gardé, provenance (Strava, fichier) gardée. */
  const hIds = new Set((cur.history || []).map((x) => x.id)), hSigs = new Set((cur.history || []).map(sigHistory)), history = [];
  for (const x of (Array.isArray(d.history) ? d.history : []).slice(0, 3000)) {
    if (!x?.id || !ID.test(x.id) || !(x.startedAt > 0) || x.startedAt > now + 600000) { stats.skipped++; continue; }
    if (hIds.has(x.id) || hSigs.has(sigHistory(x))) { stats.already++; continue; }
    const ext = cleanExternal(externalOf(x)), agenda = x.data?.agenda, id = same ? x.id : newId();
    const data = { ...x.data, ...(ext ? { external: { ...ext, channel: 'file' } } : {}), ...(agenda?.eventId && evMap.has(agenda.eventId) ? { agenda: { ...agenda, eventId: evMap.get(agenda.eventId) } } : {}) };
    history.push({ id, sessionId: x.sessionId || null, sessionName: String(x.sessionName || 'Séance').slice(0, 100), startedAt: x.startedAt, durationSeconds: x.durationSeconds || 0, data });
    hIds.add(id); hSigs.add(sigHistory(x));
  }
  stats.history = history.length;
  return { seances, history, events, stats, same };
}
