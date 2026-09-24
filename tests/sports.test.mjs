import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_PRESETS, defaultProfile, ensureActivity, addActivity, addMetric, analyzeProfile, inferDomain, generateGenericSession } from '../public/sports.js';

test('V1 : seules les activités prévues sont préconfigurées',()=>{
  assert.ok(ACTIVITY_PRESETS.climbing_boulder); assert.ok(ACTIVITY_PRESETS.strength); assert.ok(ACTIVITY_PRESETS.running); assert.ok(ACTIVITY_PRESETS.swimming);
  assert.equal(ACTIVITY_PRESETS.basketball, undefined); assert.equal(ACTIVITY_PRESETS.cycling, undefined);
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
