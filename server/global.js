// global.js — contenu de l'app modifié par un administrateur pour tous les comptes : exercices, séances prêtes,
// intentions par sport, formats de séance. Règles pures (validation) ; les routes sont dans worker.js.
// Rien n'est pris tel quel : chaque champ est vérifié, borné, et les champs inconnus sont ignorés.
import { normalizeEx } from '../public/shared.js';
import { cleanParts } from '../public/format.js';

export const KINDS = ['exercise', 'catalog', 'intent', 'format', 'grading', 'style', 'text', 'announce', 'layout', 'faq', 'source'];
export const ID_OK = /^[\w-]{1,64}$/;
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const strs = (a, n, len) => (Array.isArray(a) ? a.map((x) => str(x, len)).filter(Boolean).slice(0, n) : []);
const ids = (a, n) => (Array.isArray(a) ? [...new Set(a.map((x) => String(x ?? '')).filter((x) => /^[\w:.-]{1,60}$/.test(x)))].slice(0, n) : []);
const int = (v, min, max, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
function caps(o) { const out = {}; if (!o || typeof o !== 'object') return out; for (const [k, v] of Object.entries(o).slice(0, 10)) { const w = Number(v); if (/^[\w:.-]{1,60}$/.test(k) && w > 0) out[k] = Math.min(1, Math.round(w * 100) / 100); } return out; }

/** Données d'un élément global, nettoyées selon leur type. Retourne null si c'est inutilisable. */
export function cleanGlobal(kind, d) {
  if (!d || typeof d !== 'object') return null;
  if (kind === 'exercise') {
    const e = normalizeEx({ ...d, name: d.name || 'Exercice' });
    const name = str(d.name, 80); if (!name) return null;
    return { name, emoji: str(d.emoji, 8) || '💪', mode: e.mode, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, secMin: e.secMin, secMax: e.secMax, rest: e.rest, perSide: e.perSide, unit: e.unit,
      cues: strs(d.cues, 8, 200), bad: strs(d.bad, 6, 200), why: str(d.why, 240), what: str(d.what, 240), group: str(d.group, 20), acts: ids(d.acts, 8), needs: ids(d.needs, 8), caps: caps(d.caps), intensity: ['low', 'mod', 'high'].includes(d.intensity) ? d.intensity : '' };
  }
  if (kind === 'catalog') {
    const name = str(d.name, 80); if (!name) return null;
    const ex = (Array.isArray(d.ex) ? d.ex : []).slice(0, 24).map((x) => ({ libId: str(x?.libId, 60), sets: int(x?.sets, 1, 20, 3), amount: int(x?.amount, 1, 7200, 10), rest: int(x?.rest, 0, 3600, 60), block: ['warmup', 'main', 'cool'].includes(x?.block) ? x.block : '' })).filter((x) => /^[\w-]{1,60}$/.test(x.libId));
    if (!ex.length) return null;
    return { name, emoji: str(d.emoji, 8) || '🗂', activity: str(d.activity, 40), level: int(d.level, 0, 2, 0), minutes: int(d.minutes, 5, 240, 30), goals: ids(d.goals, 8), works: ids(d.works, 8),
      why: str(d.why, 400), tips: strs(d.tips, 5, 200), sources: ids(d.sources, 6), ex };
  }
  if (kind === 'intent') {
    const label = str(d.label, 60); if (!label) return null;
    return { label, emoji: str(d.emoji, 8) || '🧭', activityId: str(d.activityId, 40), caps: caps(d.caps) };
  }
  if (kind === 'grading') {
    const name = str(d.name, 60); if (!name) return null;
    const levels = (Array.isArray(d.levels) ? d.levels : []).slice(0, 60).map((l, i) => ({ id: /^[\w-]{1,40}$/.test(String(l?.id || '')) ? String(l.id) : 'l' + i, label: str(l?.label, 30), color: /^#[0-9a-f]{6}$/i.test(String(l?.color || '')) ? l.color : '', order: int(l?.order ?? i, 0, 999, i) })).filter((l) => l.label);
    if (!levels.length) return null;
    const lvIds = new Set(levels.map((l) => l.id));
    const maps = (Array.isArray(d.maps) ? d.maps : []).slice(0, 150).map((m) => ({ levelId: String(m?.levelId || ''), ref: str(m?.ref, 40), refLevel: str(m?.refLevel, 40) })).filter((m) => lvIds.has(m.levelId) && /^[\w-]{1,40}$/.test(m.ref) && m.refLevel);
    return { name, activity: ['bloc', 'voie', 'autre'].includes(d.activity) ? d.activity : 'bloc', kind: ['ordered', 'colors', 'numeric'].includes(d.kind) ? d.kind : 'ordered', levels, maps };
  }
  if (kind === 'style') {
    const label = str(d.label, 40); if (!label) return null;
    return { label, activity: str(d.activity, 40) };
  }
  if (kind === 'text') { // un texte de l'app réécrit par un administrateur (même texte d'origine → même remplacement)
    const from = str(d.from, 300), to = str(d.to, 300); return from && to ? { from, to } : null;
  }
  if (kind === 'announce') { // annonce ou note de mise à jour écrite dans l'app
    const title = str(d.title, 100), body = str(d.body, 1200); if (!title) return null;
    return { title, body, update: !!d.update, emoji: str(d.emoji, 8) || (d.update ? '🆕' : '📣') };
  }
  if (kind === 'layout') { // mise en page de base pour tous, et fonctions masquées pour tous (validées côté app par layout.js)
    const pages = {}; for (const [k, v] of Object.entries(d.pages || {}).slice(0, 8)) if (/^\w{1,20}$/.test(k) && Array.isArray(v)) pages[k] = v.slice(0, 40).map((e) => ({ id: str(e?.id, 30), as: ['big', 'icon', 'off'].includes(e?.as) ? e.as : 'off', color: /^#[0-9a-f]{6}$/i.test(String(e?.color || '')) ? e.color : '' })).filter((e) => /^\w{1,30}$/.test(e.id));
    const off = {}; for (const [k, v] of Object.entries(d.off || {}).slice(0, 8)) if (/^\w{1,20}$/.test(k) && Array.isArray(v)) off[k] = v.slice(0, 40).map((x) => str(x, 30)).filter((x) => /^\w{1,30}$/.test(x));
    return { pages, off };
  }
  if (kind === 'faq') { const q = str(d.q, 200), a = str(d.a, 1500); return q && a ? { q, a, order: int(d.order, 0, 999, 100) } : null; }
  if (kind === 'source') {
    const title = str(d.title, 300), url = str(d.url, 400); if (!title || !/^https:\/\/[^\s]+$/.test(url)) return null;
    return { title, authors: str(d.authors, 200), year: int(d.year, 1900, 2100, 2020), journal: str(d.journal, 200), url, key: str(d.key, 600) };
  }
  if (kind === 'format') {
    const name = str(d.name, 40), parts = cleanParts(d.parts); if (!name || !parts.length) return null;
    return { name, parts };
  }
  return null;
}
