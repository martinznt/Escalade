// Parcours de l'interface simple et du planning réel, dans Chromium et avec le vrai Worker.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import { shiftDay, weekday, dayInZone } from '../public/agenda.js';
const srv=await startServer(),browser=await chromium.launch(process.env.PW_EXEC ? {executablePath:process.env.PW_EXEC} : {}),errors=[];
let n=0;
const step=async(name,fn)=>{
  try { await fn();console.log('  ✓',name);n++; }
  catch(e) {
    console.log('  ✗',name);
    if(process.env.GITHUB_ACTIONS)console.error('::error title=Interface simple et agenda E2E::'+`${name} : ${e.message}`.slice(0,4000).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));
    throw e;
  }
};
const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'allow'}),p=await ctx.newPage();
p.on('pageerror',e=>errors.push(e.message));
const poll=async(fn)=>{for(let i=0;i<60;i++){if(await fn())return;await p.waitForTimeout(200);}throw new Error('Synchronisation non terminée');};
const api=(path)=>p.evaluate(async path=>(await(await fetch(path)).json()),path);
const today=dayInZone(Date.now(),'Europe/Paris');let tuesday=today;while(weekday(tuesday)!==2)tuesday=shiftDay(tuesday,-1);const friday=shiftDay(tuesday,3);
try {
  await step('nouveau compte : interface simple par défaut',async()=>{
    await p.goto(srv.base);await p.click('[data-act=authPick][data-id=register]');await p.fill('input[name=username]','SimpleAgendaMobileCompte');await p.fill('input[name=password]','motdepasse1');await p.click('button[type=submit]');await p.waitForSelector('nav.tabs');
    await p.evaluate(async()=>{const m=await import('/state.js');m.putItem('config','main',{tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']});});
    await p.click('[data-act=setupSkip]');await p.waitForSelector('[data-act=expressOpen]');assert.equal(await p.locator('html').getAttribute('data-interface'),'simple');
  });
  await step('paramètres en un toucher : six rubriques et un seul choix d’interface',async()=>{
    await p.getByRole('button',{name:'Paramètres',exact:true}).click();
    await p.waitForSelector('.setmain > .setmenu .setrow');
    assert.equal(await p.locator('nav .ico svg').count(),5);
    assert.equal(await p.locator('.setmain > .setmenu .setrow').count(),6);
    assert.equal(await p.locator('[data-act=interfaceSet]').count(),2);
    assert.ok(await p.locator('[data-act=interfaceSet][data-v=simple]').isVisible());
    assert.equal(await p.locator('#settings-more').getAttribute('open'),null);
    await p.fill('[data-input=setFind]','interface simple');await p.waitForSelector('#setfindres [data-act=findGo]');
    assert.equal(await p.locator('.setmain').isVisible(),false);
    await p.click('#setfindres [data-act=findGo]');await p.waitForSelector('.setmain:not([hidden])');
    assert.equal(await p.locator('[data-act=interfaceSet]').count(),2);
    await p.fill('[data-input=setFind]','administration');await p.click('#setfindres [data-act=findGo]');await p.waitForSelector('[data-submit=adminOn]');
    assert.equal((await api('/api/auth/me')).user.isAdmin,false);await p.click('nav [data-id=settings]');await p.waitForSelector('[data-act=interfaceSet]');
  });
  await step('affichage : une seule taille du texte, couleurs facultatives et recherche précise',async()=>{
    await p.click('[data-act=setSub][data-id=display]');await p.waitForSelector('[data-act=a11ySize]');assert.equal(await p.locator('[data-act=interfaceSet]').count(),0);
    assert.equal((await p.locator('main').innerText()).match(/Taille du texte/g)?.length,1);
    assert.equal(await p.locator('[data-act=a11ySize]').count(),4);
    assert.equal(await p.locator('[data-act=appearColor]').first().isVisible(),false);
    await p.click('[data-act=a11ySize][data-v=l]');assert.equal(await p.locator('html').getAttribute('data-size'),'l');
    await p.click('[data-act=a11ySize][data-v=m]');
    await p.click('nav [data-id=settings]');await p.fill('[data-input=setFind]','espacement');await p.click('#setfindres [data-act=findGo]');
    await p.waitForSelector('[data-k=density].found');assert.ok(await p.locator('[data-act=appearColor]').first().isVisible());
    await p.click('nav [data-id=settings]');await p.fill('[data-input=setFind]','gros boutons');await p.click('#setfindres [data-act=findGo]');
    await p.waitForSelector('[data-act=a11ySet][data-k=big].found');await p.click('[data-act=a11ySet][data-k=big]');
    assert.equal(await p.locator('html').getAttribute('data-big'),'on');await p.click('[data-act=a11ySet][data-k=big]');
  });
  await step('recherche : compte et profil repliés accessibles ; mobile, bureau, clair et sombre',async()=>{
    await p.click('nav [data-id=settings]');await p.fill('[data-input=setFind]','mot de passe');await p.click('#setfindres [data-act=findGo]');
    await p.waitForSelector('[data-act=chpass].found');assert.ok(await p.locator('[data-act=chpass]').isVisible());
    await p.fill('[data-input=setFind]','profil questionnaire');await p.click('#setfindres [data-act=findGo]');
    await p.waitForSelector('[data-act=setupAgain].found');assert.ok(await p.locator('#settings-more [data-act=setupAgain][data-id=quiz]').isVisible());
    for(const [width,height] of [[320,568],[390,844],[1280,900]]) {
      await p.setViewportSize({width,height});
      for(const mode of ['dark','light']) {
        await p.click('nav [data-id=settings]');await p.click('[data-act=setSub][data-id=display]');await p.click(`[data-act=appear][data-k=mode][data-v=${mode}]`);await p.click('nav [data-id=settings]');await p.waitForSelector('.setmain:not([hidden])');
        const noOverflow=async state=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px ${mode}, ${state}`);
        await noOverflow('options repliées');assert.ok(await p.locator('[data-act=interfaceSet][data-v=simple]').isVisible());
        assert.equal(await p.locator('.set-account-name').innerText(),'👤 SimpleAgendaMobileCompte');
        const logout=await p.locator('[data-act=logout]').boundingBox();assert.ok(logout&&logout.x>=0&&logout.x+logout.width<=width,'bouton de déconnexion entièrement visible');
        // Une rubrique ouverte par la personne reste ouverte quand elle revient sur la page : on ne l'ouvre que si besoin.
        const openDetails=async sel=>{const d=p.locator(sel).first();if(!(await d.evaluate(x=>x.open)))await d.locator(':scope > summary').click();};
        await openDetails('details:has([data-act=chpass])');await noOverflow('compte ouvert');assert.ok(await p.locator('[data-act=chpass]').isVisible());
        await openDetails('#settings-more');await noOverflow('compte et profil ouverts');assert.ok(await p.locator('#settings-more [data-act=setupAgain][data-id=quiz]').isVisible());
        await p.screenshot({path:`/tmp/escalade-settings-${width}-${mode}.png`,fullPage:true});
      }
    }
    await p.setViewportSize({width:390,height:844});await p.click('[data-act=setSub][data-id=display]');
    await p.click('[data-act=appear][data-k=mode][data-v=light]');assert.equal(await p.locator('html').getAttribute('data-mode'),'light');
    await p.screenshot({path:'/tmp/escalade-display-light.png',fullPage:true});
    await p.click('[data-act=appear][data-k=mode][data-v=dark]');
  });
  await step('visites de page, générale et nouveauté : passer à toute étape et relancer',async()=>{
    await p.setViewportSize({width:320,height:568});
    const canSkip=async()=>{const b=p.getByRole('button',{name:'Passer la visite',exact:true});await b.waitFor();await p.waitForTimeout(350);const r=await b.boundingBox();assert.ok(r&&r.y>=0&&r.y+r.height<=p.viewportSize().height);};
    await p.click('nav [data-id=settings]');await p.click('[data-act=pageTour]');await canSkip();await p.click('#tour [data-act=tourNext]');await p.waitForSelector('#tour .tour-step:text-matches("^2 /")');await canSkip();
    await p.getByRole('button',{name:'Passer la visite',exact:true}).click();await p.waitForSelector('#tour',{state:'detached'});assert.match(p.url(),/#\/settings\/main/);
    await p.click('[data-act=setSub][data-id=help]');await p.click('[data-act=helpTour]');await canSkip();await p.click('#tour [data-act=tourNext]');await p.waitForSelector('#tour .tour-step:text-matches("^2 /")');await canSkip();
    await p.getByRole('button',{name:'Passer la visite',exact:true}).click();await p.waitForSelector('#tour',{state:'detached'});
    await p.reload();await p.waitForSelector('nav.tabs');await p.waitForTimeout(600);assert.equal(await p.locator('#tour').count(),0);
    await p.click('nav [data-id=settings]');await p.click('#settings-more > summary');await p.click('[data-act=setSub][data-id=updates]');await p.click('[data-act=notifTour][data-v="8.32.1"]');await canSkip();
    await p.click('#tour [data-act=tourNext]');await p.waitForSelector('#tour .tour-step:text-matches("^2 /")');await canSkip();
    await p.getByRole('button',{name:'Passer la visite',exact:true}).click();await p.waitForSelector('#tour',{state:'detached'});
    await p.click('nav [data-id=settings]');await p.click('[data-act=setSub][data-id=help]');await p.click('[data-act=helpTour]');await canSkip();
    await p.getByRole('button',{name:'Passer la visite',exact:true}).click();await p.waitForSelector('#tour',{state:'detached'});
    assert.equal((await api('/api/settings')).settings.interfaceMode,'simple');assert.equal((await api('/api/history')).history.length,0);
    await p.setViewportSize({width:390,height:844});await p.click('nav [data-id=home]');
    await p.screenshot({path:'/tmp/escalade-home-sober.png',fullPage:true});
  });
  await step('phrase de récurrence relue : mardi et vendredi, voie à Nicole Abar',async()=>{
    await p.click('[data-act=agendaPlan]');await p.fill('[data-submit=agendaParse] input','Tous les mardis et vendredis, escalade voie à Nicole Abar');await p.click('[data-submit=agendaParse] button');assert.equal(await p.inputValue('[name=place]'),'Nicole Abar');assert.equal(await p.locator('[name=days]:checked').count(),2);
    await p.fill('[name=date]',tuesday);await p.click('[data-submit=agendaSave] button[type=submit]');await p.waitForSelector('.cal');await poll(async()=>(await api('/api/calendar')).events.length===1);
    const ev=(await api('/api/calendar')).events[0];assert.deepEqual(ev.recurrence.days,[2,5]);assert.equal(ev.sessionId,null);
  });
  const openDay=async day=>{for(let i=0;i<12 && !(await p.locator(`[data-act=calDay][data-id="${day}"]`).count());i++){const cal=await p.evaluate(async()=>(await import('/state.js')).S.cal);const target=day.slice(0,7),current=String(cal.y)+'-'+String(cal.m+1).padStart(2,'0');await p.click(`[data-act=calMove][data-id="${target<current?-1:1}"]`);}await p.click(`[data-act=calDay][data-id="${day}"]`);};
  await step('bilan rapide de voie avec 20 minutes de bloc avant',async()=>{
    await openDay(tuesday);await p.click('[data-act=quickLog][data-id]');await p.fill('[name=minutes-0]','90');await p.selectOption('[name=rpe-0]','3');await p.locator('.quick-row').first().locator('summary').click();await p.fill('[name=performance-0]','6c');
    await p.getByText('＋ Ajouter autre chose avant / après',{exact:true}).click();await p.fill('[name=minutes-1]','20');await p.selectOption('[name=rpe-1]','4');await p.click('[data-submit=quickSave] button[type=submit]');await poll(async()=>(await api('/api/history')).history.length===2);
    const hist=(await api('/api/history')).history;assert.equal(hist.find(h=>h.data.activity==='climbing_boulder').data.quickLog.order,'before');assert.equal(hist.find(h=>h.data.activity==='climbing_route').durationSeconds,5400);assert.ok(hist.every(h=>h.data.exercises.length===0));
  });
  await step('compléter le même bilan ne duplique pas les activités',async()=>{
    await openDay(tuesday);await p.click('[data-act=quickLog][data-id]');assert.equal(await p.inputValue('[name=minutes-0]'),'90');await p.click('[data-submit=quickSave] button[type=submit]');await poll(async()=>(await api('/api/history')).history.length===2);
    const entry=(await api('/api/history')).history.find(h=>h.data.activity==='climbing_route');await p.evaluate(id=>location.hash='#/progress/history/'+id,entry.id);await p.waitForSelector('[data-act=histRedo]');assert.match(await p.locator('main').innerText(),/Repère déclaré : 6c/);assert.match(await p.locator('main').innerText(),/Prévu : .*Nicole Abar/);
    await p.click('[data-act=histRedo]');await p.waitForSelector('[data-act=cpGenerate]');assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.cp.minutes),90);await p.evaluate(()=>location.hash='#/home/cal');await p.waitForSelector('.cal');
  });
  await step('la prochaine occurrence reste prévue, sans effacer la réalité passée',async()=>{
    await openDay(friday);assert.equal(await p.locator('.agenda-event').count(),1);assert.ok((await p.locator('.agenda-event').innerText()).includes('Prévue'));await p.click('#sheet button[data-act=closeSheet]');
    const hist=(await api('/api/history')).history;assert.ok(hist.every(h=>h.data.agenda.occurrenceDate===tuesday));
  });
  await step('mode avancé puis simple : préférence persistante, même historique',async()=>{
    await p.click('nav [data-id=settings]');await p.click('[data-act=interfaceSet][data-v=advanced]');await poll(async()=>(await api('/api/settings')).settings.interfaceMode==='advanced');await p.reload();await p.waitForSelector('[data-act=interfaceSet][data-v=simple]');assert.equal(await p.locator('html').getAttribute('data-interface'),'advanced');await p.click('[data-act=interfaceSet][data-v=simple]');await poll(async()=>(await api('/api/settings')).settings.interfaceMode==='simple');assert.equal((await api('/api/history')).history.length,2);
  });
  await step('accueil, bibliothèque, moi et progrès lisibles à 320 et 390 px',async()=>{
    for(const width of [320,390])for(const tab of ['home','library','profile','progress']){await p.setViewportSize({width,height:844});await p.click(`nav [data-id=${tab}]`);await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px ${tab}`);assert.doesNotMatch(await p.locator('main').innerText(),/undefined|NaN|\[object Object\]|Cet écran n’a pas pu/);}
    await p.waitForTimeout(1200);await p.screenshot({path:'/tmp/escalade-simple-progress.png',fullPage:true});
  });
  await step('mémoire explicite et corrigeable, sans faux acquis',async()=>{
    await p.click('nav [data-id=profile]');await p.click('[data-act=profSub][data-id=memory]');await p.waitForSelector('h2');assert.match(await p.locator('main').innerText(),/Ce que l’app a compris/);
    const key=await p.evaluate(async()=>{const {putItem,render}=await import('/state.js'),{exKey}=await import('/shared.js');const key=exKey('Tractions');putItem('pref','memory-fixture',{key,label:'Tractions',value:'neutre',source:'explicit'});render();return key;});
    await p.click(`[data-act=memorySet][data-k="${key}"][data-v=evite]`);await poll(()=>p.evaluate(async key=>(await import('/state.js')).ctx().prefs[key]?.value==='evite',key));assert.match(await p.locator('main').innerText(),/Ton choix : à éviter/);
  });
  await step('Express utilise le créateur existant et conserve l’accès aux détails',async()=>{
    await p.click('nav [data-id=home]');await p.click('[data-act=expressOpen]');await p.fill('[data-submit=expressCreate] [name=text]','20 min gainage');await p.click('[data-submit=expressCreate] button[type=submit]');await p.waitForSelector('[data-act=cpGenerate]');assert.ok(await p.locator('[data-act=cpStepTo]').count());
    assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.cp.minutes),20);
  });
  await step('séance Express : générer, exécuter et répondre au questionnaire court',async()=>{
    await p.click('[data-act=cpGenerate]');await p.waitForSelector('[data-act=cpPlay]');await p.click('[data-act=cpPlay]');await p.waitForSelector('#player.open');
    for(let i=0;i<400 && !(await p.locator('#player [data-act=pSave]').count());i++){
      const action=await p.locator('#player [data-act=pRestSkip]').count()?'pRestSkip':await p.locator('#player [data-act=pWorkDone]').count()?'pWorkDone':'pGo';await p.click(`#player [data-act=${action}]`);
    }
    await p.waitForSelector('#player [data-act=qDiff]');assert.equal(await p.locator('#player details[open]').count(),0);await p.click('#player [data-act=qDiff][data-v="3"]');await p.click('#player [data-act=pSave]');await poll(async()=>(await api('/api/history')).history.length===3);assert.ok((await api('/api/history')).history.some(h=>h.data.exercises.length));
  });
  await step('création guidée : trois choix essentiels puis le même créateur',async()=>{
    await p.click('nav [data-id=home]');await p.click('[data-act=guidedOpen]');await p.selectOption('[data-submit=guidedCreate] [name=sport]','conditioning');await p.fill('[data-submit=guidedCreate] [name=minutes]','12');await p.click('[data-submit=guidedCreate] button[type=submit]');await p.waitForSelector('[data-act=cpGenerate]');assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.cp.minutes),12);
  });
  await step('activité libre : associer une séance générée à une seule occurrence',async()=>{
    await p.click('[data-act=cpGenerate]');await p.waitForSelector('[data-act=cpSave]');await p.click('[data-act=cpSave]');await p.waitForSelector('input[data-change=sName]');const sessionId=await p.evaluate(async()=>(await import('/state.js')).S.seances.items[0].id);
    await p.evaluate(()=>location.hash='#/home/cal');await p.waitForSelector('.cal');await openDay(friday);await p.click('[data-act=agendaGenerate]');await p.waitForSelector('[data-act=cpGenerate]');assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.cp.sport),'climbing_route');
    await p.evaluate(()=>location.hash='#/home/cal');await p.waitForSelector('.cal');await openDay(friday);await p.click('[data-act=agendaEdit]');await p.selectOption('[data-submit=agendaEditSave] [name=sessionId]',sessionId);await p.click('[data-submit=agendaEditSave] button[type=submit]');await poll(async()=>(await api('/api/calendar')).events.some(e=>e.meta?.occurrenceDate===friday && e.sessionId===sessionId));
    assert.equal((await api('/api/calendar')).events.find(e=>e.recurrence).sessionId,null);assert.equal((await api('/api/history')).history.length,3);await p.evaluate(()=>location.hash='#/home/dash');await p.waitForSelector('[data-act=quickLog]');
  });
  await step('bilan hors ligne : fermeture, réouverture et synchronisation sans doublon',async()=>{
    await p.click('nav [data-id=home]');await poll(()=>p.evaluate(async()=>!!(await navigator.serviceWorker.ready).active));
    await ctx.setOffline(true);await p.click('[data-act=quickLog]:not([data-id]),[data-act=quickLog][data-id=""]');await p.fill('[name=minutes-0]','15');await p.selectOption('[name=activity-0]','running');await p.click('[data-submit=quickSave] button[type=submit]');await p.reload();await p.waitForSelector('nav.tabs');assert.equal(await p.locator('html').getAttribute('data-interface'),'simple');
    await p.waitForFunction(async()=>(await import('/state.js')).S.loaded);
    const local=await p.evaluate(async()=>{const {S}=await import('/state.js');return S.history.length;});assert.equal(local,4);await ctx.setOffline(false);await p.evaluate(async()=>{const {syncAll}=await import('/state.js');await syncAll();});await poll(async()=>(await api('/api/history')).history.length===4);await p.reload();await p.waitForSelector('nav.tabs');assert.equal((await api('/api/history')).history.length,4);
    assert.equal(await p.evaluate(async()=>{const {ctx}=await import('/state.js'),{exKey}=await import('/shared.js');return ctx().prefs[exKey('Tractions')]?.value;}),'evite');
  });
  assert.deepEqual(errors,[]);console.log(`\n${n} étapes interface simple / agenda E2E OK`);
} catch(e){await p.screenshot({path:'/tmp/escalade-experience-fail.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();await new Promise(r=>srv.server.close(r));}
