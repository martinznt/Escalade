// tests/model.test.mjs — intégrité du modèle sémantique (métrique → capacité → exercice → objectif, muscles) et des items.
import assert from 'node:assert/strict';
import { CAPACITIES, MUSCLES, METRICS, ACTIVITIES, SKILLS, EQUIPMENT, INTENTIONS, BUILTIN_STYLES, metricsForCap, musclesForCap, skillsForCap, skillCaps } from '../public/model.js';
import { LIBRARY, byId } from '../public/library.js';
import { SCHEMAS, COLLECTIONS, cleanItem } from '../public/items.js';
import { ok, done } from './helpers.mjs';

console.log('Modèle sémantique');
await ok('activités natives exactes : bloc, voie, musculation, renforcement, calisthenics, course, natation (pas de basket ni vélo)', () => {
  assert.deepEqual(Object.keys(ACTIVITIES).sort(), ['calisthenics', 'climbing_boulder', 'climbing_route', 'conditioning', 'running', 'strength', 'swimming']);
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
  exedit: { name: 'Pompes', emoji: '💪', sets: 4, repsMin: 8, repsMax: 10, secMin: 0, secMax: 0, rest: 90, cues: ['Dos droit'], bad: ['Creuser'], why: 'pourquoi', what: 'c’est quoi', hidden: false },
  catedit: { name: 'Ma version', emoji: '🗂', why: 'w', minutes: 40, tips: ['t'], exjson: '[]', hidden: false },
  activity: { label: 'Tennis', emoji: '🎾', preset: '', aliases: ['tennis'], archived: false },
  category: { activityId: 'custom-1', label: 'Service', description: 'd', caps: [{ id: 'explosivite', w: 0.5 }], archived: false, emoji: '🎾', guide: 'g', howTo: ['a'], source: 'ia' , kind: 'intent', side: ''},
  metric: { label: 'Service', unit: 'km/h', kind: 'pace', dir: 1, activityId: 'custom-1', caps: [{ id: 'cat-1', w: 1 }], gradeActivity: '', archived: false },
  perf: { metricId: 'max_bloc', unknown: false, unit: '', date: 1, source: 'measured', grade: { systemId: 'font', systemName: 'Font', levelId: 'l5', label: '6A', order: 5, total: 24, color: '#aabbcc' }, styles: ['st-dalle', 'st-u-x'], context: { env: 'e1', place: 'Salle', kind: 'salle' }, note: 'n', side: 'gauche' },
  goal: { type: 'grade', label: 'G', skillId: '', metricId: 'max_bloc', target: 3, current: 1, unit: '', gradeTarget: { systemId: 'font', systemName: 'F', levelId: 'l9', label: '6C', order: 9, total: 24, color: '' }, activityId: '', caps: [], status: 'done', deadline: '2026-12-31', startedAt: 1, doneAt: 2, note: '', criteria: ['a'], exercises: ['pullup'], source: 'ia' },
  project: { kind: 'bloc', name: 'Le toit', grade: { systemId: 'font', systemName: 'Font', levelId: 'l9', label: '6c', order: 9, total: 20, color: '' }, gradeText: '', place: 'Salle', status: 'active', tries: [{ date: 5, n: 3 }], holds: [{ x: 0.5, y: 0.25, t: 'depart' }, { x: 0.4, y: 0.1, t: 'chute' }], hasPhoto: true, startedAt: 5, doneAt: 0, note: '', high: 70, sections: [{ name: 'Départ', done: true }], fallWhy: ['doigts'], board: false, problems: [{ name: 'Bloc 1', idx: ['0', '1'], level: 'moyen' }] },
  program: { name: 'Force 6 sem.', goal: 'force', goalId: '', activityId: 'strength', weeks: 6, perWeek: 3, days: ['0', '2', '4'], minutes: 45, start: '2026-09-28', status: 'active', sessions: [{ i: 0, week: 1, date: '2026-09-28', phase: 'build', light: false, boost: 0, minutes: 45 }, { i: 1, week: 2, date: '2026-10-05', phase: 'taper', light: false, boost: 0, minutes: 25 }], eventDate: '2026-10-10', eventLabel: 'Bleau', catalogId: 'cal-push-pull' },
  photo: { data: 'data:image/jpeg;base64,AAAA', w: 480, h: 640 },
  ascent: { kind: 'voie', name: 'La voie', grade: { systemId: 'french', systemName: 'Fr', levelId: 'l10', label: '6a+', order: 10, total: 32, color: '' }, gradeText: '', result: 'work', attempts: 3, styles: ['st-devers'], styleText: '', date: 5, context: { env: '', place: '', kind: 'falaise' }, note: '', nuance: 'dur' },
  gradesys: { name: 'U', activity: 'bloc', kind: 'colors', levels: [{ id: 'lv1', label: 'Jaune', color: '#ffee00', order: 0 }], maps: [{ levelId: 'lv1', ref: 'font', refLevel: '4' }], archived: true },
  style: { label: 'Arête', activity: 'climbing', archived: true },
  env: { name: 'Maison', type: 'maison', equipment: ['bar'], isDefault: true, archived: false , sectors: ['Secteur A'], city: 'Montreuil', gradeSys: 'gs-1', areas: [{ id: 'entrainement', items: ['hangboard', 'campus'], note: 'au fond' }], hours: [{ d: 0, from: '10:00', to: '22:00' }], lat: 48.4, lon: 2.63},
  pref: { key: 'tractions', label: 'Tractions', value: 'evite', source: 'habit', reason: 'r' },
  capdecl: { capId: 'force_doigts', level: -1, note: '' },
  lab: { title: 'L', hypothesis: 'h', goalId: 'g', capId: 'c', metricId: 'm', startDate: '2026-01-01', weeks: 4, before: { value: 1, note: '', date: 0 }, after: { value: 2, note: '', date: 0 }, status: 'done', conclusion: 'c', criteria: 'ressenti' },
  jnote: { date: 1, text: 'note' },
  decision: { kind: 'strategy', text: 'Stratégie mixte', reason: 'préserver la voie', ref: 'mixed', sport: 'climbing_route', goal: 'Résistance', date: 5, result: '' },
  sdna: { name: 'Préparation voie', sport: 'climbing_route', json: '{"parts":[]}', summary: '20 % préparation' },
  smodule: { name: 'Bloc technique dalle', sport: 'climbing_boulder', json: '{"phases":[]}', minutes: 25 },
  media: { kind: 'video', ref: 'h1', refType: 'history', url: 'https://example.org/v', note: 'Mon essai', activity: 'climbing_boulder', goalId: 'g1', styles: ['st-dalle'], date: 7, hasPhoto: false },
  swap: { from: 'Pompes', to: 'Dips', date: 1, where: 'player' },
  habit: { key: 'swap:pompes', decision: 'accepted' },
  exsetup: { key: 'presse a cuisses', label: 'Presse à cuisses', setup: 'Siège 4, dossier 2' },
  season: { theme: 'mobilite', start: 1780000000000, closed: true, won: true },
  letter: { text: 'Salut moi', writtenAt: 1780000000000, openAt: 1787000000000, openedAt: 0, snap: '12 séances' },
  pain: { zone: 'shoulders', level: 5, side: 'droite', when: 'effort', date: 3, note: 'en tirant', healed: false },
  wellness: { day: '2026-10-02', at: 9, sleep: 7, energy: 4, soreness: 2, stress: 3, hr: 58, period: false, note: 'bien dormi' },
  config: { blocks: ['today', 'records'], envId: 'e1', durations: ['20'], unavailable: ['bar'], perWeek: 3, climbPerWeek: 2, goal: 'force', intent: 'force', setupDone: true, asked: ['bloc'], mode: 'dark', palette: 'granit', accent: 'x', shape: 'squircle', radius: 'soft', size: 'm', density: 'normal', motion: 'on', setupLater: 5, setupHidden: false, tourDone: true , vibe: 'muscu', lay: '{"home":[]}', formats: '[]', seenIds: ['v8.9.0'], goals: ['poids', 'climb'], age: 34, height: 178, weight: 72.5, sex: 'x', shape: 'athletique', muscled: ['dos', 'avantbras'], physique: ['v'], fitness: 4, breath: 'effort', daily: 'assis', cycle: false, slots: [{ d: 1, from: '18:30', to: '20:00' }], pauseMode: 'vacances', pauseFrom: '2026-08-01', pauseTo: '2026-08-15', pauseNote: 'Crète', favs: ['bl-1', 'run-2'] },
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
