# V2 — Audit du cahier des charges (base 8.26.0)

Audit fait en lisant le code réel avant toute modification. Base vérifiée : `npm test` (47 fichiers) et E2E (73 étapes) verts en 8.26.0.
Règle suivie : ne rien recréer ; étendre ce qui existe ; n'ajouter que ce qui manque vraiment.

Légende : **Existe** (réutilisé tel quel) · **Étendre** (même module, nouveaux champs / règles) · **Nouveau**.

| § | Demande | État dans 8.26.0 | Décision |
|---|---|---|---|
| 1 | Ossature → optimisation | Créateur en 7 étapes (`views-climbplan.js`, `S.cp`), phases (`phase.js`), propositions (`phaseplan.js`) | **Étendre** : filtres, contraintes et budget dans « Ta structure » ; prévisualisation enrichie |
| 2 | Multi-phase | `phase.js` (phases multi-activités, pause) | **Existe** |
| 3, 48 | Lieu par phase, déplacement, matériel non transportable | Un seul lieu par séance (`S.cp.env`), lieux `env` avec matériel (`items.js`) | **Étendre** `phase.js` : `place` (même / autre / libre), `travelMin` ; **Nouveau** `budget.js` (transitions, matériel non transportable) |
| 4–6, 46–47 | Filtres contextuels, multi-niveaux (global → phase → exercice), héritage | Styles / cotation / essais pour l'escalade seulement | **Nouveau** `filters.js` (définitions par activité, héritage garder / préciser / remplacer / retirer, intersection) |
| 7 | Intentions structurées + sous-objectifs, extensibles par l'admin | Intentions par sport (`intentions.js`), priorités = capacités | **Nouveau** `intents.js` (arbre familles → sous-objectifs → capacités) ; type de contenu commun `subintent` pour l'admin |
| 8 | Priorités relatives 1–4 + règles « jamais au-dessus de » | Priorités sans poids | **Étendre** `phase.js` (`subIntents: [{id, prio}]`, `rules`) |
| 9 | Curseurs de compromis | — | **Nouveau** (champ `tradeoffs` des phases et de la séance) |
| 10 | Je veux / je ne veux pas / je laisse décider | `favor`, `avoid`, `imposed`, `forbidden`, verrous 🤖 | **Étendre** : pas d'échec, volume max, styles et matériel interdits |
| 11 | Verrouillage | Verrous durée / activité / but / intensité / exercices / ordre | **Étendre** : lieu, style |
| 12–13 | ADN de séance, modules | — | **Nouveau** `dna.js` + collections `sdna`, `smodule` |
| 14 | Transitions | Suggestion « pause avant la performance » (`analyzeSession`) | **Étendre** dans `budget.js` (lieu, matériel, intensité, échauffement spécifique) |
| 15 | Budget temps réel | `fitDurations` (somme exacte, verrous) | **Étendre** : transitions / déplacements comptés, dépassement annoncé, quoi sacrifier |
| 16–17 | Propositions classées, jamais « meilleur » | `proposeForPhase` (libellés de pertinence, raisons vraies) | **Étendre** : sous-intentions, priorités, phase suivante, lieu, compromis (« adapté mais plus fatigant ») |
| 18 | Analyse des compromis | `analyzeSession` + Appliquer / Modifier / Ignorer | **Étendre** : chaque suggestion donne bénéfice et compromis |
| 19 | Prévisualisation | Étape 7 « Valider » | **Étendre** : lieux, déplacements, filtres, priorités, charge estimée |
| 20 | Simulation « et si ? » | `whatIf` (volume d'une capacité) | **Nouveau** `whatif.js` au niveau de la séance entière |
| 21 | Plusieurs chemins | `goalPaths` (figures seulement) | **Nouveau** `strategies()` pour tout objectif (spécifique / mixte / préparation physique) |
| 22 | Objectif avec IA | Fiche modifiable, « Comment le sais-tu ? » (8.26) | **Étendre** : type, métriques, critères, exercices, figures ; distinction connu / relation / estimation / incertitude |
| 23 | Mémoire des décisions | Décisions d'habitudes seulement (`habit`) | **Nouveau** collection `decision` |
| 24 | Mémoire des préférences | `learnedPreferences` (exercices) + `pref` | **Étendre** : durées, intensités, lieux, formats, avec « pourquoi » et correction |
| 25 | « L'application ne sait pas » | Manques signalés ici et là | **Nouveau** composant commun « ⚠️ Données insuffisantes » avec actions |
| 26 | Séance inhabituelle | `atypicalSessions` (après coup) | **Étendre** : avant génération, avec « Pourquoi ? » mémorisé |
| 27 | Expériences | `lab` (hypothèse, avant / après) + `labReport` | **Étendre** : séances concernées, critères, période |
| 28 | Journal visuel | Photo de projet (`photo`, JPEG réduit synchronisé) | **Étendre** : collection `media` liée à une séance / un objectif ; vidéo = lien ou note (pas de stockage vidéo) |
| 29–30 | Conversation liée à la séance, explication avant application | Commandes naturelles (`commands`), coach | **Nouveau** `sessionedit.js` : plan (change / inchangé / pourquoi / conséquences / compromis) puis Appliquer ; verrous respectés |
| 31 | Maîtrise des capacités | `capacityState`, `mastery` (figures) | **Nouveau** `capMastery` (Découverte → Maîtrisé, fondé sur les données) |
| 32 | Transfert entre activités | Poids capacités par activité (`ACTIVITIES.caps`) | **Nouveau** `transfers()` avec confiance expliquée |
| 33 | Carte des relations | `trainingMap`, `graphFromGoal` | **Étendre** : objectif → capacités → métriques → exercices → activités, « pourquoi » par lien |
| 34 | Santé des données | — | **Nouveau** `server/health.js` + page Studio ; corrections proposées en brouillon |
| 35–37, 39 | Studio, IA admin, Laboratoire, versions | Studio 8.26 (brouillons, vérifications, publication, retour arrière, journal, Laboratoire) | **Étendre** : sections, variantes, comparer / restaurer une version |
| 38 | IA qui modifie le code | — | **Nouveau** « Propositions de code » : diff, impact, tests déclarés, validation ; **jamais de déploiement depuis l'app** (limite assumée) |
| 40 | IA de maintenance | — | **Nouveau** : analyse des signalements → propositions en attente de validation |
| 41 | Permissions admin | Un seul rôle `is_admin` | **Étendre** : rôles contenu / intelligence / utilisateurs / technique / super-admin, vérifiés côté serveur (admins existants = super-admin) |
| 42–43 | Sécurité, hors ligne | Isolation, CSRF (Origin), sessions, outbox idempotente | **Existe** ; les nouvelles données passent par `user_items` (même sync, mêmes conflits) |

## Réutilisé sans changement
`fitDurations`, `normalizePhases`, `analyzeSession` (base), `proposeForPhase` (base), `buildFromParts`, `capacityState`, `exerciseStats`, `loadAnalysis`, `atypicalSessions`, `trainingMap`, `compressPhoto`, `user_items` + outbox, Studio (`server/studio.js`).

## Hors de portée assumé
- Déploiement de code depuis l'app (§38, §P6) : proposition, diff et validation seulement ; le déploiement reste manuel (git / Cloudflare).
- Stockage de vidéos : seulement un lien ou une note (pas de stockage de fichiers volumineux dans D1).
