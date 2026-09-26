// migrate.js — migration des anciens réglages (v5–v7) vers les données structurées V2 (items.js).
// Exécutée par le serveur une seule fois par compte (drapeau user_data.v2_migrated), idempotente :
// identifiants déterministes « legacy-… » (INSERT OR IGNORE) : relancer la migration ne duplique rien.
// Les anciens réglages ne sont JAMAIS supprimés (settings_json reste intact).
// Pur JavaScript, sans DOM : testé dans tests/migration.test.mjs.

import { BUILTIN_SYSTEMS, gradeSnapshot } from './grading.js';
import { ACTIVITIES, BUILTIN_STYLES } from './model.js';

const norm = (s) => String(s || '').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const safeId = (s) => String(s || '').replace(/[^\w:.-]/g, '_').slice(0, 60);
const DOMAIN_CAPS = {
  tirage: ['tirage_vertical', 'tirage_horizontal'], poussee: ['poussee_horizontale', 'poussee_verticale'], jambes: ['force_jambes'], gainage: ['gainage_anterieur'],
  epaules: ['stabilite_epaules'], grip: ['pince', 'force_doigts'], puissance: ['explosivite'], mobilite: ['mobilite_hanches'], dalle: ['technique_pieds', 'equilibre'],
  devers: ['tirage_vertical', 'gainage_anterieur'], reglette: ['force_doigts'], pince: ['pince'], dynamique: ['coordination'], equilibre: ['equilibre'], lecture: ['technique_escalade'],
  technique: ['technique_escalade'], endurance: ['endurance_aerobie'], resistance: ['endurance_doigts'], vitesse: ['vitesse'], seuil: ['seuil'], fractionne: ['vitesse'],
  cotes: ['force_jambes'], virages: ['technique_nage'], respiration: ['technique_nage'], clipage: ['technique_escalade'], pied: ['technique_pieds'], repos: ['endurance_doigts'], mental: ['technique_escalade'],
};
const PHYSICAL = new Set(['tirage', 'poussee', 'jambes', 'gainage', 'epaules', 'grip', 'mobilite', 'puissance']);
const NATIVE_NAMES = [[/^(max )?tractions?( max)?$/, 'max_tractions'], [/^(max )?pompes?( max)?$/, 'max_pompes'], [/^(max )?dips( max)?$/, 'max_dips'], [/^5 ?k(m)?$/, 'course_5k'], [/^10 ?k(m)?$/, 'course_10k'], [/^vma$/, 'vma']];
function nativeMetricFor(name) { const n = norm(name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); const hit = NATIVE_NAMES.find(([re]) => re.test(n)); return hit ? hit[1] : ''; }
function findLevel(sys, label) {
  const l = norm(label).replace(/\s/g, '');
  return sys.levels.find((x) => norm(x.label) === l) || null;
}
/** Cotation texte libre → instantané si elle correspond exactement à une échelle intégrée (sinon null : on n'invente rien). */
export function gradeFromText(text, activity) {
  const t = String(text || '').trim();
  if (!t) return null;
  const order = activity === 'voie' ? ['french', 'font'] : ['font', 'french', 'vscale'];
  for (const id of order) { const sys = BUILTIN_SYSTEMS[id]; const lv = findLevel(sys, t); if (lv) return gradeSnapshot(sys, lv.id); }
  if (/^v\d{1,2}$/i.test(t)) { const lv = findLevel(BUILTIN_SYSTEMS.vscale, t.toUpperCase()); if (lv) return gradeSnapshot(BUILTIN_SYSTEMS.vscale, lv.id); }
  return null;
}
function styleIdsFromText(text) {
  const n = norm(text);
  return BUILTIN_STYLES.filter((s) => n && n.includes(norm(s.label))).map((s) => s.id);
}

/** settings : ancien objet de réglages. Retourne une liste d'items { c, id, d, u }. */
export function legacyItems(settings, now = Date.now()) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const out = [];
  const add = (c, id, d, u = now) => out.push({ c, id: safeId(id), d, u: Math.max(1, Number(u) || now) });
  const lv = s.level || {};
  if (lv.boulderMax) { const g = gradeFromText(lv.boulderMax, 'bloc'); if (g) add('perf', 'legacy-boulderMax', { metricId: 'max_bloc', grade: g, date: now, source: 'declared', note: 'Repris de l’ancien profil escalade.' }); }
  if (lv.routeMax) { const g = gradeFromText(String(lv.routeMax).toLowerCase(), 'voie'); if (g) add('perf', 'legacy-routeMax', { metricId: 'max_voie', grade: g, date: now, source: 'declared', note: 'Repris de l’ancien profil escalade.' }); }
  if (s.equipment && typeof s.equipment === 'object') {
    const eq = Object.entries(s.equipment).filter(([, v]) => v).map(([k]) => k);
    if (eq.length) add('env', 'legacy-env', { name: eq.includes('wall') ? 'Salle d’escalade' : 'Mon matériel', type: eq.includes('wall') ? 'escalade' : 'maison', equipment: eq, isDefault: true });
  }
  for (const log of Array.isArray(s.climbingLogs) ? s.climbingLogs.slice(0, 500) : []) {
    if (!log) continue;
    const kind = /voie/i.test(log.type || '') ? 'voie' : 'bloc';
    const g = gradeFromText(kind === 'voie' ? String(log.grade || '').toLowerCase() : log.grade, kind);
    add('ascent', 'legacy-asc-' + safeId(log.id || Math.random()), {
      kind, name: /poutre/i.test(log.type || '') ? 'Poutre' : '', grade: g || undefined, gradeText: g ? '' : String(log.grade || '').slice(0, 20),
      result: ['flash', 'send', 'work', 'top', 'attempt', 'fail'].includes(log.result) ? log.result : 'attempt', attempts: log.attempts || 1,
      styles: styleIdsFromText(log.style), styleText: String(log.style || '').slice(0, 60), date: log.date || now, note: String(log.note || '').slice(0, 300),
    }, log.date || now);
  }
  for (const g of Array.isArray(s.goals) ? s.goals.slice(0, 100) : []) {
    if (!g?.name) continue;
    const type = g.kind === 'sessions' ? 'sessions' : g.kind === 'climb' ? 'ascents' : 'custom';
    add('goal', 'legacy-goal-' + safeId(g.id || g.name), { type, label: g.name, target: g.target, current: g.current ?? 0, unit: g.unit || '', status: 'active', startedAt: g.since ? Date.parse(g.since) || now : now });
  }
  const sp = s.sportProfile;
  if (sp && typeof sp === 'object') {
    for (const [id, a] of Object.entries(sp.activities || {})) {
      if (!a) continue;
      if (ACTIVITIES[id]) add('activity', 'legacy-act-' + safeId(id), { preset: id, label: ACTIVITIES[id].label, emoji: ACTIVITIES[id].emoji });
      else {
        add('activity', safeId(id), { label: a.label || id, emoji: a.emoji || '🏅', aliases: a.aliases || [] });
        // Activité personnalisée : seules les catégories physiques sans ambiguïté sont reliées à des capacités ;
        // les autres (technique, force, endurance…) restent des nœuds propres à l'activité.
        for (const d of a.domains || []) if (d?.key) add('category', 'legacy-cat-' + safeId(id + '-' + d.key), { activityId: safeId(id), label: d.name || d.key, description: d.description || '', caps: (PHYSICAL.has(d.key) ? DOMAIN_CAPS[d.key] : []).map((c) => ({ id: c, w: 1 })) });
      }
    }
    for (const m of Array.isArray(sp.metrics) ? sp.metrics.slice(0, 300) : []) {
      if (!m?.name) continue;
      const native = nativeMetricFor(m.name);
      if (native && Number.isFinite(Number(m.value))) {
        add('perf', 'legacy-p-' + safeId(m.id || m.name), { metricId: native, value: Number(m.value), unit: m.unit || '', date: m.updatedAt || now, source: 'declared', note: [m.note, 'Repris de l’ancien profil.'].filter(Boolean).join(' — ') }, m.updatedAt || now);
        continue;
      }
      const mid = 'legacy-m-' + safeId(m.id || m.name);
      // Activité native ou catégorie physique : capacités du modèle ; sinon, lien vers la catégorie de l'activité personnalisée.
      const custom = !ACTIVITIES[m.activityId];
      const caps = !custom || PHYSICAL.has(m.domain) ? (DOMAIN_CAPS[m.domain] || []).map((c) => ({ id: c, w: 0.8 })) : m.domain ? [{ id: safeId('legacy-cat-' + m.activityId + '-' + m.domain), w: 1 }] : [];
      add('metric', mid, { label: m.name, unit: m.unit || '', kind: Number.isFinite(Number(m.value)) ? 'other' : 'score', activityId: ACTIVITIES[m.activityId] ? m.activityId : safeId(m.activityId), caps });
      const note = [m.note, m.score != null ? `Score personnel déclaré : ${m.score}/100` : ''].filter(Boolean).join(' — ');
      add('perf', 'legacy-p-' + safeId(m.id || m.name), { metricId: mid, value: Number.isFinite(Number(m.value)) ? Number(m.value) : null, unknown: !Number.isFinite(Number(m.value)), unit: m.unit || '', date: m.updatedAt || now, source: 'declared', note }, m.updatedAt || now);
    }
  }
  return out;
}
