// views-sports.js — outils par sport, côté écran (calculs dans sports.js, testés) :
//  · Carnet d'escalade : mes styles, mes envies par site, mode compétition, mon pan (blocs générés), conditions en
//    falaise (météo), matériel (bien choisir, quand changer), dynamomètre Bluetooth (expérimental) ;
//  · Records et mesures : charges max estimées (1RM), disques sur la barre, allures et prévisions de course,
//    compteur de longueurs, import d'une activité GPX / TCX.
import { h, raw, openSheet, closeSheet, toast, chip, menuList, fmtDay, buzzOk } from './ui.js';
import { S, ACT, CHG, ctx, render, putItem, item, itemsOf, addHistory, api, go, accountToken, accountMatches } from './state.js';
import { uid } from './shared.js';
import { styleStats, compScore, boardProblem, BOARD_LEVELS, FALL_WHY, fallTraining, cragConditions, plates, percentTable, strengthBoard, racePredictions, vmaPaces, fmtTime, laps, parseTrack, trackActivity, trackImportId, trackFingerprint, TINDEQ, parseTindeq, pullSummary, RESULT_FR } from './sports.js';
import { compressPhoto } from './views-climb.js';
import { openWizard } from './views-climbplan.js';
import { startTimer } from './timer.js';
import { sourcesLine } from './srcui.js';

const fr = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

/* ═════════ Liste d'outils du carnet ═════════ */
export function climbTools() {
  const c = ctx(), wishes = itemsOf('project').filter((p) => p.status === 'wish').length, crags = c.envs.filter((e) => ['falaise', 'exterieur'].includes(e.type) && !e.archived);
  return menuList([
    ['styleOpen', '', '📊', 'Mes styles', 'À vue, flash, après travail ; ce qui te réussit (dévers, dalle…)'],
    ['wishOpen', '', '⭐', 'Mes envies', wishes ? `${wishes} bloc${wishes > 1 ? 's' : ''} ou voie${wishes > 1 ? 's' : ''} à essayer` : 'Les blocs et voies à essayer, par site'],
    ['compOpen', '', '🏆', 'Mode compétition', 'Tops, zones, essais ; chrono 4 min / 4 min'],
    ['boardOpen', '', '🧩', 'Mon pan', 'Photo de ton pan : des blocs générés au hasard'],
    ['wxOpen', '', '🌤️', 'Conditions en falaise', crags.length ? `Météo des 3 prochains jours sur ${crags.length > 1 ? 'tes falaises' : crags[0].name}` : 'Ajoute une falaise (avec ses coordonnées)'],
    ['gearOpen', '', '🎒', 'Matériel : bien choisir', 'Chaussons, corde, crashpad… et quand les changer'],
    ['dynoOpen', '', '📶', 'Dynamomètre (expérimental)', 'Ta force de doigts mesurée en Bluetooth'],
  ]);
}
/* ───────── Styles ───────── */
ACT.styleOpen = () => {
  const c = ctx(), kind = S.styleKind || 'bloc', st = styleStats(c.ascents, c.styles, { kind });
  const res = ['onsight', 'flash', 'send', 'work'].filter((k) => st.byResult[k]);
  openSheet(h`<div class="stack"><h2 style="margin:0">📊 Mes styles</h2>
    <div class="chips">${chip(kind === 'bloc', '🪨 Bloc', 'data-act="styleKind" data-id="bloc"')}${chip(kind === 'voie', '🧗 Voie', 'data-act="styleKind" data-id="voie"')}</div>
    ${st.sent ? h`<p class="small">${st.sent} réussite${st.sent > 1 ? 's' : ''} sur ${st.total} essai${st.total > 1 ? 's' : ''} notés · <b>${st.firstTry} %</b> au premier essai (à vue ou flash).</p>
      <div class="chips">${res.map((k) => h`<span class="chip static">${RESULT_FR[k]} : ${st.byResult[k]}</span>`)}</div>` : h`<p class="small muted">Note tes ${kind === 'bloc' ? 'blocs' : 'voies'} avec leur style (dévers, dalle, réglettes…) : l’app te dira ce qui te réussit.</p>`}
    ${st.rows.length ? h`<span class="kicker">Réussite par style (3 essais au moins)</span><div class="stack tight">${st.rows.map((r) => h`<div class="cbar"><span>${r.label}</span><div class="track"><i class="cur" style="width:${r.rate}%"></i></div><b>${r.rate} %</b></div>`)}</div>` : ''}
    ${st.strong ? h`<p class="small ok-t">💪 Point fort : ${st.strong.label.toLowerCase()} (${st.strong.rate} %).</p>` : ''}${st.weak ? h`<p class="small">🎯 À travailler : ${st.weak.label.toLowerCase()} (${st.weak.rate} %). <button class="linkish acc-t" data-act="styleTrain" data-id="${st.weak.id}">Séance pour ça ›</button></p>` : ''}</div>`, { wide: true });
};
ACT.styleKind = (el) => { S.styleKind = el.dataset.id; ACT.styleOpen(); };
ACT.styleTrain = (el) => { const s = ctx().styles[el.dataset.id]; closeSheet(); openWizard({ sport: Object.keys(ctx().activities).find((a) => a.startsWith('climbing')) || '', focus: { label: s?.label || 'style', caps: { technique_escalade: 1, technique_pieds: 0.6 } }, intents: [] }); };
/* ───────── Envies ───────── */
ACT.wishOpen = () => {
  const list = itemsOf('project').filter((p) => p.status === 'wish'), by = {};
  for (const p of list) (by[p.place || 'Sans lieu'] ||= []).push(p);
  openSheet(h`<div class="stack"><h2 style="margin:0">⭐ Mes envies</h2><p class="tiny muted">Les blocs et voies que tu veux essayer, rangés par site. Le jour J, touche « Commencer » : ça devient un projet.</p>
    ${Object.keys(by).length ? Object.entries(by).map(([place, l]) => h`<span class="kicker">📍 ${place}</span><div class="setmenu">${l.map((p) => h`<div class="setrow"><span class="sic">${p.kind === 'voie' ? '🧗' : '🪨'}</span><span class="grow"><b>${p.name}</b><small>${p.grade?.label || p.gradeText || ''}${p.note ? ' · ' + p.note : ''}</small></span><button class="btn sm" data-act="wishStart" data-id="${p.id}">Commencer</button></div>`)}</div>`) : h`<p class="small muted">Aucune envie pour l’instant.</p>`}
    <button class="btn pri" data-act="wishNew">＋ Ajouter une envie</button></div>`, { wide: true });
};
ACT.wishNew = () => { closeSheet(); S.pjWish = true; ACT.projNew(); };
ACT.wishStart = (el) => { const p = item('project', el.dataset.id); if (!p) return; putItem('project', p.id, { ...p, status: 'active', startedAt: Date.now() }); closeSheet(); buzzOk(); toast('C’est un projet maintenant : bonne chance !'); render(); };
/* ───────── Compétition ───────── */
ACT.compOpen = () => { S.comp ||= { n: 5, res: Array.from({ length: 8 }, () => ({ top: 0, zone: 0 })) }; compSheet(); };
function compSheet() {
  const q = S.comp, list = q.res.slice(0, q.n), sc = compScore(list);
  const step = (i, k) => h`<div class="stepper sm"><button type="button" data-act="compAdj" data-i="${i}" data-k="${k}" data-d="-1" aria-label="Moins">−</button><b>${list[i][k] || '—'}</b><button type="button" data-act="compAdj" data-i="${i}" data-k="${k}" data-d="1" aria-label="Plus">+</button></div>`;
  openSheet(h`<div class="stack"><h2 style="margin:0">🏆 Mode compétition</h2>
    <p class="tiny muted">Pour chaque bloc : le nombre d’essais pour faire le top et pour atteindre la zone (vide = pas atteint). Le score se lit « tops T zones Z essais tops essais zones ».</p>
    <div class="chips">${[4, 5, 6, 8].map((n) => chip(q.n === n, `${n} blocs`, `data-act="compN" data-id="${n}"`))}</div>
    <div class="stack tight">${list.map((r, i) => h`<div class="comprow"><b>Bloc ${i + 1}</b><span class="tiny muted">Top</span>${step(i, 'top')}<span class="tiny muted">Zone</span>${step(i, 'zone')}</div>`)}</div>
    <div class="card flat center"><b class="presc">${sc.text}</b><div class="tiny muted">${sc.tops} top${sc.tops > 1 ? 's' : ''}, ${sc.zones} zone${sc.zones > 1 ? 's' : ''}, ${sc.topAttempts} essais pour les tops, ${sc.zoneAttempts} pour les zones</div></div>
    <div class="grid2"><button class="btn" data-act="compTimer">⏱ Chrono 4 / 4 min</button><button class="btn pri" data-act="compSave">💾 Garder dans le carnet</button></div>
    <button class="btn ghost sm" data-act="compReset">Tout effacer</button></div>`, { wide: true });
}
ACT.compN = (el) => { S.comp.n = Number(el.dataset.id); compSheet(); };
ACT.compAdj = (el) => { const r = S.comp.res[Number(el.dataset.i)], k = el.dataset.k; r[k] = Math.max(0, Math.min(99, (r[k] || 0) + Number(el.dataset.d))); if (k === 'top' && r.top && r.zone > r.top) r.zone = r.top; compSheet(); };
ACT.compReset = () => { S.comp = { n: S.comp.n, res: Array.from({ length: 8 }, () => ({ top: 0, zone: 0 })) }; compSheet(); };
ACT.compTimer = () => { closeSheet(); startTimer({ name: `Compétition : ${S.comp.n} blocs`, work: 240, rest: 240, reps: S.comp.n, sets: 1, setRest: 0 }); };
ACT.compSave = () => {
  const q = S.comp, sc = compScore(q.res.slice(0, q.n)); if (!sc.zones && !sc.tops) return toast('Note au moins une zone ou un top.');
  putItem('jnote', 'jn-' + uid().slice(0, 14), { date: Date.now(), text: `🏆 Compétition (${q.n} blocs) : ${sc.text} — ${sc.tops} tops, ${sc.zones} zones.` });
  closeSheet(); buzzOk(); toast('Gardé dans ton journal'); S.comp = null; render();
};
/* ───────── Mon pan ───────── */
const board = () => itemsOf('project').find((p) => p.board) || null;
ACT.boardOpen = () => {
  const b = board(), ph = b?.hasPhoto ? item('photo', b.id) : null, cur = S.boardPb;
  const holds = b?.holds || [], ratio = ph ? ph.h / ph.w : 1, roles = new Map();
  if (cur) { roles.set(cur.start, 'depart'); cur.moves.forEach((i, k) => roles.set(i, `m${k + 1}`)); roles.set(cur.top, 'top'); cur.feet.forEach((i) => roles.set(i, 'pied')); }
  const col = { depart: '#5cb87a', top: '#ef6f5e', pied: '#5fa8d3' };
  const svg = holds.map((x, i) => { const r = roles.get(i), c = r ? col[r] || '#f5b642' : 'rgba(255,255,255,.55)'; const cx = (x.x * 100).toFixed(2), cy = (x.y * 100 * ratio).toFixed(2); return `<circle cx="${cx}" cy="${cy}" r="${r ? 3.4 : 2}" class="hold" style="stroke:${c};${r ? 'stroke-width:1.4' : ''}"/>${r && r.startsWith('m') ? `<text x="${cx}" y="${(Number(cy) - 4.2).toFixed(2)}" class="bnum" text-anchor="middle">${r.slice(1)}</text>` : ''}`; }).join('');
  openSheet(h`<div class="stack"><h2 style="margin:0">🧩 Mon pan</h2>
    ${!b ? h`<p class="small">Prends ton pan (ou un mur de bloc) en photo, de face, puis touche toutes les prises. L’app tire ensuite des blocs au hasard, adaptés au niveau choisi.</p><label class="btn pri filebtn">📷 Photo de mon pan<input type="file" accept="image/*" capture="environment" data-change="boardPhoto" class="hidden"></label>`
      : h`${ph?.data ? h`<div class="photo-wrap" data-act="${S.boardEdit ? 'boardHold' : ''}"><img src="${ph.data}" alt="Photo de ton pan">${raw(`<svg viewBox="0 0 100 ${(100 * ratio).toFixed(2)}" preserveAspectRatio="none">${svg}</svg>`)}</div>` : ''}
        <p class="tiny muted">${holds.length} prise${holds.length > 1 ? 's' : ''} marquée${holds.length > 1 ? 's' : ''}. ${S.boardEdit ? 'Touche la photo sur chaque prise.' : ''}</p>
        <div class="row wrapf"><button class="btn sm ${S.boardEdit ? 'pri' : ''}" data-act="boardEdit">${S.boardEdit ? '✓ Fini de marquer' : '✏️ Marquer des prises'}</button>${S.boardEdit && holds.length ? h`<button class="btn sm" data-act="boardUndo">↶ Annuler la dernière</button>` : ''}</div>
        ${holds.length >= 5 && !S.boardEdit ? h`<span class="kicker">Générer un bloc</span><div class="chips">${Object.entries(BOARD_LEVELS).map(([k, l]) => chip((S.boardLvl || 'moyen') === k, l.label, `data-act="boardLvl" data-id="${k}"`))}</div>
          <div class="grid2"><button class="btn pri" data-act="boardGen">🎲 ${cur ? 'Un autre' : 'Générer'}</button>${cur ? h`<button class="btn" data-act="boardKeep">💾 Garder</button>` : ''}</div>
          ${cur ? h`<p class="tiny"><span class="dot" style="background:#5cb87a"></span> départ · <span class="dot" style="background:#f5b642"></span> mains dans l’ordre (numéros) · <span class="dot" style="background:#ef6f5e"></span> top · <span class="dot" style="background:#5fa8d3"></span> pieds conseillés</p>` : ''}` : holds.length < 5 ? h`<p class="small muted">Marque au moins 5 prises pour générer des blocs.</p>` : ''}
        ${(b.problems || []).length ? h`<span class="kicker">Mes blocs gardés</span><div class="chips">${b.problems.map((pb, i) => chip(false, `${pb.name}`, `data-act="boardShow" data-i="${i}"`))}</div>` : ''}`}</div>`, { wide: true });
};
CHG.boardPhoto = async (el) => {
  try { const ph = await compressPhoto(el.files?.[0]); const id = 'pj-' + uid().slice(0, 14); putItem('photo', id, ph); putItem('project', id, { kind: 'bloc', name: 'Mon pan', place: 'Mon pan', status: 'archived', board: true, hasPhoto: true, holds: [], tries: [], startedAt: Date.now(), doneAt: 0, note: '', problems: [] }); S.boardEdit = true; S.boardPb = null; }
  catch (e) { toast(e.message); }
  ACT.boardOpen();
};
ACT.boardEdit = () => { S.boardEdit = !S.boardEdit; S.boardPb = null; ACT.boardOpen(); };
ACT.boardHold = (el, e) => { const b = board(), img = el.querySelector('img'); if (!b || !img || !e) return; const r = img.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; if (x < 0 || x > 1 || y < 0 || y > 1) return; putItem('project', b.id, { ...b, holds: [...(b.holds || []), { x, y, t: 'main' }].slice(-120) }); ACT.boardOpen(); };
ACT.boardUndo = () => { const b = board(); if (b) { putItem('project', b.id, { ...b, holds: (b.holds || []).slice(0, -1) }); ACT.boardOpen(); } };
ACT.boardLvl = (el) => { S.boardLvl = el.dataset.id; S.boardPb = null; ACT.boardOpen(); };
ACT.boardGen = () => { const b = board(); S.boardSeed = (S.boardSeed || Math.floor(Math.random() * 1e6)) + 1; const p = boardProblem(b?.holds || [], { level: S.boardLvl || 'moyen', seed: S.boardSeed }); if (!p) { toast('Pas de bloc possible avec ces prises à ce niveau : marque plus de prises ou change de niveau.', 4500); return; } S.boardPb = p; ACT.boardOpen(); };
ACT.boardKeep = () => { const b = board(), p = S.boardPb; if (!b || !p) return; const n = (b.problems || []).length + 1; putItem('project', b.id, { ...b, problems: [...(b.problems || []), { name: `Bloc ${n}`, idx: [p.start, ...p.moves, p.top].map(String), level: p.level }].slice(-30) }); buzzOk(); toast(`Gardé : Bloc ${n}`); ACT.boardOpen(); };
ACT.boardShow = (el) => { const b = board(), pb = b?.problems?.[Number(el.dataset.i)]; if (!pb) return; const idx = pb.idx.map(Number); S.boardPb = { start: idx[0], moves: idx.slice(1, -1), top: idx.at(-1), feet: [], level: pb.level }; ACT.boardOpen(); };
/* ───────── Conditions en falaise ───────── */
const WX = {};
ACT.wxOpen = async () => {
  if (S.user?.guest) return toast('Crée un compte (gratuit) pour la météo des falaises.', 4000);
  const crags = ctx().envs.filter((e) => ['falaise', 'exterieur'].includes(e.type) && !e.archived), withGps = crags.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon));
  openSheet(h`<div class="stack"><h2 style="margin:0">🌤️ Conditions en falaise</h2><p class="small muted">Chargement…</p></div>`);
  for (const e of withGps) if (!WX[e.id] || Date.now() - WX[e.id].at > 3600000) { try { const r = await api('GET', `/api/weather?lat=${e.lat}&lon=${e.lon}`); WX[e.id] = { at: Date.now(), list: cragConditions(r.hourly) }; } catch (err) { WX[e.id] = { at: Date.now(), error: err.message || 'indisponible', list: [] }; } }
  openSheet(h`<div class="stack"><h2 style="margin:0">🌤️ Conditions en falaise</h2>
    ${withGps.map((e) => h`<span class="kicker">📍 ${e.name}</span>${WX[e.id]?.error ? h`<p class="small warn-t">Météo indisponible : ${WX[e.id].error}</p>` : h`<div class="setmenu">${WX[e.id].list.map((x) => h`<div class="setrow"><span class="sic">${x.emoji}</span><span class="grow"><b>${new Date(x.day + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} · ${x.slot}</b><small>${x.text}</small></span></div>`)}</div>`}`)}
    ${crags.filter((e) => !withGps.includes(e)).length ? h`<p class="small">Sans coordonnées : ${crags.filter((e) => !withGps.includes(e)).map((e) => e.name).join(', ')}. Ajoute-les dans Profil › Mes lieux (« Coordonnées GPS »).</p>` : ''}
    ${!crags.length ? h`<p class="small">Ajoute une falaise dans Profil › Mes lieux, avec ses coordonnées GPS (latitude, longitude).</p>` : ''}
    <p class="tiny muted">Repères : pluie dans les 24 h → rocher sûrement humide ; 3 à 16 °C et air sec → bonne adhérence. Sur le grès (Fontainebleau…), ne grimpe jamais sur un rocher humide : les prises cassent. Météo : Open-Meteo.com.</p></div>`, { wide: true });
};
/* ───────── Matériel ───────── */
const GEAR = [
  ['🩰', 'Chaussons', 'Ajustés sans douleur vive pour débuter (orteils à plat ou à peine pliés) ; plus cambrés et serrés pour le dévers et les petites prises. À ressemeler quand la gomme s’amincit au bout, avant que le cuir ne soit percé.'],
  ['🧂', 'Magnésie', 'En poudre ou liquide (liquide : moins de poussière en salle). Un peu, souvent : trop de magnésie fait glisser. Brosse les prises après toi.'],
  ['🪥', 'Brosse', 'Poils souples (naturels ou nylon fin) : nettoie les prises en salle et en falaise, sans jamais frotter le grès mouillé.'],
  ['🛏️', 'Crashpad', 'Pour le bloc en extérieur : un grand pour la base, un petit pour combler les trous. À remplacer quand la mousse est tassée (on sent le sol en tombant).'],
  ['🪢', 'Corde', 'Longueur selon les falaises (souvent 60 à 70 m ; vérifie la hauteur des voies, fais un nœud en bout de corde). À changer après une grosse chute sur une arête, si la gaine est abîmée ou l’âme se sent, et selon la notice du fabricant.'],
  ['🔗', 'Dégaines et baudrier', 'Contrôle à chaque sortie : coutures, usure des sangles, doigts des mousquetons. Suis la notice et la durée de vie données par le fabricant ; après une chute du matériel sur du dur, fais-le vérifier.'],
  ['⛑️', 'Casque', 'Indispensable en falaise (chutes de pierres) pour grimpeur et assureur.'],
  ['🛡️', 'Système d’assurage', 'Un frein assisté aide à bloquer une chute, mais ne remplace jamais la main sous le frein : apprends-le avec un moniteur.'],
];
ACT.gearOpen = () => openSheet(h`<div class="stack"><h2 style="margin:0">🎒 Matériel : bien choisir</h2><div class="setmenu">${GEAR.map(([ic, t, d]) => h`<div class="setrow"><span class="sic">${ic}</span><span class="grow"><b>${t}</b><small>${d}</small></span></div>`)}</div><p class="tiny muted">Repères généraux, sans marque. Pour la sécurité (corde, baudrier, assurage), la notice du fabricant et l’avis d’un moniteur priment.</p></div>`, { wide: true });
/* ───────── Dynamomètre (expérimental) ───────── */
const DY = { dev: null, ctrl: null, samples: [], live: 0, on: false };
ACT.dynoOpen = () => {
  const ok = 'bluetooth' in navigator;
  openSheet(h`<div class="stack"><h2 style="margin:0">📶 Dynamomètre <span class="tag warn">expérimental</span></h2>
    <p class="small">Pour un dynamomètre de type Tindeq Progressor relié à une réglette de 20 mm : tire d’une main pendant 5 s, l’app garde ton pic de force. Bien échauffé.</p>
    ${ok ? h`${DY.dev ? h`<p class="small ok-t">✓ Connecté</p>` : h`<button class="btn pri" data-act="dynoConnect">🔗 Connecter</button>`}
      ${DY.dev ? h`<div class="card flat center"><div class="timer" id="dylive">${fr(DY.live)} kg</div><div class="tiny muted">${DY.on ? 'Mesure en cours…' : 'Prêt'}</div></div>
        <div class="grid2"><button class="btn" data-act="dynoTare">⚖️ Remettre à zéro</button><button class="btn pri" data-act="dynoGo" ${DY.on ? 'disabled' : ''}>▶ Mesurer 7 s</button></div>` : ''}
      ${DY.result ? h`<p class="small">Pic : <b>${fr(DY.result.peak)} kg</b> · moyenne ${fr(DY.result.avg)} kg sur ${fr(DY.result.seconds)} s</p><button class="btn" data-act="dynoSave">💾 Garder ce pic (Records et mesures)</button>` : ''}`
      : h`<p class="small warn-t">Ce navigateur ne gère pas le Bluetooth web (iPhone notamment). Sur Android ou ordinateur, ouvre l’app dans Chrome ou Edge.</p>`}
    <p class="tiny muted">Fonction expérimentale : la lecture suit le protocole publié par le fabricant ; d’autres modèles ne sont pas pris en charge.</p></div>`);
};
ACT.dynoConnect = async () => {
  try {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Progressor' }], optionalServices: [TINDEQ.service] });
    const srv = await (await dev.gatt.connect()).getPrimaryService(TINDEQ.service);
    const data = await srv.getCharacteristic(TINDEQ.data); DY.ctrl = await srv.getCharacteristic(TINDEQ.control);
    data.addEventListener('characteristicvaluechanged', (e) => { const s = parseTindeq(new Uint8Array(e.target.value.buffer)); if (!s.length) return; DY.samples.push(...s); DY.live = s.at(-1).kg; const el = document.getElementById('dylive'); if (el) el.textContent = `${fr(DY.live)} kg`; });
    await data.startNotifications(); DY.dev = dev; dev.addEventListener('gattserverdisconnected', () => { DY.dev = null; DY.on = false; });
    toast('Dynamomètre connecté'); ACT.dynoOpen();
  } catch (e) { if (e?.name !== 'NotFoundError') toast('Connexion impossible : appareil allumé et proche ?', 4500); }
};
const send = (cmd) => DY.ctrl?.writeValue(new Uint8Array([cmd]));
ACT.dynoTare = async () => { try { await send(TINDEQ.TARE); toast('Remis à zéro'); } catch { toast('Commande non reçue'); } };
ACT.dynoGo = async () => {
  DY.samples = []; DY.result = null; DY.on = true; ACT.dynoOpen();
  try { await send(TINDEQ.START); } catch { DY.on = false; return toast('Commande non reçue'); }
  setTimeout(async () => { try { await send(TINDEQ.STOP); } catch { /* rien */ } DY.on = false; DY.result = pullSummary(DY.samples); if (!DY.result) toast('Aucune mesure reçue.'); ACT.dynoOpen(); }, 7000);
};
ACT.dynoSave = () => { if (!DY.result) return; putItem('perf', 'pf-' + uid().slice(0, 14), { metricId: 'traction_doigts_max', value: DY.result.peak, unit: 'kg', date: Date.now(), source: 'measured', note: `Dynamomètre · moyenne ${fr(DY.result.avg)} kg sur ${fr(DY.result.seconds)} s` }); DY.result = null; closeSheet(); buzzOk(); toast('Pic gardé dans Records et mesures'); render(); };

/* ═════════ Outils de Records et mesures ═════════ */
export function sportTools() {
  return h`<span class="kicker">🧰 Outils</span>${menuList([
    ['rmOpen', '', '🏋️', 'Charges max estimées (1RM)', 'D’après tes séries, et le tableau des pourcentages'],
    ['platesOpen', '', '⚖️', 'Disques sur la barre', 'Quels disques mettre de chaque côté'],
    ['paceOpen', '', '🏃', 'Allures et prévisions de course', 'Depuis ta VMA ou un temps de course'],
    ['lapsOpen', '', '🏊', 'Compteur de longueurs', 'Natation : distance et temps aux 100 m'],
    ['importOpen', '', '📥', 'Importer une activité (GPX, TCX)', 'Depuis ta montre ou ton appli de course'],
  ])}`;
}
ACT.rmOpen = () => {
  const b = strengthBoard(ctx().history), pick = S.rmPick != null ? b[S.rmPick] : null;
  openSheet(h`<div class="stack"><h2 style="margin:0">🏋️ Charges max estimées</h2><p class="tiny muted">Estimation de la charge que tu soulèverais une fois (1RM), d’après ta meilleure série des 6 derniers mois (jusqu’à 12 répétitions ; plus fiable sous 10). Ne teste jamais ton max sans échauffement ni parade.</p>
    ${b.length ? h`<div class="setmenu">${b.map((x, i) => h`<button class="setrow" data-act="rmPick" data-i="${i}"><span class="grow"><b>${x.name} : ≈ ${fr(x.rm)} kg</b><small>d’après ${fr(x.load)} kg × ${x.reps} (${fmtDay(x.date)})</small></span><span class="chev">›</span></button>`)}</div>` : h`<p class="small muted">Note tes charges pendant tes séances : l’estimation apparaîtra ici.</p>`}
    ${pick ? h`<span class="kicker">${pick.name} : charges conseillées</span><div class="setmenu">${percentTable(pick.rm).map((r) => h`<div class="setrow"><span class="grow"><b>${r.pct} % · ${fr(r.kg)} kg</b><small>environ ${r.reps} répétition${r.reps > 1 ? 's' : ''} au maximum</small></span></div>`)}</div>` : ''}
    ${sourcesLine(['lesuer1997'])}</div>`, { wide: true });
};
ACT.rmPick = (el) => { S.rmPick = Number(el.dataset.i); ACT.rmOpen(); };
ACT.platesOpen = () => {
  const q = S.pl ||= { total: 60, bar: 20 }, r = plates(q.total, { bar: q.bar });
  openSheet(h`<div class="stack"><h2 style="margin:0">⚖️ Disques sur la barre</h2>
    <div class="grid2"><label class="small">Charge totale<span class="unitbox"><input type="number" inputmode="decimal" step="0.5" min="0" max="500" value="${q.total}" data-change="plTotal"><em>kg</em></span></label>
      <label class="small">Barre<select data-change="plBar">${[20, 15, 10, 7].map((b) => h`<option value="${b}" ${q.bar === b ? 'selected' : ''}>${b} kg</option>`)}</select></label></div>
    <div class="card flat center"><b class="presc">${r.text}</b>${!r.ok && r.perSide.length ? h`<div class="tiny warn-t">Il manque ${fr(r.rest)} kg de chaque côté avec des disques de 25 à 1,25 kg.</div>` : ''}</div>
    <p class="tiny muted">Disques de 25, 20, 15, 10, 5, 2,5 et 1,25 kg. Mets des colliers de serrage.</p></div>`);
};
CHG.plTotal = (el) => { S.pl.total = Math.max(0, Math.min(500, Number(String(el.value).replace(',', '.')) || 0)); ACT.platesOpen(); };
CHG.plBar = (el) => { S.pl.bar = Number(el.value) || 20; ACT.platesOpen(); };
ACT.paceOpen = () => {
  const c = ctx(), vmaP = c.perfs.find((p) => p.metricId === 'vma' && !p.unknown), q = S.pace ||= { vma: vmaP ? Number(vmaP.value) : 14, d: 10, t: 55 };
  const v = vmaPaces(q.vma), pr = racePredictions(q.t * 60, q.d);
  openSheet(h`<div class="stack"><h2 style="margin:0">🏃 Allures et prévisions</h2>
    <label class="small">Ma VMA ${vmaP ? h`<span class="tiny muted">(dernière mesure : ${fr(vmaP.value)} km/h)</span>` : ''}<span class="unitbox"><input type="number" inputmode="decimal" step="0.5" min="6" max="30" value="${q.vma}" data-change="paceVma"><em>km/h</em></span></label>
    ${v ? h`<div class="setmenu">${v.map(([t, p, a, d]) => h`<div class="setrow"><span class="grow"><b>${t} · ${a}</b><small>${p} — ${d}</small></span></div>`)}</div>` : ''}
    <span class="kicker">Prévoir mes temps depuis une course récente</span>
    <div class="grid2"><label class="small">Distance<select data-change="paceD">${[[5, '5 km'], [10, '10 km'], [21.0975, 'Semi'], [42.195, 'Marathon']].map(([d, l]) => h`<option value="${d}" ${q.d === d ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label class="small">Temps<span class="unitbox"><input type="number" inputmode="decimal" step="0.5" min="5" max="600" value="${q.t}" data-change="paceT"><em>min</em></span></label></div>
    <div class="setmenu">${pr.map((x) => h`<div class="setrow"><span class="grow"><b>${x.label} : ${x.time}</b><small>${x.pace}</small></span></div>`)}</div>
    <p class="tiny muted">Prévision de Riegel : bonne entre 5 km et semi, plus optimiste sur marathon si tu n’as pas l’entraînement long. Repères, pas des promesses.</p>${sourcesLine(['vickers2016'])}
    <button class="btn" data-act="paceRace">🎯 Préparer une course à une date</button></div>`, { wide: true });
};
CHG.paceVma = (el) => { S.pace.vma = Number(String(el.value).replace(',', '.')) || S.pace.vma; ACT.paceOpen(); };
CHG.paceD = (el) => { S.pace.d = Number(el.value); ACT.paceOpen(); };
CHG.paceT = (el) => { S.pace.t = Math.max(5, Number(String(el.value).replace(',', '.')) || S.pace.t); ACT.paceOpen(); };
ACT.paceRace = () => { closeSheet(); go('home', 'cal'); setTimeout(() => ACT.eventGoal?.(), 150); };
/* ───────── Compteur de longueurs ───────── */
ACT.lapsOpen = () => { S.lp ||= { pool: 25, start: 0, taps: [] }; lapsSheet(); };
function lapsSheet() {
  const q = S.lp, r = laps(q.taps, { pool: q.pool, start: q.start || undefined }), mm = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  openSheet(h`<div class="stack"><h2 style="margin:0">🏊 Compteur de longueurs</h2>
    <div class="chips">${[25, 50].map((p) => chip(q.pool === p, `Bassin de ${p} m`, `data-act="lpPool" data-id="${p}"`))}</div>
    <button class="btn pri big laptap" data-act="lpTap">${q.start ? `＋1 longueur (${r.lengths})` : '▶ Départ'}</button>
    <div class="grid3"><div class="stat"><b>${r.distance} m</b><span>distance</span></div><div class="stat"><b>${mm(r.per100)}</b><span>moy. / 100 m</span></div><div class="stat"><b>${mm(r.last100)}</b><span>dernier 100 m</span></div></div>
    <div class="row wrapf"><button class="btn" data-act="lpUndo" ${q.taps.length ? '' : 'disabled'}>↶ Annuler</button><button class="btn" data-act="lpSave" ${q.taps.length ? '' : 'disabled'}>💾 Enregistrer la séance</button><button class="btn ghost" data-act="lpReset">Recommencer</button></div>
    <p class="tiny muted">Touche le gros bouton à chaque mur. Le téléphone dans une pochette étanche, au bord du bassin.</p></div>`);
}
ACT.lpPool = (el) => { S.lp.pool = Number(el.dataset.id); lapsSheet(); };
ACT.lpTap = () => { const q = S.lp; if (!q.start) q.start = Date.now(); else q.taps.push(Date.now()); buzzOk(); lapsSheet(); };
ACT.lpUndo = () => { S.lp.taps.pop(); lapsSheet(); };
ACT.lpReset = () => { S.lp = { pool: S.lp.pool, start: 0, taps: [] }; lapsSheet(); };
ACT.lpSave = () => {
  const q = S.lp, r = laps(q.taps, { pool: q.pool, start: q.start }); if (!r.lengths) return;
  addHistory({ id: uid(), sessionId: '', sessionName: `Natation : ${r.distance} m`, startedAt: q.start, durationSeconds: r.totalSec, data: { rpe: 0, activity: 'swimming', note: `${r.lengths} longueurs de ${q.pool} m${r.per100 ? ` · ${Math.floor(r.per100 / 60)}:${String(r.per100 % 60).padStart(2, '0')} / 100 m en moyenne` : ''}`, exercises: [{ name: 'Nage', group: 'cardio', sets: [{ seconds: r.totalSec, done: true }] }] } });
  S.lp = { pool: q.pool, start: 0, taps: [] }; closeSheet(); buzzOk(); toast('Séance de natation enregistrée'); render();
};
/* ───────── Import GPX / TCX ───────── */
let trackRead = 0, trackState;
function importState() {
  if (!trackState || !accountMatches(trackState.token)) trackState = { token: accountToken(), source: 'file', reading: false, error: '' };
  return trackState;
}
const importedTrack = (id) => S.history.some((x) => x.id === id) || [...S.outbox, ...S.failed].some((x) => x.path === '/api/history' && x.body?.id === id);
ACT.importOpen = (el) => {
  const st = importState(); if (['file', 'strava'].includes(el?.dataset?.source)) st.source = el.dataset.source;
  const t = S.imp && accountMatches(S.imp.owner) ? S.imp : null, duplicate = t && importedTrack(t.id);
  openSheet(h`<div class="stack"><h2 style="margin:0">Importer une activité</h2>
  <p class="small">Choisis un fichier GPX ou TCX exporté de ta montre ou de ton appli. Vérifie le résumé avant de l’ajouter.</p>
  <label class="small">Origine du fichier<select data-change="importSource"><option value="file" ${st.source === 'file' ? 'selected' : ''}>Autre fichier</option><option value="strava" ${st.source === 'strava' ? 'selected' : ''}>Strava</option></select></label>
  <label class="btn pri filebtn">Choisir un fichier<input type="file" accept=".gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml,text/xml,application/xml" data-change="importFile" class="hidden" ${st.reading ? 'disabled' : ''}></label>
  <p id="track-import-status" class="tiny ${st.error ? 'bad-t' : 'muted'}" role="status">${st.reading ? 'Lecture du fichier…' : st.error}</p>
  ${t ? h`<div class="card flat stack tight"><b>${t.name || 'Activité'} · ${new Date(t.start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</b><span class="small">${fmtTime(t.durationSec)} · ${t.distanceKm == null ? 'Distance non renseignée' : `${fr(t.distanceKm)} km`}${t.pace ? ` · ${t.pace}` : ''} · ${t.gain == null ? 'Dénivelé non renseigné' : `D+ ${t.gain} m`}${t.hrAvg ? ` · FC moy. ${t.hrAvg}` : ''}</span>${duplicate ? h`<p class="small muted">Ce fichier est déjà dans ton historique.</p>` : ''}</div>${duplicate ? '' : h`<button class="btn pri" data-act="importSave">Ajouter à mon historique</button>`}` : ''}
  <p class="tiny muted">Le fichier est lu sur ton appareil ; seul son résumé est gardé. Cet import reste privé et n’est pas transmis à l’IA.</p></div>`);
};
CHG.importSource = (el) => { const st = importState(); st.source = el.value === 'strava' ? 'strava' : 'file'; if (S.imp && accountMatches(S.imp.owner)) S.imp.source = st.source; };
CHG.importFile = async (el) => {
  const f = el.files?.[0]; if (!f) return;
  const st = importState(), token = st.token, read = ++trackRead;
  S.imp = null; st.error = ''; st.reading = true;
  const current = () => accountMatches(token) && trackState === st && trackRead === read && el.isConnected;
  const status = document.querySelector('#track-import-status'); if (status) status.textContent = 'Lecture du fichier…';
  document.querySelector('[data-act="importSave"]')?.remove();
  try {
    if (f.size > 25e6) throw new Error('Fichier trop gros (25 Mo au plus).');
    const text = await f.text(); if (!current()) return;
    const t = parseTrack(text); if (!t || t.durationSec <= 0) throw new Error('Fichier non reconnu ou trop détaillé : il faut un GPX ou un TCX horodaté avec au plus 200 000 points.');
    if (t.start > Date.now() + 600000 || t.start < Date.now() - 5 * 365 * 86400000) throw new Error('La date du fichier doit être passée et dater de moins de cinq ans.');
    const [id, fingerprint] = await Promise.all([trackImportId(text, token.owner), trackFingerprint(text)]); if (!current()) return;
    if (!importedTrack(id) && S.history.some((x) => Math.abs(x.startedAt - t.start) < 60000)) toast('Une séance existe déjà à cette heure-là : vérifie le résumé avant de l’ajouter.', 4500);
    S.imp = { ...t, id, fingerprint, owner: token, source: st.source }; st.reading = false; ACT.importOpen();
  } catch (e) { if (!current()) return; st.reading = false; st.error = e.message || 'Impossible de lire ce fichier.'; ACT.importOpen(); }
  finally { if (trackState === st && trackRead === read) st.reading = false; }
};
ACT.importSave = () => {
  const t = S.imp; if (!t || !accountMatches(t.owner)) return;
  if (importedTrack(t.id)) { toast('Ce fichier est déjà dans ton historique.'); return ACT.importOpen(); }
  const st = importState(), act = trackActivity(t), label = { running: 'Course', swimming: 'Natation', conditioning: 'Activité', climbing_route: 'Escalade', climbing_boulder: 'Bloc' }[act] || 'Activité';
  addHistory({ id: t.id, sessionId: '', sessionName: `${label}${t.distanceKm != null ? ` : ${fr(t.distanceKm)} km` : ''} (importée)`, startedAt: t.start, durationSeconds: t.durationSec, data: { rpe: 0, activity: act, external: { provider: st.source, id: t.fingerprint, channel: 'file', private: true, excludeAI: true }, note: [t.name, t.pace, t.gain != null ? `D+ ${t.gain} m` : '', t.hrAvg ? `FC moy. ${t.hrAvg}${t.hrMax ? `, max ${t.hrMax}` : ''}` : ''].filter(Boolean).join(' · ').slice(0, 600), ...(t.hrAvg ? { hr: { avg: t.hrAvg, max: t.hrMax } } : {}), exercises: [{ name: label, group: act.startsWith('climbing') ? 'skill' : 'cardio', sets: [{ seconds: t.durationSec, done: true }] }] } });
  S.imp = null; closeSheet(); buzzOk(); toast('Activité ajoutée à ton historique'); render();
};
