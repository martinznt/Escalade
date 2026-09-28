// tests/sessionmeta.test.mjs — métadonnées automatiques des séances communes et listes d'administration.
import assert from 'node:assert/strict';
import { sessionMeta } from '../public/sessionmeta.js';
import { filterBugs, RECENT_MS } from '../public/adminlist.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

const pull = { name: 'Tractions', libId: 'pullup', block: 'main', sets: 4, repsMin: 5, repsMax: 8, caps: { tirage_vertical: 1, blocage: 0.5 }, needs: ['bar'] };
const gain = { name: 'Gainage', block: 'main', sets: 3, mode: 'time', secMin: 30, secMax: 45, caps: { gainage_anterieur: 1 } };
ok('séance simple : activité, durée, niveau, famille, matériel — chaque étiquette a une raison', () => {
  const m = sessionMeta({ activity: 'conditioning', durationMin: 30, exercises: [pull, gain] });
  assert.deepEqual(m.activities, ['conditioning']); assert.equal(m.durationMin, 30);
  assert.ok(['debutant', 'intermediaire', 'avance'].includes(m.level));
  assert.deepEqual(m.equipment, ['bar']); assert.ok(m.caps.includes('tirage_vertical'));
  assert.equal(m.family, 'force', 'la force domine (séries × poids)');
  assert.equal(m.tags.length, m.reasons.length); assert.ok(m.reasons.every((r) => r.tag && r.why.length > 10));
  assert.ok(m.tags.some((t) => /Matériel/.test(t))); assert.equal(m.role, '', 'sans phases : aucun rôle inventé');
});
ok('séance multi-activités avec pause : activités et rôle dominant tirés des phases', () => {
  const phases = [{ id: 'a', activity: 'climbing_boulder', role: 'prep', minutes: 120 }, { id: 'p', activity: 'pause', type: 'pause', role: 'pause', minutes: 30 }, { id: 'b', activity: 'climbing_route', role: 'perf', minutes: 150 }];
  const m = sessionMeta({ activity: 'climbing_boulder', exercises: [{ name: 'Blocs', block: 'main', sets: 6, caps: { force_doigts: 1 } }], context: { phases } });
  assert.deepEqual(m.activities, ['climbing_boulder', 'climbing_route']); assert.ok(m.tags.includes('Multi-activités'));
  assert.equal(m.durationMin, 300); assert.ok(m.tags.includes('Avec pause'));
  assert.equal(m.role, 'perf'); assert.match(m.reasons.find((r) => r.tag === 'Performance').why, /150 min/);
  assert.ok(m.tags.includes('Sans matériel'));
});
ok('déterministe ; capacités et activités inconnues ignorées ; séance vide sans erreur', () => {
  const s = { activity: 'inconnue', exercises: [{ name: 'X', sets: 2, caps: { pouvoir_magique: 1 } }] };
  assert.deepEqual(sessionMeta(s), sessionMeta(s)); assert.deepEqual(sessionMeta(s).activities, []); assert.deepEqual(sessionMeta(s).caps, []);
  assert.doesNotThrow(() => sessionMeta({})); assert.doesNotThrow(() => sessionMeta());
});
ok('signalements : filtre par statut, recherche sans accents sur plusieurs champs, récents ouverts en premier', () => {
  const now = 10 * RECENT_MS;
  const bugs = [
    { id: 'a', title: 'Minuteur bloqué', description: 'rien', status: 'open', author: 'léa', createdAt: now - 3 * RECENT_MS },
    { id: 'b', title: 'Écran blanc', description: 'après la séance', page: 'player', status: 'open', author: 'max', createdAt: now - 3600e3 },
    { id: 'c', title: 'Vieux', description: 'réglé', status: 'done', author: 'léa', createdAt: now - 1000 },
  ];
  assert.deepEqual(filterBugs(bugs, 'open', '', now).map((b) => b.id), ['b', 'a']);
  assert.equal(filterBugs(bugs, 'open', '', now)[0].recent, true);
  assert.deepEqual(filterBugs(bugs, 'all', 'lea', now).map((b) => b.id), ['c', 'a'], 'recherche sans accents, dans l’auteur');
  assert.deepEqual(filterBugs(bugs, 'all', 'ecran player', now).map((b) => b.id), ['b'], 'tous les mots, plusieurs champs');
  assert.deepEqual(filterBugs(null), []);
});
console.log(`${n} tests des métadonnées et listes admin OK`);
