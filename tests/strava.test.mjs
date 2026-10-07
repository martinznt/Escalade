// Vrai Worker/SQLite/cryptographie. Transport OAuth officiel simulé, aucune connexion Strava réelle.
import assert from 'node:assert/strict';
import { Client, makeEnv, ok, done, ORIGIN } from './helpers.mjs';
import { SCHEMA_VERSION } from '../schema.js';
const ROOT='/api/integrations/strava';
const KEY=Buffer.alloc(32,7).toString('base64url');
const configured=()=>makeEnv({STRAVA_CLIENT_ID:'12345',STRAVA_CLIENT_SECRET:'client-secret-strava-test',STRAVA_TOKEN_KEY:KEY,STRAVA_REDIRECT_URI:ORIGIN+ROOT+'/callback'});
const json=(value,status=200)=>Response.json(value,{status});
const token=(athlete=42,access='access-token-test',refresh='refresh-token-test')=>({access_token:access,refresh_token:refresh,expires_at:Math.floor(Date.now()/1000)+21600,athlete:{id:athlete}});
const activity=(id=123,athlete=42,extra={})=>({id,name:'Course privée de test',athlete:{id:athlete},sport_type:'Run',start_date:new Date(Date.now()-86400000).toISOString(),elapsed_time:3600,moving_time:3500,distance:10000,total_elevation_gain:100,private:true,map:{summary_polyline:'GPS-EXCLU'},start_latlng:[45,2],average_heartrate:140,description:'DONNEE-SENSIBLE-EXCLUE',...extra});
let transport,calls=[];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=String(input);assert.ok(url.startsWith('https://www.strava.com/'),'aucun autre fournisseur contacté');
  assert.equal(init.redirect,'error','les redirections externes ne sont jamais suivies');
  calls.push({url,init});return transport(url,init);
};
function defaults({athlete=42,activities=[activity()],revokeStatus=200}={}) {
  calls=[];transport=async(url,init)=>{
    if(url==='https://www.strava.com/oauth/token')return json(token(athlete));
    if(url.startsWith('https://www.strava.com/api/v3/athlete/activities?')){assert.equal(init.headers.Authorization,'Bearer access-token-test');return json(activities);}
    if(url==='https://www.strava.com/oauth/deauthorize')return json({access_token:'access-token-test'},revokeStatus);
    throw Error('Endpoint inconnu');
  };
}
async function account(env,name='StravaUser'){const client=new Client(env);await client.register(name);return client;}
async function begin(client){const result=await client.post(ROOT+'/start',{confirm:true});assert.equal(result.status,200,JSON.stringify(result.data));return new URL(result.data.authorizeUrl).searchParams.get('state');}
function callback(state,extra={}) {const q=new URLSearchParams({state,code:'oauth-code-test',scope:'read,activity:read_all',...extra});return ROOT+'/callback?'+q;}
async function connect(client,extra={}) {const state=await begin(client),result=await client.get(callback(state,extra));assert.equal(result.status,303,JSON.stringify(result.data));assert.equal(result.res.headers.get('Location'),'/#/settings/integrations');return result;}
const count=async(env,table)=>(await env.DB.prepare('SELECT COUNT(*) n FROM '+table).first()).n;
const hold=()=>{let release,arrived;const ready=new Promise(r=>arrived=r),pending=new Promise(r=>release=r);return {ready,arrived,release,pending};};
try {
  await ok('migration13 additive : nouvelles tables et clés étrangères, ancien historique intact',async()=>{
    defaults();const env=configured(),u=await account(env);
    assert.equal(SCHEMA_VERSION,13);
    for(const table of ['strava_connections','strava_oauth_states','strava_previews','external_activity_imports'])assert.ok(env.DB.raw.prepare('PRAGMA table_info('+table+')').all().length);
    await u.post('/api/history',{id:'native-before-strava',sessionName:'Séance locale',startedAt:Date.now()-1000,durationSeconds:60,data:{}});
    await connect(u);assert.equal((await u.get('/api/history')).data.history[0].sessionName,'Séance locale');
    assert.ok(env.DB.raw.prepare('PRAGMA foreign_key_list(strava_oauth_states)').all().some(r=>r.table==='sessions'));
  });
  await ok('configuration honnête et consentement explicite : origine fixe, visiteur et CSRF refusés sans appel externe',async()=>{
    defaults();const bare=makeEnv(),u=await account(bare,'StravaBare');
    assert.equal((await u.get(ROOT+'/status')).data.configured,false);
    assert.equal((await u.post(ROOT+'/start',{confirm:true})).status,503);
    const env=configured(),owner=await account(env);
    assert.equal((await new Client(env).get(ROOT+'/status')).status,401);
    assert.equal((await owner.post(ROOT+'/start',{})).status,400);
    assert.equal((await owner.post(ROOT+'/start',{confirm:true},{Origin:'https://foreign.test'})).status,403);
    env.STRAVA_REDIRECT_URI='https://foreign.test'+ROOT+'/callback';
    assert.equal((await owner.get(ROOT+'/status')).data.canConnect,false);
    assert.equal((await owner.post(ROOT+'/start',{confirm:true})).status,503);
    assert.equal(calls.length,0);
  });
  await ok('OAuth : endpoint fixe, state seulement haché, usage unique et scope privé requis',async()=>{
    defaults();const env=configured(),u=await account(env),state=await begin(u);
    const stored=await env.DB.prepare('SELECT * FROM strava_oauth_states').first();
    assert.notEqual(stored.state_hash,state);assert.equal(stored.claimed,0);
    const before=await u.get(callback(state,{scope:'read,activity:read'}));assert.equal(before.status,403);assert.equal(calls.length,0);
    assert.equal((await u.get(callback(state))).status,409);
    const next=await begin(u),result=await u.get(callback(next));assert.equal(result.status,303);
    assert.equal((await u.get(callback(next))).status,409);assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://www.strava.com/oauth/token');
    const form=new URLSearchParams(calls[0].init.body);assert.equal(form.get('redirect_uri'),ORIGIN+ROOT+'/callback');assert.equal(form.get('grant_type'),'authorization_code');
    assert.equal(await count(env,'history'),0);assert.equal(await count(env,'user_items'),0);
  });
  await ok('state lié au compte et à la même session : autre compte/session et expiration refusés',async()=>{
    defaults();const env=configured(),u=await account(env,'StravaOwner'),other=await account(env,'StravaOther'),state=await begin(u);
    assert.equal((await other.get(callback(state))).status,409);
    const second=new Client(env);await second.post('/api/auth/login',{username:'StravaOwner',password:'motdepasse1'});
    assert.equal((await second.get(callback(state))).status,409);
    assert.equal((await u.get(callback(state))).status,303);
    const expired=await begin(u);await env.DB.prepare('UPDATE strava_oauth_states SET expires_at=0').run();
    assert.equal((await u.get(callback(expired))).status,409);
    const pending=await begin(u);await u.post('/api/auth/logout');
    assert.equal(await count(env,'strava_oauth_states'),0);assert.equal((await u.get(callback(pending))).status,401);
    assert.equal(calls.length,1);
  });
  await ok('jetons AES-GCM non exposés, intégrité et liaison propriétaire/connexion vérifiées',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);
    const row=await env.DB.prepare('SELECT * FROM strava_connections').first();
    assert.match(row.tokens_cipher,/^v1\./);assert.ok(!row.tokens_cipher.includes('access-token'));assert.ok(!row.tokens_cipher.includes('refresh-token'));
    const state=(await u.get(ROOT+'/status')).data;assert.equal(state.connected,true);assert.ok(!JSON.stringify(state).includes('token'));assert.equal(state.importedCount,0);
    const attacker=await account(env,'StravaTamper'),attackerId=(await attacker.get('/api/auth/me')).data.user.id;
    await env.DB.prepare('INSERT INTO strava_connections(user_id,connection_id,athlete_id,tokens_cipher,scopes_json,connected_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(attackerId,'another-connection',row.athlete_id,row.tokens_cipher,row.scopes_json,row.connected_at,row.expires_at).run();
    assert.equal((await attacker.post(ROOT+'/preview',{page:1})).status,409);
    await env.DB.prepare('UPDATE strava_connections SET tokens_cipher=? WHERE user_id=?').bind(row.tokens_cipher.slice(0,-2)+'AA',row.user_id).run();
    assert.equal((await u.post(ROOT+'/preview',{page:1})).status,409);assert.equal(calls.length,1);
  });
  await ok('prévisualisation : vraie réponse fournisseur minimale, GPS/cardio/texte sensible écartés et aucune écriture histoire/perf',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);
    const result=await u.post(ROOT+'/preview',{page:1});assert.equal(result.status,200,JSON.stringify(result.data));
    const a=result.data.activities[0];assert.equal(a.id,'123');assert.equal(a.activityId,'running');assert.equal(a.distanceMeters,10000);assert.equal(a.imported,false);
    assert.deepEqual(a.external,{provider:'strava',id:'123',channel:'api',private:true,excludeAI:true});
    assert.ok(!JSON.stringify(result.data).includes('GPS-EXCLU'));assert.ok(!JSON.stringify(result.data).includes('heartrate'));assert.ok(!JSON.stringify(result.data).includes('DONNEE-SENSIBLE'));
    assert.equal(await count(env,'history'),0);assert.equal(await count(env,'user_items'),0);
    const remote=new URL(calls[1].url);assert.equal(remote.origin,'https://www.strava.com');assert.equal(remote.searchParams.get('page'),'1');assert.equal(remote.searchParams.get('per_page'),'20');
  });
  await ok('import explicite : uniquement IDs réellement prévisualisés, un historique privé stable par compte sans perf automatique',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);const p=(await u.post(ROOT+'/preview',{page:1})).data;
    assert.equal((await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['123']})).status,400);
    assert.equal((await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['999'],confirm:true})).status,409);
    const body={previewToken:p.previewToken,activityIds:['123'],confirm:true},first=await u.post(ROOT+'/import',body);assert.equal(first.status,200,JSON.stringify(first.data));
    assert.equal(first.data.imported.length,1);assert.equal(first.data.history[0].sessionName,'Course privée de test');
    const again=await u.post(ROOT+'/import',body);assert.equal(again.status,200);assert.equal(again.data.duplicates.length,1);assert.equal(again.data.duplicates[0].historyId,first.data.imported[0].historyId);
    assert.equal(await count(env,'history'),1);assert.equal(await count(env,'external_activity_imports'),1);assert.equal(await count(env,'user_items'),0);
    const reread=(await u.get('/api/history')).data.history[0];assert.deepEqual(reread.data.external,{provider:'strava',id:'123',channel:'api',private:true,excludeAI:true});
    assert.deepEqual(reread.data.exercises,[]);assert.equal(reread.durationSeconds,3600);
    const next=(await u.post(ROOT+'/preview',{page:1})).data;assert.equal(next.activities[0].imported,true);
    const other=await account(env,'StravaSeparate');await connect(other);const q=(await other.post(ROOT+'/preview',{page:1})).data;
    assert.equal((await other.post(ROOT+'/import',body)).status,409);
    const independent=await other.post(ROOT+'/import',{previewToken:q.previewToken,activityIds:['123'],confirm:true});assert.equal(independent.status,200);assert.notEqual(independent.data.imported[0].historyId,first.data.imported[0].historyId);
  });
  await ok('activité/autorisation ambiguë : propriétaire, doublon, date et durée inconnue ne deviennent pas des mesures inventées',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);
    transport=async()=>json([activity(123,999)]);assert.equal((await u.post(ROOT+'/preview',{page:1})).status,502);
    transport=async()=>json([activity(),activity()]);assert.equal((await u.post(ROOT+'/preview',{page:1})).status,502);
    transport=async()=>json([activity(123,42,{elapsed_time:null}),activity(124,42,{start_date:new Date(Date.now()+86400000).toISOString()}),activity(125,42,{sport_type:'RockClimbing'})]);
    const p=await u.post(ROOT+'/preview',{page:1});assert.equal(p.status,200);assert.equal(p.data.unavailableCount,2);assert.equal(p.data.activities.length,1);assert.equal(p.data.activities[0].activityId,'','type escalade non déduit en bloc ou voie');
    assert.equal(await count(env,'history'),0);
  });
  await ok('prévisualisation expirée et identifiant déjà utilisé : aucune sélection partielle ni faux doublon annoncé',async()=>{
    defaults({activities:[activity(123),activity(124)]});const env=configured(),u=await account(env);await connect(u);const p=(await u.post(ROOT+'/preview',{page:1})).data;
    const owner=(await u.get('/api/auth/me')).data.user.id,digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+':strava:124'))).toString('base64url');
    await u.post('/api/history',{id:'strava-'+digest,sessionName:'Autre donnée locale',startedAt:Date.now()-1000,data:{}});
    const selected={previewToken:p.previewToken,activityIds:['123','124'],confirm:true};
    assert.equal((await u.post(ROOT+'/import',selected)).status,409);
    assert.equal(await count(env,'history'),1);assert.equal(await count(env,'external_activity_imports'),0);
    await env.DB.prepare('DELETE FROM history').run();await env.DB.prepare('UPDATE strava_previews SET expires_at=0').run();
    assert.equal((await u.post(ROOT+'/import',selected)).status,409);assert.equal(await count(env,'history'),0);
  });
  await ok('identifiant stable accepté par édition/suppression : origine privée conservée et aucune recréation API générale',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);const p=(await u.post(ROOT+'/preview',{page:1})).data;
    const result=await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['123'],confirm:true}),h=result.data.history[0];
    assert.equal(h.id.length,50);assert.match(h.id,/^[\w-]{1,64}$/);
    const edited=await u.post('/api/history',{id:h.id,sessionName:'Titre modifié localement',startedAt:Date.now()-1000,durationSeconds:1,data:{note:'Ma note personnelle'}});
    assert.equal(edited.status,200);assert.equal(edited.data.id,h.id);
    const kept=(await u.get('/api/history')).data.history[0];assert.deepEqual(kept.data.external,h.data.external);assert.equal(kept.durationSeconds,3600);
    assert.equal((await u.del('/api/history/'+h.id)).status,200);assert.equal(await count(env,'history'),0);assert.equal(await count(env,'external_activity_imports'),0);
    assert.equal((await u.post('/api/history',h)).status,403);assert.equal(await count(env,'history'),0);
  });
  await ok('aucun cache op_log : state/preview privés non journalisés et import ancien non rejoué après purge',async()=>{
    defaults();const env=configured(),u=await account(env),headers={'X-Op-Id':'op-strava-start-test'};
    const start=await u.post(ROOT+'/start',{confirm:true},headers);assert.equal(start.status,200);const state=new URL(start.data.authorizeUrl).searchParams.get('state');assert.equal((await u.get(callback(state))).status,303);
    const p=(await u.post(ROOT+'/preview',{page:1},{'X-Op-Id':'op-strava-preview-test'})).data;
    const selection={previewToken:p.previewToken,activityIds:['123'],confirm:true},importHeaders={'X-Op-Id':'op-strava-import-test'};
    assert.equal((await u.post(ROOT+'/import',selection,importHeaders)).status,200);assert.equal(await count(env,'op_log'),0);
    await u.del(ROOT);assert.equal((await u.post(ROOT+'/import',selection,importHeaders)).status,409);assert.equal(await count(env,'history'),0);assert.equal(await count(env,'op_log'),0);
  });
  await ok('refresh : rotation chiffrée, ancien refresh remplacé et résultat jamais renvoyé au navigateur',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);let received;
    transport=async(url,init)=>{received=new URLSearchParams(init.body);return json(token(42,'rotated-access-token','rotated-refresh-token'));};
    const r=await u.post(ROOT+'/refresh');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(received.get('refresh_token'),'refresh-token-test');assert.equal(received.get('grant_type'),'refresh_token');assert.ok(!JSON.stringify(r.data).includes('rotated-'));
    transport=async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer rotated-access-token');return json([activity()]);};
    assert.equal((await u.post(ROOT+'/preview',{page:1})).status,200);
  });
  await ok('deux refresh concurrents : une seule rotation ; déconnexion pendant réponse retardée ne recrée aucun secret',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);const gate=hold();
    transport=async(url)=>{if(url.endsWith('/token')){gate.arrived();return gate.pending;}return json({access_token:'access-token-test'});};
    const pending=u.post(ROOT+'/refresh');await gate.ready;
    assert.equal((await u.post(ROOT+'/refresh')).status,425);
    const deleted=await u.del(ROOT);assert.equal(deleted.status,200);assert.equal(deleted.data.revoked,true);
    gate.release(json(token(42,'late-access-token','late-refresh-token')));assert.equal((await pending).status,409);
    assert.equal(await count(env,'strava_connections'),0);assert.equal(await count(env,'strava_previews'),0);
  });
  await ok('callback retardé après déconnexion et consultation retardée après logout : aucun secret/preview réappliqué',async()=>{
    defaults();const env=configured(),u=await account(env),state=await begin(u),gate=hold();
    transport=async()=>{gate.arrived();return gate.pending;};const pending=u.get(callback(state));await gate.ready;
    assert.equal((await u.del(ROOT)).status,200);gate.release(json(token()));assert.equal((await pending).status,409);assert.equal(await count(env,'strava_connections'),0);
    defaults();await connect(u);const read=hold();transport=async()=>{read.arrived();return read.pending;};
    const preview=u.post(ROOT+'/preview',{page:1});await read.ready;await u.post('/api/auth/logout');read.release(json([activity()]));assert.equal((await preview).status,409);assert.equal(await count(env,'strava_previews'),0);
  });
  await ok('réautorisation : remplace atomiquement les previews du même athlète, refuse fusion silencieuse avec un autre',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);const p=(await u.post(ROOT+'/preview',{page:1})).data;
    await connect(u);assert.equal(await count(env,'strava_previews'),0);assert.equal((await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['123'],confirm:true})).status,409);
    defaults({athlete:99});const state=await begin(u);assert.equal((await u.get(callback(state))).status,409);assert.equal((await env.DB.prepare('SELECT athlete_id FROM strava_connections').first()).athlete_id,'42');
  });
  await ok('revocation confirmée ou non : suppression locale totale API/fichiers et historique natif conservé',async()=>{
    for(const revokeStatus of [200,500]) {
      defaults({revokeStatus});const env=configured(),u=await account(env);await connect(u);const p=(await u.post(ROOT+'/preview',{page:1})).data;
      await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['123'],confirm:true});
      const id=(await u.get('/api/auth/me')).data.user.id;
      await env.DB.prepare('INSERT INTO history(id,user_id,session_name,started_at,data_json) VALUES(?,?,?,?,?)').bind('strava-file-'+revokeStatus,id,'Fichier privé',Date.now()-1000,JSON.stringify({external:{provider:'strava',id:'file-hash',channel:'file',private:true,excludeAI:true}})).run();
      await u.post('/api/history',{id:'native-'+revokeStatus,sessionName:'Locale',startedAt:Date.now()-1000,data:{}});
      const r=await u.del(ROOT);assert.equal(r.status,200);assert.equal(r.data.importedRemoved,2);assert.equal(r.data.revoked,revokeStatus===200);assert.equal(!!r.data.notice,revokeStatus!==200);
      for(const table of ['strava_connections','strava_previews','strava_oauth_states','external_activity_imports'])assert.equal(await count(env,table),0);
      assert.equal((await u.get('/api/history')).data.history.length,1);assert.equal((await u.get(ROOT+'/status')).data.connected,false);
      assert.equal((await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['123'],confirm:true})).status,409);
    }
  });
  await ok('clé absente ou réponse OAuth invalide : état honnête, rien en clair et nettoyage local toujours possible',async()=>{
    defaults();const env=configured(),u=await account(env);await connect(u);delete env.STRAVA_TOKEN_KEY;
    const status=(await u.get(ROOT+'/status')).data;assert.equal(status.configured,false);assert.equal(status.connected,true);
    assert.equal((await u.post(ROOT+'/refresh')).status,503);const cleared=await u.del(ROOT);assert.equal(cleared.status,200);assert.equal(cleared.data.revoked,false);assert.ok(cleared.data.notice);assert.equal(await count(env,'strava_connections'),0);
    env.STRAVA_TOKEN_KEY=KEY;const state=await begin(u);transport=async()=>json({access_token:'only-one-token',expires_at:Math.floor(Date.now()/1000)+3600,athlete:{id:42}});
    assert.equal((await u.get(callback(state))).status,502);assert.equal(await count(env,'strava_connections'),0);assert.equal(await count(env,'strava_oauth_states'),0);
  });
  await ok('suppression compte : mot de passe vérifié avant révocation, panne distante non bloquante et avis sans secret',async()=>{
    for(const revokeStatus of [200,500]) {
      defaults({revokeStatus});const env=configured(),u=await account(env);await connect(u);const p=(await u.post(ROOT+'/preview',{page:1})).data;
      await u.post(ROOT+'/import',{previewToken:p.previewToken,activityIds:['123'],confirm:true});
      assert.equal((await u.post('/api/auth/delete',{password:'incorrect'})).status,403);assert.equal(calls.filter(c=>c.url.endsWith('/deauthorize')).length,0);
      const removed=await u.post('/api/auth/delete',{password:'motdepasse1'});assert.equal(removed.status,200);assert.equal(removed.data.stravaRevoked,revokeStatus===200);assert.equal(!!removed.data.notice,revokeStatus!==200);assert.ok(!JSON.stringify(removed.data).includes('access-token'));
      assert.equal(calls.filter(c=>c.url.endsWith('/deauthorize')).length,1);assert.equal((await u.get('/api/auth/me')).status,401);
      for(const table of ['users','sessions','history','strava_connections','strava_previews','strava_oauth_states','external_activity_imports'])assert.equal(await count(env,table),0);
    }
    defaults();const bare=makeEnv(),without=await account(bare,'StravaNoConnection');assert.equal((await without.post('/api/auth/delete',{password:'motdepasse1'})).status,200);assert.equal(calls.length,0);
  });
  done('tests Strava privé / OAuth / import volontaire');
} finally {globalThis.fetch=nativeFetch;}
