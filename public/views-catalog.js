// views-catalog.js — Bibliothèque › « Prêtes » (séances sourcées, filtres, tri pour toi), « Top exercices »
// (classement par catégorie, adapté à ton profil) et la liste des sources scientifiques citées.
import { h, raw, chip, openSheet, closeSheet, toast, fmtDur, subHead, seg } from './ui.js';
import { S, ACT, ctx, render, saveSeance, item } from './state.js';
import { uid } from './shared.js';
import { ACTIVITIES, CAPACITIES, EQUIPMENT } from './model.js';
import { availableEquipment, profileCapacities, strengthsWeaknesses, activeGoals, goalCaps } from './brain.js';
import { levelFor } from './generator.js';
import { startPlayer } from './player.js';
import { CATALOG, focusOf, COMPETENCES, MUSCLE_FOCUS, buildSession, rankCatalog, needsOf, rankExercises, EX_CATEGORIES } from './catalog.js';
import { SOURCES } from './sources.js';
import { sourcesLine } from './srcui.js';
import { adaptButton } from './views-adapt.js';
import { catalogEditButtons, sourceAdminButtons } from './content.js';
import { sessionBrief, exerciseSheet } from './views-library.js';
export { sourcesLine };

const GOAL_L = { endurance: 'Endurance', force: 'Force', poids: 'Perte de poids', muscle: 'Prise de muscle', forme: 'Forme', sante: 'Santé', climb: 'Escalade', mobilite: 'Mobilité' };
/** Ce que le profil dit, pour trier : sports, objectifs, points faibles, niveau, matériel. */
function profileNeeds() {
  const c = ctx(), acts = Object.keys(c.activities), cfg = item('config', 'main') || {};
  const goals = cfg.goals?.length ? cfg.goals : cfg.goal ? [cfg.goal] : [];
  const st = profileCapacities(c), sw = strengthsWeaknesses(st);
  const weak = [...new Set([...sw.weaknesses.map((x) => x.capId), ...activeGoals(c).flatMap((g) => goalCaps(g, c).map((x) => x.id))])];
  const level = Math.max(0, ...acts.map((a) => { try { return levelFor(a, c).level; } catch { return 0; } }));
  const need = {}; for (const id of weak) need[id] = 1; for (const x of st) if (x.level != null && x.level >= 2) need[x.capId] = Math.min(need[x.capId] || 0.4, 0.4);
  return { acts, goals, weak, level, equipment: availableEquipment(c), need };
}

/* ───────── Séances prêtes ───────── */
export function vCatalog() {
  const f = (S.catF ||= { sport: '', goal: '', time: '', level: '', view: 'book', onlyEq: true }), p = profileNeeds();
  let list = rankCatalog({ ...p, equipment: f.onlyEq ? p.equipment : null });
  if (f.sport) list = list.filter((r) => (f.sport === 'climbing' ? r.entry.activity.startsWith('climbing') : r.entry.activity === f.sport));
  if (f.goal) list = list.filter((r) => r.entry.goals.includes(f.goal));
  if (f.time) list = list.filter((r) => (f.time === 's' ? r.entry.minutes <= 20 : f.time === 'm' ? r.entry.minutes > 20 && r.entry.minutes <= 40 : r.entry.minutes > 40));
  if (f.level !== '' && f.level != null) list = list.filter((r) => String(r.entry.level) === String(f.level));
  if (f.onlyEq) list = list.filter((r) => !r.missing.length);
  const sports = [['', 'Tous'], ['climbing', '🧗 Escalade'], ['calisthenics', '🤸 Calisthenics'], ['running', '🏃 Course'], ['strength', '🏋️ Muscu'], ['conditioning', '💪 Renfo'], ['swimming', '🏊 Natation']];
  const view = ['book', 'focus', 'rank'].includes(f.view) ? f.view : 'book', book = view === 'book';
  if (view === 'focus' && f.focus) list = list.filter((r) => { const [k, id] = f.focus.split(':'), fo = focusOf(r.entry); return (k === 'm' ? fo.muscles : fo.skills).includes(id); });
  return h`${seg('catView', view, [['book', '📖 Par sport et niveau'], ['focus', '🎯 Par muscle ou compétence'], ['rank', '✨ Pour toi d’abord']])}
    ${view === 'focus' ? focusPicker() : ''}
    <div class="card catf"><div class="chips">${sports.map(([k, l]) => chip(f.sport === k, l, `data-act="catF" data-k="sport" data-v="${k}"`))}</div>
      <div class="chips">${[['', 'Tous niveaux'], ['0', '🌱 Débutant'], ['1', '🌿 Intermédiaire'], ['2', '🌳 Avancé']].map(([k, l]) => chip(String(f.level ?? '') === k, l, `data-act="catF" data-k="level" data-v="${k}"`))}</div>
      <div class="chips">${chip(!f.goal, 'Tous objectifs', 'data-act="catF" data-k="goal" data-v=""')}${Object.entries(GOAL_L).map(([k, l]) => chip(f.goal === k, l, `data-act="catF" data-k="goal" data-v="${k}"`))}</div>
      <div class="chips">${[['', 'Toutes durées'], ['s', '≤ 20 min'], ['m', '20–40 min'], ['l', '> 40 min']].map(([k, l]) => chip(f.time === k, l, `data-act="catF" data-k="time" data-v="${k}"`))}${chip(f.onlyEq, '🧰 Faisable avec mon matériel', 'data-act="catEq"')}</div></div>
    <p class="tiny muted">${book ? 'Le carnet : des séances toutes prêtes pour chaque sport, du niveau débutant à avancé. Touche une séance pour voir ses exercices, puis lance-la ou garde-la.' : view === 'focus' ? 'Les séances qui travaillent le muscle ou la compétence choisi, du niveau débutant à avancé, tous sports confondus.' : 'Triées pour toi : ton sport, tes objectifs, tes points faibles et ton niveau.'} Chaque séance cite ses sources.</p>
    ${view === 'focus' ? (f.focus ? focusList(list) : h`<p class="small muted">Choisis un muscle ou une compétence ci-dessus : toutes les séances qui le travaillent s’affichent, du niveau débutant à avancé.</p>`) : book ? bookView(list) : list.length ? list.map((r, i) => h`<button class="card pick catcard" data-act="catOpen" data-id="${r.entry.id}"><div class="row"><span class="catemoji">${r.entry.emoji}</span><div class="grow"><b>${r.entry.name}</b>
        <div class="tiny muted">${ACTIVITIES[r.entry.activity]?.label || r.entry.activity} · ${r.entry.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][r.entry.level]}</div></div>${i < 3 && r.why.length ? h`<span class="tag acc">pour toi</span>` : ''}</div>
        <p class="small">${r.entry.why}</p>${r.why.length ? h`<div class="tiny acc-t">✓ ${r.why.join(' · ')}</div>` : ''}</button>`) : h`<p class="small muted">Aucune séance avec ces filtres${f.onlyEq ? ' et ton matériel' : ''}.</p>`}`;
}
const LEVEL_W = [['🌱', 'Débutant', 'pour commencer ou reprendre'], ['🌿', 'Intermédiaire', 'tu t’entraînes régulièrement'], ['🌳', 'Avancé', 'plusieurs années de pratique']];
const SPORT_ORDER = ['climbing_boulder', 'climbing_route', 'calisthenics', 'conditioning', 'strength', 'running', 'swimming'];
/** Carnet : sport → niveau → séances (lignes compactes). */
function bookView(list) {
  if (!list.length) return h`<p class="small muted">Aucune séance avec ces filtres${S.catF.onlyEq ? ' et ton matériel (touche « 🧰 Faisable avec mon matériel » pour tout voir)' : ''}.</p>`;
  const acts = [...new Set(list.map((r) => r.entry.activity))].sort((a, b) => (SPORT_ORDER.indexOf(a) + 99) % 99 - (SPORT_ORDER.indexOf(b) + 99) % 99);
  return h`${acts.map((a) => { const of = list.filter((r) => r.entry.activity === a); return h`<section class="card stack"><h3 style="margin:0">${ACTIVITIES[a]?.emoji || ''} ${ACTIVITIES[a]?.label || a}</h3>
    ${[0, 1, 2].map((lv) => { const g = of.filter((r) => r.entry.level === lv); return g.length ? h`<span class="kicker">${LEVEL_W[lv][0]} ${LEVEL_W[lv][1]} <span class="tiny muted">· ${LEVEL_W[lv][2]}</span></span>
      <div class="setmenu">${g.map((r) => h`<button class="setrow" data-act="catOpen" data-id="${r.entry.id}"><span class="sic">${r.entry.emoji}</span><span class="grow"><b>${r.entry.name}</b><small>${r.entry.minutes} min · ${r.entry.why.split(/[.:]/)[0]}</small></span><span class="chev">›</span></button>`)}</div>` : ''; })}</section>`; })}`;
}
/** Muscles et compétences, avec le nombre de séances qui les travaillent (calculé depuis les exercices). */
function focusPicker() {
  const f = S.catF, n = (k, id) => CATALOG.filter((e) => (k === 'm' ? focusOf(e).muscles : focusOf(e).skills).includes(id)).length;
  const row = (k, list) => h`<div class="chips">${list.filter(([id]) => n(k, id)).map(([id, l]) => chip(f.focus === `${k}:${id}`, `${l} · ${n(k, id)}`, `data-act="catFocus" data-id="${k}:${id}"`))}</div>`;
  return h`<div class="card catf"><span class="kicker">Par muscle</span>${row('m', MUSCLE_FOCUS)}<span class="kicker">Par compétence</span>${row('s', COMPETENCES)}
    <p class="tiny muted">Calculé à partir des exercices de chaque séance : une séance n’apparaît que si ce muscle ou cette compétence porte une vraie part du travail.</p></div>`;
}
function focusList(list) {
  if (!list.length) return h`<p class="small muted">Aucune séance avec ces filtres${S.catF.onlyEq ? ' et ton matériel (touche « 🧰 Faisable avec mon matériel » pour tout voir)' : ''}.</p>`;
  return h`${[0, 1, 2].map((lv) => { const g = list.filter((r) => r.entry.level === lv); return g.length ? h`<span class="kicker">${LEVEL_W[lv][0]} ${LEVEL_W[lv][1]} <span class="tiny muted">· ${LEVEL_W[lv][2]}</span></span>
    <div class="setmenu">${g.map((r) => h`<button class="setrow" data-act="catOpen" data-id="${r.entry.id}"><span class="sic">${r.entry.emoji}</span><span class="grow"><b>${r.entry.name}</b><small>${ACTIVITIES[r.entry.activity]?.label || ''} · ${r.entry.minutes} min · ${focusText(r.entry)}</small></span><span class="chev">›</span></button>`)}</div>` : ''; })}`;
}
const focusText = (e) => { const f = focusOf(e); return [...f.muscles.map((id) => MUSCLE_FOCUS.find((x) => x[0] === id)?.[1]), ...f.skills.map((id) => COMPETENCES.find((x) => x[0] === id)?.[1])].filter(Boolean).join(', ').replace(/\p{Extended_Pictographic}️?\s*/gu, ''); };
ACT.catFocus = (el) => { S.catF.focus = S.catF.focus === el.dataset.id ? '' : el.dataset.id; render(); };
ACT.catView = (el) => { S.catF.view = el.dataset.id; render(); };
ACT.catF = (el) => { S.catF[el.dataset.k] = S.catF[el.dataset.k] === el.dataset.v ? '' : el.dataset.v; render(); };
ACT.catEq = () => { S.catF.onlyEq = !S.catF.onlyEq; render(); };
ACT.catOpen = (el) => {
  const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return;
  const s = buildSession(e), p = profileNeeds(), miss = needsOf(e).filter((n) => !p.equipment.has(n));
  openSheet(h`<div class="catd"><div class="row"><span class="catemoji">${e.emoji}</span><div class="grow"><h2>${e.name}</h2><div class="tiny muted">${ACTIVITIES[e.activity]?.label || ''} · ${e.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][e.level]}</div></div></div>
    ${sessionBrief(s, { minutes: e.minutes })}${sourcesLine(e.sources)}
    <b class="small">Ça travaille</b><div class="chips">${e.works.map((c) => h`<span class="chip static">${CAPACITIES[c]?.label || c}</span>`)}</div>
    ${focusText(e) ? h`<p class="tiny muted">🎯 Surtout : ${focusText(e)} (d’après ses exercices)</p>` : ''}
    ${e.tips?.length ? h`<b class="small">Conseils</b><ul class="small">${e.tips.map((t) => h`<li>${t}</li>`)}</ul>` : ''}
    <b class="small">Déroulé</b><ol class="small catex">${s.exercises.map((x, i) => h`<li><button class="linkish" data-act="catExInfo" data-id="${e.id}" data-i="${i}"><b>${x.emoji} ${x.name}</b> ⓘ</button> — ${x.sets > 1 ? `${x.sets} × ` : ''}${x.mode === 'time' ? fmtDur(x.secMax) : `${x.repsMax} rép.`}${x.rest ? ` · repos ${fmtDur(x.rest)}` : ''}</li>`)}</ol>
    ${miss.length ? h`<p class="small warn-t">Matériel à prévoir : ${miss.map((n) => EQUIPMENT[n] || n).join(', ')}</p>` : ''}
    <div class="grid2"><button class="btn pri big" data-act="catPlay" data-id="${e.id}">▶ Lancer</button><button class="btn big" data-act="catSave" data-id="${e.id}">💾 Garder</button></div>${adaptButton(e.id, 'cat', 'btn')}<p class="tiny muted">🔁 Adapter : la même séance pour cette fois, avec ta durée, ton matériel, une zone à ménager ou une autre intensité.</p>${catalogEditButtons(e)}</div>`, { wide: true });
};
ACT.catExInfo = (el) => { const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return; const s = buildSession(e), x = s.exercises[+el.dataset.i]; if (x) openSheet(h`${exerciseSheet(x, h`<button class="btn" data-act="catOpen" data-id="${e.id}">‹ Retour à la séance</button>`, s)}`, { wide: true }); };
ACT.catPlay = (el) => { const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return; closeSheet(); startPlayer(buildSession(e), { fromGenerator: true }); };
ACT.catSave = (el) => { const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return; saveSeance({ ...buildSession(e), id: uid() }); closeSheet(); toast('Ajoutée à Mes séances'); };

/* ───────── Top exercices ───────── */
export function vBest() {
  const p = profileNeeds(), cat = (S.bestCat ||= 'tirer'), r = rankExercises({ need: p.need, level: p.level, equipment: p.equipment, acts: p.acts })[cat] || [];
  return h`${subHead('libSub', 'exercises', 'Exercices', '🏆 Top exercices pour toi')}<p class="tiny muted">Les exercices les plus utiles pour toi dans chaque catégorie : d’après ce que tu veux travailler, ton niveau et ton matériel.</p>
    <div class="chips">${EX_CATEGORIES.map(([k, l]) => chip(cat === k, l, `data-act="bestCat" data-v="${k}"`))}</div>
    ${r.length ? r.map((x, i) => h`<button class="card pick bestrow" data-act="libInfo" data-id="${x.lib.id}"><span class="rank">${i + 1}</span><div class="grow"><b>${x.lib.emoji} ${x.lib.name}</b>
      <div class="tiny muted">${x.hits.length ? `Pour toi : ${x.hits.join(', ')}` : Object.entries(x.lib.caps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => CAPACITIES[c]?.label).join(', ')}${x.missing.length ? ` · matériel : ${x.missing.map((n) => EQUIPMENT[n] || n).join(', ')}` : ''}${x.tooHard ? ' · niveau plus avancé' : ''}</div></div></button>`) : h`<p class="small muted">Aucun exercice pour cette catégorie avec tes sports.</p>`}
    <div class="card flat"><b class="small">Pourquoi le renforcement compte</b><p class="small">${SOURCES.lauersen2014.key}</p>${sourcesLine(['lauersen2014', 'acsm2009'])}</div>`;
}
ACT.bestCat = (el) => { S.bestCat = el.dataset.v; render(); };

/* ───────── Toutes les sources ───────── */
export function vSources() {
  return h`<div class="card"><div class="row between"><h3>📚 Sources citées</h3>${S.user?.isAdmin ? h`<button class="btn sm" data-act="srcEdit" data-id="">＋ Ajouter</button>` : ''}</div><p class="small muted">Les conseils de l’app s’appuient sur ces études et recommandations officielles. Touche une source pour voir ce qu’elle montre.</p>
    <details class="how srclist"><summary>Voir les ${Object.keys(SOURCES).length} sources</summary>${Object.entries(SOURCES).sort((a, b) => b[1].year - a[1].year).map(([id, s]) => h`<div class="row"><button class="item pick grow" data-act="srcOpen" data-id="${id}"><div class="grow"><b class="small">${s.title}</b><div class="tiny muted">${s.authors} · ${s.year} · ${s.journal}</div></div></button>${sourceAdminButtons(id)}</div>`)}</details></div>`;
}
