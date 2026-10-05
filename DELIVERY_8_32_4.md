# Mise à jour 8.32.4 — Appuis pendant le chargement du Studio

Ce correctif complète les [réglages IA et corrections de synchronisation de la 8.32.3](DELIVERY_8_32_3.md) et la [livraison complète de la 8.32.2](DELIVERY_8_32_2.md).

Lorsqu’une liste finit de charger pendant un appui sur les outils du Studio, sa nouvelle hauteur peut changer le défilement et déplacer le bouton avant le relâchement. Le rafraîchissement de la liste doit attendre la fin de l’interaction. Les données reçues restent disponibles ; les réponses d’un ancien compte ou écran ne doivent pas reconstruire la page active.

La suite complète locale de la 8.32.3 a réussi : 81 suites / 824 cas de logique et 10 suites / 150 étapes navigateur. Sa CI a toutefois reproduit le clic perdu dans le Journal du Studio ; ce résultat distant a déclenché le présent correctif. La publication de cette version est contrôlée sur son propre commit, sans supposer la réussite de la CI précédente.

Vérifications locales de la 8.32.4 : `npm run check`, `npm test` (81 suites / 824 cas) et compilation Wrangler sans publication réussis. Le parcours complet du Studio passe avec de vrais clics à 390 et 320 pixels de largeur, y compris avec une hauteur de 400 pixels, sans erreur JavaScript. Au défilement maximal, l’ancien code reproduit un déplacement de 86 pixels du bouton Audit ; il échoue également à la nouvelle régression. Le correctif conserve la position du bouton pendant l’appui, reçoit les données, puis ouvre réellement le Journal au relâchement. Les 5 étapes d’activation de mise à jour et les boutons Passer des 65 étapes de visite ont aussi été vérifiés.

Les réglages IA, les sources et règles d’honnêteté sont conservés. Gemini nécessite le secret serveur `GEMINI_API_KEY` dans Cloudflare, puis un test réel dans Administration › Assistant du site. Les tests locaux simulent les services distants et ne garantissent pas l’absence de défaut sur tous les appareils.
