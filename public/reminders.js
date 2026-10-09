// reminders.js — rappels d'entraînement par notification, réglés ici (jours et heure), envoyés par le serveur.
import { h, toast } from './ui.js';
import { S, ACT, CHG, api, ls, own, render, item } from './state.js';
import { isInstalled, isIOS } from './install.js';

const KEY = 'sea:reminders', DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch { return 'Europe/Paris'; } };
const unb64u = (s) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
function prefs() {
  const saved = own.get(KEY, null, { legacy: 'keep' }); if (saved) return { types: ['reminder', 'update', 'reply', 'admin'], silent: false, ...saved };
  const prog = [...S.items.values()].find((it) => it.c === 'program' && !it.del && it.d.status === 'active');
  const per = Number(item('config', 'main')?.perWeek) || 3;
  return { on: false, days: prog ? prog.d.days.map(Number) : ({ 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 5] }[Math.min(4, per)] || [0, 2, 4]), hour: '18:00', types: ['reminder', 'update', 'reply', 'admin'], silent: false };
}
async function subscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) { const { key } = await api('GET', '/api/push/key'); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) }); }
  return sub;
}
async function save(p) {
  own.set(KEY, p);
  if (!p.on) return;
  const sub = await subscription(true);
  await api('POST', '/api/push/subscribe', { endpoint: sub.endpoint, days: p.days, hour: p.hour, tz: tz(), types: p.types, silent: !!p.silent });
}

const TYPE_LABELS = [['reminder', '🏋️', 'Rappels d’entraînement', 'Les jours et à l’heure que tu choisis'], ['update', '🆕', 'Nouvelles mises à jour', 'Quand l’app change, avec ce que ça apporte'], ['reply', '💬', 'Réponses à mes propositions', 'Quand un administrateur répond'], ['admin', '📬', 'Nouvelles propositions', 'Administrateurs seulement']];
/** Au démarrage : si les notifications sont activées sur cet appareil, on vérifie l'abonnement et on le recrée s'il a disparu
 * (le navigateur peut le renouveler, ou le serveur l'a retiré car expiré). Une fois par jour au plus. */
export async function ensurePush() {
  try {
    const p = prefs(); if (!p.on || !pushSupported() || Notification.permission !== 'granted' || S.user?.guest) return;
    const last = Number(ls.get('sea:push-check', 0)) || 0; if (Date.now() - last < 20 * 3600000) return;
    ls.set('sea:push-check', Date.now());
    const sub = await subscription(true), st = await api('GET', '/api/push/status?endpoint=' + encodeURIComponent(sub.endpoint));
    S.pushState = st;
    if (!st.subscribed || p.types.some((t) => !st.types.includes(t))) { await save(p); S.pushState = { subscribed: true, types: p.types, repaired: true }; }
  } catch (e) { console.warn('abonnement aux notifications', e?.message || e); }
}
ACT.remCheck = async () => { ls.set('sea:push-check', 0); await ensurePush(); toast(S.pushState?.repaired ? 'Abonnement réparé : cet appareil recevra à nouveau les notifications.' : S.pushState?.subscribed ? 'Cet appareil est bien abonné ✓' : 'Impossible de vérifier (connexion ?)', 4500); render(); };
export function remindersCard() {
  const p = prefs();
  let body;
  if (S.user?.guest) body = h`<p class="small muted">Crée un compte (gratuit) pour recevoir des notifications.</p>`;
  else if (!pushSupported()) body = h`<p class="small muted">${isIOS() && !isInstalled() ? 'Sur iPhone, installe d’abord l’application sur l’écran d’accueil : les notifications marchent ensuite.' : 'Ce navigateur ne gère pas les notifications.'}</p>${isIOS() && !isInstalled() ? h`<button class="btn sm" data-act="installNow">📲 Comment installer</button>` : ''}`;
  else if (Notification.permission === 'denied') body = h`<p class="small warn-t">Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis reviens ici.</p>`;
  else body = h`<label class="chk big"><input type="checkbox" data-change="remOn" ${p.on ? 'checked' : ''}> Recevoir des notifications sur cet appareil</label>
    ${p.on ? h`<div class="ntypes">${TYPE_LABELS.filter(([k]) => k !== 'admin' || S.user?.isAdmin).map(([k, ic, l, d]) => h`<label class="ntype"><input type="checkbox" data-change="remType" value="${k}" ${p.types.includes(k) ? 'checked' : ''}><span class="nti">${ic}</span><span class="grow"><b>${l}</b><small>${d}</small></span></label>
      ${k === 'reminder' && p.types.includes('reminder') ? h`<div class="nsub"><div class="chips days">${DAY_NAMES.map((dn, i) => h`<button type="button" class="chip ${p.days.includes(i) ? 'on' : ''}" data-act="remDay" data-v="${i}">${dn}</button>`)}</div>
        <label>À quelle heure ?<select data-change="remHour">${Array.from({ length: 33 }, (_, x) => { const m = 6 * 60 + x * 30, v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return h`<option value="${v}" ${p.hour === v ? 'selected' : ''}>${v.replace(':', ' h ')}</option>`; })}</select></label>
        <p class="tiny muted">Si un programme est en cours, le rappel te dit quelle séance faire.</p></div>` : ''}`)}</div>
      <label class="chk"><input type="checkbox" data-change="remSilent" ${p.silent ? 'checked' : ''}> 🔕 Silencieuses (sans son ni vibration)</label>
      <p class="tiny ${S.pushState?.subscribed === false ? 'warn-t' : 'muted'}">${S.pushState ? (S.pushState.subscribed ? `✓ Cet appareil est abonné${S.pushState.types?.includes('update') ? ' (mises à jour comprises)' : ''}.` : '⚠️ Cet appareil n’est plus abonné.') : 'État de l’abonnement non vérifié.'}</p>
      <div class="row wrapf"><button class="btn sm" data-act="remTest">Envoyer une notification de test</button><button class="btn sm" data-act="remCheck">🩺 Vérifier cet appareil</button></div>` : ''}`;
  return h`<div class="card"><h3>🔔 Notifications</h3>${body}</div>`;
}
CHG.remType = async (el) => {
  const p = prefs(), t = new Set(p.types); if (el.checked) t.add(el.value); else t.delete(el.value);
  try { await save({ ...p, types: [...t] }); } catch (e) { toast(e.message, 4000, 'bad'); } render();
};
CHG.remSilent = async (el) => { try { await save({ ...prefs(), silent: el.checked }); } catch (e) { toast(e.message, 4000, 'bad'); } };
CHG.remOn = async (el) => {
  const p = prefs();
  if (el.checked) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { el.checked = false; toast('Sans ton accord, le téléphone ne peut pas afficher les rappels.'); render(); return; }
    try { await save({ ...p, on: true }); toast('Rappels activés'); } catch (e) { own.set(KEY, { ...p, on: false }); toast('Activation impossible : ' + (e.message || 'erreur'), 4500, 'bad'); }
  } else {
    own.set(KEY, { ...p, on: false });
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
