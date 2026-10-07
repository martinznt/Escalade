// csv.js — import CSV avec correspondance de colonnes VÉRIFIÉE par l'utilisateur (cahier des charges §5.16).
// Étapes : 1) détecter les colonnes ; 2) proposer une correspondance ; 3) aperçu ; 4) l'utilisateur vérifie et corrige ;
// 5) validation ligne par ligne ; 6) import uniquement après confirmation (fait par l'interface).
// Aucune correspondance n'est inventée : un en-tête non reconnu ou ambigu reste « non mappé ».
// Pur JavaScript, sans DOM.

const norm = (s) => String(s || '').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const MAX_CSV_BYTES = 2_000_000;
export const MAX_CSV_ROWS = 5000;

/** Découpe un CSV (séparateur détecté : virgule, point-virgule ou tabulation ; guillemets gérés). */
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  if (text.length > MAX_CSV_BYTES) throw new Error(`Fichier trop volumineux (maximum ${Math.round(MAX_CSV_BYTES / 1e6)} Mo).`);
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false; for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; continue; }
    if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; if (rows.length > MAX_CSV_ROWS + 1) throw new Error(`Trop de lignes (maximum ${MAX_CSV_ROWS}).`); }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('Il faut une ligne d’en-têtes et au moins une ligne de données.');
  const headers = rows[0].map((h, i) => String(h).trim() || `Colonne ${i + 1}`);
  const data = rows.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim()));
  return { sep, headers, rows: data };
}

/* ───────── Valeurs ───────── */
export function parseDateCell(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (m) {
    let offset;
    if (m[8]) {
      const zone=m[8];
      if(zone.toUpperCase()==='Z')offset=0;
      else { const z=/^([+-])(\d{2}):?(\d{2})$/.exec(zone), hours=Number(z[2]), minutes=Number(z[3]);if(hours>23||minutes>59)return null;offset=(hours*60+minutes)*(z[1]==='-'?-1:1); }
    }
    return mk(+m[1],+m[2],+m[3],m[4],m[5],m[6],m[7]?Number(m[7].slice(0,3).padEnd(3,'0')):0,offset);
  }
  m = s.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})(?:\s+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/);
  if (m) { const y = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]); return mk(y,+m[3],+m[1],m[5],m[6],m[7]); }
  return null;
}
function mk(y, mo, d, h, mi, sec, ms=0, offset) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const hour=h==null?12:Number(h),minute=mi==null?0:Number(mi),second=sec==null?0:Number(sec);
  if(hour>23||minute>59||second>59)return null;
  const utc=offset!==undefined,t=utc?Date.UTC(y,mo-1,d,hour,minute,second,ms):new Date(y,mo-1,d,hour,minute,second,ms).getTime();
  const back=new Date(t),prefix=utc?'getUTC':'get';
  if(back[prefix+'FullYear']()!==y||back[prefix+'Month']()!==mo-1||back[prefix+'Date']()!==d||back[prefix+'Hours']()!==hour||back[prefix+'Minutes']()!==minute||back[prefix+'Seconds']()!==second)return null;
  return utc?t-offset*60000:t;
}
export function parseNumberCell(v) {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.').replace(/(kg|reps?|s|min|km|m|cm)$/i, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
/** Durée : « 45 », « 45 min », « 1:05:00 », « 12:30 » (min:s), « 1h10 ». Retourne des secondes. */
export function parseDurationCell(v) {
  const s = String(v ?? '').trim().toLocaleLowerCase('fr-FR');
  if (!s) return null;
  const finite=n=>Number.isFinite(n)?n:NaN;
  let m = s.match(/^(\d+):(\d{2}):(\d{2})$/); if (m) return +m[2]>59||+m[3]>59?NaN:finite(+m[1]*3600 + +m[2]*60 + +m[3]);
  m = s.match(/^(\d+):(\d{2})$/); if (m) return +m[2]>59?NaN:finite(+m[1]*60 + +m[2]);
  m = s.match(/^(\d+)\s*h(?:\s*(\d+)(?:\s*(?:min|mn|minutes?))?)?$/); if (m) return +m[2]>59?NaN:finite(+m[1]*3600 + (+m[2]||0)*60);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|mn|minutes?)?$/); if (m) return finite(Math.round(Number(m[1].replace(',','.'))*60));
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:s|sec|secondes?|seconds?)$/); if (m) return finite(Math.round(Number(m[1].replace(',','.'))));
  return NaN;
}

/* ───────── Correspondance des colonnes ───────── */
export const TARGETS = {
  history: {
    date: { label: 'Date', required: true, words: ['date', 'jour', 'day'] },
    sessionName: { label: 'Nom de la séance', words: ['seance', 'session', 'nom', 'titre', 'workout', 'entrainement'] },
    duration: { label: 'Durée de la séance', words: ['duree', 'duration', 'temps total'] },
    activity: { label: 'Activité', words: ['activite', 'sport', 'discipline'] },
    place: { label: 'Lieu', words: ['lieu', 'salle', 'site', 'location', 'gym'] },
    performance: { label: 'Performance / cotation déclarée', words: ['performance', 'cotation', 'grade', 'resultat', 'result'] },
    exercise: { label: 'Exercice', words: ['exercice', 'exercise', 'mouvement', 'movement'] },
    sets: { label: 'Séries', words: ['series', 'serie', 'sets', 'set'] },
    reps: { label: 'Répétitions', words: ['reps', 'rep', 'repetitions', 'repetition'] },
    load: { label: 'Charge (kg)', words: ['charge', 'poids', 'kg', 'load', 'weight', 'lest'] },
    seconds: { label: 'Durée d’une série (s)', words: ['secondes', 'seconds', 'tenue', 'hold'] },
    rpe: { label: 'Ressenti (1–5)', words: ['rpe', 'ressenti', 'difficulte', 'effort'] },
    note: { label: 'Note', words: ['note', 'notes', 'commentaire', 'comment', 'remarque'] },
  },
  perf: {
    date: { label: 'Date', required: true, words: ['date', 'jour', 'day'] },
    metric: { label: 'Métrique / test', required: true, words: ['metrique', 'metric', 'test', 'mesure', 'performance', 'exercice'] },
    value: { label: 'Valeur', required: true, words: ['valeur', 'value', 'resultat', 'score', 'result'] },
    unit: { label: 'Unité', words: ['unite', 'unit'] },
    note: { label: 'Note', words: ['note', 'notes', 'commentaire', 'comment'] },
  },
};
export const UNMAPPED = '';

/**
 * Propose une correspondance colonne → champ. Retourne { mapping: { colIndex: field|'' }, notes: { colIndex: texte } }.
 * Règle : correspondance uniquement si l'en-tête contient un mot-clé du champ et qu'aucune autre colonne ne le revendique.
 */
export function proposeMapping(headers, kind = 'history') {
  const T = TARGETS[kind] || TARGETS.history;
  const cand = headers.map((h) => { const n = norm(h); return Object.entries(T).filter(([, t]) => t.words.some((w) => n === w || n.split(' ').includes(w) || (w.includes(' ') && n.includes(w)))).map(([f]) => f); });
  const mapping = {}, notes = {};
  const claims = {};
  cand.forEach((fs, i) => { if (fs.length === 1) (claims[fs[0]] ||= []).push(i); });
  headers.forEach((h, i) => {
    const fs = cand[i];
    if (fs.length === 1 && claims[fs[0]].length === 1) { mapping[i] = fs[0]; notes[i] = `« ${h} » ressemble à « ${T[fs[0]].label} ».`; }
    else if (fs.length > 1) { mapping[i] = UNMAPPED; notes[i] = `« ${h} » est ambigu (${fs.map((f) => T[f].label).join(' ou ')}) : à choisir.`; }
    else if (fs.length === 1) { mapping[i] = UNMAPPED; notes[i] = `Plusieurs colonnes ressemblent à « ${T[fs[0]].label} » : à choisir.`; }
    else { mapping[i] = UNMAPPED; notes[i] = `« ${h} » non reconnu : non importé sauf si tu choisis un champ.`; }
  });
  return { mapping, notes };
}
/** Vérifie une correspondance : champs obligatoires présents, pas de doublon. */
export function checkMapping(mapping, kind = 'history') {
  const T = TARGETS[kind], used = {}, errors = [];
  for (const [col, f] of Object.entries(mapping)) if (f) { if (used[f] != null) errors.push(`Le champ « ${T[f].label} » est attribué à deux colonnes.`); used[f] = Number(col); }
  for (const [f, t] of Object.entries(T)) if (t.required && used[f] == null) errors.push(`Champ obligatoire non attribué : « ${t.label} ».`);
  return { ok: !errors.length, errors, used };
}
/** Propose une correspondance des valeurs texte de la colonne « métrique » vers les métriques connues. Ambigu → non mappé. */
export function proposeMetricMap(values, metrics) {
  const out = {};
  for (const v of [...new Set(values.filter(Boolean))]) {
    const n = norm(v), hits = Object.entries(metrics).filter(([id, m]) => { const l = norm(m.label); return l === n || id === n.replace(/ /g, '_') || (n.length >= 4 && (l.includes(n) || n.includes(l))); });
    out[v] = hits.length === 1 ? hits[0][0] : UNMAPPED;
  }
  return out;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/**
 * Construit l'aperçu / le résultat. Retourne { records, errors, skipped } sans rien enregistrer.
 * history : une ligne = un exercice ; les lignes de même date + même nom forment une séance (identifiant stable :
 * réimporter le même fichier ne crée pas de doublon).
 */
export function buildImport(parsed, mapping, kind = 'history', { metricMap = {}, now = Date.now() } = {}) {
  const chk = checkMapping(mapping, kind);
  if (!chk.ok) return { records: [], errors: chk.errors.map((e) => ({ row: 0, error: e })), skipped: parsed.rows.length };
  const col = (r, f) => (chk.used[f] != null ? r[chk.used[f]] : '');
  const errors = []; let skipped = 0;
  if (kind === 'perf') {
    const records = [];
    parsed.rows.forEach((r, i) => {
      const date = parseDateCell(col(r, 'date')), metricId = metricMap[col(r, 'metric')] || '', value = parseNumberCell(col(r, 'value'));
      const e = !date ? 'date illisible' : date > now + 86400000 ? 'date dans le futur' : !metricId ? `métrique « ${col(r, 'metric')} » non mappée` : value == null || Number.isNaN(value) ? 'valeur non numérique' : '';
      if (e) { errors.push({ row: i + 2, error: e }); skipped++; return; }
      records.push({ c: 'perf', id: 'csv-' + hash([date, metricId, value].join('|')), d: { metricId, value, unit: col(r, 'unit'), date, source: 'imported', note: col(r, 'note').slice(0, 300) } });
    });
    return { records, errors, skipped };
  }
  const sessions = new Map();
  parsed.rows.forEach((r, i) => {
    const date = parseDateCell(col(r, 'date'));
    if (!date) { errors.push({ row: i + 2, error: 'date illisible' }); skipped++; return; }
    if (date < now - 5 * 365 * 86400000) { errors.push({ row: i + 2, error: 'date trop ancienne : l’historique accepte les cinq dernières années (5 × 365 jours)' }); skipped++; return; }
    if (date > now + 10 * 60000) { errors.push({ row: i + 2, error: 'date dans le futur : une séance à venir n’est pas un historique (10 min de tolérance)' }); skipped++; return; }
    const name = col(r, 'sessionName') || 'Séance importée';
    const key = date + '|' + name;
    const exName = col(r, 'exercise');
    const n=parseNumberCell(col(r,'sets')),reps=parseNumberCell(col(r,'reps')),load=parseNumberCell(col(r,'load')),sec=parseNumberCell(col(r,'seconds'));
    if(exName&&[n,reps,load,sec].some((x)=>Number.isNaN(x))){errors.push({row:i+2,error:'nombre illisible dans séries / reps / charge / secondes'});skipped++;return;}
    const id='csv-'+hash(key),s = sessions.get(key) || { id, sessionName: name.slice(0, 100), startedAt: date, durationSeconds: 0, data: { rpe: 0, note: '', activity: '', exercises: [], quickLog:{durationKnown:false,performance:'',order:'main'},external:{provider:'file',id,channel:'file',private:true,excludeAI:true} } };
    const dur = chk.used.duration != null ? parseDurationCell(col(r, 'duration')) : null;
    if (dur > 86400) { errors.push({ row: i + 2, error: 'durée supérieure à 24 h : ligne non importée' }); skipped++; return; }
    if (dur != null && Number.isNaN(dur)) errors.push({ row: i + 2, error: 'durée illisible (ignorée)' });
    else if (dur != null) {s.durationSeconds = Math.max(s.durationSeconds, dur);s.data.quickLog.durationKnown=true;}
    const rpe = parseNumberCell(col(r, 'rpe')); if (rpe && !Number.isNaN(rpe)) s.data.rpe = Math.max(1, Math.min(5, Math.round(rpe)));
    if (col(r, 'note')) s.data.note = (s.data.note ? s.data.note + ' — ' : '') + col(r, 'note').slice(0, 300);
    if (col(r, 'activity')) s.data.activity = col(r, 'activity').slice(0, 60);
    const append=(a,b,max)=>!a?b.slice(0,max):a.split(' — ').includes(b)?a:(a+' — '+b).slice(0,max);
    const place=col(r,'place').slice(0,60),performance=col(r,'performance').slice(0,100);
    if(place)s.data.context={...s.data.context,envName:append(s.data.context?.envName||'',place,60)};
    if(performance)s.data.quickLog.performance=append(s.data.quickLog.performance,performance,100);
    if (exName) {
      const count = Math.max(1, Math.min(30, Math.round(n || 1)));
      s.data.exercises.push({ name: exName.slice(0, 80), sets: Array.from({ length: count }, () => ({ reps: reps || 0, load: load || 0, seconds: sec || 0, done: true })) });
    }
    sessions.set(key, s);
  });
  return { records: [...sessions.values()], errors, skipped };
}
