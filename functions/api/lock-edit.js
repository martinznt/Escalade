// Supprime le cookie de déverrouillage (reverrouille l'édition sur cet appareil).

export async function onRequestPost() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', 'edit_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  return new Response(JSON.stringify({ ok: true }), { headers });
}
