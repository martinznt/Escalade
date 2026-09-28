// views-gen.js — « Séance du jour » : forme du moment, séance voulue, et ce qu'on veut travailler
// (objectifs, intentions du sport, forces, faiblesses, muscles, zones à ménager), tout en choix multiples.
// On peut ajouter une intention / une force / une faiblesse en l'écrivant : l'assistant la relie aux bonnes capacités,
// et on peut la proposer à tout le monde (les administrateurs reçoivent la proposition).
import { h, raw, chip, openSheet, closeSheet, toast, skeleton } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, render, putItem, api, ls, item } from './state.js';
import { uid } from './shared.js';
import { CAPACITIES, EQUIPMENT, ACTIVITIES } from './model.js';
import { activeGoals, goalLabel, profileCapacities, STATUS_WORD } from './brain.js';
import { PART_TYPES, PRESETS, MAX_TOTAL, cleanParts, presetParts, scaleParts, totalMinutes, partLabel, formatName, formatAdvice, parseFormats } from './format.js';
import { sourcesLine } from './srcui.js';
import { chooseScope, saveFormatGlobal, shareButton } from './content.js';
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

const DURS = [20, 30, 45, 60, 90, 120, 180];
export const durLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`);
const savedFormats = () => parseFormats(item('config', 'formats')?.formats);
/** Format de la séance : automatique, tout prêt, gardé, ou sur mesure (parties dans l'ordre voulu, temps de chacune). */
function formatBox(g) {
  const saved = savedFormats(), parts = g.parts || null, total = totalMinutes(parts || []);
  return h`<span class="kicker">3 · Format de la séance</span>
    <div class="chips">${chip(!parts, 'Automatique', 'data-act="gFmt" data-v=""')}${PRESETS.map(([id, name]) => chip(g.fmtId === id, name, `data-act="gFmt" data-v="${id}"`))}${saved.map((f) => chip(g.fmtId === f.id, '⭐ ' + f.name, `data-act="gFmt" data-v="${f.id}"`))}${chip(!!parts && g.fmtId === 'custom', '✏️ Je compose', 'data-act="gFmt" data-v="custom"')}</div>
    ${!parts ? h`<p class="tiny muted">L’app répartit le temps : échauffement, corps de séance, retour au calme.</p>` : h`<div class="card flat parts">
      <div class="blocksbar">${parts.map((p) => h`<i class="${PART_TYPES[p.type].block}" style="flex:${p.minutes}" title="${partLabel(p.type)} ${p.minutes} min"></i>`)}</div>
      ${parts.map((p, i) => h`<div class="partrow"><span class="grow"><b class="small">${partLabel(p.type)}</b>
        <select class="partact" data-change="gPartAct" data-i="${i}" aria-label="Sport de cette partie"><option value="">${ACTIVITIES[g.activityId]?.emoji || ''} Même sport</option>${sportsList(g.activityId).map(([id, e, l]) => h`<option value="${id}" ${p.activity === id ? 'selected' : ''}>${e} ${l}</option>`)}</select></span>
        <div class="stepper sm"><button type="button" data-act="gPartMin" data-i="${i}" data-d="-1" aria-label="Moins de temps">−</button><b aria-label="${p.minutes} minutes">${p.minutes}′</b><button type="button" data-act="gPartMin" data-i="${i}" data-d="1" aria-label="Plus de temps">+</button></div>
        <button type="button" class="btn sm ic" data-act="gPartUp" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button type="button" class="btn sm ic" data-act="gPartDel" data-i="${i}" aria-label="Retirer">✕</button></div>`)}
      <div class="row between"><b>Total : ${durLabel(total)}</b>${total >= MAX_TOTAL ? h`<span class="tiny muted">4 h au maximum</span>` : ''}</div>
      <details class="how mini"><summary>＋ Ajouter une partie</summary><div class="chips">${Object.entries(PART_TYPES).map(([k, t]) => chip(false, `${t.emoji} ${t.label}`, `data-act="gPartAdd" data-v="${k}"`))}</div></details>
      ${formatAdvice(parts).map((a) => h`<p class="tiny warn-t">${a.text}</p>${a.sources.length ? sourcesLine(a.sources) : ''}`)}
      <div class="row wrapf"><button type="button" class="btn sm" data-act="gFmtSave">💾 Garder ce format</button>${saved.some((f) => f.id === g.fmtId) ? h`${S.user?.isAdmin ? '' : shareButton('format', g.fmtId)}<button type="button" class="btn sm danger" data-act="gFmtDel" data-v="${g.fmtId}">Supprimer ce format</button>` : ''}</div></div>`}`;
}
const reset = () => { S.gen.plan = null; S.gen.result = null; };
/** Sports proposés pour une partie : ceux du profil d'abord, puis les autres. */
function sportsList(current) {
  const mine = Object.values(ctx().activities).map((a) => a.id);
  return [...new Set([...mine, ...Object.keys(ACTIVITIES)])].filter((id) => id !== current).map((id) => [id, ACTIVITIES[id]?.emoji || ctx().activities[id]?.emoji || '🏅', ACTIVITIES[id]?.label || ctx().activities[id]?.label || id]);
}
CHG.gPartAct = (el) => editParts((p) => { const x = p[Number(el.dataset.i)]; if (!x) return; if (el.value) x.activity = el.value; else delete x.activity; });
const setParts = (parts) => { const g = G(); g.parts = cleanParts(parts); g.minutes = Math.max(5, totalMinutes(g.parts)); reset(); render(); };
ACT.gDur = (el) => { const g = G(), m = Number(el.dataset.v); g.durOther = false; if (g.parts) { setParts(scaleParts(g.parts, m)); return; } g.minutes = m; reset(); render(); };
ACT.gDurOther = () => { const g = G(); g.durOther = !g.durOther; if (!g.durOther && !DURS.includes(Number(g.minutes))) { g.minutes = 30; if (g.parts) { setParts(scaleParts(g.parts, 30)); return; } reset(); } render(); };
CHG.gDurIn = (el) => { const g = G(), m = Math.max(5, Math.min(MAX_TOTAL, Math.round((Number(el.value) || 30) / 5) * 5)); if (g.parts) { setParts(scaleParts(g.parts, m)); return; } g.minutes = m; reset(); render(); };
ACT.gFmt = (el) => {
  const g = G(), v = el.dataset.v, m = Number(g.minutes) || 60;
  if (!v) { g.parts = null; g.fmtId = ''; reset(); render(); return; }
  const saved = savedFormats().find((f) => f.id === v);
  g.fmtId = v;
  if (saved) { setParts(saved.parts); return; }
  if (v === 'custom') { setParts(g.parts?.length ? g.parts : presetParts('classique', m)); return; }
  setParts(presetParts(v, m));
};
const editParts = (fn) => { const g = G(), p = (g.parts || []).map((x) => ({ ...x })); fn(p); g.fmtId = g.fmtId && !PRESETS.some(([id]) => id === g.fmtId) && g.fmtId !== 'custom' ? g.fmtId : 'custom'; setParts(p); };
ACT.gPartMin = (el) => editParts((p) => { const x = p[Number(el.dataset.i)]; if (!x) return; const step = x.minutes + Number(el.dataset.d) * 5 < 5 || x.minutes < 5 ? 1 : 5; const room = MAX_TOTAL - totalMinutes(p); x.minutes = Math.max(1, x.minutes + Math.min(Number(el.dataset.d) * step, room)); });
ACT.gPartUp = (el) => editParts((p) => { const i = Number(el.dataset.i); if (i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]]; });
ACT.gPartDel = (el) => { if ((G().parts || []).length <= 1) { toast('Garde au moins une partie, ou choisis « Automatique ».'); return; } editParts((p) => p.splice(Number(el.dataset.i), 1)); };
ACT.gPartAdd = (el) => {
  if (totalMinutes(G().parts) >= MAX_TOTAL) { toast('La séance fait déjà 4 h : raccourcis une partie d’abord.'); return; }
  const t = el.dataset.v; editParts((p) => { const room = MAX_TOTAL - totalMinutes(p), m = Math.min(room, t === 'warmup' || t === 'cool' ? 10 : 15); const at = t === 'warmup' ? 0 : t === 'cool' || t === 'stretch' ? p.length : Math.max(0, p.findLastIndex((x) => x.type !== 'cool' && x.type !== 'stretch') + 1); p.splice(at, 0, { type: t, minutes: m }); });
};
ACT.gFmtSave = () => {
  const g = G(); if (!g.parts?.length) return;
  openSheet(h`<form data-submit="gFmtSaveGo" class="stack"><h2 style="margin:0">💾 Garder ce format</h2><p class="small muted">${g.parts.map((p) => `${partLabel(p.type)} ${p.minutes} min`).join(' · ')}</p>
    <label>Nom<input name="name" maxlength="40" required value="${formatName(g.parts).slice(0, 40)}"></label><button class="btn pri big">Garder</button></form>`);
};
SUBMIT.gFmtSaveGo = async (f) => {
  const g = G(), name = String(new FormData(f).get('name') || '').trim().slice(0, 40) || formatName(g.parts);
  const scope = await chooseScope(`Garder le format « ${name} »`); if (!scope) return;
  if (scope === 'all') {
    const id = PRESETS.some(([pid]) => pid === g.fmtId) ? g.fmtId : 'g-' + uid().slice(0, 12);
    try { await saveFormatGlobal(id, name, cleanParts(g.parts)); g.fmtId = id; toast('Format enregistré pour tout le monde'); render(); } catch (e) { toast(e.message, 4500, 'bad'); }
    return;
  }
  const list = savedFormats(); if (list.length >= 12) { toast('12 formats au maximum : supprime-en un.'); return; }
  const id = 'f-' + uid().slice(0, 12); list.push({ id, name, parts: cleanParts(g.parts) });
  putItem('config', 'formats', { formats: JSON.stringify(list) }); g.fmtId = id; closeSheet(); toast('Format gardé : il est dans la liste'); render();
};
ACT.gFmtDel = (el) => { const list = savedFormats().filter((f) => f.id !== el.dataset.v); putItem('config', 'formats', { formats: JSON.stringify(list) }); G().fmtId = 'custom'; toast('Format supprimé'); render(); };

export function vGenerateForm(activityOptions) {
  const g = G(), c = ctx();
  loadCommunity();
  const goals = activeGoals(c), intents = intentsFor(g.activityId, extraIntents());
  const sw = strengthsAndWeak(g.activityId), eq = [...new Set((c.envs.find((e) => e.id === g.envId) || c.defEnv)?.equipment || [])];
  const fe = resolveFeel(g.forme || 'ok', g.feel || 'mod');
  const other = !!g.durOther || !DURS.includes(Number(g.minutes));
  return h`<div class="card gen">
    <div class="formerow"><span class="kicker">Je me sens</span><div class="chips">${FORMES.map(([k, e, l]) => toggleChip((g.forme || 'ok') === k, `${e} ${l}`, 'gForme', k))}</div></div>
    <div class="formerow"><span class="kicker">Je veux une séance</span><div class="chips">${FEELS.map(([k, e, l]) => toggleChip((g.feel || 'mod') === k, `${e} ${l}`, 'gFeel', k))}</div>${fe.note ? h`<p class="tiny acc-t">${fe.note}</p>` : ''}</div>
    <span class="kicker">1 · Quel sport ?</span><div class="chips big">${activityOptions().map(([id, e, l]) => chip(g.activityId === id, `${e} ${l}`, `data-act="gSet" data-k="activityId" data-v="${id}"`))}</div>
    <span class="kicker">2 · Combien de temps ?</span><div class="chips big">${DURS.map((m) => chip(!other && Number(g.minutes) === m, durLabel(m), `data-act="gDur" data-v="${m}"`))}${chip(other, 'Autre durée', 'data-act="gDurOther"')}</div>
    ${other ? h`<label class="row durrow"><input type="number" class="durin" min="5" max="${MAX_TOTAL}" step="5" value="${g.minutes}" data-change="gDurIn" aria-label="Durée en minutes"><span>min</span><span class="tiny muted">de 5 min à 4 h</span></label>` : ''}
    ${formatBox(g)}
    <span class="kicker">4 · Ce que je veux travailler <span class="tiny muted">(facultatif, plusieurs choix)</span></span>
    <div class="gsecs">
      ${section('goals', '🎯 Mes objectifs', arr('goalIds').length, goals.length ? h`<div class="chips">${goals.map((x) => toggleChip(arr('goalIds').includes(x.id), goalLabel(x), 'gPick', x.id, 'data-k="goalIds"'))}</div>` : h`<p class="small muted">Aucun objectif actif. <button class="btn sm" data-act="allGo" data-to="profile/goals">En ajouter</button></p>`)}
      ${section('intents', '🧭 Intentions', arr('intentIds').length, h`<div class="chips">${intents.map((x) => toggleChip(arr('intentIds').includes(x.id), `${x.emoji} ${x.label}${x.custom === 'commune' ? ' ·👥' : x.custom ? ' ·✍️' : ''}`, 'gPick', x.id, 'data-k="intentIds"'))}<button type="button" class="chip add" data-act="gWrite" data-k="intent">＋ Autre</button></div>`)}
      ${section('strengths', '💪 Mes forces', arr('strengthCaps').length, h`<div class="chips">${sw.strengths.length ? sw.strengths.map((x) => toggleChip(arr('strengthCaps').includes(x.id), x.label, 'gPick', x.id, 'data-k="strengthCaps"')) : h`<span class="small muted">Pas encore de point fort connu (fais quelques mesures dans Profil).</span>`}<button type="button" class="chip add" data-act="gWrite" data-k="strength">＋ Ajouter</button></div>`)}
      ${section('weak', '🌱 Mes faiblesses', arr('weakCaps').length, h`<div class="chips">${sw.weak.map((x) => toggleChip(arr('weakCaps').includes(x.id), `${x.label}${x.tag ? ' · ' + x.tag : ''}`, 'gPick', x.id, 'data-k="weakCaps"'))}<button type="button" class="chip add" data-act="gWrite" data-k="weakness">＋ Ajouter</button></div>`)}
      ${section('muscles', '🫀 Muscles', arr('muscles').length, h`<div class="chips">${MUSCLE_GROUPS.map(([k, l]) => toggleChip(arr('muscles').includes(k), l, 'gPick', k, 'data-k="muscles"'))}</div>`)}
      ${section('zones', '🩹 Zones à ménager', arr('zones').length, h`<div class="chips">${AVOID_ZONES.map(([k, l]) => toggleChip(arr('zones').includes(k), l, 'gPick', k, 'data-k="zones"'))}</div><p class="tiny muted">Pour cette séance seulement. Pas un avis médical : en cas de douleur, consulte un professionnel.</p>`)}
      ${section('place', '📍 Lieu et matériel', g.envId ? 1 : 0, h`<label>Lieu<select data-change="gEnv"><option value="">${c.defEnv ? 'Par défaut : ' + c.defEnv.name : 'Aucun décrit'}</option>${c.envs.map((e) => h`<option value="${e.id}" ${g.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label>
        <div class="chips">${eq.length ? eq.map((k) => h`<span class="chip static">${EQUIPMENT[k] || k}</span>`) : h`<span class="small muted">Aucun matériel déclaré</span>`}</div>
`)}
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
    light: fe.light || !!g.light, boost: fe.boost, feelNote: fe.note, parts: g.parts ? cleanParts(g.parts) : [],
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
