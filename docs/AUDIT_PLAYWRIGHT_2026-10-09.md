# Audit Playwright complet — Séances entraînement (9 et 10 octobre 2026)

Version auditée : 8.34.1 (`main`, `b331d11`), puis la branche `claude/new-session-wi9olv` jusqu’à la 8.34.2.
Tout a été exécuté dans le conteneur de travail, sur un serveur local qui fait tourner le vrai `worker.js` avec une base D1 simulée (`node:sqlite`) et sert `public/` comme Cloudflare. **Le site en ligne (https://seances-sport.pages.dev/) n’a pas été testé** : aucune donnée réelle n’a été touchée.

Les consignes ont été suivies : aucun test supprimé ni affaibli pour passer, aucun échec masqué, chaque modification fonctionnelle est listée (section 4 et `CHANGELOG.md`), rien n’est déclaré testé sans avoir été exécuté. Quand un test échouait à cause de l’outil de test lui-même et non du site, c’est dit explicitement (section 7).

---

## 1. Scénarios identifiés

| Fichier (`tests/audit/`) | Scénarios | Ce qui est vérifié |
|---|---:|---|
| `reprise.spec.mjs` | 41 | Reprise A01–A41 des parcours de la suite existante (création, lecteur, agenda, sauvegarde, hors ligne, admin…) |
| `pages.spec.mjs` | 5 | Chaque page (49 membres, 16 admin, adresses inexistantes) × membre/admin × interface simple/avancée : 65 étapes par combinaison ; écran d’erreur, défilement horizontal, éléments hors écran ou recouverts, contrôles sans nom, états ARIA, identifiants en double, texte cassé ; plus un auto-contrôle du vérificateur (défauts injectés) |
| `boutons.spec.mjs` | 6 | Explorateur « chaque bouton » : chaque bouton de chaque page puis de chaque fenêtre ouverte (2 583 clics) |
| `formulaires.spec.mjs` | 6 | Explorateur « chaque formulaire » : chaque formulaire rempli et envoyé, chaque liste ou champ « changement » modifié (156 essais) |
| `seances.spec.mjs` | 9 | Créer (guidée, à sa façon), modifier, dupliquer, archiver, supprimer, texte collé, recherche, données inhabituelles, séparation des comptes |
| `agenda.spec.mjs` | 5 | Rendez-vous unique et répété, exception, suppression d’une série, lien d’abonnement, agenda du téléphone (iCal) |
| `stats.spec.mjs` | 3 | Chiffres 7 / 30 / 90 jours recalculés à la main, ressenti moyen, charge |
| `profil.spec.mjs` | 3 | Mesures saisies au clavier (IMC, masse maigre, FFMI), valeurs refusées, zones à ménager respectées par le générateur |
| `api.spec.mjs` | 8 | Toutes les routes du serveur (lues dans `worker.js`) : accès anonyme, IDOR, en-têtes, secrets, suppression du compte, requêtes forgées, limite de tentatives admin |
| `compte.spec.mjs` | 6 | Inscription, connexion, déconnexion et retour arrière, changement de mot de passe, apparence suivie, signalement, aide |
| `ia.spec.mjs` | 5 | IA simulée : réponse valide, réponse piégée (HTML, actions), non-JSON, panne, objectif refusé |
| `admin.spec.mjs` | 5 | Activation (mot de passe jamais gardé), signalement piégé, e-mail masqué, « Envoyer à tous » (annuler / confirmer), rôle limité |
| `fiabilite.spec.mjs` | 7 | Fichier choisi pendant un redessin, session expirée, deux onglets, coupure réseau, 1 500 séances + 200 rendez-vous, clics rapides, retour arrière |
| `accessibilite.spec.mjs` | 5 | WCAG 2.1 A/AA (axe-core 4.10.3) sur chaque page en interface simple et avancée, clavier, focus visible, taille des cibles |
| **Total** | **114** | sur un profil d’appareil, plus 8 scénarios API |

Plus les tests existants du dépôt, relancés : `npm test` (106 scripts) et `npm run test:e2e` (25 scripts navigateur).

## 2. Tests réellement exécutés

⟦EXECUTION⟧

## 3. Résultats : réussis, échoués, bloqués, non exécutés

⟦RESULTATS⟧

## 4. Défauts trouvés, par gravité

Gravité : **critique** = perte ou fuite de données, faille de sécurité, fonction principale inutilisable ; **majeur** = résultat faux ou perte silencieuse dans un usage courant, ou blocage pour une catégorie d’utilisateurs ; **mineur** = gêne, affichage, cas rare. Tous les défauts ci-dessous ont été **corrigés** sur la branche, avec un test qui échouait avant et passe après, sauf mention contraire.

### Critiques

Aucun trouvé. En particulier, aucune fuite entre comptes (IDOR), aucun secret dans `public/`, aucune route d’administration accessible sans le rôle, mot de passe administrateur jamais gardé ni renvoyé, signalements et réponses d’IA piégés affichés comme du texte (scénarios API01, API02, API03, API05, API06, AD01, AD02, IA02).

### Majeurs (4)

| N° | Défaut | Reproduire | Attendu | Observé | Preuve |
|---|---|---|---|---|---|
| M1 (N02) | Un fichier choisi pendant que la page se redessine est perdu, sans message | Paramètres › Données › « Importer une sauvegarde » ; la fenêtre de choix du fichier est ouverte ; pendant ce temps la page se redessine (synchronisation au retour au premier plan) ; choisir le fichier | « Importer cette sauvegarde ? » | Rien ne se passe | F01 (échouait avant, passe après) ; cause : l’écoute « change » passait par le document et l’ancien champ, sorti de la page, ne lui parvenait plus |
| M2 | Un ressenti non donné est enregistré « 1 » par le serveur | Terminer une séance sans donner le ressenti ; lire l’historique renvoyé par `/api/history` | ressenti 0 (non donné) | ressenti 1 : la moyenne du ressenti et la charge (minutes × ressenti) sont faussées | `audit-fixes-2.test.mjs`, ST02, ST03 ; cause : `clamp(d.rpe, 1, 5)` dans `cleanHistoryData` |
| M3 | La virgule décimale est effacée sans prévenir | Profil › Corps : taper « 72,5 » au clavier dans le poids (ou « 32,5 » dans un tour de bras) ; enregistrer | 72,5 kg | 725 kg (et 325 cm) ; l’IMC et la composition corporelle deviennent absurdes | P01 ; cause : Chromium efface la virgule dans un champ numérique |
| M4 | Clavier : le focus n’entre pas dans une fenêtre ouverte et se perd à sa fermeture | Au clavier, ouvrir ☰ Menu ; appuyer sur Tab ; puis Échap | Le focus entre dans la fenêtre, puis revient sur ☰ (WCAG 2.4.3) | Le focus reste derrière la fenêtre ; après Échap il repart en haut de la page | AX02 |

### Mineurs (12)

| N° | Défaut | Reproduire | Attendu → Observé | Preuve |
|---|---|---|---|---|
| m1 (N01) | Un ancien lien de rappel ouvre l’accueil | Ouvrir `#/home/agenda` (adresse des notifications reçues avant la 8.34.1) | Calendrier → Accueil | A13 (`reprise.spec.mjs`) |
| m2 | En-têtes de sécurité absents de certaines réponses | `GET /api/version`, `/api/changes`, `/api/global`, icônes, flux iCal | `X-Content-Type-Options`, `Content-Security-Policy`… → absents | API04, `audit-fixes-2.test.mjs` |
| m3 | Supprimer un rendez-vous répété laisse ses exceptions en base | Créer un rendez-vous répété, en déplacer une occurrence, supprimer la série | Plus rien sur le serveur → exceptions orphelines gardées (invisibles) | C02 |
| m4 | Un rendez-vous unique déplacé est exporté avec une exclusion sans règle de répétition | Déplacer un rendez-vous unique, s’abonner au flux iCal | Une seule entrée → l’ancienne entrée (avec EXDATE sans RRULE) et la nouvelle ; certains agendas montrent les deux | C05, `audit-fixes-2.test.mjs` |
| m5 | Ressenti moyen écrit avec un point | Progrès › Résumé | « 3,4 » → « 3.4 » | ST02 |
| m6 | Badges non obtenus peu lisibles | Progrès › Badges | Contraste ≥ 4,5:1 → 2,88:1 | AX01 (axe) |
| m7 | Jours de la semaine sans nom lu par les lecteurs d’écran | Accueil › série de la semaine | Nom annoncé → `aria-label` sans rôle, ignoré | AX01 |
| m8 | Bouton « ⓘ » d’un exercice trop petit | Page d’une séance | ≥ 24 × 24 px → 23 px | AX04 |
| m9 | Un message en efface un autre aussitôt | Enregistrer quelque chose au moment où un badge est gagné | « Enregistré » lisible → remplacé au bout de quelques millisecondes | Explorateur des boutons ; corrigé : 1,8 s minimum, erreurs immédiates |
| m10 | « Lancer la visite » d’une mise à jour provoque une erreur JavaScript | Paramètres › Mises à jour › « 🧭 Lancer la visite » | Aucune erreur → `TypeError: Cannot read properties of null (reading 'style')` (8 fois) | Explorateur des boutons ; la bulle était placée avant d’être dessinée |
| m11 | Un nouveau compte voit 4 anciennes versions comme « nouvelles », et la liste des mises à jour est dans le désordre | Créer un compte ; regarder 🔔 | 1 (la dernière version) → 4 (8.23 à 8.26, datées après la 8.27 dans `news.js`) | Mesure dans le navigateur avant / après ; captures `docs/assets/audit-playwright/` |
| m12 | L’icône du calendrier affiche « 17 juillet », en anglais | Barre du haut | Icône neutre → émoji 📅 « July 17 » | Captures avant / après |

### Petites gênes corrigées (demande « trucs chiants ou pas pratiques »)

| Gêne | Avant | Après |
|---|---|---|
| Menu sur la page courante | Toucher la page où l’on est déjà dans ☰ Menu ne faisait rien, le menu restait ouvert | Le menu se ferme |
| « − » à la valeur minimale | Actif mais sans effet (mode compétition à 0, essais à 1) | Grisé |
| Deux « Express » sur l’accueil | « Express 10 minutes » (séance courte) et le raccourci « Express » (décrire son envie) | Raccourcis « 💬 Décrire mon envie » et « 🧭 Sport et durée » |
| « ▶ » d’une suggestion | Ressemblait à « lancer », ouvrait le créateur | « Préparer › » |
| Lancer une séance générée | « ▶ Lancer » tout en bas (≈ 2 000 px de défilement sur un téléphone) | « ▶ Lancer maintenant » aussi en haut |
| Nom de la séance | Invisible en haut de sa page (seulement dans le champ de modification) | Affiché en titre |
| Remplacer un exercice | « Choisir » grisé si le matériel manque, sans recours (12 cas sur la séance d’essai) | « Choisir quand même », l’avertissement reste |
| Phrase de régularité | « (6 semaines) (très régulière) » | « (6 semaines) : pratique très régulière » |

### Défaut introduit pendant l’audit, puis corrigé

- Le premier correctif du clavier (M4) gardait le code avec `typeof document !== 'undefined'` : les tests unitaires qui simulent un `document` incomplet plantaient, et **`npm test` s’arrêtait à `player.test.mjs`** (les scripts suivants n’étaient pas exécutés). Ce défaut était poussé sur la branche (commit `9b74552`), jamais déployé. Corrigé dans `a3d6cc7` ; `npm test` refait en entier : 106 scripts, sortie 0.

## 5. Étapes exactes de reproduction

Elles sont dans les tableaux de la section 4. Chaque défaut a aussi son test automatique ; ces tests ont été vus en échec sur le code d’avant la correction, au moment où ils ont été écrits. Pour les rejouer sur la 8.34.1 (commande indicative, non rejouée après coup) :

```bash
git checkout b331d11 -- public worker.js         # version 8.34.1
PW_EXEC=/opt/pw-browsers/chromium AUDIT_OUT=/tmp/audit npm run test:audit -- --project=chromium-phone390 -g "F01|P01|ST02|AX02|C05"
git checkout claude/new-session-wi9olv -- public worker.js
```

## 6. Attendu et observé

Voir la section 4 : chaque ligne donne le résultat attendu et le résultat observé avant correction.

## 7. Captures, traces et erreurs

- Rapports Playwright (HTML et JSON), traces des échecs, captures des boutons non cliquables, journaux du navigateur (erreurs JavaScript, requêtes en échec) : archive de preuves remise à part (`preuves-audit-playwright.zip`).
- Captures avant / après dans `docs/assets/audit-playwright/` : accueil d’un nouveau compte (icône « 17 juillet », 4 notifications) et suggestion « ▶ » qui ouvrait le créateur.
- Erreurs relevées par l’explorateur des boutons avant correction : 8 × `TypeError: Cannot read properties of null (reading 'style')` (m10). Après correction : ⟦ERREURS_APRES⟧.
- Échecs dus à l’outil de test, et non au site (corrigés dans l’outil, jamais dans le site) :
  - A41 : Chromium lancé en locale « C » ignorait les chemins de fichiers accentués → la configuration force UTF-8.
  - Vérificateur des pages : texte des replis fermés compté comme visible → replis exclus.
  - Explorateur : mauvais préfixe de zone, fenêtres (visite, lecteur, chrono, séance à plusieurs) pas refermées entre deux clics, fond de fenêtre compté comme bouton, cases à cocher non vues comme un effet.
  - C01 : le serveur garde volontairement le rendez-vous et son exception ; vérifié par l’affichage.
  - C04, S06, API01, P01, F02, IA04, AX01, AD : attente trop courte, recherche de texte trop large, route qui désactivait l’administrateur pendant le test, `fill` refusé par un champ numérique (ce qui a révélé M3), jeton révoqué volontairement à la reconnexion, question lue comme une commande, politique de sécurité qui bloquait l’injection d’axe, rechargement manquant.
  - Explorateur des formulaires : un formulaire réussi se vide, ses champs obligatoires paraissaient invalides → validité contrôlée avant l’envoi.

## 8. Fonctions insuffisamment couvertes

Couverture mesurée par `node tests/audit/couverture.mjs` (actions réellement déclenchées dans le navigateur pendant l’audit, d’après les traces de chaque test) :

⟦COUVERTURE⟧

Restent peu ou pas couverts par l’audit navigateur (certains le sont par les tests unitaires ou E2E existants) :
- les champs « changement » du créateur de séance (curseurs, phases, déplacements, verrous) : couverts surtout par `npm test` et `test:e2e`, peu par l’audit ;
- photos (progrès, voies, projets), imports de fichiers CSV / GPX / Strava : un choix de fichier demande une personne ;
- notifications push réelles, installation de l’application (PWA), partage natif, micro et voix ;
- séance à plusieurs sur deux vrais appareils ;
- Studio d’administration en profondeur (brouillons, publication, retour arrière) : seulement ouvert et parcouru.

## 9. Limites de l’audit

- **Navigateurs** : seul Chromium est installé. Firefox et WebKit (Safari, iPhone) n’ont **pas** été exécutés : `browserType.launch: Executable doesn't exist at /opt/pw-browsers/firefox-1543/firefox/firefox` et `…/webkit-2359/pw_run.sh` ; leur installation est interdite ici. Les profils sont déclarés dans la configuration pour être relancés ailleurs (`--project=firefox-desktop`, `--project=webkit-iphone`).
- **Appareils** : écrans simulés (320, 360, 390 px, Pixel 7, tablette 768 px, ordinateur 1440 px), pas de vrais téléphones.
- **Serveur** : Worker local et base SQLite, pas Cloudflare ni la vraie D1 ; aucun test sur le site en ligne.
- **IA** : Workers AI et Gemini simulés (réponses fabriquées par le test) ; la qualité réelle des réponses n’est pas évaluée.
- **Accessibilité** : axe-core et contrôles automatiques ; aucun vrai lecteur d’écran (VoiceOver, TalkBack), aucun jugement humain sur la clarté.
- **Explorateurs** : un clic par bouton et un niveau de fenêtre ; les confirmations sont toujours refusées pour ne rien détruire, donc les suppressions confirmées sont vérifiées par les scénarios dédiés, pas par l’explorateur. Un bouton « sans effet visible » peut avoir un effet que la signature ne voit pas (son, vibration…).
- **Performance** : mesurée sur la machine de test (F05), pas sur un téléphone lent ni sur un vrai réseau.

## 10. Conclusion : prêt pour la production ?

⟦CONCLUSION⟧
