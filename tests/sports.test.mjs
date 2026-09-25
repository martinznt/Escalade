import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_PRESETS, defaultProfile, ensureActivity, addActivity, addMetric, analyzeProfile, inferDomain, generateGenericSession } from '../public/sports.js';

test('profil multi-activité : activité native et catégories',()=>{
  const p=defaultProfile(); ensureActivity(p,'running');
  assert.equal(p.activities.running.domains.length,8);
  assert.ok(p.activities.running.domains.some(x=>x.key==='seuil'));
});

test('périmètre V1 : basketball et cyclisme ne sont pas des activités préconfigurées',()=>{
  assert.ok(!('basketball' in ACTIVITY_PRESETS));
  assert.ok(!('cycling' in ACTIVITY_PRESETS));
});

test('profil : max tractions reconnu comme tirage et pompes comme poussée',()=>{
  const p=defaultProfile(); ensureActivity(p,'strength');
  addMetric(p,{activityId:'strength',name:'Max tractions',value:16,unit:'reps'});
  addMetric(p,{activityId:'strength',name:'Max pompes',value:40,unit:'reps'});
  assert.equal(p.metrics[1].domain,'tirage');
  assert.equal(p.metrics[0].domain,'poussee');
  const a=analyzeProfile(p,'strength');
  assert.equal(a.metricCount,2); assert.ok(a.domains.length===2);
});

test('activité personnalisée : catégories initiales et ajout d’indicateur',()=>{
  const p=defaultProfile(); const a=addActivity(p,'Basket');
  assert.ok(a && a.custom); assert.ok(a.domains.length>=3);
  addMetric(p,{activityId:a.id,name:'Vitesse',value:8,unit:'s'});
  assert.equal(p.metrics[0].domain,'vitesse');
});

test('générateur générique produit une séance orientée vers faiblesse ou force',()=>{
  const p=defaultProfile(); ensureActivity(p,'running');
  addMetric(p,{activityId:'running',name:'5 km',value:40,unit:'min',score:30,domain:'endurance'});
  addMetric(p,{activityId:'running',name:'Vitesse',value:90,unit:'score',score:90,domain:'vitesse'});
  const weak=generateGenericSession({activityId:'running',mode:'weaknesses',duration:'medium'},p);
  const strong=generateGenericSession({activityId:'running',mode:'strengths',duration:'medium'},p);
  assert.ok(weak.session.exercises.length>=3); assert.ok(strong.session.exercises.length>=3);
  assert.equal(weak.meta.mode,'weaknesses'); assert.equal(strong.meta.mode,'strengths');
});

test('détection de domaine par langage naturel',()=>{
  assert.equal(inferDomain('strength','Max traction','',ACTIVITY_PRESETS),'tirage');
  assert.equal(inferDomain('strength','Pompes max','',ACTIVITY_PRESETS),'poussee');
  assert.equal(inferDomain('running','5 km','',ACTIVITY_PRESETS),'endurance');
});

test('analyzeProfile ne présente jamais une estimation comme une mesure : le domaine est marqué estimated selon la donnée réelle',()=>{
  const p=defaultProfile(); ensureActivity(p,'strength');
  // Score déclaré explicitement par l'utilisateur → ce n'est PAS une estimation.
  addMetric(p,{activityId:'strength',name:'Ressenti tirage',value:1,unit:'',score:70,domain:'tirage'});
  const declared=analyzeProfile(p,'strength').domains.find(d=>d.domain==='tirage');
  assert.equal(declared.estimated,false);
  // Aucun score fourni : le système doit deviner via metricScore() → c'est une estimation, à marquer comme telle.
  addMetric(p,{activityId:'strength',name:'Pompes','value':30,'unit':'reps','domain':'poussee'});
  const guessed=analyzeProfile(p,'strength').domains.find(d=>d.domain==='poussee');
  assert.equal(guessed.estimated,true);
  // Un domaine qui mélange une valeur déclarée et une valeur devinée reste marqué estimé dans son ensemble
  // (le chiffre affiché combine les deux, donc il ne peut pas être présenté comme une mesure pure).
  addMetric(p,{activityId:'strength',name:'Développé couché','value':50,'unit':'kg','domain':'poussee'});
  addMetric(p,{activityId:'strength',name:'Ressenti poussée','value':1,'unit':'','score':60,'domain':'poussee'});
  const mixed=analyzeProfile(p,'strength').domains.find(d=>d.domain==='poussee');
  assert.equal(mixed.estimated,true);
});
