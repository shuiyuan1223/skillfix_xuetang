/**
 * LLM Log Tools
 *
 * Provides search_llm_logs MCP tool for SA to investigate incidents by
 * searching LLM request/response logs in a time window.
 *
 * Category: "evolution" → available to System Agent (SA)
 */

import { readLlmLogFile } from '../utils/llm-logger.js';
import { getIncident } from '../memory/db.js';
import type { PHATool } from './types.js';

// ============================================================================
// search_llm_logs
// ============================================================================

export const searchLlmLogsTool: PHATool<{
  incidentId?: string;
  fromMs?: number;
  toMs?: number;
  windowMinutes?: number;
  maxEntries?: number;
}> = {
  name: 'search_llm_logs',
  description:
    '在 LLM 请求/响应日志中搜索指定时间窗口内的调用记录，用于定位 incident 根因。可直接传 incidentId 自动计算时间窗口，或手动传 fromMs/toMs。',
  displayName: '搜索 LLM 日志',
  category: 'evolution',
  icon: 'search',
  label: 'Search LLM Logs',
  inputSchema: {
    type: 'object',
    properties: {
      incidentId: {
        type: 'string',
        description: 'Incident ID — 自动从 DB 获取时间戳作为窗口中心',
      },
      fromMs: {
        type: 'number',
        description: 'Time range start (Unix ms). incidentId 优先；二者均缺省时取当天最近记录',
      },
      toMs: {
        type: 'number',
        description: 'Time range end (Unix ms)',
      },
      windowMinutes: {
        type: 'number',
        description: '围绕 incident 时间戳的窗口大小（分钟，默认 60）',
      },
      maxEntries: {
        type: 'number',
        description: '返回最多几条记录（默认 10）',
      },
    },
  },
  execute: async (args) => {
    const windowMs = (args.windowMinutes ?? 60) * 60 * 1000;
    const maxEntries = args.maxEntries ?? 10;

    let fromMs = args.fromMs;
    let toMs = args.toMs;

    // If incidentId provided, derive time window from incident timestamp
    if (args.incidentId) {
      const incident = getIncident(args.incidentId);
      if (!incident) {
        return { success: false, error: `Incident not found: ${args.incidentId}` };
      }
      const center = incident.timestamp;
      fromMs = center - windowMs / 2;
      toMs = center + windowMs / 2;
    }

    // Determine which dates to read
    const datesToRead = new Set<string | undefined>();
    if (fromMs && toMs) {
      // May span midnight — collect all relevant dates
      const startDate = new Date(fromMs).toISOString().split('T')[0];
      const endDate = new Date(toMs).toISOString().split('T')[0];
      datesToRead.add(startDate);
      if (endDate !== startDate) datesToRead.add(endDate);
    } else {
      // No time filter — read latest log file
      datesToRead.add(undefined);
    }

    // Collect all pairs from relevant log files
    const allPairs: ReturnType<typeof readLlmLogFile> = [];
    for (const date of datesToRead) {
      const pairs = readLlmLogFile(date, 500);
      allPairs.push(...pairs);
    }

    // Deduplicate by id (same pair may appear in multiple reads)
    const seen = new Set<number>();
    const uniquePairs = allPairs.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Filter by time window
    const filtered =
      fromMs && toMs
        ? uniquePairs.filter((p) => {
            const t = new Date(p.timestamp).getTime();
            return !isNaN(t) && t >= fromMs! && t <= toMs!;
          })
        : uniquePairs;

    // Sort newest first, apply limit
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limited = filtered.slice(0, maxEntries);

    // Extract human-readable fields from request/response data
    const entries = limited.map((pair) => {
      const userMessage = extractLastUserMessage(pair.requestData);
      const assistantResponse = extractAssistantText(pair.responseData);
      const toolCalls = extractToolCalls(pair.responseData);

      return {
        requestTime: pair.timestamp,
        model: pair.model,
        provider: pair.provider,
        latencyMs: pair.latencyMs,
        inputTokens: pair.inputTokens,
        outputTokens: pair.outputTokens,
        userMessage: userMessage ? truncate(userMessage, 500) : null,
        assistantResponse: assistantResponse ? truncate(assistantResponse, 500) : null,
        toolCalls,
      };
    });

    return {
      success: true,
      incidentId: args.incidentId,
      windowStart: fromMs ? new Date(fromMs).toISOString() : null,
      windowEnd: toMs ? new Date(toMs).toISOString() : null,
      totalMatched: filtered.length,
      returned: entries.length,
      entries,
    };
  },
};

// ============================================================================
// Helpers
// ============================================================================

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
}

function extractLastUserMessage(requestData: unknown): string | null {
  if (!requestData || typeof requestData !== 'object') return null;
  const d = requestData as Record<string, unknown>;

  const messages = d.messages;
  if (!Array.isArray(messages)) return null;

  // Find the last message with role === "user"
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      // Anthropic multi-part content: [{type:"text", text:"..."}]
      const textParts = (msg.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string);
      if (textParts.length > 0) return textParts.join('\n');
    }
  }

  return null;
}

function extractAssistantText(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== 'object') return null;
  const d = responseData as Record<string, unknown>;

  // Anthropic rebuilt format: { type:"message", content: [{type:"text",text:"..."}] }
  if (d.type === 'message' && Array.isArray(d.content)) {
    const textBlocks = (d.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string);
    if (textBlocks.length > 0) return textBlocks.join('\n');
  }

  // OpenAI rebuilt format: { choices: [{message:{content:"..."}}] }
  if (Array.isArray(d.choices) && d.choices.length > 0) {
    const choice = d.choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === 'string') return message.content;
  }

  return null;
}

function extractToolCalls(responseData: unknown): Array<{ name: string; input: unknown }> {
  if (!responseData || typeof responseData !== 'object') return [];
  const d = responseData as Record<string, unknown>;

  // Anthropic rebuilt format: { content: [{type:"tool_use",name:"...",input:{}}] }
  if (d.type === 'message' && Array.isArray(d.content)) {
    return (d.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({ name: (c.name as string) ?? 'unknown', input: c.input }));
  }

  // OpenAI rebuilt format: { choices: [{message:{tool_calls:[{function:{name,arguments}}]}}] }
  if (Array.isArray(d.choices) && d.choices.length > 0) {
    const choice = d.choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    const toolCalls = message?.tool_calls;
    if (Array.isArray(toolCalls)) {
      return toolCalls.map((tc: unknown) => {
        const t = tc as Record<string, unknown>;
        const fn = t.function as Record<string, unknown> | undefined;
        let input: unknown = fn?.arguments;
        if (typeof input === 'string') {
          try {
            input = JSON.parse(input);
          } catch {
            // keep as string
          }
        }
        return { name: (fn?.name as string) ?? 'unknown', input };
      });
    }
  }

  return [];
}

// ============================================================================
// Export
// ============================================================================

export const llmLogTools = [searchLlmLogsTool];
