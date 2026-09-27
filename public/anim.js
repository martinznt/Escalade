// anim.js — petits personnages animés (SVG) qui montrent le TYPE de mouvement d'un exercice : squat, pompe,
// traction, suspension, gainage, épaules, course, nage, étirement. Ce n'est pas une vidéo de l'exercice exact :
// les consignes restent la référence. Animation SMIL (fonctionne aussi sur iPhone), arrêtée si « réduire les animations ».

// Articulations : t = tête, n = cou/épaules, hp = bassin, k1/k2 genoux, f1/f2 pieds, e1/e2 coudes, m1/m2 mains.
const P = (o) => o;
const POSES = {
  squat: [
    P({ t: [60, 20], n: [60, 31], hp: [60, 64], k1: [62, 87], f1: [60, 110], k2: [58, 87], f2: [62, 110], e1: [70, 44], m1: [84, 42], e2: [68, 46], m2: [82, 44] }),
    P({ t: [54, 46], n: [56, 57], hp: [44, 82], k1: [68, 86], f1: [60, 110], k2: [66, 88], f2: [62, 110], e1: [72, 60], m1: [88, 58], e2: [70, 62], m2: [86, 60] }),
  ],
  push: [
    P({ t: [97, 57], n: [88, 62], hp: [52, 74], k1: [34, 82], f1: [15, 92], k2: [34, 82], f2: [15, 92], e1: [88, 77], m1: [88, 92], e2: [86, 77], m2: [86, 92] }),
    P({ t: [95, 76], n: [86, 80], hp: [52, 84], k1: [34, 88], f1: [15, 92], k2: [34, 88], f2: [15, 92], e1: [74, 84], m1: [88, 92], e2: [72, 84], m2: [86, 92] }),
  ],
  pull: [
    P({ t: [60, 34], n: [60, 45], hp: [60, 78], k1: [56, 96], f1: [56, 112], k2: [64, 96], f2: [64, 112], e1: [44, 30], m1: [45, 13], e2: [76, 30], m2: [75, 13] }),
    P({ t: [60, 4], n: [60, 20], hp: [60, 52], k1: [56, 70], f1: [56, 86], k2: [64, 70], f2: [64, 86], e1: [36, 24], m1: [45, 13], e2: [84, 24], m2: [75, 13] }),
  ],
  hang: [
    P({ t: [60, 36], n: [60, 47], hp: [60, 80], k1: [58, 97], f1: [58, 113], k2: [62, 97], f2: [62, 113], e1: [50, 30], m1: [50, 13], e2: [70, 30], m2: [70, 13] }),
    P({ t: [60, 33], n: [60, 43], hp: [60, 76], k1: [58, 93], f1: [58, 109], k2: [62, 93], f2: [62, 109], e1: [50, 28], m1: [50, 13], e2: [70, 28], m2: [70, 13] }),
  ],
  core: [
    P({ t: [97, 68], n: [88, 72], hp: [52, 76], k1: [34, 80], f1: [15, 86], k2: [34, 80], f2: [15, 86], e1: [86, 88], m1: [100, 88], e2: [84, 88], m2: [98, 88] }),
    P({ t: [97, 67], n: [88, 71], hp: [52, 73], k1: [34, 79], f1: [15, 86], k2: [34, 79], f2: [15, 86], e1: [86, 88], m1: [100, 88], e2: [84, 88], m2: [98, 88] }),
  ],
  shoulders: [
    P({ t: [60, 20], n: [60, 31], hp: [60, 66], k1: [56, 88], f1: [54, 110], k2: [64, 88], f2: [66, 110], e1: [48, 46], m1: [44, 62], e2: [72, 46], m2: [76, 62] }),
    P({ t: [60, 20], n: [60, 31], hp: [60, 66], k1: [56, 88], f1: [54, 110], k2: [64, 88], f2: [66, 110], e1: [46, 18], m1: [42, 4], e2: [74, 18], m2: [78, 4] }),
  ],
  run: [
    P({ t: [64, 18], n: [62, 29], hp: [58, 62], k1: [74, 78], f1: [70, 100], k2: [48, 86], f2: [34, 96], e1: [72, 42], m1: [80, 32], e2: [50, 44], m2: [44, 56] }),
    P({ t: [64, 18], n: [62, 29], hp: [58, 62], k1: [48, 84], f1: [36, 98], k2: [72, 80], f2: [70, 104], e1: [50, 42], m1: [44, 54], e2: [72, 44], m2: [80, 34] }),
  ],
  swim: [
    P({ t: [98, 60], n: [88, 62], hp: [50, 66], k1: [32, 64], f1: [14, 66], k2: [32, 68], f2: [14, 72], e1: [100, 52], m1: [114, 58], e2: [76, 72], m2: [62, 74] }),
    P({ t: [98, 60], n: [88, 62], hp: [50, 66], k1: [32, 68], f1: [14, 72], k2: [32, 64], f2: [14, 66], e1: [76, 72], m1: [62, 74], e2: [100, 52], m2: [114, 58] }),
  ],
  stretch: [
    P({ t: [60, 20], n: [60, 31], hp: [60, 66], k1: [56, 88], f1: [52, 110], k2: [64, 88], f2: [68, 110], e1: [50, 16], m1: [58, 4], e2: [72, 46], m2: [74, 62] }),
    P({ t: [52, 22], n: [55, 32], hp: [60, 66], k1: [56, 88], f1: [52, 110], k2: [64, 88], f2: [68, 110], e1: [48, 14], m1: [40, 4], e2: [66, 48], m2: [70, 62] }),
  ],
};
const PROPS = {
  pull: '<line x1="22" y1="13" x2="98" y2="13" class="prop"/>',
  hang: '<rect x="36" y="8" width="48" height="6" rx="2" class="prop"/>',
  push: '<line x1="6" y1="93" x2="114" y2="93" class="ground"/>',
  core: '<line x1="6" y1="90" x2="114" y2="90" class="ground"/>',
  swim: '<path d="M4 50 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" class="water"/>',
};
const path = (p) => ['M', p.n, 'L', p.hp, 'L', p.k1, 'L', p.f1, 'M', p.hp, 'L', p.k2, 'L', p.f2, 'M', p.n, 'L', p.e1, 'L', p.m1, 'M', p.n, 'L', p.e2, 'L', p.m2]
  .map((x) => (Array.isArray(x) ? x.join(' ') : x)).join(' ');

/** Type de mouvement d'un exercice (d'après sa famille et son genre dans la bibliothèque). */
export function moveKind(ex) {
  const k = ex?.kind || '', g = ex?.group || '', n = String(ex?.name || '').toLowerCase();
  if (k === 'run' || /course|footing|sprint|foulée/.test(n)) return 'run';
  if (k === 'swim' || /nage|crawl|brasse/.test(n)) return 'swim';
  if (['mobility', 'mobilize', 'cool', 'recovery'].includes(k) || /étire|mobilit|respiration/.test(n)) return 'stretch';
  if (g === 'doigts' || /suspension|poutre|réglette/.test(n)) return 'hang';
  if (g === 'tirer' || /traction|tirage|rowing/.test(n)) return 'pull';
  if (g === 'pousser' || /pompe|dips|développé/.test(n)) return 'push';
  if (g === 'gainage' || /gainage|planche|hollow/.test(n)) return 'core';
  if (g === 'epaules') return 'shoulders';
  if (g === 'jambes' || /squat|fente|saut/.test(n)) return 'squat';
  return 'shoulders';
}

/** SVG animé (chaîne) pour un exercice. */
export function figure(ex, { size = 96 } = {}) {
  const kind = moveKind(ex), [a, b] = POSES[kind];
  const dur = kind === 'run' || kind === 'swim' ? '0.8s' : kind === 'core' || kind === 'hang' ? '3s' : '2.2s';
  const vals = [path(a), path(b), path(a)].join(';'), tv = (i) => [a.t[i], b.t[i], a.t[i]].join(';');
  const still = document.documentElement.dataset.motion === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anim = (attr, values) => (still ? '' : `<animate attributeName="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"/>`);
  return `<svg class="fig" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Illustration du mouvement">${PROPS[kind] || '<line x1="10" y1="111" x2="110" y2="111" class="ground"/>'}
    <path d="${path(a)}" class="body">${anim('d', vals)}</path><circle cx="${a.t[0]}" cy="${a.t[1]}" r="8" class="head">${anim('cx', tv(0))}${anim('cy', tv(1))}</circle></svg>`;
}
