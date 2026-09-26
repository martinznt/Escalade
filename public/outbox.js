// outbox.js — décisions de la file d'attente hors ligne (pure, sans DOM ni réseau : tests/outbox.test.mjs).
// app.js exécute les effets (appel API, retrait de la file, affichage) ; ce module décide seulement.
//
// Garanties :
//  - chaque opération porte un identifiant unique (opId) envoyé au serveur dans l'en-tête X-Op-Id : si la réponse
//    se perd après un succès serveur, le rejeu renvoie la réponse enregistrée, sans doublon (voir worker.js) ;
//  - l'ordre est préservé : une erreur transitoire met la file en pause (nouvel essai plus tard, délai croissant) ;
//  - une erreur définitive retire l'opération de la file SANS la perdre : elle est conservée dans « actions en échec »,
//    visible dans le diagnostic, avec « Réessayer » ou « Abandonner » ;
//  - une erreur serveur répétée au-delà du seuil libère la file (même traitement, jamais un succès silencieux).

export const MAX_SERVER_ATTEMPTS = 6;
export const newOpId = () => 'op-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

/** Délai avant le prochain essai : 2 s, 4 s, 8 s… plafonné à 5 min. */
export function retryDelay(attempts) { return Math.min(300000, 2000 * 2 ** Math.max(0, (attempts || 1) - 1)); }

/**
 * op : { method, path, body, attempts, opId } ; error : { offline, status, message }.
 * Retourne :
 *   { action: 'retry-later', attempts, reason, delay } → transitoire : on s'arrête, on réessaie plus tard (ordre préservé).
 *   { action: 'pause-auth', reason }                   → session expirée : on attend la reconnexion (rien n'est perdu).
 *   { action: 'drop-failed', reason, attempts }        → définitive : retirée de la file, conservée en échec.
 *   { action: 'drop-poisoned', reason, attempts }      → 5xx répétés : retirée de la file, conservée en échec.
 */
export function decideOutboxError(op, error) {
  const attempts = (op?.attempts || 0) + 1;
  if (error?.offline) return { action: 'retry-later', attempts: op?.attempts || 0, reason: 'hors-ligne', delay: 0 };
  if (error?.status === 401) return { action: 'pause-auth', attempts: op?.attempts || 0, reason: 'session' };
  if (error?.status === 429 || error?.status === 408 || error?.status === 425) return { action: 'retry-later', attempts: op?.attempts || 0, reason: 'limite-de-debit', delay: retryDelay(attempts + 2) };
  if (error?.status >= 500) {
    if (attempts >= MAX_SERVER_ATTEMPTS) return { action: 'drop-poisoned', attempts, reason: `Écartée après ${attempts} échecs serveur répétés (${op?.method} ${op?.path}).` };
    return { action: 'retry-later', attempts, reason: 'erreur-serveur', delay: retryDelay(attempts) };
  }
  if (error?.status === 409) return { action: 'drop-failed', attempts, reason: `Conflit : ${error?.message || 'élément déjà existant ou modifié ailleurs'}` };
  return { action: 'drop-failed', attempts, reason: error?.message || 'Erreur' };
}

/** Libellé lisible d'une opération (diagnostic sur mobile). */
export function describeOp(op) {
  const p = String(op?.path || '');
  const m = { POST: 'Enregistrement', PUT: 'Modification', DELETE: 'Suppression' }[op?.method] || op?.method;
  const what = p.startsWith('/api/history') ? 'séance réalisée' : p.startsWith('/api/calendar') ? 'événement du calendrier' : p.startsWith('/api/items') ? 'données du profil'
    : p.startsWith('/api/settings') ? 'réglages' : p.startsWith('/api/exercises/personal') ? 'exercice personnel' : p.startsWith('/api/shared') ? 'séance partagée' : p.startsWith('/api/bugs') ? 'signalement' : p;
  return `${m} — ${what}`;
}
