// player.js — mode séance (téléphone) : exercice courant, séries, chronos, repos, pause / reprise, passage,
// abandon, fin, puis questionnaire adaptatif très court et enregistrement.
//
// Comptabilité du temps (tout est calculé à partir d'horodatages, donc juste même en arrière-plan) :
//  - durée réelle  = temps écoulé depuis le début − temps en pause ;
//  - temps actif   = durée réelle − temps de repos effectivement passé ;
//  - temps de pause = somme des pauses (jamais compté comme temps actif) ;
//  - une série chronométrée mise en pause ne compte pas le temps de pause dans sa durée.
import { h, raw, $, toast, ask, fmtDur, mmss, rng, buzzOk, tag, openSheet, closeSheet, askText, chip } from './ui.js';
import { S, ACT, CHG, INPUT, render, getSeance, saveSeance, addHistory, saveEvent, putItem, ctx, go, saveSettings, ls, item } from './state.js';
import { normalizeSession, uid, exKey, parseKg, norm } from './shared.js';
import { progressHint, applyPerformedBase, exMinutes, sessionMinutes } from './engine.js';
import { MUSCLES, CAPACITIES } from './model.js';
import { byId } from './library.js';
import { exCaps, exMuscles, entryActivity, activeGoals, goalCaps, goalLabel } from './brain.js';
import { warmupFor, alternatives, replaceExercise } from './generator.js';
import { plates, withFingerWarm } from './sports.js';
import { hrSupported, hrConnect, hrConnected, hrNow, onHr } from './hr.js';
import { celebrate } from './fx.js';
import { figure } from './anim.js';
import { beep } from './sound.js';
import { exWhat, exUse, exWhyHere } from './explain.js';
import { FEELS, nextSetAdvice, restTip, toSupersets, mergeLog, snapshot, canResume } from './live.js';
import { adaptSession } from './adapt.js';
import { AVOID_ZONES } from './intentions.js';


let wakeLock = null, timer = null;
const buzz = (p) => { if (S.settings.vibration && navigator.vibrate) try { navigator.vibrate(p); } catch { /* rien */ } };
/** Ce que le coach annonce pour un exercice : « Tractions. 3 séries de 8 répétitions. » */
function sayExercise(ex) {
  const n = ex.sets > 1 ? `${ex.sets} séries de ` : '';
  const what = ex.mode === 'time' ? `${ex.secMax} secondes` : `${ex.repsMax} ${ex.unit || 'répétitions'}`;
  speak(`${ex.name}. ${n}${what}.${ex.ok?.[0] ? ' ' + ex.ok[0] : ''}`);
}
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
  p.load = keepLoad && prev ? prev.load : hint?.nextLoad || hint?.load || parseKg(ex.load) || 0; // 8.30 : charge proposée (règle des 2 séances)
  p.hint = hint;
  // 8.30 : ressenti de la série d'avant (facile / échec) → la série suivante est ajustée (une seule fois).
  if (keepLoad && p.nextAdj) { p.load = p.nextAdj.load; p.reps = p.nextAdj.reps; p.secs = p.nextAdj.secs; }
  p.nextAdj = null;
}
export function startPlayer(session, { eventId = null, fromGenerator = false, program = null } = {}) {
  const s = normalizeSession(session);
  if (!s.exercises.length) { toast('Cette séance est vide : ajoute au moins un exercice.'); return; }
  // Séance faite à la main sans échauffement : on en ajoute un court (réglable dans Paramètres, « Passer » à tout moment).
  let warmAdded = 0;
  if (!fromGenerator && S.settings.autoWarm !== false && !s.exercises.some((e) => e.block === 'warmup')) {
    const w = warmupFor(s.activity || '', 5);
    if (w.length) { s.exercises = [...w, ...s.exercises]; warmAdded = w.length; }
  }
  // 8.30 : avant un effort de doigts intense, un échauffement progressif des doigts est ajouté s'il manque.
  const fw = withFingerWarm(s.exercises, byId);
  if (fw.added) { s.exercises = fw.exercises; setTimeout(() => toast(`🖐️ Échauffement des doigts ajouté avant « ${fw.before} » (passe-le si tu es déjà chaud).`, 4500), 400); }
  S.player = {
    s, eventId, fromGenerator, i: 0, set: 0, side: 0, phase: 'ready', end: 0, total: 0, startedAt: Date.now(), paused: false, pauseStart: 0, pausedMs: 0,
    workStart: 0, workPausedMs: 0, restStart: 0, restMs: 0, remaining: 0, lastBeep: 0, swaps: [...(fromGenerator ? S.gen.swaps || [] : [])],
    log: s.exercises.map((e) => ({ name: e.name, libId: e.libId, group: e.group, intensity: e.intensity, risk: e.risk, muscles: e.muscles, caps: e.caps, prim: e.prim, sec: e.sec, isNew: e.isNew, sets: [] })),
    quiz: { felt: [], hardest: '', easiest: '', difficulty: 0, comment: '', likes: {}, answers: {} }, useBase: !!S.settings.autoBase, prs: [], warmAdded, hr: { sum: 0, n: 0, max: 0 }, program,
  };
  initInputs(false);
  $('#player').classList.add('open'); document.body.classList.add('noscroll');
  wake(); beep(1, 1); draw(); clearInterval(timer); timer = setInterval(tick, 250); sayExercise(s.exercises[0]);
  if (S.settings.handsFree) voiceStart(); // mode mains libres réglé dans Paramètres : actif dès le début
}
export function tick() {
  const p = S.player; if (!p || p.paused || !(p.phase === 'rest' || p.phase === 'work')) return;
  const now = Date.now(), rem = Math.max(0, Math.ceil((p.end - now) / 1000));
  const t = $('#ptimer'), b = $('#pbar2'), c = $('#pclock');
  if (t) t.textContent = mmss(rem);
  if (b) b.style.width = `${Math.max(0, Math.min(100, 100 - ((p.end - now) / Math.max(1, p.total)) * 100))}%`;
  if (c) c.textContent = mmss(Math.floor(clock.real(p) / 1000));
  if (rem <= 3 && rem > 0 && p.lastBeep !== rem) { p.lastBeep = rem; beep(660, 90); if (S.settings.voice) speak(String(rem)); }
  if (p.phase === 'rest' && rem === 10 && p.said !== 'r10' && p.total >= 20000) { p.said = 'r10'; speak('Encore 10 secondes.'); }
  if (p.phase === 'work' && p.total >= 30000 && rem === Math.round(p.total / 2000) && p.said !== 'half') { p.said = 'half'; speak('La moitié.'); }
  const hb = $('#phr'); if (hb) hb.textContent = hrNow() ? `❤ ${hrNow()}` : '';
  if (rem <= 0) onTimerEnd();
}
function onTimerEnd() {
  const p = S.player; beep(1040, 350); buzz([300, 100, 300]); p.lastBeep = 0;
  if (p.phase === 'rest') { endRest(p.end); const ex = cur(); speak(`Série ${p.set + 1} sur ${ex.sets}.`); draw(); }
  else if (p.phase === 'work') { speak('Terminé.'); completeSet(cur().mode === 'time' ? p.secs : 0); }
}
function endRest(at = Date.now()) {
  const p = S.player;
  p.restMs += Math.max(0, Math.min(at, Date.now()) - p.restStart - (p.restPaused || 0));
  p.phase = 'ready'; p.restPaused = 0; initInputs(true);
}
function startRest(sec) {
  const p = S.player, safe = Math.max(0, Number(sec) || 0), now = Date.now();
  if (safe <= 0) { p.phase = 'ready'; initInputs(true); draw(); return; }
  p.phase = 'rest'; p.restStart = now; p.restPaused = 0; p.end = now + safe * 1000; p.total = safe * 1000; p.remaining = safe * 1000; p.lastBeep = 0; p.said = '';
  speak(safe >= 60 && safe % 60 === 0 ? `Repos, ${safe / 60} minute${safe > 60 ? 's' : ''}.` : `Repos, ${safe} secondes.`); draw();
}
function completeSet(secondsDone) {
  const p = S.player, ex = cur();
  if (ex.perSide && p.side === 0) { p.side = 1; p.phase = 'ready'; buzz(80); toast('Change de côté'); draw(); return; }
  p.log[p.i].sets.push({ reps: ex.mode === 'reps' ? p.reps : 0, seconds: ex.mode === 'time' ? secondsDone : 0, load: p.load || 0, done: true });
  p.side = 0; p.duoWhy = 'set'; p.feelText = ''; buzzOk();
  if (p.set + 1 < ex.sets) { p.set++; startRest(ex.rest); }
  else nextExercise();
}
function nextExercise() {
  const p = S.player; p.i++; p.set = 0; p.side = 0; p.phase = 'ready';
  if (p.i >= p.s.exercises.length) return finish(false);
  initInputs(false); sayExercise(cur()); draw(true);
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
  clearInterval(timer); unwake(); voiceStop(); stopHr();
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
  speak(p.prs.length ? 'Séance terminée. Et tu as battu un record, bravo !' : 'Séance terminée. Bien joué.');
  draw();
  if (p.prs.length) setTimeout(() => celebrate(), 250);
}
function closePlayer() { duoHook?.('close'); clearInterval(timer); unwake(); voiceStop(); stopHr(); ls.del(SNAP_KEY); S.player = null; $('#player').classList.remove('open'); $('#player').innerHTML = ''; document.body.classList.remove('noscroll'); render(); }

/* ───────── Affichage ───────── */
function draw(anim = false) {
  const p = S.player; if (!p) return; const root = $('#player');
  if (p.phase === 'done') { root.innerHTML = vQuiz(p).s; duoHook?.('draw'); return; }
  const n = p.s.exercises.length, pct = Math.round((p.i / n) * 100);
  const big = !!S.settings.bigMode, warm = cur()?.block === 'warmup' && p.warmAdded;
  root.classList.toggle('redmode', !!S.settings.redMode);
  try { ls.set(SNAP_KEY, snapshot(p)); } catch { /* stockage plein : pas de reprise possible, la séance continue */ }
  root.innerHTML = h`<div class="pl ${anim ? 'slide' : ''} ${big ? 'big' : ''}"><div class="row between"><button class="btn sm" data-act="pQuit">✕ Terminer</button><span class="muted small">Exercice ${p.i + 1} / ${n} · <span id="pclock">${mmss(Math.floor(clock.real(p) / 1000))}</span> <b id="phr" class="hr">${hrNow() ? `❤ ${hrNow()}` : ''}</b></span><button class="btn sm" data-act="pSkip">Passer ⏭</button></div>
    <div class="row ptools"><button class="btn sm ${S.settings.voice ? 'on' : ''}" data-act="pVoice" aria-pressed="${S.settings.voice ? 'true' : 'false'}">${S.settings.voice ? '🔊 Coach' : '🔇 Coach'}</button><button class="btn sm ${big ? 'on' : ''}" data-act="pBig" aria-pressed="${big ? 'true' : 'false'}">Aa Grand</button>${hrSupported() ? h`<button class="btn sm ${hrConnected() ? 'on' : ''}" data-act="pHr">${hrConnected() ? '❤ Cardio' : '❤ Capteur'}</button>` : ''}${S.user && !S.user.guest ? h`<button class="btn sm ${S.duo ? 'on' : ''}" data-act="duoOpen">👥 ${S.duo ? S.duo.members.length ? 'À ' + (S.duo.members.length + 1) : 'En attente' : 'À deux'}</button>` : ''}<button class="btn sm" data-act="pTools" aria-label="Outils de la séance : j’ai mal, il me reste peu de temps, note, mode nuit, commandes vocales">⋯ Outils</button></div>
    ${S.duo ? h`<div class="duobar small"><span class="dot ${S.duo.lost ? 'off' : ''}"></span>${S.duo.members.length ? `Avec ${S.duo.members.join(', ')}` : `Code ${S.duo.code} : en attente de ton partenaire`}${S.duo.lost ? ' · connexion perdue' : ''}</div>` : ''}
    ${warm ? h`<div class="card flat row warmnote"><span class="grow small">On commence par ${p.warmAdded > 1 ? `${p.warmAdded} exercices` : 'un exercice'} d’échauffement.</span><button class="btn sm" data-act="pSkipWarm">Passer</button></div>` : ''}
    ${big && p.phase !== 'done' ? h`<p class="tiny muted center">Touche l’écran n’importe où pour valider</p>` : ''}
    <div class="bar"><i style="width:${pct}%"></i></div>${p.paused ? h`<div class="card flat center warn-b">⏸ En pause : le temps de pause n’est pas compté</div>` : ''}${p.phase === 'rest' ? vRest(p) : vSet(p)}
    <div class="row wrapf center-row"><button class="btn" data-act="pPause">${p.paused ? '▶ Reprendre' : '⏸ Pause'}</button></div></div>`.s;
  tick(); duoHook?.('draw');
}
function stepper(k, value, unit, label) { return h`<div class="center"><div class="muted small">${label}</div><div class="stepper"><button data-act="pAdj" data-k="${k}" data-d="-1" aria-label="Moins">−</button><b>${value}<span class="small muted"> ${unit}</span></b><button data-act="pAdj" data-k="${k}" data-d="1" aria-label="Plus">+</button></div></div>`; }
/** Consignes de l'exercice, affichées à chaque série (et pendant le repos, pour la série qui suit). */
function cues(ex, sess) {
  const use = exUse(ex), here = sess ? exWhyHere(ex, sess) : '';
  const brief = h`<details class="how mini"><summary>🧐 C’est quoi ? À quoi ça sert ?</summary><p class="small"><b>C’est quoi ?</b> ${exWhat(ex)}</p>${use ? h`<p class="small"><b>À quoi ça sert ?</b> ${use}</p>` : ''}${here ? h`<p class="small"><b>Pourquoi ici ?</b> ${here}</p>` : ''}</details>`;
  if (!ex.ok.length && !ex.bad.length) return h`<div class="card cues">${brief}</div>`;
  return h`<div class="card cues">${ex.ok.length ? h`<b>📋 Consignes</b><ul>${ex.ok.map((c) => h`<li>${c}</li>`)}</ul>` : ''}${ex.bad.length ? h`<b class="small">⚠️ À éviter</b><ul class="bad">${ex.bad.map((c) => h`<li>${c}</li>`)}</ul>` : ''}${brief}</div>`;
}
function vSet(p) {
  const ex = cur(), t = ex.mode === 'time', working = p.phase === 'work';
  const usesLoad = p.load > 0 || !!String(ex.load || '').trim() || p.hint?.load > 0;
  const next = p.s.exercises[p.i + 1];
  return h`<div class="row"><div class="figbox">${raw(figure(ex, { size: 84 }))}</div><div class="grow">${ex.part ? h`<div class="tiny acc-t">${ex.part}</div>` : ''}<h1 style="margin:0">${ex.emoji} ${ex.name}</h1><div class="muted">Série ${p.set + 1} / ${ex.sets}${ex.perSide ? ` · côté ${p.side + 1} / 2` : ''}</div>${item('exsetup', setupId(ex))?.setup ? h`<div class="tiny acc-t">⚙️ ${item('exsetup', setupId(ex)).setup}</div>` : ''}</div></div>
    <div class="center"><b class="presc">${t ? (ex.secMin >= 120 ? fmtDur(ex.secMin) + (ex.secMax !== ex.secMin ? ' à ' + fmtDur(ex.secMax) : '') : rng(ex.secMin, ex.secMax) + ' s') : rng(ex.repsMin, ex.repsMax) + (ex.unit ? ' ' + ex.unit : ' rép.')}</b>${ex.load ? h`<div class="muted">${ex.load}</div>` : ''}${p.hint ? h`<div class="small acc-t">Dernière fois : ${p.hint.last}${p.hint.next ? ' · ' + p.hint.next : ''}</div>` : ''}${ex.rest ? h`<div class="tiny muted">Repos prévu : ${fmtDur(ex.rest)}</div>` : ''}</div>
    ${working ? h`<div class="timer" id="ptimer">${mmss(Math.max(0, Math.ceil(((p.paused ? p.remaining : p.end - Date.now())) / 1000)))}</div><div class="bar"><i id="pbar2" style="width:0%"></i></div><button class="btn big pri" data-act="pWorkDone">✓ Terminer la série</button>`
      : h`${t ? stepper('secs', p.secs, 's', 'Durée') : stepper('reps', p.reps, ex.unit || 'rép.', 'Répétitions faites')}${!t && usesLoad ? stepper('load', p.load, 'kg', 'Charge') : ''}${!t && usesLoad && isBarbell(ex) && p.load >= 20 ? h`<div class="tiny muted center">⚖️ ${plates(p.load).text}</div>` : ''}
        <button class="btn pri big" data-act="pGo" ${p.paused ? 'disabled' : ''}>${t ? `▶ Démarrer (${mmss(p.secs)})` : '✓ Série faite'}</button>`}
    ${cues(ex, p.s)}
    ${next ? h`<p class="tiny muted center">Ensuite : ${next.name}${partLeft(p)}</p>` : ''}`;
}
/** Séance au format choisi : temps restant de la partie en cours, et la partie suivante. */
function partLeft(p) {
  const ex = cur(); if (!ex?.part) return '';
  let j = p.i, mins = 0;
  while (j < p.s.exercises.length && p.s.exercises[j].part === ex.part) { const e = p.s.exercises[j]; mins += exMinutes(e) * (j === p.i ? Math.max(0, e.sets - p.set) / Math.max(1, e.sets) : 1); j++; }
  const nextPart = p.s.exercises[j]?.part;
  return ` · ${ex.part.replace(/^\S+\s/, '')} : encore ~${Math.max(1, Math.round(mins))} min${nextPart ? `, puis ${nextPart}` : ''}`;
}
function vRest(p) {
  const ex = cur(), last = p.log[p.i]?.sets?.at(-1), mins = Math.floor(clock.real(p) / 60000);
  return h`<div class="center"><div class="muted">Repos</div></div><div class="timer rest" id="ptimer">${mmss(Math.max(0, Math.ceil((p.paused ? p.remaining : p.end - Date.now()) / 1000)))}</div><div class="bar"><i id="pbar2" style="width:0%"></i></div>
    <div class="center muted">Ensuite : <b>${ex.name} — série ${p.set + 1}/${ex.sets}</b>${p.feelText ? h`<div class="small acc-t">${p.feelText}</div>` : ''}</div>
    ${last ? h`<div class="feelrow"><span class="tiny muted">La série d’avant :</span><div class="chips" role="radiogroup" aria-label="Ressenti de la série">${FEELS.map(([v, e, l]) => h`<button type="button" role="radio" aria-checked="${last.feel === v}" class="chip ${last.feel === v ? 'on' : ''}" data-act="pFeel" data-v="${v}">${e} ${l}</button>`)}</div></div>` : ''}
    <div class="grid2"><button class="btn big" data-act="pRestAdd">+ 30 s</button><button class="btn pri big" data-act="pRestSkip">Passer le repos</button></div>
    <p class="small center resttip">${restTip(ex, { minutes: mins, restSec: ex.rest, k: p.set + p.i })}</p>
    ${cues(ex, p.s)}`;
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
    ${(() => { const g = goalsServed(done, c); return g.length ? h`<div class="card ok-b small">🎯 Cette séance a travaillé ce qui compte pour : <b>${g.join(', ')}</b></div>` : ''; })()}
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
/** Objectifs en cours que la séance a fait travailler (capacités des exercices faits ∩ capacités de l'objectif). */
function goalsServed(done, c) {
  const w = {}; for (const l of done) for (const [k, v] of Object.entries(exCaps(l.ex, c) || {})) w[k] = (w[k] || 0) + v;
  return activeGoals(c).filter((g) => { const gc = goalCaps(g, c), tot = gc.reduce((t, x) => t + x.w, 0); if (!tot) return false; return gc.reduce((t, x) => t + (w[x.id] ? x.w : 0), 0) / tot >= 0.4; }).map(goalLabel).slice(0, 3);
}
Object.assign(ACT, {
  qFelt: (el) => { const q = S.player.quiz, v = el.dataset.v; q.felt = q.felt.includes(v) ? q.felt.filter((x) => x !== v) : [...q.felt, v]; draw(); },
  qPick: (el) => { const q = S.player.quiz; q[el.dataset.k] = q[el.dataset.k] === el.dataset.v ? '' : el.dataset.v; draw(); },
  qDiff: (el) => { S.player.quiz.difficulty = Number(el.dataset.v); draw(); },
  qLike: (el) => { S.player.quiz.likes[el.dataset.n] = el.dataset.v; draw(); },
  qAns: (el) => { S.player.quiz.answers[el.dataset.k] = el.dataset.v; draw(); },
  pAdj: (el) => { const p = S.player, k = el.dataset.k, d = Number(el.dataset.d); if (k === 'reps') p.reps = Math.max(0, p.reps + d); else if (k === 'load') p.load = Math.max(0, Math.round((p.load + d * 0.5) * 10) / 10); else p.secs = Math.max(1, p.secs + d * 5); draw(); },
  pGo: () => { const p = S.player, ex = cur(); if (p.paused) return; if (ex.mode === 'time') { const now = Date.now(); p.phase = 'work'; p.workStart = now; p.workPausedMs = 0; p.end = now + p.secs * 1000; p.total = p.secs * 1000; p.lastBeep = 0; p.said = ''; beep(880, 120); speak(`${p.secs} secondes, c’est parti.`); draw(); } else { buzz(40); completeSet(0); } },
  pWorkDone: () => { const p = S.player; if (p.paused) clock.resume(p); completeSet(Math.max(1, Math.round((Date.now() - p.workStart - p.workPausedMs) / 1000))); },
  pPause: () => { const p = S.player; if (!p || p.phase === 'done') return; if (p.paused) { const before = p.pauseStart; clock.resume(p); if (p.phase === 'rest') p.restPaused = (p.restPaused || 0) + (Date.now() - before); } else clock.pause(p); draw(); },
  pRestAdd: () => { const p = S.player; if (!p || p.phase !== 'rest') return; if (p.paused) p.remaining = Math.max(0, p.remaining || 0) + 30000; else p.end += 30000; p.total += 30000; draw(); },
  pRestSkip: () => { const p = S.player; if (p.paused) { const before = p.pauseStart; clock.resume(p); p.restPaused = (p.restPaused || 0) + (Date.now() - before); } endRest(); draw(); },
  pSkip: async () => { if (!(await ask('Passer cet exercice ?', { ok: 'Passer' }))) return; if (S.player.phase === 'rest') endRest(); S.player.duoWhy = 'skip'; nextExercise(); },
  pQuit: async () => {
    const p = S.player, any = p.log.some((l) => l.sets.length);
    if (!any) { if (await ask('Quitter la séance sans rien enregistrer ?', { ok: 'Quitter', danger: true })) closePlayer(); return; }
    if (await ask('Terminer maintenant ?', { ok: 'Terminer', detail: 'Tu pourras enregistrer ce qui a déjà été fait (la séance sera marquée « interrompue »).' })) finish(true);
  },
  pDiscard: async () => { if (await ask('Ne pas enregistrer cette séance ?', { ok: 'Ne pas enregistrer', danger: true })) closePlayer(); },
  pSave: () => saveResult(),
  pRedraw: () => draw(),
  pVoice: () => { S.settings.voice = !S.settings.voice; saveSettings(); if (S.settings.voice) speak('Coach activé.'); else try { speechSynthesis.cancel(); } catch { /* rien */ } draw(); },
  pBig: () => { S.settings.bigMode = !S.settings.bigMode; saveSettings(); draw(); },
  pSkipWarm: () => { const p = S.player; if (p.phase === 'rest') endRest(); p.duoWhy = 'skip'; while (p.i < p.s.exercises.length && p.s.exercises[p.i].block === 'warmup' && p.i < p.warmAdded) { p.i++; } p.i--; nextExercise(); },
  pHr: async () => {
    if (hrConnected()) { toast(`Fréquence cardiaque : ${hrNow()} bpm`); return; }
    try { const name = await hrConnect(); toast(`${name} connecté`); startHr(); draw(); }
    catch (e) { if (e?.name !== 'NotFoundError') toast('Connexion impossible : vérifie que le capteur est allumé et à proximité.', 4500); }
  },
});
/* ───────── 8.30 : outils pendant la séance (ressenti, j'ai mal, il me reste X min, note, mode nuit, voix) ───────── */
const SNAP_KEY = 'sea:player-snap';
const setupId = (ex) => 'es-' + String(ex?.libId || exKey(ex?.name || '')).replace(/[^\w.-]/g, '_').slice(0, 60);
const isBarbell = (ex) => (ex.needs || byId(ex.libId)?.needs || []).includes('barbell') || (/\b(barre|squat|soulevé de terre|développé couché|rowing barre)\b/i.test(ex.name || '') && !/haltère|machine|traction|kettlebell/i.test(ex.name || ''));
Object.assign(ACT, {
  pFeel: (el) => {
    const p = S.player, last = p?.log[p.i]?.sets?.at(-1); if (!last) return;
    const v = Number(el.dataset.v); last.feel = v;
    const base = { load: last.load || p.load, reps: last.reps || p.reps, secs: last.seconds || p.secs }, a = nextSetAdvice(cur(), base, v);
    p.nextAdj = v === 1 || v === 4 ? { load: a.load, reps: a.reps || p.reps, secs: a.secs || p.secs } : null; p.feelText = a.text; buzzOk(); draw();
  },
  pTools: () => {
    const p = S.player; if (!p) return;
    openSheet(h`<div class="stack"><h2 style="margin:0">⋯ Outils de la séance</h2><div class="setmenu">
      <button class="setrow" data-act="pHurt"><span class="sic">🩹</span><span class="grow"><b>J’ai mal</b><small>La suite de la séance ménage la zone (pour cette fois)</small></span><span class="chev">›</span></button>
      <button class="setrow" data-act="pTime"><span class="sic">⏱</span><span class="grow"><b>Il me reste peu de temps</b><small>La suite tient dans le temps qu’il te reste</small></span><span class="chev">›</span></button>
      <button class="setrow" data-act="pSwap"><span class="sic">🔄</span><span class="grow"><b>Remplacer cet exercice</b><small>Machine prise, matériel absent : un exercice qui travaille la même chose</small></span><span class="chev">›</span></button>
      <button class="setrow" data-act="pSetup"><span class="sic">⚙️</span><span class="grow"><b>Mes réglages pour cet exercice</b><small>${item('exsetup', setupId(cur()))?.setup || 'Siège, dossier, prise… affichés à chaque fois'}</small></span><span class="chev">›</span></button>
      <button class="setrow" data-act="pNote"><span class="sic">📝</span><span class="grow"><b>Note sur cet exercice</b><small>${p.log[p.i]?.note ? p.log[p.i].note : 'Gardée dans ton journal avec la séance'}</small></span><span class="chev">›</span></button>
      <button class="setrow" data-act="pRed"><span class="sic">🔴</span><span class="grow"><b>Mode nuit ${S.settings.redMode ? '(activé)' : ''}</b><small>Écran rouge et sombre : n’éblouit pas (falaise, soir, bivouac)</small></span><span class="chev">${S.settings.redMode ? '✓' : '›'}</span></button>
      <button class="setrow" data-act="pHands"><span class="sic">🎙️</span><span class="grow"><b>Commandes vocales ${S.settings.handsFree ? '(activées)' : ''}</b><small>« Suivant », « pause », « facile », « j’ai mal », « il me reste 10 minutes »… selon le navigateur</small></span><span class="chev">${S.settings.handsFree ? '✓' : '›'}</span></button>
    </div><button class="btn" data-act="closeSheet">Fermer</button></div>`);
  },
  pSetup: async () => {
    const ex = cur(); if (!ex) return; closeSheet(); const id = setupId(ex), old = item('exsetup', id);
    const t = await askText(`Réglages pour « ${ex.name} »`, { value: old?.setup || '', placeholder: 'Ex. siège 4, dossier 2, prise large', max: 160, ok: 'Garder' });
    if (t == null) return; putItem('exsetup', id, { key: ex.libId || exKey(ex.name), label: ex.name, setup: String(t).trim().slice(0, 160) }); toast(String(t).trim() ? 'Réglages gardés : affichés à chaque séance' : 'Réglages effacés'); draw();
  },
  pSwap: () => {
    const p = S.player, ex = cur(); if (!ex) return;
    const alts = alternatives(ex, ctx(), { session: p.s }).filter((o) => o.available).slice(0, 8);
    openSheet(h`<div class="stack"><h2 style="margin:0">🔄 Remplacer « ${ex.name} »</h2>${alts.length ? h`<div class="setmenu">${alts.map((o) => h`<button class="setrow" data-act="pSwapTo" data-id="${o.lib.id}"><span class="sic">${o.lib.emoji || '💪'}</span><span class="grow"><b>${o.lib.name}</b><small>${o.reasons[0] || ''}</small></span><span class="chev">›</span></button>`)}</div>` : h`<p class="small">Aucun autre exercice possible avec ton matériel : passe celui-ci (⏭) si besoin.</p>`}<button class="btn" data-act="closeSheet">Annuler</button></div>`);
  },
  pSwapTo: (el) => {
    const p = S.player, ex = cur(); if (!ex) return;
    const r = replaceExercise(p.s, ex.id, el.dataset.id, 'pendant la séance'); if (!r.change) return closeSheet();
    const nx = r.session.exercises[p.i], keepSets = p.log[p.i].sets.length ? p.log[p.i] : null;
    p.s = { ...p.s, exercises: r.session.exercises }; p.adapted = true; p.swaps.push({ from: r.change.from, to: r.change.to });
    if (keepSets) { p.s.exercises.splice(p.i + 1, 0, nx); p.s.exercises[p.i] = ex; p.log.splice(p.i + 1, 0, { name: nx.name, libId: nx.libId, group: nx.group, intensity: nx.intensity, risk: nx.risk, muscles: nx.muscles, caps: nx.caps, prim: nx.prim, sec: nx.sec, sets: [] }); closeSheet(); nextExercise(); }
    else { p.log[p.i] = { name: nx.name, libId: nx.libId, group: nx.group, intensity: nx.intensity, risk: nx.risk, muscles: nx.muscles, caps: nx.caps, prim: nx.prim, sec: nx.sec, isNew: nx.isNew, sets: [] }; p.set = 0; p.phase = 'ready'; initInputs(false); closeSheet(); draw(true); }
    toast(`Remplacé par « ${r.change.to} »`);
  },
  pRed: () => { S.settings.redMode = !S.settings.redMode; saveSettings(); closeSheet(); draw(); },
  pHands: () => { S.settings.handsFree = !S.settings.handsFree; saveSettings(); closeSheet(); if (S.settings.handsFree) { voiceStart(); toast('Commandes vocales : dis « suivant », « pause », « facile », « j’ai mal »…', 4000); } else voiceStop(); draw(); },
  pNote: async () => {
    const p = S.player, l = p?.log[p.i]; if (!l) return; closeSheet();
    const t = await askText(`Note sur « ${l.name} »`, { value: l.note || '', placeholder: 'Ex. prise large, épaule qui tire un peu', max: 200, ok: 'Garder' });
    if (t == null) return; l.note = String(t).trim().slice(0, 200); toast(l.note ? 'Note gardée' : 'Note effacée'); draw();
  },
  pHurt: () => {
    openSheet(h`<div class="stack"><h2 style="margin:0">🩹 Où as-tu mal ?</h2><p class="tiny muted">La suite de la séance est adaptée pour ménager cette zone, pour cette fois. La douleur est aussi notée dans ton suivi (Profil › Mon corps et mes préférences).</p>
      <div class="chips">${AVOID_ZONES.map(([k, l]) => chip(false, l, `data-act="pHurtZone" data-id="${k}"`))}</div>
      <p class="tiny warn-t">Douleur vive, craquement, gonflement ou fourmillements : arrête la séance.</p><button class="btn" data-act="pHurtStop">⏹ Arrêter la séance</button></div>`);
  },
  pHurtZone: (el) => { const z = el.dataset.id; putItem('pain', 'pn-' + uid().slice(0, 14), { zone: z, level: 5, side: '', when: 'effort', date: Date.now(), note: `Pendant « ${S.player?.s?.name || 'la séance'} »`, healed: false }); closeSheet(); adaptRest({ zones: [z] }); },
  pHurtStop: () => { closeSheet(); finish(true); },
  pTime: () => {
    openSheet(h`<div class="stack"><h2 style="margin:0">⏱ Il me reste…</h2><div class="chips">${[5, 10, 15, 20, 30, 45].map((m) => chip(false, `${m} min`, `data-act="pTimeGo" data-id="${m}"`))}</div>
      <label class="chk"><input type="checkbox" id="pss"> ⚡ Enchaîner par deux (deux exercices de groupes différents en alternance, sans repos entre eux)</label>
      <p class="tiny muted">On garde ce qui compte le plus pour ta séance ; séries et repos raccourcis si besoin.</p></div>`);
  },
  pTimeGo: (el) => { const ss = !!document.getElementById('pss')?.checked; closeSheet(); adaptRest({ minutes: Number(el.dataset.id), supersets: ss }); },
});
/** Adapte la suite de la séance en cours (exercice en cours inclus s'il n'est pas commencé). La séance d'origine ne change pas. */
function adaptRest({ minutes = 0, zones = [], supersets = false } = {}) {
  const p = S.player; if (!p || p.phase === 'done') return;
  if (p.phase === 'rest') endRest();
  const from = p.log[p.i]?.sets?.length ? p.i + 1 : p.i, rest = p.s.exercises.slice(from);
  if (!rest.length) { toast('C’est la fin de la séance : rien à adapter.'); draw(); return; }
  const r = adaptSession({ ...p.s, exercises: rest }, { ...(minutes ? { minutes } : {}), ...(zones.length ? { zones } : {}), warm: 'keep', cool: minutes && minutes <= 10 ? 'short' : 'keep' }, ctx());
  let next = r.session.exercises; if (supersets) next = toSupersets(next);
  p.s = { ...p.s, exercises: [...p.s.exercises.slice(0, from), ...next] }; p.adapted = true;
  p.log = [...p.log.slice(0, from), ...next.map((e) => ({ name: e.name, libId: e.libId, group: e.group, intensity: e.intensity, risk: e.risk, muscles: e.muscles, caps: e.caps, prim: e.prim, sec: e.sec, isNew: e.isNew, sets: [] }))];
  if (from > p.i) { p.i = from - 1; nextExercise(); } else { p.set = 0; p.side = 0; p.phase = 'ready'; initInputs(false); draw(true); }
  const ch = r.changes.filter((x) => !/^Rien à changer/.test(x));
  toast(ch.length ? `Adapté : ${ch.slice(0, 2).join(' · ')}` : zones.length ? 'Rien à changer : les exercices restants ne chargent pas fort cette zone. Arrête si la douleur augmente.' : 'Rien à raccourcir : la suite tient déjà dans ce temps.', 5000);
}
/** Séance interrompue (app fermée, téléphone éteint) : carte « Reprendre » à l'accueil, 12 h au plus. */
export function resumeCard() {
  if (S.player) return '';
  let snap = null; try { snap = ls.get(SNAP_KEY, null); } catch { /* rien */ }
  if (!canResume(snap)) return '';
  const ex = snap.s.exercises[snap.i];
  return h`<section class="card acc-b stack"><b>⏯ Séance interrompue : « ${snap.s.name} »</b><span class="small muted">Exercice ${snap.i + 1} / ${snap.s.exercises.length}${ex ? ` (${ex.name})` : ''} · ${Math.round(snap.elapsed / 60000)} min déjà faites</span>
    <div class="row wrapf"><button class="btn pri" data-act="pResume">▶ Reprendre</button><button class="btn ghost" data-act="pResumeDrop">Oublier</button></div></section>`;
}
ACT.pResume = () => {
  const snap = ls.get(SNAP_KEY, null); if (!canResume(snap)) return;
  S.player = { ...snap, s: normalizeSession(snap.s), phase: 'ready', end: 0, total: 0, paused: false, pauseStart: 0, pausedMs: 0, workStart: 0, workPausedMs: 0, restStart: 0, restMs: 0, remaining: 0, lastBeep: 0,
    startedAt: Date.now() - snap.elapsed, quiz: { felt: [], hardest: '', easiest: '', difficulty: 0, comment: '', likes: {}, answers: {} }, useBase: !!S.settings.autoBase, prs: [], hr: { sum: 0, n: 0, max: 0 } };
  initInputs(false); $('#player').classList.add('open'); document.body.classList.add('noscroll');
  wake(); draw(); clearInterval(timer); timer = setInterval(tick, 250); sayExercise(cur());
  if (S.settings.handsFree) voiceStart();
};
ACT.pResumeDrop = () => { ls.del(SNAP_KEY); render(); };
/* Grand affichage : un toucher n'importe où (hors boutons) fait l'action principale. */
export function bigTap(e) {
  const p = S.player; if (!p || !S.settings.bigMode || p.phase === 'done' || p.paused) return;
  if (e.target.closest('button, a, input, select, details, label, [data-act]')) return;
  if (p.phase === 'rest') ACT.pRestSkip(); else if (p.phase === 'work') ACT.pWorkDone(); else ACT.pGo();
}
let hrOff = null;
function startHr() { hrOff?.(); hrOff = onHr((bpm) => { const p = S.player; if (!p || p.paused || p.phase === 'done') return; p.hr.sum += bpm; p.hr.n++; p.hr.max = Math.max(p.hr.max, bpm); }); }
function stopHr() { hrOff?.(); hrOff = null; }
INPUT.qComment = (el) => { if (S.player) S.player.quiz.comment = el.value.slice(0, 600); };
CHG.qBase = (el) => { if (S.player) S.player.useBase = el.checked; };

function saveResult() {
  const p = S.player, c = ctx(), q = p.quiz;
  const done = doneExercises(p);
  const stored = getSeance(p.s.id);
  // Base de prescription : uniquement si l'utilisateur le demande, et seulement vers le haut (progression conservatrice).
  if (stored && p.useBase && !p.adapted) {
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
      ...(p.hr.n >= 5 ? { hr: { avg: Math.round(p.hr.sum / p.hr.n), max: p.hr.max } } : {}),
      ...(p.program ? { program: { id: p.program.id, i: p.program.i } } : {}),
      exercises: mergeLog(done).map((l) => ({ name: l.name, libId: l.libId, group: l.group, intensity: l.intensity, risk: l.risk, muscles: l.muscles, caps: exCaps(l.ex, c), prim: exMuscles(l.ex, c).prim, sec: exMuscles(l.ex, c).sec, sets: l.sets, ...(l.note ? { note: l.note } : {}) })),
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
  const m = t.match(/(?:reste|plus que)\D{0,12}(\d{1,3})\s*min/);
  if (m) { adaptRest({ minutes: Number(m[1]) }); return; }
  if (/\bj ?ai mal\b|\bdouleur\b/.test(t)) { ACT.pHurt(); return; }
  if (p.phase === 'rest' && /\b(facile|trop facile)\b/.test(t)) return ACT.pFeel({ dataset: { v: '1' } });
  if (p.phase === 'rest' && /\b(echec|rate|pas reussi)\b/.test(t)) return ACT.pFeel({ dataset: { v: '4' } });
  if (p.phase === 'rest' && /\b(dur|difficile)\b/.test(t)) return ACT.pFeel({ dataset: { v: '3' } });
  if (/\b(pause|reprend)/.test(t)) ACT.pPause();
  else if (/\b(passe|saute|suivant)/.test(t)) (p.phase === 'rest' ? ACT.pRestSkip() : nextExercise());
  else if (/\b(plus|trente|ajoute)/.test(t) && p.phase === 'rest') ACT.pRestAdd();
  else if (/\b(fait|termine|valide|ok|go|demarre|partez)/.test(t)) (p.phase === 'work' ? ACT.pWorkDone() : p.phase === 'ready' ? ACT.pGo() : ACT.pRestSkip());
}
/* ───────── Séance à deux : état partagé (position + chrono) ───────── */
let duoHook = null;
export const setDuoHook = (fn) => { duoHook = fn; };
/** Ce qui est partagé avec le partenaire : où on en est et le chrono. Les séries, charges et notes restent à chacun. */
export function duoSnapshot(p = S.player) {
  if (!p) return null;
  return { i: p.i, set: p.set, side: p.side, phase: p.phase, end: p.phase === 'rest' || p.phase === 'work' ? p.end : 0, total: p.total, remaining: p.paused ? Math.round(p.remaining || 0) : 0, paused: !!p.paused, why: p.duoWhy || 'set' };
}
const posKey = (a) => a.i * 1000 + a.set * 2 + a.side;
/**
 * Applique l'état reçu du partenaire (heures déjà converties en heure locale).
 * Si le partenaire a validé des séries, elles sont comptées ici avec les valeurs affichées ; s'il a passé un exercice, rien n'est compté.
 * Retourne 'done' si le partenaire a fini, true si l'affichage a changé.
 */
export function applyDuo(st) {
  const p = S.player; if (!p || p.phase === 'done' || !st) return false;
  if (st.phase === 'done') return 'done';
  const n = p.s.exercises.length, skip = st.why === 'skip';
  if (posKey(p) > posKey(st)) return false; // on est déjà plus loin : c'est notre état qui partira
  let moved = false, guard = 0; const i0 = p.i;
  while (posKey(p) < posKey(st) && p.i < n && guard++ < 3000) {
    moved = true;
    if (p.phase === 'rest') endRest(); else if (p.phase === 'work') p.phase = 'ready';
    const ex = cur(), lastEx = st.i === p.i;
    if (skip && !lastEx) { p.i++; p.set = 0; p.side = 0; if (p.i < n) initInputs(false); continue; }
    if (ex.perSide && p.side === 0) { p.side = 1; continue; }
    p.log[p.i].sets.push({ reps: ex.mode === 'reps' ? p.reps : 0, seconds: ex.mode === 'time' ? p.secs : 0, load: p.load || 0, done: true });
    p.side = 0;
    if (p.set + 1 < ex.sets) { p.set++; initInputs(true); } else { p.i++; p.set = 0; if (p.i < n) initInputs(false); }
  }
  if (p.i >= n) { finish(false); return true; }
  const now = Date.now(), timed = st.phase === 'rest' || st.phase === 'work';
  if (st.phase === 'rest' && p.phase !== 'rest') { p.phase = 'rest'; p.restStart = now; p.restPaused = 0; p.said = ''; p.lastBeep = 0; }
  else if (st.phase === 'work' && p.phase !== 'work') { p.phase = 'work'; p.workStart = st.end - st.total; p.workPausedMs = 0; p.secs = Math.round(st.total / 1000); p.said = ''; p.lastBeep = 0; }
  else if (st.phase === 'ready' && p.phase === 'rest') endRest();
  else if (st.phase === 'ready' && p.phase === 'work') p.phase = 'ready';
  if (timed) p.total = st.total;
  if (st.paused && !p.paused) clock.pause(p);
  else if (!st.paused && p.paused) clock.resume(p);
  if (st.paused) p.remaining = st.remaining; else if (timed) p.end = st.end;
  if (moved) { buzz(60); if (p.i !== i0) sayExercise(cur()); }
  draw(moved);
  return true;
}
export function onVisible() { if (S.player) { wake(); tick(); } }
export { closePlayer };
