// nav.js — « ‹ Retour à … » : quand un raccourci emmène ailleurs (ajouter un objectif, un lieu, un exercice…),
// un bouton en haut de la page ramène à l'endroit d'où l'on vient, sans rien perdre (les brouillons sont gardés).
import { h } from './ui.js';
import { S, ACT, go, ls } from './state.js';

const KEY = 'sea:return';
const here = () => `${S.tab}/${S.sub?.[S.tab] || ''}`;
/** Retenir où revenir (libellé + « onglet/sous-page »). */
export function setReturn(label, to) { S.returnTo = { label: String(label).slice(0, 60), to: String(to), from: here(), at: Date.now() }; ls.set(KEY, S.returnTo); }
export function clearReturn() { S.returnTo = null; ls.del?.(KEY); ls.set(KEY, null); }
/** Barre « ‹ Retour à … », affichée partout sauf sur la page de retour elle-même (valable 2 h). */
export function returnBar() {
  const r = S.returnTo ?? (S.returnTo = ls.get(KEY, null));
  if (!r || Date.now() - (r.at || 0) > 2 * 3600000) return '';
  if (here() === r.to || here().startsWith(r.to + '/')) { clearReturn(); return ''; }
  return h`<div class="retbar"><button class="btn sm pri" data-act="navBack">‹ ${r.label}</button><button class="btn sm ic ghost" data-act="navDrop" aria-label="Ne pas revenir">✕</button></div>`;
}
ACT.navBack = () => { const r = S.returnTo; clearReturn(); if (!r) return; const [t, sub, ...rest] = r.to.split('/'); go(t, sub, rest.join('/') || undefined); window.scrollTo(0, 0); };
ACT.navDrop = () => { clearReturn(); import('./state.js').then((m) => m.render()); };
