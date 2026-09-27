// reminders.js — rappels d'entraînement par notification, réglés ici (jours et heure), envoyés par le serveur.
import { h, toast } from './ui.js';
import { S, ACT, CHG, api, ls, render, item } from './state.js';
import { isInstalled, isIOS } from './install.js';

const KEY = 'sea:reminders', DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch { return 'Europe/Paris'; } };
const unb64u = (s) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
function prefs() {
  const saved = ls.get(KEY, null); if (saved) return saved;
  const prog = [...S.items.values()].find((it) => it.c === 'program' && !it.del && it.d.status === 'active');
  const per = Number(item('config', 'main')?.perWeek) || 3;
  return { on: false, days: prog ? prog.d.days.map(Number) : ({ 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 5] }[Math.min(4, per)] || [0, 2, 4]), hour: '18:00' };
}
async function subscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) { const { key } = await api('GET', '/api/push/key'); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) }); }
  return sub;
}
async function save(p) {
  ls.set(KEY, p);
  if (!p.on) return;
  const sub = await subscription(true);
  await api('POST', '/api/push/subscribe', { endpoint: sub.endpoint, days: p.days, hour: p.hour, tz: tz() });
}

export function remindersCard() {
  const p = prefs();
  let body;
  if (S.user?.guest) body = h`<p class="small muted">Crée un compte (gratuit) pour recevoir des rappels.</p>`;
  else if (!pushSupported()) body = h`<p class="small muted">${isIOS() && !isInstalled() ? 'Sur iPhone, installe d’abord l’application sur l’écran d’accueil : les rappels marchent ensuite.' : 'Ce navigateur ne gère pas les notifications.'}</p>`;
  else if (Notification.permission === 'denied') body = h`<p class="small warn-t">Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis reviens ici.</p>`;
  else body = h`<label class="chk"><input type="checkbox" data-change="remOn" ${p.on ? 'checked' : ''}> Me rappeler de m’entraîner</label>
    ${p.on ? h`<div class="chips days">${DAY_NAMES.map((d, i) => h`<button type="button" class="chip ${p.days.includes(i) ? 'on' : ''}" data-act="remDay" data-v="${i}">${d}</button>`)}</div>
      <div class="row"><label class="grow">À quelle heure ?<select data-change="remHour">${Array.from({ length: 33 }, (_, k) => { const m = 6 * 60 + k * 30, v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return h`<option value="${v}" ${p.hour === v ? 'selected' : ''}>${v.replace(':', ' h ')}</option>`; })}</select></label>
      <button class="btn sm" data-act="remTest">Tester</button></div>
      <p class="tiny muted">Si un programme est en cours, le rappel te dit quelle séance faire.</p>` : ''}`;
  return h`<div class="card"><h3>🔔 Rappels</h3>${body}</div>`;
}
CHG.remOn = async (el) => {
  const p = prefs();
  if (el.checked) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { el.checked = false; toast('Sans ton accord, le téléphone ne peut pas afficher les rappels.'); render(); return; }
    try { await save({ ...p, on: true }); toast('Rappels activés'); } catch (e) { ls.set(KEY, { ...p, on: false }); toast('Activation impossible : ' + (e.message || 'erreur'), 4500, 'bad'); }
  } else {
    ls.set(KEY, { ...p, on: false });
    try { const sub = await subscription(false); if (sub) { await api('DELETE', '/api/push/subscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch { /* déjà désabonné */ }
    toast('Rappels désactivés');
  }
  render();
};
ACT.remDay = async (el) => {
  const p = prefs(), d = Number(el.dataset.v), s = new Set(p.days); if (s.has(d)) s.delete(d); else s.add(d);
  try { await save({ ...p, days: [...s].sort() }); } catch (e) { toast(e.message, 4000, 'bad'); } render();
};
CHG.remHour = async (el) => { try { await save({ ...prefs(), hour: el.value }); toast(`Rappel à ${el.value.replace(':', ' h ')}`); } catch (e) { toast(e.message, 4000, 'bad'); } };
ACT.remTest = async () => {
  try { await save(prefs()); const r = await api('POST', '/api/push/test', {}); toast(r.sent ? 'Notification envoyée : elle arrive dans quelques secondes.' : 'Aucun appareil n’a pu être joint.', 4500); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
