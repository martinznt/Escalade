// Le catalogue de résultats et les blocs de temps restent indépendants après génération et relecture.
import assert from 'node:assert/strict';
import { normalizeContext, normalizeSession } from '../public/shared.js';
import { normalizePhases } from '../public/phase.js';
import { buildFromParts } from '../public/climbplan.js';
import { familyAim, planFromAims } from '../public/aimplan.js';
import { act, it, ctxOf } from './fixtures.mjs';
let n=0; const ok=(name,fn)=>{fn();n++;console.log('  ✓',name);};
const aims=[
  {...familyAim('technique','climbing_boulder'),key:'goal:g1',label:'Précision des pieds',goalId:'g1',source:'goal',rank:0,caps:{technique_pieds:1}},
  {...familyAim('technique','climbing_boulder'),key:'txt:bassin',label:'Placement du bassin',source:'words',rank:1,caps:{technique_escalade:.8}},
];
ok('génération et relecture : catalogue, références plusieurs-à-plusieurs, provenance, verrous et créneau conservés',()=>{
  const plan=planFromAims({aims,sports:['climbing_boulder'],envId:'mur',envEquip:{mur:['wall']},windows:[{envId:'mur',name:'Mur',from:'18:00',to:'19:00'}]});
  const phases=normalizePhases(plan.phases,'climbing_boulder');
  phases.find(p=>p.type==='climb').locks.goal='user';
  const ctx=ctxOf({items:[act('climbing_boulder'),it('env',{name:'Mur',type:'salle',equipment:['wall','mat'],isDefault:true},'mur')]});
  const s=buildFromParts(phases,ctx,{sport:'climbing_boulder',envId:'mur',envName:'Mur',aims});
  const reload=normalizeSession(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(reload.context.aims.map(a=>[a.key,a.source,a.rank,a.goalId]),[['goal:g1','goal',0,'g1'],['txt:bassin','words',1,'']]);
  const main=reload.context.phases.find(p=>p.type==='climb');
  assert.equal(main.aimLinks.length,2); assert.equal(main.locks.goal,'user');
  assert.deepEqual(main.window,{from:1080,to:1140,envId:'mur'});
  assert.ok(reload.context.phases.filter(p=>p.aimLinks.some(a=>a.key==='goal:g1')).length>=2);
  assert.deepEqual(reload.context.goalIds,['g1']);
  assert.ok(reload.exercises.some(e=>e.phase===main.id));
  assert.equal(ctx.goals.length,0,'aucune fiche objectif du compte créée par la génération');
});
ok('ancienne séance : objectifs textuels et aimKey/prepFor migrent sans perdre le rôle de préparation',()=>{
  const old={goals:['Réussir la voie','Garder les doigts frais'],aims,phases:[{id:'prep',type:'warmup',minutes:10,prepFor:'goal:g1'},{id:'work',type:'climb',minutes:30,aimKey:'goal:g1',aimLabel:'Précision des pieds',aimRank:0}]};
  const c=normalizeContext(old);
  assert.deepEqual(c.goals,old.goals); assert.equal(c.phases[0].aimLinks[0].contribution,'preparation');
  assert.equal(c.phases[1].aimLinks[0].goalId,'g1');
  assert.deepEqual(normalizeContext(JSON.parse(JSON.stringify(c))),c);
});
ok('liens désélectionnés et objectifs personnalisés restent distincts des objectifs du profil',()=>{
  const c=normalizeContext({aims,phases:[{id:'a',type:'main',minutes:20,aimLinks:[],aimKey:'goal:g1'},{id:'b',type:'main',minutes:20,aimLinks:[{key:'txt:bassin'}]}]});
  assert.deepEqual(c.phases[0].aimLinks,[]); assert.equal(c.phases[1].aimLinks[0].goalId,'');
  assert.equal(c.aims.length,2); assert.equal(c.phases.length,2);
});
ok('cible importée inconnue : absence conservée sans inventer zéro, valeurs mesurées conservées à la relecture',()=>{
  const session=(value)=>normalizeSession(JSON.parse(JSON.stringify({source:'import',context:{aims:[{...aims[0],target:{metricId:'max_tractions',value}}],phases:[{id:'work',type:'main',minutes:20,aimLinks:[{key:'goal:g1'}]}]}})));
  for(const value of [null,'','  ',false,true,[],[4],{},'inconnue']) {
    const saved=session(value);
    assert.equal(Object.hasOwn(saved.context.aims[0],'target'),false,`aucune mesure inventée pour ${JSON.stringify(value)}`);
    assert.equal(saved.context.phases[0].aimLinks[0].goalId,'g1');
    assert.deepEqual(normalizeSession(JSON.parse(JSON.stringify(saved))).context,saved.context);
  }
  for(const [value,expected] of [[0,0],['0',0],[4.5,4.5],[' 4.5 ',4.5],[-2,-2]]) {
    const saved=session(value);
    assert.deepEqual(saved.context.aims[0].target,{metricId:'max_tractions',value:expected});
    assert.deepEqual(normalizeSession(JSON.parse(JSON.stringify(saved))).context,saved.context);
  }
});
ok('ancien objectif unique sur une phase marquée : association migrée sans modifier les verrous',()=>{
  const c=normalizeContext({aims:[aims[0]],phases:[{id:'a',type:'climb',minutes:30,objective:true,locks:{minutes:'user',goal:'user'}}]});
  assert.equal(c.phases[0].aimLinks[0].key,'goal:g1');assert.equal(c.phases[0].locks.goal,'user');
  assert.equal(c.phases[0].aimLinks[0].goalId,'g1');
  const cleared=normalizeContext({aims:[aims[0]],phases:[{id:'a',type:'climb',minutes:30,objective:true,aimLinks:[]}]});
  assert.deepEqual(cleared.phases[0].aimLinks,[]);
});
ok('plus de vingt blocs incompatibles : aucune phase ni durée coupée lors de la normalisation et de la relecture',()=>{
  const goals=Array.from({length:25},(_,i)=>({...familyAim('endurance','running'),key:'course-'+i,target:{metricId:'course_10k',value:40+i}}));
  const r=planFromAims({aims:goals,sports:['running'],minutes:300});
  assert.ok(r.phases.length>20);
  const phases=normalizePhases(r.phases,'running'), saved=normalizeContext({aims:goals,phases});
  assert.equal(phases.length,r.phases.length);assert.equal(saved.phases.length,phases.length);
  assert.equal(saved.phases.reduce((s,p)=>s+p.minutes,0),300);
});
console.log(`${n} tests persistance objectifs–phases OK`);
