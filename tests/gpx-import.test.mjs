import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseTrack, trackActivity, trackImportId, trackFingerprint } from '../public/sports.js';

let count = 0;
const test = async (name, fn) => { await fn(); count++; console.log('  ✓', name); };
const time = (suffix) => `<Time>2026-10-01T07:${suffix}:00Z</Time>`;
const point = (body) => `<Trackpoint>${body}</Trackpoint>`;
const tcx = (...points) => `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Track>${points.join('')}</Track></Activity></Activities></TrainingCenterDatabase>`;

await test('TCX sans GPS, distance, altitude et cardio : valeurs inconnues conservées, aucun zéro inventé', () => {
  const result = parseTrack(tcx(point(time('00')), point(time('30'))));
  assert.equal(result.durationSec, 1800); assert.equal(result.distanceKm, null); assert.equal(result.gain, null); assert.equal(result.hrAvg, null); assert.equal(result.hrMax, null); assert.equal(result.pace, '');
});
await test('TCX : point GPS partiel ignoré et altitude manquante ne crée pas une ascension fictive', () => {
  const result = parseTrack(tcx(point(`${time('00')}<Position><LatitudeDegrees>48</LatitudeDegrees><LongitudeDegrees>2</LongitudeDegrees></Position><AltitudeMeters>100</AltitudeMeters>`), point(time('10')), point(`${time('30')}<Position><LatitudeDegrees>48.01</LatitudeDegrees></Position><AltitudeMeters>110</AltitudeMeters>`)));
  assert.equal(result.distanceKm, null); assert.equal(result.gain, 10);
});
await test('TCX : une distance explicitement mesurée à zéro reste connue', () => {
  const result = parseTrack(tcx(point(`${time('00')}<DistanceMeters>0</DistanceMeters>`), point(`${time('30')}<DistanceMeters>0</DistanceMeters>`)));
  assert.equal(result.distanceKm, 0); assert.equal(result.gain, null);
});
await test('GPX : attributs entre apostrophes et balises TCX préfixées reconnus sans perdre le cardio', () => {
  const gpx = `<gpx><trk><type>bouldering</type><trkseg><trkpt lat='48' lon='2'><time>2026-10-01T07:00:00Z</time></trkpt><trkpt lat='48.01' lon='2'><time>2026-10-01T07:30:00Z</time></trkpt></trkseg></trk></gpx>`;
  assert.ok(parseTrack(gpx).distanceKm > 1); assert.equal(trackActivity(parseTrack(gpx)), 'climbing_boulder');
  const text = `<x:TrainingCenterDatabase><x:Activity Sport='Running'><x:Trackpoint><x:Time>2026-10-01T07:00:00Z</x:Time><x:DistanceMeters>0</x:DistanceMeters><x:HeartRateBpm><x:Value>130</x:Value></x:HeartRateBpm></x:Trackpoint><x:Trackpoint><x:Time>2026-10-01T07:30:00Z</x:Time><x:DistanceMeters>5000</x:DistanceMeters><x:HeartRateBpm><x:Value>150</x:Value></x:HeartRateBpm></x:Trackpoint></x:Activity></x:TrainingCenterDatabase>`;
  const result = parseTrack(text); assert.equal(result.distanceKm, 5); assert.equal(result.hrAvg, 140); assert.equal(result.hrMax, 150);
});
await test('GPX : segments interrompus ne créent ni trajet ni ascension entre deux traces séparées', () => {
  const p = (lat, ele, minute) => `<trkpt lat="${lat}" lon="2"><ele>${ele}</ele><time>2026-10-01T07:0${minute}:00Z</time></trkpt>`;
  const result = parseTrack(`<gpx><trk><trkseg>${p(48, 100, 0)}${p(48.001, 105, 1)}</trkseg><trkseg>${p(49, 300, 2)}${p(49.001, 305, 3)}</trkseg></trk></gpx>`);
  assert.equal(result.distanceKm, 0.22); assert.equal(result.gain, 10);
});
await test('empreinte SHA-256 exacte et idempotence du fichier propre à chaque compte', async () => {
  const text = tcx(point(time('00')), point(time('30'))), expected = createHash('sha256').update(text).digest('hex');
  assert.equal(await trackFingerprint(text), expected);
  const id = await trackImportId(text, 'owner-A'); assert.match(id, /^[\w-]{1,64}$/);
  assert.equal(await trackImportId(text, 'owner-A'), id); assert.notEqual(await trackImportId(text, 'owner-B'), id); assert.notEqual(await trackImportId(text + '\n', 'owner-A'), id);
});
await test('fichier trop long : refus complet, aucune activité calculée sur un texte tronqué', () => {
  assert.equal(parseTrack(' '.repeat(25e6 + 1)), null);
});
console.log(`\n${count} tests import GPX / TCX OK`);
