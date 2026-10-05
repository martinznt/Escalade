# Séances entraînement — v8.32.2

Application web installable (PWA) pour planifier, générer, exécuter et analyser ses séances d'entraînement :
escalade (bloc, voie), renforcement / préparation physique, musculation, course à pied, natation, et toute
activité personnalisée. Chaque recommandation est expliquée (faits, estimations, données manquantes) ; rien n'est inventé.

Les changements et vérifications de la version 8.32.2 sont dans [DELIVERY_8_32_2.md](DELIVERY_8_32_2.md).
La simplification des paramètres et des visites est décrite dans [DELIVERY_8_32_1.md](DELIVERY_8_32_1.md).
Le bilan de la refonte et la couverture du cahier des charges restent dans [DELIVERY_8_32.md](DELIVERY_8_32.md). `FINAL_AUDIT.md` conserve l’audit historique de la version 8.30.

## Architecture en bref

| Partie | Fichiers |
|---|---|
| Serveur (Cloudflare Worker) | `worker.js` (API, sécurité, idempotence), `schema.js` (tables D1 + migrations), `server/publish.js` (nettoyage avant publication), `server/migrate.js` (reprise des anciennes données) |
| Interface (modules ES, sans dépendance) | `public/app.js`, `public/views-*.js`, `public/player.js`, `public/ui.js`, `public/state.js` (stockage local, file hors ligne, synchronisation) |
| Logique métier (pure, testée sous Node) | `public/model.js` (capacités, muscles, métriques, figures), `public/library.js` (catalogue), `public/brain.js` (analyses), `public/generator.js` + `public/engine.js` (générateurs), `public/grading.js` (cotations), `public/estimate.js`, `public/csv.js`, `public/search.js`, `public/commands.js`, `public/items.js`, `public/outbox.js` |
| Hors ligne | `public/sw.js` (précache versionné, identique à la liste servie par le Worker) |

## Déploiement Cloudflare

1. Garder `wrangler.json` (bindings `DB` pour D1, `SEANCES_KV` pour l'ancienne version, `ASSETS` pour `public/`).
2. L’assistant peut utiliser **Gemini Flash** via l’API Google ou **Workers AI** via le binding `AI` existant. Avec le secret serveur `GEMINI_API_KEY` et aucun fournisseur enregistré dans l’administration, Gemini est sélectionné par défaut ; sans cette clé ni réglage, Workers AI reste le choix initial. Un fournisseur choisi dans l’administration reste celui utilisé : aucune bascule automatique après une erreur ou un quota atteint. L’activation de Gemini est décrite ci-dessous ; les formulaires et calculs sportifs restent disponibles sans IA.
3. Définir le secret d'administration (jamais dans le code ni dans le navigateur) :
   `npx wrangler secret put EDIT_PASSWORD`
   Optionnel : `npx wrangler secret put INVITE_CODE` pour réserver l'inscription aux personnes ayant un code.
4. Déployer : `npx wrangler deploy --keep-vars` pour conserver les variables déjà configurées dans Cloudflare (`MOVE_TO`, `AI_MODEL`, `GITHUB_REPO`…). Les tables D1 sont créées et mises à niveau automatiquement au premier appel
   (ajouts uniquement, aucune donnée supprimée).
5. Pour devenir administrateur : se connecter avec son compte, puis Paramètres › Administration › saisir `EDIT_PASSWORD`.

Il n'y a aucun mot de passe global pour entrer sur le site : chaque personne crée son compte.

## Adresse du site : `seances-sport.pages.dev`

Le dossier `pages/` contient une porte d'entrée Cloudflare Pages qui transmet tout au Worker principal
(liaison de service `APP`). Mise en place une seule fois dans Cloudflare :
1. Workers & Pages › Créer › Pages › Importer un dépôt Git › `martinznt/Escalade`.
2. Nom du projet existant : `seances-sport` · branche : `main` · préréglage : aucun · commande de build : vide ·
   répertoire de sortie : `pages`.
3. Projet Pages › Paramètres › Liaisons › Ajouter › Liaison de service : nom `APP`, service `seances-entrainement`.
4. Redéployer (Déploiements › ⋯ › Réessayer le déploiement).

L'ancienne adresse `workers.dev` continue de fonctionner ; les comptes et les données sont les mêmes.

## Mises à jour

Chaque déploiement est détecté automatiquement (identifiant de version Cloudflare) : le site et l'application installée
affichent « Nouvelle version — Mettre à jour ». Si l'app était fermée pendant la mise à jour, « 🎉 L'app a été mise à jour »
s'affiche à la réouverture. « Voir les nouveautés » liste les dernières modifications : le titre de chaque commit et ses
lignes « - … » (historique public du dépôt GitHub). Écris donc des titres de commit simples et parlants.
Chaque livraison met aussi à jour `APP_VERSION` dans le Worker et `public/state.js`, le cache du Service Worker et la visite des nouveautés.

Le workflow `notify-deployment.yml` réveille la version attendue après le succès du check Cloudflare Workers sur `main`. La première visite et le cron chaque minute assurent la reprise. Les appareils sont suivis dans une file durable ; les échecs sont réessayés et les succès ne sont pas renvoyés. Le site ouvert vérifie versions et annonces chaque 30 secondes lorsqu’il est visible, sans redessiner une saisie en cours. L’affichage d’un push dépend aussi du navigateur et du système du téléphone.

Administration › Notifications de mise à jour propose **Envoyer à tous** : l’administrateur relit titre, message, version et audience, puis confirme. L’annonce apparaît dans le site pour tous, et les appareils ayant autorisé les notifications la reçoivent même s’ils ont décoché les mises à jour automatiques. Cette action ne change pas les préférences et ne peut pas contourner une permission navigateur refusée. L’annonce finale reste une action de l’administrateur.

Pour qu'une mise à jour propose aussi une **visite des nouveautés**, ajoute ses étapes dans `public/news.js`
(une entrée par version, avec la même version que `APP_VERSION`).

## Ancienne adresse

`seances-entrainement.martin-zannet22.workers.dev` redirige automatiquement vers `https://seances-sport.pages.dev`
avec le compte, les réglages et les données de l'appareil (confirmation demandée). Autre adresse : variable `MOVE_TO`
dans Cloudflare (vide pour désactiver).

## Tests

```bash
npm ci             # dépendances exactes (package-lock.json) ; Node 24 recommandé
npm run check      # syntaxe de tous les fichiers JS + validation JSON
npm test           # unitaires, intégration Worker-D1, sécurité, migrations, moteurs, agenda, IA, synchronisation
npx playwright install --with-deps chromium
npm run test:e2e   # navigateur réel : parcours existants avancés puis interface simple, agenda et hors ligne
```

Les tests Worker utilisent une base D1 simulée par `node:sqlite` (Node 22+). Le test E2E démarre un serveur local
(`tests/server.mjs`) qui exécute le vrai `worker.js` et sert `public/` comme le ferait Cloudflare.
Le parcours `tests/account-local-isolation-e2e.mjs` contrôle les changements de compte, les réponses tardives, la conservation des intentions hors ligne et le transfert explicite depuis le mode invité. `tests/update-activation-e2e.mjs` contrôle l’installation ralentie, le contrôleur réellement actif et les visites facultatives. Dernière validation locale de la version 8.32.2 : 81 suites / 824 cas de logique et 10 suites / 149 étapes navigateur réussis. Les déploiements sont contrôlés séparément sur GitHub pour le commit publié.

Si le téléchargement Playwright est bloqué et que Chromium est déjà installé, utiliser :

```bash
PW_EXEC=/usr/bin/chromium npm run test:e2e
```


## Interface simple et avancée

Un nouveau compte utilise l’interface simple. Le choix Simple ou Avancée est directement en haut des Paramètres ;
la préférence suit le compte et reste disponible hors ligne. Dans le champ de commande, « je veux une interface
avancée » ou « mode simple » change uniquement la présentation. Les profils, objectifs, réglages, analyses et
séances utilisent les mêmes calculs. Les anciennes mises en page personnalisées restent utilisables.

Accueil propose le contexte du jour, le rendez-vous prévu, les raisons de la recommandation, Express et le bilan.
Les détails restent accessibles. Dans Bibliothèque, Express, Guidé et Avancé ouvrent le créateur existant ;
Libre permet une construction manuelle. Le parcours Express comprend une validation de la structure avant génération.
Moi regroupe les sports, objectifs, lieux, mesures et « Ce que l’app a compris ». Progrès montre les évolutions personnelles.

## Comptes sur un même appareil

Changer de compte remet à zéro les données privées en mémoire, les brouillons temporaires, les résultats du générateur et les fenêtres ouvertes avant de charger les données du compte choisi. Séances, historique, planning, réglages, modifications hors ligne, conflits et actions en échec restent dans le stockage de leur propriétaire. Une écriture différée conserve une copie des données et l’identifiant du compte qui l’a demandée ; elle ne peut pas enregistrer cette copie sous le compte connecté ensuite.

La lecture du cache et la synchronisation vérifient le compte et la connexion qui les ont lancées. Leurs réponses tardives sont ignorées après un changement de compte ; un ancien refus 401 ne déconnecte pas la nouvelle session. Les modifications hors ligne sont rejouées dans les données du compte concerné avant affichage, puis suivent la synchronisation habituelle.

Le brouillon du créateur de séance, ses objectifs et le raccourci « Retour à… » utilisent des clés propres au compte. La dernière séance ouverte est également associée à son propriétaire. Un instantané de séance interrompue contient l’identifiant du compte ; sa reprise exige le même propriétaire, des données valides et une interruption datant de moins de douze heures. Revenir sur le compte d’origine permet de retrouver ses éléments conservés sur cet appareil.

Les anciennes clés de brouillon, de retour ou d’instantané sans propriétaire restent conservées sur l’appareil. Elles ne sont jamais attribuées automatiquement au compte connecté ni proposées comme sa séance à reprendre. La création d’un compte depuis le mode invité garde le transfert explicite des données d’invité vers ce nouveau compte.

## Habitudes et bilan rapide

Dans Planning › Planifier une activité, écrire par exemple « Tous les mardis et vendredis, escalade voie à ma salle »,
ou choisir activité, lieu et jours. Vérifier le formulaire, puis enregistrer. Heure, durée prévue, fin de répétition et
séance structurée associée sont facultatives. Aucun lieu n’est codé en dur. « Préparer une séance » ouvre le créateur avec le sport et le temps du rendez-vous. Après avoir enregistré la séance, Modifier / déplacer permet de l’associer à une occurrence ou à la série à venir.

Ouvrir une occurrence passée ou celle du jour et toucher « Faite · bilan rapide ». Confirmer ou modifier les minutes,
indiquer l’effort si connu, et éventuellement une performance libre. « Ajouter autre chose avant / après » permet de
noter le bloc réalisé avant la voie. Le journal garde les activités réelles et le rendez-vous prévu. Compléter le même
bilan met à jour ses lignes sans doublon. Une durée inconnue reste inconnue ; aucune cotation ou série n’est inventée.

Modifier / déplacer permet de changer une occurrence ou les occurrences à venir ; arrêter la répétition garde le passé.
« Pas faite » retire le bilan de cette occurrence après confirmation s’il existe. Les exceptions sont utilisées par le
planning, les rappels et l’export / abonnement iCalendar. Les nouvelles règles horaires conservent leur fuseau IANA.
Chaque rendez-vous avec une heure peut avoir un rappel 10, 30 ou 60 minutes avant. Une occurrence peut désactiver son rappel sans modifier la série. Les rappels exigent l’autorisation du navigateur et le type Rappels activé sur cet appareil dans Paramètres › Notifications et rappels. Le cron vérifie les rendez-vous chaque minute, selon le fuseau de la série ou de l’appareil ; une activité réalisée plus tôt ne supprime pas le rappel d’une autre activité prévue.

Le récit peut être préparé avec le parseur local ou, sur demande, le fournisseur IA choisi. Une sortie IA est toujours présentée
comme un brouillon à corriger et confirmer. Une erreur ou un quota atteint laisse le formulaire manuel disponible.

## Administration et IA

L’accueil admin regroupe Modifier le site, Gérer les membres et Suivre le site ; les outils avancés restent repliés. Les signalements peuvent être ouverts, en cours, traités ou ignorés / doublons, avec trace dans le journal.

Studio conserve brouillons, vérifications, diff, aperçu du contenu, publication, versions et rétablissement.
La liste est filtrable et recherchable. Les données privées d’un membre ne sont pas accessibles aux administrateurs.

Dans **Administration › Assistant du site**, le rôle Intelligence choisit manuellement le fournisseur, son modèle et la limite du site, puis peut tester une réponse. Gemini utilise l’API REST Google, avec `gemini-3.8-flash` par défaut. Workers AI conserve Qwen 3 30B et Llama 3.3 70B. Le réglage enregistré prime sur les valeurs de départ. Un fournisseur indisponible affiche une erreur et laisse les outils manuels accessibles ; aucun fournisseur payant n’est ajouté automatiquement.

**Style des réponses** permet de choisir le ton direct ou pédagogique, une longueur courte / standard / détaillée, la réflexion de Gemini rapide ou approfondie et une créativité limitée de 0 à 0,3. Les valeurs initiales sont `direct`, `standard`, `low` et `0.1`. Le raisonnement interne reste masqué. La clarification des demandes ambiguës, les sources vérifiées (`verified_only`) et la confirmation des modifications sont obligatoires avec tous les styles : l’API refuse de désactiver ces règles.

Le coach reçoit le plan actuel de l’app, la demande et, si l’utilisateur le choisit, le résumé visible de son profil. Pour Gemini, ce partage du profil est décoché initialement ; le choix est conservé par compte et fournisseur. La demande et les derniers messages sont transmis au fournisseur choisi. Les sources locales distinguent le fonctionnement décrit par l’app, les déclarations personnelles et la demande ; une proposition d’entraînement ne prouve pas qu’une séance a été réalisée.

Les réponses du coach déclarent un état `ok`, `clarify` ou `unverified`, leur fondement et les identifiants des sources utilisées. Le serveur accepte uniquement les références qu’il a lui-même fournies et construit les liens affichés ; le modèle ne peut pas ajouter une URL prétendument consultée. Une clarification ou une réponse non vérifiable ne propose aucune action. Les actions acceptées suivent les routes réelles ou le parseur du moteur et attendent un clic.

Pour les questions scientifiques couvertes par le catalogue, le serveur consulte à chaque demande jusqu’à **deux articles PubMed** parmi ses identifiants autorisés. Il lit le résumé via Eutils et vérifie le PMID, le titre et la présence du résumé : délai maximal de **quatre secondes par article**, réponse limitée à **300 000 octets**, extrait limité à 3 000 caractères. Aucun extrait scientifique n’est réutilisé depuis un cache et aucune URL fournie par l’utilisateur n’est suivie. La date affichée correspond à cette consultation réussie. Une erreur, un blocage ou un document inadéquat laisse la référence indisponible ; le texte préparé du catalogue ne remplace jamais un article lu. Les sujets scientifiques sans référence pertinente exigent une précision ou signalent l’impossibilité de vérifier. Aucune recherche Google générale n’est activée et sa gratuité n’est pas présumée.

La lecture d’un résumé vérifie la provenance du document ; elle ne garantit pas que l’interprétation est correcte ni qu’elle représente le consensus scientifique actuel. Les références éligibles restent une partie du catalogue. Les réponses doivent distinguer faits vérifiables, déclarations, estimations et propositions, et signaler les limites des informations disponibles.

L’assistant administrateur exige également un état explicite et des identifiants de sources valides avant de préparer un changement. Un nouvel élément cite la demande et le plan de l’app ; modifier, masquer ou supprimer un élément existant exige la référence exacte de sa fiche dans le contexte fourni. Une cible ambiguë ou une preuve manquante produit une question ou un refus de vérification, avec **zéro changement préparé**, y compris aucune proposition de code à poursuivre. Une réponse Gemini interrompue par `MAX_TOKENS` est refusée avec une erreur 502 ; aucune sortie tronquée n’est appliquée. Les propositions valides passent ensuite par la relecture et la confirmation du Studio.

Pour activer Gemini :

1. Ouvrir [Google AI Studio](https://aistudio.google.com/) et créer une clé API dans un projet Google **sans facturation activée**. Restreindre la clé à l’API Generative Language lorsque le projet le permet.
2. Dans Cloudflare, ouvrir **Workers & Pages › seances-entrainement › Settings › Variables and Secrets**, puis ajouter `GEMINI_API_KEY` comme **secret**. Ne pas placer cette clé dans GitHub, dans les fichiers publics ou dans une conversation. En ligne de commande, l’équivalent est `npx wrangler secret put GEMINI_API_KEY`.
3. Ouvrir l’Assistant du site, choisir **Gemini** si un fournisseur était déjà enregistré, enregistrer et lancer le test de réponse. Ce test vérifie la connexion du compte et du modèle à cet instant.

Gemini dispose d’une offre gratuite pour les projets non facturés, sous réserve des modèles et quotas Google du projet. Le site ajoute sa propre limite : **40 demandes par jour par défaut**, réglable de **1 à 500**, et **3 demandes par minute**, partagée par ses fonctions IA. Ces chiffres sont des protections du site, pas les quotas Google. Une clé API seule ne prouve pas l’absence de facturation : le projet doit rester non facturé. L’app n’active aucune facturation ni offre payante.

Pour Workers AI, Cloudflare inclut 10 000 neurones par jour pour l’ensemble du compte. Le site utilise une réserve estimée de 8 000 par défaut, avec un plafond de 9 000 ; d’autres applications du compte peuvent consommer la même allocation. Cette réserve et la limite Gemini ne garantissent ni une disponibilité illimitée ni l’exactitude des réponses.

Les exemples officiels Google consultés le 5 octobre 2026 utilisent `gemini-3.8-flash`. Les pages détaillées de tarifs et de quotas et les appels Google réels sont bloqués par le proxy de cet environnement : aucun quota gratuit exact ni résultat du modèle en production n’a été attesté ici. Les fournisseurs IA et les lectures PubMed sont simulés dans les tests ; ces tests vérifient les contrôles du site, pas la qualité des réponses réelles. `GEMINI_API_KEY` n’est pas configuré dans cet environnement ; Gemini n’a donc pas encore été activé. Utiliser ChatGPT gratuitement dans son application ne fournit pas une API gratuite pour ce site.

Pour proposer une petite modification de l’interface : Administration › Propositions de code / assistant du site,
examiner le diff puis valider avec le rôle technique. L’IA est limitée aux fichiers publics autorisés et aux petits
remplacements. Elle n’a pas accès au serveur, à la base ou aux secrets. La Pull Request GitHub est créée en **brouillon**,
avec validation automatisée en attente. Le workflow GitHub exécute syntaxe, tests et parcours Chromium.
La relecture, le passage en PR prête, la fusion et le déploiement restent des actions humaines.

Configuration facultative du Worker pour créer ces PR :

- `GITHUB_REPO=martinznt/Escalade` (variable serveur) ;
- `GITHUB_TOKEN` (secret serveur, droits Contents et Pull requests sur ce seul dépôt) ;
- `AI_MODEL` pour sélectionner un modèle autorisé (Gemini ou Workers AI), tant qu’aucun réglage n’est enregistré dans l’administration ; cette variable prime sur le choix initial lié à la présence de la clé.

Sans accès GitHub, le téléchargement du patch reste disponible. Pour bloquer les fusions avec tests en échec,
activer sur GitHub la protection de `main` et rendre le workflow Tests obligatoire.

## Essayer localement

```bash
npm ci
node --no-warnings tests/server.mjs 8787
```

Ouvrir `http://localhost:8787`. Ce serveur exécute le vrai Worker avec une base SQLite **en mémoire** :
les comptes de démonstration disparaissent à son arrêt. Son mot de passe admin est une fixture de test,
jamais un secret à réutiliser en production. Il ne vérifie pas les services réels Cloudflare, Gemini, Workers AI ou GitHub.
