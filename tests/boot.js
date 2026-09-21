// boot.js — appliqué avant l'affichage : thème et apparence de CET appareil (jamais de flash, jamais de bug clair/sombre).
(function () {
  var KEY = 'sea:appearance';
  var DEFAULTS = { mode: 'auto', palette: 'gres', accent: '', shape: 'squircle', radius: 'soft', size: 'm', density: 'normal', motion: 'on' };
  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function apply(a) {
    a = a || load();
    var root = document.documentElement;
    var dark = a.mode === 'dark' || (a.mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.mode = dark ? 'dark' : 'light';
    root.dataset.palette = a.palette; root.dataset.shape = a.shape; root.dataset.radius = a.radius;
    root.dataset.size = a.size; root.dataset.density = a.density; root.dataset.motion = a.motion;
    if (a.accent && /^#[0-9a-f]{6}$/i.test(a.accent)) {
      root.style.setProperty('--accent', a.accent);
      root.style.setProperty('--on-accent', luminance(a.accent) > 0.6 ? '#111' : '#fff');
    } else { root.style.removeProperty('--accent'); root.style.removeProperty('--on-accent'); }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#111214' : '#f5f3ef');
  }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} apply(a); }
  window.__sea = { load: load, apply: apply, save: save, DEFAULTS: DEFAULTS };
  apply();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (load().mode === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
})();
