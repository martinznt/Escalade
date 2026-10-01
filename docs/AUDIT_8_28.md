# Audit 8.28 — parcours réel d'un nouvel utilisateur

Méthode : compte neuf dans Chromium (390 px), questionnaire rempli comme un vrai grimpeur
(escalade bloc + renforcement, niveau « régulier », 3 séances / semaine, 1 h 30, objectifs « progresser en escalade »
et « devenir plus fort », doigts à ménager, 8 tractions, max 6A), puis chaque écran du profil, de l'accueil,
de la bibliothèque et les 7 étapes de « Créer une séance ». Captures et textes relus un par un.

## Défauts incohérents relevés

| # | Où | Constat | Pourquoi c'est un problème |
|---|---|---|---|
| 1 | Créer une séance, étape 2 | Durée proposée : **2 h**, alors que le profil dit 1 h 30. | Le profil n'est pas repris. |
| 2 | Créer une séance, étape 2 | Séance **d'escalade** prévue à la **Maison** (sans mur) ; l'app le signale seulement à l'étape 4 et 6. | Le lieu devrait correspondre au sport dès le départ. |
| 3 | Créer une séance, étape 3 | Zones à ménager **pas pré-cochées** (doigts déclarés au questionnaire). | L'utilisateur doit tout redire. |
| 4 | Créer une séance, étape 3 | « Mes objectifs : aucun objectif en cours » alors que 2 objectifs ont été choisis au questionnaire. | Deux notions (envies / objectifs précis) qui se contredisent à l'écran. |
| 5 | Créer une séance, étape 3 | 4 choix + objectif de séance (7 puces) + objectifs + 13 envies + 7 zones + texte, sur un seul écran. « Objectif de la séance » et « Ce que je veux travailler » se recoupent. | Trop long, pas simple. |
| 6 | Créer une séance, étape 1 | Deux questions abstraites avant tout (« qui choisit ? », « niveau de structure » en 5 niveaux). | Le plus important (sport, temps, objectif) vient après. |
| 7 | Créer une séance | 7 étapes obligatoires pour obtenir une séance. | Pas de chemin court. |
| 8 | Créer une séance, étape 5 | Grimpeur **6A** : phase « Force » en pyramide **4 → 6A** avec 6 blocs en 4 ; phase « Technique » : **19 blocs en 3**. | Cotations trop basses : l'écart au maximum est compté en double pour les cotations avec « + ». |
| 9 | Accueil | « Séance découverte… sans présumer de ton niveau » alors que niveau, tractions et cotation max sont connus. | Message faux après le questionnaire. |
| 10 | Accueil, Progrès, Profil | « 🎯 Fixe-toi un objectif » alors que des objectifs ont été choisis. | Incohérent avec le questionnaire. |
| 11 | Profil | « 🧩 Ajoute une ou deux mesures pour voir tes points forts » alors que 2 mesures existent. | Message faux. |
| 12 | Profil | « 🎯 0 objectif » en tête alors que « Ce que je veux » en a 2. | Incohérent. |
| 13 | Records et mesures › À mesurer | Propose « Tractions archer » et « Blocage 90° » : les 2 premières mesures de chaque sport, **sans lien avec les objectifs**. Rien sur le cardio, la souplesse ou le poids quand ce sont les objectifs. | Les mesures ne servent pas à comprendre la personne. |
| 14 | Questionnaire | Repères limités à tractions, pompes et bloc, quels que soient les objectifs. | Pas personnalisé. |
| 15 | Profil | Pas de vue « ce que l'app a compris de ma condition physique » par objectif, avec ce qui manque. | L'utilisateur ne voit pas si l'app le comprend. |
| 16 | Niveau d'une séance | Voir `docs/PLAN_NIVEAU_SEANCE.md` (données inventées, poids arbitraires, moyenne). | Pas factuel. |
| 17 | Accueil | Date « Mercredi 30 **Septembre** » (majuscule sur chaque mot). | En français, le mois s'écrit en minuscule. |
| 18 | Exercices | « Catalogue intégré (128) » ici, « 143 exercices » dans la Bibliothèque. | Deux chiffres différents pour la même chose. |
| 19 | Questionnaire | Les bandeaux d'aide (« Ajoute ton lieu… », « Fixe-toi un objectif ») s'affichent **par-dessus le questionnaire**. | Distrayant, et demandent ce que le questionnaire est justement en train de demander. |

## Ce qui est fait en 8.28.0
Défauts 1 à 15 et 17 à 19 corrigés ; 16 corrigé en partie (détail dans `CHANGELOG.md`, section 8.28.0). Restent ouverts :
- 16 (niveau factuel) : la charge relative au poids du corps n'est pas lue ; « comparer au réel » attend ta décision (voir `docs/PLAN_NIVEAU_SEANCE.md`).
- Trouvé en cours de route et corrigé : passer de « L'app choisit » à « Je compose moi-même » gardait les exercices choisis avant (test navigateur en échec, reproduit puis corrigé).
