// views-routines.js — Bibliothèque › « 🧩 Mes moments » : les blocs que tu aimes glisser dans tes séances
// (élastiques à l'échauffement, no foot ou spray wall en fin de séance…). Ils sont proposés dans « Créer une séance »
// (étape « Ta structure »), au bon endroit et adaptés à la séance. Conseil spray wall d'après tes séances notées.
import { h, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, SUBMIT, ctx, render, putItem, delItem, itemsOf } from './state.js';
import { uid } from './shared.js';
import { EQUIPMENT, ACTIVITIES } from './model.js';
import { LIBRARY, byId } from './library.js';
import { WHEN, EFFORT, ROUTINE_PRESETS, sprayAdvice, isSpray } from './routines.js';

const NEEDS = ['band', 'wall', 'spraywall', 'boardwall', 'hangboard', 'campus', 'bar', 'mat', 'weights', 'kettlebell', 'pool'].filter((k) => EQUIPMENT[k]);
const sportsAll = () => { const x = ctx(); return [...new Set([...Object.keys(x.activities), ...Object.keys(ACTIVITIES)])].filter((id) => x.activities[id] || ACTIVITIES[id]); };
const sportName = (id) => { const a = ctx().activities[id] || ACTIVITIES[id]; return a ? `${a.emoji || ''} ${a.label || id}`.trim() : id; };
export const myRoutines = () => itemsOf('routine').sort((a, b) => Object.keys(WHEN).indexOf(a.when) - Object.keys(WHEN).indexOf(b.when) || String(a.label).localeCompare(String(b.label)));
const sub = (r) => [`${r.minutes || 10} min`, EFFORT[r.effort] || 'Moyen', (r.sports || []).length ? r.sports.map((s) => sportName(s).replace(/^\S+\s/, '')).join(', ') : 'tous les sports',
  (r.needs || []).length ? `🧰 ${r.needs.map((k) => EQUIPMENT[k] || k).join(', ').toLowerCase()}` : '', r.auto ? '⚡ ajouté tout seul' : '', r.off ? '⏸ en pause' : ''].filter(Boolean).join(' · ');

export function vRoutines() {
  const l = myRoutines(), x = ctx(), adv = sprayAdvice(x.history, Date.now());
  const sprayOn = l.some((r) => isSpray(r) && !r.off) || x.envs.some((e) => (e.equipment || []).includes('spraywall'));
  return h`<div class="card stack"><p class="small">Ce que tu aimes faire à un moment précis de tes séances. Dans « Créer une séance », l’app te les propose au bon endroit et les adapte (durée, doigts déjà fatigués, matériel du lieu).</p>
      <button class="btn pri" data-act="roNew">＋ Ajouter un moment</button></div>
    ${l.length ? Object.entries(WHEN).map(([w, [ic, t]]) => { const g = l.filter((r) => r.when === w); return g.length ? h`<span class="kicker">${ic} ${t}</span><div class="setmenu">${g.map((r) => h`<button class="setrow" data-act="roEdit" data-id="${r.id}"><span class="sic">${r.emoji || '🧩'}</span><span class="grow"><b>${r.label}</b><small>${sub(r)}</small></span><span class="chev">›</span></button>`)}</div>` : ''; })
      : h`<div class="card flat"><p class="small muted">Aucun moment pour l’instant. Exemples : élastiques à l’échauffement, no foot ou spray wall en fin de séance, étirements des avant-bras au retour au calme.</p></div>`}
    ${sprayOn ? h`<section class="card stack"><h3 style="margin:0">🧱 Conseil spray wall</h3><b class="small">${adv.title}</b><ul class="clean tight small">${adv.how.map((t) => h`<li>${t}</li>`)}</ul><p class="tiny muted">Pourquoi : ${adv.why}.</p>
      ${byId(adv.libId) ? h`<p class="tiny muted">Exercice conseillé : ${byId(adv.libId).emoji} ${byId(adv.libId).name}.</p>` : ''}</section>`
      : h`<p class="tiny muted">🧱 Tu as un spray wall ? Coche-le dans Profil › Mes lieux (matériel) ou ajoute le moment « Spray wall » : l’app te donnera un conseil d’après tes séances.</p>`}`;
}

/** Fiche d'un moment (nouveau, modèle ou existant) : relue et validée par la personne avant l'enregistrement. */
function sheet(r = {}) {
  const lib = [...LIBRARY].sort((a, b) => a.name.localeCompare(b.name));
  openSheet(h`<h2 style="margin:0">${r.id ? 'Modifier le moment' : 'Nouveau moment'}</h2>
    ${r.id ? '' : h`<span class="kicker">Partir d’un modèle</span><div class="chips">${ROUTINE_PRESETS.map((p) => h`<button type="button" class="chip" data-act="roPreset" data-id="${p.key}">${p.emoji} ${p.label}</button>`)}</div>`}
    <form class="stack" data-submit="roSave"><input type="hidden" name="id" value="${r.id || ''}">
      <label>Nom<input name="label" required maxlength="60" value="${r.label || ''}" placeholder="Ex. No foot, Spray wall, Élastiques"></label>
      <label>Emoji <span class="tiny muted">(facultatif)</span><input name="emoji" maxlength="8" value="${r.emoji || ''}" placeholder="🧩" style="max-width:90px"></label>
      <label>Quand ?<select name="when">${Object.entries(WHEN).map(([k, [ic, t]]) => h`<option value="${k}" ${(r.when || 'end') === k ? 'selected' : ''}>${ic} ${t}</option>`)}</select></label>
      <div class="grid2"><label>Durée<span class="unitbox"><input type="number" name="minutes" min="3" max="90" step="1" value="${r.minutes || 10}"><em>min</em></span></label>
        <label>Effort<select name="effort">${Object.entries(EFFORT).map(([k, t]) => h`<option value="${k}" ${(r.effort || 'mod') === k ? 'selected' : ''}>${t}</option>`)}</select></label></div>
      <label>Exercice lié <span class="tiny muted">(facultatif : ses consignes s’affichent pendant la séance)</span><select name="libId"><option value="">Aucun : juste un temps chronométré</option>${lib.map((x) => h`<option value="${x.id}" ${r.libId === x.id ? 'selected' : ''}>${x.emoji} ${x.name}</option>`)}</select></label>
      <span class="kicker">Pour quels sports ? <span class="tiny muted">(rien coché = tous)</span></span>
      <div class="chkgrid">${sportsAll().map((id) => h`<label class="chk"><input type="checkbox" name="sports" value="${id}" ${(r.sports || []).includes(id) ? 'checked' : ''}> ${sportName(id)}</label>`)}</div>
      <span class="kicker">Matériel nécessaire <span class="tiny muted">(proposé seulement s’il est dans le lieu)</span></span>
      <div class="chkgrid">${NEEDS.map((k) => h`<label class="chk"><input type="checkbox" name="needs" value="${k}" ${(r.needs || []).includes(k) ? 'checked' : ''}> ${EQUIPMENT[k]}</label>`)}</div>
      <label class="chk"><input type="checkbox" name="fingers" ${r.fingers ? 'checked' : ''}> Ça charge les doigts <span class="tiny muted">(l’app l’allège après une phase dure)</span></label>
      <label class="chk"><input type="checkbox" name="auto" ${r.auto ? 'checked' : ''}> L’ajouter tout seul quand il convient</label>
      ${r.id ? h`<label class="chk"><input type="checkbox" name="off" ${r.off ? 'checked' : ''}> En pause (ne plus le proposer)</label>` : ''}
      <label>Note <span class="tiny muted">(facultatif)</span><input name="note" maxlength="200" value="${r.note || ''}" placeholder="Ex. sur le dévers, prises bonnes"></label>
      <button class="btn pri">Enregistrer</button></form>
    ${r.id ? h`<button class="btn ghost danger" data-act="roDel" data-id="${r.id}">Supprimer ce moment</button>` : ''}`);
}
ACT.roNew = () => sheet();
ACT.roEdit = (el) => { const r = myRoutines().find((x) => x.id === el.dataset.id); if (r) sheet(r); };
ACT.roPreset = (el) => { const p = ROUTINE_PRESETS.find((x) => x.key === el.dataset.id); if (p) { const { key, ...d } = p; sheet(d); } };
SUBMIT.roSave = (f) => {
  const fd = new FormData(f), d = Object.fromEntries(fd), id = d.id || 'ro-' + uid().slice(0, 12);
  if (String(d.label || '').trim().length < 2) { toast('Donne un nom à ce moment.'); return; }
  putItem('routine', id, { label: d.label, emoji: d.emoji || '', when: d.when, minutes: Number(d.minutes) || 10, effort: d.effort, libId: d.libId || '',
    sports: fd.getAll('sports'), needs: fd.getAll('needs'), fingers: fd.has('fingers'), auto: fd.has('auto'), off: fd.has('off'), note: d.note || '' });
  closeSheet(); toast('Moment enregistré : il sera proposé dans « Créer une séance ».', 3500); render();
};
ACT.roDel = (el) => { delItem('routine', el.dataset.id); closeSheet(); toast('Moment supprimé.'); render(); };
