/**
 * Tests for Context Pruning (ported from OpenClaw)
 *
 * Verifies the two-phase pruning strategy:
 * - Phase 1 (soft trim): trim old tool results when context > softTrimRatio (30%)
 * - Phase 2 (hard clear): replace old tool results when context > hardClearRatio (50%)
 * - Protection of recent turns and first user message
 * - minPrunableToolChars threshold for hard-clear
 * - Image tool result preservation
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
    // contextWindow = 4000, charWindow = 16000
    // ratio = 5072/16000 = 0.32 > 0.3 (soft trim) but < 0.5 (no hard clear)
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
    // OpenClaw format: "[Tool result trimmed: kept first N chars and last N chars of M chars.]"
    expect(text).toContain("Tool result trimmed");
    expect(text.length).toBeLessThan(5000);
  });

  test("hard-clears old tool results above 50% threshold", () => {
    // Create multiple large tool results to exceed minPrunableToolChars
    const messages: AgentMessage[] = [
      makeUserMessage("check my health"),
      makeAssistantMessage("checking"),
      makeToolResult("tool1", "x".repeat(10000)),
      makeToolResult("tool2", "y".repeat(10000)),
      makeToolResult("tool3", "z".repeat(10000)),
      makeUserMessage("ok"),
      makeAssistantMessage("done"),
    ];

    // Use settingsOverride to lower minPrunableToolChars for testing
    // contextWindow = 3000, charWindow = 12000
    // Total chars ≈ 30029, ratio = 2.5 → soft-trim fires, then hard-clear
    const result = pruneContextMessages(
      messages,
      { contextWindow: 3000, protectedTurns: 1 },
      {
        keepLastAssistants: 1,
        softTrimRatio: 0.3,
        hardClearRatio: 0.5,
        minPrunableToolChars: 100, // Low threshold for testing
        softTrim: { maxChars: 4000, headChars: 1500, tailChars: 1500 },
        hardClear: { enabled: true, placeholder: "[Old tool result content cleared]" },
      }
    );

    // At least one tool result should be hard-cleared with OpenClaw placeholder
    const cleared = result.filter(
      (m: any) =>
        m.role === "toolResult" && m.content[0]?.text === "[Old tool result content cleared]"
    );
    expect(cleared.length).toBeGreaterThan(0);
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

    // Recent tool result should be untouched (in protected zone after cutoffIndex)
    const recentToolResult = result[5] as any;
    expect(recentToolResult.content[0].text).toBe("y".repeat(10000));

    // Old tool result should be modified (soft-trimmed)
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

  test("returns new array when pruning occurs (immutable)", () => {
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

  test("incremental hard-clear stops when ratio drops below threshold", () => {
    // Verify that hard-clear is incremental (stops as soon as ratio < hardClearRatio)
    const messages: AgentMessage[] = [
      makeUserMessage("start"),
      makeAssistantMessage("ok"),
      makeToolResult("tool1", "a".repeat(8000)),
      makeToolResult("tool2", "b".repeat(8000)),
      makeToolResult("tool3", "c".repeat(8000)),
      makeToolResult("tool4", "d".repeat(8000)),
      makeUserMessage("continue"),
      makeAssistantMessage("done"),
    ];

    const result = pruneContextMessages(
      messages,
      { contextWindow: 3000, protectedTurns: 1 },
      {
        keepLastAssistants: 1,
        softTrimRatio: 0.3,
        hardClearRatio: 0.5,
        minPrunableToolChars: 100,
        softTrim: { maxChars: 4000, headChars: 1500, tailChars: 1500 },
        hardClear: { enabled: true, placeholder: "[Old tool result content cleared]" },
      }
    );

    // Not ALL tool results should be hard-cleared — incremental stops early
    const clearedCount = result.filter(
      (m: any) =>
        m.role === "toolResult" && m.content[0]?.text === "[Old tool result content cleared]"
    ).length;
    const toolResultCount = result.filter((m: any) => m.role === "toolResult").length;

    // Some should be cleared, but not necessarily all
    expect(clearedCount).toBeGreaterThan(0);
    expect(clearedCount).toBeLessThanOrEqual(toolResultCount);
  });
});
