import assert from 'node:assert/strict';
import { normalizeAimLinks, aimLinksFor, linkedAimCaps } from '../public/objectivelinks.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const aims = [
  { key: 'fam:technique@climbing_boulder', label: 'Précision des pieds', source: 'catalog', caps: { technique_pieds: 1 } },
  { key: 'goal:g1', label: 'Tenir plus longtemps', source: 'goal', goalId: 'g1', caps: { endurance_doigts: 1 } },
];

ok('une phase sert plusieurs objectifs indépendants, enrichis par le catalogue', () => {
  const phase = { aimLinks: aims.map((a) => ({ key: a.key })) };
  const links = normalizeAimLinks(phase, aims);
  assert.deepEqual(links.map((a) => [a.key, a.rank, a.source, a.goalId]), [[aims[0].key, 0, 'catalog', ''], ['goal:g1', 1, 'goal', 'g1']]);
  assert.deepEqual(linkedAimCaps(phase, aims), { technique_pieds: 4, endurance_doigts: 3 });
  assert.deepEqual(aimLinksFor(phase, aims), links);
  assert.deepEqual(phase.aimLinks, aims.map((a) => ({ key: a.key })), 'aucune mutation de la phase');
});

ok('un objectif traverse préparation et travail, avec une contribution adaptée', () => {
  const prep = { aimLinks: [{ key: aims[0].key, contribution: 'preparation' }] };
  const primary = { aimLinks: [{ key: aims[0].key, contribution: 'primary' }] };
  const support = { aimLinks: [{ key: aims[0].key, contribution: 'support' }] };
  assert.equal(normalizeAimLinks(prep, aims)[0].key, normalizeAimLinks(primary, aims)[0].key);
  assert.equal(linkedAimCaps(prep, aims).technique_pieds, 1.4);
  assert.equal(linkedAimCaps(primary, aims).technique_pieds, 4);
  assert.equal(linkedAimCaps(support, aims).technique_pieds, 2);
});

ok('les anciens aimKey et prepFor migrent sans doubler un objectif', () => {
  const p = { aimKey: aims[0].key, aimLabel: 'Mon libellé', aimRank: 2, prepFor: aims[0].key };
  const links = normalizeAimLinks(p, aims);
  assert.equal(links.length, 1);
  assert.equal(links[0].contribution, 'primary');
  assert.equal(links[0].label, 'Mon libellé');
  assert.equal(links[0].rank, 2, 'un lien préparatoire ne change pas le rang du travail principal');
  const distinct = normalizeAimLinks({ aimKey: aims[0].key, prepFor: aims[1].key }, aims);
  assert.deepEqual(distinct.map((a) => a.contribution), ['primary', 'preparation']);
  assert.equal(distinct[1].goalId, 'g1');
});

ok('des liens explicitement vides effacent la relation ancienne', () => {
  const p = { aimLinks: [], aimKey: aims[0].key, aimLabel: 'Ancien objectif', prepFor: aims[1].key };
  assert.deepEqual(normalizeAimLinks(p, aims), []);
  assert.deepEqual(linkedAimCaps(p, aims), {});
});

ok('les références et capacités invalides sont nettoyées, les clés @ et # sont conservées', () => {
  const p = { aimLinks: [null, { key: 'bad/key', caps: { force_doigts: 1 } }, {
    key: 'eq@running#2', label: '<b> Objectif\n </b>', rank: Infinity, contribution: 'unknown', goalId: 'unsafe/id',
    caps: { force_doigts: '2', technique_pieds: 99, endurance_doigts: -1, endurance_aerobie: Infinity, vitesse: true, seuil: null, inconnu: 1 },
  }] };
  const links = normalizeAimLinks(p);
  assert.equal(links.length, 1);
  assert.equal(links[0].key, 'eq@running#2');
  assert.doesNotMatch(links[0].label, /[<>\n]/);
  assert.equal(links[0].rank, 0);
  assert.equal(links[0].goalId, '');
  assert.equal(links[0].contribution, 'primary');
  assert.deepEqual(links[0].caps, { force_doigts: 2, technique_pieds: 4 });
});

ok('le rang privilégie le principal ; les ex æquo gardent la même importance', () => {
  const catalog = [
    { key: 'a', caps: { force_doigts: 1 } },
    { key: 'b', tie: true, caps: { technique_pieds: 1 } },
    { key: 'c', caps: { endurance_doigts: 1 } },
  ];
  const p = { aimLinks: catalog.map((a) => ({ key: a.key })) };
  assert.deepEqual(normalizeAimLinks(p, catalog).map((a) => a.rank), [0, 0, 1]);
  assert.deepEqual(linkedAimCaps(p, catalog), { force_doigts: 4, technique_pieds: 4, endurance_doigts: 3 });
  assert.deepEqual(linkedAimCaps(p, catalog.map((a) => ({ ...a, equal: true }))), { force_doigts: 1, technique_pieds: 1, endurance_doigts: 1 });
  assert.equal(linkedAimCaps({ aimLinks: [{ key: 'a', rank: 3, caps: { force_doigts: 1 } }] }).force_doigts, 1.5);
});

ok('les liens enregistrés restent autonomes et ne doublent pas les capacités', () => {
  const p = { aimLinks: [
    { key: 'a', rank: 0, contribution: 'primary', source: 'words', caps: { force_doigts: 0.8 } },
    { key: 'b', rank: 1, contribution: 'primary', caps: { force_doigts: 1 } },
    { key: 'a', rank: 0, contribution: 'support', caps: { force_doigts: 0.8 } },
  ] };
  const serialized = JSON.parse(JSON.stringify({ aimLinks: normalizeAimLinks(p) }));
  assert.equal(serialized.aimLinks.length, 2);
  assert.equal(serialized.aimLinks[0].source, 'words');
  assert.equal(linkedAimCaps(serialized).force_doigts, 3.2);
  assert.deepEqual(normalizeAimLinks(serialized), serialized.aimLinks);
});

console.log(`${n} tests des relations objectifs–phases OK`);
