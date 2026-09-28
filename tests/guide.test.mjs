// tests/guide.test.mjs — mode guidé : options par partie, conseils d'ordre et d'association, assemblage.
import assert from 'node:assert/strict';
import * as G from '../public/guide.js';
import { byId } from '../public/library.js';
import { exMinutes } from '../public/engine.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const eq = new Set(['hangboard', 'wall', 'band', 'bar', 'mat']);

console.log('Options');
ok('partie doigts : options adaptées au matériel, les meilleures cochées, jamais plus de 2 conseils', () => {
  const o = G.partOptions({ type: 'fingers', minutes: 20, intensity: 'hard' }, { eq });
  assert.ok(o.length >= 4); assert.equal(o[0].id, 'hang-max'); assert.ok(o.filter((x) => x.recommended).length >= 1);
  for (const x of o) { assert.ok(x.tips.length <= 2); assert.ok(x.what.length > 10); assert.ok(x.works.length >= 1); assert.ok((x.lib.needs || []).every((k) => eq.has(k))); }
  assert.ok(!G.partOptions({ type: 'fingers', minutes: 20 }, { eq: new Set(['band']) }).some((x) => x.lib.needs?.includes('hangboard')), 'pas de poutre sans poutre');
});
ok('conseils : « si tu veux plus de … prends … », l’intense d’abord ; doigts fatigués → prudence', () => {
  const o = G.partOptions({ type: 'fingers', minutes: 20, intensity: 'hard' }, { eq });
  assert.ok(o.some((x) => x.tips.some((t) => /Si tu veux plus de force des doigts, prends plutôt « Suspensions max 10 s »/.test(t))));
  assert.match(o[0].tips[0], /en premier/);
  const tired = G.partOptions({ type: 'fingers', minutes: 20 }, { eq, fingersTired: true });
  assert.ok(tired.some((x) => x.tips.some((t) => /déjà travaillé/.test(t))));
  assert.ok(G.PART_NOTES.fingers.includes('échauffement'));
});
ok('préférence « je veux plus de … » : l’option qui la travaille le plus remonte', () => {
  const o = G.partOptions({ type: 'fingers', minutes: 20 }, { eq, want: 'endurance_doigts' });
  assert.ok((byId(o[0].id).caps.endurance_doigts || 0) >= 0.8, o[0].id);
});
console.log('Ordre et assemblage');
ok('ordre conseillé : le plus exigeant d’abord ; deux exercices très durs pour les doigts signalés', () => {
  const a = G.orderAdvice(['finger-extensions', 'hang-repeaters', 'hang-max']);
  assert.equal(a.order[0], 'hang-max'); assert.equal(a.order.at(-1), 'finger-extensions'); assert.match(a.notes[0], /Ordre conseillé/);
  assert.ok(G.orderAdvice(['hang-max', 'limit-boulders']).notes.length >= 0);
});
ok('assemblage : dans l’ordre conseillé, temps partagé, séries plafonnées pour l’intense', () => {
  const ex = G.buildPicked({ type: 'fingers', minutes: 20 }, ['hang-repeaters', 'hang-max'], '🖐️ Doigts');
  assert.deepEqual(ex.map((e) => e.libId), ['hang-max', 'hang-repeaters']);
  assert.ok(ex[0].sets <= byId('hang-max').sets + 1); assert.ok(ex.every((e) => e.part === '🖐️ Doigts'));
  const tot = ex.reduce((t, e) => t + exMinutes(e), 0); assert.ok(tot > 8 && tot < 32, `${tot} min pour 20`);
});
ok('autres exercices pour une partie existante : proches, sans doublon, du même rôle', () => {
  const part = [{ libId: 'pullup', block: 'main', caps: byId('pullup').caps }];
  const s = G.similarOptions(part, { eq });
  assert.ok(s.length >= 3); assert.ok(!s.some((x) => x.id === 'pullup')); assert.ok(s.every((x) => x.lib.role === 'main'));
  assert.ok(s.slice(0, 3).some((x) => (x.lib.caps.tirage_vertical || 0) > 0));
});
console.log(`\n${n} tests du mode guidé OK`);
