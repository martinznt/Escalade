// demo.js — « Voir une démo » : l'app remplie avec des données d'exemple, sans compte, rien n'est envoyé ni gardé.
// Les données de démo vivent sous un identifiant à part (« demo ») : elles ne se mélangent jamais au mode invité
// ni à un compte, et sont effacées en quittant la démo.
import { h, toast } from './ui.js';
import { S, ACT, render, go, putItem, addHistory, loadLocal, clearLocal, ls } from './state.js';
import { ACTIVITIES } from './model.js';
import { uid } from './shared.js';

export const DEMO = Object.freeze({ id: 'demo', username: 'Démo', guest: true, demo: true });
const DAY = 86400000;

/** Quelques semaines d'entraînement plausibles : escalade, renforcement, course ; mesures, check-ins, un projet. */
export function seedDemo(now = Date.now()) {
  for (const id of ['climbing_boulder', 'conditioning', 'running']) putItem('activity', 'act-' + id, { preset: id, label: ACTIVITIES[id].label, emoji: ACTIVITIES[id].emoji, archived: false });
  putItem('config', 'main', { setupDone: true, setupLater: 0, perWeek: 3, climbPerWeek: 2, goals: ['climb', 'force'], tourDone: true });
  putItem('config', 'body', { age: 29, height: 175, weight: 70, sex: 'x' });
  putItem('env', 'demo-gym', { name: 'Salle de bloc (exemple)', type: 'escalade', equipment: ['wall', 'hangboard', 'pullup_bar'], city: 'Lyon' });
  const plan = [['Bloc : technique', 'climbing_boulder', 75], ['Renfo haut du corps', 'conditioning', 40], ['Footing facile', 'running', 35]];
  for (let k = 0; k < 18; k++) {
    const [name, activity, min] = plan[k % 3], at = now - (k * 2.3 + 1) * DAY;
    addHistory({ id: 'demo-h' + k, sessionName: name, startedAt: Math.round(at), durationSeconds: (min + (k % 4) * 5) * 60, data: { activity, rpe: 2 + (k % 3), context: activity === 'climbing_boulder' ? { env: 'demo-gym' } : {},
      exercises: activity === 'conditioning' ? [{ name: 'Tractions', sets: [{ reps: 6 + (k % 3), done: true }, { reps: 6, done: true }, { reps: 5, done: true }] }, { name: 'Pompes', sets: [{ reps: 15, done: true }, { reps: 12, done: true }] }, { name: 'Étirements des épaules', sets: [{ seconds: 60, done: true }] }]
        : activity === 'running' ? [{ name: 'Footing', sets: [{ seconds: min * 60, done: true }] }] : [{ name: 'Blocs variés', sets: [{ reps: 8, done: true }] }] } });
  }
  const g = (label, order) => ({ systemId: 'font', systemName: 'Fontainebleau', levelId: 'l' + order, label, order, total: 20, color: '' });
  [['5c', 6, 'flash'], ['6a', 8, 'send'], ['6a', 8, 'onsight'], ['6a+', 9, 'work'], ['6b', 10, 'attempt']].forEach(([l, o, r], i) => putItem('ascent', 'demo-a' + i, { kind: 'bloc', name: '', grade: g(l, o), result: r, attempts: r === 'attempt' ? 3 : 1, date: now - (i * 4 + 2) * DAY, context: { env: 'demo-gym' } }));
  putItem('project', 'demo-p1', { kind: 'bloc', name: 'Le dévers jaune', status: 'active', tries: [], holds: [], startedAt: now - 20 * DAY, place: 'Salle de bloc (exemple)', grade: g('6b', 10) });
  [['max_tractions', [6, 7, 9]], ['body_weight', [71.5, 70.8, 70.2]], ['masse_grasse', [18, 17.4, 16.9]]].forEach(([m, vals]) => vals.forEach((v, i) => putItem('perf', `demo-${m}-${i}`, { metricId: m, value: v, date: now - (100 - i * 45) * DAY, source: 'measured' })));
  for (let d = 1; d <= 6; d++) { const t = new Date(now - d * DAY), day = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; putItem('wellness', 'wb-' + day, { day, at: t.getTime(), sleep: 6.5 + (d % 3) * 0.5, energy: 3 + (d % 2), soreness: 2, stress: 2 }); }
  putItem('season', 'demo-s1', { theme: 'regularite', start: now - 9 * DAY, closed: false, won: false });
}
ACT.demoStart = async () => {
  await clearLocal('demo');
  // Mémoire remise à zéro : rien d'un autre compte (ou du mode invité) ne doit apparaître dans la démo.
  S.seances = { items: [], tomb: {} }; S.history = []; S.events = []; S.personal = []; S.commonEx = []; S.items = new Map(); S.dirtyItems = new Set(); S.outbox = []; S.failed = []; S.itemsCursor = 0; S.lastSync = 0;
  S.user = { ...DEMO }; S.loaded = false; render(); await loadLocal();
  seedDemo(); go('home', 'dash'); render();
  toast('🎬 Démo : des données d’exemple pour tout essayer. Rien n’est envoyé ni gardé.', 4500);
};
ACT.demoExit = async () => {
  await clearLocal('demo'); ls.del('sea:user'); location.hash = ''; location.reload(); // repart de zéro, sans rien garder en mémoire
};
/** Bandeau permanent pendant la démo. */
export const demoBar = () => (S.user?.demo ? h`<div class="card acc-b banner" role="status"><div class="row between wrapf"><b>🎬 Démo : données d’exemple</b><span class="row wrapf"><button class="btn sm pri" data-act="demoExit">Quitter la démo</button></span></div><p class="tiny muted" style="margin:.3em 0 0">Rien n’est envoyé ni gardé : en quittant, tout est effacé et tu peux créer ton compte.</p></div>` : '');
