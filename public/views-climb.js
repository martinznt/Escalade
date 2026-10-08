// views-climb.js — le carnet d'escalade : ajout rapide d'un bloc / d'une voie, pyramide de cotations, projets
// (essais, photo avec les prises dessinées au doigt, réussite fêtée), test de doigts mensuel, journal.
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, fmtDay, relDate, buzzOk, mmss, ymd } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, ctx, render, putItem, delItem, item, itemsOf, go } from './state.js';
import { setReturn } from './nav.js';
import { uid } from './shared.js';
import { sortedLevels, gradeSnapshot, REFERENCE } from './grading.js';
import { pyramid, projectStats, addTries, fingerTest, SENT, RESULT_WORD } from './climb.js';
import { celebrate } from './fx.js';
import { startTimer } from './timer.js';
import { sourcesLine } from './srcui.js';
import { FALL_WHY, fallTraining } from './sports.js';
import { addField, onChoice } from './views-choices.js';
import { climbTools } from './views-sports.js';
import { openWizard } from './views-climbplan.js';

const C = () => (S.carnet ||= { kind: 'bloc', period: 'year', hold: 'main' });
const PERIODS = [['3m', '3 mois', 90], ['year', '1 an', 365], ['all', 'Tout', 0]];
const HOLD = { main: ['Main', '#f5b642'], pied: ['Pied', '#5fa8d3'], depart: ['Départ', '#5cb87a'], top: ['Top', '#ef6f5e'], chute: ['Là où je tombe', '#c084fc'] };
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

/** Système de cotation proposé pour un type (le dernier utilisé, sinon la référence). */
function sysFor(kind) {
  const c = ctx(), last = c.ascents.find((a) => a.kind === kind && c.systems[a.grade?.systemId])?.grade?.systemId;
  return c.systems[S.aq?.kind === kind && S.aq?.systemId ? S.aq.systemId : last || REFERENCE[kind]] || c.systems[REFERENCE[kind]] || Object.values(c.systems)[0];
}
const gradeChips = (sys, levelId, act) => h`<div class="chips grades">${sortedLevels(sys).map((l) => h`<button type="button" class="chip ${l.id === levelId ? 'on' : ''}" data-act="${act}" data-v="${l.id}" ${l.color ? raw(`style="--lc:${esc(l.color)}"`) : ''}>${l.label}</button>`)}</div>`;

export function vCarnet() {
  const c = ctx();
  const nProj = itemsOf('project').filter((p) => p.status === 'active' && !p.board).length;
  return h`<section class="card carnet-hero"><h2>🧗 Mon carnet</h2>
      <div class="grid2"><button class="btn pri big" data-act="ascQuick">＋ Bloc ou voie</button><button class="btn big" data-act="projNew">📌 Nouveau projet</button></div></section>
    <div class="setmenu">${[['goProjects', '', '📌', 'Mes projets', nProj ? `${nProj} en cours · rangés avec tes objectifs` : 'Rangés avec tes objectifs'], ['allGo', 'profile/perfs', '🏆', 'Pyramide, maxima et test de doigts', 'Dans Records et mesures']].map(([act, to, ic, t, d]) => h`<button class="setrow" data-act="${act}" ${to ? raw(`data-to="${to}"`) : ''}><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span><span class="chev">›</span></button>`)}</div>
    ${climbTools()}
    <section class="card"><div class="row between wrapf"><h3>Mes blocs et voies</h3><button class="btn sm ghost" data-act="jOpenClimb">Tout le journal ›</button></div>
      ${c.ascents.length ? h`${c.ascents.slice(0, 6).map(ascRow)}${c.ascents.length > 6 ? h`<details class="how mini"><summary>Tout voir (${c.ascents.length})</summary>${c.ascents.slice(6, 200).map(ascRow)}</details>` : ''}` : h`<p class="small muted">Rien pour l’instant.</p>`}</section>
    `;
}
function trend(ft) {
  const list = ft.last?.metricId === 'suspension_lestee' ? ft.load : ft.time; if (list.length < 2) return '';
  const d = Math.round((list.at(-1).value - list.at(-2).value) * 10) / 10, u = ft.last.metricId === 'suspension_lestee' ? 'kg' : 's';
  return d > 0 ? h` <span class="ok-t">+${d} ${u} depuis le test précédent</span>` : d < 0 ? h` <span class="muted">(${d} ${u})</span>` : h` <span class="muted">(stable)</span>`;
}
/** Où : « Salle » ou « Falaise › secteur » (les anciennes saisies n'ont que le nom). */
const ascWhere = (a) => { const e = a.context?.env && ctx().envs.find((x) => x.id === a.context.env), p = a.context?.place || ''; return [e?.name, p && p !== e?.name ? p : ''].filter(Boolean).join(' › '); };
const ascRow = (a) => h`<div class="item"><span class="gpill" ${a.grade?.color ? raw(`style="--lc:${esc(a.grade.color)}"`) : ''}>${a.grade?.label || a.gradeText || '?'}</span><button class="grow rowbtn" data-act="ascEdit" data-id="${a.id}" aria-label="Modifier cette entrée"><b>${a.name || (a.kind === 'voie' ? 'Voie' : 'Bloc')}</b><div class="tiny muted">${RESULT_WORD[a.result] || a.result}${a.nuance ? ` · ${a.nuance}` : ''}${a.attempts > 1 ? ` · ${a.attempts} essais` : ''}${ascWhere(a) ? ` · ${ascWhere(a)}` : ''} · ${fmtDay(a.date)}</div>${a.note ? h`<div class="tiny muted">« ${a.note} »</div>` : ''}</button><button class="btn ghost sm ic" data-act="ascDel" data-id="${a.id}" aria-label="Supprimer">✕</button></div>`;
function projRow(p) {
  const s = projectStats(p), ph = p.hasPhoto ? item('photo', p.id) : null;
  return h`<div class="proj card"><button class="proj-thumb" data-act="projOpen" data-id="${p.id}" aria-label="Ouvrir le projet">${ph?.data ? raw(`<img src="${esc(ph.data)}" alt="">`) : p.kind === 'voie' ? '🧗' : '🪨'}</button>
    <div class="grow"><b>${p.name || 'Projet'}</b> <span class="gpill sm">${p.grade?.label || p.gradeText || ''}</span><div class="tiny muted">${s.attempts} essai${s.attempts > 1 ? 's' : ''} · ${s.sessions} séance${s.sessions > 1 ? 's' : ''}${s.days ? ` · depuis ${s.days} j` : ''}</div></div>
    <div class="proj-act"><button class="btn sm" data-act="projTry" data-id="${p.id}">＋1 essai</button><button class="btn sm pri" data-act="projDone" data-id="${p.id}">✓ Réussi</button></div></div>`;
}
/** Pyramide de cotations (dans Records et mesures). */
export function pyramidCard() {
  const c = ctx(), st = C(), days = PERIODS.find((p) => p[0] === st.period)?.[2] || 0;
  const py = pyramid(c.ascents, { kind: st.kind, since: days ? Date.now() - days * 86400000 : 0 });
  return h`<section class="card"><div class="row between"><h3>Ma pyramide</h3>${seg('carnetKind', st.kind, [['bloc', 'Bloc'], ['voie', 'Voie']])}</div>
      ${seg('carnetPeriod', st.period, PERIODS.map(([k, l]) => [k, l]))}
      ${py.rows.length ? h`<div class="pyr">${py.rows.map((r) => h`<div class="pyr-row"><span class="pyr-g" ${r.color ? raw(`style="--lc:${esc(r.color)}"`) : ''}>${r.label}</span>
          <div class="pyr-bar"><i class="f" style="width:${Math.round((r.flash / Math.max(1, r.total)) * r.pct * 100)}%"></i><i class="s" style="width:${Math.round((r.send / Math.max(1, r.total)) * r.pct * 100)}%"></i></div><b>${r.total}</b></div>`)}</div>
        <p class="tiny muted"><span class="dot f"></span> flash <span class="dot s"></span> réussi · ${py.total} réussite${py.total > 1 ? 's' : ''} en ${py.systemName}</p>`
      : h`<p class="small muted">Note tes réussites en ${st.kind === 'bloc' ? 'bloc' : 'voie'} : ta pyramide se construit toute seule.</p>`}</section>`;
}
/** Projets d'escalade : rangés avec les objectifs (ce sont des objectifs « réussir ce bloc / cette voie »). */
export function projectsSection(status = 'active') {
  const list = itemsOf('project').filter((p) => p.status === status && !p.board).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (!list.length) return '';
  return h`<span class="kicker">🧗 Projets d’escalade</span>${list.map(projRow)}`;
}
/** Projets réussis, pour la liste des objectifs réussis. */
export const doneProjects = () => itemsOf('project').filter((p) => p.status === 'done' && !p.board);
/** Test de doigts : avec les mesures (il enregistre des mesures). */
export function fingerCard() {
  const ft = fingerTest(ctx().perfs);
  return h`<section class="card"><h3>✋ Test de doigts</h3>
      ${ft.last ? h`<p class="small">Dernier test ${relDate(ft.last.date)} : <b>${ft.last.metricId === 'suspension_lestee' ? `10 s avec ${ft.last.value} kg` : `${ft.last.value} s sur 20 mm`}</b>${trend(ft)}</p>` : h`<p class="small muted">Un petit test par mois pour voir tes doigts progresser. Poutre, réglette de 20 mm, bien échauffé.</p>`}
      ${ft.due && ft.last ? h`<p class="small acc-t">C’est le moment de refaire le test.</p>` : ''}
      <div class="row wrapf"><button class="btn" data-act="fingerTime">⏱ Temps max sur 20 mm</button><button class="btn" data-act="fingerLoad">🏋️ 10 s avec lest</button></div></section>`;
}
ACT.jOpenClimb = () => { S.jf = 'ascent'; S.jMax = 60; go('progress', 'journal'); };
ACT.goProjects = () => { S.filters.goals = 'active'; go('profile', 'goals'); };
ACT.carnetKind = (el) => { C().kind = el.dataset.id; render(); };
ACT.carnetPeriod = (el) => { C().period = el.dataset.id; render(); };

/* ───────── Ajout rapide ───────── */
const gyms = () => ctx().envs.filter((e) => ['escalade', 'exterieur', 'falaise'].includes(e.type) && !e.archived);
const whereOf = (e) => (e && ['falaise', 'exterieur'].includes(e.type) ? 'falaise' : 'salle');
const NUANCE = [['facile', '😌 facile'], ['moyen', '🙂 moyen'], ['dur', '😤 dur']];
function aqBody() {
  const q = S.aq, c = ctx(), sys = c.systems[q.systemId] || sysFor(q.kind), gl = gyms(), lv = sortedLevels(sys).find((l) => l.id === q.levelId);
  const styles = Object.values(c.styles).filter((x) => !x.archived && (!x.activity || /climb|escalade/.test(x.activity)));
  const results = [['onsight', '👀 À vue'], ['flash', '⚡ Flash'], ['send', '✓ Réussi'], ['work', '💪 Après travail'], ['attempt', '… Pas encore']];
  return h`<div class="aq"><h2>${q.id ? 'Modifier ce bloc / cette voie' : 'Bloc ou voie'}</h2>${seg('aqKind', q.kind, [['bloc', '🪨 Bloc'], ['voie', '🧗 Voie']])}
    <label>Où ?</label><div class="chips">${[['salle', '🏢 En salle'], ['falaise', '🌄 En falaise']].map(([k, l]) => chip(q.where === k, l, `data-act="aqWhere" data-v="${k}"`))}</div>
    ${q.where ? (() => { const list = gl.filter((e) => whereOf(e) === q.where), cur = c.envs.find((e) => e.id === q.env);
      return h`<div class="chips">${list.map((e) => chip(q.env === e.id, e.name, `data-act="aqEnv" data-v="${e.id}"`))}<button type="button" class="chip add" data-act="aqNewPlace" data-v="${q.where}">＋ ${q.where === 'falaise' ? 'Ajouter une falaise' : 'Ajouter une salle'}</button></div>
        ${cur && whereOf(cur) === 'falaise' ? h`<label>Secteur</label><div class="chips">${(cur.sectors || []).map((x) => chip(q.sector === x, x, `data-act="aqSector" data-v="${x}"`))}</div><input id="aq-sector" maxlength="60" value="${(cur.sectors || []).includes(q.sector) ? '' : q.sector || ''}" placeholder="Autre secteur (il sera ajouté à la falaise)">` : ''}`; })() : ''}
    <label>Niveau <span class="tiny muted">(${sys?.name || ''})</span></label>${gradeChips(sys, q.levelId, 'aqGrade')}
    ${lv ? h`<label>Pour un ${lv.label}, c’était…</label><div class="chips">${NUANCE.map(([k, l]) => chip(q.nuance === k, l, `data-act="aqNuance" data-v="${k}"`))}</div>` : ''}
    <label>Style <span class="tiny muted">(plusieurs choix)</span></label><div class="chips">${styles.sort((a, b) => a.label.localeCompare(b.label, 'fr')).map((st) => chip((q.styles || []).includes(st.id), st.label, `data-act="aqStyle" data-v="${st.id}"`))}<input class="chipin" data-change="styleQuick" data-target="aq" maxlength="40" placeholder="＋ Autre style" aria-label="Ajouter un style"></div>
    <label>Résultat</label><div class="chips">${results.map(([k, l]) => h`<button type="button" class="chip ${q.result === k ? 'on' : ''}" data-act="aqResult" data-v="${k}">${l}</button>`)}</div>
    ${q.result === 'onsight' || q.result === 'flash' ? h`<p class="tiny muted">${q.result === 'onsight' ? 'À vue : du premier coup, sans rien savoir de la voie à l’avance.' : 'Flash : du premier coup, en ayant vu quelqu’un ou eu des infos.'}</p>` : ''}
    ${q.result !== 'flash' && q.result !== 'onsight' ? h`<label>Essais</label><div class="stepper sm"><button type="button" data-act="aqAtt" data-d="-1" aria-label="Moins">−</button><b>${q.attempts}</b><button type="button" data-act="aqAtt" data-d="1" aria-label="Plus">+</button></div>` : ''}
    <details class="how mini" ${q.id || q.day !== ymd(new Date()) || q.note ? 'open' : ''}><summary>Plus de détails : date, nom, note</summary>
      <label>Quand ?<input id="aq-day" type="date" max="${ymd(new Date())}" min="1990-01-01" value="${q.day}"></label>
      <label>Nom<input id="aq-name" maxlength="80" value="${q.name || ''}" placeholder="Le jaune du dévers…"></label>
      <label>Note <span class="tiny muted">(facultatif)</span><input id="aq-note" maxlength="300" value="${q.note || ''}" placeholder="Ex. pied gauche sur la réglette du milieu"></label>
      <label>Système de cotation<select data-change="aqSys">${Object.values(c.systems).filter((s) => !s.archived).map((s) => h`<option value="${s.id}" ${s.id === sys?.id ? 'selected' : ''}>${s.name}</option>`)}</select></label></details>
    <button class="btn pri big" data-act="aqSave" ${q.levelId ? '' : 'disabled'}>Enregistrer</button>${q.id ? h`<button class="btn ghost danger" data-act="ascDel" data-id="${q.id}">Supprimer cette entrée</button>` : ''}</div>`;
}
/** Champs libres gardés quand la feuille se redessine (choix d'un niveau, d'un résultat…). */
const aqKeep = () => { const n = $('#aq-name'), sc = $('#aq-sector'), d = $('#aq-day'), no = $('#aq-note'); if (n) S.aq.name = n.value; if (sc && sc.value.trim()) S.aq.sector = sc.value.trim(); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.value)) S.aq.day = d.value; if (no) S.aq.note = no.value; };
const aqDraw = () => { aqKeep(); openSheet(aqBody()); };
ACT.ascQuick = () => {
  const kind = C().kind, c = ctx(), preset = S.aqEnvPreset; S.aqEnvPreset = '';
  const lastAsc = c.ascents.find((a) => a.context?.env && c.envs.some((e) => e.id === a.context.env));
  const lastEnv = preset || lastAsc?.context.env || gyms().find((e) => e.isDefault)?.id || gyms()[0]?.id || '';
  const gym = c.envs.find((e) => e.id === lastEnv);
  S.aq = { kind, env: lastEnv, where: gym ? whereOf(gym) : 'salle', sector: !preset && lastAsc?.context?.env === lastEnv && lastAsc.context.place !== gym?.name ? lastAsc.context.place || '' : '', systemId: (gym?.gradeSys && c.systems[gym.gradeSys] ? gym.gradeSys : sysFor(kind)?.id), levelId: '', result: 'send', attempts: 1, name: '', nuance: '', styles: [], day: ymd(new Date()), note: '' };
  openSheet(aqBody());
};
/** Modifier une entrée du carnet (cotation, résultat, lieu, date, note…), depuis le carnet ou le journal. */
ACT.ascEdit = (el) => {
  const a = item('ascent', el.dataset.id), c = ctx(); if (!a) return;
  const sys = a.grade?.systemId && c.systems[a.grade.systemId] ? c.systems[a.grade.systemId] : sysFor(a.kind), env = c.envs.find((e) => e.id === a.context?.env);
  S.aq = { id: el.dataset.id, kind: a.kind, env: env?.id || '', where: env ? whereOf(env) : a.context?.kind === 'falaise' ? 'falaise' : 'salle', sector: env && whereOf(env) === 'falaise' ? a.context?.place || '' : '',
    systemId: sys?.id, levelId: sys && sortedLevels(sys).some((l) => l.id === a.grade?.levelId) ? a.grade.levelId : '', result: a.result, attempts: a.attempts || 1, name: a.name || '', nuance: a.nuance || '', styles: [...(a.styles || [])], day: ymd(new Date(a.date || Date.now())), note: a.note || '', date0: a.date };
  openSheet(aqBody());
};
ACT.aqWhere = (el) => { S.aq.where = el.dataset.v; const g = ctx().envs.find((e) => e.id === S.aq.env); if (g && whereOf(g) !== el.dataset.v) { S.aq.env = ''; S.aq.sector = ''; } aqDraw(); };
ACT.aqSector = (el) => { S.aq.sector = S.aq.sector === el.dataset.v ? '' : el.dataset.v; const i = $('#aq-sector'); if (i) i.value = ''; openSheet(aqBody()); };
ACT.aqNewPlace = (el) => { closeSheet(); setReturn('Retour au carnet', 'profile/climbing'); go('profile', 'equipment'); setTimeout(() => (el.dataset.v === 'falaise' ? ACT.envNewCrag : ACT.envNewGym)?.(), 200); };
ACT.aqEnv = (el) => { const c = ctx(), g = c.envs.find((e) => e.id === el.dataset.v); S.aq.env = el.dataset.v; S.aq.sector = ''; if (g?.gradeSys && c.systems[g.gradeSys]) { S.aq.systemId = g.gradeSys; S.aq.levelId = ''; } aqDraw(); };
/** Style absent de la liste : créé (pour tous tes prochains choix) et coché tout de suite. */
CHG.styleQuick = (el) => {
  const label = el.value.trim().slice(0, 40); if (!label) return; el.value = '';
  const c = ctx(), found = Object.values(c.styles).find((x) => !x.archived && x.label.toLowerCase() === label.toLowerCase());
  const id = found?.id || 'st-u-' + uid().slice(0, 10); if (!found) putItem('style', id, { label, activity: 'climbing' });
  const t = el.dataset.target;
  if (t === 'aq') { (S.aq.styles ||= []).includes(id) || S.aq.styles.push(id); aqDraw(); }
  else if (t === 'cp') { const cp = S.cp; if (cp && !cp.styles.includes(id)) cp.styles.push(id); render(); }
  else if (t === 'cpPart') { const p = S.cp?.parts?.[Number(el.dataset.i)]; if (p) { p.styles = [...new Set([...(p.styles || []), id])]; render(); ACT.cpEdit?.({ dataset: { i: el.dataset.i } }); } }
  toast(found ? `« ${found.label} » coché` : `Style « ${label} » ajouté`);
};
ACT.aqNuance = (el) => { S.aq.nuance = S.aq.nuance === el.dataset.v ? '' : el.dataset.v; aqDraw(); };
ACT.aqStyle = (el) => { const l = (S.aq.styles ||= []), i = l.indexOf(el.dataset.v); if (i >= 0) l.splice(i, 1); else l.push(el.dataset.v); aqDraw(); };
ACT.aqKind = (el) => { S.aq.kind = el.dataset.id; S.aq.systemId = sysFor(el.dataset.id)?.id; S.aq.levelId = ''; aqDraw(); };
ACT.aqGrade = (el) => { S.aq.levelId = el.dataset.v; aqDraw(); };
ACT.aqResult = (el) => { S.aq.result = el.dataset.v; if (el.dataset.v === 'flash' || el.dataset.v === 'onsight') S.aq.attempts = 1; aqDraw(); };
ACT.aqAtt = (el) => { S.aq.attempts = Math.max(1, Math.min(99, S.aq.attempts + Number(el.dataset.d))); aqDraw(); };
CHG.aqSys = (el) => { S.aq.systemId = el.value; S.aq.levelId = ''; aqDraw(); };
ACT.aqSave = () => {
  aqKeep(); const q = S.aq, c = ctx();
  const today = ymd(new Date()); if (!/^\d{4}-\d{2}-\d{2}$/.test(q.day || '') || q.day > today || q.day < '1990-01-01') return toast('Choisis une date passée ou aujourd’hui.', 3500, 'bad');
  // Aujourd'hui : l'heure réelle ; une autre date : midi ce jour-là (ou l'heure d'origine si la date ne change pas).
  const when = q.date0 && ymd(new Date(q.date0)) === q.day ? q.date0 : q.day === today ? Date.now() : new Date(q.day + 'T12:00:00').getTime();
  const grade = gradeSnapshot(c.systems[q.systemId], q.levelId); if (!grade) return toast('Choisis un niveau.');
  const gym = c.envs.find((e) => e.id === q.env), sc = $('#aq-sector'); if (sc && sc.value.trim()) q.sector = sc.value.trim();
  // Nouveau secteur tapé : ajouté à la falaise pour la prochaine fois.
  if (gym && whereOf(gym) === 'falaise' && q.sector && !(gym.sectors || []).includes(q.sector)) putItem('env', gym.id, { ...gym, sectors: [...(gym.sectors || []), q.sector].slice(0, 30) });
  putItem('ascent', q.id || 'asc-' + uid().slice(0, 14), { kind: q.kind, name: q.name.trim(), grade, result: q.result, attempts: q.result === 'flash' || q.result === 'onsight' ? 1 : q.attempts, styles: q.styles || [], nuance: q.nuance || '', date: when, note: String(q.note || '').trim().slice(0, 300), context: gym ? { env: gym.id, place: whereOf(gym) === 'falaise' ? q.sector || '' : '', kind: whereOf(gym) } : q.where ? { kind: q.where } : null });
  C().kind = q.kind; closeSheet(); buzzOk(); render();
  toast(q.id ? 'Entrée modifiée' : SENT.has(q.result) ? `${grade.label} ajouté à ton carnet` : 'Essai noté. Tu l’auras la prochaine fois.');
};

/* ───────── Projets ───────── */
function projForm() {
  const q = S.pj, sys = ctx().systems[q.systemId] || sysFor(q.kind);
  return h`<div class="aq"><h2>${q.wish ? '⭐ Nouvelle envie' : '📌 Nouveau projet'}</h2>${seg('pjKind', q.kind, [['bloc', '🪨 Bloc'], ['voie', '🧗 Voie']])}
    <label class="chk"><input type="checkbox" data-change="pjWish" ${q.wish ? 'checked' : ''}> ⭐ Une envie (pas encore essayé) : rangée par site dans « Mes envies »</label>
    <label>Nom<input id="pj-name" maxlength="80" value="${q.name}" placeholder="Le toit rouge, la 6c de la falaise…"></label>
    <label>Niveau</label>${gradeChips(sys, q.levelId, 'pjGrade')}
    <label>Où ?<input id="pj-place" maxlength="80" value="${q.place}" placeholder="Salle, falaise… (facultatif)"></label>
    <label class="btn filebtn">📷 ${q.photo ? 'Photo ajoutée ✓' : 'Ajouter une photo (facultatif)'}<input type="file" accept="image/*" capture="environment" data-change="pjPhoto" class="hidden"></label>
    <button class="btn pri big" data-act="pjSave">${q.wish ? 'Ajouter à mes envies' : 'Créer le projet'}</button></div>`;
}
CHG.pjWish = (el) => { pjKeep(); S.pj.wish = el.checked; openSheet(projForm()); };
const pjKeep = () => { const n = $('#pj-name'), p = $('#pj-place'); if (n) S.pj.name = n.value; if (p) S.pj.place = p.value; };
const pjDraw = () => { pjKeep(); openSheet(projForm()); };
ACT.projNew = () => { const kind = C().kind; S.pj = { kind, systemId: sysFor(kind)?.id, levelId: '', name: '', place: '', photo: null, wish: !!S.pjWish }; S.pjWish = false; openSheet(projForm()); };
ACT.pjKind = (el) => { S.pj.kind = el.dataset.id; S.pj.systemId = sysFor(el.dataset.id)?.id; S.pj.levelId = ''; pjDraw(); };
ACT.pjGrade = (el) => { S.pj.levelId = el.dataset.v; pjDraw(); };
CHG.pjPhoto = async (el) => { pjKeep(); try { S.pj.photo = await compressPhoto(el.files?.[0]); } catch (e) { toast(e.message); } pjDraw(); };
ACT.pjSave = () => {
  pjKeep(); const q = S.pj, grade = gradeSnapshot(ctx().systems[q.systemId], q.levelId);
  const id = 'pj-' + uid().slice(0, 14);
  if (q.photo) putItem('photo', id, q.photo);
  putItem('project', id, { kind: q.kind, name: q.name.trim() || (q.kind === 'voie' ? 'Ma voie projet' : 'Mon bloc projet'), grade, gradeText: '', place: q.place.trim(), status: q.wish ? 'wish' : 'active', tries: [], holds: [], hasPhoto: !!q.photo, startedAt: Date.now(), doneAt: 0, note: '' });
  if (q.wish) { closeSheet(); buzzOk(); toast('Ajouté à tes envies ⭐'); ACT.wishOpen(); return; }
  closeSheet(); buzzOk(); ACT.goProjects(); toast('Projet créé : il est dans tes objectifs. Bonne chance !');
  if (q.photo) setTimeout(() => ACT.projOpen({ dataset: { id } }), 150);
};
ACT.projTry = (el) => { const p = item('project', el.dataset.id); if (!p) return; putItem('project', p.id, addTries(p, 1)); buzzOk(); render(); if ($('#sheet.open .projd')) ACT.projOpen(el); };
ACT.projDone = async (el) => {
  const p = item('project', el.dataset.id); if (!p) return;
  if (!(await ask(`Tu as réussi « ${p.name} » ?`, { ok: 'Oui ! 🎉' }))) return;
  const s = projectStats(p), att = s.attempts + 1;
  putItem('ascent', 'asc-' + uid().slice(0, 14), { kind: p.kind, name: p.name, grade: p.grade, gradeText: p.gradeText, result: att <= 1 ? 'flash' : 'work', attempts: Math.min(999, att), styles: [], date: Date.now(), note: `Projet réussi après ${s.sessions || 1} séance(s).` });
  putItem('project', p.id, { ...addTries(p, 1), status: 'done', doneAt: Date.now() });
  closeSheet(); render(); celebrate(); toast(`Bravo ! ${p.name} est dans ta pyramide.`, 4500);
};

/* Détail d'un projet : photo et prises (un toucher ajoute une prise du type choisi). */
ACT.projOpen = (el) => {
  const p = item('project', el.dataset.id); if (!p) return;
  const ph = p.hasPhoto ? item('photo', p.id) : null, s = projectStats(p), st = C();
  const holds = (p.holds || []).map((x) => `<circle cx="${(x.x * 100).toFixed(2)}" cy="${(x.y * 100 * (ph ? ph.h / ph.w : 1)).toFixed(2)}" r="3.2" class="hold" style="stroke:${HOLD[x.t]?.[1] || '#fff'}"/>`).join('');
  openSheet(h`<div class="projd"><div class="row between"><h2>${p.name}</h2><span class="gpill">${p.grade?.label || ''}</span></div>
    ${ph?.data ? h`<div class="photo-wrap" data-act="holdAdd" data-id="${p.id}"><img src="${ph.data}" alt="Photo du projet">${raw(`<svg viewBox="0 0 100 ${(100 * ph.h / ph.w).toFixed(2)}" preserveAspectRatio="none">${holds}</svg>`)}</div>
      <div class="chips">${Object.entries(HOLD).map(([k, [l, col]]) => h`<button type="button" class="chip ${st.hold === k ? 'on' : ''}" data-act="holdType" data-v="${k}" data-id="${p.id}">${raw(`<span class="dot" style="background:${col}"></span>`)} ${l}</button>`)}</div>
      <p class="tiny muted">Touche la photo pour marquer une prise.${p.holds?.length ? '' : ' Commence par le départ.'}</p>
      <div class="row wrapf"><button class="btn sm" data-act="holdUndo" data-id="${p.id}" ${p.holds?.length ? '' : 'disabled'}>↶ Annuler la dernière</button><button class="btn sm ghost" data-act="photoDel" data-id="${p.id}">Retirer la photo</button></div>`
      : h`<label class="btn filebtn">📷 Ajouter une photo<input type="file" accept="image/*" capture="environment" data-change="projPhoto" data-id="${p.id}" class="hidden"></label>`}
    <div class="grid3"><div class="stat"><b>${s.attempts}</b><span>essais</span></div><div class="stat"><b>${s.sessions}</b><span>séances</span></div><div class="stat"><b>${s.days}</b><span>jours</span></div></div>
    ${p.place ? h`<p class="small muted">📍 ${p.place}</p>` : ''}
    <label class="small"><b>Point le plus haut atteint</b> : <output id="pjhi">${p.high || 0}</output> %<input type="range" min="0" max="100" step="5" value="${p.high || 0}" data-change="projHigh" data-input="projHighLive" data-id="${p.id}" aria-label="Point le plus haut atteint, en pourcentage"></label>
    <details class="how mini" ${(p.sections || []).length ? 'open' : ''}><summary>🧩 Sections (${(p.sections || []).filter((x) => x.done).length}/${(p.sections || []).length})</summary>
      <div class="stack tight">${(p.sections || []).map((x, i) => h`<label class="chk"><input type="checkbox" data-change="projSec" data-id="${p.id}" data-i="${i}" ${x.done ? 'checked' : ''}> ${x.name}</label>`)}</div>
      <div class="row"><input id="pjsec" maxlength="40" placeholder="Ex. départ, le crux, la sortie" class="grow"><button class="btn sm" data-act="projSecAdd" data-id="${p.id}">＋</button></div></details>
    <details class="how mini" ${(p.fallWhy || []).length ? 'open' : ''}><summary>🪂 Où et pourquoi je tombe</summary>
      <p class="tiny muted">Marque l’endroit sur la photo (type « Là où je tombe »), puis la raison : l’app propose quoi travailler.</p>
      <div class="chips">${Object.entries(FALL_WHY).map(([k, [ic, l]]) => chip((p.fallWhy || []).includes(k), `${ic} ${l}`, `data-act="projWhy" data-id="${p.id}" data-v="${k}"`))}${addField('fall', 'projWhy', { i: p.id })}</div>
      ${(p.fallWhy || []).length ? h`<ul class="clean tight small">${fallTraining(p.fallWhy).tips.map((t) => h`<li>${t}</li>`)}</ul><button class="btn sm pri" data-act="projTrain" data-id="${p.id}">✨ Séance ciblée pour ce projet</button>` : ''}</details>
    ${p.status === 'active' ? h`<div class="grid2"><button class="btn big" data-act="projTry" data-id="${p.id}">＋1 essai</button><button class="btn pri big" data-act="projDone" data-id="${p.id}">✓ Réussi !</button></div>` : h`<p class="ok-t">🎉 Réussi le ${fmtDay(p.doneAt)}</p>`}
    <div class="row wrapf"><button class="btn sm ghost" data-act="projArchive" data-id="${p.id}">${p.status === 'archived' ? 'Réactiver' : 'Mettre de côté'}</button><button class="btn sm ghost danger" data-act="projDel" data-id="${p.id}">Supprimer</button><span class="grow"></span><button class="btn" data-act="closeSheet">Fermer</button></div></div>`, { wide: true });
};
ACT.holdType = (el) => { C().hold = el.dataset.v; ACT.projOpen(el); };
CHG.projHigh = (el) => { const p = item('project', el.dataset.id); if (p) putItem('project', p.id, { ...p, high: Math.max(0, Math.min(100, Number(el.value) || 0)) }); };
INPUT.projHighLive = (el) => { const o = document.getElementById('pjhi'); if (o) o.textContent = el.value; };
CHG.projSec = (el) => { const p = item('project', el.dataset.id); if (!p) return; const l = [...(p.sections || [])]; const i = Number(el.dataset.i); if (l[i]) l[i] = { ...l[i], done: el.checked }; putItem('project', p.id, { ...p, sections: l }); };
ACT.projSecAdd = (el) => { const p = item('project', el.dataset.id), i = $('#pjsec'), name = String(i?.value || '').trim().slice(0, 40); if (!p || !name) return; putItem('project', p.id, { ...p, sections: [...(p.sections || []), { name, done: false }].slice(0, 12) }); ACT.projOpen(el); };
onChoice('projWhy', { apply: (key, el) => { const p = item('project', el.dataset.i); if (p && !(p.fallWhy || []).includes(key)) ACT.projWhy({ dataset: { id: p.id, v: key } }); else if (p) ACT.projOpen({ dataset: { id: p.id } }); } });
ACT.projWhy = (el) => { const p = item('project', el.dataset.id); if (!p) return; const l = new Set(p.fallWhy || []); l.has(el.dataset.v) ? l.delete(el.dataset.v) : l.add(el.dataset.v); putItem('project', p.id, { ...p, fallWhy: [...l].slice(0, 6) }); ACT.projOpen(el); };
ACT.projTrain = (el) => { const p = item('project', el.dataset.id); if (!p) return; const t = fallTraining(p.fallWhy || []); closeSheet(); openWizard({ sport: p.kind === 'voie' ? 'climbing_route' : 'climbing_boulder', focus: { label: `projet « ${p.name} »`, caps: t.caps } }); };
ACT.holdAdd = (el, e) => {
  const ev = e || window.event, img = el.querySelector('img'); if (!img || !ev) return;
  const r = img.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const p = item('project', el.dataset.id); if (!p) return;
  putItem('project', p.id, { ...p, holds: [...(p.holds || []), { x, y, t: C().hold }].slice(-80) }); ACT.projOpen(el);
};
ACT.holdUndo = (el) => { const p = item('project', el.dataset.id); if (p) { putItem('project', p.id, { ...p, holds: (p.holds || []).slice(0, -1) }); ACT.projOpen(el); } };
ACT.photoDel = async (el) => { const p = item('project', el.dataset.id); if (p && (await ask('Retirer la photo et les prises ?', { danger: true, ok: 'Retirer' }))) { delItem('photo', p.id); putItem('project', p.id, { ...p, hasPhoto: false, holds: [] }); ACT.projOpen(el); render(); } };
CHG.projPhoto = async (el) => {
  const p = item('project', el.dataset.id); if (!p) return;
  try { putItem('photo', p.id, await compressPhoto(el.files?.[0])); putItem('project', p.id, { ...p, hasPhoto: true }); } catch (e) { toast(e.message); }
  ACT.projOpen(el); render();
};
ACT.projArchive = (el) => { const p = item('project', el.dataset.id); if (p) { putItem('project', p.id, { ...p, status: p.status === 'archived' ? 'active' : 'archived' }); closeSheet(); render(); } };
ACT.projDel = async (el) => { const p = item('project', el.dataset.id); if (p && (await ask(`Supprimer le projet « ${p.name} » ?`, { danger: true, ok: 'Supprimer' }))) { delItem('project', p.id); if (p.hasPhoto) delItem('photo', p.id); closeSheet(); render(); } };

/** Réduit une photo (JPEG ~500 px) pour qu'elle tienne dans le compte et se synchronise vite. */
export async function compressPhoto(file) {
  if (!file) throw new Error('Aucune photo choisie.');
  if (!/^image\//.test(file.type)) throw new Error('Ce fichier n’est pas une image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible.')); i.src = url; });
    for (const max of [560, 440, 340]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(img, 0, 0, w, hh);
      for (const q of [0.72, 0.6, 0.48, 0.38]) { const data = cv.toDataURL('image/jpeg', q); if (data.length < 88000) return { data, w, h: hh }; }
    }
    throw new Error('Photo trop lourde, même réduite.');
  } finally { URL.revokeObjectURL(url); }
}

/* ───────── Test de doigts ───────── */
ACT.fingerTime = () => {
  openSheet(h`<div class="stack"><h2>⏱ Temps max sur 20 mm</h2><ol class="small"><li>Échauffe bien tes doigts (10 min de grimpe facile ou de suspensions légères).</li><li>Prends la réglette de 20 mm, bras tendus, épaules engagées.</li><li>Tiens le plus longtemps possible, puis touche « J’ai lâché ».</li></ol>
    <p class="tiny muted">Arrête tout de suite si tu sens une douleur dans un doigt.</p>${sourcesLine(['medernach2015', 'schoffl2006'])}<button class="btn pri big" data-act="fingerGo">Je suis prêt</button></div>`);
};
let sw = null;
ACT.fingerGo = () => {
  closeSheet(); const root = document.createElement('div'); root.id = 'itimer'; root.className = 'ph-prep'; document.body.appendChild(root); document.body.classList.add('noscroll');
  const t0 = Date.now() + 5000;
  const draw = () => {
    const now = Date.now(), prep = now < t0;
    root.className = prep ? 'ph-prep' : 'ph-work';
    root.innerHTML = h`<div class="it-top"><button class="btn sm" data-act="fingerCancel">✕ Annuler</button><span class="small">Test 20 mm</span><span></span></div>
      <div class="it-mid"><div class="it-label">${prep ? 'Prépare-toi' : 'Tiens !'}</div><div class="big-t">${prep ? Math.ceil((t0 - now) / 1000) : ((now - t0) / 1000).toFixed(1)}</div></div>
      <div class="it-bot"><button class="btn pri big" data-act="fingerStop" ${prep ? 'disabled' : ''}>J’ai lâché</button></div>`.s;
  };
  sw = { t0, id: setInterval(draw, 100) }; draw();
};
const swEnd = () => { clearInterval(sw?.id); $('#itimer')?.remove(); document.body.classList.remove('noscroll'); };
ACT.fingerCancel = () => { swEnd(); sw = null; };
ACT.fingerStop = () => {
  const secs = Math.round(((Date.now() - sw.t0) / 1000) * 10) / 10; swEnd(); sw = null;
  savePerf('suspension_20mm', secs, 's');
};
ACT.fingerLoad = () => {
  openSheet(h`<div class="stack"><h2>🏋️ 10 s avec lest</h2><p class="small">Bien échauffé, sur 20 mm. Choisis une charge que tu penses tenir 10 s. Le minuteur compte pour toi, puis tu notes la charge.</p>
    <p class="tiny muted">Réservé aux grimpeurs qui s’entraînent déjà à la poutre. En cas de douleur, on arrête.</p><button class="btn pri big" data-act="fingerLoadGo">▶ Lancer 10 s</button></div>`);
};
ACT.fingerLoadGo = () => {
  closeSheet();
  startTimer({ name: 'Test 10 s avec lest', work: 10, rest: 0, reps: 1, sets: 1, setRest: 0 }, {
    onDone: () => openSheet(h`<form data-submit="fingerLoadSave" class="stack"><h2>Tenu 10 s ?</h2><label>Charge ajoutée (kg, négatif si tu as été aidé)<input type="number" name="kg" step="0.5" min="-80" max="150" inputmode="decimal" required autofocus></label><button class="btn pri" type="submit">Enregistrer</button><button class="btn" type="button" data-act="closeSheet">Je n’ai pas tenu</button></form>`),
  });
};
SUBMIT.fingerLoadSave = (f) => { const kg = Number(new FormData(f).get('kg')); if (!Number.isFinite(kg)) return; closeSheet(); savePerf('suspension_lestee', kg, 'kg'); };
function savePerf(metricId, value, unit) {
  const before = fingerTest(ctx().perfs), list = metricId === 'suspension_lestee' ? before.load : before.time, prev = list.at(-1)?.value;
  putItem('perf', 'pf-' + uid().slice(0, 14), { metricId, value, unit, date: Date.now(), source: 'measured', note: 'Test de doigts' });
  render();
  if (prev != null && value > prev) { celebrate(); toast(`Nouveau record : ${value} ${unit} (avant ${prev} ${unit})`, 4500); }
  else toast(`Noté : ${value} ${unit}. Prochain test dans un mois.`, 4000);
}
export const fingerClock = () => (sw ? mmss(Math.round((Date.now() - sw.t0) / 1000)) : '');
