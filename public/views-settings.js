// views-settings.js — Paramètres : séance, apparence, compte, données (export / import JSON, import CSV),
// synchronisation et diagnostic, administration (EDIT_PASSWORD vérifié par le serveur), signalement de bug.
import { h, raw, $, toast, openSheet, closeSheet, ask, seg, chip, tag, empty, fmtDateTime, fmtDay, relDate, buzzOk, skeleton } from './ui.js';
import { S, ACT, SUBMIT, CHG, INPUT, APP_VERSION, ctx, go, render, api, queue, saveSettings, syncAll, retryFailed, discardFailed, restoreConflict, pendingCount, persistNow, clearLocal, DEFAULT_SETTINGS, putItem, itemsOf, addHistory, saveEvent, ls, writePending, persist, bump, syncSoon } from './state.js';
import { uid, mergeSeances, readStored, normalizeSession } from './shared.js';
import { cleanItem, itemKey } from './items.js';
import { parseCSV, proposeMapping, checkMapping, proposeMetricMap, buildImport, TARGETS, MAX_CSV_BYTES } from './csv.js';
import { describeOp } from './outbox.js';

const PALETTES = [['gres', '#c8914d', 'Cuivre'], ['granit', '#6f97a8', 'Granit'], ['foret', '#8c9a6b', 'Forêt'], ['corail', '#c27a5a', 'Terre cuite'], ['encre', '#9a8bb8', 'Encre'], ['contraste', '#ffd60a', 'Contraste']];
const SUBS = [['main', 'Général'], ['data', 'Données'], ['sync', 'Synchronisation'], ['admin', 'Administration'], ['bug', 'Signaler un bug']];
export function vSettings() {
  const sub = SUBS.some(([k]) => k === S.sub.settings) ? S.sub.settings : 'main';
  const views = { main: vMain, data: vData, sync: vSync, admin: vAdmin, bug: vBug };
  return h`<h1>Paramètres</h1><div class="scrollx">${seg('setSub', sub, SUBS)}</div>${views[sub]()}`;
}
ACT.setSub = (el) => { go('settings', el.dataset.id); if (el.dataset.id === 'admin' && S.user?.isAdmin) loadBugs(); if (el.dataset.id === 'bug') loadMyBugs(); };

/* ═════════ Général ═════════ */
function vMain() {
  const st = S.settings, a = window.__sea.load();
  const segA = (k, opts) => h`<div class="chips">${opts.map(([v, l]) => chip(a[k] === v, l, `data-act="appear" data-k="${k}" data-v="${v}"`))}</div>`;
  return h`<div class="card"><h3>▶ Pendant la séance</h3>
      <label>Repos par défaut<span class="unitbox"><input type="number" inputmode="numeric" data-change="pref" name="defaultRest" min="0" max="600" value="${st.defaultRest ?? 60}"><em>s</em></span></label>
      <label>Durée de séance préférée<span class="unitbox"><input type="number" inputmode="numeric" data-change="pref" name="defaultMinutes" min="5" max="240" value="${st.defaultMinutes ?? 30}"><em>min</em></span></label>
      ${[['sound', 'Bips pour les chronos'], ['vibration', 'Vibration en fin de repos et à la validation'], ['voice', 'Lire les exercices à voix haute'], ['keepAwake', 'Garder l’écran allumé'], ['handsFree', 'Mode mains libres (commandes vocales)'], ['autoBase', 'Proposer par défaut d’utiliser mes valeurs réalisées comme nouvelle base']].map(([k, l]) => h`<label class="chk"><input type="checkbox" data-change="pref" name="${k}" ${st[k] ? 'checked' : ''}> ${l}</label>`)}</div>
    <div class="card"><h3>🎨 Apparence (cet appareil)</h3>
      <label>Mode</label>${segA('mode', [['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Auto']])}
      <label>Palette</label><div class="palette">${PALETTES.map(([id, c, n]) => h`<button type="button" class="sw ${a.palette === id ? 'on' : ''}" style="background:${c}" title="${n}" aria-label="${n}" data-act="appear" data-k="palette" data-v="${id}"></button>`)}</div>
      <label>Taille du texte</label>${segA('size', [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']])}
      <label>Densité</label>${segA('density', [['compact', 'Compact'], ['normal', 'Normal'], ['airy', 'Aéré']])}
      <label>Animations</label>${segA('motion', [['on', 'Oui'], ['off', 'Non']])}</div>
    <div class="card"><h3>👤 Compte : ${S.user.username} ${S.user.isAdmin ? tag('administrateur', 'acc') : ''}</h3>
      <div class="row wrapf"><button class="btn" data-act="chpass">Changer le mot de passe</button><button class="btn" data-act="logout">Se déconnecter</button><button class="btn danger" data-act="delAccount">Supprimer mon compte</button></div></div>
    <div class="card"><h3>ℹ️ À propos</h3><p class="small">Mes séances · version ${APP_VERSION}. Tes données sont liées à ton compte et synchronisées ; elles restent utilisables hors ligne sur cet appareil.</p>
      <p class="tiny muted">Les séances et analyses suivent des principes d’entraînement courants. Elles décrivent tes données et ne constituent ni un avis médical ni un diagnostic. Aucune comparaison avec d’autres personnes n’est faite.</p></div>`;
}
CHG.pref = (el) => { S.settings[el.name] = el.type === 'checkbox' ? el.checked : Math.max(Number(el.min) || 0, Math.min(Number(el.max) || 600, Number(el.value) || 0)); saveSettings(); document.documentElement.classList.toggle('hands', !!S.settings.handsFree); };
ACT.appear = (el) => { window.__sea.save({ ...window.__sea.load(), [el.dataset.k]: el.dataset.v }); render(); };
ACT.chpass = () => openSheet(h`<h2 style="margin:0">Changer le mot de passe</h2><form data-submit="chpass" class="stack"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden" aria-hidden="true"><label>Mot de passe actuel<input type="password" name="current" autocomplete="current-password" required></label><label>Nouveau (8 caractères minimum)<input type="password" name="next" autocomplete="new-password" required minlength="8"></label><p class="tiny muted">Tes autres appareils seront déconnectés.</p><button class="btn pri" type="submit">Changer</button></form>`);
SUBMIT.chpass = async (f) => { const d = Object.fromEntries(new FormData(f)); try { await api('POST', '/api/auth/password', { current: d.current, next: d.next }); f.reset(); closeSheet(); toast('Mot de passe changé ; les autres appareils sont déconnectés.'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };
ACT.logout = async () => {
  const n = pendingCount();
  const ok = await ask('Te déconnecter de cet appareil ?', { ok: 'Se déconnecter', detail: n ? `${n} modification(s) pas encore synchronisée(s) : elles restent sur cet appareil et seront envoyées à ta prochaine connexion ici.` : 'Tes données restent sur ton compte.' });
  if (!ok) return;
  await persistNow();
  try { await api('POST', '/api/auth/logout', {}); } catch { /* hors ligne : on se déconnecte localement */ }
  ls.del('sea:user'); S.user = null; S.authMode = 'login'; S.authError = ''; location.hash = ''; render();
};
ACT.delAccount = async () => { if (!(await ask('Supprimer définitivement ton compte et toutes tes données ?', { ok: 'Continuer', danger: true, detail: 'Tes contributions à la bibliothèque commune resteront, sans ton nom.' }))) return; openSheet(h`<h2 style="margin:0">Confirmer la suppression</h2><form data-submit="delacct" class="stack"><input type="text" name="username" value="${S.user.username}" autocomplete="username" class="hidden" aria-hidden="true"><label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label><button class="btn danger" type="submit">Supprimer définitivement</button></form>`); };
SUBMIT.delacct = async (f) => { try { const id = S.user.id; await api('POST', '/api/auth/delete', { password: new FormData(f).get('password') }); await clearLocal(id); ls.del('sea:user'); closeSheet(); S.user = null; S.authMode = 'register'; location.hash = ''; render(); toast('Compte supprimé'); } catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); } };

/* ═════════ Données : export / import JSON, import CSV ═════════ */
function vData() {
  const c = S.csv;
  return h`<div class="card"><h3>📦 Sauvegarde complète</h3><p class="small muted">Exporte toutes tes données (séances, historique, calendrier, profil, performances, objectifs, cotations, préférences…) dans un fichier JSON réimportable.</p>
      <div class="row wrapf"><button class="btn pri" data-act="export">📥 Exporter</button><label class="btn">📤 Importer un JSON<input type="file" accept="application/json,.json" data-change="importJson" class="hidden"></label></div></div>
    <div class="card"><h3>📊 Import CSV</h3><p class="small muted">Importe un historique de séances ou des performances depuis un tableur. Tu vérifies la correspondance des colonnes et un aperçu avant tout import.</p>
      <div class="chips">${chip((c?.kind || 'history') === 'history', 'Séances réalisées', 'data-act="csvKind" data-id="history"')}${chip(c?.kind === 'perf', 'Performances', 'data-act="csvKind" data-id="perf"')}</div>
      <label class="btn">Choisir un fichier CSV<input type="file" accept=".csv,text/csv,text/plain" data-change="csvFile" class="hidden"></label>
      ${c?.parsed ? vCsvWizard(c) : ''}</div>`;
}
ACT.export = () => {
  const data = { app: 'mes-seances', version: 8, exportedAt: new Date().toISOString(), seances: S.seances, history: S.history, events: S.events, settings: S.settings, personal: S.personal, items: [...S.items.values()].filter((i) => !i.del), appearance: window.__sea?.load?.() || {} };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `mes-seances-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Sauvegarde exportée');
};
export function importData(d) {
  if (!d || typeof d !== 'object' || (d.app && !['mes-seances', 'seance-entrainement'].includes(d.app))) throw new Error('Ce fichier n’est pas une sauvegarde de l’application.');
  const now = Date.now(), res = { seances: 0, history: 0, events: 0, items: 0, personal: 0, skipped: 0 };
  const inc = readStored(d.seances ?? []);
  S.seances = mergeSeances(S.seances, inc); S.seancesDirty = true; S.seancesVer++; res.seances = inc.items.length;
  const haveH = new Set(S.history.map((x) => x.id));
  for (const x of (Array.isArray(d.history) ? d.history : []).slice(0, 3000)) {
    if (!x?.id || !/^[\w-]{1,64}$/.test(x.id) || !(x.startedAt > 0) || x.startedAt > now + 600000) { res.skipped++; continue; }
    if (!haveH.has(x.id)) { addHistory({ id: x.id, sessionId: x.sessionId || null, sessionName: String(x.sessionName || 'Séance').slice(0, 100), startedAt: x.startedAt, durationSeconds: x.durationSeconds || 0, data: x.data || {} }); res.history++; }
  }
  const haveE = new Set(S.events.map((x) => x.id));
  for (const x of (Array.isArray(d.events) ? d.events : []).slice(0, 3000)) { if (x?.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && !haveE.has(x.id)) { saveEvent(x); res.events++; } }
  for (const it of (Array.isArray(d.items) ? d.items : []).slice(0, 20000)) {
    const c = cleanItem({ ...it, u: now }); if (!c || c.del) { res.skipped++; continue; }
    const k = itemKey(c.c, c.id), cur = S.items.get(k);
    if (!cur || cur.del || (it.u || 0) > cur.u) { S.items.set(k, { ...c, u: Math.max(now, (cur?.u || 0) + 1) }); S.dirtyItems.add(k); res.items++; }
  }
  const haveP = new Set(S.personal.map((x) => x.name.toLowerCase()));
  for (const x of (Array.isArray(d.personal) ? d.personal : []).slice(0, 1000)) { const data = x?.data || x, name = String(data?.name || x?.name || '').trim(); if (!name || haveP.has(name.toLowerCase())) continue; const id = uid(); S.personal.push({ id, name, data }); queue('POST', '/api/exercises/personal', { id, exercise: data }); haveP.add(name.toLowerCase()); res.personal++; }
  if (d.settings && typeof d.settings === 'object') { for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in d.settings) S.settings[k] = d.settings[k]; if (d.settings.level) S.settings.level = d.settings.level; saveSettings(); }
  if (d.appearance && typeof d.appearance === 'object' && window.__sea?.save) window.__sea.save({ ...window.__sea.DEFAULTS, ...d.appearance });
  return res;
}
CHG.importJson = async (el) => {
  const file = el.files?.[0]; el.value = ''; if (!file) return;
  if (file.size > 8_000_000) { toast('Fichier trop volumineux (8 Mo maximum).', 4000, 'bad'); return; }
  let d; try { d = JSON.parse(await file.text()); } catch { toast('Fichier illisible : ce n’est pas un JSON valide.', 4000, 'bad'); return; }
  if (!(await ask('Importer cette sauvegarde ?', { ok: 'Importer', detail: 'Les éléments sont fusionnés avec tes données actuelles, sans rien supprimer. Le serveur valide chaque élément.' }))) return;
  try { const r = importData(d); writePending(); persist(); bump(); syncSoon(200); buzzOk(); toast(`Importé : ${r.seances} séance(s), ${r.history} historique(s), ${r.events} événement(s), ${r.items} donnée(s) de profil, ${r.personal} exercice(s)${r.skipped ? ` · ${r.skipped} élément(s) invalide(s) ignoré(s)` : ''}.`, 6000); render(); }
  catch (e) { toast(e.message, 5000, 'bad'); }
};
ACT.csvKind = (el) => { S.csv = { kind: el.dataset.id }; render(); };
CHG.csvFile = async (el) => {
  const file = el.files?.[0]; el.value = ''; if (!file) return;
  if (file.size > MAX_CSV_BYTES) { toast('Fichier trop volumineux.', 4000, 'bad'); return; }
  try {
    const parsed = parseCSV(await file.text()), kind = S.csv?.kind || 'history';
    const { mapping, notes } = proposeMapping(parsed.headers, kind);
    S.csv = { kind, parsed, mapping, notes, metricMap: {}, name: file.name };
    refreshMetricMap(); render();
  } catch (e) { toast(e.message, 5000, 'bad'); }
};
function refreshMetricMap() {
  const c = S.csv; if (c.kind !== 'perf') return;
  const col = Object.entries(c.mapping).find(([, f]) => f === 'metric')?.[0];
  const values = col != null ? c.parsed.rows.map((r) => r[col]) : [];
  c.metricMap = { ...proposeMetricMap(values, ctx().metrics), ...Object.fromEntries(Object.entries(c.metricMap).filter(([v]) => values.includes(v))) };
}
function vCsvWizard(c) {
  const T = TARGETS[c.kind], chk = checkMapping(c.mapping, c.kind);
  const pre = chk.ok ? buildImport({ ...c.parsed, rows: c.parsed.rows.slice(0, 200) }, c.mapping, c.kind, { metricMap: c.metricMap }) : null;
  const metrics = Object.entries(ctx().metrics).filter(([, m]) => m.kind !== 'grade');
  return h`<div class="card flat"><b>${c.name}</b> · ${c.parsed.rows.length} ligne(s) · séparateur « ${c.parsed.sep === '\t' ? 'tabulation' : c.parsed.sep} »
    <h3>1. Correspondance des colonnes</h3><p class="tiny muted">Rien n’est deviné en silence : vérifie chaque colonne. « Non importée » = ignorée.</p>
    ${c.parsed.headers.map((hd, i) => h`<div class="item"><div class="grow"><b>${hd}</b><div class="tiny muted">ex. : ${c.parsed.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ') || '—'}</div><div class="tiny ${c.mapping[i] ? 'ok-t' : 'warn-t'}">${c.notes[i]}</div></div>
      <select data-change="csvMap" data-i="${i}" aria-label="Champ pour ${hd}"><option value="">Non importée</option>${Object.entries(T).map(([f, t]) => h`<option value="${f}" ${c.mapping[i] === f ? 'selected' : ''}>${t.label}${t.required ? ' *' : ''}</option>`)}</select></div>`)}
    ${chk.errors.map((e) => h`<p class="small err">⚠ ${e}</p>`)}
    ${c.kind === 'perf' && Object.keys(c.metricMap).length ? h`<h3>2. Correspondance des métriques</h3>${Object.entries(c.metricMap).map(([v, mid]) => h`<div class="item"><div class="grow"><b>${v}</b>${!mid ? h`<div class="tiny warn-t">non mappée : ces lignes seront ignorées</div>` : ''}</div><select data-change="csvMetric" data-v="${v}" aria-label="Métrique pour ${v}"><option value="">Non mappée</option>${metrics.map(([id, m]) => h`<option value="${id}" ${mid === id ? 'selected' : ''}>${m.label}</option>`)}</select></div>`)}` : ''}
    ${pre ? h`<h3>${c.kind === 'perf' ? '3' : '2'}. Aperçu</h3><p class="small">${pre.records.length} ${c.kind === 'perf' ? 'performance(s)' : 'séance(s)'} prête(s)${c.parsed.rows.length > 200 ? ' (aperçu des 200 premières lignes)' : ''} · ${pre.skipped} ligne(s) ignorée(s)</p>
      ${pre.records.slice(0, 8).map((r) => c.kind === 'perf' ? h`<p class="tiny">${fmtDay(r.d.date)} · ${ctx().metrics[r.d.metricId]?.label} : ${r.d.value} ${r.d.unit}</p>` : h`<p class="tiny">${fmtDay(r.startedAt)} · ${r.sessionName} · ${r.data.exercises.length} exercice(s)${r.durationSeconds ? ' · ' + Math.round(r.durationSeconds / 60) + ' min' : ''}</p>`)}
      ${pre.errors.slice(0, 8).map((e) => h`<p class="tiny err">Ligne ${e.row} : ${e.error}</p>`)}
      <button class="btn pri" data-act="csvImport" ${pre.records.length ? '' : 'disabled'}>Importer après vérification</button>` : ''}
    <button class="btn" data-act="csvCancel">Annuler</button></div>`;
}
CHG.csvMap = (el) => { S.csv.mapping[el.dataset.i] = el.value; S.csv.notes[el.dataset.i] = el.value ? 'Choisi par toi.' : 'Non importée.'; refreshMetricMap(); render(); };
CHG.csvMetric = (el) => { S.csv.metricMap[el.dataset.v] = el.value; render(); };
ACT.csvCancel = () => { S.csv = null; render(); };
ACT.csvImport = async () => {
  const c = S.csv, r = buildImport(c.parsed, c.mapping, c.kind, { metricMap: c.metricMap });
  if (!(await ask(`Importer ${r.records.length} ${c.kind === 'perf' ? 'performance(s)' : 'séance(s)'} ?`, { ok: 'Importer', detail: r.skipped ? `${r.skipped} ligne(s) seront ignorées (voir l’aperçu).` : '' }))) return;
  let n = 0;
  if (c.kind === 'perf') { for (const it of r.records) { if (!S.items.has(itemKey('perf', it.id))) { putItem('perf', it.id, it.d); n++; } } }
  else { const have = new Set(S.history.map((x) => x.id)); for (const e of r.records) if (!have.has(e.id)) { addHistory(e); n++; } }
  S.csv = null; buzzOk(); toast(`${n} élément(s) importé(s)${r.records.length - n ? `, ${r.records.length - n} déjà présent(s) (pas de doublon)` : ''}.`, 5000); render();
};

/* ═════════ Synchronisation et diagnostic ═════════ */
function vSync() {
  const W = { ok: '✅ synchronisé', sync: '🔄 en cours', pending: '⏳ modifications en attente', offline: '📴 hors ligne : tout est gardé sur cet appareil', error: '⚠️ erreur', auth: '🔑 reconnexion nécessaire', idle: '—' };
  return h`<div class="card"><h3>État</h3><p>${W[S.sync] || S.sync}</p><p class="small muted">Dernière synchronisation : ${S.lastSync ? fmtDateTime(S.lastSync) : 'jamais'}${S.lastError ? ' · ' + S.lastError : ''}</p>
      <p class="small">${S.outbox.length} action(s) en file · ${S.dirtyItems.size} donnée(s) de profil à envoyer · ${S.seancesDirty ? 'séances modifiées à envoyer' : 'séances à jour'}</p>
      <div class="row wrapf"><button class="btn pri" data-act="syncNow">🔄 Synchroniser maintenant</button><button class="btn" data-act="diag">🩺 Tester le serveur</button><button class="btn" data-act="hardReload">♻️ Recharger l’application</button></div></div>
    ${S.outbox.length ? h`<div class="card"><h3>File d’attente</h3>${S.outbox.slice(0, 30).map((o, i) => h`<div class="item"><div class="grow small">${i + 1}. ${o.label || describeOp(o)}${o.attempts ? h` <span class="tiny warn-t">(${o.attempts} essai(s) : ${o.lastError || ''})</span>` : ''}<div class="tiny muted">${fmtDateTime(o.at)}</div></div></div>`)}<p class="tiny muted">Envoyée dans l’ordre dès que la connexion revient. Chaque action a un identifiant unique : pas de doublon même si elle est rejouée.</p></div>` : ''}
    ${S.failed.length ? h`<div class="card bad-b"><h3>Actions en échec (${S.failed.length})</h3><p class="tiny muted">Refusées par le serveur ou mises de côté après des erreurs répétées. Rien n’a été effacé : tu peux réessayer ou abandonner.</p>${S.failed.slice().reverse().slice(0, 30).map((f) => h`<div class="item"><div class="grow small"><b>${f.label || describeOp(f)}</b><div class="tiny err">${f.error}</div><div class="tiny muted">${fmtDateTime(f.failedAt || f.at)}</div></div><button class="btn sm" data-act="failRetry" data-id="${f.opId}">Réessayer</button><button class="btn sm danger" data-act="failDrop" data-id="${f.opId}">Abandonner</button></div>`)}</div>` : ''}
    ${S.conflicts.length ? h`<div class="card"><h3>Conflits résolus (${S.conflicts.length})</h3><p class="tiny muted">Un autre appareil a modifié la même donnée plus récemment : sa version a été gardée. Ta version locale est conservée ici et peut être restaurée.</p>${S.conflicts.slice(0, 20).map((c, i) => h`<div class="item"><div class="grow small"><b>${c.key.split('/')[0]}</b> · ${fmtDateTime(c.at)}<div class="tiny muted">${JSON.stringify(c.local?.d || {}).slice(0, 120)}</div></div><button class="btn sm" data-act="conflictRestore" data-i="${i}">Restaurer ma version</button></div>`)}</div>` : ''}`;
}
ACT.syncNow = () => { toast('Synchronisation…'); syncAll(); };
ACT.failRetry = (el) => { retryFailed(el.dataset.id); toast('Action remise dans la file'); render(); };
ACT.failDrop = async (el) => { if (await ask('Abandonner définitivement cette action ?', { ok: 'Abandonner', danger: true, detail: 'Elle ne sera jamais envoyée au serveur.' })) { discardFailed(el.dataset.id); render(); } };
ACT.conflictRestore = (el) => { restoreConflict(Number(el.dataset.i)); toast('Ta version sera renvoyée au serveur'); render(); };
ACT.diag = async () => {
  try { const r = await api('GET', '/api/health'), me = await api('GET', '/api/auth/me'); openSheet(h`<h2 style="margin:0">Diagnostic</h2><p>✅ Serveur joignable (version ${r.version})</p><p>✅ Connecté : <b>${me.user.username}</b>${me.user.isAdmin ? ' (administrateur)' : ''}</p><p>${r.db ? '✅' : '❌'} Base de données</p><p>${r.adminConfigured ? '✅ Administration configurée' : 'ℹ️ Administration non configurée (secret EDIT_PASSWORD absent)'}</p><p class="small muted">Application ${APP_VERSION} · ${S.seances.items.length} séances · ${S.history.length} séances réalisées · ${S.items.size} données de profil</p><button class="btn" data-act="closeSheet">Fermer</button>`); }
  catch (e) { openSheet(h`<h2 style="margin:0">Diagnostic</h2><p class="err">${e.offline ? 'Serveur injoignable (hors ligne ?). Tes modifications restent enregistrées sur cet appareil.' : e.message}</p><button class="btn" data-act="closeSheet">Fermer</button>`); }
};
ACT.hardReload = async () => { if (!(await ask('Recharger l’application ?', { detail: 'Tes données sont conservées. Le cache des fichiers est vidé pour récupérer la dernière version.' }))) return; await persistNow(); try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* rien */ } location.reload(); };

/* ═════════ Administration ═════════ */
async function loadBugs() { try { S.admin.bugs = (await api('GET', '/api/admin/bugs')).reports; } catch (e) { S.admin.error = e.offline ? 'Connexion requise.' : e.message; } render(); }
function vAdmin() {
  if (!S.user.isAdmin) return h`<form data-submit="adminOn" class="card" autocomplete="off"><h3>🛡️ Administration</h3><p class="small muted">Saisis le mot de passe administrateur pour activer les droits d’administration sur ton compte. Il est vérifié uniquement par le serveur et n’est jamais conservé sur cet appareil.</p>
    <label>Mot de passe administrateur<input type="password" name="password" autocomplete="off" required></label><button class="btn pri" type="submit">Activer</button></form>`;
  const bugs = S.admin.bugs, f = S.admin.filter || 'open';
  if (!bugs && !S.admin.error) setTimeout(loadBugs, 0);
  return h`<div class="card acc-b"><h3>🛡️ Tu es administrateur</h3><p class="small">Tu peux modifier ou supprimer toute contribution de la bibliothèque commune (Bibliothèque › Commune) et les exercices communs, et consulter les signalements. Tu n’as pas accès aux données privées des autres comptes.</p>
      <div class="row wrapf"><button class="btn" data-act="libSub" data-id="common">📚 Bibliothèque commune</button><button class="btn" data-act="adminOff">Quitter le rôle administrateur</button></div></div>
    <div class="card"><div class="row between"><h3>🐞 Signalements</h3><button class="btn sm" data-act="bugsReload">↻</button></div><div class="chips">${[['open', 'Ouverts'], ['done', 'Traités'], ['all', 'Tous']].map(([k, l]) => chip(f === k, l, `data-act="bugFilter" data-id="${k}"`))}</div>
      ${S.admin.error ? h`<p class="err small">${S.admin.error}</p>` : !bugs ? skeleton(2) : bugs.filter((b) => f === 'all' || b.status === f).length ? bugs.filter((b) => f === 'all' || b.status === f).map((b) => h`<div class="card flat"><div class="row between"><b>${b.title}</b>${tag(b.status === 'done' ? 'traité' : 'ouvert', b.status === 'done' ? 'ok' : 'warn')}</div><p class="small pre">${b.description}</p><p class="tiny muted">par ${b.author} · ${fmtDateTime(b.createdAt)}${b.page ? ' · page : ' + b.page : ''}${b.appVersion ? ' · v' + b.appVersion : ''}${b.userAgent ? ' · ' + b.userAgent.slice(0, 80) : ''}</p><button class="btn sm" data-act="bugStatus" data-id="${b.id}" data-v="${b.status === 'done' ? 'open' : 'done'}">${b.status === 'done' ? 'Rouvrir' : 'Marquer traité'}</button></div>`) : h`<p class="muted small">Aucun signalement.</p>`}</div>`;
}
SUBMIT.adminOn = async (f) => {
  const pw = new FormData(f).get('password'); f.reset(); // la valeur saisie est effacée du formulaire immédiatement
  try { await api('POST', '/api/admin/activate', { password: pw }); const me = await api('GET', '/api/auth/me'); S.user = me.user; ls.set('sea:user', { id: me.user.id, username: me.user.username, isAdmin: me.user.isAdmin }); buzzOk(); toast('Droits administrateur activés'); loadBugs(); render(); }
  catch (e) { toast(e.offline ? 'Connexion requise.' : e.message, 4000, 'bad'); }
};
ACT.adminOff = async () => { if (!(await ask('Quitter le rôle administrateur ?', { detail: 'Il faudra de nouveau le mot de passe administrateur pour le réactiver.' }))) return; try { await api('POST', '/api/admin/deactivate', {}); S.user = { ...S.user, isAdmin: false }; ls.set('sea:user', { id: S.user.id, username: S.user.username, isAdmin: false }); render(); } catch (e) { toast(e.message); } };
ACT.bugsReload = () => { S.admin.bugs = null; S.admin.error = ''; loadBugs(); };
ACT.bugFilter = (el) => { S.admin.filter = el.dataset.id; render(); };
ACT.bugStatus = async (el) => { try { await api('POST', `/api/admin/bugs/${encodeURIComponent(el.dataset.id)}`, { status: el.dataset.v }); const b = S.admin.bugs.find((x) => x.id === el.dataset.id); if (b) b.status = el.dataset.v; render(); } catch (e) { toast(e.message); } };

/* ═════════ Signaler un bug ═════════ */
async function loadMyBugs() { try { S.myBugs = (await api('GET', '/api/bugs/mine')).reports; } catch { /* hors ligne : liste indisponible */ } render(); }
function vBug() {
  const pages = [['', '—'], ['accueil', 'Accueil'], ['progres', 'Progrès'], ['bibliotheque', 'Bibliothèque'], ['generateur', 'Générateur'], ['seance', 'Mode séance'], ['profil', 'Profil'], ['parametres', 'Paramètres'], ['synchronisation', 'Synchronisation / hors ligne']];
  return h`<form data-submit="bugSend" class="card"><h3>🐞 Signaler un bug</h3>
      <label>Titre court<input name="title" required minlength="3" maxlength="120" placeholder="Ex. Le chrono ne s’arrête pas"></label>
      <label>Description détaillée<textarea name="description" required minlength="5" maxlength="5000" placeholder="Ce que tu faisais, ce qui s’est passé, ce que tu attendais…"></textarea></label>
      <label>Page concernée<select name="page">${pages.map(([k, l]) => h`<option value="${k}">${l}</option>`)}</select></label>
      <label class="chk"><input type="checkbox" name="device" checked> Joindre les informations techniques de l’appareil (navigateur, version de l’application)</label>
      <p class="tiny muted">Ne mets jamais de mot de passe dans un signalement. Envoyé hors ligne, il part dès le retour de la connexion.</p>
      <button class="btn pri" type="submit">Envoyer</button></form>
    <div class="card"><h3>Mes signalements</h3>${S.myBugs ? (S.myBugs.length ? S.myBugs.map((b) => h`<div class="item"><div class="grow"><b>${b.title}</b><div class="tiny muted">${fmtDateTime(b.createdAt)}</div></div>${tag(b.status === 'done' ? 'traité' : 'reçu', b.status === 'done' ? 'ok' : '')}</div>`) : h`<p class="muted small">Aucun signalement envoyé.</p>`) : h`<p class="muted small">Liste disponible en ligne.</p>`}</div>`;
}
SUBMIT.bugSend = (f) => {
  const d = Object.fromEntries(new FormData(f));
  queue('POST', '/api/bugs', { id: uid(), title: d.title, description: d.description, page: d.page, appVersion: d.device ? APP_VERSION : '', userAgent: d.device ? navigator.userAgent.slice(0, 300) : '' });
  f.reset(); buzzOk(); toast('Signalement enregistré : il est envoyé aux administrateurs. Merci !'); setTimeout(loadMyBugs, 2500);
};
