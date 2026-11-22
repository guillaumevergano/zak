import { join } from 'node:path'
import Database from 'better-sqlite3'

export type Db = Database.Database

/**
 * Schema migrations (CLAUDE.md §5), applied in order and tracked with `PRAGMA user_version`.
 * Only append: never edit a migration that has shipped.
 */
const MIGRATIONS: string[] = [
  // 1 — sidebar favorites. `favicon` is ours (not in §5): tiles without an emoji show it.
  `CREATE TABLE folders (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT,
     position INTEGER NOT NULL, collapsed INTEGER DEFAULT 0, created_at INTEGER
   );
   CREATE TABLE favorites (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
     emoji TEXT, favicon TEXT,
     folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
     position INTEGER NOT NULL, created_at INTEGER
   );`,
  // 2 — Étape 6: history (one row per URL; `favicon` is ours), session restore, per-site zoom and
  // permissions. The url index is unique so a visit is an upsert.
  `CREATE TABLE history (
     id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT, favicon TEXT,
     visited_at INTEGER NOT NULL, visit_count INTEGER DEFAULT 1
   );
   CREATE UNIQUE INDEX history_url ON history(url);
   CREATE INDEX history_visited_at ON history(visited_at);
   CREATE TABLE tab_sessions (
     window_id TEXT, tab_index INTEGER, url TEXT, title TEXT, pinned INTEGER, active INTEGER
   );
   CREATE TABLE site_zoom (host TEXT PRIMARY KEY, level REAL NOT NULL);
   CREATE TABLE site_permissions (
     origin TEXT NOT NULL, permission TEXT NOT NULL, granted INTEGER NOT NULL,
     PRIMARY KEY (origin, permission)
   );`,
  // 3 — saved passwords (encrypted with the OS keychain: safeStorage), and sites never to save for.
  `CREATE TABLE passwords (
     id TEXT PRIMARY KEY, origin TEXT NOT NULL, username TEXT NOT NULL, password BLOB NOT NULL,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, used_at INTEGER
   );
   CREATE UNIQUE INDEX passwords_login ON passwords(origin, username);
   CREATE TABLE password_never (origin TEXT PRIMARY KEY);`,
  // 4 — tab groups in the saved session.
  `ALTER TABLE tab_sessions ADD COLUMN group_id TEXT;
   ALTER TABLE tab_sessions ADD COLUMN group_name TEXT;
   ALTER TABLE tab_sessions ADD COLUMN group_color TEXT;
   ALTER TABLE tab_sessions ADD COLUMN group_collapsed INTEGER;`,
  // 5 — split views (two tabs side by side) in the saved session.
  `ALTER TABLE tab_sessions ADD COLUMN split_id TEXT;
   ALTER TABLE tab_sessions ADD COLUMN split_ratio REAL;`
]

export function openDatabase(dir: string): Db {
  const db = new Database(join(dir, 'zak.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

/** In-memory database for unit tests. */
export function openMemoryDatabase(): Db {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
