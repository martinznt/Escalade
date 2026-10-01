// fit.js — « Pour toi » : une séance comparée à TES données (jamais à d'autres membres) : volume et durée par rapport
// à tes séances des 90 derniers jours, exercices au-dessus de ton niveau dans leur capacité, charge écrite rapportée à
// ton poids de corps. Uniquement des faits ; si les données manquent, on le dit. Pur JavaScript, sans DOM. Testé.
import { byId, LIBRARY } from './library.js';
import { exKey } from './shared.js';
import { exerciseLevel, levelFor } from './generator.js';
import { estimateLevel } from './estimate.js';

const DAY = 86400000, WORD = ['débutant', 'intermédiaire', 'avancé'];
const libOf = (e) => (e.libId && byId(e.libId)) || LIBRARY.find((x) => exKey(x.name) === exKey(e.name || '')) || null;
const doneSets = (h) => (h.data?.exercises || []).reduce((t, e) => t + (Array.isArray(e.sets) ? e.sets.filter((s) => s.done !== false).length : 0), 0);
const pct = (v, list) => Math.round((list.filter((x) => x < v).length / list.length) * 100);

/** Retourne { lines:[texte], missing:[texte] } pour une séance (normalisée) et le contexte de l'utilisateur. */
export function personalFit(session, ctx) {
  const lines = [], missing = [];
  if (!session || !ctx?.history) return { lines, missing };
  const main = (session.exercises || []).filter((e) => e.block !== 'warmup' && e.block !== 'cool');
  const planned = main.reduce((t, e) => t + (Number(e.sets) || 0), 0), lv = estimateLevel(session);
  const recent = ctx.history.filter((h) => ctx.now - h.startedAt <= 90 * DAY && !h.data?.aborted);
  if (recent.length >= 5) {
    const sets = recent.map(doneSets).filter((n) => n > 0), mins = recent.map((h) => (h.durationSeconds || 0) / 60).filter((m) => m > 0);
    if (sets.length >= 5 && planned) lines.push(`Volume : ${planned} séries prévues — plus que ${pct(planned, sets)} % de tes ${sets.length} séances des 90 derniers jours.`);
    if (mins.length >= 5 && lv.minutes) lines.push(`Durée : ~${lv.minutes} min — plus longue que ${pct(lv.minutes, mins)} % de tes séances des 90 derniers jours.`);
  } else missing.push(`Comparaison à tes habitudes : il faut au moins 5 séances ces 90 derniers jours (tu en as ${recent.length}).`);
  const act = session.activity || Object.keys(ctx.activities || {})[0] || 'conditioning', base = levelFor(act, ctx).level;
  const seen = new Set();
  for (const e of main) {
    const x = libOf(e); if (!x || seen.has(x.id)) continue; seen.add(x.id);
    const xl = exerciseLevel(x, ctx, base);
    if ((x.minLevel || 0) > xl.level) lines.push(`« ${e.name || x.name} » demande un niveau ${WORD[x.minLevel]} ; ${xl.cap ? `ton niveau en ${xl.cap.toLowerCase()}` : 'ton niveau pris en compte'} : ${WORD[xl.level]}.`);
  }
  const bw = (ctx.perfs || []).find((p) => p.metricId === 'body_weight' && p.value > 0 && !p.unknown)?.value;
  for (const l of lv.loads || []) {
    if (bw) lines.push(`${l.name} : ${l.kg} kg ≈ ${Math.round((l.kg / bw) * 100)} % de ton poids de corps (${bw} kg).`);
    else { missing.push('Charges : note ton poids de corps (Profil › Mon corps et mes préférences) pour les voir en % de ton poids.'); break; }
  }
  if (!lines.some((t) => /demande un niveau/.test(t)) && seen.size) lines.push('Aucun exercice reconnu ne dépasse ton niveau actuel.');
  return { lines, missing };
}
