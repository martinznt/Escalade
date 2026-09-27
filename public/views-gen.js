// views-gen.js — « Séance du jour » : forme du moment, séance voulue, et ce qu'on veut travailler
// (objectifs, intentions du sport, forces, faiblesses, muscles, zones à ménager), tout en choix multiples.
// On peut ajouter une intention / une force / une faiblesse en l'écrivant : l'assistant la relie aux bonnes capacités,
// et on peut la proposer à tout le monde (les administrateurs reçoivent la proposition).
import { h, raw, chip, openSheet, closeSheet, toast, skeleton } from './ui.js';
import { S, ACT, SUBMIT, ctx, render, putItem, api, ls } from './state.js';
import { uid } from './shared.js';
import { CAPACITIES, EQUIPMENT, ACTIVITIES } from './model.js';
import { activeGoals, goalLabel, profileCapacities, STATUS_WORD } from './brain.js';
import { intentsFor, MUSCLE_GROUPS, AVOID_ZONES, FORMES, FEELS, resolveFeel, keywordCaps } from './intentions.js';

const G = () => S.gen;
const arr = (k) => (G()[k] ||= []);
const capLabel = (id) => CAPACITIES[id]?.label || ctx().categories[id]?.label || id;

/** Intentions ajoutées : personnelles (catégories « intent ») et communes (validées par un administrateur). */
export function extraIntents() {
  const c = ctx(), mine = Object.values(c.categories).filter((x) => x.kind === 'intent' && !x.archived).map((x) => ({ id: x.id, activityId: x.activityId, label: x.label, emoji: x.emoji, caps: Object.fromEntries((x.caps || []).map((k) => [k.id, k.w])), source: 'perso' }));
  const com = (S.community?.intents || ls.get('sea:community-intents', []) || []).map((x) => ({ ...x, source: 'commune' }));
  return [...mine, ...com];
}
let fetched = 0;
function loadCommunity() {
  if (S.user?.guest || Date.now() - fetched < 10 * 60000) return;
  fetched = Date.now();
  api('GET', '/api/community/intents').then((r) => { S.community = { intents: r.intents || [] }; ls.set('sea:community-intents', r.intents || []); render(); }).catch(() => {});
}
/** Forces et faiblesses proposées pour ce sport (+ celles ajoutées à la main). */
function strengthsAndWeak(activityId) {
  const c = ctx(), st = profileCapacities(c, activityId);
  const known = st.filter((x) => x.level != null).sort((a, b) => b.level - a.level || b.relevance - a.relevance);
  const focus = Object.values(c.categories).filter((x) => x.kind === 'focus' && !x.archived && (!x.activityId || x.activityId === activityId));
  const strengths = [...known.filter((x) => x.level >= 1).slice(0, 8).map((x) => ({ id: x.capId, label: x.label, tag: STATUS_WORD[x.status] })), ...focus.filter((x) => x.side === 'strength').map((x) => ({ id: x.id, label: x.label, tag: 'ajouté' }))];
  const weakBase = [...st.filter((x) => x.level == null || x.level <= 1)].sort((a, b) => (a.level ?? 0.5) - (b.level ?? 0.5) || b.relevance - a.relevance);
  const weak = [...weakBase.slice(0, 8).map((x) => ({ id: x.capId, label: x.label, tag: x.level == null ? 'à évaluer' : STATUS_WORD[x.status] })), ...focus.filter((x) => x.side === 'weakness').map((x) => ({ id: x.id, label: x.label, tag: 'ajouté' }))];
  return { strengths, weak };
}

const section = (key, title, count, body) => h`<details class="fold gsec" ${S.gen.open === key ? 'open' : ''}><summary data-act="gOpen" data-k="${key}"><span>${title}</span>${count ? h`<em>${count}</em>` : ''}</summary><div class="gsecb">${body}</div></details>`;
const toggleChip = (on, label, act, v, extra = '') => chip(on, label, `data-act="${act}" data-v="${v}" ${extra}`);

export function vGenerateForm(activityOptions) {
  const g = G(), c = ctx();
  loadCommunity();
  const goals = activeGoals(c), intents = intentsFor(g.activityId, extraIntents());
  const sw = strengthsAndWeak(g.activityId), eq = [...new Set((c.envs.find((e) => e.id === g.envId) || c.defEnv)?.equipment || [])];
  const fe = resolveFeel(g.forme || 'ok', g.feel || 'mod');
  return h`<div class="card gen">
    <div class="formerow"><span class="kicker">Je me sens</span><div class="chips">${FORMES.map(([k, e, l]) => toggleChip((g.forme || 'ok') === k, `${e} ${l}`, 'gForme', k))}</div></div>
    <div class="formerow"><span class="kicker">Je veux une séance</span><div class="chips">${FEELS.map(([k, e, l]) => toggleChip((g.feel || 'mod') === k, `${e} ${l}`, 'gFeel', k))}</div>${fe.note ? h`<p class="tiny acc-t">${fe.note}</p>` : ''}</div>
    <span class="kicker">1 · Quel sport ?</span><div class="chips big">${activityOptions().map(([id, e, l]) => chip(g.activityId === id, `${e} ${l}`, `data-act="gSet" data-k="activityId" data-v="${id}"`))}</div>
    <span class="kicker">2 · Combien de temps ?</span><div class="chips big">${[10, 20, 30, 45, 60, 90].map((m) => chip(Number(g.minutes) === m, m < 60 ? `${m} min` : m === 60 ? '1 h' : '1 h 30', `data-act="gSet" data-k="minutes" data-v="${m}"`))}</div>
    <span class="kicker">3 · Ce que je veux travailler <span class="tiny muted">(facultatif, plusieurs choix)</span></span>
    <div class="gsecs">
      ${section('goals', '🎯 Mes objectifs', arr('goalIds').length, goals.length ? h`<div class="chips">${goals.map((x) => toggleChip(arr('goalIds').includes(x.id), goalLabel(x), 'gPick', x.id, 'data-k="goalIds"'))}</div>` : h`<p class="small muted">Aucun objectif actif. <button class="btn sm" data-act="allGo" data-to="profile/goals">En ajouter</button></p>`)}
      ${section('intents', '🧭 Intentions', arr('intentIds').length, h`<div class="chips">${intents.map((x) => toggleChip(arr('intentIds').includes(x.id), `${x.emoji} ${x.label}${x.custom === 'commune' ? ' ·👥' : x.custom ? ' ·✍️' : ''}`, 'gPick', x.id, 'data-k="intentIds"'))}<button type="button" class="chip add" data-act="gWrite" data-k="intent">＋ Autre</button></div>`)}
      ${section('strengths', '💪 Mes forces', arr('strengthCaps').length, h`<div class="chips">${sw.strengths.length ? sw.strengths.map((x) => toggleChip(arr('strengthCaps').includes(x.id), x.label, 'gPick', x.id, 'data-k="strengthCaps"')) : h`<span class="small muted">Pas encore de point fort connu (fais quelques mesures dans Profil).</span>`}<button type="button" class="chip add" data-act="gWrite" data-k="strength">＋ Ajouter</button></div>`)}
      ${section('weak', '🌱 Mes faiblesses', arr('weakCaps').length, h`<div class="chips">${sw.weak.map((x) => toggleChip(arr('weakCaps').includes(x.id), `${x.label}${x.tag ? ' · ' + x.tag : ''}`, 'gPick', x.id, 'data-k="weakCaps"'))}<button type="button" class="chip add" data-act="gWrite" data-k="weakness">＋ Ajouter</button></div>`)}
      ${section('muscles', '🫀 Muscles', arr('muscles').length, h`<div class="chips">${MUSCLE_GROUPS.map(([k, l]) => toggleChip(arr('muscles').includes(k), l, 'gPick', k, 'data-k="muscles"'))}</div>`)}
      ${section('zones', '🩹 Zones à ménager', arr('zones').length, h`<div class="chips">${AVOID_ZONES.map(([k, l]) => toggleChip(arr('zones').includes(k), l, 'gPick', k, 'data-k="zones"'))}</div><p class="tiny muted">Pour cette séance seulement. Pas un avis médical : en cas de douleur, consulte un professionnel.</p>`)}
      ${section('place', '📍 Lieu et matériel', g.envId ? 1 : 0, h`<label>Lieu<select data-change="gEnv"><option value="">${c.defEnv ? 'Par défaut : ' + c.defEnv.name : 'Aucun décrit'}</option>${c.envs.map((e) => h`<option value="${e.id}" ${g.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label>
        <div class="chips">${eq.length ? eq.map((k) => h`<span class="chip static">${EQUIPMENT[k] || k}</span>`) : h`<span class="small muted">Aucun matériel déclaré</span>`}</div>
        <b class="small">Autres durées</b><div class="chips">${[5, 12, 15, 120].map((m) => chip(Number(g.minutes) === m, m < 60 ? `${m} min` : '2 h', `data-act="gSet" data-k="minutes" data-v="${m}"`))}</div>`)}
    </div>
    <button class="btn pri big" data-act="genPlan">Préparer ma séance</button></div>`;
}
ACT.gOpen = (el) => { S.gen.open = S.gen.open === el.dataset.k ? '' : el.dataset.k; render(); };
ACT.gForme = (el) => { S.gen.forme = el.dataset.v; S.gen.plan = null; S.gen.result = null; render(); };
ACT.gFeel = (el) => { S.gen.feel = el.dataset.v; S.gen.plan = null; S.gen.result = null; render(); };
ACT.gPick = (el) => { const k = el.dataset.k, v = el.dataset.v, list = arr(k), i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); S.gen.plan = null; S.gen.result = null; render(); };

/** Une force / faiblesse ajoutée à la main vaut pour ses capacités. */
const expand = (ids = []) => [...new Set(ids.flatMap((id) => { const cat = ctx().categories[id]; return cat?.kind === 'focus' ? (cat.caps || []).map((c) => c.id) : [id]; }))];
/** Options envoyées au calcul de la séance (depuis les choix de l'écran). */
export function genOptions() {
  const g = G(), all = intentsFor(g.activityId, extraIntents()), fe = resolveFeel(g.forme || 'ok', g.feel || 'mod');
  return {
    goalIds: [...(g.goalIds || [])], intents: all.filter((x) => (g.intentIds || []).includes(x.id)).map((x) => ({ label: x.label, caps: x.caps })),
    strengthCaps: expand(g.strengthCaps), weakCaps: expand(g.weakCaps), muscles: [...(g.muscles || [])], avoidZones: [...(g.zones || [])],
    light: fe.light || !!g.light, boost: fe.boost, feelNote: fe.note,
  };
}

/* ───────── Écrire une intention / une force / une faiblesse ───────── */
const KIND = { intent: ['🧭', 'Une intention', 'Ex. « travailler les talons crochets », « gagner en explosivité sur les jetés »'], strength: ['💪', 'Un point fort', 'Ex. « je suis à l’aise en dévers »'], weakness: ['🌱', 'Un point faible', 'Ex. « je glisse des pieds sur les petites prises »'] };
ACT.gWrite = (el) => {
  const k = el.dataset.k, [ic, t, ex] = KIND[k];
  openSheet(h`<form data-submit="gWriteGo" class="stack"><input type="hidden" name="kind" value="${k}"><h2 style="margin:0">${ic} ${t}, avec tes mots</h2>
    <textarea name="text" rows="2" maxlength="200" required placeholder="${ex}"></textarea>
    <p class="tiny muted">L’assistant le relie aux capacités à entraîner pour ${ACTIVITIES[S.gen.activityId]?.label?.toLowerCase() || 'ce sport'}. Tu relis avant d’ajouter.</p>
    <button class="btn pri" type="submit">Analyser</button></form>`);
};
SUBMIT.gWriteGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), text = String(d.text || '').trim(); if (text.length < 2) return;
  openSheet(h`<div class="stack"><h2 style="margin:0">${KIND[d.kind][0]} ${text}</h2>${skeleton(1)}</div>`);
  let r = null, why = '';
  try { r = (await api('POST', '/api/ai/intent', { text, activityId: S.gen.activityId, kind: d.kind }, { timeout: 45000 })).intent; }
  catch (e) { why = e.guest ? '' : e.status === 503 ? 'Assistant indisponible : proposition faite à partir de tes mots.' : e.message; }
  if (!r) { const caps = keywordCaps(text); r = Object.keys(caps).length ? { label: text.slice(0, 40), emoji: '✍️', summary: '', caps } : null; }
  if (!r) { openSheet(h`<div class="stack"><h2 style="margin:0">Pas compris</h2><p class="small">${why || 'Je n’ai pas su relier ça à un entraînement.'} Essaie avec d’autres mots.</p><button class="btn" data-act="gWrite" data-k="${d.kind}">Réessayer</button></div>`); return; }
  S.gDraft = { ...r, kind: d.kind };
  openSheet(h`<div class="stack"><h2 style="margin:0">${r.emoji} ${r.label}</h2>${why ? h`<p class="tiny warn-t">${why}</p>` : ''}${r.summary ? h`<p class="small">${r.summary}</p>` : ''}
    <b class="small">Ça travaille</b><div class="chips">${Object.keys(r.caps).map((id) => h`<span class="chip static">${capLabel(id)}</span>`)}</div>
    <button class="btn pri" data-act="gDraftSave">Ajouter et sélectionner</button>
    ${d.kind === 'intent' && !S.user?.guest ? h`<button class="btn" data-act="gDraftPropose">👥 Proposer à tout le monde</button><p class="tiny muted">Un administrateur la verra et pourra l’ajouter pour tous les utilisateurs.</p>` : ''}</div>`);
};
ACT.gDraftSave = () => {
  const r = S.gDraft; if (!r) return;
  const id = 'cat-' + uid().slice(0, 12), caps = Object.entries(r.caps).map(([cid, w]) => ({ id: cid, w }));
  putItem('category', id, { activityId: S.gen.activityId, label: r.label, description: r.summary || '', caps, emoji: r.emoji || '✍️', source: 'ia', kind: r.kind === 'intent' ? 'intent' : 'focus', side: r.kind === 'intent' ? '' : r.kind });
  if (r.kind === 'intent') arr('intentIds').push(id);
  else if (r.kind === 'strength') arr('strengthCaps').push(...caps.map((c) => c.id).filter((c) => !arr('strengthCaps').includes(c)));
  else arr('weakCaps').push(...caps.map((c) => c.id).filter((c) => !arr('weakCaps').includes(c)));
  S.gen.open = r.kind === 'intent' ? 'intents' : r.kind === 'strength' ? 'strengths' : 'weak';
  S.gDraft = null; S.gen.plan = null; closeSheet(); render(); toast('Ajouté');
};
ACT.gDraftPropose = async () => {
  const r = S.gDraft; if (!r) return;
  try { await api('POST', '/api/proposals', { kind: 'intent', label: r.label, emoji: r.emoji, caps: r.caps, activityId: S.gen.activityId, detail: r.summary || '' }); toast('Merci ! Proposition envoyée aux administrateurs.', 4000); ACT.gDraftSave(); }
  catch (e) { toast(e.message, 4000, 'bad'); }
};
