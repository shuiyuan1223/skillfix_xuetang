/**
 * State Directory Migration
 *
 * Migrates .pha/ directory from legacy layout to v2 layout:
 * - data/pha.db → .pha/db/evolution.db
 * - .pha/users.db → .pha/db/oauth.db
 * - .pha/system-agent/ → .pha/users/system/
 * - Deletes: memory.db, vectors/, api-cache/ (global), huawei-tokens.json, garbage files
 */

import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "fs";
import { join } from "path";
import { getStateDir, findProjectRoot } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("Migration");

export function migrateStateDir(): void {
  const stateDir = getStateDir();
  const marker = join(stateDir, ".migrated-v2");

  if (existsSync(marker)) return;

  log.info("Running .pha/ directory migration to v2 layout...");

  // 1. Create db/ directory
  const dbDir = join(stateDir, "db");
  mkdirSync(dbDir, { recursive: true });

  // 2. Move data/pha.db → .pha/db/evolution.db
  const projectRoot = findProjectRoot();
  const oldEvolutionDb = join(projectRoot, "data", "pha.db");
  const newEvolutionDb = join(dbDir, "evolution.db");
  if (existsSync(oldEvolutionDb) && !existsSync(newEvolutionDb)) {
    try {
      renameSync(oldEvolutionDb, newEvolutionDb);
      // Also move WAL/SHM files if they exist
      for (const ext of ["-wal", "-shm"]) {
        const walFile = oldEvolutionDb + ext;
        if (existsSync(walFile)) {
          renameSync(walFile, newEvolutionDb + ext);
        }
      }
      log.info("Moved data/pha.db → .pha/db/evolution.db");
    } catch (err) {
      log.warn("Failed to move data/pha.db", { error: err });
    }
  }

  // 3. Move users.db → db/oauth.db
  const oldUsersDb = join(stateDir, "users.db");
  const newOauthDb = join(dbDir, "oauth.db");
  if (existsSync(oldUsersDb) && !existsSync(newOauthDb)) {
    try {
      renameSync(oldUsersDb, newOauthDb);
      for (const ext of ["-wal", "-shm"]) {
        const walFile = oldUsersDb + ext;
        if (existsSync(walFile)) {
          renameSync(walFile, newOauthDb + ext);
        }
      }
      log.info("Moved users.db → db/oauth.db");
    } catch (err) {
      log.warn("Failed to move users.db", { error: err });
    }
  }

  // 4. Delete memory.db (redundant — only had empty preferences)
  for (const file of ["memory.db", "memory.db-wal", "memory.db-shm"]) {
    const path = join(stateDir, file);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
        log.info(`Deleted ${file}`);
      } catch (err) {
        log.warn(`Failed to delete ${file}`, { error: err });
      }
    }
  }

  // 5. Delete vectors/ (deprecated, replaced by per-user memory-index.db)
  const vectorsDir = join(stateDir, "vectors");
  if (existsSync(vectorsDir)) {
    try {
      rmSync(vectorsDir, { recursive: true, force: true });
      log.info("Deleted vectors/");
    } catch (err) {
      log.warn("Failed to delete vectors/", { error: err });
    }
  }

  // 6. Move system-agent/ → users/system/
  const oldSystemAgent = join(stateDir, "system-agent");
  const newSystemAgent = join(stateDir, "users", "system");
  if (existsSync(oldSystemAgent) && !existsSync(newSystemAgent)) {
    try {
      mkdirSync(join(stateDir, "users"), { recursive: true });
      renameSync(oldSystemAgent, newSystemAgent);
      log.info("Moved system-agent/ → users/system/");
    } catch (err) {
      log.warn("Failed to move system-agent/", { error: err });
    }
  }

  // 7. Delete global api-cache/ (historical data, now per-user)
  const globalApiCache = join(stateDir, "api-cache");
  if (existsSync(globalApiCache)) {
    try {
      rmSync(globalApiCache, { recursive: true, force: true });
      log.info("Deleted global api-cache/");
    } catch (err) {
      log.warn("Failed to delete api-cache/", { error: err });
    }
  }

  // 8. Delete huawei-tokens.json (now in db/oauth.db)
  const oldTokenFile = join(stateDir, "huawei-tokens.json");
  if (existsSync(oldTokenFile)) {
    try {
      unlinkSync(oldTokenFile);
      log.info("Deleted huawei-tokens.json");
    } catch (err) {
      log.warn("Failed to delete huawei-tokens.json", { error: err });
    }
  }

  // 9. Delete garbage files
  const garbageFiles = ["playground-state.json"];
  for (const file of garbageFiles) {
    const path = join(stateDir, file);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
        log.info(`Deleted ${file}`);
      } catch (err) {
        log.warn(`Failed to delete ${file}`, { error: err });
      }
    }
  }

  const garbageDirs = ["screenshots", "ui-audit"];
  for (const dir of garbageDirs) {
    const path = join(stateDir, dir);
    if (existsSync(path)) {
      try {
        rmSync(path, { recursive: true, force: true });
        log.info(`Deleted ${dir}/`);
      } catch (err) {
        log.warn(`Failed to delete ${dir}/`, { error: err });
      }
    }
  }

  // 10. Clean up test garbage directories under users/
  const usersDir = join(stateDir, "users");
  if (existsSync(usersDir)) {
    try {
      const entries = readdirSync(usersDir);
      for (const entry of entries) {
        const entryPath = join(usersDir, entry);
        const stat = statSync(entryPath);
        if (!stat.isDirectory()) continue;

        // Remove test/garbage user dirs (but keep benchmark-*, system, and real user IDs)
        if (
          entry === "anonymous" ||
          entry === "test-user" ||
          entry === "undefined" ||
          entry === "null"
        ) {
          rmSync(entryPath, { recursive: true, force: true });
          log.info(`Deleted garbage user dir: users/${entry}/`);
        }
      }
    } catch (err) {
      log.warn("Failed to clean up users/", { error: err });
    }
  }

  // 11. Remove empty data/ directory if it was left behind
  const dataDir = join(projectRoot, "data");
  if (existsSync(dataDir)) {
    try {
      const files = readdirSync(dataDir);
      if (files.length === 0) {
        rmSync(dataDir, { recursive: true, force: true });
        log.info("Deleted empty data/ directory");
      }
    } catch {
      // Ignore — not critical
    }
  }

  // Write migration marker
  writeFileSync(marker, `migrated at ${new Date().toISOString()}\n`);
  log.info(".pha/ directory migration complete");
}
