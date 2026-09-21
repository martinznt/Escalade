# Audit final — Séances entraînement v7.0

## Validation effectuée
- Syntaxe Node vérifiée sur `worker.js`, `schema.js` et tous les JavaScript de `public/`.
- 32 tests moteur historiques OK.
- 33 tests Worker/sécurité OK.
- 5 tests supplémentaires du profil multi-activité OK.
- Migration legacy OK.
- Le rate-limit a été rendu atomique côté compteur SQLite et les routes de modification/suppression vérifient maintenant réellement `changes`.
- Les erreurs HTTP définitives de la file offline sont conservées dans `failedOutbox` au lieu d'être supprimées silencieusement.
- Le doublon de propriété `muscles` dans le nettoyage de l'historique a été supprimé.
- Nouveau `sports.js` ajouté au Worker et au shell PWA.

## Fonctionnalités v7.0
- Profil sportif généraliste et extensible.
- Activités natives : bloc, voie, musculation/force, course, basketball, cyclisme, natation.
- Ajout d'activités personnalisées.
- Génération automatique de catégories initiales pour une activité personnalisée.
- Ajout, modification et suppression d'informations/performance.
- Détection locale du domaine d'une information (ex. max tractions → tirage, pompes → poussée).
- Analyse interne des domaines pour faire ressortir forces et axes de travail.
- Générateur permettant de privilégier les points faibles ou les points forts.
- Générateur générique pour les activités natives et personnalisées ; pour une activité personnalisée, les exercices sont construits à partir des domaines configurés.
- Conservation du générateur escalade existant et de ses contraintes de niveau, matériel, récupération et prévention.

## Limitation de validation
Le test E2E Chromium existe dans `tests/e2e.mjs`, mais Playwright n'a pas pu être installé dans l'environnement d'audit avant expiration du délai réseau. Il n'est donc pas honnête de déclarer le parcours navigateur exécuté ici. Les tests unitaires/intégration disponibles ont tous été exécutés et passent.
