// tests/choices.test.mjs — « ＋ Ajouter le mien » : un choix écrit est reconnu quand l'app le connaît déjà (il coche le
// sien, avec son effet réel), sinon il est gardé tel quel, nommé partout, avec seulement l'effet que l'app peut tenir.
import assert from 'node:assert/strict';
const C = await import('../public/choices.js');
const { EQUIPMENT } = await import('../public/model.js');
const { AVOID_ZONES } = await import('../public/intentions.js');
const { PHYSIQUE, physiqueGroups } = await import('../public/physique.js');
const { FALL_WHY, fallTraining } = await import('../public/sports.js');
const { ZONES, cleanBody } = await import('../public/body-rules.js');
const { cleanItem } = await import('../public/items.js');
const { normalizeSession } = await import('../public/shared.js');
const { adaptSession, parseAdapt } = await import('../public/adapt.js');
const G = await import('../public/generator.js');
const { act, env, ctxOf, it } = await import('./fixtures.mjs');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

console.log('Mes ajouts aux listes');
ok('un choix qui existe déjà dans l’app coche le sien (pas de doublon)', () => {
  assert.deepEqual(C.resolveChoice('zone', 'poignet droit'), { builtin: true, key: 'wrists', label: 'Poignets' });
  assert.equal(C.resolveChoice('zone', 'Genoux').key, 'knees');
  assert.equal(C.resolveChoice('zone', 'bas du dos').key, 'back');
  assert.equal(C.resolveChoice('equipment', 'Corde à sauter').key, 'rope');
  assert.equal(C.resolveChoice('equipment', 'haltère').key, 'weights', 'une partie du libellé, au singulier');
  assert.equal(C.resolveChoice('envie', 'cardio', { builtins: [['endurance', '🔋 Cardio, endurance']] }).key, 'endurance');
  assert.equal(C.resolveChoice('fall', 'peur').key, 'peur');
});
ok('sinon il est gardé tel quel, et un ajout déjà fait n’est pas recréé', () => {
  assert.deepEqual(C.resolveChoice('zone', '  Hanche   gauche '), { label: 'Hanche gauche' });
  assert.deepEqual(C.resolveChoice('zone', 'dos de la main'), { label: 'dos de la main' }, 'pas confondu avec le dos');
  assert.deepEqual(C.resolveChoice('equipment', 'TRX'), { label: 'TRX' });
  const mine = [{ id: 'my-1', list: 'zone', label: 'Hanche gauche' }];
  assert.deepEqual(C.resolveChoice('zone', 'hanche GAUCHE', { mine }), { existing: true, key: 'my-1', label: 'Hanche gauche' });
  assert.match(C.resolveChoice('zone', 'x').error, /deux lettres/);
  const full = Array.from({ length: C.MAX_PER_LIST }, (_, i) => ({ id: 'my-' + i, list: 'equipment', label: 'Truc ' + i }));
  assert.match(C.resolveChoice('equipment', 'Encore un', { mine: full }).error, /Mes ajouts/);
  assert.equal(C.cleanLabel('a\u0000b\n c'.padEnd(80, 'x')).length, 40);
});
ok('durées écrites : minutes ou heures, jusqu’à 5 h', () => {
  for (const [t, v] of [['75', 75], ['75 min', 75], ['1 h 15', 75], ['1h30', 90], ['1,5 h', 90], ['2 heures', 120], ['300', 300]]) assert.equal(C.minutesOf(t), v, t);
  for (const t of ['0', '301', 'six', '1 h 99 x', '']) assert.equal(C.minutesOf(t), null, t);
  assert.equal(C.fmtMinutes(75), '1 h 15'); assert.equal(C.fmtMinutes(60), '1 h'); assert.equal(C.fmtMinutes(45), '45 min');
  assert.deepEqual(C.resolveChoice('minutes', '45', { builtins: [45] }), { builtin: true, key: '45', n: 45, label: '45 min' });
  assert.deepEqual(C.resolveChoice('minutes', '1 h 15'), { n: 75, label: '1 h 15' });
  assert.match(C.resolveChoice('minutes', '8 h').error, /5 h/);
});
ok('les ajouts sont nommés partout comme ceux de l’app, et retirés au changement de compte', () => {
  C.registerMine([{ id: 'my-a', list: 'equipment', label: 'Sac de frappe' }, { id: 'my-b', list: 'zone', label: 'Hanche gauche' }, { id: 'my-c', list: 'muscled', label: 'Mollets' },
    { id: 'my-d', list: 'physique', label: 'Des mollets plus musclés' }, { id: 'my-e', list: 'fall', label: 'Pieds qui zippent' }, { id: 'evil', list: 'equipment', label: 'pas « my- »' }]);
  assert.equal(EQUIPMENT['my-a'], 'Sac de frappe'); assert.equal(EQUIPMENT.evil, undefined, 'seulement des identifiants « my- »');
  assert.ok(AVOID_ZONES.some(([k, l]) => k === 'my-b' && /Hanche gauche/.test(l)));
  assert.ok(ZONES.some(([k]) => k === 'my-c'));
  assert.deepEqual(physiqueGroups(['my-d']), ['mollets'], 'souhait écrit : les muscles reconnus comptent');
  assert.deepEqual(cleanBody({ physique: ['my-d', 'inconnu'], muscled: ['my-c'] }).physique, ['my-d']);
  assert.ok(fallTraining(['my-e']).caps.technique_pieds > 0, 'raison de chute écrite : mots reconnus → capacités');
  C.registerMine([{ id: 'my-a', list: 'equipment', label: 'Sac de frappe (renommé)' }]);
  assert.equal(EQUIPMENT['my-a'], 'Sac de frappe (renommé)'); assert.equal(AVOID_ZONES.length, 7); assert.ok(!PHYSIQUE['my-d'] && !FALL_WHY['my-e'] && !ZONES.some(([k]) => k === 'my-c'));
  C.registerMine([]); assert.ok(!Object.keys(EQUIPMENT).some(C.isMine), 'autre compte : plus aucun ajout');
});
ok('le serveur garde un ajout propre (liste connue, libellé borné), et rien d’autre', () => {
  const x = cleanItem({ c: 'choice', id: 'my-abc', u: 1, d: { list: 'equipment', label: 'x'.repeat(90), n: 9999, on: 'oui', evil: '<script>' } });
  assert.deepEqual(x.d, { list: 'equipment', label: 'x'.repeat(40), n: 300, on: true });
  assert.equal(cleanItem({ c: 'choice', id: 'my-abc', u: 1, d: { list: 'admin', label: 'a' } }).d.list, '', 'liste inconnue : ignorée côté client');
});
ok('zone ajoutée : rappelée pendant la séance, sans effet inventé ; les 7 zones de l’app filtrent pour de vrai', () => {
  C.registerMine([{ id: 'my-h', list: 'zone', label: 'Hanche gauche' }]);
  const c = ctxOf({ items: [act('calisthenics'), env('Maison', ['bar', 'mat'])] });
  const r = adaptSession({ id: 's1', name: 'Test', exercises: [{ name: 'Pompes', libId: 'pushup', block: 'main', sets: 3 }] }, { zones: ['my-h'] }, c);
  assert.match(r.warnings.join(' '), /Hanche gauche : l’app ne sait pas quels exercices la chargent/);
  assert.deepEqual(r.session.context.spare, ['Hanche gauche']);
  assert.deepEqual(normalizeSession({ id: 'x', name: 'y', exercises: [], context: { spare: ['a', 'a', 'b'.repeat(60)] } }).context.spare, ['a', 'b'.repeat(40)]);
  assert.deepEqual(parseAdapt('j’ai mal au poignet').opts.zones, ['wrists']);
  const wr = ctxOf({ items: [act('calisthenics'), env('Maison', ['bar', 'mat', 'dips'])], settings: { avoid: { wrists: true } } });
  const { excluded } = G.candidates('calisthenics', wr, { eq: new Set(['bar', 'mat', 'dips']), level: 2, light: false });
  assert.ok(excluded.some((e) => e.why.some((w) => /poignets/.test(w))), 'poignets du profil : exercices de poussée écartés');
  C.registerMine([]);
});
console.log(`\n${n} tests « mes ajouts » OK`);
