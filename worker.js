
const SESSION_DAYS=60, PBKDF2_ITERATIONS=100000, MAX_JSON=500000;
export default {async fetch(request,env){const url=new URL(request.url);try{
  if(url.pathname.startsWith('/api/')){
    if(!env.DB)return json({ok:false,error:'Base D1 non configurée.'},500);
    if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&!sameOrigin(request,url))return json({ok:false,error:'Origine non autorisée.'},403);
    return await route(request,env,url.pathname);
  }
  return env.ASSETS.fetch(request);
}catch(e){console.error(e);return json({ok:false,error:'Erreur serveur.'},500)}}};

async function route(r,e,p){
 if(p==='/api/auth/register'&&r.method==='POST')return register(r,e);
 if(p==='/api/auth/login'&&r.method==='POST')return login(r,e);
 if(p==='/api/auth/logout'&&r.method==='POST')return logout(r,e);
 if(p==='/api/auth/me'&&r.method==='GET')return me(r,e);
 if(p==='/api/auth/password'&&r.method==='POST')return changePassword(r,e);
 if(p==='/api/auth/delete'&&r.method==='POST')return deleteAccount(r,e);
 const u=await getUser(r,e); if(!u)return json({ok:false,error:'Connexion requise.'},401);
 if(p==='/api/data'&&r.method==='GET')return dataGet(u,e);
 if(p==='/api/data'&&r.method==='POST')return dataPost(r,u,e);
 if(p==='/api/settings'&&r.method==='GET')return settingsGet(u,e);
 if(p==='/api/settings'&&r.method==='POST')return settingsPost(r,u,e);
 if(p==='/api/calendar'&&r.method==='GET')return calendarGet(r,u,e);
 if(p==='/api/calendar'&&r.method==='POST')return calendarPost(r,u,e);
 if(p.startsWith('/api/calendar/')&&r.method==='DELETE')return calendarDelete(p,u,e);
 if(p==='/api/history'&&r.method==='GET')return historyGet(u,e);
 if(p==='/api/history'&&r.method==='POST')return historyPost(r,u,e);
 if(p==='/api/exercises'&&r.method==='GET')return exercisesGet(u,e);
 if(p==='/api/exercises/common'&&r.method==='POST')return commonAdd(r,u,e);
 if(p.startsWith('/api/exercises/common/')&&r.method==='PUT')return commonEdit(r,e,p.split('/').pop());
 if(p.startsWith('/api/exercises/common/')&&r.method==='DELETE')return commonDelete(r,e,p.split('/').pop());
 if(p==='/api/exercises/personal'&&r.method==='POST')return personalAdd(r,u,e);
 if(p.startsWith('/api/exercises/personal/')&&r.method==='PUT')return personalEdit(r,u,e,p.split('/').pop());
 if(p.startsWith('/api/exercises/personal/')&&r.method==='DELETE')return personalDelete(r,u,e,p.split('/').pop());
 if(p==='/api/profile'&&r.method==='GET')return profileGet(u,e);
 if(p==='/api/profile'&&r.method==='POST')return profilePost(r,u,e);
 if(p.startsWith('/api/profile/public/')&&r.method==='GET')return publicProfile(p,e);
 if(p==='/api/follows'&&r.method==='GET')return followsGet(u,e);
 if(p==='/api/follows'&&r.method==='POST')return followPost(r,u,e);
 if(p.startsWith('/api/follows/')&&r.method==='DELETE')return followDelete(p,u,e);
 if(p==='/api/feed'&&r.method==='GET')return feedGet(u,e);
 if(p==='/api/metrics'&&r.method==='GET')return metricsGet(u,e);
 if(p==='/api/metrics'&&r.method==='POST')return metricsPost(r,u,e);
 if(p==='/api/edit-status'&&r.method==='GET')return editStatus(r,e);
 if(p==='/api/unlock-edit'&&r.method==='POST')return unlockEdit(r,e);
 if(p==='/api/lock-edit'&&r.method==='POST')return lockEdit(r,e);
 return json({ok:false,error:'Route introuvable.'},404);
}
function sameOrigin(r,u){const o=r.headers.get('Origin');return !o||o===u.origin}
function json(x,s=200,extra={}){return new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}})}
function cookies(r){const out={},raw=r.headers.get('Cookie')||'';for(const p of raw.split(';')){const i=p.indexOf('=');if(i>0){try{out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1))}catch{}}}return out}
function setCookie(n,v,max){return `${n}=${encodeURIComponent(v)}; Path=/; Max-Age=${max}; HttpOnly; Secure; SameSite=Lax`}
function id(){return crypto.randomUUID()}
function b64(a){let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function bytes(s){s=s.replaceAll('-','+').replaceAll('_','/');while(s.length%4)s+='=';const x=atob(s);return Uint8Array.from(x,c=>c.charCodeAt(0))}
async function sha(t){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))))}
async function passHash(p,s){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return b64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(s),iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},k,256)))}
async function newPass(p){const s=b64(crypto.getRandomValues(new Uint8Array(16)));return{s,h:await passHash(p,s)}}
async function session(uid,e){const raw=b64(crypto.getRandomValues(new Uint8Array(32))),now=Date.now();await e.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(id(),uid,await sha(raw),now+SESSION_DAYS*86400000,now).run();return raw}
async function getUser(r,e){const t=cookies(r).session;if(!t)return null;const u=await e.DB.prepare('SELECT u.id,u.username,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(t),Date.now()).first();return u||null}
async function body(r){const t=await r.text();if(t.length>MAX_JSON)throw Error('Données trop volumineuses.');try{return JSON.parse(t)}catch{return null}}
async function register(r,e){
 const b=await body(r);if(!b)return json({ok:false,error:'Données invalides.'},400);
 const username=String(b.username||'').trim(),email=String(b.email||'').trim().toLowerCase()||null,p=String(b.password||'');
 if(!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username))return json({ok:false,error:'Pseudo : 3 à 24 caractères.'},400);
 if(p.length<8)return json({ok:false,error:'Mot de passe : 8 caractères minimum.'},400);
 const key='reg:'+clientIp(r);if(await rlBlocked(e,key,5,3600000))return json({ok:false,error:'Trop de créations de comptes depuis cette connexion.'},429);
 if(await e.DB.prepare('SELECT id FROM users WHERE username=? OR (? IS NOT NULL AND email=?)').bind(username,email,email).first())return json({ok:false,error:'Pseudo ou email déjà utilisé.'},409);
 const {s,h}=await newPass(p),now=Date.now(),uid=id();
 await e.DB.prepare('INSERT INTO users(id,username,email,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(uid,username,email,h,s,now,now).run();
 await e.DB.prepare('INSERT INTO user_data(user_id,seances_json,settings_json,favorites_json,goals_json,updated_at,version) VALUES(?,?,?,?,?,?,?)').bind(uid,'[]',JSON.stringify(defaultSettings()),'[]','{}',now,1).run();
 await e.DB.prepare('INSERT INTO profiles(user_id,display_name,bio,public_profile,share_progress,share_workouts,avatar_emoji,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(uid,username,'',0,0,0,'🧗',now,now).run();
 await migrateLegacyForFirstUser(uid,e); await rlHit(e,key,3600000); await seed(e);
 return json({ok:true,user:{id:uid,username,email}},200,{'Set-Cookie':setCookie('session',await session(uid,e),SESSION_DAYS*86400)});
}
function defaultSettings(){return {theme:'system',accent:'gold',iconStyle:'rounded',sound:true,vibration:true,defaultRest:45,keepScreen:true}}
function cleanSettings(v){v=v&&typeof v==='object'?v:{};return{theme:['system','light','dark'].includes(v.theme)?v.theme:'system',accent:String(v.accent||'gold').slice(0,24),iconStyle:String(v.iconStyle||'rounded').slice(0,24),sound:v.sound!==false,vibration:v.vibration!==false,defaultRest:Math.min(3600,Math.max(0,Number(v.defaultRest)||45)),keepScreen:v.keepScreen!==false}}
async function login(r,e){
 const rk='login:'+clientIp(r);if(await rlBlocked(e,rk,10,900000))return json({ok:false,error:'Trop d’essais. Réessaie dans quelques minutes.'},429);
 const b=await body(r),ident=String(b?.identifier||'').trim(),p=String(b?.password||'');
 const u=await e.DB.prepare('SELECT * FROM users WHERE username=? OR lower(email)=lower(?) LIMIT 1').bind(ident,ident).first();
 if(!u||await passHash(p,u.password_salt)!==u.password_hash){await rlHit(e,rk,900000);return json({ok:false,error:'Identifiants incorrects.'},401)}
 await rlReset(e,rk);await e.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()).run();
 return json({ok:true,user:{id:u.id,username:u.username,email:u.email}},200,{'Set-Cookie':setCookie('session',await session(u.id,e),SESSION_DAYS*86400)});
}
async function logout(r,e){const t=cookies(r).session;if(t)await e.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(t)).run();return new Response(null,{status:204,headers:{'Set-Cookie':setCookie('session','',0)}})}
async function me(r,e){const u=await getUser(r,e);return u?json({ok:true,user:u}):json({ok:false,user:null},401)}
async function changePassword(r,e){const u=await getUser(r,e),b=await body(r).catch(()=>null);if(!u||!b)return json({ok:false,error:'Connexion requise.'},401);const row=await e.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(u.id).first();if(await passHash(String(b.current||''),row.password_salt)!==row.password_hash)return json({ok:false,error:'Mot de passe actuel incorrect.'},401);if(String(b.next||'').length<8)return json({ok:false,error:'8 caractères minimum.'},400);const {s,h}=await newPass(b.next);await e.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').bind(h,s,Date.now(),u.id).run();await e.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();return json({ok:true},200,{'Set-Cookie':setCookie('session',await session(u.id,e),SESSION_DAYS*86400)})}
async function deleteAccount(r,e){const u=await getUser(r,e),b=await body(r);if(!u)return json({ok:false,error:'Connexion requise.'},401);const row=await e.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(u.id).first();if(!b||!row||await passHash(String(b.password||''),row.password_salt)!==row.password_hash)return json({ok:false,error:'Mot de passe incorrect.'},401);await e.DB.batch([e.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM calendar_events WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM history WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM user_exercises WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM follows WHERE follower_id=? OR followed_id=?').bind(u.id,u.id),e.DB.prepare('DELETE FROM metrics WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM profiles WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM user_data WHERE user_id=?').bind(u.id),e.DB.prepare('DELETE FROM users WHERE id=?').bind(u.id)]);return new Response(null,{status:204,headers:{'Set-Cookie':setCookie('session','',0)}})}
async function dataGet(u,e){const x=await e.DB.prepare('SELECT seances_json,version,updated_at FROM user_data WHERE user_id=?').bind(u.id).first();return json({data:JSON.parse(x?.seances_json||'[]'),version:Number(x?.version||1),updatedAt:Number(x?.updated_at||0)})}
async function dataPost(r,u,e){const b=await body(r);if(!Array.isArray(b?.data))return json({ok:false,error:'Format invalide.'},400);if(JSON.stringify(b.data).length>MAX_JSON)return json({ok:false,error:'Données trop volumineuses.'},413);const row=await e.DB.prepare('SELECT version FROM user_data WHERE user_id=?').bind(u.id).first();const client=Number(b.version||0),server=Number(row?.version||1);if(client&&client!==server)return json({ok:false,error:'conflit',serverVersion:server},409);const nv=server+1;await e.DB.prepare('UPDATE user_data SET seances_json=?,updated_at=?,version=? WHERE user_id=?').bind(JSON.stringify(b.data),Date.now(),nv,u.id).run();return json({ok:true,version:nv})}
async function settingsGet(u,e){const x=await e.DB.prepare('SELECT settings_json FROM user_data WHERE user_id=?').bind(u.id).first();return json(cleanSettings(parseJson(x?.settings_json||'{}',{})))}
async function settingsPost(r,u,e){const b=await body(r);if(!b||typeof b!=='object')return json({ok:false,error:'Format invalide.'},400);const clean=cleanSettings(b);await e.DB.prepare('UPDATE user_data SET settings_json=?,updated_at=? WHERE user_id=?').bind(JSON.stringify(clean),Date.now(),u.id).run();return json({ok:true})}
async function calendarGet(r,u,e){const q=new URL(r.url).searchParams,from=q.get('from'),to=q.get('to');let sql='SELECT id,event_date,session_id,title,completed,recurrence_json FROM calendar_events WHERE user_id=?',a=[u.id];if(from){sql+=' AND event_date>=?';a.push(from)}if(to){sql+=' AND event_date<=?';a.push(to)}sql+=' ORDER BY event_date,id';const x=await e.DB.prepare(sql).bind(...a).all();return json(x.results.map(v=>({...v,completed:!!v.completed,recurrence:v.recurrence_json?parseJson(v.recurrence_json,null):null})))} 
async function calendarPost(r,u,e){const b=await body(r);if(!b||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.date))return json({ok:false,error:'Date invalide.'},400);const title=String(b.title||'').trim().slice(0,160)||'Séance',sessionId=b.sessionId?String(b.sessionId).slice(0,100):null,recurrence=b.recurrence&&typeof b.recurrence==='object'?b.recurrence:null,now=Date.now(),eid=String(b.id||id()).slice(0,100);const existing=await e.DB.prepare('SELECT id FROM calendar_events WHERE id=? AND user_id=?').bind(eid,u.id).first();if(existing){await e.DB.prepare('UPDATE calendar_events SET event_date=?,session_id=?,title=?,completed=?,recurrence_json=?,updated_at=? WHERE id=? AND user_id=?').bind(b.date,sessionId,title,b.completed?1:0,recurrence?JSON.stringify(recurrence):null,now,eid,u.id).run()}else{await e.DB.prepare('INSERT INTO calendar_events(id,user_id,event_date,session_id,title,completed,recurrence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(eid,u.id,b.date,sessionId,title,b.completed?1:0,recurrence?JSON.stringify(recurrence):null,now,now).run()}return json({ok:true,id:eid})}
async function calendarDelete(p,u,e){await e.DB.prepare('DELETE FROM calendar_events WHERE id=? AND user_id=?').bind(p.split('/').pop(),u.id).run();return json({ok:true})}
async function historyGet(u,e){const x=await e.DB.prepare('SELECT * FROM history WHERE user_id=? ORDER BY started_at DESC LIMIT 500').bind(u.id).all();return json(x.results)}
async function historyPost(r,u,e){const b=await body(r);if(!b?.sessionName)return json({ok:false,error:'Séance manquante.'},400);const name=String(b.sessionName).trim().slice(0,160);if(!name)return json({ok:false,error:'Séance manquante.'},400);const duration=Math.max(0,Math.min(86400,Number(b.durationSeconds)||0)),startedAt=Math.max(0,Number(b.startedAt)||Date.now()),data=JSON.stringify(b.data&&typeof b.data==='object'?b.data:{});if(data.length>MAX_JSON)return json({ok:false,error:'Historique trop volumineux.'},413);await e.DB.prepare('INSERT INTO history(id,user_id,session_id,session_name,started_at,duration_seconds,data_json) VALUES(?,?,?,?,?,?,?)').bind(id(),u.id,b.sessionId?String(b.sessionId).slice(0,100):null,name,startedAt,duration,data).run();return json({ok:true})}
function parseJson(v,fallback){try{return JSON.parse(v)}catch{return fallback}}
async function exercisesGet(u,e){const c=await e.DB.prepare('SELECT id,name,data_json FROM common_exercises ORDER BY name').all(),p=await e.DB.prepare('SELECT id,name,data_json FROM user_exercises WHERE user_id=? ORDER BY name').bind(u.id).all();return json({common:c.results.map(x=>({...x,data:parseJson(x.data_json,{})})),personal:p.results.map(x=>({...x,data:parseJson(x.data_json,{})}))})}
async function commonAdd(r,u,e){const rk='common:'+clientIp(r);if(await rlBlocked(e,rk,30,3600000))return json({ok:false,error:'Trop de nouveaux exercices communs depuis cette connexion.'},429);const b=await body(r);if(!b?.name)return json({ok:false,error:'Nom requis.'},400);try{const now=Date.now(),eid=id();await e.DB.prepare('INSERT INTO common_exercises(id,name,data_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(eid,String(b.name).trim(),JSON.stringify(cleanEx(b.data)),u.id,now,now).run();return json({ok:true,id:eid})}catch{return json({ok:false,error:'Cet exercice existe déjà.'},409)}}
async function editOk(r,e){if(!e.EDIT_CODE)return false;const c=cookies(r).edit_auth;return !!c&&safeEq(c,await sha(e.EDIT_CODE))}
async function commonEdit(r,e,eid){if(!await editOk(r,e))return json({ok:false,error:'EDIT_CODE requis.'},403);const b=await body(r);if(!b?.name)return json({ok:false,error:'Nom requis.'},400);try{await e.DB.prepare('UPDATE common_exercises SET name=?,data_json=?,updated_at=? WHERE id=?').bind(String(b.name).trim(),JSON.stringify(cleanEx(b.data)),Date.now(),eid).run()}catch{return json({ok:false,error:'Ce nom existe déjà.'},409)}return json({ok:true})}
async function commonDelete(r,e,eid){if(!await editOk(r,e))return json({ok:false,error:'EDIT_CODE requis.'},403);await e.DB.prepare('DELETE FROM common_exercises WHERE id=?').bind(eid).run();return json({ok:true})}
async function personalAdd(r,u,e){const b=await body(r);if(!b?.name)return json({ok:false,error:'Nom requis.'},400);const eid=id(),now=Date.now();try{await e.DB.prepare('INSERT INTO user_exercises(id,user_id,name,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(eid,u.id,String(b.name).trim(),JSON.stringify(cleanEx(b.data)),now,now).run()}catch{return json({ok:false,error:'Cet exercice existe déjà.'},409)}return json({ok:true,id:eid})}
async function personalEdit(r,u,e,eid){const b=await body(r);if(!b?.name)return json({ok:false,error:'Nom requis.'},400);try{await e.DB.prepare('UPDATE user_exercises SET name=?,data_json=?,updated_at=? WHERE id=? AND user_id=?').bind(String(b.name).trim(),JSON.stringify(cleanEx(b.data)),Date.now(),eid,u.id).run()}catch{return json({ok:false,error:'Ce nom existe déjà.'},409)}return json({ok:true})}
async function personalDelete(r,u,e,eid){await e.DB.prepare('DELETE FROM user_exercises WHERE id=? AND user_id=?').bind(eid,u.id).run();return json({ok:true})}
async function profileGet(u,e){const p=await e.DB.prepare('SELECT * FROM profiles WHERE user_id=?').bind(u.id).first();return json(p||{})}
async function profilePost(r,u,e){const b=await body(r);if(!b)return json({ok:false,error:'Format invalide.'},400);const clean={display_name:String(b.display_name||u.username).slice(0,40),bio:String(b.bio||'').slice(0,300),public_profile:!!b.public_profile,share_progress:!!b.share_progress,share_workouts:!!b.share_workouts,avatar_emoji:String(b.avatar_emoji||'🧗').slice(0,8)};await e.DB.prepare('UPDATE profiles SET display_name=?,bio=?,public_profile=?,share_progress=?,share_workouts=?,avatar_emoji=?,updated_at=? WHERE user_id=?').bind(clean.display_name,clean.bio,clean.public_profile?1:0,clean.share_progress?1:0,clean.share_workouts?1:0,clean.avatar_emoji,Date.now(),u.id).run();return json({ok:true})}
async function publicProfile(p,e){const username=decodeURIComponent(p.split('/').pop());const row=await e.DB.prepare('SELECT u.id AS user_id,u.username,p.display_name,p.bio,p.public_profile,p.share_progress,p.share_workouts,p.avatar_emoji FROM users u JOIN profiles p ON p.user_id=u.id WHERE lower(u.username)=lower(?)').bind(username).first();if(!row||!row.public_profile)return json({ok:false,error:'Profil privé ou introuvable.'},404);let metrics=[];if(row.share_progress){const x=await e.DB.prepare('SELECT metric,value,unit,recorded_at FROM metrics WHERE user_id=? ORDER BY recorded_at DESC LIMIT 100').bind(row.user_id).all();metrics=x.results}return json({profile:row,metrics})}
async function followsGet(u,e){const x=await e.DB.prepare('SELECT f.followed_id,u.username,p.display_name,p.avatar_emoji FROM follows f JOIN users u ON u.id=f.followed_id JOIN profiles p ON p.user_id=u.id WHERE f.follower_id=? ORDER BY p.display_name').bind(u.id).all();return json(x.results)}
async function followPost(r,u,e){const b=await body(r);const target=String(b?.username||'').trim();const v=await e.DB.prepare('SELECT u.id,p.public_profile FROM users u JOIN profiles p ON p.user_id=u.id WHERE lower(u.username)=lower(?)').bind(target).first();if(!v||!v.public_profile)return json({ok:false,error:'Profil introuvable ou privé.'},404);if(v.id===u.id)return json({ok:false,error:'Impossible de se suivre soi-même.'},400);await e.DB.prepare('INSERT OR IGNORE INTO follows(follower_id,followed_id,created_at)').bind(u.id,v.id,Date.now()).run();return json({ok:true})}
async function followDelete(p,u,e){const target=p.split('/').pop();await e.DB.prepare('DELETE FROM follows WHERE follower_id=? AND followed_id=?').bind(u.id,target).run();return json({ok:true})}
async function feedGet(u,e){const x=await e.DB.prepare(`SELECT h.id,h.session_name,h.started_at,h.duration_seconds,u.username,p.display_name,p.avatar_emoji
 FROM history h JOIN follows f ON f.followed_id=h.user_id JOIN users u ON u.id=h.user_id JOIN profiles p ON p.user_id=h.user_id
 WHERE f.follower_id=? AND p.public_profile=1 AND p.share_workouts=1 ORDER BY h.started_at DESC LIMIT 100`).bind(u.id).all();return json(x.results)}
async function metricsGet(u,e){const x=await e.DB.prepare('SELECT id,metric,value,unit,recorded_at,note FROM metrics WHERE user_id=? ORDER BY recorded_at DESC LIMIT 500').bind(u.id).all();return json(x.results)}
async function metricsPost(r,u,e){const b=await body(r);const metric=String(b?.metric||'').slice(0,40),value=Number(b?.value);if(!metric||!Number.isFinite(value))return json({ok:false,error:'Mesure invalide.'},400);await e.DB.prepare('INSERT INTO metrics(id,user_id,metric,value,unit,recorded_at,note) VALUES(?,?,?,?,?,?,?)').bind(id(),u.id,metric,value,String(b.unit||'').slice(0,20),Number(b.recorded_at)||Date.now(),String(b.note||'').slice(0,200)).run();return json({ok:true})}
async function editStatus(r,e){return json({unlocked:await editOk(r,e)})}
async function unlockEdit(r,e){if(!e.EDIT_CODE)return json({ok:false,error:'EDIT_CODE non configuré.'},500);const rk='edit:'+clientIp(r);if(await rlBlocked(e,rk,5,900000))return json({ok:false,error:'Trop d’essais. Réessaie dans quelques minutes.'},429);const b=await body(r);if(b&&safeEq(b.code,e.EDIT_CODE)){await rlReset(e,rk);return json({ok:true},200,{'Set-Cookie':setCookie('edit_auth',await sha(e.EDIT_CODE),2592000)})}await rlHit(e,rk,900000);return json({ok:false},401)}
async function lockEdit(){return json({ok:true},200,{'Set-Cookie':setCookie('edit_auth','',0)})}
function safeEq(a,b){a=String(a||'');b=String(b||'');let d=a.length^b.length;const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0}
function clientIp(r){return r.headers.get('CF-Connecting-IP')||'unknown'}
async function rlBlocked(e,key,max,win){const k='rl:'+key,row=await e.DB.prepare('SELECT value FROM system_state WHERE key=?').bind(k).first();if(!row)return false;try{const s=JSON.parse(row.value);return Date.now()-s.t<win&&s.n>=max}catch{return false}}
async function rlHit(e,key,win){const k='rl:'+key,now=Date.now(),row=await e.DB.prepare('SELECT value FROM system_state WHERE key=?').bind(k).first();let s={n:0,t:now};try{if(row){const o=JSON.parse(row.value);if(now-o.t<win)s=o}}catch{}s.n++;await e.DB.prepare('INSERT OR REPLACE INTO system_state(key,value) VALUES(?,?)').bind(k,JSON.stringify(s)).run()}
async function rlReset(e,key){await e.DB.prepare('DELETE FROM system_state WHERE key=?').bind('rl:'+key).run()}

async function migrateLegacyForFirstUser(uid,e){
 if(!e.SEANCES_KV)return;
 try{
  const state=await e.DB.prepare("SELECT value FROM system_state WHERE key='legacy_imported'").first();
  if(state)return;
  const raw=await e.SEANCES_KV.get('seances');
  if(raw){
   const parsed=JSON.parse(raw);
   if(Array.isArray(parsed)&&parsed.length)await e.DB.prepare('UPDATE user_data SET seances_json=?,updated_at=? WHERE user_id=?').bind(JSON.stringify(parsed),Date.now(),uid).run();
   for(const s of (Array.isArray(parsed)?parsed:[]))for(const x of (s.exercises||[])){
    if(!x?.name)continue;
    await e.DB.prepare('INSERT OR IGNORE INTO common_exercises(id,name,data_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id(),String(x.name).slice(0,120),JSON.stringify(cleanEx(x)),null,Date.now(),Date.now()).run();
   }
  }
  await e.DB.prepare("INSERT OR REPLACE INTO system_state(key,value) VALUES('legacy_imported','1')").run();
 }catch(err){console.error('legacy migration',err)}
}
async function seed(e){ /* common library no longer needs a public bootstrap */ }

function cleanEx(d){d=d&&typeof d==='object'?d:{};const num=(v,def,min,max)=>{v=Math.round(Number(v));return Number.isFinite(v)?Math.min(max,Math.max(min,v)):def},arr=a=>Array.isArray(a)?a.slice(0,30).map(x=>String(x).slice(0,300)):[];return{emoji:String(d.emoji||'💪').slice(0,8),type:d.type==='time'?'time':'reps',amount:num(d.amount,10,1,9999),sets:num(d.sets,3,1,99),rest:num(d.rest,45,0,3600),ok:arr(d.ok),bad:arr(d.bad),muscles:arr(d.muscles),instructions:arr(d.instructions),repMin:num(d.repMin,0,0,999),repMax:num(d.repMax,0,0,999),load:String(d.load||'').slice(0,60)}}
