/**
 * Memory SQLite Schema
 * Multi-tenant memory storage for PHA
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

export interface SchemaResult {
  ftsAvailable: boolean;
  ftsError?: string;
  vecAvailable: boolean;
  vecError?: string;
}

export function ensureMemorySchema(db: Database): SchemaResult {
  // Users table (profile_json removed — file is source of truth)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      preferences_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Migrate: drop profile_json column if it exists (SQLite ignores extra columns gracefully)
  // We just stop reading/writing it — no ALTER TABLE needed.

  // Files table (per-user isolation)
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      uuid TEXT NOT NULL,
      path TEXT NOT NULL,
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      PRIMARY KEY (uuid, path)
    )
  `);

  // Chunks table (per-user isolation)
  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      uuid TEXT NOT NULL,
      path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_uuid ON chunks(uuid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_uuid_path ON chunks(uuid, path)`);

  // Embedding cache (global shared)
  db.run(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      dims INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (provider, model, hash)
    )
  `);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_embedding_cache_updated_at ON embedding_cache(updated_at)`
  );

  // FTS5 for full-text search
  let ftsAvailable = false;
  let ftsError: string | undefined;
  try {
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        id UNINDEXED,
        uuid UNINDEXED,
        path UNINDEXED,
        model UNINDEXED,
        start_line UNINDEXED,
        end_line UNINDEXED
      )
    `);
    ftsAvailable = true;
  } catch (err) {
    ftsError = err instanceof Error ? err.message : String(err);
    console.warn("FTS5 unavailable:", ftsError);
  }

  // sqlite-vec for vector search
  let vecAvailable = false;
  let vecError: string | undefined;
  try {
    // Load sqlite-vec extension

    const sqliteVec = require("sqlite-vec");
    sqliteVec.load(db);

    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id text PRIMARY KEY,
        embedding float[1536] distance_metric=cosine,
        uuid text partition key,
        +path text,
        +start_line integer,
        +end_line integer
      )
    `);
    vecAvailable = true;
  } catch (err) {
    vecError = err instanceof Error ? err.message : String(err);
    console.warn("sqlite-vec unavailable:", vecError);
  }

  return { ftsAvailable, ftsError, vecAvailable, vecError };
}

export function openMemoryDatabase(dbPath: string): Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return new Database(dbPath);
}
