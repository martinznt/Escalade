// outbox.js — décide quoi faire quand une opération de la file d'attente hors-ligne échoue.
// Séparé de app.js pour rester pur (pas de DOM, pas de réseau) et donc testable avec Node
// (tests/outbox.test.mjs). app.js exécute les effets (retirer de la file, appeler l'API,
// afficher un toast) ; ce module ne fait que décider.

// Après ce nombre de tentatives consécutives en erreur serveur (5xx), on cesse de rejouer
// l'opération : mieux vaut prévenir l'utilisateur et libérer la file que de bloquer toutes
// les opérations suivantes indéfiniment derrière une opération qui ne passera jamais.
export const MAX_SERVER_ATTEMPTS = 6;

/**
 * op : { method, path, body, attempts } — l'opération en tête de file qui vient d'échouer.
 * error : { offline, status, message } — l'erreur renvoyée par l'appel réseau/API.
 * Retourne :
 *   { action: 'retry-later', attempts }        → erreur transitoire (hors-ligne, session, quota, ou
 *                                                 erreur serveur sous le seuil) : on rejoue plus tard,
 *                                                 la file s'arrête là pour l'instant (ordre préservé).
 *   { action: 'drop-failed', reason }           → erreur définitive (ex. donnée invalide) : on retire
 *                                                 l'opération, on continue avec la suivante.
 *   { action: 'drop-poisoned', reason, attempts }→ erreur serveur répétée au-delà du seuil : on retire
 *                                                 l'opération pour ne pas bloquer la file, en le signalant
 *                                                 clairement (ce n'est pas un succès silencieux).
 */
export function decideOutboxError(op, error) {
  const attempts = (op?.attempts || 0) + 1;
  if (error?.offline) return { action: 'retry-later', attempts: op?.attempts || 0, reason: 'hors-ligne' };
  if (error?.status === 401) return { action: 'retry-later', attempts: op?.attempts || 0, reason: 'session' };
  if (error?.status === 429) return { action: 'retry-later', attempts: op?.attempts || 0, reason: 'limite-de-debit' };
  if (error?.status >= 500) {
    if (attempts >= MAX_SERVER_ATTEMPTS) {
      return { action: 'drop-poisoned', attempts, reason: `Écartée après ${attempts} échecs serveur répétés (${op?.method} ${op?.path}).` };
    }
    return { action: 'retry-later', attempts, reason: 'erreur-serveur' };
  }
  return { action: 'drop-failed', attempts, reason: error?.message || 'Erreur' };
}
