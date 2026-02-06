/**
 * Tools Adapter
 *
 * Converts PHA health tools to pi-agent AgentTool format.
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import {
  getHealthDataTool,
  getHeartRateTool,
  getSleepTool,
  getWorkoutsTool,
  getWeeklySummaryTool,
} from "../tools/health-data.js";
import { memorySearchTool, memorySaveTool, dailyLogTool } from "../tools/memory-tools.js";
import { getSkillTool } from "../tools/skill-tools.js";

// Define TypeBox schemas for each tool
const DateSchema = Type.Object({
  date: Type.String({ description: "Date in YYYY-MM-DD format. Use 'today' for current date." }),
});

const EmptySchema = Type.Object({});

// Create AgentTool implementations directly
export const healthDataAgentTool: AgentTool<typeof DateSchema> = {
  name: getHealthDataTool.name,
  description: getHealthDataTool.description,
  label: "Get Health Data",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getHealthDataTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const heartRateAgentTool: AgentTool<typeof DateSchema> = {
  name: getHeartRateTool.name,
  description: getHeartRateTool.description,
  label: "Get Heart Rate",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getHeartRateTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const sleepAgentTool: AgentTool<typeof DateSchema> = {
  name: getSleepTool.name,
  description: getSleepTool.description,
  label: "Get Sleep Data",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getSleepTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const workoutsAgentTool: AgentTool<typeof DateSchema> = {
  name: getWorkoutsTool.name,
  description: getWorkoutsTool.description,
  label: "Get Workouts",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getWorkoutsTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const weeklySummaryAgentTool: AgentTool<typeof EmptySchema> = {
  name: getWeeklySummaryTool.name,
  description: getWeeklySummaryTool.description,
  label: "Get Weekly Summary",
  parameters: EmptySchema,
  execute: async (
    _toolCallId: string,
    _params: Record<string, never>
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getWeeklySummaryTool.execute();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

// ========================================================================
// Memory Tools as AgentTools
// ========================================================================

const MemorySearchSchema = Type.Object({
  query: Type.String({ description: "Search query for user memories" }),
  maxResults: Type.Optional(Type.Number({ description: "Max results to return, default 5" })),
});

const MemorySaveSchema = Type.Object({
  content: Type.String({ description: "Content to save to long-term memory" }),
});

const DailyLogSchema = Type.Object({
  content: Type.String({ description: "Daily conversation summary to log" }),
});

export const memorySearchAgentTool: AgentTool<typeof MemorySearchSchema> = {
  name: memorySearchTool.name,
  description: memorySearchTool.description,
  label: "Search Memory",
  parameters: MemorySearchSchema,
  execute: async (
    _toolCallId: string,
    params: { query: string; maxResults?: number }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await memorySearchTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const memorySaveAgentTool: AgentTool<typeof MemorySaveSchema> = {
  name: memorySaveTool.name,
  description: memorySaveTool.description,
  label: "Save Memory",
  parameters: MemorySaveSchema,
  execute: async (
    _toolCallId: string,
    params: { content: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await memorySaveTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const dailyLogAgentTool: AgentTool<typeof DailyLogSchema> = {
  name: dailyLogTool.name,
  description: dailyLogTool.description,
  label: "Write Daily Log",
  parameters: DailyLogSchema,
  execute: async (
    _toolCallId: string,
    params: { content: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await dailyLogTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

// ========================================================================
// Skill Tools as AgentTools
// ========================================================================

const GetSkillSchema = Type.Object({
  name: Type.String({ description: "Skill name (e.g. 'sleep-coach', 'heart-monitor')" }),
});

export const getSkillAgentTool: AgentTool<typeof GetSkillSchema> = {
  name: getSkillTool.name,
  description:
    "Load a professional skill guide by name. Use this when the conversation topic matches an available skill to get detailed expert guidance before responding.",
  label: "Load Skill Guide",
  parameters: GetSkillSchema,
  execute: async (
    _toolCallId: string,
    params: { name: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getSkillTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

// All health tools as AgentTools - use 'any' to avoid variance issues
export const healthAgentTools: AgentTool<any>[] = [
  healthDataAgentTool,
  heartRateAgentTool,
  sleepAgentTool,
  workoutsAgentTool,
  weeklySummaryAgentTool,
  memorySearchAgentTool,
  memorySaveAgentTool,
  dailyLogAgentTool,
  getSkillAgentTool,
];
