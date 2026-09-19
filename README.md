# Déployer « Mes séances » sur GitHub + Cloudflare Pages

Ce dossier contient un site complet et prêt à déployer :
- `index.html` — l'application (accueil, éditeur, mode séance)
- `manifest.json` + `icon-192.png` / `icon-512.png` — permettent d'installer le site comme une app
- `sw.js` — fait fonctionner le site hors connexion
- `functions/_middleware.js` — protège tout le site par mot de passe
- `functions/api/data.js` — sauvegarde tes séances côté serveur (partagées entre tous tes appareils)

Aucune de ces étapes ne demande de savoir coder. Compte à environ 15-20 minutes la première fois.

---

## 1. Mettre le site sur GitHub

1. Va sur [github.com](https://github.com) et crée un compte si tu n'en as pas.
2. Clique sur **New repository** (bouton vert en haut à droite).
3. Donne-lui un nom, ex. `mes-seances`. Laisse-le **Public** ou **Private** (les deux fonctionnent). Ne coche aucune case (pas de README, pas de .gitignore). Clique **Create repository**.
4. Sur la page qui s'affiche, clique le lien **uploading an existing file**.
5. Glisse-dépose **tous les fichiers et dossiers de ce dossier** (`index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, et le dossier `functions` avec tout son contenu) dans la zone.
6. Clique **Commit changes** en bas de page.

> Le dossier `functions` doit être uploadé avec sa structure : `functions/_middleware.js` et `functions/api/data.js`. Si l'upload par glisser-déposer ne garde pas les sous-dossiers, utilise plutôt GitHub Desktop (application gratuite) ou la commande `git` pour pousser le dossier tel quel.

## 2. Créer le site sur Cloudflare Pages

1. Va sur [dash.cloudflare.com](https://dash.cloudflare.com) et crée un compte gratuit si besoin.
2. Dans le menu de gauche : **Workers & Pages** → **Create** → onglet **Pages** → **Connect to Git**.
3. Autorise Cloudflare à accéder à GitHub, puis sélectionne ton dépôt `mes-seances`.
4. Réglages de build :
   - **Framework preset** : `None`
   - **Build command** : laisse vide
   - **Build output directory** : `/` (ou laisse la valeur par défaut)
5. Clique **Save and Deploy**. Après une minute, ton site est en ligne sur une adresse du type `mes-seances.pages.dev`.

## 3. Ajouter le mot de passe d'accès (secret)

1. Dans ton projet Cloudflare Pages → **Settings** → **Environment variables**.
2. Ajoute une variable :
   - **Variable name** : `SITE_PASSWORD`
   - **Value** : le mot de passe de ton choix
   - Coche **Encrypt** (pour que ce soit bien un secret).
3. Fais ça pour l'environnement **Production** (et **Preview** si tu veux aussi tester avant mise en prod).
4. Va dans l'onglet **Deployments**, clique les **···** du dernier déploiement → **Retry deployment** pour que le mot de passe soit pris en compte.

À partir de maintenant, toute personne qui ouvre le lien doit entrer ce mot de passe avant d'accéder au site.

## 3bis. Ajouter le code de modification (secret séparé)

Ce deuxième code protège uniquement les actions qui modifient le contenu (ajouter/modifier/supprimer un exercice ou une séance, réorganiser, fusionner). Sans ce code, on peut consulter et lancer les séances, mais pas les changer.

1. Toujours dans **Settings** → **Environment variables**, ajoute une deuxième variable :
   - **Variable name** : `EDIT_CODE`
   - **Value** : le code de ton choix (un simple code à 4 chiffres suffit, ex. `2468`)
   - Coche **Encrypt**.
2. Refais un **Retry deployment**.

Quand quelqu'un essaie de modifier quoi que ce soit, un petit message apparaît pour demander ce code. Une fois entré correctement sur un appareil, il n'est plus redemandé sur cet appareil (jusqu'à ce que tu cliques sur « 🔓 Édition activée » pour reverrouiller manuellement, par exemple avant de prêter ton téléphone).

## 4. Activer la sauvegarde partagée entre appareils (KV)

1. Dans Cloudflare, menu de gauche : **Workers & Pages** → onglet **KV** → **Create a namespace**. Donne-lui un nom, ex. `SEANCES`.
2. Retourne dans ton projet Pages → **Settings** → **Functions** → **KV namespace bindings** → **Add binding**.
   - **Variable name** : `SEANCES_KV` (exactement ce nom, l'API du site l'utilise)
   - **KV namespace** : sélectionne `SEANCES` que tu viens de créer.
3. Sauvegarde, puis refais un **Retry deployment** comme à l'étape précédente.

À partir de là, tout ce que tu ajoutes ou modifies dans l'app est sauvegardé sur le serveur : si tu ouvres le site sur un autre téléphone ou ordinateur (avec le même mot de passe), tu retrouveras les mêmes séances. La synchronisation prend en général quelques secondes.

## 5. Installer le site comme une application (Chrome)

1. Ouvre le lien de ton site dans **Chrome** (ordinateur ou Android) et entre le mot de passe.
2. Sur ordinateur : clique l'icône d'installation dans la barre d'adresse (petit écran avec une flèche), ou menu **⋮** → **Installer Mes séances…**.
3. Sur Android : menu **⋮** → **Ajouter à l'écran d'accueil** / **Installer l'application**.
4. Sur iPhone (Safari) : bouton Partager → **Sur l'écran d'accueil**.

Une fois installée, l'app s'ouvre comme une vraie application, en plein écran, avec sa propre icône.

## 6. Utilisation hors connexion

Après avoir ouvert le site une première fois (mot de passe entré, page chargée), il continue de fonctionner sans connexion : tu peux consulter et modifier tes séances, lancer une séance et utiliser les chronos même sans réseau. Dès que la connexion revient, tes changements se resynchronisent automatiquement avec le serveur.

---

### Pour mettre à jour le site plus tard

Modifie les fichiers directement sur GitHub (bouton crayon ✏️ sur chaque fichier) ou repousse une nouvelle version du dossier. Cloudflare Pages redéploie automatiquement à chaque modification du dépôt GitHub.
