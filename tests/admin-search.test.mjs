import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const env = makeEnv(), clients = {};
for (const name of ['keeper','content','technical','users','intelligence','member']) {
  const client = clients[name] = new Client(env); await client.register('Search' + name);
  if (name !== 'member') assert.equal((await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
}
for (const role of ['content','technical','users','intelligence']) {
  const id = (await clients[role].get('/api/auth/me')).data.user.id;
  assert.equal((await clients.keeper.post('/api/admin/users/' + id + '/roles', { roles: [role] })).status, 200);
}
await clients.member.post('/api/bugs', { id: 'search-bug', description: 'Équilibre RechercheUnique : le bouton ne répond pas.', page: 'profile/home' });
await clients.keeper.post('/api/admin/studio', { title: 'Équilibre RechercheUnique', note: 'Une fiche à relire', items: [{ kind: 'faq', id: 'search-faq', op: 'put', data: { q: 'Équilibre RechercheUnique', a: 'Une réponse de test.' } }] });
const find = async (client, query) => client.get('/api/admin/search?q=' + encodeURIComponent(query));

await ok('recherche admin refusée aux membres et visiteurs, sans fuite de données', async () => {
  for (const [client, status] of [[clients.member,403],[new Client(env),401]]) {
    const response = await find(client,'RechercheUnique'); assert.equal(response.status,status); assert.equal(response.data.results,undefined);
  }
});
await ok('chaque rôle cherche uniquement ses collections autorisées ; Intelligence ne reçoit aucun contenu privé', async () => {
  assert.deepEqual((await find(clients.content,'RechercheUnique')).data.results.map((r) => r.kind),['studio']);
  assert.deepEqual((await find(clients.technical,'RechercheUnique')).data.results.map((r) => r.kind),['bug']);
  assert.deepEqual((await find(clients.intelligence,'RechercheUnique')).data.results,[]);
  const users = (await find(clients.users,'Search')).data.results;
  assert.equal(users.length,6); assert.ok(users.every((row) => row.kind === 'user'));
  assert.doesNotMatch(JSON.stringify(users),/password|email|sessionsDone|profile|data_json/);
  const all = (await find(clients.keeper,'RechercheUnique')).data.results;
  assert.deepEqual(all.map((row) => row.kind).sort(),['bug','studio']);
});
await ok('accents et mots multiples retrouvés ; requêtes vides ou syntaxe SQL restent des recherches', async () => {
  for (const query of ['équilibre rechercheunique','equilibre RechercheUnique']) assert.equal((await find(clients.keeper,query)).data.results.length,2);
  for (const query of ['', 'a', "'; DROP TABLE users --"]) assert.deepEqual((await find(clients.keeper,query)).data.results,[]);
  assert.deepEqual((await find(clients.keeper,"%' OR 1=1 --")).data.results,(await find(clients.keeper,'or 1 1')).data.results);
  assert.equal((await find(clients.users,'Search')).data.results.length,6);
  assert.equal((await find(clients.keeper,'RechercheUnique')).data.results.length,2);
});
await ok('bibliothèque et aide intégrées à la recherche Contenu, masquées aux rôles sans Contenu', async () => {
  const results = (await find(clients.content,'pompes')).data.results;
  assert.ok(results.some((row) => row.kind === 'exercise'));
  assert.deepEqual((await find(clients.intelligence,'pompes')).data.results,[]);
});
done('tests de recherche commune admin');
