// Création déterministe sur l'appareil : aucun service d'IA ni téléchargement d'image.
export const ICON_BASES = [['calendar','Calendrier'],['mountain','Montagne'],['shield','Écusson'],['circle','Cercle'],['monogram','Initiale S']];
export const ICON_STYLES = [['minimal','Simple'],['mat','Mat'],['relief','Relief'],['illustration','Illustration'],['color','Couleurs']];
export const ICON_SPORTS = [['climbing','Escalade'],['running','Course'],['cycling','Vélo'],['swimming','Natation'],['strength','Renforcement'],['basketball','Basket'],['yoga','Mobilité']];
export const ICON_PALETTES = [
  ['slate','Ardoise','#223341','#F4F5F7'],['forest','Forêt','#183F35','#E8F2E5'],['ocean','Océan','#173D68','#D9F0FF'],
  ['sunset','Terre et soleil','#663E36','#F6D0A2'],['berry','Prune','#4C345D','#F0DBF1'],['paper','Papier','#F0EDE5','#243C49'],
];
export const ICON_PRESETS = Object.freeze([
  {id:'planning',label:'Mes rendez-vous',base:'calendar',style:'minimal',palette:'slate',sports:[]},
  {id:'outdoor',label:'Au grand air',base:'mountain',style:'relief',palette:'forest',sports:['climbing','running']},
  {id:'landscape',label:'Traversée',base:'mountain',style:'illustration',palette:'ocean',sports:['climbing','cycling']},
  {id:'club',label:'Esprit club',base:'shield',style:'mat',palette:'berry',sports:['strength','basketball']},
  {id:'energy',label:'En mouvement',base:'circle',style:'color',palette:'sunset',sports:['running','swimming','yoga']},
  {id:'initial',label:'Ma signature',base:'monogram',style:'relief',palette:'paper',sports:['strength']},
].map(x=>Object.freeze({...x,sports:Object.freeze(x.sports)})));
const allowed=(list,value,fallback)=>list.some(x=>x[0]===value)?value:fallback;
const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toUpperCase():fallback;
export function normalizeIconDesign(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))input={};
  const palette=ICON_PALETTES.find(x=>x[0]===input.palette)||ICON_PALETTES[0];
  return {base:allowed(ICON_BASES,input.base,'calendar'),style:allowed(ICON_STYLES,input.style,'minimal'),palette:palette[0],background:color(input.background,palette[2]),foreground:color(input.foreground,palette[3]),sports:[...new Set(Array.isArray(input.sports)?input.sports:[])].filter(x=>ICON_SPORTS.some(s=>s[0]===x)).slice(0,4)};
}
export function readIconDesign(json) { try { return normalizeIconDesign(typeof json==='string'?JSON.parse(json):json); } catch { return normalizeIconDesign(); } }
export const presetIconDesign=(id)=>normalizeIconDesign(ICON_PRESETS.find(x=>x.id===id)||ICON_PRESETS[0]);
const rgba=(hex,alpha)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${alpha})`;};
const mix=(a,b,k)=>'#'+[0,1,2].map(i=>Math.round(parseInt(a.slice(1+i*2,3+i*2),16)*(1-k)+parseInt(b.slice(1+i*2,3+i*2),16)*k).toString(16).padStart(2,'0')).join('');
function path(ctx,value,{fill=false,stroke=true}={}) { const p=new Path2D(value);if(fill)ctx.fill(p);if(stroke)ctx.stroke(p); }
function roundRect(ctx,x,y,w,h,r,fill=true) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill();else ctx.stroke();}
function baseMark(ctx,base) {
  if(base==='calendar'){
    roundRect(ctx,137,155,238,218,26,false);path(ctx,'M137 217h238M207 133v47M305 133v47');
    ctx.lineWidth=24;path(ctx,'m207 287 32 31 69-72');
  }else if(base==='mountain'){
    path(ctx,'M128 346 247 153 384 346H128ZM215 205l32-52 38 54-26-10-18 15');
    ctx.lineWidth=12;path(ctx,'M247 153 218 305 277 268 317 346');
  }else if(base==='shield'){
    path(ctx,'M256 128c-40 26-80 32-120 37v91c0 68 52 102 120 135 68-33 120-67 120-135v-91c-40-5-80-11-120-37Z');
    ctx.lineWidth=24;path(ctx,'m204 267 34 34 70-73');
  }else if(base==='circle'){
    ctx.beginPath();ctx.arc(256,256,126,-Math.PI*.83,Math.PI*.85);ctx.stroke();
    path(ctx,'m171 241 84-66 88 70-88 92Z');ctx.lineWidth=14;path(ctx,'M255 175v162M171 241h172');
  }else{ctx.lineWidth=29;path(ctx,'M332 172H225c-45 0-71 56-25 77l99 29c46 17 23 63-22 63H182');}
}
function sportMark(ctx,sport) {
  ctx.lineWidth=8;ctx.strokeStyle=ctx.fillStyle;ctx.lineCap='round';ctx.lineJoin='round';
  if(sport==='climbing'){
    ctx.beginPath();ctx.arc(0,-22,8,0,Math.PI*2);ctx.fill();path(ctx,'M-2-8-15 10-34 18M-15 10 4 20 8 37M-2-8 18-18 29-37M-2-8-22-24-28-36');
  }else if(sport==='running'){
    ctx.beginPath();ctx.arc(6,-26,8,0,Math.PI*2);ctx.fill();path(ctx,'m1-12-13 23 22 9 18 15M-12 11-25 35M-3-7 21 0 32-10M-3-7-22-14-32-3');
  }else if(sport==='cycling'){
    for(const x of [-24,24]){ctx.beginPath();ctx.arc(x,18,15,0,Math.PI*2);ctx.stroke();}path(ctx,'M-24 18-6-16 9 18h-33M-6-16 18-16 24 18M-12-24h13M16-16l4-12h10');
  }else if(sport==='swimming'){
    ctx.beginPath();ctx.arc(26,-14,8,0,Math.PI*2);ctx.fill();path(ctx,'M15-4-6-10-25 2M-6-10-14-28 1-34M-39 20q12-11 24 0t24 0t24 0M-39 34q12-11 24 0t24 0t24 0');
  }else if(sport==='strength'){
    path(ctx,'M-39 0h78M-28-21v42M28-21v42M-39-12v24M39-12v24');
  }else if(sport==='basketball'){
    ctx.beginPath();ctx.arc(0,0,34,0,Math.PI*2);ctx.stroke();path(ctx,'M-34 0h68M0-34v68M-24-24q38 24 0 48M24-24q-38 24 0 48');
  }else{
    ctx.beginPath();ctx.arc(0,-27,8,0,Math.PI*2);ctx.fill();path(ctx,'M0-12v27M-24-6 0 4l24-10M0 15-28 28h56L0 15');
  }
}
function landscape(ctx,d) {
  const g=ctx.createLinearGradient(0,0,512,512);g.addColorStop(0,mix(d.background,'#111827',.16));g.addColorStop(1,mix(d.background,d.foreground,.35));ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  ctx.fillStyle=rgba(d.foreground,.30);ctx.beginPath();ctx.arc(361,152,58,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=mix(d.background,d.foreground,.22);path(ctx,'M0 375 110 197 223 322 343 236 512 396V512H0Z',{fill:true,stroke:false});
  ctx.fillStyle=mix(d.background,'#101821',.30);path(ctx,'M0 455 186 274 332 415 412 338 512 454V512H0Z',{fill:true,stroke:false});
  ctx.strokeStyle=rgba(d.foreground,.38);ctx.lineWidth=8;path(ctx,'M56 478c91-98 151-46 199-123s91-57 139-20');
}
export function drawIcon(canvas,input,{badge=false,size=512}={}) {
  const d=normalizeIconDesign(input);canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);ctx.save();ctx.scale(size/512,size/512);
  if(!badge){
    ctx.fillStyle=d.background;ctx.fillRect(0,0,512,512);
    if(d.style==='illustration')landscape(ctx,d);
    if(d.style==='color'){
      const g=ctx.createLinearGradient(0,0,512,512);g.addColorStop(0,d.background);g.addColorStop(1,mix(d.background,d.foreground,.44));ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
      ctx.fillStyle=rgba(d.foreground,.12);path(ctx,'M-40 345 356-40h172L60 512H-40Z',{fill:true,stroke:false});ctx.fillStyle=rgba(d.foreground,.15);ctx.beginPath();ctx.arc(423,393,126,0,Math.PI*2);ctx.fill();
    }
    if(d.style==='mat'){ctx.fillStyle=rgba(d.foreground,.08);roundRect(ctx,73,73,366,366,66);ctx.strokeStyle=rgba(d.foreground,.17);ctx.lineWidth=3;roundRect(ctx,83,83,346,346,55,false);}
    if(d.style==='relief'){
      const g=ctx.createLinearGradient(64,64,448,448);g.addColorStop(0,mix(d.background,d.foreground,.16));g.addColorStop(1,mix(d.background,'#000000',.22));ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
      ctx.shadowColor=rgba('#000000',.3);ctx.shadowBlur=22;ctx.shadowOffsetY=13;ctx.fillStyle=mix(d.background,d.foreground,.10);roundRect(ctx,76,76,360,360,72);ctx.shadowBlur=ctx.shadowOffsetY=0;
    }
  }
  ctx.save();
  if(d.sports.length&&!badge){ctx.translate(256,233);ctx.scale(.78,.78);ctx.translate(-256,-256);}
  ctx.strokeStyle=ctx.fillStyle=badge?'#FFFFFF':d.foreground;ctx.lineWidth=20;ctx.lineCap='round';ctx.lineJoin='round';
  if(d.style==='relief'&&!badge){ctx.shadowColor=rgba('#000000',.34);ctx.shadowBlur=7;ctx.shadowOffsetY=5;}
  baseMark(ctx,d.base);ctx.restore();
  if(d.sports.length&&!badge){
    const count=d.sports.length,gap=count>3?83:94,start=256-gap*(count-1)/2;
    for(const [i,sport] of d.sports.entries()){
      const x=start+i*gap;ctx.save();ctx.translate(x,365);
      ctx.fillStyle=d.style==='minimal'?rgba(d.foreground,.1):rgba(d.background,.74);ctx.beginPath();ctx.arc(0,0,38,0,Math.PI*2);ctx.fill();
      ctx.scale(.64,.64);ctx.fillStyle=d.foreground;sportMark(ctx,sport);ctx.restore();
    }
  }
  ctx.restore();return canvas;
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function pngChunk(type,data) {
  const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);
  let crc=0xffffffff;for(const value of bytes.subarray(4,-4))crc=crcTable[(crc^value)&255]^(crc>>>8);view.setUint32(bytes.length-4,(crc^0xffffffff)>>>0);return bytes;
}
async function canvasPng(canvas,badge) {
  if(typeof CompressionStream==='undefined')return canvas.toDataURL('image/png');
  const size=canvas.width,channels=badge?4:3,pixels=canvas.getContext('2d').getImageData(0,0,size,size).data,stride=size*channels,raw=new Uint8Array(size*(stride+1));
  // Filtre vertical et RGB sans alpha pour l'app : PNG exacts, bien plus légers que l'encodeur rapide du canvas.
  for(let y=0;y<size;y++){
    raw[y*(stride+1)]=2;
    for(let x=0;x<size;x++)for(let c=0;c<channels;c++){const at=(y*size+x)*4+c;raw[y*(stride+1)+1+x*channels+c]=(pixels[at]-(y?pixels[at-size*4]:0))&255;}
  }
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()),header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,size);view.setUint32(4,size);header[8]=8;header[9]=badge?6:2;
  const parts=[Uint8Array.of(137,80,78,71,13,10,26,10),pngChunk('IHDR',header),pngChunk('IDAT',compressed),pngChunk('IEND',new Uint8Array())],all=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;
  for(const part of parts){all.set(part,at);at+=part.length;}
  let binary='';for(let i=0;i<all.length;i+=8192)binary+=String.fromCharCode(...all.subarray(i,i+8192));return 'data:image/png;base64,'+btoa(binary);
}
export async function iconPngBundle(input) {
  const canvas=document.createElement('canvas'),images={};
  for(const [name,size,badge] of [['icon192',192,false],['icon512',512,false],['apple180',180,false],['maskable512',512,false],['badge96',96,true]]){drawIcon(canvas,input,{size,badge});images[name]=await canvasPng(canvas,badge);}
  return images;
}
