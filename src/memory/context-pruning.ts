/**
 * Context Pruning
 * Real-time trimming of tool results to prevent context window bloat.
 *
 * Two-phase approach:
 * - Phase 1 (softTrim): context > 30% window → trim old toolResult to head+tail
 * - Phase 2 (hardClear): context > 50% window → replace old toolResult with placeholder
 *
 * Protected:
 * - Last 3 assistant turns (recent context is important)
 * - First user message (bootstrap/system context)
 * - ToolResults containing images
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ToolResultMessage } from "@mariozechner/pi-ai";

const CHARS_PER_TOKEN = 4;

export interface PruningConfig {
  /** Total context window size in tokens */
  contextWindow: number;
  /** Trigger soft trim when context exceeds this fraction of window (default 0.3) */
  softTrimThreshold?: number;
  /** Trigger hard clear when context exceeds this fraction of window (default 0.5) */
  hardClearThreshold?: number;
  /** Max chars to keep per side in soft trim (default 1500) */
  softTrimChars?: number;
  /** Number of recent assistant turns to protect (default 3) */
  protectedTurns?: number;
}

function estimateContextTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => {
    if (!("content" in m)) return sum;
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return sum + Math.ceil(text.length / CHARS_PER_TOKEN);
  }, 0);
}

function hasImageContent(msg: ToolResultMessage): boolean {
  return msg.content.some((block) => block.type === "image");
}

/**
 * Find indices of the last N assistant messages (for protection).
 */
function findProtectedIndices(messages: AgentMessage[], protectedTurns: number): Set<number> {
  const protected_ = new Set<number>();
  let assistantCount = 0;

  for (let i = messages.length - 1; i >= 0 && assistantCount < protectedTurns; i--) {
    if (messages[i].role === "assistant") {
      assistantCount++;
    }
    // Protect all messages in the recent turns (assistant + following toolResults)
    if (assistantCount > 0 && assistantCount <= protectedTurns) {
      protected_.add(i);
    }
  }

  return protected_;
}

/**
 * Find index of the first user message (bootstrap protection).
 */
function findFirstUserIndex(messages: AgentMessage[]): number {
  return messages.findIndex((m) => m.role === "user");
}

/**
 * Soft-trim a tool result: keep head + tail, replace middle with truncation marker.
 */
function softTrimToolResult(msg: ToolResultMessage, maxCharsPerSide: number): AgentMessage {
  const trimmedContent = msg.content.map((block) => {
    if (block.type === "text") {
      const text = (block as { type: "text"; text: string }).text;
      const totalKeep = maxCharsPerSide * 2;
      if (text.length > totalKeep + 100) {
        const head = text.slice(0, maxCharsPerSide);
        const tail = text.slice(-maxCharsPerSide);
        return {
          type: "text" as const,
          text: `${head}\n\n[...${text.length - totalKeep} chars trimmed...]\n\n${tail}`,
        };
      }
    }
    return block;
  });
  return { ...msg, content: trimmedContent } as AgentMessage;
}

/**
 * Hard-clear a tool result: replace with a brief placeholder.
 */
function hardClearToolResult(msg: ToolResultMessage): AgentMessage {
  const toolName = msg.toolName || "unknown";
  return {
    ...msg,
    content: [
      { type: "text" as const, text: `[Tool result from ${toolName} cleared to save context]` },
    ],
  } as AgentMessage;
}

/**
 * Prune context messages to prevent tool result bloat.
 * Pure function — returns new array, does not mutate input.
 */
export function pruneContextMessages(
  messages: AgentMessage[],
  config: PruningConfig
): AgentMessage[] {
  const softThreshold = config.softTrimThreshold ?? 0.3;
  const hardThreshold = config.hardClearThreshold ?? 0.5;
  const softTrimChars = config.softTrimChars ?? 1500;
  const protectedTurns = config.protectedTurns ?? 3;

  const totalTokens = estimateContextTokens(messages);
  const softLimit = config.contextWindow * softThreshold;
  const hardLimit = config.contextWindow * hardThreshold;

  // No pruning needed
  if (totalTokens <= softLimit) return messages;

  const protectedIndices = findProtectedIndices(messages, protectedTurns);
  const firstUserIdx = findFirstUserIndex(messages);

  const result = messages.map((msg, idx) => {
    // Skip non-toolResult messages
    if (msg.role !== "toolResult") return msg;

    // Protect first user message's preceding context
    if (idx <= firstUserIdx) return msg;

    // Protect recent turns
    if (protectedIndices.has(idx)) return msg;

    const toolMsg = msg as ToolResultMessage;

    // Don't prune image results
    if (hasImageContent(toolMsg)) return msg;

    // Phase 2: hard clear for high pressure
    if (totalTokens > hardLimit) {
      return hardClearToolResult(toolMsg);
    }

    // Phase 1: soft trim for moderate pressure
    return softTrimToolResult(toolMsg, softTrimChars);
  });

  return result;
}
