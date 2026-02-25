/**
 * Huawei Health Data Source
 *
 * Implements HealthDataSource interface using Huawei Health Kit API.
 * Returns real data when available, null/empty when not (no mock fallback).
 */

import type {
  HealthDataSource,
  HealthMetrics,
  HeartRateData,
  SleepData,
  WorkoutData,
  StressData,
  SpO2Data,
  ECGData,
  BloodPressureData,
  BloodGlucoseData,
  BodyCompositionData,
  BodyTemperatureData,
  NutritionData,
  MenstrualCycleData,
  VO2MaxData,
  EmotionData,
  HRVData,
} from "../interface.js";
import type { HuaweiHealthApi } from "./huawei-api.js";
import { huaweiHealthApi, createHuaweiHealthApiForUser } from "./huawei-api.js";
import type { HuaweiAuth } from "./huawei-auth.js";
import { huaweiAuth } from "./huawei-auth.js";
import { mapActivityType } from "./huawei-types.js";
import { getUserStore } from "./user-store.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("Huawei/DataSource");

/** Get date string in local timezone (YYYY-MM-DD) */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class HuaweiHealthDataSource implements HealthDataSource {
  readonly name = "huawei";

  private api: HuaweiHealthApi;
  private auth: HuaweiAuth;
  private userUuid: string | null = null;

  /**
   * Create a HuaweiHealthDataSource
   * @param userUuid - Optional user UUID for multi-user mode. If provided, uses SQLite token storage.
   * @param api - Optional custom API instance
   * @param auth - Optional custom auth instance
   */
  constructor(userUuid?: string, api?: HuaweiHealthApi, auth: HuaweiAuth = huaweiAuth) {
    this.userUuid = userUuid || null;
    this.auth = auth;

    // If userUuid is provided, create a user-specific API instance
    if (userUuid) {
      this.api = api || createHuaweiHealthApiForUser(userUuid);
    } else {
      this.api = api || huaweiHealthApi;
    }
  }

  /**
   * Ensure valid token for this data source (handles multi-user)
   */
  private async ensureToken(): Promise<void> {
    if (this.userUuid) {
      // Multi-user mode: use SQLite token
      await this.auth.ensureValidTokenForUser(this.userUuid, getUserStore());
    } else {
      // Single-user mode: use file token
      await this.auth.ensureValidToken();
    }
  }

  /**
   * Get health metrics from Huawei API
   * (steps, distance, calories, active minutes)
   */
  async getMetrics(date: string): Promise<HealthMetrics> {
    try {
      await this.ensureToken();
      const data = await this.api.getPolymerizeData(date);
      return {
        date,
        steps: data.steps,
        distance: data.distance,
        calories: data.calories,
        activeMinutes: data.activeMinutes,
      };
    } catch (error) {
      log.warn("Failed to fetch metrics", error);
      // Return zeros instead of mock data
      return { date, steps: 0, distance: 0, calories: 0, activeMinutes: 0 };
    }
  }

  /**
   * Get heart rate data from Huawei API
   */
  async getHeartRate(date: string): Promise<HeartRateData> {
    try {
      await this.ensureToken();
      const result = await this.api.getHeartRateData(date);
      return {
        date,
        restingAvg: result.avg,
        maxToday: result.max,
        minToday: result.min,
        readings: result.readings,
      };
    } catch (error) {
      log.warn("Failed to fetch heart rate", error);
      return { date, restingAvg: 0, maxToday: 0, minToday: 0, readings: [] };
    }
  }

  /**
   * Get sleep data from Huawei API
   */
  async getSleep(date: string): Promise<SleepData | null> {
    try {
      await this.ensureToken();
      const result = await this.api.getSleepData(date);

      if (!result) {
        return null; // No sleep data available
      }

      // Use API-provided stage durations if available, otherwise calculate from segments
      let stages = { deep: 0, light: 0, rem: 0, awake: 0 };

      if (result.deepSleepMinutes !== undefined || result.lightSleepMinutes !== undefined) {
        stages = {
          deep: result.deepSleepMinutes || 0,
          light: result.lightSleepMinutes || 0,
          rem: result.remMinutes || 0,
          awake: result.awakeMinutes || 0,
        };
      } else if (result.segments.length > 0) {
        // Calculate from segments (Huawei sleep_state: 1=awake, 2=light, 3=deep, 4=REM, 5=nap)
        for (const seg of result.segments) {
          const duration = Math.round((seg.endTime - seg.startTime) / (60 * 1000));
          switch (seg.sleepType) {
            case 1:
              stages.awake += duration;
              break;
            case 2:
              stages.light += duration;
              break;
            case 3:
              stages.deep += duration;
              break;
            case 4:
              stages.rem += duration;
              break;
            case 5:
              stages.light += duration;
              break;
          }
        }
      }

      const qualityScore =
        result.sleepScore !== undefined
          ? result.sleepScore
          : (() => {
              const sleepMinutes = stages.deep + stages.light + stages.rem;
              return sleepMinutes > 0
                ? Math.round(((stages.deep + stages.rem) / sleepMinutes) * 100)
                : 0;
            })();

      return {
        date,
        durationHours: Math.round((result.totalMinutes / 60) * 10) / 10,
        qualityScore,
        bedTime: result.bedTime,
        wakeTime: result.wakeTime,
        stages,
      };
    } catch (error) {
      log.warn("Failed to fetch sleep", error);
      return null;
    }
  }

  /**
   * Get workout data from Huawei API
   */
  async getWorkouts(date: string): Promise<WorkoutData[]> {
    try {
      await this.ensureToken();
      const records = await this.api.getActivityRecords(date, date);

      return records.map((record) => ({
        id: record.id,
        date,
        type: mapActivityType(record.activityType),
        durationMinutes: record.duration,
        caloriesBurned: record.calories || 0,
        distanceKm: record.distance ? record.distance / 1000 : undefined,
        avgHeartRate: record.avgHeartRate,
      }));
    } catch (error) {
      log.warn("Failed to fetch workouts", error);
      return [];
    }
  }

  /**
   * Get weekly step data
   */
  async getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>> {
    const result: Array<{ date: string; steps: number }> = [];
    const end = new Date(endDate);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = toLocalDateStr(d);
      const metrics = await this.getMetrics(dateStr);
      result.push({ date: dateStr, steps: metrics.steps });
    }

    return result;
  }

  /**
   * Get weekly sleep data from Huawei API
   */
  async getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>> {
    try {
      await this.ensureToken();
      const data = await this.api.getWeeklySleepData(endDate);
      return data.map((d) => ({ date: d.date, hours: d.hours }));
    } catch (error) {
      log.warn("Failed to fetch weekly sleep", error);
      // Return empty array for each day
      const result: Array<{ date: string; hours: number }> = [];
      const end = new Date(endDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        result.push({ date: toLocalDateStr(d), hours: 0 });
      }
      return result;
    }
  }

  /**
   * Get stress data from Huawei API
   */
  async getStress(date: string): Promise<StressData | null> {
    try {
      await this.ensureToken();
    } catch {
      log.warn("Not authenticated, no stress data available");
      return null;
    }

    try {
      const result = await this.api.getStressData(date);
      if (!result) {
        return null;
      }
      return {
        date,
        current: result.current,
        avg: result.avg,
        max: result.max,
        min: result.min,
        readings: result.readings,
      };
    } catch (error) {
      log.warn("Failed to fetch stress data", error);
      return null;
    }
  }

  /**
   * Get SpO2 (blood oxygen) data from Huawei API
   */
  async getSpO2(date: string): Promise<SpO2Data | null> {
    try {
      await this.ensureToken();
    } catch {
      log.warn("Not authenticated, no SpO2 data available");
      return null;
    }

    try {
      const result = await this.api.getSpO2Data(date);
      if (!result) {
        return null;
      }
      return {
        date,
        current: result.current,
        avg: result.avg,
        max: result.max,
        min: result.min,
        readings: result.readings,
      };
    } catch (error) {
      log.warn("Failed to fetch SpO2 data", error);
      return null;
    }
  }

  /**
   * Get resting heart rate from Huawei API
   */
  async getRestingHeartRate(date: string): Promise<number | null> {
    try {
      await this.ensureToken();
    } catch {
      log.warn("Not authenticated, no resting heart rate available");
      return null;
    }

    try {
      return await this.api.getRestingHeartRateData(date);
    } catch (error) {
      log.warn("Failed to fetch resting heart rate", error);
      return null;
    }
  }

  /**
   * Get ECG (electrocardiogram) data from Huawei API
   */
  async getECG(date: string): Promise<ECGData | null> {
    try {
      await this.ensureToken();
    } catch {
      log.warn("Not authenticated, no ECG data available");
      return null;
    }

    try {
      const result = await this.api.getECGData(date);
      if (!result) {
        return null;
      }
      return {
        date,
        records: result.records.map((r) => ({
          time: r.time,
          avgHeartRate: r.avgHeartRate,
          arrhythmiaType: r.arrhythmiaType,
          arrhythmiaLabel: r.arrhythmiaLabel,
        })),
        latestHeartRate: result.latestHeartRate,
        hasArrhythmia: result.hasArrhythmia,
      };
    } catch (error) {
      log.warn("Failed to fetch ECG data", error);
      return null;
    }
  }

  /**
   * Get blood pressure data from Huawei API.
   * Uses 7-day lookback since BP isn't measured daily.
   */
  async getBloodPressure(date: string): Promise<BloodPressureData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      // Query 7-day range in a single API call (BP is intermittent)
      const result = await this.api.getBloodPressureData(date, 7);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch blood pressure", error);
      return null;
    }
  }

  /**
   * Get blood glucose data from Huawei API
   */
  async getBloodGlucose(date: string): Promise<BloodGlucoseData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getBloodGlucoseData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch blood glucose", error);
      return null;
    }
  }

  /**
   * Get body composition data from Huawei API
   */
  async getBodyComposition(date: string): Promise<BodyCompositionData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getBodyCompositionData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch body composition", error);
      return null;
    }
  }

  /**
   * Get body temperature data from Huawei API
   */
  async getBodyTemperature(date: string): Promise<BodyTemperatureData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getBodyTemperatureData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch body temperature", error);
      return null;
    }
  }

  /**
   * Get nutrition data from Huawei API
   */
  async getNutrition(date: string): Promise<NutritionData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getNutritionData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch nutrition", error);
      return null;
    }
  }

  /**
   * Get menstrual cycle data from Huawei API
   */
  async getMenstrualCycle(date: string): Promise<MenstrualCycleData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getMenstrualCycleData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch menstrual cycle", error);
      return null;
    }
  }

  /**
   * Get VO2Max data from Huawei API
   */
  async getVO2Max(date: string): Promise<VO2MaxData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getVO2MaxData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch VO2Max", error);
      return null;
    }
  }

  /**
   * Get emotion data from Huawei API
   */
  async getEmotion(date: string): Promise<EmotionData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getEmotionData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch emotion", error);
      return null;
    }
  }

  /**
   * Get HRV (heart rate variability) data from Huawei API
   */
  async getHRV(date: string): Promise<HRVData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getHRVData(date);
      if (!result) return null;
      return { date, ...result };
    } catch (error) {
      log.warn("Failed to fetch HRV", error);
      return null;
    }
  }

  /**
   * Get metrics for a date range using groupByTime optimization.
   * Uses polymerize with groupByTime=1day for efficient 2-year data fetching.
   * 730 days → ~9 API calls (in 90-day chunks) instead of 730 individual calls.
   */
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
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      // Fetch steps, calories, distance in parallel using groupByTime
      const [stepsData, caloriesData, distanceData] = await Promise.all([
        this.api.getPolymerizeDataRange("com.huawei.continuous.steps.delta", startDate, endDate),
        this.api.getPolymerizeDataRange("com.huawei.continuous.calories.burnt", startDate, endDate),
        this.api.getPolymerizeDataRange("com.huawei.continuous.distance.delta", startDate, endDate),
      ]);

      // Build lookup maps — sum all field values since fieldName varies by data type
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const sumValues = (vals: Record<string, number>) =>
        Object.values(vals).reduce((a, b) => a + b, 0);
      const stepsMap = new Map(stepsData.map((d) => [d.date, sumValues(d.values)]));
      const caloriesMap = new Map(caloriesData.map((d) => [d.date, sumValues(d.values)]));
      const distanceMap = new Map(distanceData.map((d) => [d.date, sumValues(d.values)]));

      // Build result for all dates in range
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
        const dateStr = toLocalDateStr(current);
        result.push({
          date: dateStr,
          steps: Math.round(stepsMap.get(dateStr) || 0),
          calories: Math.round(caloriesMap.get(dateStr) || 0),
          distance: Math.round(distanceMap.get(dateStr) || 0),
          activeMinutes: 0, // Not available via groupByTime; use dailyActivitySummary for single-day
        });
        current.setDate(current.getDate() + 1);
      }

      return result;
    } catch (error) {
      log.warn("Failed to fetch metrics range with groupByTime", error);
      return [];
    }
  }

  /**
   * Get sleep data for a date range
   */
  async getSleepRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; hours: number; qualityScore?: number }>> {
    try {
      await this.ensureToken();
      // Use the weekly API with extended range
      const data = await this.api.getWeeklySleepData(endDate);

      // If range is within 7 days, return directly
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dayDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (dayDiff <= 7) {
        return data.map((d) => ({ date: d.date, hours: d.hours, qualityScore: d.sleepScore }));
      }

      // For longer ranges, fetch in 7-day chunks
      const result: Array<{ date: string; hours: number; qualityScore?: number }> = [];
      const current = new Date(end);

      while (current >= start) {
        const chunkEnd = toLocalDateStr(current);
        const chunkData = await this.api.getWeeklySleepData(chunkEnd);
        for (const d of chunkData) {
          if (new Date(d.date) >= start && new Date(d.date) <= end) {
            // Avoid duplicates
            if (!result.some((r) => r.date === d.date)) {
              result.push({ date: d.date, hours: d.hours, qualityScore: d.sleepScore });
            }
          }
        }
        current.setDate(current.getDate() - 7);
      }

      return result.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      log.warn("Failed to fetch sleep range", error);
      return [];
    }
  }

  /**
   * Get heart rate data for a date range using groupByTime optimization
   */
  async getHeartRateRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange(
        "com.huawei.instantaneous.heart_rate",
        startDate,
        endDate
      );

      // With groupByTime, each entry has daily aggregated HR values
      return data.map((d) => ({
        date: d.date,
        avg: Math.round(d.values.value || d.values.avg || 0),
        max: Math.round(d.values.max || d.values.value || 0),
        min: Math.round(d.values.min || d.values.value || 0),
      }));
    } catch (error) {
      log.warn("Failed to fetch heart rate range with groupByTime", error);
      return [];
    }
  }

  /**
   * Get stress data for a date range using groupByTime
   */
  async getStressRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange(
        "com.huawei.instantaneous.stress",
        startDate,
        endDate
      );

      return data.map((d) => ({
        date: d.date,
        avg: Math.round(d.values.value || d.values.avg || 0),
        max: Math.round(d.values.max || d.values.value || 0),
        min: Math.round(d.values.min || d.values.value || 0),
      }));
    } catch (error) {
      log.warn("Failed to fetch stress range", error);
      return [];
    }
  }

  /**
   * Get SpO2 data for a date range using groupByTime
   */
  async getSpO2Range(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange(
        "com.huawei.instantaneous.spo2",
        startDate,
        endDate
      );

      return data.map((d) => ({
        date: d.date,
        avg: Math.round(d.values.value || d.values.avg || 0),
        max: Math.round(d.values.max || Math.min(100, (d.values.value || 0) + 1)),
        min: Math.round(d.values.min || Math.max(0, (d.values.value || 0) - 2)),
      }));
    } catch (error) {
      log.warn("Failed to fetch SpO2 range", error);
      return [];
    }
  }

  /**
   * Get blood pressure data for a date range using groupByTime
   */
  async getBloodPressureRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avgSystolic: number; avgDiastolic: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange(
        "com.huawei.instantaneous.blood_pressure",
        startDate,
        endDate
      );

      return data
        .map((d) => ({
          date: d.date,
          avgSystolic: Math.round(d.values.systolic_pressure || d.values.value || 0),
          avgDiastolic: Math.round(d.values.diastolic_pressure || 0),
        }))
        .filter((d) => d.avgSystolic > 0);
    } catch (error) {
      log.warn("Failed to fetch blood pressure range", error);
      return [];
    }
  }

  /**
   * Get body composition data for a date range using groupByTime
   */
  async getBodyCompositionRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; weight?: number; bmi?: number; bodyFatRate?: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange(
        "com.huawei.instantaneous.body_weight",
        startDate,
        endDate
      );

      return data
        .map((d) => ({
          date: d.date,
          weight: d.values.body_weight
            ? Math.round(d.values.body_weight * 10) / 10
            : d.values.value
              ? Math.round(d.values.value * 10) / 10
              : undefined,
          bmi: d.values.bmi ? Math.round(d.values.bmi * 10) / 10 : undefined,
          bodyFatRate: d.values.body_fat_rate
            ? Math.round(d.values.body_fat_rate * 10) / 10
            : undefined,
        }))
        .filter((d) => d.weight != null);
    } catch (error) {
      log.warn("Failed to fetch body composition range", error);
      return [];
    }
  }

  /**
   * Get workouts for a date range
   */
  async getWorkoutsRange(startDate: string, endDate: string): Promise<WorkoutData[]> {
    try {
      await this.ensureToken();
      const records = await this.api.getActivityRecords(startDate, endDate);
      return records.map((record) => ({
        id: record.id,
        date: toLocalDateStr(record.startTime),
        type: mapActivityType(record.activityType),
        durationMinutes: record.duration,
        caloriesBurned: record.calories || 0,
        distanceKm: record.distance ? record.distance / 1000 : undefined,
        avgHeartRate: record.avgHeartRate,
      }));
    } catch (error) {
      log.warn("Failed to fetch workouts range", error);
      return [];
    }
  }

  /**
   * Check if the data source is properly configured and authenticated
   */
  isReady(): boolean {
    if (this.userUuid) {
      // Multi-user mode: check SQLite
      return this.auth.isUserAuthenticated(this.userUuid, getUserStore());
    }
    // Single-user mode: check file
    return this.auth.isAuthenticated();
  }
}

// Default instance
export const huaweiDataSource = new HuaweiHealthDataSource();
