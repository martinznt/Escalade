// Gemini REST : clé serveur uniquement, modèle Flash fixe et aucune relance automatique.
export const GEMINI_MODEL = 'gemini-3.8-flash';
const fail = (message, status, code) => Object.assign(new Error(message), { status, code, aiSafe: true });
export function buildGeminiInput(options, { json = true } = {}) {
  const contents = [], system = [];
  for (const message of options.messages || []) {
    if (typeof message?.content !== 'string' || !message.content.trim()) continue;
    if (message.role === 'system') { system.push({ text: message.content }); continue; }
    if (!['user', 'assistant'].includes(message.role)) continue;
    const role = message.role === 'assistant' ? 'model' : 'user';
    const last = contents.at(-1);
    if (last?.role === role) last.parts.push({ text: message.content });
    else contents.push({ role, parts: [{ text: message.content }] });
  }
  if (!contents.length && typeof options.prompt === 'string') contents.push({ role: 'user', parts: [{ text: options.prompt }] });
  const max = Number(options.max_tokens), temperature = Number(options.temperature);
  return { ...(system.length ? { systemInstruction: { parts: system } } : {}), contents,
    generationConfig: { maxOutputTokens: Number.isFinite(max) ? Math.max(100, Math.min(2400, Math.round(max))) : 900,
      ...(Number.isFinite(temperature) ? { temperature: Math.max(0, Math.min(2, temperature)) } : {}),
      ...(json ? { responseMimeType: 'application/json' } : {}), thinkingConfig: { thinkingLevel: inputThinking(options), includeThoughts: false } } };
}
const inputThinking = (options) => options.thinking_level === 'LOW' ? 'LOW' : 'MINIMAL';
export async function runGemini(env, input, { fetchFn = fetch, timeoutMs = 30000, json = true } = {}) {
  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) throw fail('Gemini n’est pas activé. Ajoute le secret GEMINI_API_KEY sur Cloudflare.', 503, 'AI_UNAVAILABLE');
  const body = buildGeminiInput(input, { json }), controller = new AbortController();
  let timer;
  try {
    const response = await Promise.race([
      fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body), signal: controller.signal, redirect: 'error',
      }).then(async (r) => {
        if (r.status === 429) throw fail('Le quota gratuit Google est momentanément atteint. Réessaie plus tard ; les formulaires restent disponibles.', 429, 'AI_QUOTA');
        if (r.status === 401 || r.status === 403) throw fail('Google refuse la connexion Gemini. Vérifie la clé et l’accès à l’API dans les réglages Cloudflare.', 503, 'AI_UNAVAILABLE');
        if (r.status === 404) throw fail('Ce modèle Gemini n’est pas disponible pour ce projet Google. Vérifie son accès dans Google AI Studio.', 503, 'AI_UNAVAILABLE');
        if (!r.ok) throw fail('Gemini est momentanément indisponible. Réessaie plus tard.', 503, 'AI_UNAVAILABLE');
        return r.json();
      }),
      new Promise((_, reject) => { timer = setTimeout(() => { reject(fail('L’assistant a pris trop de temps. Réessaie ou utilise le formulaire.', 504, 'AI_TIMEOUT')); controller.abort(); }, timeoutMs); }),
    ]);
    const candidate = response?.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') throw fail('La réponse de Gemini est incomplète. Raccourcis la demande ou réessaie ; aucune proposition n’a été appliquée.', 502, 'AI_RESPONSE');
    if (response?.promptFeedback?.blockReason || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(candidate?.finishReason))
      throw fail('Gemini n’a pas pu répondre à cette demande. Reformule-la ou utilise le formulaire.', 502, 'AI_RESPONSE');
    if (!candidate?.content?.parts?.some((p) => p?.thought !== true && typeof p?.text === 'string' && p.text.trim()))
      throw fail('Gemini n’a pas donné de réponse exploitable. Reformule ou réessaie.', 502, 'AI_RESPONSE');
    return response;
  } catch (e) {
    if (e?.aiSafe) throw e;
    // Les détails HTTP ou réseau peuvent contenir la clé ; ils ne sortent jamais de l’adaptateur.
    throw fail('Gemini est momentanément indisponible. Réessaie plus tard.', 503, 'AI_UNAVAILABLE');
  } finally { clearTimeout(timer); }
}
