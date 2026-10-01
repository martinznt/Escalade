// pagetour.js — visite guidée de LA page affichée : « 🧭 Visite de cette page » en haut de chaque écran.
// 1) une présentation de la page (à quoi elle sert, en une ou deux phrases) ;
// 2) puis chaque bloc de la page, dans l'ordre, mis en lumière avec ce qu'il contient (les lignes d'une liste avec
//    leur description, les boutons d'une carte, le texte d'aide) — lu sur la page elle-même, donc toujours à jour ;
// 3) enfin les raccourcis du haut et la barre d'onglets du bas.
// La visite reste sur la page (rien n'est modifié, aucune action n'est lancée).
import { h } from './ui.js';
import { S, ACT } from './state.js';
import { startTour, tourActive } from './tour.js';

/** Présentation de chaque page : [titre, à quoi elle sert]. Clé « onglet/sous-page ». */
export const PAGE_INTRO = {
  'home/dash': ['🏠 L’accueil', 'Ce que tu peux faire aujourd’hui : une séance proposée pour toi, ta semaine, tes prochaines séances et ce que ta dernière séance change pour la suivante.'],
  'home/cal': ['📅 Le planning', 'Ton calendrier : les séances faites (points de couleur), celles prévues et ton programme. Touche un jour pour planifier une séance avec son heure, ou dire qu’une séance n’a pas été faite.'],
  'progress/summary': ['📈 Progrès', 'Ce que tes séances ont changé : régularité, volume, records, badges. Tout est comparé à toi-même, jamais aux autres.'],
  'progress/journal': ['📝 Le journal', 'Tout ce que tu as fait, séance par séance : blocs et voies notés, notes et ressenti. Les filtres en haut trient par type.'],
  'library/home': ['📚 La bibliothèque', 'Tes séances, et toutes les façons d’en créer : par l’app (sur mesure), guidée étape par étape, prête à l’emploi dans le carnet, ou à la main.'],
  'library/seances': ['📋 Mes séances', 'Les séances que tu as enregistrées : lance-les ▶, modifie-les, planifie-les ou partage-les.'],
  'library/climbplan': ['✨ Créer une séance', 'Un assistant en 6 étapes : l’essentiel (sport, lieu, temps), tes objectifs, la structure, les propositions par phase, les améliorations, puis la structure finale. Chaque étape a une phrase d’aide en haut.'],
  'library/catalog': ['📖 Le carnet de séances', 'Des séances toutes prêtes pour chaque sport, du niveau débutant à avancé, pour quand tu n’as pas le temps d’en créer une. Touche une séance pour voir ses exercices, puis lance-la ou garde-la.'],
  'library/exercises': ['🏋️ Les exercices', 'Tous les exercices de l’app : comment les faire, ce qu’ils travaillent, le matériel. Tu peux en créer et les classer.'],
  'library/common': ['🌍 La bibliothèque commune', 'Les séances que des membres ont choisi de partager, classées automatiquement.'],
  'profile/home': ['👤 Ton profil', 'Ce que l’app sait de toi : ton corps, tes sports, tes lieux et ton matériel, tes objectifs, tes mesures. Plus il est complet, plus tes séances sont justes.'],
  'profile/body': ['🫀 Mon corps et mes préférences', 'Âge, taille, forme du moment, silhouette visée, et ce que tu aimes ou évites. Ça règle l’intensité, les repos et les muscles prioritaires.'],
  'profile/bilan': ['🩺 Mon bilan physique', 'Les tests et mesures utiles pour TES objectifs, comment faire chacun, et ce que l’app en déduit.'],
  'profile/goals': ['🎯 Mes objectifs', 'Ce que tu veux en ce moment, et tes objectifs précis (une cotation, une charge, une figure…) avec leur progression.'],
  'profile/perfs': ['🏆 Records et mesures', 'Tes records, tests et mensurations, avec leur évolution. Touche « ＋ » pour noter une nouvelle valeur.'],
  'profile/activities': ['🏅 Mes sports', 'Les sports que tu pratiques, et pour l’escalade tes cotations et tes styles.'],
  'profile/equipment': ['📍 Mes lieux', 'Tes salles, ta maison, tes falaises, avec le matériel de chacun : les séances n’utilisent que ce qui est disponible.'],
  'profile/analyse': ['🔎 Mon analyse', 'Tes capacités (forces et points à travailler), les tendances, et pourquoi l’app te conseille ce qu’elle te conseille.'],
  'settings/main': ['⚙️ Paramètres', 'Ton compte, l’affichage, le déroulé des séances, les notifications, tes données et l’aide. Chaque ligne dit ce qu’elle contient.'],
  'settings/display': ['🎨 Affichage', 'Thème clair ou sombre, couleurs, taille du texte, langue : ça suit ton compte sur tous tes appareils.'],
  'settings/notifs': ['🔔 Notifications', 'Rappels d’entraînement, nouvelles mises à jour, réponses : choisis ce que tu reçois et quand.'],
  'settings/help': ['❓ Aide', 'Les questions fréquentes, la visite générale de l’app et les nouveautés.'],
};
const TAB_TEXT = 'En bas, les 5 onglets : 🏠 Accueil (aujourd’hui), 📈 Progrès (ce que tu as fait), 📚 Bibliothèque (tes séances et en créer), 👤 Profil (ce que l’app sait de toi), ⚙️ Paramètres (réglages et aide).';
const MAX_STEPS = 14, MAX_TEXT = 260;
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const cut = (t, n = MAX_TEXT) => (t.length > n ? t.slice(0, n - 1).trim() + '…' : t);
/** Chemin CSS stable depuis #main (survit à un nouvel affichage de la même page). */
function pathOf(el) {
  const parts = [];
  for (let e = el; e && e.id !== 'main'; e = e.parentElement) { const i = [...e.parentElement.children].indexOf(e) + 1; parts.unshift(`:nth-child(${i})`); }
  return '#main > ' + parts.join(' > ');
}
const visible = (el) => { const r = el.getBoundingClientRect(); return r.height > 8 && r.width > 8 && getComputedStyle(el).visibility !== 'hidden'; };
/** Ce que contient un bloc, lu sur la page : titres des lignes et leur description, boutons, phrase d'aide. */
function describe(el) {
  const rows = [...el.querySelectorAll('.setrow, .qa, .tile, .item')].filter(visible).slice(0, 6);
  const rowText = rows.map((r) => { const b = clean(r.querySelector('b')?.textContent || r.textContent).slice(0, 60), s = clean(r.querySelector('small, .tiny')?.textContent || ''); return s && s !== b ? `${b} (${cut(s, 42)})` : b; }).filter(Boolean);
  const help = clean([...el.querySelectorAll(':scope > p, :scope > .small, :scope > .tiny, :scope p.small, :scope p.tiny')].map((p) => p.textContent).find((t) => clean(t).length > 20) || '');
  const btns = [...el.querySelectorAll(':scope button.btn, :scope .row > button.btn')].filter(visible).map((b) => clean(b.textContent)).filter((t) => t && t.length < 40).slice(0, 4);
  const chips = [...el.querySelectorAll('.chips')].filter(visible).map((c) => [...c.querySelectorAll('.chip')].map((x) => clean(x.innerText || x.textContent)).filter(Boolean).slice(0, 8).join(', ')).filter(Boolean).slice(0, 3);
  const parts = [];
  if (help) parts.push(cut(help, 170));
  if (chips.length && !rowText.length) parts.push(`Choix possibles (touche pour choisir) : ${chips.join(' — ')}.`);
  if (rowText.length) parts.push(`Dedans : ${rowText.join(' · ')}${rows.length >= 6 ? '…' : ''}.`);
  else if (btns.length) parts.push(`Boutons : ${btns.map((t) => `« ${t} »`).join(', ')}.`);
  return cut(parts.join(' ') || clean((el.innerText || el.textContent).replace(/\n+/g, ' · ')).slice(0, 160));
}
const titleOf = (el, k) => {
  const head = el.querySelector('h1, h2, h3, .kicker');
  if (head) return clean(head.textContent).slice(0, 60);
  const prev = el.previousElementSibling; if (prev?.matches('.kicker, h2, h3')) return clean(prev.textContent).slice(0, 60);
  if (el.matches('.setmenu, .quick')) return k === 1 ? '📋 Ce que tu peux ouvrir ici' : '📋 Autres rubriques';
  if (el.querySelector('input:not([type=checkbox]), select, textarea')) return '📝 À remplir';
  if (el.querySelector('.chips')) return '🔎 Tes choix et filtres';
  const b = clean(el.querySelector('b')?.textContent || ''); if (b) return b.slice(0, 60);
  const w = clean(el.innerText || el.textContent).split(/[.:!?]/)[0]; return w ? `ℹ️ ${w.slice(0, 50)}` : `Partie ${k}`;
};
/** Étapes de la page affichée (lues dans le DOM). Exportée pour les tests navigateur. */
export function pageSteps() {
  const tab = S.tab, sub = S.sub[tab] || '', key = `${tab}/${sub}`, main = document.getElementById('main');
  const intro = PAGE_INTRO[key] || [clean(main?.querySelector('h1')?.textContent) || 'Cette page', 'Voici ce que contient cette page, bloc par bloc.'];
  const steps = [[tab, sub, '', intro[0], `${intro[1]} On regarde chaque partie, une par une.`]];
  if (main) {
    const cand = [...main.querySelectorAll('.hero, .steps, .quick, .setmenu, section.card, div.card, details.card, .catcard')]
      .filter((el) => visible(el) && !el.closest('.pagetour') && !el.closest('.tourbar') && !el.parentElement.closest('section.card, div.card, details.card, .setmenu, .quick'));
    let k = 1;
    for (const el of cand) {
      if (steps.length >= MAX_STEPS - 2) break;
      const text = describe(el); if (!text) continue;
      steps.push([tab, sub, pathOf(el), titleOf(el, k++), text]);
    }
  }
  if (document.querySelector('.topicons .ti')) {
    const ic = [...document.querySelectorAll('.topicons .ti')].map((b) => b.getAttribute('aria-label')).filter(Boolean).slice(0, 6);
    steps.push([tab, sub, '.topicons', '🔝 Les raccourcis du haut', cut(`Toujours à portée de main : ${ic.join(' · ')}.`)]);
  }
  steps.push([tab, sub, 'nav.tabs', '🧭 Les onglets', TAB_TEXT]);
  return steps;
}
ACT.pageTour = () => { if (tourActive()) return; window.scrollTo(0, 0); setTimeout(() => startTour({ steps: pageSteps(), stay: true }), 60); };
/** Bouton en haut de la page. */
export const pageTourBar = () => h`<div class="row pagetour"><span class="grow"></span><button class="btn sm ghost" data-act="pageTour" aria-label="Visite guidée de cette page : ce qu’il y a et à quoi ça sert">🧭 Visite de cette page</button></div>`;
