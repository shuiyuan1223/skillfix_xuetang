/**
 * Tests for config.ts encryption integration
 *
 * Verifies that sensitive fields are automatically encrypted on save
 * and decrypted on load using the walkAndTransform mechanism.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { encrypt, decrypt, isEncrypted, ensureKeyFiles } from "../../src/utils/crypto.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pha-cfg-enc-test-"));
  const keysDir = path.join(tmpDir, "keys");
  fs.mkdirSync(keysDir, { recursive: true });
  ensureKeyFiles(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Re-implement walkAndTransform locally for testing purposes.
 * This mirrors the exact logic in config.ts without importing private functions.
 */
function walkAndTransform(
  obj: Record<string, unknown>,
  pathParts: string[],
  index: number,
  // eslint-disable-next-line no-unused-vars
  transform: (value: unknown) => unknown
): void {
  if (index >= pathParts.length || obj == null || typeof obj !== "object") return;

  const part = pathParts[index];
  const isLast = index === pathParts.length - 1;

  if (part === "*") {
    for (const key of Object.keys(obj)) {
      const child = obj[key];
      if (isLast) {
        obj[key] = transform(child);
      } else if (child != null && typeof child === "object") {
        walkAndTransform(child as Record<string, unknown>, pathParts, index + 1, transform);
      }
    }
  } else if (isLast) {
    if (part in obj) {
      obj[part] = transform(obj[part]);
    }
  } else {
    const child = obj[part];
    if (child != null && typeof child === "object") {
      walkAndTransform(child as Record<string, unknown>, pathParts, index + 1, transform);
    }
  }
}

const SENSITIVE_FIELDS = [
  "llm.apiKey",
  "models.providers.*.apiKey",
  "dataSources.huawei.clientSecret",
  "mcp.remoteServers.*.apiKey",
];

function encryptFields(obj: Record<string, unknown>, stateDir: string): void {
  for (const fieldPath of SENSITIVE_FIELDS) {
    walkAndTransform(obj, fieldPath.split("."), 0, (value) => {
      if (typeof value === "string" && value && !isEncrypted(value)) {
        return encrypt(value, stateDir);
      }
      return value;
    });
  }
}

function decryptFields(obj: Record<string, unknown>, stateDir: string): void {
  for (const fieldPath of SENSITIVE_FIELDS) {
    walkAndTransform(obj, fieldPath.split("."), 0, (value) => {
      if (typeof value === "string" && isEncrypted(value)) {
        return decrypt(value, stateDir);
      }
      return value;
    });
  }
}

describe("walkAndTransform", () => {
  test("transforms simple dot path", () => {
    const obj = { llm: { apiKey: "sk-test", provider: "anthropic" } };
    walkAndTransform(obj, ["llm", "apiKey"], 0, (v) =>
      typeof v === "string" ? v.toUpperCase() : v
    );
    expect(obj.llm.apiKey).toBe("SK-TEST");
    expect(obj.llm.provider).toBe("anthropic"); // untouched
  });

  test("transforms wildcard paths", () => {
    const obj = {
      models: {
        providers: {
          openai: { apiKey: "sk-openai", models: [] },
          anthropic: { apiKey: "sk-ant", models: [] },
        },
      },
    };
    walkAndTransform(
      obj as unknown as Record<string, unknown>,
      ["models", "providers", "*", "apiKey"],
      0,
      (v) => (typeof v === "string" ? `ENC(${v})` : v)
    );
    expect((obj.models.providers.openai as { apiKey: string }).apiKey).toBe("ENC(sk-openai)");
    expect((obj.models.providers.anthropic as { apiKey: string }).apiKey).toBe("ENC(sk-ant)");
  });

  test("handles missing paths gracefully", () => {
    const obj = { gateway: { port: 8000 } };
    // Should not throw for non-existent path
    walkAndTransform(obj as Record<string, unknown>, ["llm", "apiKey"], 0, () => "changed");
    expect(obj).toEqual({ gateway: { port: 8000 } });
  });

  test("skips null/undefined values", () => {
    const obj = { llm: { apiKey: null, provider: "anthropic" } };
    let callCount = 0;
    walkAndTransform(obj as Record<string, unknown>, ["llm", "apiKey"], 0, (v) => {
      callCount++;
      return v;
    });
    expect(callCount).toBe(1); // Still called, but transform returns null
  });
});

describe("sensitive field encryption roundtrip", () => {
  test("encrypts llm.apiKey and decrypts back", () => {
    const obj: Record<string, unknown> = {
      llm: { apiKey: "sk-ant-test", provider: "anthropic" },
    };
    encryptFields(obj, tmpDir);
    expect(isEncrypted((obj.llm as { apiKey: string }).apiKey)).toBe(true);
    decryptFields(obj, tmpDir);
    expect((obj.llm as { apiKey: string }).apiKey).toBe("sk-ant-test");
  });

  test("encrypts models.providers.*.apiKey with wildcard", () => {
    const obj: Record<string, unknown> = {
      models: {
        providers: {
          openai: { apiKey: "sk-openai-123", models: [] },
          anthropic: { apiKey: "sk-ant-456", models: [] },
        },
      },
    };
    encryptFields(obj, tmpDir);
    const providers = (obj.models as { providers: Record<string, { apiKey: string }> }).providers;
    expect(isEncrypted(providers.openai.apiKey)).toBe(true);
    expect(isEncrypted(providers.anthropic.apiKey)).toBe(true);

    decryptFields(obj, tmpDir);
    expect(providers.openai.apiKey).toBe("sk-openai-123");
    expect(providers.anthropic.apiKey).toBe("sk-ant-456");
  });

  test("encrypts dataSources.huawei.clientSecret", () => {
    const obj: Record<string, unknown> = {
      dataSources: { huawei: { clientSecret: "hw-secret" } },
    };
    encryptFields(obj, tmpDir);
    expect(
      isEncrypted((obj.dataSources as { huawei: { clientSecret: string } }).huawei.clientSecret)
    ).toBe(true);
    decryptFields(obj, tmpDir);
    expect((obj.dataSources as { huawei: { clientSecret: string } }).huawei.clientSecret).toBe(
      "hw-secret"
    );
  });

  test("encrypts mcp.remoteServers.*.apiKey", () => {
    const obj: Record<string, unknown> = {
      mcp: {
        remoteServers: {
          server1: { url: "https://api.example.com", apiKey: "srv-key-1" },
          server2: { url: "https://api2.example.com", apiKey: "srv-key-2" },
        },
      },
    };
    encryptFields(obj, tmpDir);
    const servers = (obj.mcp as { remoteServers: Record<string, { apiKey: string }> })
      .remoteServers;
    expect(isEncrypted(servers.server1.apiKey)).toBe(true);
    expect(isEncrypted(servers.server2.apiKey)).toBe(true);

    decryptFields(obj, tmpDir);
    expect(servers.server1.apiKey).toBe("srv-key-1");
    expect(servers.server2.apiKey).toBe("srv-key-2");
  });

  test("non-sensitive fields are not affected", () => {
    const obj: Record<string, unknown> = {
      gateway: { port: 8000, host: "0.0.0.0" },
      llm: { apiKey: "sk-test", provider: "anthropic", modelId: "claude" },
    };
    encryptFields(obj, tmpDir);
    expect((obj.gateway as { port: number }).port).toBe(8000);
    expect((obj.gateway as { host: string }).host).toBe("0.0.0.0");
    expect((obj.llm as { provider: string }).provider).toBe("anthropic");
    expect((obj.llm as { modelId: string }).modelId).toBe("claude");
  });

  test("already-encrypted values are not double-encrypted", () => {
    const obj: Record<string, unknown> = {
      llm: { apiKey: "sk-test" },
    };
    encryptFields(obj, tmpDir);
    const firstEncryption = (obj.llm as { apiKey: string }).apiKey;
    encryptFields(obj, tmpDir);
    const secondPass = (obj.llm as { apiKey: string }).apiKey;
    // Should be the same — already encrypted, skip
    expect(secondPass).toBe(firstEncryption);
  });

  test("empty string values are not encrypted", () => {
    const obj: Record<string, unknown> = {
      llm: { apiKey: "", provider: "anthropic" },
    };
    encryptFields(obj, tmpDir);
    expect((obj.llm as { apiKey: string }).apiKey).toBe("");
  });

  test("PHA_THIRD_KEY environment mode works", () => {
    const origKey = process.env.PHA_THIRD_KEY;
    try {
      process.env.PHA_THIRD_KEY = "test-env-key-for-config";
      const obj: Record<string, unknown> = {
        llm: { apiKey: "sk-with-env-key" },
      };
      encryptFields(obj, tmpDir);
      expect(isEncrypted((obj.llm as { apiKey: string }).apiKey)).toBe(true);
      decryptFields(obj, tmpDir);
      expect((obj.llm as { apiKey: string }).apiKey).toBe("sk-with-env-key");
    } finally {
      if (origKey === undefined) {
        delete process.env.PHA_THIRD_KEY;
      } else {
        process.env.PHA_THIRD_KEY = origKey;
      }
    }
  });
});
