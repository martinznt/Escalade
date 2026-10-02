// duo.js — « séance à deux » : règles pures (code du salon, nettoyage de l'état partagé). Les routes sont dans worker.js.
// L'état ne contient que la position dans la séance et le chrono ; chacun garde ses propres séries, charges et notes.

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I pour se lire à voix haute
export const DUO_TTL = 4 * 3600000;
export const DUO_MAX = 4;
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
/** Code de 6 caractères tiré au hasard (crypto) : environ 10^9 possibilités. */
export function duoCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join('');
}
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const int = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
/** Garde uniquement ce qui sert à synchroniser : position, phase et chrono. */
export function cleanDuoState(s, now = Date.now()) {
  const x = s && typeof s === 'object' ? s : {};
  const phase = ['ready', 'rest', 'work', 'done'].includes(x.phase) ? x.phase : 'ready';
  const end = Number(x.end);
  return {
    i: int(x.i, 0, 500), set: int(x.set, 0, 100), side: int(x.side, 0, 1), phase,
    end: Number.isFinite(end) && Math.abs(end - now) < 6 * 3600000 ? Math.round(end) : 0,
    total: int(x.total, 0, 3600000), remaining: int(x.remaining, 0, 3600000), paused: !!x.paused,
    why: x.why === 'skip' ? 'skip' : 'set',
  };
}

/* ───── Séance à plusieurs (groupe, 2 à 30 personnes, un organisateur) ───── */
export const GROUP_TTL = 6 * 3600000;
/** État partagé du groupe, écrit par l'organisateur seul : salle d'attente, déroulé lancé, pause, fin. */
export function cleanGroupState(s, now = Date.now()) {
  const x = s && typeof s === 'object' ? s : {};
  const phase = ['lobby', 'run', 'done'].includes(x.phase) ? x.phase : 'lobby';
  const end = Number(x.end);
  const roster = (Array.isArray(x.roster) ? x.roster : []).map((n) => String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40)).filter(Boolean).slice(0, 30);
  return { phase, step: int(x.step, 0, 5000), end: Number.isFinite(end) && Math.abs(end - now) < 6 * 3600000 ? Math.round(end) : 0, paused: !!x.paused, remaining: int(x.remaining, 0, 3600000), roster, startedAt: int(x.startedAt, 0, 9e15) };
}
