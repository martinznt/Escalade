// install.js — installation de l'application (PWA), sur tous les appareils.
// Android / ordinateur (Chrome, Edge, Samsung Internet…) : le navigateur propose souvent une vraie installation
// (« beforeinstallprompt ») : notre bouton la lance directement.
// Partout ailleurs (iPhone / iPad, Firefox, Safari sur Mac, navigateur intégré d'une autre app…), l'installation se fait
// par un menu du navigateur : installSteps() donne les gestes exacts pour CET appareil et CE navigateur.

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
  try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; } catch { return false; }
}
const nav = () => (typeof navigator === 'undefined' ? {} : navigator);
/**
 * Appareil et navigateur, d'après l'agent utilisateur (pure, testée). iPadOS se présente comme un Mac : on le
 * reconnaît à l'écran tactile. Les navigateurs intégrés aux autres apps (Instagram, Facebook, Gmail…) ne savent pas
 * installer : il faut ouvrir la page dans le vrai navigateur.
 */
export function deviceInfo(ua = nav().userAgent, platform = nav().platform, touch = nav().maxTouchPoints) {
  const u = String(ua || '');
  const ipad = /iPad/.test(u) || (platform === 'MacIntel' && Number(touch) > 1);
  const ios = ipad || /iPhone|iPod/.test(u), android = /Android/i.test(u);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|Pinterest|GSA\/|Twitter|; wv\)/i.test(u);
  let browser = ios
    ? (/CriOS/.test(u) ? 'chrome' : /FxiOS/.test(u) ? 'firefox' : /EdgiOS/.test(u) ? 'edge' : /OPiOS|OPT\//.test(u) ? 'opera' : 'safari')
    : /SamsungBrowser/.test(u) ? 'samsung' : /Edg(A|e)?\//.test(u) ? 'edge' : /OPR\/|Opera/.test(u) ? 'opera' : /Firefox\//.test(u) ? 'firefox' : /Chrome\//.test(u) ? 'chrome' : /Safari\//.test(u) ? 'safari' : 'other';
  if (inApp) browser = 'inapp';
  const os = ios ? (ipad ? 'ipad' : 'iphone') : android ? 'android' : /CrOS/.test(u) ? 'chromeos' : /Mac OS X|Macintosh/.test(u) ? 'mac' : /Windows/.test(u) ? 'windows' : /Linux/.test(u) ? 'linux' : 'other';
  return { os, browser, ios, android, mobile: ios || android };
}
export const isIOS = () => deviceInfo().ios;
/** Le navigateur a proposé l'installation directe (bouton « Installer » fonctionnel). */
export const canPrompt = () => !!deferred;
const NAMES = { safari: 'Safari', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', samsung: 'Samsung Internet', opera: 'Opera', inapp: 'le navigateur d’une autre app', other: 'ce navigateur' };
/**
 * Les gestes pour installer, selon l'appareil et le navigateur (pure, testée) :
 * { title, steps: [texte…], can: l'installation est possible ici, open: navigateur à utiliser sinon }.
 */
export function installSteps(info = deviceInfo()) {
  const { os, browser } = info, where = `${os === 'ipad' ? 'iPad' : os === 'iphone' ? 'iPhone' : os === 'android' ? 'Android' : 'ordinateur'} · ${NAMES[browser] || browser}`;
  if (browser === 'inapp') {
    const real = info.ios ? 'Safari' : 'Chrome';
    return { title: `Ouvre d’abord le site dans ${real}`, where, can: false, open: real, steps: [
      'Tu regardes le site dans le navigateur d’une autre application (Instagram, Facebook, Gmail…) : il ne permet pas d’installer.',
      `Touche le menu ⋯ (ou ⋮) de cette page, puis « Ouvrir dans ${real} » ${info.ios ? '(ou « Ouvrir dans le navigateur »)' : '(ou « Ouvrir dans le navigateur »)'}.`,
      'Si tu ne trouves pas : touche « Copier le lien » ci-dessous, ouvre ' + real + ' et colle le lien dans la barre d’adresse.',
      `Puis reviens sur ce bouton « Installer » : les gestes pour ${real} s’afficheront.`] };
  }
  if (info.ios) {
    if (browser === 'safari') return { title: os === 'ipad' ? 'Installer sur iPad (Safari)' : 'Installer sur iPhone (Safari)', where, can: true, steps: [
      os === 'ipad' ? 'Touche le bouton Partager (un carré avec une flèche vers le haut ⬆️), en haut à droite de l’écran.'
        : 'Touche le bouton Partager (un carré avec une flèche vers le haut ⬆️), en bas de l’écran. Si tu vois plutôt « ⋯ » à côté de l’adresse, touche « ⋯ » puis « Partager ».',
      'Fais glisser la liste vers le haut et touche « Sur l’écran d’accueil ». Pas dans la liste ? Touche « Modifier les actions… » tout en bas et ajoute-le.',
      'Laisse « Ouvrir comme app web » activé s’il apparaît, puis touche « Ajouter » en haut à droite.',
      'L’icône « Séances » est sur ton écran d’accueil : ouvre l’application depuis cette icône (les notifications marchent seulement depuis l’icône).'] };
    return { title: `Installer sur ${os === 'ipad' ? 'iPad' : 'iPhone'} (${NAMES[browser]})`, where, can: true, open: 'Safari', steps: [
      browser === 'chrome' ? 'Touche le bouton Partager ⬆️ à droite de la barre d’adresse (ou le menu ⋯ › « Partager »).' : 'Ouvre le menu du navigateur (⋯ ou ☰) et touche « Partager » ⬆️.',
      'Choisis « Sur l’écran d’accueil » (fais glisser la liste si besoin), puis « Ajouter ».',
      'Pas d’option « Sur l’écran d’accueil » ? Ton iPhone est peut-être trop ancien pour ce navigateur : ouvre le site dans Safari (« Copier le lien » ci-dessous) et suis les gestes de Safari.'] };
  }
  if (info.android) {
    if (browser === 'samsung') return { title: 'Installer sur Android (Samsung Internet)', where, can: true, steps: [
      'Touche l’icône d’installation dans la barre d’adresse si elle apparaît (une flèche vers le bas), puis « Installer ».',
      'Sinon : menu ☰ en bas à droite › « Ajouter la page à » › « Écran d’accueil ».',
      'L’icône « Séances » apparaît avec tes autres applications.'] };
    if (browser === 'firefox') return { title: 'Installer sur Android (Firefox)', where, can: true, steps: [
      'Touche le menu ⋮ (en haut ou en bas à droite).', 'Choisis « Installer » ou « Ajouter à l’écran d’accueil », puis confirme.', 'L’icône « Séances » apparaît sur ton écran d’accueil.'] };
    return { title: `Installer sur Android (${NAMES[browser] || 'Chrome'})`, where, can: true, steps: [
      'Touche le menu ⋮ en haut à droite.', 'Choisis « Installer l’application » (ou « Ajouter à l’écran d’accueil » › « Installer »).', 'L’application « Séances » apparaît avec tes autres applications, et s’ouvre en plein écran.'] };
  }
  if (browser === 'safari' && os === 'mac') return { title: 'Installer sur Mac (Safari)', where, can: true, steps: [
    'Dans la barre de menus : « Fichier » › « Ajouter au Dock… » (macOS Sonoma ou plus récent).', 'Confirme avec « Ajouter » : l’application s’ouvre ensuite depuis le Dock, dans sa propre fenêtre.',
    'Ancien macOS : utilise Chrome ou Edge pour installer, ou garde la page dans tes favoris.'] };
  if (browser === 'firefox') return { title: 'Firefox sur ordinateur', where, can: false, open: 'Chrome ou Edge', steps: [
    'Firefox ne sait pas installer les applications web sur ordinateur.', 'Ouvre ce site dans Chrome ou Edge (« Copier le lien » ci-dessous), puis touche « Installer » à nouveau.',
    'Sinon, ajoute simplement la page à tes favoris (Ctrl+D ou ⌘+D) : tout fonctionne aussi dans un onglet.'] };
  if (browser === 'edge') return { title: 'Installer sur ordinateur (Edge)', where, can: true, steps: [
    'Clique sur l’icône d’installation à droite de la barre d’adresse (un carré avec un ＋ ou une flèche).', 'Sinon : menu ⋯ › « Applications » › « Installer ce site en tant qu’application ».', 'L’application s’ouvre ensuite dans sa propre fenêtre, depuis le menu Démarrer ou le Dock.'] };
  if (browser === 'chrome' || browser === 'opera') return { title: `Installer sur ordinateur (${NAMES[browser]})`, where, can: true, steps: [
    'Clique sur l’icône d’installation à droite de la barre d’adresse (un écran avec une flèche vers le bas).', 'Sinon : menu ⋮ › « Caster, enregistrer et partager » › « Installer la page en tant qu’application… ».', 'L’application s’ouvre ensuite dans sa propre fenêtre, depuis le menu Démarrer, le Dock ou le lanceur d’applications.'] };
  return { title: 'Installer l’application', where, can: false, open: 'Chrome, Edge ou Safari', steps: [
    'Ce navigateur n’est pas reconnu. Le plus simple : ouvre le site dans Chrome ou Edge (ordinateur, Android) ou Safari (iPhone, iPad, Mac).', 'Puis touche « Installer » à nouveau : les gestes exacts s’afficheront.'] };
}
/** Faut-il proposer l'installation (bandeau sur l'accueil) ? Partout où c'est possible, sauf si déjà installée ou « Plus tard ». */
export function shouldOffer() {
  if (isInstalled()) return false;
  let until = 0; try { until = Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch { /* rien */ }
  if (Date.now() < until) return false;
  return canPrompt() || installSteps().can || deviceInfo().browser === 'inapp';
}
export function dismissInstall(days = 14) { try { localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400000)); } catch { /* rien */ } notify(); }
/** Lance l'installation directe si le navigateur la propose. Retourne 'accepted' | 'dismissed' | 'manual'. */
export async function promptInstall() {
  if (deferred) {
    const e = deferred; deferred = null;
    try { e.prompt(); const r = await e.userChoice; notify(); return r?.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch { notify(); return 'manual'; }
  }
  return 'manual';
}
