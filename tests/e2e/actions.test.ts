import { describe, test, expect, beforeAll } from "bun:test";
import {
  getTestServer,
  initSession,
  navigate,
  sendAction,
  findPageUpdate,
  getSidebar,
  getMain,
  type TestContext,
} from "./setup.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await getTestServer();
});

describe("Actions", () => {
  test("sidebar has navigation items", async () => {
    const result = await initSession(ctx.baseUrl);
    const page = findPageUpdate(result.updates);
    expect(page).toBeTruthy();

    const sidebar = getSidebar(page!);
    expect(sidebar).toBeTruthy();

    // Sidebar should have components (navigation items)
    const components = (sidebar as Record<string, unknown>).components as unknown[];
    expect(Array.isArray(components)).toBe(true);
    expect(components.length).toBeGreaterThan(0);
  });

  test("dashboard tab switch returns page updates", async () => {
    // Navigate to dashboard first
    const navResult = await navigate(ctx.baseUrl, "dashboard");
    expect(findPageUpdate(navResult.updates)).toBeTruthy();

    // Then switch tab — this triggers a re-render of dashboard
    const result = await sendAction(ctx.baseUrl, "tab_change", { tab: "vitals" });
    expect(result.updates).toBeTruthy();
    expect(Array.isArray(result.updates)).toBe(true);
    // Dashboard uses progressive loading, so updates should contain page data
    expect(result.updates.length).toBeGreaterThan(0);
  });

  test("memory tab switch returns updates", async () => {
    await navigate(ctx.baseUrl, "memory");

    const result = await sendAction(ctx.baseUrl, "tab_change", { tab: "profile" });
    expect(result.updates).toBeTruthy();
    expect(Array.isArray(result.updates)).toBe(true);
    // Memory tab switch triggers system-agent interaction, returns a2ui surface updates
    expect(result.updates.length).toBeGreaterThan(0);
  });

  test("close_modal action returns clear_surface", async () => {
    const result = await sendAction(ctx.baseUrl, "close_modal");
    expect(result.updates).toBeTruthy();
    // close_modal sends a clear_surface message
    const clearSurface = (result.updates as Record<string, unknown>[]).find(
      (u) => u.type === "clear_surface"
    );
    expect(clearSurface).toBeTruthy();
  });
});
