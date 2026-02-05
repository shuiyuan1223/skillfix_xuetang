/**
 * Health Data Tools
 *
 * Tools for retrieving health data from the configured data source.
 */

import type { HealthDataSource } from "../data-sources/interface.js";
import { getConfiguredDataSource, resetCachedDataSource } from "../data-sources/index.js";

// Current data source (uses configuration-based source by default)
let dataSource: HealthDataSource | null = null;

export function setDataSource(source: HealthDataSource): void {
  dataSource = source;
}

export function getDataSource(): HealthDataSource {
  if (!dataSource) {
    dataSource = getConfiguredDataSource();
  }
  return dataSource;
}

export function resetDataSource(): void {
  dataSource = null;
  resetCachedDataSource();
}

// Tool definitions for pi-agent

export const getHealthDataTool = {
  name: "get_health_data",
  description:
    "Get health metrics for a specific date including steps, calories, active minutes, and distance.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for current date.",
      },
    },
    required: ["date"],
  },
  execute: async (args: { date: string }) => {
    const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
    const source = getDataSource();
    const metrics = await source.getMetrics(date);
    return {
      success: true,
      data: metrics,
    };
  },
};

export const getHeartRateTool = {
  name: "get_heart_rate",
  description:
    "Get heart rate data for a specific date including resting average, max, min, and hourly readings.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for current date.",
      },
    },
    required: ["date"],
  },
  execute: async (args: { date: string }) => {
    const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
    const source = getDataSource();
    const heartRate = await source.getHeartRate(date);
    return {
      success: true,
      data: heartRate,
    };
  },
};

export const getSleepTool = {
  name: "get_sleep",
  description:
    "Get sleep data for a specific date including duration, quality score, and sleep stages.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for last night's sleep.",
      },
    },
    required: ["date"],
  },
  execute: async (args: { date: string }) => {
    const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
    const source = getDataSource();
    const sleep = await source.getSleep(date);
    if (!sleep) {
      return {
        success: true,
        data: null,
        message: "No sleep data available for this date.",
      };
    }
    return {
      success: true,
      data: sleep,
    };
  },
};

export const getWorkoutsTool = {
  name: "get_workouts",
  description: "Get workout data for a specific date.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for current date.",
      },
    },
    required: ["date"],
  },
  execute: async (args: { date: string }) => {
    const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
    const source = getDataSource();
    const workouts = await source.getWorkouts(date);
    return {
      success: true,
      data: workouts,
      count: workouts.length,
    };
  },
};

export const getWeeklySummaryTool = {
  name: "get_weekly_summary",
  description: "Get a summary of health data for the past 7 days.",
  parameters: {
    type: "object" as const,
    properties: {},
  },
  execute: async () => {
    const today = new Date().toISOString().split("T")[0];
    const source = getDataSource();
    const [weeklySteps, weeklySleep] = await Promise.all([
      source.getWeeklySteps(today),
      source.getWeeklySleep(today),
    ]);

    const totalSteps = weeklySteps.reduce((sum, d) => sum + d.steps, 0);
    const avgSteps = Math.round(totalSteps / 7);

    const sleepDays = weeklySleep.filter((d) => d.hours > 0);
    const totalSleep = sleepDays.reduce((sum, d) => sum + d.hours, 0);
    const avgSleep =
      sleepDays.length > 0 ? Math.round((totalSleep / sleepDays.length) * 10) / 10 : 0;

    return {
      success: true,
      data: {
        period: "Last 7 days",
        steps: {
          total: totalSteps,
          average: avgSteps,
          daily: weeklySteps,
        },
        sleep: {
          averageHours: avgSleep,
          daily: weeklySleep,
        },
      },
    };
  },
};

// Export all tools as array
export const healthTools = [
  getHealthDataTool,
  getHeartRateTool,
  getSleepTool,
  getWorkoutsTool,
  getWeeklySummaryTool,
];
