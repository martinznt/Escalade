// tests/routines.test.mjs — « Mes moments » : proposés au bon endroit, adaptés à la séance (durée, doigts déjà chargés,
// séance dure récente, matériel du lieu), insérés sans changer la durée totale ; conseils spray wall d'après l'historique.
import assert from 'node:assert/strict';
import * as R from '../public/routines.js';
import { byId } from '../public/library.js';
import { normalizePhases } from '../public/phase.js';
import { buildFromParts } from '../public/climbplan.js';
import { it, act, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
console.log('Mes moments et spray wall');
const now = Date.UTC(2026, 9, 3, 18);
const P = (list) => normalizePhases(list, 'climbing_boulder');
const base = P([{ type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', intensity: 'max', minutes: 60, goal: 'Blocs à la limite' }, { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30 }, { type: 'cool', minutes: 10 }]);
const mk = (key, extra = {}) => { const { key: k, ...d } = R.ROUTINE_PRESETS.find((x) => x.key === key); return { id: k, ...d, ...extra }; };
const eq = new Set(['wall', 'band', 'spraywall']);
ok('modèles : chaque exercice lié existe', () => { for (const p of R.ROUTINE_PRESETS) assert.ok(byId(p.libId), p.libId); for (const id of ['spray-limit', 'spray-silent', 'no-foot']) assert.ok(byId(id), id); });
ok('placement : élastiques après l’échauffement, no foot avant le retour au calme, étirements tout à la fin', () => {
  const s = R.suggestRoutines([mk('elastique'), mk('nofoot'), mk('etirements')], base, { sports: ['climbing_boulder'], eq, minutes: 115, now });
  assert.equal(s.find((x) => x.r.id === 'elastique').at, 1); assert.equal(s.find((x) => x.r.id === 'nofoot').at, 3); assert.equal(s.find((x) => x.r.id === 'etirements').at, 4);
});
ok('adapté : no foot après une phase max → effort baissé et dit', () => {
  const x = R.suggestRoutines([mk('nofoot')], base, { sports: ['climbing_boulder'], eq, minutes: 115, now })[0];
  assert.equal(x.effort, 'mod'); assert.match(x.reasons.join(' '), /déjà travaillé dur/); assert.equal(x.phase.intensity, 'mod');
});
ok('adapté : séance dure pour les doigts il y a 20 h → facile ; séance courte → moment raccourci', () => {
  const hist = [{ startedAt: now - 20 * 3600e3, sessionName: 'Bloc max', data: { exercises: [{ libId: 'limit-boulders', group: 'doigts', intensity: 'high' }] } }];
  const easy = P([{ type: 'warmup', minutes: 10 }, { type: 'climb', kind: 'bloc', intensity: 'easy', minutes: 30 }]);
  const x = R.suggestRoutines([mk('nofoot')], easy, { sports: ['climbing_boulder'], eq, minutes: 40, history: hist, now })[0];
  assert.equal(x.effort, 'easy'); assert.match(x.reasons.join(' '), /20 h/); assert.ok(x.minutes <= 5, String(x.minutes));
});
ok('matériel absent ou autre sport : pas ajouté en silence', () => {
  const s = R.suggestRoutines([mk('spray'), mk('nofoot')], base, { sports: ['climbing_boulder'], eq: new Set(['wall']), minutes: 115, now });
  assert.equal(s.find((x) => x.r.id === 'spray').ok, false); assert.match(s.find((x) => x.r.id === 'spray').missing[0], /Spray wall/);
  assert.equal(R.suggestRoutines([mk('nofoot')], base, { sports: ['running'], eq, minutes: 60, now }).length, 0);
  assert.equal(R.suggestRoutines([mk('nofoot', { off: true })], base, { sports: ['climbing_boulder'], eq, now }).length, 0);
});
ok('insertion : durée totale gardée (prise sur la plus longue phase), puis plus proposé ; exercice construit', () => {
  const x = R.suggestRoutines([mk('nofoot')], base, { sports: ['climbing_boulder'], eq, minutes: 115, now })[0];
  const r = R.insertRoutine(base, x), ph = P(r.phases);
  assert.equal(ph.reduce((t, p) => t + p.minutes, 0), 115); assert.equal(r.took.minutes, 15); assert.equal(ph[3].type, 'routine'); assert.equal(ph[3].routineId, 'nofoot');
  assert.equal(R.suggestRoutines([mk('nofoot')], ph, { sports: ['climbing_boulder'], eq, now }).length, 0);
  const ctx = ctxOf({ items: [act('climbing_boulder')] }), s = buildFromParts(ph, ctx, {});
  const e = s.exercises.find((y) => y.libId === 'no-foot'); assert.ok(e, 'exercice lié'); assert.match(e.note, /déjà travaillé dur/);
  const free = buildFromParts(P([{ type: 'routine', goal: 'Mon truc', minutes: 12, role: 'custom', roleLabel: 'Mon truc' }]), ctx, {});
  assert.equal(free.exercises[0].name, 'Mon truc'); assert.equal(free.exercises[0].secMax, 720);
});
const H = (days, ex) => ({ startedAt: now - days * 864e5, sessionName: 'S', data: { exercises: ex } });
ok('spray wall : reprise sans escalade, récupération après une séance dure, sinon la qualité la moins travaillée', () => {
  assert.equal(R.sprayAdvice([], now).focus, 'reprise');
  assert.equal(R.sprayAdvice([H(1, [{ libId: 'limit-boulders', group: 'doigts', intensity: 'high' }])], now).focus, 'recup');
  const tech = [H(4, [{ libId: 'x', group: 'doigts', intensity: 'mod', caps: { technique_escalade: 1, technique_pieds: 1, endurance_doigts: 0.8 } }])];
  assert.equal(R.sprayAdvice(tech, now).focus, 'puissance');
  assert.equal(R.sprayAdvice(tech, now, { after: base }).focus, 'recup', 'après une phase max dans la séance');
  const lastPow = [...tech, H(3, [{ libId: 'spray-limit', group: 'doigts', intensity: 'mod' }])];
  assert.notEqual(R.sprayAdvice(lastPow, now).focus, 'puissance', 'pas deux fois le même type de suite');
  assert.match(R.sprayAdvice(lastPow, now).why, /1 séance de spray wall en 30 jours, la dernière en puissance/);
});
console.log(`\n${n} tests des moments OK`);
