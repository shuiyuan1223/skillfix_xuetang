/**
 * Tests for Context Pruning
 *
 * Verifies the two-phase pruning strategy:
 * - Phase 1 (soft trim): trim old tool results when context > 30% window
 * - Phase 2 (hard clear): replace old tool results when context > 50% window
 * - Protection of recent turns and first user message
 */

import { describe, test, expect } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { pruneContextMessages } from "../../src/memory/context-pruning.js";

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

function makeToolResult(toolName: string, text: string): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId: "test-id",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  } as AgentMessage;
}

function makeImageToolResult(toolName: string): AgentMessage {
  return {
    role: "toolResult",
    toolName,
    toolCallId: "test-id",
    content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } }],
    isError: false,
    timestamp: Date.now(),
  } as AgentMessage;
}

describe("pruneContextMessages", () => {
  test("does not prune when under soft threshold", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("hello"),
      makeAssistantMessage("hi"),
      makeToolResult("test", "result"),
    ];

    const result = pruneContextMessages(messages, {
      contextWindow: 100000, // Very large window
    });

    expect(result).toEqual(messages);
  });

  test("soft-trims old tool results above 30% threshold", () => {
    // 5000 chars = ~1250 tokens in the tool result
    // Plus other messages ~100 tokens → total ~1350 tokens
    // contextWindow = 4000, so 30% = 1200, 50% = 2000
    // 1350 > 1200 (soft trim) but 1350 < 2000 (no hard clear)
    const bigToolResult = makeToolResult("get_health_data", "x".repeat(5000));
    const messages: AgentMessage[] = [
      makeUserMessage("check my health"),
      makeAssistantMessage("let me check"),
      bigToolResult,
      makeUserMessage("anything else?"),
      makeAssistantMessage("here's more info"),
      makeToolResult("get_sleep", "recent data"),
      makeAssistantMessage("done"),
    ];

    const result = pruneContextMessages(messages, {
      contextWindow: 4000,
      protectedTurns: 1,
    });

    // The big tool result should be soft-trimmed (head+tail)
    const trimmedToolResult = result[2] as any;
    expect(trimmedToolResult.role).toBe("toolResult");
    const text = trimmedToolResult.content[0].text;
    expect(text).toContain("chars trimmed");
    expect(text.length).toBeLessThan(5000);
  });

  test("hard-clears old tool results above 50% threshold", () => {
    const bigToolResult = makeToolResult("get_health_data", "x".repeat(20000));
    const messages: AgentMessage[] = [
      makeUserMessage("check my health"),
      makeAssistantMessage("checking"),
      bigToolResult,
      makeUserMessage("ok"),
      makeAssistantMessage("here's info"),
      makeToolResult("get_sleep", "recent"),
      makeAssistantMessage("done"),
    ];

    // Context window = 5000 tokens, so 50% = 2500 tokens
    // The big tool result alone is ~5000 tokens
    const result = pruneContextMessages(messages, {
      contextWindow: 5000,
      protectedTurns: 1,
    });

    // The big tool result should be completely cleared
    const cleared = result[2] as any;
    expect(cleared.content[0].text).toContain("cleared to save context");
  });

  test("protects recent assistant turns", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("hello"),
      makeAssistantMessage("hi"),
      makeToolResult("old_tool", "x".repeat(10000)),
      makeUserMessage("question"),
      makeAssistantMessage("answer"),
      makeToolResult("recent_tool", "y".repeat(10000)), // In protected zone
      makeAssistantMessage("follow up"),
    ];

    const result = pruneContextMessages(messages, {
      contextWindow: 5000,
      protectedTurns: 2,
    });

    // Recent tool result should be untouched
    const recentToolResult = result[5] as any;
    expect(recentToolResult.content[0].text).toBe("y".repeat(10000));

    // Old tool result should be modified
    const oldToolResult = result[2] as any;
    expect(oldToolResult.content[0].text.length).toBeLessThan(10000);
  });

  test("does not prune tool results with images", () => {
    const imageResult = makeImageToolResult("screenshot");
    const messages: AgentMessage[] = [
      makeUserMessage("show me"),
      makeAssistantMessage("here"),
      imageResult,
      makeUserMessage("ok"),
      makeAssistantMessage("done"),
    ];

    const result = pruneContextMessages(messages, {
      contextWindow: 100, // Tiny window to force pruning
      protectedTurns: 0,
    });

    // Image tool result should be preserved
    expect(result[2]).toEqual(imageResult);
  });

  test("protects first user message context", () => {
    const toolBeforeUser = makeToolResult("setup", "x".repeat(10000));
    const messages: AgentMessage[] = [
      toolBeforeUser, // Before first user message — should be protected
      makeUserMessage("hello"),
      makeAssistantMessage("hi"),
      makeToolResult("after", "y".repeat(10000)),
      makeAssistantMessage("done"),
    ];

    const result = pruneContextMessages(messages, {
      contextWindow: 5000,
      protectedTurns: 1,
    });

    // Tool before first user should be untouched
    expect(result[0]).toEqual(toolBeforeUser);
  });

  test("returns new array (immutable)", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("hello"),
      makeToolResult("test", "x".repeat(10000)),
      makeAssistantMessage("done"),
    ];

    const result = pruneContextMessages(messages, {
      contextWindow: 1000,
      protectedTurns: 0,
    });

    expect(result).not.toBe(messages);
  });
});
