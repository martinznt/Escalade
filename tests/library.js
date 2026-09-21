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

export const LIBRARY = L;
export const byId = (id) => L.find((x) => x.id === id) || null;
