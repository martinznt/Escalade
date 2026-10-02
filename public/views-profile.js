// views-profile.js — Profil : comprendre mon profil, carte d'entraînement et graphe, activités et catégories,
// performances, escalade (cotations, styles, maxima, journal), objectifs complexes, matériel, préférences, profil public.
import { h, subHead, menuList, raw, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, howBox, meter, fmtDay, relDate, numberField, buzzOk, lineChart, skeleton, SOURCE_TAG, ymd } from './ui.js';
import { composePage } from './layout.js';
import { shareButton } from './content.js';
import { openAssistant } from './views-ai.js';
import { S, ACT, SUBMIT, CHG, INPUT, ctx, go, render, putItem, delItem, item, itemsOf, saveSettings, saveSeance, api, newId } from './state.js';
import { uid, normalizeEx, normalizeSession } from './shared.js';
import { capOptionGroups, CAPACITIES, CAP_FAMILIES, MUSCLES, METRICS, ACTIVITIES, SKILLS, EQUIPMENT, EQUIPMENT_GROUPS, ENV_TYPES, ENV_TEMPLATES, BUILTIN_STYLES, GYM_AREAS, metricTierText, metricsForCap } from './model.js';
import { BUILTIN_SYSTEMS, TEMPLATES as GRADE_TEMPLATES, systemFromTemplate, addLevel, moveLevel, removeLevel, renameLevel, setMapping, sortedLevels, gradeSnapshot, maximaSummary, snapshotText, REFERENCE, LEVEL_WORDS } from './grading.js';
import { understandProfile, profileCapacities, strengthsWeaknesses, capacityState, STATUS_WORD, confWord, trainingMap, graphFromCap, graphFromGoal, goalProgress, goalLabel, goalCaps, activeGoals, mastery, MASTERY_WORD, blockers, goalPaths, whatIf, whyNoProgress, perfsOf, perfText, metricTrend, testReminders, learnedPreferences, habits, muscleVolume, activityLabel } from './brain.js';
import { anatomySvg } from './anatomy.js';
import { openWizard } from './views-climbplan.js';
import { vCarnet, projectsSection, doneProjects, fingerCard, pyramidCard } from './views-climb.js';
import { recordsCards } from './views-progress.js';
import { bodyFields, bodyToggle, cleanBody, bodyAdjust } from './body.js';
import { sourcesLine } from './srcui.js';
import { GOALS, INTENT_OF } from './views-setup.js';
import { profileSummary } from './views-coach.js';
import { byId } from './library.js';
import { donePerf, nextGoals, doneGoals } from './goaldone.js';
import { allPlaces, placeStats, kindOfEnv, placesOf, KIND_LABEL } from './places.js';
import { celebrate } from './fx.js';
import { capMastery, transfers, relationMap, estimatedFormats, MASTERY } from './knowledge.js';
import { strategies } from './strategy.js';
import { assessment, conditionFacts, suggestedGoals, guidedTests, ENVIES, ZONE_WORD } from './assess.js';
import { levelFor } from './generator.js';
import { COMPOSITION, MEASURES, lastValue, evolution, indices, checkWeighIn } from './bodycomp.js';
import { painCard } from './views-forme.js';
import { PHYSIQUE, PHYSIQUE_SOURCES, physiqueGroups, physiqueMeasures, physiqueTrack, weeklySets, SETS_RANGE } from './physique.js';

const SUBS = [['bilan', 'Mon bilan physique'], ['analyse', 'Mon analyse'], ['body', 'Mon corps'], ['understand', 'Pourquoi ces conseils'], ['map', 'Mes capacités'], ['activities', 'Sports'], ['perfs', 'Mesures'], ['climbing', 'Carnet'], ['goals', 'Objectifs'], ['equipment', 'Matériel'], ['prefs', 'Préférences'], ['public', 'Partage']];
const TILES = { bilan: ['🩺', 'Mon bilan physique', 'ce que l’app sait de ta condition, tests à faire'], analyse: ['🔎', 'Mon analyse', 'capacités, tendances, pourquoi ces conseils'], body: ['🫀', 'Mon corps et mes préférences', 'âge, forme, aime / évite, zones à ménager'], understand: ['🔎', 'Pourquoi ces conseils', 'ce que l’app sait de toi'], map: ['🗺️', 'Mes capacités', 'forces et points à travailler'], activities: ['🏅', 'Mes sports', 'et catégories'], perfs: ['🏆', 'Records et mesures', 'records, tests, maxima'],
  climbing: ['🧗', 'Carnet', 'blocs, voies, pyramide'], goals: ['🎯', 'Objectifs', 'figures, projets d’escalade'], equipment: ['📍', 'Mes lieux', 'salles, falaises, matériel, ce que tu y as fait'], prefs: ['❤️', 'Préférences', 'aime / évite'], public: ['🌍', 'Partage', 'profil public'] };
/** Tuiles rangées par thème : qui je suis, ce que je fais, pourquoi l'app conseille ça. */
const GROUPS = [['Moi', ['bilan', 'body', 'activities', 'goals', 'equipment']], ['Mes résultats', ['perfs', 'climbing']], ['Comprendre mes conseils', ['analyse']], ['Partager', ['public']]];
export function vProfile() {
  const sub = SUBS.some(([k]) => k === S.sub.profile) ? S.sub.profile : 'home';
  if (sub === 'home') return vHub();
  // Préférences : avec « Mon corps » ; capacités et « pourquoi » : dans « Mon analyse ».
  if (sub === 'prefs') { setTimeout(() => go('profile', 'body'), 0); return ''; }
  if (sub === 'map' || sub === 'understand') { const [ic, title] = TILES[sub]; return h`${subHead('profSub', 'analyse', 'Mon analyse', `${ic} ${title}`)}${(sub === 'map' ? vMap : vUnderstand)()}`; }
  const views = { analyse: vAnalyseHub, body: () => h`${vBody()}<span class="kicker">❤️ Mes préférences</span>${vPrefs()}`, understand: vUnderstand, map: vMap, bilan: vBilan, activities: vActivities, perfs: vPerfs, climbing: () => vCarnet(), goals: vGoals, equipment: vEquipment, prefs: vPrefs, public: vPublic };
  const [ic, title] = TILES[sub];
  return h`${subHead('profSub', 'home', 'Profil', `${ic} ${title}`)}${views[sub]()}`;
}
/* ═════════ Accueil du profil : l'essentiel en un coup d'œil, puis des tuiles ═════════ */
/** Profil à compléter : ce qui rend les séances plus justes, chaque ligne mène à l'endroit où le faire. Disparaît une fois complet. */
function completeCard(c, acts, goals, climbing) {
  const envies = assessment(c).envies;
  const items = [
    [!acts.length, '🏅', 'Tes sports', 'profile/activities'],
    [!c.envs.length, '📍', 'Ton lieu (salle, falaise, maison…)', 'profile/equipment'],
    [c.envs.length && !c.envs.some((e) => e.equipment?.length), '🧰', 'Le matériel de ton lieu', 'profile/equipment'],
    [climbing && !c.perfs.some((p) => ['max_bloc', 'max_voie'].includes(p.metricId) && !p.unknown), '📏', 'Ton niveau max en escalade', 'profile/perfs'],
    [!goals.length && !envies.length, '🎯', 'Un objectif', 'profile/goals'],
    [!item('config', 'body')?.age && !item('config', 'body')?.weight, '🫀', 'Ton corps (âge, forme)', 'profile/body'],
  ], left = items.filter((x) => x[0]), done = items.length - left.length;
  if (!left.length) return '';
  return h`<section class="card"><div class="row between"><h3>🧩 Pour des séances plus justes</h3><span class="tiny muted">${done}/${items.length}</span></div>${meter((done / items.length) * 100)}
    <div class="setmenu">${left.map(([, ic, t, to]) => h`<button class="setrow" data-act="allGo" data-to="${to}"><span class="sic">${ic}</span><span class="grow"><b>${t}</b></span><span class="chev">›</span></button>`)}</div></section>`;
}
function vHub() {
  const c = ctx(), acts = Object.values(c.activities), st = profileCapacities(c), sw = strengthsWeaknesses(st), goals = activeGoals(c);
  const known = st.filter((x) => x.level != null).length;
  const bil = assessment(c), envies = bil.envies;
  const counts = { bilan: bil.total ? `${bil.known}/${bil.total} repères` : '', understand: known ? `${known} capacité${known > 1 ? 's' : ''}` : '', activities: acts.length || '', perfs: c.perfs.filter((p) => !p.unknown).length || '', goals: `${goals.length || 0} en cours${doneGoals(c.goals).length ? ` · 🏆 ${doneGoals(c.goals).length}` : ''}`, equipment: c.envs.length || '' };
  const climbing = acts.some((a) => a.id.startsWith('climbing'));
  const tiles = Object.entries(TILES).filter(([k]) => k !== 'climbing' || climbing);
  const pill = (x, cls) => h`<button class="chip ${cls}" data-act="capOpen" data-id="${x.capId}">${x.label}</button>`;
  // Chaque bloc se déplace, se masque ou se colore avec ✏️ « Organiser » (mise en page du Profil).
  const GID = { 'g-moi': 'Moi', 'g-res': 'Mes résultats', 'g-why': 'Comprendre mes conseils', 'g-share': 'Partager' };
  const group = (gid) => () => { const g = GROUPS.find(([title]) => title === GID[gid]), list = g ? tiles.filter(([k]) => g[1].includes(k)) : [];
    return list.length ? h`<span class="kicker">${g[0]}</span><div class="tiles">${list.map(([k, [ic, t, sub]]) => h`<button class="tile" data-act="profSub" data-id="${k}"><span class="ti">${ic}</span><b>${t}</b><small>${counts[k] ? h`<em>${counts[k]}</em> · ` : ''}${sub}</small></button>`)}</div>` : ''; };
  return h`<p class="tiny muted pagehelp">Ce que l’app sait de toi (corps, sports, lieux, objectifs, mesures) : plus il est complet, plus tes séances sont justes.</p>${composePage('profile', {
    hero: () => h`<section class="card hero phero"><div class="row"><div class="avatar">${acts[0]?.emoji || '🙂'}</div><div class="grow"><h1>${S.user.guest ? 'Mon profil' : S.user.username}</h1>
      <div class="chips">${acts.length ? acts.map((a) => h`<span class="chip static">${a.emoji} ${a.label}</span>`) : h`<button class="chip" data-act="setupStart" data-id="quiz">＋ Choisir mes sports</button>`}</div></div></div>
    <div class="stats"><span>🏋️ ${c.history.length} séance${c.history.length > 1 ? 's' : ''}</span><span>🎯 ${goals.length ? `${goals.length} objectif${goals.length > 1 ? 's' : ''}` : envies.length ? `${envies.length} envie${envies.length > 1 ? 's' : ''}` : '0 objectif'}</span><span>📏 ${c.perfs.filter((p) => !p.unknown).length} mesure(s)</span></div></section>`,
    sw: () => sw.strengths.length || sw.weaknesses.length ? h`<div class="grid2 sw2">
      <section class="card ok-b"><span class="kicker ok-t">💪 Tes points forts</span><div class="chips">${sw.strengths.length ? sw.strengths.slice(0, 3).map((x) => pill(x, 'okc')) : h`<span class="small muted">Bientôt…</span>`}</div></section>
      <section class="card warn-b"><span class="kicker warn-t">🌱 À travailler</span><div class="chips">${sw.weaknesses.length ? sw.weaknesses.slice(0, 3).map((x) => pill(x, 'warnc')) : h`<span class="small muted">Rien de flagrant</span>`}</div></section></div>`
      : known ? h`<section class="card flat row"><span class="grow small">🧩 Tes capacités connues sont au même niveau : pas de point fort ni faible marqué pour l’instant. Chaque test en plus affine l’image.</span></section>` : '',
    bilan: () => bilanCard(bil), complete: () => completeCard(c, acts, goals, climbing),
    'g-moi': group('g-moi'), 'g-res': group('g-res'), 'g-why': group('g-why'), 'g-share': group('g-share'),
  })}`;
}
ACT.profSub = (el) => { if (el.dataset.id === 'goals') S.filters.goals = 'active'; go('profile', el.dataset.id); if (el.dataset.id === 'public') loadSocial(); };
const capL = (id) => CAPACITIES[id]?.label || ctx().categories[id]?.label || id;
const statusTag = (s) => tag(STATUS_WORD[s.status], s.status === 'fort' ? 'ok' : s.status === 'faible' ? 'warn' : s.status === 'developpement' ? 'info' : '');

/* ═════════ Comprendre mon profil ═════════ */
/** Mon analyse : tout ce que l'app comprend de toi, au même endroit. */
function vAnalyseHub() {
  return menuList([['profSub', 'map', '🗺️', 'Mes capacités', 'Forces et points à travailler, muscles travaillés'], ['allGo', '', '🔍', 'Tendances et diagnostics', 'Peu travaillé, objectifs délaissés, pourquoi je stagne', 'progress/analyses'],
    ['profSub', 'understand', '🔎', 'Pourquoi ces conseils', 'Ce que l’app sait de toi, et ce qui manque'], ['allGo', '', '🧪', 'Lab', 'Tester une idée sur quelques semaines', 'progress/lab']]);
}
function vUnderstand() {
  const u = understandProfile(ctx());
  const stats = [['📏', 'Mesuré', u.measured, 'ok'], ['🗣️', 'Déclaré', u.declared, 'info'], ['🧮', 'Calculé', u.calculated, ''], ['≈', 'Estimé', u.inferred, 'warn']];
  const list = (items) => h`<ul class="clean">${items.slice(0, 12).map((x) => h`<li>${x}</li>`)}</ul>${items.length > 12 ? h`<p class="tiny muted">… et ${items.length - 12} autre(s)</p>` : ''}`;
  const todo = testReminders(ctx()).slice(0, 3);
  return h`<div class="statgrid">${stats.map(([ic, l, items, cls]) => h`<button class="stat2 ${cls}" data-act="uOpen" data-id="${l}"><b>${items.length}</b><span>${ic} ${l}</span></button>`)}</div>
    ${todo.length ? menuList([['allGo', '', '📏', `${todo.length} mesure${todo.length > 1 ? 's' : ''} à faire pour mieux te connaître`, 'Dans Records et mesures', 'profile/perfs']]) : ''}
    ${stats.map(([ic, l, items]) => h`<details class="card fold" id="u-${l}"><summary><span>${ic} ${l}</span><em>${items.length}</em></summary>${items.length ? list(items) : h`<p class="small muted">Rien pour l’instant.</p>`}</details>`)}
    ${u.missing.length ? h`<details class="card fold"><summary><span>❔ Ce qui manque</span><em>${u.missing.length}</em></summary>${list(u.missing)}</details>` : ''}
    <details class="card fold"><summary><span>💡 Comment l’app décide</span></summary><ol class="small">${u.method.map((m) => h`<li>${m}</li>`)}</ol></details>`;
}

ACT.uOpen = (el) => { const d = document.getElementById('u-' + el.dataset.id); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };

/* ═════════ Ma carte d'entraînement + graphe ═════════ */
function vMap() {
  const c = ctx(), m = trainingMap(c), sw = strengthsWeaknesses(m.capacities);
  const groups = {};
  for (const s of m.capacities) (groups[CAPACITIES[s.capId]?.family || 'autre'] ||= []).push(s);
  return h`<div class="card"><h3>Activités</h3><div class="chips">${m.activities.length ? m.activities.map((a) => h`<span class="chip static">${a.label} · ${a.sessions90} séance(s) / 90 j</span>`) : h`<span class="muted small">Aucune activité.</span>`}</div></div>
    <div class="card"><h3>Carte des capacités</h3><p class="tiny muted">Touche une capacité pour explorer ses liens : exercices, métriques, muscles et objectifs. Couleur = état estimé (${sw.text})</p>
      <div class="legend small"><span>${tag('solide', 'ok')}</span><span>${tag('en développement', 'info')}</span><span>${tag('à renforcer', 'warn')}</span><span>${tag('non renseignée')}</span></div>
      ${Object.entries(groups).map(([fam, list]) => h`<div class="capgroup"><b class="small">${CAP_FAMILIES[fam] || 'Autres'}</b><div class="capmap">${list.map((s) => h`<button class="cap ${s.status}" data-act="capOpen" data-id="${s.capId}" style="--rel:${Math.round(40 + s.relevance * 60)}%"><span>${s.label}</span><small>${STATUS_WORD[s.status]}${s.level != null ? ' · confiance ' + confWord(s.confidence) : ''}</small></button>`)}</div></div>`)}
      ${!m.capacities.length ? h`<p class="muted small">Choisis une activité ou un objectif pour faire apparaître tes capacités.</p>` : ''}</div>
    <div class="card"><h3>Muscles travaillés (30 jours)</h3>${raw(anatomySvg({ heat: muscleVolume(c, 30) }))}<p class="tiny muted center">Plus la zone est marquée, plus elle a été sollicitée (exercices réalisés + ressenti du questionnaire).</p></div>
    <div class="card"><h3>Objectifs</h3>${m.goals.length ? m.goals.map((g) => h`<button class="item pick" data-act="goalOpen" data-id="${g.goal.id}"><div class="grow"><b>${g.label}</b>${meter(g.progress.pct || 0)}<div class="tiny muted">${g.progress.text}</div></div></button>`) : h`<p class="muted small">Aucun objectif actif.</p>`}</div>
    <details class="card fold"><summary><span>🔁 Habitudes</span><em>${m.habits.length}</em></summary>${m.habits.length ? h`<ul class="clean">${m.habits.map((x) => h`<li>${x.text}</li>`)}</ul>` : h`<p class="muted small">Pas encore assez de séances.</p>`}</details>
    <details class="card fold"><summary><span>🧰 Matériel</span><em>${m.equipment.length}</em></summary><div class="chips">${m.envs.map((e) => h`<span class="chip static">📍 ${e}</span>`)}${m.equipment.map((e) => h`<span class="chip static">${e}</span>`)}</div></details>
    <details class="card fold"><summary><span>🏆 Progression récente</span><em>${m.progression.length}</em></summary>${m.progression.length ? h`<ul class="clean">${m.progression.map((r) => h`<li><b>${r.label}</b> · ${r.text} <span class="muted">(${fmtDay(r.date)})</span></li>`)}</ul>` : h`<p class="muted small">Aucun record encore.</p>`}</details>`;
}
ACT.capOpen = (el) => {
  const c = ctx(), g = graphFromCap(el.dataset.id, c), st = capacityState(el.dataset.id, c);
  openSheet(h`<h2 style="margin:0">${g.label}</h2><p class="muted small">${g.desc}</p><p>${statusTag(st)} ${st.level != null ? h`<span class="small">niveau ≈ ${Math.round(st.level * 10) / 10} / 2 · confiance ${confWord(st.confidence)}</span>` : ''}</p>
    ${howBox({ facts: st.evidences.map((e) => `[${e.type}] ${e.text}`).concat(st.vol30 ? [`Volume sur 30 jours : ${st.vol30} séries pondérées (pratique, pas un niveau).`] : []), inferences: st.level != null ? [`Niveau estimé en combinant ${st.evidences.filter((e) => e.level != null).length} source(s) pondérée(s).`] : [], missing: st.missing }, { open: true })}
    ${st.trend ? h`<p class="small">${st.trend.dir > 0 ? '📈' : st.trend.dir < 0 ? '📉' : '➖'} ${st.trend.text}</p>` : ''}
    ${(() => { const m = capMastery(g.capId, c); return h`<b class="small">Maîtrise</b><div class="chips">${MASTERY.map((l, k) => h`<span class="chip static ${m.step === k ? 'on' : ''}">${l}</span>`)}</div><p class="tiny muted">${m.step == null ? m.missing[0] : m.basis.join(' ')}</p>`; })()}
    ${(() => { const t = transfers(g.capId); return t.length ? h`<details class="how mini"><summary>↔ Aussi utile pour (${t.length})</summary><ul class="clean tight small">${t.map((x) => h`<li>${x.label} · relation ${x.confidence}<div class="tiny muted">${x.why}</div></li>`)}</ul></details>` : ''; })()}
    <b class="small">→ Exercices</b><div class="chips">${g.exercises.map((x) => chip(false, `${x.name} (${x.w})`, `data-act="libInfo" data-id="${x.id}"`))}</div>
    <b class="small">↔ Se mesure avec</b><div class="chips">${g.metrics.map((x) => chip(false, x.label, `data-act="perfAdd" data-id="${x.id}"`))}</div>
    <b class="small">Muscles</b><p class="small">${g.muscles.map((x) => x.label).join(', ') || '—'}</p>
    <b class="small">→ Objectifs</b><div class="chips">${g.goals.length ? g.goals.map((x) => chip(false, x.label, x.skill ? `data-act="goalNewSkill" data-id="${x.id}"` : `data-act="goalOpen" data-id="${x.id}"`)) : h`<span class="muted small">—</span>`}</div>
    <b class="small">Mon niveau déclaré</b><div class="chips">${[[-1, 'Je ne sais pas'], [0, 'Débutant'], [1, 'Intermédiaire'], [2, 'Avancé']].map(([v, l]) => chip(c.capdecl[g.capId]?.level === v, l, `data-act="capDecl" data-id="${g.capId}" data-v="${v}"`))}</div>
    <div class="row wrapf"><button class="btn pri" data-act="capTrain" data-id="${g.capId}">🎯 Séance ciblée</button><button class="btn" data-act="closeSheet">Fermer</button></div>`, { wide: true });
};
ACT.capDecl = (el) => { putItem('capdecl', 'cd-' + el.dataset.id, { capId: el.dataset.id, level: Number(el.dataset.v) }); toast(Number(el.dataset.v) === -1 ? 'Noté : « je ne sais pas ». Un test pourra aider.' : 'Niveau déclaré enregistré'); ACT.capOpen(el); render(); };
ACT.capTrain = (el) => { closeSheet(); openWizard({ focus: { label: CAPACITIES[el.dataset.id]?.label || el.dataset.id, caps: { [el.dataset.id]: 3 } } }); };

/* ═════════ Activités et catégories ═════════ */
function vActivities() {
  const c = ctx(), acts = itemsOf('activity');
  const natives = Object.entries(ACTIVITIES);
  return h`<div class="card"><h3>Activités natives</h3><div class="chips">${natives.map(([id, a]) => chip(!!c.activities[id], `${a.emoji} ${a.label}`, `data-act="obAct" data-id="${id}"`))}</div></div>
    <div class="card"><div class="row between"><h3>Mes activités personnalisées</h3><button class="btn sm pri" data-act="actNew">＋ Activité</button></div>
      ${acts.filter((a) => !a.preset && !a.archived).map((a) => h`<div class="item"><div class="ico">${a.emoji || '🏅'}</div><div class="grow"><b>${a.label}</b><div class="tiny muted">${itemsOf('category').filter((x) => x.activityId === a.id && !x.archived).map((x) => x.label).join(', ') || 'aucune catégorie'}</div></div><button class="btn sm" data-act="actEdit" data-id="${a.id}">✎</button></div>`)}
      ${!acts.some((a) => !a.preset && !a.archived) ? h`<p class="muted small">Basketball, cyclisme, tennis, ski… : crée ton activité avec ses propres catégories, métriques et exercices.</p>` : ''}</div>
    ${Object.values(c.activities).map((a) => vActivityCard(a))}
    ${Object.keys(c.activities).some((a) => a.startsWith('climbing')) ? h`<span class="kicker">🧗 Escalade : cotations et styles</span>${climbSystemsStyles()}` : h`<details class="card how"><summary><b>🧗 Escalade : cotations et styles</b></summary>${climbSystemsStyles()}</details>`}
    <div class="card"><div class="row between"><h3>Mes métriques personnalisées</h3><button class="btn sm" data-act="metricNew">＋ Métrique</button></div>${itemsOf('metric').filter((m) => !m.archived).map((m) => h`<div class="item"><div class="grow"><b>${m.label}</b><div class="tiny muted">${m.unit || 'sans unité'} · ${m.activityId ? activityLabel(m.activityId, c) : 'toutes activités'} · ${(m.caps || []).map((x) => capL(x.id)).join(', ') || 'aucune capacité liée'}</div></div><button class="btn sm" data-act="metricEdit" data-id="${m.id}">✎</button></div>`)}</div>`;
}
function vActivityCard(a) {
  const c = ctx(), native = ACTIVITIES[a.id];
  const cats = [...(native?.categories || []).map(([id, label, caps]) => ({ id: 'native:' + id, label, caps: caps.map((x) => ({ id: x, w: 1 })), native: true })), ...Object.values(c.categories).filter((x) => x.activityId === a.id)];
  const st = profileCapacities(c, a.id), sw = strengthsWeaknesses(st);
  return h`<div class="card flat"><div class="row between wrapf"><b>${a.emoji} ${a.label}</b><div class="row tight wrapf"><button class="btn sm" data-act="aiCap" data-id="${a.id}">🤖 Avec l’assistant</button><button class="btn sm" data-act="catNew" data-id="${a.id}">＋ Catégorie</button></div></div>
    <div class="chips">${cats.map((x) => x.native ? h`<span class="chip static" title="${x.caps.map((k) => capL(k.id)).join(', ')}">${x.label}</span>` : chip(false, `${x.emoji ? x.emoji + ' ' : ''}${x.label} ✎`, `data-act="catEdit" data-id="${x.id}"`))}</div>
    ${sw.strengths.length || sw.weaknesses.length ? h`<div class="chips">${sw.strengths.slice(0, 3).map((s) => h`<button class="chip okc" data-act="capOpen" data-id="${s.capId}">💪 ${s.label}</button>`)}${sw.weaknesses.slice(0, 3).map((s) => h`<button class="chip warnc" data-act="capOpen" data-id="${s.capId}">🌱 ${s.label}</button>`)}</div>` : ''}</div>`;
}
ACT.actNew = (el) => openSheet(h`<h2 style="margin:0">Nouvelle activité</h2><form data-submit="actSave" class="stack"><input type="hidden" name="id" value=""><div class="row"><input name="emoji" value="🏅" maxlength="4" class="emoji-in" aria-label="Emoji"><input name="label" required maxlength="60" value="${el?.dataset?.q || ''}" placeholder="Ex. Basketball, cyclisme, tennis…" aria-label="Nom"></div><label>Mots-clés (séparés par des virgules)<input name="aliases" maxlength="180"></label><button class="btn pri" type="submit">Créer</button></form>`);
ACT.actEdit = (el) => { const a = item('activity', el.dataset.id); if (!a) return; openSheet(h`<h2 style="margin:0">Modifier l’activité</h2><form data-submit="actSave" class="stack"><input type="hidden" name="id" value="${a.id}"><div class="row"><input name="emoji" value="${a.emoji || '🏅'}" maxlength="4" class="emoji-in" aria-label="Emoji"><input name="label" required maxlength="60" value="${a.label}" aria-label="Nom"></div><label>Mots-clés<input name="aliases" maxlength="180" value="${(a.aliases || []).join(', ')}"></label><div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn danger" type="button" data-act="actArchive" data-id="${a.id}">Archiver</button></div></form>`); };
SUBMIT.actSave = (f) => { const d = Object.fromEntries(new FormData(f)); const id = d.id || 'custom-' + uid().slice(0, 12); putItem('activity', id, { label: d.label, emoji: d.emoji, aliases: String(d.aliases || '').split(',').map((x) => x.trim()).filter(Boolean), preset: '', archived: false }); closeSheet(); buzzOk(); toast('Activité enregistrée'); render(); };
ACT.actArchive = async (el) => { const a = item('activity', el.dataset.id); if (a && (await ask(`Archiver « ${a.label} » ?`, { detail: 'L’historique et les performances liées sont conservés.' }))) { putItem('activity', a.id, { ...a, archived: true }); closeSheet(); render(); } };
function catForm(cat, activityId) {
  const caps = new Set((cat?.caps || []).map((x) => x.id));
  return h`<h2 style="margin:0">${cat ? `${cat.emoji || ''} ${cat.label}` : 'Nouvelle catégorie'}</h2>
    ${cat?.guide || cat?.howTo?.length ? h`<div class="card flat">${cat.source === 'ia' ? h`<span class="tag acc">🤖 fiche créée avec l’assistant</span>` : ''}${cat.guide ? h`<p class="small">${cat.guide}</p>` : ''}${cat.howTo?.length ? h`<b class="small">Comment la travailler</b><ul class="small">${cat.howTo.map((x) => h`<li>${x}</li>`)}</ul>` : ''}</div>` : ''}
    <form data-submit="catSave" class="stack"><input type="hidden" name="id" value="${cat?.id || ''}"><input type="hidden" name="activityId" value="${activityId}">
    <label>Nom<input name="label" required maxlength="60" value="${cat?.label || ''}" placeholder="Ex. Service, appuis, montée…"></label><label>Description<input name="description" maxlength="180" value="${cat?.description || ''}"></label>
    <label>Capacités liées (facultatif)</label><div class="chips">${Object.entries(CAPACITIES).map(([id, x]) => h`<label class="chip ${caps.has(id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="caps" value="${id}" ${caps.has(id) ? 'checked' : ''} data-change="chipToggle">${x.label}</label>`)}</div>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${cat ? h`<button class="btn danger" type="button" data-act="catDel" data-id="${cat.id}">Supprimer</button>` : ''}</div></form>`;
}
ACT.aiCap = (el) => { S.ai = { activityId: el.dataset.id }; openAssistant('capacity'); };
ACT.catNew = (el) => openSheet(catForm(null, el.dataset.id), { wide: true });
ACT.catEdit = (el) => { const cat = item('category', el.dataset.id); if (cat) openSheet(catForm(cat, cat.activityId), { wide: true }); };
SUBMIT.catSave = (f) => { const fd = new FormData(f), d = Object.fromEntries(fd), prev = d.id ? item('category', d.id) || {} : {}; putItem('category', d.id || 'cat-' + uid().slice(0, 12), { emoji: prev.emoji, guide: prev.guide, howTo: prev.howTo, source: prev.source, activityId: d.activityId, label: d.label, description: d.description, caps: fd.getAll('caps').map((id) => ({ id, w: 1 })) }); closeSheet(); toast('Catégorie enregistrée'); render(); };
ACT.catDel = async (el) => { const cat = item('category', el.dataset.id); if (!cat) return; const used = itemsOf('metric').some((m) => (m.caps || []).some((x) => x.id === cat.id)); if (!(await ask(`Supprimer la catégorie « ${cat.label} » ?`, { danger: true, ok: used ? 'Archiver' : 'Supprimer', detail: used ? 'Des métriques y sont reliées : elle sera archivée (masquée) pour ne rien casser.' : '' }))) return; if (used) putItem('category', cat.id, { ...cat, archived: true }); else delItem('category', cat.id); closeSheet(); render(); };
function metricForm(m, pre = '') {
  const c = ctx(), caps = new Set((m?.caps || []).map((x) => x.id));
  return h`<h2 style="margin:0">${m ? 'Modifier la métrique' : 'Nouvelle métrique'}</h2><form data-submit="metricSave" class="stack"><input type="hidden" name="id" value="${m?.id || ''}">
    <label>Ce qui est mesuré<input name="label" required maxlength="80" value="${m?.label || pre}" placeholder="Ex. Détente au panier, 40 km vélo…"></label>
    <div class="grid2"><label>Unité<input name="unit" maxlength="20" value="${m?.unit || ''}" placeholder="reps, kg, s, km, cm…"></label><label>Sens<select name="dir"><option value="1" ${m?.dir !== -1 ? 'selected' : ''}>Plus c’est haut, mieux c’est</option><option value="-1" ${m?.dir === -1 ? 'selected' : ''}>Plus c’est bas, mieux c’est (temps)</option></select></label></div>
    <label>Activité<select name="activityId"><option value="">Toutes</option>${Object.values(c.activities).map((a) => h`<option value="${a.id}" ${m?.activityId === a.id ? 'selected' : ''}>${a.label}</option>`)}</select></label>
    <label>Capacités suivies</label><div class="chips">${[...Object.entries(CAPACITIES), ...Object.values(c.categories).map((x) => [x.id, { label: x.label + ' (catégorie)' }])].map(([id, x]) => h`<label class="chip ${caps.has(id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="caps" value="${id}" ${caps.has(id) ? 'checked' : ''} data-change="chipToggle">${x.label}</label>`)}</div>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${m ? h`<button class="btn danger" type="button" data-act="metricArchive" data-id="${m.id}">Archiver</button>` : ''}</div></form>`;
}
ACT.metricNew = (el) => { S.metricBack = el?.dataset?.from === 'metricId' && document.querySelector('#sheet form[data-submit=perfSave]') ? 'perf' : ''; openSheet(metricForm(null, el?.dataset?.q || ''), { wide: true }); };
ACT.metricEdit = (el) => { const m = item('metric', el.dataset.id); if (m) openSheet(metricForm(m), { wide: true }); };
SUBMIT.metricSave = (f) => { const fd = new FormData(f), d = Object.fromEntries(fd), mid = d.id || 'm-' + uid().slice(0, 12); putItem('metric', mid, { label: d.label, unit: d.unit, dir: Number(d.dir) === -1 ? -1 : 1, activityId: d.activityId, kind: 'other', caps: fd.getAll('caps').map((id) => ({ id, w: 1 })) }); closeSheet(); toast('Mesure enregistrée'); render();
  // Créée depuis la liste d'une saisie : on revient à la saisie, avec cette mesure choisie.
  if (S.metricBack === 'perf') { S.metricBack = ''; setTimeout(() => ACT.perfAdd({ dataset: { id: mid } }), 150); } };
ACT.metricArchive = (el) => { const m = item('metric', el.dataset.id); if (m) { putItem('metric', m.id, { ...m, archived: true }); closeSheet(); toast('Métrique archivée (performances conservées)'); render(); } };

/* ═════════ Performances (valeurs observées) ═════════ */
function vPerfs() {
  const c = ctx(), rem = testReminders(c);
  const groups = new Map();
  for (const p of c.perfs) { if (!groups.has(p.metricId)) groups.set(p.metricId, []); groups.get(p.metricId).push(p); }
  const climber = Object.keys(c.activities).some((a) => a.startsWith('climbing'));
  return h`<div class="row wrapf"><button class="btn pri" data-act="perfAdd">＋ Saisir une performance</button><button class="btn" data-act="metricNew">＋ Métrique personnalisée</button></div>
    ${recordsCards()}
    ${climber ? h`<span class="kicker">🧗 Escalade</span>${climbMaxima()}${pyramidCard()}${fingerCard()}` : ''}
    ${rem.length ? h`<div class="card flat"><h3>📏 À mesurer</h3>${rem.map((t) => h`<div class="item"><div class="grow"><b class="small">${t.label}</b><div class="tiny muted">${t.unknown ? 'tu ne sais pas encore' : t.age != null ? `il y a ${t.age} j` : 'jamais mesuré'} · pour ${t.why}</div>${t.test ? h`<details class="how mini"><summary>Comment faire le test ?</summary><p class="tiny">${t.test}</p></details>` : ''}</div><button class="btn sm pri" data-act="perfAdd" data-id="${t.metricId}">Saisir</button></div>`)}</div>` : ''}
    ${groups.size ? [...groups.entries()].map(([mid, list]) => { const m = c.metrics[mid] || { label: mid, unit: '' }; const t = metricTrend(mid, c); const pts = list.filter((p) => !p.unknown && p.value != null).sort((a, b) => a.date - b.date).map((p) => ({ v: p.value })); return h`<div class="card"><div class="row between"><h3>${m.label}</h3><button class="btn sm" data-act="perfAdd" data-id="${mid}">＋</button></div>
      ${m.tiers ? h`<p class="tiny muted">${metricTierText(m)}</p>` : ''}${t ? h`<p class="small">${t.dir > 0 ? '📈' : t.dir < 0 ? '📉' : '➖'} ${t.text}</p>` : ''}${pts.length >= 2 ? lineChart(pts, m.unit) : ''}
      ${list.slice(0, 8).map((p) => h`<div class="item"><div class="grow"><b>${perfText(p, c)}</b> ${tag(({ measured: 'mesuré', declared: 'déclaré', imported: 'importé', session: 'relevé en séance' })[p.source] || p.source, SOURCE_TAG[({ measured: 'mesuré', declared: 'déclaré' })[p.source]] || '')}${p.styles?.length ? h`<div class="tiny muted">${p.styles.map((s) => c.styles[s]?.label || s).join(', ')}</div>` : ''}<div class="tiny muted">${fmtDay(p.date)}${p.note ? ' · ' + p.note : ''}</div></div><button class="btn sm ic" data-act="perfEdit" data-id="${p.id}" aria-label="Modifier">✎</button><button class="btn danger sm ic" data-act="perfDel" data-id="${p.id}" aria-label="Supprimer">✕</button></div>`)}</div>`; })
      : empty('Aucune performance. Saisis un test (tractions max, 5 km, suspension…) ou indique « je ne sais pas » : l’application te proposera un test.', h`<button class="btn pri" data-act="perfAdd">＋ Saisir une performance</button>`)}`;
}
function perfForm(p, metricId) {
  const c = ctx(), mid = p?.metricId || metricId || '', m = c.metrics[mid];
  const list = Object.entries(c.metrics).filter(([id, x]) => !x.archived || id === mid);
  const isGrade = m?.kind === 'grade';
  const act = m?.gradeActivity || 'bloc';
  const systems = Object.values(c.systems).filter((s) => !s.archived && (s.activity === act || s.activity === 'autre'));
  const styles = Object.values(c.styles).filter((s) => !s.archived && (s.activity === 'climbing' || !s.activity || s.activity === 'escalade'));
  const d = p?.date ? new Date(p.date) : new Date();
  return h`<h2 style="margin:0">${p ? 'Modifier la performance' : 'Nouvelle performance'}</h2><form data-submit="perfSave" class="stack"><input type="hidden" name="id" value="${p?.id || ''}">
    <label>Métrique<select name="metricId" data-change="perfMetric" data-pick="yes" data-add="metricNew" data-add-label="Créer une mesure" required><option value="">— choisir —</option>${metricOptions(list, mid)}</select></label>
    ${m?.test ? h`<p class="tiny muted">Protocole : ${m.test}</p>` : ''}${m?.tiers ? h`<p class="tiny muted">${metricTierText(m)}</p>` : ''}
    ${isGrade ? h`<label>Système de cotation<select name="systemId" data-change="perfSystem">${systems.map((s) => h`<option value="${s.id}" ${(p?.grade?.systemId || S.perfSys) === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
      <label>Niveau<select name="levelId">${sortedLevels(c.systems[p?.grade?.systemId || S.perfSys] || systems[0]).map((l) => h`<option value="${l.id}" ${p?.grade?.levelId === l.id ? 'selected' : ''}>${l.label}</option>`)}</select></label>
      <label>Styles (plusieurs possibles)</label><div class="chips">${styles.map((s) => h`<label class="chip ${(p?.styles || []).includes(s.id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="styles" value="${s.id}" ${(p?.styles || []).includes(s.id) ? 'checked' : ''} data-change="chipToggle">${s.label}</label>`)}</div>
      <label>Où ?<select name="ctxEnv"><option value="">—</option>${[['salle', '🏢 Salles'], ['falaise', '🌄 Falaises']].map(([k, l]) => { const list = placesOf(ctx().envs, k); return list.length ? h`<optgroup label="${l}">${list.map((e) => h`<option value="${e.id}" ${p?.context?.env === e.id ? 'selected' : ''}>${e.name}</option>`)}</optgroup>` : ''; })}<option value="salle" ${!p?.context?.env && p?.context?.kind === 'salle' ? 'selected' : ''}>En salle (autre)</option><option value="falaise" ${!p?.context?.env && p?.context?.kind === 'falaise' ? 'selected' : ''}>En falaise (autre)</option></select></label>
      <label>Secteur <span class="tiny muted">(falaise, facultatif)</span><input name="ctxSector" maxlength="60" list="sectors-dl" value="${p?.context?.place || ''}"><datalist id="sectors-dl">${[...new Set(placesOf(ctx().envs, 'falaise').flatMap((e) => e.sectors || []))].map((x) => h`<option value="${x}">`)}</datalist></label>`
      : m ? numberField('value', 'Valeur', p?.value ?? '', { unit: m.unit, step: 'any' }) : ''}
    ${m ? h`<label class="chk"><input type="checkbox" name="unknown" ${p?.unknown ? 'checked' : ''}> Je ne sais pas (aucune valeur enregistrée, un test te sera proposé)</label>` : ''}
    <div class="grid2"><label>Date<input type="date" name="date" value="${d.toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}"></label><label>Source<select name="source"><option value="measured" ${p?.source === 'measured' ? 'selected' : ''}>Mesuré (test fait)</option><option value="declared" ${!p || p.source === 'declared' ? 'selected' : ''}>Déclaré (de mémoire)</option></select></label></div>
    <label>Note<input name="note" maxlength="300" value="${p?.note || ''}"></label>
    <button class="btn pri" type="submit">Enregistrer</button></form>`;
}
ACT.perfAdd = (el) => { closeSheet(); S.perfSys = S.perfSys || 'font'; openSheet(perfForm(null, el?.dataset?.id), { wide: true }); };
ACT.perfEdit = (el) => { const p = item('perf', el.dataset.id); if (p) openSheet(perfForm(p), { wide: true }); };
CHG.perfMetric = (el) => { const m = ctx().metrics[el.value]; if (m?.kind === 'grade') S.perfSys = REFERENCE[m.gradeActivity || 'bloc']; openSheet(perfForm({ id: el.form.id.value, metricId: el.value }), { wide: true }); };
CHG.perfSystem = (el) => { S.perfSys = el.value; const f = el.form; const sel = f.querySelector('[name=levelId]'); sel.innerHTML = sortedLevels(ctx().systems[el.value]).map((l) => `<option value="${l.id}">${l.label.replace(/[<>&"]/g, '')}</option>`).join(''); };
SUBMIT.perfSave = (f) => {
  const fd = new FormData(f), d = Object.fromEntries(fd), c = ctx(), m = c.metrics[d.metricId];
  if (!m) { toast('Choisis une métrique.'); return; }
  const date = d.date ? new Date(d.date + 'T12:00:00').getTime() : Date.now();
  if (date > Date.now() + 86400000) { toast('Une performance ne peut pas être datée dans le futur.'); return; }
  const unknown = !!d.unknown;
  let grade = null, value = null;
  if (!unknown && m.kind === 'grade') { grade = gradeSnapshot(c.systems[d.systemId], d.levelId); if (!grade) { toast('Choisis un niveau.'); return; } }
  if (!unknown && m.kind !== 'grade') { value = d.value === '' ? null : Number(d.value); if (value == null || !Number.isFinite(value)) { toast('Saisis une valeur numérique, ou coche « je ne sais pas ».'); return; } }
  putItem('perf', d.id || 'p-' + uid().slice(0, 14), { metricId: d.metricId, value, unknown, unit: m.unit, date, source: d.source, grade, styles: fd.getAll('styles'), context: perfContext(d), note: d.note });
  closeSheet(); buzzOk(); toast(unknown ? 'Noté « je ne sais pas » : un test te sera proposé.' : 'Performance enregistrée'); render();
};
ACT.perfDel = async (el) => { const p = item('perf', el.dataset.id); if (p && (await ask('Supprimer cette performance ?', { ok: 'Supprimer', danger: true }))) { delItem('perf', p.id); render(); } };

/* ═════════ Escalade : systèmes de cotation, styles, maxima, journal ═════════ */
/** Maxima d'escalade (dans Records et mesures). */
export function climbMaxima() {
  const c = ctx(), maxPerfs = c.perfs.filter((p) => p.metricId === 'max_bloc' || p.metricId === 'max_voie'), sum = maximaSummary(maxPerfs, c.styles);
  return h`<div class="card"><div class="row between wrapf"><h3>🧗 Mes maxima</h3><div class="row tight wrapf"><button class="btn sm pri" data-act="perfAdd" data-id="max_bloc">＋ Bloc</button><button class="btn sm pri" data-act="perfAdd" data-id="max_voie">＋ Voie</button></div></div>
      <p class="tiny muted">Plusieurs maxima possibles : par système de cotation, par style (multi-sélection) et par contexte. Chaque saisie garde le système utilisé à ce moment-là.</p>
      ${sum.length ? sum.map((x) => h`<div class="card flat"><b>${x.systemName}</b> ${c.systems[x.systemId]?.archived ? tag('archivé') : !c.systems[x.systemId] ? tag('supprimé') : ''}<p class="small">Meilleur : <b>${snapshotText(x.best.grade, c.systems)}</b> (${fmtDay(x.best.date)})</p>${x.byStyle.length ? h`<div class="chips">${x.byStyle.map((s) => h`<span class="chip static">${s.label} : ${s.perf.grade.label}</span>`)}</div>` : ''}
        <details><summary class="small">${x.entries.length} saisie(s)</summary>${x.entries.map((p) => h`<div class="item"><div class="grow small">${p.grade.label} · ${fmtDay(p.date)}${p.styles?.length ? ' · ' + p.styles.map((s) => c.styles[s]?.label || s).join(', ') : ''}${p.context?.kind ? ' · ' + p.context.kind : ''}</div><button class="btn sm ic" data-act="perfEdit" data-id="${p.id}">✎</button><button class="btn danger sm ic" data-act="perfDel" data-id="${p.id}">✕</button></div>`)}</details></div>`) : h`<p class="muted small">Aucun maximum enregistré.</p>`}</div>`;
}
/** Systèmes de cotation et styles d'escalade (dans Mes sports). */
export function climbSystemsStyles() {
  const c = ctx(), userSys = Object.values(c.systems).filter((s) => !s.builtin);
  return h`<div class="card"><div class="row between"><h3>Systèmes de cotation</h3><button class="btn sm" data-act="sysNew">＋ Système</button></div>
      ${Object.values(BUILTIN_SYSTEMS).map((s) => h`<div class="item"><div class="grow"><b>${s.name}</b> ${s.global ? tag('🌍 pour tous', 'acc') : tag('intégré')}<div class="tiny muted">${s.levels.length} niveaux${s.maps.length ? ' · correspondance usuelle vers Fontainebleau' : ''}</div></div><button class="btn sm" data-act="sysDup" data-id="${s.id}">Dupliquer</button></div>${s.global && S.user?.isAdmin ? h`<div class="row"><button class="btn sm ghost" data-act="glReset" data-k="grading" data-id="${s.id}">↺ Retirer pour tous</button></div>` : ''}`)}
      ${userSys.map((s) => h`<div class="item"><div class="grow"><b>${s.name}</b> ${s.archived ? tag('archivé') : ''}<div class="tiny muted">${s.activity} · ${s.levels.length} niveaux · ${s.maps.length} correspondance(s)</div><div class="lvlrow">${sortedLevels(s).slice(0, 12).map((l) => raw(`<span class="lvl" style="${l.color ? `background:${l.color}` : ''}">${l.label.replace(/[<>&"]/g, '')}</span>`))}</div><div class="row wrapf">${shareButton('grading', s.id)}</div></div><button class="btn sm" data-act="sysEdit" data-id="${s.id}">✎</button></div>`)}</div>
    <div class="card"><div class="row between"><h3>Styles</h3><button class="btn sm" data-act="styleNew">＋ Style</button></div>
      <div class="chips">${Object.values(c.styles).filter((s) => !s.archived).map((s) => s.builtin ? h`<span class="chip static">${s.label}${s.global ? ' 🌍' : ''}</span>` : chip(false, s.label + ' ✎', `data-act="styleEdit" data-id="${s.id}"`))}</div>
      ${Object.values(c.styles).some((s) => s.archived) ? h`<p class="tiny muted">Archivés (conservés dans l’historique) : ${Object.values(c.styles).filter((s) => s.archived).map((s) => s.label).join(', ')}</p>` : ''}</div>`;
}
ACT.sysNew = () => openSheet(h`<h2 style="margin:0">Nouveau système de cotation</h2><p class="muted small">Pars d’un modèle puis modifie librement les niveaux, leur ordre, leurs couleurs et les correspondances.</p>
  ${Object.entries(GRADE_TEMPLATES).map(([k, t]) => h`<button class="item pick" data-act="sysFromTpl" data-id="${k}"><div class="grow"><b>${t.name}</b><div class="tiny muted">${t.levels.join(' · ') || 'vide'}</div></div></button>`)}<button class="btn" data-act="closeSheet">Annuler</button>`);
ACT.sysFromTpl = (el) => { const id = 'gs-' + uid().slice(0, 12); putItem('gradesys', id, systemFromTemplate(el.dataset.id)); S.sysEdit = id; openSysEditor(id); render(); };
ACT.sysDup = (el) => { const b = BUILTIN_SYSTEMS[el.dataset.id]; const id = 'gs-' + uid().slice(0, 12); putItem('gradesys', id, { name: b.name + ' (ma version)', activity: b.activity, kind: b.kind, levels: b.levels.map((l) => ({ ...l, id: 'lv' + uid().slice(0, 10) })), maps: [] }); openSysEditor(id); render(); };
ACT.sysEdit = (el) => openSysEditor(el.dataset.id);
function openSysEditor(id) {
  const s = item('gradesys', id); if (!s) return; S.sysEdit = id;
  const ref = REFERENCE[s.activity] || 'font', refSys = BUILTIN_SYSTEMS[ref];
  openSheet(h`<h2 style="margin:0">${s.name}</h2><form data-submit="sysMeta" class="stack"><div class="grid2"><label>Nom<input name="name" value="${s.name}" maxlength="60" required></label><label>Discipline<select name="activity">${[['bloc', 'Bloc'], ['voie', 'Voie'], ['autre', 'Autre']].map(([k, l]) => h`<option value="${k}" ${s.activity === k ? 'selected' : ''}>${l}</option>`)}</select></label></div><button class="btn sm" type="submit">Renommer / enregistrer</button></form>
    <b class="small">Niveaux (du plus facile au plus difficile) et correspondance vers ${refSys.name}</b>
    ${sortedLevels(s).map((l, i, arr) => h`<form data-submit="lvlSave" class="item lvl-edit"><input type="hidden" name="lid" value="${l.id}"><input name="label" value="${l.label}" maxlength="30" aria-label="Libellé" class="grow"><input type="color" name="color" value="${l.color || '#888888'}" aria-label="Couleur" class="color-in">
      <select name="map" aria-label="Correspondance"><option value="">≈ ?</option>${refSys.levels.map((r) => h`<option value="${r.label}" ${s.maps.find((m) => m.levelId === l.id && m.ref === ref)?.refLevel === r.label ? 'selected' : ''}>${r.label}</option>`)}</select>
      <button class="btn sm ic" type="submit" aria-label="Enregistrer">✓</button><button class="btn sm ic" type="button" data-act="lvlMove" data-id="${l.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn sm ic" type="button" data-act="lvlMove" data-id="${l.id}" data-d="1" ${i === arr.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm ic danger" type="button" data-act="lvlDel" data-id="${l.id}" aria-label="Supprimer">✕</button></form>`)}
    <form data-submit="lvlAdd" class="row"><input name="label" maxlength="30" placeholder="Nouveau niveau" class="grow" required aria-label="Nouveau niveau"><button class="btn sm" type="submit">＋ Ajouter</button></form>
    <p class="tiny muted">Correspondances facultatives : sans elles, l’application ne convertit jamais tes niveaux (aucune équivalence inventée). Les performances passées gardent le libellé du moment.</p>
    <div class="row wrapf"><button class="btn" data-act="sysArchive" data-id="${id}">${s.archived ? 'Réactiver' : 'Archiver'}</button><button class="btn danger" data-act="sysDelete" data-id="${id}">Supprimer</button><button class="btn pri" data-act="closeSheet">Terminé</button></div>`, { wide: true });
}
const updSys = (fn) => { const s = item('gradesys', S.sysEdit); if (!s) return; const n = fn(s); putItem('gradesys', S.sysEdit, n); openSysEditor(S.sysEdit); render(); };
SUBMIT.sysMeta = (f) => { const d = Object.fromEntries(new FormData(f)); updSys((s) => ({ ...s, name: d.name, activity: d.activity })); toast('Système enregistré'); };
SUBMIT.lvlSave = (f) => { const d = Object.fromEntries(new FormData(f)); updSys((s) => { const ref = REFERENCE[s.activity] || 'font'; return setMapping(renameLevel(s, d.lid, d.label, d.color === '#888888' ? '' : d.color), d.lid, ref, d.map); }); toast('Niveau enregistré'); };
SUBMIT.lvlAdd = (f) => { const l = new FormData(f).get('label'); updSys((s) => addLevel(s, l)); };
ACT.lvlMove = (el) => updSys((s) => moveLevel(s, el.dataset.id, Number(el.dataset.d)));
ACT.lvlDel = async (el) => { if (await ask('Supprimer ce niveau ?', { danger: true, ok: 'Supprimer', detail: 'Les performances déjà saisies gardent leur libellé.' })) updSys((s) => removeLevel(s, el.dataset.id)); };
ACT.sysArchive = (el) => { const s = item('gradesys', el.dataset.id); if (s) { putItem('gradesys', s.id, { ...s, archived: !s.archived }); openSysEditor(s.id); render(); } };
ACT.sysDelete = async (el) => { const s = item('gradesys', el.dataset.id); if (s && (await ask(`Supprimer « ${s.name} » ?`, { danger: true, ok: 'Supprimer', detail: 'L’historique n’est pas cassé : chaque performance a gardé le niveau et le nom du système au moment de la saisie.' }))) { delItem('gradesys', s.id); closeSheet(); render(); } };
ACT.styleNew = () => openSheet(h`<h2 style="margin:0">Nouveau style</h2><form data-submit="styleSave" class="stack"><input type="hidden" name="id" value=""><label>Nom<input name="label" required maxlength="40" placeholder="Ex. Toit, arête, conti…"></label><button class="btn pri" type="submit">Ajouter</button></form>`);
ACT.styleEdit = (el) => { const s = item('style', el.dataset.id); if (s) openSheet(h`<h2 style="margin:0">Style</h2><form data-submit="styleSave" class="stack"><input type="hidden" name="id" value="${s.id}"><label>Nom<input name="label" required maxlength="40" value="${s.label}"></label><div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn danger" type="button" data-act="styleArchive" data-id="${s.id}">Archiver</button></div></form>${shareButton('style', s.id)}`); };
SUBMIT.styleSave = (f) => { const d = Object.fromEntries(new FormData(f)); putItem('style', d.id || 'st-u-' + uid().slice(0, 10), { label: d.label, activity: 'climbing', archived: false }); closeSheet(); toast('Style enregistré'); render(); };
ACT.styleArchive = (el) => { const s = item('style', el.dataset.id); if (s) { putItem('style', s.id, { ...s, archived: true }); closeSheet(); toast('Style archivé : l’historique garde ce style.'); render(); } };
ACT.ascNew = () => {
  const c = ctx(), sysId = S.ascSys || 'font', sys = c.systems[sysId] || c.systems.font;
  openSheet(h`<h2 style="margin:0">Bloc / voie</h2><form data-submit="ascSave" class="stack"><div class="grid2"><label>Type<select name="kind"><option value="bloc">Bloc</option><option value="voie">Voie</option></select></label><label>Nom (facultatif)<input name="name" maxlength="80"></label></div>
    <div class="grid2"><label>Système<select name="systemId" data-change="ascSys">${Object.values(c.systems).filter((s) => !s.archived).map((s) => h`<option value="${s.id}" ${s.id === sys.id ? 'selected' : ''}>${s.name}</option>`)}</select></label><label>Niveau<select name="levelId">${sortedLevels(sys).map((l) => h`<option value="${l.id}">${l.label}</option>`)}</select></label></div>
    <div class="grid2"><label>Résultat<select name="result"><option value="flash">Flash</option><option value="send">Réussi</option><option value="work">Réussi après travail</option><option value="attempt" selected>Essai</option><option value="fail">Échec</option></select></label>${numberField('attempts', 'Essais', 1, { min: 1, max: 999, step: 1 })}</div>
    <label>Styles</label><div class="chips">${Object.values(c.styles).filter((s) => !s.archived).map((s) => h`<label class="chip"><input type="checkbox" class="hidden" name="styles" value="${s.id}" data-change="chipToggle">${s.label}</label>`)}</div>
    <label>Note<input name="note" maxlength="300"></label><button class="btn pri" type="submit">Enregistrer</button></form>`, { wide: true });
};
CHG.ascSys = (el) => { S.ascSys = el.value; const sel = el.form.querySelector('[name=levelId]'); sel.innerHTML = sortedLevels(ctx().systems[el.value]).map((l) => `<option value="${l.id}">${l.label.replace(/[<>&"]/g, '')}</option>`).join(''); };
SUBMIT.ascSave = (f) => { const fd = new FormData(f), d = Object.fromEntries(fd), c = ctx(); putItem('ascent', 'asc-' + uid().slice(0, 14), { kind: d.kind, name: d.name, grade: gradeSnapshot(c.systems[d.systemId], d.levelId), result: d.result, attempts: Number(d.attempts) || 1, styles: fd.getAll('styles'), date: Date.now(), note: d.note }); closeSheet(); buzzOk(); toast('Enregistré dans ton journal'); render(); };
ACT.ascDel = async (el) => { if (await ask('Supprimer cette entrée ?', { danger: true, ok: 'Supprimer' })) { delItem('ascent', el.dataset.id); render(); } };

/* ═════════ Objectifs (dont figures complexes) ═════════ */
function vGoals() {
  const c = ctx();
  if (S.param) { const g = c.goals.find((x) => x.id === S.param); if (g) return vGoalDetail(g); }
  const f = ['done', 'archived'].includes(S.filters.goals) ? S.filters.goals : 'active', st = (g) => g.status || 'active';
  const list = c.goals.filter((g) => st(g) === f), nArch = c.goals.filter((g) => st(g) === 'archived').length + itemsOf('project').filter((p) => p.status === 'archived').length;
  // Réussis ou archivés : une sous-liste avec son retour (jamais une rangée d'onglets).
  if (f === 'done') return h`<button class="btn sm ghost" data-act="goalFilter" data-id="active">‹ Objectifs en cours</button>${doneList(c.goals)}`;
  if (f !== 'active') return h`<button class="btn sm ghost" data-act="goalFilter" data-id="active">‹ Objectifs en cours</button><h2>${f === 'done' ? '🏆 Objectifs réussis' : '🗄️ Objectifs archivés'}</h2>
    ${list.length ? list.map((g) => { const pr = goalProgress(g, c); return h`<button class="card pick goalcard" data-act="goalOpen" data-id="${g.id}"><div class="row between"><b>${g.type === 'skill' ? SKILLS[g.skillId]?.emoji + ' ' : ''}${goalLabel(g)}</b><span class="small">${pr.pct == null ? '—' : pr.pct + ' %'}</span></div>${meter(pr.pct || 0)}<div class="tiny muted">${pr.text}</div></button>`; }) : itemsOf('project').some((p) => p.status === f) ? '' : empty('Aucun objectif ici. Exemples : front lever, drapeau, traction à un bras, 20 tractions, 7A en bloc, 3 séances par semaine…', h`<button class="btn pri" data-act="goalNew">＋ Ajouter un objectif</button>`)}${f === 'archived' ? projectsSection('archived') : ''}${f === 'done' && doneProjects().length ? doneList(c.goals) : ''}`;
  return h`${goalsPicker()}<div class="row wrapf"><button class="btn pri" data-act="goalNew">＋ Objectif précis</button></div>
    <span class="kicker">En cours</span>
    ${list.length ? list.map((g) => { const pr = goalProgress(g, c); return h`<button class="card pick goalcard" data-act="goalOpen" data-id="${g.id}"><div class="row between"><b>${g.type === 'skill' ? SKILLS[g.skillId]?.emoji + ' ' : ''}${goalLabel(g)}</b><span class="small">${pr.pct == null ? '—' : pr.pct + ' %'}</span></div>${meter(pr.pct || 0)}<div class="tiny muted">${pr.text}</div></button>`; }) : empty('Aucun objectif ici. Exemples : front lever, drapeau, traction à un bras, 20 tractions, 7A en bloc, 3 séances par semaine…', h`<button class="btn pri" data-act="goalNew">＋ Ajouter un objectif</button>`)}
    ${projectsSection('active')}
    ${doneGoals(c.goals).length || doneProjects().length ? doneList(c.goals, 5) : ''}
    ${nArch ? menuList([['goalFilter', 'archived', '🗄️', `Objectifs archivés (${nArch})`, 'Mis de côté, gardés dans l’historique']]) : ''}
    <div class="card flat"><h3>Figures proposées</h3><div class="chips">${Object.entries(SKILLS).map(([id, s]) => chip(false, `${s.emoji} ${s.label}`, `data-act="goalNewSkill" data-id="${id}"`))}</div></div>`;
}
/** Objectifs réussis, datés (aussi affichés dans Progrès). */
export function doneList(goals, max = 0) {
  const d = [...doneGoals(goals).map((g) => ({ at: g.doneAt || 0, row: h`<button class="setrow" data-act="goalOpen" data-id="${g.id}"><span class="sic">🏆</span><span class="grow"><b>${goalLabel(g)}</b><small>${g.doneAt ? 'le ' + new Date(g.doneAt).toLocaleDateString('fr-FR') : ''}</small></span><span class="chev">›</span></button>` })),
    ...doneProjects().map((p) => ({ at: p.doneAt || 0, row: h`<button class="setrow" data-act="projOpen" data-id="${p.id}"><span class="sic">🧗</span><span class="grow"><b>${p.name || 'Projet'} ${p.grade?.label || p.gradeText || ''}</b><small>Projet réussi${p.doneAt ? ' le ' + new Date(p.doneAt).toLocaleDateString('fr-FR') : ''}</small></span><span class="chev">›</span></button>` }))].sort((x, y) => y.at - x.at);
  if (!d.length) return '';
  const shown = max ? d.slice(0, max) : d;
  return h`<section class="card"><h3>🏆 Objectifs réussis <span class="tiny muted">${d.length}</span></h3>
    <div class="setmenu">${shown.map((x) => x.row)}</div>
    ${max && d.length > max ? h`<button class="btn sm ghost" data-act="goalsDoneAll">Voir les ${d.length}</button>` : ''}</section>`;
}
ACT.goalsDoneAll = () => { S.filters.goals = 'done'; go('profile', 'goals'); };
/* ═════════ Mon corps ═════════ */
function vBody() {
  const b = item('config', 'body') || {}, c = ctx(), goals = item('config', 'main')?.goals || [];
  const weights = c.perfs.filter((p) => p.metricId === 'body_weight' && Number.isFinite(p.value)).sort((x, y) => x.date - y.date);
  const adj = bodyAdjust(b, goals);
  return h`<section class="card">${bodyFields(b, { act: 'bodySet', inp: 'bodyIn', onChange: true })}</section>
    <section class="card"><div class="row between"><h3>⚖️ Mon poids</h3><button class="btn sm pri" data-act="weighIn">＋ Pesée</button></div>
      ${weights.length >= 2 ? lineChart(weights.slice(-30).map((p) => ({ v: p.value, t: p.date })), 'kg') : ''}
      ${weights.length ? h`<p class="small">Dernière pesée : <b>${weights.at(-1).value} kg</b> (${fmtDay(weights.at(-1).date)})${weights.length >= 2 ? h` · ${(() => { const d = Math.round((weights.at(-1).value - weights[0].value) * 10) / 10; return d > 0 ? `+${d} kg` : `${d} kg`; })()} depuis le ${fmtDay(weights[0].date)}` : ''}</p>` : h`<p class="small muted">Note ton poids de temps en temps (même heure, même conditions) pour voir la tendance.</p>`}</section>
    ${compositionCard()}
    ${silhouetteCard(b, goals)}
    ${painCard()}
    <section class="card"><h3>Ce que ça change dans tes séances</h3>${adj.reasons.length ? h`<ul class="small">${adj.reasons.map((r) => h`<li>${r}</li>`)}</ul>` : h`<p class="small muted">Rien de spécial : les séances suivent ton niveau et tes objectifs.</p>`}${sourcesLine(adj.sources)}</section>`;
}
/** Composition et mensurations : dernières valeurs, évolution, indices calculés (avec leurs limites), saisie en une fois. */
function compositionCard() {
  const c = ctx(), num = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  const row = (id) => { const m = c.metrics[id], l = lastValue(c, id); if (!m) return ''; const e = evolution(c, id);
    return h`<button class="setrow" data-act="mHistory" data-id="${id}"><span class="grow"><b>${m.label}</b><small>${l ? `${num(l.value)} ${m.unit}${l.date ? ` · ${fmtDay(l.date)}` : ' · profil'}${e?.delta ? ` · ${e.delta > 0 ? '+' : ''}${num(e.delta)} ${m.unit} depuis le ${fmtDay(e.since)}` : ''}` : 'pas encore mesuré'}</small></span><span class="chev">›</span></button>`; };
  const known = (l) => l.filter((id) => lastValue(c, id));
  const ix = indices(c);
  return h`<section class="card stack"><h3 style="margin:0">📊 Composition et mensurations</h3>
    <p class="tiny muted">Pour suivre précisément ton corps : tout ce que donne une balance connectée, et tes mensurations, en une seule saisie. Toujours le même appareil, le matin, à jeun.</p>
    <div class="grid2"><button class="btn pri" data-act="weighFull">⚖️ Pesée complète</button><button class="btn" data-act="measureAll">📏 Mensurations</button></div>
    ${known(COMPOSITION).length ? h`<span class="kicker">Composition</span><div class="setmenu">${known(COMPOSITION).map(row)}</div>` : ''}
    ${known(MEASURES).length ? h`<span class="kicker">Mensurations</span><div class="setmenu">${known(MEASURES).map(row)}</div>` : ''}
    ${ix.length ? h`<span class="kicker">Calculé à partir de tes mesures</span><div class="stack tight">${ix.map((x) => h`<details class="how mini"><summary><b>${x.label}</b> : ${x.text}</summary><p class="tiny">${x.help}</p></details>`)}</div><p class="tiny muted">Des repères pour suivre ta progression, pas un diagnostic.</p>` : h`<p class="tiny muted">Note ta taille et ton poids (et si possible ta masse grasse) : l’app calcule ton IMC, ta masse maigre, ton indice de masse maigre et tes rapports de mensurations.</p>`}</section>`;
}
const MFIELD = (id, extra = '') => { const m = ctx().metrics[id], l = lastValue(ctx(), id); return m ? h`<label class="small">${m.label}<span class="unitbox"><input type="number" inputmode="decimal" step="any" name="${id}" placeholder="${l ? String(l.value).replace('.', ',') : ''}" ${raw(extra)}><em>${m.unit}</em></span></label>` : ''; };
ACT.weighFull = () => openSheet(h`<form class="stack" data-submit="bodySaveMany" data-kind="composition"><h2 style="margin:0">⚖️ Pesée complète</h2>
  <p class="tiny muted">Remplis seulement ce que ta balance (ou ta mesure) donne. Le chiffre gris est ta dernière valeur.</p>
  <div class="grid2">${COMPOSITION.map((id) => MFIELD(id))}</div>
  <label class="small">Appareil <span class="tiny muted">(facultatif, pour comparer ce qui est comparable)</span><input name="device" maxlength="60" placeholder="Ex. balance de la salle, balance connectée…"></label>
  <button class="btn pri big">Enregistrer</button></form>`, { wide: true });
ACT.measureAll = () => openSheet(h`<form class="stack" data-submit="bodySaveMany" data-kind="measures"><h2 style="margin:0">📏 Mensurations</h2>
  <p class="tiny muted">Mètre ruban souple, sans serrer, en fin d’expiration. Remplis ce que tu veux ; touche ❓ pour savoir où mesurer.</p>
  <div class="stack tight">${MEASURES.map((id) => { const m = ctx().metrics[id]; return m ? h`<div>${MFIELD(id)}${m.test ? h`<details class="how mini"><summary class="tiny">❓ Où mesurer</summary><p class="tiny">${m.test}</p></details>` : ''}</div>` : ''; })}</div>
  <button class="btn pri big">Enregistrer</button></form>`, { wide: true });
SUBMIT.bodySaveMany = (f) => {
  const d = Object.fromEntries(new FormData(f)), ids = (f.dataset.kind === 'composition' ? COMPOSITION : MEASURES).filter((id) => String(d[id] ?? '').trim() !== '');
  if (!ids.length) return toast('Remplis au moins une valeur.');
  const errs = f.dataset.kind === 'composition' ? checkWeighIn(d) : ids.filter((id) => !(Number(String(d[id]).replace(',', '.')) > 0)).map((id) => `${ctx().metrics[id].label} : valeur invalide.`);
  if (errs.length) return toast(errs[0], 4000, 'bad');
  const now = Date.now(), day = ymd(new Date()), note = String(d.device || '').trim().slice(0, 60);
  for (const id of ids) { const m = ctx().metrics[id]; putItem('perf', `bc-${id}-${day}`, { metricId: id, value: Math.round(Number(String(d[id]).replace(',', '.')) * 100) / 100, unit: m.unit, date: now, source: 'measured', note: note || (f.dataset.kind === 'composition' ? 'Pesée complète' : 'Mensurations') }); }
  if (ids.includes('body_weight')) putItem('config', 'body', { ...(item('config', 'body') || {}), weight: Number(String(d.body_weight).replace(',', '.')) });
  if (ids.includes('taille_corps')) putItem('config', 'body', { ...(item('config', 'body') || {}), height: Number(String(d.taille_corps).replace(',', '.')) });
  closeSheet(); toast(`${ids.length} mesure${ids.length > 1 ? 's' : ''} enregistrée${ids.length > 1 ? 's' : ''}`); render();
};
ACT.mHistory = (el) => { const c = ctx(), id = el.dataset.id, m = c.metrics[id], e = evolution(c, id), l = lastValue(c, id); if (!m) return;
  const list = c.perfs.filter((p) => p.metricId === id && !p.unknown && Number.isFinite(Number(p.value))).sort((a, b) => b.date - a.date).slice(0, 20);
  openSheet(h`<div class="stack"><h2 style="margin:0">${m.label}</h2>${e ? lineChart(e.points, m.unit) : ''}
    ${l ? h`<p class="small">Dernière : <b>${String(l.value).replace('.', ',')} ${m.unit}</b>${e ? ` · ${e.delta > 0 ? '+' : ''}${String(e.delta).replace('.', ',')} ${m.unit} en ${e.n} mesures` : ''}</p>` : ''}
    ${list.length ? h`<div class="setmenu">${list.map((p) => h`<button class="setrow" data-act="perfEdit" data-id="${p.id}"><span class="grow"><b>${String(p.value).replace('.', ',')} ${m.unit}</b><small>${fmtDay(p.date)}${p.note ? ' · ' + p.note : ''}</small></span><span class="chev">✏️</span></button>`)}</div>` : ''}
    ${m.test ? h`<p class="tiny muted">Comment mesurer : ${m.test}</p>` : ''}<button class="btn pri" data-act="perfAdd" data-id="${id}">＋ Nouvelle mesure</button></div>`, { wide: true }); };
/** Silhouette visée : ce que chaque choix veut dire, mensurations (avec évolution), séries de la semaine par muscle. */
export function silhouetteCard(b = item('config', 'body') || {}, goals = item('config', 'main')?.goals || []) {
  const ch = (b.physique || []).filter((k) => PHYSIQUE[k]), muscle = goals.includes('muscle') || goals.includes('physique');
  if (!ch.length && !muscle) return '';
  const c = ctx(), measures = ch.length ? physiqueMeasures(ch) : [['tour_bras', ''], ['tour_poitrine', ''], ['tour_cuisse', ''], ['tour_taille', '']];
  const tr = physiqueTrack(c, ch.length ? ch : ['bras', 'pecs', 'jambes']), byId2 = Object.fromEntries(tr.rows.map((r) => [r.metricId, r]));
  const groups = physiqueGroups(ch), sets = weeklySets(c, groups.length ? groups : ['dos', 'pecs', 'epaules', 'bras', 'cuisses', 'fessiers']);
  const cm = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')}`;
  return h`<section class="card stack"><h3 style="margin:0">🪞 Ma silhouette</h3>
    ${ch.length ? h`<ul class="clean tight small">${ch.map((k) => h`<li><b>${PHYSIQUE[k].emoji} ${PHYSIQUE[k].label}</b> — ${PHYSIQUE[k].tip}</li>`)}</ul>` : h`<p class="small muted">Choisis plus haut ce que tu aimerais changer (forme en V, abdos visibles, bras…) pour des conseils et des mensurations précis.</p>`}
    <b class="small">📏 Mes mensurations</b>
    <div class="setmenu">${measures.map(([id]) => { const m = METRICS[id], r = byId2[id]; const v = r?.value ?? c.perfs.filter((p) => p.metricId === id && Number.isFinite(Number(p.value))).sort((x, y) => y.date - x.date)[0]?.value; return m ? h`<button class="setrow" data-act="perfAdd" data-id="${id}"><span class="sic">📏</span><span class="grow"><b>${m.label}</b><small>${v != null ? `${cm(v)} ${m.unit}${r?.delta ? ` · ${r.delta > 0 ? '+' : ''}${cm(r.delta)} depuis le ${fmtDay(r.since)}` : ''}` : 'pas encore mesuré — touche pour noter'}</small></span><span class="chev">＋</span></button>` : ''; })}</div>
    ${tr.ratioText ? h`<p class="tiny">${tr.ratioText}</p>` : ''}
    <p class="tiny muted">Mesure toujours dans les mêmes conditions (le matin, même mètre ruban) : l’évolution compte plus que le chiffre.</p>
    <b class="small">📊 Séries cette semaine (7 jours)</b>
    <div class="stack tight">${sets.map((x) => h`<div class="small"><div class="row between"><span>${x.label}</span><span class="tiny ${x.state === 'ok' ? 'ok-t' : x.state === 'high' ? 'warn-t' : 'muted'}">${x.text}</span></div>${meter(Math.min(100, (x.sets / SETS_RANGE[1]) * 100), x.state === 'ok' ? 'ok' : '')}</div>`)}</div>
    <p class="tiny muted">Repère tiré des études : environ ${SETS_RANGE[0]} à ${SETS_RANGE[1]} séries difficiles par muscle et par semaine pour prendre du muscle. L’alimentation, le sommeil et la génétique comptent aussi : rien n’est garanti.</p>
    ${sourcesLine(PHYSIQUE_SOURCES)}</section>`;
}
const saveBody = (b) => { const clean = cleanBody(b); putItem('config', 'body', Object.fromEntries(Object.entries({ ...(item('config', 'body') || {}), ...clean }).filter(([k, v]) => v !== undefined || !(k in clean)).map(([k, v]) => [k, v ?? null]).filter(([, v]) => v !== null))); };
ACT.bodySet = (el) => { saveBody(bodyToggle(item('config', 'body') || {}, el.dataset.k, el.dataset.v)); render(); };
CHG.bodyIn = (el) => {
  const b = { ...(item('config', 'body') || {}), [el.dataset.k]: el.value }; saveBody(b);
  if (el.dataset.k === 'weight' && cleanBody(b).weight) putItem('perf', 'bw-' + new Date().toISOString().slice(0, 10), { metricId: 'body_weight', value: cleanBody(b).weight, unit: 'kg', date: Date.now(), source: 'declared', note: 'Profil › Mon corps et mes préférences' });
  toast('Enregistré'); render();
};
ACT.weighIn = () => openSheet(h`<form data-submit="weighSave" class="stack"><h2 style="margin:0">⚖️ Pesée du jour</h2><label>Poids<span class="unitbox"><input type="number" name="kg" step="0.1" min="25" max="300" inputmode="decimal" required autofocus><em>kg</em></span></label><button class="btn pri" type="submit">Enregistrer</button></form>`);
SUBMIT.weighSave = (f) => { const kg = cleanBody({ weight: new FormData(f).get('kg') }).weight; if (!kg) return toast('Poids invalide.'); putItem('perf', 'bw-' + new Date().toISOString().slice(0, 10), { metricId: 'body_weight', value: kg, unit: 'kg', date: Date.now(), source: 'declared', note: 'Pesée' }); putItem('config', 'body', { ...(item('config', 'body') || {}), weight: kg }); closeSheet(); toast('Pesée enregistrée'); render(); };

/* ═════════ Objectifs du moment (plusieurs) et objectif écrit, analysé par l'assistant ═════════ */
function goalsPicker() {
  const cur = item('config', 'main')?.goals || (item('config', 'main')?.goal ? [item('config', 'main').goal] : []);
  return h`<section class="card"><h3>Ce que je veux en ce moment</h3><div class="chips">${GOALS.map(([k, l]) => chip(cur.includes(k), l, `data-act="goalsToggle" data-id="${k}"`))}</div>
    <button class="btn" data-act="goalWrite">✍️ Écrire mon objectif avec mes mots</button></section>`;
}
ACT.goalsToggle = (el) => {
  const m = item('config', 'main') || {}, cur = new Set(m.goals || (m.goal ? [m.goal] : [])), k = el.dataset.id;
  if (cur.has(k)) cur.delete(k); else cur.add(k);
  const goals = [...cur].slice(0, 8);
  putItem('config', 'main', { ...m, goals, goal: goals[0] || '', intent: INTENT_OF[goals[0]] || '' }); render();
};
ACT.goalWrite = (el) => openSheet(h`<form data-submit="goalAi" class="stack"><h2 style="margin:0">✍️ Mon objectif</h2>
  <p class="small muted">Écris-le comme tu le dirais à un coach. L’assistant en fait une fiche (capacités, mesure, étapes). Tu la relis et la modifies avant de l’enregistrer.</p>
  <textarea name="text" maxlength="300" rows="3" required placeholder="Ex. « Enchaîner le 6c du dévers avant l’été » ou « Courir 10 km sans m’arrêter »">${el?.dataset?.text || ''}</textarea>
  <button class="btn pri" type="submit">Analyser</button></form>`);
/** Depuis l'assistant de séance : l'intention du jour devient un objectif SEULEMENT si on le demande (fiche relue avant). */
ACT.goalFromText = (el) => { S.goalBack = el?.dataset?.back || ''; analyzeGoal(String(el?.dataset?.text || '').trim()); };
SUBMIT.goalAi = async (f) => { S.goalBack = ''; await analyzeGoal(String(new FormData(f).get('text') || '').trim()); };
async function analyzeGoal(text) {
  if (text.length < 3) return;
  openSheet(h`<div class="stack"><h2 style="margin:0">✍️ Mon objectif</h2><p class="small">« ${text} »</p>${skeleton(2)}</div>`);
  let d = null, why = '';
  try { d = (await api('POST', '/api/ai/goal', { text, profile: profileSummary() }, { timeout: 45000 })).goal; }
  catch (e) { why = e.guest ? 'Crée un compte pour utiliser l’assistant.' : e.status === 503 ? 'Assistant indisponible pour le moment.' : e.message; }
  if (!d) d = localGoal(text);
  S.goalDraft = { ...d, text, why };
  openSheet(goalFiche(S.goalDraft), { wide: true });
}
const REASON_IC = { fact: '📊', rule: '📐', inference: '🤔', missing: '❔' };
/** Fiche d'objectif modifiable : rien n'est enregistré avant « Enregistrer ». */
function goalFiche(d) {
  const x = ctx(), mets = Object.entries(x.metrics || {}).filter(([, m]) => m.kind !== 'grade');
  const capsAll = [...new Set([...d.caps.map((c) => c.id), ...Object.keys(ACTIVITIES[d.activityId]?.caps || {})])];
  return h`<form data-submit="goalFicheSave" class="stack"><h2 style="margin:0">🎯 Fiche de l’objectif</h2>
    ${d.why ? h`<p class="tiny warn-t">${d.why} Fiche faite sans l’assistant, à partir des mots de ton objectif.</p>` : ''}
    <label>Nom court<input name="label" maxlength="80" required value="${d.label}"></label>
    <label>Description<textarea name="summary" maxlength="300" rows="2">${d.summary || ''}</textarea></label>
    <label>Sport<select name="activityId"><option value="">— aucun en particulier —</option>${Object.entries(ACTIVITIES).map(([id, a]) => h`<option value="${id}" ${d.activityId === id ? 'selected' : ''}>${a.emoji} ${a.label}</option>`)}</select></label>
    <span class="kicker">Capacités à travailler <span class="tiny muted">(et leur importance)</span></span>
    <div class="stack tight">${capsAll.map((id) => { const w = d.caps.find((c) => c.id === id)?.w || 0; return h`<label class="row between"><span class="small">${capL(id)}</span><select name="cap:${id}" aria-label="Importance de ${capL(id)}">${[[0, '—'], [0.4, 'un peu'], [0.6, 'moyen'], [0.8, 'beaucoup'], [1, 'essentiel']].map(([v, l]) => h`<option value="${v}" ${Math.abs(w - v) < 0.11 && (v || !w) ? 'selected' : ''}>${l}</option>`)}</select></label>`; })}</div>
    <label>Mesure suivie <span class="tiny muted">(facultatif)</span><select name="metricId" data-pick="yes"><option value="">— aucune —</option>${metricOptions(mets, d.metricId)}</select></label>
    ${numberField('target', 'Cible (seulement si tu en as une)', d.target ?? '', { step: 'any' })}
    <label>Indicateurs de progrès <span class="tiny muted">(un par ligne)</span><textarea name="indicators" rows="2" maxlength="600">${(d.indicators || []).join('\n')}</textarea></label>
    <label>Étapes <span class="tiny muted">(une par ligne)</span><textarea name="steps" rows="3" maxlength="800">${(d.steps || []).join('\n')}</textarea></label>
    ${numberField('weeks', 'Horizon (semaines, facultatif)', d.weeks || '', { min: 0, max: 52, step: 1 })}
    <label>Type d’objectif<select name="gtype">${[['custom', 'Personnel'], ['metric', 'Atteindre une mesure'], ['grade', 'Réussir une cotation'], ['sessions', 'Nombre de séances'], ['ascents', 'Nombre de blocs / voies'], ['skill', 'Une figure']].map(([k, l]) => h`<option value="${k}" ${(d.type || 'custom') === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    ${d.skillId && SKILLS[d.skillId] ? h`<label class="row"><input type="checkbox" name="skillId" value="${d.skillId}" checked><span class="small">Lier à la figure « ${SKILLS[d.skillId].label} » (étapes et critères de l’app)</span></label>` : ''}
    <label>Critères de réussite <span class="tiny muted">(un par ligne)</span><textarea name="criteria" rows="2" maxlength="600">${(d.criteria || []).join('\n')}</textarea></label>
    ${d.exercises?.length ? h`<span class="kicker">Exercices liés <span class="tiny muted">(décoche ceux que tu ne veux pas)</span></span><div class="stack tight">${d.exercises.map((id) => h`<label class="row"><input type="checkbox" name="ex" value="${id}" checked><span class="small">${byId(id)?.name || id}</span></label>`)}</div>` : ''}
    ${d.confidence ? h`<p class="tiny muted">Confiance de l’assistant : ${d.confidence}.</p>` : ''}
    ${d.missing?.length ? h`<div class="card flat"><b class="small">❔ Ce qui manque pour être plus précis</b><ul class="clean tight small">${d.missing.map((m) => h`<li>${m}</li>`)}</ul></div>` : ''}
    <details class="how mini"><summary>Pourquoi cette fiche ? Comment le sais-tu ?</summary>${[['fact', '📊 Informations connues'], ['rule', '🔗 Relations existantes'], ['inference', '🤔 Estimations'], ['missing', '❔ Incertitudes']].map(([k, t]) => { const l = (d.how || []).filter((r) => r.cat === k); return l.length ? h`<b class="tiny">${t}</b><ul class="clean tight small">${l.map((r) => h`<li>${r.text}</li>`)}</ul>` : ''; })}</details>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer l’objectif</button><button class="btn" type="button" data-act="goalWrite" data-text="${d.text || ''}">Reformuler</button></div></form>`;
}
/** Sans assistant : mots-clés → capacités (aucune valeur inventée ; les chiffres ne sont repris que s'ils sont écrits). */
function localGoal(text) {
  const t = text.toLowerCase(), caps = [];
  const add = (id, w) => { if (CAPACITIES[id] && !caps.some((c) => c.id === id)) caps.push({ id, w }); };
  if (/doigt|réglette|arqu|bloc|voie|grimp|escalad/.test(t)) { add('force_doigts', 0.8); add('technique_escalade', 0.7); }
  if (/pied|placement|dalle/.test(t)) add('technique_pieds', 0.9);
  if (/traction|tirer|dos/.test(t)) add('tirage_vertical', 0.9);
  if (/pompe|pousser|pec/.test(t)) add('poussee_horizontale', 0.9);
  if (/cour|km|footing|marathon|souffle|cardio|endurance/.test(t)) { add('endurance_aerobie', 1); add('seuil', 0.5); }
  if (/souple|grand écart|mobilit|étire/.test(t)) { add('mobilite_hanches', 0.9); add('mobilite_epaules', 0.6); }
  if (/gainage|abdo|planche|front lever/.test(t)) add('gainage_anterieur', 0.9);
  if (/poids|maigr|mincir|kilos/.test(t)) { add('endurance_aerobie', 0.9); add('force_jambes', 0.5); }
  const activityId = /voie|falaise/.test(t) ? 'climbing_route' : /bloc|escalad|grimp/.test(t) ? 'climbing_boulder' : /cour|km|footing|marathon/.test(t) ? 'running' : /nage|natation|piscine/.test(t) ? 'swimming' : '';
  return { label: text.slice(0, 80), summary: '', activityId, caps: caps.slice(0, 5), indicators: [], steps: [], metricId: /poids|kilos|maigr/.test(t) ? 'body_weight' : '', target: null, weeks: 0, confidence: 'faible',
    missing: ['Une mesure et une cible, si tu en as', ...(caps.length ? [] : ['Ce qu’il faut travailler : coche les capacités'])],
    how: [{ cat: 'fact', text: `Ton texte : « ${text.slice(0, 160)} »` }, { cat: 'rule', text: 'Mots-clés de ton texte reliés aux capacités de l’app (sans assistant).' }] };
}
SUBMIT.goalFicheSave = (f) => {
  const d = S.goalDraft; if (!d) return;
  const fd = new FormData(f), num = (v) => { const n = Number(String(v || '').replace(',', '.')); return String(v || '').trim() !== '' && Number.isFinite(n) ? n : null; };
  const caps = [...fd.entries()].filter(([k, v]) => k.startsWith('cap:') && Number(v) > 0).map(([k, v]) => ({ id: k.slice(4), w: Number(v) })).filter((c) => CAPACITIES[c.id]).slice(0, 6);
  const metricId = ctx().metrics[fd.get('metricId')] ? String(fd.get('metricId')) : '', target = metricId ? num(fd.get('target')) : null, weeks = Math.max(0, Math.min(52, Math.round(num(fd.get('weeks')) || 0)));
  const label = String(fd.get('label') || '').trim().slice(0, 80); if (!label) return toast('Donne un nom à ton objectif.');
  if (!caps.length && !metricId) return toast('Coche au moins une capacité ou choisis une mesure.', 4000);
  const lines = (k, n, len) => String(fd.get(k) || '').split('\n').map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, n);
  const id = 'g-' + uid().slice(0, 12), act = ACTIVITIES[fd.get('activityId')] ? String(fd.get('activityId')) : '';
  const gtype = ['custom', 'metric', 'grade', 'sessions', 'ascents', 'skill'].includes(fd.get('gtype')) ? String(fd.get('gtype')) : 'custom', skillId = SKILLS[fd.get('skillId')] ? String(fd.get('skillId')) : '';
  putItem('goal', id, { type: skillId ? 'skill' : metricId && gtype === 'custom' ? 'metric' : gtype === 'skill' && !skillId ? 'custom' : gtype, skillId, criteria: lines('criteria', 4, 160), exercises: fd.getAll('ex').map(String).filter((x) => byId(x)).slice(0, 8), source: 'ia', label, metricId, target, current: null, unit: metricId ? ctx().metrics[metricId]?.unit || '' : '', caps, activityId: act, status: 'active', startedAt: Date.now(),
    deadline: weeks ? new Date(Date.now() + weeks * 7 * 86400000).toISOString().slice(0, 10) : '', note: [String(fd.get('summary') || '').trim(), ...lines('indicators', 4, 140).map((x) => `📈 ${x}`), ...lines('steps', 5, 160).map((x, k) => `${k + 1}. ${x}`)].join(' · ').slice(0, 300) });
  const back = S.goalBack; S.goalDraft = null; S.goalBack = ''; closeSheet(); toast('Objectif enregistré');
  if (back === 'cp' && S.cp) { S.cp.intentGoal = id; S.cp.goalIds = [...new Set([...(S.cp.goalIds || []), id])]; go('library', 'climbplan'); } else go('profile', 'goals', id);
};
ACT.goalFilter = (el) => { S.filters.goals = el.dataset.id; render(); window.scrollTo(0, 0); };
ACT.goalNew = () => openSheet(goalForm(null), { wide: true });
ACT.goalNewSkill = (el) => { closeSheet(); const s = SKILLS[el.dataset.id]; const ex = ctx().goals.find((g) => g.skillId === el.dataset.id && g.status === 'active'); if (ex) { go('profile', 'goals', ex.id); return; } const id = 'g-' + uid().slice(0, 12); putItem('goal', id, { type: 'skill', skillId: el.dataset.id, label: s.label, status: 'active', startedAt: Date.now() }); toast(`Objectif « ${s.label} » créé`); go('profile', 'goals', id); };
function goalForm(g) {
  const c = ctx(), t = g?.type || S.goalType || 'metric';
  const systems = Object.values(c.systems).filter((s) => !s.archived);
  return h`<h2 style="margin:0">${g ? 'Modifier l’objectif' : 'Nouvel objectif'}</h2><form data-submit="goalSave" class="stack"><input type="hidden" name="id" value="${g?.id || ''}">
    <label>Type<select name="type" data-change="goalType">${[...(g ? [] : [['project', 'Un bloc ou une voie précis (projet d’escalade)']]), ['skill', 'Figure / skill'], ['metric', 'Performance à atteindre'], ['grade', 'Niveau d’escalade'], ['sessions', 'Nombre de séances'], ['ascents', 'Réussites en escalade'], ['custom', 'Autre (valeur manuelle)']].map(([k, l]) => h`<option value="${k}" ${t === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    ${t === 'skill' ? h`<label>Figure<select name="skillId">${Object.entries(SKILLS).map(([id, s]) => h`<option value="${id}" ${g?.skillId === id ? 'selected' : ''}>${s.emoji} ${s.label}</option>`)}</select></label>` : ''}
    ${t === 'metric' ? h`<label>Métrique<select name="metricId" data-pick="yes" data-add="metricNew" data-add-label="Créer une mesure">${metricOptions(Object.entries(c.metrics).filter(([, m]) => m.kind !== 'grade'), g?.metricId)}</select></label>${numberField('target', 'Valeur visée', g?.target ?? '', { required: true })}` : ''}
    ${t === 'grade' ? h`<label>Discipline<select name="metricId"><option value="max_bloc" ${g?.metricId !== 'max_voie' ? 'selected' : ''}>Bloc</option><option value="max_voie" ${g?.metricId === 'max_voie' ? 'selected' : ''}>Voie</option></select></label><label>Système<select name="systemId" data-change="goalSys">${systems.map((s) => h`<option value="${s.id}" ${(g?.gradeTarget?.systemId || S.goalSys || 'font') === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label><label>Niveau visé<select name="levelId">${sortedLevels(c.systems[g?.gradeTarget?.systemId || S.goalSys || 'font']).map((l) => h`<option value="${l.id}" ${g?.gradeTarget?.levelId === l.id ? 'selected' : ''}>${l.label}</option>`)}</select></label>` : ''}
    ${['sessions', 'ascents', 'custom'].includes(t) ? h`<label>Nom<input name="label" maxlength="80" value="${g?.label || ''}" required placeholder="${t === 'sessions' ? '3 séances par semaine pendant 1 mois' : 'Mon objectif'}"></label>${numberField('target', 'Cible', g?.target ?? '', { required: true })}${t === 'custom' ? numberField('current', 'Valeur actuelle', g?.current ?? 0) : ''}` : ''}
    ${['metric', 'grade', 'skill'].includes(t) ? h`<label>Nom (facultatif)<input name="label" maxlength="80" value="${g?.label || ''}"></label>` : ''}
    <label>Échéance (facultatif)<input type="date" name="deadline" value="${g?.deadline || ''}"></label>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button></div></form>`;
}
CHG.goalType = (el) => { if (el.value === 'project') { closeSheet(); setTimeout(() => ACT.projNew(), 120); return; } S.goalType = el.value; openSheet(goalForm(el.form.id.value ? { ...item('goal', el.form.id.value), type: el.value } : null), { wide: true }); };
CHG.goalSys = (el) => { S.goalSys = el.value; const sel = el.form.querySelector('[name=levelId]'); sel.innerHTML = sortedLevels(ctx().systems[el.value]).map((l) => `<option value="${l.id}">${l.label.replace(/[<>&"]/g, '')}</option>`).join(''); };
SUBMIT.goalSave = (f) => {
  const d = Object.fromEntries(new FormData(f)), c = ctx(), prev = d.id ? item('goal', d.id) : null;
  const g = { ...(prev || {}), type: d.type, label: d.label || '', deadline: d.deadline || '', status: prev?.status || 'active', startedAt: prev?.startedAt || Date.now() };
  if (d.type === 'skill') { g.skillId = d.skillId; g.label ||= SKILLS[d.skillId].label; }
  if (d.type === 'metric') { g.metricId = d.metricId; g.target = Number(d.target); g.unit = c.metrics[d.metricId]?.unit || ''; g.label ||= `${c.metrics[d.metricId]?.label} : ${d.target} ${g.unit}`; }
  if (d.type === 'grade') { g.metricId = d.metricId; g.gradeTarget = gradeSnapshot(c.systems[d.systemId], d.levelId); g.label ||= `${d.metricId === 'max_voie' ? 'Voie' : 'Bloc'} ${g.gradeTarget?.label}`; }
  if (['sessions', 'ascents', 'custom'].includes(d.type)) { g.target = Number(d.target); if (d.type === 'custom') g.current = Number(d.current || 0); }
  if (g.target != null && !Number.isFinite(g.target)) { toast('Cible invalide.'); return; }
  const id = d.id || 'g-' + uid().slice(0, 12);
  putItem('goal', id, g); closeSheet(); buzzOk(); toast('Objectif enregistré'); go('profile', 'goals', id);
};
function vGoalDetail(g) {
  const c = ctx(), pr = goalProgress(g, c), tab = S.goalTab || 'overview', sk = SKILLS[g.skillId];
  const secs = [['blockers', '🧱', 'Ce qui bloque', 'Les capacités qui te freinent le plus'], ...(sk ? [['tree', '🪜', 'Progression', 'Les étapes jusqu’à l’objectif'], ['paths', '🛤️', 'Chemins', 'Les façons d’y arriver']] : []), ['strats', '🧭', 'Plusieurs chemins', 'Spécifique, mixte ou préparation physique : compare'], ['graph', '🕸️', 'Graphe', 'Ce qui compte pour cet objectif, en image'], ['whatif', '🔮', 'Et si… ?', 'Ce que ça change si tu progresses sur un point'], ['why', '🤔', 'Pourquoi je stagne ?', 'Les raisons possibles, d’après tes données']];
  return h`<button class="btn sm ghost" data-act="goalBack">‹ Objectifs</button><h2 style="margin:.2em 0">${sk?.emoji || '🎯'} ${goalLabel(g)}</h2>
    <div class="card hero ghero stack"><div class="row between"><b class="big-pct">${pr.pct == null ? '—' : pr.pct + ' %'}</b>${g.deadline ? h`<span class="chip static">📅 ${g.deadline}</span>` : ''}</div>${meter(pr.pct || 0)}<p class="small">${pr.text}</p>
      ${sk ? h`<details class="how mini"><summary>C’est quoi, ${sk.label} ?</summary><p class="small">${sk.desc}</p></details>` : ''}
      ${g.status === 'done' ? h`<p class="small ok-t">🏆 Réussi le ${g.doneAt ? new Date(g.doneAt).toLocaleDateString('fr-FR') : '—'}</p>`
        : (pr.pct ?? 0) >= 100 ? h`<div class="card flat ok-b row"><span class="grow small">🎉 Tu es à 100 % : tu l’as réussi ?</span><button class="btn sm pri" data-act="goalDone" data-id="${g.id}">🏆 Oui !</button></div>` : ''}
      ${g.status === 'done' ? h`<button class="btn pri" data-act="goalNext" data-id="${g.id}">➡️ Objectif suivant</button>` : h`<button class="btn pri" data-act="goalTrain" data-id="${g.id}">🎯 Séance pour cet objectif</button><button class="btn" data-act="goalDone" data-id="${g.id}">🏆 J’ai réussi</button>`}</div>
    <div class="row wrapf"><button class="btn sm" data-act="goalEdit" data-id="${g.id}">✎ Modifier</button>${g.status === 'active' ? h`<button class="btn sm" data-act="goalStatus" data-id="${g.id}" data-v="archived">📦 Archiver</button>` : h`<button class="btn sm" data-act="goalStatus" data-id="${g.id}" data-v="active">↩️ Réactiver</button>`}<button class="btn sm danger" data-act="goalDel" data-id="${g.id}">🗑 Supprimer</button></div>
    ${goalOverview(g)}
    <div class="setmenu secs">${secs.map(([k, ic, t, d]) => h`<details class="setsec" data-id="${k}" ${tab === k ? 'open' : ''}><summary class="setrow"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">›</span></summary><div class="secbody">${tab === k ? ({ blockers: goalBlockers, tree: goalTree, paths: goalPathsV, strats: goalStrats, graph: goalGraph, whatif: goalWhatIf, why: goalWhy })[k](g) : ''}</div></details>`)}</div>`;
}
ACT.goalBack = () => { S.goalTab = 'overview'; go('profile', 'goals'); };
ACT.goalTab = (el) => { S.goalTab = el.dataset.id; render(); };
// Rubriques de l'objectif : une liste qui s'ouvre sur place (plus de barre d'onglets) ; le contenu est construit à l'ouverture.
document.addEventListener('toggle', (e) => { const d = e.target; if (!d.matches?.('details.setsec')) return; if (!d.open) { if (S.goalTab === d.dataset.id) S.goalTab = ''; return; } if (S.goalTab !== d.dataset.id) { S.goalTab = d.dataset.id; render(); } }, true);
ACT.goalOpen = (el) => { closeSheet(); S.goalTab = 'overview'; go('profile', 'goals', el.dataset.id); };
ACT.goalEdit = (el) => { S.goalType = null; openSheet(goalForm(item('goal', el.dataset.id)), { wide: true }); };
// Séance pour cet objectif : l'assistant s'ouvre avec l'objectif déjà coché (et son sport).
ACT.goalTrain = (el) => {
  const g = item('goal', el.dataset.id); if (!g) return; const sport = g.activityId || SKILLS[g.skillId]?.activity || '';
  const prev = S.cp || {}; S.cp = { ...prev, step: 2, aim: 'goals', goalIds: [g.id], ...(sport ? { sport } : {}), result: null, built: null, partsTouched: false };
  go('library', 'climbplan');
};
/* Objectif réussi : daté, dans la progression, performance ajoutée au profil (si on veut), et objectif suivant proposé. */
ACT.goalDone = (el) => {
  const g = item('goal', el.dataset.id); if (!g) return; const perf = donePerf(g);
  openSheet(h`<form data-submit="goalDoneGo" class="stack"><input type="hidden" name="id" value="${g.id}"><h2 style="margin:0">🏆 ${goalLabel(g)}</h2>
    <p class="small">Bravo ! Il sera daté et apparaîtra dans ta progression et dans tes objectifs réussis.</p>
    <label>Réussi le<input type="date" name="day" value="${new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}"></label>
    ${perf ? h`<label class="row"><input type="checkbox" name="perf" checked><span class="small">Enregistrer ${perf.grade ? `${perf.grade.label} comme ${perf.metricId === 'max_voie' ? 'ton max en voie' : 'ton max en bloc'}` : `${perf.value} comme ta performance`} dans ton profil</span></label>` : ''}
    <button class="btn pri big">🏆 C’est réussi</button></form>`);
};
SUBMIT.goalDoneGo = (f) => {
  const d = Object.fromEntries(new FormData(f)), g = item('goal', d.id); if (!g) return;
  const at = d.day ? Math.min(Date.now(), new Date(d.day + 'T12:00:00').getTime()) : Date.now();
  putItem('goal', g.id, { ...g, status: 'done', doneAt: at });
  const perf = d.perf ? donePerf(g, at) : null; if (perf) putItem('perf', 'p-' + uid().slice(0, 12), perf);
  closeSheet(); celebrate?.(); toast('🏆 Objectif réussi !', 3500); render();
  setTimeout(() => ACT.goalNext({ dataset: { id: g.id } }), 900);
};
ACT.goalNext = (el) => {
  const g = item('goal', el.dataset.id); if (!g) return; const ideas = nextGoals(g, ctx());
  openSheet(h`<div class="stack"><h2 style="margin:0">➡️ Et maintenant ?</h2><p class="small muted">Des idées pour continuer, à partir de « ${goalLabel(g)} ».</p>
    ${ideas.length ? h`<div class="setmenu">${ideas.map((x, i) => h`<button class="setrow" data-act="goalNextAdd" data-id="${g.id}" data-i="${i}"><span class="sic">🎯</span><span class="grow"><b>${x.label}</b><small>${x.why}</small></span><span class="chev">＋</span></button>`)}</div>` : ''}
    <button class="btn" data-act="goalNewFrom">＋ Un autre objectif</button><button class="btn ghost" data-act="closeSheet">Plus tard</button></div>`);
};
ACT.goalNextAdd = (el) => { const g = item('goal', el.dataset.id), x = g && nextGoals(g, ctx())[Number(el.dataset.i)]; if (!x) return; const id = 'g-' + uid().slice(0, 12); putItem('goal', id, x.data); closeSheet(); toast('Nouvel objectif ajouté'); go('profile', 'goals', id); };
ACT.goalNewFrom = () => { closeSheet(); go('profile', 'goals'); setTimeout(() => ACT.goalNew?.(), 150); };
ACT.goalStatus = (el) => { const g = item('goal', el.dataset.id); if (!g) return; putItem('goal', g.id, { ...g, status: el.dataset.v, doneAt: el.dataset.v === 'done' ? Date.now() : g.doneAt }); toast(el.dataset.v === 'done' ? 'Bravo ! Objectif atteint 🎉' : 'Objectif mis à jour'); render(); };
ACT.goalDel = async (el) => { const g = item('goal', el.dataset.id); if (g && (await ask(`Supprimer l’objectif « ${goalLabel(g)} » ?`, { danger: true, ok: 'Supprimer' }))) { delItem('goal', g.id); go('profile', 'goals'); } };
function goalOverview(g) {
  const c = ctx(), caps = goalCaps(g, c);
  return h`<div class="card"><h3>Capacités requises</h3>${caps.map((x) => { const st = capacityState(x.id, c); return h`<button class="item pick" data-act="capOpen" data-id="${x.id}"><div class="grow"><b>${capL(x.id)}</b> <span class="tiny muted">poids ${x.w}</span><div>${statusTag(st)} ${st.level != null ? h`<span class="tiny muted">confiance ${confWord(st.confidence)}</span>` : ''}</div></div></button>`; })}</div>
    ${SKILLS[g.skillId] ? h`<div class="card"><h3>📏 Tes repères</h3>${SKILLS[g.skillId].criteria.map((cr) => { const m = c.metrics[cr.metric], p = perfsOf(cr.metric, c).find((x) => !x.unknown); const ratio = p && p.value != null ? Math.min(100, Math.round((m.dir === -1 ? cr.target / p.value : p.value / cr.target) * 100)) : 0; return h`<div class="prow crit"><div class="grow"><div class="row between wrapf"><b class="small">${m.label}</b><span class="tiny nowrap ${p ? '' : 'muted'}">${p ? perfText(p, c) : 'pas noté'} / ${cr.target} ${m.unit === 'reps' ? 'rép.' : m.unit}</span></div><div class="track"><i style="width:${ratio}%"></i></div><details class="how mini"><summary>Pourquoi ce repère ?</summary><p class="tiny">${cr.why} Repère indicatif, pas une garantie.</p></details></div><button class="btn sm ${p ? '' : 'pri'}" data-act="perfAdd" data-id="${cr.metric}">${p ? '＋ Noter' : 'Saisir'}</button></div>`; })}</div>` : ''}`;
}
function goalBlockers(g) {
  const b = blockers(g, ctx());
  return h`<div class="card"><h3>Qu’est-ce qui me bloque ?</h3><p class="tiny muted">${b.note} Confiance globale : ${confWord(b.confidence)}.</p>
    ${b.limiting.length ? h`<b class="small">Capacités potentiellement limitantes</b>${b.limiting.map((x) => h`<div class="card flat"><b>${x.label}</b> <span class="tiny muted">(indice de retard ${x.limit})</span>${x.criteria.map((cr) => h`<p class="small">${cr.label} : ${cr.value == null ? 'non mesuré' : `${cr.value} ${cr.unit || ''} / repère ${cr.target}`}</p>`)}${howBox({ facts: x.state.evidences.map((e) => `[${e.type}] ${e.text}`), missing: x.state.missing })}</div>`)}` : h`<p class="small">Aucune capacité ne ressort comme nettement limitante avec les données disponibles.</p>`}
    ${b.unknown.length ? h`<p class="small"><b>Sans données :</b> ${b.unknown.map((x) => x.label).join(', ')}</p>` : ''}
    ${b.missing.length ? h`<b class="small">Mesures qui manquent</b><ul class="small">${b.missing.map((m) => h`<li>${m}</li>`)}</ul>` : ''}</div>`;
}
function goalTree(g) {
  const m = mastery(g.skillId, ctx());
  return h`<div class="card"><h3>Arbre de progression</h3><p class="tiny muted">États indicatifs : non commencé → découvert → en développement → maîtrisé. Ce n’est pas une vérité scientifique.</p>
    <ol class="tree">${m.steps.map((s) => h`<li class="step ${s.state}"><div class="dot"></div><div class="grow"><b>${s.label}</b> ${tag(MASTERY_WORD[s.state], s.state === 'maitrise' ? 'ok' : s.state === 'developpement' ? 'info' : s.state === 'decouvert' ? 'warn' : '')}<div class="tiny muted">Exercice : ${s.exerciseName} · ${s.how}</div>
      <div class="row wrapf tight"><button class="btn sm" data-act="libInfo" data-id="${s.exercise}">Voir l’exercice</button><button class="btn sm" data-act="perfAdd" data-id="${s.criterion.metric}">Saisir ${s.metricLabel}</button></div></div></li>`)}</ol></div>`;
}
function goalPathsV(g) {
  const paths = goalPaths(g, ctx());
  return h`<div class="card"><h3>Plusieurs chemins possibles</h3><p class="tiny muted">Présentés sans classement : choisis selon ton matériel, ton temps et tes préférences.</p>
    ${paths.map((p) => h`<div class="card flat"><b>${p.label}</b> ${p.compatible ? tag('compatible avec ton matériel', 'ok') : tag('manque : ' + p.missingEq.join(', '), 'warn')}<p class="small">${p.traits}</p><p class="tiny muted">~${p.minutes} min · ${p.perWeek}×/semaine · ${p.exerciseNames.join(', ')}${p.tried ? ` · ${p.tried} exercice(s) déjà pratiqué(s)` : ''}</p>${p.liked.length ? h`<p class="tiny ok-t">Tu aimes : ${p.liked.join(', ')}</p>` : ''}${p.avoided.length ? h`<p class="tiny warn-t">Tu évites : ${p.avoided.join(', ')}</p>` : ''}
      <button class="btn sm" data-act="pathSeance" data-g="${g.id}" data-id="${p.id}" ${p.compatible ? '' : 'disabled'}>Créer la séance de ce chemin</button></div>`)}</div>`;
}
ACT.pathSeance = async (el) => {
  const g = item('goal', el.dataset.g), sk = SKILLS[g?.skillId], p = sk?.paths.find((x) => x.id === el.dataset.id); if (!p) return;
  const nx = normalizeEx;
  const exs = p.exercises.map((id) => byId(id)).filter(Boolean).map((l) => nx({ ...l, id: uid(), libId: l.id, ok: l.cues, bad: l.bad, block: 'main', why: `Chemin « ${p.label} » vers ${sk.label}` }));
  const s = saveSeance({ id: uid(), name: `${sk.label} — ${p.label}`, emoji: sk.emoji, source: 'generated', activity: sk.activity, exercises: exs, context: { goalId: g.id, plannedMin: p.minutes }, objectives: [p.traits] });
  toast('Séance créée'); go('library', 'seance', s.id);
};
function goalStrats(g) {
  const list = strategies({ label: goalLabel(g), activity: g.activityId || Object.keys(ctx().activities)[0], caps: Object.fromEntries(goalCaps(g, ctx()).map((x) => [x.id, x.w])) });
  return h`<p class="tiny muted">Plusieurs façons d’avancer vers « ${goalLabel(g)} ». Aucune n’est « la meilleure » : compare selon ton temps, ton matériel et ta fatigue.</p>
    ${list.map((x) => h`<div class="card flat"><b>${x.title}</b><p class="small">${x.desc}</p><ul class="clean tight tiny"><li>Spécificité : ${x.compare.specificity} · Fatigue : ${x.compare.fatigue} · ${x.compare.minutes}</li><li>Matériel : ${x.compare.equipment.join(', ') || 'aucun particulier'}</li><li>Capacités : ${x.compare.caps.join(', ') || '—'}</li><li>${x.compare.constraints}</li></ul>
      <button class="btn sm" data-act="goalStratGo" data-id="${g.id}" data-s="${x.id}">Créer une séance avec ce chemin</button></div>`)}`;
}
ACT.goalStratGo = (el) => { const g = item('goal', el.dataset.id); if (!g) return; openWizard({ goalIds: [g.id], sport: g.activityId || '', auto: false }); setTimeout(() => { ACT.cpStrat?.(); }, 150); };
function relationCard(g) {
  const m = relationMap({ label: goalLabel(g), caps: goalCaps(g, ctx()), source: g.source }, ctx());
  if (m.empty) return h`<p class="small warn-t">${m.note}</p>`;
  const lab = (id) => m.nodes.find((n) => n.id === id)?.label || id, ic = { cap: '💪', metric: '📏', exercise: '🏋️', activity: '🏅' };
  return h`<details class="how mini"><summary>🔗 Pourquoi ces liens ? (${m.links.length})</summary><ul class="clean tight small">${m.links.map((l) => h`<li>${ic[m.nodes.find((n) => n.id === l.from)?.type] || '🎯'} ${lab(l.from)} → ${ic[m.nodes.find((n) => n.id === l.to)?.type] || ''} ${lab(l.to)}<div class="tiny muted">${l.why}</div></li>`)}</ul></details>`;
}
function goalGraph(g) {
  const gr = graphFromGoal(g, ctx());
  return h`<div class="card"><h3>Objectif → capacités → exercices → métriques</h3><p class="tiny muted">Touche un élément pour explorer dans l’autre sens.</p>
    ${gr.map((x) => h`<div class="graphnode"><button class="btn sm" data-act="capOpen" data-id="${x.capId}">${x.label} (${x.w})</button><div class="graphchildren"><div class="tiny muted">Exercices</div><div class="chips">${x.exercises.map((e) => chip(false, e.name, `data-act="libInfo" data-id="${e.id}"`))}</div><div class="tiny muted">Métriques de suivi</div><div class="chips">${x.metrics.map((m) => chip(false, m.label, `data-act="perfAdd" data-id="${m.id}"`))}</div><div class="tiny muted">Muscles : ${x.muscles.map((m) => m.label).join(', ') || '—'}</div></div></div>`)}</div>${relationCard(g)}`;
}
function goalWhatIf(g) {
  const caps = goalCaps(g, ctx()), cap = S.whatCap || caps[0]?.id, n = S.whatN || 2;
  const w = cap ? whatIf(cap, n, ctx()) : null;
  return h`<div class="card"><h3>Simulation « Et si… ? »</h3><label>Si je travaillais<select data-change="whatCap">${raw(capOptionGroups(caps.map((x) => x.id), cap, capL))}</select></label>
    <div class="chips">${[1, 2, 3, 4].map((k) => chip(n === k, `${k}× / semaine`, `data-act="whatN" data-id="${k}"`))}</div>${w ? h`<p class="small">${w.text}</p><p class="tiny muted">${w.disclaimer}</p>` : ''}</div>`;
}
CHG.whatCap = (el) => { S.whatCap = el.value; render(); };
ACT.whatN = (el) => { S.whatN = Number(el.dataset.id); render(); };
function goalWhy(g) {
  const w = whyNoProgress(g, ctx());
  return h`<div class="card"><h3>Pourquoi je ne progresse pas ?</h3><p class="tiny muted">${w.note}</p>${w.hypotheses.map((x) => h`<details class="win fold2"><summary><b>💡 ${x.title}</b></summary><p class="small">${x.text}</p></details>`)}${howBox({ facts: w.facts, missing: w.missing }, { open: false, title: 'Données utilisées' })}</div>`;
}

/* ═════════ Matériel et environnements ═════════ */
/* Longues listes de mesures : rangées par catégorie (et triées dans le sélecteur). */
const METRIC_GROUPS = [['grade', '🧗 Niveaux d’escalade'], ['doigts', '✋ Doigts'], ['haut', '💪 Haut du corps'], ['gainage', '🧱 Gainage'], ['jambes', '🦵 Jambes et explosivité'], ['souplesse', '🤸 Souplesse'], ['course', '🏃 Course'], ['natation', '🏊 Natation'], ['corps', '⚖️ Corps'], ['perso', '✍️ Mes mesures'], ['autre', '📏 Autres']];
export function metricGroup(id, m) {
  const caps = Object.keys(m.caps || {}), has = (re) => caps.some((c) => re.test(c));
  if (!m.native) return 'perso';
  if (m.kind === 'grade') return 'grade';
  if ((m.acts || []).includes('running')) return 'course';
  if ((m.acts || []).includes('swimming')) return 'natation';
  if (/^body_|poids|taille/.test(id)) return 'corps';
  if (has(/doigts|pince/)) return 'doigts';
  if (has(/^mobilite/)) return 'souplesse';
  if (has(/^gainage/)) return 'gainage';
  if (has(/jambes|explosivite|chaine_posterieure/)) return 'jambes';
  if (has(/tirage|poussee|blocage|scapulaire|epaules/)) return 'haut';
  return 'autre';
}
function metricOptions(list, selected) {
  const by = new Map(METRIC_GROUPS.map(([k]) => [k, []]));
  for (const [id, x] of list) by.get(metricGroup(id, x))?.push([id, x]);
  return h`${METRIC_GROUPS.filter(([k]) => by.get(k).length).map(([k, l]) => h`<optgroup label="${l}">${by.get(k).sort((a, b) => a[1].label.localeCompare(b[1].label, 'fr')).map(([id, x]) => h`<option value="${id}" ${id === selected ? 'selected' : ''}>${x.label}</option>`)}</optgroup>`)}`;
}
/** Contexte d'une mesure : le lieu précis (salle ou falaise) et le secteur. */
function perfContext(d) {
  const env = ctx().envs.find((e) => e.id === d.ctxEnv);
  if (env) return { env: env.id, kind: kindOfEnv(env) === 'falaise' ? 'falaise' : 'salle', place: String(d.ctxSector || '').trim().slice(0, 60) };
  return { kind: ['salle', 'falaise'].includes(d.ctxEnv) ? d.ctxEnv : '', place: String(d.ctxSector || '').trim().slice(0, 60) };
}
/* ═════════ Mes lieux : salles, falaises (et secteurs), maison… et ce que tu y as fait ═════════ */
function vEquipment() {
  const c = ctx(), un = new Set(item('config', 'equipment')?.unavailable || []);
  if (S.param) { const e = c.envs.find((x) => x.id === S.param); if (e) return vPlaceDetail(e); }
  const groups = allPlaces(c.envs, c);
  return h`<div class="row wrapf"><button class="btn pri" data-act="envNewGym">🏢 ＋ Salle d’escalade</button><button class="btn" data-act="envNewCrag">🌄 ＋ Falaise</button><button class="btn" data-act="envNew">＋ Autre lieu</button></div>
    ${groups.length ? groups.map((g) => h`<span class="kicker">${KIND_LABEL[g.kind][0]} ${KIND_LABEL[g.kind][1]}</span><div class="setmenu">${g.places.map(({ env: e, stats: st }) => h`<button class="setrow" data-act="placeOpen" data-id="${e.id}"><span class="sic">${KIND_LABEL[kindOfEnv(e)][0]}</span><span class="grow"><b>${e.name}</b>${c.defEnv?.id === e.id ? h` <span class="tag ok">par défaut</span>` : ''}<small>${placeLine(e, st)}</small></span><span class="chev">›</span></button>`)}</div>`)
      : empty('Aucun lieu pour l’instant. Ajoute ta salle, ta falaise ou ta maison : l’app adapte les séances à leur matériel et garde ce que tu y fais.')}
    <div class="card"><h3>Indisponible aujourd’hui</h3><p class="tiny muted">Une barre prise, pas de poutre ? Décoche-le : les séances générées s’adaptent et expliquent les remplacements.</p>
      <div class="chips">${[...new Set(c.envs.flatMap((e) => e.equipment))].map((k) => chip(!un.has(k), EQUIPMENT[k] || k, `data-act="eqToggle" data-id="${k}"`))}</div>${un.size ? h`<button class="btn sm" data-act="eqReset">Tout est disponible</button>` : ''}</div>`;
}
const placeLine = (e, st) => [e.city, st.sessions.length ? `${st.sessions.length} séance(s)` : '', st.ascents.length ? `${st.sent} bloc(s)/voie(s) réussi(s)` : '', st.bestBloc ? `max bloc ${st.bestBloc}` : '', st.bestVoie ? `max voie ${st.bestVoie}` : '', st.last ? `dernière fois ${relDate(st.last)}` : '', !st.count ? 'rien d’enregistré ici pour l’instant' : ''].filter(Boolean).join(' · ');
function vPlaceDetail(e) {
  const c = ctx(), st = placeStats(e.id, c, e.name), sys = e.gradeSys && c.systems[e.gradeSys];
  const asc = (a) => h`<div class="item"><span class="gpill">${a.grade?.label || a.gradeText || '?'}</span><div class="grow"><b>${a.name || (a.kind === 'voie' ? 'Voie' : 'Bloc')}</b><div class="tiny muted">${fmtDay(a.date)} · ${({ flash: '⚡ flash', send: '✓ réussi', work: '💪 après travail', top: '✓ réussi', attempt: '… essayé', fail: '✗' })[a.result] || ''}</div></div></div>`;
  return h`<div class="row"><button class="btn sm" data-act="placeBack" aria-label="Retour">‹</button><h2 class="grow" style="margin:0">${KIND_LABEL[kindOfEnv(e)][0]} ${e.name}</h2></div>
    <div class="card"><p class="small">${ENV_TYPES[e.type] || e.type}${e.city ? ` · ${e.city}` : ''}${sys ? ` · cotation ${sys.name}` : ''}</p>
      ${e.equipment?.length && e.type !== 'falaise' ? h`<p class="tiny muted">🧰 ${e.equipment.map((k) => EQUIPMENT[k] || k).join(', ')}</p>` : ''}
      ${e.sectors?.length ? h`<p class="tiny muted">📌 Secteurs : ${e.sectors.join(', ')}</p>` : ''}
      <div class="row wrapf"><button class="btn pri" data-act="placeTrain" data-id="${e.id}">✨ Créer une séance ici</button>${['escalade', 'falaise'].includes(e.type) ? h`<button class="btn" data-act="placeLog" data-id="${e.id}">🧗 Noter un bloc / une voie ici</button>` : ''}
        <button class="btn" data-act="envEdit" data-id="${e.id}">✎ Modifier</button>${c.defEnv?.id === e.id ? '' : h`<button class="btn" data-act="envDefault" data-id="${e.id}">Par défaut</button>`}</div></div>
    <div class="kpis">${[['🏋️', 'Séances', st.sessions.length], ['⏱', 'Minutes', st.minutes], ['🧗', 'Réussis', st.sent], ...(st.bestBloc ? [['🪨', 'Max bloc', st.bestBloc]] : []), ...(st.bestVoie ? [['🧗', 'Max voie', st.bestVoie]] : [])].map(([ic, l, v]) => h`<div class="kpi"><span>${ic}</span><b>${v}</b><small>${l}</small></div>`)}</div>
    ${st.sectors.length ? st.sectors.map((sec) => h`<section class="card"><h3>${sec.name ? `📌 ${sec.name}` : st.sectors.length > 1 ? 'Sans secteur' : 'Blocs et voies'} <span class="tiny muted">${sec.sent}/${sec.list.length} réussi(s)</span></h3>${sec.list.slice(0, 12).map(asc)}</section>`) : ''}
    ${st.sessions.length ? h`<section class="card"><h3>Séances faites ici</h3>${st.sessions.slice(0, 15).map((x) => h`<div class="item"><div class="grow"><b>${x.sessionName}</b><div class="tiny muted">${fmtDay(x.startedAt)} · ${Math.round((x.durationSeconds || 0) / 60)} min</div></div></div>`)}</section>` : ''}
    ${!st.count ? empty('Rien d’enregistré ici pour l’instant. Crée une séance ici, ou note un bloc / une voie : tout apparaîtra sur cette page.') : ''}`;
}
ACT.placeOpen = (el) => go('profile', 'equipment', el.dataset.id);
ACT.placeBack = () => go('profile', 'equipment');
ACT.placeTrain = (el) => { S.cp = { ...(S.cp || {}), envId: el.dataset.id, step: 2, result: null, built: null, partsTouched: false }; go('library', 'climbplan'); };
ACT.placeLog = (el) => { S.aqEnvPreset = el.dataset.id; ACT.ascQuick?.(); };
function envForm(e) {
  const t = e?.type || S.envType || 'maison', eq = new Set(e?.equipment || ENV_TEMPLATES[t] || []);
  const eqChips = (name, keys, sel) => h`<div class="chips">${keys.map((k) => h`<label class="chip ${sel.has(k) ? 'on' : ''}"><input type="checkbox" class="hidden" name="${name}" value="${k}" ${sel.has(k) ? 'checked' : ''} data-change="chipToggle">${EQUIPMENT[k] || k}</label>`)}</div>`;
  const head = h`<div class="grid2"><label>Nom<input name="name" required maxlength="60" value="${e?.name || ENV_TYPES[t]}" placeholder="${t === 'escalade' ? 'Ex. Arkose Montreuil' : ''}"></label><label>Type<select name="type" data-change="envType">${Object.entries(ENV_TYPES).map(([k, l]) => h`<option value="${k}" ${t === k ? 'selected' : ''}>${l}</option>`)}</select></label></div>`;
  let body;
  if (t === 'escalade') {
    // Salle d'escalade précise : sa cotation, ses espaces et le matériel de chaque espace.
    const c = ctx(), areas = new Map((e?.areas || []).map((a) => [a.id, a])), on = (id) => (e?.areas?.length ? areas.has(id) : ['bloc', 'entrainement'].includes(id));
    const systems = Object.values(c.systems).filter((x) => !x.archived);
    body = h`<label>Ville <span class="tiny muted">(facultatif)</span><input name="city" maxlength="60" value="${e?.city || ''}"></label>
      <label>Cotation de la salle</label><div class="row wrapf"><select name="gradeSys" class="grow"><option value="">Fontainebleau / française</option>${systems.filter((x) => !x.builtin || x.global).map((x) => h`<option value="${x.id}" ${e?.gradeSys === x.id ? 'selected' : ''}>${x.name}</option>`)}</select><button class="btn sm" type="button" data-act="sysNew">＋ Créer (U1 → U8+, couleurs…)</button></div>
      <label>Les espaces de la salle et leur matériel</label>
      ${Object.entries(GYM_AREAS).map(([id, [ic, label, sugg]]) => { const a = areas.get(id), sel = new Set(a?.items || (e ? [] : sugg.slice(0, 2))); const keys = [...new Set([...sugg, ...sel])]; return h`<div class="card flat garea"><label class="chk"><input type="checkbox" name="areaOn" value="${id}" ${on(id) ? 'checked' : ''}> <b>${ic} ${label}</b></label>${eqChips('ar_' + id, keys, sel)}<input name="arn_${id}" maxlength="120" value="${a?.note || ''}" placeholder="Précision (facultatif) : ex. poutre Beastmaker 2000"></div>`; })}`;
  } else if (t === 'falaise') {
    const c = ctx(), systems = Object.values(c.systems).filter((x) => !x.archived);
    body = h`<label>Région ou ville <span class="tiny muted">(facultatif)</span><input name="city" maxlength="60" value="${e?.city || ''}" placeholder="Ex. Fontainebleau, Céüse"></label>
      <label>Cotation utilisée<select name="gradeSys"><option value="">Fontainebleau / française</option>${systems.filter((x) => !x.builtin).map((x) => h`<option value="${x.id}" ${e?.gradeSys === x.id ? 'selected' : ''}>${x.name}</option>`)}</select></label>
      <label>Secteurs <span class="tiny muted">(un par ligne : tu les choisiras en notant tes blocs et tes voies)</span><textarea name="sectors" rows="4" placeholder="Ex. Bas Cuvier&#10;Apremont&#10;Secteur des dalles">${(e?.sectors || []).join('\n')}</textarea></label>`;
  } else { const grouped = new Set(EQUIPMENT_GROUPS.flatMap(([, k]) => k)), rest = Object.keys(EQUIPMENT).filter((k) => !grouped.has(k));
    body = h`<label>Matériel disponible</label><p class="tiny muted">« Machines de musculation (toutes) » suffit pour une salle classique ; sinon coche machine par machine.</p>
      ${EQUIPMENT_GROUPS.map(([t, keys]) => h`<span class="kicker">${t}</span>${eqChips('eq', keys.filter((k) => EQUIPMENT[k]), eq)}`)}${rest.length ? h`<span class="kicker">Autre</span>${eqChips('eq', rest, eq)}` : ''}`; }
  return h`<h2 style="margin:0">${e ? 'Modifier' : t === 'escalade' ? 'Nouvelle salle d’escalade' : t === 'falaise' ? 'Nouvelle falaise' : 'Nouveau lieu'}</h2><form data-submit="envSave" class="stack"><input type="hidden" name="id" value="${e?.id || ''}">
    ${head}${body}
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${e ? h`<button class="btn danger" type="button" data-act="envDel" data-id="${e.id}">Supprimer</button>` : ''}</div></form>`;
}
ACT.envNew = () => { S.envType = 'maison'; openSheet(envForm(null), { wide: true }); };
ACT.envNewGym = () => { S.envType = 'escalade'; openSheet(envForm(null), { wide: true }); };
ACT.envNewCrag = () => { S.envType = 'falaise'; openSheet(envForm(null), { wide: true }); };
ACT.envEdit = (el) => { const e = item('env', el.dataset.id); if (e) openSheet(envForm(e), { wide: true }); };
CHG.envType = (el) => { if (!el.form.id.value) { S.envType = el.value; openSheet(envForm(null), { wide: true }); } };
SUBMIT.envSave = (f) => {
  const fd = new FormData(f), d = Object.fromEntries(fd), first = !ctx().envs.length;
  const base = { name: d.name, type: d.type, isDefault: d.id ? item('env', d.id)?.isDefault : first };
  if (d.type === 'escalade') {
    const areas = fd.getAll('areaOn').filter((id) => GYM_AREAS[id]).map((id) => ({ id, items: fd.getAll('ar_' + id), note: String(fd.get('arn_' + id) || '') }));
    putItem('env', d.id || 'env-' + uid().slice(0, 12), { ...base, city: d.city || '', gradeSys: d.gradeSys || '', areas, equipment: [...new Set(areas.flatMap((a) => a.items))] });
  } else if (d.type === 'falaise') {
    const sectors = [...new Set(String(d.sectors || '').split('\n').map((x) => x.trim()).filter(Boolean))].slice(0, 30);
    putItem('env', d.id || 'env-' + uid().slice(0, 12), { ...base, city: d.city || '', gradeSys: d.gradeSys || '', sectors, equipment: ['wall'] });
  } else putItem('env', d.id || 'env-' + uid().slice(0, 12), { ...base, equipment: fd.getAll('eq') });
  closeSheet(); buzzOk(); toast({ escalade: 'Salle enregistrée', falaise: 'Falaise enregistrée' }[d.type] || 'Lieu enregistré'); render();
};
ACT.envDel = async (el) => { const e = item('env', el.dataset.id); if (e && (await ask(`Supprimer « ${e.name} » ?`, { danger: true, ok: 'Supprimer' }))) { delItem('env', e.id); closeSheet(); render(); } };
ACT.envDefault = (el) => { putItem('config', 'main', { ...(item('config', 'main') || {}), envId: el.dataset.id }); toast(`📍 ${item('env', el.dataset.id)?.name || 'Lieu'} : c’est ton lieu par défaut`); render(); };
ACT.eqToggle = (el) => { const conf = item('config', 'equipment') || {}, un = new Set(conf.unavailable || []); un.has(el.dataset.id) ? un.delete(el.dataset.id) : un.add(el.dataset.id); putItem('config', 'equipment', { ...conf, unavailable: [...un] }); render(); };
ACT.eqReset = () => { putItem('config', 'equipment', { unavailable: [] }); render(); };

/* ═════════ Préférences, habitudes, zones à ménager ═════════ */
function vPrefs() {
  const c = ctx(), learned = learnedPreferences(c).slice(0, 25), hb = habits(c), av = S.settings.avoid || {};
  return h`<div class="card"><h3>Mes préférences d’exercices</h3><p class="tiny muted">« Évite » réduit la probabilité qu’un exercice soit proposé, sans jamais supprimer un exercice indispensable à ton objectif (dans ce cas, il est gardé avec une explication).</p>
      ${Object.values(c.prefs).length ? Object.values(c.prefs).map((p) => h`<div class="item"><div class="grow"><b>${p.label || p.key}</b><div class="tiny muted">${p.reason || ({ explicit: 'choix explicite', habit: 'habitude confirmée', questionnaire: 'questionnaire' })[p.source]}</div></div>${prefChips(p.key, p.label, p.value)}</div>`) : h`<p class="muted small">Aucune préférence enregistrée.</p>`}</div>
    <div class="card"><h3>Ce que l’application observe</h3>${learned.length ? learned.map((x) => h`<div class="item"><div class="grow"><b>${x.name}</b><div class="tiny muted">${x.text || '—'}</div>${x.suggestion ? h`<div class="tiny acc-t">Suggestion : ${x.suggestion === 'evite' ? 'l’éviter' : 'le marquer comme apprécié'} ?</div>` : ''}</div>${prefChips(x.key, x.name, x.explicit)}</div>`) : h`<p class="muted small">Pas encore de données.</p>`}</div>
    ${(() => { const f = estimatedFormats(c), prefs = Object.fromEntries(itemsOf('pref').map((p) => [p.key, p.value])); return h`<div class="card"><h3>Tes habitudes de séance (estimées)</h3>${f.insufficient ? h`<p class="small muted">⚠️ Données insuffisantes : quelques séances de plus et l’app pourra estimer tes durées, lieux et intensités habituels.</p>` : f.items.length ? f.items.map((x) => h`<div class="item"><div class="grow"><b>${x.label}</b><div class="tiny muted">Pourquoi : ${x.why}</div>${prefs[x.key] ? h`<div class="tiny ${prefs[x.key] === 'aime' ? 'ok-t' : 'muted'}">${prefs[x.key] === 'aime' ? '✓ Confirmé par toi' : '✗ Corrigé : ce n’est pas une préférence'}</div>` : ''}</div><button class="btn sm" data-act="prefSet" data-k="${x.key}" data-l="${x.label}" data-v="aime" aria-label="C’est juste">👍</button><button class="btn sm" data-act="prefSet" data-k="${x.key}" data-l="${x.label}" data-v="neutre" aria-label="Pas vraiment">✗</button></div>`) : h`<p class="small muted">Rien de régulier pour l’instant.</p>`}<p class="tiny muted">Corrige ce qui est faux : l’app ne s’en servira pas.</p></div>`; })()}
    <div class="card"><h3>Habitudes détectées</h3>${hb.length ? hb.map((x) => h`<div class="item"><div class="grow small">${x.text}</div>${x.proposal ? h`<button class="btn sm pri" data-act="habitYes" data-k="${x.key}">Oui</button><button class="btn sm" data-act="habitNo" data-k="${x.key}">Non</button>` : ''}</div>`) : h`<p class="muted small">Aucune habitude marquée pour l’instant.</p>`}</div>
    <form data-submit="avoidSave" class="card"><h3>Zones à ménager</h3><p class="tiny muted">Réglage personnel pris en compte par le générateur (pas un diagnostic).</p>${[['fingers', 'Doigts / poulies'], ['shoulders', 'Épaules'], ['elbows', 'Coudes'], ['knees', 'Genoux / chevilles']].map(([k, l]) => h`<label class="chk"><input type="checkbox" name="${k}" ${av[k] ? 'checked' : ''}> ${l}</label>`)}
      ${numberField('years', 'Années de pratique de l’escalade (facultatif)', S.settings.level?.years ?? '', { min: 0, max: 80, step: 0.5 })}<button class="btn pri" type="submit">Enregistrer</button></form>`;
}
const prefChips = (key, label, cur) => h`<div class="row tight">${[['aime', '👍'], ['neutre', '😐'], ['evite', '👎']].map(([v, e]) => h`<button class="btn sm ic ${cur === v ? 'pri' : ''}" data-act="prefSet" data-k="${key}" data-l="${label}" data-v="${v}" aria-label="${v}">${e}</button>`)}</div>`;
ACT.prefSet = (el) => { putItem('pref', 'x-' + el.dataset.k.replace(/[^\w-]/g, '_').slice(0, 60), { key: el.dataset.k, label: el.dataset.l, value: el.dataset.v, source: 'explicit' }); render(); };
SUBMIT.avoidSave = (f) => { const d = Object.fromEntries(new FormData(f)); S.settings.avoid = Object.fromEntries(['fingers', 'shoulders', 'elbows', 'knees'].map((k) => [k, !!d[k]])); S.settings.level = { ...(S.settings.level || {}), years: d.years === '' ? null : Number(d.years) }; saveSettings(); buzzOk(); toast('Enregistré'); render(); };

/* ═════════ Profil public et communauté ═════════ */
export async function loadSocial() {
  const so = S.social; so.error = ''; so.loading = true; render();
  try { so.me = await api('GET', '/api/social/me'); so.feed = await api('GET', '/api/social/feed?tz=' + new Date().getTimezoneOffset()); const [mine, links] = await Promise.all([api('GET', '/api/shared?scope=public&mine=1'), api('GET', '/api/shared?scope=link&mine=1')]); so.mine = mine.items; so.links = links.items; }
  catch (e) { so.error = e.offline ? 'Connexion requise pour le partage.' : e.message; }
  so.loading = false; render();
}
function vPublic() {
  if (S.user.guest) return h`<div class="card acc-b"><h3>🔒 Compte nécessaire</h3><p class="small">Le profil public et le partage demande un compte gratuit. En le créant, tout ce que tu as fait en mode invité est conservé.</p><button class="btn pri" data-act="guestUpgrade">Créer mon compte</button></div>`;
  const so = S.social, c = ctx();
  if (!so.me && !so.loading && !so.error) setTimeout(loadSocial, 0);
  if (so.error && !so.me) return h`<div class="card flat"><p class="err">${so.error}</p><button class="btn" data-act="socReload">Réessayer</button></div>`;
  if (!so.me) return skeleton(2);
  const p = so.me.profile, sh = p.share || {};
  const sel = (key, id) => (sh[key] || []).includes(id);
  const states = profileCapacities(c).filter((s) => s.level != null);
  return h`<form data-submit="socSave" class="card"><h3>Mon profil public</h3><p class="tiny muted">Privé par défaut. Seules les informations cochées ici sont visibles, et uniquement selon la visibilité choisie.</p>
      <label>Visibilité<select name="visibility"><option value="private" ${p.visibility === 'private' ? 'selected' : ''}>Privé (personne)</option><option value="followers" ${p.visibility === 'followers' ? 'selected' : ''}>Abonnés acceptés</option><option value="public" ${p.visibility === 'public' ? 'selected' : ''}>Public</option></select></label>
      <label>Présentation<textarea name="bio" maxlength="500">${p.bio}</textarea></label>
      <label class="chk"><input type="checkbox" name="shareStats" ${p.shareStats ? 'checked' : ''}> Statistiques (séances, régularité)</label><label class="chk"><input type="checkbox" name="shareRecords" ${p.shareRecords ? 'checked' : ''}> Records des séances</label><label class="chk"><input type="checkbox" name="shareSessions" ${p.shareSessions ? 'checked' : ''}> Dernières séances réalisées</label>
      <details class="how mini share"><summary>Activités partagées</summary><div class="chips">${Object.values(c.activities).map((a) => h`<label class="chip ${sel('activities', a.itemId) ? 'on' : ''}"><input type="checkbox" class="hidden" name="activities" value="${a.itemId}" ${sel('activities', a.itemId) ? 'checked' : ''} data-change="chipToggle">${a.label}</label>`)}</div></details>
      <details class="how mini share"><summary>Objectifs partagés</summary><div class="chips">${c.goals.map((g) => h`<label class="chip ${sel('goals', g.id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="goals" value="${g.id}" ${sel('goals', g.id) ? 'checked' : ''} data-change="chipToggle">${goalLabel(g)}</label>`)}</div></details>
      <details class="how mini share"><summary>Performances partagées</summary><div class="chips">${c.perfs.filter((x) => !x.unknown).slice(0, 40).map((x) => h`<label class="chip ${sel('perfs', x.id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="perfs" value="${x.id}" ${sel('perfs', x.id) ? 'checked' : ''} data-change="chipToggle">${c.metrics[x.metricId]?.label || 'Perf'} : ${perfText(x, c)}</label>`)}</div></details>
      <details class="how mini share"><summary>Capacités partagées</summary><div class="chips">${states.map((s) => h`<label class="chip ${(sh.caps || []).some((x) => x.id === s.capId) ? 'on' : ''}"><input type="checkbox" class="hidden" name="caps" value="${s.capId}" ${(sh.caps || []).some((x) => x.id === s.capId) ? 'checked' : ''} data-change="chipToggle">${s.label}</label>`)}</div></details>
      <button class="btn pri" type="submit">Enregistrer mes choix de partage</button>
      <p class="tiny muted">Lien public (si visibilité publique) : ${location.origin}/#/profile/public/${S.user.username}</p></form>
    <div class="card"><h3>Mes séances publiques</h3>${(so.mine || []).length ? so.mine.map((x) => h`<div class="item"><div class="grow"><b>${x.title}</b><div class="tiny muted">${x.exerciseCount} exercices · modifiée ${relDate(x.updatedAt)}</div></div><button class="btn danger sm" data-act="pubDel" data-id="${x.id}">Retirer</button></div>`) : h`<p class="muted small">Publie une séance depuis son écran (bouton « Partager »).</p>`}</div>
    ${(so.links || []).length ? h`<div class="card"><h3>🔗 Mes liens de partage</h3><p class="tiny muted">Seules les personnes qui ont le lien voient ces séances. Retire un lien quand tu veux.</p>${so.links.map((x) => h`<div class="item"><div class="grow"><b>${x.title}</b><div class="tiny muted">${x.exerciseCount} exercices · créé ${relDate(x.createdAt || x.updatedAt)}</div></div><button class="btn sm" data-act="shShow" data-id="${x.id}" data-name="${x.title}">QR</button><button class="btn danger sm" data-act="pubDel" data-id="${x.id}">Retirer</button></div>`)}</div>` : ''}
    ${so.me.pending.length ? h`<div class="card"><h3>Demandes d’abonnement</h3>${so.me.pending.map((r) => h`<div class="item"><div class="grow"><b>${r.username}</b></div><button class="btn pri sm" data-act="socRespond" data-id="${r.id}" data-accept="1">Accepter</button><button class="btn sm" data-act="socRespond" data-id="${r.id}" data-accept="">Refuser</button></div>`)}</div>` : ''}
    <div class="card"><h3>Trouver quelqu’un</h3><input type="search" data-input="socSearch" placeholder="Pseudo (2 lettres minimum)" aria-label="Chercher un pseudo" autocomplete="off"><div id="socResults"></div></div>
    <h2>Profils suivis</h2>${so.feed?.people?.length ? so.feed.people.map(vPerson) : empty('Tu ne suis personne, ou ils n’ont rien partagé.')}`;
}
function vPerson(u) {
  return h`<div class="card"><div class="row"><div class="ico">👤</div><div class="grow"><b>${u.username}</b>${u.bio ? h`<div class="small">${u.bio}</div>` : ''}</div><button class="btn sm" data-act="socUnfollow" data-user="${u.username}">Ne plus suivre</button></div>
    ${u.activities?.length ? h`<p class="small">${u.activities.map((a) => a.emoji + ' ' + a.label).join(' · ')}</p>` : ''}${u.goals?.length ? h`<p class="small">🎯 ${u.goals.map((g) => g.label).join(', ')}</p>` : ''}${u.perfs?.length ? h`<p class="small">📏 ${u.perfs.map((p) => `${p.label} : ${p.text}`).join(' · ')}</p>` : ''}${u.caps?.length ? h`<p class="small">🧭 ${u.caps.map((x) => `${x.label} (${x.status})`).join(', ')}</p>` : ''}
    ${u.stats ? h`<p class="small">${u.stats.sessions30} séance(s) sur 30 jours · ${u.stats.minutes30} min</p>` : ''}
    ${u.sessions?.length ? h`<b class="small">Séances publiques</b>${u.sessions.map((x) => h`<div class="item"><div class="grow"><b>${x.title}</b><div class="tiny muted">${x.exerciseCount} exercices</div></div><button class="btn sm" data-act="pubCopy" data-id="${x.id}">Enregistrer</button></div>`)}` : ''}</div>`;
}
ACT.socReload = () => loadSocial();
SUBMIT.socSave = async (f) => {
  const fd = new FormData(f), d = Object.fromEntries(fd), c = ctx();
  const caps = fd.getAll('caps').map((id) => { const s = capacityState(id, c); return { id, label: s.label, status: STATUS_WORD[s.status] }; });
  try { await api('POST', '/api/social/profile', { visibility: d.visibility, bio: d.bio, shareStats: !!d.shareStats, shareRecords: !!d.shareRecords, shareSessions: !!d.shareSessions, share: { activities: fd.getAll('activities'), goals: fd.getAll('goals'), perfs: fd.getAll('perfs'), caps } }); buzzOk(); toast('Choix de partage enregistrés'); loadSocial(); }
  catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
INPUT.socSearch = (el) => {
  clearTimeout(INPUT.socSearch.t);
  INPUT.socSearch.t = setTimeout(async () => {
    const box = $('#socResults'); if (!box) return; const q = el.value.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    try { const r = await api('GET', '/api/social/search?q=' + encodeURIComponent(q)); box.innerHTML = h`${r.users.length ? r.users.map((u) => h`<div class="item"><div class="grow"><b>${u.username}</b> ${tag(u.visibility === 'public' ? 'public' : 'sur validation')}</div>${u.relation === 'accepted' ? h`<span class="small">✓ suivi</span>` : u.relation === 'pending' ? h`<span class="small">⏳</span>` : h`<button class="btn pri sm" data-act="socFollow" data-user="${u.username}">Suivre</button>`}</div>`) : h`<p class="muted small">Personne trouvé.</p>`}`.s; }
    catch (e) { box.innerHTML = h`<p class="err small">${e.offline ? 'Connexion requise.' : e.message}</p>`.s; }
  }, 350);
};
ACT.socFollow = async (el) => { try { const r = await api('POST', '/api/social/follow', { username: el.dataset.user }); toast(r.status === 'accepted' ? 'Abonné' : 'Demande envoyée'); loadSocial(); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); } };
ACT.socUnfollow = async (el) => { try { await api('POST', '/api/social/unfollow', { username: el.dataset.user }); loadSocial(); } catch (e) { toast(e.message); } };
ACT.socRespond = async (el) => { try { await api('POST', '/api/social/respond', { id: el.dataset.id, accept: !!el.dataset.accept }); loadSocial(); } catch (e) { toast(e.message); } };
ACT.pubDel = async (el) => { if (!(await ask('Retirer cette séance partagée ? Le lien et le QR code ne marcheront plus.', { danger: true, ok: 'Retirer' }))) return; try { await api('DELETE', `/api/shared/${encodeURIComponent(el.dataset.id)}`); loadSocial(); } catch (e) { toast(e.message); } };
ACT.pubCopy = async (el) => {
  try {
    const r = await api('GET', `/api/public/s/${encodeURIComponent(el.dataset.id)}`);
    const now = Date.now(), src = normalizeSession(r.item.session);
    const s = saveSeance({ ...src, id: uid(), name: r.item.title, source: 'copy', exercises: src.exercises.map((e) => ({ ...e, id: uid(), note: '' })), origin: { kind: 'public', id: r.item.id, author: r.item.author || '', copiedAt: now }, createdAt: now, updatedAt: now });
    toast('Copie indépendante enregistrée'); go('library', 'seance', s.id);
  } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); }
};

/* ═════════ Mon bilan physique : ce que l'app sait de ta condition, selon TES objectifs ═════════ */
const STATE_TXT = (r) => (r.state === 'known' ? `${r.value} · ${r.source}${r.age ? ` · il y a ${r.age} j` : ''}` : r.state === 'old' ? `${r.value} · il y a ${r.age} j (à refaire)` : r.state === 'unknown' ? 'tu ne sais pas encore' : 'jamais mesuré');
/** Carte d'accueil du profil : part des repères utiles connus, et un accès direct aux tests. */
function bilanCard(a) {
  if (!a.total) return h`<section class="card flat row"><span class="grow small">🩺 Choisis ce que tu veux (progresser, être plus fort, plus endurant…) : l’app te dira quoi mesurer.</span><button class="btn sm pri" data-act="profSub" data-id="goals">Choisir</button></section>`;
  if (a.known === a.total) return '';
  return h`<button class="card pick" data-act="profSub" data-id="bilan"><div class="row between"><b>🩺 Mon bilan physique</b><span class="tiny muted">${a.known}/${a.total}</span></div>${meter(a.coverage)}
    <small class="tiny muted" style="display:block">L’app connaît ${a.known} des ${a.total} repères utiles pour tes objectifs. ${a.todo.length} test${a.todo.length > 1 ? 's' : ''} simple${a.todo.length > 1 ? 's' : ''} pour des séances plus justes ›</small></button>`;
}
function vBilan() {
  const c = ctx(), a = assessment(c), f = conditionFacts(a), sugg = suggestedGoals(c), guided = guidedTests(c);
  if (!a.envies.length && !a.total) return h`<div class="card stack"><p class="small">Dis d’abord ce que tu veux : l’app en déduit quoi mesurer.</p><button class="btn pri" data-act="profSub" data-id="goals">🎯 Choisir mes objectifs</button></div>`;
  const acts = Object.keys(c.activities);
  const used = acts.map((id) => ({ id, ...levelFor(id, c) }));
  const row = (r) => h`<div class="item"><div class="grow"><b class="small">${r.label}</b>
      <div class="tiny ${r.state === 'known' ? '' : 'muted'}">${STATE_TXT(r)}${r.tierText ? h` · <span class="muted">${r.tierText}</span>` : ''}</div>
      <div class="tiny muted">Pour savoir : ${r.why}</div>
      ${r.test ? h`<details class="how mini"><summary>Comment faire le test ?</summary><p class="tiny">${r.test}</p></details>` : ''}</div>
    <button class="btn sm ${r.state === 'known' ? '' : 'pri'}" data-act="perfAdd" data-id="${r.metricId}">${r.state === 'known' ? 'Mettre à jour' : 'Saisir'}</button></div>`;
  return h`<section class="card stack"><h3 style="margin:0">Ce que l’app sait de toi</h3><p class="small">${f.text}</p>${meter(a.coverage)}
      ${a.zones.length ? h`<p class="tiny muted">🛡️ ${a.zones.map((z) => ZONE_WORD[z]).join(', ')} à ménager : les tests qui les sollicitent fortement sont remplacés ou retirés.</p>` : ''}
      ${guided.length ? h`<button class="btn pri" data-act="bilanRun">▶ Faire les tests guidés (${guided.length})</button><p class="tiny muted">Un test à la fois : comment le faire, puis ta valeur. Tu peux passer ou répondre « je ne sais pas ».</p>` : ''}</section>
    ${Object.entries(a.byEnvie).map(([e, rows]) => h`<section class="card"><h3>${ENVIES[e]?.emoji || '🎯'} ${ENVIES[e]?.label || e}</h3><p class="tiny muted">Pour connaître ${ENVIES[e]?.know || 'ton point de départ'}.</p>${rows.map(row)}</section>`)}
    <section class="card stack"><h3 style="margin:0">💡 Ce que l’app en déduit</h3>
      ${f.lines.length ? h`<ul class="clean small">${f.lines.map((l) => h`<li class="${l.kind === 'strong' ? 'ok-t' : l.kind === 'weak' ? 'warn-t' : ''}">${l.text}</li>`)}</ul>` : h`<p class="small muted">Rien encore : aucune de ces mesures n’a de valeur connue. L’app reste prudente (niveau débutant) tant qu’elle ne sait pas.</p>`}
      <span class="kicker">Utilisé pour tes séances</span>
      <ul class="clean small">${used.map((u) => h`<li><b>${c.activities[u.id]?.label || u.id}</b> : exercices de niveau ${LEVEL_WORDS[u.level] || 'débutant'} <span class="muted">— ${u.how}</span></li>`)}</ul>
      <p class="tiny muted">Repères indicatifs, pas un diagnostic médical. En cas de douleur, arrête le test.</p></section>
    ${sugg.length ? h`<section class="card"><h3>🎯 Objectifs précis possibles</h3><p class="tiny muted">Calculés depuis ta dernière valeur : rien n’est ajouté sans ton choix.</p>${sugg.map((g, i) => h`<div class="item"><div class="grow"><b class="small">${g.label}</b><div class="tiny muted">${g.why}</div></div><button class="btn sm" data-act="bilanGoal" data-i="${i}">＋ Ajouter</button></div>`)}</section>` : ''}`;
}
ACT.bilanGoal = (el) => {
  const g = suggestedGoals(ctx())[Number(el.dataset.i)]; if (!g) return;
  const id = 'g-' + uid().slice(0, 12), m = ctx().metrics[g.metricId];
  putItem('goal', id, g.type === 'grade'
    ? { type: 'grade', metricId: g.metricId, gradeTarget: g.gradeTarget, label: g.label, activityId: m?.gradeActivity === 'voie' ? 'climbing_route' : 'climbing_boulder', status: 'active', startedAt: Date.now(), note: g.why }
    : { type: 'metric', metricId: g.metricId, target: g.target, unit: g.unit, label: g.label, status: 'active', startedAt: Date.now(), note: g.why });
  buzzOk(); toast('Objectif ajouté'); render();
};
/* Tests guidés : un test par écran (protocole, valeur, « je ne sais pas » ou passer). Valeurs enregistrées comme MESURÉES. */
const bilanStep = () => {
  const r = S.bilan, t = r.list[r.i];
  if (!t) { closeSheet(); toast(r.saved ? `${r.saved} mesure${r.saved > 1 ? 's' : ''} enregistrée${r.saved > 1 ? 's' : ''} : ton bilan est à jour.` : 'Bilan terminé.', 4500); S.bilan = null; render(); return; }
  const unit = t.unit === 'reps' ? 'rép.' : t.unit;
  openSheet(h`<div class="stack"><span class="tiny muted">Test ${r.i + 1} sur ${r.list.length}</span><h2 style="margin:0">${t.label}</h2>
    <p class="small muted">Pour savoir : ${t.why}</p>
    ${r.i === 0 ? h`<p class="small warn-t">Échauffe-toi une dizaine de minutes avant les tests d’effort. Arrête en cas de douleur.</p>` : ''}
    ${t.test ? h`<div class="card flat"><b class="small">Comment faire</b><p class="small">${t.test}</p></div>` : ''}
    <label>Ta valeur<span class="unitbox"><input id="bilanVal" type="number" inputmode="decimal" step="any" aria-label="${t.label}"><em>${unit}</em></span></label>
    <button class="btn pri" data-act="bilanSave">Enregistrer et continuer</button>
    <div class="row wrapf"><button class="btn" data-act="bilanSkip" data-v="nsp">🤷 Je ne sais pas</button><button class="btn ghost" data-act="bilanSkip">Passer</button><button class="btn ghost" data-act="bilanStop">Arrêter</button></div></div>`);
};
ACT.bilanRun = () => { S.bilan = { list: guidedTests(ctx()), i: 0, saved: 0 }; bilanStep(); };
ACT.bilanSave = () => {
  const r = S.bilan, t = r?.list[r.i]; if (!t) return;
  const raw0 = document.getElementById('bilanVal')?.value ?? '', v = Number(String(raw0).replace(',', '.'));
  if (raw0 === '' || !Number.isFinite(v)) { toast('Écris une valeur, ou touche « Je ne sais pas » / « Passer ».'); return; }
  putItem('perf', 'p-' + uid().slice(0, 14), { metricId: t.metricId, value: v, unit: t.unit, date: Date.now(), source: 'measured', note: 'Bilan guidé' });
  r.saved++; r.i++; bilanStep();
};
ACT.bilanSkip = (el) => {
  const r = S.bilan, t = r?.list[r.i]; if (!t) return;
  if (el.dataset.v === 'nsp') putItem('perf', 'p-' + uid().slice(0, 14), { metricId: t.metricId, value: null, unknown: true, unit: t.unit, date: Date.now(), source: 'declared', note: 'Bilan guidé : je ne sais pas' });
  r.i++; bilanStep();
};
ACT.bilanStop = () => { const n = S.bilan?.saved || 0; S.bilan = null; closeSheet(); if (n) toast(`${n} mesure${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}.`); render(); };
