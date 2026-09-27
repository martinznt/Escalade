# FINAL_AUDIT — Séances entraînement v8.2.1

Rapport de fin de mission : audit de l'existant (v7.2), corrections, implémentation V1 + V2, tests réellement exécutés
et limitations restantes. Toutes les commandes citées ont été lancées sur la version livrée.

---

## 1. Architecture finale

**Hébergement** : un Cloudflare Worker (`worker.js`, `run_worker_first`) sert l'API et une liste blanche explicite de
fichiers statiques de `public/` (`PUBLIC_FILES`). Tout autre chemin (code serveur, tests, configuration) répond 404.
Données : D1 (SQLite) ; l'ancien espace KV `SEANCES_KV` est seulement lu pour la reprise de la toute première version.

**Serveur**

| Fichier | Rôle |
|---|---|
| `worker.js` | Routage, authentification par compte (sessions en cookie `HttpOnly; Secure; SameSite`), CSRF (Origin / Sec-Fetch-Site + JSON obligatoire → 415), limites de taille (413), limites de débit atomiques (`UPSERT … RETURNING` avant décision), idempotence (`X-Op-Id` + table `op_log`), CSP stricte, HSTS, erreurs génériques sans détail interne. |
| `schema.js` | Tables D1 et colonnes ajoutées (`SCHEMA_VERSION = 8`) ; création / mise à niveau automatique et idempotente. |
| `server/publish.js` | Nettoyage d'une séance avant publication (notes privées, charges personnelles, explications basées sur le profil, contexte). |
| `server/migrate.js` | Conversion des anciens réglages v5–v7 (maxima, journal d'escalade, objectifs, activités, métriques) en données structurées V2. |

**Client** (modules ES natifs, aucune dépendance, aucun service externe d'IA)

| Couche | Fichiers |
|---|---|
| Démarrage, erreurs | `index.html`, `boot.js` (écran d'erreur lisible, code `BOOT-FAIL`, « Recharger » / « Vider le cache et recharger », délai 15 s : jamais d'écran blanc silencieux) |
| Interface | `app.js` (5 onglets : Accueil, Progrès, Bibliothèque, Profil, Paramètres ; routage `#/onglet/sous-page/param`), `views-home.js`, `views-progress.js`, `views-library.js`, `views-profile.js`, `views-settings.js`, `player.js` (mode séance), `ui.js` (échappement HTML systématique par gabarit `h```), `anatomy.js` |
| État, hors ligne | `state.js` (cache IndexedDB + repli localStorage, écriture synchrone immédiate des opérations en attente, file ordonnée, synchronisation), `outbox.js` (décisions de la file), `sw.js` |
| Modèle et analyses | `model.js` (28 capacités, 23 muscles FR face/dos, ~42 métriques avec repères indicatifs, 6 activités natives, 6 figures avec critères, étapes et chemins), `library.js` (143 exercices annotés : capacités pondérées, muscles principaux / secondaires, matériel, difficulté, schéma de mouvement), `brain.js` (Training Brain), `generator.js` + `engine.js` (générateurs), `grading.js` (cotations), `estimate.js`, `csv.js`, `search.js`, `commands.js`, `items.js` (schéma partagé serveur / client), `shared.js` |

**Modèle de données personnelles V2** : table `user_items` (collection, id, données JSON, date client `u`, date serveur,
suppression logique). Collections : activité, catégorie, métrique, performance, objectif, ascension, système de cotation,
style, environnement, préférence, niveau déclaré, expérience Lab, note de journal, remplacement, décision d'habitude,
configuration. Fusion élément par élément « dernière modification gagnante » ; une écriture plus ancienne est renvoyée
en conflit (jamais écrasée en silence). Le même schéma (`items.js`) nettoie les données côté serveur et côté client.

---

## 2. Migrations appliquées

Exécutées automatiquement au premier appel du Worker, une fois par instance de base (idempotentes, ajouts uniquement) :

- Nouvelles tables : `user_items` (+ index de synchronisation), `shared_sessions` (bibliothèque commune et séances
  publiques, `owner_id` → `SET NULL` à la suppression du compte), `bug_reports` (+ index de statut), `op_log`.
- Nouvelles colonnes : `users.is_admin`, `users.admin_since`, `user_data.v2_migrated`, `profiles.bio`, `profiles.share_json`.
- Mise à niveau des anciennes tables `profiles` / `follows` (v7) : reprise des données, **abonnements orphelins ignorés**
  (ils faisaient échouer toute la mise à niveau par contrainte de clé étrangère — bogue trouvé pendant l'audit).
- Ancienne table `profiles` avec `display_name NOT NULL` : création de profil compatible (bogue trouvé pendant l'audit).
- Données : au premier chargement V2 d'un compte, ses anciens réglages sont convertis en items (identifiants
  déterministes : relancer ne duplique rien) ; les anciens réglages sont **conservés** tels quels.
- La bibliothèque commune n'est **jamais** préremplie (l'ancien `seedCommon` n'existe plus).

---

## 3. Tests exécutés

| Commande | Contenu | Résultat |
|---|---|---|
| `npm run check` | `node --check` sur `worker.js`, `schema.js`, `server/*.js`, `public/*.js`, `tests/*.mjs` + validation de `manifest.json`, `wrangler.json`, `package.json` | OK |
| `tests/assets.test.mjs` | Graphe d'imports : chaque module importé existe, est servi par le Worker **et** précaché par le Service Worker ; listes identiques ; aucun fichier public orphelin ; versions alignées ; aucun secret dans `public/` | 13 OK |
| `tests/worker.test.mjs` | Intégration Worker + D1 : comptes, sessions, données, historique, calendrier, bibliothèques, droits, admin, signalements, social, sécurité | 49 OK |
| `tests/migration.test.mjs` | Ancienne base v7, anciens réglages, KV v1, idempotence | 10 OK |
| `tests/sync.test.mjs` | Vrai client `state.js` branché sur le vrai Worker : hors ligne, fermeture / réouverture, réponse perdue, 400, 401, 500, conflits d'items, suppression hors ligne, séance hors ligne | 10 OK |
| `tests/brain.test.mjs` | Analyses : états de capacités, sources, confiance, objectifs, blocages, chemins, régularité, 7/30/90, charge, préférences apprises, habitudes, records, timeline, journal, atypiques, « pourquoi », « et si », jamais essayé, aujourd'hui, comprendre mon profil, graphe, Lab | 30 OK |
| `tests/generator.test.mjs` | Simulation, priorités, matériel, durées 5/10/12/15/20/30/45/60, mode léger, gêne aux doigts, préférences, explications, charges jamais inventées, adaptation de durée, alternatives, remplacement, matériel dynamique | 28 OK |
| `tests/grading.test.mjs` | Cotations et styles (liste du §18) | 11 OK |
| `tests/model.test.mjs` | Cohérence du modèle sémantique et du catalogue | 12 OK |
| `tests/data.test.mjs` | CSV (séparateurs, dates, correspondance, validation, doublons), recherche classique / intelligente, estimation de niveau, nettoyage des items | 16 OK |
| `tests/commands.test.mjs` | Commandes en langage naturel | 21 OK |
| `tests/outbox.test.mjs` | Décisions de la file hors ligne | 13 OK |
| `tests/player.test.mjs` | Horloge du mode séance (pauses) | 5 OK |
| `tests/engine.test.mjs` | Générateur d'escalade historique et import de texte | 38 OK |
| `npm run test:e2e` | Navigateur réel Chromium (Playwright), téléphone 390×844 | 36 étapes OK |

Total (8.0.1 : + test de robustesse) : **256 vérifications unitaires / intégration + 36 étapes E2E, toutes vertes.**
En plus : une visite automatisée de 28 écrans + onglets d'objectif avec données réalistes, qui échoue si une page
contient « [object Object] », « undefined », « NaN », des entités HTML doublement échappées ou un défilement horizontal
(aucune anomalie).

Tests anciens corrigés parce qu'ils validaient un mauvais comportement : le test Worker exigeait un exercice commun
« Tractions » préchargé (interdit) ; le test des commandes attendait « Affiche ma progression » → records ; le test de
file attendait qu'un 401 soit rejoué en boucle au lieu d'une pause jusqu'à reconnexion ; l'ancien E2E servait les
fichiers depuis la racine du projet (tous les modules en 404 : il ne pouvait pas passer).

---

## 4. Résultats

Tous les tests passent sur la version livrée. Les bogues trouvés pendant l'écriture des tests ont été corrigés avant
livraison, notamment :

- Générateur : arrondi de niveau trop optimiste (0,5 → intermédiaire) ; « Sortie longue » écrasée à 18 min dans une
  séance de 30 min ; reconstruction pour matériel absent qui supprimait des exercices au lieu de proposer une alternative
  liée à l'objectif ; durées affichées « 1106 s » ; alternatives mal classées.
- Commandes : « progression » reconnu comme « records » ; phrases sans verbe non comprises.
- Recherche : une intention reconnue sans résultat disparaissait (au lieu d'afficher « aucun résultat »).
- Interface : barres de choix débordant sur téléphone ; schéma anatomique qui ouvrait un voile géant (collision de classe
  CSS `back`) ; boutons d'édition visibles dans l'aperçu du générateur.
- Migration : abonnements orphelins et ancienne contrainte `display_name` (voir §2).

---

## 5. Tests navigateur (E2E réel)

`tests/e2e.mjs`, Chromium, Service Worker actif, trois contextes navigateur séparés :

- **Compte A** : écran de connexion, mauvais identifiants, inscription, premier lancement (aucune séance imposée), choix
  des activités et de l'environnement, navigation des 5 onglets sans débordement, rechargement (session conservée),
  performance mesurée + « je ne sais pas », système U1→U8 avec correspondance, style personnalisé, maxima multiples
  multi-styles, objectif front lever (arbre, blocages, chemins), matériel, création manuelle de séance (catalogue,
  modification, réordonnancement), mode séance (séries, chrono, pause non comptée, repos, fin), questionnaire adaptatif,
  historique vérifié **sur le serveur** (durée, pause, questionnaire), générateur (simulation, priorités, explication,
  enregistrement), commande « je n'ai que 12 minutes », « Que faire aujourd'hui ? », tableau de bord personnalisé
  conservé après rechargement, recherche intelligente et classique, carte d'entraînement, « Comprendre mon profil »,
  export JSON, calendrier (planification visible et enregistrée sur le serveur), import CSV vérifié puis réimport sans
  doublon, mode Lab, timeline, journal, publication commune (données personnelles retirées).
- **Compte B** : données de A invisibles, copie d'une contribution commune et modification de la copie, original
  inchangé, modification directe de l'original refusée par le serveur, signalement de bug.
- **Admin** : mauvais mot de passe refusé, bon `EDIT_PASSWORD` → compte administrateur, lecture du signalement (texte
  échappé, auteur) et changement de statut, modification puis suppression de la contribution, aucun accès aux données
  privées des autres.
- **Hors ligne** : voir §7. Dernière étape : aucune erreur JavaScript dans aucun navigateur.

---

## 6. Tests de sécurité

Couverts par `tests/worker.test.mjs` (et `assets.test.mjs` pour le code public) :

- Accès non authentifié : 401 sur toutes les routes privées.
- Mots de passe hachés avec sel individuel, jamais stockés en clair ; fixation de session impossible (le jeton présenté
  est révoqué à la connexion) ; déconnexion et changement de mot de passe révoquent les sessions côté serveur.
- IDOR : identifiants fabriqués, faux `user_id`, faux `owner` / `created_by` : refusés ou isolés par compte ; l'utilisateur
  est **toujours** déterminé par la session.
- Élévation de privilège : routes admin refusées à un compte normal, même appelées à la main ; activation admin
  uniquement par comparaison serveur à temps constant d'empreintes de `EDIT_PASSWORD` ; force brute concurrente bornée
  (limite atomique par compte et par IP) ; sans `EDIT_PASSWORD` configuré → 503, jamais ouvert.
- CSRF : origine étrangère → 403, contenu non JSON → 415. Charge trop grosse → 413.
- XSS : tout le HTML est produit par le gabarit d'échappement ; le seul HTML brut est le SVG à coordonnées fixes ;
  E2E : un titre de signalement contenant du HTML est affiché échappé chez l'admin.
- Limites de débit atomiques (inscription, connexion, mot de passe, ajouts communs, publications, signalements,
  activation admin, abonnements) — rafales concurrentes testées.
- Erreur interne : message générique, aucun détail SQL renvoyé. En-têtes : CSP stricte, `frame-ancestors 'none'`, HSTS en https.

---

## 7. Tests hors ligne

- `tests/sync.test.mjs` (client réel + Worker réel) : action hors ligne écrite immédiatement dans le stockage local ;
  fermeture puis réouverture hors ligne sans perte ; envoi unique au retour ; réponse perdue après succès → rejeu reconnu
  par le serveur (`X-Op-Replay: 1`), aucun doublon ; refus définitif conservé dans « actions en échec » (Réessayer /
  Abandonner) sans bloquer la file ; 401 → pause jusqu'à reconnexion ; 500 → nouvel essai avec délai croissant ;
  conflit d'item conservé et restaurable ; suppression et séance modifiées hors ligne synchronisées.
- E2E : Service Worker actif puis coupure réseau, application rouverte avec les données, modifications hors ligne
  (séance, performance, note), **fermeture de l'onglet puis réouverture hors ligne**, retour en ligne sans doublon,
  déconnexion / reconnexion avec données intactes.

---

## 8. Validation V1 (cahier des charges §4)

| Fonctionnalité | Où | Vérifié par |
|---|---|---|
| Produit universel, 6 activités natives dont « Renforcement / préparation physique » | `model.js`, onboarding | model, E2E |
| Activités, catégories et métriques personnalisées (création, modification, archivage) | Profil › Activités | worker (items), E2E partiel |
| Modèle métrique → capacité → exercice → objectif | `model.js`, `library.js`, `brain.js` | model, brain |
| Profil sportif : déclaré / mesuré / calculé / estimé / recommandé | Profil › Comprendre | brain, E2E |
| Escalade : systèmes de cotation, maxima multiples, styles | Profil › Escalade | grading, E2E |
| Générateur (niveau, matériel, durée, objectif, explications) | Bibliothèque › Générer | generator, E2E |
| Création / modification manuelle, modèles, duplication, archivage | éditeur de séance | worker (sync), E2E |
| Exécution : chrono, pause, repos, abandon, fin | `player.js` | player, E2E |
| Historique et progression | Progrès | worker, brain, E2E |
| Calendrier prévu / réalisé, répétition hebdomadaire | Accueil › Calendrier | worker, E2E |
| Bibliothèque personnelle | Bibliothèque › Exercices | worker |
| Bibliothèque commune (§7) | Bibliothèque › Commune | worker, E2E |
| Recherche | Bibliothèque › Recherche | data, E2E |
| Import / export JSON (import validé, fusion, limite 8 Mo) | Paramètres › Données | E2E (export) |
| Hors ligne / PWA | `sw.js`, `state.js` | assets, sync, E2E |
| Authentification par compte, sans mot de passe global | `worker.js` | worker, E2E |
| Sécurité | voir §6 | worker |

## 9. Validation V2 (cahier des charges §5)

Toutes les fonctions de la liste §5 et de la checklist §27 sont implémentées, reliées à l'interface et aux données
réelles de l'utilisateur :

- **Intelligence et Training Brain** (`brain.js`) : chaque analyse sépare faits / estimations / manques et donne sa
  confiance ; bouton « Comment le sais-tu ? » sur les capacités ; page « Comprendre mon profil » ; « Ma carte
  d'entraînement » ; carte interactive des capacités ; graphe exercice ↔ capacité ↔ objectif dans les deux sens.
- **Objectifs complexes** : front lever, drapeau, traction à un bras, muscle-up, équilibre sur les mains, pistol squat —
  critères, arbre d'étapes avec maîtrise (non commencé / découvert / en développement / maîtrisé), « Qu'est-ce qui me
  bloque ? », plusieurs chemins non classés, « Et si… ? », « Pourquoi je ne progresse pas ? » ; objectifs métrique,
  cotation, nombre de séances, nombre de réussites, personnalisé.
- **Anatomie** face / dos, muscles en français, principaux / secondaires, carte de chaleur du volume ; les muscles sont
  utilisés par le moteur (volume par muscle, ressenti du questionnaire).
- **Questionnaire post-séance adaptatif** (muscles sentis, plus dur / plus facile, difficulté, découvertes aimées,
  question doigts après travail des doigts, commentaire) ; les réponses modifient réellement le profil (préférences,
  exclusion du travail intense des doigts après une gêne) et un encadré liste ce qui a changé (boucle d'adaptation
  §5.21 ; la trace durable est dans l'historique, les préférences avec leur source et le journal).
- **Comparaisons 7 / 30 / 90 jours**, résumés semaine / mois, régularité, capacités sous-entraînées, objectifs oubliés,
  rappels de tests, apprentissage des préférences (proposé, jamais appliqué sans confirmation), détection d'habitudes,
  diagnostics descriptifs non médicaux, charge durée × ressenti avec avertissement, séances atypiques, jalons discrets
  (sans classement social), journal, timeline, mode Lab.
- **Génération** : simulation avant génération (intention, répartition, blocs, difficulté, matériel, contraintes,
  modification des priorités), intentions de séance, modes express et léger, « Tu n'as jamais essayé », remplacement
  intelligent (même capacité / objectif / autre matériel / plus facile / plus difficile / mouvement comparable, chacun
  avec sa raison), adaptation de durée par reconstruction, matériel dynamique (retrait → alternatives, ajout → nouvelles
  possibilités), environnements, contexte de séance.
- **Commandes en langage naturel** déterministes (sans IA externe), avec résumé « ce que j'ai compris », confirmation
  des actions destructives et choix en cas d'ambiguïté ; commande vocale si le navigateur la propose.
- **Recherche intelligente**, **import CSV** avec correspondance proposée puis vérifiée et aperçu ligne par ligne,
  **tableau de bord personnalisable** (blocs, ordre, conservé sur le serveur), saisie numérique optimisée sur mobile,
  « Je ne sais pas » partout où un niveau ou une valeur est demandé.
- **Social** (§10) : profil privé par défaut, publication d'éléments choisis un par un, séances publiques, copie
  indépendante, abonnements avec acceptation.

## 10. Droits utilisateur / créateur / admin

| Action | Utilisateur | Créateur | Admin |
|---|---|---|---|
| Lire ses données privées | oui (les siennes) | — | **non** pour celles des autres |
| Voir la bibliothèque commune, copier | oui | oui | oui |
| Modifier une contribution commune | non (403) | oui | oui |
| Supprimer une contribution commune | non | oui | oui (suppression réelle vérifiée) |
| Modifier une séance publique | non | oui | non |
| Supprimer une séance publique | non | oui | oui (modération) |
| Lire les signalements | les siens | — | tous, avec changement de statut |

La copie est un nouvel objet indépendant (nouvel identifiant, origine mémorisée) : modifier l'un ne change jamais
l'autre, et les performances privées de l'auteur ne sont jamais transmises (vérifié par `worker.test` et E2E).
Les modifications concurrentes d'une contribution sont protégées par un contrôle de version (409 explicite).

## 11. Cotations et styles

Vérifié par `tests/grading.test.mjs` (liste §18) et l'E2E : U1→U8, couleurs, systèmes personnalisés, modification
(renommer, recolorer, réordonner, supprimer un niveau), plusieurs systèmes, plusieurs maxima, plusieurs styles par
maximum, styles préenregistrés structurés et styles personnalisés, archivage sans casser l'historique, instantané du
système d'origine conservé dans chaque performance, correspondances configurables vers une échelle de référence
(table usuelle V → Font fournie). Sans correspondance, **aucune équivalence n'est inventée** : le maximum n'est pas
utilisé pour estimer le niveau (et c'est signalé), et la bibliothèque commune n'affiche un repère d'escalade dans le
système de l'utilisateur que si une correspondance existe.

## 12. Signalements de bugs

Paramètres › Signaler un bug : titre, description, page, informations techniques de l'appareil **facultatives** (aucun
secret, aucun cookie). Envoi passant par la file hors ligne (identifiant stable : pas de doublon). Anti-spam 5 / heure et
20 / jour. L'auteur voit ses propres signalements ; un autre utilisateur ne les voit pas ; l'admin les voit tous, filtre
par statut et les marque « ouvert » ou « traité ». Texte toujours échappé. Tests : worker + E2E.

## 13. Absence de secret côté client

`EDIT_PASSWORD` n'existe que dans l'environnement du Worker. `tests/assets.test.mjs` échoue si le nom ou une valeur de
test apparaît dans `public/` ; l'E2E vérifie que l'export JSON ne contient pas le secret. Le navigateur ne stocke
qu'un indicateur « compte administrateur » renvoyé par le serveur, qui revérifie le rôle en base à chaque appel admin.
Le champ de saisie est vidé immédiatement après l'envoi.

## 14. Bibliothèque commune vide sur une installation neuve

Vérifié par deux tests Worker (« vides au départ », « installation neuve ») et par la migration (« nouveau compte sur
base mise à niveau : aucune donnée commune préchargée »). La migration de l'ancienne version KV ne remplit jamais la
bibliothèque commune.

## 15. Migrations et compatibilité

`tests/migration.test.mjs` part d'une vraie base au format v7 : mise à niveau au premier appel, idempotente ; ancien
compte (connexion, séances, historique intacts) ; anciens réglages convertis (profil, maxima, journal d'escalade,
objectifs, activités, métriques) une seule fois ; réglages vides ou corrompus sans erreur ; données locales v7 du
navigateur (file d'attente comprise) reprises au premier démarrage ; le Worker V2 conserve les anciennes clés de
réglages qu'un client V2 ne connaît pas.

---

## Correctif 8.0.1 (après la première mise en ligne)

- **Symptôme** : sur un compte réel, l'accueil affichait « Cet écran n’a pas pu s’afficher — number 12 is not iterable ».
- **Cause** : d'anciennes entrées d'historique (écrites par des versions précédentes) contenaient un nombre là où les
  analyses attendent une liste (ex. `sets: 12` au lieu de la liste des séries). Le message exact a été reproduit en
  remplaçant chaque champ par 12 sur la version 8.0.0.
- **Correction** : toute séance réalisée est normalisée à la lecture (serveur, cache de l'appareil et analyses :
  `normalizeHistory`) ; un nombre de séries devient autant de séries faites, sans répétition ni charge inventée ;
  les données de profil sont revalidées par le schéma avant chaque analyse ; chaque bloc de l'accueil est isolé
  (un bloc en erreur n'empêche plus l'affichage des autres) ; l'écran d'erreur affiche un détail technique à joindre à
  un signalement.
- **Test ajouté** : `tests/robustness.test.mjs` remplace tour à tour chaque champ des données (historique, profil,
  calendrier, séances, exercices personnels) par un nombre, une chaîne, `null` ou un objet vide, et vérifie qu'aucune
  analyse ne plante. Il échouait sur la version 8.0.0 et passe sur la 8.0.1.

## Évolution 8.2.1 — mises à jour proposées automatiquement

- Chaque déploiement Cloudflare (par exemple après une modification sur GitHub) a un identifiant unique
  (binding `version_metadata`). Le serveur l'injecte dans `sw.js` et l'expose sur `GET /api/version` (sans compte).
- L'app (site et application installée) vérifie à l'ouverture, au retour sur l'app et toutes les 20 min ; si une version
  plus récente existe, un bandeau « ✨ Nouvelle version disponible — Mettre à jour » s'affiche (jamais pendant une
  séance). « Mettre à jour » sauvegarde tout, active la nouvelle version et recharge ; « ✕ » masque le bandeau 3 h.
- Plus besoin de changer `APP_VERSION` pour qu'une modification arrive sur les téléphones.
- Tests : worker (injection de l'identifiant), E2E (déploiement simulé → bandeau → nouvelle version installée), 41 étapes.
- **Profil plus visuel** : l'onglet s'ouvre sur un résumé (sports, séances, objectifs, mesures, points forts / à travailler
  en pastilles) et des tuiles par rubrique ; « Ce que l'app sait » devient 4 compteurs colorés, 3 actions courtes
  (« Saisir ») et des listes repliées ; « Ma carte » replie habitudes, matériel et progression.
- **Progrès plus visuel** : 4 tuiles chiffrées avec flèche d'évolution (7 / 30 / 90 jours), « bonnes nouvelles » en
  pastilles, barres « ce que tu as travaillé », régularité en pastilles, détails et méthode de calcul repliés.
- **Bibliothèque plus simple** : générateur en 2 questions (sport, durée) et un gros bouton, le reste dans « Plus
  d'options » ; simulation en pastilles, barre de répartition colorée, raisons repliées ; « Pourquoi cette séance ? »
  replié par défaut.

## Évolution 8.2.0 — plus joli, plus léger, assistant IA

- **Nom** : « Séances entraînement » (titre, application installée « Séances »).
- **Visuel** : cartes arrondies avec relief léger, en-tête d'accueil coloré (salutation, séances de la semaine,
  série de semaines), bouton principal lumineux, barre d'onglets flottante, apparitions douces ; les textes
  d'explication sont réduits à 2 lignes et s'ouvrent d'un toucher ; accueil par défaut limité à l'essentiel
  (Aujourd'hui, Prochaines séances, Objectifs, Recommandations courtes, Commande) — le reste reste ajoutable.
- **Questionnaire** : question « Combien de fois grimpes-tu par semaine ? » dès qu'un sport d'escalade est choisi.
- **Petites questions** (`public/questions.js`) : quand une information manque (sport, fréquence d'escalade, lieu,
  durée, rythme, meilleur bloc, tractions, pompes, motivation, zone à ménager), l'app la demande par une question
  à réponses en un toucher, en fenêtre à l'ouverture de l'accueil puis en carte ; « Je ne sais pas » et « Plus tard »
  (3 jours) ; une réponse par tranche est enregistrée à sa valeur basse (jamais surestimée), comme *déclarée*.
- **Assistant IA** (`server/ai.js`, route `POST /api/ai/draft`, Bibliothèque › Exercices et Profil › Activités) :
  l'IA intégrée de Cloudflare (Workers AI, binding `AI`, modèle configurable par `AI_MODEL`) propose une fiche
  d'exercice ou de capacité (ex. « clipage en escalade » : ce que c'est, pourquoi, comment la travailler, exercices,
  mesure des progrès). Garanties : compte requis ; seul le texte tapé est envoyé ; réponse filtrée (identifiants
  inconnus retirés, nombres bornés, HTML neutralisé) ; l'utilisateur relit avant d'enregistrer ; limites 6 / 10 min
  et 40 / jour ; sans IA configurée, message clair et saisie manuelle possible.
  Écart assumé par rapport au cahier des charges initial (« pas d'IA externe ») : demandé explicitement par le
  propriétaire ; l'IA reste chez l'hébergeur (aucun service tiers ni clé), et n'est jamais utilisée pour les
  analyses, qui restent déterministes et explicables.
- Tests : `tests/ai.test.mjs` (10), `tests/questions.test.mjs` (9), E2E 40 étapes (petite question à l'écran).
- Limite : le quota gratuit de Workers AI est limité par jour ; au-delà, l'assistant répond « réessaie plus tard ».

## Évolution 8.1.0 — prise en main par tous

- **Page d'arrivée** compréhensible sans connaître le site : ce que fait l'app en 3 points, « Créer mon compte gratuit »,
  « J'ai déjà un compte », « Essayer sans compte ».
- **Mode invité** : aucune donnée envoyée au serveur ; tout reste sur l'appareil (séances, historique, profil). Les
  fonctions qui demandent un serveur (bibliothèque partagée, profil public, signalement, administration) affichent
  « Compte nécessaire ». « Créer mon compte (je garde mes données) » transfère tout sur le nouveau compte (vérifié en E2E).
- **Questionnaire de profil** (une question par écran, gros boutons, avance tout seul) ou **fiche complète sur une page** ;
  « Passer », « Je ne sais pas » et « Finir plus tard » partout ; réponses enregistrées comme *déclarées* ; rappel discret
  sur l'accueil tant que le profil n'est pas complet ; utilisées par le générateur (durée, motivation, matériel, zones à ménager).
- **Visite guidée** des onglets après le questionnaire (et dans Paramètres › Aide), **accueil simplifié** (4 grandes tuiles),
  phrase d'explication sous chaque titre d'onglet, **Aide** avec questions fréquentes.
- **Installation** : bouton « 📲 Installer » qui déclenche la vraie installation du navigateur (Android, ordinateur : app
  dans la liste des applications, plein écran). Sur iPhone, Apple ne permet que « Sur l'écran d'accueil » depuis Safari :
  la marche à suivre est affichée. Limite réelle : l'installation directe dépend du navigateur (Chrome, Edge, Samsung
  Internet) ; Firefox Android et iOS n'exposent pas de bouton d'installation programmable.
- **Mode sombre noir pur** (#000) pour toutes les couleurs d'accent (Or, Bleu, Vert, Rouge, Violet, Rose, Contraste).
- **Paramètres réorganisés** : ⭐ Essentiel (compte, affichage, profil sportif, installation, séance), ❓ Aide,
  💾 Mes données, 🔄 Synchronisation, 🐞 Signaler un bug, 🛡️ Admin ; options rares repliées.
- Bug corrigé au passage : une sauvegarde locale asynchrone pouvait échouer si l'utilisateur changeait pendant l'écriture.
- Tests : E2E porté à 39 étapes (page d'arrivée, fond noir, fiche de profil, visite, invité, « finir plus tard »,
  transfert invité → compte).

## 16. Limitations réelles restantes

- **Conflits** : fusion « dernière modification gagnante » par élément (objectif, performance…), pas champ par champ.
  La version perdante n'est jamais effacée : elle est gardée dans Paramètres › Synchronisation › Conflits, restaurable.
  Les séances suivent la même règle par séance.
- **Pas de récupération de mot de passe par e-mail** (aucun service d'envoi d'e-mails configuré). Un mot de passe oublié
  ne peut pas être réinitialisé par l'utilisateur seul.
- **Historique chargé** : les 1 500 séances réalisées les plus récentes sont chargées et analysées (et exportées) ; les
  plus anciennes restent en base mais n'apparaissent pas dans l'application.
- **Repères de niveau** : les seuils des métriques sont des repères indicatifs courants, pas des normes scientifiques ;
  l'application le dit partout où elle les utilise. L'anatomie est un schéma simplifié.
- **Tests navigateur** exécutés sous Chromium uniquement (pas de Safari / Firefox réels). Les tests serveur utilisent une
  base D1 simulée par SQLite (`node:sqlite`) et un serveur local qui exécute `worker.js` ; aucun déploiement réel sur
  Cloudflare n'a été effectué depuis cet environnement.
- **Commande vocale** : dépend de la reconnaissance vocale du navigateur (absente sur certains navigateurs) ; la saisie
  texte fonctionne partout.
- **Séances publiques** : lisibles par toute personne disposant du lien ou consultant le profil public (c'est leur
  rôle) ; l'admin peut les supprimer pour modération mais pas les modifier.
- **Suppression de compte** : les signalements de bugs du compte sont supprimés avec lui ; les contributions communes
  restent, anonymisées.
- **Ancienne version KV** : ses séances personnelles ne peuvent être attribuées qu'au premier compte créé (elles
  n'avaient pas de propriétaire).
- Limites de débit par IP : basées sur l'en-tête `CF-Connecting-IP` fourni par Cloudflare.
