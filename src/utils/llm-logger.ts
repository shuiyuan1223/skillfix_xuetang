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
 * Format matches OpenAI/Anthropic API request structure
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
  // Convert to standard API request format
  const apiMessages = [
    { role: "system", content: request.systemPrompt },
    ...((request.messages as any[]) || []).map((msg) => {
      if (msg.role === "user") {
        const textContent = msg.content?.find?.((c: any) => c.type === "text");
        return { role: "user", content: textContent?.text || msg.content };
      } else if (msg.role === "assistant") {
        const textBlocks = msg.content?.filter?.((c: any) => c.type === "text") || [];
        const toolCalls = msg.content?.filter?.((c: any) => c.type === "toolCall") || [];
        return {
          role: "assistant",
          content: textBlocks.map((t: any) => t.text).join("") || null,
          tool_calls:
            toolCalls.length > 0
              ? toolCalls.map((tc: any) => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                }))
              : undefined,
        };
      } else if (msg.role === "toolResult") {
        const textContent = msg.content?.find?.((c: any) => c.type === "text");
        return {
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: textContent?.text || JSON.stringify(msg.content),
        };
      }
      return msg;
    }),
  ];

  // Convert tools to OpenAI format
  const apiTools = request.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  logLLM({
    sessionId,
    type: "request",
    model,
    provider,
    data: {
      model,
      messages: apiMessages,
      tools: apiTools,
    },
  });
}

/**
 * Log the API response (what comes back from the LLM)
 * Format matches OpenAI API response structure
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
  // Convert to standard API response format
  const apiResponse = {
    model,
    choices: [
      {
        message: {
          role: "assistant",
          content: response.content || null,
          tool_calls: response.toolCalls?.map((tc, i) => ({
            id: `call_${i}`,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        },
        finish_reason: response.stopReason === "toolUse" ? "tool_calls" : "stop",
      },
    ],
    usage: response.usage
      ? {
          prompt_tokens: response.usage.input,
          completion_tokens: response.usage.output,
          total_tokens: response.usage.input + response.usage.output,
        }
      : undefined,
  };

  logLLM({
    sessionId,
    type: "response",
    model,
    provider,
    data: apiResponse,
  });
}
