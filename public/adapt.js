// adapt.js — « 🔁 Adapter pour cette fois » : à partir de N'IMPORTE QUELLE séance, une COPIE qui travaille les mêmes
// choses avec d'autres paramètres : durée, matériel en moins, zone douloureuse, échauffement (plus court, juste avec
// un élastique, aucun), retour au calme, intensité. La séance d'origine n'est jamais modifiée : la copie se lance
// telle quelle, ou se garde comme NOUVELLE séance. Chaque changement est dit, et ce qui reste travaillé est comparé.
// Une demande écrite (« 20 min, sans barre, j'ai mal au genou ») est lue par mots-clés. Sans DOM, testé.
import { normalizeSession, normalizeEx, uid } from './shared.js';
import { byId } from './library.js';
import { EQUIPMENT, CAPACITIES } from './model.js';
import { adaptDuration, rebuildForEquipment, alternatives, replaceExercise, zoneReasons } from './generator.js';
import { availableEquipment } from './brain.js';
import { AVOID_ZONES } from './intentions.js';

export const WARM_OPTS = [['keep', 'Comme prévu'], ['short', 'Plus court'], ['band', 'Juste avec un élastique'], ['none', 'Aucun (je suis déjà chaud)']];
export const COOL_OPTS = [['keep', 'Comme prévu'], ['short', 'Plus court'], ['none', 'Aucun']];
export const INTENSITY_OPTS = [['easier', '🌿 Plus facile'], ['same', 'Pareil'], ['harder', '🔥 Plus intense']];
const BAND_WARM = ['wu-pulse', 'wu-mob-upper', 'wu-scap-band', 'wu-mob-lower'];
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const capLabel = (c) => CAPACITIES[c]?.label || c;

/** Capacités travaillées par le corps de séance (séries × poids de la relation), pour comparer avant / après. */
export function workedCaps(session) {
  const out = {};
  for (const e of normalizeSession(session).exercises) {
    if (e.block !== 'main') continue;
    const caps = Object.keys(e.caps || {}).length ? e.caps : byId(e.libId)?.caps || {};
    for (const [c, w] of Object.entries(caps)) out[c] = (out[c] || 0) + Number(w) * Math.max(1, Number(e.sets) || 1);
  }
  return out;
}
/** Matériel utilisé par une séance. */
export const sessionNeeds = (session) => [...new Set(normalizeSession(session).exercises.flatMap((e) => (e.needs?.length ? e.needs : byId(e.libId)?.needs || [])))];

/** Lecture d'une demande écrite → réglages (ce qui n'est pas compris est simplement ignoré, et dit). */
export function parseAdapt(text) {
  const t = norm(text), o = {}, understood = [];
  if (!t.trim()) return { opts: o, understood };
  const h = t.match(/(\d+(?:[.,]\d+)?)\s*h(?:eures?)?\s*(\d{1,2})?/), m = t.match(/(\d{1,3})\s*(?:min|mn|minutes?)\b/);
  if (h) o.minutes = Math.round(Number(h[1].replace(',', '.')) * 60 + Number(h[2] || 0)); else if (m) o.minutes = Number(m[1]);
  if (o.minutes) understood.push(`${o.minutes} min`);
  const ZW = { fingers: /doigt|poulie/, shoulders: /epaule/, elbows: /coude/, wrists: /poignet/, back: /dos|lombaire|reins/, knees: /genou/, ankles: /cheville/ };
  if (/mal|douleur|bless|gene|ménag|menag|fragile/.test(t)) for (const [z, re] of Object.entries(ZW)) if (re.test(t)) { (o.zones ||= []).push(z); understood.push(`zone à ménager : ${AVOID_ZONES.find((x) => x[0] === z)?.[1] || z}`); }
  const sans = [...t.matchAll(/(?:sans|pas de|pas d|plus de|j ai pas de|je n ai pas de)\s+(?:la |le |les |l |d |de |mon |ma |mes )?([a-z -]{3,30})/g)].map((x) => x[1].trim());
  for (const w of sans) for (const [k, l] of Object.entries(EQUIPMENT)) { const L = norm(l).replace(/\s*\(.*\)/, ''); if (L.split(/[ /,]+/).some((p) => p.length >= 4 && w.startsWith(p)) || w.startsWith(norm(k))) { (o.remove ||= []).includes(k) || o.remove.push(k); } }
  if (o.remove?.length) understood.push(`sans : ${o.remove.map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase()}`);
  if (/echauffement/.test(t)) { o.warm = /elastique/.test(t) ? 'band' : /pas d echauffement|sans echauffement|aucun/.test(t) ? 'none' : /court|rapide|moins/.test(t) ? 'short' : o.warm; if (o.warm) understood.push(`échauffement : ${WARM_OPTS.find((x) => x[0] === o.warm)[1].toLowerCase()}`); }
  if (/(plus|moins) (intense|dur|difficile|facile)|plus leger|plus tranquille|a fond/.test(t)) { o.intensity = /plus (intense|dur|difficile)|a fond/.test(t) ? 'harder' : 'easier'; understood.push(o.intensity === 'harder' ? 'plus intense' : 'plus facile'); }
  if (/fatigue|creve|epuise|pas en forme/.test(t) && !o.intensity) { o.intensity = 'easier'; understood.push('plus facile (fatigue)'); }
  if (/sans retour au calme|pas de retour au calme/.test(t)) { o.cool = 'none'; understood.push('sans retour au calme'); }
  return { opts: o, understood };
}

const mkEx = (lib, block) => normalizeEx({ ...lib, id: uid(), block, libId: lib.id, ok: lib.cues, bad: lib.bad });
/**
 * Copie adaptée d'une séance. o = { minutes, remove: [matériel], zones: [zones], warm, cool, intensity, envId }.
 * Retourne { session (nouvel id, jamais l'original), changes, keeps (capacités gardées), lost, warnings }.
 */
export function adaptSession(original, o = {}, ctx) {
  const src = normalizeSession(original), changes = [], warnings = [];
  let s = normalizeSession({ ...JSON.parse(JSON.stringify(src)), id: uid(), name: `${src.name} (adaptée)`.slice(0, 80), context: { ...(src.context || {}), adaptedFrom: src.id } });
  s.exercises = s.exercises.map((e) => ({ ...e, id: uid() }));
  const level = 3;
  // 1 · Matériel en moins : chaque exercice concerné est remplacé par un autre qui travaille la même chose.
  const remove = new Set((o.remove || []).filter((k) => EQUIPMENT[k]));
  if (remove.size) {
    const eq = new Set([...availableEquipment(ctx, o.envId), ...sessionNeeds(src)].filter((k) => !remove.has(k)));
    const r = rebuildForEquipment(s, eq, ctx, level); s = r.session; changes.push(...r.changes);
  }
  // 2 · Zone douloureuse : exercices qui la chargent remplacés (ou retirés s'il n'existe rien d'équivalent sans risque).
  const zones = (o.zones || []).filter((z) => AVOID_ZONES.some((x) => x[0] === z));
  if (zones.length) {
    for (const e of [...s.exercises]) {
      const lib = byId(e.libId), why = zoneReasons(lib || e, zones); if (!why.length) continue;
      const alt = alternatives(e, ctx, { session: s, level }).find((a) => a.available && !zoneReasons(a.lib, zones).length && a.kinds.some((k) => ['capacite', 'materiel', 'facile', 'objectif'].includes(k)));
      if (alt) { s = replaceExercise(s, e.id, alt.lib.id, `${why[0]} : ${alt.reasons[0].toLowerCase()}`).session; changes.push(`« ${e.name} » → « ${alt.lib.name} » (${why[0]})`); }
      else { s = normalizeSession({ ...s, exercises: s.exercises.filter((x) => x.id !== e.id) }); changes.push(`« ${e.name} » retiré (${why[0]}, rien d’équivalent sans risque)`); }
    }
    warnings.push('Une douleur qui dure, augmente ou te réveille la nuit : arrête et demande l’avis d’un professionnel de santé. L’app ne fait pas de diagnostic.');
  }
  // 3 · Intensité.
  if (o.intensity === 'easier' || o.intensity === 'harder') {
    const up = o.intensity === 'harder';
    s.exercises = s.exercises.map((e) => {
      if (e.block !== 'main') return e;
      const x = { ...e };
      x.sets = up ? Math.min(6, (x.sets || 3) + 1) : Math.max(1, (x.sets || 3) - ((x.sets || 3) > 2 ? 1 : 0));
      x.rest = Math.round(Math.max(30, (x.rest || 60) * (up ? 0.85 : 1.25)) / 5) * 5;
      if (x.mode === 'time') { const f = up ? 1.15 : 0.8; x.secMin = Math.max(5, Math.round((x.secMin || 30) * f)); x.secMax = Math.max(x.secMin, Math.round((x.secMax || x.secMin) * f)); }
      else if (!up && x.repsMax > x.repsMin) x.repsMax = Math.max(x.repsMin, x.repsMax - 2);
      return x;
    });
    changes.push(up ? 'Plus intense : une série de plus, repos un peu plus courts, efforts chronométrés plus longs. Si tu utilises une charge, ajoute 2,5 à 5 %.' : 'Plus facile : une série de moins, repos plus longs, efforts plus courts. Garde 2 à 3 répétitions en réserve.');
  }
  // 4 · Échauffement et retour au calme.
  const warm = s.exercises.filter((e) => e.block === 'warmup'), main = s.exercises.filter((e) => e.block === 'main');
  let cool = s.exercises.filter((e) => e.block === 'cool'), w2 = warm;
  if (o.warm === 'short' && warm.length) { w2 = warm.slice(0, 2).map((e) => ({ ...e, sets: 1, secMin: e.mode === 'time' ? Math.max(30, Math.round((e.secMin || 60) / 2)) : e.secMin, secMax: e.mode === 'time' ? Math.max(30, Math.round((e.secMax || 60) / 2)) : e.secMax })); changes.push('Échauffement raccourci (2 exercices, plus courts) : commence le premier exercice plus doucement.'); }
  if (o.warm === 'band') { w2 = BAND_WARM.map((id) => byId(id)).filter((l) => l && (l.needs || []).every((n) => n === 'band')).map((l) => mkEx(l, 'warmup')); changes.push('Échauffement juste avec un élastique (et le poids du corps).'); }
  if (o.warm === 'none') { w2 = []; changes.push('Sans échauffement : seulement si tu sors d’une autre séance ; commence le premier exercice à intensité réduite.'); warnings.push('Sans échauffement, le risque de blessure augmente, surtout pour les doigts et les épaules.'); }
  if (o.cool === 'short' && cool.length) { cool = cool.slice(0, 1); changes.push('Retour au calme raccourci.'); }
  if (o.cool === 'none' && cool.length) { cool = []; changes.push('Sans retour au calme.'); }
  s = normalizeSession({ ...s, exercises: [...w2, ...main, ...cool] });
  // 5 · Durée (en dernier : c'est elle qui décide de ce qui tient).
  if (Number(o.minutes) >= 5) { const r = adaptDuration(s, Math.round(Number(o.minutes)), ctx); s = r.session; changes.push(...r.changes.filter((c) => !changes.includes(c))); }
  s = normalizeSession({ ...s, id: s.id, name: s.name, context: { ...(s.context || {}), adaptedFrom: src.id } });
  // Ce qui reste travaillé : les 4 capacités principales d'avant, et la part gardée.
  const before = workedCaps(src), after = workedCaps(s), top = Object.entries(before).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const keeps = top.filter(([c]) => (after[c] || 0) > 0).map(([c, v]) => ({ capId: c, label: capLabel(c), pct: Math.round(Math.min(150, ((after[c] || 0) / v) * 100)) }));
  const lost = top.filter(([c]) => !(after[c] > 0)).map(([c]) => capLabel(c));
  if (!changes.length) changes.push('Rien à changer avec ces réglages.');
  return { session: s, changes: [...new Set(changes)], keeps, lost, warnings };
}
