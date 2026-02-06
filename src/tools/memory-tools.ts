/**
 * Memory Tools
 *
 * Tools for searching, saving, and logging user memories.
 */

import { getMemoryManager } from "../memory/index.js";
import { getUserUuid } from "../utils/config.js";

export const memorySearchTool = {
  name: "memory_search",
  description:
    "Search the user's memory. Use when you need to recall past conversations, health history, or preferences. Returns matching memory snippets with relevance scores.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search keywords or phrase",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return, default 5",
      },
    },
    required: ["query"],
  },
  execute: async (args: { query: string; maxResults?: number }) => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();
    const results = await mm.searchAsync(uuid, args.query, {
      maxResults: args.maxResults ?? 5,
    });
    return {
      success: true,
      data: results,
      count: results.length,
    };
  },
};

export const memorySaveTool = {
  name: "memory_save",
  description:
    "Save important information to the user's long-term memory (MEMORY.md). Use when the user mentions important health info, preferences, or key findings during conversation.",
  parameters: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "Content to save",
      },
    },
    required: ["content"],
  },
  execute: async (args: { content: string }) => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();
    mm.appendMemory(uuid, args.content);
    return {
      success: true,
      message: "Memory saved successfully",
    };
  },
};

export const dailyLogTool = {
  name: "daily_log",
  description:
    "Record today's conversation highlights to the daily log. Call before the conversation ends or when important findings arise, to save a summary of health-related discussion.",
  parameters: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "Summary of today's conversation highlights",
      },
    },
    required: ["content"],
  },
  execute: async (args: { content: string }) => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();
    mm.appendDailyLog(uuid, args.content);
    return {
      success: true,
      message: "Daily log entry saved",
    };
  },
};

export const memoryTools = [memorySearchTool, memorySaveTool, dailyLogTool];
