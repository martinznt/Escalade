// tests/sfilter.test.mjs — ranger ses séances : sports multiples, catégories, lieu, tris.
import assert from 'node:assert/strict';
import { filterSessions, autoCategories, categoriesOf, sportsOf, placeOf, intensityOf, activeFilters, SORTS } from '../public/sfilter.js';
import { normalizeSession } from '../public/shared.js';
import { mergeSessions } from '../public/merge.js';
import { byId } from '../public/library.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const ex = (libId, sets = 3) => ({ libId, name: byId(libId).name, block: 'main', sets, repsMin: 8, repsMax: 8, rest: 90, intensity: byId(libId).intensity, caps: byId(libId).caps });
const S = (id, name, o) => normalizeSession({ id, name, updatedAt: o.u || 0, ...o });
const bloc = S('a', 'Bloc salle', { activity: 'climbing_boulder', exercises: [ex('limit-boulders'), ex('hang-max')], context: { env: 'salle', envName: 'Salle' }, u: 3 });
const renfo = S('b', 'Renfo maison', { activity: 'conditioning', sports: ['climbing_boulder'], exercises: [ex('pushup'), ex('dead-bug'), ex('side-plank')], context: { env: 'maison' }, u: 2 });
const mob = S('c', 'Mobilité', { activity: 'conditioning', exercises: [ex('cossack', 2)], tags: ['mobilite', 'Vacances'], u: 1 });
const all = [bloc, renfo, mob, S('z', 'Vieille', { activity: 'running', archived: true, exercises: [ex('pushup')] })];

console.log('Rangement');
ok('séance : plusieurs sports, lieu, catégories reconnues ou choisies', () => {
  assert.deepEqual(sportsOf(renfo), ['conditioning', 'climbing_boulder']);
  assert.equal(placeOf(bloc), 'salle'); assert.equal(placeOf(mob), 'none');
  assert.ok(autoCategories(bloc).includes('doigts') || autoCategories(bloc).includes('puissance'), autoCategories(bloc).join());
  assert.ok(autoCategories(renfo).includes('gainage'), autoCategories(renfo).join());
  assert.deepEqual(categoriesOf(mob), ['mobilite', 'Vacances'], 'choisies à la main : prioritaires');
  assert.deepEqual(normalizeSession({ activity: 'x', sports: ['x', 'y', 'mal formé!'] }).sports, ['y']);
});
ok('filtres : lieu, plusieurs sports (l’un ou l’autre), catégories, recherche, archivées à part', () => {
  const ids = (f) => filterSessions(all, f).map((s) => s.id).sort().join();
  assert.equal(ids({}), 'a,b,c');
  assert.equal(ids({ status: 'archived' }), 'z');
  assert.equal(ids({ places: ['salle'] }), 'a'); assert.equal(ids({ places: ['salle', 'none'] }), 'a,c');
  assert.equal(ids({ sports: ['climbing_boulder'] }), 'a,b', 'la séance renfo contient aussi du bloc');
  assert.equal(ids({ sports: ['running'] }), '');
  assert.equal(ids({ cats: ['Vacances'] }), 'c');
  assert.equal(ids({ q: 'pompe' }), 'b'); assert.equal(ids({ q: 'MOBILITE' }), 'c');
  assert.equal(activeFilters({ places: ['a'], sports: ['b', 'c'], q: 'x' }), 4);
});
ok('tris : récentes, nom, durée, intensité, forme du jour, historique', () => {
  const order = (sort, extra = {}, h = []) => filterSessions(all, { sort, ...extra }, h).map((s) => s.id).join();
  assert.equal(order('recent'), 'a,b,c'); assert.equal(order('name'), 'a,c,b');
  assert.ok(intensityOf(bloc) > intensityOf(renfo));
  assert.equal(order('hard').split(',')[0], 'a'); assert.equal(order('soft').split(',').at(-1), 'a');
  assert.equal(order('form', { form: 'low' }), 'c,b,a', 'fatigué : douces d’abord, la plus courte en premier');
  assert.equal(order('form', { form: 'top' }).split(',')[0], 'a');
  assert.equal(order('short').split(',')[0], 'c');
  const h = [{ sessionId: 'a', startedAt: 10 }, { sessionId: 'a', startedAt: 20 }, { sessionId: 'b', startedAt: 30 }];
  assert.equal(order('most', {}, h).split(',')[0], 'a');
  assert.equal(order('forgotten', {}, h), 'c,a,b', 'jamais faite, puis la plus ancienne');
  for (const k of Object.keys(SORTS)) assert.equal(filterSessions(all, { sort: k }).length, 3, k);
});
ok('fusion : garde tous les sports et le lieu commun', () => {
  const m = mergeSessions([bloc, renfo]);
  assert.deepEqual(sportsOf(m).sort(), ['climbing_boulder', 'conditioning']);
  assert.equal(placeOf(m), 'none', 'lieux différents : pas de lieu imposé');
  assert.equal(placeOf(mergeSessions([bloc, { ...bloc, id: 'a2', name: 'Bloc 2' }])), 'salle');
});
console.log(`\n${n} tests de rangement des séances OK`);
