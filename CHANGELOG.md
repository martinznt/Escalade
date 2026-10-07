# CHANGELOG — Séances entraînement

## 8.33.0 — Objectifs et phases, icônes par compte, IA plus vérifiable, applications sportives

Détails et limites : [DELIVERY_8_33.md](DELIVERY_8_33.md) ; réglages à faire soi-même : [CLOUDFLARE_GUIDE.md](CLOUDFLARE_GUIDE.md).

- Objectifs distincts des phases : plusieurs objectifs peuvent partager une phase, un objectif peut contribuer à plusieurs phases ; associations visibles et modifiables dans le créateur. « Générer » revérifie le temps sur la structure actuelle.
- Séances courtes : le temps demandé est tenu (Express « 20 min gainage », séance guidée de 12 min…). L'objectif garde 10 min puis ce qui reste, le retour au calme séparé saute en dessous de 20 min, et c'est dit.
- Icônes de l'app et des notifications choisies ou créées par chaque compte (PNG validés côté serveur, migration D1 12).
- Réponses IA : statut et provenance contrôlés aux douze points d'appel ; une demande ambiguë produit une question ou un refus, jamais un brouillon applicable.
- Administration : recherche transversale par rôle, sans données privées des membres ; formulaire de bug avec titre facultatif.
- Paramètres › Applications connectées : Strava (OAuth, aperçu avant import, déconnexion qui retire les imports, migration D1 13), GPX/TCX et CSV avec provenance. Strava et Gemini restent à activer dans Cloudflare.

## 8.32.0 à 8.32.4 — Interface simple, calendrier récurrent, fiabilité

Voir [DELIVERY_8_32.md](DELIVERY_8_32.md), [8.32.1](DELIVERY_8_32_1.md), [8.32.2](DELIVERY_8_32_2.md), [8.32.3](DELIVERY_8_32_3.md) et [8.32.4](DELIVERY_8_32_4.md).

## 8.31.0 — Carnet de 487 séances, Ma salle de sport, Mes moments, objectifs et sports sans limite, jusqu'à 5 h

### Carnet de séances
- 400 séances ciblées générées à partir des exercices réels (sport × qualité × niveau × durée) ; « Ce que tu veux travailler » par sport ; « Adapté à moi » ou « Tout le carnet » ; filtres repliables.

### Ma salle de sport (Bibliothèque)
- Machines cochées par zone ou par modèle de salle ; 12 machines de plus ; séance du jour par découpage, but et durée, machines d'abord ; 🔄 machine occupée ; charges reprises ; carnet des machines (dernière, meilleure, max estimé, réglage).

### Mes moments (Bibliothèque)
- Des blocs perso (élastiques à l'échauffement, no foot ou spray wall en fin de séance, étirements…) avec moment, durée, effort, sports, matériel, exercice lié.
- Proposés à l'étape « Ta structure » au bon endroit, adaptés : séance courte → raccourci ; doigts déjà chargés par une phase dure ou une séance dure de moins de 48 h → effort baissé ; matériel absent → dit, jamais ajouté. Option « ajouter tout seul ». Le temps est pris sur la phase la plus longue.
- Spray wall : nom clair dans le matériel, 3 exercices (blocs courts à la limite, pieds silencieux, no foot), conseil d'après les séances notées (récupération, reprise, ou la qualité la moins travaillée sans répéter la dernière).

### Créer une séance
- Autant d'objectifs que voulu (parts raccourcies à 10 min avant de retirer, avertissement dès l'étape 2) ; un seul champ « ✍️ Avec tes mots » ; les sports de la séance affichés dans l'ordre ; durée jusqu'à 5 h (4 h et 5 h en un toucher).

## 8.30.0 — Mesures précises, coach qui apprend, planning automatique, pendant la séance, outils par sport, mon parcours, communauté et accessibilité

Base : 8.29.0 et 8.28.0 (incluses dans cette même Pull Request).

### Mesures précises
- Composition corporelle (masse musculaire, masse maigre, masse grasse, eau, masse osseuse, graisse viscérale, métabolisme de base) et mensurations complètes (cou, épaules, poitrine, bras relâché / contracté, avant-bras, poignet, taille, ventre, hanches, cuisse, mollet), chacune avec sa façon de bien mesurer.
- Calculs utiles (IMC, masse maigre, indice de masse maigre FFMI, rapports tour de taille / hauteur, taille / hanches, épaules / taille, envergure / taille), chacun avec ce qu’il mesure et ses limites ; saisie de toutes les valeurs d'une pesée d'un coup, mesures personnelles. Toujours toi par rapport à toi, jamais de norme imposée.

### Coach qui apprend
- Forme du jour : check-in du matin (sommeil, énergie, courbatures, stress, pouls au repos facultatif) ; forme / fatigue (moyennes 42 / 7 jours) ; la séance légère passe en premier quand il le faut.
- Douleurs : carte sur le bonhomme, zone ménagée d'office par le générateur, reprise en 4 étapes, guérison notée.
- « Ce que l'app a appris sur toi » : plateaux et 3 pistes, équilibre pousser / tirer, règles apprises (repos, horaires, sommeil, stress, cycle seulement si activé), charge par zone, prévisions avec fourchette et niveau de confiance, récupération sourcée.
- Progression des charges par la règle des 2 séances (monter, confirmer, garder, redescendre).

### Planning
- Semaine automatique proposée (créneaux, horaires des lieux, forme, événements), validée par toi ; test mensuel planifié.
- Objectif daté construit à rebours (fondation, spécifique, affûtage, semaine allégée toutes les 4 semaines) et recalculé ; courses types (5 km, 10 km, semi, marathon).
- Conflits détectés (veille d'une course, double séance, horaires, pause, jours enchaînés) avec correction en un toucher ; séances non faites à décaler ; « Ta semaine en 10 secondes ».
- Pause vacances / blessure (rappels coupés, série de semaines gardée) ; abonnement agenda par lien secret (empreinte seule gardée côté serveur) ; rappels qui annoncent la séance prévue.

### Pendant la séance
- Ressenti de chaque série (facile / bien / dur / échec) qui ajuste la suivante ; conseil de repos utile.
- « ⋯ Outils » : j'ai mal (suite adaptée + douleur notée), il me reste peu de temps (suite raccourcie, enchaîner par deux), note par exercice, mode nuit rouge, commandes vocales, remplacer un exercice, réglage de machine mémorisé ; disques à mettre affichés pour la barre ; échauffement des doigts ajouté avant un exercice de doigts intense.
- Reprise d'une séance interrompue (12 h) ; refaire une séance passée (« la même que mardi ») ; « Je n'ai rien prévu » en 3 questions.

### Outils par sport
- Escalade : « à vue », mes styles, envies par site, point le plus haut, sections, raisons des chutes et séance ciblée, mode compétition (tops / zones / essais, chrono 4 / 4), pan maison (blocs générés depuis une photo), conditions en falaise (Open-Meteo, coordonnées arrondies, limité côté serveur), matériel, dynamomètre Bluetooth (expérimental).
- Muscu : charges max estimées (1RM) et pourcentages, disques sur la barre. Course : allures depuis la VMA, prévisions (Riegel). Natation : compteur de longueurs. Import GPX / TCX.

### Mon parcours
- Saison de 4 semaines autour d'un thème (proposé d'après tes habitudes, réussie à 3 semaines sur 4), lettre à toi-même scellée, ton année en sport, avant / après 3-6-12 mois, rapport du mois à imprimer ou enregistrer en PDF, photos de progrès gardées uniquement sur le téléphone (jamais envoyées).
- Badges utiles : check-ins, bonnes nuits, variété dans le mois, mobilité, saison réussie, reprise après une pause.
- Carnet : favoris, déjà faites, jamais essayées, sans matériel. Lieux : lien vers la carte (OpenStreetMap).

### Communauté, site, administration
- Encouragements entre partenaires (abonnés l'un à l'autre, abonnements acceptés des deux côtés), messages tout faits uniquement, limités par jour.
- Idées à voter (publiées par un administrateur « contenu », vote anonyme, un par personne) ; séance reçue par lien : la garder et l'adapter à son niveau.
- Démo avec données d'exemple (identifiant à part, effacée en quittant) ; rappel de sauvegarde chaque semaine ; signalement avec l'état de la page (pages visitées, écran, dernières erreurs ; aucune donnée d'entraînement).
- Admin : bandeau de maintenance (annonce), statistiques anonymes (groupes de moins de 3 masqués), sauvegarde du contenu commun, « voir l'app comme un nouveau membre ». Chaque action d'administration est notée au Journal.

### Accessibilité et confort
- Lecture facile, gros boutons, contraste renforcé, couleurs pour daltonisme, taille du texte — dès le premier écran. Contour de focus visible au clavier.
- Raccourci d'icône « Forme du jour » ; glisser entre les étapes du créateur ; icône de notification monochrome (plus de carré blanc dans la barre d'état Android).

### Corrections
- Le résultat « à vue » est compté partout (badges, bilan, lieux, objectifs) ; badge de synchronisation qui débordait à 320 px pendant un envoi ; échappement du point-virgule dans l'export agenda.
- « Mon parcours » accessible même avant la première séance ; boutons en haut d'une séance (‹, Adapter, À plusieurs, Lancer) qui débordaient à 320 / 390 px ; raccourcis contextuels qui passent à la ligne.

### Limites connues (honnêtes)
- Comptage des répétitions à la caméra et baisse automatique de la musique : non faits (impossibles ou non fiables depuis une page web).
- Dynamomètre Bluetooth : expérimental, Chrome / Edge sur Android ou ordinateur seulement (pas Safari / iPhone).
- Montres : pas de lien direct Strava / Garmin, ni fichiers `.fit` ; import GPX / TCX seulement.
- Anglais : version « beta » partielle ; espagnol non fait. Mode club / coach : non fait.
- Conditions en falaise : dépendent d'Open-Meteo (service externe gratuit).

## 8.29.0 — Plusieurs sports et lieux, objectifs classés ou sans hiérarchie, horaires réels, silhouette visée, salle de sport complète

Base : 8.28.0 (incluse dans cette même Pull Request).

### Créer une séance
- Plusieurs sports dans une séance, chacun dans son lieu ; trajets comptés.
- Étape 2 « Tes objectifs » : plusieurs objectifs (familles expliquées, intentions précises, objectifs du profil, ou écrits avec ses mots et compris par l'IA, avec repli par mots-clés), classés ↑ ↓ — ou **⚖️ Sans hiérarchie** (même part de temps, ordre selon l'effort).
- Étape 3 : moment de chaque objectif (auto, début, milieu, fin). Un n°1 exigeant placé à la fin réorganise toute la séance (échauffement plus long, phases d'avant modérées, doigts ménagés, montée progressive juste avant) ; chaque adaptation est écrite dans « 🧠 Comment la séance s'adapte ».
- **🕒 Horaires précis** : arrivée et départ par lieu (ex. voie 18:00–19:30, bloc 20:00–21:00). Le temps entre deux lieux devient le trajet, une remise en route est ajoutée après un arrêt, le renfo / gainage / doigts / mobilité vont là où il y a le matériel (et après la grimpe). Chevauchements et heures invalides refusés avec un message.
- Étape 6 « 📋 Ta structure finale » : chronologie (vraies heures si horaires), lieu, intensité, objectif servi, exercices et « Pourquoi ici ? ». Chaque étape a une phrase d'explication.

### Planning
- Heure de chaque séance planifiée (modifiable, envoyée au serveur, utilisée dans l'export agenda .ics) ; affichée dans « Prochaines séances ».
- **✗ Pas faite** après coup : sur une séance enregistrée (retirée de l'historique et des statistiques, après confirmation) ou sur un événement marqué fait.

### Silhouette et salle de sport
- « Ce que tu aimerais changer » : forme en V, abdos visibles, bras, pectoraux, épaules, jambes, fessiers, corps plus sec, silhouette affinée, posture. Muscles prioritaires dans les séances générées, séries de 8 à 12 et 1–2 min de repos pour la prise de muscle.
- Nouveaux objectifs « Prendre du muscle » et « Changer ma silhouette » ; petite question sur la silhouette visée ; bilan physique avec les mensurations qui vont avec.
- Mensurations : tour d'épaules, de poitrine, de bras, de cuisse, de mollet, de hanches, masse grasse (avec protocole). Carte « 🪞 Ma silhouette » : évolution, rapport épaules / taille (suivi, pas une norme), séries par muscle sur 7 jours vs repère 10–20. Sources : Schoenfeld 2017, Vispute 2011 (pas de perte de gras localisée). Rien n'est présenté comme garanti.
- ~100 exercices de plus (machines de salle une par une, poids libres, cardio machines, course, natation, escalade, mobilité) ; matériel de salle détaillé par groupes.
- 10 séances prêtes de salle : full body machines, push, pull, jambes, haut, bas, forme en V, abdos, fessiers, cardio aux machines.

### Admin et fiabilité
- Assistant du site : connaît chaque écran ; propose de petites modifications du code de l'interface (remplacements exacts revérifiés côté serveur, motifs dangereux refusés, diff recalculé), validées par un autre admin (ou seul admin avec confirmation explicite, noté au journal), puis Pull Request GitHub — jamais fusionnée ni déployée par l'app.
- Bibliothèque et Profil organisables (✏️ « Organiser », masquable dans Affichage).
- Notifications de mise à jour envoyées par la tâche planifiée du serveur même sans ouvrir l'app ; état de la tâche visible dans l'admin.
- Toutes les indications « Profil › … » vérifiées par un test automatique (24 fausses corrigées).
- Santé des données : plus d'alerte injustifiée.

## 8.28.0 — Simple mais précis : l'essentiel d'abord, un bilan physique selon tes objectifs, un niveau de séance factuel

Base : 8.27.0. Audit préalable, fait comme un vrai nouvel utilisateur (captures relues écran par écran) : `docs/AUDIT_8_28.md` (19 défauts relevés). Plan du niveau factuel : `docs/PLAN_NIVEAU_SEANCE.md`.

### Créer une séance : simple par défaut, précise quand tu veux
- **Étape 1 « L'essentiel »** (6 étapes au lieu de 7) : sport, lieu, temps, forme et **objectif de la séance** (quoi → précisément → quand) sur un seul écran, **pré-remplis d'après ton profil** : durée habituelle (avant : 2 h quel que soit le profil), lieu qui a un mur pour l'escalade, zones à ménager, objectif tiré de tes envies (force → au début, endurance → à la fin). Tout reste modifiable.
- **⚡ Proposer ma séance** : structure et exercices tout de suite ; « ✅ C'est bon, générer » ou ajuster. Les étapes suivantes (préciser, structure, propositions, améliorations, validation) restent là pour qui veut tout régler.
- « Qui choisit ? » et « Niveau de structure » passent dans **🎛️ Plus de contrôle** (replié).
- **Lieu incohérent signalé tout de suite** : séance d'escalade à un lieu sans mur → alerte sous « Lieu », avec tes lieux qui ont un mur, « Ajouter ma salle » ou « Plutôt du renforcement ici » ; le bouton ⚡ attend un lieu possible.
- **Cotations proposées corrigées** : l'écart au maximum était compté en double sur les échelles à « + » (un grimpeur 6A recevait 19 blocs en 3 et une « force » à partir du 4). Un cran = un niveau : facile 4–4+, intense 5 → 6A.
- **Propositions par phase selon ton niveau** : un exercice dont le niveau conseillé dépasse le tien n'est plus proposé, et le nombre écarté est indiqué.

### Profil : un bilan physique selon TES objectifs
- **🩺 Mon bilan physique** (Profil) : pour chaque envie (progresser en escalade, force, endurance, souplesse, forme, figure, poids, santé), les repères utiles, ce que l'app sait déjà (valeur, source, ancienneté, repère indicatif s'il existe), ce qui manque, et **comment faire chaque test**.
- **Zones à ménager respectées** : doigts à ménager → le test sur réglette est remplacé par une suspension sur barre (et c'est dit) ; épaules → pas de test de dips ; genoux → pas de pistol squat.
- **Tests guidés** : un test par écran (protocole, échauffement conseillé, valeur, « je ne sais pas » ou passer) ; les valeurs sont enregistrées comme **mesurées**.
- **Ce que l'app en déduit** : uniquement depuis les repères connus ; et le niveau réellement utilisé pour tes séances, sport par sport, avec sa raison.
- **Objectifs précis proposés** depuis ta dernière valeur (ex. 8 tractions → 10 ; 6A → 6A+) ; jamais de cible de poids, de tour de taille ou de cœur au repos proposée d'office.
- **Questionnaire** : les repères demandés dépendent des objectifs choisis (4 au plus), au lieu de toujours tractions et pompes.
- **Nouvelles mesures** : cœur au repos, test de 12 minutes, tour de taille, mains dans le dos (souplesse des épaules) — sans repère de niveau inventé.
- **« À mesurer »** suit tes objectifs (avant : les deux premières mesures de chaque sport, ex. « tractions archer »), avec le protocole.

### Administration : discuter avec l'assistant du site, et « Modifier l'app sans code » réorganisé
- **💬 Discuter avec l'assistant du site** (Admin) : une conversation en français avec l'IA du serveur (Workers AI — aucun abonnement extérieur nécessaire). Elle répond, pose ses questions s'il manque une information, et **range ses propositions dans un brouillon du Studio** : différences champ par champ, « pourquoi », puis « Relire et publier ». La suite de la conversation complète le même brouillon.
  - Elle peut : exercices, intentions de séance, questions fréquentes, annonces, raccourcis, styles, textes de l'app (avec le texte exact). Une modification partielle (« 4 séries aux tractions ») garde le reste de la fiche.
  - Elle ne peut pas : publier, lire les données des membres, ni changer le code. Ce qui demande du code est dit clairement, avec une **demande prête à copier** pour un développeur (ou Claude).
  - Tout passe par la validation du serveur (types, identifiants, champs, contenu actif refusé à la publication) ; ce qui est refusé est listé.
- **Admin en 3 groupes clairs**, une ligne par outil, chacun sur sa page :
  - *Modifier l'app sans code* : Contenu de l'app (où modifier chaque type + intentions par sport) · Textes et apparence (textes, mise en page pour tous, raccourcis, annonces) · Brouillons et publication (Studio) · Tout ce qui a été modifié (annulable ligne par ligne).
  - *Les membres* : Propositions · Signalements · Comptes et rôles · Bibliothèque commune.
  - *Surveiller et comprendre* : Santé des données · Laboratoire · Maintenance · Propositions de code · Notifications de mise à jour · Journal.
  - Avant : une seule longue page qui empilait tout. Les outils affichés dépendent des rôles (vérifiés par le serveur).

### Créer une séance : utile tout de suite
- **✨ Faite pour toi**, en tête de la séance proposée : ce qui vient réellement de ton profil (durée habituelle, objectif et son moment, lieu et matériel, zones ménagées, niveau pris en compte et sa raison, forme du jour) ; et, si l'app te connaît mal, le lien vers les tests du bilan.
- Correction : passer de « L'app choisit » à « Je compose moi-même » gardait les exercices choisis avant ; changer qui choisit repart maintenant de zéro (et le dit).

### Après la séance : ce qui change pour la suivante (boucle visible)
- Sur l'accueil, **🔁 Ce que ta dernière séance change pour la suivante** : uniquement des règles que l'app applique vraiment — doigts ou jambes sollicités intensément (exercices intenses écartés jusqu'à telle heure), gêne aux doigts signalée (travail des doigts écarté 3 jours), séance jugée dure (option légère proposée), exercice réussi en entier (marche suivante), exercice aimé ou à éviter (classement).
- Correction : « à éviter » / « j'aime » enregistrés par le questionnaire étaient ignorés par les propositions du créateur (vocabulaire différent) ; ils comptent maintenant partout.

### Niveau d'une séance : « Pour toi »
- Dans « 🔎 Pourquoi ce niveau ? », **Pour toi** : volume et durée comparés à TES séances des 90 derniers jours (à partir de 5), exercices au-dessus de ton niveau dans leur capacité (nommés), charges écrites en % de ton poids de corps (s'il est connu). Jamais comparé à d'autres membres.
- Les **charges écrites** (« +10 kg ») sont maintenant lues et rapportées telles quelles (« connu »), sans changer le niveau par un seuil arbitraire.

### Exercices vraiment adaptés
- **Niveau par capacité** : le niveau pris en compte pour un exercice est celui de sa capacité principale quand il est connu (fort en tirage mais débutant en poussée → tractions avancées et pompes accessibles), au lieu d'une moyenne ; jamais au-dessus du plafond de forme, pas en mode léger.

### Niveau d'une séance : factuel
- Niveau conseillé = **le prérequis le plus élevé** (fiches d'exercices, cotations écrites, repère de l'auteur), nommé : « Avancé, parce que « Traction à un bras » … ». Un seul exercice avancé suffit.
- Chaque critère est marqué **connu / estimé / inconnu** ; « Ce que l'app ne sait pas » est listé ; **fiabilité** haute / moyenne / faible.
- Plus aucune valeur manquante remplie par défaut (avant : difficulté 2/5, 8 répétitions, 30 s) ; plus de « score » décimal.
- Parties de grimpe : cotation lue dans le nom et convertie (échelle de référence) ; une cotation personnelle sans correspondance est dite « non reconnue ».

### Cohérence
- Envies du questionnaire reconnues partout : plus de « 🎯 Fixe-toi un objectif » ni « 0 objectif » quand tu en as choisi ; à la place, « 🩺 Quelques tests simples ».
- Plus de raccourcis par-dessus le questionnaire.
- « Séance découverte… sans présumer de ton niveau » seulement si l'app ne sait vraiment rien.
- Profil : plus de « Ajoute une ou deux mesures » quand il y en a ; message juste quand tes capacités connues sont au même niveau.
- Date de l'accueil : « Mercredi 30 septembre » (plus de majuscule au mois).
- Même nombre d'exercices partout (exercices de travail).
- Les 6 fenêtres natives du navigateur (`prompt`) sont remplacées par la boîte de dialogue de l'app.
- Brouillon « En cours : étape x/5 » faux → numéro réel ; anciens brouillons (7 étapes) renumérotés.

### Fichiers
- **Ajoutés** : `public/loop.js`, `public/fit.js`, `tests/loop.test.mjs`, `public/assess.js`, `public/views-assistant.js`, `server/assistant.js`, `tests/profile828.test.mjs`, `tests/assistant.test.mjs`, `docs/AUDIT_8_28.md`, `docs/PLAN_NIVEAU_SEANCE.md`.
- **Modifiés** : `public/estimate.js` (réécrit), `public/views-climbplan.js`, `public/views-profile.js`, `public/views-setup.js`, `public/views-library.js`, `public/views-progress.js`, `public/views-studio.js`, `public/views-settings.js`, `public/content.js`, `public/news.js`, `public/state.js`, `public/generator.js`, `public/phaseplan.js`, `public/climbplan.js`, `public/brain.js`, `public/hints.js`, `public/model.js`, `public/ui.js`, `public/style.css`, `public/i18n.js`, `public/sw.js`, `worker.js`, `tests/e2e.mjs`, `tests/data.test.mjs`, `tests/hints.test.mjs`.

### Migrations
- **Aucune** migration D1. Nouvelles mesures = nouvelles métriques natives ; les valeurs vont dans `user_items` (collection `perf`) comme avant. Les anciens brouillons de création sont renumérotés à l'ouverture.

### Fonctions réutilisées / nouvelles
- **Réutilisées** : Studio (`csCreate`, `csLoad`, `cleanChange`, `cleanGlobal`, `diffChange`, `currentOf`), `extractJson`, limites de débit, journal d'audit ; `capacityState`, `levelFor`, `candidates`, `proposeForPhase`, `placeObjective`, `toReference`, `levelFromReference`, `availableEquipment`, `putItem` / outbox, `testReminders` (rebranché), `METRICS` (tests existants).
- **Nouvelles** : `nextImpact` (loop.js), `personalFit` (fit.js), `impactCard` ; `findContext`, `buildAssistant`, `cleanAssistant`, `mergeItems` (server/assistant.js), route `POST /api/admin/assistant` (rôle contenu) ; `vAssistant`, `vAdminLook`, `vAdminChanges`, `vAdminBugs`, `vAdminPush`, `forYou` ; `batteryFor`, `assessment`, `conditionFacts`, `nextStep`, `suggestedGoals`, `guidedTests` (assess.js) ; `exerciseLevel` (generator.js) ; `askText` (ui.js) ; `prefill`, `placeFor`, `freshStructure`, `vBase` (créateur) ; `vBilan` (profil).

### Déploiement / retour arrière
- Déployer comme d'habitude ; aucune étape de base de données.
- Retour arrière : redéployer 8.27.0. Les mesures enregistrées (cœur au repos, 12 minutes, tour de taille, mains dans le dos) restent en base ; l'ancienne version les garde sans les afficher dans ses listes natives. Un brouillon ouvert en 8.28 puis relu en 8.27 garde son numéro d'étape 8.28 (décalé d'un cran) : « Recommencer » le remet à zéro.

### Limites et risques
- L'assistant du site utilise le modèle de Workers AI (Llama 3.3 70B par défaut) : moins capable que Claude, il peut mal comprendre ou proposer une modification inutile. C'est pourquoi rien n'est publié sans ta relecture. Testé ici avec des réponses simulées ; sa qualité réelle n'est pas vérifiable dans ce dépôt.
- Il ne modifie pas encore les séances prêtes, les formats, les cotations ni la mise en page (formats trop complexes pour une proposition fiable) : ces types restent modifiables à la main.
- Niveau de séance : une charge écrite est rapportée (et en % du poids si connu) mais ne change pas le niveau conseillé : aucun seuil fiable n'existe sans connaître la personne.
- Les repères de niveau (tiers) restent des repères indicatifs courants, pas des normes scientifiques par âge ou sexe ; les nouvelles mesures de santé n'en ont pas, volontairement.
- Le pré-remplissage de l'objectif part de la première envie qui correspond ; il est signalé et modifiable.
- La comparaison au ressenti des autres membres (bibliothèque commune) n'est **pas** faite : elle demande ta décision (données partagées, même anonymes).
- Tests sur Chromium (320 / 390 / 768 px) ; pas sur de vrais téléphones.

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
