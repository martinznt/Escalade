// views-progress.js — Progrès : comparaisons personnelles, résumés, régularité, charge, historique, records,
// timeline, journal, analyses descriptives et mode Lab. Toujours par rapport à soi-même, jamais aux autres.
import { doneGoals } from './goaldone.js';
import { doneList } from './views-profile.js';
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, menuList, subHead, tag, empty, howBox, meter, bars, lineChart, fmtDay, fmtDate, fmtDateTime, relDate, numberField, buzzOk, fmtDur } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, go, render, deleteHistory, updateHistory, putItem, delItem, item, itemsOf } from './state.js';
import { uid, exKey } from './shared.js';
import { CAPACITIES, MUSCLES, METRICS } from './model.js';
import { benchmarks, periodSummary, regularity, loadAnalysis, records, timeline, journal, diagnostics, atypicalSessions, undertrained, forgottenGoals, whyNoProgress, activeGoals, goalLabel, labReport, entryActivity, activityLabel, perfText, muscleVolume, achievements, capacityState, confWord } from './brain.js';
import { anatomySvg } from './anatomy.js';
import { streakCard, badgesCard } from './views-motiv.js';
import { composePage } from './layout.js';

const SUBS = [['summary', '📊 Résumé'], ['history', '📋 Historique'], ['records', '🏆 Records'], ['timeline', '🕰️ Timeline'], ['journal', '📝 Journal'], ['analyses', '🔍 Analyses'], ['lab', '🧪 Lab']];
const SUB_INFO = {
  history: ['📋', 'Historique', (c) => (c.history.length ? `${c.history.length} séance${c.history.length > 1 ? 's' : ''} enregistrée${c.history.length > 1 ? 's' : ''}` : 'Tes séances faites, une par une')],
  records: ['🏆', 'Records', () => 'Tes meilleures performances'], timeline: ['🕰️', 'Frise', () => 'Tout ce qui s’est passé, dans l’ordre'],
  journal: ['📝', 'Journal', () => 'Tes notes et tes ressentis'], analyses: ['🔍', 'Analyses', () => 'Tendances, charge, pourquoi je stagne'], lab: ['🧪', 'Lab', () => 'Graphiques détaillés pour aller plus loin'],
};
/** Progrès : le résumé d'abord (l'essentiel), puis la liste des rubriques ; chaque rubrique a sa page. */
export function vProgress() {
  const sub = SUBS.some(([k]) => k === S.sub.progress) ? S.sub.progress : 'summary';
  const views = { summary: vSummary, history: vHistory, records: vRecords, timeline: vTimeline, journal: vJournal, analyses: vAnalyses, lab: vLab };
  if (sub === 'summary') { const c = ctx(); return h`<h1>📈 Progrès</h1>${vSummary()}<span class="kicker">Aller plus loin</span>${menuList(Object.entries(SUB_INFO).map(([k, [ic, t, d]]) => ['progSub', k, ic, t, d(c)]))}`; }
  const [ic, t] = SUB_INFO[sub];
  return h`${subHead('progSub', 'summary', 'Progrès', `${ic} ${t}`)}${views[sub]()}`;
}
ACT.progSub = (el) => go('progress', el.dataset.id);
const pct = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x} %`);

function vSummary() {
  const c = ctx(), days = S.benchDays || 30, b = benchmarks(c, days), per = S.sumKind || 'week', s = periodSummary(c, per), reg = regularity(c), load = loadAnalysis(c);
  if (!c.history.length) return h`<section class="card hero center"><div style="font-size:3rem">🌱</div><h2>Ta progression commence ici</h2><p>Fais ta première séance : tes chiffres, tes records et ta régularité apparaîtront ici.</p><button class="btn pri big" data-act="genOpen">🎯 Me proposer une séance</button></section>`;
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
      ${s.undertrained.length ? h`<p class="small">🧩 Peu travaillé : ${s.undertrained.join(', ')}</p>` : ''}</details>`;
  const kpisView = () => h`<div class="kpiwrap"><div class="row between">${seg('benchDays', String(days), [['7', '7 jours'], ['30', '30 jours'], ['90', '90 jours']])}</div>
    <div class="kpis">${kpi('🏋️', 'Séances', b.cur.sessions, b.deltas.sessions)}${kpi('⏱', 'Minutes', b.cur.minutes, b.deltas.minutes)}${kpi('🔁', 'Séries', b.cur.sets, b.deltas.sets)}${kpi('😮‍💨', 'Ressenti', b.cur.rpe ?? '—', null)}</div>
    <p class="tiny muted center">Comparé aux ${days} jours d’avant · uniquement toi</p></div>`;
  return composePage('progress', {
    streak: () => streakCard(),
    kpis: kpisView,
    wins: () => (wins.length ? h`<section class="card ok-b"><span class="kicker ok-t">Tes bonnes nouvelles</span>${wins.map(([ic, t]) => h`<div class="win"><span>${ic}</span>${t}</div>`)}</section>` : ''),
    goalsdone: () => (doneGoals(ctx().goals).length ? doneList(ctx().goals, 3) : ''),
    work: () => (b.capDiff.length ? WORK() : ''),
    regularity: () => REG(),
    load: () => LOAD(),
    muscles: () => h`<section class="card"><div class="row between"><h3>🫀 Muscles travaillés</h3>${seg('muscleDays', String(S.muscleDays || 7), [['7', '7 j'], ['30', '30 j']])}</div>${raw(anatomySvg({ heat: muscleVolume(c, S.muscleDays || 7) }))}</section>`,
    badges: () => badgesCard(),
    weeksum: () => SUM(),
  });
}
ACT.benchDays = (el) => { S.benchDays = Number(el.dataset.id); render(); };
ACT.sumKind = (el) => { S.sumKind = el.dataset.id; render(); };
ACT.muscleDays = (el) => { S.muscleDays = Number(el.dataset.id); render(); };

/* ═════════ Historique ═════════ */
function vHistory() {
  const c = ctx();
  if (S.param) { const e = S.history.find((x) => x.id === S.param); if (e) return vEntry(e); }
  const list = c.history;
  return h`${c.future.length ? h`<div class="card flat warn-b small">${c.future.length} séance(s) datée(s) dans le futur ne sont pas comptées comme réalisées (horloge ou import erroné).</div>` : ''}
    ${list.length ? list.slice(0, 80).map((x) => h`<button class="card pick hist" data-act="histOpen" data-id="${x.id}"><div class="row"><div class="grow"><b>${x.sessionName}</b> ${x._failed ? tag('non synchronisée', 'bad') : ''}${x.data?.aborted ? tag('interrompue', 'warn') : ''}<div class="muted small">${fmtDateTime(x.startedAt)} · ${Math.round((x.durationSeconds || 0) / 60)} min${x.data?.rpe ? ' · ressenti ' + x.data.rpe + '/5' : ''} · ${activityLabel(entryActivity(x, c), c)}</div></div><span class="muted">›</span></div></button>`) : empty('Aucune séance réalisée pour l’instant.', h`<button class="btn pri" data-act="genOpen">▶ Faire la séance du jour</button> <button class="btn" data-act="cpNew">✨ Créer une séance</button>`)}`;
}
ACT.histOpen = (el) => go('progress', 'history', el.dataset.id);
function vEntry(e) {
  const q = e.data?.questionnaire || {}, d = e.data || {};
  return h`<div class="row"><button class="btn sm" data-act="progSub" data-id="history" aria-label="Retour">‹</button><h2 class="grow" style="margin:0">${e.sessionName}</h2></div>
    <div class="card"><p class="small">${fmtDateTime(e.startedAt)} · durée ${fmtDur(e.durationSeconds || 0)}${d.activeSeconds ? ' · actif ' + fmtDur(d.activeSeconds) : ''}${d.pausedSeconds ? ' · pause ' + fmtDur(d.pausedSeconds) : ''}${d.plannedMin ? ' · prévu ' + d.plannedMin + ' min' : ''}</p>
      ${d.context?.envName ? h`<p class="small">Lieu : ${d.context.envName}</p>` : ''}${d.aborted ? h`<p class="small warn-t">Séance interrompue avant la fin.</p>` : ''}
      ${q.felt?.length ? h`<p class="small">Muscles sentis : ${q.felt.map((m) => MUSCLES[m]?.label || m).join(', ')}</p>` : ''}${q.hardest ? h`<p class="small">Plus difficile : ${q.hardest}</p>` : ''}${q.easiest ? h`<p class="small">Plus facile : ${q.easiest}</p>` : ''}
      ${d.rpe ? h`<p class="small">Ressenti : ${d.rpe}/5</p>` : ''}${d.note ? h`<p class="small">📝 ${d.note}</p>` : ''}${(q.answers || []).map((a) => h`<p class="small">${a.q} : ${a.a}</p>`)}${(d.swaps || []).length ? h`<p class="small">Remplacements : ${d.swaps.map((s) => `${s.from} → ${s.to}`).join(', ')}</p>` : ''}</div>
    <div class="card">${(d.exercises || []).map((x) => h`<div class="item"><div class="grow"><b>${x.name}</b><div class="tiny muted">${(x.sets || []).map((s) => s.seconds ? `${s.seconds} s` : `${s.reps}${s.load ? ' × ' + s.load + ' kg' : ''}`).join(' · ')}</div></div></div>`)}</div>
    <div class="row wrapf"><button class="btn" data-act="histEdit" data-id="${e.id}">✎ Ressenti / note</button><button class="btn danger" data-act="histDel" data-id="${e.id}">🗑 Supprimer</button></div>`;
}
ACT.histEdit = (el) => { const e = S.history.find((x) => x.id === el.dataset.id); if (!e) return; openSheet(h`<h2 style="margin:0">Modifier</h2><form data-submit="histSave" class="stack"><input type="hidden" name="id" value="${e.id}"><label>Ressenti (1–5)<select name="rpe"><option value="0">—</option>${[1, 2, 3, 4, 5].map((v) => h`<option ${e.data?.rpe === v ? 'selected' : ''}>${v}</option>`)}</select></label><label>Note<textarea name="note" maxlength="600">${e.data?.note || ''}</textarea></label><button class="btn pri" type="submit">Enregistrer</button></form>`); };
SUBMIT.histSave = (f) => { const d = Object.fromEntries(new FormData(f)), e = S.history.find((x) => x.id === d.id); if (!e) return; updateHistory({ ...e, data: { ...e.data, rpe: Number(d.rpe) || 0, note: d.note } }); closeSheet(); toast('Enregistré'); render(); };
ACT.histDel = async (el) => { if (!(await ask('Supprimer cette séance de l’historique ?', { ok: 'Supprimer', danger: true }))) return; deleteHistory(el.dataset.id); go('progress', 'history'); };

/* ═════════ Records ═════════ */
function vRecords() {
  const c = ctx(), r = records(c);
  const names = new Map(); for (const hh of c.history) for (const e of hh.data?.exercises || []) names.set(exKey(e.name), e.name);
  const key = S.progressEx && names.has(S.progressEx) ? S.progressEx : [...names.keys()][0] || '';
  const pts = [];
  for (const hh of [...c.history].reverse()) { const ex = (hh.data?.exercises || []).find((e) => exKey(e.name) === key); if (!ex) continue; const sets = (ex.sets || []).filter((s) => s.done !== false); const load = Math.max(0, ...sets.map((s) => s.load || 0)), sec = Math.max(0, ...sets.map((s) => s.seconds || 0)), reps = Math.max(0, ...sets.map((s) => s.reps || 0)); pts.push({ v: load || sec || reps, u: load ? 'kg' : sec ? 's' : 'rép.' }); }
  return h`<div class="card"><h3>🏆 Records personnels</h3>${r.length ? r.map((x) => h`<div class="item"><div class="grow"><b>${x.label}</b><div class="tiny muted">${x.kind === 'perf' ? 'performance' : 'meilleure série'} · ${fmtDay(x.date)}</div></div><span>${x.text}</span></div>`) : h`<p class="muted small">Aucun record encore.</p>`}</div>
    ${names.size ? h`<div class="card"><h3>Évolution d’un exercice</h3><select data-change="progEx" aria-label="Exercice">${[...names].map(([k, n]) => h`<option value="${k}" ${k === key ? 'selected' : ''}>${n}</option>`)}</select>${lineChart(pts, pts[0]?.u || '')}</div>` : ''}`;
}
CHG.progEx = (el) => { S.progressEx = el.value; render(); };

/* ═════════ Timeline et journal ═════════ */
function vTimeline() {
  const t = timeline(ctx());
  return t.length ? h`<ol class="timeline">${t.slice(0, 120).map((e) => h`<li class="${e.kind}"><span class="ico sm">${e.icon}</span><div><b class="small">${e.text}</b><div class="tiny muted">${fmtDay(e.t)}</div></div></li>`)}</ol>` : empty('Ta timeline se remplira avec tes records, objectifs et étapes.');
}
function vJournal() {
  const j = journal(ctx());
  return h`<form data-submit="jnote" class="card"><textarea name="text" maxlength="1000" required rows="2" placeholder="📝 Une note, une sensation…" aria-label="Ajouter une note au journal"></textarea><button class="btn pri" type="submit">＋ Ajouter au journal</button></form>
    ${j.length ? j.map((e) => h`<div class="card journal ${e.kind}"><div class="row"><span class="ico sm">${e.icon}</span><div class="grow"><div class="row between"><b>${e.title}</b><span class="tiny muted">${fmtDateTime(e.t)}</span></div><div class="small">${e.text}</div>${e.note ? h`<div class="small muted">« ${e.note} »</div>` : ''}${e.more?.length ? h`<details class="how mini"><summary>Détails</summary><p class="tiny">${e.more.join(' · ')}</p></details>` : ''}</div>${e.kind === 'note' ? '' : ''}</div></div>`) : empty('Ton journal regroupera tes séances, mesures, ascensions et notes.')}`;
}
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
      <p class="small">${l.hypothesis}</p><p class="tiny muted">Du ${l.startDate} pendant ${l.weeks} semaine(s)${l.capId ? ' · capacité suivie : ' + (CAPACITIES[l.capId]?.label || l.capId) : ''}${l.metricId ? ' · mesure : ' + (c.metrics[l.metricId]?.label || l.metricId) : ''}</p>
      ${meter(r.progress * 100)}<p class="small">${r.sessions} séance(s) pendant la période${r.capSets != null ? ` · ${r.capSets} séries pondérées sur la capacité` : ''}.</p><p class="small">${r.text}</p><p class="tiny muted">${r.disclaimer}</p>${l.conclusion ? h`<p class="small"><b>Conclusion :</b> ${l.conclusion}</p>` : ''}
      <div class="row wrapf"><button class="btn sm" data-act="labEdit" data-id="${l.id}">✎ Mettre à jour</button><button class="btn danger sm" data-act="labDel" data-id="${l.id}">Supprimer</button></div></div>`; }) : ''}`;
}
function labForm(l) {
  const c = ctx(), today = new Date().toISOString().slice(0, 10);
  return h`<h2 style="margin:0">${l ? 'Expérience' : 'Nouvelle expérience'}</h2><form data-submit="labSave" class="stack"><input type="hidden" name="id" value="${l?.id || ''}">
    <label>Titre<input name="title" required maxlength="80" value="${l?.title || ''}" placeholder="Ex. 2 séances de gainage par semaine"></label>
    <label>Hypothèse de départ<textarea name="hypothesis" maxlength="500">${l?.hypothesis || ''}</textarea></label>
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
SUBMIT.labSave = (f) => { const d = Object.fromEntries(new FormData(f)); putItem('lab', d.id || 'lab-' + uid().slice(0, 12), { title: d.title, hypothesis: d.hypothesis, startDate: d.startDate, weeks: Number(d.weeks) || 4, capId: d.capId, metricId: d.metricId, before: { value: d.before === '' ? null : Number(d.before), date: 0 }, after: { value: d.after === '' ? null : Number(d.after), date: 0 }, status: d.status, conclusion: d.conclusion }); closeSheet(); buzzOk(); toast('Expérience enregistrée'); render(); };
ACT.labDel = async (el) => { if (await ask('Supprimer cette expérience ?', { danger: true, ok: 'Supprimer' })) { delItem('lab', el.dataset.id); render(); } };
