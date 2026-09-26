// tests/worker.test.mjs — intégration Worker + D1 (SQLite) : comptes, sessions, données, droits, sécurité.
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { Client, makeEnv, ok, done, hist, ORIGIN } from './helpers.mjs';

const env = makeEnv();
const A = new Client(env), B = new Client(env), C = new Client(env);

console.log('Comptes et sessions');
await ok('santé : pas de secret révélé', async () => {
  const r = await A.get('/api/health'); assert.equal(r.status, 200); assert.equal(r.data.adminConfigured, true);
  assert.ok(!JSON.stringify(r.data).includes('Adm1n'));
});
await ok('inscription refusée : mot de passe court, pseudo invalide', async () => {
  assert.equal((await A.post('/api/auth/register', { username: 'alice', password: 'court' })).status, 400);
  assert.equal((await A.post('/api/auth/register', { username: 'a b', password: 'motdepasse1' })).status, 400);
});
await ok('inscription : cookie de session HttpOnly, Secure (https), SameSite, 1 an', async () => {
  const r = await A.register('Alice');
  const sc = r.res.headers.getSetCookie().find((c) => c.startsWith('session='));
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Max-Age=31536000/);
  assert.equal(r.data.user.isAdmin, false);
  assert.ok(r.res.headers.get('Strict-Transport-Security'), 'HSTS en https');
});
await ok('mot de passe haché avec sel individuel (jamais en clair)', async () => {
  await B.register('Bob', 'motdepasse2');
  const rows = env.DB.raw.prepare('SELECT password_hash,password_salt FROM users').all();
  assert.ok(rows.every((r) => r.password_hash !== 'motdepasse1' && r.password_hash.length >= 40));
  assert.notEqual(rows[0].password_salt, rows[1].password_salt);
});
await ok('pseudo déjà pris (casse ignorée) → 409 ; rafale concurrente → un seul succès, jamais 500', async () => {
  assert.equal((await new Client(env).post('/api/auth/register', { username: 'ALICE', password: 'motdepasse1' })).status, 409);
  const rs = await Promise.all(Array.from({ length: 6 }, () => new Client(env, { ip: '9.9.9.9' }).post('/api/auth/register', { username: 'course', password: 'motdepasse1' })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1); assert.ok(rs.every((r) => r.status !== 500));
});
await ok('connexion : mauvais mot de passe 401, bon 200, via e-mail aussi', async () => {
  const c = new Client(env);
  assert.equal((await c.post('/api/auth/login', { username: 'alice', password: 'faux-faux-1' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { username: 'alice', password: 'motdepasse1' })).status, 200);
  await C.post('/api/auth/register', { username: 'Carla', email: 'carla@exemple.fr', password: 'motdepasse3' });
  assert.equal((await new Client(env).post('/api/auth/login', { username: 'carla@exemple.fr', password: 'motdepasse3' })).status, 200);
});
await ok('fixation de session impossible : le jeton présenté est révoqué à la connexion', async () => {
  const c = new Client(env);
  await c.post('/api/auth/login', { username: 'alice', password: 'motdepasse1' });
  const old = c.jar.session;
  await c.post('/api/auth/login', { username: 'alice', password: 'motdepasse1' });
  assert.notEqual(c.jar.session, old);
  const attacker = new Client(env); attacker.jar.session = old;
  assert.equal((await attacker.get('/api/auth/me')).status, 401, 'l’ancien jeton ne marche plus');
});
await ok('limite de débit de connexion atomique (rafale concurrente)', async () => {
  const c = new Client(env);
  const rs = await Promise.all(Array.from({ length: 15 }, () => c.post('/api/auth/login', { username: 'bob', password: 'mauvais' })));
  assert.ok(rs.filter((r) => r.status === 401).length <= 10); assert.ok(rs.filter((r) => r.status === 429).length >= 5);
});
await ok('sans cookie : 401 sur toutes les routes privées', async () => {
  const anon = new Client(env);
  for (const [m, p] of [['GET', '/api/sync'], ['GET', '/api/items'], ['GET', '/api/history'], ['POST', '/api/bugs'], ['GET', '/api/admin/bugs'], ['POST', '/api/admin/activate'], ['POST', '/api/shared'], ['GET', '/api/shared']]) assert.equal((await anon.call(m, p, m === 'GET' ? undefined : {})).status, 401, p);
});
await ok('session prolongée quand elle vieillit', async () => {
  env.DB.raw.exec(`UPDATE sessions SET expires_at=${Date.now() + 100 * 86400000}`);
  const r = await A.get('/api/auth/me'); assert.ok(r.res.headers.getSetCookie().some((c) => c.startsWith('session=')));
});

console.log('CSRF, formats, tailles');
await ok('origine étrangère refusée (403) ; formulaire non-JSON refusé (415)', async () => {
  assert.equal((await A.call('POST', '/api/sync', { items: [] }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await A.call('POST', '/api/sync', { items: [] }, { 'Sec-Fetch-Site': 'cross-site', Origin: ORIGIN })).status, 403);
  assert.equal((await A.call('POST', '/api/bugs', 'title=x&description=yyyyy', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
});
await ok('charge utile trop grosse → 413', async () => {
  const big = { title: 'x', description: 'y'.repeat(40000) };
  assert.equal((await A.post('/api/bugs', big)).status, 413);
  assert.equal((await A.post('/api/items', { changes: Array.from({ length: 301 }, (_, i) => ({ c: 'jnote', id: 'n' + i, u: 1, d: {} })) })).status, 413);
});

console.log('Séances (fusion)');
await ok('fusion : la version la plus récente gagne, les suppressions sont conservées', async () => {
  const s = (id, name, u) => ({ id, name, updatedAt: u, exercises: [] });
  await A.post('/api/sync', { items: [s('a', 'Un', 10), s('b', 'Deux', 10)], tomb: {} });
  const r = await A.post('/api/sync', { items: [s('a', 'Un modifié', 20), s('b', 'Deux ancien', 5)], tomb: {} });
  assert.equal(r.data.items.find((x) => x.id === 'a').name, 'Un modifié'); assert.equal(r.data.items.find((x) => x.id === 'b').name, 'Deux');
  const t = Date.now(); const r2 = await A.post('/api/sync', { items: [], tomb: { b: t } }); assert.ok(!r2.data.items.some((x) => x.id === 'b'));
  assert.equal((await B.get('/api/sync')).data.items.length, 0, 'isolation');
});
await ok('champs V2 des séances conservés (modèle, archive, intentions, contexte, origine)', async () => {
  await A.post('/api/sync', { items: [{ id: 'v2', name: 'V2', updatedAt: 30, template: true, archived: true, activity: 'conditioning', intentions: [{ id: 'force', p: 3 }], context: { plannedMin: 25, equipment: ['bar'] }, exercises: [{ name: 'Tractions', caps: { tirage_vertical: 1 }, prim: ['grand_dorsal'] }] }], tomb: {} });
  const x = (await A.get('/api/sync')).data.items.find((s) => s.id === 'v2');
  assert.equal(x.template, true); assert.equal(x.archived, true); assert.equal(x.intentions[0].p, 3); assert.equal(x.context.plannedMin, 25); assert.equal(x.exercises[0].caps.tirage_vertical, 1); assert.deepEqual(x.exercises[0].prim, ['grand_dorsal']);
});

console.log('Données structurées (items)');
await ok('écriture, relecture, isolation stricte entre comptes', async () => {
  const r = await A.post('/api/items', { changes: [{ c: 'goal', id: 'g1', u: 1000, d: { type: 'skill', skillId: 'front_lever', label: 'Front lever', status: 'active' } }, { c: 'perf', id: 'p1', u: 1000, d: { metricId: 'max_tractions', value: 9, date: Date.now(), source: 'measured' } }] });
  assert.equal(r.data.applied.length, 2);
  assert.equal((await A.get('/api/items?since=0')).data.items.length, 2);
  assert.equal((await B.get('/api/items?since=0')).data.items.length, 0);
});
await ok('IDOR : B écrit le même identifiant → donnée séparée, celle de A intacte', async () => {
  await B.post('/api/items', { changes: [{ c: 'perf', id: 'p1', u: 9999, d: { metricId: 'max_tractions', value: 1 } }] });
  assert.equal((await A.get('/api/items?since=0')).data.items.find((i) => i.id === 'p1').d.value, 9);
});
await ok('dernière modification gagnante ; version plus ancienne → conflit renvoyé (rien d’écrasé en silence)', async () => {
  const stale = await A.post('/api/items', { changes: [{ c: 'perf', id: 'p1', u: 500, d: { metricId: 'max_tractions', value: 2 } }] });
  assert.equal(stale.data.applied.length, 0); assert.equal(stale.data.conflicts[0].server.d.value, 9);
  const replay = await A.post('/api/items', { changes: [{ c: 'perf', id: 'p1', u: 1000, d: { metricId: 'max_tractions', value: 9, date: (await A.get('/api/items?since=0')).data.items.find((i) => i.id === 'p1').d.date, source: 'measured' } }] });
  assert.equal(replay.data.applied.length, 1, 'rejeu identique = succès, pas conflit');
  const del = await A.post('/api/items', { changes: [{ c: 'perf', id: 'p1', u: 2000, del: true }] });
  assert.equal(del.data.applied.length, 1);
  assert.equal((await A.get('/api/items?since=0')).data.items.find((i) => i.id === 'p1').del, true, 'suppression propagée aux autres appareils');
});
await ok('collection inconnue, identifiant invalide, date future : rejetés explicitement', async () => {
  const r = await A.post('/api/items', { changes: [{ c: 'hack', id: 'x', u: 1, d: {} }, { c: 'goal', id: '../x', u: 1, d: {} }, { c: 'goal', id: 'fut', u: Date.now() + 5 * 86400000, d: {} }] });
  assert.equal(r.data.rejected.length, 3); assert.equal(r.data.applied.length, 0);
});
await ok('liste blanche : clés inconnues retirées, clés connues conservées', async () => {
  await A.post('/api/items', { changes: [{ c: 'env', id: 'e1', u: 3000, d: { name: 'Maison', type: 'maison', equipment: ['bar', 'band'], isDefault: true, evil: '<script>' } }] });
  const e = (await A.get('/api/items?since=0')).data.items.find((i) => i.id === 'e1').d;
  assert.equal(e.evil, undefined); assert.deepEqual(e.equipment, ['bar', 'band']); assert.equal(e.isDefault, true);
});
await ok('synchronisation incrémentale par curseur serveur', async () => {
  const r = await A.get('/api/items?since=0'); const cursor = r.data.now;
  await A.post('/api/items', { changes: [{ c: 'jnote', id: 'n1', u: 4000, d: { date: Date.now(), text: 'note' } }] });
  const inc = await A.get('/api/items?since=' + (cursor - 1)); assert.ok(inc.data.items.some((i) => i.id === 'n1'));
});

console.log('Réglages');
await ok('réglages nettoyés ; les anciennes clés (niveau, objectifs, journal) ne sont jamais effacées par un client V2', async () => {
  env.DB.raw.prepare("UPDATE user_data SET settings_json=? WHERE user_id=(SELECT id FROM users WHERE username='Alice')").run(JSON.stringify({ level: { boulderMax: '6B', years: 3 }, goals: [{ id: 'old', name: 'Ancien objectif', target: 5 }], climbingLogs: [{ id: 'l', grade: '6a', result: 'work' }] }));
  const r = await A.post('/api/settings', { settings: { sound: false, defaultRest: 90, evil: 1, level: { years: 4 } } });
  assert.equal(r.data.settings.evil, undefined); assert.equal(r.data.settings.defaultRest, 90);
  const s = (await A.get('/api/settings')).data.settings;
  assert.equal(s.goals[0].name, 'Ancien objectif'); assert.equal(s.level.boulderMax, '6B'); assert.equal(s.level.years, 4);
  assert.equal(s.climbingLogs[0].result, 'work', 'le résultat « après travail » n’est plus déformé');
});

console.log('Calendrier et historique');
await ok('calendrier : création, lecture, suppression ; IDOR impossible', async () => {
  const ev = { id: 'ev1', date: '2026-10-01', title: 'Séance', sessionId: 'a' };
  assert.equal((await A.post('/api/calendar', ev)).status, 200);
  assert.equal((await B.post('/api/calendar', { ...ev, title: 'volé' })).status, 409, 'même identifiant qu’un autre compte : refus, pas d’écrasement');
  assert.equal((await A.get('/api/calendar')).data.events[0].title, 'Séance');
  assert.equal((await B.del('/api/calendar/ev1')).status, 404);
  assert.equal((await A.del('/api/calendar/ev1')).status, 200); assert.equal((await A.del('/api/calendar/ev1')).status, 404, 'pas de faux succès');
});
await ok('historique : enregistrement, questionnaire et temps conservés, séance future refusée', async () => {
  const e = hist('h1', Date.now() - 3600000, { data: { rpe: 4, note: 'note', activeSeconds: 1500, pausedSeconds: 60, questionnaire: { felt: ['grand_dorsal', '<x>'], hardest: 'Squats', difficulty: 4, comment: 'bien', likes: [{ name: 'Squats', value: 'aime' }] }, swaps: [{ from: 'Pompes', to: 'Dips' }], exercises: [{ name: 'Squats', caps: { force_jambes: 1 }, sets: [{ reps: 8, done: true }] }] } });
  assert.equal((await A.post('/api/history', e)).status, 200);
  const h = (await A.get('/api/history')).data.history[0];
  assert.equal(h.data.note, 'note'); assert.equal(h.data.pausedSeconds, 60); assert.deepEqual(h.data.questionnaire.felt, ['grand_dorsal']); assert.equal(h.data.swaps[0].to, 'Dips'); assert.equal(h.data.exercises[0].caps.force_jambes, 1);
  assert.equal((await A.post('/api/history', hist('hf', Date.now() + 86400000))).status, 400);
  assert.equal((await B.get('/api/history')).data.history.length, 0);
  assert.equal((await B.post('/api/history', hist('h1', Date.now()))).status, 409, 'identifiant d’un autre compte : jamais écrasé');
  assert.equal((await B.del('/api/history/h1')).status, 404);
});

console.log('Idempotence (X-Op-Id)');
await ok('réponse perdue puis rejeu : même réponse, aucun doublon ni faux échec', async () => {
  const op = { 'X-Op-Id': 'op-test-delete-0001' };
  assert.equal((await A.del('/api/history/h1', op)).status, 200);
  const replay = await A.del('/api/history/h1', op);
  assert.equal(replay.status, 200); assert.equal(replay.res.headers.get('X-Op-Replay'), '1');
  const op2 = { 'X-Op-Id': 'op-test-bug-00001' };
  await A.post('/api/bugs', { title: 'Un bug', description: 'Description du bug' }, op2); await A.post('/api/bugs', { title: 'Un bug', description: 'Description du bug' }, op2);
  assert.equal((await A.get('/api/bugs/mine')).data.reports.length, 1);
});
await ok('identifiant d’opération d’un autre compte : jamais réutilisé', async () => {
  const r = await B.del('/api/history/h1', { 'X-Op-Id': 'op-test-delete-0001' }); assert.equal(r.status, 404);
});

console.log('Exercices personnels et communs');
await ok('exercices personnels privés ; modification par un autre compte impossible', async () => {
  const r = await A.post('/api/exercises/personal', { exercise: { name: 'Mon exo', sets: 2, caps: { gainage_anterieur: 1 } } });
  assert.equal((await A.get('/api/exercises')).data.personal[0].data.caps.gainage_anterieur, 1);
  assert.equal((await B.get('/api/exercises')).data.personal.length, 0);
  assert.equal((await B.put('/api/exercises/personal/' + r.data.id, { exercise: { name: 'Hack' } })).status, 404);
  assert.equal((await B.del('/api/exercises/personal/' + r.data.id)).status, 404);
});
await ok('exercices communs : vides au départ ; créateur ou admin seulement', async () => {
  assert.equal((await B.get('/api/exercises')).data.common.length, 0, 'aucun exercice commun préchargé');
  const r = await A.post('/api/exercises/common', { name: 'Traction archer', exercise: { sets: 3 } });
  assert.equal((await B.put('/api/exercises/common/' + r.data.id, { name: 'X' })).status, 403);
  assert.equal((await A.put('/api/exercises/common/' + r.data.id, { name: 'Traction archer', sets: 4 })).status, 200);
  assert.equal((await B.del('/api/exercises/common/' + r.data.id)).status, 403);
});

console.log('Bibliothèque commune (séances)');
const session = { id: 'loc1', name: 'Séance d’Alice', activity: 'conditioning', exercises: [{ id: 'e', name: 'Tractions', libId: 'pullup', sets: 4, repsMin: 5, repsMax: 8, load: '12,5 kg', note: 'Dernière fois : 12 kg × 8', why: 'tu l’aimes', caps: { tirage_vertical: 1 } }, { name: 'Gainage', load: 'Poids du corps' }], notes: [{ title: 'Pourquoi cette séance', text: 'Tes tractions max : 9' }, { title: 'Consignes', text: 'Bien s’échauffer' }], explain: { facts: ['Tractions max : 9 (mesuré)'] }, context: { envName: 'Chez moi', goalId: 'g1', plannedMin: 30 } };
let sid;
await ok('bibliothèque commune vide sur une installation neuve', async () => assert.equal((await A.get('/api/shared?scope=common')).data.items.length, 0));
await ok('publication : données personnelles retirées, niveau estimé avec critères', async () => {
  const r = await A.post('/api/shared', { id: 'pub1', scope: 'common', session, title: 'Tirage pour tous' });
  assert.equal(r.status, 200); sid = r.data.id; assert.ok(['debutant', 'intermediaire', 'avance'].includes(r.data.level.level)); assert.ok(r.data.level.criteria.length >= 6);
  const d = (await B.get('/api/shared/' + sid)).data.item;
  const ex = d.session.exercises[0];
  assert.equal(ex.note, ''); assert.equal(ex.why, ''); assert.equal(ex.load, '', 'charge chiffrée personnelle retirée'); assert.equal(d.session.exercises[1].load, 'Poids du corps');
  assert.ok(!d.session.notes.some((n) => /pourquoi/i.test(n.title))); assert.equal(d.session.explain, null); assert.equal(d.session.context.envName, ''); assert.equal(d.session.context.goalId, '');
  assert.equal(d.author, 'Alice'); assert.equal(d.canEdit, false); assert.equal(d.canDelete, false);
  const raw = env.DB.raw.prepare("SELECT data_json FROM shared_sessions WHERE id='pub1'").get().data_json; assert.ok(!raw.includes('Dernière fois'), 'rien de privé stocké');
});
await ok('rejeu de la publication : aucun doublon ; même identifiant par un autre compte refusé', async () => {
  assert.equal((await A.post('/api/shared', { id: 'pub1', scope: 'common', session })).data.replay, true);
  assert.equal((await B.post('/api/shared', { id: 'pub1', scope: 'common', session })).status, 409);
  assert.equal((await A.get('/api/shared?scope=common')).data.items.length, 1);
});
await ok('le créateur modifie sa contribution ; les autres (ID fabriqué, faux owner) sont refusés', async () => {
  const cur = (await A.get('/api/shared/' + sid)).data.item;
  assert.equal((await A.put('/api/shared/' + sid, { session: { ...session, name: 'Tirage v2' }, baseUpdatedAt: cur.updatedAt })).status, 200);
  assert.equal((await B.put('/api/shared/' + sid, { session: { ...session, owner_id: 'x', created_by: 'x' }, owner: 'Alice' })).status, 403);
  assert.equal((await B.del('/api/shared/' + sid)).status, 403);
  assert.equal((await A.put('/api/shared/' + sid, { session, baseUpdatedAt: 1 })).status, 409, 'conflit de version détecté');
  assert.equal((await A.get('/api/shared/' + sid)).data.item.title, 'Tirage v2');
});

console.log('Administration (EDIT_PASSWORD)');
await ok('utilisateur non admin : routes admin refusées même fabriquées', async () => {
  assert.equal((await B.get('/api/admin/bugs')).status, 403);
  assert.equal((await B.post('/api/admin/bugs/x', { status: 'done' })).status, 403);
  assert.equal((await B.post('/api/auth/me', { isAdmin: true })).status, 404);
  assert.equal((await B.get('/api/auth/me')).data.user.isAdmin, false);
});
await ok('mauvais secret refusé ; force brute concurrente bornée (atomique)', async () => {
  assert.equal((await C.post('/api/admin/activate', { password: 'faux' })).status, 403);
  const rs = await Promise.all(Array.from({ length: 12 }, () => C.post('/api/admin/activate', { password: 'faux' })));
  assert.ok(rs.filter((r) => r.status === 403).length <= 4, 'au plus 5 essais par fenêtre'); assert.ok(rs.some((r) => r.status === 429));
});
await ok('bon EDIT_PASSWORD → le compte connecté devient admin (déterminé par la session, pas par un user_id)', async () => {
  const r = await B.post('/api/admin/activate', { password: 'Adm1n-Secret!', user_id: 'id-de-quelqu-un-d-autre' });
  assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.data).includes('Adm1n'));
  assert.equal((await B.get('/api/auth/me')).data.user.isAdmin, true);
  assert.equal((await A.get('/api/auth/me')).data.user.isAdmin, false, 'un autre compte ne devient pas admin');
  const b2 = new Client(env); await b2.post('/api/auth/login', { username: 'bob', password: 'motdepasse2' });
  assert.equal((await b2.get('/api/auth/me')).data.user.isAdmin, true, 'conservé après reconnexion');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) c FROM system_state WHERE value LIKE ?').get('%Adm1n%').c, 0, 'secret jamais stocké en base');
});
await ok('admin : modifie puis supprime une contribution commune (suppression réelle)', async () => {
  const d = (await B.get('/api/shared/' + sid)).data.item; assert.equal(d.canEdit, true); assert.equal(d.canDelete, true);
  assert.equal((await B.put('/api/shared/' + sid, { session: { ...session, name: 'Modéré' } })).status, 200);
  assert.equal((await B.del('/api/shared/' + sid)).status, 200); assert.equal((await B.del('/api/shared/' + sid)).status, 404);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) c FROM shared_sessions WHERE id=?").get(sid).c, 0);
});
await ok('admin : aucun accès aux données privées des autres', async () => {
  assert.equal((await B.get('/api/history')).data.history.length, 0);
  assert.equal((await B.get('/api/items?since=0')).data.items.length, 1, 'uniquement sa propre donnée');
});
await ok('quitter le rôle admin', async () => { await B.post('/api/admin/deactivate', {}); assert.equal((await B.get('/api/admin/bugs')).status, 403); await B.post('/api/admin/activate', { password: 'Adm1n-Secret!' }); });
await ok('EDIT_PASSWORD absent → administration non configurée (503), jamais ouverte', async () => {
  const env2 = makeEnv({ EDIT_PASSWORD: undefined }); const x = new Client(env2); await x.register('Solo');
  assert.equal((await x.post('/api/admin/activate', { password: '' })).status, 503);
  assert.equal((await x.post('/api/admin/activate', { password: 'undefined' })).status, 503);
});

console.log('Signalements de bugs');
await ok('envoi, stockage, auteur ; lisibles par l’auteur et l’admin seulement', async () => {
  const r = await C.post('/api/bugs', { title: 'Chrono <b>bloqué</b>', description: '<img src=x onerror=alert(1)> ne répond plus', page: 'seance', appVersion: '8.0.0', userAgent: 'Test', password: 'motdepasse3' });
  assert.equal(r.status, 200);
  const row = env.DB.raw.prepare('SELECT * FROM bug_reports WHERE id=?').get(r.data.id);
  assert.ok(!JSON.stringify(row).includes('motdepasse3'), 'aucun champ inconnu (ex. mot de passe) stocké');
  assert.equal((await C.get('/api/bugs/mine')).data.reports.length, 1);
  assert.ok(!(await A.get('/api/bugs/mine')).data.reports.some((x) => x.id === r.data.id), 'A ne voit pas les signalements de C');
  const list = (await B.get('/api/admin/bugs')).data.reports; const x = list.find((y) => y.id === r.data.id);
  assert.equal(x.author, 'Carla'); assert.equal(x.page, 'seance');
  assert.equal((await B.post('/api/admin/bugs/' + r.data.id, { status: 'done' })).status, 200);
  assert.equal((await B.get('/api/admin/bugs?status=done')).data.reports.length, 1);
  assert.equal((await B.post('/api/admin/bugs/inconnu', { status: 'done' })).status, 404);
});
await ok('anti-spam : 5 par heure', async () => {
  let last; for (let i = 0; i < 6; i++) last = await A.post('/api/bugs', { title: 'Spam ' + i, description: 'encore un bug' });
  assert.equal(last.status, 429);
});

console.log('Profil public et séances publiques');
await ok('privé par défaut : rien de lisible, même sans compte', async () => {
  assert.equal((await new Client(env).get('/api/public/u/Alice')).status, 404);
  assert.equal((await C.get('/api/social/user/Alice')).status, 404);
});
await ok('profil public : seuls les éléments choisis sont publiés', async () => {
  await A.post('/api/items', { changes: [{ c: 'perf', id: 'pp1', u: 5000, d: { metricId: 'max_tractions', value: 12, date: Date.now() } }, { c: 'perf', id: 'pp2', u: 5000, d: { metricId: 'max_pompes', value: 40, date: Date.now() } }] });
  await A.post('/api/social/profile', { visibility: 'public', bio: 'Grimpeuse', shareStats: false, shareRecords: false, shareSessions: false, share: { perfs: ['pp1'], goals: ['g1'] } });
  const v = (await new Client(env).get('/api/public/u/alice')).data.person;
  assert.equal(v.bio, 'Grimpeuse'); assert.equal(v.perfs.length, 1); assert.equal(v.perfs[0].text, '12 reps'); assert.equal(v.goals[0].label, 'Front lever');
  assert.equal(v.stats, null); assert.equal(v.records, null);
  assert.ok(!JSON.stringify(v).includes('40'), 'performance non choisie absente');
});
await ok('séance publique : lisible et copiable, modifiable par son seul auteur', async () => {
  const r = await A.post('/api/shared', { scope: 'public', session: { ...session, id: 'x' }, title: 'Ma séance publique' });
  const pub = (await new Client(env).get('/api/public/s/' + r.data.id)).data.item; assert.equal(pub.title, 'Ma séance publique'); assert.equal(pub.session.exercises[0].note, '');
  assert.equal((await C.put('/api/shared/' + r.data.id, { session })).status, 403);
  assert.equal((await B.put('/api/shared/' + r.data.id, { session })).status, 403, 'même l’admin ne réécrit pas une séance publique d’autrui');
  assert.equal((await new Client(env).get('/api/public/u/alice')).data.person.sessions.length, 1);
  await A.post('/api/social/profile', { visibility: 'private' });
  assert.equal((await new Client(env).get('/api/public/u/alice')).status, 404, 'repasser en privé coupe l’accès');
});
await ok('abonnements : profil « abonnés » lisible seulement après acceptation', async () => {
  await C.post('/api/social/profile', { visibility: 'followers', shareStats: true });
  assert.equal((await A.post('/api/social/follow', { username: 'carla' })).data.status, 'pending');
  assert.equal((await A.get('/api/social/user/carla')).status, 404);
  const me = (await C.get('/api/social/me')).data; await C.post('/api/social/respond', { id: me.pending[0].id, accept: true });
  assert.equal((await A.get('/api/social/user/carla')).status, 200);
  assert.equal((await C.post('/api/social/respond', { id: me.pending[0].id, accept: true })).status, 200);
  assert.equal((await B.post('/api/social/respond', { id: me.pending[0].id, accept: false })).status, 404, 'IDOR sur les demandes impossible');
  assert.equal((await A.get('/api/social/search?q=%25%25')).data.users.length, 0);
});

console.log('Fichiers statiques et en-têtes');
await ok('seuls les fichiers du site sont publics ; en-têtes de sécurité', async () => {
  for (const p of ['/worker.js', '/wrangler.json', '/schema.js', '/README.md', '/server/publish.js', '/public/app.js', '/migrate.js', '/%2e%2e/worker.js', '/tests/e2e.mjs']) assert.equal((await worker.fetch(new Request(ORIGIN + p), env)).status, 404, p);
  for (const p of ['/', '/index.html', '/app.js', '/sw.js', '/manifest.json', '/brain.js']) assert.equal((await worker.fetch(new Request(ORIGIN + p), env)).status, 200, p);
  const r = await worker.fetch(new Request(ORIGIN + '/'), env);
  assert.match(r.headers.get('Content-Security-Policy'), /default-src 'self'/); assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff'); assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
  assert.equal((await worker.fetch(new Request(ORIGIN + '/', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/sw.js'), env)).headers.get('Cache-Control'), 'no-cache');
});
await ok('erreur serveur : message générique, aucun détail interne', async () => {
  const bad = { ...env, DB: { prepare: () => { throw new Error('SQLITE secret interne'); }, batch: () => { throw new Error('boom'); } } };
  const r = await worker.fetch(new Request(ORIGIN + '/api/auth/me', { headers: { Origin: ORIGIN } }), bad);
  const t = await r.text(); assert.ok(r.status >= 500); assert.ok(!t.includes('SQLITE'));
});

console.log('Compte : mot de passe et suppression');
await ok('changement de mot de passe : ancien requis, autres sessions déconnectées', async () => {
  const a2 = new Client(env); await a2.post('/api/auth/login', { username: 'alice', password: 'motdepasse1' });
  assert.equal((await A.post('/api/auth/password', { current: 'faux', next: 'nouveaumdp1' })).status, 403);
  assert.equal((await A.post('/api/auth/password', { current: 'motdepasse1', next: 'nouveaumdp1' })).status, 200);
  assert.equal((await a2.get('/api/auth/me')).status, 401); assert.equal((await A.get('/api/auth/me')).status, 200);
});
await ok('déconnexion : jeton révoqué côté serveur', async () => {
  const c = new Client(env); await c.post('/api/auth/login', { username: 'alice', password: 'nouveaumdp1' }); const t = c.jar.session;
  await c.post('/api/auth/logout'); const x = new Client(env); x.jar.session = t; assert.equal((await x.get('/api/auth/me')).status, 401);
});
await ok('suppression du compte : données privées effacées, contributions communes anonymisées', async () => {
  await A.post('/api/shared', { id: 'reste', scope: 'common', session });
  assert.equal((await A.post('/api/auth/delete', { password: 'faux' })).status, 403);
  assert.equal((await A.post('/api/auth/delete', { password: 'nouveaumdp1' })).status, 200);
  for (const t of ['user_data', 'history', 'user_items', 'user_exercises', 'calendar_events', 'profiles', 'op_log', 'bug_reports', 'sessions']) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id NOT IN (SELECT id FROM users)`).get().c, 0, t);
  const left = (await B.get('/api/shared?scope=common')).data.items.find((x) => x.id === 'reste'); assert.ok(left); assert.equal(left.author, null);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) c FROM shared_sessions WHERE scope='public'").get().c, 0, 'séances publiques supprimées');
  assert.equal((await A.get('/api/auth/me')).status, 401);
});
done('tests Worker / D1 / sécurité');
