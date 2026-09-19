// Indique si le navigateur possède déjà le cookie de déverrouillage valide.

export async function onRequestGet({ request, env }) {
  const editCode = env.EDIT_CODE;
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2)
  );
  const unlocked = !editCode || cookies.edit_auth === editCode;
  return new Response(JSON.stringify({ unlocked }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
