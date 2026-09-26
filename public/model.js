// model.js — modèle sémantique sportif : métrique → capacité → exercice → objectif (et muscles).
// Données structurées uniquement (aucune logique enfermée dans du texte libre). Pur JavaScript, sans DOM.
//
// Vocabulaire :
//  - une MÉTRIQUE définit ce qui est mesuré (ex. « tractions max ») ;
//  - une PERFORMANCE est une valeur observée à une date (voir items.js, collection perf) ;
//  - une CAPACITÉ est une qualité sportive (ex. « tirage vertical ») ;
//  - un EXERCICE sollicite des capacités (relations pondérées) et des muscles (principaux / secondaires) ;
//  - un OBJECTIF (dont les figures complexes) requiert des capacités.
// Les « repères » (tiers) des métriques sont des repères pratiques courants de l'entraînement, indicatifs :
// ils ne décident jamais seuls d'un niveau (voir brain.js capacityState, qui combine plusieurs sources
// et affiche leur provenance et leur degré de confiance).

export const CAPACITIES = {
  tirage_vertical: { label: 'Tirage vertical', family: 'force', desc: 'Tirer le corps vers une barre ou une prise (tractions).' },
  tirage_horizontal: { label: 'Tirage horizontal', family: 'force', desc: 'Ramener une charge vers le buste (rowing, tractions australiennes).' },
  tirage_unilateral: { label: 'Tirage à un bras', family: 'force', desc: 'Tirer avec un seul bras (tractions archer, à un bras).' },
  blocage: { label: 'Blocage', family: 'force', desc: 'Tenir une position bras fléchis (verrouillage).' },
  poussee_horizontale: { label: 'Poussée horizontale', family: 'force', desc: 'Pousser devant soi (pompes, développé couché, dips).' },
  poussee_verticale: { label: 'Poussée verticale', family: 'force', desc: 'Pousser au-dessus de la tête (développé militaire, pompes piquées, équilibre sur les mains).' },
  controle_scapulaire: { label: 'Contrôle des omoplates', family: 'force', desc: 'Abaisser et stabiliser les omoplates (suspension active, front lever).' },
  stabilite_epaules: { label: 'Stabilité des épaules', family: 'prevention', desc: 'Coiffe des rotateurs et antagonistes : épaules solides et durables.' },
  gainage_anterieur: { label: 'Gainage antérieur', family: 'gainage', desc: 'Tronc solide vers l’avant, compression (hollow, relevés de jambes).' },
  gainage_lateral: { label: 'Gainage latéral', family: 'gainage', desc: 'Obliques et chaîne latérale (planche latérale, drapeau).' },
  chaine_posterieure: { label: 'Chaîne postérieure', family: 'force', desc: 'Fessiers, ischio-jambiers et lombaires (soulevé de terre, pont).' },
  force_jambes: { label: 'Force des jambes', family: 'force', desc: 'Squat, fentes, montées.' },
  explosivite: { label: 'Explosivité', family: 'puissance', desc: 'Produire de la force très vite (sauts, lancers).' },
  puissance_haut: { label: 'Puissance du haut du corps', family: 'puissance', desc: 'Tirages et mouvements dynamiques rapides (dynos, tractions explosives).' },
  force_doigts: { label: 'Force des doigts', family: 'force', desc: 'Tenir de petites prises (suspensions, réglettes).' },
  endurance_doigts: { label: 'Résistance des avant-bras', family: 'endurance', desc: 'Répéter des efforts de préhension sans « bouteille ».' },
  pince: { label: 'Force de pince', family: 'force', desc: 'Serrer une prise entre le pouce et les doigts.' },
  mobilite_hanches: { label: 'Mobilité des hanches', family: 'mobilite', desc: 'Amplitude des hanches et des ischio-jambiers.' },
  mobilite_epaules: { label: 'Mobilité des épaules', family: 'mobilite', desc: 'Amplitude des épaules et du haut du dos.' },
  equilibre: { label: 'Équilibre', family: 'technique', desc: 'Stabilité, proprioception, contrôle sur un appui.' },
  technique_pieds: { label: 'Précision des pieds', family: 'technique', desc: 'Placement et confiance des pieds en escalade.' },
  technique_escalade: { label: 'Technique d’escalade', family: 'technique', desc: 'Lecture, placement du corps, fluidité.' },
  coordination: { label: 'Coordination', family: 'technique', desc: 'Mouvements dynamiques et enchaînements précis.' },
  endurance_aerobie: { label: 'Endurance fondamentale', family: 'endurance', desc: 'Tenir un effort modéré longtemps.' },
  seuil: { label: 'Allure soutenue (seuil)', family: 'endurance', desc: 'Maintenir un effort soutenu sur la durée.' },
  vitesse: { label: 'Vitesse', family: 'puissance', desc: 'Aller vite sur des efforts courts.' },
  technique_course: { label: 'Technique de course', family: 'technique', desc: 'Économie et posture de course.' },
  technique_nage: { label: 'Technique de nage', family: 'technique', desc: 'Efficacité, glisse et respiration dans l’eau.' },
};
export const CAP_FAMILIES = { force: 'Force', puissance: 'Puissance', gainage: 'Gainage', endurance: 'Endurance', technique: 'Technique', mobilite: 'Mobilité', prevention: 'Prévention' };

/* ───────── Muscles (noms français, vue de face / de dos) et leur lien vers les capacités ───────── */
export const MUSCLES = {
  pectoraux: { label: 'Pectoraux', view: 'front', caps: { poussee_horizontale: 1 } },
  deltoide_ant: { label: 'Deltoïde antérieur', view: 'front', caps: { poussee_verticale: 0.8, poussee_horizontale: 0.4 } },
  deltoide_post: { label: 'Deltoïde postérieur', view: 'back', caps: { stabilite_epaules: 0.6, tirage_horizontal: 0.5 } },
  biceps: { label: 'Biceps', view: 'front', caps: { tirage_vertical: 0.6, blocage: 0.8 } },
  triceps: { label: 'Triceps', view: 'back', caps: { poussee_horizontale: 0.6, poussee_verticale: 0.6 } },
  avant_bras_flech: { label: 'Fléchisseurs des doigts', view: 'front', caps: { force_doigts: 1, endurance_doigts: 1, pince: 0.8 } },
  avant_bras_ext: { label: 'Extenseurs de l’avant-bras', view: 'back', caps: { stabilite_epaules: 0.2, endurance_doigts: 0.3 } },
  grand_dorsal: { label: 'Grand dorsal', view: 'back', caps: { tirage_vertical: 1, controle_scapulaire: 0.6 } },
  trapezes: { label: 'Trapèzes', view: 'back', caps: { controle_scapulaire: 0.8, tirage_horizontal: 0.5 } },
  rhomboides: { label: 'Rhomboïdes', view: 'back', caps: { tirage_horizontal: 0.8, stabilite_epaules: 0.5 } },
  coiffe: { label: 'Coiffe des rotateurs', view: 'back', caps: { stabilite_epaules: 1 } },
  grand_dentele: { label: 'Grand dentelé', view: 'front', caps: { stabilite_epaules: 0.6, poussee_verticale: 0.4 } },
  grand_droit: { label: 'Grand droit de l’abdomen', view: 'front', caps: { gainage_anterieur: 1 } },
  obliques: { label: 'Obliques', view: 'front', caps: { gainage_lateral: 1, gainage_anterieur: 0.3 } },
  lombaires: { label: 'Érecteurs du rachis (lombaires)', view: 'back', caps: { chaine_posterieure: 0.8 } },
  grand_fessier: { label: 'Grand fessier', view: 'back', caps: { chaine_posterieure: 1, force_jambes: 0.7, explosivite: 0.5 } },
  moyen_fessier: { label: 'Moyen fessier', view: 'back', caps: { equilibre: 0.7, gainage_lateral: 0.3 } },
  flechisseurs_hanche: { label: 'Fléchisseurs de hanche', view: 'front', caps: { gainage_anterieur: 0.6, mobilite_hanches: 0.3 } },
  quadriceps: { label: 'Quadriceps', view: 'front', caps: { force_jambes: 1, explosivite: 0.6 } },
  adducteurs: { label: 'Adducteurs', view: 'front', caps: { mobilite_hanches: 0.6, force_jambes: 0.3 } },
  ischios: { label: 'Ischio-jambiers', view: 'back', caps: { chaine_posterieure: 0.9, mobilite_hanches: 0.4 } },
  mollets: { label: 'Mollets', view: 'back', caps: { explosivite: 0.4, equilibre: 0.3 } },
  tibial: { label: 'Tibial antérieur', view: 'front', caps: { equilibre: 0.3, technique_course: 0.3 } },
};

/* ───────── Matériel et environnements ───────── */
export const EQUIPMENT = {
  wall: 'Mur d’escalade', hangboard: 'Poutre de suspension', bar: 'Barre de traction', dips: 'Barres parallèles', weights: 'Haltères / lest',
  band: 'Élastique', rings: 'Anneaux', barbell: 'Barre et disques', kettlebell: 'Kettlebell', bench: 'Banc', pole: 'Espalier / poteau',
  box: 'Box / marche', rope: 'Corde à sauter', mat: 'Tapis de sol', machine: 'Machines de musculation', pool: 'Bassin de natation',
  pullbuoy: 'Pull-buoy / planche', track: 'Piste / terrain', hill: 'Côte', treadmill: 'Tapis de course',
};
export const ENV_TYPES = { maison: 'Maison', salle: 'Salle de sport', exterieur: 'Extérieur', escalade: 'Salle d’escalade', piscine: 'Piscine', piste: 'Piste / terrain', autre: 'Autre' };
// Modèles proposés à la création d'un environnement (l'utilisateur coche ensuite son matériel réel).
export const ENV_TEMPLATES = {
  maison: ['mat', 'band'], salle: ['bar', 'dips', 'weights', 'barbell', 'bench', 'kettlebell', 'machine', 'box', 'mat', 'band', 'rope', 'treadmill'],
  exterieur: ['track', 'hill'], escalade: ['wall', 'hangboard', 'bar', 'mat', 'band'], piscine: ['pool', 'pullbuoy'], piste: ['track'], autre: [],
};

/* ───────── Activités natives (V1) ───────── */
// caps : poids de chaque capacité dans la « structure » de l'activité (sert à repérer les capacités sous-entraînées).
// categories : catégories natives (modifiables : l'utilisateur peut en ajouter, les masquer ou en créer d'autres).
export const ACTIVITIES = {
  climbing_boulder: {
    label: 'Escalade — bloc', emoji: '🧗', aliases: ['bloc', 'boulder', 'escalade bloc'], gradeActivity: 'bloc',
    caps: { force_doigts: 1, technique_escalade: 0.9, puissance_haut: 0.8, technique_pieds: 0.8, tirage_vertical: 0.7, gainage_anterieur: 0.7, coordination: 0.7, blocage: 0.6, pince: 0.5, mobilite_hanches: 0.5, stabilite_epaules: 0.5, equilibre: 0.5 },
    categories: [['dalle', 'Dalle', ['technique_pieds', 'equilibre']], ['devers', 'Dévers', ['tirage_vertical', 'gainage_anterieur', 'puissance_haut']], ['reglette', 'Réglettes', ['force_doigts']], ['pince', 'Pinces', ['pince']], ['dynamique', 'Dynamique', ['coordination', 'puissance_haut']], ['lecture', 'Lecture', ['technique_escalade']]],
  },
  climbing_route: {
    label: 'Escalade — voie', emoji: '🧗‍♂️', aliases: ['voie', 'lead', 'escalade voie', 'falaise', 'couenne'], gradeActivity: 'voie',
    caps: { endurance_doigts: 1, technique_escalade: 0.9, technique_pieds: 0.8, force_doigts: 0.6, endurance_aerobie: 0.5, tirage_vertical: 0.5, blocage: 0.5, gainage_anterieur: 0.5, stabilite_epaules: 0.4 },
    categories: [['endurance', 'Endurance', ['endurance_doigts', 'endurance_aerobie']], ['resistance', 'Résistance', ['endurance_doigts']], ['technique', 'Technique', ['technique_escalade', 'technique_pieds']], ['lecture', 'Lecture', ['technique_escalade']], ['mental', 'Gestion des essais', ['technique_escalade']]],
  },
  strength: {
    label: 'Musculation', emoji: '🏋️', aliases: ['muscu', 'musculation', 'force', 'salle'],
    caps: { force_jambes: 0.9, tirage_vertical: 0.8, tirage_horizontal: 0.8, poussee_horizontale: 0.8, chaine_posterieure: 0.8, poussee_verticale: 0.7, gainage_anterieur: 0.5, stabilite_epaules: 0.4 },
    categories: [['tirage', 'Tirage', ['tirage_vertical', 'tirage_horizontal']], ['poussee', 'Poussée', ['poussee_horizontale', 'poussee_verticale']], ['jambes', 'Jambes', ['force_jambes', 'chaine_posterieure']], ['gainage', 'Gainage', ['gainage_anterieur', 'gainage_lateral']]],
  },
  conditioning: {
    label: 'Renforcement / préparation physique', emoji: '💪', aliases: ['renfo', 'renforcement', 'prepa', 'préparation physique', 'poids du corps', 'street workout', 'calisthenics'],
    caps: { gainage_anterieur: 0.9, stabilite_epaules: 0.8, gainage_lateral: 0.7, controle_scapulaire: 0.6, chaine_posterieure: 0.6, force_jambes: 0.6, equilibre: 0.6, mobilite_hanches: 0.6, mobilite_epaules: 0.6, explosivite: 0.5, poussee_horizontale: 0.5, tirage_horizontal: 0.5, tirage_vertical: 0.5 },
    categories: [['gainage', 'Gainage', ['gainage_anterieur', 'gainage_lateral']], ['prevention', 'Prévention', ['stabilite_epaules']], ['mobilite', 'Mobilité', ['mobilite_hanches', 'mobilite_epaules']], ['figures', 'Figures', ['controle_scapulaire', 'tirage_unilateral']], ['explosivite', 'Explosivité', ['explosivite']]],
  },
  running: {
    label: 'Course à pied', emoji: '🏃', aliases: ['course', 'running', 'jogging', 'run', 'trail'],
    caps: { endurance_aerobie: 1, seuil: 0.8, vitesse: 0.6, technique_course: 0.6, force_jambes: 0.4, explosivite: 0.3, mobilite_hanches: 0.3, gainage_anterieur: 0.3 },
    categories: [['endurance', 'Endurance fondamentale', ['endurance_aerobie']], ['seuil', 'Seuil', ['seuil']], ['vitesse', 'Vitesse', ['vitesse']], ['cotes', 'Côtes', ['force_jambes', 'seuil']], ['technique', 'Technique', ['technique_course']]],
  },
  swimming: {
    label: 'Natation', emoji: '🏊', aliases: ['natation', 'nage', 'swim', 'swimming', 'piscine'],
    caps: { technique_nage: 1, endurance_aerobie: 0.9, vitesse: 0.6, stabilite_epaules: 0.5, mobilite_epaules: 0.5, tirage_horizontal: 0.4, gainage_anterieur: 0.4 },
    categories: [['technique', 'Technique', ['technique_nage']], ['endurance', 'Endurance', ['endurance_aerobie']], ['vitesse', 'Vitesse', ['vitesse']], ['respiration', 'Respiration', ['technique_nage']]],
  },
};
export const NATIVE_ACTIVITY_IDS = Object.keys(ACTIVITIES);

/* ───────── Métriques natives ───────── */
// dir : 1 = plus c'est haut mieux c'est ; -1 = plus c'est bas mieux c'est (temps de course).
// tiers : repères indicatifs [a, b] → < a « débutant », a–b « intermédiaire », > b « avancé » (pour dir -1 : inversé).
// Absents pour les charges absolues (kg) : sans poids de corps, un repère serait inventé — ces métriques servent
// alors uniquement à suivre la progression personnelle.
const M = (label, unit, kind, caps, acts, o = {}) => ({ label, unit, kind, caps, acts, dir: 1, ...o });
export const METRICS = {
  max_tractions: M('Tractions strictes max', 'reps', 'reps', { tirage_vertical: 1, blocage: 0.3 }, ['strength', 'conditioning', 'climbing_boulder', 'climbing_route'], { tiers: [5, 12], test: 'Prise pronation, bras tendus en bas, menton au-dessus de la barre. Compte les répétitions propres, sans élan.' }),
  traction_lestee: M('Traction lestée : charge ajoutée max (1 rép.)', 'kg', 'load', { tirage_vertical: 1, blocage: 0.4 }, ['strength', 'conditioning', 'climbing_boulder'], { test: 'Après échauffement, monte la charge par paliers jusqu’à la dernière traction propre.' }),
  traction_archer: M('Tractions archer (par côté)', 'reps', 'reps', { tirage_unilateral: 1, tirage_vertical: 0.4 }, ['conditioning'], { tiers: [1, 5], test: 'Un bras tire, l’autre reste tendu sur la barre. Compte les répétitions propres du côté le plus faible.' }),
  traction_un_bras: M('Tractions à un bras (par côté)', 'reps', 'reps', { tirage_unilateral: 1, blocage: 0.5 }, ['conditioning'], { tiers: [1, 3], test: 'Sans aide de l’autre main. Compte le côté le plus faible.' }),
  blocage_90: M('Blocage bras à 90° (temps)', 's', 'time', { blocage: 1, tirage_vertical: 0.3 }, ['conditioning', 'climbing_boulder'], { tiers: [10, 30], test: 'Menton-barre ou coudes à 90°, tiens jusqu’à ce que la position se dégrade.' }),
  dead_hang: M('Suspension active à la barre (temps)', 's', 'time', { controle_scapulaire: 0.6, endurance_doigts: 0.5 }, ['conditioning', 'climbing_boulder', 'climbing_route'], { tiers: [30, 60], test: 'Bras tendus, épaules actives (omoplates basses). Chronomètre jusqu’au lâcher.' }),
  suspension_20mm: M('Suspension réglette 20 mm (temps)', 's', 'time', { force_doigts: 1 }, ['climbing_boulder', 'climbing_route'], { tiers: [10, 30], test: 'Poutre, réglette 20 mm, prise semi-arquée, poids du corps. Chronomètre jusqu’au lâcher (arrête si douleur).' }),
  suspension_lestee: M('Suspension 20 mm, 10 s : charge ajoutée max', 'kg', 'load', { force_doigts: 1 }, ['climbing_boulder'], { test: 'Réservé aux grimpeurs expérimentés. Charge maximale tenue 10 s en gardant une réserve.' }),
  max_pompes: M('Pompes max', 'reps', 'reps', { poussee_horizontale: 1, gainage_anterieur: 0.2 }, ['strength', 'conditioning'], { tiers: [15, 35], test: 'Corps gainé, poitrine près du sol, bras tendus en haut. Sans pause au sol.' }),
  max_dips: M('Dips max', 'reps', 'reps', { poussee_horizontale: 0.6, poussee_verticale: 0.4 }, ['strength', 'conditioning'], { tiers: [8, 20], test: 'Aux barres parallèles, épaules sous contrôle, amplitude confortable.' }),
  pompes_piquees: M('Pompes piquées max', 'reps', 'reps', { poussee_verticale: 1 }, ['conditioning'], { tiers: [5, 15] }),
  handstand_mur: M('Équilibre sur les mains contre un mur (temps)', 's', 'time', { poussee_verticale: 0.7, equilibre: 0.5, stabilite_epaules: 0.4 }, ['conditioning'], { tiers: [20, 60] }),
  hollow_hold: M('Gainage bateau (temps)', 's', 'time', { gainage_anterieur: 1 }, ['conditioning', 'strength', 'climbing_boulder'], { tiers: [30, 60], test: 'Bas du dos plaqué au sol, bras et jambes tendus. Arrête dès que le dos se creuse.' }),
  planche_avant_bras: M('Planche sur les avant-bras (temps)', 's', 'time', { gainage_anterieur: 0.8 }, ['conditioning', 'strength', 'running'], { tiers: [60, 120] }),
  gainage_lateral: M('Gainage latéral (temps, côté le plus faible)', 's', 'time', { gainage_lateral: 1 }, ['conditioning', 'strength'], { tiers: [30, 75] }),
  l_sit: M('L-sit (temps)', 's', 'time', { gainage_anterieur: 0.8, poussee_verticale: 0.2 }, ['conditioning'], { tiers: [5, 20] }),
  releves_jambes: M('Relevés de jambes suspendu (reps)', 'reps', 'reps', { gainage_anterieur: 1, controle_scapulaire: 0.3 }, ['conditioning', 'climbing_boulder'], { tiers: [5, 15] }),
  front_lever_groupe: M('Front lever groupé (temps)', 's', 'time', { controle_scapulaire: 0.7, gainage_anterieur: 0.6, tirage_vertical: 0.3 }, ['conditioning', 'climbing_boulder'], { tiers: [5, 15] }),
  front_lever_avance: M('Front lever groupé avancé (temps)', 's', 'time', { controle_scapulaire: 0.8, gainage_anterieur: 0.7, tirage_vertical: 0.4 }, ['conditioning'], { tiers: [3, 10] }),
  front_lever_ecarte: M('Front lever jambes écartées (temps)', 's', 'time', { controle_scapulaire: 0.9, gainage_anterieur: 0.8, tirage_vertical: 0.5 }, ['conditioning'], { tiers: [2, 8] }),
  front_lever_complet: M('Front lever complet (temps)', 's', 'time', { controle_scapulaire: 1, gainage_anterieur: 0.9, tirage_vertical: 0.6 }, ['conditioning'], { tiers: [2, 8] }),
  drapeau_vertical: M('Drapeau vertical (temps)', 's', 'time', { gainage_lateral: 0.8, stabilite_epaules: 0.5 }, ['conditioning'], { tiers: [5, 20] }),
  drapeau_groupe: M('Drapeau groupé (temps)', 's', 'time', { gainage_lateral: 0.9, poussee_verticale: 0.4, tirage_vertical: 0.4 }, ['conditioning'], { tiers: [3, 10] }),
  drapeau_complet: M('Drapeau complet (temps)', 's', 'time', { gainage_lateral: 1, poussee_verticale: 0.5, tirage_vertical: 0.5, stabilite_epaules: 0.4 }, ['conditioning'], { tiers: [2, 8] }),
  pistol_squat: M('Pistol squat (par jambe)', 'reps', 'reps', { force_jambes: 0.7, equilibre: 0.5, mobilite_hanches: 0.3 }, ['conditioning', 'strength'], { tiers: [1, 8] }),
  squat_1rm: M('Squat : charge max (1 rép.)', 'kg', 'load', { force_jambes: 1 }, ['strength']),
  souleve_1rm: M('Soulevé de terre : charge max (1 rép.)', 'kg', 'load', { chaine_posterieure: 1 }, ['strength']),
  couche_1rm: M('Développé couché : charge max (1 rép.)', 'kg', 'load', { poussee_horizontale: 1 }, ['strength']),
  militaire_1rm: M('Développé militaire : charge max (1 rép.)', 'kg', 'load', { poussee_verticale: 1 }, ['strength']),
  rowing_1rm: M('Rowing barre : charge max (1 rép.)', 'kg', 'load', { tirage_horizontal: 1 }, ['strength']),
  saut_vertical: M('Détente verticale', 'cm', 'distance', { explosivite: 1 }, ['conditioning', 'strength', 'climbing_boulder'], { tiers: [30, 50] }),
  saut_longueur: M('Saut en longueur sans élan', 'cm', 'distance', { explosivite: 1, force_jambes: 0.3 }, ['conditioning'], { tiers: [180, 240] }),
  souplesse_avant: M('Flexion avant jambes tendues (cm au-delà des orteils)', 'cm', 'distance', { mobilite_hanches: 1 }, ['conditioning', 'climbing_boulder', 'running'], { tiers: [0, 15] }),
  course_5k: M('5 km : temps', 'min', 'time', { endurance_aerobie: 0.7, seuil: 0.6 }, ['running'], { dir: -1, tiers: [30, 22], test: 'Sur un parcours plat, à allure maximale soutenable.' }),
  course_10k: M('10 km : temps', 'min', 'time', { endurance_aerobie: 0.8, seuil: 0.6 }, ['running'], { dir: -1, tiers: [60, 45] }),
  course_semi: M('Semi-marathon : temps', 'min', 'time', { endurance_aerobie: 1, seuil: 0.5 }, ['running'], { dir: -1, tiers: [130, 100] }),
  vma: M('VMA', 'km/h', 'pace', { vitesse: 0.6, seuil: 0.5, endurance_aerobie: 0.4 }, ['running'], { tiers: [13, 17] }),
  sortie_longue: M('Plus longue sortie récente', 'km', 'distance', { endurance_aerobie: 1 }, ['running'], { tiers: [8, 16] }),
  nage_100: M('100 m nage libre : temps', 's', 'time', { vitesse: 0.6, technique_nage: 0.5 }, ['swimming'], { dir: -1, tiers: [120, 85] }),
  nage_400: M('400 m nage libre : temps', 's', 'time', { endurance_aerobie: 0.6, technique_nage: 0.6 }, ['swimming'], { dir: -1, tiers: [540, 390] }),
  nage_continue: M('Distance nagée sans arrêt', 'm', 'distance', { endurance_aerobie: 0.9, technique_nage: 0.3 }, ['swimming'], { tiers: [400, 1500] }),
  max_bloc: M('Niveau max en bloc', '', 'grade', { force_doigts: 0.5, technique_escalade: 0.5, puissance_haut: 0.4 }, ['climbing_boulder'], { gradeActivity: 'bloc' }),
  max_voie: M('Niveau max en voie', '', 'grade', { endurance_doigts: 0.6, technique_escalade: 0.6 }, ['climbing_route'], { gradeActivity: 'voie' }),
};
export const metricTierText = (m) => {
  if (!m?.tiers) return '';
  const [a, b] = m.tiers, u = m.unit ? ' ' + m.unit : '';
  return m.dir === -1 ? `repères indicatifs : plus de ${a}${u} débutant · ${b}–${a}${u} intermédiaire · moins de ${b}${u} avancé`
    : `repères indicatifs : moins de ${a}${u} débutant · ${a}–${b}${u} intermédiaire · plus de ${b}${u} avancé`;
};

/* ───────── Figures et objectifs complexes (skills) ───────── */
// caps : capacités requises (poids) ; criteria : repères de préparation (métrique → valeur visée, pourquoi) ;
// steps : arbre de progression (chaque étape = un exercice + un critère de maîtrise) ; paths : plusieurs chemins possibles.
export const SKILLS = {
  front_lever: {
    label: 'Front lever', emoji: '🛫', activity: 'conditioning',
    desc: 'Tenir le corps à l’horizontale sous une barre, bras tendus, face vers le haut.',
    caps: { controle_scapulaire: 1, gainage_anterieur: 0.9, tirage_vertical: 0.7, stabilite_epaules: 0.4 },
    criteria: [
      { metric: 'max_tractions', target: 12, why: 'Un tirage vertical solide (≈ 10–15 tractions strictes) est un repère courant avant le front lever complet.' },
      { metric: 'hollow_hold', target: 60, why: 'Le gainage bateau reproduit la tension du tronc demandée par la figure.' },
      { metric: 'dead_hang', target: 45, why: 'Les omoplates doivent rester basses et actives longtemps.' },
      { metric: 'front_lever_groupe', target: 15, why: 'Tenir la version groupée confirme la base de la figure.' },
    ],
    steps: [
      { id: 'fl1', label: 'Suspension active et tractions scapulaires', exercise: 'scap-pullup', criterion: { metric: 'dead_hang', target: 30 } },
      { id: 'fl2', label: 'Front lever groupé', exercise: 'front-lever-tuck', criterion: { metric: 'front_lever_groupe', target: 15 } },
      { id: 'fl3', label: 'Front lever groupé avancé', exercise: 'fl-adv-tuck', criterion: { metric: 'front_lever_avance', target: 10 } },
      { id: 'fl4', label: 'Front lever jambes écartées', exercise: 'fl-straddle', criterion: { metric: 'front_lever_ecarte', target: 8 } },
      { id: 'fl5', label: 'Front lever complet', exercise: 'fl-full', criterion: { metric: 'front_lever_complet', target: 5 } },
    ],
    paths: [
      { id: 'barre', label: 'Progression statique à la barre', needs: ['bar'], minutes: 20, perWeek: 2, exercises: ['scap-pullup', 'front-lever-tuck', 'fl-adv-tuck', 'hollow-hold'], traits: 'Tenues isométriques courtes et répétées ; peu de matériel.' },
      { id: 'dynamique', label: 'Tirages et négatives', needs: ['bar'], minutes: 25, perWeek: 2, exercises: ['fl-raises', 'fl-negative', 'pullup', 'knee-raise'], traits: 'Travail en mouvement, plus de volume de tirage.' },
      { id: 'elastique', label: 'Avec assistance élastique', needs: ['bar', 'band'], minutes: 20, perWeek: 2, exercises: ['fl-band', 'scap-pullup', 'hollow-hold'], traits: 'Permet de travailler une position plus avancée tôt, charge réduite.' },
      { id: 'sol', label: 'Préparation au sol (sans barre)', needs: [], minutes: 15, perWeek: 3, exercises: ['hollow-hold', 'dead-bug', 'ytw', 'reverse-plank'], traits: 'Aucun matériel : tronc et omoplates en attendant une barre.' },
    ],
  },
  human_flag: {
    label: 'Drapeau (human flag)', emoji: '🚩', activity: 'conditioning',
    desc: 'Tenir le corps à l’horizontale sur le côté, mains sur un poteau ou un espalier.',
    caps: { gainage_lateral: 1, poussee_verticale: 0.6, tirage_vertical: 0.6, stabilite_epaules: 0.6 },
    criteria: [
      { metric: 'gainage_lateral', target: 60, why: 'La chaîne latérale porte l’essentiel de la figure.' },
      { metric: 'max_tractions', target: 10, why: 'Le bras du haut tire fort : un tirage vertical solide aide.' },
      { metric: 'pompes_piquees', target: 10, why: 'Le bras du bas pousse vers le haut : poussée verticale.' },
      { metric: 'drapeau_vertical', target: 15, why: 'Le drapeau vertical prépare l’alignement.' },
    ],
    steps: [
      { id: 'hf1', label: 'Gainage latéral solide', exercise: 'side-plank', criterion: { metric: 'gainage_lateral', target: 45 } },
      { id: 'hf2', label: 'Drapeau vertical', exercise: 'flag-vertical', criterion: { metric: 'drapeau_vertical', target: 15 } },
      { id: 'hf3', label: 'Drapeau groupé', exercise: 'flag-tuck', criterion: { metric: 'drapeau_groupe', target: 8 } },
      { id: 'hf4', label: 'Négatives de drapeau', exercise: 'flag-negative', criterion: { metric: 'drapeau_groupe', target: 12 } },
      { id: 'hf5', label: 'Drapeau complet', exercise: 'flag-full', criterion: { metric: 'drapeau_complet', target: 5 } },
    ],
    paths: [
      { id: 'poteau', label: 'Progression au poteau / espalier', needs: ['pole'], minutes: 20, perWeek: 2, exercises: ['flag-vertical', 'flag-tuck', 'flag-negative', 'side-plank'], traits: 'Spécifique : travail direct de la position.' },
      { id: 'sol', label: 'Préparation au sol', needs: [], minutes: 15, perWeek: 3, exercises: ['side-plank', 'side-plank-raise', 'pike-pushup', 'copenhagen'], traits: 'Sans matériel : renforce la chaîne latérale et la poussée.' },
      { id: 'barre', label: 'Force de tirage et poussée', needs: ['bar'], minutes: 25, perWeek: 2, exercises: ['pullup', 'pike-pushup', 'knee-raise', 'side-plank'], traits: 'Développe les deux bras de levier séparément.' },
    ],
  },
  one_arm_pullup: {
    label: 'Traction à un bras', emoji: '☝️', activity: 'conditioning',
    desc: 'Monter le menton au-dessus de la barre avec un seul bras.',
    caps: { tirage_unilateral: 1, tirage_vertical: 0.9, blocage: 0.8, stabilite_epaules: 0.5 },
    criteria: [
      { metric: 'max_tractions', target: 15, why: 'Repère courant : 15 à 20 tractions strictes avant de travailler à un bras.' },
      { metric: 'blocage_90', target: 30, why: 'Le blocage à deux bras prépare le blocage à un bras.' },
      { metric: 'traction_archer', target: 5, why: 'Les tractions archer déplacent progressivement la charge sur un bras.' },
    ],
    steps: [
      { id: 'oa1', label: 'Tractions strictes (volume)', exercise: 'pullup', criterion: { metric: 'max_tractions', target: 15 } },
      { id: 'oa2', label: 'Tractions archer', exercise: 'archer-pullup', criterion: { metric: 'traction_archer', target: 5 } },
      { id: 'oa3', label: 'Blocages et négatives à un bras', exercise: 'oap-negative', criterion: { metric: 'blocage_90', target: 30 } },
      { id: 'oa4', label: 'Traction à un bras assistée', exercise: 'oap-assisted', criterion: { metric: 'traction_un_bras', target: 1 } },
      { id: 'oa5', label: 'Traction à un bras', exercise: 'oap', criterion: { metric: 'traction_un_bras', target: 3 } },
    ],
    paths: [
      { id: 'archer', label: 'Voie des tractions archer', needs: ['bar'], minutes: 25, perWeek: 2, exercises: ['pullup', 'archer-pullup', 'lockoff', 'scap-pullup'], traits: 'Transfert progressif vers un bras.' },
      { id: 'lest', label: 'Voie du lest', needs: ['bar', 'weights'], minutes: 30, perWeek: 2, exercises: ['pullup-heavy', 'lockoff', 'oap-negative'], traits: 'Force maximale à deux bras puis négatives.' },
      { id: 'assistance', label: 'Voie de l’assistance', needs: ['bar', 'band'], minutes: 20, perWeek: 2, exercises: ['oap-assisted', 'archer-pullup', 'lockoff'], traits: 'Aide de l’élastique ou d’une main pour doser.' },
    ],
  },
  muscle_up: {
    label: 'Muscle-up', emoji: '🔝', activity: 'conditioning',
    desc: 'Passer de la suspension à l’appui au-dessus de la barre en un mouvement.',
    caps: { puissance_haut: 1, tirage_vertical: 0.9, poussee_horizontale: 0.6, coordination: 0.5 },
    criteria: [
      { metric: 'max_tractions', target: 10, why: 'Un tirage haut et puissant demande une bonne base de tractions.' },
      { metric: 'max_dips', target: 12, why: 'La sortie au-dessus de la barre ressemble à un dips.' },
    ],
    steps: [
      { id: 'mu1', label: 'Tractions poitrine à la barre', exercise: 'high-pullup', criterion: { metric: 'max_tractions', target: 10 } },
      { id: 'mu2', label: 'Dips à la barre droite', exercise: 'straight-bar-dips', criterion: { metric: 'max_dips', target: 12 } },
      { id: 'mu3', label: 'Muscle-up assisté', exercise: 'muscle-up-band', criterion: { metric: 'max_tractions', target: 12 } },
    ],
    paths: [
      { id: 'barre', label: 'À la barre', needs: ['bar'], minutes: 25, perWeek: 2, exercises: ['high-pullup', 'explosive-pullup', 'straight-bar-dips'], traits: 'Puissance de tirage et transition.' },
      { id: 'anneaux', label: 'Aux anneaux', needs: ['rings'], minutes: 25, perWeek: 2, exercises: ['ring-row', 'ring-dips', 'high-pullup'], traits: 'Transition plus libre, plus exigeante pour les épaules.' },
    ],
  },
  handstand: {
    label: 'Équilibre sur les mains', emoji: '🤸', activity: 'conditioning',
    desc: 'Tenir en équilibre tête en bas, bras tendus.',
    caps: { poussee_verticale: 1, equilibre: 0.9, stabilite_epaules: 0.6, mobilite_epaules: 0.5 },
    criteria: [
      { metric: 'handstand_mur', target: 60, why: 'Tenir une minute contre le mur est un repère courant avant l’équilibre libre.' },
      { metric: 'pompes_piquees', target: 10, why: 'Force de poussée verticale.' },
    ],
    steps: [
      { id: 'hs1', label: 'Pompes piquées', exercise: 'pike-pushup', criterion: { metric: 'pompes_piquees', target: 10 } },
      { id: 'hs2', label: 'Équilibre face au mur', exercise: 'wall-handstand', criterion: { metric: 'handstand_mur', target: 60 } },
    ],
    paths: [
      { id: 'mur', label: 'Contre un mur', needs: [], minutes: 15, perWeek: 4, exercises: ['wall-handstand', 'pike-pushup', 'wu-wrists'], traits: 'Sessions courtes et fréquentes.' },
    ],
  },
  pistol_squat: {
    label: 'Pistol squat', emoji: '🦵', activity: 'conditioning',
    desc: 'Squat complet sur une jambe, l’autre tendue devant.',
    caps: { force_jambes: 1, equilibre: 0.8, mobilite_hanches: 0.6 },
    criteria: [{ metric: 'pistol_squat', target: 5, why: 'Cinq répétitions propres par jambe montrent une maîtrise solide.' }],
    steps: [
      { id: 'ps1', label: 'Pistol sur une box', exercise: 'pistol-box', criterion: { metric: 'pistol_squat', target: 1 } },
      { id: 'ps2', label: 'Pistol squat', exercise: 'pistol', criterion: { metric: 'pistol_squat', target: 5 } },
    ],
    paths: [
      { id: 'box', label: 'Avec une box qui descend', needs: ['box'], minutes: 15, perWeek: 3, exercises: ['pistol-box', 'bulgarian', 'cossack'], traits: 'Amplitude réduite progressivement.' },
      { id: 'sol', label: 'Sans matériel', needs: [], minutes: 15, perWeek: 3, exercises: ['cossack', 'single-leg-rdl', 'pistol'], traits: 'Mobilité et équilibre d’abord.' },
    ],
  },
};

/* ───────── Styles d'escalade structurés (base extensible) ───────── */
export const BUILTIN_STYLES = [
  ['dalle', 'Dalle', 'climbing'], ['vertical', 'Vertical', 'climbing'], ['devers', 'Dévers', 'climbing'], ['toit', 'Toit', 'climbing'],
  ['dynamique', 'Dynamique', 'climbing'], ['statique', 'Statique', 'climbing'], ['reglettes', 'Réglettes', 'climbing'], ['pinces', 'Pinces', 'climbing'],
  ['plats', 'Plats', 'climbing'], ['petites-prises', 'Petites prises', 'climbing'], ['trous', 'Trous / monodoigts', 'climbing'], ['compression', 'Compression', 'climbing'],
  ['coordination', 'Coordination', 'climbing'], ['talons', 'Talons / pointes', 'climbing'], ['fissure', 'Fissure', 'climbing'], ['resistance', 'Résistance', 'climbing'],
].map(([id, label, activity]) => ({ id: 'st-' + id, label, activity, builtin: true }));

/* ───────── Intentions de séance ───────── */
export const INTENTIONS = {
  force: { label: 'Force', emoji: '🏋️', families: ['force'], intensity: 'high' },
  technique: { label: 'Technique', emoji: '🎯', families: ['technique'], intensity: 'low' },
  puissance: { label: 'Puissance', emoji: '⚡', families: ['puissance'], intensity: 'high' },
  endurance: { label: 'Endurance', emoji: '🔋', families: ['endurance'], intensity: 'mod' },
  mobilite: { label: 'Mobilité', emoji: '🧘', families: ['mobilite'], intensity: 'low' },
  prevention: { label: 'Prévention', emoji: '🛡️', families: ['prevention', 'gainage'], intensity: 'low' },
  specifique: { label: 'Préparation spécifique', emoji: '🎯', families: [], intensity: 'mod' },
};

/* ───────── Accès au graphe ───────── */
export const capLabel = (id, customCats = {}) => CAPACITIES[id]?.label || customCats[id]?.label || id;
/** Pour un objectif / une figure, liste des capacités requises triées par poids. */
export function skillCaps(skillId) {
  const s = SKILLS[skillId];
  return s ? Object.entries(s.caps).sort((a, b) => b[1] - a[1]).map(([id, w]) => ({ id, w })) : [];
}
/** Métriques qui permettent de suivre une capacité (sens inverse du graphe). */
export function metricsForCap(capId) {
  return Object.entries(METRICS).filter(([, m]) => m.caps[capId]).map(([id, m]) => ({ id, w: m.caps[capId], label: m.label })).sort((a, b) => b.w - a.w);
}
/** Muscles liés à une capacité. */
export function musclesForCap(capId) {
  return Object.entries(MUSCLES).filter(([, m]) => m.caps[capId]).map(([id, m]) => ({ id, w: m.caps[capId], label: m.label })).sort((a, b) => b.w - a.w);
}
/** Figures qui requièrent une capacité. */
export function skillsForCap(capId) {
  return Object.entries(SKILLS).filter(([, s]) => s.caps[capId]).map(([id, s]) => ({ id, w: s.caps[capId], label: s.label }));
}
