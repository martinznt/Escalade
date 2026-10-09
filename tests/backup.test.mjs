// Import d'une sauvegarde (public/backup.js) : autre compte (nouveaux identifiants, liens gardés), même compte (rien en
// double), séance supprimée depuis (récupérée seulement si on le choisit), rien n'est jamais supprimé par un import.
import assert from 'node:assert/strict';
import { planImport, deletedSince, fromThisAccount, checkBackup } from '../public/backup.js';
import { ok, done } from './helpers.mjs';

const NOW = Date.UTC(2026, 9, 9, 12);
const ids = () => { let n = 0; return () => `new-${++n}`; };
const seance = (id, updatedAt, name = 'Séance ' + id) => ({ id, name, updatedAt, exercises: [{ id: 'e-' + id, name: 'Pompes', mode: 'reps', sets: 2, repsMin: 5, repsMax: 5 }] });
const empty = () => ({ seances: { items: [], tomb: {} }, history: [], events: [] });
const alice = {
  app: 'mes-seances', version: 8, owner: 'alice',
  seances: { items: [seance('s-a', NOW - 5000, 'Force A')], tomb: { 's-old': NOW - 9000 } },
  events: [
    { id: 'ev-root', date: '2026-10-12', time: '18:00', sessionId: 's-a', title: 'Force A', recurrence: { freq: 'weekly' }, meta: { version: 3 } },
    { id: 'ev-exc', date: '2026-10-20', time: '19:00', sessionId: 's-a', title: 'Force A', meta: { seriesId: 'ev-root', occurrenceDate: '2026-10-19', version: 4 } },
  ],
  history: [
    { id: 'h-a', sessionId: 's-a', sessionName: 'Force A', startedAt: NOW - 86400000, durationSeconds: 1800, data: { agenda: { eventId: 'ev-root', occurrenceDate: '2026-10-05' }, exercises: [] } },
    { id: 'csv-abc123', sessionName: 'Course', startedAt: NOW - 2 * 86400000, durationSeconds: 1200, data: { exercises: [] } },
  ],
};

await ok('fichier d’une autre application : refusé avec un message lisible', () => {
  assert.throws(() => checkBackup({ app: 'autre' }), /pas une sauvegarde/); assert.throws(() => checkBackup([]), /pas une sauvegarde/);
  assert.throws(() => planImport(null, empty()), /pas une sauvegarde/);
});
await ok('autre compte : nouveaux identifiants pour l’historique et les rendez-vous, liens gardés', () => {
  const r = planImport(alice, empty(), { owner: 'bob', now: NOW, newId: ids() });
  assert.equal(r.same, false);
  assert.deepEqual(r.seances.items.map((s) => s.id), ['s-a'], 'la séance garde son identifiant (rangée dans le compte)');
  const [root, exc] = r.events;
  assert.ok(root.id !== 'ev-root' && exc.id !== 'ev-exc', 'rendez-vous réidentifiés');
  assert.equal(root.sessionId, 's-a'); assert.equal(exc.sessionId, 's-a');
  assert.equal(exc.meta.seriesId, root.id, 'l’exception suit son rendez-vous répété');
  const [h, csv] = r.history;
  assert.ok(h.id !== 'h-a' && csv.id !== 'csv-abc123');
  assert.equal(h.sessionId, 's-a'); assert.equal(h.data.agenda.eventId, root.id, 'l’historique garde son rendez-vous');
  assert.deepEqual(csv.data.external, { provider: 'file', id: 'csv-abc123', channel: 'file', private: true, excludeAI: true }, 'la provenance de l’import CSV est gardée');
  assert.deepEqual(r.stats, { seances: 1, restored: 0, keptDeleted: 0, history: 2, events: 2, already: 0, skipped: 0 });
  assert.deepEqual(r.seances.tomb, {}, 'les suppressions du fichier ne sont pas reprises');
});
await ok('même compte : identifiants gardés ; importer deux fois n’ajoute rien', () => {
  const first = planImport(alice, empty(), { owner: 'alice', now: NOW, newId: ids() });
  assert.equal(first.same, true); assert.deepEqual(first.events.map((e) => e.id), ['ev-root', 'ev-exc']); assert.deepEqual(first.history.map((x) => x.id), ['h-a', 'csv-abc123']);
  const cur = { seances: first.seances, history: first.history, events: first.events };
  const again = planImport(alice, cur, { owner: 'alice', now: NOW + 1000, newId: ids() });
  assert.deepEqual([again.history.length, again.events.length, again.stats.seances], [0, 0, 0]);
  assert.equal(again.stats.already, 5, 'séance, 2 rendez-vous et 2 historiques déjà là');
});
await ok('ancien fichier sans propriétaire : identifiants gardés seulement s’il a quelque chose en commun avec le compte', () => {
  const { owner, ...old } = alice;
  assert.equal(fromThisAccount(old, empty(), 'bob'), false);
  assert.equal(fromThisAccount(old, { ...empty(), history: [{ id: 'h-a', startedAt: 1 }] }, 'alice'), true);
  const r = planImport(old, { ...empty(), events: [{ id: 'ev-root', date: '2026-10-12', time: '18:00', title: 'Force A' }] }, { owner: 'alice', now: NOW, newId: ids() });
  assert.equal(r.same, true); assert.deepEqual(r.events.map((e) => e.id), ['ev-exc']); assert.equal(r.events[0].meta.seriesId, 'ev-root');
});
await ok('déjà présent sous un autre identifiant (même date, même nom) : pas de doublon, l’exception suit le rendez-vous existant', () => {
  const cur = { ...empty(), history: [{ id: 'h-bob', sessionName: 'force a', startedAt: NOW - 86400000 + 200 }], events: [{ id: 'ev-bob', date: '2026-10-12', time: '18:00', title: 'Force A' }] };
  const r = planImport(alice, cur, { owner: 'bob', now: NOW, newId: ids() });
  assert.deepEqual(r.history.map((x) => x.sessionName), ['Course']);
  assert.equal(r.events.length, 1); assert.equal(r.events[0].meta.seriesId, 'ev-bob');
});
await ok('séance supprimée depuis la sauvegarde : laissée supprimée, sauf si on choisit de la récupérer', () => {
  const backup = { app: 'mes-seances', owner: 'alice', seances: { items: [seance('s-del', NOW - 50000, 'Tractions')], tomb: {} } };
  const cur = { ...empty(), seances: { items: [], tomb: { 's-del': NOW - 10000 } } };
  assert.deepEqual(deletedSince(backup, cur.seances), [{ id: 's-del', name: 'Tractions' }]);
  const kept = planImport(backup, cur, { owner: 'alice', now: NOW });
  assert.deepEqual(kept.seances.items, []); assert.equal(kept.seances.tomb['s-del'], NOW - 10000); assert.equal(kept.stats.keptDeleted, 1); assert.equal(kept.stats.seances, 0);
  const back = planImport(backup, cur, { owner: 'alice', now: NOW, restore: ['s-del'] });
  assert.deepEqual(back.seances.items.map((s) => s.name), ['Tractions']); assert.equal(back.seances.tomb['s-del'], undefined);
  assert.ok(back.seances.items[0].updatedAt > NOW - 10000, 'plus récente que la suppression : le serveur la garde'); assert.equal(back.stats.restored, 1);
});
await ok('un import ne supprime rien : les marques de suppression du fichier sont ignorées', () => {
  const cur = { ...empty(), seances: { items: [seance('s-x', NOW - 90000, 'Gardée')], tomb: {} } };
  const r = planImport({ app: 'mes-seances', owner: 'alice', seances: { items: [], tomb: { 's-x': NOW } } }, cur, { owner: 'alice', now: NOW });
  assert.deepEqual(r.seances.items.map((s) => s.name), ['Gardée']);
});
await ok('éléments invalides comptés, jamais envoyés', () => {
  const r = planImport({ app: 'mes-seances', history: [{ id: 'bad id!', startedAt: NOW }, { id: 'h-futur', startedAt: NOW + 86400000 }, { id: 'h-ok', startedAt: NOW - 1000, sessionName: 'Ok' }], events: [{ id: 'e1', date: '12/10/2026' }] }, empty(), { owner: 'bob', now: NOW, newId: ids() });
  assert.deepEqual(r.history.map((x) => x.sessionName), ['Ok']); assert.equal(r.events.length, 0); assert.equal(r.stats.skipped, 3);
});
done('tests sauvegarde (import)');
