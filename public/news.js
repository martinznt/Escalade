// news.js — visite des nouveautés : après une mise à jour, une courte visite (même principe que la visite guidée)
// montre seulement ce qui a changé et qu'il faut savoir. Chaque version ajoute ses étapes ici.
// Étape : [onglet, sous-page, sélecteur de l'élément (ou '' pour une bulle au centre), titre, texte].
import { APP_VERSION, ls } from './state.js';

export const NEWS = [
  { v: '8.3.0', steps: [
    ['settings', 'help', '[data-act=helpTour]', '🧭 Visite guidée', 'La visite va maintenant elle-même sur chaque page et te montre les boutons avec une flèche.'],
  ] },
  { v: '8.4.0', steps: [
    ['', '', '', '📋 Consignes à chaque série', 'Pendant une séance, les consignes de l’exercice restent affichées à chaque série — et même pendant le repos, pour préparer la suivante.'],
    ['', '', '', '🏡 Nouvelle adresse', `Le site est maintenant sur ${location.host.endsWith('.pages.dev') ? location.host : 'seances-sport.pages.dev'}. L’ancienne adresse t’y amène toute seule, avec ton compte et tes réglages.`],
    ['settings', 'help', '[data-act=newsTour]', '✨ Revoir les nouveautés', 'Après chaque mise à jour, une petite visite comme celle-ci te montre ce qui change. Tu peux la revoir ici.'],
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
