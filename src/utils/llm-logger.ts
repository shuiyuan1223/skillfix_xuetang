/**
 * LLM Request/Response Logger
 *
 * Intercepts actual HTTP requests to LLM APIs and logs raw request/response bodies.
 */

import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { getStateDir } from "./config.js";

const LOG_DIR = join(getStateDir(), "llm-logs");

// LLM API endpoints to intercept
const LLM_API_PATTERNS = [
  "api.openai.com",
  "api.anthropic.com",
  "openrouter.ai",
  "api.groq.com",
  "api.mistral.ai",
  "generativelanguage.googleapis.com",
  "api.x.ai",
  "api.deepseek.com",
  "api.moonshot.cn",
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
  return LLM_API_PATTERNS.some((pattern) => url.includes(pattern));
}

function logEntry(entry: { type: "request" | "response"; url: string; data: unknown }): void {
  try {
    ensureLogDir();
    const fullEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(getLogFile(), JSON.stringify(fullEntry) + "\n");
  } catch (e) {
    console.warn("Failed to log LLM interaction:", e);
  }
}

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

    // Log request
    let requestBody: unknown;
    try {
      if (init?.body) {
        requestBody = JSON.parse(init.body as string);
      }
    } catch {
      requestBody = init?.body;
    }

    logEntry({
      type: "request",
      url,
      data: requestBody,
    });

    // Make actual request
    const response = await originalFetch(input, init);

    // Clone response to read body without consuming it
    const clonedResponse = response.clone();

    // Log response asynchronously
    clonedResponse.text().then((text) => {
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }

      logEntry({
        type: "response",
        url,
        data: responseBody,
      });
    });

    return response;
  };

  // @ts-expect-error - Bun's fetch type is slightly different
  globalThis.fetch = interceptedFetch;

  console.log("[LLM Logger] Fetch interceptor installed");
}
