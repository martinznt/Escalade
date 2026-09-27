// scene.js — petit décor vivant de l'accueil : le ciel suit l'heure (aube, jour, soir, nuit), le soleil ou la lune
// avancent dans la journée, et, si on l'active, un décor de saison (neige, fleurs, soleil d'été, feuilles). Sans DOM, testé.

/** Moment de la journée d'après l'heure locale. */
export function dayPhase(hour) {
  if (hour >= 6 && hour < 9) return 'aube';
  if (hour >= 9 && hour < 18) return 'jour';
  if (hour >= 18 && hour < 21) return 'soir';
  return 'nuit';
}
/** Saison (hémisphère nord) d'après le mois (0 = janvier). */
export function seasonOf(month) { return month <= 1 || month === 11 ? 'hiver' : month <= 4 ? 'printemps' : month <= 7 ? 'ete' : 'automne'; }

const SKY = { aube: ['#ffb38a', '#6f7fd6'], jour: ['#9fd7ff', '#3d8fe0'], soir: ['#ff9a6b', '#5a3f8f'], nuit: ['#1c2350', '#070a1f'] };
// Graine fixe par jour : le décor ne saute pas à chaque affichage, mais change d'un jour à l'autre.
function rand(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Décor en SVG (160 × 100). */
export function sceneSvg(date = new Date(), { season = false } = {}) {
  const h = date.getHours() + date.getMinutes() / 60, phase = dayPhase(Math.floor(h)), [top, bottom] = SKY[phase];
  const r = rand(date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate());
  const night = phase === 'nuit';
  // Course de l'astre : le soleil de 6 h à 21 h, la lune de 21 h à 6 h.
  const t = night ? ((h + 24 - 21) % 24) / 9 : (h - 6) / 15;
  const x = 12 + Math.max(0, Math.min(1, t)) * 136, y = 62 - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 48;
  let out = `<svg class="scene s-${phase}" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bottom}"/><stop offset="1" stop-color="${top}"/></linearGradient></defs>
<rect width="160" height="100" fill="url(#sky)"/>`;
  if (night) for (let i = 0; i < 22; i++) out += `<circle class="star" cx="${(r() * 160).toFixed(1)}" cy="${(r() * 60).toFixed(1)}" r="${(0.4 + r() * 0.8).toFixed(2)}" fill="#fff" style="animation-delay:${(r() * 3).toFixed(1)}s"/>`;
  out += night
    ? `<g class="astre"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="#f4f1de"/><circle cx="${(x + 3.5).toFixed(1)}" cy="${(y - 2).toFixed(1)}" r="7" fill="${bottom}"/></g>`
    : `<g class="astre"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="#ffe08a" opacity=".35"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="#ffd34d"/></g>`;
  // Montagnes (c'est une app de grimpeurs) et un petit sommet enneigé.
  const far = night ? '#2a2f5c' : phase === 'soir' ? '#6b4a7a' : '#5b86b8', near = night ? '#141836' : phase === 'soir' ? '#3d2b52' : '#2f5d86';
  out += `<path d="M0 78 L28 50 L44 64 L70 34 L96 62 L112 50 L160 80 L160 100 L0 100Z" fill="${far}"/>
<path d="M62 42 L70 34 L78 42 L73 40 L70 44 L66 40Z" fill="#fff" opacity="${night ? 0.5 : 0.9}"/>
<path d="M0 88 L22 72 L40 82 L64 66 L90 84 L118 70 L140 80 L160 74 L160 100 L0 100Z" fill="${near}"/>`;
  if (season) {
    const s = seasonOf(date.getMonth());
    if (s === 'hiver') for (let i = 0; i < 26; i++) out += `<circle class="flake" cx="${(r() * 160).toFixed(1)}" cy="${(r() * 90).toFixed(1)}" r="${(0.6 + r() * 1.1).toFixed(2)}" fill="#fff" style="animation-delay:-${(r() * 8).toFixed(1)}s"/>`;
    else if (s === 'automne') for (let i = 0; i < 10; i++) out += `<path class="leaf" d="M0 0 q3 -4 6 0 q-3 4 -6 0z" transform="translate(${(r() * 150).toFixed(1)} ${(r() * 80).toFixed(1)}) rotate(${Math.round(r() * 360)})" fill="${['#e07a2e', '#c9472b', '#e8b33a'][i % 3]}" style="animation-delay:-${(r() * 9).toFixed(1)}s"/>`;
    else if (s === 'printemps') for (let i = 0; i < 12; i++) { const cx = (r() * 160).toFixed(1), cy = (84 + r() * 14).toFixed(1); out += `<g class="bloom"><circle cx="${cx}" cy="${cy}" r="1.6" fill="${['#ffb3c8', '#fff', '#ffd6e0'][i % 3]}"/><circle cx="${cx}" cy="${cy}" r=".6" fill="#ffd34d"/></g>`; }
    else out += `<g class="rays" opacity="${night ? 0 : 0.35}">${Array.from({ length: 8 }, (_, i) => `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + Math.cos(i * Math.PI / 4) * 18).toFixed(1)}" y2="${(y + Math.sin(i * Math.PI / 4) * 18).toFixed(1)}" stroke="#ffd34d" stroke-width="1.2" stroke-linecap="round"/>`).join('')}</g>`;
  }
  return out + '</svg>';
}
/** Petite phrase selon le moment (sans jargon, variée d'un jour à l'autre). */
export function moodLine({ first, done, target, weekCount, hour, day }) {
  if (first) return 'On commence quand tu veux : ta première séance t’attend.';
  if (target && weekCount >= target) return 'Objectif de la semaine atteint. Le repos compte aussi 🎉';
  const pick = (list) => list[day % list.length];
  if (done) return pick(['Déjà une séance aujourd’hui, bien joué.', 'Séance du jour faite. Pense à bien récupérer.']);
  if (hour < 12) return pick(['Une séance ce matin ?', 'Le matin, c’est bien pour s’y mettre.', 'Un petit créneau ce matin ?']);
  if (hour < 18) return pick(['Un moment pour bouger cet après-midi ?', 'Une pause active, ça te dit ?', 'On s’y met cet après-midi ?']);
  if (hour < 22) return pick(['Une séance ce soir ?', 'Encore le temps pour une séance courte.', 'Même 20 minutes, ça compte.']);
  return pick(['Il est tard : le sommeil aussi fait progresser.', 'Repose-toi bien, on s’y remet demain.']);
}
