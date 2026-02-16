/**
 * Health Data Tools
 *
 * Tools for retrieving health data from the configured data source.
 */

import type { HealthDataSource } from "../data-sources/interface.js";
import { getConfiguredDataSource, resetCachedDataSource } from "../data-sources/index.js";
import type { PHATool } from "./types.js";

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

export const getHealthDataTool: PHATool<{ date: string }> = {
  name: "get_health_data",
  description:
    "获取指定日期的健康指标数据。返回步数、卡路里、活动时长、距离。当用户询问步数、活动量或运动时调用。",
  displayName: "健康数据",
  category: "health" as const,
  icon: "activity",
  sessionBound: true,
  label: "Get Health Data",
  inputSchema: {
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

export const getHeartRateTool: PHATool<{ date: string }> = {
  name: "get_heart_rate",
  description:
    "获取指定日期的心率数据。返回静息平均值、最高值、最低值及每小时读数。当用户询问心率时调用。",
  displayName: "心率数据",
  category: "health" as const,
  icon: "heart-pulse",
  companionSkill: "heart-monitor",
  sessionBound: true,
  label: "Get Heart Rate",
  inputSchema: {
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

export const getSleepTool: PHATool<{ date: string }> = {
  name: "get_sleep",
  description:
    "获取指定日期的睡眠数据。返回睡眠时长、质量评分、入睡时间、起床时间及各阶段（深睡/浅睡/REM/清醒）。当用户询问睡眠时调用。",
  displayName: "睡眠数据",
  category: "health" as const,
  icon: "moon",
  companionSkill: "sleep-coach",
  sessionBound: true,
  label: "Get Sleep",
  inputSchema: {
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

export const getWorkoutsTool: PHATool<{ date: string }> = {
  name: "get_workouts",
  description:
    "获取指定日期的运动记录。返回运动类型、时长、消耗卡路里、距离、平均心率。当用户询问锻炼或运动时调用。",
  displayName: "运动数据",
  category: "health" as const,
  icon: "activity",
  companionSkill: "workout-tracker",
  sessionBound: true,
  label: "Get Workouts",
  inputSchema: {
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

export const getWeeklySummaryTool: PHATool<{}> = {
  name: "get_weekly_summary",
  description:
    "获取 7 天健康汇总。返回每日步数、总步数/平均步数、每日睡眠时长及平均值。当用户询问一周情况或近几天数据时调用。",
  displayName: "周报汇总",
  category: "health" as const,
  icon: "calendar",
  companionSkill: "weekly-review",
  sessionBound: true,
  label: "Get Weekly Summary",
  inputSchema: {
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

export const getStressTool: PHATool<{ date: string }> = {
  name: "get_stress",
  description:
    "获取指定日期的压力数据。返回当前压力值（1-99）、平均值、最高值、最低值及全天读数。当用户询问压力或心理负荷时调用。",
  displayName: "压力数据",
  category: "health" as const,
  icon: "brain",
  companionSkill: "stress-management",
  sessionBound: true,
  label: "Get Stress",
  inputSchema: {
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
    if (!source.getStress) {
      return {
        success: true,
        data: null,
        message: "Stress data not supported by this data source.",
      };
    }
    const stress = await source.getStress(date);
    if (!stress) {
      return { success: true, data: null, message: "No stress data available for this date." };
    }
    return { success: true, data: stress };
  },
};

export const getSpO2Tool: PHATool<{ date: string }> = {
  name: "get_spo2",
  description:
    "获取指定日期的血氧数据。返回当前血氧百分比、平均值、最高值、最低值及读数。当用户询问血氧或氧饱和度时调用。",
  displayName: "血氧数据",
  category: "health" as const,
  icon: "wind",
  companionSkill: "blood-oxygen",
  sessionBound: true,
  label: "Get SpO2",
  inputSchema: {
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
    if (!source.getSpO2) {
      return { success: true, data: null, message: "SpO2 data not supported by this data source." };
    }
    const spo2 = await source.getSpO2(date);
    if (!spo2) {
      return { success: true, data: null, message: "No SpO2 data available for this date." };
    }
    return { success: true, data: spo2 };
  },
};

export const getHealthTrendsTool: PHATool<{ period: string; metrics?: string }> = {
  name: "get_health_trends",
  description:
    "获取长期健康趋势（按周、月或年）。返回步数、睡眠、心率的聚合日数据。用于趋势分析、进度追踪和长期模式识别，支持最多 2 年历史数据。",
  displayName: "健康趋势",
  category: "health" as const,
  icon: "trending-up",
  sessionBound: true,
  label: "Get Health Trends",
  inputSchema: {
    type: "object" as const,
    properties: {
      period: {
        type: "string",
        description:
          "Time period: '7d' (1 week), '30d' (1 month), '90d' (3 months), '180d' (6 months), '365d' (1 year), '730d' (2 years).",
      },
      metrics: {
        type: "string",
        description:
          "Comma-separated metrics to include: 'steps,sleep,heart_rate,calories,workouts'. Default: all.",
      },
    },
    required: ["period"],
  },
  execute: async (args: { period: string; metrics?: string }) => {
    const days = parseInt(args.period) || 30;
    const cappedDays = Math.min(days, 730); // Cap at 2 years

    const requestedMetrics = args.metrics
      ? args.metrics.split(",").map((m) => m.trim())
      : ["steps", "sleep", "heart_rate", "calories", "workouts"];

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - cappedDays);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = today.toISOString().split("T")[0];
    const source = getDataSource();

    const result: Record<string, unknown> = {
      period: `${cappedDays} days`,
      startDate: startStr,
      endDate: endStr,
    };

    // For long periods, aggregate by week to keep response manageable
    const aggregateByWeek = cappedDays > 90;

    // Fetch metrics range if available, otherwise fall back to daily queries
    if (requestedMetrics.some((m) => ["steps", "calories"].includes(m)) && source.getMetricsRange) {
      const metricsData = await source.getMetricsRange(startStr, endStr);
      if (aggregateByWeek) {
        result.activity = aggregateWeekly(metricsData, (items) => ({
          avgSteps: Math.round(items.reduce((s, d) => s + d.steps, 0) / items.length),
          avgCalories: Math.round(items.reduce((s, d) => s + d.calories, 0) / items.length),
          totalSteps: items.reduce((s, d) => s + d.steps, 0),
        }));
      } else {
        result.activity = metricsData;
      }
    }

    if (requestedMetrics.includes("sleep") && source.getSleepRange) {
      const sleepData = await source.getSleepRange(startStr, endStr);
      if (aggregateByWeek) {
        result.sleep = aggregateWeekly(
          sleepData.filter((d) => d.hours > 0),
          (items) => ({
            avgHours: Math.round((items.reduce((s, d) => s + d.hours, 0) / items.length) * 10) / 10,
            avgQuality: items[0]?.qualityScore
              ? Math.round(items.reduce((s, d) => s + (d.qualityScore || 0), 0) / items.length)
              : undefined,
          })
        );
      } else {
        result.sleep = sleepData;
      }
    }

    if (requestedMetrics.includes("heart_rate") && source.getHeartRateRange) {
      const hrData = await source.getHeartRateRange(startStr, endStr);
      if (aggregateByWeek) {
        result.heartRate = aggregateWeekly(
          hrData.filter((d) => d.avg > 0),
          (items) => ({
            avgResting: Math.round(items.reduce((s, d) => s + d.avg, 0) / items.length),
            maxHR: Math.max(...items.map((d) => d.max)),
            minHR: Math.min(...items.map((d) => d.min)),
          })
        );
      } else {
        result.heartRate = hrData;
      }
    }

    if (requestedMetrics.includes("workouts") && source.getWorkoutsRange) {
      const workouts = await source.getWorkoutsRange(startStr, endStr);
      // Summarize workouts by type
      const byType: Record<string, { count: number; totalMinutes: number; totalCalories: number }> =
        {};
      for (const w of workouts) {
        if (!byType[w.type]) byType[w.type] = { count: 0, totalMinutes: 0, totalCalories: 0 };
        byType[w.type].count++;
        byType[w.type].totalMinutes += w.durationMinutes;
        byType[w.type].totalCalories += w.caloriesBurned;
      }
      result.workouts = {
        total: workouts.length,
        byType,
        avgPerWeek: Math.round((workouts.length / (cappedDays / 7)) * 10) / 10,
      };
    }

    return { success: true, data: result };
  },
};

/** Aggregate daily data into weekly buckets */
function aggregateWeekly<T extends { date: string }, R>(
  data: T[],
  reducer: (items: T[]) => R
): Array<{ weekStart: string; weekEnd: string } & R> {
  if (data.length === 0) return [];

  const weeks: Map<string, T[]> = new Map();
  for (const item of data) {
    const d = new Date(item.date);
    // Get Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const weekKey = monday.toISOString().split("T")[0];
    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(item);
  }

  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, items]) => {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      return {
        weekStart,
        weekEnd: end.toISOString().split("T")[0],
        ...reducer(items),
      };
    });
}

export const getBloodPressureTool: PHATool<{ date: string }> = {
  name: "get_blood_pressure",
  description:
    "获取指定日期的血压数据。返回收缩压/舒张压读数、平均值及各次测量记录。当用户询问血压时调用。",
  displayName: "血压数据",
  category: "health" as const,
  icon: "heart",
  companionSkill: "blood-pressure",
  sessionBound: true,
  label: "Get Blood Pressure",
  inputSchema: {
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
    if (!source.getBloodPressure) {
      return {
        success: true,
        data: null,
        message: "Blood pressure not supported by this data source.",
      };
    }
    const bp = await source.getBloodPressure(date);
    return bp
      ? { success: true, data: bp }
      : { success: true, data: null, message: "No blood pressure data available for this date." };
  },
};

export const getBloodGlucoseTool: PHATool<{ date: string }> = {
  name: "get_blood_glucose",
  description:
    "获取指定日期的血糖数据。返回血糖读数（mmol/L），含平均值、最高值、最低值。当用户询问血糖时调用。",
  displayName: "血糖数据",
  category: "health" as const,
  icon: "flame",
  companionSkill: "blood-sugar",
  sessionBound: true,
  label: "Get Blood Glucose",
  inputSchema: {
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
    if (!source.getBloodGlucose) {
      return {
        success: true,
        data: null,
        message: "Blood glucose not supported by this data source.",
      };
    }
    const bg = await source.getBloodGlucose(date);
    return bg
      ? { success: true, data: bg }
      : { success: true, data: null, message: "No blood glucose data available for this date." };
  },
};

export const getBodyCompositionTool: PHATool<{ date: string }> = {
  name: "get_body_composition",
  description:
    "获取体成分数据，包括体重、身高、BMI 和体脂率。使用 30 天回溯查找最新测量值。当用户询问体重、BMI 或体脂时调用。",
  displayName: "体成分数据",
  category: "health" as const,
  icon: "user",
  companionSkill: "weight-management",
  sessionBound: true,
  label: "Get Body Composition",
  inputSchema: {
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
    if (!source.getBodyComposition) {
      return {
        success: true,
        data: null,
        message: "Body composition not supported by this data source.",
      };
    }
    const bc = await source.getBodyComposition(date);
    return bc
      ? { success: true, data: bc }
      : { success: true, data: null, message: "No body composition data available." };
  },
};

export const getBodyTemperatureTool: PHATool<{ date: string }> = {
  name: "get_body_temperature",
  description:
    "获取指定日期的体温数据。返回体温读数（摄氏度），含平均值、最高值、最低值。当用户询问体温或发烧时调用。",
  displayName: "体温数据",
  category: "health" as const,
  icon: "stethoscope",
  sessionBound: true,
  label: "Get Body Temperature",
  inputSchema: {
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
    if (!source.getBodyTemperature) {
      return {
        success: true,
        data: null,
        message: "Body temperature not supported by this data source.",
      };
    }
    const temp = await source.getBodyTemperature(date);
    return temp
      ? { success: true, data: temp }
      : { success: true, data: null, message: "No body temperature data available for this date." };
  },
};

export const getNutritionTool: PHATool<{ date: string }> = {
  name: "get_nutrition",
  description:
    "获取指定日期的营养饮食数据。返回总卡路里、宏量营养素（蛋白质、脂肪、碳水）、饮水量及各餐记录。当用户询问饮食或营养时调用。",
  displayName: "营养数据",
  category: "health" as const,
  icon: "flame",
  companionSkill: "nutrition",
  sessionBound: true,
  label: "Get Nutrition",
  inputSchema: {
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
    if (!source.getNutrition) {
      return {
        success: true,
        data: null,
        message: "Nutrition data not supported by this data source.",
      };
    }
    const nutrition = await source.getNutrition(date);
    return nutrition
      ? { success: true, data: nutrition }
      : { success: true, data: null, message: "No nutrition data available for this date." };
  },
};

export const getMenstrualCycleTool: PHATool<{ date: string }> = {
  name: "get_menstrual_cycle",
  description:
    "获取月经周期数据。返回周期天数、阶段、经期开始日期及周期记录。仅在用户明确询问月经周期、经期或排卵时调用。",
  displayName: "月经周期",
  category: "health" as const,
  icon: "calendar",
  sessionBound: true,
  label: "Get Menstrual Cycle",
  inputSchema: {
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
    if (!source.getMenstrualCycle) {
      return {
        success: true,
        data: null,
        message: "Menstrual cycle data not supported by this data source.",
      };
    }
    const mc = await source.getMenstrualCycle(date);
    return mc
      ? { success: true, data: mc }
      : { success: true, data: null, message: "No menstrual cycle data available." };
  },
};

export const getVO2MaxTool: PHATool<{ date: string }> = {
  name: "get_vo2max",
  description:
    "获取指定日期的最大摄氧量数据。返回 VO2 Max 值（mL/kg/min）及体能等级。当用户询问心肺适能或 VO2 Max 时调用。",
  displayName: "最大摄氧量",
  category: "health" as const,
  icon: "activity",
  sessionBound: true,
  label: "Get VO2 Max",
  inputSchema: {
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
    if (!source.getVO2Max) {
      return {
        success: true,
        data: null,
        message: "VO2 Max data not supported by this data source.",
      };
    }
    const vo2max = await source.getVO2Max(date);
    return vo2max
      ? { success: true, data: vo2max }
      : { success: true, data: null, message: "No VO2 Max data available for this date." };
  },
};

export const getEmotionTool: PHATool<{ date: string }> = {
  name: "get_emotion",
  description:
    "获取指定日期的情绪数据。返回当前情绪状态、心情评分及全天读数。当用户询问情绪或心理状态时调用。",
  displayName: "情绪数据",
  category: "health" as const,
  icon: "sparkles",
  companionSkill: "stress-management",
  sessionBound: true,
  label: "Get Emotion",
  inputSchema: {
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
    if (!source.getEmotion) {
      return {
        success: true,
        data: null,
        message: "Emotion data not supported by this data source.",
      };
    }
    const emotion = await source.getEmotion(date);
    return emotion
      ? { success: true, data: emotion }
      : { success: true, data: null, message: "No emotion data available for this date." };
  },
};

export const getHRVTool: PHATool<{ date: string }> = {
  name: "get_hrv",
  description:
    "获取指定日期的心率变异性（HRV）数据。返回 RMSSD、平均值、最高值、最低值及每小时读数。当用户询问 HRV 或自主神经系统时调用。",
  displayName: "心率变异性",
  category: "health" as const,
  icon: "heart-pulse",
  companionSkill: "heart-monitor",
  sessionBound: true,
  label: "Get HRV",
  inputSchema: {
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
    if (!source.getHRV) {
      return { success: true, data: null, message: "HRV data not supported by this data source." };
    }
    const hrv = await source.getHRV(date);
    return hrv
      ? { success: true, data: hrv }
      : { success: true, data: null, message: "No HRV data available for this date." };
  },
};

// Export all tools as array
export const healthTools = [
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
];

/**
 * Create health tools bound to a specific data source (for per-session isolation).
 */
export function createHealthTools(source: HealthDataSource) {
  return {
    getHealthData: {
      ...getHealthDataTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        const metrics = await source.getMetrics(date);
        return { success: true, data: metrics };
      },
    },
    getHeartRate: {
      ...getHeartRateTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        const heartRate = await source.getHeartRate(date);
        return { success: true, data: heartRate };
      },
    },
    getSleep: {
      ...getSleepTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        const sleep = await source.getSleep(date);
        if (!sleep) {
          return { success: true, data: null, message: "No sleep data available for this date." };
        }
        return { success: true, data: sleep };
      },
    },
    getWorkouts: {
      ...getWorkoutsTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        const workouts = await source.getWorkouts(date);
        return { success: true, data: workouts, count: workouts.length };
      },
    },
    getWeeklySummary: {
      ...getWeeklySummaryTool,
      execute: async () => {
        const today = new Date().toISOString().split("T")[0];
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
            steps: { total: totalSteps, average: avgSteps, daily: weeklySteps },
            sleep: { averageHours: avgSleep, daily: weeklySleep },
          },
        };
      },
    },
    getStress: {
      ...getStressTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getStress) {
          return { success: true, data: null, message: "Stress data not supported." };
        }
        const stress = await source.getStress(date);
        return stress
          ? { success: true, data: stress }
          : { success: true, data: null, message: "No stress data available." };
      },
    },
    getSpO2: {
      ...getSpO2Tool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getSpO2) {
          return { success: true, data: null, message: "SpO2 data not supported." };
        }
        const spo2 = await source.getSpO2(date);
        return spo2
          ? { success: true, data: spo2 }
          : { success: true, data: null, message: "No SpO2 data available." };
      },
    },
    getHealthTrends: {
      ...getHealthTrendsTool,
      execute: getHealthTrendsTool.execute, // Uses getDataSource() internally, but we override here
    },
    getBloodPressure: {
      ...getBloodPressureTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getBloodPressure) {
          return { success: true, data: null, message: "Blood pressure not supported." };
        }
        const bp = await source.getBloodPressure(date);
        return bp
          ? { success: true, data: bp }
          : { success: true, data: null, message: "No blood pressure data available." };
      },
    },
    getBloodGlucose: {
      ...getBloodGlucoseTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getBloodGlucose) {
          return { success: true, data: null, message: "Blood glucose not supported." };
        }
        const bg = await source.getBloodGlucose(date);
        return bg
          ? { success: true, data: bg }
          : { success: true, data: null, message: "No blood glucose data available." };
      },
    },
    getBodyComposition: {
      ...getBodyCompositionTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getBodyComposition) {
          return { success: true, data: null, message: "Body composition not supported." };
        }
        const bc = await source.getBodyComposition(date);
        return bc
          ? { success: true, data: bc }
          : { success: true, data: null, message: "No body composition data available." };
      },
    },
    getBodyTemperature: {
      ...getBodyTemperatureTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getBodyTemperature) {
          return { success: true, data: null, message: "Body temperature not supported." };
        }
        const temp = await source.getBodyTemperature(date);
        return temp
          ? { success: true, data: temp }
          : { success: true, data: null, message: "No body temperature data available." };
      },
    },
    getNutrition: {
      ...getNutritionTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getNutrition) {
          return { success: true, data: null, message: "Nutrition data not supported." };
        }
        const nutrition = await source.getNutrition(date);
        return nutrition
          ? { success: true, data: nutrition }
          : { success: true, data: null, message: "No nutrition data available." };
      },
    },
    getMenstrualCycle: {
      ...getMenstrualCycleTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getMenstrualCycle) {
          return { success: true, data: null, message: "Menstrual cycle data not supported." };
        }
        const mc = await source.getMenstrualCycle(date);
        return mc
          ? { success: true, data: mc }
          : { success: true, data: null, message: "No menstrual cycle data available." };
      },
    },
    getVO2Max: {
      ...getVO2MaxTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getVO2Max) {
          return { success: true, data: null, message: "VO2 Max data not supported." };
        }
        const vo2max = await source.getVO2Max(date);
        return vo2max
          ? { success: true, data: vo2max }
          : { success: true, data: null, message: "No VO2 Max data available." };
      },
    },
    getEmotion: {
      ...getEmotionTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getEmotion) {
          return { success: true, data: null, message: "Emotion data not supported." };
        }
        const emotion = await source.getEmotion(date);
        return emotion
          ? { success: true, data: emotion }
          : { success: true, data: null, message: "No emotion data available." };
      },
    },
    getHRV: {
      ...getHRVTool,
      execute: async (args: { date: string }) => {
        const date = args.date === "today" ? new Date().toISOString().split("T")[0] : args.date;
        if (!source.getHRV) {
          return { success: true, data: null, message: "HRV data not supported." };
        }
        const hrv = await source.getHRV(date);
        return hrv
          ? { success: true, data: hrv }
          : { success: true, data: null, message: "No HRV data available." };
      },
    },
  };
}
