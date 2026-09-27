// news.js — visite des nouveautés : après une mise à jour, une courte visite (même principe que la visite guidée)
// montre seulement ce qui a changé et qu'il faut savoir. Chaque version ajoute ses étapes ici.
// Étape : [onglet, sous-page, sélecteur de l'élément (ou '' pour une bulle au centre), titre, texte].
import { APP_VERSION, ls } from './state.js';

export const NEWS = [
  { v: '8.3.0', date: '2026-09-27', title: 'Visite guidée immersive', why: 'Comprendre l’app en 30 secondes : elle va seule sur chaque page et montre les boutons.', steps: [
    ['settings', 'help', '[data-act=helpTour]', '🧭 Visite guidée', 'La visite va maintenant elle-même sur chaque page et te montre les boutons avec une flèche.'],
  ] },
  { v: '8.4.0', date: '2026-09-27', title: 'Nouvelle adresse, consignes à chaque série', why: 'Les consignes restent sous les yeux pendant toute la séance, et le site a une adresse courte.', steps: [
    ['', '', '', '📋 Consignes à chaque série', 'Pendant une séance, les consignes de l’exercice restent affichées à chaque série — et même pendant le repos, pour préparer la suivante.'],
    ['', '', '', '🏡 Nouvelle adresse', `Le site est maintenant sur ${location.host.endsWith('.pages.dev') ? location.host : 'seances-sport.pages.dev'}. L’ancienne adresse t’y amène toute seule, avec ton compte et tes réglages.`],
    ['settings', 'help', '[data-act=newsTour]', '✨ Revoir les nouveautés', 'Après chaque mise à jour, une petite visite comme celle-ci te montre ce qui change. Tu peux la revoir ici.'],
  ] },
  { v: '8.5.0', date: '2026-09-27', title: 'Minuteur, carnet d’escalade, programme, rappels', why: 'S’entraîner avec un coach vocal, suivre ses blocs et ses projets, tenir un programme sur plusieurs semaines.', steps: [
    ['home', 'dash', '[data-act=timerOpen]', '⏱ Minuteur', 'Suspensions 7/3, Tabata, EMOM… en plein écran, avec bips et voix.'],
    ['home', 'dash', '[data-act=goCarnet]', '🧗 Ton carnet', 'Note un bloc en 3 touchers, regarde ta pyramide, suis tes projets avec photo.'],
    ['progress', 'summary', '.streak', '🔥 Ta série', 'Les semaines d’affilée où tu tiens ton rythme. La semaine en cours ne casse jamais ta série.'],
    ['home', 'cal', '[data-act=progNew], .prog', '📆 Programme', 'Un objectif sur plusieurs semaines : 4 questions et ton calendrier se remplit.'],
    ['settings', 'main', '[data-change=remOn], .card h3', '🔔 Rappels', 'Choisis tes jours et ton heure : le téléphone te rappelle ta séance.'],
    ['', '', '', '🗣️ Coach vocal', 'Pendant la séance, active « Coach » : il annonce les séries, le repos et le décompte.'],
  ] },
  { v: '8.6.0', date: '2026-09-28', title: 'Ambiances, mise en page, séance sur mesure, salles, notifications', why: 'Une app à ton image (ambiances, place des éléments), des séances qui ciblent exactement ce que tu veux, ta salle et sa cotation, et toutes les nouveautés ici.', steps: [
    ['settings', 'main', '.vibes', '🎨 Ambiances', 'Chaleureux, salle de muscu, grand air, minimal, néon… L’app change complètement d’allure.'],
    ['home', 'dash', '.topicons', '✏️ À ta façon', 'Les petites icônes en haut ouvrent les fonctions. Le crayon te laisse tout déplacer, agrandir ou colorer.'],
    ['library', 'generate', '.gsecs', '🎯 Séance sur mesure', 'Choisis tes objectifs, intentions, forces, faiblesses, muscles et zones à ménager. Tu peux même écrire les tiens.'],
    ['profile', 'body', '.bodyf', '🫀 Mon corps', 'Âge, poids, forme, souffle… Les séances s’adaptent (intensité, repos, pas de sauts si besoin).'],
    ['profile', 'equipment', '[data-act=envNewGym]', '🧗 Ta salle', 'Décris ta salle : sa cotation (U1 → U8+…), ses espaces et son matériel.'],
    ['home', 'dash', '[data-act=notifOpen]', '🔔 Notifications', 'Toutes les mises à jour et leur utilité sont ici. Choisis tes notifications dans Paramètres.'],
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
