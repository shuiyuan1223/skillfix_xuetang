/**
 * Compaction Flush
 * Saves important context to memory before context window truncation.
 *
 * Flow when tokens approach limit:
 * 1. Save raw conversation to sessions/{id}.jsonl (always succeeds, no LLM)
 * 2. Call LLM to generate high-quality summary (fallback to crude extraction on failure)
 * 3. Store summary in daily log
 * 4. Truncate old messages
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UserMessage, AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import type { MemoryManager } from "./memory-manager.js";
import { saveSessionTranscript, serializeMessages } from "./session-store.js";

const CHARS_PER_TOKEN = 4;

export interface CompactionConfig {
  /** Total context window size in tokens (e.g. 128000) */
  contextWindow: number;
  /** Tokens reserved for response + tools (e.g. 20000) */
  reserveTokens: number;
  /** Trigger flush this many tokens before the limit (e.g. 4000) */
  flushThreshold: number;
}

export interface LLMSummarizationConfig {
  provider: string;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  /** API format: "anthropic-messages" or "openai-completions" */
  api: string;
}

function estimateTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => {
    if (!("content" in m)) return sum;
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return sum + Math.ceil(text.length / CHARS_PER_TOKEN);
  }, 0);
}

/**
 * Serialize AgentMessage[] into readable text for LLM summarization.
 * Includes user messages, assistant responses, and tool results.
 */
function serializeMessagesForLLM(messages: AgentMessage[], maxChars = 50000): string {
  const parts: string[] = [];
  let totalLength = 0;

  for (const msg of messages) {
    if (!("role" in msg)) continue;

    let line = "";

    if (msg.role === "user") {
      const userMsg = msg as UserMessage;
      const text =
        typeof userMsg.content === "string"
          ? userMsg.content
          : userMsg.content
              .filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("\n");
      if (text) {
        line = `User: ${text}`;
      }
    } else if (msg.role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      const textParts: string[] = [];
      const toolParts: string[] = [];
      for (const block of assistantMsg.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "toolCall") {
          toolParts.push(`[Called ${block.name}]`);
        }
      }
      if (textParts.length > 0 || toolParts.length > 0) {
        line = `Assistant: ${[...toolParts, ...textParts].join("\n")}`;
      }
    } else if (msg.role === "toolResult") {
      const toolMsg = msg as ToolResultMessage;
      const text = toolMsg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      // Keep tool results concise
      const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
      line = `Tool(${toolMsg.toolName}): ${truncated || (toolMsg.isError ? "[error]" : "[ok]")}`;
    }

    if (line) {
      if (totalLength + line.length > maxChars) break;
      parts.push(line);
      totalLength += line.length;
    }
  }

  return parts.join("\n\n");
}

const SUMMARIZATION_PROMPT = `You are summarizing a health assistant conversation for long-term memory.
Extract and organize the following from this conversation:

1. **Health Data**: Any health metrics, measurements, or test results discussed
2. **User Preferences**: Stated preferences about health, lifestyle, communication
3. **Important Decisions**: Health decisions, plans, or commitments made
4. **Follow-up Items**: Things to check on or remind the user about later
5. **Key Context**: Important context about the user's situation

Write a concise summary in markdown format. Focus on facts and actionable items.
Skip greetings, small talk, and routine interactions.
If the conversation has minimal substance, respond with just a single brief line.`;

/**
 * Call LLM to generate a structured summary of the conversation.
 * Returns null on failure (caller should fallback to crude summarization).
 */
async function summarizeWithLLM(
  messages: AgentMessage[],
  config: LLMSummarizationConfig,
  signal?: AbortSignal
): Promise<string | null> {
  const serialized = serializeMessagesForLLM(messages);
  if (!serialized || serialized.length < 100) return null;

  // 30-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  // Combine external signal with our timeout
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    let response: Response;

    if (config.api === "anthropic-messages") {
      const url = config.baseUrl
        ? `${config.baseUrl}/v1/messages`
        : "https://api.anthropic.com/v1/messages";

      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: 1024,
          system: SUMMARIZATION_PROMPT,
          messages: [{ role: "user", content: serialized }],
        }),
        signal: combinedSignal,
      });

      if (!response.ok) {
        console.warn(`[Compaction] Anthropic API error: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
      };
      const text = data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return text || null;
    } else {
      // OpenAI-compatible API
      const url = config.baseUrl
        ? `${config.baseUrl}/v1/chat/completions`
        : "https://api.openai.com/v1/chat/completions";

      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: 1024,
          messages: [
            { role: "system", content: SUMMARIZATION_PROMPT },
            { role: "user", content: serialized },
          ],
        }),
        signal: combinedSignal,
      });

      if (!response.ok) {
        console.warn(`[Compaction] OpenAI API error: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices?.[0]?.message?.content || null;
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[Compaction] LLM summarization timed out");
    } else {
      console.warn("[Compaction] LLM summarization failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fallback: crude summarization from user messages only.
 * Used when LLM summarization fails or is not configured.
 */
function summarizeOldMessages(messages: AgentMessage[]): string | null {
  const old = messages.slice(0, -20);
  if (old.length < 4) return null;

  const userMessages = old
    .filter((m): m is UserMessage => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean);

  const toolCalls = old.filter((m) => m.role === "toolResult");

  const parts: string[] = [];
  parts.push("## Conversation Summary (auto-saved before compaction)");
  parts.push("");

  if (userMessages.length > 0) {
    parts.push("### User discussed:");
    for (const msg of userMessages.slice(0, 10)) {
      parts.push(`- ${msg.slice(0, 200)}`);
    }
  }

  if (toolCalls.length > 0) {
    parts.push("");
    parts.push(`### Tools called: ${toolCalls.length} times`);
  }

  return parts.join("\n");
}

function softTrimToolResult(msg: AgentMessage, maxChars: number): AgentMessage {
  if (msg.role !== "toolResult") return msg;
  const toolMsg = msg as ToolResultMessage;
  const trimmedContent = toolMsg.content.map((block) => {
    if (block.type === "text") {
      const text = (block as { type: "text"; text: string }).text;
      if (text.length > maxChars) {
        return { type: "text" as const, text: text.slice(0, maxChars) + "\n[...truncated]" };
      }
    }
    return block;
  });
  return { ...toolMsg, content: trimmedContent } as AgentMessage;
}

function compactMessages(messages: AgentMessage[], tokenLimit: number): AgentMessage[] {
  // Soft-trim tool results first
  const trimmed = messages.map((m) => {
    if (m.role === "toolResult") {
      return softTrimToolResult(m, 800);
    }
    return m;
  });

  // Find first user message for context anchoring
  const firstUser = trimmed.find((m) => m.role === "user");

  // Try keeping last 20, then fall back to 10
  for (const keepCount of [20, 10]) {
    const recent = trimmed.slice(-keepCount);
    if (estimateTokens(recent) <= tokenLimit) {
      const marker: UserMessage = {
        role: "user",
        content: "[Earlier conversation has been summarized and saved to memory.]",
        timestamp: Date.now(),
      };
      // Anchor first user message if not already in recent slice
      if (firstUser && !recent.includes(firstUser)) {
        return [firstUser, marker, ...recent];
      }
      return [marker, ...recent];
    }
  }

  return trimmed.slice(-10);
}

/**
 * Create a simple compaction flush (no LLM summarization, no daily log).
 * Suitable for SystemAgent and other lightweight agents.
 */
export function createSimpleCompactionFlush(config: CompactionConfig) {
  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    const tokens = estimateTokens(messages);
    const limit = config.contextWindow - config.reserveTokens;
    if (tokens > limit) {
      return compactMessages(messages, limit);
    }
    return messages;
  };
}

/**
 * Create a compaction flush function for use as transformContext hook.
 */
export function createCompactionFlush(
  config: CompactionConfig,
  memoryManager: MemoryManager,
  userUuid: string,
  llmConfig?: LLMSummarizationConfig,
  sessionId?: string
) {
  let flushed = false;

  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    const tokens = estimateTokens(messages);
    const limit = config.contextWindow - config.reserveTokens;

    // Phase 1: Flush — save important context to memory before compaction
    if (!flushed && tokens >= limit - config.flushThreshold) {
      flushed = true;
      const oldMessages = messages.slice(0, -20);

      // 1. Save raw conversation to session transcript (always, no LLM needed)
      if (sessionId && oldMessages.length > 0) {
        try {
          saveSessionTranscript(userUuid, sessionId, oldMessages);

          // Index session content for search
          const entries = serializeMessages(oldMessages);
          const textContent = entries.map((e) => `${e.role}: ${e.content}`).join("\n");
          if (textContent) {
            memoryManager.appendSessionTranscript(userUuid, sessionId, textContent);
          }
        } catch (err) {
          console.warn("[Compaction] Failed to save session transcript:", err);
        }
      }

      // 2. LLM summarization (with fallback)
      let summary: string | null = null;
      if (llmConfig && oldMessages.length >= 4) {
        try {
          summary = await summarizeWithLLM(oldMessages, llmConfig);
          if (summary) {
            console.log("[Compaction] LLM summary generated successfully");
          }
        } catch {
          // fallback below
        }
      }
      if (!summary) {
        summary = summarizeOldMessages(messages);
      }

      // 3. Store summary in daily log
      if (summary) {
        memoryManager.appendDailyLog(userUuid, summary);
      }
    }

    // Phase 2: Compact — if still over limit, truncate old messages
    if (tokens > limit) {
      return compactMessages(messages, limit);
    }

    return messages;
  };
}
