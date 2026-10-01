// tests/aimplan.test.mjs — créer une séance à partir d'objectifs CLASSÉS, sur plusieurs sports et plusieurs lieux :
// ordre (auto, début, milieu, fin), temps selon le rang, séance entière adaptée au n°1 quand il vient tard,
// trajets comptés, objectifs retirés quand le temps manque (et dit), chronologie de la structure finale.
import assert from 'node:assert/strict';
import * as A from '../public/aimplan.js';
import { normalizePhases } from '../public/phase.js';
import { buildFromParts } from '../public/climbplan.js';
import { transitions, budget } from '../public/budget.js';
import { it, act, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const sum = (ph) => ph.reduce((t, p) => t + p.minutes, 0);
const work = (ph) => ph.filter((p) => !['warmup', 'cool'].includes(p.type));

ok('catalogue : 6 familles par sport, chacune expliquée en une phrase, puis les intentions précises du sport', () => {
  const c = A.aimCatalog('climbing_route');
  assert.equal(c.families.length, 6);
  assert.ok(c.families.every((f) => f.help && f.label.endsWith('· Voie')));
  assert.match(c.families.find((f) => f.family === 'performance').help, /voie la plus dure/);
  assert.ok(c.precise.some((x) => x.label === 'Continuité · Voie' && x.family === 'endurance'));
  assert.equal(A.familyOfCaps({ force_doigts: 1 }), 'force'); assert.equal(A.familyOfCaps({ mobilite_hanches: 1 }), 'mobilite'); assert.equal(A.familyOfCaps({}), '');
});
ok('« Auto » : le plus exigeant d’abord, l’endurance après, la mobilité en dernier ; le n°1 a le plus de temps', () => {
  const aims = [A.familyAim('endurance', 'climbing_route'), A.familyAim('mobilite', 'climbing_route'), A.familyAim('performance', 'climbing_route')];
  const r = A.planFromAims({ aims, sports: ['climbing_route'], envId: 'e1', minutes: 120 });
  assert.equal(sum(r.phases), 120);
  const w = work(r.phases).map((p) => p.aimLabel || p.label);
  assert.deepEqual(w.filter((x) => !/Montée/.test(x)), ['Performer · Voie', 'Endurance · Voie', 'Mobilité · Voie']);
  const byKey = Object.fromEntries(work(r.phases).filter((p) => p.aimLabel).map((p) => [p.aimLabel, p.minutes]));
  assert.ok(r.notes[0].startsWith('n°1 « Endurance · Voie »'), 'le n°1 (endurance) est annoncé en premier');
  assert.ok(byKey['Endurance · Voie'] > byKey['Mobilité · Voie'], 'le n°1 a plus de temps que le n°2');
});
ok('n°1 « Performer en voie » mis À LA FIN : toute la séance s’adapte (phases d’avant modérées, doigts ménagés, montée progressive)', () => {
  const perf = { ...A.familyAim('performance', 'climbing_route'), when: 'end' };
  const aims = [perf, A.familyAim('force', 'climbing_boulder'), A.familyAim('technique', 'climbing_boulder')];
  const r = A.planFromAims({ aims, sports: ['climbing_route', 'climbing_boulder'], envId: 'salle', places: { climbing_boulder: 'salle' }, minutes: 150 });
  const w = work(r.phases), last = w.at(-1);
  assert.equal(last.aimLabel, 'Performer · Voie'); assert.equal(last.intensity, 'max'); assert.equal(last.objective, true);
  assert.equal(w.at(-2).label, '📈 Montée progressive', 'montée progressive juste avant le n°1');
  for (const p of w.slice(0, -2)) assert.ok(['easy', 'mod'].includes(p.intensity), `${p.aimLabel} reste modérée`);
  const force = w.find((p) => p.aimLabel === 'Force · Bloc');
  assert.notEqual(force.structure, 'limit', 'pas de « blocs max » une fois modérée'); assert.ok(force.why.some((x) => /doigts restent frais/.test(x)));
  const t = r.notes.join('\n');
  assert.match(t, /vient à la fin : toute la séance est organisée/); assert.match(t, /raccourcie de \d+ min \(doigts ménagés\)/); assert.match(t, /Montée progressive/);
  assert.equal(sum(r.phases), 150);
});
ok('le même n°1 en premier : abordé frais, rien n’est bridé après lui', () => {
  const aims = [{ ...A.familyAim('performance', 'climbing_route'), when: 'start' }, A.familyAim('force', 'climbing_boulder')];
  const r = A.planFromAims({ aims, sports: ['climbing_route', 'climbing_boulder'], envId: 's', minutes: 120 });
  assert.match(r.notes.join('\n'), /juste après l’échauffement : tu l’abordes frais/);
  assert.equal(work(r.phases).find((p) => p.aimLabel === 'Force · Bloc').intensity, 'hard');
});
ok('rang : changer l’ordre des objectifs change le temps de chacun', () => {
  const a = A.familyAim('technique', 'climbing_boulder'), b = A.familyAim('endurance', 'climbing_boulder');
  const m = (r, l) => work(r.phases).find((p) => p.aimLabel === l).minutes;
  const r1 = A.planFromAims({ aims: [a, b], sports: ['climbing_boulder'], minutes: 90 }), r2 = A.planFromAims({ aims: [b, a], sports: ['climbing_boulder'], minutes: 90 });
  assert.ok(m(r1, 'Technique · Bloc') > m(r1, 'Endurance · Bloc')); assert.ok(m(r2, 'Endurance · Bloc') > m(r2, 'Technique · Bloc'));
});
ok('plusieurs sports, plusieurs lieux : chaque phase dans le lieu de son sport, trajets comptés dans le temps disponible', () => {
  const aims = [A.familyAim('endurance', 'running'), A.familyAim('force', 'strength')];
  const r = A.planFromAims({ aims, sports: ['running', 'strength'], envId: 'parc', places: { strength: 'salle' }, minutes: 90, travel: 20 });
  const ph = normalizePhases(r.phases, 'running'), tr = transitions(ph, [{ id: 'parc', name: 'Parc', equipment: ['track'] }, { id: 'salle', name: 'Salle', equipment: ['barbell', 'bench'] }], 'parc');
  const b = budget(ph, 90, tr);
  assert.equal(b.needed, 90, 'phases + trajets = temps disponible'); assert.equal(b.travel, 20); assert.equal(r.travel, 20);
  assert.match(r.notes.join('\n'), /1 changement de lieu : 20 min de trajet/);
  // un sport choisi sans objectif reçoit une partie équilibrée
  const r2 = A.planFromAims({ aims: [A.familyAim('force', 'strength')], sports: ['strength', 'running'], envId: 'g', minutes: 75 });
  assert.ok(work(r2.phases).some((p) => p.activity === 'running' && /équilibrée/.test(p.aimLabel)));
});
ok('« Auto » sur deux lieux : regroupés pour éviter les allers-retours', () => {
  const aims = [A.familyAim('puissance', 'climbing_boulder'), A.familyAim('puissance', 'running'), A.familyAim('technique', 'climbing_boulder')];
  const r = A.planFromAims({ aims, sports: ['climbing_boulder', 'running'], envId: 'mur', places: { running: 'stade' }, minutes: 120, travel: 15 });
  assert.equal(r.travel, 15, 'un seul trajet'); assert.match(r.notes.join('\n'), /regroupés par lieu/);
});
ok('pas assez de temps : on retire les moins importants, et on le dit', () => {
  const aims = ['performance', 'force', 'endurance', 'technique', 'mobilite'].map((f) => A.familyAim(f, 'climbing_boulder'));
  const r = A.planFromAims({ aims, sports: ['climbing_boulder'], minutes: 45 });
  assert.ok(r.dropped.length >= 1); assert.equal(r.dropped[0].label, 'Mobilité · Bloc', 'le n°5 part en premier');
  assert.match(r.notes.join('\n'), /Pas assez de temps pour « Mobilité · Bloc » \(n°5\) : retiré/);
  assert.equal(sum(r.phases), 45); assert.ok(work(r.phases).every((p) => p.minutes >= 10));
});
ok('forme du jour basse : intensités baissées d’un cran, structures cohérentes', () => {
  const r = A.planFromAims({ aims: [A.familyAim('force', 'strength'), A.familyAim('performance', 'climbing_boulder')], sports: ['strength', 'climbing_boulder'], minutes: 90, forme: 'low' });
  const f = work(r.phases).find((p) => p.aimLabel === 'Force · Muscu');
  assert.equal(f.intensity, 'mod'); assert.equal(f.structure, 'cinq'); assert.match(r.notes.join('\n'), /Forme du jour basse/);
});
ok('n°1 exigeant avec beaucoup de temps : 60 min au plus à fond, le reste en volume facile (dit)', () => {
  const r = A.planFromAims({ aims: [A.familyAim('performance', 'climbing_route')], sports: ['climbing_route'], minutes: 150 });
  const w = work(r.phases); assert.equal(w.find((p) => p.aimLabel === 'Performer · Voie').minutes, 60);
  assert.ok(w.some((p) => /Volume facile/.test(p.goal) && p.intensity === 'easy')); assert.equal(sum(r.phases), 150);
});
ok('objectif du profil chiffré : sa cible passe dans la phase (allure, charge)', () => {
  const g = A.goalAim({ id: 'g1', label: '10 km en 50 min' }, [{ id: 'endurance_aerobie', w: 1 }], 'running', {}, { metricId: 'course_10k', value: 50 });
  const r = A.planFromAims({ aims: [g], sports: ['running'], minutes: 60 });
  const p = work(r.phases).find((x) => x.aimKey === 'goal:g1');
  assert.equal(p.type, 'work'); assert.equal(p.structure, 'allure'); assert.deepEqual(p.target, { metricId: 'course_10k', value: 50 });
});
ok('objectif écrit « gainage » pour l’escalade : une phase de gainage, pas de la grimpe à fond', () => {
  const g = A.textAim({ label: 'Gainage', caps: { gainage_anterieur: 1, gainage_lateral: 0.6 } }, 'climbing_boulder', {});
  const r = A.planFromAims({ aims: [g], sports: ['climbing_boulder'], minutes: 60 });
  assert.equal(work(r.phases).find((p) => p.aimKey === g.key).type, 'core');
});
ok('objectifs nettoyés : clés uniques, sport inconnu ramené au sport principal, moment inconnu = auto, 6 au plus', () => {
  const x = A.familyAim('force', 'climbing_boulder');
  const l = A.cleanAims([x, x, { ...x, key: 'k2', sport: 'inconnu', when: 'jamais', label: '<b>Hack</b>' }, ...Array.from({ length: 9 }, (_, k) => ({ ...x, key: 'z' + k }))], ['climbing_boulder']);
  assert.equal(l.length, 6); assert.equal(l[1].sport, 'climbing_boulder'); assert.equal(l[1].when, 'auto'); assert.doesNotMatch(l[1].label, /[<>]/);
});
ok('chronologie de la structure finale : heures de début et de fin, trajets à leur place', () => {
  const aims = [A.familyAim('endurance', 'running'), A.familyAim('force', 'strength')];
  const r = A.planFromAims({ aims, sports: ['running', 'strength'], envId: 'parc', places: { strength: 'salle' }, minutes: 90, travel: 20 });
  const ph = normalizePhases(r.phases, 'running'), tl = A.timeline(ph, transitions(ph, [], 'parc'));
  assert.equal(tl.total, 90); assert.equal(tl.rows[0].from, 0); assert.ok(tl.rows.some((x) => x.kind === 'travel' && x.minutes === 20));
  assert.equal(A.clock(75), '1:15'); assert.equal(A.clock(5), '0:05');
});
ok('la structure se construit vraiment : chaque phase reçoit des exercices (escalade, course, muscu)', () => {
  const ctx = ctxOf({ items: [act('climbing_route'), act('running'), act('strength'), it('env', { name: 'Salle', type: 'salle', equipment: ['wall', 'hangboard', 'barbell', 'bench', 'weights'], isDefault: true }, 'salle')] });
  const aims = [{ ...A.familyAim('performance', 'climbing_route'), when: 'end' }, A.familyAim('endurance', 'running'), A.familyAim('force', 'strength')];
  const r = A.planFromAims({ aims, sports: ['climbing_route', 'running', 'strength'], envId: 'salle', minutes: 150 });
  const ph = normalizePhases(r.phases, 'climbing_route'), s = buildFromParts(ph, ctx, { sport: 'climbing_route', envId: 'salle' });
  for (const p of ph) assert.ok(s.exercises.some((e) => e.phase === p.id), `exercices pour « ${p.goal || p.type} »`);
  assert.ok(s.exercises.filter((e) => e.phase === ph.at(-2).id).length, 'la phase n°1 (voie) a ses essais');
});
const W2 = [{ envId: 'voie', name: 'Salle de voie', from: '18:00', to: '19:30' }, { envId: 'bloc', name: 'Salle de bloc', from: '20:00', to: '21:00' }];
const EQ2 = { voie: ['wall', 'leadwall'], bloc: ['wall', 'hangboard', 'bar', 'weights', 'mat'] };
const tri = () => [A.familyAim('endurance', 'climbing_route'), A.familyAim('force', 'climbing_boulder'), A.familyAim('force', 'conditioning')];
ok('sans hiérarchie : même part de temps, pas de n°1, ordre selon l’effort', () => {
  const r = A.planFromAims({ aims: tri(), sports: ['climbing_route', 'climbing_boulder', 'conditioning'], minutes: 90, equal: true });
  const w = work(r.phases); assert.equal(w.length, 3);
  assert.ok(Math.max(...w.map((p) => p.minutes)) - Math.min(...w.map((p) => p.minutes)) <= 5, w.map((p) => p.minutes).join(','));
  assert.ok(w.every((p) => p.aimEqual && !p.objective && !/n°/.test(p.goal)));
  assert.equal(sum(r.phases), 90); assert.match(r.notes.join('\n'), /Sans hiérarchie/); assert.doesNotMatch(r.notes.join('\n'), /n°1/);
});
ok('horaires par lieu : voie 18:00–19:30, 30 min de trajet, bloc 20:00–21:00 ; le renfo va là où il y a le matériel, après la grimpe', () => {
  const r = A.planFromAims({ aims: tri(), sports: ['climbing_route', 'climbing_boulder', 'conditioning'], envId: 'voie', places: { climbing_boulder: 'bloc' }, equal: true, windows: W2, envEquip: EQ2 });
  assert.equal(r.minutes, 180); assert.equal(r.start, 18 * 60); assert.equal(r.travel, 30);
  const ph = normalizePhases(r.phases, 'climbing_route'), tr = transitions(ph, [{ id: 'voie', name: 'Salle de voie', equipment: EQ2.voie }, { id: 'bloc', name: 'Salle de bloc', equipment: EQ2.bloc }], 'voie');
  const tl = A.timeline(ph, tr); assert.equal(tl.total, 180, 'phases + trajet = de 18:00 à 21:00');
  assert.deepEqual(tl.rows.filter((x) => x.kind === 'travel').map((x) => [x.from, x.minutes]), [[90, 30]], 'trajet entre 19:30 et 20:00');
  const iRe = ph.findIndex((p) => p.goal === 'Remise en route'), iRenfo = ph.findIndex((p) => p.activity === 'conditioning'), iBloc = ph.findIndex((p) => p.activity === 'climbing_boulder' && p.type === 'climb');
  assert.ok(iRe > 0 && ph[iRe].place.envId === 'bloc', 'remise en route en arrivant à la salle de bloc');
  assert.ok(iRenfo > iBloc && iBloc > iRe, 'renfo à la salle de bloc, après le bloc');
  assert.match(r.notes.join('\n'), /Renfo » placé à Salle de bloc[^\n]*poutre/);
  // la voie remplit son créneau (échauffement compris)
  const before = ph.slice(0, iRe); assert.equal(sum(before), 90);
});
ok('horaires invalides : chevauchement ou fin avant début → dit, rien d’inventé', () => {
  assert.match(A.cleanWindows([{ name: 'A', from: '18:00', to: '19:00' }, { name: 'B', from: '18:30', to: '20:00' }]).errors[0], /chevauchent/);
  assert.match(A.cleanWindows([{ name: 'A', from: '19:00', to: '18:00' }]).errors[0], /après l’arrivée/);
  assert.equal(A.cleanWindows([{ name: 'A', from: '25:00', to: '18:00' }]).windows.length, 0);
  const r = A.planFromAims({ aims: tri(), sports: ['climbing_route'], windows: [{ name: 'A', from: '19:00', to: '18:00' }] });
  assert.equal(r.phases.length, 0); assert.ok(r.errors.length);
});
ok('horaires, objectifs classés : le n°1 en bloc (2e créneau) → la voie d’avant reste modérée ; doigts sur la poutre là où elle existe', () => {
  const aims = [A.familyAim('performance', 'climbing_boulder'), A.familyAim('force', 'climbing_route'), A.intentAim({ id: 'doigts', label: 'Doigts', caps: { force_doigts: 1 } }, 'climbing_route')];
  const r = A.planFromAims({ aims, sports: ['climbing_route', 'climbing_boulder'], envId: 'voie', places: { climbing_boulder: 'bloc' }, windows: W2, envEquip: EQ2 });
  const voie = r.phases.find((p) => p.type === 'climb' && p.activity === 'climbing_route'); assert.equal(voie.intensity, 'mod');
  const fingers = r.phases.find((p) => p.type === 'fingers'); assert.ok(fingers, 'poutre utilisée'); assert.equal(fingers.place.mode, 'same');
  const iF = r.phases.indexOf(fingers), iRe = r.phases.findIndex((p) => p.goal === 'Remise en route'); assert.ok(iF > iRe, 'doigts à la salle de bloc (la seule avec une poutre)');
});
console.log(`\n${n} tests objectifs classés OK`);
