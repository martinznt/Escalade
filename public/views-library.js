// views-library.js — Bibliothèque : mes séances (création, édition, modèles, archives), générateur avec simulation,
// exercices (anatomie, capacités), bibliothèque commune (contributions, copies indépendantes), recherche.
import { h, raw, esc, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, howBox, exLine, fmtDay, relDate, numberField, buzzOk, skeleton } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, ctx, go, render, getSeance, saveSeance, deleteSeance, api, itemsOf, putItem, queue, newId, syncSoon } from './state.js';
import { uid, normalizeEx, normalizeSession, exKey } from './shared.js';
import { LIBRARY, byId, SOURCES } from './library.js';
import { CAPACITIES, MUSCLES, ACTIVITIES, INTENTIONS, EQUIPMENT, SKILLS } from './model.js';
import { parseSessionText, exportSessionText, sessionMinutes, exMinutes, parseRest } from './engine.js';
import { planSession, generateFromPlan, adaptDuration, alternatives, replaceExercise, rebuildForEquipment, newPossibilities, estimateLevel, LEVEL_LABEL, levelFor, BODY_WORDS } from './generator.js';
import { availableEquipment, graphFromExercise, goalLabel, activeGoals, neverTried, exCaps, activityLabel } from './brain.js';
import { anatomySvg } from './anatomy.js';
import { classicSearch, smartSearch } from './search.js';
import { toReference, fromReference, snapshotText, REFERENCE } from './grading.js';
import { startPlayer } from './player.js';

const capL = (id) => CAPACITIES[id]?.label || ctx().categories[id]?.label || id;
const actEmoji = (id) => ctx().activities[id]?.emoji || ACTIVITIES[id]?.emoji || '🏅';
export function activityOptions() {
  const c = ctx(), out = [];
  for (const [id, a] of Object.entries(c.activities)) out.push([id, a.emoji || '🏅', a.label]);
  for (const [id, a] of Object.entries(ACTIVITIES)) if (!c.activities[id]) out.push([id, a.emoji, a.label]);
  return out;
}
const BLOCKS = { warmup: '🔥 Échauffement', main: '💪 Corps de séance', cool: '🧘 Retour au calme' };
const levelTag = (lv) => (lv?.level ? tag(LEVEL_LABEL[lv.level] + ' (estimé)', lv.level === 'avance' ? 'warn' : lv.level === 'intermediaire' ? 'info' : 'ok') : '');
function levelDetails(lv) {
  if (!lv?.criteria) return '';
  return h`<details class="how"><summary>🔎 Pourquoi ce niveau ?</summary><p class="small">${lv.text}</p><ul>${lv.criteria.map((c) => h`<li><b>${c.label}</b> : ${c.value} <span class="muted">— ${c.effect}</span></li>`)}</ul><p class="tiny muted">Estimation automatique et approximative, jamais un classement de personnes.</p></details>`;
}

export function vLibrary() {
  const sub = S.sub.library;
  if (sub === 'seance') { const s = getSeance(S.param); if (s) return vEditor(s, 'local'); }
  if (sub === 'shared-edit' && S.sharedDraft) return vEditor(S.sharedDraft.session, 'shared');
  if (sub === 'common-detail') return vCommonDetail();
  if (sub === 'import') return vImport();
  const cur = ['seances', 'generate', 'exercises', 'common', 'search'].includes(sub) ? sub : 'seances';
  return h`<h1>Bibliothèque</h1>${seg('libSub', cur, [['seances', 'Mes séances'], ['generate', 'Générer'], ['exercises', 'Exercices'], ['common', 'Commune'], ['search', 'Recherche']])}
    ${cur === 'seances' ? vSeances() : cur === 'generate' ? vGenerate() : cur === 'exercises' ? vExercises() : cur === 'common' ? vCommon() : vSearch()}`;
}
ACT.libSub = (el) => { go('library', el.dataset.id); if (el.dataset.id === 'common') loadCommon(); };

/* ═════════ Mes séances ═════════ */
function vSeances() {
  const f = S.filters.seances || 'active';
  const list = S.seances.items.filter((s) => (f === 'archived' ? s.archived : f === 'templates' ? s.template && !s.archived : !s.archived));
  return h`<div class="row wrapf"><button class="btn pri" data-act="newSeance">＋ Nouvelle séance</button><button class="btn" data-act="openImport">📋 Coller un texte</button><button class="btn" data-act="libSub" data-id="generate">✨ Générer</button></div>
    <div class="chips">${[['active', 'Actives'], ['templates', 'Modèles'], ['archived', 'Archivées']].map(([k, l]) => chip(f === k, l, `data-act="seanceFilter" data-id="${k}"`))}</div>
    ${list.length ? list.map((s) => h`<div class="card"><div class="row"><div class="ico">${s.emoji}</div><div class="grow"><b>${s.name}</b><div class="muted small">${s.activity ? activityLabel(s.activity, ctx()) + ' · ' : ''}${s.exercises.filter((e) => e.block === 'main').length || s.exercises.length} exercice(s) · ~${sessionMinutes(s)} min${s.template ? ' · modèle' : ''}${s.source === 'copy' ? ' · copie' : s.source === 'generated' ? ' · générée' : ''}</div></div></div>
      <div class="row wrapf"><button class="btn pri sm" data-act="play" data-id="${s.id}">▶ Lancer</button><button class="btn sm" data-act="openSeance" data-id="${s.id}">Ouvrir</button><button class="btn sm" data-act="planSeance" data-id="${s.id}">📅 Planifier</button></div></div>`)
      : empty(f === 'active' ? 'Aucune séance pour l’instant. Crée-en une, colle un texte ou génère-la à partir de ton profil.' : 'Rien ici.')}`;
}
ACT.seanceFilter = (el) => { S.filters.seances = el.dataset.id; render(); };
ACT.newSeance = () => { const s = saveSeance({ id: uid(), name: 'Nouvelle séance', emoji: '🏋️', exercises: [], source: 'manual', activity: Object.keys(ctx().activities)[0] || '' }); go('library', 'seance', s.id); };
ACT.openSeance = (el) => go('library', 'seance', el.dataset.id);
ACT.play = (el) => {
  const s = el.dataset.gen ? S.gen.result?.session : el.dataset.shared ? S.shared.detail?.session : getSeance(el.dataset.id);
  closeSheet(); if (s) startPlayer(s, { eventId: el.dataset.event || null, fromGenerator: !!el.dataset.gen });
};

/* ═════════ Éditeur de séance (séance personnelle ou contribution commune) ═════════ */
function exRow(e, i, n, mode) {
  return h`<div class="item ex ${mode === 'edit' ? 'editable' : ''}"><div class="ico">${e.emoji}</div><div class="grow"><b>${e.name}</b> ${e.isNew ? tag('🆕 découverte', 'acc') : ''}<div class="muted small">${exLine(e)}</div>${e.why ? h`<div class="tiny why">💡 ${e.why}</div>` : ''}${e.note ? h`<div class="tiny acc-t">${e.note}</div>` : ''}</div>
    <div class="row tight ${mode === 'edit' ? 'acts' : ''}">${mode === 'edit' ? h`<button class="btn sm ic" data-act="exUp" data-id="${e.id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn sm ic" data-act="exDown" data-id="${e.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm ic" data-act="exSwap" data-id="${e.id}" aria-label="Remplacer">🔄</button><button class="btn sm ic" data-act="exEdit" data-id="${e.id}" aria-label="Modifier">✎</button><button class="btn danger sm ic" data-act="exDel" data-id="${e.id}" aria-label="Retirer">✕</button>` : h`<button class="btn sm ic" data-act="exInfo" data-id="${e.id}" aria-label="Détails">ⓘ</button>${mode === 'gen' ? h`<button class="btn sm ic" data-act="exSwap" data-id="${e.id}" aria-label="Remplacer">🔄</button>` : ''}`}</div></div>`;
}
export function blocksOf(s, mode) {
  const out = [];
  for (const b of ['warmup', 'main', 'cool']) {
    const list = s.exercises.filter((e) => e.block === b);
    if (!list.length) continue;
    const mins = Math.round(list.reduce((t, e) => t + exMinutes(e), 0));
    out.push(h`<div class="blockhead">${BLOCKS[b]} · ~${mins} min</div>${list.map((e) => exRow(e, s.exercises.indexOf(e), s.exercises.length, mode))}`);
  }
  return out;
}
// Séance actuellement modifiée : personnelle (S.param), contribution commune (S.sharedDraft) ou résultat du générateur.
function editing() {
  if (S.sub.library === 'shared-edit' && S.sharedDraft) return { s: S.sharedDraft.session, save: (n) => { S.sharedDraft.session = normalizeSession(n); render(); }, kind: 'shared' };
  if (S.sub.library === 'generate' && S.gen.result) return { s: S.gen.result.session, save: (n) => { S.gen.result.session = normalizeSession(n); S.gen.saved = false; render(); }, kind: 'gen' };
  const s = getSeance(S.param); return s ? { s, save: (n) => { saveSeance(n); render(); }, kind: 'local' } : null;
}
function vEditor(s, mode) {
  const c = ctx(), lv = estimateLevel(s), shared = mode === 'shared';
  const intents = new Map((s.intentions || []).map((x) => [x.id, x.p]));
  return h`<div class="row"><button class="btn sm" data-act="${shared ? 'sharedCancel' : 'backSeances'}" aria-label="Retour">‹</button><div class="grow"></div>${shared ? h`<button class="btn pri" data-act="sharedSave">💾 Enregistrer la contribution</button>` : h`<button class="btn pri" data-act="play" data-id="${s.id}">▶ Lancer</button>`}</div>
    ${shared ? h`<div class="card flat warn-b small">Tu modifies une contribution de la bibliothèque commune${S.sharedDraft.admin ? ' en tant qu’administrateur' : ''}. Les copies déjà faites par d’autres ne changeront pas.</div>` : ''}
    ${s.origin ? h`<p class="tiny muted">Copie indépendante de « ${s.origin.author || 'bibliothèque'} » (${s.origin.kind === 'common' ? 'commune' : 'publique'}) du ${fmtDay(s.origin.copiedAt)} : modifiable librement, l’original n’est jamais modifié.</p>` : ''}
    <div class="card"><div class="row"><input type="text" data-change="sEmoji" value="${s.emoji}" maxlength="4" class="emoji-in" aria-label="Emoji"><input type="text" data-change="sName" value="${s.name}" maxlength="100" aria-label="Nom de la séance"></div>
      <div class="grid2"><label>Activité<select data-change="sActivity"><option value="">—</option>${activityOptions().map(([id, e, l]) => h`<option value="${id}" ${s.activity === id ? 'selected' : ''}>${e} ${l}</option>`)}</select></label>
      <label>Environnement<select data-change="sEnv"><option value="">—</option>${c.envs.map((e) => h`<option value="${e.id}" ${s.context.env === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label></div>
      <div class="muted small">~${sessionMinutes(s)} min · ${s.exercises.length} exercice(s) ${levelTag(lv)}</div>
      <b class="small">Intentions</b><div class="chips">${Object.entries(INTENTIONS).map(([id, I]) => chip(intents.has(id), `${I.emoji} ${I.label}${intents.has(id) ? ' ×' + intents.get(id) : ''}`, `data-act="sIntent" data-id="${id}" title="Touche pour changer la priorité"`))}</div>
      <form data-submit="sAdapt" class="row"><label class="grow">Adapter la durée à<span class="unitbox"><input type="number" inputmode="numeric" name="minutes" min="5" max="240" value="${s.context.plannedMin || sessionMinutes(s)}"><em>min</em></span></label><button class="btn" type="submit">⏱ Reconstruire</button></form>
      <label>Notes<textarea data-change="sNotes" maxlength="1200" placeholder="Consignes générales, objectifs, remarques…">${s.notes.find((n) => n.title === 'Notes')?.text || ''}</textarea></label>
      ${s.notes.filter((n) => n.title !== 'Notes').map((n) => h`<details class="how"><summary>${n.title}</summary><pre class="txt">${n.text}</pre></details>`)}
      ${howBox(s.explain)}${levelDetails(lv)}</div>
    <div class="card">${s.exercises.length ? blocksOf(s, 'edit') : h`<p class="muted">Aucun exercice. Ajoute-en un.</p>`}
      <div class="row wrapf"><button class="btn pri" data-act="exAdd">＋ Ajouter un exercice</button><button class="btn" data-act="sEquip">🧰 Matériel indisponible</button></div></div>
    ${shared ? '' : h`<div class="row wrapf"><button class="btn" data-act="sDup" data-id="${s.id}">⧉ Dupliquer</button><button class="btn" data-act="sTemplate" data-id="${s.id}">${s.template ? '★ Retirer des modèles' : '☆ Enregistrer comme modèle'}</button><button class="btn" data-act="sArchive" data-id="${s.id}">${s.archived ? '↩ Désarchiver' : '🗄 Archiver'}</button>
      <button class="btn" data-act="planSeance" data-id="${s.id}">📅 Planifier</button><button class="btn" data-act="sText" data-id="${s.id}">📤 Texte</button><button class="btn" data-act="sPublish" data-id="${s.id}">🌍 Partager</button><button class="btn danger" data-act="sDelete" data-id="${s.id}">🗑 Supprimer</button></div>`}`;
}
ACT.backSeances = () => go('library', 'seances');
const edit = (fn) => { const e = editing(); if (!e) return; e.save(fn(e.s)); };
CHG.sName = (el) => edit((s) => ({ ...s, name: el.value.trim() || 'Séance' }));
CHG.sEmoji = (el) => edit((s) => ({ ...s, emoji: el.value.trim() || '🏋️' }));
CHG.sActivity = (el) => edit((s) => ({ ...s, activity: el.value }));
CHG.sEnv = (el) => edit((s) => { const env = ctx().envs.find((e) => e.id === el.value); return { ...s, context: { ...s.context, env: el.value, envName: env?.name || '', equipment: env?.equipment || s.context.equipment } }; });
CHG.sNotes = (el) => edit((s) => ({ ...s, notes: [...s.notes.filter((n) => n.title !== 'Notes'), ...(el.value.trim() ? [{ title: 'Notes', text: el.value.trim() }] : [])] }));
ACT.sIntent = (el) => edit((s) => {
  const list = [...(s.intentions || [])], i = list.findIndex((x) => x.id === el.dataset.id);
  if (i < 0) list.push({ id: el.dataset.id, p: 2 }); else if (list[i].p < 3) list[i] = { ...list[i], p: list[i].p + 1 }; else list.splice(i, 1);
  return { ...s, intentions: list };
});
SUBMIT.sAdapt = (f) => {
  const m = Number(new FormData(f).get('minutes')); const e = editing(); if (!e || !(m >= 5)) return;
  const r = adaptDuration(e.s, m, ctx());
  e.save(r.session);
  openSheet(h`<h2 style="margin:0">Séance reconstruite pour ${m} min</h2><p class="muted small">Durée estimée : ~${r.minutes} min. Les exercices les plus importants sont gardés ; échauffement, séries et repos sont ajustés.</p>${r.changes.length ? h`<ul class="small">${r.changes.map((c) => h`<li>${c}</li>`)}</ul>` : h`<p class="small">Aucun changement nécessaire.</p>`}<button class="btn" data-act="closeSheet">OK</button>`);
};
const moveEx = (id, d) => edit((s) => { const i = s.exercises.findIndex((e) => e.id === id), j = i + d; if (i < 0 || j < 0 || j >= s.exercises.length) return s; const ex = s.exercises.slice(); [ex[i], ex[j]] = [ex[j], ex[i]]; if (ex[i].block !== ex[j].block) { const b = ex[i].block; ex[i] = { ...ex[i], block: ex[j].block }; ex[j] = { ...ex[j], block: b }; } return { ...s, exercises: ex }; });
ACT.exUp = (el) => moveEx(el.dataset.id, -1); ACT.exDown = (el) => moveEx(el.dataset.id, 1);
ACT.exDel = async (el) => { const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); if (!ex || !(await ask(`Retirer « ${ex.name} » de la séance ?`, { ok: 'Retirer', danger: true }))) return; edit((s) => ({ ...s, exercises: s.exercises.filter((x) => x.id !== ex.id) })); };
ACT.exInfo = (el) => { const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id) || S.shared.detail?.session?.exercises?.find((x) => x.id === el.dataset.id); if (ex) openSheet(exerciseSheet(ex)); };
ACT.sDup = (el) => { const s = getSeance(el.dataset.id); if (!s) return; const c = saveSeance({ ...s, id: uid(), name: s.name + ' (copie)', createdAt: 0, template: false, archived: false, exercises: s.exercises.map((e) => ({ ...e, id: uid() })) }); toast('Séance dupliquée'); go('library', 'seance', c.id); };
ACT.sTemplate = (el) => { const s = getSeance(el.dataset.id); if (s) { saveSeance({ ...s, template: !s.template }); toast(s.template ? 'Retirée des modèles' : 'Enregistrée comme modèle'); render(); } };
ACT.sArchive = (el) => { const s = getSeance(el.dataset.id); if (s) { saveSeance({ ...s, archived: !s.archived }); toast(s.archived ? 'Séance désarchivée' : 'Séance archivée'); render(); } };
ACT.sDelete = async (el) => { const s = getSeance(el.dataset.id); if (s && (await ask(`Supprimer « ${s.name} » ?`, { ok: 'Supprimer', danger: true, detail: 'L’historique des séances déjà réalisées est conservé.' }))) { deleteSeance(s.id); toast('Séance supprimée'); go('library', 'seances'); } };
ACT.sText = async (el) => { const s = getSeance(el.dataset.id); if (!s) return; const t = exportSessionText(s); try { await navigator.clipboard.writeText(t); toast('Texte copié'); } catch { openSheet(h`<h2 style="margin:0">Texte de la séance</h2><textarea readonly style="min-height:260px">${t}</textarea><button class="btn" data-act="closeSheet">Fermer</button>`); } };

/* Exercices : formulaire, ajout, remplacement intelligent */
function exForm(e, ctxk) {
  const t = e.mode === 'time';
  return h`<h2 style="margin:0">${ctxk.eid === 'new' ? 'Nouvel exercice' : 'Modifier l’exercice'}</h2>
  <form data-submit="exSave" class="stack"><input type="hidden" name="ctx" value="${JSON.stringify(ctxk)}">
    <div class="row"><input type="text" name="emoji" value="${e.emoji}" maxlength="4" class="emoji-in" aria-label="Emoji"><input type="text" name="name" value="${e.name === 'Exercice' ? '' : e.name}" maxlength="80" required placeholder="Nom de l’exercice" aria-label="Nom"></div>
    <div class="grid2"><label>Type<select name="mode" data-change="exMode"><option value="reps" ${t ? '' : 'selected'}>Répétitions</option><option value="time" ${t ? 'selected' : ''}>Durée</option></select></label>
      <label>Bloc<select name="block"><option value="warmup" ${e.block === 'warmup' ? 'selected' : ''}>Échauffement</option><option value="main" ${e.block === 'main' ? 'selected' : ''}>Corps de séance</option><option value="cool" ${e.block === 'cool' ? 'selected' : ''}>Retour au calme</option></select></label></div>
    <div class="grid3">${numberField('sets', 'Séries', e.sets, { min: 1, max: 30, step: 1 })}<label>Repos<span class="unitbox"><input type="text" inputmode="numeric" name="rest" value="${e.rest}"><em>s ou 2:30</em></span></label><label class="chk"><input type="checkbox" name="perSide" ${e.perSide ? 'checked' : ''}> Par côté</label></div>
    <div class="grid2" data-m="reps" ${t ? 'hidden' : ''}>${numberField('repsMin', 'Reps min', e.repsMin, { min: 1, max: 999, step: 1 })}${numberField('repsMax', 'Reps max', e.repsMax, { min: 1, max: 999, step: 1 })}</div>
    <div class="grid2" data-m="time" ${t ? '' : 'hidden'}>${numberField('secMin', 'Durée min', e.secMin, { min: 1, max: 7200, step: 1, unit: 's' })}${numberField('secMax', 'Durée max', e.secMax, { min: 1, max: 7200, step: 1, unit: 's' })}</div>
    <div class="grid2"><label>Charge<input type="text" name="load" value="${e.load}" maxlength="60" placeholder="+10 kg, poids du corps…"></label><label>Unité<input type="text" name="unit" value="${e.unit}" maxlength="12" placeholder="blocs, voies…"></label></div>
    <label>Consignes (une par ligne)<textarea name="ok">${e.ok.join('\n')}</textarea></label>
    <label>Erreurs à éviter (une par ligne)<textarea name="bad" style="min-height:60px">${e.bad.join('\n')}</textarea></label>
    <label>Muscles principaux</label><div class="chips">${Object.entries(MUSCLES).map(([id, m]) => h`<label class="chip ${e.prim.includes(id) ? 'on' : ''}"><input type="checkbox" name="prim" value="${id}" ${e.prim.includes(id) ? 'checked' : ''} class="hidden" data-change="chipToggle">${m.label}</label>`)}</div>
    <label>Capacités travaillées</label><div class="chips">${Object.entries(CAPACITIES).map(([id, c]) => h`<label class="chip ${e.caps[id] ? 'on' : ''}"><input type="checkbox" name="caps" value="${id}" ${e.caps[id] ? 'checked' : ''} class="hidden" data-change="chipToggle">${c.label}</label>`)}</div>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn" type="button" data-act="closeSheet">Annuler</button></div>
  </form>`;
}
CHG.exMode = (el) => { const f = el.closest('form'); f.querySelector('[data-m=reps]').hidden = el.value === 'time'; f.querySelector('[data-m=time]').hidden = el.value !== 'time'; };
CHG.chipToggle = (el) => el.closest('.chip')?.classList.toggle('on', el.checked);
const parseDur = (v) => { v = String(v ?? '').trim(); if (!v) return 0; if (/^\d+:\d{1,2}$/.test(v)) { const [m, s] = v.split(':').map(Number); return m * 60 + s; } if (/[a-z]/i.test(v)) return parseRest(v) ?? 0; return Math.max(0, Number(v.replace(',', '.')) || 0); };
function formExercise(form, base = {}) {
  const fd = new FormData(form), f = Object.fromEntries(fd);
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const prim = fd.getAll('prim'), caps = Object.fromEntries(fd.getAll('caps').map((c) => [c, base.caps?.[c] || 1]));
  return normalizeEx({ ...base, name: f.name, emoji: f.emoji, mode: f.mode, block: f.block || base.block || 'main', sets: f.sets, repsMin: f.repsMin, repsMax: f.repsMax, secMin: f.secMin, secMax: f.secMax, perSide: !!f.perSide, load: f.load, unit: f.unit, rest: parseDur(f.rest), ok: lines(f.ok), bad: lines(f.bad), prim, caps, muscles: prim.map((m) => MUSCLES[m]?.label.toLowerCase() || m) });
}
ACT.exEdit = (el) => { const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); if (ex) openSheet(exForm(ex, { kind: 'session', eid: ex.id }), { wide: true }); };
SUBMIT.exSave = async (form) => {
  const k = JSON.parse(new FormData(form).get('ctx'));
  try {
    if (k.kind === 'session') {
      const e = editing(); if (!e) return;
      const base = k.eid === 'new' ? {} : e.s.exercises.find((x) => x.id === k.eid) || {};
      const ex = formExercise(form, base);
      e.save({ ...e.s, exercises: k.eid === 'new' ? [...e.s.exercises, { ...ex, id: uid() }] : e.s.exercises.map((x) => (x.id === k.eid ? { ...ex, id: x.id } : x)) });
    } else if (k.kind === 'personal') {
      const ex = formExercise(form, k.id ? (S.personal.find((p) => p.id === k.id)?.data || {}) : {});
      if (k.id) queue('PUT', `/api/exercises/personal/${encodeURIComponent(k.id)}`, { exercise: ex });
      else { const id = uid(); S.personal.push({ id, name: ex.name, data: ex }); queue('POST', '/api/exercises/personal', { id, exercise: ex }); }
      if (k.id) { const p = S.personal.find((x) => x.id === k.id); if (p) { p.name = ex.name; p.data = ex; } }
    } else if (k.kind === 'commonEx') {
      const ex = formExercise(form, S.commonEx.find((x) => x.id === k.id)?.data || {});
      if (k.id) await api('PUT', `/api/exercises/common/${encodeURIComponent(k.id)}`, { exercise: ex });
      else await api('POST', '/api/exercises/common', { name: ex.name, exercise: ex });
      syncSoon(10);
    }
    closeSheet(); buzzOk(); toast('Enregistré'); render();
  } catch (err) { toast(err.offline ? 'Connexion requise pour cette action.' : err.message, 4000, 'bad'); }
};
ACT.exAdd = () => openSheet(h`<h2 style="margin:0">Ajouter un exercice</h2>
  <input type="search" data-input="pickQ" placeholder="Rechercher dans le catalogue et tes exercices…" aria-label="Rechercher" autofocus>
  <div id="pickList" class="list">${pickRows('')}</div>
  <button class="btn" data-act="exNew">✎ Créer un exercice vide</button><button class="btn" data-act="closeSheet">Fermer</button>`, { wide: true });
function pickRows(q) {
  const n = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const e = editing(), act = e?.s.activity;
  const lib = LIBRARY.filter((x) => x.role !== 'warmup' || true).filter((x) => !n || x.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n)).sort((a, b) => Number(b.acts.includes(act)) - Number(a.acts.includes(act)));
  const pers = S.personal.filter((p) => !n || p.name.toLowerCase().includes(n));
  return h`${pers.map((p) => h`<button class="item pick" data-act="exPick" data-kind="personal" data-id="${p.id}"><div class="ico">${p.data?.emoji || '💪'}</div><div class="grow"><b>${p.name}</b><div class="tiny muted">exercice personnel</div></div></button>`)}
    ${lib.slice(0, 40).map((x) => h`<button class="item pick" data-act="exPick" data-kind="lib" data-id="${x.id}"><div class="ico">${x.emoji}</div><div class="grow"><b>${x.name}</b><div class="tiny muted">${Object.keys(x.caps).slice(0, 2).map(capL).join(', ')}${x.needs.length ? ' · ' + x.needs.map((k) => EQUIPMENT[k] || k).join(', ') : ''}</div></div></button>`)}`;
}
INPUT.pickQ = (el) => { const box = $('#pickList'); if (box) box.innerHTML = pickRows(el.value).s; };
ACT.exNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪', block: 'main' }), { kind: 'session', eid: 'new' }), { wide: true });
ACT.exPick = (el) => {
  const e = editing(); if (!e) return;
  const src = el.dataset.kind === 'lib' ? byId(el.dataset.id) : S.personal.find((p) => p.id === el.dataset.id)?.data;
  if (!src) return;
  const ex = el.dataset.kind === 'lib' ? normalizeEx({ ...src, id: uid(), libId: src.id, ok: src.cues, bad: src.bad, block: src.role === 'warmup' ? 'warmup' : src.role === 'cool' ? 'cool' : 'main' }) : normalizeEx({ ...src, id: uid(), block: 'main' });
  e.save({ ...e.s, exercises: [...e.s.exercises, ex] }); closeSheet(); toast(`Ajouté : ${ex.name}`);
};
ACT.exSwap = (el) => {
  const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); if (!ex) return;
  const c = ctx(), alts = alternatives(ex, c, { session: e.s, level: levelFor(e.s.activity || 'conditioning', c).level + 1 });
  S.swapFor = ex.id;
  openSheet(h`<h2 style="margin:0">Remplacer « ${ex.name} »</h2><p class="muted small">Alternatives classées selon plusieurs logiques ; chaque raison est indiquée.</p>
    ${alts.length ? alts.map((a) => h`<div class="item"><div class="ico">${a.lib.emoji}</div><div class="grow"><b>${a.lib.name}</b> ${a.pref === 'aime' ? tag('tu aimes', 'ok') : ''} ${a.available ? '' : tag('matériel manquant', 'warn')}<ul class="tiny why">${a.reasons.map((r) => h`<li>${r}</li>`)}</ul></div><button class="btn sm pri" data-act="exSwapDo" data-id="${a.lib.id}" data-reason="${a.reasons[0]}" ${a.available ? '' : 'disabled'}>Choisir</button></div>`) : h`<p class="muted">Aucune alternative connue pour cet exercice (exercice personnel ou très spécifique).</p>`}
    <button class="btn" data-act="closeSheet">Annuler</button>`, { wide: true });
};
ACT.exSwapDo = (el) => {
  const e = editing(); if (!e) return;
  const r = replaceExercise(e.s, S.swapFor, el.dataset.id, el.dataset.reason);
  if (r.change) { putItem('swap', uid(), { from: r.change.from, to: r.change.to, date: Date.now(), where: e.kind === 'gen' ? 'generator' : 'seance' }); if (e.kind === 'gen') (S.gen.swaps ||= []).push(r.change); }
  e.save(r.session); closeSheet(); toast(`Remplacé par « ${r.change?.to} »`);
};
ACT.sEquip = () => {
  const e = editing(); if (!e) return;
  const eq = [...availableEquipment(ctx(), e.s.context.env)];
  const used = [...new Set(e.s.exercises.flatMap((x) => x.needs?.length ? x.needs : byId(x.libId)?.needs || []))];
  openSheet(h`<h2 style="margin:0">Matériel disponible pour cette séance</h2><p class="muted small">Décoche ce qui manque aujourd’hui : la séance est reconstruite et chaque remplacement expliqué.</p>
    <form data-submit="sEquipDo"><div class="chips">${Object.entries(EQUIPMENT).filter(([k]) => eq.includes(k) || used.includes(k)).map(([k, l]) => h`<label class="chip ${eq.includes(k) ? 'on' : ''}"><input type="checkbox" class="hidden" name="eq" value="${k}" ${eq.includes(k) ? 'checked' : ''} data-change="chipToggle">${l}</label>`)}</div>
    <button class="btn pri" type="submit">Reconstruire</button></form>`);
};
SUBMIT.sEquipDo = (f) => {
  const e = editing(); if (!e) return;
  const next = new Set(new FormData(f).getAll('eq')), prev = availableEquipment(ctx(), e.s.context.env);
  const r = rebuildForEquipment(e.s, next, ctx(), 2);
  const extra = newPossibilities(prev, next, e.s.activity);
  e.save(r.session);
  openSheet(h`<h2 style="margin:0">Séance adaptée au matériel</h2>${r.changes.length ? h`<ul class="small">${r.changes.map((c) => h`<li>${c}</li>`)}</ul>` : h`<p class="small">Rien à changer : tout le matériel utilisé est disponible.</p>`}
    ${extra.length ? h`<b class="small">Nouvelles possibilités</b><ul class="small">${extra.map((x) => h`<li>${x.lib.name} — ${x.reason}</li>`)}</ul>` : ''}<button class="btn" data-act="closeSheet">OK</button>`);
};

/* ═════════ Partager une séance : bibliothèque commune ou profil public ═════════ */
ACT.sPublish = (el) => {
  const s = getSeance(el.dataset.id); if (!s) return;
  const loads = s.exercises.filter((e) => /^\s*[+-]?\d+([.,]\d+)?\s*kg\s*$/i.test(e.load)).length, notes = s.exercises.filter((e) => e.note).length;
  const lv = estimateLevel(s);
  openSheet(h`<h2 style="margin:0">Partager « ${s.name} »</h2>
    <p class="small">Ce qui sera publié : le titre, l’activité, les exercices et leurs prescriptions, les intentions, le matériel et la durée.</p>
    <p class="small muted">Retiré automatiquement : tes notes de progression personnelles (${notes}), les charges chiffrées issues de tes performances (${loads}), les explications liées à ton profil, ton lieu et ton objectif. Aucun historique ni performance n’est partagé.</p>
    <p class="small">Niveau estimé : ${levelTag(lv)}</p>${levelDetails(lv)}
    <div class="row wrapf"><button class="btn pri" data-act="sPublishDo" data-id="${s.id}" data-scope="common">📚 Bibliothèque commune</button><button class="btn" data-act="sPublishDo" data-id="${s.id}" data-scope="public">🌍 Mon profil public</button><button class="btn" data-act="closeSheet">Annuler</button></div>`, { wide: true });
};
ACT.sPublishDo = async (el) => {
  const s = getSeance(el.dataset.id); if (!s) return;
  try {
    const r = await api('POST', '/api/shared', { id: uid(), scope: el.dataset.scope, session: s, title: s.name }, { opId: 'op-' + uid() });
    closeSheet(); buzzOk(); toast(el.dataset.scope === 'common' ? `Publiée dans la bibliothèque commune (niveau estimé : ${LEVEL_LABEL[r.level.level].toLowerCase()})` : 'Publiée sur ton profil public');
    S.shared.common = null;
  } catch (e) { toast(e.offline ? 'Connexion requise pour publier.' : e.message, 4500, 'bad'); }
};

/* ═════════ Coller un texte ═════════ */
function vImport() {
  const r = S.importResult;
  return h`<div class="row"><button class="btn sm" data-act="backSeances" aria-label="Retour">‹</button><h1 style="margin:0">Coller un texte</h1></div>
    <p class="muted small">Colle ta séance : titre, durée, exercices numérotés (« 1. NOM »), une ligne « charge — 4 × 8 — repos 2 min », des puces.</p>
    <textarea data-input="impText" style="min-height:220px" placeholder="🦵 SÉANCE JAMBES&#10;1. SQUATS&#10;+10 kg — 4 × 6–8 — repos 2 min 30" aria-label="Texte de la séance">${S.importText || ''}</textarea>
    <div class="row wrapf"><button class="btn pri" data-act="impParse">Analyser</button><button class="btn" data-act="backSeances">Annuler</button></div>
    ${r ? (r.session ? h`<div class="card"><h3>${r.session.emoji} ${r.session.name}</h3><div class="muted small">${r.session.exercises.length} exercices · ~${sessionMinutes(r.session)} min</div>${r.session.exercises.map((e, i) => exRow(e, i, r.session.exercises.length, 'view'))}${r.warnings.map((w) => h`<p class="small err">⚠ ${w}</p>`)}<button class="btn pri big" data-act="impSave">Enregistrer cette séance</button></div>` : h`<div class="card"><p class="err">${r.warnings[0]}</p></div>`) : ''}`;
}
INPUT.impText = (el) => { S.importText = el.value; S.importResult = null; };
ACT.openImport = () => { S.importResult = null; go('library', 'import'); };
ACT.impParse = () => { S.importResult = parseSessionText(S.importText); render(); };
ACT.impSave = () => { const s = saveSeance(S.importResult.session); S.importText = ''; S.importResult = null; toast('Séance ajoutée'); go('library', 'seance', s.id); };

/* ═════════ Générateur : simulation puis génération ═════════ */
export function openGenerator(opts = {}) {
  Object.assign(S.gen, { plan: null, result: null, saved: false, priorities: {} }, opts);
  if (!S.gen.activityId) S.gen.activityId = Object.keys(ctx().activities)[0] || 'conditioning';
  go('library', 'generate');
  if (opts.autoPlan) { ACT.genPlan(); }
}
function vGenerate() {
  const g = S.gen, c = ctx();
  if (!g.activityId) g.activityId = Object.keys(c.activities)[0] || 'conditioning';
  const goals = activeGoals(c), intents = new Map((g.intentions || []).map((x) => [x.id, x.p]));
  const eq = availableEquipment(c, g.envId);
  return h`<div class="card"><h3>Paramètres</h3>
      <b class="small">Activité</b><div class="chips">${activityOptions().map(([id, e, l]) => chip(g.activityId === id, `${e} ${l}`, `data-act="gSet" data-k="activityId" data-v="${id}"`))}</div>
      <b class="small">Orientation</b><div class="chips">${chip(g.mode === 'weaknesses', '🎯 Travailler mes axes de progrès', 'data-act="gSet" data-k="mode" data-v="weaknesses"')}${chip(g.mode === 'strengths', '🚀 Faire progresser mes forces', 'data-act="gSet" data-k="mode" data-v="strengths"')}${chip(g.mode === 'goal', '🏁 Objectif spécifique', 'data-act="gSet" data-k="mode" data-v="goal"')}</div>
      ${g.mode === 'goal' ? (goals.length ? h`<label>Objectif<select data-change="gGoal"><option value="">— choisir —</option>${goals.map((x) => h`<option value="${x.id}" ${g.goalId === x.id ? 'selected' : ''}>${goalLabel(x)}</option>`)}</select></label>` : h`<p class="small muted">Aucun objectif actif : crée-en un dans Profil › Objectifs.</p>`) : ''}
      <b class="small">Durée</b><div class="chips">${[5, 10, 12, 15, 20, 30, 45, 60, 90].map((m) => chip(Number(g.minutes) === m, `${m} min`, `data-act="gSet" data-k="minutes" data-v="${m}"`))}</div>
      <label class="inline">Autre durée <span class="unitbox small"><input type="number" inputmode="numeric" min="5" max="240" value="${g.minutes}" data-change="gMinutes" aria-label="Durée en minutes"><em>min</em></span></label>
      <b class="small">Intentions (touche plusieurs fois pour la priorité)</b><div class="chips">${Object.entries(INTENTIONS).map(([id, I]) => chip(intents.has(id), `${I.emoji} ${I.label}${intents.has(id) ? ' ×' + intents.get(id) : ''}`, `data-act="gIntent" data-id="${id}"`))}</div>
      <div class="grid2"><label>Environnement<select data-change="gEnv"><option value="">${c.defEnv ? 'Par défaut : ' + c.defEnv.name : 'Aucun décrit'}</option>${c.envs.map((e) => h`<option value="${e.id}" ${g.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label>
      <label class="chk" style="align-self:end"><input type="checkbox" data-change="gLight" ${g.light ? 'checked' : ''}> Séance légère / récupération</label></div>
      <p class="tiny muted">Matériel pris en compte : ${eq.size ? [...eq].map((k) => EQUIPMENT[k] || k).join(', ') : 'aucun'}. Modifiable dans Profil › Matériel.</p>
      <button class="btn pri big" data-act="genPlan">👁 Voir la simulation</button></div>
    ${g.plan ? vPlan(g.plan) : ''}${g.result ? vGenResult(g.result) : ''}`;
}
ACT.gSet = (el) => { S.gen[el.dataset.k] = el.dataset.k === 'minutes' ? Number(el.dataset.v) : el.dataset.v; S.gen.plan = null; S.gen.result = null; S.gen.priorities = {}; render(); };
CHG.gGoal = (el) => { S.gen.goalId = el.value; S.gen.plan = null; S.gen.result = null; render(); };
CHG.gMinutes = (el) => { S.gen.minutes = Math.max(5, Math.min(240, Number(el.value) || 30)); S.gen.plan = null; S.gen.result = null; render(); };
CHG.gEnv = (el) => { S.gen.envId = el.value; S.gen.plan = null; S.gen.result = null; render(); };
CHG.gLight = (el) => { S.gen.light = el.checked; S.gen.plan = null; S.gen.result = null; render(); };
ACT.gIntent = (el) => { const list = [...(S.gen.intentions || [])], i = list.findIndex((x) => x.id === el.dataset.id); if (i < 0) list.push({ id: el.dataset.id, p: 1 }); else if (list[i].p < 3) list[i] = { ...list[i], p: list[i].p + 1 }; else list.splice(i, 1); S.gen.intentions = list; S.gen.plan = null; S.gen.result = null; render(); };
ACT.genPlan = () => {
  const g = S.gen;
  if (g.mode === 'goal' && !g.goalId) { toast('Choisis un objectif (ou une autre orientation).'); return; }
  g.plan = planSession({ activityId: g.activityId, mode: g.mode, goalId: g.mode === 'goal' ? g.goalId : '', capId: g.capId || '', minutes: g.minutes, intentions: g.intentions, envId: g.envId, light: g.light, priorities: g.priorities, seed: g.seed ?? Math.floor(Math.random() * 1e9) }, ctx());
  g.seed = g.plan.seed; g.result = null; render(); setTimeout(() => $('#genplan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
};
function vPlan(p) {
  return h`<div id="genplan" class="card acc-b"><h3>👁 Simulation avant génération</h3>
    <p><b>Intention :</b> ${p.intentionText} · ${p.activityLabel} · ${p.minutes} min${p.envName ? ' · ' + p.envName : ''}</p>
    <b class="small">Capacités ciblées (modifie les priorités)</b>
    ${p.distribution.length ? p.distribution.map((d) => h`<div class="item"><div class="grow"><b>${d.label}</b> <span class="muted small">${d.pct} %</span><div class="tiny muted">${d.reasons.join(' · ')}</div></div><div class="row tight"><button class="btn sm ic" data-act="prio" data-id="${d.capId}" data-d="-1" aria-label="Moins prioritaire">−</button><button class="btn sm ic" data-act="prio" data-id="${d.capId}" data-d="1" aria-label="Plus prioritaire">＋</button><button class="btn sm ic danger" data-act="prio" data-id="${d.capId}" data-d="0" aria-label="Retirer">✕</button></div></div>`) : h`<p class="muted small">Aucune capacité ciblable avec ce matériel.</p>`}
    <details><summary class="small">＋ Ajouter une capacité</summary><div class="chips">${Object.entries(CAPACITIES).filter(([id]) => !p.distribution.some((d) => d.capId === id)).map(([id, c]) => chip(false, c.label, `data-act="prio" data-id="${id}" data-d="add"`))}</div></details>
    <b class="small">Répartition</b><ul class="small">${p.blocks.map((b) => h`<li><b>${b.label}</b> ~${b.minutes} min — ${b.reason}</li>`)}</ul>
    <p class="small"><b>Difficulté estimée :</b> ${p.difficulty.text}</p>
    <p class="small"><b>Matériel nécessaire :</b> ${p.neededEquipment?.length ? p.neededEquipment.join(', ') : 'aucun'}</p>
    ${p.preview?.length ? h`<p class="small muted">Exercices envisagés : ${p.preview.join(', ')}</p>` : ''}
    ${p.constraints.length ? h`<details class="how"><summary>Contraintes respectées</summary><ul class="small">${p.constraints.map((x) => h`<li>${x}</li>`)}</ul></details>` : ''}
    ${p.missing.length ? h`<p class="small warn-t">⚠ ${p.missing.join(' ')}</p>` : ''}
    <button class="btn pri big" data-act="genDo">✨ Générer la séance</button></div>`;
}
ACT.prio = (el) => {
  const g = S.gen, id = el.dataset.id, d = el.dataset.d;
  const cur = Object.fromEntries(g.plan.distribution.map((x) => [x.capId, x.weight]));
  const pr = { ...cur, ...g.priorities };
  if (d === '0') pr[id] = 0; else if (d === 'add') pr[id] = 1.5; else pr[id] = Math.max(0.2, Math.min(3, (pr[id] || 1) + Number(d) * 0.5));
  g.priorities = pr; ACT.genPlan();
};
ACT.genDo = () => { const g = S.gen; if (!g.plan) return; g.result = generateFromPlan(g.plan, ctx()); g.saved = false; g.swaps = []; buzzOk(); render(); setTimeout(() => $('#genresult')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };
function vGenResult(r) {
  const s = r.session;
  return h`<div id="genresult" class="card"><div class="row"><div class="ico acc">${s.emoji}</div><div class="grow"><h3>${s.name}</h3><div class="muted small">~${sessionMinutes(s)} min ${levelTag(r.meta.level)}</div></div></div>
    ${howBox({ ...s.explain, note: 'Faits = données de ton profil et de ton historique ; estimations = ce que l’application en déduit. Aucune performance n’est inventée.' }, { open: true, title: 'Pourquoi cette séance ? (comment le sais-tu)' })}
    ${blocksOf(s, 'gen')}
    <div class="row wrapf"><button class="btn pri" data-act="play" data-gen="1">▶ Lancer</button><button class="btn" data-act="genSave" ${S.gen.saved ? 'disabled' : ''}>${S.gen.saved ? '✓ Enregistrée' : '💾 Enregistrer'}</button><button class="btn" data-act="genAgain">🔁 Autre proposition</button></div></div>`;
}
ACT.genSave = () => { const s = saveSeance(S.gen.result.session); S.gen.result.session = s; S.gen.saved = true; toast('Ajoutée à Mes séances'); render(); };
ACT.genAgain = () => { S.gen.seed = Math.floor(Math.random() * 1e9); ACT.genPlan(); ACT.genDo(); };

/* ═════════ Exercices : catalogue, anatomie, exercices personnels, exercices communs ═════════ */
function vExercises() {
  const q = S.filters.exq || '', act = S.filters.exAct || '', cap = S.filters.exCap || '';
  const n = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const match = (name) => !n || name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n);
  const lib = LIBRARY.filter((x) => x.role === 'main' && match(x.name) && (!act || x.acts.includes(act)) && (!cap || (x.caps[cap] || 0) >= 0.5));
  const c = ctx(), tried = neverTried(c, { activityId: act || undefined, level: 1 });
  return h`<input type="search" data-input="exQ" value="${q}" placeholder="Rechercher un exercice…" aria-label="Rechercher un exercice">
    <div class="grid2"><select data-change="exAct" aria-label="Activité"><option value="">Toutes activités</option>${Object.entries(ACTIVITIES).map(([id, a]) => h`<option value="${id}" ${act === id ? 'selected' : ''}>${a.emoji} ${a.label}</option>`)}</select>
    <select data-change="exCap" aria-label="Capacité"><option value="">Toutes capacités</option>${Object.entries(CAPACITIES).map(([id, x]) => h`<option value="${id}" ${cap === id ? 'selected' : ''}>${x.label}</option>`)}</select></div>
    ${tried.length && !q ? h`<div class="card flat"><b class="small">✨ Tu n’as jamais essayé</b>${tried.map((t) => h`<div class="item"><div class="ico">${t.lib.emoji}</div><div class="grow"><b>${t.lib.name}</b><div class="tiny muted">${t.reason}</div></div><button class="btn sm" data-act="libInfo" data-id="${t.lib.id}">Voir</button></div>`)}</div>` : ''}
    <div class="card"><div class="row between"><h3>Mes exercices</h3><button class="btn sm" data-act="persNew">＋ Nouveau</button></div>${S.personal.filter((p) => match(p.name)).map((p) => h`<div class="item"><div class="ico">${p.data?.emoji || '💪'}</div><div class="grow"><b>${p.name}</b><div class="tiny muted">${exLine(normalizeEx(p.data))}</div></div><button class="btn sm" data-act="persInfo" data-id="${p.id}">Voir</button></div>`)}${S.personal.length ? '' : h`<p class="muted small">Aucun exercice personnel.</p>`}</div>
    <div class="card"><h3>Catalogue intégré (${lib.length})</h3>${lib.slice(0, 60).map((x) => h`<div class="item"><div class="ico">${x.emoji}</div><div class="grow"><b>${x.name}</b><div class="tiny muted">${Object.entries(x.caps).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => capL(k)).join(', ')} · difficulté ${x.diff}/5</div></div><button class="btn sm" data-act="libInfo" data-id="${x.id}">Voir</button></div>`)}${lib.length > 60 ? h`<p class="tiny muted">Affine la recherche pour voir les ${lib.length - 60} autres.</p>` : ''}</div>
    <div class="card"><div class="row between"><h3>Exercices communs</h3><button class="btn sm" data-act="cexNew">＋ Proposer</button></div>${S.commonEx.filter((x) => match(x.name)).map((x) => h`<div class="item"><div class="ico">${x.data?.emoji || '💪'}</div><div class="grow"><b>${x.name}</b><div class="tiny muted">par ${x.author || 'compte supprimé'}</div></div><button class="btn sm" data-act="cexInfo" data-id="${x.id}">Voir</button></div>`)}${S.commonEx.length ? '' : h`<p class="muted small">Aucun exercice commun pour l’instant.</p>`}</div>
    <details class="card"><summary><b>Sources d’inspiration</b></summary>${SOURCES.map((s) => h`<p class="small"><b>${s.title}</b> — ${s.by}<br><span class="muted">${s.note}</span></p>`)}</details>`;
}
INPUT.exQ = (el) => { S.filters.exq = el.value; clearTimeout(INPUT.exQ.t); INPUT.exQ.t = setTimeout(() => { render(); const i = $('[data-input=exQ]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
CHG.exAct = (el) => { S.filters.exAct = el.value; render(); };
CHG.exCap = (el) => { S.filters.exCap = el.value; render(); };
export function exerciseSheet(ex, actions = '') {
  const lib = byId(ex.libId || ex.id) || null;
  const e = lib ? { ...lib, ...ex, caps: Object.keys(ex.caps || {}).length ? ex.caps : lib.caps, prim: ex.prim?.length ? ex.prim : lib.prim, sec: ex.sec?.length ? ex.sec : lib.sec } : ex;
  const g = graphFromExercise({ caps: e.caps || {}, prim: e.prim || [], sec: e.sec || [] }, ctx());
  const cues = e.ok?.length ? e.ok : e.cues || [];
  return h`<div class="row"><div class="ico">${e.emoji}</div><div class="grow"><h2 style="margin:0">${e.name}</h2>${e.sets ? h`<div class="muted small">${exLine(normalizeEx(e))}</div>` : ''}</div></div>
    ${raw(anatomySvg({ primary: e.prim || [], secondary: e.sec || [] }))}
    <div class="legend small"><span><i class="lg p"></i> Principaux : ${g.muscles.prim.join(', ') || '—'}</span><span><i class="lg s"></i> Secondaires : ${g.muscles.sec.join(', ') || '—'}</span></div>
    ${g.caps.length ? h`<div><b class="small">Capacités sollicitées</b>${g.caps.map((c) => h`<div class="item"><div class="grow"><b>${c.label}</b> <span class="tiny muted">relation ${c.w}</span>${c.goals.length ? h`<div class="tiny muted">→ objectifs : ${c.goals.map((x) => x.label).join(', ')}</div>` : ''}${c.metrics.length ? h`<div class="tiny muted">↔ se mesure avec : ${c.metrics.slice(0, 3).map((x) => x.label).join(', ')}</div>` : ''}</div></div>`)}</div>` : ''}
    ${e.needs?.length ? h`<p class="small">Matériel : ${e.needs.map((k) => EQUIPMENT[k] || k).join(', ')}</p>` : h`<p class="small">Sans matériel.</p>`}
    ${e.diff ? h`<p class="small">Difficulté intrinsèque : ${e.diff}/5${e.minLevel ? ' · conseillé à partir du niveau ' + ['débutant', 'intermédiaire', 'avancé'][e.minLevel] : ''}</p>` : ''}
    ${cues.length ? h`<div><b class="small">À faire</b><ul>${cues.map((c) => h`<li>${c}</li>`)}</ul></div>` : ''}${e.bad?.length ? h`<div><b class="small">À éviter</b><ul>${e.bad.map((c) => h`<li>${c}</li>`)}</ul></div>` : ''}
    ${e.why && lib ? h`<p class="small muted">${lib.why}</p>` : ''}${actions}<button class="btn" data-act="closeSheet">Fermer</button>`;
}
ACT.libInfo = (el) => { const x = byId(el.dataset.id); if (!x) return; S.pickSrc = { kind: 'lib', id: x.id }; openSheet(exerciseSheet(x, h`<div class="row wrapf">${S.seances.items.length ? h`<select id="addTarget" aria-label="Séance cible">${S.seances.items.filter((s) => !s.archived).map((s) => h`<option value="${s.id}">${s.emoji} ${s.name}</option>`)}</select><button class="btn pri sm" data-act="addToSeance">＋ Ajouter</button>` : ''}<button class="btn sm" data-act="libKeep" data-id="${x.id}">Copier dans mes exercices</button></div>`), { wide: true }); };
ACT.addToSeance = () => {
  const s = getSeance($('#addTarget')?.value); const src = S.pickSrc; if (!s || !src) return;
  const base = src.kind === 'lib' ? byId(src.id) : S.personal.find((p) => p.id === src.id)?.data;
  const ex = src.kind === 'lib' ? normalizeEx({ ...base, id: uid(), libId: base.id, ok: base.cues, bad: base.bad, block: 'main' }) : normalizeEx({ ...base, id: uid(), block: 'main' });
  saveSeance({ ...s, exercises: [...s.exercises, ex] }); closeSheet(); toast(`Ajouté à « ${s.name} »`);
};
ACT.libKeep = (el) => { const x = byId(el.dataset.id); if (!x) return; const ex = normalizeEx({ ...x, ok: x.cues, libId: '' }); const id = uid(); S.personal.push({ id, name: x.name, data: ex }); queue('POST', '/api/exercises/personal', { id, exercise: ex }); closeSheet(); toast('Copié dans tes exercices'); render(); };
ACT.persNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪' }), { kind: 'personal', eid: 'new' }), { wide: true });
ACT.persInfo = (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (!p) return; S.pickSrc = { kind: 'personal', id: p.id }; openSheet(exerciseSheet({ ...normalizeEx(p.data), name: p.name }, h`<div class="row wrapf">${S.seances.items.length ? h`<select id="addTarget" aria-label="Séance cible">${S.seances.items.filter((s) => !s.archived).map((s) => h`<option value="${s.id}">${s.emoji} ${s.name}</option>`)}</select><button class="btn pri sm" data-act="addToSeance">＋ Ajouter</button>` : ''}<button class="btn sm" data-act="persEdit" data-id="${p.id}">✎ Modifier</button><button class="btn sm" data-act="persShare" data-id="${p.id}">Proposer à la commune</button><button class="btn danger sm" data-act="persDel" data-id="${p.id}">Supprimer</button></div>`), { wide: true }); };
ACT.persEdit = (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (p) openSheet(exForm(normalizeEx({ ...p.data, name: p.name }), { kind: 'personal', id: p.id, eid: 'x' }), { wide: true }); };
ACT.persDel = async (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (!p || !(await ask(`Supprimer « ${p.name} » ?`, { ok: 'Supprimer', danger: true }))) return; S.personal = S.personal.filter((x) => x.id !== p.id); queue('DELETE', `/api/exercises/personal/${encodeURIComponent(p.id)}`); closeSheet(); render(); };
ACT.persShare = async (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (!p) return; try { await api('POST', '/api/exercises/common', { name: p.name, exercise: p.data }, { opId: 'op-' + uid() }); closeSheet(); toast('Proposé dans les exercices communs'); syncSoon(10); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };
ACT.cexNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪' }), { kind: 'commonEx', eid: 'new' }), { wide: true });
ACT.cexInfo = (el) => {
  const x = S.commonEx.find((y) => y.id === el.dataset.id); if (!x) return;
  const can = x.mine || S.user?.isAdmin;
  S.pickSrc = null;
  openSheet(exerciseSheet({ ...normalizeEx(x.data), name: x.name }, h`<p class="tiny muted">Proposé par ${x.author || 'compte supprimé'}.</p><div class="row wrapf"><button class="btn sm" data-act="cexKeep" data-id="${x.id}">Copier dans mes exercices</button>${can ? h`<button class="btn sm" data-act="cexEdit" data-id="${x.id}">✎ Modifier</button><button class="btn danger sm" data-act="cexDel" data-id="${x.id}">Supprimer</button>` : ''}</div>`), { wide: true });
};
ACT.cexKeep = (el) => { const x = S.commonEx.find((y) => y.id === el.dataset.id); if (!x) return; const id = uid(); S.personal.push({ id, name: x.name, data: x.data }); queue('POST', '/api/exercises/personal', { id, exercise: x.data }); closeSheet(); toast('Copié dans tes exercices'); render(); };
ACT.cexEdit = (el) => { const x = S.commonEx.find((y) => y.id === el.dataset.id); if (x) openSheet(exForm(normalizeEx({ ...x.data, name: x.name }), { kind: 'commonEx', id: x.id, eid: 'x' }), { wide: true }); };
ACT.cexDel = async (el) => { const x = S.commonEx.find((y) => y.id === el.dataset.id); if (!x || !(await ask(`Supprimer « ${x.name} » des exercices communs ?`, { ok: 'Supprimer', danger: true }))) return; try { await api('DELETE', `/api/exercises/common/${encodeURIComponent(x.id)}`); S.commonEx = S.commonEx.filter((y) => y.id !== x.id); closeSheet(); toast('Supprimé'); render(); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };

/* ═════════ Bibliothèque commune ═════════ */
export async function loadCommon() {
  const sh = S.shared; sh.loading = true; sh.error = ''; render();
  try { const r = await api('GET', '/api/shared?scope=common'); sh.common = r.items; }
  catch (e) { sh.error = e.offline ? 'Connexion requise pour voir la bibliothèque commune.' : e.message; }
  sh.loading = false; render();
}
/** Repère d'escalade d'une séance commune, exprimé dans le système de l'utilisateur SEULEMENT si une correspondance existe. */
function gradeHintText(gh) {
  if (!gh) return '';
  const c = ctx(), act = gh.systemId === 'french' ? 'voie' : 'bloc';
  const mine = Object.values(c.systems).filter((s) => !s.builtin && !s.archived && s.activity === act);
  const ref = toReference(gh, c.systems, act);
  const conv = ref ? mine.map((s) => { const l = fromReference(ref.index, s, act); return l ? `${l.label} (${s.name})` : null; }).filter(Boolean) : [];
  return `${gh.label} (${gh.systemName})${conv.length ? ' ≈ ' + conv.join(', ') : mine.length ? ' — pas d’équivalence définie dans ton système' : ''}`;
}
function vCommon() {
  const sh = S.shared;
  if (!sh.common && !sh.loading && !sh.error) setTimeout(loadCommon, 0);
  const f = S.filters.common || {};
  const list = (sh.common || []).filter((x) => (!f.level || x.level?.level === f.level) && (!f.activity || x.activity === f.activity) && (!f.noEq || !x.needs.length) && (!f.max || (x.durationMin || 0) <= f.max));
  return h`<p class="muted small">Séances partagées volontairement par les membres. Tu peux les enregistrer dans tes séances : ta copie est indépendante et librement modifiable ; l’original ne change jamais.</p>
    <div class="row wrapf"><button class="btn pri sm" data-act="commonPublish">＋ Partager une de mes séances</button><button class="btn sm" data-act="commonReload">↻ Actualiser</button></div>
    <div class="chips">${[['', 'Tous niveaux'], ['debutant', 'Débutant'], ['intermediaire', 'Intermédiaire'], ['avance', 'Avancé']].map(([k, l]) => chip((f.level || '') === k, l, `data-act="cFilter" data-k="level" data-v="${k}"`))}${chip(!!f.noEq, 'Sans matériel', 'data-act="cFilter" data-k="noEq" data-v="1"')}${chip(f.max === 30, '≤ 30 min', 'data-act="cFilter" data-k="max" data-v="30"')}</div>
    <select data-change="cAct" aria-label="Activité"><option value="">Toutes activités</option>${Object.entries(ACTIVITIES).map(([id, a]) => h`<option value="${id}" ${f.activity === id ? 'selected' : ''}>${a.emoji} ${a.label}</option>`)}</select>
    ${sh.loading && !sh.common ? skeleton(3) : sh.error ? h`<div class="card flat"><p class="err">${sh.error}</p><button class="btn" data-act="commonReload">Réessayer</button></div>`
      : list.length ? list.map((x) => h`<div class="card"><div class="row"><div class="ico">${x.emoji}</div><div class="grow"><b>${x.title}</b><div class="muted small">par ${x.author || 'compte supprimé'}${x.mine ? ' (toi)' : ''} · ${x.activity ? activityLabel(x.activity, ctx()) + ' · ' : ''}~${x.durationMin} min · ${x.exerciseCount} exercice(s)</div>
          <div class="row wrapf tight">${levelTag(x.level)}${x.needs.length ? tag(x.needs.map((k) => EQUIPMENT[k] || k).join(', ')) : tag('sans matériel', 'ok')}${x.gradeHint ? tag('🧗 ' + gradeHintText(x.gradeHint), 'info') : ''}</div>${x.caps.length ? h`<div class="tiny muted">Capacités : ${x.caps.map(capL).join(', ')}</div>` : ''}</div></div>
          <div class="row wrapf"><button class="btn sm" data-act="commonOpen" data-id="${x.id}">Voir</button><button class="btn sm pri" data-act="commonCopy" data-id="${x.id}">Enregistrer dans mes séances</button></div></div>`)
      : empty(sh.common?.length ? 'Aucune séance ne correspond à ces filtres.' : 'La bibliothèque commune est vide pour l’instant : partage la première séance !')}`;
}
ACT.commonReload = () => loadCommon();
ACT.cFilter = (el) => { const f = { ...(S.filters.common || {}) }; const k = el.dataset.k; const v = k === 'max' ? Number(el.dataset.v) : k === 'noEq' ? true : el.dataset.v; f[k] = f[k] === v ? (k === 'level' ? '' : undefined) : v; S.filters.common = f; render(); };
CHG.cAct = (el) => { S.filters.common = { ...(S.filters.common || {}), activity: el.value }; render(); };
async function fetchShared(id) { const r = await api('GET', `/api/shared/${encodeURIComponent(id)}`); return r.item; }
ACT.commonOpen = async (el) => { try { S.shared.detail = await fetchShared(el.dataset.id); go('library', 'common-detail', el.dataset.id); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };
function vCommonDetail() {
  const d = S.shared.detail;
  if (!d || d.id !== S.param) { if (S.param) fetchShared(S.param).then((x) => { S.shared.detail = x; render(); }).catch((e) => { S.shared.error = e.message; toast(e.offline ? 'Connexion requise.' : e.message); }); return skeleton(2); }
  const s = normalizeSession(d.session);
  return h`<div class="row"><button class="btn sm" data-act="libSub" data-id="common" aria-label="Retour">‹</button><div class="grow"></div><button class="btn pri" data-act="play" data-shared="1">▶ Lancer</button></div>
    <div class="card"><h2 style="margin:0">${s.emoji} ${d.title}</h2><p class="muted small">par ${d.author || 'compte supprimé'}${d.mine ? ' (toi)' : ''} · créée le ${fmtDay(d.createdAt)} · modifiée ${relDate(d.updatedAt)}</p>
      <div class="row wrapf tight">${levelTag(d.level)}${d.gradeHint ? tag('🧗 ' + gradeHintText(d.gradeHint), 'info') : ''}</div>${levelDetails(d.level)}
      ${s.intentions.length ? h`<p class="small">Intentions : ${s.intentions.map((i) => INTENTIONS[i.id]?.label || i.id).join(', ')}</p>` : ''}${s.notes.map((n) => h`<details class="how"><summary>${n.title}</summary><pre class="txt">${n.text}</pre></details>`)}</div>
    <div class="card">${blocksOf(s, 'view')}</div>
    <div class="row wrapf"><button class="btn pri" data-act="commonCopy" data-id="${d.id}">📥 Enregistrer dans mes séances</button>${d.canEdit ? h`<button class="btn" data-act="commonEdit">✎ Modifier l’original</button>` : ''}${d.canDelete ? h`<button class="btn danger" data-act="commonDelete">🗑 Supprimer</button>` : ''}</div>
    ${!d.canEdit ? h`<p class="tiny muted">Seul le créateur (ou un administrateur) peut modifier l’original. Enregistre-la pour la modifier librement.</p>` : ''}`;
}
ACT.commonCopy = async (el) => {
  try {
    const d = S.shared.detail?.id === el.dataset.id ? S.shared.detail : await fetchShared(el.dataset.id);
    const now = Date.now(), src = normalizeSession(d.session);
    const copy = saveSeance({ ...src, id: uid(), name: d.title, source: 'copy', template: false, archived: false, explain: null, createdAt: now, updatedAt: now,
      exercises: src.exercises.map((e) => ({ ...e, id: uid(), note: '' })), origin: { kind: d.scope, id: d.id, author: d.author || '', copiedAt: now } });
    buzzOk(); toast('Copie enregistrée dans tes séances (indépendante de l’original)'); go('library', 'seance', copy.id);
  } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.commonEdit = () => { const d = S.shared.detail; if (!d?.canEdit) return; S.sharedDraft = { id: d.id, base: d.updatedAt, session: normalizeSession(d.session), admin: !d.mine }; go('library', 'shared-edit', d.id); };
ACT.sharedCancel = async () => { if (await ask('Abandonner les modifications de la contribution ?')) { S.sharedDraft = null; go('library', 'common-detail', S.shared.detail?.id || ''); } };
ACT.sharedSave = async () => {
  const dr = S.sharedDraft; if (!dr) return;
  try {
    await api('PUT', `/api/shared/${encodeURIComponent(dr.id)}`, { session: dr.session, title: dr.session.name, baseUpdatedAt: dr.base }, { opId: 'op-' + uid() });
    S.sharedDraft = null; S.shared.detail = null; S.shared.common = null; buzzOk(); toast('Contribution mise à jour'); go('library', 'common-detail', dr.id);
  } catch (e) {
    if (e.status === 409 && (await ask('Cette contribution a été modifiée entre-temps par quelqu’un d’autre.', { ok: 'Écraser avec ma version', cancel: 'Garder la version existante', danger: true }))) {
      try { await api('PUT', `/api/shared/${encodeURIComponent(dr.id)}`, { session: dr.session, title: dr.session.name, force: true }); S.sharedDraft = null; toast('Contribution mise à jour'); go('library', 'common-detail', dr.id); } catch (e2) { toast(e2.message, 4000, 'bad'); }
    } else toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad');
  }
};
ACT.commonDelete = async () => {
  const d = S.shared.detail; if (!d) return;
  if (!(await ask(`Supprimer « ${d.title} » de la bibliothèque commune ?`, { ok: 'Supprimer', danger: true, detail: 'Les copies déjà enregistrées par les membres sont conservées (elles sont indépendantes).' }))) return;
  try { await api('DELETE', `/api/shared/${encodeURIComponent(d.id)}`); S.shared.detail = null; S.shared.common = null; toast('Supprimée'); go('library', 'common'); loadCommon(); }
  catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.commonPublish = () => {
  const list = S.seances.items.filter((s) => !s.archived && s.exercises.length);
  openSheet(h`<h2 style="margin:0">Partager une séance</h2>${list.length ? list.map((s) => h`<button class="item pick" data-act="sPublish" data-id="${s.id}"><div class="ico">${s.emoji}</div><div class="grow"><b>${s.name}</b><div class="tiny muted">${s.exercises.length} exercices</div></div></button>`) : h`<p class="muted">Crée d’abord une séance avec au moins un exercice.</p>`}<button class="btn" data-act="closeSheet">Fermer</button>`);
};

/* ═════════ Recherche ═════════ */
function vSearch() {
  const q = S.search.q, c = ctx();
  const classic = q ? classicSearch(q, { seances: S.seances.items, history: S.history, personal: S.personal, common: S.shared.common || [], goals: c.goals.map((g) => ({ ...g, label: goalLabel(g) })) }) : [];
  const smart = q && S.search.smart ? smartSearch(q, c, { seances: S.seances.items }) : [];
  const row = (r) => h`<button class="item pick" data-act="searchOpen" data-kind="${r.kind}" data-id="${r.id}"><div class="grow"><b>${r.label}</b><div class="tiny muted">${r.detail}</div></div></button>`;
  return h`<form data-submit="search" class="row"><input type="search" name="q" value="${q}" placeholder="Ex. front lever, séances sans matériel, records de tirage…" aria-label="Rechercher" class="grow"><button class="btn pri" type="submit">🔎</button></form>
    <label class="chk"><input type="checkbox" data-change="searchSmart" ${S.search.smart ? 'checked' : ''}> Recherche intelligente (capacités, figures, muscles, matériel, styles)</label>
    ${q ? h`${smart.map((g) => h`<div class="card"><h3>${g.title}</h3><p class="tiny muted">${g.why}</p>${g.results.length ? g.results.slice(0, 15).map(row) : h`<p class="small muted">Aucun résultat.</p>`}</div>`)}
      <div class="card"><h3>Résultats texte (${classic.length})</h3>${classic.length ? classic.map(row) : h`<p class="small muted">Aucun résultat.</p>`}</div>` : h`<p class="muted small">Cherche dans tes séances, ton historique, tes exercices, tes objectifs, le catalogue et la bibliothèque commune.</p>`}`;
}
SUBMIT.search = (f) => { S.search.q = String(new FormData(f).get('q') || '').trim(); render(); };
CHG.searchSmart = (el) => { S.search.smart = el.checked; render(); };
ACT.searchOpen = (el) => {
  const k = el.dataset.kind, id = el.dataset.id;
  if (k === 'seance') go('library', 'seance', id);
  else if (k === 'library') ACT.libInfo({ dataset: { id } });
  else if (k === 'personal') ACT.persInfo({ dataset: { id } });
  else if (k === 'common') ACT.commonOpen({ dataset: { id } });
  else if (k === 'history') go('progress', 'history', id);
  else if (k === 'goal') go('profile', 'goals', id);
  else if (k === 'record' || k === 'perf') go('progress', 'records');
  else if (k === 'ascent') go('profile', 'climbing');
};
export { vEditor };
