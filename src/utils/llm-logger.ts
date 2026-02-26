/**
 * LLM Request/Response Logger
 *
 * Intercepts actual HTTP requests to LLM APIs and logs raw request/response bodies.
 * Handles SSE streaming responses by reassembling them into standard API response format.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
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
    appendFileSync(getLogFile(), `${JSON.stringify(fullEntry)}\n`);
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

function handleAnthropicMessageStart(
  d: Record<string, unknown>,
  result: AnthropicRebuilt
): void {
  const msg = d.message as Record<string, unknown> | undefined;
  if (!msg) return;
  if (msg.id) result.id = msg.id as string;
  if (msg.model) result.model = msg.model as string;
  const usage = msg.usage as Record<string, number> | undefined;
  if (usage) {
    result.usage = { ...result.usage, input_tokens: usage.input_tokens };
  }
}

function handleAnthropicBlockStart(
  d: Record<string, unknown>,
  result: AnthropicRebuilt,
  toolJsonParts: Map<number, string[]>
): number {
  const idx = (d.index as number) ?? result.content.length;
  const cb = d.content_block as Record<string, unknown> | undefined;
  if (cb?.type === "text") {
    result.content[idx] = { type: "text", text: (cb.text as string) ?? "" };
  } else if (cb?.type === "tool_use") {
    result.content[idx] = {
      type: "tool_use",
      id: (cb.id as string) ?? "",
      name: (cb.name as string) ?? "",
      input: {},
    };
    toolJsonParts.set(idx, []);
  }
  return idx;
}

function handleAnthropicBlockDelta(
  d: Record<string, unknown>,
  result: AnthropicRebuilt,
  currentBlockIndex: number,
  toolJsonParts: Map<number, string[]>
): void {
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
}

function handleAnthropicMessageDelta(
  d: Record<string, unknown>,
  result: AnthropicRebuilt
): void {
  const delta = d.delta as Record<string, unknown> | undefined;
  if (delta?.stop_reason) result.stop_reason = delta.stop_reason as string;
  const usage = d.usage as Record<string, number> | undefined;
  if (usage) {
    result.usage = { ...result.usage, output_tokens: usage.output_tokens };
  }
}

function finalizeToolJsonParts(
  result: AnthropicRebuilt,
  toolJsonParts: Map<number, string[]>
): void {
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
}

function rebuildAnthropicResponse(
  events: Array<{ event?: string; data: unknown }>
): AnthropicRebuilt {
  const result: AnthropicRebuilt = {
    type: "message",
    role: "assistant",
    content: [],
  };
  let currentBlockIndex = -1;
  const toolJsonParts: Map<number, string[]> = new Map();

  for (const { event, data } of events) {
    const d = data as Record<string, unknown>;
    if (event === "message_start") {
      handleAnthropicMessageStart(d, result);
    } else if (event === "content_block_start") {
      currentBlockIndex = handleAnthropicBlockStart(d, result, toolJsonParts);
    } else if (event === "content_block_delta") {
      handleAnthropicBlockDelta(d, result, currentBlockIndex, toolJsonParts);
    } else if (event === "message_delta") {
      handleAnthropicMessageDelta(d, result);
    }
  }

  finalizeToolJsonParts(result, toolJsonParts);
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

type OpenAIToolCall = { id: string; type: string; function: { name: string; arguments: string } };

function processOpenAIChunk(
  d: Record<string, unknown>,
  result: OpenAIRebuilt,
  contentParts: string[],
  toolCallMap: Map<number, OpenAIToolCall>
): void {
  if (d.id && !result.id) result.id = d.id as string;
  if (d.model && !result.model) result.model = d.model as string;
  if (d.usage) result.usage = d.usage as OpenAIRebuilt["usage"];

  const choices = d.choices as Array<Record<string, unknown>> | undefined;
  if (!choices || choices.length === 0) return;

  const choice = choices[0];
  if (choice.finish_reason) {
    result.choices[0].finish_reason = choice.finish_reason as string;
  }

  const delta = choice.delta as Record<string, unknown> | undefined;
  if (!delta) return;

  if (typeof delta.content === "string") contentParts.push(delta.content);
  accumulateOpenAIToolCalls(delta, toolCallMap);
}

function accumulateOpenAIToolCalls(
  delta: Record<string, unknown>,
  toolCallMap: Map<number, OpenAIToolCall>
): void {
  const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
  if (!toolCalls) return;

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

function rebuildOpenAIResponse(events: Array<{ event?: string; data: unknown }>): OpenAIRebuilt {
  const result: OpenAIRebuilt = {
    choices: [{ message: { role: "assistant", content: null }, finish_reason: undefined }],
  };
  const contentParts: string[] = [];
  const toolCallMap: Map<number, OpenAIToolCall> = new Map();

  for (const { data } of events) {
    processOpenAIChunk(data as Record<string, unknown>, result, contentParts, toolCallMap);
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

type SSEEvent = { event?: string; data: unknown };

/** Flush accumulated data lines into a parsed event */
function flushSSEDataLines(
  dataLines: string[],
  currentEvent: string | undefined,
  events: SSEEvent[]
): void {
  if (dataLines.length === 0) return;
  const raw = dataLines.join("\n").trim();
  if (!raw || raw === "[DONE]") return;
  try {
    events.push({ event: currentEvent, data: JSON.parse(raw) });
  } catch {
    // skip unparseable
  }
}

function parseSSEText(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  let currentEvent: string | undefined;
  let dataLines: string[] = [];

  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) {
      flushSSEDataLines(dataLines, currentEvent, events);
      dataLines = [];
      currentEvent = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const value = line.slice("data:".length).trim();
      if (value === "[DONE]") {
        flushSSEDataLines(dataLines, currentEvent, events);
        dataLines = [];
        currentEvent = undefined;
      } else {
        dataLines.push(value);
      }
    } else if (line.trim() === "") {
      flushSSEDataLines(dataLines, currentEvent, events);
      dataLines = [];
      currentEvent = undefined;
    }
  }

  flushSSEDataLines(dataLines, currentEvent, events);
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

/** Resolve the log file path for a given date (or latest) */
function resolveLogFile(date?: string): string | null {
  if (!existsSync(LOG_DIR)) return null;

  if (date) {
    const f = join(LOG_DIR, `llm-${date}.jsonl`);
    return existsSync(f) ? f : null;
  }

  const files = readdirSync(LOG_DIR)
    .filter((f) => f.startsWith("llm-") && f.endsWith(".jsonl"))
    .sort()
    .reverse();
  return files.length > 0 ? join(LOG_DIR, files[0]) : null;
}

/** Parse JSONL file into LLMLogEntry array */
function parseLogEntries(logFile: string): LLMLogEntry[] {
  let content: string;
  try {
    content = readFileSync(logFile, "utf-8");
  } catch {
    return [];
  }

  const entries: LLMLogEntry[] = [];
  for (const line of content.trim().split("\n").filter(Boolean)) {
    try {
      entries.push(JSON.parse(line) as LLMLogEntry);
    } catch {
      // skip unparseable lines
    }
  }
  return entries;
}

/** Calculate latency between two ISO timestamps */
function calcLatency(reqTs: string, resTs?: string): number | undefined {
  if (!resTs) return undefined;
  const reqTime = new Date(reqTs).getTime();
  const resTime = new Date(resTs).getTime();
  if (isNaN(reqTime) || isNaN(resTime)) return undefined;
  return resTime - reqTime;
}

/** Build a LLMCallPair from a request entry and optional response */
function buildCallPair(id: number, req: LLMLogEntry, res?: LLMLogEntry): LLMCallPair {
  const tokenUsage = res ? extractTokenUsage(res.data) : {};
  return {
    id,
    timestamp: req.timestamp,
    provider: (req.provider as string) || "unknown",
    model:
      (req.model as string) ||
      ((req.data as Record<string, unknown>)?.model as string) ||
      "unknown",
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    totalTokens: tokenUsage.totalTokens,
    latencyMs: calcLatency(req.timestamp, res?.timestamp),
    status: res?.status,
    stream: !!(req.data as Record<string, unknown>)?.stream,
    requestData: req.data,
    responseData: res?.data,
  };
}

/** Read LLM log file and pair request-response entries */
export function readLlmLogFile(date?: string, limit?: number): LLMCallPair[] {
  const logFile = resolveLogFile(date);
  if (!logFile) return [];

  const entries = parseLogEntries(logFile);

  const pairs: LLMCallPair[] = [];
  let id = 1;

  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type !== "request") continue;

    let responseEntry: LLMLogEntry | undefined;
    for (let j = i + 1; j < entries.length && j <= i + 5; j++) {
      if (entries[j].type === "response" && entries[j].url === entries[i].url) {
        responseEntry = entries[j];
        break;
      }
    }

    pairs.push(buildCallPair(id++, entries[i], responseEntry));
  }

  pairs.reverse();
  return limit && pairs.length > limit ? pairs.slice(0, limit) : pairs;
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

/**
 * Clean up old LLM log files (older than maxAgeDays).
 */
export function cleanupOldLlmLogs(maxAgeDays: number = 30): void {
  if (!existsSync(LOG_DIR)) return;

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  try {
    const files = readdirSync(LOG_DIR).filter((f) => f.startsWith("llm-") && f.endsWith(".jsonl"));

    for (const file of files) {
      // Extract date from filename: llm-YYYY-MM-DD.jsonl
      const dateMatch = file.match(/^llm-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!dateMatch) continue;

      const fileDate = new Date(dateMatch[1]).getTime();
      if (isNaN(fileDate) || fileDate >= cutoff) continue;

      try {
        unlinkSync(join(LOG_DIR, file));
        deleted++;
      } catch {
        // Skip files that can't be deleted
      }
    }

    if (deleted > 0) {
      log.info(`Cleaned up ${deleted} old LLM log file(s)`);
    }
  } catch {
    // Ignore errors during cleanup
  }
}
