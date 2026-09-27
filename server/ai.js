// server/ai.js — assistant de création (exercices, capacités) avec l'IA intégrée de Cloudflare (Workers AI, binding « AI »).
// Aucune clé ni service tiers : le modèle tourne chez Cloudflare, sur le compte qui héberge le site.
// Sécurité et honnêteté :
//  - la réponse du modèle n'est JAMAIS utilisée telle quelle : elle est analysée, bornée et filtrée (seuls les
//    identifiants connus de capacités, muscles, matériel et activités sont gardés) ;
//  - le résultat est une PROPOSITION : l'utilisateur la relit et la modifie avant de l'enregistrer ;
//  - aucune donnée personnelle (performances, historique) n'est envoyée au modèle : seulement le texte tapé.
import { CAPACITIES, MUSCLES, EQUIPMENT, ACTIVITIES } from '../public/model.js';

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, n, len) => (Array.isArray(v) ? v.map((x) => str(typeof x === 'object' ? x?.text ?? x?.name ?? '' : x, len)).filter(Boolean).slice(0, n) : []);
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def; };
const ids = (v, dict, n) => (Array.isArray(v) ? [...new Set(v.map((x) => String(typeof x === 'object' ? x?.id : x || '').trim()).filter((x) => dict[x]))].slice(0, n) : []);
const caps = (v) => {
  const out = {};
  for (const x of Array.isArray(v) ? v : []) { const id = String(x?.id || x || '').trim(); if (CAPACITIES[id]) out[id] = Math.max(0.1, Math.min(1, Number(x?.w) || 0.6)); }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 5));
};

export function buildMessages(kind, text, activityId) {
  const capList = Object.entries(CAPACITIES).map(([id, c]) => `${id} (${c.label})`).join(', ');
  const muscleList = Object.entries(MUSCLES).map(([id, m]) => `${id} (${m.label})`).join(', ');
  const eqList = Object.entries(EQUIPMENT).map(([id, l]) => `${id} (${l})`).join(', ');
  const act = ACTIVITIES[activityId]?.label || 'non précisée';
  const common = `Tu es un entraîneur sportif francophone, précis et prudent. Réponds UNIQUEMENT par un objet JSON valide, sans texte autour.
Écris en français simple, tutoiement, phrases courtes. N'invente pas de chiffres de performance ; si tu n'es pas sûr, dis-le dans "confidence".
Capacités autorisées (utilise seulement ces identifiants) : ${capList}.
Muscles autorisés : ${muscleList}.
Matériel autorisé : ${eqList}.
Activité de l'utilisateur : ${act}.`;
  const exSchema = `{"type":"exercise","name":"nom court","emoji":"1 emoji","summary":"1 phrase : ce que c'est","why":"ce que ça travaille et pourquoi c'est utile","steps":["étape 1","étape 2"],"cues":["point clé"],"mistakes":["erreur fréquente"],"caps":[{"id":"...","w":0.8}],"prim":["muscle"],"sec":["muscle"],"needs":["matériel"],"mode":"reps ou time","sets":3,"repsMin":6,"repsMax":10,"secMin":20,"secMax":40,"rest":90,"diff":2,"safety":"précaution éventuelle","variants":["plus facile : ...","plus dur : ..."],"confidence":"haute|moyenne|faible"}`;
  const capSchema = `{"type":"capacity","label":"nom de la capacité","emoji":"1 emoji","summary":"1 phrase : ce que c'est","why":"pourquoi c'est important dans ce sport","howTo":["comment la travailler, conseil 1","conseil 2"],"linkedCaps":[{"id":"...","w":0.6}],"exercises":[{"name":"exercice","summary":"comment le faire, en 1-2 phrases","mode":"reps ou time","sets":3,"repsMin":5,"repsMax":8,"secMin":20,"secMax":40,"needs":["matériel"],"diff":2}],"measure":{"label":"comment mesurer ses progrès","unit":"unité"},"safety":"précaution éventuelle","confidence":"haute|moyenne|faible"}`;
  const ask = kind === 'exercise' ? `Crée la fiche d'un exercice. Format exact : ${exSchema}`
    : kind === 'capacity' ? `Explique cette capacité (compétence ou qualité physique/technique) et comment la travailler, avec 2 à 4 exercices concrets. Format exact : ${capSchema}`
    : `Décide s'il s'agit d'un exercice précis (type "exercise") ou d'une capacité/compétence à développer (type "capacity"), puis réponds avec le format correspondant. Exercice : ${exSchema} Capacité : ${capSchema}`;
  return [{ role: 'system', content: common + '\n' + ask }, { role: 'user', content: str(text, 300) }];
}

/** Extrait l'objet JSON de la réponse du modèle (texte ou objet) ; null si illisible. */
export function extractJson(resp) {
  if (resp && typeof resp === 'object' && !Array.isArray(resp)) { if (resp.type || resp.name || resp.label) return resp; resp = resp.response ?? resp.result ?? ''; }
  if (resp && typeof resp === 'object') return resp;
  const t = String(resp || ''), i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}
function cleanExerciseDraft(x) {
  const mode = x.mode === 'time' ? 'time' : 'reps';
  const repsMin = num(x.repsMin, 1, 100, 8), secMin = num(x.secMin, 5, 3600, 30);
  return {
    type: 'exercise', name: str(x.name, 80) || 'Exercice', emoji: str(x.emoji, 8) || '💪', summary: str(x.summary, 240), why: str(x.why, 400),
    steps: list(x.steps, 8, 220), cues: list(x.cues, 6, 160), mistakes: list(x.mistakes, 6, 160), variants: list(x.variants, 4, 160), safety: str(x.safety, 240),
    caps: caps(x.caps), prim: ids(x.prim, MUSCLES, 4), sec: ids(x.sec, MUSCLES, 6), needs: ids(x.needs, EQUIPMENT, 4),
    mode, sets: num(x.sets, 1, 10, 3), repsMin, repsMax: Math.max(repsMin, num(x.repsMax, 1, 100, repsMin)), secMin, secMax: Math.max(secMin, num(x.secMax, 5, 3600, secMin)),
    rest: num(x.rest, 0, 600, 90), diff: num(x.diff, 1, 5, 2), confidence: ['haute', 'moyenne', 'faible'].includes(x.confidence) ? x.confidence : 'moyenne',
  };
}
function cleanCapacityDraft(x) {
  return {
    type: 'capacity', label: str(x.label || x.name, 60) || 'Capacité', emoji: str(x.emoji, 8) || '🎯', summary: str(x.summary, 240), why: str(x.why, 400),
    howTo: list(x.howTo, 6, 220), linkedCaps: caps(x.linkedCaps), safety: str(x.safety, 240),
    exercises: (Array.isArray(x.exercises) ? x.exercises : []).slice(0, 4).map((e) => cleanExerciseDraft({ ...e, why: e.why || e.summary })).filter((e) => e.name !== 'Exercice' || e.summary),
    measure: x.measure && typeof x.measure === 'object' ? { label: str(x.measure.label, 120), unit: str(x.measure.unit, 20) } : null,
    confidence: ['haute', 'moyenne', 'faible'].includes(x.confidence) ? x.confidence : 'moyenne',
  };
}
/** Valide une proposition du modèle. Retourne null si elle est inutilisable. */
export function cleanDraft(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const t = kind === 'exercise' || kind === 'capacity' ? kind : raw.type === 'capacity' || raw.howTo || raw.exercises ? 'capacity' : 'exercise';
  const d = t === 'exercise' ? cleanExerciseDraft(raw) : cleanCapacityDraft(raw);
  const meaningful = t === 'exercise' ? d.summary || d.steps.length || d.why : d.summary || d.howTo.length || d.exercises.length;
  return meaningful ? d : null;
}

/** Appel du modèle. env.AI = binding Workers AI. Lève une erreur explicite en cas d'échec. */
export async function aiDraft(env, { kind, text, activityId }) {
  if (!env.AI?.run) { const e = new Error('Assistant IA non activé sur ce serveur (binding « AI » absent).'); e.status = 503; throw e; }
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const resp = await env.AI.run(model, { messages: buildMessages(kind, text, activityId), max_tokens: 1200, temperature: 0.3 });
  const draft = cleanDraft(extractJson(resp), kind);
  if (!draft) { const e = new Error('L’assistant n’a pas donné de réponse exploitable. Reformule ou réessaie.'); e.status = 502; throw e; }
  return { draft, model };
}

/* ───────── Discussion avec le coach ───────── */
// Le coach reçoit la conversation (8 derniers messages) et un court résumé que l'utilisateur voit avant d'écrire :
// sports, niveau déclaré, objectif et dernières séances. Réponse en texte, courte, filtrée.
export function buildChat(messages, profile) {
  const sys = `Tu es un coach sportif francophone, chaleureux et concret. Tu tutoies. Réponds en 2 à 6 phrases courtes, ou une petite liste.
Donne des conseils pratiques d'entraînement (séance, exercice, récupération, technique d'escalade, organisation).
Règles : pas de diagnostic médical ni de traitement ; en cas de douleur qui dure, conseille un professionnel de santé.
Aucune comparaison avec d'autres personnes. N'invente pas de chiffres sur l'utilisateur : utilise seulement ce qui est dans son profil.
Si la question n'a rien à voir avec le sport, réponds en une phrase et ramène la discussion à l'entraînement.
Profil de l'utilisateur : ${str(profile, 900) || 'non renseigné'}.`;
  const msgs = (Array.isArray(messages) ? messages : []).slice(-8).map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: str(m?.content, 600) })).filter((m) => m.content);
  return [{ role: 'system', content: sys }, ...msgs];
}
export function cleanReply(resp) {
  const t = typeof resp === 'string' ? resp : resp?.response ?? resp?.result?.response ?? '';
  return String(t || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/<[^>]*>/g, '').trim().slice(0, 2000);
}
export async function aiChat(env, { messages, profile }) {
  if (!env.AI?.run) { const e = new Error('Coach non activé sur ce serveur.'); e.status = 503; throw e; }
  const msgs = buildChat(messages, profile);
  if (msgs.length < 2 || msgs.at(-1).role !== 'user') { const e = new Error('Écris ta question.'); e.status = 400; throw e; }
  const reply = cleanReply(await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, { messages: msgs, max_tokens: 500, temperature: 0.5 }));
  if (!reply) { const e = new Error('Le coach n’a pas su répondre. Reformule ta question.'); e.status = 502; throw e; }
  return reply;
}
