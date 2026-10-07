import assert from 'node:assert/strict';
import { cleanItem } from '../public/items.js';
for (const c of ['category','goal']) {
  for (const source of ['','ia','local']) assert.equal(cleanItem({c,id:'source-check',u:1,d:{source}}).d.source,source);
  assert.equal(cleanItem({c,id:'source-check',u:1,d:{source:'unknown'}}).d.source,'');
}
console.log('  ✓ objectifs et catégories : provenance locale conservée, ancienne IA compatible, provenance inconnue écartée');
