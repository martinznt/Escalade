// tests/model.test.mjs — intégrité du modèle sémantique (métrique → capacité → exercice → objectif, muscles) et des items.
import assert from 'node:assert/strict';
import { CAPACITIES, MUSCLES, METRICS, ACTIVITIES, SKILLS, EQUIPMENT, INTENTIONS, BUILTIN_STYLES, metricsForCap, musclesForCap, skillsForCap, skillCaps } from '../public/model.js';
import { LIBRARY, byId } from '../public/library.js';
import { SCHEMAS, COLLECTIONS, cleanItem } from '../public/items.js';
import { ok, done } from './helpers.mjs';

console.log('Modèle sémantique');
await ok('activités natives V1 exactes : bloc, voie, musculation, renforcement, course, natation (pas de basket ni vélo)', () => {
  assert.deepEqual(Object.keys(ACTIVITIES).sort(), ['climbing_boulder', 'climbing_route', 'conditioning', 'running', 'strength', 'swimming']);
  assert.ok(!Object.values(ACTIVITIES).some((a) => /basket|cycl|vélo/i.test(a.label)));
});
await ok('toutes les relations pointent vers des capacités existantes', () => {
  for (const [id, m] of Object.entries(METRICS)) for (const c of Object.keys(m.caps)) assert.ok(CAPACITIES[c], `métrique ${id} → ${c}`);
  for (const [id, m] of Object.entries(MUSCLES)) for (const c of Object.keys(m.caps)) assert.ok(CAPACITIES[c], `muscle ${id} → ${c}`);
  for (const [id, a] of Object.entries(ACTIVITIES)) { for (const c of Object.keys(a.caps)) assert.ok(CAPACITIES[c], `activité ${id} → ${c}`); for (const [, , caps] of a.categories) for (const c of caps) assert.ok(CAPACITIES[c]); }
  for (const [id, s] of Object.entries(SKILLS)) for (const c of Object.keys(s.caps)) assert.ok(CAPACITIES[c], `figure ${id} → ${c}`);
  for (const I of Object.values(INTENTIONS)) assert.ok(Array.isArray(I.families));
});
await ok('chaque exercice : capacités, muscles principaux/secondaires français, activités, matériel connu', () => {
  for (const x of LIBRARY) {
    for (const c of Object.keys(x.caps)) assert.ok(CAPACITIES[c], x.id + ' cap ' + c);
    for (const m of [...x.prim, ...x.sec]) assert.ok(MUSCLES[m], x.id + ' muscle ' + m);
    assert.ok(x.acts.length, x.id + ' sans activité'); for (const a of x.acts) assert.ok(ACTIVITIES[a]);
    for (const n of x.needs) assert.ok(EQUIPMENT[n], x.id + ' matériel ' + n);
    if (x.role === 'main') { assert.ok(Object.keys(x.caps).length, x.id + ' sans capacité'); assert.ok(x.prim.length, x.id + ' sans muscle principal'); }
    assert.ok(x.diff >= 1 && x.diff <= 5);
  }
  assert.ok(LIBRARY.length >= 140);
});
await ok('chaque activité native a des exercices utilisables', () => { for (const a of Object.keys(ACTIVITIES)) assert.ok(LIBRARY.filter((x) => x.role === 'main' && x.acts.includes(a)).length >= 6, a); });
await ok('figures complexes : front lever, drapeau, traction à un bras (+ autres) décomposées', () => {
  for (const id of ['front_lever', 'human_flag', 'one_arm_pullup', 'muscle_up', 'handstand', 'pistol_squat']) {
    const s = SKILLS[id]; assert.ok(s, id); assert.ok(skillCaps(id).length >= 3 || id === 'pistol_squat');
    for (const st of s.steps) { assert.ok(byId(st.exercise), `${id} étape ${st.exercise}`); assert.ok(METRICS[st.criterion.metric], `${id} critère ${st.criterion.metric}`); }
    for (const p of s.paths) for (const e of p.exercises) assert.ok(byId(e), `${id} chemin ${e}`);
    for (const c of s.criteria) assert.ok(METRICS[c.metric] && c.why);
    assert.ok(s.paths.length >= (id === 'handstand' ? 1 : 2), id + ' : plusieurs chemins');
  }
});
await ok('graphe navigable dans les deux sens', () => {
  assert.ok(metricsForCap('tirage_vertical').some((m) => m.id === 'max_tractions'));
  assert.ok(musclesForCap('tirage_vertical').some((m) => m.id === 'grand_dorsal'));
  assert.ok(skillsForCap('controle_scapulaire').some((s) => s.id === 'front_lever'));
});
await ok('muscles nommés en français et placés sur une vue (face / dos)', () => { for (const m of Object.values(MUSCLES)) { assert.ok(['front', 'back'].includes(m.view)); assert.match(m.label, /^[A-ZÉ]/); } });
await ok('repères de métriques cohérents avec le sens (plus haut / plus bas)', () => { for (const [id, m] of Object.entries(METRICS)) if (m.tiers) assert.ok(m.dir === -1 ? m.tiers[0] > m.tiers[1] : m.tiers[0] < m.tiers[1], id); });
await ok('styles d’escalade structurés (identifiants, activité)', () => { assert.ok(BUILTIN_STYLES.length >= 12); for (const s of BUILTIN_STYLES) assert.match(s.id, /^st-/); });

console.log('Schéma des données (items)');
const SAMPLES = {
  activity: { label: 'Tennis', emoji: '🎾', preset: '', aliases: ['tennis'], archived: false },
  category: { activityId: 'custom-1', label: 'Service', description: 'd', caps: [{ id: 'explosivite', w: 0.5 }], archived: false },
  metric: { label: 'Service', unit: 'km/h', kind: 'pace', dir: 1, activityId: 'custom-1', caps: [{ id: 'cat-1', w: 1 }], gradeActivity: '', archived: false },
  perf: { metricId: 'max_bloc', unknown: false, unit: '', date: 1, source: 'measured', grade: { systemId: 'font', systemName: 'Font', levelId: 'l5', label: '6A', order: 5, total: 24, color: '#aabbcc' }, styles: ['st-dalle', 'st-u-x'], context: { env: 'e1', place: 'Salle', kind: 'salle' }, note: 'n', side: 'gauche' },
  goal: { type: 'grade', label: 'G', skillId: '', metricId: 'max_bloc', target: 3, current: 1, unit: '', gradeTarget: { systemId: 'font', systemName: 'F', levelId: 'l9', label: '6C', order: 9, total: 24, color: '' }, activityId: '', caps: [], status: 'done', deadline: '2026-12-31', startedAt: 1, doneAt: 2, note: '' },
  ascent: { kind: 'voie', name: 'La voie', grade: { systemId: 'french', systemName: 'Fr', levelId: 'l10', label: '6a+', order: 10, total: 32, color: '' }, gradeText: '', result: 'work', attempts: 3, styles: ['st-devers'], styleText: '', date: 5, context: { env: '', place: '', kind: 'falaise' }, note: '' },
  gradesys: { name: 'U', activity: 'bloc', kind: 'colors', levels: [{ id: 'lv1', label: 'Jaune', color: '#ffee00', order: 0 }], maps: [{ levelId: 'lv1', ref: 'font', refLevel: '4' }], archived: true },
  style: { label: 'Arête', activity: 'climbing', archived: true },
  env: { name: 'Maison', type: 'maison', equipment: ['bar'], isDefault: true, archived: false },
  pref: { key: 'tractions', label: 'Tractions', value: 'evite', source: 'habit', reason: 'r' },
  capdecl: { capId: 'force_doigts', level: -1, note: '' },
  lab: { title: 'L', hypothesis: 'h', goalId: 'g', capId: 'c', metricId: 'm', startDate: '2026-01-01', weeks: 4, before: { value: 1, note: '', date: 0 }, after: { value: 2, note: '', date: 0 }, status: 'done', conclusion: 'c' },
  jnote: { date: 1, text: 'note' },
  swap: { from: 'Pompes', to: 'Dips', date: 1, where: 'player' },
  habit: { key: 'swap:pompes', decision: 'accepted' },
  config: { blocks: ['today', 'records'], envId: 'e1', durations: ['20'], unavailable: ['bar'] },
};
await ok('chaque collection a un échantillon testé', () => assert.deepEqual(Object.keys(SAMPLES).sort(), [...COLLECTIONS].sort()));
await ok('aller-retour exact de chaque collection (aucune clé utile supprimée par la liste blanche)', () => {
  for (const [c, d] of Object.entries(SAMPLES)) { const x = cleanItem({ c, id: 'id1', u: 5, d }); assert.deepEqual(x.d, d, c); }
});
await ok('valeurs invalides corrigées, clés inconnues retirées', () => {
  const x = cleanItem({ c: 'pref', id: 'p', u: 1, d: { key: 'k', value: 'adore', hack: 1 } }); assert.equal(x.d.value, 'neutre'); assert.equal(x.d.hack, undefined);
  assert.equal(cleanItem({ c: 'goal', id: 'a b', u: 1, d: {} }), null); assert.equal(cleanItem({ c: 'inconnue', id: 'a', u: 1 }), null); assert.equal(cleanItem({ c: 'goal', id: 'a', u: 0 }), null);
  assert.equal(cleanItem({ c: 'perf', id: 'p', u: 1, d: { grade: 'texte' } }).d.grade, undefined);
});
done('tests du modèle');
