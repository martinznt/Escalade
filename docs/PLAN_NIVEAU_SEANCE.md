# Plan — rendre factuelle l'analyse du niveau d'une séance

Statut (8.28.0) : **A, B, D faits** ; charges écrites lues et rapportées (en % du poids si connu, sans seuil arbitraire). **C fait pour toi** (comparaison à TES séances, `public/fit.js`). **Reste** : ressenti agrégé des membres de la bibliothèque commune — attend ta décision (données partagées, même anonymes).
Code concerné : `public/estimate.js` (`estimateLevel`), utilisé par `generator.js`, `sessionmeta.js`, `views-library.js` (« 🔎 Pourquoi ce niveau ? »), serveur (bibliothèque commune).

## Problèmes constatés (non factuels aujourd'hui)
1. **Données inventées en silence** : difficulté inconnue = 2/5, répétitions = 8, temps = 30 s, 3,5 s par répétition, 75 s par bloc — présentées comme des faits.
2. **Poids et seuils arbitraires** (0,35 / 0,15 / 0,2… ; coupures 0,34 et 0,6) ; « score 0,47 » = fausse précision.
3. **Moyenne qui cache l'essentiel** : un seul exercice très exigeant dans une séance facile peut donner « Débutant ».
4. **Charge réelle ignorée** (20 mm au poids du corps = 20 mm +30 kg ; cotation non notée = ignorée).
5. **Cotation mal utilisée** : position dans la liste du système au lieu de la vraie difficulté (`grading.js` sait convertir : `levelFromReference`).
6. **Un seul chiffre mélange** technique, intensité, volume, durée.
7. **Jamais confronté au réel** (ressenti, séance finie ou non).

## À faire
**A. Séparer connu / estimé / inconnu**
- Connu : nombre d'exercices et de séries, matériel, prérequis des exercices de la bibliothèque, cotations et charges écrites.
- Estimé : durée, effort — affichés comme estimations avec l'hypothèse utilisée.
- Inconnu : exercice hors bibliothèque, répétitions non renseignées — listés, jamais remplis par défaut.
- Fiabilité de l'analyse (haute / moyenne / faible) selon la part d'exercices reconnus et de données complètes.

**B. Niveau fondé sur des règles citables**
- Niveau conseillé = **prérequis le plus élevé** de la séance (« Avancé, parce que *X* demande un niveau avancé »).
- 4 axes séparés avec leur source : technique (prérequis, figures), intensité (charge relative au poids du corps, cotation convertie, part d'exercices intenses), volume (séries × répétitions / temps, essais), durée.
- Supprimer le « score » affiché ; phrase claire : « Niveau conseillé : intermédiaire (à cause de X) ; volume élevé ; durée ~70 min (estimée) ».

**C. Comparer au réel**
- Pour l'utilisateur : position par rapport à son historique (« plus volumineuse que 80 % de tes séances des 3 derniers mois »).
- Bibliothèque commune (**à confirmer par l'utilisateur**) : ressenti agrégé anonyme (« faite 14 fois, effort médian 7/10, finie dans 85 % des cas »), affiché seulement à partir de 5 personnes, aucun classement de personnes ; signaler l'écart entre niveau estimé et ressenti.

**D. Tests**
- Séances du catalogue officiel avec niveau attendu et raison.
- Échec si une donnée manquante est remplie par défaut.
- Un seul exercice avancé suffit à rendre la séance « Avancée ».
- Anciennes séances toujours lisibles (compatibilité).

## Questions ouvertes
- Traiter aussi l'analyse *après* une séance faite (effort, progression des capacités) ?
- Activer le ressenti agrégé de la bibliothèque commune (point C) ?
