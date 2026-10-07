// studio.js — Studio d'administration : règles pures (sans base de données) pour les lots de modifications du
// contenu commun. Un lot (change set) = une liste d'opérations { kind, id, op, data } ; op = put (créer ou remplacer),
// hide (masquer pour tous) ou delete (revenir au contenu d'origine de l'app). Tout passe par cleanGlobal : aucune donnée
// n'est prise telle quelle, et rien n'est jamais exécuté (pas d'eval, pas de code, pas de shell). Testé.
import { KINDS, ID_OK, cleanGlobal } from './global.js';
import { extractJson } from './ai.js';
import { proposalInstructions } from './ai-proposal-evidence.js';

export const OPS = { put: 'Créer ou remplacer', hide: 'Masquer pour tous', delete: 'Revenir à l’origine' };
export const STATUS = { draft: 'Brouillon', published: 'Publié', rolled_back: 'Annulé (retour arrière)', discarded: 'Abandonné' };
export const SOURCES = { admin: 'Administrateur', direct: 'Modification directe', proposal: 'Proposition acceptée', ai: 'Brouillon IA', lab: 'Laboratoire' };
export const MAX_ITEMS = 50, MAX_JSON = 40000, MAX_GLOBAL = 2000;
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Nettoie les opérations d'un lot. Retourne { items, errors } ; une opération invalide est refusée, jamais corrigée en silence. */
export function cleanChange(list) {
  const items = [], errors = [], seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, MAX_ITEMS + 1).forEach((x, i) => {
    const n = i + 1;
    if (i >= MAX_ITEMS) { errors.push(`Plus de ${MAX_ITEMS} modifications dans un lot.`); return; }
    const kind = String(x?.kind || ''), id = String(x?.id || ''), op = OPS[x?.op] ? x.op : 'put';
    if (!KINDS.includes(kind)) { errors.push(`Modification ${n} : type « ${str(kind, 20)} » inconnu.`); return; }
    if (!ID_OK.test(id)) { errors.push(`Modification ${n} : identifiant invalide.`); return; }
    if (seen.has(kind + '/' + id)) { errors.push(`Modification ${n} : ${kind}/${id} apparaît deux fois dans le lot.`); return; }
    seen.add(kind + '/' + id);
    if (op !== 'put') { items.push({ kind, id, op, data: null }); return; }
    const data = cleanGlobal(kind, x?.data);
    if (!data) { errors.push(`Modification ${n} (${kind}/${id}) : données incomplètes ou invalides.`); return; }
    if (JSON.stringify(data).length > MAX_JSON) { errors.push(`Modification ${n} (${kind}/${id}) : trop volumineuse.`); return; }
    items.push({ kind, id, op, data });
  });
  return { items, errors };
}

/** Différence lisible entre deux valeurs JSON : [{ path, type: added|removed|changed, before, after }]. */
export function diffValues(before, after, path = '', out = [], depth = 0) {
  const isObj = (v) => v && typeof v === 'object';
  if (JSON.stringify(before) === JSON.stringify(after)) return out;
  if (depth > 4 || !isObj(before) || !isObj(after) || Array.isArray(before) !== Array.isArray(after)) {
    out.push({ path: path || '(tout)', type: before === undefined || before === null ? 'added' : after === undefined || after === null ? 'removed' : 'changed', before: before ?? null, after: after ?? null });
    return out;
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const k of keys) diffValues(before[k], after[k], path ? `${path}.${k}` : k, out, depth + 1);
  return out.slice(0, 200);
}

/** Effet d'une opération sur l'état courant d'un élément ({ data, hidden } ou null = contenu d'origine). */
export function afterOf(item) {
  if (item.op === 'delete') return null;
  if (item.op === 'hide') return { data: null, hidden: true };
  return { data: item.data, hidden: false };
}
const stateOf = (x) => (!x ? 'contenu d’origine' : x.hidden ? 'masqué pour tous' : 'modifié pour tous');
/** Différences entre deux états d'un élément, champ par champ (plus l'état : origine / masqué / modifié). */
export function diffState(before, after) {
  const out = diffValues(before?.hidden ? {} : before?.data || {}, after?.hidden ? {} : after?.data || {});
  if (stateOf(before) !== stateOf(after)) out.unshift({ path: 'état', type: 'changed', before: stateOf(before), after: stateOf(after) });
  return out;
}
/** Diff d'un lot : pour chaque opération, avant (état courant) → après. */
export function diffChange(items, current) {
  return items.map((it) => {
    const before = current[it.kind + '/' + it.id] || null, after = afterOf(it);
    return { kind: it.kind, id: it.id, op: it.op, isNew: !before, changes: diffState(before, after) };
  });
}

/**
 * Vérifications avant publication (résultat enregistré) : validité, doublons, taille, nombre total d'éléments communs,
 * lot non vide, aucun changement sans effet, aucun contenu actif (script, javascript:, gestionnaire on…=).
 */
export function runChecks(rawItems, { currentCount = 0, current = {} } = {}) {
  const { items, errors } = cleanChange(rawItems);
  const added = items.filter((it) => it.op === 'put' && !current[it.kind + '/' + it.id]).length;
  const noop = diffChange(items, current).filter((d) => !d.changes.length).map((d) => `${d.kind}/${d.id}`);
  const active = items.filter((it) => /<\s*script|javascript:|\bon\w+\s*=|<\s*iframe/i.test(JSON.stringify(it.data || {}))).map((it) => `${it.kind}/${it.id}`);
  const checks = [
    { id: 'valid', label: 'Chaque modification est valide', ok: !errors.length, detail: errors.join(' ') || `${items.length} modification(s) valides` },
    { id: 'notEmpty', label: 'Le lot n’est pas vide', ok: items.length > 0, detail: items.length ? '' : 'Ajoute au moins une modification.' },
    { id: 'effect', label: 'Chaque modification change quelque chose', ok: !noop.length, detail: noop.length ? `Sans effet : ${noop.join(', ')}` : '' },
    { id: 'active', label: 'Aucun contenu actif (script, lien javascript, gestionnaire d’événement)', ok: !active.length, detail: active.length ? `À retirer : ${active.join(', ')}` : '' },
    { id: 'limit', label: `Pas plus de ${MAX_GLOBAL} éléments communs`, ok: currentCount + added <= MAX_GLOBAL, detail: `${currentCount} + ${added} nouveau(x)` },
  ];
  return { ok: checks.every((c) => c.ok), checks, items };
}

/* ───────── IA admin sûre : elle rédige des BROUILLONS, jamais de publication ni de code ───────── */
const KIND_HELP = {
  exercise: '{"name":"…","emoji":"…","mode":"reps|time","sets":3,"repsMin":6,"repsMax":10,"secMin":0,"secMax":0,"rest":90,"cues":["…"],"bad":["…"],"why":"…","what":"…","needs":["bar"],"caps":{"tirage_vertical":1},"intensity":"low|mod|high"}',
  announce: '{"title":"…","body":"…","emoji":"📣"}',
  faq: '{"q":"…","a":"…"}',
  text: '{"from":"texte exact actuel","to":"nouveau texte"}',
  intent: '{"label":"…","emoji":"…","activityId":"","caps":{"technique_pieds":1}}',
  style: '{"label":"…","activity":"climbing_boulder"}',
};
export const AI_KINDS = Object.keys(KIND_HELP);
export function buildAdminDraft(kind, text, { sources = [] } = {}) {
  return [
    { role: 'system', content: `Tu aides un administrateur d'une app d'entraînement sportif. Tu rédiges UNE proposition de contenu commun de type « ${kind} », au format JSON strict : ${KIND_HELP[kind]}. Uniquement du JSON, sans code, sans HTML, sans lien. N'invente aucune donnée chiffrée qui ne figure pas dans la demande ; laisse vide ce que tu ne sais pas. Ta proposition sera relue et validée par l'administrateur avant toute publication.\n${sources.length ? proposalInstructions(sources) : ''}` },
    { role: 'user', content: str(text, 1500) },
  ];
}
/** Sortie IA → données validées par cleanGlobal (ou null). Les champs inconnus sont ignorés. */
export function cleanAdminDraft(raw, kind) {
  if (!AI_KINDS.includes(kind)) return null;
  const x = extractJson(raw);
  return x && typeof x === 'object' ? cleanGlobal(kind, x) : null;
}

/* ───────── Laboratoire : reformuler, identifier les règles, proposer des solutions avec avantages / inconvénients ───────── */
export function buildLab(text, { sources = [] } = {}) {
  return [
    { role: 'system', content: `Tu aides un administrateur à analyser un problème ou une idée pour une app d’entraînement sportif. Réponds en JSON strict : {"reformulation":"…","rules":["règle ou contrainte en jeu"],"questions":["information manquante"],"solutions":[{"title":"…","how":"…","pros":["…"],"cons":["…"],"risk":"faible|moyen|élevé","change":null}]}. « change » peut contenir une proposition de contenu commun {"kind":"announce|faq|text|exercise|intent|style","data":{…}} seulement si c’est pertinent ; sinon null. Pas de code, pas de commande, pas de HTML. N’invente pas de faits : si une information manque, mets-la dans « questions ». Les avantages, risques et solutions sont des hypothèses à relire, pas des effets testés.\n${sources.length ? proposalInstructions(sources) : ''}` },
    { role: 'user', content: str(text, 2000) },
  ];
}
const strs = (a, n, len) => (Array.isArray(a) ? a.map((x) => str(x, len)).filter(Boolean).slice(0, n) : []);
export function cleanLab(raw) {
  const x = extractJson(raw);
  if (!x || typeof x !== 'object') return null;
  const reformulation = str(x.reformulation, 600);
  const solutions = (Array.isArray(x.solutions) ? x.solutions : []).slice(0, 4).map((s) => {
    const kind = AI_KINDS.includes(s?.change?.kind) ? s.change.kind : '';
    const data = kind ? cleanGlobal(kind, s.change.data) : null;
    return { title: str(s?.title, 120), how: str(s?.how, 600), pros: strs(s?.pros, 5, 200), cons: strs(s?.cons, 5, 200), risk: ['faible', 'moyen', 'élevé'].includes(s?.risk) ? s.risk : 'moyen', change: data ? { kind, data } : null };
  }).filter((s) => s.title);
  if (!reformulation && !solutions.length) return null;
  return { reformulation, rules: strs(x.rules, 8, 240), questions: strs(x.questions, 6, 240), solutions };
}
