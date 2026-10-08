// Planning et bilan courts, sur les API calendrier/historique et l'outbox existantes.
import { h, openSheet, closeSheet, toast, ymd, ask, fmtDay } from './ui.js';
import { proposable } from './sportprefs.js';
import { S, accountToken, accountMatches, ACT, SUBMIT, CHG, api, ctx, saveEvent, deleteEvent, addHistory, updateHistory, deleteHistory, getSeance, render, go, putItem } from './state.js';
import { uid } from './shared.js';
import { ACTIVITIES } from './model.js';
import { agendaEvents, occurrenceChange, splitSeries, exceptionId, validDay, dayInZone, journalEntries, parseAgendaText } from './agenda.js';
import { parseQuickActivities } from './experience.js';
import { aiEvidence, aiProposalReady } from './srcui.js';
import { slotsOn, toMin, DAY_LONG } from './planning.js';
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
const DAYS = [[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi'],[6,'Samedi'],[0,'Dimanche']];
const today = () => dayInZone(Date.now(), zone());
const activities = () => ({ ...ACTIVITIES, ...ctx().activities });
const label = (id) => activities()[id]?.label || id;
const options = (current) => Object.entries(activities()).filter(([id,a]) => !a.archived && proposable(id, current)).map(([k,a]) => h`<option value="${k}" ${current === k ? 'selected' : ''}>${a.emoji || ''} ${a.label}</option>`);
const at = (id, date) => agendaEvents(S.events, date).find((e) => e.id === id || e.sourceId === id);
/** Lieu écrit → lieu décrit du même nom (son matériel servira à préparer la séance) ; sinon le texte seul. */
const placeMeta = (meta, place) => { const p = String(place || '').trim().slice(0, 80), env = p && ctx().envs.find((v) => !v.archived && v.name.toLocaleLowerCase() === p.toLocaleLowerCase()); const { envId, ...rest } = meta || {}; return { ...rest, place: p, ...(env ? { envId: env.id } : {}) }; };
const placeOf = (e) => e.meta?.place || ctx().envs.find((v) => v.id === e.meta?.envId)?.name || '';
const placesList = () => h`<datalist id="agenda-places">${ctx().envs.filter((v) => !v.archived).map((v) => h`<option value="${v.name}"></option>`)}</datalist>`;
const editableQuickLog = (entry) => !!entry.data?.quickLog && Array.isArray(entry.data.exercises) && entry.data.exercises.length === 0;
const reminderField = (current = 0, timeZone = zone()) => {
  const values=[0,10,30,60];if(Number.isInteger(Number(current)) && Number(current)>0 && !values.includes(Number(current)))values.push(Number(current));
  return h`<label>Rappel avant le rendez-vous<select name="reminderMin">${values.map((v)=>h`<option value="${v}" ${Number(current || 0)===v?'selected':''}>${v ? v+' min avant' : 'Sans rappel'}</option>`)}</select></label><p class="tiny muted">Avec une heure renseignée. Autorise les notifications sur cet appareil et active les rappels dans Paramètres › Notifications et rappels. Fuseau du rendez-vous : ${timeZone}.</p>`;
};
export function agendaActions(date = today()) {
  return h`<div class="row wrapf"><button class="btn pri" data-act="agendaPlan" data-date="${date}">＋ Planifier une activité</button>${date <= today() ? h`<button class="btn" data-act="quickLog" data-date="${date}">✓ Raconter ma séance</button>` : ''}</div>`;
}
export function agendaDayCards(date) {
  return agendaEvents(S.events, date).map((e) => {
    const status = e.meta?.status || (e.completed ? 'done' : 'planned'), s = getSeance(e.sessionId), words = { done:'Faite', missed:'Pas faite', cancelled:'Annulée', planned:'Prévue' };
    const ref = S.history.some((x) => x.data?.agenda?.eventId === e.sourceId && x.data.agenda.occurrenceDate === e.occurrenceDate);
    return h`<article class="item agenda-event" data-agenda="${e.sourceId}"><div class="grow"><b>${e.title || 'Activité'}</b><div class="tiny muted">${[words[status],e.meta?.place || ctx().envs.find((v) => v.id === e.meta?.envId)?.name,e.time,e.meta?.minutes ? e.meta.minutes+' min prévues':'',e.recurrence ? 'chaque semaine':''].filter(Boolean).join(' · ')}</div>${e.on !== e.occurrenceDate ? h`<div class="tiny muted">Déplacée depuis le ${fmtDay(e.occurrenceDate+'T12:00:00')}</div>`:''}
      <div class="row wrapf">${date <= today() && status !== 'cancelled' ? h`<button class="btn sm pri" data-act="quickLog" data-id="${e.id}" data-date="${date}">${ref ? 'Compléter le bilan' : '✓ Faite · bilan rapide'}</button>`:''}
      <label class="tiny muted">Heure<input type="time" data-change="evTime" data-id="${e.id}" data-date="${date}" value="${e.time || ''}" aria-label="Heure de la séance"></label>
      ${s && !e.completed && status === 'planned' && date <= today() ? h`<button class="btn sm" data-act="play" data-id="${s.id}" data-event="${e.sourceId}" data-date="${e.on}">▶ Lancer</button>`:''}
      ${!s && status === 'planned' ? h`<button class="btn sm" data-act="agendaGenerate" data-id="${e.id}" data-date="${date}">Préparer une séance</button>`:''}
      <button class="btn sm" data-act="agendaEdit" data-id="${e.id}" data-date="${date}">Modifier / déplacer</button>
      ${date <= today() && !['missed','cancelled'].includes(status) ? h`<button class="btn sm ghost" data-act="agendaMiss" data-id="${e.id}" data-date="${date}">Pas faite</button>`:''}</div></div></article>`;
  });
}
export function openActivityPlan(date = today(), draft = {}) {
  S.agendaDraft = { date, activityId: Object.keys(ctx().activities)[0] || 'climbing_route', days: [], ...draft };
  const d = S.agendaDraft, c = ctx();
  // 8.34 : premier affichage d'un jour où tu as un créneau (« Mes disponibilités ») → heure, durée et lieu pré-remplis.
  const sl = !Object.keys(draft).length ? slotsOn(c.config?.availability?.slots, d.date)[0] : null, slEnv = sl?.envId && c.envs.find((e) => e.id === sl.envId && !e.archived);
  if (sl) { d.time = sl.from; d.minutes = toMin(sl.to) - toMin(sl.from); if (slEnv) d.place = slEnv.name; d.slotNote = `${DAY_LONG[sl.d]} ${sl.from}–${sl.to}${slEnv ? ` à ${slEnv.name}` : ''}`; }
  openSheet(h`<h2>Planifier une activité</h2><p class="small muted">Un rendez-vous sportif suffit. Tu compléteras ce que tu as fait après.</p>
    <form data-submit="agendaParse" class="row"><label class="grow">Dis-le simplement<input name="text" maxlength="300" placeholder="Tous les mardis et vendredis, voie à ma salle"></label><button class="btn" type="submit">Préparer</button></form>
    <form data-submit="agendaSave" class="stack"><label>Activité<select name="activityId">${options(d.activityId)}</select></label>
      <label>Lieu<input name="place" maxlength="80" value="${d.place || ''}" placeholder="Ma salle, maison…" list="agenda-places"></label>${placesList()}
      <fieldset><legend>Répéter chaque semaine <span class="tiny muted">(facultatif)</span></legend><div class="chips">${DAYS.map(([v,l]) => h`<label class="chk"><input type="checkbox" name="days" value="${v}" ${d.days.includes(v) ? 'checked':''}>${l}</label>`)}</div></fieldset>
      <label>Début<input type="date" name="date" value="${d.date}" required></label>
      ${d.slotNote ? h`<p class="tiny muted">🕒 Pré-rempli d’après ton créneau du ${d.slotNote} (heure, durée${d.place ? ', lieu' : ''}) : change-le si besoin.</p>` : ''}
      <details class="how mini" ${d.slotNote ? 'open' : ''}><summary>Heure, durée, rappel et autres options</summary><label>Heure (facultative)<input type="time" name="time" value="${d.time || ''}"></label>${reminderField(d.reminderMin)}<label>Durée prévue en minutes (facultative)<input type="number" name="minutes" min="1" max="1440" value="${d.minutes || ''}"></label><label>Fin de la répétition (facultative)<input type="date" name="until" value="${d.until || ''}"></label><label>Associer une séance (facultatif)<select name="sessionId"><option value="">Activité libre</option>${S.seances.items.filter((s) => !s.archived).map((s) => h`<option value="${s.id}">${s.name}</option>`)}</select></label><p class="tiny muted">Tu peux aussi exporter ou abonner ton agenda.</p></details>
      <p class="tiny muted">Fuseau : ${zone()}. Relis les jours et le lieu avant d’enregistrer.</p><button class="btn pri" type="submit">Enregistrer le planning</button></form>`);
}
ACT.agendaPlan = (el) => openActivityPlan(el.dataset.date || today());
ACT.agendaGenerate = async(el) => {const e=at(el.dataset.id,el.dataset.date);if(!e)return;closeSheet();const {openWizard}=await import('./views-climbplan.js');openWizard({sport:e.meta?.activityId || '',minutes:e.meta?.minutes || S.settings.defaultMinutes,envId:e.meta?.envId || '',forme:e.meta?.light?'tired':''});};
SUBMIT.agendaParse = (form) => { const d = parseAgendaText(new FormData(form).get('text')); if (!d) { toast('Choisis une activité et les jours dans le formulaire. Rien n’a été enregistré.'); return; } openActivityPlan(S.agendaDraft?.date || today(), { ...d, activityId: d.activityId || S.agendaDraft?.activityId }); };
SUBMIT.agendaSave = (form) => {
  const f = new FormData(form), d = Object.fromEntries(f), days = f.getAll('days').map(Number);
  if (!validDay(d.date) || (d.until && (!validDay(d.until) || d.until < d.date))) { toast('Vérifie les dates de début et de fin.', 4000, 'bad'); return; }
  const reminderMin=Number(d.reminderMin || 0);if(!Number.isInteger(reminderMin) || reminderMin<0 || reminderMin>1440 || (reminderMin>0 && !d.time)){toast('Renseigne une heure pour recevoir le rappel.',4000,'bad');return;}
  const ev = { id: uid(), date:d.date, time:d.time || '', title:label(d.activityId)+(d.place ? ' · '+String(d.place).trim():''), sessionId:d.sessionId || null, completed:false,
    recurrence:days.length ? { freq:'weekly', days, until:d.until || null, timeZone:zone() }:null,
    meta:{ ...placeMeta({ kind:'activity',activityId:d.activityId }, d.place),reminderMin,...(d.minutes ? {minutes:Number(d.minutes)}:{}) } };
  saveEvent(ev); closeSheet(); render(); toast('Planning enregistré'); go('home','cal');
};
export function openQuickLog(date = today(), event, parsed = [], evidence = null) {
  if (date > today()) { toast('Cette activité est dans le futur : planifie-la.'); return; }
  const linked = event ? S.history.filter((x) => x.data?.agenda?.eventId === event.sourceId && x.data.agenda.occurrenceDate === event.occurrenceDate) : [];
  const prior = linked.filter(editableQuickLog).sort((a,b) => (a.data.quickLog.order === 'main' ? -1 : 1) - (b.data.quickLog.order === 'main' ? -1 : 1) || a.id.localeCompare(b.id));
  S.quickDraft = { date, event, id:uid(), prior };
  const row = (x, i, removable = true) => h`<fieldset class="quick-row"><legend>${i === 0 ? 'Ma séance' : 'Autre activité'}</legend><label>Activité<select name="activity-${i}">${options(x.activityId || event?.meta?.activityId || Object.keys(ctx().activities)[0] || 'climbing_route')}</select></label>
    ${i ? h`<label>Quand ?<select name="order-${i}"><option value="before" ${x.order === 'before' ? 'selected':''}>Avant</option><option value="after" ${x.order !== 'before' ? 'selected':''}>Après</option></select></label>`:''}
    <div class="grid2"><label>Minutes (facultatif)<input name="minutes-${i}" type="number" min="1" max="1440" value="${x.minutes ?? ''}"></label><label>Effort<select name="rpe-${i}"><option value="">Je ne sais pas</option>${[[1,'Facile'],[2,'Modéré'],[3,'Normal'],[4,'Dur'],[5,'Très dur']].map(([v,l]) => h`<option value="${v}" ${Number(x.rpe)===v ? 'selected':''}>${l}</option>`)}</select></label></div>
    <details class="how mini"><summary>Lieu, performance et note</summary><label>Lieu<input name="place-${i}" value="${x.place || event?.meta?.place || ''}" maxlength="80"></label><label>Repère / performance déclarée<input name="performance-${i}" value="${x.performance || ''}" maxlength="100" placeholder="Ex. 6c max, 5 voies"></label><label>Note<textarea name="note-${i}" maxlength="600">${x.note || ''}</textarea></label></details>${i && removable ? h`<button class="btn sm ghost" type="button" data-act="quickRemove">Retirer cette activité</button>` : ''}</fieldset>`;
  const rows = parsed.length ? [...parsed].sort((a,b) => Number(b.order === 'main') - Number(a.order === 'main')) : prior.length ? prior.map((p) => ({activityId:p.data.activity,minutes:p.data.quickLog?.durationKnown === false ? '' : p.durationSeconds ? p.durationSeconds/60:'',rpe:p.data.rpe,place:p.data.context?.place,note:p.data.note,performance:p.data.quickLog?.performance,order:p.data.quickLog?.order})) : [{ activityId:event?.meta?.activityId, minutes:event?.meta?.minutes || '' }];
  S.quickDraft.rows = rows.length;
  openSheet(h`<h2>${event ? event.title : 'Raconter ma séance'}</h2><p class="small muted">${date.split('-').reverse().join('/')} · Quelques infos suffisent. Tu pourras compléter plus tard.</p>
    ${linked.length > prior.length ? h`<p class="tiny muted">Les séances détaillées déjà enregistrées sont conservées séparément.</p>` : ''}
    ${rows.length < prior.length ? h`<p class="tiny warn" role="status">${prior.length - rows.length} activité(s) précédemment enregistrée(s) seront retirées de ce bilan à l’enregistrement. Relis les activités ci-dessous.</p>` : ''}
    <form data-submit="quickParse" class="row"><label class="grow">Ce que j’ai fait<input name="text" maxlength="600" placeholder="1 h 30 de voie, 6c max, puis 20 min de bloc"></label><button class="btn" type="submit">Préparer le bilan</button></form><button class="btn sm ghost" data-act="quickAi">Essayer avec l’assistant IA</button>
    ${evidence ? aiEvidence(evidence) : ''}<p class="tiny warn" id="quick-ai-status" role="status"></p>
    <form data-submit="quickSave" class="stack">${rows.map((x,i) => row(x,i))}${rows.length < 8 ? h`<details class="how"><summary>＋ Ajouter autre chose avant / après</summary>${row({activityId:'climbing_boulder',order:'before'},rows.length,false)}<p class="tiny muted">Laisse la durée, la performance et la note vides pour ne pas ajouter cette activité.</p></details>`:''}
      <button class="btn pri big" type="submit">✓ Enregistrer ce que j’ai fait</button><p class="tiny muted">Aucune cotation, répétition ou charge ne sera inventée. Les repères libres restent des déclarations.</p></form>`);
}
ACT.quickLog = (el) => { const day=el.dataset.date || today(); openQuickLog(day,el.dataset.id ? at(el.dataset.id,day):null); };
ACT.quickRemove = (el) => {
  const row=el.closest('.quick-row');if(!row)return;
  const name=row.querySelector('select[name^="activity-"]')?.selectedOptions[0]?.textContent || 'Cette activité';
  row.hidden=true;for(const field of row.querySelectorAll('input,select,textarea'))field.disabled=true;
  const notice=document.createElement('p');notice.className='tiny warn quick-removed';notice.setAttribute('role','status');
  notice.innerHTML=h`${name} sera retirée du bilan à l’enregistrement. <button class="btn sm ghost" type="button" data-act="quickRestore">Annuler le retrait</button>`.s;row.after(notice);
};
ACT.quickRestore = (el) => {
  const notice=el.closest('.quick-removed'),row=notice?.previousElementSibling;if(!row?.classList.contains('quick-row'))return;
  row.hidden=false;for(const field of row.querySelectorAll('input,select,textarea'))field.disabled=false;notice.remove();
};
SUBMIT.quickParse = (form) => { const p=parseQuickActivities(new FormData(form).get('text')); if (!p.length) { toast('Je n’ai pas reconnu l’activité : utilise le formulaire. Rien n’a été enregistré.');return; } openQuickLog(S.quickDraft.date,S.quickDraft.event,p); };
SUBMIT.quickSave = (form) => {
  const q=S.quickDraft;if (!q) return;const f=Object.fromEntries(new FormData(form)), acts=[];
  for(let i=0;i<=q.rows;i++) if(f['activity-'+i] && (i<q.rows || f['minutes-'+i] || f['performance-'+i] || f['note-'+i] || f['rpe-'+i])) acts.push({activityId:f['activity-'+i],label:label(f['activity-'+i]),minutes:f['minutes-'+i],rpe:f['rpe-'+i],place:f['place-'+i],performance:f['performance-'+i],note:f['note-'+i],order:i ? f['order-'+i]:'main'});
  try {
    const entries=journalEntries({event:q.event,day:q.date,activities:acts,timeZone:zone(),standaloneId:q.id});
    const prior=q.prior.map((old)=>S.history.find((x)=>x.id===old.id && editableQuickLog(x) && x.data.agenda?.eventId===q.event?.sourceId && x.data.agenda?.occurrenceDate===q.event?.occurrenceDate)).filter(Boolean),retained=new Set();
    for(const e of entries) {
      const existing=prior.find((x)=>x.id===e.id && !retained.has(x.id)) || prior.find((x)=>!retained.has(x.id));
      if(existing) {updateHistory({...existing,...e,id:existing.id,data:{...existing.data,...e.data}});retained.add(existing.id);}
      else {const id=S.history.some((x)=>x.id===e.id) ? uid() : e.id;addHistory({...e,id});retained.add(id);}
    }
    for(const old of prior)if(!retained.has(old.id))deleteHistory(old.id);
    if(q.event) { const base=S.events.find((x) => x.id===q.event.sourceId); const old=S.events.find((x) => x.id===exceptionId(base.id,q.event.occurrenceDate)); saveEvent(occurrenceChange(base,q.event.occurrenceDate,{...old,date:q.event.on,completed:true,meta:{...q.event.meta,status:'done'}})); }
    S.quickDraft=null;closeSheet();render();toast('Bilan enregistré ✓');
  } catch(e) {toast(e.message,5000,'bad');}
};
ACT.agendaMiss = async(el) => {
  const e=at(el.dataset.id,el.dataset.date);if(!e) return;
  const hist=S.history.filter((x) => x.data?.agenda?.eventId===e.sourceId && x.data.agenda.occurrenceDate===e.occurrenceDate);
  if(hist.length && !(await ask('Retirer aussi le bilan de cette occurrence ?', {ok:'Pas faite',danger:true}))) return;
  for(const x of hist) deleteHistory(x.id);
  const base=S.events.find((x) => x.id===e.sourceId);saveEvent(occurrenceChange(base,e.occurrenceDate,{date:e.on,completed:false,meta:{...e.meta,status:'missed'}}));closeSheet();render();toast('Occurrence marquée « Pas faite »');
};
ACT.agendaEdit = (el) => {
  const e=at(el.dataset.id,el.dataset.date);if(!e)return;S.agendaEdit=e;
  openSheet(h`<h2>Modifier / déplacer</h2><form data-submit="agendaEditSave" class="stack"><label>Nom<input name="title" value="${e.title}" maxlength="120" required></label><label>Date<input type="date" name="date" value="${e.on}" required></label><label>Heure<input type="time" name="time" value="${e.time||''}"></label>${reminderField(e.meta?.reminderMin,e.recurrence?.timeZone)}<label>Lieu<input name="place" value="${placeOf(e)}" maxlength="80" list="agenda-places"></label>${placesList()}
    <label>Séance associée (facultative)<select name="sessionId"><option value="">Activité libre</option>${S.seances.items.filter((s)=>!s.archived).map((s)=>h`<option value="${s.id}" ${e.sessionId===s.id?'selected':''}>${s.name}</option>`)}</select></label>
    <label>Appliquer à<select name="scope"><option value="one">Cette occurrence seulement</option>${e.recurrence ? h`<option value="future">Cette occurrence et les suivantes</option><option value="series">Toute la série à venir (historique conservé)</option>`:''}</select></label>${e.recurrence ? h`<fieldset><legend>Jours de la série</legend><div class="chips">${DAYS.map(([v,l]) => h`<label class="chk"><input name="days" type="checkbox" value="${v}" ${(e.recurrence.days || [new Date(e.planned.date+'T12:00:00').getDay()]).includes(v)?'checked':''}>${l}</label>`)}</div></fieldset>`:''}
    <button class="btn pri" type="submit">Enregistrer les changements</button></form>${e.recurrence ? h`<button class="btn danger" data-act="agendaStop">Arrêter la répétition à partir de cette occurrence</button>`:''}<button class="btn danger" data-act="agendaCancel">Annuler cette occurrence</button><button class="btn ghost danger" data-act="agendaDelete">🗑 ${e.recurrence ? 'Supprimer toute la série du planning' : 'Supprimer du planning'}</button>`);
};
SUBMIT.agendaEditSave = (form) => {
  const data=new FormData(form),f=Object.fromEntries(data),e=S.agendaEdit,base=S.events.find((x) => x.id===e.sourceId);if(!validDay(f.date))return;
  const reminderMin=Number(f.reminderMin || 0);if(!Number.isInteger(reminderMin) || reminderMin<0 || reminderMin>1440 || (reminderMin>0 && !f.time)){toast('Renseigne une heure pour recevoir le rappel.',4000,'bad');return;}
  const patch={title:f.title,time:f.time,date:f.date,sessionId:f.sessionId || null,completed:e.completed,meta:{...placeMeta(e.meta,f.place),reminderMin}};
  if(f.scope==='one')saveEvent(occurrenceChange(base,e.occurrenceDate,patch));
  else {
    const from=f.scope==='series' ? (today()>base.date?today():base.date):e.occurrenceDate;
    if(f.date<from){toast('Les changements de série doivent commencer à cette date ou après.');return;}
    const days=data.getAll('days').map(Number);if(!days.length){toast('Choisis au moins un jour.');return;}
    const [old,next]=splitSeries(base,from,uid(),{...patch,date:f.date,meta:{...placeMeta(base.meta,f.place),reminderMin},recurrence:{...base.recurrence,days}});
    saveEvent(old);saveEvent(next);
  }
  closeSheet();render();toast('Planning mis à jour, bilans passés conservés');
};
ACT.agendaStop = async() => {const e=S.agendaEdit,base=S.events.find((x) => x.id===e.sourceId);if(!(await ask('Arrêter les occurrences à partir de cette date ? Les bilans passés sont conservés.')))return; const [old]=splitSeries(base,e.occurrenceDate,uid());saveEvent(old);closeSheet();render();};
/** Supprimer vraiment (créé par erreur, plus d'actualité) : les bilans déjà enregistrés restent dans l'historique. */
ACT.agendaDelete = async () => {
  const e=S.agendaEdit,base=e && S.events.find((x) => x.id===e.sourceId);if(!base)return;
  if(!(await ask(base.recurrence ? `Supprimer toute la série « ${base.title || 'Activité'} » du planning ?` : `Supprimer « ${base.title || 'Activité'} » du planning ?`,{ok:'Supprimer',danger:true,detail:'Les bilans déjà enregistrés restent dans ton historique.'})))return;
  deleteEvent(base.id);closeSheet();render();toast('Supprimé du planning');
};
ACT.agendaCancel = () => {const e=S.agendaEdit,base=S.events.find((x) => x.id===e.sourceId);saveEvent(occurrenceChange(base,e.occurrenceDate,{date:e.on,completed:false,meta:{...e.meta,status:'cancelled'}}));closeSheet();render();};

ACT.quickAi = async (el) => {
  const q = S.quickDraft, token = accountToken(), input = document.querySelector('[data-submit=quickParse] input');
  if (!q || !input?.value.trim()) { toast('Écris d’abord ce que tu as fait.'); return; }
  const message = input.value, current = () => accountMatches(token) && S.quickDraft === q && input.isConnected && input.value === message;
  if (el?.disabled) return; if (el) el.disabled = true;
  const notice = document.querySelector('#quick-ai-status'); if (notice) notice.textContent = '';
  try {
    const r = await api('POST', '/api/ai/agenda', { text: message, kind: 'journal', today: today() });
    if (!current()) return;
    if (!aiProposalReady(r.draft)) throw Object.assign(new Error('L’assistant n’a pas fourni une proposition vérifiable. Précise ton bilan ou utilise le formulaire.'), { status: 422 });
    openQuickLog(q.date, q.event, r.draft.activities, r.draft);
    toast('Proposition à relire : vérifie chaque activité avant d’enregistrer.', 6000);
  } catch (e) {
    if (!current()) return;
    if (notice?.isConnected) notice.textContent = `${e.message || 'Assistant indisponible.'} Aucun bilan n’a été enregistré.`;
    else toast(e.message, 5000, 'bad');
  } finally { if (accountMatches(token) && el?.isConnected) el.disabled = false; }
};
