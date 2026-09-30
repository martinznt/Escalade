// budget.js — la séance a un BUDGET de temps réel, et chaque phase peut se passer dans un lieu différent.
// On résout le lieu de chaque phase (même lieu que la précédente, un autre lieu, ou libre), on analyse chaque
// transition (déplacement, matériel non transportable, saut d'intensité, échauffement spécifique manquant) et on
// compare le temps nécessaire (phases + déplacements) au temps disponible. Si ça dépasse, on le dit avec le chiffre
// exact et on propose ce qui pourrait être sacrifié — sans rien appliquer. Sans DOM, testé.
import { ROLES } from './phase.js';

/** Matériel qu'on peut emporter d'un lieu à l'autre (le reste est lié au lieu). */
export const PORTABLE = new Set(['band', 'rope', 'rings', 'mat']);
const EQ_LABEL = { wall: 'mur d’escalade', hangboard: 'poutre', bar: 'barre de traction', dips: 'barres parallèles', weights: 'haltères', band: 'élastique', rings: 'anneaux', barbell: 'barre et disques', kettlebell: 'kettlebell', bench: 'banc', pool: 'bassin', machine: 'machines', box: 'box', rope: 'corde à sauter', mat: 'tapis', pole: 'espalier' };
const HARD = new Set(['hard', 'max']);
/** Matériel indispensable à une phase, d'après son type (et ses filtres « matériel » s'il y en a). */
export function phaseNeeds(p) {
  if (p.type === 'pause') return [];
  if (p.type === 'climb') return ['wall'];
  if (p.type === 'fingers') return ['hangboard'];
  if (p.activity === 'swimming') return ['pool'];
  const m = p.filters?.materiel?.value || p.filters?.materiel;
  return Array.isArray(m) ? m.filter((x) => x !== 'none' && !PORTABLE.has(x)) : [];
}
/** Lieu effectif de chaque phase : { envId, name, known, inherited }. */
export function resolvePlaces(phases, envs = [], defaultEnvId = '') {
  let prev = defaultEnvId || '';
  return phases.map((p, i) => {
    const pl = p.place || {};
    let envId = pl.mode === 'other' ? pl.envId || '' : pl.mode === 'free' ? '' : prev;
    if (i === 0 && pl.mode !== 'other' && pl.mode !== 'free') envId = defaultEnvId || '';
    const env = envs.find((e) => e.id === envId);
    if (pl.mode !== 'free') prev = envId;
    return { envId, name: env?.name || (pl.mode === 'free' ? 'Lieu libre' : envId ? 'Lieu inconnu' : 'Lieu non précisé'), equipment: env ? new Set(env.equipment || []) : null, free: pl.mode === 'free', inherited: pl.mode !== 'other' && i > 0 };
  });
}

/** Transitions entre phases (lecture descriptive, jamais appliquée). */
export function transitions(phases, envs = [], defaultEnvId = '') {
  const places = resolvePlaces(phases, envs, defaultEnvId), out = [];
  phases.forEach((p, i) => {
    const pl = places[i], issues = [];
    for (const n of phaseNeeds(p)) if (pl.equipment && !pl.equipment.has(n)) issues.push({ kind: 'material', text: `« ${EQ_LABEL[n] || n} » n’est pas dans le matériel de ${pl.name}.` });
    if (i === 0) { if (issues.length) out.push({ from: -1, to: 0, travel: 0, issues }); return; }
    const a = phases[i - 1], pa = places[i - 1];
    const moved = pa.envId && pl.envId && pa.envId !== pl.envId;
    const travel = moved ? Math.max(0, Math.round(Number(p.place?.travelMin) || 0)) : 0;
    if (moved && !p.place?.travelMin) issues.push({ kind: 'travel-missing', text: `Changement de lieu (${pa.name} → ${pl.name}) : temps de déplacement non renseigné.` });
    if (moved) {
      const lost = phaseNeeds(a).filter((n) => !PORTABLE.has(n) && phaseNeeds(p).includes(n) && pl.equipment && !pl.equipment.has(n));
      for (const n of lost) issues.push({ kind: 'transport', text: `« ${EQ_LABEL[n] || n} » ne se transporte pas et manque à ${pl.name}.` });
    }
    if (HARD.has(a.intensity) && p.role === 'perf' && a.type !== 'pause') issues.push({ kind: 'recovery', text: 'Tu passes d’une phase intense à une phase de performance : une transition / récupération pourrait préserver la performance.', proposal: { type: 'pause', minutes: 10 } });
    if (a.activity && p.activity && a.activity !== p.activity && a.type !== 'pause' && p.type !== 'pause' && HARD.has(p.intensity) && p.role !== 'warmup') issues.push({ kind: 'warmup', text: `Changement d’activité avant une phase intense : un échauffement spécifique (5–10 min) aiderait.` });
    if (a.type === 'pause' && moved && travel && a.minutes < travel) issues.push({ kind: 'pause-travel', text: `La pause (${a.minutes} min) est plus courte que le déplacement (${travel} min).` });
    if (issues.length || travel) out.push({ from: i - 1, to: i, travel, moved, issues });
  });
  return out;
}

/** Minimum raisonnable d'une phase selon son rôle (en dessous, la phase perd son sens). */
const MIN_BY_ROLE = { warmup: 8, perf: 20, force: 15, endurance: 15, technique: 10, cool: 5, pause: 5 };
/**
 * Budget : temps nécessaire (phases + déplacements) vs disponible. Si ça dépasse : message exact, et ce qui peut
 * être sacrifié, du moins coûteux au plus coûteux, en respectant les durées verrouillées.
 */
export function budget(phases, available, trans = []) {
  const phaseMin = phases.reduce((t, p) => t + (Number(p.minutes) || 0), 0);
  const travel = trans.reduce((t, x) => t + (x.travel || 0), 0);
  const needed = phaseMin + travel, avail = Math.round(Number(available) || 0);
  const res = { phaseMin, travel, needed, available: avail, over: Math.max(0, needed - avail), spare: Math.max(0, avail - needed), sacrifice: [] };
  if (!avail) return { ...res, text: 'Temps disponible non précisé.' };
  if (res.over <= 0) return { ...res, text: res.spare ? `${needed} min prévues sur ${avail} min disponibles (${res.spare} min de marge).` : `${needed} min prévues : pile le temps disponible.` };
  res.text = `Les contraintes actuelles nécessitent ${needed} min pour ${avail} min disponibles (${res.over} min de trop).`;
  const cost = { pause: 1, mobilite: 2, cool: 3, transition: 1, technique: 4, endurance: 5, force: 5, main: 5, prep: 4, warmup: 6, puissance: 6, recup: 2, perf: 9, custom: 5 };
  phases.forEach((p, i) => {
    if (p.locks?.minutes === 'user') return;
    const room = Math.max(0, p.minutes - (MIN_BY_ROLE[p.role] || 5));
    if (room >= 5) res.sacrifice.push({ index: i, id: p.id, minutes: Math.min(room, Math.ceil(res.over / 5) * 5), cost: cost[p.role] ?? 5, text: `Raccourcir « ${p.goal || ROLES[p.role]?.[1] || 'la phase'} » de ${Math.min(room, Math.ceil(res.over / 5) * 5)} min`, compromise: p.role === 'perf' ? 'touche la phase de performance' : p.role === 'warmup' ? 'échauffement plus court' : 'moins de volume sur cette phase' });
    if (!['warmup', 'perf'].includes(p.role) && phases.length > 2) res.sacrifice.push({ index: i, id: p.id, remove: true, minutes: p.minutes, cost: (cost[p.role] ?? 5) + 3, text: `Retirer « ${p.goal || ROLES[p.role]?.[1] || 'la phase'} » (${p.minutes} min)`, compromise: 'ce que travaillait cette phase disparaît de la séance' });
  });
  if (travel) res.sacrifice.push({ travel: true, minutes: travel, cost: 4, text: `Faire toute la séance au même endroit (−${travel} min de déplacement)`, compromise: 'il faut que ce lieu ait tout le matériel nécessaire' });
  res.sacrifice.sort((a, b) => a.cost - b.cost || b.minutes - a.minutes);
  res.sacrifice = res.sacrifice.slice(0, 6);
  return res;
}
