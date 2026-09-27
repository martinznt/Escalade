// pages/_worker.js — porte d'entrée « Cloudflare Pages » pour une adresse courte (ex. seances-entrainement.pages.dev).
// Tout est transmis tel quel au Worker principal « seances-entrainement » par une liaison de service (binding APP,
// à créer dans le projet Pages : Paramètres › Liaisons › Liaison de service › APP → seances-entrainement).
// L'adresse vue par le navigateur reste celle de Pages : cookies, contrôle d'origine et installation fonctionnent.
// Aucune donnée ni secret ici : la base, les comptes et l'IA restent dans le Worker principal.
export default {
  async fetch(request, env) {
    if (!env.APP || typeof env.APP.fetch !== 'function') {
      return new Response('Configuration incomplète : ajoute la liaison de service « APP » vers le Worker « seances-entrainement » dans les paramètres du projet Pages.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return env.APP.fetch(request);
  },
};
