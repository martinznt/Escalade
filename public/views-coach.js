// views-coach.js — discuter avec le coach : questions libres sur l'entraînement.
// Le coach ne voit qu'un court résumé affiché à l'écran (sports, niveau déclaré, objectif, dernières séances).
import { h, $, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, SUBMIT, ctx, api, item } from './state.js';
import { activityLabel, activeGoals, goalLabel } from './brain.js';
import { parseCommand } from './commands.js';
import { runCommand } from './views-home.js';

const IDEAS = ['J’ai 20 minutes sans matériel, je fais quoi ?', 'Comment progresser en dévers ?', 'Je suis courbaturé, je m’entraîne quand même ?', 'Comment m’échauffer avant de grimper ?'];

export function profileSummary() {
  const c = ctx(), cfg = item('config', 'main') || {};
  const acts = Object.keys(c.activities).map((a) => { try { return activityLabel(a, c); } catch { return a; } });
  const goals = activeGoals(c).slice(0, 2).map(goalLabel);
  const last = c.history.slice(0, 5).map((x) => `${x.sessionName} (${new Date(x.startedAt).toLocaleDateString('fr-FR')}, ${Math.round((x.durationSeconds || 0) / 60)} min${x.data?.rpe ? `, ressenti ${x.data.rpe}/5` : ''})`);
  return [acts.length ? `sports : ${acts.join(', ')}` : '', cfg.perWeek ? `${cfg.perWeek} séances par semaine visées` : '', goals.length ? `objectifs : ${goals.join(', ')}` : '', last.length ? `dernières séances : ${last.join(' ; ')}` : 'pas encore de séance enregistrée'].filter(Boolean).join(' · ');
}
function body() {
  const msgs = S.chat || [];
  return h`<div class="chat"><div class="row between"><h2>💬 L’assistant</h2>${msgs.length ? h`<button class="btn sm ghost" data-act="chatClear">Effacer</button>` : ''}</div>
    <div class="chat-log" id="chatlog">${msgs.length ? msgs.map((m) => h`<div class="msg ${m.role}">${m.content}</div>`) : h`<p class="small muted">Pose une question, ou dis ce que tu veux (« Séance de 20 min pour les jambes », « Je n’ai que 12 minutes »). Par exemple :</p><div class="chips">${IDEAS.map((q) => h`<button type="button" class="chip" data-act="chatIdea" data-q="${q}">${q}</button>`)}</div>`}
      ${S.chatBusy ? h`<div class="msg assistant typing"><i></i><i></i><i></i></div>` : ''}</div>
    <form data-submit="chatSend" class="row chat-in"><input name="q" maxlength="500" class="grow" placeholder="Ta question ou ta demande…" autocomplete="off" aria-label="Ta question" ${S.chatBusy ? 'disabled' : ''}><button class="btn pri" type="submit" ${S.chatBusy ? 'disabled' : ''}>Envoyer</button></form>
    <div class="row wrapf"><button class="btn sm" data-act="aiOpen">✍️ Créer un exercice avec mes mots</button><button class="btn sm" data-act="cpNew">✨ Créer une séance</button></div>
    <details class="how mini"><summary>Ce que l’assistant sait de toi</summary><p class="tiny">${profileSummary()}</p><p class="tiny muted">Ses réponses sont des conseils généraux, pas un avis médical.</p></details></div>`;
}
const draw = () => { openSheet(body(), { wide: true }); const l = $('#chatlog'); if (l) l.scrollTop = l.scrollHeight; setTimeout(() => $('.chat-in input')?.focus(), 50); };
ACT.coachOpen = () => {
  if (S.user?.guest) { toast('Crée un compte (gratuit) pour discuter avec le coach.', 4000); return; }
  S.chat ||= []; draw();
};
ACT.chatClear = () => { S.chat = []; draw(); };
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
  S.chat = [...(S.chat || []), { role: 'user', content: q.slice(0, 500) }].slice(-20); S.chatBusy = true; draw();
  try {
    const r = await api('POST', '/api/ai/chat', { messages: S.chat.slice(-8), profile: profileSummary() }, { timeout: 45000 });
    S.chat.push({ role: 'assistant', content: r.reply });
  } catch (e) {
    S.chat.push({ role: 'assistant', content: e.offline ? 'Pas de connexion : je réponds dès que tu es en ligne.' : e.status === 503 ? 'Le coach n’est pas disponible sur ce serveur pour le moment.' : (e.message || 'Je n’ai pas pu répondre, réessaie.') });
  } finally { S.chatBusy = false; if ($('#sheet.open .chat')) draw(); }
}
