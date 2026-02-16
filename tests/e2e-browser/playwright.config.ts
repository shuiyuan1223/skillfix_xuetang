import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.pw.ts",
  timeout: 15000,
  use: {
    baseURL: `http://localhost:${process.env.PHA_TEST_PORT || 8000}`,
  },
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
