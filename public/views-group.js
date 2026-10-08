// views-group.js — « 👥 Séance à plusieurs » : un salon avec un code (ou un QR), autant de personnes qu'on veut
// (30 au plus), un organisateur qui règle (format, matériel disponible, intervalles) et lance pour tout le monde.
// Chaque téléphone calcule le même déroulé (group.js) et montre à chacun ce qu'IL fait : travailler, récupérer
// pendant que les autres travaillent, ou changer d'atelier. Les chronos avancent ensemble sans attendre le réseau ;
// seul l'organisateur met en pause, passe une étape ou termine.
import { h, raw, openSheet, closeSheet, toast, seg, ask } from './ui.js';
import { S, ACT, SUBMIT, CHG, api, getSeance, addHistory } from './state.js';
import { CATALOG, buildSession } from './catalog.js';
import { EQUIPMENT } from './model.js';
import { byId } from './library.js';
import { uid } from './shared.js';
import { qrSvg, shareUrl, clearPending } from './share.js';
import { beep } from './sound.js';
import { FORMATS, groupPlan, personSummary, intervalOf, capacity, cleanConfig, GROUP_MAX } from './group.js';

const POLL = 1500;
let pollT = null, tickT = null, pushT = null;
const G = () => S.group;
const now = () => Date.now() + (G()?.offset || 0); // heure du serveur
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`; };
const ROLE = { work: ['💪', 'À toi'], rest: ['🌬️', 'Récupère'], change: ['🔄', 'Change'] };

function root() { let r = document.getElementById('grp'); if (!r) { r = document.createElement('div'); r.id = 'grp'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'Séance à plusieurs'); document.body.appendChild(r); } return r; }
function closeView() { clearInterval(pollT); clearInterval(tickT); document.getElementById('grp')?.remove(); document.body.classList.remove('grp-open'); S.group = null; }
function plan(g = G()) { const roster = g.state?.roster?.length ? g.state.roster : g.members; const key = JSON.stringify([roster, g.config]); if (g._pk !== key) { g._pk = key; g._plan = groupPlan(g.session, roster, g.config); } return g._plan; }

/* ───────── Créer, rejoindre ───────── */
async function create(session, config = {}) {
  if (S.user?.guest) return toast('La séance à plusieurs demande un compte (gratuit).');
  try {
    const t0 = Date.now(), r = await api('POST', '/api/group', { session, config });
    closeSheet(); await enter(r.code, t0, r.now);
  } catch (e) { toast(e.offline ? 'Connexion requise pour la séance à plusieurs.' : e.message, 4500, 'bad'); }
}
async function enter(code, t0, serverNow) {
  const r = await api('GET', `/api/group/${code}?full=1`);
  S.group = { code, offset: serverNow ? serverNow - (t0 + Date.now()) / 2 : r.now - Date.now(), ...r, lastStep: -1 };
  document.body.classList.add('grp-open'); draw();
  clearInterval(pollT); pollT = setInterval(poll, POLL); clearInterval(tickT); tickT = setInterval(tick, 250);
}
ACT.groupNew = (el) => {
  const src = el.dataset.src || 'seance', id = el.dataset.id;
  const s = src === 'cat' ? (() => { const e = CATALOG.find((x) => x.id === id); return e ? buildSession(e) : null; })() : getSeance(id);
  if (!s?.exercises?.length) return toast('Séance vide ou introuvable.');
  create(s);
};
/** Chrono à plusieurs : un intervalle (ex. 7 s / 3 s) partagé, avec le matériel disponible. */
ACT.groupTimer = () => openSheet(h`<form class="stack" data-submit="groupTimer"><h2 style="margin:0">⏱ Chrono à plusieurs</h2>
  <p class="small">Un même chrono pour tout le groupe. S’il n’y a pas assez de matériel pour tout le monde, l’app fait passer chacun à son tour et allonge les pauses en conséquence.</p>
  <div class="grid3"><label>Effort<span class="unitbox"><input type="number" name="on" min="1" max="600" value="7" required><em>s</em></span></label><label>Pause<span class="unitbox"><input type="number" name="off" min="0" max="600" value="3" required><em>s</em></span></label><label>Répétitions<input type="number" name="reps" min="1" max="100" value="6" required></label></div>
  <div class="grid2"><label>Séries<input type="number" name="sets" min="1" max="20" value="3" required></label><label>Repos entre séries<span class="unitbox"><input type="number" name="rest" min="0" max="900" value="120" required><em>s</em></span></label></div>
  <label>Sur quel matériel ?<select name="eq"><option value="">Aucun (au sol, tout le monde ensemble)</option>${['hangboard', 'bar', 'rings', 'campus', 'wall', 'weights', 'kettlebell', 'rower', 'bike'].filter((k) => EQUIPMENT[k]).map((k) => h`<option value="${k}" ${k === 'hangboard' ? 'selected' : ''}>${EQUIPMENT[k]}</option>`)}</select></label>
  <label>Combien en avez-vous ?<input type="number" name="n" min="1" max="50" value="1"></label>
  <button class="btn pri big">Créer et montrer le code</button></form>`);
SUBMIT.groupTimer = (f) => {
  const d = Object.fromEntries(new FormData(f)), on = Number(d.on) || 7, off = Number(d.off) || 0, reps = Number(d.reps) || 1, eq = EQUIPMENT[d.eq] ? d.eq : '';
  const session = { id: uid(), name: `Chrono à plusieurs ${on}/${off}`, emoji: '⏱', activity: 'conditioning', exercises: [{ id: uid(), name: `Intervalles ${on} s / ${off} s`, emoji: '⏱', block: 'main', mode: 'time', secMin: (on + off) * reps, secMax: (on + off) * reps, sets: Number(d.sets) || 1, rest: Number(d.rest) || 0, needs: eq ? [eq] : [] }] };
  create(session, { intervals: { 0: { on, off, reps } }, equip: eq ? { [eq]: Number(d.n) || 1 } : {} });
};
export async function groupJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return toast('Le code fait 6 caractères.');
  if (S.user?.guest) return toast('La séance à plusieurs demande un compte (gratuit).');
  try { const t0 = Date.now(), r = await api('POST', `/api/group/${code}/join`); clearPending(); closeSheet(); await enter(code, t0, r.now); toast(`Bienvenue ! ${r.hostName} organise.`); }
  catch (e) {
    if (e.status === 404 && ACT.duoJoinLink) return ACT.duoJoinLink({ dataset: { code } }); // ancien code « séance à deux »
    toast(e.offline ? 'Connexion requise.' : e.message, 4500, 'bad');
  }
}
ACT.groupJoinAsk = () => openSheet(h`<form class="sharesheet center" data-submit="groupJoin"><h2>👥 Rejoindre une séance à plusieurs</h2>
  <p class="small">Tape le code affiché sur le téléphone de l’organisateur (ou scanne son QR code).</p>
  <input name="code" class="duocode in" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="Code" required>
  <button class="btn pri big">Rejoindre</button></form>`);
SUBMIT.groupJoin = (f) => groupJoin(new FormData(f).get('code'));
ACT.groupJoinLink = (el) => groupJoin(el.dataset.code);
/** Le menu « séance à plusieurs » : créer depuis une séance, chrono partagé, rejoindre. */
ACT.groupMenu = () => openSheet(h`<div class="stack"><h2 style="margin:0">👥 Séance à plusieurs</h2>
  <p class="small">Autant de personnes que vous voulez (jusqu’à ${GROUP_MAX}). Un code à partager, l’organisateur règle le matériel et le format, puis lance pour tout le monde : chacun voit sur son téléphone ce qu’il fait.</p>
  <div class="setmenu">${[['groupJoinAsk', '🔢', 'Rejoindre avec un code', 'Quelqu’un t’a donné un code ou un QR code.'], ['groupTimer', '⏱', 'Chrono à plusieurs', 'Un intervalle (ex. 7 s / 3 s) partagé, même sur une seule poutre.'], ['groupPick', '📋', 'Une de mes séances, à plusieurs', 'Choisis la séance : tu deviens l’organisateur.']]
    .map(([a, ic, t, d]) => h`<button class="setrow" data-act="${a}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">›</span></button>`)}</div>
  <p class="tiny muted">Depuis n’importe quelle séance (Mes séances, le carnet), le bouton « 👥 À plusieurs » fait la même chose.</p></div>`);
ACT.groupPick = () => { const l = S.seances.items.filter((s) => !s.archived && s.exercises.length); if (!l.length) return toast('Crée ou garde d’abord une séance (le carnet en a plein).');
  openSheet(h`<div class="stack"><h2 style="margin:0">Quelle séance ?</h2><div class="setmenu">${l.slice(0, 40).map((s) => h`<button class="setrow" data-act="groupNew" data-id="${s.id}"><span class="sic">${s.emoji || '🏋️'}</span><span class="grow"><b>${s.name}</b></span><span class="chev">›</span></button>`)}</div></div>`); };
export const groupButton = (id, src = 'seance', cls = 'btn sm') => h`<button class="${cls}" data-act="groupNew" data-id="${id}" data-src="${src}" aria-label="Faire cette séance à plusieurs : un code à partager, chronos communs">👥 À plusieurs</button>`;

/* ───────── Synchronisation ───────── */
async function poll() {
  const g = G(); if (!g || g.busy || document.hidden) return;
  g.busy = true; const t0 = Date.now();
  try {
    const r = await api('GET', `/api/group/${g.code}`, undefined, { timeout: 6000 }); if (G() !== g) return;
    g.offset = g.offset * 0.7 + (r.now - (t0 + Date.now()) / 2) * 0.3; g.lost = false;
    const before = g.members.length;
    if (r.v !== g.v) { const hostOwnsState = g.host; Object.assign(g, { v: r.v, members: r.members, ...(hostOwnsState ? {} : { state: r.state, config: r.config }) }); if (r.members.length > before) toast(`${r.members.at(-1)} a rejoint`); draw(); }
  } catch (e) {
    if (G() !== g) return;
    if (e.status === 404 || e.status === 403) { toast('La séance à plusieurs est terminée.'); closeView(); return; }
    if (!g.lost) { g.lost = true; draw(); }
  } finally { if (G() === g) g.busy = false; }
}
function pushState(extra = {}) {
  const g = G(); if (!g?.host) return;
  clearTimeout(pushT); pushT = setTimeout(async () => { try { const r = await api('PUT', `/api/group/${g.code}`, { state: g.state, config: g.config, ...extra }); g.v = r.v; } catch (e) { toast(e.offline ? 'Hors ligne : les autres ne reçoivent plus les changements.' : e.message, 3000, 'bad'); } }, 250);
}
/** Étape en cours, calculée par chaque téléphone à partir de l'étape et de l'heure de fin partagées. */
function current(g = G()) {
  const p = plan(g), st = g.state || {};
  if (st.phase !== 'run' || !p.steps.length) return null;
  let i = st.step || 0, end = st.end || 0;
  if (st.paused) return { i, left: (st.remaining || 0) / 1000, step: p.steps[i], paused: true };
  while (i < p.steps.length && end && now() >= end) { i++; end += (p.steps[i]?.dur || 0) * 1000; }
  if (i >= p.steps.length) return { i, done: true };
  return { i, left: (end - now()) / 1000, step: p.steps[i], end };
}
function tick() {
  const g = G(); if (!g || g.state?.phase !== 'run') return;
  const c = current(g);
  if (c?.done) { if (g.host && g.state.phase !== 'done') { g.state = { ...g.state, phase: 'done' }; pushState(); } g.state = { ...g.state, phase: 'done' }; return draw(); }
  if (!c) return;
  if (c.i !== g.lastStep) { g.lastStep = c.i; const a = c.step.as[g.me]; if (a?.role === 'work') { beep(880, 180); navigator.vibrate?.(150); } else beep(520, 120); draw(); return; }
  const t = document.getElementById('grpT'); if (t) t.textContent = fmt(c.left);
  if (!c.paused && c.left <= 3.05 && c.left > 0 && Math.ceil(c.left) !== g.lastBeep) { g.lastBeep = Math.ceil(c.left); beep(660, 60); }
}

/* ───────── Organisateur : réglages, lancement, pilotage ───────── */
ACT.grpFormat = (el) => { const g = G(); if (!g?.host) return; g.config = cleanConfig({ ...g.config, format: el.dataset.id }); pushState(); draw(); };
ACT.grpEq = (el) => { const g = G(); if (!g?.host) return; const k = el.dataset.k, cur = g.config.equip?.[k] ?? g.members.length; g.config = cleanConfig({ ...g.config, equip: { ...g.config.equip, [k]: Math.max(0, cur + Number(el.dataset.d)) } }); pushState(); draw(); };
CHG.grpNum = (el) => { const g = G(); if (!g?.host) return; g.config = cleanConfig({ ...g.config, [el.dataset.k]: Number(el.value) }); pushState(); draw(); };
CHG.grpIv = (el) => { const g = G(); if (!g?.host) return; const i = el.dataset.i, cur = intervalOf(g.session.exercises[i], i, g.config) || { on: 7, off: 3, reps: 6 }; g.config = cleanConfig({ ...g.config, intervals: { ...g.config.intervals, [i]: { ...cur, [el.dataset.k]: Number(el.value) } } }); pushState(); draw(); };
ACT.grpStart = async () => {
  const g = G(); if (!g?.host) return;
  if (g.members.length < 2 && !(await ask('Personne n’a encore rejoint. Lancer quand même ?', { ok: 'Lancer' }))) return;
  const p = groupPlan(g.session, g.members, g.config); if (!p.steps.length) return toast('Rien à faire avec ce matériel.');
  g.state = { phase: 'run', step: 0, end: now() + p.steps[0].dur * 1000 + 3000, paused: false, remaining: 0, roster: [...g.members], startedAt: now() };
  g.lastStep = -1; pushState(); draw(); toast('C’est parti pour tout le monde !');
};
ACT.grpPause = () => { const g = G(), c = current(g); if (!g?.host || !c || c.done) return;
  g.state = c.paused ? { ...g.state, step: c.i, paused: false, end: now() + c.left * 1000 } : { ...g.state, step: c.i, paused: true, remaining: Math.round(c.left * 1000) }; pushState(); draw(); };
ACT.grpNext = () => { const g = G(), c = current(g), p = plan(g); if (!g?.host || !c || c.done) return; const i = c.i + 1;
  g.state = i >= p.steps.length ? { ...g.state, phase: 'done' } : { ...g.state, step: i, paused: false, end: now() + p.steps[i].dur * 1000 }; pushState(); draw(); };
ACT.grpStop = async () => { const g = G(); if (!g) return; if (!(await ask(g.host ? 'Terminer la séance pour tout le monde ?' : 'Quitter la séance ?', { ok: g.host ? 'Terminer' : 'Quitter', danger: true }))) return;
  try { await api('DELETE', `/api/group/${g.code}`); } catch { /* le salon expire seul */ } closeView(); };
ACT.grpSave = () => {
  const g = G(), p = plan(g), mine = personSummary(p, g.me, g.session); if (!mine.exercises.length) return toast('Rien à enregistrer pour toi.');
  addHistory({ id: uid(), sessionId: g.session.id || '', sessionName: `${g.session.name} (à plusieurs)`, startedAt: Math.round((g.state.startedAt || Date.now()) - (g.offset || 0)), durationSeconds: mine.work + mine.rest,
    data: { activity: g.session.activity || '', note: `Séance à plusieurs avec ${(g.state.roster || g.members).filter((n) => n !== g.me).join(', ')}`, exercises: mine.exercises.map(({ ex, n }) => ({ name: ex.name, libId: ex.libId, prim: byId(ex.libId)?.prim || [], sec: byId(ex.libId)?.sec || [], caps: byId(ex.libId)?.caps || {}, sets: Array.from({ length: n }, () => ({ done: true })) })) } });
  toast('Enregistrée dans ton historique'); g.saved = true; draw();
};
ACT.grpClose = () => closeView();
ACT.grpShare = () => { const g = G(); if (navigator.share) navigator.share({ title: 'Séance à plusieurs', text: `Rejoins ma séance : code ${g.code}`, url: shareUrl('group', g.code) }).catch(() => {}); else { navigator.clipboard?.writeText(shareUrl('group', g.code)); toast('Lien copié'); } };

/* ───────── Affichage ───────── */
function draw() {
  const g = G(); if (!g) return;
  const r = root(), ph = g.state?.phase || 'lobby';
  r.innerHTML = (ph === 'lobby' ? lobby(g) : ph === 'done' ? doneView(g) : runView(g)).s;
}
function lobby(g) {
  const p = plan(g), needs = [...new Set(g.session.exercises.flatMap((e) => (e.needs?.length ? e.needs : byId(e.libId)?.needs || [])))], cfg = cleanConfig(g.config);
  const timed = g.session.exercises.map((e, i) => [e, i]).filter(([e]) => e.mode === 'time' && (e.block || 'main') === 'main');
  const me = (n) => personSummary(p, n, g.session);
  return h`<div class="grpwrap"><div class="row between"><b>👥 Séance à plusieurs</b><button class="btn sm ghost" data-act="grpStop">${g.host ? 'Annuler' : 'Quitter'}</button></div>
    <h2 style="margin:0">${g.session.emoji || ''} ${g.session.name}</h2>
    <div class="grpcode"><div class="qrbox sm">${raw(qrSvg(shareUrl('group', g.code)))}</div><div><span class="tiny muted">Code à donner</span><div class="duocode">${g.code}</div><button class="btn sm" data-act="grpShare">📤 Envoyer le lien</button></div></div>
    <p class="small">👤 Organisateur : <b>${g.hostName}</b>${g.host ? ' (toi)' : ''} · ${g.members.length} personne${g.members.length > 1 ? 's' : ''} : ${g.members.join(', ')}</p>
    ${g.host ? h`<div class="card flat stack"><b class="small">Comment vous vous organisez ?</b>${seg('grpFormat', cfg.format, Object.entries(FORMATS).map(([k, [l]]) => [k, l]))}<p class="tiny muted">${FORMATS[cfg.format][1]}</p>
      ${cfg.format === 'waves' ? h`<label class="small">Personnes par vague <span class="tiny muted">(0 = la moitié du groupe)</span><input type="number" min="0" max="${GROUP_MAX}" value="${cfg.waveSize}" data-change="grpNum" data-k="waveSize"></label>` : ''}
      ${cfg.format === 'stations' ? h`<div class="grid2"><label class="small">Temps par atelier<span class="unitbox"><input type="number" min="15" max="600" value="${cfg.stationSec}" data-change="grpNum" data-k="stationSec"><em>s</em></span></label><label class="small">Tours complets<input type="number" min="1" max="10" value="${cfg.rounds}" data-change="grpNum" data-k="rounds"></label></div>` : ''}</div>
    ${needs.length ? h`<div class="card flat stack"><b class="small">🧰 Matériel disponible</b><p class="tiny muted">Combien de chaque ? L’app ne met jamais plus de personnes en même temps que de matériel.</p>
      ${needs.map((k) => { const n = cfg.equip[k] ?? g.members.length; return h`<div class="row between eqrow"><span class="small">${EQUIPMENT[k] || k}</span><span class="row tight"><button class="btn sm ic" data-act="grpEq" data-k="${k}" data-d="-1" aria-label="Un de moins">−</button><b class="eqn">${cfg.equip[k] == null ? `${n} (assez)` : n}</b><button class="btn sm ic" data-act="grpEq" data-k="${k}" data-d="1" aria-label="Un de plus">＋</button></span></div>`; })}</div>` : ''}
    ${timed.length ? h`<div class="card flat stack"><b class="small">⏱ Chronos par intervalles</b><p class="tiny muted">Effort / pause × répétitions. À plusieurs sur un même matériel, la pause réelle s’allonge pendant que les autres travaillent.</p>
      ${timed.map(([e, i]) => { const iv = intervalOf(e, i, cfg); return h`<div class="ivrow"><span class="small grow">${e.name}</span>${iv ? h`<label class="tiny">Effort<input type="number" min="1" max="600" value="${iv.on}" data-change="grpIv" data-i="${i}" data-k="on"></label><label class="tiny">Pause<input type="number" min="0" max="600" value="${iv.off}" data-change="grpIv" data-i="${i}" data-k="off"></label><label class="tiny">× <input type="number" min="1" max="100" value="${iv.reps}" data-change="grpIv" data-i="${i}" data-k="reps"></label>` : h`<button class="btn sm" data-act="grpIvOn" data-i="${i}">En intervalles</button>`}</div>`; })}</div>` : ''}` : h`<p class="small acc-t">⏳ En attente : ${g.hostName} règle le matériel et lance la séance pour tout le monde.</p>`}
    <div class="card flat stack"><b class="small">📋 Le déroulé prévu : ${Math.round(p.total / 60)} min · ${FORMATS[cfg.format][0]}</b>${p.notes.length ? h`<ul class="clean tight tiny">${p.notes.map((n) => h`<li>${n}</li>`)}</ul>` : ''}
      <div class="tiny">${g.members.map((n) => { const s = me(n); return h`<div>${n} : ${Math.round(s.work / 60)} min d’effort, ${Math.round(s.rest / 60)} min de récupération</div>`; })}</div></div>
    ${g.lost ? h`<p class="tiny warn-t">Connexion perdue : on réessaie…</p>` : ''}
    ${g.host ? h`<button class="btn pri big" data-act="grpStart">▶ Lancer pour tout le monde</button>` : ''}</div>`;
}
ACT.grpIvOn = (el) => { const g = G(); if (!g?.host) return; const i = el.dataset.i, e = g.session.exercises[i]; g.config = cleanConfig({ ...g.config, intervals: { ...g.config.intervals, [i]: { on: 7, off: 3, reps: Math.max(1, Math.round((e.secMin || 60) / 10)) } } }); pushState(); draw(); };
function runView(g) {
  const c = current(g), p = plan(g); if (!c || c.done) return doneView(g);
  const st = c.step, a = st.as[g.me] || { role: 'rest', what: 'tu regardes' }, [ic, word] = ROLE[a.role] || ROLE.rest;
  const ex = a.ex >= 0 ? g.session.exercises[a.ex] : null, nx = p.steps[c.i + 1], na = nx?.as[g.me];
  const cue = ex && a.role === 'work' ? (ex.ok?.[0] || ex.cues?.[0] || byId(ex.libId)?.cues?.[0] || '') : '';
  const others = Object.entries(st.as).filter(([n]) => n !== g.me);
  return h`<div class="grpwrap run ${a.role}"><div class="row between"><span class="tiny">👥 ${g.code} · étape ${c.i + 1}/${p.steps.length}</span><button class="btn sm ghost" data-act="grpStop">${g.host ? '⏹ Terminer' : 'Quitter'}</button></div>
    <div class="grprole">${ic} ${word}</div>
    <div class="grpex">${a.role === 'work' && ex ? ex.name : a.what}</div>
    <div class="grptime" id="grpT" aria-live="off">${fmt(c.left)}</div>
    <div class="small">${st.sets ? `Série ${st.set}/${st.sets}` : ''}${st.reps ? ` · répétition ${st.rep}/${st.reps}` : ''}${a.role === 'work' ? ` · ${a.what}` : ''}${c.paused ? ' · ⏸ en pause' : ''}</div>
    ${cue ? h`<p class="small muted">${cue}</p>` : ''}
    ${others.length ? h`<div class="grpothers tiny">${others.slice(0, 12).map(([n, x]) => h`<span class="${x.role}">${n} : ${x.role === 'work' ? (x.ex >= 0 ? g.session.exercises[x.ex]?.name : 'effort') : x.role === 'change' ? 'change' : 'récup'}</span>`)}${others.length > 12 ? h`<span>+${others.length - 12}</span>` : ''}</div>` : ''}
    ${na ? h`<p class="small">Ensuite : ${na.role === 'work' ? `💪 ${na.ex >= 0 ? g.session.exercises[na.ex]?.name : nx.title}` : na.role === 'change' ? '🔄 changement' : '🌬️ récupération'}</p>` : ''}
    ${g.host ? h`<div class="grid2"><button class="btn big" data-act="grpPause">${c.paused ? '▶ Reprendre' : '⏸ Pause'}</button><button class="btn big" data-act="grpNext">⏭ Étape suivante</button></div><p class="tiny muted">Tu es l’organisateur : la pause et le passage d’étape s’appliquent à tout le monde.</p>` : h`<p class="tiny muted">Les chronos sont communs : ${g.hostName} met en pause ou passe une étape pour tout le monde.</p>`}
    ${g.lost ? h`<p class="tiny warn-t">Connexion perdue : le chrono continue, on réessaie…</p>` : ''}</div>`;
}
function doneView(g) {
  const p = plan(g), mine = personSummary(p, g.me, g.session);
  return h`<div class="grpwrap"><h2>🎉 Séance terminée</h2><p class="small">Toi : ${Math.round(mine.work / 60)} min d’effort, ${Math.round(mine.rest / 60)} min de récupération, ${mine.exercises.length} exercice${mine.exercises.length > 1 ? 's' : ''}.</p>
    ${g.saved ? h`<p class="small ok-t">✓ Dans ton historique.</p>` : h`<button class="btn pri big" data-act="grpSave">💾 Enregistrer dans mon historique</button>`}
    <button class="btn" data-act="${g.host ? 'grpStop' : 'grpClose'}">Fermer</button></div>`;
}
export { draw as groupRedraw };
