import { isExternal, externalLabel, externalOf } from './external.js';
import { registerPaths } from './pathlinks.js';
import { advancedUI } from './views-experience.js';
// views-progress.js — Progrès : comparaisons personnelles, résumés, régularité, charge, historique, records,
// timeline, journal, analyses descriptives et mode Lab. Toujours par rapport à soi-même, jamais aux autres.
import { doneList } from './views-profile.js';
import { h, raw, $, toast, openSheet, closeSheet, ask, askText, seg, chip, menuList, subHead, tag, empty, howBox, meter, bars, lineChart, fmtDay, fmtDate, fmtDateTime, relDate, numberField, buzzOk, fmtDur } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, go, render, deleteHistory, updateHistory, putItem, delItem, item, itemsOf, getSeance } from './state.js';
import { uid, exKey } from './shared.js';
import { CAPACITIES, MUSCLES, METRICS } from './model.js';
import { benchmarks, periodSummary, regularity, loadAnalysis, records, timeline, journal, diagnostics, atypicalSessions, undertrained, forgottenGoals, whyNoProgress, activeGoals, goalLabel, labReport, entryActivity, activityLabel, perfText, muscleVolume, achievements, capacityState, confWord } from './brain.js';
import { anatomySvg } from './anatomy.js';
import { compressPhoto } from './views-climb.js';
import { streakCard, badgesCard } from './views-motiv.js';
import { composePage, savedLayouts } from './layout.js';
import { FEELS, sessionFromHistory } from './live.js';
import { startPlayer } from './player.js';
import { learnedCard } from './views-forme.js';
import { storyCard } from './views-story.js';

const SUBS = [['summary', '📊 Résumé'], ['history', '📋 Historique'], ['records', '🏆 Records'], ['timeline', '🕰️ Timeline'], ['journal', '📝 Journal'], ['analyses', '🔍 Analyses'], ['lab', '🧪 Lab']];
const SUB_INFO = {
  journal: ['📝', 'Journal', (c) => (c.history.length ? `${c.history.length} séance${c.history.length > 1 ? 's' : ''}, blocs et voies, mesures, notes, étapes` : 'Séances, blocs et voies, mesures, notes, étapes')],
  records: ['🏆', 'Records et mesures', () => 'Records, tests, maxima (dans ton profil)'], analyse: ['🔎', 'Mon analyse', () => 'Capacités, tendances, pourquoi ces conseils, lab'],
};
registerPaths('Progrès', 'progress', Object.entries(SUB_INFO).filter(([id]) => !['records', 'analyse'].includes(id)).map(([id, [, label]]) => [label, id]));
/** Progrès : le résumé d'abord (l'essentiel), puis la liste des rubriques ; chaque rubrique a sa page. */
export function vProgress() {
  const sub = SUBS.some(([k]) => k === S.sub.progress) ? S.sub.progress : 'summary';
  // Les records ont rejoint « Records et mesures » (Profil) : l'ancienne adresse y mène.
  if (sub === 'records') { setTimeout(() => go('profile', 'perfs'), 0); return ''; }
  // Historique et frise ont rejoint le Journal (le détail d'une séance garde son adresse).
  if ((sub === 'history' && !S.param) || sub === 'timeline') { S.jf = sub === 'history' ? 'session' : 'step'; setTimeout(() => go('progress', 'journal'), 0); return ''; }
  if (sub === 'history') return h`${subHead('progSub', 'journal', 'Journal', '📋 Séance')}${vHistory()}`;
  const views = { summary: vSummary, history: vHistory, journal: vJournal, analyses: vAnalyses, lab: vLab };
  if (sub === 'summary') { const c = ctx(); return h`<h1>Progrès</h1><p class="tiny muted pagehelp">Ce que tes séances ont changé : régularité, volume, records et ce qui progresse (ou pas).</p>${vSummary()}<span class="kicker">Aller plus loin</span>${menuList(Object.entries(SUB_INFO).map(([k, [ic, t, d]]) => ['progSub', k, ic, t, d(c)]))}`; }
  // Tendances et Lab font partie de « Mon analyse » (profil).
  if (sub === 'analyses' || sub === 'lab') return h`${subHead('profSub', 'analyse', 'Mon analyse', sub === 'lab' ? '🧪 Lab' : '🔍 Tendances et diagnostics')}${views[sub]()}`;
  const [ic, t] = SUB_INFO[sub];
  return h`${subHead('progSub', 'summary', 'Progrès', `${ic} ${t}`)}${views[sub]()}`;
}
ACT.progSub = (el) => { if (el.dataset.id === 'journal' && !el.dataset.keep) S.jf = S.jf || 'all'; return el.dataset.id === 'records' ? go('profile', 'perfs') : el.dataset.id === 'analyse' ? go('profile', 'analyse') : go('progress', el.dataset.id); };
const pct = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x} %`);

function vSummary() {
  if (!advancedUI() && !S.lay && !savedLayouts().progress && ctx().history.length) return simpleProgress();
  const c = ctx(), days = S.benchDays || 30, b = benchmarks(c, days), per = S.sumKind || 'week', s = periodSummary(c, per), reg = regularity(c), load = loadAnalysis(c);
  if (!c.history.length) return h`<section class="card hero center"><div style="font-size:3rem">🌱</div><h2>Ta progression commence ici</h2><p>Fais ta première séance : tes chiffres, tes records et ta régularité apparaîtront ici.</p><button class="btn pri big" data-act="genOpen">🎯 Me proposer une séance</button></section>${storyCard()}`;
  const delta = (x) => (x == null ? '' : x > 0 ? h`<i class="up">▲ ${x} %</i>` : x < 0 ? h`<i class="down">▼ ${Math.abs(x)} %</i>` : h`<i>=</i>`);
  const kpi = (ic, label, v, d) => h`<div class="kpi"><span>${ic} ${label}</span><b>${v}</b>${delta(d)}</div>`;
  const maxCap = Math.max(1, ...b.capDiff.slice(0, 5).map((x) => Math.max(x.cur, x.prev)));
  const wins = [...s.progression.filter((p) => /record|maximum/i.test(p)).slice(0, 2).map((p) => ['🏆', p.replace(/^Nouveau (record|maximum) — /, 'Record : ')]), ...s.goalsWorked.slice(0, 1).map((g) => ['🎯', `Objectif travaillé : ${g}`])];
  const WORK = () => h`<section class="card"><h3>💪 Ce que tu as travaillé</h3>${b.capDiff.slice(0, 5).map((x) => h`<div class="cbar"><span>${x.label}</span><div class="track"><i class="prev" style="width:${Math.round((x.prev / maxCap) * 100)}%"></i><i class="cur" style="width:${Math.round((x.cur / maxCap) * 100)}%"></i></div><b>${x.cur}</b></div>`)}
      <p class="tiny muted">Barre claire : ${days} derniers jours · ombre : période d’avant</p></section>`;
  const REG = () => h`<section class="card"><h3>📆 Régularité</h3>${bars(reg.weeks, ['il y a 12 sem.', 'cette semaine'])}
      <div class="chips"><span class="chip static">≈ ${reg.mean} séance(s) / semaine</span>${reg.streakWeeks ? h`<span class="chip static">🔥 ${reg.streakWeeks} semaine(s) d’affilée</span>` : ''}${reg.change && reg.change !== 'stable' ? h`<span class="chip static">${reg.change === 'hausse' ? '📈 en hausse' : reg.change === 'baisse' ? '📉 en baisse' : '↩️ reprise'}</span>` : ''}</div>
      ${reg.gaps.length ? h`<details class="how mini"><summary>Pauses de 7 jours ou plus (${reg.gaps.length})</summary><ul class="small">${reg.gaps.map((g) => h`<li>${g.days} jours ${g.to ? `(du ${fmtDay(g.from)} au ${fmtDay(g.to)})` : `(depuis le ${fmtDay(g.from)})`}</li>`)}</ul></details>` : ''}</section>`;
  const LOAD = () => h`<section class="card"><h3>📊 Charge</h3><div class="grid3">${load.weeks.slice(0, 3).map((w, i) => h`<div class="stat"><b>${w.load}</b><span>${i === 0 ? 'cette semaine' : i === 1 ? 'sem. −1' : 'sem. −2'}</span></div>`)}</div>
      ${load.signals.length ? load.signals.map((x) => h`<div class="win warnw"><span>⚠️</span>${x}</div>`) : h`<p class="small">👍 Charge stable</p>`}
      <details class="how mini"><summary>Comment c’est calculé ?</summary><p class="tiny">Charge = durée × ressenti (1 à 5). ${load.disclaimer}</p></details></section>`;
  const SUM = () => h`<details class="card fold"><summary><span>🗓️ Résumé ${per === 'week' ? 'de la semaine' : 'du mois'}</span><em>${s.sessions}</em></summary>
      <div class="chips">${chip(per === 'week', 'Semaine', 'data-act="sumKind" data-id="week"')}${chip(per === 'month', 'Mois', 'data-act="sumKind" data-id="month"')}</div>
      <p class="small">${s.sessions} séance(s) · ${s.minutes} min${s.activities.length ? ' · ' + s.activities.map((a) => `${a.label} ×${a.n}`).join(', ') : ''}</p>
      ${s.undertrained.length ? h`<p class="small">🧩 Peu travaillé : ${s.undertrained.join(', ')}</p>` : ''}
      <button class="btn" data-act="recapOpen">📸 Mon bilan du mois en image</button></details>`;
  const kpisView = () => h`<div class="kpiwrap"><div class="row between">${seg('benchDays', String(days), [['7', '7 jours'], ['30', '30 jours'], ['90', '90 jours']])}</div>
    <div class="kpis">${kpi('🏋️', 'Séances', b.cur.sessions, b.deltas.sessions)}${kpi('⏱', 'Minutes', b.cur.minutes, b.deltas.minutes)}${kpi('🔁', 'Séries', b.cur.sets, b.deltas.sets)}${kpi('😮‍💨', 'Ressenti', b.cur.rpe ?? '—', null)}</div>
    <p class="tiny muted center">Comparé aux ${days} jours d’avant · uniquement toi</p></div>`;
  return composePage('progress', {
    streak: () => streakCard(),
    kpis: kpisView,
    wins: () => (wins.length ? h`<section class="card ok-b"><span class="kicker ok-t">Tes bonnes nouvelles</span>${wins.map(([ic, t]) => h`<div class="win"><span>${ic}</span>${t}</div>`)}</section>` : ''),
    goalsdone: () => doneList(ctx().goals, 3),
    work: () => (b.capDiff.length ? WORK() : ''),
    regularity: () => REG(),
    load: () => LOAD(),
    muscles: () => h`<section class="card"><div class="row between"><h3>🫀 Muscles travaillés</h3>${seg('muscleDays', String(S.muscleDays || 7), [['7', '7 j'], ['30', '30 j']])}</div>${raw(anatomySvg({ heat: muscleVolume(c, S.muscleDays || 7) }))}${menuList([['allGo', '', '🪞', 'Séries par muscle et mensurations', 'Repère de la semaine, silhouette visée (dans Mon corps et mes préférences)', 'profile/body']])}</section>`,
    badges: () => badgesCard(),
    weeksum: () => SUM(),
    learned: () => learnedCard(),
    story: () => storyCard(),
  });
}
ACT.benchDays = (el) => { S.benchDays = Number(el.dataset.id); render(); };
ACT.sumKind = (el) => { S.sumKind = el.dataset.id; render(); };
ACT.muscleDays = (el) => { S.muscleDays = Number(el.dataset.id); render(); };

/* ═════════ Historique ═════════ */
function vHistory() {
  if (S.param) { const e = S.history.find((x) => x.id === S.param); if (e) return vEntry(e); }
  S.jf = 'session'; setTimeout(() => go('progress', 'journal'), 0); return '';
}
ACT.histOpen = (el) => go('progress', 'history', el.dataset.id);
const FEEL_E = Object.fromEntries(FEELS.map(([v, e]) => [v, e]));
ACT.histRedo = async(el) => { const e = S.history.find((x) => x.id === el.dataset.id); if (!e) return; if(isExternal(e)) return ACT.cpResume(); if(e.data?.quickLog && !e.data.exercises?.length){const {openWizard}=await import('./views-climbplan.js');openWizard({sport:e.data.activity,minutes:e.durationSeconds ? e.durationSeconds/60 : S.settings.defaultMinutes,envId:e.data.context?.env || ''});return;}startPlayer(sessionFromHistory(e, e.sessionId ? getSeance(e.sessionId) : null)); };
function vEntry(e) {
  const q = e.data?.questionnaire || {}, d = e.data || {};
  return h`<h2 style="margin:0">${e.sessionName}</h2>
    ${isExternal(e) ? h`<p class="small muted">${externalLabel(e)} · Import privé, exclu des demandes envoyées à l’IA.${externalOf(e).provider === 'strava' && externalOf(e).channel === 'api' && /^\d+$/.test(externalOf(e).id) ? h` <a href="https://www.strava.com/activities/${externalOf(e).id}" target="_blank" rel="noopener noreferrer">Voir sur Strava</a>` : ''}</p>` : ''}
    <div class="card"><p class="small">${fmtDateTime(e.startedAt)} · ${d.quickLog?.durationKnown === false ? 'durée non renseignée' : 'durée '+fmtDur(e.durationSeconds || 0)}${d.activeSeconds ? ' · actif ' + fmtDur(d.activeSeconds) : ''}${d.pausedSeconds ? ' · pause ' + fmtDur(d.pausedSeconds) : ''}${d.plannedMin ? ' · prévu ' + d.plannedMin + ' min' : ''}</p>
      ${d.quickLog?.performance ? h`<p class="small">Repère déclaré : ${d.quickLog.performance}</p>` : ''}${['before','after'].includes(d.quickLog?.order) ? h`<p class="small">${d.quickLog.order==='before'?'Avant':'Après'} la séance principale.</p>`:''}
      ${d.agenda?.planned ? h`<p class="tiny muted">Prévu : ${d.agenda.planned.title} · ${d.agenda.planned.date}${d.agenda.planned.time?' · '+d.agenda.planned.time:''}</p>`:''}
      ${d.context?.envName ? h`<p class="small">Lieu : ${d.context.envName}</p>` : ''}${d.aborted ? h`<p class="small warn-t">Séance interrompue avant la fin.</p>` : ''}
      ${q.felt?.length ? h`<p class="small">Muscles sentis : ${q.felt.map((m) => MUSCLES[m]?.label || m).join(', ')}</p>` : ''}${q.hardest ? h`<p class="small">Plus difficile : ${q.hardest}</p>` : ''}${q.easiest ? h`<p class="small">Plus facile : ${q.easiest}</p>` : ''}
      ${d.rpe ? h`<p class="small">Ressenti : ${d.rpe}/5</p>` : ''}${d.note ? h`<p class="small">📝 ${d.note}</p>` : ''}${(q.answers || []).map((a) => h`<p class="small">${a.q} : ${a.a}</p>`)}${(d.swaps || []).length ? h`<p class="small">Remplacements : ${d.swaps.map((s) => `${s.from} → ${s.to}`).join(', ')}</p>` : ''}</div>
    <div class="card">${(d.exercises || []).map((x) => h`<div class="item"><div class="grow"><b>${x.name}</b><div class="tiny muted">${(x.sets || []).map((s) => (s.seconds ? `${s.seconds} s` : `${s.reps}${s.load ? ' × ' + s.load + ' kg' : ''}`) + (s.feel ? ' ' + (FEEL_E[s.feel] || '') : '')).join(' · ')}</div>${x.note ? h`<div class="tiny">📝 ${x.note}</div>` : ''}</div></div>`)}</div>
    ${mediaCard(e)}
    <div class="row wrapf"><button class="btn pri" data-act="histRedo" data-id="${e.id}">${isExternal(e)?'Créer une séance':d.quickLog && !d.exercises?.length?'Préparer une séance similaire':'🔁 Refaire cette séance'}</button><button class="btn" data-act="histEdit" data-id="${e.id}">✎ Ressenti / note</button><button class="btn danger" data-act="histDel" data-id="${e.id}">🗑 Supprimer</button></div>`;
}
/* Journal visuel : photos (réduites, synchronisées), liens vidéo, captures et notes liés à une séance. Privé au compte. */
function mediaCard(e) {
  const list = itemsOf('media').filter((m) => m.ref === e.id);
  return h`<div class="card"><h3>📷 Photos, vidéos et notes</h3>${list.length ? list.map((m) => { const ph = m.hasPhoto ? item('photo', m.id) : null;
      return h`<div class="item"><div class="grow">${ph?.data ? h`<img src="${ph.data}" alt="${m.note || 'Photo de la séance'}" class="mthumb">` : ''}<b class="small">${m.note || { photo: 'Photo', video: 'Vidéo', capture: 'Capture', note: 'Note' }[m.kind]}</b>${m.url && /^https:\/\//.test(m.url) ? h` <a class="small acc-t" href="${m.url}" target="_blank" rel="noopener noreferrer">Ouvrir la vidéo</a>` : ''}</div><button class="btn sm ic danger" data-act="mediaDel" data-id="${m.id}" aria-label="Retirer">✕</button></div>`; }) : h`<p class="small muted">Rien pour l’instant.</p>`}
    <div class="row wrapf"><label class="btn sm filebtn">📷 Photo / capture<input type="file" accept="image/*" data-change="mediaPhoto" data-id="${e.id}" class="hidden"></label><button class="btn sm" data-act="mediaLink" data-id="${e.id}">🎬 Lien vidéo</button><button class="btn sm" data-act="mediaNote" data-id="${e.id}">📝 Note</button></div>
    <p class="tiny muted">Visible seulement par toi. Les vidéos ne sont pas stockées : garde un lien (https).</p></div>`;
}
const mediaBase = (ref) => { const e = S.history.find((x) => x.id === ref); return { ref, refType: 'history', activity: e?.data?.activity || e?.data?.context?.phases?.[0]?.activity || '', date: Date.now() }; };
CHG.mediaPhoto = async (el) => { const id = 'md-' + uid().slice(0, 14); try { const ph = await compressPhoto(el.files?.[0]); putItem('photo', id, ph); putItem('media', id, { ...mediaBase(el.dataset.id), kind: 'photo', hasPhoto: true, note: '' }); toast('Photo ajoutée'); render(); } catch (e) { toast(e.message, 4000, 'bad'); } };
ACT.mediaLink = async (el) => { const url = ((await askText('Lien de la vidéo', { value: 'https://', placeholder: 'https://…', max: 400 })) || '').trim(); if (!url || url === 'https://') return; if (!/^https:\/\/[^\s]{4,}$/.test(url)) return toast('Le lien doit commencer par https://', 4000); const note = (await askText('Légende (facultatif)', { ok: 'Ajouter', cancel: 'Sans légende', max: 160 })) || ''; putItem('media', 'md-' + uid().slice(0, 14), { ...mediaBase(el.dataset.id), kind: 'video', url, note }); render(); };
ACT.mediaNote = async (el) => { const note = ((await askText('Ta note', { ok: 'Ajouter', max: 300 })) || '').trim(); if (!note) return; putItem('media', 'md-' + uid().slice(0, 14), { ...mediaBase(el.dataset.id), kind: 'note', note }); render(); };
ACT.mediaDel = async (el) => { if (!(await ask('Retirer cet élément ?', { danger: true, ok: 'Retirer' }))) return; delItem('media', el.dataset.id); if (item('photo', el.dataset.id)) delItem('photo', el.dataset.id); render(); };
ACT.mediaView = (el) => { const ph = item('photo', el.dataset.id), m = item('media', el.dataset.id); if (ph?.data) openSheet(h`<img src="${ph.data}" alt="${m?.note || 'Photo'}" style="width:100%;border-radius:12px"><button class="btn" data-act="closeSheet">Fermer</button>`); };
ACT.histEdit = (el) => { const e = S.history.find((x) => x.id === el.dataset.id); if (!e) return; openSheet(h`<h2 style="margin:0">Modifier</h2><form data-submit="histSave" class="stack"><input type="hidden" name="id" value="${e.id}"><label>Ressenti (1–5)<select name="rpe"><option value="0">—</option>${[1, 2, 3, 4, 5].map((v) => h`<option ${e.data?.rpe === v ? 'selected' : ''}>${v}</option>`)}</select></label><label>Note<textarea name="note" maxlength="600">${e.data?.note || ''}</textarea></label><button class="btn pri" type="submit">Enregistrer</button></form>`); };
SUBMIT.histSave = (f) => { const d = Object.fromEntries(new FormData(f)), e = S.history.find((x) => x.id === d.id); if (!e) return; updateHistory({ ...e, data: { ...e.data, rpe: Number(d.rpe) || 0, note: d.note } }); closeSheet(); toast('Enregistré'); render(); };
ACT.histDel = async (el) => { if (!(await ask('Supprimer cette séance de l’historique ?', { ok: 'Supprimer', danger: true }))) return; deleteHistory(el.dataset.id); go('progress', 'history'); };

/* ═════════ Records ═════════ */
/** Records des séances (dans Profil › Records et mesures). */
export function recordsCards() {
  const c = ctx(), r = records(c);
  const names = new Map(); for (const hh of c.history) for (const e of hh.data?.exercises || []) names.set(exKey(e.name), e.name);
  const key = S.progressEx && names.has(S.progressEx) ? S.progressEx : [...names.keys()][0] || '';
  const pts = [];
  for (const hh of [...c.history].reverse()) { const ex = (hh.data?.exercises || []).find((e) => exKey(e.name) === key); if (!ex) continue; const sets = (ex.sets || []).filter((s) => s.done !== false); const load = Math.max(0, ...sets.map((s) => s.load || 0)), sec = Math.max(0, ...sets.map((s) => s.seconds || 0)), reps = Math.max(0, ...sets.map((s) => s.reps || 0)); pts.push({ v: load || sec || reps, u: load ? 'kg' : sec ? 's' : 'rép.' }); }
  return h`<div class="card"><h3>🏆 Records et mesures</h3>${r.length ? r.map((x) => h`<div class="item"><div class="grow"><b>${x.label}</b><div class="tiny muted">${x.kind === 'perf' ? 'performance' : 'meilleure série'} · ${fmtDay(x.date)}</div></div><span>${x.text}</span></div>`) : h`<p class="muted small">Tes mesures et meilleures séries apparaîtront ici après leur enregistrement.</p>`}</div>
    ${names.size ? h`<div class="card"><h3>Évolution d’un exercice</h3><select data-change="progEx" aria-label="Exercice">${[...names].map(([k, n]) => h`<option value="${k}" ${k === key ? 'selected' : ''}>${n}</option>`)}</select>${lineChart(pts, pts[0]?.u || '')}</div>` : ''}`;
}
CHG.progEx = (el) => { S.progressEx = el.value; render(); };

/* ═════════ Timeline et journal ═════════ */
/** Le journal : tout ce qui s'est passé, au même endroit (séances, blocs et voies, mesures, notes, étapes), avec des filtres. */
const JF = [['all', 'Tout'], ['session', '🏋️ Séances'], ['ascent', '🧗 Blocs et voies'], ['perf', '📏 Mesures'], ['note', '📝 Notes'], ['media', '📷 Photos et vidéos'], ['step', '🏆 Étapes et records']];
function vJournal() {
  const c = ctx(), f = JF.some(([k]) => k === S.jf) ? S.jf : 'all', max = S.jMax || 60;
  const steps = timeline(c).map((e) => ({ t: e.t, kind: 'step', icon: e.icon, title: e.text, text: '', note: '' }));
  const medias = itemsOf('media').map((m) => ({ t: m.date, kind: 'media', icon: { photo: '📷', video: '🎬', capture: '🖼️', note: '📝' }[m.kind] || '📎', title: m.note || { photo: 'Photo', video: 'Vidéo', capture: 'Capture', note: 'Note' }[m.kind], text: [m.activity ? activityLabel(m.activity, c) : '', m.url ? '🔗 lien' : ''].filter(Boolean).join(' · '), note: '', id: m.ref, media: m }));
  const all = [...journal(c, 2000), ...steps, ...medias].sort((x, y) => y.t - x.t), list = all.filter((e) => f === 'all' || e.kind === f);
  return h`<form data-submit="jnote" class="card"><textarea name="text" maxlength="1000" required rows="2" placeholder="📝 Une note, une sensation…" aria-label="Ajouter une note au journal"></textarea><button class="btn pri" type="submit">＋ Ajouter au journal</button></form>
    ${c.future.length ? h`<div class="card flat warn-b small">${c.future.length} séance(s) datée(s) dans le futur ne sont pas comptées comme réalisées (horloge ou import erroné).</div>` : ''}
    <div class="chips">${JF.map(([k, l]) => chip(f === k, l, `data-act="jFilter" data-id="${k}"`))}</div>
    ${list.length ? list.slice(0, max).map((e) => { const inner = h`<span class="ico sm">${e.icon}</span><div class="grow"><div class="row between wrapf"><b>${e.title}</b><span class="tiny muted">${e.kind === 'step' ? fmtDay(e.t) : fmtDateTime(e.t)}</span></div>${e.text ? h`<div class="small">${e.text}</div>` : ''}${e.note ? h`<div class="small muted">« ${e.note} »</div>` : ''}${e.more?.length ? h`<div class="tiny muted">${e.more.join(' · ')}</div>` : ''}</div>`;
        if (e.kind === 'media') return h`<div class="card journal media row">${inner}${e.media.hasPhoto ? h`<button class="btn sm" data-act="mediaView" data-id="${e.media.id}">Voir</button>` : ''}${e.media.url && /^https:\/\//.test(e.media.url) ? h`<a class="btn sm" href="${e.media.url}" target="_blank" rel="noopener noreferrer">Ouvrir</a>` : ''}${e.id ? h`<button class="btn sm ghost" data-act="histOpen" data-id="${e.id}">Séance</button>` : ''}</div>`;
        if (e.kind === 'note' && e.noteId) return h`<div class="card journal note row">${inner}<button class="btn sm ghost" data-act="jnoteEdit" data-id="${e.noteId}" aria-label="Modifier la note">✎</button></div>`;
        // Mesure ou bloc / voie : un toucher pour corriger (valeur, date, cotation…) ou supprimer.
        if (e.kind === 'perf' && e.perfId) return h`<button class="card pick journal perf row" data-act="perfEdit" data-id="${e.perfId}">${inner}<span class="chev">›</span></button>`;
        if (e.kind === 'ascent' && e.ascId) return h`<button class="card pick journal ascent row" data-act="ascEdit" data-id="${e.ascId}">${inner}<span class="chev">›</span></button>`;
        return e.kind === 'session' && e.id ? h`<button class="card pick journal session row" data-act="histOpen" data-id="${e.id}">${inner}<span class="chev">›</span></button>` : h`<div class="card journal ${e.kind} row">${inner}</div>`; })
      : empty(f === 'all' ? 'Ton journal regroupera tes séances, blocs et voies, mesures, notes et étapes.' : 'Rien de ce type pour l’instant.', f === 'all' || f === 'session' ? h`<button class="btn pri" data-act="genOpen">▶ Faire la séance du jour</button> <button class="btn" data-act="cpResume">Créer une séance</button>` : '')}
    ${list.length > max ? h`<button class="btn ghost" data-act="jMore">Voir plus (${list.length - max})</button>` : ''}`;
}
ACT.jFilter = (el) => { S.jf = el.dataset.id; S.jMax = 60; render(); };
ACT.jMore = () => { S.jMax = (S.jMax || 60) + 60; render(); };
ACT.jnoteEdit = (el) => {
  const n = item('jnote', el.dataset.id); if (!n) return;
  openSheet(h`<form class="stack" data-submit="jnoteSave"><h2 style="margin:0">📝 Note du ${fmtDay(n.date)}</h2><input type="hidden" name="id" value="${el.dataset.id}">
    <textarea name="text" maxlength="1000" rows="5" required aria-label="Texte de la note">${n.text}</textarea>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn danger" type="button" data-act="jnoteDel" data-id="${el.dataset.id}">Supprimer la note</button></div></form>`);
};
SUBMIT.jnoteSave = (f) => { const d = Object.fromEntries(new FormData(f)), n = item('jnote', d.id), t = String(d.text || '').trim(); if (!n) return closeSheet(); if (!t) return toast('Écris quelque chose, ou supprime la note.'); putItem('jnote', d.id, { ...n, text: t.slice(0, 1000) }); closeSheet(); toast('Note modifiée'); render(); };
ACT.jnoteDel = async (el) => { if (!item('jnote', el.dataset.id) || !(await ask('Supprimer cette note du journal ?', { ok: 'Supprimer', danger: true }))) return; delItem('jnote', el.dataset.id); closeSheet(); toast('Note supprimée'); render(); };
SUBMIT.jnote = (f) => { const t = String(new FormData(f).get('text') || '').trim(); if (!t) return; putItem('jnote', 'jn-' + uid().slice(0, 14), { date: Date.now(), text: t }); f.reset(); buzzOk(); toast('Note ajoutée'); render(); };

/* ═════════ Analyses descriptives ═════════ */
function vAnalyses() {
  const c = ctx(), d = diagnostics(c), a = atypicalSessions(c), u = undertrained(c), f = forgottenGoals(c), g = activeGoals(c)[0];
  const w = g ? whyNoProgress(g, c) : null;
  return h`<div class="card"><h3>🔍 Diagnostics</h3>${d.items.length ? d.items.slice(0, 5).map((x) => h`<div class="win"><span>${x.icon}</span>${x.text}</div>`) : h`<p class="muted small">Rien de particulier dans tes données récentes 👍</p>`}</div>
    <div class="card"><h3>🧩 Peu travaillé ces 30 jours</h3>${u.items.length ? u.items.map((x) => h`<div class="cbar"><span>${x.label}</span><div class="track"><i class="prev" style="width:${Math.min(100, x.expected * 4)}%"></i><i class="cur" style="width:${Math.min(100, x.actual * 4)}%"></i></div><b>${x.actual} %</b></div>`) : h`<p class="small muted">${u.enough ? 'Tout est bien réparti 👍' : 'Pas encore assez de séances pour comparer.'}</p>`}
      ${u.items.length ? h`<details class="how mini"><summary>Comment lire ?</summary><p class="tiny">Barre pleine : ta part de volume. Ombre : ce que demandent tes activités et objectifs. ${u.text}</p></details>` : ''}</div>
    <div class="card"><h3>🎯 Objectifs délaissés</h3>${f.length ? f.map((x) => h`<div class="item"><div class="grow small">${x.days != null ? `« ${x.label} » : dernière séance liée il y a ${x.days} jours (${fmtDay(x.last)}).` : `« ${x.label} » : pas encore travaillé.`}</div><button class="btn sm" data-act="todayGoal" data-id="${x.goal.id}">Séance</button></div>`) : h`<p class="muted small">Tous tes objectifs actifs ont été travaillés récemment.</p>`}</div>
    <div class="card"><h3>📌 Séances atypiques</h3>${a.length ? a.map((x) => h`<div class="win"><span>📌</span>${x.text}</div>`) : h`<p class="muted small">Rien d’inhabituel 👍</p>`}</div>
    ${w ? h`<div class="card"><h3>🤔 Pourquoi je stagne sur « ${w.goal} » ?</h3>${w.hypotheses.map((x) => h`<details class="win fold2"><summary><b>💡 ${x.title}</b></summary><p class="small">${x.text}</p></details>`)}${howBox({ facts: w.facts, missing: w.missing })}</div>` : ''}`;
}

/* ═════════ Mode Lab : expériences personnelles ═════════ */
function vLab() {
  const c = ctx(), labs = itemsOf('lab');
  return h`<p class="muted small">Teste une idée sur quelques semaines : hypothèse, état avant, période, état après, comparaison. Une expérience personnelle ne démontre pas une causalité scientifique.</p>
    <button class="btn pri" data-act="labNew">＋ Nouvelle expérience</button>
    ${labs.length ? labs.map((l) => { const r = labReport(l, c); return h`<div class="card"><div class="row between"><b>🧪 ${l.title}</b>${tag(({ running: 'en cours', done: 'terminée', abandoned: 'abandonnée' })[l.status], l.status === 'done' ? 'ok' : '')}</div>
      <p class="small">${l.hypothesis}</p>${l.criteria ? h`<p class="tiny">Critères observés : ${l.criteria}</p>` : ''}<p class="tiny muted">Du ${l.startDate} pendant ${l.weeks} semaine(s)${l.capId ? ' · capacité suivie : ' + (CAPACITIES[l.capId]?.label || l.capId) : ''}${l.metricId ? ' · mesure : ' + (c.metrics[l.metricId]?.label || l.metricId) : ''}</p>
      ${l.protocol || l.notes ? h`<details class="how mini" ${advancedUI() ? 'open' : ''}><summary>Protocole et notes</summary>${l.protocol ? h`<p class="small"><b>Protocole :</b> ${l.protocol}</p>` : ''}${l.notes ? h`<p class="small"><b>Notes :</b> ${l.notes}</p>` : ''}</details>` : ''}
      ${meter(r.progress * 100, '', `Avancement : ${l.title}`)}<p class="small">${r.sessions} séance(s) pendant la période${r.capSets != null ? ` · ${r.capSets} séries pondérées sur la capacité` : ''}.</p><p class="small">${r.text}</p><p class="tiny muted">${r.disclaimer}</p>${l.conclusion ? h`<p class="small"><b>Conclusion :</b> ${l.conclusion}</p>` : ''}
      <div class="row wrapf"><button class="btn sm" data-act="labEdit" data-id="${l.id}">✎ Mettre à jour</button><button class="btn danger sm" data-act="labDel" data-id="${l.id}">Supprimer</button></div></div>`; }) : ''}`;
}
function labForm(l) {
  const c = ctx(), today = new Date().toISOString().slice(0, 10);
  return h`<h2 style="margin:0">${l ? 'Expérience' : 'Nouvelle expérience'}</h2><form data-submit="labSave" class="stack"><input type="hidden" name="id" value="${l?.id || ''}">
    <label>Titre<input name="title" required maxlength="80" value="${l?.title || ''}" placeholder="Ex. 2 séances de gainage par semaine"></label>
    <label>Hypothèse de départ<textarea name="hypothesis" maxlength="500">${l?.hypothesis || ''}</textarea></label>
    <details class="how mini" ${advancedUI() ? 'open' : ''}><summary>Protocole et notes (facultatifs)</summary>
      <label>Protocole<textarea name="protocol" rows="3" maxlength="1200" placeholder="Ce que tu comptes tester : exercices, fréquence, durée, ce que tu gardes identique…">${l?.protocol || ''}</textarea></label>
      <label>Notes<textarea name="notes" rows="3" maxlength="1000" placeholder="Ce que tu observes au fil des séances, sensations, contexte…">${l?.notes || ''}</textarea></label>
      <p class="tiny muted">Un suivi personnel reste descriptif ; il ne prouve pas que le protocole cause le résultat.</p></details>
    <label>Critères observés <span class="tiny muted">(ce que tu regardes : ressenti, réussites, mesure…)</span><input name="criteria" maxlength="300" value="${l?.criteria || ''}" placeholder="Ex. nombre de voies enchaînées, ressenti des avant-bras"></label>
    <div class="grid2"><label>Début<input type="date" name="startDate" value="${l?.startDate || today}"></label>${numberField('weeks', 'Durée', l?.weeks ?? 4, { min: 1, max: 52, step: 1, unit: 'semaines' })}</div>
    <div class="grid2"><label>Capacité suivie<select name="capId"><option value="">—</option>${Object.entries(CAPACITIES).map(([id, x]) => h`<option value="${id}" ${l?.capId === id ? 'selected' : ''}>${x.label}</option>`)}</select></label>
    <label>Mesure avant / après<select name="metricId"><option value="">—</option>${Object.entries(c.metrics).filter(([, m]) => m.kind !== 'grade').map(([id, m]) => h`<option value="${id}" ${l?.metricId === id ? 'selected' : ''}>${m.label}</option>`)}</select></label></div>
    <div class="grid2">${numberField('before', 'Valeur avant (facultatif)', l?.before?.value ?? '')}${numberField('after', 'Valeur après (facultatif)', l?.after?.value ?? '')}</div>
    <p class="tiny muted">Sans valeur saisie, les performances enregistrées autour des dates sont utilisées si elles existent.</p>
    <label>Statut<select name="status">${[['running', 'En cours'], ['done', 'Terminée'], ['abandoned', 'Abandonnée']].map(([k, t]) => h`<option value="${k}" ${l?.status === k ? 'selected' : ''}>${t}</option>`)}</select></label>
    <label>Conclusion<textarea name="conclusion" maxlength="800">${l?.conclusion || ''}</textarea></label><button class="btn pri" type="submit">Enregistrer</button></form>`;
}
ACT.labNew = () => openSheet(labForm(null), { wide: true });
ACT.labEdit = (el) => { const l = item('lab', el.dataset.id); if (l) openSheet(labForm(l), { wide: true }); };
SUBMIT.labSave = (f) => {
  const d = Object.fromEntries(new FormData(f)), previous = d.id ? item('lab', d.id) || {} : {};
  const measurement = (key) => { const old = previous[key] || {}, value = d[key] === '' ? null : Number(d[key]); return { ...old, value, date: value === (old.value ?? null) ? old.date || 0 : 0 }; };
  putItem('lab', d.id || 'lab-' + uid().slice(0, 12), { ...previous, title: d.title, hypothesis: d.hypothesis, protocol: d.protocol || '', notes: d.notes || '', criteria: d.criteria || '', startDate: d.startDate, weeks: Number(d.weeks) || 4, capId: d.capId, metricId: d.metricId, before: measurement('before'), after: measurement('after'), status: d.status, conclusion: d.conclusion });
  closeSheet(); buzzOk(); toast('Expérience enregistrée'); render();
};
ACT.labDel = async (el) => { if (await ask('Supprimer cette expérience ?', { danger: true, ok: 'Supprimer' })) { delItem('lab', el.dataset.id); render(); } };

function simpleProgress() {
 const c=ctx(), days=S.benchDays || 30, b=benchmarks(c,days), r=regularity(c), less=undertrained(c).items.slice(0,3), load=loadAnalysis(c);
 return h`<section class="card"><h3>Ce qui change</h3><div class="chips">${[7,30,90].map((d) => chip(days===d, d+' jours', 'data-act="benchDays" data-id="'+d+'"'))}</div><p class="small">${r.text}</p>${b.capDiff.slice(0,4).map((x) => h`<div class="item"><div class="grow"><b>${x.label}</b><div class="tiny muted">${x.cur > x.prev ? 'Plus travaillé' : x.cur < x.prev ? 'Moins travaillé' : 'Stable'} · volume observé, pas une mesure de niveau</div></div></div>`)}${!b.capDiff.length ? h`<p class="muted small">Données insuffisantes pour comparer les capacités. Tes activités sont bien dans le journal.</p>` : ''}</section><details class="card"><summary>Ce qui mérite mon attention</summary>${less.map((x) => h`<p class="small">${x.text || x.label || x.capId}</p>`)}<p class="small">${load.text}</p>${load.signals.length?h`<ul class="small">${load.signals.map(text=>h`<li>${text}</li>`)}</ul><p class="tiny muted">Ces observations décrivent tes séances et ton ressenti.</p>`:''}</details><button class="btn" data-act="progSub" data-id="journal">Mon journal réel</button>`;
}
