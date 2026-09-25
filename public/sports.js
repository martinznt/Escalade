// sports.js — profil sportif extensible et moteur d'analyse multi-activité.
// Aucun service externe : les catégories sont générées localement à partir de dictionnaires explicites.
import { uid, normalizeSession } from './shared.js';

export const ACTIVITY_PRESETS = {
  climbing_boulder: { label:'Escalade — bloc', emoji:'🧗', aliases:['bloc','boulder','escalade bloc'], domains:[
    ['dalle','Dalle','Technique sur dalle'],['devers','Dévers','Force et placement en dévers'],['reglette','Réglette','Précision et force de doigts'],['pince','Pince','Force de pince'],['dynamique','Dynamique','Coordination et mouvements dynamiques'],['equilibre','Équilibre','Stabilité et placement'],['puissance','Puissance','Mouvements courts et intenses'],['lecture','Lecture','Lecture et résolution de blocs'] ]},
  climbing_route: { label:'Escalade — voie', emoji:'🧗‍♂️', aliases:['voie','lead','escalade voie','falaise'], domains:[
    ['technique','Technique','Efficacité des mouvements'],['clipage','Clipage','Placement et efficacité au mousquetonnage'],['endurance','Endurance','Capacité à durer'],['resistance','Résistance','Tenir les sections difficiles'],['lecture','Lecture','Lecture et anticipation'],['repos','Repos','Utilisation des repos'],['pied','Pieds','Précision et économie des pieds'],['mental','Gestion des essais','Gestion des essais et de la pression'] ]},
  strength: { label:'Musculation / force', emoji:'🏋️', aliases:['muscu','musculation','force','renforcement','renfo'], domains:[
    ['tirage','Tirage','Tractions, row et tirages'],['poussee','Poussée','Pompes, dips et développés'],['jambes','Jambes','Squat, fente et extension de hanche'],['gainage','Gainage','Tronc et transfert de force'],['epaules','Épaules','Stabilité et force des épaules'],['grip','Prise','Poigne et avant-bras'],['puissance','Puissance','Production de force rapide'],['mobilite','Mobilité','Amplitude utile au mouvement'] ]},
  running: { label:'Course', emoji:'🏃', aliases:['course','running','jogging','run'], domains:[
    ['endurance','Endurance fondamentale','Tenir un effort facile longtemps'],['seuil','Seuil','Soutenir une allure soutenue'],['vitesse','Vitesse','Produire une allure rapide'],['fractionne','Fractionné','Répéter des efforts rapides'],['cotes','Côtes','Force spécifique en montée'],['technique','Technique','Économie de course'],['mobilite','Mobilité','Amplitude et mobilité'],['recuperation','Récupération','Gérer la charge et les jours faciles'] ]},
  swimming: { label:'Natation', emoji:'🏊', aliases:['natation','swim','swimming'], domains:[
    ['technique','Technique','Efficacité des mouvements'],['endurance','Endurance','Tenir la distance'],['vitesse','Vitesse','Allure rapide'],['virages','Virages','Virages et coulées'],['respiration','Respiration','Coordination respiratoire'],['puissance','Puissance','Production de force'] ]},
};
// Basketball et Cyclisme sont volontairement absents des activités préconfigurées de la V1
// (hors périmètre demandé). L'utilisateur peut toujours les créer en activité personnalisée
// via addActivity() ci-dessous, qui suggère déjà des domaines pertinents pour « basket ».

const GENERIC = {
  max:['max','maximum','record','1rm','rm','meilleur'], reps:['traction','pull up','pompe','push up','dip','squat','fente','burpee','repetition','rep'],
  pulling:['traction','tirage','row','rowing','grimpe','suspension'], pushing:['pompe','push up','dip','développé','developpe','presse'], running:['course','km','5k','10k','allure','pace','vitesse'],
  grip:['pince','prise','grip','poutre','suspension','doigt'], endurance:['endurance','résistance','resistance','durée','distance','aérobie','aerobie'],
  technique:['technique','dalle','pied','appui','clipage','dribble','tir','passe','virage'], speed:['vitesse','dynamique','accélération','acceleration','fractionné','fractionne','sprint'],
};

const norm = (s) => String(s||'').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const includesAny = (t, words) => words.some(w => t.includes(norm(w)));

export function activityForName(name, activities = {}) {
  const n = norm(name);
  for (const [id,a] of Object.entries(ACTIVITY_PRESETS)) if (a.aliases.some(x=>n===norm(x)||n.includes(norm(x)))) return id;
  for (const [id,a] of Object.entries(activities||{})) if (a.aliases?.some(x=>n===norm(x)||n.includes(norm(x)))) return id;
  return 'custom';
}

export function domainsForActivity(activityId, activities = {}) {
  const a = ACTIVITY_PRESETS[activityId] || activities[activityId];
  return a?.domains || [];
}

export function defaultProfile() { return { activities:{}, metrics:[], notes:[], version:2 }; }

export function ensureActivity(profile, id, label, emoji='🏅') {
  const p = profile && typeof profile==='object' ? profile : defaultProfile();
  p.activities ||= {};
  if (!p.activities[id]) {
    const preset = ACTIVITY_PRESETS[id];
    p.activities[id] = { id, label: label || preset?.label || id, emoji: emoji || preset?.emoji || '🏅', domains: (preset?.domains||[]).map(([key,name,desc])=>({key,name,description:desc,score:null})), custom:false };
  }
  return p.activities[id];
}

export function addActivity(profile, label, aliases=[]) {
  const clean = String(label||'').trim().slice(0,60); if (!clean) return null;
  const id = `custom_${norm(clean).replace(/\s+/g,'_').slice(0,36)}_${uid().slice(-6)}`;
  const p = ensureActivity(profile,id,clean,'🏅');
  p.custom = true; p.aliases = [clean,...aliases.map(String)].slice(0,20);
  // Catégories initiales déduites des mots du nom; l'utilisateur peut ensuite tout modifier.
  const n = norm(clean);
  const guessed = [];
  if (includesAny(n,['basket'])) guessed.push(['appuis','Appuis'],['vitesse','Vitesse'],['endurance','Endurance']);
  if (includesAny(n,['football','foot'])) guessed.push(['vitesse','Vitesse'],['endurance','Endurance'],['technique','Technique']);
  if (includesAny(n,['tennis'])) guessed.push(['appuis','Appuis'],['service','Service'],['endurance','Endurance']);
  if (!guessed.length) guessed.push(['technique','Technique'],['force','Force'],['endurance','Endurance']);
  p.domains = guessed.map(([key,name])=>({key,name,description:`Indicateur adapté à ${clean}`,score:null}));
  return p;
}

export function inferDomain(activityId, label, explicitDomain='', activities={}) {
  if (explicitDomain) return explicitDomain;
  const a = ACTIVITY_PRESETS[activityId] || activities[activityId];
  const n = norm(label);
  const domains = a?.domains || [];
  for (const d of domains) { const key=Array.isArray(d)?d[0]:d.key, name=Array.isArray(d)?d[1]:d.name; if (n.includes(norm(key)) || n.includes(norm(name))) return key; }
  if (includesAny(n,GENERIC.pulling)) return 'tirage';
  if (includesAny(n,GENERIC.pushing)) return 'poussee';
  if (includesAny(n,GENERIC.grip)) return 'grip';
  if (includesAny(n,GENERIC.running)) return 'endurance';
  if (includesAny(n,GENERIC.speed)) return 'vitesse';
  if (includesAny(n,GENERIC.endurance)) return 'endurance';
  if (includesAny(n,GENERIC.technique)) return 'technique';
  return domains[0]?.[0] || 'general';
}

export function addDomain(profile, activityId, name, description='') {
  const clean=String(name||'').trim().slice(0,60); if(!clean)return null;
  const a=profile.activities?.[activityId] || ensureActivity(profile,activityId);
  a.domains ||= [];
  const key=norm(clean).replace(/\s+/g,'_').slice(0,40)||`domain_${uid().slice(-6)}`;
  const d={key,name:clean,description:String(description||'').trim().slice(0,180),score:null};
  a.domains.push(d); return d;
}

export function addMetric(profile, metric) {
  profile.metrics ||= [];
  const m = { id:metric.id||uid(), name:String(metric.name||'').trim().slice(0,80), activityId:String(metric.activityId||'custom'), domain:String(metric.domain||'').slice(0,40), value:Number(metric.value), unit:String(metric.unit||'').slice(0,20), score:metric.score==null?null:Math.max(0,Math.min(100,Number(metric.score)||0)), note:String(metric.note||'').slice(0,300), updatedAt:Date.now() };
  if (!m.name || !Number.isFinite(m.value) && m.score==null) return null;
  if (!m.domain) m.domain=inferDomain(m.activityId,m.name,'',profile.activities);
  const idx=profile.metrics.findIndex(x=>x.id===m.id); if(idx>=0) profile.metrics[idx]=m; else profile.metrics.unshift(m);
  return m;
}

function metricScore(m) {
  if (Number.isFinite(m.score)) return Math.max(0,Math.min(100,m.score));
  // Échelle interne prudente : les valeurs sont comparées à un plafond configurable,
  // pas présentées comme un classement de performance réel.
  const n=norm(m.name), v=Math.max(0,Number(m.value)||0);
  let max=50;
  if(includesAny(n,['traction','pull up'])) max=30;
  else if(includesAny(n,['pompe','push up'])) max=80;
  else if(includesAny(n,['dip'])) max=50;
  else if(includesAny(n,['5k'])) max=40;
  else if(includesAny(n,['10k'])) max=90;
  else if(includesAny(n,['km'])) max=100;
  else if(includesAny(n,['kg','charge','1rm','rm'])) max=150;
  return Math.max(0,Math.min(100,v/max*100));
}

export function analyzeProfile(profile, activityId) {
  const metrics=(profile?.metrics||[]).filter(m=>!activityId||m.activityId===activityId);
  const by={};
  for(const m of metrics){const d=m.domain||'general';(by[d] ||= []).push({...m,_score:metricScore(m),_declared:Number.isFinite(m.score)});}
  const labels=Object.fromEntries(((ACTIVITY_PRESETS[activityId]?.domains)||profile?.activities?.[activityId]?.domains||[]).map(d=>Array.isArray(d)?[d[0],d[1]]:[d.key,d.name]));
  const domains=Object.entries(by).map(([domain,items])=>({domain,label:labels[domain]||domain,score:Math.round(items.reduce((a,x)=>a+x._score,0)/items.length),estimated:items.some(x=>!x._declared),metrics:items})).sort((a,b)=>b.score-a.score);
  const avg=domains.length?domains.reduce((a,x)=>a+x.score,0)/domains.length:50;
  const strengths=domains.filter(x=>x.score>=avg+8).slice(0,5), weaknesses=domains.filter(x=>x.score<=avg-8).slice(0,5);
  return {domains,strengths,weaknesses,average:Math.round(avg),metricCount:metrics.length};
}

const E = (id,name,emoji,domain,cues,sets=3,repsMin=8,repsMax=12,rest=60) => ({id,name,emoji,domain,cues,sets,repsMin,repsMax,rest,mode:'reps',muscles:[]});
export const ACTIVITY_EXERCISES = {
  strength:[E('gen-push','Pompes','🤜','poussee',['Corps gainé, amplitude confortable.']),E('gen-pull','Tractions','⬆️','tirage',['Épaules actives, mouvement contrôlé.'],4,4,8,120),E('gen-squat','Squat','🦵','jambes',['Pieds stables, genoux suivent les pieds.'],3,8,15,75),E('gen-core','Gainage','🧱','gainage',['Corps aligné, respiration régulière.'],3,25,45,45)],
  running:[{id:'run-easy',name:'Course facile',emoji:'🏃',domain:'endurance',mode:'time',sets:1,secMin:900,secMax:1800,rest:0,cues:['Allure confortable : tu dois pouvoir parler par phrases.']},{id:'run-intervals',name:'Intervalles rapides',emoji:'⚡',domain:'fractionne',mode:'time',sets:6,secMin:30,secMax:60,rest:90,cues:['Reste rapide mais propre, récupération complète si nécessaire.']},{id:'run-hills',name:'Côtes',emoji:'⛰️',domain:'cotes',mode:'time',sets:6,secMin:30,secMax:60,rest:120,cues:['Monte avec des foulées régulières, redescends en récupération.']},{id:'run-tech',name:'Technique de course',emoji:'👟',domain:'technique',mode:'time',sets:4,secMin:30,secMax:45,rest:45,cues:['Travaille la cadence et la posture sans forcer.']}],
  basketball:[{id:'bb-foot',name:'Appuis et changements de direction',emoji:'🏀',domain:'appuis',mode:'time',sets:5,secMin:20,secMax:30,rest:60,cues:['Freine progressivement et garde le contrôle du genou.']},{id:'bb-dribble',name:'Dribble main faible',emoji:'🏀',domain:'dribble',mode:'time',sets:5,secMin:45,secMax:60,rest:45,cues:['Regarde régulièrement devant toi.']},{id:'bb-jump',name:'Sauts verticaux contrôlés',emoji:'⬆️',domain:'detente',sets:4,repsMin:5,repsMax:6,rest:90,mode:'reps',cues:['Atterrissage silencieux et stable.']},{id:'bb-defense',name:'Déplacements défensifs',emoji:'🛡️',domain:'defense',mode:'time',sets:5,secMin:20,secMax:30,rest:60,cues:['Buste stable, petits pas rapides.']}],
};

export function generateGenericSession({activityId, mode='weaknesses', duration='medium'}, profile, settings={}) {
  const a=ACTIVITY_PRESETS[activityId]||profile?.activities?.[activityId]||{label:'Activité',emoji:'🏅',domains:[]};
  const analysis=analyzeProfile(profile,activityId);
  let pool=(ACTIVITY_EXERCISES[activityId]||[]).slice();
  if(!pool.length){
    const domains=(a.domains||[]).map(d=>Array.isArray(d)?d[0]:d.key).filter(Boolean);
    pool=domains.map((domain,i)=>({id:`custom-${domain}-${i}`,name:`Travail ${domain}`,emoji:a.emoji||'🏅',domain,mode:'time',sets:4,secMin:45,secMax:60,rest:60,cues:[`Travaille ${domain} avec une difficulté maîtrisée et une technique propre.`],muscles:[]}));
  }
  if(!pool.length) pool=ACTIVITY_EXERCISES.strength.slice();
  const order=new Map((mode==='strengths'?analysis.strengths:analysis.weaknesses).map((x,i)=>[x.domain,i]));
  pool.sort((x,y)=>(order.has(x.domain)?order.get(x.domain):99)-(order.has(y.domain)?order.get(y.domain):99));
  const wanted=duration==='short'?3:duration==='long'?6:4;
  const chosen=[]; for(const e of pool){if(!chosen.some(x=>x.domain===e.domain))chosen.push(e);if(chosen.length>=wanted)break;}
  while(chosen.length<wanted) chosen.push(pool[chosen.length%pool.length]);
  const exercises=chosen.map(x=>({...x,id:uid()}));
  const focusLabel=mode==='strengths'?'tes points forts':'tes points faibles';
  const why=analysis.metricCount?`Séance ${a.label} orientée vers ${focusLabel}. Domaines analysés : ${analysis.domains.map(x=>`${x.domain} ${x.estimated?'≈':''}${x.score}/100`).join(', ')}${analysis.domains.some(x=>x.estimated)?' (≈ = estimation interne, pas une mesure)':''}.`:'Profil encore peu renseigné : ajoute des indicateurs pour rendre l’analyse plus précise.';
  return {session:normalizeSession({id:uid(),name:`${a.emoji} ${a.label} — ${mode==='strengths'?'Points forts':'Points faibles'}`,emoji:a.emoji,goal:`${activityId}:${mode}`,source:'generated',durationMin:0,objectives:[why],notes:[{title:'Analyse du profil',text:why}],exercises,createdAt:Date.now(),updatedAt:Date.now()}),meta:{analysis,activity:a,mode}};
}
