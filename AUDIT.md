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

## Session de travail v7.1 — suite du cahier des charges « ultra fiable »
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
