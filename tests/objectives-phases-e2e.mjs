// Vrai Worker + vrais clics : objectifs indépendants, blocs partagés et associations enregistrées.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
const srv=await startServer(), browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{});
const errors=[]; let n=0, reference;
const step=async(name,fn)=>{await fn();n++;console.log('  ✓',name);};
try {
  for(const mode of ['simple','advanced']) {
    const ctx=await browser.newContext({viewport:{width:mode==='simple'?320:390,height:844},serviceWorkers:'allow'});
    await ctx.addInitScript(()=>localStorage.setItem('sea:q-snooze',JSON.stringify(Object.fromEntries(['acts','climbPerWeek','place','minutes','perWeek','bloc','tractions','pompes','goal','avoid'].map(k=>[k,9e15])))));
    assert.equal((await ctx.request.post(srv.base+'/api/auth/register',{headers:{Origin:srv.base},data:{username:'Objectifs'+mode,password:'motdepasse1'}})).status(),200);
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(srv.base);await p.waitForSelector('nav.tabs');
    await p.evaluate(async mode=>{
      const {S,putItem,saveSettings,syncAll,go}=await import('/state.js');
      putItem('config','main',{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']});
      putItem('activity','act-bloc',{preset:'climbing_boulder',label:'Escalade — bloc',archived:false});
      putItem('env','mur',{name:'Mur test',type:'salle',equipment:['wall','mat'],isDefault:true});
      S.settings.interfaceMode=mode;saveSettings();S.setup=null;(await import('/ui.js')).closeSheet();await syncAll();go('home');
    },mode);
    if(mode==='advanced')await p.locator('nav.tabs [data-id=library]').click();
    await p.getByRole('button',{name:'Créer une séance',exact:true}).waitFor();
    await p.getByRole('button',{name:'Créer une séance',exact:true}).click();
    await p.waitForSelector('.steps');
    const state=()=>p.evaluate(async()=>JSON.parse(JSON.stringify((await import('/state.js')).S.cp)));
    const click=async selector=>{
      // Ouvrir par leur vrai résumé les sections facultatives contenant le contrôle.
      for(let k=0;k<5;k++) {
        const ancestor=await p.locator(selector).first().evaluate(el=>{let d=el.closest('details:not([open])');return d?.id||d?.querySelector('summary')?.textContent||null;});
        if(!ancestor)break;
        const details=p.locator('details:not([open])').filter({has:p.locator(selector)}).first();
        await details.locator(':scope > summary').click();
      }
      await p.locator(selector).first().click();
    };
    const to=async target=>{for(let k=0;k<12;k++){const current=Number((await p.locator('.steps b').innerText()).match(/Étape (\d)/)[1]);if(current===target)return;await click(`.stepdock [data-act=cpStep][data-d="${current<target?1:-1}"]`);await p.waitForFunction(c=>!document.querySelector('.steps b')?.textContent.includes(`Étape ${c}/`),current);}throw new Error('Étape inaccessible');};
    const foot='int:pieds@climbing_boulder', placement='int:placement@climbing_boulder';
    await step(`${mode} : deux résultats compatibles partagent un bloc et le même moteur`,async()=>{
      await click('[data-act=cpSport][data-id=climbing_boulder]');await click('[data-act=cpMin][data-id="60"]');await to(2);
      await click(`[data-act=cpAimAdd][data-k="${foot}"]`);await click(`[data-act=cpAimAdd][data-k="${placement}"]`);await to(3);
      assert.match(await p.locator('#main').innerText(),/Les objectifs disent ce que tu veux obtenir/);
      const c=await state(), main=c.parts.filter(ph=>ph.aimLinks?.some(a=>a.contribution==='primary'));
      assert.equal(c.aims.length,2);assert.equal(main.length,1);assert.equal(main[0].aimLinks.length,2);
      assert.equal(c.parts.reduce((v,ph)=>v+ph.minutes,0),60);
      const signature=c.parts.map(ph=>({type:ph.type,minutes:ph.minutes,role:ph.role,links:ph.aimLinks}));
      if(reference)assert.deepEqual(signature,reference);else reference=signature;
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.match(await p.locator('.cp-org-summary').innerText(),/1 bloc technique.*2 objectifs associés/);
      assert.equal(await p.locator('.cp-org-details').getAttribute('open'),mode==='advanced'?'':null);
    });
    await step(`${mode} : choix manuel plusieurs-à-plusieurs et moment modifié conservent les verrous`,async()=>{
      if(await p.locator('[data-act=cpEditStruct]').count())await click('[data-act=cpEditStruct]');
      await click('[data-act=cpEdit][data-i="0"]');await p.waitForSelector('#sheet.open');
      await click(`#sheet [data-act=cpPhAim][data-id="${placement}"]`);
      assert.ok(!(await state()).parts[0].aimLinks.some(a=>a.key===placement),'association retirée par le choix manuel');
      await click(`#sheet [data-act=cpPhAim][data-id="${placement}"]`);
      let c=await state();assert.ok(c.parts[0].aimLinks.some(a=>a.key===placement));
      await click('#sheet [data-act=cpLock][data-k=goal]');
      assert.equal((await state()).parts[0].locks.goal,'user');
      assert.ok(await p.locator(`#sheet [data-act=cpPhAim][data-id="${placement}"]`).isDisabled());
      await p.keyboard.press('Escape');await p.waitForSelector('#sheet.open',{state:'detached'});
      const before=(await state()).parts;
      await p.selectOption('[data-change=cpAimWhen][data-i="1"]','end');
      c=await state();assert.deepEqual(c.parts,before);assert.equal(c.aims[1].when,'end');
      assert.match(await p.locator('#main').innerText(),/Tes phases et leurs verrous sont conservés/);
      // Le bouton principal reprend directement le brouillon, sans changer les choix ni l'interface.
      const preserved=await state();
      await p.locator(`nav.tabs [data-id=${mode==='simple'?'home':'library'}]`).click();
      await p.getByRole('button',{name:'Créer une séance',exact:true}).click();await p.waitForSelector('.steps');
      assert.deepEqual((await state()).parts,preserved.parts);assert.equal((await state()).aims[1].when,'end');
      assert.equal(await p.locator('html').getAttribute('data-interface'),mode);
    });
    await step(`${mode} : génération, enregistrement et relecture gardent les liens sans créer de fiche objectif`,async()=>{
      await to(6);await click('[data-act=cpGenerate]');await p.waitForSelector('#cpresult [data-act=cpSave]');
      const generated=(await state()).result;assert.equal(generated.context.aims.length,2);
      assert.ok(generated.context.phases.filter(ph=>ph.aimLinks.some(a=>a.key===placement)).length>=2);
      assert.equal(generated.context.phases[0].locks.goal,'user');
      await click('[data-act=cpSave]');
      await p.evaluate(async()=>(await import('/state.js')).syncAll());
      await p.reload();await p.waitForSelector('nav.tabs');
      const items=await p.evaluate(async()=>(await(await fetch('/api/sync')).json()).items);
      const saved=items.find(x=>x.id===generated.id);
      assert.equal(items.length,1,'une seule séance créée');
      assert.ok(saved,'séance enregistrée sur le serveur');
      assert.deepEqual(saved.context.aims,generated.context.aims);
      assert.deepEqual(saved.context.phases,generated.context.phases);
      const profile=await p.evaluate(async()=>(await(await fetch('/api/items?since=0')).json()).items);
      assert.equal(profile.filter(x=>x.c==='goal').length,0);
    });
    await ctx.close();
  }
  assert.deepEqual(errors,[]);console.log(`${n} étapes navigateur objectifs–phases OK`);
} finally {await browser.close();await new Promise(r=>srv.server.close(r));}
