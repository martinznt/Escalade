// tests/player.test.mjs — horloge du lecteur : le temps de pause n'est jamais compté comme temps réel ou actif.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { querySelector: () => null, documentElement: { dataset: {} } };
const { clock } = await import('../public/player.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const P = (t0 = 0) => ({ startedAt: t0, paused: false, pauseStart: 0, pausedMs: 0, phase: 'ready', end: 0, remaining: 0, workPausedMs: 0 });

console.log('Horloge du lecteur');
ok('durée réelle = écoulé − pauses', () => {
  const p = P(0); clock.pause(p, 60000); assert.equal(clock.real(p, 120000), 60000);
  clock.resume(p, 180000); assert.equal(p.pausedMs, 120000); assert.equal(clock.real(p, 240000), 120000);
});
ok('pause / reprise idempotentes', () => {
  const p = P(0); clock.pause(p, 1000); clock.pause(p, 5000); clock.resume(p, 6000); clock.resume(p, 9000);
  assert.equal(p.pausedMs, 5000);
});
ok('série chronométrée : le temps restant est gelé pendant la pause', () => {
  const p = P(0); p.phase = 'work'; p.end = 40000;
  clock.pause(p, 10000); assert.equal(p.remaining, 30000);
  clock.resume(p, 70000); assert.equal(p.end, 100000); assert.equal(p.workPausedMs, 60000);
});
ok('repos : la fin du repos est décalée de la durée de la pause', () => {
  const p = P(0); p.phase = 'rest'; p.end = 90000;
  clock.pause(p, 30000); clock.resume(p, 50000); assert.equal(p.end, 110000); assert.equal(p.workPausedMs, 0);
});
ok('jamais de durée négative', () => { assert.equal(clock.real(P(10000), 0), 0); });
console.log(`\n${n} tests du lecteur OK`);
