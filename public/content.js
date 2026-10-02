// content.js — modifier le contenu de l'app : exercices, séances prêtes, intentions, formats.
// Tout le monde peut modifier « pour moi » (lié à son compte). Un administrateur choisit à chaque fois :
// « pour moi » ou « pour tout le monde » (enregistré sur le serveur, appliqué à tous les comptes).
import { h, raw, openSheet, closeSheet, toast, ask, menuList, relDate } from './ui.js';
import { S, ACT, SUBMIT, INPUT, api, ls, render, itemsOf, putItem, delItem, item, go } from './state.js';
import { uid, normalizeEx } from './shared.js';
import { parseFormats, PART_TYPES } from './format.js';
import { applyLayers, isBuiltin, textOverrides, announcements } from './global.js';
import { setOverrides, originalText } from './i18n.js';
import { FAQ } from './help.js';
import { SOURCES } from './sources.js';
import { byId } from './library.js';
import { CATALOG } from './catalog.js';
import { SPORT_INTENTS, keywordCaps } from './intentions.js';
import { ACTIVITIES, CAPACITIES } from './model.js';
import { sessionMinutes } from './engine.js';

/* ───────── Chargement et application des couches ───────── */
const cached = ls.get('sea:global', null);
let GL = { ver: cached?.ver || 0, items: Array.isArray(cached?.items) ? cached.items : [] }, sig = '';
const safe = (j) => { try { const x = JSON.parse(j || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
function mine() {
  if (!S.user) return { ex: [], cat: [] };
  return { ex: itemsOf('exedit'), cat: itemsOf('catedit').map(({ exjson, ...c }) => { const ex = safe(exjson); return ex.length ? { ...c, ex } : c; }) };
}
/** Appelé avant chaque affichage : ne recalcule que si quelque chose a changé. */
export function syncContent() {
  const m = mine(), s = `${GL.ver}|${S.user?.id || ''}|${m.ex.map((x) => x.id + x._u).join(',')}|${m.cat.map((x) => x.id + x._u).join(',')}`;
  if (s === sig) return; sig = s;
  applyLayers(GL.items, m);
  setOverrides(textOverrides());
}
export async function loadGlobal() {
  try {
    const r = await api('GET', '/api/global', undefined, { guestOk: true, quiet401: true, timeout: 8000 });
    if (r.ver !== GL.ver || r.items.length !== GL.items.length) { GL = { ver: r.ver, items: r.items }; ls.set('sea:global', GL); sig = ''; render(); }
  } catch { /* hors ligne : la dernière version connue reste appliquée */ }
}
const isAdmin = () => !!S.user?.isAdmin && !S.user?.guest;
const globalOf = (kind, id) => GL.items.find((g) => g.kind === kind && g.id === id) || null;

/* ───────── « Pour qui ? » ───────── */
let pending = null;
/** Un administrateur choisit à chaque changement ; les autres modifient pour eux. */
export function chooseScope(what, { propose = false } = {}) {
  // Sans droit administrateur : pour soi, ou (si c'est possible ici) une demande envoyée aux administrateurs.
  if (!isAdmin() && (!propose || !S.user || S.user.guest)) return Promise.resolve('me');
  const all = isAdmin() ? ['scopePick', 'all', '🌍', 'Pour tout le monde', 'Tous les comptes le voient, dès leur prochaine ouverture de l’app.']
    : ['scopePick', 'propose', '💡', 'Proposer pour tout le monde', 'Ta demande part aux administrateurs ; s’ils acceptent, tout le monde aura ce changement.'];
  return new Promise((res) => {
    pending = res;
    openSheet(h`<div class="stack"><h2 style="margin:0">Pour qui ?</h2><p class="small muted">${what}</p>
      ${menuList([['scopePick', 'me', '👤', 'Pour moi seulement', 'Seul ton compte voit ce changement.'], all])}
      <button class="btn ghost" data-act="scopePick" data-id="">Annuler</button></div>`);
  });
}
ACT.scopePick = (el) => { const r = pending; pending = null; closeSheet(); r?.(el.dataset.id || null); };
async function putGlobal(kind, id, body) {
  await api('PUT', `/api/admin/global/${kind}/${encodeURIComponent(id)}`, body);
  await loadGlobal(); sig = ''; render();
}
async function resetGlobal(kind, id) { await api('DELETE', `/api/admin/global/${kind}/${encodeURIComponent(id)}`); await loadGlobal(); sig = ''; render(); }
const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
const num = (v, d) => (v === '' || v == null ? d : Number(v));

/* ───────── Exercices ───────── */
/** Boutons ajoutés sous la fiche d'un exercice. */
export function exerciseEditButtons(x) {
  const g = globalOf('exercise', x.id), me = item('exedit', x.id);
  return h`<div class="row wrapf"><button class="btn sm" data-act="gxEdit" data-id="${x.id}">✏️ Modifier</button>
    ${me ? h`<button class="btn sm ghost" data-act="exMineReset" data-id="${x.id}">↺ Retirer ma modification</button>` : ''}
    ${isAdmin() && g ? h`<button class="btn sm ghost" data-act="exGlobalReset" data-id="${x.id}">↺ ${isBuiltin.exercise(x.id) ? 'Original pour tout le monde' : 'Supprimer pour tout le monde'}</button>` : ''}
    ${isAdmin() && !x.hidden ? h`<button class="btn sm ghost danger" data-act="exHide" data-id="${x.id}">🙈 Masquer</button>` : ''}</div>
    ${x.globalEdit || x.global ? h`<p class="tiny muted">🌍 Modifié par un administrateur pour tout le monde${g?.by ? ` (${g.by})` : ''}.</p>` : ''}${x.myEdit ? h`<p class="tiny muted">👤 Tu as modifié cet exercice pour toi.</p>` : ''}${x.hidden ? h`<p class="tiny warn-t">🙈 Masqué : il n’est plus proposé.</p>` : ''}`;
}
function exForm(x, isNew = false) {
  const t = x.mode === 'time';
  return h`<form data-submit="exEditGo" class="stack"><input type="hidden" name="id" value="${x.id || ''}"><input type="hidden" name="isNew" value="${isNew ? '1' : ''}">
    <h2 style="margin:0">${isNew ? '＋ Nouvel exercice pour tout le monde' : `✏️ ${x.name}`}</h2>
    <div class="grid2"><label>Nom<input name="name" maxlength="80" required value="${x.name || ''}"></label><label>Emoji<input name="emoji" maxlength="8" value="${x.emoji || '💪'}"></label></div>
    ${isNew ? h`<label>Sport<select name="act">${Object.entries(ACTIVITIES).map(([k, a]) => h`<option value="${k}">${a.emoji} ${a.label}</option>`)}</select></label>
      <label>Mesuré en<select name="mode"><option value="reps">Répétitions</option><option value="time">Secondes</option></select></label>` : h`<input type="hidden" name="mode" value="${x.mode}">`}
    <div class="grid3"><label>Séries<input type="number" name="sets" min="1" max="20" value="${x.sets ?? 3}"></label>
      <label>${t ? 'Secondes' : 'Rép.'} min<input type="number" name="min" min="0" max="7200" value="${t ? x.secMin : x.repsMin}"></label>
      <label>${t ? 'Secondes' : 'Rép.'} max<input type="number" name="max" min="0" max="7200" value="${t ? x.secMax : x.repsMax}"></label></div>
    <label>Repos (s)<input type="number" name="rest" min="0" max="3600" value="${x.rest ?? 60}"></label>
    <label>Consignes (une par ligne)<textarea name="cues" rows="3">${(x.cues || []).join('\n')}</textarea></label>
    <label>À éviter (une par ligne)<textarea name="bad" rows="2">${(x.bad || []).join('\n')}</textarea></label>
    <label>C’est quoi ? <small class="muted">(vide = phrase automatique)</small><textarea name="what" rows="2" maxlength="240" placeholder="Ex. Se suspendre à une réglette de 20 mm, bras tendus, 10 secondes.">${x.what || ''}</textarea></label>
    <label>À quoi ça sert ?<textarea name="why" rows="2" maxlength="240">${x.why || ''}</textarea></label>
    <button class="btn pri big">Enregistrer</button></form>`;
}
ACT.gxEdit = (el) => { const x = byId(el.dataset.id); if (x) openSheet(exForm(x), { wide: true }); };
ACT.exNewGlobal = () => { if (isAdmin()) openSheet(exForm({ mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, secMin: 30, secMax: 30, rest: 60 }, true), { wide: true }); };
SUBMIT.exEditGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), t = d.mode === 'time';
  const data = { name: d.name.trim(), emoji: d.emoji.trim(), sets: num(d.sets, 3), rest: num(d.rest, 60), cues: lines(d.cues), bad: lines(d.bad), why: d.why.trim(), what: String(d.what || '').trim(),
    ...(t ? { secMin: num(d.min, 30), secMax: Math.max(num(d.min, 30), num(d.max, 30)) } : { repsMin: num(d.min, 8), repsMax: Math.max(num(d.min, 8), num(d.max, 8)) }) };
  if (d.isNew) {
    if (!isAdmin()) return;
    const caps = keywordCaps(`${data.name} ${data.why}`);
    try { await putGlobal('exercise', 'g-' + uid().slice(0, 12), { data: { ...data, mode: d.mode, acts: [d.act], caps: Object.keys(caps).length ? caps : { gainage_anterieur: 0.5 } } }); closeSheet(); toast('Exercice ajouté pour tout le monde'); }
    catch (e) { toast(e.message, 4500, 'bad'); }
    return;
  }
  const scope = await chooseScope(`Modifier « ${data.name} »`, { propose: true }); if (!scope) return;
  if (scope === 'me') { putItem('exedit', d.id, data); sig = ''; closeSheet(); render(); toast('Modifié pour toi'); return; }
  if (scope === 'propose') { const x = byId(d.id) || {}; await sendRequest('exercise', d.id, x.name || data.name, { acts: x.acts, caps: x.caps, needs: x.needs, group: x.group, ...data, mode: d.mode }); return; }
  try { await putGlobal('exercise', d.id, { data: { ...data, mode: d.mode } }); closeSheet(); toast('Modifié pour tout le monde'); } catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.exMineReset = (el) => { delItem('exedit', el.dataset.id); sig = ''; closeSheet(); render(); toast('Ta modification est retirée'); };
ACT.exGlobalReset = async (el) => { if (!(await ask('Remettre cet exercice comme à l’origine, pour tout le monde ?', { ok: 'Oui, pour tout le monde' }))) return; try { await resetGlobal('exercise', el.dataset.id); closeSheet(); toast('Remis comme à l’origine'); } catch (e) { toast(e.message, 4500, 'bad'); } };
ACT.exHide = async (el) => {
  const x = byId(el.dataset.id); if (!x) return;
  const scope = await chooseScope(`Masquer « ${x.name} » : il ne sera plus proposé.`); if (!scope) return;
  if (scope === 'me') { putItem('exedit', x.id, { ...(item('exedit', x.id) || {}), hidden: true }); sig = ''; render(); toast('Masqué pour toi'); return; }
  try { await putGlobal('exercise', x.id, { hidden: true }); toast('Masqué pour tout le monde'); } catch (e) { toast(e.message, 4500, 'bad'); }
};

/* ───────── Séances prêtes ───────── */
export function catalogEditButtons(e) {
  const g = globalOf('catalog', e.id), me = item('catedit', e.id);
  return h`<div class="row wrapf"><button class="btn sm" data-act="gcEdit" data-id="${e.id}">✏️ Modifier</button>
    ${me ? h`<button class="btn sm ghost" data-act="catMineReset" data-id="${e.id}">↺ Retirer ma modification</button>` : ''}
    ${isAdmin() && g ? h`<button class="btn sm ghost" data-act="catGlobalReset" data-id="${e.id}">↺ ${isBuiltin.catalog(e.id) ? 'Original pour tout le monde' : 'Supprimer pour tout le monde'}</button>` : ''}
    ${isAdmin() ? h`<button class="btn sm ghost danger" data-act="catHide" data-id="${e.id}">🙈 Masquer</button>` : ''}</div>
    ${e.globalEdit || e.global ? h`<p class="tiny muted">🌍 ${e.global ? 'Ajoutée' : 'Modifiée'} par un administrateur pour tout le monde.</p>` : ''}${e.myEdit ? h`<p class="tiny muted">👤 Tu as modifié cette séance pour toi.</p>` : ''}`;
}
ACT.gcEdit = (el) => {
  const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return;
  openSheet(h`<form data-submit="catEditGo" class="stack"><input type="hidden" name="id" value="${e.id}"><h2 style="margin:0">✏️ ${e.name}</h2>
    <div class="grid2"><label>Nom<input name="name" maxlength="80" required value="${e.name}"></label><label>Emoji<input name="emoji" maxlength="8" value="${e.emoji}"></label></div>
    <label>Durée (min)<input type="number" name="minutes" min="5" max="240" value="${e.minutes}"></label>
    <label>Pourquoi cette séance<textarea name="why" rows="3" maxlength="400">${e.why}</textarea></label>
    <label>Conseils (un par ligne)<textarea name="tips" rows="2">${(e.tips || []).join('\n')}</textarea></label>
    <b class="small">Exercices</b>${e.ex.map((x, i) => { const l = byId(x.libId); return h`<div class="partrow catexrow"><span class="grow small"><b>${l?.emoji || ''} ${l?.name || x.libId}</b></span>
      <label class="tiny">Séries<input type="number" name="sets${i}" min="1" max="20" value="${x.sets}"></label><label class="tiny">${l?.mode === 'time' ? 's' : 'Rép.'}<input type="number" name="amount${i}" min="1" max="7200" value="${x.amount}"></label><label class="tiny">Repos<input type="number" name="rest${i}" min="0" max="3600" value="${x.rest}"></label>
      <label class="tiny chk"><input type="checkbox" name="del${i}"> Retirer</label></div>`; })}
    <button class="btn pri big">Enregistrer</button></form>`, { wide: true });
};
SUBMIT.catEditGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), e = CATALOG.find((x) => x.id === d.id); if (!e) return;
  const ex = e.ex.map((x, i) => (d[`del${i}`] ? null : { ...x, sets: num(d[`sets${i}`], x.sets), amount: num(d[`amount${i}`], x.amount), rest: num(d[`rest${i}`], x.rest) })).filter(Boolean);
  if (!ex.length) { toast('Garde au moins un exercice.'); return; }
  const data = { name: d.name.trim(), emoji: d.emoji.trim(), minutes: num(d.minutes, e.minutes), why: d.why.trim(), tips: lines(d.tips) };
  const scope = await chooseScope(`Modifier « ${data.name} »`, { propose: true }); if (!scope) return;
  if (scope === 'me') { putItem('catedit', e.id, { ...data, exjson: JSON.stringify(ex) }); sig = ''; render(); toast('Modifiée pour toi'); return; }
  const { globalEdit: _g, global: _n, myEdit: _m, ...base } = e;
  if (scope === 'propose') { await sendRequest('catalog', e.id, e.name || data.name, { ...base, ...data, ex }); return; }
  try { await putGlobal('catalog', e.id, { data: { ...base, ...data, ex } }); toast('Modifiée pour tout le monde'); } catch (err) { toast(err.message, 4500, 'bad'); }
};
ACT.catMineReset = (el) => { delItem('catedit', el.dataset.id); sig = ''; closeSheet(); render(); toast('Ta modification est retirée'); };
ACT.catGlobalReset = async (el) => { if (!(await ask('Remettre cette séance comme à l’origine, pour tout le monde ?', { ok: 'Oui, pour tout le monde' }))) return; try { await resetGlobal('catalog', el.dataset.id); closeSheet(); toast('Remise comme à l’origine'); } catch (e) { toast(e.message, 4500, 'bad'); } };
ACT.catHide = async (el) => {
  const e = CATALOG.find((x) => x.id === el.dataset.id); if (!e) return;
  const scope = await chooseScope(`Masquer « ${e.name} » des séances prêtes.`); if (!scope) return;
  if (scope === 'me') { putItem('catedit', e.id, { hidden: true }); sig = ''; render(); toast('Masquée pour toi'); return; }
  try { await putGlobal('catalog', e.id, { hidden: true }); toast('Masquée pour tout le monde'); } catch (err) { toast(err.message, 4500, 'bad'); }
};
/** Administrateur : une de ses séances devient une séance prête, pour tout le monde. */
function seanceAsCatalog(s) {
  const ex = s.exercises.filter((e) => e.libId && byId(e.libId)).map((e) => ({ libId: e.libId, sets: e.sets, amount: e.mode === 'time' ? e.secMax : e.repsMax, rest: e.rest, block: e.block === 'main' ? '' : e.block }));
  if (!ex.length) return null;
  const works = [...new Set(s.exercises.flatMap((e) => Object.entries(e.caps || byId(e.libId)?.caps || {}).filter(([, w]) => w >= 0.6).map(([k]) => k)))].filter((k) => CAPACITIES[k]).slice(0, 5);
  return { name: s.name, emoji: s.emoji || '🗂', activity: s.activity || 'conditioning', level: 0, minutes: Math.max(5, Math.round(sessionMinutes(s))), goals: [], works, why: s.objectives?.[0] || 'Séance proposée par la communauté.', tips: [], sources: [], ex };
}
export async function seanceToCatalog(s) {
  if (!isAdmin()) return;
  const ex = s.exercises.filter((e) => e.libId && byId(e.libId)).map((e) => ({ libId: e.libId, sets: e.sets, amount: e.mode === 'time' ? e.secMax : e.repsMax, rest: e.rest, block: e.block === 'main' ? '' : e.block }));
  if (!ex.length) { toast('Il faut au moins un exercice du catalogue dans la séance.'); return; }
  if (!(await ask(`Faire de « ${s.name} » une séance prête pour tout le monde ?`, { ok: 'Oui, pour tout le monde', detail: 'Tes notes et tes charges ne sont pas reprises.' }))) return;
  const works = [...new Set(s.exercises.flatMap((e) => Object.entries(e.caps || byId(e.libId)?.caps || {}).filter(([, w]) => w >= 0.6).map(([c]) => c)))].filter((c) => CAPACITIES[c]).slice(0, 5);
  try {
    await putGlobal('catalog', 'g-' + uid().slice(0, 12), { data: { name: s.name, emoji: s.emoji || '🗂', activity: s.activity || 'conditioning', level: 0, minutes: Math.max(5, Math.round(sessionMinutes(s))), goals: [], works, why: s.objectives?.[0] || 'Séance proposée par un administrateur.', tips: [], sources: [], ex } });
    toast('Ajoutée aux séances prêtes pour tout le monde');
  } catch (e) { toast(e.message, 4500, 'bad'); }
}
ACT.seanceToCatalog = (el) => { const s = S.seances.items.find((x) => x.id === el.dataset.id); if (s) seanceToCatalog(s); };

/* ───────── Intentions et formats (écran administrateur) ───────── */
// Paramètres › Admin, groupe « Modifier l’app sans code » : trois pages claires (contenu, textes et apparence, ce qui a été modifié).
const CHANGE_KIND = { exercise: '💪 Exercice', catalog: '🗂 Séance prête', intent: '🧭 Intention', format: '🧩 Format', grading: '🧗 Cotation', style: '🎨 Style', text: '✏️ Texte', announce: '📣 Annonce', hint: '💡 Raccourci', layout: '🧩 Mise en page', faq: '❓ Question', source: '📚 Source' };
export const globalChanges = () => GL.items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
/** Contenu de l'app : où modifier chaque type, et les intentions par sport. */
export function vAdminContent() {
  const act = (S.admAct ||= Object.keys(SPORT_INTENTS)[0]);
  const list = SPORT_INTENTS[act] || [];
  return h`<p class="small muted">Chaque modification « pour tout le monde » est versionnée et annulable. Sur une fiche, ✏️ Modifier te demande si c’est pour toi ou pour tout le monde.</p>
    ${menuList([
      ['allGo', '', '💪', 'Exercices', 'Ouvre un exercice puis ✏️ Modifier ; ou crée-en un pour tout le monde', 'library/exercises'],
      ['exNewGlobal', '', '＋', 'Nouvel exercice pour tout le monde', 'Fiche complète : consignes, erreurs, matériel, capacités'],
      ['allGo', '', '📖', 'Carnet de séances', 'Ouvre une séance du carnet puis ✏️ Modifier', 'library/catalog'],
      ['allGo', '', '❓', 'Questions fréquentes et sources', 'Dans Aide : ✏️ sur chaque question et chaque source, ＋ pour en ajouter', 'settings/help'],
      ['allGo', '', '🧗', 'Cotations et styles', 'Dans Profil › Mes sports : crée un système ou un style, puis « 🌍 Pour tout le monde »', 'profile/activities'],
    ])}
    <div class="card"><h3>🧭 Intentions par sport</h3><p class="tiny muted">Ce que les membres peuvent choisir de travailler dans « Créer une séance ».</p><div class="chips">${Object.keys(SPORT_INTENTS).map((k) => h`<button type="button" class="chip ${k === act ? 'on' : ''}" data-act="admAct" data-v="${k}">${ACTIVITIES[k]?.emoji || ''} ${ACTIVITIES[k]?.label || k}</button>`)}</div>
      ${list.map((x) => h`<div class="item"><div class="grow"><b>${x.emoji} ${x.label}</b>${x.globalEdit ? h` <span class="tag">🌍 modifiée</span>` : ''}</div><button class="btn sm ic" data-act="intEdit" data-id="${x.id}" aria-label="Modifier">✏️</button><button class="btn sm ic danger" data-act="intHide" data-id="${x.id}" aria-label="Masquer">🙈</button></div>`)}
      <button class="btn sm" data-act="intEdit" data-id="">＋ Ajouter une intention</button></div>`;
}
/** Textes et apparence : ce qui se change directement à l'écran. */
export function vAdminLook() {
  return h`<p class="small muted">Ces changements s’appliquent à tout le monde. Chacun reste annulable dans « Tout ce qui a été modifié ».</p>${menuList([
    ['textModeOn', '', '✏️', 'Modifier les textes', 'Touche n’importe quel texte de l’app et réécris-le pour tout le monde'],
    ['layEditAt', '', '🧩', 'Mise en page pour tous', 'Sur chaque page, ✏️ en haut puis « Pour tout le monde » : ordre, taille, blocs masqués', 'home/dash'],
    ['hintNew', '', '💡', 'Ajouter un raccourci', 'Une indication cliquable sur une page, qui mène à une autre'],
    ['announceNew', '', '📣', 'Écrire une annonce', 'Un message à tous, envoyé en notification'],
  ])}`;
}
/** Tout ce qui a été modifié pour tout le monde, avec « Annuler » ligne par ligne. */
export function vAdminChanges() {
  const changes = globalChanges();
  const title = (g) => g.hidden ? `Masqué : ${g.id}` : g.data?.name || g.data?.label || g.data?.title || g.data?.q || (g.data?.to ? `« ${g.data.from} » → « ${g.data.to} »` : '') || (g.kind === 'layout' ? 'Mise en page de base' : g.id);
  return h`<p class="small muted">${changes.length} élément${changes.length > 1 ? 's' : ''} différent${changes.length > 1 ? 's' : ''} du contenu d’origine. « Annuler » remet l’élément comme à l’origine (versionné, visible dans le Journal).</p>
    <div class="card">${changes.length ? changes.slice(0, 200).map((g) => h`<div class="item"><div class="grow"><b class="small">${title(g)}</b><div class="tiny muted">${CHANGE_KIND[g.kind] || g.kind} · ${new Date(g.updatedAt).toLocaleDateString('fr-FR')}${g.by ? ` · ${g.by}` : ''}</div></div><button class="btn sm ghost" data-act="glReset" data-k="${g.kind}" data-id="${g.id}">↺ Annuler</button></div>`) : h`<p class="small muted">Rien n’a encore été changé.</p>`}</div>`;
}
ACT.admAct = (el) => { S.admAct = el.dataset.v; render(); };
/* Raccourcis ajoutés par un administrateur : sur une page, une indication qui mène à une autre (pour tout le monde). */
const ROUTES = [['home/dash', 'Accueil'], ['progress/summary', 'Progrès'], ['library/home', 'Bibliothèque'], ['library/seances', 'Mes séances'], ['library/climbplan', 'Créer une séance'], ['library/exercises', 'Exercices'], ['library/catalog', 'Carnet de séances'], ['profile/home', 'Profil'], ['profile/goals', 'Objectifs'], ['profile/perfs', 'Mesures'], ['profile/climbing', 'Carnet'], ['profile/equipment', 'Mes lieux'], ['settings/main', 'Paramètres']];
ACT.hintNew = () => { if (!isAdmin()) return; const opt = (sel) => ROUTES.map(([k, l]) => h`<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`);
  openSheet(h`<form data-submit="hintGo" class="stack"><h2 style="margin:0">💡 Nouveau raccourci</h2><p class="small muted">Il s’affiche en haut de la page choisie, pour tout le monde ; chacun peut le masquer.</p>
    <label>Sur la page<select name="where">${opt('home/dash')}</select></label><label>Texte<input name="text" required maxlength="120" placeholder="Ex. Note ton max en bloc ici"></label>
    <div class="grid2"><label>Mène à<select name="go">${opt('profile/perfs')}</select></label><label>Icône<input name="icon" maxlength="4" value="💡"></label></div>
    <button class="btn pri big">Ajouter pour tout le monde</button></form>`); };
SUBMIT.hintGo = async (f) => { const d = Object.fromEntries(new FormData(f)); try { await putGlobal('hint', 'h-' + uid().slice(0, 10), { data: { where: d.where, go: d.go, text: d.text, icon: d.icon, back: 'Retour' } }); closeSheet(); toast('Raccourci ajouté pour tout le monde'); } catch (e) { toast(e.message, 4500, 'bad'); } };
ACT.intEdit = (el) => {
  const act = S.admAct, x = (SPORT_INTENTS[act] || []).find((i) => i.id === el.dataset.id) || { id: '', emoji: '🧭', label: '' };
  openSheet(h`<form data-submit="intEditGo" class="stack"><input type="hidden" name="id" value="${x.id}"><h2 style="margin:0">${x.id ? '✏️ Modifier l’intention' : '＋ Nouvelle intention'} · ${ACTIVITIES[act]?.label || act}</h2>
    <div class="grid2"><label>Nom<input name="label" maxlength="60" required value="${x.label}"></label><label>Emoji<input name="emoji" maxlength="8" value="${x.emoji}"></label></div>
    <p class="tiny muted">Pour tout le monde. Les capacités travaillées restent celles d’origine${x.id ? '' : ' (déduites du nom pour une nouvelle intention)'}.</p><button class="btn pri big">Enregistrer pour tout le monde</button></form>`);
};
SUBMIT.intEditGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), act = S.admAct;
  const id = d.id ? `${act}__${d.id}` : 'g-' + uid().slice(0, 12), caps = d.id ? {} : keywordCaps(d.label);
  try { await putGlobal('intent', id, { data: { label: d.label.trim(), emoji: d.emoji.trim(), activityId: act, caps: Object.keys(caps).length || d.id ? caps : { technique_escalade: 0.5 } } }); closeSheet(); toast('Intention enregistrée pour tout le monde'); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.intHide = async (el) => {
  if (!(await ask('Masquer cette intention pour tout le monde ?', { ok: 'Masquer', danger: true }))) return;
  try {
    if (el.dataset.id.startsWith('g-')) await resetGlobal('intent', el.dataset.id); // ajoutée par un administrateur : on la retire
    else await putGlobal('intent', `${S.admAct}__${el.dataset.id}`, { hidden: true });
    toast('Intention masquée');
  } catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.glReset = async (el) => { if (!(await ask('Annuler ce changement pour tout le monde ?', { ok: 'Oui, annuler' }))) return; try { await resetGlobal(el.dataset.k, el.dataset.id); toast('Changement annulé'); } catch (e) { toast(e.message, 4500, 'bad'); } };
/** Formats : un administrateur peut garder un format pour tout le monde (nouveau ou à la place d'un format tout prêt). */
export async function saveLayoutGlobal(data) { await putGlobal('layout', 'default', { data }); }
export async function saveFormatGlobal(id, name, parts) { await putGlobal('format', id, { data: { name, parts } }); }
export { isAdmin };

/* ───────── Proposer à tout le monde (ou publier directement, pour un administrateur) ───────── */
/** Ce qu'on peut partager avec tout le monde, à partir de ce que la personne a créé. */
const SHARE = {
  grading: (id) => { const s = item('gradesys', id); return s && { label: s.name, activityId: s.activity, data: { name: s.name, activity: s.activity, kind: s.kind, levels: s.levels, maps: s.maps } }; },
  style: (id) => { const s = item('style', id); return s && { label: s.label, activityId: s.activity, data: { label: s.label, activity: s.activity } }; },
  exercise: (id) => {
    const p = (S.personal || []).find((x) => x.id === id); if (!p) return null;
    const e = normalizeEx({ ...p.data, name: p.name });
    return { label: p.name, activityId: e.acts?.[0] || '', data: { name: p.name, emoji: e.emoji, mode: e.mode, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, secMin: e.secMin, secMax: e.secMax, rest: e.rest, perSide: e.perSide, cues: e.ok, bad: e.bad, why: e.why, acts: e.acts?.length ? e.acts : ['conditioning'], needs: e.needs, caps: Object.keys(e.caps || {}).length ? e.caps : { gainage_anterieur: 0.5 }, group: e.group } };
  },
  catalog: (id) => { const s = (S.seances?.items || []).find((x) => x.id === id); const d = s && seanceAsCatalog(s); return d && { label: s.name, activityId: s.activity, data: d }; },
  format: (id) => { const f = parseFormats(item('config', 'formats')?.formats).find((x) => x.id === id); return f && { label: f.name, data: { name: f.name, parts: f.parts } }; },
};
const WHAT = { grading: 'système de cotation', style: 'style', exercise: 'exercice', catalog: 'séance prête', format: 'format de séance', intent: 'intention', category: 'catégorie', idea: 'idée' };
/** Bouton sous un élément créé par la personne : proposer (tout le monde) ou publier (administrateur). */
export function shareButton(kind, id) {
  if (!S.user || S.user.guest) return '';
  return isAdmin() ? h`<button class="btn sm" data-act="pubGlobal" data-k="${kind}" data-id="${id}">🌍 Pour tout le monde</button>`
    : h`<button class="btn sm" data-act="propose" data-k="${kind}" data-id="${id}">💡 Proposer à tout le monde</button>`;
}
ACT.pubGlobal = async (el) => {
  const x = SHARE[el.dataset.k]?.(el.dataset.id); if (!x) { toast('Impossible : il manque des informations.'); return; }
  if (!(await ask(`Ajouter « ${x.label} » pour tout le monde ?`, { ok: 'Oui, pour tout le monde', detail: 'Tous les comptes le verront. Tu pourras l’annuler dans Paramètres › Admin.' }))) return;
  try { await putGlobal(el.dataset.k, 'g-' + uid().slice(0, 12), { data: x.data }); closeSheet(); toast('Ajouté pour tout le monde'); } catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.propose = (el) => {
  const x = SHARE[el.dataset.k]?.(el.dataset.id); if (!x) { toast('Impossible : il manque des informations.'); return; }
  S.propDraft = { kind: el.dataset.k, ...x };
  openSheet(h`<form data-submit="proposeGo" class="stack"><h2 style="margin:0">💡 Proposer à tout le monde</h2>
    <p class="small">Ton ${WHAT[el.dataset.k]} « ${x.label} » sera envoyé aux administrateurs. S’ils l’acceptent, tout le monde pourra l’utiliser.</p>
    <label>Un mot pour expliquer (facultatif)<textarea name="detail" rows="3" maxlength="600" placeholder="Ex. c’est la cotation de ma salle, beaucoup de grimpeurs y vont"></textarea></label>
    <button class="btn pri big">Envoyer la proposition</button></form>`);
};
SUBMIT.proposeGo = async (f) => {
  const d = S.propDraft; if (!d) return;
  try { await api('POST', '/api/proposals', { kind: d.kind, label: d.label, detail: String(new FormData(f).get('detail') || ''), data: d.data, activityId: d.activityId || '', from: d.kind }); closeSheet(); S.propDraft = null; toast('Merci ! Ta proposition est envoyée aux administrateurs'); }
  catch (e) { toast(e.offline ? 'Connexion requise pour proposer.' : e.message, 4500, 'bad'); }
};

/* ───────── Administrateurs : ouvrir une proposition là où elle se trouve ───────── */
const TARGET = { grading: 'profile/activities', style: 'profile/activities', exercise: 'library/exercises', catalog: 'library/catalog', format: 'library/generate', intent: 'library/generate', category: 'settings/admin', idea: 'settings/admin' };
function preview(p) {
  const d = p.payload?.data || {};
  if (p.kind === 'grading') return h`<div class="lvlrow">${(d.levels || []).map((l) => raw(`<span class="lvl" style="${l.color ? `background:${l.color}` : ''}">${String(l.label).replace(/[<>&"]/g, '')}</span>`))}</div><p class="tiny muted">${d.activity || ''} · ${(d.levels || []).length} niveaux · ${(d.maps || []).length} correspondance(s)</p>`;
  if (p.kind === 'exercise') return h`<p class="small"><b>${d.emoji || ''} ${d.name}</b> · ${d.sets} × ${d.mode === 'time' ? `${d.secMax} s` : `${d.repsMax} rép.`} · repos ${d.rest} s</p>${(d.cues || []).length ? h`<ul class="small">${d.cues.map((x) => h`<li>${x}</li>`)}</ul>` : ''}`;
  if (p.kind === 'catalog') return h`<p class="small"><b>${d.emoji || ''} ${d.name}</b> · ${d.minutes} min</p><ol class="small">${(d.ex || []).map((x) => h`<li>${byId(x.libId)?.name || x.libId} — ${x.sets} × ${x.amount}</li>`)}</ol>`;
  if (p.kind === 'format') return h`<p class="small">${(d.parts || []).map((x) => `${PART_TYPES[x.type]?.emoji || ''} ${PART_TYPES[x.type]?.label || x.type} ${x.minutes} min`).join(' · ')}</p>`;
  if (p.kind === 'style') return h`<p class="small">Style « ${d.label} »</p>`;
  if (p.kind === 'intent') return h`<p class="small">${p.payload?.emoji || '🧭'} ${p.label}${p.activity ? ` · ${ACTIVITIES[p.activity]?.label || p.activity}` : ''}</p>`;
  return '';
}
/** Ouvre la proposition : va d'abord à l'endroit d'où elle vient, puis montre ce qui est proposé. */
ACT.propOpen = async (el) => {
  if (!isAdmin()) return;
  let p = (S.inbox?.adminList || S.admin?.props || []).find((x) => x.id === el.dataset.id);
  if (!p) { try { p = (await api('GET', '/api/admin/proposals')).proposals.find((x) => x.id === el.dataset.id); } catch { /* hors ligne */ } }
  if (!p) { toast('Proposition introuvable (déjà traitée ?)'); return; }
  if (typeof p.payload_json === 'string' && !p.payload) try { p.payload = JSON.parse(p.payload_json); } catch { p.payload = {}; }
  closeSheet();
  const from = String(p.payload?.from || '');
  if (from.startsWith('#/') && (p.kind === 'idea' || p.payload?.target)) location.hash = from; // là où la personne était
  else { const [t, sub] = (TARGET[p.kind] || 'settings/admin').split('/'); go(t, sub); }
  S.propCur = p;
  const place = p.payload?.sel ? h`<div class="card flat acc-b stack"><span class="small">📍 <b>Endroit à changer</b> : « ${p.payload.snippet || 'élément'} »</span>
    <div class="grid2"><button type="button" class="btn" data-act="propSee">👁 Voir l’endroit</button><button type="button" class="btn pri" data-act="propEditPlace">✏️ Modifier pour tout le monde</button></div></div>` : '';
  if (p.payload?.sel) setTimeout(() => placeEl(p.payload.sel, true), 400);
  setTimeout(() => openSheet(h`<div class="stack"><span class="kicker">💡 ${p.payload?.target ? 'Demande de modification' : 'Proposition'} · ${WHAT[p.kind] || 'idée'}</span><h2 style="margin:0">${p.label}</h2>
    <p class="tiny muted">De ${p.username || 'un compte supprimé'} · ${relDate(p.created_at)}</p>${p.detail ? h`<p class="small">« ${p.detail} »</p>` : ''}${place}${preview(p)}
    <form data-submit="propDecide" class="stack"><input type="hidden" name="id" value="${p.id}"><label>Réponse à ${p.username || 'la personne'} (facultatif)<input name="reply" maxlength="300" placeholder="Merci !"></label>
    <div class="grid2"><button class="btn pri" name="decision" value="accept">${p.kind === 'idea' ? '✓ C’est noté' : p.payload?.target ? '✓ Appliquer pour tout le monde' : '✓ Ajouter pour tout le monde'}</button><button class="btn danger" name="decision" value="refuse">✗ Refuser</button></div></form>
    <p class="tiny muted">Une fois ajouté, tu peux encore le modifier ici avec ✏️, ou l’annuler dans Paramètres › Admin.</p></div>`, { wide: true }), 180);
};
/** L'élément joint à une idée, sur la page courante (null s'il a disparu depuis). */
function placeEl(sel, flash = false) {
  let el = null; try { el = document.querySelector(`#main ${sel}`); } catch { el = null; }
  if (el && flash) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('found'); void el.offsetWidth; el.classList.add('found'); setTimeout(() => el.classList.remove('found'), 3000); }
  return el;
}
function propBar(on) {
  document.getElementById('propbar')?.remove(); if (!on || !S.propCur) return;
  const b = document.createElement('div'); b.id = 'propbar';
  b.innerHTML = h`<span class="grow">💡 ${S.propCur.label}</span><button class="btn sm" data-act="propBack">Revenir à l’idée</button><button class="btn sm pri" data-act="propEditPlace">✏️ Modifier</button>`.s;
  document.body.appendChild(b);
}
ACT.propSee = () => { closeSheet(); const el = placeEl(S.propCur?.payload?.sel || '', true); if (!el) toast('Cet endroit n’existe plus tel quel (la page a peut-être changé).', 4000); propBar(true); };
ACT.propBack = () => { propBar(false); if (S.propCur) ACT.propOpen({ dataset: { id: S.propCur.id } }); };
/** Modifier l'endroit joint : la fiche de l'exercice ou de la séance prête s'il s'agit de l'une d'elles, sinon le texte. */
ACT.propEditPlace = () => {
  const el = placeEl(S.propCur?.payload?.sel || ''); propBar(false);
  if (!el) { toast('Endroit introuvable sur cette page : va le chercher, puis utilise Paramètres › Admin › Textes et apparence.', 5000); return; }
  const ex = el.closest('[data-act=libInfo][data-id], [data-act=gxEdit][data-id]'), cat = el.closest('[data-act=catOpen][data-id]');
  if (ex && byId(ex.dataset.id)) { closeSheet(); ACT.gxEdit({ dataset: { id: ex.dataset.id } }); return; }
  if (cat) { closeSheet(); ACT.gcEdit?.({ dataset: { id: cat.dataset.id } }); return; }
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) }), node = w.nextNode();
  if (!node) { toast('Pas de texte à cet endroit.'); return; }
  closeSheet(); openTextEdit(node);
};
SUBMIT.propDecide = async (f, e) => {
  const d = Object.fromEntries(new FormData(f)), decision = (e?.submitter || document.activeElement)?.value || 'accept';
  try {
    await api('POST', `/api/admin/proposals/${encodeURIComponent(d.id)}`, { decision, reply: d.reply || '' });
    closeSheet(); propBar(false); S.propCur = null; toast(decision === 'accept' ? 'Ajouté pour tout le monde ✓' : 'Proposition refusée');
    if (S.inbox?.adminList) S.inbox.adminList = S.inbox.adminList.filter((x) => x.id !== d.id);
    if (S.admin) S.admin.props = null;
    await loadGlobal(); sig = ''; render();
  } catch (err) { toast(err.message, 4500, 'bad'); }
};

/* ───────── Modifier les textes de l'app (administrateur) ───────── */
const textId = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return 't-' + x.toString(36) + s.length.toString(36); };
/** Premier texte visible sous l'élément touché. */
function textNodeIn(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  return w.nextNode();
}
function textBar(on) {
  document.getElementById('textbar')?.remove(); document.body.classList.toggle('textedit', on);
  if (!on) return;
  const b = document.createElement('div'); b.id = 'textbar';
  b.innerHTML = h`<span>✏️ <b>Mode textes</b> : touche un texte pour le réécrire pour tout le monde.</span><button class="btn sm pri" data-act="textModeOff">Terminer</button>`.s;
  document.body.appendChild(b);
}
ACT.textModeOn = () => { if (!isAdmin()) return; S.textMode = true; closeSheet(); go('home', 'dash'); textBar(true); toast('Touche un texte, n’importe où dans l’app'); };
ACT.textModeOff = () => { S.textMode = false; textBar(false); toast('Mode textes terminé'); };
document.addEventListener('click', (e) => {
  if (!S.textMode || e.target.closest('#textbar, #sheet, #dialog, nav.tabs')) return;
  const node = textNodeIn(e.target.closest('button, a, label, h1, h2, h3, p, b, span, small, li, summary, div') || e.target); if (!node) return;
  e.preventDefault(); e.stopPropagation(); openTextEdit(node);
}, true);
/** Réécrire un texte de l'app pour tout le monde (mode textes, ou depuis l'endroit joint à une idée). */
function openTextEdit(node) {
  const from = originalText(node), now = node.nodeValue.trim(), g = globalOf('text', textId(from));
  S.textDraft = { from };
  openSheet(h`<form data-submit="textSave" class="stack"><h2 style="margin:0">✏️ Réécrire ce texte</h2>
    <p class="tiny muted">Texte d’origine : « ${from} »</p>
    <label>Nouveau texte (pour tout le monde)<textarea name="to" rows="3" maxlength="300" required>${now}</textarea></label>
    <p class="tiny muted">Il remplace ce texte partout où il apparaît exactement pareil.</p>
    <div class="grid2"><button class="btn pri">Enregistrer pour tout le monde</button>${g ? h`<button type="button" class="btn" data-act="textReset">↺ Remettre l’original</button>` : h`<button type="button" class="btn" data-act="closeSheet">Annuler</button>`}</div></form>`);
}
SUBMIT.textSave = async (f) => {
  const from = S.textDraft?.from, to = String(new FormData(f).get('to') || '').trim(); if (!from || !to) return;
  try { if (to === from) await resetGlobal('text', textId(from)); else await putGlobal('text', textId(from), { data: { from, to } }); closeSheet(); toast('Texte modifié pour tout le monde'); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.textReset = async () => { const from = S.textDraft?.from; if (!from) return; try { await resetGlobal('text', textId(from)); closeSheet(); toast('Texte d’origine remis'); } catch (e) { toast(e.message, 4500, 'bad'); } };

/* ───────── Annonces et notes de mise à jour ───────── */
ACT.announceNew = () => {
  if (!isAdmin()) return;
  openSheet(h`<form data-submit="announceGo" class="stack"><h2 style="margin:0">📣 Écrire une annonce</h2>
    <label>Titre<input name="title" maxlength="100" required placeholder="Ex. Nouvelle salle ajoutée"></label>
    <label>Message<textarea name="body" rows="4" maxlength="1200" placeholder="Ce qui change, et à quoi ça sert"></textarea></label>
    <label class="chk"><input type="checkbox" name="update"> C’est une note de mise à jour (elle apparaît aussi dans « Toutes les mises à jour »)</label>
    <label class="chk"><input type="checkbox" name="banner"> Afficher aussi en bandeau en haut de l’app (ex. maintenance prévue)</label>
    <label>Bandeau affiché jusqu’au (facultatif)<input type="date" name="until"></label>
    <p class="tiny muted">Tout le monde la reçoit dans ses notifications 🔔, et sur son téléphone s’il a activé les nouveautés.</p>
    <button class="btn pri big">Envoyer à tout le monde</button></form>`);
};
SUBMIT.announceGo = async (f) => {
  const d = Object.fromEntries(new FormData(f));
  if (!(await ask('Envoyer cette annonce à tout le monde ?', { ok: 'Envoyer' }))) return;
  try { await putGlobal('announce', 'g-' + uid().slice(0, 12), { data: { title: d.title.trim(), body: (d.body || '').trim(), update: !!d.update, ...(d.banner ? { banner: true, until: d.until ? new Date(d.until + 'T23:59:59').getTime() : 0 } : {}) } }); closeSheet(); toast('Annonce envoyée à tout le monde'); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
export { announcements };

/* ───────── Questions fréquentes et sources (administrateur) ───────── */
export const faqAdminButtons = (id) => (isAdmin() ? h`<span class="row tight"><button class="btn sm ic" data-act="faqEdit" data-id="${id}" aria-label="Modifier">✏️</button><button class="btn sm ic danger" data-act="faqHide" data-id="${id}" aria-label="Supprimer">🗑</button></span>` : '');
ACT.faqEdit = (el) => {
  const f = FAQ.find((x) => x[2] === el.dataset.id) || ['', '', ''];
  openSheet(h`<form data-submit="faqSave" class="stack"><input type="hidden" name="id" value="${f[2]}"><h2 style="margin:0">${f[2] ? '✏️ Modifier la question' : '＋ Nouvelle question'}</h2>
    <label>Question<input name="q" maxlength="200" required value="${f[0]}"></label><label>Réponse<textarea name="a" rows="5" maxlength="1500" required>${f[1]}</textarea></label>
    <button class="btn pri big">Enregistrer pour tout le monde</button></form>`);
};
SUBMIT.faqSave = async (f) => {
  const d = Object.fromEntries(new FormData(f));
  try { await putGlobal('faq', d.id || 'g-' + uid().slice(0, 12), { data: { q: d.q.trim(), a: d.a.trim() } }); closeSheet(); toast('Question enregistrée pour tout le monde'); } catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.faqHide = async (el) => {
  if (!(await ask('Supprimer cette question pour tout le monde ?', { ok: 'Supprimer', danger: true }))) return;
  try { if (el.dataset.id.startsWith('g-')) await resetGlobal('faq', el.dataset.id); else await putGlobal('faq', el.dataset.id, { hidden: true }); toast('Question supprimée'); } catch (e) { toast(e.message, 4500, 'bad'); }
};
export const sourceAdminButtons = (id) => (isAdmin() ? h`<button class="btn sm ic" data-act="srcEdit" data-id="${id}" aria-label="Modifier la source">✏️</button>` : '');
ACT.srcEdit = (el) => {
  const id = el.dataset.id || '', s = SOURCES[id] || {};
  openSheet(h`<form data-submit="srcSave" class="stack"><input type="hidden" name="id" value="${id}"><h2 style="margin:0">${id ? '✏️ Modifier la source' : '＋ Nouvelle source'}</h2>
    <label>Titre de l’étude ou du document<input name="title" maxlength="300" required value="${s.title || ''}"></label>
    <div class="grid2"><label>Auteurs<input name="authors" maxlength="200" value="${s.authors || ''}"></label><label>Année<input type="number" name="year" min="1900" max="2100" value="${s.year || ''}"></label></div>
    <label>Revue ou éditeur<input name="journal" maxlength="200" value="${s.journal || ''}"></label>
    <label>Lien (https://…)<input name="url" type="url" required pattern="https://.+" value="${s.url || ''}"></label>
    <label>Ce qu’elle montre (en une ou deux phrases)<textarea name="key" rows="3" maxlength="600">${s.key || ''}</textarea></label>
    <div class="grid2"><button class="btn pri">Enregistrer pour tout le monde</button>${id ? h`<button type="button" class="btn danger" data-act="srcHide" data-id="${id}">Retirer</button>` : ''}</div></form>`, { wide: true });
};
SUBMIT.srcSave = async (f) => {
  const d = Object.fromEntries(new FormData(f));
  try { await putGlobal('source', d.id || 'g-' + uid().slice(0, 12), { data: { title: d.title.trim(), authors: d.authors, year: Number(d.year) || new Date().getFullYear(), journal: d.journal, url: d.url.trim(), key: d.key } }); closeSheet(); toast('Source enregistrée pour tout le monde'); }
  catch (e) { toast(e.message, 4500, 'bad'); }
};
ACT.srcHide = async (el) => {
  if (!(await ask('Retirer cette source pour tout le monde ?', { ok: 'Retirer', danger: true, detail: 'Les conseils qui la citent ne l’afficheront plus.' }))) return;
  try { if (el.dataset.id.startsWith('g-')) await resetGlobal('source', el.dataset.id); else await putGlobal('source', el.dataset.id, { hidden: true }); closeSheet(); toast('Source retirée'); } catch (e) { toast(e.message, 4500, 'bad'); }
};

/* ───────── Demandes de modification (comptes sans droit administrateur) ───────── */
/** Envoie aux administrateurs une demande de modification d'un élément existant (ils l'acceptent ou la refusent). */
async function sendRequest(kind, target, label, data) {
  try { await api('POST', '/api/proposals', { kind, target, label: `Modifier « ${label} »`, data, from: location.hash.slice(0, 80) }); closeSheet(); toast('Demande envoyée aux administrateurs, merci !'); }
  catch (e) { toast(e.offline ? 'Connexion requise pour envoyer la demande.' : e.message, 4500, 'bad'); }
}
/** « Proposer une amélioration » : n'importe quelle idée, rattachée à la page où l'on se trouve. */
/* ───────── Proposer une idée, avec l'endroit à changer ───────── */
// L'utilisateur écrit son idée, puis peut « viser » l'élément de l'app concerné : l'admin y sera emmené en un clic.
function ideaSheet() {
  const d = S.ideaDraft ||= { detail: '', from: location.hash || '#/home/dash', place: null };
  openSheet(h`<form data-submit="ideaGo" class="stack"><h2 style="margin:0">💡 Proposer une amélioration</h2>
    <p class="small muted">Une idée, un texte à corriger, un exercice à ajouter… Les administrateurs la reçoivent.</p>
    <label>Ton idée<textarea name="detail" rows="4" maxlength="1000" required data-input="ideaText" placeholder="Ex. ce texte n’est pas clair, ajouter un exercice pour les pinces…">${d.detail}</textarea></label>
    ${d.place ? h`<div class="card flat acc-b row"><span class="grow small">📍 <b>Endroit joint</b> : « ${d.place.snippet || 'élément'} »</span><button type="button" class="btn sm ic" data-act="ideaPlaceDel" aria-label="Retirer l’endroit">✕</button></div>`
      : h`<button type="button" class="btn" data-act="ideaPick">📍 Choisir l’endroit à changer <span class="tiny muted">(facultatif)</span></button>`}
    <button class="btn pri big">Envoyer</button></form>`);
}
ACT.ideaNew = () => {
  if (!S.user || S.user.guest) { toast('Crée un compte (gratuit) pour proposer une amélioration.'); return; }
  S.ideaDraft = null; closeSheet(); ideaSheet();
};
INPUT.ideaText = (el) => { if (S.ideaDraft) S.ideaDraft.detail = el.value; };
ACT.ideaPlaceDel = () => { S.ideaDraft.place = null; ideaSheet(); };
SUBMIT.ideaGo = async (f) => {
  const d = S.ideaDraft || {}, text = String(new FormData(f).get('detail') || '').trim(); if (text.length < 3) return;
  const pl = d.place || {};
  try {
    await api('POST', '/api/proposals', { kind: 'idea', label: text.slice(0, 70), detail: text, from: (pl.from || d.from || '').slice(0, 80), ...(pl.sel ? { sel: pl.sel, snippet: pl.snippet } : {}) });
    S.ideaDraft = null; closeSheet(); toast('Merci ! Ton idée est envoyée aux administrateurs');
  } catch (e) { toast(e.offline ? 'Connexion requise pour envoyer.' : e.message, 4500, 'bad'); }
};
/** Sélecteur court et stable pour un élément de la page (d'abord ses attributs data-act / data-id, sinon son chemin). */
export function selectorFor(el) {
  const main = document.getElementById('main'); if (!el || !main?.contains(el)) return '';
  const q = (v) => String(v).replace(/["\\]/g, '');
  const act = el.closest('[data-act]');
  if (act && main.contains(act)) { const s = `[data-act="${q(act.dataset.act)}"]${act.dataset.id ? `[data-id="${q(act.dataset.id)}"]` : ''}`; try { if (main.querySelectorAll(s).length === 1) return s; } catch { /* sélecteur invalide */ } }
  const path = []; let n = el;
  while (n && n !== main && path.length < 8) { const p = n.parentElement; if (!p) break; const i = [...p.children].filter((c) => c.tagName === n.tagName).indexOf(n) + 1; path.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${i})`); n = p; }
  return path.join(' > ').slice(0, 200);
}
const snippetOf = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
function pickBar() {
  document.getElementById('pickbar')?.remove();
  if (!S.pick) { document.body.classList.remove('picking'); return; }
  document.body.classList.toggle('picking', S.pick.mode === 'aim');
  const b = document.createElement('div'); b.id = 'pickbar';
  b.innerHTML = (S.pick.cand
    ? h`<span class="grow">📍 « ${S.pick.cand.snippet || 'cet élément'} »</span><button class="btn sm" data-act="pickOther">Autre</button><button class="btn sm pri" data-act="pickOk">✓ Joindre</button>`
    : S.pick.mode === 'nav'
      ? h`<span class="grow">🧭 Va sur la bonne page, puis touche <b>Viser</b>.</span><button class="btn sm" data-act="pickCancel">Annuler</button><button class="btn sm pri" data-act="pickAim">🎯 Viser</button>`
      : h`<span class="grow">📍 Touche l’endroit à changer.</span><button class="btn sm" data-act="pickNav">Changer de page</button><button class="btn sm" data-act="pickCancel">Annuler</button>`).s;
  document.body.appendChild(b);
}
ACT.ideaPick = () => { S.ideaDraft.detail = document.querySelector('#sheet textarea[name=detail]')?.value || S.ideaDraft.detail; closeSheet(); S.pick = { mode: 'aim', cand: null }; pickBar(); };
ACT.pickNav = () => { S.pick.mode = 'nav'; pickBar(); };
ACT.pickAim = () => { S.pick.mode = 'aim'; pickBar(); };
ACT.pickOther = () => { document.querySelector('.pickfound')?.classList.remove('pickfound'); S.pick.cand = null; S.pick.mode = 'aim'; pickBar(); };
ACT.pickCancel = () => { document.querySelector('.pickfound')?.classList.remove('pickfound'); S.pick = null; pickBar(); ideaSheet(); };
ACT.pickOk = () => { document.querySelector('.pickfound')?.classList.remove('pickfound'); S.ideaDraft.place = { ...S.pick.cand, from: location.hash }; S.pick = null; pickBar(); ideaSheet(); };
document.addEventListener('click', (e) => {
  if (S.pick?.mode !== 'aim' || S.pick.cand || e.target.closest('#pickbar, #sheet, #dialog, nav.tabs')) return;
  const el = e.target.closest('#main *'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  const target = el.closest('button, a, label, h1, h2, h3, li, .card, .setrow, .chip') || el;
  document.querySelector('.pickfound')?.classList.remove('pickfound'); target.classList.add('pickfound');
  S.pick.cand = { sel: selectorFor(target), snippet: snippetOf(target) }; pickBar();
}, true);
