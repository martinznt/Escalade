# CHANGELOG — Séances entraînement

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
