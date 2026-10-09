// timer.js — chrono et minuteur plein écran, en six formats :
//  · Chaque minute (EMOM) : un exercice au début de chaque intervalle (1 min par défaut), sur autant de minutes que voulu ;
//  · Le plus de tours (AMRAP) : un circuit en boucle pendant une durée, avec un compteur de tours ;
//  · Pour le temps : un travail à finir le plus vite possible (limite facultative), le temps est gardé ;
//  · Intervalles et Tabata : effort / pause / répétitions / séries (suspensions 7 / 3, Tabata, gainage…) ;
//  · Compte à rebours, et Chronomètre avec des tours.
// Préparation → effort → … → fin. Bips, vibrations et voix (si le coach est activé). Le temps est calculé à partir
// d'horodatages : juste même si l'écran s'éteint un instant.
import { h, $, openSheet, closeSheet, toast, mmss, buzzOk, ask } from './ui.js';
import { S, ACT, SUBMIT, addHistory, render, itemsOf, item, putItem, delItem, own } from './state.js';
import { uid } from './shared.js';
import { beep } from './sound.js';
import { sourcesLine } from './srcui.js';

export const PRESETS = [
  { id: 'hang73', name: 'Suspensions 7 / 3', emoji: '🫳', work: 7, rest: 3, reps: 6, sets: 4, setRest: 180, note: 'Le classique à la poutre : 7 s suspendu, 3 s de pause, 6 fois. Prise que tu tiens sans forcer au début.', src: ['medernach2015', 'lopez2012'] },
  { id: 'maxhang', name: 'Suspensions max', emoji: '💪', work: 10, rest: 0, reps: 1, sets: 5, setRest: 120, note: '10 s sur une réglette exigeante (ou avec du lest), 2 min de repos. Arrête dès que la prise se dégrade.', src: ['lopez2012', 'schoffl2006'] },
  { id: 'tabata', name: 'Tabata', emoji: '🔥', work: 20, rest: 10, reps: 8, sets: 1, setRest: 0, note: '20 s à fond, 10 s de pause, 8 fois. 4 minutes qui piquent.', src: ['tabata1996'] },
  { id: 'plank', name: 'Gainage 40 / 20', emoji: '🧱', work: 40, rest: 20, reps: 6, sets: 1, setRest: 0, note: 'Enchaîne planche, côtés, hollow… 40 s chacun.' },
  { id: 'comp', name: 'Compétition de bloc 4 / 4', emoji: '🏆', work: 240, rest: 240, reps: 5, sets: 1, setRest: 0, note: '4 minutes pour essayer chaque bloc, 4 minutes de repos (format des compétitions). Note tes tops et zones dans Carnet › Mode compétition.' },
];
/** Les formats, dans l'ordre où ils sont proposés : [id, emoji, nom, à quoi ça sert]. */
export const FORMATS = [
  ['emom', '⏱', 'Chaque minute (EMOM)', 'Un exercice au début de chaque minute, sur autant de minutes que tu veux'],
  ['amrap', '🔥', 'Le plus de tours (AMRAP)', 'Un circuit à refaire le plus de fois possible dans le temps donné'],
  ['fortime', '🏁', 'Pour le temps', 'Un travail à finir le plus vite possible, avec une limite si tu veux'],
  ['intervals', '🔂', 'Intervalles et Tabata', 'Effort, pause, séries : suspensions 7 / 3, Tabata, gainage…'],
  ['countdown', '⏳', 'Compte à rebours', 'Une durée, un bip à la fin'],
  ['stopwatch', '⏲️', 'Chronomètre', 'Le temps qui passe, avec des tours'],
];
const FMT = Object.fromEntries(FORMATS.map((f) => [f[0], f]));
const T = { cfg: null, phases: [], i: 0, end: 0, start: 0, paused: 0, raf: 0, tickId: 0, wake: null, startedAt: 0, lastBeep: -1, rounds: 0, laps: [], capped: false };

const say = (t) => { if (!S.settings.voice || !window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; speechSynthesis.speak(u); } catch { /* rien */ } };
const buzz = (p) => { if (S.settings.vibration && navigator.vibrate) try { navigator.vibrate(p); } catch { /* rien */ } };
const clampInt = (v, mi, ma, def) => { const n = Math.round(Number(v)); return v === '' || v == null || !Number.isFinite(n) ? def : Math.max(mi, Math.min(ma, n)); };
/** Une ligne par exercice (vides retirées), 30 au plus. */
export const exerciseLines = (text) => String(text || '').split('\n').map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 30);

/** Liste des phases d'intervalles (pure : testée). */
export function buildPhases({ work, rest, reps, sets, setRest, prep = 5 }) {
  const out = [];
  if (prep > 0) out.push({ k: 'prep', s: prep, label: 'Prépare-toi' });
  for (let st = 0; st < sets; st++) {
    for (let r = 0; r < reps; r++) {
      out.push({ k: 'work', s: work, label: 'Effort', set: st + 1, rep: r + 1 });
      if (rest > 0 && r < reps - 1) out.push({ k: 'rest', s: rest, label: 'Pause', set: st + 1, rep: r + 1 });
    }
    if (setRest > 0 && st < sets - 1) out.push({ k: 'setrest', s: setRest, label: 'Repos', set: st + 1 });
  }
  return out;
}
/**
 * Phases de n'importe quel format (pure : testée). Une phase « up » compte vers le haut (pour le temps, chronomètre) ;
 * s = 0 pour une phase « up » : pas de limite.
 */
export function buildPlan(cfg = {}) {
  const f = FMT[cfg.format] ? cfg.format : 'intervals', prep = cfg.prep ?? 5, out = prep > 0 ? [{ k: 'prep', s: prep, label: 'Prépare-toi' }] : [], ex = cfg.exercises || [];
  if (f === 'emom') {
    const every = clampInt(cfg.every, 10, 600, 60), n = Math.max(1, Math.min(240, Math.round((clampInt(cfg.minutes, 1, 180, 10) * 60) / every)));
    for (let i = 0; i < n; i++) out.push({ k: 'work', s: every, label: ex.length ? ex[i % ex.length] : `Intervalle ${i + 1}`, rep: i + 1, of: n, emom: true });
  } else if (f === 'amrap') out.push({ k: 'work', s: clampInt(cfg.minutes, 1, 180, 12) * 60, label: 'Le plus de tours possible', amrap: true });
  else if (f === 'countdown') out.push({ k: 'work', s: Math.max(5, Math.min(5 * 3600, clampInt(cfg.seconds, 5, 5 * 3600, 300))), label: 'Compte à rebours' });
  else if (f === 'fortime') out.push({ k: 'work', s: clampInt(cfg.cap, 0, 180, 0) * 60, up: true, label: 'Pour le temps' });
  else if (f === 'stopwatch') out.push({ k: 'work', s: 0, up: true, label: 'Chronomètre' });
  else return buildPhases({ ...cfg, prep });
  return out;
}
export const totalSeconds = (phases) => phases.reduce((t, p) => t + p.s, 0);

/** Ce que fait un chrono gardé, en une ligne (pure, testée). */
export function chronoSummary(c = {}) {
  const ex = exerciseLines(c.text).length, plus = ex ? ` · ${ex} exercice${ex > 1 ? 's' : ''}` : '';
  switch (c.format) {
    case 'emom': return `Chaque ${c.every >= 60 && c.every % 60 === 0 ? (c.every === 60 ? 'minute' : `${c.every / 60} min`) : `${c.every} s`}, pendant ${c.minutes} min${plus}`;
    case 'amrap': return `Le plus de tours en ${c.minutes} min${plus}`;
    case 'fortime': return `Pour le temps${c.cap ? `, limite ${c.cap} min` : ', sans limite'}${plus}`;
    case 'countdown': return `Compte à rebours de ${mmss(Math.max(5, (c.minutes || 0) * 60 + (c.secs || 0)))}`;
    case 'stopwatch': return 'Chronomètre avec tours';
    default: return `${c.work} s d’effort / ${c.rest} s de pause × ${c.reps}${c.sets > 1 ? `, ${c.sets} séries` : ''}`;
  }
}
const myChronos = () => itemsOf('chrono').sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
/* ───────── Réglage ───────── */
/* Derniers réglages par format : propres au compte connecté (un brouillon d'exercices peut être privé). */
const saved = () => own.get('sea:timer2', {}) || {};
const DEFAULTS = { emom: { every: 60, minutes: 12, text: '' }, amrap: { minutes: 12, text: '' }, fortime: { cap: 20, text: '' }, countdown: { minutes: 5, secs: 0 }, stopwatch: {}, intervals: { ...PRESETS[0] } };
function setupBody() {
  const st = saved(), f = FMT[S.tfmt] ? S.tfmt : FMT[st.format] ? st.format : 'emom', c = { ...DEFAULTS[f], ...(st.cfgs?.[f] || {}) };
  const num = (n, l, v, mi, ma, unit) => h`<label>${l}<span class="unitbox"><input type="number" name="${n}" value="${v}" min="${mi}" max="${ma}" inputmode="numeric" required><em>${unit}</em></span></label>`;
  const list = (ph) => h`<label>Exercices <span class="tiny muted">(un par ligne, facultatif)</span><textarea name="text" rows="4" maxlength="2400" placeholder="${ph}">${c.text || ''}</textarea></label>`;
  const forms = {
    emom: h`<div class="grid2">${num('every', 'Toutes les', c.every, 10, 600, 's')}${num('minutes', 'Pendant', c.minutes, 1, 180, 'min')}</div>
      <div class="chips">${[[30, '30 s'], [60, '1 min'], [120, '2 min'], [180, '3 min']].map(([v, l]) => h`<button type="button" class="chip" data-act="timerEvery" data-v="${v}">Toutes les ${l}</button>`)}</div>
      ${list('10 squats\n8 tractions\n12 pompes')}<p class="tiny muted">Au bip, fais l’exercice de la minute, puis récupère jusqu’au bip suivant. Avec plusieurs lignes, les exercices tournent : minute 1, minute 2, minute 3… puis on recommence.</p>`,
    amrap: h`${num('minutes', 'Durée', c.minutes, 1, 180, 'min')}${list('5 tractions\n10 pompes\n15 squats')}<p class="tiny muted">Enchaîne le circuit sans t’arrêter, et touche « ＋1 tour » à chaque tour fini : ton total est gardé à la fin.</p>`,
    fortime: h`${num('cap', 'Limite de temps (0 = aucune)', c.cap, 0, 180, 'min')}${list('100 tractions assistées\n200 pompes\n300 squats')}<p class="tiny muted">Touche « ✓ Terminé » dès que tout est fait : ton temps est gardé.</p>`,
    countdown: h`<div class="grid2">${num('minutes', 'Minutes', c.minutes, 0, 300, 'min')}${num('secs', 'Secondes', c.secs, 0, 59, 's')}</div>`,
    stopwatch: h`<p class="small muted">Démarre, touche « Tour » quand tu veux noter un passage, puis « Terminé ».</p>`,
    intervals: h`<div class="chips">${PRESETS.map((p) => h`<button type="button" class="chip" data-act="timerPreset" data-id="${p.id}">${p.emoji} ${p.name}</button>`)}</div>
      <div class="grid2">${[['work', 'Effort', c.work, 1, 600, 's'], ['rest', 'Pause', c.rest, 0, 600, 's'], ['reps', 'Répétitions', c.reps, 1, 50, '×'], ['sets', 'Séries', c.sets, 1, 20, '×']].map(([n, l, v, mi, ma, u]) => num(n, l, v, mi, ma, u))}</div>
      ${num('setRest', 'Repos entre les séries', c.setRest, 0, 900, 's')}
      <p class="small muted" id="tnote">${c.note || ''}</p><div id="tsrc">${sourcesLine(c.src || [])}</div>`,
  };
  const mineList = myChronos();
  return h`<div class="itimer-setup"><h2>⏱ Chrono et minuteur</h2>
    ${mineList.length ? h`<span class="kicker">⭐ Mes chronos</span><div class="stack tight">${mineList.map((x) => h`<div class="item"><div class="grow"><b>${x.name}</b><div class="tiny muted">${chronoSummary(x)}</div></div>
      <button type="button" class="btn sm pri" data-act="timerMine" data-id="${x.id}" aria-label="Démarrer ${x.name}">▶</button><button type="button" class="btn sm ic danger" data-act="timerMineDel" data-id="${x.id}" aria-label="Retirer ${x.name} de mes chronos">✕</button></div>`)}</div>
      <span class="kicker">Ou un nouveau chrono</span>` : ''}
    <div class="setmenu">${FORMATS.map(([id, ic, t, d]) => h`<button type="button" class="setrow ${id === f ? 'on' : ''}" data-act="timerFmt" data-id="${id}" aria-pressed="${id === f}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${id === f ? '✓' : '›'}</span></button>`)}</div>
    <form data-submit="timerStart" class="stack" id="tform"><input type="hidden" name="format" value="${f}">
      <span class="kicker">${FMT[f][1]} ${FMT[f][2]}</span>${forms[f]}
      <label>Nom <span class="tiny muted">(facultatif, pour ton historique)</span><input name="name" maxlength="60" value="${c.name && f === 'intervals' ? c.name : ''}" placeholder="${FMT[f][2]}"></label>
      <label class="chk"><input type="checkbox" name="keep"> ⭐ Le garder dans « Mes chronos » <span class="tiny muted">(pour le relancer en un toucher)</span></label>
      <button class="btn pri big" type="submit">▶ Démarrer</button></form></div>`;
}
ACT.timerOpen = () => { S.tfmt = ''; openSheet(setupBody()); };
ACT.timerFmt = (el) => { if (!FMT[el.dataset.id]) return; S.tfmt = el.dataset.id; openSheet(setupBody()); };
ACT.timerEvery = (el) => { const f = $('#tform'); if (f?.elements.every) f.elements.every.value = el.dataset.v; document.querySelectorAll('.itimer-setup [data-act=timerEvery]').forEach((c) => c.classList.toggle('on', c === el)); };
ACT.timerPreset = (el) => {
  const p = PRESETS.find((x) => x.id === el.dataset.id), f = $('#tform'); if (!p || !f) return;
  for (const k of ['work', 'rest', 'reps', 'sets', 'setRest', 'name']) if (f.elements[k]) f.elements[k].value = p[k];
  $('#tnote').textContent = p.note; const ts = $('#tsrc'); if (ts) ts.innerHTML = sourcesLine(p.src || []).s || '';
  document.querySelectorAll('.itimer-setup [data-act=timerPreset]').forEach((c) => c.classList.toggle('on', c === el));
};
/** Réglages lus du formulaire (pure, testée) : bornes appliquées, exercices nettoyés. */
export function timerConfig(d) {
  const f = FMT[d.format] ? d.format : 'intervals', name = String(d.name || '').trim().slice(0, 60) || (f === 'intervals' ? 'Minuteur' : FMT[f][2]);
  const n = (k, mi, ma, def) => clampInt(d[k], mi, ma, def), exercises = exerciseLines(d.text), text = exercises.join('\n');
  if (f === 'emom') return { format: f, name, every: n('every', 10, 600, 60), minutes: n('minutes', 1, 180, 12), exercises, text };
  if (f === 'amrap') return { format: f, name, minutes: n('minutes', 1, 180, 12), exercises, text };
  if (f === 'fortime') return { format: f, name, cap: n('cap', 0, 180, 0), exercises, text };
  if (f === 'countdown') { const minutes = n('minutes', 0, 300, 5), secs = n('secs', 0, 59, 0); return { format: f, name, minutes, secs, seconds: Math.max(5, minutes * 60 + secs) }; }
  if (f === 'stopwatch') return { format: f, name };
  return { format: 'intervals', name, work: n('work', 1, 600, 7), rest: n('rest', 0, 600, 3), reps: n('reps', 1, 50, 6), sets: n('sets', 1, 20, 1), setRest: n('setRest', 0, 900, 0) };
}
SUBMIT.timerStart = (f) => {
  const d = Object.fromEntries(new FormData(f)), cfg = timerConfig(d);
  const st = saved(); own.set('sea:timer2', { format: cfg.format, cfgs: { ...(st.cfgs || {}), [cfg.format]: cfg } });
  // « Mes chronos » : même nom et même format → mis à jour, sinon ajouté (30 au plus).
  if (d.keep) {
    const same = myChronos().find((x) => x.format === cfg.format && String(x.name).toLowerCase() === cfg.name.toLowerCase());
    if (!same && myChronos().length >= 30) toast('Déjà 30 chronos gardés : retire ceux qui ne servent plus.', 4000, 'bad');
    else { const { exercises, seconds, ...keep } = cfg; putItem('chrono', same?.id || 'tm-' + uid().slice(0, 12), keep); toast(`⭐ « ${cfg.name} » gardé dans Mes chronos`); }
  }
  closeSheet(); startTimer(cfg);
};
ACT.timerMine = (el) => { const x = item('chrono', el.dataset.id); if (!x) return toast('Chrono introuvable.'); closeSheet(); startTimer(timerConfig(x)); };
ACT.timerMineDel = async (el) => { const x = item('chrono', el.dataset.id); if (!x || !(await ask(`Retirer « ${x.name} » de tes chronos ?`, { ok: 'Retirer', danger: true }))) return; delItem('chrono', x.id); openSheet(setupBody()); };

/* ───────── En cours ───────── */
export function startTimer(cfg, { onDone } = {}) {
  T.cfg = cfg; T.onDone = onDone || null; T.phases = buildPlan(cfg); T.i = 0; T.paused = 0; T.startedAt = Date.now(); T.lastBeep = -1; T.rounds = 0; T.laps = []; T.capped = false;
  let root = $('#itimer');
  if (!root) { root = document.createElement('div'); root.id = 'itimer'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Chrono'); document.body.appendChild(root); }
  document.body.classList.add('noscroll');
  try { navigator.wakeLock?.request('screen').then((w) => { T.wake = w; }).catch(() => {}); } catch { /* rien */ }
  enter(0);
  clearInterval(T.tickId); T.tickId = setInterval(tick, 200);
}
const elapsed = () => Math.max(0, (T.paused || Date.now()) - T.start);
function enter(i) {
  T.i = i; T.lastBeep = -1;
  const ph = T.phases[i]; if (!ph) return done();
  T.start = Date.now(); T.end = ph.up && !ph.s ? Infinity : T.start + ph.s * 1000;
  if (ph.k === 'work') {
    beep(1040, 220); buzz(120);
    if (ph.emom) say(`${ph.of > 1 ? `Minute ${ph.rep}. ` : ''}${ph.label}`);
    else if (ph.amrap || ph.up) say('Go');
    else say(T.cfg.reps > 1 ? `Go, ${ph.rep} sur ${T.cfg.reps}` : 'Go');
  } else if (ph.k === 'rest') { beep(520, 160); say('Pause'); }
  else if (ph.k === 'setrest') { beep(520, 300); buzz([80, 60, 80]); say(`Série ${ph.set} terminée. Repos.`); }
  draw();
}
function tick() {
  if (!T.cfg || T.paused) return;
  const ph = T.phases[T.i]; if (!ph) return;
  const el = $('#itimer .big-t'), bar = $('#itimer .ibar i');
  if (ph.up) {
    const e = elapsed(); if (el) el.textContent = mmss(Math.floor(e / 1000));
    if (bar) bar.style.width = ph.s ? `${Math.min(100, (e / (ph.s * 1000)) * 100)}%` : '0%';
    if (ph.s && e >= ph.s * 1000) { T.capped = true; enter(T.i + 1); }
    return;
  }
  const rem = Math.max(0, T.end - Date.now()), sec = Math.ceil(rem / 1000);
  if (el) el.textContent = mmss(sec);
  if (bar) bar.style.width = `${100 - (rem / (ph.s * 1000)) * 100}%`;
  if (sec <= 3 && sec > 0 && T.lastBeep !== sec && ph.s > 3) { T.lastBeep = sec; beep(660, 90); }
  if (rem <= 0) enter(T.i + 1);
}
function draw() {
  const root = $('#itimer'), ph = T.phases[T.i]; if (!root || !ph) return;
  const f = T.cfg.format || 'intervals', next = T.phases.slice(T.i + 1).find((p) => p.k === 'work');
  const left = ph.up ? 0 : totalSeconds(T.phases.slice(T.i + 1)) + Math.ceil(Math.max(0, T.end - Date.now()) / 1000);
  const shown = ph.up ? Math.floor(elapsed() / 1000) : Math.ceil(Math.max(0, T.end - Date.now()) / 1000);
  const circuit = (T.cfg.exercises || []).length && (f === 'amrap' || f === 'fortime') ? h`<ol class="it-list">${T.cfg.exercises.map((x) => h`<li>${x}</li>`)}</ol>` : '';
  const counter = f === 'amrap' && ph.k === 'work' ? h`<div class="it-count">🔁 ${T.rounds} tour${T.rounds > 1 ? 's' : ''}</div>` : f === 'stopwatch' && T.laps.length ? h`<div class="small it-next">Tours : ${T.laps.slice(-3).map((l, k, a) => `${T.laps.length - a.length + k + 1}. ${mmss(Math.round(l / 1000))}`).join(' · ')}</div>` : '';
  const actions = ph.k !== 'work' ? '' : f === 'amrap' ? h`<button class="btn big pri" data-act="timerRound">＋1 tour</button>` : f === 'fortime' ? h`<button class="btn big pri" data-act="timerFinish">✓ Terminé</button>` : f === 'stopwatch' ? h`<div class="grid2"><button class="btn big" data-act="timerLap">Tour</button><button class="btn big pri" data-act="timerFinish">■ Terminé</button></div>` : '';
  root.className = 'ph-' + ph.k + (T.paused ? ' paused' : '');
  root.innerHTML = h`<div class="it-top"><button class="btn sm" data-act="timerStop">✕ Arrêter</button><span class="small">${T.cfg.name}</span>${ph.up ? h`<span></span>` : h`<button class="btn sm" data-act="timerSkip">Passer ⏭</button>`}</div>
    <div class="it-mid"><div class="it-label">${T.paused ? 'En pause' : ph.label}</div><div class="big-t">${mmss(shown)}</div><div class="ibar"><i></i></div>
      ${ph.emom ? h`<div class="it-count">Minute ${ph.rep} / ${ph.of}</div>` : ph.set ? h`<div class="it-count">Série ${ph.set} / ${T.cfg.sets}${ph.rep ? ` · ${ph.rep} / ${T.cfg.reps}` : ''}</div>` : ''}
      ${counter}${circuit}
      ${ph.emom && next ? h`<div class="small it-next">Ensuite : ${next.label}</div>` : !ph.up ? h`<div class="small it-next">${next && ph.k !== 'work' && !next.emom ? `Ensuite : effort ${next.s} s · ` : ''}reste ${mmss(left)}</div>` : ph.s ? h`<div class="small it-next">Limite : ${mmss(ph.s)}</div>` : ''}</div>
    <div class="it-bot">${actions}<button class="btn big" data-act="timerPause">${T.paused ? '▶ Reprendre' : '⏸ Pause'}</button></div>`.s;
  tick();
}
function stop() {
  clearInterval(T.tickId); T.cfg = null; try { T.wake?.release(); } catch { /* rien */ } T.wake = null;
  $('#itimer')?.remove(); document.body.classList.remove('noscroll');
}
/** Résumé de fin, selon le format (pure, testée). */
export function timerResult(cfg, { secs = 0, rounds = 0, laps = [], capped = false } = {}) {
  const f = cfg?.format || 'intervals';
  if (f === 'amrap') return `${rounds} tour${rounds > 1 ? 's' : ''} complet${rounds > 1 ? 's' : ''} en ${cfg.minutes} min`;
  if (f === 'fortime') return capped ? `Limite de ${cfg.cap} min atteinte` : `Fait en ${mmss(secs)}`;
  if (f === 'stopwatch') return `${mmss(secs)}${laps.length ? ` · ${laps.length} tour${laps.length > 1 ? 's' : ''} : ${laps.map((l) => mmss(Math.round(l / 1000))).join(', ')}` : ''}`;
  if (f === 'emom') return `${Math.round((cfg.minutes * 60) / cfg.every)} intervalle${Math.round((cfg.minutes * 60) / cfg.every) > 1 ? 's' : ''} de ${cfg.every} s`;
  return mmss(secs);
}
function done() {
  // Pour le temps / chronomètre : le temps de l'effort (pauses retirées) ; autres formats : la durée totale.
  const cfg = T.cfg, onDone = T.onDone, up = T.phases.some((p) => p.up);
  const run = { secs: up ? Math.round(elapsed() / 1000) : Math.round((Date.now() - T.startedAt) / 1000), rounds: T.rounds, laps: [...T.laps], capped: T.capped };
  beep(1040, 400); buzz([200, 100, 200]); say('Terminé. Bien joué.');
  stop();
  if (onDone) { onDone(cfg, run.secs); return; }
  T.last = { cfg, run, total: Math.round((Date.now() - T.startedAt) / 1000) };
  openSheet(h`<div class="center stack"><div style="font-size:3rem">🎉</div><h2 style="margin:0">Terminé !</h2><p class="small"><b>${timerResult(cfg, run)}</b></p><p class="small muted">${cfg.name} · ${mmss(T.last.total)} en tout</p>
    ${S.user ? h`<button class="btn pri" data-act="timerSave">Ajouter à mon historique</button>` : ''}<button class="btn" data-act="closeSheet">Fermer</button></div>`);
}
ACT.timerSave = () => {
  const last = T.last; if (!last) return closeSheet();
  const { cfg, run, total } = last, f = cfg.format || 'intervals', result = timerResult(cfg, run);
  const exercises = (cfg.exercises || []).length ? cfg.exercises.map((name) => ({ name, group: '', sets: [{ reps: 0, seconds: 0, load: 0, done: true }] }))
    : f === 'intervals' ? [{ name: cfg.name, group: /suspens/i.test(cfg.name) ? 'doigts' : '', sets: Array.from({ length: cfg.sets * cfg.reps }, () => ({ reps: 0, seconds: cfg.work, load: 0, done: true })) }]
    : [{ name: cfg.name, group: '', sets: [{ reps: 0, seconds: run.secs, load: 0, done: true }] }];
  addHistory({ id: uid(), sessionId: '', sessionName: `Chrono : ${cfg.name}`, startedAt: Date.now() - total * 1000, durationSeconds: total, data: { rpe: 0, note: `${FMT[f]?.[2] || 'Minuteur'} — ${result}`, exercises } });
  closeSheet(); buzzOk(); toast('Ajouté à ton historique'); render();
};
ACT.timerStop = () => { stop(); toast('Chrono arrêté'); };
ACT.timerSkip = () => enter(T.i + 1);
ACT.timerRound = () => { if (!T.cfg || T.paused) return; T.rounds++; beep(880, 90); buzz(40); draw(); };
ACT.timerLap = () => { if (!T.cfg || T.paused) return; T.laps.push(elapsed()); beep(880, 90); draw(); };
ACT.timerFinish = () => { if (!T.cfg) return; if (T.paused) { T.start += Date.now() - T.paused; T.end += Date.now() - T.paused; T.paused = 0; } done(); };
ACT.timerPause = () => {
  if (!T.cfg) return;
  if (T.paused) { const d = Date.now() - T.paused; T.end += d; T.start += d; T.paused = 0; } else T.paused = Date.now();
  draw();
};
