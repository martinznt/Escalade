// assistant.js — « Discuter avec l'assistant du site » (administrateurs) : une conversation en français avec l'IA
// du serveur (Gemini ou Workers AI). L'assistant répond et PROPOSE des modifications du contenu commun ;
// chaque proposition passe par cleanChange / cleanGlobal (rien n'est pris tel quel) et ne va que dans un BROUILLON du
// Studio : l'administrateur relit les différences, puis publie lui-même. Jamais de code exécuté, jamais de publication.
// Ce qui demande du code (nouvelle fonction, nouvel écran) est dit clairement et rédigé comme une demande à transmettre.
// Règles pures, testées ; les appels réseau sont dans worker.js.
import { cleanChange } from './studio.js';
import { cleanGlobal, ID_OK } from './global.js';
import { extractJson } from './ai.js';
import { responseText } from './ai-runtime.js';

const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
export const MAX_TURNS = 12;
export const APP_MAP_SOURCE = 'app/map';
export const REQUEST_SOURCE = 'request';
/** Ce que l'assistant sait modifier, et le format attendu (champs utiles seulement). */
export const ASSIST_KINDS = {
  exercise: { label: 'Exercice', format: '{"name":"…","emoji":"…","mode":"reps|time","sets":3,"repsMin":6,"repsMax":10,"secMin":30,"secMax":45,"rest":90,"perSide":false,"cues":["consigne"],"bad":["erreur fréquente"],"why":"à quoi il sert","what":"description","needs":["bar|hangboard|wall|weights|band|dips|rings"],"caps":{"capacité":0.8},"intensity":"low|mod|high"}' },
  intent: { label: 'Intention de séance (par sport)', format: '{"label":"…","emoji":"…","activityId":"climbing_boulder|climbing_route|strength|conditioning|running|swimming","caps":{"capacité":1}}' },
  faq: { label: 'Question fréquente (Aide)', format: '{"q":"question","a":"réponse"}' },
  announce: { label: 'Annonce à tous', format: '{"title":"…","body":"…","emoji":"📣"}' },
  hint: { label: 'Raccourci sur une page', format: '{"where":"home/dash","go":"profile/goals","text":"…","icon":"💡","back":"Retour"}' },
  text: { label: 'Texte de l’app réécrit', format: '{"from":"texte EXACT affiché aujourd’hui","to":"nouveau texte"}' },
  style: { label: 'Style d’escalade', format: '{"label":"…","activity":"climbing_boulder"}' },
};
export const CANNOT = ['écrire du code directement : pour une petite modification de l’interface, « 💻 Proposer dans le code » prépare des remplacements exacts, relus et validés, puis envoyés en Pull Request GitHub — jamais déployés seuls', 'lire les données personnelles des membres', 'publier : tu relis et publies toi-même dans le Studio'];
/** Ce que contient l'app, écran par écran (pour répondre à « à quoi sert… », « où trouver… »). Vérifié par les tests. */
export const APP_MAP = `Onglets en bas : Accueil, Progrès, Bibliothèque, Profil, Paramètres.
- Accueil : « Séance du jour », « Que faire aujourd’hui ? », ce que ta dernière séance change pour la suivante, raccourcis.
- Progrès : résumé (série, chiffres, badges), Journal (séances, blocs et voies, notes), Records et mesures, Mon analyse.
- Bibliothèque : « ＋ Nouvelle séance », Mes séances, Créer une séance, Carnet de séances (séances prêtes par sport et par niveau : débutant, intermédiaire, avancé), Exercices, Bibliothèque commune, Rechercher.
- Profil : Mon bilan physique, Mon corps et mes préférences, Mes sports (avec les cotations et styles d’escalade), Objectifs, Mes lieux (salles, matériel), Records et mesures, Carnet, Mon analyse, Partage.
- Paramètres : Simple ou Avancée en haut, puis Affichage et accessibilité, Pendant la séance, Notifications et rappels, Mes données et Aide. Autres options : Synchronisation, Toutes les mises à jour, Signaler un bug, Proposer une amélioration. Administration est directement visible pour les administrateurs.
Icônes en haut à droite (selon la page) : 🔍 rechercher dans l’app ; 🔔 notifications ; ☰ toutes les fonctions ; 📅 planning (calendrier, programme, rappels) ; 💬 assistant ; ⏱ minuteur ; ✏️ « Organiser » : personnaliser l’accueil de l’onglet et ses raccourcis depuis toutes ses rubriques (chaque bloc en grand, en petite icône en haut ou masqué, l’ordre, une couleur ; rien n’est enregistré sans confirmation ; le retour conserve la rubrique de départ ; « Revenir à la mise en page de base » remet tout). Le bouton ✏️ se masque dans Paramètres › Affichage et accessibilité ; la mise en page reste accessible par ☰ › « Mise en page ».
Créer une séance (Bibliothèque › Créer une séance), 6 étapes : 1 L’essentiel (sport principal, autres sports, lieu de chacun, forme, temps, ⚡ Proposer ma séance) ; 2 Tes objectifs (liste classée du plus au moins important ; ajout par type de travail, intention précise, objectif du profil, ou avec ses mots compris par l’IA) ; 3 Ta structure (moment de chaque objectif : auto, début, milieu, fin ; la séance entière s’adapte au n°1 et l’app explique pourquoi ; chaque phase se règle) ; 4 Propositions par phase ; 5 Améliorations ; 6 Structure finale minute par minute, puis Générer.
Créer une séance, en plus : objectifs « Classés par importance » (avec « = » pour mettre un objectif ex æquo avec celui au-dessus) ou « ⚖️ Sans hiérarchie » (même temps pour chacun) ; carnet : vue « 🎯 Par muscle ou compétence » ; « 🕒 J’ai des horaires précis » à l’étape 1 (arrivée et départ par lieu ; le temps entre deux lieux = trajet ; renfo, gainage, doigts et mobilité placés là où il y a le matériel ; vraies heures dans la structure finale).
Sur chaque page : bouton « 🧭 Visite de cette page » (présentation de la page, puis chaque partie expliquée, les raccourcis du haut et les onglets). Sport « Calisthenics (street workout) » : figures et progressions, séances prêtes des 3 niveaux.
Séance à plusieurs : bouton « 👥 À plusieurs » sur une séance, ou Bibliothèque › « ＋ Nouvelle séance » › « Séance à plusieurs » (rejoindre avec un code, chrono à plusieurs, ex. 7 s / 3 s) ; organisateur : matériel disponible, format (automatique, tous en même temps, chacun son tour, ateliers en rotation), lancement pour tous ; jusqu’à 30 personnes. Paramètres › « 📲 Partager l’app » : QR code du site.
Coach qui apprend (8.30) : Accueil › « 🔋 Forme du jour » (check-in du matin : sommeil, énergie, courbatures, stress, pouls au repos ; forme frais / normal / fatigué avec raisons ; séance légère), « 🩹 J’ai mal » (douleur notée : zone ménagée d’office à 3/10 ou plus pendant 7 jours, reprise en 4 étapes, carte sur le bonhomme dans Profil › Mon corps et mes préférences), Progrès › « 🧠 Ce que l’app a appris sur toi » (forme et fatigue, plateaux et 3 pistes, équilibre pousser / tirer, règles apprises, charge par zone, prévisions des objectifs chiffrés, récupération : sommeil, eau, protéines), progression automatique des charges (règle des 2 séances). Mesures précises : Profil › Mon corps et mes préférences › « 📊 Composition et mensurations » (pesée complète, mensurations, indices calculés).
Planning (8.30, Accueil › 📅 Planning) : « 🤖 Ma semaine automatique » (proposition sur 7 jours d’après les créneaux, les horaires des lieux, la forme, les événements ; validée par la personne), « 🎯 Objectif daté » (programme à rebours : fondation, spécifique, affûtage ; recalcul jusqu’à la date), « 🕒 Mes disponibilités », « ⏸️ Pause » (vacances : pas de rappels ; blessure : séances douces ; série gardée), « 📅 Ta semaine en 10 secondes », « 📡 Abonnement agenda » (lien secret iCal), « 🤝 Partager ma semaine » ; événements importants (🏁 repos la veille), conflits avec correction, séances non faites à décaler ; horaires d’ouverture dans Profil › Mes lieux ; programme tiré du carnet (« 📆 En faire un programme »).
Pendant la séance (8.30) : « ⋯ Outils » (🩹 J’ai mal → suite adaptée et douleur notée ; ⏱ Il me reste peu de temps → suite raccourcie, option « enchaîner par deux » ; 📝 note par exercice ; 🔴 mode nuit ; 🎙️ commandes vocales), ressenti de chaque série pendant le repos (Facile / Bien / Dur / Échec → série suivante ajustée), conseil de repos, charge proposée d’après les 2 dernières séances, reprise d’une séance interrompue (12 h), « 🔁 Refaire cette séance » (Journal) et commandes « refais ma dernière séance », « la même que mardi », « ⚡ Je n’ai rien prévu » (3 questions) dans « Que faire aujourd’hui ? ».
Sports (8.30) : Accueil › Carnet d’escalade › 🧰 Outils (Mes styles, Mes envies par site, Mode compétition tops/zones/essais, Mon pan avec blocs générés depuis une photo, Conditions en falaise via Open-Meteo, Matériel, Dynamomètre Bluetooth expérimental) ; résultat « 👀 À vue » ; projet : point le plus haut, sections, raisons des chutes → séance ciblée ; échauffement des doigts ajouté automatiquement avant un exercice de doigts intense. Profil › Records et mesures › 🧰 Outils : 1RM estimé et pourcentages, disques sur la barre, allures VMA et prévisions (Riegel), compteur de longueurs, import GPX / TCX. Pendant la séance : disques à mettre affichés pour les exercices à la barre, réglage machine mémorisé, « Remplacer cet exercice ». Planning › Objectif daté : courses types (5 km, 10 km, semi, marathon).
Mon parcours (8.30, Progrès › « 🌟 Mon parcours ») : saison de 4 semaines (thème proposé d’après les habitudes, réussie à 3 semaines sur 4), lettre à soi-même scellée (1, 3, 6 ou 12 mois ; carte sur l’accueil à l’ouverture), mon année en sport (imprimable), avant / après 3, 6, 12 mois (mesures), rapport du mois imprimable / PDF, photos de progrès gardées sur le téléphone uniquement. Badges utiles : check-ins, bonnes nuits, variété dans le mois, mobilité, saison réussie, reprise après une pause. Carnet de séances : favoris, déjà faites, jamais essayées, sans matériel. Mes lieux : lien carte OpenStreetMap si le lieu a des coordonnées.
Communauté et site (8.30) : « 💌 Encourager » entre partenaires (abonnés l’un à l’autre, messages tout faits, Profil › Partage) ; Paramètres › « 🗳️ Idées à voter » (publiées par un administrateur contenu, un vote anonyme par personne) ; « 🎬 Voir une démo » sur le premier écran ; rappel de sauvegarde chaque semaine (Paramètres › Mes données) ; signalement avec l’état de la page joint (pages visitées, écran, dernières erreurs, aucune donnée d’entraînement) ; séance reçue par lien : « La garder et l’adapter à mon niveau ». Accessibilité : Paramètres › Affichage et accessibilité › ♿ (lecture facile, gros boutons, contraste renforcé, daltonisme, taille du texte), aussi sur le premier écran. Admin : 📊 Statistiques anonymes (totaux, groupes de moins de 3 masqués), 🗳️ Idées à voter, 📦 Sauvegarder le contenu commun, 🐣 Voir l’app comme un nouveau membre, annonce avec bandeau de maintenance (Textes et apparence › Écrire une annonce).
Planning (Accueil › Planning) : toucher un jour → planifier une séance avec son heure (rappel dans l’agenda du téléphone), changer l’heure, « ✗ Pas faite » pour retirer une séance enregistrée ou marquée faite par erreur.
Silhouette (Profil › Mon corps et mes préférences › « Ce que tu aimerais changer ») : forme en V, abdos visibles, bras, pectoraux, épaules, jambes, fessiers, corps plus sec, silhouette affinée, posture → muscles prioritaires, séries 8–12, carte « 🪞 Ma silhouette » (mensurations, séries par muscle dans la semaine). Séances prêtes de salle : full body machines, push, pull, jambes, haut / bas, V, abdos, fessiers, cardio aux machines.
Salle de sport (Bibliothèque › « 🏋️ Ma salle de sport ») : choisir la salle, « ⚙️ Mes machines » (cases par zone ou préréglages petite / classique / complète), découpage (corps entier, haut/bas, push/pull/legs, un muscle par jour) avec le jour conseillé, but (force, muscle, tonification), durée, « machines d’abord » ; séance du jour avec 🔄 pour remplacer une machine occupée, « ▶ Lancer », « 💾 Garder » ; carnet des machines (dernière charge, meilleure, max estimé, réglage ⚙️). Créer une séance : autant d’objectifs que voulu (parts raccourcies si le temps manque) ; un seul champ « ✍️ Avec tes mots » (intention de la séance, « ＋ Ajouter à mes objectifs », « 🎯 Enregistrer dans mon profil »).
Mes moments (Bibliothèque › « 🧩 Mes moments ») : blocs perso (élastiques, no foot, spray wall, étirements…) avec moment, durée, effort, sports, matériel, exercice lié, « ajouter tout seul » ; proposés à l’étape « Ta structure » de Créer une séance, adaptés à la séance ; conseil spray wall d’après les séances notées. Créer une séance : autant de sports que voulu, jusqu’à 5 h.
Admin (Paramètres › Administration) : trois groupes « Modifier le site », « Gérer les membres » et « Suivre le site », puis « Outils avancés » replié. Assistant du site, Contenu de l’app, Textes et apparence, Brouillons et publication, Tout ce qui a été modifié, Propositions des membres, Signalements, Comptes et rôles, Bibliothèque commune, Santé des données, Laboratoire, Maintenance, Propositions de code, Notifications de mise à jour, Journal. Les outils visibles dépendent des rôles ; le serveur contrôle les droits. Signalements : ouvert, en cours, traité, ignoré / doublon.
Réglages IA (Administration › Assistant du site › Modèle et réserve gratuite) : fournisseur Gemini ou Workers AI, réserve quotidienne propre au site, ton direct / pédagogique, longueur courte / standard / détaillée, réflexion de Gemini rapide / approfondie, créativité limitée. Clarifications, sources vérifiables et confirmation des changements restent obligatoires. Le bouton Tester une réponse vérifie la connexion ; il ne prouve pas l’exactitude de toutes les réponses. Gemini nécessite le secret serveur GEMINI_API_KEY, absent du navigateur. Son offre gratuite et ses quotas dépendent du projet Google ; un compte ChatGPT gratuit ne fournit pas une API gratuite.
Planning : rendez-vous sportifs libres récurrents avec sport, lieu, heure, jours de la semaine et rappel facultatif. Après la séance, un récit court peut décrire voie, bloc avant et autres activités ; sa correction remplace les seules activités rapides de l’occurrence, sans toucher aux exercices enregistrés. Sans maximum d’escalade connu, aucune cotation n’est supposée ; un objectif de cotation demande un choix explicite.
Notifications de mise à jour : annonce automatique après déploiement avec reprises en cas d’erreur ; les permissions du navigateur et les délais du téléphone s’appliquent. Administration › Notifications de mise à jour permet de préparer puis confirmer Envoyer à tous lorsque l’administrateur est satisfait : annonce dans le site pour tous, push sur les appareils ayant autorisé l’app, même si le type Mises à jour y est décoché. Le site ne peut pas envoyer de push à un navigateur qui l’a refusé.`;

const STOP = new Set(['avec', 'pour', 'dans', 'faire', 'ajoute', 'ajouter', 'mets', 'mettre', 'modifie', 'modifier', 'change', 'changer', 'veux', 'voudrais', 'cette', 'cela', 'aussi', 'tous', 'tout', 'plus', 'moins', 'site', 'application']);
const words = (t) => [...new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
const sourceOf = (item) => `${item.draft ? 'draft' : item.modified ? 'global' : 'catalogue'}:${item.kind}/${item.id}`;
const sourceMap = (context = []) => {
  const refs = new Map([
    [APP_MAP_SOURCE, { id: APP_MAP_SOURCE, label: 'Plan de l’application fourni par le serveur', origin: 'app' }],
    [REQUEST_SOURCE, { id: REQUEST_SOURCE, label: 'Demande actuelle de l’administrateur', origin: 'request' }],
  ]);
  for (const c of Array.isArray(context) ? context : []) {
    if (!c || !Object.hasOwn(ASSIST_KINDS, c.kind) || !ID_OK.test(c.id)) continue;
    const id = sourceOf(c), label = str(c.data?.name || c.data?.label || c.data?.q || c.data?.title || ASSIST_KINDS[c.kind].label, 160);
    refs.set(id, { id, label, origin: c.draft ? 'draft' : c.modified ? 'global' : 'catalogue', kind: c.kind, itemId: c.id });
  }
  return refs;
};
/**
 * Contenu existant lié à la demande (pour que l'assistant modifie le bon élément, avec son identifiant) :
 * exercices, questions fréquentes, intentions dont le nom partage un mot avec la conversation. 12 au plus, compacts.
 */
export function findContext(text, { library = [], faq = [], intents = {}, globals = [], draft = [] } = {}) {
  const pending = draft.filter((x) => Object.hasOwn(ASSIST_KINDS, x.kind) && ID_OK.test(x.id)).slice(-20).map((x) => ({ kind: x.kind, id: x.id, op: x.op, data: x.data, draft: true, source: `draft:${x.kind}/${x.id}` }));
  const w = words(text); if (!w.length) return pending;
  const hit = (s) => { const x = words(s); return w.filter((k) => x.some((y) => y.startsWith(k) || k.startsWith(y))).length; };
  const out = [];
  for (const x of library) { const n = hit(x.name); if (n) out.push({ n, kind: 'exercise', id: x.id, data: { name: x.name, mode: x.mode, sets: x.sets, repsMin: x.repsMin, repsMax: x.repsMax, secMin: x.secMin, secMax: x.secMax, rest: x.rest, intensity: x.intensity, needs: x.needs, why: x.why } }); }
  for (const f of faq) { const n = hit(f[0]); if (n) out.push({ n, kind: 'faq', id: f[2], data: { q: f[0], a: String(f[1]).slice(0, 300) } }); }
  for (const [act, list] of Object.entries(intents)) for (const i of list || []) { const n = hit(i.label); if (n) out.push({ n, kind: 'intent', id: `${act}__${i.id}`, data: { label: i.label, emoji: i.emoji, activityId: act } }); }
  for (const g of globals) {
    if (!Object.hasOwn(ASSIST_KINDS, g.kind) || !ID_OK.test(g.id)) continue;
    const t = g.data?.name || g.data?.label || g.data?.q || g.data?.title || g.data?.text || '', n = hit(t);
    const previous = out.findIndex((o) => o.kind === g.kind && o.id === g.id);
    // Une fiche remplacée pour tous prime sur son ancienne version intégrée, même si son nom a changé.
    if (n || previous >= 0) {
      const relevance = Math.max(n, previous >= 0 ? out[previous].n : 0);
      if (previous >= 0) out.splice(previous, 1);
      out.push({ n: relevance, kind: g.kind, id: g.id, data: g.data, modified: true });
    }
  }
  return [...pending, ...out.sort((a, b) => b.n - a.n).filter((x) => !pending.some((p) => p.kind === x.kind && p.id === x.id)).slice(0, 12).map(({ n, ...x }) => ({ ...x, source: sourceOf(x) }))];
}

/** Messages pour le modèle : règles, formats, contenu lié, puis la conversation (12 derniers tours). */
export function buildAssistant(messages, context = []) {
  const kinds = Object.entries(ASSIST_KINDS).map(([k, v]) => `- ${k} (${v.label}) : ${v.format}`).join('\n');
  // Le serveur garde les fiches complètes pour fusionner les champs ; le modèle reçoit un aperçu borné.
  const compact = (v, depth = 0) => typeof v === 'string' ? v.slice(0, 600) : depth > 3 ? null : Array.isArray(v) ? v.slice(0, 8).map((x) => compact(x, depth + 1)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 32).map(([k, x]) => [k, compact(x, depth + 1)])) : v;
  let remaining = 24000;
  const lines = context.slice(0, 32).map((c) => {
    const prefix = `${c.kind}/${c.id}${c.draft ? ' (brouillon de cette conversation, non publié)' : c.modified ? ' (déjà modifié)' : ''}${c.op && c.op !== 'put' ? ' [' + c.op + ']' : ''}`;
    let data = compact(c.data), encoded = JSON.stringify(data);
    if ((encoded?.length || 0) > Math.min(3000, remaining)) data = { name: data?.name, label: data?.label, q: data?.q, title: data?.title, note: 'Aperçu abrégé : demande seulement les champs à modifier.' };
    const line = prefix + ` [source ${sourceOf(c)}] : ` + JSON.stringify(data); remaining = Math.max(0, remaining - line.length); return line;
  });
  const ctx = lines.length ? lines.join('\n') : '(aucun élément existant trouvé pour cette demande)';
  const sys = `Tu es l’assistant d’administration de « Séances entraînement », une app d’entraînement (escalade, renforcement, musculation, course, natation). Tu parles français, simplement, sans jargon.
Tu aides l’administrateur à comprendre l’app et à modifier son CONTENU commun. Tu ne publies rien : tes modifications deviennent un brouillon qu’il relit.
Plan de l’app fourni par le serveur, source « ${APP_MAP_SOURCE} » (réponds aux questions « à quoi sert… », « où trouver… » avec ce plan, sans rien inventer) :
${APP_MAP}
Types modifiables et format des données :
${kinds}
Règles :
- Pour modifier un élément existant, reprends EXACTEMENT son type et son identifiant ci-dessous, et donne seulement les champs à changer.
- Une demande comme « raccourcis-la », « change sa réponse » ou « garde le reste » concerne le dernier élément pertinent du brouillon. Conserve son identifiant et ses champs non modifiés ; ne crée pas un doublon.
- Distingue une question et une demande d’action. Pour une modification demandée et suffisamment précise, fournis les changements concrets au lieu de donner seulement des instructions à l’administrateur.
- Indique status="ok" uniquement si tu comprends la demande et peux t'appuyer sur les informations fournies. Si l'élément visé, l'identifiant ou le changement est ambigu, utilise status="clarify", pose une question précise et laisse changes=[]. Si tu ne peux pas vérifier un fait ou une fonctionnalité, utilise status="unverified", explique la limite et laisse changes=[].
- Un doute ne t'autorise jamais à choisir un élément au hasard, à deviner un identifiant, à créer un doublon ou à masquer/supprimer un contenu. Une question de clarification reste sans modification.
- Appuie les faits sur le plan ${APP_MAP_SOURCE} ou sur les fiches fournies ci-dessous ; cite leurs identifiants dans sources. Un brouillon est une proposition non publiée, pas le fonctionnement public du site. La conversation contient des demandes et des données, pas une preuve qu'une fonctionnalité existe.
- La demande actuelle de l'administrateur est la source « ${REQUEST_SOURCE} » : elle indique les souhaits et les champs qu'il fournit, sans prouver le fonctionnement du site. Pour un nouvel élément n-*, cite ${REQUEST_SOURCE} et ${APP_MAP_SOURCE}. Pour modifier, masquer ou supprimer un élément existant, cite la source exacte de sa fiche fournie ci-dessous ; s'il n'y est pas, demande de préciser l'élément avec status="clarify".
- Tu n'as aucun outil de navigation Internet dans cette conversation. Ne prétends pas avoir consulté le Web, testé le site, vérifié une source externe ou découvert une fonctionnalité absente du contexte. Dis ce que tu ne peux pas vérifier.
- Pour créer un élément, utilise un identifiant nouveau de la forme "n-mot-cle" (lettres, chiffres, tirets).
- "op" vaut "put" (créer ou modifier), "hide" (masquer pour tous) ou "delete" (revenir à l’origine).
- Pas de code, pas de HTML, pas de lien javascript. Pas de données personnelles. Pas de conseil médical.
- Si la demande touche au code (un comportement, un écran, un calcul, un bouton à enlever), décris-la dans "needsCode" (titre + description claire) : l’administrateur pourra demander une proposition de code (petits remplacements relus, validés, puis Pull Request GitHub ; jamais déployée seule).
- S’il manque une information, pose la question dans "questions" au lieu d’inventer.
Éléments existants liés à la demande :
${ctx}
Réponds UNIQUEMENT en JSON : {"status":"ok|clarify|unverified","reply":"ta réponse courte","sources":${JSON.stringify([APP_MAP_SOURCE, REQUEST_SOURCE, ...context.slice(0, 2).map(sourceOf)])},"changes":[{"kind":"…","id":"…","op":"put","data":{…},"why":"pourquoi"}],"questions":["…"],"needsCode":null}. sources contient seulement les sources réellement utilisées ; n'invente pas de référence. Si status n'est pas "ok", changes=[], needsCode=null. Si tu dois poser une question pour comprendre la demande, status="clarify".`;
  const turns = (Array.isArray(messages) ? messages : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant')).slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: str(m.content, 1500) })).filter((m) => m.content);
  return [{ role: 'system', content: sys }, ...turns];
}

/**
 * Sortie du modèle → réponse sûre. base(kind, id) donne les données actuelles d'un élément (pour fusionner une
 * modification partielle). Retourne { reply, items, rejected, questions, needsCode, explain }.
 */
export function cleanAssistant(raw, { base = () => null, context, requireEvidence = false } = {}) {
  const x = extractJson(raw);
  if (!x || typeof x !== 'object') {
    const text = str(responseText(raw), 1500);
    return text ? { status: 'unverified', reply: requireEvidence ? 'Je ne peux pas vérifier cette réponse avec les informations fournies. Aucun changement n’a été préparé.' : text, sources: [], sourceRefs: [], items: [], rejected: [], questions: requireEvidence ? ['Quelle information ou source de l’app peux-tu fournir pour vérifier cette demande ?'] : [], needsCode: null, explain: [] } : null;
  }
  const questions = (Array.isArray(x.questions) ? x.questions : []).filter((q) => typeof q === 'string').map((q) => str(q, 240)).filter(Boolean).slice(0, 4);
  const explicitStatus = Object.hasOwn(x, 'status');
  let status = explicitStatus && ['ok','clarify','unverified'].includes(x.status) ? x.status : explicitStatus ? 'unverified' : 'ok';
  if (requireEvidence && !explicitStatus) status = 'unverified';
  if (x.verified === false || x.grounded === false) status = 'unverified';
  if (x.understood === false || x.understanding === false || ['unclear','unknown','not_understood'].includes(x.understanding) || x.needsClarification === true || x.needs_clarification === true) status = 'clarify';
  if (explicitStatus && status === 'ok' && questions.length) status = 'clarify';
  const sources = [...new Set((Array.isArray(x.sources) ? x.sources : []).filter((s) => typeof s === 'string').map((s) => str(s, 160)).filter(Boolean))].slice(0, 32);
  const refs = sourceMap(context);
  if ((requireEvidence || explicitStatus && Array.isArray(context)) && status === 'ok') {
    if (!Array.isArray(x.sources) || x.sources.length > 32 || x.sources.some((s) => typeof s !== 'string') || !sources.length || sources.some((s) => !refs.has(s))) status = 'unverified';
  }
  const baseCache = new Map(), getBase = (kind, id) => {
    const key = kind + '/' + id;
    if (!baseCache.has(key)) baseCache.set(key, base(kind, id));
    return baseCache.get(key);
  };
  if (requireEvidence && status === 'ok') {
    for (const c of (Array.isArray(x.changes) ? x.changes : []).slice(0, 20)) {
      if (!Object.hasOwn(ASSIST_KINDS, c?.kind) || !ID_OK.test(String(c?.id || ''))) continue;
      const target = (Array.isArray(context) ? context : []).find((item) => item?.kind === c.kind && item.id === c.id);
      const op = ['put','hide','delete'].includes(c.op) ? c.op : 'put';
      if (target) {
        if (!sources.includes(sourceOf(target))) { status = 'unverified'; break; }
      } else if (op !== 'put' || !String(c.id).startsWith('n-') || !sources.includes(REQUEST_SOURCE) || !sources.includes(APP_MAP_SOURCE) || getBase(c.kind, c.id)) {
        status = 'unverified'; break;
      }
    }
  }
  // Ce garde précède la fusion et toute lecture de base : même put/hide/delete valides restent sans effet.
  if (status !== 'ok') {
    const clarify = status === 'clarify';
    return {
      status, sources: [], sourceRefs: [],
      reply: clarify ? 'Je ne suis pas sûr de l’élément ou du changement demandé. Précise-le ; aucun changement n’a été préparé.' : 'Je ne peux pas vérifier cette réponse avec les informations fournies. Aucun changement n’a été préparé.',
      questions: questions.length ? questions : [clarify ? 'Quel élément veux-tu modifier, et quel changement souhaites-tu ?' : 'Quelle information ou source de l’app peux-tu fournir pour vérifier cette demande ?'],
      items: [], needsCode: null, explain: [],
      rejected: Array.isArray(x.changes) && x.changes.length ? ['Les modifications proposées ont été écartées : la demande doit être précisée ou vérifiée.'] : [],
    };
  }
  const rejected = [], prepared = [], explain = [];
  for (const c of (Array.isArray(x.changes) ? x.changes : []).slice(0, 20)) {
    const kind = String(c?.kind || ''), id = String(c?.id || ''), op = ['put', 'hide', 'delete'].includes(c?.op) ? c.op : 'put';
    if (!Object.hasOwn(ASSIST_KINDS, kind)) { rejected.push(`Type « ${str(kind, 20) || '?'} » : l’assistant ne peut pas le modifier.`); continue; }
    if (!ID_OK.test(id)) { rejected.push(`${ASSIST_KINDS[kind].label} : identifiant invalide.`); continue; }
    let data = null;
    if (op === 'put') {
      const cur = getBase(kind, id);
      data = cleanGlobal(kind, { ...(cur || {}), ...(c.data && typeof c.data === 'object' ? c.data : {}) });
      if (!data) { rejected.push(`${ASSIST_KINDS[kind].label} « ${id} » : données incomplètes ou invalides.`); continue; }
    } else if (!getBase(kind, id)) { rejected.push(`${ASSIST_KINDS[kind].label} « ${id} » : élément inconnu, rien à ${op === 'hide' ? 'masquer' : 'rétablir'}.`); continue; }
    prepared.push({ kind, id, op, data });
    explain.push({ kind, id, op, why: str(c?.why, 240) });
  }
  const { items, errors } = cleanChange(prepared);
  rejected.push(...errors);
  const nc = x.needsCode && typeof x.needsCode === 'object' ? { title: str(x.needsCode.title, 120), summary: str(x.needsCode.summary || x.needsCode.description, 1200) } : null;
  return {
    status, sources: sources.filter((s) => refs.has(s)), sourceRefs: sources.filter((s) => refs.has(s)).map((s) => refs.get(s)),
    reply: str(x.reply, 1500) || (items.length ? 'Voici ce que je propose.' : 'Je n’ai rien proposé.'),
    items, rejected, explain: explain.filter((e) => items.some((i) => i.kind === e.kind && i.id === e.id)),
    questions,
    needsCode: nc?.title ? nc : null,
  };
}
/** Fusionne de nouvelles modifications dans un brouillon (même type + identifiant = remplacé). */
export function mergeItems(current, added) {
  const key = (i) => i.kind + '/' + i.id, map = new Map((current || []).map((i) => [key(i), i]));
  for (const i of added || []) map.set(key(i), i);
  return [...map.values()];
}
