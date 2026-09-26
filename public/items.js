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

export const SCHEMAS = {
  // Activité personnalisée ou activation d'une activité native (preset = identifiant natif).
  activity: { label: ['s', 60], emoji: ['s', 8], preset: ['s', 40], aliases: ['strs', 20, 60], archived: ['b'] },
  // Catégorie d'une activité (native ou personnalisée). Sans capacité liée, la catégorie est elle-même un nœud du graphe.
  category: { activityId: ['id'], label: ['s', 60], description: ['s', 180], caps: ['caps', 8], archived: ['b'] },
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
  },
  // Journal d'escalade : un bloc / une voie tenté(e) ou réussi(e), avec la cotation au moment de la saisie.
  ascent: {
    kind: ['e', ['bloc', 'voie'], 'bloc'], name: ['s', 80], grade: ['obj', GRADE_SNAPSHOT], gradeText: ['s', 20],
    result: ['e', ['flash', 'send', 'work', 'top', 'attempt', 'fail'], 'attempt'], attempts: ['n', 1, 999, 1], styles: ['ids', 12], styleText: ['s', 60],
    date: ['n', 0, 9e15, 0], context: ['obj', CONTEXT], note: ['s', 300],
  },
  gradesys: {
    name: ['s', 60], activity: ['e', ['bloc', 'voie', 'autre'], 'bloc'], kind: ['e', ['ordered', 'colors', 'numeric'], 'ordered'],
    levels: ['list', { id: ['id'], label: ['s', 30], color: ['color'], order: ['n', 0, 999, 0] }, 60],
    maps: ['list', { levelId: ['id'], ref: ['id'], refLevel: ['s', 40] }, 150], archived: ['b'],
  },
  style: { label: ['s', 40], activity: ['s', 40], archived: ['b'] },
  env: { name: ['s', 60], type: ['e', ['maison', 'salle', 'exterieur', 'escalade', 'piscine', 'piste', 'autre'], 'autre'], equipment: ['ids', 40], isDefault: ['b'], archived: ['b'] },
  // Préférence explicite ou confirmée : aime / neutre / évite (jamais une suppression automatique).
  pref: { key: ['s', 80], label: ['s', 80], value: ['e', ['aime', 'neutre', 'evite'], 'neutre'], source: ['e', ['explicit', 'habit', 'questionnaire'], 'explicit'], reason: ['s', 200] },
  // Niveau déclaré par l'utilisateur pour une capacité (-1 = « je ne sais pas »).
  capdecl: { capId: ['id'], level: ['e', [-1, 0, 1, 2], -1], note: ['s', 200] },
  lab: {
    title: ['s', 80], hypothesis: ['s', 500], goalId: ['id'], capId: ['id'], metricId: ['id'], startDate: ['day'], weeks: ['n', 1, 52, 4],
    before: ['obj', { value: ['n', -1e7, 1e7, null], note: ['s', 300], date: ['n', 0, 9e15, 0] }],
    after: ['obj', { value: ['n', -1e7, 1e7, null], note: ['s', 300], date: ['n', 0, 9e15, 0] }],
    status: ['e', ['running', 'done', 'abandoned'], 'running'], conclusion: ['s', 800],
  },
  jnote: { date: ['n', 0, 9e15, 0], text: ['s', 1000] },
  // Remplacement d'exercice effectué (sert à détecter « exercice souvent remplacé »).
  swap: { from: ['s', 80], to: ['s', 80], date: ['n', 0, 9e15, 0], where: ['e', ['generator', 'seance', 'player'], 'seance'] },
  // Réponse de l'utilisateur à une proposition d'habitude (pour ne pas reposer la même question).
  habit: { key: ['s', 120], decision: ['e', ['accepted', 'dismissed'], 'dismissed'] },
  // Configuration personnelle (tableau de bord, environnement par défaut…) : un item par clé.
  config: { blocks: ['strs', 20, 30], envId: ['id'], durations: ['strs', 10, 10], unavailable: ['ids', 40] },
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
