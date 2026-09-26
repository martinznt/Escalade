// tests/assets.test.mjs — cohérence des fichiers servis : imports ES ↔ liste blanche du Worker ↔ précache du
// Service Worker ↔ fichiers sur disque ; manifeste ; aucun secret dans le frontend.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ok, done } from './helpers.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = (f) => path.join(root, 'public', f);
const read = (f) => readFileSync(path.join(root, f), 'utf8');
function localImports(file) {
  const src = readFileSync(pub(file), 'utf8'), out = new Set();
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]\.\/([\w.-]+\.js)['"]/g)) out.add(m[1]);
  return out;
}
const visited = new Set(), queue = ['app.js'];
while (queue.length) { const f = queue.shift(); if (visited.has(f)) continue; visited.add(f); for (const i of localImports(f)) queue.push(i); }
const workerSrc = read('worker.js'), swSrc = read('public/sw.js'), html = read('public/index.html');
const PUBLIC = new Set([...workerSrc.match(/PUBLIC_FILES\s*=\s*new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
const SHELL = new Set([...swSrc.match(/SHELL\s*=\s*\[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

console.log('Fichiers servis');
await ok('le graphe d’imports est complet (tous les modules de l’application détectés)', () => { for (const f of ['state.js', 'brain.js', 'generator.js', 'player.js', 'views-home.js', 'anatomy.js', 'grading.js', 'items.js']) assert.ok(visited.has(f), f); });
await ok('chaque module importé existe sur disque', () => { for (const f of visited) assert.ok(existsSync(pub(f)), f); });
await ok('chaque module importé est autorisé par le Worker (sinon 404 en ligne)', () => { for (const f of visited) assert.ok(PUBLIC.has('/' + f), '/' + f + ' absent de PUBLIC_FILES'); });
await ok('chaque module importé est précaché par le Service Worker (sinon panne hors ligne)', () => { for (const f of visited) assert.ok(SHELL.has('/' + f), '/' + f + ' absent de SHELL'); });
await ok('liste blanche du Worker et précache identiques', () => { assert.deepEqual([...PUBLIC].sort(), [...SHELL].sort()); });
await ok('chaque fichier autorisé existe réellement', () => { for (const p of PUBLIC) if (p !== '/') assert.ok(existsSync(pub(p.slice(1))), p); });
await ok('aucun fichier public inutile ou oublié (hors modules serveur)', () => {
  const serverOnly = new Set(['migrate.js']);
  for (const f of readdirSync(path.join(root, 'public'))) if (!serverOnly.has(f)) assert.ok(PUBLIC.has('/' + f), `public/${f} n’est pas servi : fichier orphelin ?`);
});
await ok('ressources de index.html présentes', () => { for (const m of html.matchAll(/(?:href|src)="\/([\w.-]+)"/g)) assert.ok(PUBLIC.has('/' + m[1]), m[1]); });
await ok('manifeste valide avec icônes existantes', () => { const m = JSON.parse(read('public/manifest.json')); assert.equal(m.name, 'Mes séances'); for (const i of m.icons) assert.ok(existsSync(pub(i.src.slice(1)))); assert.ok(m.icons.some((i) => i.purpose === 'maskable')); });
await ok('version du cache du Service Worker alignée sur la version de l’application', () => {
  const v = read('public/state.js').match(/APP_VERSION = '([\d.]+)'/)[1];
  assert.equal(read('worker.js').match(/APP_VERSION = '([\d.]+)'/)[1], v);
  assert.match(swSrc, new RegExp(`mes-seances-v${v.replaceAll('.', '-')}`));
});
console.log('Secrets');
await ok('EDIT_PASSWORD n’apparaît jamais dans le bundle public (ni valeur ni lecture)', () => {
  for (const f of readdirSync(path.join(root, 'public'))) {
    if (!/\.(js|html|json|css)$/.test(f)) continue;
    const src = readFileSync(pub(f), 'utf8');
    assert.ok(!/env\.EDIT_PASSWORD|EDIT_CODE|secret-admin|Adm1n/.test(src), f);
    assert.ok(!/localStorage\.setItem\([^)]*password/i.test(src), f + ' : mot de passe stocké localement');
  }
});
await ok('wrangler.json ne contient aucun secret en clair', () => { const w = read('wrangler.json'); assert.ok(!/EDIT_PASSWORD"\s*:/.test(w) && !/"vars"[\s\S]*PASSWORD/.test(w)); });
await ok('HTML généré : aucun innerHTML construit hors du moteur d’échappement h``', () => {
  for (const f of readdirSync(path.join(root, 'public')).filter((x) => /^(views-|app|player|ui).*\.js$/.test(x))) {
    const src = readFileSync(pub(f), 'utf8');
    for (const m of src.matchAll(/innerHTML\s*=\s*([^;]+);/g)) {
      const rhs = m[1].trim();
      assert.ok(/\.s\b|^''$|^`<div class="back" data-act="closeSheet"><\/div>|^''|^sheetHtml/.test(rhs) || /\.map\(\(l\) => `<option value="\$\{l\.id\}">\$\{l\.label\.replace/.test(rhs), `${f} : innerHTML non échappé → ${rhs.slice(0, 80)}`);
    }
  }
});
done('tests de cohérence des fichiers');
