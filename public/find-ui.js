// find-ui.js — la loupe 🔍 : on écrit ce qu'on cherche, les résultats arrivent pendant la frappe
// (fonctions, paramètres, mes séances, séances prêtes, exercices). Un toucher y mène et montre l'élément.
import { h, openSheet, closeSheet, $ } from './ui.js';
import { S, ACT, INPUT, go } from './state.js';
import { FEATURE_INDEX, SETTINGS_INDEX, findIn, norm } from './finder.js';
import { CATALOG } from './catalog.js';
import { LIBRARY } from './library.js';

const GROUPS = [['feature', 'Fonctions'], ['setting', 'Paramètres'], ['seance', 'Mes séances'], ['catalog', 'Carnet de séances'], ['exercise', 'Exercices']];
/** Ce qui vient du compte ou du catalogue : mes séances, les séances prêtes, les exercices. */
function dynamicIndex() {
  const mine = (S.seances?.items || []).filter((s) => !s.archived).map((s) => ({ kind: 'seance', icon: s.emoji || '📋', title: s.name, sub: 'Mes séances', keys: s.activity || '', act: 'openSeance', id: s.id }));
  const cat = CATALOG.map((c) => ({ kind: 'catalog', icon: c.emoji, title: c.name, sub: `Séance prête · ${c.minutes} min`, keys: `${c.why} ${(c.goals || []).join(' ')}`, act: 'catOpen', id: c.id, to: 'library/catalog' }));
  const ex = LIBRARY.filter((x) => x.role === 'main' && !x.hidden).map((x) => ({ kind: 'exercise', icon: x.emoji, title: x.name, sub: 'Exercice', keys: `${x.group || ''} ${(x.muscles || []).join(' ')}`, act: 'libInfo', id: x.id }));
  return [...mine, ...cat, ...ex];
}
function results(q, scope) {
  const index = scope === 'settings' ? SETTINGS_INDEX : [...FEATURE_INDEX, ...SETTINGS_INDEX, ...dynamicIndex()];
  S.findRes = findIn(index, q, 200);
  return S.findRes;
}
function resultsView(q, scope) {
  if (!norm(q)) return scope === 'settings' ? '' : h`<p class="tiny muted">Par exemple : « minuteur », « langue », « rappel », « tractions », « étirements »…</p>
    <div class="chips">${['Séance du jour', 'Minuteur', 'Rappels', 'Thème', 'Mes séances'].map((t) => h`<button type="button" class="chip" data-act="findTry" data-v="${t}">${t}</button>`)}</div>`;
  const list = results(q, scope);
  if (!list.length) return h`<p class="small muted">Rien trouvé pour « ${q} ». Essaie un autre mot.</p>`;
  const row = (r) => h`<button class="setrow" data-act="findGo" data-i="${S.findRes.indexOf(r)}"><span class="sic">${r.icon}</span><span class="grow"><b>${r.title}</b><small>${r.sub}</small></span><span class="chev">›</span></button>`;
  return h`${GROUPS.map(([k, label]) => { const g = list.filter((r) => r.kind === k).slice(0, scope === 'settings' ? 20 : 5); return g.length ? h`${scope === 'settings' ? '' : h`<span class="kicker">${label}</span>`}<div class="setmenu">${g.map(row)}</div>` : ''; })}`;
}
ACT.findOpen = () => {
  openSheet(h`<div class="finder"><label class="findbox"><span aria-hidden="true">🔍</span><input type="search" data-input="findQ" placeholder="Que cherches-tu ?" aria-label="Rechercher dans l’app" autocomplete="off" enterkeyhint="search"></label>
    <div id="findres">${resultsView('', 'all')}</div></div>`, { wide: true });
  setTimeout(() => $('#sheet input[data-input=findQ]')?.focus(), 60);
};
INPUT.findQ = (el) => { const box = $('#findres'); if (box) box.innerHTML = resultsView(el.value, 'all').s; };
ACT.findTry = (el) => { const i = $('#sheet input[data-input=findQ]'); if (!i) return; i.value = el.dataset.v; INPUT.findQ(i); i.focus(); };
/** Dans Paramètres : la recherche ne porte que sur les réglages. */
INPUT.setFind = (el) => {
  const box = $('#setfindres'), q = el.value; if (!box) return;
  box.innerHTML = resultsView(q, 'settings').s;
  document.querySelector('.setmenu.setmain')?.classList.toggle('hidden', !!norm(q));
};
/** Va au résultat, puis met l'élément en lumière (et ouvre le bloc replié qui le contient). */
ACT.findGo = (el) => {
  const r = S.findRes?.[Number(el.dataset.i)]; if (!r) return;
  closeSheet();
  if (r.to) { const [t, sub] = r.to.split('/'); go(t, sub); }
  if (r.act && ACT[r.act]) setTimeout(() => ACT[r.act]({ dataset: { id: r.id || '', to: r.to || '' } }), r.to ? 120 : 0);
  if (r.sel) spotlight(r.sel);
  else window.scrollTo(0, 0);
};
function spotlight(sel, tries = 0) {
  setTimeout(() => {
    const el = document.querySelector(`#main ${sel}`);
    if (!el) { if (tries < 8) spotlight(sel, tries + 1); return; }
    const det = el.closest('details'); if (det) det.open = true; if (el.tagName === 'DETAILS') el.open = true;
    const target = el.closest('label, .card, .vibes, .palette, .chips') && !el.matches('.card, .vibes, .palette') ? el.closest('label') || el : el;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.remove('found'); void target.offsetWidth; target.classList.add('found');
    setTimeout(() => target.classList.remove('found'), 2600);
  }, 180);
}
