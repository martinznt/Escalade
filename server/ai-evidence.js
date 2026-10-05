// Preuves du coach : les articles ne sont retenus qu'après lecture de leur résumé PubMed.
// Le catalogue choisit des identifiants autorisés ; aucun lien fourni par un utilisateur n'est suivi.
import { SOURCES } from '../public/sources.js';
import { COACH_ROUTES } from '../public/commands.js';

const MAX_BYTES = 300_000, MAX_EXCERPT = 3000;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (value) => normalize(value).split(' ').filter((word) => word.length >= 4 && !['avec', 'dans', 'pour', 'entre', 'comment', 'quelle', 'quels', 'quelles', 'cette', 'plus', 'sans', 'apres', 'avant', 'faire', 'peux', 'faut', 'mais', 'etre'].includes(word));
const TOPICS = [
  { pattern: /\b(echauff|warm|blessur|injur|douleur|preven|poulie)/, ids: ['schoffl2006', 'lauersen2014'] },
  { pattern: /\b(repos|pause|recuper|rest)/, ids: ['schoenfeld2016', 'bosquet2007'] },
  { pattern: /\b(force|muscu|strength|hypertroph|muscle|serie|volume)/, ids: ['schoenfeld2016', 'schoenfeld2017'] },
  { pattern: /\b(doigt|poutre|reglette|finger|grip|suspension)/, ids: ['medernach2015', 'schoffl2006'] },
  { pattern: /\b(fatig|charge|surentrain|progression|reprise)/, ids: ['gabbett2016', 'bosquet2007'] },
  { pattern: /\b(affutage|competition|taper)/, ids: ['bosquet2007', 'issurin2010'] },
  { pattern: /\b(planifi|periodis|bloc entrainement)/, ids: ['issurin2010'] },
  { pattern: /\b(protein|nutrition|alimenta)/, ids: ['morton2018'] },
  { pattern: /\b(abdo|graisse|ventre|gras)/, ids: ['vispute2011'] },
  { pattern: /\b(activite physique|sedentar|sante|minutes par semaine|oms)/, ids: ['who2020'] },
];
const CATALOG = Object.entries(SOURCES).flatMap(([id, source]) => {
  try {
    const url = new URL(source.url), match = /^\/(\d+)\/?$/.exec(url.pathname);
    return url.protocol === 'https:' && url.hostname === 'pubmed.ncbi.nlm.nih.gov' && !url.search && !url.hash && match
      ? [{ id, source, pmid: match[1] }] : [];
  } catch { return []; }
});

function candidates(question) {
  const text = normalize(String(question || '').slice(0, 5000)), tokens = [...new Set(words(text))];
  return CATALOG.map((entry, index) => {
    const searchable = normalize(entry.source.title + ' ' + entry.source.key);
    let score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
    for (const topic of TOPICS) if (topic.pattern.test(text)) {
      const rank = topic.ids.indexOf(entry.id);
      if (rank >= 0) score += 10 - rank;
    }
    return { ...entry, score, index };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2);
}

function plainXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (match, hex, decimal) => {
      const code = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity])
    .replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
function titleMatches(expected, actual) {
  const a = normalize(expected), b = normalize(actual);
  if (a === b) return true;
  const left = new Set(a.split(' ')), right = new Set(b.split(' '));
  const common = [...left].filter((word) => right.has(word)).length;
  // Minor punctuation, markup and bibliographic subtitles may differ, never a different paper.
  return left.size >= 6 && right.size >= 6 && common / Math.max(left.size, right.size) >= 0.9;
}
function articleExcerpt(xml, entry) {
  for (const match of xml.matchAll(/<PubmedArticle\b[^>]*>([\s\S]*?)<\/PubmedArticle>/gi)) {
    const citation = /<MedlineCitation\b[^>]*>([\s\S]*?)<\/MedlineCitation>/i.exec(match[1])?.[1];
    if (!citation || plainXml(/<PMID\b[^>]*>([\s\S]*?)<\/PMID>/i.exec(citation)?.[1]) !== entry.pmid) continue;
    const title = plainXml(/<ArticleTitle\b[^>]*>([\s\S]*?)<\/ArticleTitle>/i.exec(citation)?.[1]);
    if (!title || !titleMatches(entry.source.title, title)) return null;
    const abstract = /<Abstract\b[^>]*>([\s\S]*?)<\/Abstract>/i.exec(citation)?.[1];
    if (!abstract) return null;
    const parts = [...abstract.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi)].map((part) => {
      const label = plainXml(/\bLabel=["']([^"']*)["']/i.exec(part[1])?.[1]);
      const text = plainXml(part[2]);
      return text ? (label ? label + ': ' : '') + text : '';
    }).filter(Boolean);
    const excerpt = parts.join('\n').slice(0, MAX_EXCERPT);
    return excerpt.length >= 40 ? { title, excerpt } : null;
  }
  return null;
}

async function boundedText(response) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Response too large');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Response too large');
    return text;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) { void reader.cancel().catch(() => {}); throw new Error('Response too large'); }
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function readSource(entry, { fetcher, timeoutMs, now }) {
  const controller = new AbortController();
  let timer;
  try {
    const operation = (async () => {
      const url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=' + entry.pmid + '&retmode=xml';
      const response = await fetcher(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/xml' } });
      if (!response?.ok) return null;
      const article = articleExcerpt(await boundedText(response), entry);
      if (!article) return null;
      return { id: entry.id, label: article.title, url: entry.source.url, kind: 'research', excerpt: article.excerpt, checkedAt: new Date(now()).toISOString() };
    })();
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Source timeout')); }, timeoutMs); });
    return await Promise.race([operation, deadline]);
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); }
}

/** Chaque appel consulte à nouveau PubMed. Le résumé du catalogue n'est jamais présenté comme un document lu. */
export async function researchSources(question, { fetcher = globalThis.fetch, timeoutMs = 4000, now = () => new Date() } = {}) {
  const duration = Number(timeoutMs);
  const options = { fetcher, timeoutMs: Number.isFinite(duration) ? Math.min(4000, Math.max(1, duration)) : 4000, now };
  const sources = (await Promise.all(candidates(question).map((entry) => readSource(entry, options)))).filter(Boolean);
  return { sources, unavailable: sources.length === 0 };
}

/** Sources locales à distinguer des articles effectivement consultés. */
export function localChatSources({ profile = '', appMap = '' } = {}) {
  const map = String(appMap || Object.entries(COACH_ROUTES).map(([route, label]) => label + ' : ' + route).join('\n')).slice(0, 12000);
  const sources = [{ id: 'app/map', label: 'Navigation et fonctionnalités de Mes séances', kind: 'app', excerpt: map }];
  const summary = String(profile || '').trim().slice(0, 6000);
  if (summary) sources.push({ id: 'profile', label: 'Résumé de ton profil partagé', kind: 'profile', excerpt: summary });
  return sources;
}
