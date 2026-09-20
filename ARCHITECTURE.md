# Séance Entraînement — structure évolutive

Cette archive ajoute uniquement une structure d'évolution à la V4 existante.
Elle ne remplace pas les fichiers fonctionnels de la V4.

## À intégrer
- Copier `package.json` et `.gitignore` à la racine.
- Ajouter `src/` et `tests/`.
- Organiser progressivement `public/` en `js/`, `css/` et `assets/`.
- Conserver les fichiers fonctionnels actuels de la V4.
- Ne pas supprimer `worker.js`, `wrangler.json` ou les migrations existantes.
- Ne pas créer de nouvelles tables D1 simplement pour cette structure : les schémas doivent être ajoutés via des migrations dédiées après vérification du schéma actuel.

## Architecture de données cible
users
sessions
profiles
user_settings
exercises
workouts
workout_history
set_results
performances
calendar_events

Plus tard :
follows
shared_workouts
activity_feed
challenges
programs

## Principe important
Une séance programmée (`workout`) et une séance réellement effectuée
(`workout_history` + `set_results`) doivent rester séparées.
