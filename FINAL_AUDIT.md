# FINAL_AUDIT — Séances entraînement v8.28.0

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
- **Reste de l'app allégé** : objectif (pourcentage en grand, actions secondaires dans « ⋯ », repères en barres,
  explications repliées), mesures (tests en lignes courtes, protocole replié), analyses (barres, cartes courtes),
  journal (une ligne par séance, détails repliés), sports (forces en pastilles), partage (listes repliées), fiche
  d'exercice (pastilles muscles / matériel / difficulté, erreurs et capacités repliées) ; phrases générées raccourcies
  à la source (tests à faire, capacités peu travaillées, habitudes).
- **Admin — liste des comptes** (`GET /api/admin/users`, Paramètres › Admin) : pseudo, inscription, e-mail masqué,
  nombre de séances et dernière connexion, recherche ; jamais les séances, performances ni profils ; refusé à tout
  compte non administrateur (test worker + E2E).
- **Tout suit le compte** : l'apparence (thème, couleur, taille du texte, espacement, animations) est maintenant
  enregistrée dans le compte (item `config/appearance`, dernière modification gagnante) comme le reste (séances,
  historique, profil, objectifs, réglages de séance, tableau de bord, questionnaire). Sur un autre appareil ou
  navigateur, tout est retrouvé à la connexion ; l'apparence d'un autre compte du même appareil n'est jamais reprise.
  Restent volontairement propres à l'appareil : « Plus tard » de l'installation et des petites questions.
  Test E2E : nouveau navigateur vierge → connexion → apparence, réglages et séances identiques.

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

## Évolution 8.3.0 — visite immersive et « Quoi de neuf ? »

- **Visite guidée immersive** (`public/tour.js`) : l'app va elle-même sur chaque page (accueil, générateur, progrès,
  profil, paramètres, aide), assombrit l'écran sauf l'élément expliqué (halo animé) et affiche une bulle avec une flèche
  qui le pointe. Retour / Suivant / ✕, flèches du clavier et Échap ; suit la rotation et le défilement ; aucune fenêtre
  (question, bandeau) ne s'ouvre par-dessus pendant la visite.
- **Bandeau après chaque modification** : la dernière version vue est retenue sur l'appareil (`sea:seen-build`). Si le
  site a été déployé depuis (même application fermée, mise à jour silencieuse), « 🎉 L'app a été mise à jour » s'affiche
  une fois. Une version en attente affiche toujours « Nouvelle version — Mettre à jour ».
- **Voir les nouveautés** : `GET /api/changes` (sans compte) lit l'historique public du dépôt GitHub, ne garde que les
  titres et les puces (fusions, livrables zip, lignes techniques écartés), met en cache 10 min et renvoie une liste vide
  en cas d'erreur. Aucune donnée d'utilisateur n'est envoyée à GitHub. Dépôt modifiable par `CHANGES_REPO` / `CHANGES_BRANCH`.
- Tests : `tests/changes.test.mjs` (filtrage, cache, erreurs, route) ; E2E : la visite navigue seule jusqu'au générateur,
  élément mis en lumière et flèche ; après la mise à jour, bandeau « mis à jour » → nouveautés → bandeau disparu.

## Évolution 8.4.0 — nouvelle adresse, consignes à chaque série, visite des nouveautés

- **Déménagement automatique** : `seances-entrainement.…workers.dev` renvoie vers `seances-sport.pages.dev`
  (variable `MOVE_TO` ; vide = désactivé ; les adresses d'aperçu ne sont pas concernées) en gardant la page ouverte.
  Ce qui n'existe que sur l'appareil (réglages, données en attente d'envoi, données du mode invité) et la connexion
  voyagent via un code à usage unique (256 bits, 15 min, seule son empreinte SHA-256 est stockée dans D1).
  Sur la nouvelle adresse, confirmation « Continuer avec le compte X » avant toute connexion (un lien piégé ne peut pas
  connecter quelqu'un au compte d'un autre à son insu). Transfert impossible (hors ligne…) → on reste sur l'ancienne
  adresse, rien n'est perdu. Contrôle d'origine, 20 transferts / h / IP, 1,8 Mo maximum.
- **Consignes à chaque série** : les consignes (et « À éviter ») restent affichées à chaque série, et pendant le repos.
- **Visite des nouveautés** (`public/news.js`) : après une mise à jour, le bandeau propose « 🧭 Faire la visite » qui ne
  montre que les nouveautés des versions pas encore visitées (même principe que la visite guidée). « Revoir les
  nouveautés » dans Paramètres › Aide. Un nouvel appareil n'a pas de nouveautés à voir (la visite complète s'en charge).
- Tests : `tests/move.test.mjs` ; E2E 46 étapes (déménagement compte et invité, consignes à la 2e série, visite des nouveautés).

## Évolution 8.4.1 — ancienne application installée

- Une application installée ne peut pas changer d'adresse : ouverte depuis l'ancienne icône, elle affiche
  « 📲 L'application a une nouvelle adresse » avec 3 étapes et le bouton « Ouvrir la nouvelle adresse »
  (transfert du compte et des données comme pour le site). Hors ligne : « Réessayer », rien n'est perdu.
- Sur la nouvelle adresse, l'accueil affiche « Dernière étape : installe la nouvelle application » (bouton Installer,
  « C'est fait ») jusqu'à l'installation. Test E2E ajouté (47 étapes).

## Évolution 8.5.0 — séance, escalade, motivation, programme, rappels

- **Séance** : coach vocal (exercice, série, repos, « encore 10 secondes », décompte) ; grand affichage (un toucher
  valide) ; minuteur d'intervalles plein écran (7/3, suspensions max, Tabata, EMOM, gainage, libre) ; échauffement de
  5 min ajouté aux séances faites à la main ; personnages animés par type de mouvement ; ceinture cardio Bluetooth
  (profil standard Heart Rate, moyenne et max enregistrés) ; confettis sur record ; sons au choix et volume.
- **Carnet d'escalade** : ajout rapide, pyramide (flash / réussi) par système principal — aucune conversion inventée —,
  projets (essais par séance, photo réduite < 90 Ko avec prises marquées), test de doigts mensuel (20 mm).
- **Motivation** : série de semaines bienveillante, 18 badges avec progression, bilan du mois en image (canvas).
- **Programme** : 4 questions → calendrier, semaine légère toutes les 4, semaine bilan, séances générées le jour même,
  réajustement des séances manquées ; « Comment tu te sens ? » (fatigué = plus doux, en forme = une série de plus) ;
  alerte de volume « doigts » (repère, pas un avis médical) ; coach en discussion (Workers AI, résumé du profil visible,
  réponses courtes, pas de diagnostic, 20 questions / 10 min).
- **Rappels** : Web Push VAPID sans tiers (clés auto, stockées côté serveur), notification sans contenu (texte demandé
  avec la session), cron 15 min, fuseau de la personne, hôtes de notification reconnus seulement ; export .ics ;
  raccourcis de l'icône.
- Serveur : l'historique garde la fréquence cardiaque et le lien au programme ; photos jusqu'à 95 Ko ; envois par 600 Ko.
- Tests ajoutés : session-tools, climb, motivation, program, push-ics, coach ; E2E 52 étapes.

## Évolution 8.6.0 : ambiances, mise en page, séance sur mesure, salles, notifications, sources

- **Ambiances** : six ambiances complètes (classique, chaleureux, salle de muscu, grand air, minimal, néon), avec une couleur au choix.
- **Mise en page par compte** : chaque élément peut s'afficher en grande carte ou en icône en haut, être déplacé et coloré. Chaque enregistrement demande deux confirmations, et on peut revenir à la mise en page de base.
- **Profil corporel et objectifs multiples**, dont la perte de poids. Un objectif écrit librement est analysé par l'assistant (côté serveur, réponse filtrée), avec une solution de repli sans assistant.
- **Générateur enrichi** :
  - objectifs, intentions propres à chaque sport, forces et faiblesses, muscles, zones à ménager, forme du jour et ressenti visé ;
  - les intentions proposées par les utilisateurs passent par une validation des administrateurs (droits vérifiés côté serveur).
- **Salles d'escalade** : matériel par espace et cotation propre (U1 à U8+). Chaque bloc est noté facile, moyen ou dur pour sa cotation, avec son style.
- **Notifications** : boîte des mises à jour, réglages par type, notification « nouvelle mise à jour » (Web Push VAPID, sans service tiers).
- **Séances prêtes sourcées** et classement des exercices pour le profil. 18 références vérifiées, citées sous chaque conseil (`public/sources.js`).

## Évolution 8.7.0 : entre amis, accueil vivant, mode ordinateur, anglais

**Partage par lien et QR code**
- Nouvelle portée `link` pour `shared_sessions` : la séance n'est lisible qu'avec son lien (`/api/public/s/:id`).
- Elle n'apparaît jamais dans la bibliothèque commune ni sur le profil public. Seul son auteur la voit dans sa liste (`scope=link&mine=1`) et peut la retirer.
- Données personnelles retirées comme pour toute publication (`sanitizeForPublication`).
- Le QR code est dessiné dans l'app en SVG, avec `public/qr.js` (qrcode-generator 1.4.4, licence MIT, en-tête conservé) : aucun service extérieur.
- La page d'arrivée propose de garder une copie indépendante ou de faire la séance. Sans compte, le lien est gardé le temps de se connecter.

**Séance à deux** (`server/duo.js`, table `duo_rooms`)
- Salon de 6 caractères tirés au hasard (crypto), sans 0/O/1/I. Il expire après 4 h et accueille 4 personnes au plus.
- Seuls ses membres peuvent lire ou écrire l'état ; les autres reçoivent 403.
- L'état partagé est nettoyé côté serveur : position dans la séance, phase, fin du chrono, pause. Répétitions, charges et notes ne circulent pas.
- Synchronisation par sondage toutes les 2 s, avec compensation du décalage d'horloge.
- Quand le partenaire valide une série, elle est comptée avec les valeurs affichées ; s'il passe un exercice, rien n'est compté.
- Le salon est supprimé à la suppression du compte de son hôte.

**Accueil vivant** (`public/scene.js`)
- Le ciel suit l'heure (aube, jour, soir, nuit), le soleil ou la lune avancent dans la journée.
- Décor de saison en option (neige, fleurs, soleil, feuilles). Les animations sont coupées si « Animations : non » ou si le système demande moins de mouvement.

**Mode ordinateur** : à partir de 1000 px de large, la navigation passe à gauche et l'accueil s'affiche sur deux colonnes.

**Anglais (bêta)** (`public/i18n.js`) : les textes connus des écrans principaux sont traduits à l'affichage. Ce qui n'est pas encore traduit reste en français. La voix du coach reste en français.

**Ton plus naturel** : moins d'étincelles « IA » dans les boutons et des phrases d'accueil plus humaines, qui varient selon l'heure.

**Correctif de mise à jour** : si l'app se rechargeait avant que la nouvelle version ne soit active, le bandeau « Nouvelle version » pouvait réapparaître juste après avoir mis à jour. La version en attente est maintenant activée directement.

**Tests**
- Nouveaux fichiers : `tests/duo-share.test.mjs` (16 tests ; le QR est relu par jsQR, dépendance de développement) et `tests/look.test.mjs` (6 tests).
- E2E : 58 étapes, dont le partage par lien et une séance à deux entre deux navigateurs.

## Évolution 8.8.0 : format de séance à la carte, durée libre jusqu'à 4 h

**Durée libre** : de 5 min à 4 h. Les boutons vont de 20 min à 3 h, et « Autre durée » permet d'écrire un nombre de minutes. Sans format choisi, les longues séances comptent maintenant plus d'exercices (jusqu'à 12).

**Format de séance** (`public/format.js`, sans DOM, testé)
- Les parties : échauffement, corps de séance, technique, renforcement, cardio, gainage, mobilité, étirements, retour au calme.
- On règle l'ordre et le temps de chacune. Il y a des formats tout prêts, et on peut garder les siens (item `config/formats`, JSON revalidé à la lecture, 12 au plus).
- Le générateur construit chaque partie pour son temps et dans l'ordre choisi, sans répéter un exercice d'une partie à l'autre.
- En escalade, la partie principale reste la grimpe, et le renforcement puise dans les exercices de renforcement.

**Conseils sourcés, jamais bloquants**
- Pas d'échauffement avant l'effort : conseil sourcé soligard2008.
- Étirements placés avant une partie d'effort : l'app met des mouvements dynamiques à cette place, et les étirements tenus restent en fin de séance (behm2016).

**Affichage**
- La séance s'affiche par partie, avec le temps de chacune.
- Le lecteur indique la partie en cours, le temps qu'il lui reste et la partie suivante.
- Le générateur retient, sur l'appareil, le dernier format et la dernière durée.

**Correctifs**
- Les zones à ménager et le « pas de sauts » du profil sont aussi appliqués à la génération finale, pas seulement à l'aperçu.
- La visite guidée retrouve l'élément à montrer si la page se redessine pendant la visite.

**Tests**
- `tests/format.test.mjs` : 9 tests, dont une séance d'escalade au format choisi et une séance de 2 h 30.
- E2E : 59 étapes, dont une qui compose un format, règle 2 h 30 et vérifie l'ordre des parties.

## Évolution 8.9.0 : une app plus simple à parcourir

J'ai relu chaque écran pour repérer ce qui n'était pas logique. Voici ce qui a changé.

**Accueil**
- La « petite question » s'affichait deux fois (carte et fenêtre qui s'ouvrait toute seule). Il ne reste que la carte, placée après les raccourcis.
- La séance du jour passe en premier, en grand, avec un bouton ▶. Mes séances, Minuteur et Carnet sont en dessous, sur une ligne.

**Menu en haut** : l'icône ▦ devient ☰ « Menu ». Le menu, rangé par thème, s'enrichit de « Séances prêtes » et « Séance à deux ». Les raccourcis vers les rappels et l'affichage pointent vers les bonnes pages. Il y a moins d'icônes en double par défaut.

**Bibliothèque**
- Un seul bouton « ＋ Nouvelle séance » propose les façons de créer une séance, chacune expliquée en une ligne : sur mesure, prête, à la main, coller un texte, rejoindre un ami.
- Il reste 5 onglets au lieu de 7. « Top exercices » se trouve dans Exercices, et la recherche passe dans une loupe 🔍.
- Le catalogue affiche 15 exercices, avec un bouton « Voir les autres ».

**Profil** : les tuiles sont rangées par thème (Moi, Mes résultats, Comprendre mes conseils, Partager). Deux noms deviennent plus parlants : « Mes capacités » et « Pourquoi ces conseils ».

**Paramètres**
- L'accueil des paramètres liste les rubriques, une par ligne, comme sur un téléphone : Affichage, Pendant la séance, Notifications, Mes données, Synchronisation, Aide, Signaler un bug.
- Chaque rubrique a sa page, avec un bouton retour. L'onglet Paramètres rouvre toujours cette liste.

**Mode ordinateur** : la séance du jour occupe deux colonnes.

**Tests** : E2E à 59 étapes, adapté à la nouvelle navigation. Il vérifie aussi qu'aucune fenêtre de question ne s'ouvre toute seule.

### Notifications : « vu » à cocher
- Ouvrir la boîte ne marque plus tout comme lu. Chaque notification a son bouton « ✓ Vu », et « Tout marquer comme vu » coche toutes les nouvelles d'un coup.
- Les nouvelles sont en haut, mises en avant avec l'étiquette « Nouveau ». Les notifications vues passent dans « Déjà vues », plus discrètes (repliées, moins de texte), et « ↺ Non vue » les remet en avant.
- La pastille de l'icône 🔔 compte les notifications non vues.
- Les notifications vues sont enregistrées dans le compte (item `config/inbox`), donc elles restent vues sur tous les appareils. L'ancienne date « tout lu » de l'appareil est toujours prise en compte.

## Évolution 8.10.0 : listes au lieu des barres d’onglets
- Les barres d'onglets horizontales disparaissent. Bibliothèque, Progrès et Profil prennent le format en liste des paramètres (une rubrique par ligne, avec une courte description), et chaque rubrique a sa page avec un bouton retour.
- **Bibliothèque** : « ＋ Nouvelle séance », puis la liste Mes séances, Sur mesure, Séances prêtes, Exercices, Partagées, Rechercher, avec le nombre de séances et d'exercices.
- **Progrès** : le résumé reste en haut (l'essentiel d'un coup d'œil), puis « Aller plus loin » liste Historique, Records, Frise, Journal, Analyses et Lab.
- **Profil** : les pages n'ont plus de barre, seulement un retour vers les tuiles.
- Chaque onglet du bas s'ouvre sur sa page d'accueil.

## Évolution 8.11.0 : une loupe pour tout trouver

**Recherche globale**
- La loupe 🔍 est en haut de chaque page. Elle ouvre un champ, et les résultats arrivent pendant la frappe, rangés par catégorie : fonctions, paramètres, mes séances, séances prêtes, exercices.
- Un toucher mène au bon endroit. Le réglage ou l'élément trouvé est mis en lumière, et le bloc replié qui le contient s'ouvre.

**Recherche dans Paramètres** : un champ en haut ne cherche que dans les réglages. La liste des rubriques laisse la place aux résultats tant que la recherche n'est pas vide.

**Fonctionnement** (`public/finder.js`, sans DOM, testé)
- Chaque fonction et chaque réglage a des mots-clés et des synonymes courants : « anglais » trouve Langue, « tabata » trouve Minuteur.
- Les accents, majuscules et signes sont ignorés, et tous les mots écrits doivent correspondre.
- Un titre qui commence par le mot cherché passe devant. Les mots très courts ne trouvent que des débuts de mots, pour éviter les résultats sans rapport.

**Tests**
- `tests/finder.test.mjs` (6 tests) : classement, synonymes, périmètre des paramètres, et existence de chaque rubrique et de chaque action visées.
- E2E : 60 étapes.

## Évolution 8.12.0 : tout se modifie, pour soi ou pour tout le monde

**Contenu concerné** : exercices, séances prêtes, intentions par sport, formats de séance, en plus de la bibliothèque commune.

**Pour moi** (tous les comptes)
- Sur chaque exercice et chaque séance prête, « ✏️ Modifier » change le nom, l'emoji, les séries, les répétitions ou secondes, le repos, les consignes et le « pourquoi ». Pour une séance prête : la durée, les conseils, et les séries et repos de chaque exercice.
- On peut aussi masquer un élément.
- La modification est liée au compte (items `exedit` et `catedit`), et « ↺ Retirer ma modification » revient en arrière.

**Pour tout le monde** (administrateurs seulement)
- À chaque changement, l'app demande « Pour moi seulement » ou « Pour tout le monde ».
- « Pour tout le monde » enregistre le changement sur le serveur (table `global_content`, route `PUT /api/admin/global/:type/:id`). Le droit administrateur est vérifié côté serveur, sur la session. Chaque champ est validé et borné (`server/global.js`), et les champs inconnus sont ignorés.
- Tous les comptes lisent `GET /api/global`, même sans compte ou hors ligne (dernière version gardée sur l'appareil).
- Les administrateurs peuvent aussi :
  - ajouter un exercice pour tout le monde ;
  - faire d'une de leurs séances une séance prête (sans leurs notes ni leurs charges) ;
  - modifier, ajouter ou masquer une intention par sport ;
  - garder un format de séance pour tout le monde.
- Paramètres › Admin liste tous les changements (type, date, auteur), chacun avec « ↺ Annuler ».

**Ordre d'application** (`public/global.js`) : d'abord le contenu d'origine, puis les changements pour tout le monde, puis les miens. Annuler redonne exactement l'original. Un exercice masqué reste connu des séances existantes, mais il n'est plus proposé.

**Tests**
- `tests/global.test.mjs` (9 tests) : validation, 403 pour un compte normal, 401 sans compte, lecture pour tous, couches et retour à l'original.
- E2E à 61 étapes : un administrateur modifie pour tout le monde, un autre compte le voit, l'administrateur annule.

### Correctif : notification « nouvelle mise à jour » en retard
- **Cause** : l'annonce ne partait qu'avec la tâche planifiée (toutes les 15 min, donc jusqu'à 15 min après la mise en ligne). La notification était aussi envoyée en priorité « normale », que les téléphones en économie d'énergie peuvent retarder de plusieurs minutes.
- **Correctif**
  - L'annonce part dès la première requête reçue après le déploiement (`ctx.waitUntil`, une vérification par instance du Worker). La tâche planifiée reste en secours.
  - Les notifications sont envoyées en priorité haute (`Urgency: high`).
  - Le changement de version est enregistré en « compare puis remplace » : même avec plusieurs requêtes simultanées, une seule annonce part.
- **Tests** : `push-ics.test.mjs`, avec une seule annonce pour 3 requêtes simultanées, la priorité haute, et l'annonce dès la première requête.

## Évolution 8.13.0 : les idées de chacun pour tout le monde, et toutes les mises à jour

**Systèmes de cotation et styles pour tout le monde**
- Un administrateur publie un système (par exemple « Cotations unibloc ») ou un style pour tous les comptes : types `grading` et `style` de `global_content`, validés côté serveur.
- Quand on ajoute un bloc, on choisit parmi tous les systèmes : intégrés, pour tous, et les siens. Une salle peut aussi utiliser un système publié pour tous.

**Proposer à tout le monde**, partout où l'on crée quelque chose : système de cotation, style, exercice personnel, séance (comme séance prête), format de séance, intention.
- Un compte normal voit « 💡 Proposer à tout le monde ». Un administrateur voit « 🌍 Pour tout le monde », qui publie directement.
- Le serveur valide la proposition comme une publication. Une proposition incomplète est refusée, et il y a au plus 10 propositions par jour.

**Administrateurs**
- Une notification par idée (« Bob propose : … »), en tête de la boîte 🔔. La boîte se met à jour à chaque ouverture.
- « Voir et décider » mène à l'endroit d'où vient l'idée (Carnet pour une cotation, Exercices, Séances prêtes, Sur mesure…) et montre ce qui est proposé. Deux choix : « ✓ Ajouter pour tout le monde », ou « ✗ Refuser », avec une réponse envoyée à l'auteur.
- La notification sur le téléphone ouvre la boîte 🔔.

**Mises à jour**
- Chaque notification de mise à jour a son bouton « 🧭 Lancer la visite », bien visible.
- Nouvelle rubrique Paramètres › Toutes les mises à jour : de la première version à la dernière, chacune avec sa visite et le détail de ce qui a changé.

**Correctifs**
- Une idée ou une réponse arrivée après le repère « tout lu » de l'appareil reste bien nouvelle. Ce repère ne sert plus que pour les mises à jour, et il ne peut plus être dans le futur.
- Une visite longue affiche une barre de progression. Avant, les points poussaient le bouton « Suivant » hors de l'écran.

**Tests** : `global.test.mjs` passe à 11 tests (proposition, validation, acceptation, refus). E2E à 62 étapes : un utilisateur propose un système, l'administrateur est notifié, l'ouvre au bon endroit et l'accepte, et l'utilisateur le voit « pour tous ».

## Évolution 8.14.0 : l'app se modifie sans code

Tout se fait depuis Paramètres › Admin › « 🛠 Modifier l'app sans code ».

**Modifier les textes**
- En mode textes, l'administrateur touche n'importe quel texte de l'app et le réécrit pour tout le monde (type `text` : texte d'origine → nouveau texte).
- Le remplacement s'applique partout où ce texte apparaît exactement pareil, par la même couche d'affichage que la traduction (`i18n.js`). « ↺ Remettre l'original » revient en arrière.

**Annonces** (type `announce`)
- Un titre, un message, et en option « note de mise à jour ».
- L'annonce arrive dans la boîte 🔔 de tout le monde, en notification sur les téléphones abonnés aux nouveautés, et dans « Toutes les mises à jour » si c'est une note de mise à jour.

**Mise en page pour tous** (type `layout`)
- En enregistrant une mise en page, l'administrateur choisit « Pour tout le monde ». Elle devient alors la mise en page de base de tous les comptes qui n'ont pas la leur.
- Ce qu'il a masqué est masqué pour tous. L'éditeur l'indique : « 🚫 masqué pour tous ».

**Questions fréquentes et sources** (types `faq` et `source`) : modifier, ajouter ou retirer. Une source doit avoir un lien https.

**Administrateurs**
- Un administrateur peut nommer ou retirer un administrateur depuis la liste des comptes (`POST /api/admin/users/:id/role`). Le serveur refuse de retirer le dernier administrateur.
- Tous ces changements apparaissent dans « Changements pour tout le monde », chacun avec « ↺ Annuler ».

**Tests** : `global.test.mjs` passe à 15 tests (validation des nouveaux types, rôles, annonces, application puis retrait). E2E à 63 étapes : un texte réécrit et une annonce vus par un autre compte, puis annulés.

**Ce qui demande encore du code** : une fonctionnalité vraiment nouvelle (un nouvel écran, un nouveau calcul), la correction d'un bug, la sécurité et l'hébergement.

## Évolution 8.15.0 : séances multi-sports, fusion, demandes de modification

**Un sport par partie**
- Dans le format de séance, chaque partie peut avoir son sport (par exemple renfo, puis bloc, puis étirements).
- `cleanParts` garde `activity`, validée par `/^[\w-]{1,40}$/`.
- Le générateur prend, pour chaque partie, les exercices de son sport. Le titre de la partie indique le sport quand il diffère du sport principal.
- Une partie d'escalade dans une séance multi-sports grimpe vraiment : un thème au mur (dalle, dévers, réglettes, résistance) quand le mur est disponible.

**Fusionner des séances** (`public/merge.js`, sans DOM, testé)
- On choisit 2 à 4 séances dans Bibliothèque › Mes séances › « 🔀 Fusionner ». Une **nouvelle** séance est créée : `source: 'merge'`, nouveaux identifiants. Les séances d'origine ne sont jamais modifiées.
- La nouvelle séance a un seul échauffement et un seul retour au calme (les plus longs). Les exercices en double ne sont gardés qu'une fois, et une note l'explique.
- Le conseil est noté sur 100, avec des règles simples et affichées :
  - complémentarité (recouvrement des capacités travaillées) ;
  - plusieurs sports ;
  - durée totale ;
  - doigts sollicités fort deux fois (Schöffl 2006) ;
  - ordre conseillé : le plus technique et le plus intense d'abord (ACSM 2009).
- « 💡 Quelles séances fusionner ? » classe les paires de ses séances actives. « 💬 Demander au coach » prépare la question pour le coach.

**Demandes de modification**
- Quand quelqu'un qui n'est pas administrateur modifie un exercice ou une séance prête, il choisit entre « Pour moi seulement » et « 💡 Proposer pour tout le monde ».
- La demande part aux administrateurs avec l'élément visé (`target`, validé) et la page d'origine (`from`).
- Si l'admin accepte, l'élément visé est mis à jour pour tous (`ON CONFLICT(kind,id) DO UPDATE`, sans doublon).
- « 💡 Proposer une amélioration » (Paramètres, menu ☰, recherche) envoie une idée libre avec la page où l'on était.

**Tests**
- Nouveau fichier `merge.test.mjs` (5 tests).
- `format.test.mjs` : multi-sports.
- `global.test.mjs` passe à 17 tests : demande ciblée acceptée, idée.
- E2E : fusion, et demande d'un non-admin appliquée par l'admin.

## Évolution 8.16.0 : ranger ses séances

**Chaque séance a**
- **plusieurs sports** : le sport principal, plus d'autres (`sports`, identifiants validés, 8 au plus). Le générateur multi-sports et la fusion les remplissent tout seuls.
- **un lieu** (`context.env`), avec « ＋ Ajouter un lieu » qui mène à Profil › Matériel et lieux.
- **des catégories** : Force, Doigts, Technique, Gainage, Puissance, Endurance, Mobilité, plus les siennes (`tags`, 8 au plus).
  - Sans choix, elles sont **reconnues d'après ce que travaillent les exercices** (au moins un quart du travail).
  - Toucher une catégorie fixe la liste à la main.

**Mes séances** (`public/sfilter.js`, sans DOM, testé)
- Une recherche (nom de séance ou d'exercice) et un bouton « ⇅ Trier » qui ouvre une liste claire.
- Filtres :
  - lieux ;
  - un ou plusieurs sports (la séance en contient au moins un) ;
  - catégories.
- Dix tris :
  - récentes ;
  - **selon ma forme du jour** (fatigué / normal / en forme : l'intensité la plus proche d'abord, et les plus courtes si fatigué) ;
  - pas faites depuis longtemps ;
  - les plus faites ;
  - les plus courtes ou les plus longues ;
  - les plus douces ou les plus intenses ;
  - par nom ;
  - par sport.
- Les filtres actifs sont affichés en puces qu'on retire d'un toucher. Le choix est gardé sur l'appareil (préférence d'affichage, pas une donnée).
- L'app ne mesure pas la forme du jour : c'est l'utilisateur qui la choisit.

**Tests**
- Nouveau fichier `sfilter.test.mjs` (4 tests).
- E2E : sports et catégories ajoutés dans l'éditeur, filtre par sport, tri « selon ma forme », puce retirée, recherche sans résultat, puis « Effacer ».

## Évolution 8.17.0 : regrouper et modifier plusieurs séances

**Regrouper par** lieu, sport ou catégorie (dans « ⇅ Trier »)
- La liste garde son tri à l'intérieur de chaque groupe. `groupSessions` est pur et testé.
- Une séance à plusieurs sports ou catégories apparaît dans chacun de ses groupes. Les groupes « sans » sont à la fin.

**Sélection de plusieurs séances** (« ☑ Sélectionner plusieurs séances »)
- Actions possibles : tout cocher, donner un lieu, ajouter une catégorie, ajouter un sport, fusionner (2 à 4), archiver ou désarchiver (avec confirmation).
- Chaque séance est enregistrée normalement (synchronisation, dernière modification gagnante).
- Pendant la sélection, les boutons Lancer, Ouvrir et Planifier sont cachés. La sélection s'efface en changeant de page ou de filtre.

**Tests** : `sfilter.test.mjs` passe à 5 tests. E2E : groupes par catégorie, puis sélection de 2 séances et catégorie ajoutée aux deux.

## Évolution 8.18.0 : c'est quoi, à quoi ça sert, pourquoi

Chaque séance et chaque exercice répond à trois questions (`public/explain.js`, sans DOM, testé). Tout est construit à partir des vraies données, rien n'est inventé.

**Exercice**
- **C'est quoi ?**
  - Le type d'exercice (21 types), à tenir combien de temps ou combien de répétitions, le matériel et les muscles.
  - Un administrateur peut écrire son propre texte (« C'est quoi ? » dans la fiche de modification, champ `what`, validé côté serveur).
- **À quoi ça sert ?** Le bénéfice de la bibliothèque, plus les capacités développées.
- **Pourquoi ici ?** (dans une séance)
  - La raison donnée par le générateur.
  - Sinon la place de l'exercice (échauffement, retour au calme).
  - Sinon le lien avec les catégories de la séance.

**Séance**
- **C'est quoi ?** Les sports, le nombre d'exercices, la durée, les parties et l'intensité.
- **À quoi ça sert ?** Les catégories et les capacités les plus travaillées.
- **Pourquoi ?**
  - Le pourquoi écrit par l'utilisateur (« ✎ Mon pourquoi », enregistré dans les notes de la séance).
  - Sinon celui de la séance générée, prête ou fusionnée, ses objectifs ou ses intentions.

**Où c'est affiché**
- En haut de chaque séance : éditeur, générateur, séance partagée, séance prête.
- Dans la fiche de chaque exercice : le nom d'un exercice dans une séance s'ouvre d'un toucher, même en mode modification.
- Dans les exercices d'une séance prête.
- Pendant la séance, dans un encadré repliable.

**Correctif** : le « pourquoi » des séances prêtes était perdu quand on les gardait (texte au lieu d'une liste de notes). Il est maintenant enregistré.

**Tests**
- Nouveau fichier `explain.test.mjs` (5 tests) :
  - les 143 exercices ont un « c'est quoi » et un « à quoi ça sert » sans trou ;
  - les séances prêtes gardent leur pourquoi.
- E2E : bloc « en bref », mon pourquoi, fiche d'exercice avec « Pourquoi ici ? », séance prête.

## Évolution 8.19.0 : structurer sa séance d'escalade

Nouvelle page : Bibliothèque › « 🧗 Structurer ma séance d'escalade ». Elle est aussi dans « Nouvelle séance » et dans la recherche. Code : `public/climbplan.js` (sans DOM, testé) et `public/views-climbplan.js`.

**Cotations**
- Le système utilisé est celui de la salle choisie, sinon un système personnel de l'activité, sinon la référence (Fontainebleau pour le bloc, cotation française pour la voie). On peut le changer.
- Le maximum n'est utilisé que s'il est noté (performances max_bloc / max_voie, dans le même système ou par correspondance). Sinon on ne l'invente pas : les plages par défaut sont modestes et affichées « (auto) ».

**Mode « objectif de fin de séance »** (ex. réussir un U8 en dévers et réglettes, en 2 h)
- Déroulé :
  1. échauffement général ;
  2. échauffement en grimpant 4 à 5 crans sous l'objectif (U3–U4 pour U8), dans les styles choisis ;
  3. montée (U5–U6) en pyramide ;
  4. spécifique un cran sous l'objectif, style par style (si au moins 75 min) ;
  5. essais sur l'objectif, avec des repos de 3 min ;
  6. retour au calme.
- Le temps disponible est réparti entre les parties.
- Un conseil honnête est affiché si le maximum est connu : ambitieux, un cran au-dessus, ou dans tes cordes.

**Mode « je structure moi-même »**
- Des parties (bloc, voie, échauffement, renfo, gainage, mobilité, étirements, retour au calme), chacune avec sa durée. On peut les réordonner et ajuster le total au temps disponible.
- Pour chaque partie de grimpe :
  - bloc ou voie ;
  - intensité (tranquille / modéré / intense / max) ;
  - cotations de… à… (ou automatiques) ;
  - un ou plusieurs styles.
- **Plusieurs structures proposées**, les plus adaptées à l'intensité d'abord :
  - bloc : pyramide, blocs max, tour des styles, 4×4, volume facile, technique par style ;
  - voie : voies max, pyramide, voies enchaînées, continuité.
- **« Adapter à ce que j'ai fait avant »** : un choix de l'utilisateur, jamais automatique.
  - La charge des parties précédentes est estimée (doigts, puissance, endurance) d'après la durée, l'intensité et les styles.
  - Au-delà d'un seuil, la partie garde moins de styles à doigts (réglettes, petites prises…) et descend d'un ou deux crans.
  - L'explication est affichée.
- Les parties « corps » sont construites par le générateur habituel, selon le matériel.

**Résultat** : un aperçu. Rien n'est enregistré tant que l'utilisateur ne choisit pas ▶ Lancer ou 💾 Enregistrer. La séance a ses sports (bloc et/ou voie), son objectif et son pourquoi.

**Affichage** : une étape de grimpe s'écrit « 15 blocs · repos 2 min » (et non plus « 15 × 1 blocs »).

**Tests**
- Nouveau fichier `climbplan.test.mjs` (7 tests) : systèmes, objectif U8, peu de temps, parties au choix, structures, cotations, adaptation.
- E2E : les deux modes, choix d'une structure et d'un style, enregistrement.

## Évolution 8.20.0 : « Surprends-moi », échauffement et étirements réglables

**🎲 Surprends-moi** (`public/surprise.js`, sans DOM, testé)
- On ne précise que ce qu'on veut : sport, temps, forme… ou rien. L'orientation est au choix :
  - **🆕 Nouveau pour moi** ;
  - **📈 Pour progresser** ;
  - **🎲 Au hasard** entre les deux.
- **Escalade**
  - Les habitudes viennent de l'historique réel : styles reconnus dans les noms d'exercices, structures notées `cp-…` sur chaque étape de grimpe. On sait combien de fois et quand chacun a été fait.
  - « Nouveau » : les styles et structures les moins faits, avec le nombre de fois et la date (« jamais », « 3 fois, la dernière il y a 12 j »).
  - « Progresser » :
    - si un **objectif de cotation** est actif, la séance est construite en mode objectif ;
    - sinon, les **styles faibles** d'après les maxima notés par style (ex. « Dalle : max U5 contre U7 au mieux »), avec des cotations calées sur le max de ce style (pas sur le max global) ;
    - sans maxima par style, les styles les moins travaillés, en le disant.
  - Fatigué : pas de blocs max ni de 4×4.
- **Autres sports**
  - « Nouveau » : jusqu'à 3 exercices jamais faits (`neverTried` : compatibles avec le matériel, utiles, pas d'intensité maximale), marqués 🆕 et nommés dans le pourquoi.
  - « Progresser » : les axes de progrès du profil, ou l'objectif en cours.
- Le **pourquoi de la surprise** est affiché et enregistré avec la séance. « 🔁 Une autre surprise » change la graine ; une même graine donne la même séance.
- Durée si « peu importe » : 1 h 30 pour l'escalade, la durée habituelle pour le reste.

**Échauffement et étirements**
- Mode objectif : échauffement général Auto, sans, ou 5 à 30 min ; étirements à la fin sans, ou 5 à 30 min. Le temps de grimpe s'ajuste.
- Mode parties : la durée de chaque partie se règle directement dans la liste. On peut toujours ajouter des parties échauffement ou étirements.

**Accès** : Bibliothèque › Structurer ma séance, « Nouvelle séance › 🎲 Surprends-moi », et la recherche.

**Tests**
- Nouveau fichier `surprise.test.mjs` (6 tests) : habitudes, styles faibles, nouveau, progresser (style faible et objectif), fatigue et graine, autre sport.
- E2E : mode objectif sans échauffement et avec étirements, surprise « nouveau », « une autre surprise ».

## Évolution 8.21.0 : idées avec l'endroit à changer, mode ✏️ plus clair

**Idée avec l'endroit** (pour tous les comptes)
- Après avoir écrit son idée, on peut toucher « 📍 Choisir l'endroit à changer ». Une barre en haut dit quoi faire :
  - « Touche l'endroit à changer » ;
  - ou « Changer de page » pour naviguer d'abord, puis « 🎯 Viser ».
- L'élément touché est entouré ; on confirme (« ✓ Joindre ») ou on en choisit un autre.
- L'idée part avec la page, un sélecteur simple (`data-act`/`data-id` quand c'est unique, sinon un chemin court) et le texte visible.
- Le serveur ne garde un sélecteur que s'il ne contient que des caractères sûrs (pas de `<`, pas de script). Le texte est borné à 120 caractères et toujours affiché échappé.

**Côté administrateur**
- En ouvrant l'idée, l'app va sur la bonne page et fait clignoter l'élément.
- **« ✏️ Modifier pour tout le monde »** ouvre directement la bonne fiche :
  - un exercice : sa fiche de modification ;
  - une séance prête : sa fiche ;
  - sinon : le texte, à réécrire pour tout le monde.
- **« 👁 Voir l'endroit »** ferme la fiche et laisse une barre « Revenir à l'idée / ✏️ Modifier ».
- On termine par « ✓ C'est noté » ou « ✗ Refuser » (la personne reçoit la réponse).
- Si l'endroit n'existe plus, l'app le dit.

**Mode ✏️ (mise en page)**
- Titre « Personnaliser l'Accueil » et une explication en quatre lignes :
  - Grand = un bloc sur la page ;
  - Icône = un petit bouton en haut ;
  - Masqué = n'apparaît plus ;
  - ↑ ↓ pour l'ordre, 🎨 pour la couleur.
- **« ✕ Quitter »** en haut (au lieu d'un simple « Édition ») et en bas. S'il y a des changements, l'app demande « Quitter sans enregistrer ? ».
- **« 👁 Aperçu »** montre la vraie page avec les changements, avec une barre « ✏️ Continuer / ✓ Enregistrer ».
- Une seule confirmation pour enregistrer, au lieu de deux (pour un administrateur, c'est le choix « pour moi / pour tout le monde » qui sert de confirmation).

**Tests**
- `global.test.mjs` passe à 18 tests : endroit gardé, sélecteur dangereux ignoré.
- E2E :
  - mise en page : Quitter (rien ne change), Aperçu, Enregistrer ;
  - idée avec l'endroit : B change de page, vise un titre et l'envoie ; l'admin y va, modifie le texte pour tout le monde et le valide ; B voit le nouveau texte.

## Évolution 8.22.0 : trois niveaux d'aide pour créer une séance

Dans Bibliothèque › Structurer ma séance, on choisit d'abord **comment** créer la séance. Le point de départ (objectif, parties, surprise) reste au choix. Code : `public/guide.js` (sans DOM, testé), `climbplan.js` et `views-climbplan.js`.

**🤖 L'app choisit tout**
- La séance complète est proposée.
- Ensuite, chaque partie a sa **durée réglable** (la séance se reconstruit) et un bouton **« 🧭 Options »** pour changer les exercices, ou la structure pour la grimpe.

**🧭 L'app me guide**
- Pour chaque partie (repliée, sauf celle en cours), 3 options sont cochées d'office (« conseillé »), avec « Voir toutes les options ».
- Pour chaque option :
  - ce qu'elle travaille ;
  - au plus 2 conseils : « à faire en premier, ça demande d'être frais », « si tu prends aussi X, fais celui-ci avant », « si tu veux plus de force des doigts, prends plutôt Y », « tes doigts ont déjà travaillé : très léger aujourd'hui ».
- « Je veux plus de… » (force des doigts, résistance…) reclasse les options.
- Un rappel par partie (ex. doigts : seulement après un échauffement des doigts).
- L'**ordre conseillé** est appliqué (le plus exigeant d'abord), avec des remarques (deux exercices très durs pour les doigts, tout sur le même travail…).
- Pour la grimpe, les options sont les structures (blocs max, pyramide, 4×4…), avec ce qu'elles travaillent et où les placer dans la séance.

**✋ Je compose moi-même** : rien n'est imposé. Chaque partie commence vide et on choisit dans la liste de la partie, ou dans tout le catalogue, avec une recherche.

**Nouvelles parties** : 🖐️ Doigts, ⚡ Puissance, 🎯 Technique, 🔋 Endurance, 🛡️ Prévention.

**Assemblage**
- Le temps de la partie est partagé entre les exercices choisis.
- Les séries sont calculées avec le repos, et plafonnées pour les exercices intenses (ex. suspensions max : 5 séries au plus).
- Plusieurs structures de grimpe choisies se partagent le temps de la partie.

**Dans toute séance enregistrée**
- Chaque partie a « 🧭 Options » : l'ordre conseillé (avec « ↕️ Mettre dans l'ordre conseillé ») et d'autres exercices proches, du même rôle et compatibles avec le matériel, à ajouter d'un toucher.

**Correctif** : la barre « Touche l'endroit à changer » (idées) cachait le haut de la page. Elle est maintenant en bas, au-dessus des onglets.

**Tests**
- Nouveau fichier `guide.test.mjs` (6 tests) : options et matériel, conseils, « je veux plus de », ordre, assemblage et temps, exercices proches.
- E2E : les trois niveaux d'aide, la durée d'une partie modifiée, un choix dans les options, et 🧭 dans une séance enregistrée.

## Évolution 8.23.0 : un seul assistant « Créer une séance », les lieux, les objectifs réussis

**Créer une séance (tous les sports)** — un seul assistant en 5 étapes, avec « ‹ Retour / Suivant › » :
1. Comment l'app aide (choisit tout / guide / je compose).
2. Sport (« ＋ Ajouter un sport »), lieu (le matériel du lieu est affiché et utilisé), cotation, forme, temps.
3. Pour quoi : plusieurs objectifs cochés (« ＋ Ajouter des objectifs ici »), ce qu'on veut travailler (ajoutable avec ses mots), zones à ménager ; ou une cotation à réussir (escalade), ou « Surprends-moi ».
4. Le format (parties et temps), proposé puis modifiable.
5. Les exercices, partie par partie.
Le brouillon est gardé (« Reprendre ma séance » sur l'accueil). Les anciens modes séparés sont retirés.

**Lieux** — « 📍 Mes lieux » : salles, falaises (avec secteurs), autres lieux. Chaque lieu montre ce qui y a été fait (séances, blocs et voies par secteur, meilleurs niveaux). Dans le carnet, « Où ? » : en salle / en falaise → le lieu → le secteur, ajoutables sur place.

**Objectifs réussis** — « 🏆 J'ai réussi » : date, perf enregistrée dans le profil (exactement la cible, marquée « déclarée »), objectifs suivants proposés. Liste des objectifs réussis dans Objectifs et dans Progrès. La page Objectifs n'a plus d'onglets : des sections repliables.

**Grandes listes** — les listes de 10 choix ou plus ouvrent un sélecteur : recherche, catégories triées, « ＋ Ajouter » si absent (mesures, sports, capacités…).

**Raccourcis contextuels** — une ou deux indications utiles par page (masquables), qui mènent à la bonne page avec une barre « ‹ Retour ». Les administrateurs peuvent en ajouter.

**Notifications** — réabonnement automatique de l'appareil (au plus une fois par ~20 h), « 🩺 Vérifier cet appareil », et côté admin le suivi du dernier envoi (ciblés, envoyés, expirés, erreurs).

**Mise en page** — toutes les sous-pages ont le même en-tête (« ‹ retour » au-dessus du titre, Paramètres compris) ; liste des sources repliée ; saisie du journal sur toute la largeur ; « Rejoindre un ami » reste écrit (seuls les symboles clairs sont en icône).

**Sécurité** — inchangée : aucun secret côté client, droits d'administration décidés par le serveur, contenus « hint » globaux réservés aux admins.

**Tests** — nouveaux : `goaldone`, `places`, `hints` ; `climbplan`, `push-ics`, `global`, `model` étendus. E2E réécrits pour l'assistant en 5 étapes.

## Évolution 8.24.0 : tous les sports comme l'escalade, rien de caché sur aucun écran

**Tous les sports** (nouveau module `sportplan.js`, sans DOM, testé)
- Course, natation, musculation et renforcement ont des parties « travail » avec intensité et structure au choix, comme la grimpe : fractionné long, 30/30, seuil, côtes, allure objectif ; séries de 100 m, pyramide, sprints, éducatifs ; 5×5, force 5×3, volume, pyramide, montée vers le max ; séries faciles, EMOM, pyramide, séries max, circuit.
- « Atteindre une performance » (étape « Pour quoi ? ») : 10 km en 50 min, 100 kg au squat, 15 tractions… construit toute la séance (échauffement, montée, spécifique, objectif, retour au calme).
- Allures et charges : calculées depuis la cible et la meilleure perf **notée** (ex. 1 km à 5:00 /km ; 5×5 à 80 % = 80 kg). Sans perf notée : consignes au ressenti et invitation à noter sa perf. L'essai à la charge visée n'est proposé que si elle est à 5 % du max noté. Conseil honnête (« ambitieux », « un cran au-dessus », « déjà atteint »).
- Tous les sports sont proposés dans l'assistant, même pas encore ajoutés au profil. Chaque exercice affiche sa dose (durée ou répétitions, charge, repos).

**Rien de caché, sur tous les écrans**
- Vérification automatique de 43 pages, 11 états de l'assistant (escalade, course, muscu, natation, renfo) et 6 fenêtres, à 320, 390, 768 et 1280 px : débordement, texte coupé, défilement de côté, contenu sous la barre du bas. Résultat final : aucun problème.
- Corrigés : descriptions coupées à 2 lignes (maintenant en entier) ; lignes de boutons qui dépassaient à 320 px (sports, parties de l'assistant) ; actions de l'objectif cachées dans un menu « ⋯ » rogné par la carte (maintenant visibles) ; « Je suis à » coincé dans une demi-case.
- Plus d'onglets : les filtres Objectifs (Actifs/Réussis/Archivés/Tous) deviennent des rubriques ; les petits sélecteurs (Bloc/Voie, 3 mois/1 an/Tout, 7/30/90 jours…) deviennent des pastilles.
- Barre du haut : un mot sous les symboles pas évidents (Coach, Bilan, Carnet, Page…) ; le point vert de synchronisation n'apparaît plus (un mot clair seulement s'il y a quelque chose à dire : « 2 à envoyer », « Hors ligne »…).

**Tests** — nouveau `sportplan.test.mjs` (11 tests) ; E2E : 71 étapes, dont « course 10 km en 50 min ».

## Évolution 8.25.0 : les fonctions qui se ressemblaient sont regroupées ; visite de rattrapage

**Regroupements** (les anciennes adresses mènent à la nouvelle page)
1. Créer une séance : « Séance du jour », « Que faire aujourd'hui ? », séance pour un objectif ou une capacité, commandes de l'assistant → l'assistant « Créer une séance », déjà rempli, séance prête (étape 5), modifiable en revenant en arrière.
2. Planning : calendrier, programme et rappels sur une seule page.
3. Assistant : le coach s'appelle « Assistant » et mène aussi à « Créer un exercice avec mes mots ».
4. Projets d'escalade rangés avec les objectifs (en cours, réussis, archivés) ; « Nouveau projet » est un type d'objectif.
5. Test de doigts avec les mesures.
6. Une seule page « Records et mesures » : records des séances, évolution d'un exercice, mesures, maxima, pyramide, test de doigts.
7. « À mesurer » n'apparaît plus qu'une fois (Mon analyse y renvoie).
8. Un seul Journal (séances, blocs et voies, mesures, notes, étapes et records) avec filtres ; Historique et Frise y mènent.
9. Résumé : bilan du mois en image depuis le résumé ; série et badges une seule fois.
10. « Mon analyse » : capacités, tendances et diagnostics, pourquoi ces conseils, Lab.
11. « Mon corps et mes préférences ».
12. « Mes sports » avec les cotations et les styles d'escalade.

**Visite de rattrapage** (`catchup.js`, sans DOM, testé) : quand plusieurs mises à jour ont été ratées depuis la dernière visite, une seule visite reprend tout (un résumé d'abord, sans doublon — le texte le plus récent gagne —, les pages regroupées suivies). La barre et « Quoi de neuf » disent combien de mises à jour ont été ratées et les listent (connues sans Internet).

**Tests** — nouveau `catchup.test.mjs` (4) ; E2E mis à jour (projets dans Objectifs, pyramide et maxima dans Records et mesures, cotations dans Mes sports, séance du jour → assistant, visite de rattrapage). Vérification de mise en page à 320/390/768/1280 px : aucun problème.

## Évolution 8.25.1 : dernières connexions visibles par les administrateurs
- Le serveur note la **dernière visite** de chaque compte connecté (colonne `users.last_seen`, ajoutée sans rien casser ; au plus une écriture toutes les 10 minutes par compte). Avant, seule la date de la dernière *identification* était connue : un membre resté connecté semblait absent.
- Admin › Comptes : combien de membres sont venus aujourd'hui, sur 7 jours et sur 30 jours ; « 🕑 Dernières connexions » (les 10 plus récentes, date et heure) ; tous les comptes triés par dernière visite ou par inscription.
- Confidentialité inchangée : l'admin voit l'identité du compte et son activité (date de visite, nombre de séances), jamais les séances, performances ou profils. Réservé aux administrateurs (vérifié par le serveur).
- Test D1 : la dernière visite est connue pour chaque compte, et aucun champ en trop n'est renvoyé.

## Évolution 8.26.0 : V1 — séances structurées, explications, administration outillée

Détail complet, architecture du Studio et limites : `CHANGELOG.md`. Audit préalable : `docs/V1_AUDIT.md`.

- **Créateur** : 7 étapes, niveau de structure (Libre → Très précis), phases multi-activités avec pause, rôle, but ponctuel (jamais un objectif sans action explicite), priorités, limites, fatigue, verrous 🔒 / ✏️ / 🤖, paramètres escalade structurés. Propositions classées par phase avec raisons catégorisées ; analyse globale avec suggestions à appliquer / modifier / ignorer / annuler ; génération seulement après validation.
- **Objectif avec l'IA** : fiche modifiable, « Comment le sais-tu ? », aucune cible inventée, champs inconnus ignorés.
- **Admin** : signalements (recherche, récents, détail), propositions (réponse, historique), bibliothèque commune distincte du catalogue officiel avec métadonnées explicables, **Studio** (brouillon → vérifications → publication confirmée → retour arrière, versions, diff, journal), IA admin limitée aux brouillons, **Laboratoire**.
- **Mise en page** : liste des comptes (admin) et chiffres clés corrigés à 320 px (débordement horizontal). Pages admin, Studio, Lot, Journal, Laboratoire et Bibliothèque commune vérifiées sans débordement à 320 / 390 / 768 / 1280 px (script Playwright, Chromium).
- **Reproductibilité** : `package-lock.json` versionné, versions épinglées, `npm ci` vérifié.

### Vérification 8.26.0 (commandes réellement lancées)

| Commande | Résultat |
|---|---|
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci` | 3 paquets installés depuis `package-lock.json` (jsqr 1.4.0, playwright 1.63.0), 0 vulnérabilité |
| `npm run check` | OK (syntaxe de tous les fichiers + JSON) |
| `npm test` | 47 fichiers, tous OK — dont `studio.test.mjs` (14), `sessionmeta.test.mjs` (4), `migration.test.mjs` (10, tables Studio sur une ancienne base, sans perte) |
| `PW_EXEC=/opt/pw-browsers/chromium npm run test:e2e` | **73 étapes OK**, aucune erreur JavaScript — dont le Studio (brouillon, vérifications, publication, journal, retour arrière, Laboratoire, refus à un membre) et le brouillon de structure du créateur conservé hors ligne après rechargement |
| Script Playwright de mise en page (pages admin, Studio, Lot, Journal, Laboratoire, Bibliothèque commune) | aucun débordement à 320 / 390 / 768 / 1280 px après correction |

Non vérifiable ici : la qualité des réponses de Workers AI en production (tests avec un modèle simulé), le rendu sur de vrais téléphones. Voir les limites dans `CHANGELOG.md`.

## Évolution 8.27.0 : V2 — construire une séance en chaîne de réglages

Détail complet (fonctionnalités, fichiers, migrations, fonctions réutilisées / nouvelles, déploiement, retour arrière, limites et risques) : `CHANGELOG.md`. Audit préalable : `docs/V2_AUDIT.md`.

- **Créateur** : objectif de séance (quoi → précisément → quand : début, milieu, fin, toute la séance ou une phase précise) ; chaque phase se règle en chaîne numérotée (type → objectif → précisément → réglages du type → intensité et compromis → lieu → contraintes → ce que l'app décide) ; filtres à plusieurs niveaux (garder / préciser / remplacer / retirer) ; budget temps avec déplacements et sacrifices proposés ; transitions ; « Et si… ? » ; « Modifier avec l'IA » (plan affiché avant application, verrous respectés) ; ADN, modules, stratégies, mémoire des décisions, séance inhabituelle.
- **Comprendre** : maîtrise des capacités, transferts, carte des relations, objectif IA enrichi (identifiants connus seulement), préférences estimées, journal visuel (photos réduites, liens vidéo https).
- **Admin** : rôles vérifiés par le serveur, santé des données (corrections = brouillons), maintenance, propositions de code (validation par un autre admin, jamais de déploiement), comparer / restaurer une version (restauration = brouillon).

### Vérification 8.27.0 (commandes réellement lancées)

| Commande | Résultat |
|---|---|
| `npm run check` | OK |
| `npm test` | 50 fichiers, tous OK — dont `v2chain.test.mjs` (9), `v2engine.test.mjs` (11), `adminv2.test.mjs` (8), `model.test.mjs` avec les nouvelles collections |
| `PW_EXEC=/opt/pw-browsers/chromium npm run test:e2e` | **74 étapes OK**, aucune erreur JavaScript — dont le nouveau scénario « chaîne de réglages » (objectif placé puis déplacé, lieu d'une phase + déplacement, filtres de séance, prévisualisation) et l'étape Studio (santé des données, propositions de code) |
| Scripts Playwright de mise en page (créateur à chaque étape, santé des données, maintenance, code, Studio, préférences, objectif, journal, admin) | aucun débordement à 320 / 390 / 768 px |

Non vérifiable ici : la qualité réelle de Workers AI (réponses simulées dans les tests), le rendu sur de vrais téléphones. L'E2E a été lancé avant le changement de numéro de version (8.26.0 → 8.27.0, sans autre modification du code).
