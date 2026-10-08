// finder.js — ce que la recherche (🔍) peut trouver, et le calcul des résultats. Sans DOM, testé.
// Chaque entrée : où aller (page, sous-page ou action), l'élément à montrer, et des mots-clés (synonymes courants).

/** Minuscules, sans accents ni ponctuation : « Échauffement » et « echauffement » se retrouvent. */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const E = (kind, icon, title, sub, to, keys = '', extra = {}) => ({ kind, icon, title, sub, to, keys, ...extra });
/** Paramètres : chaque réglage, sur la page où il se trouve (sel = l'élément à mettre en lumière). */
export const SETTINGS_INDEX = [
  E('setting', '⚙️', 'Interface simple ou avancée', 'Paramètres', 'settings/main', 'interface affichage mode simple avance avancee expert complique complexite detail', { sel: '[data-act=interfaceSet]' }),
  E('setting', '🌙', 'Thème sombre ou clair', 'Affichage', 'settings/display', 'mode nuit jour clair sombre couleur fond noir blanc', { sel: '[data-k=mode]' }),
  E('setting', '🖼️', 'Icône de l’application', 'Affichage', 'settings/display', 'icone icon app application accueil telephone installer installation android iphone pwa sobre dore', { sel: '#app-icons' }),
  E('setting', '🎨', 'Ambiance', 'Affichage', 'settings/display', 'style look chaleureux muscu neon nature minimal apparence', { sel: '.vibes' }),
  E('setting', '🖍️', 'Couleur principale', 'Affichage', 'settings/display', 'couleur accent palette or bleu vert rouge rose violet', { sel: '.palette' }),
  E('setting', '🔠', 'Taille du texte', 'Affichage', 'settings/display', 'police grand petit lisible ecriture zoom', { sel: '[data-act=a11ySize]' }),
  E('setting', '📖', 'Lecture facile', 'Accessibilité', 'settings/display', 'accessibilite lecture dyslexie police lisible', { sel: '[data-act=a11ySet][data-k=easy]' }),
  E('setting', '👆', 'Gros boutons', 'Accessibilité', 'settings/display', 'accessibilite gros boutons toucher doigts', { sel: '[data-act=a11ySet][data-k=big]' }),
  E('setting', '🔲', 'Contraste renforcé', 'Accessibilité', 'settings/display', 'accessibilite contraste bordures lisible', { sel: '[data-act=a11ySet][data-k=contrast]' }),
  E('setting', '🎨', 'Couleurs pour daltonisme', 'Accessibilité', 'settings/display', 'accessibilite daltonien daltonisme couleurs', { sel: '[data-act=a11ySet][data-k=cb]' }),
  E('setting', '🍂', 'Décor de saison', 'Affichage', 'settings/display', 'saison neige hiver automne feuilles fleurs printemps ete accueil', { sel: 'input[name=season]' }),
  E('setting', '🌍', 'Langue', 'Affichage', 'settings/display', 'anglais english francais langue traduction', { sel: 'select[name=lang]' }),
  E('setting', '↔️', 'Espacement et animations', 'Affichage', 'settings/display', 'serre aere animation mouvement densite', { sel: '[data-k=density]' }),
  E('setting', '✏️', 'Mise en page', 'Affichage', 'settings/display', 'disposition ordre icones reorganiser personnaliser base reinitialiser', { sel: '[data-act=layReset]' }),
  E('setting', '🗣️', 'Coach vocal', 'Pendant la séance', 'settings/session', 'voix parle annonce vocal son', { sel: 'input[name=voice]' }),
  E('setting', '🔔', 'Bips des chronos', 'Pendant la séance', 'settings/session', 'bip son chrono minuteur sonnerie', { sel: 'input[name=sound]' }),
  E('setting', '📳', 'Vibration', 'Pendant la séance', 'settings/session', 'vibrer vibreur fin du repos', { sel: 'input[name=vibration]' }),
  E('setting', '💡', 'Garder l’écran allumé', 'Pendant la séance', 'settings/session', 'ecran veille allume eteint', { sel: 'input[name=keepAwake]' }),
  E('setting', '🔥', 'Échauffement automatique', 'Pendant la séance', 'settings/session', 'echauffement auto 5 min warm up', { sel: 'input[name=autoWarm]' }),
  E('setting', '🔠', 'Grand affichage', 'Pendant la séance', 'settings/session', 'gros texte toucher ecran valider grand', { sel: 'input[name=bigMode]' }),
  E('setting', '🎵', 'Son des bips et volume', 'Pendant la séance', 'settings/session', 'son cloche bois doux volume fort', { sel: 'select[name=soundStyle]' }),
  E('setting', '⏸️', 'Repos par défaut', 'Pendant la séance', 'settings/session', 'repos pause entre series secondes', { sel: 'input[name=defaultRest]' }),
  E('setting', '⏱', 'Durée de séance habituelle', 'Pendant la séance', 'settings/session', 'duree temps minutes habituelle', { sel: 'input[name=defaultMinutes]' }),
  E('setting', '🎙️', 'Mode mains libres', 'Pendant la séance', 'settings/session', 'commande vocale mains libres micro', { sel: 'input[name=handsFree]' }),
  E('setting', '⏰', 'Rappels d’entraînement', 'Notifications', 'settings/notifs', 'rappel alarme notification jours heure', { sel: '[data-change=remOn]' }),
  E('setting', '🔕', 'Types de notifications', 'Notifications', 'settings/notifs', 'mises a jour reponses silencieux types push', { sel: '.card' }),
  E('setting', '🎶', 'Son des notifications', 'Notifications', 'settings/notifs', 'son notification sonnerie', { sel: 'select[name=notifSound]' }),
  E('setting', '📥', 'Exporter mes données', 'Mes données', 'settings/data', 'export sauvegarde telecharger json fichier', { sel: '[data-act=export]' }),
  E('setting', '🔗', 'Applications connectées', 'Paramètres', 'settings/integrations', 'strava garmin polar montre import escalade crimpd kaya applications sport'),
  E('setting', '📄', 'Importer un historique (CSV)', 'Mes données', 'settings/data', 'import csv tableur excel fichier', { sel: 'input[data-change=csvFile]' }),
  E('setting', '🔄', 'Synchronisation', 'Paramètres', 'settings/sync', 'synchro envoi hors ligne attente serveur', {}),
  E('setting', '🧭', 'Visite guidée', 'Aide', 'settings/help', 'tuto tutoriel aide decouvrir visite', { sel: '[data-act=helpTour]' }),
  E('setting', '❓', 'Questions fréquentes', 'Aide', 'settings/help', 'faq aide question comment', { sel: 'details' }),
  E('setting', '📚', 'Sources citées', 'Aide', 'settings/help', 'etudes science references sources', { sel: 'details.srclist > summary' }),
  E('setting', '🐞', 'Signaler un bug', 'Paramètres', 'settings/bug', 'bug probleme erreur signaler contact', {}),
  E('setting', '🛡️', 'Administration', 'Paramètres', 'settings/admin', 'admin administrateur gestion site membres modifier', { account: true }),
  E('setting', '🚪', 'Se déconnecter', 'Compte', 'settings/main', 'deconnexion quitter compte', { sel: '[data-act=logout]' }),
  E('setting', '🔑', 'Changer le mot de passe', 'Compte', 'settings/main', 'mot de passe password securite', { sel: '[data-act=chpass]' }),
  E('setting', '🗑️', 'Supprimer mon compte', 'Compte', 'settings/main', 'supprimer effacer compte donnees', { sel: '[data-act=delAccount]' }),
  E('setting', '🧩', 'Mon profil sportif (questions)', 'Paramètres', 'settings/main', 'profil questionnaire niveau sports refaire', { sel: '[data-act=setupAgain]' }),
  E('setting', '📲', 'Installer l’application', 'Paramètres', 'settings/main', 'installer application ecran accueil telephone', { sel: '[data-act=installNow]' }),
];
/** Fonctions de l'app (onglets, rubriques, outils). act = action à lancer ; to = page/sous-page. */
export const FEATURE_INDEX = [
  E('feature', '🎯', 'Séance du jour', 'Accueil', '', 'generer seance aujourd hui proposer creer', { act: 'genOpen' }),
  E('feature', '✨', 'Créer une séance', 'Bibliothèque', '', 'creer generer sur mesure format parties echauffement etirements duree objectif guide composer structurer escalade', { act: 'cpResume' }),
  E('feature', '＋', 'Nouvelle séance', 'Bibliothèque', '', 'creer ajouter seance main coller', { act: 'newChoose', to: 'library/home' }),
  E('feature', '📋', 'Mes séances', 'Bibliothèque', 'library/seances', 'seances enregistrees liste modeles archives', {}),
  E('feature', '⇅', 'Trier et filtrer mes séances', 'Bibliothèque', 'library/seances', 'trier filtrer lieu salle sport style categorie forme duree intense douce ranger classer', { sel: '[data-act=sfOpen]' }),
  E('feature', '🎲', 'Surprends-moi', 'Bibliothèque', '', 'surprise hasard nouveau inhabituel progresser idee seance aleatoire', { act: 'cpSurprise' }),
  E('feature', '🧗', 'Séance d’escalade (cotation, styles)', 'Bibliothèque', 'library/climbplan', 'escalade bloc voie objectif cotation u8 style devers reglette dalle dynamique pyramide structurer parties echauffement projet', {}),
  E('feature', '🔀', 'Fusionner des séances', 'Bibliothèque', '', 'fusionner combiner melanger regrouper assembler deux seances conseil', { act: 'mergeOpen', to: 'library/seances' }),
  E('feature', '💡', 'Proposer une amélioration', 'Aider l’app', '', 'idee suggestion demande modification ameliorer proposer administrateur', { act: 'ideaNew' }),
  E('feature', '📖', 'Carnet de séances', 'Bibliothèque', 'library/catalog', 'carnet seances pretes types catalogue sourcees toutes faites programme niveau debutant intermediaire avance', {}),
  E('feature', '💪', 'Exercices', 'Bibliothèque', 'library/exercises', 'exercice catalogue muscles liste', {}),
  E('feature', '🏆', 'Top exercices pour toi', 'Bibliothèque', 'library/best', 'meilleurs exercices classement top', {}),
  E('feature', '🌍', 'Séances partagées', 'Bibliothèque', 'library/common', 'communaute partage publiees commune', {}),
  E('feature', '📋', 'Coller un texte de séance', 'Bibliothèque', '', 'importer texte coller', { act: 'openImport' }),
  E('feature', '👥', 'Séance à deux', 'Bibliothèque', '', 'ami partenaire duo ensemble synchronise code', { act: 'duoJoinAsk' }),
  E('feature', '⏱', 'Chrono', 'EMOM, AMRAP, Tabata, compte à rebours', '', 'minuteur chrono chronomètre tabata emom amrap for time pour le temps compte à rebours suspensions intervalles timer', { act: 'timerOpen' }),
  E('feature', '📆', 'Programme sur plusieurs semaines', 'Accueil', '', 'plan programme semaines calendrier', { act: 'topProgram' }),
  E('feature', '📅', 'Calendrier', 'Accueil', '', 'agenda planifier date prevoir', { act: 'topCal' }),
  E('feature', '💬', 'Coach (discussion)', 'Outil', '', 'coach question conseil discuter chat assistant', { act: 'coachOpen' }),
  E('feature', '🔔', 'Notifications', 'Accueil', '', 'nouveautes mises a jour messages', { act: 'notifOpen' }),
  E('feature', '📈', 'Résumé de mes progrès', 'Progrès', 'progress/summary', 'progression statistiques semaine resume', {}),
  E('feature', '📝', 'Journal', 'Progrès', 'progress/journal', 'seances faites passe historique journal notes ressenti frise timeline chronologie evenements', {}),
  E('feature', '🏆', 'Records et mesures', 'Profil', 'profile/perfs', 'record meilleur performance max mesure test maxima pyramide', {}),
  E('feature', '🔎', 'Mon analyse', 'Profil', 'profile/analyse', 'analyse comprendre diagnostic', {}),
  E('feature', '🔍', 'Tendances et diagnostics', 'Mon analyse', 'progress/analyses', 'stagne tendance charge analyse', {}),
  E('feature', '🧪', 'Lab (expériences)', 'Mon analyse', 'progress/lab', 'graphique courbe lab details', {}),
  E('feature', '📸', 'Bilan du mois', 'Progrès', '', 'bilan mois image partager recap', { act: 'recapOpen' }),
  E('feature', '🫀', 'Mon corps', 'Profil', 'profile/body', 'age poids taille silhouette forme corps pesee', {}),
  E('feature', '📋', 'Mon bilan physique', 'Profil', 'profile/bilan', 'bilan physique condition tests reperes questionnaire forme', {}),
  E('feature', '🏅', 'Mes sports', 'Profil', 'profile/activities', 'sport activites categories', {}),
  E('feature', '🎯', 'Objectifs', 'Profil', 'profile/goals', 'objectif but perte de poids figure front lever', {}),
  E('feature', '🧰', 'Matériel et lieux', 'Profil', 'profile/equipment', 'materiel salle maison lieu barre poutre', {}),
  E('feature', '❤️', 'Préférences (aime / évite)', 'Mon corps et mes préférences', 'profile/body', 'aime evite prefere deteste', {}),
  E('feature', '📏', 'Mes mesures', 'Profil', 'profile/perfs', 'mesure test tractions performance niveau', {}),
  E('feature', '📌', 'Projets d’escalade', 'Objectifs', 'profile/goals', 'projet bloc voie essais', {}),
  E('feature', '🎚️', 'Cotations et styles', 'Mes sports', 'profile/activities', 'cotation système style dévers dalle', {}),
  E('feature', '🧗', 'Carnet d’escalade', 'Profil', 'profile/climbing', 'bloc voie grimpe carnet escalade', {}),
  E('feature', '✋', 'Test de doigts', 'Records et mesures', 'profile/perfs', 'doigts poutre suspension test force', {}),
  E('feature', '🗺️', 'Mes capacités', 'Mon analyse', 'profile/map', 'capacites forces faiblesses carte', {}),
  E('feature', '🔎', 'Pourquoi ces conseils', 'Mon analyse', 'profile/understand', 'comprendre pourquoi explication profil', {}),
  E('feature', '🌍', 'Profil public et partage', 'Profil', 'profile/public', 'public partage abonnes amis suivre', {}),
  E('feature', '☰', 'Toutes les fonctions', 'Menu', '', 'menu tout fonctions', { act: 'allOpen' }),
];
/**
 * Résultats pour une recherche : chaque mot doit se retrouver (titre, rubrique ou mots-clés).
 * Le titre compte plus que les mots-clés ; un titre qui commence par le mot passe devant.
 */
export function findIn(index, query, limit = 30) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const e of index) {
    const t = norm(e.title), s = norm(`${e.sub} ${e.keys}`);
    let score = 0, ok = true;
    for (const w of words) {
      if (t.startsWith(w)) score += 6; else if (t.split(' ').some((x) => x.startsWith(w))) score += 4; else if (w.length >= 4 && t.includes(w)) score += 3;
      else if (s.split(' ').some((x) => x.startsWith(w))) score += 2; else if (w.length >= 5 && s.includes(w)) score += 1; else { ok = false; break; }
    }
    if (ok) out.push({ ...e, score });
  }
  return out.sort((a, b) => b.score - a.score || a.title.length - b.title.length).slice(0, limit);
}
