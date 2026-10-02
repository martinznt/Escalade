// layout.js — mise en page personnalisable, page par page, liée au compte.
// Chaque fonction d'une page peut être : en grand (carte ou tuile), en petite icône en haut à droite, ou masquée ;
// l'ordre et une couleur par élément se choisissent en « mode édition » (icône ✏️). Rien n'est enregistré sans deux
// confirmations, et « Revenir à la mise en page de base » remet tout comme au départ (après confirmation aussi).
import { h, raw, openSheet, closeSheet, ask, toast } from './ui.js';
import { S, ACT, item, putItem, render, go } from './state.js';
import { globalLayout } from './global.js';
import { chooseScope, saveLayoutGlobal, isAdmin as isAdminUser } from './content.js';

/** Icônes possibles en haut à droite : [emoji, nom, action]. */
export const ICONS = {
  cal: ['📅', 'Planning (calendrier, programme, rappels)', 'topCal'], notif: ['🔔', 'Notifications', 'notifOpen'], timer: ['⏱', 'Minuteur', 'timerOpen'], carnet: ['🧗', 'Carnet', 'goCarnet'],
  coach: ['💬', 'Assistant', 'coachOpen'], all: ['☰', 'Menu : toutes les fonctions', 'allOpen'], recap: ['📸', 'Bilan du mois', 'recapOpen'], gen: ['🎯', 'Séance du jour', 'genOpen'],
  seances: ['📚', 'Mes séances', 'goLib'], progress: ['📈', 'Mes progrès', 'goProgressTop'], program: ['📆', 'Planning', 'topCal'], streak: ['🔥', 'Ma série', 'goProgressTop'],
  badges: ['🏅', 'Badges', 'goProgressTop'], search: ['🔍', 'Rechercher dans l’app', 'findOpen'],
};
// Symboles compris de tous : icône seule. Les autres ont leur mot dessous.
const CLEAR = new Set(['search', 'notif', 'cal', 'all', 'timer']);
const SHORT = { coach: 'Assistant', recap: 'Bilan', carnet: 'Carnet', gen: 'Séance', seances: 'Séances', progress: 'Progrès', program: 'Planning', streak: 'Série', badges: 'Badges' };
// Fonctions de chaque page. k = formes possibles, tile = s'affiche en tuile dans la grille de raccourcis.
const F = (l, k, extra = {}) => ({ l, k, ...extra });
export const FEATURES = {
  home: {
    search: F('Recherche', ['icon']), hero: F('Bonjour et semaine', ['big']), gen: F('Séance du jour', ['big', 'icon'], { tile: 1 }), seances: F('Mes séances', ['big', 'icon'], { tile: 1 }),
    timer: F('Minuteur', ['big', 'icon'], { tile: 1 }), carnet: F('Carnet d’escalade', ['big', 'icon'], { tile: 1 }), progress: F('Mes progrès', ['big', 'icon'], { tile: 1 }),
    cal: F('Calendrier', ['icon', 'big']), notif: F('Notifications', ['icon']), all: F('Toutes les fonctions', ['icon']), coach: F('Coach et commandes', ['icon', 'big']),
    program: F('Programme', ['big', 'icon']), finger: F('Alerte doigts', ['big']), streak: F('Ma série', ['big', 'icon']), today: F('Que faire aujourd’hui ?', ['big']), question: F('Petite question', ['big']),
    next: F('Prochaines séances', ['big']), goals: F('Objectifs', ['big']), reco: F('Recommandations', ['big']), weekprog: F('Progression 7 jours', ['big']),
    records: F('Records', ['big']), regularity: F('Régularité', ['big']), capacities: F('Capacités', ['big']), load: F('Charge récente', ['big']), summary: F('Résumé de la semaine', ['big']),
    forme: F('Forme du jour', ['big']),
  },
  progress: {
    search: F('Recherche', ['icon']), streak: F('Ma série', ['big']), kpis: F('Chiffres clés', ['big']), wins: F('Bonnes nouvelles', ['big']), goalsdone: F('Objectifs réussis', ['big']), work: F('Ce que tu as travaillé', ['big']),
    regularity: F('Régularité', ['big']), load: F('Charge', ['big']), muscles: F('Muscles travaillés', ['big']), badges: F('Badges', ['big']), weeksum: F('Résumé de la période', ['big']),
    learned: F('Ce que l’app a appris sur toi', ['big']),
    recap: F('Bilan du mois', ['icon']), notif: F('Notifications', ['icon']), all: F('Toutes les fonctions', ['icon']), timer: F('Minuteur', ['icon']),
  },
  // 8.29 : la Bibliothèque et le Profil se personnalisent aussi (ordre, masquer, couleur), pas seulement leurs icônes.
  library: {
    search: F('Recherche', ['icon']), newbtn: F('Bouton « ＋ Nouvelle séance »', ['big'], { ic: '＋' }), draft: F('Séance en cours de création', ['big'], { ic: '📝' }),
    'r-seances': F('Mes séances', ['big'], { row: 1, ic: '📋' }), 'r-climbplan': F('Créer une séance', ['big'], { row: 1, ic: '✨' }), 'r-catalog': F('Carnet de séances', ['big'], { row: 1, ic: '📖' }),
    'r-exercises': F('Exercices', ['big'], { row: 1, ic: '💪' }), 'r-common': F('Bibliothèque commune', ['big'], { row: 1, ic: '🌍' }), 'r-search': F('Rechercher', ['big'], { row: 1, ic: '🔍' }),
    gen: F('Séance du jour', ['icon']), timer: F('Minuteur', ['icon']), notif: F('Notifications', ['icon']), all: F('Toutes les fonctions', ['icon']), coach: F('Coach', ['icon']),
  },
  profile: {
    search: F('Recherche', ['icon']), hero: F('En-tête : nom, sports, chiffres', ['big'], { ic: '👤' }), sw: F('Points forts et à travailler', ['big'], { ic: '💪' }),
    bilan: F('Mon bilan physique (carte)', ['big'], { ic: '🩺' }), complete: F('Profil à compléter', ['big'], { ic: '🧩' }),
    'g-moi': F('Tuiles « Moi »', ['big'], { ic: '🙂' }), 'g-res': F('Tuiles « Mes résultats »', ['big'], { ic: '🏆' }), 'g-why': F('Tuiles « Comprendre mes conseils »', ['big'], { ic: '🔎' }), 'g-share': F('Tuiles « Partager »', ['big'], { ic: '🔗' }),
    carnet: F('Carnet', ['icon']), coach: F('Coach', ['icon']), notif: F('Notifications', ['icon']), all: F('Toutes les fonctions', ['icon']), timer: F('Minuteur', ['icon']),
  },
  settings: { search: F('Recherche', ['icon']), notif: F('Notifications', ['icon']), all: F('Toutes les fonctions', ['icon']) },
};
// Mise en page de base : simple au départ.
export const DEFAULTS = {
  home: [['search', 'icon'], ['hero', 'big'], ['gen', 'big'], ['seances', 'big'], ['timer', 'big'], ['carnet', 'big'], ['program', 'big'], ['finger', 'big'], ['forme', 'big'], ['today', 'big'], ['question', 'big'], ['cal', 'icon'], ['notif', 'icon'], ['all', 'icon']],
  progress: [['search', 'icon'], ['streak', 'big'], ['kpis', 'big'], ['wins', 'big'], ['goalsdone', 'big'], ['work', 'big'], ['learned', 'big'], ['regularity', 'big'], ['badges', 'big'], ['muscles', 'big'], ['load', 'big'], ['weeksum', 'big'], ['notif', 'icon'], ['all', 'icon']],
  library: [['search', 'icon'], ['newbtn', 'big'], ['draft', 'big'], ['r-seances', 'big'], ['r-climbplan', 'big'], ['r-catalog', 'big'], ['r-exercises', 'big'], ['r-common', 'big'], ['r-search', 'big'], ['timer', 'icon'], ['notif', 'icon'], ['all', 'icon']],
  profile: [['search', 'icon'], ['hero', 'big'], ['sw', 'big'], ['bilan', 'big'], ['complete', 'big'], ['g-moi', 'big'], ['g-res', 'big'], ['g-why', 'big'], ['g-share', 'big'], ['coach', 'icon'], ['notif', 'icon'], ['all', 'icon']],
  settings: [['search', 'icon'], ['notif', 'icon'], ['all', 'icon']],
};
export const COLORS = ['', '#d4a056', '#5fa8d3', '#5cb87a', '#ef6f5e', '#a78bfa', '#f472b6', '#ffd60a'];
const OLD_DASH = { today: 'today', next: 'next', goals: 'goals', reco: 'reco', command: 'coach', progress: 'weekprog', records: 'records', regularity: 'regularity', capacities: 'capacities', load: 'load', summary: 'summary', calendar: 'cal' };

/** Mise en page enregistrée (validée, complétée avec les fonctions ajoutées depuis). */
export function layout(page, saved = savedLayouts()) {
  // Mise en page de base : celle choisie par un administrateur pour tout le monde, sinon celle de l'app.
  const gl = globalLayout(), forcedOff = new Set(gl.off?.[page] || []);
  const feats = FEATURES[page] || {}, def = gl.pages?.[page]?.length ? gl.pages[page].map((e) => [e.id, e.as, e.color]) : DEFAULTS[page] || [];
  let list = Array.isArray(saved?.[page]) ? saved[page] : null;
  if (!list && page === 'home') { // ancien tableau de bord personnalisé : on le reprend
    const old = item('config', 'dashboard')?.blocks;
    if (Array.isArray(old) && old.length) { const big = old.map((b) => OLD_DASH[b]).filter(Boolean); list = [...def.filter(([id]) => ['hero', 'gen', 'seances', 'timer', 'carnet', 'program', 'finger'].includes(id)), ...big.map((id) => [id, id === 'cal' ? 'big' : 'big']), ['cal', big.includes('cal') ? 'big' : 'icon'], ['notif', 'icon'], ['all', 'icon']].map(([id, as]) => ({ id, as })); }
  }
  list = (list || def.map(([id, as, color]) => ({ id, as, color }))).map((e) => (Array.isArray(e) ? { id: e[0], as: e[1] } : e));
  const seen = new Set(), out = [];
  for (const e of list) {
    const f = feats[e?.id]; if (!f || seen.has(e.id)) continue; seen.add(e.id);
    out.push({ id: e.id, as: e.as === 'off' || f.k.includes(e.as) ? e.as : f.k[0], color: COLORS.includes(e.color) ? e.color : '' });
  }
  for (const [id] of Object.entries(feats)) if (!seen.has(id)) { const d = def.find((x) => x[0] === id); out.push({ id, as: d ? d[1] : 'off', color: '' }); }
  // Masqué pour tout le monde par un administrateur : jamais affiché (l'éditeur le montre, marqué).
  for (const e of out) if (forcedOff.has(e.id)) { e.as = 'off'; e.forced = true; }
  return out;
}
export function savedLayouts() { try { return JSON.parse(item('config', 'layout')?.lay || '{}') || {}; } catch { return {}; } }
const store = (all) => putItem('config', 'layout', { lay: JSON.stringify(all).slice(0, 9000) });

/* ───────── Barre d'icônes (en haut à droite) ───────── */
// En aperçu, la page s'affiche avec le brouillon de mise en page (pas encore enregistré).
const shown = (page) => (S.lay?.page === page && S.lay.preview ? S.lay.list : layout(page));
const editing = (page) => S.lay?.page === page && !S.lay.preview;
export function topIcons(page) {
  if (editing(page)) return h`<button class="btn sm" data-act="layQuit">✕ Quitter</button>`;
  const icons = shown(page).filter((e) => e.as === 'icon' && ICONS[e.id]);
  const unread = S.notifUnread || 0;
  return h`<nav class="topicons" aria-label="Raccourcis">${icons.map((e) => { const [ic, label, act] = ICONS[e.id]; const w = CLEAR.has(e.id) ? '' : SHORT[e.id] || label; return h`<button class="ti ${w ? 'lbl' : ''}" data-act="${act}" data-id="${e.id}" aria-label="${label}" title="${label}" ${e.color ? raw(`style="--wc:${e.color}"`) : ''}>${w ? h`<span>${ic}</span><small>${w}</small>` : ic}${e.id === 'notif' && unread ? h`<i class="badge-dot">${unread > 9 ? '9+' : unread}</i>` : ''}</button>`; })}
    ${FEATURES[page] && !S.lay && !S.settings?.hideLayEdit ? h`<button class="ti edit lbl" data-act="layEdit" aria-label="Organiser cette page : choisir ce qui s’affiche, l’ordre et les couleurs" title="Organiser cette page"><span>✏️</span><small>Organiser</small></button>` : ''}</nav>`;
}

/**
 * Compose une page : renderers[id]() rend chaque fonction en grand ; les tuiles consécutives sont groupées.
 * En mode édition, chaque élément reçoit ses commandes (ordre, forme, couleur), même masqué.
 */
export function composePage(page, renderers) {
  if (editing(page)) return editor(page);
  const feats = FEATURES[page], out = [], preview = S.lay?.page === page; let tiles = [], rows = [];
  if (preview) out.push(h`<div class="editdock top"><span class="grow small"><b>👁 Aperçu</b> — pas encore enregistré</span><button class="btn sm" data-act="layBack">✏️ Continuer</button><button class="btn sm pri" data-act="laySave">✓ Enregistrer</button></div>`);
  // Tuiles consécutives → une grille ; lignes consécutives → une liste (comme dans les Paramètres).
  const flush = () => { if (tiles.length) { out.push(h`<div class="quick">${tiles}</div>`); tiles = []; } if (rows.length) { out.push(h`<div class="setmenu">${rows}</div>`); rows = []; } };
  for (const e of shown(page)) {
    const f = feats[e.id]; if (!f || e.as !== 'big') continue;
    let content = ''; try { content = renderers[e.id]?.() || ''; } catch (err) { console.error(err); content = h`<section class="card"><p class="small warn-t">« ${f.l} » n’a pas pu s’afficher : ${err.message}</p></section>`; }
    if (!content) continue;
    const node = e.color ? h`<div class="slot" style="--wc:${e.color}">${content}</div>` : content;
    if (f.tile) { if (rows.length) flush(); tiles.push(node); } else if (f.row) { if (tiles.length) flush(); rows.push(node); } else { flush(); out.push(node); }
  }
  flush();
  return h`${out}`;
}
/** Éditeur compact : une ligne par fonction (ordre, forme, couleur). */
function editor(page) {
  const list = S.lay.list, feats = FEATURES[page], n = list.length;
  const FORM = { big: 'Grand', icon: 'Icône', off: 'Masqué' };
  const name = { home: 'l’Accueil', progress: 'Progrès', library: 'la Bibliothèque', profile: 'le Profil' }[page] || 'cette page';
  return h`<section class="card editbar"><h2>✏️ Personnaliser ${name}</h2><p class="small">Choisis ce qui s’affiche sur ${name}, et dans quel ordre :</p>
    <ul class="clean tight small"><li><b>Grand</b> : un bloc sur la page</li><li><b>Icône</b> : un petit bouton en haut à droite</li><li><b>Masqué</b> : n’apparaît plus (tu peux le remettre ici)</li><li><b>↑ ↓</b> : l’ordre · <b>🎨</b> : la couleur</li></ul>
    <p class="tiny muted">Rien ne change tant que tu n’as pas enregistré. <b>👁 Aperçu</b> pour voir le résultat, <b>✕ Quitter</b> en haut pour sortir sans rien changer. <button class="linkish acc-t" data-act="layReset">Revenir à la mise en page de base</button></p></section>
    <div class="edlist">${list.map((e, i) => { const f = feats[e.id]; return h`<div class="edrow ${e.as}" ${e.color ? raw(`style="--wc:${e.color}"`) : ''}>
      <div class="row"><span class="edic">${f.ic || ICONS[e.id]?.[0] || (f.tile ? '▢' : '▭')}</span><b class="grow small">${f.l}${e.forced ? h` <span class="tag warn">🚫 masqué pour tous</span>` : ''}</b>
        <button class="btn sm ic" data-act="layMove" data-id="${e.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn sm ic" data-act="layMove" data-id="${e.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button></div>
      <div class="row wrapf"><div class="chips choice sm">${[...f.k, 'off'].map((k) => h`<button type="button" class="chip ${e.as === k ? 'on' : ''}" data-act="layAs" data-id="${e.id}" data-v="${k}">${FORM[k]}</button>`)}</div><span class="grow"></span>
        <button type="button" class="swc cur" data-act="layPick" data-id="${e.id}" aria-label="Couleur" ${raw(e.color ? `style="background:${e.color}"` : '')}>${e.color ? '' : '🎨'}</button></div>
      ${S.lay.pick === e.id ? h`<div class="swatches">${COLORS.map((c) => h`<button type="button" class="swc ${e.color === c ? 'on' : ''}" data-act="layColor" data-id="${e.id}" data-v="${c}" aria-label="${c ? 'Couleur ' + c : 'Sans couleur'}" ${raw(c ? `style="background:${c}"` : '')}>${c ? '' : '∅'}</button>`)}</div>` : ''}</div>`; })}</div>
    <div class="editdock"><button class="btn" data-act="layQuit">✕ Quitter</button><button class="btn" data-act="layPreview">👁 Aperçu</button><button class="btn pri" data-act="laySave">✓ Enregistrer</button></div>`;
}

/* ───────── Actions du mode édition ───────── */
ACT.layEdit = () => { const page = S.tab; if (!FEATURES[page]) return; S.lay = { page, list: layout(page).map((e) => ({ ...e })) }; render(); window.scrollTo(0, 0); };
const findE = (id) => S.lay?.list.find((e) => e.id === id);
ACT.layMove = (el) => { const L = S.lay.list, i = L.findIndex((e) => e.id === el.dataset.id), j = i + Number(el.dataset.d); if (i < 0 || j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); };
ACT.layAs = (el) => { const e = findE(el.dataset.id); if (e) { e.as = el.dataset.v; render(); } };
ACT.layColor = (el) => { const e = findE(el.dataset.id); if (e) { e.color = el.dataset.v; S.lay.pick = ''; render(); } };
ACT.layPick = (el) => { S.lay.pick = S.lay.pick === el.dataset.id ? '' : el.dataset.id; render(); };
ACT.layEditAt = (el) => { const [t, sub] = String(el.dataset.to).split('/'); go(t, sub); setTimeout(() => ACT.layEdit(), 150); };
ACT.layCancel = () => { S.lay = null; render(); toast('Aucun changement enregistré.'); };
const changed = () => S.lay && JSON.stringify(S.lay.list.map(({ id, as, color }) => [id, as, color || ''])) !== JSON.stringify(layout(S.lay.page).map(({ id, as, color }) => [id, as, color || '']));
ACT.layQuit = async () => {
  if (changed() && !(await ask('Quitter sans enregistrer ?', { ok: 'Quitter', detail: 'Tes changements de mise en page seront perdus.' }))) return;
  S.lay = null; render(); window.scrollTo(0, 0);
};
ACT.layPreview = () => { if (!S.lay) return; S.lay.preview = true; render(); window.scrollTo(0, 0); };
ACT.layBack = () => { if (!S.lay) return; S.lay.preview = false; render(); };
ACT.laySave = async () => {
  if (!S.lay) return;
  if (!isAdminUser() && !(await ask('Enregistrer cette mise en page ?', { ok: 'Oui, enregistrer', detail: 'Elle remplace la mise en page de cette page, sur tous tes appareils. Tu pourras revenir à la mise en page de base quand tu veux.' }))) return;
  const list = S.lay.list.map(({ id, as, color }) => (color ? { id, as, color } : { id, as }));
  const scope = await chooseScope('Cette mise en page. Pour tout le monde : elle devient la mise en page de base, et ce que tu as masqué est masqué pour tous.');
  if (!scope) return;
  if (scope === 'all') {
    const page = S.lay.page, gl = globalLayout();
    try {
      await saveLayoutGlobal({ pages: { ...(gl.pages || {}), [page]: list }, off: { ...(gl.off || {}), [page]: list.filter((e) => e.as === 'off').map((e) => e.id) } });
      const all = savedLayouts(); delete all[page]; store(all); // tu vois la même chose que tout le monde
      S.lay = null; render(); toast('Mise en page enregistrée pour tout le monde ✓');
    } catch (e) { toast(e.message, 4500, 'bad'); }
    return;
  }
  const all = savedLayouts(); all[S.lay.page] = list;
  store(all); S.lay = null; render(); toast('Mise en page enregistrée ✓');
};
ACT.layReset = async (el) => {
  const scope = el?.dataset?.scope || (S.lay ? 'page' : 'all');
  if (!(await ask(scope === 'all' ? 'Revenir à la mise en page de base partout ?' : 'Revenir à la mise en page de base pour cette page ?', { ok: 'Oui, revenir à la base' }))) return;
  if (!(await ask('Vraiment ?', { ok: 'Oui, remettre comme au départ', danger: true, detail: 'Tes choix de place, de forme et de couleur seront effacés. Tes données (séances, historique…) ne sont pas touchées.' }))) return;
  if (scope === 'all') store({}); else { const all = savedLayouts(); delete all[S.lay.page]; store(all); }
  if (S.lay) S.lay = null;
  render(); toast('Mise en page de base remise');
};

/* ───────── Toutes les fonctions, triées ───────── */
const ALL = [
  ['S’entraîner', [['✨', 'Créer une séance (ou séance du jour)', 'cpNew'], ['📚', 'Mes séances', 'goLib'], ['🔀', 'Fusionner des séances', 'mergeOpen'], ['📖', 'Carnet de séances', 'allGo', 'library/catalog'], ['⏱', 'Minuteur', 'timerOpen'], ['👥', 'Séance à deux', 'duoJoinAsk'], ['💬', 'Assistant (questions, exercices avec tes mots)', 'coachOpen']]],
  ['Escalade', [['🧗', 'Carnet (blocs, voies)', 'goCarnet'], ['📌', 'Projets (dans Objectifs)', 'goProjects'], ['✋', 'Test de doigts (Records et mesures)', 'allGo', 'profile/perfs']]],
  ['Suivre mes progrès', [['📈', 'Résumé', 'goProgressTop'], ['📝', 'Journal (séances, blocs, notes)', 'allGo', 'progress/journal'], ['🏆', 'Records et mesures', 'allGo', 'profile/perfs'], ['🔎', 'Mon analyse', 'allGo', 'profile/analyse']]],
  ['Planifier', [['📅', 'Planning (calendrier, programme, rappels)', 'topCal'], ['🔔', 'Notifications', 'notifOpen']]],
  ['Moi', [['👤', 'Mon profil', 'allGo', 'profile/home'], ['🎯', 'Objectifs', 'allGo', 'profile/goals'], ['📍', 'Mes lieux (salles, matériel)', 'allGo', 'profile/equipment']]],
  ['Aider l’app', [['💡', 'Proposer une amélioration', 'ideaNew']]],
  ['Paramètres', [['🎨', 'Affichage et ambiance', 'allGo', 'settings/display'], ['▶️', 'Pendant la séance', 'allGo', 'settings/session'], ['✏️', 'Mise en page', 'layEditHome'], ['❓', 'Aide et visite', 'allGo', 'settings/help'], ['💾', 'Mes données', 'allGo', 'settings/data']]],
];
ACT.allOpen = () => openSheet(h`<div class="allf"><h2>Toutes les fonctions</h2>${ALL.map(([cat, list]) => h`<div><span class="kicker">${cat}</span><div class="allgrid">${list.map(([ic, l, act, to]) => h`<button class="allb" data-act="${act}" ${to ? raw(`data-to="${to}"`) : ''}><span>${ic}</span>${l}</button>`)}</div></div>`)}</div>`, { wide: true });
