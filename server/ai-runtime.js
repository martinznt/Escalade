// Gemini / Workers AI : choix explicite, réponses et réserve commune à toutes les fonctions IA.
// Tarifs en neurones / million de tokens, documentation Cloudflare vérifiée le 04/10/2026.
import { GEMINI_MODEL, runGemini } from './gemini.js';
export const DEFAULT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const AI_MODELS = {
  [GEMINI_MODEL]: { label: 'Gemini 3.8 Flash · recommandé', provider: 'gemini', unit: 'requests', minBudget: 1, maxBudget: 500, defaultBudget: 40 },
  [DEFAULT_MODEL]: { label: 'Qwen 3 · Cloudflare', provider: 'cloudflare', unit: 'neurons', input: 4625, output: 30475, minBudget: 1000, maxBudget: 9000, defaultBudget: 8000 },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { label: 'Llama 3.3 70B · Cloudflare', provider: 'cloudflare', unit: 'neurons', input: 26668, output: 204805, minBudget: 1000, maxBudget: 9000, defaultBudget: 8000 },
};
const CONFIG_KEY = 'ai:config';
const PREFERENCE_CHOICES = { answerStyle: ['direct','pedagogical'], detail: ['short','standard','detailed'], reasoning: ['minimal','low'] };
const DEFAULT_PREFERENCES = Object.freeze({ answerStyle:'direct',detail:'standard',reasoning:'low',creativity:0.1,askWhenUnclear:true,sourcePolicy:'verified_only',requireConfirmation:true });
const query = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const safeError = (message, status, code) => Object.assign(new Error(message), { status, code, aiSafe: true });
const configured = (env, provider) => provider === 'gemini' ? !!String(env.GEMINI_API_KEY || '').trim() : !!env.AI?.run;
export const hasAI = (env) => configured(env, 'gemini') || configured(env, 'cloudflare');
export function aiError(e, fallback = 'L’assistant est indisponible. Réessaie dans un instant.') {
  return e?.aiSafe ? { error: e.message, status: e.status, quota: e.code === 'AI_QUOTA' } : { error: fallback, status: 503 };
}
function preferences(value) {
  const saved=value && typeof value==='object' && !Array.isArray(value) ? value : {},out={...DEFAULT_PREFERENCES};
  for(const [name,choices] of Object.entries(PREFERENCE_CHOICES))if(choices.includes(saved[name]))out[name]=saved[name];
  if(typeof saved.creativity==='number' && Number.isFinite(saved.creativity) && saved.creativity>=0 && saved.creativity<=0.3)out.creativity=saved.creativity;
  return out;
}
function updatePreferences(input, previous) {
  if(input===undefined)return {...previous};
  if(!input || typeof input!=='object' || Array.isArray(input))throw safeError('Réglages de réponse invalides.',400,'AI_CONFIG');
  for(const name of Object.keys(input))if(!Object.hasOwn(DEFAULT_PREFERENCES,name))throw safeError('Réglage de réponse inconnu.',400,'AI_CONFIG');
  for(const [name,choices] of Object.entries(PREFERENCE_CHOICES))if(Object.hasOwn(input,name) && !choices.includes(input[name]))throw safeError('Choisis une option de réponse proposée.',400,'AI_CONFIG');
  if(Object.hasOwn(input,'creativity') && (typeof input.creativity!=='number' || !Number.isFinite(input.creativity) || input.creativity<0 || input.creativity>0.3))throw safeError('La créativité doit être un nombre entre 0 et 0,3.',400,'AI_CONFIG');
  for(const name of ['askWhenUnclear','sourcePolicy','requireConfirmation'])if(Object.hasOwn(input,name) && input[name]!==DEFAULT_PREFERENCES[name])throw safeError('Les règles de clarification, de sources vérifiées et de confirmation restent obligatoires.',400,'AI_CONFIG');
  return preferences({...previous,...input});
}
async function config(env) {
  let saved = {};
  if (env.DB?.prepare) {
    const row = await query(env, 'SELECT value FROM system_state WHERE key=?', CONFIG_KEY).first();
    try { const value=JSON.parse(row?.value || '{}');if(value && typeof value==='object' && !Array.isArray(value))saved=value; } catch {}
  }
  const preferred = saved.model || env.AI_MODEL || (configured(env, 'gemini') ? GEMINI_MODEL : DEFAULT_MODEL);
  const model = Object.hasOwn(AI_MODELS, preferred) ? preferred : DEFAULT_MODEL;
  const meta = AI_MODELS[model];
  const n = Number(saved.budget ?? (meta.provider === 'gemini' ? env.GEMINI_DAILY_BUDGET : env.AI_DAILY_BUDGET) ?? meta.defaultBudget);
  return { model, budget: Number.isFinite(n) ? Math.max(meta.minBudget, Math.min(meta.maxBudget, Math.round(n))) : meta.defaultBudget,preferences:preferences(saved.preferences) };
}
export async function aiPreferences(env) { return (await config(env)).preferences; }
function responseInstructions(p) {
  const style=p.answerStyle==='pedagogical' ? 'Explique progressivement, en français clair, avec des exemples utiles.' : 'Réponds directement, en français clair, sans jargon inutile.';
  const detail={short:'Réponse courte : quelques phrases utiles.',standard:'Donne les explications nécessaires, sans longue introduction.',detailed:'Développe les étapes et les explications utiles, sans répétition.'}[p.detail];
  return `Règles communes de l’assistant : ${style} ${detail}
Ne prétends jamais avoir exécuté une action, vérifié un fait ou consulté une source si ce n’est pas le cas.
Si la demande est ambiguë, incomprise, ou manque d’une information indispensable, réponds dans le format JSON demandé avec status:"clarify", une question courte dans question et reply, et aucune action, modification ou édition : actions:[], changes:[], edits:[]. Ne devine pas l’intention.
Si une affirmation factuelle nécessaire ne peut pas être vérifiée à partir des sources et données fournies par le serveur, retourne status:"unverified", explique brièvement ce qui manque et ne propose aucune action, modification ou édition.
Cite seulement les sources réellement fournies par le serveur. N’invente aucun lien, chiffre, performance, mesure ou résultat. Distingue les déclarations et les estimations des faits vérifiés.
Toute modification exige une confirmation explicite de l’utilisateur. N’affirme jamais qu’une proposition a déjà été appliquée.`;
}
function withResponseInstructions(options,p) {
  const messages=Array.isArray(options.messages) ? options.messages.map((m)=>({...m})) : typeof options.prompt==='string' ? [{role:'user',content:options.prompt}] : [];
  const first=messages.findIndex((m)=>m.role==='system' && typeof m.content==='string'),instructions=responseInstructions(p);
  if(first>=0)messages[first]={...messages[first],content:messages[first].content+'\n'+instructions};
  else messages.unshift({role:'system',content:instructions});
  return messages;
}
function checkedResponse(raw,{json,allowClarification}) {
  if(!json || allowClarification)return raw;
  let value=raw && typeof raw==='object' ? raw.response ?? raw.result ?? raw : null;
  if(!value || typeof value!=='object' || Array.isArray(value))value=null;
  if(!value || !['status','understood','understanding','needsClarification','needs_clarification','grounded','verified','question','questions'].some((name)=>Object.hasOwn(value,name))){
    try{value=JSON.parse(responseText(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return raw;}
  }
  const question=typeof value?.question==='string' && value.question.trim() ? value.question : (Array.isArray(value?.questions) ? value.questions : []).find((item)=>typeof item==='string' && item.trim());
  if(value?.status==='clarify' || value?.status==='unverified' || value?.understood===false || value?.understanding===false || ['unclear','unknown','not_understood'].includes(value?.understanding) || value?.needsClarification===true || value?.needs_clarification===true || value?.grounded===false || value?.verified===false || question){
    const text=question || (value?.status==='unverified' || value?.grounded===false || value?.verified===false ? 'Les informations nécessaires ne sont pas vérifiables. Aucun changement n’a été appliqué.' : 'Je ne comprends pas assez précisément ta demande. Peux-tu la préciser ?');
    const message=text.replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,240) || 'Je ne comprends pas assez précisément ta demande. Peux-tu la préciser ?';
    throw safeError(message,422,'AI_CLARIFY');
  }
  return raw;
}
export async function aiStatus(env) {
  const c = await config(env), day = new Date().toISOString().slice(0, 10);
  const meta = AI_MODELS[c.model], prefix = meta.provider === 'gemini' ? 'ai:gemini:' : 'ai:budget:';
  const row = env.DB?.prepare ? await query(env, 'SELECT value FROM system_state WHERE key=?', prefix + day).first() : null;
  return { available: configured(env, meta.provider), model: c.model, provider: meta.provider, label: meta.label, unit: meta.unit,preferences:c.preferences,
    models: Object.entries(AI_MODELS).map(([id, m]) => ({ id, label: m.label, provider: m.provider, configured: configured(env, m.provider), unit: m.unit, minBudget: m.minBudget, maxBudget: m.maxBudget, defaultBudget: m.defaultBudget })),
    used: Math.max(0, Number(row?.value) || 0), budget: c.budget, resetAt: new Date(Date.parse(day) + 86400000).toISOString(), estimated: meta.provider === 'cloudflare' };
}
export async function saveAIConfig(env, input) {
  if (!Object.hasOwn(AI_MODELS, input?.model)) throw safeError('Choisis un modèle proposé dans la liste.', 400, 'AI_CONFIG');
  const meta = AI_MODELS[input.model], budget = Number(input.budget);
  if (meta.provider === 'gemini' && !configured(env, 'gemini')) throw safeError('Ajoute d’abord le secret GEMINI_API_KEY sur Cloudflare, puis sélectionne Gemini.', 400, 'AI_CONFIG');
  if (!Number.isInteger(budget) || budget < meta.minBudget || budget > meta.maxBudget) throw safeError(`La réserve doit être comprise entre ${meta.minBudget.toLocaleString('fr-FR')} et ${meta.maxBudget.toLocaleString('fr-FR')}.`, 400, 'AI_CONFIG');
  const nextPreferences=updatePreferences(input.preferences,(await config(env)).preferences);
  await query(env, 'INSERT INTO system_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', CONFIG_KEY, JSON.stringify({ model: input.model, budget,preferences:nextPreferences })).run();
  return aiStatus(env);
}
/** Borne prudente : chaque octet d’entrée peut produire un token, plus les marqueurs de conversation. */
export function estimateNeurons(model, input) {
  const rate = Object.hasOwn(AI_MODELS, model) ? AI_MODELS[model] : null;
  if (!rate || rate.provider !== 'cloudflare') throw safeError('Ce modèle n’a pas de tarif connu en neurones.', 400, 'AI_CONFIG');
  const bytes = new TextEncoder().encode(JSON.stringify(input.messages || input.prompt || '')).length;
  return Math.max(1, Math.ceil(((bytes + 64 * ((input.messages || []).length + 1)) * rate.input + input.max_tokens * rate.output) / 1000000));
}
async function reserve(env, model, input, budget) {
  if (!env.DB?.prepare) throw safeError('La réserve gratuite de l’IA ne peut pas être vérifiée. Réessaie plus tard.', 503, 'AI_BUDGET');
  const cost = estimateNeurons(model, input), key = 'ai:budget:' + new Date().toISOString().slice(0, 10);
  if (cost > budget) throw safeError('Cette demande dépasse la réserve gratuite. Raccourcis-la ou utilise le formulaire.', 429, 'AI_QUOTA');
  const row = await query(env, `INSERT INTO system_state(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=CAST(system_state.value AS INTEGER)+?
    WHERE CAST(system_state.value AS INTEGER)+?<=? RETURNING value`, key, String(cost), cost, cost, budget).first();
  if (!row) throw safeError('La réserve gratuite de l’IA est atteinte pour aujourd’hui. Elle revient à minuit UTC ; les formulaires restent disponibles.', 429, 'AI_QUOTA');
}
// Limites propres au site ; elles ne représentent pas les quotas Google du projet.
async function reserveGemini(env, input, budget) {
  if (!env.DB?.prepare) throw safeError('La réserve gratuite de l’IA ne peut pas être vérifiée. Réessaie plus tard.', 503, 'AI_BUDGET');
  const bytes = new TextEncoder().encode(JSON.stringify(input.messages || input.prompt || '')).length;
  const cost = bytes + 64 * ((input.messages || []).length + 1) + input.max_tokens;
  if (cost > 60000) throw safeError('Cette demande est trop longue. Raccourcis-la ou utilise le formulaire.', 429, 'AI_QUOTA');
  const now = new Date(), minute = now.toISOString().slice(0, 16);
  const claim = async (key, amount, limit, message) => {
    const row = await query(env, `INSERT INTO system_state(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=CAST(system_state.value AS INTEGER)+?
      WHERE CAST(system_state.value AS INTEGER)+?<=? RETURNING value`, key, String(amount), amount, amount, limit).first();
    if (!row) throw safeError(message, 429, 'AI_QUOTA');
  };
  await claim('ai:gemini-minute:' + minute, 1, 3, 'Plusieurs demandes IA viennent d’être envoyées. Réessaie dans une minute.');
  await claim('ai:gemini-input:' + minute, cost, 60000, 'La réserve IA de cette minute est atteinte. Réessaie dans une minute.');
  await claim('ai:gemini:' + now.toISOString().slice(0, 10), 1, budget, 'La réserve IA du site est atteinte pour aujourd’hui. Elle revient à minuit UTC ; les formulaires restent disponibles.');
  // Les compteurs par minute n’ont aucune valeur historique et sont supprimés après deux jours.
  const cutoff = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 16);
  await query(env, 'DELETE FROM system_state WHERE (key LIKE ? AND key<?) OR (key LIKE ? AND key<?)', 'ai:gemini-minute:%', 'ai:gemini-minute:' + cutoff, 'ai:gemini-input:%', 'ai:gemini-input:' + cutoff).run();
}
/** Appel borné ; les réservations restent comptées même en cas de panne ou de délai dépassé. */
export async function runAI(env, options, { json = true, timeoutMs = 30000, fetchFn, expectedProvider,allowClarification = false } = {}) {
  const c = await config(env), max = Number(options.max_tokens),requestedTemperature=Number(options.temperature);
  const provider = AI_MODELS[c.model].provider;
  if (expectedProvider && expectedProvider !== provider) throw safeError('Le modèle de l’assistant a changé. Renvoie ton message pour utiliser le nouveau modèle.', 409, 'AI_CONFIG');
  if (!configured(env, provider)) throw safeError(provider === 'gemini' ? 'Gemini n’est pas activé. Ajoute le secret GEMINI_API_KEY sur Cloudflare.' : 'Assistant non activé sur ce serveur (Workers AI).', 503, 'AI_UNAVAILABLE');
  const input = { ...options, max_tokens: Number.isFinite(max) ? Math.max(100, Math.min(2400, Math.round(max))) : 900,
    temperature:Number.isFinite(requestedTemperature) ? Math.min(c.preferences.creativity,Math.max(0,requestedTemperature)) : c.preferences.creativity,messages:withResponseInstructions(options,c.preferences) };
  delete input.prompt;
  if (provider === 'gemini') {
    input.thinking_level=c.preferences.reasoning.toUpperCase();
    await reserveGemini(env, input, c.budget);
    return checkedResponse(await runGemini(env, input, { json, timeoutMs, ...(fetchFn ? { fetchFn } : {}) }),{json,allowClarification});
  }
  if (json) input.response_format = { type: 'json_object' };
  if (c.model === DEFAULT_MODEL && input.messages?.length) {
    const first=input.messages.findIndex((m)=>m.role==='system');
    input.messages = input.messages.map((m, i) => i === first ? { ...m, content: m.content + '\n/no_think' } : m);
  }
  await reserve(env, c.model, input, c.budget);
  let timer;
  try {
    return checkedResponse(await Promise.race([env.AI.run(c.model, input), new Promise((_, reject) => { timer = setTimeout(() => reject(safeError('L’assistant a pris trop de temps. Réessaie ou utilise le formulaire.', 504, 'AI_TIMEOUT')), timeoutMs); })]),{json,allowClarification});
  } catch (e) {
    if (e?.aiSafe) throw e;
    if (/quota|neurons|daily.*limit|rate.?limit|too many requests/i.test(String(e?.message || ''))) throw safeError('Le quota gratuit Cloudflare est atteint. Réessaie après son renouvellement ; les formulaires restent disponibles.', 429, 'AI_QUOTA');
    throw e;
  } finally { clearTimeout(timer); }
}
/** Formats Gemini, Workers AI, Chat Completions et Responses ; raisonnement jamais affiché. */
export function responseText(raw) {
  if (typeof raw === 'string') return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trim();
  if (!raw || typeof raw !== 'object') return '';
  if (Array.isArray(raw.candidates)) return responseText((raw.candidates[0]?.content?.parts || []).filter((p) => p?.thought !== true && typeof p?.text === 'string').map((p) => p.text).join(''));
  if (typeof raw.output_text === 'string') return responseText(raw.output_text);
  if (raw.response != null) return responseText(raw.response);
  if (raw.result != null) return responseText(raw.result);
  if (Array.isArray(raw.choices)) return responseText(raw.choices[0]?.message?.content ?? raw.choices[0]?.text);
  if (Array.isArray(raw.output)) return raw.output.filter((x) => x?.type === 'message').flatMap((x) => x.content || []).filter((x) => x?.type === 'output_text').map((x) => responseText(x.text)).join('\n');
  return '';
}
