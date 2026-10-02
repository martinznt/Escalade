// share.js — partager une séance par lien ou QR code (le QR est dessiné ici, sans service extérieur).
import qrcode from './qr.js';
import { h, raw, openSheet, toast, $ } from './ui.js';
import { ACT, ls } from './state.js';

/** QR code en SVG (noir sur blanc, marge de 4 modules comme le veut la norme). Texte ASCII (liens). */
export function qrSvg(text, margin = 4) {
  const q = qrcode(0, 'M'); q.addData(String(text)); q.make();
  const n = q.getModuleCount(), N = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${N} ${N}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${N}" height="${N}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
export const shareUrl = (kind, id) => `${location.origin}/#/${kind}/${encodeURIComponent(id)}`;

/** Feuille « lien + QR code ». */
export function linkSheet(id, name) {
  const url = shareUrl('s', id);
  openSheet(h`<div class="sharesheet center"><h2>Partager « ${name} »</h2>
    <div class="qrbox">${raw(qrSvg(url))}</div>
    <p class="small">Ton ami scanne le code avec son appareil photo, ou ouvre le lien. Il garde sa propre copie.</p>
    <input class="linkbox" readonly value="${url}" aria-label="Lien de la séance" id="shLink">
    <div class="grid2"><button class="btn pri" data-act="shCopy" data-url="${url}">Copier le lien</button>${navigator.share ? h`<button class="btn" data-act="shNative" data-url="${url}" data-name="${name}">Envoyer…</button>` : h`<button class="btn" data-act="closeSheet">Fermer</button>`}</div>
    <p class="tiny muted">Tes notes et tes charges ne partent pas. Pour couper le lien : Profil › Partage › Mes liens de partage.</p></div>`);
}
ACT.shShow = (el) => linkSheet(el.dataset.id, el.dataset.name || 'Séance');
ACT.shCopy = async (el) => {
  try { await navigator.clipboard.writeText(el.dataset.url); toast('Lien copié'); }
  catch { const i = $('#shLink'); i?.select(); toast('Sélectionne le lien pour le copier'); }
};
ACT.shNative = async (el) => {
  try { await navigator.share({ title: el.dataset.name || 'Séance', url: el.dataset.url }); }
  catch (e) { if (e?.name !== 'AbortError') toast('Envoi impossible : copie le lien à la place.'); }
};

/* Arrivée par un lien (#/s/ID ou #/duo/CODE) : on le garde de côté le temps de se connecter. */
export function catchLink() {
  const m = (location.hash || '').match(/^#\/(s|duo|group)\/([\w-]{1,64})$/);
  if (!m) return false;
  ls.set('sea:pending', { kind: m[1], id: decodeURIComponent(m[2]), at: Date.now() });
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}
export function pendingLink() { const p = ls.get('sea:pending'); return p && p.id && Date.now() - (p.at || 0) < 86400000 ? p : null; }
export const clearPending = () => ls.del('sea:pending');
