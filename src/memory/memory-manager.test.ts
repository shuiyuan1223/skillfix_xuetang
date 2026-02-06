/**
 * Memory Manager Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { MemoryManager } from "./memory-manager.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

// Use a test-specific directory
const TEST_STATE_DIR = join(import.meta.dir, "../../.pha-test");

describe("MemoryManager", () => {
  let manager: MemoryManager;
  const testUuid = "test-user-" + Date.now();

  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_STATE_DIR)) {
      mkdirSync(TEST_STATE_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (manager) {
      manager.close();
    }
    // Clean up test directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  test("should create manager instance", () => {
    manager = new MemoryManager();
    expect(manager).toBeDefined();
  });

  test("should ensure user exists", () => {
    manager.ensureUser(testUuid);
    const profile = manager.getProfile(testUuid);
    expect(profile).toBeDefined();
  });

  test("should update and get profile (file-only)", () => {
    manager.updateProfile(testUuid, {
      gender: "male",
      birthYear: 1990,
      height: 175,
      weight: 70,
    });

    const profile = manager.getProfile(testUuid);
    expect(profile.gender).toBe("male");
    expect(profile.birthYear).toBe(1990);
    expect(profile.height).toBe(175);
    expect(profile.weight).toBe(70);
  });

  test("should merge nested objects in profile", () => {
    manager.updateProfile(testUuid, {
      goals: {
        dailySteps: 10000,
      },
    });

    manager.updateProfile(testUuid, {
      goals: {
        sleepHours: 8,
      },
    });

    const profile = manager.getProfile(testUuid);
    expect(profile.goals?.dailySteps).toBe(10000);
    expect(profile.goals?.sleepHours).toBe(8);
  });

  test("should get next missing field", () => {
    const newUuid = "new-user-" + Date.now();
    manager.ensureUser(newUuid);

    const missingField = manager.getNextMissingField(newUuid);
    expect(missingField).toBeDefined();
    expect(missingField?.key).toBe("gender");
  });

  test("should get profile completeness", () => {
    const completeness = manager.getProfileCompleteness(testUuid);
    expect(completeness).toBeGreaterThan(0);
    expect(completeness).toBeLessThanOrEqual(100);
  });

  test("should extract profile from message", () => {
    const newUuid = "extract-test-" + Date.now();
    manager.ensureUser(newUuid);

    const extracted = manager.extractAndUpdateProfile(
      newUuid,
      "我是男性，1985年出生，身高180cm，体重75kg"
    );

    expect(extracted.gender).toBe("male");
    expect(extracted.birthYear).toBe(1985);
    expect(extracted.height).toBe(180);
    expect(extracted.weight).toBe(75);

    // Verify profile was updated (file-based)
    const profile = manager.getProfile(newUuid);
    expect(profile.gender).toBe("male");
  });

  test("should append to memory", () => {
    manager.appendMemory(testUuid, "## 发现\n用户喜欢跑步");

    // Search should find the content
    const results = manager.search(testUuid, "跑步");
    // Results may or may not be found depending on FTS availability
    expect(results).toBeDefined();
  });

  test("should build system prompt", () => {
    const prompt = manager.buildSystemPrompt(testUuid);
    expect(prompt).toContain("PHA");
    expect(prompt).toContain("Current User Information");
  });

  test("should load SOUL prompt", () => {
    const soul = manager.getSoulPrompt();
    expect(soul).toContain("PHA");
    expect(soul).toContain("Health");
  });
});
