// tests/sports-server.test.mjs — conditions en falaise : la météo est demandée par le serveur (coordonnées arrondies,
// compte requis, nombre de demandes limité), réponse réduite à ce qui sert, erreurs du service gérées.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done } from './helpers.mjs';
console.log('Conditions en falaise (serveur)');
const fake = (calls, { status = 200, body } = {}) => async (url) => { calls.push(url); return new Response(JSON.stringify(body ?? { hourly: { time: ['2026-10-01T08:00', '2026-10-01T09:00'], temperature_2m: [10.04, 11], relative_humidity_2m: [50, 55], precipitation: [0, 0.2], wind_speed_10m: [12, 14], extra: [1] }, latitude: 48.4 }), { status }); };
await ok('météo : coordonnées arrondies au centième, réponse réduite, compte requis', async () => {
  const calls = [], env = makeEnv({ FETCH: fake(calls) }), u = new Client(env); await u.register('meteo');
  assert.equal((await new Client(env).get('/api/weather?lat=48.4&lon=2.6')).status, 401);
  const r = await u.get('/api/weather?lat=48.40567&lon=2.63211'); assert.equal(r.status, 200);
  assert.match(calls[0], /latitude=48\.41&longitude=2\.63&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&past_days=1&forecast_days=3&timezone=auto/);
  assert.deepEqual(Object.keys(r.data.hourly).sort(), ['precipitation', 'relative_humidity_2m', 'temperature_2m', 'time', 'wind_speed_10m']); assert.equal(r.data.hourly.temperature_2m[0], 10);
  for (const q of ['lat=100&lon=2', 'lat=abc&lon=2', 'lat=48', '']) assert.equal((await u.get('/api/weather?' + q)).status, 400, q);
});
await ok('météo : service en panne ou réponse inattendue → message clair ; trop de demandes → refus', async () => {
  const env = makeEnv({ FETCH: fake([], { status: 503 }) }), u = new Client(env); await u.register('meteo2');
  const r = await u.get('/api/weather?lat=48&lon=2'); assert.equal(r.status, 502); assert.match(r.data.error, /indisponible/);
  const env2 = makeEnv({ FETCH: fake([], { body: { nope: 1 } }) }), u2 = new Client(env2); await u2.register('meteo3'); assert.equal((await u2.get('/api/weather?lat=48&lon=2')).status, 502);
  const env3 = makeEnv({ FETCH: fake([]) }), u3 = new Client(env3); await u3.register('meteo4');
  let last = 0; for (let k = 0; k < 61; k++) last = (await u3.get('/api/weather?lat=48&lon=2')).status;
  assert.equal(last, 429);
});
done('tests des conditions en falaise');
