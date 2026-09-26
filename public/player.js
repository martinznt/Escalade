// player.js — mode séance (téléphone) : exercice courant, séries, chronos, repos, pause / reprise, passage,
// abandon, fin, puis questionnaire adaptatif très court et enregistrement.
//
// Comptabilité du temps (tout est calculé à partir d'horodatages, donc juste même en arrière-plan) :
//  - durée réelle  = temps écoulé depuis le début − temps en pause ;
//  - temps actif   = durée réelle − temps de repos effectivement passé ;
//  - temps de pause = somme des pauses (jamais compté comme temps actif) ;
//  - une série chronométrée mise en pause ne compte pas le temps de pause dans sa durée.
import { h, raw, $, toast, ask, fmtDur, mmss, rng, buzzOk, tag } from './ui.js';
import { S, ACT, CHG, INPUT, render, getSeance, saveSeance, addHistory, saveEvent, putItem, ctx, go } from './state.js';
import { normalizeSession, uid, exKey, parseKg, norm } from './shared.js';
import { progressHint, applyPerformedBase, exMinutes, sessionMinutes } from './engine.js';
import { MUSCLES, CAPACITIES } from './model.js';
import { byId } from './library.js';
import { exCaps, exMuscles, entryActivity } from './brain.js';

let audio = null, wakeLock = null, timer = null;
function beep(f = 880, ms = 150) {
  if (!S.settings.sound) return;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; g.gain.value = 0.12; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + ms / 1000); } catch { /* pas d'audio */ }
}
const buzz = (p) => { if (S.settings.vibration && navigator.vibrate) try { navigator.vibrate(p); } catch { /* rien */ } };
function speak(t) { if (!S.settings.voice || !window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; speechSynthesis.speak(u); } catch { /* rien */ } }
async function wake() { if (!(S.settings.keepAwake || S.settings.handsFree) || !navigator.wakeLock) return; try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* refusé */ } }
function unwake() { try { wakeLock?.release(); } catch { /* rien */ } wakeLock = null; }
const cur = () => S.player.s.exercises[S.player.i];

/* ───────── Horloge ───────── */
export const clock = {
  /** Durée réelle (ms) hors pauses, à l'instant t. */
  real(p, t = Date.now()) { return Math.max(0, t - p.startedAt - p.pausedMs - (p.paused ? t - p.pauseStart : 0)); },
  pause(p, t = Date.now()) { if (p.paused) return; p.paused = true; p.pauseStart = t; if (p.phase === 'work' || p.phase === 'rest') p.remaining = Math.max(0, p.end - t); },
  resume(p, t = Date.now()) {
    if (!p.paused) return;
    const d = Math.max(0, t - p.pauseStart);
    p.pausedMs += d; p.paused = false; p.pauseStart = 0;
    if (p.phase === 'work') p.workPausedMs += d;
    if (p.phase === 'work' || p.phase === 'rest') p.end = t + Math.max(0, p.remaining || 0);
  },
};

function initInputs(keepLoad) {
  const p = S.player, ex = cur(), prev = p.log[p.i].sets.at(-1), hint = progressHint(ex, S.history);
  p.reps = ex.repsMax; p.secs = ex.secMax;
  p.load = keepLoad && prev ? prev.load : hint?.load || parseKg(ex.load) || 0;
  p.hint = hint;
}
export function startPlayer(session, { eventId = null, fromGenerator = false } = {}) {
  const s = normalizeSession(session);
  if (!s.exercises.length) { toast('Cette séance est vide : ajoute au moins un exercice.'); return; }
  S.player = {
    s, eventId, fromGenerator, i: 0, set: 0, side: 0, phase: 'ready', end: 0, total: 0, startedAt: Date.now(), paused: false, pauseStart: 0, pausedMs: 0,
    workStart: 0, workPausedMs: 0, restStart: 0, restMs: 0, remaining: 0, lastBeep: 0, swaps: [...(fromGenerator ? S.gen.swaps || [] : [])],
    log: s.exercises.map((e) => ({ name: e.name, libId: e.libId, group: e.group, intensity: e.intensity, risk: e.risk, muscles: e.muscles, caps: e.caps, prim: e.prim, sec: e.sec, isNew: e.isNew, sets: [] })),
    quiz: { felt: [], hardest: '', easiest: '', difficulty: 0, comment: '', likes: {}, answers: {} }, useBase: !!S.settings.autoBase, prs: [],
  };
  initInputs(false);
  $('#player').classList.add('open'); document.body.classList.add('noscroll');
  wake(); beep(1, 1); draw(); clearInterval(timer); timer = setInterval(tick, 250); speak(s.exercises[0].name);
}
export function tick() {
  const p = S.player; if (!p || p.paused || !(p.phase === 'rest' || p.phase === 'work')) return;
  const now = Date.now(), rem = Math.max(0, Math.ceil((p.end - now) / 1000));
  const t = $('#ptimer'), b = $('#pbar2'), c = $('#pclock');
  if (t) t.textContent = mmss(rem);
  if (b) b.style.width = `${Math.max(0, Math.min(100, 100 - ((p.end - now) / Math.max(1, p.total)) * 100))}%`;
  if (c) c.textContent = mmss(Math.floor(clock.real(p) / 1000));
  if (rem <= 3 && rem > 0 && p.lastBeep !== rem) { p.lastBeep = rem; beep(660, 90); }
  if (rem <= 0) onTimerEnd();
}
function onTimerEnd() {
  const p = S.player; beep(1040, 350); buzz([300, 100, 300]); p.lastBeep = 0;
  if (p.phase === 'rest') { endRest(p.end); speak('Série suivante'); draw(); }
  else if (p.phase === 'work') completeSet(cur().mode === 'time' ? p.secs : 0);
}
function endRest(at = Date.now()) {
  const p = S.player;
  p.restMs += Math.max(0, Math.min(at, Date.now()) - p.restStart - (p.restPaused || 0));
  p.phase = 'ready'; p.restPaused = 0; initInputs(true);
}
function startRest(sec) {
  const p = S.player, safe = Math.max(0, Number(sec) || 0), now = Date.now();
  if (safe <= 0) { p.phase = 'ready'; initInputs(true); draw(); return; }
  p.phase = 'rest'; p.restStart = now; p.restPaused = 0; p.end = now + safe * 1000; p.total = safe * 1000; p.remaining = safe * 1000; p.lastBeep = 0; draw();
}
function completeSet(secondsDone) {
  const p = S.player, ex = cur();
  if (ex.perSide && p.side === 0) { p.side = 1; p.phase = 'ready'; buzz(80); toast('Change de côté'); draw(); return; }
  p.log[p.i].sets.push({ reps: ex.mode === 'reps' ? p.reps : 0, seconds: ex.mode === 'time' ? secondsDone : 0, load: p.load || 0, done: true });
  p.side = 0; buzzOk();
  if (p.set + 1 < ex.sets) { p.set++; startRest(ex.rest); }
  else nextExercise();
}
function nextExercise() {
  const p = S.player; p.i++; p.set = 0; p.side = 0; p.phase = 'ready';
  if (p.i >= p.s.exercises.length) return finish(false);
  initInputs(false); speak(cur().name); draw(true);
}
function finish(aborted) {
  const p = S.player;
  if (p.paused) clock.resume(p);
  if (p.phase === 'rest') endRest();
  p.phase = 'done'; p.aborted = aborted || p.log.some((l, i) => !l.sets.length && i >= p.i);
  p.finishedAt = Date.now();
  p.durationSeconds = Math.round(clock.real(p, p.finishedAt) / 1000);
  p.pausedSeconds = Math.round(p.pausedMs / 1000);
  p.activeSeconds = Math.max(0, p.durationSeconds - Math.round(p.restMs / 1000));
  clearInterval(timer); unwake(); voiceStop();
  const prevBest = new Map();
  for (const hh of S.history) for (const e of hh.data?.exercises || []) for (const s of e.sets || []) { const k = exKey(e.name), c = prevBest.get(k) || { load: 0, reps: 0, seconds: 0 }; prevBest.set(k, { load: Math.max(c.load, s.load || 0), reps: Math.max(c.reps, s.reps || 0), seconds: Math.max(c.seconds, s.seconds || 0) }); }
  p.prs = [];
  for (const l of p.log.filter((x) => x.sets.length)) {
    const prev = prevBest.get(exKey(l.name)); if (!prev) continue;
    const b = { load: Math.max(0, ...l.sets.map((s) => s.load || 0)), reps: Math.max(0, ...l.sets.map((s) => s.reps || 0)), seconds: Math.max(0, ...l.sets.map((s) => s.seconds || 0)) };
    if (b.load > prev.load && b.load > 0) p.prs.push(`${l.name} : ${b.load} kg (avant ${prev.load} kg)`);
    else if (!b.load && b.reps > prev.reps && prev.reps > 0) p.prs.push(`${l.name} : ${b.reps} rép. (avant ${prev.reps})`);
    else if (b.seconds > prev.seconds && prev.seconds > 0) p.prs.push(`${l.name} : ${b.seconds} s (avant ${prev.seconds} s)`);
  }
  draw();
}
function closePlayer() { clearInterval(timer); unwake(); voiceStop(); S.player = null; $('#player').classList.remove('open'); $('#player').innerHTML = ''; document.body.classList.remove('noscroll'); render(); }

/* ───────── Affichage ───────── */
function draw(anim = false) {
  const p = S.player; if (!p) return; const root = $('#player');
  if (p.phase === 'done') { root.innerHTML = vQuiz(p).s; return; }
  const n = p.s.exercises.length, pct = Math.round((p.i / n) * 100);
  root.innerHTML = h`<div class="pl ${anim ? 'slide' : ''}"><div class="row between"><button class="btn sm" data-act="pQuit">✕ Terminer</button><span class="muted small">Exercice ${p.i + 1} / ${n} · <span id="pclock">${mmss(Math.floor(clock.real(p) / 1000))}</span></span><button class="btn sm" data-act="pSkip">Passer ⏭</button></div>
    <div class="bar"><i style="width:${pct}%"></i></div>${p.paused ? h`<div class="card flat center warn-b">⏸ En pause — le temps de pause n’est pas compté</div>` : ''}${p.phase === 'rest' ? vRest(p) : vSet(p)}
    <div class="row wrapf center-row"><button class="btn" data-act="pPause">${p.paused ? '▶ Reprendre' : '⏸ Pause'}</button></div></div>`.s;
  tick();
}
function stepper(k, value, unit, label) { return h`<div class="center"><div class="muted small">${label}</div><div class="stepper"><button data-act="pAdj" data-k="${k}" data-d="-1" aria-label="Moins">−</button><b>${value}<span class="small muted"> ${unit}</span></b><button data-act="pAdj" data-k="${k}" data-d="1" aria-label="Plus">+</button></div></div>`; }
function vSet(p) {
  const ex = cur(), t = ex.mode === 'time', working = p.phase === 'work';
  const usesLoad = p.load > 0 || /kg|lest/i.test(ex.load) || p.hint?.load > 0;
  const next = p.s.exercises[p.i + 1];
  return h`<div class="row"><div class="ico acc big">${ex.emoji}</div><div class="grow"><h1 style="margin:0">${ex.name}</h1><div class="muted">Série ${p.set + 1} / ${ex.sets}${ex.perSide ? ` · côté ${p.side + 1} / 2` : ''}</div></div></div>
    <div class="center"><b class="presc">${t ? (ex.secMin >= 120 ? fmtDur(ex.secMin) + (ex.secMax !== ex.secMin ? ' à ' + fmtDur(ex.secMax) : '') : rng(ex.secMin, ex.secMax) + ' s') : rng(ex.repsMin, ex.repsMax) + (ex.unit ? ' ' + ex.unit : ' rép.')}</b>${ex.load ? h`<div class="muted">${ex.load}</div>` : ''}${p.hint ? h`<div class="small acc-t">Dernière fois : ${p.hint.last}${p.hint.next ? ' · ' + p.hint.next : ''}</div>` : ''}${ex.rest ? h`<div class="tiny muted">Repos prévu : ${fmtDur(ex.rest)}</div>` : ''}</div>
    ${working ? h`<div class="timer" id="ptimer">${mmss(Math.max(0, Math.ceil(((p.paused ? p.remaining : p.end - Date.now())) / 1000)))}</div><div class="bar"><i id="pbar2" style="width:0%"></i></div><button class="btn big pri" data-act="pWorkDone">✓ Terminer la série</button>`
      : h`${t ? stepper('secs', p.secs, 's', 'Durée') : stepper('reps', p.reps, ex.unit || 'rép.', 'Répétitions faites')}${!t && usesLoad ? stepper('load', p.load, 'kg', 'Charge') : ''}
        <button class="btn pri big" data-act="pGo" ${p.paused ? 'disabled' : ''}>${t ? `▶ Démarrer (${mmss(p.secs)})` : '✓ Série faite'}</button>`}
    ${ex.ok.length ? h`<details ${p.set === 0 ? 'open' : ''} class="card"><summary><b>Consignes</b></summary><ul>${ex.ok.map((c) => h`<li>${c}</li>`)}</ul>${ex.bad.length ? h`<b class="small">À éviter</b><ul>${ex.bad.map((c) => h`<li>${c}</li>`)}</ul>` : ''}</details>` : ''}
    ${next ? h`<p class="tiny muted center">Ensuite : ${next.name}</p>` : ''}`;
}
function vRest(p) {
  const ex = cur();
  return h`<div class="center"><div class="muted">Repos</div></div><div class="timer rest" id="ptimer">${mmss(Math.max(0, Math.ceil((p.paused ? p.remaining : p.end - Date.now()) / 1000)))}</div><div class="bar"><i id="pbar2" style="width:0%"></i></div>
    <div class="center muted">Ensuite : <b>${ex.name} — série ${p.set + 1}/${ex.sets}</b></div>
    <div class="grid2"><button class="btn big" data-act="pRestAdd">+ 30 s</button><button class="btn pri big" data-act="pRestSkip">Passer le repos</button></div>`;
}
/* ───────── Questionnaire adaptatif post-séance ───────── */
function doneExercises(p) { return p.log.map((l, i) => ({ ...l, ex: p.s.exercises[i] })).filter((l) => l.sets.length); }
function vQuiz(p) {
  const done = doneExercises(p), q = p.quiz, c = ctx();
  const sets = done.reduce((t, l) => t + l.sets.length, 0);
  const muscles = [...new Set(done.flatMap((l) => { const m = exMuscles(l.ex, c); return [...m.prim, ...m.sec]; }))].slice(0, 12);
  const everDone = new Set(S.history.flatMap((hh) => (hh.data?.exercises || []).map((e) => exKey(e.name))));
  const discoveries = done.filter((l) => l.isNew || !everDone.has(exKey(l.name))).slice(0, 3);
  const fingers = done.some((l) => l.risk === 'finger' || (exCaps(l.ex, c).force_doigts || 0) >= 0.8);
  const stored = getSeance(p.s.id);
  return h`<div class="pl"><div class="center"><div class="ico acc big" style="margin:0 auto">🎉</div><h1>${p.aborted ? 'Séance interrompue' : 'Séance terminée'}</h1>
      <p class="muted">${fmtDur(p.durationSeconds)} de séance · ${fmtDur(p.activeSeconds)} actif${p.pausedSeconds ? ' · ' + fmtDur(p.pausedSeconds) + ' de pause (non comptée)' : ''} · ${done.length} exercice(s) · ${sets} série(s)</p></div>
    ${p.prs.map((x) => h`<div class="card acc-b">🏆 Nouveau record : <b>${x}</b></div>`)}
    ${sets ? h`<div class="card"><h3>Questionnaire rapide</h3><p class="tiny muted">Tes réponses affinent ton profil, tes préférences et les prochaines séances. Tout est facultatif.</p>
      ${muscles.length ? h`<b class="small">Quels muscles as-tu le plus sentis ?</b><div class="chips">${muscles.map((m) => h`<button type="button" class="chip ${q.felt.includes(m) ? 'on' : ''}" data-act="qFelt" data-v="${m}">${MUSCLES[m]?.label || m}</button>`)}</div>` : ''}
      ${done.length > 1 ? h`<b class="small">Exercice le plus difficile ?</b><div class="chips">${done.map((l) => h`<button type="button" class="chip ${q.hardest === l.name ? 'on' : ''}" data-act="qPick" data-k="hardest" data-v="${l.name}">${l.name}</button>`)}</div>
        <b class="small">Exercice le plus facile ?</b><div class="chips">${done.map((l) => h`<button type="button" class="chip ${q.easiest === l.name ? 'on' : ''}" data-act="qPick" data-k="easiest" data-v="${l.name}">${l.name}</button>`)}</div>` : ''}
      <b class="small">Difficulté globale</b><div class="chips">${[[1, '😌 Facile'], [2, '🙂 Bien'], [3, '😅 Costaud'], [4, '🥵 Dur'], [5, '💀 Très dur']].map(([v, l]) => h`<button type="button" class="chip ${q.difficulty === v ? 'on' : ''}" data-act="qDiff" data-v="${v}">${l}</button>`)}</div>
      ${discoveries.map((l) => h`<b class="small">Nouveau pour toi : as-tu aimé « ${l.name} » ?</b><div class="chips">${[['aime', '👍 J’aime'], ['neutre', '😐 Neutre'], ['evite', '👎 À éviter']].map(([v, lab]) => h`<button type="button" class="chip ${q.likes[l.name] === v ? 'on' : ''}" data-act="qLike" data-n="${l.name}" data-v="${v}">${lab}</button>`)}</div>`)}
      ${fingers ? h`<b class="small">Tes doigts après la séance ?</b><div class="chips">${['Rien à signaler', 'Fatigués', 'Gêne ou douleur'].map((v) => h`<button type="button" class="chip ${q.answers.doigts === v ? 'on' : ''}" data-act="qAns" data-k="doigts" data-v="${v}">${v}</button>`)}</div>${q.answers.doigts === 'Gêne ou douleur' ? h`<p class="tiny warn-t">Noté. Le générateur évitera le travail intense des doigts dans les prochains jours. Si une douleur persiste, demande l’avis d’un professionnel de santé.</p>` : ''}` : ''}
      <label><b class="small">Commentaire (facultatif)</b><textarea data-input="qComment" rows="3" maxlength="600" placeholder="Sensations, réussite, difficulté…">${q.comment}</textarea></label>
      ${stored ? h`<label class="chk"><input type="checkbox" data-change="qBase" ${p.useBase ? 'checked' : ''}> Utiliser mes valeurs réalisées comme nouvelle base de « ${stored.name} » <span class="tiny muted">(seulement quand elles sont supérieures ou égales à la prescription)</span></label>` : ''}
    </div>` : h`<p class="muted center">Aucune série réalisée : rien à enregistrer.</p>`}
    <button class="btn pri big" data-act="pSave" ${sets ? '' : 'disabled'}>💾 Enregistrer</button><button class="btn" data-act="pDiscard">Ne pas enregistrer</button></div>`;
}
Object.assign(ACT, {
  qFelt: (el) => { const q = S.player.quiz, v = el.dataset.v; q.felt = q.felt.includes(v) ? q.felt.filter((x) => x !== v) : [...q.felt, v]; draw(); },
  qPick: (el) => { const q = S.player.quiz; q[el.dataset.k] = q[el.dataset.k] === el.dataset.v ? '' : el.dataset.v; draw(); },
  qDiff: (el) => { S.player.quiz.difficulty = Number(el.dataset.v); draw(); },
  qLike: (el) => { S.player.quiz.likes[el.dataset.n] = el.dataset.v; draw(); },
  qAns: (el) => { S.player.quiz.answers[el.dataset.k] = el.dataset.v; draw(); },
  pAdj: (el) => { const p = S.player, k = el.dataset.k, d = Number(el.dataset.d); if (k === 'reps') p.reps = Math.max(0, p.reps + d); else if (k === 'load') p.load = Math.max(0, Math.round((p.load + d * 0.5) * 10) / 10); else p.secs = Math.max(1, p.secs + d * 5); draw(); },
  pGo: () => { const p = S.player, ex = cur(); if (p.paused) return; if (ex.mode === 'time') { const now = Date.now(); p.phase = 'work'; p.workStart = now; p.workPausedMs = 0; p.end = now + p.secs * 1000; p.total = p.secs * 1000; p.lastBeep = 0; beep(880, 120); draw(); } else { buzz(40); completeSet(0); } },
  pWorkDone: () => { const p = S.player; if (p.paused) clock.resume(p); completeSet(Math.max(1, Math.round((Date.now() - p.workStart - p.workPausedMs) / 1000))); },
  pPause: () => { const p = S.player; if (!p || p.phase === 'done') return; if (p.paused) { const before = p.pauseStart; clock.resume(p); if (p.phase === 'rest') p.restPaused = (p.restPaused || 0) + (Date.now() - before); } else clock.pause(p); draw(); },
  pRestAdd: () => { const p = S.player; if (!p || p.phase !== 'rest') return; if (p.paused) p.remaining = Math.max(0, p.remaining || 0) + 30000; else p.end += 30000; p.total += 30000; draw(); },
  pRestSkip: () => { const p = S.player; if (p.paused) { const before = p.pauseStart; clock.resume(p); p.restPaused = (p.restPaused || 0) + (Date.now() - before); } endRest(); draw(); },
  pSkip: async () => { if (!(await ask('Passer cet exercice ?', { ok: 'Passer' }))) return; if (S.player.phase === 'rest') endRest(); nextExercise(); },
  pQuit: async () => {
    const p = S.player, any = p.log.some((l) => l.sets.length);
    if (!any) { if (await ask('Quitter la séance sans rien enregistrer ?', { ok: 'Quitter', danger: true })) closePlayer(); return; }
    if (await ask('Terminer maintenant ?', { ok: 'Terminer', detail: 'Tu pourras enregistrer ce qui a déjà été fait (la séance sera marquée « interrompue »).' })) finish(true);
  },
  pDiscard: async () => { if (await ask('Ne pas enregistrer cette séance ?', { ok: 'Ne pas enregistrer', danger: true })) closePlayer(); },
  pSave: () => saveResult(),
});
INPUT.qComment = (el) => { if (S.player) S.player.quiz.comment = el.value.slice(0, 600); };
CHG.qBase = (el) => { if (S.player) S.player.useBase = el.checked; };

function saveResult() {
  const p = S.player, c = ctx(), q = p.quiz;
  const done = doneExercises(p);
  const stored = getSeance(p.s.id);
  // Base de prescription : uniquement si l'utilisateur le demande, et seulement vers le haut (progression conservatrice).
  if (stored && p.useBase) {
    const next = stored.exercises.map((ex, i) => {
      const l = p.log[i]; if (!l?.sets?.length) return ex;
      const last = l.sets[l.sets.length - 1];
      const better = ex.mode === 'time' ? (last.seconds || 0) >= ex.secMax : (last.reps || 0) >= ex.repsMax;
      return better ? applyPerformedBase(ex, last) : ex;
    });
    saveSeance({ ...stored, exercises: next });
  }
  const likes = Object.entries(q.likes).map(([name, value]) => ({ name, value }));
  const entry = {
    id: uid(), sessionId: p.s.id, sessionName: p.s.name, startedAt: p.startedAt, durationSeconds: p.durationSeconds,
    data: {
      rpe: q.difficulty || 0, note: q.comment.trim().slice(0, 600), focus: p.s.goal || '', activity: p.s.activity || '', aborted: !!p.aborted,
      activeSeconds: p.activeSeconds, pausedSeconds: p.pausedSeconds, plannedMin: p.s.context?.plannedMin || sessionMinutes(p.s), context: p.s.context,
      questionnaire: { felt: q.felt, hardest: q.hardest, easiest: q.easiest, difficulty: q.difficulty || 0, comment: q.comment.trim().slice(0, 600), likes, answers: Object.entries(q.answers).map(([k, a]) => ({ q: k, a })) },
      swaps: p.swaps.map((s) => ({ from: s.from, to: s.to })),
      exercises: done.map((l) => ({ name: l.name, libId: l.libId, group: l.group, intensity: l.intensity, risk: l.risk, muscles: l.muscles, caps: exCaps(l.ex, c), prim: exMuscles(l.ex, c).prim, sec: exMuscles(l.ex, c).sec, sets: l.sets })),
    },
  };
  if (!entry.data.activity) entry.data.activity = entryActivity(entry, c) === 'autre' ? '' : entryActivity(entry, c);
  addHistory(entry);
  // Préférences explicitement exprimées dans le questionnaire (aucune déduction silencieuse).
  for (const { name, value } of likes) if (value !== 'neutre') putItem('pref', 'q-' + exKey(name).replace(/[^\w-]/g, '_').slice(0, 60), { key: exKey(name), label: name, value, source: 'questionnaire', reason: `Réponse au questionnaire du ${new Date().toLocaleDateString('fr-FR')}` });
  if (p.eventId) { const ev = S.events.find((e) => e.id === p.eventId); if (ev && !ev.recurrence) saveEvent({ ...ev, completed: true }); }
  // Boucle d'adaptation : ce que la séance change dans le profil, affiché explicitement.
  const capsAdded = {};
  for (const e of entry.data.exercises) for (const [k, w] of Object.entries(e.caps || {})) capsAdded[k] = (capsAdded[k] || 0) + w * e.sets.length;
  const top = Object.entries(capsAdded).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${CAPACITIES[k]?.label || k} +${Math.round(v * 10) / 10} séries`);
  const changes = [top.length ? `Volume ajouté : ${top.join(', ')}.` : '', likes.filter((l) => l.value !== 'neutre').length ? `${likes.filter((l) => l.value !== 'neutre').length} préférence(s) enregistrée(s).` : '', q.felt.length ? `Ressenti musculaire noté (${q.felt.length} zone(s)).` : '', q.answers.doigts === 'Gêne ou douleur' ? 'Doigts : gêne notée, le travail intense des doigts sera évité les prochains jours.' : ''].filter(Boolean);
  closePlayer();
  buzzOk();
  toast(`Séance enregistrée ✓ ${changes.length ? '— ' + changes[0] : ''}`, 4500);
  S.lastLoop = { at: Date.now(), changes, entryId: entry.id };
  go('home', 'dash');
}
export function hasFingerComplaint(history, now = Date.now()) {
  return history.some((hh) => now - hh.startedAt < 3 * 86400000 && (hh.data?.questionnaire?.answers || []).some((a) => a.q === 'doigts' && /douleur|gêne/i.test(a.a)));
}

/* ───────── Mode mains libres (commandes vocales pendant la séance) ───────── */
let rec = null, voiceOn = false;
export function voiceStart() {
  if (!S.settings.handsFree) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Commandes vocales non disponibles ici : les gros boutons restent actifs.'); return; }
  voiceOn = true;
  try {
    rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => handleVoice(norm(e.results[e.results.length - 1][0].transcript));
    rec.onend = () => { if (voiceOn && S.player && S.player.phase !== 'done') { try { rec.start(); } catch { /* déjà lancé */ } } };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { voiceOn = false; toast('Micro refusé : commandes vocales désactivées.'); } };
    rec.start();
  } catch { voiceOn = false; }
}
function voiceStop() { voiceOn = false; try { rec?.stop(); } catch { /* rien */ } rec = null; }
function handleVoice(t) {
  const p = S.player; if (!p || p.phase === 'done') return;
  if (/\b(pause|reprend)/.test(t)) ACT.pPause();
  else if (/\b(passe|saute|suivant)/.test(t)) (p.phase === 'rest' ? ACT.pRestSkip() : nextExercise());
  else if (/\b(plus|trente|ajoute)/.test(t) && p.phase === 'rest') ACT.pRestAdd();
  else if (/\b(fait|termine|valide|ok|go|demarre|partez)/.test(t)) (p.phase === 'work' ? ACT.pWorkDone() : p.phase === 'ready' ? ACT.pGo() : ACT.pRestSkip());
}
export function onVisible() { if (S.player) { wake(); tick(); } }
export { closePlayer };
