// tests/coachbrain.test.mjs — le coach qui apprend : forme et fatigue, prêt du jour (check-in, pouls, douleurs),
// plateaux et pistes, équilibre pousser / tirer, règles apprises (repos, sommeil, stress), charge par zone,
// douleurs et reprise, prévisions avec fourchette. Toujours à partir des données de la personne, rien d'inventé.
import assert from 'node:assert/strict';
import * as C from '../public/coachbrain.js';
import { buildContext } from '../public/brain.js';
import { cleanItem } from '../public/items.js';
import { planSession } from '../public/generator.js';
import { todayOptions } from '../public/brain.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const DAY = 86400000, now = Date.UTC(2026, 9, 2, 9, 0, 0);
const at = (days, hour = 18) => { const d = new Date(now - days * DAY); d.setUTCHours(hour, 0, 0, 0); return d.getTime(); };
const ses = (id, days, { rpe = 3, min = 45, ex = [], hour = 18 } = {}) => ({ id, sessionName: 'Séance', startedAt: at(days, hour), durationSeconds: min * 60, data: { rpe, exercises: ex } });
const sets = (k) => Array.from({ length: k }, () => ({ reps: 8, done: true }));
const it = (c, id, d, u = 1) => ({ c, id, d, u });
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ctxOf = (history = [], items = []) => buildContext({ history, items, now });

console.log('Coach qui apprend');
ok('forme / fatigue : un gros bloc fait monter la fatigue au-dessus de la forme, le repos la fait redescendre', () => {
  assert.equal(C.fitnessFatigue([], now).enough, false);
  const block = Array.from({ length: 10 }, (_, i) => ses('b' + i, i, { rpe: 4, min: 75 }));
  const tired = C.fitnessFatigue(block, now); assert.ok(tired.enough); assert.ok(tired.form < 0, `fraîcheur ${tired.form}`);
  const rested = C.fitnessFatigue(block.map((h) => ({ ...h, startedAt: h.startedAt - 12 * DAY })), now);
  assert.ok(rested.form > tired.form, 'plus frais après 12 jours de repos'); assert.equal(rested.series.length, 60);
});
ok('prêt du jour : séances dures, douleur, nuit courte → fatigué, avec chaque raison', () => {
  const h = [ses('a', 0.5, { rpe: 5 }), ses('b', 1.2, { rpe: 4 }), ...Array.from({ length: 6 }, (_, i) => ses('o' + i, 3 + i * 3))];
  const c = ctxOf(h, [it('pain', 'p1', { zone: 'shoulders', level: 5, date: now - DAY }), it('wellness', 'wb-1', { day: day(now), at: now - 3600000, sleep: 5, energy: 2, soreness: 4, stress: 2 })]);
  const r = C.readiness(c); assert.equal(r.level, 'low'); assert.equal(r.word, 'Fatigué'); assert.ok(r.checked);
  const why = r.why.join(' '); assert.match(why, /séances dures/); assert.match(why, /épaules/); assert.match(why, /Nuit courte \(5 h\)/); assert.match(why, /Énergie basse/);
  const fresh = C.readiness(ctxOf(Array.from({ length: 6 }, (_, i) => ses('f' + i, 14 + i * 2, { rpe: 3 })), [it('wellness', 'wb-2', { day: day(now), at: now - 3600000, sleep: 8, energy: 5 })]));
  assert.equal(fresh.level, 'top'); assert.match(fresh.why.join(' '), /Bien dormi/);
  const none = C.readiness(ctxOf([ses('x', 2)])); assert.equal(none.checked, false); assert.match(none.why[0], /peu de séances/);
});
ok('pouls au repos : comparé à ta médiane des 30 derniers jours (5 mesures au moins)', () => {
  const W = [60, 58, 61, 59, 60].map((hr, i) => ({ day: `2026-09-${20 + i}`, at: now - (8 - i) * DAY, hr }));
  const today = { day: day(now), at: now, hr: 68 };
  assert.deepEqual([C.restingHr([...W, today], today).delta, C.restingHr([...W, today], today).base], [8, 60]);
  assert.equal(C.restingHr(W.slice(0, 3), today).delta, null, 'pas assez de mesures');
  const r = C.readiness(ctxOf([], [...W.map((w, i) => it('wellness', 'w' + i, w)), it('wellness', 'wt', today)])); assert.match(r.why.join(' '), /Pouls au repos plus haut/);
});
ok('plateau : 6 semaines sans progrès → 3 pistes ; un progrès réel → pas de plateau', () => {
  const perf = (id, v, d) => it('perf', `p-${id}-${d}`, { metricId: id, value: v, date: now - d * DAY, source: 'measured' });
  const flat = ctxOf([], [perf('max_tractions', 10, 90), perf('max_tractions', 10, 60), perf('max_tractions', 10, 20), perf('max_tractions', 10, 5)]);
  const p = C.plateaus(flat); assert.equal(p.length, 1); assert.equal(p[0].metricId, 'max_tractions'); assert.equal(p[0].ideas.length, 3);
  const up = ctxOf([], [perf('max_tractions', 10, 90), perf('max_tractions', 10, 60), perf('max_tractions', 12, 10)]); assert.deepEqual(C.plateaus(up), []);
  const doigts = C.plateaus(ctxOf([], [perf('suspension_20mm', 20, 80), perf('suspension_20mm', 20, 50), perf('suspension_20mm', 19, 3)])); assert.match(doigts[0].ideas.join(' '), /protocole/);
  const mensur = C.plateaus(ctxOf([], [perf('tour_bras', 35, 90), perf('tour_bras', 35, 60), perf('tour_bras', 35, 5)])); assert.deepEqual(mensur, [], 'une mensuration n’est pas un « plateau d’entraînement »');
});
ok('équilibre pousser / tirer sur 4 semaines', () => {
  const pull = (d) => ses('t' + d, d, { ex: [{ name: 'Tractions', libId: 'pullup', sets: sets(5) }] }), push = (d) => ses('p' + d, d, { ex: [{ name: 'Pompes', libId: 'pushup', sets: sets(2) }] });
  const b = C.muscleBalance(ctxOf([pull(1), pull(4), pull(8), push(9)])); assert.ok(b.unbalanced); assert.match(b.text, /ajoute des pompes/);
  assert.equal(C.muscleBalance(ctxOf([pull(1)])).ratio, null, 'pas assez de séries pour conclure');
  const even = C.muscleBalance(ctxOf([pull(1), ses('pp', 2, { ex: [{ name: 'Pompes', libId: 'pushup', sets: sets(5) }] }), pull(5), ses('pq', 6, { ex: [{ name: 'Dips', libId: 'dips', sets: sets(5) }] })])); assert.equal(even.unbalanced, false);
});
ok('règles apprises : repos avant la séance, sommeil et stress du check-in (3 séances de chaque côté au moins)', () => {
  const h = []; let d = 60;
  for (let i = 0; i < 5; i++) { h.push(ses('r' + i, d, { rpe: 2 })); d -= 1; h.push(ses('c' + i, d, { rpe: 4 })); d -= 3; } // facile après 3 jours, dur le lendemain
  const r = C.learnedRules(ctxOf(h)); assert.ok(r.rules.some((x) => /Après 2 jours de repos ou plus, tes séances te semblent plus faciles/.test(x)), r.rules.join(' | '));
  assert.deepEqual(C.learnedRules(ctxOf(h.slice(0, 5))).rules, [], 'moins de 8 séances : rien affirmé');
  const W = h.map((x, i) => it('wellness', 'w' + i, { day: day(x.startedAt), at: x.startedAt - 8 * 3600000, sleep: x.data.rpe >= 4 ? 5.5 : 8, stress: 2 }));
  const s = C.learnedRules(ctxOf(h, W)); assert.ok(s.rules.some((x) => /nuit de moins de 7 h/.test(x)), s.rules.join(' | '));
  assert.ok(!s.rules.some((x) => /règles/.test(x)), 'cycle : jamais sans activation');
});
ok('charge par zone : une semaine de doigts bien au-dessus des 4 précédentes → alerte de surcharge', () => {
  const hang = (id, d, k) => ses(id, d, { ex: [{ name: 'Suspensions', libId: 'hang-max', sets: sets(k) }] });
  const h = [hang('a', 1, 12), hang('b', 3, 12), ...[9, 13, 17, 21, 25, 29, 33].map((d) => hang('o' + d, d, 4))];
  const z = C.zoneLoad(ctxOf(h)); assert.equal(z[0]?.zone, 'fingers'); assert.match(z[0].text, /doigts : 24 séries/);
  assert.ok(C.readiness(ctxOf(h)).why.some((x) => /⚠️ doigts/.test(x)), 'affichée dans la forme du jour');
});
ok('douleurs : zones actives (7 jours, 3/10 ou plus), étapes de reprise, guérison', () => {
  const P = [{ zone: 'shoulders', level: 6, date: now - 2 * DAY }, { zone: 'knees', level: 2, date: now - 20 * DAY }, { zone: 'knees', level: 1, date: now - 10 * DAY }, { zone: 'knees', level: 1, date: now - 6 * DAY }, { zone: 'knees', level: 0, date: now - DAY }];
  const t = C.painTrend(P, now), sh = t.find((x) => x.zone === 'shoulders'), kn = t.find((x) => x.zone === 'knees');
  assert.equal(sh.step, 0); assert.equal(kn.step, 3, 'trois notes calmes en 14 jours → retour à la normale'); assert.equal(kn.dir, -1);
  assert.deepEqual(C.activePains(P, now).map((x) => x.zone), ['shoulders']);
  assert.deepEqual(C.activePains([...P, { zone: 'shoulders', level: 0, date: now - 3600000, healed: true }], now), [], 'guérie : plus ménagée');
  assert.deepEqual(C.painToUpdate([{ zone: 'back', level: 4, date: now - 9 * DAY }], now).map((x) => x.zone), ['back'], 'on demande des nouvelles');
  assert.equal(C.RETURN_STEPS.length, 4);
});
ok('prévision : rythme par semaine, date estimée avec fourchette et confiance ; rien sans données', () => {
  const pts = Array.from({ length: 8 }, (_, i) => it('perf', 'f' + i, { metricId: 'max_tractions', value: 6 + i + (i % 2 ? 0.3 : -0.3), date: now - (7 - i) * 7 * DAY, source: 'measured' }));
  const f = C.forecast(ctxOf([], pts), 'max_tractions', { target: 16 }); assert.ok(f.enough); assert.ok(Math.abs(f.perWeek - 1) < 0.15, `rythme ${f.perWeek}`);
  assert.equal(f.confidence, 'bonne'); assert.ok(f.eta > now && f.eta < now + 5 * 7 * DAY, 'environ 3 semaines'); assert.ok(f.etaRange[0] <= f.eta && f.etaRange[1] >= f.eta); assert.match(f.text, /par semaine/);
  assert.equal(C.forecast(ctxOf([], pts), 'max_tractions', { target: 5 }).reached, true);
  const dl = C.forecast(ctxOf([], pts), 'max_tractions', { deadline: '2026-10-30' }); assert.ok(dl.atDeadline > 13 && dl.atDeadline < 18, `${dl.atDeadline}`);
  assert.equal(C.forecast(ctxOf([], pts.slice(0, 2)), 'max_tractions', { target: 16 }).enough, false);
  const down = pts.map((p, i) => ({ ...p, d: { ...p.d, value: 14 - i } })); assert.match(C.forecast(ctxOf([], down), 'max_tractions', { target: 20 }).text, /pas en vue/);
});
ok('données : douleur et check-in nettoyés par le serveur (schéma), valeurs impossibles bornées', () => {
  const p = cleanItem({ c: 'pain', id: 'pn-1', u: 1, d: { zone: 'shoulders', level: 14, side: 'droite', when: 'effort', note: '<b>aïe</b>', date: 5, pirate: 1 } });
  assert.deepEqual(Object.keys(p.d).sort(), ['date', 'healed', 'level', 'note', 'side', 'when', 'zone']); assert.equal(p.d.level, 10);
  assert.equal(cleanItem({ c: 'pain', id: 'pn-2', u: 1, d: { zone: 'cerveau' } }).d.zone, 'other');
  const w = cleanItem({ c: 'wellness', id: 'wb-2026-10-02', u: 1, d: { day: '2026-10-02', at: 9, sleep: 30, energy: 9, hr: 10, period: 1 } });
  assert.deepEqual([w.d.sleep, w.d.energy, w.d.hr, w.d.period], [16, 5, 25, true]);
  assert.equal(cleanItem({ c: 'wellness', id: 'x', u: 1, d: { day: 'demain' } }).d.day, '');
});
ok('générateur : douleur notée → zone ménagée d’office (sauf choix explicite) ; déséquilibre → raison et rééquilibrage', () => {
  const c = ctxOf([], [it('pain', 'p1', { zone: 'shoulders', level: 5, date: now - DAY })]);
  const p = planSession({ activityId: 'strength', minutes: 40, seed: 3 }, c); assert.deepEqual(p.avoidZones, ['shoulders']); assert.match(p.bodyReasons.join(' '), /Douleur notée récemment \(épaules\)/);
  assert.deepEqual(planSession({ activityId: 'strength', minutes: 40, seed: 3, avoidZones: [] }, c).avoidZones, [], 'décoché par la personne : respecté');
  const pull = (d) => ses('t' + d, d, { ex: [{ name: 'Tractions', libId: 'pullup', sets: sets(6) }, { name: 'Rowing', libId: 'inverted-row', sets: sets(4) }] });
  const b = planSession({ activityId: 'strength', minutes: 40, seed: 3 }, ctxOf([pull(1), pull(3), pull(6), pull(9)]));
  assert.match(b.bodyReasons.join(' '), /⚖️ Que du tirage/); assert.ok(b.distribution.some((d) => /poussee/.test(d.capId)), b.distribution.map((d) => d.capId).join(','));
});
ok('« Que faire aujourd’hui ? » : check-in fatigué → la version légère passe en premier, et la note le dit', () => {
  const c = ctxOf([ses('a', 3, { rpe: 3 })], [it('wellness', 'wb', { day: day(now), at: now - 3600000, sleep: 4, energy: 1, soreness: 5 })]);
  const t = todayOptions(c); assert.equal(t.options[0].light, true); assert.match(t.note, /check-in/);
  assert.match(todayOptions(ctxOf([ses('a', 3)])).note, /check-in du matin/);
});
console.log(`\n${n} tests du coach OK`);
