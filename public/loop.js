// loop.js — « Ce que ta dernière séance change pour la suivante » : la boucle d'adaptation rendue visible.
// Chaque ligne correspond à une règle que l'app APPLIQUE vraiment (générateur, propositions, accueil) — jamais une
// promesse : doigts ou jambes sollicités intensément (exercices intenses écartés pendant 48 h / 36 h), gêne aux doigts
// signalée (travail des doigts écarté 3 jours), séance jugée dure (version légère proposée), exercices réussis en entier
// (marche suivante), exercices aimés ou à éviter (classement). Pur JavaScript, sans DOM. Testé.
import { analyze, progressHint } from './engine.js';
import { fingerComplaint } from './generator.js';

const HOUR = 3600000, DAY = 24 * HOUR;
const when = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ').replace(/ h 00$/, ' h');

/** Conséquences actives de la dernière séance (7 jours au plus). Retourne { last, items:[{ icon, text }] }. */
export function nextImpact(ctx) {
  const now = ctx.now || Date.now(), last = (ctx.history || [])[0];
  if (!last || now - last.startedAt > 7 * DAY) return { last: null, items: [] };
  const A = analyze(ctx.history, now), items = [];
  if (A.hoursSinceHighFinger < 48) items.push({ icon: '🖐️', text: `Doigts sollicités intensément il y a ${Math.round(A.hoursSinceHighFinger)} h : pas d’exercice de doigts intense proposé avant ${when(now + (48 - A.hoursSinceHighFinger) * HOUR)}.` });
  if (A.hoursSinceHighLegs < 36) items.push({ icon: '🦵', text: `Jambes sollicitées intensément il y a ${Math.round(A.hoursSinceHighLegs)} h : pas de sauts ni d’exercices de jambes intenses avant ${when(now + (36 - A.hoursSinceHighLegs) * HOUR)}.` });
  if (fingerComplaint(ctx)) items.push({ icon: '🩹', text: 'Gêne aux doigts signalée après une séance récente : le travail spécifique des doigts est écarté pendant 3 jours. Si ça dure, consulte un professionnel.' });
  if ((last.data?.rpe || 0) >= 4 && now - last.startedAt < 48 * HOUR) items.push({ icon: '😮‍💨', text: `Dernière séance jugée dure (${last.data.rpe}/5) : une option légère (repos, récupération ou version légère) t’est proposée dans « Que faire aujourd’hui ? ».` });
  const s = last.sessionId && ctx.seanceById?.get?.(last.sessionId);
  if (s) {
    let n = 0;
    for (const ex of s.exercises || []) {
      if (n >= 3) break;
      const ph = progressHint(ex, ctx.history);
      const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
      if (ph?.trend === 'up') { items.push({ icon: '📈', text: `« ${ex.name} » : tout réussi la dernière fois (${ph.last}) → ${low(ph.next)}.` }); n++; }
      else if (ph?.trend === 'confirm' || ph?.trend === 'down') { items.push({ icon: ph.trend === 'down' ? '📉' : '🔁', text: `« ${ex.name} » (${ph.last}) : ${low(ph.why)} → ${low(ph.next)}.` }); n++; }
    }
  }
  for (const l of (last.data?.questionnaire?.likes || []).slice(0, 4)) {
    if (l.value === 'aime') items.push({ icon: '👍', text: `« ${l.name} » aimé : proposé un peu plus souvent.` });
    if (l.value === 'evite') items.push({ icon: '👎', text: `« ${l.name} » à éviter : proposé beaucoup moins souvent (gardé seulement s’il est indispensable à ton objectif, avec l’explication).` });
  }
  return { last, items };
}
