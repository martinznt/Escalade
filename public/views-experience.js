// Présentation progressive : les mêmes assistants et calculs restent accessibles.
import { h, openSheet, closeSheet, toast, fmtDay, raw } from './ui.js';
import { S, ACT, SUBMIT, ctx, go, render, saveSettings, putItem } from './state.js';
import { interfaceMode, trainingMemory, sessionDifference, parseInterfaceRequest } from './experience.js';
const openWizard = (options) => import('./views-climbplan.js').then((m) => m.openWizard(options));
import { parseCommand } from './commands.js';
import { BODY_WORDS } from './generator.js';
import { ACTIVITIES } from './model.js';
export const advancedUI = () => interfaceMode(S.settings) === 'advanced';
export function interfaceChoice() {
  return h`<section class="card"><h3>Mon interface</h3><p class="small muted">Simple pour l’essentiel, avancée pour afficher plus de détails.</p><div class="chips">${[['simple','Simple'],['advanced','Avancée']].map(([v,l]) => h`<button type="button" class="chip ${interfaceMode(S.settings)===v?'on':''}" aria-pressed="${interfaceMode(S.settings)===v}" data-act="interfaceSet" data-v="${v}">${l}</button>`)}</div><p class="tiny muted">Tes conseils, tes réglages sportifs et tes données restent les mêmes.</p></section>`;
}
ACT.interfaceSet = (el) => {S.homeDetails = false; S.settings.interfaceMode=el.dataset.v==='advanced'?'advanced':'simple';saveSettings();render();toast(advancedUI()?'Interface avancée activée':'Interface simple activée');};
export function applyInterfaceRequest(text) {const mode=parseInterfaceRequest(text);if(!mode)return false;ACT.interfaceSet({dataset:{v:mode}});return true;}
export function creationChoices() {
  const more = h`<div class="row wrapf"><button class="btn" data-act="advancedCreate">Avancé</button><button class="btn" data-act="newSeance">À la main</button></div>`;
  return h`<section class="card stack"><h3>Créer ma séance</h3><button class="btn pri big" data-act="cpResume">Créer une séance</button><p class="tiny muted">Choisis tes objectifs, puis organise les phases. Ton brouillon est conservé.</p><div class="row wrapf"><span class="tiny muted">Raccourcis :</span><button class="btn sm ghost" data-act="expressOpen">Express</button><button class="btn sm ghost" data-act="guidedOpen">Guidé</button></div><p class="tiny muted">Express : décris ton envie. Guidé : réponds à quelques questions.</p>${advancedUI() ? more : h`<details class="how mini"><summary>Autres façons de créer</summary>${more}</details>`}</section>`;
}
ACT.guidedOpen = () => { const c=ctx(), acts={...ACTIVITIES,...c.activities};openSheet(h`<h2>Créer avec un guide</h2><form data-submit="guidedCreate" class="stack"><label>Quel sport ?<select name="sport">${Object.entries(acts).filter(([,a])=>!a.archived).map(([id,a])=>h`<option value="${id}" ${Object.keys(c.activities)[0]===id?'selected':''}>${a.label}</option>`)}</select></label><label>Combien de minutes ?<input name="minutes" type="number" min="5" max="300" value="${S.settings.defaultMinutes||30}" required></label><label>Où ?<select name="env"><option value="">Mon lieu habituel</option>${c.envs.map((e)=>h`<option value="${e.id}">${e.name}</option>`)}</select></label><label>Une envie particulière ? (facultatif)<input name="text" maxlength="240" placeholder="Force, technique, séance légère…"></label><button class="btn pri" type="submit">Voir la proposition</button></form>`); };
SUBMIT.guidedCreate = (form) => SUBMIT.expressCreate(form);
ACT.advancedCreate = () => {S.settings.interfaceMode='advanced';saveSettings();openWizard({auto:false});};
ACT.expressOpen = () => {
  const c=ctx(),acts={...ACTIVITIES,...c.activities};
  openSheet(h`<h2>Une séance Express</h2><form data-submit="expressCreate" class="stack"><label>Qu’est-ce que tu veux faire ?<input name="text" maxlength="240" placeholder="30 min tirage et gainage, ou séance légère"></label><label>Temps disponible en minutes<input name="minutes" type="number" min="5" max="300" value="${S.settings.defaultMinutes||30}" required></label><details class="how"><summary>Sport et lieu</summary><label>Sport<select name="sport"><option value="">Comme tu penses</option>${Object.entries(acts).filter(([,a])=>!a.archived).map(([k,a])=>h`<option value="${k}">${a.label}</option>`)}</select></label><label>Lieu<select name="env"><option value="">Mon lieu habituel</option>${c.envs.map((e)=>h`<option value="${e.id}">${e.name}</option>`)}</select></label></details><button class="btn pri" type="submit">Préparer ma séance</button></form>`);
};
SUBMIT.expressCreate = (form) => {
  const f=Object.fromEntries(new FormData(form)),cmd=parseCommand(f.text || 'Fais-moi une séance'),priorities={};
  for(const focus of cmd.focuses || [])for(const [k,v]of Object.entries(BODY_WORDS[focus]||{}))priorities[k]=Math.max(priorities[k]||0,v);
  const sport=f.sport || cmd.activity || Object.keys(ctx().activities)[0] || 'conditioning';
  closeSheet();openWizard({sport,minutes:cmd.minutes || Number(f.minutes),envId:f.env || '',forme:cmd.light?'tired':'',focus:Object.keys(priorities).length?{label:f.text,caps:priorities}:null});
  if(cmd.type==='unknown' && f.text)toast('Ta phrase n’a pas été interprétée : la proposition utilise le sport, le temps et ton profil. Tu peux modifier les objectifs.',6000);
};
export function memoryView() {
  const list=trainingMemory(ctx());
  return h`<h2>Ce que l’app a compris</h2><p class="small muted">Les observations sont des hypothèses. Confirme ou corrige-les ; une action isolée ne crée pas une préférence durable.</p>${list.length?list.map((p)=>h`<article class="card"><b>${p.label}</b><p class="small">${p.text}</p><p class="tiny muted">Origine : ${p.source} · Confiance : ${p.confidence}${p.at?' · Mis à jour '+fmtDay(p.at):''}</p>${p.value?h`<p class="tiny">Ton choix : ${{aime:'apprécié',evite:'à éviter',neutre:'neutre / ignoré'}[p.value]}</p>`:''}<div class="row wrapf">${[['aime',p.suggested==='evite'?'Apprécier':'Confirmer / apprécier'],['neutre','Ignorer'],['evite',p.suggested==='evite'?'Confirmer · à éviter':'À éviter']].map(([v,l])=>h`<button class="btn sm ${p.value===v?'pri':''}" data-act="memorySet" data-k="${p.key}" data-l="${p.label}" data-v="${v}">${l}</button>`)}</div></article>`):h`<p class="muted">Pas assez de séances pour observer une habitude. Tes choix explicites restent accessibles dans tes préférences.</p>`}<button class="btn" data-act="profSub" data-id="body">Mes préférences détaillées</button>`;
}
ACT.memorySet=(el)=>{const d=el.dataset;putItem('pref','x-'+d.k.replace(/[^\w-]/g,'_').slice(0,60),{key:d.k,label:d.l,value:d.v,source:'explicit',reason:'Mémoire confirmée ou corrigée par toi.'});render();};
export function comparisonView(previous,current) {
  const lines=sessionDifference(previous,current);if(!lines.length)return '';
  return h`<details class="card"><summary>Par rapport à « ${previous.name} »</summary>${lines.map((l)=>h`<div class="item"><div class="grow"><b>${l.kind==='same'?'Identique':'Adapté'} · ${l.text}</b><div class="tiny muted">${l.why}</div></div></div>`)}</details>`;
}
