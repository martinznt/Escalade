# Version 8.34.1 — corrections de l’audit du 9 octobre, préparée sur la branche, non fusionnée

## État au 9 octobre 2026

- **`main`** est en 8.34.0 : fusion de la PR #24 (commit `475da81`, 8 octobre, 17 h 28 UTC). Sur GitHub, le contrôle Cloudflare « Workers Builds » de cette fusion a réussi : il a lancé l’annonce de mise à jour (« Annoncer la mise à jour déployée », terminée sans erreur à 17 h 29 UTC). Je n’ai pas pu ouvrir le site en ligne depuis mon environnement : la version réellement servie n’est pas vérifiée ici.
- **La CI « Tests » de cette fusion est rouge**, à l’étape « Parcours navigateur » : le test d’installation lisait `location.origin` hors du navigateur quand la copie du lien était refusée (B19). Le site n’est pas en cause ; le test est corrigé sur la branche, pas encore sur `main`.
- **8.34.1** est sur la branche `claude/new-session-wi9olv` : non fusionnée, non déployée. Aucune opération Cloudflare, aucune annonce « Envoyer à tous ». Le ZIP « site sport final » est remis pour relecture.

## Les 21 constats de l’audit, et ce qui a été fait

Chaque constat a d’abord été vérifié dans le code. Tous étaient réels ; aucun n’a été écarté.

| N° | Constat | Ce qui a été fait | Vérifié par |
|---|---|---|---|
| B01 | Une zone reconnue depuis Mes ajouts n’était pas cochée | Cochée dans les zones à ménager du profil, gardée après rechargement | `choices-e2e` |
| B02 | Le brouillon de chrono d’Alice prérempli pour Bob | Réglages locaux rangés par compte : chrono, générateur, rappels, filtre des séances, sauvegarde. L’ancienne clé commune est effacée sans être montrée | `account-device-e2e` |
| B03 | « Tout sélectionner » ne sélectionnait rien | Deux actions portaient le même nom ; celle du lien d’agenda est renommée. Un test empêche tout nouveau doublon | `handlers.test`, `audit-fixes-e2e` |
| B04 | Supprimer une photo de progrès ne faisait rien | Même cause (doublon avec les photos d’escalade), même correction | `audit-fixes-e2e` |
| B05 | Photos restées sur l’appareil après suppression du compte | Données, photos (index et images) et réglages locaux du compte effacés de l’appareil | `account-device-e2e` |
| B06 | « 1,5 h » lu comme 5 h | Heures décimales, « heures », « hours » | `quickadd`, `free-session-e2e` |
| B07 | EMOM 180 min toutes les 10 s : 240 intervalles | Un seul calcul partout (1 080). Une durée qui ne tombe pas juste est dite avant de démarrer ; jamais plus long que demandé. Compte à rebours : 5 h au plus, partout | `session-tools`, `chrono-e2e` |
| B08 | Le chrono perdait le temps d’une suspension | Les phases écoulées sont rattrapées ; reprise au bon intervalle, avec le bon temps restant | `session-tools`, `chrono-e2e` (horloge simulée, 185 s) |
| B09 | Des efforts passés enregistrés comme faits | Journal des phases : un effort passé reste « non fait », sans volume | `session-tools`, `chrono-e2e` |
| B10 | Le rappel de rendez-vous ouvrait l’accueil | Ouvre le calendrier (`#/home/cal`) | `push-ics`, `audit-fixes-e2e` |
| B11 | États ARIA vides sur les choix radio | Corrigé dans le gabarit `h` : un attribut `aria-…` qui reçoit vrai ou faux s’écrit toujours « true » ou « false », dans toute l’app | `ui-template.test`, `audit-fixes-e2e` |
| B12 | Jauges sans nom accessible | Chaque jauge dit ce qu’elle mesure | idem |
| B13 | Liste du son sans nom | « Son des notifications dans l’app » | `audit-fixes-e2e` |
| B14 | Un lien mal encodé bloquait le démarrage | Décodage protégé, aussi pour le lien public d’un profil | `audit-fixes-e2e` |
| B15 | Sauvegarde importée sur un autre compte : rendez-vous et historique refusés (409) | Nouveaux identifiants pour l’historique et les rendez-vous, liens gardés (rendez-vous → séance, exception → rendez-vous répété, historique → rendez-vous) ; importer deux fois n’ajoute rien | `backup.test`, `backup-e2e` |
| B16 | Une séance supprimée ne revenait pas depuis sa sauvegarde | L’import demande « Récupérer » ou « Laisser supprimée » ; le message final dit ce qui a été fait | `backup.test`, `backup-e2e` |
| B17 | Le bandeau de mise à jour recouvrait le lecteur et « Organiser » | Masqué pendant une séance, le chrono, une séance à plusieurs et l’éditeur « Organiser » | `audit-fixes-e2e` |
| B18 | Deux envois synchrones ajoutaient deux fois | Un formulaire n’est jamais traité deux fois en même temps | `audit-fixes-e2e` |
| B19 | Test d’installation cassé si la copie est refusée | Le test vérifie la copie acceptée et la copie refusée | `install-e2e` |
| B20 | Aide différente de l’interface simple ; Mon parcours disparaissait | Trois réponses de l’aide réécrites d’après l’interface et le code (première séance, hors connexion, objectifs) ; Mon parcours aussi dans le résumé simple | `paths.test`, relecture |
| B21 | Documentation de livraison périmée | Ce document, `DELIVERY_8_34.md`, `README.md`, `CHANGELOG.md` | relecture |

## Trouvé en plus pendant les corrections

- « Ajouter mes séances à l’agenda du téléphone » plantait : un import manquait dans `views-home.js`. Corrigé.
- Deux autres lectures d’heures avaient le défaut de B06 : les commandes écrites (« séance de 1,5 h ») et la saisie rapide d’activités (« 1,5 h de voie »). Corrigées et testées.
- Un import n’applique plus les suppressions contenues dans le fichier : la confirmation annonçait déjà « sans rien supprimer ».
- Chrono : « Passer » pendant une pause donnait du temps en trop à la phase suivante ; un AMRAP arrêté avant la fin affichait la durée prévue au lieu du vrai temps. Corrigés.
- Au changement de compte sans recharger la page, le filtre des séances, le format du chrono, le filtre et la pose des photos sont remis à zéro.

## Sécurité et données

- Aucune migration de base. Le serveur refuse toujours d’écrire sur l’identifiant d’un autre compte (409) : l’import donne de nouveaux identifiants au lieu de les réutiliser.
- L’export indique à quel compte appartient le fichier : l’identifiant interne seulement, ni nom ni e-mail.
- Réglages locaux et photos de progrès : rangés par compte sur l’appareil ; effacés à la suppression du compte et à la sortie du mode invité ; un invité qui crée son compte les garde.
- Aucun `eval`, `new Function` ni commande système ajoutés. Les textes restent échappés par le gabarit `h`.

## Vérifications faites

VERIFICATIONS

## Limites, dites honnêtement

- Tests dans Chromium seulement (émulation de téléphone). Firefox et Safari (WebKit) ne sont pas disponibles dans mon environnement : non testés. Pas de vrai téléphone non plus : la suspension du chrono est simulée avec l’horloge de Playwright, pas avec un téléphone verrouillé.
- Inchangés par cette version et toujours à valider sur le vrai site : Gemini (vraie clé, quota), la connexion Strava (OAuth réel), les notifications sur de vrais téléphones, le remplacement de l’icône déjà installée.
- Les photos de progrès gardées sur un autre appareil n’y sont effacées que depuis cet appareil-là ; la confirmation de suppression du compte le dit.
- Une sauvegarde d’avant la 8.34.1 ne dit pas à quel compte elle appartient : l’app le déduit des éléments en commun. Sans élément commun, elle la traite comme venant d’un autre compte (nouveaux identifiants). Un élément déjà là est reconnu à sa date et à son nom, et n’est pas ajouté deux fois.
- Accessibilité : vérifiée par des règles ciblées (états ARIA, noms des jauges et des listes), pas par un audit axe complet ni avec un vrai lecteur d’écran.
- Le rappel de rendez-vous ouvre le calendrier du mois en cours, pas encore le jour exact.
- La CI de `main` restera rouge tant que la branche n’est pas fusionnée.

## À faire de ton côté, quand tu seras satisfait

1. Relire le ZIP. Fusionner la branche dans `main` **publie le site** (déploiement automatique, voir [CLOUDFLARE_GUIDE.md](CLOUDFLARE_GUIDE.md)).
2. Après la fusion, vérifier dans GitHub Actions que « Tests » repasse au vert.
3. Gemini et Strava (facultatifs) : inchangés, voir [DELIVERY_8_34.md](DELIVERY_8_34.md) et [CLOUDFLARE_GUIDE.md](CLOUDFLARE_GUIDE.md).
4. L’annonce « Envoyer à tous » : à envoyer toi-même, quand tu le décides (Paramètres › Administration).
