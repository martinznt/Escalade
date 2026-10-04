// views-studio.js — Studio d'administration : les changements pour tout le monde passent par des lots
// (brouillon → vérifications → publication confirmée → retour arrière possible), avec versions, différences
// avant/après et journal. Laboratoire : analyser un problème (assistant) et voir les règles actuelles sur des exemples.
// Rien n'est exécuté : l'assistant ne rédige que des brouillons validés par le serveur, publiés seulement sur confirmation.
import { h, toast, openSheet, closeSheet, ask, askText, chip, tag, fmtDateTime, relDate, skeleton, menuList } from './ui.js';
import { S, ACT, SUBMIT, INPUT, CHG, go, render, api } from './state.js';
import { uid } from './shared.js';
import { loadGlobal } from './content.js';
import { analyzeSession, REASON, phaseName } from './phaseplan.js';
import { normalizePhases, activityLabel, ROLES } from './phase.js';

const ST = () => (S.studio ||= { sets: null, err: '', filter: 'draft', cur: null, audit: null, lab: { text: '', res: null, busy: false, ex: 0 } });
export const STATUS = { draft: ['📝', 'Brouillon', 'warn'], published: ['✅', 'Publié', 'ok'], rolled_back: ['↩️', 'Annulé', ''], discarded: ['🗑', 'Abandonné', ''] };
export const SOURCE = { admin: 'Administrateur', direct: 'Modification directe', proposal: 'Proposition acceptée', ai: '🤖 Assistant', lab: '🧠 Laboratoire' };
const KIND = { exercise: '💪 Exercice', catalog: '🗂 Séance prête', intent: '🧭 Intention', format: '🧩 Format', grading: '🧗 Cotation', style: '🎨 Style', text: '✏️ Texte', announce: '📣 Annonce', hint: '💡 Raccourci', layout: '🧩 Mise en page', faq: '❓ Question', source: '📚 Source' };
const OP = { put: 'Créer / remplacer', hide: 'Masquer pour tous', delete: 'Revenir à l’origine' };
const ACTION = { draft_create: 'Brouillon créé', draft_edit: 'Brouillon modifié', publish: 'Lot publié', publish_item: 'Élément publié', publish_refused: 'Publication refusée (vérifications)', discard: 'Brouillon abandonné', rollback: 'Retour arrière', rollback_item: 'Élément rétabli', role: 'Rôle modifié', bug_status: 'Statut d’un signalement', proposal_accept: 'Proposition acceptée', proposal_refuse: 'Proposition refusée', intent_create: 'Intention ajoutée', intent_delete: 'Intention retirée' };
/** Formulaires sans code pour les types simples (les autres se modifient à leur place dans l'app, via « ✏️ Modifier »). */
const FORMS = {
  faq: [['q', 'Question', 200], ['a', 'Réponse', 1500, true]],
  announce: [['title', 'Titre', 100], ['body', 'Message', 1200, true]],
  text: [['from', 'Texte actuel (exact)', 300], ['to', 'Nouveau texte', 300]],
  style: [['label', 'Nom du style', 40], ['activity', 'Activité (ex. climbing_boulder)', 40]],
};
const val = (v) => (v == null ? '—' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 240);

async function loadSets() {
  const st = ST();
  try { st.sets = (await api('GET', '/api/admin/studio' + (st.filter === 'all' ? '' : '?status=' + st.filter))).sets; st.err = ''; }
  catch (e) { st.err = e.offline ? 'Connexion requise.' : e.message; }
  render();
}
async function loadSet(id) {
  try { ST().cur = await api('GET', '/api/admin/studio/' + encodeURIComponent(id)); } catch (e) { ST().cur = { error: e.offline ? 'Connexion requise.' : e.message, set: { id } }; }
  render();
}
const notAdmin = () => h`<div class="card"><p class="small">Réservé aux administrateurs.</p><button class="btn" data-act="setSub" data-id="admin">🛡️ Administration</button></div>`;

/** Liste des lots. */
export function vStudio() {
  if (!S.user?.isAdmin) return notAdmin();
  const st = ST(); if (!st.sets && !st.err) setTimeout(loadSets, 0);
  const list = (st.sets || []).filter((c) => !st.query || `${c.title} ${c.author || ''} ${SOURCE[c.source] || ''}`.toLocaleLowerCase().includes(st.query.toLocaleLowerCase()));
  return h`<div class="card acc-b"><h3>🧪 Studio</h3><p class="small">Chaque changement pour tout le monde devient un lot : <b>brouillon</b> (invisible pour les membres) → <b>vérifications</b> → <b>publication</b> avec ta confirmation → <b>retour arrière</b> possible. Tout est versionné et noté dans le journal.</p>
      ${menuList([
        ['studioNew', '', '＋', 'Nouveau brouillon', 'Question fréquente, annonce, texte de l’app ou style'],
        ['studioAi', '', '🤖', 'Brouillon avec l’assistant', 'Décris ce que tu veux ; tu relis avant toute publication'],
        ['setSub', 'lab', '🧠', 'Laboratoire', 'Analyser un problème, voir les règles sur des exemples'],
        ['setSub', 'audit', '📜', 'Journal des changements', 'Qui a fait quoi, quand, avant / après'],
        ...(canRole('intelligence') ? [['setSub', 'health', '🩺', 'Santé des données', 'Doublons, relations incohérentes, anciennes structures']] : []),
        ...(canRole('technical') ? [['setSub', 'maint', '🛠️', 'Maintenance', 'Signalements regroupés et pistes de l’assistant'], ['setSub', 'code', '💻', 'Propositions de code', 'Diff, impact, validation — jamais de déploiement automatique']] : []),
      ])}<p class="tiny muted">Tes rôles : ${(S.user.roles || ['super']).map((r) => ROLE_L[r]).join(', ')}.</p></div>
    <div class="card"><div class="row between"><h3>Lots</h3><button class="btn sm" data-act="studioReload" aria-label="Actualiser">↻</button></div>
      <form data-submit="studioFind" class="row"><label class="grow">Rechercher un lot<input name="query" maxlength="120" value="${st.query || ''}" placeholder="Titre, auteur ou origine"></label><button class="btn" type="submit">Rechercher</button></form>
      <div class="chips">${[['draft', 'Brouillons'], ['published', 'Publiés'], ['rolled_back', 'Annulés'], ['all', 'Tous']].map(([k, l]) => chip(st.filter === k, l, `data-act="studioFilter" data-id="${k}"`))}</div>
      ${st.err ? h`<p class="err small">${st.err}</p>` : !st.sets ? skeleton(2) : list.length ? h`<div class="setmenu">${list.map((c) => h`<button class="setrow" data-act="studioOpen" data-id="${c.id}"><span class="sic">${STATUS[c.status]?.[0] || '•'}</span><span class="grow"><b>${c.title}</b><small>${STATUS[c.status]?.[1]} · ${SOURCE[c.source] || c.source} · ${c.count} modification(s) · ${c.author || '—'} · ${relDate(c.updatedAt)}${c.lastCheck === true ? ' · ✓ vérifié' : c.lastCheck === false ? ' · ✗ vérifications à revoir' : ''}</small></span><span class="chev">›</span></button>`)}</div>` : h`<p class="small muted">Aucun lot ici.</p>`}</div>`;
}
ACT.studioReload = () => { ST().sets = null; ST().err = ''; loadSets(); };
ACT.studioFilter = (el) => { ST().filter = el.dataset.id; ACT.studioReload(); };
ACT.studioOpen = (el) => { ST().cur = null; go('settings', 'studioSet', el.dataset.id); loadSet(el.dataset.id); };

/** Détail d'un lot : différences avant → après, vérifications, actions. */
export function vStudioSet() {
  if (!S.user?.isAdmin) return notAdmin();
  const st = ST(), d = st.cur;
  if (!d || d.set?.id !== S.param) { if (S.param && (!d || d.set?.id !== S.param)) setTimeout(() => loadSet(S.param), 0); return skeleton(2); }
  if (d.error) return h`<div class="card"><p class="err">${d.error}</p></div>`;
  const c = d.set, last = d.tests[0];
  return h`<div class="card"><h2 style="margin:0">${c.title}</h2><div class="row wrapf tight">${tag(STATUS[c.status][1], STATUS[c.status][2])}${tag(SOURCE[c.source] || c.source)}</div>
      <p class="tiny muted">Créé par ${c.author || '—'} · ${fmtDateTime(c.createdAt)}${c.publishedAt ? ` · publié par ${c.publisher || '—'} le ${fmtDateTime(c.publishedAt)}` : ''}${c.rolledBackAt ? ` · annulé par ${c.roller || '—'} le ${fmtDateTime(c.rolledBackAt)}` : ''}</p>
      ${c.note ? h`<p class="small">${c.note}</p>` : ''}</div>
    ${d.diff.map((x, i) => h`<div class="card"><div class="row between"><b>${KIND[x.kind] || x.kind} · ${x.id}</b>${tag(x.isNew ? 'nouveau' : OP[x.op], x.isNew ? 'acc' : '')}</div>
      ${x.changes.length ? h`<ul class="diff">${x.changes.map((ch) => h`<li><b>${ch.path}</b> : ${ch.type === 'added' ? h`<ins>${val(ch.after)}</ins>` : ch.type === 'removed' ? h`<del>${val(ch.before)}</del>` : h`<del>${val(ch.before)}</del> → <ins>${val(ch.after)}</ins>`}</li>`)}</ul>` : h`<p class="small muted">Aucune différence avec le contenu actuel.</p>`}
      <div class="row wrapf">${c.status === 'draft' && FORMS[x.kind] && d.items[i]?.op === 'put' ? h`<button class="btn sm" data-act="studioEdit" data-i="${i}">✏️ Modifier</button>` : ''}<button class="btn sm ghost" data-act="studioVersions" data-k="${x.kind}" data-id="${x.id}">🕑 Versions</button></div></div>`)}
    <div class="card"><h3>✅ Vérifications</h3>${last ? h`<ul class="checks">${last.checks.map((k) => h`<li>${k.ok ? '✓' : '✗'} ${k.label}${k.detail ? h` <span class="tiny muted">— ${k.detail}</span>` : ''}</li>`)}</ul><p class="tiny muted">${last.ok ? 'Toutes passées' : 'À corriger avant publication'} · ${fmtDateTime(last.at)} · ${last.by || '—'}</p>` : h`<p class="small muted">Pas encore vérifié.</p>`}
      ${c.status === 'draft' ? h`<div class="row wrapf"><button class="btn" data-act="studioCheck">Vérifier</button><button class="btn pri" data-act="studioPublish">🚀 Publier pour tout le monde</button><button class="btn ghost danger" data-act="studioDiscard">Abandonner</button></div>` : ''}
      ${c.status === 'published' ? h`<button class="btn" data-act="studioRollback">↩️ Retour arrière</button><p class="tiny muted">Rétablit l’état d’avant la publication, élément par élément.</p>` : ''}</div>`;
}
const curId = () => ST().cur?.set?.id;
async function studioPost(action, body = {}) { return api('POST', `/api/admin/studio/${encodeURIComponent(curId())}/${action}`, body); }
ACT.studioCheck = async () => { try { const r = await studioPost('check'); toast(r.passed ? 'Vérifications passées ✓' : 'Des vérifications échouent', 3000, r.passed ? '' : 'bad'); } catch (e) { toast(e.message, 4000, 'bad'); } loadSet(curId()); };
ACT.studioPublish = async () => {
  if (!(await ask('Publier ce lot pour tout le monde ?', { ok: 'Publier', detail: 'Les vérifications sont refaites avant. Tu pourras revenir en arrière.' }))) return;
  try { await studioPost('publish', { confirm: true }); toast('Publié pour tout le monde'); loadGlobal(); } catch (e) { toast(e.message, 5000, 'bad'); }
  ST().sets = null; loadSet(curId());
};
ACT.studioDiscard = async () => { if (!(await ask('Abandonner ce brouillon ?', { ok: 'Abandonner', danger: true }))) return; try { await studioPost('discard'); toast('Brouillon abandonné'); } catch (e) { toast(e.message, 4000, 'bad'); } ST().sets = null; loadSet(curId()); };
ACT.studioRollback = async () => {
  if (!(await ask('Revenir à l’état d’avant ce lot ?', { ok: 'Retour arrière', danger: true, detail: 'Chaque élément reprend sa valeur d’avant la publication, pour tout le monde.' }))) return;
  try { await studioPost('rollback', { confirm: true }); toast('Retour arrière fait'); loadGlobal(); }
  catch (e) {
    if (e.status === 409 && e.data?.conflicts?.length && await ask('Modifié depuis la publication', { ok: 'Forcer le retour arrière', danger: true, detail: `${e.data.conflicts.join(', ')} a changé depuis. Forcer écrase ces changements plus récents (ils restent dans les versions et le journal).` })) {
      try { await studioPost('rollback', { confirm: true, force: true }); toast('Retour arrière forcé'); loadGlobal(); } catch (e2) { toast(e2.message, 4000, 'bad'); }
    } else if (e.status !== 409) toast(e.message, 4000, 'bad');
  }
  ST().sets = null; loadSet(curId());
};
ACT.studioVersions = async (el) => {
  try {
    const { versions } = await api('GET', `/api/admin/versions/${el.dataset.k}/${encodeURIComponent(el.dataset.id)}`);
    openSheet(h`<h2 style="margin:0">🕑 Versions · ${el.dataset.id}</h2>${versions.length ? versions.map((v, k) => h`<details class="how mini"><summary>v${v.version} · ${fmtDateTime(v.at)} · ${v.by || '—'} ${v.hidden ? '(masqué)' : v.data == null ? '(origine)' : ''}</summary><pre class="txt">${v.data ? JSON.stringify(v.data, null, 1) : '—'}</pre>
      <div class="row wrapf">${versions[k + 1] ? h`<button class="btn sm" data-act="verDiff" data-k="${el.dataset.k}" data-id="${el.dataset.id}" data-a="${versions[k + 1].version}" data-b="${v.version}">Comparer avec v${versions[k + 1].version}</button>` : ''}${k ? h`<button class="btn sm" data-act="verRestore" data-k="${el.dataset.k}" data-id="${el.dataset.id}" data-v="${v.version}">↩️ Restaurer (brouillon)</button>` : ''}</div></details>`) : h`<p class="small muted">Pas encore de version publiée.</p>`}<button class="btn" data-act="closeSheet">Fermer</button>`, { wide: true });
  } catch (e) { toast(e.message, 4000, 'bad'); }
};

/* Brouillons sans code : formulaire par type simple. */
function draftForm({ kind = 'faq', data = {}, i = -1, title = '' } = {}) {
  openSheet(h`<form data-submit="studioDraftGo" class="stack"><h2 style="margin:0">${i >= 0 ? '✏️ Modifier le brouillon' : '＋ Nouveau brouillon'}</h2>
    <input type="hidden" name="i" value="${i}">
    ${i >= 0 ? h`<input type="hidden" name="kind" value="${kind}"><p class="small">${KIND[kind]}</p>` : h`<label>Type<select name="kind" data-change="studioKind">${Object.keys(FORMS).map((k) => h`<option value="${k}" ${k === kind ? 'selected' : ''}>${KIND[k]}</option>`)}</select></label>`}
    ${i < 0 ? h`<label>Titre du lot<input name="title" maxlength="120" value="${title}" placeholder="Ex. Aide sur le minuteur"></label>` : ''}
    ${FORMS[kind].map(([k, l, n, area]) => (area ? h`<label>${l}<textarea name="${k}" rows="4" maxlength="${n}" required>${data[k] || ''}</textarea></label>` : h`<label>${l}<input name="${k}" maxlength="${n}" required value="${data[k] || ''}"></label>`))}
    <p class="tiny muted">Enregistré comme brouillon : personne ne le voit avant ta publication.</p>
    <button class="btn pri big">Enregistrer le brouillon</button></form>`);
}
ACT.studioNew = () => draftForm();
ACT.studioEdit = (el) => { const i = Number(el.dataset.i), it = ST().cur.items[i]; draftForm({ kind: it.kind, data: it.data || {}, i }); };
CHG.studioKind = (el) => { const f = el.form; draftForm({ kind: el.value, title: f.title?.value || '' }); };
SUBMIT.studioDraftGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), kind = d.kind, i = Number(d.i);
  const data = Object.fromEntries(FORMS[kind].map(([k]) => [k, d[k]]));
  try {
    if (i >= 0) {
      const items = ST().cur.items.map((it, k) => (k === i ? { ...it, data } : it));
      await api('PUT', '/api/admin/studio/' + encodeURIComponent(curId()), { items }); closeSheet(); toast('Brouillon modifié'); loadSet(curId());
    } else {
      const r = await api('POST', '/api/admin/studio', { title: d.title || KIND[kind], items: [{ kind, id: 'g-' + uid().slice(0, 12), op: 'put', data }] });
      closeSheet(); toast('Brouillon créé'); ST().sets = null; go('settings', 'studioSet', r.id); loadSet(r.id);
    }
  } catch (e) { toast(e.message, 5000, 'bad'); }
};
ACT.studioAi = () => openSheet(h`<form data-submit="studioAiGo" class="stack"><h2 style="margin:0">🤖 Brouillon avec l’assistant</h2>
  <label>Type<select name="kind">${['faq', 'announce', 'text', 'style', 'intent', 'exercise'].map((k) => h`<option value="${k}">${KIND[k]}</option>`)}</select></label>
  <label>Ce que tu veux<textarea name="text" rows="4" maxlength="1500" required placeholder="Ex. une question fréquente qui explique comment mettre la séance en pause"></textarea></label>
  <p class="tiny muted">L’assistant rédige un brouillon ; le serveur le vérifie champ par champ. Rien n’est publié sans toi.</p>
  <button class="btn pri big">Rédiger le brouillon</button></form>`);
SUBMIT.studioAiGo = async (f) => {
  const d = Object.fromEntries(new FormData(f)), btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'L’assistant rédige…';
  try { const r = await api('POST', '/api/admin/studio/ai', { kind: d.kind, text: d.text }, { timeout: 45000 }); closeSheet(); toast('Brouillon rédigé : relis-le'); ST().sets = null; go('settings', 'studioSet', r.id); loadSet(r.id); }
  catch (e) { toast(e.message, 5000, 'bad'); btn.disabled = false; btn.textContent = 'Rédiger le brouillon'; }
};

/* Journal. */
async function loadAudit() { try { ST().audit = (await api('GET', '/api/admin/audit?limit=200')).events; } catch (e) { ST().audit = { error: e.offline ? 'Connexion requise.' : e.message }; } render(); }
export function vAudit() {
  if (!S.user?.isAdmin) return notAdmin();
  const a = ST().audit; if (!a) setTimeout(loadAudit, 0);
  return h`<div class="card"><div class="row between"><h3>📜 Journal des changements</h3><button class="btn sm" data-act="auditReload" aria-label="Actualiser">↻</button></div><p class="tiny muted">Actions d’administration uniquement : contenu commun, rôles, signalements, propositions. Aucune donnée d’entraînement ni aucun secret n’y figure.</p>
    ${!a ? skeleton(3) : a.error ? h`<p class="err small">${a.error}</p>` : a.length ? a.map((e) => h`<details class="how mini"><summary><b>${ACTION[e.action] || e.action}</b> · ${e.type ? (KIND[e.type] || e.type) + ' ' : ''}${e.target} <span class="tiny muted">· ${e.actor || '—'} · ${fmtDateTime(e.at)}</span></summary>
      ${e.before !== undefined ? h`<p class="tiny"><b>Avant</b></p><pre class="txt">${JSON.stringify(e.before, null, 1)}</pre>` : ''}${e.after !== undefined ? h`<p class="tiny"><b>Après</b></p><pre class="txt">${JSON.stringify(e.after, null, 1)}</pre>` : ''}
      ${e.checks ? h`<ul class="checks">${e.checks.map((k) => h`<li>${k.ok ? '✓' : '✗'} ${k.label}</li>`)}</ul>` : ''}${e.changeSet ? h`<button class="btn sm ghost" data-act="studioOpen" data-id="${e.changeSet}">Voir le lot</button>` : ''}</details>`) : h`<p class="small muted">Journal vide.</p>`}</div>`;
}
ACT.auditReload = () => { ST().audit = null; loadAudit(); };

/* Laboratoire. */
export const EXAMPLES = [
  ['Bloc → pause → voie (perf)', [{ type: 'warmup', minutes: 15 }, { type: 'climb', kind: 'bloc', minutes: 120, intensity: 'hard', role: 'prep' }, { type: 'pause', minutes: 30 }, { type: 'climb', kind: 'voie', minutes: 120, intensity: 'max', role: 'perf' }]],
  ['Force sans échauffement', [{ type: 'main', minutes: 40, intensity: 'hard', role: 'force' }, { type: 'main', minutes: 10, intensity: 'max', role: 'puissance' }]],
  ['Courte et douce', [{ type: 'warmup', minutes: 10 }, { type: 'main', minutes: 20, intensity: 'easy', role: 'technique' }, { type: 'cool', minutes: 5 }]],
];
export function vLab() {
  if (!S.user?.isAdmin) return notAdmin();
  const L = ST().lab, ex = EXAMPLES[L.ex] || EXAMPLES[0], phases = normalizePhases(ex[1]), sug = analyzeSession(phases, {}, {});
  const r = L.res;
  return h`<div class="card"><h3>🧠 Analyser un problème ou une idée</h3>
      <label>Décris-le<textarea rows="4" maxlength="2000" data-input="labText" placeholder="Ex. les débutants ne trouvent pas le minuteur ; les séances longues finissent trop fort…">${L.text}</textarea></label>
      <button class="btn pri" data-act="labGo" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Analyse…' : 'Analyser avec l’assistant'}</button>
      <p class="tiny muted">L’assistant reformule, relève les règles en jeu et propose des solutions avec avantages et inconvénients. Il ne change rien : une solution devient au mieux un brouillon.</p>
      ${r ? h`<p><b>Reformulation</b> : ${r.reformulation || '—'}</p>${r.rules.length ? h`<p class="small"><b>Règles en jeu</b></p><ul>${r.rules.map((x) => h`<li class="small">${x}</li>`)}</ul>` : ''}${r.questions.length ? h`<p class="small"><b>À préciser</b></p><ul>${r.questions.map((x) => h`<li class="small">${x}</li>`)}</ul>` : ''}
        ${r.solutions.map((s, i) => h`<div class="card flat"><div class="row between"><b>${s.title}</b>${tag('risque ' + s.risk, s.risk === 'élevé' ? 'warn' : s.risk === 'faible' ? 'ok' : '')}</div>${s.how ? h`<p class="small">${s.how}</p>` : ''}
          ${s.pros.length ? h`<p class="tiny"><b>Pour</b> : ${s.pros.join(' · ')}</p>` : ''}${s.cons.length ? h`<p class="tiny"><b>Contre</b> : ${s.cons.join(' · ')}</p>` : ''}
          ${s.change ? h`<button class="btn sm" data-act="labDraft" data-i="${i}">📝 Créer un brouillon (${KIND[s.change.kind]})</button>` : h`<p class="tiny muted">Demande un changement du code de l’app : à faire par une mise à jour, pas depuis le Studio.</p>`}</div>`)}` : ''}</div>
    <div class="card"><h3>🔬 Règles actuelles sur des exemples</h3><p class="tiny muted">Simulation : l’analyse de séance de l’app, appliquée telle quelle à des séances d’exemple. Rien n’est enregistré.</p>
      <div class="chips">${EXAMPLES.map(([l], i) => chip(L.ex === i, l, `data-act="labEx" data-i="${i}"`))}</div>
      <p class="small">${phases.map((p) => `${phaseName(p)} (${activityLabel(p.activity) === '—' ? ROLES[p.role][1] : activityLabel(p.activity)}, ${p.minutes} min)`).join(' → ')}</p>
      ${sug.length ? sug.map((s) => h`<details class="how mini"><summary>${s.title}</summary><p class="small">${s.text}</p><ul>${s.why.map((w) => h`<li class="tiny">${REASON[w.cat]?.[0] || ''} ${REASON[w.cat]?.[1] || ''} : ${w.text}</li>`)}</ul></details>`) : h`<p class="small muted">Aucune règle ne se déclenche sur cet exemple.</p>`}</div>`;
}
INPUT.labText = (el) => { ST().lab.text = el.value.slice(0, 2000); };
ACT.labEx = (el) => { ST().lab.ex = Number(el.dataset.i); render(); };
ACT.labGo = async () => {
  const L = ST().lab; if (L.text.trim().length < 10) { toast('Décris le problème en une ou deux phrases.'); return; }
  L.busy = true; render();
  try { L.res = (await api('POST', '/api/admin/lab', { text: L.text }, { timeout: 45000 })).lab; } catch (e) { toast(e.message, 5000, 'bad'); }
  L.busy = false; render();
};
ACT.labDraft = async (el) => {
  const s = ST().lab.res?.solutions?.[Number(el.dataset.i)]; if (!s?.change) return;
  try { const r = await api('POST', '/api/admin/studio', { title: 'Lab : ' + s.title, note: 'Issu du Laboratoire : ' + (ST().lab.res.reformulation || ''), source: 'lab', items: [{ kind: s.change.kind, id: 'g-' + uid().slice(0, 12), op: 'put', data: s.change.data }] }); toast('Brouillon créé : relis-le'); ST().sets = null; go('settings', 'studioSet', r.id); loadSet(r.id); }
  catch (e) { toast(e.message, 5000, 'bad'); }
};

/* ═════════ V2 : santé des données, maintenance (IA), propositions de code, rôles ═════════ */
export const canRole = (r) => !!S.user?.isAdmin && (S.user.roles || ['super']).some((x) => x === 'super' || x === r);
const roleNeeded = (r) => h`<div class="card"><p class="small">Rôle « ${ROLE_L[r]} » nécessaire (vérifié par le serveur).</p></div>`;
export const ROLE_L = { content: 'Contenu', intelligence: 'Intelligence', users: 'Utilisateurs', technical: 'Technique', super: 'Super-administrateur' };
const SEV_L = { high: ['🔴', 'Important'], mid: ['🟠', 'Moyen'], low: ['🟡', 'Mineur'] };
const TYPE_L = { 'no-caps': 'Exercices sans capacités', 'bad-relation': 'Relations contradictoires', 'no-metric': 'Capacités sans métrique', 'hard-goal': 'Objectifs difficiles à évaluer', duplicate: 'Doublons', orphan: 'Données orphelines', 'old-structure': 'Anciennes structures' };
export function vHealth() {
  if (!canRole('intelligence')) return roleNeeded('intelligence');
  const st = ST(); if (!st.health) { st.health = { loading: true }; api('GET', '/api/admin/health').then((r) => { st.health = r; render(); }).catch((e) => { st.health = { error: e.message }; render(); }); }
  const r = st.health;
  if (r.loading) return skeleton(3);
  if (r.error) return h`<div class="card"><p class="err small">${r.error}</p></div>`;
  return h`<div class="card"><div class="row between"><h3>🩺 Santé des données</h3><button class="btn sm" data-act="healthReload" aria-label="Actualiser">↻</button></div>
      <p class="tiny muted">${r.checked.exercises} exercices, ${r.checked.capacities} capacités, ${r.checked.skills} objectifs-figures et ${r.checked.common} éléments communs vérifiés. Une correction devient un brouillon du Studio : rien n’est appliqué sans ta validation.</p>
      <div class="chips">${Object.entries(r.counts).map(([k, n]) => h`<span class="chip static">${TYPE_L[k] || k} : ${n}</span>`)}</div></div>
    ${r.issues.length ? r.issues.slice(0, 80).map((x, k) => h`<div class="card flat"><div class="row between wrapf"><span class="small">${SEV_L[x.severity][0]} <b>${TYPE_L[x.type] || x.type}</b></span><span class="tiny muted">${x.target}</span></div><p class="small">${x.text}</p>
      ${x.fix ? h`<button class="btn sm" data-act="healthFix" data-id="${k}">📝 Préparer la correction (brouillon)</button>` : ''}</div>`) : h`<div class="card"><p class="small">👍 Aucun problème détecté.</p></div>`}`;
}
ACT.healthReload = () => { ST().health = null; render(); };
ACT.healthFix = async (el) => {
  const x = ST().health?.issues?.[Number(el.dataset.id)]; if (!x?.fix) return;
  try { const r = await api('POST', '/api/admin/studio', { title: `Santé : ${TYPE_L[x.type] || x.type} — ${x.target}`, note: x.text, items: [x.fix] }); toast('Brouillon créé : vérifie puis publie.'); ST().sets = null; go('settings', 'studioSet', r.id); }
  catch (e) { toast(e.message, 5000, 'bad'); }
};
export function vMaint() {
  if (!canRole('technical')) return roleNeeded('technical');
  const m = ST().maint;
  return h`<div class="card stack"><h3>🛠️ Maintenance</h3><p class="small">L’app regroupe les signalements ouverts ; l’assistant (s’il est activé) propose des pistes. <b>Rien n’est appliqué</b> : chaque piste peut devenir un brouillon de contenu ou une proposition de code, validés par un administrateur.</p>
      <button class="btn pri" data-act="maintRun" ${m?.busy ? 'disabled' : ''}>${m?.busy ? 'Analyse…' : 'Analyser les signalements'}</button></div>
    ${m?.res ? h`<div class="card"><h3>${m.res.open} signalement(s) ouvert(s)</h3>${m.res.groups.map((g) => h`<div class="item"><div class="grow small">${g.text}</div></div>`)}</div>
      <div class="card"><h3>Pistes de l’assistant</h3>${m.res.findings.length ? m.res.findings.map((f) => h`<div class="card flat"><div class="row between wrapf"><b>${f.title}</b>${tag(f.severity, f.severity === 'élevé' ? 'warn' : '')}</div><p class="small">${f.detail}</p><p class="small">➜ ${f.proposal}</p><p class="tiny muted">Domaine : ${f.area}</p>
          ${f.area === 'code' ? h`<button class="btn sm" data-act="codeNew" data-t="${f.title}" data-s="${f.proposal}">💻 Préparer une proposition de code</button>` : ''}</div>`) : h`<p class="small muted">${m.res.ai === 'indisponible' ? 'Assistant non activé sur ce serveur : seul le regroupement est disponible.' : 'Aucune piste.'}</p>`}</div>` : ''}`;
}
ACT.maintRun = async () => { const st = ST(); st.maint = { busy: true }; render(); try { st.maint = { res: await api('POST', '/api/admin/maintenance', {}, { timeout: 45000 }) }; } catch (e) { st.maint = null; toast(e.message, 5000, 'bad'); } render(); };
export function vCode() {
  if (!canRole('technical')) return roleNeeded('technical');
  const st = ST(); if (!st.code) { st.code = { loading: true }; api('GET', '/api/admin/code').then((r) => { st.code = r; render(); }).catch((e) => { st.code = { error: e.message }; render(); }); }
  const c = st.code, SL = CODE_SL;
  return h`<div class="card stack"><h3>💻 Propositions de code</h3><p class="small">Proposition → diff → analyse d’impact → validation (par un autre administrateur, ou par toi seul si tu es le seul, en le confirmant) → <b>Pull Request sur GitHub</b>, où les tests du dépôt tournent → tu fusionnes toi-même sur GitHub. <b>L’app ne fusionne et ne déploie jamais de code.</b></p>
      <p class="tiny muted">Le plus simple : demande la modification à l’« Assistant du site » (💻 Proposer dans le code), il prépare des remplacements exacts vérifiés.</p>
      <button class="btn" data-act="codeNew">＋ Nouvelle proposition</button></div>
    ${c.loading ? skeleton(2) : c.error ? h`<p class="err small">${c.error}</p>` : c.items.length ? h`<div class="setmenu">${c.items.map((x) => h`<button class="setrow" data-act="codeOpen" data-id="${x.id}"><span class="sic">${SL[x.status]?.[0]}</span><span class="grow"><b>${x.title}</b><small>${SL[x.status]?.[1]} · ${x.author || '—'} · ${relDate(x.updated_at)} · ${(x.impact.files || []).length} fichier(s)${x.impact.flags?.length ? ' · ⚠️ ' + x.impact.flags.length : ''}</small></span><span class="chev">›</span></button>`)}</div>` : h`<p class="small muted">Aucune proposition.</p>`}`;
}
const CODE_SL = { draft: ['📝', 'À examiner'], approved: ['✅', 'Validée — prête pour GitHub'], rejected: ['✗', 'Refusée'], pr: ['🔀', 'Pull Request ouverte sur GitHub'] };
ACT.codeNew = (el) => openSheet(h`<form data-submit="codeGo" class="stack"><h2 style="margin:0">💻 Proposition de code</h2>
  <label>Titre<input name="title" maxlength="120" required value="${el?.dataset?.t || ''}"></label>
  <label>Résumé / pourquoi<textarea name="summary" rows="3" maxlength="2000">${el?.dataset?.s || ''}</textarea></label>
  <label>Diff (format unifié, « git diff »)<textarea name="diff" rows="8" required placeholder="--- a/public/…&#10;+++ b/public/…"></textarea></label>
  <label>Tests prévus / lancés<textarea name="tests" rows="2" maxlength="2000" placeholder="npm test, npm run test:e2e…"></textarea></label>
  <p class="tiny muted">L’analyse d’impact est faite par le serveur. Secrets et exécution dynamique (eval, new Function, shell) sont refusés.</p>
  <button class="btn pri big">Enregistrer la proposition</button></form>`, { wide: true });
SUBMIT.codeGo = async (f) => { const d = Object.fromEntries(new FormData(f)); try { const r = await api('POST', '/api/admin/code', d); closeSheet(); toast('Proposition enregistrée'); ST().code = null; go('settings', 'codeItem', r.id); } catch (e) { toast(e.message, 6000, 'bad'); } };
ACT.codeOpen = (el) => { ST().codeItem = null; go('settings', 'codeItem', el.dataset.id); };
export function vCodeItem() {
  if (!canRole('technical')) return roleNeeded('technical');
  const st = ST(), it = st.codeItem;
  if (!it || it.id !== S.param) { if (!st.codeLoading) { st.codeLoading = true; api('GET', '/api/admin/code/' + encodeURIComponent(S.param)).then((r) => { st.codeItem = r.item; st.codeLoading = false; render(); }).catch((e) => { st.codeLoading = false; toast(e.message); }); } return skeleton(2); }
  const im = it.impact || {};
  return h`<div class="card stack"><h2 style="margin:0">${it.title}</h2><p class="tiny muted">Par ${it.author || '—'} · ${fmtDateTime(it.createdAt)} · ${it.status === 'draft' ? 'à examiner' : it.status === 'rejected' ? `refusée par ${it.reviewer || '—'}` : `validée par ${it.reviewer || '—'}${it.status === 'pr' ? ' · Pull Request ouverte' : ''}`}</p>
      ${it.summary ? h`<p class="small">${it.summary}</p>` : ''}
      <b class="small">Analyse d’impact</b><ul class="clean tight small"><li>Fichiers : ${(im.files || []).join(', ') || '—'}</li><li>Domaines : ${(im.areas || []).join(', ') || '—'}</li><li>+${im.added || 0} / −${im.removed || 0} lignes${im.migration ? ' · migration D1' : ''}</li>${(im.flags || []).map((x) => h`<li class="warn-t">⚠️ ${x}</li>`)}</ul>
      ${it.tests ? h`<b class="small">Tests</b><p class="small">${it.tests}</p>` : ''}
      <details class="how mini"><summary>Voir le diff</summary><pre class="txt">${it.diff}</pre></details>
      ${it.note ? h`<p class="small">Note de validation : ${it.note}</p>` : ''}
      <div class="row wrapf"><a class="btn sm" href="/api/admin/code/${it.id}.patch" download>⬇ Télécharger le .patch</a>${it.status === 'draft' ? h`<button class="btn sm pri" data-act="codeReview" data-d="approve">✅ Valider</button><button class="btn sm ghost danger" data-act="codeReview" data-d="reject">Refuser</button>` : ''}</div>
      ${it.prUrl ? h`<div class="card flat ok-b stack"><b class="small">🔀 Pull Request ouverte sur GitHub</b><a class="btn sm pri" href="${it.prUrl}" target="_blank" rel="noopener">Voir la Pull Request ↗</a><p class="tiny muted">Brouillon : validation automatisée en attente. Vérifie la CI et l’aperçu, puis rends-la prête et fusionne-la sur GitHub quand tout est vert : le site sera alors redéployé par ton hébergement, pas par l’app.</p></div>`
        : it.status === 'approved' ? (it.exact ? (it.github ? h`<button class="btn pri" data-act="codePr">🔀 Créer la Pull Request sur GitHub</button><p class="tiny muted">Une branche « assistant/… » est créée avec ces remplacements, puis une Pull Request. Rien n’est fusionné ni déployé.</p>`
          : h`<p class="tiny warn-t">GitHub n’est pas relié : ajoute au Worker les secrets GITHUB_TOKEN (jeton avec les droits « contents » et « pull requests » sur ton dépôt) et GITHUB_REPO (propriétaire/dépôt), dans Cloudflare › ton Worker › Settings › Variables and Secrets. En attendant : télécharge le .patch.</p>`)
          : h`<p class="tiny muted">Proposition écrite à la main (diff) : applique le .patch toi-même (git), les tests tournent sur ta Pull Request.</p>`) : ''}
      <p class="tiny muted">Valider ne déploie rien. Seule la fusion sur GitHub change le site.</p></div>`;
}
ACT.codeReview = async (el) => {
  const approve = el.dataset.d === 'approve';
  if (!(await ask(approve ? 'Valider cette proposition ?' : 'Refuser cette proposition ?', { ok: approve ? 'Valider' : 'Refuser', danger: !approve, detail: approve ? 'Ensuite tu pourras ouvrir la Pull Request sur GitHub. L’app ne fusionne et ne déploie jamais de code.' : '' }))) return;
  const note = (await askText('Note (facultatif)', { ok: 'Envoyer', cancel: 'Sans note', max: 300 })) || '';
  const id = encodeURIComponent(ST().codeItem.id), done = () => { toast(approve ? 'Validée : prête pour GitHub' : 'Refusée'); ST().codeItem = null; ST().code = null; render(); };
  try { await api('POST', `/api/admin/code/${id}/review`, { decision: el.dataset.d, note }); done(); }
  catch (e) {
    // Seul administrateur : on peut valider seul, après une confirmation explicite (notée au journal).
    if (e.status === 409 && e.data?.soloPossible && (await ask('Tu es le seul administrateur : valider seul ?', { ok: 'Je valide seul', detail: 'D’habitude, un autre administrateur relit. Ce choix est noté au journal. La Pull Request GitHub reste à relire avant de fusionner.' }))) {
      try { await api('POST', `/api/admin/code/${id}/review`, { decision: el.dataset.d, note, solo: true }); done(); } catch (e2) { toast(e2.message, 5000, 'bad'); }
    } else toast(e.message, 5000, 'bad');
  }
};
ACT.codePr = async () => {
  const it = ST().codeItem; if (!it) return;
  if (!(await ask('Créer la Pull Request sur GitHub ?', { ok: 'Créer la Pull Request', detail: 'Une branche avec ces remplacements et une Pull Request seront créées sur ton dépôt. Rien n’est fusionné ni déployé : tu le fais toi-même sur GitHub.' }))) return;
  try { const r = await api('POST', `/api/admin/code/${encodeURIComponent(it.id)}/pr`, {}, { timeout: 45000 }); toast(r.already ? 'Pull Request déjà ouverte' : 'Pull Request créée ✓'); ST().codeItem = null; ST().code = null; render(); }
  catch (e) { toast(e.message, 7000, 'bad'); }
};
ACT.verDiff = async (el) => {
  try { const r = await api('GET', `/api/admin/versions/${el.dataset.k}/${encodeURIComponent(el.dataset.id)}/diff?a=${el.dataset.a}&b=${el.dataset.b}`);
    toast(r.changes.length ? `v${el.dataset.a} → v${el.dataset.b} : ${r.changes.map((c) => c.path).join(', ')}` : 'Identiques', 6000); } catch (e) { toast(e.message, 4000, 'bad'); }
};
ACT.verRestore = async (el) => {
  if (!(await ask(`Préparer un brouillon qui rétablit la version ${el.dataset.v} ?`, { ok: 'Préparer', detail: 'Rien n’est publié : tu vérifies puis tu publies depuis le Studio.' }))) return;
  try { const r = await api('POST', `/api/admin/versions/${el.dataset.k}/${encodeURIComponent(el.dataset.id)}/restore`, { version: Number(el.dataset.v) }); closeSheet(); ST().sets = null; go('settings', 'studioSet', r.id); } catch (e) { toast(e.message, 4000, 'bad'); }
};

SUBMIT.studioFind = (form) => { ST().query = String(new FormData(form).get('query') || '').trim().slice(0,120); render(); };
