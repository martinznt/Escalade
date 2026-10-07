import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { buildContext } from '../public/brain.js';
import { coachProfile } from '../public/experience.js';
import { normalizeHistory } from '../public/shared.js';

const marker = (provider = 'file', channel = 'file', id = 'private-file') => ({ provider, channel, id, private: true, excludeAI: true });
const entry = (id, { external, native = false, duration = 600 } = {}) => ({
  id, sessionName: native ? 'Séance native visible' : 'PRIVATE_IMPORT_' + id,
  startedAt: Date.now() - 86400000, durationSeconds: duration,
  data: { activity: native ? 'strength' : 'running', rpe: 3,
    exercises: [{ name: native ? 'Exercice natif' : 'PRIVATE_IMPORT_EXERCISE', sets: [{ reps: native ? 8 : 77, load: 0, done: true }] }],
    ...(external ? { external } : {}),
  },
});
async function member(name = 'PrivacyMember') {
  const env = makeEnv(), client = new Client(env);
  const user = (await client.register(name)).data.user;
  return { env, client, user };
}
async function seed(env, user, h) {
  await env.DB.prepare('INSERT INTO history(id,user_id,session_name,started_at,duration_seconds,data_json) VALUES(?,?,?,?,?,?)')
    .bind(h.id, user.id, h.sessionName, h.startedAt, h.durationSeconds, JSON.stringify(h.data)).run();
}
const history = async (client) => {
  const r = await client.get('/api/history'); assert.equal(r.status, 200); return r.data.history;
};
const publish = async (client) => {
  const r = await client.post('/api/social/profile', { visibility: 'public', shareStats: true, shareRecords: true, shareSessions: true });
  assert.equal(r.status, 200);
};

await ok('un fichier importé conserve une provenance privée forcée et reste dans l’historique du propriétaire', async () => {
  const { client } = await member();
  const h = entry('file-private', { external: { ...marker(), private: false, excludeAI: false } });
  assert.equal((await client.post('/api/history', h)).status, 200);
  const rows = await history(client);
  assert.equal(rows.length, 1); assert.deepEqual(rows[0].data.external, marker());
  assert.equal(rows[0].sessionName, h.sessionName);
});

await ok('édition partielle, omission et faux marqueur ne retirent pas la provenance de l’import', async () => {
  const { client } = await member();
  const original = marker('strava', 'file', 'fingerprint-original');
  const h = entry('file-edit', { external: original });
  assert.equal((await client.post('/api/history', h)).status, 200);
  for (const data of [{ note: 'Note personnelle' }, { external: null }, { external: { ...marker('file', 'file', 'other'), private: false, excludeAI: false } }]) {
    const r = await client.post('/api/history', { ...h, data });
    assert.equal(r.status, 200);
    const rows = await history(client); assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].data.external, original);
  }
});

await ok('une provenance Strava/API ne peut être fabriquée ni sur une nouvelle entrée ni sur une entrée native', async () => {
  const { client } = await member();
  const forged = entry('forged-api', { external: marker('strava', 'api', '123') });
  assert.equal((await client.post('/api/history', forged)).status, 403);
  assert.equal((await history(client)).length, 0);
  const native = entry('native-before-forgery', { native: true });
  assert.equal((await client.post('/api/history', native)).status, 200);
  assert.equal((await client.post('/api/history', { ...native, data: { external: marker('strava', 'api', '999') } })).status, 403);
  const rows = await history(client); assert.equal(rows.length, 1); assert.equal(rows[0].data.external, undefined);
});

await ok('provenance inconnue ou identifiant externe invalide : refus sans mutation', async () => {
  const { client } = await member();
  for (const external of [{ ...marker(), provider: 'unknown-vendor' }, { ...marker(), id: '<private>' }]) {
    assert.equal((await client.post('/api/history', entry('invalid-external', { external }))).status, 400);
  }
  assert.equal((await history(client)).length, 0);
});

await ok('le profil public et social exclut fichiers, Strava/API et ancien CSV des séances, records et statistiques', async () => {
  const { env, client, user } = await member('PublicPrivacy');
  const fixtures = [entry('native-public', { native: true }), entry('file-public-hidden', { external: marker() }),
    entry('api-public-hidden', { external: marker('strava', 'api', '123') }), entry('csv-abc123')];
  for (const h of fixtures) await seed(env, user, h);
  await publish(client);
  assert.equal((await history(client)).length, fixtures.length, 'les imports restent dans l’historique personnel');
  for (const r of [await new Client(env).get('/api/public/u/PublicPrivacy'), await client.get('/api/social/user/PublicPrivacy')]) {
    assert.equal(r.status, 200); const p = r.data.person;
    assert.equal(p.stats.sessions7, 1); assert.equal(p.stats.sessions30, 1); assert.equal(p.stats.minutes30, 10);
    assert.equal(p.recent.length, 1); assert.equal(p.recent[0].name, 'Séance native visible');
    assert.ok(JSON.stringify(p.records).includes('Exercice natif'), 'le record natif reste visible');
    assert.ok(!JSON.stringify(p).includes('PRIVATE_IMPORT'), 'aucun nom, exercice ni record importé exposé');
  }
});

await ok('statistiques et liste administrateur comptent uniquement les séances natives, même au-dessus du seuil anonyme', async () => {
  const env = makeEnv(), admin = new Client(env);
  await admin.register('PrivacyAdmin'); assert.equal((await admin.post('/api/admin/activate', { password: 'Adm1n-Secret!' })).status, 200);
  for (let i = 0; i < 3; i++) {
    const c = new Client(env), user = (await c.register('PrivacyPerson' + i)).data.user;
    await seed(env, user, entry('native-stats-' + i, { native: true }));
    await seed(env, user, entry('file-stats-' + i, { external: marker('file', 'file', 'file-' + i), duration: 36000 }));
    await seed(env, user, entry('api-stats-' + i, { external: marker('strava', 'api', String(100 + i)), duration: 36000 }));
    await seed(env, user, entry('csv-' + i + 'abc123', { duration: 36000 }));
  }
  const r = await admin.get('/api/admin/stats'); assert.equal(r.status, 200);
  assert.equal(r.data.sessions7, 3); assert.equal(r.data.sessions30, 3); assert.equal(r.data.people30, 3); assert.equal(r.data.minutes30, 30);
  assert.equal(r.data.weeks.reduce((n, week) => n + week.sessions, 0), 3);
  assert.deepEqual(r.data.activities.map((a) => [a.activity, a.sessions, a.people]), [['strength', 3, 3]]);
  const listed = await admin.get('/api/admin/users'); assert.equal(listed.status, 200);
  for (const u of listed.data.users.filter((u) => u.username.startsWith('PrivacyPerson'))) assert.equal(u.sessionsDone, 1);
});

await ok('le résumé du coach retire tous les imports et performances CSV, tout en conservant les données natives', () => {
  const now = Date.now();
  const c = buildContext({ now, history: [entry('native-coach', { native: true }), entry('file-coach-hidden', { external: marker() }),
    entry('api-coach-hidden', { external: marker('strava', 'api', '123') }), entry('csv-def456')], items: [
    { c: 'perf', id: 'native-perf', u: now, d: { metricId: 'max_tractions', value: 8, date: now - 1000, source: 'measured', unit: 'NATIVE_PERF' } },
    { c: 'perf', id: 'csv-ghi789', u: now, d: { metricId: 'max_pompes', value: 77, date: now - 1000, source: 'imported', unit: 'PRIVATE_CSV_PERF' } },
  ] });
  const profile = coachProfile(c);
  assert.ok(profile.includes('Séance native visible')); assert.ok(profile.includes('NATIVE_PERF'));
  assert.ok(!profile.includes('PRIVATE_IMPORT')); assert.ok(!profile.includes('PRIVATE_CSV_PERF'));
});

await ok('ancien CSV sans marqueur reste privé après normalisation et édition, sans perdre les séances natives', async () => {
  const { env, client, user } = await member('LegacyCsvPrivacy');
  const old = entry('csv-jkl012'); await seed(env, user, old);
  const local = normalizeHistory(old); assert.equal(coachProfile(buildContext({ history: [local] })).includes('PRIVATE_IMPORT'), false);
  assert.equal((await client.post('/api/history', { ...old, data: { note: 'Note après migration' } })).status, 200);
  const rows = await history(client); assert.equal(rows.length, 1); assert.equal(rows[0].data.external.private, true); assert.equal(rows[0].data.external.excludeAI, true);
  await publish(client); const visible = (await new Client(env).get('/api/public/u/LegacyCsvPrivacy')).data.person;
  assert.equal(visible.stats.sessions30, 0); assert.deepEqual(visible.recent, []);
});

await ok('un POST natif tardif ne retire pas la provenance d’un import créé entre lecture et écriture', async () => {
  const { env, client } = await member('RacePrivacy'); await publish(client);
  const id = 'ordinary-race-private', originalPrepare = env.DB.prepare;
  let release, arrived, armed = true;
  const pending = new Promise((r) => { release = r; }), ready = new Promise((r) => { arrived = r; });
  const wrap = (stmt, sql) => ({
    bind(...args) { return wrap(stmt.bind(...args), sql); },
    async first() {
      const row = await stmt.first();
      if (armed && /^SELECT\s/i.test(sql) && /\bFROM history\b/i.test(sql) && stmt.args.includes(id) && row === null) {
        armed = false; arrived(); await pending;
      }
      return row;
    },
    all() { return stmt.all(); }, run() { return stmt.run(); }, _runSync() { return stmt._runSync(); },
  });
  env.DB.prepare = (sql) => wrap(originalPrepare(sql), sql);
  let stale;
  try {
    stale = client.post('/api/history', entry(id, { native: true })); await ready;
    const imported = entry(id, { external: marker() }); assert.equal((await client.post('/api/history', imported)).status, 200);
    release(); const late = await stale;
    assert.equal(late.status, 409, 'l’écriture obsolète doit être refusée, pas reclasser l’import');
    const rows = await history(client); assert.equal(rows.length, 1); assert.deepEqual(rows[0].data.external, marker());
    const p = (await new Client(env).get('/api/public/u/RacePrivacy')).data.person;
    assert.equal(p.stats.sessions30, 0); assert.deepEqual(p.recent, []);
  } finally { release(); if (stale) await stale; env.DB.prepare = originalPrepare; }
});

await ok('rejouer le même import fichier conserve une seule activité privée', async () => {
  const { client } = await member(); const h = entry('file-retry', { external: marker() });
  for (let i = 0; i < 3; i++) assert.equal((await client.post('/api/history', h)).status, 200);
  const rows = await history(client); assert.equal(rows.length, 1); assert.equal(rows[0].id, h.id); assert.deepEqual(rows[0].data.external, marker());
});

done('tests de confidentialité des imports');
