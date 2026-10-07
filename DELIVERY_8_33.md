# Version 8.33.0 — vérifiée puis envoyée sur `main`

Cette version a été préparée localement le 6 octobre sur la base `7ca8e4739105565331ff01e52698be4311043ab8` (8.32.4, dont les déploiements avaient réussi mais dont la CI navigateur avait échoué sur un débordement horizontal corrigé ici). Elle a été reprise le 7 octobre : vérifications refaites, un défaut des séances courtes corrigé (voir plus bas), puis envoi sur `main` par Pull Request après CI verte. L’envoi sur `main` déclenche le déploiement automatique existant. Aucune opération Cloudflare manuelle n’a été faite et l’annonce « Envoyer à tous » n’a pas été envoyée.

## Objectifs et phases

Un objectif décrit un résultat à travailler ; une phase organise du temps, une activité, un lieu et un rôle dans la séance. Plusieurs objectifs compatibles peuvent partager une phase. Un objectif peut aussi contribuer à plusieurs phases, comme une préparation et un travail principal. Les priorités, contraintes, créneaux, déplacements, matériel et verrous restent pris en compte avant la répartition du temps.

Les associations sont visibles et modifiables dans le créateur, y compris pour l’échauffement et le retour au calme. La génération et l’enregistrement conservent le catalogue d’objectifs et leurs liens. Les anciens champs `aimKey` / `prepFor` restent lisibles. Une simple intention de séance ne crée pas automatiquement une nouvelle fiche objectif du compte. Les routines de « Mes moments » doivent être financées dans leur créneau et au bon lieu ; un budget ou des verrous incompatibles produisent un refus expliqué. « Générer » vérifie aussi le temps après les modifications des phases et reconstruit la structure actuelle ; un choix explicite permet d’augmenter la durée disponible.

Fichiers principaux : `public/aimplan.js`, `objectivelinks.js`, `phaseplan.js`, `climbplan.js`, `routines.js`, `shared.js`, `views-climbplan.js`.

## Icônes par compte

L’icône initiale « Séances » représente un calendrier validé sur fond ardoise. Onze choix préparés comprennent aussi le sommet doré fourni, des tons clairs, forêt, océan, terre, un grimpeur et un mousqueton. Le choix doré déjà enregistré explicitement reste conservé.

Le créateur local propose cinq bases, sept sports, cinq styles et six palettes, ainsi que deux couleurs personnalisées. Il affiche un aperçu, autorise jusqu’à quatre sports et garde le brouillon dans le compte. L’icône de notification peut suivre celle de l’app ou avoir son propre choix et sa propre création ; le petit repère reste monochrome.

Les icônes personnalisées sont des PNG validés, enregistrés par taille puis publiés atomiquement. Les fichiers publics immuables utilisent un jeton aléatoire et ne contiennent pas les données du profil. Chaque compte reste propriétaire de ses choix et de ses créations. Les limites de taille et de nombre sont contrôlées côté serveur. La migration D1 12 ajoute le stockage sans recréer la base.

Les manifestes conservent l’identité de la même PWA et une page d’installation prépare le choix dès le HTML initial, avant JavaScript. Le cache canonique ne reçoit pas le HTML personnalisé d’un autre choix. Les appareils peuvent nécessiter une réinstallation ; le site ne peut pas forcer la modification immédiate d’une icône du système. L’icône et le badge des notifications sont transmis par le serveur et filtrés par le Service Worker.

Fichiers principaux : `public/app-icons.js`, `icon-art.js`, `app-icons.css`, les images/manifeste versionnés, `server/app-icons.js`, `server/push.js`, `worker.js`, `schema.js`, `public/sw.js`.

## Fiabilité de l’IA et administration

Les douze points d’appel au fournisseur appliquent maintenant les contrôles de statut et de provenance avant de proposer une action ou un objet. Gemini et Workers AI passent par le même choix et les mêmes préférences communes. Une réponse ambiguë, non vérifiable ou incomplète produit une question ou un refus, sans brouillon applicable. Les identifiants de sources doivent provenir du contexte effectivement fourni ; une source interne ou une déclaration de profil n’est pas présentée comme une preuve scientifique.

Les propositions d’exercice, d’objectif, d’intention, de planning, de modification de séance, de Studio, de laboratoire et de maintenance affichent leurs références. Une proposition de code exige un extrait réellement présent dans un fichier autorisé. La maintenance distingue signalement et reproduction. Une génération locale disponible après une indisponibilité reste un choix explicite et conserve sa provenance « locale ». Après rechargement, des références non conservées sont signalées comme telles.

L’administration dispose d’une recherche transversale des outils et des collections communes autorisées par rôle : contenu, lots, propositions, signalements et pseudonymes. Les données privées des membres sont exclues. Le formulaire de bug accepte un titre facultatif, dérive un titre court de la description et propose la page d’origine.

Les lectures différées des notifications, comptes admin, signalements et paramètres vérifient aussi la connexion qui les a lancées. Revenir de A vers B puis A ne permet pas de réutiliser une réponse de la première connexion. Le débordement de la ligne de compte à 320 pixels est corrigé, y compris avec les polices Ubuntu.

Fichiers principaux : `server/ai-proposal-evidence.js`, `server/ai*.js`, `assistant.js`, `codeedit.js`, `studio.js`, `health.js`, `public/srcui.js`, les vues IA, `public/admin-search.js`, `server/admin-search.js`, `public/state.js`, `inbox.js`, `views-settings.js`.

## Applications sportives et imports

Une rubrique visible **Paramètres → Applications connectées** regroupe Strava et les imports GPX/TCX/CSV. La recherche globale la retrouve par nom d’application. Un catalogue présente les pistes étudiées sans afficher un faux bouton de connexion : les accès partenaires, mobiles et non disponibles sont identifiés. Les sources et limites sont conservées dans [SPORTS_INTEGRATIONS_RESEARCH.md](SPORTS_INTEGRATIONS_RESEARCH.md).

Strava utilise OAuth avec consentement explicite, état à usage unique lié au compte et à la session, et accès chiffrés côté serveur. L’aperçu expire, la sélection est vérifiée côté serveur et les identifiants stables empêchent les doublons d’un même canal. Un fichier exporté et une activité API ne permettent pas toujours d’identifier automatiquement la même séance : vérifier les aperçus reste nécessaire. Aucun tracé GPS ni donnée brute de cardio n’est importé. La migration D1 13 ajoute les connexions, états, aperçus et correspondances. La déconnexion supprime les imports Strava et signale si la révocation distante n’a pas pu être confirmée.

Les imports conservent leur provenance et restent exclus des profils publics, statistiques administratives d’activité et résumés envoyés au coach IA. Les analyses personnelles locales peuvent en tenir compte. Les performances CSV marquées importées sont aussi exclues du résumé IA. Le serveur conserve cette protection lors de l’édition d’une note. La synchronisation ignore une lecture commencée avant une purge ; les brouillons et réponses de fichiers ne changent pas de propriétaire lors d’un changement de compte. Une sauvegarde réimportée explicitement garde sa provenance privée, avec un canal fichier.

Les CSV d’historique acceptent un lieu et une performance/cotation déclarée sans créer automatiquement de record ou d’ascension. Les durées et dates sont validées, les données inconnues restent identifiées. Le GPX/TCX montre un résumé avant confirmation et ne conserve pas le tracé géographique. Les API externes sont simulées dans les tests : l’autorisation effective, les quotas et conditions Strava sont à vérifier avant activation.

## Repérage et création

Ouvrir « Créer une séance » depuis la recherche, le menu global ou le journal vide reprend le brouillon courant. « Mon bilan physique » est accessible depuis le profil simple et la recherche. Les signaux descriptifs de charge restent visibles en mode simple. Les contraintes de complexité de séance sont explicitées sans inventer un score scientifique : activités, objectifs, lieux, matériel et changements de rôle connus ; nouveautés ou concentration non renseignées sont indiquées comme telles.

Le laboratoire personnel conserve protocole et notes existants et affiche les détails sur demande en mode simple. L’interface avancée ne remplace pas le moteur d’analyse.

## Validation et limites

Vérifications locales achevées : syntaxe JavaScript/JSON, 98 scripts unitaires avec 956 contrôles, audit de 560 rendus (invité/membre/admin, simple/avancé, 320/390 px) sans anomalie détectée, et compilation Wrangler sans publication. Les 16 scripts navigateur ont réussi, avec 215 étapes : les scripts corrigés ont été relancés individuellement après les premiers échecs, puis le long scénario de 83 étapes a terminé avec succès. Les échecs initiaux provenaient notamment de simulations IA anciennes, d’une date de test dépendant du jour et d’un défaut du créateur corrigé (structure réutilisée et dépassement de temps). Le rapport transversal est conservé dans `VERIFICATION_8_33.json`. Les tests utilisent le vrai Worker et les modules clients, une base SQLite locale et Chromium ; les fournisseurs IA, PubMed et GitHub sont simulés. La compilation Wrangler sans publication ne vérifie pas le fonctionnement de toutes les ressources du compte Cloudflare.

Les appels Google et PubMed réels sont bloqués par le proxy de développement. Gemini doit être activé et testé dans le projet de l’utilisateur. Son quota gratuit et le respect des limites CPU pour les créations PNG doivent être vérifiés dans le compte concerné. Les icônes installées, badges et notifications doivent être contrôlés sur les appareils réels, notamment iOS et Android. Aucun résultat local ne justifie une garantie de zéro bug ou d’exactitude universelle des réponses.

Les opérations distantes demandées sont documentées dans [CLOUDFLARE_GUIDE.md](CLOUDFLARE_GUIDE.md) et restent à effectuer par l’utilisateur. L’annonce finale « Envoyer à tous » n’est pas envoyée automatiquement.

## Reprise du 7 octobre : vérifications et correctif

Le code de l’archive a été appliqué sur `main` (8.32.4) : 67 fichiers modifiés et 102 ajoutés. Les documents de la racine déjà présents (CHANGELOG, livraisons 8.32) sont conservés ; ce guide, le guide Cloudflare, la recherche sur les applications sportives et le rapport `VERIFICATION_8_33.json` (celui du 6 octobre) sont ajoutés.

**Défaut trouvé et corrigé.** Une séance courte dépassait le temps demandé, et la nouvelle vérification de « Générer » la bloquait. Exemples : Express « 20 min gainage » donnait 25 min, une séance guidée de renforcement de 12 min donnait 20 min. Chaque partie gardait sa durée minimale habituelle, plus 5 min d’échauffement et 5 min de retour au calme, et une séance de moins de 20 min était calculée comme une séance de 20 min. Désormais :
- l’objectif garde 10 min, puis ce qui reste (5 min au moins) ;
- en dessous de 20 min, le retour au calme séparé est retiré ;
- chaque ajustement est indiqué dans « Comment la séance s’adapte » ;
- la structure par défaut (sans objectif) tient aussi le temps exact, de 10 min à 5 h ; elle s’arrêtait encore à 4 h ;
- une proposition par défaut trop longue est ajustée avant d’être montrée (retour au calme puis partie secondaire retirés, verrous respectés).

Fichiers : `public/aimplan.js`, `public/sportplan.js`, `public/phase.js`, `public/views-climbplan.js` ; tests ajoutés dans `tests/aimplan.test.mjs`, `tests/sportplan.test.mjs` et `tests/phase.test.mjs`.

**Vérifications refaites** (Node 22, Chromium Playwright 1.63) :
- `npm ci`, `npm run check` : réussis ;
- `npm test` : 98 scripts, 959 contrôles réussis ;
- `npm run test:e2e` : les 16 scripts réussis en une seule exécution complète, 215 étapes. Avant le correctif, `experience-e2e` échouait à l’étape « séance Express : générer, exécuter et répondre au questionnaire court » ;
- tour de mise en page indépendant : 588 rendus (42 pages membre et 56 pages administrateur, interface simple et avancée, 320, 390 et 768 px), sans débordement, texte cassé ni erreur JavaScript détectés ; le mode invité n’a pas été refait dans ce tour (il reste couvert par les parcours navigateur) ;
- `wrangler deploy --dry-run` (4.148.0) : compilation réussie, liaisons `DB`, `SEANCES_KV`, `AI`, `ASSETS`, `CF_VERSION_METADATA`, aucune publication.

Les fournisseurs IA, Strava, PubMed et GitHub restent simulés dans ces tests : ils ne prouvent pas l’activation réelle.

## État avant publication

- [x] Fonctions et correctifs de cette livraison enregistrés dans le code local.
- [x] Tests unitaires, parcours navigateur, audit mobile, syntaxe et compilation locale validés.
- [x] ZIP, passation, objectif final et guide manuel préparés.
- [ ] Gemini : clé, disponibilité du modèle, quota gratuit et réponses réelles à vérifier dans le projet de l’utilisateur.
- [ ] Strava : application développeur, conditions, capacité, secrets et consentement réel à configurer/tester.
- [ ] Icônes installées et notifications à vérifier sur les téléphones réels.
- [x] Vérifications refaites et correctif des séances courtes (7 octobre).
- [x] Envoi sur `main` par Pull Request après CI verte ; le déploiement automatique existant prend le relais (aucune opération Cloudflare manuelle).
- [ ] Annonce finale aux utilisateurs quand l’utilisateur est satisfait, depuis l’administration.
