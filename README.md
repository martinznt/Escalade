# Séance Entraînement — V4

Version reconstruite pour être utilisée comme une vraie application PWA d'escalade et de renforcement.

## Ce qui est inclus

- Nom de l'application : **Séance Entraînement**
- connexion par compte avec cookie de session HttpOnly : pas besoin de retaper le mot de passe à chaque ouverture
- ouverture directe sur le dernier compte connu lorsque l'appareil est hors ligne
- fonctionnement hors ligne avec cache local et indicateur clair
- import d'une séance en collant simplement son texte
- analyse automatique du format :
  - titre
  - durée
  - objectifs
  - exercices numérotés
  - séries × répétitions
  - fourchettes de répétitions
  - temps
  - repos
  - charge
  - consignes
  - muscles
  - progression
- générateur intelligent :
  - petite / moyenne / grande séance
  - performance max
  - puissance
  - vitesse
  - rési / puissance-endurance
  - endurance
  - force
  - technique
  - équilibre
  - dalle / réglette / dévers / voie / bloc
  - niveau de fatigue
  - matériel disponible
  - historique et métriques du compte
- mode séance avec écran plein, séries, chronos et repos
- historique et métriques personnelles
- bibliothèque d'exercices
- profils publics facultatifs
- partage facultatif des progressions et des séances
- suivi d'autres utilisateurs publics
- personnalisation par appareil :
  - clair / sombre / système
  - palette
  - forme des composants
- export / import JSON
- PWA et service worker avec stratégie réseau-first
- anciennes fonctions V2 supprimées
- `public/` uniquement pour les fichiers réellement servis au navigateur
- protection des données par `user_id`
- correction du calendrier : un utilisateur ne peut modifier/supprimer que ses propres événements
- limitation des tailles de payload
- limitation de fréquence sur inscription / connexion / EDIT_CODE
- purge des sessions expirées lors des connexions
- migration facultative des anciennes séances KV lors du premier compte

## Important

Le générateur est un moteur déterministe local : il ne prétend pas être une IA médicale ou un coach humain. Il utilise les données du compte et des principes documentés. Les charges, suspensions et exercices explosifs doivent rester adaptés à l'expérience réelle et à la technique.

## Déploiement depuis un téléphone

### 1. GitHub

Supprime du dépôt :

- `functions/`
- tout ancien `_middleware.js`
- les anciens fichiers V2

Conserve :

- `worker.js`
- `wrangler.json`
- `migrations/`
- `public/`

### 2. Cloudflare D1

La base existante est déjà référencée dans `wrangler.json`.

Dans **Cloudflare → Workers & Pages → D1 → escalade-et-renforcement-db → Console**, exécute le contenu de :

`migrations/0002_profiles_progress.sql`

Ne ré-exécute pas `0001_init.sql` si cette base existe déjà et possède déjà les tables V3.

Si tu crées une base neuve, applique les migrations dans l'ordre 0001 puis 0002.

### 3. Variables / secrets

Dans **Cloudflare → Workers → escalade-et-renforcement-musculaire → Settings → Variables and Secrets** :

- `EDIT_CODE` : secret, uniquement si tu veux conserver la fonction d'administration de la bibliothèque commune.

Ne crée pas `SITE_PASSWORD`. V4 ne l'utilise plus.

Le KV `SEANCES_KV` est conservé uniquement pour permettre une migration ponctuelle des anciennes séances V2/V3. Après vérification de la migration, il peut être retiré plus tard.

### 4. GitHub + Cloudflare

Envoie tout le dossier du ZIP à la racine du dépôt.

Le dossier `public/` doit être à la racine du projet.

Cloudflare doit utiliser :

- Worker : `escalade-et-renforcement-musculaire`
- entrée : `worker.js`
- assets : `./public`

### 5. Déploiement

Si le projet est relié à GitHub, pousse le commit et laisse Cloudflare déployer.

Si tu utilises Wrangler depuis un ordinateur :

```bash
npx wrangler d1 migrations apply escalade-et-renforcement-db --remote
npx wrangler deploy
```

### 6. Premier lancement

1. Ouvre l'application.
2. Crée ton compte.
3. Si l'ancien KV contient des séances, V4 tente de les importer pour ce premier compte.
4. Vérifie tes séances.
5. Vérifie ensuite la bibliothèque.
6. Crée un deuxième compte de test avant de partager le lien.

### 7. Tests indispensables

Compte A :
- créer une séance
- modifier une séance
- lancer une séance
- ajouter une métrique
- changer clair/sombre
- changer palette
- activer le profil public
- activer le partage de progression

Compte B :
- vérifier qu'il ne voit pas les données privées de A
- chercher le profil public de A
- suivre A
- vérifier le fil social

Calendrier :
- créer un événement avec A
- tenter avec B de modifier l'id d'A : le serveur doit refuser

Hors ligne :
- charger l'app une fois en ligne
- couper le réseau
- fermer/réouvrir
- l'application doit afficher les données locales
- remettre le réseau
- vérifier la synchronisation

## Sources utilisées pour les principes du générateur

- PubMed : Effects of climbing- and resistance-training on climbing-specific performance.
- PubMed : Sport climbing performance determinants and functional testing methods.
- Lattice Training : Finger Strength Training for Climbers.
- Lattice Training : How to Train Climbing Endurance.

Les sources sont également accessibles depuis Réglages dans l'application.
