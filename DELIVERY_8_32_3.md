# Mise à jour 8.32.3 — Réglages IA et actions pendant la synchronisation

Ce correctif complète la [livraison 8.32.2](DELIVERY_8_32_2.md), qui décrit le calendrier, le coach, les sources, la personnalisation, les notifications et leurs limites.

Un administrateur ayant seulement le rôle Intelligence doit pouvoir ouvrir **Paramètres › Administration › Assistant du site**, enregistrer le ton, la longueur, la réflexion Gemini et la créativité, puis tester une réponse. Les opérations de contenu restent réservées au rôle Contenu et les propositions de code au rôle Technique. Les contrôles du serveur sont conservés.

Après publication ou retour arrière d’un lot dans le Studio, une réponse globale tardive actualise les contenus sans reconstruire l’écran. Un appui en cours sur le raccourci Journal garde ainsi son bouton et sa destination. La publication, le retour arrière et leurs entrées dans le Journal restent vérifiés avec le vrai Worker local.

Les lectures du contenu commun sont aussi ordonnées : une ancienne réponse de publication ne réintroduit plus le contenu après réception de son annulation. La comparaison porte sur l’ordre des demandes, car la version calculée peut diminuer lorsqu’un élément est supprimé. La régression vérifie le cache, les couches appliquées et la FAQ ; elle échoue si le garde est retiré.

Dans le créateur de séance, « Plus de contrôle » conserve le choix d’ouverture ou de fermeture pendant la synchronisation. Les modes d’aide et niveaux de structure restent accessibles par un clic normal, et un panneau fermé manuellement reste fermé même avec un niveau précis.

Les demandes ambiguës nécessitent une précision, les références sont vérifiées et les changements attendent une confirmation, quel que soit le style choisi. Le réglage est commun au site. Gemini nécessite toujours le secret serveur `GEMINI_API_KEY` dans Cloudflare et un test réel après configuration ; aucune clé disponible dans l’environnement ne permet ici d’attester cette connexion.

Contrôles locaux du correctif : 81 suites et 824 cas de logique réussis ; 13 étapes assistant/coach, dont accès, sauvegarde, test et rechargement du rôle Intelligence seul, avec refus 403 des opérations de contenu ; parcours Studio complet à 320 et 390 pixels sous réponses retenues puis libérées pendant l’appui ; 5 étapes d’activation des mises à jour avec les 65 étapes de visite et leur bouton Passer.

La chaîne navigateur complète réussit sur ces derniers correctifs : **10 suites, 150 étapes**, ainsi que les **65 étapes de visite** avec leur bouton Passer. La syntaxe et les **81 suites / 824 cas de logique** passent également. Le parcours structuré complet du créateur a aussi été exécuté à 320 et 390 pixels avec la synchronisation réelle.

Les résultats de publication de ce correctif sont contrôlés sur son propre commit. Les services Google, PubMed, GitHub et push sont simulés localement ; la qualité des réponses réelles et l’absence de défaut sur tous les appareils ne sont pas attestées par ces tests.
