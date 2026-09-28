// sessionmeta.js — métadonnées AUTOMATIQUES et EXPLICABLES d'une séance de la bibliothèque commune :
// activités, durée, niveau estimé, capacités et famille dominante, rôle dominant, matériel, étiquettes de filtre,
// et pour chaque étiquette la raison (« Classée ainsi parce que… »). Calculées uniquement à partir de la structure
// réelle de la séance (exercices, phases, durée), jamais inventées. Sans DOM, testé ; utilisé par le serveur.
import { CAPACITIES, CAP_FAMILIES, ACTIVITIES, EQUIPMENT } from './model.js';
import { estimateLevel, LEVEL_LABEL } from './estimate.js';
import { ROLES } from './phase.js';

const MAIN = (e) => e.block !== 'warmup' && e.block !== 'cool';
const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

/** Retourne { activities, durationMin, level, levelLabel, caps, family, role, equipment, tags, reasons }. */
export function sessionMeta(session = {}) {
  const exs = Array.isArray(session.exercises) ? session.exercises : [];
  const main = exs.filter(MAIN), list = main.length ? main : exs;
  const phases = Array.isArray(session.context?.phases) ? session.context.phases : [];
  const reasons = [], tags = [];
  const say = (tag, why) => { tags.push(tag); reasons.push({ tag, why }); };

  // Activités : celles des phases (hors pause), sinon l'activité de la séance.
  const acts = [...new Set(phases.map((p) => p.activity).filter((a) => a && a !== 'pause' && ACTIVITIES[a]))];
  if (!acts.length && ACTIVITIES[session.activity]) acts.push(session.activity);
  if (acts.length > 1) say('Multi-activités', `elle enchaîne ${acts.map((a) => ACTIVITIES[a].label).join(', ')} (d’après ses phases)`);
  else if (acts.length) say(ACTIVITIES[acts[0]].label, phases.length ? 'toutes ses phases sont de cette activité' : 'c’est l’activité indiquée par son auteur');

  // Durée : celle de la séance, sinon la somme des phases, sinon l'estimation des exercices.
  const lv = estimateLevel(session);
  const phaseMin = phases.reduce((t, p) => t + (Number(p.minutes) || 0), 0);
  const durationMin = Math.round(Number(session.durationMin) || phaseMin || lv.minutes || 0);
  if (durationMin) {
    const d = durationMin <= 30 ? 'Courte' : durationMin <= 75 ? 'Moyenne' : 'Longue';
    say(`${d} (~${durationMin} min)`, `durée ${Number(session.durationMin) ? 'prévue' : phaseMin ? 'totale de ses phases' : 'estimée à partir des séries et des repos'} : ${durationMin} min`);
  }
  if (phases.some((p) => p.activity === 'pause' || p.type === 'pause')) say('Avec pause', 'une phase de pause est prévue entre deux blocs');

  // Niveau : estimation indicative, avec les critères qui l'ont fait monter.
  const up = (lv.criteria || []).filter((c) => /élève/.test(c.effect)).map((c) => `${c.label.toLowerCase()} : ${c.value}`);
  say(`Niveau ${LEVEL_LABEL[lv.level].toLowerCase()}`, up.length ? `estimation indicative ; ce qui l’élève : ${up.slice(0, 3).join(' ; ')}` : 'estimation indicative ; aucun critère n’élève le niveau (difficulté, intensité et volume modérés)');

  // Capacités travaillées (pondérées par le nombre de séries) et famille dominante.
  const caps = {}, fam = {};
  for (const e of list) {
    const s = Math.max(1, Number(e.sets) || 1);
    for (const [c, w] of Object.entries(e.caps || {})) if (CAPACITIES[c]) { caps[c] = (caps[c] || 0) + w * s; const f = CAPACITIES[c].family; fam[f] = (fam[f] || 0) + w * s; }
  }
  const topCaps = top(caps, 4).map(([c]) => c);
  const [famTop, famW] = top(fam, 1)[0] || [];
  const famTotal = Object.values(fam).reduce((a, b) => a + b, 0);
  const family = famTop && famW / famTotal >= 0.4 ? famTop : '';
  if (family) say(CAP_FAMILIES[family], `${Math.round((famW / famTotal) * 100)} % du travail (séries × poids) porte sur ${CAP_FAMILIES[family].toLowerCase()} : ${topCaps.filter((c) => CAPACITIES[c].family === family).map((c) => CAPACITIES[c].label).join(', ')}`);
  else if (topCaps.length) say('Mixte', `aucune famille de capacités ne dépasse 40 % du travail ; les principales : ${topCaps.map((c) => CAPACITIES[c].label).join(', ')}`);

  // Rôle dominant : d'après les phases (en minutes), sinon rien (on n'invente pas).
  const roles = {};
  for (const p of phases) if (ROLES[p.role] && !['pause', 'warmup', 'cool', 'transition'].includes(p.role)) roles[p.role] = (roles[p.role] || 0) + (Number(p.minutes) || 0);
  const [role, roleMin] = top(roles, 1)[0] || [];
  if (role && roleMin) say(`${ROLES[role][1]}`, `rôle de la phase la plus longue (${roleMin} min sur ${phaseMin || durationMin})`);

  // Matériel requis.
  const equipment = [...new Set(list.flatMap((e) => (Array.isArray(e.needs) ? e.needs : [])).filter((n) => EQUIPMENT[n]))];
  if (!equipment.length) say('Sans matériel', 'aucun exercice ne demande de matériel');
  else say(`Matériel : ${equipment.map((n) => EQUIPMENT[n]).join(', ')}`, 'demandé par au moins un exercice');

  return { activities: acts, durationMin, level: lv.level, levelLabel: LEVEL_LABEL[lv.level], caps: topCaps, family, role: role || '', equipment, tags, reasons };
}
