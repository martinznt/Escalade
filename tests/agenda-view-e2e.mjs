// Régressions navigateur : rendez-vous libres, retrait de bilan et rappels d’occurrence.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import { dayInZone, weekday, shiftDay } from '../public/agenda.js';
const srv=await startServer(),browser=await chromium.launch(process.env.PW_EXEC ? {executablePath:process.env.PW_EXEC}:{}),errors=[];
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris'}),page=await context.newPage();
page.on('pageerror',(error)=>errors.push(error.message));
let count=0,eventId,protectedExercises;
const today=dayInZone(Date.now(),'Europe/Paris');
const step=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const api=(path)=>page.evaluate(async(path)=>(await(await fetch(path)).json()),path);
const poll=async(fn)=>{for(let i=0;i<80;i++){if(await fn())return;await page.waitForTimeout(150);}throw new Error('Synchronisation non terminée');};
const openLog=async()=>{await page.locator('.agenda-event [data-act=quickLog]').first().click();await page.waitForSelector('[data-submit=quickSave]');};
const saveLog=async()=>{await page.click('[data-submit=quickSave] button[type=submit]');await page.waitForSelector('[data-submit=quickSave]',{state:'detached'});};
try {
  await step('rappel facultatif : une heure est requise avant sauvegarde',async()=>{
    await page.goto(srv.base);await page.click('[data-act=authPick][data-id=register]');await page.fill('[name=username]','AgendaRegression');await page.fill('[name=password]','motdepasse1');await page.click('button[type=submit]');await page.waitForSelector('nav.tabs');
    await page.evaluate(async()=>{const m=await import('/state.js');m.putItem('config','main',{tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']});});
    await page.click('[data-act=setupSkip]');await page.waitForSelector('[data-act=agendaPlan]');await page.click('[data-act=agendaPlan]');
    await page.selectOption('[data-submit=agendaSave] [name=activityId]','climbing_route');await page.fill('[name=place]','Salle régression');await page.fill('[name=date]',today);await page.check(`[name=days][value="${weekday(today)}"]`);
    await page.getByText('Heure, durée, rappel et autres options',{exact:true}).click();await page.selectOption('[name=reminderMin]','30');await page.click('[data-submit=agendaSave] button[type=submit]');
    assert.match(await page.locator('#toast').innerText(),/Renseigne une heure/);assert.equal((await api('/api/calendar')).events.length,0);
    await page.fill('[name=time]','18:30');await page.click('[data-submit=agendaSave] button[type=submit]');await page.waitForSelector('.cal');await poll(async()=>(await api('/api/calendar')).events.length===1);
    const event=(await api('/api/calendar')).events[0];eventId=event.id;assert.equal(event.meta.reminderMin,30);assert.equal(event.recurrence.timeZone,'Europe/Paris');
  });
  await step('activité libre du jour : bilan et occurrence accessibles, sans fausse suppression',async()=>{
    await page.evaluate(()=>location.hash='#/home/dash');await page.waitForSelector('[data-act=nothingPlanned]');
    const card=page.locator('section.card').filter({has:page.locator('[data-act=nothingPlanned]')});
    assert.doesNotMatch(await card.innerText(),/séance.*supprimée/);await card.locator('[data-act=agendaEdit]').click();await page.waitForSelector('[data-submit=agendaEditSave]');
    assert.equal(await page.inputValue('[name=title]'),'Escalade — voie · Salle régression');await page.keyboard.press('Escape');
    await card.locator('[data-act=quickLog]').click();await page.fill('[name=minutes-0]','60');await page.getByText('＋ Ajouter autre chose avant / après',{exact:true}).click();await page.fill('[name=minutes-1]','20');await saveLog();
    await poll(async()=>(await api('/api/history')).history.length===2);
  });
  await step('modifier voie + bloc en voie seule retire le bloc après validation et conserve les exercices',async()=>{
    await page.evaluate(async({eventId,today})=>{const m=await import('/state.js');m.addHistory({id:'protected-structured',sessionName:'Séance structurée conservée',startedAt:Date.now()-60000,durationSeconds:600,data:{activity:'conditioning',quickLog:{order:'after'},agenda:{eventId,occurrenceDate:today},exercises:[{name:'Squats',sets:[{reps:10,done:true}]}]}});m.render();},{eventId,today});
    await poll(async()=>(await api('/api/history')).history.length===3);protectedExercises=(await api('/api/history')).history.find((h)=>h.id==='protected-structured').data.exercises;
    await openLog();assert.match(await page.locator('#sheet').innerText(),/séances détaillées.*conservées séparément/);
    await page.fill('[data-submit=quickParse] input','1 h de voie');await page.click('[data-submit=quickParse] button');assert.match(await page.locator('#sheet').innerText(),/1 activité.*seront retirées/);
    assert.equal((await api('/api/history')).history.length,3);await saveLog();await poll(async()=>(await api('/api/history')).history.length===2);
    const history=(await api('/api/history')).history;assert.equal(history.some((h)=>h.data.activity==='climbing_boulder'),false);assert.deepEqual(history.find((h)=>h.id==='protected-structured').data.exercises,protectedExercises);
  });
  await step('retrait explicite d’une autre activité : annuler le retrait puis valider, sans doublon',async()=>{
    await openLog();await page.getByText('＋ Ajouter autre chose avant / après',{exact:true}).click();await page.fill('[name=minutes-1]','15');await saveLog();await poll(async()=>(await api('/api/history')).history.length===3);
    await openLog();await page.click('[data-act=quickRemove]');assert.ok(await page.locator('.quick-removed').isVisible());assert.equal((await api('/api/history')).history.length,3);
    await page.click('[data-act=quickRestore]');assert.ok(await page.locator('[name=minutes-1]').isVisible());assert.equal(await page.inputValue('[name=minutes-1]'),'15');
    await page.click('[data-act=quickRemove]');await saveLog();await poll(async()=>(await api('/api/history')).history.length===2);
    assert.deepEqual((await api('/api/history')).history.find((h)=>h.id==='protected-structured').data.exercises,protectedExercises);
    await openLog();await saveLog();await poll(async()=>(await api('/api/history')).history.length===2);
  });
  await step('couper le rappel de cette occurrence garde la série et son prochain rappel',async()=>{
    await page.locator('.agenda-event [data-act=agendaEdit]').first().click();await page.selectOption('[name=reminderMin]','0');await page.click('[data-submit=agendaEditSave] button[type=submit]');
    await poll(async()=>(await api('/api/calendar')).events.some((event)=>event.meta?.seriesId===eventId && event.meta.reminderMin===0));
    const events=(await api('/api/calendar')).events;assert.equal(events.find((event)=>event.id===eventId).meta.reminderMin,30);
    const next=shiftDay(today,7);const occurrence=await page.evaluate(async(next)=>(await import('/agenda.js')).agendaEvents((await import('/state.js')).S.events,next)[0],next);assert.equal(occurrence.meta.reminderMin,30);
    await page.evaluate(async()=>{const m=await import('/state.js');m.putItem('config','dashboard',{blocks:['next']});m.render();});await page.waitForSelector('[data-act=agendaEdit][data-date="'+next+'"]');await page.click('[data-act=agendaEdit][data-date="'+next+'"]');await page.waitForSelector('[data-submit=agendaEditSave]');assert.equal(await page.inputValue('[name=date]'),next);
  });
  assert.deepEqual(errors,[]);console.log(`\n${count} étapes rendez-vous / bilans E2E OK`);
} catch(error){await page.screenshot({path:'/tmp/escalade-agenda-view-fail.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();await new Promise((resolve)=>srv.server.close(resolve));}
