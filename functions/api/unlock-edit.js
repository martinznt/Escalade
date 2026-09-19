// Vérifie le code de modification (secret EDIT_CODE) et pose un cookie si correct.

export async function onRequestPost({ request, env }) {
  const editCode = env.EDIT_CODE;
  if (!editCode) {
    return new Response(JSON.stringify({ ok: false, error: 'EDIT_CODE non configuré' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let code = '';
  try {
    const body = await request.json();
    code = body.code || '';
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (code === editCode) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append(
      'Set-Cookie',
      `edit_auth=${encodeURIComponent(code)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    );
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  return new Response(JSON.stringify({ ok: false }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
