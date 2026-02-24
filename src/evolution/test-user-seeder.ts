/**
 * Test User Seeder
 *
 * Loads test user fixtures from YAML and seeds their profiles/memory
 * into the .pha/users/ directory for benchmark use.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { saveProfileToFile, ensureUserDir, getMemoryPath } from "../memory/profile.js";
import { writeFileSync } from "fs";
import type { UserProfile } from "../memory/types.js";
import {
  BenchmarkDataSource,
  mergeFixtureOverrides,
  type FixtureHealthData,
} from "./benchmark-data-source.js";

const TEST_USERS_DIR = join(process.cwd(), "src", "evolution", "test-users");

export interface TestUserFixture {
  id: string;
  uuid: string;
  profile: {
    nickname?: string;
    gender?: string;
    birthYear?: number;
    height?: number;
    weight?: number;
    goals?: {
      primary?: string;
      dailySteps?: number;
      sleepHours?: number;
      exercisePerWeek?: number;
    };
    lifestyle?: Record<string, unknown>;
  };
  memory: string;
  health_data: FixtureHealthData;
}

/** Cache loaded fixtures to avoid re-reading files */
const fixtureCache = new Map<string, TestUserFixture>();

/**
 * Load a single test user fixture by ID (e.g., "active-user").
 */
export function loadTestUserFixture(id: string): TestUserFixture {
  const cached = fixtureCache.get(id);
  if (cached) return cached;

  const filePath = join(TEST_USERS_DIR, `${id}.yaml`);
  const content = readFileSync(filePath, "utf-8");
  const fixture = parseYaml(content) as TestUserFixture;
  fixtureCache.set(id, fixture);
  return fixture;
}

/**
 * Load all test user fixtures from the test-users directory.
 */
export function loadAllTestUserFixtures(): TestUserFixture[] {
  const files = readdirSync(TEST_USERS_DIR).filter((f) => f.endsWith(".yaml"));
  return files.map((f) => loadTestUserFixture(f.replace(".yaml", "")));
}

/**
 * Seed a test user's profile and memory into the filesystem.
 */
export function seedTestUser(fixture: TestUserFixture): void {
  const { uuid, profile, memory } = fixture;

  // Ensure user directory exists
  ensureUserDir(uuid);

  // Build UserProfile from fixture
  const userProfile: UserProfile = {
    nickname: profile.nickname || undefined,
    gender: profile.gender as "male" | "female" | undefined,
    birthYear: profile.birthYear,
    height: profile.height,
    weight: profile.weight,
    goals: profile.goals
      ? {
          primary: profile.goals.primary || undefined,
          dailySteps: profile.goals.dailySteps,
          sleepHours: profile.goals.sleepHours,
          exercisePerWeek: profile.goals.exercisePerWeek,
        }
      : undefined,
  };

  // Write profile
  saveProfileToFile(uuid, userProfile);

  // Write memory
  if (memory && memory.trim()) {
    const memoryPath = getMemoryPath(uuid);
    writeFileSync(memoryPath, `# 健康记忆\n\n${memory.trim()}\n`);
  }
}

/**
 * Seed all test users. Call once before benchmark run.
 */
export function seedAllTestUsers(): void {
  const fixtures = loadAllTestUserFixtures();
  for (const fixture of fixtures) {
    seedTestUser(fixture);
  }
}

/**
 * Create a BenchmarkDataSource for a test case.
 * Loads the fixture's health data and merges any per-test-case overrides.
 */
export function createBenchmarkDataSource(
  fixtureId: string,
  healthOverrides?: Record<string, unknown>
): BenchmarkDataSource {
  const fixture = loadTestUserFixture(fixtureId);
  const healthData = mergeFixtureOverrides(fixture.health_data, healthOverrides);
  return new BenchmarkDataSource(healthData);
}

/**
 * Get the UUID for a test user fixture ID.
 */
export function getTestUserUuid(fixtureId: string): string {
  const fixture = loadTestUserFixture(fixtureId);
  return fixture.uuid;
}
