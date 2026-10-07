// inbox.js — la boîte de notifications (icône 🔔) : toutes les mises à jour et à quoi elles servent,
// les réponses à tes propositions, et (administrateurs) les propositions à traiter. Pastille = non lus.
import { h, openSheet, closeSheet, fmtDay } from './ui.js';
import { S, ACT, api, ls, go, item, putItem, accountToken, accountMatches } from './state.js';
import { NEWS } from './news.js';
import { announcements } from './global.js';
import { startTour } from './tour.js';
import { beep } from './sound.js';

const SEEN = 'sea:inbox-seen';
const PROP_WHAT = { grading: 'Système de cotation', style: 'Style', exercise: 'Exercice', catalog: 'Séance prête', format: 'Format de séance', intent: 'Intention', category: 'Catégorie', idea: 'Idée' };
const t = (d) => new Date(d + 'T12:00:00').getTime();
function entries() {
  const out = NEWS.slice().reverse().map((n) => ({ id: 'v' + n.v, kind: 'update', at: t(n.date || '2026-09-27'), icon: '🆕', title: n.title || `Version ${n.v}`, text: n.why || '', v: n.v, steps: n.steps }));
  for (const p of S.inbox?.mine || []) if (p.status === 'done') out.push({ id: 'p' + p.id, kind: 'reply', at: p.reviewed_at || p.created_at, icon: /Accept/.test(p.reply) ? '✅' : '💬', title: `Ta proposition « ${p.label} »`, text: p.reply });
  // Annonces écrites par un administrateur, pour tout le monde
  for (const a of announcements()) out.push({ id: 'a' + a.id, kind: 'announce', at: a.at, icon: a.emoji || '📣', title: a.title, text: a.body || '' });
  // Administrateurs : une notification par idée proposée ; un toucher mène à l'endroit d'où elle vient.
  if (S.user?.isAdmin) for (const p of S.inbox?.adminList || []) out.push({ id: 'i' + p.id, kind: 'admin', propId: p.id, at: p.created_at, icon: '💡', title: `${p.username || 'Quelqu’un'} propose : ${p.label}`, text: `${PROP_WHAT[p.kind] || 'Idée'}${p.detail ? ' · « ' + p.detail.slice(0, 120) + ' »' : ''}` });
  return out.sort((a, b) => (b.kind === 'admin') - (a.kind === 'admin') || b.at - a.at); // les idées à traiter en premier
}
// « Vu » se coche notification par notification ; la liste suit le compte (item config « inbox »).
// L'ancienne date « tout lu jusqu'à » (sur l'appareil) compte toujours : ce qui était lu le reste.
const seenIds = () => item('config', 'inbox')?.seenIds || [];
// L'ancienne date « tout lu jusqu'à » ne vaut que pour les mises à jour : une idée ou une réponse arrivée après reste nouvelle.
const isSeen = (e, ids = seenIds(), before = ls.get(SEEN, 0)) => ids.includes(e.id) || (e.kind === 'update' && e.at <= before);
function setSeen(ids, seen) {
  const cur = new Set(seenIds());
  for (const id of ids) { if (seen) cur.add(id); else cur.delete(id); }
  putItem('config', 'inbox', { seenIds: [...cur].slice(-200) });
  if (!seen) { const before = ls.get(SEEN, 0), list = entries().filter((e) => ids.includes(e.id) && e.at <= before); if (list.length) ls.set(SEEN, Math.min(...list.map((e) => e.at)) - 1); } // « non vue » l'emporte sur l'ancienne date
}
export function unreadCount() { const ids = seenIds(), before = ls.get(SEEN, 0); return entries().filter((e) => !isSeen(e, ids, before)).length; }
let inboxRequest = 0;
export async function refreshInbox({ sound = false } = {}) {
  if (!S.user || S.user.guest) { S.notifUnread = 0; return false; }
  const token = accountToken(), request = ++inboxRequest;
  const before = S.notifUnread || 0;
  try {
    const [mine, adm] = await Promise.all([api('GET', '/api/proposals/mine').catch(() => null), S.user.isAdmin ? api('GET', '/api/admin/proposals').catch(() => null) : null]);
    if (!accountMatches(token) || request !== inboxRequest) return false;
    S.inbox = { mine: mine?.proposals || S.inbox?.mine || [], adminList: S.user.isAdmin ? adm?.proposals || S.inbox?.adminList || [] : [] };
  } catch { /* hors ligne */ }
  if (!accountMatches(token) || request !== inboxRequest) return false;
  if (!ls.get(SEEN, null)) ls.set(SEEN, Math.min(Date.now(), Math.max(...NEWS.map((n) => t(n.date || '2026-09-27')))) - 1); // premier passage : seulement la dernière version
  S.notifUnread = unreadCount();
  if (sound && S.notifUnread > before && (S.settings.notifSound || 'doux') !== 'aucun') beep(880, 160, S.settings.notifSound || 'doux');
  paintBadge();
  return true;
}
/** Met à jour seulement la pastille de l'icône 🔔 (sans redessiner la page : une saisie en cours n'est pas perdue). */
function paintBadge() {
  for (const b of document.querySelectorAll('.topicons [data-act=notifOpen]')) {
    b.querySelector('.badge-dot')?.remove();
    const n = S.notifUnread || 0;
    if (n) { const i = document.createElement('i'); i.className = 'badge-dot'; i.textContent = n > 9 ? '9+' : String(n); b.appendChild(i); }
  }
}
function row(e, seen) {
  return h`<div class="nitem ${seen ? 'seen' : 'unread'}"><span class="nic">${e.icon}</span><div class="grow"><div class="row between"><b>${e.title}</b>${seen ? '' : h`<span class="tag acc">Nouveau</span>`}</div>
    ${seen ? '' : h`<div class="small">${e.text}</div>`}
    ${e.kind === 'update' ? h`<div class="row wrapf"><button class="btn sm ${seen ? '' : 'pri'}" data-act="notifTour" data-v="${e.v}">Voir la visite</button></div><details class="how mini"><summary>${seen ? 'Revoir' : 'Ce qui a changé'} (${e.steps.length})</summary>${seen ? h`<div class="small">${e.text}</div>` : ''}<ul class="small">${e.steps.map((st) => h`<li><b>${st[3]}</b> : ${st[4]}</li>`)}</ul></details>` : ''}
    ${e.kind === 'admin' ? h`<button class="btn sm pri" data-act="propOpen" data-id="${e.propId}">Voir et décider</button>` : ''}
    <div class="row between"><span class="tiny muted">${fmtDay(e.at)}</span>${seen ? h`<button class="btn sm ghost nseen" data-act="notifSeen" data-id="${e.id}" data-v="0" aria-label="Marquer comme non vue">↺ Non vue</button>` : h`<button class="btn sm nseen" data-act="notifSeen" data-id="${e.id}" data-v="1" aria-label="Marquer comme vue">✓ Vu</button>`}</div></div></div>`;
}
function inboxView() {
  const ids = seenIds(), before = ls.get(SEEN, 0), list = entries();
  const fresh = list.filter((e) => !isSeen(e, ids, before)), old = list.filter((e) => isSeen(e, ids, before));
  return h`<div class="inbox"><div class="row between"><h2>Notifications</h2><button class="btn sm ghost" data-act="notifSettings">Réglages</button></div>
    <div class="row between"><span class="kicker">Nouvelles${fresh.length ? ` (${fresh.length})` : ''}</span>${fresh.length > 1 ? h`<button class="btn sm ghost" data-act="notifAllSeen">✓ Tout marquer comme vu</button>` : ''}</div>
    ${fresh.length ? fresh.map((e) => row(e, false)) : h`<p class="small muted">Rien de nouveau. Tout est vu 👍</p>`}
    ${old.length ? h`<details class="oldn" ${fresh.length ? '' : 'open'}><summary class="kicker">Déjà vues (${old.length})</summary>${old.map((e) => row(e, true))}</details>` : ''}</div>`;
}
function repaint() {
  S.notifUnread = unreadCount(); paintBadge();
  const box = document.querySelector('#sheet .inbox'); if (box) box.outerHTML = inboxView().s;
}
export function refreshAnnouncements() { repaint(); }
ACT.notifOpen = () => {
  openSheet(inboxView(), { wide: true }); S.notifUnread = unreadCount(); paintBadge();
  const token = accountToken(), panel = document.querySelector('#sheet .inbox');
  return refreshInbox().then((updated) => { if (updated && accountMatches(token) && document.querySelector('#sheet .inbox') === panel) repaint(); });
};
ACT.notifSeen = (el) => { setSeen([el.dataset.id], el.dataset.v === '1'); repaint(); };
ACT.notifAllSeen = () => { setSeen(entries().map((e) => e.id), true); repaint(); };
ACT.notifTour = (el) => { const n = NEWS.find((x) => x.v === el.dataset.v); closeSheet(); if (n) setTimeout(() => startTour({ steps: n.steps }), 150); };
ACT.notifAdmin = () => { closeSheet(); go('settings', 'admin'); };
ACT.notifSettings = () => { closeSheet(); go('settings', 'notifs'); };
