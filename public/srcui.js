// srcui.js — affichage des sources : petits liens « 📚 Auteur année » sous un conseil, fiche de la référence.
import { h, raw, openSheet } from './ui.js';
import { ACT } from './state.js';
import { SOURCES, sourceRefs } from './sources.js';

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
/** Petits liens « 📚 Auteur année » sous un conseil ; un toucher ouvre la référence complète. */
export const sourcesLine = (ids = []) => { const r = sourceRefs(ids); return r.length ? h`<div class="srcs">📚 ${r.map((x) => h`<button type="button" class="src" data-act="srcOpen" data-id="${x.id}">${x.short}</button>`)}</div>` : ''; };
ACT.srcOpen = (el) => {
  const s = SOURCES[el.dataset.id]; if (!s) return;
  openSheet(h`<div class="stack"><span class="kicker">Source</span><h2 style="margin:0">${s.title}</h2><p class="small">${s.authors} · ${s.year} · <i>${s.journal}</i></p>
    <div class="card flat"><b class="small">Ce qu’elle montre</b><p class="small">${s.key}</p></div>${raw(`<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Lire la source ↗</a>`)}<button class="btn ghost" data-act="closeSheet">Fermer</button></div>`);
};

