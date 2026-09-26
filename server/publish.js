// server/publish.js — préparation d'une séance avant publication (bibliothèque commune ou séance publique).
import { normalizeSession } from '../public/shared.js';

/**
 * Publication : seules les données de la séance sont gardées. Retirés : notes de progression personnelles
 * (« Dernière fois : … »), raisons liées au profil, explications du générateur, contexte privé (lieu, objectif),
 * charges chiffrées issues des performances de l'auteur. Rien de l'historique ni des performances n'est copié.
 */
export function sanitizeForPublication(s) {
  const n = normalizeSession(s);
  const exercises = n.exercises.map((e) => ({ ...e, id: e.id, note: '', why: '', isNew: false, load: /^\s*[+-]?\d+([.,]\d+)?\s*kg\s*$/i.test(e.load) ? '' : e.load }));
  return normalizeSession({
    ...n, exercises, explain: null, origin: null, template: false, archived: false,
    notes: n.notes.filter((x) => !/^pourquoi/i.test(x.title) && !/^analyse du profil/i.test(x.title)),
    context: { equipment: n.context.equipment, plannedMin: n.context.plannedMin || n.durationMin },
  });
}
