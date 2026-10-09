// tests/handlers.test.mjs — les actions des boutons (data-act, data-change, data-input, data-submit) :
// un nom = une seule définition (sinon la dernière chargée écrase l'autre en silence : « Tout sélectionner » ou la
// suppression des photos de progrès ne marchaient plus), et chaque bouton du site a bien son action.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
// Le code sans le texte des chaînes, gabarits et commentaires (les expressions ${…} des gabarits restent du code).
function codeOnly(src) {
  let out = '', i = 0; const st = []; // pile : 'tpl' (gabarit) ou '${' (expression dans un gabarit)
  let prev = '';
  const isRegexStart = () => /[(,=:[!&|?{};+\-*%<>~^]$|^$/.test(prev) || /\b(return|typeof|case|in|of|new|delete|void|throw|else|yield|await)$/.test(out.slice(-12).trimEnd());
  while (i < src.length) {
    const c = src[i], top = st[st.length - 1];
    if (top === 'tpl') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '`') { st.pop(); out += '`'; i++; prev = '`'; continue; }
      if (c === '$' && src[i + 1] === '{') { st.push('${'); out += '${'; i += 2; prev = '{'; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += c + ' '.repeat(Math.max(0, j - i - 1)) + c; i = j + 1; prev = c; continue; }
    if (c === '`') { st.push('tpl'); out += '`'; i++; continue; }
    if (c === '/' && isRegexStart()) { let j = i + 1, cls = false; while (j < src.length) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; else if (d === '\n') break; j++; } j++; while (/[a-z]/i.test(src[j] || '')) j++; out += ' '.repeat(j - i); i = j; prev = '/'; continue; }
    if (c === '{' && (top === '${' || top === '{')) { st.push('{'); }
    else if (c === '}' && (top === '${' || top === '{')) { st.pop(); if (top === '${') { out += '}'; i++; prev = '}'; continue; } }
    out += c; if (!/\s/.test(c)) prev = c; i++;
  }
  return out;
}
function handlers(file, src) {
  const code = codeOnly(src), defs = [];
  const line = (idx) => code.slice(0, idx).split('\n').length;
  for (const m of code.matchAll(/\b(ACT|CHG|INPUT|SUBMIT)\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) defs.push({ reg: m[1], name: m[2], file, line: line(m.index) });
  for (const m of code.matchAll(/Object\.assign\(\s*(ACT|CHG|INPUT|SUBMIT)\s*,\s*\{/g)) {
    let j = m.index + m[0].length, depth = 1, expectKey = true;
    while (j < code.length && depth > 0) {
      const c = code[j];
      if ('{[('.includes(c)) { depth++; j++; expectKey = false; continue; }
      if ('}])'.includes(c)) { depth--; j++; continue; }
      if (depth === 1 && c === ',') { expectKey = true; j++; continue; }
      if (depth === 1 && expectKey && /[A-Za-z_$]/.test(c)) {
        const k = code.slice(j).match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*([:(])/);
        if (k) defs.push({ reg: m[1], name: k[1], file, line: line(j) });
        expectKey = false; j += (k ? k[0].length - 1 : 1); continue;
      }
      if (!/\s/.test(c)) expectKey = false;
      j++;
    }
  }
  return defs;
}

const DIR = new URL('../public/', import.meta.url), files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(f, DIR), 'utf8')]));
const defs = files.flatMap((f) => handlers(f, src[f]));

console.log('Actions des boutons');
ok('le recensement lit tout le code (même nombre de lignes, aucune action oubliée)', () => {
  for (const f of files) assert.equal(codeOnly(src[f]).split('\n').length, src[f].split('\n').length, f);
  assert.ok(defs.length > 1000, defs.length + ' définitions');
});
ok('un nom d’action = une seule définition dans tout le site', () => {
  const by = new Map(); for (const d of defs) { const k = d.reg + '.' + d.name; by.set(k, [...(by.get(k) || []), d.file + ':' + d.line]); }
  const dup = [...by].filter(([, l]) => l.length > 1).map(([k, l]) => k + ' → ' + l.join(', '));
  assert.deepEqual(dup, [], 'actions définies plusieurs fois');
});
ok('chaque bouton du site appelle une action qui existe', () => {
  const have = new Set(defs.map((d) => d.reg + '.' + d.name)), REG = { act: 'ACT', change: 'CHG', input: 'INPUT', submit: 'SUBMIT' }, missing = [];
  for (const [f, s] of [...Object.entries(src), ['index.html', readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')]])
    for (const m of s.matchAll(/data-(act|change|input|submit)="([A-Za-z_$][\w$]*)"/g)) if (!have.has(REG[m[1]] + '.' + m[2])) missing.push(f + ' : ' + m[0]);
  assert.deepEqual(missing, []);
});
ok('les trois actions séparées gardent chacune leur rôle', () => {
  const where = (k) => defs.filter((d) => d.reg + '.' + d.name === k).map((d) => d.file);
  assert.deepEqual(where('ACT.selAll'), ['views-library.js']); assert.deepEqual(where('ACT.icalSelect'), ['views-planning.js']);
  assert.deepEqual(where('ACT.photoDel'), ['views-climb.js']); assert.deepEqual(where('ACT.progressPhotoDel'), ['views-story.js']);
  assert.deepEqual(where('ACT.goalOpen'), ['views-profile.js']);
});
console.log(`\n${n} tests des actions OK`);
