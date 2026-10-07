// tests/adminv2.test.mjs — V2 administration : rôles vérifiés côté serveur, santé des données (corrections en
// brouillon seulement), IA de maintenance (rien d'appliqué), propositions de code (jamais déployées, validées par un
// autre admin, secrets et exécution dynamique refusés), comparer / restaurer une version (brouillon), audit.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { dataHealth, analyzeDiff, groupBugs, cleanMaintenance } from '../server/health.js';

console.log('Administration V2 : règles');
await ok('santé des données : doublons, relations contradictoires, orphelins, anciennes structures, avec correction proposée', async () => {
  const r = dataHealth([
    { kind: 'exercise', id: 'g1', data: { name: 'Tractions', caps: { tirage_vertical: 1, faux_cap: 1 } } },
    { kind: 'catalog', id: 'c1', data: { name: 'Séance X', ex: [{ libId: 'n-existe-pas', sets: 3 }] } },
    { kind: 'faq', id: 'f1', data: { q: 'Q', a: '' } },
  ]);
  const types = r.issues.map((x) => x.type);
  for (const t of ['bad-relation', 'duplicate', 'orphan', 'old-structure']) assert.ok(types.includes(t), t);
  assert.ok(!types.includes('no-metric'), '8.29 : chaque capacité a au moins un test mesurable');
  assert.deepEqual(dataHealth([]).issues, [], 'données intégrées : aucune alerte');
  const bad = r.issues.find((x) => x.type === 'bad-relation' && x.target === 'exercise/g1'); assert.deepEqual(bad.fix.data.caps, { tirage_vertical: 1 });
  assert.equal(r.issues.find((x) => x.target === 'faq/f1').fix.op, 'delete');
  assert.ok(r.checked.exercises > 100);
});
await ok('analyse d’impact d’un diff : fichiers, migration, secrets et exécution dynamique refusés', async () => {
  const d = analyzeDiff('--- a/public/ui.js\n+++ b/public/ui.js\n@@\n-const a = 1;\n+const a = 2;\n--- a/schema.js\n+++ b/schema.js\n+  "ALTER TABLE users DROP COLUMN email"');
  assert.deepEqual(d.files, ['public/ui.js', 'schema.js']); assert.equal(d.migration, true); assert.ok(d.flags.some((f) => /suppression/.test(f))); assert.equal(d.blocked, false);
  assert.equal(analyzeDiff('+++ b/worker.js\n+eval(x)').blocked, true);
  assert.equal(analyzeDiff('+++ b/worker.js\n+const EDIT_PASSWORD = "x"').blocked, true);
});
await ok('maintenance : regroupement déterministe ; sortie IA nettoyée', async () => {
  const g = groupBugs([{ title: 'A', page: 'player' }, { title: 'B', page: 'player' }, { title: 'C', page: 'home' }]);
  assert.equal(g[0].page, 'player'); assert.equal(g[0].count, 2);
  assert.equal(cleanMaintenance({ findings: [{ title: '<b>x</b>', severity: 'énorme', area: 'shell' }] })[0].severity, 'moyen');
  assert.equal(cleanMaintenance({}), null);
});

console.log('Administration V2 : routes');
const env = makeEnv({ AI: { run: async () => ({ response: '{"status":"ok","basis":"request","sources":["request","app/model","report:0","report:1"],"findings":[{"title":"Le lecteur se bloque","detail":"2 signalements rapportés","severity":"élevé","proposal":"Vérifier la pause","area":"code","sources":["report:0","report:1"]}]}' }) } });
const A = new Client(env), B = new Client(env), U = new Client(env);
await A.register('superadm'); await B.register('contenu'); await U.register('membre');
for (const c of [A, B]) assert.equal((await c.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
const users = async () => (await A.get('/api/admin/users')).data.users;
let bId;
await ok('rôles : admin existant = super-admin ; un rôle « contenu » ne voit que le contenu (vérifié côté serveur)', async () => {
  const me = (await A.get('/api/auth/me')).data.user; assert.deepEqual(me.roles, ['super']);
  bId = (await users()).find((x) => x.username === 'contenu').id;
  assert.equal((await B.post(`/api/admin/users/${bId}/roles`, { roles: ['content'] })).status, 200, 'B est encore super-admin');
  assert.deepEqual((await B.get('/api/auth/me')).data.user.roles, ['content']);
  assert.equal((await B.get('/api/admin/studio')).status, 200);
  for (const [m, p] of [['GET', '/api/admin/users'], ['GET', '/api/admin/bugs'], ['GET', '/api/admin/health'], ['POST', '/api/admin/code'], ['POST', '/api/admin/maintenance'], ['POST', `/api/admin/users/${bId}/roles`]])
    assert.equal((await B.call(m, p, m === 'GET' ? undefined : { roles: ['super'], title: 'x', diff: '+++ b/x\n+y' })).status, 403, p);
  assert.equal((await U.get('/api/admin/health')).status, 403, 'un membre n’a aucun accès');
  const aId = (await users()).find((x) => x.username === 'superadm').id;
  assert.equal((await A.post(`/api/admin/users/${aId}/roles`, { roles: ['content'] })).status, 409, 'il faut garder un super-admin');
  assert.equal((await A.post(`/api/admin/users/${bId}/roles`, { roles: ['hack'] })).status, 400);
  assert.deepEqual((await users()).find((x) => x.id === bId).roles, ['content']);
});
await ok('santé des données (route) : lecture seule ; la correction devient un brouillon du Studio', async () => {
  await A.put('/api/admin/global/exercise/g-dup', { data: { name: 'Tractions', caps: { tirage_vertical: 1 } } });
  const r = await A.get('/api/admin/health'); assert.equal(r.status, 200);
  const dup = r.data.issues.find((x) => x.type === 'duplicate' && x.target === 'exercise/g-dup'); assert.ok(dup?.fix);
  const d = await A.post('/api/admin/studio', { title: 'Santé : doublon', items: [dup.fix] }); assert.equal(d.status, 200);
  assert.equal((await A.get('/api/admin/studio/' + d.data.id)).data.set.status, 'draft', 'jamais appliqué sans validation');
});
await ok('IA de maintenance : regroupe les signalements, propose, n’applique rien, journalisé', async () => {
  await U.post('/api/bugs', { title: 'Le lecteur se bloque', description: 'Après la pause', page: 'player' });
  await U.post('/api/bugs', { title: 'Encore le lecteur', description: 'Bloqué', page: 'player' });
  const r = await A.post('/api/admin/maintenance', {}); assert.equal(r.status, 200);
  assert.equal(r.data.open, 2); assert.equal(r.data.groups[0].page, 'player'); assert.equal(r.data.findings[0].severity, 'élevé'); assert.equal(r.data.ai, 'ok');
  assert.ok((await A.get('/api/admin/audit')).data.events.some((e) => e.action === 'maintenance'));
  const off = new Client(makeEnv()); await off.register('seul'); await off.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
  assert.equal((await off.post('/api/admin/maintenance', {})).data.ai, 'indisponible', 'sans IA : regroupement seulement');
});
let cid;
await ok('propositions de code : diff + impact, validation par un AUTRE admin, jamais déployées, export .patch', async () => {
  const r = await A.post('/api/admin/code', { title: 'Corriger la pause', summary: 's', diff: '--- a/public/player.js\n+++ b/public/player.js\n@@\n-a\n+b', tests: 'npm test' });
  assert.equal(r.status, 200); cid = r.data.id; assert.deepEqual(r.data.impact.files, ['public/player.js']);
  assert.equal((await A.post('/api/admin/code', { title: 'Mauvais', diff: '+++ b/worker.js\n+new Function("x")' })).status, 422);
  assert.equal((await A.post(`/api/admin/code/${cid}/review`, { decision: 'approve' })).status, 409, 'pas d’auto-validation');
  await A.post(`/api/admin/users/${bId}/roles`, { roles: ['technical'] });
  const v = await B.post(`/api/admin/code/${cid}/review`, { decision: 'approve', note: 'OK à déployer à la main' }); assert.equal(v.status, 200); assert.equal(v.data.deployed, false);
  const patch = await A.call('GET', `/api/admin/code/${cid}.patch`); assert.match(await patch.res.text(), /MANUELLEMENT[\s\S]*\+b/);
  assert.equal((await A.get('/api/admin/code')).data.items[0].status, 'approved');
});
await ok('versions : comparer deux versions, restaurer = brouillon (jamais publié directement)', async () => {
  await A.put('/api/admin/global/faq/vq', { data: { q: 'Q1 ?', a: 'R1' } }); await A.put('/api/admin/global/faq/vq', { data: { q: 'Q1 ?', a: 'R2' } });
  const d = await A.get('/api/admin/versions/faq/vq/diff?a=1&b=2'); assert.equal(d.status, 200); assert.deepEqual(d.data.changes.map((c) => c.path), ['a']);
  const r = await A.post('/api/admin/versions/faq/vq/restore', { version: 1 }); assert.equal(r.status, 200);
  const set = (await A.get('/api/admin/studio/' + r.data.id)).data; assert.equal(set.set.status, 'draft'); assert.equal(set.items[0].data.a, 'R1');
  assert.equal((await U.get('/api/global')).data.items.find((x) => x.id === 'vq').data.a, 'R2', 'rien n’a changé pour les membres');
});
done('tests Administration V2');
