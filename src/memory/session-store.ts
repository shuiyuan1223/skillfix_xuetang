/**
 * Session Transcript Store
 * Stores raw conversation transcripts as JSONL files.
 * Each session is a separate .jsonl file under .pha/users/{uuid}/sessions/
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { UserMessage, AssistantMessage, ToolResultMessage } from '@mariozechner/pi-ai';
import { getUserDir, ensureUserDir } from './profile.js';
import { getStateDir } from '../utils/config.js';

/**
 * Resolve a session path template by replacing {uid} placeholder.
 * Returns an absolute path under .pha/ directory.
 */
export function resolveSessionPath(sessionPath: string, uid: string): string {
  const resolved = sessionPath.replace(/\{uid\}/g, uid);
  return join(getStateDir(), resolved);
}

export interface SessionEntry {
  timestamp: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
}

export interface SessionInfo {
  sessionId: string;
  path: string;
  createdAt: number;
  sizeBytes: number;
}

/**
 * Serialize AgentMessage[] into flat SessionEntry[] for storage.
 * Flattens complex content structures (TextContent[], ToolCall[], etc.) into plain text.
 */
export function serializeMessages(messages: AgentMessage[]): SessionEntry[] {
  const entries: SessionEntry[] = [];

  for (const msg of messages) {
    if (!('role' in msg)) {
      continue;
    }

    if (msg.role === 'user') {
      const userMsg = msg as UserMessage;
      const text =
        typeof userMsg.content === 'string'
          ? userMsg.content
          : userMsg.content
              .filter((b) => b.type === 'text')
              .map((b) => (b as { text: string }).text)
              .join('\n');
      if (text) {
        entries.push({
          timestamp: userMsg.timestamp || Date.now(),
          role: 'user',
          content: text,
        });
      }
    } else if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      const parts: string[] = [];
      for (const block of assistantMsg.content) {
        if (block.type === 'text') {
          parts.push(block.text);
        } else if (block.type === 'toolCall') {
          parts.push(`[Tool Call: ${block.name}(${JSON.stringify(block.arguments)})]`);
        }
        // Skip thinking blocks — not useful for transcript
      }
      if (parts.length > 0) {
        entries.push({
          timestamp: assistantMsg.timestamp || Date.now(),
          role: 'assistant',
          content: parts.join('\n'),
        });
      }
    } else if (msg.role === 'toolResult') {
      const toolMsg = msg as ToolResultMessage;
      const text = toolMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n');
      entries.push({
        timestamp: toolMsg.timestamp || Date.now(),
        role: 'tool',
        content: text || (toolMsg.isError ? '[error]' : '[ok]'),
        toolName: toolMsg.toolName,
      });
    }
  }

  return entries;
}

/**
 * Maximum number of user+assistant messages to inject into agent context on restart.
 * Prevents excessively long context after many conversation turns.
 */
const MAX_INJECTED_MESSAGES = 50;

/**
 * Convert chat history (SessionEntry[] or simple {role, content} objects) back to AgentMessage[]
 * for injection into Agent initialState.messages on restart.
 *
 * Only keeps user + assistant messages (tool messages require tool_use_id pairing
 * which is not stored in JSONL). Limits to the most recent MAX_INJECTED_MESSAGES entries.
 */
export function sessionToAgentMessages(
  entries: Array<{ role: string; content: string; timestamp?: number }>
): AgentMessage[] {
  const filtered = entries.filter((e) => e.role === 'user' || e.role === 'assistant');
  const recent = filtered.slice(-MAX_INJECTED_MESSAGES);

  return recent.map((e) => {
    const ts = e.timestamp || Date.now();
    if (e.role === 'user') {
      return {
        role: 'user' as const,
        content: e.content,
        timestamp: ts,
      };
    }
    // Assistant: create a minimal AssistantMessage with required fields
    return {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: e.content }],
      api: 'openai-completions' as const,
      provider: 'unknown',
      model: 'unknown',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop' as const,
      timestamp: ts,
    };
  });
}

/**
 * Get the sessions directory for a user
 */
function getSessionsDir(uuid: string): string {
  return join(getUserDir(uuid), 'sessions');
}

/**
 * Append entries to a session transcript file.
 * Creates the file if it doesn't exist. Append-only JSONL format.
 * @param sessionDir Optional custom session directory (overrides default user sessions dir)
 */
export function appendToSession(uuid: string, sessionId: string, entries: SessionEntry[], sessionDir?: string): void {
  ensureUserDir(uuid);
  const sessionsDir = sessionDir || getSessionsDir(uuid);
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  const filePath = join(sessionsDir, `${sessionId}.jsonl`);

  const lines = `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`;
  appendFileSync(filePath, lines);
}

/**
 * Create an empty session file so it becomes the "latest" by mtime.
 * Used when clearing chat: the empty file prevents loadLatestSession
 * from falling back to older session files with stale messages.
 */
export function touchSession(uuid: string, sessionId: string, sessionDir?: string): void {
  ensureUserDir(uuid);
  const sessionsDir = sessionDir || getSessionsDir(uuid);
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  writeFileSync(join(sessionsDir, `${sessionId}.jsonl`), '');
}

/**
 * Save AgentMessage[] directly to a session transcript.
 * Convenience wrapper: serializes messages then appends.
 */
export function saveSessionTranscript(uuid: string, sessionId: string, messages: AgentMessage[]): void {
  const entries = serializeMessages(messages);
  if (entries.length > 0) {
    appendToSession(uuid, sessionId, entries);
  }
}

/**
 * List sessions for a user, most recent first.
 */
export function listSessions(uuid: string, options?: { limit?: number }): SessionInfo[] {
  const sessionsDir = getSessionsDir(uuid);
  if (!existsSync(sessionsDir)) {
    return [];
  }

  const files = readdirSync(sessionsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const filePath = join(sessionsDir, f);
      const stat = statSync(filePath);
      return {
        sessionId: f.replace('.jsonl', ''),
        path: filePath,
        createdAt: stat.mtimeMs,
        sizeBytes: stat.size,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  if (options?.limit) {
    return files.slice(0, options.limit);
  }
  return files;
}

/**
 * Load a session from its JSONL file.
 * Parses each line as JSON, skipping malformed lines.
 */
export function loadSession(uuid: string, sessionId: string): SessionEntry[] {
  const filePath = join(getSessionsDir(uuid), `${sessionId}.jsonl`);
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const entries: SessionEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Load the most recent session for a user.
 * Filters out system-agent sessions (sa- prefix).
 * Returns null if no session exists.
 * @param sessionDir Optional custom session directory (overrides default user sessions dir)
 */
export function loadLatestSession(
  uuid: string,
  options?: { prefix?: string; sessionDir?: string }
): { sessionId: string; entries: SessionEntry[] } | null {
  const sessions = options?.sessionDir ? listSessionsFromDir(options.sessionDir) : listSessions(uuid);
  const prefix = options?.prefix;
  const match = prefix
    ? sessions.find((s) => s.sessionId.startsWith(prefix))
    : sessions.find((s) => !s.sessionId.startsWith('sa-'));
  if (!match) {
    return null;
  }

  const entries = loadSessionFromPath(match.path);
  return entries.length > 0 ? { sessionId: match.sessionId, entries } : null;
}

/**
 * List sessions from a custom directory path.
 */
function listSessionsFromDir(dir: string): SessionInfo[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const filePath = join(dir, f);
      const stat = statSync(filePath);
      return {
        sessionId: f.replace('.jsonl', ''),
        path: filePath,
        createdAt: stat.mtimeMs,
        sizeBytes: stat.size,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Load session entries from a file path.
 */
function loadSessionFromPath(filePath: string): SessionEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = readFileSync(filePath, 'utf-8');
  const entries: SessionEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}
