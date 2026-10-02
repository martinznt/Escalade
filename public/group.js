// group.js — « Séance à plusieurs » : le déroulé partagé d'une séance pour un groupe (2 à 30 personnes), selon le
// matériel disponible et le format choisi. Pur et déterministe : chaque téléphone recalcule le même déroulé à partir
// de la séance, de la liste des participants (figée au lancement) et des réglages de l'organisateur.
// Formats :
//  · together : tout le monde en même temps (s'il y a assez de matériel ; sinon l'exercice passe en « à tour de rôle ») ;
//  · waves    : à tour de rôle par vagues (autant de personnes à la fois que de matériel) ; le temps où les autres
//               travaillent compte dans ton repos (et un repos minimum est garanti) ;
//  · stations : ateliers : chaque personne sur un exercice, tout le monde tourne au signal ;
//  · auto     : ensemble quand le matériel suffit, à tour de rôle sinon.
// Intervalles (ex. « 7 s / 3 s » à la poutre) : à plusieurs sur une seule poutre, chacun suspend pendant que l'autre
// se repose — la pause réelle s'allonge (dit à l'écran), jamais elle ne raccourcit sous ce qui était prévu.
import { byId } from './library.js';
import { EQUIPMENT } from './model.js';

export const GROUP_MAX = 30;
export const FORMATS = {
  auto: ['🤖 Automatique', 'Ensemble quand il y a assez de matériel, à tour de rôle sinon.'],
  together: ['👥 Tous en même temps', 'Tout le monde fait le même exercice au même moment (il faut un matériel par personne).'],
  waves: ['🔁 Chacun son tour', 'Par vagues : pendant qu’une vague travaille, les autres regardent et récupèrent (ça compte dans leur repos).'],
  stations: ['🔄 Ateliers en rotation', 'Chacun sur un exercice différent, tout le monde change au signal (circuit).'],
};
const int = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const CHANGE = 10; // secondes pour changer d'atelier ou de personne

/** Réglages nettoyés (côté serveur aussi) : format, matériel disponible (nombre), intervalles par exercice. */
export function cleanConfig(c = {}) {
  const x = c && typeof c === 'object' ? c : {};
  const equip = {};
  for (const [k, v] of Object.entries(x.equip || {})) if (EQUIPMENT[k] && Object.keys(equip).length < 40) equip[k] = int(v, 0, 50, 1);
  const intervals = {};
  for (const [k, v] of Object.entries(x.intervals || {})) if (/^\d{1,3}$/.test(k) && v && typeof v === 'object' && Object.keys(intervals).length < 60) intervals[k] = { on: int(v.on, 1, 600, 7), off: int(v.off, 0, 600, 3), reps: int(v.reps, 1, 100, 6) };
  return { format: FORMATS[x.format] ? x.format : 'auto', equip, intervals, stationSec: int(x.stationSec, 15, 600, 45), rounds: int(x.rounds, 1, 10, 2), waveSize: int(x.waveSize, 0, GROUP_MAX, 0), minRest: x.minRest === false ? false : true };
}
/** Intervalle d'un exercice : réglé par l'organisateur, sinon lu dans son nom (« Repeaters 7/3 »). */
export function intervalOf(ex, idx, cfg = {}) {
  const o = cfg.intervals?.[idx]; if (o) return o;
  const m = String(ex?.name || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m && ex.mode === 'time') { const on = Number(m[1]), off = Number(m[2]); return { on, off, reps: Math.max(1, Math.round((ex.secMin || 60) / (on + off))) }; }
  return null;
}
/** Durée d'un effort (secondes) : chrono de l'exercice, ou estimation pour des répétitions (≈ 3 s par répétition). */
export const workSec = (ex) => (ex.mode === 'time' ? Math.max(5, ex.secMin || 30) : Math.max(20, Math.round((ex.repsMax || ex.repsMin || 8) * 3)));
const needsOf = (ex) => (ex.needs?.length ? ex.needs : byId(ex.libId)?.needs || []);
/** Combien de personnes peuvent faire l'exercice en même temps avec le matériel annoncé (Infinity = sans limite). */
export function capacity(ex, cfg = {}) {
  let cap = Infinity;
  for (const n of needsOf(ex)) if (cfg.equip?.[n] != null) cap = Math.min(cap, cfg.equip[n]);
  return cap;
}
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

/**
 * Déroulé du groupe. session : séance normalisée ; people : noms (ordre = ordre d'arrivée, figé au lancement) ;
 * cfg : cleanConfig(). Retourne { steps, notes, total } ; une étape = { dur, title, ex, set, sets, kind, as: { nom: { role, ex, what } } }.
 * role : 'work' | 'rest' | 'change'.
 */
export function groupPlan(session, people = [], cfg0 = {}) {
  const cfg = cleanConfig(cfg0), P = [...new Set(people.map((p) => String(p).slice(0, 40)))].slice(0, GROUP_MAX), steps = [], notes = [];
  if (!P.length) return { steps, notes, total: 0 };
  const exs = (session?.exercises || []).map((e, i) => ({ ...e, _i: i }));
  const all = (role, ex, what) => Object.fromEntries(P.map((p) => [p, { role, ex, what }]));
  const push = (st) => { if (st.dur > 0) steps.push(st); };
  const together = (e) => {
    const sets = Math.max(1, e.sets || 1), iv = intervalOf(e, e._i, cfg), rest = Math.max(0, e.rest || 0);
    for (let s = 1; s <= sets; s++) {
      if (iv) for (let r = 1; r <= iv.reps; r++) { push({ dur: iv.on, title: e.name, ex: e._i, set: s, sets, rep: r, reps: iv.reps, kind: 'work', as: all('work', e._i, `${iv.on} s`) }); if (r < iv.reps) push({ dur: iv.off, title: 'Pause', ex: e._i, set: s, sets, kind: 'rest', as: all('rest', e._i, `${iv.off} s de pause`) }); }
      else push({ dur: workSec(e), title: e.name, ex: e._i, set: s, sets, kind: 'work', as: all('work', e._i, e.mode === 'time' ? `${workSec(e)} s` : `${e.repsMin}${e.repsMax > e.repsMin ? '–' + e.repsMax : ''} rép.`) });
      if (s < sets && rest) push({ dur: rest, title: 'Repos', ex: e._i, set: s, sets, kind: 'rest', as: all('rest', e._i, 'repos') });
    }
  };
  const waves = (e, cap) => {
    const sets = Math.max(1, e.sets || 1), iv = intervalOf(e, e._i, cfg), W = chunk(P, Math.max(1, Math.min(cap, P.length))), rest = Math.max(0, e.rest || 0);
    const label = (w) => (w.length === 1 ? w[0] : w.join(', '));
    if (W.length > 1) notes.push(`« ${e.name} » : ${cap} ${cap > 1 ? 'places' : 'place'} pour ${P.length} → ${W.length} vagues (${W.map(label).join(' / ')}). Pendant qu’une vague travaille, les autres récupèrent.`);
    for (let s = 1; s <= sets; s++) {
      if (iv) {
        // Intervalles partagés : chaque vague fait sa suspension à son tour ; la pause réelle = le temps des autres.
        const othersOn = (W.length - 1) * iv.on;
        if (W.length > 1 && s === 1) notes.push(`« ${e.name} » ${iv.on} s / ${iv.off} s à plusieurs : chacun travaille ${iv.on} s pendant que les autres récupèrent → pause réelle ${Math.max(iv.off, othersOn)} s au lieu de ${iv.off} s${othersOn < iv.off ? '' : ' (plus de repos, même travail)'}.`);
        for (let r = 1; r <= iv.reps; r++) {
          W.forEach((w, k) => push({ dur: iv.on, title: e.name, ex: e._i, set: s, sets, rep: r, reps: iv.reps, kind: 'work', as: Object.fromEntries(P.map((p) => [p, w.includes(p) ? { role: 'work', ex: e._i, what: `${iv.on} s` } : { role: 'rest', ex: e._i, what: `${label(w)} travaille` }])) }));
          if (r < iv.reps && othersOn < iv.off) push({ dur: iv.off - othersOn, title: 'Pause', ex: e._i, set: s, sets, kind: 'rest', as: all('rest', e._i, 'pause') });
        }
      } else {
        const ws = workSec(e);
        W.forEach((w) => push({ dur: ws, title: e.name, ex: e._i, set: s, sets, kind: 'work', as: Object.fromEntries(P.map((p) => [p, w.includes(p) ? { role: 'work', ex: e._i, what: e.mode === 'time' ? `${ws} s` : `${e.repsMin}${e.repsMax > e.repsMin ? '–' + e.repsMax : ''} rép.` } : { role: 'rest', ex: e._i, what: `${label(w)} travaille` }])) }));
      }
      // Repos minimum garanti : si le temps des autres vagues ne suffit pas, on complète.
      const waited = (W.length - 1) * (iv ? iv.on * iv.reps : workSec(e)), extra = cfg.minRest && rest > waited ? rest - waited : 0;
      if (s < sets && extra) push({ dur: extra, title: 'Repos', ex: e._i, set: s, sets, kind: 'rest', as: all('rest', e._i, `repos (${waited ? `${waited} s déjà récupérées pendant les autres` : 'prévu'})`) });
    }
  };
  const blocks = ['warmup', 'main', 'cool'];
  for (const b of blocks) {
    const list = exs.filter((e) => (e.block || 'main') === b);
    if (!list.length) continue;
    if (b === 'main' && cfg.format === 'stations' && list.length > 1) {
      // Ateliers : chaque exercice est un atelier ; places par atelier = matériel (sans limite = autant que nécessaire).
      const S = list.length, per = Math.ceil(P.length / S), seats = [];
      list.forEach((e) => { const c = Math.min(per, capacity(e, cfg)); for (let k = 0; k < c; k++) seats.push(e); });
      const slots = Math.max(P.length, seats.length), wait = Math.max(0, P.length - seats.length);
      notes.push(`Ateliers : ${S} exercices, ${seats.length} place${seats.length > 1 ? 's' : ''}${wait ? `, ${wait} personne${wait > 1 ? 's' : ''} en récupération à chaque tour` : ''} ; changement toutes les ${cfg.stationSec} s, ${cfg.rounds} tour${cfg.rounds > 1 ? 's' : ''} complet${cfg.rounds > 1 ? 's' : ''}.`);
      const turns = slots * cfg.rounds;
      for (let r = 0; r < turns; r++) {
        const as = Object.fromEntries(P.map((p, k) => { const seat = seats[(k + r) % slots]; return [p, seat ? { role: 'work', ex: seat._i, what: seat.name } : { role: 'rest', ex: -1, what: 'récupération (prochain atelier au signal)' }]; }));
        push({ dur: cfg.stationSec, title: `Atelier ${r + 1}/${turns}`, ex: -1, set: Math.floor(r / slots) + 1, sets: cfg.rounds, kind: 'work', as });
        if (r < turns - 1) push({ dur: CHANGE, title: 'On tourne', ex: -1, kind: 'change', as: all('change', -1, 'change d’atelier') });
      }
      continue;
    }
    for (const e of list) {
      const cap = capacity(e, cfg), enough = cap >= P.length;
      if (cap === 0) { notes.push(`« ${e.name} » : aucun ${needsOf(e).map((n) => EQUIPMENT[n] || n).join(', ').toLowerCase()} disponible → passé.`); continue; }
      if (cfg.format === 'waves' && b === 'main') waves(e, Math.min(cap, cfg.waveSize || Math.max(1, Math.ceil(P.length / 2))));
      else if (enough || P.length === 1) together(e);
      else waves(e, cap);
      if (e !== list.at(-1)) push({ dur: CHANGE, title: 'Exercice suivant', ex: e._i, kind: 'change', as: all('change', e._i, 'on passe au suivant') });
    }
  }
  return { steps, notes: [...new Set(notes)], total: steps.reduce((t, s) => t + s.dur, 0) };
}
/** Ce que fait une personne : temps de travail, de repos, et les exercices faits (pour l'historique). */
export function personSummary(plan, name, session) {
  let work = 0, rest = 0; const done = {};
  for (const s of plan.steps) { const a = s.as[name]; if (!a) continue; if (a.role === 'work') { work += s.dur; if (a.ex >= 0) done[a.ex] = (done[a.ex] || 0) + 1; } else rest += s.dur; }
  return { work, rest, exercises: Object.entries(done).map(([i, n]) => ({ ex: session?.exercises?.[i], n })).filter((x) => x.ex) };
}
