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

export const getStressTool = {
  name: "get_stress",
  description:
    "Retrieve stress data for a given date. Returns current stress level (1-99), average, max, min, and readings throughout the day. Call this when the user asks about stress or mental load.",
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

export const getSpO2Tool = {
  name: "get_spo2",
  description:
    "Retrieve blood oxygen (SpO2) data for a given date. Returns current SpO2 percentage, average, max, min, and readings. Call this when the user asks about blood oxygen or oxygen saturation.",
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

export const getHealthTrendsTool = {
  name: "get_health_trends",
  description:
    "Retrieve long-term health trends for weeks, months, or years. Returns aggregated daily data for steps, sleep, and heart rate over the requested period. Use this for trend analysis, progress tracking, and pattern recognition over extended periods. Supports up to 2 years of history.",
  parameters: {
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

export const getBloodPressureTool = {
  name: "get_blood_pressure",
  description:
    "Retrieve blood pressure data for a given date. Returns systolic/diastolic readings, averages, and individual measurements. Call this when the user asks about blood pressure or hypertension.",
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

export const getBloodGlucoseTool = {
  name: "get_blood_glucose",
  description:
    "Retrieve blood glucose data for a given date. Returns glucose readings in mmol/L with average, max, min. Call this when the user asks about blood sugar or diabetes.",
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

export const getBodyCompositionTool = {
  name: "get_body_composition",
  description:
    "Retrieve body composition data including weight, height, BMI, and body fat rate. Uses 30-day lookback to find the latest measurements. Call this when the user asks about weight, BMI, or body fat.",
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

export const getBodyTemperatureTool = {
  name: "get_body_temperature",
  description:
    "Retrieve body temperature data for a given date. Returns temperature readings in Celsius with average, max, min. Call this when the user asks about body temperature or fever.",
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

export const getNutritionTool = {
  name: "get_nutrition",
  description:
    "Retrieve nutrition and diet data for a given date. Returns total calories, macronutrients (protein, fat, carbs), water intake, and individual meals. Call this when the user asks about nutrition, diet, or calorie intake.",
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

export const getMenstrualCycleTool = {
  name: "get_menstrual_cycle",
  description:
    "Retrieve menstrual cycle data. Returns cycle day, phase, period start date, and cycle records. Only call this when the user explicitly asks about menstrual cycle, period, or ovulation.",
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

export const getVO2MaxTool = {
  name: "get_vo2max",
  description:
    "Retrieve VO2 Max data for a given date. Returns VO2 Max value in mL/kg/min and fitness level. Call this when the user asks about cardiorespiratory fitness or VO2 Max.",
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

export const getEmotionTool = {
  name: "get_emotion",
  description:
    "Retrieve emotion/mood data for a given date. Returns current emotion, mood score, and readings throughout the day. Call this when the user asks about mood or emotional state.",
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

export const getHRVTool = {
  name: "get_hrv",
  description:
    "Retrieve HRV (Heart Rate Variability) data for a given date. Returns RMSSD, average, max, min, and hourly readings. Call this when the user asks about HRV or autonomic nervous system.",
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
