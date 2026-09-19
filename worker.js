export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- 1. Protection par mot de passe (tout le site) ----
    const gate = await checkSitePassword(request, env);
    if (gate) return gate;

    // ---- 2. Routes API ----
    if (path === '/api/data') {
      if (request.method === 'GET') return apiDataGet(env);
      if (request.method === 'POST') return apiDataPost(request, env);
    }
    if (path === '/api/unlock-edit' && request.method === 'POST') {
      return apiUnlockEdit(request, env);
    }
    if (path === '/api/edit-status' && request.method === 'GET') {
      return apiEditStatus(request, env);
    }
    if (path === '/api/lock-edit' && request.method === 'POST') {
      return apiLockEdit();
    }

    // ---- 3. Sinon, fichiers statiques (index.html, manifest, sw.js, icônes) ----
    return env.ASSETS.fetch(request);
  },
};

/* ============ Outils ============ */
function getCookies(request) {
  const header = request.headers.get('Cookie') || '';
  return Object.fromEntries(
    header.split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2)
  );
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ============ Mot de passe du site ============ */
async function checkSitePassword(request, env) {
  const correct = env.SITE_PASSWORD;
  if (!correct) return null; // pas de mot de passe configuré : accès libre

  const cookies = getCookies(request);
  if (cookies.site_auth === correct) return null; // déjà connecté

  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/__login') {
    const form = await request.formData();
    const pwd = form.get('password') || '';
    if (pwd === correct) {
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
  <form method="POST" action="/__login">
    <h1>🔒 Accès protégé</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input type="password" name="password" placeholder="Mot de passe" autofocus required>
    <button type="submit">Entrer</button>
  </form>
</body></html>`;
}

/* ============ API séances (KV) ============ */
async function apiDataGet(env) {
  if (!env.SEANCES_KV) {
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  }
  const raw = await env.SEANCES_KV.get('seances');
  return new Response(raw || '[]', {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
async function apiDataPost(request, env) {
  if (!env.SEANCES_KV) return json({ ok: false, error: 'KV non configuré' }, 500);

  if (env.EDIT_CODE) {
    const cookies = getCookies(request);
    if (cookies.edit_auth !== env.EDIT_CODE) {
      return json({ ok: false, error: 'Code de modification requis' }, 403);
    }
  }

  const body = await request.text();
  try {
    JSON.parse(body);
  } catch (e) {
    return json({ ok: false, error: 'JSON invalide' }, 400);
  }
  await env.SEANCES_KV.put('seances', body);
  return json({ ok: true });
}

/* ============ Code de modification ============ */
async function apiUnlockEdit(request, env) {
  const editCode = env.EDIT_CODE;
  if (!editCode) return json({ ok: false, error: 'EDIT_CODE non configuré' }, 500);

  let code = '';
  try {
    const body = await request.json();
    code = body.code || '';
  } catch (e) {
    return json({ ok: false }, 400);
  }

  if (code === editCode) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append(
      'Set-Cookie',
      `edit_auth=${encodeURIComponent(code)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    );
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  return json({ ok: false }, 401);
}
async function apiEditStatus(request, env) {
  const editCode = env.EDIT_CODE;
  const cookies = getCookies(request);
  const unlocked = !editCode || cookies.edit_auth === editCode;
  return json({ unlocked });
}
function apiLockEdit() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', 'edit_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  return new Response(JSON.stringify({ ok: true }), { headers });
}
