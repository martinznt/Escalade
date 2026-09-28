// nav.js — « ‹ Retour à … » : quand un raccourci emmène ailleurs (ajouter un objectif, un lieu, un exercice…),
// un bouton en haut de la page ramène à l'endroit d'où l'on vient, sans rien perdre (les brouillons sont gardés).
import { h } from './ui.js';
import { S, ACT, go, ls, ctx, render } from './state.js';
import { hintsFor, hintState } from './hints.js';
import { globalHints } from './global.js';

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

/* Raccourcis contextuels (hints.js) : en haut de la page, 2 au plus, seulement quand ils servent. */
const OFF = 'sea:hints-off';
let shown = [];
export function hintsBar() {
  if (!S.user || S.lay || S.player) return '';
  const route = here(); let list = [];
  try { list = hintsFor(route, hintState(ctx(), { cp: S.sub?.library === 'climbplan' ? S.cp : null, seances: S.seances?.items?.filter((s) => !s.archived).length || 0 }), { off: ls.get(OFF, []) || [], extra: globalHints() }); } catch { list = []; }
  shown = list; if (!list.length) return '';
  return h`<div class="hints">${list.map((x, i) => h`<div class="hint"><button class="linkish grow" data-act="hintGo" data-i="${i}"><span>${x.icon}</span> ${x.text} <b class="acc-t">›</b></button><button class="btn sm ic ghost" data-act="hintOff" data-id="${x.id}" aria-label="Ne plus afficher ce conseil">✕</button></div>`)}</div>`;
}
ACT.hintGo = (el) => {
  const x = shown[Number(el.dataset.i)]; if (!x) return;
  const cur = `${S.tab}/${S.sub?.[S.tab] || ''}${S.param ? '/' + S.param : ''}`;
  if (x.go) { setReturn(x.back || 'Retour', cur); const [t, sub] = x.go.split('/'); go(t, sub); window.scrollTo(0, 0); }
  else if (x.act) ACT[x.act]?.({ dataset: {} });
};
ACT.hintOff = (el) => { const off = new Set(ls.get(OFF, []) || []); off.add(el.dataset.id); ls.set(OFF, [...off]); render(); };
