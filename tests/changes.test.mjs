// tests/changes.test.mjs — « Quoi de neuf ? » : lecture de l'historique GitHub, filtrage, cache et erreurs.
import assert from 'node:assert/strict';
import { parseCommits, changesRoute, _resetChanges } from '../server/changes.js';
import worker from '../worker.js';
import { makeEnv, ok, done } from './helpers.mjs';

const C = (message, date, parents = 1) => ({ commit: { message, committer: { date } }, parents: Array.from({ length: parents }, () => ({})) });
const LIST = [
  C('Merge pull request #7 from x/y\n\nVisite guidée', '2026-09-27T10:00:00Z', 2),
  C('Livrable « site sport final.zip » mis à jour\n\nCo-Authored-By: X <a@b>', '2026-09-27T09:59:00Z'),
  C('Visite guidée qui montre les pages\n\nTexte technique sur `tour.js`.\n- Flèches qui pointent\n- Aller sur `les pages`\nCo-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/x', '2026-09-27T09:58:00Z'),
  C('Update README.md', '2026-09-26T08:00:00Z'),
  C('Update README.md', '2026-09-25T08:00:00Z'),
  { commit: { message: 'sans date' } }, null,
];
console.log('Quoi de neuf (historique des modifications)');
await ok('garde titres et puces, écarte fusions, livrables, doublons et lignes techniques', () => {
  const r = parseCommits(LIST);
  assert.deepEqual(r.map((x) => x.title), ['Visite guidée qui montre les pages', 'Update README.md']);
  assert.deepEqual(r[0].points, ['Flèches qui pointent', 'Aller sur les pages']);
  assert.equal(r[0].date, Date.parse('2026-09-27T09:58:00Z'));
  assert.equal(JSON.stringify(r).includes('Co-Authored'), false);
  assert.deepEqual(parseCommits({ message: 'pas une liste' }), []);
});
await ok('route : appelle le dépôt public, met en cache, liste vide si GitHub est injoignable', async () => {
  _resetChanges(); let calls = 0, url = '';
  const f = async (u, o) => { calls++; url = u; assert.ok(o.headers['User-Agent']); return new Response(JSON.stringify(LIST)); };
  let j = await (await changesRoute({}, f)).json();
  assert.equal(j.changes.length, 2); assert.match(url, /repos\/martinznt\/Escalade\/commits\?sha=main/);
  await changesRoute({}, f); assert.equal(calls, 1, 'mis en cache');
  _resetChanges();
  const err = console.error; console.error = () => {};
  j = await (await changesRoute({}, async () => new Response('x', { status: 403 }))).json();
  assert.deepEqual(j.changes, []);
  j = await (await changesRoute({}, async () => { throw new Error('réseau'); })).json();
  console.error = err;
  assert.deepEqual(j.changes, []);
  _resetChanges();
  await changesRoute({ CHANGES_REPO: 'bad repo/../x' }, f); assert.match(url, /martinznt\/Escalade/, 'dépôt invalide ignoré');
});
await ok('GET /api/changes répond sans compte (Worker)', async () => {
  _resetChanges(); const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(LIST));
  try {
    const r = await worker.fetch(new Request('https://x.test/api/changes'), makeEnv());
    assert.equal(r.status, 200); assert.equal((await r.json()).changes.length, 2);
  } finally { globalThis.fetch = real; }
});
done();
