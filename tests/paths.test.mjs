// tests/paths.test.mjs — chaque indication « va dans Profil › Records et mesures » (ou « Profil puis … ») écrite dans
// l'app mène à un endroit qui EXISTE : les noms sont comparés aux vrais libellés des écrans (tuiles du profil, menu des
// paramètres, pages de l'administration, rubriques de la bibliothèque et des progrès). Un nom de bouton cité entre
// « » doit exister dans l'app. Un libellé renommé sans mettre à jour les indications fait échouer ce test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const DIR = new URL('../public/', import.meta.url), read = (f) => fs.readFileSync(new URL(f, DIR), 'utf8');
const SRV = new URL('../server/', import.meta.url);
const files = [...fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => [f, read(f)]), ...fs.readdirSync(SRV).filter((f) => f.endsWith('.js')).map((f) => ['server/' + f, fs.readFileSync(new URL(f, SRV), 'utf8')])];
const all = files.map(([, s]) => s).join('\n');
const block = (src, start, end) => { const a = src.indexOf(start); assert.ok(a >= 0, `bloc introuvable : ${start}`); return src.slice(a, src.indexOf(end, a)); };
const grab = (b, re) => [...b.matchAll(re)].map((m) => m[1]);
const prof = read('views-profile.js'), set = read('views-settings.js'), lib = read('views-library.js'), prog = read('views-progress.js');
const TILES = grab(block(prof, 'const TILES = {', '};'), /\w+: \['[^']*', '([^']+)'/g);
const MENU = grab(block(set, 'const MENU = [', '];'), /\['\w+', '[^']*', '([^']+)'/g);
const ADMIN = grab(block(set, 'const ADMIN_TITLE = {', '};'), /\w+: '\S+ ([^']+)'/g);
const LIB = grab(block(lib, 'const LIB_INFO = {', '};'), /\w+: \['[^']*', '([^']+)'/g);
const PROG = grab(block(prog, 'const SUB_INFO = {', '};'), /\w+: \['[^']*', '([^']+)'/g);
/** Ce qu'on trouve à chaque niveau : section → pages ; certaines pages ont leurs propres sous-pages. */
const KNOWN = { Profil: TILES, Paramètres: MENU, Admin: ADMIN, Bibliothèque: LIB, Progrès: PROG, 'Mon analyse': [...TILES, 'Lab', 'Tendances et diagnostics'] };
const unquote = (t) => t.replace(/^«\s*/, '').replace(/\s*».*$/, '');
/** Un bouton cité « … » existe-t-il dans l'app (ailleurs que dans la phrase qui le cite) ? */
const buttonExists = (label, line) => { const l = label.replace(/^\p{Extended_Pictographic}️?\s*/u, '').trim(); return l.length > 2 && all.split(line).join('').includes(l); };
function check(section, rest, line, where) {
  const pages = KNOWN[section];
  if (rest.startsWith('«')) { const b = unquote(rest); return buttonExists(b, line) ? null : `${where} : bouton « ${b} » introuvable dans l’app`; }
  const page = [...pages].sort((a, b) => b.length - a.length).find((p) => rest.startsWith(p));
  if (!page) return `${where} : « ${section} › ${rest.slice(0, 40)} » — aucune page de « ${section} » ne s’appelle ainsi (pages : ${pages.join(', ')})`;
  const after = rest.slice(page.length);
  if (after.startsWith(' › ')) {
    const next = after.slice(3);
    if (KNOWN[page]) return check(page, next, line, where);
    if (next.startsWith('«')) { const b = unquote(next); return buttonExists(b, line) ? null : `${where} : bouton « ${b} » introuvable dans l’app`; }
    const label = next.split(/[.,;:)«»"'`<]/)[0].trim();
    return label && buttonExists(label, line) ? null : `${where} : « ${page} › ${label} » — « ${label} » introuvable dans l’app`;
  }
  return null;
}
const mentions = () => {
  const out = [];
  for (const [f, src] of files) src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?<!› )\b(Profil|Paramètres|Bibliothèque|Progrès|Admin) › ([^\n]+)/g)) out.push({ where: `${f}:${i + 1}`, section: m[1], rest: m[2], line });
    for (const m of line.matchAll(/\b(?:dans|va dans|ouvre) (Profil|Paramètres|Bibliothèque|Progrès),? puis (?:« )?([A-ZÉ][^\n]+)/g)) out.push({ where: `${f}:${i + 1}`, section: m[1], rest: m[2], line });
  });
  return out;
};

ok('les vrais libellés des écrans sont lus (sinon le test ne vérifierait rien)', () => {
  for (const [k, l] of Object.entries({ TILES, MENU, ADMIN, LIB, PROG })) assert.ok(l.length >= 3, `${k} : ${l.length} libellés`);
  assert.ok(TILES.includes('Records et mesures') && MENU.includes('Notifications') && LIB.includes('Exercices'));
});
ok('chaque « X › Y » écrit dans l’app mène à une page (ou un bouton) qui existe', () => {
  const m = mentions(), bad = m.map((x) => check(x.section, x.rest, x.line, x.where)).filter(Boolean);
  assert.ok(m.length >= 10, `${m.length} indications trouvées`);
  assert.deepEqual(bad, [], `indications fausses :\n${bad.join('\n')}`);
});
ok('aucun nom d’écran qui n’existe pas (« Réglages », « Compte », « Essentiel », « Matériel et lieux »…)', () => {
  const bad = [];
  for (const [f, src] of files) src.split('\n').forEach((line, i) => {
    if (/dans (les )?Réglages\b(?! du)/.test(line)) bad.push(`${f}:${i + 1} « Réglages » (l’écran s’appelle « Paramètres »)`);
    if (/Profil › (Matériel|Performances|Mesures\b|Public|Escalade|Mon corps\b(?! et))/.test(line)) bad.push(`${f}:${i + 1} ${line.match(/Profil › [^.,;)]+/)[0]}`);
  });
  assert.deepEqual(bad, []);
});
console.log(`\n${n} tests des indications de navigation OK`);
