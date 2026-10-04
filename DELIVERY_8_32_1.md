# Mise à jour 8.32.1 — Paramètres et visites

Cette mise à jour répond aux demandes de paramètres faciles à trouver, d’une présentation plus sobre et de visites facultatives. Elle complète la refonte décrite dans `DELIVERY_8_32.md`.

## Changements

- L’onglet **Paramètres** reste dans la navigation principale. Le choix **Simple / Avancée** est directement en haut de cet écran, à un seul endroit.
- Cinq rubriques courantes sont visibles : **Affichage et accessibilité**, **Pendant la séance**, **Notifications et rappels**, **Mes données**, **Aide**. L’administration est aussi directement visible pour les administrateurs. Les autres options sont repliées en mode simple.
- La recherche retrouve les réglages avec leurs mots courants et ouvre les sections qui les contiennent, y compris la gestion du compte ou la fiche du profil. Les résultats réservés aux comptes sont masqués pour les invités.
- La **taille du texte** se règle une seule fois, avec l’accessibilité. Les couleurs, ambiances, animations et outils de mise en page restent accessibles dans leurs sections.
- Navigation avec des icônes dessinées cohérentes, surfaces unies, boutons moins arrondis et textes plus courts. Les thèmes clair et sombre et les réglages personnalisés sont conservés.
- **Passer la visite** est disponible à chaque étape de la visite générale, des visites de page et des nouveautés, avec la croix et la touche Échap. Une visite passée ne revient pas automatiquement au rechargement ; elle reste relançable dans **Paramètres › Aide**. Une visite de page quittée laisse l’utilisateur sur cette page.
- En mode simple, la création met Express et Guidé en avant ; Avancé et À la main restent dans **Autres façons de créer**.

Les calculs sportifs, les historiques, les comptes et la synchronisation suivent le même fonctionnement. Cette mise à jour n’ajoute ni dépendance de production ni migration SQL.

## Vérifications

Contrôles réalisés le 4 octobre 2026 avec Node 24, Playwright 1.63 et Chromium système 151 :

| Contrôle | Résultat |
|---|---|
| `npm run check` | Syntaxe JS et JSON : réussite |
| `npm test` | 70 suites, 690 cas annoncés : réussite |
| `tests/e2e.mjs`, Chromium | 83 étapes existantes : réussite, aucune erreur JavaScript |
| `tests/experience-e2e.mjs`, Chromium | 17 étapes, dont les nouveaux paramètres et visites : réussite |
| Wrangler `deploy --keep-vars --dry-run` | Worker compilé, ressources Cloudflare existantes conservées |
| `git diff --check` | Réussite |

Les deux suites navigateur totalisent 100 étapes. Les nouveaux parcours vérifient la recherche des réglages repliés, l’unicité du choix d’interface et de la taille du texte, les vues à 320/390/1280 px, les thèmes clair et sombre, les visites quittées après plusieurs étapes et leur relance. Les parcours existants couvrent notamment comptes, administration, calendrier, hors ligne, synchronisation et absence de double bilan.

## Publication

La branche `main` du dépôt `martinznt/Escalade` est reliée aux déploiements Cloudflare existants du Worker et de Pages. Les résultats de la CI et des déploiements sont consultables dans les contrôles du commit publié. L’adresse du site est `https://seances-sport.pages.dev`.

Les tests locaux exécutent le vrai Worker avec une base D1 simulée par SQLite ; les réponses Workers AI et GitHub sont simulées. Le proxy de cet environnement bloque l’ouverture directe des adresses Cloudflare : les contrôles distants attestent le déploiement, mais ne remplacent pas une vérification manuelle du site en production.
