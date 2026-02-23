/**
 * Tests for Config Utilities
 *
 * Tests configuration loading, saving, and value manipulation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { PHAConfig } from "../../src/utils/config.js";
import * as fs from "fs";
import * as path from "path";

// We need to test config functions with a temporary directory
// Since config.ts uses getStateDir() which depends on findProjectRoot(),
// we test the value manipulation functions with a mock approach

describe("Config Value Manipulation", () => {
  // Test the logic of getConfigValue/setConfigValue without file I/O
  // by testing the path-based accessor logic directly

  describe("path-based config access logic", () => {
    const getValueByPath = (config: Record<string, unknown>, path: string): unknown => {
      const parts = path.split(".");
      let current: unknown = config;
      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    };

    const setValueByPath = (
      config: Record<string, unknown>,
      path: string,
      value: unknown
    ): void => {
      const parts = path.split(".");
      let current: Record<string, unknown> = config;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    };

    test("gets top-level value", () => {
      const config = { gateway: { port: 8000 }, name: "test" };
      expect(getValueByPath(config, "name")).toBe("test");
    });

    test("gets nested value", () => {
      const config = { gateway: { port: 8000, autoStart: true } };
      expect(getValueByPath(config, "gateway.port")).toBe(8000);
      expect(getValueByPath(config, "gateway.autoStart")).toBe(true);
    });

    test("gets deeply nested value", () => {
      const config = { a: { b: { c: { d: "deep" } } } };
      expect(getValueByPath(config, "a.b.c.d")).toBe("deep");
    });

    test("returns undefined for non-existent path", () => {
      const config = { gateway: { port: 8000 } };
      expect(getValueByPath(config, "nonexistent")).toBeUndefined();
      expect(getValueByPath(config, "gateway.missing")).toBeUndefined();
      expect(getValueByPath(config, "a.b.c.d")).toBeUndefined();
    });

    test("sets top-level value", () => {
      const config: Record<string, unknown> = {};
      setValueByPath(config, "name", "test");
      expect(config.name).toBe("test");
    });

    test("sets nested value", () => {
      const config: Record<string, unknown> = { gateway: {} };
      setValueByPath(config, "gateway.port", 9000);
      expect((config.gateway as Record<string, unknown>).port).toBe(9000);
    });

    test("creates intermediate objects", () => {
      const config: Record<string, unknown> = {};
      setValueByPath(config, "a.b.c", "value");
      expect(config.a as Record<string, unknown>).toBeDefined();
      expect((config.a as Record<string, unknown>).b as Record<string, unknown>).toBeDefined();
      expect(((config.a as Record<string, unknown>).b as Record<string, unknown>).c).toBe("value");
    });
  });

  describe("type coercion logic", () => {
    const coerceValue = (value: unknown): unknown => {
      if (value === "true") return true;
      if (value === "false") return false;
      if (typeof value === "string" && !isNaN(Number(value))) return Number(value);
      return value;
    };

    test("coerces 'true' to boolean true", () => {
      expect(coerceValue("true")).toBe(true);
    });

    test("coerces 'false' to boolean false", () => {
      expect(coerceValue("false")).toBe(false);
    });

    test("coerces numeric string to number", () => {
      expect(coerceValue("42")).toBe(42);
      expect(coerceValue("3.14")).toBe(3.14);
      expect(coerceValue("0")).toBe(0);
      expect(coerceValue("-10")).toBe(-10);
    });

    test("preserves non-coercible strings", () => {
      expect(coerceValue("hello")).toBe("hello");
      expect(coerceValue("not a number")).toBe("not a number");
    });

    test("coerces empty string to 0 (JS Number behavior)", () => {
      // Note: Number("") === 0 in JavaScript
      expect(coerceValue("")).toBe(0);
    });

    test("preserves non-string values", () => {
      expect(coerceValue(123)).toBe(123);
      expect(coerceValue(true)).toBe(true);
      expect(coerceValue(null)).toBe(null);
    });
  });
});

describe("Provider Configs", () => {
  // Import and test PROVIDER_CONFIGS
  test("all providers have required fields", async () => {
    const { PROVIDER_CONFIGS } = await import("../../src/utils/config.js");

    const providers = ["anthropic", "openai", "google", "openrouter", "groq", "mistral", "xai"];

    for (const provider of providers) {
      const config = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS];
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.envVar).toBeDefined();
      expect(config.defaultModel).toBeDefined();
    }
  });

  test("anthropic provider has correct env var", async () => {
    const { PROVIDER_CONFIGS } = await import("../../src/utils/config.js");
    expect(PROVIDER_CONFIGS.anthropic.envVar).toBe("ANTHROPIC_API_KEY");
  });

  test("openrouter has baseUrl configured", async () => {
    const { PROVIDER_CONFIGS } = await import("../../src/utils/config.js");
    expect(PROVIDER_CONFIGS.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
  });
});

describe("Default Config", () => {
  test("has correct structure", async () => {
    // We can't easily test loadConfig without file I/O,
    // but we can test that the defaults are applied correctly
    const { loadConfig } = await import("../../src/utils/config.js");

    // loadConfig will return defaults if no config file exists
    // This may vary based on test environment, so we just verify structure
    const config = loadConfig();

    expect(config.gateway).toBeDefined();
    expect(typeof config.gateway.port).toBe("number");
    expect(typeof config.gateway.autoStart).toBe("boolean");

    expect(config.llm).toBeDefined();
    expect(config.llm.provider).toBeDefined();

    expect(config.dataSources).toBeDefined();
    expect(config.dataSources.type).toBeDefined();

    expect(config.tui).toBeDefined();
    expect(config.tui.theme).toBeDefined();
  });
});

describe("Unified Model Repository", () => {
  describe("parseModelRef", () => {
    test("parses 'provider/name' format", async () => {
      const { parseModelRef } = await import("../../src/utils/config.js");

      const result = parseModelRef("openrouter/claude-sonnet");
      expect(result.provider).toBe("openrouter");
      expect(result.name).toBe("claude-sonnet");
    });

    test("handles nested model names with slashes", async () => {
      const { parseModelRef } = await import("../../src/utils/config.js");

      // Only split on first slash
      const result = parseModelRef("openrouter/anthropic/claude-sonnet-4");
      expect(result.provider).toBe("openrouter");
      expect(result.name).toBe("anthropic/claude-sonnet-4");
    });

    test("throws for invalid format (no slash)", async () => {
      const { parseModelRef } = await import("../../src/utils/config.js");

      expect(() => parseModelRef("no-slash")).toThrow('expected "provider/name" format');
    });
  });

  describe("resolveModel", () => {
    test("resolves model from repository", async () => {
      const { resolveModel } = await import("../../src/utils/config.js");

      const config = {
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "openrouter" as const },
        dataSources: { type: "mock" as const },
        tui: { theme: "dark" as const, showToolCalls: true },
        models: {
          providers: {
            openrouter: {
              apiKey: "sk-test-key",
              baseUrl: "https://openrouter.ai/api/v1",
              models: [
                { name: "claude-sonnet", model: "anthropic/claude-sonnet-4" },
                { name: "gpt-4o", model: "openai/gpt-4o", label: "GPT-4o" },
              ],
            },
          },
        },
      } satisfies PHAConfig;

      const result = resolveModel("openrouter/claude-sonnet", config);
      expect(result.provider).toBe("openrouter");
      expect(result.modelId).toBe("anthropic/claude-sonnet-4");
      expect(result.apiKey).toBe("sk-test-key");
      expect(result.baseUrl).toBe("https://openrouter.ai/api/v1");

      const result2 = resolveModel("openrouter/gpt-4o", config);
      expect(result2.modelId).toBe("openai/gpt-4o");
      expect(result2.label).toBe("GPT-4o");
    });

    test("throws for unknown provider", async () => {
      const { resolveModel } = await import("../../src/utils/config.js");

      const config = {
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "openrouter" as const },
        dataSources: { type: "mock" as const },
        tui: { theme: "dark" as const, showToolCalls: true },
        models: { providers: {} },
      } satisfies PHAConfig;

      expect(() => resolveModel("unknown/model", config)).toThrow('Provider "unknown" not found');
    });

    test("throws for unknown model", async () => {
      const { resolveModel } = await import("../../src/utils/config.js");

      const config = {
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "openrouter" as const },
        dataSources: { type: "mock" as const },
        tui: { theme: "dark" as const, showToolCalls: true },
        models: {
          providers: {
            openrouter: {
              apiKey: "sk-test",
              models: [{ name: "existing", model: "test-model" }],
            },
          },
        },
      } satisfies PHAConfig;

      expect(() => resolveModel("openrouter/nonexistent", config)).toThrow(
        'Model "nonexistent" not found'
      );
    });
  });

  describe("listAllModelRefs", () => {
    test("lists all model references", async () => {
      const { listAllModelRefs } = await import("../../src/utils/config.js");

      const config = {
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "openrouter" as const },
        dataSources: { type: "mock" as const },
        tui: { theme: "dark" as const, showToolCalls: true },
        models: {
          providers: {
            openrouter: {
              models: [
                { name: "claude-sonnet", model: "anthropic/claude-sonnet-4" },
                { name: "gpt-4o", model: "openai/gpt-4o" },
              ],
            },
            anthropic: {
              models: [{ name: "opus", model: "claude-opus-4-6" }],
            },
          },
        },
      } satisfies PHAConfig;

      const refs = listAllModelRefs(config);
      expect(refs).toContain("openrouter/claude-sonnet");
      expect(refs).toContain("openrouter/gpt-4o");
      expect(refs).toContain("anthropic/opus");
      expect(refs).toHaveLength(3);
    });

    test("returns empty for no models", async () => {
      const { listAllModelRefs } = await import("../../src/utils/config.js");

      const config = {
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "openrouter" as const },
        dataSources: { type: "mock" as const },
        tui: { theme: "dark" as const, showToolCalls: true },
      } satisfies PHAConfig;

      const refs = listAllModelRefs(config);
      expect(refs).toHaveLength(0);
    });
  });

  describe("Unified Constants", () => {
    test("KNOWN_PROVIDERS includes all providers", async () => {
      const { KNOWN_PROVIDERS } = await import("../../src/utils/config.js");

      expect(KNOWN_PROVIDERS).toContain("anthropic");
      expect(KNOWN_PROVIDERS).toContain("openai");
      expect(KNOWN_PROVIDERS).toContain("google");
      expect(KNOWN_PROVIDERS).toContain("openrouter");
      expect(KNOWN_PROVIDERS).toContain("moonshot");
      expect(KNOWN_PROVIDERS).toContain("deepseek");
      expect(KNOWN_PROVIDERS).toContain("groq");
      expect(KNOWN_PROVIDERS).toContain("mistral");
      expect(KNOWN_PROVIDERS).toContain("xai");
    });

    test("ENV_KEY_MAP covers all known providers", async () => {
      const { KNOWN_PROVIDERS, ENV_KEY_MAP } = await import("../../src/utils/config.js");

      for (const provider of KNOWN_PROVIDERS) {
        expect(ENV_KEY_MAP[provider]).toBeDefined();
        expect(ENV_KEY_MAP[provider]).toContain("_API_KEY");
      }
    });

    test("DEFAULT_MODELS covers all known providers", async () => {
      const { KNOWN_PROVIDERS, DEFAULT_MODELS } = await import("../../src/utils/config.js");

      for (const provider of KNOWN_PROVIDERS) {
        expect(DEFAULT_MODELS[provider]).toBeDefined();
        expect(typeof DEFAULT_MODELS[provider]).toBe("string");
      }
    });

    test("BUILTIN_PROVIDERS is subset of KNOWN_PROVIDERS", async () => {
      const { KNOWN_PROVIDERS, BUILTIN_PROVIDERS } = await import("../../src/utils/config.js");

      for (const provider of BUILTIN_PROVIDERS) {
        expect(KNOWN_PROVIDERS).toContain(provider);
      }
      // moonshot and deepseek should NOT be in BUILTIN_PROVIDERS
      expect(BUILTIN_PROVIDERS).not.toContain("moonshot");
      expect(BUILTIN_PROVIDERS).not.toContain("deepseek");
    });
  });
});
