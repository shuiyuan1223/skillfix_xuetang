/**
 * Multi-factor PBKDF2 Encryption Engine
 *
 * Provides transparent encryption/decryption for sensitive configuration fields.
 * Work key derived from three independent factors:
 *   1. thirdKey — env PHA_THIRD_KEY or machine-fingerprint fallback
 *   2. keyFileA — .pha/keys/key-a.bin (32 random bytes)
 *   3. keyFileB — .pha/keys/key-b.bin (32 random bytes)
 *
 * Algorithm: AES-256-GCM with PBKDF2-HMAC-SHA256 (600K iterations)
 * Format:    enc:v1:<base64(salt ‖ iv ‖ ciphertext ‖ authTag)>
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, chmodSync } from 'node:fs';
import { userInfo, hostname } from 'node:os';
import * as path from 'node:path';

// ---- Constants ----

const ENC_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm' as const;
const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH = 32; // AES-256
const SALT_LENGTH = 16; // 128-bit
const IV_LENGTH = 12; // GCM standard nonce
const AUTH_TAG_LENGTH = 16; // 128-bit
const KEY_FILE_SIZE = 32; // 256-bit random
const APP_SALT = 'pha-config-encryption-v1';

// ---- Public API ----

/** Custom error for decryption failures */
export class ConfigDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigDecryptionError';
  }
}

/** Check if a string value is an encrypted ciphertext */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt a plaintext string.
 * Returns "enc:v1:<base64(salt ‖ iv ‖ ciphertext ‖ authTag)>"
 * Each call generates independent salt + iv (no deterministic output).
 */
export function encrypt(plaintext: string, stateDir: string): string {
  ensureKeyFiles(stateDir);

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const workKey = deriveWorkKey(salt, stateDir);

  try {
    const cipher = createCipheriv(ALGORITHM, workKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // salt ‖ iv ‖ ciphertext ‖ authTag
    const combined = Buffer.concat([salt, iv, encrypted, authTag]);
    return `${ENC_PREFIX}${combined.toString('base64')}`;
  } finally {
    workKey.fill(0);
  }
}

/**
 * Decrypt a ciphertext string. Non-encrypted values pass through unchanged.
 * @throws ConfigDecryptionError on key mismatch, corruption, or tampering
 */
export function decrypt(value: string, stateDir: string): string {
  if (!isEncrypted(value)) {
    return value;
  }

  const b64 = value.slice(ENC_PREFIX.length);
  let combined: Buffer;
  try {
    combined = Buffer.from(b64, 'base64');
  } catch {
    throw new ConfigDecryptionError(
      'Ciphertext base64 format is corrupted. The encrypted value may have been truncated or modified.'
    );
  }

  const minLength = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new ConfigDecryptionError('Ciphertext is too short — data may be corrupted or truncated.');
  }

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  const workKey = deriveWorkKey(salt, stateDir);

  try {
    const decipher = createDecipheriv(ALGORITHM, workKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch (err) {
    if (err instanceof ConfigDecryptionError) {
      throw err;
    }
    throw new ConfigDecryptionError(
      'Decryption failed — key factors may have changed (PHA_THIRD_KEY, key files), or the ciphertext was tampered with.'
    );
  } finally {
    workKey.fill(0);
  }
}

/** Check if encryption subsystem is ready (key files exist) */
export function isCryptoReady(stateDir: string): boolean {
  const keysDir = path.join(stateDir, 'keys');
  return existsSync(path.join(keysDir, 'key-a.bin')) && existsSync(path.join(keysDir, 'key-b.bin'));
}

/** Initialize key files if they don't exist. Idempotent. */
export function ensureKeyFiles(stateDir: string): void {
  const keysDir = path.join(stateDir, 'keys');
  if (!existsSync(keysDir)) {
    mkdirSync(keysDir, { recursive: true, mode: 0o700 });
  }

  // Enforce directory permissions (in case it was created by other code)
  try {
    const stat = statSync(keysDir);
    if ((stat.mode & 0o777) !== 0o700) {
      chmodSync(keysDir, 0o700);
    }
  } catch {
    // Best-effort
  }

  const keyAPath = path.join(keysDir, 'key-a.bin');
  const keyBPath = path.join(keysDir, 'key-b.bin');

  if (!existsSync(keyAPath)) {
    writeFileSync(keyAPath, randomBytes(KEY_FILE_SIZE), { mode: 0o600 });
  }
  if (!existsSync(keyBPath)) {
    writeFileSync(keyBPath, randomBytes(KEY_FILE_SIZE), { mode: 0o600 });
  }
}

/** Get the third-party key source mode (for diagnostics) */
export function getThirdKeySource(): 'environment' | 'machine-fingerprint' {
  const envKey = process.env.PHA_THIRD_KEY?.trim();
  return envKey ? 'environment' : 'machine-fingerprint';
}

// ---- Internal Implementation ----

/**
 * Derive work key from three factors:
 *   thirdKey (env/fingerprint) + keyFileA + keyFileB
 * → PBKDF2-HMAC-SHA256(keyMaterial, salt, 600K) → 32 bytes
 */
function deriveWorkKey(salt: Buffer, stateDir: string): Buffer {
  const thirdKey = getThirdKey();
  const keyFileA = readKeyFile(path.join(stateDir, 'keys', 'key-a.bin'), 'key-a.bin');
  const keyFileB = readKeyFile(path.join(stateDir, 'keys', 'key-b.bin'), 'key-b.bin');

  // Fixed-order concatenation
  const keyMaterial = Buffer.concat([Buffer.from(thirdKey, 'utf-8'), keyFileA, keyFileB]);

  try {
    return pbkdf2Sync(keyMaterial, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  } finally {
    keyMaterial.fill(0);
  }
}

/** Read a key file, throwing a descriptive error if missing */
function readKeyFile(filePath: string, name: string): Buffer {
  if (!existsSync(filePath)) {
    throw new ConfigDecryptionError(
      `Key file "${name}" not found at ${filePath}. ` +
        'If the file was deleted, encrypted values cannot be recovered. ' +
        'Run `pha encrypt-config` after restoring key files or re-configuring.'
    );
  }
  return readFileSync(filePath);
}

/**
 * Get the third-party key:
 *   Priority 1: PHA_THIRD_KEY environment variable
 *   Fallback:   machine fingerprint (machine-id + username + app-salt)
 */
function getThirdKey(): string {
  const envKey = process.env.PHA_THIRD_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  // Development mode fallback: machine fingerprint
  const machineId = getMachineId();
  const user = userInfo().username;
  return `${machineId}:${user}:${APP_SALT}`;
}

/**
 * Get machine identifier:
 *   Linux:   /etc/machine-id
 *   macOS:   IOPlatformUUID via ioreg (not implemented — hostname fallback)
 *   Fallback: hostname()
 */
function getMachineId(): string {
  // Linux /etc/machine-id
  try {
    if (existsSync('/etc/machine-id')) {
      return readFileSync('/etc/machine-id', 'utf-8').trim();
    }
  } catch {
    // Fall through
  }

  // macOS /var/db/SystemIdentification/SharedInfo.plist fallback or hostname
  try {
    if (existsSync('/var/db/SystemIdentification/SharedInfo.plist')) {
      const content = readFileSync('/var/db/SystemIdentification/SharedInfo.plist', 'utf-8');
      const match = content.match(/<string>([A-F0-9-]+)<\/string>/);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // Fall through
  }

  // Final fallback: hostname
  return hostname();
}
