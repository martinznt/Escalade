// views-community.js — encouragements entre partenaires, idées à voter (membres et administrateurs),
// statistiques anonymes (administrateurs), « voir l'app comme un nouveau membre ».
// Les droits sont vérifiés par le serveur ; l'interface ne fait qu'afficher.
import { h, openSheet, closeSheet, toast, ask, fmtDay } from './ui.js';
import { S, ACT, SUBMIT, CHG, api } from './state.js';
import { CHEERS } from './shared.js';
import { SITE_URL } from './views-settings.js';

const err = (e) => toast(e?.offline ? 'Connexion requise.' : e?.message || 'Erreur', 4000, 'bad');

/* ───────── Encouragements (partenaires : vous vous suivez tous les deux) ───────── */
export function cheersCard() {
  const list = S.social?.cheers || [];
  return h`<div class="card"><h3>💌 Encouragements reçus</h3>${list.length ? h`<div class="setmenu">${list.slice(0, 8).map((c) => h`<div class="setrow"><span class="sic">${c.fresh ? '🆕' : '💌'}</span><span class="grow"><b>${c.from}</b><small>${c.text} · ${fmtDay(c.at)}</small></span></div>`)}</div>`
    : h`<p class="small muted">Rien pour l’instant. Un partenaire (vous vous suivez tous les deux) peut t’envoyer un petit mot tout fait.</p>`}</div>`;
}
export async function loadCheers() { try { S.social.cheers = (await api('GET', '/api/social/cheers')).cheers; } catch { S.social.cheers = S.social.cheers || []; } }
ACT.cheerOpen = (el) => {
  const who = el.dataset.user;
  openSheet(h`<div class="stack"><h2 style="margin:0">💌 Encourager ${who}</h2><p class="small">Un petit mot tout fait, envoyé seulement à ${who}. Personne d’autre ne le voit.</p>
    <div class="setmenu">${Object.entries(CHEERS).map(([k, t]) => h`<button class="setrow" data-act="cheerSend" data-user="${who}" data-id="${k}"><span class="grow"><b>${t}</b></span><span class="chev">›</span></button>`)}</div></div>`);
};
ACT.cheerSend = async (el) => {
  try { await api('POST', '/api/social/cheer', { username: el.dataset.user, msg: el.dataset.id }); closeSheet(); toast(`💌 Envoyé à ${el.dataset.user}`); } catch (e) { err(e); }
};

/* ───────── Idées à voter ───────── */
const STATUS = { open: ['🗳️', 'Ouverte au vote'], planned: ['🛠️', 'Prévue'], done: ['✅', 'Faite'] };
ACT.ideasOpen = async () => {
  if (S.user?.guest) return openSheet(h`<div class="stack"><h2 style="margin:0">🗳️ Idées à voter</h2><p class="small">Voter demande un compte gratuit (un vote par personne).</p></div>`);
  let ideas; try { ideas = (await api('GET', '/api/ideas')).ideas; } catch (e) { return err(e); }
  openSheet(h`<div class="stack"><h2 style="margin:0">🗳️ Idées à voter</h2>
    <p class="small">Les idées retenues par l’équipe (souvent proposées par des membres). Vote pour celles que tu veux voir arriver : les plus demandées passent en premier. Ton vote est anonyme.</p>
    ${ideas.length ? h`<div class="setmenu">${ideas.map((x) => h`<div class="setrow ${x.mine ? 'on' : ''}"><span class="sic">${STATUS[x.status]?.[0] || '💡'}</span><span class="grow"><b>${x.title}</b><small>${x.detail ? `${x.detail} · ` : ''}${STATUS[x.status]?.[1] || ''} · ${x.votes} vote${x.votes > 1 ? 's' : ''}</small></span>
      ${x.status === 'open' ? h`<button class="btn sm ${x.mine ? 'pri' : ''}" data-act="ideaVote" data-id="${x.id}" aria-pressed="${x.mine}">${x.mine ? '✓ Voté' : 'Voter'}</button>` : ''}</div>`)}</div>`
      : h`<p class="small muted">Aucune idée publiée pour l’instant.</p>`}
    <button class="btn" data-act="ideaNew">💡 Proposer une idée</button></div>`);
};
ACT.ideaVote = async (el) => { try { await api('POST', `/api/ideas/${encodeURIComponent(el.dataset.id)}/vote`); ACT.ideasOpen(); } catch (e) { err(e); } };

/* ───────── Administrateurs : idées ───────── */
ACT.adminIdeasOpen = async () => {
  let ideas; try { ideas = (await api('GET', '/api/ideas')).ideas; } catch (e) { return err(e); }
  openSheet(h`<div class="stack"><h2 style="margin:0">🗳️ Idées à voter</h2>
    <p class="small">Écris l’idée avec tes mots (jamais le nom de qui l’a proposée). Les membres votent ; tu changes l’état quand elle est prévue ou faite. Chaque action est notée dans le Journal.</p>
    <form class="stack" data-submit="adminIdeaSave"><label>Idée<input name="title" maxlength="120" required placeholder="Ex. Mode sombre pour le minuteur"></label><label>Détail (facultatif)<textarea name="detail" rows="2" maxlength="1000"></textarea></label><button class="btn pri">Publier au vote</button></form>
    ${ideas.length ? h`<div class="setmenu">${ideas.map((x) => h`<div class="setrow"><span class="sic">${STATUS[x.status]?.[0]}</span><span class="grow"><b>${x.title}</b><small>${x.votes} vote${x.votes > 1 ? 's' : ''} · ${STATUS[x.status]?.[1]}</small></span>
      <select aria-label="État de l’idée" data-change="adminIdeaStatus" data-id="${x.id}" data-title="${x.title}" data-detail="${x.detail}">${Object.entries(STATUS).map(([k, [, l]]) => h`<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`)}</select>
      <button class="btn sm danger" data-act="adminIdeaDel" data-id="${x.id}" aria-label="Supprimer">✕</button></div>`)}</div>` : ''}</div>`, { wide: true });
};
SUBMIT.adminIdeaSave = async (f) => {
  const d = Object.fromEntries(new FormData(f));
  try { await api('POST', '/api/admin/ideas', { title: d.title, detail: d.detail || '', status: 'open' }); toast('Idée publiée au vote'); ACT.adminIdeasOpen(); } catch (e) { err(e); }
};
CHG.adminIdeaStatus = async (el) => {
  try { await api('POST', '/api/admin/ideas', { id: el.dataset.id, title: el.dataset.title, detail: el.dataset.detail, status: el.value }); toast('État mis à jour'); } catch (e) { err(e); }
};
ACT.adminIdeaDel = async (el) => {
  if (!(await ask('Supprimer cette idée et ses votes ?', { ok: 'Supprimer', danger: true }))) return;
  try { await api('DELETE', `/api/admin/ideas/${encodeURIComponent(el.dataset.id)}`); ACT.adminIdeasOpen(); } catch (e) { err(e); }
};

/* ───────── Administrateurs : statistiques anonymes ───────── */
const n = (x) => (x == null ? 'moins de 3' : String(x));
ACT.adminStatsOpen = async () => {
  let s; try { s = await api('GET', '/api/admin/stats'); } catch (e) { return err(e); }
  const max = Math.max(1, ...s.weeks.map((w) => w.sessions));
  openSheet(h`<div class="stack"><h2 style="margin:0">📊 Statistiques anonymes</h2>
    <p class="small">Seulement des totaux sur l’ensemble des comptes : aucun nom, aucune donnée d’une personne. Un groupe de moins de ${s.small} personnes est affiché « moins de ${s.small} ».</p>
    <div class="grid2">${[[n(s.users), 'comptes'], [n(s.active7), 'actifs sur 7 jours'], [n(s.active30), 'actifs sur 30 jours'], [s.sessions30, 'séances sur 30 jours']].map(([v, l]) => h`<div class="stat"><b>${v}</b><span>${l}</span></div>`)}</div>
    <p class="small">${s.sessions7} séance${s.sessions7 > 1 ? 's' : ''} ces 7 derniers jours${s.minutes30 != null ? ` · ${Math.round(s.minutes30 / 60)} h d’entraînement sur 30 jours` : ''}${s.people30 != null ? ` · ${s.people30} personnes actives` : ''}</p>
    <span class="kicker">Séances par semaine (8 dernières)</span>
    <div class="yearbars" aria-label="Séances par semaine">${s.weeks.map((w) => h`<div class="ybar" title="${w.sessions}"><i style="height:${Math.round((w.sessions / max) * 100)}%"></i><span>${new Date(w.from + 6 * 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</span></div>`)}</div>
    <span class="kicker">Sports pratiqués (30 jours)</span>
    ${s.activities.length ? h`<div class="setmenu">${s.activities.map((a) => h`<div class="setrow"><span class="grow"><b>${a.label}</b><small>${a.sessions == null ? 'moins de 3 personnes' : `${a.sessions} séance${a.sessions > 1 ? 's' : ''} · ${n(a.people)} personnes`}</small></span></div>`)}</div>` : h`<p class="small muted">Aucune séance sur 30 jours.</p>`}
    <p class="tiny muted">Calculé le ${fmtDay(s.at)}.</p></div>`, { wide: true });
};

/* ───────── Voir l'app comme un nouveau membre ───────── */
ACT.adminNewbie = () => openSheet(h`<div class="stack"><h2 style="margin:0">🐣 Voir l’app comme un nouveau membre</h2>
  <p class="small">Pour voir exactement ce que découvre quelqu’un qui arrive, sans toucher à ton compte :</p>
  <ol class="small"><li>Ouvre une fenêtre de navigation privée.</li><li>Va sur ${SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}.</li><li>Touche « 👀 Essayer sans compte » : questionnaire, visite guidée et accueil s’affichent comme au premier jour.</li></ol>
  <div class="grid2"><button class="btn" data-act="shareAppCopy">📋 Copier l’adresse</button><button class="btn" data-act="tourStart">🧭 Revoir la visite ici</button></div>
  <p class="tiny muted">Une fenêtre privée est nécessaire : dans une fenêtre normale, ton compte reste connecté.</p></div>`);

/* ───────── Administrateurs : sauvegarde du contenu commun ───────── */
// Lecture seule : un fichier avec tout le contenu commun publié. Revenir en arrière se fait dans « Brouillons et publication »
// (chaque publication est une version qu'on peut restaurer), jamais en écrasant tout d'un coup.
ACT.adminGlobalExport = async () => {
  let r; try { r = await api('GET', '/api/global'); } catch (e) { return err(e); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'mes-seances', kind: 'global-content', exportedAt: new Date().toISOString(), items: r.items }, null, 2)], { type: 'application/json' }));
  a.download = `contenu-commun-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`📦 ${r.items.length} élément${r.items.length > 1 ? 's' : ''} sauvegardé${r.items.length > 1 ? 's' : ''}`);
};
