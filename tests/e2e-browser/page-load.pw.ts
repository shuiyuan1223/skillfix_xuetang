import { test, expect } from "@playwright/test";

test.describe("Page Load", () => {
  test("renders PHA brand in topbar", async ({ page }) => {
    await page.goto("/");
    const brand = page.locator(".topbar-brand");
    await expect(brand).toBeVisible();
    await expect(brand).toContainText("PHA");
  });

  test("sidebar has navigation buttons", async ({ page }) => {
    await page.goto("/");
    const navBtns = page.locator(".sidebar-nav-btn");
    await expect(navBtns.first()).toBeVisible();
    const count = await navBtns.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("SSE connects and status dot goes online", async ({ page }) => {
    await page.goto("/");
    const dot = page.locator(".status-dot");
    await expect(dot).toBeVisible();
    // Wait for SSE to connect (status-dot gets 'online' class)
    await expect(dot).toHaveClass(/online/, { timeout: 5000 });
  });

  test("main content area renders", async ({ page }) => {
    await page.goto("/");
    const main = page.locator(".main-area");
    await expect(main).toBeVisible();
    // Wait for skeleton to be replaced with actual content
    await expect(page.locator(".main-scroll")).toBeVisible();
  });
});
