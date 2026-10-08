// views-adapt.js — « 🔁 Adapter pour cette fois » : réglages (durée, matériel en moins, zone à ménager, échauffement,
// retour au calme, intensité, ou une phrase), puis aperçu de la version adaptée et de ce qu'elle travaille encore.
// La séance d'origine ne change JAMAIS ici : on lance la version adaptée, ou on la garde comme nouvelle séance.
import { h, chip, seg, openSheet, closeSheet, toast } from './ui.js';
import { S, ACT, CHG, ctx, getSeance, saveSeance } from './state.js';
import { CATALOG, buildSession } from './catalog.js';
import { EQUIPMENT } from './model.js';
import { AVOID_ZONES } from './intentions.js';
import { addField, onChoice, withMyMinutes } from './views-choices.js';
import { sessionMinutes } from './engine.js';
import { startPlayer } from './player.js';
import { adaptSession, parseAdapt, sessionNeeds, WARM_OPTS, COOL_OPTS, INTENSITY_OPTS } from './adapt.js';

const sourceOf = (a = S.adapt) => (a?.src === 'cat' ? (() => { const e = CATALOG.find((x) => x.id === a.id); return e ? buildSession(e) : null; })() : getSeance(a?.id));
/** Bouton à placer partout où une séance est affichée. */
export const adaptButton = (id, src = 'seance', cls = 'btn sm') => h`<button class="${cls}" data-act="adaptOpen" data-id="${id}" data-src="${src}" aria-label="Adapter pour cette fois : durée, matériel, douleur, échauffement, intensité (ta séance ne change pas)">🔁 Adapter</button>`;

ACT.adaptOpen = (el) => { S.adapt = { src: el.dataset.src || 'seance', id: el.dataset.id, o: {}, text: '', step: 'form' }; if (!sourceOf()) return toast('Séance introuvable.'); drawAdapt(); };
function drawAdapt() {
  const a = S.adapt, s = sourceOf(); if (!a || !s) return;
  if (a.step === 'preview' && a.r) return openSheet(previewView(s, a.r), { wide: true });
  const o = a.o, needs = sessionNeeds(s), mins = Math.round(sessionMinutes(s));
  openSheet(h`<div class="stack"><h2 style="margin:0">🔁 Adapter « ${s.name} »</h2>
    <p class="small acc-t">Pour cette fois seulement : ta séance d’origine ne change pas. Tu pourras lancer la version adaptée, ou la garder comme nouvelle séance.</p>
    <span class="kicker">⏱ Durée <span class="tiny muted">(prévue : ${mins} min)</span></span>
    <div class="chips">${chip(!o.minutes, 'Pareil', 'data-act="adSet" data-k="minutes" data-v=""')}${withMyMinutes([10, 15, 20, 30, 45, 60, 90, ...(o.minutes ? [o.minutes] : [])]).filter((m) => m !== mins).map((m) => chip(o.minutes === m, `${m} min`, `data-act="adSet" data-k="minutes" data-v="${m}"`))}${addField('minutes', 'adaptMin')}</div>
    ${needs.length ? h`<span class="kicker">🧰 Matériel que tu n’as pas cette fois</span><div class="chips">${needs.map((k) => chip((o.remove || []).includes(k), EQUIPMENT[k] || k, `data-act="adTog" data-k="remove" data-v="${k}"`))}</div>` : h`<p class="tiny muted">🧰 Cette séance ne demande aucun matériel.</p>`}
    <span class="kicker">🩹 J’ai mal ou je dois ménager</span><div class="chips">${AVOID_ZONES.map(([k, l]) => chip((o.zones || []).includes(k), l, `data-act="adTog" data-k="zones" data-v="${k}"`))}${addField('zone', 'adaptZone')}</div>
    <span class="kicker">🔥 Échauffement</span>${seg('adSeg', `warm:${o.warm || 'keep'}`, WARM_OPTS.map(([k, l]) => [`warm:${k}`, l]))}
    <span class="kicker">🌬️ Retour au calme</span>${seg('adSeg', `cool:${o.cool || 'keep'}`, COOL_OPTS.map(([k, l]) => [`cool:${k}`, l]))}
    <span class="kicker">💥 Intensité</span>${seg('adSeg', `intensity:${o.intensity || 'same'}`, INTENSITY_OPTS.map(([k, l]) => [`intensity:${k}`, l]))}
    <label>Ou dis-le simplement <span class="tiny muted">(ex. « 20 min, sans haltères, j’ai mal au genou, échauffement plus court »)</span><input type="text" maxlength="200" value="${a.text}" data-change="adText" placeholder="Ce qui change pour cette fois"></label>
    ${a.understood?.length ? h`<p class="tiny ok-t">✓ Compris : ${a.understood.join(' · ')}</p>` : a.text ? h`<p class="tiny muted">Rien de reconnu dans la phrase : utilise les choix ci-dessus.</p>` : ''}
    <button class="btn pri big" data-act="adPreview">Voir la version adaptée</button></div>`, { wide: true });
}
ACT.adSet = (el) => { const o = S.adapt.o, k = el.dataset.k, v = el.dataset.v; o[k] = k === 'minutes' ? (v ? Number(v) : undefined) : v; drawAdapt(); };
onChoice('adaptZone', { apply: (key) => { const o = S.adapt.o; o.zones = [...new Set([...(o.zones || []), key])]; drawAdapt(); } });
onChoice('adaptMin', { builtins: () => [10, 15, 20, 30, 45, 60, 90], apply: (key, el, r) => { S.adapt.o.minutes = r.n; drawAdapt(); } });
ACT.adTog = (el) => { const o = S.adapt.o, k = el.dataset.k, v = el.dataset.v, s = new Set(o[k] || []); if (s.has(v)) s.delete(v); else s.add(v); o[k] = [...s]; drawAdapt(); };
ACT.adSeg = (el) => { const [k, v] = String(el.dataset.id).split(':'); if (!['warm', 'cool', 'intensity'].includes(k)) return; S.adapt.o[k] = v === 'keep' || v === 'same' ? undefined : v; drawAdapt(); };
CHG.adText = (el) => {
  const a = S.adapt; a.text = el.value; const p = parseAdapt(el.value); a.understood = p.understood;
  for (const [k, v] of Object.entries(p.opts)) a.o[k] = Array.isArray(v) ? [...new Set([...(a.o[k] || []), ...v])] : v;
  drawAdapt();
};
ACT.adPreview = () => { const a = S.adapt, s = sourceOf(); if (!s) return; a.r = adaptSession(s, a.o, ctx()); a.step = 'preview'; drawAdapt(); };
ACT.adBack = () => { S.adapt.step = 'form'; drawAdapt(); };
function previewView(src, r) {
  const s = r.session, by = (b) => s.exercises.filter((e) => e.block === b), t = (e) => (e.mode === 'time' ? `${e.sets} × ${e.secMin} s` : `${e.sets} × ${e.repsMin}${e.repsMax > e.repsMin ? '–' + e.repsMax : ''}`);
  const part = (b, label) => (by(b).length ? h`<span class="kicker">${label}</span><div class="setmenu">${by(b).map((e) => h`<div class="setrow"><span class="sic">${e.emoji || '•'}</span><span class="grow"><b>${e.name}</b><small>${t(e)}${e.rest ? ` · repos ${e.rest} s` : ''}</small></span></div>`)}</div>` : '');
  return h`<div class="stack"><h2 style="margin:0">🔁 ${s.name}</h2>
    <p class="small">⏱ <b>${Math.round(sessionMinutes(s))} min</b> au lieu de ${Math.round(sessionMinutes(src))} min · ta séance d’origine ne change pas.</p>
    <div class="card flat"><b class="small">Ce qui change</b><ul class="clean tight small">${r.changes.map((c) => h`<li>${c}</li>`)}</ul></div>
    ${r.keeps.length ? h`<div class="card flat ok-b"><b class="small">Ce qui est toujours travaillé</b><ul class="clean tight small">${r.keeps.map((k) => h`<li>${k.label} : ${k.pct} % du travail d’origine</li>`)}</ul>${r.lost.length ? h`<p class="tiny warn-t">Plus travaillé dans cette version : ${r.lost.join(', ')}.</p>` : ''}</div>` : ''}
    ${r.warnings.map((w) => h`<p class="tiny warn-t">⚠️ ${w}</p>`)}
    ${part('warmup', '🔥 Échauffement')}${part('main', '💪 Corps de séance')}${part('cool', '🌬️ Retour au calme')}
    <div class="grid2"><button class="btn pri big" data-act="adPlay">▶ Lancer cette version</button><button class="btn big" data-act="adSave">💾 Garder comme nouvelle séance</button></div>
    <button class="btn" data-act="adBack">‹ Changer les réglages</button></div>`;
}
ACT.adPlay = () => { const r = S.adapt?.r; if (!r) return; closeSheet(); startPlayer(r.session, { fromGenerator: true }); };
ACT.adSave = () => { const r = S.adapt?.r; if (!r) return; const s = saveSeance({ ...r.session, source: 'adapted' }); closeSheet(); toast(`« ${s.name} » ajoutée à Mes séances. L’originale n’a pas changé.`, 3500); };
