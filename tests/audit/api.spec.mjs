// tests/audit/api.spec.mjs — droits, données personnelles et protections du serveur, sans navigateur.
// Toutes les routes sont relues dans worker.js : un oubli de garde sur une route ajoutée plus tard fera échouer ce test.
// Serveur de test isolé (base SQLite en mémoire), comptes de test seulement.
import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from 'playwright/test';
import { makeEnv } from '../server.mjs';
import { Client } from '../helpers.mjs';
import { ROOT, ADMIN_PASSWORD } from './fixtures.mjs';

const test = base;
const SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
/** Routes littérales déclarées dans worker.js : [méthode, chemin]. */
const ROUTES = [...new Set([...SRC.matchAll(/p === '(\/api\/[^']+)' && m === '(GET|POST|PUT|DELETE)'/g)].map((x) => `${x[2]} ${x[1]}`))].map((x) => x.split(' '));
/** Routes ouvertes sans compte, voulues (lues avant la garde « Connexion requise » de handleApi). */
const PUBLIC = new Set(['GET /api/health', 'GET /api/version', 'GET /api/global', 'GET /api/changes', 'GET /api/move', 'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/handoff', 'POST /api/handoff/peek', 'POST /api/handoff/claim', 'GET /api/push/key', 'GET /api/push/message']);
const GEMINI = 'AIza-cle-gemini-de-test-ne-doit-jamais-sortir';

async function accounts(env, ...names) { const out = {}; for (const n of names) { const c = out[n] = new Client(env); c.userId = (await c.register(n)).data.user.id; } return out; }

test('API01 chaque route d’administration : 401 sans compte, 403 pour un membre, rôle vérifié, ouverte au super-administrateur', async () => {
  const env = makeEnv(), u = await accounts(env, 'ApiAnon', 'ApiMembre', 'ApiSuper', 'ApiContenu'), anon = new Client(env);
  expect((await u.ApiSuper.post('/api/admin/activate', { password: ADMIN_PASSWORD })).status).toBe(200);
  expect((await u.ApiContenu.post('/api/admin/activate', { password: ADMIN_PASSWORD })).status).toBe(200);
  expect((await u.ApiSuper.post(`/api/admin/users/${u.ApiContenu.userId}/roles`, { roles: ['content'] })).status).toBe(200);
  const admin = ROUTES.filter(([, p]) => p.startsWith('/api/admin/') && !['/api/admin/activate', '/api/admin/deactivate'].includes(p));
  expect(admin.length, 'routes d’administration trouvées dans worker.js').toBeGreaterThan(20);
  // Chemins inventés : la garde est un préfixe, elle doit aussi les couvrir.
  for (const [m, p] of [...admin, ['GET', '/api/admin/route-inventee'], ['POST', '/api/admin/users/inconnu/roles'], ['DELETE', '/api/admin/bugs/x']]) {
    const call = (c) => c.call(m, p, m === 'GET' || m === 'DELETE' ? undefined : {});
    expect.soft((await call(anon)).status, `${m} ${p} sans compte`).toBe(401);
    expect.soft((await call(u.ApiMembre)).status, `${m} ${p} membre`).toBe(403);
    const sup = (await call(u.ApiSuper)).status; expect.soft([401, 403].includes(sup), `${m} ${p} super-administrateur (${sup})`).toBe(false);
  }
  for (const [m, p] of [['GET', '/api/admin/users'], ['GET', '/api/admin/bugs'], ['POST', '/api/admin/maintenance'], ['POST', `/api/admin/users/${u.ApiMembre.userId}/roles`]]) expect.soft((await u.ApiContenu.call(m, p, m === 'GET' ? undefined : {})).status, `${m} ${p} avec le seul rôle Contenu`).toBe(403);
  expect((await u.ApiContenu.get('/api/admin/studio')).status, 'rôle Contenu : le Studio reste ouvert').toBe(200);
  // « Quitter l'administration » : sans effet pour un membre, retire bien le rôle à un administrateur.
  expect((await u.ApiMembre.post('/api/admin/deactivate', {})).status).toBeLessThan(500); expect((await u.ApiMembre.get('/api/admin/users')).status).toBe(403);
  expect((await u.ApiSuper.post('/api/admin/deactivate', {})).status).toBe(200); expect((await u.ApiSuper.get('/api/admin/users')).status).toBe(403);
});

test('API02 chaque route privée refuse un visiteur sans compte (401) ; les routes publiques sont celles prévues', async () => {
  const env = makeEnv(), anon = new Client(env);
  const priv = ROUTES.filter(([m, p]) => !p.startsWith('/api/admin/') && !PUBLIC.has(`${m} ${p}`));
  expect(priv.length).toBeGreaterThan(40);
  for (const [m, p] of priv) expect.soft((await anon.call(m, p, m === 'GET' || m === 'DELETE' ? undefined : {})).status, `${m} ${p} sans compte`).toBe(401);
  for (const key of PUBLIC) { const [m, p] = key.split(' '); expect.soft((await anon.call(m, p, m === 'GET' ? undefined : {})).status, `${key} sans compte`).not.toBe(500); }
});

test('API03 accès croisé (IDOR) : Bob ne lit, ne modifie ni ne supprime rien d’Alice, même avec les bons identifiants', async () => {
  const env = makeEnv(), { Alice, Bob } = await accounts(env, 'Alice', 'Bob'), now = Date.now();
  await Alice.post('/api/sync', { items: [{ id: 'sea-a', name: 'Séance privée Alice', exercises: [] }], tomb: {} });
  await Alice.post('/api/history', { id: 'hist-a', sessionName: 'Fait par Alice', startedAt: now - 3600000, durationSeconds: 600, data: { rpe: 2, exercises: [] } });
  await Alice.post('/api/calendar', { id: 'cal-a', date: new Date(now + 86400000).toISOString().slice(0, 10), time: '18:00', title: 'Rendez-vous Alice', completed: false, recurrence: null, meta: {} });
  await Alice.post('/api/items', { changes: [{ c: 'perf', id: 'perf-a', u: now, d: { metricId: 'max_tractions', value: 9, date: now } }] });
  const personal = await Alice.post('/api/exercises/personal', { id: 'pex-a', exercise: { name: 'Exercice perso Alice' } });
  // Écritures de Bob sur les identifiants d'Alice.
  const writes = [await Bob.post('/api/sync', { items: [{ id: 'sea-a', name: 'Piratée', exercises: [] }], tomb: {} }), await Bob.post('/api/history', { id: 'hist-a', sessionName: 'Piratée', startedAt: now - 3600000, durationSeconds: 1, data: {} }),
    await Bob.post('/api/calendar', { id: 'cal-a', date: '2030-01-01', title: 'Piraté', meta: {} }), await Bob.post('/api/items', { changes: [{ c: 'perf', id: 'perf-a', u: now + 1000, d: { metricId: 'max_tractions', value: 1, date: now } }] }),
    await Bob.del('/api/calendar/cal-a'), await Bob.del('/api/history/hist-a'), await Bob.put('/api/exercises/personal/pex-a', { exercise: { name: 'Piraté' } }), await Bob.del('/api/exercises/personal/pex-a')];
  for (const r of writes) expect.soft(r.status, 'aucune réponse 500').toBeLessThan(500);
  expect((await Alice.get('/api/sync')).data.items.find((x) => x.id === 'sea-a')?.name).toBe('Séance privée Alice');
  expect((await Alice.get('/api/history')).data.history.find((x) => x.id === 'hist-a')?.sessionName).toBe('Fait par Alice');
  expect((await Alice.get('/api/calendar')).data.events.find((x) => x.id === 'cal-a')?.title).toBe('Rendez-vous Alice');
  expect((await Alice.get('/api/items')).data.items.find((x) => x.id === 'perf-a' && x.c === 'perf')?.d.value).toBe(9);
  expect(personal.status).toBe(200); expect(JSON.stringify((await Alice.get('/api/exercises')).data)).toContain('Exercice perso Alice');
  // Lectures de Bob : rien d'Alice.
  const seen = JSON.stringify([(await Bob.get('/api/sync')).data, (await Bob.get('/api/history')).data, (await Bob.get('/api/calendar')).data, (await Bob.get('/api/items')).data, (await Bob.get('/api/exercises')).data]);
  for (const secret of ['Séance privée Alice', 'Fait par Alice', 'Rendez-vous Alice', 'Exercice perso Alice']) expect.soft(seen, secret).not.toContain(secret);
});

test('API04 en-têtes de sécurité sur la page, les scripts et l’API ; aucun cache des réponses privées', async () => {
  const env = makeEnv(), { Alice } = await accounts(env, 'Alice');
  for (const p of ['/', '/app.js', '/api/version']) {
    const r = await Alice.get(p), hd = (k) => r.res.headers.get(k) || '';
    expect.soft(hd('x-content-type-options'), `${p} nosniff`).toBe('nosniff');
    expect.soft(hd('referrer-policy'), `${p} referrer-policy`).not.toBe('');
    if (p === '/') { expect.soft(hd('content-security-policy'), 'CSP de la page').toMatch(/default-src[^;]*'self'/); expect.soft(hd('content-security-policy') + hd('x-frame-options'), 'pas d’intégration dans un cadre étranger').toMatch(/frame-ancestors 'none'|frame-ancestors 'self'|DENY|SAMEORIGIN/i); expect.soft(hd('content-security-policy'), 'aucun script en ligne autorisé').not.toMatch(/script-src[^;]*'unsafe-inline'/); }
  }
  const r = await Alice.get('/api/sync'); expect.soft(r.res.headers.get('cache-control') || '', 'réponse privée jamais mise en cache').toMatch(/no-store|private/);
});

test('API05 aucun secret ne sort : ni dans les fichiers publics, ni dans les réponses (même à un administrateur)', async () => {
  const env = makeEnv({ GEMINI_API_KEY: GEMINI }), { Admin } = await accounts(env, 'Admin');
  await Admin.post('/api/admin/activate', { password: ADMIN_PASSWORD });
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|html|json|css|txt|webmanifest)$/.test(f.name)) files.push(p); } }; walk(path.join(ROOT, 'public'));
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); for (const re of [/secret-admin-de-test/, /EDIT_PASSWORD\s*[:=]\s*['"][^'"]{4,}/, /AIza[0-9A-Za-z_-]{20,}/, /sk-[A-Za-z0-9]{20,}/, /BEGIN [A-Z ]*PRIVATE KEY/, /VAPID_PRIVATE/]) expect.soft(re.test(t), `${path.relative(ROOT, f)} : ${re}`).toBe(false); }
  const gets = ROUTES.filter(([m]) => m === 'GET').map(([, p]) => p);
  for (const p of gets) { const r = await Admin.get(p), body = r.data ? JSON.stringify(r.data) : await r.res.text(); expect.soft(body.includes(GEMINI) || body.includes(ADMIN_PASSWORD), `GET ${p} (admin)`).toBe(false); }
});

test('API06 suppression du compte : toutes ses lignes privées disparaissent de la base, la connexion échoue ensuite', async () => {
  const env = makeEnv(), { Alice, Bob } = await accounts(env, 'Alice', 'Bob'), now = Date.now();
  await Alice.post('/api/sync', { items: [{ id: 'sea-a', name: 'Séance', exercises: [] }], tomb: {} });
  await Alice.post('/api/history', { id: 'hist-a', sessionName: 'Fait', startedAt: now - 3600000, durationSeconds: 600, data: { exercises: [] } });
  await Alice.post('/api/calendar', { id: 'cal-a', date: new Date(now + 86400000).toISOString().slice(0, 10), title: 'RDV', meta: {} });
  await Alice.post('/api/items', { changes: [{ c: 'perf', id: 'perf-a', u: now, d: { metricId: 'max_tractions', value: 9, date: now } }] });
  await Alice.post('/api/bugs', { title: 'Un souci', description: 'Détail du souci', page: 'home' }); await Alice.post('/api/ical', {});
  await Bob.post('/api/sync', { items: [{ id: 'sea-b', name: 'Séance de Bob', exercises: [] }], tomb: {} });
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map((r) => r.name);
  const cols = async (t) => (await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name);
  const owned = async (id) => { const out = {}; for (const t of tables) for (const c of (await cols(t)).filter((c) => ['user_id', 'owner_id'].includes(c))) { const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${c}=?`).bind(id).first()).n; if (n) out[`${t}.${c}`] = n; } return out; };
  const before = await owned(Alice.userId); expect(Object.keys(before).length, 'Alice a des données en base').toBeGreaterThan(3);
  expect((await Alice.post('/api/auth/delete', { password: 'mauvais' })).status, 'mauvais mot de passe refusé').not.toBe(200);
  expect((await Alice.post('/api/auth/delete', { password: 'motdepasse1' })).status).toBe(200);
  const after = await owned(Alice.userId), leftover = Object.fromEntries(Object.entries(after).filter(([k]) => !/shared|common/.test(k)));
  expect(leftover, 'lignes encore rattachées au compte supprimé').toEqual({});
  expect((await new Client(env).post('/api/auth/login', { username: 'Alice', password: 'motdepasse1' })).status).toBe(401);
  expect((await Bob.get('/api/sync')).data.items.map((x) => x.id)).toEqual(['sea-b']);
});

test('API07 requêtes forgées : origine étrangère, type de contenu inattendu, corps énorme', async () => {
  const env = makeEnv(), { Alice } = await accounts(env, 'Alice');
  expect((await Alice.post('/api/sync', { items: [], tomb: {} }, { Origin: 'https://site-pirate.example' })).status).toBe(403);
  expect((await Alice.call('POST', '/api/sync', 'items=[]', { 'Content-Type': 'application/x-www-form-urlencoded' })).status).toBe(415);
  const huge = (await Alice.post('/api/sync', { items: [{ id: 'gros', name: 'x'.repeat(3_000_000), exercises: [] }], tomb: {} })).status; expect([400, 413]).toContain(huge);
  expect((await Alice.get('/api/sync')).data.items).toEqual([]);
});

test('API08 activation administrateur : mauvais mot de passe refusé, essais répétés bloqués, le bon ne marche plus ensuite pendant le blocage', async () => {
  const env = makeEnv(), { Alice } = await accounts(env, 'Alice'), codes = [];
  for (let i = 0; i < 8; i++) codes.push((await Alice.post('/api/admin/activate', { password: 'essai-' + i })).status);
  expect(codes.slice(0, 3).every((c) => c === 403 || c === 401), JSON.stringify(codes)).toBe(true); expect(codes.at(-1), 'blocage après plusieurs essais').toBe(429);
  expect((await Alice.post('/api/admin/activate', { password: ADMIN_PASSWORD })).status, 'bloqué même avec le bon mot de passe').toBe(429);
  expect((await Alice.get('/api/admin/users')).status).toBe(403);
});
