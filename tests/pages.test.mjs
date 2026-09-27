// tests/pages.test.mjs — la porte d'entrée Pages (adresse courte) transmet tout au Worker principal, sans rien casser.
import assert from 'node:assert/strict';
import pages from '../pages/_worker.js';
import worker from '../worker.js';
import { makeEnv, ok, done } from './helpers.mjs';

const env = makeEnv();
const PAGES = 'https://seances-entrainement.pages.dev';
const APP = { fetch: (req) => worker.fetch(req, env) }; // liaison de service simulée
const call = (path, init = {}) => pages.fetch(new Request(PAGES + path, init), { APP });
console.log('Adresse courte (Cloudflare Pages)');
await ok('page d’accueil et fichiers servis via l’adresse courte', async () => {
  assert.equal((await call('/')).status, 200); assert.equal((await call('/app.js')).status, 200);
});
await ok('inscription via l’adresse courte : cookie de session et contrôle d’origine OK', async () => {
  const r = await call('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: PAGES, 'CF-Connecting-IP': '10.7.7.7' }, body: JSON.stringify({ username: 'court', password: 'motdepasse1' }) });
  assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie') || '', /HttpOnly/);
  const bad = await call('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://pirate.example', 'CF-Connecting-IP': '10.7.7.8' }, body: JSON.stringify({ username: 'pirate', password: 'motdepasse1' }) });
  assert.equal(bad.status, 403, 'origine étrangère toujours refusée');
});
await ok('sans liaison configurée : message clair (503), jamais d’écran blanc', async () => {
  const r = await pages.fetch(new Request(PAGES + '/'), {}); assert.equal(r.status, 503); assert.match(await r.text(), /liaison de service/);
});
done('tests de l’adresse courte');
