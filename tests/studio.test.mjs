// tests/studio.test.mjs — Studio d'administration : brouillon invisible, vérifications, publication explicite, versions,
// diff, retour arrière (avec détection de conflit), journal ; refus aux non-admins ; IA et Laboratoire ne publient rien ;
// aucune donnée privée ni secret dans le journal. Règles pures (server/studio.js) et routes (Worker + D1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client, makeEnv, ok, done } from './helpers.mjs';
import { cleanChange, diffValues, diffState, runChecks, cleanAdminDraft, cleanLab } from '../server/studio.js';

console.log('Studio : règles');
await ok('lot : type, identifiant, doublon et données invalides refusés ; champs inconnus ignorés', async () => {
  const r = cleanChange([{ kind: 'faq', id: 'q1', data: { q: 'Pourquoi ?', a: 'Parce que.', evil: 'x' } }, { kind: 'faq', id: 'q1', data: { q: 'a', a: 'b' } }, { kind: 'shell', id: 'x' }, { kind: 'faq', id: '../x' }, { kind: 'faq', id: 'q2', data: {} }]);
  assert.equal(r.items.length, 1); assert.equal(r.items[0].data.evil, undefined); assert.equal(r.errors.length, 4);
});
await ok('diff lisible : ajouté, retiré, changé, chemin précis', async () => {
  const d = diffValues({ a: 1, b: { c: 'x', d: [1] } }, { a: 1, b: { c: 'y' }, e: true });
  assert.deepEqual(d.map((x) => [x.path, x.type]), [['b.c', 'changed'], ['b.d', 'removed'], ['e', 'added']]);
  assert.deepEqual(diffValues({ a: 1 }, { a: 1 }), []);
  const n = diffState(null, { data: { q: 'Q', a: 'R' }, hidden: false });
  assert.deepEqual(n.map((x) => x.path), ['état', 'q', 'a'], 'nouvel élément : champ par champ'); assert.equal(n[0].after, 'modifié pour tous');
  assert.deepEqual(diffState({ data: { q: 'Q' }, hidden: false }, { data: null, hidden: true })[0], { path: 'état', type: 'changed', before: 'modifié pour tous', after: 'masqué pour tous' });
});
await ok('vérifications : contenu actif, sans effet, limite, lot vide', async () => {
  const bad = runChecks([{ kind: 'announce', id: 'a1', data: { title: 'Salut', body: '<script>alert(1)</script>' } }]);
  assert.equal(bad.ok, false); assert.equal(bad.checks.find((c) => c.id === 'active').ok, false);
  const same = runChecks([{ kind: 'faq', id: 'q', data: { q: 'Q ?', a: 'R.' } }], { current: { 'faq/q': { data: { q: 'Q ?', a: 'R.', order: 100 }, hidden: false } } });
  assert.equal(same.checks.find((c) => c.id === 'effect').ok, false);
  assert.equal(runChecks([], {}).checks.find((c) => c.id === 'notEmpty').ok, false);
  assert.equal(runChecks([{ kind: 'faq', id: 'n', data: { q: 'Q', a: 'R' } }], { currentCount: 2000 }).checks.find((c) => c.id === 'limit').ok, false);
});
await ok('IA admin : sortie validée par type ; Laboratoire : solutions structurées, changement proposé nettoyé', async () => {
  assert.deepEqual(cleanAdminDraft({ response: 'Voici : {"q":"Comment ?","a":"Ainsi.","run":"rm -rf"}' }, 'faq'), { q: 'Comment ?', a: 'Ainsi.', order: 100 });
  assert.equal(cleanAdminDraft({ response: 'rien' }, 'faq'), null); assert.equal(cleanAdminDraft({ q: 'x', a: 'y' }, 'layout'), null, 'type non autorisé à l’IA');
  const lab = cleanLab({ response: JSON.stringify({ reformulation: 'Les débutants se perdent', rules: ['r1'], solutions: [{ title: 'FAQ', pros: ['simple'], cons: ['à lire'], risk: 'faible', change: { kind: 'faq', data: { q: 'Par où commencer ?', a: 'Par l’accueil.' } } }, { title: 'Code', change: { kind: 'layout', data: {} } }] }) });
  assert.equal(lab.solutions.length, 2); assert.equal(lab.solutions[0].change.kind, 'faq'); assert.equal(lab.solutions[1].change, null, 'type non autorisé → aucun changement proposé');
});
await ok('aucune exécution de code : pas d’eval, new Function ni shell dans le Studio et l’IA', async () => {
  for (const f of ['server/studio.js', 'server/ai.js', 'server/global.js', 'worker.js', 'public/views-studio.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(|child_process|execSync/.test(src), f);
  }
});

console.log('Studio : routes');
let aiCalls = 0;
const env = makeEnv({ AI: { run: async (_m, o) => { aiCalls++; const sys = o.messages[0].content; return { response: /analyser un problème/.test(sys) ? JSON.stringify({ reformulation: 'Reformulé', rules: ['Règle'], questions: [], solutions: [{ title: 'Ajouter une FAQ', how: 'Une question fréquente', pros: ['rapide'], cons: ['peu visible'], risk: 'faible', change: { kind: 'faq', data: { q: 'Où est le minuteur ?', a: 'Dans le menu.' } } }] }) : '{"title":"Nouveauté","body":"Le Studio arrive.","emoji":"📣"}' }; } } });
const A = new Client(env), U = new Client(env);
await A.register('admin1'); await U.register('membre');
await A.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
const faq = { kind: 'faq', id: 'faq-1', op: 'put', data: { q: 'Comment créer une séance ?', a: 'Avec le bouton ＋.' } };
let csId;
await ok('non-admin refusé partout ; aucune route ne se fie au navigateur', async () => {
  for (const [m, p] of [['GET', '/api/admin/studio'], ['POST', '/api/admin/studio'], ['GET', '/api/admin/audit'], ['POST', '/api/admin/lab'], ['POST', '/api/admin/studio/ai'], ['POST', '/api/admin/studio/x/publish'], ['GET', '/api/admin/versions/faq/faq-1']])
    assert.equal((await U.call(m, p, m === 'GET' ? undefined : { confirm: true, isAdmin: true })).status, 403, p);
});
await ok('brouillon : créé, invisible pour les utilisateurs, modifiable, diff par rapport à l’existant', async () => {
  const r = await A.post('/api/admin/studio', { title: 'Aide', items: [faq] }); assert.equal(r.status, 200); csId = r.data.id;
  assert.ok(!(await U.get('/api/global')).data.items.some((x) => x.id === 'faq-1'), 'un brouillon n’est jamais public');
  assert.equal((await A.put('/api/admin/studio/' + csId, { title: 'Aide v2', items: [{ ...faq, data: { ...faq.data, a: 'Avec le bouton ＋ Nouvelle séance.' } }] })).status, 200);
  const d = (await A.get('/api/admin/studio/' + csId)).data;
  assert.equal(d.set.status, 'draft'); assert.equal(d.set.title, 'Aide v2'); assert.equal(d.set.author, 'admin1'); assert.equal(d.diff[0].isNew, true); assert.ok(d.diff[0].changes.length);
});
await ok('publication : confirmation explicite requise, vérifications enregistrées, visible pour tous, version 1', async () => {
  assert.equal((await A.post(`/api/admin/studio/${csId}/publish`, {})).status, 400, 'pas de publication sans confirmation');
  const chk = await A.post(`/api/admin/studio/${csId}/check`, {}); assert.equal(chk.data.passed, true);
  const r = await A.post(`/api/admin/studio/${csId}/publish`, { confirm: true }); assert.equal(r.status, 200);
  assert.equal((await U.get('/api/global')).data.items.find((x) => x.id === 'faq-1').data.a, 'Avec le bouton ＋ Nouvelle séance.');
  const v = (await A.get('/api/admin/versions/faq/faq-1')).data.versions; assert.equal(v.length, 1); assert.equal(v[0].version, 1); assert.equal(v[0].by, 'admin1');
  assert.equal((await A.post(`/api/admin/studio/${csId}/publish`, { confirm: true })).status, 409, 'une seule publication');
  const d = (await A.get('/api/admin/studio/' + csId)).data; assert.equal(d.set.status, 'published'); assert.equal(d.set.publisher, 'admin1'); assert.ok(d.tests.length >= 2);
});
await ok('vérifications échouées : rien n’est publié, refus journalisé', async () => {
  const r = await A.post('/api/admin/studio', { title: 'Piège', items: [{ kind: 'announce', id: 'ann-x', op: 'put', data: { title: 'Hop', body: '<img src=x onerror=alert(1)>' } }] });
  const p = await A.post(`/api/admin/studio/${r.data.id}/publish`, { confirm: true }); assert.equal(p.status, 422); assert.ok(p.data.checks.some((c) => c.id === 'active' && !c.ok));
  assert.ok(!(await U.get('/api/global')).data.items.some((x) => x.id === 'ann-x'));
  assert.equal((await A.post(`/api/admin/studio/${r.data.id}/discard`, {})).status, 200);
  assert.equal((await A.post(`/api/admin/studio/${r.data.id}/publish`, { confirm: true })).status, 409, 'abandonné : plus publiable');
});
await ok('retour arrière : état d’avant rétabli ; refusé si modifié depuis, sauf retour forcé', async () => {
  // Modification directe (ancienne interface) : passe aussi par un lot publié, donc versionnée.
  const put = await A.put('/api/admin/global/faq/faq-1', { data: { q: 'Comment créer une séance ?', a: 'Version directe.' } }); assert.equal(put.status, 200); assert.ok(put.data.changeSet);
  const rb = await A.post(`/api/admin/studio/${csId}/rollback`, { confirm: true }); assert.equal(rb.status, 409, 'conflit détecté'); assert.deepEqual(rb.data.conflicts, ['faq/faq-1']);
  assert.equal((await A.post(`/api/admin/studio/${put.data.changeSet}/rollback`, { confirm: true })).status, 200, 'annule la modification directe');
  assert.equal((await U.get('/api/global')).data.items.find((x) => x.id === 'faq-1').data.a, 'Avec le bouton ＋ Nouvelle séance.');
  assert.equal((await A.post(`/api/admin/studio/${csId}/rollback`, { confirm: true })).status, 200);
  assert.ok(!(await U.get('/api/global')).data.items.some((x) => x.id === 'faq-1'), 'retour au contenu d’origine');
  assert.equal((await A.get('/api/admin/versions/faq/faq-1')).data.versions.length, 4);
});
await ok('IA admin : crée un brouillon à relire, ne publie jamais', async () => {
  const r = await A.post('/api/admin/studio/ai', { kind: 'announce', text: 'Annonce l’arrivée du Studio' }); assert.equal(r.status, 200);
  const d = (await A.get('/api/admin/studio/' + r.data.id)).data; assert.equal(d.set.status, 'draft'); assert.equal(d.set.source, 'ai'); assert.equal(d.items[0].data.title, 'Nouveauté');
  assert.ok(!(await U.get('/api/global')).data.items.some((x) => x.kind === 'announce'), 'rien de publié');
  assert.equal((await A.post('/api/admin/studio/ai', { kind: 'layout', text: 'Tout cacher pour tout le monde' })).status, 400);
});
await ok('Laboratoire : reformulation, règles, solutions avec avantages/inconvénients ; aucun effet sans brouillon', async () => {
  const before = aiCalls, r = await A.post('/api/admin/lab', { text: 'Les nouveaux ne trouvent pas le minuteur, que faire ?' });
  assert.equal(r.status, 200); assert.equal(aiCalls, before + 1); assert.equal(r.data.lab.reformulation, 'Reformulé'); assert.deepEqual(r.data.lab.solutions[0].pros, ['rapide']);
  assert.equal(r.data.lab.solutions[0].change.kind, 'faq');
  const draft = await A.post('/api/admin/studio', { title: 'Lab : minuteur', source: 'lab', items: [{ kind: 'faq', id: 'faq-min', op: 'put', data: r.data.lab.solutions[0].change.data }] });
  assert.equal(draft.status, 200); assert.ok(!(await U.get('/api/global')).data.items.some((x) => x.id === 'faq-min'));
});
await ok('journal : qui, quoi, quand, avant/après, vérifications ; aucune donnée privée ni secret', async () => {
  const it = await U.post('/api/items', { changes: [{ c: 'goal', id: 'g-secret', u: 1000, d: { type: 'custom', label: 'Objectif très privé', status: 'active' } }] }); assert.equal(it.status, 200);
  await A.post('/api/admin/users/' + (await A.get('/api/admin/users')).data.users.find((x) => x.username === 'membre').id + '/role', { admin: false });
  const ev = (await A.get('/api/admin/audit')).data.events;
  const acts = ev.map((e) => e.action);
  for (const a of ['draft_create', 'draft_edit', 'publish', 'publish_item', 'publish_refused', 'discard', 'rollback', 'rollback_item']) assert.ok(acts.includes(a), a);
  const pub = ev.filter((e) => e.action === 'publish_item' && e.target === 'faq-1').at(-1); // la première publication (journal du plus récent au plus ancien) assert.equal(pub.actor, 'admin1'); assert.ok(pub.at > 0); assert.equal(pub.before, null); assert.ok(pub.after.data.q);
  assert.ok(ev.find((e) => e.action === 'publish').checks.length >= 4);
  const raw = JSON.stringify(ev); assert.ok(!raw.includes('Adm1n-Secret!') && !raw.includes('Objectif très privé') && !raw.includes('motdepasse1'));
});
await ok('suppression du compte admin : l’historique reste, auteur anonymisé', async () => {
  const X = new Client(env); await X.register('admin2', 'motdepasse2'); await X.post('/api/admin/activate', { password: 'Adm1n-Secret!' });
  const r = await X.post('/api/admin/studio', { title: 'Par admin2', items: [{ kind: 'faq', id: 'faq-z', op: 'put', data: { q: 'Z ?', a: 'Z.' } }] });
  assert.equal((await X.post('/api/auth/delete', { password: 'motdepasse2' })).status, 200);
  const d = (await A.get('/api/admin/studio/' + r.data.id)).data; assert.equal(d.set.author, 'compte supprimé');
});
done('tests du Studio');
