// anatomy.js — schéma anatomique léger (SVG) : vue de face et vue de dos, muscles nommés en français.
// Les formes sont des coordonnées fixes (aucune donnée utilisateur dans le SVG, hormis des identifiants
// de muscles du modèle et des opacités numériques calculées) : sûr vis-à-vis du XSS.
// Pur JavaScript, sans DOM : retourne une chaîne SVG.

import { MUSCLES } from './model.js';

const HALF = 'M60,30 L55,31 C54,36 50,38 44,39 C36,40 31,43 29,50 C27,58 26,66 26,74 C25,82 24,90 23,100 C22,108 22,114 23,120 C21,126 22,132 25,133 C28,133 29,127 28,120 C29,112 31,104 32,96 C33,88 34,80 35,72 C36,66 38,62 39,60 C40,72 41,84 43,92 C42,100 40,108 40,116 C39,132 39,148 41,164 C42,172 41,180 41,188 C40,200 41,214 43,228 C43,234 42,240 40,244 C44,247 50,247 53,245 C53,238 53,232 53,226 C54,212 55,198 55,186 C56,176 56,168 57,160 C58,146 59,132 60,122 Z';
const FOREARM = 'M26,84 C24,92 24,102 25,112 L28,112 C30,104 32,94 33,86 C31,83 28,82 26,84 Z';
const UPPERARM = 'M30,58 C28,64 28,72 30,78 C32,78 34,74 35,70 C35,65 35,60 33,57 Z';
// [muscle, chemin, symétrique ?]
const FRONT = [
  ['deltoide_ant', 'M44,40 C37,41 31,44 30,51 C31,56 33,58 35,58 C37,52 40,46 45,43 Z', true],
  ['pectoraux', 'M45,43 C50,41 56,41 59,42 L59,58 C54,61 46,60 40,57 C40,51 42,46 45,43 Z', true],
  ['biceps', UPPERARM, true],
  ['avant_bras_flech', FOREARM, true],
  ['grand_dentele', 'M40,60 C39,64 40,68 42,71 L45,69 C44,66 43,63 42,60 Z', true],
  ['obliques', 'M42,72 C42,80 43,88 44,96 C47,98 50,98 52,97 L52,74 C49,72 45,71 42,72 Z', true],
  ['grand_droit', 'M53,62 L67,62 L67,100 C64,103 56,103 53,100 Z', false],
  ['flechisseurs_hanche', 'M46,100 C49,104 53,108 56,114 L55,118 C51,114 47,109 44,104 Z', true],
  ['quadriceps', 'M42,116 C41,130 42,146 45,160 C48,164 52,164 54,160 C56,148 56,132 55,120 C51,116 46,114 42,116 Z', true],
  ['adducteurs', 'M55,122 C58,128 59,136 58,146 C57,150 56,152 55,152 C55,142 55,130 55,122 Z', true],
  ['tibial', 'M42,190 C41,200 42,212 43,222 L45,222 C46,212 46,200 45,190 Z', true],
];
const BACK = [
  ['trapezes', 'M50,34 C54,32 58,31 60,31 C62,31 66,32 70,34 C73,38 76,40 78,41 L70,46 L66,64 L60,70 L54,64 L50,46 L42,41 C44,40 47,38 50,34 Z', false],
  ['deltoide_post', 'M42,41 C36,42 31,45 30,52 C31,57 33,58 35,58 C37,52 40,47 44,44 Z', true],
  ['coiffe', 'M44,46 C41,48 40,52 41,55 L47,55 C48,51 47,48 44,46 Z', true],
  ['rhomboides', 'M52,48 L57,50 L57,62 L54,62 Z', true],
  ['grand_dorsal', 'M41,56 C40,66 41,76 44,86 C48,92 53,95 57,96 L57,74 C53,68 47,62 41,56 Z', true],
  ['triceps', UPPERARM, true],
  ['avant_bras_ext', FOREARM, true],
  ['lombaires', 'M54,80 L58,80 L58,104 L54,104 Z', true],
  ['moyen_fessier', 'M42,102 C40,106 40,110 41,114 C45,112 48,108 49,104 C47,102 44,101 42,102 Z', true],
  ['grand_fessier', 'M42,112 C41,120 44,128 50,130 C55,130 58,126 59,120 L59,108 C53,106 47,108 42,112 Z', true],
  ['ischios', 'M42,132 C41,144 43,156 46,166 C50,168 53,166 55,162 C56,150 57,140 57,132 C52,130 46,130 42,132 Z', true],
  ['mollets', 'M41,180 C39,190 40,202 43,212 C46,214 49,212 50,208 C52,198 53,188 52,180 C48,176 44,176 41,180 Z', true],
];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MIRROR = 'matrix(-1 0 0 1 120 0)';

function view(shapes, cls, title, state) {
  const parts = [`<path class="sil" d="${HALF}"/><path class="sil" d="${HALF}" transform="${MIRROR}"/><ellipse class="sil" cx="60" cy="17" rx="10" ry="12.5"/>`];
  for (const [id, d, sym] of shapes) {
    const st = state(id);
    const attr = `class="m ${st.cls}"${st.op != null ? ` style="opacity:${st.op.toFixed(2)}"` : ''} data-m="${id}"`;
    const t = `<title>${esc(MUSCLES[id]?.label || id)}${st.hint ? ' — ' + esc(st.hint) : ''}</title>`;
    parts.push(`<path ${attr} d="${d}">${t}</path>`);
    if (sym) parts.push(`<path ${attr} d="${d}" transform="${MIRROR}">${t}</path>`);
  }
  return `<svg class="anat-view ${cls}" viewBox="0 0 120 252" role="img" aria-label="${esc(title)}">${parts.join('')}</svg>`;
}

/**
 * opts.primary / opts.secondary : identifiants de muscles (schéma d'un exercice) ;
 * opts.heat : { muscleId: valeur } (volume travaillé) — l'opacité suit la valeur relative.
 */
export function anatomySvg({ primary = [], secondary = [], heat = null } = {}) {
  const P = new Set(primary), Sx = new Set(secondary);
  const max = heat ? Math.max(1, ...Object.values(heat)) : 1;
  const state = (id) => {
    if (heat) { const v = heat[id] || 0; return v > 0 ? { cls: 'h', op: 0.25 + 0.75 * (v / max), hint: `${Math.round(v * 10) / 10} séries` } : { cls: '' }; }
    if (P.has(id)) return { cls: 'p', hint: 'principal' };
    if (Sx.has(id)) return { cls: 's', hint: 'secondaire' };
    return { cls: '' };
  };
  return `<div class="anat">${view(FRONT, 'v-front', 'Vue de face', state)}${view(BACK, 'v-back', 'Vue de dos', state)}</div>`;
}
export const FRONT_IDS = FRONT.map((x) => x[0]);
export const BACK_IDS = BACK.map((x) => x[0]);
