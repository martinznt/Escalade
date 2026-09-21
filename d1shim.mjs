// Petit « faux D1 » basé sur SQLite (node:sqlite) pour tester le worker sans Cloudflare.
import { DatabaseSync } from 'node:sqlite';

export function makeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) { return new Stmt(this.sql, a.map((x) => (x === undefined ? null : x))); }
    first() { const r = sqlite.prepare(this.sql).get(...this.args); return Promise.resolve(r ? { ...r } : null); }
    all() { return Promise.resolve({ results: sqlite.prepare(this.sql).all(...this.args).map((r) => ({ ...r })), success: true }); }
    run() { const r = sqlite.prepare(this.sql).run(...this.args); return Promise.resolve({ success: true, meta: { changes: Number(r.changes) } }); }
    _runSync() { const r = sqlite.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  }
  return {
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try { const out = stmts.map((s) => s._runSync()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
    raw: sqlite,
  };
}
