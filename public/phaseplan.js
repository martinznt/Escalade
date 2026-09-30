// phaseplan.js — après l'ossature : pour chaque phase, les contenus classés « plus adaptés à tes contraintes actuelles »
// avec leurs raisons ; puis une analyse de toute la séance qui propose des améliorations (jamais appliquées seules).
// Chaque raison dit d'où elle vient : 📊 donnée connue, 📐 règle du modèle, 🤔 déduction, ❔ information manquante.
// Sans DOM, testé. Réutilise la bibliothèque, les structures de grimpe et de sport existantes (pas de 2ᵉ générateur).
import { LIBRARY } from './library.js';
import { CAPACITIES, EQUIPMENT } from './model.js';
import { exKey } from './shared.js';
import { proposals, STRUCT_TIPS, STRUCT_WHEN } from './climbplan.js';
import { sportFamily, sportProposals } from './sportplan.js';
import { ROLES, normalizePhase, totalMinutes } from './phase.js';
import { intentCaps, labelOf } from './intents.js';
import { effectiveFilters, failing, intersect, FILTER_DEFS } from './filters.js';

export const REASON = { fact: ['📊', 'Donnée connue'], rule: ['📐', 'Règle du modèle'], inference: ['🤔', 'Déduction'], missing: ['❔', 'Information manquante'] };
const R = (cat, text) => ({ cat, text });
const capName = (id) => CAPACITIES[id]?.label?.toLowerCase() || id;
const DAY = 86400000;
const HARD = new Set(['hard', 'max']);
/** Capacités naturellement liées à un rôle (règle du modèle). */
export const ROLE_CAPS = {
  technique: { technique_escalade: 1, technique_pieds: 0.8, technique_course: 0.6, technique_nage: 0.6, coordination: 0.5 },
  endurance: { endurance_doigts: 1, endurance_aerobie: 0.8, seuil: 0.6 },
  force: { force_doigts: 1, tirage_vertical: 0.8, force_jambes: 0.6, blocage: 0.6 },
  puissance: { puissance_haut: 1, explosivite: 1, vitesse: 0.6 },
  mobilite: { mobilite_hanches: 1, mobilite_epaules: 1 },
  recup: { mobilite_hanches: 0.6, mobilite_epaules: 0.6 },
  prep: { stabilite_epaules: 0.6, technique_escalade: 0.5, endurance_doigts: 0.5 },
};
const nextPerf = (phases, i) => phases.slice(i + 1).find((p) => p.role === 'perf');

/** Ce que la phase doit travailler, et d'où ça vient. */
export function phaseTargets(phase, { intent = null, goals = [] } = {}) {
  const t = {}, src = [];
  const add = (caps, w, why) => { const got = []; for (const [c, v] of Object.entries(caps)) if (CAPACITIES[c]) { t[c] = Math.max(t[c] || 0, v * w); got.push(c); } if (got.length) src.push({ ...why, caps: got }); };
  if (phase.subIntents?.length) { const ic = intentCaps(phase.subIntents, phase.rules || []); add(ic.caps, 0.6, R('fact', `Tes sous-objectifs : ${phase.subIntents.map((x) => labelOf(x.id)).join(', ')}`)); }
  if (phase.priorities?.length) add(Object.fromEntries(phase.priorities.map((c) => [c, 1])), 2, R('fact', `Tes priorités pour cette phase : ${phase.priorities.map(capName).join(', ')}`));
  if (intent?.priorities?.length) add(Object.fromEntries(intent.priorities.map((c) => [c, 1])), 1, R('fact', `Ton intention d’aujourd’hui : ${intent.priorities.map(capName).join(', ')}`));
  for (const g of goals) if (g.caps?.length) add(Object.fromEntries(g.caps.map((c) => [c.id, c.w || 0.6])), 0.8, R('fact', `Ton objectif « ${g.label} »`));
  if (ROLE_CAPS[phase.role]) add(ROLE_CAPS[phase.role], 0.7, R('rule', `Rôle « ${ROLES[phase.role][1]} » de la phase`));
  return { targets: t, sources: src };
}
const libRole = (phase) => (phase.role === 'warmup' || phase.type === 'warmup' ? 'warmup' : ['cool', 'recup', 'mobilite'].includes(phase.role) ? 'cool' : 'main');
function recentUse(ctx, now) {
  const m = new Map();
  for (const h of ctx.history || []) for (const e of h.data?.exercises || []) { const k = exKey(e.name || ''); if (k && !m.has(k)) m.set(k, h.startedAt); }
  return (x) => { const t = m.get(exKey(x.name)); return t && now - t < 7 * DAY ? Math.max(0, Math.round((now - t) / DAY)) : null; };
}

/**
 * Propositions classées pour une phase. o = { phases, index, eq (Set du matériel), intent, goals, now }.
 * Retourne { items: [{ id, name, fit, score, reasons, kind }], missing: [raisons ❔] }.
 */
export function proposeForPhase(phase, ctx = {}, o = {}) {
  const phases = o.phases || [phase], i = o.index ?? phases.indexOf(phase), perfAfter = phase.role !== 'perf' ? nextPerf(phases, i) : null;
  const missing = [], items = [];
  if (phase.type === 'pause') return { items: [], missing: [R('rule', 'Pause : rien à proposer, c’est du temps pour récupérer.')] };
  if (phase.type === 'climb') {
    const kind = phase.kind === 'voie' ? 'voie' : 'bloc';
    const want = { limit: ['limit', 'max'], perf: ['limit', 'max'], work: ['pyramid', 'styles'], discover: ['styles', 'volume', 'technique'], enchain: ['fourx4', 'enchain'] }[phase.attemptType] || [];
    const focus = { resist: ['fourx4', 'enchain', 'volume'], tech: ['technique', 'volume', 'styles'], perf: ['limit', 'max', 'pyramid'] }[phase.focus] || [];
    for (const s of proposals(kind, phase.intensity)) {
      const reasons = []; let score = s.fit ? 1 : 0.3;
      reasons.push(R('rule', s.fit ? `Va avec l’intensité choisie (${phase.intensity === 'max' ? 'max' : phase.intensity === 'hard' ? 'intense' : phase.intensity === 'easy' ? 'tranquille' : 'modérée'})` : 'Moins adapté à l’intensité choisie'));
      if (STRUCT_TIPS[s.id]) reasons.push(R('rule', `Travaille surtout : ${STRUCT_TIPS[s.id].join(', ')}`));
      if (want.includes(s.id)) { score += 0.6; reasons.push(R('fact', `Correspond au type d’essais choisi`)); }
      if (focus.includes(s.id)) { score += 0.4; reasons.push(R('fact', `Correspond à ta priorité de la phase`)); }
      if (perfAfter && ['limit', 'max', 'fourx4'].includes(s.id)) { score -= 0.5; reasons.push(R('inference', 'Très exigeant : risque d’entamer la phase de performance qui suit')); }
      if (perfAfter && ['volume', 'technique', 'styles'].includes(s.id)) { score += 0.3; reasons.push(R('inference', 'Moins exigeant : garde des ressources pour la phase de performance')); }
      if (STRUCT_WHEN[s.id]) reasons.push(R('rule', STRUCT_WHEN[s.id]));
      items.push({ id: s.id, name: `${s.emoji} ${s.name}`, score, reasons, kind: 'structure', desc: s.desc });
    }
    if (!phase.styles?.length) missing.push(R('missing', 'Aucun style choisi : les propositions ne tiennent pas compte des styles.'));
  } else if (phase.type === 'work') {
    const fam = sportFamily(phase.activity);
    for (const s of sportProposals(fam, phase.intensity)) {
      const reasons = [R('rule', s.fit ? 'Va avec l’intensité choisie' : 'Moins adapté à l’intensité choisie'), R('rule', s.when)]; let score = s.fit ? 1 : 0.3;
      if (perfAfter && HARD.has(phase.intensity)) { score -= 0.2; reasons.push(R('inference', 'Une phase de performance suit : reste en dessous de ton maximum')); }
      items.push({ id: s.id, name: `${s.emoji} ${s.name}`, score, reasons, kind: 'structure', desc: s.desc });
    }
  } else {
    const { targets, sources } = phaseTargets(phase, o);
    if (!Object.keys(targets).length) missing.push(R('missing', 'Pas de priorité ni d’objectif pour cette phase : classement selon le rôle et le matériel seulement.'));
    const eq = o.eq || null, role = libRole(phase), now = o.now || Date.now(), used = recentUse(ctx, now);
    // Filtres de la séance, précisés par la phase (garder / préciser / remplacer / retirer).
    const ef = effectiveFilters([o.filters || {}, phase.filters || {}]), filters = ef.filters, tr = phase.tradeoffs || {};
    for (const c of ef.conflicts) missing.push(R('rule', c.text));
    if (phase.forbidEquip?.length) filters.materiel = (filters.materiel || Object.keys(EQUIPMENT)).filter((n) => !phase.forbidEquip.includes(n));
    let excluded = 0, filtered = 0;
    const pool = [];
    for (const x of LIBRARY) {
      if (phase.forbidden?.includes(x.id)) continue;
      if (x.role && x.role !== role && !phase.imposed?.includes(x.id)) continue;
      if (phase.activity && x.acts?.length && !x.acts.includes(phase.activity) && !(phase.activity.startsWith('climbing') && x.acts.some((a) => a.startsWith('climbing')))) continue;
      if (eq && !(x.needs || []).every((n) => eq.has(n))) { excluded++; continue; }
      pool.push(x);
      if (failing(x, filters).length && !phase.imposed?.includes(x.id)) { filtered++; continue; }
      const reasons = []; let score = 0;
      for (const [c, w] of Object.entries(targets)) score += (x.caps?.[c] || 0) * w;
      const top = Object.entries(x.caps || {}).sort((a, b) => b[1] - a[1])[0];
      if (top) reasons.push(R('rule', `Travaille surtout : ${capName(top[0])}`));
      // Une source n'est citée que si l'exercice travaille vraiment une de ses capacités.
      const hit = Object.keys(targets).filter((c) => (x.caps?.[c] || 0) >= 0.5);
      for (const sr of sources) { const c = sr.caps.filter((k) => hit.includes(k)); if (c.length) reasons.push(R(sr.cat, `${sr.text.replace(/ : .*$/, '')} : ${c.slice(0, 2).map(capName).join(', ')}`)); }
      reasons.push(R('fact', x.needs?.length ? `Matériel disponible : ${x.needs.map((n) => EQUIPMENT[n] || n).join(', ').toLowerCase()}` : 'Sans matériel'));
      const im = { low: 'easy', mod: 'mod', high: 'hard' }[x.intensity];
      if (im && (im === phase.intensity || (im === 'hard' && phase.intensity === 'max'))) { score += 0.3; reasons.push(R('rule', 'Même intensité que la phase')); }
      if (perfAfter && x.intensity === 'high') { score -= 0.5; reasons.push(R('inference', 'Exigeant : pourrait entamer la phase de performance qui suit')); }
      if (perfAfter && x.intensity === 'low') { score += 0.2; reasons.push(R('inference', 'Peu exigeant : conserve des ressources pour la phase de performance')); }
      const d = used(x); if (d != null) { score -= 0.4; reasons.push(R('fact', d ? `Déjà fait il y a ${d} jour${d > 1 ? 's' : ''}` : 'Déjà fait aujourd’hui')); }
      const pref = ctx.prefs?.[exKey(x.name)]?.value;
      if (pref === 'avoid') { score -= 1.5; reasons.push(R('fact', 'Tu as indiqué l’éviter')); }
      if (pref === 'like') { score += 0.3; reasons.push(R('fact', 'Tu as indiqué l’aimer')); }
      // Curseurs de compromis et contraintes de la phase.
      if (tr.volInt > 0 && x.intensity === 'high') { score += 0.2 * tr.volInt; reasons.push(R('fact', 'Tu privilégies l’intensité')); }
      if (tr.volInt < 0 && x.intensity === 'low') { score += 0.2 * -tr.volInt; reasons.push(R('fact', 'Tu privilégies le volume')); }
      if ((tr.fatStim < 0 || phase.fatigue === 'low' || phase.noFailure) && x.intensity === 'high') { score -= 0.3; reasons.push(R('fact', phase.noFailure ? 'Tu ne veux pas aller à l’échec' : 'Tu veux limiter la fatigue')); }
      if (tr.diffSucc > 0 && (x.diff || 2) >= 4) { score -= 0.2 * tr.diffSucc; reasons.push(R('fact', 'Tu privilégies la réussite : exercice difficile')); }
      if (tr.specGen < 0 && x.acts?.includes(phase.activity)) { score += 0.2 * -tr.specGen; reasons.push(R('fact', 'Spécifique à cette activité, comme tu le veux')); }
      if (tr.varRep < 0 && d != null) score -= 0.3;
      if (phase.imposed?.includes(x.id)) { score += 10; reasons.unshift(R('fact', 'Imposé par toi')); }
      items.push({ id: x.id, name: `${x.emoji || '💪'} ${x.name}`, score, reasons, kind: 'exercise', ex: x });
    }
    if (excluded) missing.push(R('fact', `${excluded} exercice(s) écarté(s) : matériel absent de ce lieu.`));
    if (filtered) missing.push(R('fact', `${filtered} exercice(s) écarté(s) par tes filtres (${Object.keys(filters).filter((k) => FILTER_DEFS[k]?.apply === 'match').map((k) => FILTER_DEFS[k].label.toLowerCase()).join(', ')}).`));
    if (!items.length && pool.length) {
      const it = intersect(pool, filters, { subIntents: phase.subIntents, constraints: { noFailure: phase.noFailure } });
      missing.push(R('missing', `Aucun exercice ne respecte toutes tes contraintes à la fois.${it.relax.length ? ' ' + it.relax.slice(0, 2).map((x) => x.text).join(' ') : ''}`));
    }
  }
  items.sort((a, b) => b.score - a.score);
  const best = items[0]?.score ?? 0;
  // Jamais « le meilleur exercice » : une pertinence POUR CETTE PHASE, avec son compromis.
  const tired = phase.fatigue === 'low' || phase.noFailure || (phase.tradeoffs?.fatStim || 0) < 0 || !!perfAfter;
  const fitOf = (x, k) => {
    if (k === 0) return 'Le plus adapté à tes contraintes actuelles';
    if (x.score < best * 0.7 || k >= 4) return 'Alternative';
    if (x.ex?.intensity === 'high' && tired) return 'Adapté mais plus fatigant';
    if (x.ex && phase.activity && !(x.ex.acts || []).includes(phase.activity)) return 'Bon pour la capacité mais moins spécifique';
    return 'Adapté';
  };
  const out = items.slice(0, 8).map((x, k) => { const { ex, ...y } = x; return { ...y, score: Math.round(x.score * 100) / 100, rank: k + 1, fit: fitOf(x, k) }; });
  return { items: out, missing };
}

/* ───────── Analyse de toute la séance : suggestions explicables, jamais appliquées seules ───────── */
const locked = (p, field) => p.locks?.[field] === 'user';
/**
 * Suggestions d'amélioration. o = { eq, load (analyse de charge récente), intent }.
 * Chaque suggestion : { id, title, text, why: [raisons], patch: [opérations] | null, blocked: '' | raison }.
 */
export function analyzeSession(phasesIn, ctx = {}, o = {}) {
  const phases = phasesIn.map((p, i) => normalizePhase(p, i)), out = [];
  // Chaque suggestion : problème → proposition → bénéfice → compromis (rien n'est gratuit, et on le dit).
  const TRADE = {
    'fatigue-intensity': ['Plus de fraîcheur pour la phase de performance', 'Moins de stimulation sur la phase allégée'],
    'fatigue-minutes': ['Plus de ressources pour performer, et 20 min de plus pour la performance', 'Moins de volume sur la phase raccourcie'],
    'pause-before-perf': ['Récupération juste avant l’effort principal', 'Le temps de la pause est pris sur la plus longue phase'],
    short: ['La phase a le temps de remplir son rôle', 'Ce temps est pris sur les autres phases'],
    warmup: ['Corps prêt avant l’effort intense', 'Un peu moins de temps pour le reste'],
    repeat: ['Moins de fatigue accumulée sur la même capacité', 'Cette capacité est un peu moins travaillée'],
    'no-wall': ['Une séance réalisable là où tu vas', 'Changer de lieu ou de contenu'],
    'recent-load': ['Plus prudent vu tes dernières semaines', 'Stimulation plus faible aujourd’hui'],
    cool: ['Meilleure récupération après l’effort', '10 min de plus ou prises ailleurs'],
    missing: ['Ton intention d’aujourd’hui est vraiment travaillée', 'La phase partage son temps avec une priorité de plus'],
    'too-long': ['Séance plus soutenable', 'Rien n’est retiré : à toi de voir'],
  };
  const add = (s) => { const [benefit, compromise] = TRADE[s.id] || TRADE[s.id.replace(/-.*$/, '')] || ['', '']; s = { problem: s.why?.[0]?.text || '', benefit, compromise, ...s }; const blk = (s.patch || []).find((op) => op.op === 'set' && locked(phases.find((p) => p.id === op.id) || {}, op.field === 'minutes' ? 'minutes' : op.field)); out.push({ ...s, blocked: blk ? `Tu as verrouillé ce réglage (${blk.field === 'minutes' ? 'durée' : blk.field}).` : '' }); };
  const perfIdx = phases.findIndex((p) => p.role === 'perf');
  // 1. Trop de fatigue avant une phase de performance.
  if (perfIdx > 0) {
    const before = phases.slice(0, perfIdx).filter((p) => p.type !== 'pause');
    const heavy = before.filter((p) => HARD.has(p.intensity) || p.fatigue === 'high');
    const heavyMin = heavy.reduce((t, p) => t + p.minutes, 0);
    const long = before.filter((p) => !['warmup', 'cool', 'pause'].includes(p.role) && p.minutes >= 60).sort((a, b) => b.minutes - a.minutes)[0];
    if (heavy.length && heavyMin >= 30) {
      const h = heavy.sort((a, b) => b.minutes - a.minutes)[0];
      add({ id: 'fatigue-intensity', title: `Baisser l’intensité de « ${phaseName(h)} »`, text: `Passer « ${phaseName(h)} » en intensité modérée pourrait mieux préserver ta phase de performance.`,
        why: [R('fact', `${heavyMin} min intenses avant la performance`), R('rule', 'Une performance demande d’arriver frais')], patch: [{ op: 'set', id: h.id, field: 'intensity', value: 'mod' }] });
    }
    if (long && long.minutes >= 90) {
      add({ id: 'fatigue-minutes', title: `Réduire « ${phaseName(long)} » de 20 min`, text: `Réduire de 20 min « ${phaseName(long)} » pourrait mieux préserver la phase de performance, puisque ta priorité finale est la performance.`,
        why: [R('fact', `${long.minutes} min avant la performance`), R('inference', 'Moins de volume avant = plus de ressources pour performer')], patch: [{ op: 'set', id: long.id, field: 'minutes', value: long.minutes - 20 }, { op: 'give', to: phases[perfIdx].id, minutes: 20 }] });
    }
    const gap = phases[perfIdx - 1];
    if (gap && gap.type !== 'pause' && heavyMin >= 45) add({ id: 'pause-before-perf', title: 'Ajouter une pause avant la performance', text: 'Une pause de 15 min juste avant la phase de performance aide à récupérer.', why: [R('rule', 'La récupération entre deux efforts importants améliore la performance'), R('fact', `${heavyMin} min intenses juste avant`)], patch: [{ op: 'insert', at: perfIdx, phase: { type: 'pause', minutes: 15, role: 'pause', goal: 'Récupérer avant la performance' } }] });
  }
  // 2. Phase trop courte pour son rôle.
  const MIN = { perf: 20, warmup: 8, force: 15, puissance: 10, endurance: 15 };
  for (const p of phases) if (MIN[p.role] && p.minutes < MIN[p.role]) add({ id: 'short-' + p.id, title: `Allonger « ${phaseName(p)} »`, text: `${p.minutes} min, c’est court pour une phase « ${ROLES[p.role][1]} » : ${MIN[p.role]} min au moins.`, why: [R('rule', `Rôle « ${ROLES[p.role][1]} » : ${MIN[p.role]} min au moins`), R('fact', `Durée actuelle : ${p.minutes} min`)], patch: [{ op: 'set', id: p.id, field: 'minutes', value: MIN[p.role] }] });
  // 3. Pas d'échauffement avant la première phase intense.
  const firstHard = phases.findIndex((p) => HARD.has(p.intensity) && p.type !== 'pause');
  if (firstHard >= 0 && !phases.slice(0, firstHard).some((p) => p.role === 'warmup' || p.type === 'warmup')) add({ id: 'warmup', title: 'Ajouter un échauffement au début', text: 'La séance commence directement par une phase intense : 10 min d’échauffement la préparent.', why: [R('rule', 'Un échauffement avant un effort intense réduit le risque de blessure'), R('fact', `« ${phaseName(phases[firstHard])} » est en intensité ${phases[firstHard].intensity === 'max' ? 'max' : 'intense'}`)], patch: [{ op: 'insert', at: 0, phase: { type: 'warmup', minutes: 10, role: 'warmup' } }] });
  // 4. Capacité répétée d'une phase à l'autre, en intense.
  for (let i = 1; i < phases.length; i++) {
    const a = phases[i - 1], b = phases[i], same = a.priorities.find((c) => b.priorities.includes(c));
    if (same && HARD.has(a.intensity) && HARD.has(b.intensity)) add({ id: 'repeat-' + b.id, title: `Varier « ${phaseName(b)} »`, text: `« ${phaseName(a)} » et « ${phaseName(b)} » travaillent toutes les deux ${capName(same)} en intense, à la suite.`, why: [R('fact', `Même priorité : ${capName(same)}`), R('rule', 'Deux phases intenses sur la même capacité fatiguent sans ajouter beaucoup')], patch: [{ op: 'set', id: b.id, field: 'intensity', value: 'mod' }] });
  }
  // 5. Matériel : grimpe sans mur au lieu choisi.
  if (o.eq && phases.some((p) => p.type === 'climb') && !o.eq.has('wall')) add({ id: 'no-wall', title: 'Pas de mur d’escalade à ce lieu', text: 'Le lieu choisi n’a pas de mur d’escalade dans son matériel : choisis un autre lieu, ou ajoute le mur à ce lieu.', why: [R('fact', 'Matériel du lieu : pas de mur')], patch: null });
  // 6. Charge récente élevée.
  if (o.load?.signals?.length) {
    const h = phases.filter((p) => HARD.has(p.intensity)).sort((a, b) => b.minutes - a.minutes)[0];
    if (h) add({ id: 'recent-load', title: `Alléger « ${phaseName(h)} »`, text: 'Tes dernières semaines sont chargées : une intensité modérée ici serait plus prudente.', why: [R('fact', o.load.signals[0]), R('inference', 'Charge élevée récente → risque de fatigue accumulée (pas un diagnostic)')], patch: [{ op: 'set', id: h.id, field: 'intensity', value: 'mod' }] });
  }
  // 7. Retour au calme absent après une fin intense.
  const last = phases[phases.length - 1];
  if (last && HARD.has(last.intensity) && last.type !== 'cool' && last.role !== 'cool') add({ id: 'cool', title: 'Ajouter un retour au calme', text: 'La séance finit sur une phase intense : 10 min de retour au calme aident à récupérer.', why: [R('rule', 'Un retour au calme après un effort intense aide la récupération')], patch: [{ op: 'insert', at: phases.length, phase: { type: 'cool', minutes: 10, role: 'cool' } }] });
  // 8. Priorité importante totalement absente.
  for (const c of o.intent?.priorities || []) {
    if (!phases.some((p) => p.priorities.includes(c) || ROLE_CAPS[p.role]?.[c] || (intentCaps(p.subIntents || []).caps[c] || 0) >= 0.5)) {
      const t = phases.find((p) => !['warmup', 'cool', 'pause'].includes(p.role));
      if (t) add({ id: 'missing-' + c, title: `Ajouter « ${capName(c)} » à « ${phaseName(t)} »`, text: `Tu veux travailler ${capName(c)} aujourd’hui, mais aucune phase ne s’en occupe.`, why: [R('fact', `Ton intention d’aujourd’hui : ${capName(c)}`), R('fact', 'Aucune phase ne l’a en priorité')], patch: [{ op: 'set', id: t.id, field: 'priorities', value: [...new Set([...t.priorities, c])] }] });
    }
  }
  // 9. Séance disproportionnée.
  if (totalMinutes(phases) > 300) add({ id: 'too-long', title: 'Séance très longue', text: `${Math.round(totalMinutes(phases) / 6) / 10} h au total : pense à des pauses et à t’hydrater.`, why: [R('fact', `${totalMinutes(phases)} min au total`)], patch: null });
  return out;
}
export const phaseName = (p) => (p.goal ? p.goal.slice(0, 40) : p.label ? String(p.label).replace(/^\S+\s/, '').slice(0, 40) : p.role === 'custom' && p.roleLabel ? p.roleLabel : ROLES[p.role]?.[1] || 'Phase');

/** Applique une suggestion (nouvelle liste de phases). Refuse si elle touche un réglage verrouillé. */
export function applySuggestion(phases, s) {
  if (!s?.patch || s.blocked) return { phases, applied: false };
  let list = phases.map((p) => ({ ...p }));
  for (const op of s.patch) {
    if (op.op === 'set') list = list.map((p) => (p.id === op.id ? normalizePhase({ ...p, [op.field]: op.value }, 0, p.activity) : p));
    if (op.op === 'give') list = list.map((p) => (p.id === op.to && !locked(p, 'minutes') ? { ...p, minutes: p.minutes + op.minutes } : p));
    if (op.op === 'insert') {
      // Le temps de la nouvelle phase est pris sur la plus longue phase non verrouillée (le total ne change pas).
      const np = normalizePhase({ ...op.phase, id: `ph-s${list.length + 1}-${op.phase.type}` }, 0, list[0]?.activity || '');
      const donor = list.filter((p) => !locked(p, 'minutes') && p.type !== 'pause').sort((a, b) => b.minutes - a.minutes)[0];
      if (donor && donor.minutes - np.minutes >= 10) donor.minutes -= np.minutes;
      list.splice(Math.min(op.at, list.length), 0, np);
    }
  }
  return { phases: list, applied: true };
}
