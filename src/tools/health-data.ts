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
    "Retrieve health metrics for a given date. Returns steps, calories, activeMinutes, distance. Call this when the user asks about steps, activity, or exercise.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for today.",
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
    "Retrieve heart rate data for a given date. Returns restingAvg, maxToday, minToday, and hourly readings. Call this when the user asks about heart rate.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for today.",
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
    "Retrieve sleep data for a given date. Returns durationHours, qualityScore, bedTime, wakeTime, and stages (deep/light/rem/awake). Call this when the user asks about sleep or rest.",
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
  description:
    "Retrieve workout records for a given date. Returns type, durationMinutes, caloriesBurned, distanceKm, avgHeartRate. Call this when the user asks about workouts or exercise.",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format. Use 'today' for today.",
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
  description:
    "Retrieve a 7-day health summary. Returns daily steps, total/average steps, daily sleep hours, and average sleep. Call this when the user asks about their week or recent days.",
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
