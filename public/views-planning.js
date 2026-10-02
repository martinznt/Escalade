// views-planning.js — Accueil › 📅 Planning : les outils pour organiser ses semaines (planning.js, testé) :
// semaine automatique (proposée, jamais ajoutée sans validation), objectif daté (programme à rebours), disponibilités,
// pause vacances / blessure, abonnement agenda (lien secret), conflits avec leur correction, séances non faites à
// décaler, et « ta semaine en 10 secondes ».
import { h, openSheet, closeSheet, toast, ask, menuList, fmtDay, ymd, buzzOk, chip } from './ui.js';
import { S, ACT, SUBMIT, CHG, ctx, render, putItem, item, saveEvent, deleteEvent, api, go } from './state.js';
import { uid } from './shared.js';
import { backwardPlan, eventPhase, recalcToEvent, cleanSlots, pauseState, weekPlan, conflicts, missedEvents, weekReview, eventsBetween, PHASES, DAY_LONG, parseDay, toMin } from './planning.js';
import { DAY_NAMES, PROGRAM_GOALS, defaultDays } from './program.js';
import { readiness } from './coachbrain.js';
import { activeProgram } from './views-program.js';
import { openWizard } from './views-climbplan.js';
import { sourcesLine } from './srcui.js';
import { availableEquipment, testReminders } from './brain.js';
import { ACTIVITIES } from './model.js';

const day = (s) => fmtDay(parseDay(s)), dLong = (s) => new Date(parseDay(s)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const slots = () => cleanSlots(item('config', 'availability')?.slots);
const pauseCfg = () => item('config', 'pause') || {};
const actLabel = (a) => { const x = ctx().activities[a] || ACTIVITIES[a]; return x ? `${x.emoji || ''} ${x.label}`.trim() : 'Séance'; };
const slotsText = (l) => { const t = l.map((s) => `${DAY_NAMES[s.d].toLowerCase()} ${s.from}–${s.to}`).join(' · '); return t.length > 70 ? t.slice(0, 68) + '…' : t; };
/** Lieu le plus adapté à un sport (mur pour l'escalade, piscine pour la natation, sinon le lieu par défaut). */
export function envFor(a) {
  const c = ctx(), envs = c.envs.filter((e) => !e.archived);
  if (/^climbing/.test(a)) return envs.find((e) => availableEquipment(c, e.id).has('wall')) || null;
  if (a === 'swimming') return envs.find((e) => e.type === 'piscine') || null;
  if (a === 'running') return envs.find((e) => e.type === 'piste' || e.type === 'exterieur') || null;
  return c.defEnv || envs[0] || null;
}

/* ═════════ Outils (liste façon Réglages) ═════════ */
export function planTools() {
  const P = pauseState(pauseCfg()), prog = activeProgram(), ep = prog?.eventDate ? eventPhase(prog) : null, sl = slots();
  return menuList([
    ['autoWeek', '', '🤖', 'Ma semaine automatique', 'Les 7 prochains jours proposés d’après tes créneaux, ta forme et tes événements'],
    ['eventGoal', '', '🎯', ep && ep.left >= 0 ? `Objectif daté : J−${ep.left}` : 'Objectif daté', ep && ep.left >= 0 ? `${prog.eventLabel || 'Mon objectif'} · ${ep.label}` : 'Compétition, course, sortie : un programme à rebours jusqu’à la date'],
    ['slotsOpen', '', '🕒', 'Mes disponibilités', sl.length ? slotsText(sl) : 'Les jours et heures où tu peux t’entraîner'],
    ['pauseOpen', '', P.active ? (P.mode === 'vacances' ? '🏖️' : '🩹') : '⏸️', 'Pause : vacances ou blessure', P.active ? `En cours${P.to ? ` jusqu’au ${day(P.to)}` : ''}` : P.future ? `Prévue à partir du ${day(P.from)}` : 'Rappels coupés, série de semaines gardée'],
    ['weekReviewOpen', '', '📅', 'Ta semaine en 10 secondes', 'Le bilan de la semaine en cours'],
    ['icalOpen', '', '📡', 'Abonnement agenda', 'Ton planning toujours à jour dans ton agenda (Google, iPhone, Outlook)'],
    ['shareWeek', '', '🤝', 'Partager ma semaine', 'Pour caler des séances avec un partenaire'],
  ]);
}

/* ═════════ Alertes : conflits et séances non faites ═════════ */
export function planAlerts() {
  const c = ctx(), conf = conflicts(c, { pause: pauseCfg(), envs: c.envs }), miss = missedEvents(c, c.now, { pause: pauseCfg() });
  if (!conf.length && !miss.length) return '';
  return h`<section class="card stack warn-b"><h3 style="margin:0">⚠️ À regarder</h3>
    ${miss.map((m) => h`<div class="item"><div class="grow"><b>${m.event.title || 'Séance'}</b><div class="tiny muted">Prévue ${dLong(m.event.on)}, pas faite.</div></div>${m.to ? h`<button class="btn sm pri" data-act="missMove" data-id="${m.event.id}" data-to="${m.to}">Décaler au ${day(m.to)}</button>` : ''}<button class="btn sm ghost" data-act="missDrop" data-id="${m.event.id}" aria-label="Laisser tomber">✕</button></div>`)}
    ${conf.map((x, i) => h`<div class="item"><div class="grow small">${x.text}${x.recurring ? h` <span class="tiny muted">(séance répétée : la correction s’applique à toute la série)</span>` : ''}</div><button class="btn sm" data-act="confFix" data-i="${i}">${x.fixText}</button></div>`)}</section>`;
}
ACT.missMove = (el) => { const e = S.events.find((x) => x.id === el.dataset.id); if (!e) return; saveEvent({ ...e, date: el.dataset.to }); buzzOk(); toast(`Décalée au ${day(el.dataset.to)}`); render(); };
ACT.missDrop = async (el) => { const e = S.events.find((x) => x.id === el.dataset.id); if (!e || !(await ask(`Laisser tomber « ${e.title || 'cette séance'} » ?`, { ok: 'Retirer' }))) return; deleteEvent(e.id); render(); };
ACT.confFix = (el) => {
  const c = ctx(), x = conflicts(c, { pause: pauseCfg(), envs: c.envs })[Number(el.dataset.i)], e = x && S.events.find((v) => v.id === x.eventId); if (!e) return;
  if (x.fix.kind === 'delete') deleteEvent(e.id);
  else if (x.fix.kind === 'move') saveEvent({ ...e, date: x.fix.date });
  else if (x.fix.kind === 'time') saveEvent({ ...e, time: x.fix.time });
  else if (x.fix.kind === 'light') saveEvent({ ...e, meta: { ...(e.meta || {}), light: true } });
  buzzOk(); toast('Corrigé'); render();
};

/* ═════════ Semaine automatique ═════════ */
function proposal() {
  const c = ctx(), main = item('config', 'main') || {}, rd = readiness(c);
  const w = weekPlan(c, { slots: slots(), perWeek: Number(main.perWeek) || 3, minutes: Number(S.settings.defaultMinutes) || Number(main.durations?.[0]) || 45, activities: Object.keys(c.activities), pause: pauseCfg(), lowForm: rd.checked && rd.level === 'low', envFor });
  // Tests du mois : si des mesures utiles datent (6 semaines ou jamais) et qu'aucun test n'est prévu depuis 4 semaines,
  // la dernière séance proposée devient une séance test (tes mesures refaites, pour suivre tes progrès).
  const due = testReminders(c), recent = S.events.some((e) => e.meta?.kind === 'test' && Math.abs(parseDay(e.date) - c.now) < 28 * 86400000);
  const last = w.sessions.filter((x) => !x.light).at(-1);
  if (due.length && !recent && last) { last.test = true; last.why = [...last.why, `mesures à refaire : ${due.slice(0, 3).map((t) => t.label.toLowerCase()).join(', ')}`]; }
  return w;
}
ACT.autoWeek = () => {
  const w = proposal(); S.autoWeek = w;
  openSheet(h`<div class="stack"><h2 style="margin:0">🤖 Ma semaine automatique</h2>
    <p class="tiny muted">Proposition pour les 7 prochains jours. Rien n’est ajouté à ton calendrier tant que tu n’as pas validé ; chaque séance est préparée le jour même, d’après ta forme.</p>
    ${w.notes.length ? h`<ul class="clean tight small">${w.notes.map((n) => h`<li>• ${n}</li>`)}</ul>` : ''}
    ${w.sessions.length ? h`<div class="setmenu">${w.sessions.map((s, i) => h`<label class="setrow"><input type="checkbox" name="aw" value="${i}" checked aria-label="Garder cette séance"><span class="grow"><b>${dLong(s.date)} · ${s.time}</b><small>${s.test ? '📏 Séance test · ' : ''}${actLabel(s.activityId)} · ${s.minutes} min${s.light ? ' · légère' : ''} — ${s.why.join(' ; ')}</small></span></label>`)}</div>
      <button class="btn pri big" data-act="autoWeekSave">✓ Ajouter au calendrier</button>` : h`<p class="small">Rien à ajouter.</p>`}
    <div class="row wrapf"><button class="btn sm" data-act="slotsOpen">🕒 Mes disponibilités</button><button class="btn sm ghost" data-act="closeSheet">Fermer</button></div></div>`, { wide: true });
};
ACT.autoWeekSave = () => {
  const w = S.autoWeek; if (!w) return;
  const keep = [...document.querySelectorAll('#sheet input[name=aw]:checked')].map((x) => w.sessions[Number(x.value)]).filter(Boolean);
  for (const s of keep) saveEvent({ id: uid(), date: s.date, time: s.time, title: s.test ? 'Séance test (mes mesures)' : `${actLabel(s.activityId).replace(/^\S+\s/, '')}${s.light ? ' (légère)' : ''}`, sessionId: null, completed: false, recurrence: null, meta: { kind: s.test ? 'test' : 'auto', minutes: s.minutes, activityId: s.activityId || undefined, envId: s.envId || undefined, light: s.light || undefined } });
  closeSheet(); buzzOk(); toast(`${keep.length} séance${keep.length > 1 ? 's' : ''} ajoutée${keep.length > 1 ? 's' : ''} au calendrier`); render();
};
/** ▶ sur une séance proposée : préparée maintenant, d'après la forme du jour. */
ACT.autoPlay = (el) => {
  const e = S.events.find((x) => x.id === el.dataset.id); if (!e) return; closeSheet();
  if (e.meta?.kind === 'test') { go('profile', 'bilan'); window.scrollTo(0, 0); setTimeout(() => ACT.bilanRun?.(), 200); return; }
  openWizard({ sport: e.meta?.activityId || '', minutes: e.meta?.minutes || 45, forme: e.meta?.light ? 'tired' : '' });
};
/** Partager sa semaine (texte simple) pour caler des séances avec un partenaire. */
ACT.shareWeek = async () => {
  const from = ymd(new Date()), to = ymd(new Date(Date.now() + 6 * 86400000)), lines = [];
  for (const e of eventsBetween(S.events, from, to).filter((x) => x.meta?.kind !== 'rest')) lines.push([e.on, `• ${dLong(e.on)}${e.time ? ` à ${e.time}` : ''} : ${e.meta?.kind === 'race' ? '🏁 ' : ''}${e.title || 'Séance'}`]);
  const p = activeProgram(); if (p) for (const x of (p.sessions || []).filter((s) => s.date >= from && s.date <= to)) lines.push([x.date, `• ${dLong(x.date)} : ${p.name.split(' · ')[0]} (${x.minutes} min)`]);
  if (!lines.length) return toast('Rien de prévu ces 7 jours : utilise d’abord « Ma semaine automatique ».', 4000);
  const text = `Mes séances prévues (7 prochains jours) :\n${lines.sort((a, b) => a[0].localeCompare(b[0])).map((l) => l[1]).join('\n')}\n\nOn s’entraîne ensemble ?`;
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; /* partage annulé */ }
  try { await navigator.clipboard.writeText(text); toast('Planning copié : colle-le dans un message.'); } catch { openSheet(h`<div class="stack"><h2 style="margin:0">🤝 Ma semaine</h2><textarea rows="8" readonly>${text}</textarea></div>`); }
};

/* ═════════ Disponibilités ═════════ */
ACT.slotsOpen = () => {
  const sl = slots(), row = (d) => { const s = sl.filter((x) => x.d === d); return h`<div class="slotrow"><b>${DAY_LONG[d]}</b>${s.length ? s.map((x) => h`<span class="chip on static">${x.from}–${x.to}</span>`) : h`<span class="tiny muted">—</span>`}</div>`; };
  openSheet(h`<form class="stack" data-submit="slotAdd"><h2 style="margin:0">🕒 Mes disponibilités</h2>
    <p class="tiny muted">Les créneaux où tu peux t’entraîner chaque semaine. La semaine automatique s’en sert, et cale l’heure sur l’ouverture de tes lieux.</p>
    <div class="stack tight">${[0, 1, 2, 3, 4, 5, 6].map(row)}</div>
    <span class="kicker">Ajouter un créneau</span>
    <div class="chips">${DAY_NAMES.map((d, i) => h`<label class="chip"><input type="checkbox" class="hidden" name="d" value="${i}" data-change="chipToggle">${d}</label>`)}</div>
    <div class="grid2"><label class="small">De<input type="time" name="from" value="18:00" required></label><label class="small">À<input type="time" name="to" value="20:00" required></label></div>
    <div class="row wrapf"><button class="btn pri" type="submit">＋ Ajouter</button>${sl.length ? h`<button class="btn ghost" type="button" data-act="slotsClear">Tout effacer</button>` : ''}</div></form>`, { wide: true });
};
SUBMIT.slotAdd = (f) => {
  const fd = new FormData(f), ds = fd.getAll('d').map(Number), from = String(fd.get('from') || ''), to = String(fd.get('to') || '');
  if (!ds.length) return toast('Choisis au moins un jour.');
  if (!(toMin(to) > toMin(from))) return toast('L’heure de fin doit être après le début.', 3500, 'bad');
  const next = cleanSlots([...slots(), ...ds.map((d) => ({ d, from, to }))]);
  putItem('config', 'availability', { ...(item('config', 'availability') || {}), slots: next }); buzzOk(); toast('Créneau ajouté'); ACT.slotsOpen(); render();
};
ACT.slotsClear = async () => { if (!(await ask('Effacer toutes tes disponibilités ?', { ok: 'Effacer', danger: true }))) return; putItem('config', 'availability', { ...(item('config', 'availability') || {}), slots: [] }); ACT.slotsOpen(); render(); };

/* ═════════ Pause ═════════ */
ACT.pauseOpen = () => {
  const p = pauseCfg(), P = pauseState(p), today = ymd(new Date());
  openSheet(h`<form class="stack" data-submit="pauseSave"><h2 style="margin:0">⏸️ Pause</h2>
    ${P.active ? h`<p class="small ok-t">${P.text}</p>` : ''}
    <p class="tiny muted">Pendant une pause : pas de rappels ni de séances proposées (vacances) ou seulement des séances douces (blessure). Ta série de semaines n’est pas cassée.</p>
    <label class="small">Pourquoi ?<select name="pauseMode"><option value="vacances" ${p.pauseMode !== 'blesse' ? 'selected' : ''}>🏖️ Vacances, déplacement</option><option value="blesse" ${p.pauseMode === 'blesse' ? 'selected' : ''}>🩹 Blessure, maladie</option></select></label>
    <div class="grid2"><label class="small">Du<input type="date" name="pauseFrom" value="${p.pauseFrom || today}" required></label><label class="small">Au <span class="tiny muted">(facultatif)</span><input type="date" name="pauseTo" value="${p.pauseTo || ''}"></label></div>
    <label class="small">Note <span class="tiny muted">(facultatif)</span><input name="pauseNote" maxlength="120" value="${p.pauseNote || ''}"></label>
    <div class="row wrapf"><button class="btn pri" type="submit">Enregistrer</button>${p.pauseMode ? h`<button class="btn" type="button" data-act="pauseEnd">${P.active ? '▶ Reprendre maintenant' : 'Annuler la pause'}</button>` : ''}</div></form>`, { wide: true });
};
SUBMIT.pauseSave = (f) => {
  const d = Object.fromEntries(new FormData(f));
  if (d.pauseTo && d.pauseTo < d.pauseFrom) return toast('La fin doit être après le début.', 3500, 'bad');
  putItem('config', 'pause', { pauseMode: d.pauseMode === 'blesse' ? 'blesse' : 'vacances', pauseFrom: d.pauseFrom, pauseTo: d.pauseTo || '', pauseNote: String(d.pauseNote || '').slice(0, 120) });
  closeSheet(); buzzOk(); toast(d.pauseMode === 'blesse' ? 'Pause enregistrée : séances douces seulement. Prends soin de toi.' : 'Pause enregistrée. Bonnes vacances !', 4000); render();
};
ACT.pauseEnd = () => {
  putItem('config', 'pause', { pauseMode: '', pauseFrom: '', pauseTo: '', pauseNote: '' }); closeSheet();
  const p = activeProgram(); toast(p ? 'Pause terminée. Ton programme peut être décalé depuis sa carte.' : 'Pause terminée : bon retour !', 4000); render();
};
/** Bandeau d'accueil pendant une pause. */
export function pauseBanner() {
  const P = pauseState(pauseCfg()); if (!P.active) return '';
  return h`<section class="card flat stack"><div class="row between wrapf"><b>${P.label}${P.to ? ` · jusqu’au ${day(P.to)}` : ''}</b><button class="btn sm" data-act="pauseEnd">▶ Reprendre</button></div><p class="tiny muted">${P.text}</p></section>`;
}

/* ═════════ Objectif daté ═════════ */
ACT.eventGoal = () => {
  const p = activeProgram();
  if (p?.eventDate) return ACT.progOpen({ dataset: { id: p.id } });
  const cfg = item('config', 'main') || {}, per = Math.max(1, Math.min(6, Number(cfg.perWeek) || 3)), sl = slots();
  S.eg = { label: '', date: ymd(new Date(Date.now() + 56 * 86400000)), goal: { climb: 'climb', force: 'force', endurance: 'endurance', mobilite: 'mobilite', poids: 'poids' }[cfg.goal] || 'forme', days: sl.length ? [...new Set(sl.map((s) => s.d))] : defaultDays(per), minutes: Number(S.settings.defaultMinutes) || 45 };
  egSheet();
};
function egSheet() {
  const g = S.eg, plan = backwardPlan({ eventDate: g.date, eventLabel: g.label, goal: g.goal, days: g.days, minutes: g.minutes, start: ymd(new Date()) });
  const phases = plan ? Object.entries(plan.sessions.reduce((o, s) => { (o[s.phase] ||= new Set()).add(s.week); return o; }, {})).map(([ph, w]) => `${PHASES[ph].label} : ${w.size} sem.`) : [];
  openSheet(h`<form class="stack" data-submit="egSave"><h2 style="margin:0">🎯 Objectif daté</h2>
    <p class="tiny muted">Une date qui compte (compétition, course, sortie en falaise…) : le programme est construit à rebours — fondation, spécifique, puis affûtage pour arriver frais.</p>
    <label class="small">Quoi ?<input name="label" maxlength="60" required value="${g.label}" placeholder="Ex. Fontainebleau, objectif 7A · 10 km en 50 min"></label>
    <label class="small">Quand ?<input type="date" name="date" value="${g.date}" min="${ymd(new Date(Date.now() + 2 * 86400000))}" required data-change="egDate"></label>
    <span class="small"><b>Pour quoi ?</b></span><div class="chips">${Object.entries(PROGRAM_GOALS).filter(([k]) => k !== 'goal').map(([k, x]) => chip(g.goal === k, `${x.emoji} ${x.label}`, `data-act="egSet" data-k="goal" data-v="${k}"`))}</div>
    <span class="small"><b>Quels jours ?</b></span><div class="chips days">${DAY_NAMES.map((d, i) => chip(g.days.includes(i), d, `data-act="egDay" data-v="${i}"`))}</div>
    <span class="small"><b>Durée d’une séance</b></span><div class="chips">${[30, 45, 60, 90].map((n) => chip(g.minutes === n, `${n} min`, `data-act="egSet" data-k="minutes" data-v="${n}"`))}</div>
    ${plan ? h`<div class="card flat"><b>${plan.sessions.length} séances sur ${plan.weeks} semaine${plan.weeks > 1 ? 's' : ''}</b><p class="small">${phases.join(' · ')}</p><p class="tiny muted">Aucune séance la veille ni le jour J. Les séances manquées ne sont pas entassées : le programme se recalcule jusqu’à la date.</p>${sourcesLine(['bosquet2007', 'issurin2010'])}</div>` : h`<p class="small warn-t">Choisis une date à au moins 2 jours d’ici.</p>`}
    <button class="btn pri big" type="submit" ${plan ? '' : 'disabled'}>Créer le programme</button></form>`, { wide: true });
}
ACT.egSet = (el) => { S.eg[el.dataset.k] = el.dataset.k === 'minutes' ? Number(el.dataset.v) : el.dataset.v; keepLabel(); egSheet(); };
ACT.egDay = (el) => { const d = Number(el.dataset.v), s = new Set(S.eg.days); if (s.has(d)) { if (s.size > 1) s.delete(d); } else s.add(d); S.eg.days = [...s].sort(); keepLabel(); egSheet(); };
CHG.egDate = (el) => { S.eg.date = el.value; keepLabel(); egSheet(); };
const keepLabel = () => { const i = document.querySelector('#sheet input[name=label]'); if (i && S.eg) S.eg.label = i.value; };
SUBMIT.egSave = async (f) => {
  const d = Object.fromEntries(new FormData(f)), g = S.eg; g.label = String(d.label || '').trim(); g.date = d.date;
  const c = ctx(), G = PROGRAM_GOALS[g.goal] || PROGRAM_GOALS.forme, act = c.activities[G.activityId] ? G.activityId : (Object.keys(c.activities).find((a) => a.startsWith(G.activityId.split('_')[0])) || Object.keys(c.activities)[0] || G.activityId);
  const plan = backwardPlan({ eventDate: g.date, eventLabel: g.label, goal: g.goal, days: g.days, minutes: g.minutes, start: ymd(new Date()), activityId: act });
  if (!plan) return toast('Date trop proche ou invalide.', 3500, 'bad');
  const old = activeProgram();
  if (old && !(await ask('Remplacer ton programme en cours ?', { ok: 'Remplacer', detail: 'L’ancien est archivé, tes séances faites restent dans ton historique.' }))) return;
  if (old) putItem('program', old.id, { ...old, status: 'stopped' });
  putItem('program', 'pg-' + uid().slice(0, 14), plan);
  if (!S.events.some((e) => e.meta?.kind === 'race' && e.date === g.date)) saveEvent({ id: uid(), date: g.date, time: '', title: g.label, sessionId: null, completed: false, recurrence: null, meta: { kind: 'race' } });
  closeSheet(); buzzOk(); toast(`C’est parti : ${plan.sessions.length} séances jusqu’au ${day(g.date)}.`, 4500); render();
};
/** Objectif daté : recalcul jusqu'à la date (au lieu de repousser les séances après). */
ACT.progRecalc = (el) => {
  const p = item('program', el.dataset.id); if (!p?.eventDate) return;
  const { prog, dropped } = recalcToEvent({ ...p, id: p.id }, S.history);
  const { id, _u, ...data } = prog; putItem('program', p.id, data); closeSheet(); render();
  toast(dropped ? `Recalculé : ${dropped} séance${dropped > 1 ? 's' : ''} manquée${dropped > 1 ? 's' : ''} laissée${dropped > 1 ? 's' : ''} de côté, la suite reste calée sur le ${day(p.eventDate)}.` : 'Recalculé jusqu’à la date.', 5000);
};

/* ═════════ Ta semaine en 10 secondes ═════════ */
const reviewKey = () => { const r = weekReview(ctx(), Date.now(), new Date().getDay() === 1 ? 1 : 0); return r.from; };
/** Carte d'accueil : le dimanche (après midi) et le lundi, jusqu'à ce qu'on la masque. */
export function weekReviewCard() {
  const now = new Date(), wd = now.getDay(); if (!((wd === 0 && now.getHours() >= 12) || wd === 1)) return '';
  if (item('config', 'review')?.seenIds?.includes(reviewKey())) return '';
  return reviewBody(wd === 1 ? 1 : 0, true);
}
function reviewBody(offset, card) {
  const r = weekReview(ctx(), Date.now(), offset);
  return h`<section class="card stack"><div class="row between wrapf"><h3 style="margin:0">📅 Ta semaine en 10 secondes</h3><span class="tiny muted">${day(r.from)} → ${day(r.to)}</span></div>
    <ul class="clean tight small">${r.lines.map((l) => h`<li>${l}</li>`)}</ul>
    <div class="row wrapf"><button class="btn sm pri" data-act="autoWeek">🤖 Planifier la semaine</button>${card ? h`<button class="btn sm ghost" data-act="reviewHide">Masquer</button>` : ''}</div></section>`;
}
ACT.reviewHide = () => { const cfg = item('config', 'review') || {}; putItem('config', 'review', { ...cfg, seenIds: [...(cfg.seenIds || []), reviewKey()].slice(-20) }); render(); };
ACT.weekReviewOpen = () => openSheet(h`<div class="stack">${reviewBody(0, false)}${reviewBody(1, false)}</div>`, { wide: true });

/* ═════════ Abonnement agenda ═════════ */
ACT.icalOpen = async () => {
  if (S.user?.guest) return toast('Crée un compte (gratuit) pour t’abonner depuis ton agenda.', 4000);
  let st = { active: false }; try { st = await api('GET', '/api/ical'); } catch { /* hors ligne */ }
  openSheet(h`<div class="stack"><h2 style="margin:0">📡 Abonnement agenda</h2>
    <p class="small">Un lien secret à coller dans ton agenda (Google Agenda : « Autres agendas › À partir de l’URL » ; iPhone : Réglages › Calendrier › Comptes › « Ajouter un calendrier avec abonnement »). Tes séances prévues, ton programme et tes événements y apparaissent et se mettent à jour tout seuls (environ toutes les heures, selon l’agenda).</p>
    <p class="tiny warn-t">Garde ce lien pour toi : qui l’a peut voir tes séances prévues (rien d’autre). Tu peux le remplacer ou le couper à tout moment.</p>
    ${S.icalUrl ? h`<label class="small">Ton lien (copie-le maintenant : il ne sera plus montré)<input readonly value="${S.icalUrl}" data-act="selAll"></label><button class="btn pri" data-act="icalCopy">📋 Copier le lien</button>` : ''}
    <div class="row wrapf"><button class="btn ${S.icalUrl ? '' : 'pri'}" data-act="icalNew">${st.active ? '🔄 Nouveau lien (coupe l’ancien)' : '✨ Créer mon lien'}</button>${st.active ? h`<button class="btn ghost danger" data-act="icalOff">Couper l’abonnement</button>` : ''}</div>
    ${st.active && !S.icalUrl ? h`<p class="tiny muted">Abonnement actif depuis le ${fmtDay(st.created_at)}.</p>` : ''}</div>`, { wide: true });
};
ACT.icalNew = async () => { try { const r = await api('POST', '/api/ical'); S.icalUrl = r.url; buzzOk(); ACT.icalOpen(); } catch (e) { toast('Impossible pour l’instant : ' + (e.message || 'connexion ?'), 4000, 'bad'); } };
ACT.icalCopy = async () => { try { await navigator.clipboard.writeText(S.icalUrl); toast('Lien copié ✓'); } catch { toast('Sélectionne le lien et copie-le.'); } };
ACT.icalOff = async () => { if (!(await ask('Couper l’abonnement ? Ton agenda ne recevra plus tes séances.', { ok: 'Couper', danger: true }))) return; try { await api('DELETE', '/api/ical'); S.icalUrl = ''; toast('Abonnement coupé'); ACT.icalOpen(); } catch (e) { toast(e.message || 'Erreur', 4000, 'bad'); } };
ACT.selAll = (el) => { try { el.select(); } catch { /* rien */ } };
export const goPlanning = () => go('home', 'cal');
