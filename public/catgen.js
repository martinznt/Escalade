// catgen.js — séances ciblées générées à partir de la bibliothèque (sans DOM, testé) :
// pour chaque sport, chaque qualité qu'il demande (technique de pieds, force de doigts, seuil, gainage…), chaque niveau
// et trois durées (20, 40, 60 min), une séance faite uniquement d'exercices réels de l'app qui travaillent VRAIMENT cette
// qualité (poids ≥ 0,5 dans la bibliothèque). Une combinaison sans assez d'exercices adaptés n'est pas créée : rien
// d'inventé. Chaque séance cite les références générales de sa famille d'entraînement.
import { LIBRARY } from './library.js';
import { ACTIVITIES, CAPACITIES } from './model.js';
import { normalizeEx } from './shared.js';
import { exMinutes } from './engine.js';

const SPORT_ACTS = { climbing_boulder: ['climbing_boulder'], climbing_route: ['climbing_route'], strength: ['strength'], conditioning: ['conditioning'], calisthenics: ['calisthenics'], running: ['running'], swimming: ['swimming'] };
export const DURATIONS = [20, 40, 60];
const LEVEL_WORD = ['débutant', 'intermédiaire', 'avancé'];

/** Famille d'une qualité → objectifs du carnet, références, phrase d'explication. */
const FAMILY = (cap) => {
  if (/^force_doigts|^endurance_doigts|^pince/.test(cap)) return { goals: ['climb', 'force'], sources: ['lopez2012', 'medernach2015'], why: 'des doigts plus forts ou plus résistants, avec une charge qui monte par paliers' };
  if (/^technique_escalade|^technique_pieds|^coordination/.test(cap)) return { goals: ['climb'], sources: ['saul2019'], why: 'des mouvements plus précis et plus économes, ce qui fait souvent la différence en escalade' };
  if (/^endurance_aerobie|^seuil|^vitesse/.test(cap)) return { goals: ['endurance', 'forme'], sources: ['seiler2010', 'milanovic2015'], why: 'le moteur : tenir plus longtemps ou plus vite, avec des intensités bien dosées' };
  if (/^technique_course|^technique_nage/.test(cap)) return { goals: ['endurance', 'forme'], sources: ['seiler2010'], why: 'un geste plus efficace, donc moins d’énergie dépensée pour la même vitesse' };
  if (/^mobilite/.test(cap)) return { goals: ['mobilite', 'sante'], sources: ['behm2016'], why: 'plus d’amplitude pour mieux te placer, sans perte de force si c’est fait avec contrôle' };
  if (/^gainage|^stabilite|^controle_scapulaire|^equilibre/.test(cap)) return { goals: ['forme', 'sante', 'force'], sources: ['lauersen2014', 'acsm2009'], why: 'un tronc et des épaules solides, qui transmettent la force et protègent des blessures' };
  return { goals: ['force', 'muscle'], sources: ['acsm2009', 'schoenfeld2017'], why: 'de la force utile, construite avec des séries et des repos adaptés à ton niveau' };
};
/** Un exercice propre au sport (peu d'activités) passe avant un exercice général qui travaille la même qualité. */
const score = (x, cap) => (x.caps?.[cap] || 0) + ((x.acts || []).length <= 2 ? 0.3 : 0);
const fits = (x, acts) => (x.acts || []).some((a) => acts.includes(a));
/** Séries selon le niveau (prudent au début), dans les bornes de l'exercice. */
const setsFor = (x, level) => (x.mode === 'time' && (x.secMax || 0) >= 600 ? 1 : Math.max(level === 0 ? 2 : 3, Math.min(6, (x.sets || 3) + (level - 1)))); // effort continu long : une seule fois
const amountFor = (x, level) => (x.mode === 'time' ? Math.round((level === 0 ? x.secMin || x.secMax : level === 2 ? x.secMax : (x.secMin + x.secMax) / 2) || 30) : Math.round((level === 0 ? x.repsMin || x.repsMax : level === 2 ? x.repsMax : (x.repsMin + x.repsMax) / 2) || 8));
const minutesOf = (lib, sets, amount, rest) => exMinutes(normalizeEx({ ...lib, sets, rest, ...(lib.mode === 'time' ? { secMin: amount, secMax: amount } : { repsMin: amount, repsMax: amount }) }));

export function generateCatalog() {
  const out = [];
  for (const [activity, acts] of Object.entries(SPORT_ACTS)) {
    const A = ACTIVITIES[activity]; if (!A) continue;
    const pool = LIBRARY.filter((x) => fits(x, acts));
    const warm = pool.filter((x) => x.role === 'warmup'), cool = pool.filter((x) => x.role === 'cool');
    for (const cap of Object.keys(A.caps)) {
      if (!CAPACITIES[cap]) continue;
      const fam = FAMILY(cap);
      for (const level of [0, 1, 2]) {
        // Exercices qui travaillent vraiment cette qualité, accessibles à ce niveau ; les plus ciblés d'abord.
        const main = pool.filter((x) => x.role === 'main' && (x.caps?.[cap] || 0) >= 0.5 && (x.minLevel || 0) <= level && !(level === 0 && x.intensity === 'high' && x.risk))
          .sort((a, b) => (score(b, cap) - score(a, cap)) || Math.abs((a.diff ?? 1) - (level + 1)) - Math.abs((b.diff ?? 1) - (level + 1)) || a.id.localeCompare(b.id));
        if (main.length < 2) continue;
        for (const D of DURATIONS) {
          const ex = [], used = new Set(); let total = 0;
          const add = (x, sets, amount, rest, block) => { ex.push({ libId: x.id, sets, amount, rest, block }); used.add(x.id); total += minutesOf(x, sets, amount, rest); };
          // Échauffement et retour au calme choisis d'après ce que la séance fait travailler.
          const groups = new Set(main.slice(0, 4).map((x) => x.group)), byIdIn = (arr, id) => arr.find((x) => x.id === id);
          const warmIds = ['wu-pulse', groups.has('doigts') ? 'wu-fingers' : groups.has('tirer') ? 'wu-scap-bar' : groups.has('jambes') ? 'wu-mob-lower' : groups.has('epaules') || groups.has('pousser') ? 'wu-mob-upper' : 'wu-core'];
          for (const id of D >= 40 ? warmIds : warmIds.slice(0, 1)) { const w = byIdIn(warm, id); if (w && (w.minLevel || 0) <= level) add(w, 1, amountFor(w, level), 0, 'warmup'); }
          const coolId = groups.has('doigts') ? 'cd-forearm' : groups.has('jambes') ? 'cd-hips' : groups.has('tirer') || groups.has('pousser') || groups.has('epaules') ? 'cd-shoulders' : 'cd-breath';
          const c = D >= 40 ? byIdIn(cool, coolId) || byIdIn(cool, 'cd-breath') : null;
          const budget = D - (c ? minutesOf(c, 1, amountFor(c, level), 0) : 0);
          for (const x of main) {
            if (used.has(x.id)) continue;
            const sets = setsFor(x, level), amount = amountFor(x, level), rest = Math.max(30, x.rest || 60), m = minutesOf(x, sets, amount, rest);
            if (total + m > budget * 1.1 && ex.filter((y) => !y.block).length >= 2) break;
            add(x, sets, amount, rest, '');
            if (total >= budget * 0.85) break;
          }
          // Trop long : on retire des séries à l'exercice le plus long (jamais sous 1), sinon la durée n'est pas tenue.
          for (let guard = 0; total > budget * 1.3 && guard < 30; guard++) {
            const big = ex.filter((y) => !y.block && y.sets > 1).sort((a, b) => minutesOf(LIBRARY.find((x) => x.id === b.libId), b.sets, b.amount, b.rest) - minutesOf(LIBRARY.find((x) => x.id === a.libId), a.sets, a.amount, a.rest))[0];
            if (!big) break; const lib = LIBRARY.find((x) => x.id === big.libId);
            total -= minutesOf(lib, big.sets, big.amount, big.rest) - minutesOf(lib, big.sets - 1, big.amount, big.rest); big.sets--;
          }
          if (total > budget * 1.4 || total < D * 0.6) continue; // durée annoncée non tenable : pas de séance
          const mains = ex.filter((y) => !y.block);
          if (mains.length < 2) continue;
          if (c) add(c, 1, amountFor(c, level), 0, 'cool');
          const minutes = Math.max(10, Math.round(total / 5) * 5);
          // Pas deux séances identiques pour deux durées différentes.
          const sig = ex.map((y) => `${y.libId}x${y.sets}`).join(',');
          if (out.some((e) => e.activity === activity && e.focusCap === cap && e.level === level && e.sig === sig)) continue;
          const label = CAPACITIES[cap].label;
          out.push({
            id: `gen-${activity}-${cap}-${level}-${D}`, gen: true, focusCap: cap, sig,
            name: `${label} · ${minutes} min`, emoji: A.emoji || '🎯', activity, level, minutes, goals: fam.goals,
            works: [...new Set([cap, ...mains.flatMap((y) => Object.entries(LIBRARY.find((x) => x.id === y.libId)?.caps || {}).filter(([k, v]) => v >= 0.6 && CAPACITIES[k]).map(([k]) => k))])].slice(0, 4),
            why: `Séance ciblée « ${label.toLowerCase()} » (${A.label.toLowerCase()}, niveau ${LEVEL_WORD[level]}) : ${mains.length} exercices choisis parce qu’ils travaillent surtout cette qualité. Pour ${fam.why}.`,
            tips: [level === 0 ? 'Garde 2 répétitions en réserve sur chaque série : la technique avant tout.' : level === 2 ? 'Note tes charges ou tes temps : la séance suivante pourra monter d’un cran.' : 'Si la dernière série est facile, ajoute un peu la prochaine fois.'],
            sources: fam.sources, ex,
          });
        }
      }
    }
  }
  return out.map(({ sig, ...e }) => e);
}
