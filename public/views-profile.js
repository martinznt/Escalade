// views-profile.js — Profil : comprendre mon profil, carte d'entraînement et graphe, activités et catégories,
// performances, escalade (cotations, styles, maxima, journal), objectifs complexes, matériel, préférences, profil public.
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, howBox, meter, fmtDay, relDate, numberField, buzzOk, lineChart, skeleton, SOURCE_TAG } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, ctx, go, render, putItem, delItem, item, itemsOf, saveSettings, api, newId } from './state.js';
import { uid } from './shared.js';
import { CAPACITIES, CAP_FAMILIES, MUSCLES, METRICS, ACTIVITIES, SKILLS, EQUIPMENT, ENV_TYPES, ENV_TEMPLATES, BUILTIN_STYLES, metricTierText, metricsForCap } from './model.js';
import { BUILTIN_SYSTEMS, TEMPLATES as GRADE_TEMPLATES, systemFromTemplate, addLevel, moveLevel, removeLevel, renameLevel, setMapping, sortedLevels, gradeSnapshot, maximaSummary, snapshotText, REFERENCE, LEVEL_WORDS } from './grading.js';
import { understandProfile, profileCapacities, strengthsWeaknesses, capacityState, STATUS_WORD, confWord, trainingMap, graphFromCap, graphFromGoal, goalProgress, goalLabel, goalCaps, activeGoals, mastery, MASTERY_WORD, blockers, goalPaths, whatIf, whyNoProgress, perfsOf, perfText, metricTrend, testReminders, learnedPreferences, habits, muscleVolume, activityLabel } from './brain.js';
import { anatomySvg } from './anatomy.js';
import { openGenerator } from './views-library.js';
import { byId } from './library.js';

const SUBS = [['understand', 'Comprendre'], ['map', 'Ma carte'], ['activities', 'Activités'], ['perfs', 'Performances'], ['climbing', 'Escalade'], ['goals', 'Objectifs'], ['equipment', 'Matériel'], ['prefs', 'Préférences'], ['public', 'Public']];
export function vProfile() {
  const sub = SUBS.some(([k]) => k === S.sub.profile) ? S.sub.profile : 'understand';
  const views = { understand: vUnderstand, map: vMap, activities: vActivities, perfs: vPerfs, climbing: vClimbing, goals: vGoals, equipment: vEquipment, prefs: vPrefs, public: vPublic };
  return h`<h1>Profil</h1><div class="scrollx">${seg('profSub', sub, SUBS)}</div>${views[sub]()}`;
}
ACT.profSub = (el) => { go('profile', el.dataset.id); if (el.dataset.id === 'public') loadSocial(); };
const capL = (id) => CAPACITIES[id]?.label || ctx().categories[id]?.label || id;
const statusTag = (s) => tag(STATUS_WORD[s.status], s.status === 'fort' ? 'ok' : s.status === 'faible' ? 'warn' : s.status === 'developpement' ? 'info' : '');

/* ═════════ Comprendre mon profil ═════════ */
function vUnderstand() {
  const u = understandProfile(ctx());
  const sec = (title, cls, items, emptyText) => h`<section class="card"><h3>${title}</h3>${items.length ? h`<ul class="small">${items.slice(0, 20).map((x) => h`<li>${x}</li>`)}</ul>` : h`<p class="muted small">${emptyText}</p>`}</section>`;
  return h`<p class="muted small">Ce que l’application sait de toi, d’où vient chaque information et ce qui manque. Les estimations ne sont jamais présentées comme des mesures.</p>
    ${sec('📏 Mesuré', 'ok', u.measured, 'Aucune mesure : ajoute un test dans Performances.')}
    ${sec('🗣️ Déclaré par toi', '', u.declared, 'Rien de déclaré pour l’instant.')}
    ${sec('🧮 Calculé à partir de ton historique', 'info', u.calculated, 'Pas encore de séance enregistrée.')}
    ${sec('≈ Inféré / estimé', 'warn', u.inferred, 'Aucune capacité estimable pour l’instant.')}
    ${sec('💡 Recommandé', 'acc', u.recommended, 'Aucune recommandation.')}
    ${sec('❔ Données manquantes', 'muted', u.missing, 'Rien d’essentiel ne manque.')}
    <details class="card"><summary><b>Comment les capacités sont déterminées</b></summary><ol class="small">${u.method.map((m) => h`<li>${m}</li>`)}</ol></details>`;
}

/* ═════════ Ma carte d'entraînement + graphe ═════════ */
function vMap() {
  const c = ctx(), m = trainingMap(c), sw = strengthsWeaknesses(m.capacities);
  const groups = {};
  for (const s of m.capacities) (groups[CAPACITIES[s.capId]?.family || 'autre'] ||= []).push(s);
  return h`<div class="card"><h3>Activités</h3><div class="chips">${m.activities.length ? m.activities.map((a) => h`<span class="chip static">${a.label} · ${a.sessions90} séance(s) / 90 j</span>`) : h`<span class="muted small">Aucune activité.</span>`}</div></div>
    <div class="card"><h3>Carte des capacités</h3><p class="tiny muted">Touche une capacité pour explorer ses liens : exercices, métriques, muscles et objectifs. Couleur = état estimé (${sw.text})</p>
      <div class="legend small"><span>${tag('solide', 'ok')}</span><span>${tag('en développement', 'info')}</span><span>${tag('à renforcer', 'warn')}</span><span>${tag('non renseignée')}</span></div>
      ${Object.entries(groups).map(([fam, list]) => h`<div class="capgroup"><b class="small">${CAP_FAMILIES[fam] || 'Autres'}</b><div class="capmap">${list.map((s) => h`<button class="cap ${s.status}" data-act="capOpen" data-id="${s.capId}" style="--rel:${Math.round(40 + s.relevance * 60)}%"><span>${s.label}</span><small>${STATUS_WORD[s.status]}${s.level != null ? ' · ' + confWord(s.confidence) : ''}</small></button>`)}</div></div>`)}
      ${!m.capacities.length ? h`<p class="muted small">Choisis une activité ou un objectif pour faire apparaître tes capacités.</p>` : ''}</div>
    <div class="card"><h3>Muscles travaillés (30 jours)</h3>${raw(anatomySvg({ heat: muscleVolume(c, 30) }))}<p class="tiny muted center">Plus la zone est marquée, plus elle a été sollicitée (exercices réalisés + ressenti du questionnaire).</p></div>
    <div class="card"><h3>Objectifs</h3>${m.goals.length ? m.goals.map((g) => h`<button class="item pick" data-act="goalOpen" data-id="${g.goal.id}"><div class="grow"><b>${g.label}</b>${meter(g.progress.pct || 0)}<div class="tiny muted">${g.progress.text}</div></div></button>`) : h`<p class="muted small">Aucun objectif actif.</p>`}</div>
    <div class="card"><h3>Habitudes</h3>${m.habits.length ? m.habits.map((x) => h`<p class="small">• ${x.text}</p>`) : h`<p class="muted small">Pas encore assez de séances pour repérer des habitudes.</p>`}</div>
    <div class="card"><h3>Matériel et environnements</h3><p class="small">${m.envs.length ? m.envs.join(', ') : 'Aucun environnement'} · disponible : ${m.equipment.join(', ') || 'rien'}</p></div>
    <div class="card"><h3>Progression récente</h3>${m.progression.length ? m.progression.map((r) => h`<p class="small">🏆 ${r.label} : ${r.text} (${fmtDay(r.date)})</p>`) : h`<p class="muted small">Aucun record encore.</p>`}<p class="small muted">${m.regularity.text}</p></div>`;
}
ACT.capOpen = (el) => {
  const c = ctx(), g = graphFromCap(el.dataset.id, c), st = capacityState(el.dataset.id, c);
  openSheet(h`<h2 style="margin:0">${g.label}</h2><p class="muted small">${g.desc}</p><p>${statusTag(st)} ${st.level != null ? h`<span class="small">niveau ≈ ${Math.round(st.level * 10) / 10} / 2 · confiance ${confWord(st.confidence)}</span>` : ''}</p>
    ${howBox({ facts: st.evidences.map((e) => `[${e.type}] ${e.text}`).concat(st.vol30 ? [`Volume sur 30 jours : ${st.vol30} séries pondérées (pratique, pas un niveau).`] : []), inferences: st.level != null ? [`Niveau estimé en combinant ${st.evidences.filter((e) => e.level != null).length} source(s) pondérée(s).`] : [], missing: st.missing }, { open: true })}
    ${st.trend ? h`<p class="small">${st.trend.dir > 0 ? '📈' : st.trend.dir < 0 ? '📉' : '➖'} ${st.trend.text}</p>` : ''}
    <b class="small">→ Exercices</b><div class="chips">${g.exercises.map((x) => chip(false, `${x.name} (${x.w})`, `data-act="libInfo" data-id="${x.id}"`))}</div>
    <b class="small">↔ Se mesure avec</b><div class="chips">${g.metrics.map((x) => chip(false, x.label, `data-act="perfAdd" data-id="${x.id}"`))}</div>
    <b class="small">Muscles</b><p class="small">${g.muscles.map((x) => x.label).join(', ') || '—'}</p>
    <b class="small">→ Objectifs</b><div class="chips">${g.goals.length ? g.goals.map((x) => chip(false, x.label, x.skill ? `data-act="goalNewSkill" data-id="${x.id}"` : `data-act="goalOpen" data-id="${x.id}"`)) : h`<span class="muted small">—</span>`}</div>
    <b class="small">Mon niveau déclaré</b><div class="chips">${[[-1, 'Je ne sais pas'], [0, 'Débutant'], [1, 'Intermédiaire'], [2, 'Avancé']].map(([v, l]) => chip(c.capdecl[g.capId]?.level === v, l, `data-act="capDecl" data-id="${g.capId}" data-v="${v}"`))}</div>
    <div class="row wrapf"><button class="btn pri" data-act="capTrain" data-id="${g.capId}">✨ Séance ciblée</button><button class="btn" data-act="closeSheet">Fermer</button></div>`, { wide: true });
};
ACT.capDecl = (el) => { putItem('capdecl', 'cd-' + el.dataset.id, { capId: el.dataset.id, level: Number(el.dataset.v) }); toast(Number(el.dataset.v) === -1 ? 'Noté : « je ne sais pas ». Un test pourra aider.' : 'Niveau déclaré enregistré'); ACT.capOpen(el); render(); };
ACT.capTrain = (el) => { closeSheet(); openGenerator({ mode: 'weaknesses', capId: el.dataset.id, priorities: { [el.dataset.id]: 3 }, autoPlan: true }); };

/* ═════════ Activités et catégories ═════════ */
function vActivities() {
  const c = ctx(), acts = itemsOf('activity');
  const natives = Object.entries(ACTIVITIES);
  return h`<div class="card"><h3>Activités natives</h3><div class="chips">${natives.map(([id, a]) => chip(!!c.activities[id], `${a.emoji} ${a.label}`, `data-act="obAct" data-id="${id}"`))}</div></div>
    <div class="card"><div class="row between"><h3>Mes activités personnalisées</h3><button class="btn sm pri" data-act="actNew">＋ Activité</button></div>
      ${acts.filter((a) => !a.preset && !a.archived).map((a) => h`<div class="item"><div class="ico">${a.emoji || '🏅'}</div><div class="grow"><b>${a.label}</b><div class="tiny muted">${itemsOf('category').filter((x) => x.activityId === a.id && !x.archived).map((x) => x.label).join(', ') || 'aucune catégorie'}</div></div><button class="btn sm" data-act="actEdit" data-id="${a.id}">✎</button></div>`)}
      ${!acts.some((a) => !a.preset && !a.archived) ? h`<p class="muted small">Basketball, cyclisme, tennis, ski… : crée ton activité avec ses propres catégories, métriques et exercices.</p>` : ''}</div>
    ${Object.values(c.activities).map((a) => vActivityCard(a))}
    <div class="card"><div class="row between"><h3>Mes métriques personnalisées</h3><button class="btn sm" data-act="metricNew">＋ Métrique</button></div>${itemsOf('metric').filter((m) => !m.archived).map((m) => h`<div class="item"><div class="grow"><b>${m.label}</b><div class="tiny muted">${m.unit || 'sans unité'} · ${m.activityId ? activityLabel(m.activityId, c) : 'toutes activités'} · ${(m.caps || []).map((x) => capL(x.id)).join(', ') || 'aucune capacité liée'}</div></div><button class="btn sm" data-act="metricEdit" data-id="${m.id}">✎</button></div>`)}</div>`;
}
function vActivityCard(a) {
  const c = ctx(), native = ACTIVITIES[a.id];
  const cats = [...(native?.categories || []).map(([id, label, caps]) => ({ id: 'native:' + id, label, caps: caps.map((x) => ({ id: x, w: 1 })), native: true })), ...Object.values(c.categories).filter((x) => x.activityId === a.id)];
  const st = profileCapacities(c, a.id), sw = strengthsWeaknesses(st);
  return h`<div class="card flat"><div class="row between"><b>${a.emoji} ${a.label}</b><button class="btn sm" data-act="catNew" data-id="${a.id}">＋ Catégorie</button></div>
    <div class="chips">${cats.map((x) => x.native ? h`<span class="chip static" title="${x.caps.map((k) => capL(k.id)).join(', ')}">${x.label}</span>` : chip(false, x.label + ' ✎', `data-act="catEdit" data-id="${x.id}"`))}</div>
    ${sw.strengths.length ? h`<p class="small"><b>Forces :</b> ${sw.strengths.map((s) => s.label).join(', ')}</p>` : ''}${sw.weaknesses.length ? h`<p class="small"><b>Axes de travail :</b> ${sw.weaknesses.map((s) => s.label).join(', ')}</p>` : ''}
    <p class="tiny muted">${sw.text}</p></div>`;
}
ACT.actNew = () => openSheet(h`<h2 style="margin:0">Nouvelle activité</h2><form data-submit="actSave" class="stack"><input type="hidden" name="id" value=""><div class="row"><input name="emoji" value="🏅" maxlength="4" class="emoji-in" aria-label="Emoji"><input name="label" required maxlength="60" placeholder="Ex. Basketball, cyclisme, tennis…" aria-label="Nom"></div><label>Mots-clés (séparés par des virgules)<input name="aliases" maxlength="180"></label><button class="btn pri" type="submit">Créer</button></form>`);
ACT.actEdit = (el) => { const a = item('activity', el.dataset.id); if (!a) return; openSheet(h`<h2 style="margin:0">Modifier l’activité</h2><form data-submit="actSave" class="stack"><input type="hidden" name="id" value="${a.id}"><div class="row"><input name="emoji" value="${a.emoji || '🏅'}" maxlength="4" class="emoji-in" aria-label="Emoji"><input name="label" required maxlength="60" value="${a.label}" aria-label="Nom"></div><label>Mots-clés<input name="aliases" maxlength="180" value="${(a.aliases || []).join(', ')}"></label><div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn danger" type="button" data-act="actArchive" data-id="${a.id}">Archiver</button></div></form>`); };
SUBMIT.actSave = (f) => { const d = Object.fromEntries(new FormData(f)); const id = d.id || 'custom-' + uid().slice(0, 12); putItem('activity', id, { label: d.label, emoji: d.emoji, aliases: String(d.aliases || '').split(',').map((x) => x.trim()).filter(Boolean), preset: '', archived: false }); closeSheet(); buzzOk(); toast('Activité enregistrée'); render(); };
ACT.actArchive = async (el) => { const a = item('activity', el.dataset.id); if (a && (await ask(`Archiver « ${a.label} » ?`, { detail: 'L’historique et les performances liées sont conservés.' }))) { putItem('activity', a.id, { ...a, archived: true }); closeSheet(); render(); } };
function catForm(cat, activityId) {
  const caps = new Set((cat?.caps || []).map((x) => x.id));
  return h`<h2 style="margin:0">${cat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2><form data-submit="catSave" class="stack"><input type="hidden" name="id" value="${cat?.id || ''}"><input type="hidden" name="activityId" value="${activityId}">
    <label>Nom<input name="label" required maxlength="60" value="${cat?.label || ''}" placeholder="Ex. Service, appuis, montée…"></label><label>Description<input name="description" maxlength="180" value="${cat?.description || ''}"></label>
    <label>Capacités liées (facultatif — sinon la catégorie est un nœud propre à l’activité)</label><div class="chips">${Object.entries(CAPACITIES).map(([id, x]) => h`<label class="chip ${caps.has(id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="caps" value="${id}" ${caps.has(id) ? 'checked' : ''} data-change="chipToggle">${x.label}</label>`)}</div>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${cat ? h`<button class="btn danger" type="button" data-act="catDel" data-id="${cat.id}">Supprimer</button>` : ''}</div></form>`;
}
ACT.catNew = (el) => openSheet(catForm(null, el.dataset.id), { wide: true });
ACT.catEdit = (el) => { const cat = item('category', el.dataset.id); if (cat) openSheet(catForm(cat, cat.activityId), { wide: true }); };
SUBMIT.catSave = (f) => { const fd = new FormData(f), d = Object.fromEntries(fd); putItem('category', d.id || 'cat-' + uid().slice(0, 12), { activityId: d.activityId, label: d.label, description: d.description, caps: fd.getAll('caps').map((id) => ({ id, w: 1 })) }); closeSheet(); toast('Catégorie enregistrée'); render(); };
ACT.catDel = async (el) => { const cat = item('category', el.dataset.id); if (!cat) return; const used = itemsOf('metric').some((m) => (m.caps || []).some((x) => x.id === cat.id)); if (!(await ask(`Supprimer la catégorie « ${cat.label} » ?`, { danger: true, ok: used ? 'Archiver' : 'Supprimer', detail: used ? 'Des métriques y sont reliées : elle sera archivée (masquée) pour ne rien casser.' : '' }))) return; if (used) putItem('category', cat.id, { ...cat, archived: true }); else delItem('category', cat.id); closeSheet(); render(); };
function metricForm(m) {
  const c = ctx(), caps = new Set((m?.caps || []).map((x) => x.id));
  return h`<h2 style="margin:0">${m ? 'Modifier la métrique' : 'Nouvelle métrique'}</h2><form data-submit="metricSave" class="stack"><input type="hidden" name="id" value="${m?.id || ''}">
    <label>Ce qui est mesuré<input name="label" required maxlength="80" value="${m?.label || ''}" placeholder="Ex. Détente au panier, 40 km vélo…"></label>
    <div class="grid2"><label>Unité<input name="unit" maxlength="20" value="${m?.unit || ''}" placeholder="reps, kg, s, km, cm…"></label><label>Sens<select name="dir"><option value="1" ${m?.dir !== -1 ? 'selected' : ''}>Plus c’est haut, mieux c’est</option><option value="-1" ${m?.dir === -1 ? 'selected' : ''}>Plus c’est bas, mieux c’est (temps)</option></select></label></div>
    <label>Activité<select name="activityId"><option value="">Toutes</option>${Object.values(c.activities).map((a) => h`<option value="${a.id}" ${m?.activityId === a.id ? 'selected' : ''}>${a.label}</option>`)}</select></label>
    <label>Capacités suivies</label><div class="chips">${[...Object.entries(CAPACITIES), ...Object.values(c.categories).map((x) => [x.id, { label: x.label + ' (catégorie)' }])].map(([id, x]) => h`<label class="chip ${caps.has(id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="caps" value="${id}" ${caps.has(id) ? 'checked' : ''} data-change="chipToggle">${x.label}</label>`)}</div>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${m ? h`<button class="btn danger" type="button" data-act="metricArchive" data-id="${m.id}">Archiver</button>` : ''}</div></form>`;
}
ACT.metricNew = () => openSheet(metricForm(null), { wide: true });
ACT.metricEdit = (el) => { const m = item('metric', el.dataset.id); if (m) openSheet(metricForm(m), { wide: true }); };
SUBMIT.metricSave = (f) => { const fd = new FormData(f), d = Object.fromEntries(fd); putItem('metric', d.id || 'm-' + uid().slice(0, 12), { label: d.label, unit: d.unit, dir: Number(d.dir) === -1 ? -1 : 1, activityId: d.activityId, kind: 'other', caps: fd.getAll('caps').map((id) => ({ id, w: 1 })) }); closeSheet(); toast('Métrique enregistrée'); render(); };
ACT.metricArchive = (el) => { const m = item('metric', el.dataset.id); if (m) { putItem('metric', m.id, { ...m, archived: true }); closeSheet(); toast('Métrique archivée (performances conservées)'); render(); } };

/* ═════════ Performances (valeurs observées) ═════════ */
function vPerfs() {
  const c = ctx(), rem = testReminders(c);
  const groups = new Map();
  for (const p of c.perfs) { if (!groups.has(p.metricId)) groups.set(p.metricId, []); groups.get(p.metricId).push(p); }
  return h`<div class="row wrapf"><button class="btn pri" data-act="perfAdd">＋ Saisir une performance</button><button class="btn" data-act="metricNew">＋ Métrique personnalisée</button></div>
    ${rem.length ? h`<div class="card flat"><h3>📏 Tests utiles</h3>${rem.map((t) => h`<div class="item"><div class="grow small">${t.text}${t.test ? h`<div class="tiny muted">Protocole : ${t.test}</div>` : ''}</div><button class="btn sm" data-act="perfAdd" data-id="${t.metricId}">Saisir</button></div>`)}<p class="tiny muted">Aucune valeur n’est jamais inventée : sans mesure, l’application reste prudente.</p></div>` : ''}
    ${groups.size ? [...groups.entries()].map(([mid, list]) => { const m = c.metrics[mid] || { label: mid, unit: '' }; const t = metricTrend(mid, c); const pts = list.filter((p) => !p.unknown && p.value != null).sort((a, b) => a.date - b.date).map((p) => ({ v: p.value })); return h`<div class="card"><div class="row between"><h3>${m.label}</h3><button class="btn sm" data-act="perfAdd" data-id="${mid}">＋</button></div>
      ${m.tiers ? h`<p class="tiny muted">${metricTierText(m)}</p>` : ''}${t ? h`<p class="small">${t.dir > 0 ? '📈' : t.dir < 0 ? '📉' : '➖'} ${t.text}</p>` : ''}${pts.length >= 2 ? lineChart(pts, m.unit) : ''}
      ${list.slice(0, 8).map((p) => h`<div class="item"><div class="grow"><b>${perfText(p, c)}</b> ${tag(({ measured: 'mesuré', declared: 'déclaré', imported: 'importé', session: 'relevé en séance' })[p.source] || p.source, SOURCE_TAG[({ measured: 'mesuré', declared: 'déclaré' })[p.source]] || '')}${p.styles?.length ? h`<div class="tiny muted">${p.styles.map((s) => c.styles[s]?.label || s).join(', ')}</div>` : ''}<div class="tiny muted">${fmtDay(p.date)}${p.note ? ' · ' + p.note : ''}</div></div><button class="btn sm ic" data-act="perfEdit" data-id="${p.id}" aria-label="Modifier">✎</button><button class="btn danger sm ic" data-act="perfDel" data-id="${p.id}" aria-label="Supprimer">✕</button></div>`)}</div>`; })
      : empty('Aucune performance. Saisis un test (tractions max, 5 km, suspension…) ou indique « je ne sais pas » : l’application te proposera un test.')}`;
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
    <label>Métrique<select name="metricId" data-change="perfMetric" required><option value="">— choisir —</option>${list.map(([id, x]) => h`<option value="${id}" ${id === mid ? 'selected' : ''}>${x.label}${x.native ? '' : ' (perso)'}</option>`)}</select></label>
    ${m?.test ? h`<p class="tiny muted">Protocole : ${m.test}</p>` : ''}${m?.tiers ? h`<p class="tiny muted">${metricTierText(m)}</p>` : ''}
    ${isGrade ? h`<label>Système de cotation<select name="systemId" data-change="perfSystem">${systems.map((s) => h`<option value="${s.id}" ${(p?.grade?.systemId || S.perfSys) === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
      <label>Niveau<select name="levelId">${sortedLevels(c.systems[p?.grade?.systemId || S.perfSys] || systems[0]).map((l) => h`<option value="${l.id}" ${p?.grade?.levelId === l.id ? 'selected' : ''}>${l.label}</option>`)}</select></label>
      <label>Styles (plusieurs possibles)</label><div class="chips">${styles.map((s) => h`<label class="chip ${(p?.styles || []).includes(s.id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="styles" value="${s.id}" ${(p?.styles || []).includes(s.id) ? 'checked' : ''} data-change="chipToggle">${s.label}</label>`)}</div>
      <label>Contexte<select name="ctxKind"><option value="">—</option>${[['salle', 'Salle'], ['falaise', 'Falaise / extérieur']].map(([k, l]) => h`<option value="${k}" ${p?.context?.kind === k ? 'selected' : ''}>${l}</option>`)}</select></label>`
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
  putItem('perf', d.id || 'p-' + uid().slice(0, 14), { metricId: d.metricId, value, unknown, unit: m.unit, date, source: d.source, grade, styles: fd.getAll('styles'), context: { kind: d.ctxKind || '' }, note: d.note });
  closeSheet(); buzzOk(); toast(unknown ? 'Noté « je ne sais pas » : un test te sera proposé.' : 'Performance enregistrée'); render();
};
ACT.perfDel = async (el) => { const p = item('perf', el.dataset.id); if (p && (await ask('Supprimer cette performance ?', { ok: 'Supprimer', danger: true }))) { delItem('perf', p.id); render(); } };

/* ═════════ Escalade : systèmes de cotation, styles, maxima, journal ═════════ */
function vClimbing() {
  const c = ctx();
  const userSys = Object.values(c.systems).filter((s) => !s.builtin);
  const maxPerfs = c.perfs.filter((p) => p.metricId === 'max_bloc' || p.metricId === 'max_voie');
  const sum = maximaSummary(maxPerfs, c.styles);
  return h`<div class="card"><div class="row between"><h3>🧗 Mes maxima</h3><button class="btn sm pri" data-act="perfAdd" data-id="max_bloc">＋ Bloc</button><button class="btn sm pri" data-act="perfAdd" data-id="max_voie">＋ Voie</button></div>
      <p class="tiny muted">Plusieurs maxima possibles : par système de cotation, par style (multi-sélection) et par contexte. Chaque saisie garde le système utilisé à ce moment-là.</p>
      ${sum.length ? sum.map((x) => h`<div class="card flat"><b>${x.systemName}</b> ${c.systems[x.systemId]?.archived ? tag('archivé') : !c.systems[x.systemId] ? tag('supprimé') : ''}<p class="small">Meilleur : <b>${snapshotText(x.best.grade, c.systems)}</b> (${fmtDay(x.best.date)})</p>${x.byStyle.length ? h`<div class="chips">${x.byStyle.map((s) => h`<span class="chip static">${s.label} : ${s.perf.grade.label}</span>`)}</div>` : ''}
        <details><summary class="small">${x.entries.length} saisie(s)</summary>${x.entries.map((p) => h`<div class="item"><div class="grow small">${p.grade.label} · ${fmtDay(p.date)}${p.styles?.length ? ' · ' + p.styles.map((s) => c.styles[s]?.label || s).join(', ') : ''}${p.context?.kind ? ' · ' + p.context.kind : ''}</div><button class="btn sm ic" data-act="perfEdit" data-id="${p.id}">✎</button><button class="btn danger sm ic" data-act="perfDel" data-id="${p.id}">✕</button></div>`)}</details></div>`) : h`<p class="muted small">Aucun maximum enregistré.</p>`}</div>
    <div class="card"><div class="row between"><h3>Systèmes de cotation</h3><button class="btn sm" data-act="sysNew">＋ Système</button></div>
      ${Object.values(BUILTIN_SYSTEMS).map((s) => h`<div class="item"><div class="grow"><b>${s.name}</b> ${tag('intégré')}<div class="tiny muted">${s.levels.length} niveaux${s.maps.length ? ' · correspondance usuelle vers Fontainebleau' : ''}</div></div><button class="btn sm" data-act="sysDup" data-id="${s.id}">Dupliquer</button></div>`)}
      ${userSys.map((s) => h`<div class="item"><div class="grow"><b>${s.name}</b> ${s.archived ? tag('archivé') : ''}<div class="tiny muted">${s.activity} · ${s.levels.length} niveaux · ${s.maps.length} correspondance(s)</div><div class="lvlrow">${sortedLevels(s).slice(0, 12).map((l) => raw(`<span class="lvl" style="${l.color ? `background:${l.color}` : ''}">${l.label.replace(/[<>&"]/g, '')}</span>`))}</div></div><button class="btn sm" data-act="sysEdit" data-id="${s.id}">✎</button></div>`)}</div>
    <div class="card"><div class="row between"><h3>Styles</h3><button class="btn sm" data-act="styleNew">＋ Style</button></div>
      <div class="chips">${Object.values(c.styles).filter((s) => !s.archived).map((s) => s.builtin ? h`<span class="chip static">${s.label}</span>` : chip(false, s.label + ' ✎', `data-act="styleEdit" data-id="${s.id}"`))}</div>
      ${Object.values(c.styles).some((s) => s.archived) ? h`<p class="tiny muted">Archivés (conservés dans l’historique) : ${Object.values(c.styles).filter((s) => s.archived).map((s) => s.label).join(', ')}</p>` : ''}</div>
    <div class="card"><div class="row between"><h3>Journal de grimpe</h3><button class="btn sm pri" data-act="ascNew">＋ Bloc / voie</button></div>
      ${c.ascents.slice(0, 20).map((a) => h`<div class="item"><div class="grow"><b>${a.kind === 'voie' ? 'Voie' : 'Bloc'} ${a.grade?.label ? snapshotText(a.grade, c.systems) : a.gradeText || ''}</b>${a.name ? h` — ${a.name}` : ''}<div class="tiny muted">${({ flash: 'flash', send: 'réussi', work: 'réussi après travail', top: 'top', attempt: 'essai', fail: 'échec' })[a.result]} · ${a.attempts} essai(s)${a.styles?.length ? ' · ' + a.styles.map((s) => c.styles[s]?.label || s).join(', ') : a.styleText ? ' · ' + a.styleText : ''} · ${fmtDay(a.date)}</div></div><button class="btn danger sm ic" data-act="ascDel" data-id="${a.id}" aria-label="Supprimer">✕</button></div>`)}
      ${c.ascents.length ? '' : h`<p class="muted small">Note tes blocs et voies pour suivre ton niveau et tes styles.</p>`}</div>`;
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
ACT.styleEdit = (el) => { const s = item('style', el.dataset.id); if (s) openSheet(h`<h2 style="margin:0">Style</h2><form data-submit="styleSave" class="stack"><input type="hidden" name="id" value="${s.id}"><label>Nom<input name="label" required maxlength="40" value="${s.label}"></label><div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn danger" type="button" data-act="styleArchive" data-id="${s.id}">Archiver</button></div></form>`); };
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
  const list = c.goals.filter((g) => (S.filters.goals || 'active') === 'all' || (g.status || 'active') === (S.filters.goals || 'active'));
  return h`<div class="row wrapf"><button class="btn pri" data-act="goalNew">＋ Objectif</button></div>
    <div class="chips">${[['active', 'Actifs'], ['done', 'Atteints'], ['archived', 'Archivés'], ['all', 'Tous']].map(([k, l]) => chip((S.filters.goals || 'active') === k, l, `data-act="goalFilter" data-id="${k}"`))}</div>
    ${list.length ? list.map((g) => { const pr = goalProgress(g, c); return h`<button class="card pick goalcard" data-act="goalOpen" data-id="${g.id}"><div class="row between"><b>${g.type === 'skill' ? SKILLS[g.skillId]?.emoji + ' ' : ''}${goalLabel(g)}</b><span class="small">${pr.pct == null ? '—' : pr.pct + ' %'}</span></div>${meter(pr.pct || 0)}<div class="tiny muted">${pr.text}</div></button>`; }) : empty('Aucun objectif ici. Exemples : front lever, drapeau, traction à un bras, 20 tractions, 7A en bloc, 3 séances par semaine…')}
    <div class="card flat"><h3>Figures proposées</h3><div class="chips">${Object.entries(SKILLS).map(([id, s]) => chip(false, `${s.emoji} ${s.label}`, `data-act="goalNewSkill" data-id="${id}"`))}</div></div>`;
}
ACT.goalFilter = (el) => { S.filters.goals = el.dataset.id; render(); };
ACT.goalNew = () => openSheet(goalForm(null), { wide: true });
ACT.goalNewSkill = (el) => { closeSheet(); const s = SKILLS[el.dataset.id]; const ex = ctx().goals.find((g) => g.skillId === el.dataset.id && g.status === 'active'); if (ex) { go('profile', 'goals', ex.id); return; } const id = 'g-' + uid().slice(0, 12); putItem('goal', id, { type: 'skill', skillId: el.dataset.id, label: s.label, status: 'active', startedAt: Date.now() }); toast(`Objectif « ${s.label} » créé`); go('profile', 'goals', id); };
function goalForm(g) {
  const c = ctx(), t = g?.type || S.goalType || 'metric';
  const systems = Object.values(c.systems).filter((s) => !s.archived);
  return h`<h2 style="margin:0">${g ? 'Modifier l’objectif' : 'Nouvel objectif'}</h2><form data-submit="goalSave" class="stack"><input type="hidden" name="id" value="${g?.id || ''}">
    <label>Type<select name="type" data-change="goalType">${[['skill', 'Figure / skill'], ['metric', 'Performance à atteindre'], ['grade', 'Niveau d’escalade'], ['sessions', 'Nombre de séances'], ['ascents', 'Réussites en escalade'], ['custom', 'Autre (valeur manuelle)']].map(([k, l]) => h`<option value="${k}" ${t === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    ${t === 'skill' ? h`<label>Figure<select name="skillId">${Object.entries(SKILLS).map(([id, s]) => h`<option value="${id}" ${g?.skillId === id ? 'selected' : ''}>${s.emoji} ${s.label}</option>`)}</select></label>` : ''}
    ${t === 'metric' ? h`<label>Métrique<select name="metricId">${Object.entries(c.metrics).filter(([, m]) => m.kind !== 'grade').map(([id, m]) => h`<option value="${id}" ${g?.metricId === id ? 'selected' : ''}>${m.label}</option>`)}</select></label>${numberField('target', 'Valeur visée', g?.target ?? '', { required: true })}` : ''}
    ${t === 'grade' ? h`<label>Discipline<select name="metricId"><option value="max_bloc" ${g?.metricId !== 'max_voie' ? 'selected' : ''}>Bloc</option><option value="max_voie" ${g?.metricId === 'max_voie' ? 'selected' : ''}>Voie</option></select></label><label>Système<select name="systemId" data-change="goalSys">${systems.map((s) => h`<option value="${s.id}" ${(g?.gradeTarget?.systemId || S.goalSys || 'font') === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label><label>Niveau visé<select name="levelId">${sortedLevels(c.systems[g?.gradeTarget?.systemId || S.goalSys || 'font']).map((l) => h`<option value="${l.id}" ${g?.gradeTarget?.levelId === l.id ? 'selected' : ''}>${l.label}</option>`)}</select></label>` : ''}
    ${['sessions', 'ascents', 'custom'].includes(t) ? h`<label>Nom<input name="label" maxlength="80" value="${g?.label || ''}" required placeholder="${t === 'sessions' ? '3 séances par semaine pendant 1 mois' : 'Mon objectif'}"></label>${numberField('target', 'Cible', g?.target ?? '', { required: true })}${t === 'custom' ? numberField('current', 'Valeur actuelle', g?.current ?? 0) : ''}` : ''}
    ${['metric', 'grade', 'skill'].includes(t) ? h`<label>Nom (facultatif)<input name="label" maxlength="80" value="${g?.label || ''}"></label>` : ''}
    <label>Échéance (facultatif)<input type="date" name="deadline" value="${g?.deadline || ''}"></label>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button></div></form>`;
}
CHG.goalType = (el) => { S.goalType = el.value; openSheet(goalForm(el.form.id.value ? { ...item('goal', el.form.id.value), type: el.value } : null), { wide: true }); };
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
  const tabs = [['overview', 'Vue d’ensemble'], ['blockers', 'Ce qui bloque'], ...(sk ? [['tree', 'Progression'], ['paths', 'Chemins']] : []), ['graph', 'Graphe'], ['whatif', 'Et si… ?'], ['why', 'Pourquoi je stagne ?']];
  return h`<div class="row"><button class="btn sm" data-act="goalBack" aria-label="Retour">‹</button><h2 class="grow" style="margin:0">${sk?.emoji || '🎯'} ${goalLabel(g)}</h2></div>
    <div class="card">${meter(pr.pct || 0)}<p class="small">${pr.text}</p>${g.deadline ? h`<p class="tiny muted">Échéance : ${g.deadline}</p>` : ''}${sk ? h`<p class="small muted">${sk.desc}</p>` : ''}
      <div class="row wrapf"><button class="btn pri" data-act="goalTrain" data-id="${g.id}">✨ Séance pour cet objectif</button><button class="btn" data-act="goalEdit" data-id="${g.id}">✎</button>${g.status === 'active' ? h`<button class="btn" data-act="goalStatus" data-id="${g.id}" data-v="done">✅ Atteint</button><button class="btn" data-act="goalStatus" data-id="${g.id}" data-v="archived">Archiver</button>` : h`<button class="btn" data-act="goalStatus" data-id="${g.id}" data-v="active">Réactiver</button>`}<button class="btn danger" data-act="goalDel" data-id="${g.id}">Supprimer</button></div></div>
    <div class="scrollx">${seg('goalTab', tab, tabs)}</div>${({ overview: goalOverview, blockers: goalBlockers, tree: goalTree, paths: goalPathsV, graph: goalGraph, whatif: goalWhatIf, why: goalWhy })[tab](g)}`;
}
ACT.goalBack = () => { S.goalTab = 'overview'; go('profile', 'goals'); };
ACT.goalTab = (el) => { S.goalTab = el.dataset.id; render(); };
ACT.goalOpen = (el) => { closeSheet(); S.goalTab = 'overview'; go('profile', 'goals', el.dataset.id); };
ACT.goalEdit = (el) => { S.goalType = null; openSheet(goalForm(item('goal', el.dataset.id)), { wide: true }); };
ACT.goalTrain = (el) => openGenerator({ mode: 'goal', goalId: el.dataset.id, activityId: SKILLS[item('goal', el.dataset.id)?.skillId]?.activity || '', autoPlan: true });
ACT.goalStatus = (el) => { const g = item('goal', el.dataset.id); if (!g) return; putItem('goal', g.id, { ...g, status: el.dataset.v, doneAt: el.dataset.v === 'done' ? Date.now() : g.doneAt }); toast(el.dataset.v === 'done' ? 'Bravo ! Objectif atteint 🎉' : 'Objectif mis à jour'); render(); };
ACT.goalDel = async (el) => { const g = item('goal', el.dataset.id); if (g && (await ask(`Supprimer l’objectif « ${goalLabel(g)} » ?`, { danger: true, ok: 'Supprimer' }))) { delItem('goal', g.id); go('profile', 'goals'); } };
function goalOverview(g) {
  const c = ctx(), caps = goalCaps(g, c);
  return h`<div class="card"><h3>Capacités requises</h3>${caps.map((x) => { const st = capacityState(x.id, c); return h`<button class="item pick" data-act="capOpen" data-id="${x.id}"><div class="grow"><b>${capL(x.id)}</b> <span class="tiny muted">poids ${x.w}</span><div>${statusTag(st)} ${st.level != null ? h`<span class="tiny muted">confiance ${confWord(st.confidence)}</span>` : ''}</div></div></button>`; })}</div>
    ${SKILLS[g.skillId] ? h`<div class="card"><h3>Repères de préparation</h3>${SKILLS[g.skillId].criteria.map((cr) => { const m = c.metrics[cr.metric], p = perfsOf(cr.metric, c).find((x) => !x.unknown); return h`<div class="item"><div class="grow"><b>${m.label}</b> : repère ${cr.target} ${m.unit}<div class="tiny muted">${cr.why}</div><div class="tiny">${p ? `Toi : ${perfText(p, c)} (${fmtDay(p.date)})` : 'Pas encore mesuré'}</div></div><button class="btn sm" data-act="perfAdd" data-id="${cr.metric}">Saisir</button></div>`; })}<p class="tiny muted">Repères indicatifs courants, pas une garantie de progression.</p></div>` : ''}`;
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
  const { normalizeEx: nx } = await import('./shared.js');
  const { saveSeance } = await import('./state.js');
  const exs = p.exercises.map((id) => byId(id)).filter(Boolean).map((l) => nx({ ...l, id: uid(), libId: l.id, ok: l.cues, bad: l.bad, block: 'main', why: `Chemin « ${p.label} » vers ${sk.label}` }));
  const s = saveSeance({ id: uid(), name: `${sk.label} — ${p.label}`, emoji: sk.emoji, source: 'generated', activity: sk.activity, exercises: exs, context: { goalId: g.id, plannedMin: p.minutes }, objectives: [p.traits] });
  toast('Séance créée'); go('library', 'seance', s.id);
};
function goalGraph(g) {
  const gr = graphFromGoal(g, ctx());
  return h`<div class="card"><h3>Objectif → capacités → exercices → métriques</h3><p class="tiny muted">Touche un élément pour explorer dans l’autre sens.</p>
    ${gr.map((x) => h`<div class="graphnode"><button class="btn sm" data-act="capOpen" data-id="${x.capId}">${x.label} (${x.w})</button><div class="graphchildren"><div class="tiny muted">Exercices</div><div class="chips">${x.exercises.map((e) => chip(false, e.name, `data-act="libInfo" data-id="${e.id}"`))}</div><div class="tiny muted">Métriques de suivi</div><div class="chips">${x.metrics.map((m) => chip(false, m.label, `data-act="perfAdd" data-id="${m.id}"`))}</div><div class="tiny muted">Muscles : ${x.muscles.map((m) => m.label).join(', ') || '—'}</div></div></div>`)}</div>`;
}
function goalWhatIf(g) {
  const caps = goalCaps(g, ctx()), cap = S.whatCap || caps[0]?.id, n = S.whatN || 2;
  const w = cap ? whatIf(cap, n, ctx()) : null;
  return h`<div class="card"><h3>Simulation « Et si… ? »</h3><label>Si je travaillais<select data-change="whatCap">${caps.map((x) => h`<option value="${x.id}" ${x.id === cap ? 'selected' : ''}>${capL(x.id)}</option>`)}</select></label>
    <div class="chips">${[1, 2, 3, 4].map((k) => chip(n === k, `${k}× / semaine`, `data-act="whatN" data-id="${k}"`))}</div>${w ? h`<p class="small">${w.text}</p><p class="tiny muted">${w.disclaimer}</p>` : ''}</div>`;
}
CHG.whatCap = (el) => { S.whatCap = el.value; render(); };
ACT.whatN = (el) => { S.whatN = Number(el.dataset.id); render(); };
function goalWhy(g) {
  const w = whyNoProgress(g, ctx());
  return h`<div class="card"><h3>Pourquoi je ne progresse pas ?</h3><p class="tiny muted">${w.note}</p>${w.hypotheses.map((x) => h`<div class="card flat"><b>${x.title}</b><p class="small">${x.text}</p></div>`)}${howBox({ facts: w.facts, missing: w.missing }, { open: true, title: 'Données utilisées' })}</div>`;
}

/* ═════════ Matériel et environnements ═════════ */
function vEquipment() {
  const c = ctx(), un = new Set(item('config', 'equipment')?.unavailable || []), main = item('config', 'main') || {};
  return h`<div class="row wrapf"><button class="btn pri" data-act="envNew">＋ Environnement</button></div>
    ${c.envs.length ? c.envs.map((e) => h`<div class="card"><div class="row between"><div><b>${e.name}</b> ${tag(ENV_TYPES[e.type] || e.type)} ${(main.envId ? main.envId === e.id : e.isDefault) ? tag('par défaut', 'acc') : ''}</div><button class="btn sm" data-act="envEdit" data-id="${e.id}">✎</button></div><p class="small muted">${e.equipment.map((k) => EQUIPMENT[k] || k).join(', ') || 'Aucun matériel'}</p>${(main.envId ? main.envId !== e.id : !e.isDefault) ? h`<button class="btn sm" data-act="envDefault" data-id="${e.id}">Utiliser par défaut</button>` : ''}</div>`) : empty('Aucun environnement. Décris où tu t’entraînes (maison, salle, extérieur, salle d’escalade, piscine, piste…) et ton matériel : le générateur ne proposera que ce qui est possible.')}
    <div class="card"><h3>Indisponible aujourd’hui</h3><p class="tiny muted">Une barre prise, pas de poutre ? Décoche-le : les séances générées s’adaptent et expliquent les remplacements.</p>
      <div class="chips">${[...new Set(c.envs.flatMap((e) => e.equipment))].map((k) => chip(!un.has(k), EQUIPMENT[k] || k, `data-act="eqToggle" data-id="${k}"`))}</div>${un.size ? h`<button class="btn sm" data-act="eqReset">Tout est disponible</button>` : ''}</div>`;
}
function envForm(e) {
  const t = e?.type || S.envType || 'maison', eq = new Set(e?.equipment || ENV_TEMPLATES[t] || []);
  return h`<h2 style="margin:0">${e ? 'Modifier' : 'Nouvel'} environnement</h2><form data-submit="envSave" class="stack"><input type="hidden" name="id" value="${e?.id || ''}">
    <div class="grid2"><label>Nom<input name="name" required maxlength="60" value="${e?.name || ENV_TYPES[t]}"></label><label>Type<select name="type" data-change="envType">${Object.entries(ENV_TYPES).map(([k, l]) => h`<option value="${k}" ${t === k ? 'selected' : ''}>${l}</option>`)}</select></label></div>
    <label>Matériel disponible</label><div class="chips">${Object.entries(EQUIPMENT).map(([k, l]) => h`<label class="chip ${eq.has(k) ? 'on' : ''}"><input type="checkbox" class="hidden" name="eq" value="${k}" ${eq.has(k) ? 'checked' : ''} data-change="chipToggle">${l}</label>`)}</div>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${e ? h`<button class="btn danger" type="button" data-act="envDel" data-id="${e.id}">Supprimer</button>` : ''}</div></form>`;
}
ACT.envNew = () => { S.envType = 'maison'; openSheet(envForm(null), { wide: true }); };
ACT.envEdit = (el) => { const e = item('env', el.dataset.id); if (e) openSheet(envForm(e), { wide: true }); };
CHG.envType = (el) => { if (!el.form.id.value) { S.envType = el.value; openSheet(envForm(null), { wide: true }); } };
SUBMIT.envSave = (f) => { const fd = new FormData(f), d = Object.fromEntries(fd); const first = !ctx().envs.length; putItem('env', d.id || 'env-' + uid().slice(0, 12), { name: d.name, type: d.type, equipment: fd.getAll('eq'), isDefault: d.id ? item('env', d.id)?.isDefault : first }); closeSheet(); buzzOk(); toast('Environnement enregistré'); render(); };
ACT.envDel = async (el) => { const e = item('env', el.dataset.id); if (e && (await ask(`Supprimer « ${e.name} » ?`, { danger: true, ok: 'Supprimer' }))) { delItem('env', e.id); closeSheet(); render(); } };
ACT.envDefault = (el) => { putItem('config', 'main', { ...(item('config', 'main') || {}), envId: el.dataset.id }); toast('Environnement par défaut modifié'); render(); };
ACT.eqToggle = (el) => { const conf = item('config', 'equipment') || {}, un = new Set(conf.unavailable || []); un.has(el.dataset.id) ? un.delete(el.dataset.id) : un.add(el.dataset.id); putItem('config', 'equipment', { ...conf, unavailable: [...un] }); render(); };
ACT.eqReset = () => { putItem('config', 'equipment', { unavailable: [] }); render(); };

/* ═════════ Préférences, habitudes, zones à ménager ═════════ */
function vPrefs() {
  const c = ctx(), learned = learnedPreferences(c).slice(0, 25), hb = habits(c), av = S.settings.avoid || {};
  return h`<div class="card"><h3>Mes préférences d’exercices</h3><p class="tiny muted">« Évite » réduit la probabilité qu’un exercice soit proposé, sans jamais supprimer un exercice indispensable à ton objectif (dans ce cas, il est gardé avec une explication).</p>
      ${Object.values(c.prefs).length ? Object.values(c.prefs).map((p) => h`<div class="item"><div class="grow"><b>${p.label || p.key}</b><div class="tiny muted">${p.reason || ({ explicit: 'choix explicite', habit: 'habitude confirmée', questionnaire: 'questionnaire' })[p.source]}</div></div>${prefChips(p.key, p.label, p.value)}</div>`) : h`<p class="muted small">Aucune préférence enregistrée.</p>`}</div>
    <div class="card"><h3>Ce que l’application observe</h3>${learned.length ? learned.map((x) => h`<div class="item"><div class="grow"><b>${x.name}</b><div class="tiny muted">${x.text || '—'}</div>${x.suggestion ? h`<div class="tiny acc-t">Suggestion : ${x.suggestion === 'evite' ? 'l’éviter' : 'le marquer comme apprécié'} ?</div>` : ''}</div>${prefChips(x.key, x.name, x.explicit)}</div>`) : h`<p class="muted small">Pas encore de données.</p>`}</div>
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
  try { so.me = await api('GET', '/api/social/me'); so.feed = await api('GET', '/api/social/feed?tz=' + new Date().getTimezoneOffset()); const mine = await api('GET', '/api/shared?scope=public&mine=1'); so.mine = mine.items; }
  catch (e) { so.error = e.offline ? 'Connexion requise pour le partage.' : e.message; }
  so.loading = false; render();
}
function vPublic() {
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
      <b class="small">Activités partagées</b><div class="chips">${Object.values(c.activities).map((a) => h`<label class="chip ${sel('activities', a.itemId) ? 'on' : ''}"><input type="checkbox" class="hidden" name="activities" value="${a.itemId}" ${sel('activities', a.itemId) ? 'checked' : ''} data-change="chipToggle">${a.label}</label>`)}</div>
      <b class="small">Objectifs partagés</b><div class="chips">${c.goals.map((g) => h`<label class="chip ${sel('goals', g.id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="goals" value="${g.id}" ${sel('goals', g.id) ? 'checked' : ''} data-change="chipToggle">${goalLabel(g)}</label>`)}</div>
      <b class="small">Performances partagées</b><div class="chips">${c.perfs.filter((x) => !x.unknown).slice(0, 40).map((x) => h`<label class="chip ${sel('perfs', x.id) ? 'on' : ''}"><input type="checkbox" class="hidden" name="perfs" value="${x.id}" ${sel('perfs', x.id) ? 'checked' : ''} data-change="chipToggle">${c.metrics[x.metricId]?.label || 'Perf'} : ${perfText(x, c)}</label>`)}</div>
      <b class="small">Capacités partagées</b><div class="chips">${states.map((s) => h`<label class="chip ${(sh.caps || []).some((x) => x.id === s.capId) ? 'on' : ''}"><input type="checkbox" class="hidden" name="caps" value="${s.capId}" ${(sh.caps || []).some((x) => x.id === s.capId) ? 'checked' : ''} data-change="chipToggle">${s.label}</label>`)}</div>
      <button class="btn pri" type="submit">Enregistrer mes choix de partage</button>
      <p class="tiny muted">Lien public (si visibilité publique) : ${location.origin}/#/profile/public/${S.user.username}</p></form>
    <div class="card"><h3>Mes séances publiques</h3>${(so.mine || []).length ? so.mine.map((x) => h`<div class="item"><div class="grow"><b>${x.title}</b><div class="tiny muted">${x.exerciseCount} exercices · modifiée ${relDate(x.updatedAt)}</div></div><button class="btn danger sm" data-act="pubDel" data-id="${x.id}">Retirer</button></div>`) : h`<p class="muted small">Publie une séance depuis son écran (bouton « Partager »).</p>`}</div>
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
ACT.pubDel = async (el) => { if (!(await ask('Retirer cette séance de ton profil public ?', { danger: true, ok: 'Retirer' }))) return; try { await api('DELETE', `/api/shared/${encodeURIComponent(el.dataset.id)}`); loadSocial(); } catch (e) { toast(e.message); } };
ACT.pubCopy = async (el) => {
  try {
    const r = await api('GET', `/api/public/s/${encodeURIComponent(el.dataset.id)}`);
    const { normalizeSession } = await import('./shared.js'); const { saveSeance } = await import('./state.js');
    const now = Date.now(), src = normalizeSession(r.item.session);
    const s = saveSeance({ ...src, id: uid(), name: r.item.title, source: 'copy', exercises: src.exercises.map((e) => ({ ...e, id: uid(), note: '' })), origin: { kind: 'public', id: r.item.id, author: r.item.author || '', copiedAt: now }, createdAt: now, updatedAt: now });
    toast('Copie indépendante enregistrée'); go('library', 'seance', s.id);
  } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message); }
};
