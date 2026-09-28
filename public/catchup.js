// catchup.js — rattrapage des mises à jour : quand on a raté plusieurs versions depuis sa dernière visite, une seule
// visite reprend tout ce qui a changé, dans l'ordre, sans doublon, et en suivant les pages qui ont été regroupées depuis.
// Sans DOM, testé.

export const vnum = (v) => String(v || '0').split('.').map((x) => Number(x) || 0).reduce((t, x) => t * 1000 + x, 0);

/** Pages regroupées depuis : une ancienne étape mène à la page qui les remplace (avec son titre en repère). */
export const MOVED = {
  'progress/records': ['profile', 'perfs'], 'progress/history': ['progress', 'journal'], 'progress/timeline': ['progress', 'journal'],
  'profile/prefs': ['profile', 'body'], 'library/generate': ['library', 'climbplan'],
};

/** Versions ratées : plus récentes que la dernière visitée, jusqu'à la version actuelle (la plus ancienne d'abord). */
export const missedVersions = (news, done, now) => news.filter((n) => vnum(n.v) > vnum(done) && vnum(n.v) <= vnum(now));

/**
 * Étapes de la visite de rattrapage : toutes les versions ratées, les pages déplacées suivies, les étapes en double
 * (même page, même élément) gardées une seule fois avec le texte le plus récent. S'il y a plusieurs versions,
 * une première étape résume ce qui a été raté.
 */
export function catchUpSteps(news, done, now, { since = 0 } = {}) {
  const missed = missedVersions(news, done, now);
  const out = [], at = new Map();
  for (const n of missed) {
    for (const st of n.steps) {
      let [tab, sub, sel, title, text] = st;
      const to = MOVED[`${tab}/${sub}`];
      if (to) { [tab, sub] = to; sel = '#main h1'; }
      const key = `${tab}/${sub}/${sel}`;
      const step = [tab, sub, sel, title, text];
      if (at.has(key)) { out[at.get(key)] = null; }
      at.set(key, out.length); out.push(step);
    }
  }
  const steps = out.filter(Boolean);
  if (missed.length > 1) {
    const when = since ? ` (depuis le ${new Date(since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })})` : '';
    steps.unshift(['', '', '', `🧭 ${missed.length} mises à jour à rattraper${when}`, `On fait le tour de tout ce qui a changé : ${missed.map((n) => `« ${n.title} »`).join(', ')}. Tu peux quitter la visite à tout moment et la reprendre dans Paramètres › Toutes les mises à jour.`]);
  }
  return steps;
}
