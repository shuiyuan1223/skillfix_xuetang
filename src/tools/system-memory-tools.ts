/**
 * System Agent Memory Tools
 *
 * File-based memory system for the SystemAgent.
 * Stores evolution logs, tool wishlists, and experience notes
 * under .pha/system-agent/ directory.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { findProjectRoot } from "../utils/config.js";
import type { PHATool } from "./types.js";

const MEMORY_DIR = "system-agent";

function getMemoryDir(): string {
  const root = findProjectRoot();
  const dir = join(root, ".pha", MEMORY_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getMemoryFile(name: string): string {
  return join(getMemoryDir(), name);
}

export function readMemoryFile(name: string): string {
  const path = getMemoryFile(name);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function writeMemoryFile(name: string, content: string): void {
  const path = getMemoryFile(name);
  writeFileSync(path, content, "utf-8");
}

export function appendMemoryFile(name: string, content: string): void {
  const path = getMemoryFile(name);
  appendFileSync(path, content, "utf-8");
}

/**
 * Programmatic helper: append a timestamped entry to evolution-log.md.
 * Called automatically by evolution tools so logs persist even if the LLM
 * forgets to call system_memory_append.
 */
export function appendEvolutionLog(entry: string): void {
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const formatted = `\n## ${timestamp}\n\n${entry}\n`;
  appendMemoryFile("evolution-log.md", formatted);
}

// ========================================================================
// Memory Read Tool
// ========================================================================

export const systemMemoryReadTool: PHATool<{ file: string }> = {
  name: "system_memory_read",
  description:
    "Read a SystemAgent memory file. Available files: memory.md (general notes), evolution-log.md (evolution history), tool-wishlist.md (desired tool improvements), experience.md (accumulated experience).",
  displayName: "读取系统记忆",
  category: "system",
  icon: "file-text",
  label: "Read System Memory",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description:
          "Memory file name: 'memory', 'evolution-log', 'tool-wishlist', or 'experience'",
      },
    },
    required: ["file"],
  },
  execute: async (args: { file: string }) => {
    const filename = args.file.endsWith(".md") ? args.file : `${args.file}.md`;
    const content = readMemoryFile(filename);
    return {
      success: true,
      file: filename,
      content: content || "(empty)",
      lines: content ? content.split("\n").length : 0,
    };
  },
};

// ========================================================================
// Memory Write Tool
// ========================================================================

export const systemMemoryWriteTool: PHATool<{ file: string; content: string }> = {
  name: "system_memory_write",
  description:
    "Write or overwrite a SystemAgent memory file. Use this to save structured notes, update experience summaries, or rewrite memory files.",
  displayName: "写入系统记忆",
  category: "system",
  icon: "save",
  label: "Write System Memory",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description:
          "Memory file name: 'memory', 'evolution-log', 'tool-wishlist', or 'experience'",
      },
      content: {
        type: "string",
        description: "Full content to write (replaces existing content)",
      },
    },
    required: ["file", "content"],
  },
  execute: async (args: { file: string; content: string }) => {
    const filename = args.file.endsWith(".md") ? args.file : `${args.file}.md`;
    writeMemoryFile(filename, args.content);
    return {
      success: true,
      file: filename,
      message: `Written ${args.content.length} chars to ${filename}`,
    };
  },
};

// ========================================================================
// Memory Append Tool
// ========================================================================

export const systemMemoryAppendTool: PHATool<{ file: string; entry: string }> = {
  name: "system_memory_append",
  description:
    "Append an entry to a SystemAgent memory file. Use this for adding new evolution log entries, tool suggestions, or experience notes without overwriting existing content.",
  displayName: "追加系统记忆",
  category: "system",
  icon: "save",
  label: "Append System Memory",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description:
          "Memory file name: 'memory', 'evolution-log', 'tool-wishlist', or 'experience'",
      },
      entry: {
        type: "string",
        description: "Content to append (will be prefixed with timestamp)",
      },
    },
    required: ["file", "entry"],
  },
  execute: async (args: { file: string; entry: string }) => {
    const filename = args.file.endsWith(".md") ? args.file : `${args.file}.md`;
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const formatted = `\n## ${timestamp}\n\n${args.entry}\n`;
    appendMemoryFile(filename, formatted);
    return {
      success: true,
      file: filename,
      message: `Appended entry to ${filename}`,
      timestamp,
    };
  },
};

// ========================================================================
// Memory Search Tool
// ========================================================================

export const systemMemorySearchTool: PHATool<{ query: string }> = {
  name: "system_memory_search",
  description:
    "Search across all SystemAgent memory files for a keyword or phrase. Returns matching sections.",
  displayName: "搜索系统记忆",
  category: "system",
  icon: "search",
  label: "Search System Memory",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search keyword or phrase",
      },
    },
    required: ["query"],
  },
  execute: async (args: { query: string }) => {
    const files = ["memory.md", "evolution-log.md", "tool-wishlist.md", "experience.md"];
    const results: { file: string; matches: string[] }[] = [];
    const queryLower = args.query.toLowerCase();

    for (const file of files) {
      const content = readMemoryFile(file);
      if (!content) continue;

      const lines = content.split("\n");
      const matches: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          // Include context: 2 lines before and after
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          matches.push(lines.slice(start, end).join("\n"));
        }
      }

      if (matches.length > 0) {
        results.push({ file, matches });
      }
    }

    return {
      success: true,
      query: args.query,
      results,
      totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
    };
  },
};

// Export all system memory tools
export const systemMemoryTools = [
  systemMemoryReadTool,
  systemMemoryWriteTool,
  systemMemoryAppendTool,
  systemMemorySearchTool,
];
