// boot.js — exécuté avant l'application : applique l'apparence de CET appareil (sans flash) et garantit
// qu'une erreur de démarrage n'affiche jamais un écran blanc (écran d'erreur identifiable + réparation).
(function () {
  var KEY = 'sea:appearance';
  var DEFAULTS = { mode: 'dark', palette: 'gres', accent: '', shape: 'squircle', radius: 'soft', size: 'm', density: 'normal', motion: 'on' };
  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function apply(a) {
    a = a || load();
    var root = document.documentElement;
    var dark = a.mode === 'dark' || (a.mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.mode = dark ? 'dark' : 'light';
    root.dataset.palette = a.palette; root.dataset.shape = a.shape; root.dataset.radius = a.radius;
    root.dataset.size = a.size; root.dataset.density = a.density; root.dataset.motion = a.motion;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#16110e' : '#f4efe9');
  }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* stockage indisponible */ } apply(a); }
  window.__sea = { load: load, apply: apply, save: save, DEFAULTS: DEFAULTS };
  apply();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (load().mode === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  /* ───── Écran d'erreur de démarrage ───── */
  var shown = false;
  function describe(err) {
    if (!err) return 'Erreur inconnue';
    if (typeof err === 'string') return err;
    if (err.target && err.target.tagName === 'SCRIPT') return 'Fichier introuvable ou illisible : ' + (err.target.src || 'script');
    return (err.message || String(err)).slice(0, 300);
  }
  function show(err) {
    if (shown || window.__seaStarted) return;
    shown = true;
    var render = function () {
      var app = document.getElementById('app'); if (!app) return;
      app.innerHTML = '';
      var box = document.createElement('div'); box.className = 'boot-error'; box.setAttribute('role', 'alert');
      var h = document.createElement('h1'); h.textContent = 'L’application n’a pas pu démarrer';
      var p = document.createElement('p'); p.textContent = 'Tes données enregistrées sur cet appareil ne sont pas perdues. Réessaie ; si le problème continue, vide le cache de l’application.';
      var code = document.createElement('pre'); code.textContent = 'Code : BOOT-FAIL · ' + describe(err);
      var b1 = document.createElement('button'); b1.className = 'btn pri'; b1.textContent = 'Recharger';
      b1.addEventListener('click', function () { location.reload(); });
      var b2 = document.createElement('button'); b2.className = 'btn'; b2.textContent = 'Vider le cache et recharger';
      b2.addEventListener('click', function () {
        var done = function () { location.reload(); };
        var jobs = [];
        try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) { /* rien */ }
        try { if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) { /* rien */ }
        Promise.all(jobs).then(done, done);
      });
      box.appendChild(h); box.appendChild(p); box.appendChild(code); box.appendChild(b1); box.appendChild(b2);
      app.appendChild(box);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
  }
  window.__seaFail = show;
  window.addEventListener('error', function (e) { if (!window.__seaStarted) show(e.error || e); }, true);
  window.addEventListener('unhandledrejection', function (e) { if (!window.__seaStarted) show(e.reason); });
  setTimeout(function () { if (!window.__seaStarted) show('Démarrage trop long (plus de 15 s). Vérifie ta connexion.'); }, 15000);
})();
