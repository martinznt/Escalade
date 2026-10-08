import { advancedUI, creationChoices, comparisonView } from './views-experience.js';
import { visibleEx, exHidden } from './sportprefs.js';
import { registerPaths } from './pathlinks.js';
// views-library.js — Bibliothèque : mes séances (création, édition, modèles, archives), générateur avec simulation,
// exercices (anatomie, capacités), bibliothèque commune (contributions, copies indépendantes), recherche.
import { personalFit } from './fit.js';
import { vGym } from './views-gym.js';
import { vRoutines, myRoutines } from './views-routines.js';
import { h, raw, esc, $, toast, openSheet, closeSheet, ask, seg, chip, menuList, menuRow, subHead, tag, empty, howBox, exLine, fmtDay, relDate, numberField, buzzOk, skeleton } from './ui.js';
import { linkSheet } from './share.js';
import './duo.js';
import './views-ai.js';
import { S, ACT, SUBMIT, CHG, INPUT, ctx, go, render, getSeance, saveSeance, deleteSeance, api, itemsOf, item, putItem, queue, newId, syncSoon, ls } from './state.js';
import { cleanParts } from './format.js';
import { vClimbPlan } from './views-climbplan.js';
import { setReturn } from './nav.js';
import { composePage, savedLayouts } from './layout.js';
import { adaptButton } from './views-adapt.js';
import { groupButton } from './views-group.js';
import { mergeAdvice, bestMerges, mergeSessions, orderForMerge } from './merge.js';
import { orderAdvice, similarOptions } from './guide.js';
import { exWhat, exUse, exWhyHere, sessionWhat, sessionUse, sessionWhy } from './explain.js';
import { CATS, SORTS, FORMS, GROUPS, groupSessions, filterSessions, activeFilters, categoriesOf, autoCategories, sportsOf, placeOf, intensityOf, INTENSITY_LABEL } from './sfilter.js';
import { uid, normalizeEx, normalizeSession, exKey } from './shared.js';
import { LIBRARY, byId, SOURCES } from './library.js';
import { capOptionGroups, CAPACITIES, MUSCLES, ACTIVITIES, INTENTIONS, EQUIPMENT, SKILLS } from './model.js';
import { parseSessionText, exportSessionText, sessionMinutes, exMinutes, parseRest, parseQuickList } from './engine.js';
import { boostSession } from './program.js';
import { vGenerateForm, genOptions } from './views-gen.js';
import { vCatalog, vBest } from './views-catalog.js';
import { sourcesLine } from './srcui.js';
import { CATALOG } from './catalog.js';
import { exerciseEditButtons, isAdmin as contentAdmin, shareButton } from './content.js';
import { planSession, generateFromPlan, adaptDuration, alternatives, replaceExercise, rebuildForEquipment, newPossibilities, estimateLevel, LEVEL_LABEL, levelFor, BODY_WORDS } from './generator.js';
import { availableEquipment, graphFromExercise, goalLabel, activeGoals, neverTried, exCaps, activityLabel } from './brain.js';
import { anatomySvg } from './anatomy.js';
import { classicSearch, smartSearch } from './search.js';
import { toReference, fromReference, snapshotText, REFERENCE } from './grading.js';
import { startPlayer } from './player.js';

const capL = (id) => CAPACITIES[id]?.label || ctx().categories[id]?.label || id;
const actEmoji = (id) => ctx().activities[id]?.emoji || ACTIVITIES[id]?.emoji || '🏅';
export function activityOptions() {
  const c = ctx(), out = [];
  for (const [id, a] of Object.entries(c.activities)) out.push([id, a.emoji || '🏅', a.label]);
  for (const [id, a] of Object.entries(ACTIVITIES)) if (!c.activities[id]) out.push([id, a.emoji, a.label]);
  return out;
}
const BLOCKS = { warmup: '🔥 Échauffement', main: '💪 Corps de séance', cool: '🧘 Retour au calme' };
const levelTag = (lv) => (lv?.level ? tag(LEVEL_LABEL[lv.level] + ' (estimé)', lv.level === 'avance' ? 'warn' : lv.level === 'intermediaire' ? 'info' : 'ok') : '');
/** Métadonnées automatiques d'une séance commune : étiquettes, et « Classée ainsi parce que… » (raisons réelles). */
const metaTags = (m) => (m?.tags?.length ? h`<div class="chips">${m.tags.map((t) => h`<span class="chip static">${t}</span>`)}</div>` : '');
function metaWhy(m) {
  if (!m?.reasons?.length) return '';
  return h`<details class="how"><summary>🏷 Classée ainsi parce que…</summary><ul>${m.reasons.map((r) => h`<li><b>${r.tag}</b> : ${r.why}</li>`)}</ul><p class="tiny muted">Étiquettes calculées automatiquement à partir des exercices, des phases et de la durée de la séance. Ta copie enregistrée reste indépendante.</p></details>`;
}
function levelDetails(lv, s = null) {
  if (!lv?.criteria) return '';
  const fit = s ? personalFit(s, ctx()) : null;
  const CAT = { connu: ['✓', 'connu'], estimé: ['≈', 'estimé'], inconnu: ['?', 'inconnu'] };
  return h`<details class="how"><summary>🔎 Pourquoi ce niveau ?</summary><p class="small">${lv.text}</p>
    <ul>${lv.criteria.map((c) => h`<li><span class="tag ${c.cat === 'connu' ? 'ok' : c.cat === 'estimé' ? 'warn' : ''}" title="${CAT[c.cat]?.[1] || ''}">${CAT[c.cat]?.[0] || ''} ${CAT[c.cat]?.[1] || ''}</span> <b>${c.label}</b> : ${c.value} <span class="muted">— ${c.effect}</span></li>`)}</ul>
    ${lv.unknown?.length ? h`<p class="tiny"><b>Ce que l’app ne sait pas :</b></p><ul class="tiny muted">${lv.unknown.slice(0, 6).map((u) => h`<li>${u}</li>`)}</ul>` : ''}
    ${fit && (fit.lines.length || fit.missing.length) ? h`<p class="tiny"><b>Pour toi :</b></p><ul class="tiny">${fit.lines.map((t) => h`<li>${t}</li>`)}${fit.missing.map((t) => h`<li class="muted">${t}</li>`)}</ul>` : ''}
    <p class="tiny muted">Le niveau conseillé est le prérequis le plus élevé de la séance (fiches d’exercices, cotations écrites) : un seul exercice avancé suffit. Rien n’est rempli au hasard. Jamais un classement de personnes.</p></details>`;
}

export function vLibrary() {
  const sub = S.sub.library;
  if (sub === 'seance') { const s = getSeance(S.param); if (s) { S.lastOpenSeance = s.id; S.lastOpenSeanceOwner = S.user?.id; return vEditor(s, 'local'); } }
  if (sub === 'shared-edit' && S.sharedDraft) return vEditor(S.sharedDraft.session, 'shared');
  if (sub === 'common-detail') return vCommonDetail();
  if (sub === 'import') return vImport();
  const cur = ['seances', 'climbplan', 'generate', 'gym', 'moments', 'catalog', 'best', 'exercises', 'common', 'search'].includes(sub) ? sub : 'home';
  if (cur === 'home') return h`${creationChoices()}${vLibHome()}`;
  const views = { seances: vSeances, climbplan: vClimbPlan, generate: vGenerate, gym: vGym, moments: vRoutines, catalog: vCatalog, best: vBest, exercises: vExercises, common: vCommon, search: vSearch };
  if (cur === 'best') return views.best(); // a son propre retour vers Exercices
  const [ic, t] = LIB_INFO[cur];
  return h`${subHead('libSub', 'home', 'Bibliothèque', `${ic} ${t}`)}${views[cur]()}`;
}
const LIB_INFO = {
  generate: ['🎯', 'Séance sur mesure', () => ''],
  seances: ['📋', 'Mes séances', () => { const n = S.seances.items.filter((s) => !s.archived).length; return n ? `${n} séance${n > 1 ? 's' : ''} : lancer, modifier, planifier` : 'Tes séances : lancer, modifier, planifier'; }],
  climbplan: ['✨', 'Créer une séance', () => draftText() || 'Tous sports : l’app choisit, te guide, ou tu composes'],
  gym: ['🏋️', 'Ma salle de sport', () => 'Tes machines, la séance du jour, tes charges et réglages'],
  moments: ['🧩', 'Mes moments', () => { const n = myRoutines().length; return n ? `${n} moment${n > 1 ? 's' : ''} glissé${n > 1 ? 's' : ''} dans tes séances (échauffement, fin…)` : 'Élastiques, no foot, spray wall… proposés au bon moment de tes séances'; }],
  catalog: ['📖', 'Carnet de séances', () => `${CATALOG.length} séances prêtes, de débutant à avancé, pour chaque sport`],
  exercises: ['💪', 'Exercices', () => `${LIBRARY.filter((x) => x.role === 'main').length} exercices, et le top pour toi`],
  common: ['🌍', 'Bibliothèque commune', () => 'Séances partagées par les membres (non vérifiées)'],
  search: ['🔍', 'Rechercher', () => 'Une séance, un exercice, une capacité…'],
};
registerPaths('Bibliothèque', 'library', Object.entries(LIB_INFO).map(([id, [, label]]) => [label, id]));
/** Bibliothèque : créer une séance, puis la liste des rubriques (même format que les paramètres). */
function vLibHome() {
  if (!advancedUI() && !S.lay && !savedLayouts().library) return h`<h1>Bibliothèque</h1><p class="small muted">Mes séances, le catalogue intégré et les partages.</p>${menuList([['libSub','seances','📋','Mes séances','Personnel : mes créations et mes copies'],['libSub','exercises','💪','Exercices','Catalogue intégré et exercices personnels'],['libSub','catalog','📖','Séances prêtes','Catalogue intégré'],['libSub','common','🌍','Découvrir','Publications de la communauté']])}<details class="card"><summary>Programmes et outils spécialisés</summary>${menuList([['libSub','gym','🏋️','Ma salle de sport','Machines et charges'],['libSub','moments','🧩','Mes moments','Routines et petits compléments'],['libSub','search','🔍','Rechercher','Dans toute la bibliothèque']])}</details>`;
  // Chaque élément se déplace, se masque ou se colore avec ✏️ « Organiser » (mise en page de la Bibliothèque).
  const row = (k) => () => { const [ic, t, d] = LIB_INFO[k]; return menuRow(['libSub', k, ic, t, d()]); };
  return h`<h1>Bibliothèque</h1><p class="tiny muted pagehelp">Tes séances, et tout pour en créer : par l’app, guidée, prête à l’emploi ou à la main.</p>${composePage('library', {
    newbtn: () => h`<button class="btn pri big" data-act="newChoose">＋ Nouvelle séance</button>`, draft: () => draftBanner(),
    'r-seances': row('seances'), 'r-climbplan': row('climbplan'), 'r-gym': row('gym'), 'r-moments': row('moments'), 'r-catalog': row('catalog'), 'r-exercises': row('exercises'), 'r-common': row('common'), 'r-search': row('search'),
  })}`;
}
ACT.libSub = (el) => { closeSheet(); S.sel = null; go('library', el.dataset.id); if (el.dataset.id === 'common') loadCommon(); };

/* ═════════ Mes séances ═════════ */
const SF_KEY = 'sea:seances-filter';
const sf = () => (S.sfilter ||= { sort: 'recent', form: 'normal', places: [], sports: [], cats: [], q: '', ...(ls.get(SF_KEY, {}) || {}) });
const sfSave = () => { const { q, ...keep } = sf(); ls.set(SF_KEY, keep); };
const sportName = (id) => { const c = ctx(), a = c.activities[id] || ACTIVITIES[id]; return a ? `${a.emoji || '🏅'} ${a.label}` : id; };
const catName = (k) => (CATS[k] ? `${CATS[k].emoji} ${CATS[k].label}` : `🏷 ${k}`);
const placeName = (id) => (id === 'none' ? '📍 Sans lieu' : `📍 ${ctx().envs.find((e) => e.id === id)?.name || S.seances.items.find((s) => s.context?.env === id)?.context?.envName || 'Lieu'}`);
function vSeances() {
  const st = S.filters.seances || 'active', f = sf();
  const list = filterSessions(S.seances.items, { ...f, status: st }, S.history);
  const nf = activeFilters(f), total = S.seances.items.filter((s) => (st === 'archived' ? s.archived : st === 'templates' ? s.template && !s.archived : !s.archived)).length;
  const on = [...f.places.map((x) => ['places', x, placeName(x)]), ...f.sports.map((x) => ['sports', x, sportName(x)]), ...f.cats.map((x) => ['cats', x, catName(x)])];
  return h`<button class="btn pri big" data-act="newChoose">＋ Nouvelle séance</button>
    ${S.seances.items.filter((s) => !s.archived && s.exercises.length).length >= 2 ? h`<button class="btn" data-act="mergeOpen">🔀 Fusionner des séances</button>` : ''}
    <div class="chips">${[['active', 'Actives'], ['templates', 'Modèles'], ['archived', 'Archivées']].map(([k, l]) => chip(st === k, l, `data-act="seanceFilter" data-id="${k}"`))}</div>
    <div class="row sfbar"><input type="search" class="grow" data-input="sfQ" value="${f.q}" placeholder="🔍 Chercher une séance ou un exercice" aria-label="Chercher dans mes séances">
      <button class="btn ${nf ? 'pri' : ''}" data-act="sfOpen">⇅ Trier${nf ? ` · ${nf}` : ''}</button></div>
    <div class="muted small">${SORTS[f.sort]?.[0] || ''} ${SORTS[f.sort]?.[1] || ''}${f.sort === 'form' ? ` : ${FORMS[f.form]?.[1] || ''}` : ''} · ${list.length}${list.length !== total ? ` sur ${total}` : ''} séance(s)</div>
    ${on.length ? h`<div class="chips">${on.map(([k, v, l]) => h`<button type="button" class="chip on" data-act="sfDrop" data-k="${k}" data-v="${v}" aria-label="Retirer le filtre">${l} ✕</button>`)}</div>` : ''}
    ${S.sel ? h`<div class="card acc-b selbar"><div class="row between"><b>☑ ${S.sel.length} sélectionnée(s)</b><button class="btn sm ghost" data-act="selEnd">Terminer</button></div>
      <div class="row wrapf"><button class="btn sm" data-act="selAll">Tout</button><button class="btn sm" data-act="selBulk" data-id="place" ${S.sel.length ? '' : 'disabled'}>📍 Lieu</button><button class="btn sm" data-act="selBulk" data-id="cat" ${S.sel.length ? '' : 'disabled'}>🗂 Catégorie</button><button class="btn sm" data-act="selBulk" data-id="sport" ${S.sel.length ? '' : 'disabled'}>🏷 Sport</button><button class="btn sm" data-act="selMerge" ${S.sel.length >= 2 && S.sel.length <= 4 ? '' : 'disabled'}>🔀 Fusionner</button><button class="btn sm" data-act="selArchive" ${S.sel.length ? '' : 'disabled'}>${st === 'archived' ? '↩ Désarchiver' : '🗄 Archiver'}</button></div></div>`
      : list.length ? h`<button class="btn sm ghost" data-act="selStart">☑ Sélectionner plusieurs séances</button>` : ''}
    ${list.length ? groupSessions(list, f.group).map((g) => h`${g.key ? h`<div class="blockhead">${groupName(f.group, g.key)} · ${g.items.length}</div>` : ''}${g.items.map(seanceCard)}`)
      : nf ? h`<div class="card flat"><p class="muted">Aucune séance avec ces filtres.</p><button class="btn" data-act="sfClear">Effacer les filtres</button></div>`
      : empty(st === 'active' ? 'Aucune séance pour l’instant.' : 'Rien ici.', st === 'active' ? h`<button class="btn pri" data-act="cpNew">✨ Créer une séance</button>` : '')}`;
}
function seanceCard(s) {
  const sel = S.sel?.includes(s.id); const cats = categoriesOf(s), sp = sportsOf(s), it = intensityOf(s); return h`<div class="card ${sel ? 'on-b' : ''}"><div class="row">${S.sel ? h`<button class="selbox ${sel ? 'on' : ''}" data-act="selTog" data-id="${s.id}" aria-pressed="${!!sel}" aria-label="Sélectionner">${sel ? '✓' : ''}</button>` : ''}<div class="ico">${s.emoji}</div><div class="grow"><b>${s.name}</b><div class="muted small">${sp.length ? sp.map((x) => sportName(x).split(' ')[0]).join(' ') + ' · ' : ''}${s.exercises.filter((e) => e.block === 'main').length || s.exercises.length} exercice(s) · ~${sessionMinutes(s)} min${it ? ' · ' + INTENSITY_LABEL(it) : ''} · Personnel${s.template ? ' · modèle' : ''}${s.source === 'copy' ? ' · copie' : s.source === 'generated' ? ' · générée' : s.source === 'merge' ? ' · fusionnée' : ''}</div>
      <div class="tiny muted">${s.context?.env ? placeName(s.context.env) + ' · ' : ''}${cats.map(catName).join(' · ')}</div></div></div>
      ${S.sel ? '' : h`<div class="row wrapf"><button class="btn pri sm" data-act="play" data-id="${s.id}">▶ Lancer</button><button class="btn sm" data-act="openSeance" data-id="${s.id}">Ouvrir</button><button class="btn sm" data-act="planSeance" data-id="${s.id}">📅 Planifier</button>${adaptButton(s.id)}${groupButton(s.id)}</div>`}</div>`;
}
const groupName = (by, k) => (by === 'place' ? placeName(k) : by === 'sport' ? (k === 'none' ? '🏷 Sans sport' : sportName(k)) : k === 'none' ? '🗂 Sans catégorie' : catName(k));
/** « C'est quoi ? · À quoi ça sert ? · Pourquoi ? » d'une séance, en trois lignes courtes. */
export function sessionBrief(s, { edit = false, minutes = 0 } = {}) {
  const why = sessionWhy(s, (id) => INTENTIONS[id]?.label || id), use = sessionUse(s);
  const row = (ic, q, t, extra = '') => h`<div class="w3"><span class="w3i">${ic}</span><div class="grow"><b>${q}</b><p>${t}</p></div>${extra}</div>`;
  return h`<div class="card brief">${row('🧐', 'C’est quoi ?', sessionWhat(s, (id) => sportName(id).replace(/^\S+\s/, ''), minutes))}${use ? row('🎯', 'À quoi ça sert ?', use) : ''}
    ${why.text || edit ? row('💡', why.mine ? 'Mon pourquoi' : 'Pourquoi ?', why.text || h`<span class="muted">Écris pourquoi tu fais cette séance : ça aide à rester motivé.</span>`, edit ? h`<button class="btn sm ic" data-act="sWhy" aria-label="Écrire mon pourquoi">✎</button>` : '') : ''}</div>`;
}
/** Les trois questions pour un exercice (dans une séance, « Pourquoi ici ? » en plus). */
export function exerciseBrief(e, s) {
  const use = exUse(e), here = s ? exWhyHere(e, s) : '';
  const row = (ic, q, t) => h`<div class="w3"><span class="w3i">${ic}</span><div class="grow"><b>${q}</b><p>${t}</p></div></div>`;
  return h`<div class="card flat brief">${row('🧐', 'C’est quoi ?', exWhat(e))}${use ? row('🎯', 'À quoi ça sert ?', use) : ''}${here ? row('💡', 'Pourquoi ici ?', here) : ''}</div>`;
}
ACT.sWhy = () => {
  const e = editing(); if (!e) return; const cur = e.s.notes.find((n) => n.title === 'Pourquoi')?.text || '';
  openSheet(h`<form data-submit="sWhyGo" class="stack"><h2 style="margin:0">💡 Mon pourquoi</h2><p class="small muted">Pourquoi tu fais cette séance ? Une phrase suffit.</p>
    <textarea name="why" rows="3" maxlength="400" placeholder="Ex. Tenir 10 s de plus sur les réglettes pour mon projet au Bloc Club">${cur}</textarea><button class="btn pri big">Enregistrer</button></form>`);
};
SUBMIT.sWhyGo = (f) => { const t = String(new FormData(f).get('why') || '').trim().slice(0, 400); closeSheet(); edit((s) => ({ ...s, notes: [...s.notes.filter((n) => n.title !== 'Pourquoi'), ...(t ? [{ title: 'Pourquoi', text: t }] : [])] })); };
/* Trier et filtrer : une liste claire, comme les Paramètres. Plusieurs sports, lieux ou catégories à la fois. */
function sfSheet() {
  const f = sf(), all = S.seances.items.filter((s) => !s.archived);
  const places = [...new Set([...ctx().envs.map((e) => e.id), ...all.map(placeOf)])];
  const sports = [...new Set([...all.flatMap(sportsOf), ...Object.keys(ctx().activities)])];
  const cats = [...new Set([...Object.keys(CATS).filter((k) => all.some((s) => categoriesOf(s).includes(k))), ...all.flatMap((s) => s.tags || [])])];
  const count = filterSessions(S.seances.items, { ...f, status: S.filters.seances || 'active' }, S.history).length;
  const group = (k, ids, name) => h`<div class="chips">${ids.map((x) => chip(f[k].includes(x), name(x), `data-act="sfTog" data-k="${k}" data-v="${x}"`))}</div>`;
  openSheet(h`<div class="stack"><h2 style="margin:0">⇅ Trier et filtrer</h2>
    <span class="kicker">Lieu</span>${places.length ? group('places', places, placeName) : h`<p class="tiny muted">Ajoute tes lieux dans Profil › Mes lieux.</p>`}
    <span class="kicker">Sports (un ou plusieurs)</span>${group('sports', sports, sportName)}
    <span class="kicker">Catégories</span>${cats.length ? group('cats', cats, catName) : h`<p class="tiny muted">Aucune catégorie pour l’instant.</p>`}
    <span class="kicker">Regrouper par</span><div class="chips">${Object.entries(GROUPS).map(([k, [e, l]]) => chip((f.group || 'none') === k, `${e} ${l}`, `data-act="sfGroup" data-id="${k}"`))}</div>
    <span class="kicker">Trier par</span>
    <div class="setmenu">${Object.entries(SORTS).map(([k, [ic, l]]) => h`<button class="setrow" data-act="sfSort" data-id="${k}"><span class="sic">${ic}</span><span class="grow"><b>${l}</b>${k === 'form' ? h`<small>Les séances les plus adaptées à ton énergie d’aujourd’hui d’abord</small>` : ''}</span><span class="chev">${f.sort === k ? '✓' : ''}</span></button>${k === 'form' && f.sort === 'form' ? h`<div class="chips" style="padding:0 14px 12px">${Object.entries(FORMS).map(([fk, [e, l]]) => chip(f.form === fk, `${e} ${l}`, `data-act="sfForm" data-id="${fk}"`))}</div>` : ''}`)}</div>
    <div class="grid2"><button class="btn" data-act="sfClear">Effacer</button><button class="btn pri" data-act="sfDone">Voir ${count} séance(s)</button></div></div>`);
}
ACT.sfOpen = () => sfSheet();
ACT.sfGroup = (el) => { sf().group = el.dataset.id; sfSave(); render(); sfSheet(); };
/* Sélection de plusieurs séances : lieu, catégorie, sport, fusion ou archivage d'un coup. */
const selected = () => (S.sel || []).map(getSeance).filter(Boolean);
ACT.selStart = () => { S.sel = []; render(); };
ACT.selEnd = () => { S.sel = null; render(); };
ACT.selTog = (el) => { const id = el.dataset.id; S.sel = S.sel.includes(id) ? S.sel.filter((x) => x !== id) : [...S.sel, id]; render(); };
ACT.selAll = () => { const st = S.filters.seances || 'active'; const all = filterSessions(S.seances.items, { ...sf(), status: st }, S.history).map((s) => s.id); S.sel = S.sel.length === all.length ? [] : all; render(); };
ACT.selMerge = () => { const ids = S.sel.slice(); S.sel = null; render(); S.merge = { ids, name: '' }; mergeSheet(); };
ACT.selArchive = async () => {
  const list = selected(), arch = (S.filters.seances || 'active') !== 'archived';
  if (arch && !(await ask(`Archiver ${list.length} séance(s) ?`, { ok: 'Archiver', detail: 'Elles restent dans « Archivées » et se désarchivent quand tu veux.' }))) return;
  for (const s of list) saveSeance({ ...s, archived: arch });
  S.sel = null; render(); toast(arch ? `${list.length} séance(s) archivée(s)` : `${list.length} séance(s) désarchivée(s)`);
};
ACT.selBulk = (el) => {
  const what = el.dataset.id, c = ctx(), n = S.sel.length;
  const rows = what === 'place' ? [...c.envs.map((e) => [e.id, `📍 ${e.name}`]), ['none', '📍 Sans lieu']]
    : what === 'sport' ? activityOptions().map(([id, e, l]) => [id, `${e} ${l}`])
    : [...new Set([...Object.keys(CATS), ...S.seances.items.flatMap((s) => s.tags || [])])].map((k) => [k, catName(k)]);
  openSheet(h`<div class="stack"><h2 style="margin:0">${what === 'place' ? '📍 Lieu' : what === 'sport' ? '🏷 Ajouter un sport' : '🗂 Ajouter une catégorie'}</h2><p class="small muted">Pour les ${n} séance(s) sélectionnée(s).</p>
    <div class="setmenu">${rows.map(([id, l]) => h`<button class="setrow" data-act="selApply" data-k="${what}" data-id="${id}"><span class="grow"><b>${l}</b></span><span class="chev">›</span></button>`)}</div>
    ${what === 'place' && !c.envs.length ? h`<p class="tiny muted">Ajoute tes lieux dans Profil › Mes lieux.</p>` : ''}</div>`);
};
ACT.selApply = (el) => {
  const k = el.dataset.k, id = el.dataset.id, env = ctx().envs.find((e) => e.id === id), list = selected();
  for (const s of list) {
    if (k === 'place') saveSeance({ ...s, context: { ...s.context, env: id === 'none' ? '' : id, envName: env?.name || '', equipment: env?.equipment || s.context.equipment } });
    else if (k === 'sport') { if (s.activity !== id) saveSeance({ ...s, activity: s.activity || id, sports: s.activity ? [...new Set([...(s.sports || []), id])] : s.sports }); }
    else saveSeance({ ...s, tags: [...new Set([...(s.tags?.length ? s.tags : autoCategories(s)), id])].slice(0, 8) });
  }
  closeSheet(); S.sel = null; render(); toast(`${list.length} séance(s) modifiée(s)`);
};
ACT.sfSort = (el) => { sf().sort = el.dataset.id; sfSave(); render(); sfSheet(); };
ACT.sfForm = (el) => { sf().form = el.dataset.id; sfSave(); render(); sfSheet(); };
ACT.sfTog = (el) => { const f = sf(), k = el.dataset.k, v = el.dataset.v; f[k] = f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]; sfSave(); render(); sfSheet(); };
ACT.sfDrop = (el) => { const f = sf(); f[el.dataset.k] = f[el.dataset.k].filter((x) => x !== el.dataset.v); sfSave(); render(); };
ACT.sfClear = () => { Object.assign(sf(), { places: [], sports: [], cats: [], q: '' }); sfSave(); closeSheet(); render(); };
ACT.sfDone = () => closeSheet();
let sfT = null;
INPUT.sfQ = (el) => { sf().q = el.value; clearTimeout(sfT); sfT = setTimeout(() => { const pos = el.selectionStart; render(); const i = $('.sfbar input'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* rien */ } } }, 250); };
/** Nouvelle séance : les façons de la créer, expliquées en une ligne. */
ACT.exMore = () => { S.exMore = true; render(); };
ACT.newChoose = () => openSheet(h`<div class="stack"><h2 style="margin:0">Nouvelle séance</h2>${draftBanner()}
  ${[['cpNew', '', '✨', 'Créer une séance', 'Tous sports. L’app choisit tout, te guide, ou tu composes toi-même.'], ['newSeance', '', '✍️', 'À ma façon (page blanche)', 'Tu écris tout toi-même : exercices, ordre, durées, notes. Rien n’est imposé.'], ['libSub', 'seances', '📂', 'Reprendre une de mes séances', 'La relancer, la modifier ou la dupliquer.'], ['libSub', 'catalog', '🗂', 'Séance prête', 'Des séances expliquées et sourcées, à lancer tout de suite.'],
    ['openImport', '', '📋', 'Coller un texte', 'Tu as déjà ta séance écrite quelque part ? Colle-la.'],
    ...(S.user?.guest ? [] : [['groupMenu', '', '👥', 'Séance à plusieurs', 'Rejoindre avec un code, chrono à plusieurs (ex. 7 s / 3 s), ou une séance pour un groupe.']])]
    .map(([act, id, ic, t, d]) => h`<button class="setrow" data-act="${act}" ${id ? raw(`data-id="${id}"`) : ''}><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">›</span></button>`)}</div>`);
/** Séance en cours de création (brouillon gardé) : on peut la reprendre où on en était. */
function draftText() { const d = S.cp || ls.get('sea:climbplan:' + (S.user?.id || 'guest'), null); return d && (d.step || 1) > 1 ? `En cours : étape ${d.v === 2 ? d.step : Math.max(1, d.step - 1)}/6` : ''; }
function draftBanner() { const t = draftText(); return t ? h`<button class="card flat acc-b row" data-act="cpResume"><span class="grow small">📝 <b>Reprendre ma séance en cours</b> · ${t.replace('En cours : ', '')}</span><span class="chev">›</span></button>` : ''; }
/* Fusionner des séances : on en choisit 2 à 4, l'app conseille (note, ordre) et crée une NOUVELLE séance ; les originales ne changent pas. */
const mergeable = () => S.seances.items.filter((s) => !s.archived && s.exercises.length);
function mergeSheet() {
  const m = S.merge ||= { ids: [], name: '' };
  const chosen = m.ids.map(getSeance).filter(Boolean), a = chosen.length >= 2 ? mergeAdvice(chosen) : null;
  const tone = a ? (a.score >= 80 ? 'ok' : a.score >= 55 ? 'acc' : 'warn') : '';
  openSheet(h`<div class="stack"><h2 style="margin:0">🔀 Fusionner des séances</h2>
    <p class="small muted">Choisis 2 à 4 séances. Une nouvelle séance est créée : tes séances d’origine ne changent pas.</p>
    <button class="setrow" data-act="mergeBest"><span class="sic">💡</span><span class="grow"><b>Quelles séances fusionner ?</b><small>L’app te propose les meilleures paires.</small></span><span class="chev">›</span></button>
    <div class="card flat" style="padding:0">${mergeable().map((s) => { const i = m.ids.indexOf(s.id); return h`<button class="setrow" data-act="mergePick" data-id="${s.id}"><span class="sic">${i >= 0 ? String(i + 1) : s.emoji}</span><span class="grow"><b>${s.name}</b><small>${s.activity ? activityLabel(s.activity, ctx()) + ' · ' : ''}~${sessionMinutes(s)} min</small></span><span class="chev">${i >= 0 ? '✓' : '＋'}</span></button>`; })}</div>
    ${a ? h`<div class="card ${tone}-b"><div class="row between"><b>Conseil</b>${tag(`${a.score}/100`, tone)}</div>
      ${a.pros.map((t) => h`<div class="small">✓ ${t}</div>`)}${a.cons.map((t) => h`<div class="small">⚠️ ${t}</div>`)}
      ${a.order.some((s, i) => s.id !== chosen[i]?.id) ? h`<button class="btn sm" data-act="mergeOrder">↕️ Mettre dans l’ordre conseillé</button>` : ''}
      ${sourcesLine(a.sources)}</div>
      <label>Nom de la nouvelle séance<input type="text" data-change="mergeName" maxlength="100" value="${m.name}" placeholder="${chosen.map((s) => s.name).join(' + ').slice(0, 100)}"></label>
      <button class="btn pri big" data-act="mergeGo">Créer la séance fusionnée (~${a.minutes} min)</button>` : h`<p class="tiny muted">${chosen.length ? 'Encore une séance à choisir.' : 'Touche les séances à fusionner, dans l’ordre voulu.'}</p>`}</div>`);
}
ACT.mergeOpen = (el) => { S.merge = { ids: el?.dataset?.ids ? el.dataset.ids.split(',') : [], name: '' }; if (S.sub.library !== 'seances') go('library', 'seances'); mergeSheet(); };
ACT.mergePick = (el) => { const m = S.merge, id = el.dataset.id; m.ids = m.ids.includes(id) ? m.ids.filter((x) => x !== id) : m.ids.length >= 4 ? (toast('4 séances au maximum.'), m.ids) : [...m.ids, id]; mergeSheet(); };
ACT.mergeOrder = () => { S.merge.ids = orderForMerge(S.merge.ids.map(getSeance).filter(Boolean)).map((s) => s.id); mergeSheet(); };
CHG.mergeName = (el) => { S.merge.name = el.value.trim(); };
ACT.mergeGo = () => {
  const chosen = S.merge.ids.map(getSeance).filter(Boolean); if (chosen.length < 2) return;
  const s = saveSeance(mergeSessions(chosen, { name: S.merge.name })); S.merge = null; closeSheet();
  toast('Séance fusionnée créée. Tes séances d’origine n’ont pas changé.', 4000); go('library', 'seance', s.id);
};
ACT.mergeBest = () => {
  const best = bestMerges(mergeable(), 5);
  openSheet(h`<div class="stack"><div class="row"><button class="btn sm" data-act="mergeBack" aria-label="Retour">‹</button><h2 style="margin:0">💡 Quelles séances fusionner ?</h2></div>
    ${best.length ? h`<div class="card flat" style="padding:0">${best.map((b) => h`<button class="setrow" data-act="mergeOpen" data-ids="${b.ids.join(',')}"><span class="sic">${b.score}</span><span class="grow"><b>${b.names.join(' + ')}</b><small>${b.pros[0] || b.cons[0] || ''}</small></span><span class="chev">›</span></button>`)}</div>
      <p class="tiny muted">Note sur 100 : complémentaires, durée raisonnable, doigts ménagés, bon ordre. Touche une paire pour voir le détail.</p>` : empty('Il faut au moins deux séances avec des exercices.')}
    <button class="btn" data-act="mergeCoach">💬 Demander au coach</button></div>`);
};
ACT.mergeBack = () => mergeSheet();
ACT.mergeCoach = () => {
  const names = mergeable().slice(0, 12).map((s) => `« ${s.name} »`).join(', ');
  closeSheet(); ACT.coachOpen?.(); const inp = $('.chat-in input'); if (inp) inp.value = `Parmi mes séances ${names}, lesquelles je peux fusionner en une seule, et dans quel ordre ?`.slice(0, 500);
};
ACT.seanceFilter = (el) => { S.filters.seances = el.dataset.id; S.sel = null; render(); };
ACT.newSeance = () => { closeSheet(); const s = saveSeance({ id: uid(), name: 'Nouvelle séance', emoji: '🏋️', exercises: [], source: 'manual', activity: '' }); go('library', 'seance', s.id); };
ACT.openSeance = (el) => go('library', 'seance', el.dataset.id);
ACT.play = (el) => {
  const s = el.dataset.gen ? S.gen.result?.session : el.dataset.shared ? S.shared.detail?.session : getSeance(el.dataset.id);
  closeSheet(); if (s) startPlayer(s, { eventId: el.dataset.event || null, eventDate: el.dataset.date || null, fromGenerator: !!el.dataset.gen });
};

/* ═════════ Éditeur de séance (séance personnelle ou contribution commune) ═════════ */
function exRow(e, i, n, mode) {
  return h`<div class="item ex ${mode === 'edit' ? 'editable' : ''}"><div class="ico">${e.emoji}</div><div class="grow"><button class="linkish" data-act="exInfo" data-id="${e.id}" title="C’est quoi ? À quoi ça sert ?"><b>${e.name}</b> <span class="tiny muted">ⓘ</span></button> ${e.isNew ? tag('🆕 découverte', 'acc') : ''}<div class="muted small">${exLine(e)}</div>${e.why ? h`<div class="tiny why">💡 ${e.why}</div>` : ''}${e.note ? h`<div class="tiny acc-t">${e.note}</div>` : ''}</div>
    <div class="row tight ${mode === 'edit' ? 'acts' : ''}">${mode === 'edit' ? h`<button class="btn sm ic" data-act="exUp" data-id="${e.id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn sm ic" data-act="exDown" data-id="${e.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button class="btn sm ic" data-act="exSwap" data-id="${e.id}" aria-label="Remplacer">🔄</button><button class="btn sm ic" data-act="exEdit" data-id="${e.id}" aria-label="Modifier">✎</button><button class="btn danger sm ic" data-act="exDel" data-id="${e.id}" aria-label="Retirer">✕</button>` : h`<button class="btn sm ic" data-act="exInfo" data-id="${e.id}" aria-label="Détails">ⓘ</button>${mode === 'gen' ? h`<button class="btn sm ic" data-act="exSwap" data-id="${e.id}" aria-label="Remplacer">🔄</button>` : ''}`}</div></div>`;
}
export function blocksOf(s, mode) {
  const out = [];
  // Séance au format choisi : les parties dans leur ordre (une même partie peut revenir plus loin).
  if (s.exercises.some((e) => e.part)) {
    let run = [];
    const flush = () => { if (!run.length) return; const mins = Math.round(run.reduce((t, e) => t + exMinutes(e), 0)); out.push(h`<div class="blockhead row"><span class="grow">${run[0].part || BLOCKS[run[0].block]} · ~${mins} min</span>${mode === 'edit' ? h`<button class="btn sm" data-act="partOpts" data-part="${run[0].part || ''}" data-block="${run[0].block}">🧭 Options</button>` : ''}</div>${run.map((e) => exRow(e, s.exercises.indexOf(e), s.exercises.length, mode))}`); run = []; };
    for (const e of s.exercises) { if (run.length && (e.part || e.block) !== (run[0].part || run[0].block)) flush(); run.push(e); }
    flush();
    return out;
  }
  for (const b of ['warmup', 'main', 'cool']) {
    const list = s.exercises.filter((e) => e.block === b);
    if (!list.length) continue;
    const mins = Math.round(list.reduce((t, e) => t + exMinutes(e), 0));
    out.push(h`<div class="blockhead row"><span class="grow">${BLOCKS[b]} · ~${mins} min</span>${mode === 'edit' ? h`<button class="btn sm" data-act="partOpts" data-part="" data-block="${b}">🧭 Options</button>` : ''}</div>${list.map((e) => exRow(e, s.exercises.indexOf(e), s.exercises.length, mode))}`);
  }
  return out;
}
// Séance actuellement modifiée : personnelle (S.param), contribution commune (S.sharedDraft) ou résultat du générateur.
function editing() {
  if (S.sub.library === 'shared-edit' && S.sharedDraft) return { s: S.sharedDraft.session, save: (n) => { S.sharedDraft.session = normalizeSession(n); render(); }, kind: 'shared' };
  if (S.sub.library === 'generate' && S.gen.result) return { s: S.gen.result.session, save: (n) => { S.gen.result.session = normalizeSession(n); S.gen.saved = false; render(); }, kind: 'gen' };
  const s = getSeance(S.param); return s ? { s, save: (n) => { saveSeance(n); render(); }, kind: 'local' } : null;
}
const MORE_KEY = 'sea:session-more';
function vEditor(s, mode) {
  const c = ctx(), lv = estimateLevel(s), shared = mode === 'shared', more = !!ls.get(MORE_KEY, false);
  const meta = [s.activity ? sportName(s.activity) : '', s.context.envName ? `📍 ${s.context.envName}` : ''].filter(Boolean).join(' · ');
  const intents = new Map((s.intentions || []).map((x) => [x.id, x.p]));
  const empty = !s.exercises.length;
  return h`<h1 class="sr-only">${s.emoji || ''} ${s.name}</h1><div class="row wrapf"><button class="btn sm" data-act="${shared ? 'sharedCancel' : 'backSeances'}" aria-label="Retour">‹</button><div class="grow"></div>${shared ? h`<button class="btn pri" data-act="sharedSave">💾 Enregistrer la contribution</button>` : empty ? '' : h`${adaptButton(s.id, 'seance', 'btn')}${groupButton(s.id, 'seance', 'btn')}<button class="btn pri" data-act="play" data-id="${s.id}">▶ Lancer</button>`}</div>
    ${shared || !s.exercises.length ? '' : h`<p class="tiny muted">🔁 « Adapter » fait une version pour cette fois (durée, matériel, douleur, échauffement, intensité) sans toucher à cette séance. Pour la changer pour de bon, modifie-la ci-dessous.</p>`}
    ${shared ? h`<div class="card flat warn-b small">Tu modifies une contribution de la bibliothèque commune${S.sharedDraft.admin ? ' en tant qu’administrateur' : ''}. Les copies déjà faites par d’autres ne changeront pas.</div>` : ''}
    ${s.origin ? h`<p class="tiny muted">Copie indépendante de « ${s.origin.author || 'bibliothèque'} » (${s.origin.kind === 'common' ? 'commune' : s.origin.kind === 'link' ? 'lien partagé' : 'publique'}) du ${fmtDay(s.origin.copiedAt)} : modifiable librement, l’original n’est jamais modifié.</p>` : ''}
    ${empty ? '' : sessionBrief(s, { edit: !shared })}
    <div class="card"><div class="row"><input type="text" data-change="sEmoji" value="${s.emoji}" maxlength="4" class="emoji-in" aria-label="Emoji"><input type="text" data-change="sName" value="${s.name}" maxlength="100" aria-label="Nom de la séance"></div>
      ${empty ? (meta ? h`<div class="muted small">${meta}</div>` : '') : h`<div class="muted small">~${sessionMinutes(s)} min · ${s.exercises.length} exercice${s.exercises.length > 1 ? 's' : ''} ${levelTag(lv)}${meta ? h` · ${meta}` : ''}</div>`}
      <label>Notes <span class="tiny muted">(facultatif)</span><textarea data-change="sNotes" maxlength="1200" placeholder="Consignes générales, objectifs, remarques…">${s.notes.find((n) => n.title === 'Notes')?.text || ''}</textarea></label>
      <details class="how" ${more ? 'open' : ''}><summary data-act="sMore">⚙️ Sport, lieu, catégories, intentions, durée <span class="tiny muted">(facultatif)</span></summary><div class="stack">
      <div class="grid2"><label>Sport principal<select data-change="sActivity" data-pick="yes" data-add="actNewAndBack" data-add-label="Ajouter un sport"><option value="">— Aucun en particulier</option>${activityOptions().map(([id, e, l]) => h`<option value="${id}" ${s.activity === id ? 'selected' : ''}>${e} ${l}</option>`)}</select></label>
      <label>Lieu<select data-change="sEnv"><option value="">—</option>${c.envs.map((e) => h`<option value="${e.id}" ${s.context.env === e.id ? 'selected' : ''}>${e.name}</option>`)}<option value="__new">＋ Ajouter un lieu…</option></select></label></div>
      <b class="small">Autres sports dans cette séance</b><div class="chips">${activityOptions().filter(([id]) => id !== s.activity).map(([id, e, l]) => chip((s.sports || []).includes(id), `${e} ${l}`, `data-act="sSport" data-id="${id}"`))}</div>
      <b class="small">Catégories ${s.tags?.length ? '' : h`<span class="tiny muted">(reconnues automatiquement, touche pour choisir)</span>`}</b>
      <div class="chips">${[...new Set([...Object.keys(CATS), ...(s.tags || [])])].map((k) => chip((s.tags?.length ? s.tags : autoCategories(s)).includes(k), catName(k), `data-act="sTag" data-id="${k}"`))}<button type="button" class="chip" data-act="sTagNew">＋ Autre</button></div>
      <b class="small">Intentions</b><div class="chips">${Object.entries(INTENTIONS).map(([id, I]) => chip(intents.has(id), `${I.emoji} ${I.label}${intents.has(id) ? ' ×' + intents.get(id) : ''}`, `data-act="sIntent" data-id="${id}" title="Touche pour changer la priorité"`))}</div>
      ${s.exercises.length ? h`<form data-submit="sAdapt" class="row"><label class="grow">Adapter la durée à<span class="unitbox"><input type="number" inputmode="numeric" name="minutes" min="5" max="300" value="${s.context.plannedMin || sessionMinutes(s)}"><em>min</em></span></label><button class="btn" type="submit">⏱ Reconstruire</button></form>` : ''}</div></details>
      ${s.notes.filter((n) => n.title !== 'Notes').map((n) => h`<details class="how"><summary>${n.title}</summary><pre class="txt">${n.text}</pre></details>`)}
      ${howBox(s.explain)}${s.exercises.length ? levelDetails(lv, s) : ''}</div>
    <div class="card">${s.exercises.length ? blocksOf(s, 'edit') : h`<div class="stack"><b>Ta séance est vide : écris-la comme tu veux.</b><p class="small muted">Un exercice par ligne, comme dans un carnet (« 4 × 8 tractions repos 2 min », « 5 min de corde à sauter »…), ou cherche dans le catalogue. Rien n’est obligatoire : ni sport, ni objectif, ni ordre imposé.</p></div>`}
      <div class="row wrapf"><button class="btn ${s.exercises.length ? '' : 'pri'}" data-act="exWrite">✍️ Écrire des exercices</button><button class="btn ${s.exercises.length ? 'pri' : ''}" data-act="exAdd">＋ Ajouter un exercice</button>${s.exercises.length ? h`<button class="btn" data-act="sEquip">🧰 Matériel indisponible</button>` : ''}</div></div>
    ${shared ? '' : empty ? h`<div class="row wrapf"><button class="btn danger" data-act="sDelete" data-id="${s.id}">🗑 Supprimer cette séance vide</button></div>` : h`<div class="row wrapf"><button class="btn" data-act="planSeance" data-id="${s.id}">📅 Planifier</button><button class="btn" data-act="sDup" data-id="${s.id}">⧉ Dupliquer</button><button class="btn" data-act="sPublish" data-id="${s.id}">🌍 Partager</button></div>
      <details class="how"><summary>Plus d’actions <span class="tiny muted">(modèle, archiver, texte, supprimer…)</span></summary><div class="row wrapf"><button class="btn" data-act="sTemplate" data-id="${s.id}">${s.template ? '★ Retirer des modèles' : '☆ Enregistrer comme modèle'}</button><button class="btn" data-act="sArchive" data-id="${s.id}">${s.archived ? '↩ Désarchiver' : '🗄 Archiver'}</button>
      <button class="btn" data-act="sText" data-id="${s.id}">📤 Copier en texte</button>${contentAdmin() ? h`<button class="btn" data-act="seanceToCatalog" data-id="${s.id}">🌍 En faire une séance prête</button>` : S.user && !S.user.guest ? h`<button class="btn" data-act="propose" data-k="catalog" data-id="${s.id}">💡 Proposer comme séance prête</button>` : ''}<button class="btn danger" data-act="sDelete" data-id="${s.id}">🗑 Supprimer</button></div></details>`}`;
}
// Les réglages facultatifs restent ouverts ou fermés comme la personne les a laissés (sur cet appareil).
ACT.sMore = (el) => { const d = el.closest('details'); if (!d) return; d.open = !d.open; ls.set(MORE_KEY, d.open); };
ACT.actNewAndBack = (el) => { setReturn('Retour à ma séance', `library/seance/${S.param}`); go('profile', 'activities'); setTimeout(() => ACT.actNew?.(el), 200); };
ACT.backSeances = () => go('library', 'seances');
const edit = (fn) => { const e = editing(); if (!e) return; e.save(fn(e.s)); };
CHG.sName = (el) => edit((s) => ({ ...s, name: el.value.trim() || 'Séance' }));
CHG.sEmoji = (el) => edit((s) => ({ ...s, emoji: el.value.trim() || '🏋️' }));
CHG.sActivity = (el) => edit((s) => ({ ...s, activity: el.value, sports: (s.sports || []).filter((x) => x !== el.value) }));
CHG.sEnv = (el) => { if (el.value === '__new') { go('profile', 'equipment'); return; } edit((s) => { const env = ctx().envs.find((e) => e.id === el.value); return { ...s, context: { ...s.context, env: el.value, envName: env?.name || '', equipment: env?.equipment || s.context.equipment } }; }); };
ACT.sSport = (el) => edit((s) => { const l = s.sports || [], id = el.dataset.id; return { ...s, sports: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] }; });
// Toucher une catégorie reconnue automatiquement fixe la liste à la main (les autres reconnues restent cochées).
ACT.sTag = (el) => edit((s) => { const l = s.tags?.length ? s.tags : autoCategories(s), id = el.dataset.id; const n = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; return { ...s, tags: n.length ? n : [] }; });
ACT.sTagNew = () => openSheet(h`<form data-submit="sTagGo" class="stack"><h2 style="margin:0">🏷 Nouvelle catégorie</h2><label>Nom<input name="tag" maxlength="30" required placeholder="Ex. Compétition, Vacances, Avec Léa"></label><button class="btn pri big">Ajouter</button></form>`);
SUBMIT.sTagGo = (f) => { const t = String(new FormData(f).get('tag') || '').trim().slice(0, 30); if (!t) return; closeSheet(); edit((s) => { const l = s.tags?.length ? s.tags : autoCategories(s); return { ...s, tags: [...new Set([...l, t])].slice(0, 8) }; }); };
CHG.sNotes = (el) => edit((s) => ({ ...s, notes: [...s.notes.filter((n) => n.title !== 'Notes'), ...(el.value.trim() ? [{ title: 'Notes', text: el.value.trim() }] : [])] }));
ACT.sIntent = (el) => edit((s) => {
  const list = [...(s.intentions || [])], i = list.findIndex((x) => x.id === el.dataset.id);
  if (i < 0) list.push({ id: el.dataset.id, p: 2 }); else if (list[i].p < 3) list[i] = { ...list[i], p: list[i].p + 1 }; else list.splice(i, 1);
  return { ...s, intentions: list };
});
SUBMIT.sAdapt = (f) => {
  const m = Number(new FormData(f).get('minutes')); const e = editing(); if (!e || !(m >= 5)) return;
  const r = adaptDuration(e.s, m, ctx());
  e.save(r.session);
  openSheet(h`<h2 style="margin:0">Séance reconstruite pour ${m} min</h2><p class="muted small">Durée estimée : ~${r.minutes} min. Les exercices les plus importants sont gardés ; échauffement, séries et repos sont ajustés.</p>${r.changes.length ? h`<ul class="small">${r.changes.map((c) => h`<li>${c}</li>`)}</ul>` : h`<p class="small">Aucun changement nécessaire.</p>`}<button class="btn" data-act="closeSheet">OK</button>`);
};
const moveEx = (id, d) => edit((s) => { const i = s.exercises.findIndex((e) => e.id === id), j = i + d; if (i < 0 || j < 0 || j >= s.exercises.length) return s; const ex = s.exercises.slice(); [ex[i], ex[j]] = [ex[j], ex[i]]; if (ex[i].block !== ex[j].block) { const b = ex[i].block; ex[i] = { ...ex[i], block: ex[j].block }; ex[j] = { ...ex[j], block: b }; } return { ...s, exercises: ex }; });
ACT.exUp = (el) => moveEx(el.dataset.id, -1); ACT.exDown = (el) => moveEx(el.dataset.id, 1);
ACT.exDel = async (el) => { const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); if (!ex || !(await ask(`Retirer « ${ex.name} » de la séance ?`, { ok: 'Retirer', danger: true }))) return; edit((s) => ({ ...s, exercises: s.exercises.filter((x) => x.id !== ex.id) })); };
/* 🧭 Options d'une partie d'une séance : l'ordre conseillé, et d'autres exercices proches à ajouter. */
function partExercises(s, part, block) { return s.exercises.filter((e) => (part ? e.part === part : !e.part && e.block === block)); }
function partOptsSheet(part, block) {
  const e = editing(); if (!e) return; const list = partExercises(e.s, part, block);
  const adv = orderAdvice(list.map((x) => x.libId).filter(Boolean)), opts = similarOptions(list, { eq: availableEquipment(ctx(), e.s.context?.env) });
  openSheet(h`<div class="stack"><h2 style="margin:0">🧭 ${part || BLOCKS[block]}</h2>
    ${adv.notes.length ? h`${adv.notes.map((n) => h`<p class="small acc-t">↳ ${n}</p>`)}<button class="btn sm" data-act="partReorder" data-part="${part}" data-block="${block}">↕️ Mettre dans l’ordre conseillé</button>` : h`<p class="small muted">L’ordre de cette partie est déjà bon.</p>`}
    <span class="kicker">D’autres exercices qui vont bien ici</span>
    <div class="optlist">${opts.length ? opts.map((o) => h`<div class="optrow"><span class="grow"><b>${o.lib.emoji} ${o.lib.name}</b><small>Travaille : ${o.works.join(', ')}</small><small class="tip">💡 ${o.tips[0]}</small></span>
      <button class="btn sm ic" data-act="libInfoOpt" data-id="${o.id}" aria-label="C’est quoi ?">ⓘ</button><button class="btn sm pri" data-act="partAdd" data-id="${o.id}" data-part="${part}" data-block="${block}">＋</button></div>`) : h`<p class="tiny muted">Rien de plus à proposer avec ton matériel.</p>`}</div>
    <button class="btn" data-act="closeSheet">Fermer</button></div>`, { wide: true });
}
ACT.partOpts = (el) => partOptsSheet(el.dataset.part, el.dataset.block);
ACT.partAdd = (el) => {
  const x = byId(el.dataset.id), part = el.dataset.part, block = el.dataset.block; if (!x) return;
  edit((s) => { const list = partExercises(s, part, block), last = list.at(-1), at = last ? s.exercises.indexOf(last) + 1 : s.exercises.length;
    const ex = normalizeEx({ ...x, id: uid(), libId: x.id, ok: x.cues, bad: x.bad, block: block || 'main', part }); const arr = [...s.exercises]; arr.splice(at, 0, ex); return { ...s, exercises: arr }; });
  toast(`« ${x.name} » ajouté`); partOptsSheet(part, block);
};
ACT.partReorder = (el) => {
  const part = el.dataset.part, block = el.dataset.block;
  edit((s) => { const list = partExercises(s, part, block), order = orderAdvice(list.map((x) => x.libId).filter(Boolean)).order;
    const sorted = [...list].sort((a, b) => (order.indexOf(a.libId) + 1 || 99) - (order.indexOf(b.libId) + 1 || 99)); let k = 0;
    return { ...s, exercises: s.exercises.map((x) => (list.includes(x) ? sorted[k++] : x)) }; });
  toast('Remis dans l’ordre conseillé'); partOptsSheet(part, block);
};
ACT.libInfoOpt = (el) => { const x = byId(el.dataset.id); if (x) openSheet(exerciseSheet({ ...x, libId: x.id }, h`<button class="btn" data-act="closeSheet">Fermer</button>`), { wide: true }); };
ACT.exInfo = (el) => { const e = editing(), sh = S.shared.detail?.session; const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); const ex2 = ex ? null : sh?.exercises?.find((x) => x.id === el.dataset.id); if (ex || ex2) openSheet(exerciseSheet(ex || ex2, '', ex ? e.s : normalizeSession(sh))); };
ACT.sDup = (el) => { const s = getSeance(el.dataset.id); if (!s) return; const c = saveSeance({ ...s, id: uid(), name: s.name + ' (copie)', createdAt: 0, template: false, archived: false, exercises: s.exercises.map((e) => ({ ...e, id: uid() })) }); toast('Séance dupliquée'); go('library', 'seance', c.id); };
ACT.sTemplate = (el) => { const s = getSeance(el.dataset.id); if (s) { saveSeance({ ...s, template: !s.template }); toast(s.template ? 'Retirée des modèles' : 'Enregistrée comme modèle'); render(); } };
ACT.sArchive = (el) => { const s = getSeance(el.dataset.id); if (s) { saveSeance({ ...s, archived: !s.archived }); toast(s.archived ? 'Séance désarchivée' : 'Séance archivée'); render(); } };
ACT.sDelete = async (el) => { const s = getSeance(el.dataset.id); if (s && (await ask(`Supprimer « ${s.name} » ?`, { ok: 'Supprimer', danger: true, detail: 'L’historique des séances déjà réalisées est conservé.' }))) { deleteSeance(s.id); toast('Séance supprimée'); go('library', 'seances'); } };
ACT.sText = async (el) => { const s = getSeance(el.dataset.id); if (!s) return; const t = exportSessionText(s); try { await navigator.clipboard.writeText(t); toast('Texte copié'); } catch { openSheet(h`<h2 style="margin:0">Texte de la séance</h2><textarea readonly style="min-height:260px">${t}</textarea><button class="btn" data-act="closeSheet">Fermer</button>`); } };

/* Exercices : formulaire, ajout, remplacement intelligent */
/** Partie d'un exercice dans la séance : les trois blocs habituels, les parties déjà créées, ou une nouvelle. */
function partSelect(e) {
  const s = editing()?.s, custom = [...new Set((s?.exercises || []).map((x) => x.part).filter(Boolean))], cur = e.part || e.block || 'main';
  return h`<label>Partie<select name="part" data-change="exPart">${Object.entries(BLOCKS).map(([k, l]) => h`<option value="${k}" ${!e.part && cur === k ? 'selected' : ''}>${l}</option>`)}${custom.map((p) => h`<option value="${p}" ${e.part === p ? 'selected' : ''}>${p}</option>`)}<option value="__new">＋ Nouvelle partie…</option></select></label>`;
}
CHG.exPart = (el) => { const box = el.closest('form')?.querySelector('[data-newpart]'); if (box) { box.hidden = el.value !== '__new'; if (!box.hidden) box.querySelector('input')?.focus(); } };
function exForm(e, ctxk) {
  const t = e.mode === 'time', inSession = ctxk.kind === 'session';
  return h`<h2 style="margin:0">${ctxk.eid === 'new' ? 'Nouvel exercice' : 'Modifier l’exercice'}</h2>
  <form data-submit="exSave" class="stack"><input type="hidden" name="ctx" value="${JSON.stringify(ctxk)}">
    <div class="row"><input type="text" name="emoji" value="${e.emoji}" maxlength="4" class="emoji-in" aria-label="Emoji"><input type="text" name="name" value="${e.name === 'Exercice' ? '' : e.name}" maxlength="80" required placeholder="Nom de l’exercice" aria-label="Nom"></div>
    <div class="grid2"><label>Type<select name="mode" data-change="exMode"><option value="reps" ${t ? '' : 'selected'}>Répétitions</option><option value="time" ${t ? 'selected' : ''}>Durée</option></select></label>
      ${inSession ? partSelect(e) : h`<label>Bloc<select name="block"><option value="warmup" ${e.block === 'warmup' ? 'selected' : ''}>Échauffement</option><option value="main" ${e.block === 'main' ? 'selected' : ''}>Corps de séance</option><option value="cool" ${e.block === 'cool' ? 'selected' : ''}>Retour au calme</option></select></label>`}</div>
    ${inSession ? h`<label data-newpart hidden>Nom de la nouvelle partie<input name="partNew" maxlength="40" placeholder="Ex. Circuit A, Technique, Bloc force…"></label>` : ''}
    <div class="grid2">${numberField('sets', 'Séries', e.sets, { min: 1, max: 30, step: 1 })}<label>Repos <span class="tiny muted">(90 ou 1:30)</span><span class="unitbox"><input type="text" inputmode="numeric" name="rest" value="${e.rest}" aria-label="Repos entre les séries"><em>s</em></span></label></div>
    <label class="chk"><input type="checkbox" name="perSide" ${e.perSide ? 'checked' : ''}> Par côté (chaque bras, chaque jambe)</label>
    <div class="grid2" data-m="reps" ${t ? 'hidden' : ''}>${numberField('repsMin', 'Reps min', e.repsMin, { min: 1, max: 999, step: 1 })}${numberField('repsMax', 'Reps max', e.repsMax, { min: 1, max: 999, step: 1 })}</div>
    <div class="grid2" data-m="time" ${t ? '' : 'hidden'}>${numberField('secMin', 'Durée min', e.secMin, { min: 1, max: 18000, step: 1, unit: 's' })}${numberField('secMax', 'Durée max', e.secMax, { min: 1, max: 18000, step: 1, unit: 's' })}</div>
    <div class="grid2"><label>Charge<input type="text" name="load" value="${e.load}" maxlength="60" placeholder="+10 kg, poids du corps…"></label><label>Unité<input type="text" name="unit" value="${e.unit}" maxlength="30" placeholder="m, km, blocs, voies…"></label></div>
    ${inSession ? h`<label>Note pour cet exercice <span class="tiny muted">(facultatif)</span><input name="note" value="${e.note}" maxlength="400" placeholder="Ex. élastique rouge, réglette de 20 mm, au ralenti…"></label>` : ''}
    <details class="how"><summary>Position de départ, consignes, muscles <span class="tiny muted">(facultatif)</span></summary><div class="stack">
    <label>Position de départ<textarea name="start" rows="2" maxlength="300" placeholder="Ex. Debout, pieds largeur d’épaules, barre sur le haut du dos.">${e.start || ''}</textarea></label>
    <label>Consignes (une par ligne)<textarea name="ok">${e.ok.join('\n')}</textarea></label>
    <label>La charge : où la mettre<textarea name="loadHow" rows="2" maxlength="300" placeholder="Ex. Un haltère dans chaque main, bras le long du corps.">${e.loadHow || ''}</textarea></label>
    <label>Erreurs à éviter (une par ligne)<textarea name="bad" style="min-height:60px">${e.bad.join('\n')}</textarea></label>
    <label>Muscles principaux</label><div class="chips">${Object.entries(MUSCLES).map(([id, m]) => h`<label class="chip ${e.prim.includes(id) ? 'on' : ''}"><input type="checkbox" name="prim" value="${id}" ${e.prim.includes(id) ? 'checked' : ''} class="hidden" data-change="chipToggle">${m.label}</label>`)}</div>
    <label>Capacités travaillées</label><div class="chips">${Object.entries(CAPACITIES).map(([id, c]) => h`<label class="chip ${e.caps[id] ? 'on' : ''}"><input type="checkbox" name="caps" value="${id}" ${e.caps[id] ? 'checked' : ''} class="hidden" data-change="chipToggle">${c.label}</label>`)}</div></div></details>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button><button class="btn" type="button" data-act="closeSheet">Annuler</button></div>
  </form>`;
}
CHG.exMode = (el) => { const f = el.closest('form'); f.querySelector('[data-m=reps]').hidden = el.value === 'time'; f.querySelector('[data-m=time]').hidden = el.value !== 'time'; };
CHG.chipToggle = (el) => el.closest('.chip')?.classList.toggle('on', el.checked);
const parseDur = (v) => { v = String(v ?? '').trim(); if (!v) return 0; if (/^\d+:\d{1,2}$/.test(v)) { const [m, s] = v.split(':').map(Number); return m * 60 + s; } if (/[a-z]/i.test(v)) return parseRest(v) ?? 0; return Math.max(0, Number(v.replace(',', '.')) || 0); };
function formExercise(form, base = {}) {
  const fd = new FormData(form), f = Object.fromEntries(fd);
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const prim = fd.getAll('prim'), caps = Object.fromEntries(fd.getAll('caps').map((c) => [c, base.caps?.[c] || 1]));
  // Partie (fiche d'une séance) : un des trois blocs, une partie existante ou une nouvelle ; sinon le bloc choisi.
  let block = f.block || base.block || 'main', part = base.part || '';
  if (f.part != null) { if (BLOCKS[f.part]) { block = f.part; part = ''; } else if (f.part === '__new') { part = String(f.partNew || '').trim().slice(0, 40); if (!part) part = base.part || ''; } else { part = String(f.part).slice(0, 40); } }
  return normalizeEx({ ...base, name: f.name, emoji: f.emoji, mode: f.mode, block, part, note: f.note != null ? f.note : base.note, start: f.start != null ? f.start : base.start, loadHow: f.loadHow != null ? f.loadHow : base.loadHow, sets: f.sets, repsMin: f.repsMin, repsMax: f.repsMax, secMin: f.secMin, secMax: f.secMax, perSide: !!f.perSide, load: f.load, unit: f.unit, rest: parseDur(f.rest), ok: lines(f.ok), bad: lines(f.bad), prim, caps, muscles: prim.map((m) => MUSCLES[m]?.label.toLowerCase() || m) });
}
ACT.exEdit = (el) => { const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); if (ex) openSheet(exForm(ex, { kind: 'session', eid: ex.id }), { wide: true }); };
SUBMIT.exSave = async (form) => {
  const k = JSON.parse(new FormData(form).get('ctx'));
  try {
    if (k.kind === 'session') {
      const e = editing(); if (!e) return;
      const base = k.eid === 'new' ? {} : e.s.exercises.find((x) => x.id === k.eid) || {};
      const ex = formExercise(form, base);
      e.save({ ...e.s, exercises: k.eid === 'new' ? [...e.s.exercises, { ...ex, id: uid() }] : e.s.exercises.map((x) => (x.id === k.eid ? { ...ex, id: x.id } : x)) });
    } else if (k.kind === 'personal') {
      const ex = formExercise(form, k.id ? (S.personal.find((p) => p.id === k.id)?.data || {}) : {});
      if (k.id) queue('PUT', `/api/exercises/personal/${encodeURIComponent(k.id)}`, { exercise: ex });
      else { const id = uid(); S.personal.push({ id, name: ex.name, data: ex }); queue('POST', '/api/exercises/personal', { id, exercise: ex }); }
      if (k.id) { const p = S.personal.find((x) => x.id === k.id); if (p) { p.name = ex.name; p.data = ex; } }
    } else if (k.kind === 'commonEx') {
      const ex = formExercise(form, S.commonEx.find((x) => x.id === k.id)?.data || {});
      if (k.id) await api('PUT', `/api/exercises/common/${encodeURIComponent(k.id)}`, { exercise: ex });
      else await api('POST', '/api/exercises/common', { name: ex.name, exercise: ex });
      syncSoon(10);
    }
    closeSheet(); buzzOk(); toast('Enregistré'); render();
  } catch (err) { toast(err.offline ? 'Connexion requise pour cette action.' : err.message, 4000, 'bad'); }
};
ACT.exAdd = () => openSheet(h`<h2 style="margin:0">Ajouter un exercice</h2>
  <div class="row wrapf"><button class="btn" data-act="exWrite">✍️ L’écrire moi-même</button><button class="btn" data-act="exNew">✎ Fiche détaillée</button></div>
  <input type="search" data-input="pickQ" placeholder="Ou cherche dans le catalogue et tes exercices…" aria-label="Rechercher" autofocus>
  <div id="pickList" class="list">${pickRows('')}</div>
  <button class="btn" data-act="closeSheet">Fermer</button>`, { wide: true });
/* ✍️ Écrire des exercices : une ligne par exercice, les nombres sont compris tout seuls (engine.parseQuickList). */
const WRITE_EX = ['Échauffement :', '5 min de corde à sauter', 'Corps de séance :', '4 × 8 tractions repos 2 min', 'Gainage 3 × 30 s', '6 × 400 m repos 1:30', 'Retour au calme :', 'Étirements doux'];
function writePreview(text) {
  const { exercises } = parseQuickList(text);
  if (!exercises.length) return h`<p class="tiny muted">L’aperçu de ce qui sera ajouté s’affiche ici.</p>`;
  let last = null;
  return h`<span class="kicker">${exercises.length} exercice${exercises.length > 1 ? 's' : ''} prêt${exercises.length > 1 ? 's' : ''} à ajouter</span>${exercises.map((e) => { const p = e.part || BLOCKS[e.block], head = p !== last ? h`<div class="tiny muted">${p}</div>` : ''; last = p; return h`${head}<div class="small">${e.emoji} <b>${e.name}</b> · ${exLine(e)}${e.libId ? h` <span title="Exercice du catalogue : ses explications sont reprises">📖</span>` : ''}</div>`; })}${exercises.some((e) => e.libId) ? h`<p class="tiny muted">📖 exercice reconnu dans le catalogue : ses explications (position, consignes, erreurs) sont reprises.</p>` : ''}`;
}
ACT.exWrite = () => openSheet(h`<div class="stack"><h2 style="margin:0">✍️ Écrire des exercices</h2>
  <p class="small muted">Un exercice par ligne, comme dans un carnet. Les séries, répétitions, durées, distances, charges et repos sont compris tout seuls ; tout se modifie ensuite.</p>
  <form data-submit="exWriteGo" class="stack"><textarea name="text" rows="8" maxlength="4000" data-input="exWriteQ" aria-label="Exercices, un par ligne" placeholder="${WRITE_EX.join('\n')}"></textarea>
  <div id="exWritePrev" aria-live="polite">${writePreview('')}</div>
  <details class="how"><summary>Exemples compris</summary><ul class="clean tight tiny">${['« 3 × 10 squats » ou « Squats 3x10 »', '« 4 x 8-10 tractions repos 2 min »', '« Gainage 3 × 30 s », « Planche 1 min 30 »', '« 5 min de corde à sauter », « Grimpe libre 1 h 30 »', '« 6 × 400 m repos 1:30 », « Footing 5 km »', '« Squat 5 × 5 à 60 kg », « Fentes 3 × 10 par jambe »', 'Une ligne qui finit par « : » ouvre une partie (« Circuit A : »)', 'Un nom seul (« Étirements doux ») est gardé tel quel'].map((t) => h`<li>${t}</li>`)}</ul></details>
  <button class="btn pri big" type="submit">Ajouter à ma séance</button><button class="btn" type="button" data-act="closeSheet">Annuler</button></form></div>`);
INPUT.exWriteQ = (el) => { clearTimeout(INPUT.exWriteQ.t); INPUT.exWriteQ.t = setTimeout(() => { const box = $('#exWritePrev'); if (box) box.innerHTML = writePreview(el.value).s; }, 200); };
SUBMIT.exWriteGo = (f) => {
  const { exercises } = parseQuickList(String(new FormData(f).get('text') || ''));
  if (!exercises.length) { toast('Écris au moins un exercice (une ligne).'); return; }
  const e = editing(); if (!e) return;
  closeSheet(); e.save({ ...e.s, exercises: [...e.s.exercises, ...exercises.map((x) => ({ ...x, id: uid() }))].slice(0, 60) }); buzzOk();
  toast(`${exercises.length} exercice${exercises.length > 1 ? 's' : ''} ajouté${exercises.length > 1 ? 's' : ''}`);
};
function pickRows(q) {
  const n = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const e = editing(), act = e?.s.activity;
  const lib = visibleEx(LIBRARY).filter((x) => !x.hidden || S.user?.isAdmin).filter((x) => !n || x.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n)).sort((a, b) => Number(b.acts.includes(act)) - Number(a.acts.includes(act)));
  const pers = S.personal.filter((p) => !n || p.name.toLowerCase().includes(n));
  return h`${pers.map((p) => h`<button class="item pick" data-act="exPick" data-kind="personal" data-id="${p.id}"><div class="ico">${p.data?.emoji || '💪'}</div><div class="grow"><b>${p.name}</b><div class="tiny muted">exercice personnel</div></div></button>`)}
    ${lib.slice(0, 40).map((x) => h`<button class="item pick" data-act="exPick" data-kind="lib" data-id="${x.id}"><div class="ico">${x.emoji}</div><div class="grow"><b>${x.name}</b><div class="tiny muted">${Object.keys(x.caps).slice(0, 2).map(capL).join(', ')}${x.needs.length ? ' · ' + x.needs.map((k) => EQUIPMENT[k] || k).join(', ') : ''}</div></div></button>`)}`;
}
INPUT.pickQ = (el) => { const box = $('#pickList'); if (box) box.innerHTML = pickRows(el.value).s; };
ACT.exNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪', block: 'main' }), { kind: 'session', eid: 'new' }), { wide: true });
ACT.exPick = (el) => {
  const e = editing(); if (!e) return;
  const src = el.dataset.kind === 'lib' ? byId(el.dataset.id) : S.personal.find((p) => p.id === el.dataset.id)?.data;
  if (!src) return;
  const ex = el.dataset.kind === 'lib' ? normalizeEx({ ...src, id: uid(), libId: src.id, ok: src.cues, bad: src.bad, block: src.role === 'warmup' ? 'warmup' : src.role === 'cool' ? 'cool' : 'main' }) : normalizeEx({ ...src, id: uid(), block: 'main' });
  e.save({ ...e.s, exercises: [...e.s.exercises, ex] }); closeSheet(); toast(`Ajouté : ${ex.name}`);
};
ACT.exSwap = (el) => {
  const e = editing(); const ex = e?.s.exercises.find((x) => x.id === el.dataset.id); if (!ex) return;
  const c = ctx(), alts = alternatives(ex, c, { session: e.s, level: levelFor(e.s.activity || 'conditioning', c).level + 1 });
  S.swapFor = ex.id;
  openSheet(h`<h2 style="margin:0">Remplacer « ${ex.name} »</h2><p class="muted small">Alternatives classées selon plusieurs logiques ; chaque raison est indiquée.</p>
    ${alts.length ? alts.map((a) => h`<div class="item"><div class="ico">${a.lib.emoji}</div><div class="grow"><b>${a.lib.name}</b> ${a.pref === 'aime' ? tag('tu aimes', 'ok') : ''} ${a.available ? '' : tag('matériel manquant', 'warn')}<ul class="tiny why">${a.reasons.map((r) => h`<li>${r}</li>`)}</ul></div><button class="btn sm pri" data-act="exSwapDo" data-id="${a.lib.id}" data-reason="${a.reasons[0]}" ${a.available ? '' : 'disabled'}>Choisir</button></div>`) : h`<p class="muted">Aucune alternative connue pour cet exercice (exercice personnel ou très spécifique).</p>`}
    <button class="btn" data-act="closeSheet">Annuler</button>`, { wide: true });
};
ACT.exSwapDo = (el) => {
  const e = editing(); if (!e) return;
  const r = replaceExercise(e.s, S.swapFor, el.dataset.id, el.dataset.reason);
  if (r.change) { putItem('swap', uid(), { from: r.change.from, to: r.change.to, date: Date.now(), where: e.kind === 'gen' ? 'generator' : 'seance' }); if (e.kind === 'gen') (S.gen.swaps ||= []).push(r.change); }
  e.save(r.session); closeSheet(); toast(`Remplacé par « ${r.change?.to} »`);
};
ACT.sEquip = () => {
  const e = editing(); if (!e) return;
  const eq = [...availableEquipment(ctx(), e.s.context.env)];
  const used = [...new Set(e.s.exercises.flatMap((x) => x.needs?.length ? x.needs : byId(x.libId)?.needs || []))];
  openSheet(h`<h2 style="margin:0">Matériel disponible pour cette séance</h2><p class="muted small">Décoche ce qui manque aujourd’hui : la séance est reconstruite et chaque remplacement expliqué.</p>
    <form data-submit="sEquipDo"><div class="chips">${Object.entries(EQUIPMENT).filter(([k]) => eq.includes(k) || used.includes(k)).map(([k, l]) => h`<label class="chip ${eq.includes(k) ? 'on' : ''}"><input type="checkbox" class="hidden" name="eq" value="${k}" ${eq.includes(k) ? 'checked' : ''} data-change="chipToggle">${l}</label>`)}</div>
    <button class="btn pri" type="submit">Reconstruire</button></form>`);
};
SUBMIT.sEquipDo = (f) => {
  const e = editing(); if (!e) return;
  const next = new Set(new FormData(f).getAll('eq')), prev = availableEquipment(ctx(), e.s.context.env);
  const r = rebuildForEquipment(e.s, next, ctx(), 2);
  const extra = newPossibilities(prev, next, e.s.activity);
  e.save(r.session);
  openSheet(h`<h2 style="margin:0">Séance adaptée au matériel</h2>${r.changes.length ? h`<ul class="small">${r.changes.map((c) => h`<li>${c}</li>`)}</ul>` : h`<p class="small">Rien à changer : tout le matériel utilisé est disponible.</p>`}
    ${extra.length ? h`<b class="small">Nouvelles possibilités</b><ul class="small">${extra.map((x) => h`<li>${x.lib.name} — ${x.reason}</li>`)}</ul>` : ''}<button class="btn" data-act="closeSheet">OK</button>`);
};

/* ═════════ Partager une séance : bibliothèque commune ou profil public ═════════ */
ACT.sPublish = (el) => {
  const s = getSeance(el.dataset.id); if (!s) return;
  const loads = s.exercises.filter((e) => /^\s*[+-]?\d+([.,]\d+)?\s*kg\s*$/i.test(e.load)).length, notes = s.exercises.filter((e) => e.note).length;
  const lv = estimateLevel(s);
  openSheet(h`<h2 style="margin:0">Partager « ${s.name} »</h2>
    <p class="small">Ce qui sera publié : le titre, l’activité, les exercices et leurs prescriptions, les intentions, le matériel et la durée.</p>
    <p class="small muted">Retiré automatiquement : tes notes de progression personnelles (${notes}), les charges chiffrées issues de tes performances (${loads}), les explications liées à ton profil, ton lieu et ton objectif. Aucun historique ni performance n’est partagé.</p>
    <p class="small">Niveau estimé : ${levelTag(lv)}</p>${levelDetails(lv, s)}
    <div class="row wrapf"><button class="btn pri" data-act="sPublishDo" data-id="${s.id}" data-scope="common">📚 Bibliothèque commune</button><button class="btn" data-act="sPublishDo" data-id="${s.id}" data-scope="link">🔗 Lien et QR code</button><button class="btn" data-act="sPublishDo" data-id="${s.id}" data-scope="public">🌍 Mon profil public</button><button class="btn" data-act="closeSheet">Annuler</button></div>`, { wide: true });
};
ACT.sPublishDo = async (el) => {
  const s = getSeance(el.dataset.id); if (!s) return;
  try {
    const r = await api('POST', '/api/shared', { id: uid(), scope: el.dataset.scope, session: s, title: s.name }, { opId: 'op-' + uid() });
    if (el.dataset.scope === 'link') { buzzOk(); linkSheet(r.id, s.name); return; }
    closeSheet(); buzzOk(); toast(el.dataset.scope === 'common' ? `Publiée dans la bibliothèque commune (niveau estimé : ${LEVEL_LABEL[r.level.level].toLowerCase()})` : 'Publiée sur ton profil public');
    S.shared.common = null;
  } catch (e) { toast(e.offline ? 'Connexion requise pour publier.' : e.message, 4500, 'bad'); }
};

/* ═════════ Coller un texte ═════════ */
function vImport() {
  const r = S.importResult;
  return h`<div class="row"><button class="btn sm" data-act="backSeances" aria-label="Retour">‹</button><h1 style="margin:0">Coller un texte</h1></div>
    <p class="muted small">Colle ta séance : titre, durée, exercices numérotés (« 1. NOM »), une ligne « charge — 4 × 8 — repos 2 min », des puces.</p>
    <textarea data-input="impText" style="min-height:220px" placeholder="🦵 SÉANCE JAMBES&#10;1. SQUATS&#10;+10 kg — 4 × 6–8 — repos 2 min 30" aria-label="Texte de la séance">${S.importText || ''}</textarea>
    <div class="row wrapf"><button class="btn pri" data-act="impParse">Analyser</button><button class="btn" data-act="backSeances">Annuler</button></div>
    ${r ? (r.session ? h`<div class="card"><h3>${r.session.emoji} ${r.session.name}</h3><div class="muted small">${r.session.exercises.length} exercices · ~${sessionMinutes(r.session)} min</div>${r.session.exercises.map((e, i) => exRow(e, i, r.session.exercises.length, 'view'))}${r.warnings.map((w) => h`<p class="small err">⚠ ${w}</p>`)}<button class="btn pri big" data-act="impSave">Enregistrer cette séance</button></div>` : h`<div class="card"><p class="err">${r.warnings[0]}</p></div>`) : ''}`;
}
INPUT.impText = (el) => { S.importText = el.value; S.importResult = null; };
ACT.openImport = () => { closeSheet(); S.importResult = null; go('library', 'import'); };
ACT.impParse = () => { S.importResult = parseSessionText(S.importText); render(); };
ACT.impSave = () => { const s = saveSeance(S.importResult.session); S.importText = ''; S.importResult = null; toast('Séance ajoutée'); go('library', 'seance', s.id); };

/* ═════════ Générateur : simulation puis génération ═════════ */
export function openGenerator(opts = {}) {
  if (!S.gen.init) { // première ouverture : durée et motivation déclarées dans le questionnaire de profil
    S.gen.init = true;
    const cfg = item('config', 'main') || {};
    S.gen.minutes = Number(cfg.durations?.[0]) || S.settings.defaultMinutes || 30;
    // Dernier format et dernière durée utilisés sur cet appareil (confort : rien d'important n'est perdu sans).
    const last = ls.get('sea:gen-last');
    if (last && Number(last.minutes) >= 5) { S.gen.minutes = Math.min(240, Number(last.minutes)); if (Array.isArray(last.parts) && last.parts.length) { S.gen.parts = cleanParts(last.parts); S.gen.fmtId = String(last.fmtId || 'custom').slice(0, 40); } S.gen.durOther = ![20, 30, 45, 60, 90, 120, 180].includes(S.gen.minutes) && !S.gen.parts; }
    if (!S.gen.intentions?.length && cfg.intent) S.gen.intentions = [{ id: cfg.intent, p: 2 }];
  }
  Object.assign(S.gen, { plan: null, result: null, saved: false, priorities: {} }, opts);
  if (!S.gen.activityId) S.gen.activityId = Object.keys(ctx().activities)[0] || 'conditioning';
  go('library', 'generate');
  if (opts.autoPlan) { ACT.genPlan(); }
}
function vGenerate() {
  const g = S.gen, c = ctx();
  if (!g.activityId) g.activityId = Object.keys(c.activities)[0] || 'conditioning';
  return h`${vGenerateForm(activityOptions)}${g.plan ? vPlan(g.plan) : ''}${g.result ? vGenResult(g.result) : ''}`;
}
ACT.gSet = (el) => { S.gen[el.dataset.k] = el.dataset.k === 'minutes' ? Number(el.dataset.v) : el.dataset.v; S.gen.plan = null; S.gen.result = null; S.gen.priorities = {}; render(); };
CHG.gEnv = (el) => { S.gen.envId = el.value; S.gen.plan = null; S.gen.result = null; render(); };
ACT.genPlan = () => {
  const g = S.gen;
  if (g.mode === 'goal' && !g.goalId) { toast('Choisis un objectif (ou une autre orientation).'); return; }
  const o = genOptions();
  ls.set('sea:gen-last', { minutes: g.minutes, parts: o.parts, fmtId: g.fmtId || '' });
  g.plan = planSession({ activityId: g.activityId, mode: g.mode, goalId: g.mode === 'goal' ? g.goalId : '', capId: g.capId || '', minutes: g.minutes, intentions: g.intentions, envId: g.envId, priorities: g.priorities, seed: g.seed ?? Math.floor(Math.random() * 1e9), ...o }, ctx());
  g.boost = o.boost;
  g.seed = g.plan.seed; g.result = null; render(); setTimeout(() => $('#genplan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
};
function vPlan(p) {
  const total = p.blocks.reduce((t, b) => t + b.minutes, 0) || 1;
  const dots = '●'.repeat(p.difficulty.value) + '○'.repeat(5 - p.difficulty.value);
  return h`<div id="genplan" class="card acc-b plan"><span class="kicker">👀 Simulation avant génération</span>
    <h3>${p.intentionText}</h3>
    <div class="chips"><span class="chip static">⏱ ${p.minutes} min</span>${p.envName ? h`<span class="chip static">📍 ${p.envName}</span>` : ''}<span class="chip static" title="${p.difficulty.text}">📶 ${dots}</span></div>
    <div class="blocksbar">${p.blocks.map((b) => h`<i class="${b.kind}" style="flex:${b.minutes}" title="${b.label} ${b.minutes} min"></i>`)}</div>
    <div class="chips small-chips">${p.blocks.map((b) => h`<span class="chip static"><i class="dot ${b.kind}"></i>${b.label} · ${b.minutes}′</span>`)}</div>
    <b class="small">🎯 Ce qui sera travaillé <span class="tiny muted">(± pour ajuster)</span></b>
    ${p.distribution.length ? p.distribution.map((d) => h`<div class="prow"><div class="grow"><div class="row between"><b class="small">${d.label}</b><span class="tiny muted">${d.pct} %</span></div><div class="track"><i style="width:${d.pct}%"></i></div></div>
      <button class="btn sm ic" data-act="prio" data-id="${d.capId}" data-d="-1" aria-label="Moins prioritaire">−</button><button class="btn sm ic" data-act="prio" data-id="${d.capId}" data-d="1" aria-label="Plus prioritaire">＋</button><button class="btn sm ic danger" data-act="prio" data-id="${d.capId}" data-d="0" aria-label="Retirer">✕</button></div>`) : h`<p class="small muted">Aucune capacité ciblée.</p>`}
    <details class="how mini"><summary>＋ Ajouter une capacité</summary><div class="chips">${Object.entries(CAPACITIES).filter(([id]) => !p.distribution.some((d) => d.capId === id)).map(([id, c]) => chip(false, c.label, `data-act="prio" data-id="${id}" data-d="add"`))}</div></details>
    ${p.preview?.length ? h`<div class="chips">${p.preview.map((x) => h`<span class="chip static">💪 ${x}</span>`)}</div>` : ''}
    <p class="small">🧰 <b>Matériel nécessaire :</b> ${p.neededEquipment?.length ? p.neededEquipment.join(', ') : 'aucun'}</p>
    ${p.missing.length ? h`<p class="small warn-t">⚠ ${p.missing[0]}</p>` : ''}
    <details class="how mini"><summary>Pourquoi ces choix ?</summary><ul class="small">${p.distribution.map((d) => h`<li><b>${d.label}</b> : ${d.reasons.join(' · ')}</li>`)}${p.blocks.map((b) => h`<li><b>${b.label}</b> : ${b.reason}</li>`)}<li>${p.difficulty.text}</li>${p.constraints.map((x) => h`<li>${x}</li>`)}${p.missing.slice(1).map((x) => h`<li>${x}</li>`)}</ul></details>
    ${sourcesLine(['who2020', 'acsm2009', 'soligard2008'])}<button class="btn pri big" data-act="genDo">Générer la séance</button></div>`;
}
ACT.prio = (el) => {
  const g = S.gen, id = el.dataset.id, d = el.dataset.d;
  const cur = Object.fromEntries(g.plan.distribution.map((x) => [x.capId, x.weight]));
  const pr = { ...cur, ...g.priorities };
  if (d === '0') pr[id] = 0; else if (d === 'add') pr[id] = 1.5; else pr[id] = Math.max(0.2, Math.min(3, (pr[id] || 1) + Number(d) * 0.5));
  g.priorities = pr; ACT.genPlan();
};
ACT.genDo = () => { const g = S.gen; if (!g.plan) return; g.result = generateFromPlan(g.plan, ctx()); if (g.boost) g.result = { ...g.result, session: boostSession(g.result.session, g.boost) }; g.saved = false; g.swaps = []; buzzOk(); render(); setTimeout(() => $('#genresult')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };
function vGenResult(r) {
  const s = r.session;
  return h`<div id="genresult" class="card"><div class="row"><div class="ico acc">${s.emoji}</div><div class="grow"><h3>${s.name}</h3><div class="muted small">~${sessionMinutes(s)} min ${levelTag(r.meta.level)}</div></div></div>
    ${sessionBrief(s)}
    ${howBox({ ...s.explain, note: 'Faits = données de ton profil et de ton historique ; estimations = ce que l’application en déduit. Aucune performance n’est inventée.' }, { open: false, title: 'Pourquoi cette séance ?' })}
    ${blocksOf(s, 'gen')}
    <div class="row wrapf"><button class="btn pri" data-act="play" data-gen="1">▶ Lancer</button><button class="btn" data-act="genSave" ${S.gen.saved ? 'disabled' : ''}>${S.gen.saved ? '✓ Enregistrée' : '💾 Enregistrer'}</button><button class="btn" data-act="genAgain">🔁 Autre proposition</button></div></div>`;
}
ACT.genSave = () => { const s = saveSeance(S.gen.result.session); S.gen.result.session = s; S.gen.saved = true; toast('Ajoutée à Mes séances'); render(); };
ACT.genAgain = () => { S.gen.seed = Math.floor(Math.random() * 1e9); ACT.genPlan(); ACT.genDo(); };

/* ═════════ Exercices : catalogue, anatomie, exercices personnels, exercices communs ═════════ */
function vExercises() {
  const q = S.filters.exq || '', act = S.filters.exAct || '', cap = S.filters.exCap || '';
  const n = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const match = (name) => !n || name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n);
  const lib = visibleEx(LIBRARY).filter((x) => x.role === 'main' && match(x.name) && (!act || x.acts.includes(act)) && (!cap || (x.caps[cap] || 0) >= 0.5));
  const c = ctx(), tried = neverTried(c, { activityId: act || undefined, level: 1 });
  const top = h`<button class="card pick row" data-act="libSub" data-id="best"><span class="catemoji">🏆</span><span class="grow"><b>Top exercices pour toi</b><small class="tiny muted" style="display:block">Les plus utiles par catégorie, selon ton profil</small></span><span class="chev">›</span></button>`;
  return h`${top}${contentAdmin() ? h`<button class="btn" data-act="exNewGlobal">🌍 ＋ Exercice pour tout le monde</button>` : ''}<button class="card pick ai-cta" data-act="aiOpen" data-id="exercise"><span>🤖</span><div><b>Créer un exercice avec l’assistant</b><small>Écris « clipage », « pompes diamant »… elle prépare la fiche.</small></div></button>
    <input type="search" data-input="exQ" value="${q}" placeholder="Rechercher un exercice…" aria-label="Rechercher un exercice">
    <div class="grid2"><select data-change="exAct" aria-label="Activité"><option value="">Toutes activités</option>${Object.entries(ACTIVITIES).map(([id, a]) => h`<option value="${id}" ${act === id ? 'selected' : ''}>${a.emoji} ${a.label}</option>`)}</select>
    <select data-change="exCap" aria-label="Capacité"><option value="">Toutes capacités</option>${raw(capOptionGroups(Object.keys(CAPACITIES), cap))}</select></div>
    ${tried.length && !q ? h`<div class="card flat"><b class="small">🆕 Jamais essayé</b>${tried.map((t) => h`<div class="item"><div class="ico">${t.lib.emoji}</div><div class="grow"><b>${t.lib.name}</b><div class="tiny muted">${t.reason}</div></div><button class="btn sm" data-act="libInfo" data-id="${t.lib.id}">Voir</button></div>`)}</div>` : ''}
    <div class="card"><div class="row between"><h3>Mes exercices</h3><button class="btn sm" data-act="persNew">＋ Nouveau</button></div>${S.personal.filter((p) => match(p.name)).map((p) => h`<div class="item"><div class="ico">${p.data?.emoji || '💪'}</div><div class="grow"><b>${p.name}</b><div class="tiny muted">${exLine(normalizeEx(p.data))}</div></div><button class="btn sm" data-act="persInfo" data-id="${p.id}">Voir</button>${shareButton('exercise', p.id)}</div>`)}${S.personal.length ? '' : h`<p class="muted small">Aucun exercice personnel.</p>`}</div>
    <div class="card"><h3>Catalogue intégré (${lib.length})</h3>${lib.slice(0, S.exMore ? 200 : 15).map((x) => h`<div class="item"><div class="ico">${x.emoji}</div><div class="grow"><b>${x.name}</b><div class="tiny muted">${Object.entries(x.caps).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => capL(k)).join(', ')} · difficulté ${x.diff}/5</div></div><button class="btn sm" data-act="libInfo" data-id="${x.id}">Voir</button></div>`)}${!S.exMore && lib.length > 15 ? h`<button class="btn ghost" data-act="exMore">Voir les ${lib.length - 15} autres exercices</button>` : ''}</div>
    <div class="card"><div class="row between"><h3>Exercices communs</h3><button class="btn sm" data-act="cexNew">＋ Proposer</button></div>${S.commonEx.filter((x) => match(x.name)).map((x) => h`<div class="item"><div class="ico">${x.data?.emoji || '💪'}</div><div class="grow"><b>${x.name}</b><div class="tiny muted">par ${x.author || 'compte supprimé'}</div></div><button class="btn sm" data-act="cexInfo" data-id="${x.id}">Voir</button></div>`)}${S.commonEx.length ? '' : h`<p class="muted small">Aucun exercice commun pour l’instant.</p>`}</div>
    <details class="card"><summary><b>Sources d’inspiration</b></summary>${SOURCES.map((s) => h`<p class="small"><b>${s.title}</b> — ${s.by}<br><span class="muted">${s.note}</span></p>`)}</details>`;
}
INPUT.exQ = (el) => { S.filters.exq = el.value; clearTimeout(INPUT.exQ.t); INPUT.exQ.t = setTimeout(() => { render(); const i = $('[data-input=exQ]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
CHG.exAct = (el) => { S.filters.exAct = el.value; render(); };
CHG.exCap = (el) => { S.filters.exCap = el.value; render(); };
export function exerciseSheet(ex, actions = '', session = null) {
  const lib = byId(ex.libId || ex.id) || null;
  const e = lib ? { ...lib, ...ex, caps: Object.keys(ex.caps || {}).length ? ex.caps : lib.caps, prim: ex.prim?.length ? ex.prim : lib.prim, sec: ex.sec?.length ? ex.sec : lib.sec } : ex;
  if (lib) for (const k of ['start', 'loadHow', 'easier', 'harder']) e[k] = ex[k] || lib[k] || '';
  const g = graphFromExercise({ caps: e.caps || {}, prim: e.prim || [], sec: e.sec || [] }, ctx());
  const cues = e.ok?.length ? e.ok : e.cues || [];
  return h`<div class="row"><div class="ico">${e.emoji}</div><div class="grow"><h2 style="margin:0">${e.name}</h2>${e.sets ? h`<div class="muted small">${exLine(normalizeEx(e))}</div>` : ''}</div></div>
    ${exerciseBrief({ ...ex, libId: ex.libId || (lib ? lib.id : '') }, session)}
    ${e.start ? h`<section class="card flat"><b class="small">🧍 Position de départ</b><p class="small" style="margin:.2em 0 0">${e.start}</p></section>` : ''}
    ${cues.length ? h`<section class="card flat"><b class="small ok-t">✅ Le mouvement</b><ul class="clean tight">${cues.map((c) => h`<li>${c}</li>`)}</ul></section>` : ''}
    ${e.loadHow ? h`<section class="card flat"><b class="small">🏋️ La charge : où la mettre</b><p class="small" style="margin:.2em 0 0">${e.loadHow}</p></section>` : ''}
    ${e.bad?.length ? h`<details class="how mini"><summary>⚠️ Erreurs à éviter (${e.bad.length})</summary><ul class="small">${e.bad.map((c) => h`<li>${c}</li>`)}</ul></details>` : ''}
    ${e.easier || e.harder ? h`<section class="card flat"><b class="small">🎚️ À ton niveau</b>${e.easier ? h`<p class="small" style="margin:.2em 0 0">↘️ <b>Plus facile :</b> ${e.easier}</p>` : ''}${e.harder ? h`<p class="small" style="margin:.2em 0 0">↗️ <b>Plus dur :</b> ${e.harder}</p>` : ''}</section>` : ''}
    <div class="chips">${e.needs?.length ? e.needs.map((k) => h`<span class="chip static">🧰 ${EQUIPMENT[k] || k}</span>`) : h`<span class="chip static">🙌 Sans matériel</span>`}${e.diff ? h`<span class="chip static">📶 ${'●'.repeat(e.diff)}${'○'.repeat(5 - e.diff)}</span>` : ''}${e.minLevel ? h`<span class="chip static">⭐ niveau ${['débutant', 'intermédiaire', 'avancé'][e.minLevel]}</span>` : ''}</div>
    ${raw(anatomySvg({ primary: e.prim || [], secondary: e.sec || [] }))}
    <div class="chips">${g.muscles.prim.map((m) => h`<span class="chip static"><i class="lg p"></i>${m}</span>`)}${g.muscles.sec.map((m) => h`<span class="chip static"><i class="lg s"></i>${m}</span>`)}</div>
    ${g.caps.length ? h`<details class="how mini"><summary>💪 Ce que ça travaille (${g.caps.length})</summary>${g.caps.map((c) => h`<div class="cbar"><span>${c.label}</span><div class="track"><i class="cur" style="width:${Math.round(c.w * 100)}%"></i></div><b></b></div>${c.goals.length ? h`<p class="tiny muted">→ utile pour ${c.goals.map((x) => x.label).join(', ')}</p>` : ''}`)}</details>` : ''}
    ${actions}<button class="btn" data-act="closeSheet">Fermer</button>`;
}
ACT.libInfo = (el) => { const x = byId(el.dataset.id); if (!x) return; S.pickSrc = { kind: 'lib', id: x.id }; openSheet(exerciseSheet(x, h`<div class="row wrapf">${S.seances.items.length ? h`<select id="addTarget" aria-label="Séance cible">${S.seances.items.filter((s) => !s.archived).map((s) => h`<option value="${s.id}">${s.emoji} ${s.name}</option>`)}</select><button class="btn pri sm" data-act="addToSeance">＋ Ajouter</button>` : ''}<button class="btn sm" data-act="libKeep" data-id="${x.id}">Copier dans mes exercices</button></div>${exerciseEditButtons(x)}`), { wide: true }); };
ACT.addToSeance = () => {
  const s = getSeance($('#addTarget')?.value); const src = S.pickSrc; if (!s || !src) return;
  const base = src.kind === 'lib' ? byId(src.id) : S.personal.find((p) => p.id === src.id)?.data;
  const ex = src.kind === 'lib' ? normalizeEx({ ...base, id: uid(), libId: base.id, ok: base.cues, bad: base.bad, block: 'main' }) : normalizeEx({ ...base, id: uid(), block: 'main' });
  saveSeance({ ...s, exercises: [...s.exercises, ex] }); closeSheet(); toast(`Ajouté à « ${s.name} »`);
};
ACT.libKeep = (el) => { const x = byId(el.dataset.id); if (!x) return; const ex = normalizeEx({ ...x, ok: x.cues, libId: '' }); const id = uid(); S.personal.push({ id, name: x.name, data: ex }); queue('POST', '/api/exercises/personal', { id, exercise: ex }); closeSheet(); toast('Copié dans tes exercices'); render(); };
ACT.persNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪' }), { kind: 'personal', eid: 'new' }), { wide: true });
ACT.persInfo = (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (!p) return; S.pickSrc = { kind: 'personal', id: p.id }; openSheet(exerciseSheet({ ...normalizeEx(p.data), name: p.name }, h`<div class="row wrapf">${S.seances.items.length ? h`<select id="addTarget" aria-label="Séance cible">${S.seances.items.filter((s) => !s.archived).map((s) => h`<option value="${s.id}">${s.emoji} ${s.name}</option>`)}</select><button class="btn pri sm" data-act="addToSeance">＋ Ajouter</button>` : ''}<button class="btn sm" data-act="persEdit" data-id="${p.id}">✎ Modifier</button><button class="btn sm" data-act="persShare" data-id="${p.id}">Proposer à la commune</button><button class="btn danger sm" data-act="persDel" data-id="${p.id}">Supprimer</button></div>`), { wide: true }); };
ACT.persEdit = (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (p) openSheet(exForm(normalizeEx({ ...p.data, name: p.name }), { kind: 'personal', id: p.id, eid: 'x' }), { wide: true }); };
ACT.persDel = async (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (!p || !(await ask(`Supprimer « ${p.name} » ?`, { ok: 'Supprimer', danger: true }))) return; S.personal = S.personal.filter((x) => x.id !== p.id); queue('DELETE', `/api/exercises/personal/${encodeURIComponent(p.id)}`); closeSheet(); render(); };
ACT.persShare = async (el) => { const p = S.personal.find((x) => x.id === el.dataset.id); if (!p) return; try { await api('POST', '/api/exercises/common', { name: p.name, exercise: p.data }, { opId: 'op-' + uid() }); closeSheet(); toast('Proposé dans les exercices communs'); syncSoon(10); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };
ACT.cexNew = () => openSheet(exForm(normalizeEx({ name: '', emoji: '💪' }), { kind: 'commonEx', eid: 'new' }), { wide: true });
ACT.cexInfo = (el) => {
  const x = S.commonEx.find((y) => y.id === el.dataset.id); if (!x) return;
  const can = x.mine || S.user?.isAdmin;
  S.pickSrc = null;
  openSheet(exerciseSheet({ ...normalizeEx(x.data), name: x.name }, h`<p class="tiny muted">Proposé par ${x.author || 'compte supprimé'}.</p><div class="row wrapf"><button class="btn sm" data-act="cexKeep" data-id="${x.id}">Copier dans mes exercices</button>${can ? h`<button class="btn sm" data-act="cexEdit" data-id="${x.id}">✎ Modifier</button><button class="btn danger sm" data-act="cexDel" data-id="${x.id}">Supprimer</button>` : ''}</div>`), { wide: true });
};
ACT.cexKeep = (el) => { const x = S.commonEx.find((y) => y.id === el.dataset.id); if (!x) return; const id = uid(); S.personal.push({ id, name: x.name, data: x.data }); queue('POST', '/api/exercises/personal', { id, exercise: x.data }); closeSheet(); toast('Copié dans tes exercices'); render(); };
ACT.cexEdit = (el) => { const x = S.commonEx.find((y) => y.id === el.dataset.id); if (x) openSheet(exForm(normalizeEx({ ...x.data, name: x.name }), { kind: 'commonEx', id: x.id, eid: 'x' }), { wide: true }); };
ACT.cexDel = async (el) => { const x = S.commonEx.find((y) => y.id === el.dataset.id); if (!x || !(await ask(`Supprimer « ${x.name} » des exercices communs ?`, { ok: 'Supprimer', danger: true }))) return; try { await api('DELETE', `/api/exercises/common/${encodeURIComponent(x.id)}`); S.commonEx = S.commonEx.filter((y) => y.id !== x.id); closeSheet(); toast('Supprimé'); render(); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };

/* ═════════ Bibliothèque commune ═════════ */
export async function loadCommon() {
  const sh = S.shared; sh.loading = true; sh.error = ''; render();
  try { const r = await api('GET', '/api/shared?scope=common'); sh.common = r.items; }
  catch (e) { sh.error = e.offline ? 'Connexion requise pour voir la bibliothèque commune.' : e.message; }
  sh.loading = false; render();
}
/** Repère d'escalade d'une séance commune, exprimé dans le système de l'utilisateur SEULEMENT si une correspondance existe. */
function gradeHintText(gh) {
  if (!gh) return '';
  const c = ctx(), act = gh.systemId === 'french' ? 'voie' : 'bloc';
  const mine = Object.values(c.systems).filter((s) => !s.builtin && !s.archived && s.activity === act);
  const ref = toReference(gh, c.systems, act);
  const conv = ref ? mine.map((s) => { const l = fromReference(ref.index, s, act); return l ? `${l.label} (${s.name})` : null; }).filter(Boolean) : [];
  return `${gh.label} (${gh.systemName})${conv.length ? ' ≈ ' + conv.join(', ') : mine.length ? ' — pas d’équivalence définie dans ton système' : ''}`;
}
function vCommon() {
  if (S.user.guest) return h`<div class="card acc-b"><h3>🔒 Compte nécessaire</h3><p class="small">La bibliothèque commune (séances partagées par les membres) demande un compte gratuit. En le créant, tout ce que tu as fait en mode invité est conservé.</p><button class="btn pri" data-act="guestUpgrade">Créer mon compte</button></div>`;
  const sh = S.shared;
  if (!sh.common && !sh.loading && !sh.error) setTimeout(loadCommon, 0);
  const f = S.filters.common || {};
  const list = (sh.common || []).filter((x) => (!f.level || x.level?.level === f.level) && (!f.activity || x.activity === f.activity) && (!f.noEq || !x.needs.length) && (!f.max || (x.durationMin || 0) <= f.max));
  return h`<p class="muted small">🌍 Séances partagées volontairement par les membres, classées automatiquement. Ce n’est pas le catalogue officiel (🗂 Séances prêtes, vérifiées et sourcées). Ta copie enregistrée est indépendante ; l’original ne change jamais.</p>
    <div class="row wrapf"><button class="btn pri sm" data-act="commonPublish">＋ Partager une de mes séances</button><button class="btn sm" data-act="commonReload">↻ Actualiser</button></div>
    <div class="chips">${[['', 'Tous niveaux'], ['debutant', 'Débutant'], ['intermediaire', 'Intermédiaire'], ['avance', 'Avancé']].map(([k, l]) => chip((f.level || '') === k, l, `data-act="cFilter" data-k="level" data-v="${k}"`))}${chip(!!f.noEq, 'Sans matériel', 'data-act="cFilter" data-k="noEq" data-v="1"')}${chip(f.max === 30, '≤ 30 min', 'data-act="cFilter" data-k="max" data-v="30"')}</div>
    <select data-change="cAct" aria-label="Activité"><option value="">Toutes activités</option>${Object.entries(ACTIVITIES).map(([id, a]) => h`<option value="${id}" ${f.activity === id ? 'selected' : ''}>${a.emoji} ${a.label}</option>`)}</select>
    ${sh.loading && !sh.common ? skeleton(3) : sh.error ? h`<div class="card flat"><p class="err">${sh.error}</p><button class="btn" data-act="commonReload">Réessayer</button></div>`
      : list.length ? list.map((x) => h`<div class="card"><div class="row"><div class="ico">${x.emoji}</div><div class="grow"><b>${x.title}</b><div class="muted small">par ${x.author || 'compte supprimé'}${x.mine ? ' (toi)' : ''} · ${x.activity ? activityLabel(x.activity, ctx()) + ' · ' : ''}~${x.durationMin} min · ${x.exerciseCount} exercice(s)</div>
          <div class="row wrapf tight">${levelTag(x.level)}${x.needs.length ? tag(x.needs.map((k) => EQUIPMENT[k] || k).join(', ')) : tag('sans matériel', 'ok')}${x.gradeHint ? tag('🧗 ' + gradeHintText(x.gradeHint), 'info') : ''}</div>${x.caps.length ? h`<div class="tiny muted">Capacités : ${x.caps.map(capL).join(', ')}</div>` : ''}${metaTags(x.level?.meta)}</div></div>
          <div class="row wrapf"><button class="btn sm" data-act="commonOpen" data-id="${x.id}">Voir</button><button class="btn sm pri" data-act="commonCopy" data-id="${x.id}">Enregistrer dans mes séances</button></div></div>`)
      : empty(sh.common?.length ? 'Aucune séance ne correspond à ces filtres.' : 'La bibliothèque commune est vide pour l’instant : partage la première séance !')}`;
}
ACT.commonReload = () => loadCommon();
ACT.cFilter = (el) => { const f = { ...(S.filters.common || {}) }; const k = el.dataset.k; const v = k === 'max' ? Number(el.dataset.v) : k === 'noEq' ? true : el.dataset.v; f[k] = f[k] === v ? (k === 'level' ? '' : undefined) : v; S.filters.common = f; render(); };
CHG.cAct = (el) => { S.filters.common = { ...(S.filters.common || {}), activity: el.value }; render(); };
async function fetchShared(id) { const r = await api('GET', `/api/shared/${encodeURIComponent(id)}`); return r.item; }
ACT.commonOpen = async (el) => { try { S.shared.detail = await fetchShared(el.dataset.id); go('library', 'common-detail', el.dataset.id); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };
function vCommonDetail() {
  const d = S.shared.detail;
  if (!d || d.id !== S.param) { if (S.param) fetchShared(S.param).then((x) => { S.shared.detail = x; render(); }).catch((e) => { S.shared.error = e.message; toast(e.offline ? 'Connexion requise.' : e.message); }); return skeleton(2); }
  const s = normalizeSession(d.session);
  return h`<div class="row"><button class="btn sm" data-act="libSub" data-id="common" aria-label="Retour">‹</button><div class="grow"></div><button class="btn pri" data-act="play" data-shared="1">▶ Lancer</button></div>
    <div class="card"><h2 style="margin:0">${s.emoji} ${d.title}</h2><p class="muted small">par ${d.author || 'compte supprimé'}${d.mine ? ' (toi)' : ''} · créée le ${fmtDay(d.createdAt)} · modifiée ${relDate(d.updatedAt)}</p>
      <div class="row wrapf tight">${levelTag(d.level)}${d.gradeHint ? tag('🧗 ' + gradeHintText(d.gradeHint), 'info') : ''}</div>${levelDetails(d.level)}${metaTags(d.level?.meta)}${metaWhy(d.level?.meta)}
      ${s.intentions.length ? h`<p class="small">Intentions : ${s.intentions.map((i) => INTENTIONS[i.id]?.label || i.id).join(', ')}</p>` : ''}${s.notes.map((n) => h`<details class="how"><summary>${n.title}</summary><pre class="txt">${n.text}</pre></details>`)}</div>
    ${sessionBrief(s)}
    <div class="card">${blocksOf(s, 'view')}</div>
    <div class="row wrapf"><button class="btn pri" data-act="commonCopy" data-id="${d.id}">📥 Enregistrer dans mes séances</button>${d.canEdit ? h`<button class="btn" data-act="commonEdit">✎ Modifier l’original</button>` : ''}${d.canDelete ? h`<button class="btn danger" data-act="commonDelete">🗑 Supprimer</button>` : ''}</div>
    ${!d.canEdit ? h`<p class="tiny muted">Seul le créateur (ou un administrateur) peut modifier l’original. Enregistre-la pour la modifier librement.</p>` : ''}`;
}
ACT.commonCopy = async (el) => {
  try {
    const d = S.shared.detail?.id === el.dataset.id ? S.shared.detail : await fetchShared(el.dataset.id);
    const now = Date.now(), src = normalizeSession(d.session);
    const copy = saveSeance({ ...src, id: uid(), name: d.title, source: 'copy', template: false, archived: false, explain: null, createdAt: now, updatedAt: now,
      exercises: src.exercises.map((e) => ({ ...e, id: uid(), note: '' })), origin: { kind: d.scope, id: d.id, author: d.author || '', copiedAt: now } });
    buzzOk(); toast('Copie enregistrée dans tes séances (indépendante de l’original)'); go('library', 'seance', copy.id);
  } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.commonEdit = () => { const d = S.shared.detail; if (!d?.canEdit) return; S.sharedDraft = { id: d.id, base: d.updatedAt, session: normalizeSession(d.session), admin: !d.mine }; go('library', 'shared-edit', d.id); };
ACT.sharedCancel = async () => { if (await ask('Abandonner les modifications de la contribution ?')) { S.sharedDraft = null; go('library', 'common-detail', S.shared.detail?.id || ''); } };
ACT.sharedSave = async () => {
  const dr = S.sharedDraft; if (!dr) return;
  try {
    await api('PUT', `/api/shared/${encodeURIComponent(dr.id)}`, { session: dr.session, title: dr.session.name, baseUpdatedAt: dr.base }, { opId: 'op-' + uid() });
    S.sharedDraft = null; S.shared.detail = null; S.shared.common = null; buzzOk(); toast('Contribution mise à jour'); go('library', 'common-detail', dr.id);
  } catch (e) {
    if (e.status === 409 && (await ask('Cette contribution a été modifiée entre-temps par quelqu’un d’autre.', { ok: 'Écraser avec ma version', cancel: 'Garder la version existante', danger: true }))) {
      try { await api('PUT', `/api/shared/${encodeURIComponent(dr.id)}`, { session: dr.session, title: dr.session.name, force: true }); S.sharedDraft = null; toast('Contribution mise à jour'); go('library', 'common-detail', dr.id); } catch (e2) { toast(e2.message, 4000, 'bad'); }
    } else toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad');
  }
};
ACT.commonDelete = async () => {
  const d = S.shared.detail; if (!d) return;
  if (!(await ask(`Supprimer « ${d.title} » de la bibliothèque commune ?`, { ok: 'Supprimer', danger: true, detail: 'Les copies déjà enregistrées par les membres sont conservées (elles sont indépendantes).' }))) return;
  try { await api('DELETE', `/api/shared/${encodeURIComponent(d.id)}`); S.shared.detail = null; S.shared.common = null; toast('Supprimée'); go('library', 'common'); loadCommon(); }
  catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.commonPublish = () => {
  const list = S.seances.items.filter((s) => !s.archived && s.exercises.length);
  openSheet(h`<h2 style="margin:0">Partager une séance</h2>${list.length ? list.map((s) => h`<button class="item pick" data-act="sPublish" data-id="${s.id}"><div class="ico">${s.emoji}</div><div class="grow"><b>${s.name}</b><div class="tiny muted">${s.exercises.length} exercices</div></div></button>`) : h`<p class="muted">Crée d’abord une séance avec au moins un exercice.</p>`}<button class="btn" data-act="closeSheet">Fermer</button>`);
};

/* ═════════ Recherche ═════════ */
function vSearch() {
  const q = S.search.q, c = ctx();
  // Exercices d'un sport « jamais » masqué (Profil › Mes sports) : retirés des résultats.
  const okEx = (r) => !(r.kind === 'library' && exHidden(byId(r.id))) && !(r.lib && exHidden(r.lib)) && !(r.acts && exHidden(r));
  const classic = q ? classicSearch(q, { seances: S.seances.items, history: S.history, personal: S.personal, common: S.shared.common || [], goals: c.goals.map((g) => ({ ...g, label: goalLabel(g) })) }).filter(okEx) : [];
  const smart = q && S.search.smart ? smartSearch(q, c, { seances: S.seances.items }).map((g) => ({ ...g, results: g.results.filter(okEx) })) : [];
  const row = (r) => h`<button class="item pick" data-act="searchOpen" data-kind="${r.kind}" data-id="${r.id}"><div class="grow"><b>${r.label}</b><div class="tiny muted">${r.detail}</div></div></button>`;
  return h`<form data-submit="search" class="row"><input type="search" name="q" value="${q}" placeholder="Ex. front lever, séances sans matériel, records de tirage…" aria-label="Rechercher" class="grow"><button class="btn pri" type="submit">🔎</button></form>
    <label class="chk"><input type="checkbox" data-change="searchSmart" ${S.search.smart ? 'checked' : ''}> Recherche intelligente (capacités, figures, muscles, matériel, styles)</label>
    ${q ? h`${smart.map((g) => h`<div class="card"><h3>${g.title}</h3><p class="tiny muted">${g.why}</p>${g.results.length ? g.results.slice(0, 15).map(row) : h`<p class="small muted">Aucun résultat.</p>`}</div>`)}
      <div class="card"><h3>Résultats texte (${classic.length})</h3>${classic.length ? classic.map(row) : h`<p class="small muted">Aucun résultat.</p>`}</div>` : h`<p class="muted small">Cherche dans tes séances, ton historique, tes exercices, tes objectifs, le catalogue et la bibliothèque commune.</p>`}`;
}
SUBMIT.search = (f) => { S.search.q = String(new FormData(f).get('q') || '').trim(); render(); };
CHG.searchSmart = (el) => { S.search.smart = el.checked; render(); };
ACT.searchOpen = (el) => {
  const k = el.dataset.kind, id = el.dataset.id;
  if (k === 'seance') go('library', 'seance', id);
  else if (k === 'library') ACT.libInfo({ dataset: { id } });
  else if (k === 'personal') ACT.persInfo({ dataset: { id } });
  else if (k === 'common') ACT.commonOpen({ dataset: { id } });
  else if (k === 'history') go('progress', 'history', id);
  else if (k === 'goal') go('profile', 'goals', id);
  else if (k === 'record' || k === 'perf') go('progress', 'records');
  else if (k === 'ascent') go('profile', 'climbing');
};
export { vEditor };
