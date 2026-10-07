# Réglages Cloudflare à effectuer toi-même

La version 8.33.0 est envoyée sur `main`, ce qui déclenche le déploiement automatique existant. Ce guide décrit les opérations à effectuer toi-même dans tes comptes ; il ne déclenche aucun déploiement. Le site existant est [seances-sport.pages.dev](https://seances-sport.pages.dev), avec le Worker `seances-entrainement`.

## Activer Gemini avec un projet gratuit

1. Ouvre [Google AI Studio](https://aistudio.google.com/), choisis un projet Google sans facturation activée et crée une clé API. Vérifie dans AI Studio que le modèle proposé dispose bien d’un quota gratuit dans ton projet et ton pays. Les limites Google peuvent évoluer ; l’abonnement ChatGPT ou Gemini grand public ne fournit pas automatiquement une API au site.
2. Ouvre Cloudflare → **Workers & Pages → seances-entrainement → Settings → Variables and Secrets**. Ajoute `GEMINI_API_KEY` avec le type **Secret**. Ne colle pas cette clé dans une conversation, dans GitHub ni dans un fichier public. Restreins-la à l’API Generative Language dans Google lorsque cette option est disponible.
3. Enregistrer les paramètres Cloudflare peut créer une nouvelle version du Worker. Effectue cette opération seulement au moment où tu souhaites activer le service ; je ne la réalise pas à ta place.
4. Dans le site, connecte-toi avec le rôle **Intelligence** ou **Super-administrateur**, puis ouvre **Paramètres → Administration → Assistant du site**. Sélectionne Gemini, enregistre, puis lance le test de connexion. Un fournisseur déjà enregistré reste sélectionné tant que tu ne le changes pas.
5. Garde une limite du site adaptée à ton quota. La valeur initiale est 40 demandes par jour et la protection commune est de 3 demandes par minute. Ce sont les protections de l’application, pas une promesse sur les quotas Google. N’active pas la facturation pour contourner un quota si tu souhaites rester sur l’offre gratuite.

Le modèle prévu dans cette version est `gemini-3.8-flash`. Sa disponibilité et son quota doivent être confirmés dans ton propre projet. Si Google refuse le modèle ou la clé, conserve les outils manuels et note le message exact pour adapter la liste des modèles autorisés. L’application ne change pas de fournisseur après une erreur et n’active pas automatiquement une offre payante.

Le ton, la longueur et le niveau de réflexion se règlent au même endroit. La clarification d’une demande ambiguë, les références vérifiées et la validation des modifications restent obligatoires. Le partage du résumé du profil avec Gemini est un choix de chaque utilisateur, décoché initialement.

## Vérifier les réponses réelles

Après activation, contrôle au moins une demande dans chacun de ces outils : coach, création d’exercice, objectif, intention du créateur, planning, modification de séance, assistant administrateur, Studio, laboratoire et maintenance. Le bouton de test vérifie la connexion ; il ne mesure pas la qualité de toutes les réponses.

Pour une demande incompréhensible, l’assistant doit demander une précision et préparer zéro changement. Pour une question sportive scientifique, distingue les données déclarées, les règles de l’application et les articles effectivement consultés. Vérifie les liens et la date affichée. Une source indisponible doit produire une limite explicite. La présence d’un article ne garantit pas l’exactitude de chaque interprétation.

Les tests locaux simulent les fournisseurs et PubMed. Les appels Google et PubMed réels sont bloqués par le proxy de l’environnement de développement : leur fonctionnement dans ton Worker doit donc être vérifié après configuration.

## Conserver les ressources existantes

Ne recrée pas la base ni le projet Pages. Vérifie simplement les liaisons existantes du Worker : `DB` vers `escalade-et-renforcement-db`, `SEANCES_KV`, `ASSETS` vers `public/`, `AI` pour l’option Workers AI, et `CF_VERSION_METADATA`. Dans Pages `seances-sport`, la liaison de service `APP` doit viser `seances-entrainement`.

Les ajouts de tables sont appliqués automatiquement et de manière idempotente par le Worker. La nouvelle migration des icônes ajoute son stockage ; aucune importation SQL manuelle ni suppression de compte n’est demandée. Conserve les secrets `EDIT_PASSWORD`, `INVITE_CODE` s’il est utilisé et les autres variables existantes.

La branche `main` est reliée au déploiement automatique existant : chaque mise à jour de `main` publie le site. Les branches de travail ne créent que des versions d’aperçu, sans changer la version active. Pour un déploiement manuel ultérieur, conserver les variables existantes avec `--keep-vars`.

## Notifications et annonces

1. Dans le Worker → **Settings → Triggers → Cron Triggers**, vérifie la présence de `* * * * *` : reprise de la file et rappels chaque minute.
2. Sur un appareil réel, ouvre **Paramètres → Notifications et rappels**, autorise les notifications puis utilise le bouton de test. Sur iPhone/iPad, utilise l’application ajoutée à l’écran d’accueil et un système compatible avec les notifications web.
3. Après un déploiement GitHub réussi, le workflow `notify-deployment.yml` réveille la version attendue. Une première visite et le cron assurent aussi la reprise. Le navigateur et le système peuvent différer la réception ; le site ne peut garantir un affichage instantané sur tous les téléphones.
4. Quand la version te satisfait, ouvre **Administration → Notifications de mise à jour → Envoyer à tous**, relis titre, message, version et audience, puis confirme. Cette annonce apparaît dans le site pour tous. Les appareils déjà abonnés peuvent la recevoir même avec les mises à jour automatiques décochées ; une permission navigateur refusée ne peut pas être contournée. L’annonce finale n’est pas envoyée à ta place.

## Icônes de l’application et des notifications

Dans **Paramètres → Apparence**, choisis une icône existante ou ouvre le créateur : base, sports, style, palette et couleurs, puis aperçu et enregistrement. Dans **Notifications et rappels**, tu peux suivre l’icône de l’app ou créer un choix distinct. Le brouillon est propre au compte ; l’enregistrement de l’image installable nécessite une connexion.

Ouvre ensuite **Ouvrir la page d’installation avec ce choix**. Sur iOS, il faut généralement réinstaller depuis Safari pour changer l’icône déjà installée. Sur Android, Chrome peut actualiser une PWA plus tard ; la réinstallation permet de reprendre le nouveau manifeste. Synchronise ou exporte d’abord les modifications hors ligne. Une installation complète de PWA apparaît dans la liste des applications ; un simple raccourci peut rester uniquement sur l’écran d’accueil.

Teste une création sur le Worker gratuit et les deux types de notifications sur un téléphone. L’enregistrement valide les cinq tailles PNG séparément pour limiter le travail de chaque requête. Les mesures locales ne garantissent pas le respect de toutes les limites CPU de Cloudflare. Certains systèmes choisissent leur propre icône de notification ou ignorent le petit repère monochrome.

## Propositions de code par l’assistant administrateur — facultatif

Pour permettre l’ouverture de Pull Requests en brouillon, ajoute au Worker une variable `GITHUB_REPO=martinznt/Escalade` et un secret `GITHUB_TOKEN`, limité à ce dépôt avec les permissions **Contents** et **Pull requests** nécessaires. Une date d’expiration est préférable. Ces réglages sont facultatifs : sans eux, le patch reste téléchargeable.

L’assistant ne peut proposer que des changements limités dans les fichiers publics autorisés. Relis le diff et les preuves, valide la proposition, puis laisse passer les tests GitHub. La fusion et la publication restent sous contrôle humain. Dans GitHub, une règle de protection de `main` avec le workflow **Tests** obligatoire empêche une fusion lorsque ces vérifications échouent.

## Environnement de développement cloud

Le brouillon de configuration de cet environnement a été préparé séparément : installation des dépendances, Chromium et commandes de démarrage/tests. Pour le réutiliser lors des prochaines tâches, relis puis enregistre/publie ce brouillon dans les paramètres de l’environnement Codex. Cela ne publie pas le site sur Cloudflare.

Ce workflow local ne nécessite pas de jeton Cloudflare. Dans la révision du brouillon, retire l’ancienne exigence `CLOUDFLARE_API_TOKEN` ajoutée pour la publication directe : l’outil de sauvegarde peut ajouter des exigences, mais ne peut pas supprimer celle-ci. Les étapes Cloudflare de ce guide restent manuelles.

## Activer Strava manuellement

Le connecteur est préparé dans le code local. Aucun compte Strava n’a été connecté pendant le développement ; les tests simulent son API. La documentation actuelle et les conditions Strava doivent être relues avant l’activation : leur accès a été bloqué par le proxy de développement. Consulte [le portail développeur](https://developers.strava.com/), [les conditions API](https://www.strava.com/legal/api) et [la gestion de ton application](https://www.strava.com/settings/api). Vérifie notamment le nombre d’athlètes autorisés, les quotas et l’éventuelle procédure d’approbation avant de proposer la connexion à tous les membres.

1. Crée/configure l’application dans Strava. Renseigne le domaine de rappel public du site : pour l’adresse actuelle, `seances-sport.pages.dev`. La connexion est en lecture seule ; elle demande `read,activity:read_all`, ce dernier accès incluant les activités privées que chaque utilisateur choisit d’autoriser.
2. Dans **Cloudflare → Workers & Pages → Worker principal → Settings → Variables and Secrets**, ajoute les variables texte `STRAVA_CLIENT_ID` (identifiant donné par Strava) et `STRAVA_REDIRECT_URI` : `https://seances-sport.pages.dev/api/integrations/strava/callback`. Si tu utilises un domaine personnalisé, remplace l’origine par ce domaine, identique à celui où l’utilisateur est connecté. Pas de paramètre ni de fragment dans cette adresse.
3. Ajoute `STRAVA_CLIENT_SECRET` comme **secret**, jamais dans GitHub, le navigateur ou une conversation.
4. Génère sur ton ordinateur une clé de chiffrement avec `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Ajoute cette valeur comme secret `STRAVA_TOKEN_KEY`. Conserve-la dans ton gestionnaire de secrets : la changer ou la perdre oblige les utilisateurs à reconnecter Strava. Elle chiffre les accès conservés par le serveur et ne doit pas être confondue avec le secret fourni par Strava.
5. Après la publication autorisée de la version, vérifie que les migrations D1 automatiques sont arrivées à **13**, en conservant la base existante. Ne recrée pas la base. Les variables vont sur le Worker principal ; Pages utilise déjà sa liaison `APP` pour transmettre `/api/*`.
6. Dans **Paramètres → Applications connectées → Strava**, coche le consentement et clique sur **Connecter Strava**. Termine l’autorisation dans le même navigateur et le même compte Mes séances. Un refus ou un retour expiré demande de recommencer ; aucun mot de passe Strava n’est saisi dans Mes séances.
7. Charge un aperçu, sélectionne une activité et importe-la. Vérifie son nom, sa date et sa durée dans le journal. Recharge le même aperçu : l’activité doit être indiquée comme déjà importée. Teste ensuite la déconnexion sur un compte d’essai ; elle doit retirer les imports Strava de ce compte et révoquer l’accès. Si la révocation distante ne peut pas être confirmée, le site le dit : termine-la dans [les applications autorisées Strava](https://www.strava.com/settings/apps).

L’import est manuel, vingt activités par page, avec aperçu valable dix minutes. Les valeurs non prises en charge ne sont pas transformées en mesures inventées : pas de tracé GPS, de description complète, de données cardio ni de records créés automatiquement. Les séances restent privées et sont exclues du résumé transmis au coach IA. La déconnexion retire aussi les fichiers que l’utilisateur a explicitement identifiés comme venant de Strava. Pour changer de compte Strava, déconnecte d’abord l’ancien.

GPX/TCX et CSV restent utilisables sans configuration d’un fournisseur. Le CSV propose une correspondance de colonnes à vérifier ; les cotations d’escalade restent du texte déclaré. Cela ne garantit pas la compatibilité automatique avec tous les formats propriétaires. FIT, les sauvegardes Apple Santé et l’accès natif Health Connect ne sont pas implémentés. Les possibilités étudiées et leurs sources figurent dans [SPORTS_INTEGRATIONS_RESEARCH.md](SPORTS_INTEGRATIONS_RESEARCH.md).
