// Ce fichier protège TOUT le site (pages + API) par mot de passe.
// Le mot de passe est lu depuis la variable d'environnement secrète SITE_PASSWORD
// (à créer dans Cloudflare : Pages > ton projet > Settings > Environment variables).

export async function onRequest(context) {
  const { request, env, next } = context;
  const correctPassword = env.SITE_PASSWORD;

  // Si aucun mot de passe n'est configuré, on laisse passer (utile en test local)
  if (!correctPassword) return next();

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=')).filter(p => p.length === 2)
  );

  if (cookies.site_auth === correctPassword) {
    return next();
  }

  if (request.method === 'POST') {
    const form = await request.formData();
    const pwd = form.get('password') || '';
    if (pwd === correctPassword) {
      const headers = new Headers();
      headers.append(
        'Set-Cookie',
        `site_auth=${encodeURIComponent(pwd)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
      );
      headers.append('Location', '/');
      return new Response(null, { status: 302, headers });
    }
    return new Response(loginPage('Mot de passe incorrect.'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
    });
  }

  return new Response(loginPage(), {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

function loginPage(error) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion</title>
<style>
  body{font-family:-apple-system,Arial,sans-serif;background:#0b0906;color:#f3ece4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
  form{background:#171310;padding:28px;border-radius:14px;border:1px solid #3d332a;width:100%;max-width:300px}
  h1{font-size:19px;margin:0 0 16px;font-weight:900}
  input{width:100%;padding:11px;border-radius:9px;border:1px solid #3d332a;background:#221c17;color:#f3ece4;margin-bottom:10px;box-sizing:border-box;font-size:14px}
  button{width:100%;padding:12px;border:0;border-radius:9px;background:#c99a3d;color:#1c1305;font-weight:900;cursor:pointer;font-size:14px}
  .err{color:#d9636f;font-size:13px;margin-bottom:10px}
</style></head><body>
  <form method="POST">
    <h1>🔒 Accès protégé</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input type="password" name="password" placeholder="Mot de passe" autofocus required>
    <button type="submit">Entrer</button>
  </form>
</body></html>`;
}
