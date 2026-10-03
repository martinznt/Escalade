// explain.js — pour chaque exercice et chaque séance : « C'est quoi ? », « À quoi ça sert ? », « Pourquoi ici ? ».
// Tout est construit à partir des vraies données (type d'exercice, matériel, muscles, capacités, rôle dans la séance) :
// rien n'est inventé. Un texte écrit par un administrateur (« what ») ou par l'utilisateur (« Pourquoi ») passe devant. Sans DOM, testé.
import { byId } from './library.js';
import { CAPACITIES, EQUIPMENT } from './model.js';
import { sessionMinutes } from './engine.js';
import { CATS, categoriesOf, sportsOf, intensityOf, INTENSITY_LABEL } from './sfilter.js';

const KIND = {
  skill: 'Un exercice de technique d’escalade', finger: 'Un exercice de force des doigts à la poutre', wallfinger: 'Un exercice de doigts sur le mur',
  prehab: 'Un exercice de prévention des blessures', power: 'Un exercice de puissance (mouvements rapides et intenses)', pull: 'Un exercice de tirage (dos et bras)',
  lock: 'Un exercice de blocage (tenir bras fléchis)', core: 'Un exercice de gainage (le tronc)', endurance: 'Un exercice d’endurance', speed: 'Un exercice de vitesse',
  plyo: 'Un exercice de sauts (pliométrie)', legs: 'Un exercice pour les jambes', antagonist: 'Un exercice de poussée et d’épaules, qui équilibre le tirage',
  raise: 'Une mise en route douce du cœur', mobilize: 'Un mouvement de mobilité des articulations', activate: 'Un exercice d’activation des muscles',
  potentiate: 'Une montée en intensité juste avant l’effort', cool: 'Un exercice de retour au calme', mobility: 'Un exercice de mobilité et de souplesse',
  recovery: 'Un exercice de récupération', run: 'Un exercice de course à pied', swim: 'Un exercice de natation',
};
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} et ${a.at(-1)}`);
const capsOf = (e) => { const lib = byId(e.libId); return e.caps && Object.keys(e.caps).length ? e.caps : lib?.caps || {}; };
const topCaps = (caps, n = 3) => Object.entries(caps).filter(([k]) => CAPACITIES[k]).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => CAPACITIES[k].label.toLowerCase());
const catsOfCaps = (caps) => { const w = {}; for (const [c, v] of Object.entries(caps)) for (const [k, C] of Object.entries(CATS)) if (C.caps.includes(c)) w[k] = (w[k] || 0) + v; return Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k]) => k); };

/** C'est quoi ? Une phrase : le type d'exercice, comment il se fait (temps ou répétitions), le matériel, les muscles. */
/** « de course », mais « d’escalade » devant une voyelle. */
const deOf = (w) => (/^[aeiouyhéèêàâîôû]/i.test(w) ? `d’${w}` : `de ${w}`);
export function exWhat(e) {
  const lib = byId(e.libId) || {}, x = { ...lib, ...e };
  if (lib.what || e.what) return e.what || lib.what;
  const kind = KIND[lib.kind] || (x.group ? `Un exercice « ${x.group} »` : 'Un exercice');
  const dur = (a, b) => (b >= 90 ? (Math.round(a / 60) && Math.round(a / 60) !== Math.round(b / 60) ? `${Math.round(a / 60)} à ${Math.round(b / 60)} min` : `${Math.round(b / 60)} min`) : a && a !== b ? `${a} à ${b} s` : `${b} s`);
  const unit = (n) => { const u = x.unit && x.unit !== 'reps' ? x.unit : 'répétitions'; return n === 1 ? u.replace(/s$/, '') : u; };
  const how = x.mode === 'time' ? (x.secMax ? `à tenir ${dur(x.secMin, x.secMax)}` : 'à tenir dans le temps')
    : x.repsMax ? `${x.repsMin && x.repsMin !== x.repsMax ? `${x.repsMin} à ${x.repsMax}` : x.repsMax} ${unit(x.repsMax)}` : '';
  const needs = (x.needs || []).map((k) => EQUIPMENT[k]).filter((v) => typeof v === 'string');
  const mus = (x.muscles || []).slice(0, 4);
  return `${kind}${how ? ` : ${how}` : ''}. ${needs.length ? `Matériel : ${list(needs).toLowerCase()}.` : 'Sans matériel.'}${mus.length ? ` Muscles : ${list(mus)}.` : ''}`;
}
/** À quoi ça sert ? Le bénéfice (texte de la bibliothèque) et ce que l'exercice développe. */
export function exUse(e) {
  const lib = byId(e.libId), t = topCaps(capsOf(e));
  const base = lib?.why || (!lib && e.why) || ''; // exercice perso : son « pourquoi » dit à quoi il sert
  const dev = t.length ? `Développe : ${list(t)}.` : '';
  return [base, dev].filter(Boolean).join(' ') || '';
}
/** Pourquoi ici ? Son rôle dans cette séance : la raison du générateur, sinon sa place (échauffement, corps, retour au calme) et le lien avec le but de la séance. */
export function exWhyHere(e, s) {
  const lib = byId(e.libId);
  if (lib && e.why && e.why !== lib.why) return e.why; // raison donnée par le générateur
  if (e.block === 'warmup') return 'Dans l’échauffement : prépare les muscles et les articulations, pour être plus efficace et limiter les blessures.';
  if (e.block === 'cool') return 'Au retour au calme : fait redescendre le rythme et garde la souplesse après l’effort.';
  if (!s) return '';
  const mine = catsOfCaps(capsOf(e)), goal = categoriesOf(s), common = mine.filter((k) => goal.includes(k));
  const part = e.part && !/Corps de séance/.test(e.part) ? `Partie « ${e.part.replace(/^\S+\s/, '')} » : ` : '';
  const cap = (t) => (part ? part + t : t[0].toUpperCase() + t.slice(1));
  if (common.length) return cap(`sert le but de la séance (${list(common.map((k) => CATS[k].label.toLowerCase()))}).`);
  if (mine.length) return cap(`complète la séance avec un peu de ${CATS[mine[0]].label.toLowerCase()}.`);
  return part ? `${part}fait partie de cette partie de la séance.` : '';
}

/** C'est quoi ? Sports, nombre d'exercices, durée, parties, intensité. `sportLabel(id)` donne le nom d'un sport. */
export function sessionWhat(s, sportLabel = (x) => x, minutes = 0) {
  const sp = sportsOf(s).map(sportLabel), main = s.exercises.filter((e) => e.block === 'main').length || s.exercises.length;
  const parts = [...new Set(s.exercises.map((e) => e.part).filter(Boolean))].map((p) => p.replace(/^\S+\s/, ''));
  const it = INTENSITY_LABEL(intensityOf(s));
  return `${sp.length ? `Une séance ${sp.length > 1 ? 'multi-sports ' : ''}${deOf(list(sp).toLowerCase())}` : 'Une séance'} : ${main} exercice${main > 1 ? 's' : ''} en ~${minutes || sessionMinutes(s)} min${parts.length > 1 ? `, en ${parts.length} parties (${list(parts.map((p) => p.toLowerCase()))})` : ''}.${it ? ` Intensité ${it}.` : ''}`;
}
/** À quoi ça sert ? Ses catégories et ce qu'elle développe le plus. */
export function sessionUse(s) {
  const w = {}; for (const e of s.exercises.filter((x) => x.block === 'main')) for (const [c, v] of Object.entries(capsOf(e))) w[c] = (w[c] || 0) + v * (e.sets || 1);
  const cats = categoriesOf(s).map((k) => (CATS[k] ? CATS[k].label.toLowerCase() : k)), t = topCaps(w);
  if (!cats.length && !t.length) return '';
  return `${cats.length ? `Travailler ${list(cats)}` : 'Travailler'}${t.length ? ` : surtout ${list(t)}` : ''}.`;
}
/** Pourquoi ? Le pourquoi écrit par l'utilisateur, sinon celui de la séance (générée, prête, fusionnée), ses objectifs ou ses intentions. */
export function sessionWhy(s, intentionLabel = (x) => x) {
  const note = (t) => s.notes?.find((n) => n.title === t)?.text || '';
  const first = (t) => String(t).split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  const mine = note('Pourquoi'); if (mine) return { text: mine, mine: true };
  for (const t of ['Pourquoi cette séance', 'Pourquoi', 'Séance fusionnée']) { const v = note(t); if (v) return { text: first(v), mine: false }; }
  if (s.objectives?.length) return { text: s.objectives[0], mine: false };
  if (s.intentions?.length) return { text: `Tes intentions : ${list(s.intentions.map((x) => intentionLabel(x.id)).map((x) => String(x).toLowerCase()))}.`, mine: false };
  return { text: '', mine: false };
}
