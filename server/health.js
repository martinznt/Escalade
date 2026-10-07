// health.js — SANTÉ DES DONNÉES (administrateurs) : exercices sans capacités, capacités sans métrique pertinente,
// objectifs difficiles à évaluer, doublons, relations contradictoires (capacités inconnues), données orphelines,
// anciennes structures (qui ne passent plus la validation actuelle). Chaque problème peut proposer une correction,
// qui ne devient jamais qu'un BROUILLON du Studio (validation et publication restent manuelles). Pur, testé.
import { cleanGlobal } from './global.js';
import { CAPACITIES, METRICS, SKILLS } from '../public/model.js';
import { LIBRARY } from '../public/library.js';
import { contextSources, proposalInstructions } from './ai-proposal-evidence.js';

const key = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SEV = { high: 3, mid: 2, low: 1 };

/** items = contenu commun [{ kind, id, data, hidden }]. Retourne { issues, counts, checked }. */
export function dataHealth(items = [], { library = LIBRARY, caps = CAPACITIES, metrics = METRICS, skills = SKILLS } = {}) {
  const issues = [], add = (x) => issues.push(x);
  const libIds = new Set(library.map((x) => x.id));
  // 1. Exercices sans capacités (bibliothèque et exercices communs).
  // Échauffement et retour au calme sont placés par la structure de la séance, pas choisis pour un objectif : non concernés.
  for (const x of library) if (x.role === 'main' && !Object.keys(x.caps || {}).length) add({ type: 'no-caps', severity: 'mid', target: `exercise/${x.id}`, text: `Exercice « ${x.name} » sans capacité liée : il ne peut pas être proposé selon un objectif.` });
  for (const g of items.filter((i) => i.kind === 'exercise' && !i.hidden && i.data)) if (!Object.keys(g.data.caps || {}).length) add({ type: 'no-caps', severity: 'mid', target: `exercise/${g.id}`, text: `Exercice commun « ${g.data.name} » sans capacité liée.` });
  // 2. Relations contradictoires : capacités inconnues dans les liens.
  for (const x of library) for (const c of Object.keys(x.caps || {})) if (!caps[c]) add({ type: 'bad-relation', severity: 'high', target: `exercise/${x.id}`, text: `« ${x.name} » renvoie à une capacité inconnue (« ${c} »).` });
  for (const g of items.filter((i) => ['exercise', 'intent'].includes(i.kind) && i.data)) for (const c of Object.keys(g.data.caps || {})) if (!caps[c]) add({ type: 'bad-relation', severity: 'high', target: `${g.kind}/${g.id}`, text: `« ${g.data.name || g.data.label} » renvoie à une capacité inconnue (« ${c} »).`, fix: { kind: g.kind, id: g.id, op: 'put', data: { ...g.data, caps: Object.fromEntries(Object.entries(g.data.caps).filter(([k]) => caps[k])) } } });
  // 3. Capacités sans métrique pertinente (impossibles à évaluer autrement que par déclaration).
  for (const [c, cap] of Object.entries(caps)) if (!Object.values(metrics).some((m) => (m.caps?.[c] || 0) >= 0.3)) add({ type: 'no-metric', severity: 'low', target: `capacity/${c}`, text: `Capacité « ${cap.label} » sans métrique pertinente : son niveau ne peut venir que d’une déclaration.` });
  // 4. Objectifs (figures) difficiles à évaluer : sans critère mesurable.
  for (const [id, s] of Object.entries(skills)) if (!(s.criteria || []).length && !(s.steps || []).some((st) => st.criterion?.metric)) add({ type: 'hard-goal', severity: 'mid', target: `skill/${id}`, text: `Objectif « ${s.label} » sans critère mesurable : progression difficile à évaluer.` });
  // 5. Doublons (même nom) : bibliothèque vs contenu commun, et à l'intérieur du contenu commun.
  const seen = new Map();
  for (const x of library) seen.set('exercise:' + key(x.name), `exercise/${x.id}`);
  for (const g of items.filter((i) => !i.hidden && i.data)) {
    const name = g.data.name || g.data.label || g.data.q || g.data.title; if (!name) continue;
    const k = `${g.kind}:${key(name)}`;
    if (seen.has(k) && seen.get(k) !== `${g.kind}/${g.id}`) add({ type: 'duplicate', severity: 'low', target: `${g.kind}/${g.id}`, text: `« ${name} » existe déjà (${seen.get(k)}).`, fix: { kind: g.kind, id: g.id, op: 'hide' } });
    else seen.set(k, `${g.kind}/${g.id}`);
  }
  // 6. Données orphelines : séance prête qui renvoie à un exercice absent.
  for (const g of items.filter((i) => i.kind === 'catalog' && i.data)) for (const e of g.data.ex || []) if (!libIds.has(e.libId) && !items.some((i) => i.kind === 'exercise' && i.id === e.libId)) add({ type: 'orphan', severity: 'high', target: `catalog/${g.id}`, text: `Séance prête « ${g.data.name} » : l’exercice « ${e.libId} » n’existe plus.` });
  // 7. Anciennes structures : ce qui ne passe plus la validation actuelle.
  for (const g of items.filter((i) => !i.hidden && i.data)) {
    const clean = cleanGlobal(g.kind, g.data);
    if (!clean) add({ type: 'old-structure', severity: 'high', target: `${g.kind}/${g.id}`, text: `« ${g.id} » (${g.kind}) ne passe plus la validation actuelle : il est ignoré par l’app.`, fix: { kind: g.kind, id: g.id, op: 'delete' } });
    else if (JSON.stringify(clean) !== JSON.stringify(g.data)) add({ type: 'old-structure', severity: 'low', target: `${g.kind}/${g.id}`, text: `« ${g.data.name || g.data.label || g.id} » : ancienne structure, des champs seraient normalisés.`, fix: { kind: g.kind, id: g.id, op: 'put', data: clean } });
  }
  issues.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
  const counts = {}; for (const x of issues) counts[x.type] = (counts[x.type] || 0) + 1;
  return { issues: issues.slice(0, 300), counts, checked: { exercises: library.length, capacities: Object.keys(caps).length, skills: Object.keys(skills).length, common: items.length } };
}

/* ───────── IA de maintenance : sans IA, un regroupement déterministe des signalements reste utile ───────── */
/** Regroupe des signalements par page et par mots fréquents (sans IA). */
export function groupBugs(bugs = []) {
  const groups = new Map();
  for (const b of bugs) {
    const k = b.page || 'autre', g = groups.get(k) || { page: k, count: 0, titles: [], recent: 0 };
    g.count++; if (g.titles.length < 5) g.titles.push(String(b.title || '').slice(0, 80)); g.recent = Math.max(g.recent, b.createdAt || 0); groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.recent - a.recent).map((g) => ({ ...g, text: `${g.count} signalement(s) sur « ${g.page} » : ${g.titles.join(' ; ')}` }));
}
export function buildMaintenance(bugs, { sources = [] } = {}) {
  return [
    { role: 'system', content: `Tu aides un administrateur à analyser des signalements d’une app d’entraînement. Réponds en JSON strict : {"findings":[{"title":"…","detail":"…","severity":"faible|moyen|élevé","proposal":"…","area":"contenu|données|configuration|code","sources":["report:0"]}]}. Pas de code exécutable, pas de commande. Les bugs sont des déclarations d’utilisateurs, pas des incidents reproduits : détail rapporté, cause et correction hypothétiques à tester. Cite pour chaque finding les identifiants report:N des signalements qui le soutiennent. N’affirme aucun test, vérification du code ou correction effectuée.\n${sources.length ? proposalInstructions(sources) : ''}` },
    { role: 'user', content: JSON.stringify(maintenanceReports(bugs)) },
  ];
}
export const maintenanceReports = (bugs = []) => bugs.slice(0, 40).map((b, i) => ({ source: `report:${i}`, titre: String(b.title || '').slice(0, 120), description: String(b.description || '').slice(0, 400), page: String(b.page || '').slice(0, 80), version: String(b.appVersion || '').slice(0, 30) }));
export function maintenanceSources(bugs) {
  return contextSources({ text: 'Analyser les signalements ouverts sans rien appliquer.', model: 'Seuls les signalements ci-dessous ont été lus. Ils décrivent des problèmes rapportés, sans reproduction ni inspection du code. Les causes, sévérités et corrections proposées sont des hypothèses à relire et tester.', additional: maintenanceReports(bugs).map((report) => ({ id: report.source, label: 'Signalement utilisateur : ' + report.titre, kind: 'request', excerpt: JSON.stringify(report) })) });
}
const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
export function cleanMaintenance(x, { sources = [], requireEvidence = false } = {}) {
  const refs = new Map(sources.filter((source) => /^report:\d+$/.test(source.id)).map(({ excerpt, ...source }) => [source.id, source]));
  if (requireEvidence && (!Array.isArray(x?.findings) || x.findings.some((finding) => !Array.isArray(finding?.sources) || !finding.sources.length || finding.sources.length > 40 || finding.sources.some((id) => typeof id !== 'string' || !refs.has(id))))) return null;
  const list = (Array.isArray(x?.findings) ? x.findings : []).slice(0, 10).map((f) => ({ title: s(f?.title, 120), detail: s(f?.detail, 600), proposal: s(f?.proposal, 600),
    severity: ['faible', 'moyen', 'élevé'].includes(f?.severity) ? f.severity : 'moyen', area: ['contenu', 'données', 'configuration', 'code'].includes(f?.area) ? f.area : 'code', ...(requireEvidence ? { basis: 'reported', sources: [...new Set(f.sources)].map((id) => refs.get(id)) } : {}) })).filter((f) => f.title);
  return list.length ? list : null;
}

/* ───────── Propositions de code : analyse d'impact d'un diff (jamais appliqué, jamais déployé) ───────── */
const SENSITIVE = [/^worker\.js$/, /^schema\.js$/, /^server\//, /^wrangler\.json$/, /^public\/sw\.js$/];
export function analyzeDiff(diff) {
  const text = String(diff || '');
  const files = [...new Set([...text.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim()).filter((f) => f !== '/dev/null'))].slice(0, 100);
  const added = (text.match(/^\+(?!\+\+)/gm) || []).length, removed = (text.match(/^-(?!--)/gm) || []).length;
  const flags = [];
  if (files.some((f) => SENSITIVE.some((r) => r.test(f)))) flags.push('Touche le serveur, le schéma, la configuration ou le service worker : relecture attentive.');
  if (/^\+.*\b(DROP\s+TABLE|DELETE\s+FROM\s+\w+\s*;?\s*$|ALTER\s+TABLE\s+\w+\s+DROP)/im.test(text)) flags.push('Contient une suppression de données ou de colonne : migration à vérifier (sauvegarde D1 avant).');
  if (/^\+.*\b(eval\s*\(|new\s+Function\s*\(|child_process|execSync)/m.test(text)) flags.push('Contient une exécution de code dynamique : refusé par la politique de sécurité.');
  if (/^\+.*(EDIT_PASSWORD|VAPID_PRIVATE|password_hash)\s*[:=]/m.test(text)) flags.push('Semble contenir un secret ou le modifier : interdit dans une proposition.');
  const migration = files.some((f) => f === 'schema.js' || /migrat/i.test(f));
  const blocked = flags.some((f) => /refusé|interdit/.test(f));
  return { files, added, removed, migration, flags, blocked, areas: [...new Set(files.map((f) => (f.startsWith('public/') ? 'interface' : f.startsWith('server/') || f === 'worker.js' ? 'serveur' : f.startsWith('tests/') ? 'tests' : f === 'schema.js' ? 'migration D1' : 'autre')))] };
}
