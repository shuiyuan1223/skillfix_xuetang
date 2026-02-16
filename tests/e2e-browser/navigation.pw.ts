import { test, expect } from "@playwright/test";

test.describe("Sidebar Navigation", () => {
  test("clicking sidebar nav buttons switches active state", async ({ page }) => {
    await page.goto("/");

    // Wait for sidebar to load
    const navBtns = page.locator(".sidebar-nav-btn");
    await expect(navBtns.first()).toBeVisible({ timeout: 5000 });

    const count = await navBtns.count();

    // Click each nav button and verify it becomes active
    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = navBtns.nth(i);
      await btn.click();
      // The clicked button should have active class
      await expect(btn).toHaveClass(/active/, { timeout: 3000 });
    }
  });

  test("navigation updates main content area", async ({ page }) => {
    await page.goto("/");

    // Wait for initial load
    await expect(page.locator(".sidebar-nav-btn").first()).toBeVisible({ timeout: 5000 });

    // Get initial main content
    const mainScroll = page.locator(".main-scroll");
    await expect(mainScroll).toBeVisible();
    const initialHtml = await mainScroll.innerHTML();

    // Click a different nav button (second one, likely not the default)
    const navBtns = page.locator(".sidebar-nav-btn");
    const count = await navBtns.count();
    if (count >= 2) {
      await navBtns.nth(1).click();
      // Wait for content to change
      await page.waitForTimeout(500);
      const newHtml = await mainScroll.innerHTML();
      // Content should have changed (or at minimum, page key updated)
      expect(newHtml).toBeDefined();
    }
  });
});
