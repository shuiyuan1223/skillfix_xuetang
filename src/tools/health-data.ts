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

/** Args type for tools that support both single-day and date range queries */
type DateOrRangeArgs = { date?: string; startDate?: string; endDate?: string };

/** Resolve "today" / undefined to actual YYYY-MM-DD string */
function resolveDate(date?: string): string {
  return !date || date === "today" ? new Date().toISOString().split("T")[0] : date;
}

/** Shared inputSchema properties for date + range */
const dateRangeProperties = {
  date: {
    type: "string",
    description:
      "Single date (YYYY-MM-DD). Use 'today' for today. Ignored when startDate+endDate provided.",
  },
  startDate: {
    type: "string",
    description:
      "Range start (YYYY-MM-DD). Use with endDate for multi-day queries like '最近一周/一个月'.",
  },
  endDate: {
    type: "string",
    description: "Range end (YYYY-MM-DD). Use with startDate.",
  },
};

// Tool definitions for pi-agent

export const getHealthDataTool: PHATool<DateOrRangeArgs> = {
  name: "get_health_data",
  description:
    "获取健康指标数据。返回步数、卡路里、活动时长、距离。支持 startDate+endDate 范围查询，返回每日指标数组。当用户询问步数趋势、最近N天活动量时使用范围模式。",
  displayName: "健康数据",
  category: "health" as const,
  icon: "activity",
  sessionBound: true,
  label: "Get Health Data",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getMetricsRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getMetricsRange(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
    const metrics = await source.getMetrics(date);
    return { success: true, data: metrics };
  },
};

export const getHeartRateTool: PHATool<DateOrRangeArgs> = {
  name: "get_heart_rate",
  description:
    "获取心率数据。单日返回静息平均值、最高值、最低值及每小时读数。支持 startDate+endDate 范围查询，返回每日心率摘要数组。当用户询问心率变化、最近N天心率时使用范围模式。",
  displayName: "心率数据",
  category: "health" as const,
  icon: "heart-pulse",
  companionSkill: "heart-monitor",
  sessionBound: true,
  label: "Get Heart Rate",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getHeartRateRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getHeartRateRange(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
    const heartRate = await source.getHeartRate(date);
    return { success: true, data: heartRate };
  },
};

export const getSleepTool: PHATool<DateOrRangeArgs> = {
  name: "get_sleep",
  description:
    "获取睡眠数据。单日返回睡眠时长、质量评分、入睡时间、起床时间及各阶段。支持 startDate+endDate 范围查询，返回每日睡眠时长和质量评分数组。当用户询问睡眠趋势、最近N天睡眠时使用范围模式。",
  displayName: "睡眠数据",
  category: "health" as const,
  icon: "moon",
  companionSkill: "sleep-coach",
  sessionBound: true,
  label: "Get Sleep",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getSleepRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getSleepRange(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
    const sleep = await source.getSleep(date);
    if (!sleep) {
      return { success: true, data: null, message: "No sleep data available for this date." };
    }
    return { success: true, data: sleep };
  },
};

export const getWorkoutsTool: PHATool<DateOrRangeArgs> = {
  name: "get_workouts",
  description:
    "获取运动记录。单日返回运动类型、时长、消耗卡路里、距离、平均心率。支持 startDate+endDate 范围查询，返回时间段内所有运动记录。当用户询问运动趋势、最近N天锻炼时使用范围模式。",
  displayName: "运动数据",
  category: "health" as const,
  icon: "activity",
  companionSkill: "workout-tracker",
  sessionBound: true,
  label: "Get Workouts",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getWorkoutsRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getWorkoutsRange(args.startDate, args.endDate);
      return { success: true, data, count: data.length, mode: "range" };
    }
    const date = resolveDate(args.date);
    const workouts = await source.getWorkouts(date);
    return { success: true, data: workouts, count: workouts.length };
  },
};

export const getWeeklySummaryTool: PHATool<{}> = {
  name: "get_weekly_summary",
  description: "获取 7 天步数和睡眠汇总。返回步数和睡眠两个维度的每日数据及平均值。",
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

export const getStressTool: PHATool<DateOrRangeArgs> = {
  name: "get_stress",
  description:
    "获取压力数据。单日返回压力值（1-99）、平均值、最高值、最低值及全天读数。支持 startDate+endDate 范围查询，返回每日压力摘要数组。当用户询问压力变化、最近N天压力时使用范围模式。",
  displayName: "压力数据",
  category: "health" as const,
  icon: "brain",
  companionSkill: "stress-management",
  sessionBound: true,
  label: "Get Stress",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getStressRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getStressRange(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
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

export const getSpO2Tool: PHATool<DateOrRangeArgs> = {
  name: "get_spo2",
  description:
    "获取血氧数据。单日返回血氧百分比、平均值、最高值、最低值及读数。支持 startDate+endDate 范围查询，返回每日血氧摘要数组。当用户询问血氧变化、最近N天血氧时使用范围模式。",
  displayName: "血氧数据",
  category: "health" as const,
  icon: "wind",
  companionSkill: "blood-oxygen",
  sessionBound: true,
  label: "Get SpO2",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getSpO2Range) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getSpO2Range(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
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

export const getBloodPressureTool: PHATool<DateOrRangeArgs> = {
  name: "get_blood_pressure",
  description:
    "获取血压数据。单日返回收缩压/舒张压读数、平均值及各次测量记录。支持 startDate+endDate 范围查询，返回每日血压摘要数组。当用户询问血压变化、最近N天血压时使用范围模式。",
  displayName: "血压数据",
  category: "health" as const,
  icon: "heart",
  companionSkill: "blood-pressure",
  sessionBound: true,
  label: "Get Blood Pressure",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getBloodPressureRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getBloodPressureRange(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
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

export const getBodyCompositionTool: PHATool<DateOrRangeArgs> = {
  name: "get_body_composition",
  description:
    "获取体成分数据，包括体重、身高、BMI 和体脂率。支持 startDate+endDate 范围查询，返回每日体重/BMI/体脂数组。当用户询问体重变化、最近N天体重趋势时使用范围模式。",
  displayName: "体成分数据",
  category: "health" as const,
  icon: "user",
  companionSkill: "weight-management",
  sessionBound: true,
  label: "Get Body Composition",
  inputSchema: {
    type: "object" as const,
    properties: dateRangeProperties,
  },
  execute: async (args: DateOrRangeArgs) => {
    const source = getDataSource();
    if (args.startDate && args.endDate) {
      if (!source.getBodyCompositionRange) {
        return { success: false, message: "Date range query not supported by this data source." };
      }
      const data = await source.getBodyCompositionRange(args.startDate, args.endDate);
      return { success: true, data, mode: "range" };
    }
    const date = resolveDate(args.date);
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
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createHealthTools(source: HealthDataSource) {
  return {
    getHealthData: {
      ...getHealthDataTool,
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getMetricsRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getMetricsRange(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
        const metrics = await source.getMetrics(date);
        return { success: true, data: metrics };
      },
    },
    getHeartRate: {
      ...getHeartRateTool,
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getHeartRateRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getHeartRateRange(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
        const heartRate = await source.getHeartRate(date);
        return { success: true, data: heartRate };
      },
    },
    getSleep: {
      ...getSleepTool,
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getSleepRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getSleepRange(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
        const sleep = await source.getSleep(date);
        if (!sleep) {
          return { success: true, data: null, message: "No sleep data available for this date." };
        }
        return { success: true, data: sleep };
      },
    },
    getWorkouts: {
      ...getWorkoutsTool,
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getWorkoutsRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getWorkoutsRange(args.startDate, args.endDate);
          return { success: true, data, count: data.length, mode: "range" };
        }
        const date = resolveDate(args.date);
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
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getStressRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getStressRange(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
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
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getSpO2Range) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getSpO2Range(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
        if (!source.getSpO2) {
          return { success: true, data: null, message: "SpO2 data not supported." };
        }
        const spo2 = await source.getSpO2(date);
        return spo2
          ? { success: true, data: spo2 }
          : { success: true, data: null, message: "No SpO2 data available." };
      },
    },
    getBloodPressure: {
      ...getBloodPressureTool,
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getBloodPressureRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getBloodPressureRange(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
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
      execute: async (args: DateOrRangeArgs) => {
        if (args.startDate && args.endDate) {
          if (!source.getBodyCompositionRange) {
            return {
              success: false,
              message: "Date range query not supported by this data source.",
            };
          }
          const data = await source.getBodyCompositionRange(args.startDate, args.endDate);
          return { success: true, data, mode: "range" };
        }
        const date = resolveDate(args.date);
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
