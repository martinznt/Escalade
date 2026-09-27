// inbox.js — la boîte de notifications (icône 🔔) : toutes les mises à jour et à quoi elles servent,
// les réponses à tes propositions, et (administrateurs) les propositions à traiter. Pastille = non lus.
import { h, openSheet, closeSheet, fmtDay } from './ui.js';
import { S, ACT, api, ls, go, item, putItem } from './state.js';
import { NEWS } from './news.js';
import { startTour } from './tour.js';
import { beep } from './sound.js';

const SEEN = 'sea:inbox-seen';
const t = (d) => new Date(d + 'T12:00:00').getTime();
function entries() {
  const out = NEWS.slice().reverse().map((n) => ({ id: 'v' + n.v, kind: 'update', at: t(n.date || '2026-09-27'), icon: '🆕', title: n.title || `Version ${n.v}`, text: n.why || '', v: n.v, steps: n.steps }));
  for (const p of S.inbox?.mine || []) if (p.status === 'done') out.push({ id: 'p' + p.id, kind: 'reply', at: p.reviewed_at || p.created_at, icon: /Accept/.test(p.reply) ? '✅' : '💬', title: `Ta proposition « ${p.label} »`, text: p.reply });
  if (S.user?.isAdmin && S.inbox?.adminOpen) out.push({ id: 'a' + S.inbox.adminOpen, kind: 'admin', at: S.inbox.adminAt || Date.now(), icon: '📬', title: `${S.inbox.adminOpen} proposition${S.inbox.adminOpen > 1 ? 's' : ''} à traiter`, text: 'Des utilisateurs proposent des intentions ou des idées.' });
  return out.sort((a, b) => b.at - a.at);
}
// « Vu » se coche notification par notification ; la liste suit le compte (item config « inbox »).
// L'ancienne date « tout lu jusqu'à » (sur l'appareil) compte toujours : ce qui était lu le reste.
const seenIds = () => item('config', 'inbox')?.seenIds || [];
const isSeen = (e, ids = seenIds(), before = ls.get(SEEN, 0)) => ids.includes(e.id) || e.at <= before;
function setSeen(ids, seen) {
  const cur = new Set(seenIds());
  for (const id of ids) { if (seen) cur.add(id); else cur.delete(id); }
  putItem('config', 'inbox', { seenIds: [...cur].slice(-200) });
  if (!seen) { const before = ls.get(SEEN, 0), list = entries().filter((e) => ids.includes(e.id) && e.at <= before); if (list.length) ls.set(SEEN, Math.min(...list.map((e) => e.at)) - 1); } // « non vue » l'emporte sur l'ancienne date
}
export function unreadCount() { const ids = seenIds(), before = ls.get(SEEN, 0); return entries().filter((e) => !isSeen(e, ids, before)).length; }
export async function refreshInbox({ sound = false } = {}) {
  if (!S.user || S.user.guest) { S.notifUnread = 0; return; }
  const before = S.notifUnread || 0;
  try {
    const [mine, adm] = await Promise.all([api('GET', '/api/proposals/mine').catch(() => null), S.user.isAdmin ? api('GET', '/api/admin/proposals').catch(() => null) : null]);
    S.inbox = { mine: mine?.proposals || S.inbox?.mine || [], adminOpen: adm ? adm.proposals.length : 0, adminAt: adm?.proposals?.[0]?.created_at || 0 };
  } catch { /* hors ligne */ }
  if (!ls.get(SEEN, null)) ls.set(SEEN, Math.max(...NEWS.map((n) => t(n.date || '2026-09-27'))) - 1); // premier passage : seulement la dernière version
  S.notifUnread = unreadCount();
  if (sound && S.notifUnread > before && (S.settings.notifSound || 'doux') !== 'aucun') beep(880, 160, S.settings.notifSound || 'doux');
  paintBadge();
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
    ${e.kind === 'update' ? h`<details class="how mini"><summary>${seen ? 'Revoir' : 'Ce qui a changé'} (${e.steps.length})</summary>${seen ? h`<div class="small">${e.text}</div>` : ''}<ul class="small">${e.steps.map((st) => h`<li><b>${st[3]}</b> : ${st[4]}</li>`)}</ul><button class="btn sm" data-act="notifTour" data-v="${e.v}">🧭 Faire la visite</button></details>` : ''}
    ${e.kind === 'admin' ? h`<button class="btn sm" data-act="notifAdmin">Voir les propositions</button>` : ''}
    <div class="row between"><span class="tiny muted">${fmtDay(e.at)}</span>${seen ? h`<button class="btn sm ghost nseen" data-act="notifSeen" data-id="${e.id}" data-v="0" aria-label="Marquer comme non vue">↺ Non vue</button>` : h`<button class="btn sm nseen" data-act="notifSeen" data-id="${e.id}" data-v="1" aria-label="Marquer comme vue">✓ Vu</button>`}</div></div></div>`;
}
function inboxView() {
  const ids = seenIds(), before = ls.get(SEEN, 0), list = entries();
  const fresh = list.filter((e) => !isSeen(e, ids, before)), old = list.filter((e) => isSeen(e, ids, before));
  return h`<div class="inbox"><div class="row between"><h2>🔔 Notifications</h2><button class="btn sm ghost" data-act="notifSettings">Réglages</button></div>
    <div class="row between"><span class="kicker">Nouvelles${fresh.length ? ` (${fresh.length})` : ''}</span>${fresh.length > 1 ? h`<button class="btn sm ghost" data-act="notifAllSeen">✓ Tout marquer comme vu</button>` : ''}</div>
    ${fresh.length ? fresh.map((e) => row(e, false)) : h`<p class="small muted">Rien de nouveau. Tout est vu 👍</p>`}
    ${old.length ? h`<details class="oldn" ${fresh.length ? '' : 'open'}><summary class="kicker">Déjà vues (${old.length})</summary>${old.map((e) => row(e, true))}</details>` : ''}</div>`;
}
function repaint() {
  S.notifUnread = unreadCount(); paintBadge();
  const box = document.querySelector('#sheet .inbox'); if (box) box.outerHTML = inboxView().s;
}
ACT.notifOpen = () => { openSheet(inboxView(), { wide: true }); S.notifUnread = unreadCount(); paintBadge(); };
ACT.notifSeen = (el) => { setSeen([el.dataset.id], el.dataset.v === '1'); repaint(); };
ACT.notifAllSeen = () => { setSeen(entries().map((e) => e.id), true); repaint(); };
ACT.notifTour = (el) => { const n = NEWS.find((x) => x.v === el.dataset.v); closeSheet(); if (n) setTimeout(() => startTour({ steps: n.steps }), 150); };
ACT.notifAdmin = () => { closeSheet(); go('settings', 'admin'); };
ACT.notifSettings = () => { closeSheet(); go('settings', 'notifs'); };
