// install.js — installation de l'application (PWA).
// Android / ordinateur (Chrome, Edge, Samsung Internet…) : le navigateur propose une vraie installation
// (l'application apparaît dans la liste des applications, s'ouvre en plein écran, sans barre d'adresse).
// On capte l'événement « beforeinstallprompt » pour l'afficher au bon moment, avec notre propre bouton.
// iPhone / iPad : Apple ne permet pas l'installation automatique ; on explique les 2 gestes dans Safari.

let deferred = null;
const listeners = new Set();
const notify = () => { for (const fn of listeners) try { fn(); } catch { /* rien */ } };
const DISMISS_KEY = 'sea:install-dismissed';

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('sea:installed', '1'); } catch { /* rien */ } notify(); });
}

export const onInstallChange = (fn) => { listeners.add(fn); };
/** L'application tourne déjà comme application installée (plein écran). */
export function isInstalled() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; } catch { return false; }
}
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Le navigateur a proposé l'installation directe (bouton « Installer » fonctionnel). */
export const canPrompt = () => !!deferred;
/** Faut-il proposer l'installation (bandeau) ? */
export function shouldOffer() {
  if (isInstalled()) return false;
  let until = 0; try { until = Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch { /* rien */ }
  if (Date.now() < until) return false;
  return canPrompt() || isIOS();
}
export function dismissInstall(days = 14) { try { localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400000)); } catch { /* rien */ } notify(); }
/** Lance l'installation. Retourne 'accepted' | 'dismissed' | 'ios' | 'unavailable'. */
export async function promptInstall() {
  if (deferred) {
    const e = deferred; deferred = null;
    try { e.prompt(); const r = await e.userChoice; notify(); return r?.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch { notify(); return 'unavailable'; }
  }
  return isIOS() ? 'ios' : 'unavailable';
}
