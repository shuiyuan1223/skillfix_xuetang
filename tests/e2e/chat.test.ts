import { describe, test, expect, beforeAll } from "bun:test";
import { getTestServer, sendChat, type TestContext } from "./setup.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await getTestServer();
});

describe("Chat SSE", () => {
  test("POST /api/ag-ui returns SSE stream with AG-UI events", async () => {
    const events = await sendChat(ctx.baseUrl, "Hello");
    expect(events.length).toBeGreaterThan(0);

    // Should contain RunStarted event
    const runStarted = events.find((e) => e.type === "RunStarted");
    expect(runStarted).toBeTruthy();

    // Should contain RunFinished event
    const runFinished = events.find((e) => e.type === "RunFinished");
    expect(runFinished).toBeTruthy();
  });

  test("SSE stream contains TextMessageContent with mock response", async () => {
    const events = await sendChat(ctx.baseUrl, "Test message");

    // Should have text content events
    const textEvents = events.filter((e) => e.type === "TextMessageContent");
    expect(textEvents.length).toBeGreaterThan(0);

    // Combine all text deltas
    const fullText = textEvents.map((e) => e.delta || "").join("");
    expect(fullText.length).toBeGreaterThan(0);
  });

  test("chat returns 400 without user message", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/ag-ui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });
});
