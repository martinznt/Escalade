// tests/ai.test.mjs — assistant IA : la réponse du modèle est filtrée, bornée, jamais utilisée telle quelle.
import assert from 'node:assert/strict';
import { cleanDraft, extractJson, buildMessages } from '../server/ai.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';

console.log('Assistant IA');
await ok('extraction du JSON même entouré de texte', async () => {
  assert.deepEqual(extractJson('Voici : {"type":"exercise","name":"X"} merci'), { type: 'exercise', name: 'X' });
  assert.equal(extractJson('pas de json'), null);
  assert.equal(extractJson({ response: '{"label":"Clipage"}' }).label, 'Clipage');
});
await ok('capacités, muscles et matériel inventés : retirés ; nombres bornés ; HTML neutralisé', async () => {
  const d = cleanDraft({ type: 'exercise', name: '<img src=x onerror=1>Pompes', summary: 'ok', caps: [{ id: 'tirage_vertical', w: 5 }, { id: 'pouvoir_magique', w: 1 }], prim: ['biceps', 'coeur'], needs: ['bar', 'fusee'], sets: 999, repsMin: -3, diff: 12 });
  assert.deepEqual(Object.keys(d.caps), ['tirage_vertical']); assert.equal(d.caps.tirage_vertical, 1);
  assert.deepEqual(d.prim, ['biceps']); assert.deepEqual(d.needs, ['bar']);
  assert.equal(d.sets, 10); assert.equal(d.repsMin, 1); assert.equal(d.diff, 5); assert.ok(!/[<>]/.test(d.name));
});
await ok('capacité (ex. clipage) : conseils et exercices proposés, type déduit', async () => {
  const d = cleanDraft({ label: 'Clipage', summary: 'Mousquetonner la corde vite et en sécurité.', howTo: ['Travailler au sol', 'Clipper en traversée'], linkedCaps: [{ id: 'technique_escalade', w: 0.9 }], exercises: [{ name: 'Clipage au sol', summary: '20 clips par main', mode: 'reps' }] }, 'auto');
  assert.equal(d.type, 'capacity'); assert.equal(d.exercises.length, 1); assert.equal(d.howTo.length, 2); assert.ok(d.linkedCaps.technique_escalade);
});
await ok('réponse vide ou inutilisable → null', async () => { assert.equal(cleanDraft({ name: 'x' }, 'exercise'), null); assert.equal(cleanDraft(null), null); });
await ok('seul le texte tapé est envoyé (pas de données personnelles), identifiants autorisés listés', async () => {
  const m = buildMessages('capacity', 'clipage en escalade', 'climbing_route');
  assert.equal(m[1].content, 'clipage en escalade'); assert.match(m[0].content, /technique_escalade/); assert.match(m[0].content, /Escalade — voie/);
});

const draftText = JSON.stringify({ type: 'capacity', label: 'Clipage', summary: 'Mousquetonner la corde.', howTo: ['Au sol'], linkedCaps: [{ id: 'technique_escalade', w: 0.8 }], exercises: [] });
const envAI = makeEnv({ AI: { calls: 0, run: async function () { this.calls++; return { response: 'Voici la fiche : ' + draftText }; } } });
await ok('route : compte requis', async () => { const c = new Client(envAI); assert.equal((await c.post('/api/ai/draft', { text: 'clipage' })).status, 401); });
await ok('route : proposition validée renvoyée', async () => {
  const c = new Client(envAI); await c.register('iauser');
  const r = await c.post('/api/ai/draft', { text: 'clipage en escalade', kind: 'auto', activityId: 'climbing_route' });
  assert.equal(r.status, 200); assert.equal(r.data.draft.type, 'capacity'); assert.equal(r.data.draft.label, 'Clipage');
});
await ok('route : limite d’utilisation (6 par 10 min)', async () => {
  const c = new Client(envAI); await c.register('iaspam');
  const codes = []; for (let i = 0; i < 8; i++) codes.push((await c.post('/api/ai/draft', { text: 'gainage ' + i })).status);
  assert.deepEqual(codes.slice(0, 6), [200, 200, 200, 200, 200, 200]); assert.equal(codes[7], 429);
});
await ok('route : sans IA configurée → 503 explicite ; réponse illisible → 502 ; panne → message générique', async () => {
  const c1 = new Client(makeEnv()); await c1.register('noai'); const r1 = await c1.post('/api/ai/draft', { text: 'clipage' });
  assert.equal(r1.status, 503); assert.equal(r1.data.unavailable, true);
  const c2 = new Client(makeEnv({ AI: { run: async () => ({ response: 'je ne sais pas' }) } })); await c2.register('junkai');
  assert.equal((await c2.post('/api/ai/draft', { text: 'clipage' })).status, 502);
  const c3 = new Client(makeEnv({ AI: { run: async () => { throw new Error('secret interne du modèle'); } } })); await c3.register('downai');
  const r3 = await c3.post('/api/ai/draft', { text: 'clipage' }); assert.equal(r3.status, 503); assert.ok(!/secret interne/.test(r3.data.error));
});
await ok('route : texte trop court refusé', async () => { const c = new Client(envAI); await c.register('iashort'); assert.equal((await c.post('/api/ai/draft', { text: 'x' })).status, 400); });
done('tests de l’assistant IA');
