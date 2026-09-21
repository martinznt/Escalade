import assert from 'node:assert/strict';
import worker from '../worker.js';
import { makeD1 } from './d1shim.mjs';

const env = {
  DB: makeD1(),
  EDIT_CODE: 'code-secret-42',
  SEANCES_KV: { get: async () => null },
  ASSETS: { fetch: async () => new Response('ok') },
};
const ORIGIN = 'https://site.test';
// Structure réellement utilisée par les anciennes migrations.
env.DB.raw.exec(`
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE user_data (user_id TEXT PRIMARY KEY, seances_json TEXT NOT NULL DEFAULT '[]', settings_json TEXT NOT NULL DEFAULT '{}', favorites_json TEXT NOT NULL DEFAULT '[]', goals_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
CREATE TABLE calendar_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_date TEXT NOT NULL, session_id TEXT, title TEXT, completed INTEGER NOT NULL DEFAULT 0, recurrence_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT, session_name TEXT NOT NULL, started_at INTEGER NOT NULL, duration_seconds INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE common_exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, data_json TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE user_exercises (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(user_id,name));
CREATE TABLE system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE profiles (user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', public_profile INTEGER NOT NULL DEFAULT 0, share_progress INTEGER NOT NULL DEFAULT 0, share_workouts INTEGER NOT NULL DEFAULT 0, avatar_emoji TEXT NOT NULL DEFAULT '🧗', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE follows (follower_id TEXT NOT NULL, followed_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(follower_id,followed_id));
`);
env.DB.raw.prepare("INSERT INTO users(id,username,password_hash,password_salt,created_at,updated_at) VALUES('u1','Ancien','x','y',1,1)").run();
env.DB.raw.prepare("INSERT INTO users(id,username,password_hash,password_salt,created_at,updated_at) VALUES('u2','Autre','x','y',1,1)").run();
env.DB.raw.prepare("INSERT INTO profiles(user_id,display_name,public_profile,share_progress,share_workouts,created_at,updated_at) VALUES('u1','Ancien',1,0,1,1,1)").run();
env.DB.raw.prepare("INSERT INTO follows(follower_id,followed_id,created_at) VALUES('u1','u2',1)").run();

const r = await worker.fetch(new Request(ORIGIN + '/api/auth/me'), env);
assert.equal(r.status, 401);
const cols = (table) => new Set(env.DB.raw.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name));
const pc = cols('profiles');
assert.ok(pc.has('visibility') && pc.has('share_stats') && pc.has('share_records') && pc.has('share_sessions'));
const p = env.DB.raw.prepare("SELECT visibility,share_stats,share_records,share_sessions FROM profiles WHERE user_id='u1'").get();
assert.equal(p.visibility, 'public'); assert.equal(p.share_stats, 0); assert.equal(p.share_records, 0); assert.equal(p.share_sessions, 1);
const fc = cols('follows');
assert.ok(fc.has('id') && fc.has('followee_id') && fc.has('status'));
const row = env.DB.raw.prepare("SELECT follower_id,followee_id,status FROM follows WHERE follower_id='u1'").get();
assert.equal(row.follower_id, 'u1'); assert.equal(row.followee_id, 'u2'); assert.equal(row.status, 'accepted');
console.log('Legacy schema upgrade OK');
