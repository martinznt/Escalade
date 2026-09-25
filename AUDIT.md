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

## Audit complet v7.1 — deuxième passe (recherche active de bugs non couverts par les tests)
Contexte : l'utilisateur a explicitement demandé de ne pas se fier aux tests existants comme preuve de fiabilité, et de chercher activement des erreurs qu'ils ne détecteraient pas. Résultat : 7 problèmes réels trouvés et corrigés, tous avec un test qui les aurait détectés.

**A. Erreurs trouvées et corrigées :**
1. **Critique — app cassée au chargement** : `worker.js` bloquait `/commands.js` et `/outbox.js` (absents de `PUBLIC_FILES`) alors qu'`app.js` les importe. Le Worker aurait renvoyé 404 sur ces imports ES module, empêchant l'application de démarrer, même en ligne, pour tout le monde.
2. Le Service Worker ne précachait pas non plus ces deux fichiers (`SHELL` incomplet) — corrigé, version de cache incrémentée (`v7-1`) pour forcer un précache propre.
3. **Hors périmètre V1** : Basketball et Cyclisme étaient préconfigurés dans `sports.js` (`ACTIVITY_PRESETS`), explicitement interdit par le cahier des charges pour cette version. Retirés ; création manuelle en activité personnalisée toujours possible.
4. **Race condition — rate limit login** : le contrôle du quota se faisait par une lecture séparée de l'incrément, et l'incrément n'avait lieu qu'après un échec ; une rafale de requêtes concurrentes pouvait dépasser la limite avant que le compteur ne les rattrape. Corrigé en réutilisant le motif atomique déjà utilisé pour l'inscription/le suivi (incrément d'abord, décision sur la valeur déjà incrémentée).
5. **Silence de données — historique** : `historyPost` utilisait `INSERT OR IGNORE` sans vérifier si l'écriture avait réellement eu lieu ; une collision d'identifiant avec un autre utilisateur (risque réel mais très faible avec `crypto.randomUUID`) aurait renvoyé `ok:true` sans rien enregistrer. Corrigé en reprenant le motif déjà éprouvé de `calendarPost` (conflit scopé au bon `user_id` + vérification de `meta.changes`).
6. **Race condition — inscription concurrente sur le même pseudo** : protégée en base par la contrainte `UNIQUE`, mais l'erreur remontait en 500 générique au lieu d'un 409 clair pour le perdant de la course. Corrigé.
7. **Perte de données confirmée — objectifs (goals)** : `cleanSettings()` est une liste blanche stricte qui ne mentionnait pas `goals`. Résultat : le serveur ne stockait *jamais* les objectifs de l'utilisateur, même si la mémoire locale du client les gardait temporairement par un heureux hasard de fusion d'objets (`{...local, ...serveur}` ne supprime pas une clé absente côté serveur). Concrètement : changement d'appareil, réinstallation, ou vidage du stockage local = objectifs perdus silencieusement, sans aucune erreur visible. C'est très exactement le type de bug que l'utilisateur avait demandé de chercher en priorité (préservation des objectifs). Corrigé : `goals` est validé et conservé dans `cleanSettings()`. Test ajouté qui vérifie un vrai aller-retour serveur (pas seulement la fusion en mémoire côté client), qui aurait détecté ce bug immédiatement.

**Bugs trouvés dans mes propres tests ajoutés en cours d'audit (corrigés avant livraison) :** deux tests de concurrence consommaient sans le savoir le quota partagé de rate-limit d'inscription (clé IP commune `local`), faisant échouer un test sans rapport plus loin dans le fichier ; corrigé en isolant leurs IP simulées (`CF-Connecting-IP` de test).

**B. Vérifié activement et confirmé correct (pas des bugs, mais explicitement demandé par l'utilisateur) :**
- XSS : tous les usages de `raw()` (contournement de l'échappement) audités un par un — aucun ne transporte de texte utilisateur non échappé (SVG silhouette : uniquement des coordonnées fixes ; graphique de progression : `unit` toujours l'un de 3 littéraux fixes, jamais le champ libre saisi par l'utilisateur). Tout le reste passe par le moteur de templates `h()` qui échappe automatiquement, y compris dans les attributs HTML (`"` → `&quot;`).
- Cookie de session : `HttpOnly`, `SameSite=Lax`, `Secure` conditionnel — correct.
- Fixation de session : `createSession()` génère toujours un token aléatoire de 256 bits neuf, jamais dérivé d'un cookie préexistant ; token stocké haché (SHA), jamais en clair.
- Suppression de compte : toutes les tables avec `user_id` sont bien nettoyées. Vérifié via la documentation officielle Cloudflare que D1 applique les clés étrangères par défaut (équivalent `PRAGMA foreign_keys=ON` systématique) — les `ON DELETE CASCADE`/`SET NULL` du schéma sont donc réellement actifs en production ; le nettoyage manuel explicite est une redondance bénéfique, pas un correctif nécessaire.
- Revendication de migration legacy (`migrateLegacyForFirstUser`) et demandes de suivi (`follow`) : déjà protégées correctement contre les races via `meta.changes`.
- Nettoyage des anciens caches du Service Worker à l'activation : correct.
- Aucun `TODO`/`FIXME`/`console.log` oublié dans le code.

**Observations sans impact (documentées, non « corrigées »)** : `ACTIVITY_EXERCISES.basketball` (exercices spécifiques) reste présent malgré le retrait du préréglage — inoffensif, préserve les utilisateurs qui l'auraient déjà, mais inaccessible en création neuve. Les colonnes D1 `favorites_json` et (depuis ce correctif) `goals_json` ne sont jamais lues/écrites directement par le code actuel — vestiges d'un découpage de schéma plus ancien ; les objectifs transitent en réalité par `settings_json`. Aucune de ces observations ne cause de perte ou d'incohérence de données.

**C. Erreurs restantes / non couvertes cette passe** : audit UI mobile pas fait de façon systématique (pas de navigateur réel disponible ici) ; pas de nouvelle recherche de code mort au-delà de ce qui précède ; le test E2E Chromium reste non exécuté (Playwright indisponible dans cet environnement) — voir plus haut.

## Session de travail v7.1 — première passe (Pourquoi, planification, commandes naturelles, offline)
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

**Bug trouvé après coup (vérification demandée par l'utilisateur) :** dans `diagOutboxHtml()`, le paragraphe « opération en tête de file » était construit avec un simple template JS au lieu du moteur `h` maison, qui échappe automatiquement tout ce qui n'est pas explicitement marqué comme HTML. Résultat : la balise `<p>` se serait affichée comme texte brut (`&lt;p class=...&gt;`) au lieu d'un paragraphe, dans l'écran Diagnostic uniquement. Corrigé, puis vérifié de deux façons : (1) recherche dans tout `app.js` du même motif (backtick HTML non protégé par `h` ni `raw()`) — aucune autre occurrence ; (2) exécution réelle hors navigateur du texte source de `vTodaySuggestions`, `diagOutboxHtml` et du bloc « Pourquoi » de `vGenResult`, avec le vrai moteur de template et des données réalistes (file vide/pleine, historique vide/avec séance dure, raisons vides/remplies) : sortie HTML correcte dans tous les cas testés. Cela reste une vérification ciblée sur le code ajouté cette session, pas un remplacement du test E2E navigateur.
