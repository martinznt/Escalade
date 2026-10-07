// Objectif écrit : profil privé par défaut et réponse tardive isolée par compte.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer, makeEnv } from './server.mjs';
import { Client } from './helpers.mjs';

const nativeFetch=globalThis.fetch;let lastBody,hold=false,release,nextAnswer;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.hostname==='eutils.ncbi.nlm.nih.gov')return new Response('',{status:503});
  if(url.hostname!=='generativelanguage.googleapis.com')return nativeFetch(input,options);
  lastBody=JSON.parse(options.body);
  const answer = nextAnswer || {status:'ok',basis:'request',sources:['request','app/model'],label:'OBJECTIF-GEMINI-VALIDÉ',description:'Améliorer le gainage.',activityId:'climbing_route',caps:[{id:'gainage_anterieur',w:0.8}],steps:['Commencer progressivement'],confidence:'haute'};
  const response=()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]});
  return hold?new Promise((resolve)=>{release=()=>resolve(response());}):response();
};
const env=makeEnv({GEMINI_API_KEY:'mock-key-for-goal-profile-test'}),accounts={};
for(const name of ['GoalOwnerA','GoalOwnerB']){
  const client=new Client(env);await client.register(name);accounts[name]=client;
  await client.post('/api/items',{changes:[{c:'config',id:'main',u:Date.now(),d:{setupDone:true,tourDone:true,asked:['acts','place','minutes','perWeek','goal','avoid']}}]});
}
await accounts.GoalOwnerA.post('/api/items',{changes:[{c:'env',id:'private-goal-place',u:Date.now(),d:{name:'LIEU-PRIVÉ-OBJECTIF',type:'maison',equipment:['bar'],isDefault:true}}]});
await accounts.GoalOwnerB.post('/api/admin/activate',{password:'secret-admin-de-test'});
await accounts.GoalOwnerB.post('/api/items',{changes:[{c:'lab',id:'lab-legacy-ui',u:Date.now(),d:{title:'Ancienne expérience de pieds',hypothesis:'Observer mes placements',startDate:'2026-10-01',weeks:4,status:'running',before:{value:4,note:'AVANT-DECLARE-CONSERVE',date:1000},after:{value:5,note:'APRES-DECLARE-CONSERVE',date:2000},conclusion:'Une observation personnelle.'}}]});
const srv=await startServer(env),browser=await chromium.launch(process.env.PW_EXEC?{executablePath:process.env.PW_EXEC}:{});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await context.newPage(),errors=[],requests=[];
p.on('pageerror',(error)=>errors.push(error.message));
p.on('request',(request)=>{const path=new URL(request.url()).pathname;if(path==='/api/ai/goal'||path==='/api/ai/status')requests.push({path,body:request.postDataJSON()});});
let count=0;
const step=async(name,fn)=>{await fn();count++;console.log('  ✓',name);};
const login=async(name)=>{if(await p.locator('[data-act=authPick][data-id=login]').count())await p.click('[data-act=authPick][data-id=login]');await p.waitForSelector('form[data-submit=login]');await p.fill('[name=username]',name);await p.fill('[name=password]','motdepasse1');await p.click('form[data-submit=login] button[type=submit]');await p.waitForSelector('nav.tabs');await p.waitForFunction(async()=>(await import('/views-setup.js')).mainConfig().setupDone);};
const openGoal=async()=>{await p.evaluate(()=>location.hash='#/profile/goals');await p.waitForSelector('[data-act=goalWrite]');await p.locator('[data-act=goalWrite]').first().click();await p.waitForSelector('[data-submit=goalAi]');};
const submit=async()=>{await p.fill('[data-submit=goalAi] [name=text]','Me renforcer pour grimper');await p.click('[data-submit=goalAi] button[type=submit]');};
const resetQuota=async()=>env.DB.prepare("DELETE FROM system_state WHERE key LIKE 'ai:gemini-minute:%' OR key LIKE 'ai:gemini-input:%' OR key LIKE 'rl:ai-%'").run();
const proof={status:'ok',basis:'request',sources:['request','app/model']};
const openIntent=async()=>{
  await p.evaluate(()=>location.hash='#/library/generate');await p.waitForSelector('[data-act=gOpen][data-k=intents]');
  if(!await p.locator('[data-act=gWrite][data-k=intent]').isVisible())await p.click('[data-act=gOpen][data-k=intents]');
  await p.click('[data-act=gWrite][data-k=intent]');await p.waitForSelector('[data-submit=gWriteGo]');
};
const askIntent=async()=>{await p.fill('[data-submit=gWriteGo] [name=text]','gainage dont je parle');await p.click('[data-submit=gWriteGo] button[type=submit]');};
const openExercise=async()=>{await p.evaluate(()=>location.hash='#/library/exercises');await p.waitForSelector('[data-act=aiOpen][data-id=exercise]');await p.click('[data-act=aiOpen][data-id=exercise]');await p.waitForSelector('[data-submit=aiAsk]');};
const askExercise=async()=>{await p.fill('[data-submit=aiAsk] [name=text]','gainage dont je parle');await p.click('[data-submit=aiAsk] button[type=submit]');};
const stored=async(collection)=>p.evaluate(async(collection)=>(await(await fetch('/api/items')).json()).items.filter((item)=>item.c===collection),collection);
const goTo=async(hash,selector)=>{await p.evaluate(hash=>location.hash=hash,hash);await p.waitForSelector(selector);};
const inspectSources=async(scope='main')=>{const block=p.locator(`${scope} .ai-sources`).first();await block.locator('summary').click();assert.match(await block.innerText(),/Référence interne de l’app/);assert.match(await block.innerText(),/ne valident pas son efficacité scientifique/);};
const poll=async(fn)=>{for(let i=0;i<60;i++){if(await fn())return;await p.waitForTimeout(100);}throw new Error('Sauvegarde non synchronisée');};
try{
  await p.goto(srv.base);
  await step('preuves structurées : références manquantes refusées et liens dangereux exclus du rendu',async()=>{
    const result=await p.evaluate(async()=>{
      const {aiProposalReady,aiEvidence}=await import('/srcui.js'),proof={status:'ok',basis:'request',sources:[{id:'request',label:'Ta demande',kind:'request'},{id:'app/model',label:'Modèle interne',kind:'app'}]};
      return {valid:aiProposalReady(proof),idsOnly:aiProposalReady({...proof,sources:['request','app/model']}),missing:aiProposalReady({...proof,sources:[proof.sources[0]]}),refusal:aiProposalReady({...proof,status:'clarify'}),markup:aiEvidence({sources:[{id:'x',kind:'app',label:'Source <img src=x onerror=alert(1)>',url:'javascript:alert(1)'},{id:'y',kind:'app',label:'Lien privé',url:'https://127.0.0.1/a'},{id:'z',kind:'app',label:'Page officielle',url:'https://example.org/guide'}]}).s};
    });
    assert.equal(result.valid,true);assert.equal(result.idsOnly,false);assert.equal(result.missing,false);assert.equal(result.refusal,false);assert.doesNotMatch(result.markup,/<img|href="javascript|href="https:\/\/127/);assert.match(result.markup,/&lt;img/);assert.match(result.markup,/href="https:\/\/example.org\/guide"/);
  });
  await login('GoalOwnerA');
  await step('objectif : résumé facultatif décoché et aucune donnée personnelle transmise par défaut',async()=>{
    await openGoal();assert.equal(await p.locator('[name=profileConsent]').isChecked(),false);
    await p.getByText('Voir le résumé et son destinataire',{exact:true}).click();assert.match(await p.locator('#sheet').innerText(),/LIEU-PRIVÉ-OBJECTIF/);assert.match(await p.locator('#sheet').innerText(),/Google.*Cloudflare/);
    const before=requests.length;await submit();await p.waitForSelector('[data-submit=goalFicheSave]');
    const sent=requests.slice(before);assert.equal(sent.some((request)=>request.path==='/api/ai/status'),false);
    const body=sent.find((request)=>request.path==='/api/ai/goal').body;assert.equal(body.profileConsent,false);assert.equal(body.profile,undefined);assert.doesNotMatch(JSON.stringify(lastBody),/LIEU-PRIVÉ-OBJECTIF/);
    assert.equal(await p.inputValue('[data-submit=goalFicheSave] [name=label]'),'OBJECTIF-GEMINI-VALIDÉ');
    await p.locator('.ai-sources summary').click();assert.match(await p.locator('.ai-sources').innerText(),/Référence interne de l’app/);assert.match(await p.locator('.ai-sources').innerText(),/Texte fourni par toi/);assert.doesNotMatch(await p.locator('#sheet').innerText(),/Confiance de l’assistant/);await p.keyboard.press('Escape');
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
  await step('objectif ambigu : la question du modèle est affichée sans fiche locale automatique',async()=>{
    await resetQuota();nextAnswer={status:'clarify',question:'Quel mouvement veux-tu améliorer avec le gainage ?'};
    const response=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/ai/goal');await submit();assert.equal((await response).status(),422);
    await p.waitForSelector('[data-submit=goalAi] [role=status]');assert.match(await p.locator('#sheet').innerText(),/Quel mouvement veux-tu améliorer/);
    assert.equal(await p.locator('[data-submit=goalFicheSave]').count(),0);assert.equal(await p.locator('[data-act=goalLocal]').count(),0);assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.goalDraft),null);
    assert.equal(await p.inputValue('[data-submit=goalAi] [name=text]'),'Me renforcer pour grimper');await p.keyboard.press('Escape');nextAnswer=null;
  });
  await step('objectif sans IA : préparation locale demandée explicitement, provenance correcte après sauvegarde',async()=>{
    srv.fail=(request)=>new URL(request.url).pathname==='/api/ai/goal'?Response.json({error:'Assistant indisponible pour le moment.'},{status:503}):null;
    await openGoal();await p.fill('[data-submit=goalAi] [name=text]','Renforcer mon gainage');await p.click('[data-submit=goalAi] button[type=submit]');await p.waitForSelector('[data-act=goalLocal]');
    assert.equal(await p.locator('[data-submit=goalFicheSave]').count(),0);assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.goalDraft),null);
    await p.click('[data-act=goalLocal]');await p.waitForSelector('[data-submit=goalFicheSave]');assert.match(await p.locator('#sheet').innerText(),/Fiche locale préparée sans IA/);assert.doesNotMatch(await p.locator('#sheet').innerText(),/Confiance de l’assistant|Sources utilisées/);
    assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.goalDraft.source),'local');await p.click('[data-submit=goalFicheSave] button[type=submit]');
    await poll(async()=>(await stored('goal')).some((item)=>item.d.label==='Renforcer mon gainage'&&item.d.source==='local'));srv.fail=null;
  });
  await step('intention ambiguë : aucun mot-clé ne contourne le refus 422',async()=>{
    await resetQuota();nextAnswer={status:'clarify',question:'Quelle partie du gainage veux-tu travailler ?'};await openIntent();
    const response=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/ai/intent');await askIntent();assert.equal((await response).status(),422);
    await p.waitForSelector('#sheet [role=status]');assert.match(await p.locator('#sheet').innerText(),/Quelle partie du gainage/);assert.equal(await p.locator('[data-act=gDraftSave]').count(),0);assert.equal(await p.locator('[data-act=gWriteLocal]').count(),0);assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.gDraft),null);await p.keyboard.press('Escape');
  });
  await step('intention comprise : références internes lisibles, confirmation puis origine IA conservée',async()=>{
    await resetQuota();nextAnswer={...proof,label:'TRAVAIL-GAINAGE-VALIDÉ',summary:'Reformulation de ta demande.',caps:{gainage_anterieur:0.8}};await openIntent();await askIntent();await p.waitForSelector('[data-act=gDraftSave]');
    await p.locator('.ai-sources summary').click();assert.match(await p.locator('.ai-sources').innerText(),/Référence interne de l’app/);assert.match(await p.locator('.ai-sources').innerText(),/ne valident pas son efficacité scientifique/);
    assert.equal((await stored('category')).some((item)=>item.d.label==='TRAVAIL-GAINAGE-VALIDÉ'),false);await p.click('[data-act=gDraftSave]');
    await poll(async()=>(await stored('category')).some((item)=>item.d.label==='TRAVAIL-GAINAGE-VALIDÉ'&&item.d.source==='ia'));nextAnswer=null;
  });
  await step('intention indisponible : choix local explicite et aucune fausse origine IA',async()=>{
    srv.fail=(request)=>new URL(request.url).pathname==='/api/ai/intent'?Response.json({error:'Assistant indisponible.'},{status:503}):null;
    await openIntent();await askIntent();await p.waitForSelector('[data-act=gWriteLocal]');assert.equal(await p.locator('[data-act=gDraftSave]').count(),0);
    await p.click('[data-act=gWriteLocal]');await p.waitForSelector('[data-act=gDraftSave]');assert.match(await p.locator('#sheet').innerText(),/Préparation locale.*sans IA/);assert.equal(await p.locator('.ai-sources').count(),0);await p.click('[data-act=gDraftSave]');
    await poll(async()=>(await stored('category')).some((item)=>item.d.label==='gainage dont je parle'&&item.d.source==='local'));srv.fail=null;
  });
  await step('fiche d’exercice non vérifiable : explication claire et aucun brouillon appliquable',async()=>{
    await resetQuota();nextAnswer={status:'unverified',reply:'Je ne peux pas vérifier cet exercice. Précise le mouvement.'};await openExercise();
    const response=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/ai/draft');await askExercise();assert.equal((await response).status(),422);
    await p.waitForSelector('.ai [data-act=aiManual]');assert.match(await p.locator('#sheet').innerText(),/informations nécessaires ne sont pas vérifiables/);assert.equal(await p.locator('[data-submit=aiSaveEx],[data-submit=aiSaveCap]').count(),0);assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.ai.draft),null);await p.keyboard.press('Escape');
  });
  await step('fiche d’exercice comprise : sources affichées sans badge de confiance scientifique',async()=>{
    await resetQuota();nextAnswer={...proof,type:'exercise',name:'EXERCICE-GAINAGE-VALIDÉ',summary:'Fiche à relire.',steps:['Choisir une position confortable.'],caps:{gainage_anterieur:0.8},confidence:'haute'};await openExercise();await askExercise();await p.waitForSelector('[data-submit=aiSaveEx]');
    await p.locator('.ai-sources summary').click();assert.match(await p.locator('.ai-sources').innerText(),/Texte fourni par toi/);assert.match(await p.locator('.ai-sources').innerText(),/ne valident pas son efficacité scientifique/);assert.doesNotMatch(await p.locator('#sheet').innerText(),/confiance haute|Confiance de l’assistant/i);
    assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.personal.some((ex)=>ex.name==='EXERCICE-GAINAGE-VALIDÉ')),false);await p.keyboard.press('Escape');nextAnswer=null;
  });
  await step('ancienne réponse sans provenance : le client refuse la fiche et demande une précision',async()=>{
    srv.fail=(request)=>new URL(request.url).pathname==='/api/ai/draft'?Response.json({draft:{type:'exercise',name:'FICHE-SANS-PREUVE',summary:'Ne pas appliquer.'}}):null;
    await openExercise();await askExercise();await p.waitForSelector('.ai [data-act=aiManual]');assert.match(await p.locator('#sheet').innerText(),/Cette fiche ne peut pas être vérifiée/);assert.equal(await p.locator('[data-submit=aiSaveEx]').count(),0);assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.ai.draft),null);srv.fail=null;
  });
  await p.keyboard.press('Escape');
  await step('bilan rapide : clarification sans remplacement local, puis sources et aucune sauvegarde automatique',async()=>{
    await resetQuota();await goTo('#/home/dash','[data-act=quickLog]');await p.locator('[data-act=quickLog]').first().click();await p.fill('[data-submit=quickParse] [name=text]','gainage dont je parle');
    nextAnswer={status:'clarify',question:'Combien de temps as-tu passé à courir ?'};const refused=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/ai/agenda');await p.click('[data-act=quickAi]');assert.equal((await refused).status(),422);await p.waitForFunction(()=>document.querySelector('#quick-ai-status')?.textContent.includes('Combien de temps'));assert.equal(await p.locator('.ai-sources').count(),0);
    nextAnswer={...proof,activities:[{activityId:'running',minutes:20,order:'main'}],confidence:'high'};await p.click('[data-act=quickAi]');await p.waitForSelector('#sheet .ai-sources');await inspectSources('#sheet');assert.equal(await p.inputValue('[name=minutes-0]'),'20');assert.equal(await p.locator('[name=activity-0]').inputValue(),'running');assert.equal((await accounts.GoalOwnerB.get('/api/history')).data.history.length,0);await p.keyboard.press('Escape');
  });
  await step('objectif du créateur : aucun repli sur mots-clés après 422, proposition sourcée avant ajout explicite',async()=>{
    await resetQuota();await p.evaluate(async()=>{const {openWizard}=await import('/views-climbplan.js');openWizard({sport:'climbing_route',auto:false});});await p.waitForSelector('[data-act=cpStep][data-d="1"]');await p.click('[data-act=cpStep][data-d="1"]');await p.waitForSelector('[data-input=cpWords]');await p.fill('[data-input=cpWords]','gainage dont je parle');
    nextAnswer={status:'clarify',question:'Dans quelle situation veux-tu améliorer ton gainage ?'};const refused=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/ai/intent');await p.click('[data-act=cpAiAim]');assert.equal((await refused).status(),422);await p.getByText('Dans quelle situation veux-tu améliorer ton gainage ?', {exact:true}).waitFor();assert.equal(await p.locator('[data-act=cpAiLocal],[data-act=cpAiAdd]').count(),0);
    nextAnswer={...proof,label:'OBJECTIF-CREATEUR-SOURCE',summary:'Intention à relire.',caps:{gainage_anterieur:0.8}};await p.click('[data-act=cpAiAim]');await p.waitForSelector('[data-act=cpAiAdd]');await inspectSources();assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.cp.aims.some((a)=>a.label==='OBJECTIF-CREATEUR-SOURCE')),false);await p.click('[data-act=cpAiCancel]');
  });
  await step('modification de séance : question affichée sans plan, puis preuve des phases partagées sans application',async()=>{
    await resetQuota();await p.evaluate(async()=>{const {ACT}=await import('/state.js');ACT.cpEditAi();});await p.fill('[data-input=cpEditText]','Adapte cette séance à mon emploi du temps');
    nextAnswer={status:'clarify',question:'Combien de minutes sont disponibles pour cette séance ?'};await p.click('[data-act=cpEditPlan]');await p.locator('#sheet [role=status]').waitFor();assert.match(await p.locator('#sheet').innerText(),/Combien de minutes/);assert.equal(await p.locator('[data-act=cpEditApply]').count(),0);
    nextAnswer={...proof,sources:['request','app/model','session/phases'],ops:[{op:'total',minutes:60}]};await p.click('[data-act=cpEditPlan]');await p.waitForSelector('#sheet .ai-sources');await inspectSources('#sheet');assert.match(await p.locator('.ai-sources').innerText(),/Phases de séance partagées/);await p.keyboard.press('Escape');
  });
  await step('Studio IA : clarification conservant la demande, brouillon sourcé et publication manuelle',async()=>{
    await resetQuota();await goTo('#/settings/studio','[data-act=studioAi]');await p.click('[data-act=studioAi]');await p.fill('[data-submit=studioAiGo] [name=text]','Explique comment noter une séance');
    nextAnswer={status:'clarify',question:'Quelle étape du bilan veux-tu expliquer ?'};const refused=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/admin/studio/ai');await p.click('[data-submit=studioAiGo] button');assert.equal((await refused).status(),422);await p.locator('[data-submit=studioAiGo] [role=status]').waitFor();assert.match(await p.locator('#sheet').innerText(),/Quelle étape du bilan/);assert.equal(await p.inputValue('[data-submit=studioAiGo] [name=text]'),'Explique comment noter une séance');
    nextAnswer={...proof,q:'Comment noter une séance sans détails ?',a:'Ouvre le calendrier et complète le bilan rapide.'};await p.click('[data-submit=studioAiGo] button');await p.waitForSelector('[data-act=studioPublish]');await inspectSources();const id=await p.evaluate(()=>location.hash.split('/').at(-1));assert.equal((await accounts.GoalOwnerB.get('/api/admin/studio/'+id)).data.set.status,'draft');assert.equal((await accounts.GoalOwnerB.get('/api/global')).data.items.some((item)=>item.data?.q==='Comment noter une séance sans détails ?'),false);await p.reload();await p.waitForSelector('[data-act=studioPublish]');assert.equal(await p.locator('main .ai-sources').count(),0);assert.match(await p.locator('main').innerText(),/références de cette génération ne sont pas conservées/);
  });
  await step('Laboratoire : aucune solution sur question, provenance visible sur hypothèse et brouillon choisi',async()=>{
    await resetQuota();await goTo('#/settings/lab','[data-act=labGo]');await p.fill('[data-input=labText]','Les utilisateurs ne trouvent pas le bilan rapide');nextAnswer={status:'clarify',question:'Quelle page rend le bilan difficile à trouver ?'};await p.click('[data-act=labGo]');await p.locator('main [role=status]').waitFor();assert.match(await p.locator('main').innerText(),/Quelle page rend le bilan/);assert.equal(await p.locator('[data-act=labDraft]').count(),0);
    nextAnswer={...proof,reformulation:'Une difficulté de navigation déclarée.',rules:['Le bilan se trouve dans le calendrier.'],questions:[],solutions:[{title:'Expliquer le bilan',how:'Préparer une FAQ à relire.',pros:['Un lien plus visible.'],cons:['Résultat à vérifier.'],risk:'faible',change:{kind:'faq',data:{q:'Où trouver mon bilan rapide ?',a:'Ouvre ton calendrier.'}}}]};await p.click('[data-act=labGo]');await p.waitForSelector('[data-act=labDraft]');await inspectSources();await p.click('[data-act=labDraft]');await p.waitForSelector('[data-act=studioPublish]');await inspectSources();await p.reload();await p.waitForSelector('[data-act=studioPublish]');assert.equal(await p.locator('main .ai-sources').count(),0);assert.match(await p.locator('main').innerText(),/références de cette génération ne sont pas conservées/);
  });
  await step('maintenance : sources déclaratives, refus sans piste et aucune preuve de bug reproduit',async()=>{
    await resetQuota();await accounts.GoalOwnerB.post('/api/bugs',{title:'Bilan difficile à trouver',description:'Je ne trouve pas le bilan dans le calendrier.',page:'home/cal'});await goTo('#/settings/maint','[data-act=maintRun]');nextAnswer={status:'clarify',question:'Quelle étape est difficile ?'};await p.click('[data-act=maintRun]');await p.getByText('Pistes de l’assistant',{exact:true}).waitFor();assert.match(await p.locator('main').innerText(),/aucune correction|Aucune correction|aucune piste|piste vérifiable|Quelle étape/);assert.equal(await p.locator('[data-act=codeNew]').count(),0);
    nextAnswer={...proof,findings:[{title:'Navigation rapportée',detail:'Difficulté déclarée, sans reproduction.',severity:'faible',proposal:'Vérifier le lien du bilan sur mobile.',area:'code',sources:['report:0']}]};await p.click('[data-act=maintRun]');await p.waitForSelector('[data-act=codeNew]');await inspectSources();await p.locator('.ai-sources').nth(1).locator('summary').click();assert.match(await p.locator('.ai-sources').nth(1).innerText(),/Signalement utilisateur/);assert.match(await p.locator('main').innerText(),/ne prouve pas qu’un bug a été reproduit/);
  });
  await step('Lab personnel : protocole et notes repliés, sauvegardés séparément et anciennes mesures préservées',async()=>{
    await goTo('#/progress/lab','[data-act=labNew]');await p.click('[data-act=labEdit][data-id=lab-legacy-ui]');await p.waitForSelector('[data-submit=labSave]');
    const detail=p.locator('[data-submit=labSave] details').filter({has:p.locator('[name=protocol]')});assert.equal(await detail.evaluate((el)=>el.open),false);assert.equal(await p.inputValue('[name=protocol]'),'');assert.equal(await p.inputValue('[name=notes]'),'');await detail.locator('summary').click();
    await p.fill('[name=protocol]','Deux séances de pieds par semaine, mêmes voies faciles.');await p.fill('[name=notes]','Je note aussi ma fatigue et les changements de contexte.');await p.click('[data-submit=labSave] button[type=submit]');
    await poll(async()=>(await stored('lab')).some((item)=>item.id==='lab-legacy-ui'&&item.d.protocol==='Deux séances de pieds par semaine, mêmes voies faciles.'&&item.d.notes==='Je note aussi ma fatigue et les changements de contexte.'));
    const experiment=(await stored('lab')).find((item)=>item.id==='lab-legacy-ui');assert.deepEqual(experiment.d.before,{value:4,note:'AVANT-DECLARE-CONSERVE',date:1000});assert.deepEqual(experiment.d.after,{value:5,note:'APRES-DECLARE-CONSERVE',date:2000});assert.equal(experiment.d.hypothesis,'Observer mes placements');assert.equal(experiment.d.conclusion,'Une observation personnelle.');
    await p.reload();await p.waitForSelector('[data-act=labEdit][data-id=lab-legacy-ui]');await p.click('[data-act=labEdit][data-id=lab-legacy-ui]');assert.equal(await p.inputValue('[name=protocol]'),experiment.d.protocol);assert.equal(await p.inputValue('[name=notes]'),experiment.d.notes);await p.keyboard.press('Escape');
  });
  await step('Laboratoire tardif : un changement de compte empêche résultat, navigation et brouillon privés',async()=>{
    await resetQuota();await goTo('#/settings/lab','[data-act=labGo]');await p.fill('[data-input=labText]','ANALYSE-PRIVEE-B : explique la navigation du bilan');nextAnswer={...proof,reformulation:'REPONSE-PRIVEE-LAB-B',rules:[],questions:[],solutions:[]};hold=true;release=null;await p.click('[data-act=labGo]');for(let i=0;i<80&&!release;i++)await p.waitForTimeout(25);assert.ok(release);
    await goTo('#/settings/main','[data-act=logout]');await p.click('[data-act=logout]');await p.click('#dialog.open [data-dlg="1"]');await p.waitForSelector('form[data-submit=login]');await login('GoalOwnerA');const response=p.waitForResponse((r)=>new URL(r.url()).pathname==='/api/admin/lab');release();hold=false;await (await response).finished();await p.waitForTimeout(100);assert.equal(await p.evaluate(async()=>(await import('/state.js')).S.studio),null);assert.doesNotMatch(await p.locator('body').innerText(),/REPONSE-PRIVEE-LAB-B|ANALYSE-PRIVEE-B/);
  });
  assert.deepEqual(errors,[]);console.log(`\n${count} étapes objectif / confidentialité E2E OK`);
}catch(error){console.error('Erreurs navigateur :',errors);await p.screenshot({path:'/tmp/escalade-goal-profile-fail.png',fullPage:true}).catch(()=>{});throw error;}finally{release?.();await browser.close();await new Promise((resolve)=>srv.server.close(resolve));globalThis.fetch=nativeFetch;}
