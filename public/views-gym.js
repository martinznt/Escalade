// views-gym.js — Bibliothèque › « 🏋️ Ma salle de sport » : ma salle (machines cochées par zone), la séance du jour
// (découpage, but, durée, machines d'abord, remplacer un exercice), et le carnet de mes machines (charges, réglages).
import { h, openSheet, closeSheet, toast, chip, fmtDay, askText } from './ui.js';
import { addField, onChoice, withMyMinutes } from './views-choices.js';
import { S, ACT, ctx, render, putItem, item, itemsOf, saveSeance } from './state.js';
import { uid } from './shared.js';
import { EQUIPMENT } from './model.js';
import { GYM_ZONES, GYM_PRESETS, SPLITS, GOALS, buildGymSession, nextDay, machineBook, isMachine } from './gym.js';
import { levelFor } from './generator.js';
import { startPlayer } from './player.js';
import { byId } from './library.js';

const fr = (x) => String(x).replace('.', ',');
const gymEnvs = () => ctx().envs.filter((e) => e.type === 'salle' && !e.archived);
const curEnv = () => { const l = gymEnvs(); return l.find((e) => e.id === S.gymEnv) || l.find((e) => e.id === ctx().defEnv?.id) || l[0] || null; };
const st = () => (S.gym ||= { split: 'ppl', day: '', goal: 'muscle', minutes: 60, machinesFirst: false, exclude: [] });
const level = () => { try { return Math.max(0, Math.min(2, levelFor('strength', ctx()).level)); } catch { return 1; } };

export function vGym() {
  const env = curEnv(), g = st(), c = ctx();
  if (!env) return h`<div class="card acc-b"><h3>🏋️ Ta salle de sport</h3><p class="small">Dis à l’app quelles machines et quels poids il y a dans ta salle : chaque séance n’utilisera que ce que tu as, et retiendra tes charges machine par machine.</p>
    <div class="setmenu">${Object.entries(GYM_PRESETS).map(([k, [l, list]]) => h`<button class="setrow" data-act="gymCreate" data-id="${k}"><span class="sic">🏢</span><span class="grow"><b>${l}</b><small>${list.length} machines et équipements, à ajuster ensuite</small></span><span class="chev">›</span></button>`)}</div></div>`;
  const eq = new Set(env.equipment || []), machines = [...eq].filter((k) => GYM_ZONES.slice(0, 5).some(([, l]) => l.includes(k))).length;
  const day = g.day || nextDay(c.history, g.split);
  const s = (g.built && g.builtKey === key(env, day)) ? g.built : (g.built = buildGymSession({ day, goal: g.goal, minutes: g.minutes, level: level(), equipment: availableAt(env), history: c.history, machinesFirst: g.machinesFirst, exclude: g.exclude }), g.builtKey = key(env, day), g.built);
  const mains = s.exercises.filter((e) => e.block === 'main');
  const book = machineBook(c.history, itemsOf('exsetup'));
  return h`<div class="card"><div class="row between wrapf"><h3 style="margin:0">🏢 ${env.name}</h3>${gymEnvs().length > 1 ? h`<div class="chips">${gymEnvs().map((e) => chip(e.id === env.id, e.name, `data-act="gymPick" data-id="${e.id}"`))}</div>` : ''}</div>
      <p class="small">${machines} machine${machines > 1 ? 's' : ''} · ${eq.has('weights') ? 'haltères' : 'pas d’haltères'} · ${eq.has('barbell') ? 'barres' : 'pas de barre'}${eq.has('cable') ? ' · poulies' : ''}</p>
      <button class="btn" data-act="gymMachines">⚙️ Mes machines (${eq.size})</button></div>
    <section class="card"><h3 style="margin-top:0">📋 Séance du jour</h3>
      <span class="kicker">Découpage</span><div class="chips">${Object.entries(SPLITS).map(([k, [l]]) => chip(g.split === k, l, `data-act="gymSet" data-k="split" data-v="${k}"`))}</div>
      <span class="kicker">Aujourd’hui</span><div class="chips">${SPLITS[g.split][1].map(([d, l]) => chip(day === d, `${l.split(' :')[0]}${!g.day && d === day ? ' · conseillé' : ''}`, `data-act="gymSet" data-k="day" data-v="${d}"`))}</div>
      <span class="kicker">But</span><div class="chips">${Object.entries(GOALS).map(([k, [l]]) => chip(g.goal === k, l, `data-act="gymSet" data-k="goal" data-v="${k}"`))}</div>
      <span class="kicker">Durée</span><div class="chips">${withMyMinutes([30, 45, 60, 75, 90, g.minutes]).map((m) => chip(g.minutes === m, `${m} min`, `data-act="gymSet" data-k="minutes" data-v="${m}"`))}${addField('minutes', 'gymMin')}</div>
      <div class="chips">${chip(g.machinesFirst, '⚙️ Machines d’abord (plus simple, plus sûr)', 'data-act="gymMf"')}</div>
      <p class="tiny muted">${GOALS[g.goal][1]}. ${!g.day ? 'Le jour conseillé suit ta dernière séance de salle.' : ''}</p>
      ${mains.length ? h`<div class="setmenu">${mains.map((e) => h`<div class="setrow"><span class="sic">${e.emoji}</span><span class="grow"><b>${e.name}${isMachine(byId(e.libId)) ? ' ⚙️' : ''}</b><small>${e.sets} × ${e.repsMin}–${e.repsMax} · repos ${Math.round(e.rest / 15) * 15} s${/kg/.test(e.load) ? ` · ${e.load}` : ''}${e.note ? ` · ${e.note}` : ''}</small></span>
        <button class="btn sm" data-act="gymSwap" data-id="${e.libId}" aria-label="Remplacer ${e.name} (machine occupée)">🔄</button></div>`)}</div>
        <p class="tiny muted">🔄 : machine occupée ou exercice qui ne te convient pas → un autre qui travaille la même chose, avec ce qu’il y a dans ta salle.${g.exclude.length ? '' : ''}</p>
        ${g.exclude.length ? h`<button class="btn sm ghost" data-act="gymReset" style="white-space:normal">↺ Exercices du départ</button>` : ''}
        <div class="grid2"><button class="btn pri big" data-act="gymGo">▶ Lancer</button><button class="btn big" data-act="gymKeep">💾 Garder</button></div>`
        : h`<p class="small muted">Pas assez de matériel coché pour ce jour : ajoute des machines ou des poids dans « Mes machines ».</p>`}
    </section>
    <section class="card"><h3 style="margin-top:0">📒 Mes machines et mes charges</h3>
      ${book.length ? h`<div class="setmenu">${book.slice(0, S.gymBookAll ? 200 : 12).map((b) => h`<div class="setrow"><span class="sic">${b.emoji}</span><span class="grow"><b>${b.name}</b><small>Dernière fois : ${fr(b.last.load)} kg × ${b.last.reps} (${fmtDay(b.last.at)}) · meilleure ${fr(b.best)} kg${b.rm ? ` · max estimé ≈ ${fr(b.rm)} kg` : ''}${b.next ? ` · prochaine : ${fr(b.next)} kg` : ''}${b.setup ? ` · ⚙️ ${b.setup}` : ''}</small></span>
          <button class="btn sm" data-act="gymSetup" data-id="${b.id}" aria-label="Noter le réglage de ${b.name}">⚙️</button></div>`)}</div>
        ${book.length > 12 && !S.gymBookAll ? h`<button class="btn sm" data-act="gymBookAll">Voir les ${book.length} exercices</button>` : ''}
        <p class="tiny muted">⚙️ Réglage : hauteur du siège, dossier, prise… affiché pendant la séance. « Prochaine » suit la règle des 2 séances : on monte quand le haut de la fourchette est réussi deux fois.</p>`
        : h`<p class="small muted">Fais une séance de salle en notant tes charges : chaque machine aura sa fiche (dernière charge, meilleure, réglage, prochaine charge conseillée).</p>`}
    </section>`;
}
const key = (env, day) => JSON.stringify([env.id, (env.equipment || []).length, day, st().goal, st().minutes, st().machinesFirst, st().exclude, ctx().history.length]);
/** Matériel utilisable dans cette salle, moins ce qui est noté indisponible aujourd'hui. */
function availableAt(env) {
  const un = new Set(item('config', 'equipment')?.unavailable || []);
  return new Set((env.equipment || []).filter((k) => !un.has(k)));
}
const strip = (x) => { const { id, _u, ...d } = x; return d; };
const saveEnv = (env, equipment) => { const raw = item('env', env.id) || env; putItem('env', env.id, { ...strip(raw), equipment: [...new Set(equipment)].slice(0, 80) }); st().built = null; };

ACT.gymCreate = (el) => {
  const p = GYM_PRESETS[el.dataset.id]; if (!p) return;
  const id = 'env-' + uid().slice(0, 12);
  putItem('env', id, { name: 'Ma salle de sport', type: 'salle', equipment: [...p[1]] }); S.gymEnv = id; st().built = null; render();
  setTimeout(() => ACT.gymMachines(), 50); toast('Salle créée : coche ou décoche les machines qu’il y a vraiment.', 4000);
};
ACT.gymPick = (el) => { S.gymEnv = el.dataset.id; st().built = null; render(); };
ACT.gymMachines = () => {
  const env = curEnv(); if (!env) return;
  const eq = new Set(env.equipment || []);
  openSheet(h`<div class="stack"><h2 style="margin:0">⚙️ Les machines de ${env.name}</h2>
    <p class="small">Coche ce qu’il y a dans ta salle. Les séances n’utiliseront que ça. Une machine en panne aujourd’hui : décoche-la dans Profil › Mes lieux › « Indisponible aujourd’hui ».</p>
    <span class="kicker">Partir d’un modèle</span><div class="chips">${Object.entries(GYM_PRESETS).map(([k, [l]]) => h`<button type="button" class="chip" data-act="gymPreset" data-id="${k}">${l}</button>`)}</div>
    ${GYM_ZONES.map(([z, keys]) => h`<span class="kicker">${z} <span class="tiny muted">${keys.filter((k) => eq.has(k)).length} / ${keys.length}</span></span><div class="chips">${keys.map((k) => chip(eq.has(k), EQUIPMENT[k] || k, `data-act="gymEq" data-id="${k}"`))}</div>`)}
    <button class="btn pri" data-act="closeSheet">Terminé</button></div>`, { wide: true });
};
ACT.gymEq = (el) => { const env = curEnv(); if (!env) return; const eq = new Set(env.equipment || []), k = el.dataset.id; if (eq.has(k)) eq.delete(k); else eq.add(k); saveEnv(env, [...eq]); render(); ACT.gymMachines(); };
ACT.gymPreset = (el) => { const env = curEnv(), p = GYM_PRESETS[el.dataset.id]; if (!env || !p) return; saveEnv(env, [...(env.equipment || []).filter((k) => !GYM_ZONES.some(([, l]) => l.includes(k))), ...p[1]]); render(); ACT.gymMachines(); toast(`Modèle « ${p[0]} » appliqué`); };
onChoice('gymMin', { builtins: () => [30, 45, 60, 75, 90], apply: (key, el, r) => ACT.gymSet({ dataset: { k: 'minutes', v: String(r.n) } }) });
ACT.gymSet = (el) => {
  const g = st(), k = el.dataset.k, v = el.dataset.v;
  if (k === 'minutes') g.minutes = Number(v); else if (k === 'split') { g.split = v; g.day = ''; } else g[k] = v;
  g.exclude = []; g.built = null; render();
};
ACT.gymMf = () => { const g = st(); g.machinesFirst = !g.machinesFirst; g.exclude = []; g.built = null; render(); };
ACT.gymSwap = (el) => { const g = st(); g.exclude = [...g.exclude, el.dataset.id].slice(-20); g.built = null; render(); toast('Exercice remplacé par un autre qui travaille la même chose'); };
ACT.gymReset = () => { const g = st(); g.exclude = []; g.built = null; render(); };
const withEnv = (s) => { const env = curEnv(); return { ...s, context: { ...(s.context || {}), env: env?.id || '', envName: env?.name || '', plannedMin: st().minutes } }; };
ACT.gymGo = () => { const s = st().built; if (!s) return; startPlayer(withEnv(s), { fromGenerator: true }); };
ACT.gymKeep = () => { const s = st().built; if (!s) return; saveSeance({ ...withEnv(s), id: uid(), name: `${s.name} · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` }); toast('Gardée dans Mes séances'); };
ACT.gymBookAll = () => { S.gymBookAll = true; render(); };
ACT.gymSetup = async (el) => {
  const lib = byId(el.dataset.id); if (!lib) return;
  const id = 'es-' + String(lib.id).replace(/[^\w.-]/g, '_').slice(0, 60), old = item('exsetup', id);
  const t = await askText(`Réglage : ${lib.name}`, { value: old?.setup || '', placeholder: 'Ex. siège 4, dossier 2, prise large', max: 160, ok: 'Enregistrer' });
  if (t == null) return;
  putItem('exsetup', id, { key: lib.id, label: lib.name, setup: String(t).trim().slice(0, 160) }); toast(String(t).trim() ? 'Réglage gardé : affiché pendant la séance' : 'Réglage effacé'); render();
};
