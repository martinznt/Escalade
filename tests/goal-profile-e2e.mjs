// Objectif écrit : profil privé par défaut et réponse tardive isolée par compte.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer, makeEnv } from './server.mjs';
import { Client } from './helpers.mjs';

const nativeFetch=globalThis.fetch;let lastBody,hold=false,release;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.hostname!=='generativelanguage.googleapis.com')return nativeFetch(input,options);
  lastBody=JSON.parse(options.body);
  const response=()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({label:'OBJECTIF-GEMINI-VALIDÉ',description:'Améliorer le gainage.',activityId:'climbing_route',caps:[{id:'gainage_anterieur',w:0.8}],steps:['Commencer progressivement'],confidence:'haute'})}]}}]});
  return hold?new Promise((resolve)=>{release=()=>resolve(response());}):response();
};
const env=makeEnv({GEMINI_API_KEY:'mock-key-for-goal-profile-test'}),accounts={};
for(const name of ['GoalOwnerA','GoalOwnerB']){
  const client=new Client(env);await client.register(name);accounts[name]=client;
  await client.post('/api/items',{changes:[{c:'config',id:'main',u:Date.now(),d:{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']}}]});
}
await accounts.GoalOwnerA.post('/api/items',{changes:[{c:'env',id:'private-goal-place',u:Date.now(),d:{name:'LIEU-PRIVÉ-OBJECTIF',type:'maison',equipment:['bar'],isDefault:true}}]});
const srv=await startServer(env),browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await context.newPage(),errors=[],requests=[];
p.on('pageerror',(error)=>errors.push(error.message));
p.on('request',(request)=>{const path=new URL(request.url()).pathname;if(path==='/api/ai/goal'||path==='/api/ai/status')requests.push({path,body:request.postDataJSON()});});
let count=0;
const step=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const login=async(name)=>{if(await p.locator('[data-act=authPick][data-id=login]').count())await p.click('[data-act=authPick][data-id=login]');await p.waitForSelector('form[data-submit=login]');await p.fill('[name=username]',name);await p.fill('[name=password]','motdepasse1');await p.click('form[data-submit=login] button[type=submit]');await p.waitForSelector('nav.tabs');await p.waitForFunction(async()=>(await import('/views-setup.js')).mainConfig().setupDone);};
const openGoal=async()=>{await p.evaluate(()=>location.hash='#/profile/goals');await p.waitForSelector('[data-act=goalWrite]');await p.locator('[data-act=goalWrite]').first().click();await p.waitForSelector('[data-submit=goalAi]');};
const submit=async()=>{await p.fill('[data-submit=goalAi] [name=text]','Me renforcer pour grimper');await p.click('[data-submit=goalAi] button[type=submit]');};
try{
  await p.goto(srv.base);await login('GoalOwnerA');
  await step('objectif : résumé facultatif décoché et aucune donnée personnelle transmise par défaut',async()=>{
    await openGoal();assert.equal(await p.locator('[name=profileConsent]').isChecked(),false);
    await p.getByText('Voir le résumé et son destinataire',{exact:true}).click();assert.match(await p.locator('#sheet').innerText(),/LIEU-PRIVÉ-OBJECTIF/);assert.match(await p.locator('#sheet').innerText(),/Google.*Cloudflare/);
    const before=requests.length;await submit();await p.waitForSelector('[data-submit=goalFicheSave]');
    const sent=requests.slice(before);assert.equal(sent.some((request)=>request.path==='/api/ai/status'),false);
    const body=sent.find((request)=>request.path==='/api/ai/goal').body;assert.equal(body.profileConsent,false);assert.equal(body.profile,undefined);assert.doesNotMatch(JSON.stringify(lastBody),/LIEU-PRIVÉ-OBJECTIF/);
    assert.equal(await p.inputValue('[data-submit=goalFicheSave] [name=label]'),'OBJECTIF-GEMINI-VALIDÉ');await p.keyboard.press('Escape');
  });
  await step('choix explicite : fournisseur vérifié avant envoi du résumé',async()=>{
    await openGoal();assert.equal(await p.locator('[name=profileConsent]').isChecked(),false);await p.check('[name=profileConsent]');
    const before=requests.length;await submit();await p.waitForSelector('[data-submit=goalFicheSave]');const sent=requests.slice(before);
    assert.equal(sent[0].path,'/api/ai/status');assert.equal(sent[1].path,'/api/ai/goal');assert.equal(sent[1].body.profileConsent,true);assert.equal(sent[1].body.profileProvider,'gemini');assert.match(sent[1].body.profile,/LIEU-PRIVÉ-OBJECTIF/);assert.match(JSON.stringify(lastBody),/LIEU-PRIVÉ-OBJECTIF/);await p.keyboard.press('Escape');
  });
  await step('changement de compte pendant analyse : la réponse ne crée aucun brouillon dans le nouveau compte',async()=>{
    await openGoal();hold=true;await submit();for(let i=0;i<80&&!release;i++)await p.waitForTimeout(25);assert.ok(release);
    await p.keyboard.press('Escape');await p.evaluate(()=>location.hash='#/settings/main');await p.waitForSelector('[data-act=logout]');await p.click('[data-act=logout]');await p.click('#dialog.open [data-dlg="1"]');await p.waitForSelector('form[data-submit=login]');await login('GoalOwnerB');
    const response=p.waitForResponse((response)=>new URL(response.url()).pathname==='/api/ai/goal');release();hold=false;await (await response).finished();await p.evaluate(()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.goalDraft),null);assert.equal(await p.locator('[data-submit=goalFicheSave]').count(),0);await openGoal();assert.equal(await p.locator('[name=profileConsent]').isChecked(),false);assert.doesNotMatch(await p.locator('#sheet').innerText(),/LIEU-PRIVÉ-OBJECTIF/);
  });
  assert.deepEqual(errors,[]);console.log(`\n${count} étapes objectif / confidentialité E2E OK`);
}catch(error){await p.screenshot({path:'/tmp/escalade-goal-profile-fail.png',fullPage:true}).catch(()=>{});throw error;}finally{release?.();await browser.close();await new Promise((resolve)=>srv.server.close(resolve));globalThis.fetch=nativeFetch;}
