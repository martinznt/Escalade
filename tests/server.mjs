// tests/server.mjs — serveur local de test : vrai worker.js + faux D1 (SQLite en mémoire) + fichiers de public/.
// Utilisé par les tests navigateur (tests/e2e.mjs) et utilisable à la main : node tests/server.mjs 8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';
import { makeD1 } from './d1shim.mjs';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
export function makeEnv(extra = {}) {
  return {
    DB: makeD1(), SEANCES_KV: { get: async () => null }, EDIT_PASSWORD: 'secret-admin-de-test',
    ASSETS: { fetch: async (req) => { let p = new URL(req.url).pathname; if (p === '/') p = '/index.html'; const f = path.join(PUBLIC, p); if (!f.startsWith(PUBLIC) || !fs.existsSync(f)) return new Response('introuvable', { status: 404 }); return new Response(fs.readFileSync(f), { headers: { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' } }); } },
    ...extra,
  };
}
export async function startServer(env = makeEnv(), port = 0) {
  const state = { env, fail: null }; // fail: (req) => Response | null — permet de simuler des pannes réseau/serveur
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const url = `http://localhost:${server.address().port}${req.url}`;
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    let r = state.fail ? await state.fail(request.clone()) : null;
    if (r === 'drop') { req.socket.destroy(); return; }
    if (!r) r = await worker.fetch(request, state.env);
    if (state.after) r = (await state.after(request, r)) || r;
    if (r === 'drop') { req.socket.destroy(); return; }
    const headers = {}; for (const [k, v] of r.headers) if (k !== 'set-cookie') headers[k] = v;
    const sc = r.headers.getSetCookie?.() || []; if (sc.length) headers['set-cookie'] = sc;
    res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(port, ok));
  state.server = server; state.base = `http://localhost:${server.address().port}`;
  return state;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = await startServer(makeEnv(), Number(process.argv[2]) || 8787);
  console.log('Serveur de test sur', s.base, '(EDIT_PASSWORD = secret-admin-de-test)');
}
