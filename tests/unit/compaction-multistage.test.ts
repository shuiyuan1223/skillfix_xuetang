/**
 * Tests for Multi-stage Summarization
 *
 * Tests the helper functions used by multi-stage summarization:
 * - splitMessagesByTokenShare
 * - isOversizedForSummary
 *
 * Note: LLM-calling functions are not tested here (require network).
 * They are tested via integration tests.
 */

import { describe, test, expect } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { splitMessagesByTokenShare, isOversizedForSummary } from "../../src/memory/compaction.js";

function makeUserMessage(content: string): AgentMessage {
  return { role: "user", content, timestamp: Date.now() } as AgentMessage;
}

function makeAssistantMessage(text: string): AgentMessage {
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
    timestamp: Date.now(),
  } as AgentMessage;
}

describe("splitMessagesByTokenShare", () => {
  test("returns single array for parts=1", () => {
    const messages = [makeUserMessage("hello"), makeAssistantMessage("world")];
    const result = splitMessagesByTokenShare(messages, 1);
    expect(result).toEqual([messages]);
  });

  test("splits messages into roughly equal parts", () => {
    // 4 messages of ~250 tokens each (1000 chars / 4)
    const messages = [
      makeUserMessage("a".repeat(1000)),
      makeAssistantMessage("b".repeat(1000)),
      makeUserMessage("c".repeat(1000)),
      makeAssistantMessage("d".repeat(1000)),
    ];

    const result = splitMessagesByTokenShare(messages, 2);
    expect(result.length).toBe(2);

    // Each part should have ~2 messages
    const totalMessages = result.reduce((sum, part) => sum + part.length, 0);
    expect(totalMessages).toBe(4);
  });

  test("handles single message", () => {
    const messages = [makeUserMessage("hello")];
    const result = splitMessagesByTokenShare(messages, 3);
    expect(result).toEqual([messages]);
  });

  test("handles empty array", () => {
    const result = splitMessagesByTokenShare([], 3);
    expect(result).toEqual([[]]);
  });

  test("splits into more parts for larger conversations", () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? makeUserMessage("x".repeat(1000)) : makeAssistantMessage("y".repeat(1000))
    );

    const result = splitMessagesByTokenShare(messages, 4);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe("isOversizedForSummary", () => {
  test("returns true for messages >50% of context window", () => {
    // 100000 chars = ~25000 tokens, contextWindow=40000 → 50% = 20000
    const bigMessage = makeUserMessage("x".repeat(100000));
    expect(isOversizedForSummary(bigMessage, 40000)).toBe(true);
  });

  test("returns false for normal messages", () => {
    const normalMessage = makeUserMessage("Hello, how are you?");
    expect(isOversizedForSummary(normalMessage, 128000)).toBe(false);
  });

  test("boundary: exactly at 50%", () => {
    // 4000 chars = 1000 tokens, contextWindow=2000 → 50% = 1000
    const message = makeUserMessage("x".repeat(4000));
    expect(isOversizedForSummary(message, 2000)).toBe(false); // equal, not greater
  });

  test("boundary: just over 50%", () => {
    // 4004 chars = 1001 tokens, contextWindow=2000 → 50% = 1000
    const message = makeUserMessage("x".repeat(4004));
    expect(isOversizedForSummary(message, 2000)).toBe(true);
  });
});
