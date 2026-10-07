// Lecture descriptive de l'organisation technique : facteurs déclarés, inconnus explicites, aucun score mental.
import assert from 'node:assert/strict';
import { budget, organizationFactors, resolvePlaces, transitions } from '../public/budget.js';
import { normalizePhases } from '../public/phase.js';
let n=0;const ok=(name,fn)=>{fn();n++;console.log('  ✓',name);};
const envs=[{id:'mur',name:'Mur',equipment:['wall','mat']},{id:'piscine',name:'Piscine',equipment:['pool']}];
const aims=[{key:'pieds',label:'Précision des pieds',caps:{technique_pieds:1}},{key:'placement',label:'Placement',caps:{technique_escalade:1}}];
ok('bloc partagé : deux objectifs et leur préparation ne deviennent pas deux blocs techniques',()=>{
  const ph=normalizePhases([{type:'warmup',activity:'climbing_boulder',minutes:10,aimLinks:[{key:'pieds',contribution:'preparation'}]},{type:'climb',activity:'climbing_boulder',minutes:30,role:'technique',aimLinks:[{key:'pieds'},{key:'placement'}]},{type:'cool',activity:'climbing_boulder',minutes:5}]);
  const b=budget(ph,45,[],{places:resolvePlaces(ph,envs,'mur'),aims});
  assert.equal(b.needed,45);assert.equal(b.over,0);assert.equal(b.organization.technicalPhases,1);
  assert.deepEqual(b.organization.objectives,['pieds','placement']);assert.equal(b.organization.activityChanges,0);
  assert.equal(b.organization.placeChanges,0);assert.deepEqual(b.organization.requiredEquipment,['wall']);
  assert.deepEqual(b.organization.availableEquipment,['mat','wall']);
  assert.match(b.organization.summary,/1 bloc technique.*2 objectifs associés/);
  assert.match(b.organization.unknown.join(' '),/effort de concentration/);
});
ok('changements réels : pauses exclues, activités et lieux distincts, matériel requis propre à chaque sport',()=>{
  const ph=normalizePhases([{type:'climb',activity:'climbing_boulder',role:'technique',minutes:30},{type:'pause',activity:'pause',minutes:10},{type:'main',activity:'swimming',role:'endurance',minutes:20,place:{mode:'other',envId:'piscine',travelMin:15}}]);
  const tr=transitions(ph,envs,'mur'),b=budget(ph,75,tr,{places:resolvePlaces(ph,envs,'mur')});
  assert.equal(b.needed,75);assert.equal(b.organization.activityChanges,1);assert.equal(b.organization.placeChanges,1);
  assert.deepEqual(b.organization.requiredEquipment,['pool','wall']);
  assert.match(b.organization.summary,/1 changement d’activité.*1 changement de lieu/);
  assert.ok(b.organization.facts.some(t=>/bassin/i.test(t)));
});
ok('inconnus : aucune aisance technique ou charge cognitive inventée, matériel absent non déduit',()=>{
  const o=organizationFactors([{type:'main',minutes:20,role:'main'}]);
  assert.deepEqual(o.availableEquipment,[]);assert.deepEqual(o.objectives,[]);assert.equal(o.technicalPhases,0);
  assert.ok(o.unknown.some(t=>/activités/.test(t)));assert.ok(o.unknown.some(t=>/matériel manque/.test(t)));
  assert.ok(o.unknown.some(t=>/aisance technique/.test(t)));
  assert.equal(o.score,undefined);assert.equal(o.cognitiveFatigue,undefined);
});
console.log(`${n} tests budget et organisation OK`);
