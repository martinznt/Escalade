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
import { intentsFor, AVOID_ZONES, FORMES } from './intentions.js';
import { activeGoals, goalLabel } from './brain.js';
import { presetParts } from './format.js';
import { extraIntents } from './views-gen.js';
import { setReturn } from './nav.js';
import { EQUIPMENT } from './model.js';
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
const partTitle = (p) => (p.type === 'main' ? sportLabel(p.activity || CP().sport) : p.type === 'climb' ? `${p.kind === 'voie' ? '🧗 Voie' : '🪨 Bloc'} ${INTENSITY[p.intensity]?.[1].toLowerCase() || ''}` : `${CLIMB_PARTS[p.type]?.[0]} ${CLIMB_PARTS[p.type]?.[1]}`);

function sysSelect(kind) {
  const cur = sysOf(kind);
  return h`<label>Cotation ${kind === 'voie' ? 'voie' : 'bloc'}<select data-change="cpSys" data-k="${kind}">${systemsFor(kind).map((s) => h`<option value="${s.id}" ${cur?.id === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>`;
}
/* ═════════ Créer une séance : un seul assistant, pour tous les sports, en 5 étapes ═════════ */
const STEPS = [['how', 'Comment ?'], ['where', 'Sport, lieu et temps'], ['why', 'Pour quoi ?'], ['format', 'Format de la séance'], ['ex', 'Les exercices']];
const HELP = { auto: ['🤖', 'L’app choisit tout', 'Une séance complète ; ensuite tu peux changer le temps et les exercices de chaque partie.'], guide: ['🧭', 'L’app me guide', 'Pour chaque partie, plusieurs exercices expliqués et l’ordre conseillé : tu choisis.'], free: ['✋', 'Je compose moi-même', 'Tes parties, tes exercices, dans tout le catalogue. Rien d’imposé.'] };
const isClimb = (sp) => sp === 'climbing_boulder' || sp === 'climbing_route';
const kindOf = (sp) => (sp === 'climbing_route' ? 'voie' : 'bloc');
const sportLabel = (id) => { const a = ctx().activities[id] || ACTIVITIES[id]; return a ? `${a.emoji || '🏅'} ${a.label}` : id; };
const envOf = () => { const x = ctx(); return x.envs.find((e) => e.id === CP().envId) || x.defEnv || null; };
export function vClimbPlan() {
  const c = CP(); c.step ||= 1; c.sport ||= Object.keys(ctx().activities)[0] || 'conditioning';
  const st = c.step, [, title] = STEPS[st - 1];
  const body = [vHow, vWhere, vWhy, vFormat, vExercises][st - 1]();
  const canNext = st < 5;
  return h`<div class="steps"><div class="row between"><b>Étape ${st}/5 · ${title}</b>${st > 1 ? h`<button class="btn sm ghost" data-act="cpRestart">Recommencer</button>` : ''}</div>
      <div class="meter"><i style="width:${st * 20}%"></i></div></div>
    ${body}
    <div class="stepdock">${st > 1 ? h`<button class="btn" data-act="cpStep" data-d="-1">‹ Retour</button>` : h`<span></span>`}${canNext ? h`<button class="btn pri" data-act="cpStep" data-d="1">${st === 4 ? 'Voir les exercices ›' : 'Suivant ›'}</button>` : ''}</div>`;
}
/* Étape 1 : combien l'app aide. */
function vHow() {
  const c = CP();
  return h`<div class="setmenu">${Object.entries(HELP).map(([k, [ic, t, d]]) => h`<button class="setrow" data-act="cpHelp" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${(c.help || 'auto') === k ? '✓' : ''}</span></button>`)}</div>`;
}
/* Étape 2 : sport, lieu (avec son matériel et sa cotation), forme, temps. */
function vWhere() {
  const c = CP(), x = ctx(), env = envOf(), eq = [...availableEquipment(x, c.envId)];
  const sports = [...new Set([...Object.keys(x.activities), 'climbing_boulder', 'climbing_route'])].filter((id) => x.activities[id] || ACTIVITIES[id]);
  return h`<div class="card stack">
    <span class="kicker">Sport</span><div class="chips">${sports.map((id) => chip(c.sport === id, sportLabel(id), `data-act="cpSport" data-id="${id}"`))}<button type="button" class="chip add" data-act="allGo" data-to="profile/activities">＋ Ajouter un sport</button></div>
    <label>Lieu<select data-change="cpEnv"><option value="">${x.defEnv ? 'Par défaut : ' + x.defEnv.name : 'Aucun lieu décrit'}</option>${x.envs.map((e) => h`<option value="${e.id}" ${c.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}<option value="__new">＋ Ajouter un lieu…</option></select></label>
    <p class="tiny ${eq.length ? 'muted' : 'warn-t'}">🧰 ${env ? `Matériel de ${env.name}` : 'Matériel'} : ${eq.length ? eq.map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase() : 'aucun déclaré (séance sans matériel)'} · <button class="linkish acc-t" data-act="allGo" data-to="profile/equipment">modifier</button></p>
    ${isClimb(c.sport) ? sysSelect(kindOf(c.sport)) : ''}
    <span class="kicker">Ma forme aujourd’hui</span><div class="chips">${FORMES.map(([k, e, l]) => chip((c.forme || 'ok') === k, `${e} ${l}`, `data-act="cpForme" data-id="${k}"`))}</div>
    <span class="kicker">Temps disponible</span>
    <div class="chips">${[30, 45, 60, 90, 120, 150, 180].map((m) => chip(c.minutes === m, fmtMin(m), `data-act="cpMin" data-id="${m}"`))}<label class="row tight"><input type="number" min="10" max="240" step="5" value="${c.minutes}" data-change="cpMinIn" style="width:80px" aria-label="Minutes"><span class="tiny">min</span></label></div></div>`;
}
/* Étape 3 : pour quoi — plusieurs objectifs, une cotation à réussir, une surprise, ce qu'on veut travailler. */
function vWhy() {
  const c = CP(), x = ctx(), goals = activeGoals(x), kind = kindOf(c.sport), climb = isClimb(c.sport);
  const AIM = [['goals', '🎯', 'Mes objectifs et mes envies', 'Coche un ou plusieurs objectifs, et ce que tu veux travailler.'], ...(climb ? [['grade', '🧗', 'Réussir une cotation à la fin', 'Ex. un U8 en dévers : échauffement, montée, puis essais.']] : []), ['surprise', '🎲', 'Surprends-moi', 'Quelque chose de nouveau, ou qui te fait progresser.'], ['none', '🙂', 'Rien de particulier', 'Une séance équilibrée pour ton sport.']];
  const aim = c.aim && AIM.some(([k]) => k === c.aim) ? c.aim : 'goals';
  let detail = '';
  if (aim === 'goals') {
    const ints = intentsFor(c.sport, extraIntents());
    detail = h`<div class="card stack"><span class="kicker">Mes objectifs <span class="tiny muted">(plusieurs possibles)</span></span>
      ${goals.length ? h`<div class="chips">${goals.map((g) => chip((c.goalIds || []).includes(g.id), goalLabel(g), `data-act="cpGoal" data-id="${g.id}"`))}</div>` : h`<p class="small muted">Aucun objectif en cours.</p>`}
      <button class="btn sm" data-act="cpAddGoals">＋ Ajouter des objectifs ici</button>
      <span class="kicker">Ce que je veux travailler <span class="tiny muted">(facultatif)</span></span>
      <div class="chips">${ints.map((it) => chip((c.intents || []).includes(it.id), `${it.emoji} ${it.label}`, `data-act="cpIntent" data-id="${it.id}"`))}<button type="button" class="chip add" data-act="cpIntentWrite">✍️ Autre, avec mes mots</button></div>
      <span class="kicker">Zones à ménager <span class="tiny muted">(facultatif)</span></span>
      <div class="chips">${AVOID_ZONES.map(([k, l]) => chip((c.zones || []).includes(k), l, `data-act="cpZone" data-id="${k}"`))}</div></div>`;
  } else if (aim === 'grade') {
    const levels = levelsOf(kind), sys = sysOf(kind), max = sys ? knownMax(x, sys, kind) : null;
    const t = c.target != null && c.target < levels.length ? c.target : Math.min(levels.length - 1, (max ?? Math.round(levels.length * 0.6)) + (levels.length > 10 ? 2 : 1));
    const advice = goalAdvice(t, max, levels); c.targetShown = t;
    detail = h`<div class="card stack"><span class="kicker">À la fin, je veux avoir réussi</span>
      ${levels.length <= 16 ? h`<div class="chips">${levels.map((l, i) => chip(i === t, l.label, `data-act="cpTarget" data-id="${i}"`))}</div>` : h`<select data-change="cpTargetSel">${levels.map((l, i) => h`<option value="${i}" ${i === t ? 'selected' : ''}>${l.label}</option>`)}</select>`}
      <span class="kicker">En <span class="tiny muted">(un ou plusieurs styles, ou aucun)</span></span>
      <div class="chips">${climbStyles().sort((a, b) => a.label.localeCompare(b.label, 'fr')).map((st) => chip(c.styles.includes(st.id), st.label, `data-act="cpStyle" data-id="${st.id}"`))}<input class="chipin" data-change="styleQuick" data-target="cp" maxlength="40" placeholder="＋ Autre style" aria-label="Ajouter un style"></div>
      ${advice ? h`<p class="small ${/ambitieux/.test(advice) ? 'warn-t' : 'muted'}">${advice}</p>` : h`<p class="tiny muted">Note ton maximum dans <button class="linkish acc-t" data-act="allGo" data-to="profile/climbing">Profil › Carnet</button> pour un conseil sur l’objectif.</p>`}</div>`;
  } else if (aim === 'surprise') {
    detail = h`<div class="setmenu">${Object.entries(AIMS).map(([k, [ic, t, d]]) => h`<button class="setrow" data-act="cpSurAim" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${(c.surAim || 'any') === k ? '✓' : ''}</span></button>`)}</div>`;
  }
  return h`<div class="setmenu">${AIM.map(([k, ic, t, d]) => h`<button class="setrow" data-act="cpAim" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${aim === k ? '✓' : ''}</span></button>`)}</div>${detail}`;
}
/* Étape 4 : le format (parties et temps), proposé d'après les étapes d'avant et modifiable. */
function vFormat() {
  const c = CP();
  if (c.aim === 'surprise' && !isClimb(c.sport)) return h`<div class="card"><p class="small">🎲 La surprise choisit aussi le format : passe à l’étape suivante pour la découvrir. Tu pourras ensuite l’enregistrer et changer chaque partie.</p></div>`;
  return h`<p class="small muted">${c.partsTouched ? 'Ton format.' : 'Le format proposé pour ce que tu as choisi.'} Change l’ordre, la durée, ajoute ou retire des parties (échauffement, étirements…).</p>${vParts()}`;
}
/* Étape 5 : les exercices, partie par partie, selon le niveau d'aide. */
function vExercises() {
  const c = CP(); if (!c.result) buildNow();
  return c.result ? vResult() : h`<div class="card"><p class="small warn-t">Impossible de préparer la séance. Reviens à l’étape d’avant.</p></div>`;
}
/** Format proposé selon le sport, le temps et le « pour quoi ». */
function proposeParts() {
  const c = CP(), M = c.minutes || 60, kind = kindOf(c.sport);
  if (isClimb(c.sport) && c.aim === 'grade') return goalParts({ kind, target: c.targetShown ?? c.target ?? 0, levels: levelsOf(kind), styles: c.styles, minutes: M });
  if (isClimb(c.sport) && c.aim === 'surprise') { const r = surpriseClimbParts({ kind, minutes: M, aim: c.surAim || 'any', forme: FORME_MAP[c.forme] || 'normal', envId: c.envId, seed: c.seed || 1 }, ctx()); c.reasons = r.reasons; c.aimDone = r.aim; c.surName = r.name; c.surGoal = r.goal; c.surSystem = r.system?.id || ''; return r.parts; }
  if (isClimb(c.sport)) {
    const warm = Math.min(15, Math.round(M * 0.12)), cool = Math.min(10, Math.max(5, Math.round(M * 0.07))), rest = M - warm - cool, low = FORME_MAP[c.forme] === 'low';
    return [{ type: 'warmup', minutes: warm }, { type: 'climb', kind, intensity: low ? 'mod' : 'hard', minutes: Math.round(rest * 0.6), styles: [] }, { type: 'climb', kind, intensity: 'easy', minutes: rest - Math.round(rest * 0.6), styles: [], adapt: true }, { type: 'cool', minutes: cool }];
  }
  return presetParts('classique', M).map((p) => (p.type === 'main' ? { ...p, activity: c.sport } : p));
}
const FORME_MAP = { exhausted: 'low', tired: 'low', ok: 'normal', fresh: 'normal', top: 'top' };
function buildOpts() {
  const c = CP(), env = envOf(), x = ctx(), ints = intentsFor(c.sport, extraIntents()).filter((it) => (c.intents || []).includes(it.id)).map((it) => ({ label: it.label, caps: it.caps }));
  const names = (c.goalIds || []).map((id) => x.goals.find((g) => g.id === id)).filter(Boolean).map(goalLabel);
  const levels = levelsOf(kindOf(c.sport)), t = c.targetShown ?? c.target;
  const goal = c.aim === 'grade' ? `Réussir ${kindOf(c.sport) === 'voie' ? 'une voie' : 'un bloc'} ${levels[t]?.label || ''}${c.styles.length ? ' en ' + c.styles.map((id) => x.styles[id]?.label?.toLowerCase() || id).join(', ') : ''}.`
    : c.aim === 'surprise' ? c.surGoal || '' : names.length ? `Pour : ${names.join(', ')}.` : '';
  const name = c.aim === 'grade' ? `Objectif ${levels[t]?.label || ''}` : c.aim === 'surprise' ? c.surName || 'Surprise' : names.length ? names.slice(0, 2).join(' + ') : `${sportLabel(c.sport).replace(/^\S+\s/, '')} — ${fmtMin(c.minutes || 60)}`;
  return { sport: c.sport, envId: c.envId || x.defEnv?.id || '', envName: env?.name || '', goalIds: c.goalIds || [], intents: ints, avoidZones: c.zones || [], light: FORME_MAP[c.forme] === 'low',
    systems: isClimb(c.sport) ? { [kindOf(c.sport)]: (c.surSystem && x.systems[c.surSystem]) || sysOf(kindOf(c.sport)) } : undefined, goal, name, seed: c.seed || 1 };
}
function buildNow() {
  const c = CP();
  if (c.aim === 'surprise' && !isClimb(c.sport)) {
    try { const r = surprise({ activityId: c.sport, minutes: c.minutes || 45, forme: FORME_MAP[c.forme] || 'normal', aim: c.surAim || 'any', envId: c.envId, seed: c.seed || 1 }, ctx()); c.built = null; c.result = r.session; c.reasons = r.reasons; c.aimDone = r.aim; }
    catch (e) { toast('Impossible de préparer la surprise : ' + e.message, 4500, 'bad'); }
    return;
  }
  c.built = c.parts.map((p) => ({ ...p, styles: [...(p.styles || [])] })); c.bopts = buildOpts(); rebuild();
}
ACT.cpStep = (el) => {
  const c = CP(), d = Number(el.dataset.d), next = Math.max(1, Math.min(5, c.step + d));
  if (d > 0 && c.step === 3 && (!c.partsTouched || c.partsFor !== partsKey())) { c.parts = proposeParts(); c.partsFor = partsKey(); c.partsTouched = false; }
  if (d > 0 && c.step === 4) { c.result = null; buildNow(); }
  c.step = next; keep(); render(); window.scrollTo(0, 0);
};
const partsKey = () => { const c = CP(); return JSON.stringify([c.sport, c.minutes, c.aim, c.aim === 'grade' ? c.targetShown ?? c.target : '', c.styles, c.aim === 'surprise' ? [c.surAim, c.seed] : '', c.forme]); };
ACT.cpRestart = () => { const help = CP().help; S.cp = null; ls.set(KEY, {}); CP().help = help; render(); window.scrollTo(0, 0); };
ACT.cpSport = (el) => { const c = CP(); c.sport = el.dataset.id; c.result = null; c.target = null; if (!isClimb(c.sport) && c.aim === 'grade') c.aim = 'goals'; keep(); render(); };
ACT.cpForme = (el) => { CP().forme = el.dataset.id; keep(); render(); };
ACT.cpAim = (el) => { CP().aim = el.dataset.id; keep(); render(); };
ACT.cpSurAim = (el) => { CP().surAim = el.dataset.id; keep(); render(); };
const tog = (k) => (el) => { const c = CP(), id = el.dataset.id, l = c[k] || []; c[k] = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; keep(); render(); };
ACT.cpIntentWrite = () => { S.gen.activityId = CP().sport; ACT.gWrite?.({ dataset: { k: 'intent' } }); };
ACT.cpGoal = tog('goalIds'); ACT.cpIntent = tog('intents'); ACT.cpZone = tog('zones');
// Aller ajouter des objectifs, puis revenir à la séance (le brouillon est gardé).
ACT.cpAddGoals = () => { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('profile', 'goals'); };
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
    <div class="chips">${chip(false, '🪨 Bloc', 'data-act="cpAdd" data-id="climb" data-k="bloc"')}${chip(false, '🧗 Voie', 'data-act="cpAdd" data-id="climb" data-k="voie"')}${Object.keys(ctx().activities).filter((id) => !isClimb(id)).map((id) => chip(false, sportLabel(id), `data-act="cpAdd" data-id="main" data-k="${id}"`))}${Object.entries(CLIMB_PARTS).filter(([k]) => k !== 'climb').map(([k, [e, l]]) => chip(false, `${e} ${l}`, `data-act="cpAdd" data-id="${k}"`))}</div>
    <div class="row wrapf"><label class="row tight">Ajuster à <input type="number" min="20" max="300" step="5" value="${total}" data-change="cpScale" style="width:80px" aria-label="Temps disponible"> min</label><button class="btn sm ghost" data-act="cpExample">↺ Format proposé</button></div>
    </div>`;
}
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
ACT.cpHelp = (el) => { const c = CP(); c.help = el.dataset.id; c.result = null; keep(); render(); };
ACT.cpExInfo = (el) => { const s = CP().result, e = s?.exercises.find((x) => x.id === el.dataset.id); if (e) openSheet(exerciseSheet(e, '', s)); };
ACT.cpOptInfo = (el) => { const x = byId(el.dataset.id); if (x) openSheet(exerciseSheet({ ...x, libId: x.id }, h`<button class="btn" data-act="cpOpts" data-i="${el.dataset.i}">‹ Retour aux options</button>`), { wide: true }); };
function rangeText(p) {
  const levels = levelsOf(p.kind), sys = sysOf(p.kind), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null);
  const a = levels[lo]?.label, b = levels[hi]?.label; return a ? (a === b ? a : `${a}–${b}`) + (p.from == null ? ' (auto)' : '') : '';
}
function vResult() {
  const c = CP(), s = c.result, sp = c.aim === 'surprise' && c.reasons?.length && c.help !== 'free', help = c.help || 'auto';
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
    ${sp ? h`<button class="btn" data-act="cpAgain">🔁 Une autre surprise</button>` : ''}</div>`;
}

ACT.cpSurprise = () => { closeSheet(); const c = CP(); c.aim = 'surprise'; c.result = null; c.step = Math.max(2, c.step || 1); keep(); go('library', 'climbplan'); };
ACT.cpNew = () => { closeSheet(); const help = CP().help; S.cp = null; ls.set(KEY, {}); CP().help = help; go('library', 'climbplan'); };
ACT.cpResume = () => { closeSheet(); go('library', 'climbplan'); };
ACT.cpAgain = () => { const c = CP(); c.seed = (c.seed || 1) + 1; if (isClimb(c.sport)) { c.parts = proposeParts(); c.partsFor = partsKey(); } c.result = null; buildNow(); keep(); render(); };
CHG.cpEnv = (el) => { if (el.value === '__new') { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('profile', 'equipment'); return; } CP().envId = el.value; CP().sys = {}; keep(); render(); };
CHG.cpSys = (el) => { CP().sys = { ...CP().sys, [el.dataset.k]: el.value }; CP().target = null; keep(); render(); };
ACT.cpKind = (el) => { CP().kind = el.dataset.id; CP().target = null; keep(); render(); };
ACT.cpTarget = (el) => { CP().target = Number(el.dataset.id); keep(); render(); };
CHG.cpTargetSel = (el) => { CP().target = Number(el.value); keep(); render(); };
ACT.cpStyle = (el) => { const c = CP(), id = el.dataset.id; c.styles = c.styles.includes(id) ? c.styles.filter((x) => x !== id) : [...c.styles, id]; keep(); render(); };
ACT.cpMin = (el) => { CP().minutes = Number(el.dataset.id); keep(); render(); };
CHG.cpMinIn = (el) => { CP().minutes = Math.max(10, Math.min(240, Number(el.value) || 60)); keep(); render(); };
const scrollRes = () => setTimeout(() => document.getElementById('cpresult')?.scrollIntoView({ behavior: 'smooth' }), 50);
/** (Re)construit la séance à partir des parties retenues : chaque réglage de partie (temps, exercices) la reconstruit. */
function rebuild() {
  const c = CP(); if (!c.built) return;
  let s = buildFromParts(c.built, ctx(), { ...c.bopts, free: c.help === 'free' });
  if (c.aim === 'surprise' && c.reasons?.length && c.help !== 'free') s = { ...s, emoji: '🎲', notes: [{ title: 'Pourquoi cette surprise', text: c.reasons.join('\n') }, ...s.notes] };
  c.result = s;
}
function startBuild(parts, bopts) { const c = CP(); c.built = parts.map((p) => ({ ...p, styles: [...(p.styles || [])] })); c.bopts = bopts; rebuild(); render(); scrollRes(); }
ACT.cpPlay = () => { const s = CP().result; if (s) startPlayer(s, { fromGenerator: true }); };
ACT.cpSave = () => { const s = CP().result; if (!s) return; const n = saveSeance(s); const help = CP().help; S.cp = null; ls.set(KEY, {}); CP().help = help; toast('Enregistrée dans Mes séances'); go('library', 'seance', n.id); };
const mv = (i, d) => { const p = CP().parts, j = i + d; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; CP().result = null; CP().partsTouched = true; keep(); render(); };
ACT.cpUp = (el) => mv(Number(el.dataset.i), -1);
ACT.cpDown = (el) => mv(Number(el.dataset.i), 1);
ACT.cpDel = (el) => { CP().parts.splice(Number(el.dataset.i), 1); CP().result = null; CP().partsTouched = true; keep(); render(); };
ACT.cpAdd = (el) => {
  const t = el.dataset.id, p = t === 'climb' ? { type: 'climb', kind: el.dataset.k, intensity: 'mod', minutes: 30, styles: [] } : t === 'main' ? { type: 'main', minutes: 20, activity: el.dataset.k || CP().sport } : { type: t, minutes: t === 'warmup' ? 15 : 10 };
  CP().parts.push(p); CP().result = null; CP().partsTouched = true; keep(); render(); if (t === 'climb') editPart(CP().parts.length - 1);
};
ACT.cpExample = () => { CP().parts = proposeParts(); CP().partsTouched = false; CP().partsFor = partsKey(); CP().result = null; keep(); render(); };
CHG.cpScale = (el) => {
  const c = CP(), total = c.parts.reduce((t, p) => t + p.minutes, 0), want = Math.max(20, Math.min(300, Number(el.value) || total));
  if (!total) return; let acc = 0; c.parts.forEach((p, i) => { p.minutes = i === c.parts.length - 1 ? Math.max(5, want - acc) : Math.max(5, Math.round((p.minutes * want) / total / 5) * 5); acc += p.minutes; });
  c.result = null; c.partsTouched = true; keep(); render();
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
    <div class="chips">${climbStyles().sort((a, b) => a.label.localeCompare(b.label, 'fr')).map((s) => chip((p.styles || []).includes(s.id), s.label, `data-act="cpPartStyle" data-i="${i}" data-id="${s.id}"`))}<input class="chipin" data-change="styleQuick" data-target="cpPart" data-i="${i}" maxlength="40" placeholder="＋ Autre style" aria-label="Ajouter un style"></div>
    <span class="kicker">Comment structurer cette partie ?</span>
    <div class="setmenu">${props.map((s) => h`<button class="setrow ${s.fit ? '' : 'dim'}" data-act="cpPart" data-i="${i}" data-k="structure" data-v="${s.id}"><span class="sic">${s.emoji}</span><span class="grow"><b>${s.name}</b><small>${s.desc}${s.fit ? '' : ' (moins adapté à cette intensité)'}</small></span><span class="chev">${cur === s.id ? '✓' : ''}</span></button>`)}</div>
    ${i > 0 ? h`<label class="row"><input type="checkbox" data-change="cpPartAdapt" data-i="${i}" ${p.adapt ? 'checked' : ''}><span class="grow"><b>Adapter à ce que j’ai fait avant</b><small class="muted"> Moins de doigts ou de puissance si les parties d’avant en ont beaucoup demandé.</small></span></label>
      ${p.adapt ? h`<p class="tiny ${L.notes.length ? 'acc-t' : 'muted'}">${L.notes.length ? L.notes.join(' ') : 'Rien à adapter : ce qui précède reste léger.'}</p>` : ''}` : ''}
    <button class="btn pri" data-act="closeSheet">OK</button></div>`);
}
ACT.cpEdit = (el) => editPart(Number(el.dataset.i));
const upd = (i, fn) => { const p = CP().parts[i]; if (!p) return; fn(p); CP().result = null; CP().partsTouched = true; keep(); render(); editPart(i); };
ACT.cpPart = (el) => upd(Number(el.dataset.i), (p) => { p[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'kind' || el.dataset.k === 'intensity') { delete p.structure; if (el.dataset.k === 'kind') { delete p.from; delete p.to; } } });
CHG.cpPartMinRow = (el) => { const p = CP().parts[Number(el.dataset.i)]; if (!p) return; p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); CP().result = null; CP().partsTouched = true; keep(); render(); };
CHG.cpPartMin = (el) => upd(Number(el.dataset.i), (p) => { p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); });
CHG.cpPartLv = (el) => upd(Number(el.dataset.i), (p) => { const levels = levelsOf(p.kind), sys = sysOf(p.kind), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null); p.from ??= lo; p.to ??= hi; p[el.dataset.k] = Number(el.value); });
ACT.cpPartAuto = (el) => upd(Number(el.dataset.i), (p) => { delete p.from; delete p.to; });
ACT.cpPartStyle = (el) => upd(Number(el.dataset.i), (p) => { const id = el.dataset.id, s = p.styles || []; p.styles = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; });
CHG.cpPartAdapt = (el) => upd(Number(el.dataset.i), (p) => { p.adapt = el.checked; });
export const climbPlanResult = () => S.cp?.result || null;
void raw;
