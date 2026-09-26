# Mes séances — v8.0.1

Application web installable (PWA) pour planifier, générer, exécuter et analyser ses séances d'entraînement :
escalade (bloc, voie), renforcement / préparation physique, musculation, course à pied, natation, et toute
activité personnalisée. Chaque recommandation est expliquée (faits, estimations, données manquantes) ; rien n'est inventé.

Le rapport complet d'audit, de tests et de limitations est dans **`FINAL_AUDIT.md`**.

## Architecture en bref

| Partie | Fichiers |
|---|---|
| Serveur (Cloudflare Worker) | `worker.js` (API, sécurité, idempotence), `schema.js` (tables D1 + migrations), `server/publish.js` (nettoyage avant publication), `server/migrate.js` (reprise des anciennes données) |
| Interface (modules ES, sans dépendance) | `public/app.js`, `public/views-*.js`, `public/player.js`, `public/ui.js`, `public/state.js` (stockage local, file hors ligne, synchronisation) |
| Logique métier (pure, testée sous Node) | `public/model.js` (capacités, muscles, métriques, figures), `public/library.js` (catalogue), `public/brain.js` (analyses), `public/generator.js` + `public/engine.js` (générateurs), `public/grading.js` (cotations), `public/estimate.js`, `public/csv.js`, `public/search.js`, `public/commands.js`, `public/items.js`, `public/outbox.js` |
| Hors ligne | `public/sw.js` (précache versionné, identique à la liste servie par le Worker) |

## Déploiement Cloudflare

1. Garder `wrangler.json` (bindings `DB` pour D1, `SEANCES_KV` pour l'ancienne version, `ASSETS` pour `public/`).
2. Définir le secret d'administration (jamais dans le code ni dans le navigateur) :
   `npx wrangler secret put EDIT_PASSWORD`
   Optionnel : `npx wrangler secret put INVITE_CODE` pour réserver l'inscription aux personnes ayant un code.
3. Déployer : `npx wrangler deploy`. Les tables D1 sont créées et mises à niveau automatiquement au premier appel
   (ajouts uniquement, aucune donnée supprimée).
4. Pour devenir administrateur : se connecter avec son compte, puis Paramètres › Administration › saisir `EDIT_PASSWORD`.

Il n'y a aucun mot de passe global pour entrer sur le site : chaque personne crée son compte.

## Tests

```bash
npm run check      # syntaxe de tous les fichiers JS + validation JSON
npm test           # 14 suites unitaires / intégration Worker-D1 / sécurité / synchronisation (256 vérifications)
npm run test:e2e   # navigateur réel (Playwright + Chromium) : 2 comptes, admin, hors ligne (36 étapes)
```

Les tests Worker utilisent une base D1 simulée par `node:sqlite` (Node 22+). Le test E2E démarre un serveur local
(`tests/server.mjs`) qui exécute le vrai `worker.js` et sert `public/` comme le ferait Cloudflare.
