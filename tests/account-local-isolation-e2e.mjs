// Deux comptes sur un appareil : caches, intentions hors ligne et réponses tardives restent chez leur propriétaire.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { makeEnv, startServer } from './server.mjs';
import { Client } from './helpers.mjs';

const env=makeEnv(),accounts={};
for(const name of ['LocalOwnerA','LocalOwnerB']){
  const client=new Client(env);await client.register(name);accounts[name]=client;
  await client.post('/api/items',{changes:[{c:'config',id:'main',u:Date.now(),d:{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']}}]});
}
const srv=await startServer(env),browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await context.newPage(),errors=[],bWrites=[];
let blockPrivate=false,activeAccount='',count=0;
p.on('pageerror',error=>errors.push(error.message));
p.on('request',request=>{const path=new URL(request.url()).pathname;if(activeAccount==='LocalOwnerB'&&['POST','PUT','DELETE'].includes(request.method())&&['/api/items','/api/sync','/api/history','/api/calendar','/api/settings'].includes(path))bWrites.push(request.postData()||'');});
await p.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;if(blockPrivate&&['/api/items','/api/sync','/api/history','/api/calendar','/api/settings'].includes(path))await route.abort('failed');else await route.continue();});
const step=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const login=async name=>{
  activeAccount=name;
  if(await p.locator('[data-act=authPick][data-id=login]').count())await p.click('[data-act=authPick][data-id=login]');
  await p.waitForSelector('form[data-submit=login]');await p.fill('[name=username]',name);await p.fill('[name=password]','motdepasse1');await p.click('form[data-submit=login] button[type=submit]');
  await p.waitForSelector('nav.tabs');await p.waitForFunction(async()=>(await import('/state.js')).S.loaded);await p.waitForFunction(async()=>(await import('/views-setup.js')).mainConfig().setupDone);
};
const logout=async()=>{await p.evaluate(()=>location.hash='#/settings/main');await p.waitForSelector('[data-act=logout]');await p.click('[data-act=logout]');await p.click('#dialog.open [data-dlg="1"]');await p.waitForSelector('form[data-submit=login]');activeAccount='';};
try{
  await p.goto(srv.base);await login('LocalOwnerA');await p.waitForFunction(async()=>(await import('/state.js')).S.sync==='ok');
  await step('compte A : données privées et intentions hors ligne gardées sous sa clé',async()=>{
    blockPrivate=true;
    await p.evaluate(async()=>{
      const {S,ACT,INPUT,putItem,saveSeance,addHistory,saveEvent,saveSettings,writePending,persistNow,ls}=await import('/state.js');
      putItem('env','private-a-place',{name:'PRIVÉ-A-LIEU',type:'maison',equipment:['bar']});
      const session=saveSeance({id:'private-a-session',name:'PRIVÉ-A-SÉANCE',activity:'conditioning',exercises:[{id:'private-a-ex',name:'Pompes',mode:'reps',sets:2,repsMin:5,repsMax:5}]});
      addHistory({id:'private-a-history',sessionName:'PRIVÉ-A-HISTORIQUE',startedAt:Date.now(),durationSeconds:600,data:{activity:'conditioning',exercises:[]}});
      saveEvent({id:'private-a-event',date:new Date().toISOString().slice(0,10),sessionId:session.id,title:'PRIVÉ-A-RENDEZ-VOUS'});
      S.settings.interfaceMode='advanced';S.settings.defaultMinutes=77;saveSettings();
      S.failed.push({opId:'private-a-failed',method:'POST',path:'/api/settings',body:{settings:{defaultMinutes:77}},label:'PRIVÉ-A-ÉCHEC'});
      S.conflicts.push({key:'env:private-a-place',local:{c:'env',id:'private-a-place',u:Date.now(),d:{name:'PRIVÉ-A-CONFLIT'}},server:{c:'env',id:'private-a-place',u:1,d:{name:'Ancien'}},at:Date.now()});
      S.gen.result={session};S.gen.envId='private-a-place';S.lastOpenSeance=session.id;S.lastOpenSeanceOwner=S.user.id;S.goalDraft={label:'PRIVÉ-A-BROUILLON'};
      const {vClimbPlan}=await import('/views-climbplan.js');ACT.cpNew();vClimbPlan();ACT.cpSport({dataset:{id:'conditioning'}});ACT.cpMin({dataset:{id:'73'}});ACT.cpEnvPick({dataset:{id:'private-a-place'}});INPUT.cpWords({value:'PRIVÉ-A-OBJECTIF'});ACT.cpStep({dataset:{d:'1'}});
      const nav=await import('/nav.js');nav.setReturn('PRIVÉ-A-RETOUR','library/seance/private-a-session');
      ls.set('sea:climbplan',{minutes:299,intentText:'PRIVÉ-LEGACY-OBJECTIF'});ls.set('sea:return',{label:'PRIVÉ-LEGACY-RETOUR',to:'library/seance/legacy-a',from:'home/dash',at:Date.now()});
      S.settings.autoWarm=false;const {startPlayer}=await import('/player.js');startPlayer(session,{fromGenerator:true});
      writePending();await persistNow();
    });
    assert.ok(await p.evaluate(async()=>{const {S,ls}=await import('/state.js');return ls.get('sea:pending:'+S.user.id).outbox.some(op=>op.body?.id==='private-a-history');}));
  });
  await step('compte B sans cache : aucune donnée ou action de A affichée ni envoyée',async()=>{
    // Le joueur est hors de #app : on passe par l'action de déconnexion sans abandonner sa reprise.
    await p.evaluate(()=>{document.getElementById('player').classList.remove('open');document.body.classList.remove('noscroll');});
    await logout();blockPrivate=false;await login('LocalOwnerB');await p.waitForFunction(async()=>(await import('/state.js')).S.sync==='ok');
    const state=await p.evaluate(async()=>{const {S}=await import('/state.js');return {sessions:S.seances.items,history:S.history,events:S.events,items:[...S.items.values()],outbox:S.outbox,failed:S.failed,conflicts:S.conflicts,dirty:[...S.dirtyItems],seancesDirty:S.seancesDirty,gen:S.gen,last:S.lastOpenSeance,lastOwner:S.lastOpenSeanceOwner,goal:S.goalDraft,settings:S.settings};});
    assert.deepEqual(state.sessions,[]);assert.deepEqual(state.history,[]);assert.deepEqual(state.events,[]);assert.deepEqual(state.outbox,[]);assert.deepEqual(state.failed,[]);assert.deepEqual(state.conflicts,[]);assert.deepEqual(state.dirty,[]);assert.equal(state.seancesDirty,false);
    assert.doesNotMatch(JSON.stringify(state.items),/private-a|PRIVÉ-A/);assert.equal(state.gen.result,null);assert.equal(state.gen.plan,null);assert.equal(state.gen.envId,'');assert.equal(state.last,null);assert.equal(state.lastOwner,null);assert.equal(state.goal,null);assert.equal(state.settings.interfaceMode,'simple');assert.notEqual(state.settings.defaultMinutes,77);
    assert.doesNotMatch(await p.locator('body').innerText(),/PRIVÉ-A/);assert.doesNotMatch(bWrites.join('\n'),/private-a|PRIVÉ-A/);
    assert.deepEqual((await accounts.LocalOwnerB.get('/api/history')).data.history,[]);assert.deepEqual((await accounts.LocalOwnerB.get('/api/calendar')).data.events,[]);
    assert.doesNotMatch(JSON.stringify(await accounts.LocalOwnerB.get('/api/items?since=0')),/private-a|PRIVÉ-A/);
    const draft=await p.evaluate(async()=>{const {S,ACT,INPUT,ls}=await import('/state.js');const {vClimbPlan}=await import('/views-climbplan.js');vClimbPlan();const before={minutes:S.cp.minutes,intent:S.cp.intentText,env:S.cp.envId};const player=await import('/player.js');const resume=String(player.resumeCard());ACT.pResume();const resumed=!!S.player;const nav=await import('/nav.js'),returnHtml=String(nav.returnBar());ACT.cpSport({dataset:{id:'conditioning'}});ACT.cpMin({dataset:{id:'41'}});INPUT.cpWords({value:'B-OBJECTIF'});nav.setReturn('B-RETOUR','library/seance/b-session');return {before,resume,resumed,returnHtml,scoped:ls.get('sea:climbplan:'+S.user.id),noScroll:document.body.classList.contains('noscroll')};});
    assert.notEqual(draft.before.minutes,73);assert.notEqual(draft.before.minutes,299);assert.doesNotMatch(JSON.stringify(draft.before),/PRIVÉ-A|PRIVÉ-LEGACY|private-a/);assert.equal(draft.resume,'');assert.equal(draft.resumed,false);assert.equal(draft.noScroll,false);assert.doesNotMatch(draft.returnHtml,/PRIVÉ-A|PRIVÉ-LEGACY/);assert.equal(draft.scoped.minutes,41);
  });
  await step('retour au compte A : cache, modifications et échecs restent disponibles',async()=>{
    await logout();blockPrivate=true;await login('LocalOwnerA');
    const state=await p.evaluate(async()=>{const {S}=await import('/state.js');return {sessions:S.seances.items,history:S.history,events:S.events,items:[...S.items.values()],outbox:S.outbox,failed:S.failed,conflicts:S.conflicts,dirty:[...S.dirtyItems],settings:S.settings};});
    assert.ok(state.sessions.some(s=>s.id==='private-a-session'));assert.ok(state.history.some(h=>h.id==='private-a-history'));assert.ok(state.events.some(e=>e.id==='private-a-event'));assert.ok(state.items.some(it=>it.id==='private-a-place'));assert.ok(state.outbox.some(op=>op.body?.id==='private-a-history'));assert.ok(state.failed.some(op=>op.opId==='private-a-failed'));assert.equal(state.conflicts.length,1);assert.ok(state.dirty.some(key=>key.includes('private-a-place')));assert.equal(state.settings.interfaceMode,'advanced');assert.equal(state.settings.defaultMinutes,77);
    const restored=await p.evaluate(async()=>{const {S,ACT}=await import('/state.js');const {vClimbPlan}=await import('/views-climbplan.js');vClimbPlan();const nav=await import('/nav.js'),player=await import('/player.js');const result={minutes:S.cp.minutes,intent:S.cp.intentText,env:S.cp.envId,returnHtml:String(nav.returnBar()),resume:String(player.resumeCard())};ACT.pResume();result.resumedOwner=S.player?.ownerId;result.owner=S.user.id;return result;});
    assert.equal(restored.minutes,73);assert.equal(restored.intent,'PRIVÉ-A-OBJECTIF');assert.equal(restored.env,'private-a-place');assert.match(restored.returnHtml,/PRIVÉ-A-RETOUR/);assert.match(restored.resume,/PRIVÉ-A-SÉANCE/);assert.equal(restored.resumedOwner,restored.owner);
  });
  await step('rechargement et lien profond : l’identifiant de la séance locale reste ouvert',async()=>{
    await p.evaluate(()=>{document.getElementById('player').classList.remove('open');document.body.classList.remove('noscroll');location.hash='#/library/seance/private-a-session';});
    await p.waitForSelector('[data-change=sName]');await p.reload();await p.waitForSelector('[data-change=sName]');
    assert.equal(await p.inputValue('[data-change=sName]'),'PRIVÉ-A-SÉANCE');assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.param),'private-a-session');
    const linked=await context.newPage();linked.on('pageerror',error=>errors.push(error.message));await linked.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return ['/api/items','/api/sync','/api/history','/api/calendar','/api/settings'].includes(path)?route.abort('failed'):route.continue();});
    await linked.goto(srv.base+'/#/library/seance/private-a-session');await linked.waitForSelector('[data-change=sName]');assert.equal(await linked.inputValue('[data-change=sName]'),'PRIVÉ-A-SÉANCE');await linked.close();
  });
  const probeContext=await browser.newContext({serviceWorkers:'block'}),probe=await probeContext.newPage();probe.on('pageerror',error=>errors.push(error.message));await probe.goto(srv.base);await probe.waitForFunction(()=>window.__seaStarted===true);
  await step('changement pendant lecture et écriture différée : la réponse tardive de A est ignorée',async()=>{
    const result=await probe.evaluate(async()=>{
      const m=await import('/state.js');m.setRenderer(()=>{});const get=m.idb.get.bind(m.idb);let release;
      m.S.user={id:'race-a',username:'A'};m.render();
      m.S.seances.items=[{id:'race-a-session',name:'PRIVÉ-A-CACHE'}];m.persist();
      m.idb.get=async key=>key==='data:race-a'?new Promise(resolve=>{release=resolve;}):get(key);
      const old=m.loadLocal();await Promise.resolve();
      for(const selector of ['#sheet','#player','#dialog']){const el=document.querySelector(selector);el.innerHTML='<p>PRIVÉ-A-FENÊTRE</p>';el.classList.add('open');}
      m.S.user={id:'race-b',username:'B'};m.render();await m.loadLocal();await m.persistNow();
      release({seances:{items:[{id:'race-a-session',name:'PRIVÉ-A-CACHE'}]},items:[],history:[],events:[]});await old;m.idb.get=get;
      const cacheA=await get('data:race-a'),cacheB=await get('data:race-b');
      return {sessions:m.S.seances.items,cacheA,cacheB,overlays:[...document.querySelectorAll('#sheet,#player,#dialog')].map(el=>({open:el.classList.contains('open'),text:el.textContent}))};
    });
    assert.deepEqual(result.sessions,[]);assert.equal(result.cacheA.seances.items[0].id,'race-a-session');assert.deepEqual(result.cacheB.seances.items,[]);assert.ok(result.overlays.every(el=>!el.open&&!el.text));
  });
  await step('synchronisation et ancien 401 : aucune mutation ou requête suivante sous le nouveau compte',async()=>{
    const result=await probe.evaluate(async()=>{
      const m=await import('/state.js'),native=window.fetch;let release,expired=0;const writes=[];
      m.S.user={id:'sync-a',username:'A'};m.render();m.setOnExpired(()=>{expired++;});
      window.fetch=async(path,options)=>{
        if(String(path).startsWith('/api/items?'))return new Promise(resolve=>{release=()=>resolve(Response.json({items:[{c:'env',id:'sync-a-place',u:Date.now(),d:{name:'PRIVÉ-A-RÉPONSE'}}],now:Date.now(),more:false}));});
        if(path==='/late-401')return new Promise(resolve=>{window.release401=()=>resolve(Response.json({error:'Ancienne session'},{status:401}));});
        writes.push({path,body:options?.body});return Response.json({items:[],tomb:{},history:[],events:[],settings:{},personal:[],common:[]});
      };
      const old=m.syncAll(),late=m.api('GET','/late-401').catch(()=>{});while(!release)await Promise.resolve();
      m.S.user={id:'sync-b',username:'B'};m.render();await m.loadLocal();release();window.release401();await Promise.all([old,late]);window.fetch=native;
      return {items:[...m.S.items.values()],syncing:m.S.syncing,writes,expired};
    });
    assert.deepEqual(result.items,[]);assert.equal(result.syncing,false);assert.deepEqual(result.writes,[]);assert.equal(result.expired,0);
  });
  await step('notifications, comptes admin et signalements tardifs : ni données ni affichage de l’ancienne connexion',async()=>{
    const cases=await probe.evaluate(async()=>{
      const m=await import('/state.js'),{vSettings}=await import('/views-settings.js'),native=window.fetch,results=[];
      const paths=['/api/proposals/mine','/api/admin/proposals','/api/admin/users','/api/admin/push-status','/api/bugs/mine'];
      try{
        for(const [status,returnToA] of [[200,false],[503,false],[200,true]]){
          const held=new Map(),pending=[];
          window.fetch=(path,options)=>paths.includes(path)?new Promise(resolve=>held.set(path,resolve)):native(path,options);
          m.S.user={id:'private-fetch-a',username:'A',isAdmin:true,roles:['super']};m.render();
          m.S.tab='settings';m.S.sub.settings='users';vSettings();await new Promise(resolve=>setTimeout(resolve,0));
          m.S.sub.settings='push';vSettings();
          m.ACT.setSub({dataset:{id:'bug'}});
          pending.push(m.ACT.notifOpen());
          for(let i=0;i<30&&held.size<5;i++)await new Promise(resolve=>setTimeout(resolve,0));
          if(held.size!==5)throw new Error('Les cinq lectures privées doivent être en attente.');
          m.S.user={id:'private-fetch-b',username:'B'};m.render();
          if(returnToA){m.S.user={id:'private-fetch-a',username:'A',isAdmin:true,roles:['super']};m.render();}
          m.S.inbox={mine:[{id:'CURRENT-INBOX'}],adminList:[]};m.S.notifUnread=3;m.S.myBugs=[{id:'CURRENT-BUG'}];m.S.admin={bugs:null,marker:'CURRENT-ADMIN'};
          const before=JSON.stringify({inbox:m.S.inbox,unread:m.S.notifUnread,myBugs:m.S.myBugs,admin:m.S.admin});
          for(const [path,release] of held){
            const data=path.includes('proposals')?{proposals:[{id:'OLD-PRIVATE',status:'done',label:'OLD-PRIVATE',reply:'OLD-PRIVATE'}]}:path.includes('users')?{users:[{id:'OLD-PRIVATE',username:'OLD-PRIVATE'}]}:path.includes('bugs')?{reports:[{id:'OLD-PRIVATE',title:'OLD-PRIVATE'}]}:{version:'OLD-PRIVATE',broadcast:{title:'OLD-PRIVATE'}};
            release(Response.json(status===200?data:{error:'OLD-PRIVATE-ERROR'},{status}));
          }
          await Promise.all(pending);
          for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));
          results.push({status,returnToA,unchanged:before===JSON.stringify({inbox:m.S.inbox,unread:m.S.notifUnread,myBugs:m.S.myBugs,admin:m.S.admin}),sheet:document.querySelector('#sheet')?.textContent||''});
        }
      }finally{window.fetch=native;}
      return results;
    });
    for(const result of cases){assert.equal(result.unchanged,true,'les lectures privées restent dans leur session : '+JSON.stringify(result));assert.doesNotMatch(result.sheet,/OLD-PRIVATE/);}
  });
  await step('retours IA tardifs : création, objectif et modification de A ne changent aucun brouillon de B',async()=>{
    const cases=await probe.evaluate(async()=>{
      const m=await import('/state.js'),{openAssistant}=await import('/views-ai.js'),{vClimbPlan}=await import('/views-climbplan.js'),native=window.fetch,results=[];
      try{
        for(const status of [200,503]){
          const held=new Map();
          window.fetch=(path)=>new Promise(resolve=>held.set(path,resolve));
          m.S.user={id:'late-ai-a-'+status,username:'A'};m.render();await m.loadLocal();
          openAssistant('exercise');const form=document.querySelector('[data-submit=aiAsk]');form.elements.namedItem('text').value='PRIVÉ-A-IDÉE';form.elements.namedItem('activityId').value='conditioning';
          const create=m.SUBMIT.aiAsk(form);vClimbPlan();m.S.cp.intentText='PRIVÉ-A-OBJECTIF';
          const intent=m.ACT.cpAiAim();m.ACT.cpEditAi();m.INPUT.cpEditText({value:'zyxwvu inconnu'});const edit=m.ACT.cpEditPlan();
          for(let i=0;i<20&&held.size<3;i++)await Promise.resolve();
          if(held.size!==3)throw new Error('Les trois appels IA doivent être en attente.');
          m.S.user={id:'late-ai-b-'+status,username:'B'};m.render();await m.loadLocal();vClimbPlan();
          m.S.ai={kind:'exercise',text:'B-IDÉE',loading:false,draft:null,error:''};m.S.cp.intentText='B-OBJECTIF';m.S.cpAiDraft={label:'B-BROUILLON'};m.S.cpEdit={text:'B-MODIFICATION',plan:null};
          const read=()=>JSON.stringify({ai:m.S.ai,cp:m.S.cp,aim:m.S.cpAiDraft,edit:m.S.cpEdit});const before=read();
          const replies={'/api/ai/draft':{draft:{type:'exercise',name:'PRIVÉ-A-RÉPONSE'}},'/api/ai/intent':{intent:{label:'PRIVÉ-A-RÉPONSE',caps:{gainage_anterieur:1}}},'/api/ai/session-edit':{ops:[{type:'scale',scope:'all',factor:0.5}]}};
          for(const [path,release] of held)release(Response.json(status===200?replies[path]:{error:'PRIVÉ-A-ERREUR'},{status}));
          const settled=await Promise.allSettled([create,intent,edit]);
          results.push({status,paths:[...held.keys()].sort(),unchanged:read()===before,settled:settled.map(r=>r.status),sheetOpen:document.getElementById('sheet').classList.contains('open'),body:document.body.innerText});
        }
      }finally{window.fetch=native;}
      return results;
    });
    for(const result of cases){assert.deepEqual(result.paths,['/api/ai/draft','/api/ai/intent','/api/ai/session-edit']);assert.equal(result.unchanged,true,'les brouillons de B restent intacts après HTTP '+result.status);assert.deepEqual(result.settled,['fulfilled','fulfilled','fulfilled']);assert.equal(result.sheetOpen,false);assert.doesNotMatch(result.body,/PRIVÉ-A/);}
  });
  await probeContext.close();
  await step('création de compte depuis invité : transfert explicite conservé',async()=>{
    const guestContext=await browser.newContext({serviceWorkers:'block'}),g=await guestContext.newPage();g.on('pageerror',error=>errors.push(error.message));await g.goto(srv.base);await g.click('[data-act=guestStart]');await g.waitForSelector('nav.tabs');
    await g.evaluate(async()=>{const m=await import('/state.js');m.putItem('config','main',{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']});m.putItem('env','guest-place',{name:'INVITÉ-CONSERVÉ',type:'maison'});m.saveSeance({id:'guest-session',name:'INVITÉ-SÉANCE',activity:'conditioning',exercises:[]});await m.ACT.guestUpgrade();});
    await g.waitForSelector('form[data-submit=register]');await g.fill('[name=username]','PromotedGuestLocal');await g.fill('[name=password]','motdepasse1');await g.click('form[data-submit=register] button[type=submit]');await g.waitForSelector('nav.tabs');await g.waitForFunction(async()=>(await import('/state.js')).S.loaded);
    const result=await g.evaluate(async()=>{const {S,ls}=await import('/state.js');return {guest:S.user.guest,sessions:S.seances.items,items:[...S.items.values()],oldPending:ls.get('sea:pending:guest')};});
    assert.notEqual(result.guest,true);assert.ok(result.sessions.some(s=>s.id==='guest-session'));assert.ok(result.items.some(it=>it.id==='guest-place'&&it.d.name==='INVITÉ-CONSERVÉ'));assert.equal(result.oldPending,null);await guestContext.close();
  });
  assert.deepEqual(errors,[]);console.log(`\n${count} étapes isolation des comptes / stockage E2E OK`);
}catch(error){await p.screenshot({path:'/tmp/escalade-account-local-fail.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();await new Promise(resolve=>srv.server.close(resolve));}
