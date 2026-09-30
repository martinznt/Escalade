// schema.js — tables D1. Le worker les crée / complète tout seul au premier appel (CREATE TABLE IF NOT EXISTS
// + migrations idempotentes de worker.js upgradeSchema) : aucune commande à lancer, compatible avec la base existante.
// Aucune table existante n'est supprimée ; les colonnes ajoutées ont des valeurs par défaut.
export const SCHEMA_VERSION = 10;
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
  "CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY, seances_json TEXT NOT NULL DEFAULT '[]', settings_json TEXT NOT NULL DEFAULT '{}', favorites_json TEXT NOT NULL DEFAULT '[]', goals_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_date TEXT NOT NULL, session_id TEXT, title TEXT, completed INTEGER NOT NULL DEFAULT 0, recurrence_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_calendar_user_date ON calendar_events(user_id,event_date)",
  "CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT, session_name TEXT NOT NULL, started_at INTEGER NOT NULL, duration_seconds INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_history_user_date ON history(user_id,started_at)",
  "CREATE TABLE IF NOT EXISTS common_exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, data_json TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL)",
  "CREATE TABLE IF NOT EXISTS user_exercises (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(user_id,name), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  // Rappels d'entraînement (notifications) : un abonnement par appareil.
  "CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, days TEXT NOT NULL DEFAULT '[]', hour TEXT NOT NULL DEFAULT '18:00', tz TEXT NOT NULL DEFAULT 'Europe/Paris', last_day TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id)",
  "CREATE TABLE IF NOT EXISTS duo_rooms (code TEXT PRIMARY KEY, owner_id TEXT NOT NULL, members_json TEXT NOT NULL, session_json TEXT NOT NULL, state_json TEXT NOT NULL, v INTEGER NOT NULL DEFAULT 1, by_id TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_duo_exp ON duo_rooms(expires_at)",
  "CREATE TABLE IF NOT EXISTS global_content (kind TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, updated_by TEXT, PRIMARY KEY(kind, id))",
  // Intentions communes (ajoutées par un administrateur, visibles par tous) et propositions des utilisateurs.
  "CREATE TABLE IF NOT EXISTS community_intents (id TEXT PRIMARY KEY, activity TEXT NOT NULL DEFAULT '', label TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '', caps_json TEXT NOT NULL DEFAULT '{}', created_by TEXT, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, activity TEXT NOT NULL DEFAULT '', label TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'open', reply TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, reviewed_by TEXT, reviewed_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status,created_at)",
  // Communauté : le profil est privé tant que la personne ne choisit pas de partager.
  "CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, visibility TEXT NOT NULL DEFAULT 'private', share_stats INTEGER NOT NULL DEFAULT 1, share_records INTEGER NOT NULL DEFAULT 1, share_sessions INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS follows (id TEXT PRIMARY KEY, follower_id TEXT NOT NULL, followee_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(follower_id,followee_id), FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE)",
  // ── V2 ──
  // Données personnelles structurées (profil, performances, objectifs, cotations, styles, matériel…), fusion élément par élément.
  "CREATE TABLE IF NOT EXISTS user_items (user_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL, server_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,collection,id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_items_sync ON user_items(user_id,server_at)",
  // Séances partagées : scope 'common' (bibliothèque commune) ou 'public' (profil public). owner_id NULL = compte supprimé.
  "CREATE TABLE IF NOT EXISTS shared_sessions (id TEXT PRIMARY KEY, owner_id TEXT, scope TEXT NOT NULL, title TEXT NOT NULL, activity TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL, level_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL)",
  "CREATE INDEX IF NOT EXISTS idx_shared_scope ON shared_sessions(scope,updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_shared_owner ON shared_sessions(owner_id)",
  // Signalements de bugs (lisibles par l'auteur et par les administrateurs).
  "CREATE TABLE IF NOT EXISTS bug_reports (id TEXT PRIMARY KEY, user_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL, page TEXT NOT NULL DEFAULT '', app_version TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_bugs_status ON bug_reports(status,created_at)",
  // Idempotence : une opération (en-tête X-Op-Id) rejouée renvoie la réponse déjà produite, sans doublon.
  "CREATE TABLE IF NOT EXISTS op_log (user_id TEXT NOT NULL, op_id TEXT NOT NULL, status INTEGER NOT NULL DEFAULT 0, response_json TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY(user_id,op_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)",
  // ── V1 Studio d'administration ── contenu commun modifié par lots : brouillon → vérifications → publication → retour
  // arrière possible. Chaque élément garde ses versions ; chaque action est journalisée (qui, quoi, quand, avant/après).
  // Rien de personnel ni de secret n'y est écrit : seulement le contenu commun (exercices, séances prêtes, textes…).
  "CREATE TABLE IF NOT EXISTS change_sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'admin', status TEXT NOT NULL DEFAULT 'draft', author_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER, published_by TEXT, rolled_back_at INTEGER, rolled_back_by TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_change_sets_status ON change_sets(status,updated_at)",
  "CREATE TABLE IF NOT EXISTS change_items (id TEXT PRIMARY KEY, change_set_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT NOT NULL, op TEXT NOT NULL DEFAULT 'put', data_json TEXT NOT NULL DEFAULT '{}', before_json TEXT, position INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(change_set_id) REFERENCES change_sets(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_change_items_set ON change_items(change_set_id,position)",
  "CREATE TABLE IF NOT EXISTS content_versions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL, data_json TEXT, hidden INTEGER NOT NULL DEFAULT 0, change_set_id TEXT, created_at INTEGER NOT NULL, created_by TEXT, UNIQUE(kind,item_id,version))",
  "CREATE TABLE IF NOT EXISTS test_results (id TEXT PRIMARY KEY, change_set_id TEXT NOT NULL, ok INTEGER NOT NULL, checks_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, created_by TEXT)",
  "CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, change_set_id TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, created_by TEXT)",
  "CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, actor_id TEXT, action TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', change_set_id TEXT, before_json TEXT, after_json TEXT, checks_json TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at)",
  // V2 : propositions de code (diff, impact, tests déclarés, validation). JAMAIS appliquées ni déployées par l'app.
  "CREATE TABLE IF NOT EXISTS code_proposals (id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', diff TEXT NOT NULL DEFAULT '', impact_json TEXT NOT NULL DEFAULT '{}', tests TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', author_id TEXT, reviewer_id TEXT, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, reviewed_at INTEGER)",
];
// Colonnes ajoutées aux tables existantes (migration idempotente : ajoutées seulement si absentes).
export const ADD_COLUMNS = [
  ['users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'admin_since', 'INTEGER'],
  ['users', 'last_seen', 'INTEGER'], // dernière visite (compte connecté), pour la liste des comptes de l'admin
  // V2 : rôles d'administration (liste séparée par des virgules). Vide = super-administrateur (compatibilité : tout admin existant).
  ['users', 'admin_roles', "TEXT NOT NULL DEFAULT ''"],
  ['user_data', 'v2_migrated', 'INTEGER NOT NULL DEFAULT 0'],
  ['profiles', 'bio', "TEXT NOT NULL DEFAULT ''"],
  ['profiles', 'share_json', "TEXT NOT NULL DEFAULT '{}'"],
  // Notifications : types choisis par appareil, message en attente, mode silencieux.
  ['push_subs', 'types', "TEXT NOT NULL DEFAULT '[\"reminder\",\"update\",\"reply\",\"admin\"]'"],
  ['push_subs', 'pending', "TEXT NOT NULL DEFAULT ''"],
  ['push_subs', 'silent', 'INTEGER NOT NULL DEFAULT 0'],
];
