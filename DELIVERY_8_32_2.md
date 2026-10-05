# Mise à jour 8.32.2 — Calendrier, coach, administration et notifications

Cette livraison complète les versions 8.32 et 8.32.1 dans le dépôt existant. Le cahier `CODEX_PROMPT_MES_SEANCES_COMPLET.txt`, ses 41 sections et les demandes complémentaires ont été relus. Les comptes, le même moteur sportif en modes simple et avancé, le lecteur, la synchronisation et le fonctionnement hors ligne sont conservés.

## Parcours corrigés

| Demande | Résultat |
|---|---|
| Interface simple, réglages faciles à trouver, présentation sobre | Paramètres directement accessibles, choix Simple / Avancée unique, détails repliés, navigation cohérente et visites facultatives à chaque étape, livrés en 8.32.1 |
| Organiser sur toutes les pages | L’éditeur s’ouvre aussi depuis les sous-pages et les Paramètres. Aperçu, continuer, enregistrer et quitter ramènent au bon écran, y compris au détail d’une séance. Le texte précise que les rubriques de l’accueil de l’onglet et ses raccourcis sont personnalisés |
| Mardi et vendredi voie à Nicole Abar, bilan rapide et bloc avant | Activités libres récurrentes ouvrables, sans fausse « séance supprimée ». Un récit corrigé remplace les seules activités rapides de cette occurrence ; un bloc retiré ne reste plus dans la charge calculée. Retrait et annulation sont explicites, les séances structurées sont protégées |
| Rappel propre au rendez-vous | Choix sans rappel / 10 / 30 / 60 minutes avec une heure. Modification d’occurrence ou de série, désactivation individuelle, fuseau conservé, annulation et déplacement pris en compte |
| Ne pas inventer un niveau | Sans maximum connu ni plage choisie, grimpe au ressenti avec explication de la donnée manquante. Un objectif de cotation exige un choix explicite ; les maxima et plages renseignés restent utilisés |
| Administration claire | Modifier le site, Gérer les membres, Suivre le site ; outils avancés repliés. Actions conservées sans doublon et adaptées aux rôles réels dès la connexion, après rechargement et après transfert d’adresse. Les listes et compteurs se rafraîchissent sans remplacer les menus ni perdre leur ouverture ou le clic en cours |
| Signalements | Ouvert, en cours, traité ou ignoré / doublon ; filtres, état visible par l’auteur et trace du changement dans le journal |
| Icône | Dernière image demandée `1000031372.jpg`, conservée telle quelle, déclinée en 192, 512 et maskable. Original archivé dans `docs/assets/app-icon-source.jpg`, badge monochrome conservé |
| Navigation dans les fenêtres | Bouton Fermer visible lorsque la fenêtre n’en possède pas déjà un ; Échap et fermeture par l’arrière-plan conservés |
| Plusieurs comptes sur un appareil | Données privées en mémoire et fenêtres réinitialisées au changement ; caches, intentions hors ligne, conflits et échecs conservent leur propriétaire. Lectures du cache et synchronisations tardives de l’ancienne connexion ignorées |
| Objectifs, retour et séance interrompue | Brouillon du créateur, objectifs et raccourci Retour stockés par compte ; dernière séance ouverte et instantané de reprise contrôlés par propriétaire. Anciennes clés sans propriétaire conservées sans attribution automatique |

Le stockage différé fige les données et leur propriétaire au moment de la demande d’écriture. Un changement de connexion ne réaffecte donc pas le cache ou les opérations en attente de l’ancien compte au nouveau. Les intentions hors ligne sont rejouées dans les données de leur compte avant affichage ; un ancien 401 ne déconnecte pas la nouvelle session.

Les instantanés de séance sont enregistrés sous une clé propre au compte, avec propriétaire explicite. Seul ce compte peut reprendre un instantané valide datant de moins de douze heures. La date du rendez-vous est conservée, même si la séance est reprise le lendemain. Le brouillon du créateur et le retour de navigation du compte d’origine restent disponibles lorsqu’il se reconnecte sur le même appareil. Les anciennes clés génériques restent intactes mais ne sont jamais utilisées comme données d’un compte choisi arbitrairement. Le transfert des données d’invité lors de la création explicite d’un compte reste conservé.

## IA

- Gemini Flash ajouté via l’API REST Google, avec `gemini-3.8-flash` par défaut et le secret `GEMINI_API_KEY` conservé uniquement côté Worker. Avec cette clé et aucun choix enregistré, Gemini est le fournisseur initial ; sans clé ni choix, Workers AI est utilisé. L’administrateur peut choisir manuellement Gemini ou Workers AI. Aucun changement automatique de fournisseur après erreur ou quota atteint.
- Workers AI conserve Qwen 3 30B et Llama 3.3 70B. Les réponses Gemini, Qwen, Chat Completions et Responses sont normalisées ; le raisonnement interne n’est pas affiché. Une réponse Gemini interrompue par `MAX_TOKENS` est refusée avec une erreur 502 : aucune proposition tronquée n’est appliquée.
- Réglages de réponse : ton direct / pédagogique, longueur courte / standard / détaillée, réflexion de Gemini rapide / approfondie et créativité de 0 à 0,3. Valeurs initiales `direct`, `standard`, `low`, `0.1`. Les règles de clarification, de sources vérifiées (`verified_only`) et de confirmation restent obligatoires ; leur désactivation est refusée par le serveur. Ces réglages s’ajoutent aux limites du site sans les supprimer.
- Coach : plan actuel de l’app, demande et résumé visible du profil seulement lorsqu’il est partagé. Le plan fourni décrit les groupes d’administration, les réglages IA, les rendez-vous récurrents et les limites réelles des notifications. Pour Gemini, le profil est décoché initialement, avec préférence par compte et fournisseur. Les sources distinguent fonctionnement de l’app, déclarations personnelles, demande et documents scientifiques. Conversation, sources affichées et boutons proposés sont conservés par compte.
- Les réponses du coach déclarent `ok`, `clarify` ou `unverified`, leur fondement et les identifiants exacts des sources utilisées. Le serveur renvoie uniquement ses propres références et construit leurs liens : aucune URL inventée par le modèle n’est acceptée comme document consulté. `clarify` et `unverified` ne proposent aucune action. Les actions acceptées utilisent les routes existantes ou le parseur du moteur, attendent un clic et ne publient ni n’enregistrent une séance automatiquement.
- Assistant admin : état explicite et sources valides exigés avant toute préparation. Un nouvel élément cite la demande et le plan de l’app ; modifier, masquer ou supprimer un élément existant exige la citation exacte de sa fiche fournie au modèle. Sinon, aucun changement ni suite de proposition de code n’est préparé. « Raccourcis-la » conserve le même identifiant et les autres champs lorsqu’il est identifié. Le brouillon d’un autre administrateur reste inaccessible ; les conversations et réponses tardives sont isolées entre comptes sur un même appareil.
- Configuration et test réel d’une réponse dans Assistant du site › Modèle et réserve gratuite, réservés au rôle Intelligence pour les modifications et le test. Une saisie reste conservée pendant l’actualisation de l’état.
- Les fonctions Gemini partagent une protection propre au site : 40 demandes par jour par défaut, réglable de 1 à 500, et 3 demandes par minute. Ces limites ne sont pas les quotas Google. Pour Workers AI, Cloudflare inclut 10 000 neurones par jour pour tout le compte ; réserve estimée du site 8 000 par défaut, plafond 9 000. Réservations atomiques conservées après panne, délais bornés et explications de quota sans détails internes ; les formulaires et le moteur local restent disponibles.
- Modèles et identifiants validés sur des listes explicites ; propositions de contenu et de code toujours relues et validées. Les changements de code suivent le circuit de proposition et de Pull Request décrit dans le README.

Les questions scientifiques couvertes sélectionnent jusqu’à deux identifiants du sous-ensemble PubMed du catalogue. À chaque demande, Eutils est effectivement appelé pour lire le résumé et vérifier PMID, titre et présence du résumé : quatre secondes maximum par article, 300 000 octets maximum par réponse, extrait limité à 3 000 caractères. Aucun cache d’extraits ni lien fourni par l’utilisateur n’est utilisé. Les consultations réussies sont datées ; les erreurs, documents inadéquats ou résumés absents ne créent aucune preuve, et le texte du catalogue ne remplace pas un article lu.

La consultation d’un résumé atteste son origine, sans garantir l’exactitude de l’interprétation ni le consensus scientifique actuel. Le sous-ensemble éligible ne couvre pas toutes les questions sportives : une demande sans référence pertinente nécessite une précision ou une explication de la vérification impossible. Faits vérifiables, déclarations personnelles, estimations et propositions doivent rester distincts. Aucune recherche Google générale n’est activée ; sa gratuité n’est pas supposée.

Gemini propose une offre gratuite pour les projets Google sans facturation, sous réserve des modèles et quotas applicables au projet. L’app n’active pas la facturation, ne sélectionne pas automatiquement une offre payante et ne peut pas attester l’état de facturation à partir d’une clé seule. ChatGPT gratuit dans son application ne constitue pas une API gratuite pour un site.

Les exemples officiels Google consultés le 5 octobre 2026 utilisent `gemini-3.8-flash`. Les pages détaillées de tarifs, modèles et quotas ainsi que les appels réels sont bloqués par le proxy : aucun plafond gratuit exact ni niveau de qualité réel n’a été vérifié. Les formats et tarifs Workers AI ont été relus dans les sources publiques Cloudflare le 4 octobre. Sa réserve est une estimation prudente ; les autres applications du même compte peuvent consommer l’allocation Cloudflare. Les fournisseurs et les lectures PubMed des tests locaux sont simulés : les contrôles du site ont été vérifiés, pas la qualité scientifique des réponses réelles.

### Activer Gemini

1. Dans [Google AI Studio](https://aistudio.google.com/), créer une clé API dans un projet **sans facturation activée** ; restreindre la clé à l’API Generative Language lorsque c’est possible.
2. Dans Cloudflare **Workers & Pages › seances-entrainement › Settings › Variables and Secrets**, ajouter `GEMINI_API_KEY` comme **secret**. La clé ne doit pas être envoyée dans une conversation ni enregistrée dans les sources. `npx wrangler secret put GEMINI_API_KEY` est l’alternative en ligne de commande.
3. Dans **Administration › Assistant du site**, choisir Gemini si un fournisseur est déjà enregistré, sauvegarder puis tester une réponse.

Ce secret n’est pas disponible dans l’environnement actuel ; Gemini n’a pas encore été activé sur le site. Un test réussi après configuration attestera uniquement la connexion et la réponse à cet instant.

## Notifications

- Déclenchement du Worker après succès du déploiement sur `main`, avec vérification de la version réellement disponible. Première visite et cron chaque minute assurent aussi la reprise. Une version attendue incorrecte ne déclenche aucun envoi.
- File durable par appareil, verrous atomiques, reprise des seuls échecs et lecture distincte des messages concurrents. Une notification reçue avant la réponse HTTP est aussi reconnue, pour éviter sa répétition.
- Le site visible vérifie versions et annonces toutes les 30 secondes. Bannière, pastille et boîte des notifications sont actualisées sans redessiner les champs en cours de saisie.
- Administration › Notifications de mise à jour : titre, message, version et audience sont relus avant **Envoyer à tous**. L’annonce apparaît dans le site pour tous. Le push vise tous les appareils déjà autorisés, même si le type Mises à jour était décoché, sans modifier les préférences.
- L’annonce finale reste une action de l’administrateur lorsqu’il est satisfait. Aucun envoi manuel à de vrais utilisateurs n’a été réalisé pendant les tests.

Les permissions refusées dans le navigateur ne peuvent pas être contournées. Le système du téléphone peut retarder un push. Un grand nombre d’appareils ou une panne peut exiger plusieurs reprises ; l’administration affiche les envois réussis et en attente.

## Vérifications

Contrôles locaux avec Node 24, Playwright 1.63 et Chromium 151, les 4 et 5 octobre 2026. La dernière chaîne complète réussit après les corrections d’isolation, de menus et d’activation des mises à jour :

| Contrôle | Résultat |
|---|---|
| `npm test` | 81 suites, 824 cas réussis avec Gemini, les préférences, l’honnêteté, les sources, les notifications et la reprise par compte |
| `npm run test:e2e` | 10 suites, 149 étapes réussies dans la chaîne complète ; les 64 étapes du rattrapage des visites sont également parcourues |
| Balayage des pages | 608 affichages validés avant les corrections finales d’isolation : invité / membre / admin, simple / avancé, 320 / 390 px ; aucune erreur JS, aucun écran cassé, aucun débordement relevé |
| Assistant et coach, navigateur | 12 parcours réussis : modèles, quotas, préférences, sources, suivi des brouillons, rechargement, comptes isolés et rôles ; 4 contrôles visuels supplémentaires à 320 / 390 px |
| Objectif et profil, navigateur | 3 parcours réussis : profil absent par défaut, partage explicite, changement de compte pendant un appel |
| `npm run check` | Syntaxe des modules, scripts et JSON validée |
| Wrangler `deploy --keep-vars --dry-run` | Worker compilé ; bindings D1, KV, AI, Assets et métadonnées de version conservés |

Les parcours navigateur sont intégrés à `npm run test:e2e`, avec journal et captures archivés par la CI même en échec. Ils couvrent les 100 parcours existants, l’administration, les bilans et rappels, les cotations inconnues, Organiser sur 61 routes dans les deux modes, les annonces pendant une saisie et les conversations isolées. Le parcours `tests/account-local-isolation-e2e.mjs` contrôle aussi les données privées et opérations hors ligne lors de changements de compte, les réponses tardives, les objectifs, les retours, les instantanés et le transfert depuis le mode invité. Les clics pendant les réponses réseau sont reproduits dans le coach et les menus d’administration. `tests/update-activation-e2e.mjs` suspend l’installation : la présence d’un nouveau cache n’est pas confondue avec l’activation du contrôleur, la demande survit au rechargement, puis le bandeau disparaît après la mise à jour. Chaque étape de visite conserve un bouton Passer.

Les annotations de CI rendent l’erreur précise visible lorsqu’un parcours échoue. Les résultats distants de cette livraison sont à contrôler sur son propre commit.

## Publication et limites

Branche de publication : `main`, dépôt `martinznt/Escalade`. Site : https://seances-sport.pages.dev. Les intégrations Cloudflare Pages et Workers existantes déploient cette branche.

La migration 11 ajoute la file de notifications, sans retirer les données existantes. L’icône d’une app déjà installée peut rester en cache dans le navigateur ou le système.

Les tests exécutent le vrai Worker avec SQLite simulant D1 ; Gemini, Workers AI, GitHub et les services push sont simulés. Le proxy de l’environnement bloque les adresses Cloudflare et les appels Google réels, donc la réussite des déploiements doit être attestée séparément par leurs contrôles GitHub et Gemini doit être testé après ajout de son secret. Ces vérifications ne garantissent pas l’absence absolue de défaut sur tous les appareils ou toutes les données.
