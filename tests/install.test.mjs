// tests/install.test.mjs — installer l'application : l'appareil et le navigateur sont reconnus, et les gestes affichés
// sont ceux de CET appareil (iPhone, iPad, Android, ordinateur, navigateur intégré d'une autre app…).
import assert from 'node:assert/strict';
const { deviceInfo, installSteps } = await import('../public/install.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  ipadDesk: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 341.0.0.0 (iPhone14,5; iOS 17_5; fr_FR)',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
  facebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
const info = (k, platform = '', touch = 0) => deviceInfo(UA[k], platform, touch);
const steps = (k, platform, touch) => installSteps(info(k, platform, touch));

console.log('Installation');
ok('appareil et navigateur reconnus (iPadOS déguisé en Mac compris)', () => {
  const pick = (k, p, t) => { const i = info(k, p, t); return `${i.os}/${i.browser}`; };
  assert.equal(pick('iphone'), 'iphone/safari'); assert.equal(pick('ipadDesk', 'MacIntel', 5), 'ipad/safari'); assert.equal(pick('macSafari', 'MacIntel', 0), 'mac/safari');
  assert.equal(pick('chromeIos'), 'iphone/chrome'); assert.equal(pick('instagram'), 'iphone/inapp'); assert.equal(pick('android'), 'android/chrome');
  assert.equal(pick('samsung'), 'android/samsung'); assert.equal(pick('firefoxAndroid'), 'android/firefox'); assert.equal(pick('facebook'), 'android/inapp');
  assert.equal(pick('winChrome'), 'windows/chrome'); assert.equal(pick('winEdge'), 'windows/edge'); assert.equal(pick('winFirefox'), 'windows/firefox'); assert.equal(pick('chromebook'), 'chromeos/chrome');
});
ok('iPhone (Safari) : bouton Partager en bas (ou « ⋯ » d’abord), « Sur l’écran d’accueil », puis « Ajouter »', () => {
  const s = steps('iphone'), t = s.steps.join(' ');
  assert.equal(s.can, true); assert.match(t, /Partager[\s\S]*en bas[\s\S]*⋯[\s\S]*Sur l’écran d’accueil[\s\S]*Ajouter/); assert.match(t, /Modifier les actions/, 'si l’option est cachée');
  assert.match(steps('ipadDesk', 'MacIntel', 5).steps[0], /en haut à droite/, 'iPad : en haut');
});
ok('iPhone avec Chrome, et navigateur intégré d’une app : le bon chemin, ou ouvrir dans Safari avec le lien à copier', () => {
  assert.match(steps('chromeIos').steps.join(' '), /barre d’adresse[\s\S]*Sur l’écran d’accueil[\s\S]*Safari/);
  const ia = steps('instagram'); assert.equal(ia.can, false); assert.equal(ia.open, 'Safari'); assert.match(ia.steps.join(' '), /Ouvrir dans Safari[\s\S]*Copier le lien/);
  const fb = steps('facebook'); assert.equal(fb.open, 'Chrome');
});
ok('Android : Chrome (⋮ › Installer), Samsung Internet (☰ › Ajouter la page à), Firefox (⋮ › Installer)', () => {
  assert.match(steps('android').steps.join(' '), /⋮[\s\S]*Installer l’application/);
  assert.match(steps('samsung').steps.join(' '), /☰[\s\S]*Ajouter la page à[\s\S]*Écran d’accueil/);
  assert.match(steps('firefoxAndroid').steps.join(' '), /⋮[\s\S]*Installer/);
});
ok('ordinateur : Chrome / Edge (icône de la barre d’adresse), Mac Safari (Ajouter au Dock), Firefox (honnête : pas possible)', () => {
  assert.match(steps('winChrome').steps.join(' '), /barre d’adresse[\s\S]*Installer la page en tant qu’application/);
  assert.match(steps('winEdge').steps.join(' '), /Applications[\s\S]*Installer ce site/);
  assert.match(steps('macSafari', 'MacIntel', 0).steps.join(' '), /Fichier[\s\S]*Ajouter au Dock/);
  const ff = steps('winFirefox'); assert.equal(ff.can, false); assert.match(ff.steps.join(' '), /ne sait pas installer[\s\S]*Chrome ou Edge/);
});
ok('aucun cas sans gestes, ni texte cassé', () => {
  for (const k of Object.keys(UA)) for (const [p, t] of [['', 0], ['MacIntel', 5]]) {
    const s = steps(k, p, t); assert.ok(s.title && s.where && s.steps.length >= 2, k);
    for (const x of [s.title, s.where, ...s.steps]) assert.ok(!/undefined|null|NaN/.test(x), `${k} : ${x}`);
  }
  assert.ok(installSteps(deviceInfo('')).steps.length >= 2, 'navigateur inconnu : un conseil quand même');
});
console.log(`\n${n} tests d’installation OK`);
