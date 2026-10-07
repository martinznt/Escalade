// sports.js — outils par sport (sans DOM, testés) :
//  · escalade : statistiques de style (à vue, flash, après travail, réussite par style de mouvement), score de
//    compétition (tops / zones / essais), générateur de blocs sur un pan photographié, entraînement ciblé selon
//    l'endroit où l'on tombe, conditions en falaise d'après la météo, échauffement des doigts avant un effort intense ;
//  · musculation : disques à mettre de chaque côté, charge maximale estimée (1RM) et tableau des pourcentages ;
//  · course : prévisions de temps (Riegel) et allures d'entraînement à partir de la VMA ;
//  · natation : compteur de longueurs (distance, temps aux 100 m) ;
//  · import d'une activité GPX ou TCX (montre, appli de course) ; lecture des mesures d'un dynamomètre Bluetooth.
import { SENT } from './climb.js';
import { normalizeEx, uid } from './shared.js';

const r1 = (x) => Math.round(x * 10) / 10, fr = (x) => String(r1(x)).replace('.', ',');
const isSent = (r) => SENT.has(r) || r === 'onsight';

/* ═════════ Escalade ═════════ */
export const RESULT_FR = { onsight: 'à vue', flash: 'flash', send: 'réussi', work: 'après travail', top: 'top', attempt: 'essai', fail: 'pas encore' };
/** Styles : part des réussites au premier essai (à vue + flash), réussite par style de mouvement (3 essais au moins). */
export function styleStats(ascents = [], styles = {}, { kind = '', since = 0 } = {}) {
  const list = ascents.filter((a) => (!kind || a.kind === kind) && (a.date || 0) >= since), sent = list.filter((a) => isSent(a.result));
  const byResult = {}; for (const a of sent) byResult[a.result] = (byResult[a.result] || 0) + 1;
  const by = {};
  for (const a of list) for (const id of a.styles || []) { const s = (by[id] ||= { id, label: styles[id]?.label || id, tries: 0, sends: 0 }); s.tries++; if (isSent(a.result)) s.sends++; }
  const rows = Object.values(by).filter((s) => s.tries >= 3).map((s) => ({ ...s, rate: Math.round((100 * s.sends) / s.tries) })).sort((a, b) => b.rate - a.rate || b.tries - a.tries);
  const first = (byResult.onsight || 0) + (byResult.flash || 0);
  return { total: list.length, sent: sent.length, firstTry: sent.length ? Math.round((100 * first) / sent.length) : null, byResult, rows,
    strong: rows.length >= 2 && rows[0].rate >= 60 ? rows[0] : null, weak: rows.length >= 2 && rows.at(-1).rate < 50 ? rows.at(-1) : null };
}
/** Compétition de bloc : tops, zones, essais pour les tops et pour les zones (classement « 3T4Z 5 7 »). */
export function compScore(problems = []) {
  let tops = 0, zones = 0, ta = 0, za = 0;
  for (const p of problems) {
    const t = Math.max(0, Math.round(Number(p?.top) || 0)), z = Math.max(0, Math.round(Number(p?.zone) || 0));
    if (t) { tops++; ta += t; }
    if (z || t) { zones++; za += z || t; }
  }
  return { tops, zones, topAttempts: ta, zoneAttempts: za, text: `${tops}T${zones}Z ${ta} ${za}` };
}
const rng = (seed) => { let a = (Number(seed) || 1) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const BOARD_LEVELS = { facile: { reach: 0.24, gap: 0.04, label: 'Facile : prises proches' }, moyen: { reach: 0.32, gap: 0.08, label: 'Moyen' }, dur: { reach: 0.42, gap: 0.13, label: 'Dur : grands mouvements' } };
/**
 * Bloc tiré au hasard sur un pan photographié : prises marquées (x, y entre 0 et 1, y vers le bas). Départ parmi les
 * prises basses, puis des prises de plus en plus hautes, à portée (selon le niveau), jusqu'en haut du pan.
 * Retourne { start, moves: [indices], top, feet: [indices], level } ou null si aucun bloc n'est possible.
 */
export function boardProblem(holds = [], { level = 'moyen', seed = 1 } = {}) {
  const L = BOARD_LEVELS[level] || BOARD_LEVELS.moyen, R = rng(seed);
  const pts = holds.map((h, i) => ({ x: Number(h.x), y: Number(h.y), i })).filter((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  if (pts.length < 5) return null;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), lowY = Math.max(...pts.map((p) => p.y)), topY = Math.min(...pts.map((p) => p.y));
  for (let attempt = 0; attempt < 30; attempt++) {
    const starts = pts.filter((p) => p.y >= lowY - 0.25 && p.y > topY + 0.3), start = starts[Math.floor(R() * starts.length)];
    if (!start) return null;
    const seq = [start];
    let cur = start;
    while (cur.y - topY > 0.08 && seq.length < 15) {
      const cand = pts.filter((p) => !seq.includes(p) && p.y < cur.y - L.gap * 0.5 && d(p, cur) <= L.reach && d(p, cur) >= L.gap);
      if (!cand.length) break;
      const w = cand.map((p) => (cur.y - p.y) + R() * 0.12), k = w.indexOf(Math.max(...w));
      cur = cand[k]; seq.push(cur);
    }
    if (cur.y - topY <= 0.12 && seq.length >= 3) {
      const used = new Set(seq.map((p) => p.i)), feet = pts.filter((p) => !used.has(p.i) && p.y > start.y && p.y - start.y < 0.3 && Math.abs(p.x - start.x) < 0.3).sort((a, b) => a.y - b.y).slice(0, 2).map((p) => p.i);
      return { start: start.i, moves: seq.slice(1, -1).map((p) => p.i), top: cur.i, feet, level, n: seq.length };
    }
  }
  return null;
}
/** Où l'on tombe → quoi travailler (repères). Chaque raison donne des capacités ciblées et un conseil. */
export const FALL_WHY = {
  force: ['💪', 'Force (bloquer, tirer)', { blocage: 1, tirage_vertical: 0.8 }, 'Blocages et tractions lourdes 2 fois par semaine ; refais le mouvement en isolé.'],
  doigts: ['✋', 'Doigts (prises trop petites)', { force_doigts: 1 }, 'Suspensions max (10 s) sur une réglette exigeante ; garde 48 h entre deux séances de doigts intenses.'],
  resistance: ['🔋', 'Résistance (« les bras qui gonflent »)', { endurance_doigts: 1 }, 'Séances 4 × 4 ou enchaînements longs ; repère où te reposer (mains, pieds) avant la section.'],
  technique: ['🎯', 'Technique (pieds, placement)', { technique_pieds: 1, technique_escalade: 0.8 }, 'Refais la section en la décomposant ; travaille les pieds silencieux et le placement de hanche.'],
  peur: ['😨', 'Peur (chute, hauteur)', { technique_escalade: 0.5 }, 'Chutes volontaires progressives (avec un assureur expérimenté) ; respire et grimpe en tête par petites étapes.'],
  lecture: ['👀', 'Lecture (méthode pas trouvée)', { technique_escalade: 1, coordination: 0.6 }, 'Lis la voie au sol, mime les mouvements ; regarde d’autres grimpeurs la faire ; essaie 2 méthodes.'],
};
export function fallTraining(reasons = []) {
  const caps = {}, tips = [];
  for (const r of reasons) { const f = FALL_WHY[r]; if (!f) continue; for (const [c, w] of Object.entries(f[2])) caps[c] = Math.max(caps[c] || 0, w); tips.push(`${f[0]} ${f[3]}`); }
  return { caps, tips };
}
/**
 * Conditions en falaise, demi-journée par demi-journée (matin 8–12 h, après-midi 13–18 h), d'après la météo :
 * pluie pendant ou dans les 24 h avant → rocher sûrement humide ; température idéale pour l'adhérence entre 3 et
 * 16 °C ; humidité basse ; un peu de vent sèche le rocher, trop de vent gêne. Repères, à confirmer sur place.
 * hourly = { time: ['AAAA-MM-JJTHH:MM'], temperature_2m, relative_humidity_2m, precipitation, wind_speed_10m }.
 */
export function cragConditions(hourly, now = Date.now()) {
  const T = hourly?.time || [], out = [];
  if (!T.length) return out;
  const idx = (t) => T.indexOf(t), v = (k, i) => Number(hourly[k]?.[i]);
  const days = [...new Set(T.map((t) => t.slice(0, 10)))], today = new Date(now), todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (const day of days.filter((x) => x >= todayKey).slice(0, 3)) {
    for (const [name, a, b] of [['matin', 8, 12], ['après-midi', 13, 18]]) {
      const hrs = []; for (let hh = a; hh <= b; hh++) { const i = idx(`${day}T${String(hh).padStart(2, '0')}:00`); if (i >= 0) hrs.push(i); }
      if (!hrs.length) continue;
      const before = []; for (let k = Math.max(0, hrs[0] - 24); k < hrs[0]; k++) before.push(k);
      const rainBefore = before.reduce((t, k) => t + (v('precipitation', k) || 0), 0), rainDuring = hrs.reduce((t, k) => t + (v('precipitation', k) || 0), 0);
      const temp = hrs.reduce((t, k) => t + v('temperature_2m', k), 0) / hrs.length, hum = hrs.reduce((t, k) => t + v('relative_humidity_2m', k), 0) / hrs.length, wind = Math.max(...hrs.map((k) => v('wind_speed_10m', k) || 0));
      let score = 2; const why = [];
      if (rainDuring >= 0.3) { score = 0; why.push(`pluie prévue (${fr(rainDuring)} mm)`); }
      else if (rainBefore >= 1) { score = Math.min(score, 0); why.push(`pluie dans les 24 h avant (${fr(rainBefore)} mm) : rocher sûrement humide`); }
      if (temp > 25) { score = Math.min(score, 0); why.push(`chaud (${Math.round(temp)} °C) : ça glisse`); } else if (temp > 16) { score = Math.min(score, 1); why.push(`doux (${Math.round(temp)} °C)`); } else if (temp < 0) { score = Math.min(score, 0); why.push(`gel (${Math.round(temp)} °C)`); } else if (temp < 3) { score = Math.min(score, 1); why.push(`froid (${Math.round(temp)} °C)`); } else why.push(`${Math.round(temp)} °C, bonne adhérence`);
      if (hum > 80) { score = Math.min(score, 0); why.push(`très humide (${Math.round(hum)} %)`); } else if (hum > 65) { score = Math.min(score, 1); why.push(`humide (${Math.round(hum)} %)`); }
      if (wind > 40) { score = Math.min(score, 1); why.push(`vent fort (${Math.round(wind)} km/h)`); } else if (wind >= 10 && score > 0) why.push('un peu de vent : ça sèche');
      out.push({ day, slot: name, score, emoji: ['👎', '😐', '👍'][score], text: why.join(', ') });
    }
  }
  return out;
}
/** Échauffement des doigts ajouté avant le premier exercice de doigts intense, s'il n'y en a pas déjà un. */
export const FINGER_WARM = { libId: 'wu-fingers', name: 'Échauffement des doigts (progressif)', emoji: '🖐️', block: 'warmup', group: 'doigts', mode: 'time', sets: 4, secMin: 10, secMax: 10, rest: 30, intensity: 'low',
  ok: ['Grosse prise, pieds au sol ou sur une chaise : 10 s à environ 50 % de ton effort, puis 60, 70 et 80 %.', 'Main ouverte ou semi-arquée : jamais arquée à fond pendant l’échauffement.', '30 s de pause entre chaque, secoue les mains.'],
  bad: ['Passer directement sur une petite réglette à froid.'] };
export function withFingerWarm(exercises = [], lib = () => null) {
  const intense = (e) => { const l = lib(e.libId) || {}; return (e.block || 'main') === 'main' && ((e.risk || l.risk) === 'finger' && (e.intensity || l.intensity) === 'high' || /suspension|campus|max hang|réglette/i.test(e.name || '') && (e.intensity || l.intensity) === 'high'); };
  const k = exercises.findIndex(intense);
  if (k < 0 || exercises.slice(0, k).some((e) => e.libId === 'wu-fingers' || (e.group === 'doigts' && /chauff/i.test(e.name || '') && (e.block === 'warmup' || /progress/i.test(e.name || ''))))) return { exercises, added: false };
  return { exercises: [...exercises.slice(0, k), normalizeEx({ ...FINGER_WARM, id: uid() }), ...exercises.slice(k)], added: true, before: exercises[k].name };
}

/* ═════════ Musculation ═════════ */
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
/** Disques de chaque côté de la barre pour une charge totale. */
export function plates(total, { bar = 20, available = PLATES } = {}) {
  const t = Number(total) || 0;
  if (t < bar) return { ok: false, perSide: [], rest: 0, text: `Moins que la barre seule (${fr(bar)} kg)` };
  let rest = Math.round(((t - bar) / 2) * 100) / 100; const out = [];
  for (const p of [...available].sort((a, b) => b - a)) while (rest + 1e-9 >= p && out.length < 20) { out.push(p); rest = Math.round((rest - p) * 100) / 100; }
  return { ok: rest < 0.01, perSide: out, rest, text: out.length ? `${out.map(fr).join(' + ')} kg de chaque côté` : 'barre seule' };
}
/** Charge maximale estimée sur 1 répétition (moyenne Epley / Brzycki), fiable jusqu'à ~10 répétitions. */
export function oneRM(load, reps) {
  const w = Number(load), n = Math.round(Number(reps));
  if (!(w > 0) || !(n >= 1) || n > 12) return null;
  if (n === 1) return w;
  return Math.round((((w * (1 + n / 30)) + (w * 36) / (37 - n)) / 2) * 2) / 2;
}
/** Pourcentages de la charge max et répétitions possibles en moyenne (repères). */
export const PCT_REPS = [[100, 1], [95, 2], [90, 4], [85, 6], [80, 8], [75, 10], [70, 12], [65, 15]];
export const percentTable = (rm) => PCT_REPS.map(([p, n]) => ({ pct: p, reps: n, kg: Math.round((rm * p) / 100 * 2) / 2 }));
/** Meilleure charge max estimée d'un exercice dans l'historique (180 derniers jours). */
export function best1RM(history = [], name = '', now = Date.now()) {
  let best = null;
  const k = String(name).toLowerCase();
  for (const h of history) {
    if (now - (h.startedAt || 0) > 180 * 86400000) continue;
    for (const e of h.data?.exercises || []) if (String(e.name || '').toLowerCase() === k) for (const s of e.sets || []) { const v = oneRM(s.load, s.reps); if (v && (!best || v > best.rm)) best = { rm: v, load: s.load, reps: s.reps, date: h.startedAt }; }
  }
  return best;
}
/** Exercices avec charge de l'historique, et leur meilleure charge max estimée. */
export function strengthBoard(history = [], now = Date.now()) {
  const names = new Set(); for (const h of history) for (const e of h.data?.exercises || []) if ((e.sets || []).some((s) => Number(s.load) > 0 && Number(s.reps) > 0)) names.add(e.name);
  return [...names].map((n) => ({ name: n, ...best1RM(history, n, now) })).filter((x) => x.rm).sort((a, b) => b.rm - a.rm).slice(0, 12);
}

/* ═════════ Course ═════════ */
/** Temps prévu sur une autre distance (Riegel : T2 = T1 × (D2 / D1)^1,06). */
export const riegel = (t1Sec, d1Km, d2Km, k = 1.06) => t1Sec * Math.pow(d2Km / d1Km, k);
export const RACES = [[5, '5 km'], [10, '10 km'], [21.0975, 'Semi-marathon'], [42.195, 'Marathon']];
export const fmtTime = (sec) => { const s = Math.round(sec), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return hh ? `${hh} h ${String(mm).padStart(2, '0')}` : `${mm} min ${String(ss).padStart(2, '0')}`; };
export const fmtPace = (minPerKm) => { let m = Math.floor(minPerKm), s = Math.round((minPerKm - m) * 60); if (s === 60) { m++; s = 0; } return `${m}'${String(s).padStart(2, '0')} /km`; };
export function racePredictions(t1Sec, d1Km) {
  if (!(t1Sec > 0) || !(d1Km > 0)) return [];
  return RACES.map(([d, label]) => { const t = riegel(t1Sec, d1Km, d); return { d, label, sec: t, time: fmtTime(t), pace: fmtPace(t / 60 / d) }; });
}
/** Allures d'entraînement depuis la VMA (km/h) : endurance fondamentale, seuil, VMA (fractionné). */
export function vmaPaces(vma) {
  const v = Number(vma); if (!(v >= 6 && v <= 30)) return null;
  const p = (pct) => fmtPace(60 / (v * pct));
  return [['🟢 Endurance fondamentale', '65–75 % VMA', `${p(0.75)} à ${p(0.65)}`, 'Tu peux parler en courant : la base de tout.'], ['🟠 Seuil', '85–90 % VMA', `${p(0.9)} à ${p(0.85)}`, 'Soutenu mais tenable 20 à 40 min.'], ['🔴 VMA', '95–105 % VMA', `${p(1.05)} à ${p(0.95)}`, 'Fractionné court : 30/30, 200 à 400 m.']];
}

/* ═════════ Natation ═════════ */
/** Compteur de longueurs : taps = instants (ms) de fin de chaque longueur ; start = départ. */
export function laps(taps = [], { pool = 25, start } = {}) {
  const t = [...taps].sort((a, b) => a - b), n = t.length, dist = n * pool, t0 = Number.isFinite(start) ? start : t[0], total = n ? (t.at(-1) - t0) / 1000 : 0;
  const per100 = dist ? total / (dist / 100) : null, k = Math.max(1, Math.round(100 / pool));
  const last100 = n >= k ? (t.at(-1) - (n > k ? t[n - k - 1] : t0)) / 1000 : null;
  return { lengths: n, distance: dist, totalSec: Math.round(total), per100: per100 ? Math.round(per100) : null, last100: last100 ? Math.round(last100) : null };
}

/* ═════════ Import GPX / TCX ═════════ */
const hav = (a, b) => { const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180, x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, x)))); };
const tag = (s, name) => { const m = s.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([^<]*)</(?:\\w+:)?${name}>`, 'i')); return m ? m[1].trim() : ''; };
const trackNumber = (value) => { if (value == null || String(value).trim() === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
/** Lit un fichier GPX ou TCX (texte) : sport, départ, durée, distance, dénivelé positif, fréquence cardiaque. */
export function parseTrack(text) {
  const s = String(text || ''); if (s.length > 25e6) return null;
  const tcx = /<(?:\w+:)?TrainingCenterDatabase\b/i.test(s), pts = [];
  const re = tcx ? /<(?:\w+:)?Trackpoint\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Trackpoint>/gi : /<(?:\w+:)?trkpt\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?trkpt>/gi;
  const boundaries = [...s.matchAll(tcx ? /<\/?(?:\w+:)?Track\b[^>]*>/gi : /<\/?(?:\w+:)?(?:trk|trkseg)\b[^>]*>/gi)].map((m) => m.index);
  let segment = 0;
  for (const m of s.matchAll(re)) {
    if (pts.length >= 200000) return null;
    while (segment < boundaries.length && boundaries[segment] < m.index) segment++;
    const body = tcx ? m[1] : m[2], attrs = tcx ? '' : m[1];
    const lat = trackNumber(tcx ? tag(body, 'LatitudeDegrees') : (attrs.match(/\blat=['"]([-\d.]+)['"]/i) || [])[1]), lon = trackNumber(tcx ? tag(body, 'LongitudeDegrees') : (attrs.match(/\blon=['"]([-\d.]+)['"]/i) || [])[1]);
    const time = Date.parse(tag(body, tcx ? 'Time' : 'time')), ele = trackNumber(tag(body, tcx ? 'AltitudeMeters' : 'ele'));
    const hrBlock = tcx ? (body.match(/<(?:\w+:)?HeartRateBpm\b[^>]*>([\s\S]*?)<\/(?:\w+:)?HeartRateBpm>/i) || [])[1] : '';
    const hr = trackNumber(tcx ? tag(hrBlock || '', 'Value') : tag(body, 'hr')), dm = tcx ? trackNumber(tag(body, 'DistanceMeters')) : null;
    pts.push({ segment, lat: lat != null && Math.abs(lat) <= 90 ? lat : null, lon: lon != null && Math.abs(lon) <= 180 ? lon : null, time: Number.isFinite(time) ? time : null, ele, hr: hr > 20 && hr < 250 ? hr : null, dm: dm != null && dm >= 0 ? dm : null });
  }
  const timed = pts.filter((p) => p.time != null);
  if (!timed.length) return null;
  let km = 0, distanceKnown = false; for (let i = 1; i < pts.length; i++) if (pts[i].segment === pts[i - 1].segment && [pts[i].lat, pts[i].lon, pts[i - 1].lat, pts[i - 1].lon].every((v) => v != null)) { km += hav(pts[i - 1], pts[i]); distanceKnown = true; }
  const lastDm = [...pts].reverse().find((p) => p.dm != null)?.dm; if (lastDm != null) { km = lastDm / 1000; distanceKnown = true; }
  let gain = 0, ref = null, elevationPairs = 0, elevationSegment = -1; for (const p of pts) { if (p.segment !== elevationSegment) { ref = null; elevationSegment = p.segment; } if (p.ele == null) continue; if (ref == null) ref = p.ele; else { elevationPairs++; if (p.ele - ref >= 3) { gain += p.ele - ref; ref = p.ele; } else if (ref - p.ele >= 3) ref = p.ele; } }
  const hrs = pts.map((p) => p.hr).filter(Boolean), sport = tcx ? ((s.match(/<(?:\w+:)?Activity\b[^>]*\bSport=['"]([^'"]+)['"]/i) || [])[1] || '') : tag(s, 'type');
  const start = timed[0].time, dur = Math.round((timed.at(-1).time - start) / 1000);
  const name = tag(s, 'name').slice(0, 80);
  return { sport: String(sport).toLowerCase(), start, durationSec: dur, distanceKm: distanceKnown ? Math.round(km * 100) / 100 : null, gain: elevationPairs ? Math.round(gain) : null, hrAvg: hrs.length ? Math.round(hrs.reduce((t, x) => t + x, 0) / hrs.length) : null, hrMax: hrs.length ? hrs.reduce((a, b) => Math.max(a, b), 0) : null, points: pts.length, name, pace: distanceKnown && km > 0.2 ? fmtPace(dur / 60 / km) : '' };
}
/** Identifiant propre au compte : réimporter le même fichier ne crée pas une seconde séance. */
export async function trackImportId(text, owner) {
  if (!globalThis.crypto?.subtle || !owner) throw new Error('Impossible de préparer cet import sur cet appareil.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${owner}\n${String(text || '')}`));
  return 'file-' + [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('').slice(0, 58);
}
export async function trackFingerprint(text) {
  if (!globalThis.crypto?.subtle) throw new Error('Impossible de préparer cet import sur cet appareil.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
/** Sport de l'app d'après le fichier (course, natation…), sinon d'après l'allure. */
export function trackActivity(t) {
  if (/boulder|bloc/.test(t.sport)) return 'climbing_boulder';
  if (/climb|escalade/.test(t.sport)) return 'climbing_route';
  if (/run|course|jog|trail/.test(t.sport)) return 'running';
  if (/swim|nata/.test(t.sport)) return 'swimming';
  if (/bik|cycl|vélo|velo/.test(t.sport)) return 'conditioning';
  const pace = t.distanceKm ? t.durationSec / 60 / t.distanceKm : 0;
  return pace >= 3 && pace <= 12 ? 'running' : 'conditioning';
}

/* ═════════ Dynamomètre Bluetooth (Tindeq Progressor) — expérimental ═════════ */
// Protocole publié (client libre « Tindeq-Progressor-API ») : commandes d'un octet sur la caractéristique de contrôle,
// mesures notifiées : code 1, longueur, puis paquets de 8 octets (poids float32 kg, horodatage uint32 µs, petit-boutiste).
export const TINDEQ = { service: '7e4e1701-1ea6-40c9-9dcc-13d34ffead57', data: '7e4e1702-1ea6-40c9-9dcc-13d34ffead57', control: '7e4e1703-1ea6-40c9-9dcc-13d34ffead57', TARE: 100, START: 101, STOP: 102, BATTERY: 111, RES_WEIGHT: 1 };
export function parseTindeq(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes?.buffer ? bytes.buffer.slice(bytes.byteOffset || 0, (bytes.byteOffset || 0) + bytes.byteLength) : bytes || []);
  if (u.length < 2 || u[0] !== TINDEQ.RES_WEIGHT) return [];
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = [];
  for (let i = 2; i + 8 <= u.length; i += 8) { const kg = dv.getFloat32(i, true), us = dv.getUint32(i + 4, true); if (Number.isFinite(kg)) out.push({ kg: Math.round(kg * 100) / 100, us }); }
  return out;
}
/** Résumé d'une traction sur le dynamomètre : pic, moyenne sur la durée tenue au-dessus de 50 % du pic. */
export function pullSummary(samples = []) {
  if (!samples.length) return null;
  const peak = Math.max(...samples.map((s) => s.kg)), held = samples.filter((s) => s.kg >= peak * 0.5);
  const dur = held.length > 1 ? (held.at(-1).us - held[0].us) / 1e6 : 0;
  return { peak: Math.round(peak * 10) / 10, avg: Math.round((held.reduce((t, s) => t + s.kg, 0) / Math.max(1, held.length)) * 10) / 10, seconds: Math.round(dur * 10) / 10 };
}
