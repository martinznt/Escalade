// views-program.js — programme sur plusieurs semaines (création en 4 questions, suivi, réajustement),
// « Comment tu te sens aujourd'hui ? » avant une séance générée, et alerte douce quand les doigts ont beaucoup travaillé.
import { h, openSheet, closeSheet, toast, ask, fmtDay, buzzOk } from './ui.js';
import { S, ACT, ctx, render, putItem, item, itemsOf, go } from './state.js';
import { uid } from './shared.js';
import { planSession, generateFromPlan } from './generator.js';
import { startPlayer } from './player.js';
import { activeGoals, goalLabel } from './brain.js';
import { buildProgram, programStatus, reschedule, fingerLoad, boostSession, PROGRAM_GOALS, DAY_NAMES, defaultDays, ymd } from './program.js';

export const activeProgram = () => itemsOf('program').filter((p) => p.status === 'active').sort((a, b) => (b._u || 0) - (a._u || 0))[0] || null;
const PHASE = { build: '', deload: 'semaine légère', test: 'semaine bilan' };

/* ───────── Carte d'accueil ───────── */
export function programCard() {
  const p = activeProgram(); if (!p) return '';
  const st = programStatus(p, S.history), n = st.next;
  if (st.finished) return h`<section class="card prog"><div class="row"><div class="flame">🏁</div><div class="grow"><b>${p.name}</b><div class="small">Programme terminé : ${st.done} séances sur ${st.total}. Bravo.</div></div></div>
    <div class="row wrapf"><button class="btn pri" data-act="progNew">Nouveau programme</button><button class="btn ghost" data-act="progClose" data-id="${p.id}">Archiver</button></div></section>`;
  return h`<section class="card prog"><div class="row between"><b>📆 ${p.name}</b><button class="btn sm ghost" data-act="progOpen" data-id="${p.id}">Voir</button></div>
    <div class="meter"><i style="width:${st.pct}%"></i></div>
    <div class="tiny muted">Semaine ${st.week} / ${p.weeks} · ${st.done} séance${st.done > 1 ? 's' : ''} sur ${st.total}</div>
    ${st.missed.length ? h`<div class="row warnrow"><span class="grow small">${st.missed.length} séance${st.missed.length > 1 ? 's' : ''} manquée${st.missed.length > 1 ? 's' : ''}. On décale la suite ?</span><button class="btn sm" data-act="progShift" data-id="${p.id}">Décaler</button></div>` : ''}
    ${n ? h`<div class="row nextrow"><div class="grow"><b>${n.status === 'today' ? 'Aujourd’hui' : fmtDay(new Date(n.date + 'T12:00').getTime())}</b> · ${n.minutes} min${PHASE[n.phase] ? ` · ${PHASE[n.phase]}` : ''}</div>${n.status === 'today' ? h`<button class="btn pri" data-act="progPlay" data-id="${p.id}" data-i="${n.i}">▶ C’est parti</button>` : h`<button class="btn sm" data-act="progPlay" data-id="${p.id}" data-i="${n.i}">Faire maintenant</button>`}</div>` : ''}</section>`;
}

/* ───────── Alerte doigts ───────── */
export function fingerCard() {
  const f = fingerLoad(S.history); if (!f.alert || S.fingerHide) return '';
  return h`<section class="card warn-b"><div class="row"><span style="font-size:1.6rem">✋</span><div class="grow"><b>Tes doigts ont beaucoup travaillé</b>
    <div class="small">${f.cur} séries pour les doigts ces 7 jours${f.avg ? `, contre ${f.avg} d’habitude` : ''}. Une séance plus douce aujourd’hui ?</div></div></div>
    <div class="row wrapf"><button class="btn sm pri" data-act="fingerEasy">Séance douce</button><button class="btn sm ghost" data-act="fingerHide">Ça va, merci</button></div>
    <p class="tiny muted">Un simple repère de volume, pas un avis médical. Une douleur qui dure mérite l’avis d’un professionnel.</p></section>`;
}
ACT.fingerHide = () => { S.fingerHide = true; render(); };
ACT.fingerEasy = () => { S.fingerHide = true; S.gen.light = true; ACT.genOpen?.(); };

/* ───────── Création ───────── */
function wizard() {
  const w = S.pw, goals = activeGoals(ctx());
  const plan = buildProgram({ goal: w.goal, weeks: w.weeks, days: w.days, minutes: w.minutes, start: w.start });
  const end = plan.sessions.at(-1)?.date, deloads = [...new Set(plan.sessions.filter((s) => s.phase === 'deload').map((s) => s.week))];
  return h`<div class="pwiz"><h2>📆 Nouveau programme</h2>
    <label>1 · Pour quoi ?</label><div class="chips">${Object.entries(PROGRAM_GOALS).filter(([k]) => k !== 'goal' || goals.length).map(([k, g]) => h`<button type="button" class="chip ${w.goal === k ? 'on' : ''}" data-act="pwSet" data-k="goal" data-v="${k}">${g.emoji} ${g.label}</button>`)}</div>
    ${w.goal === 'goal' ? h`<div class="chips">${goals.map((g) => h`<button type="button" class="chip ${w.goalId === g.id ? 'on' : ''}" data-act="pwSet" data-k="goalId" data-v="${g.id}">${goalLabel(g)}</button>`)}</div>` : ''}
    <label>2 · Pendant combien de temps ?</label><div class="chips">${[4, 6, 8, 12].map((n) => h`<button type="button" class="chip ${w.weeks === n ? 'on' : ''}" data-act="pwSet" data-k="weeks" data-v="${n}">${n} semaines</button>`)}</div>
    <label>3 · Quels jours ?</label><div class="chips days">${DAY_NAMES.map((d, i) => h`<button type="button" class="chip ${w.days.includes(i) ? 'on' : ''}" data-act="pwDay" data-v="${i}">${d}</button>`)}</div>
    <label>4 · Combien de temps par séance ?</label><div class="chips">${[20, 30, 45, 60, 90].map((n) => h`<button type="button" class="chip ${w.minutes === n ? 'on' : ''}" data-act="pwSet" data-k="minutes" data-v="${n}">${n} min</button>`)}</div>
    <div class="card flat pwsum"><b>${plan.sessions.length} séances</b>${end ? h` · jusqu’au ${fmtDay(new Date(end + 'T12:00').getTime())}` : ''}
      ${deloads.length ? h`<div class="small muted">Semaine${deloads.length > 1 ? 's' : ''} ${deloads.join(' et ')} plus légère${deloads.length > 1 ? 's' : ''} pour récupérer. ${w.weeks >= 4 ? 'Dernière semaine : bilan.' : ''}</div>` : ''}
      <div class="small muted">Chaque séance est préparée le jour même, d’après tes dernières séances.</div></div>
    <button class="btn pri big" data-act="pwSave" ${w.goal === 'goal' && !w.goalId ? 'disabled' : ''}>Créer le programme</button></div>`;
}
ACT.progNew = () => {
  const cfg = item('config', 'main') || {}, per = Math.max(1, Math.min(6, Number(cfg.perWeek) || 3));
  const goal = { climb: 'climb', force: 'force', endurance: 'endurance', mobilite: 'mobilite', forme: 'forme', poids: 'poids', sante: 'forme' }[cfg.goal] || 'forme';
  S.pw = { goal, goalId: '', weeks: 6, days: defaultDays(per), minutes: Number(cfg.durations?.[0]) || S.settings.defaultMinutes || 45, start: ymd(Date.now()) };
  if (![20, 30, 45, 60, 90].includes(S.pw.minutes)) S.pw.minutes = 45;
  openSheet(wizard(), { wide: true });
};
ACT.pwSet = (el) => { const k = el.dataset.k, v = el.dataset.v; S.pw[k] = ['weeks', 'minutes'].includes(k) ? Number(v) : v; openSheet(wizard(), { wide: true }); };
ACT.pwDay = (el) => { const d = Number(el.dataset.v), s = new Set(S.pw.days); if (s.has(d)) { if (s.size > 1) s.delete(d); } else s.add(d); S.pw.days = [...s].sort(); openSheet(wizard(), { wide: true }); };
ACT.pwSave = async () => {
  const w = S.pw, c = ctx(), old = activeProgram();
  if (old && !(await ask('Remplacer ton programme en cours ?', { ok: 'Remplacer', detail: 'L’ancien est archivé, tes séances faites restent dans ton historique.' }))) return;
  if (old) putItem('program', old.id, { ...old, status: 'stopped' });
  const g = PROGRAM_GOALS[w.goal], activityId = w.goal === 'goal' ? (c.goals.find((x) => x.id === w.goalId)?.activityId || Object.keys(c.activities)[0] || 'conditioning') : c.activities[g.activityId] ? g.activityId : (Object.keys(c.activities).find((a) => a.startsWith(g.activityId.split('_')[0])) || Object.keys(c.activities)[0] || g.activityId);
  const prog = buildProgram({ ...w, activityId, name: w.goal === 'goal' ? `${goalLabel(c.goals.find((x) => x.id === w.goalId))} · ${w.weeks} semaines` : '' });
  const id = 'pg-' + uid().slice(0, 14);
  putItem('program', id, prog); closeSheet(); buzzOk(); go('home', 'dash'); render();
  toast(`Programme créé : ${prog.sessions.length} séances. La première est prévue ${prog.sessions[0]?.date === ymd(Date.now()) ? 'aujourd’hui' : 'bientôt'}.`, 4500);
};

/* ───────── Suivi ───────── */
ACT.progOpen = (el) => {
  const p = item('program', el.dataset.id); if (!p) return;
  const st = programStatus(p, S.history), weeks = [...new Set(st.list.map((s) => s.week))];
  const icon = { done: '✓', missed: '✗', today: '●', next: '○' };
  openSheet(h`<div class="pview"><h2>${p.name}</h2><div class="meter"><i style="width:${st.pct}%"></i></div><p class="small muted">${st.done} / ${st.total} séances · ${p.minutes} min · ${p.perWeek} par semaine</p>
    ${weeks.map((wk) => { const ss = st.list.filter((s) => s.week === wk), ph = ss[0]?.phase; return h`<div class="pweek"><span class="small"><b>S${wk}</b>${PHASE[ph] ? h` <span class="tiny muted">${PHASE[ph]}</span>` : ''}</span><div class="pdots">${ss.map((s) => h`<span class="pd ${s.status}" title="${s.date}">${icon[s.status]}</span>`)}</div></div>`; })}
    <div class="row wrapf">${st.missed.length ? h`<button class="btn" data-act="progShift" data-id="${p.id}">Décaler les séances manquées</button>` : ''}<button class="btn ghost danger" data-act="progClose" data-id="${p.id}">Arrêter le programme</button><span class="grow"></span><button class="btn" data-act="closeSheet">Fermer</button></div></div>`, { wide: true });
};
ACT.progShift = (el) => { const p = item('program', el.dataset.id); if (!p) return; putItem('program', p.id, reschedule(p, S.history)); closeSheet(); render(); toast('C’est décalé : le programme reprend à partir d’aujourd’hui.'); };
ACT.progClose = async (el) => { const p = item('program', el.dataset.id); if (p && (await ask('Arrêter ce programme ?', { ok: 'Arrêter', detail: 'Tes séances faites restent dans ton historique.' }))) { putItem('program', p.id, { ...p, status: 'stopped' }); closeSheet(); render(); } };

/* ───────── Séance du programme, avec la forme du jour ───────── */
ACT.progPlay = (el) => {
  const p = item('program', el.dataset.id), s = p?.sessions?.find((x) => x.i === Number(el.dataset.i)); if (!s) return;
  S.progRun = { id: p.id, i: s.i };
  openSheet(h`<div class="forme"><h2>Comment tu te sens aujourd’hui ?</h2><div class="formes">
    <button class="forme-b" data-act="progGo" data-f="tired"><span>😴</span><b>Fatigué</b><small>Séance plus douce</small></button>
    <button class="forme-b" data-act="progGo" data-f="ok"><span>🙂</span><b>Normal</b><small>Comme prévu</small></button>
    <button class="forme-b" data-act="progGo" data-f="fresh"><span>💪</span><b>En forme</b><small>Une série de plus</small></button></div></div>`);
};
ACT.progGo = (el) => {
  const r = S.progRun, p = item('program', r?.id), s = p?.sessions?.find((x) => x.i === r.i); if (!s) return closeSheet();
  const f = el.dataset.f, c = ctx(), g = PROGRAM_GOALS[p.goal] || PROGRAM_GOALS.forme;
  const plan = planSession({ activityId: p.activityId, mode: p.goal === 'goal' ? 'goal' : g.mode, goalId: p.goalId, minutes: f === 'tired' ? Math.max(10, Math.round(s.minutes * 0.8)) : s.minutes, light: s.light || f === 'tired', intentions: g.intent ? [{ id: g.intent, p: 2 }] : [], seed: Math.floor(Math.random() * 1e9) }, c);
  let session = generateFromPlan(plan, c).session;
  const extra = (f === 'fresh' ? 1 : 0) + (s.boost >= 2 && f !== 'tired' ? 1 : 0);
  if (extra) session = boostSession(session, extra);
  session = { ...session, name: `${p.name.split(' · ')[0]} · S${s.week}` };
  closeSheet(); startPlayer(session, { fromGenerator: true, program: { id: p.id, i: s.i } });
};
