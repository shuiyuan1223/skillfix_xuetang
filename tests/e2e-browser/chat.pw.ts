import { test, expect } from "@playwright/test";

test.describe("Chat", () => {
  test("can type and send a message", async ({ page }) => {
    await page.goto("/");

    // Wait for chat page to load (default page is chat)
    await expect(page.locator(".status-dot")).toHaveClass(/online/, { timeout: 5000 });

    // Find chat input (class is chat-input-bar, element is <input>)
    const chatInput = page.locator(".chat-input-bar input[type='text']");
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Type a message
    await chatInput.fill("Hello PHA");

    // Press Enter to send (or click the send button)
    const sendBtn = page.locator(".chat-input-bar button");
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
    } else {
      await chatInput.press("Enter");
    }

    // User message should appear in chat
    const chatContainer = page.locator(".chat-scroll-container");
    await expect(chatContainer).toContainText("Hello PHA", { timeout: 5000 });
  });

  test("receives assistant response from mock LLM", async ({ page }) => {
    await page.goto("/");

    // Wait for connection
    await expect(page.locator(".status-dot")).toHaveClass(/online/, { timeout: 5000 });

    // Find and use chat input
    const chatInput = page.locator(".chat-input-bar input[type='text']");
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill("Test message");

    const sendBtn = page.locator(".chat-input-bar button");
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
    } else {
      await chatInput.press("Enter");
    }

    // Wait for assistant response from mock LLM
    const chatContainer = page.locator(".chat-scroll-container");
    await expect(chatContainer).toContainText("Hello from PHA test", { timeout: 10000 });
  });
});
