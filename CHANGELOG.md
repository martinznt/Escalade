# CHANGELOG — Séances entraînement

## 8.27.0 — V2 : construire une séance en chaîne de réglages, intelligence explicable, administration outillée

Base : 8.26.0. Audit préalable (existant / à étendre / nouveau) : `docs/V2_AUDIT.md`. Aucune fonction existante n'a été remplacée : le créateur, le modèle de phase, le moteur de propositions et le Studio de 8.26 ont été étendus.

### Créer une séance : une chaîne de réglages selon le type de séance
- **Objectif de la séance à n'importe quel moment** (étape « Pour quoi ? ») : 1 · quoi (technique, endurance, force, puissance, mobilité, performance) → 2 · précisément (sous-objectifs propres au sport, priorité 1 à 4) → 3 · quand (au début, au milieu, à la fin, toute la séance) ; dans « Ta structure », il peut aussi être posé sur une **phase précise**. « Réussir une cotation » crée cet objectif (à la fin par défaut, déplaçable).
- **Régler une phase = une chaîne numérotée** qui ne montre que ce qui a du sens pour son type : 1 · type → 2 · objectif (rôle + but du jour) → 3 · précisément (sous-objectifs priorisés, règles « X ne prend jamais le dessus sur Y », capacités précises) → 4 · réglages du type (escalade : cotations, styles voulus / exclus, essais, volume, structure ; sports : mouvement et structure ; filtres contextuels) → 5 · intensité, durée, fatigue, **curseurs de compromis** (performance ↔ récupération, volume ↔ intensité, variété ↔ répétition, difficulté ↔ réussite, spécificité ↔ généralisation, fatigue ↔ stimulation) → 6 · **lieu propre à la phase** (même lieu, autre lieu + déplacement, lieu libre) → 7 · je veux / je ne veux pas (pas d'échec, volume max, à limiter, matériel interdit) → 8 · ce que l'app décide (exercices, ordre, repos). Chaque maillon réglé est coché ; tout le reste est décidé par l'app.
- **Filtres à plusieurs niveaux** : filtres de toute la séance (selon l'activité), hérités par chaque phase qui peut les **garder, préciser, remplacer ou retirer**. Tous les filtres s'additionnent ; si plus aucun exercice ne répond, l'app le dit et propose **quels filtres relâcher**.
- **Budget temps réel** : phases + déplacements ; « Les contraintes actuelles nécessitent 145 min pour 120 min disponibles » ; ce qui peut être sacrifié (du moins au plus coûteux, avec le compromis), appliqué seulement sur clic. **Transitions** : changement de lieu, matériel non transportable, déplacement non renseigné, passage intense → performance (récupération proposée), échauffement spécifique.
- **Propositions** : sous-objectifs, filtres, lieu de la phase, curseurs et contraintes entrent dans le classement ; libellés de pertinence pour la phase (« le plus adapté à tes contraintes actuelles », « adapté mais plus fatigant », « bon pour la capacité mais moins spécifique », « alternative ») — jamais « le meilleur ».
- **Améliorations** : problème → proposition → bénéfice → compromis ; Appliquer / Modifier / Ignorer (souvent ignorée : signalé, jamais caché).
- **🔮 Et si… ?** sur la séance entière (−15 / +15 min, moins / plus intense, retirer, ajouter de la technique, autre lieu, remplacer un exercice) : conséquences décrites (durée, charge, temps intense avant la performance, capacités, points d'attention), « pas une prédiction ».
- **✍️ Modifier avec l'IA** : « J'ai seulement 1 h 20 », « Garde exactement la partie performance », « Réduis uniquement la préparation »… → plan affiché (ce qui change, ce qui reste, pourquoi, conséquences, compromis) puis **Appliquer**. Les 🔒 ne bougent jamais. L'IA du serveur ne fait que traduire la demande en opérations validées.
- **Prévisualisation** : lieux, déplacements, filtres, sous-objectifs, objectif et son moment, **charge estimée** (indicative).
- **ADN de séance** (structure en %, sans exercices, réutilisable pour n'importe quelle durée) ; **modules** (phases réutilisables) insérés avec analyse de compatibilité ; **plusieurs chemins** vers un objectif (très spécifique / mixte / préparation physique) comparés.
- **Mémoire des décisions** (chemin choisi et pourquoi, suggestions appliquées ou ignorées, modifications, séance inhabituelle) ; **séance inhabituelle** détectée avant génération, avec « Pourquoi ? » (compétition, préparation, programme, autre) — descriptif, jamais médical.

### Comprendre
- **Maîtrise des capacités** : Découverte → Initiation → Développement → Solide → Maîtrisé, fondée sur les données ; sinon « ⚠️ Données insuffisantes » avec quoi faire.
- **Transferts entre activités** (relation du modèle et sa confiance, « pas une mesure de ton transfert réel »).
- **Carte des relations** d'un objectif (capacités → mesures → exercices → activités), chaque lien avec son « pourquoi ».
- **Objectif avec l'IA** : type, critères de réussite, exercices et figure liés (identifiants connus seulement) ; « Pourquoi cette fiche ? » en quatre groupes : informations connues, relations existantes, estimations, incertitudes.
- **Préférences estimées** (durée, lieu, intensité, structure) avec leur « pourquoi », confirmables ou corrigibles.
- **Journal visuel** : photos (réduites, synchronisées), liens vidéo (https, pas de stockage vidéo), captures et notes liés à une séance ; filtre « 📷 Photos et vidéos » du Journal.
- **Expériences** : critères observés en plus de l'hypothèse, de la période et de l'avant / après.

### Administration
- **Rôles** vérifiés par le serveur : contenu, intelligence, utilisateurs, technique, super-administrateur (tout administrateur existant = super-administrateur ; il en faut toujours un).
- **🩺 Santé des données** : exercices sans capacités, capacités sans métrique, objectifs difficiles à évaluer, doublons, relations contradictoires, orphelins, anciennes structures ; chaque correction devient un **brouillon** du Studio.
- **🛠️ Maintenance** : signalements regroupés (toujours) + pistes de l'assistant (s'il est activé) ; rien n'est appliqué.
- **💻 Propositions de code** : diff → analyse d'impact (fichiers, domaines, migration, alertes) → tests déclarés → validation par un **autre** administrateur → export `.patch`. **L'app ne déploie jamais de code** ; secrets et exécution dynamique refusés.
- **Versions** : comparer deux versions, **restaurer = brouillon** (publication toujours manuelle).

### Fichiers
- **Ajoutés** : `public/intents.js`, `public/filters.js`, `public/budget.js`, `public/sessionchain.js`, `public/whatif.js`, `public/dna.js`, `public/strategy.js`, `public/knowledge.js`, `public/sessionedit.js`, `server/health.js`, `docs/V2_AUDIT.md`, `tests/v2chain.test.mjs`, `tests/v2engine.test.mjs`, `tests/adminv2.test.mjs`.
- **Modifiés** : `public/phase.js`, `public/phaseplan.js`, `public/climbplan.js`, `public/shared.js`, `public/items.js`, `public/views-climbplan.js`, `public/views-profile.js`, `public/views-progress.js`, `public/views-settings.js`, `public/views-studio.js`, `public/style.css`, `public/sw.js`, `server/ai.js`, `schema.js`, `worker.js`, `tests/e2e.mjs`, `tests/model.test.mjs`.

### Migrations D1 (idempotentes, sans perte)
- Colonne `users.admin_roles TEXT NOT NULL DEFAULT ''` (vide = super-administrateur : aucun admin existant ne perd de droit).
- Table `code_proposals` (`CREATE TABLE IF NOT EXISTS`).
- Données personnelles nouvelles (`decision`, `sdna`, `smodule`, `media`) et champs ajoutés (`goal.criteria/exercises/source`, `lab.criteria`) : dans `user_items` existant, même synchronisation, même fusion, même hors ligne. Phases : champs ajoutés avec valeurs par défaut ; les anciennes séances restent lisibles.

### Fonctions réutilisées / nouvelles
- **Réutilisées** : `normalizePhase(s)`, `fitDurations`, `proposeForPhase`, `analyzeSession`, `applySuggestion`, `buildFromParts`, `capacityState`, `graphFromGoal`, `labReport`, `compressPhoto`, `cleanGlobal`, Studio (`csCreate`, `csPublish`, `diffState`, `cleanChange`), `user_items` + outbox.
- **Nouvelles** : `subIntents`, `intentCaps`, `cleanRules` ; `effectiveFilters`, `intersect`, `filtersFor` ; `resolvePlaces`, `transitions`, `budget` ; `placeObjective`, `chainFor`, `chainStatus` ; `simulate`, `metrics` ; `dnaFromPhases`, `phasesFromDna`, `insertModule` ; `strategies`, `decision`, `recall`, `unusualPlan` ; `capMastery`, `transfers`, `relationMap`, `estimatedFormats` ; `parseRequest`, `planEdit`, `cleanOps` ; `dataHealth`, `groupBugs`, `analyzeDiff`.

### Déploiement
1. `npm ci` puis `npm run check`, `npm test`, `PW_EXEC=… npm run test:e2e`.
2. (Recommandé) sauvegarde D1 : `wrangler d1 export <base> --output sauvegarde.sql`.
3. Déployer comme d'habitude (Cloudflare) ; au premier appel, le Worker ajoute la colonne et la table (idempotent). Les appareils voient « Mettre à jour » puis la visite des nouveautés.

### Retour arrière
- Code : redéployer la version précédente (`git revert` de la fusion, ou redéploiement du commit 8.26.0). La colonne `admin_roles` et la table `code_proposals` peuvent rester : l'ancienne version les ignore (aucune suppression nécessaire).
- Données : les éléments des nouvelles collections (décisions, ADN, modules, médias) restent en base et ne sont simplement pas affichés par l'ancienne version ; rien n'est supprimé. Contenu commun : retour arrière par lot depuis le Studio.

### Limites et risques
- L'IA (maintenance, modification guidée, objectif) est testée avec des réponses simulées ; la qualité réelle de Workers AI n'est pas vérifiable ici. Toute sortie est validée côté serveur.
- La modification guidée comprend des formulations courantes (durées, garder / réduire / retirer / ajouter, intensité) ; au-delà, elle passe par l'IA si elle est activée, sinon elle le dit.
- Les stratégies sont des gabarits explicables (parts de temps et capacités), pas un plan scientifique garanti.
- Le temps de déplacement est celui que tu saisis (pas de calcul d'itinéraire).
- Vidéos : lien seulement, pas de stockage. Photos : JPEG réduit (≈ 90 Ko).
- Les rôles d'administration restent grossiers (5 rôles) ; pas de droits par élément.
- Propositions de code : l'app ne les applique ni ne les déploie ; c'est volontaire.
- Pas de test sur de vrais téléphones ; mise en page vérifiée dans Chromium à 320 / 390 / 768 / 1280 px.

## 8.26.0 — V1 : séances structurées, explications, administration outillée

Base : 8.25.1. Audit préalable : `docs/V1_AUDIT.md`. Le détail des versions précédentes est dans `FINAL_AUDIT.md`.

### Créateur de séance (tous sports)
- **Niveau de structure** : Libre, Léger, Modéré, Précis, Très précis — aussi pour « Surprends-moi ». Précis verrouille les durées ; Très précis verrouille aussi activité, but et intensité.
- **Phases** (`public/phase.js`) : une séance = des phases, chacune avec son activité (séance multi-activités : 2 h bloc → 30 min pause → 2 h voie), sa durée, son rôle, son but ponctuel, ses priorités, son intensité, sa fatigue acceptée, ce qu'il faut favoriser ou limiter, ses contraintes, les exercices imposés / interdits et des **verrous** 🔒 (imposé) / ✏️ (modifiable) / 🤖 (l'app décide). Les anciennes parties restent compatibles (valeurs par défaut déterministes).
- **Escalade** : styles voulus / exclus, système de cotation, nombre d'essais maximal, volume, type d'essais (découverte, travail, enchaînement, à la limite, performance du jour). Aucune équivalence de cotation n'est inventée.
- **But local ≠ objectif** : l'intention du jour reste dans la séance ; elle ne devient un objectif du compte que par « Enregistrer aussi comme objectif ».
- **Parcours en 7 étapes** : comment → où → pourquoi → ta structure → contenu → améliorer → valider, puis « Générer la séance ».
- **Propositions par phase** (`public/phaseplan.js`), classées (« le plus adapté à tes contraintes actuelles », « adapté », « alternative »), avec « Pourquoi ? » en raisons catégorisées : 📊 donnée connue, 📐 règle du modèle, 🤔 déduction, ❔ information manquante. Une raison n'est citée que si elle est vraie pour cet exercice.
- **Analyse globale** : fatigue avant une performance, phase trop courte, échauffement ou retour au calme manquant, capacité répétée en intense, pas de mur au lieu choisi, charge récente, priorité oubliée, séance très longue. Chaque suggestion : Appliquer / Modifier / Ignorer, avec annulation et retour à la version d'origine ; jamais appliquée seule ; les verrous sont respectés.

### Objectif avec l'IA
- Fiche structurée **modifiable avant l'enregistrement** : nom, description, sport, capacités pondérées, indicateurs, mesure, cible, étapes, horizon, confiance, informations manquantes, « Comment le sais-tu ? ».
- Une cible chiffrée n'est gardée que si le nombre figure dans ce que l'utilisateur a écrit ; les champs inconnus sont ignorés ; rien n'est enregistré sans relecture.

### Administration
- **Signalements** : recherche (sans accents, plusieurs champs), récents (< 48 h) mis en avant, détail technique repliable, statut ouvert / traité (journalisé).
- **Propositions** : réponse facultative à l'auteur, historique (traitée par qui, quand).
- **Bibliothèque commune** distincte du **catalogue officiel** (🗂 Séances prêtes, vérifiées et sourcées). Métadonnées **automatiques et explicables** (`public/sessionmeta.js`) : activités, durée, niveau estimé, famille de capacités dominante, rôle dominant, matériel — chacune avec « Classée ainsi parce que… ». L'ossature des phases est publiée pour le classement ; le but écrit et l'intention du jour restent privés. Les copies enregistrées restent indépendantes.
- **Studio** 🧪 (voir l'architecture plus bas) : brouillons, vérifications, publication confirmée, versions, différences avant / après, retour arrière, journal.
- **IA admin sûre** : elle ne rédige que des brouillons (FAQ, annonce, texte, style, intention, exercice), validés champ par champ par le serveur ; jamais de publication, jamais de code.
- **Laboratoire** 🧠 : reformulation, règles en jeu, questions à préciser, solutions avec avantages / inconvénients / risque ; une solution peut devenir un brouillon. Simulation des règles actuelles d'analyse de séance sur des séances d'exemple.

### Reproductibilité
- `package-lock.json` versionné (retiré du `.gitignore`), versions épinglées (`playwright` 1.63.0, `jsqr` 1.4.0), `engines.node >= 22` (les tests Worker utilisent `node:sqlite`). `npm ci` fonctionne (voir commandes).

### Architecture du Studio
- **Tables D1** (créées par `CREATE TABLE IF NOT EXISTS` au premier appel, rien de supprimé, valeurs par défaut) : `change_sets` (lot : titre, note, source, statut draft / published / rolled_back / discarded, auteur, dates de publication et de retour arrière), `change_items` (opérations du lot : `put` / `hide` / `delete`, données, état d'avant capturé à la publication), `content_versions` (numéro de version par élément), `test_results` (vérifications de chaque lot), `releases` (une par publication), `audit_events` (qui, quoi, quand, avant / après, vérifications).
- **Règles pures** : `server/studio.js` (`cleanChange`, `diffValues`, `diffChange`, `runChecks`, `cleanAdminDraft`, `cleanLab`), toutes passant par `cleanGlobal`.
- **Flux** : brouillon (invisible pour les membres) → vérifications (validité, doublons, lot non vide, chaque opération a un effet, aucun contenu actif `<script>` / `javascript:` / `on…=`, limite de 2 000 éléments) → publication **seulement avec `confirm: true`** (tout écrit d'un seul lot D1) → retour arrière (refusé si l'élément a changé depuis, sauf retour forcé explicite).
- Les modifications « ✏️ pour tout le monde » existantes et les propositions acceptées passent aussi par un lot publié aussitôt : elles sont versionnées, journalisées et annulables.
- Routes (toutes revérifient le rôle administrateur côté serveur) : `GET/POST /api/admin/studio`, `GET/PUT /api/admin/studio/:id`, `POST /api/admin/studio/:id/{check,publish,rollback,discard}`, `GET /api/admin/versions/:kind/:id`, `GET /api/admin/audit`, `POST /api/admin/studio/ai`, `POST /api/admin/lab`.
- Journal : aussi les rôles, statuts de signalement, décisions sur les propositions, intentions communes. Aucun mot de passe, aucune donnée d'entraînement ; à la suppression d'un compte, l'historique reste et l'auteur devient « compte supprimé ».

### Tests exécutés (commandes réelles, résultats de cette version)
Voir la section « Vérification 8.26.0 » de `FINAL_AUDIT.md`.

### Points non vérifiables ici / limites
- **IA réelle** : les routes IA sont testées avec un modèle simulé ; la qualité des réponses de Workers AI en production n'est pas vérifiable ici. Les sorties sont de toute façon validées côté serveur.
- **Laboratoire** : il ne modifie pas les règles de l'app (elles sont du code) ; une solution qui demande du code est signalée comme telle et doit passer par une mise à jour. La simulation porte sur les règles d'analyse de séance existantes, sur des exemples fixes.
- **Publication concurrente** : deux administrateurs qui publient le même brouillon à la même seconde ne sont pas sérialisés par un verrou D1 (la seconde publication est refusée si la première est déjà enregistrée ; une course exacte reste théoriquement possible).
- **Brouillons sans code** : formulaires pour FAQ, annonce, texte et style ; les autres types (exercice, séance prête, cotation, format, mise en page) se modifient à leur place dans l'app et passent par un lot publié aussitôt.
- Les estimations (niveau, métadonnées, suggestions) sont indicatives : ni garantie, ni diagnostic médical, ni classement de personnes.
- Pas testé sur de vrais téléphones : les vérifications de mise en page sont faites dans Chromium à 320 / 390 / 768 / 1280 px.
