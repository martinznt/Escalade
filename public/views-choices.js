// views-choices.js — « ＋ Ajouter le mien » : le champ « ＋ Autre… » au bout d'une liste de choix, et la page
// Profil › Mes ajouts (voir ce que l'app fait de chaque ajout, en ajouter, le retirer). Règles dans choices.js.
import { h, toast, ask } from './ui.js';
import { S, ACT, CHG, render, putItem, delItem, itemsOf, item, ctx } from './state.js';
import { CHOICE_LISTS, MY, resolveChoice, fmtMinutes } from './choices.js';
import { uid } from './shared.js';

/** Mes ajouts d'une liste, rangés par ordre alphabétique (ou par durée). */
export const mine = (list) => itemsOf('choice').filter((x) => x.list === list && x.label).sort((a, b) => (list === 'minutes' ? a.n - b.n : a.label.localeCompare(b.label, 'fr')));
/** Durées à proposer : celles de l'écran, puis les miennes, sans doublon (triées). */
export const withMyMinutes = (base) => [...new Set([...base, ...mine('minutes').map((x) => x.n)])].filter((n) => n > 0).sort((a, b) => a - b);

/* Chaque écran dit quoi faire d'un choix ajouté (le cocher dans sa liste) et quels choix il propose déjà. */
const TARGETS = {};
/** onChoice(cible, { apply(clé, champ, résultat), builtins: () => [[clé, libellé]] | [minutes] }) */
export const onChoice = (target, spec) => { TARGETS[target] = spec; };
/** Le champ « ＋ Autre… » au bout d'une liste de puces (big : sous de grands boutons de questionnaire) : Entrée, ou
 * quitter le champ, ajoute le choix et le coche. */
export const addField = (list, target, { i = '', big = false } = {}) => h`<input class="${big ? 'choicein' : 'chipin'}" data-change="choiceQuick" data-list="${list}" data-target="${target}" data-i="${i}" maxlength="40" ${list === 'minutes' ? h`inputmode="numeric"` : ''} placeholder="${CHOICE_LISTS[list].add}" aria-label="${CHOICE_LISTS[list].aria}" enterkeyhint="done">`;

CHG.choiceQuick = (el) => {
  const list = el.dataset.list, spec = TARGETS[el.dataset.target], text = el.value; el.value = '';
  if (!String(text).trim() || !CHOICE_LISTS[list]) return;
  const r = resolveChoice(list, text, { mine: mine(list), builtins: spec?.builtins?.() || [] });
  if (r.error) return toast(r.error, 4500, 'bad');
  let key = r.key;
  if (!key) { key = MY + uid().slice(0, 10); putItem('choice', key, { list, label: r.label, ...(r.n ? { n: r.n } : {}) }); ctx(); } // ctx() : l'ajout est nommé tout de suite partout
  try { spec?.apply?.(key, el, r); } catch (e) { toast('Ajouté, mais pas coché ici : ' + (e.message || e), 4000, 'bad'); return; }
  toast(r.builtin ? `« ${String(text).trim()} » : c’est « ${r.label} » dans l’app, coché.` : r.existing ? `« ${r.label} » : déjà dans ta liste, coché.` : `« ${r.label} » ajouté à ta liste. Tu le retrouves dans Profil › Mes ajouts.`, 4500);
};
// Entrée dans un champ « ＋ Autre… » : ajoute le choix, sans envoyer le formulaire autour (lieu, profil…).
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key !== 'Enter' || e.isComposing || !t?.matches?.('input.chipin, input.choicein')) return;
  e.preventDefault(); t.dispatchEvent(new Event('change', { bubbles: true }));
});
/** Dans un formulaire (lieu, profil) : la nouvelle puce cochée est insérée sans redessiner, pour ne rien perdre de ce qui est en cours. */
export function insertCheckChip(field, name, value, label) {
  const box = field.closest('.chips') || field.parentElement, existing = [...(field.closest('form') || box).querySelectorAll(`input[name="${name}"]`)].find((x) => x.value === value);
  if (existing) { existing.checked = true; existing.closest('.chip')?.classList.add('on'); return; }
  const lab = document.createElement('label'); lab.className = 'chip on';
  const inp = document.createElement('input'); Object.assign(inp, { type: 'checkbox', className: 'hidden', name, value, checked: true }); inp.dataset.change = 'chipToggle';
  lab.append(inp, document.createTextNode(label)); box.insertBefore(lab, field);
}

/* ═════════ Profil › Mes ajouts ═════════ */
const ORDER = ['zone', 'equipment', 'envie', 'minutes', 'physique', 'muscled', 'fall'];
export function vMine() {
  const all = itemsOf('choice'), n = all.length;
  return h`<p class="small muted">Il manque un choix dans une liste ? Écris-le dans le champ « ＋ Autre… » au bout de la liste, ou ici. S’il existe déjà dans l’app, c’est lui qui est coché ; sinon il est ajouté, pour toi seulement, sur tous tes appareils.</p>
    ${n ? '' : h`<p class="small">Aucun ajout pour l’instant.</p>`}
    ${ORDER.map((list) => { const L = CHOICE_LISTS[list], xs = mine(list); return h`<details class="card fold" ${xs.length ? 'open' : ''}><summary><span>${L.icon} ${L.title}</span><span class="tiny muted">${xs.length || ''}</span></summary>
      <p class="tiny muted">${L.effect}</p>
      ${xs.length ? h`<div class="setmenu">${xs.map((x) => h`<div class="setrow mine-row"><span class="grow"><b>${list === 'minutes' ? fmtMinutes(x.n) : x.label}</b>${list === 'zone' ? h`<small>${x.on ? '✓ à ménager en ce moment' : 'pas cochée en ce moment'}</small>
          <button class="btn sm ${x.on ? '' : 'pri'}" data-act="choiceOn" data-id="${x.id}" aria-pressed="${!!x.on}">${x.on ? 'Décocher' : 'Cocher'}</button>` : ''}</span>
        <button class="btn sm ic danger" data-act="choiceDel" data-id="${x.id}" aria-label="Retirer ${x.label}">✕</button></div>`)}</div>` : ''}
      <div class="chips">${addField(list, 'mine')}</div></details>`; })}`;
}
onChoice('mine', { apply: (key, el, r) => { if (el.dataset.list === 'zone' && !r.builtin) { const x = item('choice', key); if (x) putItem('choice', key, { ...x, on: true }); } render(); } });
ACT.choiceOn = (el) => { const x = item('choice', el.dataset.id); if (!x) return; putItem('choice', x.id, { ...x, on: !x.on }); render(); };
/** Retirer un ajout : il disparaît aussi des lieux, du profil et des projets où il était coché. */
ACT.choiceDel = async (el) => {
  const x = item('choice', el.dataset.id); if (!x) return;
  if (!(await ask(`Retirer « ${x.list === 'minutes' ? fmtMinutes(x.n) : x.label} » de tes ajouts ?`, { ok: 'Retirer', danger: true, detail: 'Il est aussi décoché partout où il l’était (lieux, profil, projets).' }))) return;
  const id = x.id, out = (l) => (Array.isArray(l) ? l.filter((k) => k !== id) : l);
  if (x.list === 'equipment') for (const e of ctx().envs) if ((e.equipment || []).includes(id) || (e.areas || []).some((a) => (a.items || []).includes(id))) { const raw = item('env', e.id); if (raw) putItem('env', e.id, { ...raw, equipment: out(raw.equipment), areas: (raw.areas || []).map((a) => ({ ...a, items: out(a.items) })) }); }
  if (x.list === 'equipment') { const conf = item('config', 'equipment'); if (conf?.unavailable?.includes(id)) putItem('config', 'equipment', { ...conf, unavailable: out(conf.unavailable) }); }
  if (x.list === 'physique' || x.list === 'muscled') { const b = item('config', 'body'); if (b && (b[x.list] || []).includes(id)) putItem('config', 'body', { ...b, [x.list]: out(b[x.list]) }); }
  if (x.list === 'fall') for (const p of itemsOf('project')) if ((p.fallWhy || []).includes(id)) { const { _u, ...rest } = p; putItem('project', p.id, { ...rest, fallWhy: out(p.fallWhy) }); }
  delItem('choice', id); toast('Retiré.'); render();
};
/** Zones ajoutées cochées « en ce moment », pour le rappel pendant les séances. */
export const myZonesOn = () => mine('zone').filter((x) => x.on);
