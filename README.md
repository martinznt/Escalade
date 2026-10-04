# Séances entraînement — v8.32.1

Application web installable (PWA) pour planifier, générer, exécuter et analyser ses séances d'entraînement :
escalade (bloc, voie), renforcement / préparation physique, musculation, course à pied, natation, et toute
activité personnalisée. Chaque recommandation est expliquée (faits, estimations, données manquantes) ; rien n'est inventé.

Les changements et vérifications de la version 8.32.1 sont dans [DELIVERY_8_32_1.md](DELIVERY_8_32_1.md).
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
2. L’assistant IA utilise Workers AI : vérifier le binding `AI` déjà déclaré dans `wrangler.json` et l’accès du compte Cloudflare au modèle. `AI_MODEL` permet de le changer. Le quota gratuit dépend de Cloudflare ; aucune API payante externe n’est obligatoire. Le formulaire et les calculs sportifs fonctionnent sans IA.
3. Définir le secret d'administration (jamais dans le code ni dans le navigateur) :
   `npx wrangler secret put EDIT_PASSWORD`
   Optionnel : `npx wrangler secret put INVITE_CODE` pour réserver l'inscription aux personnes ayant un code.
4. Déployer : `npx wrangler deploy --keep-vars` pour conserver les variables déjà configurées dans Cloudflare (`MOVE_TO`, `AI_MODEL`, `GITHUB_REPO`…). Les tables D1 sont créées et mises à niveau automatiquement au premier appel
   (ajouts uniquement, aucune donnée supprimée).
5. Pour devenir administrateur : se connecter avec son compte, puis Paramètres › Administration › saisir `EDIT_PASSWORD`.

Il n'y a aucun mot de passe global pour entrer sur le site : chaque personne crée son compte.

## Adresse courte (gratuite) : `seances-entrainement.pages.dev`

Le dossier `pages/` contient une porte d'entrée Cloudflare Pages qui transmet tout au Worker principal
(liaison de service `APP`). Mise en place une seule fois dans Cloudflare :
1. Workers & Pages › Créer › Pages › Importer un dépôt Git › `martinznt/Escalade`.
2. Nom du projet : `seances-entrainement` · branche : `main` · préréglage : aucun · commande de build : vide ·
   répertoire de sortie : `pages`.
3. Projet Pages › Paramètres › Liaisons › Ajouter › Liaison de service : nom `APP`, service `seances-entrainement`.
4. Redéployer (Déploiements › ⋯ › Réessayer le déploiement).

L'ancienne adresse `workers.dev` continue de fonctionner ; les comptes et les données sont les mêmes.

## Mises à jour

Chaque déploiement est détecté automatiquement (identifiant de version Cloudflare) : le site et l'application installée
affichent « Nouvelle version — Mettre à jour ». Si l'app était fermée pendant la mise à jour, « 🎉 L'app a été mise à jour »
s'affiche à la réouverture. « Voir les nouveautés » liste les dernières modifications : le titre de chaque commit et ses
lignes « - … » (historique public du dépôt GitHub). Écris donc des titres de commit simples et parlants.
Inutile de modifier un numéro de version.

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
Les rappels push restent réglés dans Planning › Rappels, par appareil et par type ; ils ne deviennent pas des alarmes
individuelles pour chaque rendez-vous.

Le récit peut être préparé avec le parseur local ou, sur demande, Workers AI. Une sortie IA est toujours présentée
comme un brouillon à corriger et confirmer. Une erreur ou un quota atteint laisse le formulaire manuel disponible.

## Administration et IA

Studio conserve brouillons, vérifications, diff, aperçu du contenu, publication, versions et rétablissement.
La liste est filtrable et recherchable. Les données privées d’un membre ne sont pas accessibles aux administrateurs.

Pour proposer une petite modification de l’interface : Administration › Propositions de code / assistant du site,
examiner le diff puis valider avec le rôle technique. L’IA est limitée aux fichiers publics autorisés et aux petits
remplacements. Elle n’a pas accès au serveur, à la base ou aux secrets. La Pull Request GitHub est créée en **brouillon**,
avec validation automatisée en attente. Le workflow GitHub exécute syntaxe, tests et parcours Chromium.
La relecture, le passage en PR prête, la fusion et le déploiement restent des actions humaines.

Configuration facultative du Worker pour créer ces PR :

- `GITHUB_REPO=martinznt/Escalade` (variable serveur) ;
- `GITHUB_TOKEN` (secret serveur, droits Contents et Pull requests sur ce seul dépôt) ;
- `AI_MODEL` pour sélectionner un modèle Workers AI autorisé.

Sans accès GitHub, le téléchargement du patch reste disponible. Pour bloquer les fusions avec tests en échec,
activer sur GitHub la protection de `main` et rendre le workflow Tests obligatoire.

## Essayer localement

```bash
npm ci
node --no-warnings tests/server.mjs 8787
```

Ouvrir `http://localhost:8787`. Ce serveur exécute le vrai Worker avec une base SQLite **en mémoire** :
les comptes de démonstration disparaissent à son arrêt. Son mot de passe admin est une fixture de test,
jamais un secret à réutiliser en production. Il ne vérifie pas les services réels Cloudflare, Workers AI ou GitHub.
