// Icône personnelle : les données restent liées au compte ; l'installation appartient au navigateur et au système.
import { h, toast, ask } from './ui.js';
import { S, ACT, CHG, api, item, putItem, render } from './state.js';
import { ICON_BASES, ICON_STYLES, ICON_SPORTS, ICON_PALETTES, ICON_PRESETS, normalizeIconDesign, readIconDesign, presetIconDesign, drawIcon, iconPngBundle } from './icon-art.js';

export const APP_ICONS = Object.freeze([
  ['seances','Séances','#223341'],
  ['gold','Sommet doré','#000000'],['slate','Ardoise','#182D3B'],['white','Clair','#F4F3EE'],['forest','Forêt','#183F35'],['ocean','Bleu profond','#153C63'],
  ['climb','Grimpeur','#242D3B'],['route','Voie','#264D59'],['rope','Mousqueton','#4D2F49'],['mono','Monogramme','#17191C'],['terra','Terre','#73503E'],
].map(([id,label,background]) => Object.freeze({ id,label,background,manifest:`/manifest-icons-${id}-v1.json`,icon:`/app-icon-${id}-v1-192.png`,apple:`/app-icon-${id}-v1-180.png`,large:`/app-icon-${id}-v1-512.png`,maskable:`/app-icon-${id}-v1-maskable-512.png`,badge:`/app-icon-${id}-v1-badge-96.png` })));
export const validAppIcon = (id) => APP_ICONS.some((choice) => choice.id === id);
export const appIcon = (id) => APP_ICONS.find((choice) => choice.id === id) || APP_ICONS[0];
export function customAppIcon(token) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))return null;
  const path='/app-icons-custom/'+token+'/';
  return {id:'custom',token,label:'Personnelle',manifest:path+'manifest.json',icon:path+'192.png',large:path+'512.png',apple:path+'180.png',maskable:path+'maskable-512.png',badge:path+'badge-96.png'};
}
const config=(target)=>S.user&&S.loaded?item('config',target==='notification'?'notification-icon':'app-icon')||{}:{};
export function currentAppIcon() {const c=config('app');return c.appIcon==='custom'?(customAppIcon(c.appIconToken)||appIcon()):appIcon(c.appIcon);}
export function currentNotificationIcon() {const c=config('notification');return !c.notificationIcon||c.notificationIcon==='app'?currentAppIcon():c.notificationIcon==='custom'?(customAppIcon(c.notificationToken)||appIcon()):appIcon(c.notificationIcon);}
const installChoice = () => {
  try {
    const query=new URL(location.href).searchParams,id=query.get('appIcon');
    if(id==='custom'){
      const choice=customAppIcon(query.get('appIconToken'));
      return choice&&(document.querySelector('link[rel="manifest"]')?.getAttribute('href')===choice.manifest||currentAppIcon().token===choice.token)?choice:null;
    }
    return validAppIcon(id)?appIcon(id):null;
  } catch {return null;}
};
export function appIconInstallUrl(id=currentAppIcon().id,token=currentAppIcon().token) {
  const choice=id==='custom'?customAppIcon(token)||appIcon():appIcon(id);
  return `/?appIcon=${choice.id}${choice.token?'&appIconToken='+choice.token:''}#/settings/display`;
}
let previousOwner, panelOpen=false, notificationOpen=false, focusedIcon=null, creator=null, collection=null;
const panelListeners = new WeakMap();
const cachedTokens=new Map();
const iconOffline=()=>!navigator.onLine||S.sync==='offline';
function cacheCustomIcon(choice) {
  if(choice?.id!=='custom')return Promise.resolve();
  if(cachedTokens.has(choice.token))return cachedTokens.get(choice.token);
  const pending=(async()=>{try {
    const keys=typeof caches!=='undefined'?await caches.keys():[],name=keys.find(x=>x.startsWith('mes-seances-')),cache=name?await caches.open(name):null;
    await Promise.all(['icon','large','apple','maskable','badge','manifest'].map(async key=>{const res=await fetch(choice[key]);if(!res.ok)throw new Error('Icône indisponible');if(cache)await cache.put(choice[key],res.clone());}));
  } catch {cachedTokens.delete(choice.token);}})();
  cachedTokens.set(choice.token,pending);return pending;
}
/** Synchrone : aucun retour réseau ne peut réappliquer une icône de l'ancien compte. */
export function syncAppIcon() {
  const choice = currentAppIcon();
  if (typeof document === 'undefined') return choice;
  const owner = S.user?.id ?? null;
  if (previousOwner !== owner) { panelOpen=false;notificationOpen=false;focusedIcon=null;creator=null;collection=null; }
  if (previousOwner != null && previousOwner !== owner) {
    const url = new URL(location.href); if (url.searchParams.has('appIcon')) { url.searchParams.delete('appIcon');url.searchParams.delete('appIconToken');history.replaceState(null,'',url.pathname+url.search+url.hash); }
  }
  previousOwner = owner;
  const installing = installChoice() || choice;
  for (const [selector,href] of [['link[rel="manifest"]',installing.manifest],['link[rel="apple-touch-icon"]',installing.apple],['link[rel="icon"]',choice.icon]]) {
    const link = document.querySelector(selector); if (link && link.getAttribute('href') !== href) link.setAttribute('href',href);
  }
  for (const logo of document.querySelectorAll('.brand img,.auth .app-logo')) if (logo.getAttribute('src') !== choice.icon) logo.setAttribute('src',choice.icon);
  document.documentElement.dataset.appIcon = choice.id;
  document.documentElement.dataset.installIcon = installing.id;
  for(const [id,open,setOpen] of [['app-icons',panelOpen,value=>panelOpen=value],['notification-icons',notificationOpen,value=>notificationOpen=value]]){
    const panel=document.getElementById(id);if(!panel)continue;
    panel.open=open;
    const existing = panelListeners.get(panel);
    if (!existing || existing.owner !== owner) {
      if (existing) panel.removeEventListener('toggle', existing.listener);
      const listener = () => { if (panel.isConnected && previousOwner === owner) setOpen(panel.open); };
      panel.addEventListener('toggle', listener); panelListeners.set(panel, { owner, listener });
    }
    if(open&&focusedIcon&&document.activeElement===document.body)panel.querySelector(`[data-act="${focusedIcon.action}"][data-id="${focusedIcon.id}"]`)?.focus({preventScroll:true});
  }
  for(const canvas of document.querySelectorAll('canvas[data-icon-preset]'))drawIcon(canvas,presetIconDesign(canvas.dataset.iconPreset),{size:192});
  for(const canvas of document.querySelectorAll('canvas[data-icon-preview]')){const c=creatorFor(canvas.dataset.iconPreview);drawIcon(canvas,c.design,{size:192,badge:canvas.dataset.badge==='true'});}
  for(const panel of document.querySelectorAll('[data-icon-library-target]')){
    const store=iconLibrary(),target=panel.dataset.iconLibraryTarget,existing=panelListeners.get(panel);
    if(!existing||existing.owner!==owner){if(existing)panel.removeEventListener('toggle',existing.listener);const listener=()=>{if(!panel.isConnected||S.user?.id!==owner||collection!==store)return;if(panel.open){store.open.add(target);void loadIconLibrary();}else store.open.delete(target);};panel.addEventListener('toggle',listener);panelListeners.set(panel,{owner,listener});}
  }
  void cacheCustomIcon(choice);void cacheCustomIcon(currentNotificationIcon());
  return choice;
}
function iconChoices(target,choice) {
  const c=config(target),saved=customAppIcon(target==='app'?c.appIconToken:c.notificationToken),action=target==='app'?'appIconSet':'notificationIconSet',following=target==='notification'&&(!c.notificationIcon||c.notificationIcon==='app');
  const entries=[...(target==='notification'?[{...currentAppIcon(),id:'app',label:'Suivre l’app'}]:[]),...APP_ICONS,...(saved?[{...saved,label:'Ma création'}]:[])];
  return h`<div class="app-icon-options" role="radiogroup" aria-label="${target==='app'?'Icône de l’application':'Icône des notifications'}">${entries.map(x=>{
    const selected=x.id==='app'?following:!following&&x.id===choice.id;
    return h`<button type="button" class="app-icon-choice ${selected?'selected':''}" role="radio" aria-checked="${String(selected)}" data-act="${action}" data-id="${x.id}" data-owner="${S.user?.id||''}"><img src="${x.icon}" alt="" width="64" height="64" loading="lazy"><span>${x.label}</span><small>${selected?'✓ Choisie':x.id==='seances'?'Par défaut':'Choisir'}</small></button>`;
  })}</div>`;
}
export function appIconsCard() {
  const choice = currentAppIcon(), installing = installChoice();
  return h`<details class="card app-icons-panel" id="app-icons"><summary>Icône de l’application · ${choice.label}</summary>
    <p class="small muted">Choisis l’icône de ton compte. Ce choix sert aussi à préparer l’installation sur ton appareil.</p>
    ${iconChoices('app',choice)}${creatorCard('app')}
    ${installing && installing.icon !== choice.icon ? h`<p class="small" data-icon-install-note>Cette fenêtre prépare ${installing.id==='custom'&&choice.id==='custom'?'l’installation d’une autre création personnelle':'une installation avec « '+installing.label+' »'}. Ton choix de compte reste « ${choice.label} ».</p>` : ''}
    <p class="small">Une app déjà installée peut garder son ancienne icône. Le site ne peut pas imposer une mise à jour immédiate de l’icône du téléphone.</p>
    <a class="btn" data-app-icon-install href="${appIconInstallUrl(choice.id,choice.token)}" target="_blank" rel="noopener">Ouvrir la page d’installation avec ce choix</a>
    <details class="how mini"><summary>Changer l’icône sur mon téléphone</summary>
      <p class="small"><b>iPhone / iPad :</b> synchronise ou exporte d’abord tes modifications hors ligne. Ouvre la page ci-dessus dans Safari, supprime l’ancienne app de l’écran d’accueil, puis utilise Partager → Sur l’écran d’accueil. iOS garde souvent l’icône choisie à l’installation.</p>
      <p class="small"><b>Android :</b> Chrome peut actualiser l’icône d’une app installée plus tard. Pour appliquer le choix sans attendre, synchronise ou exporte tes modifications, désinstalle l’app, puis rouvre la page ci-dessus dans Chrome et choisis Installer l’application.</p>
      <p class="tiny muted">L’installation complète dans Chrome ajoute l’app à l’écran d’accueil et à la liste des applications. Un simple raccourci proposé par un autre navigateur peut rester uniquement sur l’écran d’accueil. Sur ordinateur, réinstalle l’app avec Chrome ou Edge.</p>
    </details></details>`;
}
export function notificationIconsCard() {
  const choice=currentNotificationIcon();
  return h`<details class="card app-icons-panel" id="notification-icons"><summary>Icône des notifications · ${choice.label}</summary>
    <p class="small muted">Garde l’icône de l’app ou choisis une image différente pour tes notifications.</p>${iconChoices('notification',choice)}
    <div class="icon-notification-preview"><img src="${choice.icon}" width="64" height="64" alt="Image de notification"><span class="icon-badge-preview"><img src="${choice.badge}" width="40" height="40" alt="Petit repère de notification"></span></div>
    <p class="tiny muted">Le petit repère reste monochrome. Certains systèmes, notamment iOS, utilisent leur propre icône à la place.</p>${creatorCard('notification')}</details>`;
}
function creatorFor(target) {
  const owner=S.user?.id??null;
  if(!creator||creator.owner!==owner||creator.target!==target){const c=config(target);creator={owner,target,open:false,step:0,busy:false,design:readIconDesign(target==='app'?(c.appIconDraft||c.appIconDesign):(c.notificationDraft||c.notificationDesign))};}
  return creator;
}
function creatorCard(target) {
  const c=creatorFor(target),d=c.design,owner=S.user?.id||'';
  return h`<div class="icon-creator-launch"><button class="btn" data-act="iconCreatorOpen" data-target="${target}" data-owner="${owner}">Créer ${target==='app'?'mon icône':'une icône de notification'}</button></div>
    ${savedIconsCard(target)}
    ${c.open?h`<section class="icon-creator" aria-label="Créateur d’icône"><div class="row between wrapf"><h3>Mon dessin</h3><button class="btn sm ghost" data-act="iconCreatorClose" data-target="${target}" data-owner="${owner}" aria-label="Fermer le créateur">Fermer</button></div>
      <ol class="icon-creator-steps"><li class="${c.step===0?'active':''}">1. Base et sports</li><li class="${c.step===1?'active':''}">2. Style et couleurs</li><li class="${c.step===2?'active':''}">3. Aperçu</li></ol>
      <div class="icon-live-preview"><canvas width="192" height="192" data-icon-preview="${target}" role="img" aria-label="Aperçu de ton icône"></canvas>${target==='notification'?h`<canvas class="icon-badge-preview" width="192" height="192" data-icon-preview="${target}" data-badge="true" role="img" aria-label="Aperçu du petit repère monochrome"></canvas>`:''}</div>
      ${c.step===0?h`<label>Base du dessin<select data-change="iconDesign" name="base" data-target="${target}" data-owner="${owner}">${ICON_BASES.map(([id,label])=>h`<option value="${id}" ${d.base===id?'selected':''}>${label}</option>`)}</select></label>
        <fieldset class="icon-sports"><legend>Sports à représenter</legend><p class="tiny muted">Facultatif · jusqu’à quatre sports pour garder une icône lisible.</p>${ICON_SPORTS.map(([id,label])=>h`<label><input type="checkbox" data-change="iconSport" data-id="${id}" data-target="${target}" data-owner="${owner}" ${d.sports.includes(id)?'checked':''} ${!d.sports.includes(id)&&d.sports.length>=4?'disabled':''}><span>${label}</span></label>`)}</fieldset>
        <details><summary>Partir d’un modèle</summary><div class="icon-preset-options">${ICON_PRESETS.map(x=>h`<button type="button" class="app-icon-choice" data-act="iconPreset" data-id="${x.id}" data-target="${target}" data-owner="${owner}"><canvas width="192" height="192" data-icon-preset="${x.id}" aria-hidden="true"></canvas><span>${x.label}</span><small>${ICON_STYLES.find(s=>s[0]===x.style)?.[1]}</small></button>`)}</div></details>`:c.step===1?h`
        <label>Style<select data-change="iconDesign" name="style" data-target="${target}" data-owner="${owner}">${ICON_STYLES.map(([id,label])=>h`<option value="${id}" ${d.style===id?'selected':''}>${label}</option>`)}</select></label>
        <label>Palette<select data-change="iconDesign" name="palette" data-target="${target}" data-owner="${owner}">${ICON_PALETTES.map(([id,label])=>h`<option value="${id}" ${d.palette===id?'selected':''}>${label}</option>`)}</select></label>
        <div class="icon-custom-colors"><label>Fond<input type="color" data-change="iconDesign" name="background" data-target="${target}" data-owner="${owner}" value="${d.background}"></label><label>Symbole<input type="color" data-change="iconDesign" name="foreground" data-target="${target}" data-owner="${owner}" value="${d.foreground}"></label></div>`:h`
        <p class="small">${ICON_BASES.find(x=>x[0]===d.base)?.[1]} · ${ICON_STYLES.find(x=>x[0]===d.style)?.[1]}${d.sports.length?' · '+d.sports.map(id=>ICON_SPORTS.find(x=>x[0]===id)?.[1]).join(', '):''}</p>
        <p class="small muted">Le dessin sera enregistré pour servir d’icône installable. Les personnes qui ont son lien peuvent voir l’image ; ton profil reste privé.</p>
        <button class="btn pri" data-act="iconCreateSave" data-target="${target}" data-owner="${owner}" ${c.busy||S.user?.guest||iconOffline()?'disabled':''}>${c.busy?'Enregistrement…':S.user?.guest?'Créer un compte pour enregistrer':iconOffline()?'Connexion nécessaire pour enregistrer':'Enregistrer et choisir cette icône'}</button>`}
      <div class="row between wrapf icon-creator-nav"><button class="btn" data-act="iconCreatorStep" data-step="-1" data-target="${target}" data-owner="${owner}" ${c.step===0||c.busy?'disabled':''}>Précédent</button>${c.step<2?h`<button class="btn pri" data-act="iconCreatorStep" data-step="1" data-target="${target}" data-owner="${owner}" ${c.busy?'disabled':''}>Suivant</button>`:''}</div>
      <p class="tiny muted">Ton brouillon suit ton compte. Tu peux dessiner et voir l’aperçu hors ligne ; l’enregistrement de l’icône installable demande une connexion.</p></section>`:''}`;
}
function ownControl(el) {return S.user&&S.loaded&&el.dataset.owner===S.user.id&&['app','notification'].includes(el.dataset.target);}
function saveDraft(c) {
  const id=c.target==='app'?'app-icon':'notification-icon',key=c.target==='app'?'appIconDraft':'notificationDraft';
  putItem('config',id,{...config(c.target),[key]:JSON.stringify(c.design)});
}
ACT.iconCreatorOpen=el=>{if(!ownControl(el))return;const c=creatorFor(el.dataset.target);c.open=true;if(c.target==='app')panelOpen=true;else notificationOpen=true;render();};
ACT.iconCreatorClose=el=>{if(!ownControl(el))return;creatorFor(el.dataset.target).open=false;render();};
ACT.iconCreatorStep=el=>{if(!ownControl(el))return;const c=creatorFor(el.dataset.target);if(c.busy)return;c.step=Math.max(0,Math.min(2,c.step+Number(el.dataset.step)));render();};
ACT.iconPreset=el=>{if(!ownControl(el))return;const c=creatorFor(el.dataset.target);if(c.busy)return;c.design=presetIconDesign(el.dataset.id);saveDraft(c);render();};
CHG.iconDesign=el=>{
  if(!ownControl(el))return;const c=creatorFor(el.dataset.target);if(c.busy||!['base','style','palette','background','foreground'].includes(el.name))return;
  if(el.name==='palette'){const p=ICON_PALETTES.find(x=>x[0]===el.value);if(!p)return;c.design={...c.design,palette:p[0],background:p[2],foreground:p[3]};}else c.design={...c.design,[el.name]:el.value};
  c.design=normalizeIconDesign(c.design);saveDraft(c);render();
};
CHG.iconSport=el=>{if(!ownControl(el))return;const c=creatorFor(el.dataset.target);if(c.busy)return;const sports=new Set(c.design.sports);if(el.checked)sports.add(el.dataset.id);else sports.delete(el.dataset.id);c.design=normalizeIconDesign({...c.design,sports:[...sports]});saveDraft(c);render();};
ACT.notificationIconSet=el=>{
  const id=el.dataset.id;if(!S.user||!S.loaded||el.dataset.owner!==S.user.id||(!validAppIcon(id)&&id!=='app'&&!(id==='custom'&&customAppIcon(config('notification').notificationToken))))return;
  putItem('config','notification-icon',{...config('notification'),notificationIcon:id});notificationOpen=true;render();document.querySelector(`[data-act="notificationIconSet"][data-id="${id}"]`)?.focus({preventScroll:true});toast('Icône des notifications choisie.');
};
function iconLibrary(){if(!collection||collection.owner!==S.user?.id)collection={owner:S.user?.id,icons:[],uploads:[],open:new Set(),loaded:false,loading:false,error:'',request:0};return collection;}
async function loadIconLibrary(force=false){
  const store=iconLibrary();if(!S.user||S.user.guest||iconOffline()||(!force&&(store.loaded||store.loading)))return;
  const request=++store.request;store.loading=true;store.error='';render();
  try{const result=await api('GET','/api/app-icons');if(S.user?.id!==store.owner||collection!==store||request!==store.request)return;store.icons=(result.icons||[]).filter(x=>customAppIcon(x.token)).slice(0,24);store.uploads=(result.uploads||[]).filter(x=>customAppIcon(x.uploadToken)).slice(0,2);store.loaded=true;}
  catch(e){if(S.user?.id===store.owner&&collection===store&&request===store.request)store.error=e.message||'Créations indisponibles.';}
  finally{if(S.user?.id===store.owner&&collection===store&&request===store.request){store.loading=false;render();}}
}
const selectedTokens=()=>[currentAppIcon().token,currentNotificationIcon().token,installChoice()?.token].filter(Boolean);
function savedIconsCard(target){
  const store=iconLibrary(),owner=S.user?.id||'',used=selectedTokens();
  return h`<details class="icon-saved-collection" data-icon-library-target="${target}" ${store.open.has(target)?'open':''}><summary>Mes créations</summary>
    <p class="tiny muted">Réutilise un dessin ou supprime les créations inutilisées. Les icônes actuellement choisies restent protégées.</p>
    ${store.loading?h`<p class="small">Chargement…</p>`:store.error?h`<p class="small">${store.error}</p>`:iconOffline()&&!store.loaded?h`<p class="small">Connecte-toi pour retrouver les autres créations enregistrées.</p>`:store.loaded&&!store.icons.length?h`<p class="small muted">Aucune création enregistrée pour le moment.</p>`:''}
    <div class="icon-saved-grid">${store.icons.map(x=>h`<div class="icon-saved-item"><img src="${customAppIcon(x.token).icon}" width="72" height="72" alt="Création personnelle"><button class="btn sm" data-act="iconSavedUse" data-token="${x.token}" data-target="${target}" data-owner="${owner}">Utiliser</button><button class="btn sm ghost" data-act="iconSavedDelete" data-token="${x.token}" data-target="${target}" data-owner="${owner}" ${used.includes(x.token)?'disabled':''}>${used.includes(x.token)?'Choisie':'Supprimer'}</button></div>`)}</div>
    ${store.uploads.map(x=>h`<div class="card mini"><p class="small">Un envoi n’a pas été terminé.</p><button class="btn sm" data-act="iconUploadAbort" data-token="${x.uploadToken}" data-target="${target}" data-owner="${owner}">Abandonner cet envoi</button></div>`)}
    <button class="btn sm ghost" data-act="iconLibraryRefresh" data-target="${target}" data-owner="${owner}" ${store.loading||iconOffline()||S.user?.guest?'disabled':''}>Actualiser mes créations</button></details>`;
}
ACT.iconLibraryRefresh=el=>{if(ownControl(el))void loadIconLibrary(true);};
ACT.iconSavedUse=el=>{
  if(!ownControl(el)||!iconLibrary().icons.some(x=>x.token===el.dataset.token))return;const selected=customAppIcon(el.dataset.token);if(!selected)return;
  if(el.dataset.target==='app'){putItem('config','app-icon',{...config('app'),appIcon:'custom',appIconToken:selected.token});panelOpen=true;const url=new URL(location.href);if(url.searchParams.has('appIcon')){url.searchParams.set('appIcon','custom');url.searchParams.set('appIconToken',selected.token);history.replaceState(null,'',url.pathname+url.search+url.hash);}}
  else{putItem('config','notification-icon',{...config('notification'),notificationIcon:'custom',notificationToken:selected.token});notificationOpen=true;}
  render();void cacheCustomIcon(selected);toast('Création choisie.');
};
ACT.iconSavedDelete=async el=>{
  if(!ownControl(el)||selectedTokens().includes(el.dataset.token)||!iconLibrary().icons.some(x=>x.token===el.dataset.token))return;
  const store=iconLibrary(),token=el.dataset.token;
  if(!await ask('Supprimer cette création ?',{ok:'Supprimer',danger:true,detail:'Ses liens d’installation ne fonctionneront plus. Garde-la si elle sert encore à une app installée.'}))return;
  if(!ownControl(el)||collection!==store||selectedTokens().includes(token))return;
  try{await api('DELETE','/api/app-icons/'+token);if(!ownControl(el)||collection!==store)return;for(const target of ['app','notification']){const c=config(target),key=target==='app'?'appIconToken':'notificationToken';if(c[key]===token)putItem('config',target==='app'?'app-icon':'notification-icon',{...c,[key]:''});}store.icons=store.icons.filter(x=>x.token!==token);cachedTokens.delete(token);render();toast('Création supprimée.');}
  catch(e){if(ownControl(el)&&collection===store)toast(e.message||'Suppression indisponible.',5000,'bad');}
};
ACT.iconUploadAbort=async el=>{
  if(!ownControl(el)||!iconLibrary().uploads.some(x=>x.uploadToken===el.dataset.token))return;const store=iconLibrary();
  try{await api('DELETE','/api/app-icons/uploads/'+el.dataset.token);if(!ownControl(el)||collection!==store)return;store.uploads=store.uploads.filter(x=>x.uploadToken!==el.dataset.token);if(creator?.uploadToken===el.dataset.token){creator.uploadToken=null;creator.uploadOpId=null;}render();toast('Envoi abandonné. Ton brouillon est conservé.');}catch(e){if(ownControl(el)&&collection===store)toast(e.message||'Envoi indisponible.',5000,'bad');}
};
ACT.iconCreateSave=async el=>{
  if(!ownControl(el)||S.user.guest||iconOffline())return;
  const c=creatorFor(el.dataset.target);if(c.busy)return;const owner=S.user.id;c.busy=true;render();
  try{
    const images=await iconPngBundle(c.design);if(S.user?.id!==owner||creator!==c)return;
    if(!c.uploadToken){c.uploadOpId ||= 'op-icon-'+crypto.randomUUID();const started=await api('POST','/api/app-icons/start',{},{opId:c.uploadOpId});if(S.user?.id!==owner||creator!==c)return;c.uploadToken=started.uploadToken;}
    if(!/^[A-Za-z0-9_-]{43}$/.test(c.uploadToken||''))throw new Error('L’icône n’a pas pu être enregistrée.');
    const designHash=JSON.stringify(c.design);let response;
    try{
      for(const [name,image] of Object.entries(images)){await api('PUT','/api/app-icons/'+c.uploadToken+'/'+name,{image});if(S.user?.id!==owner||creator!==c)return;}
      c.uploadDesign=designHash;
    }catch(e){
      if(S.user?.id!==owner||creator!==c)return;
      if(e.status!==409)throw e;
      if(c.uploadDesign!==designHash){await api('DELETE','/api/app-icons/uploads/'+c.uploadToken);if(S.user?.id!==owner||creator!==c)return;c.uploadToken=null;c.uploadOpId=null;throw new Error('L’envoi précédent est terminé. Relance l’enregistrement de ton nouveau dessin.');}
      response=await api('POST','/api/app-icons/'+c.uploadToken+'/complete',{});
    }
    if(!response)response=await api('POST','/api/app-icons/'+c.uploadToken+'/complete',{});
    if(S.user?.id!==owner||creator!==c)return;
    c.uploadToken=null;
    c.uploadOpId=null;
    const selected=customAppIcon(response.token);if(!selected)throw new Error('L’icône n’a pas pu être enregistrée.');
    const data=config(c.target),design=JSON.stringify(c.design);
    if(c.target==='app'){
      putItem('config','app-icon',{...data,appIcon:'custom',appIconToken:selected.token,appIconDesign:design,appIconDraft:design});
      const url=new URL(location.href);if(url.searchParams.has('appIcon')){url.searchParams.set('appIcon','custom');url.searchParams.set('appIconToken',selected.token);history.replaceState(null,'',url.pathname+url.search+url.hash);}
    }else putItem('config','notification-icon',{...data,notificationIcon:'custom',notificationToken:selected.token,notificationDesign:design,notificationDraft:design});
    await cacheCustomIcon(selected);
    if(S.user?.id!==owner||creator!==c)return;
    void loadIconLibrary(true);
    toast(c.target==='app'?'Icône enregistrée. Ouvre la page d’installation pour l’utiliser sur ton téléphone.':'Icône de notification enregistrée.');
  }catch(e){if(S.user?.id===owner&&creator===c){if([404,409].includes(e.status)){c.uploadToken=null;c.uploadOpId=null;}toast(e.message||'L’icône n’a pas pu être enregistrée.',5000,'bad');}}
  finally{if(S.user?.id===owner&&creator===c){c.busy=false;render();}}
};
ACT.appIconSet = (el) => {
  const id = el.dataset.id;
  if (!S.user || !S.loaded || el.dataset.owner !== S.user.id || (!validAppIcon(id)&&!(id==='custom'&&customAppIcon(config('app').appIconToken)))) return;
  putItem('config','app-icon',{...config('app'),appIcon:id});
  const url=new URL(location.href);if(url.searchParams.has('appIcon')){url.searchParams.set('appIcon',id);if(id==='custom')url.searchParams.set('appIconToken',config('app').appIconToken);else url.searchParams.delete('appIconToken');history.replaceState(null,'',url.pathname+url.search+url.hash);}
  panelOpen = true;
  render();document.querySelector(`[data-act="appIconSet"][data-id="${id}"]`)?.focus({ preventScroll: true });
  toast('Icône choisie. Pour une app déjà installée, suis les étapes de réinstallation.',4000);
};
if (typeof document !== 'undefined') document.addEventListener('keydown', (event) => {
  const button = event.target.closest?.('[data-act="appIconSet"],[data-act="notificationIconSet"]');
  if (!button || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
  const choices = [...button.closest('.app-icon-options').querySelectorAll('[role="radio"]')];
  const offset = ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1, at = choices.indexOf(button);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (at + offset + choices.length) % choices.length;
  event.preventDefault(); choices[next].click();
});
if (typeof document !== 'undefined') document.addEventListener('focusin', (event) => {
  focusedIcon=event.target.matches?.('[data-act="appIconSet"],[data-act="notificationIconSet"]')?{action:event.target.dataset.act,id:event.target.dataset.id}:null;
});
