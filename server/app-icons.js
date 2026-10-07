// Icônes personnelles : images seules, URLs opaques et immuables ; aucun profil n'est publié.
export const APP_ICON_LIMITS = Object.freeze({ imageBytes: 300000, bundleBytes: 750000, bodyBytes: 1100000, partBodyBytes: 401000, bundles: 24, accountBytes: 8000000, uploads: 2, uploadTtl: 1800000 });
export const CUSTOM_ICON_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BUILTINS = new Set(['seances','gold','slate','white','forest','ocean','climb','route','rope','mono','terra']);
const FILES = { '192.png': ['icon192',192], '512.png': ['icon512',512], '180.png': ['apple180',180], 'maskable-512.png': ['maskable512',512], 'badge-96.png': ['badge96',96] };
const KEYS = Object.values(FILES).map(([key]) => key);
const q = (env,sql,...args) => env.DB.prepare(sql).bind(...args);
const error = (message,status=400) => Object.assign(new Error(message),{status});
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const crcTable = Uint32Array.from({length:256},(_,n) => { let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0; });
const base64Values=new Uint8Array(128);for(const [index,char] of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].entries())base64Values[char.charCodeAt(0)]=index;
function crc(bytes) { let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0; }
const same = (a,b) => a.length===b.length && a.every((value,index)=>value===b[index]);
const text = (bytes) => String.fromCharCode(...bytes);
const join = (parts) => { const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out; };
const blobBytes = (value) => Array.isArray(value)?Uint8Array.from(value):value instanceof ArrayBuffer?new Uint8Array(value):value;
const contentHash = async (parts) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',join(parts)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const paeth = (a,b,c) => { const p=a+b-c,A=Math.abs(p-a),B=Math.abs(p-b),C=Math.abs(p-c);return A<=B&&A<=C?a:B<=C?b:c; };

async function inflateBounded(bytes,expected) {
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),parts=[];let length=0;
  try {
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>expected){await reader.cancel();throw error('Image PNG décompressée trop volumineuse.');}parts.push(next.value);}
  } catch(e) { if(e?.status)throw e;throw error('Compression PNG invalide.'); }
  if(length!==expected)throw error('Contenu PNG incomplet.');
  return join(parts);
}

/** Vérifie le PNG réel, enlève ses métadonnées et contrôle le badge blanc transparent. */
export async function validateIconPng(value,size,{badge=false}={}) {
  const prefix='data:image/png;base64,';
  if(typeof value!=='string'||!value.startsWith(prefix)||value.length>prefix.length+Math.ceil(APP_ICON_LIMITS.imageBytes/3)*4)throw error('Image PNG manquante ou trop volumineuse.');
  const encoded=value.slice(prefix.length);
  if(!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw error('Encodage PNG invalide.');
  const length=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  if(length>APP_ICON_LIMITS.imageBytes)throw error('Image PNG trop volumineuse.',413);
  const bytes=new Uint8Array(length);let at=0;
  // Décode directement sans créer une chaîne binaire et un callback par octet.
  for(let i=0;i<encoded.length;i+=4){const n=base64Values[encoded.charCodeAt(i)]<<18|base64Values[encoded.charCodeAt(i+1)]<<12|base64Values[encoded.charCodeAt(i+2)]<<6|base64Values[encoded.charCodeAt(i+3)];bytes[at++]=n>>>16;if(at<length)bytes[at++]=n>>>8;if(at<length)bytes[at++]=n;}
  if(!same(bytes.subarray(0,8),Uint8Array.of(137,80,78,71,13,10,26,10)))throw error('Format PNG invalide.');
  const view=new DataView(bytes.buffer),kept=[bytes.subarray(0,8)],compressed=[];let offset=8,channels=0,ended=false,afterData=false;
  while(offset<bytes.length){
    if(offset+12>bytes.length)throw error('PNG incomplet.');
    const length=view.getUint32(offset),end=offset+length+12;if(end>bytes.length)throw error('PNG incomplet.');
    const type=text(bytes.subarray(offset+4,offset+8)),body=bytes.subarray(offset+8,end-4);
    if(!/^[A-Za-z]{4}$/.test(type)||crc(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))throw error('Intégrité PNG invalide.');
    if(offset===8 && type!=='IHDR')throw error('En-tête PNG manquant.');
    if(type==='IHDR'){
      if(offset!==8||length!==13||view.getUint32(offset+8)!==size||view.getUint32(offset+12)!==size||body[8]!==8||![2,6].includes(body[9])||body[10]||body[11]||body[12])throw error('Dimensions ou format PNG non acceptés.');
      channels=body[9]===6?4:3;if(badge&&channels!==4)throw error('Le badge doit être transparent.');kept.push(bytes.subarray(offset,end));
    }else if(type==='IDAT'){
      if(afterData||!length)throw error('Données PNG invalides.');compressed.push(body);kept.push(bytes.subarray(offset,end));
    }else if(type==='IEND'){
      if(length||!compressed.length||end!==bytes.length)throw error('Fin PNG invalide.');kept.push(bytes.subarray(offset,end));ended=true;
    }else{
      if(type[0]===type[0].toUpperCase())throw error('Format PNG non accepté.');if(compressed.length)afterData=true;
    }
    offset=end;
  }
  if(!ended)throw error('PNG incomplet.');
  const stride=size*channels,raw=await inflateBounded(join(compressed),size*(stride+1)),pixels=badge?new Uint8Array(size*stride):null;let transparent=false,visible=false;
  for(let y=0;y<size;y++){
    const scan=y*(stride+1),start=y*stride,filter=raw[scan];if(filter>4)throw error('Filtre PNG invalide.');
    if(channels===3)continue;
    if(!badge){
      // Les voisins alpha déjà validés valent tous 255 : leur prédicteur PNG est connu.
      // Inutile de décoder les canaux RGB ni d'allouer une deuxième image 512×512.
      const first=filter<2?255:filter===3?(y?128:255):(y?0:255);
      const rest=filter===0?255:filter===1||filter===4?0:filter===2?(y?0:255):(y?0:128);
      if(raw[scan+4]!==first)throw error('Les icônes doivent être opaques.');
      for(let at=scan+8;at<scan+1+stride;at+=4)if(raw[at]!==rest)throw error('Les icônes doivent être opaques.');
      continue;
    }
    if(filter===0)pixels.set(raw.subarray(scan+1,scan+1+stride),start);
    else for(let x=0;x<stride;x++){
      const at=start+x;let predictor;
      if(filter===1)predictor=x>=channels?pixels[at-channels]:0;
      else if(filter===2)predictor=y?pixels[at-stride]:0;
      else{
        const a=x>=channels?pixels[at-channels]:0,b=y?pixels[at-stride]:0;
        predictor=filter===3?Math.floor((a+b)/2):paeth(a,b,y&&x>=channels?pixels[at-stride-channels]:0);
      }
      pixels[at]=(raw[scan+x+1]+predictor)&255;
    }
    for(let at=start;at<start+stride;at+=4){if(pixels[at+3]===0)transparent=true;else{visible=true;if(pixels[at]!==255||pixels[at+1]!==255||pixels[at+2]!==255)throw error('Le badge doit être blanc et monochrome.');}}
  }
  if(badge&&(!transparent||!visible))throw error('Le badge doit contenir un dessin et un fond transparent.');
  return join(kept);
}

export function customAppIconUrls(token) {
  if(!CUSTOM_ICON_TOKEN.test(token||''))return null;
  const path='/app-icons-custom/'+token+'/';
  return {token,icon:path+'192.png',large:path+'512.png',apple:path+'180.png',maskable:path+'maskable-512.png',badge:path+'badge-96.png',manifest:path+'manifest.json'};
}
export async function existingCustomAppIconUrls(env,token) {
  if(!env.DB||!CUSTOM_ICON_TOKEN.test(token||''))return null;
  return await q(env,'SELECT token FROM custom_app_icons WHERE token=?',token).first()?customAppIconUrls(token):null;
}
export async function listCustomAppIcons(env,userId) {
  const rows=(await q(env,'SELECT token,created_at FROM custom_app_icons WHERE user_id=? ORDER BY created_at DESC,token LIMIT ?',userId,APP_ICON_LIMITS.bundles).all()).results||[];
  const uploads=(await q(env,"SELECT upload_token,expires_at FROM custom_icon_uploads WHERE user_id=? AND completed_token='' AND expires_at>? ORDER BY created_at DESC LIMIT ?",userId,Date.now(),APP_ICON_LIMITS.uploads).all()).results||[];
  return {icons:rows.map(row=>({...customAppIconUrls(row.token),createdAt:row.created_at})),uploads:uploads.map(row=>({uploadToken:row.upload_token,expiresAt:row.expires_at}))};
}
function newToken(){return btoa(text(crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}

/** Chaque PNG est validé dans sa propre requête pour réduire le travail CPU par appel. */
export async function startAppIconUpload(env,userId) {
  const now=Date.now(),token=newToken();
  await q(env,'DELETE FROM custom_icon_uploads WHERE expires_at<=?',now).run();
  const result=await q(env,`INSERT INTO custom_icon_uploads(upload_token,user_id,created_at,expires_at)
    SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM custom_icon_uploads WHERE user_id=? AND completed_token='')<?`,token,userId,now,now+APP_ICON_LIMITS.uploadTtl,userId,APP_ICON_LIMITS.uploads).run();
  if(!result.meta?.changes)throw error('Deux créations sont déjà en cours. Termine ou abandonne une création.',429);
  return {uploadToken:token,expiresAt:now+APP_ICON_LIMITS.uploadTtl};
}
async function uploadRow(env,userId,token,columns='*') {
  if(!CUSTOM_ICON_TOKEN.test(token||''))throw error('Création introuvable ou expirée.',404);
  const row=await q(env,'SELECT '+columns+' FROM custom_icon_uploads WHERE upload_token=? AND user_id=? AND expires_at>?',token,userId,Date.now()).first();
  if(!row)throw error('Création introuvable ou expirée.',404);
  return row;
}
export async function uploadAppIconPart(env,userId,token,key,input) {
  if(!KEYS.includes(key))throw error('Image introuvable.',404);
  const row=await uploadRow(env,userId,token,'completed_token');if(row.completed_token)throw error('Cette création est déjà terminée.',409);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!Object.hasOwn(input,'image'))throw error('Une image PNG est nécessaire.');
  const size=Object.values(FILES).find(([name])=>name===key)[1],image=await validateIconPng(input.image,size,{badge:key==='badge96'});
  const hash=await contentHash([image]);
  const changed=await q(env,`UPDATE custom_icon_uploads SET ${key}=?,byte_size=byte_size-COALESCE(length(${key}),0)+?,revision=revision+1,hashes_json=json_set(hashes_json,?,?)
    WHERE upload_token=? AND user_id=? AND expires_at>? AND completed_token='' AND byte_size-COALESCE(length(${key}),0)+?<=?`,image,image.length,'$.'+key,hash,token,userId,Date.now(),image.length,APP_ICON_LIMITS.bundleBytes).run();
  if(!changed.meta?.changes){const latest=await uploadRow(env,userId,token,'completed_token');if(latest.completed_token)throw error('Cette création est déjà terminée.',409);throw error('Ensemble d’icônes trop volumineux.',413);}
  return {ok:true,part:key};
}
export async function completeAppIconUpload(env,userId,uploadToken) {
  // La finalisation ne recharge jamais les BLOB : chaque PUT a déjà calculé son empreinte.
  const row=await uploadRow(env,userId,uploadToken,'completed_token,revision,byte_size,hashes_json');
  if(row.completed_token){const owned=await q(env,'SELECT token FROM custom_app_icons WHERE token=? AND user_id=?',row.completed_token,userId).first();if(!owned)throw error('Icône introuvable.',404);return customAppIconUrls(owned.token);}
  let hashes;try{hashes=JSON.parse(row.hashes_json);}catch{hashes={};}
  if(KEYS.some(key=>!/^[a-f0-9]{64}$/.test(hashes?.[key]||'')))throw error('Envoie les cinq images avant de terminer.',409);
  const hash=await contentHash([new TextEncoder().encode(KEYS.map(key=>hashes[key]).join(':'))]),token=newToken(),now=Date.now();
  // Le numéro de révision fige les cinq images pendant la publication atomique.
  await env.DB.batch([
    q(env,`INSERT OR IGNORE INTO custom_app_icons(token,user_id,content_hash,byte_size,created_at,icon192,icon512,apple180,maskable512,badge96)
      SELECT ?,user_id,?,byte_size,?,icon192,icon512,apple180,maskable512,badge96 FROM custom_icon_uploads
      WHERE upload_token=? AND user_id=? AND revision=? AND completed_token='' AND expires_at>?
        AND (SELECT COUNT(*) FROM custom_app_icons WHERE user_id=?)<?
        AND (SELECT COALESCE(SUM(byte_size),0) FROM custom_app_icons WHERE user_id=?)+byte_size<=?`,token,hash,now,uploadToken,userId,row.revision,now,userId,APP_ICON_LIMITS.bundles,userId,APP_ICON_LIMITS.accountBytes),
    q(env,`UPDATE custom_icon_uploads SET completed_token=(SELECT token FROM custom_app_icons WHERE user_id=? AND content_hash=?),
      icon192=NULL,icon512=NULL,apple180=NULL,maskable512=NULL,badge96=NULL,byte_size=0
      WHERE upload_token=? AND user_id=? AND revision=? AND completed_token='' AND expires_at>?
        AND EXISTS(SELECT 1 FROM custom_app_icons WHERE user_id=? AND content_hash=?)`,userId,hash,uploadToken,userId,row.revision,now,userId,hash),
  ]);
  const result=await uploadRow(env,userId,uploadToken,'completed_token,revision');
  if(result.completed_token)return customAppIconUrls(result.completed_token);
  if(result.revision!==row.revision)throw error('Le dessin a changé pendant l’envoi. Réessaie.',409);
  throw error('Limite d’icônes personnelles atteinte. Supprime une ancienne icône inutilisée.',429);
}
export async function abortAppIconUpload(env,userId,token) {
  if(!CUSTOM_ICON_TOKEN.test(token||''))throw error('Création introuvable.',404);
  const result=await q(env,'DELETE FROM custom_icon_uploads WHERE upload_token=? AND user_id=?',token,userId).run();
  if(!result.meta?.changes)throw error('Création introuvable.',404);
  return {ok:true};
}

export async function deleteCustomAppIcon(env,userId,token) {
  if(!CUSTOM_ICON_TOKEN.test(token||''))throw error('Icône introuvable.',404);
  if(!await q(env,'SELECT token FROM custom_app_icons WHERE token=? AND user_id=?',token,userId).first())throw error('Icône introuvable.',404);
  const used=await q(env,`SELECT 1 AS used FROM user_items WHERE user_id=? AND collection='config' AND deleted=0 AND
    ((json_extract(data_json,'$.appIcon')='custom' AND json_extract(data_json,'$.appIconToken')=?) OR
     (json_extract(data_json,'$.notificationIcon')='custom' AND json_extract(data_json,'$.notificationToken')=?)) LIMIT 1`,userId,token,token).first();
  if(used)throw error('Choisis une autre icône avant de supprimer celle-ci.',409);
  const removed=await q(env,`DELETE FROM custom_app_icons WHERE token=? AND user_id=? AND NOT EXISTS
    (SELECT 1 FROM user_items WHERE user_id=? AND collection='config' AND deleted=0 AND
      ((json_extract(data_json,'$.appIcon')='custom' AND json_extract(data_json,'$.appIconToken')=?) OR
       (json_extract(data_json,'$.notificationIcon')='custom' AND json_extract(data_json,'$.notificationToken')=?)))`,token,userId,userId,token,token).run();
  if(!removed.meta?.changes){if(await q(env,'SELECT token FROM custom_app_icons WHERE token=? AND user_id=?',token,userId).first())throw error('Choisis une autre icône avant de supprimer celle-ci.',409);throw error('Icône introuvable.',404);}
  return {ok:true};
}

export async function customAppIconsRoute(request,env) {
  const match=new URL(request.url).pathname.match(/^\/app-icons-custom\/([A-Za-z0-9_-]{43})\/(192\.png|512\.png|180\.png|maskable-512\.png|badge-96\.png|manifest\.json)$/);
  if(!match)return new Response('Introuvable',{status:404,headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return new Response('Méthode non autorisée',{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  const [,,file]=match,urls=customAppIconUrls(match[1]),key=FILES[file]?.[0];
  const row=await q(env,'SELECT '+(key||'token')+' FROM custom_app_icons WHERE token=?',match[1]).first();
  if(!row)return new Response('Introuvable',{status:404,headers:{'Cache-Control':'no-store'}});
  const headers={'Content-Type':key?'image/png':'application/manifest+json; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'};
  // D1 sérialise ses BLOB en tableaux numériques ; SQLite local expose des TypedArray.
  let body=key?blobBytes(row[key]):null;
  if(!key){
    const shortcuts=[['Séance du jour','/?do=gen#/home/dash'],['Forme du jour','/?do=checkin#/home/dash'],['Minuteur','/?do=timer#/home/dash'],['Carnet d’escalade','/#/profile/climbing'],['Calendrier','/#/home/cal']];
    body=JSON.stringify({name:'Séances entraînement',short_name:'Séances',lang:'fr',id:'/',start_url:'/#/home/dash',scope:'/',display:'standalone',orientation:'portrait',background_color:'#182D3B',theme_color:'#182D3B',categories:['sports','health','fitness'],icons:[{src:urls.icon,sizes:'192x192',type:'image/png',purpose:'any'},{src:urls.large,sizes:'512x512',type:'image/png',purpose:'any'},{src:urls.maskable,sizes:'512x512',type:'image/png',purpose:'maskable'}],shortcuts:shortcuts.map(([name,url])=>({name,url,icons:[{src:urls.icon,sizes:'192x192',type:'image/png'}]}))});
  }
  return new Response(request.method==='HEAD'?null:body,{headers});
}

/** Résout uniquement une préférence appartenant au destinataire ; jamais un token d'un autre compte. */
export async function resolveAppIconSelection(env,userId,{kind='app'}={}) {
  const fallback={id:'seances',icon:'/app-icon-seances-v1-192.png',large:'/app-icon-seances-v1-512.png',apple:'/app-icon-seances-v1-180.png',maskable:'/app-icon-seances-v1-maskable-512.png',badge:'/app-icon-seances-v1-badge-96.png',manifest:'/manifest-icons-seances-v1.json'};
  if(!userId||!env.DB)return fallback;
  const row=await q(env,"SELECT data_json FROM user_items WHERE user_id=? AND collection='config' AND id=? AND deleted=0",userId,kind==='notification'?'notification-icon':'app-icon').first();
  let preference;try{preference=JSON.parse(row?.data_json||'{}');}catch{return fallback;}
  if(!preference||typeof preference!=='object'||Array.isArray(preference))return fallback;
  if(kind==='notification'&&(!preference.notificationIcon||preference.notificationIcon==='app'))return resolveAppIconSelection(env,userId);
  const id=kind==='notification'?preference.notificationIcon:preference.appIcon,token=kind==='notification'?preference.notificationToken:preference.appIconToken;
  if(id==='custom'&&CUSTOM_ICON_TOKEN.test(token||'')){
    const owned=await q(env,'SELECT token FROM custom_app_icons WHERE token=? AND user_id=?',token,userId).first();
    if(owned)return {id:'custom',...customAppIconUrls(owned.token)};
  }
  if(!BUILTINS.has(id))return fallback;
  return {id,icon:'/app-icon-'+id+'-v1-192.png',large:'/app-icon-'+id+'-v1-512.png',apple:'/app-icon-'+id+'-v1-180.png',maskable:'/app-icon-'+id+'-v1-maskable-512.png',badge:'/app-icon-'+id+'-v1-badge-96.png',manifest:'/manifest-icons-'+id+'-v1.json'};
}

export function appIconApiError(e){return json({ok:false,error:e?.status===413?'Données trop volumineuses.':e?.status?e.message:'Icône indisponible. Réessaie.'},e?.status||500);}
