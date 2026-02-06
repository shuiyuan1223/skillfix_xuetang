/**
 * LLM Request/Response Logger
 *
 * Logs LLM interactions for debugging and comparison across environments.
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
  sessionId?: string;
  type: "request" | "response" | "tool_call" | "tool_result" | "error";
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
 * Log a user message being sent to the agent
 */
export function logUserMessage(
  sessionId: string,
  message: string,
  model?: string,
  provider?: string
): void {
  logLLM({
    sessionId,
    type: "request",
    model,
    provider,
    data: { role: "user", content: message },
  });
}

/**
 * Log an assistant response
 */
export function logAssistantMessage(
  sessionId: string,
  message: string,
  model?: string,
  provider?: string
): void {
  logLLM({
    sessionId,
    type: "response",
    model,
    provider,
    data: { role: "assistant", content: message },
  });
}

/**
 * Log a tool call
 */
export function logToolCall(
  sessionId: string,
  toolName: string,
  args: unknown,
  model?: string
): void {
  logLLM({
    sessionId,
    type: "tool_call",
    model,
    data: { tool: toolName, arguments: args },
  });
}

/**
 * Log a tool result
 */
export function logToolResult(
  sessionId: string,
  toolName: string,
  result: unknown,
  isError: boolean
): void {
  logLLM({
    sessionId,
    type: "tool_result",
    data: { tool: toolName, result, isError },
  });
}

/**
 * Log an error
 */
export function logError(sessionId: string, error: unknown): void {
  logLLM({
    sessionId,
    type: "error",
    data: { error: error instanceof Error ? error.message : String(error) },
  });
}
