// Signalements : suivi de traitement, droits administrateur et visibilité de l'auteur.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';

const env = makeEnv();
const superAdmin = new Client(env), technical = new Client(env), content = new Client(env);
const author = new Client(env), otherAuthor = new Client(env), anonymous = new Client(env);
for (const [client, name] of [[superAdmin,'bugsuper'],[technical,'bugtech'],[content,'bugcontent'],[author,'bugauthor'],[otherAuthor,'bugother']]) await client.register(name);
for (const client of [superAdmin, technical, content]) assert.equal((await client.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
for (const [client, role] of [[technical,'technical'],[content,'content']]) {
  const id = (await client.get('/api/auth/me')).data.user.id;
  assert.equal((await superAdmin.post(`/api/admin/users/${id}/roles`, { roles: [role] })).status, 200);
}
const statusPath = id => `/api/admin/bugs/${id}`;
const mine = async client => (await client.get('/api/bugs/mine')).data.reports;
const audit = async () => (await technical.get('/api/admin/audit')).data.events.filter(e => e.action === 'bug_status');
const ids = ['bug-open', 'bug-progress', 'bug-done', 'bug-ignored'];
let original;

await ok('nouveau signalement : ouvert, même si le membre demande un autre statut', async () => {
  for (const [index, id] of ids.entries()) {
    const response = await (index === 3 ? otherAuthor : author).post('/api/bugs', {
      id, title: `Problème ${id}`, description: `Le bouton ne répond pas : ${id}.`,
      page: 'settings', appVersion: '8.32.2', userAgent: 'Test navigateur', status: 'ignored',
    });
    assert.equal(response.status, 200); assert.equal(response.data.id, id);
  }
  original = (await mine(author)).find(report => report.id === ids[1]);
  assert.ok(original.createdAt > 0); assert.equal(original.status, 'open');
  assert.ok((await mine(otherAuthor)).every(report => report.status === 'open'));
});

await ok('suivi réservé au rôle technique ou super ; refus membre, contenu et anonyme sans effet', async () => {
  for (const [client, status] of [[anonymous,401],[author,403],[content,403]]) {
    assert.equal((await client.get('/api/admin/bugs')).status, status);
    assert.equal((await client.post(statusPath(ids[0]), { status: 'ignored' })).status, status);
  }
  assert.equal((await technical.get('/api/admin/bugs')).status, 200);
  assert.equal((await superAdmin.get('/api/admin/bugs')).status, 200);
  assert.equal((await mine(author)).find(report => report.id === ids[0]).status, 'open');
  assert.deepEqual(await audit(), []);
});

await ok('en cours, traité et doublon : statuts persistants, contenu conservé, auteur informé', async () => {
  for (const [index, status] of [[1,'in_progress'],[2,'done'],[3,'ignored']]) {
    assert.equal((await technical.post(statusPath(ids[index]), { status })).status, 200);
    const client = index === 3 ? otherAuthor : author;
    assert.equal((await mine(client)).find(report => report.id === ids[index]).status, status);
  }
  const progress = (await mine(author)).find(report => report.id === ids[1]);
  assert.equal(progress.title, original.title); assert.equal(progress.description, original.description);
  assert.equal(progress.page, original.page); assert.equal(progress.createdAt, original.createdAt);
  assert.ok(progress.updatedAt >= original.updatedAt);
});

await ok('filtres des quatre statuts : uniquement les signalements correspondants', async () => {
  for (const [index, status] of ['open','in_progress','done','ignored'].entries()) {
    const response = await technical.get(`/api/admin/bugs?status=${status}`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.reports.map(report => report.id), [ids[index]]);
    assert.ok(response.data.reports.every(report => report.status === status));
  }
  for (const query of ['', '?status=all', '?status=unknown', '?status='+encodeURIComponent("ignored' OR 1=1 --")]) {
    const response = await technical.get('/api/admin/bugs'+query);
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.reports.map(report => report.id).sort(), [...ids].sort());
  }
});

await ok('statut invalide ou signalement absent : aucune modification ni entrée au journal', async () => {
  const before = await mine(author), beforeAudit = await audit();
  for (const payload of [{}, {status:null}, {status:1}, {status:['done']}, {status:'duplicate'}, {status:'DONE'}, {status:'in_progress '}, '{']) {
    const response = await technical.post(statusPath(ids[0]), payload);
    assert.equal(response.status, 400); assert.match(response.data.error, /Statut invalide/);
  }
  assert.equal((await technical.post(statusPath('bug-absent'), { status: 'done' })).status, 404);
  assert.deepEqual(await mine(author), before); assert.deepEqual(await audit(), beforeAudit);
});

await ok('rouvrir un doublon : super-administrateur autorisé, transition visible dans le filtre et chez l’auteur', async () => {
  assert.equal((await superAdmin.post(statusPath(ids[3]), { status: 'open' })).status, 200);
  assert.deepEqual((await technical.get('/api/admin/bugs?status=ignored')).data.reports, []);
  assert.deepEqual((await technical.get('/api/admin/bugs?status=open')).data.reports.map(report => report.id).sort(), [ids[0],ids[3]].sort());
  assert.equal((await mine(otherAuthor))[0].status, 'open');
});

await ok('mes signalements : statuts accessibles à leur auteur, autres comptes et métadonnées techniques exclus', async () => {
  const owned = await mine(author), other = await mine(otherAuthor);
  assert.deepEqual(owned.map(report => report.id).sort(), ids.slice(0,3).sort());
  assert.deepEqual(other.map(report => report.id), [ids[3]]);
  assert.deepEqual(await mine(content), []);
  for (const report of [...owned, ...other]) {
    assert.equal(report.author, undefined); assert.equal(report.userAgent, undefined);
    assert.equal(report.appVersion, undefined); assert.equal(report.userId, undefined);
  }
});

await ok('journal : chaque transition conserve le responsable, le signalement et le statut, sans données privées', async () => {
  const events = await audit(); assert.equal(events.length, 4);
  for (const [id, status] of [[ids[1],'in_progress'],[ids[2],'done'],[ids[3],'ignored']]) {
    const event = events.find(e => e.target === id && e.after?.status === status);
    assert.ok(event); assert.equal(event.actor, 'bugtech'); assert.equal(event.type, 'bug'); assert.ok(event.at > 0);
    assert.deepEqual(event.after, { status });
  }
  const reopened = events.find(e => e.target === ids[3] && e.after?.status === 'open');
  assert.equal(reopened.actor, 'bugsuper'); assert.equal(reopened.type, 'bug');
  assert.doesNotMatch(JSON.stringify(events), /Adm1n-Secret|motdepasse|Le bouton ne répond pas/);
});

done('tests de suivi des signalements');
