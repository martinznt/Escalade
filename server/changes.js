// changes.js — « Quoi de neuf ? » : les dernières modifications du site, lues dans l'historique public du dépôt GitHub.
// On ne garde que ce qui parle à l'utilisateur : le titre de chaque modification et ses puces « - … ».
// Les fusions de PR, les livrables zip et les lignes techniques (Co-Authored-By, liens de session…) sont écartés.
// Aucune donnée d'utilisateur n'est envoyée à GitHub ; en cas d'erreur, la liste est simplement vide.

const SKIP_TITLE = [/^merge\b/i, /^livrable\b/i, /^revert "livrable/i, /^initial commit$/i];
const SKIP_LINE = /^(co-authored-by|claude-session|signed-off-by|https?:\/\/)/i;
const MAX_TITLE = 120, MAX_POINTS = 5;

const tidy = (s) => String(s || '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Transforme la réponse de l'API « commits » de GitHub en entrées courtes { date, title, points[] }. */
export function parseCommits(list, max = 20) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const c of list) {
    const msg = String(c?.commit?.message || '');
    const date = Date.parse(c?.commit?.committer?.date || c?.commit?.author?.date || '');
    if (!msg || !Number.isFinite(date)) continue;
    if (Array.isArray(c.parents) && c.parents.length > 1) continue; // fusion : son contenu est déjà dans ses commits
    const [first, ...rest] = msg.split('\n');
    const title = cut(tidy(first), MAX_TITLE);
    if (!title || SKIP_TITLE.some((r) => r.test(title)) || seen.has(title)) continue;
    seen.add(title);
    const points = rest.map((l) => l.trim()).filter((l) => /^[-•*]\s+/.test(l)).map((l) => cut(tidy(l.replace(/^[-•*]\s+/, '')), MAX_TITLE))
      .filter((l) => l && !SKIP_LINE.test(l)).slice(0, MAX_POINTS);
    out.push({ date, title, points });
    if (out.length >= max) break;
  }
  return out;
}

let memo = { at: 0, key: '', data: null };
/** GET /api/changes — liste mise en cache 10 minutes (mémoire du Worker), jamais d'erreur visible. */
export async function changesRoute(env, fetchFn = fetch) {
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.CHANGES_REPO || '') ? env.CHANGES_REPO : 'martinznt/Escalade';
  const branch = /^[\w./-]+$/.test(env.CHANGES_BRANCH || '') ? env.CHANGES_BRANCH : 'main';
  const key = repo + '@' + branch, now = Date.now();
  let changes = memo.key === key && now - memo.at < 600000 ? memo.data : null;
  if (!changes) {
    try {
      const r = await fetchFn(`https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=40`, {
        headers: { 'User-Agent': 'seances-entrainement', Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) throw new Error('GitHub ' + r.status);
      changes = parseCommits(await r.json());
      memo = { at: now, key, data: changes };
    } catch (e) {
      console.error('changes', e?.message || e);
      changes = memo.key === key && memo.data ? memo.data : [];
    }
  }
  return new Response(JSON.stringify({ changes }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
export const _resetChanges = () => { memo = { at: 0, key: '', data: null }; };
