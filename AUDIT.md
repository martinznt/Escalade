# Audit final — Séances entraînement v6.0

## Corrections intégrées
- Correction du faux statut « Faite » : une séance réalisée ne marque plus toutes les séances du même jour comme terminées.
- Harmonisation du nom « Seances entrainement » dans l'interface, le manifest et le test E2E.
- Invalidation du cache PWA pour la release v6.0.
- Ajout d'un tableau de bord pratique avec objectifs et journal d'escalade.
- Ajout de notes de séance enregistrées dans l'historique.
- Ajout d'objectifs manuels, objectifs par nombre de séances et objectifs de réussites d'escalade.
- Ajout d'un journal escalade bloc/voie/poutre avec niveau, résultat, tentatives, style et note.
- Ajout de scripts npm de vérification et de test.
- Test E2E rendu portable : il utilise le package Playwright au lieu d'un chemin absolu propre à un environnement particulier.

## Vérifications exécutées
- `npm run check` : OK.
- 32 tests moteur : OK.
- 33 tests Worker/sécurité : OK.
- migration legacy : OK.
- JSON manifest/Wrangler : OK.
- dimensions des trois icônes PWA : OK.
- contrôles statiques des nouvelles fonctionnalités : OK.

## Limites honnêtement vérifiées
- Le test navigateur E2E n'a pas été exécuté dans cet environnement car Chromium/Playwright n'est pas installé localement. Le ZIP contient `package.json` et `tests/e2e.mjs` prêts pour `npm install` puis `npx playwright install chromium` et `npm run test:e2e`.
- Le rate limiting dépend de la concurrence réelle de D1/Cloudflare et doit être validé sur le déploiement Cloudflare.
- Les fonctions vocales et Wake Lock dépendent du navigateur et sont protégées par des fallbacks.
