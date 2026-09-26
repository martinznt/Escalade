// tests/grading.test.mjs — systèmes de cotation multiples, correspondances, maxima multi-styles, historique préservé.
import assert from 'node:assert/strict';
import { BUILTIN_SYSTEMS, TEMPLATES, systemFromTemplate, addLevel, moveLevel, removeLevel, renameLevel, setMapping, allSystems, gradeSnapshot, toReference, fromReference, levelFromReference, maximaSummary, bestReferenceLevel, snapshotText, sortedLevels } from '../public/grading.js';
import { buildContext, capacityState } from '../public/brain.js';
import { ok, done } from './helpers.mjs';

console.log('Cotations');
const u8 = { id: 'u8', ...systemFromTemplate('u8') };
const col = { id: 'col', ...systemFromTemplate('couleurs') };
await ok('1. système U1 → U8 créé depuis un modèle, ordonné', () => { assert.deepEqual(sortedLevels(u8).map((l) => l.label), ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8']); });
await ok('2. système couleurs avec couleurs', () => { assert.equal(col.kind, 'colors'); assert.ok(col.levels.every((l) => /^#/.test(l.color))); });
await ok('3. système personnalisé vide puis niveaux ajoutés', () => { let s = { id: 'p', ...systemFromTemplate('vide') }; s = addLevel(addLevel(s, 'Facile'), 'Dur'); assert.deepEqual(sortedLevels(s).map((l) => l.label), ['Facile', 'Dur']); });
await ok('4. modification : renommer, recolorer, réordonner, supprimer un niveau', () => {
  let s = renameLevel(u8, u8.levels[0].id, 'Vert', '#00aa00'); assert.equal(sortedLevels(s)[0].label, 'Vert');
  s = moveLevel(s, s.levels[1].id, -1); assert.equal(sortedLevels(s)[0].label, 'U2'); assert.deepEqual(sortedLevels(s).map((l) => l.order), [0, 1, 2, 3, 4, 5, 6, 7]);
  s = setMapping(s, s.levels[2].id, 'font', '5'); s = removeLevel(s, s.levels[2].id); assert.equal(s.levels.length, 7); assert.equal(s.maps.length, 0, 'correspondance du niveau supprimé retirée');
});
await ok('5. plusieurs systèmes pour un même utilisateur', () => { const all = allSystems({ u8, col }); assert.ok(all.font && all.vscale && all.french && all.u8 && all.col); });
await ok('correspondances : table usuelle V → Font, correspondance utilisateur, jamais d’invention', () => {
  const all = allSystems({ u8: setMapping(u8, u8.levels[4].id, 'font', '6B'), col });
  assert.equal(toReference(gradeSnapshot(all.vscale, 'l4'), all, 'bloc').label, '6B');
  assert.equal(toReference(gradeSnapshot(all.u8, u8.levels[4].id), all, 'bloc').label, '6B');
  assert.equal(toReference(gradeSnapshot(all.u8, u8.levels[5].id), all, 'bloc'), null, 'U6 sans correspondance → null');
  assert.equal(toReference(gradeSnapshot(all.col, col.levels[0].id), all, 'bloc'), null);
  assert.equal(fromReference(7, all.u8, 'bloc').label, 'U5', 'Font 6B → U5 via la correspondance');
  assert.equal(fromReference(20, all.u8, 'bloc'), null, 'aucune équivalence lointaine inventée');
  assert.equal(levelFromReference(4, 'bloc'), 0); assert.equal(levelFromReference(7, 'bloc'), 1); assert.equal(levelFromReference(11, 'bloc'), 2);
});
const all = allSystems({ u8: setMapping(u8, u8.levels[4].id, 'font', '6B'), col });
const perfs = [
  { id: 'a', metricId: 'max_bloc', grade: gradeSnapshot(all.font, 'l9'), styles: ['st-devers', 'st-reglettes'], date: 3 },
  { id: 'b', metricId: 'max_bloc', grade: gradeSnapshot(all.font, 'l7'), styles: ['st-dalle'], date: 2 },
  { id: 'c', metricId: 'max_bloc', grade: gradeSnapshot(all.u8, u8.levels[4].id), styles: ['st-u-arete'], date: 1 },
];
await ok('6–7. plusieurs maxima, plusieurs styles par maximum', () => {
  const m = maximaSummary(perfs, { 'st-devers': { label: 'Dévers' } });
  const font = m.find((x) => x.systemId === 'font'); assert.equal(font.best.grade.label, '6C'); assert.equal(font.entries.length, 2);
  assert.equal(font.byStyle.find((s) => s.styleId === 'st-devers').perf.grade.label, '6C'); assert.equal(font.byStyle.find((s) => s.styleId === 'st-dalle').perf.grade.label, '6B');
  assert.equal(m.find((x) => x.systemId === 'u8').best.grade.label, 'U5');
});
await ok('8–9. style personnalisé ajouté puis archivé : l’historique garde le style', () => {
  const ctx = buildContext({ items: [{ c: 'style', id: 'st-u-arete', u: 1, d: { label: 'Arête', activity: 'climbing', archived: true } }, { c: 'perf', id: 'c', u: 1, d: perfs[2] }] });
  assert.equal(ctx.styles['st-u-arete'].label, 'Arête'); assert.equal(ctx.styles['st-u-arete'].archived, true); assert.deepEqual(ctx.perfs[0].styles, ['st-u-arete']);
});
await ok('10. l’instantané garde le système d’origine même si le système change ou disparaît', () => {
  const snap = gradeSnapshot(all.u8, u8.levels[4].id);
  const renamed = allSystems({ u8: renameLevel(u8, u8.levels[4].id, 'Violet') });
  assert.match(snapshotText(snap, renamed), /U5 · Salle U1 → U8 \(aujourd’hui « Violet »\)/);
  assert.match(snapshotText(snap, allSystems({})), /système supprimé/);
  assert.equal(snap.label, 'U5');
});
await ok('meilleur niveau convertible pour le générateur (et rien si non convertible)', () => {
  assert.equal(bestReferenceLevel(perfs, all, 'bloc').label, '6C');
  assert.equal(bestReferenceLevel([perfs[2]], allSystems({ u8 }), 'bloc'), null);
});
await ok('estimation de capacité : un maximum sans correspondance est signalé comme manquant, pas converti', () => {
  const ctx = buildContext({ items: [{ c: 'gradesys', id: 'u8', u: 1, d: u8 }, { c: 'perf', id: 'c', u: 1, d: { ...perfs[2], source: 'declared', date: Date.now() } }] });
  const st = capacityState('force_doigts', ctx);
  assert.equal(st.level, null); assert.ok(st.missing.some((m) => /pas de correspondance/.test(m)));
});
done('tests de cotation');
