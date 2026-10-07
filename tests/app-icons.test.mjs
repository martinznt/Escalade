// Manifestes stables, vraies images installables et configuration personnelle validée.
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { APP_ICONS,appIcon,validAppIcon } from '../public/app-icons.js';
import { cleanItem } from '../public/items.js';
import { validateIconPng } from '../server/app-icons.js';
import { SETTINGS_INDEX,findIn } from '../public/finder.js';
import { ok,done } from './helpers.mjs';
const root=new URL('../',import.meta.url),read=(file)=>readFileSync(new URL(file,root)),json=(file)=>JSON.parse(read(file));
function png(file){
  const bytes=read('public'+file);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt8(24),8);assert.equal(bytes.readUInt8(25),2,'image RGB opaque');assert.equal(bytes.readUInt8(28),0);
  return {bytes,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
function pixels(file){
  const {bytes,width,height}=png(file),data=[];for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);if(type==='IDAT')data.push(bytes.subarray(p+8,p+8+n));p+=n+12;}
  const raw=inflateSync(Buffer.concat(data)),out=Buffer.alloc(width*height*3),stride=width*3;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=3?out[y*stride+x-3]:0,b=y?out[(y-1)*stride+x]:0,c=y&&x>=3?out[(y-1)*stride+x-3]:0;out[y*stride+x]=(raw[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  return {out,width,height};
}
await ok('catalogue : onze choix, calendrier sobre par défaut et aucun chemin fourni par le client',()=>{
  assert.equal(APP_ICONS.length,11);assert.equal(new Set(APP_ICONS.map(x=>x.id)).size,11);assert.equal(appIcon().id,'seances');
  for(const bad of ['constructor','__proto__','../../secret','https://autre.test/icone','']){assert.equal(validAppIcon(bad),false);assert.equal(appIcon(bad).id,'seances');}
  for(const x of APP_ICONS)assert.match(x.manifest,new RegExp('^/manifest-icons-'+x.id+'-v1\\.json$'));
});
await ok('réglage facile à retrouver : icône et installation pointent sur la carte de choix',()=>{
  for(const query of ['icône','installation android','icone application']){const entry=findIn(SETTINGS_INDEX,query)[0];assert.equal(entry.title,'Icône de l’application');assert.equal(entry.to,'settings/display');assert.equal(entry.sel,'#app-icons');}
});
await ok('manifestes : même identité et entrée, icônes versionnées et raccourcis du choix',()=>{
  const base=json('public/manifest.json');
  for(const x of APP_ICONS){const m=json('public'+x.manifest);for(const key of ['id','start_url','scope','name','short_name','display','orientation'])assert.equal(m[key],base[key],x.id+' '+key);assert.equal(m.id,'/');assert.equal(m.start_url,'/#/home/dash');assert.equal(m.display,'standalone');assert.ok(m.icons.some(icon=>icon.src===x.maskable&&icon.purpose==='maskable'));assert.ok(m.icons.some(icon=>icon.src===x.large&&icon.sizes==='512x512'));for(const shortcut of m.shortcuts)assert.equal(shortcut.icons[0].src,x.icon);for(const icon of m.icons)assert.ok(existsSync(new URL('public'+icon.src,root)));}
  assert.deepEqual(base,json('public'+appIcon('seances').manifest),'installation par défaut = calendrier de séances sobre');
  const defaults=appIcon();for(const [legacy,current] of [['/icon-192.png',defaults.icon],['/icon-512.png',defaults.large],['/icon-maskable-512.png',defaults.maskable]])assert.deepEqual(read('public'+legacy),read('public'+current));
});
await ok('images installables : tailles PNG opaques et dessins maskable entièrement dans la zone sûre',()=>{
  for(const x of APP_ICONS){for(const [file,size] of [[x.icon,192],[x.apple,180],[x.large,512],[x.maskable,512]]){const image=png(file);assert.equal(image.width,size,x.id);assert.equal(image.height,size,x.id);}
    if(x.id==='gold')continue;
    const {out,width,height}=pixels(x.maskable),bg=Buffer.from(x.background.slice(1),'hex');
    for(let y=0;y<height;y++)for(let z=0;z<width;z++)if(Math.hypot(z+.5-256,y+.5-256)>204.8){const at=(y*width+z)*3;assert.ok(out[at]===bg[0]&&out[at+1]===bg[1]&&out[at+2]===bg[2],x.id+' dessin hors zone sûre');}
  }
});
await ok('illustration fournie : dérivés dorés conservés exactement et source archivée',()=>{
  const gold=appIcon('gold'),expected={192:'df9c7a9df348279f2fe14c8383f721e420ba4337ff67956ab93bdba45966deb4',512:'3365270eacfd10e9339e3edd78b4776c2478e59001ae4e895da0c155e2ffa4b7',maskable:'e964dbe0c3f18ce7ba2b3a5a955810f8b61ea905ff20137c99c463f39d74cf3c'};
  for(const [file,key] of [[gold.icon,192],[gold.large,512],[gold.maskable,'maskable']])assert.equal(createHash('sha256').update(read('public'+file)).digest('hex'),expected[key]);
  const source=read('docs/assets/app-icon-source.jpg');assert.equal(source.subarray(0,2).toString('hex'),'ffd8');assert.ok(source.length>10000);
});
await ok('petits repères de notification : onze PNG 96 px blancs, visibles et transparents',async()=>{
  for(const choice of APP_ICONS)await validateIconPng('data:image/png;base64,'+read('public'+choice.badge).toString('base64'),96,{badge:true});
  assert.deepEqual(read('public/badge-96.png'),read('public'+appIcon().badge));
});
await ok('configuration : choix conservés par le schéma, valeur inconnue neutralisée et anciens réglages compatibles',()=>{
  for(const x of APP_ICONS)assert.equal(cleanItem({c:'config',id:'app-icon',u:1,d:{appIcon:x.id}}).d.appIcon,x.id);
  const legacy=cleanItem({c:'config',id:'appearance',u:1,d:{mode:'light',palette:'gres',vibe:'minimal'}});assert.equal(legacy.d.mode,'light');assert.equal(legacy.d.vibe,'minimal');assert.equal(legacy.d.appIcon,'seances');
  assert.equal(cleanItem({c:'config',id:'app-icon',u:1,d:{appIcon:'https://autre.test/a'}}).d.appIcon,'seances');
});
done('tests icônes et installation');
