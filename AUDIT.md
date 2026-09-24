# Audit final — Séances entraînement v8.1

## Validation V8 effectuée
- Syntaxe Node vérifiée sur `worker.js`, `schema.js` et tous les JavaScript de `public/`.
- 39 vérifications moteur OK.
- 34 vérifications Worker/sécurité OK.
- 6 vérifications du profil multi-activité OK.
- Migration legacy OK.
- Le rate-limit a été rendu atomique côté compteur SQLite et les routes de modification/suppression vérifient maintenant réellement `changes`.
- Les erreurs HTTP définitives de la file offline sont conservées dans `failedOutbox` au lieu d'être supprimées silencieusement.
- Le doublon de propriété `muscles` dans le nettoyage de l'historique a été supprimé.
- `commands.js` et `outbox.js` sont maintenant explicitement servis par le Worker et présents dans le shell PWA.

## Fonctionnalités V8
- Profil sportif généraliste et extensible.
- Activités natives V1 : bloc, voie, musculation/force, course et natation. Basketball et cyclisme ne sont pas préconfigurés.
- Ajout d'activités personnalisées.
- Génération automatique de catégories initiales pour une activité personnalisée.
- Ajout, modification et suppression d'informations/performance.
- Détection locale du domaine d'une information (ex. max tractions → tirage, pompes → poussée).
- Analyse interne des domaines pour faire ressortir forces et axes de travail.
- Générateur permettant de privilégier les points faibles ou les points forts.
- Générateur générique pour les activités natives et personnalisées ; pour une activité personnalisée, les exercices sont construits à partir des domaines configurés.
- Conservation du générateur escalade existant et de ses contraintes de niveau, matériel, récupération et prévention.

## Limitation de validation
Le test E2E Chromium existe dans `tests/e2e.mjs`, mais Playwright n'est pas installé dans cet environnement. Le test navigateur réel n'a donc pas été exécuté ici. Tous les tests Node disponibles et la vérification syntaxique ont été exécutés avec succès.

## Corrections V8 après audit approfondi
Objectif : avancer sur plusieurs points du cahier des charges (§8 Pourquoi, §11 planification, §12 offline, §21 commandes naturelles) sans tout refaire d'un coup, en testant à chaque étape.

**Vérifié et implémenté :**
- §8 (le générateur doit expliquer ses choix) : `meta.why` était déjà calculé mais jamais affiché. Corrigé.
- §11 (« Que faire aujourd'hui ? », plusieurs options avec raisons plutôt qu'un choix imposé) : `suggestToday()` ajoutée, 6 tests, branchée sur l'accueil.
- §21 (commandes naturelles, déterministe, sans IA externe) : `parseCommand()` reconnaît 5 formulations explicites du cahier des charges ; toute phrase non reconnue retourne `unknown` sans exécuter d'action inventée ; l'action destructive (« supprime ma dernière séance ») demande confirmation.
- §12 (offline/idempotence, « aucune opération ne doit disparaître silencieusement ») : investigation ciblée sur `commonAdd`/`personalAdd` (routes qui semblaient les plus exposées à un doublon en cas de perte de la réponse serveur après un succès). **Constat : déjà protégées** — contraintes `UNIQUE` en base + conversion automatique des violations en `409 Cet élément existe déjà` côté Worker (`worker.js`, catch autour de `routeAuthed`). Pas de bug de duplication trouvé sur ce chemin. En revanche, aucune opération n'avait de plafond de tentatives : une erreur serveur (5xx) vraiment persistante aurait bloqué indéfiniment toute la file derrière elle, sans que l'utilisateur puisse le voir autrement qu'un point rouge générique. Corrigé : `public/outbox.js` (pur, testé) écarte une opération après 6 échecs serveur consécutifs et le Diagnostic affiche maintenant l'opération en tête de file et les dernières actions écartées, y compris hors ligne.

**Explicitement pas fait cette session (pour rester honnête plutôt que de prétendre une couverture complète) :**
- §4 : pas de distinction visuelle systématique déclaré/mesuré/estimé/recommandé dans l'UI.
- §10/§11 : records et comparaison avant/après pas formalisés en tant qu'objets dédiés.
- §13 : pas d'audit sécurité supplémentaire au-delà des 33 tests Worker existants (pas de nouveau test de rupture réseau en cours de requête, fermeture pendant sync, etc. — au-delà du plafond de tentatives ajouté ci-dessus).
- §21 : commandes naturelles limitées à 5 formulations explicites ; pas de généralisation à des tournures libres.
- Le test E2E Chromium reste non exécuté (Playwright indisponible dans cet environnement).

## Corrections V8 effectuées
- Correction du routage statique : `commands.js` et `outbox.js` sont désormais accessibles au navigateur.
- Correction du shell PWA : mêmes modules ajoutés au cache initial et cache versionné en V8.1
- Persistance serveur des `goals` et `climbingLogs`, avec compatibilité avec l'ancien champ `goals_json`.
- Rate-limit réorganisé autour d'une écriture SQL atomique unique pour éviter la course entre lecture et incrément.
- Protection contre les collisions concurrentes de pseudo/e-mail lors de l'inscription.
- Quotas calendrier/bibliothèque corrigés sur les bornes exactes.
- Séances futures ignorées dans les statistiques, charges et analyses de récupération.
- Chronomètre : la durée de travail d'une série chronométrée exclut désormais les pauses.
- Export JSON et interface mis à jour en V8.1
- Basketball et cyclisme retirés des presets préconfigurés de cette V1.
- Générateur générique : évite maintenant de dupliquer artificiellement des exercices lorsqu'il n'existe pas assez de domaines/exercices.
- Ajout de tests couvrant ces corrections.

## Validation finale V8
- `npm run check` : OK.
- `npm test` : **101 vérifications internes, 0 échec**.
- `npm run test:e2e` : non exécutable dans cet environnement car le module Playwright n'est pas installé.
