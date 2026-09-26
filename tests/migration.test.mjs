// tests/migration.test.mjs — compatibilité : ancien schéma D1, anciens comptes, anciens réglages → données V2.
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { makeD1 } from './d1shim.mjs';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { legacyItems, gradeFromText } from '../public/migrate.js';
import { cleanItem } from '../public/items.js';

console.log('Ancien schéma (v5) complété sans perte');
const env = makeEnv({ DB: makeD1() });
env.DB.raw.exec(`
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE user_data (user_id TEXT PRIMARY KEY, seances_json TEXT NOT NULL DEFAULT '[]', settings_json TEXT NOT NULL DEFAULT '{}', favorites_json TEXT NOT NULL DEFAULT '[]', goals_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
CREATE TABLE history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT, session_name TEXT NOT NULL, started_at INTEGER NOT NULL, duration_seconds INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE profiles (user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', public_profile INTEGER NOT NULL DEFAULT 0, share_progress INTEGER NOT NULL DEFAULT 0, share_workouts INTEGER NOT NULL DEFAULT 0, avatar_emoji TEXT NOT NULL DEFAULT '🧗', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE follows (follower_id TEXT NOT NULL, followed_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(follower_id,followed_id));
`);
// Ancien compte (même algorithme PBKDF2 100 000 itérations) avec anciens réglages v7 riches.
const salt = btoa('0123456789abcdef').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ancien-mdp-123'), 'PBKDF2', false, ['deriveBits']);
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('0123456789abcdef'), iterations: 100000, hash: 'SHA-256' }, key, 256));
let s = ''; for (const x of bits) s += String.fromCharCode(x); const hash = btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const oldSettings = {
  level: { boulderMax: '6B', routeMax: '6C', years: 4 }, equipment: { wall: true, hangboard: true, bar: true }, avoid: { fingers: false, shoulders: true },
  climbingLogs: [{ id: 'l1', date: 1700000000000, type: 'Bloc', grade: '7a', result: 'work', attempts: 5, style: 'Dévers et réglettes', note: 'enfin' }, { id: 'l2', date: 1700000100000, type: 'Voie', grade: 'jaune', result: 'send', attempts: 1, style: 'Arête', note: '' }],
  goals: [{ id: 'g1', name: '20 tractions', target: 20, kind: 'manual', current: 12, unit: 'reps' }, { id: 'g2', name: '30 séances', target: 30, kind: 'sessions', since: '2026-01-01' }],
  sportProfile: { version: 2, activities: { strength: { id: 'strength', label: 'Musculation' }, custom_tennis_ab12: { id: 'custom_tennis_ab12', label: 'Tennis', custom: true, domains: [{ key: 'service', name: 'Service' }, { key: 'jambes', name: 'Jambes' }] } }, metrics: [{ id: 'm1', name: 'Max tractions', activityId: 'strength', domain: 'tirage', value: 12, unit: 'reps', updatedAt: 1700000000000 }, { id: 'm2', name: 'Vitesse de service', activityId: 'custom_tennis_ab12', domain: 'service', value: 150, unit: 'km/h', score: 70 }] },
};
env.DB.raw.prepare("INSERT INTO users(id,username,password_hash,password_salt,created_at,updated_at) VALUES('old','Ancien',?,?,1,1)").run(hash, salt);
env.DB.raw.prepare("INSERT INTO user_data(user_id,seances_json,settings_json,updated_at) VALUES('old',?,?,1)").run('[{"id":"z","name":"Vieille séance","exercises":[{"name":"Tractions","type":"reps","amount":5,"sets":3}]}]', JSON.stringify(oldSettings));
env.DB.raw.prepare("INSERT INTO history(id,user_id,session_name,started_at,duration_seconds,data_json) VALUES('oh','old','Ancienne',1700000000000,1800,'{\"rpe\":3,\"exercises\":[{\"name\":\"Tractions\",\"sets\":[{\"reps\":8}]}]}')").run();
env.DB.raw.prepare("INSERT INTO profiles(user_id,display_name,public_profile,share_progress,share_workouts,created_at,updated_at) VALUES('old','Ancien',1,0,1,1,1)").run();
env.DB.raw.prepare("INSERT INTO users(id,username,password_hash,password_salt,created_at,updated_at) VALUES('old2','Ami','x','y',1,1)").run();
env.DB.raw.prepare("INSERT INTO follows(follower_id,followed_id,created_at) VALUES('old','old2',1)").run();
env.DB.raw.prepare("INSERT INTO follows(follower_id,followed_id,created_at) VALUES('old','compte-supprime',1)").run(); // abonnement orphelin (cas réel)

await ok('mise à niveau du schéma au premier appel (colonnes et tables ajoutées, rien supprimé)', async () => {
  assert.equal((await worker.fetch(new Request('https://site.test/api/auth/me'), env)).status, 401);
  const cols = (t) => new Set(env.DB.raw.prepare(`PRAGMA table_info(${t})`).all().map((x) => x.name));
  assert.ok(cols('users').has('is_admin')); assert.ok(cols('user_data').has('v2_migrated')); assert.ok(cols('profiles').has('share_json')); assert.ok(cols('profiles').has('visibility'));
  assert.ok(cols('follows').has('followee_id')); assert.ok(cols('user_items').has('server_at')); assert.ok(cols('shared_sessions').size); assert.ok(cols('bug_reports').size); assert.ok(cols('op_log').size);
  assert.equal(env.DB.raw.prepare("SELECT visibility FROM profiles WHERE user_id='old'").get().visibility, 'public');
  assert.equal(env.DB.raw.prepare("SELECT status FROM follows WHERE follower_id='old'").get().status, 'accepted');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) c FROM history").get().c, 1);
});
await ok('la mise à niveau est idempotente (deuxième appel sans erreur)', async () => {
  const env2 = { ...env }; // même base, nouvelle vérification
  assert.equal((await worker.fetch(new Request('https://site.test/api/health'), env2)).status, 200);
});
const old = new Client(env);
await ok('ancien compte : connexion, séances et historique intacts', async () => {
  assert.equal((await old.post('/api/auth/login', { username: 'ancien', password: 'ancien-mdp-123' })).status, 200);
  assert.equal((await old.get('/api/sync')).data.items[0].name, 'Vieille séance');
  assert.equal((await old.get('/api/sync')).data.items[0].exercises[0].repsMin, 5, 'ancien format d’exercice converti');
  assert.equal((await old.get('/api/history')).data.history[0].sessionName, 'Ancienne');
});
await ok('anciens réglages migrés vers les données V2 (profil, maxima, journal, objectifs, activités, métriques)', async () => {
  const items = (await old.get('/api/items?since=0')).data.items;
  const by = (c) => items.filter((i) => i.c === c);
  const maxB = by('perf').find((p) => p.d.metricId === 'max_bloc'); assert.equal(maxB.d.grade.label, '6B'); assert.equal(maxB.d.grade.systemId, 'font');
  assert.equal(by('perf').find((p) => p.d.metricId === 'max_voie').d.grade.label, '6c');
  assert.deepEqual(by('env')[0].d.equipment.sort(), ['bar', 'hangboard', 'wall']);
  const asc = by('ascent'); assert.equal(asc.length, 2); assert.equal(asc.find((a) => a.id.includes('l1')).d.result, 'work'); assert.equal(asc.find((a) => a.id.includes('l1')).d.grade.label, '7A');
  assert.ok(asc.find((a) => a.id.includes('l1')).d.styles.includes('st-devers')); assert.equal(asc.find((a) => a.id.includes('l2')).d.gradeText, 'jaune', 'cotation inconnue gardée en texte, pas inventée');
  assert.equal(by('goal').length, 2); assert.equal(by('goal').find((g) => g.d.label === '20 tractions').d.current, 12); assert.equal(by('goal').find((g) => g.d.label === '30 séances').d.type, 'sessions');
  assert.ok(by('activity').some((a) => a.d.preset === 'strength')); assert.ok(by('activity').some((a) => a.d.label === 'Tennis'));
  assert.equal(by('category').length, 2); assert.equal(by('perf').find((p) => p.d.metricId === 'max_tractions').d.value, 12, 'métrique connue reliée à la métrique native');
  const tennis = by('metric').find((m) => m.d.label === 'Vitesse de service'); assert.ok(tennis.d.caps[0].id.includes('service'), 'catégorie propre à l’activité, pas une capacité d’escalade');
});
await ok('migration exécutée une seule fois ; anciens réglages conservés', async () => {
  const n1 = (await old.get('/api/items?since=0')).data.items.length;
  const n2 = (await old.get('/api/items?since=0')).data.items.length; assert.equal(n1, n2);
  const st = JSON.parse(env.DB.raw.prepare("SELECT settings_json FROM user_data WHERE user_id='old'").get().settings_json);
  assert.equal(st.goals.length, 2); assert.equal(st.climbingLogs.length, 2);
});
await ok('nouveau compte sur base mise à niveau : fonctionne, aucune donnée commune préchargée', async () => {
  const n = new Client(env); await n.register('Nouveau');
  assert.equal((await n.get('/api/items?since=0')).data.items.length, 0);
  assert.equal((await n.get('/api/shared?scope=common')).data.items.length, 0);
  assert.equal((await n.get('/api/exercises')).data.common.length, 0);
  assert.equal((await n.get('/api/social/me')).status, 200, 'profil créé malgré l’ancienne structure de la table');
  assert.equal((await n.post('/api/social/profile', { visibility: 'public', bio: 'Salut' })).status, 200);
  assert.equal((await new Client(env).get('/api/public/u/Nouveau')).data.person.bio, 'Salut');
});
await ok('ancienne version KV : seul le PREMIER compte récupère ses séances personnelles (jamais la bibliothèque commune)', async () => {
  const e = makeEnv({ SEANCES_KV: { get: async (k) => (k === 'seances' ? JSON.stringify([{ id: 'kv1', name: 'Séance KV', exercises: [] }]) : null) } });
  const a = new Client(e), b = new Client(e); await a.register('Premier'); await b.register('Second');
  assert.equal((await a.get('/api/sync')).data.items[0].name, 'Séance KV'); assert.equal((await b.get('/api/sync')).data.items.length, 0);
  assert.equal((await a.get('/api/shared?scope=common')).data.items.length, 0);
});

console.log('Fonctions de migration (pures)');
await ok('cotation texte : conversion seulement si exacte', async () => {
  assert.equal(gradeFromText('6b+', 'bloc').label, '6B+'); assert.equal(gradeFromText('V4', 'bloc').systemId, 'vscale'); assert.equal(gradeFromText('jaune', 'bloc'), null);
});
await ok('identifiants déterministes : relancer ne duplique rien', async () => {
  const a = legacyItems(oldSettings, 1).map((x) => x.id), b = legacyItems(oldSettings, 2).map((x) => x.id);
  assert.deepEqual(a, b); assert.equal(new Set(a).size, a.length);
  for (const it of legacyItems(oldSettings)) assert.ok(cleanItem(it), 'chaque item migré est valide : ' + it.c);
});
await ok('réglages vides ou corrompus : aucune erreur, aucune donnée inventée', async () => {
  assert.deepEqual(legacyItems(null), []); assert.deepEqual(legacyItems({ level: { boulderMax: '???' } }), []);
});
done('tests de migration');
