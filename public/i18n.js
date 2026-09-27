// i18n.js — version anglaise (bêta) : les écrans sont écrits en français ; quand l'anglais est choisi, les textes
// connus sont remplacés à l'affichage (textes, libellés d'accessibilité, indications). Ce qui n'est pas encore
// traduit reste en français. Choisir le français recharge simplement l'affichage d'origine.

const EN = {
  // Accueil, navigation
  'Séances entraînement': 'Training sessions', 'Accueil': 'Home', 'Progrès': 'Progress', 'Bibliothèque': 'Library', 'Profil': 'Profile', 'Paramètres': 'Settings',
  'Raccourcis': 'Shortcuts', 'Calendrier': 'Calendar', 'Notifications': 'Notifications', 'Toutes les fonctions': 'All features', 'Modifier la mise en page': 'Edit layout',
  'Synchronisé': 'Synced', 'Navigation principale': 'Main navigation', 'Bonjour': 'Good morning', 'Salut': 'Hi', 'Bonsoir': 'Good evening', 'Bonne nuit': 'Good night',
  'Séance du jour': 'Today’s session', 'Préparée selon ton niveau et ton temps': 'Built for your level and your time', 'Mes séances': 'My sessions', 'Lancer, créer, modifier': 'Start, create, edit',
  'Minuteur': 'Timer', 'Suspensions, Tabata…': 'Hangs, Tabata…', 'Carnet': 'Logbook', 'Blocs, voies et projets': 'Boulders, routes and projects', 'Coach': 'Coach',
  'Que faire aujourd’hui ?': 'What should I do today?', 'Séance découverte': 'Discovery session', 'Comment le sais-tu ?': 'How do you know?',
  'Express 10 minutes': '10-minute express', 'Peu de temps ? Une séance courte reconstruite pour 10 minutes.': 'Short on time? A quick session rebuilt for 10 minutes.',
  'On commence quand tu veux : ta première séance t’attend.': 'Start whenever you like: your first session is waiting.',
  'Une séance ce matin ?': 'A session this morning?', 'Le matin, c’est bien pour s’y mettre.': 'Mornings are a good time to get going.', 'Un petit créneau ce matin ?': 'A quick slot this morning?',
  'Un moment pour bouger cet après-midi ?': 'Time to move this afternoon?', 'Une pause active, ça te dit ?': 'Fancy an active break?', 'On s’y met cet après-midi ?': 'Shall we train this afternoon?',
  'Une séance ce soir ?': 'A session tonight?', 'Encore le temps pour une séance courte.': 'Still time for a short session.', 'Même 20 minutes, ça compte.': 'Even 20 minutes counts.',
  'Il est tard : le sommeil aussi fait progresser.': 'It’s late: sleep helps you progress too.', 'Repose-toi bien, on s’y remet demain.': 'Rest well, back at it tomorrow.',
  'Déjà une séance aujourd’hui, bien joué.': 'Already trained today, well done.', 'Séance du jour faite. Pense à bien récupérer.': 'Today’s session is done. Recover well.',
  'Objectif de la semaine atteint. Le repos compte aussi 🎉': 'Weekly goal reached. Rest counts too 🎉',
  'Ton profil n’est pas encore complet : les séances proposées restent prudentes.': 'Your profile isn’t complete yet: suggested sessions stay on the safe side.', 'Compléter': 'Complete',
  'Invité': 'Guest', 'D’accord ! Tu pourras compléter ton profil quand tu veux, depuis l’Accueil ou le Profil.': 'OK! You can complete your profile any time from Home or Profile.',
  'Pas encore d’historique : une séance courte pour commencer, sans présumer de ton niveau.': 'No history yet: a short session to start, without guessing your level.',
  'Mes progrès': 'My progress', 'Historique et records': 'History and records',
  // Authentification
  'Ton coach d’entraînement personnel, gratuit.': 'Your personal training coach, free.', 'Des séances faites pour toi': 'Sessions made for you', 'Guidé pendant l’effort': 'Guided while you train',
  'Chrono, repos, séries : il suffit de suivre l’écran.': 'Timer, rest, sets: just follow the screen.', 'Tu vois tes progrès': 'See your progress',
  'Historique, records et conseils expliqués simplement.': 'History, records and advice, explained simply.', 'Créer mon compte gratuit': 'Create my free account', 'J’ai déjà un compte': 'I already have an account',
  'Essayer sans compte': 'Try without an account', 'Chaque personne a son propre compte. Tes données sont privées par défaut.': 'Everyone has their own account. Your data is private by default.',
  'Créer mon compte': 'Create my account', 'Me connecter': 'Log in', 'Choisis un pseudo': 'Choose a username', 'Pseudo ou e-mail': 'Username or email', 'E-mail (facultatif)': 'Email (optional)',
  'Mot de passe (8 caractères minimum)': 'Password (at least 8 characters)', 'Mot de passe': 'Password', 'J’ai un code d’invitation': 'I have an invite code', 'Code d’invitation': 'Invite code',
  '‹ Retour': '‹ Back', 'Retour': 'Back', 'Se déconnecter': 'Log out', 'Gérer mon compte': 'Manage my account', 'Changer le mot de passe': 'Change password', 'Supprimer mon compte': 'Delete my account',
  'Environ 2 minutes.': 'About 2 minutes.', 'Répondre aux questions': 'Answer the questions', 'Remplir la fiche d’un coup': 'Fill in the form at once', 'Remplir la fiche': 'Fill in the form', 'Plus tard': 'Later',
  // Progrès
  'Résumé': 'Summary', 'Historique': 'History', 'Records': 'Records', 'Timeline': 'Timeline', 'Journal': 'Journal', 'Analyses': 'Insights', 'Lab': 'Lab',
  'Ta progression commence ici': 'Your progress starts here', 'Fais ta première séance : tes chiffres, tes records et ta régularité apparaîtront ici.': 'Do your first session: your numbers, records and consistency will show up here.',
  'Me proposer une séance': 'Suggest a session', 'Bilan du mois': 'Monthly recap',
  // Bibliothèque
  'Sur mesure': 'Custom', 'Prêtes': 'Ready-made', 'Top exercices': 'Top exercises', 'Exercices': 'Exercises', 'Partagées': 'Shared', 'Recherche': 'Search',
  '＋ Nouvelle séance': '＋ New session', 'Coller un texte': 'Paste text', 'Générer': 'Generate', 'Rejoindre à deux': 'Join a partner', 'Actives': 'Active', 'Modèles': 'Templates', 'Archivées': 'Archived',
  '▶ Lancer': '▶ Start', 'Ouvrir': 'Open', '💾 Garder': '💾 Keep', 'Garder': 'Keep', 'Partager': 'Share', 'Modifier': 'Edit', 'Supprimer': 'Delete', 'Annuler': 'Cancel', 'Confirmer': 'Confirm', 'Enregistrer': 'Save', 'Fermer': 'Close', 'Continuer': 'Continue',
  'Je me sens': 'I feel', 'Épuisé': 'Exhausted', 'Fatigué': 'Tired', 'Normal': 'Normal', 'En forme': 'Good', 'Au top': 'Great', 'Je veux une séance': 'I want a session', 'Tranquille': 'Easy', 'Soutenue': 'Moderate', 'Intense': 'Hard',
  '1 · Quel sport ?': '1 · Which sport?', '2 · Combien de temps ?': '2 · How long?', '3 · Ce que je veux travailler': '3 · What I want to work on', '(facultatif, plusieurs choix)': '(optional, several choices)',
  'Mes objectifs': 'My goals', 'Aucun objectif actif.': 'No active goal.', 'En ajouter': 'Add some', 'Intentions': 'Focus', 'Mes forces': 'My strengths', 'Mes faiblesses': 'My weaknesses', '＋ Autre': '＋ Other', '＋ Ajouter': '＋ Add', 'Ajouter': 'Add',
  'Pas encore de point fort connu (fais quelques mesures dans Profil).': 'No known strength yet (add a few measurements in Profile).',
  'Muscles': 'Muscles', 'Zones à ménager': 'Areas to go easy on', 'Lieu et matériel': 'Place and equipment', 'Lieu': 'Place', 'Aucun décrit': 'None described', 'Aucun matériel déclaré': 'No equipment listed',
  'Autres durées': 'Other durations', 'Préparer ma séance': 'Build my session', 'Tous': 'All', 'Tous objectifs': 'All goals', 'Toutes durées': 'Any duration', 'Faisable avec mon matériel': 'Doable with my equipment',
  'Escalade — bloc': 'Climbing — bouldering', 'Escalade — voie': 'Climbing — routes', 'Escalade': 'Climbing', 'Musculation': 'Weight training', 'Muscu': 'Weights', 'Renforcement / préparation physique': 'Strength & conditioning', 'Renfo': 'Conditioning',
  'Course à pied': 'Running', 'Course': 'Running', 'Natation': 'Swimming', 'Endurance': 'Endurance', 'Force': 'Strength', 'Perte de poids': 'Weight loss', 'Forme': 'Fitness', 'Santé': 'Health', 'Mobilité': 'Mobility',
  'Cardio': 'Cardio', 'Tout le corps': 'Full body', 'Gainage': 'Core', 'Équilibre': 'Balance', 'Explosivité': 'Power', 'Épaules solides': 'Strong shoulders', 'Figures (front lever, drapeau…)': 'Skills (front lever, flag…)',
  'Bras': 'Arms', 'Avant-bras et doigts': 'Forearms and fingers', 'Épaules': 'Shoulders', 'Dos': 'Back', 'Pectoraux': 'Chest', 'Abdos': 'Abs', 'Lombaires': 'Lower back', 'Fessiers': 'Glutes', 'Cuisses': 'Thighs', 'Mollets': 'Calves',
  'Doigts': 'Fingers', 'Coudes': 'Elbows', 'Poignets': 'Wrists', 'Dos, lombaires': 'Back, lower back', 'Genoux': 'Knees', 'Chevilles': 'Ankles',
  'Tirage': 'Pull', 'Poussée': 'Push', 'Jambes': 'Legs', 'Pourquoi le renforcement compte': 'Why strength training matters', 'Ça travaille': 'What it trains', 'Conseils': 'Tips', 'Déroulé': 'Plan',
  'débutant': 'beginner', 'intermédiaire': 'intermediate', 'avancé': 'advanced', 'pour toi': 'for you',
  '3 · Format de la séance': '3 · Session format', '4 · Ce que je veux travailler': '4 · What I want to work on', 'Automatique': 'Automatic', 'Classique': 'Classic', 'Avec étirements': 'With stretching',
  'Technique + physique': 'Technique + fitness', 'Cardio + renfo': 'Cardio + strength', 'Je compose': 'Build my own', 'Autre durée': 'Other length', 'Échauffement': 'Warm-up', 'Corps de séance': 'Main set', 'Technique': 'Technique',
  'Renforcement': 'Strength', 'Étirements': 'Stretching', 'Retour au calme': 'Cool-down', '＋ Ajouter une partie': '＋ Add a part', 'Garder ce format': 'Keep this format', 'Supprimer ce format': 'Delete this format',
  'L’app répartit le temps : échauffement, corps de séance, retour au calme.': 'The app splits the time: warm-up, main set, cool-down.', 'de 5 min à 4 h': 'from 5 min to 4 h',
  'Moi': 'Me', 'Mes résultats': 'My results', 'Comprendre mes conseils': 'Understand my advice', 'Partager': 'Share', 'Pourquoi ces conseils': 'Why this advice', 'ce que l’app sait de toi': 'what the app knows about you',
  'Mes capacités': 'My abilities', 'forces et points à travailler': 'strengths and things to work on', 'Nouvelle séance': 'New session', 'Séance prête': 'Ready-made session', 'À la main': 'By hand', 'Rejoindre un ami': 'Join a friend',
  'L’app la prépare selon ton sport, ton temps et ce que tu veux travailler.': 'The app builds it from your sport, your time and what you want to work on.', 'Des séances expliquées et sourcées, à lancer tout de suite.': 'Explained, sourced sessions you can start right away.',
  'Tu choisis chaque exercice toi-même.': 'You pick every exercise yourself.', 'Tu as déjà ta séance écrite quelque part ? Colle-la.': 'Already have your session written somewhere? Paste it.', 'Faire la séance d’un ami, avec les chronos en même temps.': 'Do a friend’s session with synced timers.',
  'Thème, ambiance, couleur, taille, langue, mise en page': 'Theme, style, colour, size, language, layout', 'Coach vocal, bips, vibration, repos par défaut': 'Voice coach, beeps, vibration, default rest', 'Rappels d’entraînement, mises à jour, son': 'Training reminders, updates, sound',
  'Exporter, importer un historique': 'Export, import a history', 'État de l’envoi de tes données': 'Status of your data upload', 'Visite guidée, questions fréquentes, sources': 'Guided tour, FAQ, sources', 'Un problème ? Dis-le nous': 'A problem? Tell us', 'Réservé aux administrateurs': 'Admins only',
  '‹ Paramètres': '‹ Settings', '‹ Exercices': '‹ Exercises', '‹ Profil': '‹ Profile', 'Top exercices pour toi': 'Top exercises for you', 'Les plus utiles par catégorie, selon ton profil': 'The most useful per category, for your profile', 'Rechercher': 'Search', 'Menu : toutes les fonctions': 'Menu: all features',
  'Nouveau': 'New', '✓ Vu': '✓ Seen', '↺ Non vue': '↺ Unseen', '✓ Tout marquer comme vu': '✓ Mark all as seen', 'Rien de nouveau. Tout est vu 👍': 'Nothing new. All seen 👍', 'Réglages': 'Settings', 'Faire la visite': 'Take the tour',
  'Aller plus loin': 'Go further', 'Frise': 'Timeline', '‹ Bibliothèque': '‹ Library', '‹ Progrès': '‹ Progress', 'Séances prêtes': 'Ready-made sessions', 'Rechercher': 'Search', 'Partagées': 'Shared',
  'Tes séances faites, une par une': 'Your completed sessions, one by one', 'Tes meilleures performances': 'Your best performances', 'Tout ce qui s’est passé, dans l’ordre': 'Everything that happened, in order',
  'Tes notes et tes ressentis': 'Your notes and feelings', 'Tendances, charge, pourquoi je stagne': 'Trends, load, why I plateau', 'Graphiques détaillés pour aller plus loin': 'Detailed charts to go further',
  'Tes séances : lancer, modifier, planifier': 'Your sessions: start, edit, plan', 'L’app prépare une séance pour toi, au format que tu veux': 'The app builds a session for you, in the format you want',
  'Les séances publiées par la communauté': 'Sessions published by the community', 'Une séance, un exercice, une capacité…': 'A session, an exercise, an ability…',
  'Que cherches-tu ?': 'What are you looking for?', 'Rechercher un paramètre…': 'Search a setting…', 'Rechercher dans l’app': 'Search the app', 'Fonctions': 'Features', 'Exercice': 'Exercise',
  'Pour qui ?': 'For whom?', 'Pour moi seulement': 'Just for me', 'Pour tout le monde': 'For everyone', 'Seul ton compte voit ce changement.': 'Only your account sees this change.',
  'Tous les comptes le voient, dès leur prochaine ouverture de l’app.': 'Every account sees it the next time they open the app.', '✏️ Modifier': '✏️ Edit', '🙈 Masquer': '🙈 Hide', '↺ Retirer ma modification': '↺ Remove my change',
  '↺ Annuler': '↺ Undo', 'Rien n’a encore été changé.': 'Nothing has been changed yet.', '＋ Ajouter une intention': '＋ Add a focus', 'Enregistrer pour tout le monde': 'Save for everyone',
  // Partage et séance à deux
  'Séance à deux': 'Partner session', 'Rejoindre la séance': 'Join the session', 'Rejoindre': 'Join', 'Copier le lien': 'Copy link', 'Envoyer…': 'Send…', 'Arrêter le mode à deux': 'Stop partner mode',
  'Lien et QR code': 'Link and QR code', 'Mon profil public': 'My public profile', 'Bibliothèque commune': 'Shared library', 'À deux': 'Partner', 'En attente': 'Waiting',
  // Profil
  'Choisir mes sports': 'Choose my sports', 'Mon corps': 'My body', 'âge, poids, forme': 'age, weight, shape', 'Ce que l’app sait': 'What the app knows', 'et comment': 'and how', 'Ma carte': 'My map', 'mes capacités': 'my abilities',
  'Mes sports': 'My sports', 'et catégories': 'and categories', 'Mes mesures': 'My measurements', 'tests, records': 'tests, records', 'Objectifs': 'Goals', 'et figures': 'and skills', 'Matériel': 'Equipment', 'lieux, équipement': 'places, gear',
  'Préférences': 'Preferences', 'aime / évite': 'likes / avoids', 'Partage': 'Sharing', 'profil public': 'public profile', 'Ajoute une ou deux mesures pour voir tes points forts.': 'Add one or two measurements to see your strengths.',
  // Paramètres
  'Essentiel': 'Essentials', 'Aide': 'Help', 'Mes données': 'My data', 'Synchronisation': 'Sync', 'Signaler un bug': 'Report a bug', 'Admin': 'Admin',
  'Affichage': 'Display', 'Thème': 'Theme', 'Sombre': 'Dark', 'Clair': 'Light', 'Comme mon téléphone': 'Like my phone', 'Ambiance': 'Style', 'Classique': 'Classic', 'Sobre et lisible': 'Plain and readable',
  'Chaleureux': 'Warm', 'Tons chauds, tout en douceur': 'Warm, soft tones', 'Salle de muscu': 'Gym', 'Noir, rouge, énergique': 'Black, red, energetic', 'Grand air': 'Outdoors', 'Vert forêt, esprit falaise': 'Forest green, crag spirit',
  'Minimal': 'Minimal', 'Épuré, sans effets': 'Clean, no effects', 'Néon': 'Neon', 'Sombre et lumineux': 'Dark and bright', 'Couleur': 'Colour', 'Taille du texte': 'Text size', 'Petit': 'Small', 'Grand': 'Large', 'Très grand': 'Extra large',
  'Décor de saison sur l’accueil (neige, fleurs, feuilles…)': 'Seasonal scenery on the home screen (snow, flowers, leaves…)', 'Langue': 'Language', 'Plus d’options d’affichage': 'More display options',
  'Espacement': 'Spacing', 'Serré': 'Compact', 'Aéré': 'Airy', 'Animations': 'Animations', 'Oui': 'Yes', 'Non': 'No', 'Mise en page': 'Layout', 'Revenir à la mise en page de base partout': 'Reset the layout everywhere',
  'Mon profil sportif': 'My sports profile', 'Pour que l’app s’adapte à toi (sports, niveau, temps, matériel, objectif).': 'So the app adapts to you (sports, level, time, equipment, goal).', 'Voir mon profil': 'See my profile',
  'Installer l’application': 'Install the app', 'Installer': 'Install', 'Pendant la séance': 'During the session', 'Coach vocal : il annonce les séries, le repos et le décompte': 'Voice coach: announces sets, rest and the countdown',
  'Bips pour les chronos': 'Timer beeps', 'Vibration à la fin du repos': 'Vibrate when rest ends', 'Garder l’écran allumé': 'Keep the screen on', 'Ajouter un échauffement de 5 min à mes séances': 'Add a 5-minute warm-up to my sessions',
  'Grand affichage (touche l’écran pour valider)': 'Big display (tap the screen to confirm)', 'Son des bips': 'Beep sound', 'Bip': 'Beep', 'Cloche': 'Bell', 'Bois': 'Wood', 'Doux': 'Soft', 'Volume': 'Volume', 'Écouter': 'Play',
  'Repos par défaut': 'Default rest', 'secondes': 'seconds', 'Durée de séance habituelle': 'Usual session length', 'Options avancées': 'Advanced options', 'Mode mains libres (commandes vocales)': 'Hands-free mode (voice commands)',
  'Proposer d’utiliser mes valeurs réalisées comme nouvelle base': 'Offer to use my results as the new baseline', 'À propos': 'About', 'Son dans l’app': 'In-app sound', 'Aucun': 'None', 'Ouvrir mes notifications': 'Open my notifications',
  'Visite guidée': 'Guided tour', 'Revois en 30 secondes à quoi sert chaque onglet.': 'See in 30 seconds what each tab is for.', 'Lancer la visite': 'Start the tour', 'Revoir les nouveautés': 'See what’s new again',
  'Questions fréquentes': 'FAQ', 'Comment faire ma première séance ?': 'How do I do my first session?', 'Comment l’app choisit mes exercices ?': 'How does the app pick my exercises?', 'Je ne connais pas mon niveau, c’est grave ?': 'I don’t know my level, is that a problem?',
  'Où sont mes séances enregistrées ?': 'Where are my sessions saved?', 'Ça marche sans internet ?': 'Does it work offline?', 'Mes données sont-elles privées ?': 'Is my data private?', 'Comment installer l’application ?': 'How do I install the app?', 'Un problème ?': 'A problem?',
  'Sources citées': 'Sources cited', 'Or': 'Gold', 'Bleu': 'Blue', 'Vert': 'Green', 'Rouge': 'Red', 'Violet': 'Purple', 'Rose': 'Pink', 'Contraste élevé (jaune)': 'High contrast (yellow)',
  // Lecteur
  '✕ Terminer': '✕ Finish', 'Terminer': 'Finish', 'Passer ⏭': 'Skip ⏭', 'Passer': 'Skip', 'Durée': 'Duration', 'Consignes': 'How to do it', 'À éviter': 'Avoid', 'Pause': 'Pause', 'Reprendre': 'Resume',
  '✓ Terminer la série': '✓ Finish the set', '✓ Série faite': '✓ Set done', 'Repos': 'Rest', 'Passer le repos': 'Skip rest', 'Répétitions faites': 'Reps done', 'Charge': 'Load', 'Moins': 'Less', 'Plus': 'More',
  'Illustration du mouvement': 'Movement illustration', 'Touche l’écran n’importe où pour valider': 'Tap anywhere on the screen to confirm',
  'Aucune séance sur les 12 dernières semaines.': 'No sessions in the last 12 weeks.', 'aucune séance enregistrée': 'no session saved',
};
const WORDS = [
  [/\bSérie (\d+) \/ (\d+)/g, 'Set $1 / $2'], [/\bExercice (\d+) \/ (\d+)/g, 'Exercise $1 / $2'], [/\bcôté (\d) \/ 2/g, 'side $1 / 2'],
  [/^(\d+) séances? cette semaine$/, '$1 session(s) this week'], [/^(\d+)\/(\d+) séances? cette semaine$/, '$1/$2 sessions this week'], [/^Durée choisie : (\d+) min$/, 'Chosen length: $1 min'],
  [/^Ensuite : (.+)$/, 'Next: $1'], [/^Repos prévu : (.+)$/, 'Planned rest: $1'], [/^▶ Démarrer \((.+)\)$/, '▶ Start ($1)'], [/(\d+) semaines d’affilée/, '$1 weeks in a row'],
  [/^Total : (.+)$/, 'Total: $1'], [/^(\d+) séances? enregistrées?$/, '$1 saved session(s)'], [/^(\d+) séances? : lancer, modifier, planifier$/, '$1 session(s): start, edit, plan'], [/^(\d+) séances expliquées et sourcées$/, '$1 explained, sourced sessions'], [/^(\d+) exercices, et le top pour toi$/, '$1 exercises, and the top ones for you'], [/^Nouvelles \((\d+)\)$/, 'New ($1)'], [/^Nouvelles$/, 'New'], [/^Déjà vues \((\d+)\)$/, 'Already seen ($1)'], [/^Revoir \((\d+)\)$/, 'See again ($1)'], [/^Ce qui a changé \((\d+)\)$/, 'What changed ($1)'], [/^Voir les (\d+) autres exercices$/, 'See the $1 other exercises'], [/ rép\./g, ' reps'], [/ · repos /g, ' · rest '], [/\bmin (\d+)\b/g, 'min $1'],
];
const DAYS = { lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday', vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday' };
const MONTHS = { janvier: 'January', février: 'February', mars: 'March', avril: 'April', mai: 'May', juin: 'June', juillet: 'July', août: 'August', septembre: 'September', octobre: 'October', novembre: 'November', décembre: 'December' };
const LEAD = /^([\p{Extended_Pictographic}\p{Emoji_Presentation}️‍＋✓✕▶⏸‹·]+\s*)/u;

/** Traduction d'un texte (ou le texte d'origine s'il n'est pas connu). Sans DOM, testée. */
export function tr(text) {
  const s = String(text ?? ''), core = s.trim();
  if (!core) return s;
  const pre = s.slice(0, s.indexOf(core)), post = s.slice(s.indexOf(core) + core.length);
  const out = trCore(core);
  return out === core ? s : pre + out + post;
}
function trCore(core) {
  if (EN[core]) return EN[core];
  const m = core.match(LEAD);
  if (m && EN[core.slice(m[0].length)]) return m[0] + EN[core.slice(m[0].length)];
  let t = core;
  const date = t.match(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) (\d{1,2}) (\p{L}+)$/u);
  if (date && MONTHS[date[3]]) return `${DAYS[date[1]]} ${date[2]} ${MONTHS[date[3]]}`;
  for (const [re, rep] of WORDS) t = t.replace(re, rep);
  if (t !== core) return t;
  // Libellé composé « A · B · C » : chaque morceau connu est traduit.
  if (core.includes(' · ')) { const parts = core.split(' · ').map((x) => EN[x] || x); const j = parts.join(' · '); if (j !== core) return j; }
  return core;
}

let lang = 'fr', obs = null;
const ATTRS = ['placeholder', 'aria-label', 'title'];
function walk(root) {
  if (root.nodeType === 3) { const v = root.nodeValue, t = tr(v); if (t !== v) root.nodeValue = t; return; }
  if (root.nodeType !== 1 || root.closest?.('script,style,textarea,svg,[data-noi18n]')) return;
  for (const a of ATTRS) { const v = root.getAttribute?.(a); if (v) { const t = tr(v); if (t !== v) root.setAttribute(a, t); } }
  if (root.tagName === 'INPUT' && (root.type === 'button' || root.type === 'submit') && root.value) { const t = tr(root.value); if (t !== root.value) root.value = t; }
  for (const c of root.childNodes) walk(c);
}
/** Active ou coupe la traduction. Retourne true si l'affichage doit être refait (retour au français). */
export function setLang(l) {
  const next = l === 'en' ? 'en' : 'fr', changed = next !== lang;
  lang = next;
  try { document.documentElement.lang = lang; } catch { /* rien */ }
  if (lang === 'en') {
    if (!obs && typeof MutationObserver !== 'undefined') {
      obs = new MutationObserver((list) => { for (const m of list) { if (m.type === 'characterData') walk(m.target); else for (const n of m.addedNodes) walk(n); } });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    walk(document.body);
  } else if (obs) { obs.disconnect(); obs = null; }
  return changed && lang === 'fr';
}
export const currentLang = () => lang;
