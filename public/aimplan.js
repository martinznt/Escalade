// aimplan.js — construire une séance à partir d'OBJECTIFS CLASSÉS (n°1 = le plus important), sur un ou plusieurs
// sports, chacun dans son lieu. Chaque objectif a un moment : auto, au début, au milieu ou à la fin.
// Règles appliquées (et toutes dites dans les notes, rien en silence) :
//  · le n°1 reçoit le plus de temps (poids 4, 3, 2, 1,5 puis 1 selon le rang) ;
//  · « Auto » : le plus exigeant quand on est frais (puissance et performance, puis force, technique, endurance,
//    mobilité en dernier) ; à moment égal, le rang départage ;
//  · si le n°1 demande de la fraîcheur (performance, force, puissance) et vient après d'autres objectifs, toute la
//    séance s'organise autour de lui : échauffement plus long, phases d'avant modérées, doigts ménagés avant une
//    grimpe exigeante (phases d'avant raccourcies, temps rendu au n°1), montée progressive juste avant lui ;
//  · chaque sport se fait dans son lieu ; les trajets sont comptés dans le temps disponible ;
//  · pas assez de temps : on retire d'abord la montée séparée, puis les objectifs les moins importants (dit).
// Les cotations, charges et exercices viennent ensuite du constructeur habituel (climbplan, sportplan, générateur).
// Sans DOM, testé.
import { INTENT_FAMILIES, subIntentsFor } from './intents.js';
import { intentsFor } from './intentions.js';
import { CAPACITIES, ACTIVITIES } from './model.js';
import { sportFamily } from './sportplan.js';

export const MOMENTS = { auto: 'Auto', start: 'Au début', middle: 'Au milieu', end: 'À la fin' };
export const MOMENT_HELP = {
  auto: 'L’app choisit : le plus exigeant quand tu es frais.',
  start: 'Juste après l’échauffement, quand tu es frais.',
  middle: 'Au cœur de la séance.',
  end: 'En dernier : tout ce qui vient avant le prépare.',
};
export const RANK_WEIGHT = [4, 3, 2, 1.5, 1];
export const MAX_AIMS = 6;
/** Ordre d'affichage des familles : du plus exigeant au plus doux. */
export const FAMILY_ORDER = ['performance', 'force', 'puissance', 'endurance', 'technique', 'mobilite'];
const MIN_AIM = 10;
/** Durée minimale d'une phase selon son rôle (mêmes seuils que l'analyse de séance : en dessous, elle perd son sens). */
const MIN_ROLE = { perf: 20, force: 15, endurance: 15, puissance: 10 };
const AUTO_ORDER = { puissance: 1, performance: 1, force: 2, technique: 3, equilibre: 3, endurance: 4, mobilite: 5 };
const DEMANDING = new Set(['performance', 'force', 'puissance']);
const FAMILY_ROLE = { technique: 'technique', endurance: 'endurance', force: 'force', puissance: 'puissance', mobilite: 'mobilite', performance: 'perf', equilibre: 'main' };
const FAM_INTENSITY = { performance: 'max', force: 'hard', puissance: 'hard', endurance: 'mod', technique: 'easy', mobilite: 'easy', equilibre: 'mod' };
const CAP_FAMILY = { force: 'force', puissance: 'puissance', endurance: 'endurance', technique: 'technique', mobilite: 'mobilite', prevention: 'mobilite', gainage: 'force' };
export const FAM_TITLE = { performance: 'Performer', force: 'Force', puissance: 'Puissance', endurance: 'Endurance', technique: 'Technique', mobilite: 'Mobilité', equilibre: 'Séance équilibrée' };
const SPORT_SHORT = { climbing_route: 'Voie', climbing_boulder: 'Bloc', running: 'Course', swimming: 'Natation', strength: 'Muscu', conditioning: 'Renfo' };
const FAM_HELP = {
  performance: 'Réussir le plus dur possible aujourd’hui : essais à ta limite, longs repos.',
  force: 'Devenir plus fort : efforts courts et lourds, bien reposés.',
  puissance: 'Aller vite et exploser : mouvements dynamiques, peu de répétitions.',
  endurance: 'Tenir plus longtemps : efforts continus ou enchaînés.',
  technique: 'Mieux bouger : consignes précises, intensité facile.',
  mobilite: 'Gagner en amplitude : mobilité et étirements, sans forcer.',
};
const PERF_HELP = {
  climbing_route: 'Réussir la voie la plus dure possible : essais proches de ton max, longs repos.',
  climbing_boulder: 'Réussir les blocs les plus durs possible : essais à ta limite, longs repos.',
  running: 'Courir à l’allure de ton objectif (temps sur une distance).',
  swimming: 'Nager à l’allure de ton objectif.',
  strength: 'Monter vers ta charge maximale (ou ton objectif).',
  conditioning: 'Battre ton record de répétitions.',
};
/* Comment chaque famille se traduit, sport par sport : [intensité, structure]. */
const CLIMB_PLAN = {
  performance: { bloc: ['max', 'limit'], voie: ['max', 'max'] },
  force: { bloc: ['hard', 'limit'], voie: ['hard', 'pyramid'] },
  puissance: { bloc: ['hard', 'limit'], voie: ['hard', 'pyramid'] },
  endurance: { bloc: ['mod', 'fourx4'], voie: ['mod', 'enchain'] },
  technique: { bloc: ['easy', 'technique'], voie: ['easy', 'volume'] },
  equilibre: { bloc: ['mod', 'pyramid'], voie: ['mod', 'pyramid'] },
};
const ATTEMPT = { performance: 'perf', force: 'limit', puissance: 'limit', endurance: 'enchain', technique: 'work', equilibre: 'work' };
const FOCUS = { performance: 'perf', force: 'perf', puissance: 'perf', endurance: 'resist', technique: 'tech', equilibre: 'tech' };
const WORK_PLAN = {
  run: { performance: ['hard', 'allure'], force: ['hard', 'cotes'], puissance: ['max', 'court'], endurance: ['mod', 'seuil'], equilibre: ['easy', 'footing'] },
  swim: { performance: ['hard', 'allure'], force: ['hard', 'fractionne'], puissance: ['max', 'sprint'], endurance: ['mod', 'pyramide'], technique: ['easy', 'technique'], equilibre: ['mod', 'continu'] },
  load: { performance: ['max', 'max'], force: ['hard', 'force'], puissance: ['hard', 'cinq'], endurance: ['mod', 'hypertrophie'], technique: ['easy', 'technique'] },
  body: { performance: ['max', 'max'], force: ['hard', 'max'], puissance: ['hard', 'emom'], endurance: ['mod', 'circuit'], technique: ['easy', 'sousmax'] },
};
/** Intentions précises de course et de natation qui ont une structure dédiée. */
const INTENT_WORK = { run: { fondamentale: ['easy', 'footing'], fractionne: ['max', 'court'], seuil: ['hard', 'seuil'], cotes: ['hard', 'cotes'] }, swim: { technique: ['easy', 'technique'], respiration: ['easy', 'technique'], endurance: ['mod', 'continu'], vitesse: ['max', 'sprint'] } };
/** Intentions d'escalade qui ne sont pas de la grimpe (gainage, épaules, souplesse) ou qui ciblent un style. */
const CLIMB_TYPE = { gainage: 'core', epaules: 'prehab', souplesse: 'mobility' };
const CLIMB_STYLE = { reglettes: ['st-reglettes'], pinces: ['st-pinces'], devers: ['st-devers'], dalle: ['st-dalle'], dynamique: ['st-dynamique'] };
/** Intentions de voie qui ont une structure à elles (continuité ≠ résistance). */
const CLIMB_INTENT = { continuite: ['mod', 'volume'], resistance: ['hard', 'enchain'], repos: ['mod', 'volume'], mental: ['mod', 'pyramid'] };
/** Quand une phase doit rester modérée : structure de grimpe ou de sport qui va avec l'intensité réduite. */
const CLIMB_MOD = { bloc: { limit: 'pyramid' }, voie: { max: 'pyramid' } };
const WORK_MOD = { run: { court: 'fartlek', long: 'fartlek', cotes: 'fartlek', allure: 'seuil' }, swim: { sprint: 'pyramide', fractionne: 'pyramide' }, load: { max: 'cinq', force: 'cinq', pyramide: 'cinq' }, body: { max: 'pyramide', emom: 'pyramide' } };
const DOWN = { max: 'hard', hard: 'mod', mod: 'mod', easy: 'easy' };
const WORD_INT = { easy: 'facile', mod: 'modérée', hard: 'intense', max: 'maximale' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const minOf = (a) => MIN_ROLE[FAMILY_ROLE[a.family]] || MIN_AIM;
/** Nom court d'une phase (≤ 40 caractères, rang compris) : « Performer · Voie (n°1) ». */
const goalText = (a) => { const tail = ` (n°${a.rank + 1})`, max = 40 - tail.length; return (a.label.length > max ? a.label.slice(0, max - 1).trim() + '…' : a.label) + tail; };
const r5 = (x) => Math.round(x / 5) * 5;
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const isClimbSport = (sp) => sp === 'climbing_boulder' || sp === 'climbing_route';
export const sportShort = (sp, acts = {}) => SPORT_SHORT[sp] || String(acts?.[sp]?.label || ACTIVITIES[sp]?.label || sp || '').replace(/^.*—\s*/, '');
export const famHelp = (family, sport) => (family === 'performance' && PERF_HELP[sport]) || FAM_HELP[family] || '';
const capsOk = (caps) => Object.fromEntries(Object.entries(caps || {}).map(([c, w]) => [c, Number(w)]).filter(([c, w]) => CAPACITIES[c] && w > 0).map(([c, w]) => [c, Math.min(4, Math.round(w * 100) / 100)]));
const topCaps = (caps, n = 4) => Object.entries(caps || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);

/** Famille dominante d'un jeu de capacités (force, endurance…), d'après le modèle de capacités. '' si rien de connu. */
export function familyOfCaps(caps = {}) {
  const t = {};
  for (const [c, w] of Object.entries(caps || {})) { const f = CAP_FAMILY[CAPACITIES[c]?.family]; if (f && Number(w) > 0) t[f] = (t[f] || 0) + Number(w); }
  return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
/** Groupe de capacités dominant (force, gainage, prévention…), tel que le modèle le définit. */
const capGroup = (caps = {}) => { const t = {}; for (const [c, w] of Object.entries(caps || {})) { const g = CAPACITIES[c]?.family; if (g) t[g] = (t[g] || 0) + Number(w); } return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
/** Sous-objectifs d'une famille utiles pour ce sport (ceux qui touchent au moins une capacité du sport). */
function subsFor(sport, family) {
  const all = subIntentsFor(sport)[family] || [], rel = ACTIVITIES[sport]?.caps;
  const ok = rel ? all.filter((s) => Object.keys(s.caps).some((c) => rel[c] != null)) : all;
  return (ok.length ? ok : all).slice(0, 4);
}
function capsFor(sport, family) {
  const out = {};
  for (const s of subsFor(sport, family)) for (const [c, w] of Object.entries(s.caps)) out[c] = Math.max(out[c] || 0, w);
  return capsOk(out);
}

/* ───────── Objectifs (aims) ───────── */
/** Objectif « famille » pour un sport : « Performer · Voie », « Technique · Bloc »… */
export function familyAim(family, sport, acts) {
  if (!INTENT_FAMILIES[family] || !sport) return null;
  return { key: `fam:${family}@${sport}`, family, sport, label: `${FAM_TITLE[family]} · ${sportShort(sport, acts)}`, emoji: INTENT_FAMILIES[family].emoji, caps: capsFor(sport, family), subs: subsFor(sport, family).map((s) => s.id), source: 'catalog', when: 'auto' };
}
/** Objectif précis tiré des intentions du sport (« Continuité · Voie », « Réglettes · Bloc »…). */
export function intentAim(it, sport, acts) {
  if (!it?.id || !sport) return null;
  const caps = capsOk(it.caps);
  return { key: `int:${it.id}@${sport}`, family: familyOfCaps(caps) || 'technique', sport, label: `${str(it.label, 50)} · ${sportShort(sport, acts)}`, emoji: str(it.emoji, 4) || '📌', caps, subs: [], intent: String(it.id).slice(0, 40), source: 'catalog', when: 'auto' };
}
/** Objectif du profil. caps = [{ id, w }] (goalCaps) ; target = { metricId, value } si l'objectif est chiffré. */
export function goalAim(g, caps, sport, acts, target = null) {
  if (!g?.id || !sport) return null;
  const c = capsOk(Object.fromEntries((caps || []).map((x) => [x.id, x.w])));
  return { key: `goal:${g.id}`, family: familyOfCaps(c) || 'performance', sport, label: str(g.label || 'Mon objectif', 60), emoji: '🎯', caps: c, subs: [], goalId: String(g.id), source: 'goal', when: 'auto', ...(target?.metricId && Number.isFinite(Number(target.value)) ? { target: { metricId: String(target.metricId), value: Number(target.value) } } : {}) };
}
/** Objectif écrit avec ses mots (analysé par l'IA, ou par mots-clés si elle n'est pas disponible). */
export function textAim(r, sport, acts, family = '') {
  const caps = capsOk(r?.caps), fam = INTENT_FAMILIES[family] ? family : familyOfCaps(caps);
  if (!fam || !sport) return null;
  return { key: `txt:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, family: fam, sport, label: str(r.label, 60) || FAM_TITLE[fam], emoji: str(r.emoji, 4) || '✍️', caps: Object.keys(caps).length ? caps : capsFor(sport, fam), subs: Object.keys(caps).length ? [] : subsFor(sport, fam).map((s) => s.id), summary: str(r.summary, 160), source: r.ai ? 'ai' : 'words', when: 'auto' };
}
/** Partie « équilibrée » pour un sport choisi sans objectif (pour que chaque sport choisi soit dans la séance). */
export const balancedAim = (sport, acts) => ({ key: `eq@${sport}`, family: 'equilibre', sport, label: `${FAM_TITLE.equilibre} · ${sportShort(sport, acts)}`, emoji: ACTIVITIES[sport]?.emoji || acts?.[sport]?.emoji || '🏅', caps: capsOk(ACTIVITIES[sport]?.caps), subs: [], source: 'auto', when: 'auto' });

/** Liste d'objectifs nettoyée : clés uniques, familles connues, sport parmi ceux de la séance, moment connu. */
export function cleanAims(list, sports = []) {
  const seen = new Set(), sp0 = sports[0] || '';
  return (Array.isArray(list) ? list : []).filter((a) => a && typeof a === 'object').map((a) => ({
    ...a, key: str(a.key, 80), family: INTENT_FAMILIES[a.family] || a.family === 'equilibre' ? a.family : '', sport: sports.includes(a.sport) ? a.sport : sp0,
    label: str(a.label, 60), emoji: str(a.emoji, 4), caps: capsOk(a.caps), subs: (Array.isArray(a.subs) ? a.subs : []).map(String).filter((x) => /^[\w.-]{1,60}$/.test(x)).slice(0, 6),
    when: MOMENTS[a.when] ? a.when : 'auto',
  })).filter((a) => a.key && a.family && a.sport && !seen.has(a.key) && seen.add(a.key)).slice(0, MAX_AIMS);
}

/** Catalogue proposé pour un sport : les 6 familles (avec une phrase d'explication), puis les intentions précises. */
export function aimCatalog(sport, acts = {}, extra = []) {
  return {
    families: FAMILY_ORDER.filter((f) => INTENT_FAMILIES[f]).map((f) => ({ ...familyAim(f, sport, acts), help: famHelp(f, sport) })),
    precise: intentsFor(sport, extra).map((it) => intentAim(it, sport, acts)).filter(Boolean),
  };
}

/* ───────── Une phase par objectif ───────── */
function phaseFor(a, minutes, eq) {
  const fam = a.family, sp = a.sport, prio = [4, 3, 2][a.rank] || 1;
  const base = { minutes, role: FAMILY_ROLE[fam] || 'main', goal: goalText(a), label: `${a.emoji} ${a.label}`.trim(), aimKey: a.key, aimRank: a.rank, aimLabel: a.label,
    priorities: topCaps(a.caps, 4), subIntents: (a.subs || []).map((id) => ({ id, prio })), objective: a.rank === 0 };
  if (fam === 'mobilite') return { type: 'mobility', activity: sp, intensity: 'easy', ...base };
  if (isClimbSport(sp)) {
    const kind = sp === 'climbing_route' ? 'voie' : 'bloc';
    // Ce qui n'est pas de la grimpe (gainage, épaules, souplesse) : par l'intention choisie, ou par les capacités visées.
    const t = CLIMB_TYPE[a.intent] || { gainage: 'core', prevention: 'prehab' }[capGroup(a.caps)];
    if (t) return { type: t, activity: sp, intensity: 'mod', ...base };
    if (a.intent === 'doigts' && eq?.has?.('hangboard')) return { type: 'fingers', activity: sp, intensity: 'hard', ...base };
    const [intensity, structure] = (kind === 'voie' && CLIMB_INTENT[a.intent]) || (CLIMB_PLAN[fam] || CLIMB_PLAN.equilibre)[kind];
    return { type: 'climb', kind, activity: sp, intensity, structure, styles: [...(CLIMB_STYLE[a.intent] || [])], attemptType: ATTEMPT[fam] || 'work', focus: FOCUS[fam] || 'tech', ...base };
  }
  const sf = sportFamily(sp);
  const st = (sf === 'run' || sf === 'swim') ? INTENT_WORK[sf][a.intent] || (!a.intent ? WORK_PLAN[sf][fam] : null)
    : (sf === 'load' || sf === 'body') && ((a.source === 'catalog' && !a.intent) || a.target) ? WORK_PLAN[sf][fam] : null;
  const tgt = a.target ? { target: a.target, ...(sf === 'load' || sf === 'body' ? { move: a.target.metricId } : {}) } : {};
  if (st) return { type: 'work', activity: sp, intensity: a.target && fam === 'performance' ? 'max' : st[0], structure: a.target && (sf === 'run' || sf === 'swim') ? 'allure' : a.target ? 'max' : st[1], ...tgt, ...base };
  return { type: 'main', activity: sp, intensity: FAM_INTENSITY[fam] || 'mod', ...base };
}
/** Montée progressive juste avant le n°1, dans son sport. */
function prepFor(a, minutes) {
  const sp = a.sport, sf = sportFamily(sp), base = { minutes, role: 'prep', goal: 'Montée progressive', label: '📈 Montée progressive', prepFor: a.key, why: [`Juste avant ton n°1 (« ${a.label} ») : on monte en intensité sans se fatiguer.`] };
  if (isClimbSport(sp)) return { type: 'climb', kind: sp === 'climbing_route' ? 'voie' : 'bloc', activity: sp, intensity: 'mod', structure: 'pyramid', styles: [], attemptType: 'work', focus: 'tech', ...base };
  const st = { run: ['mod', 'fartlek'], swim: ['mod', 'pyramide'], load: ['easy', 'technique'], body: ['easy', 'sousmax'] }[sf];
  if (st) return { type: 'work', activity: sp, intensity: st[0], structure: st[1], ...(a.target && (sf === 'load' || sf === 'body') ? { move: a.target.metricId } : {}), ...base };
  return { type: 'main', activity: sp, intensity: 'easy', ...base };
}
const fingerHeavy = (a, ph) => ph.type === 'fingers' || (ph.type === 'climb' && ['hard', 'max'].includes(ph.intensity)) || ((a.caps?.force_doigts || 0) + (a.caps?.endurance_doigts || 0) >= 0.8 && ph.intensity !== 'easy');
/** Baisser une phase à « modérée » (structure ajustée pour rester cohérente). */
/** Changer l'intensité d'une phase en gardant une structure cohérente (une intensité modérée n'a pas de « blocs max »). */
function setIntensity(ph, val) {
  if (ph.intensity === val) return false;
  ph.intensity = val;
  if (val === 'mod' || val === 'easy') {
    if (ph.type === 'climb') ph.structure = CLIMB_MOD[ph.kind]?.[ph.structure] || ph.structure;
    if (ph.type === 'work') ph.structure = WORK_MOD[sportFamily(ph.activity)]?.[ph.structure] || ph.structure;
    if (ph.attemptType === 'perf' || ph.attemptType === 'limit') ph.attemptType = 'work';
  }
  return true;
}
const capMod = (ph) => ['hard', 'max'].includes(ph.intensity) && setIntensity(ph, 'mod');

/**
 * Structure à partir des objectifs classés.
 * o = { aims (classés, n°1 d'abord), sports (le 1er = principal), envId (lieu du sport principal), places: { sport: envId }
 *       ('' = même lieu que la phase d'avant), minutes, forme ('low'|'normal'|'top'), travel (min par changement de lieu),
 *       equip: { sport: Set|tableau du matériel du lieu }, acts (activités du compte, pour les noms) }
 * Retourne { phases, notes, dropped, order, envId, travel } — phases au format du constructeur (normalizePhases).
 */
export function planFromAims(o = {}) {
  const sports = [...new Set((o.sports || []).filter(Boolean))], M = clamp(Math.round(Number(o.minutes) || 60), 20, 240), notes = [], dropped = [];
  const acts = o.acts || {}, travelEach = clamp(Math.round(Number(o.travel ?? 15) || 0), 0, 120);
  const aims = cleanAims(o.aims, sports);
  for (const sp of sports) if (!aims.some((a) => a.sport === sp)) { aims.push(balancedAim(sp, acts)); if (aims.length > 1) notes.push(`« ${sportShort(sp, acts)} » sans objectif : une partie équilibrée est ajoutée pour ce sport.`); }
  if (!aims.length) return { phases: [], notes, dropped, order: [], envId: o.envId || '', travel: 0 };
  const ranked = aims.map((a, rank) => ({ ...a, rank }));
  const n1 = ranked[0], mob = (a) => a.family === 'mobilite';
  const placeOf = (sp) => (sp === sports[0] ? o.envId || '' : o.places?.[sp] || '');
  const eqOf = (sp) => { const e = o.equip?.[sp]; return e instanceof Set ? e : new Set(Array.isArray(e) ? e : []); };
  const ord = (a, b) => (AUTO_ORDER[a.family] ?? 3) - (AUTO_ORDER[b.family] ?? 3) || a.rank - b.rank;

  // 1 · L'ordre : début, auto (le plus exigeant d'abord), milieu, auto, fin, puis la mobilité « auto » en dernier.
  const by = (w) => ranked.filter((a) => (a.when || 'auto') === w).sort(ord);
  const start = by('start'), mid = by('middle'), end = by('end'), auto = by('auto');
  let autoWork = auto.filter((a) => !mob(a));
  const autoMob = auto.filter(mob);
  const order = (aw) => { const half = Math.ceil(aw.length / 2); return [...start, ...aw.slice(0, half), ...mid, ...aw.slice(half), ...end, ...autoMob]; };
  const changes = (seq) => { let cur = null, n = 0; for (const a of seq) { if (mob(a)) continue; const p = placeOf(a.sport); if (!p) continue; if (cur !== null && p !== cur) n++; cur = p; } return n; };
  // Plusieurs lieux : on regroupe les objectifs « auto » par lieu si ça évite des allers-retours.
  if (new Set(autoWork.map((a) => placeOf(a.sport)).filter(Boolean)).size > 1) {
    const firstPlace = placeOf((start.filter((a) => !mob(a)).at(-1) || autoWork[0]).sport), places = [...new Set([firstPlace, ...autoWork.map((a) => placeOf(a.sport))])];
    const grouped = places.flatMap((p) => autoWork.filter((a) => placeOf(a.sport) === p));
    if (changes(order(grouped)) < changes(order(autoWork))) { autoWork = grouped; notes.push('Objectifs « Auto » regroupés par lieu pour éviter des allers-retours.'); }
  }
  let seq = order(autoWork);
  for (const g of [start, mid, end]) if (g.length > 1) notes.push(`${g.length} objectifs « ${MOMENTS[g[0].when]} » : ${g.map((a) => `« ${a.label} »`).join(' puis ')} (le plus exigeant d’abord, puis par rang).`);

  // 2 · Le temps : échauffement, montée progressive, trajets, retour au calme, puis les objectifs selon leur rang.
  const demanding = DEMANDING.has(n1.family);
  const plan = () => {
    const pos = seq.indexOf(n1), late = demanding && pos > 0 && seq.slice(0, pos).some((a) => !mob(a));
    const W = Math.min(20, r5(clamp(M * 0.1, 8, 15)) + (demanding ? 5 : 0)), C = r5(clamp(M * 0.07, 5, 12)) || 5;
    // Montée progressive avant un n°1 exigeant : toujours s'il vient tard, sinon dès 1 h de séance.
    const prep = demanding && (late || M >= 60) ? r5(clamp(M * 0.1, 10, 15)) : 0, trav = changes(seq) * travelEach;
    return { late, W, C, prep, trav, work: M - trav - W - C - prep };
  };
  let P = plan();
  const need = () => seq.reduce((t, a) => t + minOf(a), 0);
  while (P.work < need()) {
    if (P.prep) { notes.push('Pas assez de temps pour une montée progressive séparée : elle se fait dans l’échauffement.'); P = { ...P, work: P.work + P.prep, prep: 0, noPrep: true }; continue; }
    if (seq.length > 1) {
      const last = [...seq].sort((a, b) => b.rank - a.rank)[0]; seq = seq.filter((a) => a !== last); dropped.push(last);
      notes.push(`Pas assez de temps pour « ${last.label} » (n°${last.rank + 1}) : retiré. Ajoute du temps ou garde moins d’objectifs.`);
      const keepNoPrep = P.noPrep; P = plan(); if (keepNoPrep) P = { ...P, work: P.work + P.prep, prep: 0, noPrep: true }; continue;
    }
    if (P.W > 5 || P.C > 5) { P = { ...P, work: P.work + (P.W - 5) + (P.C - 5), W: 5, C: 5 }; continue; }
    break;
  }
  const work = Math.max(MIN_AIM, P.work), weights = seq.map((a) => RANK_WEIGHT[a.rank] ?? 1), sum = weights.reduce((t, w) => t + w, 0);
  const mins = seq.map((a, k) => Math.max(minOf(a), r5((work * weights[k]) / sum)));
  // Total exact : le surplus va au n°1 ; un manque est pris d'abord aux moins importants (jamais sous leur minimum).
  let diff = work - mins.reduce((t, m) => t + m, 0);
  if (diff > 0) mins[Math.max(0, seq.indexOf(n1))] += diff;
  for (const j of seq.map((a, k) => k).sort((x, y) => seq[y].rank - seq[x].rank)) { if (diff >= 0) break; const d = Math.min(mins[j] - minOf(seq[j]), -diff); mins[j] -= d; diff += d; }

  // 3 · Les phases, puis les adaptations au n°1.
  const phs = seq.map((a, k) => ({ a, ph: { ...phaseFor(a, mins[k], eqOf(a.sport)), why: [] } }));
  const i1 = seq.indexOf(n1), lowForme = o.forme === 'low';
  for (const { a, ph } of phs) {
    ph.why.push(a === n1 ? 'Ton objectif n°1 : le plus de temps.' : `Objectif n°${a.rank + 1} : ${ph.minutes} min (${a.rank >= 2 ? 'moins important, moins de temps' : 'important'}).`);
    if (a.when === 'auto') ph.why.push(mob(a) ? 'Placé en fin de séance : la mobilité se fait mieux après l’effort.' : DEMANDING.has(a.family) ? 'Placé tôt : le plus exigeant se fait frais.' : a.family === 'endurance' ? 'Placé après le plus exigeant : l’endurance fatigue tout le reste.' : 'Placé automatiquement selon l’effort qu’il demande.');
    else ph.why.push(`Moment choisi par toi : ${MOMENTS[a.when].toLowerCase()}.`);
  }
  if (i1 >= 0 && P.late) {
    const n1ph = phs[i1].ph, fingers = isClimbSport(n1.sport) || (n1.caps?.force_doigts || 0) > 0.5;
    notes.push(`Ton n°1 « ${n1.label} » vient ${n1.when === 'end' ? 'à la fin' : 'après d’autres objectifs'} : toute la séance est organisée pour que tu y arrives frais.`);
    let given = 0;
    for (const { a, ph } of phs.slice(0, i1)) {
      if (mob(a)) continue;
      if (fingers && fingerHeavy(a, ph) && ph.minutes - minOf(a) >= 5) {
        const cut = Math.max(5, r5(ph.minutes * 0.25)), take = Math.min(cut, ph.minutes - minOf(a)); ph.minutes -= take; given += take;
        ph.why.push(`Raccourcie de ${take} min : tes doigts restent frais pour ton n°1.`);
        notes.push(`« ${a.label} » raccourcie de ${take} min (doigts ménagés) : temps rendu à ton n°1.`);
      }
      // Résistance « à la bouteille » (4×4, voies enchaînées) juste avant une grimpe à fond : remplacée par de la continuité.
      if (fingers && ph.type === 'climb' && ['fourx4', 'enchain'].includes(ph.structure)) {
        ph.structure = 'volume'; ph.why.push('4×4 ou voies enchaînées remplacés par de la continuité : les avant-bras restent frais pour ton n°1.');
        notes.push(`« ${a.label} » : continuité plutôt que résistance (4×4, enchaînements), pour ne pas arriver « bouteille » à ton n°1.`);
      }
      if (capMod(ph)) { ph.why.push(`Gardée modérée : garder de l’énergie pour « ${n1.label} ».`); notes.push(`« ${a.label} » reste modérée (et non ${WORD_INT[FAM_INTENSITY[a.family]] || 'intense'}).`); }
    }
    if (given) { n1ph.minutes += given; }
  } else if (demanding && i1 === 0) notes.push(`Ton n°1 « ${n1.label} » vient juste après l’échauffement : tu l’abordes frais.`);
  else if (i1 > 0 && n1.family === 'endurance') notes.push(`Ton n°1 « ${n1.label} » vient après d’autres objectifs : la fatigue d’avant fait partie du travail d’endurance.`);
  else if (i1 > 0 && n1.family === 'technique') notes.push(`Ton n°1 « ${n1.label} » vient après d’autres objectifs : tu travailles la qualité en étant fatigué. Pour l’apprendre frais, mets-le « Au début ».`);
  if (lowForme) { let n = 0; for (const { ph } of phs) if (setIntensity(ph, DOWN[ph.intensity] || ph.intensity)) { n++; ph.why.push('Intensité baissée d’un cran : forme du jour basse.'); } if (n) notes.push('Forme du jour basse : intensités baissées d’un cran.'); }
  // Plus d'une heure à fond perd en qualité : le reste devient du volume facile après le n°1 (modifiable ensuite).
  let extra = null;
  if (i1 >= 0 && DEMANDING.has(n1.family) && phs[i1].ph.minutes > 60) {
    const ph = phs[i1].ph, rest = ph.minutes - 60; ph.minutes = 60;
    extra = { ...phaseFor({ ...n1, family: 'endurance', intent: '', key: n1.key + ':vol', label: `Volume facile · ${sportShort(n1.sport, acts)}`, emoji: '🌿', rank: Math.max(1, seq.length) }, rest, eqOf(n1.sport)), role: 'endurance', objective: false, why: ['Après ton n°1 : du volume facile plutôt que plus d’une heure à fond.'] };
    setIntensity(extra, 'easy'); if (extra.type === 'climb') extra.structure = 'volume';
    extra.goal = `Volume facile après « ${n1.label} »`;
    notes.push(`Plus de 60 min à fond perd en qualité : les ${rest} min restantes deviennent du volume facile après ton n°1 (change-le à l’étape 3 si tu préfères).`);
  }
  if (demanding) notes.push(`Échauffement complet (${P.W} min) : ton n°1 demande d’être bien chaud.`);
  if (P.prep) notes.push(`📈 Montée progressive de ${P.prep} min juste avant ton n°1, en ${sportShort(n1.sport, acts).toLowerCase()}.`);
  if (i1 >= 0) {
    const m1 = phs[i1].ph.minutes, others = phs.filter((x, k) => k !== i1).map((x) => x.ph.minutes), top = others.length ? Math.max(...others) : 0;
    notes.unshift(m1 > top ? `n°1 « ${n1.label} » : ${m1} min, le plus de temps de la séance.` : `Séance courte : « ${n1.label} » (n°1) a autant de temps que les autres objectifs (${m1} min).`);
  }

  // 4 · Lieux : chaque phase dans le lieu de son sport ; la mobilité reste où l'on est. Trajets comptés.
  const out = [], first = seq.find((a) => !mob(a)) || seq[0], lastWork = [...seq].reverse().find((a) => !mob(a)) || seq.at(-1);
  let cur = placeOf(first.sport), moves = 0;
  out.push({ type: 'warmup', activity: first.sport, minutes: P.W, role: 'warmup', place: cur && cur !== (o.envId || '') ? { mode: 'other', envId: cur, travelMin: null } : { mode: 'same' }, why: [demanding ? `Échauffement complet${P.late ? ' et plus long' : ''} : ton n°1 demande d’être chaud.` : 'Échauffement général puis spécifique au premier sport.'] });
  // Lieu de départ inconnu ('') : on ne compte pas de trajet qu'on ne connaît pas (le créateur signale le temps manquant).
  const moveTo = (ph, want, why) => {
    if (!want || want === cur) { ph.place = { mode: 'same' }; return; }
    const known = !!cur; ph.place = { mode: 'other', envId: want, travelMin: known ? travelEach : null }; cur = want;
    if (known) { moves++; if (why) ph.why.push(why); }
  };
  phs.forEach(({ a, ph }, k) => {
    if (k === i1 && P.prep) { const pp = prepFor(n1, P.prep); moveTo(pp, placeOf(n1.sport), `Dans le lieu de ${sportShort(n1.sport, acts).toLowerCase()} : ${travelEach} min de trajet avant.`); out.push(pp); }
    moveTo(ph, mob(a) ? '' : placeOf(a.sport), `Dans le lieu de ${sportShort(a.sport, acts).toLowerCase()} : ${travelEach} min de trajet avant.`);
    out.push(ph);
    if (k === i1 && extra) { extra.place = { mode: 'same' }; out.push(extra); }
  });
  out.push({ type: 'cool', activity: lastWork.sport, minutes: P.C, role: 'cool', place: { mode: 'same' }, why: ['Retour au calme : redescendre doucement.'] });
  if (moves) notes.push(`🚗 ${moves} changement${moves > 1 ? 's' : ''} de lieu : ${moves * travelEach} min de trajet comptées dans tes ${M} min.`);
  return { phases: out, notes, dropped, order: seq.map((a) => a.key), envId: placeOf(first.sport) || o.envId || '', travel: moves * travelEach };
}

/* ───────── Chronologie de la structure finale ───────── */
export const clock = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
/** Lignes horodatées : trajets puis phases. trans = transitions(phases) ({ to, travel }). */
export function timeline(phases = [], trans = []) {
  const rows = []; let t = 0;
  phases.forEach((p, i) => {
    const tr = trans.find((x) => x.to === i)?.travel || 0;
    if (tr) { rows.push({ kind: 'travel', i, from: t, to: t + tr, minutes: tr }); t += tr; }
    const m = Number(p.minutes) || 0; rows.push({ kind: 'phase', i, from: t, to: t + m, minutes: m }); t += m;
  });
  return { rows, total: t };
}
