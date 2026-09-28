// views-climbplan.js — « Structurer ma séance d'escalade » : par objectif de fin de séance, ou partie par partie.
import { h, raw, chip, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, CHG, INPUT, ctx, render, go, saveSeance, ls } from './state.js';
import { sortedLevels } from './grading.js';
import { INTENSITY, CLIMB_PARTS, STRUCTURES, STRUCT_TIPS, STRUCT_WHEN, proposals, partRange, pickSystem, knownMax, priorLoad, adaptPart, buildFromParts, goalParts, goalAdvice, partLabel } from './climbplan.js';
import { partOptions, orderAdvice, poolFor, PART_NOTES, POOLS } from './guide.js';
import { availableEquipment } from './brain.js';
import { CAPACITIES } from './model.js';
import { exerciseSheet } from './views-library.js';
import { byId } from './library.js';
import { startPlayer } from './player.js';
import { surprise, surpriseClimbParts, AIMS } from './surprise.js';
import { ACTIVITIES } from './model.js';
import { sessionMinutes } from './engine.js';

const KEY = 'sea:climbplan';
const DEFAULT_PARTS = [
  { type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 90, styles: [] },
  { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30, styles: [] }, { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40, styles: [], adapt: true },
  { type: 'cool', minutes: 10 },
];
const CP = () => (S.cp ||= { mode: 'goal', kind: 'bloc', envId: '', sys: {}, target: null, styles: [], minutes: 120, parts: DEFAULT_PARTS.map((p) => ({ ...p })), result: null, ...(ls.get(KEY, {}) || {}), result: null, reasons: [] });
const keep = () => { const { result, reasons, aimDone, built, bopts, ...rest } = CP(); ls.set(KEY, rest); };
const climbStyles = () => Object.values(ctx().styles || {}).filter((s) => !s.archived && (s.activity === 'climbing' || !s.activity));
const systemsFor = (kind) => Object.values(ctx().systems || {}).filter((s) => s.activity === kind && s.levels?.length);
const sysOf = (kind) => { const c = CP(), all = ctx().systems || {}; return all[c.sys?.[kind]] || pickSystem(ctx(), kind, c.envId); };
const levelsOf = (kind) => sortedLevels(sysOf(kind));
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);
const partTitle = (p) => (p.type === 'climb' ? `${p.kind === 'voie' ? '🧗 Voie' : '🪨 Bloc'} ${INTENSITY[p.intensity]?.[1].toLowerCase() || ''}` : `${CLIMB_PARTS[p.type]?.[0]} ${CLIMB_PARTS[p.type]?.[1]}`);

function sysSelect(kind) {
  const cur = sysOf(kind);
  return h`<label>Cotation ${kind === 'voie' ? 'voie' : 'bloc'}<select data-change="cpSys" data-k="${kind}">${systemsFor(kind).map((s) => h`<option value="${s.id}" ${cur?.id === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>`;
}
export function vClimbPlan() {
  const c = CP(), x = ctx();
  const mode = h`<div class="setmenu">${[['goal', '🎯', 'J’ai un objectif de fin de séance', 'Ex. « à la fin, avoir réussi un U8 en dévers-réglettes » : l’app construit tout.'], ['parts', '🧩', 'Je structure moi-même', 'Tes parties, leur durée, bloc ou voie, l’intensité, les cotations et les styles.'], ['surprise', '🎲', 'Surprends-moi', 'Donne juste ce que tu veux (ou rien) : quelque chose de nouveau, ou qui te fait progresser.']]
    .map(([k, ic, t, d]) => h`<button class="setrow" data-act="cpMode" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${c.mode === k ? '✓' : ''}</span></button>`)}</div>`;
  const HELP = { auto: ['🤖', 'L’app choisit tout', 'Une séance complète ; ensuite tu peux changer le temps et les exercices de chaque partie.'], guide: ['🧭', 'L’app me guide', 'Pour chaque partie, plusieurs exercices expliqués et l’ordre conseillé : tu choisis.'], free: ['✋', 'Je compose moi-même', 'Tes parties, tes exercices, dans tout le catalogue. Rien d’imposé.'] };
  const help = h`<span class="kicker">Comment veux-tu la créer ?</span><div class="chips">${Object.entries(HELP).map(([k, [e, l]]) => chip((c.help || 'auto') === k, `${e} ${l}`, `data-act="cpHelp" data-id="${k}"`))}</div><p class="tiny muted">${HELP[c.help || 'auto'][2]}</p>`;
  const place = h`<label>Lieu<select data-change="cpEnv"><option value="">${x.defEnv ? 'Par défaut : ' + x.defEnv.name : '—'}</option>${x.envs.map((e) => h`<option value="${e.id}" ${c.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label>`;
  const free = c.help === 'free';
  return h`<div class="card">${help}</div>${free ? '' : h`<span class="kicker">Point de départ</span>${mode}`}<div class="card">${place}</div>${free ? vParts() : c.mode === 'goal' ? vGoal() : c.mode === 'surprise' ? vSurprise() : vParts()}${c.result ? vResult() : ''}`;
}
function vGoal() {
  const c = CP(), levels = levelsOf(c.kind), sys = sysOf(c.kind), max = sys ? knownMax(ctx(), sys, c.kind) : null;
  const t = c.target != null && c.target < levels.length ? c.target : Math.min(levels.length - 1, (max ?? Math.round(levels.length * 0.6)) + (levels.length > 10 ? 2 : 1));
  const advice = goalAdvice(t, max, levels);
  return h`<div class="card stack">
    <span class="kicker">Bloc ou voie</span><div class="chips">${[['bloc', '🪨 Bloc'], ['voie', '🧗 Voie']].map(([k, l]) => chip(c.kind === k, l, `data-act="cpKind" data-id="${k}"`))}</div>
    ${sysSelect(c.kind)}
    <span class="kicker">À la fin, je veux avoir réussi</span>
    ${levels.length <= 16 ? h`<div class="chips">${levels.map((l, i) => chip(i === t, l.label, `data-act="cpTarget" data-id="${i}"`))}</div>`
      : h`<select data-change="cpTargetSel">${levels.map((l, i) => h`<option value="${i}" ${i === t ? 'selected' : ''}>${l.label}</option>`)}</select>`}
    <span class="kicker">En <span class="tiny muted">(un ou plusieurs styles, ou aucun)</span></span>
    <div class="chips">${climbStyles().map((s) => chip(c.styles.includes(s.id), s.label, `data-act="cpStyle" data-id="${s.id}"`))}</div>
    <span class="kicker">Temps disponible</span>
    <div class="chips">${[60, 90, 120, 150, 180].map((m) => chip(c.minutes === m, fmtMin(m), `data-act="cpMin" data-id="${m}"`))}<label class="row tight"><input type="number" min="40" max="240" step="5" value="${c.minutes}" data-change="cpMinIn" style="width:80px" aria-label="Minutes"><span class="tiny">min</span></label></div>
    <div class="grid2"><label>Échauffement général<select data-change="cpWarm"><option value="" ${c.warm == null ? 'selected' : ''}>Auto</option>${[0, 5, 10, 15, 20, 30].map((m) => h`<option value="${m}" ${c.warm === m ? 'selected' : ''}>${m ? m + ' min' : 'Sans'}</option>`)}</select></label>
      <label>Étirements à la fin<select data-change="cpStretch">${[0, 5, 10, 15, 20, 30].map((m) => h`<option value="${m}" ${(c.stretch || 0) === m ? 'selected' : ''}>${m ? m + ' min' : 'Sans'}</option>`)}</select></label></div>
    ${advice ? h`<p class="small ${/ambitieux/.test(advice) ? 'warn-t' : 'muted'}">${advice}</p>` : h`<p class="tiny muted">Note ton maximum (Profil › Escalade) pour un conseil sur l’objectif.</p>`}
    <button class="btn pri big" data-act="cpGoalGo" data-t="${t}">🧗 Construire ma séance pour réussir ${levels[t]?.label || ''}</button></div>`;
}
function vParts() {
  const c = CP(), total = c.parts.reduce((t, p) => t + p.minutes, 0);
  return h`<div class="card stack">
    <div class="row between"><b>Mes parties</b><span class="muted small">Total ${fmtMin(total)}</span></div>
    ${c.parts.map((p, i) => { const L = p.type === 'climb' && p.adapt ? adaptPart(p, priorLoad(c.parts, i), ctx().styles) : null; const st = STRUCTURES[p.kind || 'bloc']?.[p.structure];
      return h`<div class="cpart"><div><b>${partTitle(p)}</b> · ${fmtMin(p.minutes)}
        ${p.type === 'climb' ? h`<div class="tiny muted">${rangeText(p)}${p.styles?.length ? ' · ' + p.styles.map((id) => ctx().styles[id]?.label || id).join(', ') : ''} · ${st ? `${st.emoji} ${st.name}` : 'structure au choix'}${p.adapt ? ' · adapté à avant' : ''}</div>` : ''}
        ${L?.notes.length ? h`<div class="tiny acc-t">↳ ${L.notes[0]}</div>` : ''}</div>
        <div class="row tight cpbtns"><label class="row tight grow"><span class="unitbox"><input type="number" min="5" max="180" step="5" value="${p.minutes}" data-change="cpPartMinRow" data-i="${i}" style="width:70px" aria-label="Durée de la partie"><em>min</em></span></label><button class="btn sm ic" data-act="cpUp" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="btn sm ic" data-act="cpDown" data-i="${i}" ${i < c.parts.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button><button class="btn sm" data-act="cpEdit" data-i="${i}">Régler</button><button class="btn sm ic danger" data-act="cpDel" data-i="${i}" aria-label="Retirer">✕</button></div></div>`; })}
    <span class="kicker">Ajouter une partie</span>
    <div class="chips">${chip(false, '🪨 Bloc', 'data-act="cpAdd" data-id="climb" data-k="bloc"')}${chip(false, '🧗 Voie', 'data-act="cpAdd" data-id="climb" data-k="voie"')}${Object.entries(CLIMB_PARTS).filter(([k]) => k !== 'climb').map(([k, [e, l]]) => chip(false, `${e} ${l}`, `data-act="cpAdd" data-id="${k}"`))}</div>
    <div class="row wrapf"><label class="row tight">Ajuster à <input type="number" min="20" max="300" step="5" value="${total}" data-change="cpScale" style="width:80px" aria-label="Temps disponible"> min</label><button class="btn sm ghost" data-act="cpExample">Exemple</button></div>
    <button class="btn pri big" data-act="cpPartsGo">🧗 Construire ma séance</button></div>`;
}
/* Surprends-moi : seulement ce qu'on veut préciser, le reste est choisi par l'app (et expliqué). */
const SP = () => (CP().sp ||= { sport: '', minutes: null, forme: '', aim: 'any', seed: 1 });
function sportChoices() {
  const acts = Object.keys(ctx().activities).filter((id) => !id.startsWith('climbing_'));
  return [['bloc', '🪨 Escalade bloc'], ['voie', '🧗 Escalade voie'], ...acts.map((id) => [id, `${ctx().activities[id]?.emoji || ACTIVITIES[id]?.emoji || '🏅'} ${ctx().activities[id]?.label || ACTIVITIES[id]?.label || id}`])];
}
function vSurprise() {
  const o = SP();
  const row = (k, list, cur) => h`<div class="chips">${chip(!cur, 'Peu importe', `data-act="spSet" data-k="${k}" data-v=""`)}${list.map(([v, l]) => chip(String(cur) === String(v), l, `data-act="spSet" data-k="${k}" data-v="${v}"`))}</div>`;
  return h`<div class="card stack"><p class="small muted">Précise seulement ce que tu veux. Tout le reste, l’app le choisit d’après ton historique, et te dit pourquoi.</p>
    <span class="kicker">Sport</span>${row('sport', sportChoices(), o.sport)}
    <span class="kicker">Temps</span>${row('minutes', [[30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h']], o.minutes ?? '')}
    <span class="kicker">Ma forme</span>${row('forme', [['low', '😴 Fatigué'], ['normal', '🙂 Normal'], ['top', '🔥 En forme']], o.forme)}
    <span class="kicker">Je veux</span>
    <div class="setmenu">${Object.entries(AIMS).map(([k, [ic, t, d]]) => h`<button class="setrow" data-act="spSet" data-k="aim" data-v="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${o.aim === k ? '✓' : ''}</span></button>`)}</div>
    <button class="btn pri big" data-act="spGo">🎲 Surprends-moi</button></div>`;
}
ACT.spSet = (el) => { const o = SP(), k = el.dataset.k, v = el.dataset.v; o[k] = k === 'minutes' ? (v ? Number(v) : null) : v; CP().result = null; keep(); render(); };
ACT.spGo = (el) => {
  const o = SP(), c = CP(); if (el?.dataset?.again) o.seed = (o.seed || 1) + 1;
  const sport = o.sport || (Object.keys(ctx().activities).find((id) => id.startsWith('climbing_')) === 'climbing_route' ? 'voie' : Object.keys(ctx().activities).some((id) => id.startsWith('climbing_')) ? 'bloc' : Object.keys(ctx().activities)[0] || 'conditioning');
  const minutes = o.minutes || (sport === 'bloc' || sport === 'voie' ? 90 : ctx().settings?.defaultMinutes || 45);
  const opts = { ...(sport === 'bloc' || sport === 'voie' ? { kind: sport } : { activityId: sport }), minutes, forme: o.forme || 'normal', aim: o.aim || 'any', envId: c.envId, seed: o.seed || 1 };
  try {
    if (opts.kind) { const p = surpriseClimbParts(opts, ctx()); c.reasons = p.reasons; c.aimDone = p.aim; keep(); startBuild(p.parts, { systems: p.system ? { [p.kind]: p.system } : undefined, envId: c.envId, name: p.name, goal: p.goal, seed: opts.seed }); return; }
    const r = surprise(opts, ctx()); c.built = null; c.result = r.session; c.reasons = r.reasons; c.aimDone = r.aim;
  } catch (e) { toast('Impossible de préparer la surprise : ' + e.message, 4500, 'bad'); return; }
  keep(); render(); scrollRes();
};
/* ───────── Options d'une partie : guidé (conseillé + expliqué) ou libre (tout le catalogue) ───────── */
const eqNow = () => availableEquipment(ctx(), CP().envId);
function currentPick(i) {
  const c = CP(), p = c.built[i]; if (p.pick) return p.pick;
  const label = partLabel(p, i, c.built), ex = (c.result?.exercises || []).filter((e) => e.part === label);
  return p.type === 'climb' ? [...new Set(ex.map((e) => /^cp-(\w+)$/.exec(e.group || '')?.[1]).filter(Boolean))] : [...new Set(ex.map((e) => e.libId).filter(Boolean))];
}
function optionsFor(i, free) {
  const c = CP(), p = c.built[i];
  if (p.type === 'climb') return proposals(p.kind === 'voie' ? 'voie' : 'bloc', p.intensity).map((x) => ({ id: x.id, name: `${x.emoji} ${x.name}`, works: STRUCT_TIPS[x.id] || [], what: x.desc, tips: [STRUCT_WHEN[x.id], x.fit ? '' : 'Moins adapté à l’intensité choisie.'].filter(Boolean), recommended: x.fit, struct: true }));
  if (free) {
    const q = String(c.q?.[i] || '').toLowerCase(), all = !!c.freeAll?.[i];
    return poolFor(POOLS[p.type] ? p.type : null, { eq: eqNow(), all }).filter((x) => !q || x.name.toLowerCase().includes(q)).slice(0, 40)
      .map((x) => ({ id: x.id, name: `${x.emoji} ${x.name}`, works: Object.entries(x.caps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => CAPACITIES[k]?.label?.toLowerCase() || k), what: '', tips: [] }));
  }
  return partOptions(p, { eq: eqNow(), fingersTired: priorLoad(c.built, i).fingers >= 40, want: c.want?.[i] }).map((o) => ({ ...o, name: `${o.lib.emoji} ${o.lib.name}` }));
}
function optionRows(i, free, max = 0) {
  const pick = currentPick(i), c = CP(), p = c.built[i];
  let all = optionsFor(i, free); const total = all.length;
  if (max) all = [...all.filter((o) => pick.includes(o.id)), ...all.filter((o) => !pick.includes(o.id))].slice(0, Math.max(max, pick.length));
  const rows = all.map((o) => { const on = pick.includes(o.id);
    return h`<div class="optrow ${on ? 'on' : ''}"><button class="ck" data-act="cpPick" data-i="${i}" data-id="${o.id}" aria-pressed="${on}" aria-label="Choisir">${on ? '✓' : ''}</button>
      <button class="linkish grow" data-act="cpPick" data-i="${i}" data-id="${o.id}"><b>${o.name}</b>${o.recommended && !free ? h` <span class="tag ok">conseillé</span>` : ''}${o.works.length ? h`<small>Travaille : ${o.works.join(', ')}</small>` : ''}${o.what && o.struct ? h`<small>${o.what}</small>` : ''}${o.tips.map((t) => h`<small class="tip">💡 ${t}</small>`)}</button>
      ${o.struct ? '' : h`<button class="btn sm ic" data-act="cpOptInfo" data-id="${o.id}" data-i="${i}" aria-label="C’est quoi ?">ⓘ</button>`}</div>`; });
  const adv = p.type !== 'climb' && pick.length > 1 ? orderAdvice(pick).notes : [];
  return h`${adv.map((n) => h`<p class="tiny acc-t">↳ ${n}</p>`)}<div class="optlist">${rows.length ? rows : h`<p class="tiny muted">Aucun exercice avec ce filtre.</p>`}</div>${max && total > rows.length ? h`<button class="btn sm ghost" data-act="cpOpts" data-i="${i}">Voir toutes les options (${total})</button>` : ''}`;
}
function wantChips(i) {
  const c = CP(), p = c.built[i], caps = Object.keys(POOLS[p.type]?.caps || {}); if (p.type === 'climb' || caps.length < 2) return '';
  return h`<div class="chips tight"><span class="tiny muted">Je veux plus de :</span>${caps.slice(0, 4).map((k) => chip(c.want?.[i] === k, CAPACITIES[k]?.label || k, `data-act="cpWant" data-i="${i}" data-id="${k}"`))}</div>`;
}
function guideList(i) {
  const p = CP().built[i];
  const open = (CP().gOpen ?? 0) === i;
  return h`<details class="guide how mini" ${open ? 'open' : ''} data-i="${i}"><summary>🧭 Choisir : options conseillées et pourquoi</summary>${PART_NOTES[p.type] ? h`<p class="tiny muted">ℹ️ ${PART_NOTES[p.type]}</p>` : ''}${optionRows(i, false, 3)}</details>`;
}
function optsSheet(i) {
  const c = CP(), p = c.built[i], free = c.help === 'free'; if (!p) return; S.cpSheet = i;
  openSheet(h`<div class="stack"><h2 style="margin:0">${partLabel(p, i, c.built)}</h2>
    ${free && p.type !== 'climb' ? h`<input type="search" data-input="cpQ" data-i="${i}" value="${c.q?.[i] || ''}" placeholder="🔍 Chercher un exercice" aria-label="Chercher un exercice">
      ${POOLS[p.type] ? h`<label class="row"><input type="checkbox" data-change="cpAll" data-i="${i}" ${c.freeAll?.[i] ? 'checked' : ''}><span class="small">Voir tout le catalogue (pas seulement « ${CLIMB_PARTS[p.type]?.[1] || p.type} »)</span></label>` : ''}`
      : h`${PART_NOTES[p.type] ? h`<p class="tiny muted">ℹ️ ${PART_NOTES[p.type]}</p>` : ''}${wantChips(i)}`}
    ${optionRows(i, free)}<button class="btn pri" data-act="cpOptsDone">OK</button></div>`, { wide: true });
}
ACT.cpOpts = (el) => optsSheet(Number(el.dataset.i));
ACT.cpOptsDone = () => { S.cpSheet = null; closeSheet(); };
const reopen = () => { if (S.cpSheet != null && document.querySelector('#sheet.open, .sheet.open, #sheet')) optsSheet(S.cpSheet); };
ACT.cpPick = (el) => {
  const c = CP(), i = Number(el.dataset.i), p = c.built?.[i]; if (!p) return;
  c.gOpen = i; const cur = currentPick(i), id = el.dataset.id; p.pick = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  rebuild(); render(); reopen();
};
ACT.cpWant = (el) => { const c = CP(), i = Number(el.dataset.i); c.want = { ...(c.want || {}), [i]: c.want?.[i] === el.dataset.id ? '' : el.dataset.id }; render(); reopen(); };
INPUT.cpQ = (el) => { const c = CP(), i = Number(el.dataset.i); c.q = { ...(c.q || {}), [i]: el.value }; const pos = el.selectionStart; setTimeout(() => { optsSheet(i); const x = document.querySelector('#sheet input[data-input=cpQ]'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch { /* rien */ } } }, 200); };
CHG.cpAll = (el) => { const c = CP(), i = Number(el.dataset.i); c.freeAll = { ...(c.freeAll || {}), [i]: el.checked }; optsSheet(i); };
CHG.cpBMin = (el) => { const c = CP(), p = c.built?.[Number(el.dataset.i)]; if (!p) return; p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); rebuild(); render(); };
ACT.cpHelp = (el) => { const c = CP(); c.help = el.dataset.id; if (c.help === 'free') c.mode = 'parts'; c.result = null; c.built = null; keep(); render(); };
ACT.cpExInfo = (el) => { const s = CP().result, e = s?.exercises.find((x) => x.id === el.dataset.id); if (e) openSheet(exerciseSheet(e, '', s)); };
ACT.cpOptInfo = (el) => { const x = byId(el.dataset.id); if (x) openSheet(exerciseSheet({ ...x, libId: x.id }, h`<button class="btn" data-act="cpOpts" data-i="${el.dataset.i}">‹ Retour aux options</button>`), { wide: true }); };
function rangeText(p) {
  const levels = levelsOf(p.kind), sys = sysOf(p.kind), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null);
  const a = levels[lo]?.label, b = levels[hi]?.label; return a ? (a === b ? a : `${a}–${b}`) + (p.from == null ? ' (auto)' : '') : '';
}
function vResult() {
  const c = CP(), s = c.result, sp = c.mode === 'surprise' && c.reasons?.length && c.help !== 'free', help = c.help || 'auto';
  const exLi = (e) => h`<li><button class="linkish" data-act="cpExInfo" data-id="${e.id}"><b>${e.name}</b> <span class="tiny muted">ⓘ</span></button>${e.sets > 1 ? ` × ${e.sets}` : ''}${e.note ? h`<div class="tiny muted">${e.note}</div>` : ''}</li>`;
  const byPart = c.built ? c.built.map((p, i) => ({ p, i, label: partLabel(p, i, c.built) })) : [...new Set(s.exercises.map((e) => e.part))].map((label) => ({ p: null, i: -1, label }));
  return h`<div class="card stack" id="cpresult"><h2 style="margin:0">${s.emoji} ${s.name}</h2>
    ${sp ? h`<div class="card flat acc-b"><b class="small">${AIMS[c.aimDone]?.[0] || '🎲'} Pourquoi cette surprise</b><ul class="clean tight small">${c.reasons.map((r) => h`<li>${r}</li>`)}</ul></div>` : ''}
    <p class="muted small">~${fmtMin(sessionMinutes(s))} · ${byPart.length} parties · ${help === 'guide' ? 'coche ce que tu veux dans chaque partie' : help === 'free' ? 'ajoute tes exercices dans chaque partie' : 'change le temps ou les exercices de chaque partie si tu veux'}</p>
    ${byPart.map(({ p, i, label }) => { const ex = s.exercises.filter((e) => e.part === label);
      return h`<div class="rpart"><div class="row"><b class="grow">${label}</b>${p ? h`<span class="unitbox"><input type="number" min="5" max="180" step="5" value="${p.minutes}" data-change="cpBMin" data-i="${i}" style="width:64px" aria-label="Durée de la partie"><em>min</em></span>` : ''}</div>
        ${ex.length ? h`<ul class="clean tight small">${ex.map(exLi)}</ul>` : h`<p class="tiny muted">Rien pour l’instant.</p>`}
        ${p && help === 'guide' ? guideList(i) : p ? h`<button class="btn sm" data-act="cpOpts" data-i="${i}">${help === 'free' ? '＋ Choisir les exercices' : '🧭 Options'}</button>` : ''}</div>`; })}
    ${c.built ? '' : h`<p class="tiny muted">Enregistre-la pour changer chaque partie (🧭 dans la séance).</p>`}
    <div class="grid2"><button class="btn pri big" data-act="cpPlay" ${s.exercises.length ? '' : 'disabled'}>▶ Lancer</button><button class="btn big" data-act="cpSave" ${s.exercises.length ? '' : 'disabled'}>💾 Enregistrer</button></div>
    ${sp ? h`<button class="btn" data-act="spGo" data-again="1">🔁 Une autre surprise</button>` : ''}</div>`;
}

ACT.cpSurprise = () => { closeSheet(); CP().mode = 'surprise'; CP().result = null; keep(); go('library', 'climbplan'); };
ACT.cpMode = (el) => { CP().mode = el.dataset.id; CP().result = null; keep(); render(); };
CHG.cpEnv = (el) => { CP().envId = el.value; CP().sys = {}; keep(); render(); };
CHG.cpSys = (el) => { CP().sys = { ...CP().sys, [el.dataset.k]: el.value }; CP().target = null; keep(); render(); };
ACT.cpKind = (el) => { CP().kind = el.dataset.id; CP().target = null; keep(); render(); };
ACT.cpTarget = (el) => { CP().target = Number(el.dataset.id); keep(); render(); };
CHG.cpTargetSel = (el) => { CP().target = Number(el.value); keep(); render(); };
ACT.cpStyle = (el) => { const c = CP(), id = el.dataset.id; c.styles = c.styles.includes(id) ? c.styles.filter((x) => x !== id) : [...c.styles, id]; keep(); render(); };
CHG.cpWarm = (el) => { CP().warm = el.value === '' ? null : Number(el.value); keep(); render(); };
CHG.cpStretch = (el) => { CP().stretch = Number(el.value) || 0; keep(); render(); };
ACT.cpMin = (el) => { CP().minutes = Number(el.dataset.id); keep(); render(); };
CHG.cpMinIn = (el) => { CP().minutes = Math.max(40, Math.min(240, Number(el.value) || 120)); keep(); render(); };
const scrollRes = () => setTimeout(() => document.getElementById('cpresult')?.scrollIntoView({ behavior: 'smooth' }), 50);
/** (Re)construit la séance à partir des parties retenues : chaque réglage de partie (temps, exercices) la reconstruit. */
function rebuild() {
  const c = CP(); if (!c.built) return;
  let s = buildFromParts(c.built, ctx(), { ...c.bopts, free: c.help === 'free' });
  if (c.mode === 'surprise' && c.reasons?.length && c.help !== 'free') s = { ...s, emoji: '🎲', notes: [{ title: 'Pourquoi cette surprise', text: c.reasons.join('\n') }, ...s.notes] };
  c.result = s;
}
function startBuild(parts, bopts) { const c = CP(); c.built = parts.map((p) => ({ ...p, styles: [...(p.styles || [])] })); c.bopts = bopts; rebuild(); render(); scrollRes(); }
ACT.cpGoalGo = (el) => {
  const c = CP(), levels = levelsOf(c.kind), t = Number(el.dataset.t), names = c.styles.map((id) => ctx().styles[id]?.label?.toLowerCase() || id);
  const goal = `Réussir ${c.kind === 'voie' ? 'une voie' : 'un bloc'} ${levels[t]?.label}${names.length ? ` en ${names.join(', ')}` : ''}.`;
  c.reasons = [];
  startBuild(goalParts({ kind: c.kind, target: t, levels, styles: c.styles, minutes: c.minutes, warm: c.warm, stretch: c.stretch || 0 }), { systems: { [c.kind]: sysOf(c.kind) }, envId: c.envId, goal, name: `Objectif ${levels[t]?.label}${names.length ? ' · ' + names.join(', ') : ''}` });
};
ACT.cpPartsGo = () => {
  const c = CP(); if (!c.parts.length) { toast('Ajoute au moins une partie.'); return; }
  c.reasons = [];
  startBuild(c.parts, { systems: { bloc: sysOf('bloc'), voie: sysOf('voie') }, envId: c.envId, name: c.parts.filter((p) => p.type === 'climb').map(partTitle).join(' + ').replace(/[🪨🧗] /gu, '') || 'Ma séance' });
};
ACT.cpPlay = () => { const s = CP().result; if (s) startPlayer(s, { fromGenerator: true }); };
ACT.cpSave = () => { const s = CP().result; if (!s) return; const n = saveSeance(s); CP().result = null; toast('Enregistrée dans Mes séances'); go('library', 'seance', n.id); };
const mv = (i, d) => { const p = CP().parts, j = i + d; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; CP().result = null; keep(); render(); };
ACT.cpUp = (el) => mv(Number(el.dataset.i), -1);
ACT.cpDown = (el) => mv(Number(el.dataset.i), 1);
ACT.cpDel = (el) => { CP().parts.splice(Number(el.dataset.i), 1); CP().result = null; keep(); render(); };
ACT.cpAdd = (el) => {
  const t = el.dataset.id, p = t === 'climb' ? { type: 'climb', kind: el.dataset.k, intensity: 'mod', minutes: 30, styles: [] } : { type: t, minutes: t === 'warmup' ? 15 : 10 };
  CP().parts.push(p); CP().result = null; keep(); render(); if (t === 'climb') editPart(CP().parts.length - 1);
};
ACT.cpExample = () => { CP().parts = DEFAULT_PARTS.map((p) => ({ ...p })); CP().result = null; keep(); render(); };
CHG.cpScale = (el) => {
  const c = CP(), total = c.parts.reduce((t, p) => t + p.minutes, 0), want = Math.max(20, Math.min(300, Number(el.value) || total));
  if (!total) return; let acc = 0; c.parts.forEach((p, i) => { p.minutes = i === c.parts.length - 1 ? Math.max(5, want - acc) : Math.max(5, Math.round((p.minutes * want) / total / 5) * 5); acc += p.minutes; });
  c.result = null; keep(); render();
};
/* Régler une partie : durée, intensité, cotations, styles, structure (plusieurs propositions), adaptation. */
function editPart(i) {
  const c = CP(), p = c.parts[i]; if (!p) return;
  if (p.type !== 'climb') {
    openSheet(h`<div class="stack"><h2 style="margin:0">${partTitle(p)}</h2><label>Durée<span class="unitbox"><input type="number" min="5" max="120" step="5" value="${p.minutes}" data-change="cpPartMin" data-i="${i}"><em>min</em></span></label><p class="tiny muted">Les exercices sont choisis par l’app selon ton matériel.</p><button class="btn pri" data-act="closeSheet">OK</button></div>`);
    return;
  }
  const levels = levelsOf(p.kind), sys = sysOf(p.kind), max = sys ? knownMax(ctx(), sys, p.kind) : null, [lo, hi] = partRange(p, levels, max);
  const L = adaptPart(p, priorLoad(c.parts, i), ctx().styles), props = proposals(p.kind, p.intensity), cur = p.structure || props[0].id;
  const opt = (sel) => levels.map((l, k) => h`<option value="${k}" ${k === sel ? 'selected' : ''}>${l.label}</option>`);
  openSheet(h`<div class="stack"><h2 style="margin:0">${partTitle(p)}</h2>
    <div class="chips">${[['bloc', '🪨 Bloc'], ['voie', '🧗 Voie']].map(([k, l]) => chip(p.kind === k, l, `data-act="cpPart" data-i="${i}" data-k="kind" data-v="${k}"`))}</div>
    <label>Durée<span class="unitbox"><input type="number" min="5" max="180" step="5" value="${p.minutes}" data-change="cpPartMin" data-i="${i}"><em>min</em></span></label>
    <span class="kicker">Intensité</span><div class="chips">${Object.entries(INTENSITY).map(([k, [e, l]]) => chip(p.intensity === k, `${e} ${l}`, `data-act="cpPart" data-i="${i}" data-k="intensity" data-v="${k}"`))}</div>
    <span class="kicker">Cotations ${p.from == null ? h`<span class="tiny muted">(auto selon l’intensité${max == null ? '' : ' et ton max'})</span>` : ''}</span>
    <div class="grid2"><label>De<select data-change="cpPartLv" data-i="${i}" data-k="from">${opt(lo)}</select></label><label>À<select data-change="cpPartLv" data-i="${i}" data-k="to">${opt(hi)}</select></label></div>
    ${p.from != null ? h`<button class="btn sm ghost" data-act="cpPartAuto" data-i="${i}">↺ Cotations automatiques</button>` : ''}
    <span class="kicker">Styles <span class="tiny muted">(plusieurs possibles)</span></span>
    <div class="chips">${climbStyles().map((s) => chip((p.styles || []).includes(s.id), s.label, `data-act="cpPartStyle" data-i="${i}" data-id="${s.id}"`))}</div>
    <span class="kicker">Comment structurer cette partie ?</span>
    <div class="setmenu">${props.map((s) => h`<button class="setrow ${s.fit ? '' : 'dim'}" data-act="cpPart" data-i="${i}" data-k="structure" data-v="${s.id}"><span class="sic">${s.emoji}</span><span class="grow"><b>${s.name}</b><small>${s.desc}${s.fit ? '' : ' (moins adapté à cette intensité)'}</small></span><span class="chev">${cur === s.id ? '✓' : ''}</span></button>`)}</div>
    ${i > 0 ? h`<label class="row"><input type="checkbox" data-change="cpPartAdapt" data-i="${i}" ${p.adapt ? 'checked' : ''}><span class="grow"><b>Adapter à ce que j’ai fait avant</b><small class="muted"> Moins de doigts ou de puissance si les parties d’avant en ont beaucoup demandé.</small></span></label>
      ${p.adapt ? h`<p class="tiny ${L.notes.length ? 'acc-t' : 'muted'}">${L.notes.length ? L.notes.join(' ') : 'Rien à adapter : ce qui précède reste léger.'}</p>` : ''}` : ''}
    <button class="btn pri" data-act="closeSheet">OK</button></div>`);
}
ACT.cpEdit = (el) => editPart(Number(el.dataset.i));
const upd = (i, fn) => { const p = CP().parts[i]; if (!p) return; fn(p); CP().result = null; keep(); render(); editPart(i); };
ACT.cpPart = (el) => upd(Number(el.dataset.i), (p) => { p[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'kind' || el.dataset.k === 'intensity') { delete p.structure; if (el.dataset.k === 'kind') { delete p.from; delete p.to; } } });
CHG.cpPartMinRow = (el) => { const p = CP().parts[Number(el.dataset.i)]; if (!p) return; p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); CP().result = null; keep(); render(); };
CHG.cpPartMin = (el) => upd(Number(el.dataset.i), (p) => { p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); });
CHG.cpPartLv = (el) => upd(Number(el.dataset.i), (p) => { const levels = levelsOf(p.kind), sys = sysOf(p.kind), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null); p.from ??= lo; p.to ??= hi; p[el.dataset.k] = Number(el.value); });
ACT.cpPartAuto = (el) => upd(Number(el.dataset.i), (p) => { delete p.from; delete p.to; });
ACT.cpPartStyle = (el) => upd(Number(el.dataset.i), (p) => { const id = el.dataset.id, s = p.styles || []; p.styles = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; });
CHG.cpPartAdapt = (el) => upd(Number(el.dataset.i), (p) => { p.adapt = el.checked; });
export const climbPlanResult = () => S.cp?.result || null;
void raw;
