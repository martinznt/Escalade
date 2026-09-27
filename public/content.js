// content.js — modifier le contenu de l'app : exercices, séances prêtes, intentions, formats.
// Tout le monde peut modifier « pour moi » (lié à son compte). Un administrateur choisit à chaque fois :
// « pour moi » ou « pour tout le monde » (enregistré sur le serveur, appliqué à tous les comptes).
import { h, openSheet, closeSheet, toast, ask, menuList } from './ui.js';
import { S, ACT, SUBMIT, api, ls, render, itemsOf, putItem, delItem, item } from './state.js';
import { uid } from './shared.js';
import { applyLayers, isBuiltin } from './global.js';
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
export function chooseScope(what) {
  if (!isAdmin()) return Promise.resolve('me');
  return new Promise((res) => {
    pending = res;
    openSheet(h`<div class="stack"><h2 style="margin:0">Pour qui ?</h2><p class="small muted">${what}</p>
      ${menuList([['scopePick', 'me', '👤', 'Pour moi seulement', 'Seul ton compte voit ce changement.'], ['scopePick', 'all', '🌍', 'Pour tout le monde', 'Tous les comptes le voient, dès leur prochaine ouverture de l’app.']])}
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
    <label>Pourquoi cet exercice<textarea name="why" rows="2" maxlength="240">${x.why || ''}</textarea></label>
    <button class="btn pri big">Enregistrer</button></form>`;
}
ACT.gxEdit = (el) => { const x = byId(el.dataset.id); if (x) openSheet(exForm(x), { wide: true }); };
ACT.exNewGlobal = () => { if (isAdmin()) openSheet(exForm({ mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, secMin: 30, secMax: 30, rest: 60 }, true), { wide: true }); };
SUBMIT.exEditGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), t = d.mode === 'time';
  const data = { name: d.name.trim(), emoji: d.emoji.trim(), sets: num(d.sets, 3), rest: num(d.rest, 60), cues: lines(d.cues), bad: lines(d.bad), why: d.why.trim(),
    ...(t ? { secMin: num(d.min, 30), secMax: Math.max(num(d.min, 30), num(d.max, 30)) } : { repsMin: num(d.min, 8), repsMax: Math.max(num(d.min, 8), num(d.max, 8)) }) };
  if (d.isNew) {
    if (!isAdmin()) return;
    const caps = keywordCaps(`${data.name} ${data.why}`);
    try { await putGlobal('exercise', 'g-' + uid().slice(0, 12), { data: { ...data, mode: d.mode, acts: [d.act], caps: Object.keys(caps).length ? caps : { gainage_anterieur: 0.5 } } }); closeSheet(); toast('Exercice ajouté pour tout le monde'); }
    catch (e) { toast(e.message, 4500, 'bad'); }
    return;
  }
  const scope = await chooseScope(`Modifier « ${data.name} »`); if (!scope) return;
  if (scope === 'me') { putItem('exedit', d.id, data); sig = ''; closeSheet(); render(); toast('Modifié pour toi'); return; }
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
  const scope = await chooseScope(`Modifier « ${data.name} »`); if (!scope) return;
  if (scope === 'me') { putItem('catedit', e.id, { ...data, exjson: JSON.stringify(ex) }); sig = ''; render(); toast('Modifiée pour toi'); return; }
  const { globalEdit: _g, global: _n, myEdit: _m, ...base } = e;
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
export function vAdminContent() {
  const act = (S.admAct ||= Object.keys(SPORT_INTENTS)[0]);
  const list = SPORT_INTENTS[act] || [];
  const changes = GL.items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const title = (g) => g.hidden ? `Masqué : ${g.id}` : g.data?.name || g.data?.label || g.id;
  const KIND = { exercise: '💪 Exercice', catalog: '🗂 Séance prête', intent: '🧭 Intention', format: '🧩 Format' };
  return h`<div class="card"><h3>🌍 Contenu pour tout le monde</h3><p class="small muted">Sur chaque exercice ou séance prête, « ✏️ Modifier » te demande si c’est pour toi ou pour tout le monde. Ici : les intentions par sport, et tout ce qui a été changé.</p>
      <div class="row wrapf"><button class="btn sm" data-act="exNewGlobal">＋ Exercice pour tout le monde</button><button class="btn sm" data-act="allGo" data-to="library/catalog">🗂 Séances prêtes</button></div></div>
    <div class="card"><h3>🧭 Intentions par sport</h3><div class="chips">${Object.keys(SPORT_INTENTS).map((k) => h`<button type="button" class="chip ${k === act ? 'on' : ''}" data-act="admAct" data-v="${k}">${ACTIVITIES[k]?.emoji || ''} ${ACTIVITIES[k]?.label || k}</button>`)}</div>
      ${list.map((x) => h`<div class="item"><div class="grow"><b>${x.emoji} ${x.label}</b>${x.globalEdit ? h` <span class="tag">🌍 modifiée</span>` : ''}</div><button class="btn sm ic" data-act="intEdit" data-id="${x.id}" aria-label="Modifier">✏️</button><button class="btn sm ic danger" data-act="intHide" data-id="${x.id}" aria-label="Masquer">🙈</button></div>`)}
      <button class="btn sm" data-act="intEdit" data-id="">＋ Ajouter une intention</button></div>
    <div class="card"><h3>📝 Changements pour tout le monde (${changes.length})</h3>${changes.length ? changes.slice(0, 60).map((g) => h`<div class="item"><div class="grow"><b class="small">${title(g)}</b><div class="tiny muted">${KIND[g.kind]} · ${new Date(g.updatedAt).toLocaleDateString('fr-FR')}${g.by ? ` · ${g.by}` : ''}</div></div><button class="btn sm ghost" data-act="glReset" data-k="${g.kind}" data-id="${g.id}">↺ Annuler</button></div>`) : h`<p class="small muted">Rien n’a encore été changé.</p>`}</div>`;
}
ACT.admAct = (el) => { S.admAct = el.dataset.v; render(); };
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
export async function saveFormatGlobal(id, name, parts) { await putGlobal('format', id, { data: { name, parts } }); }
export { isAdmin };
