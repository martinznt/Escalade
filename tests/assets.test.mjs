import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

function localImports(relFile) {
  const src = readFileSync(path.join(root, relFile), 'utf8');
  const re = /from\s+['"]\.\/([\w.-]+\.js)['"]/g;
  const out = new Set(); let m;
  while ((m = re.exec(src))) out.add('/' + m[1]);
  return out;
}

console.log('Cohérence des fichiers JS servis au navigateur (public/*.js ↔ worker.js ↔ sw.js)');

// Ferme transitivement tous les imports relatifs à partir du point d'entrée navigateur (app.js),
// exactement comme le ferait le résolveur de modules ES du navigateur.
const visited = new Set();
const queue = ['public/app.js'];
const allImported = new Set();
while (queue.length) {
  const f = queue.shift();
  if (visited.has(f)) continue;
  visited.add(f);
  for (const imp of localImports(f)) {
    allImported.add(imp);
    const rel = 'public' + imp;
    if (!visited.has(rel)) queue.push(rel);
  }
}

const workerSrc = readFileSync(path.join(root, 'worker.js'), 'utf8');
const swSrc = readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const publicFilesMatch = workerSrc.match(/PUBLIC_FILES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
const shellMatch = swSrc.match(/SHELL\s*=\s*\[([\s\S]*?)\]/);
assert.ok(publicFilesMatch, 'PUBLIC_FILES introuvable dans worker.js — le test ne peut pas vérifier la liste blanche');
assert.ok(shellMatch, 'SHELL introuvable dans sw.js — le test ne peut pas vérifier le précache');
const publicFiles = new Set([...publicFilesMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
const shell = new Set([...shellMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

ok('le test détecte bien des imports (sinon il vérifierait un ensemble vide sans rien garantir)', () => {
  assert.ok(allImported.size >= 5);
  for (const f of ['/engine.js', '/shared.js', '/library.js', '/commands.js', '/outbox.js', '/sports.js']) assert.ok(allImported.has(f), `${f} devrait être détecté comme importé`);
});
ok('chaque fichier JS importé (transitivement) depuis app.js existe réellement sur disque', () => {
  for (const imp of allImported) assert.ok(existsSync(path.join(root, 'public' + imp)), `${imp} référencé par un import mais absent de public/`);
});
ok('chaque fichier JS importé est autorisé par la liste blanche du Worker (PUBLIC_FILES) — sinon le Worker le bloque en 404, même en ligne', () => {
  for (const imp of allImported) assert.ok(publicFiles.has(imp), `${imp} absent de PUBLIC_FILES dans worker.js`);
});
ok('chaque fichier JS importé est précaché par le Service Worker (SHELL) pour l’usage hors-ligne', () => {
  for (const imp of allImported) assert.ok(shell.has(imp), `${imp} absent de SHELL dans sw.js`);
});

console.log(`\n${n} tests OK`);
