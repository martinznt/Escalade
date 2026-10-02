// views-assistant.js — Paramètres › Admin › Assistant du site. Une conversation en français avec l'IA du serveur
// (Workers AI : pas besoin d'abonnement extérieur). L'assistant répond, pose des questions s'il lui manque une
// information, et range ses propositions VALIDÉES PAR LE SERVEUR dans un brouillon du Studio, que tu relis et publies.
// Ce qui demande du code : « 💻 Proposer dans le code » prépare de petits remplacements exacts (vérifiés par le serveur),
// à enregistrer comme proposition de code, puis à valider et envoyer en Pull Request GitHub — jamais déployés seuls.
// La conversation reste sur cet appareil.
import { h, toast, chip, tag, ask } from './ui.js';
import { S, ACT, SUBMIT, api, ls, render, go } from './state.js';

const KEY = 'sea:adminchat';
const KIND_L = { exercise: '💪 Exercice', intent: '🧭 Intention', faq: '❓ Question fréquente', announce: '📣 Annonce', hint: '💡 Raccourci', text: '✏️ Texte', style: '🎨 Style' };
const OP_L = { put: 'créer ou modifier', hide: 'masquer pour tous', delete: 'revenir à l’origine' };
export const EXAMPLES = [
  'À quoi sert le bouton ✏️ en haut des pages ?',
  'Ajoute une question fréquente : « Que faire si j’ai mal aux doigts ? »',
  'Mets 4 séries de 6 à 8 répétitions aux tractions strictes',
  'Écris une annonce pour présenter le bilan physique',
  'Ajoute un raccourci sur l’accueil vers Profil › Mon bilan physique',
  'Je veux un nouvel écran pour comparer deux séances',
];
const C = () => (S.admin.chat ||= (() => { try { const x = ls.get(KEY, null); return x && Array.isArray(x.messages) ? x : { messages: [], draftId: '' }; } catch { return { messages: [], draftId: '' }; } })());
const save = () => { const c = C(); ls.set(KEY, { messages: c.messages.slice(-40), draftId: c.draftId || '' }); };

function bubble(m, i) {
  if (m.role === 'user') return h`<div class="msg user"><span class="t">${m.content}</span></div>`;
  const r = m.meta || {};
  return h`<div class="msg assistant"><span class="t">${m.content}</span>
    ${r.added ? h`<div class="card flat stack" style="margin-top:8px"><b class="small">📝 Ajouté au brouillon : ${r.added} modification${r.added > 1 ? 's' : ''}</b>
      ${(r.diff || []).map((d) => h`<div class="tiny"><b>${KIND_L[d.kind] || d.kind}</b> · ${d.id} · ${OP_L[d.op] || d.op}${d.isNew ? ' · nouveau' : ''}${d.changes?.length ? h`<ul class="clean">${d.changes.slice(0, 6).map((c) => h`<li><span class="muted">${c.path}</span> : ${String(c.before ?? '—').slice(0, 60)} → <b>${String(c.after ?? '—').slice(0, 80)}</b></li>`)}</ul>` : ''}</div>`)}
      ${(r.explain || []).filter((e) => e.why).map((e) => h`<p class="tiny muted">Pourquoi (${e.id}) : ${e.why}</p>`)}
      <button class="btn sm pri" data-act="studioOpen" data-id="${r.draftId}">Relire et publier le brouillon ›</button></div>` : ''}
    ${r.rejected?.length ? h`<div class="tiny warn-t" style="margin-top:6px">Refusé par le serveur (rien n’a été enregistré pour ces points) :<ul class="clean">${r.rejected.map((x) => h`<li>${x}</li>`)}</ul></div>` : ''}
    ${r.questions?.length ? h`<div class="chips" style="margin-top:6px">${r.questions.map((q, k) => chip(false, q, `data-act="asQuote" data-i="${i}" data-k="${k}"`))}</div>` : ''}
    ${r.needsCode ? h`<div class="card flat warn-b stack" style="margin-top:8px"><b class="small">🧑‍💻 Cela touche au code : ${r.needsCode.title}</b><p class="tiny">${r.needsCode.summary}</p>
      <p class="tiny muted">Si c’est une petite modification de l’interface, l’assistant peut la préparer dans le code : tu la relis, tu la valides, puis elle part en Pull Request sur GitHub (rien n’est déployé seul). Sinon, copie la demande pour un développeur.</p>
      <div class="row wrapf"><button class="btn sm pri" data-act="asCode" data-i="${i}" ${S.admin.chatBusy ? 'disabled' : ''}>💻 Proposer dans le code</button><button class="btn sm" data-act="asCopy" data-i="${i}">📋 Copier la demande</button></div></div>` : ''}
    ${r.code ? codeCard(r.code, i) : ''}</div>`;
}
export function vAssistant() {
  const c = C(), busy = S.admin.chatBusy;
  return h`<div class="card stack"><p class="small">Écris ce que tu veux changer, comme dans une conversation. L’assistant prépare les modifications ; <b>tu relis puis tu publies</b> dans le Studio.</p>
      <details class="how mini"><summary>Ce qu’il sait faire, et ce qu’il ne fait pas</summary>
        <p class="tiny"><b>Il peut</b> : créer ou modifier des exercices, des intentions de séance, des questions fréquentes, des annonces, des raccourcis, des styles, réécrire un texte de l’app (donne-lui le texte exact).</p>
        <p class="tiny"><b>Petites modifications du code de l’interface</b> (« 💻 Proposer dans le code ») : il prépare des remplacements exacts, le serveur les vérifie, tu relis le diff, tu valides, puis ça part en Pull Request sur GitHub où les tests tournent. Tu fusionnes toi-même : <b>rien n’est déployé seul</b>.</p>
        <p class="tiny"><b>Il ne peut pas</b> : toucher au serveur ou à la base de données, lire les données des membres, publier ou déployer à ta place.</p>
        <p class="tiny"><b>Il connaît l’app</b> : demande-lui à quoi sert un bouton ou où trouver une fonction.</p>
        <p class="tiny muted">C’est l’IA du serveur (Workers AI), sans abonnement extérieur. Elle peut se tromper : chaque proposition est vérifiée par le serveur et reste un brouillon.</p></details></div>
    <div class="chat"><div class="aslog" id="aslog">${c.messages.length ? c.messages.map(bubble) : h`<p class="small muted">Exemples :</p><div class="chips">${EXAMPLES.map((e, k) => chip(false, e, `data-act="asEx" data-i="${k}"`))}</div>`}
      ${busy ? h`<div class="msg assistant typing"><i></i><i></i><i></i></div>` : ''}</div>
      <form data-submit="asSend" class="stack"><textarea name="t" rows="3" maxlength="1500" placeholder="Ex. « Ajoute un exercice de gainage pour les grimpeurs débutants »" aria-label="Ta demande" ${busy ? 'disabled' : ''}>${S.admin.chatDraft || ''}</textarea>
        <div class="row wrapf"><button class="btn pri" ${busy ? 'disabled' : ''}>Envoyer</button><button type="button" class="btn" data-act="asCodeNow" ${busy ? 'disabled' : ''}>💻 Proposer dans le code</button>${c.messages.length ? h`<button type="button" class="btn ghost" data-act="asReset">Nouvelle conversation</button>` : ''}</div></form>
      ${c.draftId ? h`<p class="tiny muted">Brouillon de cette conversation : <button class="linkish acc-t" data-act="studioOpen" data-id="${c.draftId}">le relire dans le Studio</button>. ${tag('jamais publié sans toi')}</p>` : ''}</div>`;
}
/** Proposition de code préparée par l'assistant (pas encore enregistrée) : diff relu, refus expliqués. */
function codeCard(x, i) {
  return h`<div class="card flat acc-b stack" style="margin-top:8px"><b class="small">💻 ${x.edits?.length ? x.title : 'Pas de modification sûre à proposer'}</b>
    ${x.summary ? h`<p class="tiny">${x.summary}</p>` : ''}
    ${x.diff ? h`<details class="how mini" open><summary>Voir le diff (${x.edits.length} remplacement${x.edits.length > 1 ? 's' : ''})</summary><pre class="txt">${x.diff}</pre></details>` : ''}
    ${(x.impact?.flags || []).map((f) => h`<p class="tiny warn-t">⚠️ ${f}</p>`)}
    ${(x.errors || []).length ? h`<div class="tiny warn-t">Refusé par le serveur :<ul class="clean">${x.errors.map((e) => h`<li>${e}</li>`)}</ul></div>` : ''}
    ${x.saved ? h`<p class="tiny ok-t">✓ Enregistrée dans « Propositions de code ».</p><button class="btn sm" data-act="codeOpen" data-id="${x.saved}">Ouvrir la proposition ›</button>`
      : x.edits?.length ? h`<button class="btn sm pri" data-act="asCodeSave" data-i="${i}">💾 Enregistrer comme proposition de code</button><p class="tiny muted">Ensuite : la relire, la valider, puis « Créer la Pull Request sur GitHub ». Rien n’est appliqué au site avant que tu fusionnes sur GitHub.</p>` : ''}</div>`;
}
/** « 💻 Proposer dans le code » : à partir de la conversation (ou du texte en cours), des remplacements exacts vérifiés. */
async function askCode(extra = '') {
  const c = C(); if (S.admin.chatBusy) return;
  if (extra) { c.messages.push({ role: 'user', content: extra.slice(0, 1500) }); S.admin.chatDraft = ''; }
  if (!c.messages.some((m) => m.role === 'user')) { toast('Écris d’abord ce que tu veux changer.'); return; }
  S.admin.chatBusy = true; save(); render(); scroll();
  try {
    const r = await api('POST', '/api/admin/assistant/code', { messages: c.messages.map(({ role, content }) => ({ role, content })) }, { timeout: 60000 });
    c.messages.push({ role: 'assistant', content: r.reply || 'Voici ce que je propose dans le code.', meta: { code: { title: r.title, summary: r.summary, edits: r.edits || [], diff: r.diff || '', errors: r.errors || [], impact: r.impact, github: r.github } } });
  } catch (e) { c.messages.push({ role: 'assistant', content: `⚠️ ${e.offline ? 'Connexion requise.' : e.message}` }); }
  S.admin.chatBusy = false; save(); render(); scroll();
}
ACT.asCode = () => askCode();
ACT.asCodeNow = () => askCode(String(document.querySelector('form[data-submit=asSend] textarea[name=t]')?.value || '').trim());
ACT.asCodeSave = async (el) => {
  const m = C().messages[Number(el.dataset.i)], x = m?.meta?.code; if (!x?.edits?.length) return;
  try { const r = await api('POST', '/api/admin/code', { title: x.title, summary: x.summary, edits: x.edits, tests: 'Tests du dépôt sur la Pull Request (GitHub Actions : npm run check, npm test).' }); x.saved = r.id; save(); render(); toast('Proposition de code enregistrée'); if (S.studio) S.studio.code = null; }
  catch (e) { toast(e.message, 6000, 'bad'); }
};
const scroll = () => setTimeout(() => { const m = [...document.querySelectorAll('#aslog .msg')].at(-1); m?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
async function send(text) {
  const c = C(), t = String(text || '').trim().slice(0, 1500); if (!t || S.admin.chatBusy) return;
  c.messages.push({ role: 'user', content: t }); S.admin.chatDraft = ''; S.admin.chatBusy = true; save(); render(); scroll();
  try {
    const r = await api('POST', '/api/admin/assistant', { messages: c.messages.map(({ role, content }) => ({ role, content })), draftId: c.draftId || '' }, { timeout: 60000 });
    if (r.draftId) c.draftId = r.draftId;
    c.messages.push({ role: 'assistant', content: r.reply, meta: { added: r.added, diff: r.diff, explain: r.explain, rejected: r.rejected, questions: r.questions, needsCode: r.needsCode, draftId: r.draftId } });
    if (r.added) S.studio && (S.studio.sets = null);
  } catch (e) { c.messages.push({ role: 'assistant', content: `⚠️ ${e.offline ? 'Connexion requise.' : e.message}` }); }
  S.admin.chatBusy = false; save(); render(); scroll();
}
SUBMIT.asSend = (f) => send(new FormData(f).get('t'));
ACT.asEx = (el) => { S.admin.chatDraft = EXAMPLES[Number(el.dataset.i)] || ''; render(); setTimeout(() => document.querySelector('textarea[name=t]')?.focus(), 30); };
ACT.asQuote = (el) => { const q = C().messages[Number(el.dataset.i)]?.meta?.questions?.[Number(el.dataset.k)] || ''; S.admin.chatDraft = q ? `${q} → ` : ''; render(); setTimeout(() => document.querySelector('textarea[name=t]')?.focus(), 30); };
ACT.asReset = async () => { if (!(await ask('Commencer une nouvelle conversation ?', { ok: 'Oui', detail: 'Le brouillon déjà préparé reste dans le Studio.' }))) return; S.admin.chat = { messages: [], draftId: '' }; save(); render(); };
ACT.asCopy = async (el) => {
  const nc = C().messages[Number(el.dataset.i)]?.meta?.needsCode; if (!nc) return;
  const text = `${nc.title}\n\n${nc.summary}\n\n(Demande rédigée par l’assistant du site « Séances entraînement ».)`;
  try { await navigator.clipboard.writeText(text); toast('Demande copiée'); } catch { toast('Copie impossible ici : sélectionne le texte à la main.', 4000); }
};
