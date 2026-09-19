# Escalade & Renforcement — V3

Cette version transforme l'ancien stockage partagé en comptes utilisateurs + données personnelles, avec une bibliothèque d'exercices commune.

## Ce qui change

- comptes individuels et sessions sécurisées
- données de séances personnelles par compte
- calendrier personnel
- historique personnel
- réglages personnels
- thème clair / sombre / système par compte
- bibliothèque commune d'exercices
- ajout d'un nouvel exercice commun sans EDIT_CODE
- modification/suppression d'un exercice commun protégées côté serveur par EDIT_CODE
- exercices personnels
- statistiques de base
- export/import JSON des données personnelles
- PWA et bannière d'installation
- migration automatique des anciennes séances KV vers le premier compte créé

## Déploiement

### 1. Sauvegarde
Conserve le ZIP de l'ancienne version avant de remplacer les fichiers.

### 2. Créer la base D1
Dans le terminal du projet :

```bash
npx wrangler d1 create escalade-et-renforcement-db
```

Copie le `database_id` retourné.

### 3. Récupérer l'ID du KV existant

```bash
npx wrangler kv namespace list
```

Repère le namespace qui contient actuellement les séances et copie son ID.

### 4. Modifier wrangler.json

Remplace :

- `A_REMPLACER_AVEC_ID_D1` par l'ID D1
- `A_REMPLACER_AVEC_TON_ID_KV` par l'ID du KV actuel

Ne mets pas EDIT_CODE ou un mot de passe dans ce fichier.

### 5. Appliquer la migration D1

```bash
npx wrangler d1 migrations apply escalade-et-renforcement-db --remote
```

### 6. Secrets

Garde `EDIT_CODE` dans Cloudflare comme secret.

Le nouveau système n'utilise plus `SITE_PASSWORD` pour protéger tout le site : les utilisateurs se connectent avec leur propre compte.

### 7. Déployer

```bash
npx wrangler deploy
```

Si le projet est déjà relié à GitHub + Cloudflare et que le déploiement automatique est utilisé, le commit contenant ces fichiers déclenchera aussi le déploiement.

### 8. Premier compte

Le premier compte créé récupère automatiquement une copie des anciennes séances présentes dans le KV actuel. Elles deviennent alors ses séances personnelles.

Les exercices présents dans les anciennes séances sont aussi importés dans la bibliothèque commune.

### 9. Tester

Créer un compte A, créer une séance et un événement calendrier.

Créer ensuite un compte B dans une autre session/appareil.

B ne doit pas voir la séance ni le calendrier de A.

Ajouter un exercice dans la bibliothèque commune avec A : B doit le voir.

Essayer de modifier ou supprimer un exercice commun sans EDIT_CODE : le serveur doit refuser.

Avec EDIT_CODE : la modification doit fonctionner.

Changer le thème de A : le thème de B ne doit pas changer.
