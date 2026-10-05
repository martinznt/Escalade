// views-assistant.js — Paramètres › Administration › Assistant du site. Une conversation en français avec l'IA du serveur
// (Workers AI ou Gemini configuré sur le serveur). L'assistant répond, pose des questions s'il lui manque une
// information, et range ses propositions VALIDÉES PAR LE SERVEUR dans un brouillon du Studio, que tu relis et publies.
// Ce qui demande du code : « 💻 Proposer dans le code » prépare de petits remplacements exacts (vérifiés par le serveur),
// à enregistrer comme proposition de code, puis à valider et envoyer en Pull Request GitHub — jamais déployés seuls.
// La conversation reste sur cet appareil.
import { h, toast, chip, tag, ask } from './ui.js';
import { S, ACT, SUBMIT, INPUT, CHG, api, ls, render, go } from './state.js';
import { canRole } from './views-studio.js';

const key = () => 'sea:adminchat:' + (S.user?.id || 'guest');
const KIND_L = { exercise: '💪 Exercice', intent: '🧭 Intention', faq: '❓ Question fréquente', announce: '📣 Annonce', hint: '💡 Raccourci', text: '✏️ Texte', style: '🎨 Style' };
const OP_L = { put: 'créer ou modifier', hide: 'masquer pour tous', delete: 'revenir à l’origine' };
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
  return h`${x.status === 'clarify' ? h`<p class="tiny muted">À préciser · aucune modification proposée.</p>` : x.status === 'unverified' ? h`<p class="tiny warn-t">Informations non vérifiées · aucune modification proposée.</p>` : ''}${x.sources.length ? h`<details class="how mini"><summary>Sources consultées</summary><ul class="clean tiny">${x.sources.map((s) => h`<li>${s.url ? h`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>` : s.label}${s.checkedAt ? h`<span class="muted"> · consultée le ${new Date(s.checkedAt).toLocaleDateString('fr-FR')}</span>` : ''}</li>`)}</ul></details>` : ''}`;
}
export const EXAMPLES = [
  'À quoi sert le bouton ✏️ en haut des pages ?',
  'Ajoute une question fréquente : « Que faire si j’ai mal aux doigts ? »',
  'Mets 4 séries de 6 à 8 répétitions aux tractions strictes',
  'Écris une annonce pour présenter le bilan physique',
  'Ajoute un raccourci sur l’accueil vers Profil › Mon bilan physique',
  'Je veux un nouvel écran pour comparer deux séances',
];
const C = () => {
  const owner = key();
  if (S.admin.chatOwner !== owner) { S.admin.chatOwner = owner; S.admin.chat = null; S.admin.chatBusy = false; S.admin.chatDraft = ''; S.admin.ai = undefined; S.admin.aiErr = ''; S.admin.aiTesting = false; S.admin.aiTest = null; S.admin.aiPanelOpen = false; }
  return (S.admin.chat ||= (() => { try { const x = ls.get(owner, null); return x && Array.isArray(x.messages) ? { ...x, messages: x.messages.filter((m) => ['user','assistant'].includes(m?.role) && typeof m.content === 'string').slice(-40).map((m) => ({ ...m, meta: { ...(m.meta || {}), ...responseInfo(m.meta) } })) } : { messages: [], draftId: '' }; } catch { return { messages: [], draftId: '' }; } })());
};
const save = () => { const c = C(); ls.set(key(), { messages: c.messages.slice(-40), draftId: c.draftId || '' }); };
async function loadAIStatus() {
  const owner = key(); S.admin.ai = null; S.admin.aiErr = '';
  try { const r = await api('GET', '/api/admin/ai'); if (key() === owner) S.admin.ai = r; }
  catch (e) { if (key() === owner) S.admin.aiErr = e.offline ? 'Connexion requise pour vérifier l’IA.' : e.message; }
  if (key() === owner) render();
}
const budgetSpec = (m = {}) => {
  const unit = m.unit || (m.provider === 'gemini' || String(m.id || '').startsWith('gemini-') ? 'requests' : 'neurons');
  return { unit, min: m.minBudget ?? (unit === 'requests' ? 1 : 1000), max: m.maxBudget ?? (unit === 'requests' ? 500 : 9000), default: m.defaultBudget ?? (unit === 'requests' ? 40 : 8000), step: unit === 'requests' ? 1 : 100 };
};
const budgetLabel = (unit) => unit === 'requests' ? 'Demandes par jour pour le site' : 'Réserve quotidienne du site (neurones)';
const budgetHelp = (unit) => unit === 'requests' ? 'Ce plafond limite les demandes du site ; le quota gratuit Google du projet peut être atteint plus tôt.' : 'Estimation prudente de l’usage Workers AI, avec une marge sur l’allocation gratuite Cloudflare.';
function geminiGuide() {
  return h`<p class="tiny">Pour relier Gemini : crée une clé dans <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> pour un projet <b>sans facturation activée</b>, puis ajoute-la dans Cloudflare › Worker › Paramètres › Variables et secrets, comme secret nommé <code>GEMINI_API_KEY</code>. Reviens ici et teste une réponse. Les quotas gratuits Google restent ceux de ton projet.</p>`;
}
function aiPanel() {
  if (S.admin.ai === undefined) { loadAIStatus(); }
  const x = S.admin.ai, edit = canRole('intelligence');
  const model = x?.models.find((m) => m.id === x.model), spec = budgetSpec(model), unit = x?.unit || spec.unit;
  const prefs = { answerStyle: 'direct', detail: 'standard', reasoning: 'low', creativity: 0.1, ...x?.preferences };
  const provider = x?.provider || model?.provider || (String(x?.model || '').startsWith('gemini-') ? 'gemini' : 'cloudflare');
  return h`<details class="how mini" ${S.admin.aiPanelOpen ? 'open' : ''}><summary data-act="asAIPanel">Modèle et réserve gratuite</summary>
    ${S.admin.aiErr ? h`<p class="small warn-t">${S.admin.aiErr}</p><button class="btn sm" data-act="asAIRefresh">Réessayer</button>` : !x ? h`<p class="small muted">Vérification de l’IA…</p>` : h`
      <p class="small">${x.available ? 'IA activée' : 'IA non activée sur ce serveur'} · ${x.label || model?.label || x.model}</p>
      <p class="tiny muted">${unit === 'requests' ? 'Demandes utilisées' : 'Réserve estimée utilisée'} : ${x.used.toLocaleString('fr-FR')} / ${x.budget.toLocaleString('fr-FR')} ${unit === 'requests' ? 'demandes' : 'neurones'}. Le compteur du site revient à zéro à minuit UTC.</p>
      <p class="tiny muted">${provider === 'gemini' ? 'Pour rester sur l’offre gratuite Google, utilise un projet sans facturation activée. Le plafond du site ne remplace pas les quotas Google, qui peuvent être atteints plus tôt.' : 'Cloudflare inclut 10 000 neurones par jour pour tout le compte. D’autres sites du même compte peuvent aussi consommer cette allocation.'} Une panne ou le quota atteint laisse les formulaires disponibles.</p>
      ${edit ? h`<form data-submit="asAIConfig" class="stack"><label class="small">Modèle<select name="model" data-change="asAIModel">${x.models.map((m) => h`<option value="${m.id}" ${m.id === x.model ? 'selected' : ''}>${m.label}${m.configured === false ? ' · à relier' : ''}</option>`)}</select></label>
        <label class="small"><span data-ai-budget-label>${budgetLabel(spec.unit)}</span><input type="number" name="budget" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${x.budget}" required></label>
        <p class="tiny muted" data-ai-budget-help>${budgetHelp(spec.unit)}</p><div data-ai-secret-guide ${model?.provider === 'gemini' && model.configured === false ? '' : 'hidden'}>${geminiGuide()}</div>
        <details class="how mini"><summary>Style des réponses</summary><div class="stack">
          <label class="small">Ton<select name="answerStyle"><option value="direct" ${prefs.answerStyle === 'direct' ? 'selected' : ''}>Direct</option><option value="pedagogical" ${prefs.answerStyle === 'pedagogical' ? 'selected' : ''}>Pédagogique</option></select></label>
          <label class="small">Longueur<select name="detail">${[['short','Courte'],['standard','Standard'],['detailed','Détaillée']].map(([v,l]) => h`<option value="${v}" ${prefs.detail === v ? 'selected' : ''}>${l}</option>`)}</select></label>
          <label class="small">Réflexion de Gemini<select name="reasoning"><option value="minimal" ${prefs.reasoning === 'minimal' ? 'selected' : ''}>Rapide</option><option value="low" ${prefs.reasoning === 'low' ? 'selected' : ''}>Approfondie</option></select></label>
          <label class="small">Créativité<select name="creativity">${[[0,'Discrète'],[0.1,'Faible'],[0.3,'Modérée']].map(([v,l]) => h`<option value="${v}" ${Number(prefs.creativity) === v ? 'selected' : ''}>${l}</option>`)}</select></label>
          <p class="tiny muted">S’il manque une information, l’assistant demande une précision. Il montre les sources consultées et garde tes modifications à relire avant publication. Ces règles restent actives avec tous les styles.</p>
        </div></details><button class="btn sm">Enregistrer</button></form>` : h`<p class="tiny muted">Le rôle Intelligence permet de changer ce réglage.</p>`}
      ${!edit && provider === 'gemini' && !x.available ? geminiGuide() : ''}
      <div class="row wrapf"><button class="btn sm ghost" data-act="asAIRefresh">Actualiser l’état</button>${edit ? h`<button class="btn sm" data-act="asAITest" ${S.admin.aiTesting ? 'disabled' : ''}>${S.admin.aiTesting ? 'Test en cours…' : 'Tester une réponse'}</button>` : ''}</div>
      ${S.admin.aiTest ? h`<p class="tiny ${S.admin.aiTest.ok ? 'ok-t' : 'warn-t'}">${S.admin.aiTest.text}</p>` : ''}`}</details>`;
}
CHG.asAIModel = (el) => {
  const model = S.admin.ai?.models.find((m) => m.id === el.value); if (!model) return;
  const f = el.closest('form'), input = f?.querySelector('[name=budget]'), spec = budgetSpec(model); if (!input) return;
  input.min = spec.min; input.max = spec.max; input.step = spec.step; input.value = spec.default;
  f.querySelector('[data-ai-budget-label]').textContent = budgetLabel(spec.unit);
  f.querySelector('[data-ai-budget-help]').textContent = budgetHelp(spec.unit);
  f.querySelector('[data-ai-secret-guide]').hidden = model.provider !== 'gemini' || model.configured !== false;
};
ACT.asAIRefresh = () => loadAIStatus();
ACT.asAIPanel = () => { S.admin.aiPanelOpen = !S.admin.aiPanelOpen; render(); };
INPUT.asDraft = (el) => { S.admin.chatDraft = el.value; };
ACT.asAITest = async () => {
  if (S.admin.aiTesting) return; const owner = key(); S.admin.aiTesting = true; S.admin.aiTest = null; render();
  try { const r = await api('POST', '/api/admin/ai/test', {}, { timeout: 25000 }); if (key() === owner) { S.admin.ai = r; S.admin.aiTest = { ok: true, text: r.reply + ' Réponse en ' + (r.elapsedMs / 1000).toFixed(1) + ' s.' }; } }
  catch (e) { if (key() === owner) S.admin.aiTest = { ok: false, text: e.offline ? 'Connexion requise pour tester l’IA.' : e.message }; }
  finally { if (key() === owner) { S.admin.aiTesting = false; render(); } }
};
SUBMIT.asAIConfig = async (f) => { const d = new FormData(f), owner = key(); try { const r = await api('POST', '/api/admin/ai', { model: d.get('model'), budget: Number(d.get('budget')), preferences: { answerStyle: d.get('answerStyle'), detail: d.get('detail'), reasoning: d.get('reasoning'), creativity: Number(d.get('creativity')) } }); if (key() === owner) { S.admin.ai = r; render(); toast('Réglage de l’IA enregistré'); } } catch (e) { if (key() === owner) toast(e.message, 5000, 'bad'); } };

function bubble(m, i) {
  if (m.role === 'user') return h`<div class="msg user"><span class="t">${m.content}</span></div>`;
  const r = m.meta || {};
  const actionable = !['clarify', 'unverified'].includes(r.status);
  return h`<div class="msg assistant"><span class="t">${m.content}</span>
    ${actionable && r.added ? h`<div class="card flat stack" style="margin-top:8px"><b class="small">📝 Ajouté au brouillon : ${r.added} modification${r.added > 1 ? 's' : ''}</b>
      ${(r.diff || []).map((d) => h`<div class="tiny"><b>${KIND_L[d.kind] || d.kind}</b> · ${d.id} · ${OP_L[d.op] || d.op}${d.isNew ? ' · nouveau' : ''}${d.changes?.length ? h`<ul class="clean">${d.changes.slice(0, 6).map((c) => h`<li><span class="muted">${c.path}</span> : ${String(c.before ?? '—').slice(0, 60)} → <b>${String(c.after ?? '—').slice(0, 80)}</b></li>`)}</ul>` : ''}</div>`)}
      ${(r.explain || []).filter((e) => e.why).map((e) => h`<p class="tiny muted">Pourquoi (${e.id}) : ${e.why}</p>`)}
      <button class="btn sm pri" data-act="studioOpen" data-id="${r.draftId}">Relire et publier le brouillon ›</button></div>` : ''}
    ${r.rejected?.length ? h`<div class="tiny warn-t" style="margin-top:6px">Refusé par le serveur (rien n’a été enregistré pour ces points) :<ul class="clean">${r.rejected.map((x) => h`<li>${x}</li>`)}</ul></div>` : ''}
    ${r.questions?.length ? h`<div class="chips" style="margin-top:6px">${r.questions.map((q, k) => chip(false, q, `data-act="asQuote" data-i="${i}" data-k="${k}"`))}</div>` : ''}
    ${actionable && r.needsCode ? h`<div class="card flat warn-b stack" style="margin-top:8px"><b class="small">🧑‍💻 Cela touche au code : ${r.needsCode.title}</b><p class="tiny">${r.needsCode.summary}</p>
      <p class="tiny muted">Si c’est une petite modification de l’interface, l’assistant peut la préparer dans le code : tu la relis, tu la valides, puis elle part en Pull Request sur GitHub (rien n’est déployé seul). Sinon, copie la demande pour un développeur.</p>
      <div class="row wrapf"><button class="btn sm pri" data-act="asCode" data-i="${i}" ${S.admin.chatBusy ? 'disabled' : ''}>💻 Proposer dans le code</button><button class="btn sm" data-act="asCopy" data-i="${i}">📋 Copier la demande</button></div></div>` : ''}
    ${actionable && r.code ? codeCard(r.code, i) : ''}${evidence(r)}</div>`;
}
export function vAssistant() {
  if (!canRole('content') && !canRole('intelligence')) return h`<div class="card"><p class="small">Rôle « Contenu » ou « Intelligence » nécessaire pour cette rubrique.</p></div>`;
  const c = C(), busy = S.admin.chatBusy;
  if (!canRole('content')) return h`<div class="card stack"><p class="small">Choisis le modèle, le style des réponses et la limite d’utilisation de l’IA pour le site.</p>${aiPanel()}<p class="tiny muted">Le rôle Contenu est nécessaire pour préparer des modifications du site.</p></div>`;
  return h`<div class="card stack"><p class="small">Écris ce que tu veux changer, comme dans une conversation. L’assistant prépare les modifications ; <b>tu relis puis tu publies</b> dans le Studio.</p>${aiPanel()}
      <details class="how mini"><summary>Ce qu’il sait faire, et ce qu’il ne fait pas</summary>
        <p class="tiny"><b>Il peut</b> : créer ou modifier des exercices, des intentions de séance, des questions fréquentes, des annonces, des raccourcis, des styles, réécrire un texte de l’app (donne-lui le texte exact).</p>
        <p class="tiny"><b>Petites modifications du code de l’interface</b> (« 💻 Proposer dans le code ») : il prépare des remplacements exacts, le serveur les vérifie, tu relis le diff, tu valides, puis ça part en Pull Request sur GitHub où les tests tournent. Tu fusionnes toi-même : <b>rien n’est déployé seul</b>.</p>
        <p class="tiny"><b>Il ne peut pas</b> : toucher au serveur ou à la base de données, lire les données des membres, publier ou déployer à ta place.</p>
        <p class="tiny"><b>Il connaît l’app</b> : demande-lui à quoi sert un bouton ou où trouver une fonction.</p>
        <p class="tiny muted">Le site utilise le modèle choisi par l’administrateur : Workers AI ou Gemini. Il peut se tromper : chaque proposition est vérifiée par le serveur et reste un brouillon.</p></details></div>
    <div class="chat"><div class="aslog" id="aslog">${c.messages.length ? c.messages.map(bubble) : h`<p class="small muted">Exemples :</p><div class="chips">${EXAMPLES.map((e, k) => chip(false, e, `data-act="asEx" data-i="${k}"`))}</div>`}
      ${busy ? h`<div class="msg assistant typing"><i></i><i></i><i></i></div>` : ''}</div>
      <form data-submit="asSend" class="stack"><textarea name="t" rows="3" maxlength="1500" data-input="asDraft" placeholder="Ex. « Ajoute un exercice de gainage pour les grimpeurs débutants »" aria-label="Ta demande" ${busy ? 'disabled' : ''}>${S.admin.chatDraft || ''}</textarea>
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
  const c = C(), owner = key(); if (S.admin.chatBusy) return;
  if (extra) { c.messages.push({ role: 'user', content: extra.slice(0, 1500) }); S.admin.chatDraft = ''; }
  if (!c.messages.some((m) => m.role === 'user')) { toast('Écris d’abord ce que tu veux changer.'); return; }
  S.admin.chatBusy = true; save(); render(); scroll();
  try {
    const r = await api('POST', '/api/admin/assistant/code', { messages: c.messages.map(({ role, content }) => ({ role, content })) }, { timeout: 60000 });
    if (key() !== owner) return;
    c.messages.push({ role: 'assistant', content: r.reply || 'Voici ce que je propose dans le code.', meta: { ...responseInfo(r), code: { title: r.title, summary: r.summary, edits: r.edits || [], diff: r.diff || '', errors: r.errors || [], impact: r.impact, github: r.github } } });
  } catch (e) { if (key() === owner) c.messages.push({ role: 'assistant', content: `⚠️ ${e.offline ? 'Connexion requise.' : e.message}` }); }
  if (key() === owner) { S.admin.chatBusy = false; save(); render(); scroll(); }
}
ACT.asCode = () => askCode();
ACT.asCodeNow = () => askCode(String(document.querySelector('form[data-submit=asSend] textarea[name=t]')?.value || '').trim());
ACT.asCodeSave = async (el) => {
  const owner = key(), c = C(), m = c.messages[Number(el.dataset.i)], x = m?.meta?.code; if (!x?.edits?.length) return;
  try { const r = await api('POST', '/api/admin/code', { title: x.title, summary: x.summary, edits: x.edits, tests: 'Tests du dépôt sur la Pull Request (GitHub Actions : npm run check, npm test).' }); if (key() !== owner || C() !== c) return; x.saved = r.id; save(); render(); toast('Proposition de code enregistrée'); if (S.studio) S.studio.code = null; }
  catch (e) { if (key() === owner && C() === c) toast(e.message, 6000, 'bad'); }
};
const scroll = () => setTimeout(() => { const m = [...document.querySelectorAll('#aslog .msg')].at(-1); m?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
async function send(text) {
  const c = C(), owner = key(), t = String(text || '').trim().slice(0, 1500); if (!t || S.admin.chatBusy) return;
  c.messages.push({ role: 'user', content: t }); S.admin.chatDraft = ''; S.admin.chatBusy = true; save(); render(); scroll();
  try {
    const r = await api('POST', '/api/admin/assistant', { messages: c.messages.map(({ role, content }) => ({ role, content })), draftId: c.draftId || '' }, { timeout: 60000 });
    if (key() !== owner) return;
    if (r.draftId) c.draftId = r.draftId;
    c.messages.push({ role: 'assistant', content: r.reply, meta: { ...responseInfo(r), added: r.added, diff: r.diff, explain: r.explain, rejected: r.rejected, questions: r.questions, needsCode: r.needsCode, draftId: r.draftId } });
    if (r.added) S.studio && (S.studio.sets = null);
  } catch (e) { if (key() === owner) c.messages.push({ role: 'assistant', content: `⚠️ ${e.offline ? 'Connexion requise.' : e.message}` }); }
  if (key() === owner) { S.admin.chatBusy = false; save(); render(); scroll(); }
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
