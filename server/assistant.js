// assistant.js — « Discuter avec l'assistant du site » (administrateurs) : une conversation en français avec l'IA
// du serveur (Workers AI, sans abonnement extérieur). L'assistant répond et PROPOSE des modifications du contenu commun ;
// chaque proposition passe par cleanChange / cleanGlobal (rien n'est pris tel quel) et ne va que dans un BROUILLON du
// Studio : l'administrateur relit les différences, puis publie lui-même. Jamais de code exécuté, jamais de publication.
// Ce qui demande du code (nouvelle fonction, nouvel écran) est dit clairement et rédigé comme une demande à transmettre.
// Règles pures, testées ; les appels réseau sont dans worker.js.
import { cleanChange } from './studio.js';
import { cleanGlobal, ID_OK } from './global.js';
import { extractJson } from './ai.js';

const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
export const MAX_TURNS = 12;
/** Ce que l'assistant sait modifier, et le format attendu (champs utiles seulement). */
export const ASSIST_KINDS = {
  exercise: { label: 'Exercice', format: '{"name":"…","emoji":"…","mode":"reps|time","sets":3,"repsMin":6,"repsMax":10,"secMin":30,"secMax":45,"rest":90,"perSide":false,"cues":["consigne"],"bad":["erreur fréquente"],"why":"à quoi il sert","what":"description","needs":["bar|hangboard|wall|weights|band|dips|rings"],"caps":{"capacité":0.8},"intensity":"low|mod|high"}' },
  intent: { label: 'Intention de séance (par sport)', format: '{"label":"…","emoji":"…","activityId":"climbing_boulder|climbing_route|strength|conditioning|running|swimming","caps":{"capacité":1}}' },
  faq: { label: 'Question fréquente (Aide)', format: '{"q":"question","a":"réponse"}' },
  announce: { label: 'Annonce à tous', format: '{"title":"…","body":"…","emoji":"📣"}' },
  hint: { label: 'Raccourci sur une page', format: '{"where":"home/dash","go":"profile/goals","text":"…","icon":"💡","back":"Retour"}' },
  text: { label: 'Texte de l’app réécrit', format: '{"from":"texte EXACT affiché aujourd’hui","to":"nouveau texte"}' },
  style: { label: 'Style d’escalade', format: '{"label":"…","activity":"climbing_boulder"}' },
};
export const CANNOT = ['ajouter ou changer une fonction, un écran ou un calcul de l’app (cela demande du code)', 'lire les données personnelles des membres', 'publier : tu relis et publies toi-même dans le Studio'];

const words = (t) => [...new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4))];
/**
 * Contenu existant lié à la demande (pour que l'assistant modifie le bon élément, avec son identifiant) :
 * exercices, questions fréquentes, intentions dont le nom partage un mot avec la conversation. 12 au plus, compacts.
 */
export function findContext(text, { library = [], faq = [], intents = {}, globals = [] } = {}) {
  const w = words(text); if (!w.length) return [];
  const hit = (s) => { const x = words(s); return w.filter((k) => x.some((y) => y.startsWith(k) || k.startsWith(y))).length; };
  const out = [];
  for (const x of library) { const n = hit(x.name); if (n) out.push({ n, kind: 'exercise', id: x.id, data: { name: x.name, mode: x.mode, sets: x.sets, repsMin: x.repsMin, repsMax: x.repsMax, secMin: x.secMin, secMax: x.secMax, rest: x.rest, intensity: x.intensity, needs: x.needs, why: x.why } }); }
  for (const f of faq) { const n = hit(f[0]); if (n) out.push({ n, kind: 'faq', id: f[2], data: { q: f[0], a: String(f[1]).slice(0, 300) } }); }
  for (const [act, list] of Object.entries(intents)) for (const i of list || []) { const n = hit(i.label); if (n) out.push({ n, kind: 'intent', id: `${act}__${i.id}`, data: { label: i.label, emoji: i.emoji, activityId: act } }); }
  for (const g of globals) { const t = g.data?.name || g.data?.label || g.data?.q || g.data?.title || g.data?.text || ''; const n = hit(t); if (n && !out.some((o) => o.kind === g.kind && o.id === g.id)) out.push({ n, kind: g.kind, id: g.id, data: g.data, modified: true }); }
  return out.sort((a, b) => b.n - a.n).slice(0, 12).map(({ n, ...x }) => x);
}

/** Messages pour le modèle : règles, formats, contenu lié, puis la conversation (12 derniers tours). */
export function buildAssistant(messages, context = []) {
  const kinds = Object.entries(ASSIST_KINDS).map(([k, v]) => `- ${k} (${v.label}) : ${v.format}`).join('\n');
  const ctx = context.length ? context.map((c) => `${c.kind}/${c.id}${c.modified ? ' (déjà modifié)' : ''} : ${JSON.stringify(c.data)}`).join('\n') : '(aucun élément existant trouvé pour cette demande)';
  const sys = `Tu es l’assistant d’administration de « Séances entraînement », une app d’entraînement (escalade, renforcement, musculation, course, natation). Tu parles français, simplement, sans jargon.
Tu aides l’administrateur à modifier le CONTENU commun de l’app. Tu ne publies rien : tes modifications deviennent un brouillon qu’il relit.
Types modifiables et format des données :
${kinds}
Règles :
- Pour modifier un élément existant, reprends EXACTEMENT son type et son identifiant ci-dessous, et donne seulement les champs à changer.
- Pour créer un élément, utilise un identifiant nouveau de la forme "n-mot-cle" (lettres, chiffres, tirets).
- "op" vaut "put" (créer ou modifier), "hide" (masquer pour tous) ou "delete" (revenir à l’origine).
- Pas de code, pas de HTML, pas de lien javascript. Pas de données personnelles. Pas de conseil médical.
- Si la demande demande une nouvelle fonction ou un nouveau calcul, dis-le dans "needsCode" (titre + description claire pour un développeur) : tu ne peux pas le faire.
- S’il manque une information, pose la question dans "questions" au lieu d’inventer.
Éléments existants liés à la demande :
${ctx}
Réponds UNIQUEMENT en JSON : {"reply":"ta réponse courte","changes":[{"kind":"…","id":"…","op":"put","data":{…},"why":"pourquoi"}],"questions":["…"],"needsCode":null}`;
  const turns = (Array.isArray(messages) ? messages : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: str(m.content, 1500) })).filter((m) => m.content);
  return [{ role: 'system', content: sys }, ...turns];
}

/**
 * Sortie du modèle → réponse sûre. base(kind, id) donne les données actuelles d'un élément (pour fusionner une
 * modification partielle). Retourne { reply, items, rejected, questions, needsCode, explain }.
 */
export function cleanAssistant(raw, { base = () => null } = {}) {
  const x = typeof raw === 'object' && raw && !raw.response ? raw : extractJson(raw);
  if (!x || typeof x !== 'object') {
    const text = str(typeof raw === 'string' ? raw : raw?.response, 1500);
    return text ? { reply: text, items: [], rejected: [], questions: [], needsCode: null, explain: [] } : null;
  }
  const rejected = [], prepared = [], explain = [];
  for (const c of (Array.isArray(x.changes) ? x.changes : []).slice(0, 20)) {
    const kind = String(c?.kind || ''), id = String(c?.id || ''), op = ['put', 'hide', 'delete'].includes(c?.op) ? c.op : 'put';
    if (!ASSIST_KINDS[kind]) { rejected.push(`Type « ${str(kind, 20) || '?'} » : l’assistant ne peut pas le modifier.`); continue; }
    if (!ID_OK.test(id)) { rejected.push(`${ASSIST_KINDS[kind].label} : identifiant invalide.`); continue; }
    let data = null;
    if (op === 'put') {
      const cur = base(kind, id);
      data = cleanGlobal(kind, { ...(cur || {}), ...(c.data && typeof c.data === 'object' ? c.data : {}) });
      if (!data) { rejected.push(`${ASSIST_KINDS[kind].label} « ${id} » : données incomplètes ou invalides.`); continue; }
    } else if (!base(kind, id)) { rejected.push(`${ASSIST_KINDS[kind].label} « ${id} » : élément inconnu, rien à ${op === 'hide' ? 'masquer' : 'rétablir'}.`); continue; }
    prepared.push({ kind, id, op, data });
    explain.push({ kind, id, op, why: str(c?.why, 240) });
  }
  const { items, errors } = cleanChange(prepared);
  rejected.push(...errors);
  const nc = x.needsCode && typeof x.needsCode === 'object' ? { title: str(x.needsCode.title, 120), summary: str(x.needsCode.summary || x.needsCode.description, 1200) } : null;
  return {
    reply: str(x.reply, 1500) || (items.length ? 'Voici ce que je propose.' : 'Je n’ai rien proposé.'),
    items, rejected, explain: explain.filter((e) => items.some((i) => i.kind === e.kind && i.id === e.id)),
    questions: (Array.isArray(x.questions) ? x.questions : []).map((q) => str(q, 240)).filter(Boolean).slice(0, 4),
    needsCode: nc?.title ? nc : null,
  };
}
/** Fusionne de nouvelles modifications dans un brouillon (même type + identifiant = remplacé). */
export function mergeItems(current, added) {
  const key = (i) => i.kind + '/' + i.id, map = new Map((current || []).map((i) => [key(i), i]));
  for (const i of added || []) map.set(key(i), i);
  return [...map.values()];
}
