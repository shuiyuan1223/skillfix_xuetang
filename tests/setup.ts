/**
 * Test Setup
 *
 * Global test configuration and utilities for PHA tests.
 * Bun test automatically loads this file if it exists.
 */

import { beforeEach, afterEach } from "bun:test";

// Store original env vars
const originalEnv = { ...process.env };

// Reset environment before each test
beforeEach(() => {
  // Clear any test-specific env vars
  process.env = { ...originalEnv };
});

afterEach(() => {
  // Restore original env
  process.env = originalEnv;
});

/**
 * Helper to create a temporary directory for tests
 */
export function createTempDir(): string {
  const tmpDir = `/tmp/pha-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  require("fs").mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Helper to clean up temporary directory
 */
export function cleanupTempDir(dir: string): void {
  require("fs").rmSync(dir, { recursive: true, force: true });
}

/**
 * Helper to load a fixture file
 */
export function loadFixture<T>(name: string): T {
  const fixturePath = `${__dirname}/fixtures/${name}`;
  const content = require("fs").readFileSync(fixturePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Helper to create a mock config for testing
 */
export function createMockConfig(overrides: Record<string, unknown> = {}) {
  return {
    gateway: { port: 8000, autoStart: false },
    llm: { provider: "anthropic" },
    dataSources: { type: "mock" },
    tui: { theme: "dark", showToolCalls: true },
    ...overrides,
  };
}
