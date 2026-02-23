import { describe, test, expect, beforeAll } from "bun:test";
import {
  getTestServer,
  navigate,
  findPageUpdate,
  getSidebar,
  getMain,
  type TestContext,
} from "./setup.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await getTestServer();
});

const VIEWS = [
  "chat",
  "dashboard",
  "memory",
  "system-agent",
  "settings/prompts",
  "settings/skills",
  "settings/tools",
  "settings/integrations",
  "settings/logs",
  "settings/general",
  "evolution",
];

describe("Navigation", () => {
  for (const view of VIEWS) {
    test(`navigate to "${view}" returns page with sidebar and main`, async () => {
      const result = await navigate(ctx.baseUrl, view);
      expect(result.updates).toBeTruthy();
      expect(Array.isArray(result.updates)).toBe(true);

      // Find the page update (could be multiple updates for progressive-loading views)
      const page = findPageUpdate(result.updates);
      expect(page).toBeTruthy();
      expect(page!.type).toBe("page");

      // Check surfaces exist
      const sidebar = getSidebar(page!);
      const main = getMain(page!);
      expect(sidebar).toBeTruthy();
      expect(main).toBeTruthy();

      // Main should have components
      const mainComponents = (main as Record<string, unknown>).components;
      expect(Array.isArray(mainComponents)).toBe(true);
      expect((mainComponents as unknown[]).length).toBeGreaterThan(0);
    });
  }
});
