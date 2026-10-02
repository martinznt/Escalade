// tests/planning.test.mjs — organiser ses semaines : objectif daté construit à rebours (fondation, spécifique,
// affûtage), recalcul après des séances manquées, créneaux et horaires des lieux, pause vacances / blessure,
// pilote automatique de la semaine, conflits avec leur correction, séances non faites, semaine en 10 secondes.
import assert from 'node:assert/strict';
import * as P from '../public/planning.js';
import { programStatus, ymd } from '../public/program.js';
import { weekStreak } from '../public/motivation.js';
import { todayOptions, buildContext, regularity } from '../public/brain.js';
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };
const D = (s) => P.parseDay(s), DAY = 86400000;
const plus = (s, k) => ymd(D(s) + k * DAY);
const MON = '2026-10-05'; // un lundi
console.log('Planning');
ok('objectif daté à 10 semaines : fondation (semaine légère), spécifique, 2 semaines d’affûtage ; rien la veille ni le jour J', () => {
  const ev = plus(MON, 9 * 7 + 5); // samedi de la 10e semaine
  const p = P.backwardPlan({ eventDate: ev, eventLabel: 'Bleau', days: [0, 2, 4], minutes: 60, start: MON });
  assert.equal(p.weeks, 10); const ph = (w) => p.sessions.find((s) => s.week === w)?.phase;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ph), ['build', 'build', 'build', 'deload', 'build', 'specific', 'specific', 'specific', 'taper', 'taper']);
  assert.ok(!p.sessions.some((s) => s.date >= plus(ev, -1)), 'ni la veille ni le jour J');
  assert.deepEqual([...new Set(p.sessions.filter((s) => s.phase === 'taper').map((s) => s.minutes))], [42, 30], 'volume −30 % puis −50 %');
  assert.equal(p.sessions.find((s) => s.phase === 'deload').minutes, 42); assert.equal(p.eventDate, ev); assert.match(p.name, /^Bleau · /);
  assert.equal(P.eventPhase(p, D(MON)).phase, 'build'); assert.match(P.eventPhase(p, D(plus(ev, -3))).text, /J−3 .*Affûtage/);
  assert.match(P.eventPhase(p, D(ev)).text, /C’est aujourd’hui/);
});
ok('horizon court : une semaine spécifique puis l’affûtage ; date passée ou trop proche → rien', () => {
  const p = P.backwardPlan({ eventDate: plus(MON, 11), start: MON, days: [0, 2, 4] });
  assert.deepEqual([...new Set(p.sessions.map((s) => s.phase))], ['specific', 'taper']);
  assert.equal(P.backwardPlan({ eventDate: plus(MON, 1), start: MON }), null); assert.equal(P.backwardPlan({ eventDate: 'bientôt', start: MON }), null);
  const far = P.backwardPlan({ eventDate: plus(MON, 52 * 7), start: MON }); assert.equal(far.weeks, 24); assert.ok(far.start > MON, 'commence 24 semaines avant');
});
ok('recalcul : séances faites gardées, manquées abandonnées, suite reconstruite (jours changés), sans doublon', () => {
  const ev = plus(MON, 6 * 7 + 5), p = { id: 'pg1', ...P.backwardPlan({ eventDate: ev, eventLabel: 'Course', days: [0, 2, 4], start: MON }) };
  const hist = [{ startedAt: D(MON), data: { program: { id: 'pg1', i: 0 } } }];
  const now = D(plus(MON, 9)); // mercredi de la 2e semaine : lundi S1 fait, mercredi + vendredi S1 et lundi S2 manqués
  const { prog, dropped } = P.recalcToEvent(p, hist, now, { days: [1, 3] });
  assert.equal(dropped, 3); assert.ok(prog.sessions.some((s) => s.i === 0), 'la séance faite reste');
  const fut = prog.sessions.filter((s) => s.date >= ymd(now)); assert.ok(fut.length && fut.every((s) => [1, 3].includes(P.weekday(s.date))), 'nouveaux jours');
  assert.equal(new Set(prog.sessions.map((s) => s.i)).size, prog.sessions.length, 'identifiants uniques');
  const st = programStatus(prog, hist, now); assert.equal(st.done, 1); assert.equal(st.missed.length, 0, 'plus rien de « manqué » à traîner');
});
ok('créneaux nettoyés, horaires d’un lieu : ouvert / fermé / inconnu, première heure possible', () => {
  assert.deepEqual(P.cleanSlots([{ d: 1, from: '18:00', to: '20:00' }, { d: 1, from: '18:00', to: '20:00' }, { d: 9, from: '10:00', to: '11:00' }, { d: 2, from: '21:00', to: '20:00' }, { d: 0, from: '7:00', to: '8:00' }]), [{ d: 1, from: '18:00', to: '20:00' }]);
  const env = { name: 'Salle', hours: [{ d: 0, from: '12:00', to: '22:00' }] };
  assert.equal(P.isOpen(env, MON, '18:00', 60), true); assert.equal(P.isOpen(env, MON, '21:30', 60), false); assert.equal(P.isOpen(env, plus(MON, 1), '18:00'), false);
  assert.equal(P.isOpen({ name: 'x' }, MON, '18:00'), null); assert.equal(P.openTime(env, MON, 60), '12:00'); assert.equal(P.openTime(env, plus(MON, 1)), null);
});
ok('pause : vacances / blessure, dates, jours concernés', () => {
  const cfg = { pauseMode: 'vacances', pauseFrom: MON, pauseTo: plus(MON, 6) };
  const s = P.pauseState(cfg, D(plus(MON, 2))); assert.equal(s.active, true); assert.equal(s.daysLeft, 4); assert.match(s.text, /série de semaines est gardée/);
  assert.equal(P.pauseState(cfg, D(plus(MON, 8))).ended, true); assert.equal(P.pauseState({ pauseMode: 'n’importe', pauseFrom: MON }).active, false);
  assert.equal(P.inPause(cfg, plus(MON, 3)), true); assert.equal(P.inPause(cfg, plus(MON, 7)), false);
});
ok('événements étendus : une séance répétée chaque semaine apparaît chaque semaine jusqu’à sa fin', () => {
  const evs = [{ id: 'r', date: MON, title: 'Bloc', recurrence: { freq: 'weekly', until: plus(MON, 14) } }, { id: 'u', date: plus(MON, 3), title: 'Course' }];
  assert.deepEqual(P.eventsBetween(evs, MON, plus(MON, 27)).map((e) => `${e.id}@${e.on}`), [`r@${MON}`, `u@${plus(MON, 3)}`, `r@${plus(MON, 7)}`, `r@${plus(MON, 14)}`]);
});
const ctx0 = (o = {}) => ({ now: D(MON) - 4 * 3600000 /* lundi 8 h */, history: [], events: [], activities: { strength: {}, climbing_boulder: {} }, programs: [], ...o });
ok('pilote automatique : créneaux, espacement, veille d’un événement important au repos, forme basse, sports alternés', () => {
  const slots = [{ d: 0, from: '18:00', to: '19:00' }, { d: 1, from: '18:00', to: '20:00' }, { d: 3, from: '12:00', to: '13:00' }, { d: 5, from: '10:00', to: '12:00' }];
  const race = { id: 'race', date: plus(MON, 6), title: 'Compétition', meta: { kind: 'race' } };
  const w = P.weekPlan(ctx0({ events: [race] }), { from: MON, slots, perWeek: 3, minutes: 90, lowForm: true });
  assert.equal(w.sessions.length, 3); assert.ok(!w.sessions.some((s) => s.date === plus(MON, 5)), 'samedi = veille : repos');
  assert.ok(w.sessions[0].light, 'forme basse : la première est légère'); assert.equal(w.sessions.find((s) => s.date === plus(MON, 3)).minutes, 60, 'durée du créneau');
  assert.ok(w.sessions.every((s, k) => !k || P.parseDay(s.date) - P.parseDay(w.sessions[k - 1].date) >= DAY));
  assert.deepEqual(new Set(w.sessions.map((s) => s.activityId)).size, 2, 'les deux sports'); assert.match(w.notes.join(' '), /Repos prévu la veille de « Compétition »/);
});
ok('pilote automatique : aujourd’hui seulement s’il reste le temps dans le créneau', () => {
  const late = ctx0({ now: D(MON) + 9 * 3600000 }), slots = [{ d: 0, from: '18:00', to: '19:00' }, { d: 2, from: '18:00', to: '19:00' }];
  assert.ok(!P.weekPlan(late, { from: MON, slots, perWeek: 2, minutes: 60 }).sessions.some((s) => s.date === MON), 'lundi 21 h : trop tard pour le créneau 18–19 h');
  assert.ok(P.weekPlan(ctx0({ now: D(MON) - 2 * 3600000 }), { from: MON, slots, perWeek: 2, minutes: 60 }).sessions.some((s) => s.date === MON), 'lundi 10 h : encore possible');
});
ok('pilote automatique : ce qui est déjà prévu ou fait compte, vacances = rien, blessure = douces', () => {
  const planned = { id: 'p', date: plus(MON, 2), title: 'Séance', sessionId: 's1' };
  const w = P.weekPlan(ctx0({ events: [planned], history: [{ startedAt: D(MON) + 3600000, data: {} }] }), { from: MON, perWeek: 3 });
  assert.equal(w.sessions.length, 1); assert.ok(!w.sessions.some((s) => [MON, plus(MON, 2)].includes(s.date)));
  assert.deepEqual(P.weekPlan(ctx0(), { from: MON, perWeek: 3, pause: { pauseMode: 'vacances', pauseFrom: MON, pauseTo: plus(MON, 10) } }).sessions, []);
  const hurt = P.weekPlan(ctx0(), { from: MON, perWeek: 2, pause: { pauseMode: 'blesse', pauseFrom: MON } }); assert.ok(hurt.sessions.length === 0 || hurt.sessions.every((s) => s.light));
  const env = { id: 'e1', name: 'Salle', hours: [{ d: 0, from: '12:00', to: '14:00' }, { d: 2, from: '12:00', to: '14:00' }, { d: 4, from: '12:00', to: '14:00' }] };
  const w2 = P.weekPlan(ctx0(), { from: MON, perWeek: 2, minutes: 60, envFor: () => env }); assert.ok(w2.sessions.every((s) => s.time === '12:00' || P.isOpen(env, s.date, s.time, s.minutes) !== false));
});
ok('conflits : veille d’un événement, même créneau, lieu fermé, 3 jours d’affilée, vacances — chacun avec sa correction', () => {
  const env = { id: 'gym', name: 'Salle', hours: [{ d: 2, from: '10:00', to: '20:00' }] };
  const events = [
    { id: 'race', date: plus(MON, 5), title: 'Course', meta: { kind: 'race' } },
    { id: 'veille', date: plus(MON, 4), title: 'Jambes', time: '18:00' },
    { id: 'a', date: plus(MON, 1), title: 'A', time: '18:00', meta: { minutes: 60 } }, { id: 'b', date: plus(MON, 1), title: 'B', time: '18:30' },
    { id: 'late', date: plus(MON, 2), title: 'Muscu', time: '21:00', meta: { envId: 'gym', minutes: 60 } },
    { id: 'vac', date: plus(MON, 10), title: 'Bloc' }, { id: 'mon', date: MON, title: 'Gainage' },
  ];
  const c = P.conflicts(ctx0({ events }), { pause: { pauseMode: 'vacances', pauseFrom: plus(MON, 9), pauseTo: plus(MON, 12) }, envs: [env] });
  const k = Object.fromEntries(c.map((x) => [x.kind, x]));
  assert.equal(k.veille.eventId, 'veille'); assert.equal(k.veille.fix.kind, 'move'); assert.ok(k.veille.fix.date < plus(MON, 5));
  assert.equal(k.double.eventId, 'b'); assert.equal(k.horaires.fix.time, '10:00'); assert.equal(k.pause.eventId, 'vac');
  assert.equal(c.find((x) => x.kind === 'enchaine')?.eventId, 'a', 'lundi, mardi, mercredi : celle du mardi devient légère'); assert.equal(c.find((x) => x.kind === 'enchaine').fix.kind, 'light');
  assert.deepEqual(P.conflicts(ctx0({ events: [{ id: 'x', date: plus(MON, 4), title: 'Étirements', meta: { light: true } }, events[0]] })), [], 'séance légère la veille : pas de conflit');
});
ok('séances prévues non faites : proposées au prochain jour libre ; une séance faite ce jour-là compte', () => {
  const now = D(plus(MON, 3)) + 9 * 3600000, events = [{ id: 'm', date: plus(MON, 1), title: 'Force' }, { id: 'ok', date: plus(MON, 2), title: 'Bloc' }, { id: 'next', date: plus(MON, 3), title: 'Course' }];
  const r = P.missedEvents(ctx0({ now, events, history: [{ startedAt: D(plus(MON, 2)) + 3600000 }] }), now);
  assert.deepEqual(r.map((x) => x.event.id), ['m']); assert.equal(r[0].to, plus(MON, 4), 'jeudi occupé → vendredi');
});
ok('ta semaine en 10 secondes : séances, minutes comparées, prévu / fait, mesures, sommeil, douleurs', () => {
  const now = D(plus(MON, 6)) + 6 * 3600000; // dimanche 18 h (parseDay donne midi)
  const history = [{ startedAt: D(MON), durationSeconds: 3600, data: { activity: 'strength' } }, { startedAt: D(plus(MON, 2)), durationSeconds: 1800, data: {} }, { startedAt: D(plus(MON, -5)), durationSeconds: 3600, data: {} }];
  const r = P.weekReview({ now, history, events: [{ id: 'e', date: plus(MON, 2), title: 'x' }, { id: 'f', date: plus(MON, 4), title: 'y' }], perfs: [{ source: 'measured', date: D(plus(MON, 1)) }], wellness: [{ day: plus(MON, 1), sleep: 7 }, { day: plus(MON, 2), sleep: 8 }], pains: [{ date: D(plus(MON, 3)), level: 4 }] }, now);
  assert.equal(r.sessions, 2); assert.equal(r.minutes, 90); assert.match(r.lines[0], /2 séances, 90 min \(\+50 %/); assert.match(r.lines.join(' '), /1 séance faite sur 2 prévues/);
  assert.match(r.lines.join(' '), /7,5 h de sommeil/); assert.match(r.lines.join(' '), /douleur/);
  assert.match(P.weekReview({ now, history: [] }, now).lines[0], /Aucune séance/);
});
ok('pause : la série de semaines n’est pas cassée ; « Que faire aujourd’hui ? » respecte vacances et blessure', () => {
  const now = D(plus(MON, 28)) + 3600000, wk = (k) => ({ startedAt: D(plus(MON, k)) }), hist = [wk(0), wk(2), wk(7), wk(9), wk(21), wk(23), wk(28)];
  assert.equal(weekStreak(hist, [], { goal: 2, now }).streak, 1, 'sans pause : la semaine 3 vide casse la série');
  assert.equal(weekStreak(hist, [], { goal: 2, now, pause: { from: plus(MON, 14), to: plus(MON, 20) } }).streak, 3, 'semaine de vacances : la série continue');
  const items = (mode) => [{ c: 'config', id: 'pause', u: 1, d: { pauseMode: mode, pauseFrom: plus(MON, 27), pauseTo: plus(MON, 35) } }];
  const vac = todayOptions(buildContext({ items: items('vacances'), history: [], now }));
  assert.equal(vac.options[0].title, 'Profite de tes vacances 🏖️'); assert.match(vac.note, /Vacances/);
  const hurt = todayOptions(buildContext({ items: items('blesse'), history: [], now }));
  assert.ok(hurt.options.every((o) => o.light || o.kind === 'event' || o.kind === 'rest'), 'blessure : seulement du doux');
  const r = regularity(buildContext({ items: [{ c: 'config', id: 'pause', u: 1, d: { pauseMode: 'vacances', pauseFrom: plus(MON, 14), pauseTo: plus(MON, 20) } }], history: hist.map((h, i) => ({ id: 'h' + i, sessionName: 'x', durationSeconds: 60, data: {}, ...h })), now }));
  assert.ok(r.streakWeeks >= 3, `régularité : ${r.streakWeeks}`);
});
console.log(`\n${n} tests du planning OK`);
