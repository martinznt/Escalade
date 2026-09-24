// shared.js — code commun au serveur (worker.js) et au navigateur (app.js).
// Aucune dépendance au DOM : testable avec Node.

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const clamp = (v, min, max, def) => {
  if (v === null || v === undefined || v === '') return def;
  v = Number(v);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
};

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const strList = (a, n, max) => (Array.isArray(a) ? a.slice(0, n).map((x) => str(x, max)).filter(Boolean) : []);

/** Convertit un exercice (ancien ou nouveau format) vers le format courant. */
export function normalizeEx(x = {}) {
  x = x && typeof x === 'object' ? x : {};
  const mode = x.mode === 'time' || x.type === 'time' ? 'time' : 'reps';
  const legacy = clamp(x.amount, 1, 9999, null);
  let repsMin = clamp(x.repsMin ?? (mode === 'reps' ? legacy : null), 1, 999, 10);
  let repsMax = clamp(x.repsMax ?? x.repsMin ?? (mode === 'reps' ? legacy : null), 1, 999, repsMin);
  let secMin = clamp(x.secMin ?? (mode === 'time' ? legacy : null), 1, 7200, 30);
  let secMax = clamp(x.secMax ?? x.secMin ?? (mode === 'time' ? legacy : null), 1, 7200, secMin);
  if (repsMax < repsMin) [repsMin, repsMax] = [repsMax, repsMin];
  if (secMax < secMin) [secMin, secMax] = [secMax, secMin];

  // Anciennes fiches : les lignes « 🎯 … » décrivaient les muscles travaillés.
  let ok = strList(x.ok, 30, 300);
  let muscles = strList(x.muscles, 12, 40);
  const target = ok.filter((l) => l.startsWith('🎯'));
  if (target.length) {
    ok = ok.filter((l) => !l.startsWith('🎯'));
    if (!muscles.length) muscles = target.map((l) => l.replace(/^🎯\s*/, '')).join(', ').split(/,|\+| et /).map((m) => m.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  }
  return {
    id: str(x.id, 64) || uid(),
    name: str(x.name, 80) || 'Exercice',
    emoji: str(x.emoji, 8) || '💪',
    mode,
    sets: clamp(x.sets, 1, 30, 3),
    repsMin, repsMax, secMin, secMax,
    perSide: !!x.perSide,
    unit: str(x.unit, 12),
    load: str(x.load, 60),
    rest: clamp(x.rest, 0, 3600, 60),
    muscles,
    ok,
    bad: strList(x.bad, 30, 300),
    note: str(x.note, 400),
    group: str(x.group, 20),
    intensity: ['low', 'mod', 'high'].includes(x.intensity) ? x.intensity : '',
    risk: ['finger', 'shoulder', 'elbow', 'knee'].includes(x.risk) ? x.risk : '',
    block: ['warmup', 'main', 'cool'].includes(x.block) ? x.block : 'main',
    libId: str(x.libId, 40),
    isNew: !!x.isNew,
  };
}

export function normalizeSession(s = {}) {
  s = s && typeof s === 'object' ? s : {};
  const notes = Array.isArray(s.notes)
    ? s.notes.slice(0, 6).map((n) => ({ title: str(n?.title, 80), text: str(n?.text, 1200) })).filter((n) => n.text)
    : [];
  return {
    id: str(s.id, 64) || uid(),
    name: str(s.name, 100) || 'Séance',
    emoji: str(s.emoji, 8) || '🧗',
    goal: str(s.goal, 30),
    durationMin: clamp(s.durationMin, 0, 600, 0),
    objectives: strList(s.objectives, 8, 120),
    notes,
    source: ['manual', 'text', 'generated', 'import'].includes(s.source) ? s.source : 'manual',
    exercises: Array.isArray(s.exercises) ? s.exercises.slice(0, 60).map(normalizeEx) : [],
    createdAt: clamp(s.createdAt, 0, 9e15, 0),
    updatedAt: clamp(s.updatedAt, 0, 9e15, 0),
  };
}

/**
 * Fusionne deux ensembles de séances {items, tomb} élément par élément.
 * - la version la plus récente (updatedAt) gagne, à égalité on garde `a` ;
 * - une suppression (tomb[id] = date) l'emporte sur toute version plus ancienne ou égale.
 * Même fonction côté serveur et côté client → pas de perte de données entre appareils.
 */
export function mergeSeances(a, b) {
  const tomb = { ...(a?.tomb || {}) };
  for (const [k, v] of Object.entries(b?.tomb || {})) tomb[k] = Math.max(tomb[k] || 0, Number(v) || 0);
  const best = new Map();
  for (const s of [...(a?.items || []), ...(b?.items || [])]) {
    if (!s || !s.id) continue;
    const cur = best.get(s.id);
    if (!cur || (s.updatedAt || 0) > (cur.updatedAt || 0)) best.set(s.id, s);
  }
  const items = [];
  for (const s of best.values()) {
    const t = tomb[s.id];
    if (t && t >= (s.updatedAt || 0)) continue;
    items.push(s);
  }
  const limit = Date.now() - 90 * 86400000;
  for (const k of Object.keys(tomb)) if (tomb[k] < limit) delete tomb[k];
  return { items, tomb };
}

/** Lit l'ancien format (tableau simple) ou le nouveau ({items,tomb}). */
export function readStored(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(v)) return { items: v.map(normalizeSession), tomb: {} };
    if (v && Array.isArray(v.items)) return { items: v.items.map(normalizeSession), tomb: v.tomb && typeof v.tomb === 'object' ? v.tomb : {} };
  } catch {}
  return { items: [], tomb: {} };
}

export const fmtDur = (s) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? (r ? `${m} min ${r}` : `${m} min`) : `${r} s`;
};
export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
/** Clé stable d'un exercice pour suivre sa progression (ignore la charge écrite dans le nom). */
export const exKey = (name) => norm(name).replace(/[+-]?\s*\d+([.,]\d+)?\s*kg/g, '').replace(/\s+/g, ' ').trim();

/* ───────────── Statistiques d'historique (utilisées par l'app et par le classement social du serveur) ───────────── */

const DAY = 86400000;
/** Numéro de jour local (entier) pour un timestamp, décalé de tz minutes (ex. -120 pour UTC+2 : passer getTimezoneOffset()). */
const dayNum = (t, tz = 0) => Math.floor((t - tz * 60000) / DAY);

export function summarizeHistory(rows, now = Date.now(), tz = 0) {
  const entries = (rows || []).filter((r) => r && Number(r.startedAt) > 0 && Number(r.startedAt) <= now).sort((a, b) => b.startedAt - a.startedAt);
  const today = dayNum(now, tz);
  const days = new Set(entries.map((r) => dayNum(r.startedAt, tz)));
  let streak = 0;
  let d = days.has(today) ? today : today - 1;
  while (days.has(d)) { streak++; d--; }

  const weekly = Array(8).fill(0);
  const monday = (t) => { const n = dayNum(t, tz); return n - ((n + 3) % 7); }; // 1970-01-01 est un jeudi
  const thisMonday = monday(now);
  let sessions7 = 0, sessions30 = 0, seconds30 = 0;
  for (const r of entries) {
    const age = now - r.startedAt;
    if (age < 0) continue;
    if (age <= 7 * DAY) sessions7++;
    if (age <= 30 * DAY) { sessions30++; seconds30 += Number(r.durationSeconds) || 0; }
    const w = Math.round((thisMonday - monday(r.startedAt)) / 7);
    if (w >= 0 && w < 8) weekly[7 - w]++;
  }

  const rec = new Map();
  for (const r of entries) {
    for (const ex of r.data?.exercises || []) {
      const key = exKey(ex.name);
      if (!key) continue;
      const cur = rec.get(key) || { name: ex.name, load: 0, loadReps: 0, seconds: 0, reps: 0, t: 0 };
      for (const s of ex.sets || []) {
        if (s.done === false) continue;
        const load = Number(s.load) || 0, reps = Number(s.reps) || 0, sec = Number(s.seconds) || 0;
        if (load > cur.load || (load === cur.load && load > 0 && reps > cur.loadReps)) { cur.load = load; cur.loadReps = reps; cur.t = Math.max(cur.t, r.startedAt); }
        if (sec > cur.seconds) { cur.seconds = sec; cur.t = Math.max(cur.t, r.startedAt); }
        if (reps > cur.reps) { cur.reps = reps; cur.t = Math.max(cur.t, r.startedAt); }
      }
      rec.set(key, cur);
    }
  }
  const records = [...rec.values()].map((c) =>
    c.load > 0 ? { name: c.name, kind: 'load', value: c.load, reps: c.loadReps, t: c.t }
      : c.seconds > 0 ? { name: c.name, kind: 'time', value: c.seconds, t: c.t }
        : c.reps > 0 ? { name: c.name, kind: 'reps', value: c.reps, t: c.t } : null).filter(Boolean)
    .sort((a, b) => b.t - a.t).slice(0, 8);

  return {
    sessions7, sessions30, minutes30: Math.round(seconds30 / 60), streak, weekly, records,
    lastAt: entries[0]?.startedAt || 0,
    recent: entries.slice(0, 5).map((r) => ({ name: r.sessionName, t: r.startedAt, minutes: Math.round((r.durationSeconds || 0) / 60) })),
  };
}

/** Extrait une charge utilisable d'un texte. Pour une plage (« +10 à 15 kg »),
 * on utilise le milieu (12,5 kg) comme valeur de départ, tout en conservant le texte original. */
export const parseKg = (t) => {
  const text = String(t ?? '').replace(',', '.');
  if (/kg\b/i.test(text)) {
    const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    if (nums.length) return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
  }
  const m = text.match(/^\s*\+?(\d+(?:\.\d+)?)\s*$/);
  return m ? Number(m[1]) : 0;
};
