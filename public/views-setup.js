// views-setup.js — premiers pas : questionnaire de profil (une question par écran, réponses en un toucher),
// ou fiche complète sur une seule page, avec « Plus tard » à tout moment ; visite guidée des onglets ;
// proposition d'installer l'application. Tout ce qui est répondu est enregistré comme DÉCLARÉ par l'utilisateur
// (jamais présenté comme mesuré) et reste modifiable dans Profil.
import { h, openSheet, closeSheet, toast, buzzOk, chip, meter } from './ui.js';
import { S, ACT, INPUT, render, go, putItem, item, itemsOf, ctx, saveSettings, ls } from './state.js';
import { ACTIVITIES, ENV_TYPES, ENV_TEMPLATES, SKILLS, CAPACITIES } from './model.js';
import { BUILTIN_SYSTEMS, gradeSnapshot } from './grading.js';
import { nextQuestion, pendingQuestions, bucketValue } from './questions.js';
import { startTour } from './tour.js';
import { bodyFields, bodyToggle, cleanBody } from './body.js';
import { batteryFor } from './assess.js';
import { METRICS as ALL_METRICS } from './model.js';
import { canPrompt, isIOS, isInstalled, shouldOffer, dismissInstall, promptInstall, onInstallChange } from './install.js';

/* ═════════ Configuration personnelle (item config « main ») ═════════ */
export const mainConfig = () => item('config', 'main') || {};
const saveMain = (patch) => putItem('config', 'main', { ...mainConfig(), ...patch });
export const setupDone = () => !!mainConfig().setupDone;

/* ═════════ Questions ═════════ */
const LEVELS = [['0', '🌱 Je débute'], ['1', '🙂 Je pratique régulièrement'], ['2', '💪 Je suis confirmé(e)'], ['nsp', '🤷 Je ne sais pas']];
export const GOALS = [['climb', '🧗 Progresser en escalade'], ['force', '💪 Devenir plus fort(e)'], ['endurance', '🔋 Avoir plus d’endurance / de cardio'], ['mobilite', '🧘 Être plus souple, bouger mieux'], ['forme', '🙂 Rester en forme'], ['figure', '🤸 Réussir une figure (front lever, drapeau…)'], ['poids', '⚖️ Perdre du poids'], ['sante', '❤️ Être en meilleure santé']];
const AVOID = [['fingers', '✋ Doigts'], ['shoulders', '🦾 Épaules'], ['elbows', '💪 Coudes'], ['knees', '🦵 Genoux'], ['none', '👍 Rien de particulier']];
export const INTENT_OF = { climb: 'specifique', force: 'force', endurance: 'endurance', mobilite: 'mobilite', forme: '', figure: 'force', poids: 'endurance', sante: 'endurance' };
const BLOC_CHOICES = ['4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '7A', '7A+', '7B', '7C', '8A'];

const STEPS = [
  { id: 'acts', multi: true, q: 'Quels sports pratiques-tu ?', help: 'Choisis-en un ou plusieurs. Tu pourras en ajouter d’autres (basket, vélo…) dans ton Profil.', opts: () => Object.entries(ACTIVITIES).map(([id, a]) => [id, `${a.emoji} ${a.label}`]) },
  { id: 'level', q: 'Comment décrirais-tu ton niveau ?', help: 'Une première idée suffit : l’app ajustera avec tes séances et tes mesures.', opts: () => LEVELS },
  { id: 'perWeek', q: 'Combien de séances par semaine aimerais-tu faire ?', opts: () => [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 ou plus']] },
  { id: 'climbPerWeek', q: 'Et combien de fois grimpes-tu par semaine ?', help: 'En salle ou en falaise, en moyenne. Ça aide l’app à doser le travail des doigts et la récupération.', when: (a) => (a.acts || []).some((x) => x.startsWith('climbing')), opts: () => [['0', 'Pas en ce moment'], ['1', '1 fois'], ['2', '2 fois'], ['3', '3 fois'], ['4', '4 fois ou plus']] },
  { id: 'minutes', q: 'Combien de temps as-tu en général pour une séance ?', opts: () => [['10', '10 min'], ['20', '20 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 h'], ['90', '1 h 30']] },
  { id: 'places', multi: true, q: 'Où t’entraînes-tu ?', help: 'L’app proposera seulement des exercices faisables avec le matériel de ces lieux (modifiable dans Profil › Matériel).', opts: () => Object.entries(ENV_TYPES).filter(([k]) => k !== 'autre') },
  { id: 'goals', multi: true, q: 'Quels sont tes objectifs ?', help: 'Choisis-en autant que tu veux. Tu pourras aussi écrire un objectif à toi dans Profil › Objectifs.', opts: () => GOALS },
  { id: 'skill', q: 'Quelle figure veux-tu réussir ?', when: (a) => (a.goals || []).includes('figure'), opts: () => Object.entries(SKILLS).map(([id, s]) => [id, `${s.emoji} ${s.label}`]) },
  { id: 'avoid', multi: true, q: 'Y a-t-il une zone à ménager ?', help: 'L’app évitera les exercices qui la sollicitent fortement. Ce n’est pas un avis médical : en cas de douleur, consulte un professionnel.', opts: () => AVOID },
  { id: 'body', q: 'Parle-nous un peu de toi', help: 'Facultatif : ça aide à doser l’intensité, les repos et le type d’exercices.' },
  { id: 'marks', q: 'Quelques repères pour tes objectifs (facultatif)', help: 'Choisis selon tes objectifs. Si tu ne sais pas, touche « Je ne sais pas » ou passe : rien ne sera inventé. Tu pourras faire les tests guidés plus tard (Profil › Mon bilan physique).' },
];
const visibleSteps = (a) => STEPS.filter((s) => !s.when || s.when(a));

/** Repères demandés : ceux qui comptent pour les objectifs choisis (4 au plus, sans cotation ni poids déjà demandés ailleurs). */
const AVOID_KEYS = { fingers: 'fingers', shoulders: 'shoulders', elbows: 'elbows', knees: 'knees' };
export function markKeys(a) {
  const avoid = Object.fromEntries((a.avoid || []).filter((x) => AVOID_KEYS[x]).map((x) => [x, true]));
  const list = batteryFor({ envies: a.goals || [], acts: a.acts || [], avoid, skillIds: a.skill ? [a.skill] : [] })
    .filter((t) => ALL_METRICS[t.metricId].kind !== 'grade' && t.metricId !== 'body_weight').slice(0, 4);
  return list.length ? list : [{ metricId: 'max_tractions', why: 'ton tirage' }, { metricId: 'max_pompes', why: 'ta poussée' }];
}
function markFields(a) {
  const m = a.marks || {};
  const num = ({ metricId: k, why }) => { const M0 = ALL_METRICS[k], unit = M0.unit === 'reps' ? 'rép.' : M0.unit; return h`<div class="card flat"><b class="small">${M0.label}</b><div class="tiny muted">Pour savoir : ${why}</div><div class="row wrapf">
    <span class="unitbox"><input type="number" inputmode="decimal" step="any" min="0" max="100000" value="${m[k] ?? ''}" data-input="setMark" data-k="${k}" aria-label="${M0.label}" ${m[k + '_nsp'] ? 'disabled' : ''}><em>${unit}</em></span>
    ${chip(!!m[k + '_nsp'], '🤷 Je ne sais pas', `data-act="setNsp" data-k="${k}"`)}</div></div>`; };
  const climbing = (a.acts || []).some((x) => x.startsWith('climbing'));
  return h`${markKeys(a).map(num)}
    ${climbing ? h`<div class="card flat"><b class="small">Ton meilleur bloc réussi (cotation Font)</b><div class="chips">${BLOC_CHOICES.map((g) => chip(m.bloc === g, g, `data-act="setBloc" data-v="${g}"`))}${chip(m.bloc === 'nsp', '🤷 Je ne sais pas', 'data-act="setBloc" data-v="nsp"')}</div>
      <p class="tiny muted">Ta salle utilise des couleurs ou U1–U8 ? Tu pourras créer ton propre système dans Profil › Escalade.</p></div>` : ''}`;
}
function stepBody(st, a) {
  if (st.id === 'marks') return markFields(a);
  if (st.id === 'body') return bodyFields(a.body || {}, { act: 'setBody', inp: 'setBodyIn' });
  const cur = a[st.id];
  const on = (v) => (st.multi ? (cur || []).includes(v) : cur === v);
  return h`<div class="choices">${st.opts().map(([v, l]) => h`<button type="button" class="choice ${on(v) ? 'on' : ''}" aria-pressed="${on(v)}" data-act="setPick" data-q="${st.id}" data-v="${v}">${l}</button>`)}</div>`;
}

/* ═════════ Écran questionnaire / fiche ═════════ */
export function vSetup() {
  const st = (S.setup ||= initialAnswers());
  const steps = visibleSteps(st.a);
  if (st.mode === 'form') {
    return h`<div class="row between"><h1>Mon profil</h1><button class="btn sm" data-act="setupLater">Plus tard</button></div>
      <p class="muted small">Réponds à ce que tu veux, laisse le reste vide. Tout reste modifiable ensuite dans l’onglet Profil.</p>
      ${steps.map((s) => h`<section class="card"><h3>${s.q}</h3>${s.help ? h`<p class="tiny muted">${s.help}</p>` : ''}${stepBody(s, st.a)}</section>`)}
      <button class="btn pri big" data-act="setupFinish">✓ Enregistrer mon profil</button>
      <button class="btn ghost" data-act="setupMode" data-id="quiz">Préférer les questions une par une</button>`;
  }
  const i = Math.min(st.i || 0, steps.length - 1), s = steps[i];
  const answered = s.id === 'marks' || s.id === 'body' || (s.multi ? (st.a[s.id] || []).length : st.a[s.id] != null);
  return h`<div class="setup">
    <div class="row between"><span class="small muted">Question ${i + 1} sur ${steps.length}</span><button class="btn sm ghost" data-act="setupLater">Finir plus tard</button></div>
    ${meter(((i + 1) / steps.length) * 100)}
    <h1 class="q">${s.q}</h1>${s.help ? h`<p class="muted small">${s.help}</p>` : ''}${s.multi ? h`<p class="tiny muted">Plusieurs réponses possibles.</p>` : ''}
    ${stepBody(s, st.a)}
    <div class="row setup-nav">${i > 0 ? h`<button class="btn" data-act="setupPrev">‹ Retour</button>` : h`<button class="btn" data-act="setupMode" data-id="form">Tout sur une page</button>`}
      <span class="grow"></span>${answered ? '' : h`<button class="btn ghost" data-act="setupNext">Passer</button>`}
      ${i === steps.length - 1 ? h`<button class="btn pri" data-act="setupFinish">Terminer ✓</button>` : h`<button class="btn pri" data-act="setupNext" ${answered ? '' : 'disabled'}>Suivant ›</button>`}</div></div>`;
}
function initialAnswers() {
  const c = ctx(), cfg = mainConfig(), av = S.settings.avoid || {};
  const acts = Object.keys(c.activities).filter((id) => ACTIVITIES[id]);
  const places = [...new Set(c.envs.map((e) => e.type).filter((t) => ENV_TYPES[t] && t !== 'autre'))];
  const avoid = Object.entries(av).filter(([, v]) => v).map(([k]) => k);
  return { i: 0, mode: 'quiz', a: { acts: acts.length ? acts : [], places, avoid, perWeek: cfg.perWeek ? String(Math.min(5, cfg.perWeek)) : undefined, climbPerWeek: cfg.climbPerWeek != null ? String(Math.min(4, cfg.climbPerWeek)) : undefined, minutes: cfg.durations?.[0] || undefined, goals: cfg.goals?.length ? [...cfg.goals] : cfg.goal ? [cfg.goal] : undefined, body: { ...(item('config', 'body') || {}) }, marks: {} } };
}
export function openSetup(mode = 'quiz') { S.setup = initialAnswers(); S.setup.mode = mode; go('home', 'setup'); }
ACT.setupStart = (el) => openSetup(el.dataset.id || 'quiz');
ACT.setupMode = (el) => { S.setup.mode = el.dataset.id; render(); window.scrollTo(0, 0); };
ACT.setPick = (el) => {
  const a = S.setup.a, q = el.dataset.q, v = el.dataset.v, st = STEPS.find((s) => s.id === q);
  if (st.multi) {
    let list = [...(a[q] || [])];
    if (v === 'none') list = list.includes('none') ? [] : ['none'];
    else { list = list.filter((x) => x !== 'none'); list = list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }
    a[q] = list; render(); return;
  }
  a[q] = v; render();
  if (S.setup.mode === 'quiz') setTimeout(() => ACT.setupNext(), 180); // réponse unique : on avance tout seul
};
INPUT.setMark = (el) => { const m = (S.setup.a.marks ||= {}), v = Number(String(el.value).replace(',', '.')); m[el.dataset.k] = el.value === '' || !Number.isFinite(v) ? undefined : Math.max(0, Math.min(100000, Math.round(v * 10) / 10)); };
ACT.setNsp = (el) => { const m = (S.setup.a.marks ||= {}), k = el.dataset.k; m[k + '_nsp'] = !m[k + '_nsp']; if (m[k + '_nsp']) m[k] = undefined; render(); };
ACT.setBloc = (el) => { const m = (S.setup.a.marks ||= {}); m.bloc = m.bloc === el.dataset.v ? undefined : el.dataset.v; render(); };
ACT.setBody = (el) => { S.setup.a.body = bodyToggle(S.setup.a.body || {}, el.dataset.k, el.dataset.v); render(); };
INPUT.setBodyIn = (el) => { (S.setup.a.body ||= {})[el.dataset.k] = el.value; };
ACT.setupNext = () => { const steps = visibleSteps(S.setup.a); S.setup.i = Math.min(steps.length - 1, (S.setup.i || 0) + 1); render(); window.scrollTo(0, 0); };
ACT.setupPrev = () => { S.setup.i = Math.max(0, (S.setup.i || 0) - 1); render(); window.scrollTo(0, 0); };
ACT.setupLater = () => {
  const n = applyAnswers(S.setup?.a || {});
  saveMain({ setupLater: Date.now() });
  S.settings.onboarded = true; saveSettings();
  S.setup = null; go('home', 'dash');
  toast(n ? `${n} réponse(s) enregistrée(s). Tu pourras compléter ton profil quand tu veux (Accueil ou Profil).` : 'D’accord ! Tu pourras compléter ton profil quand tu veux, depuis l’Accueil ou le Profil.', 5000);
  maybeTour();
};
ACT.setupFinish = () => {
  const a = S.setup?.a || {};
  applyAnswers(a);
  saveMain({ setupDone: true, setupLater: 0 });
  S.settings.onboarded = true; saveSettings();
  S.setup = null; buzzOk();
  go('home', 'dash');
  setTimeout(() => openSheet(h`<h2 style="margin:0">✓ Profil enregistré</h2><p class="small">Voici ce que l’app a retenu (déclaré par toi) :</p><ul class="small">${summaryLines(a).map((l) => h`<li>${l}</li>`)}</ul>
    <p class="tiny muted">Les séances proposées tiendront compte de ces réponses. Tout est modifiable dans l’onglet Profil.</p>
    <button class="btn pri" data-act="setupThanks">Découvrir l’app</button><button class="btn" data-act="setupBilan">🩺 Voir ce que l’app sait de ma condition</button>`), 120);
};
ACT.setupThanks = () => { closeSheet(); maybeTour(true); };
ACT.setupBilan = () => { closeSheet(); go('profile', 'bilan'); };

function summaryLines(a) {
  const out = [];
  if (a.acts?.length) out.push('Sports : ' + a.acts.map((x) => ACTIVITIES[x]?.label || x).join(', '));
  if (a.level && a.level !== 'nsp') out.push('Niveau : ' + LEVELS.find(([k]) => k === a.level)[1].replace(/^\S+\s/, ''));
  if (a.perWeek) out.push(`Objectif de rythme : ${a.perWeek === '5' ? '5 ou plus' : a.perWeek} séance(s) par semaine`);
  if (a.climbPerWeek != null) out.push(a.climbPerWeek === '0' ? 'Escalade : pas en ce moment' : `Escalade : ${a.climbPerWeek === '4' ? '4 fois ou plus' : a.climbPerWeek + ' fois'} par semaine`);
  if (a.minutes) out.push(`Durée habituelle : ${a.minutes} min`);
  if (a.places?.length) out.push('Lieux : ' + a.places.map((p) => ENV_TYPES[p]).join(', '));
  if (a.goals?.length) out.push('Objectifs : ' + a.goals.map((k) => (k === 'figure' && a.skill ? `réussir la figure « ${SKILLS[a.skill]?.label} »` : (GOALS.find(([x]) => x === k)?.[1] || k).replace(/^\S+\s/, ''))).join(', '));
  const av = (a.avoid || []).filter((x) => x !== 'none');
  if (av.length) out.push('À ménager : ' + av.map((x) => AVOID.find(([k]) => k === x)[1].replace(/^\S+\s/, '')).join(', '));
  const m = a.marks || {};
  for (const k of Object.keys(m).filter((x) => ALL_METRICS[x] && m[x] != null)) out.push(`${ALL_METRICS[k].label} : ${m[k]} ${ALL_METRICS[k].unit === 'reps' ? 'rép.' : ALL_METRICS[k].unit}`);
  if (m.bloc && m.bloc !== 'nsp') out.push(`Meilleur bloc : ${m.bloc}`);
  if (!out.length) out.push('Rien pour l’instant : l’app restera prudente et apprendra avec tes séances.');
  return out;
}

/** Enregistre les réponses données (les questions sans réponse ne changent rien). Retourne le nombre de réponses prises en compte. */
export function applyAnswers(a) {
  let n = 0;
  const now = Date.now(), c = ctx();
  for (const id of a.acts || []) {
    if (!ACTIVITIES[id]) continue;
    const ex = itemsOf('activity').find((x) => x.preset === id || x.id === 'act-' + id);
    putItem('activity', ex?.id || 'act-' + id, { preset: id, label: ACTIVITIES[id].label, emoji: ACTIVITIES[id].emoji, archived: false });
  }
  if (a.acts?.length) n++;
  if (a.level != null && a.level !== 'nsp') {
    const lvl = Number(a.level);
    for (const act of a.acts?.length ? a.acts : Object.keys(c.activities)) {
      const top = Object.entries(ACTIVITIES[act]?.caps || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k);
      for (const cap of top) if (!c.capdecl[cap] && CAPACITIES[cap]) putItem('capdecl', 'setup-' + cap, { capId: cap, level: lvl, note: 'Niveau général indiqué au questionnaire de départ' });
    }
    n++;
  }
  const patch = {};
  if (a.perWeek) { patch.perWeek = Number(a.perWeek); n++; }
  if (a.climbPerWeek != null && a.climbPerWeek !== '') { patch.climbPerWeek = Number(a.climbPerWeek); n++; }
  if (a.minutes) { patch.durations = [String(a.minutes)]; S.settings.defaultMinutes = Number(a.minutes); S.gen.minutes = Number(a.minutes); n++; }
  if (a.goals?.length) { patch.goals = a.goals.slice(0, 8); patch.goal = a.goals[0]; patch.intent = INTENT_OF[a.goals[0]] || ''; S.gen.intentions = [...new Set(a.goals.map((g) => INTENT_OF[g]).filter(Boolean))].map((id) => ({ id, p: 2 })); n++; }
  const body = cleanBody(a.body || {});
  if (Object.values(body).some((v) => v !== undefined && !(Array.isArray(v) && !v.length))) {
    putItem('config', 'body', { ...(item('config', 'body') || {}), ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) }); n++;
    if (body.weight) putItem('perf', 'bw-' + new Date(now).toISOString().slice(0, 10), { metricId: 'body_weight', value: body.weight, unit: 'kg', date: now, source: 'declared', note: 'Indiqué dans le profil' });
  }
  if (Object.keys(patch).length) saveMain(patch);
  const envs = itemsOf('env');
  (a.places || []).forEach((t, i) => {
    if (!ENV_TYPES[t] || envs.some((e) => e.type === t && !e.archived)) return;
    putItem('env', 'env-' + t, { name: ENV_TYPES[t], type: t, equipment: ENV_TEMPLATES[t] || [], isDefault: !envs.length && i === 0 });
  });
  if (a.places?.length) n++;
  if ((a.goals || []).includes('figure') && a.skill && SKILLS[a.skill] && !c.goals.some((g) => g.skillId === a.skill && (g.status || 'active') === 'active')) {
    putItem('goal', 'goal-' + a.skill, { type: 'skill', skillId: a.skill, label: SKILLS[a.skill].label, status: 'active', startedAt: now }); n++;
  }
  if (a.avoid?.length) { const av = new Set(a.avoid); S.settings.avoid = Object.fromEntries(['fingers', 'shoulders', 'elbows', 'knees'].map((k) => [k, av.has(k)])); n++; }
  const m = a.marks || {};
  for (const k of [...new Set(Object.keys(m).map((x) => x.replace(/_nsp$/, '')))].filter((x) => ALL_METRICS[x] && ALL_METRICS[x].kind !== 'grade')) {
    if (m[k] != null) { putItem('perf', 'setup-' + k, { metricId: k, value: m[k], unit: ALL_METRICS[k].unit, date: now, source: 'declared', note: 'Indiqué au questionnaire de départ' }); n++; }
    else if (m[k + '_nsp']) putItem('perf', 'setup-' + k, { metricId: k, unknown: true, date: now, source: 'declared', note: 'Je ne sais pas (questionnaire de départ)' });
  }
  if (m.bloc && m.bloc !== 'nsp') {
    const sys = BUILTIN_SYSTEMS.font, lv = sys.levels.find((l) => l.label === m.bloc);
    if (lv) { putItem('perf', 'setup-max_bloc', { metricId: 'max_bloc', grade: gradeSnapshot(sys, lv.id), date: now, source: 'declared', note: 'Indiqué au questionnaire de départ' }); n++; }
  }
  saveSettings();
  return n;
}

/* ═════════ Carte d'accueil : compléter son profil ═════════ */
export function setupCard() {
  if (setupDone() || mainConfig().setupHidden) return '';
  if (!mainConfig().setupLater) {
    return h`<section class="card acc-b welcome"><h2 style="margin:0">Bienvenue${S.user?.guest ? '' : ' ' + S.user.username} 👋</h2>
      <p>Pour que l’app te propose des séances qui te correspondent, dis-lui en quelques mots qui tu es. <b>Environ 2 minutes.</b></p>
      <button class="btn pri big" data-act="setupStart" data-id="quiz">Répondre aux questions</button>
      <div class="row wrapf"><button class="btn" data-act="setupStart" data-id="form">Remplir la fiche d’un coup</button><button class="btn ghost" data-act="setupSkip">Plus tard</button></div></section>`;
  }
  return h`<section class="card flat row"><span class="grow small">🧩 Ton profil n’est pas encore complet : les séances proposées restent prudentes.</span><button class="btn sm pri" data-act="setupStart" data-id="quiz">Compléter</button><button class="btn sm ghost ic" data-act="setupHide" aria-label="Masquer ce rappel">✕</button></section>`;
}
ACT.setupSkip = () => { S.setup = null; ACT.setupLater(); };
ACT.setupHide = () => { saveMain({ setupHidden: true }); toast('Rappel masqué. Tu peux compléter ton profil à tout moment dans Paramètres › Essentiel.', 4500); render(); };

/* ═════════ Visite guidée ═════════ */
// La visite elle-même (tour.js) navigue de page en page et pointe chaque élément avec une flèche.
export function maybeTour(force = false) {
  if (!force && mainConfig().tourDone) return;
  setTimeout(() => { closeSheet(); startTour({ onEnd: () => { if (!mainConfig().tourDone) saveMain({ tourDone: true }); } }); }, 250);
}
export const showTour = () => maybeTour(true);
ACT.tourStart = () => maybeTour(true);

/* ═════════ Installation de l'application ═════════ */
onInstallChange(() => render());
/** Venu de l'ancienne application installée : dernière étape, installer la nouvelle puis supprimer l'ancienne icône. */
export function reinstallCard() {
  if (!ls.get('sea:reinstall')) return '';
  if (isInstalled()) { ls.del('sea:reinstall'); return ''; }
  const ios = isIOS() && !canPrompt();
  return h`<section class="card acc-b install reinstall"><div class="row"><img src="/icon-192.png" alt="" width="44" height="44" class="app-mini"><div class="grow"><b>📲 Dernière étape : installe la nouvelle application</b>
      <div class="tiny muted">Ton compte est bien là. Installe l’app ici, puis supprime l’ancienne icône (appui long › Désinstaller).</div></div></div>
    <div class="row wrapf"><button class="btn pri" data-act="installNow">${ios ? 'Voir comment faire' : '📲 Installer'}</button><button class="btn ghost" data-act="reinstallDone">C’est fait</button></div></section>`;
}
ACT.reinstallDone = () => { ls.del('sea:reinstall'); render(); };
export function installCard({ force = false } = {}) {
  if (isInstalled()) return force ? h`<section class="card flat"><p class="small">✅ L’application est installée sur cet appareil.</p></section>` : '';
  if (!force && !shouldOffer()) return '';
  const ios = isIOS() && !canPrompt();
  return h`<section class="card acc-b install"><div class="row"><img src="/icon-192.png" alt="" width="44" height="44" class="app-mini"><div class="grow"><b>Installer l’application</b>
      <div class="tiny muted">${ios ? 'Sur iPhone, 2 gestes dans Safari suffisent.' : 'Elle s’ouvrira comme une vraie application : plein écran, dans ta liste d’applications, même hors connexion.'}</div></div></div>
    <div class="row wrapf"><button class="btn pri" data-act="installNow">${ios ? 'Voir comment faire' : '📲 Installer'}</button>${force ? '' : h`<button class="btn ghost" data-act="installLater">Plus tard</button>`}</div></section>`;
}
ACT.installNow = async () => {
  const r = await promptInstall();
  if (r === 'accepted') { toast('Installation en cours… Tu retrouveras « Séances entraînement » avec tes autres applications.', 5000); return; }
  if (r === 'ios') { iosHelp(); return; }
  if (r === 'unavailable') {
    openSheet(h`<h2 style="margin:0">Installer l’application</h2>
      <p class="small">Ton navigateur ne propose pas l’installation directe pour le moment. Essaie :</p>
      <ul class="small"><li><b>Android</b> : ouvre le site dans <b>Chrome</b>, menu <b>⋮</b> › <b>Installer l’application</b>.</li><li><b>Ordinateur</b> : dans Chrome ou Edge, icône d’installation à droite de la barre d’adresse.</li><li><b>iPhone</b> : dans <b>Safari</b>, bouton Partager › <b>Sur l’écran d’accueil</b>.</li></ul>
      <p class="tiny muted">Si tu viens de refuser l’installation, le navigateur peut attendre un peu avant de la reproposer.</p><button class="btn" data-act="closeSheet">OK</button>`);
  }
};
ACT.installLater = () => { dismissInstall(14); toast('D’accord. Tu pourras installer l’app plus tard depuis Paramètres.', 4000); };
function iosHelp() {
  openSheet(h`<h2 style="margin:0">Installer sur iPhone / iPad</h2>
    <ol class="small steps"><li>Ouvre ce site dans <b>Safari</b>.</li><li>Touche le bouton <b>Partager</b> (le carré avec une flèche ↑, en bas de l’écran).</li><li>Choisis <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li></ol>
    <p class="tiny muted">Sur iPhone, Apple n’autorise pas d’autre méthode : l’icône ouvre ensuite l’app en plein écran, comme une application.</p><button class="btn pri" data-act="closeSheet">Compris</button>`);
}

/* ═════════ « Petite question » : l'app demande ce qui lui manque, une question à la fois ═════════ */
const SNOOZE_KEY = 'sea:q-snooze';
const snoozed = () => { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; } };
const snooze = (id, days = 3) => { const s = snoozed(); s[id] = Date.now() + days * 86400000; try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch { /* rien */ } };
export const currentQuestion = () => (S.sub.home === 'setup' ? null : nextQuestion(ctx(), snoozed()));
const qBody = (x) => h`<div class="qask"><div class="qhead"><span class="qemoji">${x.emoji}</span><div><span class="kicker">Petite question</span><h3>${x.text}</h3></div></div>
  <div class="chips big">${x.options.map(([v, l]) => h`<button type="button" class="chip" data-act="qAnswer" data-q="${x.id}" data-v="${v}">${l}</button>`)}${x.nsp ? h`<button type="button" class="chip ghost" data-act="qAnswer" data-q="${x.id}" data-v="nsp">🤷 Je ne sais pas</button>` : ''}</div>
  <details class="how mini"><summary>Pourquoi cette question ?</summary><p class="tiny">${x.why}</p></details>
  <button class="btn ghost sm" data-act="qLater" data-q="${x.id}">Plus tard</button></div>`;
export function questionCard() {
  const x = currentQuestion();
  if (!x || !(setupDone() || mainConfig().setupLater)) return ''; // avant le questionnaire, la carte de bienvenue suffit
  return h`<section class="card qcard">${qBody(x)}</section>`;
}
/** La question reste dans sa carte de l'accueil : plus de fenêtre qui s'ouvre toute seule par-dessus (elle faisait doublon). */
export function maybeAskOnOpen() {}
ACT.qLater = (el) => { snooze(el.dataset.q); closeSheet(); render(); };
ACT.qAnswer = (el) => {
  const id = el.dataset.q, v = el.dataset.v, now = Date.now(), cfg = mainConfig();
  const done = (patch = {}) => saveMain({ ...patch, asked: [...new Set([...(cfg.asked || []), id])].slice(-30) });
  const note = 'Réponse à une petite question';
  switch (id) {
    case 'acts': if (ACTIVITIES[v]) putItem('activity', 'act-' + v, { preset: v, label: ACTIVITIES[v].label, emoji: ACTIVITIES[v].emoji, archived: false }); done(); break;
    case 'climbPerWeek': case 'perWeek': done({ [id]: Number(v) }); break;
    case 'minutes': S.settings.defaultMinutes = Number(v); S.gen.minutes = Number(v); saveSettings(); done({ durations: [v] }); break;
    case 'goal': done({ goal: v, intent: INTENT_OF[v] || '' }); break;
    case 'place': if (ENV_TYPES[v]) putItem('env', 'env-' + v, { name: ENV_TYPES[v], type: v, equipment: ENV_TEMPLATES[v] || [], isDefault: !itemsOf('env').length }); done(); break;
    case 'bloc': {
      const sys = BUILTIN_SYSTEMS.font, lv = sys.levels.find((l) => l.label === v);
      putItem('perf', 'q-max_bloc', v === 'nsp' || !lv ? { metricId: 'max_bloc', unknown: true, date: now, source: 'declared', note } : { metricId: 'max_bloc', grade: gradeSnapshot(sys, lv.id), date: now, source: 'declared', note });
      done(); break;
    }
    case 'tractions': case 'pompes': {
      const metricId = id === 'tractions' ? 'max_tractions' : 'max_pompes';
      putItem('perf', 'q-' + metricId, v === 'nsp' ? { metricId, unknown: true, date: now, source: 'declared', note } : { metricId, value: bucketValue(v), date: now, source: 'declared', note: `${note} (au moins ${bucketValue(v)}, valeur approximative)` });
      done(); break;
    }
    case 'avoid': S.settings.avoid = Object.fromEntries(['fingers', 'shoulders', 'elbows', 'knees'].map((k) => [k, k === v])); saveSettings(); done(); break;
    default: done();
  }
  closeSheet(); buzzOk();
  const left = pendingQuestions(ctx()).length;
  toast(left ? 'Merci ! C’est noté 👍' : 'Merci ! L’app a tout ce qu’il lui faut 🎉', 2500);
  render();
};
