# Livraison 8.32 — Mes séances

Refonte réalisée dans le dépôt `martinznt/Escalade`, à partir de `main` (base `98d75a8`), selon le cahier des charges fourni.
L’objectif est de rendre les actions courantes plus simples tout en conservant les possibilités et les calculs existants.
Ce document complète l’audit historique `FINAL_AUDIT.md` ; il ne reprend pas ses résultats comme preuves de cette livraison.

## Changements et parcours

- **Simple par défaut**, Avancée dans Paramètres › Affichage ou par commande explicite. Préférence synchronisée par compte, utilisable hors ligne. Changer le mode ne supprime ni réglages sportifs, ni historique, ni séances. Les mises en page déjà personnalisées restent accessibles.
- **Accueil simplifié** : contexte, rendez-vous du jour, recommandation expliquée, reprise, création et bilan. Les explications approfondies restent disponibles.
- **Express / Guidé / Avancé / Libre** dans Accueil et Bibliothèque. Express comprend les phrases courtes de durée et de priorité ; Guidé demande sport, durée, lieu et une envie facultative. Les trois assistants ouvrent le même créateur. Une activité libre peut aussi ouvrir le créateur, puis recevoir une séance associée après création. La structure reste à valider avant génération. Avancé conserve objectifs classés, phases, lieux, horaires, filtres, verrous, compromis et simulation.
- **Rendez-vous sportif récurrent sans séance détaillée obligatoire** : plusieurs jours par semaine, lieu libre, début, fin, heure et durée facultatives. La phrase « Tous les mardis et vendredis, escalade voie à Nicole Abar » prépare un formulaire ; elle ne sauvegarde rien à elle seule.
- **Prévu et réel distincts** : « Faite · bilan rapide », minutes réelles, effort facultatif, performance libre, note et activité avant/après. Voie et bloc produisent deux lignes réelles du journal, utilisées par l’analyse de charge. Compléter le même bilan ne le duplique pas. Les repères déclarés, l’ordre avant/après et le prévu sont visibles dans le journal ; une durée inconnue est affichée comme telle.
- **Exceptions datées** : déplacement, annulation, pas faite, modification d’une occurrence ou de la série à venir, arrêt à partir d’une date. Le passé et ses bilans restent conservés. Les rappels et exports utilisent ces mêmes exceptions.
- **Moi / Progrès** : entrées principales plus courtes, évolution personnelle mise en avant, détails accessibles. La mémoire d’entraînement montre origine, confiance, date et choix explicites modifiables. Une observation isolée ne crée pas une préférence durable.
- **Comparaison avec la séance précédente** dans le résultat du créateur : exercices conservés, prescriptions adaptées, ajouts et retraits, sans modifier l’ancienne séance.
- **Questionnaire du lecteur** : difficulté et commentaire directement accessibles ; détails repliés en mode simple.
- **Studio** : recherche et filtres ajoutés aux brouillons existants ; versions, vérifications, aperçu du contenu, publication, audit et rétablissement conservés.
- **IA et code** : Workers AI facultatif, modèle configurable, résultats de récit validés et présentés comme brouillons. Les PR préparées par l’IA admin sont des brouillons explicitement non validés tant que la CI n’a pas terminé. La CI comprend désormais les parcours Chromium.

## Architecture et données

Pas de framework, nouvelle dépendance de production ou second moteur sportif. Les vues Express et Guidé adaptent
les entrées du créateur existant ; les analyses utilisent toujours le même contexte métier. Des tests comparent les
résultats avec les deux modes à paramètres et graine identiques.

Les fonctions civiles de récurrence et d’exceptions sont dans `public/agenda.js`, utilisées par le navigateur,
le planning, les rappels serveur et les exports. Les dates ne sont pas calculées en ajoutant 24 heures locales :
les règles traversent les changements d’heure et les limites d’année. Les nouvelles règles conservent le fuseau IANA.

**Aucune migration SQL supplémentaire** : `SCHEMA_VERSION` reste 10. Les colonnes JSON existantes stockent :

| Donnée | Extension |
|---|---|
| Réglages | `interfaceMode`, absent = Simple ; un ancien client qui omet ce champ conserve la préférence serveur |
| Règle calendrier | `recurrence.days`, `timeZone`, `until` ; anciennes règles hebdomadaires toujours acceptées |
| Exception calendrier | `meta.seriesId`, `occurrenceDate`, `status`, `version` ; ligne distincte avec identifiant stable |
| Arrêt de série | `meta.stopFrom` ; le découpage ne change pas les occurrences antérieures |
| Bilan réel | `data.quickLog` et `data.agenda` ; snapshot du rendez-vous prévu, durée connue/inconnue et ordre avant/après |
| Mémoire corrigée | Collection `pref` existante ; les choix explicites passent par le circuit de synchronisation habituel |

Les API calendrier et historique, l’outbox, l’idempotence et l’isolation des comptes sont réutilisées.
Une version calendrier plus ancienne reçoit un conflit explicite. Après fermeture immédiate hors ligne,
les opérations durables sont réappliquées au cache local avant affichage : le bilan ne disparaît pas pendant
la temporisation d’écriture IndexedDB. Aucun exercice, maximum mesuré ou performance normalisée n’est déduit d’une note libre.

## Principaux fichiers

| Fichiers | Rôle |
|---|---|
| `public/agenda.js`, `public/views-agenda.js` | Règles, exceptions, bilans courts, exports et interface calendrier |
| `public/experience.js`, `public/views-experience.js` | Modes, création, mémoire et comparaison |
| `public/views-home.js`, `views-library.js`, `views-profile.js`, `views-progress.js`, `views-settings.js` | Entrées simplifiées et accès aux détails |
| `public/views-climbplan.js`, `player.js`, `brain.js`, `planning.js`, `commands.js` | Raccordement au moteur existant, questionnaire, recommandations et phrases courtes |
| `worker.js`, `server/agenda.js`, `server/push.js`, `public/ics.js` | Validation, interprétation facultative, rappels et agenda externe |
| `public/state.js`, `sw.js`, `news.js`, `app.js`, `style.css` | Persistance, cache 8.32, nouveautés, affichage et petits écrans |
| `server/codeedit.js`, `public/views-studio.js`, `.github/workflows/tests.yml` | PR brouillon, recherche du Studio et CI navigateur |
| `tests/agenda.test.mjs`, `agenda-ai.test.mjs`, `experience-e2e.mjs`, `sync.test.mjs`, `commands.test.mjs`, `codeedit.test.mjs` | Vérifications nouvelles et régressions |

## Couverture du cahier des charges

« Conservé » signifie que l’implémentation existante a été réutilisée et ses tests relancés, pas réécrite pour cette livraison.

| Sections | Réalisation / preuves principales |
|---|---|
| 0–1 : audit, architecture | Installation figée, tests de départ exécutés ; Worker/D1, modules ES, migrations et sécurité conservés |
| 2 : modes | Réglage utilisateur, synchronisation, absence d’effacement, parité des calculs ; `agenda.test`, `experience-e2e` |
| 3 : habitudes et réalité | Règles multi-jours, exceptions, bilans et activité secondaire ; `agenda.test`, `agenda-ai.test`, `experience-e2e`, `sync.test` |
| 4–5 : entrées et création | Wrappers Express/Guidé autour du créateur existant ; génération, exécution, bilan simple et parcours avancés testés |
| 6–7 : budget, arbitrage | Conservés dans les phases, objectifs classés, horaires et compromis ; `phaseplan`, `aimplan`, `phase`, `climbplan`, E2E |
| 8 : pourquoi et provenance | Explications existantes conservées et repliées ; `explain`, `v2engine`, `brain`, E2E |
| 9–11 : comparaison, mémoire, questionnaire | Diff sur prescriptions réelles, mémoire visible/corrigeable, questionnaire replié ; `agenda.test`, `player`, `experience-e2e` |
| 12–14 : accueil, bibliothèque, Moi | Présentation simplifiée, origines des séances, rubriques principales et détails ; E2E aux deux modes |
| 15–16 : grimpe et environnements | Systèmes, styles, maxima, cotations locales, matériel et lieux conservés ; `climb`, `grading`, `places`, `profile828`, E2E |
| 17–18 : progrès et aujourd’hui | Comparaisons personnelles simplifiées ; recommandation existante et prise en compte du réel ; `brain`, `coachbrain`, `planning`, E2E |
| 19–20 : adaptation, programmes, compétences | Conservés ; `adapt`, `live`, `program`, `paths`, `catchup`, E2E |
| 21–24 : anatomie, remplacements, phases, intentions | Conservés ; `body`, `model`, `generator`, `sfilter`, `aimplan`, `phaseplan`, `sports`, E2E |
| 25–26 : Lab, communauté | Conservés, contrôles et retrait des données privées ; `studio`, `community`, `global`, `group`, `duo-share`, E2E |
| 27–29 : administration, IA, bugs | Studio recherché, rôles, audit, rollback, PR brouillon et erreurs IA ; `studio`, `adminv2`, `assistant`, `codeedit`, `agenda-ai`, E2E |
| 30–31 : visuel, accessibilité | Affichage mobile 320/390 px, absence de débordement, labels et détails natifs ; `look`, `robustness`, E2E. Revue lecteurs d’écran et Safari réelle restant à faire |
| 32–35 : hors ligne, sécurité, robustesse, qualité | Cache/imports alignés, reprise immédiate, retries, propriétaires, conflits, provenance ; `assets`, `sync`, `outbox`, `migration`, `data`, `worker`, E2E |
| 36–37 : tests et parcours | Nouvelles suites ciblées et parcours navigateur simple ajoutés ; parcours avancés, multi-comptes, admin, invité et hors ligne conservés |
| 38–41 : contraintes et livraison | Réutilisation de l’existant, documentation, résultats ci-dessous et limites explicites |

## Vérifications de livraison

Vérifications terminées le 4 octobre 2026, sur les sources livrées :

| Commande / contrôle | Résultat |
|---|---|
| `npm run check` | Réussite, code de sortie 0 : syntaxe des modules et tests, JSON |
| `npm test` | Réussite, code de sortie 0 : 70 fichiers et 689 cas annoncés |
| `npm run test:e2e` avec Chromium système | Réussite, code de sortie 0 : 83 étapes existantes + 13 étapes nouvelles, soit 96 |
| `PW_EXEC=/usr/bin/chromium node tests/experience-e2e.mjs` | Réussite, code de sortie 0 : les 13 étapes, sans adaptateur extérieur |
| `git diff --check` | Réussite : aucun problème d’espacement signalé |
| Serveur local, `/api/version` | Réponse 200, version 8.32.0 |
| Wrangler 4.147.0, `deploy --keep-vars --dry-run` | Réussite : Worker compilé et 136 fichiers statiques recensés ; aucun envoi en production |

Les nouveaux tests couvrent aussi le récit voie + bloc, l’absence de double bilan, l’association d’une séance à une seule occurrence,
le repère déclaré visible dans le journal, la préférence corrigée après rechargement, l’exécution Express, le questionnaire simple,
les écrans à 320/390 px et un bilan sauvegardé hors ligne avant rechargement immédiat. Le journal ne confond pas durée inconnue et zéro minute.

Environnement : Node 24.19,
npm 11.9, Playwright 1.63, Chromium système 151. Le téléchargement du navigateur Playwright est bloqué par
le proxy cloud ; Chromium système a réellement exécuté les parcours. Le passage complet a utilisé un adaptateur de lancement extérieur au dépôt. Le paramètre `PW_EXEC` ajouté aux deux suites permet de les relancer directement dans cet environnement ; son parcours simple a également été exécuté séparément.

Le serveur E2E utilise le vrai Worker et le code client, avec D1 simulé par SQLite. Les réponses Workers AI et GitHub
sont simulées dans les tests pour rendre les cas invalides et les indisponibilités reproductibles.
Les services externes réels ne sont pas vérifiés par ces résultats locaux.

## Préparation du déploiement Cloudflare

Le 4 octobre 2026, la préparation de la mise en production a été exécutée avec Wrangler 4.147.0.
Le contrôle `deploy --keep-vars --dry-run` compile le Worker et recense les 136 fichiers de `public/`,
avec les bindings D1, KV, Workers AI, ASSETS et les métadonnées de version déclarés.
Un doublon ancien de la clé `shape` dans le schéma des réglages a été supprimé ; la règle effective
de validation corporelle reste celle utilisée auparavant. Les tests de données et de synchronisation
ont été relancés avec succès, ainsi que le contrôle de syntaxe.

**Publication directe par Wrangler bloquée par l’accès externe** : aucun jeton Cloudflare n’est disponible et
`wrangler whoami` indique une absence d’authentification. Les requêtes HTTPS vers l’API Cloudflare et les
deux adresses du site reçoivent un refus 403 du proxy réseau ; le site en ligne n’a donc pas été vérifié.

La configuration cloud préparée déclare le secret `CLOUDFLARE_API_TOKEN` pour `api.cloudflare.com`
et l’accès réseau à `api.cloudflare.com`, `seances-sport.pages.dev` et
`seances-entrainement.martin-zannet22.workers.dev`. Elle a été enregistrée comme brouillon ;
cela n’applique pas ces accès et ne déploie pas le site. Le propriétaire doit saisir le jeton
dans les paramètres sécurisés de l’environnement, enregistrer puis publier cette configuration.
Utiliser un jeton Cloudflare destiné à modifier les Workers et limité au compte hébergeant les ressources existantes.

Une fois les accès disponibles : vérifier l’authentification et les ressources existantes, puis exécuter
`npx wrangler@4.147.0 deploy --keep-vars`. Cette option conserve notamment les variables serveur
`MOVE_TO`, `AI_MODEL` et `GITHUB_REPO` déjà configurées. Garder les identifiants D1 et KV du dépôt.
Après publication, vérifier `/api/version` (8.32.0), `/api/health`, les nouveaux modules statiques,
la mise à jour PWA et les fonctions connectées utilisées. Aucun Worker, secret ou stockage de production
n’a été modifié pendant cette préparation.

Le propriétaire a ensuite demandé l’envoi des sources sur `main` du dépôt `martinznt/Escalade`
pour utiliser son intégration de déploiement automatique Cloudflare. Cette voie utilise l’authentification
GitHub du projet ; elle ne nécessite pas de jeton Cloudflare dans cet environnement.
L’envoi doit conserver l’historique distant (sans push forcé). Le résultat des vérifications GitHub
et du déploiement Cloudflare doit être contrôlé séparément de la réussite de cet envoi.

## Configuration et actions restantes

- Vérifier les bindings existants `DB`, `ASSETS`, `SEANCES_KV`, `AI` dans le compte Cloudflare cible.
- Conserver/configurer `EDIT_PASSWORD` comme secret Worker ; `INVITE_CODE` reste facultatif.
- `AI_MODEL` est facultatif. Workers AI dépend de l’accès au modèle et du quota du compte Cloudflare ; gratuité illimitée et exactitude parfaite ne peuvent pas être promises.
- Pour les PR depuis l’administration : variable serveur `GITHUB_REPO=martinznt/Escalade` et secret `GITHUB_TOKEN` limité au dépôt, droits Contents et Pull requests. Sans ces accès, téléchargement du patch.
- Les notifications push utilisent les secrets VAPID déjà prévus par le dépôt. Leur permission reste accordée par le navigateur de chaque appareil.
- Activer sur GitHub la protection de branche et rendre Tests obligatoire pour empêcher une fusion avec CI en échec. Le code de l’app ne fusionne et ne déploie jamais les PR.
- Publication demandée sur `main` pour déclencher l’intégration Cloudflare déjà configurée par le propriétaire. Les contrôles locaux sont réussis ; le statut de la CI et de la mise en production doit aussi être vérifié sur les services distants.

## Limites vérifiables

- Les tests ne garantissent pas l’absence de tout bug. La durée de saisie 10–30 secondes est un objectif UX, pas une mesure réalisée sur un panel d’utilisateurs.
- Le parseur local comprend des formulations sportives courantes ; une phrase inconnue laisse le formulaire disponible. Workers AI peut se tromper, et son brouillon exige une confirmation.
- Les performances libres restent déclarées. Les cotations détaillées, essais et métriques normalisées se saisissent avec le carnet et les écrans avancés existants.
- Les observations de formats sont des hypothèses ; les préférences explicites d’exercices influencent le moteur. Confirmer une observation de format ne crée pas à elle seule une prescription physiologique ou un maximum mesuré.
- Modifier toute une série concerne ses occurrences à venir afin de préserver le passé. Les anciennes exceptions futures restent stockées ; une nouvelle règle les remplace à compter de sa date de début.
- Le mode simple conserve une ancienne mise en page personnalisée pour respecter les choix déjà enregistrés ; son propriétaire peut la modifier avec les outils existants.
- Les rappels push sont globaux par appareil/type et ne sont pas programmés individuellement à l’heure de chaque activité. L’export iCalendar propose ses alarmes horaires. L’abonnement dépend de la fréquence de rafraîchissement choisie par l’agenda externe.
- L’assistant code prépare de petites modifications d’interface dans une liste de fichiers autorisés ; il ne réalise pas une refonte arbitraire du serveur ou de la base. Son aperçu est un diff et un résumé, pas un déploiement temporaire de chaque branche.
- La validation syntaxe/tests des propositions de code s’exécute dans la CI après création de la PR brouillon. Une PR n’est pas déclarée validée avant cette exécution et sa relecture.
- Pas de déploiement réel vérifié, test live du modèle, jeton GitHub, notification sur téléphone, import Apple/Outlook, Safari, lecteur d’écran ou test de charge de production dans cet environnement.

## Checklist de déploiement

- [x] Vérifications locales terminées et résultats consignés ci-dessus.
- [ ] Relire le diff de livraison avant mise en production.
- [ ] Vérifier l’environnement Cloudflare, les bindings et les secrets serveur.
- [ ] Exécuter la CI sur la branche de livraison et contrôler son résultat.
- [ ] Essayer sur une préproduction les comptes existants, Workers AI et les notifications utilisées.
- [ ] Vérifier un téléphone réel et l’agenda externe utilisé.
- [ ] Valider puis déployer ; contrôler `/api/version`, la mise à jour PWA et un bilan synchronisé.

Cette checklist concerne le déploiement réel ; elle ne prétend pas que les actions externes ont déjà été effectuées.

L’archive de livraison contient les sources actuelles, la documentation et les journaux des contrôles réussis dans `VERIFICATION/`. Elle exclut `node_modules`, les métadonnées Git et l’ancienne archive `site sport final.zip`.
