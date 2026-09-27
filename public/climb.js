// climb.js — calculs du carnet d'escalade (sans DOM, testés) : pyramide de cotations, projets, test de doigts.
export const SENT = new Set(['flash', 'send', 'work', 'top']);
export const RESULT_WORD = { flash: 'flash', send: 'réussi', work: 'réussi après travail', top: 'top', attempt: 'essai', fail: 'pas encore' };

/** Système de cotation le plus utilisé pour ce type (bloc / voie) parmi les réussites. */
export function mainSystem(ascents, kind) {
  const n = new Map();
  for (const a of ascents) if (a.kind === kind && a.grade?.systemId && SENT.has(a.result)) n.set(a.grade.systemId, (n.get(a.grade.systemId) || 0) + 1);
  return [...n.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
}

/**
 * Pyramide : pour chaque niveau réussi, nombre de flashs et d'autres réussites, du plus dur au plus facile.
 * Seules les réussites du système principal comptent (on ne convertit jamais une cotation sans correspondance).
 */
export function pyramid(ascents, { kind = 'bloc', since = 0, systemId = '' } = {}) {
  const sys = systemId || mainSystem(ascents, kind);
  const rows = new Map();
  for (const a of ascents) {
    if (a.kind !== kind || !SENT.has(a.result) || (a.date || 0) < since || a.grade?.systemId !== sys) continue;
    const k = a.grade.levelId || a.grade.label, r = rows.get(k) || { label: a.grade.label, order: a.grade.order ?? 0, color: a.grade.color || '', flash: 0, send: 0 };
    if (a.result === 'flash') r.flash++; else r.send++;
    rows.set(k, r);
  }
  const list = [...rows.values()].sort((x, y) => y.order - x.order);
  const max = Math.max(1, ...list.map((r) => r.flash + r.send));
  return { systemId: sys, systemName: ascents.find((a) => a.grade?.systemId === sys)?.grade?.systemName || '', rows: list.map((r) => ({ ...r, total: r.flash + r.send, pct: (r.flash + r.send) / max })), total: list.reduce((t, r) => t + r.flash + r.send, 0) };
}

/** Résumé d'un projet : essais, nombre de séances, depuis quand. */
export function projectStats(p, now = Date.now()) {
  const tries = Array.isArray(p?.tries) ? p.tries : [];
  const days = new Set(tries.map((t) => new Date(t.date).toDateString()));
  const attempts = tries.reduce((s, t) => s + (Number(t.n) || 0), 0);
  const start = p?.startedAt || tries[0]?.date || now;
  return { attempts, sessions: days.size, days: Math.max(0, Math.floor((now - start) / 86400000)), last: tries.length ? Math.max(...tries.map((t) => t.date || 0)) : 0 };
}
/** Ajoute des essais à un projet (regroupés par jour). */
export function addTries(p, n = 1, at = Date.now()) {
  const tries = [...(p.tries || [])], day = new Date(at).toDateString();
  const i = tries.findIndex((t) => new Date(t.date).toDateString() === day);
  if (i >= 0) tries[i] = { ...tries[i], n: Math.min(99, (tries[i].n || 0) + n) };
  else tries.push({ date: at, n: Math.min(99, n) });
  return { ...p, tries: tries.slice(-200) };
}

/** Test de doigts : dernier résultat, tendance et s'il est temps de le refaire (une fois par mois). */
export function fingerTest(perfs, now = Date.now()) {
  const pick = (id) => perfs.filter((p) => p.metricId === id && Number.isFinite(p.value)).sort((a, b) => a.date - b.date);
  const time = pick('suspension_20mm'), load = pick('suspension_lestee');
  const last = [...time, ...load].sort((a, b) => b.date - a.date)[0] || null;
  const days = last ? Math.floor((now - last.date) / 86400000) : null;
  return { time, load, last, days, due: days === null || days >= 28 };
}
