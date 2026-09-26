// grading.js — systèmes de cotation multiples (bloc / voie), correspondances, maxima et styles.
// Règles :
//  - plusieurs systèmes coexistent (Fontainebleau, V, française, U1–U8, couleurs, systèmes personnels) ;
//  - une performance garde un INSTANTANÉ du niveau au moment de la saisie (grade snapshot : système, libellé,
//    ordre, couleur) : modifier ou archiver un système ne corrompt jamais l'historique ;
//  - aucune équivalence n'est inventée : un niveau n'est converti vers une échelle de référence que si une
//    correspondance existe (table usuelle pour les systèmes intégrés, correspondance définie par l'utilisateur sinon).
// Pur JavaScript, sans DOM.

const FONT = ['3', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'];
const FRENCH = ['3a', '3b', '3c', '4a', '4b', '4c', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a', '9a+', '9b', '9b+', '9c'];
const VSCALE = Array.from({ length: 18 }, (_, i) => 'V' + i);
// Correspondance usuelle (approximative) V → Fontainebleau.
const V_TO_FONT = ['4', '5', '5+', '6A', '6B', '6C', '7A', '7A+', '7B', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'];

const lv = (labels, colors = []) => labels.map((label, i) => ({ id: 'l' + i, label, order: i, color: colors[i] || '' }));
export const BUILTIN_SYSTEMS = {
  font: { id: 'font', name: 'Fontainebleau (bloc)', activity: 'bloc', kind: 'ordered', builtin: true, levels: lv(FONT), maps: [] },
  vscale: { id: 'vscale', name: 'Échelle V (bloc)', activity: 'bloc', kind: 'ordered', builtin: true, levels: lv(VSCALE), maps: V_TO_FONT.map((f, i) => ({ levelId: 'l' + i, ref: 'font', refLevel: f })) },
  french: { id: 'french', name: 'Cotation française (voie)', activity: 'voie', kind: 'ordered', builtin: true, levels: lv(FRENCH), maps: [] },
};
// Référence de chaque activité : l'échelle vers laquelle on convertit (si une correspondance existe).
export const REFERENCE = { bloc: 'font', voie: 'french' };

/** Modèles proposés pour créer un système personnel (ensuite librement modifiable). */
export const TEMPLATES = {
  u8: { name: 'Salle U1 → U8', activity: 'bloc', kind: 'ordered', levels: ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8'] },
  couleurs: {
    name: 'Couleurs de ma salle', activity: 'bloc', kind: 'colors',
    levels: ['Jaune', 'Vert', 'Bleu', 'Rose', 'Rouge', 'Noir', 'Blanc'], colors: ['#e9c46a', '#5aa469', '#4a78c2', '#e07aa6', '#c8423b', '#2b2b2b', '#e8e6e1'],
  },
  numerique: { name: 'Échelle numérique 1 → 10', activity: 'bloc', kind: 'numeric', levels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
  vide: { name: 'Nouveau système', activity: 'bloc', kind: 'ordered', levels: [] },
};

let seq = 0;
const newLevelId = () => 'lv' + Date.now().toString(36) + (seq++).toString(36);
/** Crée les données d'un système personnel à partir d'un modèle. */
export function systemFromTemplate(key) {
  const t = TEMPLATES[key] || TEMPLATES.vide;
  return { name: t.name, activity: t.activity, kind: t.kind, levels: t.levels.map((label, i) => ({ id: newLevelId(), label, order: i, color: t.colors?.[i] || '' })), maps: [], archived: false };
}
export function addLevel(sys, label, color = '') {
  const levels = [...(sys.levels || [])];
  levels.push({ id: newLevelId(), label: String(label || '').trim().slice(0, 30) || `Niveau ${levels.length + 1}`, order: levels.length, color });
  return { ...sys, levels };
}
/** Déplace un niveau (réordonne) : l'ordre est recalculé de 0 à n-1. */
export function moveLevel(sys, levelId, delta) {
  const levels = [...(sys.levels || [])].sort((a, b) => a.order - b.order);
  const i = levels.findIndex((l) => l.id === levelId), j = i + delta;
  if (i < 0 || j < 0 || j >= levels.length) return sys;
  [levels[i], levels[j]] = [levels[j], levels[i]];
  return { ...sys, levels: levels.map((l, k) => ({ ...l, order: k })) };
}
export function removeLevel(sys, levelId) {
  const levels = (sys.levels || []).filter((l) => l.id !== levelId).sort((a, b) => a.order - b.order).map((l, k) => ({ ...l, order: k }));
  return { ...sys, levels, maps: (sys.maps || []).filter((m) => m.levelId !== levelId) };
}
export function renameLevel(sys, levelId, label, color) {
  return { ...sys, levels: (sys.levels || []).map((l) => (l.id === levelId ? { ...l, label: String(label || l.label).slice(0, 30), color: color ?? l.color } : l)) };
}
/** Définit (ou retire si refLevel vide) la correspondance d'un niveau vers un niveau d'un autre système. */
export function setMapping(sys, levelId, ref, refLevel) {
  const maps = (sys.maps || []).filter((m) => !(m.levelId === levelId && m.ref === ref));
  if (refLevel) maps.push({ levelId, ref, refLevel: String(refLevel) });
  return { ...sys, maps };
}

/** Tous les systèmes disponibles : intégrés + personnels (items gradesys). */
export function allSystems(userSystems = {}) {
  const out = { ...BUILTIN_SYSTEMS };
  for (const [id, s] of Object.entries(userSystems || {})) out[id] = { id, ...s, builtin: false };
  return out;
}
export const sortedLevels = (sys) => [...(sys?.levels || [])].sort((a, b) => a.order - b.order);

/** Instantané conservé dans la performance (indépendant des modifications futures du système). */
export function gradeSnapshot(sys, levelId) {
  const levels = sortedLevels(sys), l = levels.find((x) => x.id === levelId);
  if (!sys || !l) return null;
  return { systemId: sys.id, systemName: sys.name, levelId: l.id, label: l.label, order: l.order, total: levels.length, color: l.color || '' };
}

/**
 * Convertit un instantané vers l'échelle de référence de l'activité.
 * Retourne { index, label, via } ou null si aucune correspondance n'existe (on n'invente rien).
 */
export function toReference(snap, systems, activity = 'bloc') {
  if (!snap) return null;
  const refId = REFERENCE[activity] || 'font';
  const ref = BUILTIN_SYSTEMS[refId];
  if (snap.systemId === refId) return { index: snap.order, label: snap.label, via: 'direct' };
  const sys = systems?.[snap.systemId];
  const map = sys?.maps?.find((m) => m.levelId === snap.levelId && m.ref === refId);
  if (!map) return null;
  const idx = ref.levels.findIndex((l) => l.label.toLowerCase() === String(map.refLevel).toLowerCase());
  return idx >= 0 ? { index: idx, label: ref.levels[idx].label, via: sys.builtin ? 'table usuelle' : 'ta correspondance' } : null;
}
/** Convertit un index de l'échelle de référence vers un système donné (niveau le plus proche défini dans ses correspondances). */
export function fromReference(index, sys, activity = 'bloc') {
  const refId = REFERENCE[activity] || 'font', ref = BUILTIN_SYSTEMS[refId];
  if (!sys) return null;
  if (sys.id === refId) return sortedLevels(sys)[index] || null;
  let best = null, bestD = Infinity;
  for (const m of sys.maps || []) {
    if (m.ref !== refId) continue;
    const i = ref.levels.findIndex((l) => l.label.toLowerCase() === String(m.refLevel).toLowerCase());
    if (i < 0) continue;
    const d = Math.abs(i - index);
    if (d < bestD) { bestD = d; best = (sys.levels || []).find((l) => l.id === m.levelId) || null; }
  }
  return best && bestD <= 1 ? best : null;
}

/** Niveau 0/1/2 (débutant / intermédiaire / avancé) à partir d'un index de référence — même seuils que le générateur escalade. */
export function levelFromReference(index, activity = 'bloc') {
  if (index == null || index < 0) return null;
  if (activity === 'voie') return index < FRENCH.indexOf('6a') ? 0 : index < FRENCH.indexOf('7a') ? 1 : 2;
  return index < FONT.indexOf('6A') ? 0 : index < FONT.indexOf('6C') ? 1 : 2;
}

/**
 * Regroupe les maxima (perfs de métriques max_bloc / max_voie) par système et par style.
 * perfs : [{ id, metricId, grade, styles, date, context }]
 */
export function maximaSummary(perfs, styles = {}) {
  const bySystem = new Map();
  for (const p of perfs || []) {
    if (!p?.grade?.systemId || p.unknown) continue;
    const k = p.grade.systemId;
    const cur = bySystem.get(k) || { systemId: k, systemName: p.grade.systemName, best: null, entries: [], byStyle: new Map() };
    cur.entries.push(p);
    if (!cur.best || p.grade.order > cur.best.grade.order) cur.best = p;
    for (const st of p.styles || []) {
      const b = cur.byStyle.get(st);
      if (!b || p.grade.order > b.grade.order) cur.byStyle.set(st, p);
    }
    bySystem.set(k, cur);
  }
  return [...bySystem.values()].map((x) => ({ ...x, byStyle: [...x.byStyle.entries()].map(([styleId, p]) => ({ styleId, label: styles[styleId]?.label || styleId, perf: p })) }));
}

/** Meilleur niveau converti vers la référence parmi tous les maxima (pour le générateur). null si rien de convertible. */
export function bestReferenceLevel(perfs, systems, activity = 'bloc') {
  let best = null;
  for (const p of perfs || []) {
    if (p.unknown || !p.grade) continue;
    const r = toReference(p.grade, systems, activity);
    if (r && (!best || r.index > best.index)) best = { ...r, perf: p };
  }
  return best;
}

/** Affichage d'un instantané, avec mention si le système a changé depuis. */
export function snapshotText(snap, systems) {
  if (!snap) return '—';
  const sys = systems?.[snap.systemId];
  const now = sys?.levels?.find((l) => l.id === snap.levelId);
  const renamed = now && now.label !== snap.label ? ` (aujourd’hui « ${now.label} »)` : '';
  const gone = !sys ? ' (système supprimé)' : sys.archived ? ' (système archivé)' : '';
  return `${snap.label} · ${snap.systemName}${renamed}${gone}`;
}
export const LEVEL_WORDS = ['débutant', 'intermédiaire', 'avancé'];
