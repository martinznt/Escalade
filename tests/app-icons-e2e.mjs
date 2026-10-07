// Chromium : préférence de compte, vrais manifests installables et ressources disponibles hors ligne.
// L'OS ne permet pas de vérifier ici une mise à jour instantanée du lanceur ; les textes de l'interface le disent.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv,startServer } from './server.mjs';
import { Client } from './helpers.mjs';
import pages from '../pages/_worker.js';
import worker from '../worker.js';
const env=makeEnv(),accounts={};
for(const name of ['IconOwnerA','IconOwnerB','IconOwnerGold']){const client=new Client(env);await client.register(name);accounts[name]=client;await client.post('/api/items',{changes:[{c:'config',id:'main',u:Date.now(),d:{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']}}]});}
await accounts.IconOwnerGold.post('/api/items',{changes:[{c:'config',id:'app-icon',u:Date.now(),d:{appIcon:'gold'}}]});
const srv=await startServer(env),browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{});
const context=await browser.newContext({viewport:{width:320,height:844},serviceWorkers:'allow'}),p=await context.newPage(),errors=[];
p.on('pageerror',error=>errors.push(error.message));let count=0;
const step=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const login=async(name)=>{if(await p.locator('[data-act=authPick][data-id=login]').count())await p.click('[data-act=authPick][data-id=login]');await p.waitForSelector('form[data-submit=login]');await p.fill('[name=username]',name);await p.fill('[name=password]','motdepasse1');await p.click('form[data-submit=login] button[type=submit]');await p.waitForSelector('nav.tabs');await p.evaluate(async()=>{window.iconState=(await import('/state.js')).S;});await p.waitForFunction(()=>window.iconState.loaded);};
const logout=async()=>{await p.evaluate(()=>location.hash='#/settings/main');await p.waitForSelector('[data-act=logout]');await p.click('[data-act=logout]');await p.click('#dialog.open [data-dlg="1"]');await p.waitForSelector('form[data-submit=login]');};
const appearance=async()=>{await p.evaluate(()=>location.hash='#/settings/display');await p.waitForSelector('#app-icons');if(!await p.locator('#app-icons').evaluate(el=>el.open))await p.click('#app-icons>summary');};
const chosen=async(id)=>{await p.click(`[data-act=appIconSet][data-id=${id}]`);await p.waitForFunction(id=>document.documentElement.dataset.appIcon===id,id);};
const synced=async()=>{await p.evaluate(async()=>{window.iconState=(await import('/state.js')).S;});await p.waitForFunction(()=>{const S=window.iconState;return S.sync==='ok'&&!S.syncing&&!S.dirtyItems.size&&!S.outbox.length&&!S.seancesDirty;});};
try{
  await step('HTML d’installation : choix validé avant JS, même identité et transmission par Pages',async()=>{
    const preview=await fetch(srv.base+'/?appIcon=slate'),html=await preview.text();assert.match(html,/rel="manifest" href="\/manifest-icons-slate-v1\.json"/);assert.match(html,/rel="apple-touch-icon" href="\/app-icon-slate-v1-180\.png"/);
    const proxy=await pages.fetch(new Request('https://icons-pages.test/?appIcon=white'),{APP:{fetch:request=>worker.fetch(request,env)}});assert.match(await proxy.text(),/manifest-icons-white-v1\.json/);
    const invalid=await(await fetch(srv.base+'/?appIcon=constructor')).text();assert.match(invalid,/rel="manifest" href="\/manifest\.json"/);assert.doesNotMatch(invalid,/manifest-icons-constructor/);assert.match(invalid,/rel="apple-touch-icon" href="\/app-icon-seances-v1-180\.png"/);
    const defaultHtml=await(await fetch(srv.base)).text();assert.match(defaultHtml,/rel="icon" href="\/app-icon-seances-v1-192\.png"/);const explicitDefault=await(await fetch(srv.base+'/?appIcon=seances')).text();assert.match(explicitDefault,/manifest-icons-seances-v1\.json/);
  });
  await p.goto(srv.base);await login('IconOwnerA');await synced();
  await step('apparence à 320 px : onze choix et calendrier de séances par défaut',async()=>{
    await p.click('[data-act=findOpen]');await p.fill('#sheet input[data-input=findQ]','icône');await p.locator('#findres [data-act=findGo]').filter({hasText:'Icône de l’application'}).click();await p.waitForFunction(()=>document.getElementById('app-icons')?.open);assert.equal(await p.locator('[data-act=appIconSet]').count(),11);assert.equal(await p.locator('[data-id=seances][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('[data-id=slate][data-act=appIconSet]').getAttribute('aria-checked'),'false');
    assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-seances-v1.json');assert.equal(await p.locator('link[rel=apple-touch-icon]').getAttribute('href'),'/app-icon-seances-v1-180.png');
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.match(await p.locator('#app-icons').innerText(),/ne peut pas imposer une mise à jour immédiate/);
    const repeated=await p.evaluate(async()=>{const panel=document.getElementById('app-icons'),original=panel.addEventListener;let calls=0;panel.addEventListener=function(type,...args){if(type==='toggle')calls++;return original.call(this,type,...args);};const {syncAppIcon}=await import('/app-icons.js');for(let i=0;i<8;i++)syncAppIcon();panel.addEventListener=original;return calls;});assert.equal(repeated,0,'aucun nouveau listener toggle sur le même panneau');
    await chosen('forest');await synced();assert.equal(await p.locator('#app-icons').evaluate(el=>el.open),true);assert.equal(await p.locator('[data-id=forest][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-forest-v1.json');assert.equal(await p.locator('.brand img').getAttribute('src'),'/app-icon-forest-v1-192.png');
    assert.equal((await accounts.IconOwnerA.get('/api/items?since=0')).data.items.find(it=>it.id==='app-icon').d.appIcon,'forest');await p.screenshot({path:'/tmp/escalade-app-icons-panel-320.png',fullPage:true});
  });
  await step('page préparée : icône d’installation explicite et choix du compte distinct',async()=>{
    await p.goto(srv.base+'/?appIcon=slate#/settings/display');await p.waitForSelector('#app-icons');await appearance();
    assert.equal(await p.locator('[data-id=forest][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-slate-v1.json');assert.equal(await p.locator('link[rel=apple-touch-icon]').getAttribute('href'),'/app-icon-slate-v1-180.png');assert.equal(await p.locator('.brand img').getAttribute('src'),'/app-icon-forest-v1-192.png');assert.match(await p.locator('#app-icons').innerText(),/Ton choix de compte reste « Forêt »/);
    await p.evaluate(()=>{window.oldAccountIcon=document.querySelector('[data-act=appIconSet][data-id=terra]');});
  });
  await step('changement de compte : B reçoit le défaut, ancienne action neutralisée et choix propres conservés',async()=>{
    await logout();assert.equal(new URL(p.url()).searchParams.has('appIcon'),false);await login('IconOwnerB');await synced();await appearance();assert.equal(await p.locator('[data-id=seances][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-seances-v1.json');
    await p.evaluate(async()=>{const {ACT}=await import('/state.js');ACT.appIconSet(window.oldAccountIcon);});assert.equal(await p.evaluate(()=>document.documentElement.dataset.appIcon),'seances');
    await p.locator('[data-act=appIconSet][data-id=slate]').focus();await p.keyboard.press('ArrowRight');await synced();assert.equal(await p.evaluate(()=>document.activeElement?.dataset.id),'white');assert.equal((await accounts.IconOwnerB.get('/api/items?since=0')).data.items.find(it=>it.id==='app-icon').d.appIcon,'white');await logout();await login('IconOwnerA');await synced();await appearance();assert.equal(await p.locator('[data-id=forest][data-act=appIconSet]').getAttribute('aria-checked'),'true');
  });
  await step('hors ligne : préférence modifiée et rechargée, onze manifests et quarante-quatre images utilisables',async()=>{
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await appearance();await chosen('mono');await p.reload();await p.waitForSelector('#app-icons');await appearance();assert.equal(await p.locator('[data-id=mono][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-mono-v1.json');
    const cached=await p.evaluate(async()=>{const {APP_ICONS}=await import('/app-icons.js');return Promise.all(APP_ICONS.map(async x=>{const manifest=await(await fetch(x.manifest)).json();const images=await Promise.all([x.icon,x.apple,x.large,x.maskable].map(async src=>(await fetch(src)).ok));return {id:manifest.id,start:manifest.start_url,images};}));});
    assert.equal(cached.length,11);assert.ok(cached.every(x=>x.id==='/'&&x.start==='/#/home/dash'&&x.images.every(Boolean)));assert.ok(await p.locator('[data-act=appIconSet][data-id=mono] img').evaluate(img=>img.complete&&img.naturalWidth===192));
    const offlinePage=await p.goto(srv.base+'/?appIcon=terra#/settings/display');assert.match(await offlinePage.text(),/manifest-icons-terra-v1\.json/);await p.waitForSelector('#app-icons');await appearance();assert.equal(await p.locator('[data-id=mono][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-terra-v1.json');
    const offlineFetch=await p.evaluate(async()=>(await fetch('/?appIcon=ocean')).text());assert.match(offlineFetch,/manifest-icons-ocean-v1\.json/);
    const canonical=await p.evaluate(async()=>{const key=(await caches.keys()).find(x=>x.startsWith('mes-seances-'));return (await(await caches.open(key)).match('/')).text();});assert.match(canonical,/rel="manifest" href="\/manifest\.json"/);assert.match(canonical,/rel="apple-touch-icon" href="\/app-icon-seances-v1-180\.png"/);
    await context.setOffline(false);await p.evaluate(async()=>(await import('/state.js')).syncAll());await synced();assert.equal((await accounts.IconOwnerA.get('/api/items?since=0')).data.items.find(it=>it.id==='app-icon').d.appIcon,'mono');
  });
  await step('choix doré explicite déjà enregistré : conservé après connexion et rechargement',async()=>{
    await logout();await login('IconOwnerGold');await synced();await appearance();assert.equal(await p.locator('[data-id=gold][data-act=appIconSet]').getAttribute('aria-checked'),'true');assert.equal(await p.locator('[data-id=seances][data-act=appIconSet]').getAttribute('aria-checked'),'false');assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest-icons-gold-v1.json');assert.equal(await p.locator('.brand img').getAttribute('src'),'/app-icon-gold-v1-192.png');await p.reload();await p.waitForSelector('nav.tabs');await synced();await appearance();assert.equal(await p.locator('[data-id=gold][data-act=appIconSet]').getAttribute('aria-checked'),'true');
  });
  assert.deepEqual(errors,[]);console.log(`\n${count} étapes icônes personnelles / installation E2E OK`);
}catch(error){await p.screenshot({path:'/tmp/escalade-app-icons-fail.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();await new Promise(resolve=>srv.server.close(resolve));}
