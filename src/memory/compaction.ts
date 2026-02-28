/**
 * Compaction Flush — ported from OpenClaw (src/agents/compaction.ts + compaction-safeguard.ts)
 *
 * Flow when tokens approach limit:
 * 1. Flush: Save raw transcript + LLM summary to memory (BEFORE pruning)
 * 2. Prune: Real-time context pruning (soft-trim / hard-clear tool results)
 * 3. Compact: Truncate old messages if still over limit
 *
 * Key improvements over naive approach:
 * - Adaptive chunk ratio based on average message size (OpenClaw pattern)
 * - chunkMessagesByMaxTokens handles oversized single messages
 * - SAFETY_MARGIN (1.2x) for token estimation inaccuracy
 * - summarizeWithFallback: full → exclude oversized → crude extraction
 * - summarizeMultiStage: split → per-chunk summary → merge
 * - Flush happens BEFORE prune (preserves data for summarization)
 * - Proper logging at each fallback level
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { UserMessage, AssistantMessage, ToolResultMessage } from '@mariozechner/pi-ai';
import type { MemoryManager } from './memory-manager.js';
import { saveSessionTranscript, serializeMessages } from './session-store.js';
import { pruneContextMessages } from './context-pruning.js';
import { getGlobalHookRunner } from '../plugins/hook-runner-global.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Memory/Compaction');

// ── Constants (from OpenClaw) ──────────────────────────────────────────

const CHARS_PER_TOKEN = 4;
export const BASE_CHUNK_RATIO = 0.4;
export const MIN_CHUNK_RATIO = 0.15;
export const SAFETY_MARGIN = 1.2;

// ── Config types ───────────────────────────────────────────────────────

export interface CompactionConfig {
  contextWindow: number;
  reserveTokens: number;
  flushThreshold: number;
}

export interface LLMSummarizationConfig {
  provider: string;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  api: string;
}

// ── Token estimation ───────────────────────────────────────────────────

function estimateMessageTokens(msg: AgentMessage): number {
  if (!('content' in msg)) {
    return 0;
  }
  const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

// ── Serialization ──────────────────────────────────────────────────────

export function serializeMessagesForLLM(messages: AgentMessage[], maxChars = 50000): string {
  const parts: string[] = [];
  let totalLength = 0;

  for (const msg of messages) {
    if (!('role' in msg)) {
      continue;
    }

    let line = '';

    if (msg.role === 'user') {
      const userMsg = msg as UserMessage;
      const text =
        typeof userMsg.content === 'string'
          ? userMsg.content
          : userMsg.content
              .filter((b) => b.type === 'text')
              .map((b) => (b as { text: string }).text)
              .join('\n');
      if (text) {
        line = `User: ${text}`;
      }
    } else if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      const textParts: string[] = [];
      const toolParts: string[] = [];
      for (const block of assistantMsg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'toolCall') {
          toolParts.push(`[Called ${block.name}]`);
        }
      }
      if (textParts.length > 0 || toolParts.length > 0) {
        line = `Assistant: ${[...toolParts, ...textParts].join('\n')}`;
      }
    } else if (msg.role === 'toolResult') {
      const toolMsg = msg as ToolResultMessage;
      const text = toolMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n');
      const truncated = text.length > 500 ? `${text.slice(0, 500)}...` : text;
      line = `Tool(${toolMsg.toolName}): ${truncated || (toolMsg.isError ? '[error]' : '[ok]')}`;
    }

    if (line) {
      if (totalLength + line.length > maxChars) {
        break;
      }
      parts.push(line);
      totalLength += line.length;
    }
  }

  return parts.join('\n\n');
}

// ── LLM summarization ──────────────────────────────────────────────────

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

async function callLLMForSummary(
  content: string,
  config: LLMSummarizationConfig,
  customInstructions?: string
): Promise<string | null> {
  if (!content || content.length < 100) {
    return null;
  }

  const systemPrompt = customInstructions
    ? `${SUMMARIZATION_PROMPT}\n\nAdditional focus:\n${customInstructions}`
    : SUMMARIZATION_PROMPT;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let response: Response;

    if (config.api === 'anthropic-messages') {
      const url = config.baseUrl ? `${config.baseUrl}/v1/messages` : 'https://api.anthropic.com/v1/messages';

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log.warn(`Anthropic API error: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
      };
      return (
        data.content
          ?.filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n') || null
      );
    } else {
      const url = config.baseUrl
        ? `${config.baseUrl}/v1/chat/completions`
        : 'https://api.openai.com/v1/chat/completions';

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log.warn(`OpenAI API error: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices?.[0]?.message?.content || null;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log.warn('LLM summarization timed out (30s)');
    } else {
      log.warn('LLM summarization failed', err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Splitting & chunking (ported from OpenClaw compaction.ts) ──────────

function normalizeParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) {
    return 1;
  }
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

/**
 * Split messages into roughly equal parts by token share.
 * Ported from OpenClaw splitMessagesByTokenShare.
 */
export function splitMessagesByTokenShare(messages: AgentMessage[], parts = 2): AgentMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  const normalizedParts = normalizeParts(parts, messages.length);
  if (normalizedParts <= 1) {
    return [messages];
  }

  const totalTokens = estimateTokens(messages);
  const targetTokens = totalTokens / normalizedParts;
  const chunks: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message);
    if (chunks.length < normalizedParts - 1 && current.length > 0 && currentTokens + messageTokens > targetTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Chunk messages by max token budget per chunk.
 * Handles oversized single messages by isolating them into their own chunk.
 * Ported from OpenClaw chunkMessagesByMaxTokens.
 */
export function chunkMessagesByMaxTokens(messages: AgentMessage[], maxTokens: number): AgentMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  const chunks: AgentMessage[][] = [];
  let currentChunk: AgentMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateMessageTokens(message);
    if (currentChunk.length > 0 && currentTokens + messageTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += messageTokens;

    // Isolate oversized messages to avoid unbounded chunk growth
    if (messageTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Compute adaptive chunk ratio based on average message size.
 * When messages are large, use smaller chunks to avoid exceeding model limits.
 * Ported from OpenClaw computeAdaptiveChunkRatio.
 */
export function computeAdaptiveChunkRatio(messages: AgentMessage[], contextWindow: number): number {
  if (messages.length === 0) {
    return BASE_CHUNK_RATIO;
  }

  const totalTokens = estimateTokens(messages);
  const avgTokens = totalTokens / messages.length;
  const safeAvgTokens = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvgTokens / contextWindow;

  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}

/**
 * Check if a single message is too large to summarize (>50% of context).
 * Ported from OpenClaw isOversizedForSummary — includes SAFETY_MARGIN.
 */
export function isOversizedForSummary(msg: AgentMessage, contextWindow: number): boolean {
  const tokens = estimateMessageTokens(msg) * SAFETY_MARGIN;
  return tokens > contextWindow * 0.5;
}

// ── Multi-stage summarization (ported from OpenClaw) ───────────────────

/**
 * Summarize a list of messages by chunking and calling LLM per chunk.
 * Passes previous summary for continuity across chunks.
 */
async function summarizeChunks(
  messages: AgentMessage[],
  config: LLMSummarizationConfig,
  maxChunkTokens: number,
  customInstructions?: string,
  previousSummary?: string
): Promise<string | null> {
  if (messages.length === 0) {
    return previousSummary || null;
  }

  const chunks = chunkMessagesByMaxTokens(messages, maxChunkTokens);
  let summary = previousSummary;

  for (const chunk of chunks) {
    const serialized = serializeMessagesForLLM(chunk);
    const content = summary
      ? `Previous conversation summary:\n${summary}\n\nContinuing conversation:\n${serialized}`
      : serialized;

    const result = await callLLMForSummary(content, config, customInstructions);
    if (result) {
      summary = result;
    }
  }

  return summary || null;
}

/**
 * Summarize with progressive fallback for handling oversized messages.
 * Ported from OpenClaw summarizeWithFallback.
 *
 * Level 1: Full summarization
 * Level 2: Exclude oversized messages, note them
 * Level 3: Return description of what was there
 */
async function summarizeWithFallback(
  messages: AgentMessage[],
  config: LLMSummarizationConfig,
  contextWindow: number,
  maxChunkTokens: number,
  customInstructions?: string,
  previousSummary?: string
): Promise<string | null> {
  if (messages.length === 0) {
    return previousSummary || null;
  }

  // Level 1: Try full summarization
  try {
    const full = await summarizeChunks(messages, config, maxChunkTokens, customInstructions, previousSummary);
    if (full) {
      log.info('Level 1: Full LLM summary succeeded');
      return full;
    }
  } catch (err) {
    log.warn(`Level 1 failed, trying partial: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Level 2: Exclude oversized messages, note them
  const smallMessages: AgentMessage[] = [];
  const oversizedNotes: string[] = [];

  for (const msg of messages) {
    if (isOversizedForSummary(msg, contextWindow)) {
      const role = (msg as { role?: string }).role ?? 'message';
      const tokens = estimateMessageTokens(msg);
      oversizedNotes.push(`[Large ${role} (~${Math.round(tokens / 1000)}K tokens) omitted from summary]`);
    } else {
      smallMessages.push(msg);
    }
  }

  if (smallMessages.length > 0) {
    try {
      const partial = await summarizeChunks(smallMessages, config, maxChunkTokens, customInstructions, previousSummary);
      if (partial) {
        const notes = oversizedNotes.length > 0 ? `\n\n${oversizedNotes.join('\n')}` : '';
        log.info(`Level 2: Partial summary succeeded (excluded ${oversizedNotes.length} oversized messages)`);
        return partial + notes;
      }
    } catch (err) {
      log.warn(`Level 2 also failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Level 3: Return description
  log.warn('Level 3: All LLM summarization failed, using description only');
  return (
    `Context contained ${messages.length} messages (${oversizedNotes.length} oversized). ` +
    `Summary unavailable due to size limits.`
  );
}

const MERGE_SUMMARIES_INSTRUCTIONS =
  'Merge these partial summaries into a single cohesive summary. Preserve decisions,' +
  ' TODOs, open questions, and any constraints.';

/**
 * Multi-stage summarization: split → per-chunk summary → merge.
 * Ported from OpenClaw summarizeInStages.
 */
async function summarizeMultiStage(
  messages: AgentMessage[],
  config: LLMSummarizationConfig,
  contextWindow: number,
  customInstructions?: string,
  previousSummary?: string,
  parts = 2
): Promise<string | null> {
  if (messages.length === 0) {
    return previousSummary || null;
  }

  const chunkRatio = computeAdaptiveChunkRatio(messages, contextWindow);
  const maxChunkTokens = Math.max(1, Math.floor(contextWindow * chunkRatio));
  const minMessagesForSplit = 4;
  const normalizedParts = normalizeParts(parts, messages.length);
  const totalTokens = estimateTokens(messages);

  // Single-pass if small enough
  if (normalizedParts <= 1 || messages.length < minMessagesForSplit || totalTokens <= maxChunkTokens) {
    return summarizeWithFallback(messages, config, contextWindow, maxChunkTokens, customInstructions, previousSummary);
  }

  // Split into parts and summarize each
  const splits = splitMessagesByTokenShare(messages, normalizedParts).filter((chunk) => chunk.length > 0);
  if (splits.length <= 1) {
    return summarizeWithFallback(messages, config, contextWindow, maxChunkTokens, customInstructions, previousSummary);
  }

  log.info(
    `Multi-stage summarization: ${splits.length} parts from ${messages.length} messages (chunkRatio=${chunkRatio.toFixed(2)})`
  );

  const partialSummaries: string[] = [];
  for (const chunk of splits) {
    const result = await summarizeWithFallback(chunk, config, contextWindow, maxChunkTokens);
    if (result) {
      partialSummaries.push(result);
    }
  }

  if (partialSummaries.length <= 1) {
    return partialSummaries[0] || null;
  }

  // Merge partial summaries
  const summaryMessages: AgentMessage[] = partialSummaries.map((summary) => ({
    role: 'user' as const,
    content: summary,
    timestamp: Date.now(),
  }));

  const mergeInstructions = customInstructions
    ? `${MERGE_SUMMARIES_INSTRUCTIONS}\n\nAdditional focus:\n${customInstructions}`
    : MERGE_SUMMARIES_INSTRUCTIONS;

  return summarizeWithFallback(
    summaryMessages,
    config,
    contextWindow,
    maxChunkTokens,
    mergeInstructions,
    previousSummary
  );
}

// ── Crude fallback (no LLM) ────────────────────────────────────────────

function summarizeOldMessages(messages: AgentMessage[]): string | null {
  const old = messages.slice(0, -20);
  if (old.length < 4) {
    return null;
  }

  const userMessages = old
    .filter((m): m is UserMessage => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean);

  const toolCalls = old.filter((m) => m.role === 'toolResult');
  const errorCalls = old.filter((m) => m.role === 'toolResult' && (m as ToolResultMessage).isError);

  const parts: string[] = [];
  parts.push('## Conversation Summary (auto-saved before compaction)');
  parts.push('');

  if (userMessages.length > 0) {
    parts.push('### User discussed:');
    for (const msg of userMessages.slice(0, 10)) {
      parts.push(`- ${msg.slice(0, 200)}`);
    }
  }

  if (toolCalls.length > 0) {
    parts.push('');
    parts.push(`### Tools called: ${toolCalls.length} times`);
    if (errorCalls.length > 0) {
      parts.push(`### Tool errors: ${errorCalls.length}`);
    }
  }

  return parts.join('\n');
}

// ── Compaction (truncation) ────────────────────────────────────────────

function softTrimToolResult(msg: AgentMessage, maxChars: number): AgentMessage {
  if (msg.role !== 'toolResult') {
    return msg;
  }
  const toolMsg = msg as ToolResultMessage;
  const trimmedContent = toolMsg.content.map((block) => {
    if (block.type === 'text') {
      const text = (block as { type: 'text'; text: string }).text;
      if (text.length > maxChars) {
        return { type: 'text' as const, text: `${text.slice(0, maxChars)}\n[...truncated]` };
      }
    }
    return block;
  });
  return { ...toolMsg, content: trimmedContent } as AgentMessage;
}

function compactMessages(messages: AgentMessage[], tokenLimit: number): AgentMessage[] {
  const trimmed = messages.map((m) => {
    if (m.role === 'toolResult') {
      return softTrimToolResult(m, 800);
    }
    return m;
  });

  const firstUser = trimmed.find((m) => m.role === 'user');

  for (const keepCount of [20, 10]) {
    const recent = trimmed.slice(-keepCount);
    if (estimateTokens(recent) <= tokenLimit) {
      const marker: UserMessage = {
        role: 'user',
        content: '[Earlier conversation has been summarized and saved to memory.]',
        timestamp: Date.now(),
      };
      if (firstUser && !recent.includes(firstUser)) {
        return [firstUser, marker, ...recent];
      }
      return [marker, ...recent];
    }
  }

  return trimmed.slice(-10);
}

// ── Flush functions ────────────────────────────────────────────────────

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

export interface SACompactionFlushConfig extends CompactionConfig {
  onFlush?: (summary: string, transcript: string) => void;
}

export function createSACompactionFlush(config: SACompactionFlushConfig) {
  let flushed = false;

  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    const tokens = estimateTokens(messages);
    const limit = config.contextWindow - config.reserveTokens;

    // Phase 1: Flush — save context BEFORE pruning (preserves data for summary)
    if (!flushed && tokens >= limit - config.flushThreshold && config.onFlush) {
      flushed = true;
      try {
        const summary = summarizeOldMessages(messages) || 'Conversation continued (no extractable summary)';
        const transcript = serializeMessagesForLLM(messages, 5000);
        config.onFlush(summary, transcript);
        log.info('SA pre-compaction flush completed');
      } catch (err) {
        log.warn('SA flush failed', err);
      }
    }

    // Phase 2: Prune — real-time context pruning (after flush)
    messages = pruneContextMessages(messages, { contextWindow: config.contextWindow });

    // Phase 3: Compact — truncate if still over limit
    const tokensAfterPrune = estimateTokens(messages);
    if (tokensAfterPrune > limit) {
      return compactMessages(messages, limit);
    }

    return messages;
  };
}

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

    // Phase 1: Flush — save context BEFORE pruning (preserves data for summary)
    if (!flushed && tokens >= limit - config.flushThreshold) {
      flushed = true;
      const oldMessages = messages.slice(0, -20);

      // Trigger before_compaction hook
      const hr = getGlobalHookRunner();
      if (hr) {
        try {
          await hr.runBeforeCompaction({ messageCount: messages.length, tokenCount: tokens }, {});
        } catch {
          /* best-effort */
        }
      }

      // 1. Save raw transcript (no LLM, always succeeds)
      if (sessionId && oldMessages.length > 0) {
        try {
          saveSessionTranscript(userUuid, sessionId, oldMessages);
          const entries = serializeMessages(oldMessages);
          const textContent = entries.map((e) => `${e.role}: ${e.content}`).join('\n');
          if (textContent) {
            memoryManager.appendSessionTranscript(userUuid, sessionId, textContent);
          }
        } catch (err) {
          log.warn('Failed to save session transcript', err);
        }
      }

      // 2. Multi-stage LLM summarization (with adaptive chunking + 3-level fallback)
      let summary: string | null = null;
      if (llmConfig && oldMessages.length >= 4) {
        try {
          summary = await summarizeMultiStage(oldMessages, llmConfig, config.contextWindow);
          if (summary) {
            log.info('LLM summary generated successfully');
          }
        } catch (err) {
          log.warn(`LLM summarization failed completely: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!summary) {
        log.info('Using crude fallback summarization (no LLM)');
        summary = summarizeOldMessages(messages);
      }

      // 3. Store summary in daily log
      if (summary) {
        memoryManager.appendDailyLog(userUuid, summary);
      }
    }

    // Phase 2: Prune — real-time context pruning (after flush)
    const beforePruneCount = messages.length;
    messages = pruneContextMessages(messages, { contextWindow: config.contextWindow });

    // Phase 3: Compact — truncate if still over limit
    const tokensAfterPrune = estimateTokens(messages);
    if (tokensAfterPrune > limit) {
      const compacted = compactMessages(messages, limit);

      // Trigger after_compaction hook
      const hr = getGlobalHookRunner();
      if (hr) {
        hr.runAfterCompaction(
          {
            messageCount: compacted.length,
            tokenCount: estimateTokens(compacted),
            compactedCount: beforePruneCount - compacted.length,
          },
          {}
        ).catch(() => {});
      }

      return compacted;
    }

    // Trigger after_compaction hook if pruning removed messages
    if (beforePruneCount > messages.length) {
      const hr = getGlobalHookRunner();
      if (hr) {
        hr.runAfterCompaction(
          {
            messageCount: messages.length,
            tokenCount: tokensAfterPrune,
            compactedCount: beforePruneCount - messages.length,
          },
          {}
        ).catch(() => {});
      }
    }

    return messages;
  };
}
