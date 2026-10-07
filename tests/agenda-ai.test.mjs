import assert from 'node:assert/strict';
import { cleanAgendaDraft, interpretAgenda } from '../server/agenda.js';
import { calendarIcsEvents, occurrenceChange } from '../public/agenda.js';
import { buildIcs } from '../public/ics.js';
import { reminderText } from '../server/push.js';
import { Client, makeEnv, ok, done, ORIGIN } from './helpers.mjs';
await ok('sortie IA : schéma et activités autorisés, inconnues non inventées',()=>{
  assert.equal(cleanAgendaDraft('pas du JSON'),null);assert.equal(cleanAgendaDraft({activities:[{activityId:'supprimer-la-base'}]}),null);
  const d=cleanAgendaDraft({activities:[{activityId:'climbing_route',minutes:null,note:'<script>'}],days:[2,5,8],confidence:'certain'});assert.equal(d.activities[0].minutes,'');assert.deepEqual(d.days,[2,5]);assert.equal(d.confidence,'low');assert.equal(d.activities[0].note,'<script>');
});
await ok('IA indisponible, réponse invalide et délai : échec explicite et aucun enregistrement',async()=>{
  await assert.rejects(interpretAgenda({}, {message:'voie'}),e=>e.status===503);
  const invalid=makeEnv({AI:{run:async()=>({response:'???'})}}),slow=makeEnv({AI:{run:()=>new Promise(()=>{})}});
  await new Client(invalid).register('AgendaInvalid');await new Client(slow).register('AgendaSlow');
  await assert.rejects(interpretAgenda(invalid, {message:'voie'}),e=>e.status===502);
  await assert.rejects(interpretAgenda(slow, {message:'voie'},10),e=>e.status===504);
  assert.equal((await invalid.DB.prepare('SELECT COUNT(*) n FROM calendar_events').first()).n,0);
  assert.equal((await slow.DB.prepare('SELECT COUNT(*) n FROM history').first()).n,0);
});
const env=makeEnv({AI:{run:async()=>({response:JSON.stringify({status:'ok',basis:'request',sources:['request','app/model'],activities:[{activityId:'climbing_route',minutes:90},{activityId:'climbing_boulder',minutes:20,order:'before'}],confidence:'medium'})})}}),u=new Client(env);await u.register('AgendaAI');
await ok('API interprète un brouillon sans sauvegarder, garde le modèle configurable et refuse les visiteurs',async()=>{
  assert.equal((await new Client(env).post('/api/ai/agenda',{text:'voie'})).status,401);
  const r=await u.post('/api/ai/agenda',{text:'1 h 30 de voie et 20 min de bloc avant'});assert.equal(r.status,200);assert.equal(r.data.draft.activities.length,2);assert.equal((await u.get('/api/history')).data.history.length,0);assert.equal((await u.get('/api/calendar')).data.events.length,0);
  delete env.AI;assert.equal((await u.post('/api/ai/agenda',{text:'voie'})).status,503);
});
await ok('agenda externe : mardi/vendredi, annulation et déplacement cohérents',()=>{
  const e={id:'ical-habit',title:'Voie',date:'2026-09-01',time:'18:00',recurrence:{freq:'weekly',days:[2,5]},meta:{kind:'activity',activityId:'climbing_route'}};
  const cancelled=occurrenceChange(e,'2026-09-04',{meta:{status:'cancelled'}}),moved=occurrenceChange(e,'2026-09-08',{date:'2026-09-09',time:'19:00'});
  const events=calendarIcsEvents([e,cancelled,moved]),ics=buildIcs(events);assert.equal(events.length,2);assert.match(ics,/BYDAY=TU,FR/);assert.match(ics,/EXDATE:20260904T180000,20260908T180000/);assert.match(ics,/DTSTART:20260909T190000/);
  assert.equal(calendarIcsEvents([{...e,completed:true}])[0].done,false);
});
await ok('export horaire : fuseau, fin UTC et exceptions restent cohérents à travers le changement d’heure',()=>{
  const e={id:'tz-habit',title:'Voie',date:'2026-10-23',time:'18:00',recurrence:{freq:'weekly',days:[2,5],timeZone:'Europe/Paris',until:'2026-10-30'},meta:{minutes:90}};
  const moved=occurrenceChange(e,'2026-10-27',{date:'2026-10-28',time:'19:00'}),ics=buildIcs(calendarIcsEvents([e,moved])).replace(/\r\n /g,'');
  assert.match(ics,/DTSTART;TZID=Europe\/Paris:20261023T180000/);assert.match(ics,/UNTIL=20261030T225959Z/);assert.match(ics,/EXDATE;TZID=Europe\/Paris:20261027T180000/);assert.match(ics,/DTSTART;TZID=Europe\/Paris:20261028T190000/);assert.match(ics,/DURATION:PT90M/);
});
await ok('abonnement réel : anciennes exceptions conservées et aucune alarme sur une occurrence terminée',async()=>{
  const feedEnv=makeEnv(),u=new Client(feedEnv);await u.register('FeedAgenda');
  const e={id:'feed-habit',title:'Voie',date:'2026-01-06',time:'18:00',recurrence:{freq:'weekly',days:[2,5]},meta:{minutes:90}};
  await u.post('/api/calendar',e);await u.post('/api/calendar',occurrenceChange(e,'2026-01-09',{meta:{status:'cancelled'}}));
  const done=occurrenceChange(e,'2026-01-13',{completed:true,meta:{status:'done'}});await u.post('/api/calendar',done);
  const link=(await u.post('/api/ical')).data.url,response=await new Client(feedEnv).get(link.replace(ORIGIN,'')),ics=(await response.res.text()).replace(/\r\n /g,'');assert.equal(response.status,200);
  assert.match(ics,/EXDATE:20260109T180000,20260113T180000/);const finished=ics.split('BEGIN:VEVENT').find(x=>x.includes('UID:ev-'+done.id+'@'));assert.ok(finished);assert.doesNotMatch(finished,/BEGIN:VALARM/);
});
await ok('rappel : respecte l’exception même si elle a été déplacée hors du jour demandé',async()=>{
  const e={id:'rem-habit',title:'Voie à Nicole Abar',date:'2026-09-01',time:'18:00',recurrence:{freq:'weekly',days:[2,5]},meta:{kind:'activity',activityId:'climbing_route'}};
  await u.post('/api/calendar',e);assert.match((await reminderText(env,(await u.get('/api/auth/me')).data.user.id,'Europe/Paris',Date.parse('2026-09-04T12:00Z'))).body,/Nicole Abar/);
  await u.post('/api/calendar',occurrenceChange(e,'2026-09-04',{date:'2026-09-05'}));
  assert.doesNotMatch((await reminderText(env,(await u.get('/api/auth/me')).data.user.id,'Europe/Paris',Date.parse('2026-09-04T12:00Z'))).body,/Nicole Abar/);
  assert.match((await reminderText(env,(await u.get('/api/auth/me')).data.user.id,'Europe/Paris',Date.parse('2026-09-05T12:00Z'))).body,/Nicole Abar/);
});
done('tests interprétation / agenda externe');
