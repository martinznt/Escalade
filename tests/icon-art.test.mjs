// Brouillons limités et déterministes : les entrées inconnues n'atteignent jamais le dessin.
import assert from 'node:assert/strict';
import { ICON_PRESETS,normalizeIconDesign,readIconDesign,presetIconDesign } from '../public/icon-art.js';
import { cleanItem } from '../public/items.js';
import { ok,done } from './helpers.mjs';

await ok('dessin : valeurs corrompues ou couleurs non hexadécimales reviennent au modèle sobre',()=>{
  const defaults=normalizeIconDesign();
  assert.deepEqual(defaults,{base:'calendar',style:'minimal',palette:'slate',background:'#223341',foreground:'#F4F5F7',sports:[]});
  for(const input of [null,[],false,'mountain'])assert.deepEqual(normalizeIconDesign(input),defaults);
  assert.deepEqual(readIconDesign('{broken'),defaults);
  assert.deepEqual(normalizeIconDesign({base:'__proto__',style:'random',palette:'unknown',background:'url(secret)',foreground:'transparent'}),defaults);
  assert.equal(normalizeIconDesign({background:'#a3b4c5'}).background,'#A3B4C5');
});
await ok('sports : doublons et valeurs inconnues retirés, quatre disciplines au maximum',()=>{
  const draft={base:'shield',sports:['running','invalid','running','climbing','cycling','swimming','yoga']};
  const normalized=normalizeIconDesign(draft);
  assert.deepEqual(normalized.sports,['running','climbing','cycling','swimming']);
  assert.equal(normalized.base,'shield');
  assert.equal(draft.sports.length,7,'la normalisation ne modifie pas le brouillon source');
});
await ok('modèles : cinq styles distincts et modifications personnelles sans écraser les modèles',()=>{
  assert.equal(new Set(ICON_PRESETS.map(x=>x.style)).size,5);
  const design=presetIconDesign('outdoor');design.sports.push('swimming');design.background='#ABCDEF';
  assert.deepEqual(presetIconDesign('outdoor').sports,['climbing','running']);
  assert.equal(presetIconDesign('outdoor').background,'#183F35');
  assert.deepEqual(presetIconDesign('missing'),presetIconDesign('planning'));
});
await ok('configuration : les deux choix et les deux brouillons restent indépendants et compatibles',()=>{
  const token='a'.repeat(43),app=JSON.stringify(presetIconDesign('landscape')),notification=JSON.stringify(presetIconDesign('club'));
  const item=cleanItem({c:'config',id:'app-icon',u:1,d:{appIcon:'custom',appIconToken:token,appIconDesign:app,appIconDraft:app,notificationIcon:'custom',notificationToken:'b'.repeat(43),notificationDesign:notification,notificationDraft:notification}});
  assert.equal(item.d.appIconToken,token);assert.equal(item.d.notificationToken,'b'.repeat(43));
  assert.equal(readIconDesign(item.d.appIconDraft).base,'mountain');assert.equal(readIconDesign(item.d.notificationDraft).base,'shield');
  assert.equal(cleanItem({c:'config',id:'legacy',u:1,d:{}}).d.notificationIcon,'app');
});
done('tests dessins et brouillons d’icônes');
