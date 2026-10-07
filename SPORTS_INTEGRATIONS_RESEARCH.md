# Applications sportives : possibilités d’intégration

Recherche effectuée le **6 octobre 2026**, sans connexion de compte, inscription développeur ni appel API authentifié. Cette sélection couvre les services demandés ; elle ne constitue pas un classement de popularité ni un inventaire de toutes les applications.

**Une API documentée ne signifie pas qu’une connexion est disponible dans Mes séances.** Les tarifs, autorisations commerciales, quotas et conditions de réutilisation doivent être vérifiés pour l’application et les données visées. Aucune gratuité globale n’est garantie.

## Niveau de preuve

- **Confirmé** : contenu d’une source officielle effectivement consulté pendant cette recherche. Cela confirme uniquement la capacité décrite, pas une intégration opérationnelle.
- **Historique** : source officielle consultée, mais ancienne, dépréciée ou annonçant elle-même une maintenance arrêtée ; les possibilités actuelles restent à vérifier.
- **À confirmer** : documentation actuelle non consultable ou contrat insuffisamment établi. Ce statut ne signifie pas qu’aucune API existe.

Les domaines des éditeurs ont généralement été refusés par le proxy avant réponse HTTPS : `Tunnel connection failed: 403 Forbidden`. Ce résultat vient du tunnel réseau, **pas du service de l’éditeur**. Les sources GitHub officielles accessibles ont été lues par les moyens autorisés, avec TLS vérifié ; aucun contournement réseau n’a été utilisé.

## Montres, santé, endurance et planification

| Service | Possibilité et preuve | Conséquence / limite concrète |
| --- | --- | --- |
| **Strava** | **Historique : API v3 et OAuth** attestés par le [client officiel](https://github.com/strava/go.strava), HTTP 200. [Documentation actuelle](https://developers.strava.com/docs/) bloquée ici. | Activités et téléversement de fichiers sont décrits dans l’ancien client, qui dit ne plus être mis à jour depuis juin 2018. Relire les scopes, accès de l’application, quotas et droits de réutilisation actuels avant toute connexion. L’import d’un fichier est distinct d’une synchronisation de compte. |
| **Garmin** | **Confirmé : format FIT**, lecture/écriture par le [SDK Garmin](https://github.com/garmin/fit-python-sdk), HTTP 200. [Programme Garmin Connect](https://developer.garmin.com/gc-developer-program/overview/) bloqué. | Le SDK permet de traiter des fichiers FIT ; il ne prouve ni un export utilisateur actuel ni l’accès au compte Garmin Connect. Admissibilité au programme cloud, prix, authentification et quotas à confirmer. Mes séances accepte actuellement GPX/TCX, pas FIT. |
| **Polar** | **Confirmé : Open AccessLink avec OAuth**, [exemple officiel](https://github.com/polarofficial/accesslink-example-python), HTTP 200. [Documentation](https://www.polar.com/accesslink-api/) bloquée. | Le README décrit compte Polar Flow, création d’un client, consentement, enregistrement de l’utilisateur et lecture d’exercices, sommeil et Nightly Recharge après synchronisation. Les conditions et quotas actuels restent à relire. Le SDK BLE pour capteurs est une autre intégration. |
| **Suunto** | **À confirmer** : [API Zone officielle](https://apizone.suunto.com/) bloquée. | Vérifier procédure développeur/partenaire, données autorisées, OAuth éventuel et formats d’export. Aucune synchronisation gratuite ou immédiatement accessible n’est établie ici. |
| **COROS** | **À confirmer** : [site COROS](https://coros.com/) ; piste de portail développeur non validée. | API, programme partenaire, export et quotas ne sont pas établis par une source consultée. Ne pas inventer de bouton OAuth ni citer un portail supposé comme confirmé. |
| **Wahoo** | **À confirmer** : [Cloud API](https://cloud-api.wahooligan.com/) et [portail développeur](https://developer.wahooligan.com/) bloqués. | Candidat à examiner pour activités/entraînements. Contrat actuel, authentification, accès partenaire éventuel, quotas et formats d’export restent à confirmer ; les dépôts techniques Wahoo consultés ne les prouvent pas. |
| **Apple Santé / HealthKit** | **Confirmé : API native iOS**, décrite par [ResearchKit](https://github.com/ResearchKit/ResearchKit), avec copyright Apple. [Documentation HealthKit](https://developer.apple.com/documentation/healthkit) bloquée. | Nécessite un développement iOS et les autorisations de l’utilisateur ; aucune API REST/OAuth directement utilisable par la PWA n’a été établie. Types disponibles, droits et éventuel export utilisateur à vérifier. |
| **Android Health Connect** | **Confirmé : SDK natif Android**, [exemples officiels](https://github.com/android/health-samples), HTTP 200. Le code lit/écrit les séances avec permissions. [Documentation actuelle](https://developer.android.com/health-and-fitness/guides/health-connect) bloquée. | Nécessite du code Android pour accéder aux données sur l’appareil. Cela ne prouve pas que chaque montre/application y partage tous ses enregistrements. Les types, versions et conditions de publication doivent être vérifiés. |
| **Google Fit** | **Historique / déprécié** : [README Android officiel](https://github.com/android/fit-samples), HTTP 200, annonce l’arrêt des nouvelles inscriptions depuis mai 2024 et une fin des API en juin 2025. | Écarter comme cible d’un nouveau connecteur, préférer étudier Health Connect. Le calendrier annoncé dans ce README peut être ancien : [documentation actuelle](https://developers.google.com/fit) bloquée. Un fichier de découverte REST encore publié ne prouve pas un service actif. |
| **Samsung Health** | **À confirmer** : [documentation Samsung](https://developer.samsung.com/health) bloquée. | SDK natif, approbation partenaire et partage via Health Connect doivent être vérifiés. Aucune synchronisation directe de compte Samsung ni disponibilité de toutes les données n’est confirmée. |
| **Fitbit** | **À confirmer** : [référence Web API](https://dev.fitbit.com/build/reference/web-api/) bloquée. | Revoir l’API et sa procédure d’autorisation actuelles, les accès aux données détaillées et les évolutions de la plateforme. Ne pas annoncer une connexion ou des quotas gratuits sur la seule base d’une documentation non consultée. |
| **TrainingPeaks** | **Confirmé : API OAuth 2, avec admission partenaire**, [documentation officielle](https://github.com/TrainingPeaks/PartnersAPI/wiki), HTTP 200. | La [FAQ](https://github.com/TrainingPeaks/PartnersAPI/wiki/Frequently-Asked-Questions) dit que chaque demande est évaluée, que l’usage personnel n’est pas accepté et que la production nécessite validation. Des données/endpoints nécessitent [Premium](https://github.com/TrainingPeaks/PartnersAPI/wiki/Premium-vs-Basic-Athlete), notamment les détails des séances ; plusieurs champs tels que cardio/RPE sont restreints pour Basic. Pas de plafond fixe annoncé dans cette FAQ, mais gros volumes à discuter : cela ne garantit pas un accès illimité. |
| **Intervals.icu** | **Confirmé : API ouverte** annoncée dans le [dépôt officiel](https://github.com/intervals-icu/js-data-model), HTTP 200 ; le profil de l’organisation renvoie vers intervals.icu. [API docs](https://intervals.icu/api-docs.html) bloquées. | Candidat concret pour analyse et planification. Les mécanismes d’autorisation, scopes, endpoints, tarifs et quotas actuels restent à relire. Le paquet JavaScript consulté contient des types pour extensions internes, pas un connecteur déjà installé. |
| **Komoot** | **À confirmer** : [site](https://www.komoot.com/) et [aide officielle](https://support.komoot.com/). Les dépôts publics de l’éditeur ne documentent pas l’accès au compte. | Étudier l’échange de parcours par fichier et l’éventuel programme partenaire. Format/export, droits de l’utilisateur et conditions actuelles non vérifiés ; ne pas promettre une API publique libre. |

## Escalade et entraînement spécifique

| Application | Source / preuve | Possibilité concrète et limite |
| --- | --- | --- |
| **Crimpd** | [Site produit](https://www.crimpd.com/) bloqué. | API publique, OAuth, accès partenaire et export **à confirmer**. Ne pas confondre une bibliothèque d’exercices ou un programme utilisable dans Crimpd avec un droit d’intégration tierce. |
| **Lattice** | [Site](https://latticetraining.com/) bloqué ; [profil officiel](https://github.com/LatticeTraining), HTTP 200, identité et domaine vérifiés. | API/export **à confirmer** ; le profil consulté ne fournit pas de contrat d’intégration et ne prouve pas celui de Crimpd. |
| **KAYA** | [Site produit](https://www.kayaclimb.com/) bloqué. | API/OAuth/partenaire/export **non vérifiés**. |
| **Vertical-Life** | [Site](https://www.vertical-life.info/) bloqué ; [profil société](https://github.com/vertical-life), HTTP 200, identité et lien vers le domaine. | API/export **à confirmer**. Aucun dépôt public visible n’établit pas une absence d’API. |
| **theCrag** | [Client JavaScript officiel](https://github.com/theCrag/thecrag-javascript), HTTP 200 ; [documentation actuelle](https://www.thecrag.com/article/API) bloquée. | **API historiquement publiée** ; OAuth mentionné dans une issue de 2012 et export CSV dans une issue de 2020. Contrat, disponibilité, schéma d’export et permissions actuels **à confirmer**. Le README laisse les écritures et `climber` « Not yet implemented » : pas de preuve de synchronisation complète. |
| **8a.nu** | [Site produit](https://www.8a.nu/) bloqué. | API/OAuth/partenaire/export **non vérifiés**. |
| **MyClimb** | [Site produit](https://www.myclimb.com/) bloqué. | API/OAuth/partenaire/export **non vérifiés**. |
| **Griptonite** | [Site produit](https://griptonite.io/) bloqué. | API/OAuth/partenaire/export **non vérifiés**. Un compte GitHub de nom similaire sans identité démontrée n’a pas été retenu comme preuve. |
| **Grippy** | Source éditeur actuelle **à confirmer** ; piste [Griptonite](https://griptonite.io/) non validée dans le contenu produit. | API, export et relation exacte à l’éditeur **non vérifiés**. Ne pas fabriquer une adresse produit ou un contrat de connexion. |
| **MoonBoard** | [Site produit](https://www.moonboard.com/) bloqué. | API/OAuth/partenaire/export **non vérifiés**. Une base/protocole communautaire ne vaut pas contrat officiel. |
| **Kilter Board** | [Site de l’application](https://kilterboardapp.com/) bloqué. | API/OAuth/partenaire/export **non vérifiés**. Les clients communautaires ne prouvent pas un droit officiel d’intégration tierce. |
| **Tension Board** | [Site de l’application](https://tensionboardapp.com/) bloqué. | API/OAuth/partenaire/export **non vérifiés** ; même limite sur les implémentations communautaires. |

## Preuves consultées et limites datées

Tous les HTTP 200 ci-dessous ont été observés le **2026-10-06**. La date de consultation ne remplace pas la date d’une publication ancienne.

| Source effectivement lue | Ce qu’elle établit |
| --- | --- |
| [Polar README](https://raw.githubusercontent.com/polarofficial/accesslink-example-python/master/README.md) | Open AccessLink, création de client et autorisation Polar Flow, exercices/sommeil/Nightly Recharge. |
| [TrainingPeaks OAuth](https://github.com/TrainingPeaks/PartnersAPI/wiki/OAuth) et [exemple](https://github.com/TrainingPeaks/tp-public-api-auth) | OAuth 2, scopes attribués à l’application, consentement, access/refresh tokens. |
| [TrainingPeaks FAQ](https://github.com/TrainingPeaks/PartnersAPI/wiki/Frequently-Asked-Questions) et [Premium/Basic](https://github.com/TrainingPeaks/PartnersAPI/wiki/Premium-vs-Basic-Athlete) | Admission partenaire, validation production, restrictions de données et politique de volumes indiquée ci-dessus. |
| [Intervals.icu README](https://github.com/intervals-icu/js-data-model) | Phrase « online service for sports analytics and planning … with an open API » ; lien vers son guide d’intégration officiel. |
| [Garmin FIT README](https://raw.githubusercontent.com/garmin/fit-python-sdk/main/README.md) | Décode/encode des fichiers FIT ; ne décrit pas l’export utilisateur Garmin Connect ni son contrat cloud. |
| [Health Connect manager Android](https://raw.githubusercontent.com/android/health-samples/main/health-connect/HealthConnectSample/app/src/main/java/com/example/healthconnectsample/data/HealthConnectManager.kt) | `HealthConnectClient`, workflow de permissions, lecture `ExerciseSessionRecord`, écriture `insertRecords`. |
| [ResearchKit README](https://raw.githubusercontent.com/ResearchKit/ResearchKit/main/README.md) et [licence Apple](https://raw.githubusercontent.com/ResearchKit/ResearchKit/main/LICENSE) | HealthKit pour iOS ; provenance Apple. Ne décrit pas une API cloud accessible au navigateur. |
| [Google Fit README](https://raw.githubusercontent.com/android/fit-samples/main/README.md) | Dépréciation et fermeture des nouvelles inscriptions annoncées. Le calendrier actuel n’est pas revérifié sur le portail bloqué. |
| [Strava ancien client](https://github.com/strava/go.strava) | API v3, OAuth et upload ; arrêt de maintenance annoncé depuis juin 2018. Son lien vers un nouveau dépôt renvoie aujourd’hui HTTP 404. |
| [theCrag README](https://raw.githubusercontent.com/theCrag/thecrag-javascript/master/README.md) | Client officiel historique, fonctions encore non implémentées. |
| [theCrag OAuth, 2012-01-05](https://github.com/theCrag/website/issues/446), [CSV, 2020-06-03](https://github.com/theCrag/website/issues/3693) | Mentions historiques first party par un membre public de l’organisation ; pas un contrat actuel. |
| [theCrag permissions, 2013-07-18](https://github.com/theCrag/website/issues/1148) | Proposition « I'm thinking of implementing… » ; ne confirme pas un programme partenaire actif aujourd’hui. |

Les corps consultés et résultats réseau sont conservés temporairement dans `/tmp/sports-integration-sources/`, `/tmp/health-device-sources/` et les rapports `/tmp/climbing-integration-research.md`, `/tmp/health-device-integration-research.md`. Ces fichiers temporaires ne constituent pas des artefacts persistants du dépôt ; les liens et conclusions ci-dessus sont la trace durable.

## Conséquence pour Mes séances

L’arbre local comporte un import **GPX/TCX horodaté**, avec résumé et provenance de fichier, dans `public/views-sports.js` et `public/sports.js`. Cela ne constitue pas une connexion OAuth aux applications citées. Les CSV génériques disposent d’un aperçu et d’une correspondance de colonnes, incluant lieu et cotation comme texte déclaré ; cela ne garantit pas tous les exports propriétaires d’escalade. Les fichiers FIT et sauvegardes Apple Santé nécessitent encore des adaptateurs spécifiques.

Pour le catalogue, distinguer clairement **import de fichier disponible**, **API à développer après vérification**, **développement mobile nécessaire**, **accès partenaire à obtenir** et **compatibilité à confirmer**. Garder Google Fit dans les anciens services plutôt que parmi les nouvelles connexions proposées. Les données doivent conserver leur fournisseur et leur canal afin d’éviter les doublons ; les droits d’envoi au coach IA sont à examiner séparément du droit d’importer une activité.

Les candidats les mieux étayés pour une prochaine étude technique sont Polar AccessLink et Intervals.icu ; TrainingPeaks nécessite d’abord une admission partenaire. Strava nécessite la relecture de son contrat actuel. Cette priorité repose sur les preuves disponibles, pas sur une popularité supposée.
