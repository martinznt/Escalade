// choices.js — « ＋ Ajouter le mien » : chacun ajoute ses propres choix aux listes de l'app (zones à ménager, matériel,
// envies de séance, durées, zones musclées, souhaits de silhouette, raisons de chute). Pur, sans DOM : testé
// (tests/choices.test.mjs). Un ajout est un item « choice » du compte : { list, label, n (durée), on (coché en ce moment) }.
// Règles, sans rien inventer :
//  · un ajout qui correspond à un choix de l'app (« poignet droit » → Poignets, « corde à sauter ») coche ce choix-là :
//    il garde son effet réel, sans doublon ;
//  · sinon il est gardé tel quel, nommé partout comme les choix de l'app, et l'app dit ce qu'elle en fait vraiment
//    (CHOICE_LISTS[].effect). Les mots reconnus servent quand ils le peuvent (capacités d'une envie, muscles d'un souhait).
import { EQUIPMENT } from './model.js';
import { AVOID_ZONES, ZONE_WORDS, MUSCLE_GROUPS, keywordCaps } from './intentions.js';
import { ZONES } from './body-rules.js';
import { PHYSIQUE } from './physique.js';
import { FALL_WHY } from './sports.js';

/** Identifiants des ajouts : « my-… » (jamais un identifiant de l'app). */
export const MY = 'my-';
export const isMine = (k) => typeof k === 'string' && k.startsWith(MY);
export const MAX_PER_LIST = 30;
export const CHOICE_LISTS = {
  zone: { title: 'Zones à ménager', icon: '🩹', add: '＋ Autre zone', aria: 'Ajouter une zone à ménager',
    effect: 'Rappelée sur chaque exercice de tes séances. L’app ne sait pas quels exercices la chargent : passe ou remplace ceux qui la gênent.' },
  equipment: { title: 'Mon matériel', icon: '🧰', add: '＋ Autre matériel', aria: 'Ajouter du matériel',
    effect: 'Coché dans tes lieux et nommé partout. Un de tes moments (Mes moments) peut en avoir besoin : il n’est alors proposé que là où ce matériel est.' },
  envie: { title: 'Mes envies de séance', icon: '✨', add: '＋ Mon envie', aria: 'Écrire mon envie de séance',
    effect: 'Proposée dans « Je n’ai rien prévu ». Les mots reconnus (gainage, tractions, cardio…) orientent la séance ; sinon elle reste ton intention écrite.' },
  minutes: { title: 'Mes durées', icon: '⏱️', add: '＋ Autre durée', aria: 'Ajouter une durée, en minutes',
    effect: 'Proposée à côté des durées de l’app (séance, « Il me reste… », adapter une séance).' },
  muscled: { title: 'Zones musclées', icon: '💪', add: '＋ Autre zone', aria: 'Ajouter une zone musclée',
    effect: 'Gardée dans ton profil, comme les autres zones (à titre d’information).' },
  physique: { title: 'Ce que j’aimerais changer', icon: '🪞', add: '＋ Mon souhait', aria: 'Écrire ce que j’aimerais changer',
    effect: 'Gardé dans ton profil. Si des muscles sont reconnus (mollets, fessiers, bras…), les séances les mettent en priorité.' },
  fall: { title: 'Raisons de chute', icon: '🪂', add: '＋ Autre raison', aria: 'Ajouter une raison de chute',
    effect: 'Proposée dans tes projets d’escalade. Les mots reconnus (doigts, pieds, gainage…) orientent la séance ciblée.' },
};

const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
/** Libellé propre : sans caractère de contrôle, espaces resserrés, 40 caractères au plus. */
export const cleanLabel = (t, max = 40) => String(t ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** Forme comparable d'un libellé : sans accents, emoji, parenthèses ni pluriel. */
const core = (t) => norm(String(t).replace(/\([^)]*\)/g, ' ')).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w)).join(' ');
/** Choix de l'app équivalent : même libellé, ou une de ses parties (« Haltères / lest » → « haltères »). */
export function matchOption(text, options = []) {
  const want = core(text); if (!want) return null;
  for (const [key, label] of options) {
    if (core(label) === want || String(label).split(/[,/]/).some((p) => core(p) === want)) return { key: String(key), label: String(label).replace(/^[^\p{L}\p{N}]+/u, '') };
  }
  return null;
}
/** Durée écrite → minutes : « 75 », « 75 min », « 1 h 15 », « 1h30 », « 1,5 h ». */
export function minutesOf(text, { min = 1, max = 300 } = {}) {
  const t = norm(text).replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  let v = null, m;
  if ((m = t.match(/^(\d+(?:\.\d+)?) ?h(?:eures?)? ?(\d{1,2})? ?(?:min|mn)?$/))) v = Number(m[1]) * 60 + Number(m[2] || 0);
  else if ((m = t.match(/^(\d{1,3}) ?(?:min|mn|minutes?|m)?$/))) v = Number(m[1]);
  return v != null && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null;
}
export const fmtMinutes = (n) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ' ' + String(n % 60).padStart(2, '0') : ''}` : `${n} min`);

/* Les choix de l'app de chaque liste (pour reconnaître un ajout qui existe déjà). */
const BUILTIN = {
  zone: () => AVOID_ZONES.filter(([k]) => !isMine(k)),
  equipment: () => Object.entries(EQUIPMENT).filter(([k]) => !isMine(k)),
  muscled: () => ZONES.filter(([k]) => !isMine(k)),
  physique: () => Object.entries(PHYSIQUE).filter(([k]) => !isMine(k)).map(([k, p]) => [k, p.label]),
  fall: () => Object.entries(FALL_WHY).filter(([k]) => !isMine(k)).map(([k, f]) => [k, f[1]]),
  envie: () => [], minutes: () => [],
};
/**
 * Ce que devient un texte écrit dans « ＋ Autre… » (pur) : le choix de l'app équivalent (builtin), un ajout déjà fait
 * (existing), ou un nouvel ajout (label, n). { error } si le texte ne convient pas.
 * builtins : choix propres à un écran (envies de l'accueil, durées proposées) en plus de ceux de la liste.
 */
export function resolveChoice(list, text, { mine = [], builtins = [] } = {}) {
  if (!CHOICE_LISTS[list]) return { error: 'Liste inconnue.' };
  const own = mine.filter((x) => x.list === list);
  if (list === 'minutes') {
    const n = minutesOf(text);
    if (!n) return { error: 'Écris une durée en minutes (ex. 75) ou en heures (ex. 1 h 15), jusqu’à 5 h.' };
    if (builtins.map(Number).includes(n)) return { builtin: true, key: String(n), n, label: fmtMinutes(n) };
    const ex = own.find((x) => Number(x.n) === n);
    if (ex) return { existing: true, key: ex.id, n, label: ex.label };
    if (own.length >= MAX_PER_LIST) return { error: `Déjà ${MAX_PER_LIST} durées à toi : retire celles qui ne servent plus (Profil › Mes ajouts).` };
    return { n, label: fmtMinutes(n) };
  }
  const label = cleanLabel(text);
  if (label.length < 2) return { error: 'Écris au moins deux lettres.' };
  const b = matchOption(label, [...builtins, ...BUILTIN[list]()]);
  if (b) return { builtin: true, key: b.key, label: b.label };
  if (list === 'zone') { const t = norm(label), hit = /\bmain/.test(t) ? [] : Object.entries(ZONE_WORDS).filter(([, re]) => re.test(t)); if (hit.length === 1) { const z = AVOID_ZONES.find(([k]) => k === hit[0][0]); return { builtin: true, key: z[0], label: z[1].replace(/^\S+\s/, '') }; } }
  const ex = own.find((x) => core(x.label) === core(label));
  if (ex) return { existing: true, key: ex.id, label: ex.label };
  if (own.length >= MAX_PER_LIST) return { error: `Déjà ${MAX_PER_LIST} ajouts dans « ${CHOICE_LISTS[list].title} » : retire ceux qui ne servent plus (Profil › Mes ajouts).` };
  return { label };
}

/** Muscles reconnus dans un souhait écrit (« des mollets plus musclés » → mollets). */
export function groupsOf(text) {
  const t = norm(text), out = [];
  const W = { bras: /\bbras\b|biceps|triceps/, avantbras: /avant[- ]bras|poignet|avant bras/, epaules: /epaule|deltoide/, dos: /\bdos\b|dorsa|trapeze/, pecs: /pec|poitrine|torse/, abdos: /abdo|ventre|gainage|sangle/, lombaires: /lombaire|bas du dos/, fessiers: /fess|glute/, cuisses: /cuisse|quadri|ischio/, mollets: /mollet/ };
  for (const [g, re] of Object.entries(W)) if (re.test(t) && MUSCLE_GROUPS.some(([k]) => k === g)) out.push(g);
  return out;
}
const FAT = /gras|graisse|ventre plat|maigrir|affiner|perdre/;

/**
 * Enregistre les ajouts du compte dans les listes de l'app, pour qu'ils soient nommés et utilisés partout comme les
 * choix de l'app (matériel d'un lieu, zone à ménager, zone musclée, souhait de silhouette, raison de chute).
 * Appelé à chaque reconstruction du contexte : les ajouts d'un autre compte sont retirés d'abord (comptes séparés).
 */
export function registerMine(items = []) {
  for (const o of [EQUIPMENT, PHYSIQUE, FALL_WHY]) for (const k of Object.keys(o)) if (isMine(k)) delete o[k];
  for (const arr of [AVOID_ZONES, ZONES]) for (let i = arr.length - 1; i >= 0; i--) if (isMine(arr[i][0])) arr.splice(i, 1);
  for (const x of items) {
    if (!x || !isMine(x.id) || !x.label) continue;
    if (x.list === 'equipment') EQUIPMENT[x.id] = x.label;
    else if (x.list === 'zone') AVOID_ZONES.push([x.id, `🩹 ${x.label}`]);
    else if (x.list === 'muscled') ZONES.push([x.id, x.label]);
    else if (x.list === 'physique') PHYSIQUE[x.id] = { label: x.label, emoji: '✍️', groups: groupsOf(x.label), measures: FAT.test(norm(x.label)) ? ['tour_taille'] : [], fat: FAT.test(norm(x.label)), mine: true };
    else if (x.list === 'fall') FALL_WHY[x.id] = ['✍️', x.label, keywordCaps(x.label), `« ${x.label} » : note à chaque essai ce que tu changes, pour voir ce qui marche.`];
  }
}
/** Zones à ménager ajoutées et cochées « en ce moment » (rappelées pendant les séances). */
export const zonesOn = (items = []) => items.filter((x) => x.list === 'zone' && x.on && isMine(x.id) && x.label);
