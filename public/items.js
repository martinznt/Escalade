// items.js — schéma des données personnelles structurées (V2), partagé par le serveur (worker.js) et le client.
// Chaque donnée est un « item » d'une collection : { c: collection, id, d: données, u: date de modification (ms), del: supprimé }.
// Le serveur applique une fusion « dernière modification gagnante » élément par élément (voir worker.js itemsPost)
// et nettoie chaque item avec ce schéma : aucune clé inconnue n'est conservée, mais chaque clé utilisée par
// l'interface DOIT figurer ici (tests/items.test.mjs vérifie l'aller-retour de chaque collection).
// Pur JavaScript, sans DOM.

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const num = (v, min, max, def = null) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
const ID_RE = /^[\w:.-]{1,80}$/;
export const cleanId = (v) => (ID_RE.test(String(v ?? '')) ? String(v) : '');

/* Types de champs : [type, ...options] */
const T = {
  s: (v, [max = 200]) => str(v, max),
  n: (v, [min = -1e9, max = 1e9, def = null]) => num(v, min, max, def),
  b: (v) => !!v,
  e: (v, [values, def]) => (values.includes(v) ? v : def),
  id: (v) => cleanId(v),
  day: (v) => (isDay(v) ? v : ''),
  ids: (v, [n = 40]) => (Array.isArray(v) ? [...new Set(v.map(cleanId).filter(Boolean))].slice(0, n) : []),
  strs: (v, [n = 20, max = 60]) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []),
  color: (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : ''),
  // Relations pondérées vers des capacités : [{ id, w }] avec 0 < w ≤ 1.
  caps: (v, [n = 8]) => (Array.isArray(v) ? v.map((x) => ({ id: cleanId(x?.id), w: num(x?.w, 0, 1, 1) })).filter((x) => x.id && x.w > 0).slice(0, n) : []),
  obj: (v, [schema]) => (v && typeof v === 'object' && !Array.isArray(v) ? clean(schema, v) : null),
  list: (v, [schema, n = 50]) => (Array.isArray(v) ? v.slice(0, n).map((x) => clean(schema, x)) : []),
};
function clean(schema, v) {
  v = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  for (const [k, spec] of Object.entries(schema)) {
    const [type, ...opts] = spec;
    const r = T[type](v[k], opts);
    if (r !== null && r !== undefined) out[k] = r;
  }
  return out;
}

const GRADE_SNAPSHOT = { systemId: ['id'], systemName: ['s', 60], levelId: ['id'], label: ['s', 30], order: ['n', 0, 999, 0], total: ['n', 0, 999, 0], color: ['color'] };
const CONTEXT = { env: ['id'], place: ['s', 80], kind: ['e', ['salle', 'falaise', 'exterieur', 'maison', ''], ''] };

// Modification « pour moi » d'un exercice ou d'une séance prête du catalogue (id = celui de l'élément modifié).
const EX_EDIT = { name: ['s', 80], emoji: ['s', 8], sets: ['n', 1, 20, null], repsMin: ['n', 0, 500, null], repsMax: ['n', 0, 500, null], secMin: ['n', 0, 7200, null], secMax: ['n', 0, 7200, null], rest: ['n', 0, 3600, null],
  cues: ['strs', 8, 200], bad: ['strs', 6, 200], why: ['s', 240], what: ['s', 240], hidden: ['b'] };
const CAT_EDIT = { name: ['s', 80], emoji: ['s', 8], why: ['s', 400], minutes: ['n', 5, 300, null], tips: ['strs', 5, 200], exjson: ['s', 4000], hidden: ['b'] };
export const SCHEMAS = {
  exedit: EX_EDIT, catedit: CAT_EDIT,
  // Activité personnalisée ou activation d'une activité native (preset = identifiant natif).
  activity: { label: ['s', 60], emoji: ['s', 8], preset: ['s', 40], aliases: ['strs', 20, 60], archived: ['b'] },
  // Catégorie d'une activité (native ou personnalisée). Sans capacité liée, la catégorie est elle-même un nœud du graphe.
  category: { activityId: ['id'], label: ['s', 60], description: ['s', 180], caps: ['caps', 8], archived: ['b'], emoji: ['s', 8], guide: ['s', 600], howTo: ['strs', 6, 220], source: ['e', ['', 'ia'], ''],
    // Ajout personnel depuis « Séance du jour » : intention, ou force / faiblesse écrite avec ses mots.
    kind: ['e', ['', 'intent', 'focus'], ''], side: ['e', ['', 'strength', 'weakness'], ''] },
  // Définition d'une métrique personnalisée (ce qui est mesuré).
  metric: { label: ['s', 80], unit: ['s', 20], kind: ['e', ['reps', 'load', 'time', 'distance', 'grade', 'pace', 'score', 'other'], 'other'], dir: ['e', [1, -1], 1], activityId: ['id'], caps: ['caps', 8], gradeActivity: ['e', ['bloc', 'voie', ''], ''], archived: ['b'] },
  // Performance : une valeur observée à un moment donné pour une métrique.
  perf: {
    metricId: ['id'], value: ['n', -1e7, 1e7, null], unknown: ['b'], unit: ['s', 20], date: ['n', 0, 9e15, 0],
    source: ['e', ['measured', 'declared', 'imported', 'session'], 'declared'], grade: ['obj', GRADE_SNAPSHOT], styles: ['ids', 12],
    context: ['obj', CONTEXT], note: ['s', 300], side: ['e', ['', 'gauche', 'droite'], ''],
  },
  goal: {
    type: ['e', ['skill', 'metric', 'grade', 'sessions', 'ascents', 'custom'], 'custom'], label: ['s', 80], skillId: ['s', 40], metricId: ['id'],
    target: ['n', -1e7, 1e7, null], current: ['n', -1e7, 1e7, null], unit: ['s', 20], gradeTarget: ['obj', GRADE_SNAPSHOT], activityId: ['id'], caps: ['caps', 8],
    status: ['e', ['active', 'done', 'archived'], 'active'], deadline: ['day'], startedAt: ['n', 0, 9e15, 0], doneAt: ['n', 0, 9e15, 0], note: ['s', 300],
    // V2 : critères de réussite, exercices liés, origine (fiche relue de l'assistant).
    criteria: ['strs', 4, 160], exercises: ['ids', 8], source: ['e', ['', 'ia'], ''],
  },
  // Journal d'escalade : un bloc / une voie tenté(e) ou réussi(e), avec la cotation au moment de la saisie.
  ascent: {
    kind: ['e', ['bloc', 'voie'], 'bloc'], name: ['s', 80], grade: ['obj', GRADE_SNAPSHOT], gradeText: ['s', 20],
    result: ['e', ['onsight', 'flash', 'send', 'work', 'top', 'attempt', 'fail'], 'attempt'], attempts: ['n', 1, 999, 1], styles: ['ids', 12], styleText: ['s', 60],
    nuance: ['e', ['', 'facile', 'moyen', 'dur'], ''],
    date: ['n', 0, 9e15, 0], context: ['obj', CONTEXT], note: ['s', 300],
  },
  // Projet d'escalade : un bloc / une voie qu'on travaille sur plusieurs séances, jusqu'à la réussite.
  project: {
    kind: ['e', ['bloc', 'voie'], 'bloc'], name: ['s', 80], grade: ['obj', GRADE_SNAPSHOT], gradeText: ['s', 20], place: ['s', 80],
    status: ['e', ['active', 'done', 'archived', 'wish'], 'active'], tries: ['list', { date: ['n', 0, 9e15, 0], n: ['n', 1, 99, 1] }, 200],
    holds: ['list', { x: ['n', 0, 1, 0], y: ['n', 0, 1, 0], t: ['e', ['main', 'pied', 'depart', 'top', 'chute'], 'main'] }, 120],
    hasPhoto: ['b'], startedAt: ['n', 0, 9e15, 0], doneAt: ['n', 0, 9e15, 0], note: ['s', 300],
    // 8.30 : point le plus haut atteint (%), sections, pourquoi on tombe ; pan maison (photo + prises) et blocs générés.
    high: ['n', 0, 100, 0], sections: ['list', { name: ['s', 40], done: ['b'] }, 12], fallWhy: ['strs', 6, 20],
    board: ['b'], problems: ['list', { name: ['s', 40], idx: ['strs', 20, 4], level: ['s', 10] }, 30],
  },
  // Programme sur plusieurs semaines : calendrier des séances (générées au moment de les faire).
  program: {
    name: ['s', 80], goal: ['e', ['climb', 'force', 'endurance', 'mobilite', 'forme', 'poids', 'goal'], 'forme'], goalId: ['id'], activityId: ['s', 40],
    weeks: ['n', 1, 24, 6], perWeek: ['n', 1, 7, 3], days: ['strs', 7, 1], minutes: ['n', 10, 180, 45], start: ['day'], status: ['e', ['active', 'done', 'stopped'], 'active'],
    sessions: ['list', { i: ['n', 0, 999, 0], week: ['n', 1, 24, 1], date: ['day'], phase: ['e', ['build', 'deload', 'test', 'specific', 'taper'], 'build'], light: ['b'], boost: ['n', 0, 3, 0], minutes: ['n', 10, 180, 45] }, 170],
    // 8.30 : objectif daté (programme construit à rebours jusqu'à cette date).
    eventDate: ['day'], eventLabel: ['s', 80],
    // 8.30 : programme tiré du carnet (la même séance prête, qui progresse : règle des 2 séances, semaine légère).
    catalogId: ['s', 60],
  },
  // Photo (JPEG réduit, en data URL) liée à un projet : même identifiant que le projet.
  photo: { data: ['s', 90000], w: ['n', 1, 4000, 1], h: ['n', 1, 4000, 1] },
  gradesys: {
    name: ['s', 60], activity: ['e', ['bloc', 'voie', 'autre'], 'bloc'], kind: ['e', ['ordered', 'colors', 'numeric'], 'ordered'],
    levels: ['list', { id: ['id'], label: ['s', 30], color: ['color'], order: ['n', 0, 999, 0] }, 60],
    maps: ['list', { levelId: ['id'], ref: ['id'], refLevel: ['s', 40] }, 150], archived: ['b'],
  },
  style: { label: ['s', 40], activity: ['s', 40], archived: ['b'] },
  env: { name: ['s', 60], type: ['e', ['maison', 'salle', 'exterieur', 'escalade', 'falaise', 'piscine', 'piste', 'autre'], 'autre'], equipment: ['ids', 40], isDefault: ['b'], archived: ['b'],
    // Salle précise : ville, cotation de la salle, espaces et leur matériel.
    // Falaise / site : ses secteurs (où l'on a grimpé).
    sectors: ['strs', 30, 60],
    city: ['s', 60], gradeSys: ['id'], areas: ['list', { id: ['e', ['bloc', 'voie', 'entrainement', 'muscu', 'etirement'], 'bloc'], items: ['ids', 30], note: ['s', 120] }, 8],
    // 8.30 : horaires d'ouverture (0 = lundi, « HH:MM »), pour caler les séances proposées.
    hours: ['list', { d: ['n', 0, 6, 0], from: ['s', 5], to: ['s', 5] }, 14],
    // 8.30 : coordonnées d'une falaise (facultatives) pour les conditions météo.
    lat: ['n', -90, 90, null], lon: ['n', -180, 180, null] },
  // Préférence explicite ou confirmée : aime / neutre / évite (jamais une suppression automatique).
  pref: { key: ['s', 80], label: ['s', 80], value: ['e', ['aime', 'neutre', 'evite'], 'neutre'], source: ['e', ['explicit', 'habit', 'questionnaire'], 'explicit'], reason: ['s', 200] },
  // Niveau déclaré par l'utilisateur pour une capacité (-1 = « je ne sais pas »).
  capdecl: { capId: ['id'], level: ['e', [-1, 0, 1, 2], -1], note: ['s', 200] },
  lab: {
    title: ['s', 80], hypothesis: ['s', 500], goalId: ['id'], capId: ['id'], metricId: ['id'], startDate: ['day'], weeks: ['n', 1, 52, 4],
    before: ['obj', { value: ['n', -1e7, 1e7, null], note: ['s', 300], date: ['n', 0, 9e15, 0] }],
    after: ['obj', { value: ['n', -1e7, 1e7, null], note: ['s', 300], date: ['n', 0, 9e15, 0] }],
    status: ['e', ['running', 'done', 'abandoned'], 'running'], conclusion: ['s', 800], criteria: ['s', 300],
  },
  jnote: { date: ['n', 0, 9e15, 0], text: ['s', 1000] },
  // V2 — mémoire des décisions d'entraînement (décision, contexte, raison, résultat éventuel).
  decision: { kind: ['e', ['strategy', 'suggestion', 'ignored', 'unusual', 'edit', 'sacrifice'], 'edit'], text: ['s', 200], reason: ['s', 300], ref: ['s', 80], sport: ['s', 40], goal: ['s', 80], date: ['n', 0, 9e15, 0], result: ['s', 300] },
  // V2 — ADN de séance (structure en %, sans exercices) et module (phases réutilisables). JSON validé à la lecture (dna.js).
  sdna: { name: ['s', 60], sport: ['s', 40], json: ['s', 12000], summary: ['s', 300] },
  smodule: { name: ['s', 60], sport: ['s', 40], json: ['s', 12000], minutes: ['n', 0, 600, 0] },
  // V2 — journal visuel : photo (données dans « photo », même identifiant), lien vidéo ou note liés à une séance / un objectif.
  media: { kind: ['e', ['photo', 'video', 'capture', 'note'], 'note'], ref: ['s', 80], refType: ['e', ['history', 'goal', 'seance'], 'history'], url: ['s', 400], note: ['s', 600],
    activity: ['s', 40], goalId: ['id'], styles: ['ids', 12], date: ['n', 0, 9e15, 0], hasPhoto: ['b'] },
  // Remplacement d'exercice effectué (sert à détecter « exercice souvent remplacé »).
  swap: { from: ['s', 80], to: ['s', 80], date: ['n', 0, 9e15, 0], where: ['e', ['generator', 'seance', 'player'], 'seance'] },
  // 8.30 — douleur notée (zone, intensité 0 à 10, côté, moment) : sert à ménager la zone et à suivre la reprise.
  pain: { zone: ['e', ['fingers', 'shoulders', 'elbows', 'wrists', 'back', 'knees', 'ankles', 'hips', 'neck', 'other'], 'other'], level: ['n', 0, 10, 0],
    side: ['e', ['', 'gauche', 'droite', 'deux'], ''], when: ['e', ['', 'repos', 'effort', 'apres', 'matin'], ''], date: ['n', 0, 9e15, 0], note: ['s', 300], healed: ['b'] },
  // 8.30 — check-in du matin (un item par jour, id « wb-AAAA-MM-JJ ») : sommeil, énergie, courbatures, stress,
  // pouls au repos (facultatif), cycle (facultatif, seulement si activé par la personne).
  wellness: { day: ['day'], at: ['n', 0, 9e15, 0], sleep: ['n', 0, 16, null], energy: ['n', 1, 5, null], soreness: ['n', 1, 5, null], stress: ['n', 1, 5, null],
    hr: ['n', 25, 220, null], period: ['b'], note: ['s', 300] },
  // 8.30 — réglages d'une machine ou d'un exercice (siège, dossier, prise…), affichés pendant la séance.
  exsetup: { key: ['s', 80], label: ['s', 80], setup: ['s', 160] },
  // 9.0 — « Mes moments » : un bloc que la personne aime faire dans ses séances (élastiques à l'échauffement, no foot
  // ou spray wall en fin de séance…). Proposé dans la structure et adapté à la séance (routines.js).
  routine: { label: ['s', 60], emoji: ['s', 8], when: ['e', ['warmup', 'start', 'middle', 'end', 'cool'], 'end'], sports: ['ids', 8], minutes: ['n', 3, 90, 10],
    libId: ['id'], needs: ['ids', 6], effort: ['e', ['easy', 'mod', 'hard'], 'mod'], fingers: ['b'], note: ['s', 200], auto: ['b'], off: ['b'] },
  // 8.30 — saison de 4 semaines autour d'un thème, et lettre à soi-même (scellée jusqu'à openAt).
  season: { theme: ['e', ['regularite', 'doigts', 'mobilite', 'endurance', 'recup', 'variete'], 'regularite'], start: ['n', 0, 9e15, 0], closed: ['b'], won: ['b'] },
  letter: { text: ['s', 3000], writtenAt: ['n', 0, 9e15, 0], openAt: ['n', 0, 9e15, 0], openedAt: ['n', 0, 9e15, 0], snap: ['s', 300] },
  // Réponse de l'utilisateur à une proposition d'habitude (pour ne pas reposer la même question).
  habit: { key: ['s', 120], decision: ['e', ['accepted', 'dismissed'], 'dismissed'] },
  // Configuration personnelle (tableau de bord, environnement par défaut…) : un item par clé.
  config: {
    blocks: ['strs', 20, 30], envId: ['id'], durations: ['strs', 10, 10], unavailable: ['ids', 40],
    // Premiers pas (questionnaire de profil, visite guidée) : réponses déclarées par l'utilisateur.
    perWeek: ['n', 1, 14, null], climbPerWeek: ['n', 0, 14, null], goal: ['e', ['climb', 'force', 'endurance', 'mobilite', 'forme', 'figure', 'poids', 'muscle', 'physique', 'sante', ''], ''], intent: ['s', 30],
    setupDone: ['b'], asked: ['strs', 30, 30],
    // Apparence choisie (item « appearance ») : suit le compte sur tous les appareils.
    mode: ['e', ['dark', 'light', 'auto', ''], ''], palette: ['s', 20], accent: ['s', 20], radius: ['s', 20], size: ['s', 4], density: ['s', 12], motion: ['s', 4], setupLater: ['n', 0, 9e15, 0], setupHidden: ['b'], tourDone: ['b'],
    vibe: ['s', 20],
    easy: ['s', 4], cb: ['s', 4], big: ['s', 4], contrast: ['s', 4],
    // Objectifs (plusieurs) et profil corporel (item « body ») : déclarés, tous facultatifs.
    goals: ['strs', 8, 20], age: ['n', 8, 100, null], height: ['n', 100, 230, null], weight: ['n', 25, 300, null], sex: ['e', ['f', 'h', 'x', ''], ''],
    shape: ['e', ['mince', 'athletique', 'moyen', 'costaud', 'rond', ''], ''], muscled: ['strs', 8, 20], physique: ['strs', 10, 20], fitness: ['n', 1, 5, null],
    breath: ['e', ['jamais', 'effort', 'escaliers', 'souvent', ''], ''], daily: ['e', ['assis', 'debout', 'physique', ''], ''], cycle: ['b'],
    // Mise en page personnalisée (item « layout ») : JSON validé à la lecture (layout.js).
    lay: ['s', 9000],
    // Formats de séance gardés (item « formats ») : JSON validé à la lecture (format.js).
    formats: ['s', 6000],
    // Notifications cochées « vu » (item « inbox »).
    seenIds: ['strs', 200, 40],
    // 8.30 — disponibilités (item « availability ») et pause vacances / blessure (item « pause »).
    slots: ['list', { d: ['n', 0, 6, 0], from: ['s', 5], to: ['s', 5] }, 21],
    pauseMode: ['e', ['', 'vacances', 'blesse'], ''], pauseFrom: ['day'], pauseTo: ['day'], pauseNote: ['s', 120],
    // 8.30 — séances du carnet mises en favori (item « catalog »).
    favs: ['strs', 300, 60],
  },
};
export const COLLECTIONS = Object.keys(SCHEMAS);

/** Nettoie un item reçu. Retourne null s'il est invalide (collection inconnue, identifiant invalide). */
export function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const c = String(x.c || ''), id = cleanId(x.id);
  if (!SCHEMAS[c] || !id) return null;
  const u = num(x.u, 0, 9e15, 0);
  if (!u) return null;
  if (x.del) return { c, id, u, del: true, d: {} };
  return { c, id, u, del: false, d: clean(SCHEMAS[c], x.d) };
}
export const itemKey = (c, id) => `${c}/${id}`;
