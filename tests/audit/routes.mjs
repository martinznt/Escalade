// tests/audit/routes.mjs — toutes les adresses de l'app visitées par l'audit (les identifiants « inexistant » vérifient
// qu'une adresse périmée ou mal recopiée affiche quelque chose de sensé).
export const MEMBER_ROUTES = [
  'home/dash', 'home/cal',
  'library/home', 'library/seances', 'library/seance/s-renfo', 'library/seance/inexistante', 'library/climbplan', 'library/generate', 'library/gym', 'library/moments', 'library/catalog', 'library/exercises', 'library/best', 'library/common', 'library/search', 'library/import',
  'profile/home', 'profile/memory', 'profile/bilan', 'profile/analyse', 'profile/body', 'profile/understand', 'profile/map', 'profile/activities', 'profile/perfs', 'profile/climbing', 'profile/goals', 'profile/equipment', 'profile/prefs', 'profile/public', 'profile/mine',
  'progress/summary', 'progress/history', 'progress/records', 'progress/timeline', 'progress/journal', 'progress/analyses', 'progress/lab',
  'settings/main', 'settings/display', 'settings/session', 'settings/notifs', 'settings/help', 'settings/data', 'settings/integrations', 'settings/sync', 'settings/updates', 'settings/bug', 'settings/admin',
];
export const ADMIN_ROUTES = ['settings/studio', 'settings/studioSet/inexistant', 'settings/audit', 'settings/lab', 'settings/health', 'settings/maint', 'settings/code', 'settings/codeItem/inexistant', 'settings/assistant', 'settings/content', 'settings/look', 'settings/changes', 'settings/members', 'settings/bugs', 'settings/users', 'settings/push'];
