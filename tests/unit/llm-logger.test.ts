/**
 * Tests for LLM Logger
 *
 * Tests SSE parsing, response rebuilding, and log file reading.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

describe("readLlmLogFile", () => {
  let tmpDir: string;
  let origEnv: string | undefined;

  beforeEach(() => {
    tmpDir = join(import.meta.dir, ".tmp-llm-logger-test");
    mkdirSync(join(tmpDir, "llm-logs"), { recursive: true });
    origEnv = process.env.PHA_STATE_DIR;
    process.env.PHA_STATE_DIR = tmpDir;
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.PHA_STATE_DIR = origEnv;
    } else {
      delete process.env.PHA_STATE_DIR;
    }
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns empty array when log dir does not exist", async () => {
    rmSync(join(tmpDir, "llm-logs"), { recursive: true, force: true });
    // Re-import to get fresh module state
    const { readLlmLogFile } = await import("../../src/utils/llm-logger.js");
    const result = readLlmLogFile("2025-01-01");
    expect(result).toEqual([]);
  });

  test("returns empty array when specific date log file does not exist", async () => {
    const { readLlmLogFile } = await import("../../src/utils/llm-logger.js");
    const result = readLlmLogFile("2099-12-31");
    expect(result).toEqual([]);
  });

  test("pairs request and response entries", async () => {
    const logFile = join(tmpDir, "llm-logs", "llm-2025-01-01.jsonl");
    const entries = [
      JSON.stringify({
        timestamp: "2025-01-01T10:00:00.000Z",
        type: "request",
        url: "https://api.openai.com/v1/chat/completions",
        provider: "openai",
        model: "gpt-4o",
        data: { model: "gpt-4o", messages: [], stream: false },
      }),
      JSON.stringify({
        timestamp: "2025-01-01T10:00:01.000Z",
        type: "response",
        url: "https://api.openai.com/v1/chat/completions",
        provider: "openai",
        model: "gpt-4o",
        status: 200,
        data: {
          choices: [{ message: { content: "Hello" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      }),
    ];
    writeFileSync(logFile, entries.join("\n") + "\n");

    const { readLlmLogFile } = await import("../../src/utils/llm-logger.js");
    const pairs = readLlmLogFile("2025-01-01");
    expect(pairs.length).toBe(1);
    expect(pairs[0].provider).toBe("openai");
    expect(pairs[0].model).toBe("gpt-4o");
    expect(pairs[0].status).toBe(200);
    expect(pairs[0].latencyMs).toBe(1000);
    expect(pairs[0].inputTokens).toBe(10);
    expect(pairs[0].outputTokens).toBe(5);
    expect(pairs[0].totalTokens).toBe(15);
  });

  test("handles request without matching response", async () => {
    const logFile = join(tmpDir, "llm-logs", "llm-2025-01-02.jsonl");
    writeFileSync(
      logFile,
      JSON.stringify({
        timestamp: "2025-01-02T10:00:00.000Z",
        type: "request",
        url: "https://api.anthropic.com/v1/messages",
        provider: "anthropic",
        model: "claude-sonnet-4",
        data: { model: "claude-sonnet-4", messages: [] },
      }) + "\n"
    );

    const { readLlmLogFile } = await import("../../src/utils/llm-logger.js");
    const pairs = readLlmLogFile("2025-01-02");
    expect(pairs.length).toBe(1);
    expect(pairs[0].provider).toBe("anthropic");
    expect(pairs[0].status).toBeUndefined();
    expect(pairs[0].latencyMs).toBeUndefined();
  });

  test("applies limit parameter", async () => {
    const logFile = join(tmpDir, "llm-logs", "llm-2025-01-03.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(
        JSON.stringify({
          timestamp: `2025-01-03T10:0${i}:00.000Z`,
          type: "request",
          url: "https://api.openai.com/v1/chat/completions",
          provider: "openai",
          data: { model: "gpt-4o" },
        })
      );
    }
    writeFileSync(logFile, lines.join("\n") + "\n");

    const { readLlmLogFile } = await import("../../src/utils/llm-logger.js");
    const pairs = readLlmLogFile("2025-01-03", 3);
    expect(pairs.length).toBe(3);
  });

  test("skips unparseable JSONL lines", async () => {
    const logFile = join(tmpDir, "llm-logs", "llm-2025-01-04.jsonl");
    const lines = [
      "not valid json",
      JSON.stringify({
        timestamp: "2025-01-04T10:00:00.000Z",
        type: "request",
        url: "https://api.openai.com/v1/chat/completions",
        provider: "openai",
        data: { model: "gpt-4o" },
      }),
      "{ broken json",
    ];
    writeFileSync(logFile, lines.join("\n") + "\n");

    const { readLlmLogFile } = await import("../../src/utils/llm-logger.js");
    const pairs = readLlmLogFile("2025-01-04");
    expect(pairs.length).toBe(1);
  });
});
