// PNG réels, stockage borné et reprise idempotente ; aucun appel externe.
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';
import { validateIconPng, resolveAppIconSelection, customAppIconsRoute, startAppIconUpload, uploadAppIconPart, completeAppIconUpload, abortAppIconUpload, APP_ICON_LIMITS } from '../server/app-icons.js';
import { SCHEMA_VERSION } from '../schema.js';
import { Client, makeEnv, ok, done } from './helpers.mjs';
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=(data)=>{let c=0xffffffff;for(const byte of data)c=table[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function chunk(type,data){const kind=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);kind.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([kind,data])),out.length-4);return out;}
function png(size,{seed=0,badge=false,alpha=255,metadata=false,color=6,filter=0,rawLength,compressed}={}){
  const channels=color===6?4:3,stride=size*channels,raw=Buffer.alloc(rawLength??size*(stride+1));
  if(rawLength===undefined)for(let y=0;y<size;y++){raw[y*(stride+1)]=filter;for(let x=0;x<size;x++){const at=y*(stride+1)+1+x*channels;raw[at]=badge?255:(32+seed)%255;raw[at+1]=badge?255:57;raw[at+2]=badge?255:75;if(channels===4)raw[at+3]=badge?(x>size/4&&x<size*3/4&&y>size/4&&y<size*3/4?255:0):alpha;}}
  if(filter>0&&filter<5&&rawLength===undefined){const plain=Buffer.from(raw),paeth=(a,b,c)=>{const p=a+b-c,A=Math.abs(p-a),B=Math.abs(p-b),C=Math.abs(p-c);return A<=B&&A<=C?a:B<=C?b:c;};for(let y=0;y<size;y++)for(let x=0;x<stride;x++){const at=y*(stride+1)+x+1,a=x>=channels?plain[at-channels]:0,b=y?plain[at-stride-1]:0,c=y&&x>=channels?plain[at-stride-1-channels]:0;raw[at]=(plain[at]-[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=color;
  const chunks=[Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header)];if(metadata)chunks.push(chunk('tEXt',Buffer.from('Owner\0Compte privé, sport et palette')));chunks.push(chunk('IDAT',compressed??deflateSync(raw)),chunk('IEND',Buffer.alloc(0)));return Buffer.concat(chunks);
}
const data=(bytes)=>'data:image/png;base64,'+bytes.toString('base64');
const bundle=(seed=0)=>({images:{icon192:data(png(192,{seed})),icon512:data(png(512)),apple180:data(png(180)),maskable512:data(png(512)),badge96:data(png(96,{badge:true}))}});
const payload=bundle(),env=makeEnv({ASSETS:{fetch:async()=>new Response(readFileSync(new URL('../public/index.html',import.meta.url)),{headers:{'Content-Type':'text/html'}})}}),a=new Client(env),b=new Client(env);
const A=(await a.register('CustomIconA')).data.user.id,B=(await b.register('CustomIconB')).data.user.id;
let uploaded;
const post=async(client,input,headers)=>{
  const started=await client.post('/api/app-icons/start',{},headers);if(started.status!==200)return started;
  const upload=started.data.uploadToken;
  for(const [part,image] of Object.entries(input.images)){
    const result=await client.put('/api/app-icons/'+upload+'/'+part,{image},headers);
    if(result.status!==200){await client.del('/api/app-icons/uploads/'+upload);return result;}
  }
  const completed=await client.post('/api/app-icons/'+upload+'/complete',{},headers);if(completed.status!==200)await client.del('/api/app-icons/uploads/'+upload);return completed;
};
const uploadBundle=async(database,owner,input)=>{
  const started=await startAppIconUpload(database,owner);
  try{for(const [key,image] of Object.entries(input.images))await uploadAppIconPart(database,owner,started.uploadToken,key,{image});return await completeAppIconUpload(database,owner,started.uploadToken);}
  catch(error){await abortAppIconUpload(database,owner,started.uploadToken);throw error;}
};
await ok('migration 12 additive et routes authentifiées, origine et taille contrôlées',async()=>{
  assert.ok(SCHEMA_VERSION>=12);assert.ok(env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE name='custom_app_icons'").get());
  assert.equal((await new Client(env).post('/api/app-icons/start',{})).status,401);
  assert.equal((await post(a,payload,{Origin:'https://autre.test'})).status,403);
  assert.equal((await post(a,payload,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await post(a,payload,{'Content-Type':'image/png'})).status,415);
  assert.equal((await post(a,{images:{icon192:'x'.repeat(APP_ICON_LIMITS.bodyBytes)}})).status,413);
});
await ok('upload : PNG réels acceptés, token imprédictible et réponse limitée aux assets',async()=>{
  const result=await post(a,payload);assert.equal(result.status,200,result.data?.error);uploaded=result.data;
  assert.match(uploaded.token,/^[A-Za-z0-9_-]{43}$/);assert.deepEqual(Object.keys(uploaded).sort(),['ok','token','icon','large','apple','maskable','badge','manifest'].sort());
  assert.ok(Object.values(uploaded).filter(value=>typeof value==='string').every(value=>!value.includes(A)&&!value.includes('CustomIconA')));
  const row=env.DB.raw.prepare('SELECT byte_size,content_hash FROM custom_app_icons WHERE token=?').get(uploaded.token);assert.ok(row.byte_size<APP_ICON_LIMITS.bundleBytes);assert.match(row.content_hash,/^[a-f0-9]{64}$/);
});
await ok('reprise : bundle identique et metadata supprimées donnent le même jeton sans doublon',async()=>{
  assert.equal((await post(a,payload)).data.token,uploaded.token);
  const metadata=bundle();metadata.images.icon192=data(png(192,{metadata:true}));const result=await post(a,metadata);assert.equal(result.status,200);assert.equal(result.data.token,uploaded.token);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM custom_app_icons WHERE user_id=?').get(A).n,1);
  const response=await worker.fetch(new Request('https://site.test'+uploaded.icon),env);assert.equal(Buffer.from(await response.arrayBuffer()).includes(Buffer.from('Compte privé')),false);
});
await ok('assets publics : cinq PNG immuables, HEAD, noms fermés et manifeste sans métadonnées privées',async()=>{
  for(const field of ['icon','large','apple','maskable','badge']){const response=await worker.fetch(new Request('https://site.test'+uploaded[field]),env);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.match(response.headers.get('Cache-Control'),/immutable/);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
  const manifest=await(await worker.fetch(new Request('https://site.test'+uploaded.manifest),env)).json();assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/#/home/dash');assert.equal(manifest.icons[2].purpose,'maskable');assert.ok(!JSON.stringify(manifest).includes(A));assert.ok(manifest.shortcuts.every(shortcut=>shortcut.icons[0].src===uploaded.icon));
  const head=await worker.fetch(new Request('https://site.test'+uploaded.icon,{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await worker.fetch(new Request('https://site.test'+uploaded.icon.replace('192.png','owner.json')),env)).status,404);
  assert.equal((await worker.fetch(new Request('https://site.test'+uploaded.icon,{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request('https://site.test/app-icons-custom/'+'x'.repeat(43)+'/192.png'),env)).status,404);
});
await ok('HTML initial custom : token existant résolu avant JS, invalide ignoré et aucune préférence écrite',async()=>{
  const html=await(await worker.fetch(new Request('https://site.test/?appIcon=custom&appIconToken='+uploaded.token),env)).text();assert.ok(html.includes('rel="manifest" href="'+uploaded.manifest+'"'));assert.ok(html.includes('rel="apple-touch-icon" href="'+uploaded.apple+'"'));
  const invalid=await(await worker.fetch(new Request('https://site.test/?appIcon=custom&appIconToken='+'x'.repeat(43)),env)).text();assert.match(invalid,/rel="manifest" href="\/manifest\.json"/);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM user_items WHERE collection='config' AND id='app-icon'").get().n,0);
});
await ok('BLOB D1 réel : tableaux numériques et ArrayBuffer restent des PNG binaires',async()=>{
  const bytes=png(192);
  for(const blob of [[...bytes],bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)]){
    const database={DB:{prepare:()=>({bind:()=>({first:async()=>({icon192:blob})})})}};
    const response=await customAppIconsRoute(new Request('https://site.test'+uploaded.icon),database);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  }
});
await ok('PNG corrompu, dimensions, filtre, compression, opacité et badges invalides refusés',async()=>{
  const corrupted=png(192);corrupted[corrupted.length-1]^=1;
  for(const [value,size,options] of [[data(corrupted),192,{}],[data(png(191)),192,{}],[data(png(192,{filter:5})),192,{}],[data(png(192,{rawLength:100})),192,{}],[data(png(192,{rawLength:200000})),192,{}],[data(png(192,{compressed:Buffer.from('invalide')})),192,{}],[data(png(192,{alpha:100})),192,{}],[data(png(96,{color:2})),96,{badge:true}],[data(png(96)),96,{badge:true}],[data(png(96,{alpha:0})),96,{badge:true}],['data:image/svg+xml;base64,PHN2Zz4=',192,{}]])await assert.rejects(validateIconPng(value,size,options),error=>error.status===400);
  const rgb=await validateIconPng(data(png(192,{color:2})),192);assert.ok(rgb.length>0);
  for(const filter of [0,1,2,3,4]){
    assert.ok((await validateIconPng(data(png(192,{filter})),192)).length>0);
    assert.ok((await validateIconPng(data(png(96,{filter,badge:true})),96,{badge:true})).length>0);
    await assert.rejects(validateIconPng(data(png(192,{filter,alpha:254})),192),error=>error.status===400);
  }
  const start=(await b.post('/api/app-icons/start',{})).data.uploadToken;
  assert.equal((await b.put('/api/app-icons/'+start+'/icon192',{image:payload.images.icon192,owner:A})).status,400);await b.del('/api/app-icons/uploads/'+start);
  assert.equal((await post(b,{images:{...payload.images,badge96:undefined}})).status,400);
  assert.equal((await post(b,{images:{...payload.images,privateMetadata:'profil'}})).status,404);
});
await ok('session privée : START rejouable, parts remplaçables et aucun asset visible avant complete',async()=>{
  const first=await a.post('/api/app-icons/start',{}, {'X-Op-Id':'op-icon-upload-retry-123'}),again=await a.post('/api/app-icons/start',{}, {'X-Op-Id':'op-icon-upload-retry-123'});assert.equal(first.status,200);assert.equal(first.data.uploadToken,again.data.uploadToken);const token=first.data.uploadToken;
  assert.deepEqual((await a.get('/api/app-icons')).data.uploads,[{uploadToken:token,expiresAt:first.data.expiresAt}]);assert.deepEqual((await b.get('/api/app-icons')).data.uploads,[]);
  assert.equal((await b.put('/api/app-icons/'+token+'/icon192',{image:payload.images.icon192})).status,404);assert.equal((await b.post('/api/app-icons/'+token+'/complete',{})).status,404);assert.equal((await b.del('/api/app-icons/uploads/'+token)).status,404);
  assert.equal((await worker.fetch(new Request('https://site.test/app-icons-custom/'+token+'/192.png'),env)).status,404);
  assert.equal((await a.post('/api/app-icons/'+token+'/complete',{})).status,409);
  const changed=bundle(42);
  await a.put('/api/app-icons/'+token+'/icon192',{image:payload.images.icon192});const size=env.DB.raw.prepare('SELECT byte_size FROM custom_icon_uploads WHERE upload_token=?').get(token).byte_size;
  await a.put('/api/app-icons/'+token+'/icon192',{image:payload.images.icon192});assert.equal(env.DB.raw.prepare('SELECT byte_size FROM custom_icon_uploads WHERE upload_token=?').get(token).byte_size,size);
  for(const [key,image] of Object.entries(changed.images))assert.equal((await a.put('/api/app-icons/'+token+'/'+key,{image})).status,200);
  const result=await a.post('/api/app-icons/'+token+'/complete',{});assert.equal(result.status,200,result.data?.error);
  assert.deepEqual(Buffer.from(await(await worker.fetch(new Request('https://site.test'+result.data.icon),env)).arrayBuffer()),png(192,{seed:42}));
  assert.equal((await a.post('/api/app-icons/'+token+'/complete',{})).data.token,result.data.token);assert.equal((await a.put('/api/app-icons/'+token+'/icon192',{image:payload.images.icon192})).status,409);
  const stored=env.DB.raw.prepare('SELECT byte_size,icon192,icon512,completed_token FROM custom_icon_uploads WHERE upload_token=?').get(token);assert.equal(stored.byte_size,0);assert.equal(stored.icon192,null);assert.equal(stored.icon512,null);
  assert.equal((await a.del('/api/app-icons/uploads/'+token)).status,200);assert.equal((await worker.fetch(new Request('https://site.test'+result.data.icon),env)).status,200);
});
await ok('concurrence : même bundle partagé dans le compte une seule fois, tokens distincts entre comptes',async()=>{
  const identical=await Promise.all(Array.from({length:2},()=>uploadBundle(env,B,payload)));assert.equal(new Set(identical.map(x=>x.token)).size,1);assert.notEqual(identical[0].token,uploaded.token);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM custom_app_icons WHERE user_id=?').get(B).n,1);
});
await ok('mes créations : catalogue privé borné, sans BLOB ni données du profil ou d’un autre compte',async()=>{
  assert.equal((await new Client(env).get('/api/app-icons')).status,401);
  const mine=await a.get('/api/app-icons'),other=await b.get('/api/app-icons');assert.equal(mine.status,200);assert.equal(mine.data.icons.length,2);assert.equal(other.data.icons.length,1);
  assert.ok(mine.data.icons.length<=APP_ICON_LIMITS.bundles);assert.ok(mine.data.icons.every((icon,index,list)=>index===0||list[index-1].createdAt>=icon.createdAt));
  assert.ok(mine.data.icons.every(icon=>Object.keys(icon).sort().join(',')==='apple,badge,createdAt,icon,large,manifest,maskable,token'));assert.ok(mine.data.icons.every(icon=>icon.token!==other.data.icons[0].token));assert.ok(!JSON.stringify(mine.data).includes(A));
});
const setPreference=(owner,id,value)=>env.DB.raw.prepare("INSERT INTO user_items(user_id,collection,id,data_json,updated_at,server_at) VALUES(?,'config',?,?,1,1) ON CONFLICT(user_id,collection,id) DO UPDATE SET data_json=excluded.data_json,deleted=0").run(owner,id,JSON.stringify(value));
await ok('sélections : notifications suivent l’app ou leur choix propre, token d’autrui neutralisé',async()=>{
  setPreference(A,'app-icon',{appIcon:'custom',appIconToken:uploaded.token});assert.equal((await resolveAppIconSelection(env,A)).icon,uploaded.icon);assert.equal((await resolveAppIconSelection(env,A,{kind:'notification'})).badge,uploaded.badge);
  setPreference(A,'notification-icon',{notificationIcon:'gold'});assert.equal((await resolveAppIconSelection(env,A,{kind:'notification'})).id,'gold');assert.equal((await resolveAppIconSelection(env,A)).id,'custom');
  setPreference(B,'app-icon',null);assert.equal((await resolveAppIconSelection(env,B)).id,'seances');
  setPreference(B,'app-icon',{appIcon:'custom',appIconToken:uploaded.token});assert.equal((await resolveAppIconSelection(env,B)).id,'seances');
  setPreference(A,'notification-icon',{notificationIcon:'custom',notificationToken:uploaded.token});assert.equal((await resolveAppIconSelection(env,A,{kind:'notification'})).icon,uploaded.icon);
});
await ok('suppression : propriétaire exigé, choix courants protégés et token supprimé indisponible',async()=>{
  assert.equal((await b.del('/api/app-icons/'+uploaded.token)).status,404);assert.equal((await a.del('/api/app-icons/'+uploaded.token)).status,409);
  setPreference(A,'app-icon',{appIcon:'seances'});assert.equal((await a.del('/api/app-icons/'+uploaded.token)).status,409);
  setPreference(A,'notification-icon',{notificationIcon:'app'});assert.equal((await a.del('/api/app-icons/'+uploaded.token)).status,200);
  assert.equal((await worker.fetch(new Request('https://site.test'+uploaded.icon),env)).status,404);
});
await ok('quota : insertion atomique, une seule place libre malgré les envois concurrents',async()=>{
  const env2=makeEnv(),client=new Client(env2),owner=(await client.register('IconQuota')).data.user.id;
  const dummy=Buffer.from([1]);for(let i=0;i<APP_ICON_LIMITS.bundles-1;i++)env2.DB.raw.prepare('INSERT INTO custom_app_icons(token,user_id,content_hash,byte_size,created_at,icon192,icon512,apple180,maskable512,badge96) VALUES(?,?,?,?,?,?,?,?,?,?)').run('fixture-'+i,owner,'fixture-hash-'+i,100,1,dummy,dummy,dummy,dummy,dummy);
  const results=await Promise.allSettled([10,11].map(seed=>uploadBundle(env2,owner,bundle(seed))));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.ok(results.filter(x=>x.status==='rejected').every(x=>x.reason.status===429));assert.equal(env2.DB.raw.prepare('SELECT COUNT(*) n FROM custom_app_icons WHERE user_id=?').get(owner).n,APP_ICON_LIMITS.bundles);
  const duplicate=results.find(x=>x.status==='fulfilled').value,seed=[10,11][results.findIndex(x=>x.status==='fulfilled')];assert.equal((await uploadBundle(env2,owner,bundle(seed))).token,duplicate.token);
  env2.DB.raw.prepare('DELETE FROM custom_app_icons WHERE user_id=?').run(owner);env2.DB.raw.prepare('INSERT INTO custom_app_icons(token,user_id,content_hash,byte_size,created_at,icon192,icon512,apple180,maskable512,badge96) VALUES(?,?,?,?,?,?,?,?,?,?)').run('bytes-limit',owner,'bytes-limit',APP_ICON_LIMITS.accountBytes,1,dummy,dummy,dummy,dummy,dummy);await assert.rejects(uploadBundle(env2,owner,payload),error=>error.status===429);
});
await ok('sessions : deux créations maximum, expiration et publication rejouée sans doublon',async()=>{
  const env2=makeEnv(),client=new Client(env2),owner=(await client.register('IconSessions')).data.user.id;
  const first=await startAppIconUpload(env2,owner),second=await startAppIconUpload(env2,owner);await assert.rejects(startAppIconUpload(env2,owner),error=>error.status===429);
  env2.DB.raw.prepare('UPDATE custom_icon_uploads SET expires_at=1 WHERE upload_token=?').run(second.uploadToken);await assert.rejects(completeAppIconUpload(env2,owner,second.uploadToken),error=>error.status===404);
  const third=await startAppIconUpload(env2,owner);assert.notEqual(third.uploadToken,second.uploadToken);assert.equal(env2.DB.raw.prepare('SELECT COUNT(*) n FROM custom_icon_uploads WHERE upload_token=?').get(second.uploadToken).n,0);
  for(const token of [first.uploadToken,third.uploadToken])for(const [key,image] of Object.entries(payload.images))await uploadAppIconPart(env2,owner,token,key,{image});
  const completed=await Promise.all([first.uploadToken,third.uploadToken].map(token=>completeAppIconUpload(env2,owner,token)));assert.equal(completed[0].token,completed[1].token);assert.equal(env2.DB.raw.prepare('SELECT COUNT(*) n FROM custom_app_icons WHERE user_id=?').get(owner).n,1);
});
await ok('publication : une modification concurrente invalide la révision au lieu de mélanger deux dessins',async()=>{
  const env2=makeEnv(),client=new Client(env2),owner=(await client.register('IconRevision')).data.user.id,session=await startAppIconUpload(env2,owner);
  for(const [key,image] of Object.entries(payload.images))await uploadAppIconPart(env2,owner,session.uploadToken,key,{image});
  const originalBatch=env2.DB.batch.bind(env2.DB);env2.DB.batch=async statements=>{env2.DB.raw.prepare('UPDATE custom_icon_uploads SET revision=revision+1 WHERE upload_token=?').run(session.uploadToken);return originalBatch(statements);};
  await assert.rejects(completeAppIconUpload(env2,owner,session.uploadToken),error=>error.status===409);assert.equal(env2.DB.raw.prepare('SELECT COUNT(*) n FROM custom_app_icons WHERE user_id=?').get(owner).n,0);
});
await ok('suppression du compte : aucun asset personnalisé orphelin en base',async()=>{
  assert.equal((await b.post('/api/auth/delete',{password:'motdepasse1'})).status,200);assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM custom_app_icons WHERE user_id=?').get(B).n,0);assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM custom_icon_uploads WHERE user_id=?').get(B).n,0);
});
done('tests backend icônes personnelles');
