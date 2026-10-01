# Analyse du site et idées — 8.30 (en préparation)

## 1. Ce que tu cherches à construire (lu dans toutes tes demandes)

Le fil rouge de tes demandes est constant :

1. **Un coach complet et autonome.** L'app doit savoir quoi te proposer aujourd'hui, l'adapter à ta forme, ton temps, ton lieu, ton matériel et tes douleurs, et le faire progresser dans le temps. Elle doit faire **sans toi** ce qu'un coach ferait : choisir, doser, ajuster, rappeler.
2. **Pour tout le monde.** Du débutant pressé qui veut juste une séance prête jusqu'au grimpeur qui organise une soirée voie puis bloc avec ses horaires. D'où le carnet par niveau, la visite de chaque page, les choix « classés / ex æquo / sans hiérarchie », et « Adapter pour cette fois ».
3. **Tout expliqué, rien de faux.** Chaque choix de l'app a son « pourquoi ». Les indications de navigation sont vérifiées par un test, les limites sont dites (pas de diagnostic, pas de promesse sur la silhouette) et les sources sont citées.
4. **Plusieurs sports dans une même vie sportive.** Escalade d'abord, mais aussi salle de sport (pour remplacer les applis de muscu), calisthenics, course et natation, avec plusieurs lieux dans une même séance.
5. **Un site que tu peux faire évoluer toi-même.** L'admin et son assistant IA modifient le contenu. Pour le code, ils passent par une Pull Request, jamais par un déploiement direct.
6. **Ne jamais perdre le contrôle.** Rien ne modifie une séance sans « Modifier ». Rien ne part en production sans validation. Une séance enregistrée par erreur se retire après coup.

Ton raisonnement est celui d'un pratiquant exigeant. Tu pars de situations réelles (« je suis à la salle de voie de 18 h à 19 h 30 », « j'ai mal ici », « je n'ai que 20 min »). Tu veux que l'app s'y plie, plutôt que de devoir t'y plier toi. C'est le bon critère, et c'est celui que j'ai utilisé pour trier les idées ci-dessous.

## 2. Vérification du site (faite le 1er octobre 2026)

| Vérification | Résultat |
|---|---|
| Tests automatiques (`npm test`, 57 fichiers) | tous passent |
| Parcours complet dans un vrai navigateur (E2E) | 81 étapes, toutes passent |
| Robot qui ouvre **chaque page** (53 pages membres et admin) à 320 et 390 px | aucune erreur JavaScript, aucun défilement horizontal, aucun « undefined / NaN / [object Object] » affiché, aucun écran en erreur |
| Indications « Profil › … » écrites dans l'app | toutes mènent à une page qui existe (test automatique) |
| Carnet de séances | 82 séances, chaque exercice existe, au moins 3 séances par muscle et par compétence, 2 par niveau et par sport (test automatique) |

**Défauts trouvés et corrigés pendant cette analyse :**
- La fiche d'une séance n'avait pas de titre de page, ce qui gênait les lecteurs d'écran et la visite guidée. Corrigé.
- La visite guidée n'avait pas de présentation écrite pour une quinzaine de sous-pages. Ajoutées.
- La zone « épaules / coudes / genoux à ménager » ignorait des exercices ajoutés récemment (machines d'épaules, dips coréens, muscle-up, hack squat…). Listes complétées.
- Deux anciens tests dépendaient du hasard du générateur. Ils vérifient maintenant ce qu'ils doivent vraiment vérifier.

**Ce que je ne peux pas vérifier d'ici** (à tester sur ton vrai site) :
- les notifications reçues sur un vrai téléphone ;
- l'IA de Cloudflare en production ;
- la création d'une Pull Request depuis l'admin, qui demande `GITHUB_TOKEN` et `GITHUB_REPO` dans les secrets Cloudflare ;
- l'installation de l'app sur iPhone.

## 3. Idées, endroit par endroit

Classement : ⭐⭐⭐ = gros gain pour l'autonomie ou la facilité d'usage, ⭐ = confort. (P) = petit à faire, (M) = moyen, (G) = gros.

### Accueil
- ⭐⭐⭐ (M) **Pilote automatique de la semaine.** À partir de tes objectifs, de tes disponibilités (jours et heures du Planning) et de ta récupération, l'app place elle-même les séances de la semaine. Tu valides en un toucher, puis elle se réajuste si tu en rates une.
- ⭐⭐⭐ (P) **« Refaire ma dernière séance »** et **« La même que mardi »** en un toucher, avec « 🔁 Adapter » à côté.
- ⭐⭐ (P) **Bilan du matin en 3 questions** (sommeil, courbatures, douleur) : la séance du jour s'adapte toute seule (intensité, zone à ménager).
- ⭐⭐ (M) **Alerte de surcharge** : charge de la semaine bien au-dessus de tes 4 dernières semaines → proposition d'une semaine plus légère, expliquée.

### Pendant la séance (lecteur)
- ⭐⭐⭐ (M) **« J'ai mal » ou « Il me reste 10 min » en pleine séance** : la suite de la séance est adaptée sur place, avec le même moteur que « Adapter ».
- ⭐⭐ (P) **Charge proposée** pour chaque série d'après la dernière fois (+2,5 % si toutes les séries étaient réussies).
- ⭐⭐ (P) **Note rapide entre deux séries** (« prise glissante », « genou ») pour retrouver le problème la fois suivante.
- ⭐ (P) **Écran toujours allumé** et **mode paysage** pour poser le téléphone au sol.

### Créer une séance
- ⭐⭐⭐ (M) **Modèles enregistrés** : « Ma soirée voie puis bloc » (sports, lieux, horaires, objectifs) réutilisable en un toucher.
- ⭐⭐ (P) **Partager une structure** à un ami de grimpe : il la reçoit adaptée à SON niveau.
- ⭐⭐ (M) **Séance à deux** (déjà en duo) + créneaux horaires : les deux emplois du temps sont combinés.

### Carnet de séances
- ⭐⭐⭐ (M) **Programmes de plusieurs semaines tirés du carnet** (« 8 semaines vers la première traction », « Push-Pull-Jambes 4 jours ») : progression automatique d'une semaine à l'autre.
- ⭐⭐ (P) **Favoris et « déjà faite »** sur chaque séance du carnet, et tri « jamais essayée ».
- ⭐⭐ (P) **Filtre « sans matériel » / « 20 min max »** directement en haut, en un toucher.
- ⭐ (P) **Vidéo ou schéma** de chaque exercice (liens vers des démonstrations vérifiées par un admin).

### Planning
- ⭐⭐⭐ (P) **Horaires d'ouverture de tes salles** dans « Mes lieux » : l'app ne propose jamais un créneau où la salle est fermée.
- ⭐⭐ (P) **Séance manquée → proposition de la décaler** au prochain jour libre, en un toucher.
- ⭐⭐ (M) **Synchronisation agenda en continu** (abonnement iCal au lieu d'un fichier à importer).

### Profil et progrès
- ⭐⭐⭐ (M) **Tests mensuels automatiques** : l'app programme elle-même un test (tractions max, suspension, 12 min…) quand une mesure date. Elle compare ensuite et explique.
- ⭐⭐ (P) **Photos de progression privées** (silhouette) stockées seulement sur l'appareil, avec comparaison avant / après.
- ⭐⭐ (M) **Prévision** : « à ce rythme, 12 tractions vers mi-novembre », toujours présentée comme une estimation, avec sa confiance.
- ⭐ (P) **Résumé partageable du mois** (déjà en image) avec choix de ce qui est montré.

### Escalade
- ⭐⭐⭐ (M) **Carnet de voies et blocs par salle avec photo** (déjà en partie) + **reconnaissance de la cotation de la salle** pour tes réussites.
- ⭐⭐ (P) **Suivi des doigts** : alerte si la charge des doigts monte trop vite d'une semaine à l'autre (risque de poulie).
- ⭐⭐ (M) **Projets** : nombre d'essais, sections réussies, meilleur point haut, et séance proposée pour la section qui bloque.

### Admin et assistant du site
- ⭐⭐⭐ (P) **Tableau de bord admin** : erreurs remontées par les appareils, pages les plus utilisées, séances du carnet les plus lancées. Uniquement des chiffres agrégés, aucune donnée personnelle.
- ⭐⭐ (M) **L'assistant propose lui-même des améliorations** à partir des signalements et des retours (brouillon à valider, jamais publié seul).
- ⭐⭐ (P) **Bouton « tester comme un nouveau membre »** : ouvre l'app avec un profil vide pour voir ce qu'un débutant voit.

### Raccourcis
- ⭐⭐⭐ (P) **Raccourcis d'icône** (appui long sur l'icône de l'app) : « Séance du jour », « Minuteur », « Planning », « Adapter ma dernière séance ».
- ⭐⭐ (P) **Adresse directe par séance** (lien) pour lancer une séance depuis un raccourci du téléphone.
- ⭐⭐ (P) **Recherche qui comprend une demande** : taper « 20 min pecs sans matériel » ouvre directement la bonne séance du carnet, déjà adaptée.
- ⭐ (P) **Geste de balayage** entre les étapes de « Créer une séance ».

### Accessibilité
- ⭐⭐ (P) **Texte plus grand et contraste élevé** proposés dès le premier lancement.
- ⭐⭐ (P) **Lecture vocale des consignes** de chaque exercice (le coach vocal existe déjà pendant la séance).
- ⭐ (M) **Langue anglaise complète** (une base existe).

## 4. Par où je commencerais

Les trois idées qui rapprochent le plus le site de « parfait et autonome » :
1. **Le pilote automatique de la semaine**, avec horaires des salles et décalage des séances manquées.
2. **« J'ai mal » et « il me reste X min » pendant la séance**. Le moteur existe déjà avec « Adapter ».
3. **Les programmes de plusieurs semaines tirés du carnet**, avec progression automatique.

Dis-moi lesquelles tu veux et je les fais.
