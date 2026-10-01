// tour.js — visite guidée immersive : l'app va elle-même sur chaque page, met en lumière l'élément expliqué
// (le reste de l'écran est assombri) et affiche une bulle avec une flèche qui le pointe.
// Précédent / Suivant / Passer ; flèches du clavier et Échap ; s'adapte à la rotation et au défilement.
import { h } from './ui.js';
import { S, ACT, go } from './state.js';

// [onglet, sous-page, sélecteur de l'élément à montrer, titre, texte]
const STEPS = [
  ['home', 'dash', '.hero', '👋 Bienvenue !', 'Voici ton accueil : ta semaine en un coup d’œil. On fait le tour des 5 onglets ensemble, en une minute.'],
  ['home', 'dash', '.quick .qa.pri', '🎯 Une séance pour toi', 'Touche ici : l’app prépare une séance adaptée à ton niveau, ton temps et ton matériel.'],
  ['home', 'dash', '.pagetour', '🧭 Une visite sur chaque page', 'Sur chaque écran, ce bouton t’explique la page : chaque partie, ce qu’il y a dedans et à quoi ça sert.'],
  ['progress', 'summary', '#main h1', '📈 Progrès', 'Tes chiffres, ta régularité, tes records et ton journal, comparés uniquement à toi-même.'],
  ['library', 'home', '#main .setmenu', '📚 Bibliothèque', 'Tes séances enregistrées, « Créer une séance » (l’app te guide), le carnet de séances prêtes par niveau, et tous les exercices.'],
  ['library', 'catalog', '#main h1', '📖 Le carnet de séances', 'Pas le temps de créer ? Des séances toutes prêtes pour chaque sport, de débutant à avancé.'],
  ['profile', 'home', '#main', '👤 Ton profil', 'Tout ce que l’app sait de toi : corps, sports, lieux et matériel, objectifs, mesures. Plus il est complet, plus tes séances sont justes.'],
  ['settings', 'main', '#main .setmenu', '⚙️ Paramètres', 'Affichage, déroulé des séances, notifications, tes données et l’aide.'],
  ['settings', 'help', '[data-act=helpTour]', '🧭 C’est parti !', 'Tu pourras relancer cette visite ici, et la visite de chaque page avec le bouton 🧭 en haut. Bon entraînement 💪'],
];
const T = { i: -1, onEnd: null, raf: 0, steps: STEPS, stay: false };

/** steps : liste [onglet, sous-page, sélecteur (ou '' pour une bulle centrée), titre, texte] ; la visite complète par défaut. */
export function startTour({ onEnd, steps, stay = false } = {}) {
  T.onEnd = onEnd || null; T.steps = steps?.length ? steps : STEPS; T.stay = !!stay;
  let root = document.getElementById('tour');
  if (!root) { root = document.createElement('div'); root.id = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); document.body.appendChild(root); }
  document.body.classList.add('touring');
  window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', onKey);
  show(0);
}
export const tourActive = () => T.i >= 0;
function onKey(e) { if (T.i < 0) return; if (e.key === 'ArrowRight') show(T.i + 1); else if (e.key === 'ArrowLeft') show(T.i - 1); else if (e.key === 'Escape') end(); }
async function show(i) {
  if (i < 0) return;
  if (i >= T.steps.length) return end();
  T.i = i;
  const [tab, sub, sel] = T.steps[i];
  if (tab && (S.tab !== tab || S.sub[tab] !== sub)) go(tab, sub);
  const el = sel ? await waitFor(sel) : (await new Promise((r) => setTimeout(r, 150)), null);
  if (T.i !== i) return; // l'utilisateur a déjà changé d'étape
  if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  draw(el);
}
function waitFor(sel, ms = 1500) {
  return new Promise((res) => { const t0 = Date.now(); const tick = () => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().height > 0) return res(el); if (Date.now() - t0 > ms) return res(null); requestAnimationFrame(tick); }; tick(); });
}
function draw(el) {
  const [, , , title, text] = T.steps[T.i], root = document.getElementById('tour'); if (!root) return;
  const last = T.i === T.steps.length - 1;
  root.innerHTML = h`<div class="tour-spot"></div><div class="tour-bubble tour"><i class="tour-arrow"></i><button class="tour-x" data-act="tourEnd" aria-label="Quitter la visite">✕</button>
    <div class="tour-step">${T.i + 1} / ${T.steps.length}</div><h3>${title}</h3><p>${text}</p>
    ${T.steps.length > 12 ? h`<div class="tbar" aria-hidden="true"><i style="width:${Math.round(((T.i + 1) / T.steps.length) * 100)}%"></i></div>` : h`<div class="dots">${T.steps.map((_, k) => h`<i class="${k === T.i ? 'on' : ''}"></i>`)}</div>`}
    <div class="row">${T.i > 0 ? h`<button class="btn sm" data-act="tourPrev">‹ Retour</button>` : h`<button class="btn sm ghost" data-act="tourEnd">Passer</button>`}<span class="grow"></span>
      ${last ? h`<button class="btn pri" data-act="tourEnd">C’est compris !</button>` : h`<button class="btn pri" data-act="tourNext">Suivant ›</button>`}</div></div>`.s;
  T.el = el; place();
  // Deuxième placement un peu après : si la page s'est redessinée, la bulle suit l'élément.
  const i0 = T.i; for (const ms of [350, 1000]) setTimeout(() => { if (T.i === i0) place(); }, ms);
  root.querySelector('.tour-bubble [data-act=tourNext], .tour-bubble [data-act=tourEnd]')?.focus({ preventScroll: true });
}
/** Place le halo sur l'élément et la bulle au-dessus ou en dessous, avec la flèche qui le pointe. */
function place() {
  cancelAnimationFrame(T.raf);
  T.raf = requestAnimationFrame(() => {
    const root = document.getElementById('tour'); if (!root || T.i < 0) return;
    const spot = root.querySelector('.tour-spot'), bub = root.querySelector('.tour-bubble'), arrow = root.querySelector('.tour-arrow');
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    // La page a pu se redessiner (données arrivées entre-temps) : on retrouve l'élément.
    if ((!T.el || !document.body.contains(T.el)) && T.steps[T.i]?.[2]) { const again = document.querySelector(T.steps[T.i][2]); if (again && again.getBoundingClientRect().height > 0) T.el = again; }
    if (!T.el || !document.body.contains(T.el)) {
      spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      bub.style.cssText = `left:16px;right:16px;top:${Math.max(16, vh / 2 - 120)}px`; arrow.style.display = 'none'; return;
    }
    const r = T.el.getBoundingClientRect();
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`;
    const bw = Math.min(360, vw - 32), bh = bub.offsetHeight || 190;
    const below = r.bottom + pad + 14 + bh < vh - 90 || r.top - pad - 14 - bh < 60;
    const top = below ? Math.min(vh - bh - 16, r.bottom + pad + 14) : Math.max(16, r.top - pad - 14 - bh);
    const left = Math.max(16, Math.min(vw - bw - 16, r.left + r.width / 2 - bw / 2));
    bub.style.cssText = `left:${left}px;top:${top}px;width:${bw}px`;
    // La hauteur réelle n'est connue qu'une fois la largeur posée : la bulle reste toujours entière à l'écran.
    const realH = bub.offsetHeight || bh, fixed = Math.max(16, Math.min(top, vh - realH - 16));
    if (fixed !== top) bub.style.top = `${fixed}px`;
    const covers = fixed !== top && (below ? fixed < r.bottom : fixed + realH > r.top); // la bulle recouvre l'élément : pas de flèche
    arrow.style.display = covers ? 'none' : ''; arrow.className = 'tour-arrow ' + (below ? 'up' : 'down');
    arrow.style.left = `${Math.max(18, Math.min(bw - 18, r.left + r.width / 2 - left))}px`;
  });
}
function end() {
  T.i = -1; document.getElementById('tour')?.remove(); document.body.classList.remove('touring');
  window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', onKey);
  if (!T.stay) go('home', 'dash'); // visite d'une page : on reste sur la page
  T.stay = false;
  const cb = T.onEnd; T.onEnd = null; cb?.();
}
ACT.tourNext = () => show(T.i + 1);
ACT.tourPrev = () => show(T.i - 1);
ACT.tourEnd = () => end();
