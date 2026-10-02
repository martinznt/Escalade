// views-forme.js — le coach qui apprend, côté écran :
//  · Accueil › « Forme du jour » : check-in du matin (10 s), prêt du jour expliqué, séance légère si besoin ;
//  · Profil › Mon corps et mes préférences › « Douleurs » : carte sur le bonhomme, suivi par zone, étapes de reprise ;
//  · Progrès › « Ce que l’app a appris sur toi » : forme et fatigue, plateaux et pistes, équilibre pousser / tirer,
//    règles apprises, charge par zone, prévisions des objectifs, récupération.
// Tout vient des données de la personne (coachbrain.js, testé) ; ce sont des repères, jamais un diagnostic.
import { h, raw, openSheet, closeSheet, toast, menuList, lineChart, fmtDay, relDate, ymd, buzzOk } from './ui.js';
import { S, ACT, SUBMIT, INPUT, ctx, render, putItem, item } from './state.js';
import { uid } from './shared.js';
import { readiness, plateaus, muscleBalance, learnedRules, zoneLoad, painTrend, activePains, painToUpdate, forecast, RETURN_STEPS, ZONE_LABEL, ZONE_EMOJI, HARD_DAY_CHECKLIST } from './coachbrain.js';
import { painMapSvg, PAIN_ZONES } from './anatomy.js';
import { sourcesLine } from './srcui.js';
import { activeGoals, goalLabel } from './brain.js';
import { openWizard } from './views-climbplan.js';

const DAY = 86400000;
const num = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const todayKey = () => ymd(new Date());
const todayCheck = () => { const w = item('wellness', 'wb-' + todayKey()); return w && Date.now() - (w.at || 0) < 20 * 3600000 ? w : null; };
const cycleOn = () => !!item('config', 'coach')?.cycle;
const LEVEL_TAG = { top: 'ok', ok: 'warn', low: 'bad' };
const ZONES_ALL = [...PAIN_ZONES, 'other'];
const zoneName = (z) => `${ZONE_EMOJI[z] || ''} ${(ZONE_LABEL[z] || z).replace(/^./, (c) => c.toUpperCase())}`.trim();

/* ═════════ Accueil : Forme du jour ═════════ */
export function formeBlock() {
  const c = ctx(), r = readiness(c), upd = painToUpdate(c.pains, c.now)[0], known = r.checked || r.ff.enough;
  return h`<section class="card stack forme">
    <div class="row between wrapf"><h3 style="margin:0">🔋 Forme du jour</h3>${known ? h`<span class="tag ${LEVEL_TAG[r.level]}">${r.emoji} ${r.word}</span>` : ''}</div>
    <p class="small">${r.checked ? r.advice : known ? `D’après tes séances : ${r.advice.charAt(0).toLowerCase() + r.advice.slice(1)} Fais le check-in pour une estimation plus juste.` : '10 secondes pour dire comment tu te sens : les séances proposées s’adaptent.'}</p>
    <div class="row wrapf"><button class="btn ${r.checked ? 'sm' : 'pri'}" data-act="checkin">${r.checked ? '✏️ Modifier mon check-in' : '☀️ Check-in du matin'}</button>
      <button class="btn sm" data-act="formeWhy">🔎 Pourquoi ?</button><button class="btn sm" data-act="painNew">🩹 J’ai mal</button></div>
    ${r.checked && r.level === 'low' ? h`<button class="btn" data-act="formeLight">🧘 Préparer une séance légère</button>` : ''}
    ${r.over.length ? h`<p class="tiny warn-t">⚠️ ${r.over[0].text}</p>` : ''}
    ${upd ? h`<button class="linkish small" data-act="painZone" data-id="${upd.zone}">🩹 Comment vont tes ${upd.label} ? Dernière note : ${upd.last}/10, ${relDate(upd.date)}.</button>` : ''}</section>`;
}
const SLEEP = [[4, '≤ 4 h'], [5, '5 h'], [6, '6 h'], [7, '7 h'], [8, '8 h'], [9, '9 h'], [10, '≥ 10 h']];
const ENERGY = [[1, '😵 Vide'], [2, '😴 Basse'], [3, '🙂 Normale'], [4, '💪 Bonne'], [5, '⚡ Au top']];
const SORE = [[1, 'Aucune'], [2, 'Légères'], [3, 'Moyennes'], [4, 'Fortes'], [5, 'Très fortes']];
const STRESS = [[1, '😌 Zen'], [2, 'Calme'], [3, 'Normal'], [4, 'Stressé'], [5, '😣 Très stressé']];
const pickRow = (k, label, opts, cur) => h`<div class="stack tight"><b class="small">${label}</b><input type="hidden" name="${k}" value="${cur ?? ''}">
  <div class="chips" role="radiogroup" aria-label="${label}">${opts.map(([v, l]) => h`<button type="button" role="radio" aria-checked="${cur === v}" class="chip ${cur === v ? 'on' : ''}" data-act="ciPick" data-k="${k}" data-v="${v}">${l}</button>`)}</div></div>`;
ACT.ciPick = (el) => {
  const f = el.closest('form'); if (!f) return;
  const inp = f.elements[el.dataset.k], same = inp.value === el.dataset.v; inp.value = same ? '' : el.dataset.v; // retoucher = effacer
  for (const b of el.parentElement.children) { const on = !same && b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
};
ACT.checkin = () => {
  const w = todayCheck() || {};
  openSheet(h`<form class="stack" data-submit="checkinSave"><h2 style="margin:0">☀️ Check-in du matin</h2>
    <p class="tiny muted">Réponds à ce que tu veux (touche à nouveau pour effacer). Ça sert à adapter les séances proposées et à apprendre ce qui te réussit.</p>
    ${pickRow('sleep', '😴 Sommeil cette nuit', SLEEP, w.sleep ?? null)}${pickRow('energy', '🔋 Énergie', ENERGY, w.energy ?? null)}
    ${pickRow('soreness', '🦵 Courbatures', SORE, w.soreness ?? null)}${pickRow('stress', '🧠 Stress', STRESS, w.stress ?? null)}
    <details class="how mini" ${w.hr ? 'open' : ''}><summary>❤️ Test de forme 30 s (pouls au repos, facultatif)</summary>
      <p class="tiny">Au réveil, encore allongé : compte tes battements pendant 30 secondes (au poignet ou au cou), puis multiplie par 2. Un pouls nettement plus haut que d’habitude (+7 ou plus) peut signaler de la fatigue, du stress ou un début de maladie.</p>
      <label class="small">Pouls au repos<span class="unitbox"><input type="number" inputmode="numeric" name="hr" min="25" max="220" step="1" value="${w.hr ?? ''}"><em>batt./min</em></span></label></details>
    ${cycleOn() ? h`<label class="row small"><input type="checkbox" name="period" ${w.period ? 'checked' : ''}> 🩸 Règles aujourd’hui <span class="tiny muted">(privé, pour apprendre ton ressenti)</span></label>` : ''}
    <label class="small">Note <span class="tiny muted">(facultatif)</span><input name="note" maxlength="300" value="${w.note || ''}" placeholder="Ex. mal dormi, journée chargée…"></label>
    <button class="btn pri big">Enregistrer</button></form>`, { wide: true });
};
SUBMIT.checkinSave = (f) => {
  const d = Object.fromEntries(new FormData(f)), n = (k) => (String(d[k] ?? '').trim() === '' ? null : Number(d[k]));
  const v = { day: todayKey(), at: Date.now(), sleep: n('sleep'), energy: n('energy'), soreness: n('soreness'), stress: n('stress'), hr: n('hr'), period: d.period === 'on', note: String(d.note || '').trim().slice(0, 300) };
  if (v.hr != null && !(v.hr >= 25 && v.hr <= 220)) return toast('Pouls au repos : entre 25 et 220 battements par minute.', 3500, 'bad');
  if ([v.sleep, v.energy, v.soreness, v.stress, v.hr].every((x) => x == null) && !v.note) return toast('Réponds au moins à une question.');
  putItem('wellness', 'wb-' + v.day, v); closeSheet(); buzzOk();
  const r = readiness(ctx()); toast(`${r.emoji} ${r.word} — ${r.advice}`, 4200); render();
};
ACT.formeLight = () => openWizard({ forme: 'tired', minutes: Math.min(30, S.settings.defaultMinutes || 30) });

/** Forme et fatigue sur 60 jours : trait plein = forme, pointillés = fatigue (lisible sans couleur). */
function ffChart(series) {
  if (series.length < 2 || !series.some((p) => p.fitness > 0)) return '';
  const W = 300, H = 120, max = Math.max(1, ...series.flatMap((p) => [p.fitness, p.fatigue]));
  const x = (i) => 10 + (i / (series.length - 1)) * (W - 20), y = (v) => H - 18 - (v / max) * (H - 32);
  const line = (k) => series.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  return raw(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Forme et fatigue sur 60 jours"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${line('fitness')}"/><polyline fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 3" points="${line('fatigue')}"/><text x="10" y="${H - 3}" font-size="10" fill="var(--muted)">il y a 60 j</text><text x="${W - 10}" y="${H - 3}" font-size="10" fill="var(--muted)" text-anchor="end">aujourd’hui</text></svg>`);
}
ACT.formeWhy = () => {
  const c = ctx(), r = readiness(c), why = r.why.filter((w) => !/^⚠️/.test(w));
  openSheet(h`<div class="stack"><h2 style="margin:0">🔋 Forme du jour : ${r.emoji} ${r.word}</h2><p class="small">${r.advice}</p>
    <span class="kicker">Ce qui compte aujourd’hui</span><ul class="clean tight small">${why.map((w) => h`<li>• ${w}</li>`)}</ul>
    ${r.over.length ? h`<div class="card flat warn-b"><b class="small">⚠️ Charge en hausse</b>${r.over.map((z) => h`<p class="tiny">${z.text}</p>`)}${sourcesLine(['gabbett2016'])}</div>` : ''}
    ${r.ff.enough ? h`<span class="kicker">Forme et fatigue (60 jours)</span>${ffChart(r.ff.series)}<p class="tiny muted">Trait plein : ta forme (ce que 6 semaines de séances ont construit). Pointillés : ta fatigue (ce que les derniers jours ont laissé). Quand la fatigue passe sous la forme, tu es frais. Calcul : durée × ressenti de chaque séance.</p>` : ''}
    ${r.level === 'top' ? h`<span class="kicker">Avant une séance dure</span><ul class="clean tight small">${HARD_DAY_CHECKLIST.map((x) => h`<li>☐ ${x}</li>`)}</ul>` : ''}
    ${sourcesLine(['halson2014'])}
    <div class="grid2"><button class="btn" data-act="checkin">☀️ Check-in</button><button class="btn" data-act="coachRecovery">😴 Récupération</button></div>
    <p class="tiny muted">Repères calculés sur tes données, pas un avis médical.</p></div>`, { wide: true });
};

/* ═════════ Douleurs ═════════ */
const SIDES = [['', 'Sans objet'], ['gauche', 'Gauche'], ['droite', 'Droite'], ['deux', 'Les deux']];
const WHEN = [['', '—'], ['repos', 'Même au repos'], ['effort', 'Pendant l’effort'], ['apres', 'Après l’effort'], ['matin', 'Le matin']];
const levelWord = (l) => (l >= 7 ? 'forte' : l >= 4 ? 'moyenne' : l >= 1 ? 'légère' : 'aucune');
ACT.painTap = (el) => { const t = painTrend(ctx().pains, Date.now()).find((x) => x.zone === el.dataset.id); return t ? ACT.painZone(el) : ACT.painNew(el); };
ACT.painNew = (el) => {
  const z0 = el?.dataset?.id && ZONES_ALL.includes(el.dataset.id) ? el.dataset.id : '';
  openSheet(h`<form class="stack" data-submit="painSave"><h2 style="margin:0">🩹 Noter une douleur</h2>
    <p class="tiny muted">La zone est ménagée dans les séances proposées tant que la douleur est à 3/10 ou plus (7 jours), et tu suis ta reprise étape par étape.</p>
    ${pickRow('zone', 'Où ?', ZONES_ALL.map((z) => [z, zoneName(z)]), z0 || null)}
    <label class="small"><b>Intensité</b> <output name="lvo">${3}</output>/10
      <input type="range" name="level" min="0" max="10" step="1" value="3" data-input="painLvl" aria-label="Intensité de 0 à 10"></label>
    <p class="tiny muted">0 : rien · 1–3 : gêne légère · 4–6 : douleur moyenne · 7–10 : forte.</p>
    <label class="small">Côté<select name="side">${SIDES.map(([v, l]) => h`<option value="${v}">${l}</option>`)}</select></label>
    <label class="small">Quand ?<select name="when">${WHEN.map(([v, l]) => h`<option value="${v}">${l}</option>`)}</select></label>
    <label class="small">Note <span class="tiny muted">(facultatif)</span><input name="note" maxlength="300" placeholder="Ex. en tirant sur les petites réglettes"></label>
    <p class="tiny warn-t">Douleur forte, qui dure plus de 2 semaines, gonflement, fourmillements, perte de force ou douleur après une chute : consulte un professionnel de santé.</p>
    <button class="btn pri big">Enregistrer</button></form>`, { wide: true });
};
INPUT.painLvl = (el) => { const o = el.form?.elements?.lvo; if (o) o.value = el.value; };
SUBMIT.painSave = (f) => {
  const d = Object.fromEntries(new FormData(f));
  if (!ZONES_ALL.includes(d.zone)) return toast('Choisis où tu as mal.');
  const level = Math.max(0, Math.min(10, Math.round(Number(d.level) || 0)));
  putItem('pain', 'pn-' + uid().slice(0, 14), { zone: d.zone, level, side: d.side || '', when: d.when || '', date: Date.now(), note: String(d.note || '').trim().slice(0, 300), healed: false });
  closeSheet(); buzzOk(); toast(level >= 3 ? `Noté : ${ZONE_LABEL[d.zone]} ${level}/10. Cette zone est ménagée dans les séances proposées.` : `Noté : ${ZONE_LABEL[d.zone]} ${level}/10.`, 4000); render();
};
ACT.painZone = (el) => {
  const z = el.dataset.id, t = painTrend(ctx().pains, Date.now()).find((x) => x.zone === z);
  if (!t) return ACT.painNew(el);
  const list = ctx().pains.filter((p) => p.zone === z).sort((a, b) => b.date - a.date).slice(0, 12);
  openSheet(h`<div class="stack"><h2 style="margin:0">${zoneName(z)}</h2>
    <p class="small">Dernière note : <b>${t.last}/10</b> (${levelWord(t.last)}), ${relDate(t.date)}${t.n >= 2 ? (t.dir < 0 ? ' · en baisse 👍' : t.dir > 0 ? ' · en hausse' : ' · stable') : ''}.</p>
    ${t.points.length >= 2 ? lineChart(t.points, '/10') : ''}
    <span class="kicker">Reprise progressive</span>
    <div class="setmenu">${RETURN_STEPS.map((s, i) => h`<div class="setrow ${i === t.step ? 'on' : ''}"><span class="sic">${i < t.step ? '✅' : i === t.step ? '👉' : '○'}</span><span class="grow"><b>${i + 1}. ${s.title}</b><small>${s.text}</small></span></div>`)}</div>
    <p class="tiny muted">L’étape est suggérée d’après tes notes (une note par jour ou deux suffit). Repère général, pas un avis médical.</p>
    <div class="grid2"><button class="btn pri" data-act="painNew" data-id="${z}">＋ Nouvelle note</button><button class="btn" data-act="painHealed" data-id="${z}">✓ C’est passé</button></div>
    <details class="how mini"><summary>Historique (${list.length})</summary><ul class="clean tight tiny">${list.map((p) => h`<li>${fmtDay(p.date)} · ${p.healed ? 'passé ✓' : `${p.level}/10`}${p.side ? ` · ${p.side}` : ''}${p.when ? ` · ${WHEN.find(([v]) => v === p.when)?.[1] || ''}` : ''}${p.note ? ` · ${p.note}` : ''}</li>`)}</ul></details></div>`, { wide: true });
};
ACT.painHealed = (el) => { const z = el.dataset.id; if (!ZONES_ALL.includes(z)) return; putItem('pain', 'pn-' + uid().slice(0, 14), { zone: z, level: 0, side: '', when: '', date: Date.now(), note: '', healed: true }); closeSheet(); buzzOk(); toast(`${ZONE_LABEL[z]} : noté comme passé. La zone n’est plus ménagée.`); render(); };
/** Carte « Douleurs » de Profil › Mon corps et mes préférences. */
export function painCard() {
  const c = ctx(), tr = painTrend(c.pains, c.now), active = tr.filter((t) => !t.healed && t.last > 0);
  const marks = Object.fromEntries(active.map((t) => [t.zone, { level: t.last, side: t.side }]));
  return h`<section class="card stack"><div class="row between wrapf"><h3 style="margin:0">🩹 Douleurs</h3><button class="btn sm pri" data-act="painNew">＋ Noter</button></div>
    <p class="tiny muted">Touche une zone du bonhomme pour noter une douleur ou voir son suivi. Une zone à 3/10 ou plus est ménagée d’office dans les séances proposées.</p>
    <div class="painwrap">${raw(painMapSvg(marks, ZONE_LABEL))}</div>
    ${active.length ? h`<div class="setmenu">${active.map((t) => h`<button class="setrow" data-act="painZone" data-id="${t.zone}"><span class="sic">${ZONE_EMOJI[t.zone] || '📍'}</span><span class="grow"><b>${zoneName(t.zone).replace(/^\S+\s/, '')} · ${t.last}/10</b><small>${relDate(t.date)} · étape ${t.step + 1}/4 : ${RETURN_STEPS[t.step].title.toLowerCase()}</small></span><span class="chev">›</span></button>`)}</div>`
      : h`<p class="small muted">Aucune douleur en cours 👍</p>`}</section>`;
}

/* ═════════ Progrès : ce que l'app a appris sur toi ═════════ */
export function learnedCard() {
  const c = ctx(), r = readiness(c), pl = plateaus(c), bal = muscleBalance(c), rules = learnedRules(c), zl = zoneLoad(c), pains = activePains(c.pains, c.now);
  const fc = metricGoals(c).length;
  return h`<section class="card stack"><h3 style="margin:0">🧠 Ce que l’app a appris sur toi</h3>
    <p class="tiny muted">Calculé uniquement avec tes séances, tes ressentis, tes mesures et tes check-ins.</p>
    ${menuList([
      ['formeWhy', '', '🔋', 'Forme et fatigue', r.ff.enough || r.checked ? `${r.emoji} ${r.word} aujourd’hui` : 'À partir de 4 séances sur 6 semaines'],
      ['coachPlateaus', '', '📉', `Plateaux${pl.length ? ` (${pl.length})` : ''}`, pl.length ? `${pl[0].label}${pl.length > 1 ? ` et ${pl.length - 1} autre${pl.length > 2 ? 's' : ''}` : ''} : 3 pistes pour repartir` : 'Aucun plateau détecté'],
      ['coachBalance', '', '⚖️', 'Équilibre pousser / tirer', bal.ratio == null ? 'Pas encore assez de séries sur 4 semaines' : bal.unbalanced ? 'Déséquilibré : à corriger' : 'Bien équilibré'],
      ['coachRules', '', '💡', `Règles apprises${rules.rules.length ? ` (${rules.rules.length})` : ''}`, rules.rules.length ? rules.rules[0].slice(0, 70) + (rules.rules[0].length > 70 ? '…' : '') : rules.n >= 8 ? `Rien d’assez net pour l’instant (${rules.n} séances notées)` : `À partir de 8 séances avec ressenti (tu en as ${rules.n})`],
      ['coachZones', '', '🦴', 'Charge par zone', zl.length ? `⚠️ ${zl.map((z) => ZONE_LABEL[z.zone]).join(', ')} en forte hausse` : 'Rien d’inhabituel cette semaine'],
      ['coachForecast', '', '🔮', 'Prévisions de tes objectifs', fc ? `${fc} objectif${fc > 1 ? 's' : ''} chiffré${fc > 1 ? 's' : ''}` : 'Avec un objectif chiffré'],
      ['coachRecovery', '', '😴', 'Récupération', 'Sommeil, eau, protéines : tes repères'],
      ['allGo', '', '🩹', 'Douleurs', pains.length ? `${pains.map((p) => p.label).join(', ')} : ménagé${pains.length > 1 ? 's' : ''}` : 'Aucune en cours', 'profile/body'],
    ])}</section>`;
}
const metricGoals = (c) => activeGoals(c).filter((g) => g.metricId && Number.isFinite(Number(g.target)) && c.metrics[g.metricId]?.kind !== 'grade');
ACT.coachPlateaus = () => {
  const c = ctx(), pl = plateaus(c);
  openSheet(h`<div class="stack"><h2 style="margin:0">📉 Plateaux</h2>
    <p class="tiny muted">Une mesure (au moins 3 valeurs sur 6 semaines) qui n’a pas progressé de plus de 2 % sur les 6 dernières semaines.</p>
    ${pl.length ? pl.map((p) => h`<div class="card flat stack tight"><b>${p.label}</b><span class="tiny muted">Meilleur récent : ${num(p.value)} ${p.unit || ''} · pas mieux depuis le ${fmtDay(p.since)}</span>
      <ul class="clean tight small">${p.ideas.map((x, i) => h`<li>${i + 1}. ${x}</li>`)}</ul>
      <button class="btn sm" data-act="coachFocus" data-id="${p.metricId}">✨ Créer une séance pour ça</button></div>`)
      : h`<p class="small">Aucun plateau : ${c.perfs.length ? 'tes mesures progressent, ou pas encore assez de recul (6 semaines).' : 'note des mesures (Profil › Records et mesures) pour que l’app les suive.'}</p>`}</div>`, { wide: true });
};
ACT.coachFocus = (el) => { const m = ctx().metrics[el.dataset.id]; if (!m?.caps || !Object.keys(m.caps).length) return; closeSheet(); openWizard({ focus: { label: m.label, caps: m.caps } }); };
const PUSH_CAPS = { poussee_horizontale: 1, poussee_verticale: 0.7 }, PULL_CAPS = { tirage_horizontal: 1, tirage_vertical: 0.7 };
ACT.coachBalGo = (el) => { closeSheet(); openWizard({ focus: el.dataset.id === 'push' ? { label: 'Poussée', caps: PUSH_CAPS } : { label: 'Tirage', caps: PULL_CAPS } }); };
ACT.coachBalance = () => {
  const b = muscleBalance(ctx());
  openSheet(h`<div class="stack"><h2 style="margin:0">⚖️ Équilibre pousser / tirer</h2>
    <div class="grid2"><div class="stat"><b>${b.push}</b><span>séries de poussée</span></div><div class="stat"><b>${b.pull}</b><span>séries de tirage</span></div></div>
    <p class="small">${b.ratio == null ? 'Il faut au moins 12 séries de poussée ou de tirage sur 4 semaines pour conclure.' : b.text}</p>
    <p class="tiny muted">Sur 4 semaines. Un grand écart (plus de 2 fois plus d’un côté) charge les épaules de façon déséquilibrée ; les séances proposées compensent un peu d’elles-mêmes, et te le disent.</p>
    ${b.unbalanced ? h`<button class="btn pri" data-act="coachBalGo" data-id="${b.ratio > 2 ? 'push' : 'pull'}">✨ Séance pour rééquilibrer</button>` : ''}</div>`);
};
ACT.coachRules = () => {
  const r = learnedRules(ctx());
  openSheet(h`<div class="stack"><h2 style="margin:0">💡 Règles apprises sur toi</h2>
    ${r.rules.length ? h`<ul class="clean tight small">${r.rules.map((x) => h`<li>• ${x}</li>`)}</ul>` : h`<p class="small">Rien d’assez sûr pour l’instant.</p>`}
    <p class="tiny muted">Un constat n’est affiché que s’il repose sur au moins 3 séances de chaque côté et un écart d’au moins 0,5 point de ressenti (sur ${r.n} séance${r.n > 1 ? 's' : ''} notée${r.n > 1 ? 's' : ''}). Note ton ressenti après chaque séance et fais le check-in du matin : l’app apprend tes jours de repos idéaux, l’effet du sommeil et du stress.</p>
    ${cycleOn() ? '' : h`<details class="how mini"><summary>🩸 Suivre aussi mon cycle (facultatif, privé)</summary><p class="tiny">Ajoute « Règles aujourd’hui » au check-in. L’app compare seulement TON ressenti ces jours-là aux autres jours ; rien n’est changé d’office. Ces données restent dans ton compte (comme tes séances) et ne sont visibles par personne d’autre.</p><button class="btn sm" data-act="cycleOn">Activer</button></details>`}
    ${cycleOn() ? h`<button class="btn sm ghost" data-act="cycleOff">Ne plus suivre mon cycle</button>` : ''}</div>`);
};
ACT.cycleOn = () => { putItem('config', 'coach', { ...(item('config', 'coach') || {}), cycle: true }); closeSheet(); toast('Activé : « Règles aujourd’hui » apparaît dans le check-in.'); render(); };
ACT.cycleOff = () => { putItem('config', 'coach', { ...(item('config', 'coach') || {}), cycle: false }); closeSheet(); toast('Suivi du cycle désactivé.'); render(); };
ACT.coachZones = () => {
  const zl = zoneLoad(ctx());
  openSheet(h`<div class="stack"><h2 style="margin:0">🦴 Charge par zone</h2>
    ${zl.length ? zl.map((z) => h`<div class="win warnw"><span>⚠️</span>${z.text}</div>`) : h`<p class="small">Rien d’inhabituel : aucune zone (doigts, épaules, genoux) n’a pris plus de 50 % de séries cette semaine par rapport à tes 4 semaines d’avant.</p>`}
    <p class="tiny muted">Séries des 7 derniers jours comparées à la moyenne des 4 semaines précédentes (à partir de 4 séries par semaine). Une hausse brutale est plus risquée qu’une charge élevée atteinte progressivement.</p>${sourcesLine(['gabbett2016'])}</div>`);
};
ACT.coachForecast = () => {
  const c = ctx(), gs = metricGoals(c);
  openSheet(h`<div class="stack"><h2 style="margin:0">🔮 Prévisions</h2>
    ${gs.length ? gs.map((g) => { const f = forecast(c, g.metricId, { target: Number(g.target), deadline: g.deadline || null }); const m = c.metrics[g.metricId];
      return h`<div class="card flat stack tight"><b>${goalLabel(g)}</b><span class="tiny muted">Cible : ${num(Number(g.target))} ${m?.unit || ''}${g.deadline ? ` pour le ${fmtDay(Date.parse(g.deadline + 'T12:00:00'))}` : ''}</span>
        <p class="small">${f?.reached ? '🎉 Cible déjà atteinte d’après ta dernière tendance : vérifie avec une mesure !' : f?.text || 'Pas de prévision possible pour cette mesure.'}${f?.onTime === false ? ' ⚠️ Plus tard que ta date : il faudra accélérer (voir les plateaux) ou décaler la date.' : f?.onTime ? ' ✅ Dans les temps.' : ''}</p></div>`; })
      : h`<p class="small">Ajoute un objectif chiffré (ex. « 15 tractions » ou « 30 s à la poutre ») dans Profil › Objectifs pour voir quand tu l’atteindras à ce rythme.</p>`}
    <p class="tiny muted">Droite de tendance sur tes mesures des 6 derniers mois, avec une fourchette (incertitude de la pente). La confiance dépend du nombre de mesures et de leur régularité. Une estimation, pas une promesse.</p></div>`, { wide: true });
};
ACT.coachRecovery = () => {
  const c = ctx(), W = c.wellness.filter((w) => w.sleep != null && c.now - (w.at || 0) <= 14 * DAY), avg = W.length ? W.reduce((t, w) => t + w.sleep, 0) / W.length : null;
  const kg = Number(c.config?.body?.weight) || null, goals = c.config?.main?.goals || [], muscle = goals.includes('muscle') || goals.includes('physique') || goals.includes('force');
  openSheet(h`<div class="stack"><h2 style="margin:0">😴 Récupération</h2>
    <div class="setmenu">
      <div class="setrow"><span class="sic">😴</span><span class="grow"><b>Sommeil${avg != null ? ` : ${num(avg)} h en moyenne` : ''}</b><small>${avg != null ? (W.length > 1 ? `Sur tes ${W.length} derniers check-ins. ` : 'Sur ton dernier check-in. ') : ''}Repère adulte : 7 h ou plus par nuit, à heures régulières.</small></span></div>
      <div class="setrow"><span class="sic">💧</span><span class="grow"><b>Eau</b><small>Commence bien hydraté, bois quelques gorgées régulièrement pendant l’effort. Pour connaître tes besoins : pèse-toi avant et après une séance (1 kg perdu ≈ 1 litre de sueur).</small></span></div>
      <div class="setrow"><span class="sic">🍳</span><span class="grow"><b>Protéines${kg && muscle ? ` : environ ${Math.round(kg * 1.6)} g par jour` : ''}</b><small>${muscle ? `Pour prendre du muscle, au-delà d’environ 1,6 g par kilo et par jour${kg ? ` (${num(kg)} kg × 1,6)` : ''}, il n’y a plus de gain en moyenne. Réparties sur les repas.` : 'Des protéines à chaque repas aident à récupérer ; inutile d’en faire trop.'}</small></span></div>
      <div class="setrow"><span class="sic">🧘</span><span class="grow"><b>Jours faciles</b><small>Après une séance dure, une journée de repos, de mobilité ou de technique douce. Les progrès se font pendant la récupération.</small></span></div></div>
    ${sourcesLine(['watson2015', 'sawka2007', 'morton2018'])}
    <p class="tiny muted">Repères généraux pour adultes en bonne santé, pas un régime ni un avis médical : en cas de doute, demande à un professionnel de santé ou à un diététicien.</p></div>`, { wide: true });
};
