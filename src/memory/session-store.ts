/**
 * Session Transcript Store
 * Stores raw conversation transcripts as JSONL files.
 * Each session is a separate .jsonl file under .pha/users/{uuid}/sessions/
 */

import { existsSync, appendFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UserMessage, AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import { getUserDir, ensureUserDir } from "./profile.js";

export interface SessionEntry {
  timestamp: number;
  role: "user" | "assistant" | "tool";
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
    if (!("role" in msg)) continue;

    if (msg.role === "user") {
      const userMsg = msg as UserMessage;
      const text =
        typeof userMsg.content === "string"
          ? userMsg.content
          : userMsg.content
              .filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("\n");
      if (text) {
        entries.push({
          timestamp: userMsg.timestamp || Date.now(),
          role: "user",
          content: text,
        });
      }
    } else if (msg.role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      const parts: string[] = [];
      for (const block of assistantMsg.content) {
        if (block.type === "text") {
          parts.push(block.text);
        } else if (block.type === "toolCall") {
          parts.push(`[Tool Call: ${block.name}(${JSON.stringify(block.arguments)})]`);
        }
        // Skip thinking blocks — not useful for transcript
      }
      if (parts.length > 0) {
        entries.push({
          timestamp: assistantMsg.timestamp || Date.now(),
          role: "assistant",
          content: parts.join("\n"),
        });
      }
    } else if (msg.role === "toolResult") {
      const toolMsg = msg as ToolResultMessage;
      const text = toolMsg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      entries.push({
        timestamp: toolMsg.timestamp || Date.now(),
        role: "tool",
        content: text || (toolMsg.isError ? "[error]" : "[ok]"),
        toolName: toolMsg.toolName,
      });
    }
  }

  return entries;
}

/**
 * Get the sessions directory for a user
 */
function getSessionsDir(uuid: string): string {
  return join(getUserDir(uuid), "sessions");
}

/**
 * Append entries to a session transcript file.
 * Creates the file if it doesn't exist. Append-only JSONL format.
 */
export function appendToSession(uuid: string, sessionId: string, entries: SessionEntry[]): void {
  ensureUserDir(uuid);
  const sessionsDir = getSessionsDir(uuid);
  const filePath = join(sessionsDir, `${sessionId}.jsonl`);

  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  appendFileSync(filePath, lines);
}

/**
 * Save AgentMessage[] directly to a session transcript.
 * Convenience wrapper: serializes messages then appends.
 */
export function saveSessionTranscript(
  uuid: string,
  sessionId: string,
  messages: AgentMessage[]
): void {
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
  if (!existsSync(sessionsDir)) return [];

  const files = readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const filePath = join(sessionsDir, f);
      const stat = statSync(filePath);
      return {
        sessionId: f.replace(".jsonl", ""),
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
