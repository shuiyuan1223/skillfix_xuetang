/**
 * Tests for SA Compaction Flush
 *
 * Verifies that createSACompactionFlush:
 * - Calls onFlush callback before truncation
 * - Passes summary and transcript to onFlush
 * - Only flushes once per lifecycle
 * - Compacts messages when over limit
 */

import { describe, test, expect } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createSACompactionFlush, serializeMessagesForLLM } from "../../src/memory/compaction.js";

function makeUserMessage(content: string, timestamp = Date.now()): AgentMessage {
  return { role: "user", content, timestamp } as AgentMessage;
}

function makeAssistantMessage(text: string, timestamp = Date.now()): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "test",
    model: "test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp,
  } as AgentMessage;
}

/**
 * Generate messages that exceed a given token budget.
 * Each message is ~250 tokens (1000 chars / 4 chars per token).
 */
function generateMessages(count: number): AgentMessage[] {
  const msgs: AgentMessage[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      msgs.push(makeUserMessage("x".repeat(1000)));
    } else {
      msgs.push(makeAssistantMessage("y".repeat(1000)));
    }
  }
  return msgs;
}

describe("createSACompactionFlush", () => {
  test("does not flush when under limit", async () => {
    let flushCalled = false;
    const flush = createSACompactionFlush({
      contextWindow: 128000,
      reserveTokens: 20000,
      flushThreshold: 4000,
      onFlush: () => {
        flushCalled = true;
      },
    });

    const messages = generateMessages(4); // ~1000 tokens, well under limit
    const result = await flush(messages);

    expect(flushCalled).toBe(false);
    expect(result.length).toBe(messages.length);
  });

  test("calls onFlush before compaction when approaching limit", async () => {
    let flushSummary = "";
    let flushTranscript = "";
    const flush = createSACompactionFlush({
      contextWindow: 2000, // Small window to trigger easily
      reserveTokens: 200,
      flushThreshold: 400,
      onFlush: (summary, transcript) => {
        flushSummary = summary;
        flushTranscript = transcript;
      },
    });

    // Generate enough messages to exceed (2000 - 200 - 400) = 1400 tokens
    // Each message is ~250 tokens, so 8 messages = ~2000 tokens
    const messages = generateMessages(8);
    await flush(messages);

    // onFlush should have been called
    expect(flushSummary.length).toBeGreaterThan(0);
    expect(flushTranscript.length).toBeGreaterThan(0);
  });

  test("only flushes once per lifecycle", async () => {
    let flushCount = 0;
    const flush = createSACompactionFlush({
      contextWindow: 2000,
      reserveTokens: 200,
      flushThreshold: 400,
      onFlush: () => {
        flushCount++;
      },
    });

    const messages = generateMessages(8);
    await flush(messages);
    await flush(messages);
    await flush(messages);

    expect(flushCount).toBe(1);
  });

  test("compacts messages when over token limit", async () => {
    const flush = createSACompactionFlush({
      contextWindow: 2000,
      reserveTokens: 200,
      flushThreshold: 400,
      onFlush: () => {},
    });

    const messages = generateMessages(30); // Way over limit
    const result = await flush(messages);

    expect(result.length).toBeLessThan(messages.length);
  });
});

describe("serializeMessagesForLLM", () => {
  test("serializes user and assistant messages", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("Hello, how are you?"),
      makeAssistantMessage("I'm doing well!"),
    ];

    const result = serializeMessagesForLLM(messages);
    expect(result).toContain("User: Hello, how are you?");
    expect(result).toContain("Assistant: I'm doing well!");
  });

  test("respects maxChars limit", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("a".repeat(1000)),
      makeUserMessage("b".repeat(1000)),
    ];

    const result = serializeMessagesForLLM(messages, 500);
    expect(result.length).toBeLessThanOrEqual(600); // Some overhead for "User: " prefix
  });

  test("handles empty messages", () => {
    const result = serializeMessagesForLLM([]);
    expect(result).toBe("");
  });
});
