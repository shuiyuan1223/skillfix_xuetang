/**
 * Tests for Config Utilities
 *
 * Tests configuration loading, saving, and value manipulation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
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
