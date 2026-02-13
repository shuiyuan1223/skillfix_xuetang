/**
 * Memory SQLite Schema
 * Shared database for user metadata only.
 * Chunk storage/search is handled by OpenClaw's MemoryIndexManager (per-user memory-index.db).
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// macOS: Apple's bundled SQLite blocks extensions.
// Use Homebrew's SQLite which has extensions enabled.
if (process.platform === "darwin") {
  const paths = [
    "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib", // Apple Silicon
    "/usr/local/opt/sqlite3/lib/libsqlite3.dylib", // Intel
  ];
  const found = paths.find((p) => existsSync(p));
  if (found) {
    try {
      Database.setCustomSQLite(found);
    } catch {
      // Already loaded — safe to ignore (e.g. multiple imports in test)
    }
  }
}

export function ensureMemorySchema(db: Database): void {
  // Users table (profile data lives in PROFILE.md files, not here)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      preferences_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
}

export function openMemoryDatabase(dbPath: string): Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return new Database(dbPath);
}
