// sessionedit.js — « Modifier avec l'IA » depuis une séance ouverte : une demande en français (« J'ai seulement 1 h 20 »,
// « Garde exactement la partie performance », « Réduis uniquement la préparation », « Ajoute 15 min de technique »,
// « Moins intense », « Retire la pause ») devient un PLAN : ce qui va changer, ce qui reste inchangé, pourquoi,
// conséquences (simulation), compromis. Rien n'est appliqué avant « Appliquer ». Les éléments verrouillés sont
// toujours respectés. L'IA du serveur, si elle est disponible, ne fait que traduire la demande en opérations
// validées ici (jamais de code). Sans DOM, testé.
import { normalizePhases, normalizePhase, fitDurations, ROLES } from './phase.js';
import { phaseName } from './phaseplan.js';
import { simulate, metrics } from './whatif.js';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
/** Minutes lues dans un texte : « 1 h 20 », « 1h », « 80 min », « 1,5 h ». */
export function readMinutes(t) {
  const s = norm(t), hm = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:eures?)?\s*(\d{1,2})?/), m = s.match(/(\d+)\s*(?:min|mn|minutes?)\b/);
  if (hm) return Math.round(Number(hm[1].replace(',', '.')) * 60 + Number(hm[2] || 0));
  return m ? Number(m[1]) : null;
}
const ROLE_WORDS = { perf: ['performance', 'perf'], warmup: ['echauffement'], cool: ['retour au calme', 'calme'], prep: ['preparation', 'prepa'], technique: ['technique'], endurance: ['resistance', 'endurance'], force: ['force'], puissance: ['puissance'], mobilite: ['mobilite', 'etirement'], pause: ['pause'] };
const TYPE_WORDS = { bloc: (p) => p.type === 'climb' && p.kind !== 'voie', voie: (p) => p.type === 'climb' && p.kind === 'voie' };
/** Phases désignées dans un morceau de texte (par rôle, type ou but). */
function target(phases, chunk) {
  const s = norm(chunk), hits = new Set();
  for (const [role, words] of Object.entries(ROLE_WORDS)) if (words.some((w) => s.includes(w))) phases.forEach((p, i) => { if (p.role === role || (role === 'pause' && p.type === 'pause') || (role === 'warmup' && p.type === 'warmup') || (role === 'cool' && p.type === 'cool')) hits.add(i); });
  for (const [w, f] of Object.entries(TYPE_WORDS)) if (new RegExp(`\\b${w}\\b`).test(s)) phases.forEach((p, i) => { if (f(p)) hits.add(i); });
  phases.forEach((p, i) => { if (p.goal && s.includes(norm(p.goal).slice(0, 12))) hits.add(i); });
  return [...hits];
}

/** Traduit la demande en opérations : [{ op: total|keep|only|remove|add|intensity, … }]. */
export function parseRequest(text, phases) {
  const s = norm(text), ops = [];
  for (const part of s.split(/[.;]|\bet\b|,/).map((x) => x.trim()).filter(Boolean)) {
    const min = readMinutes(part);
    if (/(seulement|que|plus que|dispo|disponible|j ai)\b/.test(part) && min && !/ajoute|retire|enleve|reduis|raccourcis/.test(part)) ops.push({ op: 'total', minutes: min });
    else if (/garde|conserve|ne touche pas|intact/.test(part)) { const t = target(phases, part); if (t.length) ops.push({ op: 'keep', idx: t }); }
    else if (/uniquement|seulement/.test(part) && /reduis|raccourcis|diminue|enleve|coupe/.test(part)) { const t = target(phases, part); if (t.length) ops.push({ op: 'only', idx: t }); }
    else if (/retire|supprime|enleve|sans\b/.test(part) && !min) { const t = target(phases, part); if (t.length) ops.push({ op: 'remove', idx: t }); }
    else if (/ajoute|rajoute|mets/.test(part) && min) {
      const role = Object.entries(ROLE_WORDS).find(([, ws]) => ws.some((w) => part.includes(w)))?.[0] || 'technique';
      ops.push({ op: 'add', minutes: min, role });
    } else if (/moins intense|plus leger|plus doux|reduis l intensite|baisse l intensite/.test(part)) ops.push({ op: 'intensity', dir: -1, idx: target(phases, part) });
    else if (/plus intense|plus dur|augmente l intensite/.test(part)) ops.push({ op: 'intensity', dir: 1, idx: target(phases, part) });
    else if (/(reduis|raccourcis|diminue)/.test(part) && min) { const t = target(phases, part); if (t.length) ops.push({ op: 'shorten', idx: t, minutes: min }); }
  }
  return ops;
}
/** Opérations venues de l'IA du serveur : seules les formes connues sont gardées, indices bornés. */
export function cleanOps(raw, n) {
  const ok = { total: 1, keep: 1, only: 1, remove: 1, add: 1, intensity: 1, shorten: 1 }, idx = (a) => (Array.isArray(a) ? [...new Set(a.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n))] : []);
  return (Array.isArray(raw) ? raw : []).slice(0, 8).filter((o) => o && ok[o.op]).map((o) => ({ op: o.op, idx: idx(o.idx), minutes: Math.max(0, Math.min(600, Math.round(Number(o.minutes) || 0))), role: ROLES[o.role] ? o.role : 'technique', dir: o.dir === 1 ? 1 : -1 }))
    .filter((o) => (['keep', 'only', 'remove', 'shorten'].includes(o.op) ? o.idx.length : true) && (['total', 'add', 'shorten'].includes(o.op) ? o.minutes > 0 : true));
}

const STEPS = ['easy', 'mod', 'hard', 'max'];
/**
 * Construit le plan (sans rien appliquer). Retourne { phases, changes, unchanged, why, consequences, tradeoffs,
 * blocked, understood }.
 */
export function planEdit(phasesIn, ops, o = {}) {
  let phases = normalizePhases(phasesIn).map((p) => ({ ...p, locks: { ...p.locks } }));
  const names = phases.map(phaseName), changes = [], why = [], tradeoffs = [], blocked = [];
  const protectedIdx = new Set(ops.filter((x) => x.op === 'keep').flatMap((x) => x.idx));
  for (const i of protectedIdx) { phases[i].locks.minutes = 'user'; phases[i].locks.intensity = 'user'; phases[i].locks.exercises = 'user'; why.push(`« ${names[i]} » gardée exactement, comme demandé.`); }
  const onlyIdx = ops.filter((x) => x.op === 'only').flatMap((x) => x.idx);
  for (const op of ops) {
    if (op.op === 'remove') for (const i of op.idx.sort((a, b) => b - a)) {
      if (Object.values(phases[i].locks).includes('user') || protectedIdx.has(i)) { blocked.push(`« ${names[i]} » est verrouillée : elle n’est pas retirée.`); continue; }
      changes.push(`Retirer « ${names[i]} » (${phases[i].minutes} min)`); tradeoffs.push(`Ce que travaillait « ${names[i]} » disparaît de la séance.`); phases[i] = null;
    }
    if (op.op === 'add') {
      const np = normalizePhase({ type: op.role === 'pause' ? 'pause' : 'main', role: op.role, minutes: op.minutes, activity: o.sport || phases.find((p) => p?.activity)?.activity || '' }, phases.length);
      np.id = `edit-${phases.length + 1}`; const at = phases.findIndex((p) => p && (p.type === 'cool' || p.role === 'cool'));
      phases.splice(at >= 0 ? at : phases.length, 0, np); changes.push(`Ajouter ${op.minutes} min de ${ROLES[op.role][1].toLowerCase()}`); why.push('Ajout demandé.');
    }
    if (op.op === 'intensity') for (const i of (op.idx.length ? op.idx : phases.map((_, k) => k)).filter((k) => phases[k] && phases[k].type !== 'pause')) {
      const p = phases[i]; if (p.locks.intensity === 'user') { if (op.idx.length) blocked.push(`L’intensité de « ${names[i]} » est verrouillée.`); continue; }
      const k = STEPS.indexOf(p.intensity), nk = Math.max(0, Math.min(3, k + op.dir)); if (nk === k) continue;
      changes.push(`« ${names[i]} » : intensité ${p.intensity} → ${STEPS[nk]}`); p.intensity = STEPS[nk];
      tradeoffs.push(op.dir < 0 ? `Moins de stimulation sur « ${names[i]} ».` : `Plus de fatigue sur « ${names[i]} ».`);
    }
    if (op.op === 'shorten') for (const i of op.idx) { const p = phases[i]; if (!p) continue; if (p.locks.minutes === 'user') { blocked.push(`La durée de « ${names[i]} » est verrouillée.`); continue; } const m = Math.max(5, p.minutes - op.minutes); changes.push(`« ${names[i]} » : ${p.minutes} → ${m} min`); p.minutes = m; }
  }
  phases = phases.filter(Boolean);
  const total = ops.find((x) => x.op === 'total');
  if (total) {
    // Seules les phases autorisées bougent : celles désignées par « uniquement », sinon toutes sauf les verrouillées.
    const movable = new Set(onlyIdx.length ? onlyIdx.map((i) => phasesIn[i]?.id) : phases.map((p) => p.id));
    const list = phases.map((p) => (movable.has(p.id) ? p : { ...p, locks: { ...p.locks, minutes: 'user' } }));
    const r = fitDurations(list, total.minutes);
    if (!r.ok) blocked.push(r.error || `Impossible de tenir en ${total.minutes} min avec ce qui est verrouillé ou gardé.`);
    else {
      r.phases.forEach((p, k) => { const was = phases[k]; if (was.minutes !== p.minutes) changes.push(`« ${phaseName(was)} » : ${was.minutes} → ${p.minutes} min`); });
      phases = r.phases.map((p, k) => ({ ...p, locks: phases[k].locks }));
      why.push(`Tu as ${total.minutes} min : ${onlyIdx.length ? 'seules les phases désignées sont raccourcies' : 'le temps est réparti sur les phases non verrouillées'}.`);
      tradeoffs.push('Moins de volume sur les phases raccourcies.');
    }
  }
  const unchanged = phases.filter((p) => !changes.some((c) => c.includes(`« ${phaseName(p)} »`))).map((p) => `« ${phaseName(p)} » (${p.minutes} min)`);
  const before = metrics(phasesIn), after = metrics(phases);
  const consequences = [before.minutes !== after.minutes ? `Durée : ${before.minutes} → ${after.minutes} min` : '', before.load !== after.load ? `Charge estimée : ${before.load} → ${after.load}` : '', ...after.alerts.filter((a) => !before.alerts.includes(a)).map((a) => `⚠️ ${a}`)].filter(Boolean);
  return { phases, changes, unchanged, why, consequences, tradeoffs: [...new Set(tradeoffs)], blocked, understood: ops.length > 0 };
}
export { simulate };
