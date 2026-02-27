/**
 * sqlite-vec Extension Loader (adapted for PHA/bun:sqlite)
 */

import type { DatabaseSyncType } from './compat.js';

export async function loadSqliteVecExtension(params: {
  db: DatabaseSyncType;
  extensionPath?: string;
}): Promise<{ ok: boolean; extensionPath?: string; error?: string }> {
  try {
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(params.db);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
