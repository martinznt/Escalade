import assert from 'node:assert/strict';
import { agendaEvents, occursOn, occurrenceChange, splitSeries, journalEntries, parseAgendaText, dayInZone, timestampInZone, validDay } from '../public/agenda.js';
import { buildContext, entryActivity, loadAnalysis, journal } from '../public/brain.js';
import { interfaceMode, parseInterfaceRequest, sessionDifference, parseQuickActivities, trainingMemory } from '../public/experience.js';
import { planSession, generateFromPlan } from '../public/generator.js';
import { buildFromParts } from '../public/climbplan.js';
import { weekPlan, conflicts, weekReview } from '../public/planning.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';
const base={id:'habit-1',date:'2026-09-01',title:'Voie · Nicole Abar',time:'18:00',completed:false,recurrence:{freq:'weekly',days:[2,5],timeZone:'Europe/Paris',until:null},meta:{kind:'activity',activityId:'climbing_route',place:'Nicole Abar'}};
await ok('règle mardi/vendredi : occurrences indépendantes, calendrier compatible avec les anciennes règles',()=>{
  const list=agendaEvents([base],'2026-09-01','2026-09-08');assert.deepEqual(list.map(x=>x.on),['2026-09-01','2026-09-04','2026-09-08']);
  assert.equal(agendaEvents([{...base,completed:true}],'2026-09-08')[0].completed,false);
  assert.equal(agendaEvents([{...base,recurrence:{freq:'weekly'}}],'2026-09-01','2026-09-08').length,2);
});
await ok('bilan, déplacement, annulation et pas faite n’affectent qu’une occurrence',()=>{
  const done=occurrenceChange(base,'2026-09-01',{completed:true,meta:{status:'done'}});
  assert.equal(agendaEvents([base,done],'2026-09-01')[0].completed,true);assert.equal(agendaEvents([base,done],'2026-09-08')[0].completed,false);
  const moved=occurrenceChange(base,'2026-09-04',{date:'2026-09-05',meta:{status:'planned'}});
  assert.equal(agendaEvents([base,moved],'2026-09-04').length,0);const on=agendaEvents([base,moved],'2026-09-05')[0];assert.equal(on.planned.date,'2026-09-04');assert.equal(on.on,'2026-09-05');
  for(const status of ['cancelled','missed'])assert.equal(agendaEvents([base,occurrenceChange(base,'2026-09-04',{meta:{status}})],'2026-09-04')[0].meta.status,status);
});
await ok('modification ou arrêt de série : passé et ancienne réalité conservés',()=>{
  const [old,next]=splitSeries(base,'2026-09-08','habit-2',{title:'Nouveau lieu',recurrence:{days:[4]}});
  const events=[old,next];assert.equal(agendaEvents(events,'2026-09-01')[0].title,base.title);assert.equal(agendaEvents(events,'2026-09-08').length,0);assert.equal(agendaEvents(events,'2026-09-10')[0].title,'Nouveau lieu');
  const [stopped]=splitSeries(base,base.date,'unused');assert.equal(agendaEvents([stopped],base.date,'2026-09-08').length,0);
  const [,later]=splitSeries(base,'2026-09-08','later',{date:'2026-09-11'});assert.equal(later.date,'2026-09-11');assert.equal(agendaEvents([later],'2026-09-08').length,0);
});
await ok('dates civiles et fuseaux : fin d’année, changement d’heure et heure inexistante',()=>{
  assert.equal(validDay('2026-02-30'),false);assert.equal(dayInZone(Date.parse('2026-12-31T23:30:00Z'),'Europe/Paris'),'2027-01-01');
  assert.equal(new Date(timestampInZone('2026-10-25','12:00','Europe/Paris')).toISOString(),'2026-10-25T11:00:00.000Z');
  assert.throws(()=>timestampInZone('2026-03-29','02:30','Europe/Paris'),/heure/);
});
await ok('voie et bloc : journal idempotent, prévu conservé, charge réelle prise en compte sans performance inventée',()=>{
  const event=agendaEvents([base],'2026-09-01')[0], params={event,day:'2026-09-01',timeZone:'Europe/Paris',now:Date.parse('2026-09-02T10:00Z'),activities:[{activityId:'climbing_route',label:'Voie',minutes:90,rpe:3,performance:'6c'},{activityId:'climbing_boulder',label:'Bloc',minutes:20,rpe:4,order:'before'}]};
  const records=journalEntries(params);assert.deepEqual(records.map(x=>x.id),journalEntries(params).map(x=>x.id));assert.equal(records[0].data.agenda.planned.title,base.title);assert.equal(records[1].data.quickLog.order,'before');
  const c=buildContext({history:records,now:params.now});assert.equal(entryActivity(records[1],c),'climbing_boulder');assert.equal(loadAnalysis(c).acute,350);assert.equal(c.perfs.length,0);
  assert.match(journal(c).find(x=>x.id===records[0].id).text,/Repère déclaré : 6c/);assert.match(journal(c).find(x=>x.id===records[1].id).text,/Avant/);
  assert.deepEqual(records[0].data.exercises,[]);assert.equal(journalEntries({...params,activities:[{activityId:'running'}]})[0].data.quickLog.durationKnown,false);
  assert.match(journal(buildContext({now:params.now,history:journalEntries({...params,activities:[{activityId:'running'}]})}))[0].text,/Durée non renseignée/);
  assert.throws(()=>journalEntries({...params,day:'2026-09-03'}),/future/);
});
await ok('commandes : récurrence, interface et récit structurés sans sauvegarde implicite',()=>{
  const d=parseAgendaText('Tous les mardis et vendredis, escalade voie à Nicole Abar');assert.deepEqual(d.days,[2,5]);assert.equal(d.place,'Nicole Abar');assert.equal(d.activityId,'climbing_route');
  assert.equal(parseInterfaceRequest('Je veux une interface plus compliquée'),'advanced');assert.equal(parseInterfaceRequest('Je veux une séance simple'),null);
  const p=parseQuickActivities('1 h 30 de voie, 6c max, puis 20 min de bloc');assert.equal(p.length,2);assert.equal(p[0].minutes,90);assert.equal(p[1].minutes,20);
  const before=parseQuickActivities('20 min de bloc avant 90 min de voie puis 10 min de course');assert.deepEqual(before.map(x=>x.order),['before','main','after']);
  assert.deepEqual(parseQuickActivities('J’ai fait 20 min de bloc avant, puis ma séance de voie').map(x=>x.order),['before','main']);
});
await ok('planning : annulée libère le créneau, pas faite reste au bilan et deux rendez-vous ne partagent pas le même historique',()=>{
  const now=Date.parse('2026-09-01T12:00Z'), event={...base,recurrence:null},cancelled=occurrenceChange(event,event.date,{meta:{status:'cancelled'}});
  const c=buildContext({now,events:[event,cancelled]});assert.equal(weekPlan(c,{from:event.date,perWeek:1}).sessions.length,1);assert.equal(conflicts(c).length,0);assert.equal(weekReview(c,now).planned,0);
  const other={...event,id:'another'},entry=journalEntries({event:agendaEvents([event],event.date)[0],day:event.date,activities:[{activityId:'climbing_route',minutes:90}],now,timeZone:'UTC'})[0];
  const review=weekReview(buildContext({now,events:[event,other],history:[entry]}),now);assert.equal(review.planned,2);assert.equal(review.plannedDone,1);
  const missed=occurrenceChange(event,event.date,{meta:{status:'missed'}});const m=weekReview(buildContext({now,events:[event,missed]}),now);assert.equal(m.planned,1);assert.equal(m.plannedDone,0);
});
await ok('comparaison de séance : conserve, adapte, ajoute et retire sans changer les séances',()=>{
  const a={exercises:[{name:'Tractions',sets:3,rest:90},{name:'Squats',sets:3}]},b={exercises:[{name:'Tractions',sets:2,rest:90},{name:'Gainage',sets:3}]};
  const out=sessionDifference(a,b);assert.ok(out.some(x=>/séries/.test(x.text)));assert.ok(out.some(x=>/Retiré/.test(x.text)));assert.equal(a.exercises[0].sets,3);
});
await ok('mode simple par défaut et même contexte métier dans les deux modes',()=>{
  assert.equal(interfaceMode({}),'simple');const now=Date.parse('2026-10-04T12:00Z'),a=buildContext({now,settings:{interfaceMode:'simple'}}),b=buildContext({now,settings:{interfaceMode:'advanced'}});
  assert.deepEqual(loadAnalysis(a),loadAnalysis(b));assert.deepEqual(trainingMemory(a),trainingMemory(b));assert.equal(trainingMemory(a).length,0);
  const opts={activityId:'conditioning',minutes:30,seed:'same-seed'};assert.deepEqual(planSession(opts,a),planSession(opts,b));
  const parts=[{type:'warmup',minutes:5},{type:'main',activity:'conditioning',minutes:20},{type:'cool',minutes:5}];
  const clean=(value)=>JSON.parse(JSON.stringify(value,(key,v)=>['id','createdAt','updatedAt'].includes(key)?undefined:v));
  assert.deepEqual(clean(generateFromPlan(planSession(opts,a),a)),clean(generateFromPlan(planSession(opts,b),b)));
  assert.deepEqual(clean(buildFromParts(parts,a,{seed:'same-seed'})),clean(buildFromParts(parts,b,{seed:'same-seed'})));
});
await ok('mémoire : plusieurs signaux, provenance et correction explicite',()=>{
  const now=Date.now(), hist=Array.from({length:3},(_,i)=>({id:'m'+i,startedAt:now-i*86400000,durationSeconds:1800,data:{swaps:[{from:'Tractions',to:'Rowing'}],exercises:[]}}));
  assert.equal(trainingMemory(buildContext({now,history:hist.slice(0,1)})).length,0);
  const memory=trainingMemory(buildContext({now,history:hist}));assert.equal(memory[0].suggested,'evite');assert.ok(memory[0].at);assert.equal(memory[0].source,'historique et retours');
  const corrected=buildContext({now,history:hist,items:[{c:'pref',id:'p',u:now,d:{key:memory[0].key,label:'Tractions',value:'neutre',source:'explicit'}}]});assert.equal(trainingMemory(corrected).length,1);assert.equal(trainingMemory(corrected)[0].value,'neutre');
  const newest={c:'pref',id:'correction',u:now,d:{key:memory[0].key,label:'Tractions',value:'neutre',source:'explicit'}},older={...newest,id:'old-questionnaire',u:now-100,value:undefined,d:{...newest.d,value:'evite',source:'questionnaire'}};
  for(const items of [[newest,older],[older,newest]])assert.equal(buildContext({now,items}).prefs[memory[0].key].value,'neutre');
});
const env=makeEnv(),client=new Client(env),other=new Client(env);await client.register('Agenda');await other.register('AutreAgenda');
await ok('API : mode synchronisé propre au compte, anciens clients compatibles',async()=>{
  assert.equal((await client.post('/api/settings',{settings:{interfaceMode:'advanced',defaultMinutes:45}})).status,200);
  await client.post('/api/settings',{settings:{defaultMinutes:30}});assert.equal((await client.get('/api/settings')).data.settings.interfaceMode,'advanced');assert.equal((await other.get('/api/settings')).data.settings.interfaceMode,undefined);
});
await ok('API : récurrence, exceptions et métadonnées de bilan survivent au stockage',async()=>{
  const r=await client.post('/api/calendar',base);assert.equal(r.status,200);assert.deepEqual(r.data.event.recurrence.days,[2,5]);
  const exception=occurrenceChange(base,'2026-09-01',{completed:true,meta:{status:'done'}});assert.equal((await client.post('/api/calendar',exception)).status,200);
  const events=(await client.get('/api/calendar')).data.events;assert.equal(agendaEvents(events,'2026-09-01')[0].completed,true);assert.equal(agendaEvents(events,'2026-09-08')[0].completed,false);
  const rec=journalEntries({event:agendaEvents(events,'2026-09-01')[0],day:'2026-09-01',timeZone:'Europe/Paris',activities:[{activityId:'climbing_route',minutes:90,performance:'6c'}]})[0];
  assert.equal((await client.post('/api/history',rec)).status,200);await client.post('/api/history',rec);const h=(await client.get('/api/history')).data.history;assert.equal(h.length,1);assert.equal(h[0].data.quickLog.performance,'6c');assert.equal(h[0].data.agenda.eventId,base.id);assert.equal((await other.get('/api/history')).data.history.length,0);
});
await ok('API : écritures plus anciennes conservées en conflit, contrôle propriétaire et dates invalides',async()=>{
  const version=Date.now();assert.equal((await client.post('/api/calendar',{...base,meta:{...base.meta,version}})).status,200);
  assert.equal((await client.post('/api/calendar',{...base,title:'Ancien',meta:{version:version-1}})).status,409);
  assert.equal((await other.post('/api/calendar',base)).status,409);assert.equal((await client.post('/api/calendar',{...base,date:'2026-02-30'})).status,400);
});
done('tests agenda / expérience');
