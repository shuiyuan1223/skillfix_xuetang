/**
 * Benchmark Data Source
 *
 * Implements HealthDataSource using test user fixture data.
 * Converts relative day offsets (day_0, day_-1, ...) to real dates at construction time.
 */

import type {
  HealthDataSource,
  HealthMetrics,
  HeartRateData,
  SleepData,
  WorkoutData,
} from "../data-sources/interface.js";

export interface FixtureHealthData {
  metrics?: Record<
    string,
    { steps: number; calories: number; activeMinutes: number; distance?: number } | null
  >;
  heartRate?: Record<
    string,
    {
      restingAvg: number;
      maxToday: number;
      minToday: number;
      readings?: Array<{ time: string; value: number }>;
    } | null
  >;
  sleep?: Record<
    string,
    {
      durationHours: number;
      qualityScore: number;
      bedTime: string;
      wakeTime: string;
      stages: { deep: number; light: number; rem: number; awake: number };
    } | null
  >;
  workouts?: Record<
    string,
    Array<{
      type: string;
      durationMinutes: number;
      caloriesBurned: number;
      distanceKm?: number;
      avgHeartRate?: number;
      maxHeartRate?: number;
    }> | null
  >;
}

/**
 * Convert relative day keys (day_0, day_-1, etc.) to a date-keyed map.
 * day_0 = today, day_-1 = yesterday, etc.
 */
function resolveRelativeDates<T>(
  data: Record<string, T> | undefined,
  baseDate?: Date
): Map<string, T> {
  const map = new Map<string, T>();
  if (!data) return map;

  const today = baseDate || new Date();
  for (const [key, value] of Object.entries(data)) {
    const match = key.match(/^day_(-?\d+)$/);
    if (match) {
      const offset = parseInt(match[1], 10);
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      const dateStr = d.toISOString().split("T")[0];
      map.set(dateStr, value);
    }
  }
  return map;
}

/**
 * Deep merge healthOverrides into base fixture data.
 */
export function mergeFixtureOverrides(
  base: FixtureHealthData,
  overrides?: Record<string, unknown>
): FixtureHealthData {
  if (!overrides) return base;

  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (key in merged && typeof value === "object" && value !== null && !Array.isArray(value)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseVal = (merged as any)[key] || {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = { ...baseVal, ...(value as Record<string, unknown>) };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = value;
    }
  }
  return merged;
}

export class BenchmarkDataSource implements HealthDataSource {
  readonly name = "benchmark";

  private metricsMap: Map<
    string,
    { steps: number; calories: number; activeMinutes: number; distance?: number } | null
  >;
  private heartRateMap: Map<
    string,
    {
      restingAvg: number;
      maxToday: number;
      minToday: number;
      readings?: Array<{ time: string; value: number }>;
    } | null
  >;
  private sleepMap: Map<
    string,
    {
      durationHours: number;
      qualityScore: number;
      bedTime: string;
      wakeTime: string;
      stages: { deep: number; light: number; rem: number; awake: number };
    } | null
  >;
  private workoutsMap: Map<
    string,
    Array<{
      type: string;
      durationMinutes: number;
      caloriesBurned: number;
      distanceKm?: number;
      avgHeartRate?: number;
      maxHeartRate?: number;
    }> | null
  >;

  constructor(fixtureData: FixtureHealthData, baseDate?: Date) {
    this.metricsMap = resolveRelativeDates(fixtureData.metrics, baseDate);
    this.heartRateMap = resolveRelativeDates(fixtureData.heartRate, baseDate);
    this.sleepMap = resolveRelativeDates(fixtureData.sleep, baseDate);
    this.workoutsMap = resolveRelativeDates(fixtureData.workouts, baseDate);
  }

  async getMetrics(date: string): Promise<HealthMetrics> {
    const data = this.metricsMap.get(date);
    if (!data) {
      return { date, steps: 0, calories: 0, activeMinutes: 0, distance: 0 };
    }
    return {
      date,
      steps: data.steps,
      calories: data.calories,
      activeMinutes: data.activeMinutes,
      distance: data.distance ?? Math.floor(data.steps * 0.75),
    };
  }

  async getHeartRate(date: string): Promise<HeartRateData> {
    const data = this.heartRateMap.get(date);
    if (!data) {
      return { date, restingAvg: 0, maxToday: 0, minToday: 0, readings: [] };
    }
    return {
      date,
      restingAvg: data.restingAvg,
      maxToday: data.maxToday,
      minToday: data.minToday,
      readings: data.readings ?? [],
    };
  }

  async getSleep(date: string): Promise<SleepData | null> {
    const data = this.sleepMap.get(date);
    if (data === undefined || data === null) return null;
    return { date, ...data };
  }

  async getWorkouts(date: string): Promise<WorkoutData[]> {
    const data = this.workoutsMap.get(date);
    if (!data || data.length === 0) return [];
    return data.map((w, i) => ({
      id: `benchmark-${date}-${i}`,
      date,
      type: w.type,
      durationMinutes: w.durationMinutes,
      caloriesBurned: w.caloriesBurned,
      distanceKm: w.distanceKm,
      avgHeartRate: w.avgHeartRate,
    }));
  }

  async getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>> {
    const result: Array<{ date: string; steps: number }> = [];
    const end = new Date(endDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const metrics = await this.getMetrics(dateStr);
      result.push({ date: dateStr, steps: metrics.steps });
    }
    return result;
  }

  async getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>> {
    const result: Array<{ date: string; hours: number }> = [];
    const end = new Date(endDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const sleep = await this.getSleep(dateStr);
      result.push({ date: dateStr, hours: sleep?.durationHours ?? 0 });
    }
    return result;
  }

  async getMetricsRange(
    startDate: string,
    endDate: string
  ): Promise<
    Array<{
      date: string;
      steps: number;
      calories: number;
      distance: number;
      activeMinutes: number;
    }>
  > {
    const result: Array<{
      date: string;
      steps: number;
      calories: number;
      distance: number;
      activeMinutes: number;
    }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const m = await this.getMetrics(dateStr);
      result.push({
        date: dateStr,
        steps: m.steps,
        calories: m.calories,
        distance: m.distance,
        activeMinutes: m.activeMinutes,
      });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getSleepRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; hours: number; qualityScore?: number }>> {
    const result: Array<{ date: string; hours: number; qualityScore?: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const s = await this.getSleep(dateStr);
      result.push({ date: dateStr, hours: s?.durationHours ?? 0, qualityScore: s?.qualityScore });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getHeartRateRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    const result: Array<{ date: string; avg: number; max: number; min: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const hr = await this.getHeartRate(dateStr);
      result.push({ date: dateStr, avg: hr.restingAvg, max: hr.maxToday, min: hr.minToday });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getWorkoutsRange(startDate: string, endDate: string): Promise<WorkoutData[]> {
    const result: WorkoutData[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const workouts = await this.getWorkouts(dateStr);
      result.push(...workouts);
      current.setDate(current.getDate() + 1);
    }
    return result;
  }
}
