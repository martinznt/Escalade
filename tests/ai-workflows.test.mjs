import assert from 'node:assert/strict';
import { DEFAULT_MODEL, aiStatus } from '../server/ai-runtime.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

let calls=0,reply={reply:'Une séance courte suffit.',actions:[{command:'Fais une séance de 20 minutes pour les jambes',label:'Préparer la séance'},{to:'settings/admin'},{to:'https://evil.test/'}]},lastInput;
const env=makeEnv({AI:{run:async(model,input)=>{calls++;lastInput={model,input};return {choices:[{message:{content:JSON.stringify({status:'ok',basis:'request',sources:['request'],...reply}),reasoning_content:'SECRET-RAISONNEMENT'}}]};}}});
const A=new Client(env),B=new Client(env),U=new Client(env),guest=new Client(env);
await A.register('AIRoot');await B.register('AIContent');await U.register('AIMember');await A.post('/api/admin/activate',{password:'Adm1n-Secret!'});await B.post('/api/admin/activate',{password:'Adm1n-Secret!'});
const bid=(await B.get('/api/auth/me')).data.user.id;

await ok('réglages IA : réservés aux admins, consultation sans appel modèle',async()=>{
  for(const client of [guest,U])for(const method of ['GET','POST'])assert.equal((await client.call(method,'/api/admin/ai',method==='GET'?undefined:{model:DEFAULT_MODEL,budget:8000})).status,client===guest?401:403);
  const before=calls,status=await A.get('/api/admin/ai');assert.equal(status.status,200);assert.equal(status.data.available,true);assert.equal(status.data.model,DEFAULT_MODEL);assert.equal(status.data.estimated,true);assert.equal(status.data.budget,8000);assert.ok(status.data.models.length>=2);assert.equal(calls,before);
  assert.equal((await A.post(`/api/admin/users/${bid}/roles`,{roles:['content']})).status,200);assert.equal((await B.get('/api/admin/ai')).status,200);assert.equal((await B.post('/api/admin/ai',{model:DEFAULT_MODEL,budget:1000})).status,403);assert.equal((await A.get('/api/admin/ai')).data.budget,8000);
});

await ok('réglages IA : intelligence autorisée, allowlist, validation et trace sans secret',async()=>{
  await A.post(`/api/admin/users/${bid}/roles`,{roles:['intelligence']});const r=await B.post('/api/admin/ai',{model:DEFAULT_MODEL,budget:7000});assert.equal(r.status,200);assert.equal(r.data.budget,7000);
  for(const body of [{model:'constructor',budget:7000},{model:'inconnu',budget:7000},{model:DEFAULT_MODEL,budget:10000},{model:DEFAULT_MODEL,budget:1100.5}])assert.equal((await B.post('/api/admin/ai',body)).status,400,JSON.stringify(body));
  assert.equal((await A.get('/api/admin/ai')).data.budget,7000);const audit=(await A.get('/api/admin/audit')).data.events.find(x=>x.action==='ai-config');assert.ok(audit);assert.equal(audit.after.model,DEFAULT_MODEL);assert.equal(audit.after.budget,7000);assert.doesNotMatch(JSON.stringify(audit),/Adm1n-Secret|motdepasse|SECRET/);
  await A.post(`/api/admin/users/${bid}/roles`,{roles:['content']});
});

await ok('coach Qwen : réponse et boutons séparés, aucune donnée enregistrée par suggestion',async()=>{
  const before=(await U.get('/api/history')).data.history.length,r=await U.post('/api/ai/chat',{messages:[{role:'user',content:'j’ai pas longtemps pour mes jambes'}],profile:'Sport déclaré : renforcement'});
  assert.equal(r.status,200);assert.equal(r.data.reply,reply.reply);assert.equal(r.data.actions.length,1);assert.match(r.data.actions[0].summary,/20 min/);assert.doesNotMatch(JSON.stringify(r.data),/SECRET-RAISONNEMENT|settings\/admin|evil\.test/);assert.equal(lastInput.model,DEFAULT_MODEL);assert.equal((await U.get('/api/history')).data.history.length,before);assert.equal((await U.get('/api/calendar')).data.events.length,0);
  assert.equal((await U.post('/api/ai/chat',{messages:[{role:'assistant',content:'seul'}]})).status,400);
});

await ok('création, objectif, intention et agenda Qwen : formats utiles, brouillons sans sauvegarde',async()=>{
  reply={type:'exercise',name:'Traction simple',summary:'Tire le corps vers la barre.',caps:{tirage_vertical:0.8},prim:['biceps'],needs:['bar'],steps:['Monte sans élan.']};let r=await U.post('/api/ai/draft',{text:'une traction simple',kind:'exercise'});assert.equal(r.status,200);assert.equal(r.data.draft.name,'Traction simple');assert.deepEqual(r.data.draft.caps,{tirage_vertical:0.8});
  reply={label:'Douze tractions',metricId:'max_tractions',target:12,caps:{tirage_vertical:0.9},activityId:'strength'};r=await U.post('/api/ai/goal',{text:'Faire 12 tractions',profile:'Matériel déclaré : barre'});assert.equal(r.status,200);assert.equal(r.data.goal.target,12);assert.equal(r.data.goal.metricId,'max_tractions');assert.match(lastInput.input.messages[0].content,/Matériel déclaré : barre/);
  reply={label:'Force des jambes',summary:'Un travail de jambes.',caps:{force_jambes:0.8}};r=await U.post('/api/ai/intent',{text:'mieux pousser sur les jambes'});assert.equal(r.status,200);assert.deepEqual(r.data.intent.caps,{force_jambes:0.8});
  reply={activities:[{activityId:'climbing_route',minutes:null}],days:[2,5],place:'Nicole Abar',confidence:'medium'};r=await U.post('/api/ai/agenda',{text:'Tous les mardis et vendredis voie à Nicole Abar',kind:'planning'});assert.equal(r.status,200);assert.deepEqual(r.data.draft.days,[2,5]);assert.equal(r.data.draft.activities[0].minutes,'');assert.equal((await U.get('/api/history')).data.history.length,0);assert.equal((await U.get('/api/calendar')).data.events.length,0);
});

await ok('test IA administrateur : réponse JSON bornée, réserve comptée et trois essais maximum',async()=>{
  reply={reply:'L’IA est disponible.'};const beforeCalls=calls,beforeUsed=(await aiStatus(env)).used;
  assert.equal((await guest.post('/api/admin/ai/test',{})).status,401);assert.equal((await U.post('/api/admin/ai/test',{})).status,403);assert.equal((await B.post('/api/admin/ai/test',{})).status,403);assert.equal(calls,beforeCalls);
  const first=await A.post('/api/admin/ai/test',{});assert.equal(first.status,200);assert.equal(first.data.reply,'L’IA est disponible.');assert.ok(Number.isFinite(first.data.elapsedMs)&&first.data.elapsedMs>=0);assert.equal(first.data.model,DEFAULT_MODEL);assert.equal(lastInput.input.max_tokens,100);assert.deepEqual(lastInput.input.response_format,{type:'json_object'});assert.ok(first.data.used>beforeUsed);assert.doesNotMatch(JSON.stringify(first.data),/SECRET-RAISONNEMENT/);
  assert.equal((await A.post('/api/admin/ai/test',{})).status,200);assert.equal((await A.post('/api/admin/ai/test',{})).status,200);const used=(await aiStatus(env)).used;assert.equal((await A.post('/api/admin/ai/test',{})).status,429);assert.equal(calls,beforeCalls+3);assert.equal((await aiStatus(env)).used,used);
});

await ok('test IA : sorties mal formées et panne refusées, quota expliqué sans détail fournisseur',async()=>{
  const cases=[{name:'InvalidText',AI:{run:async()=>({choices:[{message:{content:'pas de JSON'}}]})},status:502},{name:'InvalidReply',AI:{run:async()=>({choices:[{message:{content:'{"reply":{"nested":"invalide"}}'}}]})},status:502},{name:'ProviderDown',AI:{run:async()=>{throw new Error('credential-secret-interne');}},status:503},{name:'ProviderQuota',AI:{run:async()=>{throw new Error('daily neurons quota credential-secret-interne');}},status:429}];
  for(const test of cases){const client=new Client(makeEnv({AI:test.AI}));await client.register('AITest'+test.name);await client.post('/api/admin/activate',{password:'Adm1n-Secret!'});const r=await client.post('/api/admin/ai/test',{});assert.equal(r.status,test.status,test.name+': '+JSON.stringify(r.data));assert.doesNotMatch(JSON.stringify(r.data),/credential-secret|nested/);if(test.status===429)assert.equal(r.data.quota,true);}
});

await ok('quota commun : coach, planning, fiches et administration refusés avant tout appel',async()=>{
  const quotaEnv=makeEnv({AI:{run:async()=>{throw new Error('ne doit jamais appeler le fournisseur');}}}),q=new Client(quotaEnv);await q.register('AIQuotaRoot');await q.post('/api/admin/activate',{password:'Adm1n-Secret!'});await q.post('/api/admin/ai',{model:DEFAULT_MODEL,budget:1000});
  const key='ai:budget:'+new Date().toISOString().slice(0,10);await quotaEnv.DB.prepare('INSERT INTO system_state(key,value) VALUES(?,?)').bind(key,'1000').run();
  const cases=[['/api/ai/chat',{messages:[{role:'user',content:'Comment progresser ?'}]}],['/api/ai/agenda',{text:'voie mardi soir'}],['/api/ai/draft',{text:'traction stricte'}],['/api/ai/goal',{text:'progresser aux tractions'}],['/api/ai/intent',{text:'travailler les jambes'}],['/api/ai/session-edit',{text:'ramène à 20 minutes',phases:[{name:'Jambes',minutes:30}]}],['/api/admin/assistant',{messages:[{role:'user',content:'Ajoute une question'}]}],['/api/admin/studio/ai',{kind:'faq',text:'une aide sur les tractions'}],['/api/admin/lab',{text:'Les visiteurs ne trouvent pas le calendrier'}],['/api/admin/assistant/code',{messages:[{role:'user',content:'Renomme un bouton'}]}],['/api/admin/ai/test',{}]];
  for(const [path,body] of cases){const r=await q.post(path,body);assert.equal(r.status,429,path+': '+JSON.stringify(r.data));assert.equal(r.data.quota,true,path);assert.match(r.data.error,/gratuit/);}
  assert.equal((await aiStatus(quotaEnv)).used,1000);assert.equal((await quotaEnv.DB.prepare('SELECT COUNT(*) n FROM change_sets').first()).n,0);assert.equal((await q.get('/api/history')).data.history.length,0);
});

await ok('binding absent : administration indique l’état sans promettre un fournisseur actif',async()=>{
  const no=new Client(makeEnv());await no.register('AIUnavailable');await no.post('/api/admin/activate',{password:'Adm1n-Secret!'});const r=await no.get('/api/admin/ai');assert.equal(r.status,200);assert.equal(r.data.available,false);assert.equal(r.data.used,0);
});
done('tests parcours et réglages IA');
