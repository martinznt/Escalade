// La base SQLite utilise les mêmes UPSERT conditionnels que D1 ; les fournisseurs restent simulés.
import assert from 'node:assert/strict';
import { makeD1 } from './d1shim.mjs';
import { ok, done } from './helpers.mjs';
import { AI_MODELS, DEFAULT_MODEL, aiError, aiPreferences, aiStatus, estimateNeurons, runAI, saveAIConfig, responseText } from '../server/ai-runtime.js';
import { extractJson } from '../server/ai.js';
import { cleanAdminDraft, cleanLab } from '../server/studio.js';
import { cleanEdits } from '../server/codeedit.js';

const LLAMA='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const makeAIEnv=(extra={})=>{const DB=makeD1();DB.raw.exec('CREATE TABLE system_state (key TEXT PRIMARY KEY,value TEXT NOT NULL)');return {DB,AI:{run:async()=>({response:'{}'})},...extra};};
const input={messages:[{role:'system',content:'Réponds en français.'},{role:'user',content:'Une séance simple'}],max_tokens:2400};
const today=()=>new Date().toISOString().slice(0,10);
const defaultPreferences={answerStyle:'direct',detail:'standard',reasoning:'low',creativity:0.1,askWhenUnclear:true,sourcePolicy:'verified_only',requireConfirmation:true};

await ok('Qwen : format JSON, sortie bornée et entrée du client conservée',async()=>{
  let called;const env=makeAIEnv({AI:{run:async(model,payload)=>{called={model,payload};return {choices:[{message:{content:'{"reply":"Salut"}',reasoning_content:'ne jamais afficher'}}]};}}});
  const before=JSON.stringify(input),out=await runAI(env,{...input,max_tokens:99999});
  assert.equal(called.model,DEFAULT_MODEL);assert.equal(called.payload.max_tokens,2400);assert.deepEqual(called.payload.response_format,{type:'json_object'});assert.match(called.payload.messages[0].content,/\/no_think$/);
  assert.equal(JSON.stringify(input),before);assert.equal(responseText(out),'{"reply":"Salut"}');assert.equal((await aiStatus(env)).used,estimateNeurons(DEFAULT_MODEL,called.payload));
  await runAI(env,{max_tokens:1,messages:[{role:'user',content:'x'}]},{json:false});assert.equal(called.payload.max_tokens,100);assert.equal(called.payload.response_format,undefined);
});

await ok('configuration : modèles proposés, plafond gratuit et sauvegarde commune',async()=>{
  const env=makeAIEnv({AI_MODEL:'modèle-sans-tarif',AI_DAILY_BUDGET:15000});
  assert.equal((await aiStatus(env)).model,DEFAULT_MODEL);assert.equal((await aiStatus(env)).budget,9000);
  const status=await saveAIConfig(env,{model:LLAMA,budget:1200});assert.equal(status.model,LLAMA);assert.equal(status.budget,1200);assert.equal(status.models.length,Object.keys(AI_MODELS).length);
  for(const model of ['inconnu','constructor','toString','__proto__'])await assert.rejects(saveAIConfig(env,{model,budget:1200}),e=>e.status===400&&e.aiSafe===true,model);
  for(const budget of [999,9001,1000.5,'abc'])await assert.rejects(saveAIConfig(env,{model:DEFAULT_MODEL,budget}),e=>e.status===400,budget+'');
  for(const model of ['inconnu','constructor','toString','__proto__'])assert.throws(()=>estimateNeurons(model,input),e=>e.status===400,model);
  assert.equal((await aiStatus(env)).model,LLAMA,'les refus ne modifient pas le réglage');
});

await ok('préférences : valeurs sûres, sauvegarde partielle et anciens formulaires conservés',async()=>{
  const env=makeAIEnv();
  assert.deepEqual(await aiPreferences(env),defaultPreferences);assert.deepEqual((await aiStatus(env)).preferences,defaultPreferences);
  const detached=await aiPreferences(env);detached.askWhenUnclear=false;detached.creativity=2;
  assert.deepEqual(await aiPreferences(env),defaultPreferences,'un résultat modifié ne change pas la configuration');
  const choices={answerStyle:'pedagogical',detail:'detailed',reasoning:'minimal',creativity:0.3};
  const changed=await saveAIConfig(env,{model:LLAMA,budget:1500,preferences:choices});
  assert.deepEqual(changed.preferences,{...defaultPreferences,...choices});
  assert.deepEqual((await saveAIConfig(env,{model:DEFAULT_MODEL,budget:8000})).preferences,changed.preferences,'les anciens formulaires préservent les réglages');
  const partial=await saveAIConfig(env,{model:DEFAULT_MODEL,budget:8000,preferences:{detail:'short',creativity:0}});
  assert.deepEqual(partial.preferences,{...changed.preferences,detail:'short',creativity:0});
  assert.deepEqual(await aiPreferences(env),partial.preferences);
});

await ok('préférences : valeurs invalides et désactivation des règles obligatoires refusées sans sauvegarde',async()=>{
  const env=makeAIEnv();await saveAIConfig(env,{model:LLAMA,budget:1500,preferences:{detail:'detailed'}});
  const before=(await env.DB.prepare('SELECT value FROM system_state WHERE key=?').bind('ai:config').first()).value;
  for(const preferences of [null,[],false,{extra:true},{answerStyle:'verbose'},{detail:'long'},{reasoning:'high'},{creativity:'0.1'},{creativity:null},{creativity:-0.1},{creativity:0.31},{creativity:NaN},{creativity:Infinity},{askWhenUnclear:false},{askWhenUnclear:1},{sourcePolicy:'unverified'},{sourcePolicy:null},{requireConfirmation:false}]){
    await assert.rejects(saveAIConfig(env,{model:DEFAULT_MODEL,budget:8000,preferences}),e=>e.status===400&&e.code==='AI_CONFIG'&&e.aiSafe===true);
    assert.equal((await env.DB.prepare('SELECT value FROM system_state WHERE key=?').bind('ai:config').first()).value,before,'aucune sauvegarde après refus');
  }
  await env.DB.prepare('UPDATE system_state SET value=? WHERE key=?').bind(JSON.stringify({model:DEFAULT_MODEL,budget:8000,preferences:{answerStyle:'invented',detail:'short',reasoning:'high',creativity:8,askWhenUnclear:false,sourcePolicy:'anything',requireConfirmation:false}}),'ai:config').run();
  assert.deepEqual(await aiPreferences(env),{...defaultPreferences,detail:'short'},'une ancienne configuration incorrecte ne désactive jamais les règles');
});

await ok('paramètres Cloudflare : créativité bornée, instructions communes et prompt original intact',async()=>{
  let sent;const env=makeAIEnv({AI:{run:async(_model,payload)=>{sent=payload;return {response:'{}'};}}});
  await saveAIConfig(env,{model:DEFAULT_MODEL,budget:8000,preferences:{answerStyle:'pedagogical',detail:'short',creativity:0.05}});
  const original={...input,temperature:2},before=JSON.stringify(original);await runAI(env,original);
  assert.equal(sent.temperature,0.05);assert.equal(JSON.stringify(original),before);
  const system=sent.messages.find(m=>m.role==='system').content;
  for(const text of ['Explique progressivement','Réponse courte','status:"clarify"','status:"unverified"','sources réellement fournies par le serveur','confirmation explicite','Ne devine pas'])assert.ok(system.includes(text),text);
  assert.match(system,/\/no_think$/);
  for(const [temperature,expected] of [[0.02,0.02],[-1,0],[undefined,0.05]]){
    await runAI(env,{...input,temperature});assert.equal(sent.temperature,expected);
  }
  await runAI(env,{prompt:'Une demande sans message système.',max_tokens:100});
  assert.equal(sent.messages[0].role,'system');assert.equal(sent.messages[1].content,'Une demande sans message système.');assert.equal(sent.prompt,undefined);
});

await ok('clarification : propositions ambiguës ou non vérifiées bloquées avant les anciens nettoyeurs',async()=>{
  const env=makeAIEnv();
  const cases=[
    {status:'clarify',question:'  Quel <lieu> ?\n ',reply:'Ne pas choisir cette réponse',actions:[{type:'create'}]},
    {status:'unverified',reply:'La source manque.',changes:[{kind:'faq'}]},
    {understood:false,reply:'Quel jour ?'},
    {needsClarification:true,reply:'Quelle activité ?'},
    {status:'clarify'}
  ];
  for(const [index,value] of cases.entries()){
    const json=JSON.stringify(value),raw=index%2 ? {choices:[{message:{content:'```json\n'+json+'\n```'}}]} : {response:value};
    env.AI.run=async()=>raw;
    await assert.rejects(runAI(env,{...input,max_tokens:100}),e=>e.status===422&&e.code==='AI_CLARIFY'&&e.aiSafe===true&&e.message.length<=240&&!/[<>\n]/.test(e.message)&&(!index?e.message==='Quel lieu ?':true));
  }
  const raw={response:JSON.stringify({status:'clarify',reply:'Précise le lieu.',actions:[]})};env.AI.run=async()=>raw;
  assert.equal(await runAI(env,{...input,max_tokens:100},{allowClarification:true}),raw,'les parcours avec nettoyeur dédié reçoivent le statut');
  assert.equal(await runAI(env,{...input,max_tokens:100},{json:false}),raw,'la garde JSON ne transforme pas une réponse texte');
  for(const response of ['pas de JSON','{"reply":"Conseil valide"}','{"status":"ok","understood":true}']){
    const normal={response};env.AI.run=async()=>normal;assert.equal(await runAI(env,{...input,max_tokens:100}),normal);
  }
});

await ok('réserve atomique : appels simultanés, aucun dépassement et aucun appel payé après refus',async()=>{
  let calls=0,sent;const env=makeAIEnv({AI:{run:async(_model,payload)=>{calls++;sent=payload;return {response:'{}'};}}});await saveAIConfig(env,{model:LLAMA,budget:1000});
  const outcomes=await Promise.allSettled(Array.from({length:40},()=>runAI(env,{...input,max_tokens:900})));
  const cost=estimateNeurons(LLAMA,sent),capacity=Math.floor(1000/cost);assert.ok(capacity>1,'plusieurs appels concurrents franchissent la réserve');
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,capacity);assert.equal(calls,capacity);
  assert.ok(outcomes.filter(x=>x.status==='rejected').every(x=>x.reason.status===429&&x.reason.code==='AI_QUOTA'));
  const status=await aiStatus(env);assert.equal(status.used,cost*capacity);assert.ok(status.used<=status.budget);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM system_state WHERE key=?').bind('ai:budget:'+today()).first()).n,1);
});

await ok('jour UTC : réserve renouvelée au passage de minuit et ancienne journée gardée',async()=>{
  const RealDate=Date,env=makeAIEnv();let now=RealDate.parse('2026-10-04T23:59:59.900Z');
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  try{
    await runAI(env,input);const first=await aiStatus(env);assert.equal(first.resetAt,'2026-10-05T00:00:00.000Z');assert.ok(first.used>0);
    now=RealDate.parse('2026-10-05T00:00:00.100Z');assert.equal((await aiStatus(env)).used,0);await runAI(env,input);const second=await aiStatus(env);assert.equal(second.used,first.used);assert.equal(second.resetAt,'2026-10-06T00:00:00.000Z');
    assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM system_state WHERE key LIKE 'ai:budget:%'").first()).n,2);
  }finally{globalThis.Date=RealDate;}
});

await ok('panne, quota fournisseur et délai : réservation gardée, messages sans secret',async()=>{
  const env=makeAIEnv({AI:{run:async()=>{throw new Error('token-secret-interne');}}});
  let failure;try{await runAI(env,input);}catch(e){failure=e;}assert.equal(aiError(failure).status,503);assert.doesNotMatch(aiError(failure).error,/secret/);const used=(await aiStatus(env)).used;assert.ok(used>0);
  env.AI.run=async()=>{throw new Error('daily neurons quota: token-secret-interne');};await assert.rejects(runAI(env,input),e=>e.status===429&&aiError(e).quota===true&&!/secret/.test(aiError(e).error));assert.equal((await aiStatus(env)).used,used*2);
  env.AI.run=()=>new Promise(()=>{});await assert.rejects(runAI(env,input,{timeoutMs:10}),e=>e.status===504&&e.code==='AI_TIMEOUT');assert.equal((await aiStatus(env)).used,used*3);
});

await ok('réserve impossible ou demande trop coûteuse : aucun appel fournisseur',async()=>{
  let calls=0;const AI={run:async()=>{calls++;return {response:'{}'};}};
  await assert.rejects(runAI({AI},input),e=>e.status===503&&e.code==='AI_BUDGET');assert.equal(calls,0);
  const env=makeAIEnv({AI});await saveAIConfig(env,{model:LLAMA,budget:1000});
  await assert.rejects(runAI(env,{...input,messages:[{role:'user',content:'x'.repeat(50000)}]}),e=>e.status===429);assert.equal(calls,0);assert.equal((await aiStatus(env)).used,0);
  await assert.rejects(runAI({DB:env.DB},input),e=>e.status===503&&e.code==='AI_UNAVAILABLE');assert.equal((await aiStatus(env)).used,0);
});

await ok('réponses Workers AI : JSON avec accolades citées, choix et raisonnement séparés',()=>{
  const object={reply:'Une accolade } et une citation " : reste du texte',actions:[]},json=JSON.stringify(object);
  for(const raw of [json,{response:json},{result:{response:json}},{choices:[{message:{content:json,reasoning_content:'{"reply":"SECRET"}'}}]},{output_text:json},{output:[{type:'reasoning',content:[{type:'output_text',text:'SECRET'}]},{type:'message',content:[{type:'output_text',text:json}]}]},'<think>{"reply":"SECRET"}</think>Voici {cassé} puis '+json+' après {"inutile":1}'])assert.deepEqual(extractJson(raw),object);
  assert.equal(responseText('<think>raisonnement secret</think>Conseil utile'),'Conseil utile');assert.equal(responseText('<think>raisonnement non terminé'),'');assert.equal(responseText({choices:[{message:{reasoning_content:'secret'}}]}),'');assert.equal(extractJson({choices:[{message:{content:'pas de JSON'}}]}),null);
});
await ok('Qwen administration : contenu, laboratoire et remplacements restent validés après extraction',()=>{
  const qwen=value=>({choices:[{message:{content:JSON.stringify(value),reasoning_content:'SECRET'}}]});
  const faq=cleanAdminDraft(qwen({q:'Où sont mes séances ?',a:'Dans Bibliothèque.',password:'secret'}),'faq');assert.equal(faq.q,'Où sont mes séances ?');assert.equal(faq.a,'Dans Bibliothèque.');assert.equal(faq.password,undefined);
  const lab=cleanLab(qwen({reformulation:'Le calendrier est difficile à trouver',solutions:[{title:'Un raccourci',pros:['Visible'],cons:['Une icône de plus'],change:{kind:'faq',data:{q:'Où est le calendrier ?',a:'Dans Accueil.'}}},{title:'Script inconnu',change:{kind:'layout',data:{code:'evil'}}}]}));assert.equal(lab.solutions.length,2);assert.equal(lab.solutions[0].change.kind,'faq');assert.equal(lab.solutions[1].change,null);
  const files=new Map([['public/exemple.js','const label="Organiser";\n']]);const edit=cleanEdits(qwen({reply:'Un libellé plus court.',edits:[{path:'public/exemple.js',find:'"Organiser"',replace:'"Mise en page"'},{path:'worker.js',find:'x',replace:'eval("x")'}]}),files);assert.equal(edit.edits.length,1);assert.equal(edit.errors.length,1);assert.match(edit.diff,/Mise en page/);assert.equal(files.get('public/exemple.js'),'const label="Organiser";\n');assert.doesNotMatch(JSON.stringify(edit),/SECRET/);
});
done('tests réserve gratuite et formats IA');
