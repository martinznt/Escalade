import { comparisonView, advancedUI } from './views-experience.js';
import { proposable } from './sportprefs.js';
import { sessionFromHistory } from './live.js';
// views-climbplan.js — « Structurer ma séance d'escalade » : par objectif de fin de séance, ou partie par partie.
import { h, raw, chip, openSheet, closeSheet, toast, ask, askText, seg } from './ui.js';
import { S, accountToken, accountMatches, ACT, CHG, INPUT, ctx, render, go, saveSeance, ls, putItem, delItem, itemsOf, api } from './state.js';
import { aiEvidence, aiProposalReady } from './srcui.js';
import { uid } from './shared.js';
import { simulate } from './whatif.js';
import { dnaFromPhases, phasesFromDna, moduleFromPhases, insertModule } from './dna.js';
import { strategies, decision, recall, ignoredCount, unusualPlan, DECISION_KINDS, UNUSUAL_WHY } from './strategy.js';
import { parseRequest, planEdit, cleanOps } from './sessionedit.js';
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
import { addField, onChoice, withMyMinutes } from './views-choices.js';
import { isMine } from './choices.js';
import { activePains, readiness, ZONE_LABEL } from './coachbrain.js';
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
import { slotsOn, placeSuits, DAY_LONG, toMin as hmMin } from './planning.js';
import { ymd as dayKey } from './program.js';
import { LINKS, chainStatus, paramsFor } from './sessionchain.js';
import { ROLES, LOCKABLE, LOCK_STATES, FATIGUE, ATTEMPT_TYPES, FOCUS, VOLUME, TRADEOFFS, PLACE_MODES, normalizePhases, normalizePhase, fitDurations, fitShort, newPhase, totalMinutes as phTotal, sessionActivities, sessionIntent, activityLabel as actLabel } from './phase.js';
import { proposeForPhase, analyzeSession, applySuggestion, REASON, phaseName } from './phaseplan.js';
import { loadAnalysis } from './brain.js';
import { alternatives, levelFor } from './generator.js';
import { assessment } from './assess.js';
import { sportFamily, SPORT_STRUCTS, sportProposals, sportTargets, sportMoves, bestPerf, targetAdvice, targetParts, targetLabel, defaultWorkParts, workTitle, moveName, paceOf, fmtPace } from './sportplan.js';
import { MOMENTS, MOMENT_HELP, MAX_AIMS, RANK_WEIGHT, FAMILY_ORDER, familyAim, intentAim, goalAim, textAim, cleanAims, aimCatalog, planFromAims, timeline, clock, sportShort, familyOfCaps, FAM_TITLE, cleanWindows, fromMin, tiers, rankWord } from './aimplan.js';
import { keywordCaps } from './intentions.js';
import { suggestRoutines, insertRoutine, WHEN as RO_WHEN, EFFORT as RO_EFFORT } from './routines.js';
import { myRoutines } from './views-routines.js';
import { goalCaps } from './brain.js';
import { normalizeAimLinks } from './objectivelinks.js';

const key = () => 'sea:climbplan:' + (S.user?.id || 'guest');
const DEFAULT_PARTS = [
  { type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 90, styles: [] },
  { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30, styles: [] }, { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40, styles: [], adapt: true },
  { type: 'cool', minutes: 10 },
];
let aiContext = null;
const CP = () => { const c = S.cp ||= fresh(); if (aiContext !== c) { aiContext = c; S.cpAiBusy = false; S.cpAiDraft = null; } return c; };
const ownsPlan = (owner, c) => S.user?.id === owner && S.cp === c;
/** Nouveau brouillon (ou brouillon repris). 8.28 : pré-rempli d'après le profil (durée habituelle, lieu adapté au sport,
 * zones à ménager, objectifs tirés des envies) ; les anciens brouillons à 7 étapes sont renumérotés.
 * 8.29 : plusieurs sports (chacun dans son lieu) et des objectifs CLASSÉS ; l'ancien objectif unique devient le n°1. */
function fresh() {
  const saved = ls.get(key(), {}) || {};
  const c = { mode: 'goal', kind: 'bloc', envId: '', sys: {}, target: null, styles: [], minutes: 120, parts: DEFAULT_PARTS.map((p) => ({ ...p })), result: null, ...saved, result: null, reasons: [] };
  if (saved.step && saved.v !== 2) c.step = Math.max(1, saved.step - 1);
  c.v = 2;
  c.more = Array.isArray(c.more) ? c.more : []; c.places = c.places && typeof c.places === 'object' ? c.places : {}; c.travel ??= 15; c.aims = Array.isArray(c.aims) ? c.aims : [];
  if (c.objective?.family && !c.aims.length) { const a = familyAim(c.objective.family, c.sport || Object.keys(ctx().activities)[0] || 'conditioning', ctx().activities); if (a) c.aims = [{ ...a, when: { start: 'start', middle: 'middle', end: 'end' }[c.objective.when] || 'auto' }]; }
  c.objective = null;
  if (!saved.step) prefill(c);
  return c;
}
const ENVIE_FAMILY = { force: 'force', endurance: 'endurance', mobilite: 'mobilite', figure: 'force', poids: 'endurance' };
function prefill(c) {
  const x = ctx(), main = x.config?.main || {};
  c.sport ||= Object.keys(x.activities)[0] || 'conditioning';
  const mins = Number(S.settings.defaultMinutes) || Number(main.durations?.[0]) || 0;
  if (mins) c.minutes = Math.max(10, Math.min(300, mins));
  c.zones = Object.entries(S.settings.avoid || {}).filter(([, v]) => v).map(([k]) => k);
  // 8.30 : douleurs notées (7 derniers jours, 3/10 ou plus) → zones pré-cochées ; check-in du matin → forme pré-remplie.
  c.painZones = activePains(x.pains, x.now).map((p) => p.zone).filter((z) => AVOID_ZONES.some(([k]) => k === z) && !c.zones.includes(z));
  c.zones = [...c.zones, ...c.painZones];
  const rd = readiness(x); if (rd.checked) { c.forme = rd.level === 'low' ? 'tired' : rd.level === 'top' ? 'fresh' : 'ok'; c.formeFrom = 'checkin'; }
  // Envies du questionnaire → objectifs classés (dans l'ordre où elles ont été choisies), modifiables à l'étape 2.
  const fams = [...new Set((main.goals || []).map((g) => ENVIE_FAMILY[g]).filter(Boolean))].slice(0, 2);
  if (!c.aims.length && fams.length) { c.aims = fams.map((f) => familyAim(f, c.sport, x.activities)).filter(Boolean).map((a) => ({ ...a, source: 'profile' })); c.objFromProfile = true; }
  placeFor(c);
  c.prefilled = true;
}
/** Sports de la séance : le principal d'abord, puis les autres (chacun peut avoir son lieu). */
const sportsOf = (c = CP()) => [c.sport, ...(c.more || []).filter((s) => s && s !== c.sport)];
const baseEnv = (c = CP()) => c.envId || ctx().defEnv?.id || '';
/** Lieu d'un sport : celui du sport principal = le lieu de la séance ; '' pour un autre sport = même lieu que la phase d'avant. */
const placeOfSport = (sp, c = CP()) => (sp === c.sport ? baseEnv(c) : c.places?.[sp] || '');
const effPlace = (sp, c = CP()) => placeOfSport(sp, c) || baseEnv(c);
/** Horaires précis par lieu (« salle de voie de 18:00 à 19:30, puis salle de bloc de 20:00 à 21:00 »). */
const winPlaces = (c = CP()) => [...new Set(sportsOf(c).map((sp) => effPlace(sp, c)).filter(Boolean))];
const envName = (id) => ctx().envs.find((e) => e.id === id)?.name || 'Lieu';
const winList = (c = CP()) => winPlaces(c).map((id) => ({ envId: id, name: envName(id), from: c.win?.[id]?.from || '', to: c.win?.[id]?.to || '' }));
const winState = (c = CP()) => (c.useWin ? cleanWindows(winList(c)) : { windows: [], errors: [] });
const winOn = (c = CP()) => !!c.useWin && winState(c).windows.length > 0 && ['goals', 'none'].includes(c.aim || 'goals');
/** La structure vient des objectifs classés (ou d'une partie équilibrée par sport quand il y en a plusieurs, ou des horaires). */
const aimsMode = (c = CP()) => ((c.aim || 'goals') === 'goals' && ((c.aims || []).length > 0 || sportsOf(c).length > 1)) || (c.aim === 'none' && sportsOf(c).length > 1) || winOn(c);
function aimOfGoal(g, c = CP()) {
  const x = ctx(), sp = g.activityId && sportsOf(c).includes(g.activityId) ? g.activityId : c.sport;
  const tg = g.type === 'metric' && g.target != null && sportTargets(sp, x).some((t) => t.id === g.metricId) ? { metricId: g.metricId, value: Number(g.target) } : null;
  return goalAim({ id: g.id, label: goalLabel(g) }, goalCaps(g, x), sp, x.activities, tg);
}
/** Objectifs ajoutés ailleurs (fiche d'un objectif, coach, « Que faire aujourd'hui ? ») → dans la liste classée. */
function syncAims(c = CP()) {
  const x = ctx(), sps = sportsOf(c);
  // Un objectif « famille » d'un sport qui n'est plus dans la séance suit le sport principal (libellé refait).
  c.aims = (Array.isArray(c.aims) ? c.aims : []).map((a) => (a && !sps.includes(a.sport) && String(a.key || '').startsWith('fam:') ? { ...(familyAim(a.family, c.sport, x.activities) || a), when: a.when, source: a.source } : a));
  c.aims = cleanAims(c.aims, sps);
  for (const id of c.goalIds || []) {
    if (c.aims.some((a) => a.goalId === id) || c.aims.length >= MAX_AIMS) continue;
    const g = x.goals.find((y) => y.id === id); if (!g) continue;
    if (g.activityId && (x.activities[g.activityId] || ACTIVITIES[g.activityId]) && !sportsOf(c).includes(g.activityId)) c.more = [...(c.more || []), g.activityId];
    const a = aimOfGoal(g, c); if (a) c.aims.push(a);
  }
  for (const id of c.intents || []) { const it = intentsFor(c.sport, extraIntents()).find((y) => y.id === id), a = it && intentAim(it, c.sport, x.activities); if (a && !c.aims.some((y) => y.key === a.key) && c.aims.length < MAX_AIMS) c.aims.push(a); }
  if (c.focus?.caps && c.aims.length < MAX_AIMS) { const a = textAim({ ...c.focus, ai: true }, c.sport, x.activities); if (a) c.aims.push(a); }
  c.intents = []; c.focus = null;
  c.goalIds = c.aims.filter((a) => a.goalId).map((a) => a.goalId);
}
/** Lieu cohérent avec le sport : pour l'escalade, un lieu qui a un mur (sinon on garde le lieu et on le dit). */
function placeFor(c) {
  if (c.envPicked) return;
  const x = ctx(), here = slotHere(c.sport);
  // 8.34 : le lieu noté dans ton créneau d'aujourd'hui (« le mardi, je suis à ma salle »), s'il convient au sport.
  c.slotHint = here ? { date: dayKey(Date.now()), day: here.slot.d, from: here.slot.from, to: here.slot.to, envId: here.env.id } : null;
  if (here) { c.envId = here.env.id; return; }
  if (isClimb(c.sport)) { const e = x.envs.find((v) => availableEquipment(x, v.id).has('wall')); c.envId = e ? e.id : ''; }
  else if (c.envId && !x.envs.some((v) => v.id === c.envId)) c.envId = '';
}
/** Durée du créneau d'aujourd'hui retenu (10 min à 5 h), proposée comme temps disponible ; 0 s'il n'y en a pas. */
const slotMinutes = (c) => { const sl = hintToday(c); if (!sl) return 0; const m = hmMin(sl.to) - hmMin(sl.from); return m >= 10 ? Math.min(300, m) : 0; };
/** Le créneau retenu n'est valable que le jour même (un brouillon rouvert le lendemain ne le montre plus). */
const hintToday = (c) => (c.slotHint && c.slotHint.date === dayKey(Date.now()) ? c.slotHint : null);
/** Créneau d'aujourd'hui (en cours ou à venir, d'après « Mes disponibilités ») dont le lieu convient à ce sport. */
function slotHere(sport) {
  const x = ctx(), now = new Date(), m = now.getHours() * 60 + now.getMinutes(), it = x.activities[sport];
  for (const s of slotsOn(x.config?.availability?.slots, dayKey(now.getTime()), m)) {
    const e = s.envId && x.envs.find((v) => v.id === s.envId && !v.archived);
    if (e && placeSuits(it?.native === false ? '' : sport, e, availableEquipment(x, e.id))) return { slot: s, env: e };
  }
  return null;
}
// Le brouillon est gardé sur l'appareil (fermeture accidentelle, hors ligne) : ossature, choix, changements appliqués.
const keep = () => { const { result, reasons, aimDone, bopts, ...rest } = CP(); ls.set(key(), rest); };
const climbStyles = () => Object.values(ctx().styles || {}).filter((s) => !s.archived && (s.activity === 'climbing' || !s.activity));
const systemsFor = (kind) => Object.values(ctx().systems || {}).filter((s) => s.activity === kind && s.levels?.length);
const sysOf = (kind) => { const c = CP(), all = ctx().systems || {}; return all[c.sys?.[kind]] || pickSystem(ctx(), kind, c.envId); };
const levelsOf = (kind) => sortedLevels(sysOf(kind));
// Une cible vient du choix de l'utilisateur ou d'un maximum réellement noté, jamais du milieu de l'échelle.
const climbTarget = (c = CP()) => {
  const kind = kindOf(c.sport), levels = levelsOf(kind);
  if (Number.isInteger(c.target) && c.target >= 0 && c.target < levels.length) return c.target;
  const sys = sysOf(kind), max = sys ? knownMax(ctx(), sys, kind) : null;
  return max == null || !levels.length ? null : Math.min(levels.length - 1, max + (levels.length > 10 ? 2 : 1));
};
const requireGradeTarget = () => {
  const c = CP();
  if (!isClimb(c.sport) || c.aim !== 'grade' || climbTarget(c) != null) return true;
  c.step = SI.why; keep(); render(); toast('Choisis la cotation que tu veux atteindre.'); return false;
};
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
const STEPS = [['base', 'L’essentiel'], ['why', 'Tes objectifs'], ['structure', 'Ta structure'], ['content', 'Propositions par phase'], ['improve', 'Améliorations'], ['validate', 'Structure finale']];
const SI = { base: 1, why: 2, structure: 3, content: 4, improve: 5, validate: 6 };
const NSTEPS = STEPS.length;
/** Ce que fait chaque étape, en une phrase (affichée en haut de l'étape). */
const STEP_HELP = {
  1: 'Où, quoi et combien de temps. Tout est pré-rempli d’après ton profil : change ce qui ne va pas.',
  2: 'Choisis les résultats que tu veux travailler, puis leur importance. Les objectifs orientent la séance ; ils ne sont pas des étapes à faire une par une.',
  3: 'Une phase est un bloc de temps, d’activité et de lieu. Elle peut servir plusieurs objectifs, et un objectif peut être préparé puis travaillé dans plusieurs phases. Ajuste les liens et les durées si tu veux.',
  4: 'Pour chaque phase, les exercices proposés, classés et expliqués. Change ce que tu veux.',
  5: 'L’app relit toute la séance et propose des améliorations. Rien n’est changé sans ton accord.',
  6: 'Ta structure finale, minute par minute : chaque phase, son lieu, l’objectif qu’elle sert et pourquoi. « Générer » crée la séance exactement comme ça.',
};
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
  if (c.step > SI.why && isClimb(c.sport) && c.aim === 'grade' && climbTarget(c) == null) c.step = SI.why;
  syncAims(c);
  const st = c.step, [, title] = STEPS[st - 1];
  const body = [vBase, vWhy, vStructure, vContent, vImprove, vValidate][st - 1]();
  const NEXT = { 1: 'Mes objectifs ›', 2: 'Voir la structure ›', 3: 'Proposer les exercices ›', 4: 'Chercher des améliorations ›', 5: 'Structure finale ›' };
  return h`<div class="steps"><div class="row between"><b>Étape ${st}/${NSTEPS} · ${title}</b>${st > 1 ? h`<button class="btn sm ghost" data-act="cpRestart">Recommencer</button>` : ''}</div>
      <div class="meter"><i style="width:${Math.round((st / NSTEPS) * 100)}%"></i></div><p class="tiny muted stephelp">ℹ️ ${STEP_HELP[st]}</p></div>
    ${body}
    <div class="stepdock">${st > 1 ? h`<button class="btn" data-act="cpStep" data-d="-1">‹ Retour</button>` : h`<span></span>`}${st < NSTEPS ? h`<button class="btn pri" data-act="cpStep" data-d="1" ${st === SI.why && isClimb(c.sport) && c.aim === 'grade' && climbTarget(c) == null ? 'disabled' : ''}>${NEXT[st] || 'Suivant ›'}</button>` : ''}</div>`;
}
/* « Plus de contrôle » (dans L'essentiel) : combien l'app aide, et qui décide de l'ossature. */
function vHow() {
  const c = CP();
  return h`<span class="kicker">Qui choisit les exercices ?</span>
    <div class="setmenu">${Object.entries(HELP).map(([k, [ic, t, d]]) => h`<button class="setrow" data-act="cpHelp" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${(c.help || 'auto') === k ? '✓' : ''}</span></button>`)}</div>
    <span class="kicker">Niveau de structure <span class="tiny muted">(qui décide des phases et des durées)</span></span>
    <div class="chips choice">${Object.entries(LEVELS).map(([k, [l]]) => chip((c.level || 'modere') === k, l, `data-act="cpLevel" data-id="${k}"`))}</div>
    <p class="tiny muted">${LEVELS[c.level || 'modere'][1]}</p>`;
}
ACT.cpLevel = (el) => { const c = CP(); c.level = el.dataset.id; c.partsTouched = false; keep(); render(); };
// Une synchronisation peut refaire l'écran : garder le choix d'ouvrir ou de replier ces options.
ACT.cpControls = (el) => { const panel = el.closest('details'); if (!panel) return; const c = CP(); c.controlsOpen = !panel.open; panel.open = c.controlsOpen; keep(); };
/* Étape 1 · L'essentiel : sports (un principal + d'autres au choix), lieu de chacun, forme, temps — pré-remplis d'après
 * le profil. « ⚡ Proposer ma séance » construit tout de suite la structure et les exercices ; les étapes suivantes affinent. */
const noWallSports = (c = CP()) => sportsOf(c).filter((sp) => isClimb(sp) && !availableEquipment(ctx(), effPlace(sp, c)).has('wall'));
function vBase() {
  const c = CP(), bad = noWallSports(c);
  return h`${c.prefilled ? h`<p class="tiny muted">✓ Pré-rempli d’après ton profil (durée habituelle, lieu, zones à ménager${c.objFromProfile ? ', objectifs' : ''}). Tout se change ici.</p>` : ''}
    ${vWhere()}
    ${aimsSummary()}
    ${bad.length ? h`<button class="btn pri big" disabled>⚡ Proposer ma séance</button><p class="tiny warn-t center">Choisis d’abord un lieu avec un mur d’escalade pour ${bad.map((sp) => sportLabel(sp)).join(', ')} (voir « Lieu » plus haut).</p>`
      : h`<button class="btn pri big" data-act="cpQuick">⚡ Proposer ma séance</button><p class="tiny muted center">L’app construit la structure et choisit les exercices pour ${fmtMin(c.minutes)}. Tu pourras tout ajuster ensuite, ou continuer étape par étape pour préciser.</p>`}
    <details class="card fold" id="cp-controls" ${(c.controlsOpen ?? !!(c.level && c.level !== 'modere' || c.help && c.help !== 'auto')) ? 'open' : ''}><summary data-act="cpControls"><span>🎛️ Plus de contrôle</span></summary>${vHow()}</details>
    <button class="setrow" data-act="newSeance"><span class="sic">✍️</span><span class="grow"><b>Je préfère l’écrire moi-même</b><small>Page blanche : tes exercices, ton ordre, tes durées. Aucun choix imposé.</small></span><span class="chev">›</span></button>`;
}
const envOptions = (cur, x) => x.envs.map((e) => h`<option value="${e.id}" ${cur === e.id ? 'selected' : ''}>${e.name}</option>`);
function wallWarn(sp) {
  const c = CP(), x = ctx(), id = effPlace(sp, c), env = x.envs.find((e) => e.id === id);
  if (!isClimb(sp) || availableEquipment(x, id).has('wall')) return '';
  return h`<div class="card flat warn-b stack"><p class="small">⚠️ ${env ? `« ${env.name} » n’a pas de mur d’escalade dans son matériel` : 'Aucun lieu avec un mur d’escalade'} : ${sportLabel(sp)} y serait impossible.</p>
    <div class="row wrapf">${x.envs.filter((v) => availableEquipment(x, v.id).has('wall')).map((v) => h`<button class="btn sm" data-act="cpEnvPick" data-id="${v.id}" data-sp="${sp}">📍 ${v.name}</button>`)}<button class="btn sm" data-act="cpEnvNew">＋ Ajouter ma salle</button>${sp === c.sport && (x.activities.conditioning || ACTIVITIES.conditioning) ? h`<button class="btn sm" data-act="cpSport" data-id="conditioning">💪 Plutôt du renforcement ici</button>` : ''}</div></div>`;
}
function vWhere() {
  const c = CP(), x = ctx(), env = envOf(), eq = [...availableEquipment(x, c.envId)], more = sportsOf(c).slice(1);
  const sports = [...new Set([...Object.keys(x.activities), ...Object.keys(ACTIVITIES)])].filter((id) => (x.activities[id] || ACTIVITIES[id]) && (proposable(id, c.sport) || more.includes(id))); // tous les sports, même pas encore dans le profil, sauf ceux que tu ne fais jamais
  const multi = more.some((sp) => (c.places?.[sp] || '') && c.places[sp] !== baseEnv(c));
  return h`<div class="card stack">
    <span class="kicker">Sport principal</span><div class="chips">${sports.map((id) => chip(c.sport === id, sportLabel(id), `data-act="cpSport" data-id="${id}"`))}<button type="button" class="chip add" data-act="allGo" data-to="profile/activities">＋ Ajouter un sport</button></div>
    <span class="kicker">Autres sports dans la même séance <span class="tiny muted">(facultatif, plusieurs possibles)</span></span>
    <div class="chips">${sports.filter((id) => id !== c.sport).map((id) => chip(more.includes(id), sportLabel(id), `data-act="cpSport2" data-id="${id}"`))}</div>
    ${more.length ? h`<p class="tiny muted">Dans cette séance (${sportsOf(c).length} sports, autant que tu veux) : <b>${sportsOf(c).map((sp) => sportShort(sp, x.activities)).join(' → ')}</b>. L’app les place selon tes objectifs et les lieux ; tu peux tout déplacer à l’étape 3.</p>` : ''}
    <label>Lieu${more.length ? ` pour ${sportLabel(c.sport)}` : ''}<select data-change="cpEnv"><option value="">${x.defEnv ? 'Par défaut : ' + x.defEnv.name : 'Aucun lieu décrit'}</option>${envOptions(c.envId, x)}<option value="__new">＋ Ajouter un lieu…</option></select></label>
    ${hintToday(c) && hintToday(c).envId === c.envId ? h`<p class="tiny muted">📍 Lieu de ton créneau du ${DAY_LONG[c.slotHint.day]} (${c.slotHint.from}–${c.slotHint.to}), d’après « Mes disponibilités ».</p>` : ''}
    <p class="tiny ${eq.length ? 'muted' : 'warn-t'}">🧰 ${env ? `Matériel de ${env.name}` : 'Matériel'} : ${eq.length ? eq.map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase() : 'aucun déclaré (séance sans matériel)'} · <button class="linkish acc-t" data-act="allGo" data-to="profile/equipment">modifier</button></p>
    ${more.map((sp) => h`<label>Lieu pour ${sportLabel(sp)}<select data-change="cpEnvFor" data-sp="${sp}"><option value="">Le même que la phase d’avant</option>${envOptions(c.places?.[sp] || '', x)}<option value="__new">＋ Ajouter un lieu…</option></select></label>`)}
    ${multi && !winOn(c) ? h`<label>Trajet entre deux lieux<span class="unitbox"><input type="number" min="0" max="120" step="5" value="${c.travel ?? 15}" data-change="cpTravel" aria-label="Minutes de trajet entre deux lieux"><em>min</em></span></label><p class="tiny muted">Compté dans ton temps disponible, à chaque changement de lieu.</p>` : ''}
    ${winCard()}
    ${sportsOf(c).map(wallWarn)}
    ${isClimb(c.sport) ? sysSelect(kindOf(c.sport)) : ''}
    <span class="kicker">Ma forme aujourd’hui</span><div class="chips">${FORMES.map(([k, e, l]) => chip((c.forme || 'ok') === k, `${e} ${l}`, `data-act="cpForme" data-id="${k}"`))}</div>${c.formeFrom === 'checkin' ? h`<p class="tiny muted">Pré-rempli d’après ton check-in du matin : change-le si besoin.</p>` : ''}
    ${winOn(c) ? h`<p class="small">⏱ Temps disponible : <b>${fmtMin(c.minutes)}</b> <span class="tiny muted">(calculé d’après tes horaires)</span></p>` : h`<span class="kicker">Temps disponible${more.length ? ' (trajets compris)' : ''}</span>
    <div class="chips">${slotMinutes(c) ? chip(c.minutes === slotMinutes(c), `🕒 Mon créneau (${fmtMin(slotMinutes(c))})`, `data-act="cpMin" data-id="${slotMinutes(c)}"`) : ''}${withMyMinutes([30, 45, 60, 90, 120, 150, 180, 240, 300]).filter((m) => m >= 10 && m !== slotMinutes(c)).map((m) => chip(c.minutes === m, fmtMin(m), `data-act="cpMin" data-id="${m}"`))}<label class="row tight"><input type="number" min="10" max="300" step="5" value="${c.minutes}" data-change="cpMinIn" style="width:80px" aria-label="Minutes"><span class="tiny">min</span></label></div>`}</div>`;
}
/** Horaires précis : une arrivée et un départ par lieu ; le temps entre deux lieux devient le trajet. */
function winCard() {
  const c = CP(), l = winList(c), st = winState(c);
  if (!l.length) return '';
  const ws = st.windows, gaps = ws.slice(1).map((w, k) => w.from - ws[k].to);
  return h`<label class="chk"><input type="checkbox" data-change="cpUseWin" ${c.useWin ? 'checked' : ''}> 🕒 J’ai des horaires précis</label>
    ${c.useWin ? h`<p class="tiny muted">Pour chaque lieu : quand tu arrives et quand tu pars. Le temps entre deux lieux devient le trajet. Le renforcement, le gainage ou la mobilité vont là où il y a le matériel qu’il faut.</p>
      ${l.map((w) => h`<div class="winrow"><b class="small">📍 ${w.name}</b><label class="tiny">Arrivée <input type="time" value="${w.from}" data-change="cpWin" data-id="${w.envId}" data-k="from" aria-label="Arrivée à ${w.name}"></label><label class="tiny">Départ <input type="time" value="${w.to}" data-change="cpWin" data-id="${w.envId}" data-k="to" aria-label="Départ de ${w.name}"></label></div>`)}
      ${st.errors.length && l.every((w) => w.from && w.to) ? h`<p class="tiny warn-t">${st.errors.join(' ')}</p>` : !ws.length ? h`<p class="tiny muted">Remplis les heures de chaque lieu.</p>` : ''}
      ${ws.length ? h`<p class="tiny ok-t">✓ ${ws.map((w) => `${w.name} ${fromMin(w.from)}–${fromMin(w.to)}`).join(' → ')}${gaps.some((g) => g > 0) ? ` · ${gaps.filter((g) => g > 0).map((g) => `${g} min entre deux`).join(', ')}` : ''}</p>` : ''}
      ${l.length === 1 ? h`<p class="tiny muted">Un seul lieu : choisis un lieu différent pour un autre sport pour faire deux créneaux.</p>` : ''}` : ''}`;
}
const winSync = (c = CP()) => { const ws = winState(c).windows; if (c.useWin && ws.length) c.minutes = Math.max(10, Math.min(300, ws.at(-1).to - ws[0].from)); };
CHG.cpUseWin = (el) => { const c = CP(); c.useWin = el.checked; winSync(c); c.result = null; c.built = null; keep(); render(); };
CHG.cpWin = (el) => {
  const c = CP(), id = el.dataset.id, k = el.dataset.k; if (!['from', 'to'].includes(k) || (el.value && !/^\d\d:\d\d$/.test(el.value))) return;
  c.win = { ...(c.win || {}), [id]: { ...(c.win?.[id] || {}), [k]: el.value } }; winSync(c); c.result = null; c.built = null; keep(); render();
};
/** Rappel des objectifs classés dans « L'essentiel » (ils se choisissent et se classent à l'étape 2). */
const AIM_NAME = { grade: '🧗 Réussir une cotation à la fin', target: '🎯 Atteindre une performance', surprise: '🎲 Surprends-moi', none: '🙂 Rien de particulier' };
function aimsSummary() {
  const c = CP(), l = c.aims || [];
  if ((c.aim || 'goals') !== 'goals' && AIM_NAME[c.aim]) return h`<div class="card flat row between wrapf"><span class="small">🎯 Séance : ${AIM_NAME[c.aim]}</span><button class="btn sm" data-act="cpStepTo" data-id="2">Changer</button></div>`;
  return h`<div class="card stack"><div class="row between wrapf"><b class="small">🎯 Tes objectifs${l.length > 1 ? (c.equal ? ' (sans hiérarchie)' : ' (par importance)') : ''}</b><button class="btn sm" data-act="cpStepTo" data-id="2">${l.length ? 'Modifier ou classer' : '＋ Ajouter'}</button></div>
    ${l.length ? h`<ul class="clean small tight aimol">${l.map((a, i) => h`<li><b>${c.equal && l.length > 1 ? '•' : rankWord(l, i)}</b> ${a.emoji} ${a.label}</li>`)}</ul>` : h`<p class="tiny muted">Aucun : l’app fera une séance équilibrée${sportsOf(c).length > 1 ? ' pour chaque sport' : ''}. Ajoute-les à l’étape 2 pour une séance sur mesure.</p>`}</div>`;
}
/* Étape 2 · Tes objectifs : une liste CLASSÉE (n°1 = le plus important), sur un ou plusieurs sports. On ajoute depuis
 * les 6 familles (expliquées), les intentions précises du sport, ses objectifs du profil, ou avec ses mots (IA). */
const SRC = { profile: 'tiré de ton profil', goal: 'objectif de ton profil', ai: 'écrit avec tes mots (compris par l’IA)', words: 'écrit avec tes mots', auto: '' };
function vWhy() {
  const c = CP(), x = ctx(), kind = kindOf(c.sport), climb = isClimb(c.sport);
  const OTHER = [...(climb ? [['grade', '🧗', 'Réussir une cotation à la fin', 'Ex. un U8 en dévers : échauffement, montée, puis essais.']] : []), ...(sportFamily(c.sport) && sportTargets(c.sport, x).length ? [['target', '🎯', 'Atteindre une performance', TARGET_EX[sportFamily(c.sport)]]] : []), ['surprise', '🎲', 'Surprends-moi', 'Quelque chose de nouveau, ou qui te fait progresser.'], ['none', '🙂', 'Rien de particulier', 'Une séance équilibrée pour ton sport.']];
  const aim = OTHER.some(([k]) => k === c.aim) ? c.aim : 'goals';
  let detail = '';
  if (aim === 'grade') {
    const levels = levelsOf(kind), sys = sysOf(kind), max = sys ? knownMax(x, sys, kind) : null;
    const t = climbTarget(c), advice = t == null ? '' : goalAdvice(t, max, levels); c.targetShown = t;
    detail = h`<div class="card stack"><span class="kicker">À la fin, je veux avoir réussi</span>
      ${t == null ? h`<p class="small muted">Ton maximum n’est pas renseigné. Choisis la cotation que tu veux atteindre ; aucune cible n’est supposée.</p>` : ''}
      ${levels.length <= 16 ? h`<div class="chips">${levels.map((l, i) => chip(i === t, l.label, `data-act="cpTarget" data-id="${i}"`))}</div>` : h`<select data-change="cpTargetSel"><option value="" ${t == null ? 'selected' : ''}>Choisir ma cotation cible</option>${levels.map((l, i) => h`<option value="${i}" ${i === t ? 'selected' : ''}>${l.label}</option>`)}</select>`}
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
  const one = aim !== 'goals' && aim !== 'none' && sportsOf(c).length > 1 ? h`<p class="tiny warn-t">Ce mode construit la séance sur ton sport principal (${sportLabel(c.sport)}) seulement.</p>` : '';
  return h`${aim === 'goals' ? h`${aimsCard()}${addCard()}` : h`<div class="card flat stack"><div class="row between wrapf"><span class="small">Mode choisi : <b>${AIM_NAME[aim]}</b>${(c.aims || []).length ? ' · tes objectifs classés sont gardés' : ''}</span><button class="btn sm" data-act="cpAim" data-id="goals">‹ Mes objectifs classés</button></div>${one}</div>${detail}`}
    <span class="kicker">Ou une autre façon de construire la séance</span>
    <div class="setmenu">${OTHER.map(([k, ic, t, d]) => h`<button class="setrow" data-act="cpAim" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">${aim === k ? '✓' : '›'}</span></button>`)}</div>
    <div class="card stack"><span class="kicker">🛡️ Zones à ménager <span class="tiny muted">(facultatif)</span></span>
      <div class="chips">${AVOID_ZONES.map(([k, l]) => chip((c.zones || []).includes(k), l, `data-act="cpZone" data-id="${k}"`))}${addField('zone', 'cpZone')}</div>
      ${(c.painZones || []).filter((z) => (c.zones || []).includes(z)).length ? h`<p class="tiny warn-t">🩹 Pré-coché d’après tes douleurs notées (${c.painZones.filter((z) => (c.zones || []).includes(z)).map((z) => ZONE_LABEL[z]).join(', ')}). Décoche si c’est passé.</p>` : ''}
      <p class="tiny muted">Les exercices qui les chargent fort sont écartés de cette séance.${(c.zones || []).some(isMine) ? ' Tes zones ajoutées sont rappelées sur chaque exercice : l’app ne sait pas lesquels les chargent.' : ''}</p></div>
    ${aim === 'goals' ? '' : h`<div class="card stack">${wordsField(false)}</div>`}`;
}
function aimsCard() {
  const c = CP(), l = c.aims || [], n = l.length, eq = !!c.equal && n > 1, T = tiers(l), tieN = (i) => T.filter((x) => x === T[i]).length;
  return h`<div class="card stack"><h3 style="margin:0">🎯 Tes objectifs${eq ? ', sans hiérarchie' : ', du plus au moins important'}</h3>
    ${n > 1 ? seg('cpEqual', eq ? 'equal' : 'rank', [['rank', '🥇 Classés par importance'], ['equal', '⚖️ Sans hiérarchie']]) : ''}
    ${n ? h`<div class="aimlist">${l.map((a, i) => h`<div class="aimrow"><span class="rank ${!eq && tieN(i) > 1 ? 'tie' : ''}" aria-label="${eq ? 'Objectif' : rankWord(l, i)}">${eq ? '•' : T[i] + 1}${!eq && tieN(i) > 1 ? '=' : ''}</span><span class="grow aimtxt"><b>${a.emoji} ${a.label}</b><small>${[!eq && T[i] === 0 ? (tieN(i) > 1 ? 'n°1 ex æquo : le plus de temps, à égalité' : 'le plus important : le plus de temps') : !eq && tieN(i) > 1 ? `${rankWord(l, i)} : même part que les autres n°${T[i] + 1}` : '', SRC[a.source] || '', a.summary || ''].filter(Boolean).join(' · ')}</small></span>
        <span class="aimbtns">${!eq && i > 0 ? h`<button class="btn sm ic ${a.tie ? 'pri' : ''}" data-act="cpAimTie" data-i="${i}" aria-pressed="${!!a.tie}" aria-label="${a.tie ? 'Séparer de l’objectif au-dessus' : 'Même importance que l’objectif au-dessus'}" title="${a.tie ? 'Séparer de l’objectif au-dessus' : 'Même importance que l’objectif au-dessus'}">=</button>` : ''}<button class="btn sm ic" data-act="cpAimUp" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Monter ${a.label}">↑</button><button class="btn sm ic" data-act="cpAimDown" data-i="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="Descendre ${a.label}">↓</button><button class="btn sm ic danger" data-act="cpAimDel" data-i="${i}" aria-label="Retirer ${a.label}">✕</button></span></div>`)}</div>
      <p class="tiny muted">${eq ? 'Tous aussi importants : chaque objectif pèse autant dans le temps attribué aux blocs compatibles. L’app choisit l’ordre selon l’effort (↑ ↓ ne change que l’ordre d’affichage). À l’étape 3, tu peux fixer le moment de chacun.' : '↑ ↓ pour classer. « = » met un objectif à la même importance que celui au-dessus (ex æquo). Leur importance oriente le temps et les capacités des blocs auxquels ils contribuent. À l’étape 3, tu peux choisir leur moment.'}</p>
      <p class="tiny muted">Plusieurs objectifs compatibles peuvent partager le même bloc. Un objectif peut aussi servir de fil conducteur à la préparation et au travail principal ; le temps partagé est compté une seule fois.</p>
      ${eq ? '' : h`<button class="btn sm" data-act="cpStrat">🧭 Plusieurs chemins pour ton n°1</button>`}`
      : h`<p class="small muted">Aucun objectif pour l’instant : ajoute-en un ou plusieurs ci-dessous. Sans objectif, l’app fait une séance équilibrée.</p>`}</div>`;
}
const addSport = (c = CP()) => (sportsOf(c).includes(c.addFor) ? c.addFor : c.sport);
const phaseObjectives = (p) => { const c = CP(), aims = c.aims || [], ranks = tiers(aims); return normalizeAimLinks(p, aims).map((link) => { const i = aims.findIndex((a) => a.key === link.key); return i < 0 ? link : { ...link, label: aims[i].label, caps: aims[i].caps || {}, source: aims[i].source || '', goalId: aims[i].goalId || '', rank: ranks[i], equal: !!c.equal }; }); };
const phaseObjectiveText = (p) => phaseObjectives(p).map((a) => `${a.equal || CP().equal ? '' : `n°${a.rank + 1} `}${a.label}${a.contribution === 'preparation' ? ' (préparation)' : a.contribution === 'support' ? ' (complément)' : ''}`).join(' · ');
function addCard() {
  const c = CP(), x = ctx(), sps = sportsOf(c), sp = addSport(c), cat = aimCatalog(sp, x.activities, extraIntents()), has = (k) => (c.aims || []).some((a) => a.key === k);
  const goals = activeGoals(x), short = sportShort(sp, x.activities).toLowerCase();
  return h`<details class="card fold addaim" ${!(c.aims || []).length || c.addOpen ? 'open' : ''}><summary><span>＋ Ajouter un objectif</span></summary>
    <p class="tiny muted">Ajoute-en autant que tu veux. Si le temps manque, chacun a une part plus courte (et c’est dit à l’étape 3).</p>
    ${sps.length > 1 ? h`<span class="kicker">Pour quel sport ?</span><div class="chips">${sps.map((id) => chip(id === sp, sportLabel(id), `data-act="cpAddFor" data-id="${id}"`))}</div>` : ''}
    <span class="kicker">1 · Ce que tu veux travailler en ${short}</span>
    <div class="setmenu">${cat.families.map((a) => h`<button class="setrow" data-act="cpAimAdd" data-k="${a.key}" data-sp="${sp}"><span class="sic">${a.emoji}</span><span class="grow"><b>${a.label}</b><small>${a.help}</small></span><span class="chev">${has(a.key) ? '✓' : '＋'}</span></button>`)}</div>
    <span class="kicker">2 · Ou plus précis</span>
    <div class="chips">${cat.precise.map((a) => chip(has(a.key), `${a.emoji} ${a.label.replace(/ · [^·]+$/, '')}`, `data-act="cpAimAdd" data-k="${a.key}" data-sp="${sp}"`))}</div>
    ${goals.length ? h`<span class="kicker">3 · Un de tes objectifs du profil</span><div class="chips">${goals.map((g) => chip((c.aims || []).some((a) => a.goalId === g.id), `🎯 ${goalLabel(g)}`, `data-act="cpAimGoal" data-id="${g.id}"`))}</div>` : ''}
    ${wordsField(true, goals.length ? 4 : 3)}
    ${S.cpAiDraft ? aiDraftCard() : ''}</details>`;
}
/** Un seul champ « avec tes mots » : il sert d'intention à cette séance et, si tu le demandes, devient un objectif classé
 * (compris par l'IA) ou un objectif de ton profil. Hors mode « objectifs », seulement intention + profil. */
function wordsField(withAim, num = 0) {
  const c = CP(), t = String(c.intentText || '').trim();
  return h`<span class="kicker">${num ? `${num} · ` : ''}✍️ Avec tes mots <span class="tiny muted">(facultatif)</span></span>
    <textarea data-input="cpWords" rows="2" maxlength="240" placeholder="Ex. « tenir plus longtemps dans les voies déversantes »" aria-label="Ce que tu veux, avec tes mots">${c.intentText || ''}</textarea>
    <p class="tiny muted">${withAim ? 'Gardé comme intention de cette séance. Tu peux aussi le faire comprendre par l’IA pour l’ajouter à ta liste classée, ou l’enregistrer dans ton profil.' : 'Gardé comme intention de cette séance seulement, sauf si tu l’enregistres dans ton profil.'}</p>
    <div class="row wrapf">${withAim ? h`<button class="btn sm" data-act="cpAiAim" ${S.cpAiBusy ? 'disabled' : ''}>${S.cpAiBusy ? '⏳ L’IA réfléchit…' : '＋ Ajouter à mes objectifs'}</button>` : ''}
      ${c.intentGoal && t ? h`<span class="tiny ok-t">✓ Enregistré dans ton profil.</span>` : h`<button class="btn sm ghost" data-act="cpIntentGoal">🎯 Enregistrer dans mon profil</button>`}</div>
    ${withAim && c.aiAdded && c.aiAdded === t ? h`<p class="tiny ok-t">✓ Ajouté à ta liste classée.</p>` : ''}`;
}
function aiDraftCard() {
  const d = S.cpAiDraft, x = ctx();
  if (d.error) return h`<div class="card flat stack"><p class="small warn-t" role="status">${d.error}</p><p class="tiny muted">Aucun objectif n’a été ajouté. Précise ta demande dans le champ ci-dessus.</p>${d.localAvailable ? h`<button class="btn sm" data-act="cpAiLocal">Préparer sans IA</button>` : ''}<button class="btn sm ghost" data-act="cpAiCancel">Fermer</button></div>`;
  return h`<div class="card flat acc-b stack"><b>${d.emoji || '✍️'} ${d.label}</b>${d.why ? h`<p class="tiny warn-t">${d.why}</p>` : ''}${d.summary ? h`<p class="small">${d.summary}</p>` : ''}
    ${d.ai ? aiEvidence(d) : h`<p class="tiny muted">Préparation locale sans IA : les mots reconnus suggèrent des capacités. Relis et choisis le type de travail.</p>`}
    ${Object.keys(d.caps || {}).length ? h`<span class="tiny muted">Ça travaille :</span><div class="chips">${Object.keys(d.caps).map((id) => h`<span class="chip static">${CAPACITIES[id]?.label || id}</span>`)}</div>` : ''}
    ${d.family ? h`<p class="tiny muted">Type de travail compris : ${INTENT_FAMILIES[d.family]?.emoji || ''} ${FAM_TITLE[d.family]} · en ${sportShort(d.sport, x.activities).toLowerCase()}.</p>` : h`<p class="small warn-t">Je n’ai pas su le relier à un type de travail : choisis-le.</p>`}
    <div class="chips">${FAMILY_ORDER.map((f) => chip(d.family === f, `${INTENT_FAMILIES[f].emoji} ${FAM_TITLE[f]}`, `data-act="cpAiFam" data-id="${f}"`))}</div>
    <div class="row wrapf"><button class="btn sm pri" data-act="cpAiAdd" ${d.family ? '' : 'disabled'}>＋ Ajouter à mes objectifs</button><button class="btn sm ghost" data-act="cpAiCancel">Annuler</button></div></div>`;
}
/* Actions de la liste classée (aucune ne change la structure en silence : l'étape 3 la recalcule et l'explique). */
const aimsChanged = (c = CP()) => { c.result = null; c.built = null; c.generated = false; keep(); render(); };
const removeAim = (c, i) => { const a = c.aims?.[i]; if (!a) return null; for (const p of c.parts || []) p.aimLinks = phaseObjectives(p).filter((x) => x.key !== a.key); c.aims.splice(i,1); c.goalIds = c.aims.filter((y) => y.goalId).map((y) => y.goalId); return a; };
const moveAim = (i, d) => { const c = CP(), l = c.aims || [], j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; c.objFromProfile = false; aimsChanged(c); };
ACT.cpAimUp = (el) => moveAim(Number(el.dataset.i), -1);
ACT.cpAimDown = (el) => moveAim(Number(el.dataset.i), 1);
ACT.cpAimDel = (el) => { const c = CP(), a = removeAim(c, Number(el.dataset.i)); if (!a) return; aimsChanged(c); toast(`« ${a.label} » retiré.`); };
ACT.cpAddFor = (el) => { const c = CP(); c.addFor = el.dataset.id; c.addOpen = true; keep(); render(); };
const pushAim = (c, a) => { if (!a) return; if (c.aims.length >= MAX_AIMS) { toast(`Déjà ${MAX_AIMS} objectifs : c’est beaucoup pour une séance, retire ceux qui comptent le moins.`); return; } c.aims.push(a); c.addOpen = true; c.objFromProfile = false; aimsChanged(c); toast(c.aims.length > 1 ? `Ajouté en n°${c.aims.length} : classe-le avec ↑ ↓.` : 'Ajouté en n°1.', 3500); };
ACT.cpAimAdd = (el) => {
  const c = CP(), sp = el.dataset.sp || c.sport, k = el.dataset.k, i = (c.aims || []).findIndex((a) => a.key === k);
  if (i >= 0) { removeAim(c,i); c.addOpen = true; aimsChanged(c); return; }
  const cat = aimCatalog(sp, ctx().activities, extraIntents()), a = [...cat.families, ...cat.precise].find((y) => y.key === k);
  if (a) { const { help, ...aim } = a; pushAim(c, aim); }
};
ACT.cpAimGoal = (el) => {
  const c = CP(), x = ctx(), i = (c.aims || []).findIndex((a) => a.goalId === el.dataset.id);
  if (i >= 0) { removeAim(c,i); c.addOpen = true; aimsChanged(c); return; }
  const g = x.goals.find((y) => y.id === el.dataset.id); if (!g) return;
  if (g.activityId && (x.activities[g.activityId] || ACTIVITIES[g.activityId]) && !sportsOf(c).includes(g.activityId)) { c.more = [...(c.more || []), g.activityId]; toast(`${sportLabel(g.activityId)} ajouté à la séance pour cet objectif.`, 3500); }
  pushAim(c, aimOfGoal(g, c)); c.goalIds = c.aims.filter((y) => y.goalId).map((y) => y.goalId); keep();
};
INPUT.cpWords = (el) => { const c = CP(), v = el.value.slice(0, 240); if (v.trim() !== String(c.intentText || '').trim()) c.intentGoal = ''; c.intentText = v; keep(); };
// Objectif écrit avec ses mots : l'IA le relie à des capacités (réponse validée par le serveur, relue ici avant l'ajout) ;
// Sans IA, une préparation locale est proposée seulement sur choix explicite ; un refus demande une précision.
ACT.cpAiAim = async () => {
  const c = CP(), token = accountToken(), current = () => accountMatches(token) && ownsPlan(token.owner, c) && String(c.intentText || '').trim().slice(0, 200) === text && S.cpAiBusy;
  const text = String(c.intentText || '').trim().slice(0, 200), sp = addSport(c); if (text.length < 3) { toast('Écris ce que tu veux travailler, en quelques mots.'); return; }
  if (S.cpAiBusy) return;
  S.cpAiBusy = true; S.cpAiDraft = null; render();
  try {
    const r = (await api('POST', '/api/ai/intent', { text, activityId: sp, kind: 'intent' }, { timeout: 45000 })).intent;
    if (!current()) return;
    if (!aiProposalReady(r)) throw Object.assign(new Error('La proposition de l’assistant n’est pas vérifiable. Précise ce que tu veux travailler.'), { status: 422 });
    S.cpAiDraft = { ...r, ai: true, text, sport: sp, family: familyOfCaps(r.caps) };
  } catch (e) {
    if (!current()) return;
    S.cpAiDraft = { error: e.message || 'Assistant indisponible.', text, sport: sp, localAvailable: !!(e.guest || e.offline || [503, 429].includes(e.status)) };
  } finally {
    if (accountMatches(token) && ownsPlan(token.owner, c)) { S.cpAiBusy = false; render(); }
  }
};
ACT.cpAiLocal = () => { const c = CP(), d = S.cpAiDraft; if (!d?.localAvailable || d.text !== String(c.intentText || '').trim().slice(0, 200)) return; const caps = keywordCaps(d.text); S.cpAiDraft = { label: d.text.slice(0, 50), emoji: '✍️', caps, text: d.text, sport: d.sport, ai: false, family: familyOfCaps(caps) }; render(); };
ACT.cpAiFam = (el) => { if (S.cpAiDraft && !S.cpAiDraft.error) { S.cpAiDraft.family = el.dataset.id; render(); } };
ACT.cpAiCancel = () => { S.cpAiDraft = null; render(); };
ACT.cpAiAdd = () => { const c = CP(), d = S.cpAiDraft; if (!d?.family) return; const a = textAim(d, sportsOf(c).includes(d.sport) ? d.sport : c.sport, ctx().activities, d.family); S.cpAiDraft = null; c.aiAdded = String(c.intentText || '').trim(); pushAim(c, a); };
// Seulement sur action explicite : l'intention devient un objectif (fiche relue et modifiable avant l'enregistrement).
ACT.cpIntentGoal = () => { const c = CP(); if (String(c.intentText || '').trim().length < 3) { toast('Écris d’abord ce que tu veux, en quelques mots.'); return; } keep(); ACT.goalFromText?.({ dataset: { text: c.intentText, back: 'cp' } }); };
const TARGET_EX = { run: 'Ex. 10 km en 50 min : échauffement, montée, blocs à l’allure visée.', swim: 'Ex. 100 m en 1:40 : éducatifs, montée, séries à l’allure visée.', load: 'Ex. 100 kg au squat : montée en charge, paliers, puis volume.', body: 'Ex. 15 tractions : séries faciles, séries max, pyramide.' };
CHG.cpTMetric = (el) => { const c = CP(); c.tMetric = el.value; c.tValue = null; keep(); render(); };
CHG.cpTValue = (el) => { const c = CP(), v = Number(String(el.value).replace(',', '.')); c.tMetric ||= sportTargets(c.sport, ctx())[0]?.id; c.tValue = Number.isFinite(v) && el.value !== '' ? v : null; keep(); render(); };
/* Priorités 1–4 des sous-objectifs d'une phase (réglage d'une phase). */
const prioRows = (list, act, extra = '') => (list?.length ? h`<div class="stack tight">${list.map((x) => h`<div class="row between wrapf prow"><span class="small">${labelOf(x.id)}</span><span class="chips tight">${[1, 2, 3, 4].map((v) => chip(x.prio === v, String(v), `data-act="${act}" data-id="${x.id}" data-v="${v}" ${extra} title="${PRIO[v]}" aria-label="${labelOf(x.id)} : ${PRIO[v]}"`))}</span></div>`)}<p class="tiny muted">1 = secondaire · 2 = important · 3 = prioritaire · 4 = très prioritaire</p></div>` : '');
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
  // Capacités des objectifs classés, pondérées par le rang (le n°1 compte le plus).
  if ((c.aim || 'goals') === 'goals') (c.aims || []).forEach((a, i) => { for (const [k, w] of Object.entries(a.caps || {})) caps[k] = Math.max(caps[k] || 0, w * (RANK_WEIGHT[i] ?? 1)); });
  return sessionIntent({ text: c.intentText, priorities: Object.entries(caps).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k), savedAsGoal: c.intentGoal || '' });
}
function vStructure() {
  const c = CP(), lvl = c.level || 'modere', ph = c.parts, total = phTotal(ph), acts = sessionActivities(ph);
  const compact = (lvl === 'libre' || lvl === 'leger') && !c.editStruct;
  if (c.aim === 'surprise' && !isClimb(c.sport) && compact) return h`<div class="card"><p class="small">🎲 Niveau « ${LEVELS[lvl][0]} » : la surprise choisit la structure. Passe à l’étape suivante pour la découvrir.</p><button class="btn sm" data-act="cpEditStruct">✏️ Construire la structure moi-même</button></div>`;
  const fit = total !== c.minutes ? fitDurations(ph, c.minutes) : null;
  const tr = transitions(ph, ctx().envs, baseEnv(c)), bu = budget(ph, c.minutes, tr, {places:resolvePlaces(ph,ctx().envs,baseEnv(c)),aims:c.aims||[]}), nf = Object.keys(c.filters || {}).length;
  const issues = tr.flatMap((t) => t.issues.map((x) => ({ ...x, to: t.to })));
  return h`${aimsMode(c) ? momentsCard() : ''}${(c.planErrors || []).length ? h`<div class="card warn-b"><b>Les horaires ne permettent pas cette structure</b>${c.planErrors.map((e) => h`<p class="small">${e}</p>`)}</div>` : ''}<div class="card stack"><div class="row between wrapf"><b>${fmtMin(bu.needed || total)} au total</b><span class="tiny muted">${ph.length} phase${ph.length > 1 ? 's' : ''} · ${acts.length > 1 ? `${acts.length} activités` : actLabel(acts[0] || c.sport)}${bu.travel ? ` · 🚗 ${bu.travel} min de déplacement` : ''}</span></div>
      <p class="tiny ${bu.over ? 'warn-t' : 'muted'}">⏱ ${bu.text}</p>
      ${organizationView(bu.organization)}
      ${bu.over ? h`<details class="how mini" open><summary>Ce qui pourrait être sacrifié</summary>${bu.sacrifice.map((x, k) => h`<div class="row between wrapf"><span class="small">${x.text} <span class="tiny muted">— ${x.compromise}</span></span><button class="btn sm" data-act="cpSacrifice" data-id="${k}">Appliquer</button></div>`)}</details>` : ''}
      ${total !== c.minutes && !bu.travel ? h`<div class="row wrapf">${fit?.ok ? h`<button class="btn sm" data-act="cpFit">⚖️ Ajuster à ${fmtMin(c.minutes)} (les 🔒 ne bougent pas)</button>` : h`<span class="tiny warn-t">${fit?.error || ''}</span>`}<button class="btn sm ghost" data-act="cpKeepTotal">Garder ${fmtMin(total)}</button></div>` : bu.travel && bu.needed !== c.minutes ? h`<button class="btn sm ghost" data-act="cpKeepTotal">Garder ${fmtMin(bu.needed)} (trajets compris)</button>` : ''}
      ${sessIntent().text ? h`<p class="tiny acc-t">📝 Intention d’aujourd’hui : « ${sessIntent().text} »</p>` : ''}
      <button class="btn sm" data-act="cpFilters">🔎 Filtres pour toute la séance${nf ? ` (${nf})` : ''}</button>
      ${nf ? h`<p class="tiny muted">${filterText(globalFilterValues()).join(' · ')}</p>` : ''}</div>
    ${issues.length ? h`<div class="card flat warn-b stack"><b class="small">↔️ Transitions entre phases</b>${issues.map((x) => h`<div class="row between wrapf"><span class="small">Phase ${x.to + 1} : ${x.text}</span>${x.proposal ? h`<button class="btn sm" data-act="cpTransPause" data-id="${x.to}">＋ ${x.proposal.minutes} min de récupération</button>` : ''}</div>`)}</div>` : ''}
    ${routinesCard()}
    ${compact ? h`<div class="setmenu">${ph.map((p) => h`<div class="setrow"><span class="sic">${ROLES[p.role][0]}</span><span class="grow"><b>${phaseName(p)}</b><small>${actLabel(p.activity)} · ${fmtMin(p.minutes)}</small>${phaseObjectives(p).length ? h`<small>Objectifs associés : ${phaseObjectiveText(p)}</small>` : ''}</span></div>`)}</div>
        <button class="btn" data-act="cpEditStruct">✏️ Modifier la structure</button>` : vPhases()}`;
}
const organizationView=(o)=>h`<div class="cp-organization"><p class="tiny muted cp-org-summary">${o.summary}</p><details class="how mini cp-org-details" ${advancedUI()?'open':''}><summary>Organisation et consignes : ce qui est connu</summary><ul class="clean tight tiny">${o.facts.map((t)=>h`<li>${t}</li>`)}</ul><p class="tiny muted">${o.unknown.join(' ')}</p></details></div>`;
/** Étape 3 : le moment de chaque objectif (auto, début, milieu, fin) et ce que l'app en déduit, expliqué. */
function momentsCard() {
  const c = CP(), l = c.aims || [];
  return h`<div class="card stack"><h3 style="margin:0">⏱️ Objectifs et organisation des phases</h3><p class="small muted">Les objectifs disent ce que tu veux obtenir. Les phases disent quand, où et comment tu t’entraînes. Fixer un moment contraint le travail principal de l’objectif ; sa préparation peut venir avant.</p>
    ${l.length ? h`<div class="aimlist">${l.map((a, i) => h`<div class="momrow"><span class="rank">${c.equal && l.length > 1 ? '•' : tiers(l)[i] + 1}</span><span class="grow small aimtxt">${a.emoji} ${a.label}</span><select data-change="cpAimWhen" data-i="${i}" aria-label="Moment de ${a.label}">${Object.entries(MOMENTS).map(([k, t]) => h`<option value="${k}" ${(a.when || 'auto') === k ? 'selected' : ''}>${t}</option>`)}</select></div>`)}</div>
      <ul class="clean tight tiny muted">${Object.entries(MOMENT_HELP).map(([k, t]) => h`<li><b>${MOMENTS[k]}</b> — ${t}</li>`)}</ul>`
      : h`<p class="small muted">Pas d’objectif classé : une partie équilibrée pour chaque sport. Ajoute des objectifs à l’étape 2 pour une séance sur mesure.</p>`}
    ${c.partsTouched ? h`<p class="tiny warn-t">Tes phases et leurs verrous sont conservés. Si tu changes le moment d’un objectif, ajuste toi-même ses phases ou choisis « Structure proposée » pour recalculer.</p>`
      : (c.planNotes || []).length ? h`<div class="card flat acc-b"><b class="small">🧠 Comment la séance s’adapte</b><ul class="clean tight small">${c.planNotes.map((t) => h`<li>${t}</li>`)}</ul></div>` : ''}</div>`;
}
ACT.cpAimTie = (el) => { const c = CP(), a = c.aims?.[Number(el.dataset.i)]; if (!a || !Number(el.dataset.i)) return; a.tie = !a.tie; c.result = null; c.built = null; keep(); render(); toast(a.tie ? `« ${a.label} » : même importance que l’objectif au-dessus.` : `« ${a.label} » : séparé, un rang en dessous.`); };
ACT.cpEqual = (el) => { const c = CP(); c.equal = el.dataset.id === 'equal'; c.result = null; c.built = null; keep(); render(); toast(c.equal ? 'Sans hiérarchie : même temps pour chaque objectif.' : 'Objectifs classés : le n°1 reçoit le plus de temps.'); };
CHG.cpAimWhen = (el) => {
  const c = CP(), a = c.aims?.[Number(el.dataset.i)]; if (!a || !MOMENTS[el.value]) return;
  const touched = c.partsTouched; a.when = el.value;
  if (touched) { c.result = null; c.built = null; c.generated = false; keep(); render(); toast('Moment enregistré. Tes phases et leurs verrous sont conservés ; ajuste leur ordre si nécessaire.', 4500); return; }
  c.parts = proposedPhases(); c.partsFor = partsKey(); c.partsTouched = false; c.hist = []; c.changes = []; c.ignored = []; c.result = null; c.built = null; c.generated = false;
  keep(); render(); toast(touched ? 'Structure recalculée selon les moments (tes réglages de phases ont été remplacés).' : 'Structure recalculée : regarde « Comment la séance s’adapte ».', 3500);
};
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
ACT.cpKeepTotal = () => { const c = CP(); c.minutes = budget(c.parts, c.minutes, transitions(c.parts, ctx().envs, baseEnv(c))).needed || phTotal(c.parts); keep(); render(); };
ACT.cpFit = () => { const c = CP(), r = fitDurations(c.parts, c.minutes); if (!r.ok) return toast(r.error, 4500); c.parts = r.phases; c.partsTouched = true; keep(); render(); };
/* ═════════ Étape 5 : propositions classées et expliquées, phase par phase ═════════ */
function vContent() {
  const c = CP(); if (!c.result) buildNow();
  const quick = c.quick && c.result ? h`<div class="card flat row wrapf"><span class="grow small">⚡ Voici ta séance. Change une partie si tu veux, ou :</span><button class="btn pri sm" data-act="cpQuickGo">✅ C’est bon, générer</button></div>` : '';
  return c.result ? h`${quick}${vResult()}` : h`<div class="card"><p class="small warn-t">Impossible de préparer les propositions. Reviens à l’étape d’avant.</p></div>`;
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
    <div class="row wrapf"><button class="btn sm" data-act="cpEditAi">✍️ Modifier avec l’IA</button></div>${memoryCard()}
    ${(c.hist || []).length ? h`<button class="btn sm" data-act="cpUndo">↶ Revenir à la structure précédente</button>` : ''}
    ${(c.changes || []).length ? h`<div class="card flat ok-b"><b class="small">✓ Déjà appliqué</b><ul class="clean tight small">${c.changes.map((t) => h`<li>${t}</li>`)}</ul></div>` : ''}
    ${list.length ? list.map((x) => h`<div class="card sugg"><b>${x.title}</b>${x.problem ? h`<p class="tiny muted">Problème : ${x.problem}</p>` : ''}<p class="small">${x.text}</p>
        ${x.benefit ? h`<p class="tiny"><span class="ok-t">＋ ${x.benefit}</span>${x.compromise ? h` · <span class="warn-t">− ${x.compromise}</span>` : ''}</p>` : ''}<details class="how mini"><summary>Pourquoi ?</summary>${whyList(x.why)}</details>
        ${x.blocked ? h`<p class="tiny warn-t">🔒 ${x.blocked}</p>` : ''}${ignoredCount(decisionsNow(), x.id) >= 2 ? h`<p class="tiny muted">Tu l’as déjà ignorée ${ignoredCount(decisionsNow(), x.id)} fois.</p>` : ''}
        <div class="row wrapf">${x.patch ? h`<button class="btn sm pri" data-act="cpSugApply" data-id="${x.id}" ${x.blocked ? 'disabled' : ''}>Appliquer</button>` : ''}<button class="btn sm" data-act="cpSugEdit" data-id="${x.id}">Modifier</button><button class="btn sm ghost" data-act="cpSugIgnore" data-id="${x.id}">Ignorer</button></div></div>`)
      : h`<div class="card"><p class="small">👍 Rien à signaler : ta séance est cohérente avec ce que tu as choisi.</p></div>`}
    ${whatIfCard()}
    ${(c.ignored || []).length ? h`<button class="btn sm ghost" data-act="cpSugReset">Revoir les ${c.ignored.length} suggestion(s) ignorée(s)</button>` : ''}`;
}
const pushHist = () => { const c = CP(); c.hist = [...(c.hist || []), JSON.stringify({ parts: c.parts, built: c.built, changes: c.changes || [] })].slice(-15); };
ACT.cpSugApply = (el) => {
  const c = CP(), x = suggestionsNow().find((y) => y.id === el.dataset.id); if (!x) return;
  const r = applySuggestion(c.built, x); if (!r.applied) return toast(x.blocked || 'Suggestion impossible à appliquer.', 4000);
  pushHist(); const picks = Object.fromEntries(c.built.map((p) => [p.id, p.pick]));
  c.built = r.phases.map((p) => ({ ...p, pick: picks[p.id] })); c.parts = c.built.map(({ pick, ...p }) => p); c.partsTouched = true;
  c.changes = [...(c.changes || []), x.title]; remember('suggestion', x.title, { ref: x.id, reason: x.benefit || '' }); c.generated = false; rebuild(); keep(); render(); toast('Appliqué. « ↶ Revenir » annule.');
};
ACT.cpSugIgnore = (el) => { const c = CP(), x = suggestionsNow().find((y) => y.id === el.dataset.id); c.ignored = [...new Set([...(c.ignored || []), el.dataset.id])]; if (x) remember('ignored', x.title, { ref: x.id }); keep(); render(); };
ACT.cpSugReset = () => { CP().ignored = []; keep(); render(); };
ACT.cpSugEdit = (el) => {
  // Modifier : on ouvre la phase concernée dans l'éditeur de la structure.
  const c = CP(), x = suggestionsNow().find((y) => y.id === el.dataset.id), id = x?.patch?.find((o) => o.id)?.id;
  c.step = SI.structure; keep(); render(); window.scrollTo(0, 0);
  const i = c.parts.findIndex((p) => p.id === id); if (i >= 0) setTimeout(() => editPart(i), 60);
};
ACT.cpUndo = () => {
  const c = CP(), last = (c.hist || []).pop(); if (!last) return;
  const st = JSON.parse(last); c.parts = st.parts; c.built = st.built; c.changes = st.changes; c.generated = false; rebuild(); keep(); render(); toast('Structure précédente rétablie.');
};
/* ═════════ Étape 6 : structure finale (minute par minute), puis génération ═════════ */
const INT_W = { easy: 1, mod: 2, hard: 3, max: 4 };
const loadOf = (ph) => ph.reduce((t, p) => t + (p.type === 'pause' ? 0 : (Number(p.minutes) || 0) * (INT_W[p.intensity] || 2)), 0);
/** Réglages particuliers d'une phase, en une ligne (filtres, priorités, limites, contraintes, verrous). */
function phaseExtras(p) {
  const c = CP(), locks = Object.entries(p.locks || {}).filter(([, v]) => v === 'user').map(([k]) => LOCKABLE[k].toLowerCase());
  return [p.subIntents?.length && !p.aimKey ? p.subIntents.map((x) => `${labelOf(x.id)} (${x.prio})`).join(', ') : '', Object.keys(p.filters || {}).length ? filterText(effectiveFilters([c.filters || {}, p.filters]).filters).join(', ') : '',
    p.avoid?.length ? `limiter : ${p.avoid.join(', ').toLowerCase()}` : '', p.constraints || '', locks.length ? `🔒 ${locks.join(', ')}` : ''].filter(Boolean).join(' · ');
}
function vValidate() {
  const c = CP(); if (!c.built && !c.result) buildNow();
  if (c.generated && c.result) return vResult(true);
  const ph = c.built || [], sug = c.built ? suggestionsNow() : [], intent = sessIntent(), aims = (c.aim || 'goals') === 'goals' ? c.aims || [] : [];
  const tr = transitions(ph, ctx().envs, baseEnv(c)), tl = timeline(ph, tr), pls = placesNow(ph);
  // Horaires précis : vraies heures (18:00–18:20) ; sinon minutes depuis le début (0:00–0:20).
  const t0 = winOn(c) ? winState(c).windows[0]?.from : null, at = (m) => (t0 == null ? clock(m) : fromMin(t0 + m));
  const appDecides = ph.filter((p) => p.type !== 'pause' && !Array.isArray(p.pick)).map(phaseName);
  const exOf = (p) => (c.result?.exercises || []).filter((e) => e.phase === p.id && !/^Déplacement/.test(e.name));
  const row = (r) => {
    if (r.kind === 'travel') return h`<div class="trow travel"><span class="tt">${at(r.from)}–${at(r.to)}</span><span class="grow small">🚗 Trajet vers ${pls[r.i]?.name || 'l’autre lieu'} · ${r.minutes} min</span></div>`;
    const p = ph[r.i], ex = exOf(p), extra = phaseExtras(p);
    return h`<div class="trow"><span class="tt">${at(r.from)}–${at(r.to)}</span><div class="grow tbody"><b class="small">${ROLES[p.role]?.[0] || '•'} ${phaseName(p)}</b>${p.aimRank === 0 && !p.aimEqual ? h` <span class="tag acc">n°1</span>` : ''}
      <div class="tiny muted">${actLabel(p.activity)} · 📍 ${pls[r.i]?.name || '—'}${p.type === 'pause' ? '' : ` · ${INTENSITY[p.intensity]?.[1] || ''}`} · ${fmtMin(p.minutes)}${p.type === 'climb' ? ` · ${rangeText(p)}` : ''}</div>
      ${phaseObjectives(p).length ? h`<div class="tiny acc-t">Objectifs associés : ${phaseObjectiveText(p)}</div>` : ''}
      ${ex.length ? h`<div class="tiny">${ex.slice(0, 4).map((e) => e.name).join(' · ')}${ex.length > 4 ? ` · +${ex.length - 4}` : ''}</div>` : ''}
      ${extra ? h`<div class="tiny muted">${extra}</div>` : ''}
      ${!c.partsTouched && (p.why || []).length ? h`<details class="how mini"><summary>Pourquoi ici ?</summary><ul class="clean tight tiny">${p.why.map((t) => h`<li>${t}</li>`)}</ul></details>` : ''}</div></div>`;
  };
  return h`<div class="card stack"><h3 style="margin:0">📋 Ta structure finale</h3>
      <p class="small"><b>${fmtMin(tl.total || c.minutes)}</b> · ${ph.length} phase${ph.length > 1 ? 's' : ''} · ${sessionActivities(ph).map(actLabel).join(', ') || sportLabel(c.sport)}</p>
      ${aims.length ? h`<p class="small">🎯 ${aims.map((a, i) => (c.equal && aims.length > 1 ? a.label : `${tiers(aims)[i] + 1}${tiers(aims).filter((x) => x === tiers(aims)[i]).length > 1 ? '=' : ''}. ${a.label}`)).join(' · ')}${c.equal && aims.length > 1 ? ' (sans hiérarchie)' : ''}</p>` : AIM_NAME[c.aim] ? h`<p class="small">🎯 ${AIM_NAME[c.aim]}</p>` : ''}
      ${intent.text ? h`<p class="small">📝 Intention : « ${intent.text} » <span class="tiny muted">(pour cette séance seulement)</span></p>` : ''}
      <p class="small">⏱ ${budget(ph, c.minutes, tr).text}</p>${budget(ph,c.minutes,tr).over ? h`<button class="btn" data-act="cpKeepTotal">Choisir ${budget(ph,c.minutes,tr).needed} min pour cette structure</button>` : ''}
      ${organizationView(budget(ph,c.minutes,tr,{places:pls,aims}).organization)}
      <p class="small">📈 Charge estimée : <b>${loadOf(ph)}</b> <span class="tiny muted">(minutes × intensité, indicatif : ${loadOf(ph) < 150 ? 'légère' : loadOf(ph) < 350 ? 'moyenne' : 'élevée'})</span></p>
      ${Object.keys(c.filters || {}).length ? h`<p class="small">🔎 Filtres : ${filterText(globalFilterValues()).join(' · ')}</p>` : ''}
      <div class="tline">${tl.rows.map(row)}</div>
      ${(c.planDropped || []).length && !c.partsTouched ? h`<p class="tiny warn-t">Pas assez de temps pour : ${c.planDropped.join(', ')}.</p>` : ''}
      ${(c.changes || []).length ? h`<p class="small">✓ Changements appliqués : ${c.changes.join(' ; ')}</p>` : ''}
      ${sug.length ? h`<p class="small warn-t">⚠️ Points d’attention : ${sug.map((x) => x.title).join(' ; ')}</p>` : ''}
      ${appDecides.length ? h`<p class="tiny muted">🤖 Laissé à l’app : les exercices de ${appDecides.join(', ')}.</p>` : ''}
      ${unusualCard()}
      <div class="row wrapf"><button class="btn sm" data-act="cpEditAi">✍️ Modifier avec l’IA</button><button class="btn sm" data-act="cpStepTo" data-id="3">✏️ Changer la structure</button></div>
      <button class="btn pri big" data-act="cpGenerate">✅ Générer la séance</button></div>`;
}
ACT.cpGenerate = () => { if (!requireGradeTarget()) return; const c = CP(); if (c.planErrors?.length) return toast('Ajuste les horaires avant de générer la séance.', 4000); const time = budget(c.parts, c.minutes, transitions(c.parts, ctx().envs, baseEnv(c))); if (time.available && time.over > 0) { c.result = null; c.generated = false; keep(); render(); return toast('Réduis les phases ou choisis '+time.needed+' min avant de générer.', 5000); } buildNow(); c.generated = true; keep(); render(); scrollRes(); };
/** Format proposé selon le sport, le temps et le « pour quoi ». */
function proposeParts() {
  const c = CP(), M = c.minutes || 60, kind = kindOf(c.sport);
  c.planNotes = []; c.planDropped = []; c.planErrors = []; c.planFallback = false;
  // 8.29 : objectifs classés et/ou plusieurs sports → structure calculée (et expliquée) par aimplan.
  if (aimsMode(c)) {
    const x = ctx(), sports = sportsOf(c);
    const wins = winOn(c) ? winList(c) : null;
    const r = planFromAims({ aims: c.aim === 'none' ? [] : c.aims, sports, envId: baseEnv(c), places: c.places, minutes: M, forme: FORME_MAP[c.forme] || 'normal', travel: c.travel ?? 15, equal: !!c.equal,
      equip: Object.fromEntries(sports.map((sp) => [sp, availableEquipment(x, effPlace(sp, c))])), acts: x.activities,
      ...(wins ? { windows: wins, envEquip: Object.fromEntries(wins.map((w) => [w.envId, availableEquipment(x, w.envId)])) } : {}) });
    c.planNotes = r.notes; c.planDropped = r.dropped.map((a) => a.label); c.planErrors = r.errors || [];
    if (r.phases.length) return r.phases;
    if (wins && c.planErrors.length) return [];
  }
  if (isClimb(c.sport) && c.aim === 'grade') return goalParts({ kind, target: climbTarget(c), levels: levelsOf(kind), styles: c.styles, minutes: M });
  if (isClimb(c.sport) && c.aim === 'surprise') { const r = surpriseClimbParts({ kind, minutes: M, aim: c.surAim || 'any', forme: FORME_MAP[c.forme] || 'normal', envId: c.envId, seed: c.seed || 1 }, ctx()); c.reasons = r.reasons; c.aimDone = r.aim; c.surName = r.name; c.surGoal = r.goal; c.surSystem = r.system?.id || ''; return r.parts; }
  if (isClimb(c.sport)) {
    c.planFallback = true;
    const warm = Math.min(15, Math.round(M * 0.12)), cool = Math.min(10, Math.max(5, Math.round(M * 0.07))), rest = M - warm - cool, low = FORME_MAP[c.forme] === 'low';
    return [{ type: 'warmup', minutes: warm }, { type: 'climb', kind, intensity: low ? 'mod' : 'hard', minutes: Math.round(rest * 0.6), styles: [] }, { type: 'climb', kind, intensity: 'easy', minutes: rest - Math.round(rest * 0.6), styles: [], adapt: true }, { type: 'cool', minutes: cool }];
  }
  if (sportFamily(c.sport)) {
    const tm = c.tMetric || sportTargets(c.sport, ctx())[0]?.id;
    if (c.aim === 'target' && tm && Number.isFinite(c.tValue)) return targetParts({ sport: c.sport, metricId: tm, value: c.tValue, minutes: M });
    // Mouvement travaillé : celui d'un objectif coché s'il en a un, sinon le premier du sport.
    const gm = (c.goalIds || []).map((id) => ctx().goals.find((g) => g.id === id)?.metricId).find((id) => id && sportMoves(c.sport, ctx()).some((m) => m.id === id));
    c.planFallback = true; return defaultWorkParts(c.sport, M, FORME_MAP[c.forme] || 'normal', gm || '');
  }
  c.planFallback = true; return presetParts('classique', M).map((p) => (p.type === 'main' ? { ...p, activity: c.sport } : p));
}
const FORME_MAP = { exhausted: 'low', tired: 'low', ok: 'normal', fresh: 'normal', top: 'top' };
function buildOpts() {
  const c = CP(), env = envOf(), x = ctx(), ints = [...intentsFor(c.sport, extraIntents()).filter((it) => (c.intents || []).includes(it.id)).map((it) => ({ label: it.label, caps: it.caps })), ...(c.focus ? [c.focus] : [])];
  const names = (c.goalIds || []).map((id) => x.goals.find((g) => g.id === id)).filter(Boolean).map(goalLabel);
  const levels = levelsOf(kindOf(c.sport)), t = climbTarget(c);
  const tgt = c.aim === 'target' && c.tMetric && Number.isFinite(c.tValue) ? targetLabel(c.tMetric, c.tValue) : '';
  const intent = sessIntent();
  if (aimsMode(c)) {
    // Chaque phase porte son objectif (priorités, sous-objectifs) : rien de global qui tirerait toutes les phases vers le n°1.
    const l = c.aim === 'none' ? [] : c.aims || [], sps = sportsOf(c);
    const name = l.length ? l.slice(0, 2).map((a) => a.label).join(' + ') : `${sps.map((sp) => sportShort(sp, x.activities)).join(' + ')} — ${fmtMin(c.minutes || 60)}`;
    const goal = l.length ? `Objectifs, du plus au moins important : ${l.map((a, i) => `${i + 1}. ${a.label}`).join(' ; ')}.` : `Séance équilibrée : ${sps.map(sportLabel).join(', ')}.`;
    return { intent, sport: c.sport, envId: baseEnv(c), envName: env?.name || '', aims: l.map((a, i) => ({ ...a, rank: tiers(l)[i], equal: !!c.equal })), goalIds: [], intents: [], avoidZones: c.zones || [], light: FORME_MAP[c.forme] === 'low', goal, name,
      systems: isClimb(c.sport) ? { [kindOf(c.sport)]: sysOf(kindOf(c.sport)) } : undefined, emoji: isClimb(c.sport) ? '' : (x.activities[c.sport] || ACTIVITIES[c.sport])?.emoji, seed: c.seed || 1 };
  }
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
  c.built = norm.map((p, i) => ({ ...p, aimLinks: phaseObjectives(p), styles: [...(p.styles || [])], ...(prev[p.id] !== undefined ? { pick: prev[p.id] } : {}),
    ...(pls[i]?.envId && pls[i].envId !== (c.envId || ctx().defEnv?.id || '') ? { envId: pls[i].envId, envName: pls[i].name } : {}), travelBefore: tr.find((t) => t.to === i)?.travel || 0 }));
  c.bopts = buildOpts(); rebuild();
}
/** Ossature proposée, avec les verrous qui correspondent au niveau de structure choisi. */
function proposedPhases() {
  const c = CP(), lvl = c.level || 'modere', lock = { precis: { minutes: 'user' }, tres: { minutes: 'user', activity: 'user', goal: 'user', intensity: 'user' } }[lvl] || {};
  let ph = normalizePhases(proposeParts(), c.sport);
  // Proposition par défaut (sans objectif) plus longue que le temps choisi : elle est ajustée avant d'être montrée.
  const M = c.minutes || 60;
  if (c.planFallback && phTotal(ph) !== M) { const r = fitShort(ph, M); if (r.ok) { ph = normalizePhases(r.phases, c.sport); if (r.dropped.length) c.planNotes.push(`Séance courte (${fmtMin(M)}) : ${r.dropped.map(phaseName).join(', ').toLowerCase()} retiré pour tenir le temps.`); } }
  ph = ph.map((p) => ({ ...p, locks: { ...p.locks, ...lock } }));
  // « Mes moments » marqués « ajouter tout seul » : insérés quand ils conviennent (sport, matériel), adaptés et dits.
  c.roAuto = [];
  for (let k = 0; k < 12; k++) { const sg = roSugs(ph).find((x) => x.r.auto && x.ok && !insertRoutine(ph,x).blocked); if (!sg) break; ph = normalizePhases(insertRoutine(ph, sg).phases, c.sport); c.roAuto.push(sg.r.label); }
  return ph;
}
/** Matériel de tous les lieux de la séance (lieu principal + lieu de chaque autre sport). */
const roEq = (c = CP()) => { const x = ctx(), ids = [...new Set([baseEnv(c), ...Object.values(c.places || {})])]; const eq = new Set(); for (const id of ids) for (const k of availableEquipment(x, id)) eq.add(k); return eq; };
const roSugs = (parts = CP().parts) => { const c = CP(), x = ctx(), places=resolvePlaces(parts||[],x.envs,baseEnv(c)); return suggestRoutines(myRoutines(), parts || [], { sports: [...new Set([...sportsOf(c), ...sessionActivities(parts || [])])], eq: roEq(c), equipmentAt:(at)=>places[Math.min(at,places.length-1)]?.equipment, minutes: c.minutes, history: x.history, now: Date.now() }); };
/** Étape « Ta structure » : mes moments proposés au bon endroit, adaptés à cette séance (et pourquoi). */
function routinesCard() {
  const c = CP(), l = myRoutines(), sg = roSugs(), inS = (c.parts || []).filter((p) => p.type === 'routine');
  if (!l.length) return h`<div class="card flat stack"><p class="small">🧩 Tu glisses toujours les mêmes choses dans tes séances (élastiques, no foot, spray wall…) ? Ajoute-les dans « Mes moments » : ils seront proposés ici, au bon endroit.</p><button class="btn sm" data-act="cpRoManage">🧩 Mes moments</button></div>`;
  return h`<div class="card stack"><div class="row between wrapf"><h3 style="margin:0">🧩 Mes moments</h3><button class="btn sm ghost" data-act="cpRoManage">Gérer</button></div>
    ${inS.length ? h`<p class="tiny ok-t">✓ Dans la séance : ${inS.map((p) => p.goal).join(', ')}${(c.roAuto || []).length ? ' (ajoutés tout seuls, retire-les avec ✕ si besoin)' : ''}.</p>` : ''}
    ${sg.length ? h`<div class="setmenu">${sg.map((x) => h`<div class="setrow"><span class="sic">${x.r.emoji || '🧩'}</span><span class="grow"><b>${x.r.label}</b><small>${RO_WHEN[x.r.when][1]} · ${x.minutes} min · ${RO_EFFORT[x.effort].toLowerCase()}${x.ok ? ` — ${x.reasons.join(' ; ')}` : ` — manque : ${x.missing.join(', ').toLowerCase()}`}${x.advice ? ` · 🧱 ${x.advice.title.toLowerCase()}` : ''}</small></span>
        ${x.ok ? h`<button class="btn sm" data-act="cpRoAdd" data-id="${x.r.id}" aria-label="Ajouter ${x.r.label}">＋</button>` : ''}</div>`)}</div>`
      : inS.length ? '' : h`<p class="tiny muted">Aucun de tes moments ne va avec ces sports.</p>`}</div>`;
}
ACT.cpRoManage = () => { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('library', 'moments'); };
ACT.cpRoAdd = (el) => {
  const c = CP(), sg = roSugs().find((x) => x.r.id === el.dataset.id); if (!sg?.ok) return;
  const r = insertRoutine(c.parts, sg); if(r.blocked)return toast(r.blocked,4500); pushHist(); c.parts = normalizePhases(r.phases, c.sport); c.partsTouched = true; c.result = null; c.built = null; c.generated = false; keep(); render();
  toast(`« ${sg.r.label} » ajouté (${sg.minutes} min)${r.took ? `, pris sur « ${r.took.name} »` : ''}.`, 3500);
};
ACT.cpStep = (el) => {
  const c = CP(), d = Number(el.dataset.d), next = Math.max(1, Math.min(NSTEPS, c.step + d));
  if (d > 0 && next >= SI.structure && !requireGradeTarget()) return;
  if (d > 0 && c.step <= SI.why && next >= SI.structure) freshStructure();
  if (d > 0 && c.step === SI.structure) { c.result = null; c.generated = false; buildNow(); }
  if (next < NSTEPS) c.generated = false;
  c.step = next; keep(); render(); window.scrollTo(0, 0);
};
/** Ossature recalculée si les choix d'avant ont changé (jamais par-dessus une structure modifiée à la main). */
function freshStructure() {
  const c = CP();
  if (!c.partsTouched) { c.parts = proposedPhases(); c.partsFor = partsKey(); c.partsTouched = false; c.hist = []; c.changes = []; c.ignored = []; }
  c.parts = normalizePhases(c.parts, c.sport);
}
/** ⚡ Proposer ma séance : structure + exercices tout de suite, affichés à l'étape « Propositions ». */
ACT.cpQuick = () => {
  if (!requireGradeTarget()) return;
  const c = CP(); freshStructure(); c.result = null; c.generated = false; buildNow(); c.quick = true;
  c.step = SI.content; keep(); render(); window.scrollTo(0, 0);
};
ACT.cpQuickGo = () => { if (!requireGradeTarget()) return; const c = CP(); c.step = NSTEPS; keep(); window.scrollTo(0, 0); ACT.cpGenerate(); };
ACT.cpEnvPick = (el) => { const c = CP(), sp = el.dataset.sp; if (sp && sp !== c.sport) c.places = { ...(c.places || {}), [sp]: el.dataset.id }; else { c.envId = el.dataset.id; c.envPicked = true; c.sys = {}; } c.result = null; c.built = null; keep(); render(); };
ACT.cpEnvNew = () => { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('profile', 'equipment'); };
const partsKey = () => { const c = CP(); return JSON.stringify([(c.aims || []).map((a) => `${a.key}:${a.when || 'auto'}`), sportsOf(c), c.places || {}, c.travel ?? 15, c.level || 'modere', c.minutes, c.aim, c.aim === 'grade' ? climbTarget(c) : c.aim === 'target' ? [c.tMetric, c.tValue] : '', c.styles, c.aim === 'surprise' ? [c.surAim, c.seed] : '', c.forme, c.envId, !!c.equal, winOn(c) ? winList(c) : '']); };
ACT.cpRestart = () => { const help = CP().help; S.cp = null; ls.set(key(), {}); CP().help = help; keep(); render(); window.scrollTo(0, 0); };
/** Changer de sport principal : les objectifs « famille » suivent (« Force · Voie » → « Force · Bloc ») ; les autres gardent leur texte. */
function remapAims(c, from, to) {
  if (from === to || sportsOf(c).includes(from)) return;
  const x = ctx(), out = [];
  for (const a of c.aims || []) {
    if (a.sport !== from) { out.push(a); continue; }
    if (a.key.startsWith('fam:')) { const b = familyAim(a.family, to, x.activities); if (b) out.push({ ...b, when: a.when, source: a.source }); continue; }
    if (a.key.startsWith('int:')) { const it = intentsFor(to, extraIntents()).find((y) => y.id === a.intent); const b = it && intentAim(it, to, x.activities); if (b) out.push({ ...b, when: a.when }); continue; }
    out.push({ ...a, sport: to });
  }
  c.aims = out;
}
ACT.cpSport = (el) => { const c = CP(), from = c.sport; c.sport = el.dataset.id; c.more = (c.more || []).filter((sp) => sp !== c.sport); remapAims(c, from, c.sport); c.result = null; c.built = null; c.target = null; placeFor(c); if ((!isClimb(c.sport) && c.aim === 'grade') || (!sportFamily(c.sport) && c.aim === 'target')) c.aim = 'goals'; keep(); render(); };
/** Autres sports de la même séance (chacun pourra avoir son lieu) ; en retirer un retire aussi ses objectifs (dit). */
ACT.cpSport2 = (el) => {
  const c = CP(), id = el.dataset.id, on = (c.more || []).includes(id);
  c.more = on ? c.more.filter((sp) => sp !== id) : [...(c.more || []), id];
  if (on) { const gone = (c.aims || []).filter((a) => a.sport === id); c.aims = (c.aims || []).filter((a) => a.sport !== id); delete c.places?.[id]; if (gone.length) toast(`${gone.length} objectif${gone.length > 1 ? 's' : ''} de ${sportLabel(id)} retiré${gone.length > 1 ? 's' : ''}.`); }
  c.result = null; c.built = null; keep(); render();
};
CHG.cpEnvFor = (el) => { if (el.value === '__new') { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('profile', 'equipment'); return; } const c = CP(); c.places = { ...(c.places || {}), [el.dataset.sp]: el.value }; c.result = null; c.built = null; keep(); render(); };
CHG.cpTravel = (el) => { const c = CP(); c.travel = Math.max(0, Math.min(120, Math.round(Number(el.value) || 0))); c.result = null; c.built = null; keep(); render(); };
/** Aller directement à une étape (depuis un résumé) ; la structure est (re)calculée si on avance au-delà des objectifs. */
ACT.cpStepTo = (el) => { const c = CP(), n = Math.max(1, Math.min(NSTEPS, Number(el.dataset.id) || 1)); if (n >= SI.structure && !requireGradeTarget()) return; if (n >= SI.structure && c.step <= SI.why) freshStructure(); if (n > SI.structure && !c.built) buildNow(); if (n < NSTEPS) c.generated = false; c.step = n; keep(); render(); window.scrollTo(0, 0); };
ACT.cpForme = (el) => { CP().forme = el.dataset.id; CP().formeFrom = ''; keep(); render(); };
ACT.cpAim = (el) => { const c = CP(); c.aim = el.dataset.id; c.result = null; c.built = null; keep(); render(); };
ACT.cpSurAim = (el) => { CP().surAim = el.dataset.id; keep(); render(); };
const tog = (k) => (el) => { const c = CP(), id = el.dataset.id, l = c[k] || []; c[k] = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; keep(); render(); };
ACT.cpZone = tog('zones');
onChoice('cpZone', { apply: (key) => { const c = CP(); if (!(c.zones || []).includes(key)) c.zones = [...(c.zones || []), key]; keep(); render(); } });
// Aller ajouter des objectifs, puis revenir à la séance (le brouillon est gardé).
const WORK_HINT = { run: 'fractionné, seuil…', swim: 'séries, pyramide…', load: 'force, 5×5…', body: 'EMOM, pyramide…' };
function vPhases() {
  const c = CP(), sports = Object.keys(ctx().activities).filter((id) => !isClimb(id));
  return h`<div class="card stack">
    ${c.parts.map((p, i) => { const L = p.type === 'climb' && p.adapt ? adaptPart(p, priorLoad(c.parts, i), ctx().styles) : null; const st = STRUCTURES[p.kind || 'bloc']?.[p.structure];
      const pl = placesNow(c.parts)[i], stt = chainStatus(p);
      return h`<div class="cpart"><div><b>${ROLES[p.role]?.[0] || '•'} ${phaseName(p)}</b>${p.objective ? h` <span class="tag acc">🎯 objectif</span>` : ''} <span class="tag">${stt.text}</span>
        ${phaseObjectives(p).length ? h`<div class="tiny acc-t">Objectifs associés : ${phaseObjectiveText(p)}</div>` : ''}
        ${pl?.envId || (p.place?.mode && p.place.mode !== 'same') ? h`<div class="tiny muted">📍 ${pl?.name || ''}${p.place?.travelMin ? ` · 🚗 ${p.place.travelMin} min` : ''}</div>` : ''}
        ${p.subIntents?.length ? h`<div class="tiny acc-t">➜ ${p.subIntents.map((x) => `${labelOf(x.id)}${x.prio >= 3 ? ' ★' : ''}`).join(', ')}</div>` : ''}
        <div class="tiny muted">${lockIc(p, 'activity')} ${actLabel(p.activity || CP().sport)} · ${lockIc(p, 'minutes')} ${fmtMin(p.minutes)} · ${ROLES[p.role]?.[1] || ''}${p.role === 'custom' && p.roleLabel ? ` (${p.roleLabel})` : ''} · ${lockIc(p, 'intensity')} ${INTENSITY[p.intensity]?.[1] || ''}</div>
        ${p.goal ? h`<div class="tiny">🎯 ${lockIc(p, 'goal')} ${p.goal}</div>` : ''}
        ${p.priorities?.length ? h`<div class="tiny acc-t">Priorités : ${p.priorities.map((k) => CAPACITIES[k]?.label.toLowerCase() || k).join(', ')}</div>` : ''}
        ${p.avoid?.length ? h`<div class="tiny muted">Limiter : ${p.avoid.join(', ').toLowerCase()}</div>` : ''}
        ${p.type === 'work' ? h`<div class="tiny muted">${workLine(p)}</div>` : ''}
        ${p.type === 'climb' ? h`<div class="tiny muted">${rangeText(p)}${p.styles?.length ? ' · ' + p.styles.map((id) => ctx().styles[id]?.label || id).join(', ') : ''}${p.stylesOut?.length ? ' · sans ' + p.stylesOut.map((id) => ctx().styles[id]?.label || id).join(', ').toLowerCase() : ''} · ${st ? `${st.emoji} ${st.name}` : 'structure au choix'}${p.attemptsMax ? ` · ${p.attemptsMax} essais max` : ''}${p.adapt ? ' · adapté à avant' : ''}</div>` : ''}
        ${L?.notes.length ? h`<div class="tiny acc-t">↳ ${L.notes[0]}</div>` : ''}</div>
        <div class="row tight wrapf cpbtns"><label class="row tight grow"><span class="unitbox"><input type="number" min="${p.type === 'pause' ? 1 : 5}" max="300" step="5" value="${p.minutes}" data-change="cpPartMinRow" data-i="${i}" style="width:70px" aria-label="Durée de la phase" ${p.locks?.minutes === 'user' ? 'disabled' : ''}><em>min</em></span></label><button class="btn sm ic" data-act="cpUp" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button class="btn sm ic" data-act="cpDown" data-i="${i}" ${i < c.parts.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button><button class="btn sm" data-act="cpEdit" data-i="${i}">Régler</button><button class="btn sm ic danger" data-act="cpDel" data-i="${i}" aria-label="Retirer">✕</button></div></div>`; })}
    <span class="kicker">Ajouter une phase</span>
    <div class="chips">${chip(false, '🪨 Bloc', 'data-act="cpAdd" data-id="climb" data-k="bloc"')}${chip(false, '🧗 Voie', 'data-act="cpAdd" data-id="climb" data-k="voie"')}${chip(false, '⏸️ Pause', 'data-act="cpAdd" data-id="pause"')}${sports.map((id) => h`${sportFamily(id) ? chip(false, `${sportLabel(id)} : ${WORK_HINT[sportFamily(id)]}`, `data-act="cpAdd" data-id="work" data-k="${id}"`) : ''}${chip(false, `${sportLabel(id)} : exercices`, `data-act="cpAdd" data-id="main" data-k="${id}"`)}`)}${Object.entries(CLIMB_PARTS).filter(([k]) => k !== 'climb').map(([k, [e, l]]) => chip(false, `${e} ${l}`, `data-act="cpAdd" data-id="${k}"`))}</div>
    <div class="row wrapf"><button class="btn sm ghost" data-act="cpExample">↺ Structure proposée</button><button class="btn sm" data-act="cpDnaSave">💾 Enregistrer la structure</button><button class="btn sm" data-act="cpDnaOpen">📂 Mes structures</button><button class="btn sm" data-act="cpModOpen">🧩 Insérer un module</button></div>
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
function propOf(i) { const c = CP(), links = phaseObjectives(c.built[i]); return proposeForPhase(c.built[i], ctx(), { phases: c.built, index: i, eq: eqAt(i), filters: c.filters || {}, intent: aimsMode(c) ? { text: sessIntent().text } : sessIntent(), aims: c.aims || [], goals: aimsMode(c) ? selGoals().filter((g) => links.some((a) => a.goalId === g.id)) : selGoals() }); }
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
CHG.cpBMin = (el) => { const c = CP(), p = c.built?.[Number(el.dataset.i)]; if (!p) return; p.minutes = Math.max(5, Math.min(180, Number(el.value) || p.minutes)); const source = CP().parts.find((part) => part.id === p.id); if (source) source.minutes = p.minutes; CP().partsTouched = true; keep(); rebuild(); render(); };
// Changer qui choisit les exercices repart de zéro pour les choix d'exercices : « Je compose » commence vide,
// « L'app choisit » remet ses propositions (on le dit, rien n'est perdu en silence).
ACT.cpHelp = (el) => {
  const c = CP(), was = c.help || 'auto', now = el.dataset.id;
  const had = was !== now && (c.built || []).some((p) => Array.isArray(p.pick));
  if (was !== now) for (const p of c.built || []) delete p.pick;
  c.help = now; c.result = null; keep(); render();
  if (had) toast('Mode changé : les exercices choisis dans les parties repartent de zéro.', 4000);
};
ACT.cpExInfo = (el) => { const s = CP().result, e = s?.exercises.find((x) => x.id === el.dataset.id); if (e) openSheet(exerciseSheet(e, '', s)); };
ACT.cpOptInfo = (el) => { const x = byId(el.dataset.id); if (x) openSheet(exerciseSheet({ ...x, libId: x.id }, h`<button class="btn" data-act="cpOpts" data-i="${el.dataset.i}">‹ Retour aux options</button>`), { wide: true }); };
/** Résumé d'une partie « travail » : intensité, mouvement, cible. */
function workLine(p) {
  const x = ctx(), fam = sportFamily(p.activity), st = SPORT_STRUCTS[fam]?.[p.structure];
  return [INTENSITY[p.intensity]?.[1], (fam === 'load' || fam === 'body') && (p.move || sportMoves(p.activity, x)[0]) ? moveName(p.move || sportMoves(p.activity, x)[0].id, x) : '', st && p.label ? `${st.emoji} ${st.name}` : '', p.target?.value != null ? `cible ${targetLabel(p.target.metricId, p.target.value)}` : ''].filter(Boolean).join(' · ');
}
function rangeText(p) {
  const sys = phSys(p), levels = sortedLevels(sys), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null);
  if (lo == null) return 'Au ressenti (maximum non renseigné)';
  const a = levels[lo]?.label, b = levels[hi]?.label; return a ? (a === b ? a : `${a}–${b}`) + (p.from == null && p.to == null ? ' (auto)' : '') : '';
}
/** Ce qu'il faut faire à chaque série : durée ou répétitions, et la charge. */
const dose = (e) => {
  const t = (x) => (x >= 60 ? `${Math.round(x / 60)} min` : `${x} s`), u = e.unit ? ` ${e.unit}` : ' rép.';
  const d = e.mode === 'time' ? (e.secMax > e.secMin ? `${t(e.secMin)}–${t(e.secMax)}` : t(e.secMin)) : e.repsMax > e.repsMin ? `${e.repsMin}–${e.repsMax}${u}` : `${e.repsMin}${u}`;
  return [e.group?.startsWith('cp-') ? '' : d, e.load, e.rest ? `repos ${t(e.rest)}` : ''].filter(Boolean).join(' · ');
};
/** « Faite pour toi » : ce qui, dans cette séance, vient vraiment de ton profil (faits seulement, rien d'inventé). */
function forYou() {
  const c = CP(), x = ctx(), env = envOf(), lv = levelFor(c.sport, x), a = assessment(x), out = [];
  const usual = Number(S.settings.defaultMinutes) || 0;
  out.push(`⏱ ${fmtMin(c.minutes)}${usual && usual === c.minutes ? ' : ta durée habituelle' : ''}.`);
  const aims = (c.aim || 'goals') === 'goals' ? c.aims || [] : [];
  if (aims.length) out.push(`🎯 Tes objectifs, dans ton ordre : ${aims.map((a, i) => `${i + 1}. ${a.label}${a.when && a.when !== 'auto' ? ` (${MOMENTS[a.when].toLowerCase()})` : ''}`).join(' · ')}.`);
  if (sportsOf(c).length > 1) out.push(`🏅 ${sportsOf(c).length} sports : ${sportsOf(c).map(sportLabel).join(', ')}, chacun dans son lieu.`);
  const eq = [...availableEquipment(x, c.envId)], other = sportsOf(c).slice(1).map((sp) => [sp, x.envs.find((e) => e.id === placeOfSport(sp, c))]).filter(([, e]) => e && e.id !== baseEnv(c));
  out.push(`📍 ${env ? env.name : 'Sans lieu décrit'}${other.length ? ` (${sportShort(c.sport, x.activities).toLowerCase()})` : ''} : seulement des exercices faisables avec ${eq.length ? eq.map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase() : 'aucun matériel'}.`);
  for (const [sp, e] of other) out.push(`📍 ${e.name} (${sportShort(sp, x.activities).toLowerCase()}) : avec ${[...availableEquipment(x, e.id)].map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase() || 'aucun matériel'}.`);
  const zl = (z) => AVOID_ZONES.find(([k]) => k === z)?.[1]?.replace(/^\S+\s/, '').toLowerCase(), zones = (c.zones || []).filter((z) => !isMine(z)).map(zl).filter(Boolean), own = (c.zones || []).filter(isMine).map(zl).filter(Boolean);
  if (zones.length) out.push(`🛡️ À ménager : ${zones.join(', ')} — les exercices qui les chargent fort sont écartés.`);
  if (own.length) out.push(`🩹 Rappel sur chaque exercice : ${own.join(', ')} (ajouté par toi ; l’app ne sait pas quels exercices les chargent).`);
  out.push(`📊 Niveau : ${['débutant', 'intermédiaire', 'avancé'][lv.level] || 'débutant'} — ${lv.how}.`);
  if (c.forme && c.forme !== 'ok') out.push(`💡 Ta forme du jour (${FORMES.find(([k]) => k === c.forme)?.[2]?.toLowerCase() || c.forme}) est prise en compte.`);
  return h`<details class="card flat acc-b" open><summary><b class="small">✨ Faite pour toi</b></summary><ul class="clean tight small">${out.map((t) => h`<li>${t}</li>`)}</ul>
    ${a.total && a.coverage < 50 ? h`<p class="tiny muted">L’app ne connaît que ${a.known} des ${a.total} repères utiles ${a.envies.length ? 'pour tes objectifs' : 'pour toi'} : <button class="linkish acc-t" data-act="allGo" data-to="profile/bilan">quelques tests</button> rendront tes séances plus justes.</p>` : ''}</details>`;
}
function vResult(final = false) {
  const c = CP(), s = c.result, sp = c.aim === 'surprise' && c.reasons?.length && c.help !== 'free', help = c.help || 'auto';
  const exLi = (e, i) => h`<li><button class="linkish" data-act="cpExInfo" data-id="${e.id}"><b>${e.name}</b> <span class="tiny muted">ⓘ</span></button>${e.sets > 1 ? ` × ${e.sets}` : ''}${!final && e.libId && i >= 0 ? h` <button class="btn sm ghost" data-act="cpAlt" data-i="${i}" data-id="${e.libId}" aria-label="Alternatives à ${e.name}">↔ Alternatives</button>` : ''}${dose(e) ? h`<div class="tiny acc-t">${dose(e)}</div>` : ''}${e.note ? h`<div class="tiny muted">${e.note}</div>` : ''}</li>`;
  const byPart = c.built ? c.built.map((p, i) => ({ p, i, label: partLabel(p, i, c.built), title: `${ROLES[p.role]?.[0] || ''} ${phaseName(p)}`, sub: actLabel(p.activity) })) : [...new Set(s.exercises.map((e) => e.part))].map((label) => ({ p: null, i: -1, label, title: label }));
  return h`<div class="card stack" id="cpresult"><h2 style="margin:0">${s.emoji} ${s.name}</h2>
    ${final && s.exercises.length ? h`<div class="row wrapf"><button class="btn pri" data-act="cpPlay">▶ Lancer maintenant</button><span class="tiny muted">Le détail et « Enregistrer » sont plus bas.</span></div>` : ''}
    ${sp ? h`<div class="card flat acc-b"><b class="small">${AIMS[c.aimDone]?.[0] || '🎲'} Pourquoi cette surprise</b><ul class="clean tight small">${c.reasons.map((r) => h`<li>${r}</li>`)}</ul></div>` : ''}
    ${forYou()}
    ${ctx().history.find((x) => x.data?.exercises?.length && x.data?.activity === s.activity) ? comparisonView(sessionFromHistory(ctx().history.find((x) => x.data?.exercises?.length && x.data?.activity === s.activity)), s) : ''}
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
ACT.cpSurprise = () => { closeSheet(); const c = CP(); c.aim = 'surprise'; c.result = null; c.step = Math.max(SI.why, c.step || 1); keep(); go('library', 'climbplan'); };
ACT.cpNew = () => { closeSheet(); const help = CP().help; S.cp = null; ls.set(key(), {}); CP().help = help; go('library', 'climbplan'); };
ACT.cpResume = () => { closeSheet(); go('library', 'climbplan'); };
/**
 * Une seule façon de créer une séance : « Séance du jour », « Que faire aujourd'hui ? », une séance pour un objectif,
 * une commande au coach… ouvrent toutes l'assistant, déjà rempli. auto : directement à la dernière validation (étape 7) :
 * un toucher sur « Générer », ou retour aux étapes d'avant pour modifier.
 */
export function openWizard({ sport = '', minutes = 0, goalIds = [], forme = '', intents = [], focus = null, auto = true, envId = '', words = '' } = {}) {
  closeSheet();
  const help = CP().help || 'auto'; S.cp = null; ls.set(key(), {}); const c = CP(), x = ctx();
  c.help = help; c.sport = sport || c.sport || Object.keys(x.activities)[0] || 'conditioning'; placeFor(c); c.minutes = Math.max(10, Math.min(300, minutes || S.settings.defaultMinutes || 45));
  c.goalIds = goalIds.filter(Boolean); c.intents = intents; c.focus = focus?.caps ? focus : null; c.aim = 'goals'; if (forme) c.forme = forme;
  if (words) c.intentText = String(words).slice(0, 240); // envie écrite avec ses mots : l'intention de cette séance
  if (envId && x.envs.some((v) => v.id === envId)) { c.envId = envId; c.envPicked = true; } else if (envId === 'none') { c.envId = ''; c.envPicked = true; }
  // Une demande précise (objectif, intention, capacité) remplace les objectifs tirés du profil ; sinon ceux-ci suivent le sport.
  if (c.goalIds.length || intents.length || c.focus) c.aims = [];
  else c.aims = (c.aims || []).filter((a) => a.source === 'profile').map((a) => familyAim(a.family, c.sport, x.activities)).filter(Boolean).map((a) => ({ ...a, source: 'profile' }));
  syncAims(c);
  if (auto) { c.parts = proposedPhases(); c.partsFor = partsKey(); c.partsTouched = false; c.result = null; c.built = null; buildNow(); c.step = NSTEPS; c.generated = false; } else c.step = SI.base;
  keep(); go('library', 'climbplan'); window.scrollTo(0, 0);
}
ACT.cpAgain = () => { const c = CP(); c.seed = (c.seed || 1) + 1; if (isClimb(c.sport)) { c.parts = proposeParts(); c.partsFor = partsKey(); } c.result = null; buildNow(); keep(); render(); };
CHG.cpEnv = (el) => { if (el.value === '__new') { keep(); setReturn('Retour à ma séance', 'library/climbplan'); go('profile', 'equipment'); return; } CP().envId = el.value; CP().envPicked = true; CP().sys = {}; keep(); render(); };
CHG.cpSys = (el) => { CP().sys = { ...CP().sys, [el.dataset.k]: el.value }; CP().target = null; keep(); render(); };
ACT.cpTarget = (el) => { CP().target = Number(el.dataset.id); keep(); render(); };
CHG.cpTargetSel = (el) => { CP().target = el.value === '' ? null : Number(el.value); keep(); render(); };
ACT.cpStyle = (el) => { const c = CP(), id = el.dataset.id; c.styles = c.styles.includes(id) ? c.styles.filter((x) => x !== id) : [...c.styles, id]; keep(); render(); };
ACT.cpMin = (el) => { CP().minutes = Number(el.dataset.id); keep(); render(); };
CHG.cpMinIn = (el) => { CP().minutes = Math.max(10, Math.min(300, Number(el.value) || 60)); keep(); render(); };
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
ACT.cpSave = () => { const s = CP().result; if (!s) return; const n = saveSeance(s); const help = CP().help; S.cp = null; ls.set(key(), {}); CP().help = help; toast('Enregistrée dans Mes séances'); go('library', 'seance', n.id); };
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
ACT.cpLock = (el) => upd(Number(el.dataset.i), (p) => { const k = el.dataset.k, order = ['free', 'user', 'app'], cur = p.locks?.[k] || 'free'; p.locks = { ...p.locks, [k]: order[(order.indexOf(cur) + 1) % 3] }; });
ACT.cpPhRole = (el) => upd(Number(el.dataset.i), (p) => { p.role = el.dataset.id; });
ACT.cpPhAim = (el) => upd(Number(el.dataset.i), (p) => {
  if (p.locks?.goal === 'user') return;
  const links = phaseObjectives(p), key = el.dataset.id, aim = (CP().aims || []).find((a) => a.key === key);
  if (!aim) return;
  p.aimLinks = links.some((a) => a.key === key) ? links.filter((a) => a.key !== key) : normalizeAimLinks({ aimLinks: [...links, { key, contribution: ['warmup','prep'].includes(p.role) ? 'preparation' : ['cool','recup'].includes(p.role) ? 'support' : 'primary' }] }, CP().aims || []);
  const first = p.aimLinks.find((a) => a.contribution === 'primary'); p.aimKey = first?.key || ''; p.aimLabel = first?.label || ''; p.aimRank = first?.rank ?? null; p.prepFor = '';
});
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
const linkAims = (p,i) => (CP().aims || []).length && p.type !== 'pause' ? h`<span class="kicker">Objectifs auxquels ce bloc contribue</span><p class="tiny muted">Choisis plusieurs objectifs si leur travail est compatible. Tu peux associer le même objectif à plusieurs phases ; cela ne crée aucune nouvelle fiche.</p><div class="chips">${CP().aims.map((a) => chip(phaseObjectives(p).some((x) => x.key === a.key), a.label, `data-act="cpPhAim" data-i="${i}" data-id="${a.key}" ${p.locks?.goal === 'user' ? 'disabled' : ''}`))}</div>` : '';
function linkGoal(p, i) {
  return h`<div class="chips">${Object.entries(ROLES).filter(([k]) => k !== 'pause').map(([k, [e, l]]) => chip(p.role === k, `${e} ${l}`, `data-act="cpPhRole" data-i="${i}" data-id="${k}"`))}</div>
    ${p.role === 'custom' ? h`<input data-change="cpPhText" data-i="${i}" data-k="roleLabel" maxlength="40" value="${p.roleLabel || ''}" placeholder="Nom du rôle" aria-label="Nom du rôle">` : ''}
    ${fieldHead('But de cette phase', p, i, 'goal', '(pour cette séance seulement)')}<textarea data-change="cpPhText" data-i="${i}" data-k="goal" maxlength="200" rows="2" aria-label="But de la phase" placeholder="Ex. « Me préparer à la voie sans trop me fatiguer »" ${p.locks?.goal === 'user' ? 'readonly' : ''}>${p.goal || ''}</textarea>
    ${linkAims(p,i)}`;
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
  const opt = (sel) => h`<option value="" ${sel == null ? 'selected' : ''}>${max == null ? 'Au ressenti' : 'Automatique'}</option>${levels.map((l, k) => h`<option value="${k}" ${k === sel ? 'selected' : ''}>${l.label}</option>`)}`;
  const sysList = systemsFor(p.kind), styl = climbStyles().sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return h`${sysList.length > 1 ? h`<label>Système de cotation<select data-change="cpPhSys" data-i="${i}">${sysList.map((y) => h`<option value="${y.id}" ${(p.systemId || sys?.id) === y.id ? 'selected' : ''}>${y.name}</option>`)}</select></label>` : ''}
    <span class="kicker">Cotations ${p.from == null && p.to == null ? h`<span class="tiny muted">${max == null ? '(au ressenti)' : '(auto selon l’intensité et ton max)'}</span>` : ''}</span>
    ${max == null && lo == null ? h`<p class="tiny muted">Maximum non renseigné : aucune cotation automatique. Garde le ressenti ou choisis ta plage.</p>` : ''}
    <div class="grid2"><label>De<select data-change="cpPartLv" data-i="${i}" data-k="from">${opt(lo)}</select></label><label>À<select data-change="cpPartLv" data-i="${i}" data-k="to">${opt(hi)}</select></label></div>
    ${p.from != null || p.to != null ? h`<button class="btn sm ghost" data-act="cpPartAuto" data-i="${i}">↺ ${max == null ? 'Revenir au ressenti' : 'Cotations automatiques'}</button>` : ''}
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
  return h`${fieldHead('Durée', p, i, 'minutes')}<span class="unitbox"><input type="number" min="${p.type === 'pause' ? 1 : 5}" max="300" step="5" value="${p.minutes}" data-change="cpPartMin" data-i="${i}" aria-label="Durée de la phase" ${p.locks?.minutes === 'user' ? 'disabled' : ''}><em>min</em></span>
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
    ${!st.links.includes('objectif') && p.type !== 'pause' && (c.aims || []).length ? h`<section class="chainlink">${fieldHead('Objectifs associés',p,i,'goal')}${linkAims(p,i)}</section>` : ''}
    <div class="row wrapf"><button class="btn sm ghost" data-act="cpModSave" data-i="${i}">💾 Enregistrer comme module</button></div>
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
CHG.cpPartMinRow = (el) => { const p = CP().parts[Number(el.dataset.i)]; if (!p || p.locks?.minutes === 'user') return; p.minutes = Math.max(p.type === 'pause' ? 1 : 5, Math.min(300, Number(el.value) || p.minutes)); CP().result = null; CP().partsTouched = true; keep(); render(); };
CHG.cpPartMin = (el) => upd(Number(el.dataset.i), (p) => { if (p.locks?.minutes === 'user') return; p.minutes = Math.max(p.type === 'pause' ? 1 : 5, Math.min(300, Number(el.value) || p.minutes)); });
CHG.cpPartLv = (el) => upd(Number(el.dataset.i), (p) => {
  if (el.value === '') { delete p.from; delete p.to; return; }
  const sys = phSys(p), levels = sortedLevels(sys), [lo, hi] = partRange(p, levels, sys ? knownMax(ctx(), sys, p.kind) : null), chosen = Number(el.value);
  p.from ??= lo ?? chosen; p.to ??= hi ?? chosen; p[el.dataset.k] = chosen;
});
ACT.cpPartAuto = (el) => upd(Number(el.dataset.i), (p) => { delete p.from; delete p.to; });
ACT.cpPartStyle = (el) => upd(Number(el.dataset.i), (p) => { const id = el.dataset.id, s = p.styles || []; p.styles = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]; });
CHG.cpPartMove = (el) => upd(Number(el.dataset.i), (p) => { p.move = el.value; });
CHG.cpPartAdapt = (el) => upd(Number(el.dataset.i), (p) => { p.adapt = el.checked; });
export const climbPlanResult = () => S.cp?.result || null;
void raw;
/* ═════════ V2 : « Et si… ? », mémoire des décisions, ADN / modules / stratégies, séance inhabituelle, modification guidée ═════════ */
const remember = (kind, text, o = {}) => { try { const d = decision(kind, text, { ...o, context: { sport: CP().sport, goal: CP().aims?.[0]?.label || '' } }); putItem('decision', uid(), d); } catch { /* invité sans compte : pas de mémoire serveur, rien de bloquant */ } };
const decisionsNow = () => { try { return itemsOf('decision'); } catch { return []; } };
/** Carte « Et si… ? » : une phase, un changement, des conséquences décrites ; « Appliquer » seulement si tu le décides. */
function whatIfCard() {
  const c = CP(), ph = c.built || []; if (!ph.length) return '';
  const w = c.wi || {}, i = Math.min(ph.length - 1, Number(w.i) || 0), p = ph[i];
  const CH = [['m-15', '−15 min'], ['m+15', '+15 min'], ['int-', 'Moins intense'], ['int+', 'Plus intense'], ['rm', 'Retirer'], ['tech', '＋ 15 min de technique avant']];
  return h`<div class="card stack"><h3 style="margin:0">🔮 Et si… ?</h3>
    <select data-change="cpWiPhase" aria-label="Phase à simuler">${ph.map((x, k) => h`<option value="${k}" ${k === i ? 'selected' : ''}>Phase ${k + 1} : ${phaseName(x)} (${fmtMin(x.minutes)})</option>`)}</select>
    <div class="chips">${CH.map(([k, l]) => chip(w.ch === k, l, `data-act="cpWi" data-id="${k}"`))}${ctx().envs.length ? chip(w.ch === 'place', '📍 Autre lieu', 'data-act="cpWi" data-id="place"') : ''}</div>
    ${w.ch === 'place' ? h`<select data-change="cpWiEnv" aria-label="Autre lieu"><option value="">Choisir…</option>${ctx().envs.map((e) => h`<option value="${e.id}" ${w.env === e.id ? 'selected' : ''}>${e.name}</option>`)}</select>` : ''}
    ${w.res ? h`<div class="card flat">${w.res.blocked ? h`<p class="small warn-t">🔒 ${w.res.blocked}</p>` : h`<ul class="clean tight small">${w.res.changes.map((t) => h`<li>${t}</li>`)}</ul>
      <p class="tiny muted">${w.res.disclaimer}</p><button class="btn sm pri" data-act="cpWiApply">Appliquer ce changement</button>`}</div>` : h`<p class="tiny muted">Choisis une phase et un changement : l’app décrit ce que ça change, sans rien modifier.</p>`}
    ${p ? '' : ''}</div>`;
}
function wiChange() {
  const c = CP(), w = c.wi || {}, ph = c.built || [], p = ph[Number(w.i) || 0]; if (!p || !w.ch) return null;
  const up = { easy: 'mod', mod: 'hard', hard: 'max', max: 'max' }, down = { max: 'hard', hard: 'mod', mod: 'easy', easy: 'easy' };
  return { 'm-15': { type: 'minutes', id: p.id, delta: -15 }, 'm+15': { type: 'minutes', id: p.id, delta: 15 }, 'int-': { type: 'intensity', id: p.id, value: down[p.intensity] }, 'int+': { type: 'intensity', id: p.id, value: up[p.intensity] }, rm: { type: 'remove', id: p.id },
    tech: { type: 'add', at: Number(w.i) || 0, phase: { type: 'main', role: 'technique', minutes: 15, activity: p.activity } }, place: w.env ? { type: 'place', id: p.id, envId: w.env, travelMin: 15 } : null }[w.ch];
}
const wiRun = () => { const c = CP(), ch = wiChange(); c.wi.res = ch ? simulate(c.built, ch, { envs: ctx().envs, envId: c.envId || ctx().defEnv?.id || '' }) : null; if (c.wi.res?.phases) c.wi.res.phases = c.wi.res.phases.map((p) => ({ ...p })); render(); };
CHG.cpWiPhase = (el) => { const c = CP(); c.wi = { ...(c.wi || {}), i: Number(el.value), res: null }; if (c.wi.ch) wiRun(); else render(); };
ACT.cpWi = (el) => { const c = CP(); c.wi = { ...(c.wi || {}), ch: el.dataset.id, res: null }; wiRun(); };
CHG.cpWiEnv = (el) => { const c = CP(); c.wi = { ...(c.wi || {}), env: el.value }; wiRun(); };
ACT.cpWiApply = () => {
  const c = CP(), r = c.wi?.res; if (!r?.phases) return;
  pushHist(); const picks = Object.fromEntries(c.built.map((p) => [p.id, p.pick]));
  c.built = r.phases.map((p) => ({ ...p, pick: picks[p.id] })); c.parts = c.built.map(({ pick, ...p }) => p); c.partsTouched = true;
  const label = `Et si : ${r.changes[0] || 'changement'}`; c.changes = [...(c.changes || []), label]; remember('edit', label);
  c.wi = {}; c.generated = false; rebuild(); keep(); render(); toast('Appliqué. « ↶ Revenir » annule.');
};
function memoryCard() {
  const past = recall(decisionsNow(), { sport: CP().sport }).slice(0, 3); if (!past.length) return '';
  return h`<details class="how mini"><summary>🧠 Tes décisions récentes (${past.length})</summary><ul class="clean tight small">${past.map((d) => h`<li>${DECISION_KINDS[d.kind]} : ${d.text}${d.reason ? h` <span class="tiny muted">— ${d.reason}</span>` : ''}</li>`)}</ul><p class="tiny muted">Elles servent à ne pas te reproposer ce que tu as déjà écarté.</p></details>`;
}

/* ADN, modules et stratégies */
const dnaList = () => { try { return itemsOf('sdna').filter((x) => !x.deleted); } catch { return []; } };
const modList = () => { try { return itemsOf('smodule').filter((x) => !x.deleted); } catch { return []; } };
const parseJson = (t) => { try { return JSON.parse(t || '{}'); } catch { return null; } };
ACT.cpDnaSave = async () => {
  const c = CP(), owner = S.user?.id, name = await askText('Nom de cette structure', { value: c.aims?.[0]?.label || 'Ma structure', placeholder: 'Ex. « Préparation voie »', ok: 'Enregistrer', max: 60 }); if (!name || !ownsPlan(owner, c)) return;
  const d = dnaFromPhases(c.parts, name); putItem('sdna', uid(), { name: d.name, sport: c.sport, json: JSON.stringify(d), summary: d.summary }); toast(`Structure « ${d.name} » enregistrée (${d.summary}).`, 4000);
};
ACT.cpDnaOpen = () => {
  const l = dnaList();
  openSheet(h`<div class="stack"><h2 style="margin:0">📂 Mes structures (ADN)</h2><p class="tiny muted">Une structure garde la répartition du temps et les réglages des phases, pas les exercices. Elle s’adapte à ${fmtMin(CP().minutes)}.</p>
    ${l.length ? h`<div class="setmenu">${l.map((x) => h`<div class="setrow"><span class="sic">🧬</span><button class="grow rowbtn" data-act="cpDnaUse" data-id="${x.id}"><b>${x.name}</b><small>${x.summary}</small></button><button class="btn sm ghost" data-act="cpDnaDel" data-id="${x.id}" aria-label="Supprimer la structure ${x.name}">🗑</button></div>`)}</div>` : h`<p class="small muted">Aucune structure enregistrée : « 💾 Enregistrer la structure » la garde pour la réutiliser.</p>`}
    <button class="btn" data-act="closeSheet">Fermer</button></div>`);
};
ACT.cpDnaUse = (el) => {
  const c = CP(), x = dnaList().find((d) => d.id === el.dataset.id), d = parseJson(x?.json); if (!d) return toast('Structure illisible.');
  const r = phasesFromDna(d, c.minutes); if (!r.ok) return toast(r.error, 4500);
  pushHist(); c.parts = r.phases; c.partsTouched = true; c.result = null; keep(); closeSheet(); render(); toast(`Structure « ${x.name} » générée pour ${fmtMin(c.minutes)}.`);
};
ACT.cpModSave = async (el) => {
  const c = CP(), owner = S.user?.id, p = c.parts[Number(el.dataset.i)]; if (!p) return;
  const name = await askText('Nom du module', { value: `${phaseName(p)} — ${fmtMin(p.minutes)}`, placeholder: 'Ex. « Bloc technique dalle — 25 min »', ok: 'Enregistrer', max: 60 }); if (!name || !ownsPlan(owner, c)) return;
  const m = moduleFromPhases([p], name); putItem('smodule', uid(), { name: m.name, sport: c.sport, json: JSON.stringify(m), minutes: m.minutes }); toast(`Module « ${m.name} » enregistré.`);
};
ACT.cpModOpen = () => {
  const l = modList(), c = CP();
  openSheet(h`<div class="stack"><h2 style="margin:0">🧩 Insérer un module</h2>
    ${l.length ? h`<label>Position<select data-change="cpModAt">${c.parts.map((p, k) => h`<option value="${k}" ${S.cpModAt === k ? 'selected' : ''}>Avant « ${phaseName(p)} »</option>`)}<option value="${c.parts.length}" ${S.cpModAt == null || S.cpModAt === c.parts.length ? 'selected' : ''}>À la fin</option></select></label>
      <div class="setmenu">${l.map((x) => h`<div class="setrow"><span class="sic">🧩</span><button class="grow rowbtn" data-act="cpModUse" data-id="${x.id}"><b>${x.name}</b><small>${fmtMin(x.minutes)}</small></button><button class="btn sm ghost" data-act="cpModDel" data-id="${x.id}" aria-label="Supprimer le module ${x.name}">🗑</button></div>`)}</div>`
      : h`<p class="small muted">Aucun module : dans « Régler » d’une phase, « 💾 Enregistrer comme module ».</p>`}
    <button class="btn" data-act="closeSheet">Fermer</button></div>`);
};
CHG.cpModAt = (el) => { S.cpModAt = Number(el.value); };
/** Structures et modules enregistrés : supprimables un par un (la séance en cours n'est pas modifiée). */
ACT.cpDnaDel = async (el) => { const x = dnaList().find((d) => d.id === el.dataset.id); if (!x || !(await ask(`Supprimer la structure « ${x.name} » ?`, { ok: 'Supprimer', danger: true, detail: 'Ta séance en cours ne change pas.' }))) return ACT.cpDnaOpen(); delItem('sdna', x.id); toast('Structure supprimée'); ACT.cpDnaOpen(); };
ACT.cpModDel = async (el) => { const x = modList().find((d) => d.id === el.dataset.id); if (!x || !(await ask(`Supprimer le module « ${x.name} » ?`, { ok: 'Supprimer', danger: true, detail: 'Ta séance en cours ne change pas.' }))) return ACT.cpModOpen(); delItem('smodule', x.id); toast('Module supprimé'); ACT.cpModOpen(); };
ACT.cpModUse = async (el) => {
  const c = CP(), owner = S.user?.id, x = modList().find((d) => d.id === el.dataset.id), m = parseJson(x?.json); if (!m) return toast('Module illisible.');
  const r = insertModule(c.parts, m, S.cpModAt ?? c.parts.length);
  if (!(await ask(`Insérer « ${x.name} » (${fmtMin(r.minutes)}) ?`, { ok: 'Insérer', detail: r.compat.join(' ') })) || !ownsPlan(owner, c)) return;
  pushHist(); c.parts = r.phases; c.partsTouched = true; c.result = null; keep(); closeSheet(); render();
};
ACT.cpStrat = () => {
  // Chemins pour le n°1 (son sport, ses capacités) ; sans objectif, pour le sport principal.
  const c = CP(), a = (c.aims || [])[0];
  const list = strategies({ label: a?.label || sportLabel(c.sport), activity: a?.sport || c.sport, caps: a?.caps || {} });
  S.cpStrats = list;
  openSheet(h`<div class="stack"><h2 style="margin:0">🧭 Plusieurs chemins</h2><p class="tiny muted">Aucun n’est « le meilleur » : compare et choisis selon ta journée.</p>
    ${list.map((s) => h`<div class="card flat"><b>${s.title}</b><p class="small">${s.desc}</p>
      <ul class="clean tight tiny"><li>Spécificité : ${s.compare.specificity} · Fatigue : ${s.compare.fatigue}</li><li>Temps conseillé : ${s.compare.minutes}</li><li>Matériel : ${s.compare.equipment.join(', ') || 'aucun particulier'}</li><li>Capacités : ${s.compare.caps.join(', ')}</li><li>Contrainte : ${s.compare.constraints}</li></ul>
      <button class="btn sm pri" data-act="cpStratUse" data-id="${s.id}">Choisir ce chemin</button></div>`)}
    <button class="btn" data-act="closeSheet">Fermer</button></div>`, { wide: true });
};
ACT.cpStratUse = async (el) => {
  const c = CP(), owner = S.user?.id, s = (S.cpStrats || []).find((x) => x.id === el.dataset.id); if (!s) return;
  const r = phasesFromDna(s.dna, c.minutes); if (!r.ok) return toast(r.error, 4500);
  const why = (await askText('Pourquoi ce chemin ?', { detail: 'Facultatif : ça sert à tes futures recommandations.', ok: 'Continuer', cancel: 'Passer', max: 160 })) || '';
  if (!ownsPlan(owner, c)) return;
  c.parts = r.phases; c.partsTouched = true; c.partsFor = partsKey(); c.result = null; c.strategy = s.id;
  remember('strategy', `Chemin « ${s.title} »`, { reason: why, ref: s.id }); keep(); closeSheet();
  c.step = SI.structure; keep(); render(); window.scrollTo(0, 0); toast(`Chemin « ${s.title} » : structure prête à régler.`);
};

/* Séance inhabituelle (avant génération) */
function unusualCard() {
  const c = CP(), ph = c.built || []; if (!ph.length || c.unusualWhy) return c.unusualWhy ? h`<p class="tiny muted">Séance inhabituelle : ${UNUSUAL_WHY[c.unusualWhy]}.</p>` : '';
  const u = unusualPlan(ph, ctx().history || []); if (!u.unusual) return '';
  return h`<div class="card flat warn-b stack"><b class="small">📎 Cette séance est très différente de tes séances récentes</b><ul class="clean tight small">${u.notes.map((t) => h`<li>${t}</li>`)}</ul>
    <span class="tiny muted">Pourquoi ? (facultatif, aucun jugement)</span><div class="chips">${Object.entries(UNUSUAL_WHY).map(([k, l]) => chip(false, l, `data-act="cpUnusual" data-id="${k}"`))}</div></div>`;
}
ACT.cpUnusual = (el) => { const c = CP(); c.unusualWhy = el.dataset.id; remember('unusual', `Séance inhabituelle : ${UNUSUAL_WHY[el.dataset.id]}`, { reason: UNUSUAL_WHY[el.dataset.id] }); keep(); render(); };

/* Modifier avec l'IA : demande en français → plan (change / inchangé / pourquoi / conséquences / compromis) → Appliquer */
ACT.cpEditAi = () => { S.cpEdit = { text: '', plan: null }; editAiSheet(); };
function editAiSheet() {
  const e = S.cpEdit || {}, pl = e.plan;
  openSheet(h`<div class="stack"><h2 style="margin:0">✍️ Modifier avec l’IA</h2>
    <p class="tiny muted">Ex. « J’ai seulement 1 h 20 », « Garde exactement la partie performance », « Réduis uniquement la préparation », « Ajoute 15 min de technique », « Moins intense ». Les éléments 🔒 ne bougent jamais.</p>
    <textarea data-input="cpEditText" rows="3" maxlength="400" placeholder="Ce que tu veux changer…">${e.text || ''}</textarea>
    <button class="btn" data-act="cpEditPlan" ${e.busy ? 'disabled' : ''}>${e.busy ? 'Analyse…' : 'Voir ce qui changerait'}</button>
    ${e.error ? h`<p class="small warn-t" role="status">${e.error}</p><p class="tiny muted">Aucune modification n’a été préparée ni appliquée.</p>` : ''}
    ${pl ? e.evidence ? aiEvidence(e.evidence) : h`<p class="tiny muted">Lecture locale de ta demande, sans appel à l’IA.</p>` : ''}
    ${pl ? (pl.understood ? h`<div class="card flat stack">
      <b class="small">Ce qui va changer</b>${pl.changes.length ? h`<ul class="clean tight small">${pl.changes.map((t) => h`<li>${t}</li>`)}</ul>` : h`<p class="small muted">Rien.</p>`}
      ${pl.blocked.length ? h`<p class="small warn-t">🔒 ${pl.blocked.join(' ')}</p>` : ''}
      <b class="small">Ce qui reste inchangé</b><p class="small">${pl.unchanged.join(', ') || '—'}</p>
      ${pl.why.length ? h`<b class="small">Pourquoi</b><ul class="clean tight small">${pl.why.map((t) => h`<li>${t}</li>`)}</ul>` : ''}
      ${pl.consequences.length ? h`<b class="small">Conséquences</b><ul class="clean tight small">${pl.consequences.map((t) => h`<li>${t}</li>`)}</ul>` : ''}
      ${pl.tradeoffs.length ? h`<b class="small">Compromis</b><ul class="clean tight small">${pl.tradeoffs.map((t) => h`<li>${t}</li>`)}</ul>` : ''}
      ${pl.changes.length ? h`<button class="btn pri" data-act="cpEditApply">Appliquer</button>` : ''}</div>` : h`<p class="small warn-t">Je n’ai pas compris la demande. Essaie avec une durée (« 1 h 20 »), une phase (« la préparation ») ou une action (garder, réduire, ajouter, retirer).</p>`) : ''}
    <button class="btn ghost" data-act="closeSheet">Fermer</button></div>`, { wide: true });
}
INPUT.cpEditText = (el) => { S.cpEdit = { text: el.value.slice(0, 400), plan: null }; };
ACT.cpEditPlan = async () => {
  const c = CP(), token = accountToken(), edit = S.cpEdit; if (!edit || edit.busy) return;
  const current = () => accountMatches(token) && ownsPlan(token.owner, c) && S.cpEdit === edit && !!document.querySelector('[data-input=cpEditText]');
  const text = edit.text || '', base = c.built || c.parts;
  let ops = parseRequest(text, base);
  edit.plan = null; edit.evidence = null; edit.error = '';
  if (!ops.length && text.trim().length > 5 && !S.user?.guest) {
    edit.busy = true; editAiSheet();
    try {
      const r = await api('POST', '/api/ai/session-edit', { text, phases: base.map((p, i) => ({ i, name: phaseName(p), role: p.role, minutes: p.minutes, intensity: p.intensity })) });
      if (!current()) return;
      if (!aiProposalReady(r)) throw Object.assign(new Error('La proposition de modification n’est pas vérifiable. Précise ta demande.'), { status: 422 });
      ops = cleanOps(r.ops, base.length); edit.evidence = r;
    } catch (e) {
      if (!current()) return;
      edit.error = e.message || 'Assistant indisponible. Précise une durée, une phase et ce que tu veux modifier.'; edit.busy = false; editAiSheet(); return;
    }
  }
  if (!current()) return;
  edit.busy = false;
  edit.plan = planEdit(base, ops, { sport: c.sport }); edit.plan.understood = ops.length > 0; editAiSheet();
};
ACT.cpEditApply = () => {
  const c = CP(), pl = S.cpEdit?.plan; if (!pl?.changes.length) return;
  pushHist(); const picks = Object.fromEntries((c.built || []).map((p) => [p.id, p.pick]));
  c.parts = pl.phases.map(({ pick, ...p }) => p); c.built = pl.phases.map((p) => ({ ...p, pick: picks[p.id] })); c.partsTouched = true;
  c.changes = [...(c.changes || []), ...pl.changes]; remember('edit', pl.changes.join(' ; ').slice(0, 200), { reason: S.cpEdit.text });
  c.generated = false; if (c.step >= SI.content) rebuild(); keep(); closeSheet(); render(); toast('Modifications appliquées. « ↶ Revenir » annule.');
};

/* Glisser vers la gauche / la droite sur le créateur : étape suivante / précédente (comme les boutons du bas). */
let swipe = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0], el = e.target;
  swipe = e.touches.length === 1 && el.closest?.('.steps') && !el.closest('input, textarea, select, svg, canvas, .photo-wrap, .chips, .noswipe') ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!swipe) return; const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, fast = Date.now() - swipe.at < 700; swipe = null;
  if (!fast || Math.abs(dx) < 80 || Math.abs(dy) > 45 || document.querySelector('#sheet.open, #dialog.open')) return;
  document.querySelector(`.stepdock [data-act=cpStep][data-d="${dx < 0 ? 1 : -1}"]`)?.click();
}, { passive: true });
