// knowledge.js — MAÎTRISE des capacités (Découverte → Maîtrisé, fondée sur les données, jamais une note arbitraire),
// TRANSFERT entre activités (une capacité travaillée ailleurs peut servir, avec le niveau de confiance de la relation),
// CARTE DES RELATIONS objectif → capacités → métriques → exercices → activités (chaque lien dit pourquoi il existe).
// Sans DOM, testé.
import { CAPACITIES, ACTIVITIES } from './model.js';
import { LIBRARY } from './library.js';
import { capacityState } from './brain.js';

export const MASTERY = ['Découverte', 'Initiation', 'Développement', 'Solide', 'Maîtrisé'];
/**
 * Niveau de maîtrise d'une capacité. Fondé sur : niveau estimé (mesures, déclarations) et pratique (volume 30 j).
 * Sans mesure ni pratique : « données insuffisantes » (null), jamais inventé.
 */
export function capMastery(capId, ctx) {
  const st = capacityState(capId, ctx), basis = [];
  let step = null;
  if (st.level != null) {
    step = st.level >= 1.75 ? 4 : st.level >= 1.35 ? 3 : st.level >= 0.9 ? 2 : st.level >= 0.4 ? 1 : 0;
    basis.push(`Niveau estimé ${st.level} / 2 (confiance ${Math.round(st.confidence * 100)} %), à partir de ${st.evidences.filter((e) => e.level != null).length} source(s).`);
    if (st.confidence < 0.35 && step > 2) { step = 2; basis.push('Confiance faible : plafonné à « Développement » tant qu’il n’y a pas plus de mesures.'); }
  } else if (st.vol30 > 0) {
    step = st.vol30 >= 40 ? 1 : 0;
    basis.push(`Pratiquée (${st.vol30} séries pondérées sur 30 jours) mais aucune mesure du niveau.`);
  }
  return { capId, label: st.label, step, level: step == null ? null : MASTERY[step], basis, missing: step == null ? ['⚠️ Données insuffisantes : ajoute une mesure, fais un test ou déclare ton niveau.', ...st.missing] : st.missing, confidence: st.confidence };
}

/** Activités où une capacité compte (poids du modèle), avec la confiance de la relation expliquée. */
export function transfers(capId, fromActivity = '') {
  const out = [];
  for (const [id, a] of Object.entries(ACTIVITIES)) {
    const w = a.caps?.[capId]; if (!w || w < 0.3 || id === fromActivity) continue;
    out.push({ activity: id, label: `${a.emoji || ''} ${a.label}`.trim(), weight: w, confidence: w >= 0.8 ? 'forte' : w >= 0.5 ? 'moyenne' : 'faible',
      why: `Le modèle lie « ${CAPACITIES[capId]?.label || capId} » à ${a.label} avec un poids de ${w} : c’est une relation du modèle, pas une mesure de ton transfert réel.` });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/**
 * Carte des relations d'un objectif : nœuds et liens, chacun avec « pourquoi ».
 * goal = { label, caps: [{ id, w }] | { id: w } } ; metrics = ctx.metrics.
 */
export function relationMap(goal, ctx = {}) {
  const capsIn = Array.isArray(goal?.caps) ? Object.fromEntries(goal.caps.map((x) => [x.id, x.w ?? 1])) : goal?.caps || {};
  const caps = Object.entries(capsIn).filter(([c]) => CAPACITIES[c]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const nodes = [{ id: 'goal', type: 'goal', label: goal?.label || 'Objectif' }], links = [];
  const add = (n) => { if (!nodes.some((x) => x.id === n.id)) nodes.push(n); };
  for (const [c, w] of caps) {
    add({ id: 'cap:' + c, type: 'cap', label: CAPACITIES[c].label });
    links.push({ from: 'goal', to: 'cap:' + c, w, why: goal?.source === 'ia' ? `Proposé par l’assistant, validé par toi (poids ${w}).` : `Capacité liée à l’objectif (poids ${w}).` });
    for (const [mid, m] of Object.entries(ctx.metrics || {}).filter(([, m]) => (m.caps?.[c] || 0) >= 0.5).slice(0, 2)) {
      add({ id: 'met:' + mid, type: 'metric', label: m.label }); links.push({ from: 'cap:' + c, to: 'met:' + mid, w: m.caps[c], why: `« ${m.label} » mesure « ${CAPACITIES[c].label} » (poids ${m.caps[c]}).` });
    }
    for (const x of LIBRARY.filter((e) => e.role === 'main' && (e.caps?.[c] || 0) >= 0.7).sort((a, b) => b.caps[c] - a.caps[c]).slice(0, 2)) {
      add({ id: 'ex:' + x.id, type: 'exercise', label: x.name }); links.push({ from: 'cap:' + c, to: 'ex:' + x.id, w: x.caps[c], why: `« ${x.name} » travaille surtout « ${CAPACITIES[c].label} » (poids ${x.caps[c]}).` });
    }
    for (const t of transfers(c).slice(0, 2)) {
      add({ id: 'act:' + t.activity, type: 'activity', label: t.label }); links.push({ from: 'cap:' + c, to: 'act:' + t.activity, w: t.weight, why: t.why });
    }
  }
  return { nodes, links, empty: !caps.length, note: caps.length ? 'Touche un lien pour voir pourquoi il existe.' : '⚠️ Données insuffisantes : cet objectif n’a pas encore de capacités liées.' };
}

/** Préférences de séance ESTIMÉES à partir de l'historique (durée, lieu, activité, intensité ressentie, structure),
 * chacune avec son « pourquoi ». Jamais appliquées seules : l'utilisateur confirme ou corrige. */
export function estimatedFormats(ctx) {
  const recent = (ctx.history || []).slice(0, 20), out = [];
  if (recent.length < 4) return { items: [], insufficient: true };
  const top = (vals) => { const n = {}; for (const v of vals.filter(Boolean)) n[v] = (n[v] || 0) + 1; const e = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; return e ? { v: e[0], n: e[1] } : null; };
  const mins = recent.map((h) => Math.round((h.durationSeconds || 0) / 900) * 15).filter((m) => m > 0), dm = top(mins.map(String));
  if (dm && dm.n / recent.length >= 0.4) out.push({ key: 'fmt:duration', label: `Séances d’environ ${dm.v} min`, why: `${dm.n} de tes ${recent.length} dernières séances durent ~${dm.v} min.` });
  const pl = top(recent.map((h) => h.data?.context?.envName));
  if (pl && pl.n / recent.length >= 0.5) out.push({ key: 'fmt:place', label: `Lieu : ${pl.v}`, why: `${pl.n} de tes ${recent.length} dernières séances y ont eu lieu.` });
  const rpe = recent.map((h) => h.data?.rpe).filter(Boolean);
  if (rpe.length >= 4) { const a = rpe.reduce((t, x) => t + x, 0) / rpe.length; out.push({ key: 'fmt:intensity', label: a >= 3.8 ? 'Séances plutôt intenses' : a <= 2.4 ? 'Séances plutôt légères' : 'Séances d’intensité moyenne', why: `Ressenti moyen ${Math.round(a * 10) / 10} / 5 sur ${rpe.length} séances notées.` }); }
  const ph = recent.map((h) => h.data?.context?.phases?.length || 0).filter(Boolean);
  if (ph.length >= 4) { const a = Math.round(ph.reduce((t, x) => t + x, 0) / ph.length); out.push({ key: 'fmt:structure', label: `Structure en ${a} phase${a > 1 ? 's' : ''}`, why: `Moyenne de tes ${ph.length} dernières séances créées avec l’assistant.` }); }
  return { items: out, insufficient: false };
}
