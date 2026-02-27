/**
 * Tests for Multi-factor PBKDF2 Encryption Engine (src/utils/crypto.ts)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomBytes } from "node:crypto";
import {
  encrypt,
  decrypt,
  isEncrypted,
  ensureKeyFiles,
  isCryptoReady,
  ConfigDecryptionError,
} from "../../src/utils/crypto.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pha-crypto-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("isEncrypted", () => {
  test("detects enc:v1: prefix", () => {
    expect(isEncrypted("enc:v1:abc123")).toBe(true);
  });

  test("rejects plain text", () => {
    expect(isEncrypted("sk-ant-some-key")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("enc:v2:something")).toBe(false);
  });
});

describe("ensureKeyFiles", () => {
  test("creates key files on first call", () => {
    expect(isCryptoReady(tmpDir)).toBe(false);
    ensureKeyFiles(tmpDir);
    expect(isCryptoReady(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "keys", "key-a.bin"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "keys", "key-b.bin"))).toBe(true);
  });

  test("is idempotent — does not overwrite existing files", () => {
    ensureKeyFiles(tmpDir);
    const keyA1 = fs.readFileSync(path.join(tmpDir, "keys", "key-a.bin"));
    const keyB1 = fs.readFileSync(path.join(tmpDir, "keys", "key-b.bin"));

    ensureKeyFiles(tmpDir);
    const keyA2 = fs.readFileSync(path.join(tmpDir, "keys", "key-a.bin"));
    const keyB2 = fs.readFileSync(path.join(tmpDir, "keys", "key-b.bin"));

    expect(Buffer.compare(keyA1, keyA2)).toBe(0);
    expect(Buffer.compare(keyB1, keyB2)).toBe(0);
  });

  test("generates 32-byte key files", () => {
    ensureKeyFiles(tmpDir);
    const keyA = fs.readFileSync(path.join(tmpDir, "keys", "key-a.bin"));
    const keyB = fs.readFileSync(path.join(tmpDir, "keys", "key-b.bin"));
    expect(keyA.length).toBe(32);
    expect(keyB.length).toBe(32);
  });

  test("key files have restrictive permissions", () => {
    ensureKeyFiles(tmpDir);
    const keyAStat = fs.statSync(path.join(tmpDir, "keys", "key-a.bin"));
    const keyBStat = fs.statSync(path.join(tmpDir, "keys", "key-b.bin"));
    // 0o600 = owner read/write only
    expect(keyAStat.mode & 0o777).toBe(0o600);
    expect(keyBStat.mode & 0o777).toBe(0o600);
  });
});

describe("encrypt / decrypt", () => {
  test("roundtrip: encrypt then decrypt recovers original", () => {
    ensureKeyFiles(tmpDir);
    const plaintext = "sk-ant-api03-secret-key-value";
    const ciphertext = encrypt(plaintext, tmpDir);
    expect(isEncrypted(ciphertext)).toBe(true);
    const decrypted = decrypt(ciphertext, tmpDir);
    expect(decrypted).toBe(plaintext);
  });

  test("works with empty string", () => {
    ensureKeyFiles(tmpDir);
    const ciphertext = encrypt("", tmpDir);
    expect(decrypt(ciphertext, tmpDir)).toBe("");
  });

  test("works with unicode", () => {
    ensureKeyFiles(tmpDir);
    const plaintext = "密钥-测试-🔑";
    expect(decrypt(encrypt(plaintext, tmpDir), tmpDir)).toBe(plaintext);
  });

  test("works with long values", () => {
    ensureKeyFiles(tmpDir);
    const plaintext = "x".repeat(10000);
    expect(decrypt(encrypt(plaintext, tmpDir), tmpDir)).toBe(plaintext);
  });

  test("same plaintext encrypts to different ciphertext each time", () => {
    ensureKeyFiles(tmpDir);
    const plaintext = "sk-ant-same-key";
    const ct1 = encrypt(plaintext, tmpDir);
    const ct2 = encrypt(plaintext, tmpDir);
    expect(ct1).not.toBe(ct2);
    // Both decrypt to same value
    expect(decrypt(ct1, tmpDir)).toBe(plaintext);
    expect(decrypt(ct2, tmpDir)).toBe(plaintext);
  });

  test("decrypt passes through non-encrypted values", () => {
    ensureKeyFiles(tmpDir);
    expect(decrypt("plain-api-key", tmpDir)).toBe("plain-api-key");
    expect(decrypt("", tmpDir)).toBe("");
  });

  test("ciphertext has correct prefix format", () => {
    ensureKeyFiles(tmpDir);
    const ct = encrypt("test", tmpDir);
    expect(ct.startsWith("enc:v1:")).toBe(true);
    // The rest should be valid base64
    const b64Part = ct.slice("enc:v1:".length);
    expect(() => Buffer.from(b64Part, "base64")).not.toThrow();
  });
});

describe("decryption failure scenarios", () => {
  test("throws ConfigDecryptionError when key-a.bin changes", () => {
    ensureKeyFiles(tmpDir);
    const ct = encrypt("secret", tmpDir);

    // Replace key-a.bin with different random bytes
    fs.writeFileSync(path.join(tmpDir, "keys", "key-a.bin"), randomBytes(32));

    expect(() => decrypt(ct, tmpDir)).toThrow(ConfigDecryptionError);
  });

  test("throws ConfigDecryptionError when key-b.bin changes", () => {
    ensureKeyFiles(tmpDir);
    const ct = encrypt("secret", tmpDir);

    fs.writeFileSync(path.join(tmpDir, "keys", "key-b.bin"), randomBytes(32));

    expect(() => decrypt(ct, tmpDir)).toThrow(ConfigDecryptionError);
  });

  test("throws ConfigDecryptionError when PHA_THIRD_KEY changes", () => {
    const origKey = process.env.PHA_THIRD_KEY;
    try {
      process.env.PHA_THIRD_KEY = "original-key";
      ensureKeyFiles(tmpDir);
      const ct = encrypt("secret", tmpDir);

      process.env.PHA_THIRD_KEY = "different-key";
      expect(() => decrypt(ct, tmpDir)).toThrow(ConfigDecryptionError);
    } finally {
      if (origKey === undefined) {
        delete process.env.PHA_THIRD_KEY;
      } else {
        process.env.PHA_THIRD_KEY = origKey;
      }
    }
  });

  test("throws ConfigDecryptionError on corrupted base64", () => {
    ensureKeyFiles(tmpDir);
    expect(() => decrypt("enc:v1:!!!invalid-base64!!!", tmpDir)).toThrow(ConfigDecryptionError);
  });

  test("throws ConfigDecryptionError on truncated ciphertext", () => {
    ensureKeyFiles(tmpDir);
    const ct = encrypt("secret", tmpDir);
    // Truncate the base64 payload
    const truncated = "enc:v1:" + ct.slice("enc:v1:".length, "enc:v1:".length + 10);
    expect(() => decrypt(truncated, tmpDir)).toThrow(ConfigDecryptionError);
  });

  test("throws ConfigDecryptionError on tampered ciphertext (GCM authTag)", () => {
    ensureKeyFiles(tmpDir);
    const ct = encrypt("secret", tmpDir);
    const b64 = ct.slice("enc:v1:".length);
    const buf = Buffer.from(b64, "base64");
    // Flip a byte in the middle of the ciphertext
    const mid = Math.floor(buf.length / 2);
    buf[mid] = buf[mid] ^ 0xff;
    const tampered = "enc:v1:" + buf.toString("base64");
    expect(() => decrypt(tampered, tmpDir)).toThrow(ConfigDecryptionError);
  });

  test("throws ConfigDecryptionError when key file is missing", () => {
    ensureKeyFiles(tmpDir);
    const ct = encrypt("secret", tmpDir);

    // Remove key-a.bin
    fs.unlinkSync(path.join(tmpDir, "keys", "key-a.bin"));
    expect(() => decrypt(ct, tmpDir)).toThrow(ConfigDecryptionError);
  });
});
