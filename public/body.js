// body.js — profil corporel (âge, taille, poids, silhouette, zones musclées, forme, souffle, activité du quotidien)
// et son effet sur les séances proposées. Tout est facultatif et déclaré par la personne ; aucun diagnostic.
import { h, raw, chip } from './ui.js';
import { addField } from './views-choices.js';

import { SHAPES, ZONES, FITNESS, BREATH, DAILY, SEXES } from './body-rules.js';
import { PHYSIQUE } from './physique.js';
export { SHAPES, ZONES, FITNESS, BREATH, DAILY, SEXES, cleanBody, bodyAdjust } from './body-rules.js';

/** Formulaire (questionnaire de départ et Profil › Mon corps et mes préférences). act/inp : actions à brancher. */
export function bodyFields(b = {}, { act = 'bodyPick', inp = 'bodyInput', onChange = false } = {}) {
  const num = (k, label, unit, min, max) => h`<label class="bnum">${label}<span class="unitbox"><input type="number" inputmode="decimal" min="${min}" max="${max}" step="${k === 'weight' ? '0.1' : '1'}" value="${b[k] ?? ''}" ${raw(onChange ? `data-change="${inp}"` : `data-input="${inp}"`)} data-k="${k}"><em>${unit}</em></span></label>`;
  const one = (k, list) => h`<div class="chips">${list.map(([v, l]) => chip(String(b[k]) === String(v), l, `data-act="${act}" data-k="${k}" data-v="${v}"`))}</div>`;
  return h`<div class="bodyf">
    <div class="grid3">${num('age', 'Âge', 'ans', 8, 100)}${num('height', 'Taille', 'cm', 100, 230)}${num('weight', 'Poids', 'kg', 25, 300)}</div>
    <label>Sexe <span class="tiny muted">(facultatif)</span></label>${one('sex', SEXES)}
    <label>Ta silhouette</label>${one('shape', SHAPES)}
    <label>Où es-tu plutôt musclé ? <span class="tiny muted">(plusieurs choix)</span></label><div class="chips">${ZONES.map(([v, l]) => chip((b.muscled || []).includes(v), l, `data-act="${act}" data-k="muscled" data-v="${v}"`))}${addField('muscled', act)}</div>
    <label>Ce que tu aimerais changer <span class="tiny muted">(facultatif, plusieurs choix)</span></label><div class="chips">${Object.entries(PHYSIQUE).map(([v, p]) => chip((b.physique || []).includes(v), `${p.emoji} ${p.label}`, `data-act="${act}" data-k="physique" data-v="${v}"`))}${addField('physique', act)}</div>
    <p class="tiny muted">Les séances mettent ces muscles en priorité, et ton bilan te propose les mensurations qui vont avec (ex. tour d’épaules et de taille pour la forme en V). Un souhait écrit par toi compte si des muscles y sont reconnus (mollets, fessiers, bras…).</p>
    <label>Comment tu te sens en ce moment ?</label><div class="chips fit">${FITNESS.map(([v, e, l]) => chip(Number(b.fitness) === v, `${e} ${l}`, `data-act="${act}" data-k="fitness" data-v="${v}"`))}</div>
    <label>Es-tu souvent essoufflé ?</label>${one('breath', BREATH)}
    <label>Au quotidien</label>${one('daily', DAILY)}
    <p class="tiny muted">Tout est facultatif. Ces réponses servent seulement à adapter les séances (intensité, repos, type d’exercices). Ce n’est pas un avis médical.</p></div>`;
}
/** Applique un toucher sur un choix (bascule pour les listes). */
export function bodyToggle(b, k, v) {
  if (k === 'muscled' || k === 'physique') { const s = new Set(b[k] || []); if (s.has(v)) s.delete(v); else s.add(v); return { ...b, [k]: [...s] }; }
  return { ...b, [k]: String(b[k]) === String(v) ? undefined : v };
}
