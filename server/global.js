// global.js — contenu de l'app modifié par un administrateur pour tous les comptes : exercices, séances prêtes,
// intentions par sport, formats de séance. Règles pures (validation) ; les routes sont dans worker.js.
// Rien n'est pris tel quel : chaque champ est vérifié, borné, et les champs inconnus sont ignorés.
import { normalizeEx } from '../public/shared.js';
import { cleanParts } from '../public/format.js';

export const KINDS = ['exercise', 'catalog', 'intent', 'format'];
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
      cues: strs(d.cues, 8, 200), bad: strs(d.bad, 6, 200), why: str(d.why, 240), group: str(d.group, 20), acts: ids(d.acts, 8), needs: ids(d.needs, 8), caps: caps(d.caps), intensity: ['low', 'mod', 'high'].includes(d.intensity) ? d.intensity : '' };
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
  if (kind === 'format') {
    const name = str(d.name, 40), parts = cleanParts(d.parts); if (!name || !parts.length) return null;
    return { name, parts };
  }
  return null;
}
