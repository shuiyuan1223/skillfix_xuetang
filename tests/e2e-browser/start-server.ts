/**
 * Bun script to start PHA Gateway + Mock LLM for Playwright tests.
 * Spawned by global-setup.ts as a child process (runs in Bun runtime).
 *
 * Writes { port, pid } to a temp file so Playwright can connect.
 */

import * as fs from "fs";
import * as path from "path";
import { startGateway } from "../../src/gateway/server.js";

const MOCK_RESPONSE = "Hello from PHA test";
const INFO_FILE = "/tmp/pha-e2e-browser-info.json";

// 1. Create isolated state directory
const stateDir = `/tmp/pha-e2e-browser-${Date.now()}`;
fs.mkdirSync(stateDir, { recursive: true });

// 2. Start mock LLM server
const mockLLM = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }
    if (url.pathname === "/v1/models") {
      return Response.json({ data: [{ id: "test-model", object: "model" }] });
    }
    if (url.pathname === "/v1/chat/completions") {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (!body.stream) {
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
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { content: MOCK_RESPONSE }, finish_reason: null }],
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          const finish = JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          });
          controller.enqueue(encoder.encode(`data: ${finish}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
      return new Response(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});

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
process.env.PHA_STATE_DIR = stateDir;

// 4. Start PHA Gateway with webDir
const projectRoot = path.resolve(import.meta.dir, "../..");
const webDir = path.join(projectRoot, "ui/dist");

const server = await startGateway({
  port: 0,
  provider: "openai",
  apiKey: "test-key-not-real",
  baseUrl: mockLLMUrl,
  modelId: "test-model",
  webDir,
});

// 5. Write server info so global-setup can read it
const info = {
  port: server.port,
  pid: process.pid,
  stateDir,
  mockLLMPort: mockLLM.port,
};
fs.writeFileSync(INFO_FILE, JSON.stringify(info));

console.log(`PHA_TEST_READY:${server.port}`);

// Keep process alive
process.on("SIGTERM", () => {
  server.stop(true);
  mockLLM.stop(true);
  try {
    fs.rmSync(stateDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
  try {
    fs.unlinkSync(INFO_FILE);
  } catch {
    /* noop */
  }
  process.exit(0);
});
