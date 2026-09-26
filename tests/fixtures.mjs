// tests/fixtures.mjs — construction de contextes d'analyse pour les tests des modules métier.
import { buildContext, DAY } from '../public/brain.js';
export const NOW = Date.UTC(2026, 5, 15, 12);
let seq = 0;
export const it = (c, d, id = c + '-' + ++seq) => ({ c, id, d, u: NOW - 1000 });
export const perf = (metricId, value, daysAgo = 5, extra = {}) => it('perf', { metricId, value, date: NOW - daysAgo * DAY, source: 'measured', ...extra });
export const env = (name, equipment, extra = {}) => it('env', { name, type: 'maison', equipment, isDefault: true, ...extra });
export const act = (preset) => it('activity', { preset, label: '' }, preset);
export const entry = (daysAgo, exercises, extra = {}) => ({
  id: 'h' + ++seq, sessionName: extra.name || 'Séance', startedAt: NOW - daysAgo * DAY, durationSeconds: (extra.min || 40) * 60,
  data: { rpe: extra.rpe ?? 3, activity: extra.activity, exercises: exercises.map((e) => (typeof e === 'string' ? { name: e, sets: [{ reps: 8, done: true }, { reps: 8, done: true }, { reps: 8, done: true }] } : e)), ...(extra.data || {}) },
});
export const ctxOf = ({ items = [], history = [], settings = {}, personal = [], seances = [] } = {}) => buildContext({ items, history, settings, personal, seances, now: NOW });
