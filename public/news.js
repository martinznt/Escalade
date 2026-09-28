// news.js — visite des nouveautés : après une mise à jour, une courte visite (même principe que la visite guidée)
// montre seulement ce qui a changé et qu'il faut savoir. Chaque version ajoute ses étapes ici.
// Étape : [onglet, sous-page, sélecteur de l'élément (ou '' pour une bulle au centre), titre, texte].
import { APP_VERSION, ls } from './state.js';

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
    ['library', 'climbplan', '[data-act=cpMode][data-id=goal]', '🎯 Ton objectif', 'Choisis la cotation à réussir, les styles et ton temps : échauffement sur des niveaux bien plus faciles, montée, puis essais.'],
    ['library', 'climbplan', '[data-act=cpMode][data-id=parts]', '🧩 À ta façon', 'Tes parties (ex. 1 h 30 bloc intense, 30 min tranquille, voie max), une structure au choix pour chacune, et « adapter à ce que j’ai fait avant ».'],
  ] },
  { v: '8.20.0', date: '2026-10-07', title: 'Surprends-moi', why: 'Dis seulement ce que tu veux (sport, temps, forme… ou rien) : l’app te prépare une séance différente de d’habitude, ou qui te fait progresser, et t’explique pourquoi. Échauffement et étirements réglables partout.', steps: [
    ['library', 'climbplan', '[data-act=cpMode][data-id=surprise]', '🎲 Surprends-moi', 'Nouveau pour toi (styles, structures, exercices jamais faits) ou pour progresser (tes styles faibles, ton objectif).'],
  ] },
  { v: '8.21.0', date: '2026-10-08', title: 'Idées avec l’endroit, mise en page plus claire', why: 'Quand tu proposes une idée, tu peux montrer l’endroit exact à changer ; l’administrateur y va en un clic et le modifie pour tout le monde. Le mode ✏️ de mise en page explique ce qu’il fait, a un aperçu et un bouton Quitter.', steps: [
    ['settings', 'main', '[data-act=ideaNew]', '📍 Montre l’endroit', 'Écris ton idée, puis « Choisir l’endroit à changer » et touche l’élément concerné.'],
    ['home', 'dash', '.topicons [data-act=layEdit]', '✏️ Personnaliser la page', 'Choisis ce qui s’affiche et dans quel ordre, regarde l’aperçu, puis enregistre ou quitte.'],
  ] },
];

const KEY = 'sea:news-toured';
const num = (v) => String(v || '0').split('.').map((x) => Number(x) || 0).reduce((t, x) => t * 1000 + x, 0);

/** Étapes des versions pas encore visitées (jusqu'à la version actuelle), la plus ancienne d'abord. */
export function pendingNews() {
  const done = num(ls.get(KEY, '0')), now = num(APP_VERSION);
  return NEWS.filter((n) => num(n.v) > done && num(n.v) <= now).flatMap((n) => n.steps);
}
/** Étapes de la dernière version (pour « Revoir les nouveautés »). */
export const latestNews = () => NEWS.filter((n) => num(n.v) <= num(APP_VERSION)).at(-1)?.steps || [];
export const markNewsToured = () => ls.set(KEY, APP_VERSION);
/** Première utilisation de l'appareil : rien de « nouveau » à montrer (la visite complète s'en charge).
 *  Appareil déjà utilisé avant l'arrivée de cette visite : on montre les nouveautés depuis la 8.3. */
export function initNews() {
  if (ls.get(KEY, null) !== null) return;
  if (ls.get('sea:seen-build', null) || ls.get('sea:user', null)) ls.set(KEY, '8.2.9'); else markNewsToured();
}
