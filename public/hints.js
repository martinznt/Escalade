// hints.js — raccourcis contextuels : sur chaque page, une ou deux indications cliquables, seulement quand elles
// sont utiles (« Ajoute tes objectifs ici », « D'autres exercices ? → Exercices »…). Chacune mène à la bonne page
// et un bouton « ‹ Retour » ramène ensuite. Masquables d'un ✕ (retenu sur l'appareil). Sans DOM, testé.
// Les administrateurs peuvent en ajouter pour tout le monde (contenu global « hint »).

/**
 * Chaque raccourci : id, where (préfixe de page « onglet/sous-page »), icon, text, go (« onglet/sous-page ») ou act,
 * back (libellé du retour) et when(e) : condition sur l'état (e = { ctx, cp, seances, route }).
 */
export const HINTS = [
  { id: 'cp-goals', where: 'library/climbplan', icon: '🎯', text: 'Ajoute tes objectifs ici', go: 'profile/goals', back: 'Retour à ma séance', when: (e) => e.cp?.step === 3 && !e.goals.length },
  { id: 'cp-place', where: 'library/climbplan', icon: '🧰', text: 'Décris ton lieu et son matériel : la séance s’y adapte', go: 'profile/equipment', back: 'Retour à ma séance', when: (e) => e.cp?.step === 2 && !e.places.length },
  { id: 'cp-ex', where: 'library/climbplan', icon: '💪', text: 'Envie d’autres exercices ? Parcours les Exercices', go: 'library/exercises', back: 'Retour à ma séance', when: (e) => e.cp?.step === 5 },
  { id: 'seance-ex', where: 'library/seance', icon: '💪', text: 'D’autres exercices ? Va dans Exercices', go: 'library/exercises', back: 'Retour à ma séance', when: () => true },
  { id: 'seances-new', where: 'library/seances', icon: '✨', text: 'Crée une séance : l’app choisit, te guide, ou tu composes', act: 'cpNew', when: (e) => e.seances < 3 },
  { id: 'exercises-new', where: 'library/exercises', icon: '✨', text: 'Fais une séance avec ces exercices', act: 'cpNew', when: () => true },
  { id: 'catalog-new', where: 'library/catalog', icon: '✨', text: 'Rien ne te va ? Crée ta séance sur mesure', act: 'cpNew', when: () => true },
  { id: 'goals-train', where: 'profile/goals', icon: '✨', text: 'Crée une séance pour tes objectifs', act: 'cpNew', when: (e) => e.goals.length > 0 },
  { id: 'goals-done', where: 'profile/goals', icon: '🏆', text: 'Tes objectifs réussis sont aussi dans Progrès', go: 'progress/summary', back: 'Retour aux objectifs', when: (e) => e.done > 0 },
  { id: 'perfs-carnet', where: 'profile/perfs', icon: '🧗', text: 'Tes blocs et tes voies se notent dans le Carnet', go: 'profile/climbing', back: 'Retour aux mesures', when: (e) => e.climber },
  { id: 'carnet-places', where: 'profile/climbing', icon: '📍', text: 'Ajoute tes salles et falaises (et leurs secteurs)', go: 'profile/equipment', back: 'Retour au carnet', when: (e) => e.climber && !e.climbPlaces },
  { id: 'places-train', where: 'profile/equipment', icon: '✨', text: 'Crée une séance adaptée à un de tes lieux', act: 'cpNew', when: (e) => e.places.length > 0 },
  { id: 'progress-goal', where: 'progress/', icon: '🎯', text: 'Fixe-toi un objectif : l’app oriente tes séances vers lui', go: 'profile/goals', back: 'Retour à Progrès', when: (e) => !e.goals.length },
  { id: 'home-place', where: 'home/', icon: '📍', text: 'Ajoute ton lieu et ton matériel pour des séances qui tombent juste', go: 'profile/equipment', back: 'Retour à l’accueil', when: (e) => !e.places.length },
  { id: 'home-goal', where: 'home/', icon: '🎯', text: 'Fixe-toi un objectif', go: 'profile/goals', back: 'Retour à l’accueil', when: (e) => !e.goals.length },
  { id: 'home-max', where: 'home/', icon: '📏', text: 'Note ton niveau max : les cotations proposées seront justes', go: 'profile/perfs', back: 'Retour à l’accueil', when: (e) => e.climber && !e.hasMax },
];

/** État utile aux conditions, à partir du contexte de l'app. */
export function hintState(ctx, { cp = null, seances = 0 } = {}) {
  const acts = Object.keys(ctx.activities || {});
  return {
    cp, seances, goals: (ctx.goals || []).filter((g) => (g.status || 'active') === 'active'), done: (ctx.goals || []).filter((g) => g.status === 'done').length,
    places: (ctx.envs || []).filter((e) => !e.archived), climbPlaces: (ctx.envs || []).some((e) => !e.archived && ['escalade', 'falaise', 'exterieur'].includes(e.type)),
    climber: acts.some((a) => a.startsWith('climbing')), hasMax: (ctx.perfs || []).some((p) => ['max_bloc', 'max_voie'].includes(p.metricId) && !p.unknown),
  };
}
/** Raccourcis à montrer sur cette page (2 au plus), sans ceux masqués ; les raccourcis ajoutés par un admin en plus. */
export function hintsFor(route, state, { off = [], extra = [] } = {}) {
  const r = String(route || '');
  const pool = [...HINTS, ...extra.map((x) => ({ ...x, when: () => true }))];
  return pool.filter((x) => (r === x.where || r.startsWith(x.where.endsWith('/') ? x.where : x.where + '/') || (x.where.endsWith('/') && r.startsWith(x.where))) && !off.includes(x.id))
    .filter((x) => { try { return x.when(state); } catch { return false; } }).slice(0, 2);
}
