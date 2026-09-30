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
import { INTENT_FAMILIES, PRIO, subIntentsFor, labelOf } from './intents.js';
import { FILTER_DEFS, filtersFor, effectiveFilters, filterText, MODES } from './filters.js';
import { resolvePlaces, transitions, budget } from './budget.js';
import { placeObjective, cleanObjective, objectiveLabel, whenLabel, WHEN, FAMILY_ROLE, LINKS, chainFor, chainStatus, paramsFor } from './sessionchain.js';
import { ROLES, LOCKABLE, LOCK_STATES, FATIGUE, ATTEMPT_TYPES, FOCUS, VOLUME, TRADEOFFS, PLACE_MODES, normalizePhases, normalizePhase, fitDurations, newPhase, totalMinutes as phTotal, sessionActivities, sessionIntent, activityLabel as actLabel } from './phase.js';
import { proposeForPhase, analyzeSession, applySuggestion, REASON, phaseName } from './phaseplan.js';
import { loadAnalysis } from './brain.js';
import { alternatives } from './generator.js';
import { sportFamily, SPORT_STRUCTS, sportProposals, sportTargets, sportMoves, bestPerf, targetAdvice, targetParts, targetLabel, defaultWorkParts, workTitle, moveName, paceOf, fmtPace } from './sportplan.js';

const KEY = 'sea:climbplan';
const DEFAULT_PARTS = [
  { type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 90, styles: [] },
  { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30, styles: [] }, { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40, styles: [], adapt: true },
  { type: 'cool', minutes: 10 },
];
const CP = () => (S.cp ||= { mode: 'goal', kind: 'bloc', envId: '', sys: {}, target: null, styles: [], minutes: 120, parts: DEFAULT_PARTS.map((p) => ({ ...p })), result: null, ...(ls.get(KEY, {}) || {}), result: null, reasons: [] });
// Le brouillon est gardé sur l'appareil (fermeture accidentelle, hors ligne) : ossature, choix, changements appliqués.
const keep = () => { const { result, reasons, aimDone, bopts, ...rest } = CP(); ls.set(KEY, rest); };
const climbStyles = () => Object.values(ctx().styles || {}).filter((s) => !s.archived && (s.activity === 'climbing' || !s.activity));
const systemsFor = (kind) => Object.values(ctx().systems || {}).filter((s) => s.activity === kind && s.levels?.length);
const sysOf = (kind) => { const c = CP(), all = ctx().systems || {}; return all[c.sys?.[kind]] || pickSystem(ctx(), kind, c.envId); };
const levelsOf = (kind) => sortedLevels(sysOf(kind));
const phSys = (p) => ctx().systems?.[p.systemId] || sysOf(p.kind);
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);
const partTitle = (p) => (p.type === 'work' ? (p.label || workTitle(p)) : p.type === 'main' ? `${sportLabel(p.activity || CP().sport)} : exercices` : p.type === 'climb' ? `${p.kind === 'voie' ? '🧗 Voie' : '🪨 Bloc'} ${INTENSITY[p.intensity]?.[1].toLowerCase() || ''}` : `${CLIMB_PARTS[p.type]?.[0]} ${CLIMB_PARTS[p.type]?.[1]}`);

function sysSelect(kind) {
  const cur = sysOf(kind);
  return h`<label>Cotation ${kind === 'voie' ? 'voie' : 'bloc'}<select data-change="cpSys" data-k="${kind}">${systemsFor(kind).map((s) => h`<option value="${s.id}" ${cur?.id === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>`;
}
/* ═════════ Créer une séance : un seul assistant, pour tous les sports, en 7 étapes ═════════
 * Structure d'abord (phases, verrous), puis propositions expliquées, améliorations au choix, et génération
 * seulement après la validation finale. */
const STEPS = [['how', 'Comment ?'], ['where', 'Sport, lieu et temps'], ['why', 'Pour quoi ?'], ['structure', 'Ta structure'], ['content', 'Propositions par phase'], ['improve', 'Améliorations'], ['validate', 'Valider et générer']];
const NSTEPS = STEPS.length;
/** Niveau de structure : combien l'utilisateur décide de l'ossature (valable aussi pour « Surprends-moi »). */
export const LEVELS = { libre: ['Libre', 'L’app choisit presque toute la structure.'], leger: ['Léger', 'Tu donnes quelques grandes contraintes (durée, sport).'], modere: ['Modéré', 'L’app propose une ossature visible que tu modifies.'], precis: ['Précis', 'Tu contrôles les phases et leurs durées.'], tres: ['Très précis', 'Tu verrouilles tout ce qui compte ; l’app remplit le reste.'] };
const HELP = { auto: ['🤖', 'L’app choisit tout', 'Une séance complète ; ensuite tu peux changer le temps et les exercices de chaque partie.'], guide: ['🧭', 'L’app me guide', 'Pour chaque partie, plusieurs exercices expliqués et l’ordre conseillé : tu choisis.'], free: ['✋', 'Je compose moi-même', 'Tes parties, tes exercices, dans tout le catalogue. Rien d’imposé.'] };
const isClimb = (sp) => sp === 'climbing_boulder' || sp === 'climbing_route';
const kindOf = (sp) => (sp === 'climbing_route' ? 'voie' : 'bloc');
const sportLabel = (id) => { const a = ctx().activities[id] || ACTIVITIES[id]; return a ? `${a.emoji || '🏅'} ${a.label}` : id; };
const envOf = () => { const x = ctx(); return x.envs.find((e) => e.id === CP().envId) || x.defEnv || null; };
export function vClimbPlan() {
  const c = CP(); c.step ||= 1; c.sport ||= Object.keys(ctx().activities)[0] || 'conditioning';
  c.step = Math.max(1, Math.min(NSTEPS, c.step));
  const st = c.step, [, title] = STEPS[st - 1];
  const body = [vHow, vWhere, vWhy, vStructure, vContent, vImprove, vValidate][st - 1]();
  const NEXT = { 4: 'Analyser et proposer le contenu ›', 5: 'Chercher des améliorations ›', 6: 'Dernière vérification ›' };
  return h`<div class="steps"><div class="row between"><b>Étape ${st}/${NSTEPS} · ${title}</b>${st > 1 ? h`<button class="btn sm ghost" data-act="cpRestart">Recommencer</button>` : ''}</div>
      <div class="meter"><i style="width:${Math.round((st / NSTEPS) * 100)}%"></i></div></div>
    ${body}
    <div class="stepdock">${st > 1 ? h`<button class="btn" data-act="cpStep" data-d="-1">‹ Retour</button>` : h`<span></span>`}${st < NSTEPS ? h`<button class="btn pri" data-act="cpStep" data-d="1">${NEXT[st] || 'Suivant ›'}</button>` : ''}</div>`;
}
/* Étape 1 : combien l'app aide. */
function vHow() {
  const c = CP();
  return h`<span class="kicker">Qui choisit les exercices ?</span>
    <div class="setmenu">${Object.entries(HELP).map(([k, [ic, t, d]]) => h`<button class="setrow" data-act="cpHelp" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${(c.help || 'auto') === k ? '✓' : ''}</span></button>`)}</div>
    <span class="kicker">Niveau de structure <span class="tiny muted">(qui décide des phases et des durées)</span></span>
    <div class="chips choice">${Object.entries(LEVELS).map(([k, [l]]) => chip((c.level || 'modere') === k, l, `data-act="cpLevel" data-id="${k}"`))}</div>
    <p class="tiny muted">${LEVELS[c.level || 'modere'][1]}</p>`;
}
ACT.cpLevel = (el) => { const c = CP(); c.level = el.dataset.id; c.partsTouched = false; keep(); render(); };
/* Étape 2 : sport, lieu (avec son matériel et sa cotation), forme, temps. */
function vWhere() {
  const c = CP(), x = ctx(), env = envOf(), eq = [...availableEquipment(x, c.envId)];
  const sports = [...new Set([...Object.keys(x.activities), ...Object.keys(ACTIVITIES)])].filter((id) => x.activities[id] || ACTIVITIES[id]); // tous les sports, même pas encore dans le profil
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
  const AIM = [['goals', '🎯', 'Mes objectifs et mes envies', 'Coche un ou plusieurs objectifs, et ce que tu veux travailler.'], ...(climb ? [['grade', '🧗', 'Réussir une cotation à la fin', 'Ex. un U8 en dévers : échauffement, montée, puis essais.']] : []), ...(sportFamily(c.sport) && sportTargets(c.sport, x).length ? [['target', '🎯', 'Atteindre une performance', TARGET_EX[sportFamily(c.sport)]]] : []), ['surprise', '🎲', 'Surprends-moi', 'Quelque chose de nouveau, ou qui te fait progresser.'], ['none', '🙂', 'Rien de particulier', 'Une séance équilibrée pour ton sport.']];
  const aim = c.aim && AIM.some(([k]) => k === c.aim) ? c.aim : 'goals';
  let detail = '';
  if (aim === 'goals') {
    const ints = intentsFor(c.sport, extraIntents());
    detail = h`<div class="card stack"><span class="kicker">Mes objectifs <span class="tiny muted">(plusieurs possibles)</span></span>
      ${goals.length ? h`<div class="chips">${goals.map((g) => chip((c.goalIds || []).includes(g.id), goalLabel(g), `data-act="cpGoal" data-id="${g.id}"`))}</div>` : h`<p class="small muted">Aucun objectif en cours.</p>`}
      <button class="btn sm" data-act="cpAddGoals">＋ Ajouter des objectifs ici</button>
      <span class="kicker">Ce que je veux travailler <span class="tiny muted">(facultatif)</span></span>
      ${c.focus ? h`<div class="chips"><button type="button" class="chip on" data-act="cpFocusOff">🎯 ${c.focus.label} ✕</button></div>` : ''}
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
      ${advice ? h`<p class="small ${/ambitieux/.test(advice) ? 'warn-t' : 'muted'}">${advice}</p>` : h`<p class="tiny muted">Note ton maximum dans <button class="linkish acc-t" data-act="allGo" data-to="profile/perfs">Records et mesures</button> pour un conseil sur l’objectif.</p>`}</div>`;
  } else if (aim === 'target') {
    const ts = sportTargets(c.sport, x), mid = ts.some((t) => t.id === c.tMetric) ? c.tMetric : ts[0].id, t = ts.find((y) => y.id === mid), known = bestPerf(x, mid);
    const val = Number.isFinite(c.tValue) && c.tMetric === mid ? c.tValue : null, pace = val != null ? paceOf(mid, val) : null;
    detail = h`<div class="card stack"><label>Ma performance visée<select data-change="cpTMetric" data-pick="yes" data-add="metricNew" data-add-label="Créer une mesure">${ts.map((y) => h`<option value="${y.id}" ${y.id === mid ? 'selected' : ''}>${y.label}</option>`)}</select></label>
      <label>Valeur visée<span class="unitbox"><input type="number" inputmode="decimal" step="any" value="${val ?? ''}" data-change="cpTValue" placeholder="${known ?? ''}" aria-label="Valeur visée"><em>${t.unit === 'reps' ? 'rép.' : t.unit}</em></span></label>
      <p class="tiny muted">${known != null ? `Ta meilleure perf notée : ${known} ${t.unit === 'reps' ? 'rép.' : t.unit}.` : 'Aucune perf notée pour l’instant.'}${pace ? ` Allure visée : ${fmtPace(pace)}.` : ''}</p>
      ${val != null ? h`<p class="small ${/ambitieux/.test(targetAdvice(mid, val, known, x)) ? 'warn-t' : 'muted'}">${targetAdvice(mid, val, known, x)}</p>` : h`<p class="tiny muted">Écris ta cible : la séance est construite pour l’atteindre (échauffement, montée, spécifique, objectif).</p>`}</div>`;
  } else if (aim === 'surprise') {
    detail = h`<div class="setmenu">${Object.entries(AIMS).map(([k, [ic, t, d]]) => h`<button class="setrow" data-act="cpSurAim" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${(c.surAim || 'any') === k ? '✓' : ''}</span></button>`)}</div>`;
  }
  return h`<div class="setmenu">${AIM.map(([k, ic, t, d]) => h`<button class="setrow" data-act="cpAim" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${aim === k ? '✓' : ''}</span></button>`)}</div>
    ${aim === 'surprise' ? '' : objectiveCard()}${detail}
    <div class="card stack"><label>📝 Mon intention pour aujourd’hui <span class="tiny muted">(facultatif)</span><textarea data-change="cpIntentText" maxlength="240" rows="2" placeholder="Ex. « Aujourd’hui je veux performer le plus possible en voie »">${c.intentText || ''}</textarea></label>
      <p class="tiny muted">Elle sert à cette séance seulement : ce n’est pas un objectif de ton profil.</p>
      ${c.intentText ? (c.intentGoal ? h`<p class="tiny ok-t">✓ Aussi enregistrée comme objectif.</p>` : h`<button class="btn sm" data-act="cpIntentGoal">🎯 Enregistrer aussi comme objectif</button>`) : ''}</div>`;
}
CHG.cpIntentText = (el) => { const c = CP(); c.intentText = el.value.slice(0, 240); c.intentGoal = ''; keep(); render(); };
// Seulement sur action explicite : l'intention devient un objectif (fiche relue et modifiable avant l'enregistrement).
ACT.cpIntentGoal = () => { const c = CP(); keep(); ACT.goalFromText?.({ dataset: { text: c.intentText, back: 'cp' } }); };
const TARGET_EX = { run: 'Ex. 10 km en 50 min : échauffement, montée, blocs à l’allure visée.', swim: 'Ex. 100 m en 1:40 : éducatifs, montée, séries à l’allure visée.', load: 'Ex. 100 kg au squat : montée en charge, paliers, puis volume.', body: 'Ex. 15 tractions : séries faciles, séries max, pyramide.' };
CHG.cpTMetric = (el) => { const c = CP(); c.tMetric = el.value; c.tValue = null; keep(); render(); };
CHG.cpTValue = (el) => { const c = CP(), v = Number(String(el.value).replace(',', '.')); c.tMetric ||= sportTargets(c.sport, ctx())[0]?.id; c.tValue = Number.isFinite(v) && el.value !== '' ? v : null; keep(); render(); };
/* ───────── Objectif de la séance : quoi → précisément → quand (début, milieu, fin, toute la séance ou une phase) ───────── */
const prioRows = (list, act, extra = '') => (list?.length ? h`<div class="stack tight">${list.map((x) => h`<div class="row between wrapf prow"><span class="small">${labelOf(x.id)}</span><span class="chips tight">${[1, 2, 3, 4].map((v) => chip(x.prio === v, String(v), `data-act="${act}" data-id="${x.id}" data-v="${v}" ${extra} title="${PRIO[v]}" aria-label="${labelOf(x.id)} : ${PRIO[v]}"`))}</span></div>`)}<p class="tiny muted">1 = secondaire · 2 = important · 3 = prioritaire · 4 = très prioritaire</p></div>` : '');
function objectiveCard() {
  const c = CP(), o = c.objective || {}, subs = o.family ? subIntentsFor(c.sport)[o.family] || [] : [], sel = (id) => (o.subIntents || []).some((x) => x.id === id);
  const hint = { start: 'Juste après l’échauffement, quand tu es encore frais.', middle: 'Au cœur de la séance, après une montée progressive.', end: 'En fin de séance, après la préparation.', all: 'Chaque phase de travail y contribue.' };
  return h`<div class="card stack chain"><h3 style="margin:0">🎯 Objectif de la séance <span class="tiny muted">(facultatif)</span></h3>
    <span class="kicker">1 · Quoi ?</span>
    <div class="chips">${chip(!o.family, 'Aucun en particulier', 'data-act="cpObjFam" data-id=""')}${Object.entries(INTENT_FAMILIES).map(([k, f]) => chip(o.family === k, `${f.emoji} ${f.label}`, `data-act="cpObjFam" data-id="${k}"`))}</div>
    ${o.family ? h`<span class="kicker">2 · Précisément <span class="tiny muted">(plusieurs possibles)</span></span>
      <div class="chips">${subs.map((x) => chip(sel(x.id), x.label, `data-act="cpObjSub" data-id="${x.id}"`))}</div>${prioRows(o.subIntents, 'cpObjPrio')}
      <span class="kicker">3 · À quel moment de la séance ?</span>
      <div class="chips">${Object.entries(WHEN).map(([k, l]) => chip((o.when || 'end') === k, l, `data-act="cpObjWhen" data-id="${k}"`))}</div>
      <p class="tiny muted">${hint[o.when] || (o.when?.startsWith('ph:') ? 'Sur la phase que tu as choisie.' : hint.end)} À l’étape suivante, tu peux aussi le poser sur une phase précise.</p>` : ''}</div>`;
}
const objSet = (fn) => { const c = CP(); c.objective = c.objective || { family: '', subIntents: [], when: 'end' }; fn(c.objective); if (!c.objective.family) c.objective = null; keep(); render(); };
ACT.cpObjFam = (el) => objSet((o) => { if (o.family !== el.dataset.id) o.subIntents = []; o.family = el.dataset.id; });
ACT.cpObjSub = (el) => objSet((o) => { const id = el.dataset.id, l = o.subIntents || []; o.subIntents = l.some((x) => x.id === id) ? l.filter((x) => x.id !== id) : [...l, { id, prio: 3 }]; });
ACT.cpObjPrio = (el) => objSet((o) => { o.subIntents = (o.subIntents || []).map((x) => (x.id === el.dataset.id ? { ...x, prio: Number(el.dataset.v) } : x)); });
ACT.cpObjWhen = (el) => objSet((o) => { o.when = el.dataset.id; });
/** Déplacer l'objectif depuis « Ta structure » (moment ou phase précise) : la structure est réorganisée, rien d'autre. */
CHG.cpObjWhere = (el) => { const c = CP(); if (!c.objective) return; c.objective.when = el.value; const r = placeObjective(c.parts, c.objective); c.parts = r.phases; c.partsTouched = true; c.result = null; keep(); render(); if (r.notes.length) toast(r.notes[0], 4000); };
const withObjective = (phases) => { const o = cleanObjective(CP().objective); return o ? placeObjective(phases, o).phases : phases; };

/* ───────── Filtres : séance → phase → exercice, selon l'activité ───────── */
const levelOfScope = (scope) => (scope === 'g' ? (CP().filters ||= {}) : (CP().parts[Number(scope)].filters ||= {}));
function filterField(key, scope, inherited) {
  const d = FILTER_DEFS[key], lvl = levelOfScope(scope), cur = lvl[key], mode = cur?.mode || (inherited !== undefined ? 'keep' : 'replace');
  const val = cur?.value ?? null;
  const attrs = (x) => `data-s="${scope}" data-k="${key}" ${x}`;
  let editor = '';
  if (mode === 'refine' || mode === 'replace') {
    if (d.type === 'multi') editor = h`<div class="chips">${d.options.map((o) => chip((val || []).includes(o.id), o.label, `data-act="cpFlt" ${attrs(`data-id="${o.id}"`)}`))}</div>`;
    else if (d.type === 'enum') editor = h`<div class="chips">${d.options.map((o) => chip(val === o.id, o.label, `data-act="cpFlt" ${attrs(`data-id="${o.id}"`)}`))}</div>`;
    else if (d.type === 'num') editor = h`<input type="number" min="${d.min}" max="${d.max}" value="${val ?? ''}" data-change="cpFltNum" ${raw(attrs(''))} aria-label="${d.label}" placeholder="—">`;
    else editor = h`<div class="grid2"><label class="tiny">Min<input type="number" step="any" value="${val?.min ?? ''}" data-change="cpFltRange" data-b="min" ${raw(attrs(''))}></label><label class="tiny">Max<input type="number" step="any" value="${val?.max ?? ''}" data-change="cpFltRange" data-b="max" ${raw(attrs(''))}></label></div>`;
  }
  return h`<div class="fltrow"><div class="row between wrapf"><b class="small">${d.label}</b>${inherited !== undefined ? h`<span class="chips tight">${Object.entries(MODES).map(([m, l]) => chip(mode === m, l, `data-act="cpFltMode" data-id="${m}" ${attrs('')}`))}</span>` : cur ? h`<button type="button" class="chip" data-act="cpFltClear" ${raw(attrs(''))} aria-label="Effacer ${d.label}">✕</button>` : ''}</div>
    ${inherited !== undefined && mode === 'keep' ? h`<p class="tiny muted">Hérité de la séance : ${filterText({ [key]: inherited }).join('') || '—'}</p>` : ''}${mode === 'remove' ? h`<p class="tiny muted">Retiré pour cette phase.</p>` : ''}${editor}</div>`;
}
const setFlt = (el, fn) => {
  const lvl = levelOfScope(el.dataset.s), k = el.dataset.k, cur = { ...(lvl[k] || { mode: 'replace', value: null }) };
  fn(cur, FILTER_DEFS[k]);
  if (cur.mode !== 'remove' && cur.mode !== 'keep' && (cur.value == null || (Array.isArray(cur.value) && !cur.value.length)) && !(cur.mode === 'refine' || (cur.mode === 'replace' && el.dataset.act === 'cpFltMode'))) delete lvl[k]; else lvl[k] = cur;
  if (cur.mode === 'keep') delete lvl[k];
  const c = CP(); c.result = null; c.partsTouched = true; keep(); render(); if (el.dataset.s === 'g') filtersSheet(); else editPart(Number(el.dataset.s));
};
ACT.cpFlt = (el) => setFlt(el, (cur, d) => { const id = el.dataset.id; if (cur.mode === 'keep' || cur.mode === 'remove') cur.mode = 'replace'; if (d.type === 'multi') { const l = cur.value || []; cur.value = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; } else cur.value = cur.value === id ? null : id; });
CHG.cpFltNum = (el) => setFlt(el, (cur) => { cur.value = el.value === '' ? null : Number(el.value); if (cur.mode === 'keep') cur.mode = 'replace'; });
CHG.cpFltRange = (el) => setFlt(el, (cur) => { const v = { ...(cur.value || {}) }; v[el.dataset.b] = el.value === '' ? null : Number(el.value); cur.value = v.min == null && v.max == null ? null : v; if (cur.mode === 'keep') cur.mode = 'replace'; });
ACT.cpFltMode = (el) => setFlt(el, (cur) => { cur.mode = el.dataset.id; if (cur.mode === 'keep' || cur.mode === 'remove') cur.value = null; });
ACT.cpFltClear = (el) => setFlt(el, (cur) => { cur.value = null; cur.mode = 'replace'; });
const globalKeys = () => filtersFor(CP().sport).filter((k) => !['exclus', 'duree', 'cotation', 'essais', 'style'].includes(k));
function filtersSheet() {
  openSheet(h`<div class="stack"><h2 style="margin:0">🔎 Filtres pour toute la séance</h2><p class="tiny muted">Chaque phase en hérite, et peut les garder, les préciser, les remplacer ou les retirer. Tous les filtres peuvent s’additionner : si rien ne peut y répondre, l’app le dit et propose quoi relâcher.</p>
    ${globalKeys().map((k) => filterField(k, 'g'))}<button class="btn pri" data-act="closeSheet">OK</button></div>`, { wide: true });
}
ACT.cpFilters = () => filtersSheet();
const globalFilterValues = () => effectiveFilters([CP().filters || {}]).filters;
const placesNow = (list) => { const c = CP(); return resolvePlaces(list || c.built || c.parts, ctx().envs, c.envId || ctx().defEnv?.id || ''); };
const eqAt = (i) => placesNow()[i]?.equipment || eqNow();

/* ═════════ Étape 4 : « Ta structure » — l'ossature, visible et modifiable, AVANT tout exercice ═════════ */
const LIMITS = ['Fatigue excessive', 'Essais max répétés', 'Doigts (réglettes)', 'Sauts et impacts', 'Charges lourdes', 'Épaules'];
const lockIc = (p, k) => LOCK_STATES[p.locks?.[k] || 'free'][0];
/** Intention ponctuelle de la séance (texte + capacités des intentions cochées) : jamais un objectif du compte. */
function sessIntent() {
  const c = CP(), caps = {};
  for (const it of intentsFor(c.sport, extraIntents()).filter((x) => (c.intents || []).includes(x.id))) for (const [k, w] of Object.entries(it.caps || {})) caps[k] = Math.max(caps[k] || 0, w);
  for (const [k, w] of Object.entries(c.focus?.caps || {})) caps[k] = Math.max(caps[k] || 0, w);
  return sessionIntent({ text: c.intentText, priorities: Object.entries(caps).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k), savedAsGoal: c.intentGoal || '' });
}
function vStructure() {
  const c = CP(), lvl = c.level || 'modere', ph = c.parts, total = phTotal(ph), acts = sessionActivities(ph);
  const compact = (lvl === 'libre' || lvl === 'leger') && !c.editStruct;
  if (c.aim === 'surprise' && !isClimb(c.sport) && compact) return h`<div class="card"><p class="small">🎲 Niveau « ${LEVELS[lvl][0]} » : la surprise choisit la structure. Passe à l’étape suivante pour la découvrir.</p><button class="btn sm" data-act="cpEditStruct">✏️ Construire la structure moi-même</button></div>`;
  const fit = total !== c.minutes ? fitDurations(ph, c.minutes) : null;
  const tr = transitions(ph, ctx().envs, c.envId || ctx().defEnv?.id || ''), bu = budget(ph, c.minutes, tr), obj = cleanObjective(c.objective), nf = Object.keys(c.filters || {}).length;
  const issues = tr.flatMap((t) => t.issues.map((x) => ({ ...x, to: t.to })));
  return h`<div class="card stack"><div class="row between wrapf"><b>${fmtMin(bu.needed || total)} au total</b><span class="tiny muted">${ph.length} phase${ph.length > 1 ? 's' : ''} · ${acts.length > 1 ? `${acts.length} activités` : actLabel(acts[0] || c.sport)}${bu.travel ? ` · 🚗 ${bu.travel} min de déplacement` : ''}</span></div>
      <p class="tiny ${bu.over ? 'warn-t' : 'muted'}">⏱ ${bu.text}</p>
      ${bu.over ? h`<details class="how mini" open><summary>Ce qui pourrait être sacrifié</summary>${bu.sacrifice.map((x, k) => h`<div class="row between wrapf"><span class="small">${x.text} <span class="tiny muted">— ${x.compromise}</span></span><button class="btn sm" data-act="cpSacrifice" data-id="${k}">Appliquer</button></div>`)}</details>` : ''}
      ${total !== c.minutes && !bu.travel ? h`<div class="row wrapf">${fit?.ok ? h`<button class="btn sm" data-act="cpFit">⚖️ Ajuster à ${fmtMin(c.minutes)} (les 🔒 ne bougent pas)</button>` : h`<span class="tiny warn-t">${fit?.error || ''}</span>`}<button class="btn sm ghost" data-act="cpKeepTotal">Garder ${fmtMin(total)}</button></div>` : bu.travel && total !== c.minutes ? h`<button class="btn sm ghost" data-act="cpKeepTotal">Garder ${fmtMin(total)} de phases</button>` : ''}
      ${sessIntent().text ? h`<p class="tiny acc-t">📝 Intention d’aujourd’hui : « ${sessIntent().text} »</p>` : ''}
      ${obj ? h`<div class="row between wrapf"><span class="small">🎯 <b>${objectiveLabel(obj)}</b>${obj.subIntents.length ? ` : ${obj.subIntents.map((x) => labelOf(x.id)).join(', ')}` : ''}</span>
        <select data-change="cpObjWhere" aria-label="Moment de l’objectif">${Object.entries(WHEN).map(([k, l]) => h`<option value="${k}" ${obj.when === k ? 'selected' : ''}>${l}</option>`)}${ph.map((p, k) => (p.type === 'pause' ? '' : h`<option value="ph:${p.id}" ${obj.when === 'ph:' + p.id ? 'selected' : ''}>Phase ${k + 1} : ${phaseName(p)}</option>`))}</select></div>` : ''}
      <button class="btn sm" data-act="cpFilters">🔎 Filtres pour toute la séance${nf ? ` (${nf})` : ''}</button>
      ${nf ? h`<p class="tiny muted">${filterText(globalFilterValues()).join(' · ')}</p>` : ''}</div>
    ${issues.length ? h`<div class="card flat warn-b stack"><b class="small">↔️ Transitions entre phases</b>${issues.map((x) => h`<div class="row between wrapf"><span class="small">Phase ${x.to + 1} : ${x.text}</span>${x.proposal ? h`<button class="btn sm" data-act="cpTransPause" data-id="${x.to}">＋ ${x.proposal.minutes} min de récupération</button>` : ''}</div>`)}</div>` : ''}
    ${compact ? h`<div class="setmenu">${ph.map((p) => h`<div class="setrow"><span class="sic">${ROLES[p.role][0]}</span><span class="grow"><b>${phaseName(p)}</b><small>${actLabel(p.activity)} · ${fmtMin(p.minutes)}</small></span></div>`)}</div>
        <button class="btn" data-act="cpEditStruct">✏️ Modifier la structure</button>` : vPhases()}`;
}
ACT.cpEditStruct = () => { CP().editStruct = true; keep(); render(); };
/** Appliquer un sacrifice proposé par le budget (seulement sur ton clic ; les 🔒 ne bougent pas). */
ACT.cpSacrifice = (el) => {
  const c = CP(), bu = budget(c.parts, c.minutes, transitions(c.parts, ctx().envs, c.envId || ctx().defEnv?.id || '')), x = bu.sacrifice[Number(el.dataset.id)]; if (!x) return;
  if (x.travel) c.parts.forEach((p) => { if (p.locks?.place !== 'user') p.place = { mode: 'same', envId: '', travelMin: null }; });
  else if (x.remove) c.parts.splice(x.index, 1);
  else { const p = c.parts[x.index]; if (p && p.locks?.minutes !== 'user') p.minutes -= x.minutes; }
  c.partsTouched = true; c.result = null; keep(); render(); toast(`Fait : ${x.text.toLowerCase()}.`);
};
ACT.cpTransPause = (el) => { const c = CP(), at = Number(el.dataset.id); c.parts.splice(at, 0, newPhase('pause', { minutes: 10, goal: 'Récupérer avant la suite' }, Date.now() + at)); c.partsTouched = true; c.result = null; keep(); render(); };
ACT.cpKeepTotal = () => { const c = CP(); c.minutes = phTotal(c.parts); keep(); render(); };
ACT.cpFit = () => { const c = CP(), r = fitDurations(c.parts, c.minutes); if (!r.ok) return toast(r.error, 4500); c.parts = r.phases; c.partsTouched = true; keep(); render(); };
/* ═════════ Étape 5 : propositions classées et expliquées, phase par phase ═════════ */
function vContent() {
  const c = CP(); if (!c.result) buildNow();
  return c.result ? vResult() : h`<div class="card"><p class="small warn-t">Impossible de préparer les propositions. Reviens à l’étape d’avant.</p></div>`;
}
/* ═════════ Étape 6 : améliorations proposées (jamais appliquées sans toi) ═════════ */
function suggestionsNow() {
  const c = CP(); if (!c.built) return [];
  return analyzeSession(c.built, ctx(), { eq: eqNow(), load: loadAnalysis(ctx()), intent: sessIntent() }).filter((x) => !(c.ignored || []).includes(x.id));
}
const whyList = (why) => h`<ul class="clean tight tiny why">${why.map((r) => h`<li title="${REASON[r.cat][1]}">${REASON[r.cat][0]} ${r.text}</li>`)}</ul>`;
function vImprove() {
  const c = CP(); if (!c.built) buildNow();
  if (!c.built) return h`<div class="card"><p class="small">🎲 Surprise sans structure : rien à améliorer ici. Continue pour valider.</p></div>`;
  const list = suggestionsNow();
  return h`<p class="small muted">L’app relit toute ta séance et te propose des améliorations. Rien n’est changé sans ton accord.</p>
    ${(c.hist || []).length ? h`<button class="btn sm" data-act="cpUndo">↶ Revenir à la structure précédente</button>` : ''}
    ${(c.changes || []).length ? h`<div class="card flat ok-b"><b class="small">✓ Déjà appliqué</b><ul class="clean tight small">${c.changes.map((t) => h`<li>${t}</li>`)}</ul></div>` : ''}
    ${list.length ? list.map((x) => h`<div class="card sugg"><b>${x.title}</b>${x.problem ? h`<p class="tiny muted">Problème : ${x.problem}</p>` : ''}<p class="small">${x.text}</p>
        ${x.benefit ? h`<p class="tiny"><span class="ok-t">＋ ${x.benefit}</span>${x.compromise ? h` · <span class="warn-t">− ${x.compromise}</span>` : ''}</p>` : ''}<details class="how mini"><summary>Pourquoi ?</summary>${whyList(x.why)}</details>
        ${x.blocked ? h`<p class="tiny warn-t">🔒 ${x.blocked}</p>` : ''}
        <div class="row wrapf">${x.patch ? h`<button class="btn sm pri" data-act="cpSugApply" data-id="${x.id}" ${x.blocked ? 'disabled' : ''}>Appliquer</button>` : ''}<button class="btn sm" data-act="cpSugEdit" data-id="${x.id}">Modifier</button><button class="btn sm ghost" data-act="cpSugIgnore" data-id="${x.id}">Ignorer</button></div></div>`)
      : h`<div class="card"><p class="small">👍 Rien à signaler : ta séance est cohérente avec ce que tu as choisi.</p></div>`}
    ${(c.ignored || []).length ? h`<button class="btn sm ghost" data-act="cpSugReset">Revoir les ${c.ignored.length} suggestion(s) ignorée(s)</button>` : ''}`;
}
const pushHist = () => { const c = CP(); c.hist = [...(c.hist || []), JSON.stringify({ parts: c.parts, built: c.built, changes: c.changes || [] })].slice(-15); };
ACT.cpSugApply = (el) => {
  const c = CP(), x = suggestionsNow().find((y) => y.id === el.dataset.id); if (!x) return;
  const r = applySuggestion(c.built, x); if (!r.applied) return toast(x.blocked || 'Suggestion impossible à appliquer.', 4000);
  pushHist(); const picks = Object.fromEntries(c.built.map((p) => [p.id, p.pick]));
  c.built = r.phases.map((p) => ({ ...p, pick: picks[p.id] })); c.parts = c.built.map(({ pick, ...p }) => p); c.partsTouched = true;
  c.changes = [...(c.changes || []), x.title]; c.generated = false; rebuild(); keep(); render(); toast('Appliqué. « ↶ Revenir » annule.');
};
ACT.cpSugIgnore = (el) => { const c = CP(); c.ignored = [...new Set([...(c.ignored || []), el.dataset.id])]; keep(); render(); };
ACT.cpSugReset = () => { CP().ignored = []; keep(); render(); };
ACT.cpSugEdit = (el) => {
  // Modifier : on ouvre la phase concernée dans l'éditeur de la structure.
  const c = CP(), x = suggestionsNow().find((y) => y.id === el.dataset.id), id = x?.patch?.find((o) => o.id)?.id;
  c.step = 4; keep(); render(); window.scrollTo(0, 0);
  const i = c.parts.findIndex((p) => p.id === id); if (i >= 0) setTimeout(() => editPart(i), 60);
};
ACT.cpUndo = () => {
  const c = CP(), last = (c.hist || []).pop(); if (!last) return;
  const st = JSON.parse(last); c.parts = st.parts; c.built = st.built; c.changes = st.changes; c.generated = false; rebuild(); keep(); render(); toast('Structure précédente rétablie.');
};
/* ═════════ Étape 7 : dernière validation, puis génération ═════════ */
const INT_W = { easy: 1, mod: 2, hard: 3, max: 4 };
const loadOf = (ph) => ph.reduce((t, p) => t + (p.type === 'pause' ? 0 : (Number(p.minutes) || 0) * (INT_W[p.intensity] || 2)), 0);
function vValidate() {
  const c = CP(); if (!c.built && !c.result) buildNow();
  const ph = c.built || [], sug = c.built ? suggestionsNow() : [], intent = sessIntent();
  const appDecides = ph.filter((p) => p.type !== 'pause' && !Array.isArray(p.pick)).map(phaseName);
  if (c.generated && c.result) return vResult(true);
  return h`<div class="card stack"><h3 style="margin:0">📋 Ta séance avant génération</h3>
      <p class="small"><b>${fmtMin(phTotal(ph) || c.minutes)}</b> · ${ph.length} phase${ph.length > 1 ? 's' : ''} · ${sessionActivities(ph).map(actLabel).join(', ') || sportLabel(c.sport)}</p>
      ${intent.text ? h`<p class="small">📝 Intention : « ${intent.text} » <span class="tiny muted">(pour cette séance seulement)</span></p>` : ''}
      <p class="small">⏱ ${budget(ph, c.minutes, transitions(ph, ctx().envs, c.envId || ctx().defEnv?.id || '')).text}</p>
      <p class="small">📈 Charge estimée : <b>${loadOf(ph)}</b> <span class="tiny muted">(minutes × intensité, indicatif : ${loadOf(ph) < 150 ? 'légère' : loadOf(ph) < 350 ? 'moyenne' : 'élevée'})</span></p>
      ${cleanObjective(c.objective) ? h`<p class="small">🎯 Objectif : ${objectiveLabel(cleanObjective(c.objective))} · ${whenLabel(cleanObjective(c.objective), ph)}</p>` : ''}
      ${Object.keys(c.filters || {}).length ? h`<p class="small">🔎 Filtres : ${filterText(globalFilterValues()).join(' · ')}</p>` : ''}
      <ol class="small">${ph.map((p, k) => h`<li><b>${phaseName(p)}</b>${p.objective ? ' 🎯' : ''} — ${actLabel(p.activity)} · ${fmtMin(p.minutes)} · ${ROLES[p.role][1]}${p.travelBefore ? ` · 🚗 ${p.travelBefore} min avant` : ''}${p.envName ? ` · 📍 ${p.envName}` : ''}${p.subIntents?.length ? ` · ${p.subIntents.map((x) => `${labelOf(x.id)} (${x.prio})`).join(', ')}` : ''}${Object.keys(p.filters || {}).length ? ` · ${filterText(effectiveFilters([c.filters || {}, p.filters]).filters).join(', ')}` : ''}${p.priorities.length ? ` · priorités : ${p.priorities.map((k) => CAPACITIES[k]?.label.toLowerCase() || k).join(', ')}` : ''}${p.avoid.length ? ` · limiter : ${p.avoid.join(', ').toLowerCase()}` : ''}${p.constraints ? ` · ${p.constraints}` : ''}${Object.entries(p.locks).filter(([, v]) => v === 'user').length ? ` · 🔒 ${Object.entries(p.locks).filter(([, v]) => v === 'user').map(([k]) => LOCKABLE[k].toLowerCase()).join(', ')}` : ''}</li>`)}</ol>
      ${(c.changes || []).length ? h`<p class="small">✓ Changements appliqués : ${c.changes.join(' ; ')}</p>` : ''}
      ${sug.length ? h`<p class="small warn-t">⚠️ Points d’attention : ${sug.map((x) => x.title).join(' ; ')}</p>` : ''}
      ${appDecides.length ? h`<p class="tiny muted">🤖 Laissé à l’app : les exercices de ${appDecides.join(', ')}.</p>` : ''}
      <button class="btn pri big" data-act="cpGenerate">✅ Générer la séance</button></div>`;
}
ACT.cpGenerate = () => { const c = CP(); if (c.built) rebuild(); else buildNow(); c.generated = true; keep(); render(); scrollRes(); };
/** Format proposé selon le sport, le temps et le « pour quoi ». */
function proposeParts() {
  const c = CP(), M = c.minutes || 60, kind = kindOf(c.sport);
  if (isClimb(c.sport) && c.aim === 'grade') return goalParts({ kind, target: c.targetShown ?? c.target ?? 0, levels: levelsOf(kind), styles: c.styles, minutes: M });
  if (isClimb(c.sport) && c.aim === 'surprise') { const r = surpriseClimbParts({ kind, minutes: M, aim: c.surAim || 'any', forme: FORME_MAP[c.forme] || 'normal', envId: c.envId, seed: c.seed || 1 }, ctx()); c.reasons = r.reasons; c.aimDone = r.aim; c.surName = r.name; c.surGoal = r.goal; c.surSystem = r.system?.id || ''; return r.parts; }
  if (isClimb(c.sport)) {
    const warm = Math.min(15, Math.round(M * 0.12)), cool = Math.min(10, Math.max(5, Math.round(M * 0.07))), rest = M - warm - cool, low = FORME_MAP[c.forme] === 'low';
    return [{ type: 'warmup', minutes: warm }, { type: 'climb', kind, intensity: low ? 'mod' : 'hard', minutes: Math.round(rest * 0.6), styles: [] }, { type: 'climb', kind, intensity: 'easy', minutes: rest - Math.round(rest * 0.6), styles: [], adapt: true }, { type: 'cool', minutes: cool }];
  }
  if (sportFamily(c.sport)) {
    const tm = c.tMetric || sportTargets(c.sport, ctx())[0]?.id;
    if (c.aim === 'target' && tm && Number.isFinite(c.tValue)) return targetParts({ sport: c.sport, metricId: tm, value: c.tValue, minutes: M });
    // Mouvement travaillé : celui d'un objectif coché s'il en a un, sinon le premier du sport.
    const gm = (c.goalIds || []).map((id) => ctx().goals.find((g) => g.id === id)?.metricId).find((id) => id && sportMoves(c.sport, ctx()).some((m) => m.id === id));
    return defaultWorkParts(c.sport, M, FORME_MAP[c.forme] || 'normal', gm || '');
  }
  return presetParts('classique', M).map((p) => (p.type === 'main' ? { ...p, activity: c.sport } : p));
}
const FORME_MAP = { exhausted: 'low', tired: 'low', ok: 'normal', fresh: 'normal', top: 'top' };
function buildOpts() {
  const c = CP(), env = envOf(), x = ctx(), ints = [...intentsFor(c.sport, extraIntents()).filter((it) => (c.intents || []).includes(it.id)).map((it) => ({ label: it.label, caps: it.caps })), ...(c.focus ? [c.focus] : [])];
  const names = (c.goalIds || []).map((id) => x.goals.find((g) => g.id === id)).filter(Boolean).map(goalLabel);
  const levels = levelsOf(kindOf(c.sport)), t = c.targetShown ?? c.target;
  const tgt = c.aim === 'target' && c.tMetric && Number.isFinite(c.tValue) ? targetLabel(c.tMetric, c.tValue) : '';
  const intent = sessIntent();
  if (tgt) return { intent, sport: c.sport, envId: c.envId || x.defEnv?.id || '', envName: env?.name || '', goalIds: c.goalIds || [], intents: ints, avoidZones: c.zones || [], light: FORME_MAP[c.forme] === 'low', goal: `Objectif : ${tgt}.`, name: `Objectif ${tgt}`, emoji: (x.activities[c.sport] || ACTIVITIES[c.sport])?.emoji, seed: c.seed || 1 };
  const goal = c.aim === 'grade' ? `Réussir ${kindOf(c.sport) === 'voie' ? 'une voie' : 'un bloc'} ${levels[t]?.label || ''}${c.styles.length ? ' en ' + c.styles.map((id) => x.styles[id]?.label?.toLowerCase() || id).join(', ') : ''}.`
    : c.aim === 'surprise' ? c.surGoal || '' : names.length ? `Pour : ${names.join(', ')}.` : '';
  const name = c.aim === 'grade' ? `Objectif ${levels[t]?.label || ''}` : c.aim === 'surprise' ? c.surName || 'Surprise' : names.length ? names.slice(0, 2).join(' + ') : `${sportLabel(c.sport).replace(/^\S+\s/, '')} — ${fmtMin(c.minutes || 60)}`;
  return { intent, sport: c.sport, envId: c.envId || x.defEnv?.id || '', envName: env?.name || '', goalIds: c.goalIds || [], intents: ints, avoidZones: c.zones || [], light: FORME_MAP[c.forme] === 'low',
    systems: isClimb(c.sport) ? { [kindOf(c.sport)]: (c.surSystem && x.systems[c.surSystem]) || sysOf(kindOf(c.sport)) } : undefined, goal, name, emoji: isClimb(c.sport) ? '' : (x.activities[c.sport] || ACTIVITIES[c.sport])?.emoji, seed: c.seed || 1 };
}
function buildNow() {
  const c = CP();
  if (c.aim === 'surprise' && !isClimb(c.sport)) {
    try { const r = surprise({ activityId: c.sport, minutes: c.minutes || 45, forme: FORME_MAP[c.forme] || 'normal', aim: c.surAim || 'any', envId: c.envId, seed: c.seed || 1 }, ctx()); c.built = null; c.result = r.session; c.reasons = r.reasons; c.aimDone = r.aim; }
    catch (e) { toast('Impossible de préparer la surprise : ' + e.message, 4500, 'bad'); }
    return;
  }
  // L'ossature validée devient la base des propositions ; les choix déjà faits sur une phase sont gardés.
  const prev = Object.fromEntries((c.built || []).map((p) => [p.id, p.pick]));
  const norm = normalizePhases(c.parts, c.sport), pls = placesNow(norm), tr = transitions(norm, ctx().envs, c.envId || ctx().defEnv?.id || '');
  c.built = norm.map((p, i) => ({ ...p, styles: [...(p.styles || [])], ...(prev[p.id] !== undefined ? { pick: prev[p.id] } : {}),
    ...(pls[i]?.envId && pls[i].envId !== (c.envId || ctx().defEnv?.id || '') ? { envId: pls[i].envId, envName: pls[i].name } : {}), travelBefore: tr.find((t) => t.to === i)?.travel || 0 }));
  c.bopts = buildOpts(); rebuild();
}
/** Ossature proposée, avec les verrous qui correspondent au niveau de structure choisi. */
function proposedPhases() {
  const c = CP(), lvl = c.level || 'modere', lock = { precis: { minutes: 'user' }, tres: { minutes: 'user', activity: 'user', goal: 'user', intensity: 'user' } }[lvl] || {};
  return normalizePhases(proposeParts(), c.sport).map((p) => ({ ...p, locks: { ...p.locks, ...lock } }));
}
ACT.cpStep = (el) => {
  const c = CP(), d = Number(el.dataset.d), next = Math.max(1, Math.min(NSTEPS, c.step + d));
  if (d > 0 && c.step === 3 && (!c.partsTouched || c.partsFor !== partsKey())) { c.parts = proposedPhases(); c.partsFor = partsKey(); c.partsTouched = false; c.hist = []; c.changes = []; c.ignored = []; }
  if (d > 0 && c.step === 3) c.parts = withObjective(normalizePhases(c.parts, c.sport));
  if (d > 0 && c.step === 4) { c.result = null; c.generated = false; buildNow(); }
  if (next < NSTEPS) c.generated = false;
  c.step = next; keep(); render(); window.scrollTo(0, 0);
};
const partsKey = () => { const c = CP(); return JSON.stringify([c.objective?.family || '', c.level || 'modere', c.sport, c.minutes, c.aim, c.aim === 'grade' ? c.targetShown ?? c.target : c.aim === 'target' ? [c.tMetric, c.tValue] : '', c.goalIds, c.styles, c.aim === 'surprise' ? [c.surAim, c.seed] : '', c.forme]); };
ACT.cpRestart = () => { const help = CP().help; S.cp = null; ls.set(KEY, {}); CP().help = help; render(); window.scrollTo(0, 0); };
ACT.cpSport = (el) => { const c = CP(); c.sport = el.dataset.id; c.result = null; c.target = null; if ((!isClimb(c.sport) && c.aim === 'grade') || (!sportFamily(c.sport) && c.aim === 'target')) c.aim = 'goals'; keep(); render(); };
ACT.cpForme = (el) => { CP().forme = el.dataset.id; keep(); render(); };
ACT.cpAim = (el) => { const c = CP(); c.aim = el.dataset.id;
  // Réussir une cotation = un objectif de performance, à la fin par défaut (déplaçable ensuite).
  if (c.aim === 'grade' && !c.objective) c.objective = { family: 'performance', subIntents: [{ id: 'performance.reussite', prio: 4 }], when: 'end' };
  keep(); render(); };
ACT.cpSurAim = (el) => { CP().surAim = el.dataset.id; keep(); render(); };
const tog = (k) => (el) => { const c = CP(), id = el.dataset.id, l = c[k] || []; c[k] = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; keep(); render(); };
ACT.cpIntentWrite = () => { S.gen.activityId = CP().sport; ACT.gWrite?.({ dataset: { k: 'intent' } }); };
ACT.cpFocusOff = () => { CP().focus = null; keep(); render(); };
ACT.cpGoal = tog('goalIds'); ACT.cpIntent = tog('intents'); ACT.cpZone = tog('zones');
// Aller ajouter des objectifs, puis revenir à la séance (le brouillon est gardé).
ACT.cpAddGoals = () => { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('profile', 'goals'); };
const WORK_HINT = { run: 'fractionné, seuil…', swim: 'séries, pyramide…', load: 'force, 5×5…', body: 'EMOM, pyramide…' };
function vPhases() {
  const c = CP(), sports = Object.keys(ctx().activities).filter((id) => !isClimb(id));
  return h`<div class="card stack">
    ${c.parts.map((p, i) => { const L = p.type === 'climb' && p.adapt ? adaptPart(p, priorLoad(c.parts, i), ctx().styles) : null; const st = STRUCTURES[p.kind || 'bloc']?.[p.structure];
      const pl = placesNow(c.parts)[i], stt = chainStatus(p);
      return h`<div class="cpart"><div><b>${ROLES[p.role]?.[0] || '•'} ${phaseName(p)}</b>${p.objective ? h` <span class="tag acc">🎯 objectif</span>` : ''} <span class="tag">${stt.text}</span>
        ${pl?.envId || (p.place?.mode && p.place.mode !== 'same') ? h`<div class="tiny muted">📍 ${pl?.name || ''}${p.place?.travelMin ? ` · 🚗 ${p.place.travelMin} min` : ''}</div>` : ''}
        ${p.subIntents?.length ? h`<div class="tiny acc-t">➜ ${p.subIntents.map((x) => `${labelOf(x.id)}${x.prio >= 3 ? ' ★' : ''}`).join(', ')}</div>` : ''}
        <div class="tiny muted">${lockIc(p, 'activity')} ${actLabel(p.activity || CP().sport)} · ${lockIc(p, 'minutes')} ${fmtMin(p.minutes)} · ${ROLES[p.role]?.[1] || ''}${p.role === 'custom' && p.roleLabel ? ` (${p.roleLabel})` : ''} · ${lockIc(p, 'intensity')} ${INTENSITY[p.intensity]?.[1] || ''}</div>
        ${p.goal ? h`<div class="tiny">🎯 ${lockIc(p, 'goal')} ${p.goal}</div>` : ''}
        ${p.priorities?.length ? h`<div class="tiny acc-t">Priorités : ${p.priorities.map((k) => CAPACITIES[k]?.label.toLowerCase() || k).join(', ')}</div>` : ''}
        ${p.avoid?.length ? h`<div class="tiny muted">Limiter : ${p.avoid.join(', ').toLowerCase()}</div>` : ''}
        ${p.type === 'work' ? h`<div class="tiny muted">${workLine(p)}</div>` : ''}
        ${p.type === 'climb' ? h`<div class="tiny muted">${rangeText(p)}${p.styles?.length ? ' · ' + p.styles.map((id) => ctx().styles[id]?.label || id).join(', ') : ''}${p.stylesOut?.length ? ' · sans ' + p.stylesOut.map((id) => ctx().styles[id]?.label || id).join(', ').toLowerCase() : ''} · ${st ? `${st.emoji} ${st.name}` : 'structure au choix'}${p.attemptsMax ? ` · ${p.attemptsMax} essais max` : ''}${p.adapt ? ' · adapté à avant' : ''}</div>` : ''}
        ${L?.notes.length ? h`<div class="tiny acc-t">↳ ${L.notes[0]}</div>` : ''}</div>
        <div class="row tight wrapf cpbtns"><label class="row tight grow"><span class="unitbox"><input type="number" min="${p.type === 'pause' ? 1 : 5}" max="240" step="5" value="${p.minutes}" data-change="cpPartMinRow" data-i="${i}" style="width:70px" aria-label="Durée de la phase" ${p.locks?.minutes === 'user' ? 'disabled' : ''}><em>min</em></span></label><button class="btn sm ic" data-act="cpUp" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="btn sm ic" data-act="cpDown" data-i="${i}" ${i < c.parts.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button><button class="btn sm" data-act="cpEdit" data-i="${i}">Régler</button><button class="btn sm ic danger" data-act="cpDel" data-i="${i}" aria-label="Retirer">✕</button></div></div>`; })}
    <span class="kicker">Ajouter une phase</span>
    <div class="chips">${chip(false, '🪨 Bloc', 'data-act="cpAdd" data-id="climb" data-k="bloc"')}${chip(false, '🧗 Voie', 'data-act="cpAdd" data-id="climb" data-k="voie"')}${chip(false, '⏸️ Pause', 'data-act="cpAdd" data-id="pause"')}${sports.map((id) => h`${sportFamily(id) ? chip(false, `${sportLabel(id)} : ${WORK_HINT[sportFamily(id)]}`, `data-act="cpAdd" data-id="work" data-k="${id}"`) : ''}${chip(false, `${sportLabel(id)} : exercices`, `data-act="cpAdd" data-id="main" data-k="${id}"`)}`)}${Object.entries(CLIMB_PARTS).filter(([k]) => k !== 'climb').map(([k, [e, l]]) => chip(false, `${e} ${l}`, `data-act="cpAdd" data-id="${k}"`))}</div>
    <div class="row wrapf"><button class="btn sm ghost" data-act="cpExample">↺ Structure proposée</button></div>
    <p class="tiny muted">${Object.entries(LOCK_STATES).map(([, [ic, l]]) => `${ic} ${l}`).join(' · ')} — « Régler » pour tout changer d’une phase.</p>
    </div>`;
}
/* ───────── Options d'une partie : guidé (conseillé + expliqué) ou libre (tout le catalogue) ───────── */
const eqNow = () => availableEquipment(ctx(), CP().envId);
function currentPick(i) {
  const c = CP(), p = c.built[i]; if (p.pick) return p.pick;
  const label = partLabel(p, i, c.built), ex = (c.result?.exercises || []).filter((e) => e.part === label);
  if (p.type === 'work') return [...new Set(ex.map((e) => /^sp-(\w+)$/.exec(e.group || '')?.[1]).filter(Boolean))];
  return p.type === 'climb' ? [...new Set(ex.map((e) => /^cp-(\w+)$/.exec(e.group || '')?.[1]).filter(Boolean))] : [...new Set(ex.map((e) => e.libId).filter(Boolean))];
}
/** Propositions classées et expliquées pour la phase i (moteur phaseplan : raisons catégorisées). */
const selGoals = () => (CP().goalIds || []).map((id) => ctx().goals.find((g) => g.id === id)).filter(Boolean);
function propOf(i) { const c = CP(); return proposeForPhase(c.built[i], ctx(), { phases: c.built, index: i, eq: eqAt(i), filters: c.filters || {}, intent: sessIntent(), goals: selGoals() }); }
const byRank = (list, r) => { const pos = Object.fromEntries(r.items.map((x, k) => [x.id, k])); return list.sort((a, b) => (pos[a.id] ?? 99) - (pos[b.id] ?? 99)); };
const withWhy = (o, r) => { const x = r.items.find((y) => y.id === o.id); return x ? { ...o, reasons: x.reasons, fit: x.fit } : o; };
function optionsFor(i, free) {
  const c = CP(), p = c.built[i], r = p.type === 'pause' ? { items: [], missing: [] } : propOf(i);
  if (p.type === 'pause') return [];
  if (p.type === 'work') return byRank(sportProposals(sportFamily(p.activity), p.intensity || 'mod').map((x) => withWhy({ id: x.id, name: `${x.emoji} ${x.name}`, works: [], what: x.desc, tips: [x.when].filter(Boolean), recommended: x.fit, struct: true }, r)), r);
  if (p.type === 'climb') return byRank(proposals(p.kind === 'voie' ? 'voie' : 'bloc', p.intensity).map((x) => withWhy({ id: x.id, name: `${x.emoji} ${x.name}`, works: STRUCT_TIPS[x.id] || [], what: x.desc, tips: [STRUCT_WHEN[x.id]].filter(Boolean), recommended: x.fit, struct: true }, r)), r);
  if (free) {
    const q = String(c.q?.[i] || '').toLowerCase(), all = !!c.freeAll?.[i];
    return poolFor(POOLS[p.type] ? p.type : null, { eq: eqNow(), all }).filter((x) => !q || x.name.toLowerCase().includes(q)).slice(0, 40)
      .map((x) => ({ id: x.id, name: `${x.emoji} ${x.name}`, works: Object.entries(x.caps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => CAPACITIES[k]?.label?.toLowerCase() || k), what: '', tips: [] }));
  }
  if (POOLS[p.type]) return partOptions(p, { eq: eqNow(), fingersTired: priorLoad(c.built, i).fingers >= 40, want: c.want?.[i] }).map((o) => withWhy({ ...o, name: `${o.lib.emoji} ${o.lib.name}` }, r));
  // Autres phases (corps de séance, échauffement…) : classement du moteur de phases, selon rôle, priorités et matériel.
  const n = Math.max(1, Math.min(4, Math.round((p.minutes || 20) / 10)));
  return r.items.map((x) => ({ id: x.id, name: x.name, works: [], what: '', tips: [], reasons: x.reasons, fit: x.fit, recommended: x.rank <= n }));
}
function optionRows(i, free, max = 0) {
  const pick = currentPick(i), c = CP(), p = c.built[i];
  let all = optionsFor(i, free); const total = all.length;
  if (max) all = [...all.filter((o) => pick.includes(o.id)), ...all.filter((o) => !pick.includes(o.id))].slice(0, Math.max(max, pick.length));
  const rows = all.map((o) => { const on = pick.includes(o.id);
    return h`<div class="optrow ${on ? 'on' : ''}"><button class="ck" data-act="cpPick" data-i="${i}" data-id="${o.id}" aria-pressed="${on}" aria-label="Choisir">${on ? '✓' : ''}</button>
      <button class="linkish grow" data-act="cpPick" data-i="${i}" data-id="${o.id}"><b>${o.name}</b>${o.recommended && !free ? h` <span class="tag ok">conseillé</span>` : ''}${o.fit && !free ? h`<small class="fit">${o.fit}</small>` : ''}${o.works.length ? h`<small>Travaille : ${o.works.join(', ')}</small>` : ''}${o.what && o.struct ? h`<small>${o.what}</small>` : ''}${o.tips.map((t) => h`<small class="tip">💡 ${t}</small>`)}</button>
      ${o.struct ? '' : h`<button class="btn sm ic" data-act="cpOptInfo" data-id="${o.id}" data-i="${i}" aria-label="C’est quoi ?">ⓘ</button>`}</div>
      ${o.reasons?.length && !free ? h`<details class="how mini optwhy"><summary>Pourquoi ?</summary>${whyList(o.reasons.slice(0, 6))}</details>` : ''}`; });
  const adv = !['climb', 'work'].includes(p.type) && pick.length > 1 ? orderAdvice(pick).notes : [];
  return h`${adv.map((n) => h`<p class="tiny acc-t">↳ ${n}</p>`)}<div class="optlist">${rows.length ? rows : h`<p class="tiny muted">Aucun exercice avec ce filtre.</p>`}</div>${max && total > rows.length ? h`<button class="btn sm ghost" data-act="cpOpts" data-i="${i}">Voir toutes les options (${total})</button>` : ''}`;
}
function wantChips(i) {
  const c = CP(), p = c.built[i], caps = Object.keys(POOLS[p.type]?.caps || {}); if (['climb', 'work'].includes(p.type) || caps.length < 2) return '';
  return h`<div class="chips tight"><span class="tiny muted">Je veux plus de :</span>${caps.slice(0, 4).map((k) => chip(c.want?.[i] === k, CAPACITIES[k]?.label || k, `data-act="cpWant" data-i="${i}" data-id="${k}"`))}</div>`;
}
function guideList(i) {
  const p = CP().built[i];
  const open = (CP().gOpen ?? 0) === i;
  const miss = p.type === 'pause' ? [] : propOf(i).missing;
  return h`<details class="guide how mini" ${open ? 'open' : ''} data-i="${i}"><summary>🧭 Choisir : options classées et pourquoi</summary>${PART_NOTES[p.type] ? h`<p class="tiny muted">ℹ️ ${PART_NOTES[p.type]}</p>` : ''}${miss.length ? whyList(miss) : ''}${optionRows(i, false, 3)}</details>`;
}
function optsSheet(i) {
  const c = CP(), p = c.built[i], free = c.help === 'free'; if (!p) return; S.cpSheet = i;
  openSheet(h`<div class="stack"><h2 style="margin:0">${partLabel(p, i, c.built)}</h2>
    ${free && !['climb', 'work'].includes(p.type) ? h`<input type="search" data-input="cpQ" data-i="${i}" value="${c.q?.[i] || ''}" placeholder="🔍 Chercher un exercice" aria-label="Chercher un exercice">
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
/** Résumé d'une partie « travail » : intensité, mouvement, cible. */
function workLine(p) {
  const x = ctx(), fam = sportFamily(p.activity), st = SPORT_STRUCTS[fam]?.[p.structure];
  return [INTENSITY[p.intensity]?.[1], (fam === 'load' || fam === 'body') && (p.move || sportMoves(p.activity, x)[0]) ? moveName(p.move || sportMoves(p.activity, x)[0].id, x) : '', st && p.label ? `${st.emoji} ${st.name}` : '', p.target?.value != null ? `cible ${targetLabel(p.target.metricId, p.target.value)}` : ''].filter(Boolean).join(' · ');
}
function rangeText(p) {
  const sys = phSys(p), levels = sortedLevels(sys), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null);
  const a = levels[lo]?.label, b = levels[hi]?.label; return a ? (a === b ? a : `${a}–${b}`) + (p.from == null ? ' (auto)' : '') : '';
}
/** Ce qu'il faut faire à chaque série : durée ou répétitions, et la charge. */
const dose = (e) => {
  const t = (x) => (x >= 60 ? `${Math.round(x / 60)} min` : `${x} s`), u = e.unit ? ` ${e.unit}` : ' rép.';
  const d = e.mode === 'time' ? (e.secMax > e.secMin ? `${t(e.secMin)}–${t(e.secMax)}` : t(e.secMin)) : e.repsMax > e.repsMin ? `${e.repsMin}–${e.repsMax}${u}` : `${e.repsMin}${u}`;
  return [e.group?.startsWith('cp-') ? '' : d, e.load, e.rest ? `repos ${t(e.rest)}` : ''].filter(Boolean).join(' · ');
};
function vResult(final = false) {
  const c = CP(), s = c.result, sp = c.aim === 'surprise' && c.reasons?.length && c.help !== 'free', help = c.help || 'auto';
  const exLi = (e, i) => h`<li><button class="linkish" data-act="cpExInfo" data-id="${e.id}"><b>${e.name}</b> <span class="tiny muted">ⓘ</span></button>${e.sets > 1 ? ` × ${e.sets}` : ''}${!final && e.libId && i >= 0 ? h` <button class="btn sm ghost" data-act="cpAlt" data-i="${i}" data-id="${e.libId}" aria-label="Alternatives à ${e.name}">↔ Alternatives</button>` : ''}${dose(e) ? h`<div class="tiny acc-t">${dose(e)}</div>` : ''}${e.note ? h`<div class="tiny muted">${e.note}</div>` : ''}</li>`;
  const byPart = c.built ? c.built.map((p, i) => ({ p, i, label: partLabel(p, i, c.built), title: `${ROLES[p.role]?.[0] || ''} ${phaseName(p)}`, sub: actLabel(p.activity) })) : [...new Set(s.exercises.map((e) => e.part))].map((label) => ({ p: null, i: -1, label, title: label }));
  return h`<div class="card stack" id="cpresult"><h2 style="margin:0">${s.emoji} ${s.name}</h2>
    ${sp ? h`<div class="card flat acc-b"><b class="small">${AIMS[c.aimDone]?.[0] || '🎲'} Pourquoi cette surprise</b><ul class="clean tight small">${c.reasons.map((r) => h`<li>${r}</li>`)}</ul></div>` : ''}
    <p class="muted small">~${fmtMin(sessionMinutes(s))} · ${byPart.length} parties · ${help === 'guide' ? 'coche ce que tu veux dans chaque partie' : help === 'free' ? 'ajoute tes exercices dans chaque partie' : 'change le temps ou les exercices de chaque partie si tu veux'}</p>
    ${byPart.map(({ p, i, label, title, sub }) => { const ex = s.exercises.filter((e) => (p?.id && e.phase ? e.phase === p.id : e.part === label));
      return h`<div class="rpart"><div class="row"><b class="grow">${title}${sub ? h`<small class="tiny muted"> · ${sub}</small>` : ''}</b>${p ? h`<span class="unitbox"><input type="number" min="5" max="180" step="5" value="${p.minutes}" data-change="cpBMin" data-i="${i}" style="width:64px" aria-label="Durée de la partie"><em>min</em></span>` : ''}</div>
        ${ex.length ? h`<ul class="clean tight small">${ex.map((e) => exLi(e, i))}</ul>` : h`<p class="tiny muted">${p?.type === 'pause' ? 'Pause.' : 'Rien pour l’instant.'}</p>`}
        ${final || !p || p.type === 'pause' ? '' : help === 'guide' ? guideList(i) : h`<button class="btn sm" data-act="cpOpts" data-i="${i}">${help === 'free' ? '＋ Choisir les exercices' : '🧭 Options classées'}</button>`}</div>`; })}
    ${final ? h`<p class="small ok-t">✅ Séance générée d’après ta structure validée.</p><div class="grid2"><button class="btn pri big" data-act="cpPlay" ${s.exercises.length ? '' : 'disabled'}>▶ Lancer</button><button class="btn big" data-act="cpSave" ${s.exercises.length ? '' : 'disabled'}>💾 Enregistrer</button></div>
      <button class="btn sm ghost" data-act="cpUngen">✏️ Modifier encore</button>` : h`<p class="tiny muted">Aperçu : la séance sera générée à la dernière étape, après les améliorations.</p>`}
    ${sp && !final ? h`<button class="btn" data-act="cpAgain">🔁 Une autre surprise</button>` : ''}</div>`;
}

ACT.cpUngen = () => { const c = CP(); c.generated = false; keep(); render(); };
/* Alternatives à un exercice : ce qui reste identique et ce qui change (remplacement intelligent existant). */
ACT.cpAlt = (el) => {
  const c = CP(), i = Number(el.dataset.i), p = c.built?.[i], ex = c.result?.exercises.find((e) => e.libId === el.dataset.id); if (!p || !ex) return;
  const alts = alternatives(ex, ctx(), { session: c.result, envId: c.envId || ctx().defEnv?.id, activityId: p.activity }).filter((a) => a.available).slice(0, 6);
  const same = (a) => a.reasons.map((r) => `✓ ${r}`), diff = (a) => [a.lib.intensity !== byId(ex.libId)?.intensity ? `≠ intensité : ${({ low: 'plus douce', mod: 'modérée', high: 'plus exigeante' })[a.lib.intensity] || '—'}` : '', (a.lib.needs || []).join() !== (byId(ex.libId)?.needs || []).join() ? `≠ matériel : ${(a.lib.needs || []).map((n) => EQUIPMENT[n] || n).join(', ').toLowerCase() || 'aucun'}` : ''].filter(Boolean);
  openSheet(h`<div class="stack"><h2 style="margin:0">↔ À la place de « ${ex.name} »</h2>
    ${alts.length ? alts.map((a) => h`<div class="card flat"><b>${a.lib.emoji || ''} ${a.lib.name}</b><ul class="clean tight tiny">${same(a).map((t) => h`<li>${t}</li>`)}${diff(a).map((t) => h`<li class="muted">${t}</li>`)}</ul><button class="btn sm pri" data-act="cpAltPick" data-i="${i}" data-from="${ex.libId}" data-id="${a.lib.id}">Choisir</button></div>`) : h`<p class="small muted">Aucune alternative compatible avec ton matériel et ce qui est déjà dans la séance.</p>`}
    <button class="btn" data-act="closeSheet">Fermer</button></div>`, { wide: true });
};
ACT.cpAltPick = (el) => {
  const c = CP(), i = Number(el.dataset.i), p = c.built?.[i]; if (!p) return;
  const cur = currentPick(i).length ? currentPick(i) : (c.result?.exercises || []).filter((e) => e.phase === p.id && e.libId).map((e) => e.libId);
  p.pick = [...new Set(cur.map((x) => (x === el.dataset.from ? el.dataset.id : x)))];
  closeSheet(); rebuild(); keep(); render(); toast('Exercice remplacé.');
};
ACT.cpSurprise = () => { closeSheet(); const c = CP(); c.aim = 'surprise'; c.result = null; c.step = Math.max(2, c.step || 1); keep(); go('library', 'climbplan'); };
ACT.cpNew = () => { closeSheet(); const help = CP().help; S.cp = null; ls.set(KEY, {}); CP().help = help; go('library', 'climbplan'); };
ACT.cpResume = () => { closeSheet(); go('library', 'climbplan'); };
/**
 * Une seule façon de créer une séance : « Séance du jour », « Que faire aujourd'hui ? », une séance pour un objectif,
 * une commande au coach… ouvrent toutes l'assistant, déjà rempli. auto : directement à la dernière validation (étape 7) :
 * un toucher sur « Générer », ou retour aux étapes d'avant pour modifier.
 */
export function openWizard({ sport = '', minutes = 0, goalIds = [], forme = '', intents = [], focus = null, auto = true } = {}) {
  closeSheet();
  const help = CP().help || 'auto'; S.cp = null; ls.set(KEY, {}); const c = CP(), x = ctx();
  c.help = help; c.sport = sport || Object.keys(x.activities)[0] || 'conditioning'; c.minutes = Math.max(10, Math.min(240, minutes || S.settings.defaultMinutes || 45));
  c.goalIds = goalIds.filter(Boolean); c.intents = intents; c.focus = focus?.caps ? focus : null; c.aim = c.goalIds.length || intents.length || c.focus ? 'goals' : 'none'; if (forme) c.forme = forme;
  if (auto) { c.parts = proposedPhases(); c.partsFor = partsKey(); c.partsTouched = false; c.result = null; c.built = null; buildNow(); c.step = NSTEPS; c.generated = false; } else c.step = 2;
  keep(); go('library', 'climbplan'); window.scrollTo(0, 0);
}
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
  const t = el.dataset.id, c = CP();
  const p = newPhase(t, t === 'climb' ? { kind: el.dataset.k } : t === 'work' ? { activity: el.dataset.k, intensity: 'mod', minutes: 20 } : t === 'main' ? { activity: el.dataset.k || c.sport, minutes: 20 } : ['warmup', 'cool', 'pause'].includes(t) ? {} : { activity: c.sport, minutes: 10 }, Date.now() + c.parts.length);
  c.parts.push(p); c.result = null; c.partsTouched = true; keep(); render(); editPart(c.parts.length - 1);
};
ACT.cpExample = () => { CP().parts = proposedPhases(); CP().partsTouched = false; CP().partsFor = partsKey(); CP().result = null; keep(); render(); };
CHG.cpScale = (el) => {
  const c = CP(), total = c.parts.reduce((t, p) => t + p.minutes, 0), want = Math.max(20, Math.min(300, Number(el.value) || total));
  if (!total) return; let acc = 0; c.parts.forEach((p, i) => { p.minutes = i === c.parts.length - 1 ? Math.max(5, want - acc) : Math.max(5, Math.round((p.minutes * want) / total / 5) * 5); acc += p.minutes; });
  c.result = null; c.partsTouched = true; keep(); render();
};
ACT.cpLock = (el) => upd(Number(el.dataset.i), (p) => { const k = el.dataset.k, order = ['free', 'user', 'app'], cur = p.locks?.[k] || 'free'; p.locks = { ...p.locks, [k]: order[(order.indexOf(cur) + 1) % 3] }; });
ACT.cpPhRole = (el) => upd(Number(el.dataset.i), (p) => { p.role = el.dataset.id; });
ACT.cpPhFat = (el) => upd(Number(el.dataset.i), (p) => { p.fatigue = el.dataset.id; });
ACT.cpPhPrio = (el) => upd(Number(el.dataset.i), (p) => { const l = p.priorities || [], id = el.dataset.id; p.priorities = l.includes(id) ? l.filter((x) => x !== id) : [...l, id].slice(0, 6); });
ACT.cpPhAvoid = (el) => upd(Number(el.dataset.i), (p) => { const l = p.avoid || [], id = el.dataset.id; p.avoid = l.includes(id) ? l.filter((x) => x !== id) : [...l, id].slice(0, 8); });
CHG.cpPhAvoidAdd = (el) => { const v = el.value.trim().slice(0, 40); if (!v) return; upd(Number(el.dataset.i), (p) => { p.avoid = [...new Set([...(p.avoid || []), v])].slice(0, 8); }); };
CHG.cpPhText = (el) => { const k = el.dataset.k; if (!['goal', 'constraints', 'roleLabel'].includes(k)) return; const p = CP().parts[Number(el.dataset.i)]; if (!p || (k === 'goal' && p.locks?.goal === 'user')) return; p[k] = el.value.slice(0, k === 'roleLabel' ? 40 : 200); CP().partsTouched = true; CP().result = null; keep(); };
/** Changer l'activité d'une phase : bloc/voie → phase de grimpe, sport avec structures → « travail », pause → pause. */
CHG.cpPhAct = (el) => upd(Number(el.dataset.i), (p) => {
  const a = el.value; if (p.locks?.activity === 'user') return;
  if (a === 'pause') Object.assign(p, { type: 'pause', activity: 'pause', role: 'pause' });
  else if (isClimb(a)) Object.assign(p, { type: 'climb', kind: kindOf(a), activity: a, styles: p.styles || [], intensity: p.intensity || 'mod' });
  else if (sportFamily(a)) Object.assign(p, { type: 'work', activity: a, structure: undefined, move: undefined });
  else Object.assign(p, { type: ['warmup', 'cool', 'stretch', 'mobility'].includes(p.type) ? p.type : 'main', activity: a });
  Object.assign(p, normalizePhase(p, i0(p), a));
});
const i0 = (p) => Math.max(0, CP().parts.indexOf(p));
/* Régler une phase : une CHAÎNE de réglages numérotés, qui dépend du type de phase
 * (type → objectif → précisément → réglages du type → intensité et durée → lieu → je veux / je ne veux pas → ce que l'app décide).
 * Tout est facultatif : ce qui n'est pas réglé, l'app le décide. */
const fieldHead = (label, p, i, k, note = '') => h`<div class="row between wrapf fhead"><span class="small"><b>${label}</b>${note ? h` <span class="tiny muted">${note}</span>` : ''}</span>${k ? lockBtn(p, i, k) : ''}</div>`;
const lockBtn = (p, i, k) => h`<button type="button" class="chip lockc" data-act="cpLock" data-i="${i}" data-k="${k}" title="${LOCK_STATES[p.locks?.[k] || 'free'][1]}" aria-label="${LOCKABLE[k]} : ${LOCK_STATES[p.locks?.[k] || 'free'][1]}">${LOCK_STATES[p.locks?.[k] || 'free'][0]} ${LOCK_STATES[p.locks?.[k] || 'free'][1]}</button>`;
const ROLE_FAMILY = { technique: ['technique'], endurance: ['endurance'], force: ['force'], puissance: ['puissance'], perf: ['performance'], mobilite: ['mobilite'], recup: ['mobilite'], prep: ['technique', 'endurance'] };
function linkType(p, i) {
  const acts = [...new Set([...Object.keys(ctx().activities), ...Object.keys(ACTIVITIES)])];
  return h`${fieldHead('Activité', p, i, 'activity')}<select data-change="cpPhAct" data-i="${i}" aria-label="Activité de la phase" ${p.locks?.activity === 'user' ? 'disabled' : ''}>${acts.map((a) => h`<option value="${a}" ${p.activity === a ? 'selected' : ''}>${actLabel(a)}</option>`)}<option value="pause" ${p.type === 'pause' ? 'selected' : ''}>⏸️ Pause</option></select>
    ${p.type === 'climb' ? h`<div class="chips">${[['bloc', '🪨 Bloc'], ['voie', '🧗 Voie']].map(([k, l]) => chip(p.kind === k, l, `data-act="cpPart" data-i="${i}" data-k="kind" data-v="${k}"`))}</div>` : ''}`;
}
function linkGoal(p, i) {
  return h`<div class="chips">${Object.entries(ROLES).filter(([k]) => k !== 'pause').map(([k, [e, l]]) => chip(p.role === k, `${e} ${l}`, `data-act="cpPhRole" data-i="${i}" data-id="${k}"`))}</div>
    ${p.role === 'custom' ? h`<input data-change="cpPhText" data-i="${i}" data-k="roleLabel" maxlength="40" value="${p.roleLabel || ''}" placeholder="Nom du rôle" aria-label="Nom du rôle">` : ''}
    ${fieldHead('But de cette phase', p, i, 'goal', '(pour cette séance seulement)')}<textarea data-change="cpPhText" data-i="${i}" data-k="goal" maxlength="200" rows="2" aria-label="But de la phase" placeholder="Ex. « Me préparer à la voie sans trop me fatiguer »" ${p.locks?.goal === 'user' ? 'readonly' : ''}>${p.goal || ''}</textarea>`;
}
function linkSubs(p, i) {
  const all = paramsFor(p).subs, first = ROLE_FAMILY[p.role] || [], sel = (id) => (p.subIntents || []).some((x) => x.id === id);
  const fams = [...first.filter((f) => all[f]), ...Object.keys(all).filter((f) => !first.includes(f))];
  const famChips = (f) => h`<span class="tiny muted">${INTENT_FAMILIES[f].emoji} ${INTENT_FAMILIES[f].label}</span><div class="chips">${all[f].map((x) => chip(sel(x.id), x.label, `data-act="cpPhSub" data-i="${i}" data-id="${x.id}"`))}</div>`;
  const chosenFams = [...new Set((p.subIntents || []).map((x) => x.id.split('.')[0]))];
  const pri = [...new Set([...Object.keys(ACTIVITIES[p.activity]?.caps || {}).slice(0, 8), ...(p.priorities || [])])];
  return h`${fams.slice(0, first.length || 1).map(famChips)}
    ${fams.length > (first.length || 1) ? h`<details class="how mini"><summary>Autres familles (${fams.length - (first.length || 1)})</summary>${fams.slice(first.length || 1).map(famChips)}</details>` : ''}
    ${prioRows(p.subIntents, 'cpPhSubPrio', `data-i="${i}"`)}
    ${chosenFams.length > 1 ? h`<span class="kicker">Règles entre priorités</span>
      ${(p.rules || []).map((r, k) => h`<div class="row between"><span class="small">« ${labelOf(r.under)} » ne prend jamais le dessus sur « ${labelOf(r.over)} »</span><button type="button" class="chip" data-act="cpPhRuleDel" data-i="${i}" data-id="${k}" aria-label="Retirer la règle">✕</button></div>`)}
      <div class="row wrapf tight"><select data-change="cpPhRuleUnder" data-i="${i}" aria-label="Ce qui ne doit pas dominer">${chosenFams.map((f) => h`<option value="${f}" ${S.cpRuleUnder === f ? 'selected' : ''}>${INTENT_FAMILIES[f].label}</option>`)}</select><span class="small">ne prend jamais le dessus sur</span><select data-change="cpPhRuleOver" data-i="${i}" aria-label="Ce qui reste prioritaire">${chosenFams.map((f) => h`<option value="${f}" ${S.cpRuleOver === f ? 'selected' : ''}>${INTENT_FAMILIES[f].label}</option>`)}</select><button class="btn sm" data-act="cpPhRuleAdd" data-i="${i}">＋ Règle</button></div>` : ''}
    <details class="how mini"><summary>Capacités précises${p.priorities?.length ? ` (${p.priorities.length})` : ''}</summary><div class="chips">${pri.map((k) => chip((p.priorities || []).includes(k), CAPACITIES[k]?.label || k, `data-act="cpPhPrio" data-i="${i}" data-id="${k}"`))}</div></details>`;
}
function linkParams(p, i) {
  const c = CP(), g = globalFilterValues(), pf = paramsFor(p), extraKeys = pf.filters.filter((k) => !(p.type === 'climb' && ['style', 'cotation', 'essais', 'volume'].includes(k)) && k !== 'exclus');
  const filtersHtml = extraKeys.length ? h`<span class="kicker">Filtres de la phase</span>${extraKeys.map((k) => filterField(k, String(i), g[k]))}
    ${Object.keys(g).filter((k) => !extraKeys.includes(k) && FILTER_DEFS[k]).map((k) => filterField(k, String(i), g[k]))}` : '';
  if (p.type === 'work') {
    const x = ctx(), fam = sportFamily(p.activity), props = sportProposals(fam, p.intensity || 'mod'), cur = p.structure || props[0]?.id, moves = fam === 'load' || fam === 'body' ? sportMoves(p.activity, x) : [];
    const mv = p.move || moves[0]?.id || '', known = mv ? bestPerf(x, mv) : null, u = moves.find((m) => m.id === mv)?.unit;
    return h`${moves.length ? h`<label>Mouvement<select data-change="cpPartMove" data-i="${i}" data-pick="yes" data-add="metricNew" data-add-label="Créer une mesure">${moves.map((m) => h`<option value="${m.id}" ${m.id === mv ? 'selected' : ''}>${moveName(m.id, x)}</option>`)}</select></label>
        <p class="tiny muted">${known != null ? `Ta meilleure perf notée : ${known} ${u === 'reps' ? 'rép.' : u}. Les ${u === 'kg' ? 'charges' : 'séries'} en découlent.` : `Aucune perf notée : ${u === 'kg' ? 'charges' : 'séries'} au ressenti. `}${known == null ? h`<button class="linkish acc-t" data-act="allGo" data-to="profile/perfs">Noter ma perf</button>` : ''}</p>` : ''}
      <span class="kicker">Comment structurer cette partie ?</span>
      <div class="setmenu">${props.map((st) => h`<button class="setrow ${st.fit ? '' : 'dim'}" data-act="cpPart" data-i="${i}" data-k="structure" data-v="${st.id}"><span class="sic">${st.emoji}</span><span class="grow"><b>${st.name}</b><small>${st.desc}${st.fit ? '' : ' (moins adapté à cette intensité)'}</small><small class="tip">💡 ${st.when}</small></span><span class="chev">${cur === st.id ? '✓' : ''}</span></button>`)}</div>${filtersHtml}`;
  }
  if (p.type !== 'climb') return filtersHtml || h`<p class="tiny muted">Les exercices sont proposés à l’étape suivante, classés et expliqués.</p>`;
  const sys = phSys(p), levels = sortedLevels(sys), max = sys ? knownMax(ctx(), sys, p.kind) : null, [lo, hi] = partRange(p, levels, max);
  const L = adaptPart(p, priorLoad(c.parts, i), ctx().styles), props = proposals(p.kind, p.intensity), cur = p.structure || props[0].id;
  const opt = (sel) => levels.map((l, k) => h`<option value="${k}" ${k === sel ? 'selected' : ''}>${l.label}</option>`);
  const sysList = systemsFor(p.kind), styl = climbStyles().sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return h`${sysList.length > 1 ? h`<label>Système de cotation<select data-change="cpPhSys" data-i="${i}">${sysList.map((y) => h`<option value="${y.id}" ${(p.systemId || sys?.id) === y.id ? 'selected' : ''}>${y.name}</option>`)}</select></label>` : ''}
    <span class="kicker">Cotations ${p.from == null ? h`<span class="tiny muted">(auto selon l’intensité${max == null ? '' : ' et ton max'})</span>` : ''}</span>
    <div class="grid2"><label>De<select data-change="cpPartLv" data-i="${i}" data-k="from">${opt(lo)}</select></label><label>À<select data-change="cpPartLv" data-i="${i}" data-k="to">${opt(hi)}</select></label></div>
    ${p.from != null ? h`<button class="btn sm ghost" data-act="cpPartAuto" data-i="${i}">↺ Cotations automatiques</button>` : ''}
    ${fieldHead('Styles voulus', p, i, 'style', '(plusieurs possibles)')}
    <div class="chips">${styl.map((s) => chip((p.styles || []).includes(s.id), s.label, `data-act="cpPartStyle" data-i="${i}" data-id="${s.id}"`))}<input class="chipin" data-change="styleQuick" data-target="cpPart" data-i="${i}" maxlength="40" placeholder="＋ Autre style" aria-label="Ajouter un style"></div>
    <span class="kicker">Styles exclus</span>
    <div class="chips">${styl.filter((s) => !(p.styles || []).includes(s.id)).map((s) => chip((p.stylesOut || []).includes(s.id), `🚫 ${s.label}`, `data-act="cpPhStyleOut" data-i="${i}" data-id="${s.id}"`))}</div>
    <span class="kicker">Type d’essais</span><div class="chips">${Object.entries(ATTEMPT_TYPES).map(([k, l]) => chip(p.attemptType === k, l, `data-act="cpPhSet" data-i="${i}" data-k="attemptType" data-id="${k}"`))}</div>
    <span class="kicker">Priorité</span><div class="chips">${Object.entries(FOCUS).map(([k, l]) => chip(p.focus === k, l, `data-act="cpPhSet" data-i="${i}" data-k="focus" data-id="${k}"`))}</div>
    <span class="kicker">Volume</span><div class="chips">${Object.entries(VOLUME).map(([k, l]) => chip(p.volume === k, l, `data-act="cpPhSet" data-i="${i}" data-k="volume" data-id="${k}"`))}</div>
    <label>Essais au maximum <span class="tiny muted">(facultatif)</span><input type="number" min="1" max="99" inputmode="numeric" value="${p.attemptsMax ?? ''}" data-change="cpPhAttempts" data-i="${i}" placeholder="—"></label>
    <span class="kicker">Comment structurer cette partie ?</span>
    <div class="setmenu">${props.map((s) => h`<button class="setrow ${s.fit ? '' : 'dim'}" data-act="cpPart" data-i="${i}" data-k="structure" data-v="${s.id}"><span class="sic">${s.emoji}</span><span class="grow"><b>${s.name}</b><small>${s.desc}${s.fit ? '' : ' (moins adapté à cette intensité)'}</small></span><span class="chev">${cur === s.id ? '✓' : ''}</span></button>`)}</div>
    ${i > 0 ? h`<label class="row"><input type="checkbox" data-change="cpPartAdapt" data-i="${i}" ${p.adapt ? 'checked' : ''}><span class="grow"><b>Adapter à ce que j’ai fait avant</b><small class="muted"> Moins de doigts ou de puissance si les parties d’avant en ont beaucoup demandé.</small></span></label>
      ${p.adapt ? h`<p class="tiny ${L.notes.length ? 'acc-t' : 'muted'}">${L.notes.length ? L.notes.join(' ') : 'Rien à adapter : ce qui précède reste léger.'}</p>` : ''}` : ''}
    ${filtersHtml}`;
}
function linkIntensity(p, i) {
  return h`${fieldHead('Durée', p, i, 'minutes')}<span class="unitbox"><input type="number" min="${p.type === 'pause' ? 1 : 5}" max="240" step="5" value="${p.minutes}" data-change="cpPartMin" data-i="${i}" aria-label="Durée de la phase" ${p.locks?.minutes === 'user' ? 'disabled' : ''}><em>min</em></span>
    ${p.type === 'pause' ? '' : h`${fieldHead('Intensité', p, i, 'intensity')}<div class="chips">${Object.entries(INTENSITY).map(([k, [e, l]]) => chip(p.intensity === k, `${e} ${l}`, `data-act="cpPart" data-i="${i}" data-k="intensity" data-v="${k}" ${p.locks?.intensity === 'user' && p.intensity !== k ? 'disabled' : ''}`))}</div>
    <span class="kicker">Fatigue acceptée</span><div class="chips">${Object.entries(FATIGUE).map(([k, l]) => chip(p.fatigue === k, l, `data-act="cpPhFat" data-i="${i}" data-id="${k}"`))}</div>
    <details class="how mini" ${Object.keys(p.tradeoffs || {}).length ? 'open' : ''}><summary>⚖️ Curseurs de compromis${Object.keys(p.tradeoffs || {}).length ? ` (${Object.keys(p.tradeoffs).length})` : ''}</summary>
      ${Object.entries(TRADEOFFS).map(([k, [a, b]]) => h`<label class="trade"><span class="row between tiny"><span>${a}</span><span>${b}</span></span><input type="range" min="-2" max="2" step="1" value="${p.tradeoffs?.[k] || 0}" data-change="cpPhTrade" data-i="${i}" data-k="${k}" aria-label="${a} ou ${b}"></label>`)}
      <p class="tiny muted">Au centre : équilibré. Ces curseurs changent le classement des exercices proposés.</p></details>`}`;
}
function linkPlace(p, i) {
  const envs = ctx().envs, pl = placesNow(CP().parts)[i], mode = p.place?.mode || 'same';
  return h`${fieldHead('Où ?', p, i, 'place', `→ ${pl?.name || ''}`)}
    <div class="chips">${Object.entries(PLACE_MODES).map(([k, l]) => chip(mode === k, i === 0 ? { same: 'Lieu de la séance', other: 'Un lieu précis', free: 'Lieu libre' }[k] : l, `data-act="cpPhPlace" data-i="${i}" data-id="${k}" ${p.locks?.place === 'user' ? 'disabled' : ''}`))}</div>
    ${mode === 'other' ? h`<select data-change="cpPhEnv" data-i="${i}" aria-label="Lieu de la phase" ${p.locks?.place === 'user' ? 'disabled' : ''}><option value="">Choisir un lieu…</option>${envs.map((e) => h`<option value="${e.id}" ${p.place?.envId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select>
      ${i > 0 ? h`<label>Temps de déplacement depuis la phase d’avant<span class="unitbox"><input type="number" min="0" max="180" step="5" value="${p.place?.travelMin ?? ''}" data-change="cpPhTravel" data-i="${i}" placeholder="?" aria-label="Minutes de déplacement"><em>min</em></span></label>` : ''}` : ''}
    ${pl?.equipment ? h`<p class="tiny muted">🧰 ${[...pl.equipment].map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase() || 'aucun matériel déclaré'}</p>` : ''}`;
}
function linkConstraints(p, i) {
  return h`<span class="kicker">Je ne veux pas</span>
    <label class="row"><input type="checkbox" data-change="cpPhNoFail" data-i="${i}" ${p.noFailure ? 'checked' : ''}><span class="grow small">Aller à l’échec</span></label>
    <div class="chips">${chip(!p.maxVolume, 'Volume libre', `data-act="cpPhMaxVol" data-i="${i}" data-id=""`)}${chip(p.maxVolume === 'mod', 'Pas de volume élevé', `data-act="cpPhMaxVol" data-i="${i}" data-id="mod"`)}${chip(p.maxVolume === 'low', 'Peu de volume', `data-act="cpPhMaxVol" data-i="${i}" data-id="low"`)}</div>
    <div class="chips">${[...new Set([...LIMITS, ...(p.avoid || [])])].map((k) => chip((p.avoid || []).includes(k), k, `data-act="cpPhAvoid" data-i="${i}" data-id="${k}"`))}<input class="chipin" data-change="cpPhAvoidAdd" data-i="${i}" maxlength="40" placeholder="＋ Autre" aria-label="Autre chose à limiter"></div>
    <details class="how mini"><summary>Matériel interdit${p.forbidEquip?.length ? ` (${p.forbidEquip.length})` : ''}</summary><div class="chips">${Object.entries(EQUIPMENT).map(([k, l]) => chip((p.forbidEquip || []).includes(k), `🚫 ${l}`, `data-act="cpPhForbidEq" data-i="${i}" data-id="${k}"`))}</div></details>
    <label>Autre contrainte <span class="tiny muted">(facultatif)</span><input data-change="cpPhText" data-i="${i}" data-k="constraints" maxlength="200" value="${p.constraints || ''}" placeholder="Ex. « pas de réglettes, doigt sensible »"></label>`;
}
function linkLocks(p, i) {
  return h`<p class="tiny muted">🤖 = l’app décide · 🔒 = imposé par toi · ✏️ = modifiable. Touche pour changer.</p>
    ${fieldHead('Exercices', p, i, 'exercises')}${fieldHead('Ordre interne', p, i, 'order')}${fieldHead('Repos', p, i, 'rest')}`;
}
const LINK_VIEW = { type: linkType, objectif: linkGoal, sous: linkSubs, params: linkParams, intensite: linkIntensity, lieu: linkPlace, contraintes: linkConstraints, verrous: linkLocks };
function editPart(i) {
  const c = CP(), p = c.parts[i]; if (!p) return;
  const st = chainStatus(p);
  openSheet(h`<div class="stack"><div class="row between wrapf"><h2 style="margin:0">${ROLES[p.role]?.[0] || ''} ${phaseName(p)}</h2><span class="tag">${st.text}</span></div>
    ${p.objective ? h`<p class="tiny acc-t">🎯 Cette phase porte l’objectif de la séance.</p>` : ''}
    <p class="tiny muted">Règle dans l’ordre ce qui compte pour toi : tout le reste, l’app le décide.${st.next ? ` Prochain réglage : ${LINKS[st.next].replace(/^\d · /, '').toLowerCase()}.` : ''}</p>
    ${st.links.map((k) => h`<section class="chainlink ${st.done.includes(k) ? 'done' : ''}"><h4>${st.done.includes(k) ? '✓ ' : ''}${LINKS[k]}</h4>${LINK_VIEW[k](p, i)}</section>`)}
    <button class="btn pri" data-act="closeSheet">OK</button></div>`);
}
ACT.cpPhSub = (el) => upd(Number(el.dataset.i), (p) => { const id = el.dataset.id, l = p.subIntents || []; p.subIntents = l.some((x) => x.id === id) ? l.filter((x) => x.id !== id) : [...l, { id, prio: 2 }]; p.rules = (p.rules || []).filter((r) => p.subIntents.some((x) => x.id.startsWith(r.over + '.') || x.id === r.over) && p.subIntents.some((x) => x.id.startsWith(r.under + '.') || x.id === r.under)); });
ACT.cpPhSubPrio = (el) => upd(Number(el.dataset.i), (p) => { p.subIntents = (p.subIntents || []).map((x) => (x.id === el.dataset.id ? { ...x, prio: Number(el.dataset.v) } : x)); });
CHG.cpPhRuleUnder = (el) => { S.cpRuleUnder = el.value; };
CHG.cpPhRuleOver = (el) => { S.cpRuleOver = el.value; };
ACT.cpPhRuleAdd = (el) => upd(Number(el.dataset.i), (p) => {
  const fams = [...new Set((p.subIntents || []).map((x) => x.id.split('.')[0]))], under = S.cpRuleUnder && fams.includes(S.cpRuleUnder) ? S.cpRuleUnder : fams[0], over = S.cpRuleOver && fams.includes(S.cpRuleOver) ? S.cpRuleOver : fams[1];
  if (!under || !over || under === over) { toast('Choisis deux priorités différentes.'); return; }
  p.rules = [...(p.rules || []).filter((r) => !(r.under === under && r.over === over)), { over, under }].slice(0, 6);
});
ACT.cpPhRuleDel = (el) => upd(Number(el.dataset.i), (p) => { p.rules = (p.rules || []).filter((_, k) => k !== Number(el.dataset.id)); });
CHG.cpPhTrade = (el) => upd(Number(el.dataset.i), (p) => { const v = Math.max(-2, Math.min(2, Math.round(Number(el.value) || 0))); p.tradeoffs = { ...(p.tradeoffs || {}), [el.dataset.k]: v }; if (!v) delete p.tradeoffs[el.dataset.k]; });
ACT.cpPhPlace = (el) => upd(Number(el.dataset.i), (p) => { if (p.locks?.place === 'user') return; p.place = { ...(p.place || {}), mode: el.dataset.id }; });
CHG.cpPhEnv = (el) => upd(Number(el.dataset.i), (p) => { if (p.locks?.place === 'user') return; p.place = { ...(p.place || {}), mode: 'other', envId: el.value }; });
CHG.cpPhTravel = (el) => upd(Number(el.dataset.i), (p) => { p.place = { ...(p.place || {}), travelMin: el.value === '' ? null : Math.max(0, Math.min(180, Math.round(Number(el.value) || 0))) }; });
CHG.cpPhNoFail = (el) => upd(Number(el.dataset.i), (p) => { p.noFailure = el.checked; });
ACT.cpPhMaxVol = (el) => upd(Number(el.dataset.i), (p) => { p.maxVolume = el.dataset.id; });
ACT.cpPhForbidEq = (el) => upd(Number(el.dataset.i), (p) => { const l = p.forbidEquip || [], id = el.dataset.id; p.forbidEquip = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; });
ACT.cpEdit = (el) => editPart(Number(el.dataset.i));
const upd = (i, fn) => { const p = CP().parts[i]; if (!p) return; fn(p); CP().result = null; CP().partsTouched = true; keep(); render(); editPart(i); };
ACT.cpPart = (el) => upd(Number(el.dataset.i), (p) => { p[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'kind' || el.dataset.k === 'intensity') { delete p.structure; if (el.dataset.k === 'kind') { delete p.from; delete p.to; } } });
ACT.cpPhSet = (el) => upd(Number(el.dataset.i), (p) => { if (['attemptType', 'focus', 'volume'].includes(el.dataset.k)) p[el.dataset.k] = el.dataset.id; });
CHG.cpPhAttempts = (el) => upd(Number(el.dataset.i), (p) => { const v = Math.round(Number(el.value)); p.attemptsMax = el.value === '' || !Number.isFinite(v) ? null : Math.max(1, Math.min(99, v)); });
ACT.cpPhStyleOut = (el) => upd(Number(el.dataset.i), (p) => { const l = p.stylesOut || [], id = el.dataset.id; p.stylesOut = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; });
CHG.cpPhSys = (el) => upd(Number(el.dataset.i), (p) => { p.systemId = el.value; delete p.from; delete p.to; });
CHG.cpPartMinRow = (el) => { const p = CP().parts[Number(el.dataset.i)]; if (!p || p.locks?.minutes === 'user') return; p.minutes = Math.max(p.type === 'pause' ? 1 : 5, Math.min(240, Number(el.value) || p.minutes)); CP().result = null; CP().partsTouched = true; keep(); render(); };
CHG.cpPartMin = (el) => upd(Number(el.dataset.i), (p) => { if (p.locks?.minutes === 'user') return; p.minutes = Math.max(p.type === 'pause' ? 1 : 5, Math.min(240, Number(el.value) || p.minutes)); });
CHG.cpPartLv = (el) => upd(Number(el.dataset.i), (p) => { const sys = phSys(p), levels = sortedLevels(sys), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null); p.from ??= lo; p.to ??= hi; p[el.dataset.k] = Number(el.value); });
ACT.cpPartAuto = (el) => upd(Number(el.dataset.i), (p) => { delete p.from; delete p.to; });
ACT.cpPartStyle = (el) => upd(Number(el.dataset.i), (p) => { const id = el.dataset.id, s = p.styles || []; p.styles = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; });
CHG.cpPartMove = (el) => upd(Number(el.dataset.i), (p) => { p.move = el.value; });
CHG.cpPartAdapt = (el) => upd(Number(el.dataset.i), (p) => { p.adapt = el.checked; });
export const climbPlanResult = () => S.cp?.result || null;
void raw;
