// tests/data.test.mjs — import CSV vérifié, recherche, estimation de niveau, nettoyage des items.
import assert from 'node:assert/strict';
import * as C from '../public/csv.js';
import { classicSearch, smartSearch } from '../public/search.js';
import { estimateLevel } from '../public/estimate.js';
import { cleanItem, SCHEMAS } from '../public/items.js';
import { NOW, perf, entry, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('CSV');
ok('séparateur point-virgule détecté, guillemets et BOM gérés', () => {
  const p = C.parseCSV('﻿Date;Exercice;Note\n2026-01-02;"Pompes; strictes";"il a dit ""ok"""\n');
  assert.equal(p.sep, ';'); assert.deepEqual(p.rows[0], ['2026-01-02', 'Pompes; strictes', 'il a dit "ok"']);
});
ok('fichier sans données : erreur explicite', () => { assert.throws(() => C.parseCSV('Date\n'), /au moins une ligne/); });
ok('dates : ISO, JJ/MM/AAAA ; dates impossibles refusées', () => {
  assert.ok(C.parseDateCell('2026-02-03')); assert.equal(new Date(C.parseDateCell('03/02/2026')).getMonth(), 1);
  assert.equal(C.parseDateCell('31/02/2026'), null); assert.equal(C.parseDateCell('demain'), null);
});
ok('nombres et durées', () => {
  assert.equal(C.parseNumberCell('12,5 kg'), 12.5); assert.ok(Number.isNaN(C.parseNumberCell('abc'))); assert.equal(C.parseNumberCell(''), null);
  assert.equal(C.parseDurationCell('1:05:00'), 3900); assert.equal(C.parseDurationCell('45 min'), 2700); assert.equal(C.parseDurationCell('1h10'), 4200); assert.equal(C.parseDurationCell('12:30'), 750);
});
ok('correspondance proposée ; en-tête inconnu ou ambigu non mappé', () => {
  const { mapping, notes } = C.proposeMapping(['Date', 'Exercice', 'Reps', 'Truc', 'Poids', 'Charge']);
  assert.equal(mapping[0], 'date'); assert.equal(mapping[1], 'exercise'); assert.equal(mapping[2], 'reps');
  assert.equal(mapping[3], ''); assert.match(notes[3], /non reconnu/);
  assert.equal(mapping[4], ''); assert.equal(mapping[5], '');
});
ok('vérification : champ obligatoire manquant et doublon signalés', () => {
  assert.equal(C.checkMapping({ 0: 'exercise' }).ok, false);
  const r = C.checkMapping({ 0: 'date', 1: 'reps', 2: 'reps' }); assert.ok(r.errors.some((e) => /deux colonnes/.test(e)));
});
ok('import historique : regroupement, identifiants stables, futur refusé, erreurs par ligne', () => {
  const p = C.parseCSV('Date,Seance,Exercice,Series,Reps,Charge\n2026-01-02,Jambes,Squats,3,8,40\n2026-01-02,Jambes,Fentes,2,10,\n2099-01-01,Futur,Squats,1,1,1\n2026-01-03,Haut,Pompes,x,10,\n');
  const m = { 0: 'date', 1: 'sessionName', 2: 'exercise', 3: 'sets', 4: 'reps', 5: 'load' };
  const r = C.buildImport(p, m, 'history', { now: NOW });
  assert.equal(r.records.length, 1); assert.equal(r.records[0].data.exercises.length, 2); assert.equal(r.records[0].data.exercises[0].sets.length, 3);
  assert.ok(r.errors.some((e) => e.row === 4 && /futur/.test(e.error))); assert.ok(r.errors.some((e) => e.row === 5));
  assert.equal(C.buildImport(p, m, 'history', { now: NOW }).records[0].id, r.records[0].id);
});
ok('import performances : métrique non mappée refusée', () => {
  const p = C.parseCSV('Date,Test,Valeur\n2026-01-02,Tractions strictes max,12\n2026-01-02,Inconnu,3\n');
  const mm = C.proposeMetricMap(p.rows.map((r) => r[1]), ctxOf().metrics);
  assert.equal(mm['Tractions strictes max'], 'max_tractions'); assert.equal(mm.Inconnu, '');
  const r = C.buildImport(p, { 0: 'date', 1: 'metric', 2: 'value' }, 'perf', { metricMap: mm, now: NOW });
  assert.equal(r.records.length, 1); assert.equal(r.records[0].d.source, 'imported'); assert.equal(r.skipped, 1);
});

console.log('Recherche');
const seances = [{ id: 's1', name: 'Tirage maison', exercises: [{ name: 'Tractions', libId: 'pullup' }] }, { id: 's2', name: 'Gainage', exercises: [{ name: 'Planche', libId: 'plank', needs: [] }] }];
ok('recherche classique : accents et casse ignorés, tous les mots requis', () => {
  const r = classicSearch('TIRAGE maison', { seances });
  assert.ok(r.some((x) => x.id === 's1')); assert.ok(!classicSearch('tirage piscine', { seances }).some((x) => x.kind === 'seance'));
  assert.equal(classicSearch('', { seances }).length, 0);
});
ok('recherche intelligente : figure → exercices liés avec explication', () => {
  const g = smartSearch('exercices pour le front lever', ctxOf(), { seances });
  assert.ok(g[0].results.length && g[0].why);
});
ok('recherche intelligente : capacité → séances qui la travaillent', () => {
  const g = smartSearch('tirage vertical', ctxOf({ seances }), { seances });
  assert.ok(g.some((x) => /Séances/.test(x.title) && x.results.some((r) => r.id === 's1')));
});
ok('intention reconnue sans résultat : groupe conservé (réponse « aucun résultat »)', () => {
  const g = smartSearch('mes records', ctxOf(), {});
  assert.ok(g.some((x) => /records/.test(x.title) && x.results.length === 0));
  const g2 = smartSearch('mes records', ctxOf({ items: [perf('max_tractions', 10)] }), {});
  assert.ok(g2.some((x) => x.results.length));
});

console.log('Estimation de niveau');
ok('séance facile → débutant ; séance exigeante → avancé ; critères expliqués et catégorisés', () => {
  const easy = estimateLevel({ exercises: [{ name: 'Planche', libId: 'plank', block: 'main', sets: 2, mode: 'time', secMin: 20, secMax: 30 }] });
  assert.equal(easy.level, 'debutant'); assert.equal(easy.confidence, 'haute'); assert.ok(easy.criteria.every((c) => ['connu', 'estimé', 'inconnu'].includes(c.cat)));
  const hard = estimateLevel({ exercises: ['oap', 'fl-full', 'hang-max'].map((id) => ({ name: id, libId: id, block: 'main', sets: 5, intensity: 'high' })) });
  assert.equal(hard.level, 'avance'); assert.match(hard.text, /pas une vérité/); assert.ok(!('score' in hard), 'plus de score décimal');
});
ok('niveau factuel : un seul exercice avancé suffit, et il est nommé', () => {
  const easyEx = ['plank', 'plank', 'plank', 'plank'].map((id) => ({ name: 'Planche', libId: id, block: 'main', sets: 3, mode: 'time', secMin: 30, secMax: 30 }));
  const r = estimateLevel({ exercises: [...easyEx, { name: 'Traction à un bras', libId: 'oap', block: 'main', sets: 1, repsMin: 1, repsMax: 1 }] });
  assert.equal(r.level, 'avance'); assert.match(r.criteria[0].value, /Traction à un bras/);
});
ok('niveau factuel : aucune donnée manquante n’est remplie ; exercice inconnu signalé, fiabilité baissée', () => {
  const r = estimateLevel({ exercises: [{ name: 'Truc inventé', block: 'main' }, { name: 'Planche', libId: 'plank', block: 'main', sets: 2, mode: 'time', secMin: 30, secMax: 30 }] });
  assert.equal(r.confidence, 'faible');
  assert.ok(r.unknown.some((u) => /Truc inventé/.test(u) && /absent/.test(u)));
  assert.ok(r.unknown.some((u) => /Truc inventé/.test(u) && /non renseignées/.test(u)), 'pas de 8 répétitions inventées');
  assert.ok(r.minutes < 5, 'la durée ne compte que ce qui est écrit');
});
ok('niveau factuel : cotation d’une partie de grimpe lue et convertie (6C en bloc → avancé ; 5+ → débutant)', () => {
  assert.equal(estimateLevel({ exercises: [{ name: 'Blocs 5+', unit: 'blocs', block: 'main', sets: 6, repsMin: 1, repsMax: 1 }] }).level, 'debutant');
  const r = estimateLevel({ exercises: [{ name: 'Essais sur blocs 6B+–6C', unit: 'blocs', block: 'main', sets: 4, repsMin: 1, repsMax: 1 }] });
  assert.equal(r.level, 'avance'); assert.match(r.text, /6C/);
  assert.ok(estimateLevel({ exercises: [{ name: 'Blocs U5', unit: 'blocs', block: 'main', sets: 4 }] }).unknown.some((u) => /non reconnue/.test(u)));
});

console.log('Items');
ok('clés inconnues supprimées, valeurs bornées, identifiants invalides refusés', () => {
  const x = cleanItem({ c: 'perf', id: 'p1', u: 5, d: { metricId: 'max_tractions', value: 1e12, hack: '<script>', source: 'root' } });
  assert.equal(x.d.value, 1e7); assert.equal(x.d.hack, undefined); assert.equal(x.d.source, 'declared');
  assert.equal(cleanItem({ c: 'perf', id: '../x', u: 5, d: {} }), null); assert.equal(cleanItem({ c: 'inconnu', id: 'a', u: 5 }), null); assert.equal(cleanItem({ c: 'perf', id: 'a' }), null);
});
ok('suppression : tombstone sans données', () => { assert.deepEqual(cleanItem({ c: 'goal', id: 'g', u: 9, del: true, d: { label: 'x' } }).d, {}); });
ok('chaque collection accepte un objet vide sans planter', () => { for (const c of Object.keys(SCHEMAS)) assert.ok(cleanItem({ c, id: 'x', u: 1, d: {} })); });

console.log(`\n${n} tests données / recherche / estimation OK`);
