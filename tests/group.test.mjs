// tests/group.test.mjs — « Séance à plusieurs » : déroulé selon le matériel et le format (ensemble, à tour de rôle,
// ateliers), intervalles partagés (7 s / 3 s sur une seule poutre), puis le salon côté serveur : code, organisateur
// seul à régler et lancer, membres qui suivent, départ, fin.
import assert from 'node:assert/strict';
import * as G from '../public/group.js';
import { CATALOG, buildSession } from '../public/catalog.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';
const cat = (id) => buildSession(CATALOG.find((e) => e.id === id));
const mainSteps = (p, ex) => p.steps.filter((s) => s.ex === ex);
console.log('Séance à plusieurs');
await ok('une poutre pour deux, repeaters 7/3 : chacun suspend à son tour, la pause réelle s’allonge (jamais plus courte)', async () => {
  const s = cat('clb-repeaters'), i = s.exercises.findIndex((e) => /Repeaters/.test(e.name));
  const p = G.groupPlan(s, ['Léa', 'Tom'], { equip: { hangboard: 1 } }), st = mainSteps(p, i).filter((x) => x.kind === 'work');
  assert.ok(st.length >= 12); assert.ok(st.every((x) => Object.values(x.as).filter((a) => a.role === 'work').length === 1), 'une seule personne à la fois sur la poutre');
  assert.equal(st[0].as['Léa'].role, 'work'); assert.equal(st[1].as['Tom'].role, 'work'); assert.equal(st[1].as['Léa'].role, 'rest');
  assert.match(p.notes.join('\n'), /pause réelle 7 s au lieu de 3 s/);
  const solo = G.groupPlan(s, ['Léa', 'Tom'], { equip: { hangboard: 2 } });
  assert.ok(mainSteps(solo, i).filter((x) => x.kind === 'work').every((x) => Object.values(x.as).every((a) => a.role === 'work')), 'deux poutres : ensemble');
});
await ok('intervalle réglé à la main (chrono à plusieurs) et repos minimum garanti', () => {
  const s = { exercises: [{ name: 'Suspensions', mode: 'time', secMin: 60, sets: 2, rest: 120, block: 'main', needs: ['hangboard'] }] };
  const p = G.groupPlan(s, ['A', 'B', 'C'], { equip: { hangboard: 1 }, intervals: { 0: { on: 10, off: 5, reps: 4 } } });
  const work = p.steps.filter((x) => x.kind === 'work'); assert.equal(work.length, 3 * 4 * 2);
  const rest = p.steps.find((x) => x.title === 'Repos'); assert.ok(rest && rest.dur === 120 - 2 * 40, `repos complété : ${rest?.dur}`);
});
await ok('ateliers : 6 personnes, chacune sur un exercice, tout le monde tourne ; manque de place = récupération', () => {
  const s = cat('cal-push-pull'), P = ['A', 'B', 'C', 'D', 'E', 'F'];
  const p = G.groupPlan(s, P, { format: 'stations', stationSec: 40, rounds: 1 }), at = p.steps.filter((x) => x.title.startsWith('Atelier'));
  assert.ok(at.length >= 6); const first = at[0].as;
  assert.equal(new Set(Object.values(first).map((a) => a.ex)).size, 6, 'six exercices différents en même temps');
  assert.notEqual(at[0].as.A.ex, at[1].as.A.ex, 'A change d’atelier');
  const few = G.groupPlan(s, [...P, 'G', 'H'], { format: 'stations', equip: { bar: 1, dips: 1, rings: 1 }, rounds: 1 });
  assert.ok(few.steps.some((x) => Object.values(x.as).some((a) => a.role === 'rest')), 'quelqu’un récupère quand il manque une place');
});
await ok('chacun son tour : les autres regardent, leur repos est compté ; résumé par personne', () => {
  const s = cat('gym-push'), p = G.groupPlan(s, ['A', 'B', 'C', 'D'], { format: 'waves', waveSize: 2 });
  const w = p.steps.filter((x) => x.kind === 'work' && x.ex >= 0 && s.exercises[x.ex].block === 'main');
  assert.ok(w.every((x) => Object.values(x.as).filter((a) => a.role === 'work').length === 2));
  const a = G.personSummary(p, 'A', s); assert.ok(a.work > 0 && a.rest > 0 && a.exercises.length >= 3);
  assert.equal(G.cleanConfig({ format: 'n’importe', equip: { hangboard: '3', fusée: 9 } }).format, 'auto');
  assert.deepEqual(G.cleanConfig({ equip: { hangboard: '3', fusée: 9 } }).equip, { hangboard: 3 });
});
await ok('salon : code, membres, seul l’organisateur règle et lance, les autres suivent ; départ et fin', async () => {
  const env = makeEnv(); const host = new Client(env), b = new Client(env), c = new Client(env), x = new Client(env);
  await host.register('orga'); await b.register('bea'); await c.register('cyril'); await x.register('intrus');
  const cr = await host.post('/api/group', { session: cat('clb-repeaters'), config: { equip: { hangboard: 1 } } }); assert.equal(cr.status, 200); const code = cr.data.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await x.get('/api/group/' + code)).status, 403, 'non membre : rien');
  const jb = await b.post(`/api/group/${code}/join`); assert.equal(jb.status, 200); assert.ok(jb.data.session.exercises.length); assert.equal(jb.data.host, false);
  await c.post(`/api/group/${code}/join`);
  const v = (await host.get('/api/group/' + code)).data; assert.deepEqual(v.members, ['orga', 'bea', 'cyril']); assert.equal(v.host, true);
  assert.equal((await b.put('/api/group/' + code, { state: { phase: 'run' } })).status, 403, 'un membre ne lance pas');
  assert.equal((await host.put('/api/group/' + code, { config: { format: 'waves', equip: { hangboard: 1 } }, state: { phase: 'run', step: 0, end: Date.now() + 7000, roster: ['orga', 'bea', 'cyril', '<b>x</b>'] } })).status, 200);
  const sb = (await b.get('/api/group/' + code)).data; assert.equal(sb.state.phase, 'run'); assert.equal(sb.config.format, 'waves'); assert.ok(!sb.state.roster.some((n) => /[<>]/.test(n)), 'noms nettoyés');
  assert.equal((await c.del('/api/group/' + code)).status, 200); assert.deepEqual((await host.get('/api/group/' + code)).data.members, ['orga', 'bea']);
  assert.equal((await host.del('/api/group/' + code)).status, 200); assert.equal((await b.get('/api/group/' + code)).status, 404, 'fin pour tout le monde');
});
done('tests de la séance à plusieurs');
