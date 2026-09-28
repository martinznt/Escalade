// tests/places.test.mjs — lieux (salles, falaises et secteurs) et ce qui y a été fait.
import assert from 'node:assert/strict';
import { placeStats, allPlaces, placesOf, kindOfEnv } from '../public/places.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const envs = [{ id: 'g', name: 'Unibloc', type: 'escalade' }, { id: 'f', name: 'Fontainebleau', type: 'falaise', sectors: ['Bas Cuvier', 'Apremont'] }, { id: 'm', name: 'Maison', type: 'maison' }, { id: 'x', name: 'Vieille', type: 'escalade', archived: true }];
const gr = (label, order) => ({ systemId: 's', label, order, levelId: 'l' + order, total: 8 });
const ctx = {
  history: [{ startedAt: 10, durationSeconds: 3600, sessionName: 'Bloc', data: { context: { env: 'g' } } }, { startedAt: 20, durationSeconds: 1800, sessionName: 'Renfo', data: { context: { env: 'm' } } }],
  ascents: [{ kind: 'bloc', result: 'send', grade: gr('6A', 5), date: 30, context: { env: 'f', place: 'Bas Cuvier', kind: 'falaise' } }, { kind: 'bloc', result: 'attempt', grade: gr('6C', 7), date: 31, context: { env: 'f', place: 'Bas Cuvier' } },
    { kind: 'bloc', result: 'flash', grade: gr('5+', 4), date: 32, context: { env: 'f', place: 'Apremont' } }, { kind: 'bloc', result: 'send', grade: gr('U6', 5), date: 5, context: { env: 'g', place: 'Unibloc' } }],
  perfs: [{ metricId: 'max_bloc', context: { env: 'g' } }],
};
ok('genre de lieu : salle, falaise, maison ; les archivés ne sont pas proposés', () => {
  assert.equal(kindOfEnv(envs[0]), 'salle'); assert.equal(kindOfEnv(envs[1]), 'falaise'); assert.equal(kindOfEnv({ type: 'exterieur' }), 'falaise');
  assert.deepEqual(placesOf(envs, 'salle').map((e) => e.id), ['g']);
});
ok('ce qui a été fait dans une falaise : par secteur, réussis, meilleur niveau réussi (pas les essais)', () => {
  const st = placeStats('f', ctx, 'Fontainebleau');
  assert.deepEqual(st.sectors.map((x) => [x.name, x.list.length, x.sent]), [['Apremont', 1, 1], ['Bas Cuvier', 2, 1]].sort((a, b) => st.sectors.findIndex((x) => x.name === a[0]) - st.sectors.findIndex((x) => x.name === b[0])));
  assert.equal(st.bestBloc, '6A'); assert.equal(st.sent, 2); assert.equal(st.last, 32);
});
ok('salle : séances, minutes, mesures ; l’ancien format (secteur = nom du lieu) n’est pas pris pour un secteur', () => {
  const st = placeStats('g', ctx, 'Unibloc'); assert.equal(st.sessions.length, 1); assert.equal(st.minutes, 60); assert.equal(st.perfs.length, 1);
  assert.deepEqual(st.sectors.map((x) => x.name), ['']);
});
ok('tous les lieux regroupés (salles, falaises, maison), sans les archivés', () => {
  const g = allPlaces(envs, ctx); assert.deepEqual(g.map((x) => x.kind), ['salle', 'falaise', 'maison']); assert.equal(g[0].places.length, 1);
});
console.log(`\n${n} tests des lieux OK`);
