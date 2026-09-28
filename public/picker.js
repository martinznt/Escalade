// picker.js — les longues listes à choisir (mesures, sports, figures, capacités, exercices…) deviennent une fenêtre claire :
// une recherche, les choix rangés par catégorie et triés, et « ＋ Ajouter… » quand ce qu'on cherche n'y est pas.
// Fonctionne pour tout <select> de 10 choix ou plus (ou marqué data-pick), sans changer les formulaires : le <select> reste
// dans la page (caché) et reçoit la valeur choisie, puis l'évènement « change » habituel.
import { h } from './ui.js';
import { ACT } from './state.js';

const MIN = 10;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const want = (sel) => !sel.dataset.picked && sel.dataset.pick !== 'no' && !sel.multiple && (sel.dataset.pick === 'yes' || sel.options.length >= MIN);

/** Remplace les longues listes de la page par un bouton qui ouvre le sélecteur. */
export function enhance(root = document) {
  for (const sel of root.querySelectorAll('select')) {
    if (!want(sel)) continue;
    sel.dataset.picked = '1'; sel.classList.add('pick-hidden');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pickbtn';
    b.setAttribute('aria-haspopup', 'dialog'); if (sel.getAttribute('aria-label')) b.setAttribute('aria-label', sel.getAttribute('aria-label'));
    const paint = () => { const o = sel.options[sel.selectedIndex]; b.innerHTML = h`<span class="grow">${o && o.value !== '' ? o.text : o?.text || 'Choisir…'}</span><span class="chev">▾</span>`.s; };
    paint(); sel.addEventListener('change', paint);
    b.addEventListener('click', () => open(sel, paint));
    sel.after(b);
  }
}

function groupsOf(sel) {
  const out = []; let cur = null;
  for (const node of sel.children) {
    if (node.tagName === 'OPTGROUP') { const g = { label: node.label, items: [...node.children].map((o) => ({ value: o.value, text: o.text })) }; out.push(g); cur = null; continue; }
    if (node.tagName === 'OPTION') { if (!cur) { cur = { label: '', items: [] }; out.push(cur); } cur.items.push({ value: node.value, text: node.text }); }
  }
  // Trié dans chaque groupe (les choix « vides » ou spéciaux en tête).
  for (const g of out) g.items.sort((a, b) => (a.value === '' ? -1 : b.value === '' ? 1 : a.text.localeCompare(b.text, 'fr')));
  return out;
}
let box = null;
function open(sel, paint) {
  close();
  const groups = groupsOf(sel), title = sel.closest('label')?.childNodes[0]?.textContent?.trim() || sel.getAttribute('aria-label') || 'Choisir';
  box = document.createElement('div'); box.id = 'picker'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const draw = (q = '') => {
    const nq = norm(q), list = groups.map((g) => ({ ...g, items: g.items.filter((it) => !nq || norm(it.text).includes(nq) || norm(g.label).includes(nq)) })).filter((g) => g.items.length);
    const add = sel.dataset.add && ACT[sel.dataset.add];
    box.querySelector('.pk-list').innerHTML = h`${list.length ? list.map((g) => h`${g.label ? h`<span class="kicker">${g.label}</span>` : ''}<div class="setmenu">${g.items.map((it) => h`<button type="button" class="setrow" data-v="${it.value}"><span class="grow"><b>${it.text}</b></span><span class="chev">${sel.value === it.value ? '✓' : ''}</span></button>`)}</div>`)
      : h`<p class="small muted">Rien ne correspond à « ${q} ».</p>`}
      ${add ? h`<button type="button" class="btn pk-add">＋ ${sel.dataset.addLabel || 'Ajouter'}${q ? ` « ${q} »` : ''}</button>` : ''}`.s;
  };
  box.innerHTML = h`<div class="pk-panel"><div class="row"><b class="grow">${title}</b><button type="button" class="btn sm ic pk-x" aria-label="Fermer">✕</button></div>
    <input type="search" class="pk-q" placeholder="🔍 Chercher" aria-label="Chercher dans la liste"><div class="pk-list"></div></div>`.s;
  document.body.appendChild(box); draw();
  const q = box.querySelector('.pk-q'); setTimeout(() => q.focus(), 30);
  q.addEventListener('input', () => draw(q.value));
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.pk-x')) { close(); return; }
    const row = e.target.closest('.setrow[data-v]');
    if (row) { sel.value = row.dataset.v; paint(); close(); sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
    if (e.target.closest('.pk-add')) { const text = q.value.trim(); close(); ACT[sel.dataset.add]?.({ dataset: { q: text, from: sel.name || '' } }); }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
export function close() { box?.remove(); box = null; }
// Toute page ou fenêtre affichée : ses longues listes sont améliorées (au prochain passage d'affichage).
let t = null;
new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => enhance(document), 0); }).observe(document.documentElement, { childList: true, subtree: true });
