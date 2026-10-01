// tests/climbplan.test.mjs — séance d'escalade structurée : objectif de fin de séance, parties au choix, adaptation.
import assert from 'node:assert/strict';
import * as C from '../public/climbplan.js';
import { systemFromTemplate, sortedLevels, BUILTIN_SYSTEMS } from '../public/grading.js';
import { exMinutes, sessionMinutes } from '../public/engine.js';
import { it, env, act, perf, ctxOf } from './fixtures.mjs';
import { byId as byIdLib } from '../public/library.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const u8 = systemFromTemplate('u8'), levels = sortedLevels({ levels: u8.levels });
const base = [act('climbing_boulder'), it('gradesys', u8, 'u8sys'), env('Salle', ['wall', 'hangboard'], { type: 'salle', gradeSys: 'u8sys' })];
const ctx = ctxOf({ items: base });
const partMin = (s) => { const m = new Map(); for (const e of s.exercises) m.set(e.part, (m.get(e.part) || 0) + exMinutes(e)); return m; };

console.log('Cotations');
ok('système : celui de la salle, sinon un système perso, sinon la référence ; maximum connu seulement s’il est noté', () => {
  assert.equal(C.pickSystem(ctx, 'bloc').name, 'Salle U1 → U8');
  assert.equal(C.pickSystem(ctxOf({ items: [act('climbing_boulder')] }), 'voie').id, 'french');
  assert.equal(C.knownMax(ctx, C.pickSystem(ctx, 'bloc'), 'bloc'), null, 'rien de noté : on n’invente pas');
  const sys = C.pickSystem(ctx, 'bloc'), lv = sortedLevels(sys);
  const c2 = ctxOf({ items: [...base, perf('max_bloc', 0, 3, { grade: { systemId: 'u8sys', levelId: lv[5].id, label: 'U6', order: 5, total: 8 } })] });
  assert.equal(C.knownMax(c2, C.pickSystem(c2, 'bloc'), 'bloc'), 5);
});
console.log('Objectif de fin de séance');
ok('« réussir un U8 en dévers-réglettes en 2 h » : échauffement sur U3–U4, montée, spécifique U7, essais sur U8, retour au calme', () => {
  const parts = C.goalParts({ kind: 'bloc', target: 7, levels, styles: ['st-devers', 'st-reglettes'], minutes: 120 });
  assert.equal(parts.reduce((t, p) => t + p.minutes, 0), 120);
  const s = C.buildFromParts(parts, ctx, { goal: 'Réussir un U8' });
  const heads = [...new Set(s.exercises.map((e) => e.part))];
  assert.deepEqual(heads, ['🔥 Échauffement', '🔥 Échauffement en grimpant (U3–U4)', '📈 Montée (U5–U6)', '🎨 Spécifique (U7)', '🎯 Objectif U8', '🌬️ Retour au calme']);
  assert.ok(s.exercises.find((e) => e.part.includes('U3–U4')).name.includes('dévers et réglettes'));
  assert.match(s.exercises.find((e) => e.part.includes('Objectif')).name, /U8/);
  assert.ok(Math.abs(sessionMinutes(s) - 120) <= 25, `${sessionMinutes(s)} min pour 120`);
  assert.equal(s.objectives[0], 'Réussir un U8');
});
ok('peu de temps : pas de partie spécifique ; conseil honnête selon le maximum noté', () => {
  assert.ok(!C.goalParts({ kind: 'bloc', target: 7, levels, minutes: 60 }).some((p) => /Spécifique/.test(p.label || '')));
  assert.match(C.goalAdvice(7, 4, levels), /ambitieux.*U5.*U6/);
  assert.match(C.goalAdvice(6, 5, levels), /Un cran au-dessus/);
  assert.equal(C.goalAdvice(7, null, levels), '');
});
console.log('Parties au choix');
ok('15 min échauffement, 1 h 30 bloc intense, 30 min bloc tranquille, voie max : chaque partie proche de son temps', () => {
  const parts = [{ type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 90, styles: ['st-reglettes'] }, { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30 }, { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40 }];
  const s = C.buildFromParts(parts, ctx), pm = partMin(s);
  assert.deepEqual([...pm.keys()], ['🔥 Échauffement', '🪨 Bloc intense', '🪨 Bloc tranquille', '🧗 Voie max']);
  for (const [k, want] of [['🪨 Bloc intense', 90], ['🪨 Bloc tranquille', 30], ['🧗 Voie max', 40]]) assert.ok(pm.get(k) >= want * 0.6 && pm.get(k) <= want * 1.3, `${k} : ${pm.get(k)} pour ${want}`);
  assert.deepEqual(s.sports, ['climbing_route']); assert.equal(s.activity, 'climbing_boulder');
});
ok('plusieurs structures proposées selon l’intensité, et chacune donne une partie différente', () => {
  assert.equal(C.proposals('bloc', 'hard')[0].fit, true); assert.ok(C.proposals('bloc', 'easy').slice(0, 2).every((x) => x.fit));
  const names = new Set();
  for (const id of Object.keys(C.STRUCTURES.bloc)) {
    const r = C.buildClimbPart({ type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 40, structure: id, styles: ['st-dalle', 'st-devers'] }, { levels, label: 'x' });
    assert.ok(r.exercises.length >= 1, id); names.add(r.exercises.map((e) => e.name).join('|'));
  }
  assert.equal(names.size, Object.keys(C.STRUCTURES.bloc).length);
});
ok('cotations choisies à la main respectées ; sinon selon l’intensité', () => {
  assert.deepEqual(C.partRange({ intensity: 'hard', from: 6, to: 2 }, levels, null), [2, 6]);
  const [lo1] = C.partRange({ intensity: 'easy' }, levels, 6), [, hi2] = C.partRange({ intensity: 'max' }, levels, 6);
  assert.ok(lo1 < 6 && hi2 === 6);
});
ok('adapter à ce qui précède (au choix) : après beaucoup de doigts, moins de réglettes et un cran plus bas ; sans le choix, rien ne change', () => {
  const before = { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 90, styles: ['st-reglettes', 'st-petites-prises'] };
  const after = { type: 'climb', kind: 'voie', intensity: 'max', minutes: 40, styles: ['st-reglettes', 'st-devers'] };
  const L = C.priorLoad([before, after], 1); assert.ok(L.fingers >= 40);
  const fr = sortedLevels(BUILTIN_SYSTEMS.french);
  const plain = C.buildClimbPart(after, { levels: fr, max: 20, load: L, label: 'v' });
  const adapted = C.buildClimbPart({ ...after, adapt: true }, { levels: fr, max: 20, load: L, label: 'v' });
  assert.deepEqual(plain.styles, ['st-reglettes', 'st-devers']); assert.deepEqual(adapted.styles, ['st-devers']);
  assert.ok(adapted.range[1] < plain.range[1]); assert.match(adapted.exercises[0].note, /doigts/);
  assert.equal(C.priorLoad([{ type: 'warmup', minutes: 15 }, after], 1).fingers, 0);
});
ok('choix de l’utilisateur respecté : exercices choisis, ou partie vide si tout est décoché', () => {
  const parts = [{ type: 'fingers', minutes: 15, pick: ['finger-extensions'] }, { type: 'core', minutes: 10, pick: [] }, { type: 'climb', kind: 'bloc', intensity: 'hard', minutes: 20, pick: [] }];
  const s = C.buildFromParts(parts, ctx);
  assert.deepEqual([...new Set(s.exercises.map((e) => e.libId))], ['finger-extensions']);
  const free = C.buildFromParts([{ type: 'core', minutes: 10 }], ctx, { free: true }); assert.equal(free.exercises.length, 0, 'mode libre : rien d’imposé');
});
ok('autre sport : le corps de séance suit le sport choisi, le matériel du lieu et les objectifs', () => {
  const c = ctxOf({ items: [act('conditioning'), act('climbing_boulder'), env('Maison', ['mat'], { isDefault: false }), env('Salle', ['bar', 'mat', 'band'], { isDefault: true })] });
  const envs = c.envs, maison = envs.find((e) => e.name === 'Maison'), salle = envs.find((e) => e.name === 'Salle');
  const parts = [{ type: 'warmup', minutes: 8 }, { type: 'main', minutes: 30, activity: 'conditioning' }, { type: 'cool', minutes: 6 }];
  const atHome = C.buildFromParts(parts, c, { sport: 'conditioning', envId: maison.id, envName: 'Maison' });
  assert.equal(atHome.activity, 'conditioning'); assert.equal(atHome.context.env, maison.id);
  assert.ok(atHome.exercises.filter((e) => e.block === 'main').length >= 2);
  for (const e of atHome.exercises) assert.ok((byIdLib(e.libId)?.needs || []).every((n) => n === 'mat'), `${e.name} demande du matériel absent à la maison`);
  const gyms = [1, 2, 3, 4, 5].map((seed) => C.buildFromParts(parts, c, { sport: 'conditioning', envId: salle.id, seed }));
  for (const g of gyms) for (const e of g.exercises) assert.ok((byIdLib(e.libId)?.needs || []).every((n) => ['bar', 'mat', 'band'].includes(n)), `${e.name} : matériel de la salle seulement`);
  assert.ok(gyms.some((g) => g.exercises.some((e) => (byIdLib(e.libId)?.needs || []).includes('bar'))), 'à la salle, la barre peut servir');
  const noWall = C.buildFromParts([{ type: 'climb', kind: 'bloc', intensity: 'mod', minutes: 20 }], c, { envId: maison.id, envName: 'Maison' });
  assert.match(noWall.notes[0].text, /Maison n’a pas de mur/);
});
console.log(`\n${n} tests d’escalade structurée OK`);
