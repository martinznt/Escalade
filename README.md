# Seances entrainement — v6.0

PWA complète pour l'escalade et le renforcement musculaire, pensée pour être déployée directement avec Cloudflare Workers + D1 + KV.

## Structure GitHub

```text
/
├── worker.js             # API, authentification, sécurité, D1
├── schema.js             # schéma D1 auto-initialisé/migré
├── wrangler.json         # configuration Cloudflare
├── package.json          # scripts de vérification et test E2E
├── public/
│   ├── index.html        # shell PWA
│   ├── app.js            # interface et logique cliente
│   ├── engine.js         # moteur de séances/génération/progression
│   ├── library.js        # bibliothèque d'exercices
│   ├── shared.js         # normalisation/synchronisation
│   ├── boot.js           # thème et démarrage visuel
│   ├── style.css         # interface
│   ├── sw.js             # cache/offline
│   ├── manifest.json     # PWA
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   └── robots.txt
└── tests/
    ├── engine.test.mjs
    ├── worker.test.mjs
    ├── legacy-upgrade.test.mjs
    ├── e2e.mjs
    ├── d1shim.mjs
    └── sample.txt
```

## Fonctionnalités v6.0

- création, import, édition, duplication et lancement de séances
- générateur intelligent selon objectif, niveau, matériel, historique et récupération
- progression automatique des prescriptions
- chronomètres, repos, vibration, son, voix, wake lock et mode mains libres
- historique détaillé avec RPE et notes de séance
- calendrier et récurrences hebdomadaires
- tableau de progression, statistiques, courbes, records et équilibre musculaire
- objectifs personnels avec progression
- journal d'escalade : bloc/voie/poutre, niveau, résultat, tentatives, style et notes
- sauvegarde/import JSON
- fonctionnement PWA/offline avec synchronisation différée
- authentification durable et protections serveur
- bibliothèque d'exercices commune + exercices personnels
- communauté avec partage volontaire et contrôles de confidentialité

## Déploiement

1. Mettre tout le contenu de ce dossier à la racine du dépôt GitHub.
2. Conserver `wrangler.json` et les bindings D1/KV existants.
3. Déployer avec Wrangler :

```bash
npx wrangler deploy
```

## Vérification locale

Vérification syntaxique :

```bash
npm run check
```

Tests unitaires/intégration :

```bash
npm test
```

Test navigateur : installer les dépendances puis :

```bash
npx playwright install chromium
npm run test:e2e
```

Le test E2E utilise maintenant le package `playwright` normal au lieu d'un chemin absolu propre à un environnement particulier.

## Versionnement PWA

Le Service Worker utilise le cache `seances-entrainement-v6-0`. Lors d'une prochaine version, augmenter explicitement ce numéro afin de forcer le renouvellement propre du cache.

## Sécurité et données

Les données privées restent liées au compte côté serveur. Les données locales servent aussi de cache/offline et les opérations non synchronisées sont conservées dans une file d'attente locale. L'export JSON permet de conserver une sauvegarde indépendante.
