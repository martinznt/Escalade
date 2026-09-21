// engine.js — cerveau de l'app : lecture de séances collées, analyse de l'historique, générateur de séances.
// Pur JavaScript, sans DOM : testé avec Node (tests/engine.test.mjs).

import { normalizeEx, normalizeSession, uid, exKey, norm, parseKg } from './shared.js';
import { LIBRARY, FOCUS, GROUP_TARGET, GROUP_LABEL, byId } from './library.js';

const DAY = 86400000, HOUR = 3600000;
const avg = (a, b) => (a + b) / 2;

/* ═════════════ Notes de cotation ═════════════ */
export const GRADES = ['3', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C'];
export const gradeIndex = (g) => GRADES.indexOf(String(g || '').trim().toUpperCase().replace(/^(\d)([abc])/, (_, d, l) => d + l.toUpperCase()));
export const gradeAt = (i) => GRADES[Math.max(0, Math.min(GRADES.length - 1, i))];

/** 0 débutant, 1 intermédiaire, 2 avancé. Sans profil renseigné : 0 (prudence). */
export function levelFrom(settings = {}) {
  const lv = settings.level || {};
  const gi = Math.max(gradeIndex(lv.boulderMax), gradeIndex(lv.routeMax));
  if (gi < 0 && lv.years == null) return 0;
  let lvl = gi < 0 ? 1 : gi < gradeIndex('6A') ? 0 : gi < gradeIndex('6C') ? 1 : 2;
  if (lv.years != null && lv.years !== '') {
    const y = Number(lv.years);
    if (y < 1) lvl = 0; else if (y < 2) lvl = Math.min(lvl, 1);
  }
  return lvl;
}

/* ═════════════ Muscles → zones du corps ═════════════ */
export const REGIONS = {
  quads: 'Quadriceps', glutes: 'Fessiers', hamstrings: 'Ischio-jambiers', calves: 'Mollets', adductors: 'Adducteurs', core: 'Abdos',
  lowback: 'Bas du dos', lats: 'Grand dorsal', upback: 'Haut du dos', shoulders: 'Épaules', chest: 'Pectoraux', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras & doigts',
};
const REGION_RULES = [
  ['lowback', /bas du dos|lombaire/], ['quads', /quadriceps|quads|cuisse/], ['glutes', /fessier|glute|hanche/], ['hamstrings', /ischio/],
  ['calves', /mollet|cheville/], ['adductors', /adducteur/], ['core', /abdo|gainage|tronc|core|oblique|psoas|transverse/],
  ['lats', /dorsal|grand dorsal/], ['upback', /trapeze|omoplate|rhomboide|haut du dos|arriere des epaules/], ['biceps', /biceps/], ['triceps', /triceps/],
  ['chest', /pectora|pecs/], ['shoulders', /epaule|deltoide|coiffe/], ['forearms', /avant-bras|doigt|poignet|prise|grip|extenseur|flechisseur/],
];
export function regionsFor(text) {
  const t = norm(text);
  const out = new Set();
  for (const [id, re] of REGION_RULES) if (re.test(t)) out.add(id);
  if (/\bdos\b/.test(t) && !out.has('lowback')) { out.add('lats'); out.add('upback'); }
  return [...out];
}

/* ═════════════ Reconnaissance d'un exercice ═════════════ */
export function matchLibrary(name) {
  const k = exKey(name);
  if (!k) return null;
  let best = null;
  for (const x of LIBRARY) {
    const lk = exKey(x.name);
    if (lk === k) return x;
    if (k.length >= 5 && (k.startsWith(lk) || lk.startsWith(k)) && (!best || lk.length > exKey(best.name).length)) best = x;
  }
  return best;
}

/** Métadonnées d'un exercice enregistré : groupe, intensité, zone à risque. */
export function exMeta(ex) {
  const lib = (ex.libId && byId(ex.libId)) || matchLibrary(ex.name);
  const n = norm(ex.name);
  let group = ex.group || lib?.group || '';
  if (!group) {
    const r = regionsFor([...(ex.muscles || []), ex.name].join(' '));
    group = r.some((x) => ['lats', 'upback', 'biceps'].includes(x)) ? 'tirer'
      : r.some((x) => ['chest', 'triceps'].includes(x)) ? 'pousser'
        : r.some((x) => ['quads', 'glutes', 'hamstrings', 'calves', 'adductors'].includes(x)) ? 'jambes'
          : r.some((x) => ['core', 'lowback'].includes(x)) ? 'gainage'
            : r.includes('forearms') ? 'doigts' : r.includes('shoulders') ? 'epaules' : '';
  }
  const fingerName = /suspension|poutre|campus|reglette|hangboard/.test(n);
  const risk = ex.risk || lib?.risk || (fingerName ? 'finger' : '');
  const intensity = ex.intensity || lib?.intensity || (fingerName ? 'high' : '');
  return { group, risk, intensity, regions: regionsFor([...(ex.muscles || lib?.muscles || []), ex.name].join(' ')) };
}

/* ═════════════ Durées ═════════════ */
export function exMinutes(ex) {
  const side = ex.perSide ? 2 : 1;
  let work;
  if (ex.mode === 'time') work = avg(ex.secMin, ex.secMax);
  else {
    const reps = avg(ex.repsMin, ex.repsMax);
    const per = /bloc|voie|essai|passage/i.test(ex.unit) ? 75 : /lancer|mouvement|tenue|lettre/i.test(ex.unit) ? 5 : 3.5;
    work = reps * per;
  }
  const seconds = ex.sets * (work * side + 15) + Math.max(0, ex.sets - 1) * ex.rest;
  return seconds / 60;
}
export const sessionMinutes = (s) => Math.round(s.exercises.reduce((t, e) => t + exMinutes(e), 0));

/* ═════════════ Lecture d'une séance collée en texte ═════════════ */

const EMOJI_START = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Extended_Pictographic})*)\s*/u;
const stripEmoji = (t) => t.replace(/^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+/u, '').trim();

function sentenceCase(t) {
  t = t.trim().replace(/\s+/g, ' ');
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  if (letters.length > 3 && upper / letters.length > 0.6) t = t.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function parseRest(text) {
  const t = norm(text).replace(/[’']/g, '').trim();
  // Formats compacts courants : 2:30, 1:05, 45:00.
  let m = t.match(/^(?:repos\s*:?[\s]*)?(\d+)\s*:\s*(\d{1,2})$/);
  if (m) {
    const sec = Number(m[2]);
    if (sec < 60) return Number(m[1]) * 60 + sec;
  }
  // Une plage de repos (« 30–45 s ») devient la valeur médiane : le format
  // historique du moteur ne stocke qu'une valeur, et cette valeur reste stable.
  m = t.match(/(\d+)\s*(?:-|–|à)\s*(\d+)\s*(?:s|sec|secondes?|min|minutes?|m)\b/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    const unit = /min|minutes?|m\b/.test(m[0]) ? 60 : 1;
    return Math.round(((a + b) / 2) * unit);
  }
  m = t.match(/(\d+)\s*(?:min|minutes?|m)\b\s*(?:(\d+)\s*(?:s|sec|secondes?)?)?/);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  m = t.match(/(\d+)\s*(?:s|sec|secondes?)\b/);
  if (m) return Number(m[1]);
  m = t.match(/^\D*(\d+)\D*$/);
  if (m) return Number(m[1]) <= 10 ? Number(m[1]) * 60 : Number(m[1]);
  return null;
}

const RE_SETS = /(\d+)\s*[x×*]\s*(\d+)(?:\s*(?:[–-]|à)\s*(\d+))?\s*(secondes?|sec|s|minutes?|min)?\b\s*(.*)$/i;
const RE_SETS2 = /(\d+)\s*s[ée]ries?\s*(?:de|×|x)\s*(\d+)(?:\s*(?:[–-]|à)\s*(\d+))?\s*(secondes?|sec|s|minutes?|min|r[ée]p[ée]titions?|reps?)?\b\s*(.*)$/i;
const RE_SIDE = /par\s+(jambe|c[oô]t[ée]|bras|main|pied)|chaque\s+(c[oô]t[ée]|jambe|bras)|\/\s*(jambe|c[oô]t[ée]|bras)/i;

/** Lit une ligne du type « +10 à 15 kg — 4 × 6–8 — repos 2 min 30 ». Renvoie null si rien n'est reconnu. */
export function parsePrescription(line) {
  const segs = line.split(/\s*—\s*|\s+[–-]\s+/).map((s) => s.trim()).filter(Boolean);
  const out = {};
  let found = false;
  for (const seg of segs) {
    let m;
    if (/^repos\b/i.test(seg)) {
      const r = parseRest(seg.replace(/^repos\s*:?\s*/i, ''));
      if (r !== null) { out.rest = r; found = true; }
    } else if ((m = seg.match(RE_SETS) || seg.match(RE_SETS2))) {
      const unit = norm(m[4] || '');
      const a = Number(m[2]), b = m[3] ? Number(m[3]) : a;
      out.sets = Number(m[1]);
      if (/^(s|sec|secondes?|min|minutes?)$/.test(unit)) {
        const k = unit.startsWith('m') ? 60 : 1;
        out.mode = 'time'; out.secMin = Math.min(a, b) * k; out.secMax = Math.max(a, b) * k;
      } else { out.mode = 'reps'; out.repsMin = Math.min(a, b); out.repsMax = Math.max(a, b); }
      if (RE_SIDE.test(m[5] || '')) out.perSide = true;
      found = true;
    } else if (/kg|poids du corps|sans charge|lest|\bcharge\b/i.test(seg) && seg.length <= 60) {
      out.load = seg.replace(/\.$/, ''); found = true;
    }
  }
  return found ? out : null;
}

const RE_SEPARATOR = /^[\s─━═_=~*\-–—·.]{3,}$/;
const RE_HEADER = /^(?:(\d{1,2})\s*[.)]|(\d)\uFE0F?\u20E3)\s*(.+)$/;
const RE_BULLET = /^[•·▪●○◦►➤→✔✓▸*]\s*(.*)$|^[-–]\s+(.*)$/;
const RE_NOTE_HEAD = /^(progression|r[eè]gle|conseils?|notes?|attention|important|[àa] retenir)\b\s*(.*)$/i;

/**
 * Transforme un texte (séance collée) en séance structurée.
 * Renvoie { session, warnings } — session est null si aucun exercice n'est reconnu.
 */
export function parseSessionText(input) {
  const warnings = [];
  const lines = String(input || '').replace(/\r/g, '').split('\n');
  const session = { id: uid(), name: '', emoji: '🧗', durationMin: 0, objectives: [], notes: [], exercises: [], source: 'text', createdAt: Date.now(), updatedAt: Date.now() };
  let cur = null, note = null, ignored = 0;

  const closeEx = () => {
    if (!cur) return;
    if (!cur.presc) {
      warnings.push(`« ${cur.name} » : série × reps non reconnues (3 × 10, repos 1 min par défaut). Écris-les sous la forme « 4 × 8 — repos 2 min ».`);
      cur.fields = { ...cur.fields, sets: 3, mode: 'reps', repsMin: 10, repsMax: 10, rest: 60 };
    }
    const lib = matchLibrary(cur.name);
    const ex = normalizeEx({
      name: cur.name, emoji: lib?.emoji || guessEmoji(cur.name, cur.muscles), ok: cur.ok, muscles: cur.muscles.length ? cur.muscles : lib?.muscles || [],
      group: lib?.group, risk: lib?.risk, intensity: lib?.intensity, libId: lib?.id, ...cur.fields,
    });
    session.exercises.push(ex);
    cur = null;
  };
  const closeNote = () => {
    if (note && note.text.trim()) session.notes.push({ title: note.title, text: note.text.trim() });
    note = null;
  };

  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;

    if (RE_SEPARATOR.test(l)) { closeEx(); closeNote(); continue; }

    const head = l.match(RE_HEADER);
    if (head && /[A-Za-zÀ-ÿ]/.test(head[3])) {
      closeEx(); closeNote();
      cur = { name: sentenceCase(stripEmoji(head[3])), ok: [], muscles: [], fields: {}, presc: false };
      continue;
    }

    if (!session.name && !cur) {
      const em = l.match(EMOJI_START);
      if (em) session.emoji = em[1];
      session.name = sentenceCase(stripEmoji(l)).slice(0, 100);
      continue;
    }

    let m;
    if ((m = l.match(/^dur[ée]e\s*:\s*(.+)$/i))) {
      const nums = (m[1].match(/\d+/g) || []).map(Number);
      if (nums.length) session.durationMin = Math.max(...nums);
      session.notes.push({ title: 'Durée', text: m[1].trim() });
      continue;
    }
    if ((m = l.match(/^objectifs?\s*:\s*(.+)$/i))) {
      session.objectives = m[1].split(/\s*[•·|;]\s*|\s+—\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
      continue;
    }

    const bare = stripEmoji(l);
    const noteHead = bare.match(RE_NOTE_HEAD);
    const isBullet = RE_BULLET.test(l);
    if (noteHead && !isBullet && (!cur || bare === bare.toUpperCase() || /^(r[eè]gle|conseil|note|attention|important)\s*:/i.test(bare))) {
      closeEx(); closeNote();
      const colon = bare.match(/^([^:]{2,40}?)\s*:\s*(.+)$/);
      if (colon) session.notes.push({ title: sentenceCase(colon[1]), text: colon[2].trim() });
      else note = { title: sentenceCase(bare), text: '' };
      continue;
    }

    if (note) { note.text += (note.text ? '\n' : '') + l.replace(RE_BULLET, (_, a, b) => '• ' + (a ?? b ?? '')); continue; }
    if (!cur) { ignored++; continue; }

    if ((m = l.match(/^(?:travaille|muscles?|cibles?|zones?)\s*:\s*(.+)$/i))) {
      cur.muscles = m[1].replace(/\.$/, '').split(/,|\+|;|\s+et\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 12);
      continue;
    }
    if ((m = l.match(/^repos\s*:?\s*(.+)$/i)) && !cur.fields.rest) {
      const r = parseRest(m[1]);
      if (r !== null) { cur.fields.rest = r; continue; }
    }
    if ((m = l.match(RE_BULLET))) { cur.ok.push((m[1] ?? m[2] ?? '').trim()); continue; }
    if (!cur.presc) {
      const p = parsePrescription(l);
      if (p) { cur.fields = { ...cur.fields, ...p }; cur.presc = true; continue; }
    }
    cur.ok.push(l);
  }
  closeEx(); closeNote();

  if (!session.exercises.length) return { session: null, warnings: ['Aucun exercice reconnu. Numérote chaque exercice (« 1. NOM », « 2. NOM »…) et écris sous chacun « 4 × 8 — repos 2 min ».'] };
  if (ignored) warnings.push(`${ignored} ligne(s) avant le premier exercice n'ont pas été reconnues et ont été ignorées.`);
  if (!session.name) session.name = 'Séance importée';
  if (!session.durationMin) session.durationMin = sessionMinutes(session);
  return { session: normalizeSession(session), warnings };
}

function guessEmoji(name, muscles = []) {
  const t = norm(name + ' ' + muscles.join(' '));
  if (/saut|jump|pogo/.test(t)) return '🦘';
  if (/traction|pull/.test(t)) return '💪';
  if (/pompe|dips|push/.test(t)) return '🤜';
  if (/suspension|poutre|reglette|doigt/.test(t)) return '🖐️';
  if (/squat|fente|jambe|mollet|step|soulev/.test(t)) return '🦵';
  if (/gainage|abdo|planche/.test(t)) return '🧱';
  if (/etir|mobilite/.test(t)) return '🧘';
  if (/bloc|voie|grimp/.test(t)) return '🧗';
  return '💪';
}

const fmtRest = (s) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ' ' + (s % 60) : ''}` : `${s} s`);
/** Ré-écrit une séance dans le format collable (aller-retour avec parseSessionText). */
export function exportSessionText(s) {
  const out = [`${s.emoji} ${s.name.toUpperCase()}`];
  if (s.durationMin) out.push(`Durée : ~${s.durationMin} min`);
  if (s.objectives.length) out.push(`Objectifs : ${s.objectives.join(' • ')}`);
  s.exercises.forEach((e, i) => {
    out.push('', '───', '', `${i + 1}. ${e.name.toUpperCase()}`);
    const amount = e.mode === 'time'
      ? `${e.secMin === e.secMax ? e.secMin : e.secMin + '–' + e.secMax} s`
      : e.repsMin === e.repsMax ? `${e.repsMin}` : `${e.repsMin}–${e.repsMax}`;
    out.push([e.load, `${e.sets} × ${amount}${e.perSide ? ' par côté' : ''}`, `repos ${fmtRest(e.rest)}`].filter(Boolean).join(' — '));
    e.ok.forEach((c) => out.push('• ' + c));
    if (e.muscles.length) out.push(`Travaille : ${e.muscles.join(', ')}.`);
  });
  s.notes.filter((n) => n.title !== 'Durée').forEach((n) => out.push('', '───', '', n.title.toUpperCase(), n.text));
  return out.join('\n');
}

/* ═════════════ Analyse de l'historique ═════════════ */

export function groupLoads(history, now = Date.now(), days = 30) {
  const g = Object.fromEntries(Object.keys(GROUP_LABEL).map((k) => [k, 0]));
  const r = Object.fromEntries(Object.keys(REGIONS).map((k) => [k, 0]));
  for (const h of history || []) {
    if (now - h.startedAt > days * DAY) continue;
    for (const ex of h.data?.exercises || []) {
      const done = (ex.sets || []).filter((s) => s.done !== false).length;
      if (!done) continue;
      const meta = exMeta(ex);
      if (meta.group && g[meta.group] !== undefined) g[meta.group] += done;
      for (const reg of meta.regions) r[reg] += done;
    }
  }
  return { groups: g, regions: r };
}

export function analyze(history, now = Date.now()) {
  const hist = [...(history || [])].filter((h) => h.startedAt > 0).sort((a, b) => b.startedAt - a.startedAt);
  const A = { n7: 0, n30: 0, hoursSinceAny: Infinity, hoursSinceHighFinger: Infinity, hoursSinceHighLegs: Infinity, lastRpe: 0, lastRpeHours: Infinity, avgMinutes: 0, lastSeen: new Map(), lastFocus: '', focusCounts: {} };
  const mins = [];
  for (const h of hist) {
    const age = now - h.startedAt;
    if (age <= 7 * DAY) A.n7++;
    if (age <= 30 * DAY) A.n30++;
    A.hoursSinceAny = Math.min(A.hoursSinceAny, age / HOUR);
    if (!A.lastFocus && h.data?.focus) A.lastFocus = h.data.focus;
    if (h.data?.focus && age <= 14 * DAY) A.focusCounts[h.data.focus] = (A.focusCounts[h.data.focus] || 0) + 1;
    if (!A.lastRpe && h.data?.rpe) { A.lastRpe = h.data.rpe; A.lastRpeHours = age / HOUR; }
    if (mins.length < 8 && h.durationSeconds > 300) mins.push(h.durationSeconds / 60);
    for (const ex of h.data?.exercises || []) {
      if (!(ex.sets || []).some((s) => s.done !== false)) continue;
      const meta = exMeta(ex);
      const key = exKey(ex.name);
      if (!A.lastSeen.has(key)) A.lastSeen.set(key, h.startedAt);
      if (meta.risk === 'finger' && meta.intensity === 'high') A.hoursSinceHighFinger = Math.min(A.hoursSinceHighFinger, age / HOUR);
      if (meta.group === 'jambes' && meta.intensity !== 'low' && (meta.intensity === 'high' || ex.sets.length >= 3)) A.hoursSinceHighLegs = Math.min(A.hoursSinceHighLegs, age / HOUR);
    }
  }
  A.avgMinutes = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0;
  const { groups } = groupLoads(hist, now, 30);
  A.groups = groups;
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  A.totalSets30 = total;
  A.weakest = total === 0 ? 'epaules' : Object.keys(GROUP_TARGET).sort((a, b) => groups[a] / total / GROUP_TARGET[a] - groups[b] / total / GROUP_TARGET[b])[0];
  return A;
}

/** Dernière performance et suggestion de charge pour un exercice. */
/** Transforme la dernière série réellement effectuée en nouvelle base de prescription. */
export function applyPerformedBase(ex, set) {
  if (!ex || !set) return ex;
  let out = { ...ex };
  if (ex.mode === 'time') {
    const sec = Number(set.seconds) || 0;
    if (sec > 0) out = { ...out, secMin: sec, secMax: sec };
  } else {
    const reps = Number(set.reps) || 0;
    if (reps > 0) out = { ...out, repsMin: reps, repsMax: reps };
  }
  const load = Number(set.load) || 0;
  if (load > 0) out = { ...out, load: `${load} kg` };
  return out;
}

export function progressHint(ex, history) {
  const key = exKey(ex.name);
  for (const h of [...(history || [])].sort((a, b) => b.startedAt - a.startedAt)) {
    const found = (h.data?.exercises || []).find((e) => exKey(e.name) === key);
    const sets = (found?.sets || []).filter((s) => s.done !== false);
    if (!sets.length) continue;
    const load = Math.max(...sets.map((s) => Number(s.load) || 0));
    const isTime = ex.mode === 'time';
    const vals = sets.map((s) => (isTime ? Number(s.seconds) || 0 : Number(s.reps) || 0));
    const target = isTime ? ex.secMax : ex.repsMax;
    const allTop = vals.length >= ex.sets && vals.every((v) => v >= target);
    const last = `${load ? load + ' kg × ' : ''}${vals.join(', ')}${isTime ? ' s' : ''}`;
    let next = '';
    if (allTop && load > 0) next = `Essaie ${Math.round((load + 2.5) * 10) / 10} kg`;
    else if (allTop) next = 'Tout est réussi : ajoute une répétition ou un peu de charge';
    else if (load > 0) next = `Reste à ${load} kg jusqu'à réussir toutes les séries`;
    return { last, next, load, t: h.startedAt };
  }
  return null;
}

/* ═════════════ Générateur de séances ═════════════ */

export const SIZES = {
  petite: { label: 'Petite', main: 20, warm: 8, cool: 4, cools: 1 },
  moyenne: { label: 'Moyenne', main: 35, warm: 12, cool: 6, cools: 2 },
  grosse: { label: 'Grosse', main: 55, warm: 15, cool: 8, cools: 3 },
};

const TEMPLATES = {
  dalle: ['skill', 'skill', 'skill', 'core', 'prehab', 'skill'],
  reglette: ['finger', 'wallfinger', 'antagonist', 'prehab', 'core', 'wallfinger'],
  devers: ['power', 'skill', 'pull', 'lock', 'core', 'antagonist'],
  resistance: ['endurance', 'endurance', 'core', 'antagonist'],
  perf: ['power', 'finger', 'pull', 'antagonist', 'core'],
  vitesse: ['speed', 'power', 'plyo', 'plyo', 'core', 'legs'],
  jambes: ['plyo', 'legs', 'legs', 'legs', 'legs', 'core'],
  equilibre: ['antagonist', 'prehab', 'prehab', 'core', 'legs', 'antagonist'],
};
const SHOULDER_IDS = new Set(['dips', 'pike-pushup', 'shoulder-press', 'dynos']);
const ELBOW_IDS = new Set(['pullup-heavy', 'lockoff', 'explosive-pullup', 'wrist-extension']);
const KNEE_IDS = new Set(['bulgarian', 'cossack', 'jump-vertical', 'skater-jumps', 'step-up-explosive', 'squat-loaded']);

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function equipmentOf(settings = {}, override) {
  // Profil jamais rempli : on suppose un mur d'escalade, rien d'autre (prudence).
  const eq = { ...(settings.equipment || { wall: true }), ...(override || {}) };
  return Object.fromEntries(['wall', 'hangboard', 'bar', 'dips', 'weights', 'band'].map((k) => [k, !!eq[k]]));
}

const fromLib = (lib, over = {}) => ({ ...lib, ...over });
function toEx(item, block) {
  return normalizeEx({ ...item, id: uid(), block, libId: item.id, ok: item.cues, bad: item.bad, note: '' });
}

/**
 * Génère une séance complète (échauffement + corps de séance + retour au calme).
 * opts : { size, focus, feeling: 'frais'|'normal'|'fatigue', equipment?, seed? }
 * ctx  : { settings, history, now }
 */
export function generateSession(opts = {}, ctx = {}) {
  const now = ctx.now || Date.now();
  const settings = ctx.settings || {};
  const history = ctx.history || [];
  const A = analyze(history, now);
  const level = levelFrom(settings);
  const eq = equipmentOf(settings, opts.equipment);
  const avoid = settings.avoid || {};
  const levelSet = !!(settings.level && (settings.level.boulderMax || settings.level.routeMax || settings.level.years));
  const rng = mulberry32(Number.isFinite(opts.seed) ? opts.seed : now % 2147483647);
  const size = SIZES[opts.size] ? opts.size : 'moyenne';
  const S = SIZES[size];
  const why = [];
  let focus = opts.focus;
  const feeling = opts.feeling || 'normal';
  let volume = 1, capIntensity = 'high';

  if (focus === 'surprise' || !FOCUS[focus]) {
    const keys = Object.keys(TEMPLATES);
    const usable = keys.filter((k) => k !== 'perf' || feeling !== 'fatigue');
    focus = usable.sort((a, b) => (A.focusCounts[a] || 0) - (A.focusCounts[b] || 0) + (rng() - 0.5) * 0.9)[0];
    why.push(`Surprise : « ${FOCUS[focus].label} » est ce que tu as le moins travaillé ces 2 dernières semaines.`);
  }
  const askedFocus = focus;

  // Garde-fous de récupération
  const swap = (to, msg) => { why.push(msg); focus = to; };
  if (feeling === 'fatigue') {
    volume = 0.75; capIntensity = 'mod';
    if (['perf', 'reglette', 'vitesse'].includes(focus)) swap('dalle', `Tu te sens fatigué : je remplace « ${FOCUS[focus].label} » par de la technique sur dalle, plus douce pour les tendons et le système nerveux.`);
    else why.push('Tu te sens fatigué : volume réduit d’environ 25 % et pas d’exercice à intensité maximale.');
  }
  if (['reglette', 'perf'].includes(focus) && A.hoursSinceHighFinger < 48) swap('dalle', `Dernière séance de doigts intense il y a ${Math.round(A.hoursSinceHighFinger)} h : les doigts ont besoin d’environ 48 h, on passe à la technique.`);
  if (['vitesse', 'jambes'].includes(focus) && A.hoursSinceHighLegs < 36) swap('equilibre', `Séance de jambes intense il y a ${Math.round(A.hoursSinceHighLegs)} h : on évite les sauts et on travaille l’équilibre du haut du corps.`);
  if (A.lastRpe >= 4 && A.lastRpeHours < 36) { volume *= 0.85; capIntensity = capIntensity === 'high' ? 'mod' : capIntensity; why.push('Ta dernière séance était très dure : intensité et volume légèrement réduits.'); }
  if (A.n7 >= 5) { volume *= 0.9; why.push(`${A.n7} séances en 7 jours : un peu moins de volume pour bien récupérer.`); }
  if (!levelSet) why.push('Ton niveau n’est pas renseigné : la séance reste prudente (pas de suspensions maximales). Remplis ton profil dans Réglages pour l’adapter.');

  const rank = { low: 0, mod: 1, high: 2 };
  const allowed = (x) => {
    if (x.minLevel > level) return false;
    if (rank[x.intensity] > rank[capIntensity]) return false;
    if (x.needs.some((n) => !eq[n])) return false;
    if (x.risk === 'finger' && (avoid.fingers || (x.intensity === 'high' && (!levelSet || level < 1)))) return false;
    if (x.risk === 'shoulder' && avoid.shoulders) return false;
    if (avoid.shoulders && SHOULDER_IDS.has(x.id)) return false;
    if (avoid.elbows && ELBOW_IDS.has(x.id)) return false;
    if (avoid.knees && KNEE_IDS.has(x.id)) return false;
    return true;
  };

  const mainLib = LIBRARY.filter((x) => x.role === 'main');
  const used = new Set();
  const score = (x) => {
    const last = A.lastSeen.get(exKey(x.name));
    const days = last ? Math.min(30, (now - last) / DAY) : 45;
    return days / 30 + rng() * 0.7 + (x.group === A.weakest ? 0.5 : 0);
  };
  const pick = (kind) => {
    let pool = mainLib.filter((x) => x.kind === kind && x.focus.includes(focus) && !used.has(x.id) && allowed(x));
    if (!pool.length) pool = mainLib.filter((x) => x.kind === kind && !used.has(x.id) && allowed(x) && x.intensity !== 'high');
    if (!pool.length) return null;
    return pool.sort((a, b) => score(b) - score(a))[0];
  };

  const items = [];
  for (const kind of TEMPLATES[focus]) {
    const x = pick(kind);
    if (!x) continue;
    used.add(x.id);
    items.push({ lib: x, ex: toEx(x, 'main') });
  }
  // Complète avec des exercices de la même famille si le corps de séance est vide ou trop court
  for (let guard = 0; guard < 6 && items.reduce((t, i) => t + exMinutes(i.ex), 0) < S.main * 0.7; guard++) {
    const extra = mainLib.filter((x) => x.focus.includes(focus) && !used.has(x.id) && allowed(x)).sort((a, b) => score(b) - score(a))[0];
    if (!extra) break;
    used.add(extra.id);
    items.push({ lib: extra, ex: toEx(extra, 'main') });
  }

  // Ordre logique : travail intense et technique d'abord (frais), puis prévention et gainage
  const KIND_ORDER = ['skill', 'power', 'speed', 'finger', 'wallfinger', 'plyo', 'legs', 'pull', 'lock', 'endurance', 'antagonist', 'prehab', 'core'];
  items.sort((a, b) => KIND_ORDER.indexOf(a.lib.kind) - KIND_ORDER.indexOf(b.lib.kind));

  // Volume selon la forme du jour
  if (volume !== 1) for (const it of items) it.ex.sets = Math.max(it.lib.sets > 1 ? 2 : 1, Math.round(it.ex.sets * volume));

  fitToTarget(items, S.main);

  // Découverte pour l'équilibre
  const seen = new Set([...A.lastSeen.keys()]);
  if (size !== 'petite' || A.totalSets30 > 0) {
    const weak = A.weakest;
    const disc = mainLib.filter((x) => x.group === weak && !used.has(x.id) && !seen.has(exKey(x.name)) && ['antagonist', 'prehab', 'core', 'legs', 'skill'].includes(x.kind) && x.intensity !== 'high' && allowed(x))
      .sort((a, b) => rng() - 0.5)[0];
    if (disc) {
      used.add(disc.id);
      const ex = toEx(disc, 'main'); ex.sets = Math.min(ex.sets, 2); ex.isNew = true;
      items.push({ lib: disc, ex });
      const label = GROUP_LABEL[weak];
      why.push(A.totalSets30 > 0
        ? `Découverte : « ${disc.name} ». Ton bloc « ${label} » est le moins travaillé de ces 30 derniers jours par rapport à un bon équilibre.`
        : `Découverte : « ${disc.name} », du bloc « ${label} », que tu n’as encore jamais fait dans l’app. Il équilibre le tirage très présent en escalade.`);
    }
  }

  // Charges : progression basée sur l'historique
  for (const it of items) {
    const hint = progressHint(it.ex, history);
    if (hint) {
      it.ex.note = `Dernière fois : ${hint.last}.${hint.next ? ' ' + hint.next + '.' : ''}`;
      if (hint.load) it.ex.load = it.ex.load || `${hint.load} kg`;
    }
    if (it.lib.id === 'hang-max') it.ex.load = level >= 2 ? 'Poids du corps + lest léger si les 10 s sont faciles' : 'Poids du corps, allégé (élastique ou pieds au sol) si trop dur';
  }

  const warm = buildWarmup({ focus, size, level, A, eq, avoid, items, settings, why, now });
  const cool = buildCooldown({ focus, size, eq });

  const exercises = [...warm, ...items.map((i) => i.ex), ...cool];
  const F = FOCUS[focus];
  const finalWhy = [...why];
  const lvLabel = ['débutant', 'intermédiaire', 'avancé'][level];
  if (levelSet) finalWhy.push(`Niveau pris en compte : ${lvLabel}${settings.level?.boulderMax ? ' (bloc ' + settings.level.boulderMax + ')' : ''} : les exercices trop exigeants sont écartés.`);
  finalWhy.push('Ordre : technique et travail intense d’abord, quand tu es frais ; prévention et gainage à la fin.');
  const lastTimes = items.filter((i) => A.lastSeen.has(exKey(i.lib.name))).length;
  if (history.length) finalWhy.push(`${lastTimes ? lastTimes + ' exercice(s) que tu connais déjà et ' : ''}${items.length - lastTimes} moins récents ou nouveaux : je varie pour éviter la routine.`);
  if (askedFocus !== focus) finalWhy.unshift(`Objectif demandé : ${FOCUS[askedFocus].label}.`);
  if (A.avgMinutes) finalWhy.push(`Durée totale ≈ ${sessionMinutes({ exercises })} min (tu fais en général ${A.avgMinutes} min).`);

  const session = normalizeSession({
    id: uid(), name: `${F.label} — ${S.label.toLowerCase()} séance`, emoji: F.emoji, goal: focus, source: 'generated',
    durationMin: sessionMinutes({ exercises }),
    objectives: [F.text],
    notes: [
      { title: 'Pourquoi cette séance', text: finalWhy.join('\n') || 'Séance équilibrée selon ton profil.' },
      { title: 'Progression', text: progressionText(focus) },
      { title: 'Sécurité', text: 'Stop au moindre signal de douleur aiguë (doigts, coudes, épaules). Ces séances suivent des principes d’entraînement courants : elles ne remplacent ni un coach ni un avis médical.' },
    ],
    exercises, createdAt: now, updatedAt: now,
  });
  return { session, meta: { focus, askedFocus, size, level, warmMin: Math.round(warm.reduce((t, e) => t + exMinutes(e), 0)), mainMin: Math.round(items.reduce((t, i) => t + exMinutes(i.ex), 0)), why: finalWhy } };
}

function progressionText(focus) {
  const common = 'Quand toutes les séries sont propres pendant deux séances de suite, augmente un seul paramètre à la fois (charge, séries ou difficulté).';
  return ({
    reglette: 'Doigts : n’ajoute la charge que si les 10 s sont faciles sur toutes les séries. Maximum deux séances de doigts intenses par semaine, 48 h d’écart. ' + common,
    perf: 'Performance : peu d’essais, très bonne qualité, longs repos. Arrête dès que les mouvements ralentissent. ' + common,
    vitesse: 'Vitesse : si les sauts ou lancers deviennent nettement moins efficaces, arrête le travail explosif pour la séance. ' + common,
    resistance: 'Résistance : augmente d’abord la durée de grimpe continue (+5 min), puis seulement la difficulté. ' + common,
  })[focus] || common;
}

function fitToTarget(items, target) {
  const total = () => items.reduce((t, i) => t + exMinutes(i.ex), 0);
  for (let i = 0; i < 12; i++) {
    const t = total();
    if (t > target * 1.12) {
      const flex = items.filter((it) => it.lib.flex && it.ex.mode === 'time' && it.ex.secMin > it.lib.flex[0]).sort((a, b) => exMinutes(b.ex) - exMinutes(a.ex))[0];
      const big = items.filter((it) => it.ex.sets > 2).sort((a, b) => exMinutes(b.ex) - exMinutes(a.ex))[0];
      if (flex && (!big || exMinutes(flex.ex) >= exMinutes(big.ex))) {
        const cut = Math.max(flex.lib.flex[0], Math.round(flex.ex.secMin * 0.8 / 30) * 30 || flex.lib.flex[0]);
        flex.ex.secMin = flex.ex.secMax = Math.min(flex.ex.secMin, cut);
      } else if (big) big.ex.sets--;
      else if (items.length > 2) items.pop();
      else break;
    } else if (t < target * 0.85) {
      const grow = items.filter((it) => it.lib.flex && it.ex.mode === 'time' && it.ex.secMax < it.lib.flex[1] && it.lib.intensity === 'low')[0]
        || items.filter((it) => it.ex.sets < 5 && it.lib.intensity !== 'high' && !['finger', 'power'].includes(it.lib.kind))[0];
      if (!grow) break;
      if (grow.lib.flex && grow.ex.mode === 'time' && grow.lib.intensity === 'low') { const v = Math.min(grow.lib.flex[1], Math.round(grow.ex.secMax * 1.25 / 30) * 30); grow.ex.secMin = grow.ex.secMax = v; }
      else grow.ex.sets++;
    } else break;
  }
}

function buildWarmup({ focus, size, level, A, eq, avoid, items, settings, why, now }) {
  const S = SIZES[size];
  const groups = new Set(items.map((i) => i.lib.group));
  const climbs = ['dalle', 'reglette', 'devers', 'resistance', 'perf'].includes(focus);
  const fingers = items.some((i) => i.lib.risk === 'finger') || groups.has('doigts');
  const legs = ['jambes', 'vitesse', 'dalle'].includes(focus) || groups.has('jambes');
  const pulls = groups.has('tirer') || groups.has('pousser') || groups.has('epaules');
  const out = [];
  const add = (id, over = {}) => {
    const lib = byId(id);
    if (!lib) return null;
    const e = toEx(lib, 'warmup');
    Object.assign(e, over);
    out.push(e);
    return e;
  };

  const long = A.hoursSinceAny > 96 && A.hoursSinceAny !== Infinity;
  add('wu-pulse', { secMin: S.warm >= 15 ? 300 : S.warm >= 12 ? 240 : 180, secMax: S.warm >= 15 ? 300 : S.warm >= 12 ? 240 : 180 });
  if (long) { out[0].secMin = out[0].secMax = out[0].secMin + 60; why.push('Ça fait plus de 4 jours sans séance : échauffement un peu plus progressif.'); }

  if (pulls || climbs) add('wu-mob-upper');
  if (legs || A.hoursSinceHighLegs < 48) add('wu-mob-lower');
  if (fingers || climbs) add('wu-wrists');
  if (pulls || climbs) {
    const has = (id) => items.some((i) => i.lib.id === id);
    if (eq.bar && !avoid.shoulders) { if (!has('scap-pullup')) add('wu-scap-bar'); }
    else if (eq.band) { if (!has('band-pull-apart')) add('wu-scap-band'); }
    else if (!has('ytw')) add('wu-scap-floor');
  }
  if (['devers', 'perf', 'vitesse', 'jambes', 'dalle'].includes(focus)) add('wu-core');
  if (fingers && eq.hangboard && items.some((i) => ['hang-max', 'hang-repeaters', 'hang-active'].includes(i.lib.id))) add('wu-hang');
  else if (climbs && eq.wall) {
    const e = add('wu-climb');
    const lv = settings.level || {};
    const gi = Math.max(gradeIndex(lv.boulderMax), gradeIndex(lv.routeMax));
    const usePrep = focus === 'perf' || focus === 'reglette';
    if (e && gi >= 0) {
      const g = (o) => gradeAt(gi + o);
      e.ok = [`Blocs ou voies en montant : ${g(-6)}, puis ${g(-4)}, puis ${g(-3)}${usePrep ? `, puis un essai à ${g(-2)}` : ''}.`, 'Prises larges au début, sans forcer, en bougeant fluide.'];
      e.sets = usePrep ? 4 : 3;
    } else if (e) e.ok = ['Commence très facile, puis monte de difficulté à chaque bloc jusqu’à un niveau moyen.'];
  }
  if (['jambes', 'vitesse'].includes(focus)) add('wu-jumps');

  // On garde l'échauffement dans son budget de temps
  let guard = 0;
  while (out.reduce((t, e) => t + exMinutes(e), 0) > S.warm * 1.25 && out.length > 4 && guard++ < 6) {
    const drop = out.findIndex((e) => ['wu-core', 'wu-wrists', 'wu-mob-lower', 'wu-mob-upper'].includes(e.libId));
    if (drop < 0) break;
    out.splice(drop, 1);
  }
  return out;
}

function buildCooldown({ focus, size, eq }) {
  const S = SIZES[size];
  const byFocus = {
    dalle: ['cd-hips', 'cd-forearm', 'cd-breath'], reglette: ['cd-forearm', 'cd-shoulders', 'cd-breath'], devers: ['cd-forearm', 'cd-shoulders', 'cd-breath'],
    resistance: ['cd-forearm', 'cd-shoulders', 'cd-breath'], perf: ['cd-forearm', 'cd-shoulders', 'cd-breath'],
    vitesse: ['cd-hips', 'cd-breath', 'cd-shoulders'], jambes: ['cd-hips', 'cd-breath', 'cd-shoulders'], equilibre: ['cd-shoulders', 'cd-breath', 'cd-hips'],
  }[focus];
  return byFocus.slice(0, S.cools).map((id) => toEx(byId(id), 'cool'));
}

/** Remplace un exercice par une alternative compatible (même famille, autre exercice). */
export function swapExercise(session, exId, ctx = {}) {
  const idx = session.exercises.findIndex((e) => e.id === exId);
  if (idx < 0) return session;
  const cur = session.exercises[idx];
  const lib = (cur.libId && byId(cur.libId)) || matchLibrary(cur.name);
  if (!lib) return session;
  const settings = ctx.settings || {};
  const eq = equipmentOf(settings);
  const level = levelFrom(settings);
  const inUse = new Set(session.exercises.map((e) => e.libId));
  const avoid = settings.avoid || {};
  const cands = LIBRARY.filter((x) => x.role === lib.role && x.kind === lib.kind && x.id !== lib.id && !inUse.has(x.id) && x.minLevel <= level && x.needs.every((n) => eq[n])
    && !(x.risk === 'finger' && (avoid.fingers || (x.intensity === 'high' && level < 1))) && !(avoid.shoulders && (x.risk === 'shoulder' || SHOULDER_IDS.has(x.id))) && !(avoid.elbows && ELBOW_IDS.has(x.id)) && !(avoid.knees && KNEE_IDS.has(x.id)));
  if (!cands.length) return session;
  const pick = cands[Math.floor((ctx.rng ? ctx.rng() : Math.random()) * cands.length)];
  const ex = toEx(pick, cur.block);
  const exercises = session.exercises.slice();
  exercises[idx] = ex;
  return normalizeSession({ ...session, exercises, updatedAt: Date.now() });
}
