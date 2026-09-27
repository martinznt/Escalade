// move.js — déménagement vers la nouvelle adresse du site.
// Sur l'ancienne adresse : on emporte ce qui n'existe que sur cet appareil (réglages, données en attente d'envoi,
// données du mode invité) et la connexion, puis on redirige. Si le transfert échoue, on reste sur l'ancienne adresse :
// rien n'est perdu. Sur la nouvelle adresse : la personne confirme, puis tout est remis en place.
import { h } from './ui.js';
import { ls, idb, GUEST } from './state.js';
import { isInstalled } from './install.js';

const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Erreur ' + r.status), { status: r.status });
  return j;
};
const screen = (html) => { const app = document.getElementById('app'); if (app) app.innerHTML = h`<main class="move"><div class="card hero center">${html}</div></main>`.s; };

/** Ancienne adresse : retourne true si la redirection est lancée (le démarrage normal doit alors s'arrêter). */
export async function maybeMove() {
  if (!/\.workers\.dev$/.test(location.hostname)) return false;
  let to = null;
  try { const r = await fetch('/api/move', { cache: 'no-store' }); if (r.ok) to = (await r.json()).to; } catch { return false; } // hors ligne : on reste ici
  if (!to) return false;
  const app = isInstalled();
  if (app) {
    // Ancienne application installée : elle ne peut pas changer d'adresse toute seule → on explique comment réinstaller.
    window.__seaStarted = true;
    screen(h`<div class="move-ic">📲</div><h1>L’application a une nouvelle adresse</h1>
      <ol class="move-steps"><li>Touche <b>« Ouvrir la nouvelle adresse »</b> : ton compte et tes données suivent.</li>
        <li>Là-bas, touche <b>« 📲 Installer »</b> pour avoir la nouvelle application.</li>
        <li>Supprime cette ancienne icône : <b>appui long</b> dessus › <b>Désinstaller</b>.</li></ol>
      <button class="btn pri big" id="mv-go">Ouvrir la nouvelle adresse</button><p class="tiny muted" id="mv-err"></p>`);
    await new Promise((res) => document.getElementById('mv-go')?.addEventListener('click', res, { once: true }));
  }
  screen(h`<div class="move-ic">📦</div><h1>Le site déménage…</h1><p>On emporte tes données vers la nouvelle adresse.</p>`);
  const user = ls.get('sea:user'), local = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('sea:') && k !== 'sea:user' && (user?.guest || !k.startsWith('sea:data:'))) local[k] = localStorage.getItem(k);
    }
  } catch { /* stockage indisponible */ }
  let target = to + '/' + (app ? '?from=app' : '');
  if (user || Object.keys(local).length) {
    let snap = null;
    if (user?.guest) { try { snap = await idb.get('data:guest'); } catch { /* repli : données dans localStorage */ } }
    try { target += (app ? '&' : '?') + 'handoff=' + encodeURIComponent((await post('/api/handoff', { ls: local, guest: !!user?.guest, snap })).code); }
    catch (e) {
      console.error('Déménagement impossible pour l’instant', e);
      if (app) { screen(h`<div class="move-ic">📶</div><h1>Pas de connexion</h1><p>Connecte-toi à Internet puis réessaie : rien n’est perdu.</p><button class="btn pri big" id="mv-retry">Réessayer</button>`); document.getElementById('mv-retry')?.addEventListener('click', () => location.reload(), { once: true }); return true; }
      return false; // on reste sur l'ancienne adresse
    }
  }
  location.replace(target + location.hash);
  return true;
}

/** Nouvelle adresse : reprend ce qui vient de l'ancienne (après confirmation). Retourne true si la page se recharge. */
export async function maybeClaim() {
  const q = new URLSearchParams(location.search), code = q.get('handoff');
  if (q.get('from') === 'app') ls.set('sea:reinstall', 1); // venu de l'ancienne application : proposer de réinstaller
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  if (!code) return;
  if (ls.get('sea:user')) return; // déjà utilisé ici : on ne remplace rien
  let info;
  try { info = await post('/api/handoff/peek', { code }); } catch { return; }
  const who = info.username ? h`Continuer avec le compte <b>« ${info.username} »</b>` : info.guest ? 'Récupérer mes données' : 'Continuer';
  screen(h`<div class="move-ic">🏡</div><h1>Nouvelle adresse !</h1>
    <p>Le site s’appelle maintenant <b>${location.host}</b>. Pense à l’ajouter à tes favoris${'serviceWorker' in navigator ? ' ou à réinstaller l’application' : ''}.</p>
    <button class="btn pri big" id="mv-ok">${who}</button><button class="btn ghost" id="mv-no">Non merci</button>`);
  window.__seaStarted = true; // l'écran attend un choix : pas d'alerte « démarrage trop long »
  const ok = await new Promise((res) => {
    document.getElementById('mv-ok')?.addEventListener('click', () => res(true), { once: true });
    document.getElementById('mv-no')?.addEventListener('click', () => res(false), { once: true });
  });
  if (!ok) return;
  let r;
  try { r = await post('/api/handoff/claim', { code }); } catch (e) { console.error('Transfert impossible', e); return; }
  for (const [k, v] of Object.entries(r.ls || {})) if (/^sea:/.test(k) && k !== 'sea:user' && typeof v === 'string') { try { localStorage.setItem(k, v); } catch { /* plein */ } }
  if (r.user) ls.set('sea:user', { id: r.user.id, username: r.user.username, isAdmin: !!r.user.isAdmin });
  else if (r.guest) {
    if (r.snap) { try { await idb.set('data:guest', r.snap); } catch { ls.set('sea:data:guest', r.snap); } }
    ls.set('sea:user', { ...GUEST });
  }
  location.reload(); // redémarre avec les réglages repris (thème, couleurs…) appliqués dès le premier affichage
  return true;
}
