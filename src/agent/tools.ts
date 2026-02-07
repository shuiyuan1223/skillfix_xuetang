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
  getStressTool,
  getSpO2Tool,
  getHealthTrendsTool,
  getBloodPressureTool,
  getBloodGlucoseTool,
  getBodyCompositionTool,
  getBodyTemperatureTool,
  getNutritionTool,
  getMenstrualCycleTool,
  getVO2MaxTool,
  getEmotionTool,
  getHRVTool,
  createHealthTools,
} from "../tools/health-data.js";
import type { HealthDataSource } from "../data-sources/interface.js";
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
// New Health Tools (Stress, SpO2, Trends)
// ========================================================================

export const stressAgentTool: AgentTool<typeof DateSchema> = {
  name: getStressTool.name,
  description: getStressTool.description,
  label: "Get Stress Data",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getStressTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const spo2AgentTool: AgentTool<typeof DateSchema> = {
  name: getSpO2Tool.name,
  description: getSpO2Tool.description,
  label: "Get Blood Oxygen",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getSpO2Tool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

const HealthTrendsSchema = Type.Object({
  period: Type.String({
    description: "Time period: '7d', '30d', '90d', '180d', '365d', '730d'",
  }),
  metrics: Type.Optional(
    Type.String({
      description: "Comma-separated metrics: 'steps,sleep,heart_rate,calories,workouts'",
    })
  ),
});

export const healthTrendsAgentTool: AgentTool<typeof HealthTrendsSchema> = {
  name: getHealthTrendsTool.name,
  description: getHealthTrendsTool.description,
  label: "Get Health Trends",
  parameters: HealthTrendsSchema,
  execute: async (
    _toolCallId: string,
    params: { period: string; metrics?: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getHealthTrendsTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

// ========================================================================
// New Health Data Tools (Blood Pressure, Glucose, Body Composition, etc.)
// ========================================================================

export const bloodPressureAgentTool: AgentTool<typeof DateSchema> = {
  name: getBloodPressureTool.name,
  description: getBloodPressureTool.description,
  label: "Get Blood Pressure",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getBloodPressureTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const bloodGlucoseAgentTool: AgentTool<typeof DateSchema> = {
  name: getBloodGlucoseTool.name,
  description: getBloodGlucoseTool.description,
  label: "Get Blood Glucose",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getBloodGlucoseTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const bodyCompositionAgentTool: AgentTool<typeof DateSchema> = {
  name: getBodyCompositionTool.name,
  description: getBodyCompositionTool.description,
  label: "Get Body Composition",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getBodyCompositionTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const bodyTemperatureAgentTool: AgentTool<typeof DateSchema> = {
  name: getBodyTemperatureTool.name,
  description: getBodyTemperatureTool.description,
  label: "Get Body Temperature",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getBodyTemperatureTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const nutritionAgentTool: AgentTool<typeof DateSchema> = {
  name: getNutritionTool.name,
  description: getNutritionTool.description,
  label: "Get Nutrition",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getNutritionTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const menstrualCycleAgentTool: AgentTool<typeof DateSchema> = {
  name: getMenstrualCycleTool.name,
  description: getMenstrualCycleTool.description,
  label: "Get Menstrual Cycle",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getMenstrualCycleTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

// ========================================================================
// Tier 1 New Data Tools (VO2 Max, Emotion, HRV)
// ========================================================================

export const vo2maxAgentTool: AgentTool<typeof DateSchema> = {
  name: getVO2MaxTool.name,
  description: getVO2MaxTool.description,
  label: "Get VO2 Max",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getVO2MaxTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const emotionAgentTool: AgentTool<typeof DateSchema> = {
  name: getEmotionTool.name,
  description: getEmotionTool.description,
  label: "Get Emotion",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getEmotionTool.execute(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const hrvAgentTool: AgentTool<typeof DateSchema> = {
  name: getHRVTool.name,
  description: getHRVTool.description,
  label: "Get HRV",
  parameters: DateSchema,
  execute: async (
    _toolCallId: string,
    params: { date: string }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await getHRVTool.execute(params);
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
  stressAgentTool,
  spo2AgentTool,
  healthTrendsAgentTool,
  bloodPressureAgentTool,
  bloodGlucoseAgentTool,
  bodyCompositionAgentTool,
  bodyTemperatureAgentTool,
  nutritionAgentTool,
  menstrualCycleAgentTool,
  vo2maxAgentTool,
  emotionAgentTool,
  hrvAgentTool,
  memorySearchAgentTool,
  memorySaveAgentTool,
  dailyLogAgentTool,
  getSkillAgentTool,
];

/**
 * Create per-session AgentTools bound to a specific data source.
 * This ensures each user session uses its own authenticated data source
 * instead of the global singleton.
 */
export function createHealthAgentTools(dataSource: HealthDataSource): AgentTool<any>[] {
  const tools = createHealthTools(dataSource);

  const wrapTool = (
    tool: { name: string; description: string },
    label: string,
    schema: any,
    execute: (toolCallId: string, params: any) => Promise<AgentToolResult<unknown>>
  ): AgentTool<any> => ({
    name: tool.name,
    description: tool.description,
    label,
    parameters: schema,
    execute,
  });

  const toResult = async (fn: () => Promise<unknown>): Promise<AgentToolResult<unknown>> => {
    const result = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  };

  return [
    wrapTool(tools.getHealthData, "Get Health Data", DateSchema, (_id, p) =>
      toResult(() => tools.getHealthData.execute(p))
    ),
    wrapTool(tools.getHeartRate, "Get Heart Rate", DateSchema, (_id, p) =>
      toResult(() => tools.getHeartRate.execute(p))
    ),
    wrapTool(tools.getSleep, "Get Sleep Data", DateSchema, (_id, p) =>
      toResult(() => tools.getSleep.execute(p))
    ),
    wrapTool(tools.getWorkouts, "Get Workouts", DateSchema, (_id, p) =>
      toResult(() => tools.getWorkouts.execute(p))
    ),
    wrapTool(tools.getWeeklySummary, "Get Weekly Summary", EmptySchema, (_id) =>
      toResult(() => tools.getWeeklySummary.execute())
    ),
    wrapTool(tools.getStress, "Get Stress Data", DateSchema, (_id, p) =>
      toResult(() => tools.getStress.execute(p))
    ),
    wrapTool(tools.getSpO2, "Get Blood Oxygen", DateSchema, (_id, p) =>
      toResult(() => tools.getSpO2.execute(p))
    ),
    wrapTool(tools.getBloodPressure, "Get Blood Pressure", DateSchema, (_id, p) =>
      toResult(() => tools.getBloodPressure.execute(p))
    ),
    wrapTool(tools.getBloodGlucose, "Get Blood Glucose", DateSchema, (_id, p) =>
      toResult(() => tools.getBloodGlucose.execute(p))
    ),
    wrapTool(tools.getBodyComposition, "Get Body Composition", DateSchema, (_id, p) =>
      toResult(() => tools.getBodyComposition.execute(p))
    ),
    wrapTool(tools.getBodyTemperature, "Get Body Temperature", DateSchema, (_id, p) =>
      toResult(() => tools.getBodyTemperature.execute(p))
    ),
    wrapTool(tools.getNutrition, "Get Nutrition", DateSchema, (_id, p) =>
      toResult(() => tools.getNutrition.execute(p))
    ),
    wrapTool(tools.getMenstrualCycle, "Get Menstrual Cycle", DateSchema, (_id, p) =>
      toResult(() => tools.getMenstrualCycle.execute(p))
    ),
    wrapTool(tools.getVO2Max, "Get VO2 Max", DateSchema, (_id, p) =>
      toResult(() => tools.getVO2Max.execute(p))
    ),
    wrapTool(tools.getEmotion, "Get Emotion", DateSchema, (_id, p) =>
      toResult(() => tools.getEmotion.execute(p))
    ),
    wrapTool(tools.getHRV, "Get HRV", DateSchema, (_id, p) =>
      toResult(() => tools.getHRV.execute(p))
    ),
    // Health trends uses global data source, same for all sessions
    healthTrendsAgentTool,
    // Memory & skill tools are not data-source dependent, reuse static instances
    memorySearchAgentTool,
    memorySaveAgentTool,
    dailyLogAgentTool,
    getSkillAgentTool,
  ];
}
