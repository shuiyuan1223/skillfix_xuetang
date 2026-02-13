/**
 * OpenClaw → PHA Compatibility Layer
 *
 * Adapts OpenClaw memory module dependencies to PHA equivalents.
 * This is the single file that bridges all OpenClaw-specific imports.
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import { findProjectRoot } from "../utils/config.js";

// ============ SQLite Adapter ============
// OpenClaw uses node:sqlite DatabaseSync; PHA uses bun:sqlite Database.
// bun:sqlite Database is synchronous by default, so it's API-compatible
// with node:sqlite DatabaseSync for our use cases.

export { Database as DatabaseSync };
export type { Database as DatabaseSyncType };

// ============ Logger Adapter ============

export interface SubsystemLogger {
  subsystem: string;
  trace: (msg: string, data?: unknown) => void;
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  fatal: (msg: string, data?: unknown) => void;
  raw: (...args: unknown[]) => void;
  child: (name: string) => SubsystemLogger;
}

export function createSubsystemLogger(subsystem: string): SubsystemLogger {
  const fmt = (level: string, msg: string, data?: unknown) => {
    const str = data ? `[${subsystem}] ${msg} ${JSON.stringify(data)}` : `[${subsystem}] ${msg}`;
    if (level === "warn") return console.warn(str);
    if (level === "error" || level === "fatal") return console.error(str);
    console.log(str);
  };
  return {
    subsystem,
    trace: (msg, data?) => fmt("trace", msg, data),
    debug: (msg, data?) => fmt("debug", msg, data),
    info: (msg, data?) => fmt("info", msg, data),
    warn: (msg, data?) => fmt("warn", msg, data),
    error: (msg, data?) => fmt("error", msg, data),
    fatal: (msg, data?) => fmt("fatal", msg, data),
    raw: console.log,
    child: (name: string) => createSubsystemLogger(`${subsystem}/${name}`),
  };
}

// ============ Path Adapter ============

export function resolveAgentWorkspaceDir(_cfg: unknown, agentId: string): string {
  return path.join(findProjectRoot(), ".pha", "users", agentId);
}

export function resolveAgentDir(_cfg: unknown, agentId: string): string {
  return path.join(findProjectRoot(), ".pha", "users", agentId);
}

export function resolveSessionTranscriptsDirForAgent(agentId: string): string {
  return path.join(findProjectRoot(), ".pha", "users", agentId || "default", "sessions");
}

// ============ Session Events ============

type SessionTranscriptListener = (update: { sessionFile: string }) => void;
const listeners = new Set<SessionTranscriptListener>();

export function onSessionTranscriptUpdate(listener: SessionTranscriptListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionTranscriptUpdate(sessionFile: string): void {
  for (const l of listeners) {
    l({ sessionFile: sessionFile.trim() });
  }
}

// ============ Utility Functions ============

/**
 * Truncate string safely respecting UTF-16 surrogate pairs.
 * Replaces OpenClaw's truncateUtf16Safe from utils.ts.
 */
export function truncateUtf16Safe(input: string, maxLen: number): string {
  const limit = Math.max(0, Math.floor(maxLen));
  if (input.length <= limit) {
    return input;
  }
  // Avoid splitting in the middle of a surrogate pair
  let end = limit;
  if (
    end > 0 &&
    end < input.length &&
    input.charCodeAt(end - 1) >= 0xd800 &&
    input.charCodeAt(end - 1) <= 0xdbff
  ) {
    end -= 1;
  }
  return input.slice(0, end);
}

/**
 * Resolve user path (expand ~ to home dir).
 * Replaces OpenClaw's resolveUserPath from utils.ts.
 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return path.join(home, trimmed.slice(1));
  }
  return path.resolve(trimmed);
}

/**
 * Format error message safely.
 * Replaces OpenClaw's formatErrorMessage from infra/errors.ts.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Redact sensitive text (simplified PHA version - no-op for now).
 * Replaces OpenClaw's redactSensitiveText from logging/redact.ts.
 */
export function redactSensitiveText(text: string, _opts?: { mode?: string }): string {
  return text;
}
