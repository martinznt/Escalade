// tests/bodycomp.test.mjs — mesures précises : composition, mensurations, indices calculés seulement avec des mesures réelles.
import assert from 'node:assert/strict';
import * as B from '../public/bodycomp.js';
import { METRICS } from '../public/model.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const p = (metricId, value, date = 1) => ({ metricId, value, date });
console.log('Mesures précises du corps');
ok('chaque mesure de composition et de mensuration existe et dit comment la prendre', () => {
  for (const id of [...B.COMPOSITION, ...B.MEASURES]) { assert.ok(METRICS[id], id); if (id !== 'body_weight') assert.ok(METRICS[id].test, `${id} : protocole`); }
});
ok('indices : IMC, masse maigre, FFMI, rapports — rien sans mesure', () => {
  assert.deepEqual(B.indices({ perfs: [] }), []);
  const ctx = { perfs: [p('body_weight', 80), p('taille_corps', 180), p('masse_grasse', 15), p('tour_taille', 84), p('tour_hanches', 98), p('tour_epaules', 120), p('envergure', 186)] };
  const ix = Object.fromEntries(B.indices(ctx).map((x) => [x.id, x]));
  assert.equal(ix.imc.value, 24.7); assert.match(ix.imc.help, /ne distingue pas le muscle/);
  assert.equal(ix.maigre.value, 68); assert.equal(ix.gras.value, 12); assert.equal(ix.ffmi.value, 21);
  assert.equal(ix.whtr.value, 0.47); assert.equal(ix.whr.value, 0.86); assert.equal(ix.vshape.value, 1.43); assert.equal(ix.ape.value, 6);
});
ok('profil utilisé si aucune mesure : poids et taille du profil', () => {
  const ix = B.indices({ perfs: [], config: { body: { weight: 70, height: 175 } } }); assert.equal(ix[0].id, 'imc');
});
ok('évolution et pesée incohérente refusée', () => {
  const e = B.evolution({ perfs: [p('masse_musculaire', 30, 1), p('masse_musculaire', 31.5, 9)] }, 'masse_musculaire'); assert.equal(e.delta, 1.5); assert.equal(e.n, 2);
  assert.ok(B.checkWeighIn({ body_weight: 70, masse_musculaire: 80 }).length);
  assert.ok(B.checkWeighIn({ body_weight: 70, masse_musculaire: 50, masse_maigre: 45 }).length, 'muscle > maigre impossible');
  assert.deepEqual(B.checkWeighIn({ body_weight: '72,5', masse_grasse: '18', masse_musculaire: '32', eau_corporelle: '55' }), []);
});
console.log(`\n${n} tests de mesures OK`);
