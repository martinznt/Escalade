// Import CSV privé : formats réels d'escalade, durée/date strictes et provenance stable, sans record inventé.
import assert from 'node:assert/strict';
import { parseCSV, proposeMapping, buildImport, parseDurationCell, parseDateCell } from '../public/csv.js';
import { normalizeHistory } from '../public/shared.js';
import { cleanItem } from '../public/items.js';
const now=Date.UTC(2026,9,6,12);let n=0;
const ok=(name,fn)=>{fn();n++;console.log('  ✓',name);};
ok('durées décimales françaises et anglaises : les fractions de minute deviennent des secondes',()=>{
  for(const value of ['45.5','45,5','45.5 min','45,5 minutes'])assert.equal(parseDurationCell(value),2730,value);
  assert.equal(parseDurationCell('0,5 min'),30);assert.equal(parseDurationCell('3.5 sec'),4);
  assert.equal(parseDurationCell('1h10'),4200);assert.equal(parseDurationCell('1 h 10 min'),4200);
  assert.equal(parseDurationCell('100:20'),6020);assert.equal(parseDurationCell('1:05:09'),3909);
  assert.equal(parseDurationCell(''),null);
});
ok('durées malformées : pas de normalisation silencieuse des minutes, secondes, signes ou séparateurs',()=>{
  for(const value of ['1:60:00','1:00:60','12:60','1h60','-45','45..5','45,5,2','1:2:03','1:05:00 suite','9'.repeat(400)])assert.ok(Number.isNaN(parseDurationCell(value)),value);
});
ok('dates : calendrier et horloge vérifiés, texte résiduel et formats incomplets refusés',()=>{
  for(const value of ['2026-02-29','31/04/2026','2026-06-15T24:00','2026-06-15T12:60','2026-06-15T12:00:60Z','2026-06-15T12:00+24:00','2026-06-15T12:00+02:60','2026-06-15 erreur','15/06.2026','2026-06-15Z'])assert.equal(parseDateCell(value),null,value);
  assert.ok(parseDateCell('2024-02-29'));assert.ok(parseDateCell('15/06/26 8h05'));
  assert.equal(parseDateCell('2026-06-15 00:00'),new Date(2026,5,15,0,0).getTime());
});
ok('fuseau ISO explicite : instant UTC conservé quel que soit le fuseau local, décalages et secondes inclus',()=>{
  const before=process.env.TZ;
  try{
    for(const zone of ['UTC','Europe/Paris','America/Los_Angeles']){
      process.env.TZ=zone;
      assert.equal(parseDateCell('2026-01-01T00:30:45.125+02:00'),Date.UTC(2025,11,31,22,30,45,125),zone);
      assert.equal(parseDateCell('2026-06-15T12:45:30Z'),Date.UTC(2026,5,15,12,45,30),zone);
      assert.equal(parseDateCell('2026-06-15T12:45:30-0430'),Date.UTC(2026,5,15,17,15,30),zone);
      assert.equal(parseDateCell('2026-06-15'),new Date(2026,5,15,12).getTime(),zone);
    }
  }finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});
ok('escalade : correspondance explicite lieu et cotation, texte déclaré conservé et aucun record converti',()=>{
  const parsed=parseCSV('Date;Séance;Sport;Lieu;Cotation;Durée;Note\n2026-06-15T18:00:00+02:00;Bloc;Escalade bloc;Arkose;6B+ flash, échelle locale;45,5;Avec amis\n');
  const {mapping}=proposeMapping(parsed.headers);
  assert.equal(mapping[3],'place');assert.equal(mapping[4],'performance');
  const result=buildImport(parsed,mapping,'history',{now});assert.equal(result.errors.length,0);assert.equal(result.records.length,1);
  const record=result.records[0];assert.equal(record.startedAt,Date.UTC(2026,5,15,16));assert.equal(record.durationSeconds,2730);
  assert.equal(record.data.context.envName,'Arkose');assert.equal(record.data.quickLog.performance,'6B+ flash, échelle locale');
  assert.equal(record.data.quickLog.durationKnown,true);assert.deepEqual(record.data.exercises,[]);
  assert.equal(record.data.perf,undefined);assert.equal(record.data.ascent,undefined);
});
ok('tous les nouveaux historiques de fichier sont privés, exclus IA, avec provenance stable après relecture',()=>{
  const parsed=parseCSV('Date,Seance,Exercice,Series,Reps\n2026-06-15,Haut,Tractions,3,5\n2026-06-15,Haut,Pompes,2,8\n2026-06-16,Mobilité,Étirements,1,1\n');
  const {mapping}=proposeMapping(parsed.headers),a=buildImport(parsed,mapping,'history',{now}),b=buildImport(parsed,mapping,'history',{now:now+1000});
  assert.equal(a.records.length,2);assert.deepEqual(a.records.map(r=>r.id),b.records.map(r=>r.id));
  for(const record of a.records){
    assert.deepEqual(record.data.external,{provider:'file',id:record.id,channel:'file',private:true,excludeAI:true});
    assert.deepEqual(normalizeHistory(JSON.parse(JSON.stringify(record))).data.external,record.data.external);
    assert.equal(record.data.quickLog.durationKnown,false);
  }
});
ok('lignes regroupées : lieux et cotations distincts conservés sans répétition ; une ligne refusée ne modifie pas la séance',()=>{
  const parsed=parseCSV('Date;Seance;Lieu;Cotation;Exercice;Series;Reps;Note;Durée\n2026-06-15;Bloc;Arkose;6B;Bloc facile;2;1;Début;30\n2026-06-15;Bloc;Arkose;6B;Bloc facile;1;1;;30\n2026-06-15;Bloc;Autre secteur;6C;Bloc dur;1;1;;30\n2026-06-15;Bloc;Lieu incorrect;9A;Exercice invalide;x;1;Note incorrecte;99\n');
  const {mapping}=proposeMapping(parsed.headers),r=buildImport(parsed,mapping,'history',{now}),record=r.records[0];
  assert.equal(r.skipped,1);assert.equal(r.errors[0].row,5);assert.equal(record.durationSeconds,1800);
  assert.equal(record.data.context.envName,'Arkose — Autre secteur');assert.equal(record.data.quickLog.performance,'6B — 6C');
  assert.equal(record.data.note,'Début');assert.equal(record.data.exercises.length,3);
});
ok('erreurs par ligne : date refusée, durée ignorée avec durée inconnue explicite, textes bornés',()=>{
  const parsed=parseCSV(`Date;Lieu;Performance;Durée\n2026-06-15T25:00;Mur;6A;45\n2026-06-16;${'x'.repeat(100)};${'a'.repeat(150)};1:60:00\n`);
  const {mapping}=proposeMapping(parsed.headers),r=buildImport(parsed,mapping,'history',{now});
  assert.equal(r.skipped,1);assert.equal(r.records.length,1);assert.deepEqual(r.errors.map(e=>e.row),[2,3]);
  const record=r.records[0];assert.equal(record.data.context.envName.length,60);assert.equal(record.data.quickLog.performance.length,100);
  assert.equal(record.durationSeconds,0);assert.equal(record.data.quickLog.durationKnown,false);
});
ok('limites historiques identiques au serveur : cinq ans de 365 jours et dix minutes de tolérance, bornes incluses',()=>{
  const earliest=now-5*365*86400000,latest=now+10*60000;
  const times=[earliest,earliest-1,latest,latest+1];
  const parsed=parseCSV('Date;Seance\n'+times.map((date,i)=>new Date(date).toISOString()+';Séance '+i).join('\n'));
  const r=buildImport(parsed,{0:'date',1:'sessionName'},'history',{now});
  assert.deepEqual(r.records.map(record=>record.startedAt),[earliest,latest]);
  assert.equal(r.skipped,2);assert.deepEqual(r.errors.map(e=>e.row),[3,5]);
  assert.match(r.errors[0].error,/ancienne/);assert.match(r.errors[1].error,/futur/);
});
ok('durée supérieure à 24 h : ligne refusée sans troncature ni modification d’une séance déjà regroupée',()=>{
  const parsed=parseCSV('Date;Seance;Durée;Note\n2026-06-15;Longue;24:00:00;Durée exacte\n2026-06-15;Longue;24:00:01;Note à refuser\n2026-06-16;Autre;1440,5 min;Note à refuser\n');
  const {mapping}=proposeMapping(parsed.headers),r=buildImport(parsed,mapping,'history',{now});
  assert.equal(r.records.length,1);assert.equal(r.records[0].durationSeconds,86400);
  assert.equal(r.records[0].data.note,'Durée exacte');assert.equal(r.skipped,2);
  assert.deepEqual(r.errors.map(e=>e.row),[3,4]);assert.ok(r.errors.every(e=>/24 h/.test(e.error)));
});
ok('les limites de l’historique ne sont pas appliquées à l’import de performances',()=>{
  const later=new Date(now+12*3600000).toISOString();
  const parsed=parseCSV('Date;Test;Valeur\n2010-01-01T12:00Z;Tractions;12\n'+later+';Tractions;13\n');
  const r=buildImport(parsed,{0:'date',1:'metric',2:'value'},'perf',{now,metricMap:{Tractions:'max_tractions'}});
  assert.equal(r.records.length,2);assert.deepEqual(r.errors,[]);
});
ok('import perf séparé : source imported conservée par le schéma, aucun champ de provenance ignoré ajouté',()=>{
  const parsed=parseCSV('Date;Test;Valeur\n2026-06-15T12:00Z;Tractions;12\n');
  const r=buildImport(parsed,{0:'date',1:'metric',2:'value'},'perf',{now,metricMap:{Tractions:'max_tractions'}});
  const record=r.records[0],clean=cleanItem({...record,u:now});
  assert.equal(clean.d.source,'imported');assert.equal(record.d.external,undefined);assert.equal(clean.d.value,12);
});
console.log(`${n} tests CSV durées, dates et imports privés OK`);
