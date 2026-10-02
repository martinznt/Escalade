// tests/adapt.test.mjs — « Adapter pour cette fois » : une copie qui travaille les mêmes choses avec d'autres
// paramètres (durée, matériel en moins, zone à ménager, échauffement, intensité) ; l'original n'est jamais touché.
import assert from 'node:assert/strict';
import * as AD from '../public/adapt.js';
import { CATALOG, buildSession } from '../public/catalog.js';
import { byId } from '../public/library.js';
import { zoneReasons } from '../public/generator.js';
import { sessionMinutes } from '../public/engine.js';
import { act, env, ctxOf } from './fixtures.mjs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const GYM = ['bar', 'weights', 'bench', 'barbell', 'band', 'mat', 'cable', 'latpulldown', 'seatedrow', 'pecdeck', 'shoulderpress', 'legpress', 'legcurl', 'legext', 'calfmachine'];
const ctx = ctxOf({ items: [act('strength'), act('conditioning'), env('Salle', GYM)] });
const cat = (id) => buildSession(CATALOG.find((e) => e.id === id));
console.log('Adapter une séance');
ok('l’original n’est jamais modifié : nouvelle copie, nouvel identifiant, lien vers l’origine', () => {
  const s = cat('gym-push'), before = JSON.stringify(s), r = AD.adaptSession(s, { minutes: 20, remove: ['barbell'], intensity: 'harder' }, ctx);
  assert.equal(JSON.stringify(s), before, 'séance d’origine intacte');
  assert.notEqual(r.session.id, s.id); assert.equal(r.session.context.adaptedFrom, s.id); assert.match(r.session.name, /\(adaptée\)$/);
  assert.ok(!r.session.exercises.some((e) => s.exercises.some((x) => x.id === e.id)), 'exercices copiés, pas partagés');
});
ok('durée : la version tient dans le temps demandé', () => {
  for (const m of [15, 20, 30]) { const r = AD.adaptSession(cat('gym-legs'), { minutes: m }, ctx); assert.ok(sessionMinutes(r.session) <= m * 1.15, `${m} min → ${Math.round(sessionMinutes(r.session))}`); }
});
ok('matériel en moins : remplacé par un exercice qui travaille la même chose, sans ce matériel', () => {
  const s = cat('gym-push'), r = AD.adaptSession(s, { remove: ['barbell'] }, ctx);
  assert.ok(r.session.exercises.every((e) => !(byId(e.libId)?.needs || []).includes('barbell')));
  assert.match(r.changes.join('\n'), /Développé couché » → /);
  assert.ok(r.keeps.find((k) => k.capId === 'poussee_horizontale')?.pct >= 80, JSON.stringify(r.keeps));
});
ok('zone douloureuse : plus aucun exercice qui la charge, et l’avertissement santé est donné', () => {
  const s = cat('gym-legs'), r = AD.adaptSession(s, { zones: ['knees'] }, ctx);
  assert.ok(r.session.exercises.every((e) => !zoneReasons(byId(e.libId), ['knees']).length), r.session.exercises.map((e) => e.name).join(', '));
  assert.match(r.warnings.join(' '), /professionnel de santé/);
});
ok('échauffement (élastique, plus court, aucun), retour au calme, intensité', () => {
  const s = cat('gym-push');
  const band = AD.adaptSession(s, { warm: 'band' }, ctx).session.exercises.filter((e) => e.block === 'warmup');
  assert.ok(band.length && band.every((e) => (byId(e.libId)?.needs || []).every((x) => x === 'band')));
  assert.equal(AD.adaptSession(s, { warm: 'none' }, ctx).session.exercises.filter((e) => e.block === 'warmup').length, 0);
  const hard = AD.adaptSession(s, { intensity: 'harder' }, ctx).session, easy = AD.adaptSession(s, { intensity: 'easier' }, ctx).session;
  const sets = (x) => x.exercises.filter((e) => e.block === 'main').reduce((t, e) => t + e.sets, 0);
  assert.ok(sets(hard) > sets(s) && sets(easy) < sets(s));
});
ok('phrase : « 20 min, sans haltères, j’ai mal au genou, échauffement plus court, plus facile »', () => {
  const p = AD.parseAdapt('20 min, sans haltères, j’ai mal au genou, échauffement plus court, plus facile');
  assert.equal(p.opts.minutes, 20); assert.deepEqual(p.opts.zones, ['knees']); assert.ok(p.opts.remove.includes('weights')); assert.equal(p.opts.warm, 'short'); assert.equal(p.opts.intensity, 'easier');
  assert.equal(AD.parseAdapt('1 h 15 et plus intense').opts.minutes, 75); assert.deepEqual(AD.parseAdapt('bonjour').opts, {});
});
console.log(`\n${n} tests d’adaptation OK`);
