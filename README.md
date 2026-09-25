# Seances entrainement — v7.2

Application PWA de suivi et génération de séances sportives, pensée pour l'escalade mais conçue comme une plateforme multi-activité.

## Nouveautés v7.2 (audit de fiabilité)
Corrections de bugs réels trouvés en creusant au-delà des tests existants (détail complet dans AUDIT.md) :
- **Critique** : le Worker bloquait `/commands.js` et `/outbox.js` (liste blanche incomplète) — l'application aurait cassé au chargement pour tout le monde. Corrigé.
- **Perte de données confirmée** : les objectifs (`goals`) n'étaient jamais réellement enregistrés côté serveur (liste blanche de nettoyage des réglages incomplète) — perdus au changement d'appareil ou à la réinstallation. Corrigé.
- Deux race conditions corrigées (rate limit du login, inscription concurrente sur un même pseudo).
- Historique : une collision d'identifiant (très improbable) pouvait silencieusement ne rien enregistrer sans le signaler ; corrigé.
- Basketball et Cyclisme retirés des activités préconfigurées (hors périmètre V1 demandé) — toujours possibles en activité personnalisée.
- Les scores du profil sportif devinés automatiquement (sans note personnelle) sont maintenant clairement marqués comme des estimations (« ≈ »), jamais présentés comme une mesure.
- `npm test` couvre désormais aussi la cohérence des fichiers servis (`tests/assets.test.mjs`), qui aurait détecté le bug critique ci-dessus automatiquement.

## Nouveautés v7.0
- Profil sportif intelligent et extensible.
- Activités natives (V1) : escalade bloc, escalade voie, musculation/renforcement, course, natation. Basketball et cyclisme ne sont volontairement pas préconfigurés en V1 (créables en activité personnalisée).
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

## Nouveautés v7.1
- **Pourquoi ?** : les raisons déjà calculées par le générateur (`meta.why`) sont maintenant affichées dans un bloc dépliable après chaque séance générée, au lieu d'être calculées puis jetées.
- **Que faire aujourd'hui ?** (`suggestToday` dans `engine.js`) : quand rien n'est planifié, l'accueil propose 1 à 3 options concrètes (événement du jour, repos si séance très récente, séance du jour, version allégée si la dernière séance était dure) — chacune avec sa raison. Ne présume jamais de la forme du jour : propose une alternative plutôt que de deviner.
- **Commandes en langage naturel** (`public/commands.js`) : parseur déterministe, sans IA externe, pour « Fais une séance de 20 minutes pour les jambes », « Remplace les tractions », « Ajoute 5 minutes de gainage », « Montre mes records », « Supprime ma dernière séance » (confirmation obligatoire). Accessible via le bouton 🗣️ Commande sur l'accueil. Une phrase non reconnue ne déclenche jamais d'action inventée.
- **Robustesse de la file d'attente hors-ligne** (`public/outbox.js`) : après investigation, la plupart des opérations étaient déjà protégées contre les doublons (contraintes d'unicité + conversion en 409 côté Worker). Ajout d'un filet de sécurité générique : une opération qui échoue avec une erreur serveur (5xx) plus de 6 fois de suite est désormais écartée (au lieu de bloquer indéfiniment toutes les opérations suivantes), et signalée clairement. Le Diagnostic affiche maintenant l'opération en tête de file et les dernières actions écartées, y compris hors ligne.
- Nouveaux tests : `tests/commands.test.mjs` (parseur de commandes), `tests/outbox.test.mjs` (protection anti-blocage) — voir « Audit » ci-dessous pour le détail de ce qui a été vérifié et ce qui reste à faire.

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

`npm test` exécute les tests moteur, Worker/sécurité, migration legacy, profil multi-activité, commandes naturelles, file d'attente hors-ligne et cohérence des fichiers servis (100 vérifications, 13 suites).
Le test E2E nécessite Playwright et un navigateur Chromium installé.
