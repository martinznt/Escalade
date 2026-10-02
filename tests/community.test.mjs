// tests/community.test.mjs — encouragements (seulement entre partenaires, messages tout faits), idées à voter
// (publiées par un administrateur « contenu », un vote par personne), statistiques anonymes (totaux, petits groupes
// masqués), bandeau de maintenance, suppression de compte qui efface encouragements et votes.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { cleanGlobal } from '../server/global.js';
console.log('Communauté et administration (8.30)');
const env = makeEnv(), A = new Client(env), B = new Client(env), C = new Client(env), ADM = new Client(env);
await A.register('alice'); await B.register('bruno'); await C.register('chloe'); await ADM.register('admin1');
const pub = (c) => c.post('/api/social/profile', { visibility: 'public', bio: '', shareStats: false, shareRecords: false, shareSessions: false, share: {} });
for (const c of [A, B, C]) await pub(c);

await ok('encouragement : refusé si vous ne vous suivez pas tous les deux, accepté entre partenaires, messages tout faits seulement', async () => {
  await A.post('/api/social/follow', { username: 'bruno' });
  assert.equal((await A.post('/api/social/cheer', { username: 'bruno', msg: 'bravo' })).status, 403, 'B ne suit pas A');
  await B.post('/api/social/follow', { username: 'alice' });
  assert.equal((await A.post('/api/social/cheer', { username: 'bruno', msg: '<b>texte libre</b>' })).status, 400);
  assert.equal((await A.post('/api/social/cheer', { username: 'bruno', msg: 'bravo' })).status, 200);
  assert.equal((await C.post('/api/social/cheer', { username: 'bruno', msg: 'bravo' })).status, 403, 'C n’est pas partenaire');
  const r = (await B.get('/api/social/cheers')).data.cheers; assert.equal(r.length, 1); assert.equal(r[0].from, 'alice'); assert.match(r[0].text, /Bravo/); assert.equal(r[0].fresh, true);
  assert.equal((await B.get('/api/social/cheers')).data.cheers[0].fresh, false, 'marqué vu');
  assert.equal((await A.get('/api/social/cheers')).data.cheers.length, 0, 'chacun voit seulement les siens');
  const feed = (await A.get('/api/social/feed')).data.people; assert.equal(feed.find((p) => p.username === 'bruno').mutual, true);
  for (let i = 0; i < 2; i++) await A.post('/api/social/cheer', { username: 'bruno', msg: 'courage' });
  assert.equal((await A.post('/api/social/cheer', { username: 'bruno', msg: 'courage' })).status, 429, '3 par jour vers la même personne');
});
await ok('idées : publiées par un administrateur, un vote par personne (re-toucher retire le vote), fermées une fois prévues', async () => {
  assert.equal((await A.post('/api/admin/ideas', { title: 'Pirate' })).status, 403, 'membre : refusé');
  assert.equal((await ADM.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
  const c = await ADM.post('/api/admin/ideas', { title: 'Mode sombre du minuteur', detail: 'Proposé plusieurs fois' }); assert.equal(c.status, 200);
  const id = c.data.id;
  assert.equal((await A.post(`/api/ideas/${id}/vote`)).data.votes, 1); assert.equal((await B.post(`/api/ideas/${id}/vote`)).data.votes, 2);
  const un = await A.post(`/api/ideas/${id}/vote`); assert.equal(un.data.voted, false); assert.equal(un.data.votes, 1);
  const list = (await B.get('/api/ideas')).data.ideas; assert.equal(list[0].votes, 1); assert.equal(list[0].mine, true); assert.ok(!('user_id' in list[0]) && !JSON.stringify(list).includes('bruno'), 'aucun nom');
  await ADM.post('/api/admin/ideas', { id, title: 'Mode sombre du minuteur', status: 'planned' });
  assert.equal((await C.post(`/api/ideas/${id}/vote`)).status, 409);
  const audit = (await ADM.get('/api/admin/audit')).data; assert.ok(JSON.stringify(audit).includes('idea-create'), 'noté au journal');
  assert.equal((await ADM.del(`/api/admin/ideas/${id}`)).status, 200); assert.equal((await A.get('/api/ideas')).data.ideas.length, 0);
});
await ok('statistiques anonymes : totaux seulement, petits groupes masqués, réservées aux administrateurs', async () => {
  assert.equal((await A.get('/api/admin/stats')).status, 403);
  await A.post('/api/history', { id: 'h1', sessionName: 'Bloc', startedAt: Date.now() - 3600e3, durationSeconds: 3600, data: { activity: 'climbing_boulder', exercises: [] } });
  const s = (await ADM.get('/api/admin/stats')).data;
  assert.equal(s.users, 4); assert.equal(s.sessions30, 1); assert.equal(s.people30, null, 'une seule personne : masqué'); assert.equal(s.minutes30, null);
  assert.equal(s.activities[0].sessions, null, 'moins de 3 personnes : rien'); assert.equal(s.weeks.length, 8);
  assert.ok(!JSON.stringify(s).match(/alice|bruno|chloe|admin1/), 'aucun pseudo');
});
await ok('bandeau de maintenance : gardé seulement s’il est demandé, avec une date de fin valide', () => {
  assert.deepEqual(cleanGlobal('announce', { title: 'Maintenance', body: 'Ce soir', banner: true, until: 1790000000000 }), { title: 'Maintenance', body: 'Ce soir', update: false, emoji: '🛠️', banner: true, until: 1790000000000 });
  assert.equal(cleanGlobal('announce', { title: 'Info', until: 5 }).banner, undefined);
  assert.equal(cleanGlobal('announce', { title: 'M', banner: true, until: 'demain' }).until, 0);
});
await ok('suppression du compte : encouragements et votes effacés', async () => {
  const id = (await ADM.post('/api/admin/ideas', { title: 'Une autre idée' })).data.id; await B.post(`/api/ideas/${id}/vote`);
  assert.equal((await B.post('/api/auth/delete', { password: 'motdepasse1' })).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM cheers').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM idea_votes').first()).n, 0);
});
done('tests communauté et administration');
