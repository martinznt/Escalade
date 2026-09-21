# Seances entrainement — v7.0

Application PWA de suivi et génération de séances sportives, pensée pour l'escalade mais conçue comme une plateforme multi-activité.

## Nouveautés v7.0
- Profil sportif intelligent et extensible.
- Activités natives : escalade bloc, escalade voie, musculation/force, course, basketball, cyclisme, natation.
- Ajout d'activités personnalisées et de catégories personnalisées.
- Ajout/modification/suppression d'indicateurs sportifs.
- Détection de domaine : une information comme « max tractions » est rattachée au tirage, tandis que « max pompes » est rattachée à la poussée.
- Analyse des domaines d'une activité pour identifier les forces et les axes à travailler.
- Générateur avec choix entre travail des points faibles et progression des points forts.
- Générateur adapté aux activités personnalisées à partir de leurs catégories.
- Profil escalade historique conservé.
- Rate-limit atomique amélioré.
- API de modification/suppression avec contrôle réel du nombre de lignes modifiées.
- File offline : les erreurs définitives sont conservées dans `failedOutbox` au lieu d'être perdues.
- Cache PWA v7.0.

## Installation Cloudflare
1. Mettre les fichiers à la racine du dépôt GitHub.
2. Conserver `wrangler.json` et les bindings D1 existants.
3. Déployer avec `npx wrangler deploy`.

## Tests
```bash
npm test
npm run check
npm run test:e2e
```

`npm test` exécute les tests moteur, Worker/sécurité, migration legacy et profil multi-activité.
Le test E2E nécessite Playwright et un navigateur Chromium installé.
