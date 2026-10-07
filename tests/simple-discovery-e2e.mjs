// Vrais clics en mode simple : retrouver le brouillon, les tests physiques et les observations de charge.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv,startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env=makeEnv(),account=new Client(env);await account.register('SimpleDiscovery');
assert.equal((await account.post('/api/items',{changes:[
  {c:'config',id:'main',u:Date.now(),d:{setupDone:true,tourDone:true,goals:['force'],asked:['acts','place','minutes','perWeek','goal','avoid']}},
  {c:'activity',id:'conditioning',u:Date.now(),d:{preset:'conditioning',label:'Renforcement',archived:false}},
  {c:'env',id:'draft-place',u:Date.now(),d:{name:'Mon lieu de brouillon',type:'maison',equipment:['mat','bar'],isDefault:true}},
]})).status,200);
const day=86400000,now=Date.now();
for(const [index,age] of [.25,1.25,2.25,10,17,24,31].entries())assert.equal((await account.post('/api/history',{
  id:'discovery-load-'+index,sessionName:'Renforcement noté',startedAt:now-age*day,durationSeconds:(index<3?60:30)*60,
  data:{activity:'conditioning',rpe:index<3?5:2,exercises:[]},
})).status,200);
const srv=await startServer(env),browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{}),context=await browser.newContext({viewport:{width:320,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));let count=0,preserved;
const step=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const state=()=>page.evaluate(async()=>{
  const {S}=await import('/state.js'),c=S.cp;
  return c?JSON.parse(JSON.stringify({step:c.step,sport:c.sport,minutes:c.minutes,envId:c.envId,intentText:c.intentText,aims:c.aims,parts:c.parts})):null;
});
const home=async()=>{await page.locator('nav.tabs [data-id=home]').click();await page.waitForSelector('#main [data-act=cpResume]');};
const search=async(query,title)=>{
  await page.locator('[data-act=findOpen]').first().click();await page.fill('#sheet input[data-input=findQ]',query);
  const result=page.locator('#findres [data-act=findGo]').filter({hasText:title});assert.equal(await result.count(),1,'un seul résultat exact utile');await result.click();
};
const openParents=async selector=>{
  for(let i=0;i<5&&!await page.locator(selector).isVisible();i++)await page.locator('details:not([open])').filter({has:page.locator(selector)}).first().locator(':scope > summary').click();
};
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'aucun débordement à 320 px');
try{
  await page.goto(srv.base);await page.click('[data-act=authPick][data-id=login]');await page.fill('[name=username]','SimpleDiscovery');await page.fill('[name=password]','motdepasse1');await page.click('form[data-submit=login] button[type=submit]');await page.waitForSelector('nav.tabs');await page.waitForFunction(async()=>{const {S}=await import('/state.js');return S.loaded&&S.sync==='ok';});
  assert.equal(await page.locator('html').getAttribute('data-interface'),'simple');
  await page.locator('#main [data-act=cpResume]').click();await page.waitForSelector('.steps');
  await page.click('[data-act=cpSport][data-id=conditioning]');await page.selectOption('[data-change=cpEnv]','draft-place');await page.fill('[data-change=cpMinIn]','73');await page.dispatchEvent('[data-change=cpMinIn]','change');await page.click('.stepdock [data-act=cpStep][data-d="1"]');await openParents('[data-input=cpWords]');await page.fill('[data-input=cpWords]','Reprendre mon brouillon sans changer mes choix');preserved=await state();assert.equal(preserved.step,2);assert.equal(preserved.minutes,73);assert.equal(preserved.envId,'draft-place');
  await step('recherche « Créer une séance » : durée, lieu, intention et étape du brouillon conservés',async()=>{
    await home();await search('Créer une séance','Créer une séance');await page.waitForSelector('.steps');assert.deepEqual(await state(),preserved);assert.match(await page.locator('.steps b').innerText(),/Étape 2\//);await noOverflow();
  });
  await step('menu Toutes les fonctions : le même brouillon est repris sans le réinitialiser',async()=>{
    await home();await page.locator('[data-act=allOpen]').first().click();const create=page.locator('#sheet.open [data-act=cpResume]').filter({hasText:'Créer une séance'});assert.equal(await create.count(),1);await create.click();await page.waitForSelector('.steps');assert.deepEqual(await state(),preserved);assert.equal(await page.locator('#sheet').evaluate(el=>el.classList.contains('open')),false);await noOverflow();
  });
  await step('rechargement puis recherche : le brouillon sauvegardé reste disponible',async()=>{
    await home();await page.reload();await page.waitForSelector('nav.tabs');await page.waitForFunction(async()=>(await import('/state.js')).S.loaded);await search('Créer une séance','Créer une séance');await page.waitForSelector('.steps');assert.deepEqual(await state(),preserved);
  });
  await step('Moi en mode simple : les détails donnent accès au bilan physique et aux tests',async()=>{
    await page.locator('nav.tabs [data-id=profile]').click();const link=page.locator('#main [data-act=profSub][data-id=bilan]');await link.waitFor({state:'attached'});assert.equal(await link.count(),1);assert.equal(await link.isVisible(),false);await page.getByText('Préférences, capacités et autres détails',{exact:true}).click();await link.click();await page.waitForURL('**/#/profile/bilan');assert.match(await page.locator('#main').innerText(),/Mon bilan physique/);await page.waitForSelector('[data-act=bilanRun]');assert.ok(await page.locator('[data-act=perfAdd]').count()>0);await noOverflow();
  });
  await step('recherche « bilan physique » : accès direct au même bilan, sans changer le mode',async()=>{
    await home();await search('bilan physique','Mon bilan physique');await page.waitForURL('**/#/profile/bilan');await page.waitForSelector('[data-act=bilanRun]');assert.equal(await page.locator('html').getAttribute('data-interface'),'simple');
  });
  await step('Progrès simple : hausse de charge et séances dures visibles avec assez de données',async()=>{
    await page.locator('nav.tabs [data-id=progress]').click();await page.getByText('Ce qui mérite mon attention',{exact:true}).click();const observations=page.locator('#main details').filter({has:page.getByText('Ce qui mérite mon attention',{exact:true})});assert.match(await observations.innerText(),/1400 % au-dessus de ta moyenne des 4 semaines précédentes/);assert.match(await observations.innerText(),/3 séances enregistrées sur les 3 derniers jours/);assert.match(await observations.innerText(),/3 séances ressenties comme dures ou très dures/);assert.match(await observations.innerText(),/Ces observations décrivent tes séances et ton ressenti/);assert.equal(await page.locator('html').getAttribute('data-interface'),'simple');assert.equal(await page.locator('#main .grid3').count(),0,'résumé simple conservé');await noOverflow();
  });
  assert.deepEqual(errors,[]);console.log(`\n${count} étapes découverte simple / brouillon / bilan / charge E2E OK`);
}catch(error){await page.screenshot({path:'/tmp/escalade-simple-discovery-fail.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();await new Promise(resolve=>srv.server.close(resolve));}
