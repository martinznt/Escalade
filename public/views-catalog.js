// views-catalog.js — Bibliothèque › « Prêtes » (séances sourcées, filtres, tri pour toi), « Top exercices »
// (classement par catégorie, adapté à ton profil) et la liste des sources scientifiques citées.
import { h, raw, chip, openSheet, closeSheet, toast, fmtDur, subHead } from './ui.js';
import { S, ACT, ctx, render, saveSeance, item } from './state.js';
import { uid } from './shared.js';
import { ACTIVITIES, CAPACITIES, EQUIPMENT } from './model.js';
import { availableEquipment, profileCapacities, strengthsWeaknesses, activeGoals, goalCaps } from './brain.js';
import { levelFor } from './generator.js';
import { startPlayer } from './player.js';
import { CATALOG, buildSession, rankCatalog, needsOf, rankExercises, EX_CATEGORIES } from './catalog.js';
import { SOURCES } from './sources.js';
import { sourcesLine } from './srcui.js';
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
  const f = (S.catF ||= { sport: '', goal: '', time: '', onlyEq: true }), p = profileNeeds();
  let list = rankCatalog({ ...p, equipment: f.onlyEq ? p.equipment : null });
  if (f.sport) list = list.filter((r) => (f.sport === 'climbing' ? r.entry.activity.startsWith('climbing') : r.entry.activity === f.sport));
  if (f.goal) list = list.filter((r) => r.entry.goals.includes(f.goal));
  if (f.time) list = list.filter((r) => (f.time === 's' ? r.entry.minutes <= 20 : f.time === 'm' ? r.entry.minutes > 20 && r.entry.minutes <= 40 : r.entry.minutes > 40));
  if (f.onlyEq) list = list.filter((r) => !r.missing.length);
  const sports = [['', 'Tous'], ['climbing', '🧗 Escalade'], ['running', '🏃 Course'], ['strength', '🏋️ Muscu'], ['conditioning', '💪 Renfo'], ['swimming', '🏊 Natation']];
  return h`<div class="card catf"><div class="chips">${sports.map(([k, l]) => chip(f.sport === k, l, `data-act="catF" data-k="sport" data-v="${k}"`))}</div>
      <div class="chips">${chip(!f.goal, 'Tous objectifs', 'data-act="catF" data-k="goal" data-v=""')}${Object.entries(GOAL_L).map(([k, l]) => chip(f.goal === k, l, `data-act="catF" data-k="goal" data-v="${k}"`))}</div>
      <div class="chips">${[['', 'Toutes durées'], ['s', '≤ 20 min'], ['m', '20–40 min'], ['l', '> 40 min']].map(([k, l]) => chip(f.time === k, l, `data-act="catF" data-k="time" data-v="${k}"`))}${chip(f.onlyEq, '🧰 Faisable avec mon matériel', 'data-act="catEq"')}</div></div>
    <p class="tiny muted">Triées pour toi : ton sport, tes objectifs, tes points faibles et ton niveau. Chaque séance cite ses sources.</p>
    ${list.length ? list.map((r, i) => h`<button class="card pick catcard" data-act="catOpen" data-id="${r.entry.id}"><div class="row"><span class="catemoji">${r.entry.emoji}</span><div class="grow"><b>${r.entry.name}</b>
        <div class="tiny muted">${ACTIVITIES[r.entry.activity]?.label || r.entry.activity} · ${r.entry.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][r.entry.level]}</div></div>${i < 3 && r.why.length ? h`<span class="tag acc">pour toi</span>` : ''}</div>
        <p class="small">${r.entry.why}</p>${r.why.length ? h`<div class="tiny acc-t">✓ ${r.why.join(' · ')}</div>` : ''}</button>`) : h`<p class="small muted">Aucune séance avec ces filtres${f.onlyEq ? ' et ton matériel' : ''}.</p>`}`;
}
ACT.catF = (el) => { S.catF[el.dataset.k] = S.catF[el.dataset.k] === el.dataset.v ? '' : el.dataset.v; render(); };
ACT.catEq = () => { S.catF.onlyEq = !S.catF.onlyEq; render(); };
ACT.catOpen = (el) => {
  const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return;
  const s = buildSession(e), p = profileNeeds(), miss = needsOf(e).filter((n) => !p.equipment.has(n));
  openSheet(h`<div class="catd"><div class="row"><span class="catemoji">${e.emoji}</span><div class="grow"><h2>${e.name}</h2><div class="tiny muted">${ACTIVITIES[e.activity]?.label || ''} · ${e.minutes} min · ${['débutant', 'intermédiaire', 'avancé'][e.level]}</div></div></div>
    ${sessionBrief(s, { minutes: e.minutes })}${sourcesLine(e.sources)}
    <b class="small">Ça travaille</b><div class="chips">${e.works.map((c) => h`<span class="chip static">${CAPACITIES[c]?.label || c}</span>`)}</div>
    ${e.tips?.length ? h`<b class="small">Conseils</b><ul class="small">${e.tips.map((t) => h`<li>${t}</li>`)}</ul>` : ''}
    <b class="small">Déroulé</b><ol class="small catex">${s.exercises.map((x, i) => h`<li><button class="linkish" data-act="catExInfo" data-id="${e.id}" data-i="${i}"><b>${x.emoji} ${x.name}</b> ⓘ</button> — ${x.sets > 1 ? `${x.sets} × ` : ''}${x.mode === 'time' ? fmtDur(x.secMax) : `${x.repsMax} rép.`}${x.rest ? ` · repos ${fmtDur(x.rest)}` : ''}</li>`)}</ol>
    ${miss.length ? h`<p class="small warn-t">Matériel à prévoir : ${miss.map((n) => EQUIPMENT[n] || n).join(', ')}</p>` : ''}
    <div class="grid2"><button class="btn pri big" data-act="catPlay" data-id="${e.id}">▶ Lancer</button><button class="btn big" data-act="catSave" data-id="${e.id}">💾 Garder</button></div>${catalogEditButtons(e)}</div>`, { wide: true });
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
