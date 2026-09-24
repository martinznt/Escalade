import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSessionText, exportSessionText, generateSession, parseRest, analyze, progressHint, applyPerformedBase, levelFrom, sessionMinutes, exMinutes, swapExercise, suggestToday, SIZES, groupLoads } from '../public/engine.js';
import { FOCUS, LIBRARY } from '../public/library.js';
import { mergeSeances, normalizeSession, normalizeEx, summarizeHistory, readStored } from '../public/shared.js';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('Parseur');
const text = fs.readFileSync(new URL('./sample.txt', import.meta.url), 'utf8');
const { session: s, warnings } = parseSessionText(text);
ok('séance reconnue', () => { assert.ok(s); assert.equal(warnings.length, 0, warnings.join('|')); });
ok('titre, emoji, durée, objectifs', () => {
  assert.equal(s.emoji, '🦵'); assert.match(s.name, /^Séance jambes/); assert.equal(s.durationMin, 45);
  assert.equal(s.objectives.length, 5);
});
ok('8 exercices', () => assert.equal(s.exercises.length, 8));
const [saut, squat, bulg, rdl, mol, step, cos, iso] = s.exercises;
ok('sauts 4×4 repos 120', () => { assert.equal(saut.name, 'Sauts verticaux maximaux'); assert.deepEqual([saut.sets, saut.repsMin, saut.repsMax, saut.rest, saut.mode], [4, 4, 4, 120, 'reps']); assert.equal(saut.ok.length, 5); });
ok('squats +10 à 15 kg 4×6–8 repos 150', () => { assert.equal(squat.load, '+10 à 15 kg'); assert.deepEqual([squat.sets, squat.repsMin, squat.repsMax, squat.rest], [4, 6, 8, 150]); });
ok('fentes par jambe', () => { assert.equal(bulg.perSide, true); assert.deepEqual([bulg.sets, bulg.repsMin, bulg.repsMax, bulg.rest], [3, 6, 10, 120]); });
ok('mollets 1 min 30', () => { assert.equal(mol.rest, 90); assert.deepEqual([mol.repsMin, mol.repsMax], [12, 20]); });
ok('step-up poids du corps', () => { assert.equal(step.load, 'Poids du corps'); assert.equal(step.perSide, true); });
ok('cossack par côté', () => { assert.equal(cos.perSide, true); assert.equal(cos.sets, 2); assert.equal(cos.rest, 60); });
ok('isométrie en secondes', () => { assert.equal(iso.mode, 'time'); assert.deepEqual([iso.secMin, iso.secMax, iso.sets, iso.rest, iso.perSide], [30, 45, 2, 45, true]); });
ok('muscles', () => { assert.deepEqual(rdl.muscles.slice(0, 2), ['ischio-jambiers', 'fessiers']); assert.ok(saut.muscles.includes('quadriceps')); });
ok('notes de progression', () => { assert.ok(s.notes.some((n) => /progression/i.test(n.title))); assert.ok(s.notes.some((n) => /^R[eè]gle/i.test(n.title) && /arrête/.test(n.text))); });
ok('parseRest', () => { assert.equal(parseRest('2 min 30'), 150); assert.equal(parseRest('2:30'), 150); assert.equal(parseRest('1:05'), 65); assert.equal(parseRest('45 s'), 45); assert.equal(parseRest('1 min 30'), 90); assert.equal(parseRest('2 min'), 120); assert.equal(parseRest('90s'), 90); });
ok('aller-retour texte → séance → texte → séance', () => {
  const again = parseSessionText(exportSessionText(s)).session;
  assert.equal(again.exercises.length, 8);
  again.exercises.forEach((e, i) => { const o = s.exercises[i]; assert.deepEqual([e.name, e.sets, e.repsMin, e.repsMax, e.secMin, e.secMax, e.rest, e.perSide, e.load], [o.name, o.sets, o.repsMin, o.repsMax, o.secMin, o.secMax, o.rest, o.perSide, o.load], e.name); });
});
ok('texte inutilisable → erreur claire', () => { const r = parseSessionText('bonjour\nça va'); assert.equal(r.session, null); assert.ok(r.warnings[0]); });
ok('exercice sans prescription → défaut + avertissement', () => { const r = parseSessionText('Séance test\n1. Pompes\n• Corps gainé'); assert.equal(r.session.exercises[0].sets, 3); assert.equal(r.warnings.length, 1); });
ok('formats variés (3x10, 3 séries de 10, ancien format)', () => {
  const r = parseSessionText('TEST\n1. A\n3x10 - repos 60 s\n2. B\n3 séries de 12 — repos 1 min\n3. C\n4 × 30 s\nRepos : 45 s');
  const [a, b, c] = r.session.exercises;
  assert.deepEqual([a.sets, a.repsMin, a.rest], [3, 10, 60]); assert.deepEqual([b.sets, b.repsMin, b.rest], [3, 12, 60]); assert.deepEqual([c.mode, c.secMin, c.rest], ['time', 30, 45]);
});

console.log('Ancien format et fusion');
ok('anciens exercices convertis', () => {
  const e = normalizeEx({ id: 'x', emoji: '🖐️', name: 'Suspensions doigts — réglette', type: 'time', amount: 8, sets: 4, rest: 165, ok: ['Réglette 22 mm', '🎯 Force des doigts pour l\'escalade'], bad: ['Aller à l\'échec'] });
  assert.equal(e.mode, 'time'); assert.equal(e.secMin, 8); assert.equal(e.rest, 165); assert.equal(e.ok.length, 1); assert.ok(e.muscles.length);
  const r = normalizeEx({ name: 'Tractions', type: 'reps', amount: 5, sets: 3, rest: 180 }); assert.deepEqual([r.repsMin, r.repsMax], [5, 5]);
});
ok('readStored ancien tableau et nouveau format', () => {
  assert.equal(readStored(JSON.stringify([{ id: 'a', name: 'A', exercises: [] }])).items.length, 1);
  assert.equal(readStored(JSON.stringify({ items: [{ id: 'a' }], tomb: { b: 5 } })).tomb.b, 5);
  assert.equal(readStored('n’importe quoi').items.length, 0);
});
ok('fusion : plus récent gagne, suppression gagne, ajout des deux côtés', () => {
  const A = { items: [{ id: '1', name: 'vieux', updatedAt: 10 }, { id: '2', name: 'B', updatedAt: 5 }], tomb: {} };
  const B = { items: [{ id: '1', name: 'nouveau', updatedAt: 20 }, { id: '3', name: 'C', updatedAt: 1 }], tomb: { 2: 6 } };
  const m = mergeSeances(A, B);
  assert.equal(m.items.find((x) => x.id === '1').name, 'nouveau'); assert.ok(!m.items.find((x) => x.id === '2')); assert.ok(m.items.find((x) => x.id === '3'));
  const back = mergeSeances(B, A); assert.equal(back.items.length, m.items.length);
  const resurrect = mergeSeances({ items: [{ id: '2', updatedAt: 9 }], tomb: {} }, { items: [], tomb: { 2: 6 } }); assert.equal(resurrect.items.length, 1);
});

console.log('Générateur');
const now = Date.UTC(2026, 8, 20, 12);
const fullEq = { wall: true, hangboard: true, bar: true, dips: true, weights: true, band: true };
const settingsPro = { level: { boulderMax: '6B', years: 4 }, equipment: fullEq };
const noEq = { level: { boulderMax: '5+', years: 0.5 }, equipment: {} };
const mkHist = (over = {}) => ({ id: 'h' + Math.random(), sessionName: 'x', startedAt: now - 5 * 86400000, durationSeconds: 3000, data: { rpe: 3, exercises: [{ name: 'Tractions', sets: [{ reps: 8, load: 10, done: true }, { reps: 8, load: 10, done: true }, { reps: 8, load: 10, done: true }, { reps: 8, load: 10, done: true }] }] }, ...over });
let count = 0;
for (const focus of [...Object.keys(FOCUS), 'surprise']) for (const size of Object.keys(SIZES)) for (const [label, settings] of [['pro', settingsPro], ['sans matériel', noEq], ['vide', {}]]) for (const feeling of ['frais', 'fatigue']) for (const history of [[], [mkHist()]]) {
  const { session: g, meta } = generateSession({ focus, size, feeling, seed: count * 7 + 1 }, { settings, history, now });
  count++;
  const tag = `${focus}/${size}/${label}/${feeling}`;
  assert.ok(g.exercises.length >= 5, tag + ' trop court: ' + g.exercises.length);
  const total = sessionMinutes(g), S = SIZES[size], target = S.main + S.warm + S.cool;
  assert.ok(total >= target * 0.5 && total <= target * 1.45, `${tag} durée ${total} vs cible ${target}`);
  assert.equal(new Set(g.exercises.map((e) => e.id)).size, g.exercises.length, tag + ' ids dupliqués');
  assert.ok(g.exercises.some((e) => e.block === 'warmup') && g.exercises.some((e) => e.block === 'main'), tag + ' blocs');
  for (const e of g.exercises) {
    assert.ok(e.sets >= 1 && e.rest >= 0 && e.name, tag + ' exo invalide');
    const lib = LIBRARY.find((x) => x.id === e.libId);
    if (lib && !e.libId.startsWith('wu-') && !e.libId.startsWith('cd-')) {
      const eq = settings.equipment || { wall: true };
      assert.ok(lib.needs.every((k) => eq[k]), `${tag}: ${lib.id} exige du matériel absent`);
      if (label !== 'pro') assert.ok(!(lib.risk === 'finger' && lib.intensity === 'high'), `${tag}: doigts intenses sans niveau (${lib.id})`);
      if (feeling === 'fatigue') assert.ok(lib.intensity !== 'high', `${tag}: intensité max en fatigue (${lib.id})`);
    }
  }
  assert.deepEqual(normalizeSession(g).exercises.length, g.exercises.length);
}
ok(`${count} combinaisons générées sans erreur`, () => {});

ok('même graine = même séance ; graines différentes = variété', () => {
  const a = generateSession({ focus: 'devers', size: 'moyenne', seed: 5 }, { settings: settingsPro, now }).session.exercises.map((e) => e.libId).join();
  const b = generateSession({ focus: 'devers', size: 'moyenne', seed: 5 }, { settings: settingsPro, now }).session.exercises.map((e) => e.libId).join();
  assert.equal(a, b);
  const set = new Set(); for (let i = 0; i < 12; i++) set.add(generateSession({ focus: 'devers', size: 'moyenne', seed: i }, { settings: settingsPro, now }).session.exercises.map((e) => e.libId).join());
  assert.ok(set.size >= 3, 'peu de variété: ' + set.size);
});
ok('récupération : suspensions intenses il y a 20 h → pas de séance doigts', () => {
  const h = mkHist({ startedAt: now - 20 * 3600000, data: { rpe: 3, exercises: [{ name: 'Suspensions max 10 s', libId: 'hang-max', sets: [{ seconds: 10, done: true }] }] } });
  const { session: g, meta } = generateSession({ focus: 'reglette', size: 'moyenne', seed: 3 }, { settings: settingsPro, history: [h], now });
  assert.equal(meta.focus, 'dalle'); assert.ok(g.exercises.every((e) => e.libId !== 'hang-max')); assert.match(g.notes[0].text, /48 h/);
});
ok('sans profil ni matériel : jamais de suspension max', () => {
  const { session: g } = generateSession({ focus: 'reglette', size: 'grosse', seed: 2 }, { settings: {}, now });
  assert.ok(g.exercises.every((e) => !['hang-max', 'hang-repeaters'].includes(e.libId)));
});
ok('« éviter les doigts » exclut tout exercice à risque doigts (hors échauffement neutre)', () => {
  const { session: g } = generateSession({ focus: 'perf', size: 'grosse', seed: 4 }, { settings: { ...settingsPro, avoid: { fingers: true } }, now });
  assert.ok(g.exercises.every((e) => e.risk !== 'finger'), g.exercises.filter((e) => e.risk === 'finger').map((e) => e.name).join());
});
ok('découverte : un exercice jamais fait est proposé pour le groupe le moins travaillé', () => {
  const hist = [mkHist(), mkHist({ startedAt: now - 3 * 86400000 })];
  const { session: g, meta } = generateSession({ focus: 'devers', size: 'grosse', seed: 9 }, { settings: settingsPro, history: hist, now });
  assert.ok(g.exercises.some((e) => e.isNew), 'pas de découverte'); assert.ok(meta.why.some((w) => /Découverte/.test(w)));
});
ok('échauffement adapté aux cotations de l’utilisateur', () => {
  const { session: g } = generateSession({ focus: 'perf', size: 'moyenne', seed: 1 }, { settings: settingsPro, now });
  const wc = g.exercises.find((e) => e.libId === 'wu-climb');
  if (wc) assert.match(wc.ok.join(' '), /5|6/); 
});
ok('base persistante : la dernière série devient la nouvelle prescription', () => {
  const reps = applyPerformedBase(normalizeEx({ name: 'Tractions', sets: 4, repsMin: 6, repsMax: 8, load: '+10 kg' }), { reps: 9, load: 12.5, done: true });
  assert.deepEqual([reps.repsMin, reps.repsMax, reps.load], [9, 9, '12.5 kg']);
  const time = applyPerformedBase(normalizeEx({ name: 'Gainage', mode: 'time', sets: 3, secMin: 30, secMax: 45 }), { seconds: 50, load: 0, done: true });
  assert.deepEqual([time.secMin, time.secMax], [50, 50]);
});
ok('progression : suggestion de charge quand toutes les séries sont réussies', () => {
  const ex = normalizeEx({ name: 'Tractions +10 kg', sets: 4, repsMin: 5, repsMax: 8, mode: 'reps' });
  const p = progressHint(ex, [mkHist()]); assert.ok(p); assert.match(p.next, /12.5 kg/);
});
ok('swapExercise remplace par une alternative compatible', () => {
  const { session: g } = generateSession({ focus: 'devers', size: 'moyenne', seed: 1 }, { settings: settingsPro, now });
  const target = g.exercises.find((e) => e.block === 'main' && e.libId === 'pullup') || g.exercises.find((e) => e.block === 'main');
  const g2 = swapExercise(g, target.id, { settings: settingsPro });
  assert.equal(g2.exercises.length, g.exercises.length);
});
ok('levelFrom', () => { assert.equal(levelFrom({}), 0); assert.equal(levelFrom({ level: { boulderMax: '7A', years: 5 } }), 2); assert.equal(levelFrom({ level: { boulderMax: '6C', years: 0.5 } }), 0); assert.equal(levelFrom({ level: { boulderMax: '6A', years: 3 } }), 1); });
ok('les séances futures sont ignorées par les statistiques', () => {
  const future = now + 2 * 86400000;
  const H = [mkHist({ startedAt: future }), mkHist({ startedAt: now - 3600000 })];
  const r = summarizeHistory(H, now); assert.equal(r.sessions7, 1); assert.equal(r.streak, 1);
  const loads = groupLoads(H, now, 30); assert.ok(Object.values(loads.groups).reduce((a,b)=>a+b,0) > 0);
  const a = analyze(H, now); assert.equal(a.n7, 1); assert.ok(a.hoursSinceAny >= 0);
});
ok('summarizeHistory : streak, semaines, records', () => {
  const H = [mkHist({ startedAt: now - 3600000 }), mkHist({ startedAt: now - 86400000 - 3600000 }), mkHist({ startedAt: now - 20 * 86400000 })];
  const r = summarizeHistory(H, now); assert.equal(r.streak, 2); assert.equal(r.weekly.length, 8); assert.equal(r.sessions30, 3); assert.equal(r.records[0].value, 10);
});
console.log('Que faire aujourd’hui ?');
ok('un événement du jour passe en premier, avec sa raison', () => {
  const r = suggestToday({ settings: {}, history: [mkHist({ startedAt: now - 5 * 86400000 })], todayEvents: [{ id: 'e1', title: 'Séance jambes', completed: false }], now });
  assert.equal(r.options[0].kind, 'event');
  assert.equal(r.options[0].title, 'Séance jambes');
  assert.match(r.options[0].reason, /calendrier/);
});
ok('un événement déjà fait aujourd’hui n’est pas reproposé', () => {
  const r = suggestToday({ settings: {}, history: [], todayEvents: [{ id: 'e1', title: 'Fait', completed: true }], now });
  assert.ok(!r.options.some((o) => o.kind === 'event'));
});
ok('aucun historique : une seule proposition prudente, sans forme du jour présumée', () => {
  const r = suggestToday({ settings: {}, history: [], now });
  assert.equal(r.dataLevel, 'none');
  assert.equal(r.options.length, 1);
  assert.equal(r.options[0].feeling, 'normal');
  assert.equal(r.options[0].size, 'petite');
});
ok('séance très récente (<20h) : le repos est proposé', () => {
  const r = suggestToday({ settings: {}, history: [mkHist({ startedAt: now - 10 * 3600000 })], now });
  assert.ok(r.options.some((o) => o.kind === 'rest'));
});
ok('dernière séance dure et récente : une version allégée est proposée en plus de la normale', () => {
  const r = suggestToday({ settings: {}, history: [mkHist({ startedAt: now - 30 * 3600000, data: { rpe: 5, exercises: [] } })], now });
  assert.ok(r.options.some((o) => o.id === 'gen:leger' && o.feeling === 'fatigue'));
  assert.ok(r.options.some((o) => o.id === 'gen:normal'));
});
ok('jamais plus de 3 options', () => {
  const r = suggestToday({ settings: {}, history: [mkHist({ startedAt: now - 30 * 3600000, data: { rpe: 5, exercises: [] } })], todayEvents: [{ id: 'e1', title: 'A', completed: false }, { id: 'e2', title: 'B', completed: false }], now });
  assert.ok(r.options.length <= 3);
});

console.log(`\n${n} tests OK`);
