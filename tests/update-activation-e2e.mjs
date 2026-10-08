// Régression d'activation : un cache créé pendant install n'est pas une preuve de nouveau contrôleur actif.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>String(url).startsWith('https://api.github.com/')?Promise.resolve(Response.json([{commit:{message:'Visite guidée plus immersive\n\n- Des flèches montrent chaque bouton',committer:{date:new Date(Date.now()+60000).toISOString()}},parents:[{}]}])):nativeFetch(url,options);
const env=makeEnv({CF_VERSION_METADATA:{id:'activation-base'}}),client=new Client(env);
await client.register('ActivationUpdate');
await client.post('/api/items',{changes:[{c:'config',id:'main',u:Date.now(),d:{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']}}]});
const srv=await startServer(env);
const appVersion=fs.readFileSync(new URL('../public/state.js',import.meta.url),'utf8').match(/export const APP_VERSION = '([^']+)'/)[1];
let releaseInstall,gateRequests=0;
srv.fail=(request)=>new URL(request.url).pathname==='/update-install-gate'?new Promise(resolve=>{gateRequests++;releaseInstall=()=>resolve(new Response('installation allowed'));}):null;
srv.after=async(request,response)=>{
  if(new URL(request.url).pathname!=='/sw.js')return response;
  const text=await response.text();
  return new Response(text+`\nself.addEventListener('install',event=>{if(BUILD==='activation-next')event.waitUntil(fetch('/update-install-gate',{cache:'no-store'}));});\nself.addEventListener('message',event=>{if(event.data?.readBuild)event.ports[0]?.postMessage(BUILD);});`,{status:response.status,headers:response.headers});
};
const browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),page=await context.newPage(),errors=[];
await context.addInitScript(version=>{if(!localStorage.getItem('sea:news-toured'))localStorage.setItem('sea:news-toured',JSON.stringify(version));localStorage.setItem('sea:q-snooze',JSON.stringify(Object.fromEntries(['acts','place','minutes','perWeek','goal','avoid'].map(key=>[key,9e15]))));},appVersion);
page.on('pageerror',error=>errors.push(error.message));
const steps=[];
const step=async(name,fn)=>{await fn();steps.push(name);console.log('  ✓',name);};
const poll=async(fn,description,timeout=15000)=>{const started=Date.now();while(!(await fn())){if(Date.now()-started>timeout)throw new Error('Délai dépassé : '+description);await new Promise(resolve=>setTimeout(resolve,100));}};
const activeBuild=()=>page.evaluate(()=>new Promise(resolve=>{
  const worker=navigator.serviceWorker.controller;if(!worker)return resolve('');
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve('');},1000);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({readBuild:true},[channel.port2]);
}));
try {
  assert.equal((await context.request.post(srv.base+'/api/auth/login',{data:{username:'ActivationUpdate',password:'motdepasse1'},headers:{Origin:srv.base}})).ok(),true);
  await page.goto(srv.base);await page.waitForSelector('nav.tabs');
  await poll(async()=>await activeBuild()==='activation-base','contrôleur initial actif');
  await step('mise à jour demandée pendant install : cache nouveau présent, contrôleur encore ancien, demande conservée après reload',async()=>{
    env.CF_VERSION_METADATA={id:'activation-next'};
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();await window.__seaCheckUpdate();});
    await poll(()=>gateRequests>0,'installation délibérément suspendue');
    await page.waitForSelector('#updbar [data-act=updNow]');
    const pending=await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();return {installing:registration.installing?.state,waiting:!!registration.waiting,cache:await caches.keys()};});
    assert.equal(pending.installing,'installing');assert.equal(pending.waiting,false);assert.ok(pending.cache.some(key=>key.endsWith('activation-next')));
    assert.equal(await activeBuild(),'activation-base');
    await Promise.all([page.waitForNavigation(),page.click('#updbar [data-act=updNow]')]);await page.waitForSelector('nav.tabs');
    const flag=()=>page.evaluate(()=>Number(sessionStorage.getItem('sea:user-update')));
    assert.ok(Date.now()-await flag()<60000,'demande datée et conservée après le rechargement');
    assert.equal(await activeBuild(),'activation-base');
    await page.waitForTimeout(250);assert.ok(Date.now()-await flag()<60000,'demande toujours là pendant l’installation');
  });
  await step('fin du précache : activation demandée, vrai contrôleur nouveau, flag retiré et aucun bandeau de nouvelle installation',async()=>{
    releaseInstall();
    // Attente sans messages en boucle vers l'ancien contrôleur (ils retardent l'activation) ; une seule lecture du BUILD ensuite.
    await poll(async()=>{try{return await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration(),k=await caches.keys();return r?.active?.state==='activated'&&!r.waiting&&k.length===1&&k[0].endsWith('activation-next')&&!!navigator.serviceWorker.controller;});}catch{return false;}},'nouvelle version active',20000);
    await page.waitForSelector('nav.tabs');await poll(async()=>{try{return await activeBuild()==='activation-next';}catch{return false;}},'nouveau contrôleur identifié',6000);
    await page.waitForSelector('nav.tabs');
    await poll(async()=>await page.evaluate(()=>sessionStorage.getItem('sea:user-update'))===null,'demande retirée après activation');
    const state=await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();return {active:registration.active?.state,installing:!!registration.installing,waiting:!!registration.waiting};});
    assert.deepEqual(state,{active:'activated',installing:false,waiting:false});
    await page.waitForTimeout(300);assert.equal(await page.locator('#updbar [data-act=updNow]').count(),0);
  });
  await step('nouveautés lues : bandeau disparu puis rechargement sans nouvelle proposition',async()=>{
    await page.waitForSelector('#updbar.fresh [data-act=updWhat]');await page.click('#updbar [data-act=updWhat]');await page.waitForSelector('#sheet.open .newslist li');
    assert.match(await page.locator('#sheet .newslist').innerText(),/Visite guidée plus immersive[\s\S]*flèches/);
    assert.equal(await page.locator('#updbar').count(),0);await page.click('.news [data-act=closeSheet]');
    await page.reload();await page.waitForSelector('nav.tabs');await page.evaluate(()=>window.__seaCheckUpdate());assert.equal(await page.locator('#updbar').count(),0);
  });
  await step('demande ancienne sans nouveau Worker : contrôle terminé et flag nettoyé',async()=>{
    await page.evaluate(()=>sessionStorage.setItem('sea:user-update','1'));await page.reload();await page.waitForSelector('nav.tabs');
    await poll(async()=>await page.evaluate(()=>sessionStorage.getItem('sea:user-update'))===null,'ancienne demande sans installation');
    assert.equal(await activeBuild(),'activation-next');assert.equal(await page.locator('#updbar [data-act=updNow]').count(),0);
  });
  await step('rattrapage des visites : résumé, pages regroupées et bouton Passer à chaque étape, puis fin sans relance',async()=>{
    await page.evaluate(()=>localStorage.setItem('sea:news-toured',JSON.stringify('8.3.0')));await page.reload();await page.waitForSelector('nav.tabs');
    await page.waitForSelector('#updbar [data-act=newsTour]');assert.match(await page.locator('#updbar').innerText(),/mises à jour depuis ta dernière visite/);
    const expected=await page.evaluate(async()=>{const {NEWS}=await import('/news.js');const {catchUpSteps}=await import('/catchup.js');const {APP_VERSION}=await import('/state.js');return catchUpSteps(NEWS,'8.3.0',APP_VERSION).length;});
    await page.click('#updbar [data-act=newsTour]');await page.waitForSelector('#tour .tour-bubble');assert.match(await page.locator('#tour h3').innerText(),/mises à jour à rattraper/);
    const titles=[];
    for(let index=1;index<=expected;index++){
      await page.waitForFunction(number=>document.querySelector('#tour .tour-step')?.textContent?.startsWith(number+' /'),index);
      assert.equal(await page.locator('#tour .tour-skip').isVisible(),true);titles.push(await page.locator('#tour h3').innerText());
      if(index<expected)await page.click('#tour [data-act=tourNext]');
    }
    assert.ok(titles.length===expected&&new Set(titles).size>=3);await page.click('#tour .tour-finish');await page.waitForSelector('#tour',{state:'detached'});
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sea:news-toured'))),await page.evaluate(()=>window.__seaVersion));
    await page.reload();await page.waitForSelector('nav.tabs');await page.evaluate(()=>window.__seaCheckUpdate());assert.equal(await page.locator('#updbar').count(),0);
    console.log('    '+expected+' étapes de visite vérifiées');
  });
  assert.deepEqual(errors,[]);console.log('\n'+steps.length+' étapes activation / nouveautés E2E OK');
} catch(error) {await page.screenshot({path:'/tmp/escalade-update-activation-fail.png',fullPage:true}).catch(()=>{});throw error;}
finally {releaseInstall?.();fs.writeFileSync('/tmp/escalade-update-activation-proof.json',JSON.stringify({at:new Date().toISOString(),steps,errors},null,2));await browser.close();await new Promise(resolve=>srv.server.close(resolve));globalThis.fetch=nativeFetch;}
