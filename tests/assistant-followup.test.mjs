import assert from 'node:assert/strict';
import { findContext, buildAssistant, cleanAssistant } from '../server/assistant.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const ownItem={kind:'faq',id:'n-followup',op:'put',data:{q:'Comment ajouter ma séance ?',a:'Depuis le calendrier, note le sport et ton ressenti.'}};
await ok('contexte : même un « oui » conserve le brouillon, sans doublon avec le contenu public',()=>{
  const current={...ownItem,data:{...ownItem.data,a:'Ancienne réponse publique.'}},context=findContext('oui',{draft:[ownItem],globals:[current]});assert.equal(context.length,1);assert.equal(context[0].draft,true);assert.equal(context[0].data.a,ownItem.data.a);
  const matching=findContext('séance',{draft:[ownItem],faq:[[ownItem.data.q,'ancienne réponse',ownItem.id]]});assert.equal(matching.filter(x=>x.id===ownItem.id).length,1);const prompt=buildAssistant([{role:'user',content:'raccourcis-la en gardant le reste'}],matching);assert.match(prompt[0].content,/faq\/n-followup \(brouillon de cette conversation, non publié\)/);assert.match(prompt[0].content,/Conserve son identifiant/);
  assert.deepEqual(findContext('oui',{draft:[{kind:'constructor',id:'invalid',op:'put',data:{q:'x',a:'y'}}]}),[],'une propriété héritée ne constitue pas un type de contenu');
});
await ok('Qwen : réponse choisie et changement partiel validé sur la fiche déjà préparée',()=>{
  const raw={choices:[{message:{content:JSON.stringify({reply:'Raccourci.',changes:[{kind:'faq',id:ownItem.id,data:{a:'Note ta séance dans le calendrier.'}}]}),reasoning_content:'SECRET'}}]};
  const result=cleanAssistant(raw,{base:(kind,id)=>kind==='faq'&&id===ownItem.id?ownItem.data:null});assert.equal(result.items.length,1);assert.equal(result.items[0].data.q,ownItem.data.q);assert.equal(result.items[0].data.a,'Note ta séance dans le calendrier.');assert.equal(result.reply,'Raccourci.');assert.doesNotMatch(JSON.stringify(result),/SECRET/);
  const unsupported=cleanAssistant({reply:'Changement refusé',changes:[{kind:'constructor',id:'x',data:{q:'x',a:'y'}}]});assert.equal(unsupported.items.length,0);assert.match(unsupported.rejected[0],/ne peut pas/);
});
await ok('brouillon volumineux : aperçu réduit, identifiants conservés et données originales intactes',()=>{
  const draft=Array.from({length:20},(_,i)=>({kind:'exercise',id:'n-large-'+i,op:'put',data:{name:'Exercice '+i,summary:'Texte long '.repeat(5000),steps:Array.from({length:40},()=> 'Description détaillée '.repeat(300)),cues:Array.from({length:30},()=> 'Conseil '.repeat(500))}}));
  const before=JSON.stringify(draft),context=findContext('oui',{draft}),messages=buildAssistant([{role:'user',content:'Raccourcis seulement le dernier exercice.'}],context);
  assert.ok(messages[0].content.length<45000,'le contenu commun volumineux ne remplit pas tout le contexte du modèle');assert.match(messages[0].content,/exercise\/n-large-19/);assert.equal(JSON.stringify(draft),before);assert.equal(messages.at(-1).content,'Raccourcis seulement le dernier exercice.');
});

let answer={status:'ok',sources:['request','app/map'],reply:'Voici une FAQ.',changes:[ownItem]},prompt='';
const env=makeEnv({AI:{run:async(_model,input)=>{prompt=input.messages[0].content;return {choices:[{message:{content:JSON.stringify(answer)}}]};}}}),A=new Client(env),B=new Client(env),U=new Client(env);
await A.register('AdminFollowA');await B.register('AdminFollowB');await U.register('MemberFollow');await A.post('/api/admin/activate',{password:'Adm1n-Secret!'});await B.post('/api/admin/activate',{password:'Adm1n-Secret!'});
await U.post('/api/items',{changes:[{c:'goal',id:'private-goal',u:1000,d:{label:'DONNEE-PERSONNELLE-EXCLUE',status:'active'}}]});
let draftId;
await ok('suite réelle : réponse raccourcie dans le même brouillon et champs précédents conservés',async()=>{
  const first=await A.post('/api/admin/assistant',{messages:[{role:'user',content:'Ajoute une FAQ sur ma séance'}]});assert.equal(first.status,200);draftId=first.data.draftId;assert.ok(draftId);assert.equal(first.data.added,1);
  answer={status:'ok',sources:['draft:faq/'+ownItem.id],reply:'Raccourci.',changes:[{kind:'faq',id:ownItem.id,data:{a:'Note ta séance dans le calendrier.'}}]};const next=await A.post('/api/admin/assistant',{draftId,messages:[{role:'user',content:'Ajoute une FAQ sur ma séance'},{role:'assistant',content:'Voici une FAQ.'},{role:'user',content:'raccourcis-la, garde le reste'}]});
  assert.equal(next.status,200);assert.equal(next.data.draftId,draftId);assert.equal(next.data.added,1);assert.match(prompt,/faq\/n-followup \(brouillon de cette conversation, non publié\)/);assert.doesNotMatch(prompt,/DONNEE-PERSONNELLE-EXCLUE|Adm1n-Secret/);
  const saved=(await A.get('/api/admin/studio/'+draftId)).data;assert.equal(saved.set.status,'draft');assert.equal(saved.items.length,1);assert.equal(saved.items[0].data.q,ownItem.data.q);assert.equal(saved.items[0].data.a,'Note ta séance dans le calendrier.');assert.ok(!(await U.get('/api/global')).data.items.some(x=>x.id===ownItem.id));
});

await ok('brouillon d’un autre admin : jamais joint au modèle, jamais modifié par erreur',async()=>{
  answer={status:'ok',sources:['request','app/map'],reply:'Une nouvelle FAQ.',changes:[{kind:'faq',id:'n-own-b',data:{q:'Question B privée',a:'Réponse B privée'}}]};
  const r=await B.post('/api/admin/assistant',{draftId,messages:[{role:'user',content:'Ajoute une FAQ pour mon accueil'}]});assert.equal(r.status,200);assert.ok(r.data.draftId&&r.data.draftId!==draftId);assert.doesNotMatch(prompt,/faq\/n-followup|Comment ajouter ma séance/);
  const a=(await A.get('/api/admin/studio/'+draftId)).data;assert.equal(a.items.length,1);assert.equal(a.items[0].data.a,'Note ta séance dans le calendrier.');const b=(await B.get('/api/admin/studio/'+r.data.draftId)).data;assert.equal(b.items.length,1);assert.equal(b.items[0].id,'n-own-b');
});

await ok('brouillon publié : réponse suivante ne le reprend pas comme brouillon modifiable',async()=>{
  const publish=await A.post(`/api/admin/studio/${draftId}/publish`,{confirm:true});assert.equal(publish.status,200);
  answer={status:'ok',sources:['app/map'],reply:'Aucune autre modification.',changes:[]};const r=await A.post('/api/admin/assistant',{draftId,messages:[{role:'user',content:'Dis-moi simplement où sont les paramètres'}]});assert.equal(r.status,200);assert.equal(r.data.draftId,'');assert.equal(r.data.added,0);assert.doesNotMatch(prompt,/faq\/n-followup \(brouillon de cette conversation, non publié\)/);assert.equal((await A.get('/api/admin/studio/'+draftId)).data.set.status,'published');
});
done('tests suivi de conversation administrateur');
