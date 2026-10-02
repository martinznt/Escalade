// views-catalog.js — Bibliothèque › « Prêtes » (séances sourcées, filtres, tri pour toi), « Top exercices »
// (classement par catégorie, adapté à ton profil) et la liste des sources scientifiques citées.
import { h, raw, chip, openSheet, closeSheet, toast, fmtDur, subHead, seg, ask } from './ui.js';
import { S, ACT, ctx, render, saveSeance, item, putItem, go } from './state.js';
import { buildProgram, DAY_NAMES, defaultDays, ymd } from './program.js';
import { activeProgram } from './views-program.js';
import { sessionMinutes } from './engine.js';
import { uid } from './shared.js';
import { ACTIVITIES, CAPACITIES, EQUIPMENT } from './model.js';
import { availableEquipment, profileCapacities, strengthsWeaknesses, activeGoals, goalCaps } from './brain.js';
import { levelFor } from './generator.js';
import { startPlayer } from './player.js';
import { CATALOG, focusOf, COMPETENCES, MUSCLE_FOCUS, buildSession, rankCatalog, needsOf, rankExercises, EX_CATEGORIES } from './catalog.js';
import { SOURCES } from './sources.js';
import { sourcesLine } from './srcui.js';
import { adaptButton } from './views-adapt.js';
import { groupButton } from './views-group.js';
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
const SPORTS_F = [['', 'Tous'], ['climbing', '🧗 Escalade'], ['calisthenics', '🤸 Calisthenics'], ['running', '🏃 Course'], ['strength', '🏋️ Muscu'], ['conditioning', '💪 Renfo'], ['swimming', '🏊 Natation']];
const LEVELS_F = [['', 'Tous niveaux'], ['0', '🌱 Débutant'], ['1', '🌿 Intermédiaire'], ['2', '🌳 Avancé']];
const TIMES_F = [['', 'Toutes durées'], ['s', '≤ 20 min'], ['m', '20–40 min'], ['l', '> 40 min']];
const MINE_F = [['', 'Toutes'], ['fav', '⭐ Mes favoris'], ['done', '✅ Déjà faites'], ['new', '🆕 Jamais essayées']];
/** Une règle par filtre : la séance (classée) le passe-t-elle ? Un filtre vide laisse tout passer. */
const RULES = {
  sport: (r, v) => !v || (v === 'climbing' ? r.entry.activity.startsWith('climbing') : r.entry.activity === v),
  goal: (r, v) => !v || r.entry.goals.includes(v),
  time: (r, v) => !v || (v === 's' ? r.entry.minutes <= 20 : v === 'm' ? r.entry.minutes > 20 && r.entry.minutes <= 40 : r.entry.minutes > 40),
  level: (r, v) => v === '' || v == null || String(r.entry.level) === String(v),
  onlyEq: (r, v) => !v || !r.missing.length,
  noEq: (r, v) => !v || !needsOf(r.entry).length,
  mine: (r, v, m) => !v || (v === 'fav' ? m.favs.has(r.entry.id) : v === 'done' ? m.done.has(r.entry.id) : !m.done.has(r.entry.id)),
};
/** Les séances qui passent les filtres ; `skip` = filtres ignorés (pour proposer « sans ce filtre → N séances »). */
function catFiltered(f, p, skip = []) {
  const m = { favs: catFavs(), done: catDone() };
  return rankCatalog({ ...p, equipment: p.equipment }).filter((r) => Object.keys(RULES).every((k) => skip.includes(k) || RULES[k](r, f[k], m)));
}
/** Filtres actifs, chacun avec son libellé (pour le résumé et l'aide quand rien ne correspond). */
function activeFilters(f) {
  const lab = (opts, v) => opts.find(([k]) => k === String(v ?? ''))?.[1];
  return [f.sport && ['sport', lab(SPORTS_F, f.sport)], f.level !== '' && f.level != null && ['level', lab(LEVELS_F, f.level)], f.goal && ['goal', GOAL_L[f.goal] || f.goal],
    f.time && ['time', lab(TIMES_F, f.time)], f.onlyEq && ['onlyEq', '🧰 Mon matériel'], f.noEq && ['noEq', '🙌 Sans matériel'], f.mine && ['mine', lab(MINE_F, f.mine)]].filter(Boolean);
}
/** Rien ne correspond : quel filtre retirer pour retrouver des séances (et combien). */
function emptyHelp(f, p) {
  const act = activeFilters(f), m = { favs: catFavs(), done: catDone() };
  let tries = act.map(([k, l]) => ({ keys: [k], l: `Sans « ${l} »`, n: catFiltered(f, p, [k]).length })).filter((x) => x.n);
  if (!tries.length) for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) { const n = catFiltered(f, p, [act[i][0], act[j][0]]).length; if (n) tries.push({ keys: [act[i][0], act[j][0]], l: `Sans « ${act[i][1]} » ni « ${act[j][1]} »`, n }); }
  tries = tries.sort((a, b) => b.n - a.n).slice(0, 4);
  // Les plus proches : celles qui cochent le plus de tes filtres (le sport compte double).
  const near = catFiltered({}, p).map((r) => ({ r, hit: act.reduce((t, [k]) => t + (RULES[k](r, f[k], m) ? (k === 'sport' ? 2 : 1) : 0), 0) })).sort((a, b) => b.hit - a.hit || b.r.score - a.r.score).slice(0, 3);
  return h`<div class="card flat"><p class="small"><b>Aucune séance ne coche tous ces filtres.</b> ${tries.length ? 'Retire un ou deux filtres pour en voir :' : 'Essaie avec moins de filtres.'}</p>
    ${tries.length ? h`<div class="setmenu">${tries.map((x) => h`<button class="setrow" data-act="catDrop" data-k="${x.keys.join(',')}"><span class="sic">✕</span><span class="grow"><b>${x.l}</b><small>${x.n} séance${x.n > 1 ? 's' : ''}</small></span><span class="chev">›</span></button>`)}</div>` : ''}
    <button class="btn sm" data-act="catClear">Effacer tous les filtres</button></div>
    ${near.length ? h`<span class="kicker">Les plus proches de ta recherche</span>${near.map(({ r }) => h`<button class="card pick catcard" data-act="catOpen" data-id="${r.entry.id}"><div class="row"><span class="catemoji">${r.entry.emoji}</span><div class="grow"><b>${r.entry.name}</b><div class="tiny muted">${ACTIVITIES[r.entry.activity]?.label || r.entry.activity} · ${r.entry.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][r.entry.level]}</div></div></div></button>`)}` : ''}`;
}
export function vCatalog() {
  const f = (S.catF ||= { sport: '', goal: '', time: '', level: '', view: 'book', onlyEq: true }), p = profileNeeds();
  let list = catFiltered(f, p);
  const view = ['book', 'focus', 'rank'].includes(f.view) ? f.view : 'book', book = view === 'book';
  if (view === 'focus' && f.focus) list = list.filter((r) => { const [k, id] = f.focus.split(':'), fo = focusOf(r.entry); return (k === 'm' ? fo.muscles : fo.skills).includes(id); });
  const act = activeFilters(f), open = S.catFOpen ?? !act.some(([k]) => k !== 'onlyEq');
  const row = (k, opts) => h`<div class="chips">${opts.map(([v, l]) => chip(String(f[k] ?? '') === v, l, `data-act="catF" data-k="${k}" data-v="${v}"`))}</div>`;
  const panel = h`<div class="card catf">
      <div class="row between wrapf"><button class="linkish" data-act="catFToggle" aria-expanded="${!!open}"><b>🔎 Filtres</b> <span class="tiny muted">${list.length} séance${list.length > 1 ? 's' : ''}</span> ${open ? '▴' : '▾'}</button>${act.length ? h`<button class="btn sm ghost" data-act="catClear">Tout effacer</button>` : ''}</div>
      ${act.length && !open ? h`<div class="chips">${act.map(([k, l]) => h`<button type="button" class="chip on" data-act="catDrop" data-k="${k}" aria-label="Retirer le filtre ${l}">${l} ✕</button>`)}</div>` : ''}
      ${open ? h`<span class="kicker">Sport</span>${row('sport', SPORTS_F)}<span class="kicker">Niveau</span>${row('level', LEVELS_F)}
        <span class="kicker">Objectif</span><div class="chips">${chip(!f.goal, 'Tous objectifs', 'data-act="catF" data-k="goal" data-v=""')}${Object.entries(GOAL_L).map(([k, l]) => chip(f.goal === k, l, `data-act="catF" data-k="goal" data-v="${k}"`))}</div>
        <span class="kicker">Durée et matériel</span>${row('time', TIMES_F)}<div class="chips">${chip(f.onlyEq, '🧰 Faisable avec mon matériel', 'data-act="catEq"')}${chip(!!f.noEq, '🙌 Sans matériel', 'data-act="catNoEq"')}</div>
        <span class="kicker">Mes séances</span>${row('mine', MINE_F)}<button class="btn sm pri" data-act="catFToggle">Voir les ${list.length} séance${list.length > 1 ? 's' : ''}</button>` : ''}</div>`;
  const empty = !list.length && (view !== 'focus' || f.focus);
  return h`${seg('catView', view, [['book', '📖 Par sport et niveau'], ['focus', '🎯 Par muscle ou compétence'], ['rank', '✨ Pour toi d’abord']])}
    ${view === 'focus' ? focusPicker() : ''}
    ${panel}
    <p class="tiny muted">${book ? 'Le carnet : des séances toutes prêtes pour chaque sport, du niveau débutant à avancé. Touche une séance pour voir ses exercices, puis lance-la ou garde-la.' : view === 'focus' ? 'Les séances qui travaillent le muscle ou la compétence choisi, du niveau débutant à avancé, tous sports confondus.' : 'Triées pour toi : ton sport, tes objectifs, tes points faibles et ton niveau.'} Chaque séance cite ses sources.</p>
    ${empty ? emptyHelp(f, p) : view === 'focus' ? (f.focus ? focusList(list) : h`<p class="small muted">Choisis un muscle ou une compétence ci-dessus : toutes les séances qui le travaillent s’affichent, du niveau débutant à avancé.</p>`) : book ? bookView(list) : list.map((r, i) => h`<button class="card pick catcard" data-act="catOpen" data-id="${r.entry.id}"><div class="row"><span class="catemoji">${r.entry.emoji}</span><div class="grow"><b>${r.entry.name}</b>
        <div class="tiny muted">${ACTIVITIES[r.entry.activity]?.label || r.entry.activity} · ${r.entry.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][r.entry.level]}</div></div>${i < 3 && r.why.length ? h`<span class="tag acc">pour toi</span>` : ''}</div>
        <p class="small">${r.entry.why}</p>${r.why.length ? h`<div class="tiny acc-t">✓ ${r.why.join(' · ')}</div>` : ''}</button>`)}`;
}
ACT.catFToggle = () => { const act = activeFilters(S.catF || {}); S.catFOpen = !(S.catFOpen ?? !act.some(([k]) => k !== 'onlyEq')); render(); };
ACT.catDrop = (el) => { const f = S.catF; if (!f) return; for (const k of String(el.dataset.k).split(',')) { if (k === 'onlyEq' || k === 'noEq') f[k] = false; else if (k in f || ['sport', 'goal', 'time', 'level', 'mine'].includes(k)) f[k] = ''; } render(); };
ACT.catClear = () => { Object.assign(S.catF, { sport: '', goal: '', time: '', level: '', onlyEq: false, noEq: false, mine: '' }); render(); };
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
ACT.catF = (el) => { S.catFOpen = true; S.catF[el.dataset.k] = S.catF[el.dataset.k] === el.dataset.v ? '' : el.dataset.v; render(); };
ACT.catEq = () => { S.catFOpen = true; S.catF.onlyEq = !S.catF.onlyEq; render(); };
ACT.catNoEq = () => { S.catFOpen = true; S.catF.noEq = !S.catF.noEq; render(); };
/** Favoris (gardés avec ton compte) et séances du carnet déjà faites (d'après ton journal). */
const catFavs = () => new Set(item('config', 'catalog')?.favs || []);
function catDone() {
  const by = new Map(CATALOG.map((e) => [e.name, e.id])), out = new Map();
  for (const x of ctx().history) { const id = String(x.sessionId || '').startsWith('cat-') ? x.sessionId.slice(4) : by.get(x.sessionName); if (id) { const o = out.get(id) || { n: 0, last: 0 }; o.n++; o.last = Math.max(o.last, x.startedAt); out.set(id, o); } }
  return out;
}
ACT.catFav = (el) => {
  const id = el.dataset.id, favs = catFavs();
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  putItem('config', 'catalog', { ...(item('config', 'catalog') || {}), favs: [...favs].slice(-300) });
  toast(favs.has(id) ? '⭐ Ajoutée à tes favoris' : 'Retirée de tes favoris'); ACT.catOpen(el); render();
};
ACT.catOpen = (el) => {
  const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return;
  const s = buildSession(e), p = profileNeeds(), miss = needsOf(e).filter((n) => !p.equipment.has(n));
  openSheet(h`<div class="catd"><div class="row"><span class="catemoji">${e.emoji}</span><div class="grow"><h2>${e.name}</h2><div class="tiny muted">${ACTIVITIES[e.activity]?.label || ''} · ${e.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][e.level]}</div></div></div>
    ${(() => { const d = catDone().get(e.id), fav = catFavs().has(e.id); return h`<div class="row wrapf"><button class="btn sm" data-act="catFav" data-id="${e.id}" aria-pressed="${fav}">${fav ? '★ Dans mes favoris' : '☆ Mettre en favori'}</button><span class="tiny muted">${d ? `✅ Faite ${d.n} fois, la dernière ${new Date(d.last).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : '🆕 Jamais essayée'}</span></div>`; })()}
    ${sessionBrief(s, { minutes: e.minutes })}${sourcesLine(e.sources)}
    <b class="small">Ça travaille</b><div class="chips">${e.works.map((c) => h`<span class="chip static">${CAPACITIES[c]?.label || c}</span>`)}</div>
    ${focusText(e) ? h`<p class="tiny muted">🎯 Surtout : ${focusText(e)} (d’après ses exercices)</p>` : ''}
    ${e.tips?.length ? h`<b class="small">Conseils</b><ul class="small">${e.tips.map((t) => h`<li>${t}</li>`)}</ul>` : ''}
    <b class="small">Déroulé</b><ol class="small catex">${s.exercises.map((x, i) => h`<li><button class="linkish" data-act="catExInfo" data-id="${e.id}" data-i="${i}"><b>${x.emoji} ${x.name}</b> ⓘ</button> — ${x.sets > 1 ? `${x.sets} × ` : ''}${x.mode === 'time' ? fmtDur(x.secMax) : `${x.repsMax} rép.`}${x.rest ? ` · repos ${fmtDur(x.rest)}` : ''}</li>`)}</ol>
    ${miss.length ? h`<p class="small warn-t">Matériel à prévoir : ${miss.map((n) => EQUIPMENT[n] || n).join(', ')}</p>` : ''}
    <div class="grid2"><button class="btn pri big" data-act="catPlay" data-id="${e.id}">▶ Lancer</button><button class="btn big" data-act="catSave" data-id="${e.id}">💾 Garder</button></div><div class="grid2">${adaptButton(e.id, 'cat', 'btn')}${groupButton(e.id, 'cat', 'btn')}</div><button class="btn" data-act="catProgram" data-id="${e.id}">📆 En faire un programme</button><p class="tiny muted">🔁 Adapter : la même séance pour cette fois, avec ta durée, ton matériel, une zone à ménager ou une autre intensité. 📆 Programme : cette séance 2 à 3 fois par semaine pendant 4 à 8 semaines, les charges progressent toutes seules.</p>${catalogEditButtons(e)}</div>`, { wide: true });
};
ACT.catExInfo = (el) => { const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return; const s = buildSession(e), x = s.exercises[+el.dataset.i]; if (x) openSheet(h`${exerciseSheet(x, h`<button class="btn" data-act="catOpen" data-id="${e.id}">‹ Retour à la séance</button>`, s)}`, { wide: true }); };
/** 8.30 : une séance du carnet devient un programme (mêmes exercices ; charges qui progressent ; semaine légère toutes les 4). */
ACT.catProgram = (el) => {
  const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return;
  const per = Math.max(1, Math.min(4, Number(item('config', 'main')?.perWeek) || 2));
  S.cprog = { id: e.id, weeks: 6, days: defaultDays(Math.min(3, per)) };
  cprogSheet();
};
function cprogSheet() {
  const w = S.cprog, e = CATALOG.find((x) => x.id === w.id); if (!e) return;
  const s = buildSession(e), plan = buildProgram({ goal: 'forme', weeks: w.weeks, days: w.days, minutes: Math.max(10, Math.round(sessionMinutes(s))), start: ymd(new Date()) });
  openSheet(h`<div class="stack"><h2 style="margin:0">📆 Programme : ${e.emoji || ''} ${e.name}</h2>
    <p class="tiny muted">La même séance, 2 à 3 fois par semaine. À chaque fois, l’app propose la charge ou les répétitions d’après tes 2 dernières séances (on monte quand tout est réussi, on baisse un peu après 2 échecs). Une semaine sur 4 est plus légère.</p>
    <span class="small"><b>Combien de semaines ?</b></span><div class="chips">${[4, 6, 8].map((n) => chip(w.weeks === n, `${n} semaines`, `data-act="cprogSet" data-k="weeks" data-v="${n}"`))}</div>
    <span class="small"><b>Quels jours ?</b></span><div class="chips days">${DAY_NAMES.map((d, i) => chip(w.days.includes(i), d, `data-act="cprogDay" data-v="${i}"`))}</div>
    <div class="card flat"><b>${plan.sessions.length} séances</b> · jusqu’au ${new Date(plan.sessions.at(-1).date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${w.days.length > 3 ? h`<p class="tiny warn-t">Plus de 3 fois par semaine la même séance : garde au moins un jour de repos entre deux.</p>` : ''}</div>
    <button class="btn pri big" data-act="cprogSave">Créer le programme</button></div>`, { wide: true });
}
ACT.cprogSet = (el) => { S.cprog[el.dataset.k] = Number(el.dataset.v); cprogSheet(); };
ACT.cprogDay = (el) => { const d = Number(el.dataset.v), x = new Set(S.cprog.days); if (x.has(d)) { if (x.size > 1) x.delete(d); } else x.add(d); S.cprog.days = [...x].sort(); cprogSheet(); };
ACT.cprogSave = async () => {
  const w = S.cprog, e = CATALOG.find((x) => x.id === w?.id); if (!e) return;
  const s = buildSession(e), old = activeProgram();
  if (old && !(await ask('Remplacer ton programme en cours ?', { ok: 'Remplacer', detail: 'L’ancien est archivé, tes séances faites restent dans ton historique.' }))) return;
  if (old) putItem('program', old.id, { ...old, status: 'stopped' });
  const plan = buildProgram({ goal: 'forme', weeks: w.weeks, days: w.days, minutes: Math.max(10, Math.round(sessionMinutes(s))), start: ymd(new Date()), activityId: s.activity || '', name: `${e.name} · ${w.weeks} semaines` });
  putItem('program', 'pg-' + uid().slice(0, 14), { ...plan, catalogId: e.id }); closeSheet(); go('home', 'cal'); render();
  toast(`Programme créé : ${plan.sessions.length} séances.`, 4000);
};
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
