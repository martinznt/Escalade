// tests/audit/couverture.mjs — couverture réelle de la suite d'audit : quelles actions de l'app (boutons ACT,
// formulaires SUBMIT, champs CHG / INPUT) et quelles pages ont vraiment été touchées par un test, d'après les traces
// écrites par fixtures.mjs dans tests/audit/results/coverage/ (une par test et par appareil).
// Usage : node tests/audit/couverture.mjs [dossier-des-traces] [rapport.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = process.argv[2] || path.join(ROOT, 'tests/audit/results/coverage'), out = process.argv[3] || '';
const KINDS = { act: 'ACT', submit: 'SUBMIT', change: 'CHG', input: 'INPUT' };

// Actions définies dans le code : ACT.nom = …, ACT['nom'] = …, et Object.assign(ACT, { nom: … }).
const defs = Object.fromEntries(Object.keys(KINDS).map((k) => [k, new Map()]));
for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  for (const [kind, R] of Object.entries(KINDS)) {
    for (const m of s.matchAll(new RegExp(`\\b${R}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g'))) defs[kind].set(m[1], f);
    for (const m of s.matchAll(new RegExp(`\\b${R}\\[['"]([\\w$]+)['"]\\]\\s*=(?!=)`, 'g'))) defs[kind].set(m[1], f);
    for (const m of s.matchAll(new RegExp(`Object\\.assign\\(\\s*${R}\\s*,\\s*\\{`, 'g'))) {
      let depth = 1, i = m.index + m[0].length, start = i;
      while (i < s.length && depth) { const c = s[i++]; if (c === '{') depth++; else if (c === '}') depth--; }
      const body = s.slice(start, i - 1); let d = 0, line = '';
      for (const c of body) { if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--; line += d === 0 ? c : ' '; }
      for (const k of line.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?::|\()/g)) defs[kind].set(k[1], f);
    }
  }
}
const hits = Object.fromEntries([...Object.keys(KINDS), 'route'].map((k) => [k, new Map()]));
let files = 0;
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); files++;
  for (const [kind, name] of t.hits) if (hits[kind]) hits[kind].set(name, (hits[kind].get(name) || 0) + 1);
}
const report = { traces: files, types: {} };
for (const kind of Object.keys(KINDS)) {
  const defined = [...defs[kind].keys()], touched = defined.filter((n) => hits[kind].has(n));
  const byFile = {}; for (const n of defined.filter((n) => !hits[kind].has(n))) (byFile[defs[kind].get(n)] ||= []).push(n);
  report.types[KINDS[kind]] = { definies: defined.length, touchees: touched.length, pourcentage: defined.length ? Math.round((touched.length / defined.length) * 1000) / 10 : 0, jamaisTouchees: byFile };
}
report.pages = [...hits.route.keys()].sort();
console.log(`${files} traces de tests lues`);
for (const [k, v] of Object.entries(report.types)) console.log(`${k.padEnd(6)} : ${v.touchees} / ${v.definies} touchées (${String(v.pourcentage).replace('.', ',')} %)`);
console.log(`pages visitées : ${report.pages.length}`);
if (out) { fs.writeFileSync(out, JSON.stringify(report, null, 1)); console.log('détail : ' + out); }
