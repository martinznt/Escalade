// API très simple : GET renvoie les séances sauvegardées, POST les remplace.
// Nécessite un binding KV nommé SEANCES_KV (Cloudflare Pages > Settings > Functions > KV namespace bindings).

export async function onRequestGet({ env }) {
  if (!env.SEANCES_KV) {
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  }
  const raw = await env.SEANCES_KV.get('seances');
  return new Response(raw || '[]', {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.SEANCES_KV) {
    return new Response(JSON.stringify({ ok: false, error: 'KV non configuré' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Défense en profondeur : la modification exige aussi le code d'édition,
  // même si quelqu'un appelle cette API directement.
  if (env.EDIT_CODE) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2)
    );
    if (cookies.edit_auth !== env.EDIT_CODE) {
      return new Response(JSON.stringify({ ok: false, error: 'Code de modification requis' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const body = await request.text();
  try {
    JSON.parse(body); // validation basique
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  await env.SEANCES_KV.put('seances', body);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
