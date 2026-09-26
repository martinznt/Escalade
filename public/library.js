// library.js — bibliothèque d'exercices « coach » intégrée à l'app.
// Chaque fiche est utilisée par le générateur de séances (engine.js) et proposée dans l'onglet Exercices.
//
// Champs : kind (rôle dans une séance), focus (objectifs), intensity (low|mod|high), minLevel (0 débutant,
// 1 intermédiaire, 2 avancé), needs (matériel requis), risk (zone sensible), flex ([min,max] secondes ajustables).
// Ces fiches reprennent des principes d'entraînement courants en escalade — voir SOURCES.

export const EQUIPMENT = {
  wall: 'Mur / salle d’escalade',
  hangboard: 'Poutre de suspension',
  bar: 'Barre de traction',
  dips: 'Barres parallèles',
  weights: 'Haltères / lest',
  band: 'Élastique',
};

export const GROUP_LABEL = { tirer: 'Tirer', pousser: 'Pousser', jambes: 'Jambes', gainage: 'Gainage', doigts: 'Doigts & avant-bras', epaules: 'Épaules (prévention)' };
export const GROUP_TARGET = { tirer: 0.24, pousser: 0.14, jambes: 0.2, gainage: 0.16, doigts: 0.14, epaules: 0.12 };

export const FOCUS = {
  dalle: { label: 'Dalle', emoji: '🪨', text: 'Pieds, équilibre, adhérence, fluidité.' },
  reglette: { label: 'Réglettes', emoji: '🖐️', text: 'Force des doigts, progressive et sûre.' },
  devers: { label: 'Dévers', emoji: '🦇', text: 'Tirage, gainage, tension du corps, pieds coupés.' },
  resistance: { label: 'Résistance', emoji: '🔋', text: 'Tenir longtemps : base aérobie et blocs enchaînés.' },
  perf: { label: 'Performance max', emoji: '🔥', text: 'Peu de volume, qualité maximale. Il faut être frais.' },
  vitesse: { label: 'Vitesse / explosivité', emoji: '⚡', text: 'Détente, lancers, réactivité.' },
  jambes: { label: 'Jambes & détente', emoji: '🦵', text: 'Force et explosivité des jambes.' },
  equilibre: { label: 'Équilibre & prévention', emoji: '⚖️', text: 'Antagonistes, épaules, gainage : durer sans se blesser.' },
};

export const SOURCES = [
  { title: 'The Rock Climber’s Training Manual', by: 'Mike & Mark Anderson', note: 'Phases d’entraînement, repeaters, ARC, blocs 4×4.' },
  { title: 'Training for Climbing', by: 'Eric Hörst', note: 'Planification, force, puissance, résistance.' },
  { title: '9 Out of 10 Climbers Make the Same Mistakes', by: 'Dave MacLeod', note: 'Priorités, technique, gestion de la charge.' },
  { title: 'Performance Rock Climbing', by: 'Dale Goddard & Udo Neumann', note: 'Origine de l’entraînement ARC.' },
  { title: 'Lattice Training (blog) et Tension Climbing', by: 'Lattice ; Eva López', note: 'Suspensions à la poutre, tests, prévention.' },
  { title: 'Échauffement « RAMP »', by: 'Ian Jeffreys', note: 'Élever, activer, mobiliser, potentialiser.' },
];

const L = [];
const E = (id, name, emoji, o) => L.push({
  id, name, emoji, role: 'main', kind: 'skill', group: 'gainage', muscles: [], focus: [], intensity: 'low', minLevel: 0, needs: [], risk: '',
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, secMin: 30, secMax: 30, rest: 60, perSide: false, unit: '', load: '', cues: [], bad: [], why: '', src: '', ...o,
});

/* ───────────── DALLE / TECHNIQUE (mur) ───────────── */
E('dalle-pieds-silencieux', 'Pieds silencieux', '🦶', { kind: 'skill', group: 'jambes', focus: ['dalle', 'devers', 'equilibre'], needs: ['wall'], muscles: ['pieds', 'mollets', 'gainage'],
  mode: 'time', sets: 3, secMin: 180, secMax: 240, rest: 90, flex: [120, 300],
  cues: ['Voies ou blocs 3 niveaux sous ton max.', 'Pose chaque pied sans bruit, regarde-le jusqu’au contact.', 'Une fois posé, le pied ne bouge plus.'],
  bad: ['Corriger un pied en le frottant sur la prise.'], why: 'La précision des pieds économise les bras sur tous les types de voies.', src: 'Exercice technique classique' });
E('dalle-precision', 'Précision des pieds (trace)', '🎯', { kind: 'skill', group: 'jambes', focus: ['dalle', 'equilibre'], needs: ['wall'], muscles: ['pieds', 'mollets'],
  mode: 'reps', sets: 4, repsMin: 1, repsMax: 1, unit: 'voies', rest: 60,
  cues: ['Choisis un pied précis avant chaque mouvement.', 'Monte, puis redescends la même voie en posant les pieds aux mêmes endroits.'], why: 'Apprendre à choisir et viser ses pieds.', src: 'Exercice technique classique' });
E('dalle-equilibre-un-pied', 'Équilibre sur un pied', '⚖️', { kind: 'skill', group: 'jambes', focus: ['dalle', 'equilibre'], needs: ['wall'], muscles: ['cheville', 'fessiers', 'gainage'],
  mode: 'reps', sets: 4, repsMin: 4, repsMax: 6, unit: 'tenues 3 s', perSide: true, rest: 45,
  cues: ['Sur une prise de pied large, décolle l’autre pied et tiens 3 s.', 'Les mains ne servent qu’à l’équilibre, pas à tirer.', 'Bassin au-dessus du pied porteur.'], why: 'Le centre de gravité sur le pied porteur est la clé de la dalle.', src: 'Exercice technique classique' });
E('dalle-lente', 'Escalade lente et fluide', '🐢', { kind: 'skill', group: 'gainage', focus: ['dalle', 'resistance'], needs: ['wall'], muscles: ['gainage', 'avant-bras'],
  mode: 'time', sets: 3, secMin: 150, secMax: 210, rest: 90, flex: [90, 300],
  cues: ['Bras tendus, hanches proches du mur.', 'Chaque mouvement en 3 s, sans à-coup.', 'Relâche la prise dès que le pied est stable.'], why: 'Apprend à grimper détendu et à économiser les avant-bras.', src: 'Exercice technique classique' });
E('dalle-hanches', 'Rotation des hanches (drapeau)', '🔄', { kind: 'skill', group: 'gainage', focus: ['dalle', 'devers'], needs: ['wall'], muscles: ['hanches', 'gainage'],
  mode: 'reps', sets: 4, repsMin: 1, repsMax: 1, unit: 'blocs', rest: 75,
  cues: ['Tourne le bassin pour placer l’épaule contre le mur (« dos au mur »).', 'Utilise le drapeau pour t’équilibrer sans pied.'], why: 'Placer les hanches soulage les bras et allonge la portée.', src: 'Exercice technique classique' });
E('dalle-transferts', 'Transferts de poids', '🧭', { kind: 'skill', group: 'jambes', focus: ['dalle'], needs: ['wall'], muscles: ['jambes', 'hanches'],
  mode: 'reps', sets: 3, repsMin: 6, repsMax: 8, unit: 'mouvements', rest: 60,
  cues: ['Avant de lâcher une main, déplace le poids du corps sur le pied opposé.', 'Monte ou traverse sur prises larges et pieds fins.'], why: 'Un bon transfert de poids rend les mouvements presque gratuits.', src: 'Exercice technique classique' });
E('dalle-mobilite-hanches', 'Ouverture des hanches (grenouille)', '🐸', { kind: 'skill', group: 'jambes', focus: ['dalle'], needs: [], muscles: ['adducteurs', 'hanches'],
  mode: 'time', sets: 2, secMin: 45, secMax: 60, rest: 30, cues: ['Genoux écartés, bassin qui recule doucement.', 'Respire, sans forcer la douleur.'], why: 'Amplitude de hanches = pieds hauts et dalles plus faciles.', src: 'Mobilité classique' });

/* ───────────── RÉGLETTES / DOIGTS ───────────── */
E('hang-active', 'Suspensions actives (grosse prise)', '🖐️', { kind: 'finger', group: 'doigts', focus: ['reglette', 'perf'], needs: ['hangboard'], muscles: ['doigts', 'avant-bras', 'épaules'], intensity: 'mod', risk: 'finger',
  mode: 'time', sets: 3, secMin: 12, secMax: 15, rest: 120,
  cues: ['Prise ouverte sur une grosse prise, jamais en crochet forcé.', 'Épaules actives, coudes légèrement fléchis.', 'Assiste-toi avec les pieds ou un élastique si c’est trop dur.'], bad: ['Douleur aiguë dans un doigt : stop.'], why: 'Habitue les tendons aux charges sans les brusquer.', src: 'Progression prudente à la poutre' });
E('hang-max', 'Suspensions max 10 s', '🖐️', { kind: 'finger', group: 'doigts', focus: ['reglette', 'perf'], needs: ['hangboard'], muscles: ['doigts', 'avant-bras'], intensity: 'high', minLevel: 1, risk: 'finger',
  mode: 'time', sets: 4, secMin: 10, secMax: 10, rest: 180, load: 'Poids du corps ± charge',
  cues: ['Réglette de 20 mm environ (plus large si douleur).', 'Charge = ce que tu tiens 10 s en gardant 1–2 s de réserve.', 'Épaules basses et actives, pas de balancement.', 'Repose-toi vraiment 3 min entre les séries.'],
  bad: ['Aller à l’échec.', 'Refaire une séance de doigts dans les 48 h.'], why: 'Suspensions maximales courtes : méthode de référence pour la force des doigts.', src: 'Méthode des suspensions maximales (max hangs)' });
E('hang-repeaters', 'Repeaters 7/3', '🔁', { kind: 'finger', group: 'doigts', focus: ['reglette', 'resistance'], needs: ['hangboard'], muscles: ['doigts', 'avant-bras'], intensity: 'mod', minLevel: 1, risk: 'finger',
  mode: 'time', sets: 3, secMin: 60, secMax: 60, rest: 180,
  cues: ['6 suspensions de 7 s, séparées de 3 s de pause, sans lâcher la poutre.', 'Charge modérée : les 6 doivent rester propres.', 'Arrête la série si la prise change.'], bad: ['Tenir des positions douloureuses.'], why: 'Force-endurance des doigts avec un volume maîtrisé.', src: 'Protocole « repeaters » 7/3' });
E('wall-reglettes', 'Blocs sur réglettes (pieds bons)', '🧗', { kind: 'wallfinger', group: 'doigts', focus: ['reglette', 'perf'], needs: ['wall'], muscles: ['doigts', 'avant-bras'], intensity: 'mod', risk: 'finger',
  mode: 'reps', sets: 5, repsMin: 1, repsMax: 1, unit: 'blocs', rest: 150,
  cues: ['Blocs à réglettes, 1 à 2 niveaux sous ton max.', 'Pieds bons pour cibler les doigts.', 'Prise semi-arquée, sans forcer en arqué complet.'], bad: ['Enchaîner quand les doigts brûlent.'], why: 'Travailler les réglettes avec le mouvement, sans matériel spécial.', src: 'Entraînement spécifique en salle' });
E('wall-traverse-reglettes', 'Traversée sur réglettes larges', '↔️', { kind: 'wallfinger', group: 'doigts', focus: ['reglette', 'resistance'], needs: ['wall'], muscles: ['doigts', 'avant-bras'], intensity: 'low',
  mode: 'time', sets: 3, secMin: 90, secMax: 120, rest: 120, flex: [60, 180], cues: ['Reste sur des réglettes larges, pump léger.', 'Relâche les doigts entre les mouvements.'], why: 'Doigts et endurance à faible risque.', src: 'Exercice classique' });
E('finger-extensions', 'Extensions de doigts (élastique)', '🤚', { kind: 'prehab', group: 'doigts', focus: ['reglette', 'equilibre', 'perf'], needs: ['band'], muscles: ['extenseurs des doigts', 'avant-bras'],
  mode: 'reps', sets: 2, repsMin: 15, repsMax: 20, rest: 45, cues: ['Ouvre la main contre l’élastique, lentement.'], why: 'Équilibre les fléchisseurs très sollicités en escalade.', src: 'Prévention classique' });
E('wrist-extension', 'Extension de poignet lestée', '🤲', { kind: 'prehab', group: 'doigts', focus: ['reglette', 'equilibre', 'devers'], needs: ['weights'], muscles: ['extenseurs du poignet', 'avant-bras'],
  mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, load: 'Léger (1–3 kg)', rest: 45, cues: ['Avant-bras posé, paume vers le bas.', 'Monte et descends lentement.'], why: 'Protège les coudes et équilibre l’avant-bras.', src: 'Prévention classique' });

/* ───────────── DÉVERS / TIRAGE ───────────── */
E('dev-power-blocs', 'Blocs de puissance en dévers', '💥', { kind: 'power', group: 'tirer', focus: ['devers', 'perf', 'vitesse'], needs: ['wall'], muscles: ['dorsaux', 'biceps', 'gainage', 'doigts'], intensity: 'high', minLevel: 1, risk: 'finger',
  mode: 'reps', sets: 5, repsMin: 1, repsMax: 2, unit: 'blocs', rest: 180,
  cues: ['Blocs courts (4–6 mouvements) très déversants.', 'Un niveau sous ton max : qualité et vitesse.', 'Arrête si les mouvements deviennent lents.'], bad: ['Enchaîner quand la qualité baisse.'], why: 'Puissance de tirage spécifique au dévers.', src: 'Entraînement de puissance en salle' });
E('dev-pieds-coupes', 'Contrôle des pieds coupés', '🦇', { kind: 'skill', group: 'gainage', focus: ['devers'], needs: ['wall'], muscles: ['gainage', 'hanches'], intensity: 'mod',
  mode: 'reps', sets: 4, repsMin: 1, repsMax: 1, unit: 'blocs', rest: 90,
  cues: ['Grimpe un bloc déversant en visant zéro pied qui balance.', 'Si un pied décroche, remets-le sans pause avant de continuer.'], why: 'La tension du corps est la base du dévers.', src: 'Exercice technique classique' });
E('dev-talons', 'Talons et pointes (hooks)', '🦶', { kind: 'skill', group: 'gainage', focus: ['devers'], needs: ['wall'], muscles: ['ischio-jambiers', 'fessiers'], intensity: 'low',
  mode: 'reps', sets: 4, repsMin: 1, repsMax: 1, unit: 'blocs', rest: 75,
  cues: ['Cherche un talon ou une pointe pour soulager les bras.', 'Tire avec la jambe, pas seulement en poussant.'], why: 'Les hooks économisent énormément de force de bras.', src: 'Exercice technique classique' });
E('pullup', 'Tractions', '💪', { kind: 'pull', group: 'tirer', focus: ['devers', 'perf', 'equilibre'], needs: ['bar'], muscles: ['grand dorsal', 'biceps', 'trapèzes'], intensity: 'mod',
  mode: 'reps', sets: 4, repsMin: 5, repsMax: 8, rest: 150, load: 'Poids du corps',
  cues: ['Départ bras tendus, épaules engagées.', 'Menton au-dessus de la barre, descente contrôlée.', 'Garde 1–2 reps en réserve.'], bad: ['Balancer le corps.', 'Aller à l’échec.'], why: 'Force de tirage de base pour tous les styles.', src: 'Renforcement classique' });
E('inverted-row', 'Tractions australiennes', '🚣', { kind: 'pull', group: 'tirer', focus: ['devers', 'equilibre'], needs: ['bar'], muscles: ['dorsaux', 'biceps', 'arrière des épaules'],
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 90, cues: ['Corps gainé en planche, poitrine vers la barre.', 'Plus tu allonges les jambes, plus c’est dur.'], why: 'Tirage horizontal accessible pour débuter.', src: 'Renforcement classique' });
E('pullup-heavy', 'Tractions lestées lourdes', '🏋️', { kind: 'pull', group: 'tirer', focus: ['perf', 'devers'], needs: ['bar', 'weights'], muscles: ['grand dorsal', 'biceps'], intensity: 'high', minLevel: 2,
  mode: 'reps', sets: 4, repsMin: 3, repsMax: 5, rest: 180, load: '+10 à 15 kg',
  cues: ['Lest stable, départ bras tendus.', 'Vitesse contrôlée, 1–2 reps en réserve.'], bad: ['Aller à l’échec.'], why: 'Force maximale de tirage, avec peu de répétitions.', src: 'Renforcement classique' });
E('lockoff', 'Blocages (lock-off) à 90°', '🔒', { kind: 'lock', group: 'tirer', focus: ['devers', 'perf'], needs: ['bar'], muscles: ['biceps', 'grand dorsal', 'épaules'], intensity: 'mod', minLevel: 1,
  mode: 'time', sets: 4, secMin: 5, secMax: 8, rest: 120, cues: ['Monte à 90° de flexion du coude et bloque.', 'Corps gainé, sans balancement.'], why: 'Le blocage est le geste-clé du dévers.', src: 'Renforcement spécifique' });
E('knee-raise', 'Relevés de genoux suspendu', '🧗', { kind: 'core', group: 'gainage', focus: ['devers', 'equilibre', 'perf'], needs: ['bar'], muscles: ['abdos', 'fléchisseurs de hanche'],
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 75, cues: ['Bascule le bassin, ne balance pas.', 'Redescends lentement.'], why: 'Gainage spécifique pour garder les pieds sur la paroi.', src: 'Renforcement classique' });
E('front-lever-tuck', 'Planche avant groupée', '🛩️', { kind: 'core', group: 'gainage', focus: ['devers', 'perf'], needs: ['bar'], muscles: ['grand dorsal', 'abdos'], intensity: 'high', minLevel: 2,
  mode: 'time', sets: 3, secMin: 6, secMax: 10, rest: 120, cues: ['Genoux groupés, dos plat, bras tendus.'], why: 'Tension du corps maximale, sans matériel autre qu’une barre.', src: 'Renforcement avancé' });
E('hollow-hold', 'Gainage bateau (hollow body)', '🚤', { kind: 'core', group: 'gainage', focus: ['devers', 'equilibre', 'resistance', 'vitesse', 'dalle'], needs: [], muscles: ['abdos', 'psoas'],
  mode: 'time', sets: 3, secMin: 20, secMax: 30, rest: 60, cues: ['Bas du dos collé au sol.', 'Jambes et épaules décollées, corps en arc.'], why: 'Tension du corps utile partout.', src: 'Renforcement classique' });
E('side-plank', 'Gainage latéral', '📐', { kind: 'core', group: 'gainage', focus: ['equilibre', 'devers', 'dalle', 'jambes', 'resistance'], needs: [], muscles: ['obliques', 'fessiers'],
  mode: 'time', sets: 2, secMin: 30, secMax: 45, perSide: true, rest: 45, cues: ['Corps aligné, hanches hautes.', 'Pas de rotation du bassin.'], why: 'Stabilité du tronc.', src: 'Renforcement classique' });
E('dead-bug', 'Dead bug', '🪲', { kind: 'core', group: 'gainage', focus: ['equilibre', 'dalle', 'resistance', 'jambes', 'perf', 'vitesse', 'reglette'], needs: [], muscles: ['abdos', 'stabilité du tronc'],
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 10, rest: 45, cues: ['Bas du dos plaqué au sol.', 'Bras et jambe opposés, mouvement lent.'], why: 'Gainage doux et précis, idéal les jours de fatigue.', src: 'Renforcement classique' });

/* ───────────── RÉSISTANCE ───────────── */
E('arc', 'ARC : grimpe continue légère', '🐢', { kind: 'endurance', group: 'doigts', focus: ['resistance'], needs: ['wall'], muscles: ['avant-bras', 'endurance aérobie'], intensity: 'low',
  mode: 'time', sets: 1, secMin: 1200, secMax: 1800, rest: 0, flex: [600, 2400],
  cues: ['Grimpe sans t’arrêter, sur terrain facile (vertical à légèrement déversant).', 'Pump léger et soutenable : jamais de moment où tu dois t’arrêter.', 'Traversées ou descentes autorisées pour rester sur le mur.'], bad: ['Monter trop dur : le but est de durer.'], why: 'Développe la base aérobie et la gestion du pump.', src: 'Entraînement ARC (Aerobic Restoration & Capillarity)' });
E('four-by-four', '4×4 : blocs enchaînés', '🔁', { kind: 'endurance', group: 'doigts', focus: ['resistance', 'perf'], needs: ['wall'], muscles: ['avant-bras', 'dorsaux', 'endurance'], intensity: 'mod', minLevel: 1, risk: 'finger',
  mode: 'reps', sets: 4, repsMin: 4, repsMax: 4, unit: 'blocs', rest: 240,
  cues: ['4 blocs sans pause, choisis 2 niveaux sous ton max.', 'Repos 4 min entre les séries.', 'Si tu tombes dès la 2e série, choisis plus facile.'], why: 'Résistance de force : la méthode « 4×4 » vise la performance sur voie.', src: 'Méthode 4×4 (résistance de force)' });
E('endurance-intervals', 'Intervalles de grimpe 3/3', '⏱️', { kind: 'endurance', group: 'doigts', focus: ['resistance'], needs: ['wall'], muscles: ['avant-bras', 'endurance'], intensity: 'mod',
  mode: 'time', sets: 4, secMin: 180, secMax: 180, rest: 180, flex: [120, 240], cues: ['3 min de grimpe continue, 3 min de repos.', 'Niveau 2 sous ton max, pump modéré.'], why: 'Développe la récupération pendant l’effort.', src: 'Entraînement par intervalles' });
E('endurance-circuit', 'Circuit de renfo continu', '🔄', { kind: 'endurance', group: 'tirer', focus: ['resistance', 'equilibre'], needs: ['bar'], muscles: ['dorsaux', 'abdos', 'jambes'], intensity: 'mod',
  mode: 'time', sets: 3, secMin: 240, secMax: 240, rest: 120, cues: ['Enchaîne sans pause : 10 tractions australiennes, 10 relevés de genoux, 10 squats sautés, 30 s de gainage.'], why: 'Endurance musculaire hors du mur.', src: 'Circuit d’endurance' });

/* ───────────── PERFORMANCE MAX ───────────── */
E('limit-boulders', 'Blocs limites', '🔥', { kind: 'power', group: 'tirer', focus: ['perf'], needs: ['wall'], muscles: ['doigts', 'dorsaux', 'jambes'], intensity: 'high', minLevel: 1, risk: 'finger',
  mode: 'reps', sets: 5, repsMin: 1, repsMax: 1, unit: 'blocs', rest: 210,
  cues: ['Blocs à ton max ou 1 niveau en dessous, 3 essais maximum chacun.', 'Repos long : 3–4 min.', 'Stop dès que la qualité baisse.'], bad: ['Forcer sur une douleur.'], why: 'La performance maximale demande peu d’essais, de qualité, frais.', src: 'Entraînement de performance' });

/* ───────────── VITESSE / EXPLOSIVITÉ ───────────── */
E('speed-known', 'Voie connue à vitesse max', '⚡', { kind: 'speed', group: 'jambes', focus: ['vitesse'], needs: ['wall'], muscles: ['jambes', 'réactivité'], intensity: 'mod',
  mode: 'reps', sets: 4, repsMin: 1, repsMax: 1, unit: 'voies', rest: 150,
  cues: ['Voie 3 niveaux sous ton max, connue par cœur.', 'Vise un chrono, sans faute.', 'Repos complet entre les essais.'], why: 'Vitesse = mémoire des mouvements + confiance.', src: 'Entraînement de vitesse' });
E('dynos', 'Lancers (dynos) contrôlés', '🦘', { kind: 'power', group: 'tirer', focus: ['vitesse', 'perf'], needs: ['wall'], muscles: ['dorsaux', 'jambes', 'gainage'], intensity: 'high', minLevel: 1, risk: 'shoulder',
  mode: 'reps', sets: 4, repsMin: 3, repsMax: 3, unit: 'lancers', rest: 120,
  cues: ['Sur un tapis épais, lancers courts vers une bonne prise.', 'Réception contrôlée, pieds prêts.', 'Arrête au premier signe de fatigue.'], why: 'Coordination et explosivité.', src: 'Entraînement de puissance' });
E('jump-vertical', 'Sauts verticaux maximaux', '🦘', { kind: 'plyo', group: 'jambes', focus: ['vitesse', 'jambes'], needs: [], muscles: ['quadriceps', 'fessiers', 'mollets'], intensity: 'mod',
  mode: 'reps', sets: 4, repsMin: 4, repsMax: 4, rest: 120,
  cues: ['Sans charge, descente rapide mais contrôlée puis saut maximal.', 'Réception silencieuse et souple.', 'Repars seulement quand tu es parfaitement stable.', 'Qualité maximale, jamais à l’épuisement.'], bad: ['Continuer quand les sauts sont moins hauts.'], why: 'Détente et explosivité des jambes.', src: 'Pliométrie classique' });
E('pushup-explosive', 'Pompes dynamiques', '👏', { kind: 'plyo', group: 'pousser', focus: ['vitesse', 'equilibre'], needs: [], muscles: ['pectoraux', 'triceps', 'épaules'], intensity: 'mod', minLevel: 1,
  mode: 'reps', sets: 3, repsMin: 5, repsMax: 8, rest: 90, cues: ['Descente contrôlée, poussée explosive, réception souple.'], why: 'Puissance de poussée pour équilibrer le tirage.', src: 'Pliométrie classique' });
E('explosive-pullup', 'Tractions explosives', '⚡', { kind: 'plyo', group: 'tirer', focus: ['vitesse', 'perf'], needs: ['bar'], muscles: ['grand dorsal', 'biceps'], intensity: 'high', minLevel: 2,
  mode: 'reps', sets: 4, repsMin: 3, repsMax: 5, rest: 150, cues: ['Tire le plus vite possible, poitrine vers la barre.', 'Redescends lentement.'], why: 'Vitesse de tirage.', src: 'Renforcement de puissance' });
E('step-up-explosive', 'Step-up explosif', '🪜', { kind: 'plyo', group: 'jambes', focus: ['vitesse', 'jambes'], needs: [], muscles: ['fessiers', 'quadriceps', 'coordination'], intensity: 'mod',
  mode: 'reps', sets: 3, repsMin: 5, repsMax: 5, perSide: true, rest: 90,
  cues: ['Support stable et bas.', 'Monte de manière explosive, redescends sous contrôle.'], why: 'Puissance unilatérale.', src: 'Renforcement classique' });
E('skater-jumps', 'Sauts latéraux', '⛷️', { kind: 'plyo', group: 'jambes', focus: ['vitesse', 'jambes'], needs: [], muscles: ['fessiers', 'stabilité de cheville'], intensity: 'mod',
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 10, rest: 60, cues: ['Saute latéralement, réception souple sur une jambe.'], why: 'Stabilité et réactivité des chevilles.', src: 'Pliométrie classique' });

/* ───────────── JAMBES ───────────── */
E('squat-loaded', 'Squats lestés', '🏋️', { kind: 'legs', group: 'jambes', focus: ['jambes'], needs: ['weights'], muscles: ['quadriceps', 'fessiers', 'adducteurs'], intensity: 'mod',
  mode: 'reps', sets: 4, repsMin: 6, repsMax: 8, rest: 150, load: '+10 à 15 kg',
  cues: ['Poids près du corps, pieds largeur d’épaules.', 'Descends avec contrôle, genoux dans l’axe des pieds.', 'Choisis la charge basse si la technique se dégrade.'], why: 'Force de base des jambes.', src: 'Renforcement classique' });
E('bulgarian', 'Fentes bulgares', '🦵', { kind: 'legs', group: 'jambes', focus: ['jambes', 'dalle'], needs: [], muscles: ['quadriceps', 'fessiers', 'stabilité'], intensity: 'mod',
  mode: 'reps', sets: 3, repsMin: 6, repsMax: 10, perSide: true, rest: 120, load: 'Poids du corps (+5 à 10 kg)',
  cues: ['Pied arrière sur un support stable et bas.', 'Descends verticalement, genou dans l’axe des orteils.', 'Commence sans charge si tu n’es pas stable.'], why: 'Force et équilibre unilatéral.', src: 'Renforcement classique' });
E('rdl', 'Soulevé de terre roumain', '🏗️', { kind: 'legs', group: 'jambes', focus: ['jambes', 'equilibre'], needs: ['weights'], muscles: ['ischio-jambiers', 'fessiers', 'bas du dos'], intensity: 'mod',
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 10, rest: 120, load: '+10 à 15 kg',
  cues: ['Genoux légèrement fléchis, recule les hanches.', 'Dos neutre, descends jusqu’à sentir les ischio-jambiers.'], why: 'Équilibre l’avant des cuisses et protège le dos.', src: 'Renforcement classique' });
E('single-leg-rdl', 'Soulevé roumain unipodal', '🦩', { kind: 'legs', group: 'jambes', focus: ['equilibre', 'dalle'], needs: [], muscles: ['ischio-jambiers', 'fessiers', 'stabilité'],
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 8, perSide: true, rest: 60, cues: ['Bascule le buste, jambe libre tendue derrière.', 'Hanches carrées.'], why: 'Équilibre et fessiers.', src: 'Renforcement classique' });
E('calf-raise', 'Mollets debout', '🦶', { kind: 'legs', group: 'jambes', focus: ['jambes', 'dalle'], needs: [], muscles: ['mollets'],
  mode: 'reps', sets: 3, repsMin: 12, repsMax: 20, rest: 90, load: 'Poids du corps (+10 à 15 kg)', cues: ['Monte le plus haut possible, pause courte.', 'Descends lentement.'], why: 'Mollets solides = pieds précis sur petites prises.', src: 'Renforcement classique' });
E('cossack', 'Cossack squat', '🕺', { kind: 'legs', group: 'jambes', focus: ['jambes', 'dalle', 'equilibre'], needs: [], muscles: ['adducteurs', 'fessiers', 'mobilité des hanches'],
  mode: 'reps', sets: 2, repsMin: 6, repsMax: 6, perSide: true, rest: 60, cues: ['Pieds largement écartés, descends vers une jambe.', 'L’autre jambe reste tendue autant que confortable.'], why: 'Mobilité des hanches utile à l’escalade.', src: 'Mobilité active' });
E('calf-iso', 'Isométrie mollets', '🧱', { kind: 'legs', group: 'jambes', focus: ['jambes', 'dalle'], needs: [], muscles: ['mollets', 'stabilité de cheville'],
  mode: 'time', sets: 2, secMin: 30, secMax: 45, perSide: true, rest: 45, cues: ['Monte sur la pointe d’un pied et garde la position.', 'Corps stable.'], why: 'Stabilité de cheville.', src: 'Renforcement classique' });
E('glute-bridge', 'Pont fessier', '🌉', { kind: 'legs', group: 'jambes', focus: ['jambes', 'equilibre', 'dalle'], needs: [], muscles: ['fessiers', 'ischio-jambiers'],
  mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, rest: 45, cues: ['Pousse dans les talons, bassin haut sans cambrer.'], why: 'Fessiers actifs pour les hauts pieds.', src: 'Renforcement classique' });

/* ───────────── ÉQUILIBRE / ANTAGONISTES ───────────── */
E('pushup', 'Pompes', '🤜', { kind: 'antagonist', group: 'pousser', focus: ['equilibre', 'devers', 'reglette', 'resistance', 'perf'], needs: [], muscles: ['pectoraux', 'triceps', 'épaules'],
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 15, rest: 75, cues: ['Corps gainé, poitrine vers le sol.', 'Coudes à 30–45° du corps.', 'Garde 2 reps en réserve.'], why: 'Le pousser équilibre le tirer et protège les épaules.', src: 'Prévention classique' });
E('pike-pushup', 'Pompes en piqué', '🔺', { kind: 'antagonist', group: 'pousser', focus: ['equilibre'], needs: [], muscles: ['épaules', 'triceps'], minLevel: 1,
  mode: 'reps', sets: 3, repsMin: 6, repsMax: 10, rest: 75, cues: ['Hanches hautes, tête vers le sol entre les mains.'], why: 'Épaules solides, sans matériel.', src: 'Renforcement classique' });
E('dips', 'Dips', '⬇️', { kind: 'antagonist', group: 'pousser', focus: ['equilibre', 'devers', 'perf'], needs: ['dips'], muscles: ['triceps', 'pectoraux', 'épaules'], minLevel: 1,
  mode: 'reps', sets: 3, repsMin: 6, repsMax: 10, rest: 90, cues: ['Épaules basses, descends à une profondeur confortable.', 'Garde 1–2 reps en réserve.'], bad: ['Descendre plus bas que ton épaule ne le supporte.'], why: 'Force de poussée.', src: 'Renforcement classique' });
E('shoulder-press', 'Développé épaules', '🙌', { kind: 'antagonist', group: 'pousser', focus: ['equilibre'], needs: ['weights'], muscles: ['épaules', 'triceps'],
  mode: 'reps', sets: 3, repsMin: 8, repsMax: 10, rest: 90, load: 'Charge modérée', cues: ['Gaine le ventre, pousse au-dessus de la tête sans cambrer.'], why: 'Épaules équilibrées.', src: 'Renforcement classique' });
E('band-pull-apart', 'Écartements à l’élastique', '🎗️', { kind: 'prehab', group: 'epaules', focus: ['equilibre', 'devers', 'reglette', 'perf', 'resistance'], needs: ['band'], muscles: ['arrière des épaules', 'trapèzes'],
  mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, rest: 45, cues: ['Bras tendus, écarte l’élastique en serrant les omoplates.'], why: 'Compense le tirage : épaules en santé.', src: 'Prévention classique' });
E('external-rotation', 'Rotation externe (élastique)', '🌀', { kind: 'prehab', group: 'epaules', focus: ['equilibre', 'devers', 'perf'], needs: ['band'], muscles: ['coiffe des rotateurs'], risk: '',
  mode: 'reps', sets: 2, repsMin: 12, repsMax: 15, perSide: true, rest: 45, cues: ['Coude collé au corps, tourne l’avant-bras vers l’extérieur.'], why: 'Protège la coiffe des rotateurs.', src: 'Prévention classique' });
E('ytw', 'Y-T-W au sol', '🔤', { kind: 'prehab', group: 'epaules', focus: ['equilibre', 'devers', 'reglette', 'perf', 'resistance', 'dalle'], needs: [], muscles: ['bas des trapèzes', 'arrière des épaules'],
  mode: 'reps', sets: 2, repsMin: 8, repsMax: 8, rest: 45, unit: 'par lettre', cues: ['Allongé sur le ventre, lève les bras en Y, T puis W.', 'Pouces vers le plafond, mouvement lent.'], why: 'Activation des omoplates sans matériel.', src: 'Prévention classique' });
E('scap-pullup', 'Tractions scapulaires', '⤴️', { kind: 'prehab', group: 'epaules', focus: ['equilibre', 'devers', 'perf', 'reglette'], needs: ['bar'], muscles: ['bas des trapèzes', 'grand dorsal'],
  mode: 'reps', sets: 2, repsMin: 10, repsMax: 10, rest: 60, cues: ['Bras tendus, abaisse les épaules puis remonte légèrement.', 'Mouvement lent.'], bad: ['Plier les coudes.'], why: 'Stabilité des omoplates.', src: 'Prévention classique' });
E('reverse-fly', 'Oiseau (haltères légers)', '🕊️', { kind: 'prehab', group: 'epaules', focus: ['equilibre'], needs: ['weights'], muscles: ['arrière des épaules', 'rhomboïdes'],
  mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, load: 'Léger', rest: 45, cues: ['Buste penché, lève les bras sur les côtés.'], why: 'Épaules équilibrées.', src: 'Prévention classique' });

/* ───────────── ÉCHAUFFEMENT (RAMP) ───────────── */
E('wu-pulse', 'Montée en température', '🔥', { role: 'warmup', kind: 'raise', group: 'jambes', focus: [], muscles: ['cardio'], mode: 'time', sets: 1, secMin: 240, secMax: 300, rest: 0, flex: [120, 420],
  cues: ['Corde à sauter, jumping jacks, marche rapide ou vélo : tu dois avoir chaud, sans être essoufflé.'], why: 'Élever la température avant de solliciter tendons et articulations.', src: 'Échauffement RAMP (élever)' });
E('wu-mob-upper', 'Mobilité épaules et haut du dos', '🤸', { role: 'warmup', kind: 'mobilize', group: 'epaules', muscles: ['épaules', 'haut du dos'], mode: 'reps', sets: 2, repsMin: 10, repsMax: 10, rest: 0,
  cues: ['Cercles de bras, chat-vache, rotation du haut du dos en position à quatre pattes.'], why: 'Mobiliser avant de charger.', src: 'Échauffement RAMP (mobiliser)' });
E('wu-mob-lower', 'Mobilité hanches et chevilles', '🤸', { role: 'warmup', kind: 'mobilize', group: 'jambes', muscles: ['hanches', 'chevilles'], mode: 'reps', sets: 2, repsMin: 8, repsMax: 8, perSide: true, rest: 0,
  cues: ['Fentes dynamiques avec rotation, cercles de hanche, genoux au-dessus des orteils.'], why: 'Hanches libres = pieds hauts et réceptions sûres.', src: 'Échauffement RAMP (mobiliser)' });
E('wu-wrists', 'Poignets et doigts', '🤲', { role: 'warmup', kind: 'mobilize', group: 'doigts', muscles: ['poignets', 'doigts'], mode: 'reps', sets: 2, repsMin: 10, repsMax: 10, rest: 0,
  cues: ['Cercles de poignets, flexions-extensions, ouvre et ferme les mains.', 'Masse doucement l’avant-bras.'], why: 'Préparer les fléchisseurs et les poulies.', src: 'Échauffement RAMP (mobiliser)' });
E('wu-scap-bar', 'Activation des omoplates (barre)', '⤴️', { role: 'warmup', kind: 'activate', group: 'epaules', needs: ['bar'], muscles: ['omoplates', 'grand dorsal'], mode: 'reps', sets: 2, repsMin: 8, repsMax: 8, rest: 20,
  cues: ['Suspension bras tendus, abaisse les épaules sans plier les coudes.'], why: 'Réveiller les stabilisateurs.', src: 'Échauffement RAMP (activer)' });
E('wu-scap-band', 'Activation des omoplates (élastique)', '🎗️', { role: 'warmup', kind: 'activate', group: 'epaules', needs: ['band'], muscles: ['omoplates'], mode: 'reps', sets: 2, repsMin: 12, repsMax: 12, rest: 20,
  cues: ['Écartements d’élastique bras tendus, omoplates serrées.'], why: 'Réveiller les stabilisateurs.', src: 'Échauffement RAMP (activer)' });
E('wu-scap-floor', 'Activation des omoplates (Y-T-W)', '🔤', { role: 'warmup', kind: 'activate', group: 'epaules', muscles: ['omoplates'], mode: 'reps', sets: 2, repsMin: 6, repsMax: 6, rest: 20,
  cues: ['Allongé sur le ventre : bras en Y, T puis W, lentement.'], why: 'Réveiller les stabilisateurs.', src: 'Échauffement RAMP (activer)' });
E('wu-core', 'Activation du gainage', '🧱', { role: 'warmup', kind: 'activate', group: 'gainage', muscles: ['abdos', 'transverse'], mode: 'time', sets: 2, secMin: 20, secMax: 20, rest: 15, cues: ['Planche sur les avant-bras, corps aligné, ventre serré.'], why: 'Tronc stable avant d’escalader.', src: 'Échauffement RAMP (activer)' });
E('wu-climb', 'Grimpe progressive', '🧗', { role: 'warmup', kind: 'potentiate', group: 'doigts', needs: ['wall'], muscles: ['tout le corps'], mode: 'reps', sets: 3, repsMin: 1, repsMax: 1, unit: 'blocs', rest: 45,
  cues: ['Monte en difficulté progressivement.', 'Reste sur des prises larges au début.'], why: 'Préparer le corps aux prises du jour.', src: 'Échauffement RAMP (potentialiser)' });
E('wu-hang', 'Suspensions progressives', '🖐️', { role: 'warmup', kind: 'potentiate', group: 'doigts', needs: ['hangboard'], muscles: ['doigts'], risk: 'finger', mode: 'time', sets: 3, secMin: 8, secMax: 8, rest: 60,
  cues: ['Série 1 à ~50 % de l’effort, série 2 à ~70 %, série 3 à ~85 % de ta charge de travail.', 'Sur une prise large, épaules actives.'], why: 'Monter en charge avant les suspensions de travail.', src: 'Échauffement progressif à la poutre' });
E('wu-jumps', 'Petits sauts et pogos', '🐇', { role: 'warmup', kind: 'potentiate', group: 'jambes', muscles: ['mollets', 'chevilles'], mode: 'time', sets: 2, secMin: 20, secMax: 20, rest: 30, cues: ['Petits rebonds rapides sur l’avant du pied, chevilles élastiques.'], why: 'Préparer tendons et chevilles aux sauts.', src: 'Échauffement RAMP (potentialiser)' });

/* ───────────── RETOUR AU CALME ───────────── */
E('cd-forearm', 'Étirement avant-bras', '🙏', { role: 'cool', kind: 'cool', group: 'doigts', muscles: ['avant-bras'], mode: 'time', sets: 2, secMin: 30, secMax: 30, perSide: true, rest: 10, cues: ['Bras tendu, paume vers l’avant, étire doucement les doigts.'], why: 'Détendre les avant-bras.', src: 'Retour au calme' });
E('cd-shoulders', 'Étirement pectoraux et épaules', '🧘', { role: 'cool', kind: 'cool', group: 'epaules', muscles: ['pectoraux', 'épaules'], mode: 'time', sets: 2, secMin: 30, secMax: 30, rest: 10, cues: ['Avant-bras contre un montant de porte, tourne doucement le buste.'], why: 'Compense la posture enroulée.', src: 'Retour au calme' });
E('cd-hips', 'Étirement hanches et fessiers', '🧘', { role: 'cool', kind: 'cool', group: 'jambes', muscles: ['fessiers', 'hanches'], mode: 'time', sets: 2, secMin: 30, secMax: 30, perSide: true, rest: 10, cues: ['Position du pigeon ou 4 croisé, respire.'], why: 'Récupération des hanches.', src: 'Retour au calme' });
E('cd-breath', 'Respiration lente', '🌬️', { role: 'cool', kind: 'cool', group: 'gainage', muscles: [], mode: 'time', sets: 1, secMin: 90, secMax: 120, rest: 0, cues: ['Inspire 4 s, expire 6 s, allongé.'], why: 'Redescendre en douceur.', src: 'Retour au calme' });

/* ═════════════ V2 : exercices multi-activités et annotations sémantiques ═════════════
   Chaque exercice porte désormais :
   - caps  : capacités sollicitées (relations pondérées 0–1, voir model.js CAPACITIES) ;
   - prim / sec : muscles principaux / secondaires (identifiants de model.js MUSCLES, noms français) ;
   - acts  : activités compatibles ; pattern : famille de mouvement (sert au remplacement intelligent) ;
   - diff  : difficulté intrinsèque 1–5 (sert à l'estimation du niveau des séances communes).
   Les nouveaux exercices portent climb:false : le générateur escalade historique (engine.js) ne les utilise pas. */
const ACT_CODES = { B: 'climbing_boulder', V: 'climbing_route', S: 'strength', C: 'conditioning', R: 'running', N: 'swimming' };
const acts = (codes) => [...codes].map((c) => ACT_CODES[c]).filter(Boolean);
const cp = (t) => Object.fromEntries(t.split(/\s+/).filter(Boolean).map((p) => { const [k, v] = p.split(':'); return [k, Number(v)]; }));
const X = (id, name, emoji, o) => E(id, name, emoji, { climb: false, ...o });

/* ───── Figures : front lever, drapeau, traction à un bras, muscle-up, équilibre, pistol ───── */
X('fl-adv-tuck', 'Front lever groupé avancé', '🛩️', { kind: 'core', group: 'gainage', needs: ['bar'], intensity: 'high', minLevel: 2, mode: 'time', sets: 4, secMin: 6, secMax: 10, rest: 150,
  caps: cp('controle_scapulaire:.9 gainage_anterieur:.8 tirage_vertical:.4'), prim: ['grand_dorsal', 'grand_droit'], sec: ['biceps', 'trapezes'], acts: acts('C'), pattern: 'levier', diff: 4,
  cues: ['Dos plat, hanches ouvertes plus loin que la version groupée.', 'Bras tendus, omoplates basses et serrées.'], bad: ['Plier les coudes.', 'Creuser le bas du dos.'], why: 'Étape intermédiaire entre le groupé et les versions longues.', src: 'Progression gymnique courante' });
X('fl-straddle', 'Front lever jambes écartées', '🛩️', { kind: 'core', group: 'gainage', needs: ['bar'], intensity: 'high', minLevel: 2, mode: 'time', sets: 4, secMin: 4, secMax: 8, rest: 180,
  caps: cp('controle_scapulaire:1 gainage_anterieur:.9 tirage_vertical:.5'), prim: ['grand_dorsal', 'grand_droit'], sec: ['biceps', 'trapezes', 'lombaires'], acts: acts('C'), pattern: 'levier', diff: 5,
  cues: ['Jambes tendues et écartées pour raccourcir le levier.', 'Corps à l’horizontale, regard vers le haut.'], bad: ['Tenir au-delà d’une position propre.'], why: 'Levier presque complet avec un bras de levier réduit.', src: 'Progression gymnique courante' });
X('fl-full', 'Front lever complet', '🛫', { kind: 'core', group: 'gainage', needs: ['bar'], intensity: 'high', minLevel: 2, mode: 'time', sets: 4, secMin: 3, secMax: 6, rest: 180,
  caps: cp('controle_scapulaire:1 gainage_anterieur:1 tirage_vertical:.6'), prim: ['grand_dorsal', 'grand_droit'], sec: ['biceps', 'trapezes', 'lombaires', 'grand_fessier'], acts: acts('C'), pattern: 'levier', diff: 5,
  cues: ['Corps gainé des épaules aux pieds, à l’horizontale.'], bad: ['Garder les hanches cassées.'], why: 'La figure finale.', src: 'Progression gymnique courante' });
X('fl-raises', 'Montées en front lever groupé', '⤴️', { kind: 'core', group: 'gainage', needs: ['bar'], intensity: 'high', minLevel: 1, mode: 'reps', sets: 3, repsMin: 4, repsMax: 6, rest: 120,
  caps: cp('controle_scapulaire:.8 gainage_anterieur:.6 tirage_vertical:.5'), prim: ['grand_dorsal', 'grand_droit'], sec: ['biceps', 'flechisseurs_hanche'], acts: acts('CB'), pattern: 'levier', diff: 4,
  cues: ['Depuis la suspension, monte en position groupée bras tendus, redescends lentement.'], why: 'Force dynamique dans l’amplitude du front lever.', src: 'Progression gymnique courante' });
X('fl-negative', 'Négatives de front lever', '⤵️', { kind: 'core', group: 'gainage', needs: ['bar'], intensity: 'high', minLevel: 2, mode: 'reps', sets: 3, repsMin: 3, repsMax: 5, rest: 150,
  caps: cp('controle_scapulaire:.9 gainage_anterieur:.7 tirage_vertical:.6'), prim: ['grand_dorsal', 'grand_droit'], sec: ['biceps', 'trapezes'], acts: acts('C'), pattern: 'levier', diff: 4,
  cues: ['Depuis la position inversée, descends en 4–5 s en gardant le corps gainé.'], why: 'L’excentrique renforce la position tenue.', src: 'Progression gymnique courante' });
X('fl-band', 'Front lever avec élastique', '🎗️', { kind: 'core', group: 'gainage', needs: ['bar', 'band'], intensity: 'mod', minLevel: 1, mode: 'time', sets: 4, secMin: 10, secMax: 15, rest: 120,
  caps: cp('controle_scapulaire:.8 gainage_anterieur:.7 tirage_vertical:.3'), prim: ['grand_dorsal', 'grand_droit'], sec: ['biceps'], acts: acts('C'), pattern: 'levier', diff: 3,
  cues: ['Élastique sous les hanches, tiens une position plus longue que sans aide.'], why: 'Travailler une position avancée avec une charge réduite.', src: 'Progression courante' });
X('reverse-plank', 'Planche inversée', '🌉', { kind: 'core', group: 'gainage', needs: [], mode: 'time', sets: 3, secMin: 20, secMax: 30, rest: 45,
  caps: cp('chaine_posterieure:.6 stabilite_epaules:.4 controle_scapulaire:.3'), prim: ['grand_fessier', 'deltoide_post'], sec: ['ischios', 'triceps'], acts: acts('CBV'), pattern: 'gainage', diff: 1,
  cues: ['Mains derrière toi, bassin haut, corps aligné.'], why: 'Compense les positions enroulées et prépare les épaules.', src: 'Renforcement classique' });
X('flag-vertical', 'Drapeau vertical', '🚩', { kind: 'core', group: 'gainage', needs: ['pole'], intensity: 'mod', minLevel: 1, mode: 'time', sets: 4, secMin: 8, secMax: 15, rest: 120,
  caps: cp('gainage_lateral:.8 stabilite_epaules:.5 poussee_verticale:.3'), prim: ['obliques', 'grand_dorsal'], sec: ['deltoide_ant', 'triceps'], acts: acts('C'), pattern: 'levier', diff: 3,
  cues: ['Bras du haut qui tire, bras du bas qui pousse, corps vertical le long du poteau.'], bad: ['Laisser l’épaule du bas s’affaisser.'], why: 'Apprend l’alignement du drapeau avec un levier court.', src: 'Progression street workout courante' });
X('flag-tuck', 'Drapeau groupé', '🚩', { kind: 'core', group: 'gainage', needs: ['pole'], intensity: 'high', minLevel: 2, mode: 'time', sets: 4, secMin: 5, secMax: 8, rest: 150,
  caps: cp('gainage_lateral:.9 poussee_verticale:.4 tirage_vertical:.4 stabilite_epaules:.5'), prim: ['obliques', 'grand_dorsal'], sec: ['deltoide_ant', 'triceps', 'moyen_fessier'], acts: acts('C'), pattern: 'levier', diff: 4,
  cues: ['Genoux ramenés, bassin à l’horizontale.'], why: 'Première position horizontale.', src: 'Progression street workout courante' });
X('flag-negative', 'Négatives de drapeau', '🚩', { kind: 'core', group: 'gainage', needs: ['pole'], intensity: 'high', minLevel: 2, mode: 'reps', sets: 3, repsMin: 3, repsMax: 5, rest: 150,
  caps: cp('gainage_lateral:.9 poussee_verticale:.5 tirage_vertical:.4'), prim: ['obliques', 'grand_dorsal'], sec: ['deltoide_ant', 'triceps'], acts: acts('C'), pattern: 'levier', diff: 4,
  cues: ['Monte en drapeau vertical puis descends lentement vers l’horizontale.'], why: 'L’excentrique construit la force de la figure.', src: 'Progression street workout courante' });
X('flag-full', 'Drapeau complet', '🚩', { kind: 'core', group: 'gainage', needs: ['pole'], intensity: 'high', minLevel: 2, mode: 'time', sets: 4, secMin: 3, secMax: 6, rest: 180,
  caps: cp('gainage_lateral:1 poussee_verticale:.5 tirage_vertical:.5 stabilite_epaules:.5'), prim: ['obliques', 'grand_dorsal', 'deltoide_ant'], sec: ['triceps', 'moyen_fessier'], acts: acts('C'), pattern: 'levier', diff: 5,
  cues: ['Corps tendu à l’horizontale, jambes serrées.'], why: 'La figure finale.', src: 'Progression street workout courante' });
X('side-plank-raise', 'Gainage latéral avec levée de jambe', '📐', { kind: 'core', group: 'gainage', needs: [], mode: 'time', sets: 3, secMin: 20, secMax: 30, perSide: true, rest: 45,
  caps: cp('gainage_lateral:1 equilibre:.3'), prim: ['obliques', 'moyen_fessier'], sec: ['grand_droit'], acts: acts('CSR'), pattern: 'gainage', diff: 2,
  cues: ['Planche latérale, lève la jambe du dessus sans basculer.'], why: 'Chaîne latérale plus exigeante que la planche simple.', src: 'Renforcement classique' });
X('copenhagen', 'Planche de Copenhague', '🧱', { kind: 'core', group: 'gainage', needs: [], mode: 'time', sets: 3, secMin: 15, secMax: 25, perSide: true, rest: 60,
  caps: cp('gainage_lateral:.8 force_jambes:.3'), prim: ['adducteurs', 'obliques'], sec: ['moyen_fessier'], acts: acts('CSR'), pattern: 'gainage', diff: 3,
  cues: ['Jambe du dessus posée sur un banc ou une chaise, corps aligné.', 'Version facile : genou posé.'], why: 'Adducteurs et chaîne latérale.', src: 'Renforcement classique' });
X('archer-pullup', 'Tractions archer', '🏹', { kind: 'pull', group: 'tirer', needs: ['bar'], intensity: 'high', minLevel: 1, mode: 'reps', sets: 4, repsMin: 2, repsMax: 5, perSide: true, rest: 150,
  caps: cp('tirage_unilateral:1 tirage_vertical:.6'), prim: ['grand_dorsal', 'biceps'], sec: ['avant_bras_flech', 'trapezes'], acts: acts('CB'), pattern: 'traction', diff: 4,
  cues: ['Prise large : un bras tire, l’autre glisse tendu sur la barre.'], bad: ['Laisser l’épaule monter vers l’oreille.'], why: 'Transfert progressif du tirage vers un bras.', src: 'Progression street workout courante' });
X('oap-negative', 'Négatives de traction à un bras', '☝️', { kind: 'pull', group: 'tirer', needs: ['bar'], intensity: 'high', minLevel: 2, mode: 'reps', sets: 4, repsMin: 1, repsMax: 3, perSide: true, rest: 180,
  caps: cp('tirage_unilateral:1 blocage:.8'), prim: ['grand_dorsal', 'biceps'], sec: ['avant_bras_flech', 'coiffe'], acts: acts('C'), pattern: 'traction', diff: 5,
  cues: ['Monte à deux bras, lâche une main, descends en 3 à 5 s.'], bad: ['Descendre en chute libre (coude exposé).'], why: 'L’excentrique précède la traction complète.', src: 'Progression courante' });
X('oap-assisted', 'Traction à un bras assistée', '☝️', { kind: 'pull', group: 'tirer', needs: ['bar', 'band'], intensity: 'high', minLevel: 2, mode: 'reps', sets: 4, repsMin: 2, repsMax: 4, perSide: true, rest: 180,
  caps: cp('tirage_unilateral:1 tirage_vertical:.6'), prim: ['grand_dorsal', 'biceps'], sec: ['avant_bras_flech'], acts: acts('C'), pattern: 'traction', diff: 4,
  cues: ['Élastique ou main libre sur une serviette pour doser l’aide.'], why: 'Travail dans l’amplitude complète avec une aide contrôlée.', src: 'Progression courante' });
X('oap', 'Traction à un bras', '☝️', { kind: 'pull', group: 'tirer', needs: ['bar'], intensity: 'high', minLevel: 2, mode: 'reps', sets: 5, repsMin: 1, repsMax: 2, perSide: true, rest: 240,
  caps: cp('tirage_unilateral:1 blocage:.8 tirage_vertical:.6'), prim: ['grand_dorsal', 'biceps'], sec: ['avant_bras_flech', 'obliques'], acts: acts('C'), pattern: 'traction', diff: 5,
  cues: ['Départ bras tendu actif, jambes serrées.'], why: 'La figure finale.', src: 'Progression courante' });
X('high-pullup', 'Tractions poitrine à la barre', '🔝', { kind: 'pull', group: 'tirer', needs: ['bar'], intensity: 'high', minLevel: 1, mode: 'reps', sets: 4, repsMin: 3, repsMax: 6, rest: 150,
  caps: cp('puissance_haut:.7 tirage_vertical:.8'), prim: ['grand_dorsal', 'biceps'], sec: ['trapezes', 'rhomboides'], acts: acts('CB'), pattern: 'traction', diff: 3,
  cues: ['Tire fort et haut : poitrine vers la barre.'], why: 'Tirage haut nécessaire au muscle-up.', src: 'Progression street workout courante' });
X('straight-bar-dips', 'Dips à la barre droite', '⬇️', { kind: 'antagonist', group: 'pousser', needs: ['bar'], intensity: 'mod', minLevel: 1, mode: 'reps', sets: 3, repsMin: 5, repsMax: 10, rest: 90,
  caps: cp('poussee_horizontale:.6 poussee_verticale:.4'), prim: ['triceps', 'pectoraux'], sec: ['deltoide_ant'], acts: acts('CS'), pattern: 'poussee', diff: 3,
  cues: ['Appui au-dessus de la barre, descends poitrine vers la barre, repousse.'], why: 'La sortie du muscle-up.', src: 'Progression street workout courante' });
X('muscle-up-band', 'Muscle-up assisté (élastique)', '🔝', { kind: 'power', group: 'tirer', needs: ['bar', 'band'], intensity: 'high', minLevel: 1, mode: 'reps', sets: 4, repsMin: 2, repsMax: 4, rest: 150,
  caps: cp('puissance_haut:1 tirage_vertical:.6 coordination:.5'), prim: ['grand_dorsal', 'triceps'], sec: ['biceps', 'pectoraux'], acts: acts('C'), pattern: 'traction', diff: 4,
  cues: ['Tirage explosif, bascule des poignets au-dessus de la barre, puis poussée.'], why: 'Apprendre la transition avec une aide.', src: 'Progression street workout courante' });
X('ring-row', 'Rowing aux anneaux', '🚣', { kind: 'pull', group: 'tirer', needs: ['rings'], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 75,
  caps: cp('tirage_horizontal:1 stabilite_epaules:.3'), prim: ['rhomboides', 'grand_dorsal'], sec: ['biceps', 'deltoide_post'], acts: acts('CS'), pattern: 'rowing', diff: 2,
  cues: ['Corps gainé, tire les anneaux vers les côtes.'], why: 'Tirage horizontal libre pour les épaules.', src: 'Renforcement classique' });
X('ring-dips', 'Dips aux anneaux', '⬇️', { kind: 'antagonist', group: 'pousser', needs: ['rings'], intensity: 'high', minLevel: 2, mode: 'reps', sets: 3, repsMin: 4, repsMax: 8, rest: 120,
  caps: cp('poussee_horizontale:.7 stabilite_epaules:.6'), prim: ['triceps', 'pectoraux'], sec: ['deltoide_ant', 'grand_dentele'], acts: acts('C'), pattern: 'poussee', diff: 4,
  cues: ['Anneaux serrés contre le corps, descente contrôlée.'], bad: ['Descendre plus bas que ce que les épaules tolèrent.'], why: 'Poussée instable très complète.', src: 'Gymnastique' });
X('wall-handstand', 'Équilibre face au mur', '🤸', { kind: 'antagonist', group: 'pousser', needs: [], intensity: 'mod', minLevel: 1, mode: 'time', sets: 4, secMin: 20, secMax: 40, rest: 90,
  caps: cp('poussee_verticale:.8 equilibre:.6 stabilite_epaules:.5'), prim: ['deltoide_ant', 'triceps'], sec: ['trapezes', 'grand_dentele', 'grand_droit'], acts: acts('C'), pattern: 'poussee', diff: 3,
  cues: ['Ventre face au mur, mains à 10–20 cm, corps aligné.', 'Pousse le sol, épaules aux oreilles.'], why: 'Construit l’alignement et la force de l’équilibre.', src: 'Gymnastique' });
X('pistol-box', 'Pistol squat sur box', '🦵', { kind: 'legs', group: 'jambes', needs: ['box'], mode: 'reps', sets: 3, repsMin: 5, repsMax: 8, perSide: true, rest: 75,
  caps: cp('force_jambes:.8 equilibre:.6'), prim: ['quadriceps', 'grand_fessier'], sec: ['moyen_fessier', 'adducteurs'], acts: acts('CR'), pattern: 'squat', diff: 2,
  cues: ['Assieds-toi sur une jambe jusqu’à la box, remonte sans élan.'], why: 'Amplitude réduite vers le pistol complet.', src: 'Progression courante' });
X('pistol', 'Pistol squat', '🦵', { kind: 'legs', group: 'jambes', needs: [], intensity: 'mod', minLevel: 1, mode: 'reps', sets: 3, repsMin: 3, repsMax: 6, perSide: true, rest: 90,
  caps: cp('force_jambes:1 equilibre:.7 mobilite_hanches:.4'), prim: ['quadriceps', 'grand_fessier'], sec: ['moyen_fessier', 'grand_droit', 'mollets'], acts: acts('C'), pattern: 'squat', diff: 4,
  cues: ['Jambe libre tendue devant, talon au sol, descente complète.'], why: 'Force unilatérale et équilibre.', src: 'Progression courante' });

/* ───── Musculation (salle) ───── */
X('back-squat', 'Squat barre', '🏋️', { kind: 'legs', group: 'jambes', needs: ['barbell'], intensity: 'mod', mode: 'reps', sets: 4, repsMin: 5, repsMax: 8, rest: 150, load: 'Charge de travail',
  caps: cp('force_jambes:1'), prim: ['quadriceps', 'grand_fessier'], sec: ['adducteurs', 'lombaires', 'grand_droit'], acts: acts('S'), pattern: 'squat', diff: 3,
  cues: ['Pieds à largeur d’épaules, genoux dans l’axe des pieds.', 'Garde 1 à 2 répétitions en réserve.'], bad: ['Arrondir le bas du dos.'], why: 'Exercice de base de la force des jambes.', src: 'Musculation classique' });
X('deadlift', 'Soulevé de terre', '🏗️', { kind: 'legs', group: 'jambes', needs: ['barbell'], intensity: 'high', minLevel: 1, mode: 'reps', sets: 3, repsMin: 4, repsMax: 6, rest: 180, load: 'Charge de travail',
  caps: cp('chaine_posterieure:1 force_jambes:.4 pince:.3'), prim: ['ischios', 'grand_fessier', 'lombaires'], sec: ['trapezes', 'avant_bras_flech', 'quadriceps'], acts: acts('S'), pattern: 'charniere', diff: 4,
  cues: ['Barre contre les tibias, dos plat, pousse le sol.'], bad: ['Arrondir le dos pour aller chercher la barre.'], why: 'Force de toute la chaîne postérieure.', src: 'Musculation classique' });
X('bench-press', 'Développé couché', '🏋️', { kind: 'antagonist', group: 'pousser', needs: ['barbell', 'bench'], intensity: 'mod', mode: 'reps', sets: 4, repsMin: 5, repsMax: 8, rest: 150, load: 'Charge de travail',
  caps: cp('poussee_horizontale:1'), prim: ['pectoraux', 'triceps'], sec: ['deltoide_ant'], acts: acts('S'), pattern: 'poussee', diff: 3,
  cues: ['Omoplates serrées, pieds au sol, barre au bas des pectoraux.'], why: 'Force de poussée horizontale.', src: 'Musculation classique' });
X('overhead-press', 'Développé militaire', '🙌', { kind: 'antagonist', group: 'pousser', needs: ['barbell'], intensity: 'mod', mode: 'reps', sets: 4, repsMin: 5, repsMax: 8, rest: 150, load: 'Charge de travail',
  caps: cp('poussee_verticale:1 gainage_anterieur:.3'), prim: ['deltoide_ant', 'triceps'], sec: ['trapezes', 'grand_droit'], acts: acts('S'), pattern: 'poussee', diff: 3,
  cues: ['Fessiers et abdos serrés, barre au-dessus de la tête, sans cambrer.'], why: 'Force de poussée verticale.', src: 'Musculation classique' });
X('barbell-row', 'Rowing barre', '🚣', { kind: 'pull', group: 'tirer', needs: ['barbell'], intensity: 'mod', mode: 'reps', sets: 4, repsMin: 6, repsMax: 10, rest: 120, load: 'Charge de travail',
  caps: cp('tirage_horizontal:1'), prim: ['grand_dorsal', 'rhomboides'], sec: ['biceps', 'lombaires', 'deltoide_post'], acts: acts('S'), pattern: 'rowing', diff: 3,
  cues: ['Buste penché, dos plat, tire la barre vers le nombril.'], why: 'Tirage horizontal lourd.', src: 'Musculation classique' });
X('db-row', 'Rowing haltère à un bras', '🚣', { kind: 'pull', group: 'tirer', needs: ['weights'], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, perSide: true, rest: 75,
  caps: cp('tirage_horizontal:.9'), prim: ['grand_dorsal', 'rhomboides'], sec: ['biceps'], acts: acts('SC'), pattern: 'rowing', diff: 2,
  cues: ['Main et genou en appui sur un banc, tire le coude vers la hanche.'], why: 'Tirage horizontal unilatéral.', src: 'Musculation classique' });
X('lat-pulldown', 'Tirage vertical à la poulie', '⬇️', { kind: 'pull', group: 'tirer', needs: ['machine'], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 90,
  caps: cp('tirage_vertical:.9'), prim: ['grand_dorsal'], sec: ['biceps', 'trapezes'], acts: acts('S'), pattern: 'traction', diff: 2,
  cues: ['Tire la barre vers le haut de la poitrine, épaules basses.'], why: 'Tirage vertical à charge réglable.', src: 'Musculation classique' });
X('leg-press', 'Presse à cuisses', '🦵', { kind: 'legs', group: 'jambes', needs: ['machine'], mode: 'reps', sets: 3, repsMin: 10, repsMax: 12, rest: 90,
  caps: cp('force_jambes:.9'), prim: ['quadriceps', 'grand_fessier'], sec: ['adducteurs'], acts: acts('S'), pattern: 'squat', diff: 2,
  cues: ['Bas du dos collé au dossier, amplitude contrôlée.'], why: 'Force des jambes guidée.', src: 'Musculation classique' });
X('hip-thrust', 'Hip thrust', '🌉', { kind: 'legs', group: 'jambes', needs: ['barbell', 'bench'], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 90,
  caps: cp('chaine_posterieure:.9 explosivite:.2'), prim: ['grand_fessier'], sec: ['ischios'], acts: acts('S'), pattern: 'charniere', diff: 2,
  cues: ['Haut du dos sur le banc, pousse les hanches vers le haut, menton rentré.'], why: 'Force des fessiers.', src: 'Musculation classique' });
X('walking-lunge', 'Fentes marchées', '🚶', { kind: 'legs', group: 'jambes', needs: [], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, perSide: true, rest: 75,
  caps: cp('force_jambes:.8 equilibre:.3'), prim: ['quadriceps', 'grand_fessier'], sec: ['adducteurs', 'mollets'], acts: acts('SCR'), pattern: 'fente', diff: 2,
  cues: ['Grand pas, genou arrière proche du sol, buste droit.'], why: 'Force et stabilité des jambes.', src: 'Renforcement classique' });
X('goblet-squat', 'Squat gobelet', '🏺', { kind: 'legs', group: 'jambes', needs: ['weights'], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 75,
  caps: cp('force_jambes:.8 mobilite_hanches:.2'), prim: ['quadriceps', 'grand_fessier'], sec: ['grand_droit', 'adducteurs'], acts: acts('SC'), pattern: 'squat', diff: 1,
  cues: ['Haltère contre la poitrine, descends entre les genoux.'], why: 'Apprendre le squat avec une charge légère.', src: 'Musculation classique' });
X('kb-swing', 'Swing kettlebell', '🔔', { kind: 'plyo', group: 'jambes', needs: ['kettlebell'], intensity: 'mod', mode: 'reps', sets: 4, repsMin: 12, repsMax: 15, rest: 60,
  caps: cp('chaine_posterieure:.8 explosivite:.6'), prim: ['grand_fessier', 'ischios'], sec: ['lombaires', 'grand_droit', 'avant_bras_flech'], acts: acts('SC'), pattern: 'charniere', diff: 2,
  cues: ['Mouvement de hanches, pas de squat : les bras ne font que guider.'], why: 'Puissance de la chaîne postérieure.', src: 'Renforcement classique' });
X('db-bench', 'Développé haltères', '🏋️', { kind: 'antagonist', group: 'pousser', needs: ['weights', 'bench'], mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 90,
  caps: cp('poussee_horizontale:.9 stabilite_epaules:.2'), prim: ['pectoraux'], sec: ['triceps', 'deltoide_ant'], acts: acts('S'), pattern: 'poussee', diff: 2,
  cues: ['Descente contrôlée, coudes à 45° du buste.'], why: 'Poussée horizontale avec liberté des épaules.', src: 'Musculation classique' });
X('farmer-carry', 'Marche du fermier', '🧺', { kind: 'core', group: 'gainage', needs: ['weights'], mode: 'time', sets: 3, secMin: 30, secMax: 45, rest: 60,
  caps: cp('pince:.6 gainage_lateral:.5 endurance_doigts:.3'), prim: ['avant_bras_flech', 'trapezes'], sec: ['obliques', 'grand_fessier'], acts: acts('SCB'), pattern: 'portage', diff: 2,
  cues: ['Charges lourdes dans chaque main, marche droit, épaules basses.'], why: 'Prise et gainage en mouvement.', src: 'Renforcement classique' });
X('face-pull', 'Face pull (élastique)', '🎗️', { kind: 'prehab', group: 'epaules', needs: ['band'], mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, rest: 45,
  caps: cp('stabilite_epaules:.8 tirage_horizontal:.4'), prim: ['deltoide_post', 'rhomboides'], sec: ['coiffe', 'trapezes'], acts: acts('SCBVN'), pattern: 'prevention', diff: 1,
  cues: ['Tire l’élastique vers le front, coudes hauts, pouces vers l’arrière.'], why: 'Arrière des épaules et coiffe : équilibre les poussées.', src: 'Prévention classique' });
X('pallof-press', 'Pallof press (élastique)', '🎗️', { kind: 'core', group: 'gainage', needs: ['band'], mode: 'reps', sets: 3, repsMin: 10, repsMax: 12, perSide: true, rest: 45,
  caps: cp('gainage_lateral:.8 gainage_anterieur:.4'), prim: ['obliques'], sec: ['grand_droit'], acts: acts('SCR'), pattern: 'gainage', diff: 1,
  cues: ['Élastique sur le côté, tends les bras devant toi sans tourner le buste.'], why: 'Gainage anti-rotation.', src: 'Renforcement classique' });

/* ───── Renforcement / préparation physique (peu ou pas de matériel) ───── */
X('bird-dog', 'Bird dog', '🐕', { kind: 'core', group: 'gainage', needs: [], mode: 'reps', sets: 3, repsMin: 8, repsMax: 10, perSide: true, rest: 30,
  caps: cp('gainage_anterieur:.5 chaine_posterieure:.4 equilibre:.3'), prim: ['lombaires', 'grand_fessier'], sec: ['grand_droit', 'deltoide_post'], acts: acts('CRNS'), pattern: 'gainage', diff: 1,
  cues: ['À quatre pattes, tends bras et jambe opposés sans bouger le bassin.'], why: 'Stabilité du tronc à faible charge.', src: 'Renforcement classique' });
X('plank', 'Planche sur les avant-bras', '🧱', { kind: 'core', group: 'gainage', needs: [], mode: 'time', sets: 3, secMin: 30, secMax: 60, rest: 45,
  caps: cp('gainage_anterieur:.8'), prim: ['grand_droit'], sec: ['obliques', 'deltoide_ant'], acts: acts('CSRN'), pattern: 'gainage', diff: 1,
  cues: ['Corps aligné, fessiers serrés, respiration régulière.'], why: 'Gainage de base.', src: 'Renforcement classique' });
X('mountain-climber', 'Mountain climbers', '⛰️', { kind: 'core', group: 'gainage', needs: [], intensity: 'mod', mode: 'time', sets: 3, secMin: 30, secMax: 40, rest: 45,
  caps: cp('gainage_anterieur:.5 endurance_aerobie:.4'), prim: ['grand_droit', 'flechisseurs_hanche'], sec: ['quadriceps', 'deltoide_ant'], acts: acts('CR'), pattern: 'circuit', diff: 1,
  cues: ['En appui sur les mains, ramène les genoux vers la poitrine en alternance.'], why: 'Gainage dynamique et cardio.', src: 'Renforcement classique' });
X('burpee', 'Burpees', '💥', { kind: 'plyo', group: 'jambes', needs: [], intensity: 'mod', mode: 'reps', sets: 3, repsMin: 8, repsMax: 12, rest: 60,
  caps: cp('endurance_aerobie:.5 explosivite:.5'), prim: ['quadriceps', 'pectoraux'], sec: ['grand_droit', 'grand_fessier'], acts: acts('C'), pattern: 'circuit', diff: 2,
  cues: ['Descends en planche, reviens, saute bras en l’air.'], why: 'Condition physique générale.', src: 'Renforcement classique' });
X('squat-bw', 'Squat au poids du corps', '🦵', { kind: 'legs', group: 'jambes', needs: [], mode: 'reps', sets: 3, repsMin: 15, repsMax: 20, rest: 45,
  caps: cp('force_jambes:.6 mobilite_hanches:.2'), prim: ['quadriceps', 'grand_fessier'], sec: ['adducteurs'], acts: acts('CR'), pattern: 'squat', diff: 1,
  cues: ['Talons au sol, poitrine haute, descends aussi bas que confortable.'], why: 'Base de la force des jambes.', src: 'Renforcement classique' });
X('wall-sit', 'Chaise contre le mur', '🪑', { kind: 'legs', group: 'jambes', needs: [], mode: 'time', sets: 3, secMin: 30, secMax: 60, rest: 45,
  caps: cp('force_jambes:.6'), prim: ['quadriceps'], sec: ['grand_fessier'], acts: acts('CRB'), pattern: 'squat', diff: 1,
  cues: ['Dos au mur, cuisses parallèles au sol.'], why: 'Isométrie des quadriceps, sans impact.', src: 'Renforcement classique' });
X('superman', 'Superman', '🦸', { kind: 'core', group: 'gainage', needs: [], mode: 'reps', sets: 3, repsMin: 10, repsMax: 12, rest: 30,
  caps: cp('chaine_posterieure:.6'), prim: ['lombaires', 'grand_fessier'], sec: ['trapezes', 'deltoide_post'], acts: acts('CN'), pattern: 'gainage', diff: 1,
  cues: ['À plat ventre, décolle bras et jambes 2 s, redescends.'], why: 'Renforce l’arrière du tronc.', src: 'Renforcement classique' });
X('band-row', 'Tirage à l’élastique', '🎗️', { kind: 'pull', group: 'tirer', needs: ['band'], mode: 'reps', sets: 3, repsMin: 12, repsMax: 15, rest: 45,
  caps: cp('tirage_horizontal:.8 stabilite_epaules:.3'), prim: ['rhomboides', 'grand_dorsal'], sec: ['biceps', 'deltoide_post'], acts: acts('CN'), pattern: 'rowing', diff: 1,
  cues: ['Élastique fixé devant, tire les coudes vers l’arrière.'], why: 'Tirage horizontal sans barre.', src: 'Renforcement classique' });
X('jump-rope', 'Corde à sauter', '🪢', { kind: 'plyo', group: 'jambes', needs: ['rope'], mode: 'time', sets: 4, secMin: 60, secMax: 60, rest: 45,
  caps: cp('endurance_aerobie:.6 coordination:.4 explosivite:.2'), prim: ['mollets'], sec: ['quadriceps', 'tibial'], acts: acts('CRB'), pattern: 'circuit', diff: 1,
  cues: ['Petits sauts sur l’avant du pied, poignets qui tournent.'], why: 'Cardio et réactivité des chevilles.', src: 'Renforcement classique' });
X('box-jump', 'Sauts sur box', '📦', { kind: 'plyo', group: 'jambes', needs: ['box'], intensity: 'mod', mode: 'reps', sets: 4, repsMin: 4, repsMax: 6, rest: 90,
  caps: cp('explosivite:1'), prim: ['quadriceps', 'grand_fessier'], sec: ['mollets'], acts: acts('CSRB'), pattern: 'saut', diff: 2,
  cues: ['Saute sur la box, atterris doucement, redescends en marchant.'], why: 'Explosivité avec un atterrissage protégé.', src: 'Pliométrie classique' });

/* ───── Mobilité et récupération (intensité faible) ───── */
X('mob-hips', 'Mobilité 90/90 des hanches', '🧘', { kind: 'mobility', group: 'jambes', needs: [], mode: 'time', sets: 2, secMin: 45, secMax: 60, perSide: true, rest: 15,
  caps: cp('mobilite_hanches:1'), prim: ['grand_fessier', 'adducteurs'], sec: ['flechisseurs_hanche'], acts: acts('BVSCRN'), pattern: 'mobilite', diff: 1,
  cues: ['Assis, jambes à 90°, redresse le buste puis bascule doucement.'], why: 'Rotation des hanches.', src: 'Mobilité classique' });
X('mob-hamstrings', 'Étirement actif des ischio-jambiers', '🧘', { kind: 'mobility', group: 'jambes', needs: [], mode: 'time', sets: 2, secMin: 45, secMax: 45, rest: 15,
  caps: cp('mobilite_hanches:.8'), prim: ['ischios'], sec: ['mollets'], acts: acts('BVSCRN'), pattern: 'mobilite', diff: 1,
  cues: ['Jambe tendue sur un support bas, bascule le bassin vers l’avant, dos long.'], why: 'Souplesse de l’arrière des jambes.', src: 'Mobilité classique' });
X('mob-thoracic', 'Rotations thoraciques', '🌀', { kind: 'mobility', group: 'epaules', needs: [], mode: 'reps', sets: 2, repsMin: 8, repsMax: 10, perSide: true, rest: 15,
  caps: cp('mobilite_epaules:.7'), prim: ['trapezes', 'rhomboides'], sec: ['obliques'], acts: acts('BVSCRN'), pattern: 'mobilite', diff: 1,
  cues: ['Allongé sur le côté, ouvre le bras du dessus en suivant la main du regard.'], why: 'Mobilité du haut du dos.', src: 'Mobilité classique' });
X('mob-shoulders', 'Passages d’épaules à l’élastique', '🎗️', { kind: 'mobility', group: 'epaules', needs: ['band'], mode: 'reps', sets: 2, repsMin: 10, repsMax: 12, rest: 15,
  caps: cp('mobilite_epaules:1 stabilite_epaules:.3'), prim: ['deltoide_ant', 'deltoide_post'], sec: ['coiffe', 'pectoraux'], acts: acts('BVSCN'), pattern: 'mobilite', diff: 1,
  cues: ['Bras tendus, fais passer l’élastique au-dessus de la tête puis derrière, sans forcer.'], why: 'Amplitude des épaules.', src: 'Mobilité classique' });
X('mob-ankles', 'Mobilité des chevilles', '🦶', { kind: 'mobility', group: 'jambes', needs: [], mode: 'reps', sets: 2, repsMin: 10, repsMax: 10, perSide: true, rest: 15,
  caps: cp('equilibre:.3 technique_course:.3'), prim: ['mollets', 'tibial'], sec: [], acts: acts('BVSCR'), pattern: 'mobilite', diff: 1,
  cues: ['Genou vers le mur, talon au sol, va-et-vient doux.'], why: 'Chevilles mobiles pour courir et grimper.', src: 'Mobilité classique' });
X('recov-walk', 'Marche active', '🚶', { kind: 'recovery', group: 'jambes', needs: [], mode: 'time', sets: 1, secMin: 600, secMax: 1200, rest: 0, flex: [300, 1800],
  caps: cp('endurance_aerobie:.3'), prim: ['quadriceps'], sec: ['mollets'], acts: acts('BVSCR'), pattern: 'recuperation', diff: 1,
  cues: ['Marche à allure facile, respiration nasale.'], why: 'Récupération active légère.', src: 'Récupération classique' });

/* ───── Course à pied ───── */
X('run-easy', 'Course en endurance fondamentale', '🏃', { kind: 'run', group: 'jambes', needs: [], mode: 'time', sets: 1, secMin: 1200, secMax: 2700, rest: 0, flex: [600, 3600],
  caps: cp('endurance_aerobie:1'), prim: ['quadriceps', 'mollets'], sec: ['ischios', 'grand_fessier'], acts: acts('R'), pattern: 'course', diff: 1,
  cues: ['Allure où tu peux parler par phrases complètes.'], why: 'Base de toute progression en course.', src: 'Entraînement course classique' });
X('run-short', 'Footing court', '🏃', { kind: 'run', group: 'jambes', needs: [], mode: 'time', sets: 1, secMin: 480, secMax: 900, rest: 0, flex: [240, 1200],
  caps: cp('endurance_aerobie:.7'), prim: ['quadriceps', 'mollets'], sec: ['ischios'], acts: acts('R'), pattern: 'course', diff: 1,
  cues: ['Très facile, pour s’échauffer ou récupérer.'], why: 'Volume facile.', src: 'Entraînement course classique' });
X('run-long', 'Sortie longue', '🏞️', { kind: 'run', group: 'jambes', needs: [], minLevel: 1, mode: 'time', sets: 1, secMin: 3600, secMax: 5400, rest: 0, flex: [2700, 7200],
  caps: cp('endurance_aerobie:1'), prim: ['quadriceps', 'mollets'], sec: ['ischios', 'grand_fessier'], acts: acts('R'), pattern: 'course', diff: 3,
  cues: ['Allure facile du début à la fin, hydratation.'], why: 'Développe l’endurance fondamentale.', src: 'Entraînement course classique' });
X('run-tempo', 'Course au seuil (tempo)', '🏃', { kind: 'run', group: 'jambes', needs: [], intensity: 'mod', mode: 'time', sets: 3, secMin: 480, secMax: 600, rest: 120,
  caps: cp('seuil:1 endurance_aerobie:.4'), prim: ['quadriceps', 'mollets'], sec: ['ischios'], acts: acts('R'), pattern: 'course', diff: 3,
  cues: ['Allure « confortablement difficile » : quelques mots seulement.'], why: 'Tenir une allure soutenue plus longtemps.', src: 'Entraînement course classique' });
X('run-intervals', 'Fractionné court 30/30', '⚡', { kind: 'run', group: 'jambes', needs: [], intensity: 'high', minLevel: 1, mode: 'time', sets: 10, secMin: 30, secMax: 30, rest: 30,
  caps: cp('vitesse:.8 seuil:.5'), prim: ['quadriceps', 'mollets', 'ischios'], sec: ['grand_fessier'], acts: acts('R'), pattern: 'course', diff: 3,
  cues: ['30 s rapide mais contrôlé, 30 s en trottinant.'], bad: ['Partir trop vite sur les premières.'], why: 'Vitesse et capacité à répéter.', src: 'Entraînement course classique' });
X('run-intervals-long', 'Fractionné long (3 min)', '⏱️', { kind: 'run', group: 'jambes', needs: [], intensity: 'high', minLevel: 1, mode: 'time', sets: 5, secMin: 180, secMax: 180, rest: 120,
  caps: cp('seuil:.9 vitesse:.4'), prim: ['quadriceps', 'mollets'], sec: ['ischios'], acts: acts('R'), pattern: 'course', diff: 3,
  cues: ['Allure soutenue régulière sur chaque répétition.'], why: 'Travail proche du seuil haut.', src: 'Entraînement course classique' });
X('run-hills', 'Côtes', '⛰️', { kind: 'run', group: 'jambes', needs: ['hill'], intensity: 'high', mode: 'time', sets: 6, secMin: 30, secMax: 60, rest: 90,
  caps: cp('force_jambes:.6 seuil:.5 explosivite:.3'), prim: ['quadriceps', 'grand_fessier', 'mollets'], sec: ['ischios'], acts: acts('R'), pattern: 'course', diff: 3,
  cues: ['Monte avec des foulées régulières, redescends en marchant ou trottinant.'], why: 'Force spécifique et puissance aérobie.', src: 'Entraînement course classique' });
X('run-strides', 'Lignes droites (accélérations)', '💨', { kind: 'run', group: 'jambes', needs: [], intensity: 'mod', mode: 'reps', sets: 6, repsMin: 1, repsMax: 1, unit: 'accélération 80 m', repSec: 20, rest: 60,
  caps: cp('vitesse:.7 technique_course:.5'), prim: ['quadriceps', 'ischios'], sec: ['mollets', 'grand_fessier'], acts: acts('R'), pattern: 'course', diff: 2,
  cues: ['Accélère progressivement jusqu’à 90 % de ta vitesse, relâché.'], why: 'Vitesse et relâchement sans fatigue excessive.', src: 'Entraînement course classique' });
X('run-drills', 'Éducatifs de course', '👟', { kind: 'run', group: 'jambes', needs: [], mode: 'time', sets: 4, secMin: 30, secMax: 30, rest: 30,
  caps: cp('technique_course:1 coordination:.4'), prim: ['flechisseurs_hanche', 'mollets'], sec: ['ischios', 'tibial'], acts: acts('R'), pattern: 'course', diff: 1,
  cues: ['Montées de genoux, talons-fesses, foulées bondissantes légères.'], why: 'Posture et économie de course.', src: 'Entraînement course classique' });

/* ───── Natation ───── */
X('swim-warm', 'Nage facile d’échauffement', '🏊', { kind: 'swim', group: 'epaules', needs: ['pool'], mode: 'time', sets: 1, secMin: 300, secMax: 600, rest: 0, flex: [180, 900],
  caps: cp('endurance_aerobie:.5 technique_nage:.3'), prim: ['grand_dorsal', 'deltoide_ant'], sec: ['triceps'], acts: acts('N'), pattern: 'nage', diff: 1,
  cues: ['Nage souple, alterne les nages si tu veux.'], why: 'Monter en température dans l’eau.', src: 'Entraînement natation classique' });
X('swim-drills', 'Éducatifs de crawl (rattrapé, point mort)', '🎯', { kind: 'swim', group: 'epaules', needs: ['pool'], mode: 'reps', sets: 6, repsMin: 1, repsMax: 1, unit: 'longueurs de 25 m', repSec: 40, rest: 20,
  caps: cp('technique_nage:1'), prim: ['grand_dorsal', 'deltoide_ant'], sec: ['grand_droit'], acts: acts('N'), pattern: 'nage', diff: 1,
  cues: ['Une main attend l’autre devant (rattrapé), allonge chaque mouvement.'], why: 'Améliore la glisse et le placement.', src: 'Entraînement natation classique' });
X('swim-kick', 'Battements avec planche', '🦵', { kind: 'swim', group: 'jambes', needs: ['pool', 'pullbuoy'], mode: 'reps', sets: 6, repsMin: 1, repsMax: 1, unit: 'longueurs de 25 m', repSec: 45, rest: 20,
  caps: cp('technique_nage:.4 endurance_aerobie:.4'), prim: ['quadriceps', 'flechisseurs_hanche'], sec: ['mollets', 'grand_droit'], acts: acts('N'), pattern: 'nage', diff: 1,
  cues: ['Battements depuis les hanches, chevilles souples.'], why: 'Jambes et position horizontale.', src: 'Entraînement natation classique' });
X('swim-pull', 'Bras seuls avec pull-buoy', '💪', { kind: 'swim', group: 'epaules', needs: ['pool', 'pullbuoy'], mode: 'reps', sets: 6, repsMin: 1, repsMax: 1, unit: 'longueurs de 50 m', repSec: 70, rest: 20,
  caps: cp('technique_nage:.6 tirage_horizontal:.4 endurance_aerobie:.4'), prim: ['grand_dorsal', 'triceps'], sec: ['deltoide_ant', 'deltoide_post'], acts: acts('N'), pattern: 'nage', diff: 2,
  cues: ['Pull-buoy entre les cuisses, traction longue jusqu’à la hanche.'], why: 'Force et technique de la traction aquatique.', src: 'Entraînement natation classique' });
X('swim-endurance', 'Nage continue', '🌊', { kind: 'swim', group: 'epaules', needs: ['pool'], intensity: 'mod', mode: 'time', sets: 1, secMin: 600, secMax: 1500, rest: 0, flex: [300, 2400],
  caps: cp('endurance_aerobie:1 technique_nage:.3'), prim: ['grand_dorsal'], sec: ['deltoide_ant', 'triceps', 'quadriceps'], acts: acts('N'), pattern: 'nage', diff: 2,
  cues: ['Allure régulière, respiration calée.'], why: 'Endurance dans l’eau.', src: 'Entraînement natation classique' });
X('swim-intervals', '50 m rapides', '⚡', { kind: 'swim', group: 'epaules', needs: ['pool'], intensity: 'high', minLevel: 1, mode: 'reps', sets: 8, repsMin: 1, repsMax: 1, unit: 'longueurs de 50 m', repSec: 55, rest: 30,
  caps: cp('vitesse:.9 seuil:.5'), prim: ['grand_dorsal', 'triceps'], sec: ['quadriceps', 'deltoide_ant'], acts: acts('N'), pattern: 'nage', diff: 3,
  cues: ['Rapide mais propre, récupération complète.'], why: 'Vitesse de nage.', src: 'Entraînement natation classique' });
X('swim-breathing', 'Respiration tous les 3 temps', '🌬️', { kind: 'swim', group: 'epaules', needs: ['pool'], mode: 'reps', sets: 4, repsMin: 1, repsMax: 1, unit: 'longueurs de 50 m', repSec: 75, rest: 20,
  caps: cp('technique_nage:.8 endurance_aerobie:.3'), prim: ['grand_dorsal'], sec: ['obliques'], acts: acts('N'), pattern: 'nage', diff: 1,
  cues: ['Respire alternativement à droite et à gauche, expire dans l’eau.'], why: 'Coordination respiratoire.', src: 'Entraînement natation classique' });

/* ───── Annotations des exercices historiques (escalade, renfo) ───── */
const ANN = {
  'dalle-pieds-silencieux': ['technique_pieds:1 equilibre:.4', ['mollets'], ['tibial', 'grand_droit'], 'BV', 'grimpe', 1],
  'dalle-precision': ['technique_pieds:1', ['mollets'], ['tibial'], 'BV', 'grimpe', 1],
  'dalle-equilibre-un-pied': ['equilibre:1 technique_pieds:.5', ['moyen_fessier', 'mollets'], ['grand_droit'], 'BV', 'grimpe', 2],
  'dalle-lente': ['technique_escalade:1 endurance_doigts:.4', ['avant_bras_flech'], ['grand_droit'], 'BV', 'grimpe', 1],
  'dalle-hanches': ['technique_escalade:1 mobilite_hanches:.4', ['obliques', 'moyen_fessier'], ['grand_droit'], 'BV', 'grimpe', 2],
  'dalle-transferts': ['technique_escalade:.8 equilibre:.6', ['quadriceps', 'grand_fessier'], ['mollets'], 'BV', 'grimpe', 1],
  'dalle-mobilite-hanches': ['mobilite_hanches:1', ['adducteurs'], ['grand_fessier'], 'BVC', 'mobilite', 1],
  'hang-active': ['force_doigts:.8 controle_scapulaire:.3', ['avant_bras_flech'], ['grand_dorsal', 'trapezes'], 'BV', 'suspension', 2],
  'hang-max': ['force_doigts:1', ['avant_bras_flech'], ['grand_dorsal'], 'BV', 'suspension', 4],
  'hang-repeaters': ['endurance_doigts:1 force_doigts:.5', ['avant_bras_flech'], ['grand_dorsal'], 'BV', 'suspension', 3],
  'wall-reglettes': ['force_doigts:.9 technique_escalade:.3', ['avant_bras_flech'], ['grand_dorsal', 'biceps'], 'B', 'grimpe', 3],
  'wall-traverse-reglettes': ['endurance_doigts:.8 force_doigts:.3', ['avant_bras_flech'], ['biceps'], 'BV', 'grimpe', 2],
  'finger-extensions': ['endurance_doigts:.2 stabilite_epaules:.1', ['avant_bras_ext'], [], 'BVC', 'prevention', 1],
  'wrist-extension': ['endurance_doigts:.2 stabilite_epaules:.1', ['avant_bras_ext'], ['avant_bras_flech'], 'BVCS', 'prevention', 1],
  'dev-power-blocs': ['puissance_haut:1 force_doigts:.5 gainage_anterieur:.4', ['grand_dorsal', 'avant_bras_flech'], ['biceps', 'grand_droit'], 'B', 'grimpe', 4],
  'dev-pieds-coupes': ['gainage_anterieur:.9 technique_escalade:.5', ['grand_droit', 'flechisseurs_hanche'], ['grand_dorsal'], 'B', 'grimpe', 3],
  'dev-talons': ['technique_escalade:.8 chaine_posterieure:.3', ['ischios'], ['grand_fessier'], 'B', 'grimpe', 2],
  pullup: ['tirage_vertical:1 blocage:.3', ['grand_dorsal', 'biceps'], ['trapezes', 'rhomboides', 'avant_bras_flech'], 'SCBV', 'traction', 2],
  'inverted-row': ['tirage_horizontal:1', ['rhomboides', 'grand_dorsal'], ['biceps', 'deltoide_post'], 'SCBV', 'rowing', 1],
  'pullup-heavy': ['tirage_vertical:1 blocage:.4', ['grand_dorsal', 'biceps'], ['avant_bras_flech', 'trapezes'], 'SCB', 'traction', 4],
  lockoff: ['blocage:1 tirage_vertical:.4', ['biceps', 'grand_dorsal'], ['avant_bras_flech'], 'CB', 'traction', 3],
  'knee-raise': ['gainage_anterieur:1 controle_scapulaire:.3', ['grand_droit', 'flechisseurs_hanche'], ['obliques', 'avant_bras_flech'], 'CBS', 'gainage', 2],
  'front-lever-tuck': ['controle_scapulaire:.8 gainage_anterieur:.7 tirage_vertical:.3', ['grand_dorsal', 'grand_droit'], ['biceps', 'trapezes'], 'CB', 'levier', 4],
  'hollow-hold': ['gainage_anterieur:1', ['grand_droit'], ['flechisseurs_hanche', 'obliques'], 'CBSVR', 'gainage', 1],
  'side-plank': ['gainage_lateral:1', ['obliques'], ['moyen_fessier'], 'CBSVR', 'gainage', 1],
  'dead-bug': ['gainage_anterieur:.8', ['grand_droit'], ['obliques', 'flechisseurs_hanche'], 'CBSVRN', 'gainage', 1],
  arc: ['endurance_doigts:.8 endurance_aerobie:.6 technique_escalade:.4', ['avant_bras_flech'], ['grand_dorsal'], 'BV', 'grimpe', 1],
  'four-by-four': ['endurance_doigts:1 puissance_haut:.3', ['avant_bras_flech', 'grand_dorsal'], ['biceps'], 'BV', 'grimpe', 3],
  'endurance-intervals': ['endurance_doigts:1', ['avant_bras_flech'], ['grand_dorsal'], 'VB', 'grimpe', 2],
  'endurance-circuit': ['endurance_aerobie:.6 tirage_vertical:.4 gainage_anterieur:.4', ['grand_dorsal', 'grand_droit'], ['quadriceps'], 'CBV', 'circuit', 2],
  'limit-boulders': ['force_doigts:.8 puissance_haut:.8 technique_escalade:.6', ['avant_bras_flech', 'grand_dorsal'], ['biceps', 'grand_droit'], 'B', 'grimpe', 5],
  'speed-known': ['coordination:.8 endurance_doigts:.3', ['quadriceps', 'grand_dorsal'], ['avant_bras_flech'], 'BV', 'grimpe', 2],
  dynos: ['coordination:1 puissance_haut:.7 explosivite:.5', ['grand_dorsal', 'quadriceps'], ['grand_droit', 'avant_bras_flech'], 'B', 'grimpe', 4],
  'jump-vertical': ['explosivite:1', ['quadriceps', 'grand_fessier'], ['mollets'], 'CSBR', 'saut', 2],
  'pushup-explosive': ['explosivite:.6 poussee_horizontale:.7', ['pectoraux', 'triceps'], ['deltoide_ant'], 'CS', 'poussee', 3],
  'explosive-pullup': ['puissance_haut:1 tirage_vertical:.6', ['grand_dorsal', 'biceps'], ['trapezes'], 'CB', 'traction', 4],
  'step-up-explosive': ['explosivite:.8 force_jambes:.5', ['quadriceps', 'grand_fessier'], ['mollets'], 'CSR', 'saut', 2],
  'skater-jumps': ['explosivite:.7 equilibre:.5', ['grand_fessier', 'moyen_fessier'], ['quadriceps', 'mollets'], 'CSR', 'saut', 2],
  'squat-loaded': ['force_jambes:1', ['quadriceps', 'grand_fessier'], ['adducteurs', 'lombaires'], 'SC', 'squat', 3],
  bulgarian: ['force_jambes:.9 equilibre:.4', ['quadriceps', 'grand_fessier'], ['adducteurs', 'moyen_fessier'], 'SCRB', 'fente', 3],
  rdl: ['chaine_posterieure:1', ['ischios', 'grand_fessier'], ['lombaires'], 'SCR', 'charniere', 3],
  'single-leg-rdl': ['chaine_posterieure:.7 equilibre:.6', ['ischios', 'grand_fessier'], ['moyen_fessier'], 'CRB', 'charniere', 2],
  'calf-raise': ['explosivite:.3 equilibre:.2', ['mollets'], ['tibial'], 'CRS', 'mollets', 1],
  cossack: ['mobilite_hanches:.8 force_jambes:.5', ['adducteurs', 'quadriceps'], ['grand_fessier'], 'CBR', 'squat', 2],
  'calf-iso': ['equilibre:.4', ['mollets'], [], 'CRB', 'mollets', 1],
  'glute-bridge': ['chaine_posterieure:.8', ['grand_fessier'], ['ischios'], 'CSRB', 'charniere', 1],
  pushup: ['poussee_horizontale:1 gainage_anterieur:.2', ['pectoraux', 'triceps'], ['deltoide_ant', 'grand_dentele'], 'SCBVN', 'poussee', 1],
  'pike-pushup': ['poussee_verticale:1', ['deltoide_ant', 'triceps'], ['grand_dentele', 'trapezes'], 'CB', 'poussee', 2],
  dips: ['poussee_horizontale:.6 poussee_verticale:.4', ['triceps', 'pectoraux'], ['deltoide_ant'], 'SCB', 'poussee', 3],
  'shoulder-press': ['poussee_verticale:1', ['deltoide_ant', 'triceps'], ['trapezes'], 'SCB', 'poussee', 2],
  'band-pull-apart': ['stabilite_epaules:.8 tirage_horizontal:.3', ['deltoide_post', 'rhomboides'], ['trapezes'], 'CBVSN', 'prevention', 1],
  'external-rotation': ['stabilite_epaules:1', ['coiffe'], ['deltoide_post'], 'CBVSN', 'prevention', 1],
  ytw: ['stabilite_epaules:.8 controle_scapulaire:.5', ['trapezes', 'deltoide_post'], ['rhomboides', 'coiffe'], 'CBVS', 'prevention', 1],
  'scap-pullup': ['controle_scapulaire:1 stabilite_epaules:.3', ['trapezes', 'grand_dorsal'], ['avant_bras_flech'], 'CBV', 'suspension', 1],
  'reverse-fly': ['stabilite_epaules:.7 tirage_horizontal:.3', ['deltoide_post', 'rhomboides'], ['trapezes'], 'SCB', 'prevention', 1],
  'wu-pulse': ['endurance_aerobie:.2', ['quadriceps'], ['mollets'], 'BVSCRN', 'echauffement', 1],
  'wu-mob-upper': ['mobilite_epaules:.6', ['deltoide_ant', 'trapezes'], ['rhomboides'], 'BVSCN', 'echauffement', 1],
  'wu-mob-lower': ['mobilite_hanches:.6', ['grand_fessier', 'adducteurs'], ['mollets'], 'BVSCR', 'echauffement', 1],
  'wu-wrists': ['force_doigts:.1', ['avant_bras_flech'], ['avant_bras_ext'], 'BVSC', 'echauffement', 1],
  'wu-scap-bar': ['controle_scapulaire:.4', ['trapezes'], ['grand_dorsal'], 'BVSC', 'echauffement', 1],
  'wu-scap-band': ['controle_scapulaire:.4 stabilite_epaules:.3', ['trapezes', 'deltoide_post'], ['rhomboides'], 'BVSCN', 'echauffement', 1],
  'wu-scap-floor': ['controle_scapulaire:.4 stabilite_epaules:.3', ['trapezes'], ['deltoide_post'], 'BVSC', 'echauffement', 1],
  'wu-core': ['gainage_anterieur:.3', ['grand_droit'], ['obliques'], 'BVSCR', 'echauffement', 1],
  'wu-climb': ['technique_escalade:.3', ['avant_bras_flech', 'grand_dorsal'], ['quadriceps'], 'BV', 'echauffement', 1],
  'wu-hang': ['force_doigts:.2', ['avant_bras_flech'], [], 'BV', 'echauffement', 1],
  'wu-jumps': ['explosivite:.2', ['mollets'], ['quadriceps'], 'BVSCR', 'echauffement', 1],
  'cd-forearm': ['mobilite_epaules:.1', ['avant_bras_flech'], [], 'BVSC', 'retour', 1],
  'cd-shoulders': ['mobilite_epaules:.3', ['pectoraux', 'deltoide_ant'], [], 'BVSCN', 'retour', 1],
  'cd-hips': ['mobilite_hanches:.3', ['grand_fessier'], ['flechisseurs_hanche'], 'BVSCR', 'retour', 1],
  'cd-breath': ['', [], [], 'BVSCRN', 'retour', 1],
};
for (const x of L) {
  const a = ANN[x.id];
  if (a) { x.caps = cp(a[0]); x.prim = a[1]; x.sec = a[2]; x.acts = acts(a[3]); x.pattern = a[4]; x.diff = a[5]; }
  x.caps ||= {}; x.prim ||= []; x.sec ||= []; x.acts ||= []; x.pattern ||= ''; x.diff ||= (x.minLevel || 0) + 1;
}

export const LIBRARY = L;
export const LIB_BY_ID = new Map(L.map((x) => [x.id, x]));
export const byId = (id) => LIB_BY_ID.get(id) || null;
