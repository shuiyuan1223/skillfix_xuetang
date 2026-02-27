/**
 * Structured Logger
 *
 * JSONL-based structured logging with daily rotation.
 * Writes to .pha/logs/pha-YYYY-MM-DD.log and forwards to console.
 * Provides real-time log subscription for the Logs UI page.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getStateDir } from './config.js';

// ============ Types ============

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  time: string;
  level: LogLevel;
  subsystem: string;
  message: string;
  data?: unknown;
}

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

// ============ Log Directory ============

function getLogDir(): string {
  return join(getStateDir(), 'logs');
}

function ensureLogDir(): void {
  const dir = getLogDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getLogFile(date?: string): string {
  const d = date || new Date().toISOString().split('T')[0];
  return join(getLogDir(), `pha-${d}.log`);
}

// ============ Subscribers ============

type LogSubscriber = (entry: LogEntry) => void;
const subscribers = new Set<LogSubscriber>();

export function subscribeToLogs(callback: LogSubscriber): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

// ============ Write ============

/**
 * Recursively serialize Error objects in data structure.
 * Converts Error instances to { message, stack, name } format,
 * and recursively processes nested objects and arrays.
 */
function serializeErrors(data: unknown, seen = new WeakSet()): unknown {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle Error objects
  if (data instanceof Error) {
    return {
      message: data.message,
      stack: data.stack,
      name: data.name,
    };
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => serializeErrors(item, seen));
  }

  // Handle plain objects (but not class instances, Date, etc.)
  if (typeof data === 'object' && data.constructor === Object) {
    // Avoid circular references
    if (seen.has(data)) {
      return '[Circular]';
    }
    seen.add(data);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeErrors(value, seen);
    }
    return result;
  }

  // Return primitives (string, number, boolean) and other types as-is
  return data;
}

function writeLogEntry(entry: LogEntry): void {
  // Serialize Error objects (including nested) before JSON.stringify
  const serializedEntry = {
    ...entry,
    data: serializeErrors(entry.data),
  };

  try {
    ensureLogDir();
    appendFileSync(getLogFile(), `${JSON.stringify(serializedEntry)}\n`);
  } catch {
    // Silently fail — avoid infinite recursion if logging itself fails
  }

  // Console forwarding
  const prefix = `[${entry.subsystem}]`;
  const dataStr = serializedEntry.data ? ` ${JSON.stringify(serializedEntry.data)}` : '';
  const str = `${prefix} ${entry.message}${dataStr}`;
  if (entry.level === 'warn') {
    console.warn(str);
  } else if (entry.level === 'error' || entry.level === 'fatal') {
    console.error(str);
  } else {
    console.log(str);
  }

  // Notify subscribers (with serialized data)
  for (const sub of subscribers) {
    try {
      sub(serializedEntry as LogEntry);
    } catch {
      // Subscriber errors should not break logging
    }
  }
}

// ============ Read ============

export function readLogFile(date?: string, limit?: number): LogEntry[] {
  const filePath = getLogFile(date);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: LogEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as LogEntry);
      } catch {
        // Skip malformed lines
      }
    }
    if (limit && entries.length > limit) {
      return entries.slice(-limit);
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * List available log dates (YYYY-MM-DD), newest first.
 */
export function listLogDates(): string[] {
  const dir = getLogDir();
  if (!existsSync(dir)) {
    return [];
  }
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith('pha-') && f.endsWith('.log'))
      .map((f) => f.replace('pha-', '').replace('.log', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Get all unique subsystems from recent logs.
 */
export function getLogSubsystems(date?: string): string[] {
  const entries = readLogFile(date);
  const subs = new Set<string>();
  for (const e of entries) {
    subs.add(e.subsystem);
  }
  return Array.from(subs).sort();
}

// ============ Factory ============

export function createLogger(subsystem: string): SubsystemLogger {
  const log = (level: LogLevel, msg: string, data?: unknown) => {
    writeLogEntry({
      time: new Date().toISOString(),
      level,
      subsystem,
      message: msg,
      data,
    });
  };

  return {
    subsystem,
    trace: (msg, data?) => log('trace', msg, data),
    debug: (msg, data?) => log('debug', msg, data),
    info: (msg, data?) => log('info', msg, data),
    warn: (msg, data?) => log('warn', msg, data),
    error: (msg, data?) => log('error', msg, data),
    fatal: (msg, data?) => log('fatal', msg, data),
    raw: console.log,
    child: (name: string) => createLogger(`${subsystem}/${name}`),
  };
}
