// search.js — recherche classique (texte) et recherche intelligente (capacités, figures, matériel, styles, records).
// Uniquement sur les données accessibles à l'utilisateur (ses séances, son historique, ses exercices, le catalogue
// intégré et la bibliothèque commune déjà chargée). Pur JavaScript, sans DOM.

import { CAPACITIES, SKILLS, MUSCLES, EQUIPMENT, ACTIVITIES } from './model.js';
import { LIBRARY } from './library.js';
import { exCaps, records, entryActivity, activityLabel } from './brain.js';

const norm = (s) => String(s || '').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
const tokens = (q) => norm(q).split(' ').filter((t) => t.length >= 2 && !['de', 'la', 'le', 'les', 'des', 'du', 'mes', 'ma', 'mon', 'et', 'en', 'un', 'une', 'pour', 'avec'].includes(t));
const hay = (...parts) => norm(parts.flat().filter(Boolean).join(' '));
const fmt = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const SKILL_WORDS = {
  front_lever: ['front lever', 'planche avant'], human_flag: ['drapeau', 'human flag'], one_arm_pullup: ['traction a un bras', 'tractions a un bras', 'un bras', 'one arm'],
  muscle_up: ['muscle up', 'muscleup'], handstand: ['equilibre sur les mains', 'handstand', 'poirier'], pistol_squat: ['pistol'],
};

/** Recherche classique : tous les mots doivent apparaître (accents et casse ignorés). */
export function classicSearch(q, { seances = [], history = [], personal = [], common = [], goals = [] } = {}) {
  const tk = tokens(q);
  if (!tk.length) return [];
  const hit = (text) => tk.every((t) => text.includes(t));
  const out = [];
  for (const s of seances) if (hit(hay(s.name, s.objectives, s.notes?.map((n) => n.text), s.exercises?.map((e) => [e.name, e.muscles]))))
    out.push({ kind: 'seance', id: s.id, label: s.name, detail: `${s.exercises.length} exercice(s)${s.template ? ' · modèle' : ''}${s.archived ? ' · archivée' : ''}` });
  for (const h of history) if (hit(hay(h.sessionName, h.data?.note, h.data?.questionnaire?.comment, (h.data?.exercises || []).map((e) => e.name))))
    out.push({ kind: 'history', id: h.id, label: h.sessionName, detail: `réalisée le ${fmt(h.startedAt)}` });
  for (const p of personal) if (hit(hay(p.name, p.data?.muscles, p.data?.ok))) out.push({ kind: 'personal', id: p.id, label: p.name, detail: 'exercice personnel' });
  for (const x of LIBRARY) if (x.role === 'main' && hit(hay(x.name, x.muscles, x.cues, x.why))) out.push({ kind: 'library', id: x.id, label: x.name, detail: 'catalogue intégré' });
  for (const c of common) if (hit(hay(c.title, c.data?.exercises?.map((e) => e.name)))) out.push({ kind: 'common', id: c.id, label: c.title, detail: `bibliothèque commune · par ${c.author || 'ancien compte'}` });
  for (const g of goals) if (hit(hay(g.label, SKILLS[g.skillId]?.label))) out.push({ kind: 'goal', id: g.id, label: g.label || SKILLS[g.skillId]?.label, detail: 'objectif' });
  return out.slice(0, 60);
}

/** Recherche intelligente : interprète la requête en capacités, figures, muscles, matériel, styles, records. */
export function smartSearch(q, ctx, data = {}) {
  const n = norm(q), groups = [];
  if (!n) return groups;
  const capHits = Object.entries(CAPACITIES).filter(([id, c]) => n.includes(norm(c.label)) || norm(c.label).split(' ').some((w) => w.length >= 5 && n.split(' ').includes(w)) || n.includes(id.replace(/_/g, ' ')));
  const skillHits = Object.entries(SKILLS).filter(([id]) => (SKILL_WORDS[id] || []).some((w) => n.includes(w)));
  const muscleHits = Object.entries(MUSCLES).filter(([, m]) => norm(m.label).split(' ').some((w) => w.length >= 5 && n.includes(w)));
  const noEquip = /\bsans materiel\b|\bsans equipement\b|\bpoids du corps\b/.test(n);
  const eqHits = Object.entries(EQUIPMENT).filter(([, l]) => n.includes(norm(l).split(' ')[0]) && norm(l).split(' ')[0].length >= 4 && /\bavec\b|\bmateriel\b/.test(n));
  const wantsRecords = /\brecords?\b|\bmeilleur/.test(n);
  const styleHits = Object.values(ctx.styles || {}).filter((s) => n.split(' ').includes(norm(s.label)) || n.includes(norm(s.label)));
  const actHits = Object.entries(ACTIVITIES).filter(([, a]) => a.aliases.some((w) => n.split(' ').includes(norm(w))));
  const seances = data.seances || ctx.seances || [];
  const capsOfSession = (s) => { const c = {}; for (const e of s.exercises || []) for (const [k, w] of Object.entries(exCaps(e, ctx))) c[k] = Math.max(c[k] || 0, w); return c; };

  for (const [id, s] of skillHits) {
    const exIds = new Set([...s.steps.map((x) => x.exercise), ...s.paths.flatMap((p) => p.exercises)]);
    groups.push({ title: `Exercices liés à « ${s.label} »`, why: `Étapes et chemins de progression de la figure, et exercices qui travaillent ses capacités (${Object.keys(s.caps).map((c) => CAPACITIES[c]?.label).join(', ')}).`,
      results: [...LIBRARY.filter((x) => exIds.has(x.id)), ...LIBRARY.filter((x) => x.role === 'main' && !exIds.has(x.id) && Object.entries(s.caps).some(([c, w]) => w >= 0.9 && (x.caps[c] || 0) >= 0.8)).slice(0, 5)]
        .map((x) => ({ kind: 'library', id: x.id, label: x.name, detail: Object.entries(x.caps).filter(([c]) => s.caps[c]).map(([c]) => CAPACITIES[c]?.label).join(', ') })) });
  }
  for (const [id, c] of capHits) {
    if (wantsRecords) {
      const rec = records(ctx).filter((r) => (r.caps?.[id] || 0) >= 0.5);
      groups.push({ title: `Records liés à « ${c.label} »`, why: 'Records dont la métrique ou l’exercice sollicite fortement cette capacité.', results: rec.map((r) => ({ kind: 'record', id: r.metricId || r.label, label: r.label, detail: `${r.text} · ${fmt(r.date)}` })) });
    }
    groups.push({ title: `Séances qui travaillent « ${c.label} »`, why: 'Au moins un exercice avec une relation forte (≥ 0,5) vers cette capacité.', results: seances.filter((s) => (capsOfSession(s)[id] || 0) >= 0.5).map((s) => ({ kind: 'seance', id: s.id, label: s.name, detail: `${s.exercises.length} exercices` })) });
    groups.push({ title: `Historique — « ${c.label} »`, why: 'Séances réalisées ayant travaillé cette capacité.', results: ctx.history.filter((h) => (h.data?.exercises || []).some((e) => (exCaps(e, ctx)[id] || 0) >= 0.5)).slice(0, 20).map((h) => ({ kind: 'history', id: h.id, label: h.sessionName, detail: fmt(h.startedAt) })) });
    groups.push({ title: `Exercices — « ${c.label} »`, why: 'Catalogue intégré, relation ≥ 0,6.', results: LIBRARY.filter((x) => x.role === 'main' && (x.caps[id] || 0) >= 0.6).slice(0, 12).map((x) => ({ kind: 'library', id: x.id, label: x.name, detail: `relation ${x.caps[id]}` })) });
  }
  for (const [id, m] of muscleHits) groups.push({ title: `Exercices pour « ${m.label} »`, why: 'Muscle principal ou secondaire de l’exercice.', results: LIBRARY.filter((x) => x.role === 'main' && (x.prim.includes(id) || x.sec.includes(id))).slice(0, 15).map((x) => ({ kind: 'library', id: x.id, label: x.name, detail: x.prim.includes(id) ? 'muscle principal' : 'muscle secondaire' })) });
  if (noEquip) groups.push({ title: 'Séances sans matériel', why: 'Aucun exercice de la séance ne demande d’équipement.', results: seances.filter((s) => s.exercises.length && s.exercises.every((e) => !(e.needs || []).length && !(LIBRARY.find((x) => x.id === e.libId)?.needs || []).length)).map((s) => ({ kind: 'seance', id: s.id, label: s.name, detail: `${s.exercises.length} exercices` })) });
  for (const [id, l] of eqHits) groups.push({ title: `Séances avec ${l.toLowerCase()}`, why: 'Au moins un exercice utilise ce matériel.', results: seances.filter((s) => s.exercises.some((e) => (e.needs || LIBRARY.find((x) => x.id === e.libId)?.needs || []).includes(id))).map((s) => ({ kind: 'seance', id: s.id, label: s.name, detail: '' })) });
  if (wantsRecords && !capHits.length) groups.push({ title: 'Tous tes records', why: 'Meilleures performances enregistrées.', results: records(ctx).map((r) => ({ kind: 'record', id: r.metricId || r.label, label: r.label, detail: `${r.text} · ${fmt(r.date)}` })) });
  for (const st of styleHits) groups.push({ title: `Style « ${st.label} »`, why: 'Performances et ascensions enregistrées avec ce style.', results: [...ctx.perfs.filter((p) => (p.styles || []).includes(st.id)).map((p) => ({ kind: 'perf', id: p.id, label: ctx.metrics[p.metricId]?.label || 'Performance', detail: `${p.grade?.label || p.value} · ${fmt(p.date)}` })), ...ctx.ascents.filter((a) => (a.styles || []).includes(st.id)).map((a) => ({ kind: 'ascent', id: a.id, label: a.name || `${a.kind} ${a.grade?.label || a.gradeText || ''}`, detail: fmt(a.date) }))] });
  for (const [id] of actHits) groups.push({ title: `Historique — ${activityLabel(id, ctx)}`, why: 'Séances réalisées dans cette activité.', results: ctx.history.filter((h) => entryActivity(h, ctx) === id).slice(0, 20).map((h) => ({ kind: 'history', id: h.id, label: h.sessionName, detail: fmt(h.startedAt) })) });
  return groups; // une intention reconnue reste affichée même sans résultat (« aucun résultat » est une réponse)
}
