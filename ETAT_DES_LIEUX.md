# État des lieux — version nettoyée

Corrections incluses :
- séparation entre vraie perte réseau et erreur API dans la PWA ;
- session expirée traitée comme une reconnexion, pas comme un mode hors-ligne ;
- synchronisation auxiliaire indépendante (historique, métriques, exercices, calendrier) ;
- file d'attente locale des historiques quand la connexion est absente ;
- conservation de toutes les séries d'une séance, exercice par exercice ;
- correction du `user_id` manquant dans le profil public ;
- validation/normalisation de plusieurs données serveur ;
- cache local plus cohérent ;
- service worker versionné et limité aux ressources du même domaine ;
- tests Vitest remplacés par de vrais tests de règles de base ;
- versions `vitest` et `wrangler` figées pour des déploiements reproductibles.

Le fichier `worker.js` est syntaxiquement valide, le script JavaScript de `index.html` est syntaxiquement valide et `sw.js` est syntaxiquement valide.
