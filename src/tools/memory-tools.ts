/**
 * Memory Tools
 *
 * Tools for searching, saving, and logging user memories.
 */

import { getMemoryManager } from "../memory/index.js";
import { getUserUuid } from "../utils/config.js";
import type { PHATool } from "./types.js";

export const memorySearchTool: PHATool<{ query: string; maxResults?: number }> = {
  name: "memory_search",
  description: "搜索用户记忆。用于回忆过往对话、健康历史或偏好。返回匹配的记忆片段及相关度评分。",
  displayName: "搜索记忆",
  category: "memory",
  icon: "search",
  label: "Memory Search",
  inputSchema: {
    type: "object",
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

export const memorySaveTool: PHATool<{ content: string }> = {
  name: "memory_save",
  description:
    "将重要信息保存到用户长期记忆（MEMORY.md）。当用户提到重要健康信息、偏好或对话中的关键发现时调用。",
  displayName: "保存记忆",
  category: "memory",
  icon: "save",
  label: "Memory Save",
  inputSchema: {
    type: "object",
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

export const dailyLogTool: PHATool<{ content: string }> = {
  name: "daily_log",
  description:
    "记录今日对话要点到每日日志。在对话结束前或出现重要健康发现时调用，保存健康相关讨论的摘要。",
  displayName: "每日记录",
  category: "memory",
  icon: "calendar",
  label: "Daily Log",
  inputSchema: {
    type: "object",
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

export const memoryStatusTool: PHATool = {
  name: "memory_status",
  description:
    "获取记忆索引的状态信息（用于调试）。返回索引的健康状态、包含的文件数、分块数、FTS和向量搜索的可用性。",
  displayName: "记忆状态",
  category: "memory",
  icon: "info",
  label: "Memory Status",
  inputSchema: { type: "object", properties: {} },
  execute: async () => {
    const uuid = getUserUuid();
    const mm = getMemoryManager();
    const status = await mm.getIndexStatus(uuid);
    return {
      success: true,
      data: status,
    };
  },
};

export const memoryTools = [memorySearchTool, memorySaveTool, dailyLogTool, memoryStatusTool];
