// questions.js — quand l'app a besoin d'une information, elle la demande par UNE question simple, avec des réponses
// en un toucher. Ce module choisit les questions utiles (pur, sans DOM : tests/questions.test.mjs) ; l'affichage et
// l'enregistrement des réponses sont dans views-setup.js. Une question déjà répondue (ou « je ne sais pas ») n'est
// plus posée ; « plus tard » la met en pause quelques jours sur cet appareil.
import { ACTIVITIES, ENV_TYPES } from './model.js';
import { PHYSIQUE } from './physique.js';

const BLOC = ['4', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '7A', '7A+', '7B', '7C', '8A'];
const REPS = (unit) => [['0', '0'], ['1', `1 à 4 ${unit}`], ['5', `5 à 9`], ['10', '10 à 14'], ['15', '15 à 19'], ['20', '20 ou plus']];
const NEEDS_PULL = new Set(['front_lever', 'one_arm_pullup', 'muscle_up', 'human_flag']);

/**
 * ctx : contexte d'analyse (brain.buildContext). Retourne les questions à poser, les plus utiles d'abord :
 * [{ id, emoji, text, why, options: [[valeur, libellé]], nsp: bool }]
 */
export function pendingQuestions(ctx) {
  const cfg = ctx.config?.main || {}, asked = new Set(cfg.asked || []);
  const acts = Object.keys(ctx.activities || {});
  const climbing = acts.some((a) => a.startsWith('climbing'));
  const hasPerf = (m) => (ctx.perfs || []).some((p) => p.metricId === m);
  const q = [];
  const add = (x) => { if (!asked.has(x.id)) q.push(x); };
  if (!acts.length) add({ id: 'acts', emoji: '🏅', text: 'Quel sport pratiques-tu le plus ?', why: 'Pour te proposer des séances qui ont du sens pour toi.', options: Object.entries(ACTIVITIES).map(([id, a]) => [id, `${a.emoji} ${a.label}`]) });
  if (climbing && cfg.climbPerWeek == null) add({ id: 'climbPerWeek', emoji: '🧗', text: 'Combien de fois grimpes-tu par semaine ?', why: 'Pour doser le travail des doigts et la récupération.', options: [['0', 'Pas en ce moment'], ['1', '1 fois'], ['2', '2 fois'], ['3', '3 fois'], ['4', '4 ou plus']] });
  if (!ctx.envs?.length) add({ id: 'place', emoji: '📍', text: 'Où t’entraînes-tu le plus souvent ?', why: 'Pour ne proposer que des exercices faisables avec ton matériel.', options: Object.entries(ENV_TYPES).filter(([k]) => k !== 'autre') });
  if (!cfg.durations?.length) add({ id: 'minutes', emoji: '⏱️', text: 'Combien de temps as-tu pour une séance, en général ?', why: 'Pour que les séances tiennent dans ton temps.', options: [['10', '10 min'], ['20', '20 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 h'], ['90', '1 h 30']] });
  if (cfg.perWeek == null) add({ id: 'perWeek', emoji: '📅', text: 'Combien de séances par semaine aimerais-tu faire ?', why: 'Pour suivre ta régularité par rapport à ton objectif à toi.', options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 ou plus']] });
  if (climbing && !hasPerf('max_bloc')) add({ id: 'bloc', emoji: '🧗', text: 'Quel est ton meilleur bloc réussi ?', why: 'Pour adapter la difficulté des séances d’escalade.', options: BLOC.map((g) => [g, g]), nsp: true });
  const pullGoal = (ctx.goals || []).some((g) => (g.status || 'active') === 'active' && NEEDS_PULL.has(g.skillId));
  if ((pullGoal || climbing || acts.includes('strength') || acts.includes('conditioning')) && !hasPerf('max_tractions')) add({ id: 'tractions', emoji: '💪', text: 'Combien de tractions d’affilée peux-tu faire ?', why: 'Un bon repère de ta force de tirage (réponse approximative, tu pourras la préciser).', options: REPS('tractions'), nsp: true });
  if ((acts.includes('strength') || acts.includes('conditioning')) && !hasPerf('max_pompes')) add({ id: 'pompes', emoji: '🙌', text: 'Combien de pompes d’affilée peux-tu faire ?', why: 'Un repère de ta force de poussée (approximatif).', options: REPS('pompes'), nsp: true });
  if (!cfg.goal) add({ id: 'goal', emoji: '🎯', text: 'Qu’est-ce qui te motive le plus ?', why: 'Pour orienter les séances proposées.', options: [['climb', '🧗 Progresser en escalade'], ['force', '💪 Être plus fort(e)'], ['endurance', '🔋 Plus d’endurance'], ['mobilite', '🧘 Être plus souple'], ['forme', '🙂 Rester en forme'], ['muscle', '🏋️ Prendre du muscle'], ['physique', '🪞 Changer ma silhouette'], ['poids', '⚖️ Perdre du poids']] });
  const goals = cfg.goals?.length ? cfg.goals : cfg.goal ? [cfg.goal] : [];
  if ((goals.includes('physique') || goals.includes('muscle')) && !(ctx.config?.body?.physique || []).length) add({ id: 'physique', emoji: '🪞', text: 'Qu’aimerais-tu changer en priorité ?', why: 'Pour cibler les bons muscles et te proposer les bonnes mensurations (tu pourras en choisir d’autres dans ton profil).', options: Object.entries(PHYSIQUE).map(([k, p]) => [k, `${p.emoji} ${p.label}`]) });
  if (!Object.values(ctx.settings?.avoid || {}).some(Boolean)) add({ id: 'avoid', emoji: '🩹', text: 'Une zone du corps à ménager en ce moment ?', why: 'L’app évitera les exercices qui la sollicitent fortement (ce n’est pas un avis médical).', options: [['none', '👍 Non, rien'], ['fingers', '✋ Doigts'], ['shoulders', '🦾 Épaules'], ['elbows', '💪 Coudes'], ['knees', '🦵 Genoux']] });
  return q;
}

/** Choisit la question à afficher maintenant (ignore celles mises en pause jusqu'à une date). */
export function nextQuestion(ctx, snoozed = {}, now = Date.now()) {
  return pendingQuestions(ctx).find((x) => !(snoozed[x.id] > now)) || null;
}
/** Valeur « au moins » pour une réponse par tranche (ex. « 5 à 9 » → 5) : prudent, jamais surestimé. */
export const bucketValue = (v) => Math.max(0, Math.floor(Number(v) || 0));
