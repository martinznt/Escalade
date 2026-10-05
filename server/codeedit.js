// codeedit.js — petites modifications du CODE de l'interface, proposées par l'assistant du site (administrateurs).
// L'IA ne fait que proposer des remplacements « ce texte EXACT du code → ce nouveau texte » dans les fichiers de
// l'interface ; le serveur vérifie TOUT (fichier autorisé, texte trouvé une seule fois, taille, rien de dangereux),
// en fait un diff lisible, et la proposition suit le circuit habituel des propositions de code : relue, validée, puis
// envoyée en Pull Request sur GitHub, où les tests du dépôt tournent. JAMAIS fusionnée ni déployée par l'app : c'est
// toi qui fusionnes sur GitHub. Règles pures et testées ; les appels réseau passent par une fonction fetch fournie.
import { extractJson } from './ai.js';
import { responseText } from './ai-runtime.js';

/** Fichiers modifiables : l'interface (JS, CSS, HTML de public/), sauf le service worker. Jamais le serveur ni la base. */
export const CODE_FILES = /^public\/(?!sw\.js$)[\w-]+\.(js|css|html)$/;
export const LIMITS = { edits: 4, find: 2000, replace: 3000, lines: 80 };
/** Ce qu'une modification proposée ne peut jamais AJOUTER. */
const FORBIDDEN = [
  [/\beval\s*\(/, 'eval()'], [/new\s+Function\s*\(/, 'new Function()'], [/<script\b/i, 'une balise <script>'], [/javascript:/i, 'un lien javascript:'],
  [/document\.write\s*\(/, 'document.write()'], [/\.(?:inner|outer)HTML\s*=/, 'une injection innerHTML'], [/\bimport\s*\(\s*['"`]https?:/, 'un import distant'],
  [/EDIT_PASSWORD|VAPID_PRIVATE|GITHUB_TOKEN|password_hash/, 'un secret'], [/\bfetch\s*\(\s*['"`]https?:\/\//, 'un appel réseau externe'],
  [/\b(localStorage|indexedDB)\s*\.\s*clear\s*\(/, 'un effacement des données'],
];
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n);
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['dans', 'avec', 'pour', 'mais', 'plus', 'tout', 'tous', 'cette', 'faire', 'mettre', 'changer', 'modifier', 'bouton', 'texte', 'page', 'quand', 'comme', 'veux', 'voudrais', 'aussi', 'leur', 'sont', 'etre', 'avoir', 'peux', 'doit']);
const count = (hay, needle) => { let n = 0, i = 0; while (needle && (i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; };

/**
 * Extraits de code liés à la demande : textes cités entre guillemets d'abord, puis mots de la demande.
 * files : Map(chemin → contenu). Retourne [{ path, start, end, text }] (numéros de ligne à partir de 1).
 */
export function searchCode(files, message, max = 4) {
  const msg = String(message || ''), quoted = [...msg.matchAll(/[«"“]\s*([^»"”]{3,80}?)\s*[»"”]/g)].map((m) => m[1]);
  const ws = [...new Set(norm(msg).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
  const hits = [];
  for (const [path, text] of files) {
    if (!CODE_FILES.test(path)) continue;
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      const nl = norm(l); let s = 0;
      for (const q of quoted) if (l.includes(q) || nl.includes(norm(q))) s += 10;
      for (const w of ws) if (nl.includes(w)) s += 1;
      if (s >= 2 || (s && ws.length <= 1)) hits.push({ path, i, s });
    });
  }
  hits.sort((a, b) => b.s - a.s);
  const out = [];
  for (const h of hits) {
    if (out.length >= max) break;
    if (out.some((o) => o.path === h.path && h.i + 1 >= o.start - 2 && h.i + 1 <= o.end + 2)) continue;
    const lines = files.get(h.path).split('\n'), a = Math.max(0, h.i - 5), b = Math.min(lines.length - 1, h.i + 5);
    out.push({ path: h.path, start: a + 1, end: b + 1, text: lines.slice(a, b + 1).map((l) => l.slice(0, 400)).join('\n').slice(0, 2500) });
  }
  return out;
}

/** Messages pour le modèle : la demande, les extraits trouvés, et le format strict de la réponse. */
export function buildCodeEdit(messages, snippets = []) {
  const ex = snippets.length ? snippets.map((s) => `### ${s.path} (lignes ${s.start}-${s.end})\n${s.text}`).join('\n\n') : '(aucun extrait trouvé : dis-le et demande le texte exact affiché à l’écran)';
  const sys = `Tu aides l’administrateur de « Séances entraînement » à faire une PETITE modification du code de l’interface.
Tu proposes des remplacements exacts : "find" = un morceau COPIÉ À L’IDENTIQUE dans un extrait ci-dessous (espaces compris), assez long pour n’exister qu’une fois ; "replace" = le nouveau morceau.
Règles :
- Seulement les fichiers des extraits ci-dessous (dossier public/). Garde le style du code autour. Pas plus de ${LIMITS.edits} remplacements.
- Jamais : eval, new Function, balise <script>, lien javascript:, innerHTML, appel réseau, secret, effacement de données.
- Si c’est trop grand pour un petit remplacement (nouvel écran, serveur, base de données, calcul complexe), dis-le dans "reply" et ne propose aucun remplacement.
- Explique en une phrase simple ce que ça change pour l’utilisateur.
Extraits du code :
${ex}
Réponds UNIQUEMENT en JSON : {"reply":"…","title":"titre court","summary":"ce que ça change","edits":[{"path":"public/…","find":"…","replace":"…"}]}`;
  const turns = (Array.isArray(messages) ? messages : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-8).map((m) => ({ role: m.role, content: str(m.content, 1500) })).filter((m) => m.content);
  return [{ role: 'system', content: sys }, ...turns];
}

/** Diff unifié lisible d'un fichier (une zone modifiée, 3 lignes de contexte). */
export function makeDiff(path, before, after) {
  const A = before.split('\n'), B = after.split('\n');
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length - 1, eb = B.length - 1; while (ea >= s && eb >= s && A[ea] === B[eb]) { ea--; eb--; }
  const c0 = Math.max(0, s - 3), ca = Math.min(A.length - 1, ea + 3), cb = Math.min(B.length - 1, eb + 3);
  const out = [`--- a/${path}`, `+++ b/${path}`, `@@ -${c0 + 1},${ca - c0 + 1} +${c0 + 1},${cb - c0 + 1} @@`];
  for (let i = c0; i < s; i++) out.push(' ' + A[i]);
  for (let i = s; i <= ea; i++) out.push('-' + A[i]);
  for (let i = s; i <= eb; i++) out.push('+' + B[i]);
  for (let i = ea + 1; i <= ca; i++) out.push(' ' + A[i]);
  return out.join('\n');
}
/** Applique des remplacements à un contenu ; chaque « find » doit s'y trouver exactement une fois. */
export function applyEdits(content, edits) {
  let t = content;
  for (const e of edits) {
    const n = count(t, e.find);
    if (n !== 1) throw new Error(n ? `« ${e.find.slice(0, 50)}… » apparaît ${n} fois dans ${e.path} : trop ambigu.` : `« ${e.find.slice(0, 50)}… » introuvable dans ${e.path} (le code a changé depuis ?).`);
    t = t.replace(e.find, () => e.replace);
  }
  return t;
}
/**
 * Sortie du modèle → proposition sûre. files : Map(chemin → contenu actuel).
 * Retourne { reply, title, summary, edits, diff, errors } ; edits vide si rien n'est acceptable.
 */
export function cleanEdits(raw, files) {
  const x = extractJson(raw);
  if (!x || typeof x !== 'object') return { reply: str(responseText(raw), 1200) || 'Je n’ai pas su proposer de modification.', title: '', summary: '', edits: [], diff: '', errors: [] };
  const errors = [], edits = [], after = new Map();
  for (const e of (Array.isArray(x.edits) ? x.edits : []).slice(0, LIMITS.edits)) {
    const path = String(e?.path || '').replace(/^\/+/, ''), find = String(e?.find ?? ''), replace = String(e?.replace ?? '');
    if (!CODE_FILES.test(path)) { errors.push(`« ${str(path, 60) || '?'} » : seuls les fichiers de l’interface (public/) peuvent être modifiés, jamais le serveur ni le service worker.`); continue; }
    if (!files.has(path)) { errors.push(`${path} : fichier inconnu.`); continue; }
    if (!find.trim() || find.length > LIMITS.find || replace.length > LIMITS.replace) { errors.push(`${path} : remplacement vide ou trop long.`); continue; }
    if (find === replace) { errors.push(`${path} : le remplacement ne change rien.`); continue; }
    const bad = FORBIDDEN.filter(([re]) => re.test(replace) && !re.test(find)).map(([, l]) => l);
    if (bad.length) { errors.push(`${path} : refusé, la modification ajouterait ${bad.join(', ')}.`); continue; }
    const cur = after.get(path) ?? files.get(path), n = count(cur, find);
    if (n !== 1) { errors.push(n ? `${path} : le texte à remplacer apparaît ${n} fois, il faut un extrait plus précis.` : `${path} : le texte à remplacer est introuvable (il doit être copié exactement).`); continue; }
    after.set(path, cur.replace(find, () => replace)); edits.push({ path, find, replace });
  }
  const diff = [...after].map(([p, t]) => makeDiff(p, files.get(p), t)).join('\n');
  const changed = (diff.match(/^[+-](?![+-]{2} )/gm) || []).length;
  if (changed > LIMITS.lines) return { reply: str(x.reply, 1200), title: '', summary: '', edits: [], diff: '', errors: [...errors, `Trop de lignes changées (${changed}) : l’assistant ne fait que de petites modifications (${LIMITS.lines} lignes au plus).`] };
  return { reply: str(x.reply, 1200) || (edits.length ? 'Voici la modification proposée.' : 'Je n’ai pas de modification sûre à proposer.'), title: str(x.title, 120) || (edits.length ? 'Petite modification proposée par l’assistant' : ''), summary: str(x.summary, 1200), edits, diff, errors };
}

/* ───────── Pull Request GitHub (jamais fusionnée par l'app) ───────── */
const b64enc = (s) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), (c) => c.charCodeAt(0)));
export const REPO_OK = /^[\w.-]{1,100}\/[\w.-]{1,100}$/;
/**
 * Crée une branche, applique les remplacements sur la version GitHub de chaque fichier, puis ouvre une Pull Request.
 * o = { repo: 'proprietaire/depot', token, id, title, body, edits }. Retourne { url, number, branch }.
 */
export async function openPullRequest(o, fetchFn = fetch) {
  if (!REPO_OK.test(String(o.repo || ''))) throw new Error('GITHUB_REPO doit être de la forme « propriétaire/dépôt ».');
  const api = async (path, init = {}) => {
    const r = await fetchFn(`https://api.github.com/repos/${o.repo}${path}`, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${o.token}`, 'User-Agent': 'seances-entrainement', 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'GitHub refuse l’accès : vérifie le jeton GITHUB_TOKEN (droits « contents » et « pull requests » sur ce dépôt).' : r.status === 404 ? 'Dépôt ou fichier introuvable sur GitHub (vérifie GITHUB_REPO).' : `GitHub : ${String(d.message || r.status).slice(0, 160)}`);
    return d;
  };
  const repo = await api(''), base = repo.default_branch || 'main';
  const ref = await api(`/git/ref/heads/${encodeURIComponent(base)}`), branch = `assistant/${String(o.id).replace(/[^\w-]/g, '').slice(0, 40)}`;
  await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) });
  const byFile = new Map(); for (const e of o.edits) byFile.set(e.path, [...(byFile.get(e.path) || []), e]);
  for (const [path, list] of byFile) {
    const f = await api(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
    const next = applyEdits(b64dec(f.content || ''), list);
    await api(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: JSON.stringify({ message: `${o.title} (${path})`, content: b64enc(next), sha: f.sha, branch }) });
  }
  const pr = await api('/pulls', { method: 'POST', body: JSON.stringify({ title: o.title, head: branch, base, body: `${o.body || ''}\n\nValidation automatisée en attente : cette Pull Request est un brouillon. Vérifier la CI, le parcours navigateur et le diff avant de la rendre prête. Aucun déploiement automatique par l’application.`, draft: true, maintainer_can_modify: true }) });
  return { url: pr.html_url, number: pr.number, branch };
}
