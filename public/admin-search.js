import { h } from './ui.js';
import { S, ACT, INPUT, api, go, accountToken, accountMatches } from './state.js';
import { norm } from './finder.js';
import { canRole } from './views-studio.js';

const GROUPS = { section: 'Rubriques', content: 'Contenu publié', exercise: 'Exercices', catalog: 'Séances prêtes', help: 'Aide', studio: 'Brouillons et publications', proposal: 'Propositions', bug: 'Signalements', user: 'Comptes' };
const state = () => S.admin.search ||= { query: '', results: [], sections: [], request: 0, token: accountToken() };
let pressed = null;
const roleFor = (kind) => ['content','exercise','catalog','help','studio','proposal'].includes(kind) ? 'content' : kind === 'bug' ? 'technical' : kind === 'user' ? 'users' : null;
function resultsView(search) {
  const q = norm(search.query);
  if (!q) return '';
  const words = q.split(' '), sections = search.sections.filter((r) => words.every((word) => norm(r.title + ' ' + r.detail).includes(word)));
  const entries = [...sections, ...search.results]; search.shown = entries;
  return h`${search.loading ? h`<p class="tiny muted" role="status">Recherche…</p>` : ''}${search.error ? h`<p class="small muted">${search.error}</p>` : ''}${Object.entries(GROUPS).map(([kind, label]) => {
    const found = entries.filter((entry) => entry.kind === kind);
    return found.length ? h`<span class="kicker">${label}</span><div class="setmenu">${found.map((entry) => h`<button type="button" class="setrow" data-act="adminSearchGo" data-i="${entries.indexOf(entry)}" data-owner="${S.user?.id || ''}"><span class="grow"><b>${entry.title}</b><small>${entry.detail}</small></span><span class="chev">›</span></button>`)}</div>` : '';
  })}${!entries.length && !search.loading ? h`<p class="small muted">${q.length < 2 ? 'Ajoute au moins deux lettres pour chercher les contenus.' : 'Aucun résultat pour cette recherche.'}</p>` : ''}`;
}
const paint = (search) => {
  if (!accountMatches(search.token) || S.admin.search !== search || S.tab !== 'settings' || S.sub.settings !== 'admin') return;
  if (pressed?.search === search) { search.pendingPaint = true; return; }
  const box = document.getElementById('admin-search-results'); if (box) box.innerHTML = resultsView(search).s;
};
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false || event.button !== 0 || !event.target.closest?.('#main [data-act]') || S.tab !== 'settings' || S.sub.settings !== 'admin' || !S.admin.search) return;
    pressed = { search: S.admin.search, pointerId: event.pointerId };
  }, true);
  const release = (event) => {
    const press = pressed;
    if (!press || press.releasing || event.pointerId != null && event.pointerId !== press.pointerId) return;
    press.releasing = true;
    setTimeout(() => { if (pressed !== press) return; pressed = null; if (press.search.pendingPaint) { press.search.pendingPaint = false; paint(press.search); } }, 0);
  };
  for (const event of ['pointerup','pointercancel','click']) document.addEventListener(event,release,true);
  window.addEventListener('blur',release); window.addEventListener('hashchange',release);
}
export function adminSearchCard(rows) {
  const search = state();
  search.sections = rows.map(([act, id, , title, detail, to]) => ({ kind: 'section', act, id, title, detail, to }));
  return h`<section class="card stack" aria-label="Recherche dans l’administration"><label>Rechercher dans l’administration<input type="search" data-input="adminSearch" value="${search.query}" placeholder="Exercice, brouillon, signalement, compte…" autocomplete="off"></label><div id="admin-search-results" aria-live="polite">${resultsView(search)}</div></section>`;
}
INPUT.adminSearch = (input) => {
  const search = state(), q = input.value.slice(0, 80), request = ++search.request;
  search.query = q; search.results = []; search.error = ''; clearTimeout(search.timer);
  search.loading = norm(q).length >= 2; paint(search);
  if (!search.loading) return;
  search.timer = setTimeout(async () => {
    if (!accountMatches(search.token) || S.admin.search !== search || request !== search.request) return;
    try {
      const response = await api('GET', '/api/admin/search?q=' + encodeURIComponent(q));
      if (!accountMatches(search.token) || S.admin.search !== search || request !== search.request) return;
      search.results = response.results || [];
    } catch (error) {
      if (!accountMatches(search.token) || S.admin.search !== search || request !== search.request) return;
      search.error = error.offline ? 'Contenus indisponibles hors ligne ; les rubriques restent accessibles.' : error.message;
    }
    search.loading = false; paint(search);
  }, 250);
};
ACT.adminSearchGo = (button) => {
  const search = state(), entry = search.shown?.[Number(button.dataset.i)];
  if (!entry || !accountMatches(search.token) || button.dataset.owner !== S.user?.id || roleFor(entry.kind) && !canRole(roleFor(entry.kind))) return;
  if (entry.kind === 'section') { if (entry.to) { const [tab, sub] = entry.to.split('/'); go(tab, sub); } else ACT[entry.act]?.({ dataset: { id: entry.id || '' } }); return; }
  if (entry.kind === 'studio') { ACT.studioOpen({ dataset: { id: entry.id } }); return; }
  if (entry.kind === 'exercise') { ACT.libInfo?.({ dataset: { id: entry.id } }); return; }
  if (entry.kind === 'catalog') { ACT.catOpen?.({ dataset: { id: entry.id } }); return; }
  if (entry.kind === 'proposal') { ACT.propOpen?.({ dataset: { id: entry.id } }); return; }
  if (entry.kind === 'bug') { S.admin.filter = 'all'; S.admin.bugQ = entry.title; go('settings','bugs'); return; }
  if (entry.kind === 'user') { S.admin.userQ = entry.title; go('settings','users'); return; }
  go('settings',entry.kind === 'help' ? 'help' : 'changes');
};
