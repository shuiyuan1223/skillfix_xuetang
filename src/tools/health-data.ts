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
    "获取指定日期的健康数据。返回步数(steps)、卡路里(calories)、活动时间(activeMinutes)、距离(distance)。当用户询问步数、运动量、活动情况时调用此工具。",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "日期，格式为 YYYY-MM-DD。使用 'today' 表示今天。",
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
    "获取指定日期的心率数据。返回静息心率(restingAvg)、最高心率(maxToday)、最低心率(minToday)、每小时读数(readings)。当用户询问心率、心跳时调用此工具。",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "日期，格式为 YYYY-MM-DD。使用 'today' 表示今天。",
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
    "获取指定日期的睡眠数据。返回睡眠时长(durationHours)、质量评分(qualityScore)、入睡时间(bedTime)、起床时间(wakeTime)、睡眠阶段(stages: deep/light/rem/awake)。当用户询问睡眠、睡觉、休息情况时调用此工具。",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "日期，格式为 YYYY-MM-DD。使用 'today' 表示昨晚的睡眠。",
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
    "获取指定日期的运动记录。返回运动类型(type)、时长(durationMinutes)、消耗卡路里(caloriesBurned)、距离(distanceKm)、平均心率(avgHeartRate)。当用户询问运动、锻炼、健身记录时调用此工具。",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "日期，格式为 YYYY-MM-DD。使用 'today' 表示今天。",
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
    "获取过去7天的健康数据汇总。返回每日步数、总步数、平均步数、每日睡眠时长、平均睡眠时长。当用户询问本周、这周、最近几天的健康情况时调用此工具。",
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
