// views-progress.js — Progrès : comparaisons personnelles, résumés, régularité, charge, historique, records,
// timeline, journal, analyses descriptives et mode Lab. Toujours par rapport à soi-même, jamais aux autres.
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, howBox, meter, bars, lineChart, fmtDay, fmtDate, fmtDateTime, relDate, numberField, buzzOk, fmtDur } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, go, render, deleteHistory, updateHistory, putItem, delItem, item, itemsOf } from './state.js';
import { uid, exKey } from './shared.js';
import { CAPACITIES, MUSCLES, METRICS } from './model.js';
import { benchmarks, periodSummary, regularity, loadAnalysis, records, timeline, journal, diagnostics, atypicalSessions, undertrained, forgottenGoals, whyNoProgress, activeGoals, goalLabel, labReport, entryActivity, activityLabel, perfText, muscleVolume, achievements, capacityState, confWord } from './brain.js';
import { anatomySvg } from './anatomy.js';

const SUBS = [['summary', 'Résumé'], ['history', 'Historique'], ['records', 'Records'], ['timeline', 'Timeline'], ['journal', 'Journal'], ['analyses', 'Analyses'], ['lab', 'Lab']];
export function vProgress() {
  const sub = SUBS.some(([k]) => k === S.sub.progress) ? S.sub.progress : 'summary';
  const views = { summary: vSummary, history: vHistory, records: vRecords, timeline: vTimeline, journal: vJournal, analyses: vAnalyses, lab: vLab };
  return h`<h1>Progrès</h1><div class="scrollx">${seg('progSub', sub, SUBS)}</div>${views[sub]()}`;
}
ACT.progSub = (el) => go('progress', el.dataset.id);
const pct = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x} %`);

function vSummary() {
  const c = ctx(), days = S.benchDays || 30, b = benchmarks(c, days), per = S.sumKind || 'week', s = periodSummary(c, per), reg = regularity(c), load = loadAnalysis(c);
  if (!c.history.length) return empty('Aucune séance enregistrée. Lance une séance et termine-la : tes progrès apparaîtront ici.');
  return h`<div class="card"><div class="row between"><h3>Comparaison avec toi-même</h3></div><div class="chips">${[7, 30, 90].map((d) => chip(days === d, `${d} jours`, `data-act="benchDays" data-id="${d}"`))}</div>
      <table class="tbl"><thead><tr><th></th><th>${days} derniers jours</th><th>${days} jours précédents</th><th>Écart</th></tr></thead><tbody>
      <tr><td>Séances</td><td>${b.cur.sessions}</td><td>${b.prev.sessions}</td><td>${pct(b.deltas.sessions)}</td></tr>
      <tr><td>Minutes</td><td>${b.cur.minutes}</td><td>${b.prev.minutes}</td><td>${pct(b.deltas.minutes)}</td></tr>
      <tr><td>Séries</td><td>${b.cur.sets}</td><td>${b.prev.sets}</td><td>${pct(b.deltas.sets)}</td></tr>
      <tr><td>Ressenti moyen</td><td>${b.cur.rpe ?? '—'}</td><td>${b.prev.rpe ?? '—'}</td><td></td></tr>
      <tr><td>Mesures</td><td>${b.cur.perfs}</td><td>${b.prev.perfs}</td><td></td></tr></tbody></table>
      ${b.capDiff.length ? h`<b class="small">Volume par capacité</b>${b.capDiff.map((x) => h`<div class="row between small"><span>${x.label}</span><span>${x.prev} → <b>${x.cur}</b></span></div>`)}` : ''}
      ${b.trends.map((t) => h`<p class="small">${t.dir > 0 ? '📈' : t.dir < 0 ? '📉' : '➖'} ${t.text}</p>`)}<p class="tiny muted">${b.text}</p></div>
    <div class="card"><h3>Résumé</h3><div class="chips">${chip(per === 'week', 'Semaine', 'data-act="sumKind" data-id="week"')}${chip(per === 'month', 'Mois', 'data-act="sumKind" data-id="month"')}</div>
      <p class="small">${s.sessions} séance(s) · ${s.minutes} min${s.activities.length ? ' · ' + s.activities.map((a) => `${a.label} ×${a.n}`).join(', ') : ''}</p>
      ${s.progression.length ? h`<b class="small">Progression</b><ul class="small">${s.progression.map((p) => h`<li>${p}</li>`)}</ul>` : h`<p class="small muted">Pas de nouveau record sur la période.</p>`}
      ${s.goalsWorked.length ? h`<p class="small">🎯 Objectifs travaillés : ${s.goalsWorked.join(', ')}</p>` : ''}${s.undertrained.length ? h`<p class="small">🧩 Capacités peu travaillées : ${s.undertrained.join(', ')}</p>` : ''}<p class="small muted">${s.regularity.text}</p></div>
    <div class="card"><h3>Régularité</h3>${bars(reg.weeks, ['il y a 12 sem.', 'cette semaine'])}<p class="small">${reg.text}</p>
      <p class="small">Série en cours : ${reg.streakWeeks} semaine(s) avec au moins une séance.</p>
      ${reg.gaps.length ? h`<b class="small">Interruptions (7 jours ou plus)</b><ul class="small">${reg.gaps.map((g) => h`<li>${g.days} jours ${g.to ? `(du ${fmtDay(g.from)} au ${fmtDay(g.to)})` : `(depuis le ${fmtDay(g.from)})`}</li>`)}</ul>` : ''}</div>
    <div class="card"><h3>Charge récente</h3><div class="grid3">${load.weeks.slice(0, 3).map((w, i) => h`<div class="stat"><b>${w.load}</b><span>${i === 0 ? 'cette semaine' : i === 1 ? 'semaine -1' : 'semaine -2'}<br>${w.sessions} séance(s)</span></div>`)}</div>
      <p class="small">${load.text}</p>${load.signals.map((x) => h`<p class="small">• ${x}</p>`)}<p class="tiny muted">Charge = durée × ressenti (1 à 5). ${load.disclaimer}</p></div>
    <div class="card"><h3>Muscles travaillés</h3><div class="chips">${[7, 30].map((d) => chip((S.muscleDays || 7) === d, `${d} jours`, `data-act="muscleDays" data-id="${d}"`))}</div>${raw(anatomySvg({ heat: muscleVolume(c, S.muscleDays || 7) }))}</div>
    <div class="card"><h3>Jalons</h3>${achievements(c).length ? h`<div class="chips">${achievements(c).map((a) => h`<span class="chip static">${a.icon} ${a.label}</span>`)}</div>` : h`<p class="muted small">Tes premiers jalons arriveront vite.</p>`}</div>`;
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
    ${list.length ? list.slice(0, 80).map((x) => h`<button class="card pick hist" data-act="histOpen" data-id="${x.id}"><div class="row"><div class="grow"><b>${x.sessionName}</b> ${x._failed ? tag('non synchronisée', 'bad') : ''}${x.data?.aborted ? tag('interrompue', 'warn') : ''}<div class="muted small">${fmtDateTime(x.startedAt)} · ${Math.round((x.durationSeconds || 0) / 60)} min${x.data?.rpe ? ' · ressenti ' + x.data.rpe + '/5' : ''} · ${activityLabel(entryActivity(x, c), c)}</div></div><span class="muted">›</span></div></button>`) : empty('Aucune séance réalisée pour l’instant.')}`;
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
  return h`<form data-submit="jnote" class="card"><label>Ajouter une note au journal<textarea name="text" maxlength="1000" required placeholder="Observation, sensation, contexte…"></textarea></label><button class="btn pri" type="submit">Ajouter</button></form>
    ${j.length ? j.map((e) => h`<div class="card journal ${e.kind}"><div class="row"><span class="ico sm">${e.icon}</span><div class="grow"><b>${e.title}</b><div class="small">${e.text}</div>${e.note ? h`<div class="small muted">« ${e.note} »</div>` : ''}<div class="tiny muted">${fmtDateTime(e.t)}</div></div>${e.kind === 'note' ? '' : ''}</div></div>`) : empty('Ton journal regroupera tes séances, mesures, ascensions et notes.')}`;
}
SUBMIT.jnote = (f) => { const t = String(new FormData(f).get('text') || '').trim(); if (!t) return; putItem('jnote', 'jn-' + uid().slice(0, 14), { date: Date.now(), text: t }); f.reset(); buzzOk(); toast('Note ajoutée'); render(); };

/* ═════════ Analyses descriptives ═════════ */
function vAnalyses() {
  const c = ctx(), d = diagnostics(c), a = atypicalSessions(c), u = undertrained(c), f = forgottenGoals(c), g = activeGoals(c)[0];
  const w = g ? whyNoProgress(g, c) : null;
  return h`<div class="card"><h3>🔍 Diagnostics</h3>${d.items.length ? d.items.map((x) => h`<p class="small">${x.icon} ${x.text}</p>`) : h`<p class="muted small">Rien de particulier dans tes données récentes.</p>`}<p class="tiny muted">${d.disclaimer}</p></div>
    <div class="card"><h3>🧩 Capacités sous-entraînées</h3><p class="tiny muted">${u.text}</p>${u.items.map((x) => h`<p class="small">• ${x.text}</p>`)}</div>
    <div class="card"><h3>🎯 Objectifs délaissés</h3>${f.length ? f.map((x) => h`<div class="item"><div class="grow small">${x.days != null ? `« ${x.label} » : dernière séance liée il y a ${x.days} jours (${fmtDay(x.last)}).` : `« ${x.label} » : pas encore travaillé.`}</div><button class="btn sm" data-act="todayGoal" data-id="${x.goal.id}">Séance</button></div>`) : h`<p class="muted small">Tous tes objectifs actifs ont été travaillés récemment.</p>`}</div>
    <div class="card"><h3>📌 Séances atypiques</h3>${a.length ? a.map((x) => h`<p class="small">• ${x.text}</p>`) : h`<p class="muted small">Aucune séance inhabituelle repérée (il faut au moins 6 séances pour comparer).</p>`}<p class="tiny muted">Observation descriptive, sans jugement.</p></div>
    ${w ? h`<div class="card"><h3>Pourquoi je ne progresse pas ? — ${w.goal}</h3>${w.hypotheses.map((x) => h`<p class="small"><b>${x.title}</b> — ${x.text}</p>`)}${howBox({ facts: w.facts, missing: w.missing })}<p class="tiny muted">${w.note}</p></div>` : ''}`;
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
