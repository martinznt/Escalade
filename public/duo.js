// duo.js — séance à deux : un salon avec un code (ou un QR), chacun sur son téléphone, chronos synchronisés.
// Seules la position dans la séance et l'heure de fin du chrono circulent ; chacun garde ses propres séries.
import { h, raw, openSheet, closeSheet, toast, $ } from './ui.js';
import { S, ACT, SUBMIT, api } from './state.js';
import { startPlayer, applyDuo, duoSnapshot, setDuoHook } from './player.js';
import { qrSvg, shareUrl, clearPending } from './share.js';

const POLL = 2000;
let pollT = null;
const sig = (st) => (st ? [st.i, st.set, st.side, st.phase, Math.round(st.end / 500), st.total, st.paused ? 1 : 0, Math.round(st.remaining / 500)].join('|') : '');
/** Heure locale ↔ heure du serveur (le décalage est mesuré à chaque échange). */
const toServer = (st) => ({ ...st, end: st.end ? Math.round(st.end + S.duo.offset) : 0 });
const toLocal = (st) => ({ ...st, end: st.end ? Math.round(st.end - S.duo.offset) : 0 });
function measure(t0, serverNow) { const off = serverNow - (t0 + Date.now()) / 2; S.duo.offset = S.duo.offsetSet ? S.duo.offset * 0.7 + off * 0.3 : off; S.duo.offsetSet = true; }

function begin(r, host) {
  S.duo = { code: r.code, v: r.v || 1, host, members: r.members || [], offset: 0, offsetSet: false, sig: '', applying: false, lost: false, fails: 0 };
  clearInterval(pollT); pollT = setInterval(poll, POLL);
}
async function poll() {
  const d = S.duo; if (!d) return clearInterval(pollT);
  if (!S.player) return leave();
  if (d.busy || document.hidden) return;
  d.busy = true; const t0 = Date.now();
  try {
    const r = await api('GET', `/api/duo/${d.code}`, undefined, { timeout: 6000 });
    if (S.duo !== d) return;
    measure(t0, r.now); d.fails = 0;
    const was = d.members.join(','), lost = d.lost; d.lost = false; d.members = r.members || [];
    if (d.members.join(',') !== was && d.members.length > was.split(',').filter(Boolean).length) toast(`${d.members.at(-1)} a rejoint la séance`);
    if (r.v > d.v && !r.mine) { d.v = r.v; apply(r.state); }
    else { d.v = Math.max(d.v, r.v); if (lost || d.members.join(',') !== was) redraw(); }
  } catch (e) {
    if (S.duo !== d) return;
    if (e.status === 404 || e.status === 403) { toast('La séance à deux est terminée.'); S.duo = null; clearInterval(pollT); redraw(); return; }
    if (++d.fails >= 3 && !d.lost) { d.lost = true; redraw(); }
  } finally { d.busy = false; }
}
function redraw() { if (S.player) { const d = S.duo; if (d) d.applying = true; ACT.pRedraw?.(); if (d) { d.applying = false; d.sig = sig(duoSnapshot()); } } }
function apply(st) {
  const d = S.duo; d.applying = true;
  let r;
  try { r = applyDuo(toLocal(st)); } finally { d.applying = false; }
  d.sig = sig(duoSnapshot());
  if (r === 'done') toast(`${d.members[0] || 'Ton partenaire'} a terminé la séance.`);
}
async function push() {
  const d = S.duo, st = duoSnapshot(); if (!d || !st) return;
  const s = sig(st); if (s === d.sig) return;
  d.sig = s; const t0 = Date.now();
  try { const r = await api('PUT', `/api/duo/${d.code}`, { state: toServer(st) }, { timeout: 6000 }); if (S.duo === d) { measure(t0, r.now); d.v = Math.max(d.v, r.v); } }
  catch (e) { if (S.duo === d) { d.sig = ''; if (!d.lost) { d.lost = true; redraw(); } } }
}
setDuoHook((why) => {
  if (why === 'close') return leave();
  if (S.duo && !S.duo.applying) push();
});
async function leave() {
  const d = S.duo; S.duo = null; clearInterval(pollT);
  if (d) try { await api('DELETE', `/api/duo/${d.code}`, undefined, { timeout: 5000 }); } catch { /* le salon expire seul après 4 h */ }
}

/** Depuis la séance en cours : créer le salon et montrer le code. */
ACT.duoOpen = async () => {
  if (S.duo) return duoSheet();
  const p = S.player; if (!p) return;
  try {
    const t0 = Date.now(), r = await api('POST', '/api/duo', { session: p.s, state: {} });
    begin({ ...r, members: [] }, true); measure(t0, r.now); push(); duoSheet(); redraw();
  } catch (e) { toast(e.offline ? 'Connexion requise pour la séance à deux.' : e.message, 4500, 'bad'); }
};
function duoSheet() {
  const d = S.duo, url = shareUrl('duo', d.code);
  openSheet(h`<div class="sharesheet center"><h2>👥 Séance à deux</h2>
    <p class="small">Ton partenaire scanne ce code, ou tape le code dans Bibliothèque › Rejoindre.</p>
    <div class="qrbox">${raw(qrSvg(url))}</div><div class="duocode">${d.code}</div>
    <p class="tiny muted">${d.members.length ? `Connecté${d.members.length > 1 ? 's' : ''} : ${d.members.join(', ')}` : 'En attente…'} · Les chronos et le passage à la série suivante sont partagés ; chacun note ses propres répétitions et charges.</p>
    <div class="grid2"><button class="btn pri" data-act="closeSheet">Continuer</button><button class="btn danger" data-act="duoStop">Arrêter le mode à deux</button></div></div>`);
}
ACT.duoStop = async () => { closeSheet(); await leave(); redraw(); toast('Mode à deux arrêté. Ta séance continue.'); };

/** Rejoindre avec un code (ou un lien scanné). */
export async function duoJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) { toast('Le code fait 6 caractères.'); return; }
  if (S.player) { toast('Termine d’abord ta séance en cours.'); return; }
  try {
    const t0 = Date.now(), r = await api('POST', `/api/duo/${code}/join`);
    clearPending(); closeSheet();
    startPlayer(r.session, { fromGenerator: true });
    if (!S.player) return;
    begin(r, false); measure(t0, r.now);
    S.duo.v = r.v; apply(r.state);
    toast(r.members?.length ? `Avec ${r.members.join(', ')} : c’est parti` : 'Salon rejoint');
  } catch (e) { toast(e.guest ? 'La séance à deux demande un compte (gratuit).' : e.offline ? 'Connexion requise.' : e.message, 4500, 'bad'); }
}
ACT.duoJoinAsk = () => openSheet(h`<form class="sharesheet center" data-submit="duoJoin"><h2>👥 Rejoindre une séance</h2>
  <p class="small">Tape le code affiché sur le téléphone de ton partenaire.</p>
  <input name="code" class="duocode in" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="Code" required>
  <button class="btn pri big">Rejoindre</button></form>`);
SUBMIT.duoJoin = (f) => duoJoin(new FormData(f).get('code'));
ACT.duoJoinLink = (el) => duoJoin(el.dataset.code);
