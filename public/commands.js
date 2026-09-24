// commands.js — commandes en langage naturel simples et déterministes.
// Volontairement sans IA externe (cf. cahier des charges §20 : le cœur de l'appli doit
// fonctionner sans API externe). Reconnaît un petit nombre de formulations explicites et
// retourne une action structurée et vérifiable — jamais de texte libre exécuté tel quel.
// Une phrase non reconnue retourne toujours { type: 'unknown' } : on n'invente pas d'action.
// Pur JavaScript, sans DOM : testé avec Node (tests/commands.test.mjs).

const norm = (s) => String(s || '').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const stripEdges = (s) => String(s || '').replace(/^[\s.,;:!?'"«»]+|[\s.,;:!?'"«»]+$/g, '').trim();

const FOCUS_WORDS = {
  jambes: ['jambe', 'jambes', 'cuisse', 'cuisses'],
  devers: ['devers'],
  dalle: ['dalle'],
  reglette: ['reglette', 'reglettes', 'doigt', 'doigts'],
  resistance: ['resistance', 'endurance'],
  perf: ['performance', 'perf'],
  vitesse: ['vitesse', 'explosivite'],
  equilibre: ['equilibre', 'gainage'],
};

function extractMinutes(text) {
  const m = text.match(/(\d{1,3})\s*(?:min|minute|minutes)\b/);
  return m ? Math.max(5, Math.min(180, Number(m[1]))) : null;
}
function sizeFromMinutes(min) {
  if (min == null) return null;
  if (min <= 22) return 'petite';
  if (min <= 40) return 'moyenne';
  return 'grosse';
}
function matchAny(text, dict) {
  for (const [key, words] of Object.entries(dict)) if (words.some((w) => text.includes(w))) return key;
  return null;
}

/**
 * Interprète une phrase en action structurée. Ne modifie jamais rien elle-même :
 * c'est à l'appelant d'exécuter l'action retournée, et de demander confirmation
 * quand confirm === true (actions destructives).
 */
export function parseCommand(raw) {
  const text = norm(raw);
  if (!text) return { type: 'unknown', raw };

  // « Montre mes records / ma progression »
  if (/\b(montre|affiche|voir)\b.*\b(record|records|progression|progres)\b/.test(text)) {
    return { type: 'showRecords', raw };
  }

  // « Supprime ma dernière séance » — destructif → confirmation obligatoire
  if (/\bsupprim/.test(text) && /\bderni[eè]re s[eé]ance\b/.test(text)) {
    return { type: 'deleteLastHistory', confirm: true, raw };
  }

  // « Remplace les tractions »
  let m = text.match(/\bremplace\s+(?:les|le|la|l['’]|des|du|de la)?\s*(.+)$/);
  if (m && stripEdges(m[1])) return { type: 'swapExercise', query: stripEdges(m[1]), raw };

  // « Ajoute 5 minutes de gainage » / « ajoute des tractions »
  m = text.match(/\bajoute(?:\s+moi)?\s+(.+)$/);
  if (m && m[1].trim()) {
    const minutes = extractMinutes(text);
    const withoutMinutes = m[1].replace(/\d+\s*(?:min|minute|minutes)\b/, '').trim();
    const query = stripEdges(withoutMinutes.replace(/^(?:de|des|du|d['’])\s+/, ''));
    if (query) return { type: 'addExercise', minutes, query, raw };
  }

  // « Fais une séance de 20 minutes pour les jambes » / « génère-moi une séance dévers »
  if (/\bs[eé]ance\b/.test(text) && /\b(fais|faire|genere|generer|propose|donne)\b/.test(text)) {
    const minutes = extractMinutes(text);
    return { type: 'generate', size: sizeFromMinutes(minutes), minutes, focus: matchAny(text, FOCUS_WORDS), raw };
  }

  return { type: 'unknown', raw };
}
