/**
 * Tests for State Directory Migration
 *
 * Tests migrateStateDir with a temporary directory structure.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "fs";
import { join } from "path";

describe("migrateStateDir", () => {
  let tmpDir: string;
  let origEnv: string | undefined;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = join(import.meta.dir, ".tmp-state-migration-test");
    // Create a fake project root with package.json
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, "package.json"), "{}");
    // Create the .pha directory
    mkdirSync(join(tmpDir, ".pha"), { recursive: true });
    origEnv = process.env.PHA_STATE_DIR;
    process.env.PHA_STATE_DIR = join(tmpDir, ".pha");
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    if (origEnv !== undefined) {
      process.env.PHA_STATE_DIR = origEnv;
    } else {
      delete process.env.PHA_STATE_DIR;
    }
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("creates db/ directory", async () => {
    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();
    expect(existsSync(join(tmpDir, ".pha", "db"))).toBe(true);
  });

  test("writes migration marker", async () => {
    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();
    const marker = join(tmpDir, ".pha", ".migrated-v2");
    expect(existsSync(marker)).toBe(true);
    const content = readFileSync(marker, "utf-8");
    expect(content).toContain("migrated at");
  });

  test("skips if already migrated", async () => {
    const marker = join(tmpDir, ".pha", ".migrated-v2");
    writeFileSync(marker, "already done");
    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    // Should not throw or error
    migrateStateDir();
    expect(readFileSync(marker, "utf-8")).toBe("already done");
  });

  test("deletes memory.db files", async () => {
    const stateDir = join(tmpDir, ".pha");
    writeFileSync(join(stateDir, "memory.db"), "fake");
    writeFileSync(join(stateDir, "memory.db-wal"), "fake");
    writeFileSync(join(stateDir, "memory.db-shm"), "fake");

    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();

    expect(existsSync(join(stateDir, "memory.db"))).toBe(false);
    expect(existsSync(join(stateDir, "memory.db-wal"))).toBe(false);
    expect(existsSync(join(stateDir, "memory.db-shm"))).toBe(false);
  });

  test("deletes vectors/ directory", async () => {
    const stateDir = join(tmpDir, ".pha");
    mkdirSync(join(stateDir, "vectors"), { recursive: true });
    writeFileSync(join(stateDir, "vectors", "index.bin"), "fake");

    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();

    expect(existsSync(join(stateDir, "vectors"))).toBe(false);
  });

  test("deletes huawei-tokens.json", async () => {
    const stateDir = join(tmpDir, ".pha");
    writeFileSync(join(stateDir, "huawei-tokens.json"), "{}");

    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();

    expect(existsSync(join(stateDir, "huawei-tokens.json"))).toBe(false);
  });

  test("deletes garbage user directories", async () => {
    const usersDir = join(tmpDir, ".pha", "users");
    mkdirSync(join(usersDir, "anonymous"), { recursive: true });
    mkdirSync(join(usersDir, "test-user"), { recursive: true });
    mkdirSync(join(usersDir, "undefined"), { recursive: true });
    mkdirSync(join(usersDir, "null"), { recursive: true });
    mkdirSync(join(usersDir, "real-user-id"), { recursive: true });

    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();

    expect(existsSync(join(usersDir, "anonymous"))).toBe(false);
    expect(existsSync(join(usersDir, "test-user"))).toBe(false);
    expect(existsSync(join(usersDir, "undefined"))).toBe(false);
    expect(existsSync(join(usersDir, "null"))).toBe(false);
    // Real user dirs should be preserved
    expect(existsSync(join(usersDir, "real-user-id"))).toBe(true);
  });

  test("moves system-agent/ to users/system/", async () => {
    const stateDir = join(tmpDir, ".pha");
    mkdirSync(join(stateDir, "system-agent"), { recursive: true });
    writeFileSync(join(stateDir, "system-agent", "memory.md"), "# memory");

    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();

    expect(existsSync(join(stateDir, "system-agent"))).toBe(false);
    expect(existsSync(join(stateDir, "users", "system"))).toBe(true);
    expect(readFileSync(join(stateDir, "users", "system", "memory.md"), "utf-8")).toBe("# memory");
  });

  test("deletes garbage files and dirs", async () => {
    const stateDir = join(tmpDir, ".pha");
    writeFileSync(join(stateDir, "playground-state.json"), "{}");
    mkdirSync(join(stateDir, "screenshots"), { recursive: true });
    mkdirSync(join(stateDir, "ui-audit"), { recursive: true });

    const { migrateStateDir } = await import("../../src/utils/state-migration.js");
    migrateStateDir();

    expect(existsSync(join(stateDir, "playground-state.json"))).toBe(false);
    expect(existsSync(join(stateDir, "screenshots"))).toBe(false);
    expect(existsSync(join(stateDir, "ui-audit"))).toBe(false);
  });
});
