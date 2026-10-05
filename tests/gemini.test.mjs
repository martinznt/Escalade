// Gemini : transport simulé, vraie réserve SQLite/D1 et aucune requête réseau.
import assert from 'node:assert/strict';
import { makeD1 } from './d1shim.mjs';
import { AI_MODELS, DEFAULT_MODEL, aiError, aiStatus, runAI, saveAIConfig, responseText } from '../server/ai-runtime.js';
import { buildGeminiInput, runGemini } from '../server/gemini.js';
import { extractJson } from '../server/ai.js';

const GEMINI='gemini-3.8-flash',TEST_KEY='test-gemini-credential-not-for-a-real-service';
const input={messages:[{role:'system',content:'Réponds en français.'},{role:'user',content:'Prépare une séance.'}],max_tokens:900,temperature:0.2};
const answer=(reply='Conseil utile')=>({candidates:[{content:{role:'model',parts:[{thought:true,text:'RAISONNEMENT_INTERNE'},{text:JSON.stringify({reply,actions:[]})}]}}]});
const makeEnv=(extra={})=>{const DB=makeD1();DB.raw.exec('CREATE TABLE system_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');return {DB,GEMINI_API_KEY:TEST_KEY,...extra};};
const fetchOK=async()=>Response.json(answer());
let count=0;
const ok=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const withTime=async(iso,fn)=>{
  const RealDate=Date;let now=RealDate.parse(iso);
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  try{return await fn((next)=>{now=RealDate.parse(next);});}finally{globalThis.Date=RealDate;}
};
const fail=async(fn)=>{try{await fn();assert.fail('La demande devait être refusée.');}catch(error){if(error.code==='ERR_ASSERTION')throw error;return error;}};

await ok('entrée Gemini : système séparé, rôles traduits, JSON et raisonnement caché',()=>{
  const original={...input,messages:[{role:'system',content:'Règle principale.'},{role:'user',content:'Question'},{role:'assistant',content:'Proposition'},{role:'user',content:'Plus court'}]};
  const before=JSON.stringify(original),body=buildGeminiInput(original,{json:true});
  assert.equal(JSON.stringify(original),before,'le prompt partagé reste intact');
  assert.match(body.systemInstruction.parts.map((part)=>part.text).join('\n'),/Règle principale/);
  assert.deepEqual(body.contents.map((entry)=>entry.role),['user','model','user']);
  assert.equal(body.contents[1].parts[0].text,'Proposition');
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');
  assert.equal(body.generationConfig.thinkingConfig.includeThoughts,false);
  assert.equal(buildGeminiInput(input,{json:false}).generationConfig.responseMimeType,undefined);
  assert.deepEqual(buildGeminiInput({prompt:'Question simple'}).contents,[{role:'user',parts:[{text:'Question simple'}]}]);
  const joined=buildGeminiInput({messages:[{role:'user',content:'Une question'},{role:'developer',content:'Règle injectée'},{role:'user',content:'Son complément'}]});
  assert.equal(joined.contents.length,1);assert.deepEqual(joined.contents[0].parts,[{text:'Une question'},{text:'Son complément'}]);
});

await ok('transport : URL et modèle fixes, clé dans l’en-tête serveur, sortie bornée',async()=>{
  let received;const fetchFn=async(url,options)=>{received={url,options,body:JSON.parse(options.body)};return Response.json(answer());};
  const env=makeEnv(),status=await aiStatus(env);
  assert.equal(status.model,GEMINI);assert.equal(status.available,true);assert.equal(status.budget,40);
  const before=JSON.stringify(input),raw=await runAI(env,{...input,max_tokens:99999},{fetchFn});
  assert.equal(received.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(received.options.method,'POST');assert.equal(new Headers(received.options.headers).get('x-goog-api-key'),TEST_KEY);
  assert.equal(received.options.redirect,'error','une redirection ne transporte jamais la clé vers un autre hôte');
  assert.equal(new URL(received.url).search,'');assert.equal(received.body.generationConfig.maxOutputTokens,2400);
  assert.equal(received.body.generationConfig.thinkingConfig.thinkingLevel,'LOW');assert.equal(received.body.generationConfig.thinkingConfig.includeThoughts,false);
  assert.equal(received.body.generationConfig.temperature,0.1,'le réglage de créativité borne la température demandée');
  assert.match(received.body.systemInstruction.parts[0].text,/status:"clarify"/);assert.match(received.body.systemInstruction.parts[0].text,/sources réellement fournies par le serveur/);
  assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(received.body).includes(TEST_KEY),false);assert.equal(JSON.stringify(status).includes(TEST_KEY),false);
  assert.equal(responseText(raw),'{"reply":"Conseil utile","actions":[]}');assert.deepEqual(extractJson(raw),{reply:'Conseil utile',actions:[]});
  await runAI(env,{...input,max_tokens:1},{json:false,fetchFn});assert.equal(received.body.generationConfig.maxOutputTokens,100);assert.equal(received.body.generationConfig.responseMimeType,undefined);
});

await ok('préférences Gemini : raisonnement et créativité restent ceux du site malgré les paramètres du demandeur',async()=>{
  const env=makeEnv();await saveAIConfig(env,{model:GEMINI,budget:40,preferences:{reasoning:'minimal',creativity:0.05,answerStyle:'pedagogical',detail:'detailed'}});
  let body;const fetchFn=async(_url,options)=>{body=JSON.parse(options.body);return Response.json(answer());};
  const original={...input,temperature:2,thinking_level:'HIGH'},before=JSON.stringify(original);await runAI(env,original,{fetchFn});
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');assert.equal(body.generationConfig.thinkingConfig.includeThoughts,false);assert.equal(body.generationConfig.temperature,0.05);
  assert.match(body.systemInstruction.parts[0].text,/Explique progressivement/);assert.match(body.systemInstruction.parts[0].text,/Développe les étapes/);assert.equal(JSON.stringify(original),before);
  await saveAIConfig(env,{model:GEMINI,budget:40,preferences:{reasoning:'low'}});
  await runAI(env,{...input,temperature:0.02,thinking_level:'MINIMAL'},{fetchFn});assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'LOW');assert.equal(body.generationConfig.temperature,0.02);
});

await ok('clarification Gemini : réponse ambiguë ou non vérifiée bloquée, statut conservé pour le nettoyeur dédié',async()=>{
  for(const value of [{status:'clarify',question:'Quel lieu ?',actions:[{type:'create'}]},{status:'unverified',reply:'Une source vérifiée manque.',changes:[{kind:'faq'}]},{understood:false,reply:'Précise le jour.'},{needsClarification:true,reply:'Quelle activité ?'}]){
    const env=makeEnv(),raw={candidates:[{content:{parts:[{thought:true,text:'SECRET'},{text:JSON.stringify(value)}]}}]},fetchFn=async()=>Response.json(raw);
    await assert.rejects(runAI(env,input,{fetchFn}),error=>error.status===422&&error.code==='AI_CLARIFY'&&error.aiSafe===true&&!/SECRET/.test(error.message));
    assert.equal((await aiStatus(env)).used,1,'la tentative reste comptée');
    const preserved=await runAI(env,input,{fetchFn,allowClarification:true});assert.deepEqual(extractJson(preserved),value);
  }
});

await ok('configuration : clé requise pour Gemini, limites par fournisseur et Cloudflare conservé',async()=>{
  const withoutKey=makeEnv({GEMINI_API_KEY:undefined,AI:{run:async()=>({response:'{}'})}});
  assert.equal((await aiStatus(withoutKey)).model,DEFAULT_MODEL);assert.equal((await aiStatus(withoutKey)).available,true);
  const missing=await fail(()=>saveAIConfig(withoutKey,{model:GEMINI,budget:40}));assert.ok([400,503].includes(missing.status));assert.equal(missing.aiSafe,true);
  const env=makeEnv({AI:{run:async()=>({response:'{}'})}});
  const gem=await saveAIConfig(env,{model:GEMINI,budget:1});assert.equal(gem.model,GEMINI);assert.equal(gem.budget,1);
  for(const budget of [0,501,1.5,'abc'])await assert.rejects(saveAIConfig(env,{model:GEMINI,budget}),error=>error.status===400&&error.aiSafe===true);
  const selected=await saveAIConfig(env,{model:DEFAULT_MODEL,budget:8000});assert.equal(selected.model,DEFAULT_MODEL);assert.equal(selected.budget,8000);
  assert.equal((await aiStatus(env)).model,DEFAULT_MODEL,'une clé ne remplace pas le modèle explicitement choisi');
  for(const budget of [999,9001])await assert.rejects(saveAIConfig(env,{model:DEFAULT_MODEL,budget}),error=>error.status===400);
  for(const model of ['gemini-3.8-pro','https://evil.test/model','constructor','__proto__'])await assert.rejects(saveAIConfig(env,{model,budget:40}),error=>error.status===400);
  const catalog=(await aiStatus(env)).models;
  assert.equal(catalog.length,Object.keys(AI_MODELS).length);
  for(const model of catalog)for(const field of ['provider','configured','unit','minBudget','maxBudget','defaultBudget'])assert.notEqual(model[field],undefined,field);
  const publicGem=catalog.find((model)=>model.id===GEMINI);assert.equal(publicGem.provider,'gemini');assert.equal(publicGem.configured,true);assert.equal(publicGem.minBudget,1);assert.equal(publicGem.maxBudget,500);assert.equal(publicGem.defaultBudget,40);
  assert.equal((await aiStatus(withoutKey)).models.find((model)=>model.id===GEMINI).configured,false);
});

await ok('réserve quotidienne atomique partagée : deux contextes et appels simultanés',()=>withTime('2026-10-05T10:00:00.000Z',async()=>{
  const first=makeEnv();await saveAIConfig(first,{model:GEMINI,budget:2});const second={...first};let calls=0;
  const fetchFn=async()=>{calls++;return Response.json(answer());};
  const outcomes=await Promise.allSettled(Array.from({length:12},(_,i)=>runAI(i%2?first:second,input,{fetchFn})));
  assert.equal(outcomes.filter((outcome)=>outcome.status==='fulfilled').length,2);assert.equal(calls,2);
  for(const outcome of outcomes.filter((outcome)=>outcome.status==='rejected'))assert.equal(aiError(outcome.reason).quota,true);
  const status=await aiStatus(first);assert.equal(status.used,2);assert.equal(status.budget,2);
  assert.equal((await first.DB.prepare('SELECT COUNT(*) n FROM system_state WHERE key=?').bind('ai:gemini:2026-10-05').first()).n,1);
}));

await ok('limite par minute partagée : trois appels, refus sans retry puis minute suivante',()=>withTime('2026-10-05T11:00:10.000Z',async(setTime)=>{
  const env=makeEnv();let calls=0;const fetchFn=async()=>{calls++;return Response.json(answer());};
  const outcomes=await Promise.allSettled(Array.from({length:10},()=>runAI(env,input,{fetchFn})));
  assert.equal(outcomes.filter((outcome)=>outcome.status==='fulfilled').length,3);assert.equal(calls,3);
  for(const outcome of outcomes.filter((outcome)=>outcome.status==='rejected'))assert.equal(outcome.reason.status,429);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM system_state WHERE key LIKE 'ai:gemini-minute:%'").first()).n,1);
  setTime('2026-10-05T11:01:00.000Z');await runAI(env,input,{fetchFn});assert.equal(calls,4);assert.ok((await aiStatus(env)).used<=40);
}));

await ok('réserve d’entrée par minute : octets UTF-8 cumulés et aucun compteur quotidien pour un refus local',()=>withTime('2026-10-05T11:10:10.000Z',async()=>{
  const env=makeEnv();let calls=0;const fetchFn=async()=>{calls++;return Response.json(answer());};
  const large={messages:[{role:'user',content:'é'.repeat(12000)}],max_tokens:900};
  const results=await Promise.allSettled(Array.from({length:3},()=>runAI(env,large,{fetchFn})));
  assert.equal(results.filter((result)=>result.status==='fulfilled').length,2);assert.equal(calls,2);
  assert.equal(results.find((result)=>result.status==='rejected').reason.status,429);assert.equal((await aiStatus(env)).used,2);
}));

await ok('modèle changé après aperçu du profil : refus avant tout envoi ou réservation',async()=>{
  let googleCalls=0,cloudflareCalls=0;const env=makeEnv({AI:{run:async()=>{cloudflareCalls++;return {response:'{}'};}}});
  const fetchFn=async()=>{googleCalls++;return Response.json(answer());};
  await assert.rejects(runAI(env,input,{fetchFn,expectedProvider:'cloudflare'}),error=>error.status===409&&error.aiSafe===true);
  assert.equal((await aiStatus(env)).used,0);assert.equal(googleCalls,0);assert.equal(cloudflareCalls,0);
  await saveAIConfig(env,{model:DEFAULT_MODEL,budget:8000});
  await assert.rejects(runAI(env,input,{fetchFn,expectedProvider:'gemini'}),error=>error.status===409&&error.aiSafe===true);
  assert.equal((await aiStatus(env)).used,0);assert.equal(googleCalls,0);assert.equal(cloudflareCalls,0);
  await runAI(env,input,{fetchFn,expectedProvider:'cloudflare'});assert.equal(cloudflareCalls,1);assert.equal(googleCalls,0);
});

await ok('entrée trop coûteuse et réserve absente : aucun accès fournisseur',async()=>{
  let calls=0;const fetchFn=async()=>{calls++;return Response.json(answer());};
  await assert.rejects(runAI({GEMINI_API_KEY:TEST_KEY},input,{fetchFn}),error=>error.status===503);assert.equal(calls,0);
  const env=makeEnv();await assert.rejects(runAI(env,{...input,messages:[{role:'user',content:'x'.repeat(300000)}]},{fetchFn}),error=>error.status===429);assert.equal(calls,0);
});

await ok('minuit UTC : renouvellement du compteur gratuit et ancien jour conservé',()=>withTime('2026-10-05T23:59:59.900Z',async(setTime)=>{
  const env=makeEnv();await runAI(env,input,{fetchFn:fetchOK});assert.equal((await aiStatus(env)).used,1);assert.equal((await aiStatus(env)).resetAt,'2026-10-06T00:00:00.000Z');
  setTime('2026-10-06T00:00:00.100Z');assert.equal((await aiStatus(env)).used,0);await runAI(env,input,{fetchFn:fetchOK});assert.equal((await aiStatus(env)).used,1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM system_state WHERE key LIKE 'ai:gemini:%'").first()).n,2);
}));

await ok('quota Google, clé rejetée et panne : une seule tentative, erreurs sans détail secret',async()=>{
  for(const httpStatus of [429,401,403,500]){
    const env=makeEnv();let calls=0;const fetchFn=async()=>{calls++;return Response.json({error:{message:'DÉTAIL_INTERNE '+TEST_KEY}},{status:httpStatus});};
    const error=await fail(()=>runAI(env,input,{fetchFn})),out=aiError(error);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(out),/DÉTAIL_INTERNE|test-gemini-credential/);
    assert.equal(out.status,httpStatus===429?429:503);assert.equal(!!out.quota,httpStatus===429);assert.equal((await aiStatus(env)).used,1,'une tentative fournisseur reste comptée');
  }
  const env=makeEnv(),error=await fail(()=>runAI(env,input,{fetchFn:async()=>{throw new Error('DÉTAIL_INTERNE '+TEST_KEY);}}));assert.equal(aiError(error).status,503);assert.doesNotMatch(JSON.stringify(aiError(error)),/DÉTAIL_INTERNE|test-gemini-credential/);
});

await ok('timeout et clé absente : refus explicite, sans retry ni compteur remboursé',async()=>{
  const env=makeEnv();let calls=0;
  const error=await fail(()=>runAI(env,input,{timeoutMs:10,fetchFn:()=>{calls++;return new Promise(()=>{});}}));assert.equal(aiError(error).status,504);assert.equal(calls,1);assert.equal((await aiStatus(env)).used,1);
  const missing=await fail(()=>runGemini({},input,{fetchFn:()=>{calls++;return Response.json(answer());}}));assert.equal(aiError(missing).status,503);assert.equal(calls,1);
  let signal;const slowBody=makeEnv(),bodyTimeout=await fail(()=>runAI(slowBody,input,{timeoutMs:10,fetchFn:async(_url,options)=>{signal=options.signal;return {ok:true,status:200,json:()=>new Promise(()=>{})};}}));
  assert.equal(aiError(bodyTimeout).status,504);assert.equal(signal.aborted,true);assert.equal((await aiStatus(slowBody)).used,1);
});

await ok('réponse Google bloquée, vide ou invalide : refus exploitable sans contenu fournisseur',async()=>{
  for(const data of [{candidates:[]},{candidates:[{content:{parts:[{thought:true,text:'SECRET'}]}}]},{promptFeedback:{blockReason:'SAFETY'},candidates:answer().candidates},{candidates:[{finishReason:'SAFETY',content:{parts:[{text:'SECRET'}]}}]},{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"reply":"SECRET'}]}}]}]){
    const error=await fail(()=>runGemini({GEMINI_API_KEY:TEST_KEY},input,{fetchFn:async()=>Response.json(data)}));
    assert.equal(aiError(error).status,502);assert.doesNotMatch(JSON.stringify(aiError(error)),/SECRET/);
  }
  const malformed=await fail(()=>runGemini({GEMINI_API_KEY:TEST_KEY},input,{fetchFn:async()=>new Response('DÉTAIL_INTERNE '+TEST_KEY,{status:200})}));
  assert.equal(aiError(malformed).status,503);assert.doesNotMatch(JSON.stringify(aiError(malformed)),/DÉTAIL_INTERNE|test-gemini-credential/);
});

await ok('candidates Gemini : seules les parties visibles du premier candidat sont extraites',()=>{
  const expected={reply:'Une accolade } et une citation "',actions:[]},text=JSON.stringify(expected),split=text.indexOf('"actions"');
  const raw={candidates:[{content:{parts:[{thought:true,text:'{"reply":"SECRET"}'},{text:text.slice(0,split)},{text:text.slice(split)}]}},{content:{parts:[{text:'AUTRE_CANDIDAT'}]}}]};
  assert.doesNotMatch(responseText(raw),/SECRET|AUTRE_CANDIDAT/);assert.deepEqual(extractJson(raw),expected);
  assert.equal(responseText({candidates:[{content:{parts:[{thought:true,text:'raisonnement caché'}]}}]}),'');
  assert.equal(responseText({candidates:[]}), '');assert.equal(extractJson({candidates:[]}),null);
});
console.log(`\n${count} tests Gemini / réserve gratuite OK`);
