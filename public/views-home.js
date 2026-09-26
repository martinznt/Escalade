// views-home.js — Accueil : tableau de bord personnalisable, « Que faire aujourd'hui ? », commandes en langage
// naturel, calendrier visuel (planifié / réalisé), premier lancement.
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, howBox, meter, bars, ymd, pad, fmtDate, fmtDay, relDate, MONTHS, JOURS, buzzOk } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, go, render, getSeance, saveSeance, deleteHistory, saveEvent, deleteEvent, putItem, item, itemsOf, newId, saveSettings } from './state.js';
import { uid, summarizeHistory } from './shared.js';
import { ACTIVITIES, ENV_TYPES, ENV_TEMPLATES, EQUIPMENT, CAPACITIES } from './model.js';
import { sessionMinutes } from './engine.js';
import { parseCommand } from './commands.js';
import { todayOptions, regularity, benchmarks, activeGoals, goalLabel, goalProgress, records, profileCapacities, strengthsWeaknesses, STATUS_WORD, testReminders, forgottenGoals, undertrained, habits, neverTried, loadAnalysis, periodSummary, achievements, entryActivity, activityLabel, blockers, whyNoProgress } from './brain.js';
import { adaptDuration, alternatives, replaceExercise, BODY_WORDS } from './generator.js';
import { addExerciseToSession, findExerciseInSession } from './engine.js';
import { openGenerator, blocksOf } from './views-library.js';
import { startPlayer } from './player.js';

export const DASH_BLOCKS = {
  today: 'Que faire aujourd’hui ?', command: 'Commande', next: 'Prochaines séances', progress: 'Progression', goals: 'Objectifs', records: 'Records',
  regularity: 'Régularité', capacities: 'Capacités', reco: 'Recommandations', load: 'Charge récente', summary: 'Résumé de la semaine', achievements: 'Jalons', calendar: 'Calendrier',
};
const DEFAULT_DASH = ['today', 'command', 'next', 'goals', 'progress', 'reco', 'regularity'];
export const dashBlocks = () => (item('config', 'dashboard')?.blocks?.length ? item('config', 'dashboard').blocks.filter((b) => DASH_BLOCKS[b]) : DEFAULT_DASH);

export function eventsOn(date) {
  const wd = (d) => new Date(d + 'T12:00:00').getDay();
  return S.events.filter((e) => e.date === date || (e.recurrence?.freq === 'weekly' && e.date <= date && wd(e.date) === wd(date) && (!e.recurrence.until || date <= e.recurrence.until)));
}
const doneOnDay = (date) => ctx().history.filter((x) => ymd(new Date(x.startedAt)) === date);

export function vHome() {
  const sub = S.sub.home === 'cal' ? 'cal' : 'dash';
  return h`<div class="row between"><h1>Bonjour ${S.user.username}</h1><button class="btn sm" data-act="dashEdit" aria-label="Personnaliser le tableau de bord">⚙︎ Blocs</button></div>
    ${seg('homeSub', sub, [['dash', 'Tableau de bord'], ['cal', 'Calendrier']])}${sub === 'cal' ? vCalendar() : vDash()}`;
}
ACT.homeSub = (el) => go('home', el.dataset.id);

/* ═════════ Premier lancement : aucune séance générique imposée ═════════ */
function vOnboarding() {
  const acts = ctx().activities;
  return h`<div class="card acc-b"><h3>Bienvenue 👋</h3><p class="small">Pour des analyses et des séances adaptées, indique d’abord ce que tu pratiques. Tu peux tout modifier ensuite dans ton Profil.</p>
    <b class="small">Mes activités</b><div class="chips">${Object.entries(ACTIVITIES).map(([id, a]) => chip(!!acts[id], `${a.emoji} ${a.label}`, `data-act="obAct" data-id="${id}"`))}</div>
    <p class="tiny muted">Basket, vélo, tennis… : ajoute-les comme activité personnalisée dans Profil › Activités.</p>
    <b class="small">Où t’entraînes-tu le plus souvent ?</b><div class="chips">${Object.entries(ENV_TYPES).filter(([k]) => k !== 'autre').map(([k, l]) => chip(ctx().envs.some((e) => e.type === k), l, `data-act="obEnv" data-id="${k}"`))}</div>
    <div class="row wrapf"><button class="btn pri" data-act="obDone">C’est parti</button><button class="btn" data-act="goProfile" data-id="perfs">Renseigner mes performances</button></div></div>`;
}
ACT.obAct = (el) => {
  const id = el.dataset.id, c = ctx(), a = c.activities[id];
  if (a) putItem('activity', a.itemId, { preset: id, label: ACTIVITIES[id].label, emoji: ACTIVITIES[id].emoji, archived: true });
  else { const existing = itemsOf('activity').find((x) => x.preset === id); putItem('activity', existing?.id || 'act-' + id, { preset: id, label: ACTIVITIES[id].label, emoji: ACTIVITIES[id].emoji, archived: false }); }
  render();
};
ACT.obEnv = (el) => {
  const t = el.dataset.id, ex = ctx().envs.find((e) => e.type === t);
  if (ex) return;
  putItem('env', 'env-' + t, { name: ENV_TYPES[t], type: t, equipment: ENV_TEMPLATES[t], isDefault: !ctx().envs.length });
  toast(`${ENV_TYPES[t]} ajouté avec un matériel type : vérifie-le dans Profil › Matériel.`); render();
};
ACT.obDone = () => { S.settings.onboarded = true; saveSettings(); render(); };
ACT.goProfile = (el) => go('profile', el.dataset.id);

/* ═════════ Tableau de bord ═════════ */
function vDash() {
  const blocks = dashBlocks();
  const loop = S.lastLoop && Date.now() - S.lastLoop.at < 15 * 60000 ? S.lastLoop : null;
  return h`${!S.settings.onboarded ? vOnboarding() : ''}
    ${loop ? h`<div class="card ok-b"><b>✓ Séance enregistrée — ce qui change dans ton profil</b>${loop.changes.length ? h`<ul class="small">${loop.changes.map((c) => h`<li>${c}</li>`)}</ul>` : h`<p class="small muted">Historique mis à jour.</p>`}<p class="tiny muted">Ces données alimentent tes analyses et tes prochaines séances générées.</p><button class="btn sm" data-act="loopClose">OK</button></div>` : ''}
    ${blocks.map((b) => BLOCK_VIEWS[b]?.() || '')}
    <div class="row wrapf"><button class="btn pri" data-act="genOpen">✨ Générer une séance</button><button class="btn" data-act="newSeanceHome">＋ Créer une séance</button><button class="btn" data-act="homeSub" data-id="cal">📅 Calendrier</button></div>`;
}
ACT.loopClose = () => { S.lastLoop = null; render(); };
ACT.genOpen = () => openGenerator({});
ACT.newSeanceHome = () => ACT.newSeance();
const card = (title, body, extra = '') => h`<section class="card"><div class="row between"><h3>${title}</h3>${extra}</div>${body}</section>`;
const BLOCK_VIEWS = {
  today() {
    const today = ymd(new Date()), evs = eventsOn(today).filter((e) => !doneOnDay(today).some((d) => d.sessionId === e.sessionId && e.sessionId));
    const t = todayOptions(ctx(), { todayEvents: evs });
    return card('☀️ Que faire aujourd’hui ?', h`<p class="tiny muted">${t.note}</p>${t.options.map((o) => h`<div class="item"><div class="grow"><b>${o.title}</b><div class="tiny muted">${o.reason}</div>
      <details class="how mini"><summary>Comment le sais-tu ?</summary><ul class="tiny">${(o.how || []).map((x) => h`<li>${x}</li>`)}</ul></details></div>
      ${o.kind === 'event' ? (o.sessionId && getSeance(o.sessionId) ? h`<button class="btn pri sm" data-act="play" data-id="${o.sessionId}" data-event="${o.eventId}">▶</button>` : tag('séance supprimée', 'warn')) : o.kind === 'rest' ? h`<button class="btn sm" data-act="todayDo" data-id="${o.id}">Léger</button>` : h`<button class="btn pri sm" data-act="todayDo" data-id="${o.id}">✨</button>`}</div>`)}`);
  },
  command() {
    return card('🗣️ Commande', h`<form data-submit="command" class="row"><input name="text" maxlength="200" class="grow" placeholder="« Fais-moi une séance de 30 min pour les jambes »" aria-label="Commande"><button class="btn pri" type="submit">OK</button></form>
      <p class="tiny muted">Exemples : « Remplace les tractions », « Ajoute 5 minutes de gainage », « Je n’ai que 12 minutes », « Montre mes records », « Que dois-je faire aujourd’hui ? », « Je n’ai pas de barre aujourd’hui ».</p>`);
  },
  next() {
    const days = [...Array(8)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return ymd(d); });
    const list = days.flatMap((d) => eventsOn(d).map((e) => ({ d, e }))).slice(0, 5);
    return card('📅 Prochaines séances', list.length ? list.map(({ d, e }) => { const s = e.sessionId && getSeance(e.sessionId); return h`<div class="item"><div class="ico">${s?.emoji || '📅'}</div><div class="grow"><b>${e.title || s?.name || 'Séance'}</b><div class="tiny muted">${relDate(new Date(d + 'T12:00:00').getTime())}${e.recurrence ? ' · chaque semaine' : ''}</div></div>${s ? h`<button class="btn pri sm" data-act="play" data-id="${s.id}" data-event="${e.id}">▶</button>` : ''}</div>`; }) : h`<p class="muted small">Rien de planifié cette semaine. <button class="btn sm" data-act="homeSub" data-id="cal">Planifier</button></p>`);
  },
  progress() {
    const b = benchmarks(ctx(), 7), d = (x) => (x == null ? '' : x > 0 ? ` (+${x} %)` : ` (${x} %)`);
    return card('📈 Progression — 7 jours', h`<div class="grid3"><div class="stat"><b>${b.cur.sessions}</b><span>séances${d(b.deltas.sessions)}</span></div><div class="stat"><b>${b.cur.minutes}</b><span>minutes${d(b.deltas.minutes)}</span></div><div class="stat"><b>${b.cur.sets}</b><span>séries${d(b.deltas.sets)}</span></div></div>
      ${b.trends.slice(0, 3).map((t) => h`<p class="small">${t.dir > 0 ? '📈' : t.dir < 0 ? '📉' : '➖'} ${t.text}</p>`)}<p class="tiny muted">${b.text}</p>`, h`<button class="btn sm" data-act="goProgress" data-id="summary">Détails</button>`);
  },
  goals() {
    const gs = activeGoals(ctx());
    return card('🎯 Objectifs', gs.length ? gs.slice(0, 5).map((g) => { const pr = goalProgress(g, ctx()); return h`<button class="goal item pick" data-act="goalOpen" data-id="${g.id}"><div class="grow"><div class="row between small"><b>${goalLabel(g)}</b><span>${pr.pct == null ? '—' : pr.pct + ' %'}</span></div>${meter(pr.pct || 0)}<div class="tiny muted">${pr.text}</div></div></button>`; }) : h`<p class="muted small">Aucun objectif actif.</p>`, h`<button class="btn sm" data-act="goProfile" data-id="goals">＋ Objectif</button>`);
  },
  records() {
    const r = records(ctx()).slice(0, 5);
    return card('🏆 Records', r.length ? r.map((x) => h`<div class="item"><div class="grow"><b>${x.label}</b><div class="tiny muted">${fmtDay(x.date)}</div></div><span>${x.text}</span></div>`) : h`<p class="muted small">Pas encore de record enregistré.</p>`);
  },
  regularity() {
    const r = regularity(ctx());
    return card('📆 Régularité', h`${bars(r.weeks, ['il y a 12 sem.', 'cette semaine'])}<p class="small">${r.text}</p>${r.gaps.length ? h`<p class="tiny muted">Dernière interruption : ${r.gaps.at(-1).days} jours.</p>` : ''}`);
  },
  capacities() {
    const st = profileCapacities(ctx()), sw = strengthsWeaknesses(st);
    return card('🧭 Capacités', h`${sw.strengths.length ? h`<p class="small"><b>Solides :</b> ${sw.strengths.map((s) => s.label).join(', ')}</p>` : ''}${sw.weaknesses.length ? h`<p class="small"><b>À renforcer :</b> ${sw.weaknesses.map((s) => s.label).join(', ')}</p>` : ''}
      <p class="tiny muted">${sw.text}</p>`, h`<button class="btn sm" data-act="goProfile" data-id="map">Carte</button>`);
  },
  reco() {
    const c = ctx(), items = [];
    for (const f of forgottenGoals(c).slice(0, 2)) items.push({ icon: '🎯', text: f.days != null ? `« ${f.label} » n’a pas été travaillé depuis ${f.days} jours (dernière fois : ${fmtDay(f.last)}).` : `« ${f.label} » n’a pas encore été travaillé.`, act: h`<button class="btn sm" data-act="todayGoal" data-id="${f.goal.id}">Séance</button>` });
    for (const t of testReminders(c).slice(0, 2)) items.push({ icon: '📏', text: t.text, act: h`<button class="btn sm" data-act="perfAdd" data-id="${t.metricId}">Saisir</button>` });
    for (const u of undertrained(c).items.slice(0, 1)) items.push({ icon: '🧩', text: u.text, act: '' });
    for (const hb of habits(c).filter((x) => x.proposal).slice(0, 2)) items.push({ icon: '🔁', text: hb.text, act: h`<button class="btn sm pri" data-act="habitYes" data-k="${hb.key}">Oui</button><button class="btn sm" data-act="habitNo" data-k="${hb.key}">Non</button>` });
    for (const n of neverTried(c).slice(0, 1)) items.push({ icon: '✨', text: `Tu n’as jamais essayé « ${n.lib.name} » : ${n.reason}`, act: h`<button class="btn sm" data-act="libInfo" data-id="${n.lib.id}">Voir</button>` });
    return card('💡 Recommandations', items.length ? items.map((x) => h`<div class="item"><div class="ico sm">${x.icon}</div><div class="grow small">${x.text}</div><div class="row tight">${x.act}</div></div>`) : h`<p class="muted small">Rien à signaler pour l’instant.</p>`);
  },
  load() {
    const l = loadAnalysis(ctx());
    return card('📊 Charge récente', h`<p class="small">${l.text}</p>${l.signals.map((s) => h`<p class="small">• ${s}</p>`)}<p class="tiny muted">${l.disclaimer}</p>`);
  },
  summary() {
    const s = periodSummary(ctx(), 'week');
    return card('🗓️ Résumé de la semaine', h`<p class="small">${s.sessions} séance(s) · ${s.minutes} min${s.activities.length ? ' · ' + s.activities.map((a) => `${a.label} ×${a.n}`).join(', ') : ''}</p>${s.progression.slice(0, 3).map((p) => h`<p class="small">📈 ${p}</p>`)}${s.goalsWorked.length ? h`<p class="small">🎯 Objectifs travaillés : ${s.goalsWorked.join(', ')}</p>` : ''}${s.undertrained.length ? h`<p class="small">🧩 Peu travaillé : ${s.undertrained.join(', ')}</p>` : ''}`, h`<button class="btn sm" data-act="goProgress" data-id="summary">Mois</button>`);
  },
  achievements() {
    const a = achievements(ctx());
    return card('🌟 Jalons', a.length ? h`<div class="chips">${a.map((x) => h`<span class="chip static">${x.icon} ${x.label}</span>`)}</div>` : h`<p class="muted small">Tes premiers jalons apparaîtront ici.</p>`);
  },
  calendar() { return card('📅 Calendrier', miniMonth(), h`<button class="btn sm" data-act="homeSub" data-id="cal">Ouvrir</button>`); },
};
ACT.goProgress = (el) => go('progress', el.dataset.id);
ACT.goalOpen = (el) => go('profile', 'goals', el.dataset.id);
ACT.todayGoal = (el) => openGenerator({ mode: 'goal', goalId: el.dataset.id, autoPlan: true });
ACT.todayDo = (el) => {
  const o = todayOptions(ctx(), { todayEvents: eventsOn(ymd(new Date())) }).options.find((x) => x.id === el.dataset.id);
  if (!o) return;
  openGenerator({ mode: o.mode || 'weaknesses', goalId: o.goalId || '', capId: o.capId || '', minutes: o.minutes || S.settings.defaultMinutes || 30, light: !!o.light, autoPlan: true });
};
ACT.habitYes = (el) => {
  const hb = habits(ctx()).find((x) => x.key === el.dataset.k); if (!hb) return;
  const p = hb.proposal;
  if (p?.type === 'pref') putItem('pref', 'h-' + p.key.replace(/[^\w-]/g, '_').slice(0, 60), { key: p.key, label: p.label, value: p.value, source: 'habit', reason: 'Habitude confirmée : exercice souvent remplacé.' });
  if (p?.type === 'config' && p.key === 'duration') { S.settings.defaultMinutes = p.value; saveSettings(); putItem('config', 'main', { ...(item('config', 'main') || {}), durations: [String(p.value)] }); }
  if (p?.type === 'env') { const env = ctx().envs.find((e) => e.name === p.name); if (env) putItem('config', 'main', { ...(item('config', 'main') || {}), envId: env.id }); }
  putItem('habit', 'hb-' + hb.key.replace(/[^\w:.-]/g, '_').slice(0, 70), { key: hb.key, decision: 'accepted' });
  toast('Préférence enregistrée'); render();
};
ACT.habitNo = (el) => { putItem('habit', 'hb-' + el.dataset.k.replace(/[^\w:.-]/g, '_').slice(0, 70), { key: el.dataset.k, decision: 'dismissed' }); render(); };
ACT.dashEdit = () => {
  const cur = dashBlocks();
  openSheet(h`<h2 style="margin:0">Blocs du tableau de bord</h2><p class="muted small">Active, désactive et ordonne les blocs.</p>
    ${cur.map((b, i) => h`<div class="item"><div class="grow">${DASH_BLOCKS[b]}</div><button class="btn sm ic" data-act="dashMove" data-id="${b}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn sm ic" data-act="dashMove" data-id="${b}" data-d="1" ${i === cur.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm ic danger" data-act="dashToggle" data-id="${b}" aria-label="Masquer">✕</button></div>`)}
    <b class="small">Ajouter</b><div class="chips">${Object.entries(DASH_BLOCKS).filter(([k]) => !cur.includes(k)).map(([k, l]) => chip(false, '＋ ' + l, `data-act="dashToggle" data-id="${k}"`))}</div>
    <div class="row wrapf"><button class="btn" data-act="dashReset">Par défaut</button><button class="btn pri" data-act="closeSheet">Terminé</button></div>`);
};
const saveDash = (blocks) => { putItem('config', 'dashboard', { ...(item('config', 'dashboard') || {}), blocks }); ACT.dashEdit(); render(); };
ACT.dashToggle = (el) => { const cur = dashBlocks(), id = el.dataset.id; saveDash(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); };
ACT.dashMove = (el) => { const cur = [...dashBlocks()], i = cur.indexOf(el.dataset.id), j = i + Number(el.dataset.d); if (j < 0 || j >= cur.length) return; [cur[i], cur[j]] = [cur[j], cur[i]]; saveDash(cur); };
ACT.dashReset = () => saveDash(DEFAULT_DASH);

/* ═════════ Commandes en langage naturel ═════════ */
SUBMIT.command = (f) => { const t = String(new FormData(f).get('text') || '').trim(); if (t) runCommand(parseCommand(t), t); };
function currentSession() {
  if (S.gen.result?.session && S.tab === 'library' && S.sub.library === 'generate') return { s: S.gen.result.session, save: (n) => { S.gen.result.session = n; S.gen.saved = false; } };
  const s = (S.sub.library === 'seance' && getSeance(S.param)) || (S.lastOpenSeance && getSeance(S.lastOpenSeance)) || (S.gen.result?.session ? null : null);
  if (s) return { s, save: (n) => saveSeance(n) };
  if (S.gen.result?.session) return { s: S.gen.result.session, save: (n) => { S.gen.result.session = n; S.gen.saved = false; } };
  return null;
}
export async function runCommand(c, raw) {
  if (c.type === 'unknown') { toast(`Je n’ai pas compris « ${raw} ». Rien n’a été fait. Essaie par exemple « Fais-moi une séance de 20 minutes ».`, 5000); return; }
  if (c.type === 'ambiguous') {
    openSheet(h`<h2 style="margin:0">Que voulais-tu dire ?</h2><p class="muted small">« ${raw} » peut se comprendre de plusieurs façons. Rien n’a été fait.</p>${c.options.map((o, i) => h`<button class="item pick" data-act="cmdPick" data-i="${i}"><div class="grow">${o.summary}</div></button>`)}<button class="btn" data-act="closeSheet">Annuler</button>`);
    S.cmdOptions = c.options.map(({ score, ...o }) => o); S.cmdRaw = raw; return;
  }
  if (c.confirm && !(await ask(`Confirmer : ${c.summary}`, { ok: 'Confirmer', danger: true }))) return;
  const cs = currentSession();
  switch (c.type) {
    case 'generate': {
      const pr = {}; for (const f of c.focuses || []) for (const [k, v] of Object.entries(BODY_WORDS[f] || {})) pr[k] = Math.max(pr[k] || 0, v);
      const act = c.activity || (Object.keys(pr).length && !Object.keys(pr).some((k) => ['technique_escalade', 'technique_pieds'].includes(k)) ? (Object.keys(ctx().activities).find((a) => ['conditioning', 'strength'].includes(a)) || Object.keys(ctx().activities)[0] || 'conditioning') : Object.keys(ctx().activities)[0] || 'conditioning');
      toast(`Compris : ${c.summary}`, 3500);
      openGenerator({ activityId: act, minutes: c.minutes || S.settings.defaultMinutes || 30, light: !!c.light, mode: 'weaknesses', goalId: '', priorities: pr, autoPlan: true });
      break;
    }
    case 'adaptDuration': {
      if (!cs) { toast('Ouvre ou génère d’abord une séance, puis redis-le.'); return; }
      const r = adaptDuration(cs.s, c.minutes, ctx()); cs.save(r.session); render();
      toast(`Séance reconstruite pour ${c.minutes} min (~${r.minutes} min) : ${r.changes.slice(0, 2).join(' ; ') || 'aucun changement'}.`, 5000); break;
    }
    case 'swapExercise': {
      const target = cs && findExerciseInSession(cs.s, c.query);
      if (!target) { toast(`Je ne trouve pas « ${c.query} » dans la séance ouverte. Rien n’a été fait.`); return; }
      const alts = alternatives(target, ctx(), { session: cs.s }).filter((a) => a.available);
      const byName = c.by ? alts.find((a) => a.lib.name.toLowerCase().includes(c.by)) : null;
      const pick = byName || alts[0];
      if (!pick) { toast(`Aucune alternative disponible pour « ${target.name} ».`); return; }
      const r = replaceExercise(cs.s, target.id, pick.lib.id, pick.reasons[0]); cs.save(r.session);
      putItem('swap', uid(), { from: target.name, to: pick.lib.name, date: Date.now(), where: 'seance' });
      render(); toast(`« ${target.name} » → « ${pick.lib.name} » (${pick.reasons[0].toLowerCase()}).`, 5000); break;
    }
    case 'removeExercise': {
      const target = cs && findExerciseInSession(cs.s, c.query);
      if (!target) { toast(`Je ne trouve pas « ${c.query} » dans la séance ouverte.`); return; }
      cs.save({ ...cs.s, exercises: cs.s.exercises.filter((e) => e.id !== target.id) }); render(); toast(`« ${target.name} » retiré.`); break;
    }
    case 'addExercise': {
      if (!cs) { toast('Ouvre ou génère d’abord une séance.'); return; }
      const s2 = addExerciseToSession(cs.s, c.query, c.minutes); const added = s2.exercises.at(-1); cs.save(s2); render();
      toast(`Ajouté : ${added.name} — ${Math.round(added.secMin / 60)} min${added.libId ? '' : ' (bloc libre : aucun exercice connu ne correspond)'}.`, 4500); break;
    }
    case 'showRecords': go('progress', 'records'); break;
    case 'showProgress': go('progress', 'summary'); break;
    case 'today': go('home', 'dash'); setTimeout(() => $('section.card')?.scrollIntoView({ behavior: 'smooth' }), 50); break;
    case 'blockers': { const g = activeGoals(ctx()).find((x) => !c.query || goalLabel(x).toLowerCase().includes(c.query.split(' ')[0])) || activeGoals(ctx())[0]; if (!g) { toast('Aucun objectif actif : crée-en un dans Profil › Objectifs.'); return; } go('profile', 'goals', g.id); break; }
    case 'whyNoProgress': { const g = activeGoals(ctx())[0]; if (g) { S.goalTab = 'why'; go('profile', 'goals', g.id); } else go('progress', 'analyses'); break; }
    case 'search': S.search.q = c.query; go('library', 'search'); break;
    case 'deleteLastHistory': { const last = ctx().history[0]; if (!last) { toast('Aucune séance dans l’historique.'); return; } deleteHistory(last.id); render(); toast(`« ${last.sessionName} » supprimée de l’historique.`); break; }
    case 'equipmentOff': case 'equipmentOn': {
      const conf = item('config', 'equipment') || {}, un = new Set(conf.unavailable || []);
      for (const e of c.equipment) c.type === 'equipmentOff' ? un.add(e) : un.delete(e);
      putItem('config', 'equipment', { ...conf, unavailable: [...un] });
      toast(`${c.type === 'equipmentOff' ? 'Indisponible' : 'Disponible'} : ${c.equipment.map((e) => EQUIPMENT[e] || e).join(', ')}. Les prochaines séances en tiendront compte.`, 4500);
      render(); break;
    }
    case 'plan': openPlanSheet(c.date || ymd(new Date()), cs?.s?.id); break;
    case 'start': if (cs) startPlayer(cs.s); else toast('Ouvre d’abord une séance.'); break;
    default: toast('Commande reconnue mais pas encore disponible ici.');
  }
}
ACT.cmdPick = (el) => { const o = S.cmdOptions?.[Number(el.dataset.i)]; closeSheet(); if (o) runCommand(o, S.cmdRaw); };

/* ═════════ Calendrier visuel ═════════ */
const ACT_COLORS = { climbing_boulder: '#c8914d', climbing_route: '#d7a86e', strength: '#b0674a', conditioning: '#8c9a6b', running: '#6f97a8', swimming: '#5c8fbf' };
function miniMonth() { return monthGrid(true); }
function monthGrid(mini = false) {
  if (!S.cal) { const d = new Date(); S.cal = { y: d.getFullYear(), m: d.getMonth() }; }
  const { y, m } = S.cal, first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = ymd(new Date()), c = ctx();
  const cells = []; for (let i = 0; i < lead; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m + 1)}-${pad(d)}`);
  return h`<div class="row between"><button class="btn sm" data-act="calMove" data-id="-1" aria-label="Mois précédent">‹</button><b>${MONTHS[m]} ${y}</b><button class="btn sm" data-act="calMove" data-id="1" aria-label="Mois suivant">›</button></div>
    <div class="cal">${JOURS.map((j) => h`<div class="h">${j}</div>`)}${cells.map((d) => {
      if (!d) return h`<div></div>`;
      const done = c.history.filter((x) => ymd(new Date(x.startedAt)) === d), planned = eventsOn(d);
      return h`<button class="d ${d === today ? 'today' : ''} ${done.length ? 'has-done' : ''}" data-act="calDay" data-id="${d}" aria-label="${d}${done.length ? ', ' + done.length + ' séance(s) réalisée(s)' : ''}${planned.length ? ', ' + planned.length + ' prévue(s)' : ''}">${Number(d.slice(8))}<span class="dots">${done.slice(0, 3).map((x) => raw(`<i class="done" style="background:${ACT_COLORS[entryActivity(x, c)] || 'var(--ok)'}"></i>`))}${planned.slice(0, 2).map(() => raw('<i class="plan"></i>'))}</span></button>`;
    })}</div>`;
}
function vCalendar() {
  const c = ctx(), { y, m } = S.cal || { y: new Date().getFullYear(), m: new Date().getMonth() };
  const inMonth = c.history.filter((x) => { const d = new Date(x.startedAt); return d.getFullYear() === y && d.getMonth() === m; });
  const acts = {}; for (const x of inMonth) { const a = entryActivity(x, c); acts[a] = (acts[a] || 0) + 1; }
  const reg = regularity(c);
  return h`<div class="card">${monthGrid()}<div class="legend small"><span><i class="lg done"></i> réalisée (couleur = activité)</span><span><i class="lg plan"></i> prévue</span></div></div>
    <div class="card"><h3>Ce mois-ci</h3><p class="small">${inMonth.length} séance(s) réalisée(s)${Object.keys(acts).length ? ' · ' + Object.entries(acts).map(([a, n]) => `${activityLabel(a, c)} ×${n}`).join(', ') : ''}.</p><p class="small muted">${reg.text}</p>
      ${activeGoals(c).length ? h`<p class="tiny muted">Objectifs suivis : ${activeGoals(c).map(goalLabel).join(', ')}.</p>` : ''}</div>`;
}
ACT.calMove = (el) => { const n = S.cal.m + Number(el.dataset.id); S.cal = { y: S.cal.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; render(); };
ACT.calDay = (el) => openPlanSheet(el.dataset.id);
export function openPlanSheet(date, seanceId) {
  S.selDay = date;
  const evs = eventsOn(date), done = doneOnDay(date), future = date > ymd(new Date());
  const list = S.seances.items.filter((s) => !s.archived);
  openSheet(h`<h2 style="margin:0">${new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    ${done.length ? h`<b class="small ok-t">Réalisé</b>${done.map((x) => h`<div class="item"><div class="ico sm">✅</div><div class="grow"><b>${x.sessionName}</b><div class="tiny muted">${Math.round(x.durationSeconds / 60)} min${x.data?.rpe ? ' · ressenti ' + x.data.rpe + '/5' : ''}${x.data?.aborted ? ' · interrompue' : ''}</div></div></div>`)}` : ''}
    ${evs.length ? h`<b class="small">Prévu</b>${evs.map((e) => { const s = e.sessionId && getSeance(e.sessionId); return h`<div class="item"><div class="grow"><b>${e.title || s?.name || 'Séance'}</b><div class="tiny muted">${e.recurrence ? 'se répète chaque semaine' : e.completed ? 'marquée faite' : future ? 'à venir' : ''}</div></div>${s && !future ? h`<button class="btn pri sm" data-act="play" data-id="${s.id}" data-event="${e.id}">▶</button>` : ''}<button class="btn danger sm ic" data-act="delEvent" data-id="${e.id}" aria-label="Supprimer">✕</button></div>`; })}` : ''}
    ${!done.length && !evs.length ? h`<p class="muted small">Rien ce jour-là.</p>` : ''}
    ${list.length ? h`<form data-submit="addEvent" class="card flat"><h3>Planifier une séance</h3>
      <label>Séance<select name="sid">${list.map((s) => h`<option value="${s.id}" ${s.id === seanceId ? 'selected' : ''}>${s.emoji} ${s.name}</option>`)}</select></label>
      <label class="chk"><input type="checkbox" name="weekly"> Répéter chaque semaine</label>
      <button class="btn pri" type="submit">Planifier le ${date.split('-').reverse().join('/')}</button></form>` : h`<p class="muted small">Crée d’abord une séance pour la planifier.</p>`}
    <button class="btn" data-act="closeSheet">Fermer</button>`);
}
ACT.planSeance = (el) => openPlanSheet(ymd(new Date()), el.dataset.id);
ACT.delEvent = async (el) => { const e = S.events.find((x) => x.id === el.dataset.id); if (!e) return; if (!(await ask(e.recurrence ? 'Supprimer toute la série hebdomadaire ?' : 'Supprimer cet événement ?', { ok: 'Supprimer', danger: true }))) return; deleteEvent(e.id); openPlanSheet(S.selDay); render(); };
SUBMIT.addEvent = (form) => {
  const f = Object.fromEntries(new FormData(form)), s = getSeance(f.sid); if (!s) return;
  saveEvent({ id: uid(), date: S.selDay, title: s.name, sessionId: s.id, completed: false, recurrence: f.weekly ? { freq: 'weekly', until: null } : null });
  buzzOk(); toast('Séance planifiée'); openPlanSheet(S.selDay); render();
};
export { blocksOf };
