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

// All health tools as AgentTools - use 'any' to avoid variance issues
export const healthAgentTools: AgentTool<any>[] = [
  healthDataAgentTool,
  heartRateAgentTool,
  sleepAgentTool,
  workoutsAgentTool,
  weeklySummaryAgentTool,
];
