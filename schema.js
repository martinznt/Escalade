// schema.js — tables D1. Le worker les crée / complète tout seul au premier appel (CREATE TABLE IF NOT EXISTS
// + migrations idempotentes de worker.js upgradeSchema) : aucune commande à lancer, compatible avec la base existante.
// Aucune table existante n'est supprimée ; les colonnes ajoutées ont des valeurs par défaut.
export const SCHEMA_VERSION = 8;
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
];
// Colonnes ajoutées aux tables existantes (migration idempotente : ajoutées seulement si absentes).
export const ADD_COLUMNS = [
  ['users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'admin_since', 'INTEGER'],
  ['user_data', 'v2_migrated', 'INTEGER NOT NULL DEFAULT 0'],
  ['profiles', 'bio', "TEXT NOT NULL DEFAULT ''"],
  ['profiles', 'share_json', "TEXT NOT NULL DEFAULT '{}'"],
];
