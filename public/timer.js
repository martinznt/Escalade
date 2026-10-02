// timer.js — minuteur d'intervalles plein écran : suspensions à la poutre (7 s / 3 s), Tabata, EMOM, ou réglage libre.
// Préparation → effort → récupération → … → repos entre séries → fin. Bips, vibrations et voix (si le coach est activé).
// Le temps est calculé à partir d'horodatages : juste même si l'écran s'éteint un instant.
import { h, $, openSheet, closeSheet, toast, mmss, buzzOk } from './ui.js';
import { S, ACT, SUBMIT, addHistory, render } from './state.js';
import { uid } from './shared.js';
import { beep } from './sound.js';
import { sourcesLine } from './srcui.js';

export const PRESETS = [
  { id: 'hang73', name: 'Suspensions 7 / 3', emoji: '🫳', work: 7, rest: 3, reps: 6, sets: 4, setRest: 180, note: 'Le classique à la poutre : 7 s suspendu, 3 s de pause, 6 fois. Prise que tu tiens sans forcer au début.', src: ['medernach2015', 'lopez2012'] },
  { id: 'maxhang', name: 'Suspensions max', emoji: '💪', work: 10, rest: 0, reps: 1, sets: 5, setRest: 120, note: '10 s sur une réglette exigeante (ou avec du lest), 2 min de repos. Arrête dès que la prise se dégrade.', src: ['lopez2012', 'schoffl2006'] },
  { id: 'tabata', name: 'Tabata', emoji: '🔥', work: 20, rest: 10, reps: 8, sets: 1, setRest: 0, note: '20 s à fond, 10 s de pause, 8 fois. 4 minutes qui piquent.', src: ['tabata1996'] },
  { id: 'emom', name: 'Chaque minute (EMOM)', emoji: '⏱', work: 60, rest: 0, reps: 10, sets: 1, setRest: 0, note: 'Un bip chaque minute : fais tes répétitions, récupère le reste de la minute.' },
  { id: 'plank', name: 'Gainage 40 / 20', emoji: '🧱', work: 40, rest: 20, reps: 6, sets: 1, setRest: 0, note: 'Enchaîne planche, côtés, hollow… 40 s chacun.' },
  { id: 'comp', name: 'Compétition de bloc 4 / 4', emoji: '🏆', work: 240, rest: 240, reps: 5, sets: 1, setRest: 0, note: '4 minutes pour essayer chaque bloc, 4 minutes de repos (format des compétitions). Note tes tops et zones dans Carnet › Mode compétition.' },
];
const T = { cfg: null, phases: [], i: 0, end: 0, paused: 0, raf: 0, tickId: 0, wake: null, startedAt: 0, lastBeep: -1 };

const say = (t) => { if (!S.settings.voice || !window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; speechSynthesis.speak(u); } catch { /* rien */ } };
const buzz = (p) => { if (S.settings.vibration && navigator.vibrate) try { navigator.vibrate(p); } catch { /* rien */ } };

/** Liste des phases à enchaîner (pure : testée). */
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
export const totalSeconds = (phases) => phases.reduce((t, p) => t + p.s, 0);

ACT.timerOpen = () => {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sea:timer') || 'null'); } catch { return null; } })();
  const c = saved || PRESETS[0];
  openSheet(h`<div class="itimer-setup"><h2>⏱ Minuteur</h2>
    <div class="chips">${PRESETS.map((p) => h`<button type="button" class="chip" data-act="timerPreset" data-id="${p.id}">${p.emoji} ${p.name}</button>`)}</div>
    <form data-submit="timerStart" class="stack" id="tform">
      <div class="grid2">${[['work', 'Effort (s)', c.work, 1, 600], ['rest', 'Pause (s)', c.rest, 0, 600], ['reps', 'Répétitions', c.reps, 1, 50], ['sets', 'Séries', c.sets, 1, 20]].map(([n, l, v, mi, ma]) => h`<label>${l}<input type="number" name="${n}" value="${v}" min="${mi}" max="${ma}" inputmode="numeric" required></label>`)}</div>
      <label>Repos entre les séries (s)<input type="number" name="setRest" value="${c.setRest}" min="0" max="900" inputmode="numeric"></label>
      <input type="hidden" name="name" value="${c.name || 'Minuteur'}">
      <p class="small muted" id="tnote">${c.note || ''}</p><div id="tsrc">${sourcesLine(c.src || [])}</div>
      <button class="btn pri big" type="submit">▶ Démarrer</button></form></div>`);
};
ACT.timerPreset = (el) => {
  const p = PRESETS.find((x) => x.id === el.dataset.id), f = $('#tform'); if (!p || !f) return;
  for (const k of ['work', 'rest', 'reps', 'sets', 'setRest', 'name']) f.elements[k].value = p[k];
  $('#tnote').textContent = p.note; const ts = $('#tsrc'); if (ts) ts.innerHTML = sourcesLine(p.src || []).s || '';
  document.querySelectorAll('.itimer-setup .chip').forEach((c) => c.classList.toggle('on', c === el));
};
SUBMIT.timerStart = (f) => {
  const d = Object.fromEntries(new FormData(f)), n = (k, mi, ma, def) => Math.max(mi, Math.min(ma, Math.round(Number(d[k])) || def));
  const cfg = { name: String(d.name || 'Minuteur').slice(0, 60), work: n('work', 1, 600, 7), rest: n('rest', 0, 600, 3), reps: n('reps', 1, 50, 6), sets: n('sets', 1, 20, 1), setRest: n('setRest', 0, 900, 0) };
  try { localStorage.setItem('sea:timer', JSON.stringify(cfg)); } catch { /* rien */ }
  closeSheet(); startTimer(cfg);
};

export function startTimer(cfg, { onDone } = {}) {
  T.cfg = cfg; T.onDone = onDone || null; T.phases = buildPhases(cfg); T.i = 0; T.paused = 0; T.startedAt = Date.now(); T.lastBeep = -1;
  let root = $('#itimer');
  if (!root) { root = document.createElement('div'); root.id = 'itimer'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Minuteur'); document.body.appendChild(root); }
  document.body.classList.add('noscroll');
  try { navigator.wakeLock?.request('screen').then((w) => { T.wake = w; }).catch(() => {}); } catch { /* rien */ }
  enter(0);
  clearInterval(T.tickId); T.tickId = setInterval(tick, 200);
}
function enter(i) {
  T.i = i; T.lastBeep = -1;
  const ph = T.phases[i]; if (!ph) return done();
  T.end = Date.now() + ph.s * 1000;
  if (ph.k === 'work') { beep(1040, 220); buzz(120); say(T.cfg.reps > 1 ? `Go, ${ph.rep} sur ${T.cfg.reps}` : 'Go'); }
  else if (ph.k === 'rest') { beep(520, 160); say('Pause'); }
  else if (ph.k === 'setrest') { beep(520, 300); buzz([80, 60, 80]); say(`Série ${ph.set} terminée. Repos.`); }
  draw();
}
function tick() {
  if (!T.cfg || T.paused) return;
  const rem = Math.max(0, T.end - Date.now()), sec = Math.ceil(rem / 1000);
  const el = $('#itimer .big-t'); if (el) el.textContent = mmss(sec);
  const bar = $('#itimer .ibar i'), ph = T.phases[T.i]; if (bar && ph) bar.style.width = `${100 - (rem / (ph.s * 1000)) * 100}%`;
  if (sec <= 3 && sec > 0 && T.lastBeep !== sec && ph?.s > 3) { T.lastBeep = sec; beep(660, 90); }
  if (rem <= 0) enter(T.i + 1);
}
function draw() {
  const root = $('#itimer'), ph = T.phases[T.i]; if (!root || !ph) return;
  const next = T.phases.slice(T.i + 1).find((p) => p.k === 'work');
  const left = totalSeconds(T.phases.slice(T.i + 1)) + Math.ceil(Math.max(0, T.end - Date.now()) / 1000);
  root.className = 'ph-' + ph.k + (T.paused ? ' paused' : '');
  root.innerHTML = h`<div class="it-top"><button class="btn sm" data-act="timerStop">✕ Arrêter</button><span class="small">${T.cfg.name}</span><button class="btn sm" data-act="timerSkip">Passer ⏭</button></div>
    <div class="it-mid"><div class="it-label">${T.paused ? 'En pause' : ph.label}</div><div class="big-t">${mmss(Math.ceil(Math.max(0, T.end - Date.now()) / 1000))}</div><div class="ibar"><i></i></div>
      ${ph.set ? h`<div class="it-count">Série ${ph.set} / ${T.cfg.sets}${ph.rep ? ` · ${ph.rep} / ${T.cfg.reps}` : ''}</div>` : ''}
      <div class="small it-next">${next && ph.k !== 'work' ? `Ensuite : effort ${next.s} s · ` : ''}reste ${mmss(left)}</div></div>
    <div class="it-bot"><button class="btn big" data-act="timerPause">${T.paused ? '▶ Reprendre' : '⏸ Pause'}</button></div>`.s;
  tick();
}
function stop() {
  clearInterval(T.tickId); T.cfg = null; try { T.wake?.release(); } catch { /* rien */ } T.wake = null;
  $('#itimer')?.remove(); document.body.classList.remove('noscroll');
}
function done() {
  const cfg = T.cfg, secs = Math.round((Date.now() - T.startedAt) / 1000), onDone = T.onDone;
  beep(1040, 400); buzz([200, 100, 200]); say('Terminé. Bien joué.');
  stop();
  if (onDone) { onDone(cfg, secs); return; }
  openSheet(h`<div class="center stack"><div style="font-size:3rem">🎉</div><h2 style="margin:0">Terminé !</h2><p class="small muted">${cfg.name} · ${mmss(secs)}</p>
    ${S.user ? h`<button class="btn pri" data-act="timerSave" data-s="${secs}">Ajouter à mon historique</button>` : ''}<button class="btn" data-act="closeSheet">Fermer</button></div>`);
  T.last = cfg;
}
ACT.timerSave = (el) => {
  const cfg = T.last; if (!cfg) return closeSheet();
  const secs = Number(el.dataset.s) || 0, sets = Array.from({ length: cfg.sets * cfg.reps }, () => ({ reps: 0, seconds: cfg.work, load: 0, done: true }));
  addHistory({ id: uid(), sessionId: '', sessionName: `Minuteur : ${cfg.name}`, startedAt: Date.now() - secs * 1000, durationSeconds: secs, data: { rpe: 0, note: '', exercises: [{ name: cfg.name, group: /suspens/i.test(cfg.name) ? 'doigts' : '', sets }] } });
  closeSheet(); buzzOk(); toast('Ajouté à ton historique'); render();
};
ACT.timerStop = () => { stop(); toast('Minuteur arrêté'); };
ACT.timerSkip = () => enter(T.i + 1);
ACT.timerPause = () => {
  if (!T.cfg) return;
  if (T.paused) { T.end += Date.now() - T.paused; T.paused = 0; } else T.paused = Date.now();
  draw();
};
