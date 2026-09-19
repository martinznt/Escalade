CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY, seances_json TEXT NOT NULL DEFAULT '[]', settings_json TEXT NOT NULL DEFAULT '{}', favorites_json TEXT NOT NULL DEFAULT '[]', goals_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS calendar_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_date TEXT NOT NULL, session_id TEXT, title TEXT, completed INTEGER NOT NULL DEFAULT 0, recurrence_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_calendar_user_date ON calendar_events(user_id,event_date);
CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT, session_name TEXT NOT NULL, started_at INTEGER NOT NULL, duration_seconds INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL DEFAULT '{}', FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_history_user_date ON history(user_id,started_at);
CREATE TABLE IF NOT EXISTS common_exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, data_json TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS user_exercises (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, data_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(user_id,name), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
