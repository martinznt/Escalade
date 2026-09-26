// tests/helpers.mjs — client HTTP de test (cookies) branché directement sur worker.fetch, sans réseau.
import worker from '../worker.js';
import { makeD1 } from './d1shim.mjs';

export const ORIGIN = 'https://site.test';
export function makeEnv(extra = {}) {
  return { DB: makeD1(), SEANCES_KV: { get: async () => null }, EDIT_PASSWORD: 'Adm1n-Secret!', ASSETS: { fetch: async (req) => new Response('<html>ok ' + new URL(req.url).pathname + '</html>', { headers: { 'Content-Type': 'text/html' } }) }, ...extra };
}
let ipSeq = 0;
export class Client {
  constructor(env, { ip } = {}) { this.env = env; this.jar = {}; this.ip = ip || `10.1.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`; }
  async call(method, path, body, extra = {}) {
    const headers = { Origin: ORIGIN, 'CF-Connecting-IP': this.ip, ...extra };
    if (body !== undefined && !('Content-Type' in extra)) headers['Content-Type'] = 'application/json';
    const c = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
    const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), this.env);
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = sc.split('; '); const i = pair.indexOf('='); const name = pair.slice(0, i), val = pair.slice(i + 1);
      if (/Max-Age=0/i.test(attrs.join(';')) || val === '') delete this.jar[name]; else this.jar[name] = val;
    }
    let data = null; try { data = await res.clone().json(); } catch { /* pas de JSON */ }
    return { status: res.status, data, res };
  }
  get(p, h) { return this.call('GET', p, undefined, h); } post(p, b, h) { return this.call('POST', p, b ?? {}, h); } put(p, b, h) { return this.call('PUT', p, b ?? {}, h); } del(p, h) { return this.call('DELETE', p, undefined, h); }
  async register(username, password = 'motdepasse1') { const r = await this.post('/api/auth/register', { username, password }); if (r.status !== 200) throw new Error('inscription ' + username + ' : ' + r.status + ' ' + JSON.stringify(r.data)); return r; }
}
let n = 0;
export async function ok(name, fn) { await fn(); n++; console.log('  ✓', name); }
export const done = (label = 'tests') => console.log(`\n${n} ${label} OK`);
export const hist = (id, startedAt, extra = {}) => ({ id, sessionName: 'Jambes', startedAt, durationSeconds: 1800, data: { rpe: 3, exercises: [{ name: 'Squats', sets: [{ reps: 8, load: 12.5, done: true }] }] }, ...extra });
export const sessionWith = (name, exercises) => ({ id: 's-' + name.replace(/\W/g, ''), name, exercises });
