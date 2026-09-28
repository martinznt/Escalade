# V1 — Audit ciblé de l'existant (base 8.25.1)

Audit fait en lisant le code réel, pas le README. Vérifié en exécutant `npm run check`, `npm test` (44 fichiers) et `npm run test:e2e` (71 étapes) sur la base 8.25.1 avant toute modification V1.

## 1. Où se crée une séance aujourd'hui (réalité du code)

| Élément | Fichier | Rôle réel |
|---|---|---|
| Assistant « Créer une séance » (5 étapes) | `public/views-climbplan.js` (état `S.cp`, brouillon `sea:climbplan`) | **Le vrai créateur** depuis 8.23 : toutes les entrées (Séance du jour, Que faire aujourd'hui, objectif, commandes) y mènent (`openWizard`). |
| Parties d'une séance | `S.cp.parts` : `{ type, minutes, kind, intensity, styles, structure, pick, activity, from, to, adapt, label }` | Déjà multi-activités (une partie `climb` bloc/voie, `work` course/natation/muscu/renfo, `main` exercices d'un sport, parties corps). |
| Construction | `public/climbplan.js` `buildFromParts()` | Construit la séance partie par partie ; parties « corps » via `generator.planSession/generateFromPlan` (pas de 2ᵉ générateur) ; grimpe via `buildClimbPart` ; sports via `sportplan.buildWorkPart`. |
| Options par partie | `public/guide.js` `partOptions()` (score de pertinence, conseils), `orderAdvice()` | Classement local déjà présent, mais les raisons ne sont pas catégorisées. |
| Remplacement intelligent | `public/generator.js` `alternatives()` | Raisons « même capacité / même objectif / même matériel » ; réutilisé tel quel. |
| Ancien générateur « Séance sur mesure » | `public/views-library.js` (`S.gen`, route `library/generate`) + `views-gen.js` | Plus d'entrée utilisateur depuis 8.25 ; gardé (tests, réglages admin des formats/intentions). |
| Formats | `public/format.js` (`PART_TYPES`, presets, `splitMinutes`) | Réutilisé pour les durées. |
| Cotations / styles | `public/grading.js`, `public/model.js` | Correspondances structurées (`maps`) ; `fromReference` ne crée rien sans correspondance. |

**Décision** : la V1 étend `S.cp` + `climbplan.js` (le créateur réel) au lieu de créer un second parcours. Les instructions citent `S.gen/views-gen.js` : ce parcours n'est plus l'entrée principale depuis 8.23 ; le modifier aurait créé deux créateurs concurrents.

## 2. Objectifs et IA
- `/api/ai/goal` (`server/ai.js` `buildGoal/cleanGoal/aiGoal`) + `public/views-profile.js` (`goalWrite`, `goalAi`, `goalAiSave`, repli `localGoal`).
- Manques : la fiche n'est pas modifiable avant l'enregistrement ; `cleanGoal` garde une cible chiffrée même si le texte n'en contient pas ; pas de « Comment le sais-tu ? » ; description, activité, indicateurs et informations manquantes absents.

## 3. Administration
- Activation par `EDIT_PASSWORD` (serveur uniquement, `safeEq` sur empreinte) ; chaque route `/api/admin/*` revérifie `u.isAdmin` côté serveur.
- Contenu global : table `global_content`, `server/global.js` `cleanGlobal` (12 types), `globalPut` écrit **directement en production** : pas de brouillon, pas de version, pas de journal, pas de retour arrière.
- Signalements : liste + filtre ouvert/traité + changement de statut ; pas de recherche.
- Propositions : acceptation/refus + réponse ; l'historique n'est visible que par statut.
- Comptes : liste, rôles, dernière visite (8.25.1), aucune donnée d'entraînement.
- Bibliothèque commune (`shared_sessions`, scope `common`) : `estimateLevel` seulement ; pas de métadonnées explicables.

## 4. Reproductibilité
- `package-lock.json` est dans `.gitignore` → `npm ci` impossible. Versions en `^`.

## 5. Réutilisé / modifié

**Réutilisé sans changement** : `planSession/generateFromPlan`, `alternatives`, `partOptions` (score), `buildClimbPart`, `buildWorkPart`, `estimateLevel`, `cleanGlobal`, `sanitizeForPublication`, sync `user_items`, `ADD_COLUMNS` (migrations idempotentes).

**Modifié** : parties → phases normalisées (`public/phase.js`, compatible anciennes parties) ; créateur (niveau de structure, étape « Ta structure », propositions, améliorations, validation) ; `cleanGoal` (cible seulement si présente dans le texte) + fiche éditable ; `globalPut/DELETE` passent par le journal (`change_sets` + `audit_events`) ; admin (recherche signalements, historique propositions, Studio, Laboratoire) ; publication commune (métadonnées structurées + raisons).
