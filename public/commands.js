// commands.js — commandes en langage naturel, déterministes (aucune IA externe, cahier des charges §5.7).
// parseCommand() transforme une phrase en INTENTION STRUCTURÉE, sans jamais rien exécuter elle-même.
//  - une phrase non reconnue retourne { type: 'unknown' } : aucune action n'est inventée ;
//  - une phrase qui correspond à plusieurs intentions proches retourne { type: 'ambiguous', options } ;
//  - toute action destructive porte confirm: true ; chaque intention porte un résumé « ce que j'ai compris ».
// Pur JavaScript, sans DOM : testé avec Node (tests/commands.test.mjs).

const norm = (s) => String(s || '').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const stripEdges = (s) => String(s || '').replace(/^[\s.,;:!?'"«»]+|[\s.,;:!?'"«»]+$/g, '').trim();

// Zones / capacités évoquées → mots-clés utilisés par le générateur (generator.js BODY_WORDS).
const FOCUS_WORDS = {
  jambes: ['jambe', 'jambes', 'cuisse', 'cuisses', 'quadri', 'squat'], fessiers: ['fessier', 'fessiers'],
  dos: ['dos', 'dorsaux', 'dorsal'], tirage: ['tirage', 'tirer', 'traction', 'tractions'], bras: ['bras', 'biceps', 'triceps'],
  pecs: ['pecs', 'pectoraux', 'poitrine'], poussee: ['poussee', 'pousser', 'pompes'], epaules: ['epaule', 'epaules'],
  abdos: ['abdos', 'abdominaux', 'ventre'], gainage: ['gainage', 'tronc', 'core'], doigts: ['doigt', 'doigts', 'reglette', 'reglettes', 'poutre'],
  avantbras: ['avant-bras', 'avant bras', 'avantbras'], mobilite: ['mobilite', 'etirement', 'etirements'], souplesse: ['souplesse', 'assouplissement'],
  cardio: ['cardio'], endurance: ['endurance', 'resistance', 'foncier'], vitesse: ['vitesse', 'sprint', 'fractionne'], explosivite: ['explosivite', 'detente', 'puissance', 'saut'],
  equilibre: ['equilibre', 'proprioception'], dalle: ['dalle'], devers: ['devers'], technique: ['technique'],
};
// Anciens objectifs escalade du générateur historique (compatibilité).
const CLIMB_FOCUS = { jambes: 'jambes', devers: 'devers', dalle: 'dalle', doigts: 'reglette', endurance: 'resistance', vitesse: 'vitesse', explosivite: 'vitesse', equilibre: 'equilibre', gainage: 'equilibre' };
const ACTIVITY_WORDS = {
  climbing_boulder: ['bloc', 'blocs', 'boulder', 'escalade', 'grimpe'], climbing_route: ['voie', 'voies', 'couenne', 'falaise'],
  strength: ['muscu', 'musculation', 'salle de sport', 'fonte'], conditioning: ['renfo', 'renforcement', 'poids du corps', 'prepa', 'preparation physique', 'calisthenics', 'street workout'],
  running: ['course', 'courir', 'running', 'footing', 'jogging', 'trail'], swimming: ['natation', 'nager', 'piscine', 'crawl'],
};
const EQUIPMENT_WORDS = {
  bar: ['barre de traction', 'barre'], hangboard: ['poutre'], wall: ["mur d'escalade", 'mur', "salle d'escalade"], weights: ['halteres', 'haltere', 'lest'],
  band: ['elastique', 'elastiques'], rings: ['anneaux'], kettlebell: ['kettlebell', 'kettle'], bench: ['banc'], box: ['box'], rope: ['corde a sauter', 'corde'],
  mat: ['tapis de sol', 'tapis'], pool: ['piscine', 'bassin'], dips: ['barres paralleles', 'dips'], barbell: ['barre olympique', 'disques'], pole: ['poteau', 'espalier'],
};
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function extractMinutes(text) {
  let m = text.match(/(\d{1,2})\s*h\s*(\d{1,2})?\b/);
  if (m && /\d\s*h\b|\d\s*h\s*\d/.test(text)) return clampMin(Number(m[1]) * 60 + Number(m[2] || 0));
  m = text.match(/(\d{1,3})\s*(?:min|minute|minutes|mn|mins)\b/);
  if (m) return clampMin(Number(m[1]));
  if (/\bdemi[- ]heure\b/.test(text)) return 30;
  if (/\bquart d'heure\b/.test(text)) return 15;
  if (/\btrois quarts d'heure\b/.test(text)) return 45;
  if (/\bune heure\b/.test(text)) return 60;
  return null;
}
const clampMin = (n) => Math.max(5, Math.min(180, n));
function sizeFromMinutes(min) { if (min == null) return null; return min <= 22 ? 'petite' : min <= 40 ? 'moyenne' : 'grosse'; }
function matchAll(text, dict) { return Object.entries(dict).filter(([, words]) => words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, '[- ]?')}([^a-z]|$)`).test(text))).map(([k]) => k); }
function extractDate(text, now = new Date()) {
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  if (/\bapres[- ]demain\b/.test(text)) d.setDate(d.getDate() + 2);
  else if (/\bdemain\b/.test(text)) d.setDate(d.getDate() + 1);
  else if (/\baujourd'?hui\b|\bce soir\b|\bce matin\b/.test(text)) { /* aujourd'hui */ }
  else {
    const i = DAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(text));
    if (i < 0) return null;
    const diff = (i - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
  }
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const cleanQuery = (q) => stripEdges(q.replace(/\b(de la seance|dans la seance|de ma seance|aujourd'hui|stp|s'il te plait|svp)\b/g, '').replace(/^(?:les|le|la|l'|des|du|de la|de|d'|mes|mon|ma)\s+/, ''));

/**
 * Interprète une phrase. Ne modifie jamais rien : l'appelant exécute l'intention, et doit demander
 * confirmation si confirm === true, ou afficher summary avant une opération importante.
 */
export function parseCommand(raw, now = new Date()) {
  const text = norm(raw);
  if (!text) return { type: 'unknown', raw };
  const minutes = extractMinutes(text);
  const focuses = matchAll(text, FOCUS_WORDS);
  const acts = matchAll(text, ACTIVITY_WORDS);
  const light = /\b(leger|legere|facile|doux|douce|recup|recuperation|tranquille|cool)\b/.test(text);
  const found = [];
  const add = (c, score) => found.push({ ...c, raw, score });

  // Consultation (aucune modification)
  if (/\b(que|quoi|qu'est[- ]ce que)\b.*\b(faire|fais|dois)\b.*\b(aujourd'?hui|ce soir|ce matin|maintenant)\b|\bje fais quoi\b|\bquoi faire\b/.test(text)) add({ type: 'today', summary: 'Proposer des options pour aujourd’hui.' }, 3);
  if (/\b(records?|pr|meilleures? perfs?)\b/.test(text) && /\b(montre|affiche|voir|quels?|mes|donne)\b/.test(text)) add({ type: 'showRecords', summary: 'Afficher tes records.' }, 3);
  if (/\b(progression|progres|evolution|resume|bilan)\b/.test(text) && !/\bpourquoi\b/.test(text)) add({ type: 'showProgress', period: /\bmois\b/.test(text) ? 'month' : 'week', summary: `Afficher ton résumé ${/\bmois\b/.test(text) ? 'du mois' : 'de la semaine'}.` }, 2.5);
  if (/\bqu'est[- ]ce qui me bloque\b|\bce qui me bloque\b|\bbloque pour\b/.test(text)) add({ type: 'blockers', query: stripEdges((text.match(/\b(?:pour|sur)\s+(?:le |la |l'|mon |ma )?(.+)$/) || [])[1] || ''), summary: 'Analyser ce qui semble limiter un objectif.' }, 3);
  if (/\bpourquoi\b.*\b(progresse|stagne|avance)\b/.test(text)) add({ type: 'whyNoProgress', summary: 'Chercher des hypothèses dans tes données.' }, 3);
  let m;
  if ((m = text.match(/\b(?:cherche|recherche|trouve|retrouve)\s+(.+)$/))) add({ type: 'search', query: cleanQuery(m[1]), summary: `Rechercher « ${cleanQuery(m[1])} ».` }, 2.5);

  // Modifications de la séance ouverte
  if (/\bsupprim|\befface/.test(text) && /\bderniere seance\b/.test(text)) add({ type: 'deleteLastHistory', confirm: true, summary: 'Supprimer la dernière séance de ton historique.' }, 4);
  if ((m = text.match(/\b(?:remplace|change|echange)\s+(.+?)(?:\s+par\s+(.+))?$/))) { const q = cleanQuery(m[1]); if (q && !/^(la seance|ma seance)$/.test(q)) add({ type: 'swapExercise', query: q, by: m[2] ? cleanQuery(m[2]) : '', summary: `Remplacer « ${q} » dans la séance ouverte.` }, 3); }
  if ((m = text.match(/\bje (?:ne )?veux (?:pas|plus) (?:faire )?(?:de |d'|les |le |la |des )?(.+)$/))) add({ type: 'swapExercise', query: cleanQuery(m[1]), summary: `Remplacer « ${cleanQuery(m[1])} » dans la séance ouverte.` }, 2);
  if ((m = text.match(/\b(?:enleve|retire|supprime)\s+(.+)$/)) && !/derniere seance/.test(text)) { const q = cleanQuery(m[1]); if (q) add({ type: 'removeExercise', query: q, confirm: true, summary: `Retirer « ${q} » de la séance ouverte.` }, 3); }
  if ((m = text.match(/\b(?:ajoute|rajoute|mets|met)(?:[- ]moi)?\s+(.+)$/))) {
    const q = cleanQuery(m[1].replace(/\d+\s*(?:min|minute|minutes|mn)\b/, '').replace(/^\s*(?:de|des|du|d')\s+/, ''));
    if (q) add({ type: 'addExercise', minutes, query: q, summary: `Ajouter ${minutes ? minutes + ' min de ' : ''}« ${q} » à la séance ouverte.` }, 3);
  }
  if (/\b(n'ai que|j'ai que|ai seulement|seulement|reste|raccourci|adapte|reduis|plus que)\b/.test(text) && minutes && !/\b(fais|genere|cree|propose|prepare)\b/.test(text)) add({ type: 'adaptDuration', minutes, summary: `Reconstruire la séance ouverte pour ${minutes} minutes.` }, 3.5);

  // Matériel qui change aujourd'hui
  const eqs = matchAll(text, EQUIPMENT_WORDS);
  if (eqs.length && /\b(pas de|sans|n'ai pas|plus de|pas d'|indisponible)\b/.test(text)) add({ type: 'equipmentOff', equipment: eqs, summary: `Considérer comme indisponible : ${eqs.join(', ')}.` }, 3);
  else if (eqs.length && /\b(j'ai|avec|dispose|disponible|ajoute)\b/.test(text) && !/\bseance\b/.test(text)) add({ type: 'equipmentOn', equipment: eqs, summary: `Considérer comme disponible : ${eqs.join(', ')}.` }, 1.5);

  // Planifier / lancer
  const date = extractDate(text, now);
  if (/\b(planifie|programme|prevois|cale)\b/.test(text)) add({ type: 'plan', date, summary: date ? `Planifier une séance le ${date}.` : 'Planifier une séance (date à préciser).' }, 3);
  if (/\b(lance|demarre|commence)\b.*\b(seance|entrainement)\b/.test(text) && !/\b(genere|fais|cree)\b/.test(text)) add({ type: 'start', summary: 'Lancer la séance ouverte.' }, 2.5);

  // Générer une séance
  const wantsSession = /\b(seance|entrainement|workout|session|circuit)\b/.test(text);
  const verb = /\b(fais|fait|faire|genere|generer|cree|creer|propose|donne|prepare|construis|invente)\b/.test(text);
  if ((wantsSession && (verb || minutes || acts.length || focuses.length)) || (verb && minutes) || (/\bj'ai\s+\d+\s*(?:min|minutes)/.test(text) && !found.some((f) => f.type === 'adaptDuration'))) {
    const focus = focuses[0] || null;
    add({
      type: 'generate', minutes, size: sizeFromMinutes(minutes), focus: CLIMB_FOCUS[focus] || focus, focuses, activity: acts[0] || null, light,
      summary: `Générer une séance${minutes ? ' de ' + minutes + ' min' : ''}${focuses.length ? ' ciblant ' + focuses.join(', ') : ''}${acts[0] ? ' (' + acts[0] + ')' : ''}${light ? ', légère' : ''}.`,
    }, 3 + (wantsSession ? 0.5 : 0));
  }

  if (!found.length) return { type: 'unknown', raw };
  found.sort((a, b) => b.score - a.score);
  const [best, second] = found;
  if (second && best.score - second.score < 0.3 && best.type !== second.type) return { type: 'ambiguous', raw, options: found.slice(0, 3), summary: 'Plusieurs interprétations possibles : choisis celle que tu voulais.' };
  const { score, ...out } = best;
  return out;
}
