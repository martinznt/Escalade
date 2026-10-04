// Préférences de présentation et explications : le moteur sportif n'utilise jamais interfaceMode.
import { learnedPreferences } from './brain.js';
import { estimatedFormats } from './knowledge.js';
export const interfaceMode = (settings) => settings?.interfaceMode === 'advanced' ? 'advanced' : 'simple';
export function parseInterfaceRequest(input) {
  const s = String(input).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!/interface|affichage|mode/.test(s)) return null;
  if (/simpl/.test(s)) return 'simple';
  if (/avance|complet|compliqu|expert/.test(s)) return 'advanced';
  return null;
}
export function sessionDifference(previous, current) {
  if (!previous || !current) return [];
  const old = previous.exercises || [], next = current.exercises || [], lines = [];
  const names = old.map((e) => e.name);
  for (const e of next) {
    const a = old.find((x) => x.libId && x.libId === e.libId) || old.find((x) => x.name === e.name);
    if (!a) { lines.push({ kind: 'adapted', text: `Ajout : ${e.name}`, why: e.why || 'Nouvelle structure validée.' }); continue; }
    const fields = [['sets', 'séries'], ['repsMin', 'répétitions minimales'], ['repsMax', 'répétitions maximales'], ['secMax', 'durée'], ['rest', 'repos'], ['load', 'charge'], ['phase', 'phase']];
    const changed = fields.filter(([k]) => a[k] !== e[k]);
    lines.push({ kind: changed.length ? 'adapted' : 'same', text: changed.length ? `${e.name} : ${changed.map(([, l]) => l).join(', ')} modifié(es)` : `${e.name} : conservé`, why: changed.length ? e.why || 'Adaptation au contexte et aux choix actuels.' : 'Structure et prescription conservées.' });
  }
  for (const name of names) if (!next.some((e) => e.name === name)) lines.push({ kind: 'adapted', text: `Retiré : ${name}`, why: 'Absent de la version actuelle ; vérifier les contraintes et la durée.' });
  return lines;
}
export function trainingMemory(c) {
  const explicit = Object.values(c.prefs || {}).map((p) => ({ key: p.key, label: p.label || p.key, text: p.reason || 'Choix enregistré par toi.', source: p.source || 'explicit', confidence: 'confirmée par toi', at: p._u || 0, value: p.value }));
  const learned = learnedPreferences(c).filter((p) => p.done + p.swappedOut + p.liked >= 3 && !c.prefs[p.key]).map((p) => ({ key: p.key, label: p.name, text: p.text, source: 'historique et retours', confidence: p.done + p.swappedOut >= 5 ? 'moyenne' : 'faible', at: p.last || 0, suggested: p.suggestion || 'aime' }));
  const formats = estimatedFormats(c).items || [];
  return [...explicit, ...learned, ...formats.filter((p) => !c.prefs[p.key]).map((p) => ({ key: p.key, label: p.label, text: p.why, source: 'habitude observée', confidence: 'estimation', at: c.history[0]?.startedAt || 0, suggested: 'aime' }))];
}
export function parseQuickActivities(input) {
  const s = String(input).trim();
  const chunks = s.split(/(,?\s+(?:puis|ensuite)\s+|\s+avant\s+(?:de\s+)?|\s+après\s+)/i);
  return chunks.filter((_, i) => i % 2 === 0).map((part, i) => {
    const n = part.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const activityId = /\bvoie\b/.test(n) ? 'climbing_route' : /\bbloc\b/.test(n) ? 'climbing_boulder' : /course|couru|courir/.test(n) ? 'running' : /natation|nage|nager/.test(n) ? 'swimming' : /musculation/.test(n) ? 'strength' : /renfo|gainage/.test(n) ? 'conditioning' : '';
    if (!activityId) return null;
    const hours = n.match(/(\d+)\s*h(?:eures?)?\s*(\d{1,2})?/), mins = n.match(/(\d+)\s*min/);
    const minutes = hours ? Number(hours[1]) * 60 + Number(hours[2] || 0) : mins ? Number(mins[1]) : '';
    const performance = part.match(/\b[1-9][abc](?:\+)?\b|\bU[1-8]\+?\b/i)?.[0] || '';
    const before = chunks[i * 2 - 1] || '', after = chunks[i * 2 + 1] || '';
    const order = /\bavant\b/i.test(part) || /avant/i.test(after) || /après/i.test(before) ? 'before' : /après/i.test(after) || (/puis|ensuite/i.test(before) && !/\bavant\b/i.test(chunks[i * 2 - 2] || '')) ? 'after' : 'main';
    return { activityId, minutes, performance, note: part.slice(0, 600), order };
  }).filter(Boolean).slice(0, 8);
}
