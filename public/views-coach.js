// views-coach.js — discuter avec le coach : questions libres sur l'entraînement.
// Le coach ne voit qu'un court résumé affiché à l'écran (sports, niveau déclaré, objectif, dernières séances).
import { h, $, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, ctx, api, ls, go } from './state.js';
import { coachProfile } from './experience.js';
import { parseCommand, cleanCoachActions } from './commands.js';
import { runCommand } from './views-home.js';

const IDEAS = ['J’ai 20 minutes sans matériel, je fais quoi ?', 'Comment progresser en dévers ?', 'Je suis courbaturé, je m’entraîne quand même ?', 'Comment m’échauffer avant de grimper ?'];
function responseInfo(r = {}) {
  r = r && typeof r === 'object' ? r : {};
  const status = ['ok', 'clarify', 'unverified'].includes(r.status) ? r.status : '';
  const sources = (Array.isArray(r.sources) ? r.sources : []).slice(0, 8).filter((s) => s && typeof s.label === 'string').map((s) => {
    let url = ''; try { const raw = String(s.url || ''); if (raw.length <= 2048 && !/[\u0000-\u0020\u007f]/.test(raw)) { const u = new URL(raw); if (u.protocol === 'https:' && !u.username && !u.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname) && !/\.(local|localhost)$/i.test(u.hostname)) url = u.href; } } catch {}
    return { id: String(s.id || '').slice(0, 160), label: s.label.slice(0, 180), kind: String(s.kind || '').slice(0, 40), ...(url ? { url } : {}), ...(typeof s.checkedAt === 'string' && Number.isFinite(Date.parse(s.checkedAt)) ? { checkedAt: new Date(s.checkedAt).toISOString() } : {}) };
  });
  return { status, sources };
}
function evidence(r) {
  const x = responseInfo(r);
  return h`${x.status === 'clarify' ? h`<p class="tiny muted">À préciser · aucune action proposée.</p>` : x.status === 'unverified' ? h`<p class="tiny warn-t">Informations non vérifiées · aucune action proposée.</p>` : ''}${x.sources.length ? h`<details class="how mini"><summary>Sources consultées</summary><ul class="clean tiny">${x.sources.map((s) => h`<li>${s.url ? h`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>` : s.label}${s.checkedAt ? h`<span class="muted"> · consultée le ${new Date(s.checkedAt).toLocaleDateString('fr-FR')}</span>` : ''}</li>`)}</ul></details>` : ''}`;
}
const actionsFor = (m) => ['clarify', 'unverified'].includes(m?.status) ? [] : cleanCoachActions(m?.actions);

export function profileSummary() {
  return coachProfile(ctx());
}
const chatKey = () => 'sea:coachchat:' + S.user.id;
const saveChat = () => ls.set(chatKey(), (S.chat || []).slice(-20));
function loadChat() {
  if (S.chatOwner === S.user.id) return;
  S.chatOwner = S.user.id;
  S.chatBusy = false;
  S.chatDraft = '';
  S.coachStatus = undefined;
  const saved = ls.get(chatKey(), []);
  S.chat = (Array.isArray(saved) ? saved : []).filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 2000), ...responseInfo(m), actions: actionsFor(m) }));
}
const provider = () => ['cloudflare', 'gemini'].includes(S.coachStatus?.provider) ? S.coachStatus.provider : 'unknown';
const shareKey = () => 'sea:coach-profile:' + S.user.id + ':' + provider();
const profileShared = () => provider() !== 'unknown' && ls.get(shareKey(), provider() === 'cloudflare') === true;
const modelLabel = () => S.coachStatus?.label || (S.coachStatus === undefined ? 'Vérification du modèle…' : 'Modèle à vérifier lors de l’envoi');
const shareNote = 'Ta demande et les derniers messages sont transmis à Google. Le résumé ci-dessous est ajouté si tu coches cette option.';
function updateCoachStatus() {
  const chat = $('#sheet.open .chat'); if (!chat) return;
  const model = chat.querySelector('[data-coach-model]'); if (model) { model.textContent = modelLabel(); model.title = modelLabel(); }
  const choice = chat.querySelector('[data-change=chatProfile]'); if (choice) { choice.disabled = provider() === 'unknown' || !!S.chatBusy; choice.checked = profileShared(); }
  const note = chat.querySelector('[data-coach-share-note]'); if (note) { note.textContent = shareNote; note.hidden = provider() !== 'gemini'; }
}
let statusRequest = 0;
async function loadCoachStatus() {
  const owner = S.user.id, request = ++statusRequest;
  try { const status = await api('GET', '/api/ai/status'); if (S.user?.id === owner && request === statusRequest) S.coachStatus = status; }
  catch { if (S.user?.id === owner && request === statusRequest) S.coachStatus = null; }
  if (S.user?.id === owner && request === statusRequest) updateCoachStatus();
  return S.user?.id === owner ? S.coachStatus : null;
}
CHG.chatProfile = (el) => { if (provider() !== 'unknown') ls.set(shareKey(), !!el.checked); };
INPUT.chatDraft = (el) => { S.chatDraft = el.value; };
function body() {
  const msgs = S.chat || [];
  return h`<div class="chat"><div class="row between"><h2>Coach</h2>${msgs.length ? h`<button class="btn sm ghost" data-act="chatClear">Effacer</button>` : ''}</div>
    <p class="tiny muted" data-coach-model style="height:1.4em;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${modelLabel()}">${modelLabel()}</p>
    <div class="chat-log" id="chatlog">${msgs.length ? msgs.map((m, i) => h`<div class="msg ${m.role}"><span class="t">${m.content}</span>${m.role === 'assistant' && actionsFor(m).length ? h`<div class="stack" style="margin-top:10px">${actionsFor(m).map((a, k) => h`<button class="btn sm" data-act="chatAction" data-i="${i}" data-k="${k}">${a.label}</button><small class="muted">${a.summary}</small>`)}</div>` : ''}${m.role === 'assistant' ? evidence(m) : ''}</div>`) : h`<p class="small muted">Pose une question ou décris ton envie. Le coach peut proposer une séance et t’aider à utiliser l’app.</p><div class="chips">${IDEAS.map((q) => h`<button type="button" class="chip" data-act="chatIdea" data-q="${q}">${q}</button>`)}</div>`}
      ${S.chatBusy ? h`<div class="msg assistant typing"><i></i><i></i><i></i></div>` : ''}</div>
    <form data-submit="chatSend" class="row chat-in"><input name="q" maxlength="1200" data-input="chatDraft" class="grow" placeholder="Ta question ou ta demande…" autocomplete="off" aria-label="Ta question" ${S.chatBusy ? 'disabled' : ''}><button class="btn pri" type="submit" ${S.chatBusy ? 'disabled' : ''}>Envoyer</button></form>
    <div class="row wrapf"><button class="btn sm" data-act="aiOpen">✍️ Créer un exercice avec mes mots</button><button class="btn sm" data-act="cpNew">✨ Créer une séance</button></div>
    <label class="chk tiny"><input type="checkbox" data-change="chatProfile" ${profileShared() ? 'checked' : ''} ${provider() === 'unknown' || S.chatBusy ? 'disabled' : ''}> Envoyer au coach le résumé de mon profil</label>
    <div class="tiny muted" style="height:4.5em;overflow:hidden"><p data-coach-share-note style="margin:0;line-height:1.4" ${provider() === 'gemini' ? '' : 'hidden'}>${shareNote}</p></div>
    <details class="how mini"><summary>Résumé de mon profil</summary><p class="tiny">${profileSummary()}</p><p class="tiny muted">Ce résumé est joint seulement si tu choisis de le partager. Ses réponses sont des conseils généraux, pas un avis médical.</p></details></div>`;
}
const draw = ({ keepInput = false } = {}) => { if (!keepInput) S.chatDraft = ''; openSheet(body(), { wide: true }); const input = $('.chat-in input'); if (input) input.value = S.chatDraft || ''; const l = $('#chatlog'); if (l) l.scrollTop = l.scrollHeight; setTimeout(() => $('.chat-in input')?.focus(), 50); };
ACT.coachOpen = () => {
  if (S.user?.guest) { toast('Crée un compte (gratuit) pour discuter avec le coach.', 4000); return; }
  loadChat(); draw(); loadCoachStatus();
};
ACT.chatClear = () => { S.chat = []; saveChat(); draw(); };
ACT.chatAction = (el) => {
  const a = actionsFor(S.chat?.[Number(el.dataset.i)])[Number(el.dataset.k)]; if (!a) return;
  closeSheet(); if (a.to) { const [tab, sub] = a.to.split('/'); go(tab, sub); } else runCommand(parseCommand(a.command), a.command);
};
ACT.chatIdea = (el) => send(el.dataset.q);
SUBMIT.chatSend = (f) => {
  const q = String(new FormData(f).get('q') || '').trim(); if (!q) return;
  // Une consigne claire (« Séance de 20 min pour les jambes », « Je n’ai que 12 minutes »…) s'exécute directement.
  const c = parseCommand(q);
  if (c.type !== 'unknown') { closeSheet(); runCommand(c, q); return; }
  send(q);
};
async function send(q) {
  if (S.chatBusy) return;
  loadChat(); const owner = S.user.id;
  S.chat = [...(S.chat || []), { role: 'user', content: q.slice(0, 1200) }].slice(-20); S.chatBusy = true; saveChat(); draw();
  try {
    await loadCoachStatus(); if (S.user?.id !== owner) return;
    if ($('#sheet.open .chat')) draw();
    const shared = profileShared(), r = await api('POST', '/api/ai/chat', { messages: S.chat.slice(-8), profile: shared ? profileSummary() : '', profileConsent: shared, profileProvider: provider() }, { timeout: 45000 });
    if (S.user?.id !== owner) return;
    S.chat.push({ role: 'assistant', content: r.reply, ...responseInfo(r), actions: actionsFor(r) });
  } catch (e) {
    if (S.user?.id !== owner) return;
    S.chat.push({ role: 'assistant', content: e.offline ? 'Pas de connexion. Réessaie lorsque tu seras en ligne.' : (e.message || 'Je n’ai pas pu répondre, réessaie.') });
  } finally { if (S.user?.id === owner) { S.chatBusy = false; saveChat(); if ($('#sheet.open .chat')) draw(); } }
}
