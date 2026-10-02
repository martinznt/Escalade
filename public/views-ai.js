// views-ai.js — « Créer avec l'assistant » : tu écris quelques mots (ex. « clipage en escalade »), l'IA intégrée de
// Cloudflare propose une fiche complète (ce que c'est, comment le travailler, exercices, muscles, matériel), que tu
// relis et modifies AVANT de l'enregistrer. Sans IA disponible (hors ligne, serveur sans IA), un modèle vide est proposé.
import { h, openSheet, closeSheet, toast, buzzOk, chip } from './ui.js';
import { S, ACT, SUBMIT, ctx, render, queue, putItem } from './state.js';
import { uid, normalizeEx } from './shared.js';
import { ACTIVITIES, CAPACITIES, MUSCLES, EQUIPMENT } from './model.js';
import { api } from './state.js';

const EXAMPLES = ['clipage en escalade', 'gainage pour le dévers', 'pompes diamant', 'résistance des avant-bras', 'respiration en natation'];
const acts = () => { const c = ctx(); const list = Object.values(c.activities).map((a) => [a.id, `${a.emoji} ${a.label}`]); return list.length ? list : Object.entries(ACTIVITIES).map(([id, a]) => [id, `${a.emoji} ${a.label}`]); };

export function openAssistant(kind = 'auto') {
  S.ai = { kind, activityId: S.ai?.activityId || acts()[0]?.[0] || '', text: '', loading: false, draft: null, error: '' };
  showAssistant();
}
function showAssistant() {
  const a = S.ai;
  if (a.draft) return showDraft();
  openSheet(h`<div class="ai"><div class="ai-hero"><span>🤖</span><div><h2>Créer avec l’assistant</h2><p class="small muted">Écris quelques mots, l’IA prépare une fiche complète. Tu la relis avant de l’enregistrer.</p></div></div>
    <form data-submit="aiAsk" class="stack">
      <div class="chips">${[['auto', '🤖 Laisse l’assistant choisir'], ['exercise', '💪 Un exercice'], ['capacity', '🎯 Une capacité à travailler']].map(([k, l]) => chip(a.kind === k, l, `data-act="aiKind" data-id="${k}"`))}</div>
      <label>Ton idée<input name="text" required minlength="2" maxlength="300" autofocus placeholder="Ex. clipage en escalade" value="${a.text}"></label>
      <div class="chips">${EXAMPLES.map((x) => h`<button type="button" class="chip ghost" data-act="aiExample" data-v="${x}">${x}</button>`)}</div>
      <label>Pour quel sport ?<select name="activityId">${acts().map(([id, l]) => h`<option value="${id}" ${a.activityId === id ? 'selected' : ''}>${l}</option>`)}</select></label>
      ${a.error ? h`<p class="small warn-t">${a.error}</p>` : ''}
      <button class="btn pri big" type="submit" ${a.loading ? 'disabled' : ''}>${a.loading ? '⏳ L’assistant réfléchit…' : 'Créer la fiche'}</button>
      ${a.error ? h`<button type="button" class="btn ghost" data-act="aiManual">Remplir moi-même sans l’IA</button>` : ''}
    </form><p class="tiny muted">Seul le texte que tu écris est envoyé à l’IA (hébergée chez Cloudflare), jamais tes performances ou ton historique.</p></div>`, { wide: true });
}
ACT.aiOpen = (el) => openAssistant(el.dataset.id || 'auto');
ACT.aiKind = (el) => { const f = document.querySelector('#sheet form[data-submit=aiAsk]'); if (f) S.ai.text = f.text.value; S.ai.kind = el.dataset.id; showAssistant(); };
ACT.aiExample = (el) => { const i = document.querySelector('#sheet input[name=text]'); if (i) { i.value = el.dataset.v; i.focus(); } };
SUBMIT.aiAsk = async (f) => {
  const d = Object.fromEntries(new FormData(f));
  Object.assign(S.ai, { text: d.text, activityId: d.activityId, loading: true, error: '' }); showAssistant();
  try {
    const r = await api('POST', '/api/ai/draft', { text: d.text, kind: S.ai.kind, activityId: d.activityId }, { timeout: 45000 });
    S.ai.draft = r.draft; S.ai.loading = false; showAssistant();
  } catch (e) {
    S.ai.loading = false;
    S.ai.error = e.guest ? 'L’assistant IA demande un compte gratuit (en haut des Paramètres : « Créer mon compte »). En attendant, tu peux remplir la fiche toi-même.'
      : e.offline ? 'Pas de connexion : l’assistant IA a besoin d’internet. Tu peux remplir la fiche toi-même.' : e.message;
    showAssistant();
  }
};
ACT.aiManual = () => { S.ai.draft = S.ai.kind === 'capacity' ? { type: 'capacity', label: S.ai.text, emoji: '🎯', summary: '', why: '', howTo: [], linkedCaps: {}, exercises: [], manual: true } : { type: 'exercise', name: S.ai.text, emoji: '💪', summary: '', why: '', steps: [], cues: [], mistakes: [], variants: [], caps: {}, prim: [], sec: [], needs: [], mode: 'reps', sets: 3, repsMin: 8, repsMax: 10, secMin: 30, secMax: 30, rest: 90, diff: 2, manual: true }; showAssistant(); };
ACT.aiAgain = () => { S.ai.draft = null; showAssistant(); };

const capChips = (caps) => Object.entries(caps || {}).map(([id, w]) => h`<span class="chip static">${CAPACITIES[id]?.label || id} ${w >= 0.8 ? '●●●' : w >= 0.5 ? '●●' : '●'}</span>`);
const ul = (arr) => (arr?.length ? h`<ul class="small">${arr.map((x) => h`<li>${x}</li>`)}</ul>` : '');
function exBlock(e, editable) {
  const presc = e.mode === 'time' ? `${e.sets} × ${e.secMin === e.secMax ? e.secMin : e.secMin + '–' + e.secMax} s` : `${e.sets} × ${e.repsMin === e.repsMax ? e.repsMin : e.repsMin + '–' + e.repsMax}`;
  return h`${editable ? h`<label>Nom<input name="name" maxlength="80" value="${e.name}"></label>` : h`<h3>${e.emoji} ${e.name}</h3>`}
    ${e.summary ? h`<p>${e.summary}</p>` : ''}
    <div class="chips">${h`<span class="chip static">📋 ${presc}</span>`}${e.rest ? h`<span class="chip static">⏸ repos ${e.rest} s</span>` : ''}${h`<span class="chip static">📶 difficulté ${e.diff}/5</span>`}${(e.needs || []).map((n) => h`<span class="chip static">🧰 ${EQUIPMENT[n] || n}</span>`)}</div>
    ${e.why ? h`<p class="small"><b>Ce que ça travaille :</b> ${e.why}</p>` : ''}${Object.keys(e.caps || {}).length ? h`<div class="chips">${capChips(e.caps)}</div>` : ''}
    ${e.steps?.length ? h`<details class="how" open><summary>Comment faire</summary>${ul(e.steps)}</details>` : ''}
    ${e.cues?.length || e.mistakes?.length ? h`<details class="how"><summary>Conseils et erreurs à éviter</summary>${ul(e.cues)}${e.mistakes?.length ? h`<b class="small">À éviter</b>${ul(e.mistakes)}` : ''}</details>` : ''}
    ${e.prim?.length || e.sec?.length ? h`<p class="tiny muted">Muscles : ${[...(e.prim || []), ...(e.sec || [])].map((m) => MUSCLES[m]?.label || m).join(', ')}</p>` : ''}
    ${e.variants?.length ? h`<details class="how"><summary>Variantes</summary>${ul(e.variants)}</details>` : ''}`;
}
function showDraft() {
  const d = S.ai.draft, ia = !d.manual;
  const badge = ia ? h`<span class="tag acc">🤖 proposé par l’assistant · confiance ${d.confidence}</span>` : h`<span class="tag">modèle à compléter</span>`;
  const body = d.type === 'exercise'
    ? h`<form data-submit="aiSaveEx" class="stack">${badge}${exBlock(d, true)}
        ${d.safety ? h`<p class="tiny warn-t">⚠️ ${d.safety}</p>` : ''}
        <p class="tiny muted">Relis la fiche : tu pourras tout modifier ensuite dans Bibliothèque › Exercices.</p>
        <button class="btn pri big" type="submit">✓ Ajouter à mes exercices</button></form>`
    : h`<form data-submit="aiSaveCap" class="stack">${badge}
        <label>Nom de la capacité<input name="label" maxlength="60" value="${d.label}"></label>
        ${d.summary ? h`<p>${d.emoji} ${d.summary}</p>` : ''}${d.why ? h`<p class="small"><b>Pourquoi c’est utile :</b> ${d.why}</p>` : ''}
        ${d.howTo?.length ? h`<div class="card flat"><b>Comment la travailler</b>${ul(d.howTo)}</div>` : ''}
        ${Object.keys(d.linkedCaps || {}).length ? h`<div><b class="small">Liée à</b><div class="chips">${capChips(d.linkedCaps)}</div></div>` : ''}
        ${d.exercises?.length ? h`<b>Exercices proposés</b>${d.exercises.map((e, i) => h`<details class="card flat exd"><summary><label class="chk" style="display:inline-flex"><input type="checkbox" name="ex" value="${i}" checked> ${e.emoji} ${e.name}</label></summary>${exBlock(e, false)}</details>`)}` : ''}
        ${d.measure?.label ? h`<p class="small">📏 <b>Mesurer tes progrès :</b> ${d.measure.label}${d.measure.unit ? ` (${d.measure.unit})` : ''}</p>` : ''}
        ${d.safety ? h`<p class="tiny warn-t">⚠️ ${d.safety}</p>` : ''}
        <button class="btn pri big" type="submit">✓ Enregistrer la capacité${d.exercises?.length ? ' et les exercices cochés' : ''}</button></form>`;
  openSheet(h`<div class="ai">${body}<button class="btn ghost" data-act="aiAgain">↺ Recommencer</button></div>`, { wide: true });
}
function toPersonal(e, activityId, extraCaps = {}) {
  const ex = normalizeEx({ name: e.name, emoji: e.emoji, mode: e.mode, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, secMin: e.secMin, secMax: e.secMax, rest: e.rest,
    ok: [...(e.steps || []), ...(e.cues || [])], bad: e.mistakes || [], caps: { ...(e.caps || {}), ...extraCaps }, prim: e.prim, sec: e.sec, needs: e.needs, diff: e.diff, acts: activityId ? [activityId] : [],
    why: [e.summary, e.why].filter(Boolean).join(' ').slice(0, 400) });
  delete ex.id;
  const id = uid(); S.personal.push({ id, name: ex.name, data: ex }); queue('POST', '/api/exercises/personal', { id, exercise: ex });
  return ex.name;
}
SUBMIT.aiSaveEx = (f) => {
  const d = { ...S.ai.draft, name: String(new FormData(f).get('name') || S.ai.draft.name).trim() || S.ai.draft.name };
  const name = toPersonal(d, S.ai.activityId);
  closeSheet(); buzzOk(); toast(`« ${name} » ajouté à tes exercices 👍`, 3500); S.ai = null; render();
};
SUBMIT.aiSaveCap = (f) => {
  const fd = new FormData(f), d = S.ai.draft, chosen = new Set(fd.getAll('ex').map(Number));
  const label = String(fd.get('label') || d.label).trim() || d.label, catId = 'cat-' + uid().slice(0, 12);
  putItem('category', catId, { activityId: S.ai.activityId, label, emoji: d.emoji, description: (d.summary || '').slice(0, 180), guide: (d.why || '').slice(0, 600), howTo: d.howTo || [],
    caps: Object.entries(d.linkedCaps || {}).map(([id, w]) => ({ id, w })), source: d.manual ? '' : 'ia' });
  const names = (d.exercises || []).filter((_, i) => chosen.has(i)).map((e) => toPersonal(e, S.ai.activityId, { [catId]: 1 }));
  closeSheet(); buzzOk(); toast(`Capacité « ${label} » enregistrée${names.length ? ` avec ${names.length} exercice(s)` : ''} 👍`, 4000); S.ai = null; render();
};
