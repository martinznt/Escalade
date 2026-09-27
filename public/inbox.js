// inbox.js — la boîte de notifications (icône 🔔) : toutes les mises à jour et à quoi elles servent,
// les réponses à tes propositions, et (administrateurs) les propositions à traiter. Pastille = non lus.
import { h, openSheet, closeSheet, fmtDay } from './ui.js';
import { S, ACT, api, ls, go } from './state.js';
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
export function unreadCount() { const seen = ls.get(SEEN, 0); return entries().filter((e) => e.at > seen).length; }
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
ACT.notifOpen = () => {
  const seen = ls.get(SEEN, 0), list = entries();
  openSheet(h`<div class="inbox"><div class="row between"><h2>🔔 Notifications</h2><button class="btn sm ghost" data-act="notifSettings">Réglages</button></div>
    ${list.map((e) => h`<div class="nitem ${e.at > seen ? 'unread' : ''}"><span class="nic">${e.icon}</span><div class="grow"><b>${e.title}</b><div class="small">${e.text}</div>
      ${e.kind === 'update' ? h`<details class="how mini"><summary>Ce qui a changé (${e.steps.length})</summary><ul class="small">${e.steps.map((s) => h`<li><b>${s[3]}</b> : ${s[4]}</li>`)}</ul><button class="btn sm" data-act="notifTour" data-v="${e.v}">🧭 Faire la visite</button></details>` : ''}
      ${e.kind === 'admin' ? h`<button class="btn sm" data-act="notifAdmin">Voir les propositions</button>` : ''}
      <div class="tiny muted">${fmtDay(e.at)}</div></div>${e.at > seen ? h`<i class="udot" aria-label="non lu"></i>` : ''}</div>`)}</div>`, { wide: true });
  ls.set(SEEN, Date.now()); S.notifUnread = 0; paintBadge();
};
ACT.notifTour = (el) => { const n = NEWS.find((x) => x.v === el.dataset.v); closeSheet(); if (n) setTimeout(() => startTour({ steps: n.steps }), 150); };
ACT.notifAdmin = () => { closeSheet(); go('settings', 'admin'); };
ACT.notifSettings = () => { closeSheet(); go('settings', 'notifs'); };
