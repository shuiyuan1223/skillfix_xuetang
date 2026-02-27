/**
 * SQLite Compatibility Patch
 *
 * macOS: Apple's bundled SQLite blocks extensions.
 * Use Homebrew's SQLite which has extensions enabled.
 * This module is imported for its side-effect only.
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';

if (process.platform === 'darwin') {
  const paths = [
    '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib', // Apple Silicon
    '/usr/local/opt/sqlite3/lib/libsqlite3.dylib', // Intel
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
