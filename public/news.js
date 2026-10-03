// news.js — visite des nouveautés : après une mise à jour, une courte visite (même principe que la visite guidée)
// montre seulement ce qui a changé et qu'il faut savoir. Chaque version ajoute ses étapes ici.
// Étape : [onglet, sous-page, sélecteur de l'élément (ou '' pour une bulle au centre), titre, texte].
import { APP_VERSION, ls } from './state.js';
import { catchUpSteps, missedVersions } from './catchup.js';

export const NEWS = [
  // Les premières versions (avant la visite des nouveautés) : leur visite montre ce qu'elles ont apporté, qui existe toujours.
  { v: '8.0.0', date: '2026-09-20', title: 'La première version', why: 'Tes séances, un générateur qui explique ses choix, le suivi de tes progrès, et tout qui marche même sans internet.', steps: [
    ['home', 'dash', '.quick .qa.pri', '🎯 Une séance pour toi', 'Le générateur prépare une séance selon ton niveau, ton temps et ton matériel, et explique pourquoi.'],
    ['library', 'home', '[data-act=newChoose]', '📚 Tes séances', 'Crée, modifie et range tes séances. Elles sont enregistrées sur ton compte.'],
    ['progress', 'summary', 'h1', '📈 Tes progrès', 'Historique, records et régularité, calculés seulement à partir de ce que tu fais.'],
  ] },
  { v: '8.1.0', date: '2026-09-22', title: 'Prise en main pour tous', why: 'Un questionnaire pour que l’app s’adapte à toi, un mode invité sans compte, et l’installation comme une vraie application.', steps: [
    ['settings', 'main', '[data-act=setupAgain]', '🧩 Ton profil sportif', 'Réponds à quelques questions (ou « plus tard ») : sports, niveau, temps, matériel.'],
    ['settings', 'main', '[data-act=installNow]', '📲 Installer l’app', 'Elle s’ouvre en plein écran, depuis l’écran d’accueil de ton téléphone.'],
  ] },
  { v: '8.2.0', date: '2026-09-24', title: 'Plus joli, et un assistant', why: 'Un nouveau look plus léger, et un assistant qui crée la fiche d’un exercice à partir de son nom.', steps: [
    ['library', 'exercises', '[data-act=aiOpen]', '🤖 L’assistant', 'Écris le nom d’un exercice : il prépare la fiche (consignes, muscles, ce qu’il travaille). Tu vérifies avant d’enregistrer.'],
    ['settings', 'display', '.vibes', '🎨 Ton style', 'Choisis ton thème et tes couleurs.'],
  ] },
  { v: '8.3.0', date: '2026-09-27', title: 'Visite guidée immersive', why: 'Comprendre l’app en 30 secondes : elle va seule sur chaque page et montre les boutons.', steps: [
    ['settings', 'help', '[data-act=helpTour]', '🧭 Visite guidée', 'La visite va maintenant elle-même sur chaque page et te montre les boutons avec une flèche.'],
  ] },
  { v: '8.4.0', date: '2026-09-27', title: 'Nouvelle adresse, consignes à chaque série', why: 'Les consignes restent sous les yeux pendant toute la séance, et le site a une adresse courte.', steps: [
    ['', '', '', '📋 Consignes à chaque série', 'Pendant une séance, les consignes de l’exercice restent affichées à chaque série, et même pendant le repos pour préparer la suivante.'],
    ['', '', '', '🏡 Nouvelle adresse', `Le site est maintenant sur ${location.host.endsWith('.pages.dev') ? location.host : 'seances-sport.pages.dev'}. L’ancienne adresse t’y amène toute seule, avec ton compte et tes réglages.`],
    ['settings', 'help', '[data-act=newsTour]', '🆕 Revoir les nouveautés', 'Après chaque mise à jour, une petite visite comme celle-ci te montre ce qui change. Tu peux la revoir ici.'],
  ] },
  { v: '8.5.0', date: '2026-09-27', title: 'Minuteur, carnet d’escalade, programme, rappels', why: 'S’entraîner avec un coach vocal, suivre ses blocs et ses projets, tenir un programme sur plusieurs semaines.', steps: [
    ['home', 'dash', '[data-act=timerOpen]', '⏱ Minuteur', 'Suspensions 7/3, Tabata, EMOM… en plein écran, avec bips et voix.'],
    ['home', 'dash', '[data-act=goCarnet]', '🧗 Ton carnet', 'Note un bloc en 3 touchers, regarde ta pyramide, suis tes projets avec photo.'],
    ['progress', 'summary', '.streak', '🔥 Ta série', 'Les semaines d’affilée où tu tiens ton rythme. La semaine en cours ne casse jamais ta série.'],
    ['home', 'cal', '[data-act=progNew], .prog', '📆 Programme', 'Un objectif sur plusieurs semaines : 4 questions et ton calendrier se remplit.'],
    ['settings', 'notifs', '[data-change=remOn], .card h3', '🔔 Rappels', 'Choisis tes jours et ton heure : le téléphone te rappelle ta séance.'],
    ['', '', '', '🗣️ Coach vocal', 'Pendant la séance, active « Coach » : il annonce les séries, le repos et le décompte.'],
  ] },
  { v: '8.6.0', date: '2026-09-28', title: 'Ambiances, mise en page, séance sur mesure, salles, notifications', why: 'Une app à ton image (ambiances, place des éléments), des séances qui ciblent exactement ce que tu veux, ta salle et sa cotation, et toutes les nouveautés ici.', steps: [
    ['settings', 'display', '.vibes', '🎨 Ambiances', 'Chaleureux, salle de muscu, grand air, minimal, néon… L’app change complètement d’allure.'],
    ['home', 'dash', '.topicons', '✏️ À ta façon', 'Les petites icônes en haut ouvrent les fonctions. Le crayon te laisse tout déplacer, agrandir ou colorer.'],
    ['library', 'generate', '.gsecs', '🎯 Séance sur mesure', 'Choisis tes objectifs, intentions, forces, faiblesses, muscles et zones à ménager. Tu peux même écrire les tiens.'],
    ['profile', 'body', '.bodyf', '🫀 Mon corps', 'Âge, poids, forme, souffle… Les séances s’adaptent (intensité, repos, pas de sauts si besoin).'],
    ['profile', 'equipment', '[data-act=envNewGym]', '🧗 Ta salle', 'Décris ta salle : sa cotation (U1 → U8+…), ses espaces et son matériel.'],
    ['home', 'dash', '[data-act=notifOpen]', '🔔 Notifications', 'Toutes les mises à jour et leur utilité sont ici. Choisis tes notifications dans Paramètres.'],
  ] },
  { v: '8.7.0', date: '2026-09-28', title: 'Entre amis, accueil vivant, mode ordinateur, anglais', why: 'Envoie une séance par QR code, entraîne-toi à deux avec les mêmes chronos, et profite d’un accueil qui suit l’heure et la saison.', steps: [
    ['library', 'seances', '[data-act=duoJoinAsk]', '👥 À deux', 'Pendant une séance, touche « À deux » : ton partenaire scanne le code et vos chronos avancent ensemble. Ici, tu rejoins la séance d’un ami.'],
    ['', '', '', '🔗 Partage par QR code', 'Sur une séance, « Partager » puis « Lien et QR code » : ton ami scanne et garde sa propre copie.'],
    ['home', 'dash', '.hero', '🌄 Accueil vivant', 'Le ciel suit l’heure de la journée. Dans Paramètres, tu peux ajouter un décor de saison.'],
    ['settings', 'display', 'select[name=lang]', '🌍 English', 'L’app existe aussi en anglais (bêta). Sur ordinateur, le menu passe à gauche.'],
  ] },
  { v: '8.8.0', date: '2026-09-29', title: 'Ton format de séance, jusqu’à 4 h', why: 'Choisis les parties de ta séance (échauffement, technique, renfo, étirements…), leur ordre et le temps de chacune, et garde tes formats.', steps: [
    ['library', 'generate', '[data-act=gDurOther]', '⏱ Durée libre', 'Des séances de 5 min à 4 h : touche « Autre durée » et écris le nombre de minutes.'],
    ['library', 'generate', '[data-act=gFmt][data-v=custom]', '🧩 Ton format', 'Compose ta séance partie par partie, règle le temps de chacune, change l’ordre, puis garde ce format pour la prochaine fois.'],
    ['', '', '', '▶ Pendant la séance', 'Le lecteur affiche la partie en cours et le temps qu’il lui reste.'],
  ] },
  { v: '8.9.0', date: '2026-09-29', title: 'Une app plus simple à parcourir', why: 'Chaque chose a sa place : la séance du jour en premier, un seul bouton pour créer une séance, des paramètres rangés par rubrique.', steps: [
    ['home', 'dash', '.quick .qa.pri', '🎯 En premier', 'La séance du jour est tout en haut : un toucher et c’est parti.'],
    ['library', 'seances', '[data-act=newChoose]', '＋ Un seul bouton', 'Pour créer une séance : sur mesure, prête, à la main, collée, ou avec un ami. Tout est ici.'],
    ['home', 'dash', '[data-act=allOpen]', '☰ Menu', 'Toutes les fonctions, rangées par thème, sont dans ce menu.'],
    ['settings', 'main', '.setmenu', '⚙️ Paramètres rangés', 'Une rubrique par ligne : affichage, séance, notifications, données, aide.'],
  ] },
  { v: '8.10.0', date: '2026-09-29', title: 'Des listes claires, sans barres d’onglets', why: 'Bibliothèque, Progrès et Profil prennent le format des paramètres : une rubrique par ligne, une page par rubrique. Et les notifications se cochent « vu ».', steps: [
    ['library', 'home', '.setmenu', '📚 En liste', 'La Bibliothèque s’ouvre sur une liste claire. Chaque rubrique a sa page, avec un retour.'],
    ['progress', 'summary', '.setmenu', '📈 Aller plus loin', 'Le résumé reste en haut ; historique, records et analyses sont dans la liste en dessous.'],
    ['home', 'dash', '[data-act=notifOpen]', '🔔 « ✓ Vu »', 'Coche chaque notification une fois lue : les nouvelles restent en avant, les autres se rangent plus bas.'],
  ] },
  { v: '8.11.0', date: '2026-09-29', title: 'Une loupe pour tout trouver', why: 'Écris ce que tu cherches : une fonction, un réglage, une séance ou un exercice. Et dans les paramètres, une recherche rien que pour les réglages.', steps: [
    ['home', 'dash', '.topicons [data-act=findOpen]', '🔍 Rechercher', 'Touche la loupe et écris ce que tu cherches : les résultats arrivent pendant que tu tapes, et un toucher t’y emmène.'],
    ['settings', 'main', 'input[data-input=setFind]', '⚙️ Chercher un réglage', 'Ici, la recherche ne montre que les paramètres, et le réglage trouvé est mis en lumière.'],
  ] },
  { v: '8.12.0', date: '2026-09-29', title: 'Tout se modifie, pour toi ou pour tout le monde', why: 'Exercices et séances prêtes ont un bouton « ✏️ Modifier ». Les administrateurs choisissent à chaque fois : pour eux, ou pour tous les comptes.', steps: [
    ['library', 'exercises', '#main [data-act=libInfo]', '✏️ Modifier', 'Ouvre un exercice ou une séance prête : « ✏️ Modifier » change le nom, les séries, le repos, les consignes… pour toi.'],
    ['', '', '', '🌍 Pour tout le monde', 'Si tu es administrateur, l’app te demande à chaque changement : pour toi seulement, ou pour tout le monde. Et tout s’annule en un toucher.'],
  ] },
  { v: '8.13.0', date: '2026-09-30', title: 'Tes idées pour tout le monde', why: 'Propose tes systèmes de cotation, styles, exercices, séances et formats : les administrateurs les ajoutent pour tous. Et toutes les mises à jour ont leur visite.', steps: [
    ['profile', 'climbing', '[data-act=carnetAdv]', '💡 Proposer', 'Crée ton système de cotation ou ton style, puis « 💡 Proposer à tout le monde ». Pareil pour tes exercices, tes séances et tes formats.'],
    ['settings', 'updates', '.upd', '🆕 Toutes les mises à jour', 'L’évolution de l’app depuis le début, avec une visite pour chaque mise à jour.'],
  ] },
  { v: '8.14.0', date: '2026-10-01', title: 'L’app se modifie sans code', why: 'Les administrateurs changent les textes, envoient des annonces, choisissent la mise en page pour tous, gèrent les questions, les sources et les autres administrateurs.', steps: [
    ['settings', 'admin', '.setmenu', '🛠 Modifier l’app sans code', 'Textes, annonces, mise en page pour tous, questions fréquentes et sources : tout se fait ici, sans toucher au code.'],
    ['home', 'dash', '[data-act=notifOpen]', '📣 Annonces', 'Les annonces de l’équipe arrivent dans tes notifications.'],
  ] },
  { v: '8.15.0', date: '2026-10-02', title: 'Séances multi-sports et fusion', why: 'Une séance peut mélanger plusieurs sports (renfo puis bloc…), deux séances se fusionnent en une nouvelle avec des conseils, et chacun peut demander une modification aux administrateurs.', steps: [
    ['library', 'generate', '.partrow .partact', '🧗 Un sport par partie', 'Dans le format de séance, choisis le sport de chaque partie : renfo, puis bloc, puis étirements…'],
    ['library', 'seances', '[data-act=mergeOpen]', '🔀 Fusionner des séances', 'Choisis 2 à 4 séances : l’app note le mélange, conseille l’ordre et crée une nouvelle séance. Tes séances d’origine ne changent pas.'],
    ['settings', 'main', '[data-act=ideaNew]', '💡 Proposer une amélioration', 'Une idée ou une modification ? Envoie-la : les administrateurs l’acceptent ou non, et tu reçois la réponse.'],
  ] },
  { v: '8.16.0', date: '2026-10-03', title: 'Ranger ses séances', why: 'Chaque séance a ses sports (plusieurs), son lieu et ses catégories ; « Mes séances » se filtre et se trie comme tu veux, même selon ta forme du jour.', steps: [
    ['library', 'seances', '[data-act=sfOpen]', '⇅ Trier et filtrer', 'Lieu, un ou plusieurs sports, catégories, et 10 façons de trier : selon ta forme, pas faites depuis longtemps, les plus courtes…'],
    ['library', 'seances', '.sfbar input', '🔍 Chercher', 'Tape un nom de séance ou d’exercice.'],
  ] },
  { v: '8.17.0', date: '2026-10-04', title: 'Regrouper et modifier plusieurs séances', why: 'Mes séances se regroupent par lieu, sport ou catégorie, et on peut en sélectionner plusieurs pour leur donner un lieu, une catégorie, un sport, les fusionner ou les archiver d’un coup.', steps: [
    ['library', 'seances', '[data-act=sfOpen]', '▤ Regrouper', 'Dans « ⇅ Trier », choisis « Regrouper par » : lieu, sport ou catégorie.'],
    ['library', 'seances', '[data-act=selStart]', '☑ Plusieurs à la fois', 'Coche des séances puis choisis : lieu, catégorie, sport, fusionner ou archiver.'],
  ] },
  { v: '8.18.0', date: '2026-10-05', title: 'C’est quoi, à quoi ça sert, pourquoi', why: 'Chaque séance et chaque exercice répond maintenant à trois questions simples, et tu peux écrire ton propre pourquoi.', steps: [
    ['library', 'seances', '#main .card [data-act=openSeance]', '🧐 En bref', 'Ouvre une séance : en haut, c’est quoi, à quoi elle sert et pourquoi. ✎ pour écrire ton pourquoi.'],
    ['library', 'exercises', '#main [data-act=libInfo]', '🎯 Chaque exercice', 'Touche un exercice (ou son nom dans une séance) : c’est quoi, à quoi ça sert, et pourquoi il est là.'],
  ] },
  { v: '8.19.0', date: '2026-10-06', title: 'Structurer ta séance d’escalade', why: 'Dis ce que tu veux réussir à la fin (ex. un U8 en dévers) et le temps que tu as : l’app construit toute la séance. Ou structure-la toi-même : parties, bloc ou voie, intensité, cotations, styles, et plusieurs propositions de structure.', steps: [
    ['library', 'climbplan', '.steps', '🎯 Ton objectif', 'Choisis la cotation à réussir, les styles et ton temps : échauffement sur des niveaux bien plus faciles, montée, puis essais.'],
    ['library', 'climbplan', '.steps', '🧩 À ta façon', 'Tes parties (ex. 1 h 30 bloc intense, 30 min tranquille, voie max), une structure au choix pour chacune, et « adapter à ce que j’ai fait avant ».'],
  ] },
  { v: '8.20.0', date: '2026-10-07', title: 'Surprends-moi', why: 'Dis seulement ce que tu veux (sport, temps, forme… ou rien) : l’app te prépare une séance différente de d’habitude, ou qui te fait progresser, et t’explique pourquoi. Échauffement et étirements réglables partout.', steps: [
    ['library', 'climbplan', '.steps', '🎲 Surprends-moi', 'Nouveau pour toi (styles, structures, exercices jamais faits) ou pour progresser (tes styles faibles, ton objectif).'],
  ] },
  { v: '8.21.0', date: '2026-10-08', title: 'Idées avec l’endroit, mise en page plus claire', why: 'Quand tu proposes une idée, tu peux montrer l’endroit exact à changer ; l’administrateur y va en un clic et le modifie pour tout le monde. Le mode ✏️ de mise en page explique ce qu’il fait, a un aperçu et un bouton Quitter.', steps: [
    ['settings', 'main', '[data-act=ideaNew]', '📍 Montre l’endroit', 'Écris ton idée, puis « Choisir l’endroit à changer » et touche l’élément concerné.'],
    ['home', 'dash', '.topicons [data-act=layEdit]', '✏️ Personnaliser la page', 'Choisis ce qui s’affiche et dans quel ordre, regarde l’aperçu, puis enregistre ou quitte.'],
  ] },
  { v: '8.22.0', date: '2026-10-09', title: 'Choisis combien l’app t’aide', why: 'Trois façons de créer ta séance : l’app choisit tout (et tu ajustes le temps et les exercices de chaque partie), l’app te guide (plusieurs exercices expliqués et l’ordre conseillé), ou tu composes toi-même.', steps: [
    ['library', 'climbplan', '[data-act=cpHelp][data-id=guide]', '🧭 L’app me guide', 'Pour chaque partie : des exercices expliqués (ce qu’ils travaillent, où les placer, quoi prendre pour travailler plus une chose). Tu coches.'],
    ['library', 'climbplan', '[data-act=cpHelp][data-id=free]', '✋ Je compose', 'Tes parties et tes exercices, dans tout le catalogue.'],
  ] },
  { v: '8.23.0', date: '2026-10-10', title: 'Une seule façon de créer une séance, et tes lieux', why: 'Créer une séance se fait en 5 étapes pour tous les sports : comment l’app t’aide, sport + lieu (le matériel suit), plusieurs objectifs, le format puis les exercices. Tes salles et falaises (avec secteurs) gardent tout ce que tu y as fait, et tes objectifs réussis sont enregistrés.', steps: [
    ['library', 'climbplan', '.steps', '✨ Créer une séance', 'Étape par étape : comment l’app t’aide, sport, lieu et temps, tes objectifs, le format, puis les exercices. « ‹ Retour » à chaque étape.'],
    ['profile', 'equipment', '[data-act=envNewCrag]', '📍 Mes lieux', 'Salles et falaises (avec leurs secteurs). Touche un lieu pour voir tout ce que tu y as fait.'],
    ['profile', 'goals', '.setsec', '🏆 Objectifs réussis', 'Un bouton « J’ai réussi » enregistre la perf dans ton profil et propose la suite. Tout est rangé par section, sans onglets.'],
    ['settings', 'notifs', '.card', '🔔 Notifications', 'Si tu ne reçois plus les nouveautés : « 🩺 Vérifier cet appareil » répare l’abonnement.'],
  ] },
  { v: '8.24.0', date: '2026-10-11', title: 'Tous les sports comme l’escalade', why: 'Course, natation, muscu, renfo : choisis ton sport et une performance à atteindre (10 km en 50 min, 100 kg au squat, 15 tractions…). La séance se construit comme pour une cotation : échauffement, montée, travail à l’allure ou à la charge visée, retour au calme. Chaque partie a ses structures au choix (fractionné, seuil, 5×5, EMOM…). Et tout se lit sans rien de caché, même sur un petit téléphone.', steps: [
    ['library', 'climbplan', '.steps', '🎯 Atteindre une performance', 'À l’étape « Pour quoi ? », choisis « Atteindre une performance » et écris ta cible : allures et charges sont calculées depuis tes perfs notées.'],
    ['profile', 'goals', '.kicker', '📋 Objectifs en liste', 'Plus de rangée d’onglets : tes objectifs en cours, puis les réussis et les archivés, rangés en rubriques.'],
  ] },
  { v: '8.25.0', date: '2026-10-12', title: 'Tout est regroupé, et on rattrape ce qu’on a raté', why: 'Les fonctions qui se ressemblaient sont réunies : les projets d’escalade avec les objectifs, une seule page Records et mesures, un seul Journal, Mon analyse, Mon corps et mes préférences, un Planning, un Assistant, et une seule façon de créer une séance. Si tu as raté plusieurs mises à jour, une seule visite te montre tout.', steps: [
    ['profile', 'goals', '.kicker', '📌 Projets = objectifs', 'Tes projets d’escalade sont rangés avec tes objectifs, et « Réussi » les met dans tes objectifs réussis.'],
    ['profile', 'perfs', '#main h1', '🏆 Records et mesures', 'Records des séances, mesures, maxima, pyramide et test de doigts : tout au même endroit.'],
    ['progress', 'journal', '.chips', '📝 Un seul Journal', 'Séances, blocs et voies, mesures, notes, étapes : un seul fil, avec des filtres.'],
    ['profile', 'analyse', '.setmenu', '🔎 Mon analyse', 'Capacités, tendances, pourquoi ces conseils et le Lab, réunis.'],
    ['home', 'cal', '#main h1', '📅 Planning', 'Calendrier, programme et rappels au même endroit.'],
    ['library', 'climbplan', '.steps', '✨ Une seule façon de créer une séance', '« Séance du jour », « Que faire aujourd’hui » et l’Assistant ouvrent tous cet assistant, déjà rempli.'],
  ] },
  { v: '8.26.0', date: '2026-10-13', title: 'Séances structurées et explications', why: 'Tu décides du niveau de détail de ta séance, phase par phase (bloc, pause, voie…), et chaque proposition dit pourquoi. Rien n’est appliqué sans toi.', steps: [
    ['library', 'climbplan', '.steps', '🧱 Ta structure', 'Choisis le niveau de détail (libre → très précis), découpe la séance en phases (bloc, pause, voie…) et verrouille 🔒 ce que tu imposes.'],
    ['', '', '', '💡 Pourquoi ?', 'Chaque proposition dit d’où elle vient : donnée connue, règle, déduction, ou information manquante. Les améliorations ne s’appliquent que si tu les choisis, et s’annulent.'],
    ['profile', 'goals', '#main h1', '🎯 Objectif avec l’IA', 'Une fiche à relire et corriger avant d’enregistrer. Aucune cible n’est inventée ; « Comment le sais-tu ? » explique chaque point.'],
    ['library', 'common', '#main h1', '🌍 Bibliothèque commune', 'Les séances des membres sont classées automatiquement, avec « Classée ainsi parce que… ». Le catalogue officiel reste dans 🗂 Séances prêtes.'],
  ] },
  { v: '8.27.0', date: '2026-09-30', title: 'Construire ta séance, réglage par réglage', why: 'Choisis l’objectif de ta séance et le moment où il arrive, puis règle chaque phase dans l’ordre : type, objectif, précisément, réglages du type, intensité, lieu, ce que tu ne veux pas. Tout le reste, l’app le décide et l’explique.', steps: [
    ['library', 'climbplan', '.steps', '🎯 Objectif à n’importe quel moment', 'Dans « Pour quoi ? » : quoi, précisément, et quand (début, milieu, fin, toute la séance). Tu peux ensuite le poser sur une phase précise.'],
    ['', '', '', '🔗 Une chaîne de réglages', 'Chaque phase se règle dans l’ordre, avec seulement ce qui a du sens pour son type : lieu propre, déplacement, filtres, curseurs de compromis, contraintes.'],
    ['', '', '', '🔮 Et si… ? et ✍️ Modifier avec l’IA', 'Teste un changement (moins de temps, moins intense, autre lieu) et vois ses conséquences ; ou écris « J’ai seulement 1 h 20 » : l’app montre le plan avant d’appliquer.'],
    ['profile', 'goals', '#main h1', '🧭 Plusieurs chemins', 'Pour un objectif : très spécifique, mixte ou préparation physique, comparés. La carte des relations explique chaque lien.'],
  ] },
  { v: '8.28.0', date: '2026-10-01', title: 'Simple d’abord, précis si tu veux', why: 'Créer une séance commence par l’essentiel, déjà rempli d’après ton profil : un toucher sur « ⚡ Proposer ma séance » suffit. Ton profil comprend mieux ta condition grâce à un bilan selon tes objectifs, et le niveau d’une séance est expliqué avec des faits.', steps: [
    ['library', 'climbplan', '.steps', '⚡ L’essentiel, puis Proposer ma séance', 'Sport, lieu, temps, forme et objectif sur un seul écran, pré-remplis d’après ton profil. « ⚡ Proposer ma séance » : la séance tout de suite, avec « ✨ Faite pour toi ».'],
    ['profile', 'bilan', '#main h1', '🩺 Mon bilan physique', 'Les repères utiles pour TES objectifs, comment faire chaque test, ce que l’app en déduit, et des objectifs précis proposés depuis ta dernière valeur.'],
    ['', '', '', '🔎 Un niveau de séance factuel', 'Le niveau conseillé vient du prérequis le plus exigeant, nommé ; ce qui est connu, estimé ou inconnu est dit.'],
    ['home', 'dash', '#main', '🔁 Ce que ta séance change pour la suivante', 'Après une séance, l’accueil dit ce qui est adapté pour la prochaine : doigts à reposer, option légère, marche suivante, exercices aimés ou à éviter.'],
    ['', '', '', '💪 Des exercices à ton niveau, capacité par capacité', 'Fort en tirage mais débutant en poussée ? Chaque exercice suit ton niveau dans ce qu’il travaille.'],
  ] },
  { v: '8.29.0', date: '2026-10-01', title: 'Ta séance, tes objectifs, ta silhouette', why: 'Plusieurs sports et plusieurs lieux dans une même séance, des objectifs classés (ou sans hiérarchie) qui organisent toute la séance, tes horaires réels, une silhouette visée avec ses mensurations, et une vraie salle de sport dans l’app.', steps: [
    ['library', 'climbplan', '.steps', '🎯 Objectifs classés, structure adaptée', 'Ajoute plusieurs objectifs, classe-les (ou « ⚖️ Sans hiérarchie »), dis à quel moment faire chacun : toute la séance s’organise autour de ton n°1, et chaque choix est expliqué.'],
    ['', '', '', '🕒 Tes horaires réels', 'Salle de voie de 18:00 à 19:30, puis salle de bloc de 20:00 à 21:00 : le temps entre les deux devient le trajet, le renfo va là où il y a le matériel, et la structure finale affiche les vraies heures.'],
    ['home', 'cal', '#main h1', '📅 Heure et « Pas faite »', 'Donne une heure à chaque séance planifiée (elle part dans l’agenda du téléphone), et retire après coup une séance enregistrée par erreur.'],
    ['profile', 'body', '#main h1', '🪞 Ma silhouette', 'Forme en V, abdos visibles, bras, jambes… : les bons muscles en priorité, les mensurations à prendre, et tes séries par muscle dans la semaine. Rien n’est promis : l’app dit aussi ce qui ne dépend pas de l’entraînement.'],
    ['library', 'catalog', '#main h1', '🏢 La salle de sport dans l’app', 'Plus de 100 exercices en plus, chaque machine de salle, et des séances prêtes : full body machines, push / pull / jambes, haut / bas, forme en V, abdos, fessiers, cardio.'],
  ] },
  { v: '8.30.0', date: '2026-10-02', title: 'Un vrai coach, du début à la fin', why: 'Des mesures précises (masse musculaire, masse grasse, mensurations…), une forme du jour qui adapte la séance, des douleurs ménagées d’office, un planning qui s’organise tout seul autour de tes créneaux et de tes objectifs datés, des outils pour chaque sport, ton parcours (saison, lettre à toi-même, année en sport, avant / après) et une app plus accessible.', steps: [
    ['profile', 'body', '#main h1', '📏 Mesures précises', 'Masse musculaire, masse grasse, eau, mensurations complètes… avec les calculs utiles (IMC, masse maigre, rapports) et comment bien mesurer. Toujours toi par rapport à toi.'],
    ['home', 'dash', '#main', '🔋 Forme du jour', 'Un check-in de 10 secondes le matin (sommeil, énergie, courbatures, stress) : la séance du jour s’adapte, et une douleur notée est ménagée d’office.'],
    ['home', 'cal', '#main h1', '🤖 Ta semaine automatique', 'D’après tes créneaux, les horaires de tes lieux et tes événements. Un objectif daté (course, compétition) se construit à rebours, et les conflits se corrigent en un toucher.'],
    ['', '', '', '▶️ Pendant la séance', 'Dis si la série était facile ou dure : la suivante s’ajuste. « ⋯ Outils » : j’ai mal, il me reste peu de temps, note, mode nuit, remplacer un exercice. Une séance interrompue se reprend.'],
    ['profile', 'climbing', '#main h1', '🧗 Outils par sport', 'Escalade : styles, envies par site, compétition, pan maison, conditions en falaise. Muscu : disques, charge max. Course : allures. Natation : longueurs. Import GPX / TCX.'],
    ['progress', 'summary', '#main', '🌟 Mon parcours', 'Saison de 4 semaines, lettre à toi-même, ton année en sport, avant / après, rapport du mois à imprimer et photos de progrès gardées sur ton téléphone.'],
    ['settings', 'display', '#main h1', '♿ Accessibilité', 'Lecture facile, gros boutons, contraste renforcé, couleurs pour daltonisme. Et : encouragements entre partenaires, idées à voter, démo sans compte.'],
  ] },
  { v: '8.31.0', date: '2026-10-03', title: 'Ta salle, tes moments, ta séance sans limite', why: 'Ta salle de sport avec tes machines, tes moments préférés (élastiques, no foot, spray wall…) glissés au bon endroit, autant d’objectifs et de sports que tu veux, jusqu’à 5 h, et 487 séances prêtes.', steps: [
    ['library', 'gym', '#main h1', '🏋️ Ma salle de sport', 'Coche les machines de ta salle : la séance du jour n’utilise qu’elles, reprend tes charges et retient tes réglages. 🔄 si une machine est prise.'],
    ['library', 'moments', '#main h1', '🧩 Mes moments', 'Élastiques à l’échauffement, no foot ou spray wall en fin de séance… Ils sont proposés dans « Créer une séance », adaptés à la séance du jour, avec un conseil spray wall d’après tes séances.'],
    ['library', 'climbplan', '#main h1', '✨ Créer une séance', 'Autant d’objectifs et de sports que tu veux (voie, bloc, renfo, piscine…), jusqu’à 5 h. Un seul champ « ✍️ Avec tes mots ».'],
    ['library', 'catalog', '#main h1', '📖 Carnet de séances', '487 séances prêtes : choisis ce que tu veux travailler (technique de pieds, doigts, seuil…), « Adapté à moi » ou tout le carnet.'],
  ] },
];

const KEY = 'sea:news-toured';
const num = (v) => String(v || '0').split('.').map((x) => Number(x) || 0).reduce((t, x) => t * 1000 + x, 0);

/** Étapes de rattrapage : toutes les versions pas encore visitées depuis la dernière visite, en une seule visite. */
export function pendingNews() { return catchUpSteps(NEWS, ls.get(KEY, '0'), APP_VERSION, { since: ls.get(KEY + '-at', 0) }); }
/** Versions ratées depuis la dernière visite (la plus ancienne d'abord). */
export const missedNews = () => missedVersions(NEWS, ls.get(KEY, '0'), APP_VERSION);
/** Étapes de la dernière version (pour « Revoir les nouveautés »). */
export const latestNews = () => NEWS.filter((n) => num(n.v) <= num(APP_VERSION)).at(-1)?.steps || [];
export const markNewsToured = () => { ls.set(KEY, APP_VERSION); ls.set(KEY + '-at', Date.now()); };
/** Première utilisation de l'appareil : rien de « nouveau » à montrer (la visite complète s'en charge).
 *  Appareil déjà utilisé avant l'arrivée de cette visite : on montre les nouveautés depuis la 8.3. */
export function initNews() {
  if (ls.get(KEY, null) !== null) return;
  if (ls.get('sea:seen-build', null) || ls.get('sea:user', null)) ls.set(KEY, '8.2.9'); else markNewsToured();
}
