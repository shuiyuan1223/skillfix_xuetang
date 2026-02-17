import { describe, test, expect, beforeAll } from "bun:test";
import {
  getTestServer,
  initSession,
  findPageUpdate,
  getSidebar,
  getMain,
  type TestContext,
} from "./setup.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await getTestServer();
});

describe("Session", () => {
  test("POST /api/a2ui/init returns sessionId and updates", async () => {
    const result = await initSession(ctx.baseUrl);
    expect(result.sessionId).toBeTruthy();
    expect(result.uid).toBeTruthy();
    expect(Array.isArray(result.updates)).toBe(true);
    expect(result.updates.length).toBeGreaterThan(0);
  });

  test("default view is chat page with sidebar and main", async () => {
    const result = await initSession(ctx.baseUrl);
    const page = findPageUpdate(result.updates);
    expect(page).toBeTruthy();
    expect(page!.type).toBe("page");

    const sidebar = getSidebar(page!);
    const main = getMain(page!);
    expect(sidebar).toBeTruthy();
    expect(main).toBeTruthy();

    // Main should have components
    const mainComponents = (main as Record<string, unknown>).components;
    expect(Array.isArray(mainComponents)).toBe(true);
    expect((mainComponents as unknown[]).length).toBeGreaterThan(0);
  });

  test("same uuid reuses session", async () => {
    const uuid = crypto.randomUUID();
    const first = await initSession(ctx.baseUrl, uuid);
    const second = await initSession(ctx.baseUrl, uuid);
    expect(first.sessionId).toBe(second.sessionId);
  });

  test("different uuid creates different session", async () => {
    const first = await initSession(ctx.baseUrl);
    const second = await initSession(ctx.baseUrl);
    expect(first.sessionId).not.toBe(second.sessionId);
  });
});
