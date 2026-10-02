// tests/sports.test.mjs — outils par sport : styles d'escalade, score de compétition, bloc généré sur un pan,
// entraînement selon l'endroit où l'on tombe, conditions en falaise, échauffement des doigts, disques, 1RM, Riegel,
// allures VMA, longueurs de natation, import GPX / TCX, mesures d'un dynamomètre Bluetooth.
import assert from 'node:assert/strict';
import * as SP from '../public/sports.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
console.log('Outils par sport');
ok('styles : part du premier essai (à vue + flash), réussite par style (3 essais au moins), point fort / à travailler', () => {
  const a = (result, styles) => ({ kind: 'voie', result, styles, date: 1 });
  const list = [a('onsight', ['devers']), a('flash', ['devers']), a('work', ['devers']), a('attempt', ['dalle']), a('attempt', ['dalle']), a('send', ['dalle']), a('fail', ['dalle'])];
  const s = SP.styleStats(list, { devers: { label: 'Dévers' }, dalle: { label: 'Dalle' } });
  assert.equal(s.sent, 4); assert.equal(s.firstTry, 50); assert.equal(s.strong.label, 'Dévers'); assert.equal(s.strong.rate, 100); assert.equal(s.weak.label, 'Dalle'); assert.equal(s.weak.rate, 25);
  assert.equal(SP.styleStats([a('send', ['x'])]).rows.length, 0, 'moins de 3 essais : rien conclu');
});
ok('compétition : tops, zones et essais (un top compte comme zone)', () => {
  const r = SP.compScore([{ top: 1, zone: 1 }, { top: 3, zone: 2 }, { top: 0, zone: 4 }, { top: 0, zone: 0 }, { top: 2 }]);
  assert.deepEqual([r.tops, r.zones, r.topAttempts, r.zoneAttempts], [3, 4, 6, 9]); assert.equal(r.text, '3T4Z 6 9');
});
ok('pan maison : bloc tiré d’en bas jusqu’en haut, mouvements à portée, toujours le même pour une même graine', () => {
  const holds = []; for (let i = 0; i < 40; i++) holds.push({ x: ((i * 37) % 100) / 100, y: ((i * 53) % 100) / 100 });
  const p = SP.boardProblem(holds, { level: 'moyen', seed: 3 }); assert.ok(p, 'un bloc trouvé');
  const seq = [p.start, ...p.moves, p.top].map((i) => holds[i]);
  for (let k = 1; k < seq.length; k++) { assert.ok(seq[k].y < seq[k - 1].y, 'toujours plus haut'); assert.ok(Math.hypot(seq[k].x - seq[k - 1].x, seq[k].y - seq[k - 1].y) <= SP.BOARD_LEVELS.moyen.reach + 1e-9, 'à portée'); }
  assert.ok(holds[p.top].y <= Math.min(...holds.map((h) => h.y)) + 0.12, 'arrive en haut');
  assert.deepEqual(SP.boardProblem(holds, { level: 'moyen', seed: 3 }), p); assert.equal(SP.boardProblem(holds.slice(0, 3)), null);
});
ok('chute : capacités ciblées et conseils selon la raison', () => {
  const t = SP.fallTraining(['doigts', 'resistance']); assert.deepEqual(Object.keys(t.caps).sort(), ['endurance_doigts', 'force_doigts']); assert.equal(t.tips.length, 2);
  assert.deepEqual(SP.fallTraining(['inconnu']).tips, []);
});
ok('conditions en falaise : pluie la veille → humide, frais et sec → bon, trop chaud → mauvais', () => {
  const time = [], T = [], H = [], P = [], W = [];
  for (let d = 1; d <= 3; d++) for (let hh = 0; hh < 24; hh++) { time.push(`2026-10-0${d}T${String(hh).padStart(2, '0')}:00`); T.push(d === 3 ? 28 : 10); H.push(50); P.push(d === 1 && hh === 20 ? 4 : 0); W.push(12); }
  const c = SP.cragConditions({ time, temperature_2m: T, relative_humidity_2m: H, precipitation: P, wind_speed_10m: W }, new Date(2026, 9, 1, 7).getTime());
  const get = (day, slot) => c.find((x) => x.day === day && x.slot === slot);
  assert.equal(get('2026-10-01', 'matin').score, 2); assert.equal(get('2026-10-02', 'matin').score, 0, 'pluie la veille au soir'); assert.match(get('2026-10-02', 'matin').text, /humide/);
  assert.equal(get('2026-10-03', 'après-midi').score, 0); assert.match(get('2026-10-03', 'après-midi').text, /chaud/);
  assert.deepEqual(SP.cragConditions(null), []);
});
ok('échauffement des doigts ajouté avant le premier exercice de doigts intense, une seule fois', () => {
  const ex = [{ name: 'Montée en température', block: 'warmup' }, { name: 'Suspensions max', libId: 'hang-max', risk: 'finger', intensity: 'high' }, { name: 'Repeaters', risk: 'finger', intensity: 'high' }];
  const r = SP.withFingerWarm(ex); assert.ok(r.added); assert.equal(r.exercises[1].libId, 'wu-fingers'); assert.equal(r.exercises.length, 4); assert.equal(r.before, 'Suspensions max');
  assert.equal(SP.withFingerWarm(r.exercises).added, false, 'déjà là'); assert.equal(SP.withFingerWarm([{ name: 'Pompes' }]).added, false);
});
ok('disques : de chaque côté, barre de 20 kg ; charge max estimée et tableau', () => {
  assert.deepEqual(SP.plates(72.5).perSide, [25, 1.25]); assert.equal(SP.plates(100).text, '25 + 15 kg de chaque côté'); assert.equal(SP.plates(15).ok, false); assert.equal(SP.plates(20).text, 'barre seule');
  assert.equal(SP.plates(21).ok, false, '0,5 kg de chaque côté : impossible avec ces disques');
  assert.equal(SP.oneRM(100, 1), 100); assert.equal(SP.oneRM(80, 6), 94.5); assert.equal(SP.oneRM(80, 20), null, 'trop de répétitions : pas fiable');
  assert.deepEqual(SP.percentTable(100).slice(0, 2).map((x) => [x.pct, x.kg, x.reps]), [[100, 100, 1], [95, 95, 2]]);
  const hist = [{ startedAt: 1, data: { exercises: [{ name: 'Squat', sets: [{ load: 80, reps: 6 }, { load: 90, reps: 2 }] }] } }];
  assert.equal(SP.best1RM(hist, 'Squat', 2).rm, 94.5); assert.equal(SP.strengthBoard(hist, 2)[0].name, 'Squat');
});
ok('course : Riegel (10 km en 50 min → semi ≈ 1 h 50) et allures VMA', () => {
  const p = SP.racePredictions(50 * 60, 10); assert.equal(p[1].time, '50 min 00'); assert.equal(p[2].time, '1 h 50'); assert.equal(p[1].pace, "5'00 /km");
  const v = SP.vmaPaces(15); assert.equal(v.length, 3); assert.match(v[0][2], /5'20 \/km à 6'09 \/km/); assert.equal(SP.vmaPaces(2), null);
  assert.equal(SP.fmtPace(4.999), "5'00 /km");
});
ok('natation : longueurs, distance, temps moyen et dernier 100 m', () => {
  const r = SP.laps([30e3, 62e3, 95e3, 126e3], { pool: 25, start: 0 }); assert.deepEqual([r.lengths, r.distance, r.totalSec, r.per100, r.last100], [4, 100, 126, 126, 126]);
  assert.equal(SP.laps([30e3, 62e3, 95e3, 126e3, 158e3, 190e3], { pool: 50, start: 0 }).last100, 64);
});
ok('import GPX et TCX : durée, distance, dénivelé, cardio, sport', () => {
  const gpx = `<?xml version="1.0"?><gpx><metadata><name>Sortie du matin</name></metadata><trk><type>running</type><trkseg>
    <trkpt lat="48.8500" lon="2.3500"><ele>35</ele><time>2026-10-01T07:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="48.8590" lon="2.3500"><ele>45</ele><time>2026-10-01T07:05:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="48.8680" lon="2.3500"><ele>40</ele><time>2026-10-01T07:10:00Z</time></trkpt></trkseg></trk></gpx>`;
  const g = SP.parseTrack(gpx); assert.equal(g.durationSec, 600); assert.ok(Math.abs(g.distanceKm - 2) < 0.05, `${g.distanceKm}`); assert.equal(g.gain, 10); assert.equal(g.hrAvg, 145); assert.equal(g.sport, 'running'); assert.equal(g.name, 'Sortie du matin');
  assert.equal(SP.trackActivity(g), 'running');
  const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Lap><Track><Trackpoint><Time>2026-10-01T07:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>130</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2026-10-01T07:30:00Z</Time><DistanceMeters>5000</DistanceMeters><HeartRateBpm><Value>160</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
  const t = SP.parseTrack(tcx); assert.deepEqual([t.durationSec, t.distanceKm, t.hrMax, t.pace], [1800, 5, 160, "6'00 /km"]);
  assert.equal(SP.parseTrack('<html>rien</html>'), null);
});
ok('dynamomètre : mesures notifiées (poids float32, temps µs) et résumé d’une traction', () => {
  const buf = new ArrayBuffer(2 + 8 * 3), dv = new DataView(buf); dv.setUint8(0, 1); dv.setUint8(1, 24);
  [[10, 0], [42.5, 100000], [30, 200000]].forEach(([kg, us], i) => { dv.setFloat32(2 + i * 8, kg, true); dv.setUint32(6 + i * 8, us, true); });
  const s = SP.parseTindeq(new Uint8Array(buf)); assert.deepEqual(s.map((x) => x.kg), [10, 42.5, 30]); assert.equal(s[2].us, 200000);
  assert.deepEqual(SP.parseTindeq(new Uint8Array([0, 1, 2])), [], 'autre réponse : ignorée');
  const p = SP.pullSummary(s); assert.equal(p.peak, 42.5); assert.equal(p.seconds, 0.1);
});
console.log(`\n${n} tests des outils par sport OK`);
