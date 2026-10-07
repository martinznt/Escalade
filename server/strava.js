// OAuth Strava et import volontaire. Endpoints fixes, aucune donnée sportive fournie par le navigateur,
// aucun webhook/suivi automatique, aucune performance créée, aucun jeton lisible hors du serveur.
const ROOT = '/api/integrations/strava';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const REVOKE_URL = 'https://www.strava.com/oauth/deauthorize';
const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities';
const TTL = 10 * 60000, PAGE_SIZE = 20, TIMEOUT = 12000;
const REQUIRED_SCOPE = 'activity:read_all';
const enc = new TextEncoder(), dec = new TextDecoder();
const query = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max) : '';
const b64 = (v) => btoa(String.fromCharCode(...v)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const bytes = (v) => Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (v) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v))));
const opaque = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const idOf = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v) ? v : '';
const tokenOf = (v) => typeof v === 'string' && /^[A-Za-z0-9._~-]{8,500}$/.test(v) ? v : '';
const scopeList = (v) => typeof v === 'string' ? [...new Set(v.split(',').filter(s => /^(read|read_all|activity:read|activity:read_all|profile:read_all)$/.test(s)))] : [];
const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };

function config(env, url) {
  const clientId = String(env.STRAVA_CLIENT_ID || ''), clientSecret = String(env.STRAVA_CLIENT_SECRET || '');
  const key = String(env.STRAVA_TOKEN_KEY || ''), redirectUri = String(env.STRAVA_REDIRECT_URI || '');
  let redirect;
  try { redirect = new URL(redirectUri); } catch { /* configuration incomplète */ }
  const configured = /^\d{1,15}$/.test(clientId) && /^[^\s]{16,200}$/.test(clientSecret) && opaque(key) && bytes(key).length === 32
    && redirect?.protocol === 'https:' && !redirect.username && !redirect.password && !redirect.search && !redirect.hash && redirect.pathname === ROOT + '/callback';
  return { configured: !!configured, canConnect: !!configured && redirect.origin === url.origin, clientId, clientSecret, key, redirectUri };
}
function requireConfig(env, url) {
  const c = config(env, url);
  if (!c.configured) throw failure('Strava n’est pas encore configuré sur ce serveur.', 503);
  if (!c.canConnect) throw failure('Cette adresse ne correspond pas à l’adresse Strava configurée.', 503);
  return c;
}
async function cipherKey(c) { return crypto.subtle.importKey('raw', bytes(c.key), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(c, userId, connectionId, tokens) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(userId + ':' + connectionId) }, await cipherKey(c), enc.encode(JSON.stringify(tokens)));
  return 'v1.' + b64(iv) + '.' + b64(new Uint8Array(data));
}
async function open(c, row) {
  try {
    const [version, nonce, payload, extra] = row.tokens_cipher.split('.');
    if (version !== 'v1' || !nonce || !payload || extra) throw new Error();
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(nonce), additionalData: enc.encode(row.user_id + ':' + row.connection_id) }, await cipherKey(c), bytes(payload));
    const tokens = parse(dec.decode(data));
    if (!tokenOf(tokens?.accessToken) || !tokenOf(tokens?.refreshToken)) throw new Error();
    return tokens;
  } catch { throw failure('La connexion Strava ne peut pas être lue. Déconnecte puis reconnecte Strava.', 409); }
}
async function officialJson(url, init = {}) {
  const controller = new AbortController(); let timer;
  const remote = (async () => {
    let response;
    try { response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal }); }
    catch { throw failure('Strava est temporairement inaccessible. Réessaie plus tard.', 502); }
    if (!response.ok) throw failure(response.status === 429 ? 'La limite Strava est atteinte. Réessaie plus tard.' : response.status === 401 || response.status === 403 ? 'Strava a refusé cette autorisation. Reconnecte Strava.' : 'Strava n’a pas confirmé la demande.', response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 409 : 502);
    const reader = response.body?.getReader();
    if (!reader) throw failure('Réponse Strava vide.', 502);
    const parts = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 500000) { await reader.cancel(); throw failure('Réponse Strava trop volumineuse.', 502); } parts.push(next.value); }
    const data = new Uint8Array(length); let at = 0; for (const part of parts) { data.set(part, at); at += part.length; }
    const value = parse(dec.decode(data));
    if (value === null) throw failure('Réponse Strava non vérifiable.', 502);
    return value;
  })();
  try { return await Promise.race([remote, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(failure('Strava n’a pas répondu à temps.', 504)); }, TIMEOUT); })]); }
  finally { clearTimeout(timer); }
}
const tokenRequest = (c, fields) => officialJson(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...fields }).toString() });
function cleanTokens(value, athleteId = '') {
  const accessToken = tokenOf(value?.access_token), refreshToken = tokenOf(value?.refresh_token), expiry = value?.expires_at;
  const returnedAthlete = value?.athlete ? idOf(value.athlete.id) : athleteId;
  if (!accessToken || !refreshToken || !returnedAthlete || athleteId && returnedAthlete !== athleteId || typeof expiry !== 'number' || !Number.isInteger(expiry) || expiry * 1000 <= Date.now() || expiry * 1000 > Date.now() + 30 * 86400000) throw failure('Strava a retourné une connexion incomplète ou ambiguë.', 502);
  return { athleteId: returnedAthlete, expiresAt: expiry * 1000, tokens: { accessToken, refreshToken } };
}
const connection = (env, userId) => query(env, 'SELECT * FROM strava_connections WHERE user_id=?', userId).first();
const requireConnection = async (env, userId) => { const row = await connection(env, userId); if (!row) throw failure('Connecte Strava avant de consulter les activités.', 409); return row; };
async function refresh(env, auth, c, force = false) {
  let row = await requireConnection(env, auth.user.id);
  if (!force && row.expires_at > Date.now() + 60000) return { row, tokens: await open(c, row) };
  const lease = random(), now = Date.now();
  row = await query(env, 'UPDATE strava_connections SET lease=?,lease_until=? WHERE user_id=? AND connection_id=? AND lease_until<=? RETURNING *', lease, now + TIMEOUT + 5000, row.user_id, row.connection_id, now).first();
  if (!row) throw failure('Une autre demande Strava est en cours. Réessaie dans un instant.', 425);
  try {
    const old = await open(c, row), next = cleanTokens(await tokenRequest(c, { grant_type: 'refresh_token', refresh_token: old.refreshToken }), row.athlete_id);
    const encrypted = await seal(c, row.user_id, row.connection_id, next.tokens);
    const updated = await query(env, "UPDATE strava_connections SET tokens_cipher=?,expires_at=?,revision=revision+1,lease='',lease_until=0 WHERE user_id=? AND connection_id=? AND revision=? AND lease=? RETURNING *", encrypted, next.expiresAt, row.user_id, row.connection_id, row.revision, lease).first();
    if (!updated) throw failure('La connexion Strava a changé pendant la demande. Aucune donnée importée.', 409);
    return { row: updated, tokens: next.tokens };
  } finally { await query(env, "UPDATE strava_connections SET lease='',lease_until=0 WHERE user_id=? AND connection_id=? AND lease=?", auth.user.id, row.connection_id, lease).run(); }
}
export async function stravaStatus(env, auth, url) {
  const c = config(env, url), row = await connection(env, auth.user.id);
  const count = await query(env, "SELECT COUNT(*) n FROM history WHERE user_id=? AND json_extract(data_json,'$.external.provider')='strava'", auth.user.id).first();
  return { configured: c.configured, canConnect: c.canConnect, connected: !!row, expiresAt: row?.expires_at || 0, connectedAt: row?.connected_at || 0, scopes: row ? parse(row.scopes_json) || [] : [], importedCount: Number(count?.n || 0) };
}
async function start(env, auth, url, body) {
  const c = requireConfig(env, url);
  if (body?.confirm !== true) throw failure('Confirme la connexion en lecture des activités Strava, y compris privées.');
  const token = random(), stateHash = await hash(token), now = Date.now(), old = await connection(env, auth.user.id);
  await env.DB.batch([
    query(env, 'DELETE FROM strava_oauth_states WHERE expires_at<=? OR (user_id=? AND session_hash=?)', now, auth.user.id, auth.hash),
    query(env, 'INSERT INTO strava_oauth_states(state_hash,user_id,session_hash,connection_id,expires_at) VALUES(?,?,?,?,?)', stateHash, auth.user.id, auth.hash, old?.connection_id || '', now + TTL),
  ]);
  const authorize = new URL('https://www.strava.com/oauth/authorize');
  for (const [key, value] of Object.entries({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code', approval_prompt: 'force', scope: 'read,' + REQUIRED_SCOPE, state: token })) authorize.searchParams.set(key, value);
  return { authorizeUrl: authorize.href, expiresAt: now + TTL };
}
async function callback(env, auth, url) {
  const c = requireConfig(env, url), state = url.searchParams.get('state');
  if (!opaque(state)) throw failure('Connexion Strava non terminée. Recommence depuis les intégrations.', 400);
  const stateHash = await hash(state), claim = await query(env, 'UPDATE strava_oauth_states SET claimed=1 WHERE state_hash=? AND user_id=? AND session_hash=? AND claimed=0 AND expires_at>? RETURNING *', stateHash, auth.user.id, auth.hash, Date.now()).first();
  if (!claim) throw failure('Cette connexion Strava a expiré ou a déjà été utilisée. Recommence.', 409);
  try {
    if (url.searchParams.has('error')) throw failure('La connexion Strava a été annulée.', 400);
    const scopes = scopeList(url.searchParams.get('scope')), code = url.searchParams.get('code');
    if (!scopes.includes(REQUIRED_SCOPE) || typeof code !== 'string' || !/^[A-Za-z0-9_-]{5,300}$/.test(code)) throw failure('La lecture des activités Strava n’a pas été autorisée.', 403);
    const next = cleanTokens(await tokenRequest(c, { grant_type: 'authorization_code', code, redirect_uri: c.redirectUri }));
    const existing = await connection(env, auth.user.id);
    if (existing && existing.athlete_id !== next.athleteId) throw failure('Un autre compte Strava est déjà connecté. Déconnecte-le avant de changer de compte Strava.', 409);
    const connectionId = random(), encrypted = await seal(c, auth.user.id, connectionId, next.tokens);
    const inserted = await env.DB.batch([
      query(env, 'DELETE FROM strava_previews WHERE user_id=? AND EXISTS (SELECT 1 FROM strava_oauth_states WHERE state_hash=? AND user_id=? AND session_hash=? AND claimed=1 AND expires_at>?)', auth.user.id, stateHash, auth.user.id, auth.hash, Date.now()),
      query(env, `INSERT INTO strava_connections(user_id,connection_id,athlete_id,tokens_cipher,scopes_json,connected_at,expires_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM strava_oauth_states WHERE state_hash=? AND user_id=? AND session_hash=? AND claimed=1 AND expires_at>?)
      AND NOT EXISTS (SELECT 1 FROM strava_connections WHERE user_id=? AND connection_id<>?)
      ON CONFLICT(user_id) DO UPDATE SET connection_id=excluded.connection_id,athlete_id=excluded.athlete_id,tokens_cipher=excluded.tokens_cipher,scopes_json=excluded.scopes_json,connected_at=excluded.connected_at,expires_at=excluded.expires_at,revision=strava_connections.revision+1,lease='',lease_until=0
      `, auth.user.id, connectionId, next.athleteId, encrypted, JSON.stringify(scopes), Date.now(), next.expiresAt, stateHash, auth.user.id, auth.hash, Date.now(), auth.user.id, claim.connection_id),
    ]);
    if (!inserted[1]?.meta?.changes) throw failure('La connexion ou la session a changé pendant l’autorisation. Recommence.', 409);
    return { redirect: '/#/settings/integrations' };
  } finally { await query(env, 'DELETE FROM strava_oauth_states WHERE state_hash=?', stateHash).run(); }
}
const SPORT_MAP = { Run: 'running', TrailRun: 'running', VirtualRun: 'running', Ride: 'cycling', MountainBikeRide: 'cycling', GravelRide: 'cycling', VirtualRide: 'cycling', Swim: 'swimming', WeightTraining: 'strength' };
function cleanActivity(value, athleteId) {
  const id = idOf(value?.id), owner = idOf(value?.athlete?.id), sportType = text(value?.sport_type || value?.type, 40);
  if (!id || owner !== athleteId || !sportType || typeof value.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.start_date)) throw failure('Une activité Strava ne peut pas être attribuée ou datée de façon fiable.', 502);
  const startedAt = Date.parse(value.start_date), durationSeconds = value.elapsed_time;
  if (!Number.isFinite(startedAt) || new Date(startedAt).toISOString().slice(0,19) !== value.start_date.slice(0,19) || startedAt < Date.now() - 5 * 365 * 86400000 || startedAt > Date.now() + 10 * 60000 || typeof durationSeconds !== 'number' || !Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 86400) return null;
  const metric = (name, key, limit) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= limit ? { [name]: value[key] } : {};
  return { id, name: text(value.name, 100) || 'Activité Strava', sportType, activityId: SPORT_MAP[sportType] || '', startedAt, durationSeconds,
    ...(typeof value.moving_time === 'number' && Number.isInteger(value.moving_time) && value.moving_time >= 0 && value.moving_time <= durationSeconds ? { activeSeconds: value.moving_time } : {}),
    ...metric('distanceMeters', 'distance', 2000000), ...metric('elevationMeters', 'total_elevation_gain', 50000), external: { provider: 'strava', id, channel: 'api', private: true, excludeAI: true } };
}
async function preview(env, auth, url, body) {
  const c = requireConfig(env, url), page = body?.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw failure('Page Strava invalide.');
  const { row, tokens } = await refresh(env, auth, c), remote = new URL(ACTIVITIES_URL);
  remote.searchParams.set('page', String(page)); remote.searchParams.set('per_page', String(PAGE_SIZE));
  const values = await officialJson(remote.href, { headers: { Authorization: 'Bearer ' + tokens.accessToken, Accept: 'application/json' } });
  if (!Array.isArray(values) || values.length > PAGE_SIZE) throw failure('Liste d’activités Strava non vérifiable.', 502);
  const cleaned = values.map(value => cleanActivity(value, row.athlete_id)), activities = cleaned.filter(Boolean);
  if (new Set(activities.map(a => a.id)).size !== activities.length) throw failure('La liste Strava contient des identifiants ambigus.', 502);
  const imported = ((await query(env, "SELECT activity_id FROM external_activity_imports WHERE user_id=? AND provider='strava'", auth.user.id).all()).results || []).map(r => r.activity_id);
  const token = random(), now = Date.now();
  await query(env, 'DELETE FROM strava_previews WHERE expires_at<=?', now).run();
  const saved = await query(env, `INSERT INTO strava_previews(token_hash,user_id,session_hash,connection_id,activities_json,expires_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM strava_connections WHERE user_id=? AND connection_id=?)
    AND EXISTS (SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?)`, await hash(token), auth.user.id, auth.hash, row.connection_id, JSON.stringify(activities), now + TTL, auth.user.id, row.connection_id, auth.hash, auth.user.id, now).run();
  if (!saved.meta?.changes) throw failure('La connexion ou la session a changé pendant la lecture. Aucune activité importée.', 409);
  return { previewToken: token, expiresAt: now + TTL, activities: activities.map(a => ({ ...a, imported: imported.includes(a.id) })), nextPage: values.length === PAGE_SIZE && page < 100 ? page + 1 : null, unavailableCount: values.length - activities.length };
}
async function importActivities(env, auth, body) {
  if (body?.confirm !== true) throw failure('Confirme explicitement les activités à importer.');
  if (!opaque(body.previewToken) || !Array.isArray(body.activityIds) || !body.activityIds.length || body.activityIds.length > PAGE_SIZE || body.activityIds.some(id => typeof id !== 'string' || !idOf(id)) || new Set(body.activityIds).size !== body.activityIds.length) throw failure('Sélection Strava invalide.');
  const record = await query(env, 'SELECT p.* FROM strava_previews p JOIN strava_connections c ON c.user_id=p.user_id AND c.connection_id=p.connection_id WHERE p.token_hash=? AND p.user_id=? AND p.session_hash=? AND p.expires_at>?', await hash(body.previewToken), auth.user.id, auth.hash, Date.now()).first();
  const activities = parse(record?.activities_json);
  if (!record || !Array.isArray(activities)) throw failure('Cette prévisualisation Strava a expiré. Consulte à nouveau les activités.', 409);
  const selected = body.activityIds.map(id => activities.find(a => a.id === id));
  if (selected.some(a => !a)) throw failure('Une activité sélectionnée ne figure pas dans la prévisualisation.', 409);
  const history = await Promise.all(selected.map(async a => {
    const measurements = [a.sportType, a.distanceMeters !== undefined ? a.distanceMeters + ' m' : '', a.elevationMeters !== undefined ? 'dénivelé ' + a.elevationMeters + ' m' : ''].filter(Boolean).join(' · ').slice(0, 100);
    const digest = await hash(auth.user.id + ':strava:' + a.id);
    return { id: 'strava-' + digest, sessionId: null, sessionName: a.name, startedAt: a.startedAt, durationSeconds: a.durationSeconds,
      data: { activity: a.activityId, activeSeconds: a.activeSeconds || 0, rpe: 0, exercises: [], quickLog: { durationKnown: true, performance: measurements, order: 'main' }, external: a.external } };
  }));
  const expected = JSON.stringify(history.map((h, i) => ({ historyId: h.id, activityId: selected[i].id })));
  const count = await query(env, 'SELECT COUNT(*) n FROM history WHERE user_id=?', auth.user.id).first();
  const existing = await query(env, "SELECT COUNT(*) n FROM history WHERE user_id=? AND id IN (SELECT json_extract(value,'$.historyId') FROM json_each(?))", auth.user.id, expected).first();
  if (Number(count?.n || 0) + selected.length - Number(existing?.n || 0) > 20000) throw failure('Historique plein.', 413);
  const guard = `EXISTS (SELECT 1 FROM strava_previews p JOIN strava_connections c ON c.user_id=p.user_id AND c.connection_id=p.connection_id WHERE p.token_hash=? AND p.user_id=? AND p.session_hash=? AND p.expires_at>?)
    AND NOT EXISTS (SELECT 1 FROM history h JOIN json_each(?) selected ON h.id=json_extract(selected.value,'$.historyId')
      WHERE h.user_id<>? OR COALESCE(json_extract(h.data_json,'$.external.provider'),'')<>'strava' OR COALESCE(json_extract(h.data_json,'$.external.channel'),'')<>'api'
      OR COALESCE(json_extract(h.data_json,'$.external.id'),'')<>json_extract(selected.value,'$.activityId') OR COALESCE(json_extract(h.data_json,'$.external.private'),0)<>1 OR COALESCE(json_extract(h.data_json,'$.external.excludeAI'),0)<>1)`;
  const previewHash = await hash(body.previewToken), now = Date.now(), statements = [];
  for (let i = 0; i < selected.length; i++) {
    const h = history[i];
    statements.push(query(env, `INSERT INTO history(id,user_id,session_id,session_name,started_at,duration_seconds,data_json) SELECT ?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO NOTHING`, h.id, auth.user.id, null, h.sessionName, h.startedAt, h.durationSeconds, JSON.stringify(h.data), previewHash, auth.user.id, auth.hash, now, expected, auth.user.id));
    statements.push(query(env, `INSERT INTO external_activity_imports(user_id,provider,activity_id,history_id) SELECT ?,'strava',?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM history WHERE id=? AND user_id=?) ON CONFLICT(user_id,provider,activity_id) DO NOTHING`, auth.user.id, selected[i].id, h.id, previewHash, auth.user.id, auth.hash, now, expected, auth.user.id, h.id, auth.user.id));
  }
  const results = await env.DB.batch(statements), imported = [], duplicates = [], created = [];
  for (let i = 0; i < selected.length; i++) { const entry = { activityId: selected[i].id, historyId: history[i].id }; if (results[i * 2]?.meta?.changes) { imported.push(entry); created.push(history[i]); } else duplicates.push(entry); }
  const current = await query(env, 'SELECT 1 ok FROM strava_connections WHERE user_id=? AND connection_id=?', auth.user.id, record.connection_id).first();
  if (!current) throw failure('La connexion Strava a été supprimée. Aucune activité conservée.', 409);
  const mappings = ((await query(env, "SELECT activity_id,history_id FROM external_activity_imports WHERE user_id=? AND provider='strava'", auth.user.id).all()).results || []);
  if (selected.some((a, i) => !mappings.some(m => m.activity_id === a.id && m.history_id === history[i].id))) throw failure('La prévisualisation a expiré ou un identifiant est déjà utilisé. Aucune sélection ambiguë importée.', 409);
  return { imported, duplicates, history: created };
}
async function disconnect(env, auth, url) {
  const row = await connection(env, auth.user.id), c = config(env, url); let tokens = null;
  if (row && c.configured) try { tokens = await open(c, row); } catch { /* le nettoyage local reste possible */ }
  const result = await env.DB.batch([
    query(env, "DELETE FROM history WHERE user_id=? AND json_extract(data_json,'$.external.provider')='strava'", auth.user.id),
    query(env, "DELETE FROM external_activity_imports WHERE user_id=? AND provider='strava'", auth.user.id),
    query(env, 'DELETE FROM strava_previews WHERE user_id=?', auth.user.id),
    query(env, 'DELETE FROM strava_oauth_states WHERE user_id=?', auth.user.id),
    query(env, 'DELETE FROM strava_connections WHERE user_id=?', auth.user.id),
  ]);
  let revoked = false;
  if (tokens) try { const value = await officialJson(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ access_token: tokens.accessToken }).toString() }); revoked = object(value) && (value.access_token === tokens.accessToken || idOf(value.id) === row.athlete_id); } catch { /* révocation distante non confirmée */ }
  return { disconnected: true, revoked, importedRemoved: Number(result[0]?.meta?.changes || 0), ...(row && !revoked ? { notice: 'Les données Strava ont été supprimées ici. La révocation sur Strava n’a pas été confirmée : retire aussi cette application dans les réglages Strava.' } : {}) };
}
export async function stravaRoute(env, auth, url, method, body) {
  const path = url.pathname;
  if (path === ROOT + '/status' && method === 'GET') return stravaStatus(env, auth, url);
  if (path === ROOT + '/start' && method === 'POST') return start(env, auth, url, body);
  if (path === ROOT + '/callback' && method === 'GET') return callback(env, auth, url);
  if (path === ROOT + '/preview' && method === 'POST') return preview(env, auth, url, body);
  if (path === ROOT + '/import' && method === 'POST') return importActivities(env, auth, body);
  if (path === ROOT + '/refresh' && method === 'POST') { const value = await refresh(env, auth, requireConfig(env, url), true); return { refreshed: true, expiresAt: value.row.expires_at }; }
  if (path === ROOT && method === 'DELETE') return disconnect(env, auth, url);
  throw failure('Route Strava inconnue.', 404);
}
