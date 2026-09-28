// views-climbplan.js — « Structurer ma séance d'escalade » : par objectif de fin de séance, ou partie par partie.
import { h, raw, chip, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, CHG, ctx, render, go, saveSeance, ls } from './state.js';
import { sortedLevels } from './grading.js';
import { INTENSITY, CLIMB_PARTS, STRUCTURES, proposals, partRange, pickSystem, knownMax, priorLoad, adaptPart, buildFromParts, goalParts, goalAdvice } from './climbplan.js';
import { startPlayer } from './player.js';
import { sessionMinutes } from './engine.js';

const KEY = 'sea:climbplan';
const DEFAULT_PARTS = [
  { type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 90, styles: [] },
  { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30, styles: [] }, { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40, styles: [], adapt: true },
  { type: 'cool', minutes: 10 },
];
const CP = () => (S.cp ||= { mode: 'goal', kind: 'bloc', envId: '', sys: {}, target: null, styles: [], minutes: 120, parts: DEFAULT_PARTS.map((p) => ({ ...p })), result: null, ...(ls.get(KEY, {}) || {}), result: null });
const keep = () => { const { result, ...rest } = CP(); ls.set(KEY, rest); };
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
  const mode = h`<div class="setmenu">${[['goal', '🎯', 'J’ai un objectif de fin de séance', 'Ex. « à la fin, avoir réussi un U8 en dévers-réglettes » : l’app construit tout.'], ['parts', '🧩', 'Je structure moi-même', 'Tes parties, leur durée, bloc ou voie, l’intensité, les cotations et les styles.']]
    .map(([k, ic, t, d]) => h`<button class="setrow" data-act="cpMode" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${c.mode === k ? '✓' : ''}</span></button>`)}</div>`;
  const place = h`<label>Lieu<select data-change="cpEnv"><option value="">${x.defEnv ? 'Par défaut : ' + x.defEnv.name : '—'}</option>${x.envs.map((e) => h`<option value="${e.id}" ${c.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label>`;
  return h`${mode}<div class="card">${place}</div>${c.mode === 'goal' ? vGoal() : vParts()}${c.result ? vResult() : ''}`;
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
        <div class="row tight cpbtns"><button class="btn sm ic" data-act="cpUp" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="btn sm ic" data-act="cpDown" data-i="${i}" ${i < c.parts.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button><button class="btn sm" data-act="cpEdit" data-i="${i}">Régler</button><button class="btn sm ic danger" data-act="cpDel" data-i="${i}" aria-label="Retirer">✕</button></div></div>`; })}
    <span class="kicker">Ajouter une partie</span>
    <div class="chips">${chip(false, '🪨 Bloc', 'data-act="cpAdd" data-id="climb" data-k="bloc"')}${chip(false, '🧗 Voie', 'data-act="cpAdd" data-id="climb" data-k="voie"')}${Object.entries(CLIMB_PARTS).filter(([k]) => k !== 'climb').map(([k, [e, l]]) => chip(false, `${e} ${l}`, `data-act="cpAdd" data-id="${k}"`))}</div>
    <div class="row wrapf"><label class="row tight">Ajuster à <input type="number" min="20" max="300" step="5" value="${total}" data-change="cpScale" style="width:80px" aria-label="Temps disponible"> min</label><button class="btn sm ghost" data-act="cpExample">Exemple</button></div>
    <button class="btn pri big" data-act="cpPartsGo">🧗 Construire ma séance</button></div>`;
}
function rangeText(p) {
  const levels = levelsOf(p.kind), sys = sysOf(p.kind), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null);
  const a = levels[lo]?.label, b = levels[hi]?.label; return a ? (a === b ? a : `${a}–${b}`) + (p.from == null ? ' (auto)' : '') : '';
}
function vResult() {
  const s = CP().result, parts = [...new Set(s.exercises.map((e) => e.part))];
  return h`<div class="card stack" id="cpresult"><h2 style="margin:0">${s.emoji} ${s.name}</h2><p class="muted small">~${fmtMin(sessionMinutes(s))} · ${parts.length} parties · rien n’est enregistré tant que tu ne le demandes pas</p>
    ${parts.map((p) => h`<div class="blockhead">${p}</div><ul class="clean tight small">${s.exercises.filter((e) => e.part === p).map((e) => h`<li><b>${e.name}</b>${e.sets > 1 ? ` × ${e.sets}` : ''}${e.note ? h`<div class="tiny muted">${e.note}</div>` : ''}</li>`)}</ul>`)}
    <div class="grid2"><button class="btn pri big" data-act="cpPlay">▶ Lancer</button><button class="btn big" data-act="cpSave">💾 Enregistrer</button></div></div>`;
}

ACT.cpMode = (el) => { CP().mode = el.dataset.id; CP().result = null; keep(); render(); };
CHG.cpEnv = (el) => { CP().envId = el.value; CP().sys = {}; keep(); render(); };
CHG.cpSys = (el) => { CP().sys = { ...CP().sys, [el.dataset.k]: el.value }; CP().target = null; keep(); render(); };
ACT.cpKind = (el) => { CP().kind = el.dataset.id; CP().target = null; keep(); render(); };
ACT.cpTarget = (el) => { CP().target = Number(el.dataset.id); keep(); render(); };
CHG.cpTargetSel = (el) => { CP().target = Number(el.value); keep(); render(); };
ACT.cpStyle = (el) => { const c = CP(), id = el.dataset.id; c.styles = c.styles.includes(id) ? c.styles.filter((x) => x !== id) : [...c.styles, id]; keep(); render(); };
ACT.cpMin = (el) => { CP().minutes = Number(el.dataset.id); keep(); render(); };
CHG.cpMinIn = (el) => { CP().minutes = Math.max(40, Math.min(240, Number(el.value) || 120)); keep(); render(); };
ACT.cpGoalGo = (el) => {
  const c = CP(), levels = levelsOf(c.kind), t = Number(el.dataset.t), names = c.styles.map((id) => ctx().styles[id]?.label?.toLowerCase() || id);
  const goal = `Réussir ${c.kind === 'voie' ? 'une voie' : 'un bloc'} ${levels[t]?.label}${names.length ? ` en ${names.join(', ')}` : ''}.`;
  const parts = goalParts({ kind: c.kind, target: t, levels, styles: c.styles, minutes: c.minutes });
  c.result = buildFromParts(parts, ctx(), { systems: { [c.kind]: sysOf(c.kind) }, envId: c.envId, goal, name: `Objectif ${levels[t]?.label}${names.length ? ' · ' + names.join(', ') : ''}` });
  render(); setTimeout(() => document.getElementById('cpresult')?.scrollIntoView({ behavior: 'smooth' }), 50);
};
ACT.cpPartsGo = () => {
  const c = CP(); if (!c.parts.length) { toast('Ajoute au moins une partie.'); return; }
  c.result = buildFromParts(c.parts, ctx(), { systems: { bloc: sysOf('bloc'), voie: sysOf('voie') }, envId: c.envId, name: c.parts.filter((p) => p.type === 'climb').map(partTitle).join(' + ').replace(/[🪨🧗] /gu, '') || 'Ma séance d’escalade' });
  render(); setTimeout(() => document.getElementById('cpresult')?.scrollIntoView({ behavior: 'smooth' }), 50);
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
CHG.cpPartMin = (el) => upd(Number(el.dataset.i), (p) => { p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); });
CHG.cpPartLv = (el) => upd(Number(el.dataset.i), (p) => { const levels = levelsOf(p.kind), sys = sysOf(p.kind), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null); p.from ??= lo; p.to ??= hi; p[el.dataset.k] = Number(el.value); });
ACT.cpPartAuto = (el) => upd(Number(el.dataset.i), (p) => { delete p.from; delete p.to; });
ACT.cpPartStyle = (el) => upd(Number(el.dataset.i), (p) => { const id = el.dataset.id, s = p.styles || []; p.styles = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; });
CHG.cpPartAdapt = (el) => upd(Number(el.dataset.i), (p) => { p.adapt = el.checked; });
export const climbPlanResult = () => S.cp?.result || null;
void raw; void closeSheet;
