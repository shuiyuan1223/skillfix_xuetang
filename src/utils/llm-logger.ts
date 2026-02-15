/**
 * LLM Request/Response Logger
 *
 * Intercepts actual HTTP requests to LLM APIs and logs raw request/response bodies.
 * Handles SSE streaming responses by reassembling them into standard API response format.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getStateDir } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("LLM/Logger");

const LOG_DIR = join(getStateDir(), "llm-logs");

// LLM API endpoints to intercept
const LLM_API_PATTERNS: { domain: string; name: string }[] = [
  { domain: "api.openai.com", name: "openai" },
  { domain: "api.anthropic.com", name: "anthropic" },
  { domain: "openrouter.ai", name: "openrouter" },
  { domain: "api.groq.com", name: "groq" },
  { domain: "api.mistral.ai", name: "mistral" },
  { domain: "generativelanguage.googleapis.com", name: "google" },
  { domain: "api.x.ai", name: "xai" },
  { domain: "api.deepseek.com", name: "deepseek" },
  { domain: "api.moonshot.cn", name: "moonshot" },
];

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFile(): string {
  const date = new Date().toISOString().split("T")[0];
  return join(LOG_DIR, `llm-${date}.jsonl`);
}

function isLLMEndpoint(url: string): boolean {
  return LLM_API_PATTERNS.some((p) => url.includes(p.domain));
}

function extractMeta(url: string, body: Record<string, unknown> | null): Record<string, unknown> {
  const provider = LLM_API_PATTERNS.find((p) => url.includes(p.domain))?.name;
  const model = body?.model;
  const meta: Record<string, unknown> = {};
  if (provider) meta.provider = provider;
  if (model) meta.model = model;
  return meta;
}

// --- Subscriber system for real-time LLM log updates ---

type LlmLogSubscriber = (pair: LLMCallPair) => void;
const llmSubscribers = new Set<LlmLogSubscriber>();
let pendingRequest: LLMLogEntry | null = null;
let pairIdCounter = 0;

/** Subscribe to new LLM call pairs in real-time */
export function subscribeToLlmLogs(callback: LlmLogSubscriber): () => void {
  llmSubscribers.add(callback);
  return () => {
    llmSubscribers.delete(callback);
  };
}

function notifyLlmSubscribers(entry: Record<string, unknown>): void {
  if (llmSubscribers.size === 0) return;

  const typed = entry as unknown as LLMLogEntry;
  if (typed.type === "request") {
    pendingRequest = typed;
  } else if (typed.type === "response" && pendingRequest) {
    const req = pendingRequest;
    pendingRequest = null;

    const tokenUsage = extractTokenUsage(typed.data);
    let latencyMs: number | undefined;
    if (req.timestamp && typed.timestamp) {
      const reqTime = new Date(req.timestamp).getTime();
      const resTime = new Date(typed.timestamp).getTime();
      if (!isNaN(reqTime) && !isNaN(resTime)) latencyMs = resTime - reqTime;
    }

    const pair: LLMCallPair = {
      id: ++pairIdCounter,
      timestamp: req.timestamp,
      provider: (req.provider as string) || "unknown",
      model:
        (req.model as string) ||
        ((req.data as Record<string, unknown>)?.model as string) ||
        "unknown",
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      latencyMs,
      status: typed.status,
      stream: !!(req.data as Record<string, unknown>)?.stream,
      requestData: req.data,
      responseData: typed.data,
    };

    for (const sub of llmSubscribers) {
      try {
        sub(pair);
      } catch {
        // Subscriber errors should not break logging
      }
    }
  }
}

function logEntry(entry: Record<string, unknown>): void {
  try {
    ensureLogDir();
    const fullEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(getLogFile(), JSON.stringify(fullEntry) + "\n");
    notifyLlmSubscribers(fullEntry);
  } catch (e) {
    log.warn("Failed to log LLM interaction", e);
  }
}

// --- SSE parsing helpers ---

interface AnthropicRebuilt {
  id?: string;
  type: "message";
  model?: string;
  role: "assistant";
  content: Array<
    { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function rebuildAnthropicResponse(
  events: Array<{ event?: string; data: unknown }>
): AnthropicRebuilt {
  const result: AnthropicRebuilt = {
    type: "message",
    role: "assistant",
    content: [],
  };
  // Track current content block being built
  let currentBlockIndex = -1;
  // Accumulate tool_use input JSON strings per block index
  const toolJsonParts: Map<number, string[]> = new Map();

  for (const { event, data } of events) {
    const d = data as Record<string, unknown>;

    if (event === "message_start") {
      const msg = d.message as Record<string, unknown> | undefined;
      if (msg) {
        if (msg.id) result.id = msg.id as string;
        if (msg.model) result.model = msg.model as string;
        const usage = msg.usage as Record<string, number> | undefined;
        if (usage) {
          result.usage = { ...result.usage, input_tokens: usage.input_tokens };
        }
      }
    } else if (event === "content_block_start") {
      currentBlockIndex = (d.index as number) ?? result.content.length;
      const cb = d.content_block as Record<string, unknown> | undefined;
      if (cb?.type === "text") {
        result.content[currentBlockIndex] = { type: "text", text: (cb.text as string) ?? "" };
      } else if (cb?.type === "tool_use") {
        result.content[currentBlockIndex] = {
          type: "tool_use",
          id: (cb.id as string) ?? "",
          name: (cb.name as string) ?? "",
          input: {},
        };
        toolJsonParts.set(currentBlockIndex, []);
      }
    } else if (event === "content_block_delta") {
      const idx = (d.index as number) ?? currentBlockIndex;
      const delta = d.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        const block = result.content[idx];
        if (block && block.type === "text") {
          block.text += (delta.text as string) ?? "";
        }
      } else if (delta?.type === "input_json_delta") {
        const parts = toolJsonParts.get(idx);
        if (parts) {
          parts.push((delta.partial_json as string) ?? "");
        }
      }
    } else if (event === "message_delta") {
      const delta = d.delta as Record<string, unknown> | undefined;
      if (delta?.stop_reason) result.stop_reason = delta.stop_reason as string;
      const usage = d.usage as Record<string, number> | undefined;
      if (usage) {
        result.usage = { ...result.usage, output_tokens: usage.output_tokens };
      }
    }
  }

  // Parse accumulated tool JSON
  for (const [idx, parts] of toolJsonParts) {
    const block = result.content[idx];
    if (block && block.type === "tool_use" && parts.length > 0) {
      try {
        block.input = JSON.parse(parts.join(""));
      } catch {
        block.input = parts.join("");
      }
    }
  }

  return result;
}

interface OpenAIRebuilt {
  id?: string;
  model?: string;
  choices: Array<{
    message: { role: "assistant"; content: string | null; tool_calls?: unknown[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function rebuildOpenAIResponse(events: Array<{ event?: string; data: unknown }>): OpenAIRebuilt {
  const result: OpenAIRebuilt = {
    choices: [{ message: { role: "assistant", content: null }, finish_reason: undefined }],
  };
  const contentParts: string[] = [];
  // tool_calls: index -> {id, type, function: {name, arguments}}
  const toolCallMap: Map<
    number,
    { id: string; type: string; function: { name: string; arguments: string } }
  > = new Map();

  for (const { data } of events) {
    const d = data as Record<string, unknown>;
    if (d.id && !result.id) result.id = d.id as string;
    if (d.model && !result.model) result.model = d.model as string;

    // Usage chunk (sent when stream_options.include_usage is true)
    if (d.usage) {
      result.usage = d.usage as OpenAIRebuilt["usage"];
    }

    const choices = d.choices as Array<Record<string, unknown>> | undefined;
    if (choices && choices.length > 0) {
      const choice = choices[0];
      if (choice.finish_reason) {
        result.choices[0].finish_reason = choice.finish_reason as string;
      }
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (delta) {
        if (typeof delta.content === "string") {
          contentParts.push(delta.content);
        }
        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const idx = (tc.index as number) ?? 0;
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, {
                id: (tc.id as string) ?? "",
                type: (tc.type as string) ?? "function",
                function: { name: "", arguments: "" },
              });
            }
            const existing = toolCallMap.get(idx)!;
            if (tc.id) existing.id = tc.id as string;
            const fn = tc.function as Record<string, string> | undefined;
            if (fn) {
              if (fn.name) existing.function.name += fn.name;
              if (fn.arguments) existing.function.arguments += fn.arguments;
            }
          }
        }
      }
    }
  }

  if (contentParts.length > 0) {
    result.choices[0].message.content = contentParts.join("");
  }

  if (toolCallMap.size > 0) {
    result.choices[0].message.tool_calls = Array.from(toolCallMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);
  }

  return result;
}

function parseSSEText(text: string): Array<{ event?: string; data: unknown }> {
  const events: Array<{ event?: string; data: unknown }> = [];
  let currentEvent: string | undefined;
  let dataLines: string[] = [];

  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) {
      // Flush previous if we had data
      if (dataLines.length > 0) {
        const raw = dataLines.join("\n").trim();
        if (raw && raw !== "[DONE]") {
          try {
            events.push({ event: currentEvent, data: JSON.parse(raw) });
          } catch {
            // skip unparseable
          }
        }
        dataLines = [];
      }
      currentEvent = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const value = line.slice("data:".length).trim();
      if (value === "[DONE]") {
        // Flush any remaining
        if (dataLines.length > 0) {
          const raw = dataLines.join("\n").trim();
          if (raw && raw !== "[DONE]") {
            try {
              events.push({ event: currentEvent, data: JSON.parse(raw) });
            } catch {
              // skip
            }
          }
          dataLines = [];
        }
        currentEvent = undefined;
      } else {
        dataLines.push(value);
      }
    } else if (line.trim() === "") {
      // Empty line = end of event
      if (dataLines.length > 0) {
        const raw = dataLines.join("\n").trim();
        if (raw && raw !== "[DONE]") {
          try {
            events.push({ event: currentEvent, data: JSON.parse(raw) });
          } catch {
            // skip
          }
        }
        dataLines = [];
        currentEvent = undefined;
      }
    }
  }

  // Flush any remaining data
  if (dataLines.length > 0) {
    const raw = dataLines.join("\n").trim();
    if (raw && raw !== "[DONE]") {
      try {
        events.push({ event: currentEvent, data: JSON.parse(raw) });
      } catch {
        // skip
      }
    }
  }

  return events;
}

function isAnthropicSSE(url: string, events: Array<{ event?: string; data: unknown }>): boolean {
  if (url.includes("api.anthropic.com")) return true;
  // Check for Anthropic-style events (openrouter may proxy)
  return events.some((e) => e.event === "message_start" || e.event === "content_block_start");
}

function rebuildSSEResponse(
  url: string,
  text: string
): { rebuilt: unknown; format: "anthropic" | "openai" } | null {
  const events = parseSSEText(text);
  if (events.length === 0) return null;

  if (isAnthropicSSE(url, events)) {
    return { rebuilt: rebuildAnthropicResponse(events), format: "anthropic" };
  }
  return { rebuilt: rebuildOpenAIResponse(events), format: "openai" };
}

// --- LLM Log Reader ---

export interface LLMLogEntry {
  timestamp: string;
  type: "request" | "response";
  url: string;
  provider?: string;
  model?: string;
  status?: number;
  stream?: boolean;
  data?: unknown;
}

/** Paired request-response call */
export interface LLMCallPair {
  id: number;
  timestamp: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  status?: number;
  stream: boolean;
  requestData?: unknown;
  responseData?: unknown;
}

function extractTokenUsage(data: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;

  // Anthropic format: { usage: { input_tokens, output_tokens } }
  if (d.usage && typeof d.usage === "object") {
    const usage = d.usage as Record<string, unknown>;
    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
    // OpenAI format: { usage: { prompt_tokens, completion_tokens, total_tokens } }
    const prompt = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
    const completion =
      typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
    const total = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;

    return {
      inputTokens: input ?? prompt,
      outputTokens: output ?? completion,
      totalTokens:
        total ??
        ((input ?? prompt) && (output ?? completion)
          ? (input ?? prompt)! + (output ?? completion)!
          : undefined),
    };
  }
  return {};
}

/** Read LLM log file and pair request-response entries */
export function readLlmLogFile(date?: string, limit?: number): LLMCallPair[] {
  if (!existsSync(LOG_DIR)) return [];

  let logFile: string;
  if (date) {
    logFile = join(LOG_DIR, `llm-${date}.jsonl`);
  } else {
    // Find latest log file
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.startsWith("llm-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();
    if (files.length === 0) return [];
    logFile = join(LOG_DIR, files[0]);
  }

  if (!existsSync(logFile)) return [];

  let content: string;
  try {
    content = readFileSync(logFile, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter(Boolean);
  const entries: LLMLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as LLMLogEntry);
    } catch {
      // skip unparseable lines
    }
  }

  // Pair requests with responses
  const pairs: LLMCallPair[] = [];
  let id = 1;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "request") continue;

    // Look for the next response with same url
    let responseEntry: LLMLogEntry | undefined;
    for (let j = i + 1; j < entries.length && j <= i + 5; j++) {
      if (entries[j].type === "response" && entries[j].url === entry.url) {
        responseEntry = entries[j];
        break;
      }
    }

    const tokenUsage = responseEntry ? extractTokenUsage(responseEntry.data) : {};

    let latencyMs: number | undefined;
    if (entry.timestamp && responseEntry?.timestamp) {
      const reqTime = new Date(entry.timestamp).getTime();
      const resTime = new Date(responseEntry.timestamp).getTime();
      if (!isNaN(reqTime) && !isNaN(resTime)) {
        latencyMs = resTime - reqTime;
      }
    }

    pairs.push({
      id: id++,
      timestamp: entry.timestamp,
      provider: (entry.provider as string) || "unknown",
      model:
        (entry.model as string) ||
        ((entry.data as Record<string, unknown>)?.model as string) ||
        "unknown",
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      latencyMs,
      status: responseEntry?.status,
      stream: !!(entry.data as Record<string, unknown>)?.stream,
      requestData: entry.data,
      responseData: responseEntry?.data,
    });
  }

  // Reverse so newest first, apply limit
  pairs.reverse();
  if (limit && pairs.length > limit) {
    return pairs.slice(0, limit);
  }
  return pairs;
}

/** Get distinct provider names from LLM logs */
export function getLlmProviders(date?: string): string[] {
  const pairs = readLlmLogFile(date, 1000);
  return [...new Set(pairs.map((p) => p.provider).filter((p) => p !== "unknown"))].sort();
}

/** Get distinct model names from LLM logs */
export function getLlmModels(date?: string): string[] {
  const pairs = readLlmLogFile(date, 1000);
  return [...new Set(pairs.map((p) => p.model).filter((m) => m !== "unknown"))].sort();
}

// --- Main interceptor ---

/**
 * Install fetch interceptor to log all LLM API requests/responses
 */
export function installFetchInterceptor(): void {
  const originalFetch = globalThis.fetch.bind(globalThis);

  const interceptedFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Only intercept LLM API calls
    if (!isLLMEndpoint(url)) {
      return originalFetch(input, init);
    }

    // Parse request body
    let requestBody: Record<string, unknown> | null = null;
    try {
      if (init?.body) {
        requestBody = JSON.parse(init.body as string) as Record<string, unknown>;
      }
    } catch {
      // body not JSON-parseable, store as-is
    }

    const meta = extractMeta(url, requestBody);
    const isStream = requestBody?.stream === true;

    // Log request with full body and metadata
    logEntry({
      type: "request",
      url,
      ...meta,
      data: requestBody,
    });

    // Make actual request
    const response = await originalFetch(input, init);

    // Clone response to read body without consuming it
    const clonedResponse = response.clone();

    // Detect SSE from Content-Type or request body
    const contentType = response.headers.get("content-type") ?? "";
    const isSSE = isStream || contentType.includes("text/event-stream");

    // Log response asynchronously
    clonedResponse.text().then((text) => {
      let responseData: unknown;

      if (isSSE) {
        const result = rebuildSSEResponse(url, text);
        if (result) {
          responseData = result.rebuilt;
        } else {
          // Fallback: couldn't parse SSE events — include raw text for debugging
          responseData = { _raw_sse: true, _length: text.length, _preview: text.slice(0, 500) };
        }
      } else {
        // Non-streaming: parse JSON directly
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = text;
        }
      }

      logEntry({
        type: "response",
        url,
        ...meta,
        status: response.status,
        ...(isSSE ? { stream: true } : {}),
        data: responseData,
      });
    });

    return response;
  };

  // @ts-expect-error - Bun's fetch type is slightly different
  globalThis.fetch = interceptedFetch;

  log.info("Fetch interceptor installed");
}
