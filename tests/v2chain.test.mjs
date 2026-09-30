// tests/v2chain.test.mjs — V2 : intentions structurées, filtres multi-niveaux, budget / lieux / transitions,
// objectif placé à n'importe quel moment, chaîne de paramètres selon le type de phase.
import assert from 'node:assert/strict';
import { subIntents, subIntentsFor, cleanSelection, cleanRules, intentCaps } from '../public/intents.js';
import { effectiveFilters, intersect, filtersFor, cleanLevel, filterText } from '../public/filters.js';
import { resolvePlaces, transitions, budget } from '../public/budget.js';
import { placeObjective, cleanObjective, chainFor, chainStatus, paramsFor } from '../public/sessionchain.js';
import { normalizePhases, normalizePhase } from '../public/phase.js';
import { LIBRARY } from '../public/library.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

ok('intentions : sous-objectifs structurés, filtrés par activité, extensibles par l’admin', () => {
  const t = subIntentsFor('climbing_route');
  assert.ok(t.technique.some((s) => s.id === 'technique.placement')); assert.ok(!t.technique.some((s) => s.id === 'technique.technique_course'));
  assert.ok(!subIntentsFor('running').technique.some((s) => s.id === 'technique.placement'));
  const all = subIntents([{ family: 'technique', key: 'talons', label: 'Talons', caps: { technique_pieds: 1, faux: 1 } }, { family: 'inconnue', key: 'x', caps: { equilibre: 1 } }]);
  assert.deepEqual(all['technique.talons'].caps, { technique_pieds: 1 }); assert.ok(all['technique.talons'].admin); assert.equal(Object.keys(all).filter((k) => k.startsWith('inconnue')).length, 0);
});
ok('priorités 1–4 et règle « la puissance ne prend jamais le dessus sur la technique »', () => {
  const sel = cleanSelection([{ id: 'technique.placement', prio: 2 }, { id: 'puissance.haut', prio: 4 }, { id: 'faux.x', prio: 3 }, { id: 'technique.placement', prio: 1 }]);
  assert.deepEqual(sel.map((s) => s.id), ['technique.placement', 'puissance.haut']);
  const rules = cleanRules([{ over: 'technique', under: 'puissance' }, { over: 'x', under: 'y' }], sel); assert.equal(rules.length, 1);
  const free = intentCaps(sel).caps, ruled = intentCaps(sel, rules);
  assert.ok(free.puissance_haut > free.technique_escalade, 'sans règle la puissance domine');
  assert.ok(ruled.caps.puissance_haut < ruled.caps.technique_escalade, 'avec la règle elle passe dessous'); assert.match(ruled.why[0], /ramené sous/);
});
ok('filtres : contextuels par activité, hérités séance → phase → exercice (garder, préciser, remplacer, retirer)', () => {
  assert.ok(filtersFor('climbing_route').includes('longueur')); assert.ok(!filtersFor('climbing_boulder').includes('longueur')); assert.ok(filtersFor('strength').includes('muscle')); assert.ok(!filtersFor('running').includes('style'));
  const g = { intensite: { mode: 'replace', value: 'mod' }, materiel: { mode: 'replace', value: ['bar', 'band'] } };
  const ph = { materiel: { mode: 'refine', value: ['bar'] }, intensite: { mode: 'keep' } };
  const ex = { intensite: { mode: 'replace', value: 'hard' } };
  const r = effectiveFilters([g, ph, ex]);
  assert.deepEqual(r.filters, { intensite: 'hard', materiel: ['bar'] }); assert.equal(r.origin.materiel, 'précisé (phase)'); assert.equal(r.conflicts.length, 0);
  const bad = effectiveFilters([g, { materiel: { mode: 'refine', value: ['hangboard'] } }]); assert.match(bad.conflicts[0].text, /sort du filtre hérité/);
  assert.equal(effectiveFilters([g, { materiel: { mode: 'remove' } }]).filters.materiel, undefined);
  assert.equal(effectiveFilters([g, { materiel: { mode: 'remove' } }], { allowRemove: false }).conflicts.length, 1);
  assert.deepEqual(cleanLevel({ inconnu: { value: 1 }, style: { value: ['st-devers', 'faux'] } }), { style: { mode: 'replace', value: ['st-devers'] } });
  assert.match(filterText({ cotation: { min: 5, max: 8 } })[0], /Cotation : 5 → 8/);
});
ok('intersection de toutes les contraintes : incompatibilité signalée et filtres à relâcher proposés', () => {
  const f = { materiel: ['none'], mouvement: ['tirer'], intensite: 'max' };
  const r = intersect(LIBRARY, f); assert.equal(r.incompatible, true); assert.ok(r.relax.length); assert.ok(r.relax.every((x) => x.gain > 0));
  const c = intersect(LIBRARY, { intensite: 'easy' }, { subIntents: [{ id: 'performance.limite' }], constraints: { noFailure: true } });
  assert.equal(c.contradictions.length, 2);
  assert.ok(intersect(LIBRARY, { mouvement: ['gainage'] }).count > 0);
});
const envs = [{ id: 'a', name: 'Salle A', equipment: ['wall', 'hangboard', 'bar'] }, { id: 'b', name: 'Salle B', equipment: ['wall'] }, { id: 'h', name: 'Maison', equipment: ['bar', 'band'] }];
ok('lieu par phase : même lieu, autre lieu, libre ; déplacement compté dans le budget', () => {
  const ph = normalizePhases([{ type: 'climb', kind: 'bloc', minutes: 120, intensity: 'hard' }, { type: 'pause', minutes: 30 }, { type: 'climb', kind: 'voie', minutes: 120, role: 'perf', intensity: 'max', place: { mode: 'other', envId: 'b', travelMin: 15 } }]);
  const pl = resolvePlaces(ph, envs, 'a'); assert.deepEqual(pl.map((x) => x.name), ['Salle A', 'Salle A', 'Salle B']);
  const tr = transitions(ph, envs, 'a'); assert.equal(tr.find((t) => t.to === 2).travel, 15);
  const b = budget(ph, 270, tr); assert.equal(b.needed, 285); assert.equal(b.over, 15); assert.match(b.text, /nécessitent 285 min pour 270 min disponibles/);
  assert.ok(b.sacrifice.length && b.sacrifice.every((s) => s.text && s.compromise)); assert.equal(b.sacrifice[0].index, 1, 'la pause est sacrifiée en premier');
  assert.equal(budget(ph, 300, tr).over, 0);
});
ok('transitions : matériel non transportable, déplacement non renseigné, intense → performance', () => {
  const ph = normalizePhases([{ type: 'fingers', minutes: 20, activity: 'climbing_boulder', intensity: 'hard' }, { type: 'fingers', minutes: 15, activity: 'climbing_boulder', place: { mode: 'other', envId: 'h' } }, { type: 'climb', kind: 'voie', minutes: 60, role: 'perf', intensity: 'max', place: { mode: 'other', envId: 'b', travelMin: 10 } }]);
  const tr = transitions(ph, envs, 'a'), kinds = tr.flatMap((t) => t.issues.map((x) => x.kind));
  assert.ok(kinds.includes('transport')); assert.ok(kinds.includes('travel-missing')); assert.ok(kinds.includes('material'));
  const t2 = transitions(normalizePhases([{ type: 'climb', kind: 'bloc', minutes: 60, intensity: 'max' }, { type: 'climb', kind: 'voie', minutes: 60, role: 'perf', intensity: 'max' }]), envs, 'a');
  assert.ok(t2[0].issues.some((x) => x.kind === 'recovery' && x.proposal.type === 'pause'));
});
const base = () => normalizePhases([{ id: 'w', type: 'warmup', minutes: 15 }, { id: 'b', type: 'climb', kind: 'bloc', minutes: 60, intensity: 'mod' }, { id: 'v', type: 'climb', kind: 'voie', minutes: 60, intensity: 'mod' }, { id: 'c', type: 'cool', minutes: 10 }]);
ok('objectif de séance placé au début, au milieu, à la fin, sur une phase précise ou partout', () => {
  const obj = { family: 'performance', subIntents: [{ id: 'performance.limite', prio: 4 }] };
  const end = placeObjective(base(), { ...obj, when: 'end' });
  assert.equal(end.phases[end.index].role, 'perf'); assert.equal(end.phases.at(-1).id, 'c', 'le retour au calme reste à la fin'); assert.equal(end.phases[end.index].intensity, 'max');
  assert.deepEqual(end.phases[end.index].subIntents, [{ id: 'performance.limite', prio: 4 }]);
  const start = placeObjective(base(), { ...obj, when: 'start' }); assert.equal(start.phases[0].id, 'w'); assert.equal(start.index, 1, 'juste après l’échauffement');
  const onB = placeObjective(base(), { ...obj, when: 'ph:b' }); assert.equal(onB.phases[onB.index].id, 'b'); assert.equal(onB.index, 1, 'phase choisie, pas déplacée');
  const all = placeObjective(base(), { family: 'technique', subIntents: [{ id: 'technique.placement', prio: 3 }], when: 'all' });
  assert.equal(all.phases.filter((p) => p.objective).length, 2); assert.ok(all.phases.filter((p) => p.objective).every((p) => p.role === 'technique'));
  assert.equal(cleanObjective({ family: 'faux' }), null); assert.equal(cleanObjective({ family: 'force', when: '??' }).when, 'end');
  assert.deepEqual(cleanObjective({ family: 'force', subIntents: [{ id: 'technique.placement' }] }).subIntents, [], 'sous-objectif d’une autre famille ignoré');
});
ok('objectif : un verrou n’est jamais modifié en silence', () => {
  const ph = base(); ph[1].locks = { ...ph[1].locks, intensity: 'user', order: 'user' }; ph[1].intensity = 'easy'; ph[2].locks = { ...ph[2].locks, goal: 'user' };
  const r = placeObjective(ph, { family: 'performance', when: 'start' });
  const p = r.phases.find((x) => x.objective);
  if (p.id === 'b') { assert.equal(p.intensity, 'easy', 'intensité verrouillée gardée'); assert.match(r.notes.join(' '), /Ordre verrouillé/); }
  const locked = r.phases.find((x) => x.id === 'v'); if (locked.objective) assert.notEqual(locked.role, 'perf');
});
ok('chaîne de paramètres selon le type de phase', () => {
  assert.deepEqual(chainFor(normalizePhase({ type: 'pause', minutes: 10 })), ['type', 'intensite', 'lieu']);
  const v = normalizePhase({ type: 'climb', kind: 'voie', minutes: 60 }); assert.equal(chainFor(v).length, 8);
  const pv = paramsFor(v); assert.equal(pv.activity, 'climbing_route'); assert.ok(pv.filters.includes('longueur')); assert.ok(pv.subs.technique.length);
  const pr = paramsFor(normalizePhase({ type: 'main', activity: 'strength', minutes: 30 })); assert.ok(pr.filters.includes('muscle')); assert.ok(!pr.filters.includes('style'));
  const st = chainStatus(v); assert.match(st.text, /\/8 réglés/); assert.ok(st.next);
});
console.log(`${n} tests V2 (chaîne, intentions, filtres, budget) OK`);
