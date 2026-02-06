/**
 * LLM Request/Response Logger
 *
 * Logs raw LLM API requests and responses for debugging.
 */

import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { getStateDir } from "./config.js";

const LOG_DIR = join(getStateDir(), "llm-logs");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFile(): string {
  const date = new Date().toISOString().split("T")[0];
  return join(LOG_DIR, `llm-${date}.jsonl`);
}

export interface LLMLogEntry {
  timestamp: string;
  sessionId: string;
  type: "request" | "response";
  model?: string;
  provider?: string;
  data: unknown;
}

/**
 * Log an LLM interaction
 */
export function logLLM(entry: Omit<LLMLogEntry, "timestamp">): void {
  try {
    ensureLogDir();
    const fullEntry: LLMLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(getLogFile(), JSON.stringify(fullEntry) + "\n");
  } catch (e) {
    console.warn("Failed to log LLM interaction:", e);
  }
}

/**
 * Log the full API request (what's sent to the LLM)
 */
export function logRequest(
  sessionId: string,
  request: {
    systemPrompt: string;
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
    messages: unknown[];
  },
  model?: string,
  provider?: string
): void {
  logLLM({
    sessionId,
    type: "request",
    model,
    provider,
    data: request,
  });
}

/**
 * Log the API response (what comes back from the LLM)
 */
export function logResponse(
  sessionId: string,
  response: {
    content: unknown;
    toolCalls?: Array<{ name: string; arguments: unknown }>;
    stopReason?: string;
    usage?: { input: number; output: number };
  },
  model?: string,
  provider?: string
): void {
  logLLM({
    sessionId,
    type: "response",
    model,
    provider,
    data: response,
  });
}
