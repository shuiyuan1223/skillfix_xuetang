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

const GARBAGE_USER_DIRS = new Set(["anonymous", "test-user", "undefined", "null"]);

/** Move a SQLite DB file (with optional WAL/SHM companions) */
function moveDbFile(oldPath: string, newPath: string, label: string): void {
  if (!existsSync(oldPath) || existsSync(newPath)) return;
  try {
    renameSync(oldPath, newPath);
    for (const ext of ["-wal", "-shm"]) {
      const walFile = oldPath + ext;
      if (existsSync(walFile)) {
        renameSync(walFile, newPath + ext);
      }
    }
    log.info(`Moved ${label}`);
  } catch (err) {
    log.warn(`Failed to move ${label}`, { error: err });
  }
}

/** Safely delete a single file */
function safeUnlink(filePath: string, label: string): void {
  if (!existsSync(filePath)) return;
  try {
    unlinkSync(filePath);
    log.info(`Deleted ${label}`);
  } catch (err) {
    log.warn(`Failed to delete ${label}`, { error: err });
  }
}

/** Safely delete a directory recursively */
function safeRmDir(dirPath: string, label: string): void {
  if (!existsSync(dirPath)) return;
  try {
    rmSync(dirPath, { recursive: true, force: true });
    log.info(`Deleted ${label}`);
  } catch (err) {
    log.warn(`Failed to delete ${label}`, { error: err });
  }
}

/** Clean up test/garbage user directories */
function cleanupGarbageUserDirs(usersDir: string): void {
  if (!existsSync(usersDir)) return;
  try {
    for (const entry of readdirSync(usersDir)) {
      if (!GARBAGE_USER_DIRS.has(entry)) continue;
      const entryPath = join(usersDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      rmSync(entryPath, { recursive: true, force: true });
      log.info(`Deleted garbage user dir: users/${entry}/`);
    }
  } catch (err) {
    log.warn("Failed to clean up users/", { error: err });
  }
}

/** Remove data/ directory if empty */
function removeEmptyDataDir(projectRoot: string): void {
  const dataDir = join(projectRoot, "data");
  if (!existsSync(dataDir)) return;
  try {
    if (readdirSync(dataDir).length === 0) {
      rmSync(dataDir, { recursive: true, force: true });
      log.info("Deleted empty data/ directory");
    }
  } catch {
    // Ignore — not critical
  }
}

export function migrateStateDir(): void {
  const stateDir = getStateDir();
  const marker = join(stateDir, ".migrated-v2");
  if (existsSync(marker)) return;

  log.info("Running .pha/ directory migration to v2 layout...");

  const dbDir = join(stateDir, "db");
  mkdirSync(dbDir, { recursive: true });

  const projectRoot = findProjectRoot();

  // Move databases
  moveDbFile(join(projectRoot, "data", "pha.db"), join(dbDir, "evolution.db"),
    "data/pha.db → .pha/db/evolution.db");
  moveDbFile(join(stateDir, "users.db"), join(dbDir, "oauth.db"),
    "users.db → db/oauth.db");

  // Delete redundant files
  for (const f of ["memory.db", "memory.db-wal", "memory.db-shm"]) {
    safeUnlink(join(stateDir, f), f);
  }
  safeRmDir(join(stateDir, "vectors"), "vectors/");

  // Move system-agent → users/system
  const oldSA = join(stateDir, "system-agent");
  const newSA = join(stateDir, "users", "system");
  if (existsSync(oldSA) && !existsSync(newSA)) {
    try {
      mkdirSync(join(stateDir, "users"), { recursive: true });
      renameSync(oldSA, newSA);
      log.info("Moved system-agent/ → users/system/");
    } catch (err) {
      log.warn("Failed to move system-agent/", { error: err });
    }
  }

  // Delete deprecated files and dirs
  safeRmDir(join(stateDir, "api-cache"), "global api-cache/");
  safeUnlink(join(stateDir, "huawei-tokens.json"), "huawei-tokens.json");
  for (const f of ["playground-state.json"]) {
    safeUnlink(join(stateDir, f), f);
  }
  for (const d of ["screenshots", "ui-audit"]) {
    safeRmDir(join(stateDir, d), `${d}/`);
  }

  // Clean up garbage user dirs and empty data/
  cleanupGarbageUserDirs(join(stateDir, "users"));
  removeEmptyDataDir(projectRoot);

  writeFileSync(marker, `migrated at ${new Date().toISOString()}\n`);
  log.info(".pha/ directory migration complete");
}
