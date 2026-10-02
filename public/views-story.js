// views-story.js — Progrès › « 🌟 Mon parcours » : saison de 4 semaines, lettre à toi-même, ton année en sport,
// avant / après, rapport du mois à imprimer, photos de progrès (gardées sur ce téléphone uniquement).
import { h, openSheet, closeSheet, toast, menuList, chip, fmtDay, ask } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, render, putItem, delItem, itemsOf, idb } from './state.js';
import { uid } from './shared.js';
import { SEASON_THEMES, SEASON_WEEKS, seasonProgress, seasonSuggestion, seasonStart, LETTER_DELAYS, letterOpenAt, letterState, beforeAfter, yearInSport, monthReport } from './story.js';
import { activityLabel } from './brain.js';
import { weekStreak } from './motivation.js';
import { celebrate } from './fx.js';

const fr = (x) => String(Math.round(Number(x) * 10) / 10).replace('.', ',');
const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${fr(Math.abs(x))}`;
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);

/* ───────── Données ───────── */
export const activeSeason = () => itemsOf('season').filter((s) => !s.closed).sort((a, b) => (b.start || 0) - (a.start || 0))[0] || null;
const letters = () => itemsOf('letter').sort((a, b) => (a.openAt || 0) - (b.openAt || 0));
const readyLetters = (now = Date.now()) => letters().filter((l) => letterState(l, now).state === 'ready');

/** Progrès › « 🌟 Mon parcours » : une liste, chaque ligne ouvre sa page. */
export function storyCard() {
  const c = ctx(), s = activeSeason(), sp = s && seasonProgress(s, c), ready = readyLetters(), sealed = letters().filter((l) => letterState(l).state === 'sealed');
  const seasonLine = sp ? (sp.finished ? `Terminée : ${sp.doneWeeks} semaine${sp.doneWeeks > 1 ? 's' : ''} réussie${sp.doneWeeks > 1 ? 's' : ''} sur ${SEASON_WEEKS}` : `${sp.icon} ${sp.label} · semaine ${sp.week}/${SEASON_WEEKS}${sp.left ? ` · encore ${fr(sp.left)} ${sp.unit}${sp.left > 1 && sp.unit !== 'min' ? 's' : ''}` : ' · objectif de la semaine atteint'}`) : '4 semaines, un thème, un petit objectif par semaine';
  return h`<section class="card"><h3>🌟 Mon parcours</h3>${menuList([
    ['seasonOpen', '', '🗓️', sp ? 'Ma saison' : 'Lancer une saison', seasonLine],
    ['letterOpen', '', '✉️', 'Lettre à moi-même', ready.length ? `📬 ${ready.length} lettre${ready.length > 1 ? 's' : ''} à ouvrir` : sealed.length ? `Prochaine ouverture : ${fmtDay(sealed[0].openAt)}` : 'Écris à toi dans 3 mois'],
    ['yearOpen', '', '📅', 'Mon année en sport', 'Tes chiffres, tes sports, tes réussites'],
    ['baOpen', '', '⚖️', 'Avant / après', 'Tes mesures il y a 3, 6 ou 12 mois et aujourd’hui'],
    ['reportOpen', '', '🖨️', 'Rapport du mois', 'À imprimer ou enregistrer en PDF'],
    ['photosOpen', '', '📷', 'Photos de progrès', 'Privées : restent sur ce téléphone'],
  ])}</section>`;
}
/** Accueil : seulement quand il y a quelque chose (lettre à ouvrir, saison terminée ou dernier jour de la semaine). */
export function storyHome() {
  const ready = readyLetters(), s = activeSeason(), sp = s && seasonProgress(s, ctx());
  const rows = [];
  if (ready.length) rows.push(['letterOpen', '', '📬', 'Une lettre de toi est arrivée', `Écrite le ${fmtDay(ready[0].writtenAt)}`]);
  if (sp?.finished) rows.push(['seasonOpen', '', sp.success ? '🏆' : '🗓️', `Saison « ${sp.label} » terminée`, `${sp.doneWeeks} semaine${sp.doneWeeks > 1 ? 's' : ''} sur ${SEASON_WEEKS} réussie${sp.doneWeeks > 1 ? 's' : ''}`]);
  else if (sp && sp.left && new Date().getDay() === 0) rows.push(['seasonOpen', '', sp.icon, `Saison ${sp.label} : dernier jour de la semaine`, `Encore ${fr(sp.left)} ${sp.unit}${sp.left > 1 && sp.unit !== 'min' ? 's' : ''} pour réussir la semaine ${sp.week}`]);
  return rows.length ? menuList(rows) : '';
}

/* ───────── Saison ───────── */
ACT.seasonOpen = () => {
  const c = ctx(), s = activeSeason(), sp = s && seasonProgress(s, c);
  if (!sp) {
    const sug = seasonSuggestion(c), order = [sug.theme, ...Object.keys(SEASON_THEMES).filter((k) => k !== sug.theme)];
    return openSheet(h`<div class="stack"><h2 style="margin:0">🗓️ Lancer une saison</h2>
      <p class="small">4 semaines autour d’un thème, avec un petit objectif chaque semaine. Réussie si tu tiens 3 semaines sur 4. Elle commence ce lundi : ce que tu as déjà fait cette semaine compte.</p>
      <div class="setmenu">${order.map((k) => { const t = SEASON_THEMES[k]; return h`<button class="setrow" data-act="seasonGo" data-id="${k}"><span class="sic">${t.icon}</span><span class="grow"><b>${t.label}${k === sug.theme ? ' · proposé pour toi' : ''}</b><small>${t.goal}${k === sug.theme ? ` — ${sug.reason}` : ` — ${t.why}`}</small></span><span class="chev">›</span></button>`; })}</div></div>`);
  }
  openSheet(h`<div class="stack"><h2 style="margin:0">${sp.icon} Saison ${sp.label}</h2>
    <p class="small">${sp.goal} · du ${fmtDay(sp.start)} au ${fmtDay(sp.end - 86400000)}</p>
    <div class="setmenu">${sp.weeks.map((w) => h`<div class="setrow ${w.done ? 'on' : ''}"><span class="sic">${w.done ? '✅' : w.current ? '▶️' : w.future ? '⏳' : '▫️'}</span><span class="grow"><b>Semaine ${w.n}${w.current ? ' (en cours)' : ''}</b><small>${w.future ? 'pas encore commencée' : `${fr(w.value)} / ${fr(w.target)} ${sp.unit}${w.target > 1 && sp.unit !== 'min' ? 's' : ''}`}</small></span></div>`)}</div>
    ${sp.finished ? h`<p class="small ${sp.success ? 'ok-t' : ''}">${sp.success ? `🏆 Saison réussie : ${sp.doneWeeks} semaines sur ${SEASON_WEEKS}.` : `${sp.doneWeeks} semaine${sp.doneWeeks > 1 ? 's' : ''} sur ${SEASON_WEEKS} : il en fallait 3. Ce n’est pas grave, la suivante sera la bonne.`}</p>
      <button class="btn pri" data-act="seasonClose" data-id="${s.id}">${sp.success ? '🎉 Valider et en lancer une autre' : 'Terminer et en lancer une autre'}</button>`
      : h`<p class="tiny muted">${sp.why} Il reste ${sp.daysLeft} jour${sp.daysLeft > 1 ? 's' : ''}.</p><button class="btn" data-act="seasonStop" data-id="${s.id}">Arrêter cette saison</button>`}</div>`);
};
ACT.seasonGo = (el) => {
  const k = el.dataset.id; if (!SEASON_THEMES[k]) return;
  putItem('season', 'ss-' + uid().slice(0, 14), { theme: k, start: seasonStart(Date.now()), closed: false, won: false });
  closeSheet(); toast(`${SEASON_THEMES[k].icon} Saison ${SEASON_THEMES[k].label} lancée : ${SEASON_THEMES[k].goal}.`, 4000); render();
};
ACT.seasonClose = (el) => {
  const s = itemsOf('season').find((x) => x.id === el.dataset.id); if (!s) return;
  const sp = seasonProgress(s, ctx());
  putItem('season', s.id, { ...strip(s), closed: true, won: !!sp?.success });
  if (sp?.success) celebrate({ n: 120 });
  ACT.seasonOpen();
};
ACT.seasonStop = async (el) => {
  const s = itemsOf('season').find((x) => x.id === el.dataset.id); if (!s) return;
  if (!(await ask('Arrêter cette saison ? Elle ne comptera pas comme réussie.', { ok: 'Arrêter', danger: true }))) return;
  putItem('season', s.id, { ...strip(s), closed: true, won: false }); closeSheet(); render();
};
const strip = (x) => { const { id, _u, ...d } = x; return d; };

/* ───────── Lettre à moi-même ───────── */
ACT.letterOpen = () => {
  const now = Date.now(), list = letters();
  openSheet(h`<div class="stack"><h2 style="margin:0">✉️ Lettre à moi-même</h2>
    <p class="small">Écris à la personne que tu seras dans quelques mois : ce que tu veux avoir accompli, comment tu te sens. La lettre reste scellée jusqu’à la date choisie.</p>
    ${list.length ? h`<div class="setmenu">${list.map((l) => { const st = letterState(l, now); return h`<button class="setrow" data-act="letterRead" data-id="${l.id}"><span class="sic">${st.state === 'sealed' ? '🔒' : st.state === 'ready' ? '📬' : '📖'}</span><span class="grow"><b>Écrite le ${fmtDay(l.writtenAt)}</b><small>${st.state === 'sealed' ? `S’ouvre le ${fmtDay(l.openAt)} (dans ${st.days} jour${st.days > 1 ? 's' : ''})` : st.state === 'ready' ? 'Prête à être ouverte' : `Ouverte le ${fmtDay(l.openedAt)}`}</small></span><span class="chev">›</span></button>`; })}</div>` : ''}
    <form class="stack" data-submit="letterSave"><label>Ta lettre<textarea name="text" rows="6" maxlength="3000" required placeholder="Salut, moi dans 3 mois… J’espère que tu as…"></textarea></label>
      <span class="small">À ouvrir dans</span><div class="chips">${LETTER_DELAYS.map(([m, l]) => h`<label class="chip ${m === 3 ? 'on' : ''}"><input type="radio" class="hidden" name="months" value="${m}" ${m === 3 ? 'checked' : ''} data-change="radioChip">${l}</label>`)}</div>
      <button class="btn pri">🔒 Sceller la lettre</button></form></div>`);
};
CHG.radioChip = (el) => { el.closest('.chips')?.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.contains(el) && el.checked)); };
SUBMIT.letterSave = (form) => {
  const fd = new FormData(form), text = String(fd.get('text') || '').trim().slice(0, 3000), months = [1, 3, 6, 12].includes(Number(fd.get('months'))) ? Number(fd.get('months')) : 3;
  if (!text) return toast('Écris quelques mots d’abord.', 3000, 'bad');
  const c = ctx(), now = Date.now(), st = weekStreak(c.history, c.ascents, { goal: 2, now });
  const snap = `${c.history.length} séance${c.history.length > 1 ? 's' : ''} enregistrée${c.history.length > 1 ? 's' : ''}${st.streak ? `, série de ${st.streak} semaine${st.streak > 1 ? 's' : ''}` : ''}`;
  putItem('letter', 'lt-' + uid().slice(0, 14), { text, writtenAt: now, openAt: letterOpenAt(now, months), openedAt: 0, snap });
  toast(`🔒 Lettre scellée : elle s’ouvrira le ${fmtDay(letterOpenAt(now, months))}.`, 4000); ACT.letterOpen();
};
ACT.letterRead = async (el) => {
  const l = letters().find((x) => x.id === el.dataset.id); if (!l) return;
  const st = letterState(l);
  if (st.state === 'sealed') {
    return openSheet(h`<div class="stack"><h2 style="margin:0">🔒 Lettre scellée</h2><p class="small">Elle s’ouvrira le ${fmtDay(l.openAt)}. Patience : c’est tout l’intérêt !</p>
      <div class="row wrapf"><button class="btn" data-act="letterOpen">‹ Retour</button><button class="btn danger" data-act="letterDel" data-id="${l.id}">Supprimer</button></div></div>`);
  }
  if (st.state === 'ready') { putItem('letter', l.id, { ...strip(l), openedAt: Date.now() }); celebrate({ n: 60 }); }
  const c = ctx(), now = c.history.length;
  openSheet(h`<div class="stack"><h2 style="margin:0">📖 Ta lettre du ${fmtDay(l.writtenAt)}</h2>
    <div class="card flat"><p class="small" style="white-space:pre-wrap">${l.text}</p></div>
    ${l.snap ? h`<p class="tiny muted">À l’époque : ${l.snap}. Aujourd’hui : ${now} séance${now > 1 ? 's' : ''} enregistrée${now > 1 ? 's' : ''}.</p>` : ''}
    <div class="row wrapf"><button class="btn" data-act="letterOpen">‹ Retour</button><button class="btn danger" data-act="letterDel" data-id="${l.id}">Supprimer</button></div></div>`);
};
ACT.letterDel = async (el) => {
  if (!(await ask('Supprimer cette lettre ?', { ok: 'Supprimer', danger: true }))) return;
  delItem('letter', el.dataset.id); ACT.letterOpen();
};

/* ───────── Mon année en sport ───────── */
ACT.yearOpen = (el) => {
  const c = ctx(), cur = new Date().getFullYear(), years = [...new Set(c.history.map((x) => new Date(x.startedAt).getFullYear()))].sort((a, b) => b - a);
  const y = Number(el?.dataset?.id) || S.storyYear || cur; S.storyYear = y;
  const r = yearInSport(c, y);
  const max = Math.max(1, ...r.byMonth);
  openSheet(h`<div class="stack"><h2 style="margin:0">📅 Mon année ${y}</h2>
    ${years.length > 1 ? h`<div class="chips">${years.slice(0, 5).map((x) => chip(x === y, String(x), `data-act="yearOpen" data-id="${x}"`))}</div>` : ''}
    ${!r.sessions && !r.sends ? h`<p class="small muted">Rien d’enregistré en ${y} pour l’instant.</p>` : h`
    <div class="grid2">${[[r.sessions, r.sessions > 1 ? 'séances' : 'séance'], [hm(r.minutes), 'd’entraînement'], [r.days, r.days > 1 ? 'jours actifs' : 'jour actif'], [r.weeks, r.weeks > 1 ? 'semaines actives' : 'semaine active']].map(([v, l]) => h`<div class="stat"><b>${v}</b><span>${l}</span></div>`)}</div>
    <div class="yearbars" aria-label="Séances par mois">${r.byMonth.map((n, i) => h`<div class="ybar" title="${n}"><i style="height:${Math.round((n / max) * 100)}%"></i><span>${'JFMAMJJASOND'[i]}</span></div>`)}</div>
    <div class="setmenu">
      ${r.bestMonth ? h`<div class="setrow"><span class="sic">⭐</span><span class="grow"><b>Mois le plus actif : ${r.bestMonth.label}</b><small>${r.bestMonth.n} séance${r.bestMonth.n > 1 ? 's' : ''}</small></span></div>` : ''}
      ${r.sports.length ? h`<div class="setrow"><span class="sic">🏅</span><span class="grow"><b>Tes sports</b><small>${r.sports.slice(0, 4).map((x) => `${activityLabel(x.id, c)} ×${x.n}`).join(' · ')}</small></span></div>` : ''}
      ${r.sends ? h`<div class="setrow"><span class="sic">🧗</span><span class="grow"><b>${r.sends} bloc${r.sends > 1 ? 's' : ''} ou voie${r.sends > 1 ? 's' : ''} réussi${r.sends > 1 ? 's' : ''}</b><small>${[r.firstTry ? `${r.firstTry} du premier coup` : '', r.bestBloc ? `meilleur bloc ${r.bestBloc}` : '', r.bestVoie ? `meilleure voie ${r.bestVoie}` : ''].filter(Boolean).join(' · ') || ' '}</small></span></div>` : ''}
      ${r.newExercises ? h`<div class="setrow"><span class="sic">🆕</span><span class="grow"><b>${r.newExercises} exercice${r.newExercises > 1 ? 's' : ''} découvert${r.newExercises > 1 ? 's' : ''}</b><small>jamais faits avant ${y}</small></span></div>` : ''}
      ${r.places ? h`<div class="setrow"><span class="sic">📍</span><span class="grow"><b>${r.places} lieu${r.places > 1 ? 'x' : ''}</b><small>salles, falaises, maison…</small></span></div>` : ''}
      ${r.longest ? h`<div class="setrow"><span class="sic">⏱</span><span class="grow"><b>Plus longue séance : ${hm(Math.round(r.longest / 60))}</b></span></div>` : ''}
    </div>
    ${r.moved.length ? h`<span class="kicker">Ce qui a bougé</span><div class="setmenu">${r.moved.map((m) => h`<div class="setrow"><span class="sic">${m.good === true ? '📈' : m.good === false ? '📉' : '↕️'}</span><span class="grow"><b>${m.label}</b><small>${fr(m.first)} → ${fr(m.last)} ${m.unit} (${signed(m.diff)})</small></span></div>`)}</div>` : ''}
    <button class="btn" data-act="yearPrint">🖨️ Imprimer ou enregistrer en PDF</button>`}</div>`, { wide: true });
};
ACT.yearPrint = () => { const c = ctx(), r = yearInSport(c, S.storyYear || new Date().getFullYear()); printDoc(h`<h1>Mon année ${r.year} en sport</h1><p>${r.sessions} séances · ${hm(r.minutes)} · ${r.days} jours actifs · ${r.weeks} semaines actives</p>
  ${r.bestMonth ? h`<p>Mois le plus actif : ${r.bestMonth.label} (${r.bestMonth.n} séances)</p>` : ''}${r.sports.length ? h`<p>Sports : ${r.sports.map((x) => `${activityLabel(x.id, c)} ×${x.n}`).join(', ')}</p>` : ''}
  ${r.sends ? h`<p>${r.sends} blocs ou voies réussis${r.bestBloc ? ` · meilleur bloc ${r.bestBloc}` : ''}${r.bestVoie ? ` · meilleure voie ${r.bestVoie}` : ''}</p>` : ''}
  ${r.moved.length ? h`<h2>Ce qui a bougé</h2><table><tbody>${r.moved.map((m) => h`<tr><td>${m.label}</td><td>${fr(m.first)} → ${fr(m.last)} ${m.unit}</td><td>${signed(m.diff)}</td></tr>`)}</tbody></table>` : ''}`); };

/* ───────── Avant / après ───────── */
ACT.baOpen = (el) => {
  const m = [3, 6, 12].includes(Number(el?.dataset?.id)) ? Number(el.dataset.id) : S.baMonths || 3; S.baMonths = m;
  const rows = beforeAfter(ctx(), m);
  openSheet(h`<div class="stack"><h2 style="margin:0">⚖️ Avant / après</h2>
    <div class="chips">${[3, 6, 12].map((x) => chip(x === m, x === 12 ? '1 an' : `${x} mois`, `data-act="baOpen" data-id="${x}"`))}</div>
    ${rows.length ? h`<div class="setmenu">${rows.map((r) => h`<div class="setrow"><span class="sic">${r.good === true ? '📈' : r.good === false ? '📉' : '↕️'}</span><span class="grow"><b>${r.label}</b><small>${fr(r.before)} → ${fr(r.after)} ${r.unit} · ${r.diff ? `${signed(r.diff)} ${r.unit}${r.pct != null ? ` (${signed(r.pct)} %)` : ''}` : 'stable'} · ${fmtDay(r.beforeAt)} → ${fmtDay(r.afterAt)}</small></span></div>`)}</div>
      <p class="tiny muted">📈 / 📉 : mieux ou moins bien pour cette mesure ; ↕️ : ça dépend de ton objectif (poids, tours…). Mesure toujours avec le même appareil, au même moment de la journée : sinon l’écart peut venir de la mesure.</p>`
      : h`<p class="small muted">Pas encore assez de mesures : il faut une valeur notée il y a environ ${m === 12 ? 'un an' : `${m} mois`} et une plus récente. Note tes mesures dans Profil › Records et mesures.</p>`}
    <button class="btn" data-act="photosOpen">📷 Comparer mes photos</button></div>`, { wide: true });
};

/* ───────── Rapport du mois (imprimable) ───────── */
ACT.reportOpen = (el) => {
  const back = Number(el?.dataset?.id || 0) === 1 ? 1 : 0, d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); S.reportAt = d.getTime();
  const r = monthReport(ctx(), d.getTime());
  openSheet(h`<div class="stack"><h2 style="margin:0">🖨️ Rapport du mois</h2>
    <div class="chips">${chip(!back, 'Ce mois-ci', 'data-act="reportOpen" data-id="0"')}${chip(back === 1, 'Mois dernier', 'data-act="reportOpen" data-id="1"')}</div>
    <div class="card flat">${reportBody(r)}</div>
    <button class="btn pri" data-act="reportPrint">🖨️ Imprimer ou enregistrer en PDF</button>
    <p class="tiny muted">Dans la fenêtre d’impression, choisis « Enregistrer en PDF » pour garder le fichier ou l’envoyer (à ton coach, par exemple).</p></div>`, { wide: true });
};
function reportBody(r) {
  const c = ctx();
  return h`<h3 style="margin-top:0">${r.label.charAt(0).toUpperCase() + r.label.slice(1)}</h3>
    <p class="small">${r.sessions.length} séance${r.sessions.length > 1 ? 's' : ''} · ${hm(r.minutes)} · ${r.days} jour${r.days > 1 ? 's' : ''} actif${r.days > 1 ? 's' : ''}${r.rpe ? ` · ressenti moyen ${fr(r.rpe)} / 5` : ''}${r.attempts ? ` · ${r.sends} / ${r.attempts} blocs ou voies réussis` : ''}</p>
    ${r.checkins ? h`<p class="small">${r.checkins} check-in${r.checkins > 1 ? 's' : ''}${r.sleep ? ` · sommeil moyen ${fr(r.sleep)} h` : ''}${r.energy ? ` · énergie moyenne ${fr(r.energy)} / 5` : ''}${r.pains ? ` · ${r.pains} douleur${r.pains > 1 ? 's' : ''} notée${r.pains > 1 ? 's' : ''}` : ''}</p>` : ''}
    ${r.sessions.length ? h`<table class="rtable"><thead><tr><th>Date</th><th>Séance</th><th>Durée</th><th>Ressenti</th></tr></thead><tbody>${r.sessions.map((s) => h`<tr><td>${new Date(s.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td><td>${s.name}${s.activity ? h`<br><small>${activityLabel(s.activity, c)}</small>` : ''}</td><td>${s.minutes} min</td><td>${s.rpe ? `${s.rpe} / 5` : '—'}</td></tr>`)}</tbody></table>` : h`<p class="small muted">Aucune séance ce mois-ci.</p>`}
    ${r.perfs.length ? h`<h4>Mesures et tests</h4><table class="rtable"><tbody>${r.perfs.map((p) => h`<tr><td>${new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td><td>${p.label}</td><td>${fr(p.value)} ${p.unit}</td></tr>`)}</tbody></table>` : ''}`;
}
ACT.reportPrint = () => printDoc(reportBody(monthReport(ctx(), S.reportAt || Date.now())));
/** Impression : seule la zone du rapport est imprimée (le reste de l'app est masqué par la feuille de style). */
export function printDoc(content) {
  let z = document.getElementById('printzone');
  if (!z) { z = document.createElement('div'); z.id = 'printzone'; document.body.appendChild(z); }
  z.innerHTML = h`<div class="printdoc">${content}<p class="pfoot">Séances entraînement · imprimé le ${fmtDay(Date.now())} · tes données uniquement, ce n’est pas un avis médical.</p></div>`.s;
  document.documentElement.classList.add('printing');
  const done = () => { document.documentElement.classList.remove('printing'); z.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch { done(); toast('Impression impossible sur cet appareil.', 3500, 'bad'); }
}

/* ───────── Photos de progrès (sur cet appareil uniquement) ───────── */
const POSES = [['face', 'De face'], ['profil', 'De profil'], ['dos', 'De dos']];
const pkey = () => `photos:${S.user?.id || 'guest'}`;
async function photoIndex() { try { return (await idb.get(pkey())) || []; } catch { return []; } }
async function photoData(id) { try { return await idb.get(`${pkey()}:${id}`); } catch { return null; } }
ACT.photosOpen = async () => {
  const list = (await photoIndex()).sort((a, b) => b.at - a.at), pose = S.photoPose || 'face', sel = S.photoSel || [];
  const shown = list.filter((p) => !S.photoFilter || p.pose === S.photoFilter);
  const thumbs = await Promise.all(shown.slice(0, 40).map(async (p) => ({ ...p, data: S.photoShow ? await photoData(p.id) : null })));
  openSheet(h`<div class="stack"><h2 style="margin:0">📷 Photos de progrès</h2>
    <p class="small">🔒 Elles restent sur ce téléphone : jamais envoyées sur le serveur, jamais visibles par quelqu’un d’autre. Si tu effaces les données du navigateur ou changes de téléphone, elles disparaissent.</p>
    <span class="small">Pose de la prochaine photo</span><div class="chips">${POSES.map(([k, l]) => chip(pose === k, l, `data-act="photoPose" data-id="${k}"`))}</div>
    <label class="btn pri">📸 Ajouter une photo<input type="file" accept="image/*" capture="user" class="hidden" data-change="photoAdd"></label>
    ${list.length ? h`<div class="row between wrapf"><div class="chips">${chip(!S.photoFilter, 'Toutes', 'data-act="photoFilter" data-id=""')}${POSES.map(([k, l]) => chip(S.photoFilter === k, l, `data-act="photoFilter" data-id="${k}"`))}</div>
      <button class="btn sm" data-act="photoShow">${S.photoShow ? '🙈 Masquer' : '👁 Afficher'}</button></div>
      <p class="tiny muted">Touche deux photos pour les comparer côte à côte.</p>
      <div class="pgrid">${thumbs.map((p) => h`<button class="pthumb ${sel.includes(p.id) ? 'on' : ''}" data-act="photoPick" data-id="${p.id}" aria-label="Photo du ${fmtDay(p.at)}">${p.data ? h`<img src="${p.data}" alt="">` : h`<span>🔒</span>`}<small>${fmtDay(p.at)}</small></button>`)}</div>
      ${sel.length === 2 ? h`<button class="btn pri" data-act="photoCompare">↔️ Comparer les 2 photos</button>` : ''}` : h`<p class="small muted">Aucune photo pour l’instant. Prends-en une tous les mois, même pose, même lumière : la comparaison sera parlante.</p>`}</div>`, { wide: true });
};
ACT.photoPose = (el) => { S.photoPose = el.dataset.id; ACT.photosOpen(); };
ACT.photoFilter = (el) => { S.photoFilter = el.dataset.id; S.photoSel = []; ACT.photosOpen(); };
ACT.photoShow = () => { S.photoShow = !S.photoShow; ACT.photosOpen(); };
ACT.photoPick = (el) => { const id = el.dataset.id, sel = S.photoSel || []; S.photoSel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-2); if (!S.photoShow) S.photoShow = true; ACT.photosOpen(); };
CHG.photoAdd = async (el) => {
  const f = el.files?.[0]; if (!f) return;
  if (!/^image\//.test(f.type)) return toast('Ce fichier n’est pas une image.', 3000, 'bad');
  try {
    const data = await shrink(f, 1100), id = uid().slice(0, 14), list = await photoIndex();
    await idb.set(`${pkey()}:${id}`, data); await idb.set(pkey(), [...list, { id, at: Date.now(), pose: S.photoPose || 'face' }]);
    toast('📷 Photo gardée sur ce téléphone.', 3000); S.photoShow = true; ACT.photosOpen();
  } catch (e) { toast(`Photo non enregistrée : ${e?.message || 'stockage plein ou indisponible'}.`, 4500, 'bad'); }
};
async function shrink(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image illisible')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
ACT.photoCompare = async () => {
  const list = await photoIndex(), [a, b] = (S.photoSel || []).map((id) => list.find((p) => p.id === id)).filter(Boolean).sort((x, y) => x.at - y.at);
  if (!a || !b) return ACT.photosOpen();
  const [da, db] = await Promise.all([photoData(a.id), photoData(b.id)]), days = Math.round((b.at - a.at) / 86400000);
  openSheet(h`<div class="stack"><h2 style="margin:0">↔️ Avant / après</h2><p class="small">${days} jour${days > 1 ? 's' : ''} d’écart</p>
    <div class="pcompare">${[[a, da], [b, db]].map(([p, d]) => h`<figure>${d ? h`<img src="${d}" alt="Photo du ${fmtDay(p.at)}">` : h`<span>Photo introuvable</span>`}<figcaption>${fmtDay(p.at)}<br><button class="btn sm danger" data-act="photoDel" data-id="${p.id}">Supprimer</button></figcaption></figure>`)}</div>
    <button class="btn" data-act="photosOpen">‹ Toutes les photos</button></div>`, { wide: true });
};
ACT.photoDel = async (el) => {
  if (!(await ask('Supprimer cette photo de ce téléphone ? Elle ne pourra pas être récupérée.', { ok: 'Supprimer', danger: true }))) return;
  const id = el.dataset.id, list = await photoIndex();
  try { await idb.del(`${pkey()}:${id}`); await idb.set(pkey(), list.filter((p) => p.id !== id)); } catch (e) { return toast(`Suppression impossible : ${e?.message || 'stockage indisponible'}.`, 4000, 'bad'); }
  S.photoSel = (S.photoSel || []).filter((x) => x !== id); ACT.photosOpen();
};
