/**
 * E2E Test Infrastructure
 *
 * Provides:
 * - Mock LLM server (OpenAI-compatible streaming)
 * - PHA Gateway server lifecycle (start/stop with random ports)
 * - Helper functions for session init, navigation, actions, chat
 *
 * Uses a singleton pattern so all test files share one server instance.
 */

import * as fs from "fs";
import * as path from "path";
import { startGateway } from "../../src/gateway/server.js";

// ============================================================================
// Mock LLM Server
// ============================================================================

const MOCK_RESPONSE = "Hello from PHA test";

function createMockLLMServer(): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0, // Random port
    async fetch(req) {
      const url = new URL(req.url);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      // Models endpoint
      if (url.pathname === "/v1/models") {
        return Response.json({
          data: [{ id: "test-model", object: "model" }],
        });
      }

      // Chat completions — return SSE stream
      if (url.pathname === "/v1/chat/completions") {
        const body = await req.json().catch(() => ({}));
        const stream = (body as Record<string, unknown>).stream;

        if (!stream) {
          // Non-streaming response
          return Response.json({
            id: "chatcmpl-test",
            object: "chat.completion",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: MOCK_RESPONSE },
                finish_reason: "stop",
              },
            ],
          });
        }

        // Streaming response
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          start(controller) {
            const chunks = [MOCK_RESPONSE];
            for (const chunk of chunks) {
              const data = JSON.stringify({
                id: "chatcmpl-test",
                object: "chat.completion.chunk",
                choices: [
                  {
                    index: 0,
                    delta: { content: chunk },
                    finish_reason: null,
                  },
                ],
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            // Send finish
            const finishData = JSON.stringify({
              id: "chatcmpl-test",
              object: "chat.completion.chunk",
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            });
            controller.enqueue(encoder.encode(`data: ${finishData}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          },
        });

        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

// ============================================================================
// Singleton Test Server
// ============================================================================

export interface TestContext {
  server: ReturnType<typeof Bun.serve>;
  baseUrl: string;
  mockLLM: ReturnType<typeof Bun.serve>;
  stateDir: string;
  cleanup: () => void;
}

let _singleton: Promise<TestContext> | null = null;
let _cleanupRegistered = false;

/**
 * Get the shared test server. Creates it on first call, returns cached
 * promise on subsequent calls. This ensures all test files share one
 * server and one PHA_STATE_DIR — no env var races.
 *
 * Cleanup happens automatically on process exit. Do NOT call ctx.cleanup()
 * in afterAll — it would kill the server for other test files.
 */
export function getTestServer(): Promise<TestContext> {
  if (!_singleton) {
    _singleton = _startTestServer();
    // Register cleanup only once, on process exit
    if (!_cleanupRegistered) {
      _cleanupRegistered = true;
      process.on("beforeExit", () => {
        _singleton?.then((ctx) => ctx.cleanup()).catch(() => {});
      });
    }
  }
  return _singleton;
}

async function _startTestServer(): Promise<TestContext> {
  // 1. Create isolated state directory
  const stateDir = `/tmp/pha-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.mkdirSync(stateDir, { recursive: true });

  // 2. Start mock LLM server
  const mockLLM = createMockLLMServer();
  const mockLLMUrl = `http://localhost:${mockLLM.port}/v1`;

  // 3. Write test config
  const config = {
    gateway: { port: 0 },
    llm: {
      provider: "openai",
      apiKey: "test-key-not-real",
      baseUrl: mockLLMUrl,
      modelId: "test-model",
    },
    dataSources: { type: "mock" },
    embedding: { enabled: false },
  };
  fs.writeFileSync(path.join(stateDir, "config.json"), JSON.stringify(config, null, 2));

  // 4. Set env to use our isolated state (set BEFORE starting gateway)
  process.env.PHA_STATE_DIR = stateDir;

  // 5. Start PHA Gateway on random port
  const server = await startGateway({
    port: 0,
    provider: "openai",
    apiKey: "test-key-not-real",
    baseUrl: mockLLMUrl,
    modelId: "test-model",
  });

  const baseUrl = `http://localhost:${server.port}`;

  const cleanup = () => {
    try {
      server.stop(true);
    } catch {
      /* noop */
    }
    try {
      mockLLM.stop(true);
    } catch {
      /* noop */
    }
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
    delete process.env.PHA_STATE_DIR;
  };

  return { server, baseUrl, mockLLM, stateDir, cleanup };
}

// ============================================================================
// Helper Functions
// ============================================================================

export async function initSession(
  baseUrl: string,
  uuid?: string
): Promise<{ sessionId: string; uid: string; updates: unknown[] }> {
  const res = await fetch(`${baseUrl}/api/a2ui/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid: uuid || crypto.randomUUID() }),
  });
  if (!res.ok) throw new Error(`init failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function navigate(
  baseUrl: string,
  view: string,
  cookie?: string
): Promise<{ updates: unknown[] }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${baseUrl}/api/a2ui/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "navigate", view }),
  });
  if (!res.ok) throw new Error(`navigate failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sendAction(
  baseUrl: string,
  action: string,
  payload?: Record<string, unknown>,
  cookie?: string
): Promise<{ updates: unknown[] }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${baseUrl}/api/a2ui/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "action", action, payload }),
  });
  if (!res.ok) throw new Error(`action failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface AGUIEvent {
  type: string;
  [key: string]: unknown;
}

export async function sendChat(
  baseUrl: string,
  message: string,
  threadId?: string
): Promise<AGUIEvent[]> {
  const res = await fetch(`${baseUrl}/api/ag-ui`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId || crypto.randomUUID(),
      messages: [{ role: "user", content: message }],
    }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status} ${await res.text()}`);

  const text = await res.text();
  const events: AGUIEvent[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // skip non-JSON lines
      }
    }
  }
  return events;
}

/**
 * Find a page update in updates array.
 */
export function findPageUpdate(updates: unknown[]): Record<string, unknown> | undefined {
  return (updates as Record<string, unknown>[]).find((u) => u.type === "page");
}

/**
 * Extract sidebar from page update.
 */
export function getSidebar(update: Record<string, unknown>): Record<string, unknown> | undefined {
  const surfaces = update.surfaces as Record<string, unknown> | undefined;
  return surfaces?.sidebar as Record<string, unknown> | undefined;
}

/**
 * Extract main surface from page update.
 */
export function getMain(update: Record<string, unknown>): Record<string, unknown> | undefined {
  const surfaces = update.surfaces as Record<string, unknown> | undefined;
  return surfaces?.main as Record<string, unknown> | undefined;
}
