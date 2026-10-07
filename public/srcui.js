// srcui.js — affichage des sources : petits liens « 📚 Auteur année » sous un conseil, fiche de la référence.
import { h, raw, openSheet } from './ui.js';
import { ACT } from './state.js';
import { SOURCES, sourceRefs } from './sources.js';

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
/** Petits liens « 📚 Auteur année » sous un conseil ; un toucher ouvre la référence complète. */
export const sourcesLine = (ids = []) => { const r = sourceRefs(ids); return r.length ? h`<div class="srcs">📚 ${r.map((x) => h`<button type="button" class="src" data-act="srcOpen" data-id="${x.id}">${x.short}</button>`)}</div>` : ''; };
export const aiProposalReady = (proposal) => proposal?.status === 'ok' && ['app', 'request', 'profile', 'research'].includes(proposal.basis) && Array.isArray(proposal.sources) && proposal.sources.length > 0 && proposal.sources.every((s) => s && typeof s.id === 'string' && typeof s.label === 'string' && s.label.trim() && ['app', 'request', 'profile', 'research'].includes(s.kind)) && ['request', 'app/model'].every((id) => proposal.sources.some((s) => s.id === id));
/** Origine d'une proposition IA : seules les références renvoyées par le serveur sont affichées. */
export function aiEvidence(proposal = {}) {
  const sources = (Array.isArray(proposal.sources) ? proposal.sources : []).slice(0, 8).filter((s) => s && typeof s.label === 'string').map((s) => {
    let url = '';
    try {
      const rawUrl = String(s.url || ''), u = new URL(rawUrl);
      if (rawUrl.length <= 2048 && !/[\u0000-\u0020\u007f]/.test(rawUrl) && u.protocol === 'https:' && !u.username && !u.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname) && !/\.(local|localhost)$/i.test(u.hostname)) url = u.href;
    } catch { /* une référence interne n'a pas de lien externe */ }
    const checkedAt = typeof s.checkedAt === 'string' && Number.isFinite(Date.parse(s.checkedAt)) ? new Date(s.checkedAt).toISOString() : '';
    return { label: s.label.slice(0, 180), kind: s.kind, url, checkedAt };
  });
  if (!sources.length) return '';
  const labels = { app: 'Référence interne de l’app', request: 'Texte fourni par toi', profile: 'Déclarations du profil partagé', research: 'Article scientifique' };
  const research = sources.some((s) => s.kind === 'research' && s.checkedAt);
  return h`<details class="how mini ai-sources"><summary>Sources utilisées</summary><ul class="clean tiny">${sources.map((s) => h`<li>${labels[s.kind] ? h`<span class="muted">${labels[s.kind]} · </span>` : ''}${s.url ? h`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>` : s.label}${s.checkedAt ? h`<span class="muted"> · consulté le ${new Date(s.checkedAt).toLocaleDateString('fr-FR')}</span>` : ''}</li>`)}</ul><p class="tiny muted">${research ? 'Les articles consultés ne garantissent pas le résultat de cet entraînement pour toi.' : 'Ces références expliquent l’origine de la proposition ; elles ne valident pas son efficacité scientifique.'}</p></details>`;
}
ACT.srcOpen = (el) => {
  const s = SOURCES[el.dataset.id]; if (!s) return;
  openSheet(h`<div class="stack"><span class="kicker">Source</span><h2 style="margin:0">${s.title}</h2><p class="small">${s.authors} · ${s.year} · <i>${s.journal}</i></p>
    <div class="card flat"><b class="small">Ce qu’elle montre</b><p class="small">${s.key}</p></div>${raw(`<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Lire la source ↗</a>`)}<button class="btn ghost" data-act="closeSheet">Fermer</button></div>`);
};
