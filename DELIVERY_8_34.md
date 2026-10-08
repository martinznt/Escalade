# Version 8.34.0 — préparée sur la branche, non déployée

Préparée le 8 octobre 2026 sur la branche `claude/new-session-wi9olv`, à partir de `main` en 8.33.0 (`0d7a852`). Rien n’a été envoyé en production : pas de déploiement Cloudflare, pas de fusion dans `main`, pas d’annonce « Envoyer à tous ». Le ZIP « site sport final » est remis pour relecture.

## Ce qui change pour les membres

### Mise à jour fiable, pages stables
- Après « Mettre à jour », la nouvelle version s’active à coup sûr. C’était la cause de l’échec de la CI de `main` en 8.33.0 ; corrigé sur la branche seulement.
- Plus de saut en haut de page ni de rubrique qui se referme seule après un choix. Les liens « Paramètres › … » mènent à la bonne page.
- Fichiers : `public/sw.js`, `public/app.js`, `public/ui.js`, `public/pathlinks.js`.

### Affichage, sports, disponibilités
- Icônes de l’app et des notifications au même endroit (Paramètres › Affichage), avec un lien coloré depuis Notifications.
- Mes sports : « Je ne le fais jamais » retire un sport des propositions et peut masquer ses exercices et ses séances prêtes. Un toucher le remet.
- Mes disponibilités : un lieu par créneau, repris par la semaine automatique et par le créateur de séance.

### Chrono
- Six formats : chaque minute (EMOM, sur autant de minutes que voulu, un exercice par intervalle qui tourne), le plus de tours (AMRAP, avec compteur), pour le temps (limite facultative), intervalles et Tabata, compte à rebours, chronomètre avec tours. Le résultat va dans l’historique.
- **Mes chronos** : un chrono réglé se garde (case « ⭐ Le garder dans Mes chronos ») et se relance en un toucher ; ✕ le retire. Synchronisé sur le compte.
- Fichiers : `public/timer.js`, collection `chrono` dans `public/items.js`.

### Séance « à ma façon »
- Page blanche visible partout (« ✍️ À ma façon »). Les exercices s’écrivent un par ligne (« 4 × 8 tractions repos 2 min ») : les nombres sont compris tout seuls, les explications du catalogue sont reprises quand l’exercice est reconnu.
- Parties libres, note par exercice, réglages facultatifs repliés. Rien n’est imposé.

### Exercices expliqués, et plus d’exercices
- Les 315 exercices disent la position de départ. Ceux qui ont une charge disent où la mettre et comment la tenir. Les principaux ont une version plus facile et une plus dure. Ces explications sont modifiables par un administrateur.
- 40 exercices de plus : débuter, reprendre, mobilité, natation de base, course pour débuter, pince.
- Fichiers : `public/library-howto.js`, `public/library-more.js`, `public/library.js`, `public/player.js`.

### Installation sur tous les appareils
- « 📲 Installer » reconnaît l’appareil et le navigateur et montre les gestes exacts : iPhone et iPad (Safari), Chrome sur iPhone, Instagram ou Facebook (ouvrir d’abord dans Safari ou Chrome, lien à copier), Android (Chrome, Samsung Internet, Firefox), ordinateur (Chrome, Edge, Mac Safari). Firefox sur ordinateur reçoit une réponse honnête : il ne sait pas installer.
- Depuis un ordinateur, un QR code pour installer sur le téléphone.
- Fichiers : `public/install.js`, `public/views-setup.js`, `public/views-settings.js`.

### Annonce aux membres
- L’administrateur choisit quand l’envoyer. La notification ne part que vers les appareils qui l’ont autorisée ; le bandeau dans le site est facultatif.
- Fichiers : `server/push.js`, `worker.js`, `public/views-settings.js`.

### Tes propres choix (« ＋ Autre… »)
Au bout des listes de choix, un champ « ＋ Autre… » permet d’écrire le sien :
- zones à ménager (créateur de séance, « Adapter », « J’ai mal » pendant la séance, profil, questionnaire) ;
- matériel d’un lieu (y compris chaque espace d’une salle d’escalade) ;
- envie de séance et durée (« Je n’ai rien prévu »), durée restante pendant la séance, durée dans « Adapter » ;
- zones musclées et souhaits de silhouette (profil) ;
- raisons de chute (projets d’escalade) ;
- questions du profil : un autre sport, un autre lieu, une autre durée, un autre nombre de séances, un objectif écrit avec ses mots.

Règles appliquées, sans rien inventer :
- un choix que l’app connaît déjà est coché à la place (« poignet droit » = Poignets, « corde à sauter », « course à pied ») ;
- sinon il est ajouté pour ce compte seulement, sur tous ses appareils, et nommé partout comme les choix de l’app ;
- l’app dit ce qu’elle en fait vraiment. Une zone ajoutée, cochée « en ce moment » ou choisie pour une séance, est rappelée sur chaque exercice (l’app ne sait pas quels exercices la chargent). Un matériel ajouté sert aux lieux et à « Mes moments ». Une envie, une raison de chute ou un objectif écrit utilisent les mots reconnus (gainage, tractions, doigts, pieds…). Un souhait de silhouette compte si des muscles y sont reconnus ;
- Profil › Mes ajouts : chaque liste, ce que l’app en fait, ajouter, retirer. Retirer un matériel le décoche aussi des lieux.

Fichiers : `public/choices.js` (règles, pur et testé), `public/views-choices.js`, collection `choice` dans `public/items.js`.

### Zones à ménager : les 7 comptent vraiment
Doigts, épaules, coudes, poignets, dos, genoux, chevilles : les 7 s’enregistrent dans le profil (avant : 4) et écartent les exercices qui les chargent, dans les deux générateurs.

### Durées et petites corrections
- Durées jusqu’à 5 h partout (durée habituelle, séance sur mesure, séances prêtes).
- Calendrier : un point vert par séance réalisée, comme dans la légende. Objectif sans chiffre : plus de « 0 / — ». Progression sur 7 jours : « stable » au lieu de « 0 % ».
- 23 actions qui n’étaient plus reliées à aucun bouton ont été retirées.

## Sécurité et données

- Deux nouvelles collections personnelles, `choice` et `chrono`, nettoyées côté serveur par le schéma partagé (`public/items.js`) : listes et formats connus seulement, libellés bornés (40 caractères pour un ajout), nombres bornés, clés inconnues retirées. Elles restent dans le compte, comme les autres données personnelles. Aucun administrateur ne les voit.
- Aucune migration de base : les données personnelles sont déjà stockées élément par élément. Le réglage `avoid` accepte 3 zones de plus ; c’est un ajout, rien n’est retiré.
- Les libellés écrits par les membres sont toujours affichés par les gabarits qui échappent le texte (`h`) ou par `textContent`.
- Aucun `eval`, `new Function` ni commande système. Aucun secret dans `public/`.

## Vérifications faites

- `npm run check` : syntaxe de tous les fichiers JavaScript et JSON, sans erreur.
- `npm test` : 102 scripts unitaires, 986 contrôles, tous passés. Nouveaux : `tests/choices.test.mjs` (ajouts personnels, nettoyage serveur, zones), « Mes chronos » dans `tests/session-tools.test.mjs`.
- `npm run test:e2e` : 22 scripts navigateur (Chromium), 247 étapes, toutes passées. Nouveaux : `tests/choices-e2e.mjs` (7 étapes : Mes ajouts, lieu, « Je n’ai rien prévu », séance en cours, questionnaire, retrait) et une étape « Mes chronos ».
- Tour de mise en page : 600 rendus (43 pages membre, 57 pages admin, interface simple et avancée, 320 / 390 / 768 px) : aucun débordement, aucun texte cassé, aucune erreur JavaScript.
- `wrangler deploy --dry-run` : le Worker se compile avec ses liaisons (D1, KV, AI, Assets). Rien n’a été envoyé.

## Limites, dites honnêtement

- Pas de test sur de vrais téléphones : seulement Chromium en émulation (iPhone, Android, ordinateur). Les gestes d’installation suivent les menus actuels des navigateurs ; ils peuvent changer avec une mise à jour d’iOS ou d’Android.
- Notifications : seulement vers les appareils qui les ont autorisées. Sur iPhone, seulement depuis l’application installée (iOS 16.4 ou plus récent).
- Une zone ajoutée par un membre ne filtre aucun exercice : l’app ne sait pas lesquels la chargent. Elle la rappelle sur chaque exercice. Un matériel ajouté ne débloque aucun exercice du catalogue (ils ne le connaissent pas) ; il sert aux lieux et à « Mes moments ».
- Les mots reconnus (envies, raisons de chute, objectifs écrits, souhaits de silhouette) utilisent une liste de mots-clés locale, pas l’IA. Un texte sans mot reconnu reste une intention écrite.
- Gemini et Strava demandent une configuration dans Cloudflare (voir plus bas).

## À faire de ton côté, quand tu seras satisfait

1. Relire le ZIP. Attention : fusionner la branche dans `main` **publie le site** (le déploiement automatique existant suit `main`, voir [CLOUDFLARE_GUIDE.md](CLOUDFLARE_GUIDE.md)). Ne fusionne donc qu’une fois satisfait.
2. Gemini (facultatif) : Cloudflare → Workers & Pages → `seances-entrainement` → Settings → Variables and Secrets → ajouter le secret `GEMINI_API_KEY`. Puis, dans l’app : Paramètres › Administration › Assistant du site → choisir Gemini → Enregistrer → Tester.
3. Strava (facultatif) : variables `STRAVA_CLIENT_ID` et `STRAVA_REDIRECT_URI`, secrets `STRAVA_CLIENT_SECRET` et `STRAVA_TOKEN_KEY` (détails dans [CLOUDFLARE_GUIDE.md](CLOUDFLARE_GUIDE.md)).
4. L’annonce « Envoyer à tous » : à envoyer toi-même, quand tu le décides (Paramètres › Administration).
